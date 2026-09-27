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
      or path == "src/core/ChipSynth.lua"
      or path == "src/render/BattleTransition.lua") then return { type = "file" } end
end
_lfs_read = function(path)
  if path == "src/ui/ListMenu.lua" then return fixture end
  if path == "src/core/ChipSynth.lua" then return chipSynthFixture end
  if path == "src/render/BattleTransition.lua" then return transitionFixture end
end
local now, lines = 0, {}
love = { timer = { getTime = function() return now end } }
print = function(line) lines[#lines + 1] = line end
package.loaders = { function() end, function() end }
${shim}
assert(#package.loaders == 3)
local chunk = assert(package.loaders[2]("src.ui.ListMenu"))
local times, escaped = chunk()
assert(times == string.char(195, 151), "normalized bytes")
assert(escaped == string.char(92) .. "xc3", "escaped literal")
local chipSynth = assert(package.loaders[2]("src.core.ChipSynth"))()
assert(chipSynth.MUSIC_BUFFER_SAMPLES == 2048, "sync PCM work is frame-sized")
local transition = assert(package.loaders[2]("src.render.BattleTransition"))()
local game = { logicSpeed = function() return 1 end }
local state = transition.new(game, function() end, {})
now = 0.05
transition.update(state, 1 / 60)
assert(state.updates == 3, "wall-clock pacing advances three 60 Hz steps")
assert(#lines == 0, "release adapter does not emit profile traffic")
`
  const state = lauxlib.luaL_newstate()
  lualib.luaL_openlibs(state)
  const status = lauxlib.luaL_dostring(state, to_luastring(script))
  if (status !== lua.LUA_OK) assert.fail(lua.lua_tojsstring(state, -1))
  lua.lua_close(state)
})
