import { Script } from "scripting"
import { PATHS } from "./host"
import { LOVEJS_RUNTIME } from "./runtime-manifest"

const RUNTIMES_ROOT = `${PATHS.cores}/runtimes`
const DESTINATION = `${RUNTIMES_ROOT}/${LOVEJS_RUNTIME.id}`
const TRANSACTION = `${PATHS.transactions}/runtime-${LOVEJS_RUNTIME.id}`
const MANIFEST = `${DESTINATION}/runtime.v1.json`

export interface RuntimeCandidate {
  schemaVersion: 1
  id: string
  loveVersion: string
  sourceRevision: string
  installedAt: string
  state: "candidate"
  files: Array<{ path: string, sha256: string }>
}

export interface LoveJsBootReport {
  schemaVersion: 1
  testedAt: string
  runtimeId: string
  status: "ready" | "error" | "timeout"
  detail: string
  canvasWidth: number
  canvasHeight: number
  indexedDB: boolean
  webAssembly: boolean
  provesGameplay: false
}

async function exists(path: string): Promise<boolean> { return FileManager.exists(path) }
async function ensureDirectory(path: string): Promise<void> {
  if (!(await exists(path))) await FileManager.createDirectory(path, true)
}
async function removeIfExists(path: string): Promise<void> {
  if (await exists(path)) await FileManager.remove(path)
}
function parent(path: string): string { return path.slice(0, path.lastIndexOf("/")) }

async function digest(path: string): Promise<string> {
  return Crypto.sha256(await FileManager.readAsData(path)).toHexString().toLowerCase()
}

function isCandidate(value: unknown): value is RuntimeCandidate {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<RuntimeCandidate>
  return item.schemaVersion === 1 && item.id === LOVEJS_RUNTIME.id
    && item.loveVersion === LOVEJS_RUNTIME.loveVersion
    && item.sourceRevision === LOVEJS_RUNTIME.sourceRevision
    && item.state === "candidate" && typeof item.installedAt === "string"
    && Array.isArray(item.files) && item.files.length === LOVEJS_RUNTIME.files.length
}

export async function recoverRuntimeTransaction(): Promise<boolean> {
  if (!(await exists(TRANSACTION))) return false
  await removeIfExists(TRANSACTION)
  return true
}

export async function loadRuntimeCandidate(): Promise<RuntimeCandidate | null> {
  if (!(await exists(MANIFEST))) return null
  try {
    const parsed = JSON.parse(await FileManager.readAsString(MANIFEST)) as unknown
    return isCandidate(parsed) ? parsed : null
  } catch { return null }
}

export async function verifyRuntimeCandidate(): Promise<RuntimeCandidate> {
  const candidate = await loadRuntimeCandidate()
  if (!candidate) throw new Error("Der love.js-Runtime-Kandidat ist nicht installiert oder sein Manifest ist ungültig.")
  for (const file of LOVEJS_RUNTIME.files) {
    const path = `${DESTINATION}/${file.path}`
    if (!(await exists(path)) || await digest(path) !== file.sha256) {
      throw new Error(`Runtime-Datei fehlt oder hat einen falschen SHA-256: ${file.path}`)
    }
  }
  return candidate
}

export async function installRuntimeCandidate(): Promise<RuntimeCandidate> {
  const existing = await loadRuntimeCandidate()
  if (existing) return verifyRuntimeCandidate()
  if (await exists(DESTINATION)) {
    throw new Error("Ein unvollständiger Runtime-Zielordner wurde nicht überschrieben.")
  }
  await ensureDirectory(PATHS.transactions)
  await ensureDirectory(RUNTIMES_ROOT)
  await recoverRuntimeTransaction()
  await ensureDirectory(TRANSACTION)
  try {
    for (const file of LOVEJS_RUNTIME.files) {
      const source = `${Script.directory}/runtime/lovejs/${file.path}`
      if (!(await exists(source)) || await digest(source) !== file.sha256) {
        throw new Error(`Mitgelieferte Runtime-Datei fehlt oder ist verändert: ${file.path}`)
      }
      const destination = `${TRANSACTION}/${file.path}`
      await ensureDirectory(parent(destination))
      await FileManager.copyFile(source, destination)
      if (await digest(destination) !== file.sha256) {
        throw new Error(`Runtime-Stagingprüfung fehlgeschlagen: ${file.path}`)
      }
    }
    const candidate: RuntimeCandidate = {
      schemaVersion: 1,
      id: LOVEJS_RUNTIME.id,
      loveVersion: LOVEJS_RUNTIME.loveVersion,
      sourceRevision: LOVEJS_RUNTIME.sourceRevision,
      installedAt: new Date().toISOString(),
      state: "candidate",
      files: LOVEJS_RUNTIME.files.map((file) => ({ ...file })),
    }
    await FileManager.writeAsString(`${TRANSACTION}/runtime.v1.json`, JSON.stringify(candidate, null, 2))
    await FileManager.rename(TRANSACTION, DESTINATION)
    return candidate
  } catch (error) {
    try { await removeIfExists(TRANSACTION) } catch { /* Preserve original error. */ }
    throw error
  }
}

export async function runLoveJsBootProbe(): Promise<LoveJsBootReport> {
  await verifyRuntimeCandidate()
  const controller = new WebViewController({ ephemeral: true })
  let resolveEvent: ((value: LoveJsBootReport) => void) | null = null
  const event = new Promise<LoveJsBootReport>((resolve) => { resolveEvent = resolve })
  try {
    await controller.addScriptMessageHandler("runtimeEvent", (raw?: unknown) => {
      const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
      const kind = value.kind === "ready" || value.kind === "timeout" ? value.kind : "error"
      const report: LoveJsBootReport = {
        schemaVersion: 1,
        testedAt: new Date().toISOString(),
        runtimeId: LOVEJS_RUNTIME.id,
        status: kind,
        detail: typeof value.detail === "string" ? value.detail : "Unknown WebView event",
        canvasWidth: typeof value.canvasWidth === "number" ? value.canvasWidth : 0,
        canvasHeight: typeof value.canvasHeight === "number" ? value.canvasHeight : 0,
        indexedDB: value.indexedDB === true,
        webAssembly: value.webAssembly === true,
        provesGameplay: false,
      }
      resolveEvent?.(report)
      return { accepted: true }
    })
    const entry = `${DESTINATION}/harness.html`
    const loaded = await controller.loadFile(entry, DESTINATION)
    if (!loaded || !(await controller.waitForLoad())) throw new Error("Die lokale love.js-Testseite konnte nicht geladen werden.")
    const report = await event
    await ensureDirectory(PATHS.diagnostics)
    await FileManager.writeAsString(`${PATHS.diagnostics}/lovejs-boot.v1.json`, JSON.stringify(report, null, 2))
    return report
  } finally {
    controller.dispose()
  }
}
