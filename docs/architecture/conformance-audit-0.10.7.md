# Architektur-Konformitätsprüfung 0.10.7

Stand: 2026-09-26

## Ergebnis des r11-Gerätetests

0.10.6/r11 zeigt unverändert `Music.lua:39` mit `src` vom Typ `function`. **VERIFIZIERT**. Damit wurde der r11-Guard nicht ausgeführt; ein ausgeführter Guard kann diesen Wert konstruktiv nicht passieren lassen.

Die erneute Prüfung der Startreihenfolge identifiziert die Ursache: `normalize1.lua` läuft, bevor optionale LÖVE-Module garantiert initialisiert sind. r11 installierte den Guard nur, wenn `love.audio.newQueueableSource` bereits während der Normalisierung existierte. Auf dem beobachteten Pfad war diese Voraussetzung falsch, sodass r11 wirkungslos blieb. Dies ist ein Adapter-Aktivierungsfehler, kein Gegenbeweis zur festgestellten QueueableSource-Vertragsverletzung.

## Korrektur r12

r12 installiert denselben begrenzten QueueableSource-Guard verzögert über den bereits vorhandenen `require`-Adapter. Jeder Require-Aufruf versucht die Installation, bis `love.audio.newQueueableSource` verfügbar ist; danach bleibt der native Konstruktor genau einmal umschlossen. Gen1Recomps Modul-Ladevorgang läuft erst nach Initialisierung der LÖVE-Module und passiert diesen Pfad vor `ChipAudio.playMusic`.

Der ausführbare Lua-Test bildet die Reihenfolge jetzt ausdrücklich nach:

1. Adapterausführung ohne `love.audio`;
2. mehrere frühe Require-Aufrufe ohne Audio;
3. spätere Bereitstellung des Audio-Moduls;
4. Game-Require installiert den Guard;
5. ein Source-Wert in einer späteren Rückgabeposition wird übernommen;
6. ein ausschließlich ungültiger Funktionswert wird zurückgewiesen.

## Grenzen

- Payload, offizieller Player, upstream Normalizer, love.js und WASM bleiben unverändert: **VERIFIZIERT**.
- Keine direkte WASM-Interpretation oder -Instanziierung durch den Host: **VERIFIZIERT**.
- Guard-Aktivierung auf dem echten Gerät und Audioausgabe: **NICHT VERIFIZIERT**, r12-Gerätetest erforderlich.
- Falls der Guard nur den kontrollierten Fallback erreicht, kann Gameplay stumm fortfahren; funktionierende Musik ist dann weiterhin **NUR MIT HOST-UNTERSTÜTZUNG** oder einem Runtime-Fix erreichbar.
