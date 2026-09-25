import { describe, it, expect } from "vitest"
import { ConfigurationManager } from "./ConfigurationManager"

function memStore(){
  const m=new Map<string,any>()
  return { get:(k:string)=> m.get(k)??null, set:(k:string,v:any)=>{m.set(k,v); return true}, getData:()=>null, setData:()=>{}, remove:(k:string)=>m.delete(k), contains:(k:string)=>m.has(k), keys:()=>[...m.keys()], clear:()=>m.clear(), _m:m } as any
}

describe("ConfigurationManager §28", ()=>{
  it("defaults de, high LOD", ()=>{
    const c=new ConfigurationManager(memStore())
    const cfg=c.get()
    expect(cfg.language).toBe("de")
    expect(cfg.graphics.voxelLOD).toBe(50)
  })
  it("set patch merges", ()=>{
    const s=memStore()
    const c=new ConfigurationManager(s)
    c.set({ language:"en" })
    expect(c.get().language).toBe("en")
    c.set({ graphics:{ quality:"low", voxelLOD:15 } as any })
    expect(c.get().graphics.quality).toBe("low")
    expect(c.get().language).toBe("en")
  })
  it("feature flags versioned", ()=>{
    const c=new ConfigurationManager(memStore())
    c.setFlag("voxel-webgl", true)
    expect(c.isEnabled("voxel-webgl")).toBe(true)
    c.setFlag("voxel-webgl", false)
    expect(c.isEnabled("voxel-webgl")).toBe(false)
    expect(c.get().featureFlags["voxel-webgl"].version).toBe(2)
  })
})
