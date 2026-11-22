/**
 * Moteur de rendu du ciel — une seule implémentation, utilisée à l'identique
 * par le Web Worker (OffscreenCanvas) et par le repli sur le thread principal.
 *
 * Deux règles structurantes :
 *   1. `draw()` n'alloue RIEN : tableaux typés pré-alloués, couleurs internées,
 *      pas de dégradé ni de chaîne construite par image. Le vignettage est un
 *      calque CSS statique, donc jamais recalculé.
 *   2. Le temps est fourni par l'appelant et borné par `boundDelta()`, pour
 *      qu'un onglet qui reprend ne provoque pas de saut de dérive.
 */

import {
  DEFAULT_SEED,
  LAYERS,
  MAX_DT,
  SKY_BG,
  STAR_COLORS,
  TAU,
  TWINKLE_AMPLITUDE,
  TWINKLE_PERIOD,
  starCount,
  type SkyMode,
} from "./types"

export type SkyContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** PRNG déterministe (mulberry32) : même graine → même ciel, sans `Math.random`. */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Delta de temps réel borné : `min(50 ms, (maintenant - précédent)/1000)`.
 * Une valeur négative ou invalide devient 0 — jamais un saut arrière.
 */
export function boundDelta(nowMs: number, previousMs: number): number {
  const delta = (nowMs - previousMs) / 1000
  if (!Number.isFinite(delta) || delta <= 0) return 0
  return Math.min(MAX_DT, delta)
}

/** Un aperçu en lecture seule, pour les tests — never appelé dans `draw()`. */
export type StarSample = {
  x: number
  y: number
  radius: number
  speed: number
  period: number
  amplitude: number
  layer: number
  color: string
}

export class SkyEngine {
  readonly count: number
  private readonly x: Float32Array
  private readonly y: Float32Array
  private readonly radius: Float32Array
  private readonly speed: Float32Array
  private readonly period: Float32Array
  private readonly amplitude: Float32Array
  private readonly phase: Float32Array
  private readonly alpha: Float32Array
  private readonly layer: Uint8Array
  private readonly color: Uint8Array
  private width: number
  private height: number

  constructor(
    private readonly ctx: SkyContext,
    width: number,
    height: number,
    seed: number = DEFAULT_SEED,
  ) {
    this.width = Math.max(0, width)
    this.height = Math.max(0, height)
    this.count = starCount(this.width, this.height)
    this.x = new Float32Array(this.count)
    this.y = new Float32Array(this.count)
    this.radius = new Float32Array(this.count)
    this.speed = new Float32Array(this.count)
    this.period = new Float32Array(this.count)
    this.amplitude = new Float32Array(this.count)
    this.phase = new Float32Array(this.count)
    this.alpha = new Float32Array(this.count)
    this.layer = new Uint8Array(this.count)
    this.color = new Uint8Array(this.count)
    this.build(seed)
  }

  /** Reconstruit les étoiles pour une nouvelle surface avec la même graine. */
  resize(width: number, height: number, seed: number = DEFAULT_SEED): void {
    this.width = Math.max(0, width)
    this.height = Math.max(0, height)
    this.build(seed)
  }

  private build(seed: number): void {
    const random = makeRandom(seed)
    // Les bornes sont arrondies séparément pour ne pas dériver avec les
    // flottants (0,62 + 0,3 n'est pas exactement 0,92).
    const far = Math.round(this.count * LAYERS[0].share)
    const near = Math.round(this.count * LAYERS[2].share)
    const middle = this.count - far - near
    for (let i = 0; i < this.count; i += 1) {
      const level = i < far ? 0 : i < far + middle ? 1 : 2
      const layer = LAYERS[level]
      this.layer[i] = level
      this.x[i] = random() * this.width
      this.y[i] = random() * this.height
      this.radius[i] = layer.rMin + random() * (layer.rMax - layer.rMin)
      // Vitesse de couche × facteur 0,85–1,15 : la dérive reste entre 1 et 4 px/s.
      this.speed[i] = layer.speed * (0.85 + random() * 0.3)
      this.period[i] = TWINKLE_PERIOD.min + random() * (TWINKLE_PERIOD.max - TWINKLE_PERIOD.min)
      this.amplitude[i] = TWINKLE_AMPLITUDE.min + random() * (TWINKLE_AMPLITUDE.max - TWINKLE_AMPLITUDE.min)
      this.phase[i] = random() * TAU
      this.alpha[i] = 0.3 + random() * 0.6
      this.color[i] = Math.floor(random() * STAR_COLORS.length) % STAR_COLORS.length
    }
  }

  /**
   * Dessine une image. `t` est le temps écoulé en secondes, `dt` le delta borné.
   * `animate=false` (mode Statique) : pas de dérive, scintillement à 1, image
   * identique à chaque appel.
   */
  draw(t: number, dt: number, animate: boolean): void {
    const ctx = this.ctx
    ctx.globalAlpha = 1
    ctx.fillStyle = SKY_BG
    ctx.fillRect(0, 0, this.width, this.height)

    const width = this.width
    const margin = 4
    for (let i = 0; i < this.count; i += 1) {
      let px = this.x[i]
      const py = this.y[i]
      if (animate) {
        px -= this.speed[i] * dt
        if (px < -margin) px = width + margin
        this.x[i] = px
      }
      const twinkle = animate
        ? 1 - this.amplitude[i] * (0.5 + 0.5 * Math.sin((t * TAU) / this.period[i] + this.phase[i]))
        : 1
      const alpha = this.alpha[i] * twinkle
      const fill = STAR_COLORS[this.color[i]]
      ctx.fillStyle = fill
      const radius = this.radius[i]
      // Halo des étoiles proches : un disque très pâle, deux fois le rayon.
      // Aucun dégradé créé ici : l'opacité suffit et ne coûte aucune allocation.
      if (this.layer[i] === 2) {
        ctx.globalAlpha = alpha * 0.1
        ctx.beginPath()
        ctx.arc(px, py, radius * 4, 0, TAU)
        ctx.fill()
      }
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(px, py, radius, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  /** Aperçu d'une étoile, pour les assertions de test uniquement. */
  sample(index: number): StarSample | undefined {
    if (index < 0 || index >= this.count) return undefined
    return {
      x: this.x[index],
      y: this.y[index],
      radius: this.radius[index],
      speed: this.speed[index],
      period: this.period[index],
      amplitude: this.amplitude[index],
      layer: this.layer[index],
      color: STAR_COLORS[this.color[index]],
    }
  }
}

/**
 * Le niveau par défaut : `on`, sauf `prefers-reduced-motion` sur un navigateur
 * qui ne dit rien — dans ce cas `static`, conformément au doc de design.
 */
export function defaultSkyMode(prefersReducedMotion: boolean): SkyMode {
  return prefersReducedMotion ? "static" : "on"
}
