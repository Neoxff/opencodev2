/** Commandes d'interface — données réelles, hors DEMO. Aucun DOM, aucun secret. */

export interface CommandRow {
  value: string
  label: string
  detail?: string
  current?: boolean
  on?: boolean
  tone?: "ok" | "off" | "bad"
  method?: number
}

export interface McpRow {
  n: string
  on: boolean
  detail: string
}

export interface DiffLine {
  kind: "hunk" | "context" | "add" | "del"
  text: string
}

export interface DiffFile {
  name: string
  lines: DiffLine[]
}

export const WRITABLE_MODEL_PATHS: string[]
export const HELP_KEYS: Array<readonly [string, string]>
export const THEME_VALUES: Array<readonly [string, string]>
export const VIEW_STATE_KEYS: { theme: string; thinking: string; timestamps: string }

export function asArray(value: unknown): any[]
export function text(value: unknown): string
export function configValue(config: unknown, dotted: string): unknown
export function agentRows(agents: unknown): CommandRow[]
export function providerPayloads(payload: unknown): any[]
export function modelRows(payload: unknown): CommandRow[]
export function variantsForModel(payload: unknown, model: string): string[]
export function variantRows(names: unknown, current: string): CommandRow[]
export function loadAgents(fetchImpl?: typeof fetch): Promise<CommandRow[]>
export function loadModels(fetchImpl?: typeof fetch): Promise<CommandRow[]>
export function loadVariants(model: string, fetchImpl?: typeof fetch): Promise<CommandRow[]>

export function commandConfigPatch(path: string, value: string): Record<string, unknown>
export function writeModelConfig(path: string, value: string, fetchImpl?: typeof fetch): Promise<Record<string, unknown>>
export function decisionRows(catalog: unknown): CommandRow[]
export function decisionCurrent(config: unknown): unknown
export function loadDecisionModels(fetchImpl?: typeof fetch): Promise<{
  catalog: Record<string, unknown>
  config: Record<string, unknown>
  current: unknown
}>
export function writeDecisionModel(value: string, fetchImpl?: typeof fetch): Promise<Record<string, unknown>>
export function visionCurrent(config: unknown): unknown
export function loadVisionModels(fetchImpl?: typeof fetch): Promise<{
  rows: CommandRow[]
  config: Record<string, unknown>
  current: unknown
}>
export function writeVisionModel(value: string, fetchImpl?: typeof fetch): Promise<Record<string, unknown>>

export function readViewState(storage: unknown, key: keyof typeof VIEW_STATE_KEYS, fallback: unknown): unknown
export function writeViewState(
  storage: unknown,
  key: keyof typeof VIEW_STATE_KEYS,
  value: unknown,
): unknown
export function themeValue(label: string): string

export function timelineRows(messages: unknown): CommandRow[]
export function loadTimeline(sessionID: string, fetchImpl?: typeof fetch): Promise<CommandRow[]>
export function sessionRows(sessions: unknown, current?: string): CommandRow[]
export function loadSessions(fetchImpl?: typeof fetch): Promise<CommandRow[]>

export function statusPairs(input?: Record<string, unknown>): Array<readonly [string, string]>
export function loadStatus(fetchImpl?: typeof fetch, origin?: string): Promise<{
  health: Record<string, unknown>
  mcp: Record<string, unknown>
  origin: string
  pairs: Array<readonly [string, string]>
}>

export function skillRows(skills: unknown): CommandRow[]
export function loadSkills(fetchImpl?: typeof fetch): Promise<CommandRow[]>
export function subagentRows(agents: unknown): CommandRow[]
export function loadSubagents(fetchImpl?: typeof fetch): Promise<CommandRow[]>

export function providerRows(auth: unknown, connected?: unknown): CommandRow[]
export function loadProviders(fetchImpl?: typeof fetch): Promise<{ auth: Record<string, unknown>; rows: CommandRow[] }>
export function providerOauthUrl(providerID: string, method: number, fetchImpl?: typeof fetch): Promise<string>

export function configPairs(config: unknown): Array<readonly [string, string]>
export function loadConfig(fetchImpl?: typeof fetch): Promise<{
  config: Record<string, unknown>
  pairs: Array<readonly [string, string]>
}>
export function logViewLines(
  messages: unknown,
  statuses: unknown,
  sessionID: string,
  maintenant?: number,
): string[]
export function loadLogView(sessionID: string, fetchImpl?: typeof fetch): Promise<string[]>
export function parsePatch(patch: string): DiffLine[]
export function diffFiles(snapshots: unknown): DiffFile[]
export function loadDiff(sessionID: string, fetchImpl?: typeof fetch): Promise<DiffFile[]>

export function mcpRows(status: unknown): McpRow[]
export function loadMcpStatus(fetchImpl?: typeof fetch): Promise<McpRow[]>
export function toggleMcp(name: string, on: boolean, fetchImpl?: typeof fetch): Promise<unknown>
