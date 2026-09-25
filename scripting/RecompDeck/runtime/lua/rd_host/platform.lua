-- rd_host/platform.lua
-- Web-runtime platform layer: adapts LÖVE services that behave badly inside a
-- browser tab and routes a small, audited set of native services to the
-- Scripting host through rd_host.bridge.
--
--   love.timer.sleep   never blocks. love.js has no asyncify, so SDL_Delay is
--                      a busy-wait on the main thread (freezes audio, input
--                      and burns battery). Sleep becomes cooperative: it
--                      advances love.timer.getTime() for the rest of the
--                      current frame (so the game's pacing loop exits at once)
--                      and the requested wake time is handed to the player,
--                      which skips requestAnimationFrame callbacks until then.
--   love.system.vibrate  -> host haptics (duration mapped to intensity)
--   love.system.openURL  -> host (https only, validated again on the host)
--   os.exit              -> host "quit" (never tears down the wasm runtime)
--
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Part of RecompDeck. Contains no code from the gen1recomp project.

local bridge = require("rd_host.bridge")

local M = { virtualSleep = 0, installed = false }

function M.beginFrame()
  M.virtualSleep = 0
  M.firstSleepAt = nil
end

-- Seconds from now until the game asked to run its next frame (its frame cap
-- expressed through love.timer.sleep). The player skips requestAnimationFrame
-- callbacks until then, so the cap is honoured with real time passing and no
-- busy-wait (see "cooperative pacing" in docs/performance.md).
function M.wakeDelay()
  if not M.firstSleepAt or not M.realGetTime then return 0 end
  return (M.firstSleepAt + M.virtualSleep) - M.realGetTime()
end

function M.install(opts)
  if M.installed then return end
  M.installed = true
  opts = opts or {}

  -- virtual sleep -------------------------------------------------------
  if love.timer then
    local realGetTime = love.timer.getTime
    M.realGetTime = realGetTime
    love.timer.getTime = function()
      return realGetTime() + M.virtualSleep
    end
    love.timer.sleep = function(s)
      s = tonumber(s) or 0
      if s <= 0 then return end
      if s > 2 then s = 2 end
      if not M.firstSleepAt then M.firstSleepAt = realGetTime() end
      M.virtualSleep = M.virtualSleep + s
    end
  end

  -- operating system name ------------------------------------------------
  -- The game only offers its touch overlay, mobile layout and touch/mouse
  -- twin filtering on "Android"/"iOS". The web runtime runs on iOS, and
  -- SDL/Emscripten synthesizes mouse twins for touches exactly like the
  -- iOS LÖVE build, so reporting "iOS" selects the matching code paths.
  if love.system and type(opts.os) == "string" and opts.os ~= "" then
    local realGetOS = love.system.getOS
    love.system.getRealOS = realGetOS
    local reported = opts.os
    love.system.getOS = function() return reported end
  end

  -- vsync ---------------------------------------------------------------
  -- In love.js a swap interval of 0 switches Emscripten's main loop from
  -- requestAnimationFrame to setTimeout(0): an uncapped loop that burns CPU
  -- and battery (the game's own software cap relies on sleep, which never
  -- blocks here). The game silences vsync on iOS when its present-sync probe
  -- fails -- which it always does in a browser. So the real interval stays 1
  -- (rAF, paced by the player's frame cap) while the game keeps seeing the
  -- value it asked for, so its own bookkeeping stays consistent.
  if love.window and love.window.setVSync then
    local realSet, realGet = love.window.setVSync, love.window.getVSync
    local requested = (realGet and realGet()) or 1
    M.vsyncRequested = requested
    love.window.setVSync = function(v)
      requested = tonumber(v) or 1
      M.vsyncRequested = requested
      if realGet and realGet() ~= 1 then realSet(1) end
    end
    if realGet then
      love.window.getVSync = function() return requested end
    end
    for _, fname in ipairs({ "setMode", "updateMode" }) do
      local f = love.window[fname]
      if f then
        love.window[fname] = function(w, h, flags, ...)
          if type(flags) == "table" and flags.vsync ~= nil then
            requested = tonumber(flags.vsync) or (flags.vsync and 1 or 0)
            M.vsyncRequested = requested
            local copy = {}
            for k, v in pairs(flags) do copy[k] = v end
            copy.vsync = 1
            flags = copy
          end
          return f(w, h, flags, ...)
        end
      end
    end
    if love.window.getMode then
      local getMode = love.window.getMode
      love.window.getMode = function()
        local w, h, flags = getMode()
        if type(flags) == "table" then flags.vsync = requested end
        return w, h, flags
      end
    end
  end

  -- haptics -------------------------------------------------------------
  if love.system then
    love.system.vibrate = function(seconds)
      seconds = tonumber(seconds) or 0.5
      if seconds <= 0 then return end
      local style = (seconds < 0.02 and "light") or (seconds < 0.05 and "medium") or "heavy"
      bridge.notify("haptic", { style = style, seconds = seconds })
    end

    -- external links ----------------------------------------------------
    love.system.openURL = function(url)
      if type(url) ~= "string" or not url:match("^https://[%w%.%-]+[/%?#]?") or #url > 2048 then
        bridge.log("warn", "openURL refused: " .. tostring(url))
        return false
      end
      local ok = bridge.call("openURL", { url = url })
      return ok and true or false
    end
  end

  -- process exit ---------------------------------------------------------
  local realExit = os.exit
  os.exit = function(code)
    bridge.notify("quit", { code = tonumber(code) or 0 })
    -- keep the runtime alive; the host dismisses the player
    if opts.allowRealExit then realExit(code) end
  end
end

return M
