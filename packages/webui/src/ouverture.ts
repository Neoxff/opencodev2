/**
 * Logique pure de l'écran d'ouverture.
 *
 * Source visuelle validée : `docs/design/maquette-opencodev2-ui.html`, blocs
 * « Écran d'ouverture », `MOTTOS`, `nextIndex()` et `hello()`. Le prérequis
 * `docs/design/20-ouverture.md` est absent de ce dépôt : la maquette fait foi.
 *
 * Aucune fonction de ce module ne fait d'appel réseau. Le mot d'ordre est choisi
 * localement : index mémorisé dans `localStorage`, repli aléatoire si le stockage
 * est inaccessible (mode privé, quota, API absente).
 */

/** Clé de persistance de l'index, reprise telle quelle de la maquette. */
export const MOTTO_STORAGE_KEY = "oc2.motto"

/** Un mot d'ordre : la phrase affichée, puis sa description. */
export type Motto = readonly [string, string]

/** Les dix entrées de la maquette, dans l'ordre. */
export const MOTTOS: readonly Motto[] = [
  ["Fais-le bien, une étape à la fois.", "Un rapport, une preuve, puis on s’arrête."],
  ["Mesure d’abord, optimise ensuite.", "Ce qui n’est pas mesuré n’existe pas."],
  ["Noir profond, idées claires.", "Le vide est le meilleur des fonds."],
  ["Chaque étoile commence par un point.", "Ouvre une session, allume la première."],
  ["Petit commit, grand sommeil.", "Un thème par commit, jamais de force-push."],
  ["Là où l’idée devient du code.", "Dis l’intention, l’agent écrit le reste."],
  ["Fluide, sobre, précis.", "Les bons outils se font oublier."],
  ["Le silence avant la première ligne.", "Prends ton temps, le ciel ne bouge pas."],
  ["Pas de secret dans Git. Jamais.", "Ni dans les logs, ni dans les rapports."],
  ["Prêt quand tu l’es.", "Tout est local, tout est à toi."],
] as const

/** Le contrôle minimal dont la rotation a besoin — `Storage` sans le reste du DOM. */
export type MottoStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type MottoChoiceOptions = {
  /** Injecté par les tests ; défaut : `localStorage` du navigateur. */
  storage?: MottoStorage
  /** Injecté par les tests ; défaut : `Math.random`. */
  random?: () => number
}

/**
 * Index du mot d'ordre pour cette ouverture.
 *
 * Rotation séquentielle modulo 10, index écrit à chaque appel. Toute erreur
 * d'accès au stockage — y compris l'accès à `localStorage` lui-même — bascule
 * sur un tirage aléatoire borné. Une valeur illisible ou hors bornes bascule
 * également sur le tirage : un index invalide ne doit jamais faire afficher
 * une case vide.
 */
export function nextMottoIndex(options: MottoChoiceOptions = {}): number {
  const random = options.random ?? Math.random
  const count = MOTTOS.length
  let index: number

  try {
    const storage = options.storage ?? (globalThis.localStorage as MottoStorage)
    const previous = storage.getItem(MOTTO_STORAGE_KEY)
    index = (Number.parseInt(previous ?? "-1", 10) + 1) % count
    storage.setItem(MOTTO_STORAGE_KEY, String(index))
  } catch {
    index = Math.floor(random() * count)
  }

  if (!Number.isInteger(index) || index < 0 || index >= count) {
    index = Math.min(count - 1, Math.floor(random() * count))
  }
  return index
}

/** Le mot d'ordre retenu pour cette ouverture. */
export function mottoFor(options: MottoChoiceOptions = {}): Motto {
  return MOTTOS[nextMottoIndex(options)]!
}

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const
const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const

/**
 * Salut selon l'heure, suivi du jour et de la date en français (maquette `hello()`).
 * L'horloge est injectée : un test ne dépend ni de l'heure courante ni du fuseau
 * de la machine.
 */
export function salutation(now: Date): string {
  const hour = now.getHours()
  const greeting = hour < 5 ? "Bonne nuit" : hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir"
  return `${greeting} · ${JOURS[now.getDay()]} ${now.getDate()} ${MOIS[now.getMonth()]}`
}

/** Découpe la phrase en mots pour l'apparition échelonnée (maquette `.motto .w`). */
export function motsDuMotto(motto: string): string[] {
  return motto.trim().split(/\s+/).filter(Boolean)
}
