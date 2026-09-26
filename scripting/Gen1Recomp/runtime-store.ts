import { Script } from "scripting"
import { PATHS, readVerifiedLibraryRom, type LibraryRow } from "./host"
import { LOVEJS_RUNTIME } from "./runtime-manifest"
import { parseRuntimeBridgeMessage } from "./runtime-bridge"
import {
  GEN1_PAYLOAD_BRIDGE_PATH, GEN1_ROM_BRIDGE_PATH, NOGAME_BRIDGE_PATH, RUNTIME_SUPPORT_PATHS,
  parseRuntimeResourceRequest, runtimeCandidatePath, type BridgedRuntimePath,
} from "./runtime-resource"
import { readVerifiedStagedPayload } from "./component-store"

const RUNTIMES_ROOT = `${PATHS.cores}/runtimes`
const DESTINATION = `${RUNTIMES_ROOT}/${LOVEJS_RUNTIME.id}`
const TRANSACTION = `${PATHS.transactions}/runtime-${LOVEJS_RUNTIME.id}`
const MANIFEST = `${DESTINATION}/runtime.v1.json`

export interface RuntimeCandidate {
  schemaVersion: 1
  id: string
  loveVersion: string
  adapterVersion: number
  bridgeProtocol: number
  sourceRevision: string
  updatePolicy: string
  installedAt: string
  state: "candidate"
  files: Array<{ path: string, sha256: string }>
}

export interface LoveJsBootReport {
  schemaVersion: 2
  testedAt: string
  runtimeId: string
  probe: "nogame" | "gen1recomp-payload" | "gen1recomp-gameplay"
  payloadVersion?: string
  status: "ready" | "error" | "timeout"
  stage: "load-file" | "wait-for-load" | "bridge-handshake" | "resource-preflight" | "player-load" | "runtime-ready" | "complete"
  detail: string
  milestones: string[]
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
function bundledRuntimePath(path: string): string {
  return path.startsWith("adapter/")
    ? `${Script.directory}/runtime/adapter/${path.slice("adapter/".length)}`
    : `${Script.directory}/runtime/lovejs/${path}`
}

async function digest(path: string): Promise<string> {
  return Crypto.sha256(await FileManager.readAsData(path)).toHexString().toLowerCase()
}

function isCandidate(value: unknown): value is RuntimeCandidate {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<RuntimeCandidate>
  return item.schemaVersion === 1 && item.id === LOVEJS_RUNTIME.id
    && item.loveVersion === LOVEJS_RUNTIME.loveVersion
    && item.adapterVersion === LOVEJS_RUNTIME.adapterVersion
    && item.bridgeProtocol === LOVEJS_RUNTIME.bridgeProtocol
    && item.sourceRevision === LOVEJS_RUNTIME.sourceRevision
    && item.updatePolicy === LOVEJS_RUNTIME.updatePolicy
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
      const source = bundledRuntimePath(file.path)
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
      adapterVersion: LOVEJS_RUNTIME.adapterVersion,
      bridgeProtocol: LOVEJS_RUNTIME.bridgeProtocol,
      sourceRevision: LOVEJS_RUNTIME.sourceRevision,
      updatePolicy: LOVEJS_RUNTIME.updatePolicy,
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

interface BootProbeOptions {
  probe: LoveJsBootReport["probe"]
  gamePath: BridgedRuntimePath
  resourcePaths: BridgedRuntimePath[]
  extraResources?: Map<BridgedRuntimePath, ScriptingData>
  payloadVersion?: string
  runtimeTimeoutMs: number
  hostTimeoutMs: number
  finalName: string
  progressName: string
  presentOnReady?: boolean
}

async function runBootProbe(options: BootProbeOptions): Promise<LoveJsBootReport> {
  await verifyRuntimeCandidate()
  const resources = new Map<BridgedRuntimePath, ScriptingData>(options.extraResources)
  const resourceOffsets = new Map<BridgedRuntimePath, number>()
  for (const path of options.resourcePaths) {
    if (!resources.has(path)) {
      resources.set(path, await FileManager.readAsData(`${DESTINATION}/${runtimeCandidatePath(path)}`))
    }
    resourceOffsets.set(path, 0)
  }
  await ensureDirectory(PATHS.diagnostics)
  const finalPath = `${PATHS.diagnostics}/${options.finalName}`
  const progressPath = `${PATHS.diagnostics}/${options.progressName}`
  const runtimeErrorPath = `${PATHS.diagnostics}/${options.probe}-runtime-error.v1.json`
  await removeIfExists(runtimeErrorPath)
  const startedAt = new Date().toISOString()
  const controller = new WebViewController({ ephemeral: true })
  const milestones: string[] = []
  let stage: LoveJsBootReport["stage"] = "load-file"
  const stageOrder: LoveJsBootReport["stage"][] = [
    "load-file", "wait-for-load", "bridge-handshake", "resource-preflight",
    "player-load", "runtime-ready", "complete",
  ]
  const advanceStage = (next: LoveJsBootReport["stage"]): void => {
    if (stageOrder.indexOf(next) > stageOrder.indexOf(stage)) stage = next
  }
  let resolveEvent: ((value: LoveJsBootReport) => void) | null = null
  const event = new Promise<LoveJsBootReport>((resolve) => { resolveEvent = resolve })
  const writeProgress = async (): Promise<void> => {
    await FileManager.writeAsString(progressPath, JSON.stringify({
      schemaVersion: 2, runtimeId: LOVEJS_RUNTIME.id, probe: options.probe,
      payloadVersion: options.payloadVersion, startedAt, stage, milestones,
    }, null, 2))
  }
  let progressWrites = Promise.resolve()
  const queueProgress = (): Promise<void> => {
    const next = progressWrites.then(writeProgress)
    progressWrites = next.catch(() => { /* A later final report remains authoritative. */ })
    return next
  }
  const failed = (status: "error" | "timeout", detail: string): LoveJsBootReport => ({
    schemaVersion: 2,
    testedAt: new Date().toISOString(),
    runtimeId: LOVEJS_RUNTIME.id,
    probe: options.probe,
    payloadVersion: options.payloadVersion,
    status,
    stage,
    detail,
    milestones: [...milestones],
    canvasWidth: 0,
    canvasHeight: 0,
    indexedDB: false,
    webAssembly: false,
    provesGameplay: false,
  })
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    await controller.addScriptMessageHandler("gen1HostBridge", async (raw?: unknown) => {
      const message = parseRuntimeBridgeMessage(raw)
      if (!message) return { accepted: false }
      if (message.type === "session.config") {
        return {
          ok: true,
          gamePath: options.gamePath,
          resourcePaths: options.resourcePaths,
          timeoutMs: options.runtimeTimeoutMs,
        }
      }
      if (message.type === "resource.read") {
        const request = parseRuntimeResourceRequest(message)
        if (!request) return { accepted: false, error: "invalid-resource-request" }
        const resource = resources.get(request.path)
        const expectedOffset = resourceOffsets.get(request.path)
        if (!resource || expectedOffset == null || request.offset !== expectedOffset
          || request.offset >= resource.size) return { accepted: false, error: "resource-range" }
        const end = Math.min(resource.size, request.offset + request.length)
        resourceOffsets.set(request.path, end)
        return {
          ok: true,
          path: request.path,
          offset: request.offset,
          total: resource.size,
          base64: resource.slice(request.offset, end).toBase64String(),
          eof: end === resource.size,
        }
      }
      milestones.push(message.type)
      if (message.type === "bridge.ready") advanceStage("resource-preflight")
      if (message.type === "resources.ready") advanceStage("player-load")
      if (message.type === "player.loaded") advanceStage("runtime-ready")
      queueProgress().catch(() => { /* The final report still records in-memory milestones. */ })

      if (message.type === "runtime.error") {
        await FileManager.writeAsString(runtimeErrorPath, JSON.stringify({
          schemaVersion: 1,
          recordedAt: new Date().toISOString(),
          runtimeId: LOVEJS_RUNTIME.id,
          probe: options.probe,
          stage,
          detail: message.detail,
          milestones: [...milestones],
        }, null, 2))
      }
      if (message.type === "resources.error" || message.type === "runtime.error") {
        resolveEvent?.(failed("error", message.detail))
      } else if (message.type === "runtime.timeout") {
        resolveEvent?.(failed("timeout", message.detail))
      } else if (message.type === "runtime.ready") {
        const data = message.data
        if (data.playerUri !== options.gamePath) {
          resolveEvent?.(failed("error", "Runtime meldete postrun für ein unerwartetes Fallback-Paket."))
          return { accepted: true }
        }
        resolveEvent?.({
          schemaVersion: 2,
          testedAt: new Date().toISOString(),
          runtimeId: LOVEJS_RUNTIME.id,
          probe: options.probe,
          payloadVersion: options.payloadVersion,
          status: "ready",
          stage: "complete",
          detail: message.detail,
          milestones: [...milestones],
          canvasWidth: typeof data.canvasWidth === "number" ? data.canvasWidth : 0,
          canvasHeight: typeof data.canvasHeight === "number" ? data.canvasHeight : 0,
          indexedDB: data.indexedDB === true,
          webAssembly: data.webAssembly === true,
          provesGameplay: false,
        })
      }
      return { accepted: true }
    })

    const execution = (async (): Promise<LoveJsBootReport> => {
      await queueProgress()
      const entry = `${DESTINATION}/harness.html`
      const loaded = await controller.loadFile(entry, DESTINATION)
      if (!loaded) throw new Error("loadFile meldete false.")
      advanceStage("wait-for-load")
      await queueProgress()
      if (!(await controller.waitForLoad())) throw new Error("waitForLoad meldete false.")
      advanceStage("bridge-handshake")
      await queueProgress()
      return event
    })()
    const hostTimeout = new Promise<LoveJsBootReport>((resolve) => {
      timer = setTimeout(() => resolve(failed(
        "timeout", `Host-Timeout nach ${Math.round(options.hostTimeoutMs / 1000)} Sekunden in Phase ${stage}.`,
      )), options.hostTimeoutMs)
    })
    let report: LoveJsBootReport
    try {
      report = await Promise.race([execution, hostTimeout])
    } catch (error) {
      report = failed("error", error instanceof Error ? error.message : String(error))
    }
    if (timer != null) clearTimeout(timer)
    await progressWrites
    await FileManager.writeAsString(finalPath, JSON.stringify(report, null, 2))
    try { await removeIfExists(progressPath) } catch { /* Final report is authoritative. */ }
    if (report.status === "ready" && options.presentOnReady) {
      await controller.present({ fullscreen: true, navigationTitle: "Gen1Recomp · Experimentell" })
    }
    return report
  } finally {
    if (timer != null) clearTimeout(timer)
    controller.dispose()
  }
}

export async function runLoveJsBootProbe(): Promise<LoveJsBootReport> {
  return runBootProbe({
    probe: "nogame",
    gamePath: NOGAME_BRIDGE_PATH,
    resourcePaths: [NOGAME_BRIDGE_PATH, ...RUNTIME_SUPPORT_PATHS],
    runtimeTimeoutMs: 30_000,
    hostTimeoutMs: 40_000,
    finalName: "lovejs-boot.v2.json",
    progressName: "lovejs-boot-progress.v2.json",
  })
}

export async function runGen1PayloadBootProbe(): Promise<LoveJsBootReport> {
  const payload = await readVerifiedStagedPayload()
  return runBootProbe({
    probe: "gen1recomp-payload",
    gamePath: GEN1_PAYLOAD_BRIDGE_PATH,
    resourcePaths: [GEN1_PAYLOAD_BRIDGE_PATH, ...RUNTIME_SUPPORT_PATHS],
    extraResources: new Map([[GEN1_PAYLOAD_BRIDGE_PATH, payload.data]]),
    payloadVersion: payload.metadata.version,
    runtimeTimeoutMs: 90_000,
    hostTimeoutMs: 105_000,
    finalName: "gen1recomp-payload-boot.v1.json",
    progressName: "gen1recomp-payload-boot-progress.v1.json",
  })
}

export async function presentGen1PayloadPreview(): Promise<LoveJsBootReport> {
  const payload = await readVerifiedStagedPayload()
  return runBootProbe({
    probe: "gen1recomp-payload",
    gamePath: GEN1_PAYLOAD_BRIDGE_PATH,
    resourcePaths: [GEN1_PAYLOAD_BRIDGE_PATH, ...RUNTIME_SUPPORT_PATHS],
    extraResources: new Map([[GEN1_PAYLOAD_BRIDGE_PATH, payload.data]]),
    payloadVersion: payload.metadata.version,
    runtimeTimeoutMs: 90_000,
    hostTimeoutMs: 105_000,
    finalName: "gen1recomp-preview.v1.json",
    progressName: "gen1recomp-preview-progress.v1.json",
    presentOnReady: true,
  })
}

export async function presentGen1Gameplay(row: LibraryRow): Promise<LoveJsBootReport> {
  const [payload, rom] = await Promise.all([readVerifiedStagedPayload(), readVerifiedLibraryRom(row)])
  return runBootProbe({
    probe: "gen1recomp-gameplay",
    gamePath: GEN1_PAYLOAD_BRIDGE_PATH,
    resourcePaths: [GEN1_PAYLOAD_BRIDGE_PATH, GEN1_ROM_BRIDGE_PATH, ...RUNTIME_SUPPORT_PATHS],
    extraResources: new Map<BridgedRuntimePath, ScriptingData>([
      [GEN1_PAYLOAD_BRIDGE_PATH, payload.data],
      [GEN1_ROM_BRIDGE_PATH, rom],
    ]),
    payloadVersion: payload.metadata.version,
    runtimeTimeoutMs: 180_000,
    hostTimeoutMs: 195_000,
    finalName: "gen1recomp-gameplay.v1.json",
    progressName: "gen1recomp-gameplay-progress.v1.json",
    presentOnReady: true,
  })
}
