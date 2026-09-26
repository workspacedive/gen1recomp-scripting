import { fetch } from "scripting"
import type { UpstreamReleaseStatus } from "./component-catalog"
import { PATHS } from "./host"
import { parsePayloadVersionLua } from "./payload-metadata"
import { extractZipEntry } from "./zip-extract"
import { preflightZipArchive } from "./zip-preflight"

export const APPROVED_PAYLOAD = Object.freeze({
  version: "0.3.20",
  sourceRevision: "64dd9cb3a377b398b6132d223a121878f68b4b07",
  name: "gen1recomp-0.3.20.love",
  bytes: 24_908_860,
  sha256: "c0da7035afb110cb9b45556a44c855bd27c96903737128fa8114209b9eb7f0a5",
  url: "https://github.com/bryanthaboi/gen1recomp/releases/download/v0.3.20/gen1recomp-0.3.20.love",
})

const PAYLOADS_ROOT = `${PATHS.cores}/payloads`
const DESTINATION = `${PAYLOADS_ROOT}/${APPROVED_PAYLOAD.version}`
const METADATA = `${DESTINATION}/payload.v1.json`
const TRANSACTION = `${PATHS.transactions}/payload-${APPROVED_PAYLOAD.version}`

export interface StagedPayload {
  schemaVersion: 1
  component: "gen1recomp-payload"
  version: string
  sourceRevision: string
  sha256: string
  byteLength: number
  engine: string
  payloadHost: string
  minShell: number
  storedAt: string
  state: "stored-runtime-gated"
  artifact: "game.love"
}

function isStagedPayload(value: unknown): value is StagedPayload {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<StagedPayload>
  return item.schemaVersion === 1 && item.component === "gen1recomp-payload"
    && item.version === APPROVED_PAYLOAD.version
    && item.sourceRevision === APPROVED_PAYLOAD.sourceRevision
    && item.sha256 === APPROVED_PAYLOAD.sha256
    && item.byteLength === APPROVED_PAYLOAD.bytes
    && item.engine === APPROVED_PAYLOAD.version
    && item.payloadHost === "love"
    && typeof item.minShell === "number" && Number.isInteger(item.minShell) && item.minShell > 0
    && typeof item.storedAt === "string" && item.state === "stored-runtime-gated"
    && item.artifact === "game.love"
}

async function exists(path: string): Promise<boolean> { return FileManager.exists(path) }
async function ensureDirectory(path: string): Promise<void> {
  if (!(await exists(path))) await FileManager.createDirectory(path, true)
}
async function removeIfExists(path: string): Promise<void> {
  if (await exists(path)) await FileManager.remove(path)
}

function assertReleaseApproval(status: UpstreamReleaseStatus): void {
  if (status.latestVersion !== APPROVED_PAYLOAD.version
      || status.payloadName !== APPROVED_PAYLOAD.name
      || status.payloadSha256 !== APPROVED_PAYLOAD.sha256
      || !status.sumsPresent) {
    throw new Error("Das gefundene Release stimmt nicht mit dem eingebauten, geprüften Payload-Pin überein.")
  }
}

export async function recoverPayloadTransaction(): Promise<boolean> {
  if (!(await exists(TRANSACTION))) return false
  await removeIfExists(TRANSACTION)
  return true
}

export async function loadStagedPayload(): Promise<StagedPayload | null> {
  if (!(await exists(METADATA)) || !(await exists(`${DESTINATION}/game.love`))) return null
  try {
    const metadata = JSON.parse(await FileManager.readAsString(METADATA)) as unknown
    return isStagedPayload(metadata) ? metadata : null
  } catch { return null }
}

export async function readVerifiedStagedPayload(): Promise<{ metadata: StagedPayload, data: ScriptingData }> {
  const metadata = await loadStagedPayload()
  if (!metadata) throw new Error("Der geprüfte Gen1Recomp-Payload ist nicht gespeichert.")
  const data = await FileManager.readAsData(`${DESTINATION}/game.love`)
  if (data.size !== metadata.byteLength
    || Crypto.sha256(data).toHexString().toLowerCase() !== metadata.sha256) {
    throw new Error("Der gespeicherte Gen1Recomp-Payload hat die erneute Größen-/SHA-256-Prüfung nicht bestanden.")
  }
  return { metadata, data }
}

export async function stageApprovedPayload(
  status: UpstreamReleaseStatus,
  onProgress?: (phase: string) => void,
): Promise<StagedPayload> {
  const progressPath = `${PATHS.diagnostics}/payload-stage-progress.v1.json`
  const step = async (phase: string): Promise<void> => {
    onProgress?.(phase)
    await FileManager.writeAsString(progressPath, JSON.stringify({
      schemaVersion: 1, phase, at: new Date().toISOString(), version: APPROVED_PAYLOAD.version,
    }, null, 2))
  }
  assertReleaseApproval(status)
  const existing = await loadStagedPayload()
  if (existing) {
    await step("existing-candidate-rehash")
    const digest = Crypto.sha256(await FileManager.readAsData(`${DESTINATION}/game.love`)).toHexString().toLowerCase()
    if (digest !== existing.sha256) throw new Error("Der bereits gespeicherte Payload ist beschädigt; er wurde nicht ersetzt.")
    await removeIfExists(progressPath)
    return existing
  }

  await ensureDirectory(PATHS.transactions)
  await ensureDirectory(PAYLOADS_ROOT)
  await recoverPayloadTransaction()
  await ensureDirectory(TRANSACTION)
  try {
    await step("network-download")
    const response = await fetch(APPROVED_PAYLOAD.url, {
      timeout: 180,
      signal: AbortSignal.timeout(180_000),
      debugLabel: "Pinned Gen1Recomp payload",
    })
    if (!response.ok) throw new Error(`Payload-Download antwortete mit HTTP ${response.status}.`)
    const finalHost = new URL(response.url).hostname.toLowerCase()
    if (!["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"].includes(finalHost)) {
      throw new Error(`Der Payload-Download wurde zu einem nicht erlaubten Host umgeleitet: ${finalHost}`)
    }
    if (response.expectedContentLength != null && response.expectedContentLength !== APPROVED_PAYLOAD.bytes) {
      throw new Error("Die angekündigte Payload-Größe stimmt nicht mit dem eingebauten Pin überein.")
    }
    await step("network-response-data")
    const data = await response.data()
    await step("size-and-sha256")
    const bytes = data.toUint8Array()
    if (bytes == null || bytes.length !== APPROVED_PAYLOAD.bytes) {
      throw new Error("Die geladene Payload-Größe stimmt nicht mit dem eingebauten Pin überein.")
    }
    const digest = Crypto.sha256(data).toHexString().toLowerCase()
    if (digest !== APPROVED_PAYLOAD.sha256) throw new Error("SHA-256 des Payloads stimmt nicht mit dem eingebauten Pin überein.")

    await step("zip-preflight")
    const archive = preflightZipArchive(bytes)
    await step("payload-metadata")
    const versionRecord = archive.records.find((entry) => entry.path === "src/core/Version.lua" && !entry.isDirectory)
    if (!versionRecord) throw new Error("Der Payload enthält keine src/core/Version.lua.")
    const versionText = new TextDecoder("utf-8", { fatal: true }).decode(extractZipEntry(bytes, versionRecord))
    const version = parsePayloadVersionLua(versionText, APPROVED_PAYLOAD.version)
    const staged: StagedPayload = {
      schemaVersion: 1,
      component: "gen1recomp-payload",
      version: APPROVED_PAYLOAD.version,
      sourceRevision: APPROVED_PAYLOAD.sourceRevision,
      sha256: digest,
      byteLength: bytes.length,
      engine: version.engine,
      payloadHost: version.payloadHost,
      minShell: version.minShell,
      storedAt: new Date().toISOString(),
      state: "stored-runtime-gated",
      artifact: "game.love",
    }
    await step("transaction-write")
    await FileManager.writeAsData(`${TRANSACTION}/game.love`, data)
    await FileManager.writeAsString(`${TRANSACTION}/payload.v1.json`, JSON.stringify(staged, null, 2))
    await step("transaction-rehash")
    const stagedDigest = Crypto.sha256(await FileManager.readAsData(`${TRANSACTION}/game.love`)).toHexString().toLowerCase()
    if (stagedDigest !== digest) throw new Error("Die staged Payload-Kopie hat die SHA-256-Nachprüfung nicht bestanden.")
    if (await exists(DESTINATION)) throw new Error("Ein unvollständiger Payload-Zielordner erfordert manuelle Diagnose; nichts wurde überschrieben.")
    await step("atomic-publish")
    await FileManager.rename(TRANSACTION, DESTINATION)
    await removeIfExists(progressPath)
    return staged
  } catch (error) {
    try { await removeIfExists(TRANSACTION) } catch { /* Preserve the original error. */ }
    throw error
  }
}
