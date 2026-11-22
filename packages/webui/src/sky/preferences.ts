/**
 * Persistance du réglage Ciel.
 *
 * C'est une préférence **de ce navigateur**, pas une clé de la configuration
 * serveur (le serveur n'a rien à savoir d'un fond d'écran). Stockage donc dans
 * `localStorage`, sous une clé dédiée — exactement comme `oc.webui.directory`.
 *
 * Les fonctions de lecture sont tolérantes : une valeur invalide (écrite à la
 * main, issue d'une ancienne version) retombe sur le défaut au lieu de casser
 * l'interface.
 */

import { defaultSkyMode } from "./engine"
import { SKY_MODES, type SkyMode } from "./types"

export const SKY_STORAGE_KEY = "oc.webui.sky"

/** Le stockage minimal dont les fonctions ont besoin — injectable pour les tests. */
export type SkyStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Normalise une valeur lue : uniquement les trois niveaux connus. */
export function parseSkyMode(value: string | null | undefined): SkyMode | undefined {
  if (typeof value !== "string") return undefined
  return SKY_MODES.find((mode) => mode === value)
}

/**
 *Lit le réglage. Sans valeur persistée, respecte `prefers-reduced-motion`.
 */
export function readSkyMode(storage: SkyStorage | undefined, prefersReducedMotion: boolean): SkyMode {
  if (!storage) return defaultSkyMode(prefersReducedMotion)
  try {
    return parseSkyMode(storage.getItem(SKY_STORAGE_KEY)) ?? defaultSkyMode(prefersReducedMotion)
  } catch {
    return defaultSkyMode(prefersReducedMotion)
  }
}

/** Écrit le réglage. Une erreur de stockage (mode privé, quota) ne casse rien. */
export function writeSkyMode(storage: SkyStorage | undefined, mode: SkyMode): void {
  if (!storage) return
  try {
    storage.setItem(SKY_STORAGE_KEY, mode)
  } catch {
    // Préférence non critique : l'état reste appliqué pour cette session.
  }
}

/** `localStorage` n'existe pas dans tous les contextes (tests, SSR). */
export function browserStorage(): SkyStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage
  } catch {
    return undefined
  }
}

/** Libellés d'écran — la copie d'interface est en anglais, les commentaires en français. */
export const SKY_MODE_LABELS: Record<SkyMode, { label: string; desc: string }> = {
  on: { label: "Enabled", desc: "stars drift and twinkle slowly" },
  static: { label: "Static", desc: "a single still image, no animation" },
  off: { label: "Disabled", desc: "no sky at all, pure black" },
}
