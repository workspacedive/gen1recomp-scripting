# Gen1Recomp for Scripting iOS

Architektur- und Implementierungsbasis für einen **Free-Tier-kompatiblen** Gen1Recomp-Host in der [Scripting iOS App](https://scripting.fun/).

> **Ehrlicher Status:** Die Scripting-App 0.3.1 besitzt jetzt vier native Tabs, eine persistente Library, einen vorgeprüften content-adressierten Mod-Speicher, bekannte Red-/Blue-/Yellow-Erkennung, verifiziertes Import-Staging mit Recovery-Journal, sichtbares Ordnersystem, Backup-fähigen Index, erweiterten Capability-Report und ein explizites Runtime-Gate. Die eigentliche LÖVE-Runtime ist noch nicht freigeschaltet. Scripting dokumentiert keine Lua-/LÖVE-Runtime und garantiert den konkreten love.js-Boot, lokale Subresources, Audio oder Save-Persistenz nicht; diese Gates müssen zuerst auf echten Geräten bestehen.

## Warum kein schneller Rewrite?

Gen1Recomp v0.3.18 besteht aus einem großen Lua/LÖVE-Core mit Fixed-Step-Timing, SpriteBatch-Renderer, ChipAudio, Imports, Saves, Mods, Hooks und Updater. Ein Nachbau in TypeScript/SwiftUI Canvas wäre eine zweite Engine und würde Kompatibilität verlieren. Die Zielarchitektur hält den Originalcore in einem versionierten love.js/WASM-Paket und setzt davor einen sauberen Scripting Host Adapter.

## Enthalten

- [`docs/audit/evidence.md`](docs/audit/evidence.md) — revisionsgebundener Gen1Recomp-/APK-/Scripting-Audit mit Verifikationsstatus.
- [`docs/audit/apk-static-analysis.md`](docs/audit/apk-static-analysis.md) — reproduzierbare Multipart-Rekonstruktion, APK-Identität, Manifest, Signatur, DEX, native Libraries und vollständiger `game.love`-Source-Abgleich.
- [`docs/audit/capability-matrix.md`](docs/audit/capability-matrix.md) — WASM, Grafik, Audio, Storage, Worker, Input und Free/Pro.
- [`docs/audit/ui-ux.md`](docs/audit/ui-ux.md) — APK-/Launcher-UI-Audit und begründete Scripting-Abbildung.
- [`docs/architecture/target-architecture.md`](docs/architecture/target-architecture.md) — Zielarchitektur, Datenmodell, Mermaid-Diagramme, Updates, Recovery, Saves, Mods, Sicherheit, Performance, Risiken, Roadmap und Abnahme.
- [`docs/architecture/component-updates.md`](docs/architecture/component-updates.md) — revisionsgebundene love.js-/Payload-/Mod-Analyse, Trust-Modell, Staging, Health-Checks und Rollback.
- [`docs/architecture/conformance-audit-0.3.0.md`](docs/architecture/conformance-audit-0.3.0.md) und [`0.3.1`](docs/architecture/conformance-audit-0.3.1.md) — explizite Prüfungen des aktuellen Codes gegen die vereinbarte Architektur.
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
4. Im Tab „Diagnose“ die Geräteprüfung ausführen. Der Bericht landet unter `Diagnostics/capabilities.v2.json`.
5. Optional im Tab „Mods“ ein eigenes Gen1Recomp-Mod-ZIP prüfen und inaktiv speichern; Mod-Ausführung bleibt bis zum Runtime-Gate gesperrt.

Die Probe prüft API-Präsenz, nicht vollständige Spieltauglichkeit. Sie startet bewusst noch kein Spiel.

## Entwicklung

```bash
npm install
npm run check
```

Aktuell: 19 Unit-Tests einschließlich adversarieller ZIP-Preflight-Fälle. `npm run check:scripting` typprüft die App gegen einen engen, aus der offiziellen Dokumentation abgeleiteten Hostvertrag und bündelt anschließend den vollständigen Importgraphen. Der Check unterscheidet ausdrücklich Modul-Exporte (UI/React) von injizierten Globals (`FileManager`, `DocumentPicker`, `Crypto`, `WebViewController`) und verhindert damit den auf einem echten Gerät gefundenen 0.2.1-Fehler. Ein echter Scripting-Gerätetest bleibt trotzdem Release-Gate.

## Free-Tier-Regel

Produktive Dateien referenzieren keine als Pro markierte API. Insbesondere wird `BackgroundKeeper` nicht verwendet. Alle Operationen sind unterbrechbar/recoverbar und setzen keinen unbegrenzten Hintergrundlauf voraus.

## Upstream und Lizenz

Audit-Basis: Gen1Recomp `v0.3.18`, Commit `b83f805a7c7b6043370b783ea7a4b65fd8c93ef4`. Gen1Recomp ist GPLv3; ein später verteiltes abgeleitetes Runtime-Paket muss die GPL- und Drittanbieterpflichten erfüllen. ROMs und extrahierte Game Assets werden nicht verteilt. Siehe den Legal-Abschnitt der Architektur. Keine Rechtsberatung.
