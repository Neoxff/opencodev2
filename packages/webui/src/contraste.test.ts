import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"

/**
 * Contraste mesuré, pas estimé : les valeurs sont lues dans styles.css, les
 * références var(--x) résolues, puis le ratio WCAG calculé (Paired 2.1).
 * Le panneau Dépôt utilise --text-1/2/3 sur --bg-1/2.
 */
const css = readFileSync(path.resolve(process.cwd(), "src/styles.css"), "utf-8")

function jetons(): Map<string, string> {
  const map = new Map<string, string>()
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(match[1]!, match[2]!.trim())
  }
  return map
}

function resoudre(nom: string, map: Map<string, string>, vus = new Set<string>()): string {
  if (vus.has(nom)) throw new Error(`référence circulaire : ${nom}`)
  vus.add(nom)
  const brut = map.get(nom)
  if (!brut) throw new Error(`jeton absent : ${nom}`)
  varRef: if (brut.startsWith("var(")) {
    const interne = /^var\((--[\w-]+)\)$/.exec(brut)
    if (interne) return resoudre(interne[1]!, map, vus)
    break varRef
  }
  return brut
}

function rgb(hex: string): [number, number, number] {
  const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  if (!m) throw new Error(`couleur invalide : ${hex}`)
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)]
}

function luminance(hex: string): number {
  const canaux = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * canaux[0]! + 0.7152 * canaux[1]! + 0.0722 * canaux[2]!
}

function contraste(avant: string, apres: string): number {
  const a = luminance(avant)
  const b = luminance(apres)
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100
}

describe("contraste du panneau Dépôt (AA >= 4,5:1)", () => {
  const map = jetons()
  const fonds = ["--bg-1", "--bg-2"].map((nom) => resoudre(nom, map))

  for (const texte of ["--text-1", "--text-2", "--text-3"]) {
    for (const [i, fond] of fonds.entries()) {
      test(`${texte} sur --bg-${i + 1} >= 4,5:1`, () => {
        const couleur = resoudre(texte, map)
        const ratio = contraste(couleur, fond)
        expect(ratio, `${couleur} sur ${fond}`).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})
