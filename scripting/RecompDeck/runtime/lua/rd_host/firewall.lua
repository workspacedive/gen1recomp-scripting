-- rd_host/firewall.lua
-- C++ exception firewall for love.js.
--
-- Verified in this repository (tools/harness, docs/compatibility.md): the
-- love.js "compat" builds (11.4.1 and 11.5.1) have no C++ landing pads in the
-- LÖVE wrapper functions. A love::Exception thrown by e.g.
-- love.filesystem.read("missing") unwinds straight to the next setjmp
-- boundary (a Lua pcall), is swallowed there and leaves the Lua VM with a
-- corrupted stack ("attempt to call a boolean value"). The game probes with
-- pcall ~230 times (newImage x76, newImageData x48, newShader x29,
-- filesystem.read x25, newCanvas x15, ...), so every probe that fails would
-- corrupt the game.
--
-- This module wraps the throwing APIs the game uses and checks the failure
-- conditions in Lua *before* entering C++. Failures are reported exactly as
-- LÖVE reports them natively -- as a (nil, message) return where LÖVE returns
-- that, otherwise as a Lua error() with LÖVE's message -- and both are fully
-- catchable by pcall. Shader sources are compiled by the page in the same
-- WebGL context first (bridge "glsl.validate").
--
-- Anything that still throws is caught by the page's swallowed-exception
-- detector (player.js), which stops the runtime cleanly instead of running
-- on with a corrupted VM and refuses to persist data produced afterwards.
--
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Part of RecompDeck. Contains no code from the gen1recomp project.

local bridge = require("rd_host.bridge")

local M = { installed = {}, prevented = 0, byApi = {} }

local type, tostring, error, select, format = type, tostring, error, select, string.format

local function prevented(api)
  M.prevented = M.prevented + 1
  M.byApi[api] = (M.byApi[api] or 0) + 1
end

local function notFound(name)
  return format("Could not open file %s. Does not exist.", tostring(name))
end

local lf

local function info(path, kind)
  if type(path) ~= "string" or path == "" then return nil end
  return lf.getInfo(path, kind)
end

local function isFile(path) return info(path, "file") ~= nil end

local function parentOf(path)
  return path:match("^(.*)/[^/]+$")
end

-- Magic-byte sniffing for decodable formats (cheap, prevents the common
-- "wrong/empty file" decode exception). Unknown formats fall through.
local IMAGE_MAGIC = {
  { "\137PNG", "png" }, { "\255\216\255", "jpg" }, { "BM", "bmp" },
  { "DDS ", "dds" }, { "\171KTX", "ktx" }, { "PKM ", "pkm" },
  { "\19\171\161\92", "astc" }, { "#?RADIANCE", "hdr" }, { "#?RGBE", "hdr" },
}
local function looksLikeImage(bytes, name)
  if #bytes == 0 then return false end
  for _, m in ipairs(IMAGE_MAGIC) do
    if bytes:sub(1, #m[1]) == m[1] then return true end
  end
  -- TGA has no magic; accept by extension
  return type(name) == "string" and name:lower():match("%.tga$") ~= nil
end

-- LÖVE 11.5 decoders: Vorbis (OggS), WAV (RIFF), MP3 (ID3 / frame sync),
-- ModPlug (tracker formats, by extension). FLAC/AIFF are NOT supported.
local AUDIO_MAGIC = { "OggS", "RIFF", "ID3" }
local function looksLikeAudio(bytes, name)
  if #bytes == 0 then return false end
  for _, m in ipairs(AUDIO_MAGIC) do
    if bytes:sub(1, #m) == m then return true end
  end
  local b1, b2 = bytes:byte(1, 2)
  if b1 == 0xFF and b2 and b2 >= 0xE0 then return true end -- MPEG frame sync
  -- tracker modules (mod/xm/it/s3m...) have no leading magic
  local ext = type(name) == "string" and name:lower():match("%.(%w+)$")
  return ext == "mod" or ext == "xm" or ext == "it" or ext == "s3m" or ext == "669"
    or ext == "mtm" or ext == "med" or ext == "okt" or ext == "far" or ext == "abc"
end

local function readHead(path, n)
  local s = lf.read(path, n)
  return type(s) == "string" and s or ""
end

------------------------------------------------------------------ filesystem
local function installFilesystem()
  lf = love.filesystem

  local read = lf.read
  lf.read = function(a, b, c)
    -- read(name [, size]) or read(container, name [, size])
    local name = a
    if (a == "string" or a == "data") and type(b) == "string" then name = b end
    if type(name) == "string" and not isFile(name) then
      prevented("filesystem.read")
      return nil, notFound(name)
    end
    return read(a, b, c)
  end

  local lines = lf.lines
  if lines then
    lf.lines = function(name, ...)
      if type(name) == "string" and not isFile(name) then
        prevented("filesystem.lines")
        error(notFound(name), 2)
      end
      return lines(name, ...)
    end
  end

  local newFileData = lf.newFileData
  if newFileData then
    lf.newFileData = function(a, b, ...)
      if type(a) == "string" and b == nil and not isFile(a) then
        prevented("filesystem.newFileData")
        error(notFound(a), 2)
      end
      return newFileData(a, b, ...)
    end
  end

  local function writable(name)
    if type(name) ~= "string" or name == "" then return false end
    local parent = parentOf(name)
    if parent and not info(parent, "directory") then return false end
    local existing = info(name)
    if existing and existing.type == "directory" then return false end
    return true
  end

  local write = lf.write
  lf.write = function(name, ...)
    if not writable(name) then
      prevented("filesystem.write")
      return nil, format("Could not open file %s", tostring(name))
    end
    return write(name, ...)
  end

  local append = lf.append
  if append then
    lf.append = function(name, ...)
      if not writable(name) then
        prevented("filesystem.append")
        return nil, format("Could not open file %s", tostring(name))
      end
      return append(name, ...)
    end
  end

  local newFile = lf.newFile
  if newFile then
    local function guardOpen(name, mode)
      if mode == "r" and not isFile(name) then return notFound(name) end
      if (mode == "w" or mode == "a") and not writable(name) then
        return format("Could not open file %s", tostring(name))
      end
      return nil
    end
    local wrappedMt = false
    lf.newFile = function(name, mode, ...)
      if type(name) == "string" and type(mode) == "string" then
        local why = guardOpen(name, mode)
        if why then prevented("filesystem.newFile"); return nil, why end
      end
      local f, err = newFile(name, mode, ...)
      if f and not wrappedMt then
        local mt = getmetatable(f)
        local idx = mt and mt.__index
        if type(idx) == "table" and idx.open then
          local open = idx.open
          idx.open = function(self, m, ...)
            local fname = self.getFilename and self:getFilename()
            if type(fname) == "string" and type(m) == "string" then
              local why = guardOpen(fname, m)
              if why then prevented("File:open"); return nil, why end
            end
            return open(self, m, ...)
          end
          wrappedMt = true
        end
      end
      return f, err
    end
  end

  M.installed[#M.installed + 1] = "filesystem"
end

------------------------------------------------------------------ graphics
local rendererIsGLES

local function validateGLSL(vsrc, psrc)
  local res, err = bridge.call("glsl.validate", { vertex = vsrc, pixel = psrc })
  if res == nil then
    -- no validator available (bridge disabled): let LÖVE compile
    return true
  end
  if type(res) == "table" and res.ok == false then
    return false, res.log or "Cannot compile shader code"
  end
  return true
end

local function installGraphics()
  local lg = love.graphics
  if not lg then return end

  local function checkImageSource(api, src)
    if type(src) == "string" then
      if not isFile(src) then prevented(api); error(notFound(src), 3) end
      if not looksLikeImage(readHead(src, 16), src) then
        prevented(api); error(format("Could not decode file '%s' to ImageData: unsupported file format", src), 3)
      end
    elseif type(src) == "userdata" and src.typeOf and src:typeOf("FileData") then
      if not looksLikeImage(src:getString():sub(1, 16), src:getFilename()) then
        prevented(api); error("Could not decode data to ImageData: unsupported file format", 3)
      end
    end
  end

  local newImage = lg.newImage
  lg.newImage = function(src, ...)
    checkImageSource("graphics.newImage", src)
    return newImage(src, ...)
  end

  if love.image and love.image.newImageData then
    local newImageData = love.image.newImageData
    love.image.newImageData = function(a, b, ...)
      if type(a) == "number" then
        local w, h = a, b
        if type(h) ~= "number" or w <= 0 or h <= 0 or w ~= math.floor(w) or h ~= math.floor(h) then
          prevented("image.newImageData"); error("Invalid ImageData dimensions", 2)
        end
      else
        checkImageSource("image.newImageData", a)
      end
      return newImageData(a, b, ...)
    end
  end

  local function checkFontSource(api, src)
    if type(src) == "string" and not tonumber(src) then
      if not isFile(src) then prevented(api); error(notFound(src), 3) end
    end
  end
  if lg.newFont then
    local newFont = lg.newFont
    lg.newFont = function(src, ...)
      checkFontSource("graphics.newFont", src)
      return newFont(src, ...)
    end
  end
  if lg.newImageFont then
    local newImageFont = lg.newImageFont
    lg.newImageFont = function(src, ...)
      checkImageSource("graphics.newImageFont", src)
      return newImageFont(src, ...)
    end
  end

  -- Canvas: validate dimensions, format and MSAA against the device limits.
  if lg.newCanvas then
    local newCanvas = lg.newCanvas
    local limits, formats
    lg.newCanvas = function(w, h, a, b)
      limits = limits or (lg.getSystemLimits and lg.getSystemLimits()) or {}
      formats = formats or (lg.getCanvasFormats and lg.getCanvasFormats()) or {}
      local settings = type(a) == "table" and a or (type(b) == "table" and b) or nil
      local maxSize = limits.texturesize or 4096
      if w ~= nil then
        if type(w) ~= "number" or type(h) ~= "number" or w <= 0 or h <= 0 then
          prevented("graphics.newCanvas"); error("Canvas dimensions must be greater than 0", 2)
        end
        if w > maxSize or h > maxSize then
          prevented("graphics.newCanvas")
          error(format("Cannot create canvas: size %dx%d exceeds the system limit %d", w, h, maxSize), 2)
        end
      end
      if settings then
        local fmt = settings.format
        if fmt and fmt ~= "normal" and fmt ~= "hdr" and formats[fmt] == false then
          prevented("graphics.newCanvas")
          error(format("The %s canvas format is not supported by your graphics driver.", fmt), 2)
        end
        local msaa = tonumber(settings.msaa)
        if msaa and msaa > 1 and limits.canvasmsaa and msaa > limits.canvasmsaa then
          settings.msaa = limits.canvasmsaa -- LÖVE clamps silently too
        end
      end
      return newCanvas(w, h, a, b)
    end
  end

  -- Shader: build the exact GLSL LÖVE would compile and validate it first.
  if lg.newShader and lg._shaderCodeToGLSL then
    local newShader = lg.newShader
    lg.newShader = function(a, b)
      local args = { a, b }
      for i = 1, 2 do
        local v = args[i]
        if type(v) == "userdata" and v.typeOf and v:typeOf("FileData") then
          args[i] = v:getString()
        elseif type(v) == "string" then
          local fi = info(v)
          if fi then
            args[i] = lf.read(v)
          elseif #v > 0 and #v < 64 and not v:find("\n", 1, true) then
            local ext = v:match("%.(.*)$")
            if ext and not ext:find(";", 1, true) and not ext:find(" ", 1, true) then
              prevented("graphics.newShader"); error(notFound(v), 2)
            end
          end
        end
      end
      if type(args[1]) ~= "string" and type(args[2]) ~= "string" then
        error("bad argument #1 to 'newShader' (string expected)", 2)
      end
      if rendererIsGLES == nil then
        local name = lg.getRendererInfo and lg.getRendererInfo() or ""
        rendererIsGLES = type(name) == "string" and name:find("OpenGL ES", 1, true) ~= nil
      end
      local okGen, vsrc, psrc = pcall(lg._shaderCodeToGLSL, rendererIsGLES, args[1], args[2])
      if not okGen then error(vsrc, 2) end
      local ok, log = validateGLSL(vsrc, psrc)
      if not ok then
        prevented("graphics.newShader")
        local msg = lg._transformGLSLErrorMessages and lg._transformGLSLErrorMessages(log) or log
        error(msg, 2)
      end
      return newShader(a, b)
    end
  end

  M.installed[#M.installed + 1] = "graphics"
end

------------------------------------------------------------------ audio / sound
local function installAudio()
  local function checkAudioSource(api, src)
    if type(src) == "string" then
      if not isFile(src) then prevented(api); error(notFound(src), 3) end
      if not looksLikeAudio(readHead(src, 16), src) then
        prevented(api); error(format("Could not decode file '%s': unsupported audio format", src), 3)
      end
    elseif type(src) == "userdata" and src.typeOf and src:typeOf("FileData") then
      if not looksLikeAudio(src:getString():sub(1, 16), src:getFilename()) then
        prevented(api); error("Could not decode data: unsupported audio format", 3)
      end
    end
  end
  if love.audio and love.audio.newSource then
    local newSource = love.audio.newSource
    love.audio.newSource = function(src, kind, ...)
      if kind ~= nil and kind ~= "static" and kind ~= "stream" and kind ~= "queue" then
        error(format("Invalid source type '%s', expected one of: 'static', 'stream', 'queue'", tostring(kind)), 2)
      end
      checkAudioSource("audio.newSource", src)
      return newSource(src, kind, ...)
    end
  end
  if love.sound then
    for _, fname in ipairs({ "newSoundData", "newDecoder" }) do
      local f = love.sound[fname]
      if f then
        love.sound[fname] = function(src, ...)
          if type(src) ~= "number" then checkAudioSource("sound." .. fname, src) end
          return f(src, ...)
        end
      end
    end
  end
  M.installed[#M.installed + 1] = "audio"
end

------------------------------------------------------------------ public
function M.installEarly()
  installFilesystem()
end

function M.installLate()
  installGraphics()
  installAudio()
end

function M.report()
  return { prevented = M.prevented, byApi = M.byApi, installed = M.installed }
end

return M
