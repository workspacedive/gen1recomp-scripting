-- tests/lua/lua51src_literals.lua
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Differential test for rd_host/lua51src.lua.
--
--   luajit tests/lua/lua51src_literals.lua orig  <files...>  > a.txt
--   lua5.1 tests/lua/lua51src_literals.lua xform <files...>  > b.txt
--   cmp a.txt b.txt
--
-- "orig":  every short-string literal of the ORIGINAL source is evaluated by
--          the running VM (LuaJIT understands \x, \u{}, \z natively).
-- "xform": the source is rewritten by lua51src.transform and every literal of
--          the REWRITTEN source is evaluated by PUC Lua 5.1.
-- Each literal is printed as hex, so the outputs must be byte-identical.
-- xform mode additionally asserts: the rewritten chunk compiles under 5.1 and
-- a second transform is a no-op (idempotence).

package.path = "scripting/RecompDeck/runtime/lua/?.lua;" .. package.path
local L = require("rd_host.lua51src")

local mode = arg[1]
local failures = 0
local function hex(s)
  return (s:gsub(".", function(c) return string.format("%02x", c:byte()) end))
end

for i = 2, #arg do
  local path = arg[i]
  local f = assert(io.open(path, "rb"))
  local src = f:read("*a")
  f:close()
  local text = src
  if mode == "xform" then
    local n
    text, n = L.transform(src)
    local chunk, err = loadstring(text, "@" .. path)
    if not chunk then
      io.stderr:write("COMPILE FAIL ", path, ": ", tostring(err), "\n")
      failures = failures + 1
    end
    local _, again = L.transform(text)
    if again ~= 0 then
      io.stderr:write("NOT IDEMPOTENT ", path, " (", again, " further rewrites)\n")
      failures = failures + 1
    end
    io.stderr:write(("%-60s rewrites=%d\n"):format(path, n))
  end
  local lits = L.literals(text)
  io.write("# ", path, " literals=", #lits, "\n")
  for j, tok in ipairs(lits) do
    local fn, err = loadstring("return " .. tok)
    if not fn then
      io.write(j, " EVAL-ERROR\n")
      io.stderr:write("EVAL FAIL ", path, " #", j, ": ", tostring(err), "\n")
      failures = failures + 1
    else
      io.write(j, " ", hex(fn()), "\n")
    end
  end
end
if failures > 0 then
  io.stderr:write(failures, " failure(s)\n")
  os.exit(1)
end
