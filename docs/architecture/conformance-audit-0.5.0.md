# Architektur-Konformitätsprüfung 0.5.0

Stand: 2026-09-26

## Ergebnis

Iteration 0.5.0 führt erstmals einen konkreten, gepinnten love.js-Kandidaten und ein isoliertes Boot-Gate ein. Sie aktiviert **keinen** Gen1Recomp-Payload und keinen Spielstart. Gesamtstatus: **EXPERIMENTELL / TEILWEISE VERIFIZIERT**.

## Herkunft und Reproduzierbarkeit

- Quelle: offizielles Repository `2dengine/love.js`, Revision `9355186de22db13bd88bf2a0db75d2925647d036`.
- Ziel-LÖVE-Version: 11.5.
- Unverändert übernommen: `player.js`, `nogame.love`, `lua/normalize1.lua`, `lua/normalize2.lua`, `11.5/love.js`, `11.5/love.wasm`, `11.5/license.txt`.
- `runtime-manifest.ts` enthält feste SHA-256-Werte. Der Node-Test liest und hasht jede Datei; die Scripting-App hasht sowohl den Projektbestand als auch jede Staging-Kopie.
- Der selbst erstellte `harness.html` ist als achte, ebenfalls gehashte Adapterdatei ausdrücklich getrennt vom upstream Runtimecode.

Status: **VERIFIZIERT** für Repository-Bytebestand und lokale Tests; **NICHT VERIFIZIERT** für die Ausführung in Scripting auf iOS.

## Schichtengrenzen

| Schicht | 0.5.0-Verhalten | Bewertung |
|---|---|---|
| Host/Scripting | `FileManager`, `Crypto`, `WebViewController` und Message-Handler nur im Hostadapter | konform |
| Runtime-Adapter | `harness.html` beobachtet Playerzustand und sendet ein enges `runtimeEvent` | konform, EXPERIMENTELL |
| love.js | gepinnte upstream Dateien bleiben byteidentisch | konform |
| Gen1Recomp-Payload | bleibt in `Cores/payloads/0.3.20`, wird weder gelesen noch an love.js übergeben | konform |
| Mods/Saves/Nutzerdaten | weder gemountet noch verändert | konform |

Es gibt keine invasive Änderung am Gen1Recomp-Hauptcode. Der Host-Harness startet ausschließlich das offizielle `nogame.love`.

## Installation und Recovery

1. Alle eingebetteten Quelldateien werden vor Verwendung gegen den Pin gehasht.
2. Kopien entstehen nur unter `Transactions/runtime-lovejs-11.5-r1`.
3. Jede Kopie wird erneut gehasht.
4. Erst danach wird das Kandidatenmanifest geschrieben und der komplette Ordner atomar nach `Cores/runtimes/lovejs-11.5-r1` umbenannt.
5. Ein unbekannter vorhandener Zielordner wird nicht überschrieben.
6. Unterbrochenes Staging wird beim Appstart verworfen.
7. Vor jedem Boot werden sämtliche Dateien erneut gehasht.

Status: **VERIFIZIERT** durch statische Prüfung, Typecheck und Hash-Inventartest; Kill-Recovery auf dem Gerät bleibt **NICHT VERIFIZIERT**.

## Bridge und Aussagegrenze

Der Harness lädt über die dokumentierte Methode `loadFile(path, allowingReadAccessTo)`. JavaScript meldet genau ein strukturiertes Ereignis über den dokumentierten Handler `runtimeEvent`: `ready`, `error` oder `timeout`. `ready` wird erst gesendet, wenn upstream `player.js` den Spinner in `Module.postrun` zurücksetzt. Ein 30-Sekunden-Timer verhindert unbegrenztes Warten, sofern die HTML-Seite JavaScript ausführt.

Ein `ready`-Bericht beweist nur:

- lokale HTML- und JS-Ausführung,
- hinreichenden Zugriff des Players auf sein `nogame`-/Lua-/WASM-Inventar,
- Initialisierung bis `Module.postrun`,
- Vorhandensein der gemeldeten WebAssembly- und IndexedDB-APIs.

Er beweist **nicht**:

- Gen1Recomp-Gameplay oder Payload-Kompatibilität,
- funktionale Audioausgabe nach User-Geste,
- Save-Persistenz oder sichtbaren Host-Commit,
- Background-/Kill-/WebContent-Recovery,
- Controllerfunktion, Performance oder Speicherstabilität.

## Aktivierungssperren

- `APP.runtimeEnabled` bleibt `false`.
- Es existiert weiterhin kein aktiver Core- oder Runtime-Pointer.
- „Spiele“ enthält keinen Start-Button.
- Der Boot-Test ist ausschließlich unter „Diagnose“ als **EXPERIMENTELL** erreichbar.
- Ein Testbericht schaltet keine andere Funktion frei.

Status: **VERIFIZIERT** im Buildgraph.

## Nächstes zwingendes Gate

Der Nutzer muss 0.5.0 auf einem echten Gerät importieren und den Boot-Test ausführen. Ein gemeldeter Fehler oder Timeout wird untersucht, ohne upstream love.js oder Gen1Recomp direkt zu patchen. Nur bei `ready` darf eine folgende Iteration einen separaten Pakettransferadapter für den bereits verifizierten Gen1Recomp-Payload hinzufügen.
