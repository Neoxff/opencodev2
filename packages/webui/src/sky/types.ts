/**
 * Ciel étoilé — contrat partagé entre le moteur, le worker et le repli.
 *
 * Les valeurs viennent de la consigne Build 12 (qui prime sur
 * `docs/design/20-ciel-etoile.md` là où elles diffèrent) :
 *   - fond `#000` pur, aucune dominante colorée ;
 *   - ~1 100 étoiles presque blanches, trois couches ;
 *   - scintillement lent, dérive 1–4 px/s, vignettage fort ;
 *   - AUCUNE étoile filante, AUCUNE nébuleuse colorée.
 */

/** Les trois niveaux du réglage, persistés dans `localStorage`. */
export type SkyMode = "on" | "static" | "off"

export const SKY_MODES: readonly SkyMode[] = ["on", "static", "off"] as const

/** Le fond, en pur noir — aucune autre valeur n'est autorisée pour le ciel. */
export const SKY_BG = "#000000"

/** Nombre d'étoiles à la résolution de référence (1920×1080). */
export const STAR_TARGET = 1100
export const REFERENCE_AREA = 1920 * 1080

/** Borne du delta de temps réel, en secondes (onglet qui reprend → pas de saut). */
export const MAX_DT = 0.05

export const TAU = Math.PI * 2

/**
 * Les trois couches : part, rayon, vitesse de dérive de base.
 * La vitesse effective est `speed * facteur(0,85–1,15)`, donc 1,02–3,80 px/s
 * pour la couche la plus rapide : la dérive reste dans la plage 1–4 px/s.
 */
export const LAYERS = [
  { share: 0.62, rMin: 0.4, rMax: 0.9, speed: 1.2, halo: false },
  { share: 0.3, rMin: 0.8, rMax: 1.4, speed: 2.1, halo: false },
  { share: 0.08, rMin: 1.4, rMax: 2.4, speed: 3.3, halo: true },
] as const

/**
 * Palette « presque blanche ». Chaque composante reste ≥ 235 : aucune teinte
 * bleue ou violette, aucune nébuleuse colorée — seulement des blancs très
 * légèrement nuancés, comme la maquette de référence.
 */
export const STAR_COLORS: readonly string[] = [
  "rgb(255,255,255)",
  "rgb(255,253,248)",
  "rgb(248,250,255)",
  "rgb(255,245,235)",
]

/** Période de scintillement (s) et amplitude, bornées comme dans la maquette. */
export const TWINKLE_PERIOD = { min: 2, max: 6 } as const
export const TWINKLE_AMPLITUDE = { min: 0.2, max: 0.6 } as const

/** Graine par défaut : le ciel est reproductible d'une image à l'autre. */
export const DEFAULT_SEED = 12345

/**
 * Nombre d'étoiles pour une surface donnée, borné à ~1 100.
 * À 1920×1080 on obtient exactement `STAR_TARGET`.
 */
export function starCount(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 0
  const area = (width * height) / REFERENCE_AREA
  return Math.min(STAR_TARGET, Math.max(120, Math.round(STAR_TARGET * area)))
}
