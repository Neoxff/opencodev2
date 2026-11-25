export interface FilePart {
  type: "file"
  mime: string
  filename: string
  url: string
}

export interface FileChoice {
  name?: string
  filename?: string
  mime?: string
  dataUrl?: string
}

export function basename(name: unknown): string
export function attachmentMaxBytes(mime: string): number
export function fileSizeLabel(bytes: number): string
export function validateFile(file: { name?: unknown; type?: unknown; size?: unknown }): string | undefined
export function buildFilePart(file: FileChoice): FilePart
