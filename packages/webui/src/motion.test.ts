import { describe, expect, test, vi, afterEach, beforeEach } from "vitest"
import {
  DUREE,
  COURBE,
  delaiEchelonnage,
  delaiEchelonnageEffectif,
  dureeEffective,
  DUREE_MAX_ACTION,
  reduitMouvement,
  redefinirMatchMedia,
} from "./motion"

/**
 * Test unitaire du moteur de mouvement (docs/design/21-animations.md).
 * Le store `reduitMouvement` lit `matchMedia` ; on le force pour les tests
 * via `redefinirMatchMedia`.
 */

function forcerReduitMouvement(actif: boolean): void {
  redefinirMatchMedia(() => ({
    matches: actif,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

describe("moteur de mouvement", () => {
  beforeEach(() => {
    forcerReduitMouvement(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("durées : instantane 90 ms, rapide 160 ms, normal 240 ms, lent 380 ms", () => {
    expect(DUREE.instantane).toBe(90)
    expect(DUREE.rapide).toBe(160)
    expect(DUREE.normal).toBe(240)
    expect(DUREE.lent).toBe(380)
  })

  test("durée maximale pour une action utilisateur : 400 ms", () => {
    expect(DUREE_MAX_ACTION).toBe(400)
    for (const valeur of Object.values(DUREE)) {
      expect(valeur).toBeLessThanOrEqual(DUREE_MAX_ACTION)
    }
  })

  test("courbes : sortie douce et entrée-sortie", () => {
    expect(COURBE.sortieDouce).toBe("cubic-bezier(0.22, 1, 0.36, 1)")
    expect(COURBE.entreeSortie).toBe("cubic-bezier(0.4, 0, 0.2, 1)")
  })

  test("échelonnage : 30-40 ms par élément, 8 éléments maximum", () => {
    // 8 premiers éléments : délai croissant
    expect(delaiEchelonnage(0)).toBe(0)
    expect(delaiEchelonnage(1)).toBe(35)
    expect(delaiEchelonnage(7)).toBe(245)
    // au-delà : plafond, pas de délai supplémentaire
    expect(delaiEchelonnage(8)).toBe(245)
    expect(delaiEchelonnage(100)).toBe(245)
  })

  test("préférence mouvement réduit : toutes les durées passent à 0", () => {
    expect(reduitMouvement.get()).toBe(false)
    expect(dureeEffective("normal")).toBe(240)
    expect(delaiEchelonnageEffectif(3)).toBe(105)

    forcerReduitMouvement(true)
    expect(reduitMouvement.get()).toBe(true)
    expect(dureeEffective("lent")).toBe(0)
    expect(dureeEffective("instantane")).toBe(0)
    expect(delaiEchelonnageEffectif(7)).toBe(0)
  })

  test("courbes n'utilisent que transform et opacity-compatibles (pas de width/height/top/left/box-shadow)", () => {
    // Les courbes déclarées ne contiennent aucune propriété interdite : ce test
    // documente la règle « n'animer que transform et opacity ».
    expect(COURBE.sortieDouce).not.toMatch(/width|height|top|left|box-shadow/)
    expect(COURBE.entreeSortie).not.toMatch(/width|height|top|left|box-shadow/)
  })
})
