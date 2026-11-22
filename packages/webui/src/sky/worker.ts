/**
 * Worker du ciel — rendu dans un OffscreenCanvas, hors du thread principal.
 *
 * Un worker n'a pas `requestAnimationFrame` : la boucle est donc pilotée par
 * `setTimeout` à ~60 Hz, avec un **delta de temps réel borné** partagé avec le
 * repli (`boundDelta`). Le visuel reste identique au repli, car les deux
 * appellent exactement le même `SkyEngine.draw()`.
 *
 * L'onglet masqué est signalé par le thread principal (`visibility`) : la
 * boucle est alors **totalement arrêtée** — aucun timer, aucune image.
 */

import { SkyEngine, boundDelta } from "./engine"
import { SKY_BG, type SkyMode } from "./types"

/** ~60 images/s ; le delta réel est mesuré, pas supposé. */
const FRAME_MS = 1000 / 60

type WorkerMessage =
  | { type: "probe" }
  | { type: "init"; canvas: OffscreenCanvas; width: number; height: number; dpr: number; mode: SkyMode; seed: number }
  | { type: "resize"; width: number; height: number; dpr: number }
  | { type: "mode"; mode: SkyMode }
  | { type: "visibility"; hidden: boolean }
  | { type: "stop" }

let canvas: OffscreenCanvas | undefined
let ctx: OffscreenCanvasRenderingContext2D | null = null
let engine: SkyEngine | undefined
let mode: SkyMode = "on"
let hidden = false
let timer: ReturnType<typeof setTimeout> | undefined
let last = 0
let elapsed = 0
let dpr = 1
let seed = 0

function stop(): void {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
}

function clearToBlack(): void {
  if (!ctx || !canvas) return
  ctx.globalAlpha = 1
  ctx.fillStyle = SKY_BG
  ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr)
}

function drawStill(): void {
  if (!engine) return
  engine.draw(elapsed, 0, false)
}

function frame(): void {
  if (!engine || mode !== "on" || hidden) {
    stop()
    return
  }
  timer = setTimeout(frame, FRAME_MS)
  const now = performance.now()
  const delta = boundDelta(now, last)
  last = now
  elapsed += delta
  engine.draw(elapsed, delta, true)
}

function start(): void {
  if (timer !== undefined || mode !== "on" || hidden || !engine) return
  last = performance.now()
  timer = setTimeout(frame, FRAME_MS)
}

function applyMode(next: SkyMode): void {
  mode = next
  stop()
  if (next === "on") start()
  else if (next === "static") drawStill()
  else clearToBlack()
}

function applySize(width: number, height: number, nextDpr: number, seed: number): void {
  if (!canvas || !ctx) return
  dpr = Math.max(1, Math.min(nextDpr || 1, 2))
  canvas.width = Math.max(1, Math.round(width * dpr))
  canvas.height = Math.max(1, Math.round(height * dpr))
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (engine) engine.resize(width, height, seed)
  else engine = new SkyEngine(ctx, width, height, seed)
  if (mode === "static") drawStill()
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data
  switch (message.type) {
    case "probe":
      // Handshake sans transfert : le thread principal sait que le worker vit
      // avant de lui confier le canvas (et donc avant de ne plus pouvoir
      // revenir au repli sur ce même canvas).
      self.postMessage({ type: "probe-ok" })
      return
    case "init": {
      canvas = message.canvas
      ctx = canvas.getContext("2d", { alpha: false })
      if (!ctx) {
        self.postMessage({ type: "error", reason: "OffscreenCanvas 2D context unavailable" })
        return
      }
      mode = message.mode
      hidden = false
      seed = message.seed
      applySize(message.width, message.height, message.dpr, seed)
      applyMode(mode)
      self.postMessage({ type: "ready" })
      return
    }
    case "resize":
      applySize(message.width, message.height, message.dpr, seed)
      return
    case "mode":
      applyMode(message.mode)
      return
    case "visibility":
      hidden = message.hidden
      if (hidden) stop()
      else start()
      return
    case "stop":
      stop()
      return
  }
}
