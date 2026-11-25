export interface SessionErrorLine {
  key: string
  kind: "p"
  html: string
  retry?: boolean
}

export interface RetryInfo {
  attempt: number
  message: string
  title: string
  reason: string
  provider: string
  label: string
  link?: string
  next?: number
}

export function sanitizeErrorText(value: unknown): string
export function retryInfo(status: unknown): RetryInfo | undefined
export function retryTimeLabel(next: number, now?: number): string
export function runStatusLabel(status: unknown, now?: number): string
export function isTitleError(event: unknown): boolean
export function errorLine(status: unknown, ctx?: { sessionID?: string; now?: number }): SessionErrorLine | undefined
export function isStaleBusy(status: unknown, hasLiveStream?: boolean): boolean
export function shouldInterrupt(running: boolean, status: unknown, menuOpen?: boolean): boolean
export function statusErrorLine(event: unknown, ctx?: { sessionID?: string; now?: number }): SessionErrorLine | undefined
