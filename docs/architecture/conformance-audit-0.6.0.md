# Architektur-Konformitätsprüfung 0.6.0

Stand: 2026-09-26

## Anlass

Der reale 0.5.1-Bericht endete kontrolliert mit `status=timeout`, `stage=runtime-event` und ohne Runtime-Ereignis. `loadFile` und `waitForLoad` waren damit erfolgreich. Gleichzeitig präzisierte der Auftraggeber die verbindliche Grenze: Der Host darf WASM nicht direkt steuern; Hostinteraktion läuft über API-Bridges und die Runtime muss unabhängig updatebar sein.

## Bridgegrenze

0.6.0 ersetzt das undifferenzierte Ereignis durch `gen1HostBridge` v1. Der reine Parser akzeptiert nur die feste Protokollversion und folgende Nachrichtentypen:

- `bridge.ready`
- `resources.ready` / `resources.error`
- `player.loaded`
- `runtime.ready` / `runtime.error` / `runtime.timeout`

Unbekannte Versionen, Typen oder nicht strukturierte Nachrichten werden verworfen. Der direkte WebKit-Aufruf ist ausschließlich im Host-Harness gekapselt. Gen1Recomp und upstream love.js kennen keine Scripting-API.

## WASM-Eigentum

- `love.wasm` bleibt ein SHA-256-gepinnter, opaker Bestandteil des Runtimekandidaten.
- Der Scripting-Host darf die Datei kopieren und kryptografisch auf Identität prüfen, aber nicht auswerten, patchen, instanziieren oder Exporte beziehungsweise Speicher direkt ansprechen.
- Der Adapter-Preflight lädt `.love`, Normalizer und `love.js`, aber ausdrücklich nicht `love.wasm`.
- Ausschließlich der unveränderte offizielle love.js-/Emscripten-Loader lädt und instanziiert sein zugehöriges WASM innerhalb der Runtime.
- Capability-Probe v3 prüft nur `typeof WebAssembly`; die synthetische Modulvalidierung, Instanziierung und SIMD-Probe wurde entfernt.

Das ist die notwendige technische Trennung: Die interne JS↔WASM-Beziehung gehört zur austauschbaren Runtime. Scripting↔Runtime und spätere Datei-/Save-/Lifecycle-Zugriffe gehören zur versionierten Hostbridge.

## Updatefähigkeit

Der neue Kandidat heißt `lovejs-11.5-r2` und deklariert:

- LÖVE-Version 11.5,
- unveränderte upstream Revision `9355186de22db13bd88bf2a0db75d2925647d036`,
- Adapterversion 2,
- Bridgeprotokoll 1,
- Vorgänger `lovejs-11.5-r1`,
- Updatepolitik `reviewed-side-by-side-candidate`.

r2 wird in einen neuen content-separierten Ordner installiert. r1 wird nicht überschrieben oder gelöscht. Es gibt weiterhin keinen aktiven Runtimepointer. Zukünftige Runtimeupdates benötigen einen neuen geprüften Katalogeintrag, vollständige Dateihashes und ein separates Gerätegate; Discovery-Metadaten dürfen keine Bytes autorisieren.

## Diagnose

Der Bericht führt die empfangenen `milestones` und die letzte monotone Phase:

1. `load-file`
2. `wait-for-load`
3. `bridge-handshake`
4. `resource-preflight`
5. `player-load`
6. `runtime-ready`
7. `complete`

Dadurch unterscheidet der nächste Gerätelauf fehlende WebKit-Bridge, nicht lesbare lokale Adapterressourcen, blockierendes Player-Skript und eine nicht erreichte Runtimebereitschaft.

## Aktivierung

`APP.runtimeEnabled` bleibt `false`. Weder r1 noch r2 wird als aktive Runtime markiert. Der Gen1Recomp-0.3.20-Payload bleibt ungemountet und unausgeführt. Mods, Saves, Library und Nutzerdaten werden vom Test nicht berührt.

Gesamtstatus: **EXPERIMENTELL / TEILWEISE VERIFIZIERT**. Der Code erfüllt die Schichtengrenzen und reproduzierbaren Updatepins; das reale r2-Bridge-/Boot-Ergebnis ist noch **NICHT VERIFIZIERT**.
