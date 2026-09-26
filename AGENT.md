# AGENT.md — Arbeitsvertrag für autonome Agents

## Mission

Dieses Repository baut eine **Free-Tier-kompatible Scripting-iOS-Hostschicht** für Gen1Recomp. Die Prioritäten sind, in dieser Reihenfolge: Korrektheit, Datenintegrität, Stabilität, Sicherheit, Performance, Komfort.

## Verbindlicher Ablauf

1. **Verifizieren:** Primärquellen, exakte Revision und Host-Version notieren.
2. **Capability Gate:** Keine Runtime-Fähigkeit annehmen. Unbekannte Fähigkeiten durch einen reproduzierbaren Device-Probe prüfen.
3. **Architektur:** Originalsystem wiederverwenden; nur Host-Adapter und Transaktionsgrenzen ergänzen.
4. **Implementieren:** Kleine, typisierte, testbare Änderungen; kein God Object.
5. **Messen:** Baseline vor Optimierung; Ergebnis und Regressionen dokumentieren.
6. **Absichern:** Hash, Pfadvalidierung, Größenlimits, Staging, Backup und Recovery vor Aktivierung.
7. **Gegenprüfen:** Tests, Typecheck, Diff, Quellenstatus und Free-Tier-Audit.

## Statusvokabular

Jede Aussage über Host oder Runtime verwendet einen Status:

- `VERIFIZIERT`
- `TEILWEISE VERIFIZIERT`
- `NICHT VERIFIZIERT`
- `TECHNISCH UNBEKANNT`
- `VORAUSSETZUNG`
- `NUR MIT HOST-UNTERSTÜTZUNG`
- `EXPERIMENTELL`
- `BENCHMARK ERFORDERLICH`

## Harte Regeln

- Keine erfundenen Scripting-, iOS-, LÖVE-, Lua- oder WASM-APIs.
- Keine Scripting-Pro-API in P0/P1. `BackgroundKeeper` ist beispielsweise Pro und darf nicht benötigt werden.
- Keine ROMs, extrahierten urheberrechtlich geschützten Assets, Saves oder Schlüssel committen.
- Kritische Daten liegen nie ausschließlich in `Cache/`.
- Kein Update überschreibt `LastKnownGood` in-place.
- Jede Save-Migration erstellt zuerst ein verifiziertes Backup und Journal.
- Archive werden vor Extraktion gegen absolute Pfade, `..`, Symlinks, Dateianzahl und Größenlimits geprüft.
- Keine Performance-Änderung ohne Profil, Baseline und Abnahmekriterium.
- Änderungen am Gen1Recomp-Core sind letzter Ausweg; Adapter oder upstreamfähiger kleiner Patch bevorzugt.
- Die Scripting-Dokumente im App-Store-Zweig sind die Host-Primärquelle. Drittquellen dürfen fehlende Aussagen nicht in Fakten verwandeln.

## Repository-Konventionen

- `src/domain`: reine, hostunabhängige Typen und Regeln.
- `src/application`: Use Cases und Zustandsautomaten.
- `src/ports`: Host-Verträge.
- `src/adapters`: Scripting-/Test-Adapter.
- `scripting/Gen1Recomp`: importierbare Scripting-App.
- `docs/audit`: Belege und Capability-Matrix.
- `docs/architecture`: Zielarchitektur und ADRs.
- `tests`: Unit- und Contract-Tests.

## Definition of Done

- Typecheck und Tests grün.
- Keine Pro-Abhängigkeit im produktiven Importgraphen.
- Neue persistente Schreibpfade nutzen Staging/Backup oder begründen explizit, warum nicht.
- Neue Capability ist in der Matrix mit Quelle/Test und Datum eingetragen.
- Architektur- oder Datenformatänderungen besitzen eine ADR bzw. Schema-Version.
- Keine ROM-/Save-Inhalte in Logs oder Fixtures.
