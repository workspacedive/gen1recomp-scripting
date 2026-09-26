# Architektur-Konformitätsprüfung 0.10.8

Stand: 2026-09-26

## Ergebnis des r12-Gerätetests

- Audioausgabe ist grundsätzlich vorhanden: **VERIFIZIERT (Gerät)**.
- Der identische Fehler `Music.lua:39`, `src` vom Typ `function`, tritt weiterhin auf: **VERIFIZIERT (Gerät)**.
- Damit wurde auch der über den normalen Lua-`require`-Pfad verzögerte r12-Guard nicht vor `ChipAudio.playMusic` installiert.

Die offizielle love.js-Ladekette besitzt für genau diese Lebenszyklusgrenze zwei Normalizer: `normalize1` läuft vor den optionalen LÖVE-Modulen, `normalize2` danach und enthält bereits die upstream Audio-Anpassungen. Der r12-Ansatz blieb in `normalize1` und konnte trotz Require-Verzögerung die spätere Engine-Modulinitialisierung nicht zuverlässig überholen.

## Korrektur r13

Der QueueableSource-Vertragsguard wurde vollständig aus dem normalize1-Adapter entfernt. Ein neuer, separat gehashter `adapter/normalize2.lua` besteht bytegenau aus dem gepinnten upstream `normalize2.lua` plus dem begrenzten Guard. Der Resource-Resolver ersetzt beim Transport nun sowohl normalize1 als auch normalize2 durch ihre jeweiligen Adapter, während beide upstream Dateien unverändert im Runtime-Inventar bleiben.

Damit wird der Guard an der von love.js selbst vorgesehenen Stelle ausgeführt: nach Initialisierung von `love.audio`, aber vor dem Spiel. Ein eigener ausführbarer Fengari-Test prüft den normalize2-Guard unabhängig: gültiger Primärwert, Source in späterer Rückgabeposition und Zurückweisung eines alleinigen Funktionswerts.

## Architekturstatus

- Gen1Recomp-Payload, love.js, WASM, Player und beide upstream Normalizer unverändert: **VERIFIZIERT** durch Präfix- und Hashprüfungen.
- Adapter getrennt versioniert und gehasht: **VERIFIZIERT**.
- Keine direkte WASM-Interpretation/Instanziierung: **VERIFIZIERT**.
- Allgemeine Audiofähigkeit: **VERIFIZIERT (Gerät)**.
- QueueableSource-Musik und r13-Aktivierung: **NICHT VERIFIZIERT**, Gerätetest erforderlich.
- Saves, Lifecycle und längeres Gameplay: **NICHT VERIFIZIERT**.
