export interface DeliveryMessage {
  info?: { id?: string; role?: string; parentID?: string }
  parts?: Array<{ type?: string; id?: string; text?: string; metadata?: { [key: string]: unknown } }>
}

export function isSteerUser(message: unknown): boolean
export function hasSteerDelivered(message: unknown): boolean
export function steerServed(messages: unknown, steerID: string): boolean
export function isAnswered(messages: unknown, userID: string): boolean
export function queuedUserIDs(messages: unknown, busy: boolean): Record<string, boolean>
export function pendingSteer(messages: unknown): DeliveryMessage | undefined
export function isHiddenSteer(message: unknown): boolean
export function deliveryIndicator(messages: unknown, busy: boolean): string
export function queueAfterAbort(): Record<string, never>
export function steerDeliveryMode(steer: boolean, busy: boolean): "steer" | "send"
