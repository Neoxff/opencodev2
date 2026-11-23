/**
 * Accès aux données réelles pour l'onglet Config, le journal de session et les
 * raccourcis clavier de la maquette /ui.
 *
 * Aucun DOM, aucun CSS, aucun secret : le module est purement fonctionnel.
 * Les champs de configuration autorisés sont une liste blanche ; tout le reste
 * (provider, mcp, jev, server, agent, plugin…) est écarté avant affichage ou
 * écriture. Les textes de journal sont nettoyés avant rendu.
 */

export const SAFE_CONFIG_FIELDS = [
  "shell",
  "logLevel",
  "snapshot",
  "share",
  "autoupdate",
  "model",
  "small_model",
  "default_agent",
  "username",
  "disabled_providers",
  "enabled_providers",
]

const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\bBearer\s+[A-Za-z0-9._-]{10,}/gi,
  /(api[_-]?key|token|secret|password|passwd|authorization)\s*[:=]\s*["'][^"']+["']/gi,
]

export function redactSecrets(value) {
  if (typeof value !== "string") return value
  let out = value
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0
    out = out.replace(pattern, (match) => {
      const assignment = /^(api[_-]?key|token|secret|password|passwd|authorization)\s*[:=]\s*/i.exec(match)
      return assignment ? `${assignment[0]}"[REDACTED]"` : "[REDACTED]"
    })
  }
  return out
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Ne garde que les champs sûrs, avec masquage défensif des chaînes. */
export function sanitizeConfig(config) {
  const source = config && typeof config === "object" ? config : {}
  const safe = {}
  for (const field of SAFE_CONFIG_FIELDS) {
    if (!(field in source)) continue
    const value = source[field]
    if (Array.isArray(value)) {
      safe[field] = value.map((item) => redactSecrets(typeof item === "string" ? item : String(item)))
    } else if (typeof value === "string" || typeof value === "boolean") {
      safe[field] = redactSecrets(value)
    }
  }
  return safe
}

export function configToJson(config) {
  return JSON.stringify(sanitizeConfig(config), null, 2)
}

const ENUMS = {
  logLevel: ["DEBUG", "INFO", "WARN", "ERROR"],
  share: ["manual", "auto", "disabled"],
}
const BOOLEANS = new Set(["snapshot", "autoupdate"])
const STRING_ARRAYS = new Set(["disabled_providers", "enabled_providers"])
const STRINGS = new Set(["shell", "model", "small_model", "default_agent", "username"])

/**
 * Valide un texte JSON édité. Retourne `{ ok, value, error }`.
 * Une clé hors liste blanche est refusée : aucun secret ne peut être réécrit.
 */
export function validateConfigPatch(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: "JSON invalide" }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "La configuration doit être un objet" }
  }
  const value = {}
  for (const [key, entry] of Object.entries(parsed)) {
    if (!SAFE_CONFIG_FIELDS.includes(key)) {
      return { ok: false, error: `Clé non autorisée : ${key}` }
    }
    if (ENUMS[key] && !ENUMS[key].includes(entry)) {
      return { ok: false, error: `${key} doit valoir ${ENUMS[key].join(", ")}` }
    }
    if (BOOLEANS.has(key) && key === "autoupdate" && entry === "notify") {
      value[key] = entry
      continue
    }
    if (BOOLEANS.has(key) && typeof entry !== "boolean") {
      return { ok: false, error: `${key} doit être un booléen` }
    }
    if (STRING_ARRAYS.has(key) && (!Array.isArray(entry) || entry.some((x) => typeof x !== "string"))) {
      return { ok: false, error: `${key} doit être une liste de chaînes` }
    }
    if (STRINGS.has(key) && typeof entry !== "string") {
      return { ok: false, error: `${key} doit être une chaîne` }
    }
    value[key] = entry
  }
  return { ok: true, value }
}

async function getJson(fetchImpl, path) {
  const response = await fetchImpl(path, { credentials: "same-origin" })
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}`)
  return response.json()
}

export async function loadConfig(fetchImpl = fetch) {
  return sanitizeConfig(await getJson(fetchImpl, "/config"))
}

export async function updateConfig(patch, fetchImpl = fetch) {
  const checked = validateConfigPatch(typeof patch === "string" ? patch : JSON.stringify(patch))
  if (!checked.ok) throw new Error(checked.error)
  const response = await fetchImpl("/config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(checked.value),
  })
  if (!response.ok) throw new Error(`PATCH /config -> HTTP ${response.status}`)
  return sanitizeConfig(await response.json())
}

function timeOf(info, fallback) {
  const raw = info?.time?.created ?? info?.time?.updated ?? fallback
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return "--:--:--"
  return date.toISOString().slice(11, 19)
}

function textOf(message) {
  if (!Array.isArray(message?.parts)) return ""
  return message.parts
    .filter((part) => part?.type === "text" && !part.ignored && !part.synthetic)
    .map((part) => redactSecrets(String(part.text ?? "")))
    .filter(Boolean)
    .join(" ")
}

/** Construit les lignes du journal à partir des vrais messages, sans secret. */
export function formatLogLines(messages, statuses, sessionID, maintenant = Date.now()) {
  const list = Array.isArray(messages) ? messages : []
  const status = statuses && typeof statuses === "object" ? statuses[sessionID]?.type || "idle" : "idle"
  const lines = [
    `${timeOf({}, maintenant)} <i>info</i>  session ${escapeHtml(redactSecrets(sessionID))} · status ${escapeHtml(status)}`,
  ]
  for (const message of list.slice(-40)) {
    const role = message?.info?.role || "assistant"
    const text = textOf(message).slice(0, 320)
    if (!text) continue
    lines.push(`${timeOf(message?.info, maintenant)} <i>${escapeHtml(role)}</i>  ${escapeHtml(text)}`)
  }
  return lines
}

export async function loadSessionLog(sessionID, fetchImpl = fetch) {
  const enc = encodeURIComponent(sessionID)
  const [messages, statuses] = await Promise.all([
    getJson(fetchImpl, `/session/${enc}/message`),
    getJson(fetchImpl, "/session/status").catch(() => ({})),
  ])
  return formatLogLines(messages, statuses, sessionID)
}

/** Décision clavier pure : aucune action ici, seulement le nom de l'action. */
export function keyboardDecision(event, state = {}) {
  const key = event?.key
  if (!key) return "ignore"
  const lower = key.toLowerCase()
  const ctrl = Boolean(event.ctrlKey || event.metaKey)
  const alt = Boolean(event.altKey)
  if (ctrl && lower === "p") return "palette"
  if (alt && lower === "n") return "new"
  if (ctrl && lower === "s" && state.configEditing) return "save-config"
  if (ctrl && lower === "r" && state.hasSelection) return "rename"
  if (ctrl && lower === "d" && state.hasSelection) return "delete"
  if (key === "Escape") return state.running ? "interrupt" : "ignore"
  if (key === "Enter" && !event.shiftKey) return state.running ? "queue" : "send"
  if (alt && lower === "s") return state.canSteer ? "steer" : "unsupported"
  return "ignore"
}

export function steerSupported(doc, health) {
  const schemas = doc?.components?.schemas || {}
  const metadata = schemas.TextPartInput?.properties?.metadata
  const schemaOk = Boolean(metadata && metadata.type === "object")
  const version = typeof health?.version === "string" ? health.version : ""
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  const versionOk = match
    ? Number(match[1]) > 2 || (Number(match[1]) === 2 && Number(match[2]) >= 4)
    : health?.healthy === true
  return schemaOk && versionOk
}

export async function loadCapabilities(fetchImpl = fetch) {
  const [doc, health] = await Promise.all([
    getJson(fetchImpl, "/doc").catch(() => ({})),
    getJson(fetchImpl, "/global/health").catch(() => ({})),
  ])
  return { canSteer: steerSupported(doc, health) }
}

export function buildPromptPayload(text, options = {}) {
  const part = { type: "text", text }
  if (options.steer) part.metadata = { steer: true }
  const payload = { parts: [part] }
  if (options.agent) payload.agent = options.agent
  if (options.model) payload.model = options.model
  if (options.variant) payload.variant = options.variant
  return payload
}

export async function sendPrompt(sessionID, payload, fetchImpl = fetch) {
  const response = await fetchImpl(`/session/${encodeURIComponent(sessionID)}/prompt_async`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`POST /session/${sessionID}/prompt_async -> HTTP ${response.status}`)
  return { ok: true }
}

export async function renameSession(sessionID, title, fetchImpl = fetch) {
  const response = await fetchImpl(`/session/${encodeURIComponent(sessionID)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ title }),
  })
  if (!response.ok) throw new Error(`PATCH /session/${sessionID} -> HTTP ${response.status}`)
  return response.json()
}

export async function deleteSession(sessionID, fetchImpl = fetch) {
  const response = await fetchImpl(`/session/${encodeURIComponent(sessionID)}`, {
    method: "DELETE",
    credentials: "same-origin",
  })
  if (!response.ok) throw new Error(`DELETE /session/${sessionID} -> HTTP ${response.status}`)
  return { ok: true }
}

export async function abortSession(sessionID, fetchImpl = fetch) {
  const response = await fetchImpl(`/session/${encodeURIComponent(sessionID)}/abort`, {
    method: "POST",
    credentials: "same-origin",
  })
  if (!response.ok) throw new Error(`POST /session/${sessionID}/abort -> HTTP ${response.status}`)
  return { ok: true }
}
