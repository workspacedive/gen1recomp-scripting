# Gen1Recomp Scripting Host 0.10.8

Importiere den Ordner `Gen1Recomp` als Scripting-Projekt. Die App nutzt ausschließlich APIs, die in der geprüften offiziellen App-Store-Dokumentation nicht als Pro markiert sind. Seit 0.2.2 werden `DocumentPicker`, `FileManager`, `Crypto` und `WebViewController` korrekt als von Scripting injizierte Globals verwendet; nur UI-/React-Symbole werden aus `scripting` importiert.

## Aktueller Umfang

- sichtbares Ordnersystem unter `Dateien → Auf meinem iPhone → Scripting → Gen1Recomp` (der genaue Containername wird von Scripting/iOS dargestellt),
- einmaliger Content-Import mit Größenlimit, SHA-1/SHA-256, verifiziertem Staging und persistentem Recovery-Journal,
- Erkennung der kanonischen US-ROMs von Red, Blue und Yellow anhand der upstream SHA-1-Werte,
- content-addressed Originale plus `content.json`,
- Library-Index mit Temp-/Backup-Recovery und verlustfreier Migration des 0.1-Index durch erneutes Hashen des bereits gespeicherten Originals,
- WebView-Probe v3, die per dokumentiertem `loadFile(..., allowingReadAccessTo)` eine lokale HTML-Datei samt relativer JS-Subresource lädt, nur die WASM-API-Präsenz meldet und WebGL-Readback, AudioContext, Worker, SharedArrayBuffer, IndexedDB-API, Touch und Gamepad-API prüft; direkte WASM-Validierung oder -Instanziierung ist gemäß Bridge-Richtlinie entfernt,
- explizites Runtime-Gate mit maschinenlesbaren Blockiergründen,
- lokaler Mod-Paketspeicher mit eigenem ZIP-/DEFLATE-/CRC-32-Code, 32.768-Eintragslimit, 200:1-Entpacklimit, sicherer Einzelextraktion, SHA-256-Identität und phasengenauer Fehlerdiagnose,
- keine hostseitige Archiv-API; PRO-pflichtige Archivwege sind regressionsgesperrt,
- opt-in Payload-Staging für den fest gepinnten Gen1Recomp-0.3.20-Kandidaten mit URL-/Host-/Größen-/SHA-256-/ZIP-/Version-Gates und weiterhin gesperrter Aktivierung,
- fest gepinnter offizieller love.js-/LÖVE-11.5-Kandidat aus Commit `9355186…`, dessen acht Dateien vor und nach der transaktionalen Installation vollständig per SHA-256 geprüft werden,
- separater, enger WebView-Bridge-Harness: Er startet ausschließlich upstream `nogame.love`, meldet versionierte Meilensteine/Fehler/Timeout über `gen1HostBridge` und schreibt das Ergebnis nach `Diagnostics/lovejs-boot.v1.json`,
- allowlisteter Resource-Bridge-Transport in maximal 128-KiB-Chunks; WASM bleibt opak und wird ausschließlich vom unveränderten love.js/Emscripten intern instanziiert,
- auf 180 Sekunden begrenztes, phasenjournalisiertes Payload-Netzwerkstaging mit letzter Phase unter `Diagnostics/payload-stage-progress.v1.json`,
- getrenntes Payload-Gate für den erneut größen-/SHA-256-geprüften Gen1Recomp-0.3.20-Kandidaten, ohne ROM-, Mod- oder Save-Mount und ohne Aktivierung,
- sichtbare fullscreen Launcher-Vorschau erst nach erfolgreichem Payload-postrun; beim Schließen wird die experimentelle WebView vollständig entsorgt,
- vorhandene deutsche/englische Textbasis; die neuen Tabtexte sind noch deutsch und als offene Lokalisierungsarbeit dokumentiert,
- ein ausdrücklich **experimenteller** Start pro erkanntem Library-ROM über den unveränderten `POKEPORT_IMPORT_ROM`-Pfad sowie ein nur dort aktivierter Multitouch-Controller für D-Pad, A, B, START und SELECT; Start und Eingabe sind geräteverifiziert, während Adapter r13 den beobachteten QueueableSource-Typbruch an der Runtimegrenze abfängt. Audio, Saves, Lifecycle und längeres Gameplay bleiben unbestätigt.

## Datenintegrität

Ein Import verändert die ausgewählte Quelldatei nicht. Die App schreibt zuerst in `Transactions`, prüft den SHA-256 erneut, publiziert danach in `Library/content/<sha256>` und aktualisiert erst anschließend den Library-Index. Bei Abbruch erkennt `import-pending.v1.json` beim nächsten Start, ob veröffentlicht oder nur gestaged wurde. Bereits veröffentlichter Content wird in den Index aufgenommen; ein unvollständiges Stage wird verworfen. Kritische Daten liegen nie nur unter `Cache`.

## Grenzen der Capability-Probe

Die Probe ist keine Runtime-Zertifizierung. Insbesondere testet sie noch nicht:

- Launcher-Darstellung mit Runtime r5,
- ROM-Import und sichtbares Gameplay mit dem getrennt gestagten Gen1Recomp-Payload,
- Audio-Latenz oder Aussetzer,
- IndexedDB-Schreib-/Relaunch-Persistenz,
- sichtbaren Host-Save-Commit und Recovery nach App-/WebContent-Kill.

Darum bleibt `runtimeEnabled` in `config.ts` auf `false`.
