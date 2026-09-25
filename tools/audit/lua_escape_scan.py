#!/usr/bin/env python3
"""Proper Lua lexer scan: find string literals (short strings only; long brackets do not
process escapes) that use escapes unsupported by PUC Lua 5.1 but supported by LuaJIT 2.1:
\\xXX, \\z, \\u{XXX}. Comments and long strings are skipped correctly."""
import os, re, sys, json

def scan(src):
    i, n, hits = 0, len(src), []
    line = 1
    while i < n:
        c = src[i]
        if c == '\n': line += 1; i += 1; continue
        if src.startswith('--', i):
            m = re.match(r'--\[(=*)\[', src[i:])
            if m:
                close = ']' + m.group(1) + ']'
                j = src.find(close, i + len(m.group(0)))
                j = n if j < 0 else j + len(close)
                line += src.count('\n', i, j); i = j; continue
            j = src.find('\n', i); i = n if j < 0 else j; continue
        if c == '[':
            m = re.match(r'\[(=*)\[', src[i:])
            if m:
                close = ']' + m.group(1) + ']'
                j = src.find(close, i + len(m.group(0)))
                j = n if j < 0 else j + len(close)
                line += src.count('\n', i, j); i = j; continue
        if c in '"\'':
            q = c; j = i + 1; kinds = set()
            while j < n and src[j] != q:
                if src[j] == '\\':
                    nx = src[j+1] if j + 1 < n else ''
                    if nx == 'x': kinds.add('x')
                    elif nx == 'z': kinds.add('z')
                    elif nx == 'u' and j + 2 < n and src[j+2] == '{': kinds.add('u')
                    if nx == '\n': line += 1
                    j += 2; continue
                if src[j] == '\n': break
                j += 1
            if kinds: hits.append((line, sorted(kinds)))
            i = j + 1; continue
        i += 1
    return hits

LAUNCHER = {"src/import/LauncherView.lua","src/import/LauncherSettings.lua","src/import/OnlinePanel.lua",
            "src/import/CartLabelArt.lua","src/import/CartShape.lua","src/mods/LauncherMods.lua","src/import/RomImporter.lua"}
root = sys.argv[1]; out = {}
for dp, dns, fns in os.walk(root):
    for fn in fns:
        if fn.endswith('.lua'):
            p = os.path.join(dp, fn); rel = os.path.relpath(p, root)
            h = scan(open(p, encoding='utf-8', errors='replace').read())
            if h: out[rel] = h
json.dump(out, open(sys.argv[2], 'w'), indent=1)
kinds = {}
for f, hs in out.items():
    for _, k in hs:
        for kk in k: kinds[kk] = kinds.get(kk, 0) + 1
print("files with 5.1-incompatible escapes:", len(out), "literal counts by kind:", kinds)
print("launcher files affected:", sorted(set(out) & LAUNCHER))
by = {}
for f in out: d = '/'.join(f.split('/')[:2]); by[d] = by.get(d, 0) + 1
print(sorted(by.items(), key=lambda x: -x[1]))
print("gen1-relevant (non gen2/game3/gba):", sorted(f for f in out if not any(s in f for s in ('gen2','game3','/gba/','Gen2','Gen3'))))
