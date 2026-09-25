import { describe, it, expect } from "vitest"
import { LuaRunner } from "./LuaRunner"
import { encodeLuaTable } from "../extract/RomExtractor"

describe("LuaRunner (fengari)", ()=>{
  it("lädt LuaWriter output roundtrip", ()=>{
    const data={ a:1, b:"hello", nested:{ x:[1,2,3], y:true }, arr:[10,20] }
    const lua=encodeLuaTable(data)
    expect(lua.startsWith("return {")).toBe(true)
    const runner=new LuaRunner()
    const parsed=runner.loadReturn(lua)
    expect(parsed).toEqual(expect.objectContaining({ a:1, b:"hello" }))
    expect(parsed.nested.x).toEqual([1,2,3])
    expect(parsed.arr).toEqual([10,20])
    runner.close()
  })
  it("evalExpression", ()=>{
    const r=new LuaRunner()
    expect(r.evalExpression("1+2")).toBe(3)
    expect(r.evalExpression("{10,20,30}")[1]).toBe(20)
    r.close()
  })
  it("konvertiert maps.lua Struktur (Gen1) grob", ()=>{
    const fakeMaps={ PALLET_TOWN:{ width:10, height:9, blocks:[0,1,2], warps:[{x:1,y:2}] } }
    const lua=encodeLuaTable(fakeMaps)
    const r=new LuaRunner()
    const out=r.loadReturn(lua)
    expect(out.PALLET_TOWN.width).toBe(10)
    expect(out.PALLET_TOWN.blocks[0]).toBe(0)
    r.close()
  })
})
