/**
 * SaveManager — Bounded Context 10 (§18 Save System & Migration)
 * VERIFIZIERT gegen docs/ARCHITEKTUR.md §18 + src/core/Save*.lua, nutzt AtomicFile + Journal
 * pro_required: false — nutzt nur FilesPort + StoragePort (SQLite/Storage)
 *
 * Kinds: normal | engine | mod | checkpoint | config (save state = NICHT VERIFIZIERT, nicht versprechen)
 * Flow: Load → readAsString → JSON.parse (Limits: 2MiB, depth 40, entries 10k) → validate → if stale → Backup *.bak + Journal → migrate → Atomic Save
 * Atomic: atomicWriteString (tmp→verify→copy), Backup lastN=5, Journal in Storage.
 */

import type { FilesPort, StoragePort } from "../host/ports"
import { atomicWriteString } from "../host/AtomicFile"

export type SaveKind = "normal"|"engine"|"mod"|"checkpoint"|"config"
export type GameIdForSave = string // "red"|"gold"|...

export type SaveHeader = {
  schemaVersion: number
  gameId: GameIdForSave
  coreVersion: string
  kind: SaveKind
  slot: string // z.B. "slot1"
  createdAt: number
  updatedAt: number
  hash?: string // integrity sha256 of data (ohne header)
}

export type SaveEnvelope = {
  header: SaveHeader
  data: any
}

export type Migration = {
  from: number
  to: number
  migrate: (data:any)=> any
  validate?: (data:any)=> boolean
}

const MAX_BYTES = 2 * 1024 * 1024
const MAX_DEPTH = 40
const MAX_ENTRIES = 10000

function depthOf(v:any, d=0): number {
  if (d > MAX_DEPTH) return d
  if (v && typeof v === "object") {
    let m=d
    for (const k in v) m=Math.max(m, depthOf((v as any)[k], d+1))
    return m
  }
  return d
}
function countEntries(v:any): number {
  if (!v || typeof v !== "object") return 1
  let c=0
  const stack=[v]
  while (stack.length) {
    const cur=stack.pop()
    if (cur && typeof cur === "object") {
      for (const k in cur) { c++; if (c>MAX_ENTRIES) return c; const child=(cur as any)[k]; if (child && typeof child==="object") stack.push(child) }
    }
  }
  return c
}

export class SaveManager {
  private migrations = new Map<string, Migration[]>() // key `${gameId}:${kind}`

  constructor(private files: FilesPort, private storage: StoragePort) {}

  registerMigration(gameId: string, kind: SaveKind, m: Migration): void {
    const key=`${gameId}:${kind}`
    const list=this.migrations.get(key) ?? []
    list.push(m); list.sort((a,b)=>a.from-b.from)
    this.migrations.set(key, list)
  }

  private savePath(gameId: string, kind: SaveKind, slot: string): string {
    return `${this.files.documentsDirectory}/saves/${gameId}/${kind}/${slot}.json`
  }
  private backupPath(gameId: string, kind: SaveKind, slot: string, ts: number): string {
    return `${this.files.documentsDirectory}/saves/${gameId}/backups/${slot}-${ts}.json`
  }
  private journalKey(gameId: string, kind: SaveKind, slot: string): string { return `save:journal:${gameId}:${kind}:${slot}` }

  async exists(gameId: string, kind: SaveKind, slot:string): Promise<boolean> {
    return this.files.exists(this.savePath(gameId, kind, slot))
  }

  // Integrity: sha256 of stable JSON (data only)
  private async hashData(data:any): Promise<string> {
    try {
      const json=JSON.stringify(data)
      const digest=await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json) as unknown as ArrayBuffer)
      return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("")
    } catch { return "" }
  }

  async save(gameId: string, kind: SaveKind, slot:string, data:any, opts:{ schemaVersion:number; coreVersion:string }): Promise<{ ok:true; header:SaveHeader }|{ ok:false; error:string }> {
    const now=Date.now()
    const header: SaveHeader = {
      schemaVersion: opts.schemaVersion, gameId, coreVersion: opts.coreVersion, kind, slot,
      createdAt: now, updatedAt: now,
    }
    header.hash = await this.hashData(data)
    const envelope: SaveEnvelope = { header, data }

    // Limits
    const json=JSON.stringify(envelope)
    if (json.length > MAX_BYTES) return { ok:false, error:`save too large ${json.length} > ${MAX_BYTES}` }
    if (depthOf(envelope) > MAX_DEPTH) return { ok:false, error:"maxDepth exceeded" }
    if (countEntries(envelope) > MAX_ENTRIES) return { ok:false, error:"maxEntries exceeded" }

    const dest=this.savePath(gameId, kind, slot)

    // Backup previous if exists (lastN=5)
    try {
      if (await this.files.exists(dest)) {
        const prev=await this.files.readAsString(dest)
        const bak=this.backupPath(gameId, kind, slot, now)
        await atomicWriteString(this.files, bak, prev)
        await this.enforceBackups(gameId, kind, slot, 5)
      }
    } catch {}

    const r=await atomicWriteString(this.files, dest, json)
    if (!r.ok) return { ok:false, error: r.error }

    // Journal verified
    this.storage.set(this.journalKey(gameId,kind,slot), { last: header, verified: now })
    return { ok:true, header }
  }

  async load(gameId: string, kind: SaveKind, slot:string): Promise<{ ok:true; envelope:SaveEnvelope }|{ ok:false; error:string; recovered?:boolean }> {
    const dest=this.savePath(gameId, kind, slot)
    let raw: string
    try { raw=await this.files.readAsString(dest) } catch (e) { return { ok:false, error:String(e) } }
    if (raw.length > MAX_BYTES) return { ok:false, error:"save too large" }

    let env: SaveEnvelope
    try { env=JSON.parse(raw) } catch (e) { return { ok:false, error:`json parse ${String(e)}` } }

    // Validate header
    if (!env.header || typeof env.header.schemaVersion !== "number") return { ok:false, error:"missing header" }
    if (depthOf(env) > MAX_DEPTH || countEntries(env) > MAX_ENTRIES) return { ok:false, error:"limits exceeded" }

    // Integrity check
    if (env.header.hash) {
      const h=await this.hashData(env.data)
      if (h && h !== env.header.hash) return { ok:false, error:`integrity mismatch expected ${env.header.hash} got ${h}` }
    }

    // Migration if stale — currentVersion aus Storage oder env.header.coreVersion? Wir nutzen schemaVersion Registry: migrations keyed
    const key=`${gameId}:${kind}`
    const list=this.migrations.get(key) ?? []
    if (list.length) {
      const target = Math.max(...list.map(m=>m.to), env.header.schemaVersion)
      if (env.header.schemaVersion < target) {
        // Backup before migrate
        try {
          const bak=this.backupPath(gameId, kind, slot, Date.now())
          await atomicWriteString(this.files, bak, raw)
          await this.enforceBackups(gameId, kind, slot, 5)
        } catch {}
        this.storage.set(this.journalKey(gameId,kind,slot), { status:"migrating", from: env.header.schemaVersion, to: target, started: Date.now() })
        let curData=env.data
        let curVer=env.header.schemaVersion
        try {
          for (const m of list.sort((a,b)=>a.from-b.from)) {
            if (m.from >= curVer && m.from < target) {
              curData=m.migrate(curData)
              if (m.validate && !m.validate(curData)) throw new Error(`migration ${m.from}→${m.to} validate failed`)
              curVer=m.to
            }
          }
          const newEnv: SaveEnvelope = {
            header: { ...env.header, schemaVersion: target, updatedAt: Date.now(), hash: await this.hashData(curData) },
            data: curData,
          }
          const json=JSON.stringify(newEnv)
          const r=await atomicWriteString(this.files, dest, json)
          if (!r.ok) throw new Error(r.error)
          this.storage.set(this.journalKey(gameId,kind,slot), { status:"verified", from: env.header.schemaVersion, to: target, verified: Date.now() })
          return { ok:true, envelope: newEnv }
        } catch (e) {
          // Restore from backup
          try {
            const bakList=await this.listBackups(gameId,kind,slot)
            if (bakList.length) {
              const latest=bakList[bakList.length-1]
              const prev=await this.files.readAsString(latest)
              await atomicWriteString(this.files, dest, prev)
              this.storage.set(this.journalKey(gameId,kind,slot), { status:"rollback", error: String(e), recovered:true, at: Date.now() })
              return { ok:false, error: String(e), recovered: true }
            }
          } catch {}
          this.storage.set(this.journalKey(gameId,kind,slot), { status:"failed", error: String(e) })
          return { ok:false, error: String(e) }
        }
      }
    }

    this.storage.set(this.journalKey(gameId,kind,slot), { last: env.header, verified: Date.now() })
    return { ok:true, envelope: env }
  }

  async listBackups(gameId: string, kind: SaveKind, slot:string): Promise<string[]> {
    const dir=`${this.files.documentsDirectory}/saves/${gameId}/backups`
    try {
      if (!await this.files.exists(dir)) return []
      const entries=await this.files.readDirectory(dir)
      const pref=`${slot}-`
      return entries.filter(e=>e.startsWith(pref)).map(e=>dir+"/"+e).sort()
    } catch { return [] }
  }

  private async enforceBackups(gameId: string, kind: SaveKind, slot:string, keep:number): Promise<void> {
    const list=await this.listBackups(gameId,kind,slot)
    if (list.length <= keep) return
    const toRemove=list.slice(0, list.length-keep)
    for (const p of toRemove) try { await this.files.remove(p) } catch {}
  }

  async restoreBackup(gameId: string, kind: SaveKind, slot:string, backupPath?: string): Promise<{ ok:true }|{ ok:false; error:string }> {
    const dest=this.savePath(gameId,kind,slot)
    let src=backupPath
    if (!src) {
      const list=await this.listBackups(gameId,kind,slot)
      if (!list.length) return { ok:false, error:"no backup" }
      src=list[list.length-1]
    }
    try {
      const data=await this.files.readAsString(src!)
      const r=await atomicWriteString(this.files, dest, data)
      if (!r.ok) return { ok:false, error: r.error }
      return { ok:true }
    } catch (e) { return { ok:false, error: String(e) } }
  }
}
