/**
 * Accès aux données réelles de la barre latérale pour la maquette /ui.
 *
 * Ce module ne touche ni au DOM ni au CSS. Il expose les mêmes formes que les
 * constantes de la maquette :
 *   WS = [{ n, t, open, s: [{ id, t, m, busy }], more }]
 *
 * Sources : GET /project, GET /session, GET /session/status.
 */

import { buildConversation, goalFromSession, queuedUserIDs } from "./conversation.js"

export * from "./conversation.js"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const RELATIVE_LIMIT = 7 * DAY

/** Libellé court identique à celui de la maquette : now, 5m, 33m, 1h, 3d, dd/mm. */
export function relativeTime(timestamp, maintenant = Date.now()) {
  if (!Number.isFinite(timestamp)) return ""
  const ecart = maintenant - timestamp
  if (ecart < MINUTE) return "now"
  if (ecart < HOUR) return `${Math.floor(ecart / MINUTE)}m`
  if (ecart < DAY) return `${Math.floor(ecart / HOUR)}h`
  if (ecart <= RELATIVE_LIMIT) return `${Math.floor(ecart / DAY)}d`
  const date = new Date(timestamp)
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`
}

/** Une session est active dès que son statut n'est pas `idle` (`retry` inclus). */
export function sessionActivityMap(statuses) {
  if (!statuses || typeof statuses !== "object") return {}
  const result = {}
  for (const [id, info] of Object.entries(statuses)) {
    if (info && typeof info === "object" && info.type !== "idle") result[id] = true
  }
  return result
}

function timestamp(info) {
  return info?.time?.updated ?? info?.time?.created
}

function basename(path) {
  if (typeof path !== "string" || !path) return ""
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? ""
}

/**
 * Construit les workspaces de la maquette à partir des trois réponses HTTP.
 * `limite` est le nombre de sessions affichées par workspace ; le reste alimente `more`.
 */
export function buildWorkspaces(projects, sessions, statuses, maintenant = Date.now(), limite = 9) {
  const busy = sessionActivityMap(statuses)
  const projets = Array.isArray(projects) ? projects : []
  const sessionsReelles = Array.isArray(sessions) ? sessions : []
  const workspaces = new Map()

  for (const project of projets) {
    if (!project?.id) continue
    workspaces.set(project.id, {
      n: project.name || basename(project.worktree) || basename(project.directory) || "workspace",
      t: "now",
      open: false,
      s: [],
      more: 0,
      _updated: timestamp(project) ?? 0,
    })
  }

  const triees = [...sessionsReelles].sort((a, b) => (timestamp(b) ?? 0) - (timestamp(a) ?? 0))
  for (const session of triees) {
    if (!session?.id) continue
    const cle = session.projectID || basename(session.directory) || "sessions"
    if (!workspaces.has(cle)) {
      workspaces.set(cle, {
        n: basename(session.directory) || "sessions",
        t: "now",
        open: false,
        s: [],
        more: 0,
        _updated: 0,
      })
    }
    const workspace = workspaces.get(cle)
    const at = timestamp(session) ?? 0
    workspace._updated = Math.max(workspace._updated, at)
    if (workspace.s.length < limite) {
      workspace.s.push({
        id: session.id,
        t: session.title || session.slug || "New session",
        m: relativeTime(at, maintenant),
        busy: busy[session.id] ? 1 : 0,
      })
    } else {
      workspace.more += 1
    }
  }

  return [...workspaces.values()]
    .sort((a, b) => b._updated - a._updated)
    .map((workspace, index) => {
      const { _updated, ...shape } = workspace
      shape.t = relativeTime(_updated, maintenant)
      shape.open = index === 0
      return shape
    })
}

async function getJson(fetchImpl, path) {
  const response = await fetchImpl(path, { credentials: "same-origin" })
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}`)
  return response.json()
}

/** Charge les trois routes et retourne directement WS au format maquette. */
export async function loadSidebarData(fetchImpl = fetch, maintenant = Date.now(), limite = 9) {
  const [projects, sessions, statuses] = await Promise.all([
    getJson(fetchImpl, "/project"),
    getJson(fetchImpl, "/session"),
    getJson(fetchImpl, "/session/status"),
  ])
  return buildWorkspaces(projects, sessions, statuses, maintenant, limite)
}

/** Crée une vraie session via POST /session. */
export async function createSession(fetchImpl = fetch, payload = {}) {
  const response = await fetchImpl("/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`POST /session -> HTTP ${response.status}`)
  return response.json()
}

function textOf(message) {
  if (!Array.isArray(message.parts)) return ""
  return message.parts
    .filter((part) => part?.type === "text" && !part.ignored && !part.synthetic)
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n")
}

/** Ouvre une vraie session : détail + messages utiles, sans injection HTML. */
export async function loadSession(sessionID, fetchImpl = fetch) {
  const [session, messages] = await Promise.all([
    getJson(fetchImpl, `/session/${encodeURIComponent(sessionID)}`),
    getJson(fetchImpl, `/session/${encodeURIComponent(sessionID)}/message`),
  ])
  return {
    session,
    messages: (Array.isArray(messages) ? messages : [])
      .map((message) => ({ role: message?.info?.role ?? "assistant", text: textOf(message) }))
      .filter((message) => message.text),
  }
}

async function getJsonOptional(fetchImpl, path, fallback) {
  try {
    return await getJson(fetchImpl, path)
  } catch {
    return fallback
  }
}

/**
 * Charge tout ce dont la conversation a besoin : session, messages, diff, statut
 * et todos. Les lignes maquette sont déjà construites par `conversation.js`.
 */
export async function loadConversation(sessionID, fetchImpl = fetch) {
  const enc = encodeURIComponent(sessionID)
  const [session, messages, diffs, statuses, todos] = await Promise.all([
    getJson(fetchImpl, `/session/${enc}`),
    getJson(fetchImpl, `/session/${enc}/message`),
    getJsonOptional(fetchImpl, `/session/${enc}/diff`, []),
    getJsonOptional(fetchImpl, "/session/status", {}),
    getJsonOptional(fetchImpl, `/session/${enc}/todo`, []),
  ])
  const messageList = Array.isArray(messages) ? messages : []
  const status = statuses?.[sessionID]
  const busy = Boolean(status && status.type !== "idle")
  const roles = {}
  for (const message of messageList) {
    if (message?.info?.id && message?.info?.role) roles[message.info.id] = message.info.role
  }
  const queued = queuedUserIDs(messageList, busy)
  const lines = buildConversation(messageList, diffs, { sessionID, roles, queued, busy })
  return {
    session,
    messages: messageList,
    diffs: Array.isArray(diffs) ? diffs : [],
    status,
    busy,
    roles,
    queued,
    goal: goalFromSession(session, todos),
    lines,
  }
}

/** Envoie une vraie consigne ; le flux d'événements se chargera de l'afficher. */
export async function sendPrompt(sessionID, text, fetchImpl = fetch) {
  const response = await fetchImpl(`/session/${encodeURIComponent(sessionID)}/prompt_async`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ parts: [{ type: "text", text }] }),
  })
  if (!response.ok) throw new Error(`POST /session/${encodeURIComponent(sessionID)}/prompt_async -> HTTP ${response.status}`)
  return { ok: true }
}
