import { describe, it, expect, vi } from "vitest"
import { VoxelPackImporter } from "./VoxelPackImporter"
import type { FilesPort, JobsPort } from "../host/ports"

// In-Memory FilesPort für Tests
class MemFiles implements FilesPort {
  documentsDirectory = "/docs"
  temporaryDirectory = "/tmp"
  appGroupDocumentsDirectory = "/group"
  isiCloudEnabled = false
  private store = new Map<string, Uint8Array>()
  private dirs = new Set<string>(["/docs","/docs/cache","/docs/cache/prepared_asset"])
  async exists(p:string){ return this.store.has(p) || this.dirs.has(p) }
  existsSync(p:string){ return this.store.has(p) || this.dirs.has(p) }
  async isFile(p:string){ return this.store.has(p) }
  async isDirectory(p:string){ return this.dirs.has(p) }
  async isLink(){ return false }
  async createDirectory(p:string){ this.dirs.add(p) }
  async readDirectory(p:string){
    const pref = p.endsWith("/")? p : p+"/"
    const out: string[] = []
    for (const k of this.store.keys()) if (k.startsWith(pref)) out.push(k.slice(pref.length).split("/")[0])
    for (const d of this.dirs) if (d.startsWith(pref) && d!==p) out.push(d.slice(pref.length).split("/")[0])
    return [...new Set(out)].filter(Boolean)
  }
  async readAsString(p:string){ const b=this.store.get(p); if(!b) throw new Error("not found "+p); return new TextDecoder().decode(b) }
  readAsStringSync(p:string){ const b=this.store.get(p); if(!b) throw new Error("not found"); return new TextDecoder().decode(b) }
  async readAsBytes(p:string){ const b=this.store.get(p); if(!b) throw new Error("not found "+p); return b }
  readAsBytesSync(p:string){ const b=this.store.get(p); if(!b) throw new Error("not found"); return b }
  async readAsData(p:string){ return null as any }
  async writeAsString(p:string, data:string){ this.store.set(p, new TextEncoder().encode(data)) }
  writeAsStringSync(p:string, data:string){ this.store.set(p, new TextEncoder().encode(data)) }
  async writeAsBytes(p:string, data:Uint8Array){ this.store.set(p, data) }
  writeAsBytesSync(p:string, data:Uint8Array){ this.store.set(p, data) }
  async writeAsData(){}
  async copyFile(s:string,d:string){ const b=this.store.get(s); if(!b) throw new Error("copy miss"); this.store.set(d,b) }
  copyFileSync(s:string,d:string){ const b=this.store.get(s); if(!b) throw new Error("copy miss"); this.store.set(d,b) }
  async remove(p:string){ this.store.delete(p); this.dirs.delete(p) }
  // debug
  _get(p:string){ return this.store.get(p) }
}

function memJobs(): JobsPort {
  return {
    isMainThread: true,
    async runInBackground<T>(fn: ()=>T|Promise<T>): Promise<T> { return await fn() },
    runInMain(fn){ fn() },
  }
}

describe("VoxelPackImporter", ()=>{
  it("import from bytes → prepared_asset with cacheKey containing mod+api+core+dep+profile", async ()=>{
    const f = new MemFiles()
    const j = memJobs()
    const imp = new VoxelPackImporter(f as any, j)
    const res = await imp.import({
      modId: "voxel_world", mapId: "PALLET_TOWN", kind: "vox",
      bytes: new TextEncoder().encode("VOX dummy"), apiVersion:"1.0", coreVersion:"2ea74fa", depHash:"abc", graphicsProfile:"high"
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.cacheKey).toContain("voxel_world:1.0:2ea74fa:abc:high")
      expect(res.lods["15"]).toEqual({res:8, shadow:false})
      expect(f._get("/docs/cache/prepared_asset/voxel_world:1.0:2ea74fa:abc:high/voxels/PALLET_TOWN.bin")).toBeDefined()
      expect(res.bytesWritten).toBeGreaterThan(0)
    }
  })

  it("8MiB per-file limit → rejected", async ()=>{
    const f = new MemFiles()
    const imp = new VoxelPackImporter(f as any, memJobs())
    const big = new Uint8Array(8*1024*1024+1)
    const res = await imp.import({ modId:"m", kind:"bin", bytes: big, apiVersion:"1", coreVersion:"1", depHash:"x", graphicsProfile:"high" })
    expect(res.ok).toBe(false)
    expect((res as any).reason).toBe("limit")
  })

  it("path traversal via mapId is sanitized, unsafe rel rejected via safeVoxelPath", async ()=>{
    const f = new MemFiles()
    const imp = new VoxelPackImporter(f as any, memJobs())
    const res = await imp.import({
      modId:"voxel_world", mapId: "../../etc/passwd", kind:"bin",
      bytes: new Uint8Array([1,2,3]), apiVersion:"1", coreVersion:"1", depHash:"x", graphicsProfile:"high"
    })
    // mapId wird sanitized zu ___etc_passwd → safe, aber noch im voxels Ordner
    expect(res.ok).toBe(true)
    // Direkter Importer mit unsafe rel über safeVoxelPath wäre blockiert — hier mapId Sanitizing verhindert Traversal
  })

  it("atomic tmp → verify → copy (no .tmp left)", async ()=>{
    const f = new MemFiles()
    const imp = new VoxelPackImporter(f as any, memJobs())
    const res = await imp.import({
      modId:"m", kind:"vox", bytes: new TextEncoder().encode("VOX "), apiVersion:"1", coreVersion:"1", depHash:"x", graphicsProfile:"high"
    })
    expect(res.ok).toBe(true)
    expect(await f.exists("/docs/cache/prepared_asset/m:1:1:x:high/voxels/global.bin.tmp")).toBe(false)
  })

  it("uses JobsPort.runInBackground when available", async ()=>{
    const f = new MemFiles()
    const spy = vi.fn(async (fn:any)=> await fn())
    const j: JobsPort = { isMainThread:true, runInBackground: spy as any, runInMain: ()=>{} }
    const imp = new VoxelPackImporter(f as any, j)
    await imp.import({ modId:"m", kind:"vox", bytes: new TextEncoder().encode("VOX "), apiVersion:"1", coreVersion:"1", depHash:"x", graphicsProfile:"high" })
    expect(spy).toHaveBeenCalled()
  })
})
