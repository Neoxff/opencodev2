import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"

/**
 * Contraste du panneau Dépôt mesuré depuis les jetons réels de styles.css
 * (spec 22 §4), et vérification que le panneau reste opaque sur main :
 * sans verre, la règle « text-3 interdit sur verre » ne s'applique pas.
 */
const css = readFileSync(path.resolve(process.cwd(), "src/styles.css"), "utf-8")
const panel = readFileSync(path.resolve(process.cwd(), "src/git-panel.css"), "utf-8")

function jetons(): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(m[1]!, m[2]!.trim())
  return map
}

function resoudre(nom: string, map: Map<string, string>): string {
  const brut = map.get(nom)
  if (!brut) throw new Error(`jeton absent : ${nom}`)
  const varRef = /^var\((--[\w-]+)\)$/.exec(brut)
  return varRef ? resoudre(varRef[1]!, map) : brut
}

function luminance(hex: string): number {
  const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  if (!m) throw new Error(`couleur invalide : ${hex}`)
  const c = [m[1]!, m[2]!, m[3]!].map((v) => {
    const s = parseInt(v, 16) / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}

function contraste(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100
}

describe("contraste du panneau Dépôt (spec 22 §4)", () => {
  const map = jetons()
  const fond = resoudre("--bg-2", map) // --bg-2 = --bluish-850 = #2c2c2e

  for (const texte of ["--text-1", "--text-2", "--text-3"]) {
    test(`${texte} sur --bg-2 >= 4,5:1`, () => {
      const ratio = contraste(resoudre(texte, map), fond)
      expect(ratio, `${resoudre(texte, map)} sur ${fond}`).toBeGreaterThanOrEqual(4.5)
    })
  }

  test("le panneau est opaque : pas de verre, donc pas d'interdiction text-3", () => {
    expect(panel).not.toContain("backdrop-filter")
    expect(panel).not.toMatch(/\.glass\b/)
    expect(panel).toContain("background: var(--bg-2)")
  })
})
