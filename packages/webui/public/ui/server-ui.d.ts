export interface ServerMcpRow {
  name: string
  status: string
}

export interface ServerSnapshot {
  state: string
  url: string
  port: string
  version: string
  sessions: number
  stream: string
  mcp: ServerMcpRow[]
  mcpConnected: number
}

export function activeSessions(statuses: unknown): number
export function sanitizeMcp(mcp: unknown): ServerMcpRow[]
export function buildServerSnapshot(input?: Record<string, unknown>): ServerSnapshot
export function loadServerSnapshot(
  fetchImpl?: typeof fetch,
  origin?: string,
  streamConnected?: boolean,
): Promise<ServerSnapshot>
