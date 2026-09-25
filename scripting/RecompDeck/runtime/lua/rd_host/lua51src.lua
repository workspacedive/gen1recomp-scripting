-- rd_host/lua51src.lua
-- Source-level compatibility transform: LuaJIT 2.1 lexer extensions -> PUC Lua 5.1.
--
-- PUC Lua 5.1 does NOT reject unknown escapes; it silently keeps the letter.
-- So "\xc3\xa9" compiles fine under love.js but yields the 8-byte string
-- "xc3xa9" instead of the 2-byte UTF-8 sequence LuaJIT produces. The game
-- uses such escapes in 27 modules (font macros, UI arrows, currency signs).
--
-- This module rewrites, *inside short string literals only*:
--   \xHH      -> \DDD            (3-digit decimal escape, always 3 digits so a
--                                 following digit cannot merge into it)
--   \u{HHHH}  -> \DDD\DDD...     (UTF-8 bytes of the code point, <= 0x7FFFFFFF)
--   \z        -> (removed together with the whitespace that follows it)
-- Comments, long strings ([[...]], [==[...]==]) and code are copied verbatim.
-- Any other escape (\n, \\, \", \ddd, backslash-newline) is left untouched.
--
-- The result is byte-for-byte identical to the input when nothing needs to
-- change (fast path: one C-level pattern search). The transform runs in memory
-- at load time only; no modified copy of any game file is ever written.
--
-- Verified: tests/lua/lua51src_test.lua evaluates every rewritten literal with
-- LuaJIT (original) and Lua 5.1 (rewritten) and requires identical bytes.
--
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Part of RecompDeck. Contains no code from the gen1recomp project.

local find, sub, byte, char, format, rep = string.find, string.sub, string.byte,
  string.char, string.format, string.rep
local concat, tonumber, floor = table.concat, tonumber, math.floor

local M = {}

-- Quick reject: a backslash followed by x, z or u somewhere in the source.
-- (May have false positives such as "\\x" -- the lexer then changes nothing.)
function M.mayNeedTransform(src)
  return find(src, "\\[xzu]") ~= nil
end

local function decEscape(b)
  return format("\\%03d", b)
end

-- UTF-8 encoding (Lua 5.3 rules: up to 6 bytes for code points <= 0x7FFFFFFF).
local function utf8Escapes(cp)
  if cp < 0x80 then return decEscape(cp) end
  local bytes = {}
  local limit = 0x3F -- max value that still fits into the lead byte
  local n = 0
  while cp > limit do
    local cont = cp % 64
    n = n + 1
    bytes[n] = 0x80 + cont
    cp = floor(cp / 64)
    limit = floor(limit / 2)
  end
  -- lead byte: prefix of (n + 1) ones followed by a zero, then payload
  local prefix = 0
  local p = 0x80
  for _ = 0, n do prefix = prefix + p; p = p / 2 end
  local out = { decEscape(prefix + cp) }
  for i = n, 1, -1 do out[#out + 1] = decEscape(bytes[i]) end
  return concat(out)
end
M._utf8Escapes = utf8Escapes

-- If src[i] starts a long bracket "[" "="* "[", return level and the index of
-- the second "[". Otherwise nil.
local function longBracket(src, i)
  local j = i + 1
  local level = 0
  while byte(src, j) == 61 do level = level + 1; j = j + 1 end -- '='
  if byte(src, j) == 91 then return level, j end -- '['
  return nil
end

-- Index of the last character of the long bracket block opened at `open`
-- (index of its second "["), or #src when unterminated.
local function longBracketEnd(src, level, open)
  local close = "]" .. rep("=", level) .. "]"
  local e = find(src, close, open + 1, true)
  if not e then return #src end
  return e + #close - 1
end

-- Scan a short string starting at index s (the quote). Returns the rewritten
-- literal text, the index just after it, and the number of rewrites.
local function shortString(src, s, len)
  local q = byte(src, s)
  local stopPattern = (q == 34) and '[\\"\r\n]' or "[\\'\r\n]"
  local buf = {}
  local segStart = s
  local i = s + 1
  local changed = 0
  while true do
    local k = find(src, stopPattern, i)
    if not k then
      -- unterminated literal: copy the rest verbatim (the compiler will
      -- report it exactly as it would for the original source)
      buf[#buf + 1] = sub(src, segStart)
      return concat(buf), len + 1, changed
    end
    local kc = byte(src, k)
    if kc == q then
      buf[#buf + 1] = sub(src, segStart, k)
      return concat(buf), k + 1, changed
    elseif kc == 10 or kc == 13 then
      -- raw newline: unfinished string, leave as is
      buf[#buf + 1] = sub(src, segStart, k)
      return concat(buf), k + 1, changed
    else -- backslash
      local nc = byte(src, k + 1)
      if nc == 120 then -- \x
        local hex = sub(src, k + 2, k + 3)
        if #hex == 2 and find(hex, "^%x%x$") then
          buf[#buf + 1] = sub(src, segStart, k - 1)
          buf[#buf + 1] = decEscape(tonumber(hex, 16))
          changed = changed + 1
          segStart = k + 4
          i = k + 4
        else
          i = k + 2
        end
      elseif nc == 122 then -- \z : skip following whitespace
        buf[#buf + 1] = sub(src, segStart, k - 1)
        local _, e = find(src, "^[ \t\r\n\f\v]*", k + 2)
        segStart = e + 1
        i = e + 1
        changed = changed + 1
      elseif nc == 117 and byte(src, k + 2) == 123 then -- \u{...}
        local e = find(src, "}", k + 3, true)
        local hex = e and sub(src, k + 3, e - 1)
        if hex and #hex > 0 and find(hex, "^%x+$") then
          local cp = tonumber(hex, 16)
          if cp <= 0x7FFFFFFF then
            buf[#buf + 1] = sub(src, segStart, k - 1)
            buf[#buf + 1] = utf8Escapes(cp)
            changed = changed + 1
            segStart = e + 1
            i = e + 1
          else
            i = k + 2
          end
        else
          i = k + 2
        end
      elseif nc == 13 or nc == 10 then
        -- backslash-newline; a CRLF / LFCR pair counts as one newline
        local nn = byte(src, k + 2)
        if (nc == 13 and nn == 10) or (nc == 10 and nn == 13) then
          i = k + 3
        else
          i = k + 2
        end
      else
        -- any other escape: skip the escaped character
        i = k + 2
      end
    end
  end
end

-- List every short-string literal token (raw source text) in order. Used by
-- the differential test; shares the scanner with transform().
function M.literals(src)
  local len = #src
  local lits = {}
  local pos = 1
  if byte(src, 1) == 35 then pos = (find(src, "\n", 1, true) or len) + 1 end
  while pos <= len do
    local s = find(src, "[%-%[\"']", pos)
    if not s then break end
    local c = byte(src, s)
    if c == 45 then
      if byte(src, s + 1) == 45 then
        local stop
        if byte(src, s + 2) == 91 then
          local level, open = longBracket(src, s + 2)
          if level then stop = longBracketEnd(src, level, open) end
        end
        pos = (stop or find(src, "\n", s + 2, true) or len) + 1
      else
        pos = s + 1
      end
    elseif c == 91 then
      local level, open = longBracket(src, s)
      pos = (level and longBracketEnd(src, level, open) or s) + 1
    else
      local _, nextPos = shortString(src, s, len)
      lits[#lits + 1] = sub(src, s, nextPos - 1)
      pos = nextPos
    end
  end
  return lits
end

-- Transform a complete chunk. Returns (newSource, rewriteCount).
function M.transform(src)
  if type(src) ~= "string" or not M.mayNeedTransform(src) then return src, 0 end
  local len = #src
  local out = {}
  local pos = 1
  local total = 0
  -- a leading "#" line (shebang) is not Lua syntax; copy it untouched
  if byte(src, 1) == 35 then
    local e = find(src, "\n", 1, true) or len
    out[1] = sub(src, 1, e)
    pos = e + 1
  end
  while pos <= len do
    local s = find(src, "[%-%[\"']", pos)
    if not s then
      out[#out + 1] = sub(src, pos)
      break
    end
    local c = byte(src, s)
    if c == 45 then -- '-'
      if byte(src, s + 1) == 45 then
        local stop
        if byte(src, s + 2) == 91 then
          local level, open = longBracket(src, s + 2)
          if level then stop = longBracketEnd(src, level, open) end
        end
        if not stop then
          stop = find(src, "\n", s + 2, true) or len
        end
        out[#out + 1] = sub(src, pos, stop)
        pos = stop + 1
      else
        out[#out + 1] = sub(src, pos, s)
        pos = s + 1
      end
    elseif c == 91 then -- '['
      local level, open = longBracket(src, s)
      if level then
        local stop = longBracketEnd(src, level, open)
        out[#out + 1] = sub(src, pos, stop)
        pos = stop + 1
      else
        out[#out + 1] = sub(src, pos, s)
        pos = s + 1
      end
    else -- quote
      out[#out + 1] = sub(src, pos, s - 1)
      local lit, nextPos, changed = shortString(src, s, len)
      out[#out + 1] = lit
      total = total + changed
      pos = nextPos
    end
  end
  if total == 0 then return src, 0 end
  return concat(out), total
end

return M
