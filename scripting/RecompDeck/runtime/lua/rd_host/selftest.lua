-- rd_host/selftest.lua
-- Runtime self-test of the primitives the game relies on, executed inside the
-- real love.js runtime (launch.selftest = true, or the Diagnostics screen).
-- Each probe is isolated with pcall and reported through the bridge, so a
-- failing probe never stops the others.
--
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Part of RecompDeck. Contains no code from the gen1recomp project.

local bridge = require("rd_host.bridge")

local M = {}

local function describe(ok, ...)
  local n = select("#", ...)
  local parts = { ok and "ok" or "ERR" }
  for i = 1, n do
    local v = select(i, ...)
    parts[#parts + 1] = type(v) == "string" and ("%q"):format(v:sub(1, 200)) or tostring(v)
  end
  return table.concat(parts, " ")
end

function M.run(stage)
  local results = {}
  local function probe(name, fn)
    results[#results + 1] = { name = name, result = describe(pcall(fn)) }
  end
  local lf = love.filesystem
  probe("fs.read(missing)", function() return lf.read("rd_selftest_missing.txt") end)
  probe("fs.read(missing) tail", function()
    local function readAt(rel) return lf.read(rel) end
    local function read(rel) return readAt(rel) end
    return read("rd_selftest_missing.txt")
  end)
  probe("fs.getInfo(missing)", function() return lf.getInfo("rd_selftest_missing.txt") end)
  probe("fs.write+read", function()
    assert(lf.write("rd_selftest.txt", "hello"))
    local s = lf.read("rd_selftest.txt")
    lf.remove("rd_selftest.txt")
    return s
  end)
  probe("fs.getSaveDirectory", function() return lf.getSaveDirectory() end)
  probe("fs.getSource", function() return lf.getSource() end)
  probe("fs.getRealDirectory(main.lua)", function() return lf.getRealDirectory("main.lua") end)
  probe("bit", function() local b = require("bit"); return b.band(0xF0F0, 0xFF), b.lshift(1, 31), b.tohex(-1) end)
  probe("load(env)", function() return load("return x", "=t", "t", { x = 42 })() end)
  probe("escape", function() return #loadstring('return "\\xc3\\xa9"')() end)
  probe("getOS", function() return love.system and love.system.getOS() end)
  probe("love.thread", function() return love.thread ~= nil end)
  probe("love.audio", function() return love.audio ~= nil and love.audio.getActiveSourceCount() end)
  probe("QueueableSource", function()
    if not love.audio then return "no audio" end
    local q = love.audio.newQueueableSource(44100, 16, 1, 4)
    return q:getFreeBufferCount()
  end)
  probe("graphics", function()
    if not love.graphics then return "no graphics (conf stage)" end
    local r = { love.graphics.getRendererInfo() }
    return table.concat(r, " | ")
  end)
  probe("shader", function()
    if not love.graphics then return "no graphics" end
    local sh = love.graphics.newShader("vec4 effect(vec4 c, Image t, vec2 uv, vec2 sc){ return Texel(t, uv) * c; }")
    return sh ~= nil
  end)
  bridge.notify("selftest", { stage = stage, results = results })
  return results
end

return M
