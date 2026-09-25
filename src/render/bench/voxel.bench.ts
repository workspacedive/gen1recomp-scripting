import { bench, describe } from "vitest"
import { PipelineAdapter, type FrameCtx } from "../PipelineAdapter"
import type { Host } from "../../host/ports"

// Bench: PipelineAdapter drawWorld overhead (ohne GPU) — Proxy für CPU Budget
// BENCHMARK ERFORDERLICH auf echtem iOS Gerät für echten GPU-Teil

function makeHost(): Host {
  return {
    storage: {} as any,
    files: {} as any,
    network: {} as any,
    graphics: {
      supportsWebGL: false as const,
      supportsWebGPU: false as const,
      createCanvas: ()=> ({ getWidth:()=>160,getHeight:()=>144 }),
      pushAll: ()=>{}, popAll: ()=>{}, setTilt: ()=>{},
    },
    audio: {} as any, input: {} as any, lifecycle: {} as any,
    memory: {} as any, jobs: {} as any, timing: { now: ()=> performance.now(), requestAnimationFrame: (cb:any)=> cb(0) as any, cancelAnimationFrame: ()=>{} } as any,
    haptics: {} as any, permissions: {} as any,
  }
}
function ctx(level=50): FrameCtx {
  return {
    state: { actors: Array.from({length: 20}, (_,i)=> ({ x:i*16, y:i*16, facing:"down", phase:0, flip:false, sprite: {
      getPoseGeometry: ()=> ({ image:{}, quad:{}, anchorX:8, anchorY:8, mirror:false }),
      getScreenOrigin: (x:number,y:number,cx:number,cy:number)=> [x-cx, y-cy] as any,
    }})) },
    cam: { x: 80, y: 72 }, vw: 160, vh: 144, width: 320, height: 288, scale: 2, level,
    paletteFor: ()=> ({} as any), spriteColors: ()=> ({} as any),
    drawFx: ()=> {},
    canvas: { getWidth:()=>160,getHeight:()=>144 },
  }
}

describe("bench — voxel PipelineAdapter cpu", ()=>{
  const h = makeHost()
  const pa = new PipelineAdapter(h)
  pa.install({ render_pipelines: {
    voxel: {
      levels: ["OFF","15","35","50"], priority: 20, available: ()=> true,
      drawWorld: (c: FrameCtx)=> {
        // Simuliere 2D Billboarding: 20 actors * getPoseGeometry + translate
        for (const a of (c.state.actors as any[])) {
          (a.sprite as any).getPoseGeometry(a.facing, a.phase, a.flip)
        }
        // drawFx project
        c.drawFx((wx,wy)=> ({ x: wx - c.cam.x, y: wy - c.cam.y }), c.scale)
        return { getWidth:()=>160,getHeight:()=>144 }
      },
      worldPresent: (canvas:any)=> canvas,
    },
    tilt: { levels:["OFF","ON"], priority: 5, available: ()=> true, drawWorld: ()=> ({getWidth:()=>160,getHeight:()=>144}) },
  }})
  pa.setLevel("voxel", 3)

  bench("worldPipeline selection (priority scan)", ()=> {
    pa.worldPipeline()
  })
  bench("drawWorld + worldPresent + present (20 actors, LOD 50)", ()=>{
    const c = ctx(50)
    const w = pa.drawWorld("voxel", c)
    if (w) {
      const wp = pa.worldPresent(w, c as any)
      pa.present(wp, c as any)
    }
  })
  bench("available() probe every frame (cached vs uncached)", ()=>{
    // Simulate uncached probe: new function each time
    pa.install({ render_pipelines: {
      voxel: { levels:["OFF","ON"], available: ()=> Math.random() > 0.1, drawWorld: ()=> ({getWidth:()=>1,getHeight:()=>1}) },
    }})
    pa.eligible("voxel")
  })
})
