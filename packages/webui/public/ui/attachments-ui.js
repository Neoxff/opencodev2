/**
 * Pièces jointes du composeur de la maquette /ui.
 *
 * Contrat déjà utilisé par le serveur : une pièce est `{ type: "file", mime, filename, url }`
 * où `url` est une data URL construite par FileReader dans le navigateur. Ce module reste
 * pur : il ne touche ni au DOM ni au CSS. Il ne garde que le **nom de base** du fichier :
 * jamais son chemin absolu, jamais rien d'autre que le fichier choisi.
 */

const LIMITS = {
  "image/": 5 * 1024 * 1024,
  "application/pdf": 10 * 1024 * 1024,
  "text/": 1 * 1024 * 1024,
}
const DEFAULT_LIMIT = 2 * 1024 * 1024

/** Types refusés explicitement : exécutables, scripts, archives et types inconnus. */
const REFUSED = [
  /^application\/x-/,
  /^application\/octet-stream$/,
  /^application\/zip$/,
  /^application\/.*compressed$/,
  /^application\/javascript$/,
  /^text\/javascript$/,
]

/** Nom de base uniquement : un chemin Windows ou POSIX est réduit à son dernier segment. */
export function basename(name) {
  return String(name ?? "").split(/[\\/]/).filter(Boolean).pop() || "file"
}

/** Borne applicable : le préfixe le plus long gagne, `image/` primant sur le défaut. */
export function attachmentMaxBytes(mime) {
  const text = typeof mime === "string" ? mime : ""
  const match = Object.keys(LIMITS)
    .filter((prefix) => text.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0]
  return match ? LIMITS[match] : DEFAULT_LIMIT
}

/** Taille lisible, arrondie au dixième. */
export function fileSizeLabel(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value < 1024) return `${Math.max(0, Math.round(value))} B`
  const units = ["kB", "MB", "GB"]
  let n = value / 1024
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i += 1
  }
  return `${Math.round(n * 10) / 10} ${units[i]}`
}

/**
 * Refuse un fichier avant toute lecture. Renvoie un message prêt à afficher, ou
 * `undefined` si le fichier peut être joint.
 */
export function validateFile(file) {
  const mime = typeof file?.type === "string" ? file.type : ""
  const name = basename(file?.name)
  if (!mime) return `Type inconnu pour « ${name} »`
  if (REFUSED.some((pattern) => pattern.test(mime))) return `Type refusé : ${mime} (${name})`
  const max = attachmentMaxBytes(mime)
  if (Number(file?.size) > max) return `« ${name} » dépasse ${fileSizeLabel(max)}`
  return undefined
}

/** Partie envoyée avec le message : pas d'identifiant inventé, pas de chemin, pas de métadonnées. */
export function buildFilePart(file) {
  return {
    type: "file",
    mime: typeof file?.mime === "string" && file.mime ? file.mime : "application/octet-stream",
    filename: basename(file?.filename ?? file?.name),
    url: typeof file?.dataUrl === "string" ? file.dataUrl : "",
  }
}
