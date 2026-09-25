-- RecompDeck bootstrap conf.lua (runs before the official conf.lua).
-- Mounts the unmodified gen1recomp archive and applies the Lua 5.1
-- compatibility layer; see rd_host/boot.lua.
-- SPDX-License-Identifier: GPL-3.0-or-later
require("rd_host.boot").confStage()
