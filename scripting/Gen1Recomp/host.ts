import { Crypto, Data, FileManager } from 'scripting'

export const ROOT = `${FileManager.documentsDirectory}/Gen1Recomp`
export const PATHS = {
  library: `${ROOT}/Library`, content: `${ROOT}/Library/content`, cores: `${ROOT}/Cores`,
  profiles: `${ROOT}/Profiles`, saves: `${ROOT}/Saves`, mods: `${ROOT}/Mods`,
  generated: `${ROOT}/Generated`, cache: `${ROOT}/Cache`, transactions: `${ROOT}/Transactions`,
  diagnostics: `${ROOT}/Diagnostics`, recovery: `${ROOT}/Recovery`, inbox: `${ROOT}/Inbox`, exports: `${ROOT}/Exports`,
} as const

export interface LibraryRow {
  schemaVersion: 1
  id: string
  displayName: string
  sha256: string
  byteLength: number
  sourceName: string
  importedAt: string
  game: 'unknown'
  status: 'runtime-unverified'
}

function segment(value: string): string {
  const clean = value.normalize('NFC')
  if (!/^[a-z0-9][a-z0-9._-]{0,95}$/i.test(clean) || clean === '.' || clean === '..') throw new Error('Unsafe identifier')
  return clean
}

export async function bootstrap(): Promise<void> {
  await FileManager.createDirectory(ROOT, true)
  for (const path of Object.values(PATHS)) await FileManager.createDirectory(path, true)
  const marker = `${ROOT}/storage.v1.json`
  if (!(await FileManager.exists(marker))) {
    await FileManager.writeAsString(marker, JSON.stringify({ schemaVersion: 1, product: 'gen1recomp-scripting', criticalDataNeverLivesOnlyInCache: true }, null, 2))
  }
}

export async function libraryRows(): Promise<LibraryRow[]> {
  const index = `${PATHS.library}/index.v1.json`
  const backup = `${PATHS.library}/index.v1.json.bak`
  for (const candidate of [index, backup]) {
    if (!(await FileManager.exists(candidate))) continue
    try {
      const parsed = JSON.parse(await FileManager.readAsString(candidate))
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.entries)) continue
      if (candidate === backup && !(await FileManager.exists(index))) await FileManager.copyFile(backup, index)
      return parsed.entries
    } catch { /* Try the recovery copy. */ }
  }
  return []
}

export async function importContent(sourcePath: string): Promise<LibraryRow> {
  const data = await FileManager.readAsData(sourcePath)
  const sha256 = Crypto.sha256(data).toHexString().toLowerCase()
  const upstreamSha1 = Crypto.sha1(data).toHexString().toLowerCase()
  const known = identifyGame(upstreamSha1)
  const stat = await FileManager.stat(sourcePath)
  const id = segment(`content-${sha256.slice(0, 16)}`)
  const destinationDirectory = `${PATHS.content}/${sha256}`
  const staging = `${PATHS.transactions}/import-${sha256.slice(0, 16)}`
  await FileManager.createDirectory(staging, true)
  await FileManager.writeAsData(`${staging}/original.gb`, data)
  const staged = await FileManager.readAsData(`${staging}/original.gb`)
  if (Crypto.sha256(staged).toHexString().toLowerCase() !== sha256) throw new Error('Staging verification failed')
  if (!(await FileManager.exists(destinationDirectory))) {
    await FileManager.rename(staging, destinationDirectory)
  } else {
    await FileManager.remove(staging)
  }
  const sourceName = sourcePath.split('/').pop() || 'game.gb'
  const row: LibraryRow = { schemaVersion: 1, id, displayName: sourceName.replace(/\.[^.]+$/, ''), sha256, byteLength: stat.size, sourceName, importedAt: new Date().toISOString(), game: 'unknown', status: 'runtime-unverified' }
  const rows = await libraryRows()
  const next = [...rows.filter(item => item.sha256 !== sha256), row]
  const indexPath = `${PATHS.library}/index.v1.json`
  const tmp = `${PATHS.library}/index.v1.json.tmp`
  const backup = `${PATHS.library}/index.v1.json.bak`
  await FileManager.writeAsString(tmp, JSON.stringify({ schemaVersion: 1, entries: next }, null, 2))
  if (await FileManager.exists(indexPath)) {
    if (await FileManager.exists(backup)) await FileManager.remove(backup)
    await FileManager.copyFile(indexPath, backup)
    await FileManager.remove(indexPath)
  }
  await FileManager.rename(tmp, indexPath)
  return row
}

export async function saveCapabilityReport(report: unknown): Promise<string> {
  const path = `${PATHS.diagnostics}/capabilities.v1.json`
  await FileManager.writeAsString(path, JSON.stringify(report, null, 2))
  return path
}
