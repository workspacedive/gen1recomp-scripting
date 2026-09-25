#!/usr/bin/env python3
"""Binary analysis of an official gen1recomp Android APK (SKILLS.md S10).

Usage: analyze.py <apk> <out_dir> [--love <official .love>] [--aapt2 <path>] [--apksigner <path>]

Produces <out_dir>/report.md and <out_dir>/report.json with:
  * archive inventory (entries, sizes, per-directory totals, compression)
  * aapt2 badging (package, version, SDK levels, permissions, features)
  * full decoded AndroidManifest.xml tree (intent filters, providers, activities)
  * signing certificate(s) and signature schemes (apksigner)
  * native libraries per ABI with SHA-256
  * the embedded assets/game.love: SHA-256, entry count, and a file-by-file
    comparison (name + CRC32) against the official release .love

Only metadata is written; no game content is extracted into the output.
SPDX-License-Identifier: GPL-3.0-or-later
"""
import hashlib, json, os, subprocess, sys, zipfile, io, collections


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def run(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=300).stdout
    except Exception as e:  # tool missing
        return f"<unavailable: {e}>"


def main():
    args = sys.argv[1:]
    apk, out = args[0], args[1]
    opt = lambda k: args[args.index(k) + 1] if k in args else None
    love_ref, aapt2, apksigner = opt("--love"), opt("--aapt2") or "aapt2", opt("--apksigner") or "apksigner"
    os.makedirs(out, exist_ok=True)
    raw = open(apk, "rb").read()
    rep = {"apk": os.path.basename(apk), "size": len(raw), "sha256": sha256(raw)}

    z = zipfile.ZipFile(apk)
    entries = z.infolist()
    per_dir = collections.Counter()
    for e in entries:
        per_dir[e.filename.split("/")[0] + ("/" if "/" in e.filename else "")] += e.file_size
    rep["entries"] = len(entries)
    rep["per_top_level"] = dict(per_dir.most_common())
    rep["native_libs"] = [
        {"path": e.filename, "size": e.file_size, "sha256": sha256(z.read(e.filename))}
        for e in entries if e.filename.startswith("lib/") and e.filename.endswith(".so")
    ]
    rep["dex"] = [{"path": e.filename, "size": e.file_size} for e in entries if e.filename.endswith(".dex")]

    rep["badging"] = run([aapt2, "dump", "badging", apk])
    rep["manifest_tree"] = run([aapt2, "dump", "xmltree", "--file", "AndroidManifest.xml", apk])
    rep["signature"] = run([apksigner, "verify", "--verbose", "--print-certs", apk])

    love_names = [e.filename for e in entries if e.filename.endswith("game.love")]
    if love_names:
        love = z.read(love_names[0])
        lz = zipfile.ZipFile(io.BytesIO(love))
        emb = {i.filename: i.CRC for i in lz.infolist() if not i.is_dir()}
        info = {"path": love_names[0], "size": len(love), "sha256": sha256(love), "files": len(emb)}
        if love_ref and os.path.exists(love_ref):
            ref_raw = open(love_ref, "rb").read()
            ref = {i.filename: i.CRC for i in zipfile.ZipFile(io.BytesIO(ref_raw)).infolist() if not i.is_dir()}
            info["official_love"] = {"size": len(ref_raw), "sha256": sha256(ref_raw), "files": len(ref)}
            info["only_in_apk"] = sorted(set(emb) - set(ref))
            info["only_in_official"] = sorted(set(ref) - set(emb))
            info["content_differs"] = sorted(k for k in set(emb) & set(ref) if emb[k] != ref[k])
            info["identical_archives"] = info["sha256"] == info["official_love"]["sha256"]
        rep["embedded_game_love"] = info

    json.dump(rep, open(os.path.join(out, "report.json"), "w"), indent=1)
    with open(os.path.join(out, "report.md"), "w") as f:
        f.write(f"# APK binary analysis: {rep['apk']}\n\n")
        f.write(f"- size: {rep['size']} bytes\n- sha256: `{rep['sha256']}`\n- zip entries: {rep['entries']}\n\n")
        f.write("## Size by top-level entry\n\n| entry | bytes |\n|---|---|\n")
        for k, v in rep["per_top_level"].items():
            f.write(f"| `{k}` | {v} |\n")
        f.write("\n## Native libraries\n\n| path | bytes | sha256 |\n|---|---|---|\n")
        for l in rep["native_libs"]:
            f.write(f"| `{l['path']}` | {l['size']} | `{l['sha256'][:16]}…` |\n")
        if "embedded_game_love" in rep:
            g = rep["embedded_game_love"]
            f.write(f"\n## Embedded game archive\n\n- `{g['path']}`: {g['size']} bytes, {g['files']} files, sha256 `{g['sha256']}`\n")
            if "official_love" in g:
                f.write(f"- official release .love: {g['official_love']['size']} bytes, sha256 `{g['official_love']['sha256']}`\n")
                f.write(f"- identical archives: {g['identical_archives']}\n")
                f.write(f"- only in APK: {len(g['only_in_apk'])} · only in official: {len(g['only_in_official'])} · content differs: {len(g['content_differs'])}\n")
                for key in ("only_in_apk", "only_in_official", "content_differs"):
                    if g[key]:
                        f.write(f"\n<details><summary>{key}</summary>\n\n" + "\n".join(f"- `{n}`" for n in g[key][:200]) + "\n</details>\n")
        for title, key in (("aapt2 dump badging", "badging"), ("apksigner", "signature"), ("AndroidManifest.xml (decoded)", "manifest_tree")):
            f.write(f"\n## {title}\n\n```\n{rep[key].strip()[:60000]}\n```\n")
    print(json.dumps({k: rep[k] for k in ("apk", "size", "sha256", "entries")}, indent=1))


if __name__ == "__main__":
    main()
