# Architektur-Konformitätsprüfung 0.10.3

Stand: 2026-09-26

## Gerätebefund aus 0.10.2

Der bisherige `Data.lua:271`-Fehler wurde nicht erneut beobachtet. Ein Lauf erreichte stattdessen den allgemeinen love.js-Alarm vor der Fensterinitialisierung. Nach einem Neustart zeichnete Gen1Recomp den Launcher bis `Theme.versionRail`, wo `a` aufgrund eines ungültigen dynamischen Indexes `nil` war.

Die Rail-Farbliste ist im gepinnten Payload statisch, lückenlos und acht Elemente lang. Breite und Höhe werden vor der Schleife geprüft. Der Index wird ausschließlich aus der animierten Phase von `love.timer.getTime()` berechnet. Ein nicht-endlicher Zeitwert ist damit die verbleibende reproduzierbare Erklärung innerhalb dieser Funktion; seine hostseitige Ursache ist noch **TECHNISCH UNBEKANNT**.

## Runtime r8

Der Host-Adapter erzwingt den von LÖVE dokumentierten Vertrag eines numerischen, monotonen Timers:

- endliche native Werte werden übernommen;
- NaN und positive/negative Unendlichkeit fallen auf den endlichen `os.clock()`-Wert beziehungsweise den letzten gültigen Wert zurück;
- rückwärts laufende Werte werden auf den letzten Wert begrenzt.

Damit wird nicht nur die Launcher-Rail geschützt, sondern auch die zahlreichen payload-eigenen Frame-, Timeout- und Animationsberechnungen, die denselben LÖVE-Timer verwenden.

**VERIFIZIERT (automatisiert):** Der Lua-Test speist NaN sowie einen rückwärts laufenden Wert ein und bestätigt endliche, monotone Ausgaben. Bit-, MD5-, Lua-5.2-`load`- und Root-Cause-Tests bleiben aktiv.

## Frühfehlerdiagnose

Der r8-Harness sammelt höchstens acht begrenzte `console.error`-Zeilen. Ruft love.js vor `Module.postrun` den allgemeinen Fensterinitialisierungs-Alarm auf, meldet der bestehende Host-Bridge-Kanal den Alarm zusammen mit diesen Zeilen als `runtime.error`. Es wird weder WASM-Speicher gelesen noch ein Export aufgerufen; die Diagnose bleibt auf der JavaScript-/Bridge-Grenze.

## Grenzen

- Ursache des ersten allgemeinen Fensteralarms: **TECHNISCH UNBEKANNT**; r8 macht die zugehörige Konsole sichtbar.
- Timer-Normalisierung auf love.js/iOS: **NICHT VERIFIZIERT**
- Gameplay, Eingabe, Audio, Saves und Lifecycle: **NICHT VERIFIZIERT**

Alle upstream Dateien bleiben byteidentisch. Runtime r8 wird side-by-side neben r1–r7 installiert.
