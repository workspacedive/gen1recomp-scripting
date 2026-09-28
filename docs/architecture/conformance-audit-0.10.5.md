# Architektur-Konformitätsprüfung 0.10.5

Stand: 2026-09-26

## Regression aus 0.10.4

**VERIFIZIERT (Quellprüfung):** `session.config` wurde durch die neue Fehlerpersistenz versehentlich von einem synchronen Bridge-Handler in einen `async`-Handler geändert. Scripting serialisiert den unmittelbaren Rückgabewert des Script-Message-Handlers; dadurch erhielt der Harness statt der Konfiguration ein nicht passendes Promise-Ergebnis und brach korrekt mit `Invalid host session configuration` ab. Dies betraf `nogame`, Payload und Gameplay gleichermaßen und erklärt den Abbruch in `resource-preflight`.

r10 stellt den Handler wieder synchron her. Die Fehlerdatei wird weiterhin geschrieben, aber bewusst fire-and-forget mit eigener Fehlerbehandlung, sodass keine Diagnose den Bridgevertrag verändern kann. Ein Regressionstest verbietet künftig einen asynchronen `gen1HostBridge`-Handler.

## Gameplay-Controller

Der Gameplay-Modus erhält jetzt einen hosteigenen Touch-Controller im Harness:

- D-Pad: Pfeiltasten
- A: `Z`
- B: `X`
- SELECT: `Tab`
- START: `Escape`
- Pointer-Capture und getrennte Pointer-IDs erlauben mehrere gleichzeitig gehaltene Tasten.
- `pointerup`, Abbruch, verlorene Capture und Fensterfokusverlust senden Releases, damit keine Richtung hängen bleibt.
- Der Controller wird ausschließlich über das versionierte `session.config`-Flag für den ROM-/Gameplay-Modus aktiviert. `nogame`, Payload-Test und Launcher-Vorschau bleiben unverändert.

Die Tasten entsprechen exakt den unveränderten Standardbindungen in `src/core/Input.lua`; es wird kein Gen1Recomp-Eingabesystem dupliziert. Die Web-Oberfläche erzeugt Standard-KeyboardEvents, die der offizielle Emscripten/SDL-Ereignispfad verarbeitet.

## Status

- synchroner Bridgevertrag und Modusisolation: **VERIFIZIERT (automatisiert/statisch)**
- Touch-Controller-Layout, Mehrfingermodel und Releasepfade: **VERIFIZIERT (statisch)**
- Controllerereignisse bis Gen1Recomp auf Scripting/iOS: **NICHT VERIFIZIERT**
- Runtime r10, Rail-Fix, Gameplay, Audio, Saves und Lifecycle: **NICHT VERIFIZIERT**

Upstream Gen1Recomp, Player, love.js, WASM und Normalisierung bleiben byteidentisch.
