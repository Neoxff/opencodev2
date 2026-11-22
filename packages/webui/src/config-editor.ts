/**
 * Config Editor — la couche pure, testable hors navigateur.
 *
 * Deux garanties tenues ici, avant tout rendu :
 *
 *   1. **Aucun secret n'entre dans l'éditeur.** La configuration lue sur `/global/config` porte
 *      des clés de fournisseurs en clair (mesuré ailleurs dans le dépôt : 7 champs `key`/`apiKey`
 *      et des chaînes `sk-…` sur `/config/providers`). `maskConfig` projette la charge avant qu'elle
 *      n'atteigne un signal, donc avant le DOM, un journal ou une infobulle.
 *   2. **Aucun secret ne ressort.** `buildConfigPatch` écarte les clés secrètes et toute valeur
 *      masquée : enregistrer l'éditeur ne peut pas écraser une clé réelle avec le masque.
 *
 * Les données sont celles du serveur : c'est `GET /global/config` qui est édité, et `PATCH
 * /global/config` qui écrit. Les clés de liaison (`repo`, `defaultBranch`, `port`, `workspace`) sont
 * validées avec les **mêmes règles** que `script/link-config.ts` — elles ne sont pas inventées ici.
 *
 * Langue : libellés d'écran en anglais (langue source de la copie d'interface), commentaires en
 * français, comme le reste du dépôt.
 */

export const SECRET_MASK = "••••••••"

export type JsonObject = Record<string, unknown>
export type ValidationIssue = { path: string; message: string }

/** Une clé dont la valeur ne doit jamais être lue à l'écran. */
export function isSecretKey(key: string): boolean {
  return /(key|token|secret|password|passwd|credential|authorization)/i.test(key)
}

/** Jetons et clés reconnus dans un texte libre (journaux inclus). */
const SECRET_VALUES: RegExp[] = [
  /sk-[A-Za-z0-9_-]{12,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /eyJ[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}/g,
]

/** Masque les secrets présents dans un message, quelle que soit leur origine. */
export function redactText(text: string): string {
  let out = text
  for (const pattern of SECRET_VALUES) out = out.replace(pattern, SECRET_MASK)
  return out
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Projet une configuration lue en une configuration **affichable**.
 * Nouvel objet : la charge d'origine n'est jamais conservée dans un signal.
 */
export function maskConfig(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskConfig)
  if (isObject(value)) {
    const out: JsonObject = {}
    for (const [key, entry] of Object.entries(value)) {
      out[key] = isSecretKey(key) ? SECRET_MASK : maskConfig(entry)
    }
    return out
  }
  return typeof value === "string" ? redactText(value) : value
}

/** La configuration masquée, sous forme de texte éditable. */
export function configSource(value: unknown): string {
  const masked = maskConfig(value)
  return JSON.stringify(masked ?? {}, null, 2)
}

/** Parse le texte édité. Une erreur est un texte lisible, jamais une exception. */
export function parseConfigText(text: string): { value?: JsonObject; error?: string } {
  if (!text.trim()) return { value: {} }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { error: `JSON invalide : ${(error as Error).message}` }
  }
  if (!isObject(parsed)) return { error: "la configuration doit être un objet JSON" }
  return { value: parsed }
}

/* Règles reprises telles quelles de `script/link-config.ts` — pas de divergence. */
const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/
const BRANCH_RE = /^(?!-)(?!.*\.\.)(?!.*[@\\^~:?*\s])[A-Za-z0-9](?:[A-Za-z0-9_.\/-]*[A-Za-z0-9])?$/

function modelValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0
  if (!isObject(value)) return false
  return typeof value.providerID === "string" && typeof value.modelID === "string"
}

/**
 * Valide les valeurs éditées, clé par clé. Les clés inconnues sont laissées au serveur : leur
 * schéma est la source de vérité, et une liste locale se périmerait au premier ajout.
 */
export function validateConfig(value: JsonObject): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const check = (path: string, ok: boolean, message: string) => {
    if (!ok) issues.push({ path, message })
  }

  if ("repo" in value) {
    check("repo", typeof value.repo === "string" && REPO_RE.test(value.repo), "format attendu : owner/repo")
  }
  if ("defaultBranch" in value || "branch" in value) {
    const path = "defaultBranch" in value ? "defaultBranch" : "branch"
    check(path, typeof value[path] === "string" && BRANCH_RE.test(value[path]), "nom de branche git invalide")
  }
  if ("port" in value) {
    check(
      "port",
      typeof value.port === "number" && Number.isInteger(value.port) && value.port >= 1 && value.port <= 65535,
      "entier entre 1 et 65535",
    )
  }
  if ("workspace" in value) {
    const workspace = value.workspace
    check(
      "workspace",
      typeof workspace === "string" &&
        workspace.length > 0 &&
        !workspace.includes("\0") &&
        !/^\//.test(workspace) &&
        !/^[A-Za-z]:[\\/]/.test(workspace) &&
        !workspace.split(/[\\/]/).includes(".."),
      "chemin relatif non vide, sans '..'",
    )
  }
  for (const key of ["model", "small_model"]) {
    if (key in value) check(key, modelValue(value[key]), "format attendu : provider/model")
  }
  if ("mcp" in value) {
    const mcp = value.mcp
    check("mcp", isObject(mcp), "la carte mcp doit être un objet")
    if (isObject(mcp) && "max_sessions" in mcp) {
      const max = mcp.max_sessions
      check(
        "mcp.max_sessions",
        typeof max === "number" && Number.isInteger(max) && max > 0,
        "entier positif",
      )
    }
  }
  if ("daemon" in value) {
    const daemon = value.daemon
    check("daemon", isObject(daemon), "le bloc daemon doit être un objet")
    if (isObject(daemon) && "autostart" in daemon) {
      check("daemon.autostart", typeof daemon.autostart === "boolean", "booléen attendu")
    }
  }
  if ("autoGit" in value) check("autoGit", typeof value.autoGit === "boolean", "booléen attendu")
  if ("sky" in value) check("sky", typeof value.sky === "string", "chaîne attendue")
  if ("glass" in value) {
    check("glass", typeof value.glass === "boolean" || value.glass === "on" || value.glass === "off", "booléen ou on/off attendu")
  }

  // Un secret réellement saisi n'est pas éditable ici : on ne l'affiche pas et on ne l'écrit pas.
  for (const [key, value2] of Object.entries(value)) {
    if (isSecretKey(key) && typeof value2 === "string" && value2 !== SECRET_MASK && !value2.includes(SECRET_MASK)) {
      issues.push({ path: key, message: "les secrets ne peuvent pas être édités ici" })
    }
  }
  return issues
}

/**
 * Vrai si une valeur contient, à n'importe quelle profondeur, une clé secrète ou le masque.
 *
 * Une branche entière est écartée dès qu'elle contient un secret : réécrire un objet parent
 * amputé de sa clé secrète pourrait **effacer** la vraie clé côté serveur (la fusion n'est pas
 * garantie pour chaque carte), et réécrire le masque écraserait la clé avec des points. Le
 * navigateur ne connaît de toute façon pas la vraie valeur — seul le choix sûr est de ne pas
 * toucher à la branche. C'est le prix assumé : un réglage non secret voisin d'un secret dans la
 * même branche n'est pas écrit depuis cet éditeur (la feuille « réglages » reste la voie pour
 * ces cartes structurées).
 */
function hasSecretContent(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSecretContent)
  if (isObject(value)) {
    return Object.entries(value).some(
      ([key, entry]) =>
        isSecretKey(key) ||
        (typeof entry === "string" && entry.includes(SECRET_MASK)) ||
        hasSecretContent(entry),
    )
  }
  return typeof value === "string" && value.includes(SECRET_MASK)
}

/**
 * Construit le patch à écrire. Ne part que ce qui a changé et n'est pas un secret — un patch
 * partiel fusionne côté serveur, donc n'écrire que le nécessaire est sûr.
 */
export function buildConfigPatch(
  draft: JsonObject,
  original: JsonObject,
): { patch: JsonObject; skipped: string[] } {
  const patch: JsonObject = {}
  const skipped: string[] = []
  for (const [key, value] of Object.entries(draft)) {
    if (isSecretKey(key) || hasSecretContent(value)) {
      skipped.push(key)
      continue
    }
    if (JSON.stringify(value) === JSON.stringify(original[key])) continue
    patch[key] = value
  }
  return { patch, skipped }
}

/* =============================================================================
   Journal — projection des événements réels du flux SSE.
   ============================================================================= */

export type LogEntry = { at: number; type: string; note?: string }
export type LogLevel = "info" | "warn" | "error" | "debug"
export type LogRow = { key: string; time: string; level: LogLevel; source: string; message: string }

const ERROR_PARTS = ["error", "fail", "reject", "denied"]
const WARN_PARTS = ["permission", "question", "warn", "abort", "compact"]
const DEBUG_PARTS = ["delta", "part", "heartbeat", "connected", "status"]

export function logLevel(type: string): LogLevel {
  const lower = type.toLowerCase()
  if (ERROR_PARTS.some((part) => lower.includes(part))) return "error"
  if (WARN_PARTS.some((part) => lower.includes(part))) return "warn"
  if (DEBUG_PARTS.some((part) => lower.includes(part))) return "debug"
  return "info"
}

/** La source est le préfixe du type serveur (`session.*` → `session`), jamais une traduction. */
export function logSource(type: string): string {
  return type.split(".")[0] || "server"
}

/** Horodatage UTC stable, identique en navigateur et sous Vitest. */
export function formatLogTime(at: number): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return "--:--:--"
  return date.toISOString().slice(11, 19)
}

/** Un événement réel devient une ligne — le message est toujours redacté. */
export function logRow(entry: LogEntry, index: number): LogRow {
  const type = typeof entry.type === "string" && entry.type ? entry.type : "unknown"
  const note = typeof entry.note === "string" && entry.note ? ` · ${entry.note}` : ""
  return {
    key: `${entry.at}-${index}-${type}`,
    time: formatLogTime(entry.at),
    level: logLevel(type),
    source: logSource(type),
    message: redactText(`${type}${note}`),
  }
}
