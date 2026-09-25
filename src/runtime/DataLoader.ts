/**
 * DataLoader — loads generated data from library/<id>/generated/
 * VERIFIZIERT gegen CacheFs.lua + CacheContract.lua + Data.lua (load + prefix)
 * Strategy: try .lua.json (fast JSON.parse) first, fallback to .lua via LuaRunner (fengari)
 */
import type { FilesPort } from "../host/ports"
import type { LibraryEntry } from "../library/GameLibrary"
import { LuaRunner } from "./LuaRunner"

export type LoadResult<T> = { ok: true; data: T; source: "json" | "lua" } | { ok: false; error: string }

export class DataLoader {
  constructor(private files: FilesPort) {}

  private async readText(path: string): Promise<string | null> {
    try {
      if (await this.files.exists(path)) return await this.files.readAsString(path)
    } catch {}
    return null
  }

  async loadJsonOrLua<T=any>(entry: LibraryEntry, rel: string): Promise<LoadResult<T>> {
    const base = this.files.documentsDirectory + "/" + entry.generatedPrefix.replace(/\/+$/,"")
    // try json sidecar first
    const jsonPath = base + "/" + rel + ".json" // e.g. data/generated/maps.lua.json
    let txt = await this.readText(jsonPath)
    if (txt !== null) {
      try { return { ok: true, data: JSON.parse(txt) as T, source: "json" } } catch (e) { /* fallthrough to lua */ }
    }
    const luaPath = base + "/" + rel
    txt = await this.readText(luaPath)
    if (txt !== null) {
      try {
        const runner = new LuaRunner()
        const data = runner.loadReturn(txt) as T
        runner.close()
        return { ok: true, data, source: "lua" }
      } catch (e:any) { return { ok: false, error: `lua parse failed for ${rel}: ${String(e?.message ?? e)}` } }
    }
    return { ok: false, error: `missing ${rel} (and ${rel}.json)` }
  }

  // Convenience loaders
  loadConstants(entry: LibraryEntry) { return this.loadJsonOrLua(entry, "data/generated/constants.lua") }
  loadMaps(entry: LibraryEntry) { return this.loadJsonOrLua(entry, "data/generated/maps.lua") }
  loadTilesets(entry: LibraryEntry) { return this.loadJsonOrLua(entry, "data/generated/tilesets.lua") }
  loadText(entry: LibraryEntry) { return this.loadJsonOrLua(entry, "data/generated/text.lua") }
  loadField(entry: LibraryEntry) { return this.loadJsonOrLua(entry, "data/generated/field.lua") }

  // Verify CacheContract isReady-ish: checks that essential files loadable
  async verify(entry: LibraryEntry): Promise<{ ok: boolean; missing: string[] }> {
    const required = ["data/generated/constants.lua","data/generated/maps.lua","data/generated/text.lua","data/generated/field.lua","data/generated/battle_anims.lua"]
    const missing: string[] = []
    for (const rel of required) {
      const r = await this.loadJsonOrLua(entry, rel)
      if (!r.ok) missing.push(rel)
    }
    return { ok: missing.length===0, missing }
  }
}
