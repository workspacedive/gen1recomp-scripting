/**
 * BackupManager — Bounded Context Backup (§60)
 * VERIFIZIERT gegen ARCHITEKTUR §60 + SaveManager Backup lastN + docs Export
 * pro_required: false — nutzt FilesPort + StoragePort, kein Pro
 *
 * Verwaltet versionierte Exports (Saves, Mod Data, Profiles, Metadata, Settings)
 * Pfad: backups/<kind>/<timestamp>-<slot>.json ; SQLite/Storage Index.
 */

import type { FilesPort, StoragePort } from "../host/ports"
import { atomicWriteString } from "../host/AtomicFile"

export type BackupKind = "save"|"mod-data"|"profile"|"metadata"|"settings"
export type BackupRecord = {
  id: string
  kind: BackupKind
  slot: string
  createdAt: number
  sizeBytes: number
  path: string
  header?: any
}

export class BackupManager {
  constructor(private files: FilesPort, private storage: StoragePort) {}

  private backupRoot(): string { return `${this.files.documentsDirectory}/backups` }

  async exportBackup(kind: BackupKind, slot: string, data: any, header?: any): Promise<BackupRecord> {
    const ts=Date.now()
    const id=`${kind}-${slot}-${ts}`
    const path=`${this.backupRoot()}/${kind}/${ts}-${slot}.json`
    const payload=JSON.stringify({ header, data, exportedAt: ts, kind, slot }, null, 2)
    const r=await atomicWriteString(this.files, path, payload)
    if (!r.ok) throw new Error(r.error)
    const rec: BackupRecord={ id, kind, slot, createdAt: ts, sizeBytes: payload.length, path, header }
    const idx=this.storage.get<BackupRecord[]>("backups:index") ?? []
    idx.push(rec); this.storage.set("backups:index", idx)
    await this.enforceRetention(kind, slot, 5)
    return rec
  }

  async list(kind?: BackupKind, slot?: string): Promise<BackupRecord[]> {
    let idx=this.storage.get<BackupRecord[]>("backups:index") ?? []
    if (kind) idx=idx.filter(r=>r.kind===kind)
    if (slot) idx=idx.filter(r=>r.slot===slot)
    // Verify files still exist
    const out: BackupRecord[]=[]
    for(const r of idx){
      if (await this.files.exists(r.path)) out.push(r)
    }
    // cleanup stale index entries
    if (out.length !== idx.length) this.storage.set("backups:index", out)
    return out.sort((a,b)=> a.createdAt-b.createdAt)
  }

  async restore(id: string): Promise<{ ok:true; data:any }|{ ok:false; error:string }> {
    const idx=this.storage.get<BackupRecord[]>("backups:index") ?? []
    const rec=idx.find(r=>r.id===id)
    if (!rec) return { ok:false, error:"not found" }
    try {
      const raw=await this.files.readAsString(rec.path)
      const parsed=JSON.parse(raw)
      return { ok:true, data: parsed.data }
    } catch(e){ return { ok:false, error:String(e)} }
  }

  async remove(id: string): Promise<void> {
    const idx=this.storage.get<BackupRecord[]>("backups:index") ?? []
    const rec=idx.find(r=>r.id===id)
    if (rec) try{ await this.files.remove(rec.path)} catch {}
    this.storage.set("backups:index", idx.filter(r=>r.id!==id))
  }

  private async enforceRetention(kind: BackupKind, slot:string, keep:number): Promise<void> {
    const list=await this.list(kind, slot)
    if (list.length <= keep) return
    const toRemove=list.slice(0, list.length-keep)
    for(const r of toRemove) await this.remove(r.id)
  }
}
