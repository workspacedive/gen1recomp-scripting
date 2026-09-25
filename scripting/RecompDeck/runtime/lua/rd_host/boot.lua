-- rd_host/boot.lua
-- Boot orchestration for the unmodified gen1recomp game archive on love.js.
--
-- Load order (LÖVE boot.lua):
--   1. LÖVE runs OUR conf.lua (the game source is /rd/host)       -> confStage()
--        * installs the Lua 5.1 compatibility layer (rd_host.compat)
--        * applies host-provided environment (os.getenv overlay) -- the game's
--          documented launch interface (POKEPORT_*), see docs/integration.md
--        * sets the identity and mounts the OFFICIAL, byte-identical game
--          archive (.rd/game.love in the save directory) ahead of /rd/host
--        * runs the official conf.lua and wraps love.conf for web settings
--   2. LÖVE requires "main": the compat searcher resolves it to the official
--      main.lua (the mounted archive shadows ours) and calls afterMain()
--      right after that chunk ran                                -> afterMain()
--        * platform shims (virtual sleep, haptics, openURL, os.exit)
--        * persistence hooks, error forwarding, frame wrapper
--   3. LÖVE calls love.run(): the official loop runs inside our wrapper.
--
-- Nothing in the game archive is modified, copied or redistributed.
--
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Part of RecompDeck. Contains no code from the gen1recomp project.

local json = require("rd_host.json")
local bridge = require("rd_host.bridge")

local M = {
  version = "1.0.0",
  launch = {},
  stage = "init",
  frames = 0,
  pollEvery = 4,       -- inbound bridge poll every N frames (~15 Hz at 60 fps)
}

local LAUNCH_PATH = "/rd/launch.json"

local function readLaunch()
  local f = io.open(LAUNCH_PATH, "rb")
  if not f then return {} end
  local s = f:read("*a")
  f:close()
  local cfg = json.decode(s)
  if type(cfg) ~= "table" then return {} end
  return cfg
end

-- Environment overlay: host values win, everything else falls through.
-- A value of false explicitly unsets a variable.
local function installEnv(env)
  local realGetenv = os.getenv
  os.getenv = function(k)
    local v = env[k]
    if v ~= nil and v ~= json.null then
      if v == false then return nil end
      return tostring(v)
    end
    return realGetenv(k)
  end
end

local function fail(msg)
  bridge.notify("error", { message = msg, stage = M.stage })
  error("RecompDeck: " .. msg, 0)
end

function M.confStage()
  M.stage = "conf"
  local launch = readLaunch()
  M.launch = launch
  bridge.enabled = launch.bridge ~= false

  local compat = require("rd_host.compat")
  M.compat = compat
  require("rd_host.guard").install()
  compat.installSearcher("love")
  compat.wrapLoveFilesystem()
  compat.onModuleLoaded = function(name, chunk)
    if name ~= "main" then return chunk end
    return function(...)
      M.beforeMain()
      local r = chunk(...)
      M.afterMain()
      return r
    end
  end
  -- filesystem firewall first, persistence hooks wrap the firewalled API
  require("rd_host.firewall").installEarly()

  installEnv(type(launch.env) == "table" and launch.env or {})

  local identity = launch.identity or "pokemon-love2d"
  M.identity = identity
  love.filesystem.setIdentity(identity)
  local archive = launch.archive or ".rd/game.love"
  if not love.filesystem.getInfo(archive, "file") then
    fail("game archive missing in save directory: " .. archive)
  end
  if not love.filesystem.mount(archive, "", false) then
    fail("could not mount game archive " .. archive)
  end

  require("rd_host.persist").install()

  local chunk, err = love.filesystem.load("conf.lua")
  if not chunk then fail("official conf.lua failed to load: " .. tostring(err)) end
  love.conf = nil
  chunk()
  local official = love.conf
  love.conf = function(t)
    if official then official(t) end
    M.adjustConf(t)
  end
  bridge.notify("stage", { stage = "conf", identity = identity, compat = compat.applied })
  if launch.selftest then require("rd_host.selftest").run("conf") end
end

-- Web-specific configuration on top of the official conf.lua.
function M.adjustConf(t)
  local L = M.launch
  local w = type(L.window) == "table" and L.window or {}
  -- love.js ships LÖVE 11.4; the 11.5 target is verified compatible by the
  -- upstream test tiers under this runtime (docs/compatibility.md), so the
  -- startup "Compatibility Warning" message box is suppressed.
  t.version = love._version
  t.identity = L.identity or t.identity
  t.window = t.window or {}
  if tonumber(w.width) then t.window.width = tonumber(w.width) end
  if tonumber(w.height) then t.window.height = tonumber(w.height) end
  t.window.resizable = true
  t.window.fullscreen = false
  t.window.borderless = true
  t.window.highdpi = w.highdpi == true
  t.window.vsync = 1
  t.window.minwidth = 1
  t.window.minheight = 1
  if tonumber(w.msaa) then t.window.msaa = tonumber(w.msaa) end
  t.modules = t.modules or {}
  -- the compat runtime has no pthreads; the game uses its synchronous paths
  t.modules.thread = false
  t.console = false
end

-- Runs right before the official main.lua chunk: game modules capture love.*
-- functions and query the OS while main.lua loads, so every shim must be in
-- place first.
function M.beforeMain()
  M.stage = "main"
  local platform = require("rd_host.platform")
  local persist = require("rd_host.persist")
  platform.install(M.launch.platform)
  persist.clock = platform.realGetTime or persist.clock
  require("rd_host.firewall").installLate()
  persist.installLate()
end

function M.afterMain()
  local platform = require("rd_host.platform")
  local persist = require("rd_host.persist")

  local officialErr = love.errorhandler or love.errhand
  love.errorhandler = function(msg)
    local text = tostring(msg)
    bridge.notify("error", { message = text, traceback = debug.traceback(text, 2), stage = M.stage })
    pcall(persist.flush, "error")
    if not officialErr then return nil end
    local loop = officialErr(msg)
    if type(loop) ~= "function" then return loop end
    return function(...)
      platform.beginFrame()
      local r = loop(...)
      local wake = platform.wakeDelay()
      if wake > 0.004 then bridge.notify("frame.wake", { s = wake }) end
      if r ~= nil then bridge.notify("quit", { code = r }) end
      return r
    end
  end

  if M.launch.selftest then require("rd_host.selftest").run("main") end

  local officialRun = love.run
  love.run = function()
    M.stage = "load"
    local frame = officialRun()
    M.stage = "running"
    bridge.notify("ready", {
      lua = _VERSION,
      love = love._version,
      compat = M.compat and M.compat.applied or {},
      rewrites = M.compat and M.compat.stats or {},
      firewall = require("rd_host.firewall").report(),
    })
    local perf = { n = 0, work = 0, max = 0, vsleep = 0, since = platform.realGetTime and platform.realGetTime() or 0 }
    M.perf = perf
    local clock = platform.realGetTime or love.timer.getTime
    return function()
      platform.beginFrame()
      M.frames = M.frames + 1
      if M.frames % M.pollEvery == 0 then bridge.poll() end
      local t0 = clock()
      local r = frame()
      local dt = clock() - t0
      perf.n = perf.n + 1
      perf.work = perf.work + dt
      if dt > perf.max then perf.max = dt end
      perf.vsleep = perf.vsleep + platform.virtualSleep
      if M.launch.perf and t0 - perf.since >= 2 then
        bridge.notify("perf", { frames = perf.n, avgMs = perf.work / perf.n * 1000, maxMs = perf.max * 1000, vsleepMs = perf.vsleep / perf.n * 1000 })
        perf.n, perf.work, perf.max, perf.vsleep, perf.since = 0, 0, 0, 0, t0
      end
      local wake = platform.wakeDelay()
      if wake > 0.004 then bridge.notify("frame.wake", { s = wake }) end
      persist.tick()
      if r ~= nil then
        pcall(persist.flush, "quit")
        bridge.notify("quit", { code = r })
      end
      return r
    end
  end

  bridge.on("persist.flush", function() persist.flush("host") end)
  bridge.on("persist.snapshot", function(d)
    local prefix = type(d) == "table" and type(d.prefix) == "string" and d.prefix or ""
    if prefix:find("..", 1, true) then return end
    persist.snapshot(prefix, "host-snapshot")
  end)
  bridge.on("ping", function(d) bridge.notify("pong", d) end)
  bridge.on("diagnostics", function()
    bridge.notify("diagnostics", {
      firewall = require("rd_host.firewall").report(),
      compat = M.compat and M.compat.stats or {},
      persist = persist.stats,
      frames = M.frames,
      memoryKB = collectgarbage("count"),
    })
  end)
  bridge.notify("stage", { stage = "main" })
end

return M
