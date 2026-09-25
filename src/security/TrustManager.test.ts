import { describe, it, expect } from "vitest"
import { TrustManager } from "./TrustManager"

function memStore(){
  const m=new Map<string,any>()
  return { get:(k:string)=> m.get(k)??null, set:(k:string,v:any)=>{m.set(k,v); return true}, getData:()=>null, setData:()=>{}, remove:(k:string)=>m.delete(k), contains:(k:string)=>m.has(k), keys:()=>[...m.keys()], clear:()=>m.clear(), _m:m } as any
}
function memFiles(){
  return { documentsDirectory:"/docs", temporaryDirectory:"/tmp", appGroupDocumentsDirectory:"/g", isiCloudEnabled:false,
    exists:async()=>false, existsSync:()=>false, isFile:async()=>false, isDirectory:async()=>false, isLink:async()=>false,
    createDirectory:async()=>{}, readDirectory:async()=>[], readAsString:async()=>"", readAsStringSync:()=>"", readAsBytes:async()=>new Uint8Array(), readAsBytesSync:()=>new Uint8Array(),
    readAsData:async()=>null, writeAsString:async()=>{}, writeAsStringSync:()=>{}, writeAsBytes:async()=>{}, writeAsBytesSync:()=>{}, writeAsData:async()=>{}, copyFile:async()=>{}, copyFileSync:()=>{}, remove:async()=>{}, bookmarkedPath:()=>null } as any
}

describe("TrustManager — Hash, Allowlist/Blocklist/Revocation, Provenance, Voxel Guard (§42)", ()=>{
  it("allow/block/revoke + trustLevel deny wins", ()=>{
    const tm=new TrustManager(memFiles(), memStore())
    tm.allow("abc")
    expect(tm.trustLevel("abc")).toBe("allow")
    tm.block("abc")
    expect(tm.trustLevel("abc")).toBe("deny") // deny wins
    tm.allow("abc")
    expect(tm.trustLevel("abc")).toBe("allow") // allow clears block
    tm.revoke("abc")
    expect(tm.trustLevel("abc")).toBe("deny")
    expect(tm.getRevoked()).toContain("abc")
  })
  it("verifyBytes sha256 + revoked blocked", async()=>{
    const tm=new TrustManager(memFiles(), memStore())
    const bytes=new TextEncoder().encode("hello")
    const digest=await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer)
    const hex=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("")
    // allow first
    tm.allow(hex)
    expect((await tm.verifyBytes(bytes, hex, "SHA-256")).ok).toBe(true)
    tm.revoke(hex)
    const r=await tm.verifyBytes(bytes, hex, "SHA-256")
    expect(r.ok).toBe(false)
    expect((r as any).error).toContain("revoked")
  })
  it("verifyBytes mismatch → false", async()=>{
    const tm=new TrustManager(memFiles(), memStore())
    const bytes=new TextEncoder().encode("hello")
    const r=await tm.verifyBytes(bytes, "deadbeef".repeat(8), "SHA-256")
    expect(r.ok).toBe(false)
  })
  it("provenance set/get", ()=>{
    const tm=new TrustManager(memFiles(), memStore())
    tm.setProvenance("voxel_world","authorA","abc123","github")
    const p=tm.getProvenance("voxel_world")
    expect(p?.owner).toBe("authorA")
    expect(p?.hash).toBe("abc123")
  })
  it("canImport checks revoked + size limits (voxel)", ()=>{
    const tm=new TrustManager(memFiles(), memStore())
    tm.revoke("dead")
    expect(tm.canImport("dead", 1000, {perFile:8*1024*1024, total:64*1024*1024, totalAfter:1000}).ok).toBe(false)
    expect(tm.canImport("good", 9*1024*1024, {perFile:8*1024*1024, total:64*1024*1024, totalAfter:1000}).ok).toBe(false)
    expect(tm.canImport("good", 1000, {perFile:8*1024*1024, total:64*1024*1024, totalAfter:70*1024*1024}).ok).toBe(false)
    expect(tm.canImport("good", 1000, {perFile:8*1024*1024, total:64*1024*1024, totalAfter:1000}).ok).toBe(true)
  })
})
