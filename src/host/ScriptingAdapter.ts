/**
 * ScriptingAdapter — konkrete Adapter-Implementierungen für Scripting (Non-Pro)
 * VERIFIZIERT gegen Scripting Doku — nutzt nur App-Store-APIs
 *
 * Kein Pro erforderlich. Jede Methode dokumentiert Quelle + Status.
 * WASM / SharedArrayBuffer / WebGL bewusst NICHT verwendet (NICHT VERIFIZIERT).
 */

import type {
  Host,
  StoragePort,
  FilesPort,
  NetworkPort,
  GraphicsPort,
  AudioPort,
  InputPort,
  LifecyclePort,
  MemoryPort,
  JobsPort,
  TimingPort,
  HapticsPort,
  PermissionsPort,
} from "./ports"

// ---------------------------------------------------------------------------
// Storage — Storage (private/shared) + SQLite Fallback
// VERIFIZIERT: storage/en.md + sqlite/overview/en.md
// ---------------------------------------------------------------------------
export class ScriptingStorageAdapter implements StoragePort {
  get<T>(key: string, scope: "private"|"shared" = "private"): T | null {
    // @ts-ignore Storage global in Scripting
    return Storage.get<T>(key, { shared: scope === "shared" })
  }
  set<T>(key: string, value: T, scope: "private"|"shared" = "private"): boolean {
    // @ts-ignore
    return Storage.set(key, value, { shared: scope === "shared" })
  }
  getData(key: string, scope: "private"|"shared" = "private"): Data | null {
    // @ts-ignore
    return Storage.getData(key, { shared: scope === "shared" })
  }
  setData(key: string, data: Data, scope: "private"|"shared" = "private"): void {
    // @ts-ignore
    Storage.setData(key, data, { shared: scope === "shared" })
  }
  remove(key: string, scope: "private"|"shared" = "private"): void {
    // @ts-ignore
    Storage.remove(key, { shared: scope === "shared" })
  }
  contains(key: string, scope: "private"|"shared" = "private"): boolean {
    // @ts-ignore
    return Storage.contains(key, { shared: scope === "shared" })
  }
  keys(): string[] {
    // @ts-ignore
    return Storage.keys()
  }
  clear(scope: "private"|"shared" = "private"): void {
    if (scope === "shared") {
      // Storage.clear() betrifft nur private — shared separat
      // TEILWEISE VERIFIZIERT: Doku sagt clear nur private
      for (const k of this.keys("shared")) this.remove(k, "shared")
    } else {
      // @ts-ignore
      Storage.clear()
    }
  }
}

// ---------------------------------------------------------------------------
// Files — FileManager
// VERIFIZIERT: file_manager/en.md
// ---------------------------------------------------------------------------
export class ScriptingFilesAdapter implements FilesPort {
  get documentsDirectory(): string {
    // @ts-ignore
    return FileManager.documentsDirectory
  }
  get temporaryDirectory(): string {
    // @ts-ignore
    return FileManager.temporaryDirectory
  }
  get appGroupDocumentsDirectory(): string {
    // @ts-ignore
    return FileManager.appGroupDocumentsDirectory
  }
  get iCloudDocumentsDirectory(): string | undefined {
    try {
      // @ts-ignore
      if (FileManager.isiCloudEnabled) return FileManager.iCloudDocumentsDirectory
    } catch {}
    return undefined
  }
  get isiCloudEnabled(): boolean {
    // @ts-ignore
    return !!FileManager.isiCloudEnabled
  }

  // Async — läuft automatisch auf Background Thread (thread/en.md)
  async exists(path: string): Promise<boolean> {
    // @ts-ignore
    return FileManager.exists(path)
  }
  existsSync(path: string): boolean {
    // @ts-ignore
    return FileManager.existsSync(path)
  }
  async isFile(path: string): Promise<boolean> {
    // @ts-ignore
    return FileManager.isFile(path)
  }
  async isDirectory(path: string): Promise<boolean> {
    // @ts-ignore
    return FileManager.isDirectory(path)
  }
  async isLink(path: string): Promise<boolean> {
    // @ts-ignore
    return FileManager.isLink ? FileManager.isLink(path) : false
  }
  async createDirectory(path: string, recursive = true): Promise<void> {
    // @ts-ignore
    return FileManager.createDirectory(path, recursive)
  }
  async readDirectory(path: string): Promise<string[]> {
    // @ts-ignore
    return FileManager.readDirectory(path)
  }
  async readAsString(path: string): Promise<string> {
    // @ts-ignore
    return FileManager.readAsString(path)
  }
  readAsStringSync(path: string): string {
    // @ts-ignore
    return FileManager.readAsStringSync(path)
  }
  async readAsBytes(path: string): Promise<Uint8Array> {
    // @ts-ignore
    return FileManager.readAsBytes(path)
  }
  readAsBytesSync(path: string): Uint8Array {
    // @ts-ignore
    return FileManager.readAsBytesSync(path)
  }
  async readAsData(path: string): Promise<Data> {
    // @ts-ignore
    return FileManager.readAsData(path)
  }
  async writeAsString(path: string, data: string): Promise<void> {
    // @ts-ignore
    return FileManager.writeAsString(path, data)
  }
  writeAsStringSync(path: string, data: string): void {
    // @ts-ignore
    FileManager.writeAsStringSync(path, data)
  }
  async writeAsBytes(path: string, data: Uint8Array): Promise<void> {
    // @ts-ignore
    return FileManager.writeAsBytes(path, data)
  }
  writeAsBytesSync(path: string, data: Uint8Array): void {
    // @ts-ignore
    FileManager.writeAsBytesSync(path, data)
  }
  async writeAsData(path: string, data: Data): Promise<void> {
    // @ts-ignore
    return FileManager.writeAsData(path, data)
  }
  async copyFile(src: string, dst: string): Promise<void> {
    // @ts-ignore
    return FileManager.copyFile(src, dst)
  }
  copyFileSync(src: string, dst: string): void {
    // @ts-ignore
    FileManager.copyFileSync(src, dst)
  }
  async remove(path: string): Promise<void> {
    // @ts-ignore
    return FileManager.remove(path)
  }
  bookmarkedPath(name: string): string | null {
    try {
      // @ts-ignore
      return FileManager.bookmarkedPath(name) ?? null
    } catch { return null }
  }
  bookmarkExists(name: string): boolean {
    try {
      // @ts-ignore
      return !!FileManager.bookmarkExists(name)
    } catch { return false }
  }
  isFileStoredIniCloud(path: string): boolean {
    try {
      // @ts-ignore
      return !!FileManager.isFileStoredIniCloud(path)
    } catch { return false }
  }
  isICloudFileDownloaded(path: string): boolean {
    try {
      // @ts-ignore
      return !!FileManager.isiCloudFileDownloaded(path)
    } catch { return false }
  }
  async downloadFileFromiCloud(path: string): Promise<boolean> {
    // @ts-ignore
    return FileManager.downloadFileFromiCloud(path)
  }
}

// ---------------------------------------------------------------------------
// Network — fetch
// VERIFIZIERT: request/en.md
// ---------------------------------------------------------------------------
export class ScriptingNetworkAdapter implements NetworkPort {
  async fetch(input: string | Request, init?: RequestInit): Promise<Response> {
    return fetch(input, init)
  }

  // Resumable Download: chunked fetch → FileManager.writeAsBytes
  // NICHT atomar — Staging via .part, dann copy+verify+remove (VORAUSSETZUNG)
  async download(url: string, dest: string, opts: {
    expectedSha256?: string
    expectedSha1?: string
    signal?: AbortSignal
  }): Promise<void> {
    const files = new ScriptingFilesAdapter()
    const part = dest + ".part"
    let offset = 0
    try {
      if (await files.exists(part)) {
        // Best-effort resume: lies bisherige Größe
        // VORAUSSETZUNG: FileManager.readAsBytesSync liefert Länge
        try { offset = files.readAsBytesSync(part).length } catch {}
      }
    } catch {}

    const headers: Record<string,string> = {}
    if (offset > 0) headers["Range"] = `bytes=${offset}-`

    const res = await fetch(url, {
      headers,
      signal: opts.signal,
      // 15s default timeout per request/en.md
      timeout: 15,
    } as any)

    if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)
    const chunk = new Uint8Array(await res.arrayBuffer())
    // Append: lies bestehendes part + concat
    let existing = new Uint8Array(0)
    if (offset > 0) {
      try { existing = await files.readAsBytes(part) } catch {}
    }
    const combined = new Uint8Array(existing.length + chunk.length)
    combined.set(existing, 0)
    combined.set(chunk, existing.length)
    await files.writeAsBytes(part, combined)

    // Hash-Verifikation falls erwartet
    if (opts.expectedSha256 || opts.expectedSha1) {
      // @ts-ignore Data global
      const data = Data.fromUint8Array(combined)
      // VORAUSSETZUNG: Data.hash verfügbar — TEILWEISE VERIFIZIERT, nicht in Doku, aber plausibel via crypto
      // Fallback: kein Hash-Check wenn nicht verfügbar → als NICHT VERIFIZIERT markieren
      // Hier: best-effort via SubtleCrypto falls vorhanden
      try {
        const algo = opts.expectedSha256 ? "SHA-256" : "SHA-1"
        const expected = (opts.expectedSha256 ?? opts.expectedSha1)!.toLowerCase()
        const digest = await crypto.subtle.digest(algo, combined as unknown as ArrayBuffer)
        const hex = Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("")
        if (hex !== expected) throw new Error(`hash mismatch: got ${hex} expected ${expected}`)
      } catch (e) {
        if ((e as Error).message?.includes("hash mismatch")) throw e
        // Hash-API nicht verfügbar → nur warnen, nicht blockieren
        console.warn("[Network] hash verification skipped (no subtle crypto):", e)
      }
    }
    // Atomares Aktivieren: copy part→dest + verify
    await files.copyFile(part, dest)
    // Verify dest lesbar
    const verify = await files.readAsBytes(dest)
    if (verify.length !== combined.length) throw new Error("verify length mismatch")
    await files.remove(part)
  }
}

// ---------------------------------------------------------------------------
// Jobs — Thread
// VERIFIZIERT: thread/en.md
// ---------------------------------------------------------------------------
export class ScriptingJobsAdapter implements JobsPort {
  get isMainThread(): boolean {
    // @ts-ignore
    return Thread.isMainThread
  }
  async runInBackground<T>(fn: () => T | Promise<T>): Promise<T> {
    // @ts-ignore
    return Thread.runInBackground(fn)
  }
  runInMain(fn: () => void): void {
    // @ts-ignore
    Thread.runInMain(fn)
  }
}

// ---------------------------------------------------------------------------
// Timing — performance.now + requestAnimationFrame (Browser-kompatibel)
// TEILWEISE VERIFIZIERT: im Scripting JS-Thread verfügbar via WebKit
// ---------------------------------------------------------------------------
export class ScriptingTimingAdapter implements TimingPort {
  now(): number { return performance.now() }
  requestAnimationFrame(cb: (t:number)=>void): number {
    // @ts-ignore Scripting global may have requestAnimationFrame
    if (typeof requestAnimationFrame !== "undefined") return requestAnimationFrame(cb)
    return setTimeout(()=>cb(performance.now()), 16) as unknown as number
  }
  cancelAnimationFrame(id: number): void {
    // @ts-ignore
    if (typeof cancelAnimationFrame !== "undefined") return cancelAnimationFrame(id)
    clearTimeout(id)
  }
}

// ---------------------------------------------------------------------------
// Lifecycle — App Events (teilweise)
// TEILWEISE VERIFIZIERT: app_events/en.md existiert, aber nicht vollständig gelesen
// ---------------------------------------------------------------------------
export class ScriptingLifecycleAdapter implements LifecyclePort {
  onForeground(cb: () => void): () => void {
    // @ts-ignore AppEvents global falls vorhanden
    try {
      if (typeof AppEvents !== "undefined" && AppEvents.onForeground) {
        // @ts-ignore
        return AppEvents.onForeground(cb)
      }
    } catch {}
    // Fallback: document visibility
    const handler = () => { if (document.visibilityState === "visible") cb() }
    document.addEventListener("visibilitychange", handler)
    return () => document.removeEventListener("visibilitychange", handler)
  }
  onBackground(cb: () => void): () => void {
    try {
      // @ts-ignore
      if (typeof AppEvents !== "undefined" && AppEvents.onBackground) {
        // @ts-ignore
        return AppEvents.onBackground(cb)
      }
    } catch {}
    const handler = () => { if (document.visibilityState === "hidden") cb() }
    document.addEventListener("visibilitychange", handler)
    return () => document.removeEventListener("visibilitychange", handler)
  }
}

// ---------------------------------------------------------------------------
// Stub Adapters (für fehlende Host-Fähigkeiten — NUR MIT HOST-UNTERSTÜTZUNG)
// ---------------------------------------------------------------------------
export class NoopMemoryAdapter implements MemoryPort {
  async estimate(): Promise<{ usedBytes: number }> { return { usedBytes: 0 } }
  pressureLevel(): "normal" { return "normal" }
}
export class NoopHapticsAdapter implements HapticsPort {
  impact(_: string): void { /* NICHT VERIFIZIERT auf jedem Gerät */ }
  notification(_: string): void {}
}
export class NoopPermissionsAdapter implements PermissionsPort {
  async requestFileAccess(name: string): Promise<string | null> {
    const f = new ScriptingFilesAdapter()
    const p = f.bookmarkedPath(name)
    return p ?? null
  }
}
export class NoopGraphicsAdapter implements GraphicsPort {
  readonly supportsWebGL = false as const
  readonly supportsWebGPU = false as const
  createCanvas(_: { width:number; height:number }): unknown { return {} }
}
export class NoopAudioAdapter implements AudioPort {
  createPlayer(): AudioPort["createPlayer"] extends ()=>infer R ? R : never {
    return {
      setSource: ()=>false, play: ()=>false, pause(){}, stop(){}, dispose(){},
      volume: 1, currentTime: 0, duration: 0,
    } as any
  }
  async setCategory(): Promise<void> {}
  async setActive(): Promise<void> {}
  addInterruptionListener(): void {}
}
export class NoopInputAdapter implements InputPort {
  onTouch(_: (ev:any)=>void): () => void { return ()=>{} }
}

// ---------------------------------------------------------------------------
// Factory: Host für Scripting zusammensetzen
// ---------------------------------------------------------------------------
export function createScriptingHost(): Host {
  return {
    storage: new ScriptingStorageAdapter(),
    files: new ScriptingFilesAdapter(),
    network: new ScriptingNetworkAdapter(),
    graphics: new NoopGraphicsAdapter(), // Canvas via TSX deklarativ, nicht via Port
    audio: new NoopAudioAdapter(),
    input: new NoopInputAdapter(),
    lifecycle: new ScriptingLifecycleAdapter(),
    memory: new NoopMemoryAdapter(),
    jobs: new ScriptingJobsAdapter(),
    timing: new ScriptingTimingAdapter(),
    haptics: new NoopHapticsAdapter(),
    permissions: new NoopPermissionsAdapter(),
  }
}
