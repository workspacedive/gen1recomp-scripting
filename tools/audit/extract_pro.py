#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Extract every doc.json entry flagged "pro": true (authoritative PRO gating source)
plus every doc page whose text states that it requires Scripting PRO."""
import json, os, re, sys

def walk(nodes, path, out, inherited=False):
    for n in nodes:
        title = (n.get("title") or {}).get("en", "?")
        p = path + [title]
        pro = bool(n.get("pro")) or inherited
        if n.get("pro"):
            out.append((" > ".join(p), n.get("readme"), n.get("example")))
        walk(n.get("children", []), p, out, pro)

def main(root):
    doc = json.load(open(os.path.join(root, "doc.json"), encoding="utf-8"))
    flagged = []
    walk(doc, [], flagged)
    text_hits = []
    for dp, _, files in os.walk(root):
        for f in files:
            if f == "en.md":
                fp = os.path.join(dp, f)
                t = open(fp, encoding="utf-8").read()
                for m in re.finditer(r"[^\n]*Scripting PRO[^\n]*", t):
                    text_hits.append((os.path.relpath(fp, root), m.group(0).strip()))
    return flagged, text_hits

if __name__ == "__main__":
    for label, root in [("APP STORE", sys.argv[1]), ("TESTFLIGHT", sys.argv[2])]:
        flagged, hits = main(root)
        print(f"===== {label}: {len(flagged)} doc.json entries flagged pro:true")
        seen = set()
        for path, readme, ex in flagged:
            key = readme or path
            print(f"  [PRO] {path}  -> readme={readme}")
        print(f"----- {label}: text statements mentioning 'Scripting PRO' ({len(hits)})")
        for f, line in sorted(set(hits)):
            print(f"  {f}: {line[:200]}")
