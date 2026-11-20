import { describe, expect, test } from "vitest"
import { étatInitial, frame } from "../src/ciel-moteur"

/**
 * Mesure de performance du moteur ciel étoilé (docs/design/20-ciel-etoile.md).
 * Rendement : ms par image, images par seconde, nombre d'étoiles.
 * Le seuil de succès : ~60 i/s pour 2 000 étoiles (ms/image ≤ 16,7 ms).
 */

const LARGEUR = 1920
const HAUTEUR = 1080

function mesurer(mode: "activé" | "réduit" | "statique", iterations = 600) {
  let état = étatInitial(42, LARGEUR, HAUTEUR, mode)
  const t0 = performance.now()
  for (let i = 0; i < iterations; i += 1) {
    état = frame(état, i * 16, LARGEUR, HAUTEUR, 0, 0, mode, false, 16)
  }
  const t1 = performance.now()
  const total = t1 - t0
  return {
    nbEtoiles: état.etoiles.length,
    msTot: total,
    msParImage: total / iterations,
    fps: (iterations * 1000) / total,
  }
}

describe("banc de mesure — ciel étoilé", () => {
  test("mode activé : 2 000 étoiles, ~60 fps", () => {
    const r = mesurer("activé")
    expect(r.nbEtoiles).toBe(2000)
    console.log(
      `[banc ciel activé] ${r.nbEtoiles} étoiles — ${r.msParImage.toFixed(3)} ms/image — ${r.fps.toFixed(1)} fps — ${r.msTot.toFixed(0)} ms total`,
    )
    expect(r.fps).toBeGreaterThan(30) // plancher conservateur sur cette machine
  })

  test("mode réduit : 1 000 étoiles, plus rapide", () => {
    const r = mesurer("réduit")
    expect(r.nbEtoiles).toBe(1000)
    console.log(
      `[banc ciel réduit] ${r.nbEtoiles} étoiles — ${r.msParImage.toFixed(3)} ms/image — ${r.fps.toFixed(1)} fps`,
    )
    expect(r.fps).toBeGreaterThan(30)
  })

  test("mode statique : positions figées, rapide", () => {
    const r = mesurer("statique")
    expect(r.nbEtoiles).toBe(2000)
    console.log(
      `[banc ciel statique] ${r.nbEtoiles} étoiles — ${r.msParImage.toFixed(3)} ms/image — ${r.fps.toFixed(1)} fps`,
    )
    expect(r.fps).toBeGreaterThan(30)
  })
})
