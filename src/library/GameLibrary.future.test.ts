import { describe, it, expect } from "vitest"
import { GameLibrary, KNOWN_SHA1, FORMAT_VERSION } from "./GameLibrary"

class MemFiles {
  documentsDirectory="/docs"; temporaryDirectory="/tmp"; appGroupDocumentsDirectory="/g"; isiCloudEnabled=false
  store=new Map<string,Uint8Array>(); dirs=new Set<string>(["/docs"])
  async exists(p:string){ return this.store.has(p) || this.dirs.has(p) }
  existsSync(p:string){ return this.store.has(p) }
  async isFile(p:string){ return this.store.has(p) }
  async isDirectory(p:string){ return this.dirs.has(p) }
  async isLink(){ return false }
  async createDirectory(p:string){ const parts=p.split("/"); let cur=""; for(const part of parts){ if(!part) continue; cur+="/"+part; this.dirs.add(cur)} }
  async readDirectory(p:string){ const pref=p+"/"; return [...this.store.keys()].filter(k=>k.startsWith(pref)).map(k=>k.slice(pref.length).split("/")[0]) }
  async readAsString(p:string){ const b=this.store.get(p); if(!b) throw new Error("miss"); return new TextDecoder().decode(b)}
  readAsStringSync(p:string){ return new TextDecoder().decode(this.store.get(p)!)}
  async readAsBytes(p:string){ const b=this.store.get(p); if(!b) throw new Error("miss"); return b}
  readAsBytesSync(p:string){ return this.store.get(p)!}
  async readAsData(){ return null as any}
  async writeAsString(p:string,s:string){ this.store.set(p,new TextEncoder().encode(s)); this.dirs.add(p.slice(0,p.lastIndexOf("/")))}
  writeAsStringSync(p:string,s:string){ this.store.set(p,new TextEncoder().encode(s))}
  async writeAsBytes(p:string,d:Uint8Array){ this.store.set(p,d); this.dirs.add(p.slice(0,p.lastIndexOf("/")))}
  writeAsBytesSync(p:string,d:Uint8Array){ this.store.set(p,d)}
  async writeAsData(){}
  async copyFile(s:string,d:string){ const b=this.store.get(s); if(!b) throw new Error("copy"); this.store.set(d,b)}
  copyFileSync(s:string,d:string){ const b=this.store.get(s)!; this.store.set(d,b)}
  async remove(p:string){ for(const k of [...this.store.keys()]) if(k===p||k.startsWith(p+"/")) this.store.delete(k)}
}
function memStore(){
  const m=new Map<string,any>()
  return { get:(k:string)=> m.get(k)??null, set:(k:string,v:any)=>{m.set(k,v); return true}, getData:()=>null, setData:()=>{}, remove:(k:string)=>m.delete(k), contains:(k:string)=>m.has(k), keys:()=>[...m.keys()], clear:()=>m.clear(), _m:m } as any
}

// Helper: deterministic sha1 for test: we can't brute-force known hashes, so test via FORMAT mapping + import rejection
describe("GameLibrary — Future Games (Gold/Silver/Crystal/FireRed/LeafGreen) §8, §10", ()=>{
  it("KNOWN_SHA1 enthält alle 8 GameIds", ()=>{
    const values=new Set(Object.values(KNOWN_SHA1))
    for (const g of ["red","blue","yellow","gold","silver","crystal","firered","leafgreen"]) {
      expect(values.has(g as any)).toBe(true)
    }
    // crystal hat 2 hashes, firered 2, leafgreen 2
    expect(Object.keys(KNOWN_SHA1).length).toBe(11)
  })
  it("FORMAT_VERSION für jede GameId definiert und korrekt versioniert", ()=>{
    for (const g of ["red","blue","yellow","gold","silver","crystal","firered","leafgreen"] as const) {
      const f=FORMAT_VERSION[g]
      expect(f).toBeTruthy()
      expect(f.startsWith("rom-cache-")).toBe(true)
    }
    expect(FORMAT_VERSION.red).toBe("rom-cache-v12-gen1:")
    expect(FORMAT_VERSION.firered).toBe("rom-cache-v17-firered:")
    expect(FORMAT_VERSION.leafgreen).toBe("rom-cache-v2-leafgreen:")
  })
  it("Unbekannter Hash → Import abgelehnt (kein Pro, nur kanonische ROMs)", async()=>{
    const f=new MemFiles() as any, s=memStore()
    const lib=new GameLibrary(f,s)
    const fake=new Uint8Array(1*1024*1024) // 1MiB, aber hash nicht in KNOWN_SHA1
    const r=await lib.importBytes(fake, "fake.gb")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("Unbekannter ROM")
  })
  it("isReady prüft marker + REQUIRED_FILES (für alle Games gleich)", async()=>{
    const f=new MemFiles() as any, s=memStore()
    const lib=new GameLibrary(f,s)
    // Erzeuge fake entry für crystal
    const entry:any={
      id:"test-crystal", gameId:"crystal", region:"US", language:"en",
      contentHash:"f4cd194bdee0d04ca4eac29e09b8e4e9d818c133", contentSize:2*1024*1024,
      format:"gbc", importDate:Date.now(), lastPlayed:null,
      generatedPrefix:"library/test-crystal/generated/", cacheMarker: FORMAT_VERSION.crystal + "f4cd194bdee0d04ca4eac29e09b8e4e9d818c133",
      isReady:false,
    }
    s.set("library:index", [entry])
    // Noch kein marker → false
    expect(await lib.isReady(entry)).toBe(false)
    // Erzeuge marker + required files
    await f.createDirectory("/docs/library/test-crystal/generated/data/generated", true)
    await f.writeAsString("/docs/library/test-crystal/generated/rom-cache.complete", entry.cacheMarker)
    for (const rel of ["data/generated/constants.lua","data/generated/maps.lua","data/generated/text.lua","assets/generated/title/pokemon_logo.png"]) {
      const p="/docs/library/test-crystal/generated/"+rel
      await f.createDirectory(p.slice(0,p.lastIndexOf("/")), true)
      if (rel.endsWith(".png")) await f.writeAsBytes(p, new Uint8Array([1]))
      else await f.writeAsString(p, "return {}")
    }
    expect(await lib.isReady(entry)).toBe(true)
  })
})
