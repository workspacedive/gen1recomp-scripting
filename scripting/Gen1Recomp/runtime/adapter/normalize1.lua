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
--
-- Dynamic mod sources can also come from LuaJIT-oriented packages. LuaJIT's
-- loader accepts a UTF-8 BOM and 64-bit hexadecimal LL/ULL suffixes; PUC Lua
-- 5.1 in love.js accepts neither. Retry only a source that failed for one of
-- those exact dialect boundaries. Stored packages and upstream files remain
-- byte-for-byte unchanged.
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
      local candidate = source
      local fn, message = nativeLoadString(candidate, chunkname)
      if not fn and not binary and candidate:sub(1, 3) == "\239\187\191" then
        candidate = candidate:sub(4)
        fn, message = nativeLoadString(candidate, chunkname)
      end
      local jitIntegerPattern = "(%f[%w_]0[xX]%x+)[Uu]?[Ll][Ll]%f[^%w_]"
      if not fn and not binary and candidate:match(jitIntegerPattern) then
        candidate = candidate:gsub(jitIntegerPattern, "%1")
        fn, message = nativeLoadString(candidate, chunkname)
      end
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
    -- Gen1Recomp's sandbox compiles mod:read() sources through the global
    -- loadstring, so route that one entry point through the same bounded retry.
    loadstring = function(source, chunkname)
      if type(source) ~= "string" then
        error("bad argument #1 to 'loadstring' (string expected)", 2)
      end
      return compile(source, chunkname, "bt", nil)
    end
  end
end

-- Gen1Recomp source uses Lua 5.2 hexadecimal string escapes (for example the
-- UTF-8 multiplication sign is written as "\\xc3\\x97"). The Lua 5.1 VM in
-- this love.js build accepts an unknown escape by dropping the backslash, so
-- that source becomes the device-observed literal "xc3x97". Install a source
-- loader ahead of the native loader and translate unescaped hexadecimal byte
-- escapes to Lua 5.1's equivalent three-digit decimal form before compilation.
-- This is syntax normalization only; payload files remain byte-for-byte intact.
do
  local loaders = package and (package.loaders or package.searchers)
  local nativeLoadString = loadstring
  local unpackValues = unpack or (table and table.unpack)
  -- Release builds keep the proven compatibility/pacing adapters but avoid
  -- timing wrappers and bridge traffic. Set true only in a diagnostic build.
  local PROFILE_ENABLED = false
  local HOST_PACKAGE_CONFIG = package and package.config or "/\n;\n?\n!\n-"

  local function normalizeHexEscapes(source)
    local changed
    repeat
      source, changed = source:gsub("([^\\])\\x(%x%x)", function(prefix, hex)
        return prefix .. "\\" .. string.format("%03d", tonumber(hex, 16))
      end)
      if source:sub(1, 2) == "\\x" and source:sub(3, 4):match("^%x%x$") then
        source = "\\" .. string.format("%03d", tonumber(source:sub(3, 4), 16))
          .. source:sub(5)
        changed = changed + 1
      end
    until changed == 0
    return source
  end

  local function profileClock()
    if love and love.timer and type(love.timer.getTime) == "function" then
      return love.timer.getTime()
    end
    return os.clock()
  end

  local function profile(phase, fields)
    if not PROFILE_ENABLED then return end
    local parts = { "[gen1-profile]", "phase=" .. phase }
    for key, value in pairs(fields or {}) do
      parts[#parts + 1] = tostring(key) .. "=" .. tostring(value):gsub("%s+", "_")
    end
    print(table.concat(parts, " "))
  end

  local function timedMethod(target, name, phase, kind)
    local native = target and target[name]
    if type(native) ~= "function" then return end
    target[name] = function(...)
      local started = profileClock()
      local results = { native(...) }
      profile(phase, { kind = kind or name,
        ms = string.format("%.3f", (profileClock() - started) * 1000) })
      return unpackValues(results)
    end
  end

  local function instrumentModule(moduleName, module)
    if type(module) ~= "table" or module.__hostProfiled then return module end
    if moduleName == "src.mods.LegacyCompat" then
      -- The official legacy sandbox intentionally exposes a data-only package
      -- stand-in, but omitted package.config. Older mods use only its first
      -- byte to join scoped cache paths. Supply the host descriptor without
      -- exposing package.loaded, searchers, loaders, paths, or the real table.
      local nativeNew = module.new
      if type(nativeNew) == "function" then
        module.new = function(...)
          local compat = nativeNew(...)
          local globals = type(compat) == "table" and compat.globals or nil
          local packageShim = type(globals) == "table" and globals.package or nil
          if type(packageShim) == "table" and rawget(packageShim, "config") == nil then
            packageShim.config = HOST_PACKAGE_CONFIG
          end
          return compat
        end
      end
      module.__hostProfiled = true
    elseif moduleName == "src.core.ChipSynth" then
      -- love.thread is unavailable on the measured love.js device path, so
      -- ChipAudio synthesizes buffers on the render thread. 8192-sample
      -- buffers cost 35-50 ms each; the four-buffer song preroll therefore
      -- blocks 140-200 ms before every transition. Smaller buffers preserve
      -- sample rate and PCM output while amortizing the same work below one
      -- display-frame budget on the measured device.
      if type(module.MUSIC_BUFFER_SAMPLES) == "number"
          and module.MUSIC_BUFFER_SAMPLES > 2048 then
        module.MUSIC_BUFFER_SAMPLES = 2048
      end
      module.__hostProfiled = true
    elseif moduleName == "src.battle.BattleState" and PROFILE_ENABLED then
      module.__hostProfiled = true
      timedMethod(module, "newWild", "battle.construct", "wild")
      timedMethod(module, "newTrainer", "battle.construct", "trainer")
      timedMethod(module, "playBattleTheme", "battle.music", "theme")
      timedMethod(module, "enter", "battle.enter", "state")
      local nativeDraw = module.draw
      if type(nativeDraw) == "function" then
        module.draw = function(self, ...)
          local first = not self.__hostFirstDrawProfiled
          local started = first and profileClock() or nil
          local results = { nativeDraw(self, ...) }
          if first then
            self.__hostFirstDrawProfiled = true
            profile("battle.first_draw", { kind = self.kind or "unknown",
              ms = string.format("%.3f", (profileClock() - started) * 1000) })
          end
          return unpackValues(results)
        end
      end
    elseif moduleName == "src.core.ChipAudio" and PROFILE_ENABLED then
      module.__hostProfiled = true
      local nativePlayMusic = module.playMusic
      if type(nativePlayMusic) == "function" then
        module.playMusic = function(...)
          local started = profileClock()
          local results = { nativePlayMusic(...) }
          local stats = type(module.stats) == "function" and module.stats() or {}
          profile("audio.chip_play", {
            kind = "music",
            worker = stats.worker or "unknown",
            buffers = stats.buffers or 0,
            ms = string.format("%.3f", (profileClock() - started) * 1000),
          })
          return unpackValues(results)
        end
      end
    elseif moduleName == "src.render.BattleTransition" then
      module.__hostProfiled = true
      local nativeNew, nativeUpdate = module.new, module.update
      if type(nativeNew) == "function" then
        module.new = function(game, onDone, opts)
          local started = profileClock()
          local transition
          transition = nativeNew(game, function(...)
            transition.__hostTransitionDone = true
            local expectedFrames = (transition.wipeLen or 0) + 60
              + ((transition.def and transition.def.flash) and 72 or 0)
            profile("battle.transition", {
              style = transition.style or "unknown",
              frames = expectedFrames,
              adapterCalls = transition.__hostTransitionCalls or 0,
              adapterSteps = transition.__hostTransitionSteps or 0,
              ms = string.format("%.3f", (profileClock() - started) * 1000),
            })
            if onDone then return onDone(...) end
          end, opts)
          transition.__hostTransitionClock = started
          transition.__hostTransitionAccum = 0
          return transition
        end
      end
      if type(nativeUpdate) == "function" then
        module.update = function(self, dt)
          self.__hostTransitionCalls = (self.__hostTransitionCalls or 0) + 1
          local now = profileClock()
          local previous = self.__hostTransitionClock or now
          local elapsed = now - previous
          self.__hostTransitionClock = now
          if elapsed < 0 then elapsed = 0 end
          if elapsed > 0.25 then elapsed = 0.25 end
          local speed = 1
          if self.game and type(self.game.logicSpeed) == "function" then
            speed = tonumber(self.game:logicSpeed()) or 1
          end
          self.__hostTransitionAccum = (self.__hostTransitionAccum or 0)
            + elapsed * 60 * math.max(1, speed)
          local steps = math.floor(self.__hostTransitionAccum)
          if steps < 1 then return end
          self.__hostTransitionAccum = self.__hostTransitionAccum - steps
          for _ = 1, steps do
            self.__hostTransitionSteps = (self.__hostTransitionSteps or 0) + 1
            nativeUpdate(self, dt)
            if self.__hostTransitionDone then break end
          end
        end
      end
    end
    return module
  end

  if type(loaders) == "table" and type(nativeLoadString) == "function" then
    local function gen1SourceLoader(moduleName)
      if type(moduleName) ~= "string" or not moduleName:match("^src%.") then
        return "\n\thost hex-escape loader skipped " .. tostring(moduleName)
      end
      local path = moduleName:gsub("%.", "/") .. ".lua"
      if not _lfs_getInfo(path, "file") then
        return "\n\tno Gen1Recomp source '" .. path .. "'"
      end
      local source, readError = _lfs_read(path)
      if type(source) ~= "string" then
        return "\n\tunable to read '" .. path .. "': " .. tostring(readError)
      end
      local chunk, compileError = nativeLoadString(normalizeHexEscapes(source), "@" .. path)
      if not chunk then return compileError end
      return function(...)
        local results = { chunk(...) }
        results[1] = instrumentModule(moduleName, results[1])
        return unpackValues(results)
      end
    end
    table.insert(loaders, 2, gen1SourceLoader)
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
    elseif name == "src.ui.kit.Theme" and type(module) == "table"
        and not rawget(module, "__hostRailCompatibility") then
      module.__hostRailCompatibility = true
      -- Lua 5.1's floating modulo can round a wrapped value to exactly 1.0.
      -- Upstream then indexes the ninth element of its eight-color rail. Keep
      -- the same gradient while explicitly wrapping the integer index.
      module.versionRail = function(x, y, w, h)
        local graphics = love and love.graphics
        if not graphics then return end
        local function snap(value) return math.floor(value + 0.5) end
        x, y, w, h = snap(x), snap(y), snap(w), snap(h)
        if w <= 0 or h <= 0 then return end
        local palette = module.PAL
        local colors = {
          palette.railRed, palette.railBlue, palette.railGold,
          palette.railAmber, palette.railSilver, palette.railCrystal,
          palette.railFireRed, palette.railLeafGreen,
        }
        local count = #colors
        local now = love.timer and love.timer.getTime and love.timer.getTime() or 0
        if type(now) ~= "number" or now ~= now
            or now == math.huge or now == -math.huge then now = 0 end
        local phase = (now % 24) / 24
        for px = 0, w - 1 do
          local position = ((px / w - phase) % 1) * count
          local index = math.floor(position) % count
          local a, b = colors[index + 1], colors[(index + 1) % count + 1]
          local amount = position - math.floor(position)
          graphics.setColor((a[1] + (b[1] - a[1]) * amount) / 255,
            (a[2] + (b[2] - a[2]) * amount) / 255,
            (a[3] + (b[3] - a[3]) * amount) / 255, 1)
          graphics.rectangle("fill", x + px, y, 1, h)
        end
      end
    end
    return module
  end
end

-- Preserve shader compiler diagnostics even when capability probes correctly
-- use pcall and fall back. Also reject canvas formats that LÖVE has already
-- reported unsupported before entering love.js's native newCanvas binding:
-- that binding displays a fatal browser alert before Lua's pcall can handle
-- the ordinary optional-format probe. A Lua error keeps the documented pcall
-- fallback intact (for example from readable depth to an internal depth
-- buffer) without claiming support the WebGL driver did not report.
do
  local graphics = love.graphics
  local nativeNewShader = graphics and graphics.newShader
  local nativeNewCanvas = graphics and graphics.newCanvas
  local canvasFormats = { readable = nil, nonreadable = nil }
  if graphics and graphics.getCanvasFormats then
    local readableOK, readable = pcall(graphics.getCanvasFormats, true)
    if readableOK and type(readable) == "table" then
      canvasFormats.readable = readable
    end
    local nonreadableOK, nonreadable = pcall(graphics.getCanvasFormats, false)
    if nonreadableOK and type(nonreadable) == "table" then
      canvasFormats.nonreadable = nonreadable
    end
  end
  if nativeNewCanvas then
    graphics.newCanvas = function(...)
      local settings = select(3, ...)
      local format = type(settings) == "table" and settings.format or nil
      local wantsReadable = type(settings) == "table" and settings.readable == true
      local formats = wantsReadable and canvasFormats.readable or canvasFormats.nonreadable
      local depthOrStencil = type(format) == "string"
        and (format:match("^depth") ~= nil or format:match("stencil") ~= nil)
      -- This pinned love.js build reports readable depth formats as supported
      -- through getCanvasFormats(true), but its native newCanvas binding then
      -- raises the device-observed fatal browser alert for the same request.
      -- Fail closed for explicit readable depth/stencil probes in this web
      -- adapter. Non-readable depth remains available for the normal fallback.
      local unsafeWebReadableDepth = wantsReadable and depthOrStencil
      if type(format) == "string"
        and (unsafeWebReadableDepth or (formats and formats[format] == false)) then
        local kind = wantsReadable and "readable " or ""
        print("[gen1-graphics] skipped unsupported " .. kind .. "Canvas format: " .. format)
        error("The " .. format .. " " .. kind .. "Canvas format is not supported by your graphics drivers.", 2)
      end
      return nativeNewCanvas(...)
    end
  end
  if nativeNewShader then
    graphics.newShader = function(...)
      local ok, shader = pcall(nativeNewShader, ...)
      if ok then return shader end
      print("[gen1-graphics] newShader failed: " .. tostring(shader))
      error(shader, 2)
    end
  end
end

-- Gen1Recomp removed the former GBCFX module when ShaderFX replaced its
-- output slot. Legacy renderer mods still use GBCFX.setLevel(0) solely to
-- clear a conflicting post-process. Preserve that narrow operation by
-- deactivating the replacement ShaderFX chain; no removed nonzero effect or
-- broader engine API is recreated.
do
  local preload = package and package.preload
  if preload and preload["src.render.GBCFX"] == nil then
    preload["src.render.GBCFX"] = function()
      return {
        level = 0,
        setLevel = function(level)
          level = math.floor(tonumber(level) or 0)
          if level <= 0 then
            local ShaderFX = require("src.render.ShaderFX")
            if ShaderFX and ShaderFX.deactivate then ShaderFX.deactivate() end
          end
          return 0
        end,
      }
    end
  end
end
