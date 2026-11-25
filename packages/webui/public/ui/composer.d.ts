export interface ComposerAgent {
  name: string
  description: string
  mode: string
}

export interface ComposerModel {
  id: string
  providerID: string
  name: string
  variants: string[]
  limit?: { context?: number; input?: number | null; output?: number }
  status: string
}

export interface ComposerSelection {
  agent: string
  modelID: string
  providerID: string
  modelName: string
  variant: string
}

export interface ComposerMetrics {
  used: number
  limit: number
  percent: number
  tps?: number
}

export function isPrimaryAgent(agent: unknown): boolean
export function orderAllAgents(agents: unknown): ComposerAgent[]
export function orderAgents(agents: unknown): ComposerAgent[]
export function primaryAgentsOrFallback(agents: unknown): ComposerAgent[]
export function foldText(value: unknown): string
export interface FilterChoice {
  0?: string
  1?: string
  n?: string
  d?: string
  tag?: string
}
export function filterChoices(list: unknown, query: string): FilterChoice[]
export function moveActive(key: string, active: number, count: number): number
export function sanitizeModels(providersPayload: unknown): ComposerModel[]
export function variantsFor(models: unknown, id: string): string[]
export function selectionFromSession(models: unknown, agents: unknown, session: unknown): ComposerSelection
export function buildPromptPayload(
  text: string,
  selection: ComposerSelection,
  mode?: "send" | "steer",
): {
  agent: string
  model: { providerID: string; modelID: string }
  variant?: string
  parts: Array<{ type: string; text: string; metadata?: { steer: boolean } }>
}
export function steerSupported(doc: unknown, health: unknown): boolean
export function submitMode(input: { key: string; altKey?: boolean; running?: boolean; canSteer?: boolean }):
  | "send"
  | "queue"
  | "steer"
  | "interrupt"
  | "unsupported"
  | "ignore"
export function buttonAction(running: boolean): "send" | "interrupt"
export function keyboardDecision(
  event: { key?: string; altKey?: boolean },
  state: { running?: boolean; canSteer?: boolean },
): "send" | "queue" | "steer" | "interrupt" | "unsupported" | "ignore"
export function sessionMetrics(session: unknown, messages: unknown, model: unknown): ComposerMetrics
export function statusParts(
  metrics: ComposerMetrics,
  selection: ComposerSelection,
): { agent: string; model: string; variant: string; tokens: string; tps: string }
export function loadComposerConfig(fetchImpl?: typeof fetch): Promise<{
  agents: ComposerAgent[]
  models: ComposerModel[]
  canSteer: boolean
}>
export function loadSessionState(
  sessionID: string,
  fetchImpl?: typeof fetch,
): Promise<{
  session: Record<string, unknown>
  messages: unknown[]
  status: unknown
  busy: boolean
}>
export function sendPrompt(sessionID: string, payload: Record<string, unknown>, fetchImpl?: typeof fetch): Promise<{ ok: true }>
export function abortSession(sessionID: string, fetchImpl?: typeof fetch): Promise<{ ok: true }>
