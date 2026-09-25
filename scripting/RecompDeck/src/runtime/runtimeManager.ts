// Installs the pinned love.js runtime from the npm registry tarball.
//   1. download (allowlisted host), verify npm SHA-1 + pinned SHA-256
//   2. strip the gzip frame and inflate the raw DEFLATE natively
//      (Data.decompressed("zlib") = Apple Compression, raw DEFLATE);
//      fallback: DecompressionStream("gzip") in a throw-away WebView
//   3. walk the tar headers natively (Data.slice) and extract the pinned files
//   4. verify each extracted file against its pinned SHA-256
// SPDX-License-Identifier: GPL-3.0-or-later

import { listTar, parseGzipFrame } from '../core/archive'
import { RUNTIME_PIN, RuntimePin } from '../core/pins'
import { DIRS, ensureDir, exists, readJson, removeIfExists, writeDataAtomic, writeJson } from '../platform/fs'
import { sha256Hex } from '../platform/hash'
import { log } from '../platform/log'
import { download } from '../platform/net'

export interface RuntimeStatus {
  installed: boolean
  pinId: string
  dir: string
  loveJs: string
  loveWasm: string
  wasmSha256: string
  wasmSize: number
}

export function runtimeDir(pin: RuntimePin = RUNTIME_PIN) {
  return `${DIRS.runtime}/${pin.id}`
}

export async function runtimeStatus(pin: RuntimePin = RUNTIME_PIN): Promise<RuntimeStatus> {
  const dir = runtimeDir(pin)
  const meta = await readJson<{ pinId?: string }>(dir + '/runtime.json', {})
  const wasm = pin.files.find((f) => f.name === 'love.wasm')!
  const ok = meta.pinId === pin.id && (await exists(dir + '/love.js')) && (await exists(dir + '/love.wasm'))
  return {
    installed: ok,
    pinId: pin.id,
    dir,
    loveJs: dir + '/love.js',
    loveWasm: dir + '/love.wasm',
    wasmSha256: wasm.sha256,
    wasmSize: wasm.size,
  }
}

async function gunzipViaWebView(tgz: Data): Promise<Data> {
  const wv = new WebViewController({ ephemeral: true })
  try {
    await wv.loadHTML('<!doctype html><meta charset="utf-8"><title>gunzip</title>')
    await wv.waitForLoad()
    const b64 = tgz.toBase64String()
    const out = await wv.evaluateJavaScript<string>(`
      const bin = atob(${JSON.stringify(b64)});
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
      const buf = new Uint8Array(await new Response(stream).arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(s);
    `)
    const data = Data.fromBase64String(out)
    if (!data) throw new Error('WebView gunzip returned no data')
    return data
  } finally {
    wv.dispose()
  }
}

// The declarations model CompressionAlgorithm as a global enum (zlib = 3)
// while the documentation shows string values ("zlib"). Use the runtime enum
// when it exists and fall back to the documented string (docs/verification.md).
function zlibAlgorithm(): CompressionAlgorithm {
  const g = globalThis as unknown as { CompressionAlgorithm?: { zlib?: CompressionAlgorithm } }
  return g.CompressionAlgorithm?.zlib ?? ('zlib' as unknown as CompressionAlgorithm)
}

export async function gunzip(tgz: Data): Promise<Data> {
  const head = tgz.slice(0, Math.min(tgz.size, 2048)).toUint8Array()
  const trailer = tgz.slice(tgz.size - 8).toUint8Array()
  if (!head || !trailer) throw new Error('cannot read gzip data')
  const frame = parseGzipFrame(head, trailer, tgz.size)
  try {
    const out = tgz.slice(frame.deflateStart, frame.deflateEnd).decompressed(zlibAlgorithm())
    if (out.size % 4294967296 !== frame.isize) throw new Error('inflated size does not match the gzip trailer')
    return out
  } catch (e) {
    log('warn', 'native inflate failed, using WebView DecompressionStream: ' + String(e))
    const out = await gunzipViaWebView(tgz)
    if (out.size % 4294967296 !== frame.isize) throw new Error('inflated size does not match the gzip trailer')
    return out
  }
}

export async function installRuntime(onStatus: (s: string) => void, pin: RuntimePin = RUNTIME_PIN): Promise<RuntimeStatus> {
  const dir = runtimeDir(pin)
  onStatus('Downloading love.js…')
  const tgz = await download(pin.tarballUrl, { maxBytes: 64 * 1024 * 1024, sha1: pin.tarballSha1, sha256: pin.tarballSha256 })
  onStatus('Unpacking…')
  const tar = await gunzip(tgz)
  const entries = listTar((off) => {
    const h = tar.slice(off, off + 512).toUint8Array()
    if (!h) throw new Error('tar read failed')
    return h
  }, tar.size)
  await ensureDir(dir)
  for (const f of pin.files) {
    const e = entries.find((x) => x.name === f.tarPath)
    if (!e) throw new Error(`runtime archive is missing ${f.tarPath}`)
    if (e.size !== f.size) throw new Error(`${f.name}: unexpected size ${e.size} (pinned ${f.size})`)
    const bytes = tar.slice(e.offset, e.offset + e.size)
    const got = sha256Hex(bytes)
    if (got !== f.sha256) throw new Error(`${f.name}: SHA-256 mismatch (${got})`)
    onStatus(`Verified ${f.name}`)
    await writeDataAtomic(`${dir}/${f.name}`, bytes)
  }
  await writeJson(dir + '/runtime.json', { pinId: pin.id, installedAt: new Date().toISOString(), love: pin.love, source: pin.tarballUrl })
  log('info', `runtime ${pin.id} installed`)
  return runtimeStatus(pin)
}

export async function uninstallRuntime(pin: RuntimePin = RUNTIME_PIN) {
  await removeIfExists(runtimeDir(pin))
}
