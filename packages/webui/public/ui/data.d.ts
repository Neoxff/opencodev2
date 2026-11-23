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
export function createSession(fetchImpl?: typeof fetch, payload?: Record<string, unknown>): Promise<unknown>
export function loadSession(
  sessionID: string,
  fetchImpl?: typeof fetch,
): Promise<{ session: unknown; messages: Array<{ role: string; text: string }> }>
