# Architektur-Konformitätsprüfung 0.10.1

Stand: 2026-09-26

## Gerätebefund aus 0.10.0

- **VERIFIZIERT:** Der vorherige `StreamMD5 requires bit or bit32`-Abbruch tritt beim experimentellen Start nicht mehr auf.
- **TEILWEISE VERIFIZIERT:** Die ROM durchläuft den offiziellen Importpfad bis zur Übergabe an `bootGame`; anschließend existiert das Gen-1-Game-Objekt.
- **NICHT VERIFIZIERT:** Gameplay beginnt nicht. Der sichtbare Fehler `src/core/Game.lua:656: attempt to index field 'stack'` ist ein Sekundärfehler beim ersten Zeichnen.

Quellcodeanalyse zeigt die Ursache der Maskierung: Der asynchrone Importabschluss ruft `_completeImport` innerhalb eines `pcall` auf. Dessen Callback setzt den globalen Importer vor `bootGame` auf `nil`. Scheitert `Game:load` vor der Initialisierung von `self.stack`, fängt der Importer den ursprünglichen Fehler ab; der folgende Draw-Frame sieht weder Importer noch vollständigen Game-Zustand und meldet nur das fehlende `stack`.

## Änderung

Runtime `lovejs-11.5-r6` ergänzt ausschließlich im Host-Adapter eine Diagnosehülle um `src.core.Game.load` und `draw`:

1. `Game.load` läuft weiterhin unverändert und mit denselben Argumenten.
2. Nur wenn es bereits scheitert, wird der vollständige ursprüngliche Traceback am Game-Objekt erhalten und derselbe Fehler weitergeworfen.
3. Falls der Importer diesen Fehler wie upstream vorgesehen abfängt und der Draw-Frame folgt, meldet die Hülle den erhaltenen Root Cause statt des irreführenden `stack`-Folgefehlers.
4. Bei erfolgreichem `Game.load` verändert die Hülle weder Zustand noch Rückgabewerte oder Zeichnung.

**VERIFIZIERT (automatisiert):** Ein Lua-Regressionstest simuliert genau die upstream Fehlerkette und bestätigt, dass der Root Cause im nachfolgenden Draw erhalten bleibt.

## Grenzen

Diese Version behauptet noch keine Behebung des unbekannten ursprünglichen `Game.load`-Fehlers. Sie dient dem nächsten notwendigen Gerätegate. Gen1Recomp-, love.js-, Player-, WASM- und upstream Normalisierungsbytes bleiben unverändert; Runtime r6 wird side-by-side installiert.
