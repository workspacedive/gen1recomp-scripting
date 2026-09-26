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
local clockValues, clockIndex = { 0 / 0, 4, 3, 5 }, 0
love = {
  timer = { getTime = function()
    clockIndex = clockIndex + 1
    return clockValues[clockIndex]
  end },
  graphics = { setColor = function() end, rectangle = function() end },
}
local nativeModernLoad = load
loadstring = function(source, chunkname) return nativeModernLoad(source, chunkname) end
setfenv = function(fn, environment)
  local index = 1
  while true do
    local name = debug.getupvalue(fn, index)
    if name == nil then break end
    if name == "_ENV" then debug.setupvalue(fn, index, environment); break end
    index = index + 1
  end
  return fn
end
local diagnosticGame = {
  load = function() error("preserved root cause") end,
  draw = function() error("secondary draw failure") end,
}
local chipResult = function() end
local diagnosticChipAudio = {
  playMusic = function() return chipResult end,
}
local diagnosticTheme = { PAL = {} }
for _, name in ipairs({ "railRed", "railBlue", "railGold", "railAmber",
  "railSilver", "railCrystal", "railFireRed", "railLeafGreen" }) do
  diagnosticTheme.PAL[name] = { 10, 20, 30 }
end
require = function(name)
  if name == "src.core.Game" then return diagnosticGame end
  if name == "src.core.ChipAudio" then return diagnosticChipAudio end
  if name == "src.ui.kit.Theme" then return diagnosticTheme end
  return nativeRequire(name)
end
${shim}\nlocal MD5 = (function()\n${streamMd5}\nend)()\n
local firstTime = love.timer.getTime()
assert(firstTime == firstTime and firstTime ~= math.huge and firstTime ~= -math.huge)
assert(love.timer.getTime() == 4)
assert(love.timer.getTime() == 4)
assert(love.timer.getTime() == 5)
local generated = assert(load("return answer", "@generated.lua", "t", { answer = 42 }))
assert(generated() == 42)
local deniedText, deniedMessage = load("return 1", "@generated.lua", "b", {})
assert(deniedText == nil and deniedMessage:match("text chunk"))
local pieces = { "return ", "value" }
local pieceIndex = 0
local fromReader = assert(load(function()
  pieceIndex = pieceIndex + 1
  return pieces[pieceIndex]
end, "@reader.lua", "t", { value = 73 }))
assert(fromReader() == 73)
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
local chipAudio = require("src.core.ChipAudio")
assert(chipAudio.__hostSourceContract == true)
local audioOk, audioError = pcall(chipAudio.playMusic)
assert(not audioOk and audioError:match("ChipAudio%.playMusic returned function instead of Source"))
local forwarded = {}
chipResult = {
  setVolume = function(self) assert(self == chipResult); forwarded.setVolume = true end,
  queue = function(self) assert(self == chipResult); forwarded.queue = true end,
  getFreeBufferCount = function(self) assert(self == chipResult); return 1 end,
  play = function(self) assert(self == chipResult); forwarded.play = true end,
  stop = function(self) assert(self == chipResult); forwarded.stop = true end,
  pause = function(self) assert(self == chipResult); forwarded.pause = true end,
  isPlaying = function(self) assert(self == chipResult); return false end,
}
local facade = chipAudio.playMusic()
assert(facade ~= chipResult and facade.__hostNativeSource == chipResult)
facade:setVolume(0.5); facade:queue({}); facade:play(); facade:stop(); facade:pause()
assert(forwarded.setVolume and forwarded.queue and forwarded.play
  and forwarded.stop and forwarded.pause)
assert(facade:getFreeBufferCount() == 1 and facade:isPlaying() == false)
assert(type(facade.setLooping) == "function" and facade:setLooping() == false)
assert(type(facade.setFilter) == "function" and facade:setFilter() == false)
assert(type(facade.setPitch) == "function" and facade:setPitch() == false)
local theme = require("src.ui.kit.Theme")
assert(theme.__hostRailCompatibility == true)
assert(pcall(theme.versionRail, 0, 0, 4, 1))
`

  const state = lauxlib.luaL_newstate()
  lualib.luaL_openlibs(state)
  const status = lauxlib.luaL_dostring(state, to_luastring(script))
  if (status !== lua.LUA_OK) {
    assert.fail(lua.lua_tojsstring(state, -1))
  }
  lua.lua_close(state)
})
