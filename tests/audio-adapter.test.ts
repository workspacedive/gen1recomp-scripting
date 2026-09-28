import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { lua, lauxlib, lualib, to_luastring } = require('fengari')

test('normalize2 returns a complete facade around the native QueueableSource', async () => {
  const adapter = await readFile(new URL('../scripting/Gen1Recomp/runtime/adapter/normalize2.lua', import.meta.url), 'utf8')
  const marker = '-- Gen1Recomp host adapter:'
  const shim = adapter.slice(adapter.lastIndexOf(marker))
  const script = `
local mode = "secondary-source"
local called = {}
local source
source = {
  setVolume = function(self) assert(self == source); called.setVolume = true end,
  queue = function(self) assert(self == source); called.queue = true end,
  getFreeBufferCount = function(self) assert(self == source); return 7 end,
  play = function(self) assert(self == source); called.play = true end,
  stop = function(self) assert(self == source); called.stop = true end,
  pause = function(self) assert(self == source); called.pause = true end,
  isPlaying = function(self) assert(self == source); return true end,
}
local nativeConstructor = function()
  if mode == "secondary-source" then return function() end, source end
  if mode == "valid-primary" then return source end
  return function() end
end
love = { audio = { newQueueableSource = nativeConstructor } }
${shim}
assert(love.audio.newQueueableSource ~= nativeConstructor)
local facade = love.audio.newQueueableSource(44100, 16, 2, 32)
assert(facade ~= source and facade.__hostNativeSource == source)
facade:setVolume(0.5); facade:queue({}); facade:play(); facade:stop(); facade:pause()
assert(called.setVolume and called.queue and called.play and called.stop and called.pause)
assert(facade:getFreeBufferCount() == 7 and facade:isPlaying() == true)
assert(facade:setLooping(true) == false)
assert(facade:setFilter({}) == false)
assert(facade:setPitch(2) == false)
mode = "valid-primary"
assert(love.audio.newQueueableSource(44100, 16, 2, 32).__hostNativeSource == source)
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
