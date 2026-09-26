# Architecture conformance audit — Scripting project 0.3.1

Audit date: 2026-09-26  
Scope: delta from the full 0.3.0 audit plus repository-wide regression checks.

## Result

Overall status: **TEILWEISE VERIFIZIERT — architecture remains conformant; corrected Mod transport awaits device retest**.

The 0.3.1 correction does not relax the agreed trust boundary. It raises only the archive entry-count ceiling from 4,096 to 32,768 while retaining archive-size, expanded-size, per-entry-size, path, Unicode normalization, duplicate, encryption, compression-method, ZIP64, multi-disk, symlink, manifest, entry-point and explicit-destination checks. A new 200:1 aggregate expansion-ratio ceiling adds defense rather than removing one.

## Repository-wide checks

| Invariant | 0.3.1 result | Status |
|---|---|---|
| Critical user data does not live only in Cache | unchanged; games and mods remain under their Documents stores | **VERIFIZIERT** |
| Mod transport cannot activate code | imported packages remain `activation: "stored"`; runtime remains disabled | **VERIFIZIERT** |
| Original Gen1Recomp loader remains authoritative | shell validation remains a transport/storage subset | **VERIFIZIERT** |
| Transactions remain isolated | staging remains under `Transactions/mod-import-pending`; publication remains content-addressed under `Mods` | **VERIFIZIERT** |
| Failure cannot erase the actionable error | cleanup and diagnostic writes are best-effort and preserve the original phase/error | **VERIFIZIERT** by source inspection |
| Success cannot be misreported solely because temporary cleanup failed | index publication completes first; startup recovery retries cleanup | **VERIFIZIERT** by source inspection |
| Memory use does not duplicate the whole selected archive through two host reads | one `Data` read feeds SHA-256 and `toUint8Array()` preflight | **VERIFIZIERT** against documented Data API; device behavior pending |
| ZIP bomb ceiling | aggregate expanded bytes remain bounded and expansion ratio is limited to 200:1 | **VERIFIZIERT** by regression test |
| Asset-heavy package support | a 5,002-entry archive passes while the 32,768 hard ceiling remains | **VERIFIZIERT** by regression test |
| Bottom navigation | user reported 0.3.0 starts and works apart from the mod import error | **VERIFIZIERT** on the real Scripting device path |
| Corrected concrete mod import | no second device result yet | **NICHT VERIFIZIERT** |
| Runtime/gameplay | still disabled; no new claim | **NICHT VERIFIZIERT** |

## Diagnostic privacy

`Diagnostics/mod-import-last-failure.v1.json` contains only schema version, timestamp, stable phase code and error message. It intentionally excludes the selected external file path, archive bytes, manifest contents and user data.

## Remaining known gap

The first device error combined two causes in one message. More than 4,096 entries is the leading explanation and now has a regression test, but it is not asserted as fact without the archive or a second run. Version 0.3.1 separates the messages and records the phase, so a persistent failure becomes directly actionable without weakening validation.
