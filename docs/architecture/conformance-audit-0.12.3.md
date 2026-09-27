# Battle-Übergang Korrektur 0.12.3

Stand: 2026-09-27

## Gerätebenchmark r20

| Phase | Trainer | Wild 1 | Wild 2 |
|---|---:|---:|---:|
| Konstruktion | 3 ms | 0 ms | 0 ms |
| Musikstart | 150 ms | 140 ms | 143 ms |
| Übergang | 6829 ms | 6695 ms | 6801 ms |
| `BattleState:enter` | 0 ms | 0 ms | 0 ms |
| erster Draw | 6 ms | 4 ms | 1 ms |

Der Trainerübergang `spiralin` benötigte für 216 Soll-Frames 6829 ms (31,6 Frames/s). `doublecircle` benötigte für 162 Soll-Frames 6695 beziehungsweise 6801 ms (24,2/23,8 Frames/s). Damit ist der Übergang **VERIFIZIERT** der Engpass; Konstruktor, Bildersterstellung/Enter, erster Draw und der 140–150-ms-Musikstart erklären die Verzögerung nicht.

## Korrektur

Die Übergänge zählen intern Updates statt Zeit. Auf dem gemessenen love.js-Gerätepfad kamen diese Updates während der Übergangsdarstellung nur mit ungefähr 24–32 Hz an, sodass das vorgesehene Framebudget in Zeitlupe ablief.

Adapter r21 normalisiert ausschließlich `src.render.BattleTransition:update` auf eine monotone 60-Hz-Wanduhr:

- Wandzeit wird in 60-Hz-Schritte akkumuliert.
- Bereits vorhandenes `BATTLE SPEED` wird als Multiplikator berücksichtigt.
- Wanduhrsprünge werden pro Aufruf auf 250 ms begrenzt.
- Nach Abschluss des Übergangs werden keine weiteren Schritte ausgeführt.
- Kampfmechanik, allgemeiner FixedStep, Audio und Payloaddateien bleiben unverändert.

Bei 1X sollte `doublecircle` nun ungefähr 162/60 = 2,7 Sekunden und `spiralin` ungefähr 216/60 = 3,6 Sekunden dauern. Diese Dauern enthalten weiterhin Gen1Recomps absichtliche 60 schwarzen Halteframes und gegebenenfalls 72 Flash-Frames; sie werden nicht spekulativ entfernt.

Status der Korrektur: **NICHT VERIFIZIERT (Gerät)**.
