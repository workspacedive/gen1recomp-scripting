# Architektur-Konformitätsprüfung 0.11.1

Stand: 2026-09-26

## Gerätebefund

r14 verändert den Fehler erwartungsgemäß: Der Funktionswert erreicht `Music.applyVolume` nicht mehr. Stattdessen scheitert `Music.lua:308` in `pcall(src.setLooping, ...)` mit „attempt to call a nil value“. **VERIFIZIERT (Gerät)**.

Dies belegt zwei Dinge:

1. Die r13/r14-Kette liefert nun einen tabellenförmigen QueueableSource-Proxy, der die für Synthese und Lautstärke geprüften Kernmethoden besitzt.
2. Der love.js-Proxy stellt `Source:setLooping` nicht bereit. Lua wertet `src.setLooping` vor dem Aufruf von `pcall` aus; deshalb kann upstreams beabsichtigte geschützte Degradation eine fehlende Methode nicht abfangen.

## Korrektur r15

Der ChipAudio-Rückgabeadapter ergänzt ausschließlich bei einem mutierbaren Tabellenproxy drei fehlende optionale Source-Modifikatoren als No-op:

- `setLooping`: ChipAudio/ChipSynth verarbeitet die angeforderte Schleife bereits über `allowLoops`; QueueableSource selbst muss nicht loopen.
- `setFilter`: Upstream dokumentiert Filter ausdrücklich als optional und will bei fehlendem EFX degradieren.
- `setPitch`: verhindert denselben Vor-Auswertungsfehler bei späteren Tempo-/Pitch-Pfaden; fehlende Runtime-Unterstützung degradiert ohne erfundene Audiotransformation.

Die für Betrieb und Zustandsverwaltung notwendigen Methoden `setVolume`, `queue`, `getFreeBufferCount`, `play`, `stop`, `pause` und `isPlaying` bleiben zwingend. Fehlt eine davon, wird der Proxy weiterhin verworfen. Ein ausführbarer Test prüft sowohl die Ablehnung eines Funktionswerts als auch die gezielte Ergänzung der drei optionalen Methoden.

## Status

- Ursache des neuen nil-Aufrufs: **VERIFIZIERT**.
- Adaptersemantik und Regressionstest: **VERIFIZIERT**.
- Kartenstart und Musik auf dem Gerät: **NICHT VERIFIZIERT**.
- Allgemeine Audioausgabe: **VERIFIZIERT**.
