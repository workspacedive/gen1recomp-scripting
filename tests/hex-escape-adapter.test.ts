import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { lua, lauxlib, lualib, to_luastring } = require('fengari')

test('dynamic mod source retries only proven LuaJIT syntax boundaries', async () => {
  const adapter = await readFile(new URL('../scripting/Gen1Recomp/runtime/adapter/normalize1.lua', import.meta.url), 'utf8')
  const start = adapter.indexOf('-- Gen1Recomp host adapter: love.js embeds Lua 5.1')
  const end = adapter.indexOf('-- Gen1Recomp source uses Lua 5.2 hexadecimal string escapes', start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const shim = adapter.slice(start, end)
  assert.match(shim, /not fn and not binary and candidate:match\(jitIntegerPattern\)/)
  assert.doesNotMatch(shim, /message\):match\([^\n]*[Ll][Ll]/)
  const script = `
loadstring = load
setfenv = function(fn) return fn end
${shim}
local bom = string.char(239, 187, 191)
assert(assert(loadstring(bom .. "return 17"))() == 17, "UTF-8 BOM retry")
assert(assert(loadstring("return 0x7fffffffffffffffLL"))() ~= nil, "LuaJIT LL retry")
assert(assert(loadstring("return 0x0001000000000000ULL"))() ~= nil, "LuaJIT ULL retry")
local invalid, message = loadstring("return )")
assert(invalid == nil and type(message) == "string", "unrelated syntax stays rejected")
`
  const state = lauxlib.luaL_newstate()
  lualib.luaL_openlibs(state)
  const status = lauxlib.luaL_dostring(state, to_luastring(script))
  if (status !== lua.LUA_OK) assert.fail(lua.lua_tojsstring(state, -1))
  lua.lua_close(state)
})

test('unsupported Canvas formats fail in Lua before love.js native alert handling', async () => {
  const adapter = await readFile(new URL('../scripting/Gen1Recomp/runtime/adapter/normalize1.lua', import.meta.url), 'utf8')
  const start = adapter.indexOf('-- Preserve shader compiler diagnostics')
  assert.notEqual(start, -1)
  const shim = adapter.slice(start)
  const script = `
local canvasCalls, lines, shaderFxDeactivated = 0, {}, false
print = function(line) lines[#lines + 1] = line end
package.preload["src.render.ShaderFX"] = function()
  return { deactivate = function() shaderFxDeactivated = true end }
end
love = { graphics = {
  -- Reproduce pinned love.js: it reports readable depth24 as supported even
  -- though native newCanvas raises the fatal browser alert for that request.
  getCanvasFormats = function()
    return { depth24 = true, rgba8 = true }
  end,
  newCanvas = function(...) canvasCalls = canvasCalls + 1 return { args = {...} } end,
  newShader = function(source)
    if source == "bad" then error("shader compiler fixture") end
    return { source = source }
  end,
} }
${shim}
local ok, message = pcall(love.graphics.newCanvas, 64, 64,
  { format = "depth24", readable = true })
assert(not ok and message:match("depth24 readable Canvas format"), "unsupported format is a Lua error")
assert(canvasCalls == 0, "unsupported readable format never enters native newCanvas")
assert(love.graphics.newCanvas(64, 64, { format = "depth24", readable = false }))
assert(canvasCalls == 1, "same non-readable depth format reaches native newCanvas")
assert(love.graphics.newCanvas(64, 64, { format = "rgba8" }))
assert(canvasCalls == 2, "supported format reaches native newCanvas")
assert(love.graphics.newCanvas(64, 64))
assert(canvasCalls == 3, "default Canvas reaches native newCanvas")
local shaderOK, shaderMessage = pcall(love.graphics.newShader, "bad")
assert(not shaderOK and shaderMessage:match("shader compiler fixture"), "shader failure is preserved")
local GBCFX = require("src.render.GBCFX")
assert(GBCFX.setLevel(0) == 0 and shaderFxDeactivated,
  "removed GBCFX clear maps narrowly to ShaderFX deactivate")
assert(#lines == 2, "bounded graphics diagnostics cover Canvas and shader failures")
`
  const state = lauxlib.luaL_newstate()
  lualib.luaL_openlibs(state)
  const status = lauxlib.luaL_dostring(state, to_luastring(script))
  if (status !== lua.LUA_OK) assert.fail(lua.lua_tojsstring(state, -1))
  lua.lua_close(state)
})

test('Lua 5.2 hexadecimal escapes are normalized before Gen1Recomp modules compile', async () => {
  const adapter = await readFile(new URL('../scripting/Gen1Recomp/runtime/adapter/normalize1.lua', import.meta.url), 'utf8')
  const start = adapter.indexOf('-- Gen1Recomp source uses Lua 5.2 hexadecimal string escapes')
  const end = adapter.indexOf('-- A device-observed Launcher rail failure', start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const shim = adapter.slice(start, end)
  const script = `
loadstring = loadstring or load
local fixture = [=[return "\\xc3\\x97", "\\\\xc3"]=]
local chipSynthFixture = [=[return { MUSIC_BUFFER_SAMPLES = 8192 }]=]
local legacyCompatFixture = [=[
return { new = function()
  return {
    globals = { package = { path = "", loaded = {}, loaders = {} } },
    love = {},
  }
end }
]=]
local transitionFixture = [=[
local M = {}
function M.new(game, done)
  return { game = game, wipeLen = 60, def = {}, style = "circle", finish = done }
end
function M.update(self)
  self.updates = (self.updates or 0) + 1
  if self.updates == 3 then self.finish() end
end
return M
]=]
_lfs_getInfo = function(path, kind)
  if kind == "file" and (path == "src/ui/ListMenu.lua"
      or path == "src/mods/LegacyCompat.lua"
      or path == "src/core/ChipSynth.lua"
      or path == "src/render/BattleTransition.lua") then return { type = "file" } end
end
_lfs_read = function(path)
  if path == "src/ui/ListMenu.lua" then return fixture end
  if path == "src/mods/LegacyCompat.lua" then return legacyCompatFixture end
  if path == "src/core/ChipSynth.lua" then return chipSynthFixture end
  if path == "src/render/BattleTransition.lua" then return transitionFixture end
end
local now, lines, nativeCanvasCalls = 0, {}, 0
love = {
  timer = { getTime = function() return now end },
  graphics = {
    newCanvas = function() nativeCanvasCalls = nativeCanvasCalls + 1 return {} end,
  },
}
print = function(line) lines[#lines + 1] = line end
package.loaders = { function() end, function() end }
${shim}
assert(#package.loaders == 3)
local chunk = assert(package.loaders[2]("src.ui.ListMenu"))
local times, escaped = chunk()
assert(times == string.char(195, 151), "normalized bytes")
assert(escaped == string.char(92) .. "xc3", "escaped literal")
local LegacyCompat = assert(package.loaders[2]("src.mods.LegacyCompat"))()
local compat = LegacyCompat.new()
local packageShim = compat.globals.package
assert(type(packageShim.config) == "string" and #packageShim.config > 0,
  "legacy package config")
assert(packageShim.loaded ~= package.loaded, "real module cache stays hidden")
local canvasOK, canvasMessage = pcall(compat.love.graphics.newCanvas, 32, 32,
  { format = "depth24", readable = true })
assert(not canvasOK and canvasMessage:match("readable Canvas format"),
  "legacy graphics boundary rejects readable depth")
assert(nativeCanvasCalls == 0, "legacy guard does not enter native newCanvas")
assert(compat.love.graphics.newCanvas(32, 32, { format = "depth24", readable = false }))
assert(nativeCanvasCalls == 1, "legacy guard preserves non-readable depth")
local chipSynth = assert(package.loaders[2]("src.core.ChipSynth"))()
assert(chipSynth.MUSIC_BUFFER_SAMPLES == 2048, "sync PCM work is frame-sized")
local transition = assert(package.loaders[2]("src.render.BattleTransition"))()
local game = { logicSpeed = function() return 1 end }
local state = transition.new(game, function() end, {})
now = 0.05
transition.update(state, 1 / 60)
assert(state.updates == 3, "wall-clock pacing advances three 60 Hz steps")
assert(#lines == 1 and lines[1]:match("legacy sandbox skipped"),
  "release adapter emits only the exercised graphics diagnostic")
`
  const state = lauxlib.luaL_newstate()
  lualib.luaL_openlibs(state)
  const status = lauxlib.luaL_dostring(state, to_luastring(script))
  if (status !== lua.LUA_OK) assert.fail(lua.lua_tojsstring(state, -1))
  lua.lua_close(state)
})
