-- tests/lua/run_main.lua
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Interpreter shim: `lua5.1 run_main.lua script.lua args...` runs script.lua
-- through the compat loadfile (so the MAIN chunk gets the escape transform
-- too) and rebuilds `arg` exactly like the standalone interpreter would.
-- Used via tools/lua51compat so suites that spawn `arg[-1] <suite>` stay on
-- the compat path.
local script = assert(arg[1], "usage: run_main.lua script.lua [args]")
local newarg = { [-1] = os.getenv("RD_LUA_WRAPPER") or arg[-1], [0] = script }
for i = 2, #arg do newarg[i - 1] = arg[i] end
arg = newarg
local chunk = assert(loadfile(script))
return chunk(unpack(newarg))
