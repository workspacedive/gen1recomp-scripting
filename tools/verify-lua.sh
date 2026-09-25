#!/usr/bin/env bash
# Full Lua verification of the RecompDeck compatibility layer (SKILLS.md S5/S6).
#   1. rd_host/bit.lua vs LuaJIT's native bit (byte-identical output)
#   2. rd_host/lua51src.lua escape transform vs LuaJIT literal semantics over
#      every upstream file with Lua 5.2+/LuaJIT escapes (byte-identical output)
#   3. upstream gen1recomp test tiers: LuaJIT baseline vs Lua 5.1 + compat;
#      the set of extra failures must equal tests/lua/expected_compat_failures.txt
# Usage: tools/verify-lua.sh [gen1recomp checkout]   (default: .cache/gen1recomp)
# Env:   RD_LUA51 / RD_LUAJIT (interpreters), RD_VERIFY_OUT (log dir)
# SPDX-License-Identifier: GPL-3.0-or-later
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UP="$(cd "${1:-$HERE/.cache/gen1recomp}" && pwd)"
pick() { if [ -x "$HERE/.cache/lua/bin/$1" ]; then echo "$HERE/.cache/lua/bin/$1"; else command -v "$1"; fi; }
L51="${RD_LUA51:-$(pick lua5.1)}"
LJ="${RD_LUAJIT:-$(pick luajit)}"
OUT="${RD_VERIFY_OUT:-$HERE/.cache/verify}"
mkdir -p "$OUT"
[ -x "$L51" ] && [ -x "$LJ" ] || { echo "need lua5.1 and luajit (tools/setup-lua.sh)"; exit 2; }
[ -f "$UP/tests/run_engine.lua" ] || { echo "not a gen1recomp checkout: $UP"; exit 2; }
# modkit tooling spawns `luajit` itself (MK100 otherwise) -> expose ours.
export PATH="$(dirname "$LJ"):$PATH" MODKIT_LUAJIT="$LJ"
fail=0
ok()  { printf '  PASS %s\n' "$*"; }
bad() { printf '  FAIL %s\n' "$*"; fail=1; }
cd "$HERE"

echo "== 1. bit library differential"
"$LJ"  tests/lua/bit_differential.lua native  > "$OUT/bit_native.txt"
"$L51" tests/lua/bit_differential.lua rd_host > "$OUT/bit_rd.txt"
if cmp -s "$OUT/bit_native.txt" "$OUT/bit_rd.txt"; then ok "identical ($(wc -l < "$OUT/bit_rd.txt") lines)"; else bad "bit outputs differ"; fi

echo "== 2. escape-transform literal differential"
python3 tools/audit/lua_escape_scan.py "$UP" "$OUT/escapes.json" > "$OUT/escapes.txt"
mapfile -t FILES < <(python3 -c "import json,sys; [print(sys.argv[1]+'/'+f) for f in sorted(json.load(open(sys.argv[2])))]" "$UP" "$OUT/escapes.json")
"$LJ"  tests/lua/lua51src_literals.lua orig  "${FILES[@]}" > "$OUT/lit_orig.txt"
"$L51" tests/lua/lua51src_literals.lua xform "${FILES[@]}" > "$OUT/lit_xform.txt" 2> "$OUT/lit_xform.err"
if [ "${#FILES[@]}" -gt 0 ] && cmp -s "$OUT/lit_orig.txt" "$OUT/lit_xform.txt"; then
  shipped=""
  if [ -f "$HERE/.cache/game-0.3.14.love" ]; then
    shipped=$(python3 -c "import json,sys,zipfile; n=set(zipfile.ZipFile(sys.argv[2]).namelist()); print(sum(f in n for f in json.load(open(sys.argv[1]))))" "$OUT/escapes.json" "$HERE/.cache/game-0.3.14.love")
    shipped=" ($shipped of them in the shipped game archive)"
  fi
  ok "${#FILES[@]} files$shipped, $(wc -l < "$OUT/lit_orig.txt") literal lines identical"
else bad "literal outputs differ (see $OUT/lit_*.txt)"; fi

echo "== 3. upstream test tiers (LuaJIT baseline vs Lua 5.1 + compat)"
tier() { # name runner
  (cd "$UP" && "$LJ" "tests/$2" > "$OUT/base_$1.log" 2>&1)
  (cd "$UP" && RD_LUA51="$L51" "$HERE/tools/lua51compat" "tests/$2" > "$OUT/c51_$1.log" 2>&1)
  printf '  %-12s luajit: %-22s compat: %s\n' "$1" "$(tail -n 1 "$OUT/base_$1.log")" "$(tail -n 1 "$OUT/c51_$1.log")"
}
tier engine run_engine.lua
tier gen2 run_gen2.lua
tier modkit run_modkit.lua
tier modkit_tools modkit_tests.lua
expect() { # tier regex: both VMs must end with a line matching regex
  local b c; b="$(tail -n 1 "$OUT/base_$1.log")"; c="$(tail -n 1 "$OUT/c51_$1.log")"
  if [[ "$b" =~ $2 ]] && [[ "$c" =~ $2 ]] && [ "$b" = "$c" ]; then ok "$1: $c (both VMs)"; else bad "$1: luajit='$b' compat='$c'"; fi
}
expect gen2 '^ALL TESTS PASSED$'
expect modkit '^ALL TESTS PASSED$'
expect modkit_tools '^modkit: ([0-9]+)/([0-9]+) checks passed$'
tools_line="$(tail -n 1 "$OUT/c51_modkit_tools.log")"
if [[ "$tools_line" =~ ([0-9]+)/([0-9]+) ]] && [ "${BASH_REMATCH[1]}" != "${BASH_REMATCH[2]}" ]; then bad "modkit_tools not complete: $tools_line"; fi
b_ok=$(grep -cE '^ok   tests/' "$OUT/base_engine.log"); c_ok=$(grep -cE '^ok   tests/' "$OUT/c51_engine.log")
total=$(( b_ok + $(grep -cE '^FAIL tests/' "$OUT/base_engine.log") ))
echo "  engine: luajit $b_ok/$total, compat $c_ok/$total"
comm -13 <(grep -E '^FAIL tests/' "$OUT/base_engine.log" | sed 's/^FAIL //' | sort -u) \
         <(grep -E '^FAIL tests/' "$OUT/c51_engine.log"  | sed 's/^FAIL //' | sort -u) > "$OUT/engine_extra_failures.txt"
if diff -u <(grep -vE '^(#|$)' tests/lua/expected_compat_failures.txt | sort) "$OUT/engine_extra_failures.txt" > "$OUT/engine_extra_failures.diff"; then
  ok "engine extra failures == expected list ($(wc -l < "$OUT/engine_extra_failures.txt") Gen 3/goto entries)"
else bad "engine extra failures deviate from expected list:"; cat "$OUT/engine_extra_failures.diff"; fi

echo
if [ $fail -eq 0 ]; then echo "verify-lua: ALL CHECKS PASSED (logs: $OUT)"; else echo "verify-lua: FAILURES (logs: $OUT)"; fi
exit $fail
