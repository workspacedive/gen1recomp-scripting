/**
 * Host Adapter — Ports & Adapters (Hexagonal)
 * VERIFIZIERT gegen Scripting Documentation.zip (App Store 2026-07-01)
 * pro_required: false — nutzt nur App-Store-APIs
 *
 * Core darf nie direkt FileManager/Storage/fetch importieren — nur diese Ports.
 * Adapter-Implementierungen: Scripting*Adapter (unten) + NoopAdapter (Tests)
 */

// ---------------------------------------------------------------------------
// Storage Port — gekapselt Storage + SQLite
// Quelle: Scripting Documentation/storage/en.md + sqlite/overview/en.md
// VERIFIZIERT
// ---------------------------------------------------------------------------
export type StorageScope = "private" | "shared"

export interface StoragePort {
  get<T>(key: string, scope?: StorageScope): T | null
  set<T>(key: string, value: T, scope?: StorageScope): boolean
  getData(key: string, scope?: StorageScope): Data | null
  setData(key: string, data: Data, scope?: StorageScope): void
  remove(key: string, scope?: StorageScope): void
  contains(key: string, scope?: StorageScope): boolean
  keys(scope?: StorageScope): string[]
  clear(scope?: StorageScope): void
}

// ---------------------------------------------------------------------------
// Files Port — gekapselt FileManager
// Quelle: file_manager/en.md — VERIFIZIERT
// ---------------------------------------------------------------------------
export interface FilesPort {
  readonly documentsDirectory: string
  readonly temporaryDirectory: string
  readonly appGroupDocumentsDirectory: string
  readonly iCloudDocumentsDirectory?: string
  readonly isiCloudEnabled: boolean

  exists(path: string): Promise<boolean>
  existsSync(path: string): boolean
  isFile(path: string): Promise<boolean>
  isDirectory(path: string): Promise<boolean>
  isLink(path: string): Promise<boolean>
  createDirectory(path: string, recursive?: boolean): Promise<void>
  readDirectory(path: string, recursive?: boolean): Promise<string[]>
  readAsString(path: string, encoding?: string): Promise<string>
  readAsStringSync(path: string, encoding?: string): string
  readAsBytes(path: string): Promise<Uint8Array>
  readAsBytesSync(path: string): Uint8Array
  readAsData(path: string): Promise<Data>
  writeAsString(path: string, data: string): Promise<void>
  writeAsStringSync(path: string, data: string): void
  writeAsBytes(path: string, data: Uint8Array): Promise<void>
  writeAsBytesSync(path: string, data: Uint8Array): void
  writeAsData(path: string, data: Data): Promise<void>
  copyFile(src: string, dst: string): Promise<void>
  copyFileSync(src: string, dst: string): void
  // NICHT VERIFIZIERT als atomar — nur als Fallback vorhanden
  moveFile?(src: string, dst: string): Promise<void>
  remove(path: string): Promise<void>
  bookmarkedPath?(name: string): string | null
  bookmarkExists?(name: string): boolean
  isFileStoredIniCloud?(path: string): boolean
  isICloudFileDownloaded?(path: string): boolean
  downloadFileFromiCloud?(path: string): Promise<boolean>
}

// ---------------------------------------------------------------------------
// Network Port — gekapselt fetch
// Quelle: request/en.md — VERIFIZIERT
// ---------------------------------------------------------------------------
export interface NetworkPort {
  fetch(input: string | Request, init?: RequestInit): Promise<Response>
  download(url: string, dest: string, opts: {
    expectedSha256?: string
    expectedSha1?: string
    signal?: AbortSignal
  }): Promise<void>
}

// ---------------------------------------------------------------------------
// Graphics Port — gekapselt Canvas / TimelineCanvas + WebView (für PipelineAdapter)
// Quelle: views/canvas/en.md — VERIFIZIERT (Canvas 2D)
//         views/webview/en.md + webview_controller/en.md — VERIFIZIERT (WebView als WKWebView)
//         WebGL innerhalb WebView — EXPERIMENTELL (WKWebView kann WebGL2 seit iOS 15, aber nicht in Scripting-Doku garantiert)
// ---------------------------------------------------------------------------
export type CanvasHandle = unknown // Scripting Canvas instance
export interface GraphicsPort {
  readonly supportsWebGL: false // im Canvas-Hauptthread immer false (NICHT VERIFIZIERT — nie drauf bauen)
  readonly supportsWebGPU: false
  createCanvas(spec: { width: number; height: number }): CanvasHandle
  // State-Fence für PipelineAdapter (entspricht love.graphics.push("all")/pop())
  pushAll?(): void
  popAll?(): void
  setTilt?(v: number): void
  // Voxel / Pipeline Erweiterung (Non-Pro):
  // - Canvas2D: immer verfügbar (default)
  // - WebView-WebGL: nur wenn WKWebView WebGL2 liefert — EXPERIMENTELL, BENCHMARK ERFORDERLICH
  readonly supportsWebView?: boolean // true wenn WebView vorhanden (VERIFIZIERT via views/webview)
  createWebView?(spec: { url?: string }): unknown // WKWebView Handle
  isWebGL2AvailableInWebView?(): Promise<boolean> // Probe in WebView — EXPERIMENTELL
  postMessageToWebView?(msg: unknown): void
}

export interface PipelinePort {
  list(): Array<{ id: string; def: unknown }>
  eligible(id: string): boolean
  worldPipeline(): string | null
  drawWorld(id: string, ctx: unknown): unknown | null
  worldPresent(canvas: unknown, ctx: unknown): unknown
  present(canvas: unknown, ctx: unknown): unknown
  level(id: string): number
  setLevel(id: string, n: number): number
  invalidate(): void
}

// ---------------------------------------------------------------------------
// Audio Port — gekapselt AVPlayer + SharedAudioSession
// Quelle: audio_player/en.md — VERIFIZIERT
// ---------------------------------------------------------------------------
export type AVPlayerHandle = {
  setSource(pathOrUrl: string): boolean
  play(atRate?: number): boolean
  pause(): void
  stop(): void
  dispose(): void
  volume: number
  currentTime: number
  duration: number
  onReadyToPlay?: () => void
  onEnded?: () => void
  onError?: (msg: string) => void
}
export interface AudioPort {
  createPlayer(): AVPlayerHandle
  setCategory(cat: string, opts?: string[]): Promise<void>
  setActive(active: boolean): Promise<void>
  addInterruptionListener(cb: (type: "began"|"ended") => void): void
}

// ---------------------------------------------------------------------------
// Input Port — gekapselt Touch / Haptics
// Quelle: haptics/en.md, view_modifiers/gesture — TEILWEISE VERIFIZIERT
// ---------------------------------------------------------------------------
export type TouchEvent = { x: number; y: number; type: "began"|"moved"|"ended"|"cancelled" }
export interface InputPort {
  onTouch(cb: (ev: TouchEvent) => void): () => void
  // NUR MIT HOST-UNTERSTÜTZUNG — nicht in Doku verifiziert
  onGamepad?(cb: (ev: unknown) => void): () => void
  vibrate?(style: "light"|"normal"|"strong"): void
}

// ---------------------------------------------------------------------------
// Lifecycle / Memory / Jobs / Timing / Haptics / Permissions
// ---------------------------------------------------------------------------
export interface LifecyclePort {
  onForeground(cb: () => void): () => void
  onBackground(cb: () => void): () => void
  // NUR MIT HOST-UNTERSTÜTZUNG — nicht explizit in Doku
  onMemoryPressure?(cb: () => void): () => void
}

export interface MemoryPort {
  estimate(): Promise<{ usedBytes: number; limitBytes?: number }>
  pressureLevel(): "normal" | "warning" | "critical"
}

export interface JobsPort {
  readonly isMainThread: boolean
  runInBackground<T>(fn: () => T | Promise<T>): Promise<T>
  runInMain(fn: () => void): void
}

export interface TimingPort {
  now(): number
  requestAnimationFrame(cb: (t: number) => void): number
  cancelAnimationFrame(id: number): void
}

export interface HapticsPort {
  impact(style: string): void
  notification(type: string): void
}

export interface PermissionsPort {
  requestFileAccess(name: string): Promise<string | null>
}

// ---------------------------------------------------------------------------
// Host — Aggregat aller Ports (für Dependency Injection)
// ---------------------------------------------------------------------------
export type Host = {
  storage: StoragePort
  files: FilesPort
  network: NetworkPort
  graphics: GraphicsPort
  pipelines?: PipelinePort
  audio: AudioPort
  input: InputPort
  lifecycle: LifecyclePort
  memory: MemoryPort
  jobs: JobsPort
  timing: TimingPort
  haptics: HapticsPort
  permissions: PermissionsPort
}
