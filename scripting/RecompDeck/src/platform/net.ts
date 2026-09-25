// Network adapter: HTTPS only, host allowlist enforced for the initial URL
// AND every redirect, timeouts, size limits and hash verification. Downloads
// stay native (Response.data() -> Data) so no bytes are copied into JS.
// SPDX-License-Identifier: GPL-3.0-or-later

import { fetch } from 'scripting'
import { hostAllowed } from '../core/pins'
import { sha1Hex, sha256Hex } from './hash'

export class NetError extends Error {}

export interface DownloadOptions {
  maxBytes: number
  sha256?: string
  sha1?: string
  timeout?: number
  accept?: string
}

function checkUrl(url: string) {
  if (!hostAllowed(url)) throw new NetError('Blocked host (not on the allowlist): ' + url)
}

async function request(url: string, accept: string | undefined, timeout: number) {
  checkUrl(url)
  const res = await fetch(url, {
    method: 'GET',
    timeout,
    headers: {
      'User-Agent': 'RecompDeck/1.0 (Scripting iOS)',
      ...(accept ? { Accept: accept } : {}),
    },
    shouldAllowRedirect: async (next) => hostAllowed(next.url),
  })
  if (!res.ok) throw new NetError(`HTTP ${res.status} for ${url}`)
  if (res.url && !hostAllowed(res.url)) throw new NetError('Redirected to a blocked host: ' + res.url)
  return res
}

export async function fetchJson<T>(url: string, timeout = 30): Promise<T> {
  const res = await request(url, 'application/vnd.github+json, application/json', timeout)
  return (await res.json()) as T
}

export async function fetchText(url: string, maxBytes = 1024 * 1024, timeout = 30): Promise<string> {
  const res = await request(url, 'text/plain, */*', timeout)
  const data = await res.data()
  if (data.size > maxBytes) throw new NetError('Response too large: ' + url)
  return data.toDecodedString('utf8')
}

export async function download(url: string, opts: DownloadOptions): Promise<Data> {
  const res = await request(url, opts.accept ?? 'application/octet-stream', opts.timeout ?? 180)
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared && declared > opts.maxBytes) throw new NetError(`Download exceeds limit (${declared} bytes)`)
  const data = await res.data()
  if (data.size > opts.maxBytes) throw new NetError(`Download exceeds limit (${data.size} bytes)`)
  if (opts.sha256) {
    const got = sha256Hex(data)
    if (got !== opts.sha256.toLowerCase()) throw new NetError(`SHA-256 mismatch for ${url}\nexpected ${opts.sha256}\ngot      ${got}`)
  }
  if (opts.sha1) {
    const got = sha1Hex(data)
    if (got !== opts.sha1.toLowerCase()) throw new NetError(`SHA-1 mismatch for ${url}`)
  }
  return data
}
