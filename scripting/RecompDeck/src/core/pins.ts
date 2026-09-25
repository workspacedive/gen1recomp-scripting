// Pinned, verified download artifacts (SKILLS.md S6).
// SPDX-License-Identifier: GPL-3.0-or-later

export interface RuntimePin {
  id: string
  label: string
  /** LÖVE version implemented by the build. */
  love: string
  tarballUrl: string
  tarballSize: number
  /** npm dist.shasum (SHA-1 of the tarball, hex). */
  tarballSha1: string
  /** SHA-256 of the tarball, hex. */
  tarballSha256: string
  files: { name: string; tarPath: string; size: number; sha256: string }[]
  license: string
}

/**
 * love.js "compat" build (no pthreads/SharedArrayBuffer -> works in WKWebView
 * from file://), LÖVE 11.5 = the version gen1recomp targets. Published on the
 * npm registry by jeduden (MIT), derived from Davidobot/love.js.
 * Verified 2026-09-25: tarball SHA-1 matches npm dist.shasum; boots
 * gen1recomp v0.3.14 in headless Chromium (docs/verification.md).
 */
export const RUNTIME_PIN: RuntimePin = {
  id: 'lovejs-11.5.1-compat',
  label: 'love.js 11.5.1 (compat, WebGL 1)',
  love: '11.5',
  tarballUrl: 'https://registry.npmjs.org/@jeduden-love2d/love.js/-/love.js-11.5.1.tgz',
  tarballSize: 0, // unknown until download; size is not trusted, hashes are
  tarballSha1: 'a5c135170ec13306bc3067c33c584b79ad680248',
  tarballSha256: '8f94acd7e77b1b6999eb2b6c6202e20b6963643f4655c39d0a118dc34161cd9e',
  files: [
    { name: 'love.js', tarPath: 'package/src/compat/love.js', size: 335905, sha256: '86a993add89e4b62af875995ad954f39a23725f3f48553a1618b520738b228a0' },
    { name: 'love.wasm', tarPath: 'package/src/compat/love.wasm', size: 4720510, sha256: '8e955d3ca1db20c2c3509313c0093cf81826fc391f509194f85562ac57c601fa' },
  ],
  license: 'MIT (love.js tooling), zlib (LÖVE), MIT (Lua)',
}

/** Official game release channel. The archive hash comes from the release's
 * own sha256sums.txt at download time and must agree with GitHub's
 * server-computed asset digest (API field `digest`) when present; for tested
 * versions it must also equal the pinned digest below. Tested versions were
 * verified with this runtime (upstream test tiers + headless boot). */
export const GAME_SOURCE = {
  repo: 'bryanthaboi/gen1recomp',
  releasesApi: 'https://api.github.com/repos/bryanthaboi/gen1recomp/releases?per_page=15',
  releaseByTagApi: (version: string) => `https://api.github.com/repos/bryanthaboi/gen1recomp/releases/tags/v${version}`,
  assetName: (version: string) => `gen1recomp-${version}.love`,
  assetUrl: (version: string) => `https://github.com/bryanthaboi/gen1recomp/releases/download/v${version}/gen1recomp-${version}.love`,
  checksumsUrl: (version: string) => `https://github.com/bryanthaboi/gen1recomp/releases/download/v${version}/sha256sums.txt`,
  testedVersions: ['0.3.14'],
  /** SHA-256 of the official archives of tested versions (GitHub asset digest,
   * 2026-09-25). Allows verified offline imports of these files. */
  testedDigests: {
    '0.3.14': 'b425a2862419ab81731b5aa52dfb95766e78e7ebace0c7a4580cc4f8cb7ac619',
  } as Record<string, string>,
  /** Hard upper bound for the archive download (the 0.3.14 archive is 24.1 MB). */
  maxArchiveBytes: 200 * 1024 * 1024,
}

/** Hosts the host is allowed to contact (redirects included). */
export const NETWORK_ALLOWLIST = [
  'registry.npmjs.org',
  'api.github.com',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'codeload.github.com',
  'raw.githubusercontent.com',
]

export function hostAllowed(url: string): boolean {
  const m = /^https:\/\/([^/:?#]+)(?::443)?(?:[/?#]|$)/i.exec(url)
  if (!m) return false
  const host = m[1].toLowerCase()
  return NETWORK_ALLOWLIST.includes(host)
}

/** GitHub release-asset digest (`"sha256:<hex>"`) -> lowercase hex, or null. */
export function parseAssetDigest(d: unknown): string | null {
  if (typeof d !== 'string') return null
  const m = /^sha256:([0-9a-fA-F]{64})$/.exec(d.trim())
  return m ? m[1].toLowerCase() : null
}

/**
 * Combine independent checksum sources for one archive. `sums` (the release's
 * sha256sums.txt entry) is mandatory; every other available source must agree
 * with it, otherwise the download is refused.
 */
export function expectedArchiveSha256(sources: { sums?: string | null; assetDigest?: string | null; pinned?: string | null }): string {
  const sums = sources.sums?.toLowerCase()
  if (!sums || !/^[0-9a-f]{64}$/.test(sums)) throw new Error('archive is not listed in the release checksums')
  for (const [label, v] of [['GitHub asset digest', sources.assetDigest], ['pinned digest', sources.pinned]] as const) {
    if (v && v.toLowerCase() !== sums) throw new Error(`checksum sources disagree (sha256sums.txt vs ${label})`)
  }
  return sums
}

/** Parse a `sha256sums.txt` (GNU coreutils format). */
export function parseSha256Sums(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line)
    if (m) out[m[2].replace(/^.*\//, '')] = m[1].toLowerCase()
  }
  return out
}
