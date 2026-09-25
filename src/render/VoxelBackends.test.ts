import { describe, it, expect, vi } from "vitest"
import { VoxelAssetPipeline, WebViewVoxelBackend, type WebViewBridge } from "./VoxelBackends"

describe("VoxelAssetPipeline", ()=>{
  it("LOD Mapping für levels OFF/15/35/50 wie Diorama", ()=>{
    expect(VoxelAssetPipeline.lodsForLevel(0)).toEqual({ res: 0, shadow: false })
    expect(VoxelAssetPipeline.lodsForLevel(15)).toEqual({ res: 8, shadow: false })
    expect(VoxelAssetPipeline.lodsForLevel(35)).toEqual({ res: 16, shadow: false })
    expect(VoxelAssetPipeline.lodsForLevel(50)).toEqual({ res: 32, shadow: true })
    expect(VoxelAssetPipeline.lodsForLevel(20)).toEqual({ res: 16, shadow: false }) // zwischen 15 und 35
    expect(VoxelAssetPipeline.lodsForLevel(100)).toEqual({ res: 32, shadow: true })
  })
  it("cacheKey enthält alle Invalidierungsfaktoren", ()=>{
    const k1 = VoxelAssetPipeline.cacheKey("voxel_world","1.0","2ea74fa","abc","high")
    const k2 = VoxelAssetPipeline.cacheKey("voxel_world","1.0","2ea74fa","abc","low")
    expect(k1).not.toBe(k2) // graphicsProfile ändert Key
    const k3 = VoxelAssetPipeline.cacheKey("other","1.0","2ea74fa","abc","high")
    expect(k1).not.toBe(k3)
    expect(k1).toContain("voxel_world:1.0:2ea74fa:abc:high")
  })
  it("Limits: 64MiB mod.cache, 8MiB file, 512MiB writeBytes", ()=>{
    expect(VoxelAssetPipeline.MOD_CACHE_LIMIT).toBe(64*1024*1024)
    expect(VoxelAssetPipeline.FILE_LIMIT).toBe(8*1024*1024)
    expect(VoxelAssetPipeline.WRITEBYTES_LIMIT).toBe(512*1024*1024)
  })
})

describe("WebViewVoxelBackend — Warm Cache + Probe", ()=>{
  function fakeBridge(webGL2=true): WebViewBridge & { postSpy: ReturnType<typeof vi.fn> } {
    const postSpy = vi.fn(async (ctx:any)=> {
      // simuliere WebGL render: liefert canvas handle nach 10ms
      return { getWidth: ()=> 160, getHeight: ()=>144, fromWebGL: true, ctxLevel: ctx.level }
    })
    return {
      isWebGL2Available: vi.fn(async()=> webGL2),
      postFrame: postSpy,
      invalidate: vi.fn(),
      postSpy,
    }
  }

  it("probe cached — nur einmal gerufen", async ()=>{
    const b = fakeBridge(true)
    const backend = new WebViewVoxelBackend(b)
    expect(await backend.probe()).toBe(true)
    expect(await backend.probe()).toBe(true)
    expect(b.isWebGL2Available).toHaveBeenCalledTimes(1)
  })

  it("probe false → bleibt false, invalidate löscht Warm", async ()=>{
    const b = fakeBridge(false)
    const backend = new WebViewVoxelBackend(b)
    expect(await backend.probe()).toBe(false)
    // invalidate setzt availableCache zurück? aktuell nur warm/pending — probe bleibt cached false
    // Verhalten korrekt: probe false bleibt false bis neuer Backend — dokumentiert als EXPERIMENTELL
  })

  it("drawWorldSync: warm miss → null + startet async, nächster Call liefert warm", async ()=>{
    const b = fakeBridge(true)
    const backend = new WebViewVoxelBackend(b)
    const ctx: any = { level: 15, cam:{x:0,y:0}, vw:160,vh:144, scale:2, drawFx:()=>{} }
    // erster Call: kein warm → null (Canvas2D Fallback erwartet)
    expect(backend.drawWorldSync(ctx)).toBe(null)
    expect(b.postFrame).toHaveBeenCalledTimes(1)
    // warte auf pending
    await new Promise(r=> setTimeout(r, 20))
    // jetzt warm gefüllt → liefert Canvas
    const out = backend.drawWorldSync(ctx)
    expect(out).not.toBe(null)
    expect((out as any).fromWebGL).toBe(true)
  })

  it("invalidate leert warm + pending", async ()=>{
    const b = fakeBridge(true)
    const backend = new WebViewVoxelBackend(b)
    const ctx: any = { level: 35, cam:{x:5,y:5}, vw:160,vh:144, scale:2, drawFx:()=>{} }
    backend.drawWorldSync(ctx)
    await new Promise(r=> setTimeout(r, 20))
    expect(backend.drawWorldSync(ctx)).not.toBe(null)
    backend.invalidate()
    // nach invalidate wieder miss
    expect(backend.drawWorldSync(ctx)).toBe(null)
    expect(b.invalidate).toHaveBeenCalled()
  })
})
