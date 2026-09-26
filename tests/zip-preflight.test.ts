import assert from "node:assert/strict"
import test from "node:test"
import { constants, deflateRawSync } from "node:zlib"
import { crc32, extractZipEntry, inflateRaw } from "../scripting/Gen1Recomp/zip-extract.js"
import { preflightModZip } from "../scripting/Gen1Recomp/zip-preflight.js"

interface Entry {
  path: string
  size?: number
  compressedSize?: number
  method?: number
  madeBy?: number
  external?: number
}

function put16(output: number[], value: number): void {
  output.push(value & 255, (value >>> 8) & 255)
}
function put32(output: number[], value: number): void {
  put16(output, value & 0xffff); put16(output, value >>> 16)
}

function centralZip(entries: Entry[]): Uint8Array {
  const encoder = new TextEncoder()
  const central: number[] = []
  for (const entry of entries) {
    const name = [...encoder.encode(entry.path)]
    put32(central, 0x02014b50)
    put16(central, entry.madeBy ?? 20)
    put16(central, 20); put16(central, 0); put16(central, entry.method ?? 0)
    put16(central, 0); put16(central, 0); put32(central, 0)
    put32(central, entry.compressedSize ?? entry.size ?? 0); put32(central, entry.size ?? 0)
    put16(central, name.length); put16(central, 0); put16(central, 0)
    put16(central, 0); put16(central, 0); put32(central, entry.external ?? 0)
    put32(central, 0); central.push(...name)
  }
  const output = [...central]
  put32(output, 0x06054b50); put16(output, 0); put16(output, 0)
  put16(output, entries.length); put16(output, entries.length)
  put32(output, central.length); put32(output, 0); put16(output, 0)
  return Uint8Array.from(output)
}

function realZip(files: Array<{ path: string, data: Uint8Array, method: 0 | 8, descriptor?: boolean }>): Uint8Array {
  const encoder = new TextEncoder()
  const local: number[] = []
  const rows: Array<{ name: number[], offset: number, flags: number, method: number, crc: number, compressed: Uint8Array, size: number }> = []
  for (const file of files) {
    const name = [...encoder.encode(file.path)]
    const compressed = file.method === 8 ? new Uint8Array(deflateRawSync(file.data)) : file.data
    const checksum = crc32(file.data)
    const flags = file.descriptor ? 8 : 0
    const offset = local.length
    put32(local, 0x04034b50); put16(local, 20); put16(local, flags); put16(local, file.method)
    put16(local, 0); put16(local, 0)
    put32(local, file.descriptor ? 0 : checksum)
    put32(local, file.descriptor ? 0 : compressed.length)
    put32(local, file.descriptor ? 0 : file.data.length)
    put16(local, name.length); put16(local, 0); local.push(...name, ...compressed)
    if (file.descriptor) {
      put32(local, 0x08074b50); put32(local, checksum); put32(local, compressed.length); put32(local, file.data.length)
    }
    rows.push({ name, offset, flags, method: file.method, crc: checksum, compressed, size: file.data.length })
  }
  const centralOffset = local.length
  const central: number[] = []
  for (const row of rows) {
    put32(central, 0x02014b50); put16(central, 20); put16(central, 20)
    put16(central, row.flags); put16(central, row.method); put16(central, 0); put16(central, 0)
    put32(central, row.crc); put32(central, row.compressed.length); put32(central, row.size)
    put16(central, row.name.length); put16(central, 0); put16(central, 0)
    put16(central, 0); put16(central, 0); put32(central, 0); put32(central, row.offset)
    central.push(...row.name)
  }
  const output = [...local, ...central]
  put32(output, 0x06054b50); put16(output, 0); put16(output, 0)
  put16(output, rows.length); put16(output, rows.length)
  put32(output, central.length); put32(output, centralOffset); put16(output, 0)
  return Uint8Array.from(output)
}

test("accepts a single-folder Gen1Recomp mod package", () => {
  const result = preflightModZip(centralZip([
    { path: "my-mod/manifest.json", size: 200 },
    { path: "my-mod/main.lua", size: 500 },
  ]))
  assert.equal(result.rootPrefix, "my-mod")
  assert.equal(result.manifestPath, "my-mod/manifest.json")
  assert.equal(result.expandedBytes, 700)
})

test("accepts a manifest at archive root", () => {
  assert.equal(preflightModZip(centralZip([
    { path: "manifest.json" }, { path: "main.lua" },
  ])).rootPrefix, "")
})

test("accepts asset-heavy mods beyond the former 4096-entry limit", () => {
  const entries: Entry[] = [{ path: "manifest.json" }, { path: "main.lua" }]
  for (let index = 0; index < 5000; index += 1) {
    entries.push({ path: `assets/frame-${index}.png` })
  }
  assert.equal(preflightModZip(centralZip(entries)).entries.length, 5002)
})

test("rejects traversal and absolute paths before extraction", () => {
  for (const path of ["../manifest.json", "/manifest.json", "C:/manifest.json", "a\\manifest.json"]) {
    assert.throws(() => preflightModZip(centralZip([{ path }])), /unsicheren Pfad/)
  }
})

test("rejects control characters and non-normalized Unicode paths", () => {
  for (const path of ["bad\n/manifest.json", "e\u0301/manifest.json"]) {
    assert.throws(() => preflightModZip(centralZip([{ path }])), /unsicheren Pfad/)
  }
})

test("rejects case-colliding paths", () => {
  assert.throws(() => preflightModZip(centralZip([
    { path: "manifest.json" }, { path: "MANIFEST.JSON" },
  ])), /doppelte/)
})

test("rejects Unix symbolic links", () => {
  assert.throws(() => preflightModZip(centralZip([
    { path: "manifest.json" },
    { path: "main.lua", madeBy: (3 << 8) | 20, external: 0xa000 << 16 },
  ])), /Symbolische Links/)
})

test("rejects oversized expanded entries", () => {
  assert.throws(() => preflightModZip(centralZip([
    { path: "manifest.json", size: 129 * 1024 * 1024 },
  ])), /zu groß/)
})

test("rejects archive-wide decompression bombs", () => {
  assert.throws(() => preflightModZip(centralZip([
    { path: "manifest.json" },
    { path: "main.lua", method: 8, compressedSize: 1024, size: 2 * 1024 * 1024 },
  ])), /Entpackverhältnis/)
})

test("CRC-32 matches the standard check vector", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926)
})

test("self-contained inflater handles dynamic, fixed and empty raw DEFLATE", () => {
  const source = new TextEncoder().encode("Gen1Recomp mod data ".repeat(2000))
  for (const options of [{}, { strategy: constants.Z_FIXED }]) {
    const compressed = new Uint8Array(deflateRawSync(source, options))
    assert.deepEqual(inflateRaw(compressed, source.length), source)
  }
  const empty = new Uint8Array(deflateRawSync(new Uint8Array()))
  assert.deepEqual(inflateRaw(empty, 0), new Uint8Array())
})

test("self-contained inflater rejects trailing compressed bytes", () => {
  const source = new TextEncoder().encode("bounded stream")
  const encoded = deflateRawSync(source)
  const compressed = new Uint8Array(encoded.length + 1)
  compressed.set(encoded)
  compressed[compressed.length - 1] = 0xaa
  assert.throws(() => inflateRaw(compressed, source.length), /nachgestellte Bytes/)
})

test("self-contained ZIP extraction verifies stored, deflated and descriptor entries", () => {
  const manifest = new TextEncoder().encode('{"id":"test","name":"Test","version":"1.0.0","api":2}')
  const main = new TextEncoder().encode("return true\n".repeat(100))
  const archive = realZip([
    { path: "manifest.json", data: manifest, method: 8, descriptor: true },
    { path: "main.lua", data: main, method: 0 },
  ])
  const parsed = preflightModZip(archive)
  assert.deepEqual(extractZipEntry(archive, parsed.records[0]!), manifest)
  assert.deepEqual(extractZipEntry(archive, parsed.records[1]!), main)
})

test("self-contained extraction rejects local and central filename disagreement", () => {
  const archive = realZip([
    { path: "manifest.json", data: new TextEncoder().encode("{}"), method: 0 },
  ])
  const parsed = preflightModZip(archive)
  archive[30] = "M".charCodeAt(0)
  assert.throws(() => extractZipEntry(archive, parsed.records[0]!), /widersprechen/)
})
