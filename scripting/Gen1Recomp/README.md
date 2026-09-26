# Gen1Recomp Scripting Host 0.2.1

Importiere den Ordner `Gen1Recomp` als Scripting-Projekt. Die App nutzt ausschließlich APIs, die in der geprüften offiziellen App-Store-Dokumentation nicht als Pro markiert sind.

## Aktueller Umfang

- sichtbares Ordnersystem unter `Dateien → Auf meinem iPhone → Scripting → Gen1Recomp` (der genaue Containername wird von Scripting/iOS dargestellt),
- einmaliger Content-Import mit Größenlimit, SHA-1/SHA-256, verifiziertem Staging und persistentem Recovery-Journal,
- Erkennung der kanonischen US-ROMs von Red, Blue und Yellow anhand der upstream SHA-1-Werte,
- content-addressed Originale plus `content.json`,
- Library-Index mit Temp-/Backup-Recovery und verlustfreier Migration des 0.1-Index durch erneutes Hashen des bereits gespeicherten Originals,
- erweiterte WebView-Probe, die per dokumentiertem `loadFile(..., allowingReadAccessTo)` eine lokale HTML-Datei samt relativer JS-Subresource lädt und außerdem WASM-Validierung/Instanziierung, WebGL-Clear/Readback, AudioContext, Worker, SharedArrayBuffer, IndexedDB-API, Touch und Gamepad-API prüft,
- explizites Runtime-Gate mit maschinenlesbaren Blockiergründen,
- deutsche/englische Texttrennung,
- bewusst **kein** Runtime-Start, solange ein konkreter love.js-Build, lokale Subresources, persistente VFS-Saves, Audio und Kill-Recovery auf echten Geräten nicht verifiziert sind.

## Datenintegrität

Ein Import verändert die ausgewählte Quelldatei nicht. Die App schreibt zuerst in `Transactions`, prüft den SHA-256 erneut, publiziert danach in `Library/content/<sha256>` und aktualisiert erst anschließend den Library-Index. Bei Abbruch erkennt `import-pending.v1.json` beim nächsten Start, ob veröffentlicht oder nur gestaged wurde. Bereits veröffentlichter Content wird in den Index aufgenommen; ein unvollständiges Stage wird verworfen. Kritische Daten liegen nie nur unter `Cache`.

## Grenzen der Capability-Probe

Die Probe ist keine Runtime-Zertifizierung. Insbesondere testet sie noch nicht:

- love.js-Boot mit Gen1Recomp,
- konkrete `game.js`/`.wasm`/`.data`-Subresources (die Probe belegt nur eine relative lokale JS-Datei),
- Audio-Latenz oder Aussetzer,
- IndexedDB-Schreib-/Relaunch-Persistenz,
- sichtbaren Host-Save-Commit und Recovery nach App-/WebContent-Kill.

Darum bleibt `runtimeEnabled` in `config.ts` auf `false`.
