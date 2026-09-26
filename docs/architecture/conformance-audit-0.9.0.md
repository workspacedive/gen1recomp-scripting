# Architektur-Konformitätsprüfung 0.9.0

Stand: 2026-09-26

## Anlass

Das reale love.js-`nogame`-Gate ist erfolgreich. Der nächste Nutzerbefund meldet jedoch, dass „Freigegebenen Payload laden und prüfen“ nicht zurückkehrt. Ohne Phasenjournal ist nicht unterscheidbar, ob Netzwerktransfer, `Response.data`, ZIP-Preflight, Hash oder Dateischreiben blockiert.

## Schritt 1: begrenztes und beobachtbares Payload-Staging

Der gepinnte GitHub-Abruf verwendet jetzt zusätzlich `AbortSignal.timeout(180_000)`. Die bestehende feste URL-, Redirecthost-, Größen- und SHA-256-Bindung bleibt unverändert.

Vor jeder potenziell langen Phase schreibt der Host atomar nachvollziehbare Fortschrittsdaten nach `Diagnostics/payload-stage-progress.v1.json` und meldet die Phase in der UI:

- `network-download`
- `network-response-data`
- `size-and-sha256`
- `zip-preflight`
- `payload-metadata`
- `transaction-write`
- `transaction-rehash`
- `atomic-publish`

Nach erfolgreicher Publikation wird das Fortschrittsartefakt entfernt. Nach Abbruch bleibt die letzte Phase zur Diagnose erhalten. Kandidaten werden weiterhin niemals teilweise publiziert oder überschrieben.

## Schritt 2: unverändertes Payload-Boot-Gate

Der Gen1Recomp-0.3.20-Payload wird unmittelbar vor Verwendung erneut auf Manifest, Bytezahl und SHA-256 geprüft. Nur der feste Payloadalias und die drei Runtime-Supportressourcen gelangen über `gen1HostBridge`. Ein postrun des Player-Fallbacks wird durch den `Player.uri`-Vergleich abgelehnt.

Das Gate mountet keine ROM, Mods, Saves oder Profile und schreibt keinen aktiven Pointer.

## Schritt 3: sichtbare Launcher-Vorschau

Eine zweite Diagnoseaktion führt denselben Payload-Boot aus und präsentiert die bereits erfolgreich initialisierte WebView anschließend mit der dokumentierten `WebViewController.present`-API. Der Bootbericht wird vor der Darstellung persistiert. Nach Schließen der Vorschau wird der Controller entsorgt.

Die Vorschau ist kein produktiver Spielstart:

- `APP.runtimeEnabled` bleibt `false`;
- kein ROM wird bereitgestellt;
- kein Save wird vom VFS zum Host synchronisiert;
- Mods bleiben inaktiv;
- kein Runtime-/Payloadpointer wird aktiviert;
- ein Erfolg schaltet keine andere Funktion frei.

## Architekturgrenzen

Upstream `player.js`, `love.js`, WASM und Gen1Recomp bleiben byteidentisch. Neue Funktionalität liegt ausschließlich in Stagingdiagnose, Hostadapter und WebView-Präsentation. Die bestehende Runtime r4 bleibt updatefähig und getrennt vom Payload.

## Nächste zulässige Stufe

Erst nach einem real bestätigten Payload-postrun und sichtbaren Launcher darf ein einzelner bereits content-adressierter Library-ROM-Datensatz über einen neuen read-only Bridgealias angeboten werden. Die dafür nötige Emscripten-FS-/Importanbindung muss außerhalb von Gen1Recomp implementiert und separat gegatet werden.

Gesamtstatus: **EXPERIMENTELL / TEILWEISE VERIFIZIERT**.
