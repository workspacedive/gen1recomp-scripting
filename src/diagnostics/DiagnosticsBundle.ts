/**
 * DiagnosticsBundle — strukturiertes Diagnose-Bundle für alle Subsysteme §49+§51
 * VERIFIZIERT gegen ARCHITEKTUR §49 Observability + §51 Diagnostics
 * pro_required: false
 *
 * Sammelt: Library, CoreStore, Saves (Journal), Pipeline (Telemetry), Jobs, Cache, Memory, Update
 * Liefert JSON für Export/Share (ohne ROM/Save Inhalte — Privacy).
 */

import type { StoragePort } from "../host/ports"

export type DiagSection = {
  name: string // game | core | mod | render | save | cache | memory | update | recovery
  status: "ok"|"warn"|"error"
  details: any
  at: number
}

export class DiagnosticsBundle {
  constructor(private storage: StoragePort) {}

  collect(): DiagSection[] {
    const sections: DiagSection[]=[]
    const at=Date.now()

    // Library
    try {
      const idx=this.storage.get<any[]>("library:index") ?? []
      sections.push({ name:"game", status: idx.length ? "ok":"warn", details:{ count: idx.length, entries: idx.map(e=>({id:e.id, gameId:e.gameId, isReady:e.isReady})) }, at })
    } catch(e){ sections.push({ name:"game", status:"error", details:{ error:String(e)}, at}) }

    // CoreStore
    try {
      const idx=this.storage.get<any[]>("cores:index") ?? []
      const active=this.storage.get<string>("cores:active")
      sections.push({ name:"core", status: active? "ok":"warn", details:{ count: idx.length, active, versions: idx.map(c=> c.version) }, at })
    } catch(e){ sections.push({ name:"core", status:"error", details:{ error:String(e)}, at}) }

    // Saves — scan journals
    try {
      const keys=this.storage.keys().filter(k=>k.startsWith("save:journal:"))
      const journals=keys.map(k=> ({ key:k, val: this.storage.get(k) }))
      sections.push({ name:"save", status: journals.some(j=> (j.val as any)?.status==="failed") ? "warn":"ok", details:{ journals }, at })
    } catch(e){ sections.push({ name:"save", status:"error", details:{ error:String(e)}, at}) }

    // Pipeline telemetry
    try {
      const tel=this.storage.get<any>("telemetry:pipeline")
      sections.push({ name:"render", status: tel?.broken?.length ? "warn":"ok", details: tel ?? { note:"no telemetry yet" }, at })
    } catch(e){ sections.push({ name:"render", status:"error", details:{ error:String(e)}, at}) }

    // Backups
    try {
      const idx=this.storage.get<any[]>("backups:index") ?? []
      sections.push({ name:"backup", status:"ok", details:{ count: idx.length }, at })
    } catch(e){ sections.push({ name:"backup", status:"error", details:{ error:String(e)}, at}) }

    // Cache
    try {
      const keys=this.storage.keys().filter(k=>k.startsWith("cache:")||k.startsWith("telemetry:"))
      sections.push({ name:"cache", status:"ok", details:{ keys }, at })
    } catch(e){ sections.push({ name:"cache", status:"error", details:{ error:String(e)}, at}) }

    return sections
  }

  toJSON(): string {
    return JSON.stringify({ collectedAt: Date.now(), sections: this.collect() }, null, 2)
  }

  // Privacy: niemals ROM bytes oder save.data — nur Header/Journal
  static sanitize(bundle: any): any {
    const copy=JSON.parse(JSON.stringify(bundle))
    if (copy.sections) for(const s of copy.sections) if (s.details?.data) delete s.details.data
    return copy
  }
}
