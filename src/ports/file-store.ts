export interface FileStat {
  readonly type: 'file' | 'directory' | 'link' | 'notFound'
  readonly size: number
  readonly modificationDate: number
}

export interface FileStore {
  exists(path: string): Promise<boolean>
  stat(path: string): Promise<FileStat>
  makeDirectory(path: string, recursive: boolean): Promise<void>
  readBytes(path: string): Promise<Uint8Array>
  writeBytes(path: string, data: Uint8Array): Promise<void>
  readText(path: string): Promise<string>
  writeText(path: string, data: string): Promise<void>
  list(path: string): Promise<readonly string[]>
  rename(from: string, to: string): Promise<void>
  copy(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
}

export interface DigestPort {
  sha256(data: Uint8Array): Promise<string>
}

export interface ClockPort {
  nowIso(): string
}
