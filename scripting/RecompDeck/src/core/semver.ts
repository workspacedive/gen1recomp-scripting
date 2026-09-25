// Minimal semantic-version parsing/comparison (release tags like "v0.3.14").
// SPDX-License-Identifier: GPL-3.0-or-later

export interface SemVer {
  major: number
  minor: number
  patch: number
  pre: string[]
}

const RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

export function parseSemver(input: string): SemVer | null {
  const m = RE.exec(String(input).trim())
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ? m[4].split('.') : [],
  }
}

function cmpId(a: string, b: string): number {
  const na = /^\d+$/.test(a)
  const nb = /^\d+$/.test(b)
  if (na && nb) return Number(a) - Number(b)
  if (na) return -1
  if (nb) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

export function compareSemver(a: string, b: string): number {
  const x = parseSemver(a)
  const y = parseSemver(b)
  if (!x || !y) return 0
  if (x.major !== y.major) return x.major - y.major
  if (x.minor !== y.minor) return x.minor - y.minor
  if (x.patch !== y.patch) return x.patch - y.patch
  if (!x.pre.length && y.pre.length) return 1
  if (x.pre.length && !y.pre.length) return -1
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    if (x.pre[i] === undefined) return -1
    if (y.pre[i] === undefined) return 1
    const c = cmpId(x.pre[i], y.pre[i])
    if (c) return c
  }
  return 0
}

export function isNewer(candidate: string, current: string | null | undefined): boolean {
  if (!current) return true
  return compareSemver(candidate, current) > 0
}
