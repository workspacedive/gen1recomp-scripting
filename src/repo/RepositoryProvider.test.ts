import { describe, it, expect } from "vitest"
import { LocalProvider, GithubProvider } from "./RepositoryProvider"

class MemFiles {
  documentsDirectory="/docs"; temporaryDirectory="/tmp"; appGroupDocumentsDirectory="/g"; isiCloudEnabled=false
  map=new Map<string,Uint8Array>()
  dirs=new Set<string>(["/docs"])
  async exists(p:string){ return this.map.has(p) || this.dirs.has(p) }
  existsSync(p:string){ return this.map.has(p) }
  async isFile(p:string){ return this.map.has(p) }
  async isDirectory(p:string){ return this.dirs.has(p) }
  async isLink(){ return false }
  async createDirectory(p:string){ this.dirs.add(p)}
  async readDirectory(p:string){ const pref=p+"/"; return [...this.map.keys()].filter(k=>k.startsWith(pref)).map(k=>k.slice(pref.length))}
  async readAsString(p:string){ const b=this.map.get(p); if(!b) throw new Error("miss"); return new TextDecoder().decode(b)}
  readAsStringSync(p:string){ return new TextDecoder().decode(this.map.get(p)!)}
  async readAsBytes(p:string){ const b=this.map.get(p); if(!b) throw new Error("miss"); return b}
  readAsBytesSync(p:string){ return this.map.get(p)!}
  async readAsData(){ return null as any}
  async writeAsString(p:string,s:string){ this.map.set(p,new TextEncoder().encode(s))}
  writeAsStringSync(p:string,s:string){ this.map.set(p,new TextEncoder().encode(s))}
  async writeAsBytes(p:string,d:Uint8Array){ this.map.set(p,d)}
  writeAsBytesSync(p:string,d:Uint8Array){ this.map.set(p,d)}
  async writeAsData(){}
  async copyFile(s:string,d:string){ const b=this.map.get(s); if(!b) throw new Error("copy"); this.map.set(d,b)}
  copyFileSync(s:string,d:string){ const b=this.map.get(s)!; this.map.set(d,b)}
  async remove(p:string){ this.map.delete(p)}
  bookmarkedPath(){ return null}
}

describe("RepositoryProvider §43", ()=>{
  it("LocalProvider list + fetch", async()=>{
    const f=new MemFiles() as any
    await f.writeAsString("/mods/mod1.zip", "zip")
    await f.writeAsString("/mods/mod2.tar.gz", "tar")
    await f.writeAsString("/mods/readme.txt", "txt")
    const p=new LocalProvider(f, "/mods")
    const list=await p.list()
    expect(list.length).toBe(2)
    expect(list[0].kind).toBe("local")
    const r=await p.fetch(list[0], "/dest/out.zip")
    expect(r.ok).toBe(true)
    expect(await f.exists("/dest/out.zip")).toBe(true)
  })
  it("GithubProvider list parses releases (mock fetch)", async()=>{
    const mockFetch=async()=> ({ ok:true, json: async()=> [{tag_name:"v1.2.3", assets:[{browser_download_url:"https://example.com/a.zip"}], zipball_url:"https://example.com/z.zip"}] }) as any
    const net={ fetch: mockFetch, download: async()=>{}} as any
    const f=new MemFiles() as any
    const p=new GithubProvider(net, f, "owner","repo")
    const list=await p.list()
    expect(list[0].version).toBe("1.2.3")
    expect(list[0].url).toBe("https://example.com/a.zip")
  })
})
