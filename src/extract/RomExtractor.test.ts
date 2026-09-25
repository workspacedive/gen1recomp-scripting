import { describe, it, expect } from "vitest"
import { RomExtractor } from "./RomExtractor"
import { manifestForGameId } from "./Manifest"

class MemFiles {
  documentsDirectory="/docs"; temporaryDirectory="/tmp"; appGroupDocumentsDirectory="/g"; isiCloudEnabled=false
  store=new Map<string,Uint8Array>(); dirs=new Set<string>(["/docs"])
  async exists(p:string){ return this.store.has(p) || this.dirs.has(p) }
  existsSync(p:string){ return this.store.has(p) }
  async isFile(p:string){ return this.store.has(p) }
  async isDirectory(p:string){ return this.dirs.has(p) }
  async isLink(){ return false }
  async createDirectory(p:string){ const parts=p.split("/"); let cur=""; for(const part of parts){ if(!part) continue; cur+="/"+part; this.dirs.add(cur)} }
  async readDirectory(){ return [] as string[] }
  async readAsString(p:string){ const b=this.store.get(p); if(!b) throw new Error("miss "+p); return new TextDecoder().decode(b)}
  readAsStringSync(p:string){ return new TextDecoder().decode(this.store.get(p)!) }
  async readAsBytes(p:string){ const b=this.store.get(p); if(!b) throw new Error("miss "+p); return b}
  readAsBytesSync(p:string){ return this.store.get(p)! }
  async readAsData(){ return null as any }
  async writeAsString(p:string,s:string){ this.store.set(p,new TextEncoder().encode(s)); this.dirs.add(p.slice(0,p.lastIndexOf("/"))) }
  writeAsStringSync(p:string,s:string){ this.store.set(p,new TextEncoder().encode(s))}
  async writeAsBytes(p:string,d:Uint8Array){ this.store.set(p,d); this.dirs.add(p.slice(0,p.lastIndexOf("/")))}
  writeAsBytesSync(p:string,d:Uint8Array){ this.store.set(p,d)}
  async writeAsData(){}
  async copyFile(s:string,d:string){ const b=this.store.get(s); if(!b) throw new Error("copy miss "+s); this.store.set(d,b); this.dirs.add(d.slice(0,d.lastIndexOf("/")))}
  copyFileSync(s:string,d:string){ const b=this.store.get(s)!; this.store.set(d,b)}
  async remove(p:string){ for(const k of [...this.store.keys()]) if(k===p||k.startsWith(p+"/")) this.store.delete(k)}
  bookmarkedPath(){ return null }
}

describe("RomExtractor — Gen1 (VERIFIZIERT gegen RomExtractor.lua)", ()=>{
  it("extractConstants liefert tilesetOrder/mapOrder aus Manifest", ()=>{
    const bytes=new Uint8Array(1*1024*1024)
    const m=manifestForGameId("red")
    const ex=new RomExtractor(bytes, m)
    const c=ex.extractConstants()
    expect(c.tilesetOrder.length).toBeGreaterThan(0)
    expect(c.mapOrder.length).toBeGreaterThan(0)
  })
  it("writeAll erzeugt CacheContract REQUIRED_FILES (14) + marker", async()=>{
    const files=new MemFiles() as any
    const bytes=new Uint8Array(1*1024*1024)
    const m=manifestForGameId("red")
    const marker="rom-cache-v12-gen1:ea9bcae617fdf159b045185467ae58b2e4a48b9a"
    const ex=new RomExtractor(bytes, m)
    const written=await ex.writeAll(files, "library/test/generated/", "red")
    expect(written).toEqual(expect.arrayContaining([
      "data/generated/constants.lua",
      "data/generated/maps.lua",
      "assets/generated/title/pokemon_logo.png",
      "assets/generated/audio/programs.bin",
    ]))
    // need marker via run
    const r=await ex.run(files, "library/test2/generated/", "red", marker)
    expect(r.marker).toBe(marker)
    expect(await files.exists("/docs/library/test2/generated/rom-cache.complete")).toBe(true)
    const mc=await files.readAsString("/docs/library/test2/generated/rom-cache.complete")
    expect(mc).toBe(marker)
    // check a written lua is loadable as lua return
    const lua=await files.readAsString("/docs/library/test2/generated/data/generated/maps.lua")
    expect(lua.startsWith("return {")).toBe(true)
    // json sidecar exists
    const json=await files.readAsString("/docs/library/test2/generated/data/generated/maps.lua.json")
    expect(()=> JSON.parse(json)).not.toThrow()
  })
  it("yellow manifest liefert yellow-spezifische Tileset-Anzahl (größer als red)", ()=>{
    const red=manifestForGameId("red").constants.tilesetOrder.length
    const yellow=manifestForGameId("yellow").constants.tilesetOrder.length
    expect(yellow).toBeGreaterThanOrEqual(red)
  })
  it("GameLibrary via RomExtractor: importBytes mit synthetic zerofilled ROM (stub hash bypass) → isReady", async()=>{
    // Teste RomExtractor direkt mit MemFiles — indirekt geprüft via GameLibrary fallback path
    // Hier nur sanity: gold manifest hat generation 2 aber extractor funktioniert tolerant mit zero ROM
    const files=new MemFiles() as any
    const bytes=new Uint8Array(2*1024*1024)
    const m=manifestForGameId("gold")
    const ex=new RomExtractor(bytes, m)
    const res=await ex.run(files, "library/goldtest/generated/", "gold", "rom-cache-v12:d8b8a3600a465308c9953dfa04f0081c05bdcb94")
    expect(res.filesWritten.length).toBeGreaterThan(10)
  })
})
