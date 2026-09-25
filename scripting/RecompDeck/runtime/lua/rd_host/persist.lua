-- rd_host/persist.lua
-- Save-directory change tracking and streaming to the Scripting host.
--
-- love.js keeps the save directory in memory (MEMFS/IDBFS) and would only
-- flush it on `beforeunload`, which WKWebView does not reliably deliver. The
-- host therefore owns persistence: every write the game performs through
-- love.filesystem (write/append/remove/createDirectory/newFile), through
-- ImageData:encode(format, filename) or love.graphics.captureScreenshot is
-- recorded here, and dirty files are streamed to the page shortly after the
-- last write (debounced) through a binary device file:
--
--   bridge "persist.file" {path, size}  then  <size raw bytes> -> /rd/dev/persist
--   bridge "persist.remove" {path}
--   bridge "persist.dir" {path}
--   bridge "persist.batch" {files, bytes, reason}   (summary, once per flush)
--
-- The device callback lives in the page (FS_createDevice), so bytes move with
-- no base64/JSON round trip. Paths are relative to the save directory and are
-- validated (no "..", no absolute paths, bounded length).
--
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Part of RecompDeck. Contains no code from the gen1recomp project.

local bridge = require("rd_host.bridge")

local M = {
  dirty = {},          -- path -> true (file or dir)
  removed = {},        -- path -> true
  dirtyCount = 0,
  lastWrite = 0,
  firstDirty = 0,
  debounce = 0.3,      -- seconds of quiet before a flush
  maxDelay = 2.0,      -- flush at the latest this long after the first write
  device = "/rd/dev/persist",
  installed = false,
  stats = { flushes = 0, files = 0, bytes = 0 },
}

local type, pairs, tostring, pcall = type, pairs, tostring, pcall
-- wall-clock source; boot sets M.clock to the real (non-virtual) timer
local function now() return (M.clock or os.clock)() end

local function validPath(p)
  if type(p) ~= "string" or p == "" or #p > 512 then return false end
  if p:sub(1, 1) == "/" or p:find("..", 1, true) or p:find("\\", 1, true) then return false end
  return true
end

local function mark(path)
  if not validPath(path) then return end
  path = path:gsub("^%./", "")
  if not M.dirty[path] then
    M.dirty[path] = true
    M.dirtyCount = M.dirtyCount + 1
    if M.dirtyCount == 1 then M.firstDirty = now() end
  end
  M.removed[path] = nil
  M.lastWrite = now()
end
M.mark = mark

local function markRemoved(path)
  if not validPath(path) then return end
  if M.dirty[path] then M.dirty[path] = nil; M.dirtyCount = M.dirtyCount - 1 end
  M.removed[path] = true
  M.lastWrite = now()
  if M.firstDirty == 0 then M.firstDirty = now() end
end

local function wrapFilesystem()
  local lf = love.filesystem
  local write, append, remove, mkdir, newFile =
    lf.write, lf.append, lf.remove, lf.createDirectory, lf.newFile
  lf.write = function(name, ...)
    local ok, err = write(name, ...)
    if ok then mark(name) end
    return ok, err
  end
  if append then
    lf.append = function(name, ...)
      local ok, err = append(name, ...)
      if ok then mark(name) end
      return ok, err
    end
  end
  lf.remove = function(name)
    local ok = remove(name)
    if ok then markRemoved(name) end
    return ok
  end
  lf.createDirectory = function(name)
    local ok = mkdir(name)
    if ok then mark(name) end
    return ok
  end
  if newFile then
    lf.newFile = function(name, mode, ...)
      local f, err = newFile(name, mode, ...)
      if f and type(name) == "string" then
        if mode == "w" or mode == "a" then mark(name) end
        -- File:open("w"/"a") later on: wrap the method table once
        local mt = getmetatable(f)
        local idx = mt and mt.__index
        if type(idx) == "table" and idx.open and not idx.__rd_wrapped then
          local open = idx.open
          idx.open = function(self, m, ...)
            local ok, e = open(self, m, ...)
            if ok and (m == "w" or m == "a") then
              local fname = self.getFilename and self:getFilename()
              if fname then mark(fname) end
            end
            return ok, e
          end
          idx.__rd_wrapped = true
        end
      end
      return f, err
    end
  end
end

local function wrapImageEncode()
  if not (love.image and love.image.newImageData) then return end
  local ok, probe = pcall(love.image.newImageData, 1, 1)
  if not ok or not probe then return end
  local mt = getmetatable(probe)
  local idx = mt and mt.__index
  if type(idx) ~= "table" or not idx.encode or idx.__rd_wrapped then return end
  local encode = idx.encode
  idx.encode = function(self, format, filename, ...)
    local res = encode(self, format, filename, ...)
    if type(filename) == "string" then mark(filename) end
    return res
  end
  idx.__rd_wrapped = true
end

local function wrapScreenshot()
  local lg = love.graphics
  if not (lg and lg.captureScreenshot) then return end
  local capture = lg.captureScreenshot
  lg.captureScreenshot = function(arg, ...)
    if type(arg) == "string" then
      -- the PNG is written at the end of the frame; debounce covers that
      mark(arg)
    end
    return capture(arg, ...)
  end
end

function M.install()
  if M.installed then return end
  M.installed = true
  wrapFilesystem()
end

-- Needs love.image / love.graphics, so it runs after modules are loaded.
function M.installLate()
  wrapImageEncode()
  wrapScreenshot()
end

local function streamFile(path)
  local lf = love.filesystem
  local info = lf.getInfo(path)
  if not info then
    bridge.notify("persist.remove", { path = path })
    return 0
  end
  if info.type == "directory" then
    bridge.notify("persist.dir", { path = path })
    return 0
  end
  local data = lf.read(path)
  if type(data) ~= "string" then return 0 end
  bridge.notify("persist.file", { path = path, size = #data, modtime = info.modtime })
  if #data > 0 then
    local f = io.open(M.device, "wb")
    if not f then
      bridge.log("error", "persist device unavailable")
      return 0
    end
    f:write(data)
    f:close()
  end
  return #data
end

function M.flush(reason)
  if M.dirtyCount == 0 and next(M.removed) == nil then return 0 end
  local files, bytes = 0, 0
  for path in pairs(M.removed) do
    bridge.notify("persist.remove", { path = path })
  end
  M.removed = {}
  local list = {}
  for path in pairs(M.dirty) do list[#list + 1] = path end
  table.sort(list) -- parents before children
  for _, path in ipairs(list) do
    local ok, n = pcall(streamFile, path)
    if ok then files = files + 1; bytes = bytes + (n or 0) end
  end
  M.dirty, M.dirtyCount, M.firstDirty = {}, 0, 0
  M.stats.flushes = M.stats.flushes + 1
  M.stats.files = M.stats.files + files
  M.stats.bytes = M.stats.bytes + bytes
  bridge.notify("persist.batch", { files = files, bytes = bytes, reason = reason or "debounce" })
  return files
end

-- Called once per frame by rd_host.boot.
function M.tick()
  if M.dirtyCount == 0 and M.firstDirty == 0 then return end
  local t = now()
  if (t - M.lastWrite) >= M.debounce or (t - M.firstDirty) >= M.maxDelay then
    M.flush("debounce")
  end
end

-- Stream a whole subtree (e.g. "red/" after an import, or "" for a backup).
function M.snapshot(prefix, reason)
  local lf = love.filesystem
  local count = 0
  local function walk(dir)
    for _, name in ipairs(lf.getDirectoryItems(dir)) do
      local p = (dir == "" and name) or (dir .. "/" .. name)
      local info = lf.getInfo(p)
      if info and info.type == "directory" then
        mark(p); walk(p)
      elseif info and info.type == "file" then
        mark(p); count = count + 1
      end
    end
  end
  walk(prefix or "")
  M.flush(reason or "snapshot")
  return count
end

return M
