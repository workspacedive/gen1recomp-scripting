# Gen1Recomp for Scripting iOS

Architektur- und Implementierungsbasis für einen **Free-Tier-kompatiblen** Gen1Recomp-Host in der [Scripting iOS App](https://scripting.fun/).

> **Ehrlicher Status:** Die Scripting-App 0.6.0 besitzt vier native Tabs, persistente Library/Mod-/Payload-Speicher und ein explizites Runtime-Gate. Der offizielle, bytegenau gepinnte love.js-/LÖVE-11.5-Bestand wird durch den updatefähigen Adapter r2 ausschließlich über `gen1HostBridge` v1 diagnostiziert. Dieser Diagnosepfad ist **EXPERIMENTELL** und muss auf dem echten Gerät bestätigt werden. Der Gen1Recomp-Payload bleibt getrennt und inaktiv; Gameplay, Audio, Saves und Lifecycle sind nicht freigeschaltet.

## Warum kein schneller Rewrite?

Gen1Recomp v0.3.20 besteht aus einem großen Lua/LÖVE-Core mit Fixed-Step-Timing, SpriteBatch-Renderer, ChipAudio, Imports, Saves, Mods, Hooks und Updater. Ein Nachbau in TypeScript/SwiftUI Canvas wäre eine zweite Engine und würde Kompatibilität verlieren. Die Zielarchitektur hält den Originalcore in einem versionierten love.js/WASM-Paket und setzt davor einen sauberen Scripting Host Adapter.

## Enthalten

- [`docs/audit/evidence.md`](docs/audit/evidence.md) — revisionsgebundener Gen1Recomp-/APK-/Scripting-Audit mit Verifikationsstatus.
- [`docs/audit/apk-static-analysis.md`](docs/audit/apk-static-analysis.md) — reproduzierbare Multipart-Rekonstruktion, APK-Identität, Manifest, Signatur, DEX, native Libraries und vollständiger `game.love`-Source-Abgleich.
- [`docs/audit/capability-matrix.md`](docs/audit/capability-matrix.md) — WASM, Grafik, Audio, Storage, Worker, Input und Free/Pro.
- [`docs/audit/ui-ux.md`](docs/audit/ui-ux.md) — APK-/Launcher-UI-Audit und begründete Scripting-Abbildung.
- [`docs/architecture/target-architecture.md`](docs/architecture/target-architecture.md) — Zielarchitektur, Datenmodell, Mermaid-Diagramme, Updates, Recovery, Saves, Mods, Sicherheit, Performance, Risiken, Roadmap und Abnahme.
- [`docs/architecture/component-updates.md`](docs/architecture/component-updates.md) — revisionsgebundene love.js-/Payload-/Mod-Analyse, Trust-Modell, Staging, Health-Checks und Rollback.
- [`docs/architecture/conformance-audit-0.3.0.md`](docs/architecture/conformance-audit-0.3.0.md) bis [`0.6.0`](docs/architecture/conformance-audit-0.6.0.md) — explizite Prüfungen jeder Iteration gegen die vereinbarte Architektur.
- [`docs/architecture/upstream-update-sources.md`](docs/architecture/upstream-update-sources.md) — revisionsgebundene Quellen für Updater, Mods, love.js und Scripting-APIs.
- [`docs/implementation/status.md`](docs/implementation/status.md) — aktueller App-Stand, Runtime-Gates und nächste implementierbare Stufe.
- [`AGENT.md`](AGENT.md) und [`SKILLS.md`](SKILLS.md) — verbindlicher Agent-Workflow und wiederverwendbare Prüfskills.
- [`scripting/Gen1Recomp`](scripting/Gen1Recomp) — importierbare Scripting-App-Shell ohne Pro-API.
- `src/` — hostunabhängige Domain-/Application-Basis.
- `tests/` — Pfad-, Compatibility-, Update- und Storage-Recovery-Tests.

## Einsatzbereite Testdatei

[`artifacts/Gen1Recomp.scripting`](artifacts/Gen1Recomp.scripting) ist das direkt importierbare, reproduzierbar erzeugte Scripting-Projekt. Die zugehörige SHA-256-Datei liegt daneben. `npm run check` schlägt fehl, sobald das Paket nicht mehr exakt den Projektquellen entspricht; `npm run package:scripting` validiert den Code und baut es neu.

## Scripting-App ausprobieren

1. `artifacts/Gen1Recomp.scripting` auf das iPhone übertragen und mit Scripting öffnen/importieren.
2. App starten; der Root `Documents/Gen1Recomp` wird angelegt und ist über die Dateien-App sichtbar.
3. Eine eigene kanonische Red-/Blue-/Yellow-ROM auswählen. Die Datei wird lokal SHA-1/SHA-256-geprüft und content-addressed gespeichert. Dieses Repository enthält keine ROM.
4. Im Tab „Diagnose“ zuerst die Geräteprüfung ausführen. Der Bericht landet unter `Diagnostics/capabilities.v3.json`.
5. Dort „Runtime installieren und Boot testen“ antippen. Der gepinnte Kandidat wird vollständig gehasht und startet ausschließlich `nogame.love`; das Ergebnis landet unter `Diagnostics/lovejs-boot.v1.json`.
6. Optional im Tab „Mods“ ein eigenes Gen1Recomp-Mod-ZIP prüfen und inaktiv speichern; Mod-Ausführung bleibt bis zum Runtime-Gate gesperrt.

Auch ein erfolgreicher `nogame`-Test ist keine vollständige Spieltauglichkeit und startet bewusst noch keinen Gen1Recomp-Payload.

## Entwicklung

```bash
npm install
npm run check
```

Aktuell: 32 Unit-Tests einschließlich adversarieller ZIP-Preflight-Fälle. `npm run check:scripting` typprüft die App gegen einen engen, aus der offiziellen Dokumentation abgeleiteten Hostvertrag und bündelt anschließend den vollständigen Importgraphen. Der Check unterscheidet ausdrücklich Modul-Exporte (UI/React) von injizierten Globals (`FileManager`, `DocumentPicker`, `Crypto`, `WebViewController`) und verhindert damit den auf einem echten Gerät gefundenen 0.2.1-Fehler. Ein echter Scripting-Gerätetest bleibt trotzdem Release-Gate.

## Free-Tier-Regel

Produktive Dateien referenzieren keine als Pro markierte API. Insbesondere wird `BackgroundKeeper` nicht verwendet. Alle Operationen sind unterbrechbar/recoverbar und setzen keinen unbegrenzten Hintergrundlauf voraus.

## Upstream und Lizenz

Aktueller Payload-Pin: Gen1Recomp `v0.3.20`, Commit `64dd9cb3a377b398b6132d223a121878f68b4b07`; frühere Auditstufen sind revisionsgebunden dokumentiert. Gen1Recomp ist GPLv3. Der eingebettete offizielle love.js-Bestand enthält seine upstream Lizenzdatei vollständig im Runtimeordner. ROMs und extrahierte Game Assets werden nicht verteilt. Siehe den Legal-Abschnitt der Architektur. Keine Rechtsberatung.
