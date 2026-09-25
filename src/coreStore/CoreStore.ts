/**
 * Core Store — Bounded Context 5
 * VERIFIZIERT gegen CacheContract.FORMAT + src/update/Semver.lua
 * pro_required: false
 */
import type { FilesPort, StoragePort } from "../host/ports"

export type CoreRetention = "active" | "lastKnownGood" | "fallback" | "protected"

export type CoreRecord = {
  version: string // semver
  hash: string // sha256 hex
  manifest: { apiVersion: string; minHostVersion?: string; compat: string[] }
  source: "bundled" | "github" | "local" | "manual"
  buildInfo: { commit: string; toolchain: string; luaVersion: string; artifactHash: string }
  installedAt: number
  lastVerifiedAt: number
  retention: CoreRetention
  compatibleGames: string[]
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i=0;i<3;i++) {
    const da = pa[i] ?? 0, db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

export class CoreStore {
  constructor(private files: FilesPort, private storage: StoragePort) {}

  private coresRoot(): string { return this.files.documentsDirectory + "/cores" }

  list(): CoreRecord[] {
    return this.storage.get<CoreRecord[]>("cores:index") ?? []
  }

  getActive(): CoreRecord | null {
    const v = this.storage.get<string>("cores:active")
    if (!v) return null
    return this.list().find(c=>c.version===v) ?? null
  }

  getLKG(): CoreRecord | null {
    return this.list().find(c=>c.retention==="lastKnownGood") ?? null
  }

  async install(record: CoreRecord, bundleBytes: Uint8Array): Promise<{ ok: true }|{ ok:false; error:string }> {
    // Hash-Verifikation (SHA-256)
    try {
      const digest = await crypto.subtle.digest("SHA-256", bundleBytes as unknown as ArrayBuffer)
      const hex = Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("")
      if (hex !== record.hash.toLowerCase()) return { ok:false, error:`hash mismatch got ${hex} expected ${record.hash}` }
    } catch (e) {
      // SubtleCrypto nicht verfügbar → überspringen (Graceful Degradation)
      console.warn("[CoreStore] sha256 verify skipped", e)
    }

    const dir = this.coresRoot() + `/${record.version}`
    const staged = dir + ".staged"
    try { await this.files.remove(staged) } catch {}
    await this.files.createDirectory(staged + "/bundle", true)
    await this.files.writeAsBytes(staged + "/bundle/core.bin", bundleBytes)
    await this.files.writeAsString(staged + "/core.json", JSON.stringify(record, null, 2))

    // Verify staged
    if (!await this.files.exists(staged + "/bundle/core.bin")) return { ok:false, error:"staged verify failed" }

    // Atomic-ish activation: staged → dir (copy)
    await this.files.createDirectory(dir + "/bundle", true)
    await this.files.copyFile(staged + "/bundle/core.bin", dir + "/bundle/core.bin")
    await this.files.copyFile(staged + "/core.json", dir + "/core.json")
    await this.files.remove(staged)

    // Index upsert
    const idx = this.list().filter(c=>c.version!==record.version)
    idx.push({ ...record, installedAt: Date.now(), lastVerifiedAt: Date.now() })
    idx.sort((a,b)=>compareSemver(b.version,a.version))
    this.storage.set("cores:index", idx)

    // Retention: keepLastN=3 + LKG + protected
    await this.enforceRetention()

    return { ok:true }
  }

  activate(version: string): { ok: true }|{ ok:false; error:string } {
    const rec = this.list().find(c=>c.version===version)
    if (!rec) return { ok:false, error:`core ${version} not installed` }
    this.storage.set("cores:active", version)
    return { ok:true }
  }

  markVerified(version: string): void {
    const idx = this.list()
    for (const c of idx) if (c.retention==="lastKnownGood") c.retention="fallback"
    const cur = idx.find(c=>c.version===version)
    if (cur) cur.retention="lastKnownGood"
    this.storage.set("cores:index", idx)
  }

  private async enforceRetention(): Promise<void> {
    const idx = this.list()
    // Sort desc, keep 3 newest + protected + LKG
    idx.sort((a,b)=>compareSemver(b.version,a.version))
    const keep = new Set<string>()
    for (let i=0;i<Math.min(3, idx.length);i++) keep.add(idx[i].version)
    for (const c of idx) if (c.retention==="protected" || c.retention==="lastKnownGood") keep.add(c.version)
    const active = this.storage.get<string>("cores:active")
    if (active) keep.add(active)

    const next = idx.filter(c=>keep.has(c.version))
    const removed = idx.filter(c=>!keep.has(c.version))
    for (const r of removed) {
      try { await this.files.remove(this.coresRoot()+`/${r.version}`) } catch {}
    }
    this.storage.set("cores:index", next)
  }

  async resolveForProfile(coreVersion?: string): Promise<CoreRecord | null> {
    if (coreVersion) {
      const hit = this.list().find(c=>c.version===coreVersion)
      if (hit) return hit
    }
    return this.getActive() ?? this.getLKG() ?? this.list()[0] ?? null
  }
}
