export const SAFE_CONFIG_FIELDS: string[]

export function redactSecrets(value: unknown): unknown
export function sanitizeConfig(config: unknown): Record<string, unknown>
export function configToJson(config: unknown): string
export function validateConfigPatch(text: string): {
  ok: boolean
  value?: Record<string, unknown>
  error?: string
}

export function loadConfig(fetchImpl?: typeof fetch): Promise<Record<string, unknown>>
export function updateConfig(
  patch: Record<string, unknown> | string,
  fetchImpl?: typeof fetch,
): Promise<Record<string, unknown>>

export function formatLogLines(
  messages: unknown,
  statuses: unknown,
  sessionID: string,
  maintenant?: number,
): string[]
export function loadSessionLog(sessionID: string, fetchImpl?: typeof fetch): Promise<string[]>

export function keyboardDecision(
  event: { key?: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean },
  state?: {
    running?: boolean
    canSteer?: boolean
    hasSelection?: boolean
    configEditing?: boolean
  },
): string

export function steerSupported(doc: unknown, health: unknown): boolean
export function loadCapabilities(fetchImpl?: typeof fetch): Promise<{ canSteer: boolean }>
export function buildPromptPayload(text: string, options?: Record<string, unknown>): Record<string, unknown>
export function sendPrompt(sessionID: string, payload: unknown, fetchImpl?: typeof fetch): Promise<{ ok: boolean }>
export function renameSession(sessionID: string, title: string, fetchImpl?: typeof fetch): Promise<unknown>
export function deleteSession(sessionID: string, fetchImpl?: typeof fetch): Promise<{ ok: boolean }>
export function abortSession(sessionID: string, fetchImpl?: typeof fetch): Promise<{ ok: boolean }>
