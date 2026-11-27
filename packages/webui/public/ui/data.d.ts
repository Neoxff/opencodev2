export interface MaquetteSession {
  id: string
  t: string
  m: string
  busy: number
}

export interface MaquetteWorkspace {
  n: string
  t: string
  open: boolean
  s: MaquetteSession[]
  more: number
}

export interface LoadedConversation {
  session: Record<string, unknown>
  messages: unknown[]
  diffs: unknown[]
  status: unknown
  busy: boolean
  roles: Record<string, string>
  queued: Record<string, boolean>
  goal: import("./conversation.js").GoalView
  lines: import("./conversation.js").ConversationLine[]
}

export function relativeTime(timestamp: number | undefined, maintenant?: number): string
export function sessionActivityMap(statuses: unknown): Record<string, boolean>
export function buildWorkspaces(
  projects: unknown,
  sessions: unknown,
  statuses: unknown,
  maintenant?: number,
  limite?: number,
): MaquetteWorkspace[]
export function loadSidebarData(fetchImpl?: typeof fetch, maintenant?: number, limite?: number): Promise<MaquetteWorkspace[]>
export function createSession(fetchImpl?: typeof fetch, payload?: Record<string, unknown>, directory?: string): Promise<unknown>
export function fetchFolders(path: string, fetchImpl?: typeof fetch): Promise<{ path: string; parent: string | null; entries: Array<{ name: string; path: string }> }>
export function loadSession(
  sessionID: string,
  fetchImpl?: typeof fetch,
): Promise<{ session: unknown; messages: Array<{ role: string; text: string }> }>
export function loadConversation(sessionID: string, fetchImpl?: typeof fetch): Promise<LoadedConversation>
export function sendPrompt(sessionID: string, text: string, fetchImpl?: typeof fetch): Promise<{ ok: true }>

export * from "./conversation.js"
