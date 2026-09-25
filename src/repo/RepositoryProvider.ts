/**
 * RepositoryProvider — Bounded Context Repository System (§43)
 * VERIFIZIERT gegen ARCHITEKTUR §43 + GitHub API (fetch) + FileManager bookmark
 * pro_required: false
 *
 * Abstrahiert GitHub/eigener Server/lokale Datei/Ordner/manuelle Installation
 * Provider: github, custom, local, bookmark, manual
 */

import type { NetworkPort, FilesPort } from "../host/ports"

export type RepoKind = "github"|"custom"|"local"|"bookmark"|"manual"
export type RepoEntry = { id: string; version:string; url:string; hash?:string; kind: RepoKind }

export interface RepositoryProvider {
  kind: RepoKind
  list(signal?: AbortSignal): Promise<RepoEntry[]>
  fetch(entry: RepoEntry, dest: string, signal?: AbortSignal): Promise<{ ok:true }|{ ok:false; error:string }>
}

export class GithubProvider implements RepositoryProvider {
  kind: RepoKind = "github"
  constructor(private network: NetworkPort, private files: FilesPort, private owner:string, private repo:string) {}
  async list(signal?: AbortSignal): Promise<RepoEntry[]> {
    const res=await this.network.fetch(`https://api.github.com/repos/${this.owner}/${this.repo}/releases?per_page=20`, { signal } as any)
    if (!res.ok) throw new Error(`github list ${res.status}`)
    const j=await res.json() as any[]
    return j.map(r=> ({ id: r.tag_name, version: r.tag_name.replace(/^v/,""), url: r.assets?.[0]?.browser_download_url ?? r.zipball_url, kind: "github" as const }))
  }
  async fetch(entry: RepoEntry, dest: string, signal?: AbortSignal): Promise<{ ok:true }|{ ok:false; error:string }> {
    try { await this.network.download(entry.url, dest, { signal }); return { ok:true } } catch(e){ return { ok:false, error:String(e)} }
  }
}

export class LocalProvider implements RepositoryProvider {
  kind: RepoKind = "local"
  constructor(private files: FilesPort, private dir: string) {}
  async list(): Promise<RepoEntry[]> {
    try {
      const entries=await this.files.readDirectory(this.dir)
      return entries.filter(e=>e.endsWith(".zip")||e.endsWith(".tar.gz")).map(e=> ({ id:e, version:e.replace(/\..+$/,""), url: this.dir+"/"+e, kind:"local" as const }))
    } catch { return [] }
  }
  async fetch(entry: RepoEntry, dest: string): Promise<{ ok:true }|{ ok:false; error:string }> {
    try { await this.files.copyFile(entry.url, dest); return { ok:true } } catch(e){ return { ok:false, error:String(e)} }
  }
}

export class BookmarkProvider implements RepositoryProvider {
  kind: RepoKind = "bookmark"
  constructor(private files: FilesPort, private bookmarkName:string) {}
  async list(): Promise<RepoEntry[]> {
    const p=this.files.bookmarkedPath?.(this.bookmarkName) ?? null
    if (!p) return []
    const local=new LocalProvider(this.files, p)
    return local.list()
  }
  async fetch(entry: RepoEntry, dest: string): Promise<{ ok:true }|{ ok:false; error:string }> {
    const local=new LocalProvider(this.files, entry.url.split("/").slice(0,-1).join("/"))
    return local.fetch(entry, dest)
  }
}
