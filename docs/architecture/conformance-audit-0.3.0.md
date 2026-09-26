# Architecture conformance audit — Scripting project 0.3.0

Audit date: 2026-09-26  
Scope: repository implementation, package process and documented host contract. This is not a real-device runtime certification.

## Conclusion

The implementation **continues to follow the agreed architecture for the features it currently exposes**: host UI, immutable original game imports, separated user/Core/cache roots, journaled publication, conservative capability reporting, and disabled runtime activation. No reviewed path places a sole copy of critical user data in Cache or allows a Core operation to replace the user-data root.

Conformance is not the same as completeness. The love.js runtime, save bridge, controller bridge, original mod loader activation and safe network Core activation remain unimplemented or gated. Those are reported as gaps, not silently replaced with parallel systems.

Overall status: **TEILWEISE VERIFIZIERT — conformant control plane, incomplete runtime plane**.

## Requirement matrix

| Requirement | Evidence | Status |
|---|---|---|
| Files-visible organization | `host.ts` roots all persistent data at `Documents/Gen1Recomp`; bootstrap creates named subtrees | **VERIFIZIERT** in source; Files-app visibility confirmed by platform model, not re-tested this iteration |
| Persistent one-time import | import stages original bytes, verifies SHA-256, journals publication and indexes by content hash | **VERIFIZIERT** by code/tests; device import still needs user exercise |
| Canonical game identification | upstream SHA-1 database is separated in `game-manifest.ts`; unknown content is not relabeled supported | **VERIFIZIERT** by tests |
| User/Core isolation | `Library`, `Saves`, `Mods`, `Generated`, `Transactions`, `Diagnostics`, `Core`, `Cache` are separate roots | **VERIFIZIERT** |
| Critical data not only in cache | imports, indexes and diagnostics are in Documents; cache is not used as sole storage | **VERIFIZIERT** by repository inspection |
| Interrupted import recovery | journal validates exact expected source/destination paths before cleanup/publication | **VERIFIZIERT** in source |
| Atomic index replacement | temporary file is parsed, old index is backed up, failed rename restores backup | **VERIFIZIERT** by test |
| Runtime truthfulness | `APP.runtimeEnabled` is false and UI states missing device gates | **VERIFIZIERT** |
| No Pro-only dependency | repository regression scan and no known Pro API in product code | **VERIFIZIERT** by test |
| Compatible tab navigation | documented state-based `TabView` API; independent `NavigationStack` per tab | **VERIFIZIERT** against official docs and subsequent 0.3.0 real-device feedback |
| Mod archive transport safety | central-directory preflight, cross-check against documented `Archive.entries()`, explicit per-entry safe destinations, post-extraction manifest/entry check and immutable publication | **VERIFIZIERT** by parser unit tests; Archive extraction still needs adversarial device testing |
| Original mod semantics retained | local shell labels package “stored”; activation is reserved for original loader | **VERIFIZIERT** architectural boundary; activation **NICHT VERIFIZIERT** |
| Component update safety | inventory and metadata-only check exist; activation protocol documented but disabled | **TEILWEISE VERIFIZIERT** |
| love.js operation | generic browser capabilities only | **NICHT VERIFIZIERT** |
| Graphics/audio/persistence/lifecycle | probe is not runtime certification | **NICHT VERIFIZIERT** / **BENCHMARK ERFORDERLICH** |
| Save migration and recovery under real runtime | directories reserved; no live save writer yet | **NICHT VERIFIZIERT** |
| Localization | prior key-based German/English facility exists, but new 0.3.0 tab text is currently German | **NICHT VERIFIZIERT** for 0.3.0 completeness; all new strings must return to `i18n.ts` before localization is complete |
| Accessibility | native controls and labels are used; VoiceOver order, Dynamic Type and contrast need device audit | **TEILWEISE VERIFIZIERT** |

## Improvements over 0.2.2

1. The one-screen shell is split into Games, Mods, Diagnostics and Settings without sharing navigation stacks.
2. Component identity is visible and centralized rather than implied by UI text.
3. Network access is opt-in. Opening the app performs no release request.
4. Release checking is metadata-only; it cannot activate untrusted code.
5. Mod ZIPs no longer need to be trusted before extraction. Unsafe paths/types/sizes are rejected first.
6. Stored mods are content-addressed. Removing an index entry occurs before deleting bytes, so interruption can leave only a safe orphan rather than a live index pointing at missing data.

## Deviations and corrective actions

### A. Localization regression

The new tab UI uses German literals. This does not corrupt data or violate component boundaries, but it does not meet the full localization requirement.

Action: move all 0.3.0 strings to typed locale keys and add English parity before declaring localization complete.

### B. Mod manifest validation is intentionally partial

The shell validates only the safe storage boundary (`id`, SemVer, API 1/2, profile and entry path). It does not duplicate dependency resolution, game targeting, permissions, conflicts or load order from Gen1Recomp.

This is intentional conformance, not an omission to “fix” by creating another mod engine. The original `src/mods/Manifest.lua` and loader must perform authoritative runtime validation once the runtime gate passes.

### C. ZIP extraction needs real-host adversarial testing

The shell validates the central directory, cross-checks it with documented `Archive.entries()`, and extracts each approved entry to an explicit safe destination with uncontained symlinks disabled. Unit tests cover parser decisions. A real-device suite must still verify malformed local headers, central/local-name disagreement and decompression edge cases in Scripting's Archive implementation. Until then packages are stored but not executed.

### D. No authenticated unattended Core feed

SHA-256 pins are present, but the host contract has not established an asymmetric signature verifier and key lifecycle. Therefore the release check cannot become an unattended updater merely by adding a download button.

Action: use reviewed pins delivered with `.scripting` releases, or verify a signed canonical catalog when a documented cryptographic primitive is available. Keep network activation disabled meanwhile.

### E. Shared busy state

The tabs currently share a single operation lock. This is safe and prevents overlapping filesystem mutations, but it is conservative UX. It can later become a transaction coordinator with per-domain read states without allowing concurrent writes to the same index.

## Explicit non-claims

This audit does not claim:

- Gen1Recomp boots under love.js in Scripting;
- the upstream `.love` can run unchanged under a browser host;
- audio, controllers, workers, IndexedDB or saves work for the game;
- stored mods are enabled or compatible with an imported game;
- update signatures are available;
- acceptable performance on any iPhone/iPad.

Those claims require the gates in `component-updates.md` and real-device evidence.
