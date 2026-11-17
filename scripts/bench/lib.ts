/** Utilitaires du banc de mesure : statistiques, configuration machine, résolution des dépendances en cache. */

import { arch, cpus, platform, release, totalmem } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

export const RACINE = path.resolve(import.meta.dir, "../..")

export type Statistiques = {
  n: number
  mediane: number
  p95: number
  min: number
  max: number
  moyenne: number
}

export function statistiques(valeurs: number[]): Statistiques {
  const tri = [...valeurs].sort((a, b) => a - b)
  const quantile = (p: number) => tri[Math.min(tri.length - 1, Math.max(0, Math.ceil(p * tri.length) - 1))]
  const arrondi = (n: number) => Math.round(n * 1000) / 1000
  return {
    n: tri.length,
    mediane: arrondi(quantile(0.5)),
    p95: arrondi(quantile(0.95)),
    min: arrondi(tri[0]),
    max: arrondi(tri[tri.length - 1]),
    moyenne: arrondi(valeurs.reduce((a, b) => a + b, 0) / valeurs.length),
  }
}

/** n passages, après chauffage, retournent les statistiques demandées. */
export async function serie(
  mesure: () => number | Promise<number>,
  passages = 10,
  chauffage = 2,
): Promise<Statistiques> {
  for (let i = 0; i < chauffage; i++) await mesure()
  const valeurs: number[] = []
  for (let i = 0; i < passages; i++) valeurs.push(await mesure())
  return statistiques(valeurs)
}

export function configurationMachine() {
  const cpu = cpus()
  return {
    date: new Date().toISOString(),
    systeme: platform(),
    noyau: release(),
    architecture: arch(),
    processeur: cpu[0]?.model ?? "inconnu",
    coeurs: cpu.length,
    memoireGiB: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
    bun: Bun.version,
    node: process.version,
    git: gitCourt(),
  }
}

function gitCourt(): string {
  try {
    const p = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { cwd: RACINE, stdout: "pipe", stderr: "ignore" })
    return new TextDecoder().decode(p.stdout).trim()
  } catch {
    return "inconnu"
  }
}

/** Choisit la version la plus élevée (tri numérique, pas lexicographique : 17 > 7). */
function versionLaPlusHaute(chemins: string[]): string | undefined {
  return [...chemins].sort((a, b) => {
    const va = a.match(/@([\d.]+)/)?.[1]?.split(".").map(Number) ?? [0]
    const vb = b.match(/@([\d.]+)/)?.[1]?.split(".").map(Number) ?? [0]
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const d = (vb[i] ?? 0) - (va[i] ?? 0)
      if (d !== 0) return d
    }
    return 0
  })[0]
}

/** Importe un paquet présent dans le cache .bun, avec son point d'entrée explicite. */
export async function importerCache(nom: string, entree: string): Promise<Record<string, unknown>> {
  const motif = `node_modules/.bun/${nom}@*/node_modules/${nom}/${entree}`
  const choix = versionLaPlusHaute([...new Bun.Glob(motif).scanSync({ cwd: RACINE })])
  if (!choix) throw new Error(`paquet ${nom} introuvable dans le cache .bun`)
  return (await import(pathToFileURL(path.join(RACINE, choix)).href)) as Record<string, unknown>
}

export async function versionCache(nom: string): Promise<string | undefined> {
  const motif = `node_modules/.bun/${nom}@*/node_modules/${nom}/package.json`
  const choix = versionLaPlusHaute([...new Bun.Glob(motif).scanSync({ cwd: RACINE })])
  if (!choix) return undefined
  const pkg = JSON.parse(await Bun.file(path.join(RACINE, choix)).text())
  return pkg.version as string
}
