import { describe, it, expect } from "vitest"
import { SaveManager } from "./SaveManager"

class MemFiles {
  documentsDirectory="/docs"; temporaryDirectory="/tmp"; appGroupDocumentsDirectory="/g"; isiCloudEnabled=false
  store=new Map<string,Uint8Array>(); dirs=new Set<string>(["/docs"])
  async exists(p:string){ return this.store.has(p) || this.dirs.has(p) }
  existsSync(p:string){ return this.store.has(p) }
  async isFile(p:string){ return this.store.has(p) }
  async isDirectory(p:string){ return this.dirs.has(p) }
  async isLink(){ return false }
  async createDirectory(p:string){ this.dirs.add(p); // also ensure parents
    const parts=p.split("/"); let cur=""; for (const part of parts){ if(!part) continue; cur+= "/"+part; this.dirs.add(cur)} }
  async readDirectory(p:string){ const pref=p.endsWith("/")?p:p+"/"; const out=new Set<string>(); for (const k of this.store.keys()) if(k.startsWith(pref)) out.add(k.slice(pref.length).split("/")[0]); for(const d of this.dirs) if(d.startsWith(pref) && d!==p) out.add(d.slice(pref.length).split("/")[0]); return [...out].filter(Boolean)}
  async readAsString(p:string){ const b=this.store.get(p); if(!b) throw new Error("not found "+p); return new TextDecoder().decode(b)}
  readAsStringSync(p:string){ return new TextDecoder().decode(this.store.get(p)!)}
  async readAsBytes(p:string){ const b=this.store.get(p); if(!b) throw new Error("not found"); return b}
  readAsBytesSync(p:string){ return this.store.get(p)!}
  async readAsData(){ return null as any}
  async writeAsString(p:string,s:string){ this.store.set(p,new TextEncoder().encode(s)); this.dirs.add(p.slice(0,p.lastIndexOf("/")))}
  writeAsStringSync(p:string,s:string){ this.store.set(p,new TextEncoder().encode(s))}
  async writeAsBytes(p:string,d:Uint8Array){ this.store.set(p,d); this.dirs.add(p.slice(0,p.lastIndexOf("/")))}
  writeAsBytesSync(p:string,d:Uint8Array){ this.store.set(p,d)}
  async writeAsData(){}
  async copyFile(s:string,d:string){ const b=this.store.get(s); if(!b) throw new Error("copy miss"); this.store.set(d,b); this.dirs.add(d.slice(0,d.lastIndexOf("/")))}
  copyFileSync(s:string,d:string){ const b=this.store.get(s)!; this.store.set(d,b)}
  async remove(p:string){ this.store.delete(p); // also delete children
    for(const k of [...this.store.keys()]) if(k===p || k.startsWith(p+"/")) this.store.delete(k); for(const d of [...this.dirs]) if(d===p || d.startsWith(p+"/")) this.dirs.delete(d)}
  bookmarkedPath(){ return null}
}
function memStore(){
  const m=new Map<string,any>()
  return { get:(k:string)=> m.get(k)??null, set:(k:string,v:any)=>{m.set(k,v); return true}, getData:()=>null, setData:()=>{}, remove:(k:string)=>m.delete(k), contains:(k:string)=>m.has(k), keys:()=>[...m.keys()], clear:()=>m.clear(), _m:m } as any
}

describe("SaveManager — Atomic, Backup, Migration, Integrity (§18)", ()=>{
  it("save + load roundtrip with integrity", async()=>{
    const f=new MemFiles() as any, s=memStore()
    const mgr=new SaveManager(f,s)
    const r=await mgr.save("red","normal","slot1", { party:[1,2,3] }, { schemaVersion:1, coreVersion:"1.0"})
    expect(r.ok).toBe(true)
    const l=await mgr.load("red","normal","slot1")
    expect(l.ok).toBe(true)
    if (l.ok) expect(l.envelope.data.party).toEqual([1,2,3])
  })

  it("backup lastN=5 retained, older evicted", async()=>{
    const f=new MemFiles() as any, s=memStore()
    const mgr=new SaveManager(f,s)
    for(let i=0;i<7;i++){
      await mgr.save("red","normal","slot1", {v:i}, { schemaVersion:1, coreVersion:"1.0"})
      // ensure timestamp distinct
      await new Promise(r=> setTimeout(r, 2))
    }
    const backs=await mgr.listBackups("red","normal","slot1")
    expect(backs.length).toBe(5)
  })

  it("migration: from 1→3 via registered migrations, creates backup first", async()=>{
    const f=new MemFiles() as any, s=memStore()
    const mgr=new SaveManager(f,s)
    mgr.registerMigration("red","normal",{ from:1,to:2, migrate:(d:any)=> ({...d, migrated1:true})})
    mgr.registerMigration("red","normal",{ from:2,to:3, migrate:(d:any)=> ({...d, migrated2:true})})
    await mgr.save("red","normal","slot1", {v:1}, { schemaVersion:1, coreVersion:"1.0"})
    const l=await mgr.load("red","normal","slot1")
    expect(l.ok).toBe(true)
    if(l.ok){
      expect(l.envelope.header.schemaVersion).toBe(3)
      expect(l.envelope.data.migrated1).toBe(true)
      expect(l.envelope.data.migrated2).toBe(true)
    }
    const backs=await mgr.listBackups("red","normal","slot1")
    expect(backs.length).toBeGreaterThanOrEqual(1)
  })

  it("migration validate fail → rollback from backup, recovered flag", async()=>{
    const f=new MemFiles() as any, s=memStore()
    const mgr=new SaveManager(f,s)
    mgr.registerMigration("red","normal",{ from:1,to:2, migrate:(d:any)=> ({...d, bad:true}), validate: ()=> false })
    await mgr.save("red","normal","slot1", {v:1}, { schemaVersion:1, coreVersion:"1.0"})
    const rawBefore=await f.readAsString("/docs/saves/red/normal/slot1.json")
    const l=await mgr.load("red","normal","slot1")
    expect(l.ok).toBe(false)
    expect((l as any).recovered).toBe(true)
    // After rollback, file should be restored to original (rawBefore)
    const rawAfter=await f.readAsString("/docs/saves/red/normal/slot1.json")
    expect(rawAfter).toBe(rawBefore)
    // Journal should mark rollback
    expect(s._m.get("save:journal:red:normal:slot1")?.status).toBe("rollback")
  })

  it("integrity mismatch → load fails", async()=>{
    const f=new MemFiles() as any, s=memStore()
    const mgr=new SaveManager(f,s)
    await mgr.save("red","normal","slot1", {v:1}, { schemaVersion:1, coreVersion:"1.0"})
    // corrupt file: flip byte
    const p="/docs/saves/red/normal/slot1.json"
    const raw=await f.readAsString(p)
    const env=JSON.parse(raw); env.data.v=999 // tamper without updating hash
    await f.writeAsString(p, JSON.stringify(env))
    const l=await mgr.load("red","normal","slot1")
    expect(l.ok).toBe(false)
    expect((l as any).error).toContain("integrity")
  })

  it("limits: too large / too deep → save fails", async()=>{
    const f=new MemFiles() as any, s=memStore()
    const mgr=new SaveManager(f,s)
    const big={ s: "x".repeat(2*1024*1024+1) }
    const r=await mgr.save("red","normal","slot1", big, { schemaVersion:1, coreVersion:"1.0"})
    expect(r.ok).toBe(false)
    // deep
    let deep:any={}; let cur=deep; for(let i=0;i<50;i++){ cur.n={}; cur=cur.n }
    const r2=await mgr.save("red","normal","slot1", deep, { schemaVersion:1, coreVersion:"1.0"})
    expect(r2.ok).toBe(false)
  })

  it("restoreBackup picks latest if no path given", async()=>{
    const f=new MemFiles() as any, s=memStore()
    const mgr=new SaveManager(f,s)
    await mgr.save("red","normal","slot1", {v:1}, { schemaVersion:1, coreVersion:"1.0"})
    await new Promise(r=> setTimeout(r,2))
    await mgr.save("red","normal","slot1", {v:2}, { schemaVersion:1, coreVersion:"1.0"})
    await new Promise(r=> setTimeout(r,2))
    await mgr.save("red","normal","slot1", {v:3}, { schemaVersion:1, coreVersion:"1.0"})
    // corrupt current
    await f.writeAsString("/docs/saves/red/normal/slot1.json", JSON.stringify({header:{schemaVersion:1, gameId:"red", coreVersion:"1.0", kind:"normal", slot:"slot1", hash:""}, data:{v:999}}))
    const rr=await mgr.restoreBackup("red","normal","slot1")
    expect(rr.ok).toBe(true)
    const l=await mgr.load("red","normal","slot1")
    expect(l.ok).toBe(true)
  })
})
