import { describe, expect, test } from "vitest"
import { CLES, t, type Langue } from "./git-i18n"

/** Aucune clé manquante, aucune valeur vide, dans les deux langues. */
describe("git-i18n", () => {
  const langues: Langue[] = ["fr", "en"]

  test("chaque clé a une valeur non vide en FR et en EN", () => {
    for (const langue of langues) {
      for (const cle of CLES) {
        const valeur = t(langue, cle)
        expect(valeur, `${langue}:${cle}`).toBeTruthy()
        expect(valeur, `${langue}:${cle}`).not.toBe(cle)
      }
    }
  })

  test("vraie traduction : seuls les termes techniques identiques sont partagés", () => {
    // « Divergent » et « Commit » sont identiques en FR et EN : ce sont des
    // termes techniques, pas un oubli de traduction.
    const termesTechniques = new Set(["Divergent", "Commit"])
    const traduits = CLES.filter((cle) => t("fr", cle) !== t("en", cle))
    expect(traduits.length).toBeGreaterThan(CLES.length * 0.8)
    for (const cle of CLES) {
      if (t("fr", cle) === t("en", cle)) {
        expect(termesTechniques.has(t("fr", cle)), cle).toBe(true)
      }
    }
  })

  test("couverture des états, actions et réglages du panneau", () => {
    for (const prefixe of ["etat.", "action.", "auto.reglage.", "compteurs.", "confirm."]) {
      expect(CLES.some((cle) => cle.startsWith(prefixe)), prefixe).toBe(true)
    }
    expect(CLES.length).toBeGreaterThanOrEqual(30)
  })
})
