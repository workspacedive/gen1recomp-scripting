# Architektur-Konformitätsprüfung 0.11.3

Stand: 2026-09-26

## Vollständige erneute Pfadanalyse

Der unveränderte Fehler in 0.11.2 widerlegt die Annahme, dass der Require-basierte `ChipAudio.playMusic`-Wrapper den von Music verwendeten Wert zuverlässig kontrolliert. Die erneute Prüfung der gesamten Kette ergibt:

1. `RomExtractor` erzeugt für Gen 1 Adress-/Bank-Definitionen; `Music.startSong` wählt daher zwingend den ChipAudio-Pfad.
2. `ChipAudio.playMusic` übernimmt den ersten Wert von `pcall(love.audio.newQueueableSource, ...)` und hält diesen intern als Queue-Source.
3. `Music.play` ruft bei Zeile 308 `src.setLooping` auf.
4. Gen1Recomps Mod-Loader ersetzt `_G.require` während der Sitzung durch einen eigenen delegierenden Shim. Obwohl er den vorherigen Require-Wert delegiert, ist ein nachgelagerter Modulwrapper nicht der verlässlichste Ort für ein Objekt, das bereits an mehreren Stellen gehalten wird.
5. Der normalize2-Konstruktoradapter ist dagegen die früheste bestätigte Grenze, an der r13 den ursprünglich ersten Funktionswert erfolgreich durch den späteren Source-Kandidaten ersetzte. Er gab diesen Kandidaten bisher jedoch roh zurück. Deshalb blieben dessen unvollständige/defekte Source-Modifikatoren sichtbar.

## Korrektur r17

Die vollständige Fassade wird nun direkt von `love.audio.newQueueableSource` im normalize2-Adapter zurückgegeben – nicht mehr nachträglich von einem Modulwrapper.

- Alle sieben erforderlichen nativen Operationen werden vor Rückgabe geprüft.
- ChipAudio und Music erhalten dasselbe vollständige Lua-Objekt.
- Kernaufrufe werden mit dem originalen Runtimeobjekt als `self` weitergeleitet.
- `setLooping`, `setFilter` und `setPitch` werden für QueueableSource bewusst nicht in das fehlerhafte/fehlende Runtime-API weitergeleitet: ChipSynth realisiert Schleifen selbst; Filter/Pitch degradieren als optionale Modifier.
- Der bisherige ChipAudio-Require-Wrapper wurde vollständig entfernt, damit keine zweite Identität oder zeitabhängige Nachbearbeitung verbleibt.

Der eigenständige normalize2-Test simuliert exakt die beobachtete Mehrfachrückgabe `function, Source`, verlangt eine neue Fassade, prüft alle nativen Self-Bindungen und prüft die Modifier-Fallbacks.

## Status

- Gesamter statischer Gen-1-Musikpfad: **VERIFIZIERT**.
- Konstruktor-Fassade und Tests: **VERIFIZIERT**.
- Geräteverhalten: **NICHT VERIFIZIERT**, neuer Test erforderlich.
