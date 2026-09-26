# Implementierungsstand der Scripting-App

Stand: 2026-09-26 · App-Version `0.2.2`

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
| Buildprüfung | Node strict typecheck, enger dokumentationsbasierter Scripting-Hostvertrag, Global-vs-Modul-Grenzcheck, TSX-Bundlegraph, 10 Tests | VERIFIZIERT lokal |
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
