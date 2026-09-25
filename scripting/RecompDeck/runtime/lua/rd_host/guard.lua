-- rd_host/guard.lua
-- Least-privilege boundary between third-party mods and the RecompDeck host.
--
-- gen1recomp's mod sandbox (src/mods/Sandbox.lua) forwards every require that
-- is not on its deny list to the real global require, which would let any mod
-- reach rd_host.bridge and talk to the native host. The sandbox looks up
-- _G.require at call time and marks the calling mod in Runtime.modRequire, so
-- wrapping _G.require here closes that path without touching the game:
--
--   * engine code (Runtime.modRequire == nil)       -> unrestricted
--   * any mod asking for "rd_host.*"                -> error
--   * except "rd_host.modapi" for BRIDGE_MOD_ID      -> allowed
--
-- The host additionally validates every bridge message (defense in depth).
--
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Part of RecompDeck. Contains no code from the gen1recomp project.

local M = { BRIDGE_MOD_ID = "recompdeck_bridge", installed = false, denied = 0 }

function M.install()
  if M.installed then return end
  M.installed = true
  local realRequire = require
  local loaded = package.loaded
  _G.require = function(name, ...)
    if type(name) == "string" and name:sub(1, 8) == "rd_host." then
      local runtime = loaded["src.mods.Runtime"]
      local caller = runtime and runtime.modRequire
      if caller ~= nil and caller ~= false then
        if not (name == "rd_host.modapi" and caller == M.BRIDGE_MOD_ID) then
          M.denied = M.denied + 1
          error(("module '%s' is not available to mods"):format(name), 2)
        end
      end
    end
    return realRequire(name, ...)
  end
end

return M
