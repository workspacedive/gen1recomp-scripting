-- rd_host/json.lua
-- Minimal, strict JSON encoder/decoder for bridge messages (Lua 5.1).
-- Only what the bridge needs: objects, arrays, strings, numbers, booleans,
-- null (decoded to rd_host.json.null). Rejects trailing garbage, deep
-- nesting (> 64) and oversized input (> 4 MiB) to keep the bridge robust
-- against malformed messages.
--
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Part of RecompDeck. Contains no code from the gen1recomp project.

local byte, char, sub, find, format, concat = string.byte, string.char,
  string.sub, string.find, string.format, table.concat
local floor, huge = math.floor, math.huge
local type, pairs, ipairs, tostring, tonumber, error, next, setmetatable =
  type, pairs, ipairs, tostring, tonumber, error, next, setmetatable

local M = {}
M.null = setmetatable({}, { __tostring = function() return "null" end })

local MAX_DEPTH = 64
local MAX_INPUT = 4 * 1024 * 1024

local ESC = { ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b', ['\f'] = '\\f',
              ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }

local function encodeString(s)
  return '"' .. s:gsub('[%z\1-\31"\\]', function(c)
    return ESC[c] or format("\\u%04x", byte(c))
  end) .. '"'
end

local function isArray(t)
  local n = 0
  for k in pairs(t) do
    if type(k) ~= "number" or k < 1 or k ~= floor(k) then return false end
    if k > n then n = k end
  end
  for i = 1, n do if t[i] == nil then return false end end
  return true, n
end

local encodeValue
encodeValue = function(v, depth)
  if depth > MAX_DEPTH then error("json: nesting too deep", 0) end
  local t = type(v)
  if v == nil or v == M.null then return "null"
  elseif t == "boolean" then return v and "true" or "false"
  elseif t == "number" then
    if v ~= v or v == huge or v == -huge then return "null" end
    if v == floor(v) and v > -1e15 and v < 1e15 then return format("%d", v) end
    return format("%.17g", v)
  elseif t == "string" then return encodeString(v)
  elseif t == "table" then
    if next(v) == nil then return "{}" end
    local arr, n = isArray(v)
    local parts = {}
    if arr then
      for i = 1, n do parts[i] = encodeValue(v[i], depth + 1) end
      return "[" .. concat(parts, ",") .. "]"
    end
    for k, val in pairs(v) do
      if type(k) == "string" then
        parts[#parts + 1] = encodeString(k) .. ":" .. encodeValue(val, depth + 1)
      end
    end
    return "{" .. concat(parts, ",") .. "}"
  end
  error("json: cannot encode " .. t, 0)
end

function M.encode(v) return encodeValue(v, 0) end

-- decoder -----------------------------------------------------------------
local function skipWs(s, i)
  local _, e = find(s, "^[ \t\r\n]*", i)
  return e + 1
end

local function utf8(cp)
  if cp < 0x80 then return char(cp) end
  if cp < 0x800 then return char(0xC0 + floor(cp / 64), 0x80 + cp % 64) end
  if cp < 0x10000 then
    return char(0xE0 + floor(cp / 4096), 0x80 + floor(cp / 64) % 64, 0x80 + cp % 64)
  end
  return char(0xF0 + floor(cp / 262144), 0x80 + floor(cp / 4096) % 64,
    0x80 + floor(cp / 64) % 64, 0x80 + cp % 64)
end

local UNESC = { ['"'] = '"', ['\\'] = '\\', ['/'] = '/', b = '\b', f = '\f',
                n = '\n', r = '\r', t = '\t' }

local decodeValue

local function decodeString(s, i)
  local out, j = {}, i + 1
  while true do
    local k = find(s, '["\\%z\1-\31]', j)
    if not k then error("json: unterminated string", 0) end
    local c = sub(s, k, k)
    if c == '"' then
      out[#out + 1] = sub(s, j, k - 1)
      return concat(out), k + 1
    elseif c == "\\" then
      out[#out + 1] = sub(s, j, k - 1)
      local e = sub(s, k + 1, k + 1)
      if e == "u" then
        local hex = sub(s, k + 2, k + 5)
        if not find(hex, "^%x%x%x%x$") then error("json: bad \\u escape", 0) end
        local cp = tonumber(hex, 16)
        local nextJ = k + 6
        if cp >= 0xD800 and cp <= 0xDBFF and sub(s, nextJ, nextJ + 1) == "\\u" then
          local lo = tonumber(sub(s, nextJ + 2, nextJ + 5), 16)
          if lo and lo >= 0xDC00 and lo <= 0xDFFF then
            cp = 0x10000 + (cp - 0xD800) * 1024 + (lo - 0xDC00)
            nextJ = nextJ + 6
          end
        end
        out[#out + 1] = utf8(cp)
        j = nextJ
      elseif UNESC[e] then
        out[#out + 1] = UNESC[e]
        j = k + 2
      else
        error("json: bad escape", 0)
      end
    else
      error("json: control character in string", 0)
    end
  end
end

decodeValue = function(s, i, depth)
  if depth > MAX_DEPTH then error("json: nesting too deep", 0) end
  i = skipWs(s, i)
  local c = sub(s, i, i)
  if c == "{" then
    local obj = {}
    i = skipWs(s, i + 1)
    if sub(s, i, i) == "}" then return obj, i + 1 end
    while true do
      if sub(s, i, i) ~= '"' then error("json: object key expected", 0) end
      local key
      key, i = decodeString(s, i)
      i = skipWs(s, i)
      if sub(s, i, i) ~= ":" then error("json: ':' expected", 0) end
      local val
      val, i = decodeValue(s, i + 1, depth + 1)
      obj[key] = val
      i = skipWs(s, i)
      local d = sub(s, i, i)
      if d == "}" then return obj, i + 1 end
      if d ~= "," then error("json: ',' or '}' expected", 0) end
      i = skipWs(s, i + 1)
    end
  elseif c == "[" then
    local arr, n = {}, 0
    i = skipWs(s, i + 1)
    if sub(s, i, i) == "]" then return arr, i + 1 end
    while true do
      local val
      val, i = decodeValue(s, i, depth + 1)
      n = n + 1
      arr[n] = val
      i = skipWs(s, i)
      local d = sub(s, i, i)
      if d == "]" then return arr, i + 1 end
      if d ~= "," then error("json: ',' or ']' expected", 0) end
      i = i + 1
    end
  elseif c == '"' then
    return decodeString(s, i)
  elseif find(s, "^true", i) then return true, i + 4
  elseif find(s, "^false", i) then return false, i + 5
  elseif find(s, "^null", i) then return M.null, i + 4
  else
    local _, e = find(s, "^-?%d+%.?%d*[eE]?[-+]?%d*", i)
    if not e or e < i then error("json: unexpected character at " .. i, 0) end
    local num = tonumber(sub(s, i, e))
    if not num then error("json: bad number", 0) end
    return num, e + 1
  end
end

function M.decode(s)
  if type(s) ~= "string" then return nil, "json: string expected" end
  if #s > MAX_INPUT then return nil, "json: input too large" end
  local ok, v, i = pcall(decodeValue, s, 1, 0)
  if not ok then return nil, v end
  if skipWs(s, i) <= #s then return nil, "json: trailing garbage" end
  return v
end

return M
