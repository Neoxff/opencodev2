/**
 * Commandes qui agissent sur la session — le pendant front des routes réelles du serveur.
 *
 * Ce module est volontairement séparé de l'UI : une commande est une **décision** (quelle route,
 * quels arguments, faut-il confirmer), et une décision se vérifie par un test. Le composant ne fait
 * que fournir le transport (le client SDK) et les effets de bord (presse-papiers, dialogue, reload).
 *
 * Aucune commande n'exécute de shell : `/editor` ouvre un éditeur **dans l'application**, `/exit`
 * ferme la vue de session. Le seul chemin vers le système reste le client SDK et ses permissions.
 */

import type { Message } from "./view-model"

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
] as const

export type SessionCommandName = (typeof SESSION_COMMAND_NAMES)[number]
export type CommandSource = "command" | "skill" | "mcp"

export type CommandSpec = {
  name: SessionCommandName
  description: string
  /** `/new` agit sans session courante ; les autres en exigent une. */
  needsSession: boolean
  /** `/exit` (et la suppression ctrl+d côté UI) demandent confirmation. */
  needsConfirmation: boolean
  /** `/rename` sans argument ouvre un dialogue plutôt que d'envoyer un titre vide. */
  asksForArgument: boolean
}

const spec = (
  name: SessionCommandName,
  description: string,
  options: Partial<Pick<CommandSpec, "needsSession" | "needsConfirmation" | "asksForArgument">> = {},
): CommandSpec => ({
  name,
  description,
  needsSession: true,
  needsConfirmation: false,
  asksForArgument: false,
  ...options,
})

export const SESSION_COMMANDS: readonly CommandSpec[] = [
  spec("new", "New session", { needsSession: false }),
  spec("rename", "Rename session", { asksForArgument: true }),
  spec("fork", "Fork session"),
  spec("undo", "Undo previous message"),
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

export function isSessionCommand(name: string): name is SessionCommandName {
  return SPECS.has(name as SessionCommandName)
}

export function commandSpec(name: string): CommandSpec | undefined {
  return SPECS.get(name as SessionCommandName)
}

/** Le catalogue du serveur réduit à (nom → provenance), pour distinguer skill et MCP. */
export type CommandChoiceRef = { name: string; source?: string }

export function resolveSource(name: string, choices: CommandChoiceRef[]): CommandSource {
  const found = choices.find((choice) => choice.name === name)
  if (found?.source === "skill" || found?.source === "mcp") return found.source
  return "command"
}

/** `/nom arguments` — une seule ligne ; le reste du brouillon n'est pas un argument de commande. */
export type ParsedCommand = { name: string; arguments: string }

export function parseCommandLine(text: string): ParsedCommand | undefined {
  if (!text.startsWith("/")) return undefined
  const line = text.split(/\r?\n/, 1)[0] ?? ""
  const match = /^\/([^\s]+)(?:\s+(.*))?$/.exec(line)
  if (!match) return undefined
  return { name: match[1]!, arguments: (match[2] ?? "").trim() }
}

/* ---------------------------------------------------------------------------
   Lignes « skill » / « mcp » dans la conversation
   ------------------------------------------------------------------------ */

export type ActivityKind = "skill" | "mcp"
export type ActivityStatus = "pending" | "done" | "error"

/** Une ligne rendue dans le fil : le nom réellement invoqué et son résultat, jamais un exemple. */
export type CommandActivity = {
  id: string
  kind: ActivityKind
  name: string
  arguments: string
  status: ActivityStatus
}

export function activityId(kind: ActivityKind, name: string, args: string, sequence: number): string {
  return `${kind}:${name}:${args}:${sequence}`
}

export function activityText(activity: CommandActivity): string {
  return activity.arguments ? `${activity.name} · ${activity.arguments}` : activity.name
}

/* ---------------------------------------------------------------------------
   Transcript — la source de /copy et /export, sans donnée de démonstration
   ------------------------------------------------------------------------ */

/** Le fil d'une session en Markdown, dans l'ordre du serveur. Les parties non textuelles sont tues. */
export function transcriptToMarkdown(messages: Message[]): string {
  const blocks: string[] = []
  for (const message of messages) {
    const role = message.info?.role
    if (role !== "user" && role !== "assistant") continue
    const text = (message.parts ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string" && part.text.trim())
      .map((part) => part.text!.trim())
      .join("\n\n")
    if (!text) continue
    blocks.push(role === "user" ? "## You" : "## Assistant", "", text, "")
  }
  return blocks.join("\n").trim()
}

/* ---------------------------------------------------------------------------
   Transport — les méthodes réelles du client SDK, ramenées à leur signature utile
   ------------------------------------------------------------------------ */

export type CreatedSession = { id?: string }
export type SharedSession = { url?: string }

export type SessionCommandTransport = {
  create: () => Promise<CreatedSession | undefined>
  update: (sessionID: string, title: string) => Promise<unknown>
  remove: (sessionID: string) => Promise<unknown>
  fork: (sessionID: string) => Promise<CreatedSession | undefined>
  revert: (sessionID: string) => Promise<unknown>
  summarize: (sessionID: string) => Promise<unknown>
  share: (sessionID: string) => Promise<SharedSession | undefined>
  unshare: (sessionID: string) => Promise<unknown>
  init: (sessionID: string) => Promise<unknown>
  command: (sessionID: string, command: string, args?: string) => Promise<unknown>
  messages: (sessionID: string) => Promise<Message[] | undefined>
}

/** Les effets que l'UI fournit : aucun d'eux ne touche au shell. */
export type SessionCommandHost = {
  clipboard: (text: string) => Promise<boolean>
  download: (filename: string, content: string) => void
  notice: (message: string) => void
  error: (message: string) => void
  selectSession: (sessionID: string) => void
  reload: () => void
  clearSession: () => void
  rename: (sessionID: string) => void
  openEditor: () => void
  confirm: (message: string) => Promise<boolean>
  addActivity: (activity: CommandActivity) => void
  updateActivity: (id: string, status: ActivityStatus) => void
}

export type CommandResult = { ok: boolean; error?: string; canceled?: boolean }

export type RunContext = {
  sessionID?: string
  choices?: CommandChoiceRef[]
  transport: SessionCommandTransport
  host: SessionCommandHost
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  if (cause && typeof cause === "object" && "message" in cause) {
    const message = (cause as { message?: unknown }).message
    if (typeof message === "string" && message) return message
  }
  return String(cause)
}

function requireSession(ctx: RunContext): string {
  if (!ctx.sessionID) throw new Error("No active session")
  return ctx.sessionID
}

/** Une seule porte d'entrée : parsing, résolution de la provenance, exécution, erreurs. */
export async function runCommandLine(text: string, ctx: RunContext): Promise<CommandResult> {
  const parsed = parseCommandLine(text)
  if (!parsed) return { ok: false, error: "Not a command" }

  try {
    const found = commandSpec(parsed.name)
    if (found) {
      if (found.needsSession) requireSession(ctx)
      if (found.needsConfirmation) {
        const accepted = await ctx.host.confirm("Exit OpenCodev2? The current session view will be closed.")
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

async function runBuiltIn(name: SessionCommandName, args: string, ctx: RunContext): Promise<void> {
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
      const messages = await transcript(requireSession(ctx), ctx)
      const copied = await host.clipboard(transcriptToMarkdown(messages))
      if (!copied) throw new Error("Clipboard unavailable")
      host.notice("Transcript copied")
      return
    }
    case "export": {
      const messages = await transcript(requireSession(ctx), ctx)
      const filename = `${requireSession(ctx).replace(/[^a-zA-Z0-9_-]/g, "") || "session"}.md`
      host.download(filename, transcriptToMarkdown(messages))
      host.notice("Transcript exported")
      return
    }
    case "share": {
      const shared = await transport.share(requireSession(ctx))
      if (!shared?.url) throw new Error("Server did not return a share link")
      const copied = await host.clipboard(shared.url)
      if (!copied) throw new Error("Clipboard unavailable")
      host.notice("Share link copied")
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

async function transcript(sessionID: string, ctx: RunContext): Promise<Message[]> {
  const messages = await ctx.transport.messages(sessionID)
  if (!messages || messages.length === 0) throw new Error("No transcript to use")
  return messages
}

/** Skill ou prompt MCP : la ligne du fil porte le nom et les arguments réels, puis leur statut. */
async function runInvocable(kind: ActivityKind, parsed: ParsedCommand, ctx: RunContext): Promise<void> {
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
