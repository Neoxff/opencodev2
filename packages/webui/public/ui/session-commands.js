/**
 * Commandes de session — le pendant front des routes réelles du serveur, pour la maquette /ui.
 *
 * Port de `src/session-commands.ts` en JS public : une commande est une **décision** (route,
 * arguments, confirmation), vérifiable par test. Le transport (fetch) et les effets (presse-papiers,
 * téléchargement, dialogue) sont injectés — aucun accès direct au DOM, à `window.confirm` ou au shell.
 *
 * Deux écarts assumés par rapport au port TypeScript :
 *   - `/share` ne POST jamais vers /session/:id/share : il ne copie qu'une URL **locale**
 *     construite depuis l'origine de l'hôte. Aucune publication externe sans accord explicite.
 *   - `/compact` et `/init` portent `providerID`/`modelID` (et `messageID` pour init), issus de la
 *     sélection du composeur, dans le payload des routes réelles.
 */

/** Les douze commandes de session, dans l'ordre où la maquette les présente. */
export const SESSION_COMMAND_NAMES = [
  "new",
  "rename",
  "fork",
  "undo",
  "compact",
  "copy",
  "export",
  "share",
  "init",
  "review",
  "editor",
  "exit",
]

const spec = (name, description, options = {}) => ({
  name,
  description,
  needsSession: true,
  needsConfirmation: false,
  asksForArgument: false,
  ...options,
})

export const SESSION_COMMANDS = [
  spec("new", "New session", { needsSession: false }),
  spec("rename", "Rename session", { asksForArgument: true }),
  spec("fork", "Fork session"),
  spec("undo", "Undo previous message", {
    needsConfirmation: true,
    confirmationTitle: "Undo previous message?",
    confirmationMessage: "The last user message and its response will be reverted.",
    confirmationAccept: "Undo",
  }),
  spec("compact", "Compact session"),
  spec("copy", "Copy session transcript"),
  spec("export", "Export session transcript"),
  spec("share", "Share session"),
  spec("init", "guided AGENTS.md setup"),
  spec("review", "review changes [commit|branch|pr], defaults to uncommitted"),
  spec("editor", "Open editor"),
  spec("exit", "Exit the app", { needsConfirmation: true }),
]

const SPECS = new Map(SESSION_COMMANDS.map((entry) => [entry.name, entry]))

export function isSessionCommand(name) {
  return SPECS.has(name)
}

export function commandSpec(name) {
  return SPECS.get(name)
}

/** Le catalogue du serveur réduit à (nom → provenance), pour distinguer skill et MCP. */
export function resolveSource(name, choices) {
  const found = (Array.isArray(choices) ? choices : []).find((choice) => choice?.name === name)
  if (found?.source === "skill" || found?.source === "mcp") return found.source
  return "command"
}

/** `/nom arguments` — une seule ligne ; le reste du brouillon n'est pas un argument de commande. */
export function parseCommandLine(text) {
  if (typeof text !== "string" || !text.startsWith("/")) return undefined
  const line = text.split(/\r?\n/, 1)[0] ?? ""
  const match = /^\/([^\s]+)(?:\s+(.*))?$/.exec(line)
  if (!match) return undefined
  return { name: match[1], arguments: (match[2] ?? "").trim() }
}

/* ---------------------------------------------------------------------------
   Lignes « skill » / « mcp » dans la conversation
   ------------------------------------------------------------------------ */

export function activityId(kind, name, args, sequence) {
  return `${kind}:${name}:${args}:${sequence}`
}

export function activityText(activity) {
  return activity.arguments ? `${activity.name} · ${activity.arguments}` : activity.name
}

/* ---------------------------------------------------------------------------
   Transcript — la source de /copy et /export, sans donnée de démonstration
   ------------------------------------------------------------------------ */

/** Le fil d'une session en Markdown, dans l'ordre du serveur. Les parties non textuelles sont tues. */
export function transcriptToMarkdown(messages) {
  const blocks = []
  for (const message of Array.isArray(messages) ? messages : []) {
    const role = message?.info?.role
    if (role !== "user" && role !== "assistant") continue
    const text = (Array.isArray(message.parts) ? message.parts : [])
      .filter((part) => part?.type === "text" && typeof part.text === "string" && part.text.trim() && !part.ignored && !part.synthetic)
      .map((part) => part.text.trim())
      .join("\n\n")
    if (!text) continue
    blocks.push(role === "user" ? "## You" : "## Assistant", "", text, "")
  }
  return blocks.join("\n").trim()
}

/** L'identifiant du dernier message utilisateur : cible réelle de /undo (POST /revert). */
export function lastUserMessageID(messages) {
  const list = Array.isArray(messages) ? messages : []
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]?.info?.role === "user" && list[i]?.info?.id) return list[i].info.id
  }
  return undefined
}

/**
 * URL **locale** de partage : origine + chemin de l'app + `?session=…`.
 * Aucun appel réseau, aucun service externe — le lien ne quitte pas cette machine.
 */
export function localShareURL(origin, pathname, sessionID) {
  const base = `${origin || ""}${pathname || "/ui/"}`
  return `${base}${base.includes("?") ? "&" : "?"}session=${encodeURIComponent(sessionID)}`
}

/* ---------------------------------------------------------------------------
   Catalogue serveur — la provenance vient des routes, jamais d'une étiquette codée en dur
   ------------------------------------------------------------------------ */

async function getJsonOptional(fetchImpl, path, fallback) {
  try {
    const response = await fetchImpl(path, { credentials: "same-origin" })
    if (!response?.ok) return fallback
    return await response.json()
  } catch {
    return fallback
  }
}

/**
 * Lit `GET /command` (dont `source` vaut `command`/`mcp`/`skill`) et complète avec `GET /skill`.
 *Le résultat est réduit à {name, source, description} pour `resolveSource`.
 */
export async function loadChoices(fetchImpl = fetch) {
  const [commands, skills] = await Promise.all([
    getJsonOptional(fetchImpl, "/command", []),
    getJsonOptional(fetchImpl, "/skill", []),
  ])
  const choices = []
  const seen = new Set()
  for (const item of Array.isArray(commands) ? commands : []) {
    if (!item || typeof item.name !== "string") continue
    seen.add(item.name)
    choices.push({
      name: item.name,
      source: item.source === "mcp" || item.source === "skill" ? item.source : "command",
      description: item.description,
    })
  }
  for (const item of Array.isArray(skills) ? skills : []) {
    if (!item || typeof item.name !== "string" || seen.has(item.name)) continue
    seen.add(item.name)
    choices.push({ name: item.name, source: "skill", description: item.description })
  }
  return choices
}

/* ---------------------------------------------------------------------------
   Transport — les routes réelles, avec les payloads exacts du serveur
   ------------------------------------------------------------------------ */

async function readResponse(response, method, path) {
  if (!response?.ok) throw new Error(`${method} ${path} -> HTTP ${response?.status ?? "?"}`)
  if (response.status === 204) return undefined
  return response.json()
}

/**
 * Construit le transport à partir d'un `fetch` injecté et de la sélection du composeur.
 * `selection` porte `providerID`/`modelID` (et `messageID` pour /init).
 */
export function createTransport(fetchImpl = fetch, selection = {}) {
  const enc = (value) => encodeURIComponent(value)
  async function request(method, path, body) {
    const init = { method, credentials: "same-origin" }
    if (body !== undefined) {
      init.headers = { "content-type": "application/json" }
      init.body = JSON.stringify(body)
    }
    const response = await fetchImpl(path, init)
    return readResponse(response, method, path)
  }
  const messages = (sessionID) => request("GET", `/session/${enc(sessionID)}/message`)

  return {
    create: () => request("POST", "/session", {}),
    update: (sessionID, title) => request("PATCH", `/session/${enc(sessionID)}`, { title }),
    remove: (sessionID) => request("DELETE", `/session/${enc(sessionID)}`),
    fork: (sessionID) => request("POST", `/session/${enc(sessionID)}/fork`, {}),
    revert: async (sessionID) => {
      const list = await messages(sessionID)
      const messageID = lastUserMessageID(list)
      if (!messageID) throw new Error("No message to revert")
      return request("POST", `/session/${enc(sessionID)}/revert`, { sessionID, messageID })
    },
    summarize: (sessionID) =>
      request("POST", `/session/${enc(sessionID)}/summarize`, {
        providerID: selection.providerID,
        modelID: selection.modelID,
        auto: false,
      }),
    init: (sessionID) =>
      request("POST", `/session/${enc(sessionID)}/init`, {
        providerID: selection.providerID,
        modelID: selection.modelID,
        messageID: selection.messageID || `msg_${Date.now()}`,
      }),
    command: (sessionID, name, args) => {
      const body = { command: name, arguments: args || "" }
      if (selection.agent) body.agent = selection.agent
      if (selection.providerID && selection.modelID) body.model = `${selection.providerID}/${selection.modelID}`
      if (selection.variant) body.variant = selection.variant
      return request("POST", `/session/${enc(sessionID)}/command`, body)
    },
    messages,
  }
}

/* ---------------------------------------------------------------------------
   Exécution — une seule porte d'entrée : parsing, provenance, effets, erreurs
   ------------------------------------------------------------------------ */

function errorMessage(cause) {
  if (cause instanceof Error) return cause.message
  if (cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string" && cause.message) {
    return cause.message
  }
  return String(cause)
}

function requireSession(ctx) {
  if (!ctx.sessionID) throw new Error("No active session")
  return ctx.sessionID
}

export async function runCommandLine(text, ctx) {
  const parsed = parseCommandLine(text)
  if (!parsed) return { ok: false, error: "Not a command" }

  try {
    const found = commandSpec(parsed.name)
    if (found) {
      if (found.needsSession) requireSession(ctx)
      if (found.needsConfirmation) {
        if (typeof ctx.host.confirm !== "function") return { ok: false, canceled: true }
        const accepted = await ctx.host.confirm(
          found.confirmationMessage ?? "Exit OpenCodev2? The current session view will be closed.",
          {
            title: found.confirmationTitle ?? "Exit OpenCodev2?",
            acceptLabel: found.confirmationAccept ?? "Exit",
          },
        )
        if (!accepted) return { ok: false, canceled: true }
      }
      await runBuiltIn(found.name, parsed.arguments, ctx)
      return { ok: true }
    }

    const source = resolveSource(parsed.name, ctx.choices ?? [])
    if (source === "skill" || source === "mcp") {
      requireSession(ctx)
      await runInvocable(source, parsed, ctx)
      return { ok: true }
    }

    const message = `Unknown command /${parsed.name}`
    ctx.host.error(message)
    return { ok: false, error: message }
  } catch (cause) {
    const message = errorMessage(cause)
    ctx.host.error(message)
    return { ok: false, error: message }
  }
}

async function runBuiltIn(name, args, ctx) {
  const transport = ctx.transport
  const host = ctx.host

  switch (name) {
    case "new": {
      const created = await transport.create()
      if (!created?.id) throw new Error("Server did not return a new session")
      host.selectSession(created.id)
      host.notice("New session")
      return
    }
    case "rename": {
      const sessionID = requireSession(ctx)
      if (!args) {
        // Pas de titre : le dialogue existe déjà dans l'app, on ne l'invente pas ici.
        host.rename(sessionID)
        return
      }
      await transport.update(sessionID, args)
      host.reload()
      host.notice("Session renamed")
      return
    }
    case "fork": {
      const sessionID = requireSession(ctx)
      const forked = await transport.fork(sessionID)
      if (!forked?.id) throw new Error("Server did not return a forked session")
      host.selectSession(forked.id)
      host.notice("Session forked")
      return
    }
    case "undo": {
      await transport.revert(requireSession(ctx))
      host.reload()
      host.notice("Last message reverted")
      return
    }
    case "compact": {
      await transport.summarize(requireSession(ctx))
      host.reload()
      host.notice("Session compacted")
      return
    }
    case "copy": {
      const messages = await transcriptSource(requireSession(ctx), ctx)
      const copied = await host.clipboard(transcriptToMarkdown(messages))
      if (!copied) throw new Error("Clipboard unavailable")
      host.notice("Transcript copied")
      return
    }
    case "export": {
      const sessionID = requireSession(ctx)
      const messages = await transcriptSource(sessionID, ctx)
      const filename = `${sessionID.replace(/[^a-zA-Z0-9_-]/g, "") || "session"}.md`
      host.download(filename, transcriptToMarkdown(messages))
      host.notice("Transcript exported")
      return
    }
    case "share": {
      // Local uniquement : jamais de POST vers /session/:id/share sans accord explicite.
      const sessionID = requireSession(ctx)
      const url = localShareURL(host.origin, host.pathname, sessionID)
      const copied = await host.clipboard(url)
      if (!copied) throw new Error("Clipboard unavailable")
      host.notice("Local session link copied")
      return
    }
    case "init": {
      await transport.init(requireSession(ctx))
      host.reload()
      host.notice("AGENTS.md initialized")
      return
    }
    case "review": {
      await transport.command(requireSession(ctx), "review", args || undefined)
      host.reload()
      host.notice("Review started")
      return
    }
    case "editor": {
      // Aucun shell : l'éditeur est une vue de l'application, branchée sur le brouillon.
      host.openEditor()
      return
    }
    case "exit": {
      // La confirmation a déjà été acceptée dans runCommandLine.
      host.clearSession()
      return
    }
  }
}

async function transcriptSource(sessionID, ctx) {
  const messages = await ctx.transport.messages(sessionID)
  if (!messages || messages.length === 0) throw new Error("No transcript to use")
  return messages
}

/** Skill ou prompt MCP : la ligne du fil porte le nom et les arguments réels, puis leur statut. */
async function runInvocable(kind, parsed, ctx) {
  const sessionID = requireSession(ctx)
  const id = activityId(kind, parsed.name, parsed.arguments, Date.now())
  ctx.host.addActivity({ id, kind, name: parsed.name, arguments: parsed.arguments, status: "pending" })
  try {
    await ctx.transport.command(sessionID, parsed.name, parsed.arguments || undefined)
  } catch (cause) {
    ctx.host.updateActivity(id, "error")
    throw cause
  }
  ctx.host.updateActivity(id, "done")
  ctx.host.reload()
}
