export interface ArchivedRow {
  id: string
  title: string
  date: string
}

export function archivedDate(session: unknown): string
export function toArchivedRows(sessions: unknown): ArchivedRow[]
export function filterArchived(rows: ArchivedRow[], query: string): ArchivedRow[]
export function loadArchivedSessions(fetchImpl?: typeof fetch): Promise<ArchivedRow[]>
export function unarchiveSession(id: string, fetchImpl?: typeof fetch): Promise<boolean>
