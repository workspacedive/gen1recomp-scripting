import assert from "node:assert/strict"
import test from "node:test"
import { preflightModZip } from "../scripting/Gen1Recomp/zip-preflight.js"

interface Entry { path: string; size?: number; madeBy?: number; external?: number }

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
    put16(central, 20); put16(central, 0); put16(central, 0)
    put16(central, 0); put16(central, 0); put32(central, 0)
    put32(central, 0); put32(central, entry.size ?? 0)
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
