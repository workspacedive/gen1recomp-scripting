import { PATHS } from "./host"
import { MOD_ARCHIVE_LIMITS, preflightModZip } from "./zip-preflight"

const MODS_ROOT = PATHS.mods
const INDEX_PATH = `${MODS_ROOT}/index.v1.json`
const INDEX_TEMP = `${MODS_ROOT}/index.v1.json.new`
const INDEX_BACKUP = `${MODS_ROOT}/index.v1.json.bak`
const TRANSACTION = `${PATHS.transactions}/mod-import-pending`

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
  activation: "stored"
}

interface ModIndex { schemaVersion: 1; mods: InstalledMod[] }
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
    && mod.activation === "stored"
}

async function loadIndex(): Promise<ModIndex> {
  if (!(await exists(INDEX_PATH))) return { schemaVersion: 1, mods: [] }
  try {
    const parsed = JSON.parse(await FileManager.readAsString(INDEX_PATH)) as Partial<ModIndex>
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.mods) || !parsed.mods.every(isInstalledMod)) {
      throw new Error("invalid")
    }
    return { schemaVersion: 1, mods: parsed.mods }
  } catch {
    if (await exists(INDEX_BACKUP)) {
      const parsed = JSON.parse(await FileManager.readAsString(INDEX_BACKUP)) as Partial<ModIndex>
      if (parsed.schemaVersion === 1 && Array.isArray(parsed.mods) && parsed.mods.every(isInstalledMod)) {
        return { schemaVersion: 1, mods: parsed.mods }
      }
    }
    throw new Error("Der lokale Mod-Index ist beschädigt. Es wurden keine Dateien verändert.")
  }
}

async function saveIndex(index: ModIndex): Promise<void> {
  await ensureDirectory(MODS_ROOT)
  await FileManager.writeAsString(INDEX_TEMP, JSON.stringify(index, null, 2))
  const roundTrip = JSON.parse(await FileManager.readAsString(INDEX_TEMP)) as Partial<ModIndex>
  if (roundTrip.schemaVersion !== 1 || !Array.isArray(roundTrip.mods) || !roundTrip.mods.every(isInstalledMod)) {
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
  const entry = raw.entry == null ? "main.lua" : raw.entry
  if (typeof entry !== "string" || entry.startsWith("/") || entry.includes("\\") ||
      entry.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("manifest.json: entry ist kein sicherer relativer Pfad.")
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

    // Use the documented Archive API to extract each already-approved entry to
    // an explicit destination. This avoids trusting bulk-unzip path handling.
    phase = "archive-crosscheck"
    const reader = Archive.openForMode(archive, "read", { pathEncoding: "utf-8" })
    const hostEntries = reader.entries()
    if (hostEntries.length !== preflight.entries.length) {
      throw new Error("ZIP-Verzeichnis und Host-Archivansicht stimmen nicht überein.")
    }
    const expected = new Map(preflight.entries.map((path) =>
      [path.endsWith("/") ? path.slice(0, -1) : path, path]))
    let hostCompressedBytes = 0
    let hostExpandedBytes = 0
    for (const entry of hostEntries) {
      const approved = expected.get(entry.path.endsWith("/") ? entry.path.slice(0, -1) : entry.path)
      if (!approved || entry.type === "symlink" || entry.isEncrypted === true ||
          entry.uncompressedSize < 0 || entry.uncompressedSize > MOD_ARCHIVE_LIMITS.entryBytes) {
        throw new Error("Das Host-Archiv enthält einen nicht freigegebenen Eintrag.")
      }
      hostCompressedBytes += entry.compressedSize
      hostExpandedBytes += entry.uncompressedSize
    }
    if (hostCompressedBytes !== preflight.compressedBytes ||
        hostExpandedBytes !== preflight.expandedBytes) {
      throw new Error("ZIP-Größen und Host-Archivansicht stimmen nicht überein.")
    }
    const manifestEntry = hostEntries.find((entry) => entry.path === preflight.manifestPath)
    if (!manifestEntry || manifestEntry.type !== "file" || manifestEntry.uncompressedSize > 1024 * 1024) {
      throw new Error("manifest.json fehlt, ist kein Datei-Eintrag oder ist zu groß.")
    }
    phase = "extract-approved-entries"
    await ensureDirectory(extracted)
    for (const entry of hostEntries) {
      const relative = entry.path.endsWith("/") ? entry.path.slice(0, -1) : entry.path
      const destination = safeJoin(extracted, relative)
      if (entry.type === "directory") {
        await ensureDirectory(destination)
      } else {
        const slash = destination.lastIndexOf("/")
        await ensureDirectory(destination.slice(0, slash))
        await reader.extractTo(entry.path, destination, { allowUncontainedSymlinks: false })
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
    if (!(await exists(entryPath)) || (await FileManager.stat(entryPath)).type !== "file") {
      throw new Error(`Der Mod-Einstieg ${manifest.entry} fehlt oder ist keine Datei.`)
    }

    phase = "publish-package"
    const relativePath = `${manifest.id}/${manifest.version}/${sha256}`
    const destination = safeJoin(MODS_ROOT, relativePath)
    await ensureDirectory(`${MODS_ROOT}/${manifest.id}/${manifest.version}`)
    if (!(await exists(destination))) await FileManager.rename(root, destination)

    const row: InstalledMod = {
      id: manifest.id, name: manifest.name, version: manifest.version,
      api: manifest.api, profile: manifest.profile, description: manifest.description,
      sha256, installedAt: new Date().toISOString(), relativePath, activation: "stored",
    }
    const index = await loadIndex()
    index.mods = index.mods.filter((item) =>
      !(item.id === row.id && item.version === row.version && item.sha256 === row.sha256))
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

export async function removeInstalledMod(mod: InstalledMod): Promise<void> {
  const index = await loadIndex()
  const next = index.mods.filter((item) =>
    !(item.id === mod.id && item.version === mod.version && item.sha256 === mod.sha256))
  if (next.length === index.mods.length) return
  index.mods = next
  await saveIndex(index)
  // A crash before this cleanup leaves an unindexed orphan, never a broken index.
  await removeIfExists(safeJoin(MODS_ROOT, mod.relativePath))
}
