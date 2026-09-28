# SKILLS.md — Wiederverwendbare Agent-Skills

Diese Skills sind Arbeitsanweisungen für LLM-Agents. Sie ändern keine Produktanforderungen und werden in der angegebenen Reihenfolge angewendet.

## `$source-audit`

**Wann:** Bei Behauptungen über Gen1Recomp, Scripting, iOS oder WebKit.

**Eingaben:** Quelle, Revision/Version, Fragestellung.

**Ablauf:**
1. Primärquelle öffnen und Commit/Version festhalten.
2. Relevante Implementierung und nicht nur README untersuchen.
3. Gegenevidenz und Plattform-Fallback suchen.
4. Aussage als Status + Beleg + Datum erfassen.
5. Nicht beobachtbare Laufzeiteigenschaften als Device-Probe formulieren.

**Ausgabe:** Ein Eintrag in `docs/audit/evidence.md` oder `capability-matrix.md`.

## `$scripting-free-tier-audit`

**Wann:** Vor Verwendung einer Scripting-API.

**Ablauf:**
1. API in der offiziellen App-Store-Dokumentations-ZIP suchen.
2. `doc.json`-Eintrag auf `pro: true` prüfen.
3. Direkte und transitive Nutzung prüfen.
4. Bei Pro: entfernen oder freien Fallback definieren.
5. Ergebnis in der Free-Tier-Matrix dokumentieren.

**Pass-Kriterium:** Kein produktkritischer Pfad benötigt einen als Pro markierten Eintrag.

## `$capability-probe`

**Wann:** Für WASM, WebGL, Web Audio, Worker, SIMD, SharedArrayBuffer, Gamepad oder lokale WebView-Ressourcen.

**Ablauf:**
1. Kleinstmöglichen Probe ohne Nutzerdaten erstellen.
2. iOS-/Scripting-Version, Gerät, Ergebnis und Fehler speichern.
3. Positiv- und Negativpfad testen.
4. Keine Capability aus User-Agent oder allgemeiner Safari-Dokumentation ableiten.
5. Matrix nur für die getestete Kombination hochstufen.

## `$transactional-storage-change`

**Wann:** Bei Library-, Save-, Core-, Profil- oder Konfigurationsschreibvorgängen.

**Ablauf:**
1. Zielpfad gegen Storage Root normalisieren und validieren.
2. In `<name>.staging-<operationId>` schreiben.
3. Größe und SHA-256 gegen Manifest prüfen.
4. Bestehendes Ziel als `.bak`/versioniertes Backup erhalten.
5. Staging per Rename aktivieren.
6. Commit-Marker zuletzt schreiben.
7. Crash an jedem Schritt simulieren und Recovery testen.

## `$secure-archive-review`

**Wann:** Vor Mod/Core/Backup-Import.

**Prüft:** absolute Pfade, `..`, Backslash-Varianten, Unicode-Normalisierung, Symlinks, doppelte Ziele, Kompressionsbomben, Dateianzahl, Einzel-/Gesamtgröße, Manifest-Größe, unbekannte Dateitypen.

**Regel:** Die dokumentierte Scripting-`unzip`-Methode allein belegt keine sichere Extraktion. Bis ein Preflight möglich ist: `NICHT VERIFIZIERT`, Import blockieren oder nur vertrauenswürdige intern erzeugte Archive akzeptieren.

## `$performance-change`

**Wann:** Vor Cache-, Preload-, Renderer-, Hook- oder WASM-Optimierungen.

**Ablauf:** PROFILE → IDENTIFY → BASELINE → CHANGE → BENCHMARK → VERIFY → ROLLBACK DECISION.

**Mindestausgabe:** Gerät, Build, Szenario, Stichprobe, Median/P95, Speicher-Peak, Energie-/Thermal-Hinweis, semantische Golden-Tests.

## `$upstream-delta-review`

**Wann:** Wenn Gen1Recomp-Code angepasst werden soll.

**Ablauf:**
1. Prüfen, ob Host Adapter genügt.
2. Vorhandenen Fallback suchen.
3. Kleinsten Patch mit Feature-Flag entwerfen.
4. Upstream API/Mod-Kompatibilität testen.
5. Delta und Rebase-Risiko dokumentieren.

## `$release-gate`

**Wann:** Vor Versionierung oder Auslieferung.

**Prüft:** Quellrevision, Toolchain, Artifact-Hash, Lizenzhinweise, kein ROM/Save, Schema-Kompatibilität, Update-Rollback, Safe Mode, Offline-Start, Free-Tier, Tests, Capability-Matrix, bekannte Risiken.
