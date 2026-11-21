import { describe, expect, test } from "vitest"
import { doitVirtualiser, fenetreVisible, SEUIL_VIRTUALISATION } from "./listes"

describe("fenetreVisible", () => {
  const base = { nombre: 1000, scrollTop: 0, hauteurVue: 400, hauteurLigne: 20, survol: 3 }

  test("au sommet : montre le debut plus le survol", () => {
    const f = fenetreVisible(base)
    expect(f.debut).toBe(0)
    expect(f.fin).toBe(26) // 20 visibles + 3 survol bas + 3 survol haut
    expect(f.margeHaut).toBe(0)
    expect(f.margeBas).toBe((1000 - 26) * 20)
  })

  test("au milieu : decale la fenetre", () => {
    const f = fenetreVisible({ ...base, scrollTop: 5000 })
    expect(f.debut).toBe(247) // 5000/20 - 3
    expect(f.fin).toBe(273)
    expect(f.margeHaut).toBe(247 * 20)
  })

  test("en bas : borne a la fin sans depasser", () => {
    const f = fenetreVisible({ ...base, scrollTop: 100_000 })
    expect(f.fin).toBe(1000)
    expect(f.margeBas).toBe(0)
  })

  test("la hauteur totale reste identique a une liste complete", () => {
    for (const scrollTop of [0, 137, 5000, 19_999]) {
      const f = fenetreVisible({ ...base, scrollTop })
      expect(f.margeHaut + (f.fin - f.debut) * 20 + f.margeBas).toBe(1000 * 20)
    }
  })

  test("liste vide ou hauteur de ligne nulle : fenetre vide", () => {
    expect(fenetreVisible({ ...base, nombre: 0 })).toEqual({ debut: 0, fin: 0, margeHaut: 0, margeBas: 0 })
    expect(fenetreVisible({ ...base, hauteurLigne: 0 })).toEqual({ debut: 0, fin: 0, margeHaut: 0, margeBas: 0 })
  })

  test("scrollTop negatif ou vue nulle : borne sans nombre negatif", () => {
    const f = fenetreVisible({ ...base, scrollTop: -50, hauteurVue: 0 })
    expect(f.debut).toBeGreaterThanOrEqual(0)
    expect(f.fin).toBeGreaterThan(f.debut)
    expect(f.margeHaut).toBeGreaterThanOrEqual(0)
  })
})

describe("doitVirtualiser", () => {
  test("seuil par defaut", () => {
    expect(SEUIL_VIRTUALISATION).toBe(100)
    expect(doitVirtualiser(100)).toBe(false)
    expect(doitVirtualiser(101)).toBe(true)
  })

  test("seuil explicite", () => {
    expect(doitVirtualiser(21, 20)).toBe(true)
    expect(doitVirtualiser(20, 20)).toBe(false)
  })
})
