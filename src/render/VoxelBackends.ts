/**
 * Voxel Backends — Canvas2D Fallback + WebView WebGL (EXPERIMENTELL)
 * Für mods/voxel_world und Community Voxel-Packs
 * Non-Pro: Canvas (VERIFIZIERT) + WebView (TEILWEISE VERIFIZIERT, BENCHMARK)
 */

import type { FrameCtx } from "./PipelineAdapter"

// ---------------------------------------------------------------------------
// Canvas2D Diorama — isometrische Billboarding-Näherung
// Läuft synchron, kein Allocation-Spam, p95 <6ms Ziel
// ---------------------------------------------------------------------------
export class Canvas2DVoxelBackend {
  // Cache für Tile-Atlas (ein Image pro Tileset)
  private atlasCache = new Map<string, any>()

  drawWorld(ctx: FrameCtx, drawTile: (id:string, x:number,y:number)=>void, drawActors: ()=>void): unknown {
    const { vw, vh, cam, scale } = ctx
    const level = ctx.level ?? 0
    const tilt = level / 50 // 0..1

    // ctx.canvas ist in Scripting der Canvas-Context Queue — hier vereinfacht
    const canvasCtx = (ctx as any).canvasContext as CanvasRenderingContext2D | undefined
    if (!canvasCtx) return null // Fallback: kein Canvas → vanilla 2D

    canvasCtx.save()
    canvasCtx.translate(vw/2, vh/2)
    canvasCtx.rotate(-tilt * 0.15)
    canvasCtx.scale(scale, scale * (1 - tilt*0.2))

    // Ground: sichtbare Tiles
    const minX = Math.floor(cam.x - vw/2), maxX = Math.ceil(cam.x + vw/2)
    const minY = Math.floor(cam.y - vh/2), maxY = Math.ceil(cam.y + vh/2)
    for (let y=minY; y<maxY; y+=16) for (let x=minX; x<maxX; x+=16) drawTile(`${x},${y}`, x, y)

    drawActors()

    // Feld-Effekte via drawFx (project → 2D)
    try { ctx.drawFx((wx,wy)=>({x: wx - cam.x, y: wy - cam.y}), scale) } catch {}

    canvasCtx.restore()
    return (ctx as any).canvas // isCanvas geprüft vom Adapter
  }

  worldPresent(canvas: unknown, ctx: FrameCtx): unknown {
    // Tilt-Shift: leichter Blur auf Welt, nicht auf UI
    const c = (ctx as any).canvasContext as CanvasRenderingContext2D | undefined
    if (c && ctx.level === 50) {
      try { (c as any).filter = "blur(0.5px) contrast(1.05)" } catch {}
    }
    return canvas
  }
}

// ---------------------------------------------------------------------------
// WebView WebGL — Three.js in WKWebView (EXPERIMENTELL, BENCHMARK ERFORDERLICH)
// Ablauf:
// 1. available() Probe: WebView Canvas.getContext('webgl2') → true/false
// 2. WebView lädt ESM (three.module.js slim) via fetch → FileManager Cache (prepared_asset)
// 3. Voxel-Mesh aus mod.cache (64 MiB) / mod.storage:writeBytes (512 MiB) — nicht redestribuiert
// 4. Meldung postMessage {kind:"frame", ctx:{cam,vw,vh,scale,level}} → WebView rendert offscreen
// 5. Ergebnis als Data URL / Transfer zurück, Warm Cache hält 1 Frame voraus (async→sync Entkopplung)
// ---------------------------------------------------------------------------
export type WebViewBridge = {
  isWebGL2Available(): Promise<boolean>
  postFrame(ctx: FrameCtx): Promise<unknown | null> // canvas handle oder null
  invalidate(): void
}

export class WebViewVoxelBackend {
  private availableCache: boolean | null = null
  private warm: unknown | null = null
  private pending: Promise<unknown|null> | null = null

  constructor(private bridge: WebViewBridge) {}

  async probe(): Promise<boolean> {
    if (this.availableCache !== null) return this.availableCache
    try {
      const ok = await this.bridge.isWebGL2Available()
      this.availableCache = !!ok
      return this.availableCache
    } catch { this.availableCache = false; return false }
  }

  // Synchroner Fast-Path: Warm Cache → sofort, sonst null → Adapter fällt auf Canvas2D zurück
  drawWorldSync(ctx: FrameCtx): unknown | null {
    if (this.warm && this.isCanvas(this.warm)) {
      // Start nächsten Frame im Hintergrund (Predictive)
      this.pending = this.bridge.postFrame(ctx).then(r=>{ this.warm = r; return r }).catch(()=>null)
      return this.warm
    }
    // Noch kein Warm — starte async, liefere null → 2D Fallback
    this.pending = this.bridge.postFrame(ctx).then(r=>{ this.warm = r; return r }).catch(()=>null)
    return null
  }

  private isCanvas(v: unknown): boolean {
    return !!v && typeof v === "object" && "getWidth" in (v as any)
  }

  invalidate(): void { this.warm=null; this.pending=null; this.bridge.invalidate() }
}

// ---------------------------------------------------------------------------
// Voxel Asset Pipeline — Import → Decode → Cache
// Quelle: mod.cache (64 MiB, install-scoped) + mod.storage:writeBytes (512 MiB, staged+verified)
// + Importers voxels Pack + PreparedAssetCache
// ---------------------------------------------------------------------------
export type VoxelImportSpec = { source: "vox"|"glb"|"voxels-pack"; bytes: Uint8Array; mapId?: string }

export class VoxelAssetPipeline {
  // 64 MiB cap für mod.cache (Doku), 8 MiB pro File (FileManager), 512 MiB für writeBytes
  static readonly MOD_CACHE_LIMIT = 64 * 1024 * 1024
  static readonly FILE_LIMIT = 8 * 1024 * 1024
  static readonly WRITEBYTES_LIMIT = 512 * 1024 * 1024

  static cacheKey(modId: string, apiVersion: string, coreVersion: string, depHash: string, graphicsProfile: string): string {
    // Hash wie PreparedModCache, plus graphicsProfile für LOD
    return `${modId}:${apiVersion}:${coreVersion}:${depHash}:${graphicsProfile}`
  }

  static lodsForLevel(level: number): { res: number; shadow: boolean } {
    if (level <= 0) return { res: 0, shadow: false } // OFF → 2D
    if (level <= 15) return { res: 8, shadow: false }
    if (level <= 35) return { res: 16, shadow: false }
    return { res: 32, shadow: true } // 50
  }
}
