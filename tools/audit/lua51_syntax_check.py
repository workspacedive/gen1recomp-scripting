#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Compile every .lua file inside a game tree with PUC Lua 5.1 (the VM used by love.js)
and with LuaJIT 2.1 (the VM used by native LOVE builds). Reports files that LuaJIT accepts
but Lua 5.1 rejects -> these would fail to load under the WebAssembly runtime."""
import os, sys, json
from lupa import lua51, luajit21

def make_checker(mod):
    rt = mod.LuaRuntime(unpack_returned_tuples=True)
    return rt.eval("function(src, name) local f, err = loadstring(src, name) if f then return true else return err end end")

def main(root):
    c51, cjit = make_checker(lua51), make_checker(luajit21)
    results = {"total": 0, "ok51": 0, "fail51": [], "failjit": []}
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in (".git",)]
        for fn in fns:
            if not fn.endswith(".lua"): continue
            p = os.path.join(dp, fn); rel = os.path.relpath(p, root)
            src = open(p, "rb").read()
            try: s = src.decode("utf-8")
            except UnicodeDecodeError: s = src.decode("latin-1")
            results["total"] += 1
            r51 = c51(s, "@" + rel); rj = cjit(s, "@" + rel)
            if r51 is True: results["ok51"] += 1
            else: results["fail51"].append({"file": rel, "error": str(r51), "luajit_ok": rj is True})
            if rj is not True: results["failjit"].append({"file": rel, "error": str(rj)})
    return results

if __name__ == "__main__":
    res = main(sys.argv[1])
    json.dump(res, open(sys.argv[2], "w"), indent=1)
    print("total", res["total"], "ok51", res["ok51"], "fail51", len(res["fail51"]), "failjit", len(res["failjit"]))
    by_dir = {}
    for f in res["fail51"]:
        d = "/".join(f["file"].split("/")[:3]); by_dir[d] = by_dir.get(d, 0) + 1
    for d, n in sorted(by_dir.items(), key=lambda x: -x[1]): print(f"  {n:4d}  {d}")
