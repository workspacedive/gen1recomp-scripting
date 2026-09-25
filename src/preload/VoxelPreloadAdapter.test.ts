import { describe, it, expect } from "vitest"
import { PipelineAdapter } from "../render/PipelineAdapter"
import { VoxelPreloadAdapter } from "./VoxelPreloadAdapter"
import { VoxelPackImporter } from "../import/VoxelPackImporter"
import type { Host } from "../host/ports"

function makeHost(): Host {
  return {
    storage:{} as any, files:{} as any, network:{} as any,
    graphics:{ supportsWebGL:false as const, supportsWebGPU:false as const, createCanvas:()=>({getWidth:()=>1,getHeight:()=>1}), pushAll:()=>{}, popAll:()=>{}, setTilt:()=>{}},
    audio:{} as any, input:{} as any, lifecycle:{} as any, memory:{} as any, jobs:{ isMainThread:true, runInBackground: async (fn:any)=> await fn(), runInMain:()=>{}} as any,
    timing:{} as any, haptics:{} as any, permissions:{} as any,
  }
}
class MemFiles {
  documentsDirectory="/docs"; temporaryDirectory="/tmp"; appGroupDocumentsDirectory="/g"; isiCloudEnabled=false
  store=new Map<string,Uint8Array>(); dirs=new Set<string>(["/docs"])
  async exists(p:string){ return this.store.has(p) || this.dirs.has(p) }
  existsSync(p:string){ return this.store.has(p) }
  async isFile(p:string){ return this.store.has(p) }
  async isDirectory(p:string){ return this.dirs.has(p) }
  async isLink(){ return false }
  async createDirectory(p:string){ this.dirs.add(p) }
  async readDirectory(p:string){ const pref=p+"/"; return [...this.store.keys()].filter(k=>k.startsWith(pref)).map(k=>k.slice(pref.length).split("/")[0]) }
  async readAsString() { return "" }
  readAsStringSync(){ return "" }
  async readAsBytes(p:string){ const b=this.store.get(p); if(!b) throw new Error("miss"); return b }
  readAsBytesSync(p:string){ return this.store.get(p)! }
  async readAsData(){ return null as any }
  async writeAsString(p:string,s:string){ this.store.set(p,new TextEncoder().encode(s)) }
  writeAsStringSync(p:string,s:string){ this.store.set(p,new TextEncoder().encode(s)) }
  async writeAsBytes(p:string,d:Uint8Array){ this.store.set(p,d) }
  writeAsBytesSync(p:string,d:Uint8Array){ this.store.set(p,d) }
  async writeAsData(){}
  async copyFile(s:string,d:string){ const b=this.store.get(s); if(!b) throw new Error("copy"); this.store.set(d,b) }
  copyFileSync(s:string,d:string){ const b=this.store.get(s)!; this.store.set(d,b) }
  async remove(p:string){ this.store.delete(p) }
}

describe("VoxelPreloadAdapter", ()=>{
  it("computeTargets: OFF → leer, sonst Top-N nach prob/dist", ()=>{
    const h=makeHost()
    const pa=new PipelineAdapter(h)
    pa.install({ render_pipelines:{ voxel:{ levels:["OFF","15","35","50"], priority:20, available:()=>true, drawWorld:()=>({getWidth:()=>1,getHeight:()=>1}) }}})
    const f=new MemFiles() as any
    const imp=new VoxelPackImporter(f, { isMainThread:true, runInBackground: async (fn:any)=>await fn(), runInMain:()=>{}} as any)
    const adapter=new VoxelPreloadAdapter(pa, imp)
    pa.setLevel("voxel",0)
    expect(adapter.computeTargets("PALLET_TOWN", { PALLET_TOWN:[{to:"ROUTE_1", prob:0.9, dist:1}]})).toEqual([])
    pa.setLevel("voxel",2) // 35 → res 16
    const t=adapter.computeTargets("PALLET_TOWN", {
      PALLET_TOWN:[{to:"ROUTE_1", prob:0.9, dist:1},{to:"HOUSE", prob:0.2, dist:1},{to:"CAVE", prob:0.05, dist:2}],
    }, 2)
    expect(t.length).toBe(2)
    expect(t[0].mapId).toBe("ROUTE_1") // höchste score
    expect(t[0].priority).toBe(80)
    expect(t[0].lods.res).toBe(16)
  })

  it("preload respects ram budget + maxConcurrent", async()=>{
    const h=makeHost()
    const pa=new PipelineAdapter(h)
    pa.install({ render_pipelines:{ voxel:{ levels:["OFF","15","35","50"], priority:20, available:()=>true, drawWorld:()=>({getWidth:()=>1,getHeight:()=>1}) }}})
    pa.setLevel("voxel",1) // res 8 → ~64KiB est
    const f=new MemFiles() as any
    const imp=new VoxelPackImporter(f, { isMainThread:true, runInBackground: async (fn:any)=>await fn(), runInMain:()=>{}} as any)
    const adapter=new VoxelPreloadAdapter(pa, imp, { ramBytes: 100*1024, maxConcurrent: 1 })
    const targets=[
      { mapId:"A", prob:0.9, priority:80, lods:{res:8, shadow:false}},
      { mapId:"B", prob:0.5, priority:40, lods:{res:8, shadow:false}},
    ]
    const r=await adapter.preload(targets, { apiVersion:"1", coreVersion:"1", depHash:"x", graphicsProfile:"high", modId:"voxel_world" })
    expect(r.loaded.length).toBe(1)
    expect(r.skipped).toContain("B")
  })

  it("abort via signal", async()=>{
    const h=makeHost()
    const pa=new PipelineAdapter(h)
    pa.install({ render_pipelines:{ voxel:{ levels:["OFF","15","35","50"], priority:20, available:()=>true, drawWorld:()=>({getWidth:()=>1,getHeight:()=>1}) }}})
    pa.setLevel("voxel",1)
    const f=new MemFiles() as any
    const imp=new VoxelPackImporter(f, { isMainThread:true, runInBackground: async (fn:any)=>await fn(), runInMain:()=>{}} as any)
    const adapter=new VoxelPreloadAdapter(pa, imp)
    const ac=new AbortController(); ac.abort()
    const r=await adapter.preload([{ mapId:"A", prob:1, priority:80, lods:{res:8, shadow:false}}], { apiVersion:"1", coreVersion:"1", depHash:"x", graphicsProfile:"high", modId:"m", signal: ac.signal })
    expect(r.aborted).toBe(true)
  })
})
