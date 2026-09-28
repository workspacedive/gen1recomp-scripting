import { PATHS } from "./host"
import { extractZipEntry } from "./zip-extract"
import { MOD_ARCHIVE_LIMITS, preflightModZip } from "./zip-preflight"
import { appendZipOverlay, type ZipOverlayEntry } from "./zip-overlay"
import { LOVEJS_RUNTIME } from "./runtime-manifest"

const MODS_ROOT = PATHS.mods
const INDEX_PATH = `${MODS_ROOT}/index.v1.json`
const INDEX_TEMP = `${MODS_ROOT}/index.v1.json.new`
const INDEX_BACKUP = `${MODS_ROOT}/index.v1.json.bak`
const TRANSACTION = `${PATHS.transactions}/mod-import-pending`
const PREPARED_OVERLAY_ROOT = `${PATHS.cache}/prepared-overlay-v1`
const PREPARED_OVERLAY_CURRENT = `${PREPARED_OVERLAY_ROOT}/current`
const PREPARED_OVERLAY_TRANSACTION = `${PATHS.transactions}/prepared-overlay-v1`

export interface InstalledMod {
  id: string
  name: string
  version: string
  api: number
  profile: string
  description: string
  sha256: string
  installedAt: string
  relativePath: string
  archiveRelativePath?: string
  activation: "stored" | "enabled"
  runtimeVisibleAt?: string
}

interface ModIndex { schemaVersion: 2; mods: InstalledMod[] }

export interface RuntimeModOverlay {
  data: ScriptingData
  modIds: string[]
  cacheStatus?: "hit" | "built" | "bypassed"
}

interface PreparedOverlayManifest {
  schemaVersion: 1
  runtimeId: string
  adapterVersion: number
  payloadSha256: string
  mods: Array<{ id: string; version: string; sha256: string }>
  outputSha256: string
  outputBytes: number
  createdAt: string
  artifact: "game.love"
}
interface RawManifest {
  id?: unknown; name?: unknown; version?: unknown; api?: unknown
  entry?: unknown; profile?: unknown; description?: unknown
}
interface ValidManifest {
  id: string; name: string; version: string; api: number
  entry: string; profile: string; description: string
}

async function exists(path: string): Promise<boolean> {
  return FileManager.exists(path)
}

async function ensureDirectory(path: string): Promise<void> {
  if (!(await FileManager.exists(path))) await FileManager.createDirectory(path, true)
}

async function removeIfExists(path: string): Promise<void> {
  if (await FileManager.exists(path)) await FileManager.remove(path)
}

function isInstalledMod(value: unknown): value is InstalledMod {
  if (!value || typeof value !== "object") return false
  const mod = value as Partial<InstalledMod>
  return typeof mod.id === "string" && /^[a-z0-9_-]+$/.test(mod.id)
    && typeof mod.name === "string" && mod.name.length > 0 && mod.name.length <= 160
    && typeof mod.version === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(mod.version)
    && (mod.api === 1 || mod.api === 2) && typeof mod.profile === "string"
    && typeof mod.description === "string" && typeof mod.installedAt === "string"
    && typeof mod.sha256 === "string" && /^[0-9a-f]{64}$/.test(mod.sha256)
    && mod.relativePath === `${mod.id}/${mod.version}/${mod.sha256}`
    && (mod.archiveRelativePath == null || mod.archiveRelativePath === `${mod.relativePath}.zip`)
    && (mod.activation === "stored" || (mod.activation === "enabled" && mod.archiveRelativePath != null))
    && (mod.runtimeVisibleAt == null || typeof mod.runtimeVisibleAt === "string")
}

function parseIndex(raw: string): ModIndex | null {
  const parsed = JSON.parse(raw) as { schemaVersion?: unknown, mods?: unknown }
  if (!Array.isArray(parsed.mods) || !parsed.mods.every(isInstalledMod)) return null
  const mods = parsed.mods as InstalledMod[]
  if (parsed.schemaVersion === 2) return { schemaVersion: 2, mods }
  if (parsed.schemaVersion === 1) {
    // 0.13.x packages had no retained archive, so they remain truthfully stored
    // until the user imports the original ZIP once more.
    return { schemaVersion: 2, mods: mods.map((mod) => ({ ...mod, activation: "stored" as const })) }
  }
  return null
}

async function loadIndex(): Promise<ModIndex> {
  if (!(await exists(INDEX_PATH))) return { schemaVersion: 2, mods: [] }
  try {
    const index = parseIndex(await FileManager.readAsString(INDEX_PATH))
    if (!index) throw new Error("invalid")
    return index
  } catch {
    if (await exists(INDEX_BACKUP)) {
      const index = parseIndex(await FileManager.readAsString(INDEX_BACKUP))
      if (index) return index
    }
    throw new Error("Der lokale Mod-Index ist beschädigt. Es wurden keine Dateien verändert.")
  }
}

async function saveIndex(index: ModIndex): Promise<void> {
  await ensureDirectory(MODS_ROOT)
  await FileManager.writeAsString(INDEX_TEMP, JSON.stringify(index, null, 2))
  const roundTrip = JSON.parse(await FileManager.readAsString(INDEX_TEMP)) as Partial<ModIndex>
  if (roundTrip.schemaVersion !== 2 || !Array.isArray(roundTrip.mods) || !roundTrip.mods.every(isInstalledMod)) {
    throw new Error("Der neue Mod-Index konnte nicht verifiziert werden.")
  }
  if (await exists(INDEX_PATH)) {
    await removeIfExists(INDEX_BACKUP)
    await FileManager.copyFile(INDEX_PATH, INDEX_BACKUP)
    await FileManager.remove(INDEX_PATH)
  }
  try {
    await FileManager.rename(INDEX_TEMP, INDEX_PATH)
  } catch (error) {
    if (!(await exists(INDEX_PATH)) && await exists(INDEX_BACKUP)) {
      await FileManager.copyFile(INDEX_BACKUP, INDEX_PATH)
    }
    throw error
  }
}

function safeJoin(base: string, relative: string): string {
  if (!relative || relative.startsWith("/") || relative.includes("\\") ||
      relative.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Unsicherer Mod-Pfad.")
  }
  return `${base}/${relative}`
}

function validateManifest(raw: RawManifest): ValidManifest {
  if (typeof raw.id !== "string" || !/^[a-z0-9_-]+$/.test(raw.id)) {
    throw new Error("manifest.json: id muss aus Kleinbuchstaben, Zahlen, _ oder - bestehen.")
  }
  if (typeof raw.name !== "string" || !raw.name.trim() || raw.name.length > 160) {
    throw new Error("manifest.json: name fehlt oder ist zu lang.")
  }
  if (typeof raw.version !== "string" ||
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(raw.version)) {
    throw new Error("manifest.json: version muss SemVer sein.")
  }
  if (raw.api !== 1 && raw.api !== 2) throw new Error("manifest.json: nur Mod-API 1 oder 2 wird erkannt.")
  const entry = raw.entry
  if (typeof entry !== "string" || !entry || entry.startsWith("/") || entry.includes("\\") ||
      entry.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("manifest.json: entry fehlt oder ist kein sicherer relativer Pfad.")
  }
  const profile = raw.profile == null ? "content" : raw.profile
  if (profile !== "content" && profile !== "overhaul" && profile !== "total_conversion") {
    throw new Error("manifest.json: unbekanntes profile.")
  }
  const description = raw.description == null ? "" : raw.description
  if (typeof description !== "string" || description.length > 4000) {
    throw new Error("manifest.json: description ist ungültig oder zu lang.")
  }
  return { id: raw.id, name: raw.name.trim(), version: raw.version, api: raw.api,
    entry, profile, description }
}

export async function recoverPendingModImport(): Promise<boolean> {
  if (!(await exists(TRANSACTION))) return false
  await removeIfExists(TRANSACTION)
  return true
}

export async function listInstalledMods(): Promise<InstalledMod[]> {
  return (await loadIndex()).mods.slice().sort((a, b) => a.name.localeCompare(b.name))
}

export async function importModZip(sourcePath: string): Promise<InstalledMod> {
  let phase = "prepare"
  await ensureDirectory(PATHS.transactions)
  await ensureDirectory(MODS_ROOT)
  await recoverPendingModImport()
  await ensureDirectory(TRANSACTION)
  const archive = `${TRANSACTION}/package.zip`
  const extracted = `${TRANSACTION}/extracted`
  try {
    phase = "copy-source"
    await FileManager.copyFile(sourcePath, archive)
    const info = await FileManager.stat(archive)
    if (info.type === "directory" || info.size <= 0 || info.size > MOD_ARCHIVE_LIMITS.archiveBytes) {
      throw new Error(`Das Mod-ZIP muss zwischen 1 Byte und ${MOD_ARCHIVE_LIMITS.archiveBytes / 1024 / 1024} MiB groß sein.`)
    }
    phase = "zip-preflight"
    const archiveData = await FileManager.readAsData(archive)
    const bytes = archiveData.toUint8Array()
    if (bytes == null) throw new Error("Das Mod-ZIP konnte nicht als Binärdaten gelesen werden.")
    const preflight = preflightModZip(bytes)
    const baseromsPrefix = `${preflight.rootPrefix ? `${preflight.rootPrefix}/` : ""}baseroms/`.toLowerCase()
    if (preflight.entries.some((path) => !path.endsWith("/") && path.toLowerCase().startsWith(baseromsPrefix))) {
      throw new Error("Mod-Archive dürfen keine benutzereigenen baseroms-Dateien enthalten.")
    }
    const sha256 = Crypto.sha256(archiveData).toHexString().toLowerCase()

    // Extract approved entries ourselves. No Archive/ZIP host API is used:
    // local headers, paths, DEFLATE output sizes and CRC-32 are verified here.
    phase = "extract-approved-entries"
    await ensureDirectory(extracted)
    for (const entry of preflight.records) {
      const relative = entry.path.endsWith("/") ? entry.path.slice(0, -1) : entry.path
      const destination = safeJoin(extracted, relative)
      if (entry.isDirectory) {
        await ensureDirectory(destination)
      } else {
        const output = extractZipEntry(bytes, entry)
        const slash = destination.lastIndexOf("/")
        await ensureDirectory(destination.slice(0, slash))
        await FileManager.writeAsBytes(destination, output)
      }
    }

    phase = "validate-manifest"
    const root = preflight.rootPrefix ? safeJoin(extracted, preflight.rootPrefix) : extracted
    const manifestPath = safeJoin(extracted, preflight.manifestPath)
    if (!(await exists(manifestPath))) throw new Error("manifest.json fehlt nach dem Entpacken.")
    let raw: RawManifest
    try { raw = JSON.parse(await FileManager.readAsString(manifestPath)) as RawManifest }
    catch { throw new Error("manifest.json ist kein gültiges JSON.") }
    const manifest = validateManifest(raw)
    const entryPath = safeJoin(root, manifest.entry)
    const archiveEntryPath = preflight.rootPrefix
      ? `${preflight.rootPrefix}/${manifest.entry}` : manifest.entry
    const entryRecord = preflight.records.find((entry) => entry.path === archiveEntryPath)
    if (!entryRecord || entryRecord.isDirectory) {
      const target = manifest.entry.toLowerCase()
      const alternatives = preflight.records
        .filter((entry) => !entry.isDirectory && (entry.path.toLowerCase() === target
          || entry.path.toLowerCase().endsWith(`/${target}`)))
        .slice(0, 3)
        .map((entry) => entry.path)
      const hint = alternatives.length > 0 ? ` Ähnliche Pfade: ${alternatives.join(", ")}.` : ""
      throw new Error(`Der in manifest.json angegebene Einstieg ${archiveEntryPath} fehlt im ZIP oder ist ein Ordner.${hint}`)
    }
    if (!(await exists(entryPath))) {
      throw new Error(`Der geprüfte Mod-Einstieg ${manifest.entry} wurde nicht in den Transaktionsordner geschrieben.`)
    }

    phase = "publish-package"
    const relativePath = `${manifest.id}/${manifest.version}/${sha256}`
    const destination = safeJoin(MODS_ROOT, relativePath)
    await ensureDirectory(`${MODS_ROOT}/${manifest.id}/${manifest.version}`)
    if (!(await exists(destination))) await FileManager.rename(root, destination)
    const archiveRelativePath = `${relativePath}.zip`
    const publishedArchive = safeJoin(MODS_ROOT, archiveRelativePath)
    if (!(await exists(publishedArchive))) await FileManager.copyFile(archive, publishedArchive)
    const publishedData = await FileManager.readAsData(publishedArchive)
    if (publishedData.size !== archiveData.size
      || Crypto.sha256(publishedData).toHexString().toLowerCase() !== sha256) {
      await removeIfExists(publishedArchive)
      throw new Error("Das veröffentlichte Mod-Archiv hat die Integritätsprüfung nicht bestanden.")
    }

    const row: InstalledMod = {
      id: manifest.id, name: manifest.name, version: manifest.version,
      api: manifest.api, profile: manifest.profile, description: manifest.description,
      sha256, installedAt: new Date().toISOString(), relativePath, archiveRelativePath,
      activation: "enabled",
    }
    const index = await loadIndex()
    index.mods = index.mods
      .filter((item) => !(item.id === row.id && item.version === row.version && item.sha256 === row.sha256))
      .map((item) => item.id === row.id ? { ...item, activation: "stored" as const, runtimeVisibleAt: undefined } : item)
    index.mods.push(row)
    await saveIndex(index)
    try { await removeIfExists(TRANSACTION) } catch { /* Startup recovery will retry cleanup. */ }
    return row
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    try { await removeIfExists(TRANSACTION) } catch { /* Preserve the original failure. */ }
    try {
      await ensureDirectory(PATHS.diagnostics)
      await FileManager.writeAsString(`${PATHS.diagnostics}/mod-import-last-failure.v1.json`, JSON.stringify({
        schemaVersion: 1,
        failedAt: new Date().toISOString(),
        phase,
        message,
      }, null, 2))
    } catch { /* Diagnostics must never replace the actionable import error. */ }
    throw new Error(`${message} (Phase: ${phase})`)
  }
}

export async function setModEnabled(mod: InstalledMod, enabled: boolean): Promise<void> {
  const index = await loadIndex()
  const current = index.mods.find((item) =>
    item.id === mod.id && item.version === mod.version && item.sha256 === mod.sha256)
  if (!current) throw new Error("Das Mod-Paket ist nicht mehr im Index enthalten.")
  if (enabled) {
    if (!current.archiveRelativePath || !(await exists(safeJoin(MODS_ROOT, current.archiveRelativePath)))) {
      throw new Error("Dieses ältere Paket muss einmal erneut importiert werden, bevor es aktiviert werden kann.")
    }
    index.mods = index.mods.map((item) => item.id === current.id
      ? { ...item, activation: item.sha256 === current.sha256 ? "enabled" as const : "stored" as const,
        runtimeVisibleAt: undefined }
      : item)
  } else {
    index.mods = index.mods.map((item) => item.sha256 === current.sha256
      ? { ...item, activation: "stored" as const, runtimeVisibleAt: undefined } : item)
  }
  await saveIndex(index)
}

function preparedManifestMatches(
  value: unknown,
  payloadSha256: string,
  enabled: InstalledMod[],
): value is PreparedOverlayManifest {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<PreparedOverlayManifest>
  if (item.schemaVersion !== 1 || item.runtimeId !== LOVEJS_RUNTIME.id
      || item.adapterVersion !== LOVEJS_RUNTIME.adapterVersion
      || item.payloadSha256 !== payloadSha256 || item.artifact !== "game.love"
      || typeof item.outputSha256 !== "string" || !/^[0-9a-f]{64}$/.test(item.outputSha256)
      || typeof item.outputBytes !== "number" || !Number.isInteger(item.outputBytes)
      || item.outputBytes <= 0 || typeof item.createdAt !== "string"
      || !Array.isArray(item.mods) || item.mods.length !== enabled.length) return false
  return item.mods.every((mod, index) => mod.id === enabled[index].id
    && mod.version === enabled[index].version && mod.sha256 === enabled[index].sha256)
}

async function recordPreparedOverlayDiagnostic(
  status: "hit" | "built" | "bypassed",
  started: number,
  outputBytes: number,
  modIds: string[],
): Promise<void> {
  try {
    await ensureDirectory(PATHS.diagnostics)
    await FileManager.writeAsString(`${PATHS.diagnostics}/prepared-overlay-last.v1.json`, JSON.stringify({
      schemaVersion: 1,
      recordedAt: new Date().toISOString(),
      runtimeId: LOVEJS_RUNTIME.id,
      status,
      elapsedMs: Date.now() - started,
      outputBytes,
      modIds,
    }, null, 2))
  } catch { /* Cache diagnostics must never block gameplay. */ }
}

export async function prepareRuntimeModOverlay(payload: ScriptingData): Promise<RuntimeModOverlay> {
  const started = Date.now()
  const index = await loadIndex()
  // Stable ordering makes the cache identity deterministic without changing
  // the runtime-visible mods/<id>/ paths or depending on import chronology.
  const enabled = index.mods.filter((mod) => mod.activation === "enabled")
    .sort((left, right) => left.id.localeCompare(right.id))
  if (enabled.length === 0) {
    await recordPreparedOverlayDiagnostic("bypassed", started, payload.size, [])
    return { data: payload, modIds: [], cacheStatus: "bypassed" }
  }
  const payloadSha256 = Crypto.sha256(payload).toHexString().toLowerCase()
  const cachedManifestPath = `${PREPARED_OVERLAY_CURRENT}/manifest.json`
  const cachedArtifactPath = `${PREPARED_OVERLAY_CURRENT}/game.love`
  if (await exists(cachedManifestPath) && await exists(cachedArtifactPath)) {
    try {
      const manifest = JSON.parse(await FileManager.readAsString(cachedManifestPath)) as unknown
      if (preparedManifestMatches(manifest, payloadSha256, enabled)) {
        const typed = manifest as PreparedOverlayManifest
        const data = await FileManager.readAsData(cachedArtifactPath)
        if (data.size === typed.outputBytes
            && Crypto.sha256(data).toHexString().toLowerCase() === typed.outputSha256) {
          const modIds = enabled.map((mod) => mod.id)
          await recordPreparedOverlayDiagnostic("hit", started, data.size, modIds)
          return { data, modIds, cacheStatus: "hit" }
        }
      }
    } catch { /* A cache miss rebuilds from immutable verified inputs below. */ }
  }
  const overlay: ZipOverlayEntry[] = []
  let expandedBytes = 0
  for (const mod of enabled) {
    if (!mod.archiveRelativePath) throw new Error(`${mod.name}: aktiviertes Paketarchiv fehlt.`)
    const archivePath = safeJoin(MODS_ROOT, mod.archiveRelativePath)
    if (!(await exists(archivePath))) throw new Error(`${mod.name}: gespeichertes Paketarchiv fehlt.`)
    const archiveData = await FileManager.readAsData(archivePath)
    if (Crypto.sha256(archiveData).toHexString().toLowerCase() !== mod.sha256) {
      throw new Error(`${mod.name}: SHA-256 des gespeicherten Paketarchivs stimmt nicht.`)
    }
    const bytes = archiveData.toUint8Array()
    if (bytes == null) throw new Error(`${mod.name}: Paketarchiv konnte nicht binär gelesen werden.`)
    const archive = preflightModZip(bytes)
    const manifestRecord = archive.records.find((entry) => entry.path === archive.manifestPath)
    if (!manifestRecord) throw new Error(`${mod.name}: manifest.json fehlt bei der Laufzeitprüfung.`)
    const raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(
      extractZipEntry(bytes, manifestRecord),
    )) as RawManifest
    const manifest = validateManifest(raw)
    if (manifest.id !== mod.id || manifest.version !== mod.version) {
      throw new Error(`${mod.name}: Manifest-Identität stimmt nicht mit dem Mod-Index überein.`)
    }
    const prefix = archive.rootPrefix ? `${archive.rootPrefix}/` : ""
    for (const entry of archive.records) {
      if (entry.isDirectory) continue
      const relative = entry.path.slice(prefix.length)
      if (!relative || relative === entry.path && prefix) {
        throw new Error(`${mod.name}: Datei liegt außerhalb des geprüften Mod-Wurzelordners.`)
      }
      const data = extractZipEntry(bytes, entry)
      expandedBytes += data.length
      // The host has no streaming/random-write Data API; bound the in-memory
      // overlay by the already documented 64 MiB archive transport limit.
      if (expandedBytes > MOD_ARCHIVE_LIMITS.archiveBytes) {
        throw new Error("Die aktivierten Mods überschreiten zusammen das 64-MiB-Laufzeitlimit.")
      }
      overlay.push({ path: `mods/${mod.id}/${relative}`, data, crc32: entry.crc32 })
    }
  }
  const payloadBytes = payload.toUint8Array()
  if (payloadBytes == null) throw new Error("Der geprüfte Payload konnte nicht binär gelesen werden.")
  const combined = appendZipOverlay(payloadBytes, overlay)
  const modIds = enabled.map((mod) => mod.id)
  await ensureDirectory(PATHS.transactions)
  await ensureDirectory(PREPARED_OVERLAY_ROOT)
  await removeIfExists(PREPARED_OVERLAY_TRANSACTION)
  await ensureDirectory(PREPARED_OVERLAY_TRANSACTION)
  try {
    const stagedArtifact = `${PREPARED_OVERLAY_TRANSACTION}/game.love`
    await FileManager.writeAsBytes(stagedArtifact, combined)
    const stagedData = await FileManager.readAsData(stagedArtifact)
    const outputSha256 = Crypto.sha256(stagedData).toHexString().toLowerCase()
    const manifest: PreparedOverlayManifest = {
      schemaVersion: 1,
      runtimeId: LOVEJS_RUNTIME.id,
      adapterVersion: LOVEJS_RUNTIME.adapterVersion,
      payloadSha256,
      mods: enabled.map((mod) => ({ id: mod.id, version: mod.version, sha256: mod.sha256 })),
      outputSha256,
      outputBytes: stagedData.size,
      createdAt: new Date().toISOString(),
      artifact: "game.love",
    }
    await FileManager.writeAsString(`${PREPARED_OVERLAY_TRANSACTION}/manifest.json`,
      JSON.stringify(manifest, null, 2))
    const reloaded = await FileManager.readAsData(stagedArtifact)
    if (reloaded.size !== manifest.outputBytes
        || Crypto.sha256(reloaded).toHexString().toLowerCase() !== manifest.outputSha256) {
      throw new Error("Der vorbereitete Mod-Overlay hat die SHA-256-Nachprüfung nicht bestanden.")
    }
    // This is a one-slot disposable cache: invalidation never touches the
    // retained payload, ROM, mod archives, saves, or their indexes.
    await removeIfExists(PREPARED_OVERLAY_CURRENT)
    await FileManager.rename(PREPARED_OVERLAY_TRANSACTION, PREPARED_OVERLAY_CURRENT)
    const data = await FileManager.readAsData(cachedArtifactPath)
    await recordPreparedOverlayDiagnostic("built", started, data.size, modIds)
    return { data, modIds, cacheStatus: "built" }
  } catch (error) {
    try { await removeIfExists(PREPARED_OVERLAY_TRANSACTION) } catch { /* Preserve original error. */ }
    throw error
  }
}

export async function markModsRuntimeVisible(modIds: string[], visibleAt: string): Promise<void> {
  if (modIds.length === 0) return
  const ids = new Set(modIds)
  const index = await loadIndex()
  index.mods = index.mods.map((mod) => mod.activation === "enabled" && ids.has(mod.id)
    ? { ...mod, runtimeVisibleAt: visibleAt } : mod)
  await saveIndex(index)
}

export async function removeInstalledMod(mod: InstalledMod): Promise<void> {
  const index = await loadIndex()
  const current = index.mods.find((item) =>
    item.id === mod.id && item.version === mod.version && item.sha256 === mod.sha256)
  if (!current) return
  index.mods = index.mods.filter((item) => item !== current)
  await saveIndex(index)
  // A crash before this cleanup leaves unindexed orphans, never a broken index.
  await removeIfExists(safeJoin(MODS_ROOT, current.relativePath))
  if (current.archiveRelativePath) await removeIfExists(safeJoin(MODS_ROOT, current.archiveRelativePath))
}
