/**
 * Commandes d'interface — couche pure, sans DOM ni Solid.
 *
 * Une commande d'interface n'envoie **rien** à l'agent : elle agit sur l'écran. Cette distinction
 * est la raison d'être du module. Le compositeur intercepte `/<nom>` avant l'envoi, ouvre le
 * dialogue correspondant, et le serveur ne voit jamais cette frappe. Les maquettes
 * (`docs/design/maquette-opencodev2-ui.html`) fixent la liste et le libellé de chaque commande ;
 * ce fichier n'invente aucune option : chaque liste est construite depuis les données réelles que
 * le conteneur lui passe (agents du serveur, catalogue de modèles, sessions, skills, MCP…).
 *
 *la séparation est nette :
 *   - `COMMAND_IDS` / `commandMeta` décrivent *ce qui existe* (19 commandes, plus la palette) ;
 *   - `buildView(id, data)` projette les données réelles en une vue *à afficher* ;
 *   - le composant `CommandHost` (ui-commands.tsx) ne fait que rendre cette vue et tenir le clavier.
 *
 * Rien ici ne garde d'état : une vue est recalculée pendant le rendu, jamais écrite depuis un
 * `useEffect`. C'est ce qui rend chaque commande testable par une fonction, sans navigateur.
 */

export const COMMAND_IDS = [
  "agents",
  "models",
  "variants",
  "decision-model",
  "vision-model",
  "themes",
  "thinking",
  "timestamps",
  "timeline",
  "sessions",
  "status",
  "help",
  "skills",
  "subagent",
  "connect",
  "config",
  "logs",
  "diff",
  "mcps",
] as const

export type CommandId = (typeof COMMAND_IDS)[number]
/** La palette `ctrl+p` n'est pas une commande slash : elle ouvre la liste des 19 autres. */
export type ViewId = CommandId | "palette"

export const isCommandId = (value: string): value is CommandId =>
  (COMMAND_IDS as readonly string[]).includes(value)

export type CommandMeta = { id: CommandId; name: string; description: string }

/** Libellés et descriptions de la maquette — la source de vérité visuelle. */
export const commandMeta: Record<CommandId, CommandMeta> = {
  agents: { id: "agents", name: "/agents", description: "Switch agent" },
  models: { id: "models", name: "/models", description: "Switch model" },
  variants: { id: "variants", name: "/variants", description: "Switch model variant" },
  "decision-model": {
    id: "decision-model",
    name: "/decision-model",
    description: "Set the decision model",
  },
  "vision-model": { id: "vision-model", name: "/vision-model", description: "Set image fallback model" },
  themes: { id: "themes", name: "/themes", description: "Switch theme" },
  thinking: { id: "thinking", name: "/thinking", description: "Expand thinking" },
  timestamps: { id: "timestamps", name: "/timestamps", description: "Show timestamps" },
  timeline: { id: "timeline", name: "/timeline", description: "Jump to message" },
  sessions: { id: "sessions", name: "/sessions", description: "Switch session" },
  status: { id: "status", name: "/status", description: "View status" },
  help: { id: "help", name: "/help", description: "Help" },
  skills: { id: "skills", name: "/skills", description: "Skills" },
  subagent: { id: "subagent", name: "/subagent", description: "List the available subagents" },
  connect: { id: "connect", name: "/connect", description: "Connect provider" },
  config: { id: "config", name: "/config", description: "Open config" },
  logs: { id: "logs", name: "/logs", description: "Open logs" },
  diff: { id: "diff", name: "/diff", description: "Open diff viewer" },
  mcps: { id: "mcps", name: "/mcps", description: "Toggle MCPs" },
}

/** Une ligne de liste. `value` est la valeur réelle renvoyée au conteneur, jamais un libellé. */
export type Row = {
  value: string
  label: string
  detail?: string
  current?: boolean
  /** État d'un interrupteur (MCP). `undefined` = ce n'est pas un interrupteur. */
  on?: boolean
  /** `ok` connecté, `off` désactivé voulu, `bad` en échec. */
  tone?: "ok" | "off" | "bad"
}

export type DiffLine = { kind: "hunk" | "context" | "add" | "del"; text: string }
export type DiffFile = { name: string; lines: DiffLine[] }

export type View =
  | { kind: "list"; title: string; rows: Row[]; filterable: boolean; empty: string; hint?: string }
  | { kind: "toggles"; title: string; rows: Row[]; empty: string; hint?: string }
  | { kind: "info"; title: string; pairs: Array<readonly [string, string]>; hint?: string }
  | { kind: "keys"; title: string; keys: Array<readonly [string, string]>; hint?: string }
  | { kind: "diff"; title: string; files: DiffFile[]; empty: string; hint?: string }

/**
 * Toutes les données réelles dont une vue a besoin. Le conteneur les rassemble au moment où le
 * dialogue s'ouvre ; le module n'en charge aucune lui-même et n'en met aucune en cache.
 */
export type CommandData = {
  agents: Row[]
  models: Row[]
  variants: Row[]
  themes: Row[]
  decisionModel: string
  visionModel: string
  sessions: Row[]
  skills: Row[]
  subagents: Row[]
  providers: Row[]
  mcps: Row[]
  status: Array<readonly [string, string]>
  help: Array<readonly [string, string]>
  timeline: Row[]
  diff: DiffFile[]
  thinking: boolean
  timestamps: boolean
  theme: string
  configText: string
  logs: string[]
}

/**
 * Les thèmes **noirs** de la maquette, avec leurs valeurs `data-th` réelles. Aucun thème clair :
 * la règle absolue du dossier de design est « noir pur partout ».
 */
export const THEMES: Row[] = [
  { value: "", label: "Noir pur", detail: "default", current: true },
  { value: "contrast", label: "Noir contraste élevé" },
  { value: "warm", label: "Noir chaud", detail: "accent ambre" },
]

/** Les raccourcis réels de l'application — repris de la maquette, pas démontrés. */
export const HELP_KEYS: Array<readonly [string, string]> = [
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

const hint = "Esc"

/** La vue d'une commande. Pure : deux appels avec les mêmes données rendent la même vue. */
export function buildView(id: ViewId, data: CommandData): View {
  switch (id) {
    case "agents":
      return {
        kind: "list",
        title: "Switch agent",
        rows: data.agents,
        filterable: true,
        empty: "No agent available.",
        hint,
      }
    case "models":
      return {
        kind: "list",
        title: "Switch model",
        rows: data.models,
        filterable: true,
        empty: "No model available.",
        hint,
      }
    case "variants":
      return {
        kind: "list",
        title: "Switch model variant",
        rows: data.variants,
        filterable: false,
        empty: "No variant for this model.",
        hint,
      }
    case "decision-model":
      return {
        kind: "list",
        title: "Decision model",
        rows: data.models.map((row) => ({ ...row, current: row.value === data.decisionModel })),
        filterable: true,
        empty: "No model available.",
        hint,
      }
    case "vision-model":
      return {
        kind: "list",
        title: "Vision model (image fallback)",
        rows: data.models.map((row) => ({ ...row, current: row.value === data.visionModel })),
        filterable: true,
        empty: "No model available.",
        hint,
      }
    case "themes":
      return {
        kind: "list",
        title: "Switch theme",
        rows: THEMES.map((row) => ({ ...row, current: row.value === data.theme })),
        filterable: false,
        empty: "No theme available.",
        hint,
      }
    case "thinking":
      return {
        kind: "toggles",
        title: "Thinking",
        rows: [{ value: "thinking", label: "Expanded thinking", detail: "show reasoning", on: data.thinking }],
        empty: "",
        hint,
      }
    case "timestamps":
      return {
        kind: "toggles",
        title: "Timestamps",
        rows: [{ value: "timestamps", label: "Show timestamps", detail: "message time", on: data.timestamps }],
        empty: "",
        hint,
      }
    case "timeline":
      return {
        kind: "list",
        title: "Jump to message",
        rows: data.timeline,
        filterable: true,
        empty: "No message in this session.",
        hint,
      }
    case "sessions":
      return {
        kind: "list",
        title: "Switch session",
        rows: data.sessions,
        filterable: true,
        empty: "No session yet.",
        hint,
      }
    case "status":
      return { kind: "info", title: "Status", pairs: data.status, hint }
    case "help":
      return { kind: "keys", title: "Help", keys: data.help.length > 0 ? data.help : HELP_KEYS, hint }
    case "skills":
      return {
        kind: "list",
        title: "Skills",
        rows: data.skills,
        filterable: true,
        empty: "No skill loaded.",
        hint,
      }
    case "subagent":
      return {
        kind: "list",
        title: "Subagents",
        rows: data.subagents,
        filterable: true,
        empty: "No subagent available.",
        hint,
      }
    case "connect":
      return {
        kind: "list",
        title: "Connect provider",
        rows: data.providers,
        filterable: true,
        empty: "No provider available.",
        hint,
      }
    case "config":
      return { kind: "info", title: "Configuration", pairs: [["file", data.configText]], hint }
    case "logs":
      return {
        kind: "info",
        title: "Logs",
        pairs: data.logs.map((line, index) => [`#${index + 1}`, line]),
        hint,
      }
    case "diff":
      return { kind: "diff", title: "Diff viewer", files: data.diff, empty: "No change in this session.", hint }
    case "mcps":
      return {
        kind: "toggles",
        title: "Toggle MCPs",
        rows: data.mcps,
        empty: "No MCP server configured.",
        hint,
      }
    case "palette":
      return {
        kind: "list",
        title: "Commands",
        rows: COMMAND_IDS.map((id) => ({ value: id, label: commandMeta[id].name, detail: commandMeta[id].description })),
        filterable: true,
        empty: "No matching command.",
        hint: "ctrl+p",
      }
  }
}

/** Filtre une liste sur le libellé **et** le détail — chercher `claude` trouve tous ses variants. */
export function filterRows(rows: Row[], query: string): Row[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return rows
  return rows.filter(
    (row) => row.label.toLowerCase().includes(needle) || (row.detail ?? "").toLowerCase().includes(needle),
  )
}

/**
 * La touche à traiter par le piège de focus. `Tab` ramène au premier élément depuis le dernier et
 * `Shift+Tab` au dernier depuis le premier ; renvoie `undefined` pour les autres touches.
 */
export function trapKey(
  key: string,
  shift: boolean,
  current: number,
  count: number,
): "first" | "last" | undefined {
  if (count === 0) return undefined
  if (key !== "Tab") return undefined
  if (shift && current <= 0) return "last"
  if (!shift && current >= count - 1) return "first"
  return undefined
}
