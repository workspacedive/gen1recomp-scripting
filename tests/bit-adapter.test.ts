import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { lua, lauxlib, lualib, to_luastring } = require('fengari')

test('pure-Lua bit adapter satisfies StreamMD5 and shift semantics', async () => {
  const adapter = await readFile(new URL('../scripting/Gen1Recomp/runtime/adapter/normalize1.lua', import.meta.url), 'utf8')
  const streamMd5 = await readFile(new URL('./fixtures/StreamMD5.lua', import.meta.url), 'utf8')
  const marker = '-- Gen1Recomp host adapter:'
  const shim = adapter.slice(adapter.indexOf(marker))
  const script = `local nativeRequire = require
local diagnosticGame = {
  load = function() error("preserved root cause") end,
  draw = function() error("secondary draw failure") end,
}
require = function(name)
  if name == "src.core.Game" then return diagnosticGame end
  return nativeRequire(name)
end
${shim}\nlocal MD5 = (function()\n${streamMd5}\nend)()\n
local vectors = {
  {"", "d41d8cd98f00b204e9800998ecf8427e"},
  {"abc", "900150983cd24fb0d6963f7d28e17f72"},
  {"message digest", "f96b697d7cb7938d525a2f31aaf161d0"},
}
for _, vector in ipairs(vectors) do
  assert(MD5.new():update(vector[1]):final() == vector[2])
end
assert(bit.band(0xffffffff, 0xff) == 255)
assert(bit.bor(0x80000000, 1) == -2147483647)
assert(bit.bxor(1, 2, 4, 8) == 15)
assert(bit.bnot(0) == -1)
assert(bit.lshift(1, 31) == -2147483648)
assert(bit.lshift(1, 32) == 0)
assert(bit.lshift(2, -1) == 1)
assert(bit.rshift(-1, 1) == 2147483647)
assert(bit.arshift(-2, 1) == -1)
assert(bit.arshift(-2, 32) == -1)
assert(bit.rol(0x12345678, 8) == 0x34567812)
assert(bit.tobit(0xffffffff) == -1)
assert(bit32.bnot(0) == 4294967295)
local game = require("src.core.Game")
local loaded, loadError = pcall(game.load, game)
assert(not loaded and loadError:match("preserved root cause"))
local drawn, drawError = pcall(game.draw, game)
assert(not drawn and drawError:match("game boot failed before the first draw"))
assert(drawError:match("preserved root cause"))
`

  const state = lauxlib.luaL_newstate()
  lualib.luaL_openlibs(state)
  const status = lauxlib.luaL_dostring(state, to_luastring(script))
  if (status !== lua.LUA_OK) {
    assert.fail(lua.lua_tojsstring(state, -1))
  }
  lua.lua_close(state)
})
