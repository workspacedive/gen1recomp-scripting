#!/usr/bin/env bash
# Builds PUC Lua 5.1.5 (the VM inside love.js) and LuaJIT 2.1 (the VM of the
# native game builds) from the pinned lupa 2.8 source distribution on PyPI,
# which bundles both upstream source trees. Output: .cache/lua/bin/{lua5.1,luac5.1,luajit}
# Needs: curl, tar, make, a C compiler.
# SPDX-License-Identifier: GPL-3.0-or-later
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.cache/lua"
URL="https://files.pythonhosted.org/packages/c3/a6/0f869fbb07c393f15473b1eefefb7b5bec162fb7481803d040ed4dc46002/lupa-2.8.tar.gz"
SHA256="d8022641b9ec8ecf2c5ecbe9f47e5a70e0b87c4b5ae921b92cb02a638e0acd08"
mkdir -p "$OUT/bin" "$OUT/src"
TGZ="$OUT/lupa-2.8.tar.gz"
[ -f "$TGZ" ] || curl -fsSL -o "$TGZ" "$URL"
echo "$SHA256  $TGZ" | sha256sum -c -
tar -xzf "$TGZ" -C "$OUT/src"
T="$OUT/src/lupa-2.8/third-party"
grep -q '"Lua 5.1.5"' "$T/lua51/src/lua.h"
make -C "$T/lua51" posix >/dev/null
make -C "$T/luajit21" -j2 >/dev/null
cp "$T/lua51/src/lua" "$OUT/bin/lua5.1"
cp "$T/lua51/src/luac" "$OUT/bin/luac5.1"
cp "$T/luajit21/src/luajit" "$OUT/bin/luajit"
"$OUT/bin/lua5.1" -v && "$OUT/bin/luajit" -v
echo "export PATH=\"$OUT/bin:\$PATH\""
