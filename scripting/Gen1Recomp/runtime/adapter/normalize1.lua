--[[
This file is part of "love.js" by 2dengine.
https://2dengine.com/doc/lovejs.html

MIT License

Copyright (c) 2022 2dengine LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
]]

-- normalize.lua is a series of hacks which ensure that
-- love.js behaves more closely to the downloadable version
love.js = {}
local cache = {}
function love.js.eval(cmd)
  -- todo: system module is required
  love.system = love.system or require('love.system')
  -- evaluate the command
  love.system.openURL('javascript:'..cmd)
  
  -- read back the output stream
  for i = 1, 2^32 do
    local line = io.read()
    if not line then
      break
    end
    cache[i] = line
  end
  local output = table.concat(cache, '\n')

  -- clean up the cache
  for i = #cache, 1, -1 do
    cache[i] = nil
  end

  -- return the result
  return output
end

--if os then
--  os.execute = love.js.eval
--end

local lfs = love.filesystem

--[[
-- hack that removes the leading slash from the identity string ("/love")
local _lfs_getIdentity = lfs.getIdentity
function lfs.getIdentity()
  local ident = _lfs_getIdentity()
  ident = ident:gsub("^/+", "")
  return ident
end
]]

local _lfs_getInfo = lfs.getInfo
local _lfs_read = lfs.read
function lfs.read(fn, ...)
  if not _lfs_getInfo(fn, 'file') then
    return nil, 'File does not exist: '..fn
  end
  return _lfs_read(fn, ...)
end

local _lfs_newFile = lfs.newFileData
function lfs.newFileData(fn, arg, ...)
  if not arg and not _lfs_getInfo(fn, 'file') then
    return nil, 'File does not exist: '..fn
  end
  return _lfs_newFile(fn, arg, ...)
end

local reg = debug.getregistry()
if reg then
  local _File_open = reg.File.open
  reg.File.open = function(file, ...)
    local fn = file:getFilename()
    if not _lfs_getInfo(fn) then
      return nil, 'File does not exist: '..fn
    end
    return _File_open(file, ...)
  end
end

-- Gen1Recomp host adapter: love.js embeds Lua 5.1, while the payload uses
-- Lua 5.2+'s load(string, chunkname, mode, environment) contract for generated
-- ROM data and sandboxed modules. Preserve native reader behavior when no
-- compatibility arguments are requested; otherwise compile text/binary only
-- when the requested mode permits it and apply the explicit environment.
do
  local nativeLoad, nativeLoadString, nativeSetfenv = load, loadstring, setfenv
  if nativeLoadString and nativeSetfenv then
    local function compile(source, chunkname, mode, environment)
      mode = mode or "bt"
      if mode ~= "b" and mode ~= "t" and mode ~= "bt" then
        error("bad argument #3 to 'load' (invalid mode)", 3)
      end
      local binary = source:byte(1) == 27
      if binary and not mode:find("b", 1, true) then
        return nil, "attempt to load a binary chunk (mode is '" .. mode .. "')"
      end
      if not binary and not mode:find("t", 1, true) then
        return nil, "attempt to load a text chunk (mode is '" .. mode .. "')"
      end
      local fn, message = nativeLoadString(source, chunkname)
      if fn and environment ~= nil then nativeSetfenv(fn, environment) end
      return fn, message
    end

    load = function(chunk, chunkname, mode, environment)
      if type(chunk) == "string" then
        return compile(chunk, chunkname, mode, environment)
      end
      if type(chunk) == "function" and mode == nil and environment == nil then
        return nativeLoad(chunk, chunkname)
      end
      if type(chunk) ~= "function" then
        error("bad argument #1 to 'load' (function or string expected)", 2)
      end
      local pieces = {}
      while true do
        local piece = chunk()
        if piece == nil then break end
        if type(piece) ~= "string" then
          error("reader function must return a string", 2)
        end
        pieces[#pieces + 1] = piece
      end
      return compile(table.concat(pieces), chunkname, mode, environment)
    end
  end
end

-- A device-observed Launcher rail failure is reachable with its static,
-- gap-free palette only when the dynamic phase becomes non-finite. LÖVE
-- promises a numeric monotonic timer; enforce that contract at the adapter
-- boundary because NaN otherwise becomes nil table lookups throughout the
-- payload. The captured console path below keeps the host cause diagnosable.
do
  local timer = love and love.timer
  local nativeGetTime = timer and timer.getTime
  if type(nativeGetTime) == "function" then
    local last = 0
    local function finite(value)
      return type(value) == "number" and value == value
        and value ~= math.huge and value ~= -math.huge
    end
    timer.getTime = function()
      local value = nativeGetTime()
      if not finite(value) then
        local fallback = os.clock and os.clock() or last
        value = finite(fallback) and fallback or last
      end
      if value < last then return last end
      last = value
      return value
    end
  end
end

-- Gen1Recomp host adapter: love.js 11.5 provides neither LuaJIT's bit module
-- nor Lua 5.2's bit32 module. Keep this compatibility layer outside the game
-- payload and expose the operations used by the reviewed upstream payload.
if not rawget(_G, "bit") and not rawget(_G, "bit32") then
  local TWO31, TWO32 = 2147483648, 4294967296
  local function u32(value) return (value or 0) % TWO32 end
  local function s32(value)
    value = u32(value)
    return value >= TWO31 and value - TWO32 or value
  end
  local AND, OR, XOR = {}, {}, {}
  for left = 0, 15 do
    AND[left], OR[left], XOR[left] = {}, {}, {}
    for right = 0, 15 do
      local a, b, place = left, right, 1
      local av, ov, xv = 0, 0, 0
      for _ = 1, 4 do
        local aa, bb = a % 2, b % 2
        if aa == 1 and bb == 1 then av = av + place end
        if aa == 1 or bb == 1 then ov = ov + place end
        if aa ~= bb then xv = xv + place end
        a, b, place = math.floor(a / 2), math.floor(b / 2), place * 2
      end
      AND[left][right], OR[left][right], XOR[left][right] = av, ov, xv
    end
  end
  local function pair(table_, left, right)
    left, right = u32(left), u32(right)
    local value, place = 0, 1
    for _ = 1, 8 do
      local a, b = left % 16, right % 16
      value = value + table_[a][b] * place
      left, right, place = math.floor(left / 16), math.floor(right / 16), place * 16
    end
    return value
  end
  local function fold(table_, first, ...)
    local value = u32(first)
    for index = 1, select("#", ...) do value = pair(table_, value, select(index, ...)) end
    return value
  end
  local unsigned = {}
  function unsigned.band(first, ...) return fold(AND, first, ...) end
  function unsigned.bor(first, ...) return fold(OR, first, ...) end
  function unsigned.bxor(first, ...) return fold(XOR, first, ...) end
  function unsigned.bnot(value) return 4294967295 - u32(value) end
  function unsigned.lshift(value, displacement)
    if displacement < 0 then return unsigned.rshift(value, -displacement) end
    if displacement >= 32 then return 0 end
    return u32(u32(value) * 2 ^ displacement)
  end
  function unsigned.rshift(value, displacement)
    if displacement < 0 then return unsigned.lshift(value, -displacement) end
    if displacement >= 32 then return 0 end
    return math.floor(u32(value) / 2 ^ displacement)
  end
  function unsigned.arshift(value, displacement)
    if displacement < 0 then return unsigned.lshift(value, -displacement) end
    if displacement >= 32 then return s32(value) < 0 and 4294967295 or 0 end
    return u32(math.floor(s32(value) / 2 ^ displacement))
  end
  function unsigned.lrotate(value, displacement)
    displacement = displacement % 32
    if displacement == 0 then return u32(value) end
    return u32(unsigned.lshift(value, displacement) + unsigned.rshift(value, 32 - displacement))
  end
  unsigned.rol = unsigned.lrotate

  local signed = {}
  function signed.tobit(value) return s32(value) end
  function signed.band(...) return s32(unsigned.band(...)) end
  function signed.bor(...) return s32(unsigned.bor(...)) end
  function signed.bxor(...) return s32(unsigned.bxor(...)) end
  function signed.bnot(value) return s32(unsigned.bnot(value)) end
  function signed.lshift(value, displacement) return s32(unsigned.lshift(value, displacement)) end
  function signed.rshift(value, displacement) return s32(unsigned.rshift(value, displacement)) end
  function signed.arshift(value, displacement)
    return s32(unsigned.arshift(value, displacement))
  end
  function signed.rol(value, displacement) return s32(unsigned.lrotate(value, displacement)) end
  signed.lrotate = signed.rol

  _G.bit32, _G.bit = unsigned, signed
  package.loaded.bit32, package.loaded.bit = unsigned, signed
end

-- The official Player installs every non-game bridge resource in this module
-- directory before Lua starts. Advertise the read-only, host-verified ROM only
-- when that resource is actually part of this boot session.
do
  local importPath = "/usr/local/share/lua/5.1/import.gb"
  local file = io and io.open and io.open(importPath, "rb")
  if file then
    file:close()
    local originalGetenv = os.getenv or function() return nil end
    os.getenv = function(name)
      if name == "POKEPORT_IMPORT_ROM" then return importPath end
      if name == "POKEPORT_FORCE_IMPORT" then return "1" end
      return originalGetenv(name)
    end
  end
end

-- Gen1Recomp's asynchronous ROM-import completion intentionally catches a
-- bootGame failure before returning to the frame loop. Preserve that original
-- failure on the Game singleton so the following draw reports the actionable
-- cause instead of masking it with a secondary nil StateStack error.
do
  local originalRequire = require
  local unpackValues = table.unpack or unpack
  local function pack(...)
    return { n = select("#", ...), ... }
  end
  require = function(name)
    local module = originalRequire(name)
    if name == "src.core.Game" and type(module) == "table"
        and not rawget(module, "__hostLoadDiagnostic") then
      module.__hostLoadDiagnostic = true
      local originalLoad, originalDraw = module.load, module.draw
      module.load = function(self, ...)
        local arguments = pack(...)
        local results = pack(xpcall(function()
          return originalLoad(self, unpackValues(arguments, 1, arguments.n))
        end, function(message)
          return debug.traceback(tostring(message), 2)
        end))
        if not results[1] then
          self.__hostLoadError = results[2]
          error(results[2], 0)
        end
        return unpackValues(results, 2, results.n)
      end
      module.draw = function(self, ...)
        local loadError = rawget(self, "__hostLoadError")
        if loadError then
          error("Gen1Recomp game boot failed before the first draw:\n" .. loadError, 0)
        end
        return originalDraw(self, ...)
      end
    end
    return module
  end
end
