import { describe, it, expect } from "vitest"
import { BackupManager } from "./BackupManager"

class MemFiles {
  documentsDirectory="/docs"; temporaryDirectory="/tmp"; appGroupDocumentsDirectory="/g"; isiCloudEnabled=false
  store=new Map<string,Uint8Array>(); dirs=new Set<string>(["/docs"])
  async exists(p:string){ return this.store.has(p) || this.dirs.has(p) }
  existsSync(p:string){ return this.store.has(p) }
  async isFile(p:string){ return this.store.has(p) }
  async isDirectory(p:string){ return this.dirs.has(p) }
  async isLink(){ return false }
  async createDirectory(p:string){ this.dirs.add(p); const parts=p.split("/"); let cur=""; for(const part of parts){ if(!part) continue; cur+="/"+part; this.dirs.add(cur)}}
  async readDirectory(p:string){ const pref=p+"/"; const out=new Set<string>(); for(const k of this.store.keys()) if(k.startsWith(pref)) out.add(k.slice(pref.length).split("/")[0]); return [...out].filter(Boolean)}
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
  return { get:(k:string)=>m.get(k)??null, set:(k:string,v:any)=>{m.set(k,v); return true}, getData:()=>null, setData:()=>{}, remove:(k:string)=>m.delete(k), contains:(k:string)=>m.has(k), keys:()=>[...m.keys()], clear:()=>m.clear(), _m:m} as any
}

describe("BackupManager §60", ()=>{
  it("export + list + restore roundtrip", async()=>{
    const f=new MemFiles() as any, s=memStore()
    const bm=new BackupManager(f,s)
    const rec=await bm.exportBackup("save","slot1", {party:[1]}, {gameId:"red"})
    expect(rec.kind).toBe("save")
    const list=await bm.list("save","slot1")
    expect(list.length).toBe(1)
    const r=await bm.restore(rec.id)
    expect(r.ok).toBe(true)
    if(r.ok) expect((r.data as any).party).toEqual([1])
  })
  it("retention keep 5, older evicted", async()=>{
    const f=new MemFiles() as any, s=memStore()
    const bm=new BackupManager(f,s)
    for(let i=0;i<7;i++){ await bm.exportBackup("save","slot1", {v:i}); await new Promise(r=> setTimeout(r,2)) }
    const list=await bm.list("save","slot1")
    expect(list.length).toBe(5)
  })
  it("stale index cleanup when file missing", async()=>{
    const f=new MemFiles() as any, s=memStore()
    const bm=new BackupManager(f,s)
    const rec=await bm.exportBackup("profile","default", {a:1})
    await f.remove(rec.path)
    const list=await bm.list("profile")
    expect(list.length).toBe(0)
    expect(s._m.get("backups:index").length).toBe(0)
  })
})
