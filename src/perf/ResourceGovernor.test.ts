import { describe, it, expect } from "vitest"
import { PipelineAdapter } from "../render/PipelineAdapter"
import { PipelineTelemetry } from "../telemetry/PipelineTelemetry"
import { ResourceGovernor } from "./ResourceGovernor"
import type { Host } from "../host/ports"

function makeHost(): Host {
  return {
    storage: {} as any, files: {} as any, network: {} as any,
    graphics: { supportsWebGL: false as const, supportsWebGPU: false as const, createCanvas: ()=>({getWidth:()=>1,getHeight:()=>1}), pushAll:()=>{}, popAll:()=>{}, setTilt:()=>{} },
    audio:{} as any, input:{} as any, lifecycle:{} as any, memory:{} as any, jobs:{} as any, timing:{ now: ()=> performance.now(), requestAnimationFrame:(cb:any)=>cb(0), cancelAnimationFrame:()=>{}} as any, haptics:{} as any, permissions:{} as any,
  }
}
function timingWithMs(ms:number){
  let v=0; return { now: ()=> (v+=ms), requestAnimationFrame:(cb:any)=>cb(0), cancelAnimationFrame:()=>{} } as any
}
describe("ResourceGovernor", ()=>{
  it("critical → LOD OFF immediately", ()=>{
    const h=makeHost()
    const tel=new PipelineTelemetry(timingWithMs(2))
    const pa=new PipelineAdapter(h)
    pa.install({ render_pipelines:{ voxel:{ levels:["OFF","15","35","50"], priority:20, available:()=>true, drawWorld:()=>({getWidth:()=>1,getHeight:()=>1}) }}})
    pa.setLevel("voxel",3)
    const gov=new ResourceGovernor(pa, tel, undefined, { voxelBudgetMs:8, enableTelemetryDowngrade:true })
    gov.setPressure("critical")
    const r=gov.tickVoxelLOD()
    expect(r?.downgraded).toBe(true)
    expect(r?.to).toBe(0)
    expect(pa.level("voxel")).toBe(0)
  })
  it("warning → step down 50→35→15→OFF", ()=>{
    const h=makeHost()
    const tel=new PipelineTelemetry(timingWithMs(2))
    const pa=new PipelineAdapter(h)
    pa.install({ render_pipelines:{ voxel:{ levels:["OFF","15","35","50"], priority:20, available:()=>true, drawWorld:()=>({getWidth:()=>1,getHeight:()=>1}) }}})
    pa.setLevel("voxel",3)
    const gov=new ResourceGovernor(pa, tel, undefined, { voxelBudgetMs:8, enableTelemetryDowngrade:false })
    gov.setPressure("warning")
    expect(gov.tickVoxelLOD()?.to).toBe(2)
    expect(gov.tickVoxelLOD()?.to).toBe(1)
    expect(gov.tickVoxelLOD()?.to).toBe(0)
    expect(gov.tickVoxelLOD()).toBe(null)
  })
  it("telemetry p95 > budget → downgrade even when pressure normal", ()=>{
    const h=makeHost()
    const tel=new PipelineTelemetry({ now: (()=>{let v=0; return ()=> (v+=15)})(), requestAnimationFrame:(cb:any)=>cb(0), cancelAnimationFrame:()=>{}} as any)
    const pa=new PipelineAdapter(h)
    pa.install({ render_pipelines:{ voxel:{ levels:["OFF","15","35","50"], priority:20, available:()=>true, drawWorld:()=>({getWidth:()=>1,getHeight:()=>1}) }}})
    pa.setLevel("voxel",3)
    // fülle telemetry mit 15ms samples
    for(let i=0;i<15;i++) tel.measure("voxel","drawWorld",3,true, ()=>{})
    const gov=new ResourceGovernor(pa, tel, undefined, { voxelBudgetMs:8, enableTelemetryDowngrade:true })
    gov.setPressure("normal")
    const r=gov.tickVoxelLOD()
    expect(r?.downgraded).toBe(true)
    expect(r?.reason).toContain("telemetry")
  })
  it("no worldPipeline → null", ()=>{
    const h=makeHost()
    const tel=new PipelineTelemetry(timingWithMs(2))
    const pa=new PipelineAdapter(h)
    pa.install({ render_pipelines:{ voxel:{ levels:["OFF","ON"], priority:20, available:()=>true, drawWorld:()=>({getWidth:()=>1,getHeight:()=>1}) }}})
    pa.setLevel("voxel",0)
    const gov=new ResourceGovernor(pa, tel)
    expect(gov.tickVoxelLOD()).toBe(null)
  })
})
