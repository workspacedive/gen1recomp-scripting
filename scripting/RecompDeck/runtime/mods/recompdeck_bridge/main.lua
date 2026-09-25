-- RecompDeck platform bridge mod.
-- Uses only gen1recomp's documented process-lifecycle hooks
-- (docs/modding.md, "Process-lifecycle hooks"):
--   core.quit_to_launcher  veto the in-process Lua launcher: RecompDeck owns
--                          "return to launcher" natively
--   core.update            skip the simulation step while paused by the host
-- Outside RecompDeck the facade module does not exist and the mod stays inert.
-- SPDX-License-Identifier: GPL-3.0-or-later
return function(mod)
  local ok, api = pcall(require, "rd_host.modapi")
  if not ok or type(api) ~= "table" then return end

  mod.hooks:wrap("core.quit_to_launcher", function(next)
    api.quitToLauncher()
    return false
  end)

  mod.hooks:wrap("core.update", function(next, game, dt)
    if api.paused() then return end
    return next(game, dt)
  end)
end
