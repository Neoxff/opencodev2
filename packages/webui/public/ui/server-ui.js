/**
 * Feuille « Server » de la maquette /ui, sur données réelles.
 *
 * Aucun DOM, aucun CSS, aucun secret. Ce module ne lit que des routes ouvertes par le
 * serveur local : /global/health, /session/status et /mcp. Il ne garde que des champs
 * autorisés : état, version, origine/port, sessions actives, état du flux et noms/états
 * MCP. Les messages d'erreur MCP ne sortent jamais (ils peuvent porter des jetons).
 */

const MCP_STATES = new Set(["connected", "disabled", "failed", "needs_auth", "needs_client_registration"])

const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\bBearer\s+[A-Za-z0-9._-]{10,}/gi,
  /(api[_-]?key|token|secret|password|passwd|authorization)\s*[:=]\s*["']?[^"'\s]+/gi,
]

/** Version affichée : jetons éventuels remplacés, puis caractères autorisés seulement. */
function safeVersion(value) {
  let text = typeof value === "string" ? value : ""
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0
    text = text.replace(pattern, "[REDACTED]")
  }
  return text.replace(/[^0-9A-Za-z._+-\[\] REDACTED]/g, "").slice(0, 80) || "—"
}

function safeOrigin(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "http://127.0.0.1")
    const port = url.port || (url.protocol === "https:" ? "443" : "80")
    return { url: `${url.protocol}//${url.host}`, port }
  } catch {
    return { url: "—", port: "—" }
  }
}

/** Compte les sessions réellement actives : tout statut autre que `idle`. */
export function activeSessions(statuses) {
  if (!statuses || typeof statuses !== "object") return 0
  return Object.values(statuses).filter((s) => s && typeof s === "object" && s.type && s.type !== "idle").length
}

/** Ne garde que le nom et l'état MCP autorisé ; jamais `error`, jamais la configuration. */
export function sanitizeMcp(mcp) {
  if (!mcp || typeof mcp !== "object") return []
  return Object.entries(mcp)
    .filter(([name, info]) => name && info && typeof info === "object" && MCP_STATES.has(info.status))
    .map(([name, info]) => ({ name: String(name).slice(0, 80), status: info.status }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Projection opposable de l'état serveur. `origin` vient du navigateur, jamais d'un
 * fichier de configuration : aucune clé, aucun mot de passe, aucun chemin absolu.
 */
export function buildServerSnapshot(input = {}) {
  const health = input.health && typeof input.health === "object" ? input.health : {}
  const origin = safeOrigin(input.origin)
  const mcp = sanitizeMcp(input.mcp)
  return {
    state: health.healthy === true ? "healthy" : "unavailable",
    url: origin.url,
    port: origin.port,
    version: safeVersion(health.version),
    sessions: activeSessions(input.statuses),
    stream: input.streamConnected === true ? "connected" : "disconnected",
    mcp,
    mcpConnected: mcp.filter((x) => x.status === "connected").length,
  }
}

async function getJsonOptional(fetchImpl, path) {
  try {
    const response = await fetchImpl(path, { credentials: "same-origin" })
    if (!response.ok) return {}
    return await response.json()
  } catch {
    return {}
  }
}

/** Une seule passe réseau, trois routes indépendantes : une panne ne masque pas les autres. */
export async function loadServerSnapshot(fetchImpl = fetch, origin = globalThis.location?.origin, streamConnected = false) {
  const [health, statuses, mcp] = await Promise.all([
    getJsonOptional(fetchImpl, "/global/health"),
    getJsonOptional(fetchImpl, "/session/status"),
    getJsonOptional(fetchImpl, "/mcp"),
  ])
  return buildServerSnapshot({ health, statuses, mcp, origin, streamConnected })
}
