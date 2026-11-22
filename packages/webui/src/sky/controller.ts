/**
 * Contrôleur du ciel — un seul chef d'orchestre pour deux chemins de rendu.
 *
 *  1. **Worker** : handshake sans transfert (`probe`), puis `transferControlToOffscreen`
 *     et boucle dans le worker. Le thread principal ne fait qu'expédier les
 *     changements de taille, de niveau et de visibilité.
 *  2. **Repli** : le même `SkyEngine`, la même boucle, sur le thread principal.
 *
 * Les deux chemins partagent le moteur et le delta borné : le repli est donc
 * visuellement identique, et l'arrêt sur onglet masqué est total dans les deux.
 *
 * Framework-agnostique : les dépendances navigateur sont injectables, ce qui
 * rend l'arrêt et le changement de niveau testables hors DOM réel.
 */

import { SkyEngine, boundDelta } from "./engine"
import { DEFAULT_SEED, SKY_BG, type SkyMode } from "./types"

export type SkyDeps = {
  raf: (callback: FrameRequestCallback) => number
  caf: (handle: number) => void
  now: () => number
  dpr: () => number
  createWorker: (url: URL) => Worker
  transfer: (canvas: HTMLCanvasElement) => OffscreenCanvas
  workerUrl: URL
  /** Délai avant repli si le worker ne répond pas au handshake. */
  probeTimeoutMs: number
}

/** Les dépendances réelles, prises sur les globals du navigateur. */
export function browserSkyDeps(): SkyDeps {
  return {
    raf: (callback) => requestAnimationFrame(callback),
    caf: (handle) => cancelAnimationFrame(handle),
    now: () => performance.now(),
    dpr: () => Math.min(Math.max(window.devicePixelRatio || 1, 1), 2),
    createWorker: (url) => new Worker(url, { type: "module" }),
    transfer: (canvas) => canvas.transferControlToOffscreen(),
    workerUrl: new URL("./worker.ts", import.meta.url),
    probeTimeoutMs: 1500,
  }
}

export class SkyController {
  private mode: SkyMode
  private hidden = false
  private destroyed = false
  private backend: "worker" | "main" = "main"
  private worker: Worker | undefined
  private workerReady = false
  private probeTimer: ReturnType<typeof setTimeout> | undefined
  private rafId: number | undefined
  private last = 0
  private elapsed = 0
  private engine: SkyEngine | undefined
  private ctx: CanvasRenderingContext2D | null = null
  private width = 0
  private height = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    mode: SkyMode,
    private readonly deps: SkyDeps,
    private readonly seed: number = DEFAULT_SEED,
  ) {
    this.mode = mode
  }

  /** Lance le rendu. Appelé une seule fois au montage du composant. */
  start(width: number, height: number): void {
    this.width = Math.max(0, width)
    this.height = Math.max(0, height)
    if (this.mode === "off") return
    this.tryWorker()
  }

  /** Change de niveau : `on` (animé), `static` (une image), `off` (rien). */
  setMode(mode: SkyMode): void {
    if (this.destroyed || mode === this.mode) return
    this.mode = mode
    if (this.backend === "worker" && this.workerReady) {
      this.worker?.postMessage({ type: "mode", mode })
      return
    }
    this.applyMainMode()
  }

  /** Arrêt complet quand l'onglet est masqué, reprise sans saut au retour. */
  setHidden(hidden: boolean): void {
    if (this.destroyed || hidden === this.hidden) return
    this.hidden = hidden
    if (this.backend === "worker" && this.workerReady) {
      this.worker?.postMessage({ type: "visibility", hidden })
      return
    }
    if (hidden) this.stopLoop()
    else if (this.mode === "on") this.startLoop()
  }

  /** Recalcule la surface (et donc le nombre d'étoiles) sans fuite. */
  resize(width: number, height: number): void {
    if (this.destroyed) return
    this.width = Math.max(0, width)
    this.height = Math.max(0, height)
    if (this.backend === "worker" && this.workerReady) {
      this.worker?.postMessage({ type: "resize", width: this.width, height: this.height, dpr: this.deps.dpr() })
      return
    }
    this.prepareMainCanvas()
    if (this.mode === "static") this.drawStill()
  }

  /** Libère timers, worker et boucle : aucun rendu ne survit au composant. */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.stopLoop()
    if (this.probeTimer !== undefined) clearTimeout(this.probeTimer)
    this.probeTimer = undefined
    if (this.backend === "worker") {
      this.worker?.postMessage({ type: "stop" })
      this.worker?.terminate()
      this.worker = undefined
    }
    this.engine = undefined
    this.ctx = null
  }

  /** Pour les tests : quel chemin de rendu a été retenu. */
  get backendKind(): "worker" | "main" {
    return this.backend
  }

  private tryWorker(): void {
    // On teste la capacité de transfert du canvas ; la fabrique de worker est
    // injectée, donc testable, et lève si l'environnement n'a pas de Worker.
    const canTransfer = typeof this.canvas.transferControlToOffscreen === "function"
    if (!canTransfer) {
      this.startMain()
      return
    }
    let worker: Worker
    try {
      worker = this.deps.createWorker(this.deps.workerUrl)
    } catch {
      this.startMain()
      return
    }
    this.backend = "worker"
    this.worker = worker
    this.probeTimer = setTimeout(() => {
      // Pas de réponse : le canvas n'a PAS été transféré, le repli est possible.
      this.fallbackToMain()
    }, this.deps.probeTimeoutMs)

    worker.onmessage = (event: MessageEvent<{ type: string }>) => {
      if (this.destroyed) return
      if (event.data?.type === "probe-ok") this.initWorker(worker)
      else if (event.data?.type === "ready") this.workerReady = true
      else if (event.data?.type === "error") this.fallbackToMain()
    }
    worker.onerror = () => this.fallbackToMain()
    try {
      worker.postMessage({ type: "probe" })
    } catch {
      this.fallbackToMain()
    }
  }

  private initWorker(worker: Worker): void {
    if (this.probeTimer !== undefined) clearTimeout(this.probeTimer)
    this.probeTimer = undefined
    if (this.backend !== "worker" || this.destroyed) return
    try {
      const offscreen = this.deps.transfer(this.canvas)
      worker.postMessage(
        {
          type: "init",
          canvas: offscreen,
          width: this.width,
          height: this.height,
          dpr: this.deps.dpr(),
          mode: this.mode,
          seed: this.seed,
        },
        [offscreen],
      )
      worker.postMessage({ type: "visibility", hidden: this.hidden })
      this.workerReady = true
    } catch {
      this.fallbackToMain()
    }
  }

  /** Repli : le canvas est encore intact ici, car le transfert n'a pas eu lieu. */
  private fallbackToMain(): void {
    if (this.destroyed || this.backend === "main") return
    if (this.probeTimer !== undefined) clearTimeout(this.probeTimer)
    this.probeTimer = undefined
    this.worker?.terminate()
    this.worker = undefined
    this.workerReady = false
    this.backend = "main"
    this.startMain()
  }

  private startMain(): void {
    if (this.destroyed || this.mode === "off") return
    this.prepareMainCanvas()
    this.applyMainMode()
  }

  private prepareMainCanvas(): void {
    if (this.width <= 0 || this.height <= 0) return
    const dpr = this.deps.dpr()
    const backingWidth = Math.max(1, Math.round(this.width * dpr))
    const backingHeight = Math.max(1, Math.round(this.height * dpr))
    if (this.canvas.width !== backingWidth) this.canvas.width = backingWidth
    if (this.canvas.height !== backingHeight) this.canvas.height = backingHeight
    if (!this.ctx) this.ctx = this.canvas.getContext("2d", { alpha: false })
    if (!this.ctx) return
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (this.engine) this.engine.resize(this.width, this.height, this.seed)
    else this.engine = new SkyEngine(this.ctx, this.width, this.height, this.seed)
  }

  private applyMainMode(): void {
    if (!this.ctx) return
    if (this.mode === "on") {
      if (!this.hidden) this.startLoop()
      return
    }
    this.stopLoop()
    if (this.mode === "static") this.drawStill()
    else this.clearToBlack()
  }

  private clearToBlack(): void {
    if (!this.ctx) return
    this.ctx.globalAlpha = 1
    this.ctx.fillStyle = SKY_BG
    this.ctx.fillRect(0, 0, this.width, this.height)
  }

  private drawStill(): void {
    if (!this.engine) return
    this.engine.draw(this.elapsed, 0, false)
  }

  private startLoop(): void {
    if (this.rafId !== undefined || this.destroyed) return
    this.last = this.deps.now()
    this.rafId = this.deps.raf(this.frame)
  }

  private stopLoop(): void {
    if (this.rafId === undefined) return
    this.deps.caf(this.rafId)
    this.rafId = undefined
  }

  private readonly frame = (now: number): void => {
    this.rafId = undefined
    if (this.destroyed || this.hidden || this.mode !== "on" || !this.engine) return
    const delta = boundDelta(now, this.last)
    this.last = now
    this.elapsed += delta
    this.engine.draw(this.elapsed, delta, true)
    this.rafId = this.deps.raf(this.frame)
  }
}
