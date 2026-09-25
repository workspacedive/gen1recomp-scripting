-- tests/lua/bit_differential.lua
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Differential test: prints the result of every LuaBitOp function for a fixed,
-- deterministic vector set. Run once with LuaJIT's native `bit` and once with
-- rd_host/bit.lua under PUC Lua 5.1; the outputs must be byte-identical.
--
--   luajit  tests/lua/bit_differential.lua native  > a.txt
--   lua5.1  tests/lua/bit_differential.lua rd_host > b.txt
--   cmp a.txt b.txt
--
-- The PRNG is Park-Miller (all intermediates < 2^53), so both VMs generate
-- exactly the same vectors.

local which = arg and arg[1] or "rd_host"
local bit
if which == "native" then
  bit = require("bit")
else
  package.path = "scripting/RecompDeck/runtime/lua/?.lua;" .. package.path
  bit = require("rd_host.bit")
end

local seed = 20260925
local function rnd()
  seed = (seed * 16807) % 2147483647
  return seed
end
local function r32()
  local hi = rnd() % 65536
  local lo = rnd() % 65536
  return hi * 65536 + lo
end

local specials = {
  0, 1, -1, 2, -2, 7, 8, 15, 16, 31, 32, 33, 63, 64, 255, 256, 0xFF, 0xFFFF,
  0x7FFF, 0x8000, 0x7FFFFFFF, 0x80000000, 0xFFFFFFFF, -0x80000000, -0x7FFFFFFF,
  0x100000000, 0x1FFFFFFFF, -0x100000000, 2^40 + 3, -(2^40) - 3, 2^52, -(2^52),
  0.5, 1.5, 2.5, -0.5, -1.5, -2.5, 3.7, -3.7, 1e9, -1e9, 123456789, -123456789,
  0xDEADBEEF, 0xCAFEBABE, 0x12345678, 0x87654321, 0x0F0F0F0F, 0xF0F0F0F0,
}

local vals = {}
for _, v in ipairs(specials) do vals[#vals + 1] = v end
for _ = 1, 400 do vals[#vals + 1] = r32() end
for _ = 1, 200 do vals[#vals + 1] = r32() - 2147483648 end
for _ = 1, 50 do vals[#vals + 1] = (rnd() % 1000000) / 7 end

local out = {}
local function emit(s) out[#out + 1] = s end
local function fmt(v)
  if v ~= v then return "nan" end
  return string.format("%.17g", v)
end

for i, a in ipairs(vals) do
  emit(("tobit %s = %s"):format(fmt(a), fmt(bit.tobit(a))))
  emit(("bnot %s = %s"):format(fmt(a), fmt(bit.bnot(a))))
  emit(("bswap %s = %s"):format(fmt(a), fmt(bit.bswap(a))))
  emit(("tohex %s = %s %s %s"):format(fmt(a), bit.tohex(a), bit.tohex(a, 4), bit.tohex(a, -3)))
  for s = 0, 40, 3 do
    emit(("shifts %s %d = %s %s %s %s %s"):format(fmt(a), s,
      fmt(bit.lshift(a, s)), fmt(bit.rshift(a, s)), fmt(bit.arshift(a, s)),
      fmt(bit.rol(a, s)), fmt(bit.ror(a, s))))
  end
  local b = vals[(i * 7) % #vals + 1]
  local c = vals[(i * 13) % #vals + 1]
  emit(("band %s %s = %s"):format(fmt(a), fmt(b), fmt(bit.band(a, b))))
  emit(("bor %s %s = %s"):format(fmt(a), fmt(b), fmt(bit.bor(a, b))))
  emit(("bxor %s %s = %s"):format(fmt(a), fmt(b), fmt(bit.bxor(a, b))))
  emit(("band3 = %s  bor3 = %s  bxor3 = %s"):format(
    fmt(bit.band(a, b, c)), fmt(bit.bor(a, b, c)), fmt(bit.bxor(a, b, c))))
  for _, m in ipairs({ 0x1, 0x3, 0x7, 0xF, 0x1F, 0xFF, 0xFFF, 0xFFFF, 0x7FFFFFFF }) do
    emit(("bandmask %s %d = %s %s"):format(fmt(a), m, fmt(bit.band(a, m)), fmt(bit.band(m, a))))
  end
end

io.write(table.concat(out, "\n"), "\n")
