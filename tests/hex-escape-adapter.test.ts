import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { lua, lauxlib, lualib, to_luastring } = require('fengari')

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
local transitionFixture = [=[
local M = {}
function M.new(game, done)
  return { wipeLen = 60, def = {}, style = "circle", finish = done }
end
return M
]=]
_lfs_getInfo = function(path, kind)
  if kind == "file" and (path == "src/ui/ListMenu.lua"
      or path == "src/render/BattleTransition.lua") then return { type = "file" } end
end
_lfs_read = function(path)
  if path == "src/ui/ListMenu.lua" then return fixture end
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
local transition = assert(package.loaders[2]("src.render.BattleTransition"))()
local state = transition.new({}, function() end, {})
now = 2.25
state.finish()
assert(lines[1]:match("phase=battle%.transition"))
assert(lines[1]:match("style=circle"))
assert(lines[1]:match("ms=2250%.000"))
`
  const state = lauxlib.luaL_newstate()
  lualib.luaL_openlibs(state)
  const status = lauxlib.luaL_dostring(state, to_luastring(script))
  if (status !== lua.LUA_OK) assert.fail(lua.lua_tojsstring(state, -1))
  lua.lua_close(state)
})
