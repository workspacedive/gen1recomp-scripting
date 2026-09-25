-- rd_host/modapi.lua
-- The ONLY rd_host module a mod may require, and only the RecompDeck platform
-- bridge mod (id "recompdeck_bridge") -- enforced by rd_host.guard.
--
-- It exposes the minimum the official process-lifecycle hooks need
-- (docs/modding.md "Process-lifecycle hooks" in gen1recomp):
--   quitToLauncher()  tell the native launcher the player chose "exit"
--   paused()          true while a native sheet covers the game
--   onFrame()         per-frame bookkeeping (bridge poll is done by boot)
--
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Part of RecompDeck. Contains no code from the gen1recomp project.

local bridge = require("rd_host.bridge")

local state = { paused = false, quitRequested = false }

bridge.on("pause", function() state.paused = true end)
bridge.on("resume", function() state.paused = false end)

local api = {}

function api.quitToLauncher()
  if state.quitRequested then return end
  state.quitRequested = true
  bridge.notify("quitToLauncher", {})
end

function api.paused()
  return state.paused
end

function api.version()
  return "1.0.0"
end

return api
