# Architektur-Konformitätsprüfung 0.10.4

Stand: 2026-09-26

## Warum nicht weiter Fehler für Fehler

Die bisherigen Gerätefehler gehören zu einer gemeinsamen Ursache: Der Payload ist für LÖVE/LuaJIT-Verhalten geschrieben, love.js 11.5 stellt jedoch eine PUC-Lua-5.1-/Web-Runtime mit abweichenden Bibliotheks- und Zahlenrandfällen bereit. Diese Iteration ergänzt deshalb neben dem konkreten Rail-Fix einen vollständigen statischen Kompatibilitätsdurchlauf über den gepinnten Payload.

## Ergebnis des Kompatibilitätsdurchlaufs

- globale Bit-API: durch r5 abgedeckt und auf dem Gerät bestätigt;
- Lua-5.2-`load(string, name, mode, env)`: durch r7 abgedeckt und bis zum nächsten Gerätepfad bestätigt;
- `table.unpack`: alle Payload-Stellen besitzen bereits `unpack`-Fallbacks;
- `package.searchers`: relevante Worker benutzen bereits `package.loaders`-Fallbacks;
- `rawlen`: wird nur als optionaler Sandboxwert exponiert, im Gen-1-Basispfad nicht aufgerufen;
- `goto`: kommt in Gen-3-Extraktormodulen vor, die für die derzeit zugelassenen Red/Blue/Yellow-ROMs nicht geladen werden; Gen 3 bleibt außerhalb dieses Gates;
- weitere post-Lua-5.1-APIs wie `table.pack`, `table.move`, `math.tointeger`, `math.type` und `string.pack/unpack`: keine Verwendung im geprüften Gen-1-Pfad;
- alle direkten `bit`-Operationen des Payloads sind im Adapterinventar enthalten;
- der verbleibende Launcherfehler ist ein numerischer Randfall der Rail-Berechnung, nicht eine weitere fehlende Bibliotheks-API.

## Rail-Korrektur

Lua-5.1-Gleitkomma-Modulo kann an der Wrap-Grenze auf exakt `1.0` runden. Upstream multipliziert diesen Wert mit acht und greift dann auf Element neun seiner acht Farben zu. Der r9-Adapter stellt für genau `src.ui.kit.Theme.versionRail` dieselbe Farbreihenfolge und Interpolation bereit, führt aber nach `floor` ein explizites `% count` aus und prüft den Zeitwert zusätzlich auf Endlichkeit. Andere Theme-Funktionen bleiben unangetastet.

## Späte Runtimefehler

`Module.postrun` ist nur der Runtime-Meilenstein und tritt vor späteren Lua-/Fensterfehlern ein. Der bisherige Harness markierte die Bridge danach als terminal, weshalb der allgemeine Alert keine Konsole mehr speichern konnte. r9 sendet Alerts auch nach postrun und schreibt jeden `runtime.error` unmittelbar nach:

`Diagnostics/gen1recomp-gameplay-runtime-error.v1.json`

Die Datei wird vor jedem neuen Gameplay-Versuch entfernt, damit kein alter Fehler mit einem aktuellen Lauf verwechselt wird.

## Verifikation und Grenzen

- Rail-Wrap, nicht-endlicher Timer, rückwärts laufender Timer, Bit-API, MD5, Lua-5.2-Load und Root-Cause-Erhaltung: **VERIFIZIERT (automatisiert)**
- vollständiger gepinnter Quellscan auf bekannte post-Lua-5.1-Konstrukte: **VERIFIZIERT (statisch)**
- r9 auf Scripting/iOS: **NICHT VERIFIZIERT**
- Ursache des allgemeinen Fensteralarms: **TECHNISCH UNBEKANNT**, aber nun auch nach postrun persistent instrumentiert
- Gameplay, Eingabe, Audio, Saves und Lifecycle: **NICHT VERIFIZIERT**

Upstream Gen1Recomp, Player, love.js, WASM und Normalisierung bleiben byteidentisch.
