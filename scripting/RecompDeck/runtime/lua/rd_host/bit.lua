-- rd_host/bit.lua
-- Pure Lua 5.1 implementation of the LuaBitOp API ("bit" module) that LuaJIT
-- ships built in. love.js runs PUC Lua 5.1, which has no bit library, while
-- the game requires it in ~40 modules (`local bit = require("bit")`).
--
-- Semantics follow LuaBitOp / LuaJIT exactly:
--   * every argument is normalised to a 32-bit integer (tobit),
--   * every result is a SIGNED 32-bit integer in [-2^31, 2^31 - 1],
--   * shift counts use only their low 5 bits (x << 33 == x << 1).
-- Verified bit-for-bit against LuaJIT 2.1 by tests/lua/bit_differential.lua.
--
-- Performance: bitwise and/or/xor use a 256x256 byte lookup table (4 table
-- reads per operation instead of a 32-step loop); shifts are pure arithmetic.
-- Common fast paths (non-negative operands, low masks) avoid the byte split.
--
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Part of RecompDeck (unofficial Scripting frontend). Contains no code from
-- the gen1recomp project.

local floor = math.floor
local fmod = math.fmod
local type, tonumber, error, select = type, tonumber, error, select
local char, format = string.char, string.format

local TWO32 = 4294967296   -- 2^32
local TWO31 = 2147483648   -- 2^31

local M = { _NAME = "bit", _VERSION = "rd_host.bit 1.0 (LuaBitOp 1.0.2 compatible)" }

-- Normalise any number to an unsigned 32-bit integer in [0, 2^32).
-- LuaJIT converts with round-to-nearest-even via the 2^52+2^51 trick; for the
-- integral inputs the game uses (and for all halves) this matches exactly.
local function tou32(x)
  -- `+ 0` turns an IEEE negative zero into +0 (LuaJIT never yields -0)
  if x >= 0 and x < TWO32 and x == floor(x) then return x + 0 end
  if x ~= x or x == 1/0 or x == -1/0 then return 0 end
  -- round half to even, like the FPU conversion LuaJIT performs
  local r = floor(x + 0.5)
  if r - x == 0.5 and fmod(r, 2) ~= 0 then r = r - 1 end
  r = fmod(r, TWO32)
  if r < 0 then r = r + TWO32 end
  return r + 0
end

local function tos32(u)
  if u >= TWO31 then return u - TWO32 end
  return u
end

local function checknum(x, fname, argn)
  local t = type(x)
  if t == "number" then return x end
  if t == "string" then
    local n = tonumber(x)
    if n then return n end
  end
  error(format("bad argument #%d to '%s' (number expected, got %s)",
    argn or 1, fname, t == "string" and "string" or t), 3)
end

-- 256x256 lookup tables for byte-wise and/or/xor. Index: a*256 + b + 1.
local AND8, OR8, XOR8 = {}, {}, {}
do
  for a = 0, 255 do
    for b = 0, 255 do
      local ra, ro, rx = 0, 0, 0
      local x, y, p = a, b, 1
      for _ = 1, 8 do
        local xb, yb = x % 2, y % 2
        if xb == 1 and yb == 1 then ra = ra + p end
        if xb == 1 or yb == 1 then ro = ro + p end
        if xb ~= yb then rx = rx + p end
        x = (x - xb) / 2; y = (y - yb) / 2; p = p * 2
      end
      local i = a * 256 + b + 1
      AND8[i], OR8[i], XOR8[i] = ra, ro, rx
    end
  end
end

-- Generic byte-wise combination of two unsigned 32-bit values.
local function combine(T, a, b)
  local a0 = a % 256; a = (a - a0) / 256
  local b0 = b % 256; b = (b - b0) / 256
  local a1 = a % 256; a = (a - a1) / 256
  local b1 = b % 256; b = (b - b1) / 256
  local a2 = a % 256; a = (a - a2) / 256
  local b2 = b % 256; b = (b - b2) / 256
  -- a, b now hold the top byte
  return T[a0 * 256 + b0 + 1]
       + T[a1 * 256 + b1 + 1] * 256
       + T[a2 * 256 + b2 + 1] * 65536
       + T[a * 256 + b + 1] * 16777216
end

-- Low-bit masks 2^k - 1 (k = 1..31) for the band(x, mask) fast path.
local LOWMASK = {}
do
  local p = 2
  for _ = 1, 31 do LOWMASK[p - 1] = p; p = p * 2 end
end

function M.tobit(x)
  x = checknum(x, "tobit")
  return tos32(tou32(x))
end

function M.bnot(x)
  x = checknum(x, "bnot")
  return tos32(TWO32 - 1 - tou32(x))
end

local function band2(a, b)
  -- fast path: mask with a low contiguous mask and a non-negative value
  local m = LOWMASK[b]
  if m and a >= 0 and a < TWO32 and a == floor(a) then return a % m end
  m = LOWMASK[a]
  if m and b >= 0 and b < TWO32 and b == floor(b) then return b % m end
  return combine(AND8, tou32(a), tou32(b))
end

function M.band(a, b, ...)
  a = checknum(a, "band", 1); b = checknum(b == nil and -1 or b, "band", 2)
  local r = band2(a, b)
  local n = select("#", ...)
  if n > 0 then
    for i = 1, n do
      r = band2(r, checknum((select(i, ...)), "band", i + 2))
    end
  end
  return tos32(r)
end

function M.bor(a, b, ...)
  a = checknum(a, "bor", 1); b = checknum(b == nil and 0 or b, "bor", 2)
  local r = combine(OR8, tou32(a), tou32(b))
  local n = select("#", ...)
  if n > 0 then
    for i = 1, n do
      r = combine(OR8, r, tou32(checknum((select(i, ...)), "bor", i + 2)))
    end
  end
  return tos32(r)
end

function M.bxor(a, b, ...)
  a = checknum(a, "bxor", 1); b = checknum(b == nil and 0 or b, "bxor", 2)
  local r = combine(XOR8, tou32(a), tou32(b))
  local n = select("#", ...)
  if n > 0 then
    for i = 1, n do
      r = combine(XOR8, r, tou32(checknum((select(i, ...)), "bxor", i + 2)))
    end
  end
  return tos32(r)
end

-- Powers of two 2^0 .. 2^32 for shifts. Every shift below keeps all
-- intermediate values < 2^32, far inside the 2^53 exact-integer range of a
-- double, so no precision is ever lost.
local POW2 = {}
do
  local p = 1
  for i = 0, 32 do POW2[i] = p; p = p * 2 end
end

local function shiftcount(n, fname)
  n = checknum(n, fname, 2)
  return tou32(n) % 32
end

function M.lshift(x, n)
  x = tou32(checknum(x, "lshift", 1)); n = shiftcount(n, "lshift")
  -- only the low (32 - n) bits survive; mask first, then shift (exact)
  return tos32((x % POW2[32 - n]) * POW2[n])
end

function M.rshift(x, n)
  x = tou32(checknum(x, "rshift", 1)); n = shiftcount(n, "rshift")
  return tos32(floor(x / POW2[n]))
end

function M.arshift(x, n)
  x = tos32(tou32(checknum(x, "arshift", 1))); n = shiftcount(n, "arshift")
  -- floor division on the signed value is an arithmetic shift
  return tos32(tou32(floor(x / POW2[n])))
end

function M.rol(x, n)
  x = tou32(checknum(x, "rol", 1)); n = shiftcount(n, "rol")
  if n == 0 then return tos32(x) end
  local hi = (x % POW2[32 - n]) * POW2[n]
  local lo = floor(x / POW2[32 - n])
  return tos32(hi + lo)
end

function M.ror(x, n)
  x = tou32(checknum(x, "ror", 1)); n = shiftcount(n, "ror")
  if n == 0 then return tos32(x) end
  local lo = floor(x / POW2[n])
  local hi = (x % POW2[n]) * POW2[32 - n]
  return tos32(hi + lo)
end

function M.bswap(x)
  x = tou32(checknum(x, "bswap", 1))
  local b0 = x % 256; x = (x - b0) / 256
  local b1 = x % 256; x = (x - b1) / 256
  local b2 = x % 256; x = (x - b2) / 256
  return tos32(((b0 * 256 + b1) * 256 + b2) * 256 + x)
end

local HEXDIGITS_L = "0123456789abcdef"
local HEXDIGITS_U = "0123456789ABCDEF"

-- bit.tohex(x [, n]): n > 0 lowercase n digits, n < 0 uppercase |n| digits,
-- default 8 lowercase digits. Only the low 4*|n| bits are shown (n <= 8).
function M.tohex(x, n)
  x = tou32(checknum(x, "tohex", 1))
  if n == nil then n = 8 else n = tos32(tou32(checknum(n, "tohex", 2))) end
  local digits = HEXDIGITS_L
  if n < 0 then n = -n; digits = HEXDIGITS_U end
  if n > 8 then n = 8 end
  local out = {}
  for i = n, 1, -1 do
    local d = x % 16
    out[i] = digits:sub(d + 1, d + 1)
    x = (x - d) / 16
  end
  return table.concat(out)
end

return M
