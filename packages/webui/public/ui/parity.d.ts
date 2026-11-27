export interface McpRow {
  name: string
  status: string
  label: string
  error: string
}

export interface McpCounts {
  connected: number
  total: number
  bad: number
}

export interface CommandRow {
  n: string
  k: string
  d: string
  tag: string
}

export interface WorkspaceRow {
  n: string
  c: number
  t: string
  open: boolean
  s: Array<{ id: string; t: string; m: string; busy: number }>
  more: number
}

export interface PanelView {
  title: string
  context: { used: number; limit: number; percent: number; cost: number; costText: string }
  goal: { st: string; dod: string[]; oos: string[] }
  lsp: Array<{ name: string; status: string; root: string }>
  todos: Array<{ content: string; status: string }>
  folder: string
  branch: string
  version: string
}

export interface ServerSnapshot {
  state: string
  url: string
  port: string
  version: string
  sessions: number
  mcp: McpCounts
  rows: McpRow[]
}

export function redact(text: unknown): string
export function mcpRows(statuses: unknown): McpRow[]
export function mcpCounts(rows: McpRow[]): McpCounts
export function mcpCommands(commands: unknown, rows: McpRow[]): CommandRow[]
export function buildDirectoryWorkspaces(
  projects: unknown,
  sessions: unknown,
  statuses: unknown,
  maintenant?: number,
  limite?: number,
): WorkspaceRow[]
export function formatCost(value: unknown): string
export function buildPanelView(input?: unknown): PanelView
export function loadParitySnapshot(fetchImpl?: typeof fetch, limite?: number): Promise<{
  mcp: McpRow[]
  commands: CommandRow[]
  workspaces: WorkspaceRow[]
}>
export function loadPanelData(
  sessionID: string,
  fetchImpl?: typeof fetch,
  metrics?: Record<string, unknown>,
): Promise<PanelView>
export function toggleMcp(name: string, connect: boolean, fetchImpl?: typeof fetch): Promise<{ rows: McpRow[]; ok: boolean }>
export function buildServerSnapshot(input?: unknown): ServerSnapshot
export function loadServerSnapshot(fetchImpl?: typeof fetch, origin?: string): Promise<ServerSnapshot>
