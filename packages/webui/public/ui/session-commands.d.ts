/** Les douze commandes de session, dans l'ordre où la maquette les présente. */
export const SESSION_COMMAND_NAMES: readonly string[]

export type SessionCommandName =
  | "new"
  | "rename"
  | "fork"
  | "undo"
  | "compact"
  | "copy"
  | "export"
  | "share"
  | "init"
  | "review"
  | "editor"
  | "exit"

export type CommandSource = "command" | "skill" | "mcp"

export interface CommandSpec {
  name: SessionCommandName
  description: string
  needsSession: boolean
  needsConfirmation: boolean
  asksForArgument: boolean
}

export const SESSION_COMMANDS: readonly CommandSpec[]

export function isSessionCommand(name: string): name is SessionCommandName
export function commandSpec(name: string): CommandSpec | undefined

/** Le catalogue du serveur réduit à (nom → provenance). */
export interface CommandChoiceRef {
  name: string
  source?: string
  description?: string
}

export function resolveSource(name: string, choices: CommandChoiceRef[]): CommandSource

/** `/nom arguments` — une seule ligne ; le reste du brouillon n'est pas un argument de commande. */
export interface ParsedCommand {
  name: string
  arguments: string
}

export function parseCommandLine(text: string): ParsedCommand | undefined

export type ActivityKind = "skill" | "mcp"
export type ActivityStatus = "pending" | "done" | "error"

/** Une ligne rendue dans le fil : le nom réellement invoqué et son résultat, jamais un exemple. */
export interface CommandActivity {
  id: string
  kind: ActivityKind
  name: string
  arguments: string
  status: ActivityStatus
}

export function activityId(kind: ActivityKind, name: string, args: string, sequence: number): string
export function activityText(activity: CommandActivity): string

/** Le fil d'une session en Markdown, dans l'ordre du serveur. */
export function transcriptToMarkdown(messages: unknown): string

/** L'identifiant du dernier message utilisateur : cible réelle de /undo. */
export function lastUserMessageID(messages: unknown): string | undefined

/** URL locale de partage : origine + chemin + `?session=…` — aucun appel réseau. */
export function localShareURL(origin: string | undefined, pathname: string | undefined, sessionID: string): string

/** Provenance lue dans `GET /command` et `GET /skill`, jamais codée en dur. */
export function loadChoices(fetchImpl?: typeof fetch): Promise<CommandChoiceRef[]>

/** Sélection du composeur : identifiants de modèle et message cible de /init. */
export interface CommandSelection {
  providerID?: string
  modelID?: string
  messageID?: string
  agent?: string
  variant?: string
}

export interface CreatedSession {
  id?: string
}

/** Transport injectable — les routes réelles du serveur. */
export interface SessionCommandTransport {
  create: () => Promise<CreatedSession | undefined>
  update: (sessionID: string, title: string) => Promise<unknown>
  remove: (sessionID: string) => Promise<unknown>
  fork: (sessionID: string) => Promise<CreatedSession | undefined>
  revert: (sessionID: string) => Promise<unknown>
  summarize: (sessionID: string) => Promise<unknown>
  init: (sessionID: string) => Promise<unknown>
  command: (sessionID: string, command: string, args?: string) => Promise<unknown>
  messages: (sessionID: string) => Promise<unknown>
}

export function createTransport(fetchImpl?: typeof fetch, selection?: CommandSelection): SessionCommandTransport

/** Les effets que l'UI fournit : aucun d'eux ne touche au shell ni à window.confirm. */
export interface SessionCommandHost {
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
  /** Origine et chemin de l'app, pour `/share` (URL strictement locale). */
  origin?: string
  pathname?: string
}

export interface CommandResult {
  ok: boolean
  error?: string
  canceled?: boolean
}

export interface RunContext {
  sessionID?: string
  choices?: CommandChoiceRef[]
  transport: SessionCommandTransport
  host: SessionCommandHost
}

export function runCommandLine(text: string, ctx: RunContext): Promise<CommandResult>
