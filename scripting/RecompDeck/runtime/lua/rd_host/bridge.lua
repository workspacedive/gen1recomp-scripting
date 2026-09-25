-- rd_host/bridge.lua
-- Lua <-> JavaScript bridge for the love.js runtime.
--
-- Outbound (Lua -> page), synchronous:
--   A line "<MARK><json>\n" written to stdout reaches the page's Module.print
--   handler *inside the same call stack* (Emscripten's TTY is line buffered).
--   For request/response calls the page writes the reply to /rd/reply/<id>
--   before returning, so bridge.call() is a synchronous RPC with no polling.
--
-- Inbound (page -> Lua), asynchronous:
--   The page writes /rd/inbox/<n>.json and bumps /rd/inbox/head. poll() is
--   called once per frame by rd_host.boot and dispatches new messages to
--   handlers registered with bridge.on(topic, fn).
--
-- Every inbound message is size-limited and schema-checked; unknown topics
-- are ignored. Nothing coming from the page is ever executed as code.
--
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Part of RecompDeck. Contains no code from the gen1recomp project.

local json = require("rd_host.json")

local M = {
  MARK = "\001RDB\001",
  seq = 0,
  handlers = {},
  inboxSeen = 0,
  replyDir = "/rd/reply",
  inboxDir = "/rd/inbox",
  enabled = true,
  maxInbound = 1024 * 1024,
}

local stdout = io.stdout
local open, remove = io.open, os.remove
local tostring, type, pcall = tostring, type, pcall

local function emit(obj)
  if not M.enabled then return false end
  local ok, line = pcall(json.encode, obj)
  if not ok then return false end
  stdout:write(M.MARK, line, "\n")
  stdout:flush()
  return true
end

-- Fire-and-forget notification.
function M.notify(topic, data)
  M.seq = M.seq + 1
  return emit({ id = M.seq, topic = topic, data = data })
end

local function readFile(path, limit)
  local f = open(path, "rb")
  if not f then return nil end
  local s = f:read(limit or "*a")
  f:close()
  return s
end

-- Synchronous request. Returns result or nil, error.
function M.call(topic, data)
  M.seq = M.seq + 1
  local id = M.seq
  if not emit({ id = id, topic = topic, data = data, wantsReply = true }) then
    return nil, "bridge disabled"
  end
  local path = M.replyDir .. "/" .. id .. ".json"
  local s = readFile(path, M.maxInbound)
  if not s then return nil, "no reply from host for " .. tostring(topic) end
  remove(path)
  local reply, err = json.decode(s)
  if type(reply) ~= "table" then return nil, "bad reply: " .. tostring(err) end
  if reply.error ~= nil and reply.error ~= json.null then
    return nil, tostring(reply.error)
  end
  return reply.result
end

function M.on(topic, fn)
  M.handlers[topic] = fn
end

-- Dispatch pending inbound messages. Cheap when idle: one small file read.
function M.poll()
  local head = readFile(M.inboxDir .. "/head", 32)
  local n = tonumber(head)
  if not n or n <= M.inboxSeen then return 0 end
  local handled = 0
  for i = M.inboxSeen + 1, n do
    local path = M.inboxDir .. "/" .. i .. ".json"
    local s = readFile(path, M.maxInbound)
    remove(path)
    local msg = s and json.decode(s)
    if type(msg) == "table" and type(msg.topic) == "string" then
      local fn = M.handlers[msg.topic]
      if fn then
        local ok, err = pcall(fn, msg.data)
        if not ok then M.notify("log", { level = "error", text = "handler " .. msg.topic .. ": " .. tostring(err) }) end
        handled = handled + 1
      end
    end
  end
  M.inboxSeen = n
  return handled
end

function M.log(level, text)
  return M.notify("log", { level = level, text = tostring(text) })
end

return M
