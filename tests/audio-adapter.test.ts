import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { lua, lauxlib, lualib, to_luastring } = require('fengari')

test('normalize2 audio adapter validates the post-module QueueableSource contract', async () => {
  const adapter = await readFile(new URL('../scripting/Gen1Recomp/runtime/adapter/normalize2.lua', import.meta.url), 'utf8')
  const marker = '-- Gen1Recomp host adapter:'
  const shim = adapter.slice(adapter.lastIndexOf(marker))
  const script = `
local mode = "secondary-source"
local source = {
  setVolume = function() end,
  queue = function() end,
  getFreeBufferCount = function() return 1 end,
}
local nativeConstructor = function()
  if mode == "secondary-source" then return function() end, source end
  if mode == "valid-primary" then return source end
  return function() end
end
love = { audio = { newQueueableSource = nativeConstructor } }
${shim}
assert(love.audio.newQueueableSource ~= nativeConstructor)
assert(love.audio.newQueueableSource(44100, 16, 2, 32) == source)
mode = "valid-primary"
assert(love.audio.newQueueableSource(44100, 16, 2, 32) == source)
mode = "invalid"
local ok, message = pcall(love.audio.newQueueableSource, 44100, 16, 2, 32)
assert(not ok and message:match("returned %[function%] instead of Source"))
`
  const state = lauxlib.luaL_newstate()
  lualib.luaL_openlibs(state)
  const status = lauxlib.luaL_dostring(state, to_luastring(script))
  if (status !== lua.LUA_OK) assert.fail(lua.lua_tojsstring(state, -1))
  lua.lua_close(state)
})
