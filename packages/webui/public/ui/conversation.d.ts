export interface ConversationLine {
  key: string
  kind: "edit" | "th" | "run" | "del" | "p" | "me"
  i?: number
  ts?: number
  late?: boolean
  path?: string
  a?: string
  d?: string
  t?: string
  s?: string
  c?: string
  x?: string
  title?: string
  run?: boolean
  s0?: number
  o?: string
  html?: string
  text?: string
  queued?: boolean
}

export interface EventContext {
  sessionID?: string
  roles?: Record<string, string>
  roleByMessage?: Record<string, string>
  queued?: Record<string, boolean>
  busy?: boolean
}

export interface GoalView {
  st: string
  dod: string[]
  oos: string[]
}

export function escapeHtml(value: unknown): string
export function inlineCode(text: unknown): string
export function formatDuration(ms: number): string
export function eventToLines(event: unknown, ctx?: EventContext): ConversationLine[]
export function unwrapGlobalEvent(data: unknown): { id?: string; type: string; properties: Record<string, unknown> } | undefined
export function statusFromEvent(event: unknown): boolean | undefined
export function applyDelta(messages: unknown, event: unknown): unknown[]
export function queuedUserIDs(messages: unknown, busy: boolean): Record<string, boolean>
export function goalFromSession(session: unknown, todos: unknown): GoalView
export function buildConversation(messages: unknown, diffs: unknown, ctx?: EventContext): ConversationLine[]
export function renderLine(
  line: ConversationLine,
  ctx?: { icon?: (name: string, size?: string) => string; stamp?: (i: number, line?: ConversationLine) => string },
): string
