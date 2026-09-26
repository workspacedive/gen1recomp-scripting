# Capability- und Free-Tier-Matrix

Stand 2026-09-25. „Dokumentiert“ ist nicht gleich „für 60-fps-Gameplay geeignet“.

| Fähigkeit | Status | Free/Pro | Integrationsentscheidung / Probe |
|---|---|---:|---|
| TypeScript/TSX App UI | VERIFIZIERT | Free | Scripting-Host-UI. |
| Sichtbarer Documents-Ordner | VERIFIZIERT | Free | Persistenter Root `Documents/Gen1Recomp/`. |
| Byte-Dateien lesen/schreiben | VERIFIZIERT | Free | ROM-Import und Manifeste; niemals synchron im Framepfad. |
| Rename/Copy/Remove/Stat | VERIFIZIERT | Free | Journaled activation; keine unbelegte atomare Replace-Annahme. |
| Datei-/Ordnerpicker | VERIFIZIERT | Free | Einmaliger Import; intern kopieren, Bookmark nur optional. |
| ZIP/Unzip | TEILWEISE VERIFIZIERT | Free | API existiert; Zip-Slip-/Bomben-Schutz nicht dokumentiert. Untrusted Mods bis Preflight blockieren. |
| SHA-1/SHA-256 | TEILWEISE VERIFIZIERT | Free | `Crypto` ist dokumentiert; konkrete Streaming-/Großdatei-Performance Device-Test. |
| App-Lifecycle | VERIFIZIERT | Free | Beim inactive/background: Eingabe stoppen, kritischen Zustand flushen. |
| Background Keep Alive | VERIFIZIERT | **Pro** | Verboten. P0 funktioniert ohne Hintergrundlauf. |
| SwiftUI Canvas | VERIFIZIERT | Free | Launcher/Diagnose möglich; nicht als LÖVE-Ersatz planen. |
| TimelineCanvas ~60 fps | VERIFIZIERT | Free | Nur UI-/Probe; Main-Thread und Bridgekosten benchmarken. |
| WebViewController, lokale Datei | VERIFIZIERT | Free | Runtime-Kandidat, `loadFile(path, allowingReadAccessTo)`. |
| JS↔Host-Nachrichten | VERIFIZIERT | Free | Kontrollkanal; keine Framebuffer-Kopien über Bridge. |
| WebAssembly in Scripting-WebView | TECHNISCH UNBEKANNT | unbekannt | Probe: `WebAssembly.validate` + Mini-Modul + große Memory-Instanz. |
| love.js v0.3.18 Boot | NICHT VERIFIZIERT | unbekannt | Reproduzierbaren Compatibility-Build erzeugen und Gerätetest. |
| WebGL | TECHNISCH UNBEKANNT | unbekannt | `canvas.getContext('webgl2'|'webgl')`, Texture-/context-loss-Test. |
| WebGPU | NICHT VERIFIZIERT | unbekannt | Nicht P0; kein Fallback darauf aufbauen. |
| Web Audio / AudioWorklet | TECHNISCH UNBEKANNT | unbekannt | User-Gesture unlock, Latenz, Unterbrechung, Hintergrund testen. |
| Worker | TECHNISCH UNBEKANNT | unbekannt | Dedicated Worker und blob/file origin testen. |
| SharedArrayBuffer / WASM threads | TECHNISCH UNBEKANNT | unbekannt | Wahrscheinlich Origin-Isolation-abhängig; Compatibility-Build muss ohne Threads laufen. |
| OffscreenCanvas | TECHNISCH UNBEKANNT | unbekannt | Kein P0-Vertrag. |
| WASM SIMD | TECHNISCH UNBEKANNT | unbekannt | Feature-Probe + A/B-Benchmark, sonst scalar. |
| Streaming Compilation | TECHNISCH UNBEKANNT | unbekannt | Lokale MIME-/Response-Pfade testen; ArrayBuffer fallback. |
| Persistent IndexedDB | TECHNISCH UNBEKANNT | unbekannt | Relaunch-, Update- und WebView-dispose-Test. Nicht alleinige Save-Wahrheit. |
| Native AVPlayer | VERIFIZIERT | Free | Für UI-Medien; nicht direkt kompatibel mit ChipAudio PCM-Pipeline. |
| Controller/Gamepad | NICHT VERIFIZIERT | unbekannt | Touch ist P0; Gamepad API + native Controller separat testen. |
| Haptics | TEILWEISE VERIFIZIERT | Free-Pfad vorhanden | `HapticFeedback` ist unmarkiert; neueres `Haptics` im Changelog Pro. Nur freien Basisadapter nutzen. |
| Memory-Pressure Callback | NICHT VERIFIZIERT | unbekannt | Kein API-Beleg; indirekte Budgets + WebView crash recovery. |
| Unbegrenzte Background-Jobs | NICHT UNTERSTÜTZT | — | iOS darf suspendieren/terminieren; keine Gameplay-Anforderung. |

## Device-Probe-Abnahmetabelle

Ein Gerätelauf schreibt ausschließlich Capability-Metadaten, keine ROM-Inhalte:

```json
{
  "schemaVersion": 1,
  "scriptingVersion": "device-reported",
  "iosVersion": "device-reported",
  "deviceClass": "user-redacted",
  "wasm": { "basic": false, "simd": false, "threads": false },
  "graphics": { "webgl1": false, "webgl2": false, "contextRestore": false },
  "audio": { "webAudio": false, "unlock": false },
  "storage": { "localSubresources": false, "indexedDbRelaunch": false },
  "workers": { "dedicated": false, "offscreenCanvas": false },
  "gamepad": false
}
```

Erst wenn `wasm.basic`, mindestens ein WebGL-Kontext, Audio-Unlock, lokale Subresources und Relaunch-Persistenz positiv sind, darf Phase R2 starten. Threads/SIMD/Gamepad sind optionale Verbesserungen.
