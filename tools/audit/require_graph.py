#!/usr/bin/env python3
"""Static require graph of the game archive: which modules (transitively) depend on
modules that PUC Lua 5.1 cannot compile (goto)? Prints dependents grouped by area."""
import os, re, json, sys
root = sys.argv[1]
bad = {"src.import.gba.battle_anim_extract","src.import.gba.cli_extract","src.import.gba.door_anim_extract",
       "src.import.gba.extract_map_events","src.import.gba.extract_scripts","src.import.gba.map_tree"}
top_level = "--top-level" in sys.argv
if top_level: sys.argv.remove("--top-level")
# --top-level: only requires at column 0 (executed when the module loads);
# lazy requires inside functions are ignored.
req_re = (re.compile(r'^(?:local\s+[\w,\s]+=\s*)?require\s*\(?\s*["\']([\w\.\-]+)["\']', re.M)
          if top_level else re.compile(r'require\s*\(?\s*["\']([\w\.\-/]+)["\']'))
mods = {}
for dp, _, fns in os.walk(root):
    for fn in fns:
        if fn.endswith(".lua"):
            p = os.path.join(dp, fn); rel = os.path.relpath(p, root)
            name = rel[:-4].replace("/", ".")
            if name.endswith(".init"): name = name[:-5]
            src = open(p, encoding="utf-8", errors="replace").read()
            # strip line comments crudely
            if not top_level: src = re.sub(r"--[^\n]*", "", src)
            mods[name] = set(req_re.findall(src))
rev = {}
for m, deps in mods.items():
    for d in deps: rev.setdefault(d, set()).add(m)
# transitive dependents of bad
seen, stack = set(), list(bad)
while stack:
    x = stack.pop()
    for dep in rev.get(x, ()):
        if dep not in seen:
            seen.add(dep); stack.append(dep)
def area(m):
    if ".game3" in m or ".gba" in m or "Gen3" in m or "game3" in m.lower(): return "gen3"
    return "OTHER"
other = sorted(m for m in seen if area(m) == "OTHER")
print("modules:", len(mods), "| transitive dependents of goto modules:", len(seen))
print("non-Gen3 dependents:", len(other))
for m in other: print("  ", m)
