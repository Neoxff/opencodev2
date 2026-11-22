import { describe, expect, test } from "vitest"
import { etatDepot, type GitEtat } from "./git-client"

/**
 * Tests de tous les états du panneau Dépôt (docs/design/23-depot-accueil.md §2).
 * Vérifie que etatDepot() retourne le bon état pour chaque combinaison
 * (statut, erreur).
 */

describe("etatDepot — tous les états", () => {
  const statutAVance = {
    ahead: 2,
    behind: 0,
    modified: [],
  } as any
  const statutARetard = {
    ahead: 0,
    behind: 3,
    modified: [],
  } as any
  const statutADiverger = {
    ahead: 2,
    behind: 3,
    modified: [],
  } as any
  const statutAJour = {
    ahead: 0,
    behind: 0,
    modified: [],
  } as any

  test("à jour : statut propre, pas d'erreur", () => {
    expect(etatDepot(statutAJour, undefined)).toBe("a-jour")
  })

  test("en avance : ahead > 0, behind = 0", () => {
    expect(etatDepot(statutAVance, undefined)).toBe("en-avance")
  })

  test("en retard : behind > 0, ahead = 0", () => {
    expect(etatDepot(statutARetard, undefined)).toBe("en-retard")
  })

  test("divergent : ahead > 0 et behind > 0", () => {
    expect(etatDepot(statutADiverger, undefined)).toBe("divergent")
  })

  test("conflit : erreur CONFLIT", () => {
    expect(etatDepot(undefined, "CONFLIT")).toBe("conflit")
  })

  test("divergent : erreur NON_FAST_FORWARD (priorité sur statut)", () => {
    expect(etatDepot(statutAJour, "NON_FAST_FORWARD")).toBe("divergent")
  })

  test("hors-ligne : statut undefined, pas d'erreur", () => {
    expect(etatDepot(undefined, undefined)).toBe("hors-ligne")
  })

  test("hors-ligne : erreur PAS_DE_RESEAU", () => {
    expect(etatDepot(statutAJour, "PAS_DE_RESEAU")).toBe("hors-ligne")
  })

  test("hors-ligne : erreur NON_DISPONIBLE", () => {
    expect(etatDepot(undefined, "NON_DISPONIBLE")).toBe("hors-ligne")
  })

  test("jamais « Chargement du dépôt… » comme état : etatDepot ne retourne jamais cet intitulé", () => {
    const etatsPossibles: GitEtat[] = [
      "a-jour",
      "en-avance",
      "en-retard",
      "divergent",
      "conflit",
      "hors-ligne",
    ]
    expect(etatsPossibles).not.toContain("Chargement du dépôt…" as any)
  })
})
