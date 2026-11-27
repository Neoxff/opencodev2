/**
 * Parité TUI ↔ /ui : projections pures et accès aux routes réelles.
 *
 * Aucun DOM, aucun CSS, aucun secret. En dehors de `?demo`, toutes les valeurs
 * affichées par la maquette doivent provenir d'ici : GET /mcp, GET /command,
 * GET /session, GET /session/:id/todo, GET /lsp, GET /vcs, GET /path,
 * GET /global/health. Les libellés et le regroupement suivent le TUI.
 */

import { goalFromSession, relativeTime, sessionActivityMap } from "./data.js"

const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}/gi,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/gi,
  /\bsk-[A-Za-z0-9_-]{20,}/gi,
  /\bBearer\s+[A-Za-z0-9._-]{10,}/gi,
  /(api[_-]?key|token|secret|password|passwd|authorization)\s*[:=]\s*["']?[^"'\s]+/gi,
]

export function redact(text) {
  let value = typeof text === "string" ? text : ""
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0
    value = value.replace(pattern, "[REDACTED]")
  }
  return value.slice(0, 240)
}

const LABELS = {
  connected: "Connected",
  disabled: "Disabled",
  failed: "Failed",
  needs_auth: "Needs auth",
  needs_client_registration: "Needs client ID",
}

/** Chaque entrée GET /mcp devient une ligne affichable ; rien d'autre n'est inventé. */
export function mcpRows(statuses) {
  if (!statuses || typeof statuses !== "object") return []
  return Object.entries(statuses)
    .filter(([name, info]) => name && info && typeof info === "object")
    .map(([name, info]) => {
      const status = typeof info.status === "string" ? info.status : "disabled"
      const error = redact(info.error)
      return {
        name: String(name).slice(0, 80),
        status,
        label: LABELS[status] || status,
        error: error && status !== "connected" && status !== "disabled" ? error : "",
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Compteur du panneau : connected/total, plus le nombre d'erreurs comme dans le TUI. */
export function mcpCounts(rows) {
  const list = Array.isArray(rows) ? rows : []
  const connected = list.filter((row) => row?.status === "connected").length
  const bad = list.filter((row) => row && !["connected", "disabled"].includes(row.status)).length
  return { connected, total: list.length, bad }
}

/** Commandes slash MCP : source serveur + filtrage par serveur encore présent dans GET /mcp. */
export function mcpCommands(commands, rows) {
  const list = Array.isArray(commands) ? commands : []
  const names = new Set((Array.isArray(rows) ? rows : []).map((row) => row?.name).filter(Boolean))
  return list
    .filter((command) => command && command.source === "mcp" && typeof command.name === "string")
    .filter((command) => {
      const name = command.name
      for (const server of names) {
        if (name === server || name.startsWith(server + ":") || name.startsWith(server + "_")) return true
      }
      return false
    })
    .map((command) => ({
      n: "/" + command.name,
      k: command.name,
      d: command.description || "mcp",
      tag: "mcp",
    }))
    .sort((a, b) => a.n.localeCompare(b.n))
}

function basename(path) {
  if (typeof path !== "string" || !path) return ""
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean)
  return parts[parts.length - 1] || ""
}

/** Regroupement TUI par dossier, pas par projet : label = basename, count = total. */
export function buildDirectoryWorkspaces(projects, sessions, statuses, maintenant = Date.now(), limite = 3) {
  const busy = sessionActivityMap(statuses)
  const folders = new Map()
  const projectDirs = Array.isArray(projects) ? projects.map((p) => p?.worktree || p?.directory).filter(Boolean) : []
  for (const dir of projectDirs) {
    const key = String(dir).replace(/\\/g, "/").toLowerCase()
    if (!folders.has(key)) folders.set(key, { key, dir, label: basename(dir) || "workspace", sessions: [] })
  }
  const sorted = [...(Array.isArray(sessions) ? sessions : [])]
    .filter((session) => session?.id)
    .sort((a, b) => (b?.time?.updated ?? b?.time?.created ?? 0) - (a?.time?.updated ?? a?.time?.created ?? 0))
  for (const session of sorted) {
    const dir = session.directory || session.path || "sessions"
    const key = String(dir).replace(/\\/g, "/").toLowerCase()
    if (!folders.has(key)) folders.set(key, { key, dir, label: basename(dir) || "workspace", sessions: [] })
    folders.get(key).sessions.push(session)
  }
  return [...folders.values()]
    .filter((folder) => folder.sessions.length)
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((folder, index) => {
      const list = folder.sessions
      const at = Math.max(...list.map((s) => s?.time?.updated ?? s?.time?.created ?? 0))
      return {
        n: folder.label,
        c: list.length,
        t: relativeTime(at, maintenant),
        open: index === 0,
        s: list.slice(0, limite).map((s) => ({
          id: s.id,
          t: s.title || s.slug || "untitled",
          m: relativeTime(s?.time?.updated ?? s?.time?.created ?? 0, maintenant),
          busy: busy[s.id] ? 1 : 0,
        })),
        more: Math.max(0, list.length - limite),
      }
    })
}

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 })

export function formatCost(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return "$0.00 (estimated)"
  return `${MONEY.format(n)} (estimated)`
}

function tokenCount(tokens) {
  if (!tokens || typeof tokens !== "object") return 0
  const sum = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0)
  return (
    sum(tokens.input) +
    sum(tokens.output) +
    sum(tokens.reasoning) +
    sum(tokens.cache?.read) +
    sum(tokens.cache?.write)
  )
}

/** Vue complète du panneau droit, dérivée des réponses serveur. */
export function buildPanelView(input = {}) {
  const session = input.session && typeof input.session === "object" ? input.session : {}
  const todos = Array.isArray(input.todos) ? input.todos : []
  const lsp = Array.isArray(input.lsp) ? input.lsp : []
  const health = input.health && typeof input.health === "object" ? input.health : {}
  const metrics = input.metrics && typeof input.metrics === "object" ? input.metrics : {}
  const goal = goalFromSession(session, todos)
  const used = Number.isFinite(metrics.used) ? metrics.used : tokenCount(session.tokens)
  const limit = Number(metrics.limit) || 1_048_576
  const percent = Number.isFinite(metrics.percent) ? metrics.percent : Math.round((used / limit) * 100)
  return {
    title: session.title || session.slug || "New session",
    context: {
      used,
      limit,
      percent: Math.min(100, Math.max(0, percent)),
      cost: session.cost ?? 0,
      costText: formatCost(session.cost),
    },
    goal,
    lsp: lsp.map((item) => ({ name: item?.name || item?.id || "lsp", status: item?.status || "disabled", root: item?.root || "" })),
    todos: todos.map((todo) => ({
      content: String(todo?.content ?? ""),
      status: String(todo?.status ?? "pending"),
    })),
    folder: basename(input.path?.directory || input.path?.worktree || session.directory),
    branch: String(input.vcs?.branch || ""),
    version: typeof health.version === "string" ? health.version : "",
  }
}

async function getJson(fetchImpl, path) {
  const response = await fetchImpl(path, { credentials: "same-origin" })
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}`)
  return response.json()
}

async function optional(fetchImpl, path, fallback) {
  try {
    return await getJson(fetchImpl, path)
  } catch {
    return fallback
  }
}

export async function loadParitySnapshot(fetchImpl = fetch, limite = 3) {
  const [statuses, commands, sessions, projects, statusMap] = await Promise.all([
    optional(fetchImpl, "/mcp", {}),
    optional(fetchImpl, "/command", []),
    optional(fetchImpl, "/session", []),
    optional(fetchImpl, "/project", []),
    optional(fetchImpl, "/session/status", {}),
  ])
  return {
    mcp: mcpRows(statuses),
    commands: mcpCommands(commands, mcpRows(statuses)),
    workspaces: buildDirectoryWorkspaces(projects, sessions, statusMap, Date.now(), limite),
  }
}

export async function loadPanelData(sessionID, fetchImpl = fetch, metrics = {}) {
  const enc = encodeURIComponent(sessionID || "")
  const [session, todos, lsp, vcs, path, health] = await Promise.all([
    sessionID ? optional(fetchImpl, `/session/${enc}`, {}) : Promise.resolve({}),
    sessionID ? optional(fetchImpl, `/session/${enc}/todo`, []) : Promise.resolve([]),
    optional(fetchImpl, "/lsp", []),
    optional(fetchImpl, "/vcs", {}),
    optional(fetchImpl, "/path", {}),
    optional(fetchImpl, "/global/health", {}),
  ])
  return buildPanelView({ session, todos, lsp, vcs, path, health, metrics })
}

/** Interrupteur réel : connecte ou déconnecte côté serveur puis relit l'état. */
export async function toggleMcp(name, connect, fetchImpl = fetch) {
  const suffix = connect ? "connect" : "disconnect"
  const response = await fetchImpl(`/mcp/${encodeURIComponent(name)}/${suffix}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: "{}",
  })
  if (!response.ok) throw new Error(`POST /mcp/${name}/${suffix} -> HTTP ${response.status}`)
  const statuses = await getJson(fetchImpl, "/mcp")
  return { rows: mcpRows(statuses), ok: true }
}

/** Feuille Server : état, URL/port, version, connexions, MCP, sans secret. */
export function buildServerSnapshot(input = {}) {
  const health = input.health && typeof input.health === "object" ? input.health : {}
  const rows = Array.isArray(input.rows)
    ? input.rows
    : Array.isArray(input.mcp)
      ? mcpRows(input.mcp)
      : []
  const counts = mcpCounts(rows)
  let origin = {}
  try {
    const url = new URL(input.origin || "http://127.0.0.1")
    origin = { url: url.origin, port: url.port || (url.protocol === "https:" ? "443" : "80") }
  } catch {
    origin = { url: "—", port: "—" }
  }
  return {
    state: health.healthy === true ? "healthy" : "unavailable",
    url: origin.url,
    port: origin.port,
    version: redact(health.version || "") || "—",
    sessions: Object.values(input.statuses || {}).filter((s) => s && s.type && s.type !== "idle").length,
    mcp: counts,
    rows,
  }
}

export async function loadServerSnapshot(fetchImpl = fetch, origin = globalThis.location?.origin) {
  const [health, statuses, mcpStatus] = await Promise.all([
    optional(fetchImpl, "/global/health", {}),
    optional(fetchImpl, "/session/status", {}),
    optional(fetchImpl, "/mcp", {}),
  ])
  return buildServerSnapshot({ health, statuses, rows: mcpRows(mcpStatus), origin })
}
