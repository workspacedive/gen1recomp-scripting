# Upstream update research ledger

Captured: 2026-09-26. Repository revisions are pinned so conclusions can be reproduced after upstream changes.

| Subject | Authoritative source | Revision / fact used | Evidence status |
|---|---|---|---|
| Gen1Recomp updater | https://github.com/bryanthaboi/gen1recomp/tree/v0.3.18/src/update | tag `v0.3.18`, commit `b83f805a7c7b6043370b783ea7a4b65fd8c93ef4`; `Boot.lua`, `Check.lua`, `check_worker.lua` | **VERIFIZIERT** |
| Updater contract | https://github.com/bryanthaboi/gen1recomp/blob/v0.3.18/docs/updater.md | payload overlay, `payloadHost`, `minShell`, pending marker, SHA-256, restart activation, full-update path | **VERIFIZIERT** |
| Gen1Recomp baseline release | https://github.com/bryanthaboi/gen1recomp/releases/tag/v0.3.18 | `.love` digest `853a539f64f892248846d4fd7ec31837b8450b573cdb3658b23d64ae08d5f732`; sums asset present | **VERIFIZIERT** |
| Latest Gen1Recomp release | https://github.com/bryanthaboi/gen1recomp/releases/tag/v0.3.20 | commit `64dd9cb3a377b398b6132d223a121878f68b4b07`; `.love` digest `c0da7035afb110cb9b45556a44c855bd27c96903737128fa8114209b9eb7f0a5`; updater/mod sources unchanged since baseline | metadata **VERIFIZIERT**, local asset re-hash blocked by SSL/EOF |
| Mod manifest/runtime | https://github.com/bryanthaboi/gen1recomp/tree/v0.3.18/src/mods | `Manifest.lua`, `LauncherMods.lua`, `Loader.lua`, `ModIndex.lua`, `Sandbox.lua` | **VERIFIZIERT** |
| Mod index | https://github.com/bryanthaboi/gen1recomp-mod-index | metadata points to repositories/releases; package manifest remains authoritative | **VERIFIZIERT** |
| love.js | https://github.com/2dengine/love.js | commit `9355186de22db13bd88bf2a0db75d2925647d036`; LÖVE 11.5 player/runtime files | **VERIFIZIERT** |
| LÖVE release | https://github.com/love2d/love/releases/tag/11.5 | upstream LÖVE version reference | **VERIFIZIERT** |
| Scripting TabView | https://github.com/Honye/scripting-scripts/blob/main/documentation/views/navigation/tab_view/with_badge.tsx | compatible `tabIndex`, `onTabIndexChanged`, child `tag` and `tabItem` pattern | **VERIFIZIERT** against documentation example |
| Scripting networking | https://github.com/Honye/scripting-scripts/tree/main/documentation/request | module-exported `fetch`, timeout, response metadata and binary/text reads | **VERIFIZIERT** against documentation; real-device update request pending |
| Scripting Archive | https://github.com/Honye/scripting-scripts/blob/main/documentation/archive/en.md | Although documented, the real app presents a Scripting PRO upgrade gate when used | **VERIFIZIERT** by device feedback; **NUR MIT HOST-UNTERSTÜTZUNG**, therefore removed from product code in 0.3.2 |
| Scripting FileManager | https://github.com/Honye/scripting-scripts/blob/main/documentation/file_manager/en.md | Documents path, read/write/copy/rename/stat and archive methods | **VERIFIZIERT** against documentation |

The `Honye/scripting-scripts` repository is used as a readable mirror of Scripting documentation/examples, not vendored as source code. The narrow local declaration file records only APIs this project actually uses.
