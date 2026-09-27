import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const root = new URL("../scripting/Gen1Recomp/", import.meta.url)

test("gameplay exposes only a validated transient mod overlay through the resource bridge", async () => {
  const runtime = await readFile(new URL("runtime-store.ts", root), "utf8")
  assert.match(runtime, /prepareRuntimeModOverlay\(payload\.data\)/)
  assert.match(runtime, /\[GEN1_PAYLOAD_BRIDGE_PATH, runtimePayload\.data\]/)
  assert.doesNotMatch(runtime, /WebAssembly\.(?:instantiate|compile)/)
  const mark = runtime.lastIndexOf("markModsRuntimeVisible")
  const ready = runtime.lastIndexOf('report.status === "ready"')
  assert.ok(ready > 0 && mark > ready, "runtime-visible state must follow a ready report")
})

test("multiple actions in each native List row use independent button hit handling", async () => {
  const source = await readFile(new URL("index.tsx", root), "utf8")
  for (const title of ["Spiel starten", "Aus Bibliothek entfernen", "Paket entfernen"]) {
    assert.match(source, new RegExp(`<Button title="${title}"[^>]*buttonStyle="borderless"`))
  }
  assert.match(source, /<Button title=\{mod\.activation[^>]*buttonStyle="borderless"/s)
  assert.doesNotMatch(source, /<VStack[^>]*buttonStyle=/)
})

test("mod activation revalidates retained package identity before creating mods/id paths", async () => {
  const source = await readFile(new URL("mod-store.ts", root), "utf8")
  for (const required of [
    "Crypto.sha256(archiveData)", "preflightModZip(bytes)", "extractZipEntry(bytes, entry)",
    "manifest.id !== mod.id", "manifest.version !== mod.version", "`mods/${mod.id}/${relative}`",
  ]) assert.ok(source.includes(required), `missing activation invariant: ${required}`)
  assert.ok(source.indexOf("await saveIndex(index)", source.indexOf("removeInstalledMod"))
    < source.indexOf("removeIfExists(safeJoin(MODS_ROOT, current.relativePath))", source.indexOf("removeInstalledMod")))
})
