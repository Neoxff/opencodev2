/**
 * Commandes d'interface — données réelles, hors DEMO.
 *
 * Ce module est la contrepartie "static UI" de `src/ui-commands*.ts` : la maquette ne peut pas
 * importer de TypeScript, donc toute la logique pure qui transforme une réponse du serveur en
 * ligne affichable vit ici. Aucun DOM, aucun CSS, aucun secret. Chaque accès réseau passe par un
 * `fetchImpl` injectable (par défaut `fetch`) pour être testable sans serveur.
 *
 * Les deux seules écritures de configuration autorisées ici sont des chemins de modèle :
 * `jev.decision_model` et `attachment.image.vision_model` (le champ documenté de repli image).
 * Elles ne sont **pas** ajoutées à `SAFE_CONFIG_FIELDS` de config-logs.js : l'éditeur de config
 * reste limité à ses champs, et ce module a sa propre liste blanche, plus étroite.
 */

/** Chemins de configuration qu'une commande peut écrire. Aucune clé secrète, aucun MCP, aucun provider. */
export const WRITABLE_MODEL_PATHS = ["jev.decision_model", "attachment.image.vision_model"]

/** Raccourcis réels de l'application — repris de la maquette. */
export const HELP_KEYS = [
  ["/", "commands"],
  ["@", "tag files or sessions"],
  ["ctrl+p", "command palette"],
  ["alt+n", "new session"],
  ["ctrl+r", "rename session"],
  ["ctrl+d", "delete session"],
  ["esc", "interrupt"],
  ["enter", "queue (while running)"],
  ["alt+s", "steer"],
]

/** Thèmes noirs de la maquette : libellé → valeur `data-th`. */
export const THEME_VALUES = [
  ["Noir pur", ""],
  ["Noir contraste élevé", "contrast"],
  ["Noir chaud", "warm"],
]

const jsonHeaders = { "content-type": "application/json" }

async function getJson(fetchImpl, path) {
  const response = await fetchImpl(path, { credentials: "same-origin" })
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}`)
  return response.json()
}

async function post(fetchImpl, path) {
  const response = await fetchImpl(path, { method: "POST", credentials: "same-origin" })
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}`)
  return response.json().catch(() => ({}))
}

export function asArray(value) {
  return Array.isArray(value) ? value : []
}

export function text(value) {
  return typeof value === "string" ? value : ""
}

/** Lecture d'une clé pointée, sans jamais traverser un prototype. */
export function configValue(config, dotted) {
  let node = config
  for (const part of String(dotted).split(".")) {
    if (!node || typeof node !== "object" || !Object.prototype.hasOwnProperty.call(node, part)) return undefined
    node = node[part]
  }
  return node
}

/* ---------- /agents, /models, /variants ---------- */

export function agentRows(agents) {
  return asArray(agents)
    .filter((a) => a && typeof a === "object" && typeof a.name === "string" && a.name)
    .filter((a) => a.mode !== "subagent" && a.hidden !== true)
    .map((a) => ({ value: a.name, label: a.name, detail: String(a.description || "").replace(/\s+/g, " ").trim().slice(0, 90) }))
}

/** Les fournisseurs réels de `/provider` → identifiants `provider/model`. */
export function providerPayloads(payload) {
  const all = asArray(payload?.all).concat(asArray(payload?.providers))
  return all.filter((p) => p && typeof p === "object" && typeof p.id === "string")
}

export function modelRows(payload) {
  const rows = []
  for (const provider of providerPayloads(payload)) {
    const models = provider.models && typeof provider.models === "object" ? provider.models : {}
    for (const id of Object.keys(models)) {
      const model = models[id]
      rows.push({
        value: `${provider.id}/${id}`,
        label: `${provider.id}/${id}`,
        detail: text(model?.name) || text(provider.name) || provider.id,
      })
    }
  }
  return rows.sort((a, b) => a.value.localeCompare(b.value))
}

/** Variantes réelles d'un modèle, dans `/provider` ou `/config/providers`. */
export function variantsForModel(payload, model) {
  if (typeof model !== "string") return []
  const cut = model.indexOf("/")
  if (cut <= 0) return []
  const providerID = model.slice(0, cut)
  const modelID = model.slice(cut + 1)
  for (const provider of providerPayloads(payload)) {
    if (provider.id !== providerID) continue
    const target = provider.models?.[modelID]
    const variants = target?.variants
    if (!variants || typeof variants !== "object" || Array.isArray(variants)) return []
    return Object.keys(variants).sort()
  }
  return []
}

export function variantRows(names, current) {
  return asArray(names)
    .filter((n) => typeof n === "string")
    .map((name) => ({ value: name, label: name, current: name === current }))
}

export async function loadAgents(fetchImpl = fetch) {
  return agentRows(await getJson(fetchImpl, "/agent"))
}

export async function loadModels(fetchImpl = fetch) {
  return modelRows(await getJson(fetchImpl, "/provider"))
}

export async function loadVariants(model, fetchImpl = fetch) {
  const payload = await getJson(fetchImpl, "/provider")
  return variantRows(variantsForModel(payload, model), "")
}

/* ---------- /decision-model et /vision-model : écritures sûres ---------- */

/** Construit un patch PATCH /config avec UN seul chemin de modèle, jamais une autre clé. */
export function commandConfigPatch(path, value) {
  if (!WRITABLE_MODEL_PATHS.includes(path)) throw new Error(`Clé non autorisée : ${path}`)
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} doit être une chaîne non vide`)
  const parts = path.split(".")
  const root = parts.shift()
  let node = value
  for (let i = parts.length - 1; i >= 0; i--) node = { [parts[i]]: node }
  return { [root]: node }
}

export async function writeModelConfig(path, value, fetchImpl = fetch) {
  const patch = commandConfigPatch(path, value)
  const response = await fetchImpl("/config", {
    method: "PATCH",
    headers: jsonHeaders,
    credentials: "same-origin",
    body: JSON.stringify(patch),
  })
  if (!response.ok) throw new Error(`PATCH /config (${path}) -> HTTP ${response.status}`)
  return patch
}

/**
 * Lignes du catalogue Jev. Le préfixe `jev:` marque une lecture seule : un modèle du serveur Jev
 * s'écrit via `jev.provider`/`jev.model`, hors de la liste blanche de ce module — on ne le
 * prétend donc jamais enregistré.
 */
export function decisionRows(catalog) {
  return asArray(catalog?.models)
    .filter((m) => m && typeof m.id === "string")
    .map((m) => ({
      value: `jev:${text(catalog?.provider) || "jev"}/${m.id}`,
      label: `${m.id}`,
      detail: `${text(catalog?.provider) || "jev"} · ${text(m.name) || text(m.description)} · lecture seule`,
    }))
}

export function decisionCurrent(config) {
  return configValue(config, "jev.decision_model")
}

/** Charge le catalogue Jev et la config, pour afficher le choix courant sans inventer de valeur. */
export async function loadDecisionModels(fetchImpl = fetch) {
  const [catalog, config] = await Promise.all([getJson(fetchImpl, "/global/jev/models"), getJson(fetchImpl, "/config")])
  return { catalog, config, current: decisionCurrent(config) }
}

export async function writeDecisionModel(value, fetchImpl = fetch) {
  return writeModelConfig("jev.decision_model", value, fetchImpl)
}

export function visionCurrent(config) {
  return configValue(config, "attachment.image.vision_model")
}

export async function loadVisionModels(fetchImpl = fetch) {
  const [payload, config] = await Promise.all([getJson(fetchImpl, "/provider"), getJson(fetchImpl, "/config")])
  return { rows: modelRows(payload), config, current: visionCurrent(config) }
}

export async function writeVisionModel(value, fetchImpl = fetch) {
  return writeModelConfig("attachment.image.vision_model", value, fetchImpl)
}

/* ---------- /themes, /thinking, /timestamps : état de vue ---------- */

export const VIEW_STATE_KEYS = {
  theme: "oc2.theme",
  thinking: "oc2.thinking",
  timestamps: "oc2.stamps",
}

export function readViewState(storage, key, fallback) {
  try {
    const value = storage?.getItem(VIEW_STATE_KEYS[key])
    if (value === null || value === undefined) return fallback
    if (key === "thinking" || key === "timestamps") return value === "1"
    return value
  } catch {
    return fallback
  }
}

export function writeViewState(storage, key, value) {
  try {
    const stored = typeof value === "boolean" ? (value ? "1" : "0") : String(value ?? "")
    storage?.setItem(VIEW_STATE_KEYS[key], stored)
  } catch {
    /* stockage indisponible : l'état de vue reste valable pour cette session */
  }
  return value
}

export function themeValue(label) {
  const found = THEME_VALUES.find((entry) => entry[0] === label)
  return found ? found[1] : ""
}

/* ---------- /timeline, /sessions ---------- */

/** Les prompts utilisateur réels, indexés dans l'ordre de rendu (le plus ancien d'abord). */
export function timelineRows(messages) {
  const out = []
  for (const message of asArray(messages)) {
    const role = message?.info?.role
    if (role !== "user") continue
    const parts = asArray(message?.parts).filter((p) => p?.type === "text" && !p.ignored && !p.synthetic)
    const label = parts.map((p) => text(p.text)).filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 64)
    if (!label) continue
    out.push({ value: String(out.length), label, detail: `#${out.length + 1}` })
  }
  return out
}

export async function loadTimeline(sessionID, fetchImpl = fetch) {
  const messages = await getJson(fetchImpl, `/session/${encodeURIComponent(sessionID)}/message`)
  return timelineRows(messages)
}

export function sessionRows(sessions, current) {
  return asArray(sessions)
    .filter((s) => s && typeof s === "object" && typeof s.id === "string")
    .map((s) => ({
      value: s.id,
      label: text(s.title) || "(untitled)",
      detail: typeof s.directory === "string" ? s.directory.split(/[\\/]/).pop() : "",
      current: s.id === current,
    }))
}

export async function loadSessions(fetchImpl = fetch) {
  return sessionRows(await getJson(fetchImpl, "/session"), undefined)
}

/* ---------- /status, /help ---------- */

export function statusPairs(input = {}) {
  const mcp = input.mcp && typeof input.mcp === "object" ? input.mcp : {}
  const values = Object.values(mcp)
  const connected = values.filter((s) => text(s?.status) === "connected").length
  const version = text(input.health?.version) || "unknown"
  const origin = text(input.origin) || "server"
  return [
    ["Version", version],
    ["Server", origin],
    ["Agent", text(input.agent) || "unknown"],
    ["Model", text(input.model) || "unknown"],
    ["MCP", `${connected}/${values.length} connected`],
    ["LSP", "disabled"],
  ]
}

export async function loadStatus(fetchImpl = fetch, origin = "") {
  const [health, mcp] = await Promise.all([getJson(fetchImpl, "/global/health"), getJson(fetchImpl, "/mcp")])
  return { health, mcp, origin, pairs: statusPairs({ health, mcp, origin }) }
}

/* ---------- /skills, /subagent ---------- */

export function skillRows(skills) {
  return asArray(skills)
    .filter((s) => s && typeof s === "object" && typeof s.name === "string" && s.name)
    .map((s) => ({
      value: s.name,
      label: s.name,
      detail: String(s.description || "").replace(/\s+/g, " ").trim().slice(0, 90),
    }))
}

export async function loadSkills(fetchImpl = fetch) {
  return skillRows(await getJson(fetchImpl, "/skill"))
}

export function subagentRows(agents) {
  return asArray(agents)
    .filter((a) => a && a.mode === "subagent" && typeof a.name === "string" && a.name && a.hidden !== true)
    .map((a) => ({
      value: a.name,
      label: a.name,
      detail: String(a.description || "").replace(/\s+/g, " ").trim().slice(0, 90),
    }))
}

export async function loadSubagents(fetchImpl = fetch) {
  return subagentRows(await getJson(fetchImpl, "/agent"))
}

/* ---------- /connect ---------- */

export function providerRows(auth, connected) {
  const connectedSet = new Set(asArray(connected))
  return Object.keys(auth && typeof auth === "object" ? auth : {})
    .sort()
    .map((id) => {
      const methods = asArray(auth[id])
      const oauth = methods.findIndex((m) => text(m?.type) === "oauth")
      return {
        value: id,
        label: id,
        detail: connectedSet.has(id) ? "Connected" : oauth >= 0 ? "OAuth available" : "API key required",
        on: connectedSet.has(id),
        tone: connectedSet.has(id) ? "ok" : "off",
        method: oauth,
      }
    })
}

export async function loadProviders(fetchImpl = fetch) {
  const [auth, list] = await Promise.all([getJson(fetchImpl, "/provider/auth"), getJson(fetchImpl, "/provider")])
  return { auth, rows: providerRows(auth, list?.connected) }
}

/** POST /provider/{id}/oauth/authorize — ouvre ensuite l'URL renvoyée, sans simuler le succès. */
export async function providerOauthUrl(providerID, method, fetchImpl = fetch) {
  const enc = encodeURIComponent(providerID)
  const response = await fetchImpl(`/provider/${enc}/oauth/authorize`, {
    method: "POST",
    headers: jsonHeaders,
    credentials: "same-origin",
    body: JSON.stringify({ method }),
  })
  if (!response.ok) throw new Error(`POST /provider/${providerID}/oauth/authorize -> HTTP ${response.status}`)
  const body = await response.json()
  return text(body?.url)
}

/* ---------- /config, /logs, /diff ---------- */

const SAFE_SUMMARY_PATHS = ["model", "small_model", "default_agent", "username", "logLevel", "jev.decision_model", "attachment.image.vision_model"]

export function configPairs(config) {
  return SAFE_SUMMARY_PATHS.map((path) => {
    const value = configValue(config, path)
    return [path, value === undefined || value === "" ? "—" : String(value)]
  })
}

export async function loadConfig(fetchImpl = fetch) {
  const config = await getJson(fetchImpl, "/config")
  return { config, pairs: configPairs(config) }
}

/** Journal réel : lignes datées et sans secret, issues des messages de la session. */
export function logViewLines(messages, statuses, sessionID, maintenant = Date.now()) {
  const list = asArray(messages)
  const status = statuses?.[sessionID]?.type || "idle"
  const clock = (date) => (Number.isFinite(date) ? new Date(date).toISOString().slice(11, 19) : new Date(maintenant).toISOString().slice(11, 19))
  const lines = [`${clock(maintenant)} info  session ${sessionID} · status ${status}`]
  for (const message of list.slice(-40)) {
    const body = asArray(message?.parts)
      .filter((p) => p?.type === "text" && !p.ignored && !p.synthetic)
      .map((p) => String(p.text ?? "").replace(/\s+/g, " ").slice(0, 240))
      .filter(Boolean)
      .join(" ")
    if (!body) continue
    lines.push(`${clock(message?.info?.time?.created)} ${message?.info?.role || "assistant"}  ${body}`)
  }
  return lines
}

export async function loadLogView(sessionID, fetchImpl = fetch) {
  const enc = encodeURIComponent(sessionID)
  const [messages, statuses] = await Promise.all([
    getJson(fetchImpl, `/session/${enc}/message`),
    getJson(fetchImpl, "/session/status").catch(() => ({})),
  ])
  return logViewLines(messages, statuses, sessionID)
}

/** Patch unified → lignes typées, sans conserver le patch brut. */
export function parsePatch(patch) {
  return String(patch || "")
    .split("\n")
    .map((line) => ({
      kind: line.startsWith("@@") ? "hunk" : line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "context",
      text: line,
    }))
}

export function diffFiles(snapshots) {
  return asArray(snapshots).map((s) => ({
    name: `${text(s?.file) || "unknown"}  +${s?.additions ?? 0} -${s?.deletions ?? 0}`,
    lines: typeof s?.patch === "string" ? parsePatch(s.patch) : [],
  }))
}

export async function loadDiff(sessionID, fetchImpl = fetch) {
  const snapshots = await getJson(fetchImpl, `/session/${encodeURIComponent(sessionID)}/diff`)
  return diffFiles(snapshots)
}

/* ---------- /mcps ---------- */

export function mcpRows(status) {
  return Object.keys(status && typeof status === "object" ? status : {})
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const value = text(status[name]?.status) || "unknown"
      return {
        n: name,
        on: value === "connected",
        detail: value === "connected" ? "Connected" : value === "disabled" ? "Disabled" : value,
      }
    })
}

export async function loadMcpStatus(fetchImpl = fetch) {
  return mcpRows(await getJson(fetchImpl, "/mcp"))
}

/** Un seul appel serveur par bascule ; l'état en mémoire est mis à jour par l'appelant. */
export async function toggleMcp(name, on, fetchImpl = fetch) {
  const verb = on ? "connect" : "disconnect"
  return post(fetchImpl, `/mcp/${encodeURIComponent(name)}/${verb}`)
}
