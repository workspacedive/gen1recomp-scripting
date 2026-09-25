import { describe, it, expect } from "vitest"
import { atomicWriteBytes, atomicWriteString } from "./AtomicFile"
import type { FilesPort } from "./ports"

class MemFiles implements FilesPort {
  documentsDirectory="/docs"; temporaryDirectory="/tmp"; appGroupDocumentsDirectory="/g"; isiCloudEnabled=false
  store=new Map<string,Uint8Array>(); dirs=new Set<string>(["/docs"])
  async exists(p:string){ return this.store.has(p) || this.dirs.has(p) }
  existsSync(p:string){ return this.store.has(p) }
  async isFile(p:string){ return this.store.has(p) }
  async isDirectory(p:string){ return this.dirs.has(p) }
  async isLink(){ return false }
  async createDirectory(p:string){ this.dirs.add(p) }
  async readDirectory(p:string){ const pref=p+"/"; return [...this.store.keys()].filter(k=>k.startsWith(pref)).map(k=>k.slice(pref.length).split("/")[0]) }
  async readAsString(p:string){ const b=this.store.get(p); if(!b) throw new Error("miss"); return new TextDecoder().decode(b) }
  readAsStringSync(p:string){ return new TextDecoder().decode(this.store.get(p)!) }
  async readAsBytes(p:string){ const b=this.store.get(p); if(!b) throw new Error("miss "+p); return b }
  readAsBytesSync(p:string){ return this.store.get(p)! }
  async readAsData(){ return null as any }
  async writeAsString(p:string,s:string){ this.store.set(p,new TextEncoder().encode(s)) }
  writeAsStringSync(p:string,s:string){ this.store.set(p,new TextEncoder().encode(s)) }
  async writeAsBytes(p:string,d:Uint8Array){ this.store.set(p,d) }
  writeAsBytesSync(p:string,d:Uint8Array){ this.store.set(p,d) }
  async writeAsData(){}
  async copyFile(s:string,d:string){ const b=this.store.get(s); if(!b) throw new Error("copy miss"); this.store.set(d,b) }
  copyFileSync(s:string,d:string){ const b=this.store.get(s)!; this.store.set(d,b) }
  async remove(p:string){ this.store.delete(p) }
}

describe("AtomicFile", ()=>{
  it("atomicWriteBytes tmp→copy→verify, no .tmp left", async()=>{
    const f=new MemFiles()
    const bytes=new Uint8Array([1,2,3,4])
    const r=await atomicWriteBytes(f as any, "/docs/out.bin", bytes)
    expect(r.ok).toBe(true)
    expect(await f.exists("/docs/out.bin.tmp")).toBe(false)
    expect(await f.readAsBytes("/docs/out.bin")).toEqual(bytes)
  })
  it("atomicWriteString", async()=>{
    const f=new MemFiles()
    const r=await atomicWriteString(f as any, "/docs/a/b/c.txt", "hello")
    expect(r.ok).toBe(true)
    expect(await f.readAsString("/docs/a/b/c.txt")).toBe("hello")
  })
  it("creates parent dirs", async()=>{
    const f=new MemFiles()
    await atomicWriteBytes(f as any, "/docs/nested/deep/file.bin", new Uint8Array([9]))
    expect(await f.exists("/docs/nested/deep/file.bin")).toBe(true)
  })
  it("fails cleanly and removes tmp", async()=>{
    const f=new MemFiles()
    // Simulate copy failure by making store not have tmp
    // Force read mismatch: we can't easily, but ensure error path cleans tmp
    const origCopy = f.copyFile.bind(f)
    f.copyFile = async ()=> { throw new Error("copy fail") }
    const r=await atomicWriteBytes(f as any, "/docs/x.bin", new Uint8Array([1]))
    expect(r.ok).toBe(false)
    expect(await f.exists("/docs/x.bin.tmp")).toBe(false)
    f.copyFile = origCopy
  })
})
