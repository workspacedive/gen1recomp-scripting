// Official game releases: discovery (GitHub API), download and verification
// against the release's own sha256sums.txt, cross-checked with GitHub's asset
// digest and (for tested versions) a pinned digest. Stored unchanged.
// SPDX-License-Identifier: GPL-3.0-or-later

import { expectedArchiveSha256, GAME_SOURCE, parseAssetDigest, parseSha256Sums } from '../core/pins'
import { compareSemver, parseSemver } from '../core/semver'
import { DIRS, ensureDir, exists, readJson, removeIfExists, writeDataAtomic, writeJson } from '../platform/fs'
import { sha256Hex } from '../platform/hash'
import { log } from '../platform/log'
import { download, fetchJson, fetchText } from '../platform/net'

export interface ReleaseInfo {
  version: string
  tag: string
  name: string
  publishedAt: string
  prerelease: boolean
  loveAsset: boolean
  loveSize: number
  tested: boolean
}

export interface InstalledGame {
  version: string
  path: string
  sha256: string
  size: number
  verified: 'release-checksum' | 'pinned-digest' | 'user-confirmed'
  installedAt: string
}

const ACTIVE_FILE = () => DIRS.games + '/active.json'

interface GhAsset { name: string; size: number; digest?: string | null }
interface GhRelease { tag_name: string; name: string; published_at: string; prerelease: boolean; draft: boolean; assets: GhAsset[] }

export async function listReleases(): Promise<ReleaseInfo[]> {
  const data = await fetchJson<GhRelease[]>(GAME_SOURCE.releasesApi)
  if (!Array.isArray(data)) throw new Error('unexpected GitHub API response')
  const out: ReleaseInfo[] = []
  for (const r of data) {
    if (r.draft) continue
    const v = parseSemver(r.tag_name)
    if (!v) continue
    const version = `${v.major}.${v.minor}.${v.patch}${v.pre.length ? '-' + v.pre.join('.') : ''}`
    const asset = (r.assets ?? []).find((a) => a.name === GAME_SOURCE.assetName(version))
    out.push({
      version,
      tag: r.tag_name,
      name: r.name || r.tag_name,
      publishedAt: r.published_at,
      prerelease: !!r.prerelease,
      loveAsset: !!asset,
      loveSize: asset ? asset.size : 0,
      tested: GAME_SOURCE.testedVersions.includes(version),
    })
  }
  out.sort((a, b) => compareSemver(b.version, a.version))
  return out
}

export async function installedGames(): Promise<InstalledGame[]> {
  const out: InstalledGame[] = []
  if (!(await exists(DIRS.games))) return out
  for (const name of await FileManager.readDirectory(DIRS.games)) {
    const meta = await readJson<InstalledGame | null>(`${DIRS.games}/${name}/meta.json`, null)
    if (meta && (await exists(meta.path))) out.push(meta)
  }
  out.sort((a, b) => compareSemver(b.version, a.version))
  return out
}

export async function activeGame(): Promise<InstalledGame | null> {
  const active = await readJson<{ version?: string }>(ACTIVE_FILE(), {})
  const all = await installedGames()
  return all.find((g) => g.version === active.version) ?? all[0] ?? null
}

export async function setActiveGame(version: string) {
  await writeJson(ACTIVE_FILE(), { version })
}

export async function installRelease(version: string, onStatus: (s: string) => void): Promise<InstalledGame> {
  if (!parseSemver(version)) throw new Error('invalid version')
  onStatus('Fetching official checksums…')
  const sums = parseSha256Sums(await fetchText(GAME_SOURCE.checksumsUrl(version), 256 * 1024))
  const name = GAME_SOURCE.assetName(version)
  let assetDigest: string | null = null
  try {
    const rel = await fetchJson<GhRelease>(GAME_SOURCE.releaseByTagApi(version))
    assetDigest = parseAssetDigest((rel.assets ?? []).find((a) => a.name === name)?.digest)
  } catch (e) {
    log('warn', 'release metadata unavailable, relying on sha256sums.txt: ' + String(e))
  }
  const expected = expectedArchiveSha256({ sums: sums[name], assetDigest, pinned: GAME_SOURCE.testedDigests[version] })
  onStatus(`Downloading ${name}…`)
  const data = await download(GAME_SOURCE.assetUrl(version), { maxBytes: GAME_SOURCE.maxArchiveBytes, sha256: expected, timeout: 600 })
  const dir = `${DIRS.games}/${version}`
  await ensureDir(dir)
  const path = `${dir}/${name}`
  await writeDataAtomic(path, data)
  const meta: InstalledGame = { version, path, sha256: expected, size: data.size, verified: 'release-checksum', installedAt: new Date().toISOString() }
  await writeJson(dir + '/meta.json', meta)
  await setActiveGame(version)
  log('info', `installed game ${version} (${data.size} bytes, sha256 ${expected})`)
  return meta
}

/**
 * Import a .love the user already has (e.g. offline). If the network is
 * available the file is checked against the official checksums of the version
 * in its file name; otherwise the user must confirm the unverified archive.
 */
export async function importLoveFile(srcPath: string, confirmUnverified: (sha: string) => Promise<boolean>): Promise<InstalledGame> {
  const base = srcPath.slice(srcPath.lastIndexOf('/') + 1)
  const m = /^gen1recomp-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\.love$/.exec(base)
  const data = await FileManager.readAsData(srcPath)
  if (data.size > GAME_SOURCE.maxArchiveBytes || data.size < 1024) throw new Error('not a plausible game archive')
  const head = data.slice(0, 4).toUint8Array()
  if (!head || head[0] !== 0x50 || head[1] !== 0x4b) throw new Error('not a .love (ZIP) archive')
  const sha = sha256Hex(data)
  let verified: InstalledGame['verified'] = 'user-confirmed'
  const version = m ? m[1] : 'local-' + sha.slice(0, 8)
  const pinned = m ? GAME_SOURCE.testedDigests[m[1]] : undefined
  if (pinned && pinned !== sha) throw new Error('This file does not match the official release checksum.')
  if (pinned) {
    verified = 'pinned-digest' // official archive of a tested version, verified offline
  } else if (m) {
    try {
      const sums = parseSha256Sums(await fetchText(GAME_SOURCE.checksumsUrl(m[1]), 256 * 1024))
      if (sums[base] === sha) verified = 'release-checksum'
      else if (sums[base]) throw new Error('This file does not match the official release checksum.')
    } catch (e) {
      if (String(e).includes('does not match')) throw e
      log('warn', 'could not reach release checksums: ' + String(e))
    }
  }
  if (verified === 'user-confirmed' && !(await confirmUnverified(sha))) throw new Error('import cancelled')
  const dir = `${DIRS.games}/${version}`
  const path = `${dir}/gen1recomp-${version}.love`
  await ensureDir(dir)
  await writeDataAtomic(path, data)
  const meta: InstalledGame = { version, path, sha256: sha, size: data.size, verified, installedAt: new Date().toISOString() }
  await writeJson(dir + '/meta.json', meta)
  await setActiveGame(version)
  return meta
}

export async function removeGame(version: string) {
  await removeIfExists(`${DIRS.games}/${version}`)
}
