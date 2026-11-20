import { describe, expect, test } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

const ROOT = join(__dirname, "..")
const CSS = readFileSync(join(ROOT, "src", "styles.css"), "utf8")

/**
 * Tests de classes — verre sobre (docs/design/22-verre-sobre-web.md).
 * Vérifie que les classes `.glass*` sont déclarées dans styles.css et appliquées
 * aux surfaces cibles : rail, compositeur, menu, feuille (réglages), panneau Dépôt.
 * Vérifie aussi le repli @supports sans backdrop-filter.
 */

describe("verre — classes déclarées dans styles.css", () => {
  test("classe .glass existe avec backdrop-filter et contour", () => {
    expect(CSS).toContain(".glass {")
    expect(CSS).toContain("backdrop-filter: var(--glass-blur)")
    expect(CSS).toContain("border: 1px solid var(--glass-contour-color)")
  })

  test("classe .glass-rail (opacité 0,65, panneau sans texte essentiel)", () => {
    expect(CSS).toContain(".glass-rail")
    expect(CSS).toContain("opacity: var(--glass-moyen)")
  })

  test("classe .glass-composer (opacité 0,65, zone de saisie)", () => {
    expect(CSS).toContain(".glass-composer")
    expect(CSS).toContain("opacity: var(--glass-moyen)")
  })

  test("classe .glass-menu (opacité 0,80, flou fort 20 px)", () => {
    expect(CSS).toContain(".glass-menu")
    expect(CSS).toContain("opacity: var(--glass-opaque)")
    expect(CSS).toContain("var(--glass-blur-fort)")
  })

  test("classe .glass-sheet (opacité 0,80, flou fort 20 px)", () => {
    expect(CSS).toContain(".glass-sheet")
    expect(CSS).toContain("opacity: var(--glass-opaque)")
    expect(CSS).toContain("var(--glass-blur-fort)")
  })

  test("classe .glass-depot (opacité 0,65, panneau sans texte essentiel)", () => {
    expect(CSS).toContain(".glass-depot")
    expect(CSS).toContain("opacity: var(--glass-moyen)")
  })

  test("reflet fin sur le bord haut (.glass::before)", () => {
    expect(CSS).toContain(".glass::before")
    expect(CSS).toContain("var(--glass-reflet)")
    expect(CSS).toContain("pointer-events: none")
  })

  test("repli @supports not (backdrop-filter: blur(1px)) -> surface opaque", () => {
    expect(CSS).toContain("@supports not (backdrop-filter: blur(1px))")
    expect(CSS).toContain("background: var(--bg-2)")
    expect(CSS).toContain("opacity: 1")
    expect(CSS).toContain(".glass::before {")
    expect(CSS).toContain("display: none")
  })
})

describe("verre — classes appliquées aux surfaces cibles", () => {
  test("rail possède la classe glass-rail", () => {
    expect(readFileSync(join(ROOT, "src", "app.tsx"), "utf8")).toContain(
      '<aside class="rail glass-rail">',
    )
  })

  test("menu de session possède la classe glass-menu", () => {
    expect(readFileSync(join(ROOT, "src", "app.tsx"), "utf8")).toContain(
      'class="row-menu glass-menu"',
    )
  })

  test("compositeur possède la classe glass-composer", () => {
    expect(readFileSync(join(ROOT, "src", "app.tsx"), "utf8")).toContain(
      'class="composer glass-composer"',
    )
  })

  test("panneau Depot possède la classe glass-depot", () => {
    expect(readFileSync(join(ROOT, "src", "git-panel.tsx"), "utf8")).toContain(
      'class="git-panel glass-depot"',
    )
  })

  test("feuille reglages possède la classe glass-sheet", () => {
    expect(readFileSync(join(ROOT, "src", "settings-sheet.tsx"), "utf8")).toContain(
      'class="sheet settings glass-sheet"',
    )
  })
})

describe("verre — messages et code restent opaques (pas de verre)", () => {
  test("aucun .glass sur les messages ni blocs de code", () => {
    // Les surfaces opaques ne doivent pas utiliser de classe .glass*
    expect(CSS).not.toContain(".glass-message")
    expect(CSS).not.toContain(".glass-code")
  })
})
