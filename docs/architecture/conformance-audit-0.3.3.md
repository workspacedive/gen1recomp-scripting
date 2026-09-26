# Architecture conformance audit — Scripting project 0.3.3

Audit date: 2026-09-26  
Trigger: real-device 0.3.2 import reached `validate-manifest` but reported that `main.lua` was missing or not a file.

## Result

Overall status: **TEILWEISE VERIFIZIERT — upstream manifest boundary restored; concrete package retest pending**.

The ZIP reader, Free-Tier boundary, transaction model and immutable Mod store are unchanged. The correction removes one host-specific assumption from post-extraction validation.

## Finding

The old condition combined two checks:

1. the extracted destination exists;
2. Scripting reports `FileManager.stat(path).type === "file"`.

That message did not identify which branch failed. More importantly, upstream Gen1Recomp `Loader:_validate()` checks that the manifest entry exists, while the shell already has stronger package evidence: the approved central record names the path, is not a directory, its local header agrees, its bytes decode to the exact announced length, and CRC-32 passes before the destination is written.

Version 0.3.3 therefore validates three independent facts without relying on a host-specific type string:

- `manifest.entry` is explicitly present and is a safe relative path, matching official `Manifest.lua` rather than inventing a `main.lua` default;
- the matching approved ZIP record exists and is not a directory;
- the transaction destination exists after the verified write.

Errors distinguish the record failure from the write failure.

## Invariants

| Invariant | Result | Status |
|---|---|---|
| No Scripting PRO archive API | unchanged; self-contained ZIP/DEFLATE remains active | **VERIFIZIERT** statically |
| Original Gen1Recomp manifest semantics | explicit `entry` requirement restored from official `Manifest.lua` | **VERIFIZIERT** against upstream source |
| Local/central ZIP and CRC integrity | unchanged | **VERIFIZIERT** by tests |
| Transaction containment and cleanup | unchanged | **VERIFIZIERT** by source inspection |
| Mod execution | still disabled; package remains `stored` | **VERIFIZIERT** |
| Exact cause in the user's archive | the old combined message did not preserve enough detail | **TECHNISCH UNBEKANNT** for 0.3.2 |
| Corrected device import | awaiting rerun with separated errors | **NICHT VERIFIZIERT** |
