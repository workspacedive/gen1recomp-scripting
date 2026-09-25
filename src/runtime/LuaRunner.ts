/**
 * LuaRunner — fengari (Lua 5.3 in JS) wrapper for Scripting iOS
 * VERIFIZIERT gegen fengari 0.1.4 + fengari-interop 0.1.0 (mit Node tests)
 * Non-Pro, pure JS, kein WASM. Lädt LuaWriter-generierte `return {}` Tabellen
 * und konvertiert sie nach JS-Objekten (deep).
 *
 * Performance: Pen STATE per load (~1ms). Für Warm-Start <500ms Ziel ist das ok.
 * GC: fengari nutzt JS GC, kein manueller lua_close nötig außer bei long-lived states.
 */

// Lazy fengari loading — top-level bare import would break Scripting when fengari not bundled.
// Stattdessen sync require via globalThis/ eval, damit Node tests weiter fengari nutzen,
// Scripting aber via JSON-Sidecar ohne fengari auskommt (DataLoader bevorzugt JSON).
let _fengari: any = null
let _interop: any = null
let _loadAttempted = false
function ensureFengari() {
  if (_loadAttempted) return _fengari !== null
  _loadAttempted = true
  try {
    // Node: try require
    // @ts-ignore
    const req = typeof require !== "undefined" ? require : (typeof (globalThis as any).require !== "undefined" ? (globalThis as any).require : null)
    if (req) {
      _fengari = req("fengari")
      try { _interop = req("fengari-interop") } catch {}
      return _fengari !== null
    }
  } catch {}
  try {
    // Fallback via eval trick (some JS cores expose require as global)
    const req2: any = (0, eval)("typeof require !== 'undefined' ? require : null")
    if (req2) {
      _fengari = req2("fengari")
      try { _interop = req2("fengari-interop") } catch {}
      return true
    }
  } catch {}
  // Not available (Scripting without bundled fengari) — ok, DataLoader uses JSON
  return false
}
function getLua(): any { ensureFengari(); return _fengari?.lua }
function getLauxlib(): any { ensureFengari(); return _fengari?.lauxlib }
function getLualib(): any { ensureFengari(); return _fengari?.lualib }
function getToLuaString(): any { ensureFengari(); return _fengari?.to_luastring ?? _fengari?.default?.to_luastring ?? ((s:string)=> s) }
function getInterop(): any { ensureFengari(); return _interop?.default ?? _interop }

export type LuaValue = any

export class LuaRunner {
  private L: any
  private lua: any
  private lauxlib: any
  private lualib: any
  private to_luastring: any
  private interop: any

  constructor() {
    if (!ensureFengari()) throw new Error("fengari not available (Scripting: use JSON sidecar; Node: npm install fengari)")
    this.lua = getLua()
    this.lauxlib = getLauxlib()
    this.lualib = getLualib()
    this.to_luastring = getToLuaString()
    this.interop = getInterop()
    this.L = this.lauxlib.luaL_newstate()
    this.lualib.luaL_openlibs(this.L)
    // load js lib so Lua can callback to JS if needed (optional)
    try { this.lauxlib.luaL_requiref(this.L, "js", this.interop.luaopen_js, 0); this.lua.lua_pop(this.L, 1) } catch {}
  }

  close() {
    try { this.lua.lua_close(this.L) } catch {}
  }

  /**
   * Load Lua code that returns a value (e.g. `return {a=1}`) and return JS representation.
   * Throws on syntax/runtime error.
   */
  loadReturn(luaCode: string): any {
    const L = this.L
    const lua = this.lua, lauxlib = this.lauxlib
    // Fengari expects Uint8Array via to_luastring
    const str = typeof this.to_luastring === "function" ? this.to_luastring(luaCode) : luaCode
    const status = lauxlib.luaL_loadstring(L, str)
    if (status !== lua.LUA_OK) {
      const err = lua.lua_tojsstring ? lua.lua_tojsstring(L, -1) : lua.lua_tostring(L, -1)
      lua.lua_pop(L, 1)
      throw new Error(`lua load error: ${String(err)}`)
    }
    const callStatus = lua.lua_pcall(L, 0, 1, 0)
    if (callStatus !== lua.LUA_OK) {
      const err = lua.lua_tojsstring ? lua.lua_tojsstring(L, -1) : lua.lua_tostring(L, -1)
      lua.lua_pop(L, 1)
      throw new Error(`lua runtime error: ${String(err)}`)
    }
    // Top of stack now has returned value
    const result = this.toJs(-1)
    lua.lua_pop(L, 1)
    return result
  }

  /**
   * Evaluate `return <luaCode>` shorthand.
   */
  evalExpression(expr: string): any {
    return this.loadReturn(`return ${expr}`)
  }

  /**
   * Convert Lua value at idx to JS deeply.
   * Uses fengari-interop.tojs if available, else manual traversal.
   */
  private toJs(idx: number): any {
    const L = this.L
    const interop = this.interop
    // Try interop.tojs first (handles tables, etc. via wrapper)
    try {
      if (interop?.tojs) {
        const v = interop.tojs(L, idx)
        // interop returns wrapper for tables — need to unwrap deeply
        // If wrapper has .get etc., we need to convert manually
        // For simple cases, check if v is primitive vs wrapper
        if (v === null || v === undefined || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v
        // Detect wrapper: has .get method
        if (v && typeof v.get === "function") {
          // Fall through to manual traverse for deep conversion
        } else {
          // If tojs already returned plain JS, use it
          // But to ensure deep copy, we still may need manual for tables
          // Quick test: if v is object without meta, return
          if (typeof v === "object" && !(v as any).get) return v
        }
      }
    } catch {}
    return this.manualToJs(idx)
  }

  private manualToJs(idx: number): any {
    const L = this.L
    const lua = this.lua, interop = this.interop
    const abs = lua.lua_absindex(L, idx)
    const type = lua.lua_type(L, abs)
    switch (type) {
      case lua.LUA_TNIL: return null
      case lua.LUA_TBOOLEAN: return !!lua.lua_toboolean(L, abs)
      case lua.LUA_TNUMBER: return lua.lua_tonumber(L, abs)
      case lua.LUA_TSTRING: {
        const s = lua.lua_tojsstring ? lua.lua_tojsstring(L, abs) : lua.lua_tostring(L, abs)
        return s
      }
      case lua.LUA_TTABLE: {
        // Check if array-like (1..n consecutive integers)
        // We iterate via lua_next
        const out: any = {}
        let isArray = true
        let max = 0
        let count = 0
        // First pass to collect keys
        lua.lua_pushnil(L)
        const entries: Array<[any, any]> = []
        while (lua.lua_next(L, abs) !== 0) {
          // key at -2, value at -1
          const key = this.manualToJs(-2)
          const val = this.manualToJs(-1)
          entries.push([key, val])
          lua.lua_pop(L, 1) // pop value, keep key
        }
        // Determine array nature
        for (const [k] of entries) {
          if (typeof k !== "number" || !Number.isInteger(k) || k < 1) { isArray = false; break }
          count++; max = Math.max(max, k)
        }
        if (isArray && count === max && max > 0) {
          const arr: any[] = new Array(max)
          for (const [k,v] of entries) arr[(k as number)-1] = v
          return arr
        } else {
          for (const [k,v] of entries) out[String(k)] = v
          return out
        }
      }
      default:
        // function/userdata/thread — return as JS wrapper via interop if possible
        try { return interop.tojs(L, abs) } catch { return null }
    }
  }

  // Convenience: load `data/generated/*.lua` code directly
  loadLuaFileContent(content: string): any {
    // content is already `return {...}` from LuaWriter
    return this.loadReturn(content)
  }
}
