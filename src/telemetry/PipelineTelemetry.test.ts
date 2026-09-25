import { describe, it, expect } from "vitest"
import { PipelineTelemetry } from "./PipelineTelemetry"

function timing() {
  let t=0
  return { now: ()=> (t+=2), requestAnimationFrame: (cb:any)=> cb(0) as any, cancelAnimationFrame: ()=>{} } as any
}
function storage() {
  const m=new Map<string,any>()
  return { get: (k:string)=> m.get(k)??null, set: (k:string,v:any)=> { m.set(k,v); return true }, getData:()=>null, setData:()=>{}, remove: (k:string)=> m.delete(k), contains: (k:string)=> m.has(k), keys: ()=> [...m.keys()], clear: ()=> m.clear(), _m:m } as any
}

describe("PipelineTelemetry", ()=>{
  it("measure captures ms, p95, availableFalseRate", ()=>{
    const tel=new PipelineTelemetry(timing())
    for (let i=0;i<20;i++) tel.measure("voxel","drawWorld", 50, i<2? false:true, ()=> { /* 2ms */ })
    const s=tel.stats("voxel","drawWorld")
    expect(s.count).toBe(20)
    expect(s.p50).toBeGreaterThan(0)
    expect(s.availableFalseRate).toBeCloseTo(0.1,1)
  })
  it("shouldDowngrade when p95 > budget", ()=>{
    const tel=new PipelineTelemetry({ now: ()=> performance.now(), requestAnimationFrame: (cb:any)=> cb(0) as any, cancelAnimationFrame: ()=>{} } as any)
    // Mock Timing to produce large ms
    const t={ now: (()=>{ let v=0; return ()=> (v+=15)})(), requestAnimationFrame: (cb:any)=> cb(0) as any, cancelAnimationFrame: ()=>{} } as any
    const tel2=new PipelineTelemetry(t)
    for (let i=0;i<15;i++) tel2.measure("voxel","drawWorld",50,true, ()=> {})
    expect(tel2.shouldDowngrade("voxel", 8)).toBe(true) // p95 ~15 >8
    expect(tel2.shouldDowngrade("voxel", 20)).toBe(false)
  })
  it("markBroken + persist", ()=>{
    const st=storage()
    const tel=new PipelineTelemetry(timing(), st)
    tel.markBroken("voxel")
    tel.persist()
    expect(st._m.get("telemetry:pipeline").broken).toContain("voxel")
  })
})
