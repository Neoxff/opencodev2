/**
 * Données réelles du composeur pour la maquette /ui.
 *
 * Module purement fonctionnel : il ne touche ni au DOM ni au CSS. Les réponses
 * `/provider` contient des secrets dans ses champs de configuration ; ils sont
 * volontairement écartés ici. Seuls les champs nécessaires au composeur sortent.
 */

const ORCHESTRATOR = "orchestrator"
const OPENCODE = "opencode"

/**
 * GET /agent pèse ~3,1 Mo (prompts, permissions, options inclus). Le menu n'a besoin
 * que de 4 champs : on projette dès la lecture, puis on met en cache pour ne jamais
 * recharger à l'ouverture d'un menu.
 */
export function projectAgentFields(agents) {
  return (Array.isArray(agents) ? agents : [])
    .filter((agent) => agent && typeof agent.name === "string")
    .map((agent) => ({
      name: agent.name,
      description: typeof agent.description === "string" ? agent.description : "",
      mode: typeof agent.mode === "string" ? agent.mode : "",
      hidden: agent.hidden === true,
    }))
}

/** Règle retenue (validée sur GET /agent) : mode primary|all ET hidden !== true. */
export function isPrimaryAgent(agent) {
  return Boolean(
    agent && typeof agent.name === "string" && agent.hidden !== true &&
      (agent.mode === "primary" || agent.mode === "all"),
  )
}

/** Tous les agents non cachés, tous modes confondus — pour /subagent. */
export function orderAllAgents(agents) {
  return projectAgentFields(agents).filter((agent) => agent.hidden !== true)
}

export function orderAgents(agents) {
  const clean = orderAllAgents(agents).filter(isPrimaryAgent)
  const first = clean.find((agent) => agent.name === ORCHESTRATOR)
  if (!first) return clean
  return [first, ...clean.filter((agent) => agent.name !== ORCHESTRATOR)]
}

/** Repli si un serveur n'expose pas `mode` : tout agent non caché est principal. */
export function primaryAgentsOrFallback(agents) {
  const all = orderAllAgents(agents)
  return all.some((agent) => agent.mode) ? orderAgents(all) : all
}

/** Normalisation pour recherche insensible casse/accents. */
export function foldText(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

/** Filtre [nom, description] ou {n, d} sur nom ET description. */
export function filterChoices(list, query) {
  const q = foldText(query).trim()
  const arr = Array.isArray(list) ? list : []
  if (!q) return arr.slice()
  return arr.filter((x) => {
    const name = Array.isArray(x) ? x[0] : x?.n
    const desc = Array.isArray(x) ? x[1] : x?.d
    return foldText(name).includes(q) || foldText(desc).includes(q)
  })
}

/** Navigation clavier dans une liste. */
export function moveActive(key, active, count) {
  if (!count) return 0
  if (key === "ArrowDown") return (active + 1) % count
  if (key === "ArrowUp") return (active - 1 + count) % count
  return active
}

/**
 * L'API /provider expose capabilities.toolcall et capabilities.output.text.
 * Règle prudente : un modèle est de chat/outils si toolcall===true ET output.text===true.
 * Si capabilities est absent, règle prudente de repli : on garde sauf motif explicite
 * non-chat (tts/embed/prompt-guard/translate/whisper/magpie) dans id ou nom.
 */
export function isChatModel(model) {
  if (!model || typeof model !== "object") return false
  const caps = model.capabilities
  if (caps && typeof caps === "object") {
    const text = caps.output && typeof caps.output === "object" ? caps.output.text : undefined
    return caps.toolcall === true && text === true
  }
  const label = `${model.id || ""} ${model.name || ""}`.toLowerCase()
  return !/(tts|embed|prompt[- ]?guard|translatex?|whisper|magpie|transcri)/.test(label)
}

/** Opencode en premier (groupé), puis les autres fournisseurs groupés par ordre alphabétique. */
export function orderModels(models) {
  const list = (Array.isArray(models) ? models : []).filter(isChatModel)
  const groups = new Map()
  for (const model of list) {
    const key = typeof model.providerID === "string" ? model.providerID : ""
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(model)
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === OPENCODE) return -1
    if (b === OPENCODE) return 1
    return a.localeCompare(b)
  })
  return keys.flatMap((key) => groups.get(key))
}

/** Dernier modèle opencode utilisé s'il est valide, sinon premier modèle de chat opencode. */
export function defaultModelId(models, lastUsedID) {
  const opencode = orderModels(models).filter((model) => model.providerID === OPENCODE)
  if (!opencode.length) return ""
  const last = opencode.find((model) => model.id === lastUsedID)
  return (last || opencode[0]).id
}

export function sanitizeModels(providersPayload, apiModels = []) {
  const payload = Array.isArray(providersPayload) ? { all: providersPayload } : providersPayload || {}
  const providers = Array.isArray(payload.all) ? payload.all : []
  const connected = Array.isArray(payload.connected) ? new Set(payload.connected) : null
  const external = Array.isArray(apiModels) ? apiModels : []
  const models = []

  for (const provider of providers) {
    if (!provider?.id || (connected && !connected.has(provider.id))) continue
    const entries = provider.models && typeof provider.models === "object" ? provider.models : {}
    for (const [key, model] of Object.entries(entries)) {
      if (!model || typeof model !== "object") continue
      const variants = Object.keys(model.variants && typeof model.variants === "object" ? model.variants : {})
      models.push({
        id: key,
        providerID: provider.id,
        name: typeof model.name === "string" ? model.name : key,
        variants,
        limit: model.limit && typeof model.limit === "object" ? { ...model.limit } : undefined,
        status: typeof model.status === "string" ? model.status : "",
        capabilities: model.capabilities && typeof model.capabilities === "object" ? model.capabilities : undefined,
      })
    }
  }

  for (const model of external) {
    if (!model?.id || !model?.providerID) continue
    if (connected && !connected.has(model.providerID)) continue
    if (models.some((item) => item.id === model.id && item.providerID === model.providerID)) continue
    const variants = Array.isArray(model.variants)
      ? model.variants.map((variant) => (typeof variant === "string" ? variant : variant?.id)).filter(Boolean)
      : []
    models.push({
      id: model.id,
      providerID: model.providerID,
      name: typeof model.name === "string" ? model.name : model.id,
      variants,
      limit: model.limit && typeof model.limit === "object" ? { ...model.limit } : undefined,
      status: typeof model.status === "string" ? model.status : "",
      capabilities: model.capabilities && typeof model.capabilities === "object" ? model.capabilities : undefined,
    })
  }

  return models
}

export function variantsFor(models, id) {
  const model = (Array.isArray(models) ? models : []).find((item) => item?.id === id)
  const variants = Array.isArray(model?.variants) ? model.variants : []
  return variants.length ? variants : ["default"]
}

export function selectionFromSession(models, agents, session) {
  const realAgents = Array.isArray(agents) ? agents : []
  const realModels = orderModels(models)
  const agent = session?.agent && realAgents.some((item) => item.name === session.agent) ? session.agent : realAgents[0]?.name || ORCHESTRATOR
  // Défaut opencode : dernier modèle utilisé s'il est valide, sinon premier modèle de chat opencode.
  // Jamais un modèle TTS/embedding (déjà écartés par isChatModel/orderModels).
  const used = session?.model?.id || session?.modelID || ""
  const validUsed = realModels.find((item) => item.id === used && item.providerID === OPENCODE)
  const firstOpencode = realModels.find((item) => item.providerID === OPENCODE)
  const model = validUsed || firstOpencode || realModels.find((item) => item.id === used) || realModels[0]
  const choices = variantsFor(realModels, model?.id)
  const wanted = session?.model?.variant
  const variant = wanted && choices.includes(wanted) ? wanted : choices[0]
  return {
    agent,
    modelID: model?.id || "",
    providerID: model?.providerID || "",
    modelName: model?.name || model?.id || "",
    variant,
  }
}

export function buildPromptPayload(text, selection, mode = "send") {
  const part = { type: "text", text: String(text ?? "") }
  if (mode === "steer") part.metadata = { steer: true }
  const payload = {
    agent: selection?.agent,
    model: { providerID: selection?.providerID, modelID: selection?.modelID },
    parts: [part],
  }
  if (selection?.variant && selection.variant !== "default") payload.variant = selection.variant
  return payload
}

/**
 * Le serveur accepte metadata sur TextPartInput et implémente `steer` depuis 2.4.
 * On ne promet donc le raccourci que si ces deux signaux sont présents.
 */
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

/** Décision clavier pure, testable sans serveur. */
export function submitMode(input) {
  const { key, altKey, running, canSteer = false } = input || {}
  if (key === "Escape") return running ? "interrupt" : "ignore"
  if (key === "Enter") return running ? "queue" : "send"
  if (key === "s" && altKey) {
    if (!running) return "send"
    return canSteer ? "steer" : "unsupported"
  }
  return "ignore"
}

export function buttonAction(running) {
  return running ? "interrupt" : "send"
}

/** Traduit un KeyboardEvent-like en décision, avant tout effet de bord. */
export function keyboardDecision(event, state) {
  const key = event?.key
  return submitMode({
    key,
    altKey: Boolean(event?.altKey),
    running: Boolean(state?.running),
    canSteer: Boolean(state?.canSteer),
  })
}

function generationSpeed(messages) {
  const list = Array.isArray(messages) ? messages : []
  const last = [...list].reverse().find((message) => message?.info?.role === "assistant")
  const info = last?.info || {}
  const parts = Array.isArray(last?.parts) ? last.parts : []
  const output = Number(info.tokens?.output) || 0
  const reasoning = Number(info.tokens?.reasoning) || 0
  const tokens = output + reasoning
  if (tokens <= 0) return undefined
  const windows = parts
    .filter((part) => part?.type === "text" || part?.type === "reasoning" || part?.type === "tool")
    .map((part) => [part.time?.start, part.time?.end])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a[0] - b[0])
  let start = -1
  let end = -1
  let ms = 0
  for (const window of windows) {
    if (start < 0) {
      start = window[0]
      end = window[1]
      continue
    }
    if (window[0] > end) {
      ms += end - start
      start = window[0]
      end = window[1]
      continue
    }
    end = Math.max(end, window[1])
  }
  if (start >= 0) ms += end - start
  if (ms <= 0) return undefined
  const value = tokens / (ms / 1000)
  if (!Number.isFinite(value) || value <= 0 || value > 500) return undefined
  return value
}

export function sessionMetrics(session, messages, model) {
  const tokens = session?.tokens || {}
  const used =
    (Number(tokens.input) || 0) +
    (Number(tokens.output) || 0) +
    (Number(tokens.reasoning) || 0) +
    (Number(tokens.cache?.read) || 0) +
    (Number(tokens.cache?.write) || 0)
  const limit = Number(model?.limit?.context) || 1_048_576
  const percent = Math.round((used / limit) * 100)
  const tps = generationSpeed(messages)
  return { used, limit, percent, tps }
}

function compactNumber(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`
  return String(value)
}

export function statusParts(metrics, selection) {
  return {
    agent: selection?.agent || "",
    model: selection?.modelName || selection?.modelID || "",
    variant: selection?.variant || "",
    tokens: `${compactNumber(metrics?.used || 0)} / ${compactNumber(metrics?.limit || 1_048_576)} (${metrics?.percent || 0}%)`,
    tps: metrics?.tps ? `${Math.round(metrics.tps)} tok/s` : "",
  }
}

async function getJson(fetchImpl, path) {
  const response = await fetchImpl(path, { credentials: "same-origin" })
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}`)
  return response.json()
}

/**
 * Cache du composeur : GET /agent (3,1 Mo) et /provider (8 Mo) ne sont lus qu'une fois.
 * Le cache est conservé pour toute la session ; l'ouverture d'un menu ne recharge rien.
 */
let composerConfigCache = null

export function clearComposerConfigCache() {
  composerConfigCache = null
}

export async function loadComposerConfig(fetchImpl = fetch, options = {}) {
  if (composerConfigCache && !options.refresh) return composerConfigCache
  const [agents, providers, health, doc] = await Promise.all([
    getJson(fetchImpl, "/agent"),
    getJson(fetchImpl, "/provider"),
    getJson(fetchImpl, "/global/health"),
    getJson(fetchImpl, "/doc"),
  ])
  // Projection immédiate : seuls name/mode/description/hidden survivent côté composeur.
  const projected = projectAgentFields(agents)
  const models = orderModels(sanitizeModels(providers))
  composerConfigCache = {
    agents: orderAgents(projected),
    allAgents: orderAllAgents(projected),
    models,
    defaultModelID: defaultModelId(models, null),
    canSteer: steerSupported(doc, health),
  }
  return composerConfigCache
}

async function getJsonOptional(fetchImpl, path, fallback) {
  try {
    return await getJson(fetchImpl, path)
  } catch {
    return fallback
  }
}

export async function loadSessionState(sessionID, fetchImpl = fetch) {
  const enc = encodeURIComponent(sessionID)
  const [session, messages, statuses] = await Promise.all([
    getJson(fetchImpl, `/session/${enc}`),
    getJson(fetchImpl, `/session/${enc}/message`),
    getJsonOptional(fetchImpl, "/session/status", {}),
  ])
  const status = statuses?.[sessionID]
  return {
    session,
    messages: Array.isArray(messages) ? messages : [],
    status,
    busy: Boolean(status && status.type !== "idle"),
  }
}

export async function sendPrompt(sessionID, payload, fetchImpl = fetch) {
  const response = await fetchImpl(`/session/${encodeURIComponent(sessionID)}/prompt_async`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`POST /session/${encodeURIComponent(sessionID)}/prompt_async -> HTTP ${response.status}`)
  return { ok: true }
}

export async function abortSession(sessionID, fetchImpl = fetch) {
  const response = await fetchImpl(`/session/${encodeURIComponent(sessionID)}/abort`, {
    method: "POST",
    credentials: "same-origin",
  })
  if (!response.ok) throw new Error(`POST /session/${encodeURIComponent(sessionID)}/abort -> HTTP ${response.status}`)
  return { ok: true }
}
