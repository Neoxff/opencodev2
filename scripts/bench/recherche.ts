/** Banc 4 — recherche de texte dans 20 000 fichiers (rg système, binaire déjà présent). */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { serie } from "./lib"

const NOMBRE_FICHIERS = 20_000
let dossier: string | undefined

function preparer(): string {
  dossier = mkdtempSync(path.join(tmpdir(), "ov2-bench-search-"))
  for (let i = 0; i < NOMBRE_FICHIERS; i++) {
    const contenu =
      i % 100 === 0
        ? `fichier ${i} : MOTIFRARE aiguille dans la meule de foin\n`
        : `fichier ${i} : texte ordinaire sans le motif recherché\n`
    writeFileSync(path.join(dossier, `f-${String(i).padStart(5, "0")}.txt`), contenu)
  }
  return dossier
}

export async function mesurerRecherche() {
  const racine = preparer()
  try {
    const ms = await serie(() => {
      const t0 = performance.now()
      const p = Bun.spawnSync(["rg", "-l", "MOTIFRARE", racine], { stdout: "pipe", stderr: "ignore" })
      const sortie = new TextDecoder().decode(p.stdout).trim().split("\n").filter(Boolean)
      if (sortie.length !== 200) throw new Error(`recherche incomplète : ${sortie.length} résultats`)
      return performance.now() - t0
    })
    return { fichiers: NOMBRE_FICHIERS, dureeMs: ms, outil: "ripgrep (rg)" }
  } finally {
    if (dossier) rmSync(dossier, { recursive: true, force: true })
  }
}
