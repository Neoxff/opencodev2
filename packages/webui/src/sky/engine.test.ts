import { describe, expect, test, vi } from "vitest"
import { SkyEngine, boundDelta, defaultSkyMode, makeRandom } from "./engine"
import { LAYERS, MAX_DT, SKY_BG, STAR_COLORS, STAR_TARGET, starCount } from "./types"
import type { SkyContext } from "./engine"

/**
 * Contexte 2D factice : il enregistre les appels et interdit toute création
 * de dégradé. C'est la traduction testable de la règle « aucune allocation par
 * image » : le moteur ne doit jamais appeler createRadialGradient/LinearGradient
 * pendant draw(), ni tirer au hasard.
 */
function fakeContext() {
  const calls: string[] = []
  const ctx = {
    fillStyle: "" as string,
    globalAlpha: 1,
    fillRect: (...args: number[]) => calls.push(`fillRect:${args.join(",")}`),
    beginPath: () => calls.push("beginPath"),
    arc: (...args: number[]) => calls.push(`arc:${args.map((n) => n.toFixed(2)).join(",")}`),
    fill: () => calls.push("fill"),
    setTransform: () => calls.push("setTransform"),
    createRadialGradient: () => {
      throw new Error("allocation de dégradé interdite par image")
    },
    createLinearGradient: () => {
      throw new Error("allocation de dégradé interdite par image")
    },
  }
  return { ctx: ctx as unknown as SkyContext, calls }
}

describe("ciel — contrat de couleur et de population", () => {
  test("le fond est noir pur, sans bleu ni violet", () => {
    expect(SKY_BG).toBe("#000000")
    // Chaque couleur d'étoile a ses trois composantes ≥ 235 : aucune teinte.
    for (const color of STAR_COLORS) {
      const channels = color.match(/\d+/g)?.map(Number) ?? []
      expect(channels).toHaveLength(3)
      expect(Math.min(...channels)).toBeGreaterThanOrEqual(235)
    }
  })

  test("1 100 étoiles à 1920×1080, bornées au-delà", () => {
    expect(starCount(1920, 1080)).toBe(STAR_TARGET)
    expect(starCount(3840, 2160)).toBe(STAR_TARGET)
    expect(starCount(0, 100)).toBe(0)
    expect(starCount(320, 568)).toBeLessThan(STAR_TARGET)
  })

  test("trois couches dans les proportions 62 / 30 / 8", () => {
    const { ctx } = fakeContext()
    const engine = new SkyEngine(ctx, 1920, 1080)
    let far = 0
    let middle = 0
    let near = 0
    for (let i = 0; i < engine.count; i += 1) {
      const layer = engine.sample(i)?.layer
      if (layer === 0) far += 1
      else if (layer === 1) middle += 1
      else near += 1
    }
    expect(engine.count).toBe(1100)
    expect(far).toBe(682)
    expect(middle).toBe(330)
    expect(near).toBe(88)
    // La part des proches reste discrète.
    expect(near / engine.count).toBeLessThan(0.1)
  })

  test("rayons par couche et dérive comprise entre 1 et 4 px/s", () => {
    const { ctx } = fakeContext()
    const engine = new SkyEngine(ctx, 1920, 1080)
    for (let i = 0; i < engine.count; i += 1) {
      const star = engine.sample(i)
      if (!star) throw new Error("étoile manquante")
      const layer = LAYERS[star.layer]
      expect(star.radius).toBeGreaterThanOrEqual(layer.rMin)
      expect(star.radius).toBeLessThanOrEqual(layer.rMax)
      expect(star.speed).toBeGreaterThanOrEqual(1)
      expect(star.speed).toBeLessThanOrEqual(4)
      expect(star.period).toBeGreaterThanOrEqual(2)
      expect(star.period).toBeLessThanOrEqual(6)
      expect(star.amplitude).toBeGreaterThanOrEqual(0.2)
      expect(star.amplitude).toBeLessThanOrEqual(0.6)
    }
  })

  test("le PRNG est déterministe, sans Math.random", () => {
    const spy = vi.spyOn(Math, "random")
    const a = makeRandom(12345)
    const b = makeRandom(12345)
    for (let i = 0; i < 32; i += 1) expect(a()).toBe(b())
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe("ciel — rendu", () => {
  test("une image = un remplissage noir, puis les étoiles, sans dégradé", () => {
    const { ctx, calls } = fakeContext()
    const engine = new SkyEngine(ctx, 1920, 1080)
    const spy = vi.spyOn(Math, "random")
    calls.length = 0
    engine.draw(1.25, 0.016, true)
    expect(calls[0]).toBe("fillRect:0,0,1920,1080")
    // 1 100 disques + 88 halos (couche proche) = 1 188 arcs.
    const arcs = calls.filter((call) => call.startsWith("arc:")).length
    expect(arcs).toBe(engine.count + 88)
    expect(ctx.globalAlpha).toBe(1)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  test("le mode statique est identique d'une image à l'autre et ne dérive pas", () => {
    const { ctx, calls } = fakeContext()
    const engine = new SkyEngine(ctx, 1920, 1080)
    const before = engine.sample(0)?.x
    engine.draw(0, 0, false)
    const first = [...calls]
    calls.length = 0
    engine.draw(99, 10, false)
    expect(calls).toEqual(first)
    expect(engine.sample(0)?.x).toBe(before)
  })

  test("le mode animé fait dériver les étoiles vers la gauche", () => {
    const { ctx } = fakeContext()
    const engine = new SkyEngine(ctx, 1920, 1080)
    const before = engine.sample(0)?.x ?? 0
    engine.draw(0, 0.05, true)
    const after = engine.sample(0)?.x ?? 0
    expect(after).toBeLessThan(before)
    // Précision 3 : la vitesse est stockée en Float32Array, donc arrondie.
    expect(before - after).toBeCloseTo((engine.sample(0)?.speed ?? 0) * 0.05, 3)
  })

  test("le delta réel est borné à 50 ms et ne recule jamais", () => {
    expect(boundDelta(1000, 900)).toBe(MAX_DT) // 100 ms ramenés à 50 ms
    expect(boundDelta(1000, 990)).toBe(0.01)
    expect(boundDelta(1000, 0)).toBe(MAX_DT)
    expect(boundDelta(900, 1000)).toBe(0)
    expect(boundDelta(Number.NaN, 0)).toBe(0)
  })

  test("sans mouvement préféré, le niveau par défaut est activé", () => {
    expect(defaultSkyMode(false)).toBe("on")
    expect(defaultSkyMode(true)).toBe("static")
  })
})
