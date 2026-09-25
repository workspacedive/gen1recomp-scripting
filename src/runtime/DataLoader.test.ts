import { describe, it, expect } from "vitest"
import { DataLoader } from "./DataLoader"
import { RomExtractor, encodeLuaTable } from "../extract/RomExtractor"
import { manifestForGameId } from "../extract/Manifest"

class MemFiles {
  documentsDirectory="/docs"; temporaryDirectory="/tmp"; appGroupDocumentsDirectory="/g"; isiCloudEnabled=false
  store=new Map<string,Uint8Array>(); dirs=new Set<string>(["/docs"])
  async exists(p:string){ return this.store.has(p) || this.dirs.has(p) }
  async isFile(p:string){ return this.store.has(p) }
  async isDirectory(p:string){ return this.dirs.has(p) }
  async isLink(){ return false }
  async createDirectory(p:string){ const parts=p.split("/"); let cur=""; for(const part of parts){ if(!part) continue; cur+="/"+part; this.dirs.add(cur)} }
  async readDirectory(){ return [] as string[] }
  async readAsString(p:string){ const b=this.store.get(p); if(!b) throw new Error("miss "+p); return new TextDecoder().decode(b)}
  readAsStringSync(p:string){ return new TextDecoder().decode(this.store.get(p)!)}
  async readAsBytes(p:string){ const b=this.store.get(p); if(!b) throw new Error("miss "+p); return b}
  readAsBytesSync(p:string){ return this.store.get(p)!}
  async readAsData(){ return null as any}
  async writeAsString(p:string,s:string){ this.store.set(p,new TextEncoder().encode(s)); this.dirs.add(p.slice(0,p.lastIndexOf("/")))}
  writeAsStringSync(p:string,s:string){ this.store.set(p,new TextEncoder().encode(s))}
  async writeAsBytes(p:string,d:Uint8Array){ this.store.set(p,d); this.dirs.add(p.slice(0,p.lastIndexOf("/")))}
  writeAsBytesSync(p:string,d:Uint8Array){ this.store.set(p,d)}
  async writeAsData(){}
  async copyFile(s:string,d:string){ const b=this.store.get(s); if(!b) throw new Error("copy miss "+s); this.store.set(d,b); this.dirs.add(d.slice(0,d.lastIndexOf("/")))}
  copyFileSync(s:string,d:string){ const b=this.store.get(s)!; this.store.set(d,b)}
  async remove(p:string){ for(const k of [...this.store.keys()]) if(k===p||k.startsWith(p+"/")) this.store.delete(k)}
  bookmarkedPath(){ return null }
}

describe("DataLoader", ()=>{
  it("lädt via json und lua (fengari roundtrip)", async()=>{
    const files=new MemFiles() as any
    const bytes=new Uint8Array(1*1024*1024)
    const manifest=manifestForGameId("red")
    const ex=new RomExtractor(bytes, manifest)
    // run extractor to write files
    await ex.run(files, "library/test/generated/", "red", "rom-cache-v12-gen1:fake")
    const entry:any={ id:"test", gameId:"red", generatedPrefix:"library/test/generated/", cacheMarker:"rom-cache-v12-gen1:fake" }
    const loader=new DataLoader(files)
    const cr=await loader.loadConstants(entry)
    expect(cr.ok).toBe(true)
    if (cr.ok) expect(cr.data.tilesetOrder).toBeDefined()
    const mr=await loader.loadMaps(entry)
    expect(mr.ok).toBe(true)
    if (mr.ok) expect(Object.keys(mr.data).length).toBeGreaterThan(0)
    // verify
    const v=await loader.verify(entry)
    expect(v.ok).toBe(true)
  })
  it("fallback auf .lua wenn json fehlt (fengari)", async()=>{
    const files=new MemFiles() as any
    const base="/docs/library/fallback/generated/data/generated"
    await files.createDirectory(base, true)
    const data={ hello:"world", arr:[1,2,3] }
    const lua=encodeLuaTable(data)
    await files.writeAsString(base+"/maps.lua", lua)
    // no json sidecar
    const entry:any={ id:"fallback", gameId:"red", generatedPrefix:"library/fallback/generated/" }
    const loader=new DataLoader(files)
    const r=await loader.loadJsonOrLua(entry, "data/generated/maps.lua")
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.data as any).hello).toBe("world")
  })
})
