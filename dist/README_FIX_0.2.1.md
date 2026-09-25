# Fix 0.2.1 — .scripting „nicht unterstützte Scriptdatei“ behoben

**Ursache:** v0.2.0 (691K) hatte kein `script.json` und keine Top-Level-Ordnerstruktur — Zip enthielt `index.tsx` direkt am Root. Scripting erwartet aber **Unified Script Format**: Zip enthält einen Ordner, benannt wie `script.json:name`, darin `script.json` + `index.tsx` + `src/...` (siehe offizielles `Scripting Documentation.scripting`).

**Fix v0.2.1 (693K):**
- `script.json` neu angelegt (name `gen1recomp`, icon `gamecontroller.fill`, color `red`, version `0.2.1`, description, author) — liegt sowohl im Repo-Root als auch im Zip unter `gen1recomp/script.json`
- Zip neu gepackt mit **Ordner** `gen1recomp/` als Top-Level (statt Root-Files). Inhalt: `gen1recomp/script.json`, `gen1recomp/index.tsx`, `gen1recomp/src/...` (inkl. 6 Manifests), `gen1recomp/package.json` etc. — verifiziert via `unzip -l` (57 files, 4.7M unpacked, 693K zipped)
- `package.json` Version auf `0.2.1` angeglichen

**Neue Dateien:**
- `gen1recomp-v0.2.1.scripting` (693K) — im Branch, `dist/` und Repo-Root, **Top-Level Ordner `gen1recomp`**
- `dist/gen1recomp-v0.2.0-fixed.scripting` (identisch zu 0.2.1, für User die 0.2.0 versucht hatten)
- Alte `gen1recomp-v0.2.0.scripting` (falsches Format) bleibt als Negativ-Beispiel, nicht mehr verwenden

**Import in Scripting (iOS) — jetzt korrekt:**
1. **Per Tap (empfohlen):** `gen1recomp-v0.2.1.scripting` nach Files laden → antippen → **Teilen** → **Scripting** (oder direkt antippen, iOS zeigt „In Scripting öffnen“) → App öffnet, Import-Dialog „gen1recomp v0.2.1“ → **Import** → erscheint als Script `gen1recomp` in der Liste → `index.tsx` → Play
2. **Falls Tap weiterhin „nicht unterstützt“:** Zip manuell entpacken: `.scripting` in `.zip` umbenennen → in Files entpacken → Ordner `gen1recomp` nach `On My iPhone/Scripting/` (App-Ordner) kopieren — oder in Scripting: **Neues Script → Import from Files → Ordner `gen1recomp` wählen** (script.json wird erkannt)
3. Danach wie gehabt: `ROM importieren (echt)` → DocumentPicker (1/2/16 MiB, SHA-1 geprüft, 17 Stages) → `Daten prüfen` → Warm Start

**Verifikation:** `unzip -l gen1recomp-v0.2.1.scripting` zeigt jetzt `gen1recomp/script.json` als ersten Eintrag — identisch zum Muster `Scripting Documentation/script.json` aus dem offiziellen Doc-Zip (verifiziert via `/tmp/scripting-check`).

**Nächster Build (v0.3.0):** TileRenderer + Overworld (Pallet Town) bleibt geplant, nutzt dann dasselbe korrekte .scripting-Format.
