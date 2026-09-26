# Implementierungsstand der Scripting-App

Stand: 2026-09-26 · App-Version `0.3.1`

## Iteration 0.3.1

- Reagiert auf den auf dem echten Gerät bestätigten Mod-Import-Abbruch: Die bisher zusammengefasste Meldung deutete entweder auf das zu knappe 4.096-Eintragslimit oder beschädigte Verzeichnisgrenzen. Das sichere Limit steigt auf 32.768; beide Ursachen haben jetzt getrennte Meldungen.
- Trennt die Fehlermeldungen für Eintragslimit und beschädigte Zentralverzeichnisgrenzen, damit weitere Gerätebefunde eindeutig sind.
- Liest ein Modarchiv nur noch einmal als `Data` und verwendet dieselben Bytes für SHA-256 und ZIP-Preflight; dadurch entfällt eine zweite vollständige Dateilesung.
- Ergänzt ein 200:1-Entpackverhältnis-Limit und gleicht komprimierte wie entpackte Größen zusätzlich mit Scripting `Archive.entries()` ab.
- Regressionstests decken mehr als 4.096 Einträge und Dekompressionsbomben ab.
- Mod-Importfehler nennen jetzt die genaue Phase und schreiben einen datensparsamen Bericht nach `Diagnostics/mod-import-last-failure.v1.json`; Diagnosefehler können den ursprünglichen Importfehler nicht mehr verdecken.
- Nach erfolgreicher Index-Publikation gilt fehlgeschlagene temporäre Bereinigung nicht mehr fälschlich als fehlgeschlagene Installation; die Start-Recovery übernimmt den Rest.

Status: **TEILWEISE VERIFIZIERT** — der ursprüngliche Fehler ist durch Gerätefeedback belegt; der frühere Grenzwert und die neue Annahme von mehr als 4.096 Einträgen sind reproduzierbar getestet. Ob genau dieser Grenzwert das konkrete ZIP blockierte, zeigt erst der erneute Geräteimport beziehungsweise die nun eindeutige Meldung.


## Iteration 0.3.0

- Vier dokumentationskonforme Bottom-Tabs: Spiele, Mods, Diagnose und Einstellungen, jeweils mit eigenem `NavigationStack`.
- Lokaler Mod-ZIP-Import mit Central-Directory-Preflight, Größenlimits, Symlink-/Traversal-/Duplikat-Sperren, Manifest-Basiskontrolle, SHA-256 und unveränderlichem `id/version/hash`-Speicher. Pakete werden ausdrücklich noch nicht aktiviert.
- Sichtbares Komponenten-Inventar für Scripting-Shell, Gen1Recomp-Payload und love.js; die Release-Prüfung ist nutzerinitiiert und nur lesend.
- Update- und Rollback-Architektur sowie eine explizite Konformitätsprüfung liegen unter `docs/architecture/`.
- Runtime und Netzwerk-Aktivierung bleiben deaktiviert, bis die dokumentierten Geräte-Gates bestanden sind.

Status: **TEILWEISE VERIFIZIERT** — Quellcode/Tests bestanden und die Bottom-Tabs starten auf dem echten Gerät; der erste Mod-ZIP-Test meldete den inzwischen getrennt behandelten Eintragslimit-/Zentralverzeichnisfehler.


## Implementiert

| Bereich | Implementierung | Evidenzstatus |
|---|---|---|
| Sichtbarer Root | `Documents/Gen1Recomp` mit Library, Cores, Profiles, Saves, Mods, Generated, Cache, Transactions, Diagnostics, Recovery, Inbox und Exports | VERIFIZIERT gegen dokumentierte freie FileManager-API; Gerätetest ausstehend |
| Content-Import | Picker → Größenprüfung → SHA-1/SHA-256 → Stage → erneuter SHA-256 → Publish → Index | implementiert; Gerätetest ausstehend |
| Import-Recovery | persistentes `import-pending.v1.json`; veröffentlichten Content in Index übernehmen oder unpubliziertes Stage verwerfen | implementiert und zustandsweise geprüft; Kill-Test ausstehend |
| Content-Identität | kanonische US-Hashes für Red, Blue, Yellow aus upstream v0.3.18; unbekannter Inhalt wird nicht als kompatibel markiert | VERIFIZIERT / Unit-Test |
| Content Store | `Library/content/<sha256>/original.gb|original.bin` plus `content.json` | implementiert |
| Library-Index | validiertes Schema, `.tmp`, `.bak`, Restore bei beschädigtem/fehlendem Primärindex; 0.1-Einträge werden aus dem gespeicherten Original neu erkannt und verlustfrei ergänzt | implementiert |
| Capability-Probe v2 | dokumentiertes lokales `loadFile` mit relativer JS-Subresource, WASM validate/instantiate, SIMD, WebGL context+Readback, AudioContext-Konstruktion, Worker/SAB/Isolation/OffscreenCanvas, IndexedDB-/Gamepad-/Touch-API, Umgebung | PROBE, keine Runtime-Zertifizierung; konkrete WASM/Data-Subresource ausstehend |
| Runtime-Gate | maschinenlesbare Blockiergründe; Start bleibt aus | VERIFIZIERT im Buildgraph |
| Free Tier | keine bekannte Pro-API; `BackgroundKeeper`-Scan | VERIFIZIERT statisch |
| Buildprüfung | Node strict typecheck, enger dokumentationsbasierter Scripting-Hostvertrag, Global-vs-Modul-Grenzcheck, TSX-Bundlegraph, 19 Tests | VERIFIZIERT lokal |
| Testpaket | deterministisches ZIP mit `.scripting`-Endung, `script.json` im Root, Integritätstest und SHA-256-Sidecar | VERIFIZIERT; `npm run check` erkennt ein fehlendes oder veraltetes Paket |

## Verifizierter Gerätebefund

Version 0.2.1 importierte irrtümlich globale Host-APIs aus dem Modul `scripting`. Die echte App meldete deshalb `DocumentPicker` als fehlenden Export; das importierte `FileManager` war zur Laufzeit `undefined`. Version 0.2.2 entfernt diese Imports. Offizielle Beispiele bestätigen die Trennung: UI-/React-Symbole kommen aus `scripting`, während `DocumentPicker`, `FileManager`, `Crypto` und `WebViewController` globale Hostobjekte sind. Der Buildcheck blockiert diese fehlerhafte Importform nun dauerhaft.

Status: **VERIFIZIERT durch realen Gerätelauf und offizielle Beispiele; in 0.2.2 behoben.**

## Bewusst blockiert

Ein Start-Button wird erst freigeschaltet, wenn **alle** folgenden Artefakte/Tests vorhanden sind:

1. reproduzierbarer love.js-Compatibility-Build des verifizierten v0.3.18-Payloads;
2. `loadFile`-/Read-Access-Test für lokale HTML/JS/WASM/Data-Subresources;
3. love.js-Boot bis zu einem eindeutigen Runtime-Ready-Handshake;
4. WebAudio-Funktion nach User-Gesture sowie Aussetzer-/Lifecycle-Test;
5. VFS-Save → sichtbarer Host-Commit mit Generation, Hash und ACK;
6. Relaunch-, App-Kill- und WebContent-Kill-Recovery;
7. Golden-Parität für Start, Bewegung, Map, Battle, Save/Load;
8. reale Memory-/Frame-/Startzeit-Messungen auf mindestens zwei Geräteklassen.

`config.ts` hält `runtimeEnabled: false`. Ein Capability-API-Häkchen allein darf dieses Flag nicht ändern.

## Nächster implementierbarer Schritt

R1 erzeugt außerhalb des App-Projekts ein gepinntes, lizenzkonformes love.js-Core-Artefakt mit Manifest und Dateihashes. Anschließend wird es **manuell** über einen Core-Import in `Cores/<core>/<version>/<hash>` gestaged. Automatische Downloads und Aktivierung kommen erst nach erfolgreichem lokalen Device-Gate. So bleibt die App offline-first und ein fehlgeschlagener Spike kann weder Library noch Saves gefährden.
