import { APP } from './config'
import { identifyGame, type KnownGameId } from './game-manifest'

export const ROOT = `${FileManager.documentsDirectory}/Gen1Recomp`
export const PATHS = {
  library: `${ROOT}/Library`, content: `${ROOT}/Library/content`, cores: `${ROOT}/Cores`,
  profiles: `${ROOT}/Profiles`, saves: `${ROOT}/Saves`, mods: `${ROOT}/Mods`,
  generated: `${ROOT}/Generated`, cache: `${ROOT}/Cache`, transactions: `${ROOT}/Transactions`,
  diagnostics: `${ROOT}/Diagnostics`, recovery: `${ROOT}/Recovery`, inbox: `${ROOT}/Inbox`, exports: `${ROOT}/Exports`,
} as const

export type ContentStatus = 'runtime-unverified' | 'unsupported-content'

export interface LibraryRow {
  schemaVersion: 1
  id: string
  displayName: string
  sha256: string
  upstreamSha1: string
  byteLength: number
  sourceName: string
  importedAt: string
  game: KnownGameId | 'unknown'
  region: string
  language: string
  revision: string
  status: ContentStatus
}

interface LibraryIndex { schemaVersion: 1; entries: LibraryRow[] }
interface ImportTransaction {
  schemaVersion: 1
  kind: 'content-import'
  state: 'staged' | 'published'
  sha256: string
  stagingDirectory: string
  destinationDirectory: string
  row: LibraryRow
  updatedAt: string
}

const INDEX = `${PATHS.library}/index.v1.json`
const INDEX_BACKUP = `${INDEX}.bak`
const INDEX_TEMP = `${INDEX}.tmp`
const IMPORT_JOURNAL = `${PATHS.transactions}/import-pending.v1.json`

function segment(value: string): string {
  const clean = value.normalize('NFC')
  if (!/^[a-z0-9][a-z0-9._-]{0,95}$/i.test(clean) || clean === '.' || clean === '..') throw new Error('Unsafe identifier')
  return clean
}

function isDigest(value: unknown, length: number): value is string {
  return typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value)
}

function isLibraryRow(value: unknown): value is LibraryRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<LibraryRow>
  return row.schemaVersion === 1 && typeof row.id === 'string' && typeof row.displayName === 'string'
    && isDigest(row.sha256, 64) && isDigest(row.upstreamSha1, 40)
    && typeof row.byteLength === 'number' && row.byteLength > 0
    && typeof row.sourceName === 'string' && typeof row.importedAt === 'string'
    && typeof row.game === 'string' && typeof row.region === 'string'
    && typeof row.language === 'string' && typeof row.revision === 'string'
    && (row.status === 'runtime-unverified' || row.status === 'unsupported-content')
}

function isLegacyLibraryRow(value: unknown): value is Omit<LibraryRow, 'upstreamSha1' | 'region' | 'language' | 'revision'> {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<LibraryRow>
  return row.schemaVersion === 1 && typeof row.id === 'string' && typeof row.displayName === 'string'
    && isDigest(row.sha256, 64) && typeof row.byteLength === 'number' && row.byteLength > 0
    && typeof row.sourceName === 'string' && typeof row.importedAt === 'string'
    && row.game === 'unknown' && row.status === 'runtime-unverified'
}

async function readIndexCandidate(path: string): Promise<{ index: LibraryIndex; migrated: boolean } | null> {
  if (!(await FileManager.exists(path))) return null
  try {
    const value = JSON.parse(await FileManager.readAsString(path)) as { schemaVersion?: unknown; entries?: unknown }
    if (value.schemaVersion !== 1 || !Array.isArray(value.entries)) return null
    const entries: LibraryRow[] = []
    let migrated = false
    for (const item of value.entries) {
      if (isLibraryRow(item)) { entries.push(item); continue }
      if (!isLegacyLibraryRow(item)) return null
      const original = `${PATHS.content}/${item.sha256}/original.gb`
      if (!(await FileManager.exists(original))) return null
      const upstreamSha1 = Crypto.sha1(await FileManager.readAsData(original)).toHexString().toLowerCase()
      const known = identifyGame(upstreamSha1)
      entries.push({
        ...item,
        displayName: known?.displayName ?? item.displayName,
        upstreamSha1,
        game: known?.id ?? 'unknown',
        region: known?.region ?? 'unknown',
        language: known?.language ?? 'unknown',
        revision: known?.revision ?? 'unknown',
        status: known ? 'runtime-unverified' : 'unsupported-content',
      })
      migrated = true
    }
    return { index: { schemaVersion: 1, entries }, migrated }
  } catch { return null }
}

async function replaceIndex(entries: LibraryRow[]): Promise<void> {
  await FileManager.writeAsString(INDEX_TEMP, JSON.stringify({ schemaVersion: 1, entries }, null, 2))
  const roundTrip = JSON.parse(await FileManager.readAsString(INDEX_TEMP)) as Partial<LibraryIndex>
  if (roundTrip.schemaVersion !== 1 || !Array.isArray(roundTrip.entries) || !roundTrip.entries.every(isLibraryRow)) {
    throw new Error('Library index verification failed')
  }
  if (await FileManager.exists(INDEX)) {
    if (await FileManager.exists(INDEX_BACKUP)) await FileManager.remove(INDEX_BACKUP)
    await FileManager.copyFile(INDEX, INDEX_BACKUP)
    await FileManager.remove(INDEX)
  }
  try {
    await FileManager.rename(INDEX_TEMP, INDEX)
  } catch (error) {
    if (!(await FileManager.exists(INDEX)) && await FileManager.exists(INDEX_BACKUP)) {
      await FileManager.copyFile(INDEX_BACKUP, INDEX)
    }
    throw error
  }
}

async function upsertRow(row: LibraryRow): Promise<void> {
  const rows = await libraryRows()
  await replaceIndex([...rows.filter(item => item.sha256 !== row.sha256), row]
    .sort((a, b) => a.displayName.localeCompare(b.displayName)))
}

async function writeImportJournal(transaction: ImportTransaction): Promise<void> {
  await FileManager.writeAsString(IMPORT_JOURNAL, JSON.stringify(transaction, null, 2))
}

async function recoverPendingImport(): Promise<void> {
  if (!(await FileManager.exists(IMPORT_JOURNAL))) return
  let transaction: ImportTransaction | null = null
  try {
    const parsed = JSON.parse(await FileManager.readAsString(IMPORT_JOURNAL)) as ImportTransaction
    if (parsed.schemaVersion === 1 && parsed.kind === 'content-import' && isLibraryRow(parsed.row)
      && parsed.sha256 === parsed.row.sha256) transaction = parsed
  } catch { /* Invalid journals are removed below; they do not name trusted paths. */ }

  if (!transaction) {
    await FileManager.remove(IMPORT_JOURNAL)
    return
  }
  const expectedStaging = `${PATHS.transactions}/import-${transaction.sha256.slice(0, 16)}`
  const expectedDestination = `${PATHS.content}/${transaction.sha256}`
  if (transaction.stagingDirectory !== expectedStaging || transaction.destinationDirectory !== expectedDestination) {
    await FileManager.remove(IMPORT_JOURNAL)
    return
  }

  if (await FileManager.exists(expectedDestination)) {
    await upsertRow(transaction.row)
    if (await FileManager.exists(expectedStaging)) await FileManager.remove(expectedStaging)
  } else if (await FileManager.exists(expectedStaging)) {
    // The external source remains untouched. An unpublished stage is safe to discard.
    await FileManager.remove(expectedStaging)
  }
  await FileManager.remove(IMPORT_JOURNAL)
}

export async function bootstrap(): Promise<void> {
  await FileManager.createDirectory(ROOT, true)
  for (const path of Object.values(PATHS)) await FileManager.createDirectory(path, true)
  const marker = `${ROOT}/storage.v1.json`
  if (!(await FileManager.exists(marker))) {
    await FileManager.writeAsString(marker, JSON.stringify({
      schemaVersion: APP.storageSchema,
      product: 'gen1recomp-scripting',
      criticalDataNeverLivesOnlyInCache: true,
    }, null, 2))
  }
  await recoverPendingImport()
}

export async function libraryRows(): Promise<LibraryRow[]> {
  const primary = await readIndexCandidate(INDEX)
  if (primary) {
    if (primary.migrated) await replaceIndex(primary.index.entries)
    return primary.index.entries
  }
  const backup = await readIndexCandidate(INDEX_BACKUP)
  if (!backup) return []
  if (await FileManager.exists(INDEX)) await FileManager.remove(INDEX)
  await FileManager.copyFile(INDEX_BACKUP, INDEX)
  if (backup.migrated) await replaceIndex(backup.index.entries)
  return backup.index.entries
}

function sourceName(path: string): string {
  const name = path.split('/').pop() || 'game.gb'
  return name.length <= 160 ? name : name.slice(0, 160)
}

export async function importContent(sourcePath: string): Promise<LibraryRow> {
  if (await FileManager.exists(IMPORT_JOURNAL)) throw new Error('An import is awaiting recovery')
  const stat = await FileManager.stat(sourcePath)
  if (stat.size <= 0) throw new Error('The selected file is empty')
  if (stat.size > APP.maxImportBytes) throw new Error(`The selected file exceeds ${APP.maxImportBytes / 1024 / 1024} MB`)

  const data = await FileManager.readAsData(sourcePath)
  const sha256 = Crypto.sha256(data).toHexString().toLowerCase()
  const upstreamSha1 = Crypto.sha1(data).toHexString().toLowerCase()
  const known = identifyGame(upstreamSha1)
  const id = segment(`content-${sha256.slice(0, 16)}`)
  const destinationDirectory = `${PATHS.content}/${sha256}`
  const stagingDirectory = `${PATHS.transactions}/import-${sha256.slice(0, 16)}`
  const originalName = known ? 'original.gb' : 'original.bin'
  const importedAt = new Date().toISOString()
  const row: LibraryRow = {
    schemaVersion: 1,
    id,
    displayName: known?.displayName ?? sourceName(sourcePath).replace(/\.[^.]+$/, ''),
    sha256,
    upstreamSha1,
    byteLength: stat.size,
    sourceName: sourceName(sourcePath),
    importedAt,
    game: known?.id ?? 'unknown',
    region: known?.region ?? 'unknown',
    language: known?.language ?? 'unknown',
    revision: known?.revision ?? 'unknown',
    status: known ? 'runtime-unverified' : 'unsupported-content',
  }

  if (await FileManager.exists(destinationDirectory)) {
    await upsertRow(row)
    return row
  }
  if (await FileManager.exists(stagingDirectory)) await FileManager.remove(stagingDirectory)
  await FileManager.createDirectory(stagingDirectory, true)
  await FileManager.writeAsData(`${stagingDirectory}/${originalName}`, data)
  await FileManager.writeAsString(`${stagingDirectory}/content.json`, JSON.stringify({
    schemaVersion: 1,
    identity: { sha256, upstreamSha1, game: row.game, region: row.region, language: row.language, revision: row.revision },
    originalFile: originalName,
    byteLength: row.byteLength,
    importedAt,
  }, null, 2))

  const staged = await FileManager.readAsData(`${stagingDirectory}/${originalName}`)
  if (Crypto.sha256(staged).toHexString().toLowerCase() !== sha256) {
    await FileManager.remove(stagingDirectory)
    throw new Error('Staging verification failed')
  }
  const transaction: ImportTransaction = {
    schemaVersion: 1, kind: 'content-import', state: 'staged', sha256,
    stagingDirectory, destinationDirectory, row, updatedAt: new Date().toISOString(),
  }
  await writeImportJournal(transaction)
  await FileManager.rename(stagingDirectory, destinationDirectory)
  await writeImportJournal({ ...transaction, state: 'published', updatedAt: new Date().toISOString() })
  await upsertRow(row)
  await FileManager.remove(IMPORT_JOURNAL)
  return row
}

export async function readVerifiedLibraryRom(row: LibraryRow): Promise<ScriptingData> {
  const known = identifyGame(row.upstreamSha1)
  if (row.status !== 'runtime-unverified' || !known || row.game !== known.id
    || row.region !== known.region || row.language !== known.language || row.revision !== known.revision) {
    throw new Error('Only a recognized, runtime-gated library ROM can be bridged')
  }
  const sha256 = segment(row.sha256)
  const path = `${PATHS.content}/${sha256}/original.gb`
  if (!(await FileManager.exists(path))) throw new Error('The stored ROM original is missing')
  const data = await FileManager.readAsData(path)
  if (data.size !== row.byteLength
    || Crypto.sha256(data).toHexString().toLowerCase() !== row.sha256
    || Crypto.sha1(data).toHexString().toLowerCase() !== row.upstreamSha1) {
    throw new Error('The stored ROM failed size/SHA-256/SHA-1 revalidation')
  }
  return data
}

export async function saveCapabilityReport(report: unknown): Promise<string> {
  const path = `${PATHS.diagnostics}/capabilities.v3.json`
  const temp = `${path}.tmp`
  await FileManager.writeAsString(temp, JSON.stringify(report, null, 2))
  if (await FileManager.exists(path)) await FileManager.remove(path)
  await FileManager.rename(temp, path)
  return path
}
