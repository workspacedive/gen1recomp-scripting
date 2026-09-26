# Architecture conformance audit — Scripting project 0.4.0

Audit date: 2026-09-26

## Result

Overall status: **TEILWEISE VERIFIZIERT — pinned candidate staging conforms; runtime activation remains intentionally absent**.

The user confirmed that 0.3.3's fully self-contained, Free-Tier Mod import works. Version 0.4.0 advances the separate Core update control plane without turning a downloaded payload into executable code.

## Update-path conformance

| Invariant | Implementation | Status |
|---|---|---|
| Explicit network action | startup reads local state only; metadata check and binary staging each require a tap | **VERIFIZIERT** by source inspection |
| Reviewed trust pin | 0.3.20 URL, source revision, filename, bytes and SHA-256 are compiled into the Scripting project | **VERIFIZIERT** |
| Discovery cannot authorize bytes | GitHub metadata must equal the built-in pin; metadata alone is insufficient | **VERIFIZIERT** |
| Redirect confinement | final response host is restricted to known GitHub asset hosts | **VERIFIZIERT** by source inspection |
| Candidate byte integrity | response length and SHA-256 are checked, then the staged file is read and hashed again | **VERIFIZIERT** by source inspection; device download pending |
| Candidate structure | self-contained ZIP reader validates the complete `.love`; `src/core/Version.lua` must be present and CRC-valid | **VERIFIZIERT** by reused parser tests |
| No candidate execution during probing | version metadata is extracted as bytes and literal fields are parsed; Lua is never evaluated | **VERIFIZIERT** by pure parser test |
| Compatibility metadata | engine must be 0.3.20, payload host `love`, and `minShell` a positive integer | **VERIFIZIERT** by tests |
| Transaction isolation | download/staging occurs under `Transactions/payload-0.3.20`; immutable publication targets `Cores/payloads/0.3.20` | **VERIFIZIERT** by source inspection |
| Interrupted operation recovery | fixed staging directory is removed on startup or before retry | **VERIFIZIERT** by source inspection |
| Existing candidate protection | an existing candidate is rehashed and never silently replaced | **VERIFIZIERT** by source inspection |
| User-data isolation | no Library, Save, Mod or Profile path is under the payload destination | **VERIFIZIERT** |
| Activation/rollback | no active pointer or launch path exists yet | activation **NICHT VERIFIZIERT** and deliberately blocked |
| Binary transfer in Scripting Free Tier | uses documented `fetch` plus basic Data/FileManager writes, not an Archive API | **VORAUSSETZUNG** real-device staging test |

## Why the candidate remains inactive

A valid upstream `.love` payload proves neither that love.js boots locally nor that Scripting provides the required graphics, audio, lifecycle and persistent VFS behavior. The stored metadata therefore uses the explicit state `stored-runtime-gated`. There is no code path that mounts it, points a player at it, or marks it active.

Activation can be added only after the runtime bundle itself is pinned and all health gates in `component-updates.md` pass on real hardware. At that point the active pointer, pending-boot marker and rollback path must be implemented together; adding only a “Start” button would violate the architecture.
