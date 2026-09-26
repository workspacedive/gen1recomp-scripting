# Gen1Recomp for Scripting iOS

Architektur- und Implementierungsbasis für einen **Free-Tier-kompatiblen** Gen1Recomp-Host in der [Scripting iOS App](https://scripting.fun/).

> **Ehrlicher Status:** Library, sichtbares Ordnersystem, transaktionaler Kern, Content-Identifikation, Capability-Probe und Launcher-Shell sind implementiert. Die eigentliche LÖVE-Runtime ist noch nicht freigeschaltet. Scripting dokumentiert keine Lua-/LÖVE-Runtime und garantiert WASM/WebGL/Audio nicht; ein love.js-Build muss zuerst auf echten Geräten verifiziert werden.

## Warum kein schneller Rewrite?

Gen1Recomp v0.3.18 besteht aus einem großen Lua/LÖVE-Core mit Fixed-Step-Timing, SpriteBatch-Renderer, ChipAudio, Imports, Saves, Mods, Hooks und Updater. Ein Nachbau in TypeScript/SwiftUI Canvas wäre eine zweite Engine und würde Kompatibilität verlieren. Die Zielarchitektur hält den Originalcore in einem versionierten love.js/WASM-Paket und setzt davor einen sauberen Scripting Host Adapter.

## Enthalten

- [`docs/audit/evidence.md`](docs/audit/evidence.md) — revisionsgebundener Gen1Recomp-/APK-/Scripting-Audit mit Verifikationsstatus.
- [`docs/audit/apk-static-analysis.md`](docs/audit/apk-static-analysis.md) — reproduzierbare Multipart-Rekonstruktion, APK-Identität, Manifest, Signatur, DEX, native Libraries und vollständiger `game.love`-Source-Abgleich.
- [`docs/audit/capability-matrix.md`](docs/audit/capability-matrix.md) — WASM, Grafik, Audio, Storage, Worker, Input und Free/Pro.
- [`docs/audit/ui-ux.md`](docs/audit/ui-ux.md) — APK-/Launcher-UI-Audit und begründete Scripting-Abbildung.
- [`docs/architecture/target-architecture.md`](docs/architecture/target-architecture.md) — Zielarchitektur, Datenmodell, Mermaid-Diagramme, Updates, Recovery, Saves, Mods, Sicherheit, Performance, Risiken, Roadmap und Abnahme.
- [`AGENT.md`](AGENT.md) und [`SKILLS.md`](SKILLS.md) — verbindlicher Agent-Workflow und wiederverwendbare Prüfskills.
- [`scripting/Gen1Recomp`](scripting/Gen1Recomp) — importierbare Scripting-App-Shell ohne Pro-API.
- `src/` — hostunabhängige Domain-/Application-Basis.
- `tests/` — Pfad-, Compatibility-, Update- und Storage-Recovery-Tests.

## Scripting-App ausprobieren

1. Den Ordner `scripting/Gen1Recomp` in Scripting importieren.
2. App starten; der Root `Documents/Gen1Recomp` wird angelegt und ist über die Dateien-App sichtbar.
3. Eine eigene kanonische Red-/Blue-/Yellow-ROM auswählen. Die Datei wird lokal SHA-1/SHA-256-geprüft und content-addressed gespeichert. Dieses Repository enthält keine ROM.
4. „Runtime prüfen“ ausführen. Der Bericht landet unter `Diagnostics/capabilities.v1.json`.

Die Probe prüft API-Präsenz, nicht vollständige Spieltauglichkeit. Sie startet bewusst noch kein Spiel.

## Entwicklung

```bash
npm install
npm run check
```

Aktuell: 9 Unit-Tests. Die Scripting-TSX-Dateien werden wegen der nur in der App verfügbaren `scripting`-Typen nicht vom Node-Typecheck erfasst; ihre APIs wurden gegen die offizielle App-Store-Dokumentations-ZIP geprüft. Ein echter Scripting-Gerätetest bleibt ein Release-Gate.

## Free-Tier-Regel

Produktive Dateien referenzieren keine als Pro markierte API. Insbesondere wird `BackgroundKeeper` nicht verwendet. Alle Operationen sind unterbrechbar/recoverbar und setzen keinen unbegrenzten Hintergrundlauf voraus.

## Upstream und Lizenz

Audit-Basis: Gen1Recomp `v0.3.18`, Commit `b83f805a7c7b6043370b783ea7a4b65fd8c93ef4`. Gen1Recomp ist GPLv3; ein später verteiltes abgeleitetes Runtime-Paket muss die GPL- und Drittanbieterpflichten erfüllen. ROMs und extrahierte Game Assets werden nicht verteilt. Siehe den Legal-Abschnitt der Architektur. Keine Rechtsberatung.
