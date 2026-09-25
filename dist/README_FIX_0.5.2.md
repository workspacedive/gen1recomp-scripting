# v0.5.2 — Fix WebAssembly globalThis — VERIFIZIERT

**Datum:** 2026-09-25 19:05
**Fehler nach 0.5.1:**
- `[95,30] Cannot find name WebAssembly` (x3)

**Fix 0.5.2:**
- `typeof (globalThis as any).WebAssembly !== "undefined"` + `WebAssembly.Memory` via `globalThis` (Scripting lib hat kein dom WebAssembly global)

**Verifikation:** tsc 0, vitest 21/92.
