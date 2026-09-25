import { describe, it, expect, vi } from "vitest"
import { PipelineAdapter, type FrameCtx } from "./PipelineAdapter"
import type { Host } from "../host/ports"

// minimal host mock
function makeHost(): Host {
  return {
    storage: {} as any,
    files: {} as any,
    network: {} as any,
    graphics: {
      supportsWebGL: false as const,
      supportsWebGPU: false as const,
      createCanvas: () => ({ getWidth: ()=> 160, getHeight: ()=> 144 }),
      pushAll: vi.fn(),
      popAll: vi.fn(),
      setTilt: vi.fn(),
      supportsWebView: true,
    },
    pipelines: undefined,
    audio: {} as any,
    input: {} as any,
    lifecycle: {} as any,
    memory: {} as any,
    jobs: {} as any,
    timing: {} as any,
    haptics: {} as any,
    permissions: {} as any,
  }
}

function frameCtx(level=1): FrameCtx {
  return {
    state: { actors: [] },
    cam: { x: 0, y: 0, scale: 1 },
    vw: 160, vh: 144, width: 320, height: 288, scale: 2, level,
    paletteFor: ()=> ({} as any),
    spriteColors: ()=> ({} as any),
    drawFx: ()=> {},
    // isCanvas returns true only for fake canvas with getWidth/getHeight
    canvas: { getWidth: ()=> 160, getHeight: ()=> 144 },
    // @ts-ignore emulate canvasContext guard fallback
    canvasContext: undefined,
  }
}

describe("PipelineAdapter — Verifikation gegen src/render/Pipelines.lua + docs/modding.md + Schemas.lua", ()=>{
  it("list sortiert nach priority desc, dann id", ()=>{
    const h = makeHost()
    const pa = new PipelineAdapter(h)
    pa.install({ render_pipelines: {
      low: { priority: 1, label: "LOW" },
      high: { priority: 20, label: "HIGH" },
      mid: { priority: 10 },
      a_same: { priority: 10 },
    }})
    const ids = pa.list().map(r=> r.id)
    expect(ids[0]).toBe("high")
    // mid und a_same gleiche priority 10 → alphabetical
    expect(ids.slice(1,3)).toEqual(["a_same","mid"])
    expect(ids[3]).toBe("low")
  })

  it("eligible = level>0 && !broken && available()==true ; gate wird ignoriert", ()=>{
    const h = makeHost()
    const pa = new PipelineAdapter(h)
    let availableCalls=0, gateCalls=0
    pa.install({ render_pipelines: {
      voxel: {
        levels: ["OFF","15","35","50"],
        available: ()=> { availableCalls++; return false },
        gate: ()=> { gateCalls++; return false },
        drawWorld: ()=> ({ getWidth:()=>1,getHeight:()=>1 }),
      }
    }})
    pa.setLevel("voxel", 1)
    expect(pa.eligible("voxel")).toBe(false)
    expect(availableCalls).toBe(1)
    expect(gateCalls).toBe(0) // gate darf eligible nie beeinflussen

    // available true → eligible true trotz gate false
    pa.install({ render_pipelines: {
      voxel: {
        levels: ["OFF","ON"],
        available: ()=> true,
        gate: ()=> false,
        drawWorld: ()=> ({ getWidth:()=>1,getHeight:()=>1 }),
      }
    }})
    pa.setLevel("voxel", 1)
    expect(pa.eligible("voxel")).toBe(true)
  })

  it("worldPipeline nimmt höchste priority eligible", ()=>{
    const h=makeHost()
    const pa=new PipelineAdapter(h)
    pa.install({ render_pipelines: {
      a: { priority: 5, levels:["OFF","ON"], available: ()=> true, drawWorld: ()=> ({getWidth:()=>1,getHeight:()=>1}) },
      b: { priority: 20, levels:["OFF","ON"], available: ()=> true, drawWorld: ()=> ({getWidth:()=>1,getHeight:()=>1}) },
      c: { priority: 15, levels:["OFF","ON"], available: ()=> false, drawWorld: ()=> ({getWidth:()=>1,getHeight:()=>1}) },
    }})
    // nur a und b aktivieren — c bleibt OFF weil available false aber excludeTilt würde sonst b clearen
    pa.setLevel("a",1)
    pa.setLevel("b",1)
    // excludeTilt: b (20) hat letzte Set, a wurde cleared → nur b bleibt
    expect(pa.worldPipeline()).toBe("b")
    // b auf OFF → a wieder setzen → a gewinnt
    pa.setLevel("b",0)
    pa.setLevel("a",1)
    expect(pa.worldPipeline()).toBe("a")
    // keine eligible → null
    pa.setLevel("a",0)
    expect(pa.worldPipeline()).toBe(null)
    // c available false → nie eligible, selbst wenn level 1
    pa.setLevel("c",1)
    expect(pa.worldPipeline()).toBe(null)
  })

  it("drawWorld: isCanvas false → null Fallback 2D; vergessener return → null", ()=>{
    const h=makeHost()
    const pa=new PipelineAdapter(h)
    pa.install({ render_pipelines: {
      voxel: { levels:["OFF","ON"], available: ()=> true, drawWorld: ()=> null as any },
      bad:   { levels:["OFF","ON"], available: ()=> true, drawWorld: ()=> ({ notCanvas: true }) as any },
    }})
    pa.setLevel("voxel",1); pa.setLevel("bad",1)
    const ctx=frameCtx()
    expect(pa.drawWorld("voxel", ctx)).toBe(null)
    expect(pa.drawWorld("bad", ctx)).toBe(null)
    // korrekt: canvas object mit getWidth/getHeight
    pa.install({ render_pipelines: {
      good: { levels:["OFF","ON"], available: ()=> true, drawWorld: ()=> ({ getWidth:()=>160,getHeight:()=>144 }) },
    }})
    pa.setLevel("good",1)
    expect(pa.drawWorld("good", ctx)).not.toBe(null)
  })

  it("drawWorld throw → broken[id]=true, danach nie eligible, nie crash", ()=>{
    const h=makeHost()
    const pa=new PipelineAdapter(h)
    pa.install({ render_pipelines: {
      voxel: { levels:["OFF","ON"], available: ()=> true, drawWorld: ()=> { throw new Error("boom") } },
      fallback: { priority: 1, levels:["OFF","ON"], available: ()=> true, drawWorld: ()=> ({ getWidth:()=>1,getHeight:()=>1 }) },
      _owners: { voxel: "voxel_world" },
    } as any})
    pa.setLevel("voxel",1); pa.setLevel("fallback",1)
    const ctx=frameCtx()
    const out = pa.drawWorld("voxel", ctx)
    expect(out).toBe(null) // fallback signal
    expect(pa.eligible("voxel")).toBe(false) // broken
    // zweiter call → broken short-circuit, keine erneute throw
    expect(pa.drawWorld("voxel", ctx)).toBe(null)
    // fallback bleibt eligible
    expect(pa.eligible("fallback")).toBe(true)
    expect(pa.worldPipeline()).toBe("fallback")
  })

  it("worldPresent/present falten nur über isCanvas, throw → broken skip", ()=>{
    const h=makeHost()
    const pa=new PipelineAdapter(h)
    const canvasA = { getWidth:()=>160,getHeight:()=>144, id:"A" }
    const canvasB = { getWidth:()=>160,getHeight:()=>144, id:"B" }
    pa.install({ render_pipelines: {
      p1: { levels:["OFF","ON"], available: ()=> true, present: (c:any)=> canvasB },
      p2: { levels:["OFF","ON"], available: ()=> true, present: ()=> { throw new Error("fx fail") } },
      p3: { levels:["OFF","ON"], available: ()=> true, present: (c:any)=> ({ notCanvas:true }) as any },
    }})
    pa.setLevel("p1",1); pa.setLevel("p2",1); pa.setLevel("p3",1)
    const ctx=frameCtx()
    const out = pa.present(canvasA, ctx)
    // p1 → B, p2 broken skip, p3 liefert kein Canvas → bleibt B
    expect((out as any).id).toBe("B")
    expect(pa.eligible("p2")).toBe(false)
  })

  it("canToggle prüft gate, hotkey respektiert gate, draw bleibt unberührt", ()=>{
    const h=makeHost()
    const pa=new PipelineAdapter(h)
    pa.install({ render_pipelines: {
      voxel: { levels:["OFF","ON"], priority: 5, gate: ()=> false, available: ()=> true, drawWorld: ()=> ({getWidth:()=>1,getHeight:()=>1}) },
    }})
    pa.setLevel("voxel",0)
    const overworld = { isFreeRoam: false }
    expect(pa.canToggle("voxel", {}, overworld)).toBe(false)
    // Schemas Default gate würde isFreeRoam checken — hier custom false → kein toggle
    pa.install({ render_pipelines: {
      voxel: { levels:["OFF","ON"], hotkey:"6", gate: (top:any, ow:any)=> !!ow?.isFreeRoam, available: ()=> true, drawWorld: ()=> ({getWidth:()=>1,getHeight:()=>1}) },
    }})
    pa.setLevel("voxel",0)
    expect(pa.canToggle("voxel", {}, { isFreeRoam: true })).toBe(true)
    expect(pa.canToggle("voxel", {}, { isFreeRoam: false })).toBe(false)
  })

  it("setLevel excludeTilt: nur eine drawWorld gleichzeitig", ()=>{
    const h=makeHost()
    const pa=new PipelineAdapter(h)
    pa.install({ render_pipelines: {
      voxel: { levels:["OFF","ON"], priority: 20, available: ()=> true, drawWorld: ()=> ({getWidth:()=>1,getHeight:()=>1}) },
      diorama: { levels:["OFF","ON"], priority: 10, available: ()=> true, drawWorld: ()=> ({getWidth:()=>1,getHeight:()=>1}) },
    }})
    pa.setLevel("voxel",1)
    expect(pa.level("voxel")).toBe(1)
    pa.setLevel("diorama",1)
    // diorama einschalten → voxel aus (Tilt exklusiv)
    expect(pa.level("diorama")).toBe(1)
    expect(pa.level("voxel")).toBe(0)
  })

  it("levels OFF/15/35/50 wie voxel_world Diorama — cycle wrap", ()=>{
    const h=makeHost()
    const pa=new PipelineAdapter(h)
    pa.install({ render_pipelines: {
      voxel: { levels: ["OFF","15","35","50"], priority: 20, available: ()=> true, drawWorld: ()=> ({getWidth:()=>1,getHeight:()=>1}) },
    }})
    expect(pa.maxLevel("voxel")).toBe(3)
    expect(pa.levelLabel("voxel",0)).toBe("OFF")
    expect(pa.levelLabel("voxel",3)).toBe("50")
    pa.setLevel("voxel",0); expect(pa.cycle("voxel",1)).toBe(1)
    pa.setLevel("voxel",3); expect(pa.cycle("voxel",1)).toBe(0) // wrap
    pa.setLevel("voxel",0); expect(pa.cycle("voxel",-1)).toBe(3)
  })

  it("applyOptions / syncOptions mirror save.options.pipelines", ()=>{
    const h=makeHost()
    const pa=new PipelineAdapter(h)
    pa.install({ render_pipelines: {
      voxel: { levels:["OFF","15","35","50"], available: ()=> true, drawWorld: ()=> ({getWidth:()=>1,getHeight:()=>1}) },
      other: { levels:["OFF","ON"], available: ()=> true, present: (c:any)=> c },
    }})
    const opts: any = { pipelines: { voxel: 2, other: 1 }}
    pa.applyOptions(opts)
    expect(pa.level("voxel")).toBe(2)
    expect(pa.level("other")).toBe(1)
    // sync zurück
    pa.setLevel("voxel",3)
    pa.syncOptions(opts)
    expect(opts.pipelines.voxel).toBe(3)
    expect(opts.tilt).toBe(0) // drawWorld aktiv → tilt aus
  })

  it("invalidate ruft def.invalidate, schluckt throw als broken", ()=>{
    const h=makeHost()
    const spy = vi.fn()
    const bad = vi.fn(()=> { throw new Error("gpu") })
    const pa=new PipelineAdapter(h)
    pa.install({ render_pipelines: {
      ok: { levels:["OFF","ON"], available: ()=> true, invalidate: spy },
      brokenInvalidate: { levels:["OFF","ON"], available: ()=> true, invalidate: bad },
    }})
    pa.invalidate()
    expect(spy).toHaveBeenCalled()
    expect(pa.eligible("brokenInvalidate")).toBe(false) // broken durch throw
  })

  it("guard pushAll/popAll Fence auch bei throw balanciert", ()=>{
    const h=makeHost()
    const pa=new PipelineAdapter(h)
    pa.install({ render_pipelines: {
      voxel: { levels:["OFF","ON"], available: ()=> true, drawWorld: ()=> { throw new Error("x") } },
    }})
    pa.setLevel("voxel",1)
    pa.drawWorld("voxel", frameCtx())
    expect((h.graphics.pushAll as any)).toHaveBeenCalled()
    expect((h.graphics.popAll as any)).toHaveBeenCalled()
  })

  it("rows() für Options-Menü: value/step schließen Pipeline-Level korrekt", ()=>{
    const h=makeHost()
    const pa=new PipelineAdapter(h)
    pa.install({ render_pipelines: {
      voxel: { label:"VOXEL", levels:["OFF","ON"], available: ()=> true, drawWorld: ()=> ({getWidth:()=>1,getHeight:()=>1}) },
    }})
    pa.setLevel("voxel",0)
    const rows = pa.rows({ save:{ options:{} } } as any)
    expect(rows[0].value()).toBe("OFF")
    rows[0].step({ save:{ options:{} } } as any, 1)
    expect(pa.level("voxel")).toBe(1)
  })
})
