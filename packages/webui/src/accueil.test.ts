import { describe, expect, test } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

const ROOT = join(__dirname, "..")

/**
 * Tests de l'écran d'accueil (docs/design/23-depot-accueil.md §1) et du panneau Dépôt (§2).
 * Vérifie que les règles de conception sont respectées : titre lettre par lettre,
 * durée ≤ 1 200 ms, sautable, préférence mouvement réduit, contenu correct de l'état
 * « divergent » (pas de « Chargement du dépôt… »).
 */

const CSS =
  readFileSync(join(ROOT, "src", "styles.css"), "utf8") +
  "\n" +
  readFileSync(join(ROOT, "src", "accueil.css"), "utf8")

describe("écran d'accueil — spécification §1", () => {
  test("le titre commence vide (lettre par lettre)", () => {
    const src = readFileSync(join(ROOT, "src", "EcranAccueil.tsx"), "utf8")
    expect(src).toContain("const TITRE = \"Opencodev2\"")
    expect(src).toContain("DELAI_LETTRE = 28")
    expect(src).toContain("DUREE_TITRE = 1200")
  })

  test("le titre est sautable", () => {
    const src = readFileSync(join(ROOT, "src", "EcranAccueil.tsx"), "utf8")
    expect(src).toContain("sauter")
    expect(src).toContain("Enter")
    expect(src).toContain("Escape")
  })

  test("respecte prefers-reduced-motion (titre d'emblée, pas de curseur)", () => {
    const src = readFileSync(join(ROOT, "src", "EcranAccueil.tsx"), "utf8")
    expect(src).toContain("prefers-reduced-motion")
    expect(src).toContain("setTermine(true)")
  })

  test("le composant retourne null une fois terminé (pas de blocage)", () => {
    const src = readFileSync(join(ROOT, "src", "EcranAccueil.tsx"), "utf8")
    expect(src).toContain("if (termine()) return null")
  })

  test("l'accueil est intégré dans app.tsx comme couche superposée", () => {
    const src = readFileSync(join(ROOT, "src", "app.tsx"), "utf8")
    expect(src).toContain("EcranAccueil")
    expect(src).toContain("accueil-couche")
  })

  test("CSS .accueil-couche présent (plein écran, z-index élevé)", () => {
    expect(CSS).toContain(".accueil-couche")
    expect(CSS).toContain("position: fixed")
    expect(CSS).toContain("z-index: 50")
  })

  test("CSS .accueil-titre utilise Space Grotesk 700", () => {
    expect(CSS).toContain(".accueil-titre")
    expect(CSS).toContain('font-family: "Space Grotesk"')
    expect(CSS).toContain("font-weight: 700")
    expect(CSS).toContain("font-size: clamp(2rem, 8vw, 4rem)")
  })

  test("CSS curseur clignotant — accent-fort", () => {
    expect(CSS).toContain(".accueil-curseur")
    expect(CSS).toContain("var(--accent-fort)")
  })
})

describe("panneau Dépôt — spécification §2 (état divergent corrigé)", () => {
  test("l'état divergent n'affiche plus « Chargement du dépôt… »", () => {
    const src = readFileSync(join(ROOT, "src", "git-panel.tsx"), "utf8")
    expect(src).not.toContain('erreur() === "NON_DISPONIBLE" ? "Jeton local absent" : "Chargement du dépôt…"')
  })

  test("l'erreur affiche libelleErreur + Réessayer", () => {
    const src = readFileSync(join(ROOT, "src", "git-panel.tsx"), "utf8")
    expect(src).toContain("libelleErreur(erreur()!)")
    expect(src).toContain('aria-label="Réessayer"')
  })

  test("git-client.ts définit le libellé divergent spécifié", () => {
    const src = readFileSync(join(ROOT, "src", "git-client.ts"), "utf8")
    expect(src).toContain('NON_FAST_FORWARD: "Branches divergentes : fusion manuelle nécessaire."')
  })

  test("etatDepot renvoie divergent pour NON_FAST_FORWARD", () => {
    const src = readFileSync(join(ROOT, "src", "git-client.ts"), "utf8")
    expect(src).toContain('if (erreur === "NON_FAST_FORWARD") return "divergent"')
  })
})
