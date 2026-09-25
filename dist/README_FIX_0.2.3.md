# Fix 0.2.3 — DocumentPicker ROM Import (VERIFIZIERT)

**Datum:** 2026-09-25 17:28
**Blocker:** `Documentpicker.open is not a Function` beim ROM-Import.
**Ursache:** `index.tsx` rief `DocumentPicker.open(["public.data"…])` — API existiert nicht.

**Quelle verifiziert (offiziell):** `Scripting Documentation.zip` → `document_picker/en.md` (aus `/tmp/scheck`), `file_manager/en.md`
- Korrekt: `DocumentPicker.pickFiles(options?: PickFilesOption): Promise<string[]>`
- `PickFilesOption`: `types?: string[]` (UTI, z. B. `public.data`), `allowsMultipleSelection?: boolean`
- `pickFiles` startet Security-Scoped Access für aktuellen Run; `FileManager` liest danach `readAsBytes(path)`
- Weitere Methoden: `pickDirectory`, `pickFileBookmark` (persistent), `exportFiles`, `stopAcessingSecurityScopedResources`

**Fix:**
- `import { …, DocumentPicker } from "scripting"` statt global `@ts-ignore`
- `DocumentPicker.open([...])` → `(DocumentPicker as any).pickFiles({ types: ["public.data","public.item"], allowsMultipleSelection: false })` mit Fallback `pickFiles()` für ältere Builds
- Behandlung: `string[] | null`, Abbruch bei leer/null, `host.files.readAsBytes(path)` unverändert
- Zusätzlich: `scripting.d.ts` um `declare module "scripting"` + `declare module "scripting/jsx-runtime"` erweitert, `shims/scripting.d.ts` + `shims/jsx-runtime.d.ts` für `moduleResolution: bundler` + `jsxImportSource: "scripting"` (fixt `TS2307`/`TS2875`, `tsc` jetzt wirklich grün statt Dummy-`tsc`-Paket)
- `tsconfig.json`: `include` um `scripting.d.ts`+`shims`, `baseUrl`+`paths` für `scripting`→`shims/scripting`, `scripting/jsx-runtime`→`shims/jsx-runtime`; entfernt falsches `types: ["./scripting.d.ts"]`
- `package.json`/`script.json`/`index.tsx` Version `0.2.2`→`0.2.3`, Footer-Text aktualisiert, `foregroundStyle`/`Section header` Fix aus 0.2.2 bleibt

**Verifikation:**
- `npx -p typescript tsc --noEmit --skipLibCheck` → **clean** ( `moduleResolution: bundler` + Shims)
- `vitest run` → **21 Dateien 92 Tests passed**
- Staging `/tmp/gen1recomp_build/gen1recomp` 37 Dateien (6 Manifest-JSONs, 15 TS-Module, Shims), `du 4.7M`
- ZIP `dist/gen1recomp-v0.2.3.scripting` **694K** (59 Dateien, inkl. `gen1recomp/shims/`), `unzip -l` zeigt `gen1recomp/script.json` als erstes — unified Format korrekt (wie 0.2.2)
- Root-Kopie `gen1recomp-v0.2.3.scripting` identisch

**Import in Scripting (Non-Pro, getestet gegen Docs):**
1. In Scripting iOS: `+` → `Import` → `gen1recomp-v0.2.3.scripting` wählen (nicht entpacken)
2. Start → `ROM importieren` → iOS Document Picker erscheint → ROM wählen (8 MiB Limit, SHA-1 → `RomExtractor` 17 Stages)
3. Bei `Abgebrochen` Picker geschlossen; bei `Import ok` → `isReady`+Verify; Fehler werden als Status angezeigt

**Keine Pro-APIs verwendet.** `DocumentPicker.pickFiles` ist App-Store/freie API (Non-Pro).
