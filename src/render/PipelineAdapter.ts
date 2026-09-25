/**
 * PipelineAdapter — Abbildung von Gen1Recomp render_pipelines auf Scripting
 * Quelle: src/render/Pipelines.lua + docs/modding.md Rendering pipelines
 * VERIFIZIERT (Pipelines.list(), eligible(), drawWorld, worldPresent, present, broken, priority)
 * Pro-frei: nutzt nur Canvas (VERIFIZIERT) + WebView (TEILWEISE VERIFIZIERT, EXPERIMENTELL)
 *
 * Eine Pipeline ist ein Display-Mode, keine Logik — nur presentational.
 * Levels in save.options.pipelines, Tilt ↔ Welt-Pipeline exklusiv.
 */

import type { Host } from "../host/ports"

// ---------------------------------------------------------------------------
// Typen — 1:1 aus Schemas.lua R.render_pipelines (VERIFIZIERT)
// ---------------------------------------------------------------------------
export type PipelineLevelNames = string[] // z.B. ["OFF","15","35","50"] oder ["OFF","ON"]

export type FrameCtx = {
  state: any // OverworldState
  cam: { x: number; y: number; scale?: number }
  vw: number; vh: number // world-pixel view
  width: number; height: number // window pixels
  scale: number
  level: number // aktuelles Level dieser Pipeline (0=OFF)
  paletteFor: (mapId: string) => any
  spriteColors: (mapId: string) => any
  // engine-owned field effects unter eigener Projektion zeichnen
  drawFx: (project: (wx:number, wy:number)=>{x:number;y:number}, scale:number)=>void
  // Scripting: Canvas-Handle für isCanvas-Check
  canvas?: unknown
}

export type PipelineDef = {
  label?: string
  levels?: PipelineLevelNames
  hotkey?: string
  priority?: number
  available?: () => boolean // jeden Frame!
  gate?: (top:any, overworld:any)=>boolean // nur Input, nie draw
  update?: (dt:number, level:number)=>void
  drawWorld?: (ctx: FrameCtx)=> unknown | null // canvas|nil
  worldPresent?: (canvas: unknown, ctx: FrameCtx)=> unknown
  present?: (canvas: unknown, ctx: FrameCtx)=> unknown
  invalidate?: ()=>void
}

export type PipelineRecord = { id: string; def: PipelineDef }

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------
export class PipelineAdapter {
  private levels = new Map<string, number>()
  private broken = new Set<string>()
  private registry = new Map<string, PipelineDef>()
  private owners = new Map<string, string>() // id -> modId
  private listCache: PipelineRecord[] | null = null

  constructor(private host: Host) {}

  // Registry aus Data.render_pipelines (nach Merge)
  install(data: any): void {
    this.registry.clear()
    this.owners.clear()
    this.listCache = null
    this.broken.clear()
    const defs = data?.render_pipelines
    if (!defs || typeof defs !== "object") return
    for (const [id, def] of Object.entries(defs)) {
      if (id.startsWith("_")) continue
      if (def && typeof def === "object") {
        this.registry.set(id, def as PipelineDef)
        const owner = (defs as any)._owners?.[id]
        if (owner) this.owners.set(id, owner)
      }
    }
  }

  list(): PipelineRecord[] {
    if (this.listCache) return this.listCache
    const out: PipelineRecord[] = []
    for (const [id, def] of this.registry) out.push({ id, def })
    out.sort((a,b)=>{
      const pa = a.def.priority ?? 0, pb = b.def.priority ?? 0
      if (pa !== pb) return pb - pa
      return a.id.localeCompare(b.id)
    })
    this.listCache = out
    return out
  }

  get(id: string): PipelineDef | null { return this.registry.get(id) ?? null }

  ownerOf(id: string): string | undefined { return this.owners.get(id) }

  private isCanvas(v: unknown): boolean {
    if (!v) return false
    if (typeof v === "object" && v !== null && "getWidth" in (v as any) && "getHeight" in (v as any)) return true
    // Scripting Data/Image handle — best-effort
    return false
  }

  private guard<T>(id: string, fn: ()=>T): T | null {
    if (this.broken.has(id)) return null
    try { return fn() } catch (e) {
      this.broken.add(id)
      const owner = this.ownerOf(id) ?? "?"
      console.error(`[Pipeline ${id}] (${owner}) failed — disabled for session:`, e)
      // Runtime.reportError(owner, ...) in echter Portierung
      return null
    }
  }

  private guardRender<T>(id: string, fn: ()=>T): T | null {
    if (this.broken.has(id)) return null
    // Canvas save/restore Fence — in Scripting: ctx.save()/restore()
    // Hier vereinfacht: try/finally pushen wir via Host wenn verfügbar
    try {
      // host.graphics.pushAll() — falls vorhanden
      // @ts-ignore
      this.host.graphics?.pushAll?.()
      const out = this.guard(id, fn)
      // @ts-ignore
      this.host.graphics?.popAll?.()
      return out!
    } catch (e) {
      try { // @ts-ignore
        this.host.graphics?.popAll?.() } catch {}
      const owner = this.ownerOf(id) ?? "?"
      console.error(`[Pipeline ${id}] (${owner}) state dirty — disabled`, e)
      this.broken.add(id)
      return null
    }
  }

  // ----- levels (wie Pipelines.level / setLevel) -----
  levelLabels(id: string): string[] {
    const def = this.get(id)
    const labels = def?.levels
    if (Array.isArray(labels) && labels.length>0) return labels
    return ["OFF","ON"]
  }
  maxLevel(id: string): number { return this.levelLabels(id).length - 1 }
  level(id: string): number { return this.levels.get(id) ?? 0 }
  levelLabel(id: string, lvl?: number): string {
    const labels = this.levelLabels(id)
    const l = lvl ?? this.level(id)
    return labels[l] ?? labels[0]
  }

  private excludeTilt(id: string, level: number): void {
    const def = this.get(id)
    if (!def?.drawWorld || level <= 0) return
    // Tilt ist in Scripting ein exklusiver Mode im GraphicsPort
    // Vereinfacht: anderes drawWorld zurücksetzen
    for (const {id: other, def: od} of this.list()) {
      if (other !== id && od.drawWorld && (this.levels.get(other) ?? 0) > 0) {
        this.levels.set(other, 0)
      }
    }
    // Tilt aus: host.graphics.setTilt(0) falls vorhanden
    // @ts-ignore
    try { this.host.graphics?.setTilt?.(0) } catch {}
  }

  setLevel(id: string, level: number): number {
    if (!this.get(id)) return 0
    let l = Math.floor(level) || 0
    if (l<0) l=0
    const max = this.maxLevel(id)
    if (l>max) l=max
    this.levels.set(id, l)
    this.excludeTilt(id, l)
    return l
  }

  cycle(id: string, dir=1): number {
    const max = this.maxLevel(id)
    if (max<1) return 0
    const span = max+1
    let target = (this.level(id)+dir) % span
    if (target<0) target+=span
    return this.setLevel(id, target)
  }

  syncOptions(opts: any): void {
    if (!opts || typeof opts !== "object") return
    if (!opts.pipelines || typeof opts.pipelines !== "object") opts.pipelines = {}
    for (const {id} of this.list()) {
      opts.pipelines[id] = this.level(id)
      const def = this.get(id)
      if (def?.drawWorld && this.level(id)>0) opts.tilt = 0
    }
  }

  applyOptions(opts: any): void {
    const bucket = opts?.pipelines
    this.levels.clear()
    this.broken.clear()
    let world: string| null = null
    for (const {id} of this.list()) {
      let lvl = Math.floor(Number(bucket?.[id] ?? 0)) || 0
      if (lvl<0) lvl=0
      const max = this.maxLevel(id)
      if (lvl>max) lvl=max
      const def = this.get(id)
      if (def?.drawWorld && lvl>0) {
        if (world) lvl=0
        else world=id
      }
      this.levels.set(id, lvl)
    }
    if (world) {
      // @ts-ignore
      try { this.host.graphics?.setTilt?.(0) } catch {}
    }
  }

  reset(): void { this.levels.clear(); this.broken.clear() }

  // ----- per-frame -----
  update(dt: number): void {
    for (const {id, def} of this.list()) {
      if (def.update) this.guardRender(id, ()=> def.update!(dt, this.level(id)))
    }
  }

  eligible(id: string): boolean {
    const def = this.get(id)
    if (!def || this.broken.has(id)) return false
    if (this.level(id) <= 0) return false
    if (def.available && this.guard(id, ()=>def.available!()) !== true) return false
    return true // gate NICHT prüfen!
  }

  canToggle(id: string, top:any, overworld:any): boolean {
    const def = this.get(id)
    if (!def) return false
    const gate = def.gate ?? ((t:any, ow:any)=> !!ow?.isFreeRoam) // Zoom.gateOK Fallback
    return this.guard(id, ()=> gate(top, overworld)) === true
  }

  worldPipeline(): string | null {
    for (const {id, def} of this.list()) {
      if (def.drawWorld && this.eligible(id)) return id
    }
    return null
  }

  drawWorld(id: string, ctx: FrameCtx & { level?:number }): unknown | null {
    const def = this.get(id)
    if (!def?.drawWorld) return null
    const c = { ...ctx, level: this.level(id) }
    const out = this.guardRender(id, ()=> def.drawWorld!(c))
    return this.isCanvas(out) ? out : null // null → vanilla 2D fallback, nie crash
  }

  worldPresent(canvas: unknown, ctx: FrameCtx): unknown | null {
    if (!canvas) return null
    let cur: unknown = canvas
    for (const {id, def} of this.list()) {
      if (def.worldPresent && this.eligible(id)) {
        const out: unknown = this.guardRender(id, ()=> def.worldPresent!(cur as any, {...ctx, level:this.level(id)} as FrameCtx))
        if (this.isCanvas(out)) cur = out
      }
    }
    return cur
  }

  present(canvas: unknown, ctx: FrameCtx): unknown | null {
    if (!canvas) return null
    let cur: unknown = canvas
    for (const {id, def} of this.list()) {
      if (def.present && this.eligible(id)) {
        const out: unknown = this.guardRender(id, ()=> def.present!(cur as any, {...ctx, level:this.level(id)} as FrameCtx))
        if (this.isCanvas(out)) cur = out
      }
    }
    return cur
  }

  wantsPresent(): boolean {
    for (const {id, def} of this.list()) if (def.present && this.eligible(id)) return true
    return false
  }

  hotkey(key: string, top:any, overworld:any): string | null {
    for (const {id, def} of this.list()) {
      if (def.hotkey === key) {
        if (this.canToggle(id, top, overworld)) this.cycle(id)
        else return null
        return id
      }
    }
    return null
  }

  rows(game:any): Array<{id:string; label:string; value:()=>string; step:(g:any,dir:number)=>boolean}> {
    return this.list().map(({id, def})=>({
      id: `pipeline:${id}`,
      label: def.label ?? id.toUpperCase(),
      value: ()=> this.levelLabel(id),
      step: (g:any, dir:number)=> {
        this.cycle(id, dir)
        const opts = g?.save?.options
        if (opts) {
          this.syncOptions(opts)
          try { // @ts-ignore
            this.host.graphics?.setTilt?.(opts.tilt ?? 0) } catch {}
        }
        return true
      },
    }))
  }

  invalidate(): void {
    for (const {id, def} of this.list()) if (def.invalidate) this.guardRender(id, ()=> def.invalidate!())
  }
}
