export interface TodoRow {
  content: string
  className: string
  status?: string
}

export interface ModifiedFile {
  path: string
  name: string
  dir: string
  additions: number
  deletions: number
  binary: boolean
  created: boolean
  deleted: boolean
}

export function todoClass(status: string): string
export function todoRows(todos: unknown): TodoRow[]
export function todoHtml(todos: unknown): string
export function splitPath(path: unknown): { name: string; dir: string }
export function fileFromDiff(entry: unknown): ModifiedFile | undefined
export function modifiedFiles(diff: unknown): {
  files: ModifiedFile[]
  totals: { additions: number; deletions: number }
}
export function fileRow(file: ModifiedFile, sessionID?: string): string
export function modifiedFilesHtml(diff: unknown, sessionID?: string): string
