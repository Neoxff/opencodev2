/** Lecture de la configuration de liaison côté serveur (miroir de script/link-config.ts). */

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

export type WorkspaceConfig = { workspace: string }

export function lireWorkspace(racine: string): string {
  const fichier = path.join(racine, "opencodev2.config.json")
  if (!existsSync(fichier)) return racine
  try {
    const brut = JSON.parse(readFileSync(fichier, "utf8")) as WorkspaceConfig
    const relatif = typeof brut.workspace === "string" ? brut.workspace : "."
    const base = path.resolve(racine)
    const cible = path.resolve(base, relatif)
    if (cible !== base && !cible.startsWith(base + path.sep)) return racine
    return cible
  } catch {
    return racine
  }
}
