-- tests/lua/prelude_lua51.lua
-- LUA_INIT prelude: runs the upstream gen1recomp test tiers on PUC Lua 5.1
-- with the RecompDeck compatibility layer, i.e. the same VM + shims the game
-- gets inside love.js. Usage (from a gen1recomp checkout):
--   RD_ROOT=/path/to/gen1recomp-scripting \
--   LUA_INIT=@$RD_ROOT/tests/lua/prelude_lua51.lua lua5.1 tests/run_engine.lua
local root = os.getenv("RD_ROOT") or "."
package.path = root .. "/scripting/RecompDeck/runtime/lua/?.lua;" .. package.path
local compat = require("rd_host.compat")
compat.installSearcher("file")
RD_COMPAT = compat
