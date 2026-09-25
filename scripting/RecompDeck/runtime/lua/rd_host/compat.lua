-- rd_host/compat.lua
-- LuaJIT 2.1 / Lua 5.2 compatibility prelude for PUC Lua 5.1 (love.js).
--
-- The game targets LÖVE on LuaJIT. love.js (LÖVE compiled to WebAssembly) runs
-- PUC Lua 5.1.5 instead. This prelude closes every gap found by the static
-- audit (docs/compatibility.md) so the *unmodified* game runs:
--
--   gap                                    fix
--   -------------------------------------  --------------------------------------
--   no `bit` library (40 modules need it)   rd_host.bit, bit-exact vs LuaJIT
--   load(string, name, mode, env) (5.2)     5.2-style load incl. mode check + env
--   \xHH, \u{...}, \z string escapes        in-memory source transform on every
--                                           load path (require, load, loadstring,
--                                           loadfile, dofile, love.filesystem.load)
--   xpcall(f, h, ...) extra args            forwarded like LuaJIT
--   table.unpack / pack / move, rawlen      5.2/5.3 semantics
--   string.rep(s, n, sep)                   separator support
--   math.log(x, base)                       base support
--   coroutine.running() -> co, ismain       5.2 two-value form
--   coroutine.isyieldable()                 approximation (inside a coroutine)
--
-- Not fixable at runtime (documented): `goto`/labels (used only by the Gen 3
-- ROM importer), LuaJIT FFI (v0.3.14: 27 call sites in 20 files; 24 use
-- pcall(require, "ffi"), the other 3 run only on other OSes or after such a
-- guarded probe succeeded -- audit in docs/compatibility.md), JIT control.
--
-- Everything is a no-op on LuaJIT or Lua >= 5.2, so the same bootstrap can be
-- used by native test runs.
--
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Part of RecompDeck. Contains no code from the gen1recomp project.

local M = {
  version = "1.0.0",
  applied = {},
  stats = { transformedChunks = 0, rewrites = 0 },
}

local type, select, error, tostring, rawget = type, select, error, tostring, rawget
local byte, find, sub, gsub, gmatch, rep, format = string.byte, string.find,
  string.sub, string.gsub, string.gmatch, string.rep, string.format
local concat = table.concat

local function note(name) M.applied[#M.applied + 1] = name end

local isLuaJIT = type(rawget(_G, "jit")) == "table"
local is51 = _VERSION == "Lua 5.1"
M.active = is51 and not isLuaJIT

local lua51src = require("rd_host.lua51src")

-- Rewrite LuaJIT-only escapes. Binary chunks are passed through.
local function transformSource(s)
  if type(s) ~= "string" or byte(s, 1) == 27 then return s end
  local out, n = lua51src.transform(s)
  if n > 0 then
    M.stats.transformedChunks = M.stats.transformedChunks + 1
    M.stats.rewrites = M.stats.rewrites + n
  end
  return out
end
M.transformSource = transformSource

-- luaL_loadfile skips a leading "#" line but keeps the line count.
local function stripShebang(s)
  if byte(s, 1) == 35 then
    local e = find(s, "\n", 1, true)
    return e and ("\n" .. sub(s, e + 1)) or ""
  end
  return s
end

-- Safe no-op API when the prelude is loaded on LuaJIT or Lua >= 5.2.
function M.installSearcher() end
function M.wrapLoveFilesystem() end

if not M.active then return M end

local _loadstring, _setfenv = loadstring, setfenv
local unpack = unpack

------------------------------------------------------------------------------
-- 1. bit
------------------------------------------------------------------------------
if rawget(_G, "bit") == nil then
  local bitlib = require("rd_host.bit")
  package.loaded["bit"] = bitlib
  _G.bit = bitlib -- LuaJIT opens `bit` as a global standard library
  note("bit")
end

------------------------------------------------------------------------------
-- 2. load / loadstring / loadfile / dofile
------------------------------------------------------------------------------
local function modeError(s, mode)
  if mode == nil then return nil end
  if type(mode) ~= "string" then
    return "bad argument #3 to 'load' (string expected, got " .. type(mode) .. ")"
  end
  local binary = byte(s, 1) == 27
  if binary and not find(mode, "b", 1, true) then
    return format("attempt to load a binary chunk (mode is '%s')", mode)
  end
  if not binary and not find(mode, "t", 1, true) then
    return format("attempt to load a text chunk (mode is '%s')", mode)
  end
  return nil
end

local function load52(chunk, chunkname, mode, env)
  local s
  local t = type(chunk)
  if t == "string" then
    s = chunk
    if chunkname == nil then chunkname = chunk end
  elseif t == "function" then
    local parts = {}
    while true do
      local piece = chunk()
      if piece == nil or piece == "" then break end
      if type(piece) ~= "string" then
        return nil, "reader function must return a string"
      end
      parts[#parts + 1] = piece
    end
    s = concat(parts)
    if chunkname == nil then chunkname = "=(load)" end
  else
    error("bad argument #1 to 'load' (string expected, got " .. t .. ")", 2)
  end
  local merr = modeError(s, mode)
  if merr then return nil, merr end
  local f, err = _loadstring(transformSource(s), chunkname)
  if f and env ~= nil then _setfenv(f, env) end
  return f, err
end
_G.load = load52
note("load(string, name, mode, env)")

_G.loadstring = function(s, chunkname)
  if type(s) == "string" then
    return _loadstring(transformSource(s), chunkname or s)
  end
  return _loadstring(s, chunkname)
end
note("loadstring+escapes")

local function readAll(filename)
  if filename == nil then return io.read("*a") end
  local f, ferr = io.open(filename, "rb")
  if not f then return nil, "cannot open " .. tostring(ferr or filename) end
  local s = f:read("*a")
  f:close()
  return s
end

_G.loadfile = function(filename, mode, env)
  local s, err = readAll(filename)
  if not s then return nil, err end
  s = stripShebang(s)
  local merr = modeError(s, mode)
  if merr then return nil, merr end
  local name = filename and ("@" .. tostring(filename)) or "=stdin"
  local f, lerr = _loadstring(transformSource(s), name)
  if f and env ~= nil then _setfenv(f, env) end
  return f, lerr
end

_G.dofile = function(filename)
  local f, err = _G.loadfile(filename)
  if not f then error(err, 2) end
  return f()
end
note("loadfile/dofile+escapes")

------------------------------------------------------------------------------
-- 3. require: escape-transforming searcher (inserted at position 2)
------------------------------------------------------------------------------
local function compileModule(name, filename, s)
  local chunk, err = _loadstring(transformSource(stripShebang(s)), "@" .. filename)
  if not chunk then
    error(format("error loading module '%s' from file '%s':\n\t%s", name, filename, err), 0)
  end
  -- optional observer, e.g. rd_host.boot wraps the official "main" chunk
  local hook = M.onModuleLoaded
  if hook then chunk = hook(name, chunk) or chunk end
  return chunk
end

-- LÖVE game directories (source archive, mounted archives, save directory).
local function loveSearcher(name)
  local lf = rawget(_G, "love") and love.filesystem
  if not (lf and lf.read and lf.getInfo) then return nil end
  local fname = gsub(name, "%.", "/")
  local rpath = (lf.getRequirePath and lf.getRequirePath()) or "?.lua;?/init.lua"
  for template in gmatch(rpath, "[^;]+") do
    local filename = gsub(template, "%?", fname)
    local info = lf.getInfo(filename, "file")
    if info then
      local s, rerr = lf.read(filename)
      if not s then
        error(format("error loading module '%s' from file '%s':\n\t%s", name, filename, tostring(rerr)), 0)
      end
      return compileModule(name, filename, s)
    end
  end
  return "\n\tno '" .. name .. "' in LOVE game directories (rd_host)"
end

-- Plain files via package.path (standalone test runs).
local function fileSearcher(name)
  local fname = gsub(name, "%.", "/")
  local tried = {}
  for template in gmatch(package.path, "[^;]+") do
    local filename = gsub(template, "%?", fname)
    local f = io.open(filename, "rb")
    if f then
      local s = f:read("*a")
      f:close()
      return compileModule(name, filename, s)
    end
    tried[#tried + 1] = "\n\tno file '" .. filename .. "'"
  end
  return concat(tried)
end

-- mode: "love" (love.js) or "file" (standalone interpreter). Chosen by the
-- caller; defaults to "love" when love.filesystem exists.
function M.installSearcher(mode)
  if M._searcherInstalled then return end
  local loaders = package.loaders
  if mode == nil then
    mode = (rawget(_G, "love") and love.filesystem and love.filesystem.read) and "love" or "file"
  end
  local searcher = (mode == "love") and loveSearcher or fileSearcher
  table.insert(loaders, 2, searcher)
  M._searcherInstalled = mode
  note("require searcher (" .. mode .. ")")
end

-- love.filesystem.load(path) must see the same transform.
function M.wrapLoveFilesystem()
  local lf = rawget(_G, "love") and love.filesystem
  if not lf or M._loveWrapped then return end
  local origLoad = lf.load
  if origLoad then
    lf.load = function(path, ...)
      if type(path) ~= "string" or not lf.getInfo(path, "file") then
        -- never enter the C++ loader for a missing file (love.js: C++
        -- exceptions are not catchable, see rd_host/firewall.lua)
        return nil, ("Could not open file %s. Does not exist."):format(tostring(path))
      end
      local s = lf.read(path)
      if type(s) ~= "string" then return origLoad(path, ...) end
      return _loadstring(transformSource(stripShebang(s)), "@" .. tostring(path))
    end
  end
  M._loveWrapped = true
  note("love.filesystem.load+escapes")
end

------------------------------------------------------------------------------
-- 4. xpcall with extra arguments
------------------------------------------------------------------------------
do
  local _xpcall = xpcall
  _G.xpcall = function(f, msgh, ...)
    local n = select("#", ...)
    if n == 0 then return _xpcall(f, msgh) end
    local args = { ... }
    return _xpcall(function() return f(unpack(args, 1, n)) end, msgh)
  end
  note("xpcall(f, h, ...)")
end

------------------------------------------------------------------------------
-- 5. table / string / math / rawlen / coroutine
------------------------------------------------------------------------------
if table.unpack == nil then table.unpack = unpack; note("table.unpack") end

if table.pack == nil then
  table.pack = function(...) return { n = select("#", ...), ... } end
  note("table.pack")
end

if table.move == nil then
  table.move = function(a1, f, e, t, a2)
    a2 = a2 or a1
    if e >= f then
      if t > e or t <= f or a1 ~= a2 then
        for i = 0, e - f do a2[t + i] = a1[f + i] end
      else
        for i = e - f, 0, -1 do a2[t + i] = a1[f + i] end
      end
    end
    return a2
  end
  note("table.move")
end

if rawget(_G, "rawlen") == nil then
  _G.rawlen = function(v)
    local t = type(v)
    if t ~= "table" and t ~= "string" then
      error("table or string expected", 2)
    end
    return #v -- 5.1's # on tables ignores __len, on strings is raw
  end
  note("rawlen")
end

do
  local _rep = string.rep
  string.rep = function(s, n, sep)
    if sep == nil or sep == "" or n <= 1 then return _rep(s, n) end
    return _rep(s .. sep, n - 1) .. s
  end
  note("string.rep(s, n, sep)")
end

do
  -- LuaJIT evaluates math.log(x, b) as log2(x) * (1 / log2(b)); mirror that
  -- exactly (log2 via frexp is exact for powers of two, like C's log2).
  local _log, frexp, huge = math.log, math.frexp, math.huge
  local LN2 = _log(2)
  local function log2(x)
    if x > 0 and x < huge then
      local m, e = frexp(x)
      return e + _log(m) / LN2
    end
    return _log(x) / LN2
  end
  math.log = function(x, base)
    if base == nil then return _log(x) end
    return log2(x) * (1 / log2(base))
  end
  note("math.log(x, base)")
end

-- LuaJIT 2.1 extension modules that mods commonly use for speed.
if package.preload["table.new"] == nil and package.loaded["table.new"] == nil then
  package.preload["table.new"] = function()
    return function() return {} end -- (narray, nhash) are only size hints
  end
  note("table.new")
end
if package.preload["table.clear"] == nil and package.loaded["table.clear"] == nil then
  package.preload["table.clear"] = function()
    local pairs = pairs
    return function(t)
      -- clearing existing fields during traversal is allowed in Lua; O(n)
      for k in pairs(t) do t[k] = nil end
    end
  end
  note("table.clear")
end

do
  local _running = coroutine.running
  coroutine.running = function()
    local co = _running()
    if co == nil then return nil, true end
    return co, false
  end
  if coroutine.isyieldable == nil then
    coroutine.isyieldable = function() return _running() ~= nil end
  end
  note("coroutine.running/isyieldable")
end

return M
