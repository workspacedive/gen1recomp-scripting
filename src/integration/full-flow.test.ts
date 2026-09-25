import { describe, it, expect } from "vitest"
import { GameLibrary } from "../library/GameLibrary"
import { SaveManager } from "../save/SaveManager"
import { PipelineAdapter } from "../render/PipelineAdapter"
import { PipelineTelemetry } from "../telemetry/PipelineTelemetry"
import { ResourceGovernor } from "../perf/ResourceGovernor"
import { VoxelPackImporter } from "../import/VoxelPackImporter"
import { VoxelPreloadAdapter } from "../preload/VoxelPreloadAdapter"
import { BackupManager } from "../backup/BackupManager"
import { JobScheduler } from "../jobs/JobScheduler"

// In-Memory Files + Storage für Integration (wie in anderen Tests)
class MemFiles {
  documentsDirectory="/docs"; temporaryDirectory="/tmp"; appGroupDocumentsDirectory="/g"; isiCloudEnabled=false
  store=new Map<string,Uint8Array>(); dirs=new Set<string>(["/docs"])
  async exists(p:string){ return this.store.has(p) || this.dirs.has(p) }
  existsSync(p:string){ return this.store.has(p) }
  async isFile(p:string){ return this.store.has(p) }
  async isDirectory(p:string){ return this.dirs.has(p) }
  async isLink(){ return false }
  async createDirectory(p:string){ const parts=p.split("/"); let cur=""; for(const part of parts){ if(!part) continue; cur+="/"+part; this.dirs.add(cur)} }
  async readDirectory(p:string){ const pref=p+"/"; const out=new Set<string>(); for(const k of this.store.keys()) if(k.startsWith(pref)) out.add(k.slice(pref.length).split("/")[0]); for(const d of this.dirs) if(d.startsWith(pref) && d!==p) out.add(d.slice(pref.length).split("/")[0]); return [...out].filter(Boolean)}
  async readAsString(p:string){ const b=this.store.get(p); if(!b) throw new Error("miss "+p); return new TextDecoder().decode(b)}
  readAsStringSync(p:string){ return new TextDecoder().decode(this.store.get(p)!)}
  async readAsBytes(p:string){ const b=this.store.get(p); if(!b) throw new Error("miss"); return b}
  readAsBytesSync(p:string){ return this.store.get(p)!}
  async readAsData(){ return null as any}
  async writeAsString(p:string,s:string){ this.store.set(p,new TextEncoder().encode(s)); this.dirs.add(p.slice(0,p.lastIndexOf("/")))}
  writeAsStringSync(p:string,s:string){ this.store.set(p,new TextEncoder().encode(s))}
  async writeAsBytes(p:string,d:Uint8Array){ this.store.set(p,d); this.dirs.add(p.slice(0,p.lastIndexOf("/")))}
  writeAsBytesSync(p:string,d:Uint8Array){ this.store.set(p,d)}
  async writeAsData(){}
  async copyFile(s:string,d:string){ const b=this.store.get(s); if(!b) throw new Error("copy miss "+s); this.store.set(d,b); this.dirs.add(d.slice(0,d.lastIndexOf("/")))}
  copyFileSync(s:string,d:string){ const b=this.store.get(s)!; this.store.set(d,b)}
  async remove(p:string){ for(const k of [...this.store.keys()]) if(k===p||k.startsWith(p+"/")) this.store.delete(k); for(const d of [...this.dirs]) if(d===p||d.startsWith(p+"/")) this.dirs.delete(d)}
  bookmarkedPath(){ return null}
}
function memStore(){
  const m=new Map<string,any>()
  return { get:(k:string)=> m.get(k)??null, set:(k:string,v:any)=>{m.set(k,v); return true}, getData:()=>null, setData:()=>{}, remove:(k:string)=>m.delete(k), contains:(k:string)=>m.has(k), keys:()=>[...m.keys()], clear:()=>m.clear(), _m:m } as any
}
function memHost(files: MemFiles, store:any){
  return {
    storage: store, files,
    network:{} as any,
    graphics:{ supportsWebGL:false as const, supportsWebGPU:false as const, createCanvas:()=>({getWidth:()=>160,getHeight:()=>144}), pushAll:()=>{}, popAll:()=>{}, setTilt:()=>{}},
    audio:{} as any, input:{} as any, lifecycle:{} as any, memory:{} as any,
    jobs:{ isMainThread:true, runInBackground: async (fn:any)=> await fn(), runInMain:()=>{}} as any,
    timing:{ now:(()=>{let t=0; return ()=> (t+=2)})(), requestAnimationFrame:(cb:any)=> cb(0), cancelAnimationFrame:()=>{}} as any,
    haptics:{} as any, permissions:{} as any,
  } as any
}

describe("Integration: Library → Save → Pipeline → Preload → Governor → Backup (P0 Abnahme)", ()=>{
  it("Library import → Save → PipelineTelemetry → Governor → Backup roundtrip", async()=>{
    const files=new MemFiles()
    const store=memStore()
    const host=memHost(files, store)

    // 1. Library: isReady für crystal via manual marker (simuliert Import)
    const lib=new GameLibrary(files as any, store)
    // Nutze bekannten Crystal Hash, erzeuge entry direkt (importBytes braucht echten SHA, hier manuell)
    const entry:any={
      id:"crystal-1", gameId:"crystal", region:"US", language:"en",
      contentHash:"f4cd194bdee0d04ca4eac29e09b8e4e9d818c133", contentSize:2*1024*1024,
      format:"gbc", importDate:Date.now(), lastPlayed:null,
      generatedPrefix:"library/crystal-1/generated/", cacheMarker:"rom-cache-v12-crystal4:f4cd194bdee0d04ca4eac29e09b8e4e9d818c133",
      isReady:false,
    }
    store.set("library:index", [entry])
    await files.createDirectory("/docs/library/crystal-1/generated/data/generated", true)
    await files.writeAsString("/docs/library/crystal-1/generated/rom-cache.complete", entry.cacheMarker)
    for (const rel of ["data/generated/constants.lua","data/generated/maps.lua","data/generated/text.lua","assets/generated/title/pokemon_logo.png"]) {
      const p="/docs/library/crystal-1/generated/"+rel
      await files.createDirectory(p.slice(0,p.lastIndexOf("/")), true)
      if (rel.endsWith(".png")) await files.writeAsBytes(p, new Uint8Array([1]))
      else await files.writeAsString(p, "return {}")
    }
    expect(await lib.isReady(entry)).toBe(true)

    // 2. SaveManager: save + migration + backup
    const saves=new SaveManager(files as any, store)
    saves.registerMigration("crystal","normal",{ from:1,to:2, migrate:(d:any)=> ({...d, migrated:true})})
    const sr=await saves.save("crystal","normal","slot1", { party:[25] }, { schemaVersion:1, coreVersion:"1.0"})
    expect(sr.ok).toBe(true)
    const lr=await saves.load("crystal","normal","slot1")
    expect(lr.ok).toBe(true)
    if (lr.ok) expect(lr.envelope.data.migrated).toBe(true) // migration 1→2 lief

    // 3. Pipeline + Telemetry + Governor (Voxel LOD)
    const tel=new PipelineTelemetry(host.timing, store)
    const pa=new PipelineAdapter(host, { telemetry: tel })
    pa.install({ render_pipelines:{
      voxel:{ label:"VOXEL", levels:["OFF","15","35","50"], priority:20, available:()=>true, drawWorld:(ctx:any)=> ({getWidth:()=>160,getHeight:()=>144}), worldPresent:(c:any)=>c },
      tilt:{ label:"TILT", levels:["OFF","ON"], priority:5, available:()=>true, drawWorld:()=>({getWidth:()=>160,getHeight:()=>144})},
    }})
    pa.setLevel("voxel",3) // 50
    expect(pa.worldPipeline()).toBe("voxel")
    // drawWorld misst via telemetry
    const canvas=pa.drawWorld("voxel", { state:{actors:[]}, cam:{x:0,y:0}, vw:160,vh:144, width:320,height:288, scale:2, level:3, paletteFor:()=>({}), spriteColors:()=>({}), drawFx:()=>{}, canvas:{getWidth:()=>160,getHeight:()=>144}} as any)
    expect(canvas).not.toBe(null)
    expect(tel.stats("voxel","drawWorld").count).toBe(1)

    const gov=new ResourceGovernor(pa, tel, undefined, { voxelBudgetMs: 1, enableTelemetryDowngrade:true })
    // Telemetry p95 wird 2ms (timing 2ms) >1ms → downgrade 50→35
    // fülle mehr samples
    for(let i=0;i<15;i++) tel.measure("voxel","drawWorld",3,true, ()=>{})
    const downg=gov.tickVoxelLOD()
    expect(downg?.downgraded).toBe(true)
    expect(pa.level("voxel")).toBe(2) // 35

    // memory critical → OFF
    gov.setPressure("critical")
    expect(gov.tickVoxelLOD()?.to).toBe(0)
    expect(pa.worldPipeline()).toBe(null) // voxel OFF → kein worldPipeline
    // Tilt exklusiv: jetzt tilt kann aktiv
    pa.setLevel("tilt",1)
    expect(pa.worldPipeline()).toBe("tilt")

    // 4. Voxel Preload (Budget)
    const importer=new VoxelPackImporter(files as any, host.jobs)
    const preload=new VoxelPreloadAdapter(pa, importer, { ramBytes: 1024*1024, maxConcurrent: 2 })
    // voxel OFF → computeTargets leer
    expect(preload.computeTargets("PALLET_TOWN", { PALLET_TOWN:[{to:"ROUTE_1", prob:0.9, dist:1}]}) ).toEqual([])
    pa.setLevel("voxel",2) // 35 wieder an (tilt wird dabei cleared)
    expect(pa.worldPipeline()).toBe("voxel")
    const targets=preload.computeTargets("PALLET_TOWN", { PALLET_TOWN:[{to:"ROUTE_1", prob:0.9, dist:1},{to:"HOUSE", prob:0.2, dist:1}]}, 2)
    expect(targets.length).toBe(2)
    const pr=await preload.preload(targets, { apiVersion:"1.0", coreVersion:"1.0", depHash:"x", graphicsProfile:"high", modId:"voxel_world"})
    expect(pr.loaded.length).toBeGreaterThan(0)

    // 5. JobScheduler + BackupManager (Governor cancel) — concurrency 1 damit voxel queued bleibt
    const jobs=new JobScheduler({ concurrency:1 })
    const backups=new BackupManager(files as any, store)
    const rec=await backups.exportBackup("save","slot1", { party:[25] }, { gameId:"crystal"})
    expect(rec.kind).toBe("save")
    // Enqueue voxel jobs, then governor cancel ≤30 bei critical
    const blocker=jobs.enqueue(()=> new Promise(r=> setTimeout(()=> r("block"),30)), { priority:100 })
    const vJob=jobs.enqueue(async()=> "voxel", { priority: JobScheduler.VOXEL_DECODE_PRIORITY })
    const n=jobs.cancelByPriority(30)
    expect(n).toBe(1)
    await blocker
    const vr=await vJob
    expect(vr.ok).toBe(false)

    // 6. Diagnostics
    const { DiagnosticsBundle } = await import("../diagnostics/DiagnosticsBundle")
    const diag=new DiagnosticsBundle(store)
    const secs=diag.collect()
    expect(secs.map(s=>s.name)).toEqual(expect.arrayContaining(["game","core","save","render","backup"]))
  })
})
