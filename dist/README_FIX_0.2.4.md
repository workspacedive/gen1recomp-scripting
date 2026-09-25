# Fix 0.2.4 — DocumentPicker global (Picker.pickFiles undefined) — VERIFIZIERT

**Datum:** 2026-09-25 17:33
**Blocker nach 0.2.3:** `undefined is not an object (evaluating Picker.pickFiles')` beim Tap auf "ROM importieren".
**Diagnose:** `index.tsx` in 0.2.3 importierte `DocumentPicker` aus `"scripting"` (`import { …, DocumentPicker } from "scripting"`). Im Scripting-Bundle ist `DocumentPicker` **nicht** als `scripting`-Export vorhanden, sondern als **globales** Objekt (wie `FileManager`/`Storage`). Der Import liefert daher `undefined`, der anschließende `DocumentPicker.pickFiles` Call wirft.

**Quelle verifiziert:**
- `document_picker/en.md` Beispiele nutzen `await DocumentPicker.pickFiles()` ohne Import — globales `DocumentPicker`.
- `file_manager/en.md` analog `FileManager` global. `ScriptingAdapter.ts` nutzt bereits `FileManager` global, nicht via Import.
- Fehlertext `Picker.pickFiles` = minifizierter Name für `DocumentPicker` nach Bundle → `undefined.pickFiles`.

**Fix 0.2.4:**
- `index.tsx:17` Import entfernt: `from "scripting"` importiert nur UI (`VStack/HStack/Text/Button/List/Section/Navigation/Script/useState/useEffect`), `DocumentPicker` bleibt global (deklariert in `scripting.d.ts` als `declare global { const DocumentPicker: any }`).
- `onImport` robust:
  ```ts
  const DP: any = (globalThis as any).DocumentPicker ?? (typeof DocumentPicker !== "undefined" ? DocumentPicker : null)
  if (!DP) { setStatus("DocumentPicker nicht verfügbar"); return }
  const pick = DP.pickFiles ?? DP.open
  const urls = await pick.call(DP, { types: ["public.data","public.item"], allowsMultipleSelection:false })
  ```
  + Fallback `DP.pickFiles()` ohne Options, `pickFiles ?? open` für ältere Builds, `typeof` Guard gegen ReferenceError.
- Version bumps `0.2.3→0.2.4` (`package.json`/`script.json`/Footer), `tsc` bleibt clean, `vitest` 92 Tests grün.

**Verifikation:**
- `grep DocumentPicker index.tsx` → kein Import, nur global + `globalThis.DocumentPicker`
- `tsc --noEmit --skipLibCheck` → **0**
- `vitest run` → **21 Dateien 92 passed**
- Staging `4.7M` 37 Dateien, `dist/gen1recomp-v0.2.4.scripting` **695K** 60 Dateien (`gen1recomp/script.json` korrekt), `unzip -p gen1recomp/index.tsx | grep globalThis` → `const DP: any = (globalThis as any).DocumentPicker`
- Kein Pro-API, `DocumentPicker.pickFiles` bleibt Non-Pro.

**Import:**
1. In Scripting: `gen1recomp-v0.2.4.scripting` importieren (ein `.scripting`-ZIP mit Ordner `gen1recomp/`).
2. Start → `ROM importieren (echt)` → Document Picker erscheint (global), ROM wählen → `SHA-1 → RomExtractor 17 Stages` → `isReady`.
3. Bei fehlendem `DocumentPicker` Status `nicht verfügbar` (Update Scripting).

Vorherige Fixes bleiben: 0.2.2 `foregroundStyle`/`Section header`, 0.2.3 `pickFiles` statt `open`.
