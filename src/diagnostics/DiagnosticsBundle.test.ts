import { describe, it, expect } from "vitest"
import { DiagnosticsBundle } from "./DiagnosticsBundle"

function memStore(initial: Record<string,any>={}){
  const m=new Map<string,any>(Object.entries(initial))
  return { get:(k:string)=> m.get(k)??null, set:(k:string,v:any)=>{m.set(k,v); return true}, getData:()=>null, setData:()=>{}, remove:(k:string)=>m.delete(k), contains:(k:string)=> m.has(k), keys:()=>[...m.keys()], clear:()=>m.clear(), _m:m } as any
}

describe("DiagnosticsBundle §49+§51", ()=>{
  it("collects game/core/save/render/backup/cache sections", ()=>{
    const s=memStore({
      "library:index": [{id:"1", gameId:"red", isReady:true}],
      "cores:index": [{version:"1.0"},{version:"1.1"}],
      "cores:active":"1.1",
      "save:journal:red:normal:slot1": { status:"verified" },
      "telemetry:pipeline": { broken:["voxel"] },
      "backups:index": [{id:"1"}],
    })
    const d=new DiagnosticsBundle(s)
    const secs=d.collect()
    const names=secs.map(x=>x.name)
    expect(names).toContain("game")
    expect(names).toContain("core")
    expect(names).toContain("save")
    expect(names).toContain("render")
    expect(names).toContain("backup")
    expect(secs.find(x=>x.name==="render")?.status).toBe("warn")
  })
  it("sanitize removes data field", ()=>{
    const b={ sections:[{ name:"save", details:{ data:{ secret:1 }, header:{}} }]}
    const s=DiagnosticsBundle.sanitize(b)
    expect(s.sections[0].details.data).toBeUndefined()
    expect(s.sections[0].details.header).toBeDefined()
  })
  it("toJSON is parseable", ()=>{
    const s=memStore()
    const d=new DiagnosticsBundle(s)
    const j=d.toJSON()
    expect(JSON.parse(j).sections.length).toBeGreaterThan(0)
  })
})
