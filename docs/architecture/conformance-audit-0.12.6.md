# Synchroner ChipAudio-Pfad 0.12.6

Stand: 2026-09-27

## Gerätebeweis

r23 meldet bei sämtlichen Songwechseln `worker=sync`. Die native QueueableSource-Erzeugung benötigt 0 ms, `ChipAudio.playMusic` dagegen 46–203 ms und beim untersuchten Trainerkampf 164 ms. Damit ist **VERIFIZIERT**, dass love.js den Gen1Recomp-Musikworker nicht bereitstellt und der synchrone PCM-Fallback den Hänger vor dem Übergang erzeugt.

Der Fallback erzeugt beim Start vier Puffer zu je 8192 Stereo-Samples. Aus dem 164-ms-Trainerwert folgen ungefähr 41 ms pro Puffer. Danach füllt `ChipAudio.update` die tiefe Queue weiter, wodurch dieselbe grobe Arbeitseinheit während des Übergangs erneut auf dem Renderthread anfällt. Der r23-Übergang führte zwar exakt alle 216 vorgesehenen Adapter-Schritte aus, benötigte bei nur 128 Aufrufen aber 5402 ms.

## Korrektur

Adapter r24 setzt vor dem Laden von `ChipAudio` ausschließlich `ChipSynth.MUSIC_BUFFER_SAMPLES` von 8192 auf 2048:

- Sample-Rate und dadurch Tonhöhe/Tempo bleiben unverändert.
- Der Synthesealgorithmus und die resultierende PCM-Sequenz bleiben unverändert; sie wird lediglich in kleineren Blöcken erzeugt.
- Vier Initialpuffer enthalten nun 8192 statt 32768 Samples und sollten ungefähr ein Viertel der gemessenen Blockzeit benötigen.
- Die Queue behält 32 Puffer. Ihre Zeitreserve sinkt bei 44,1 kHz von ungefähr 5,94 auf 1,49 Sekunden, bleibt aber deutlich größer als ein einzelner gemessener Renderstall.
- Laufende Renderthread-Arbeit wird von ungefähr 35–50-ms-Blöcken auf ungefähr 9–13-ms-Blöcke aufgeteilt.

Dies ist eine love.js-Adapterkonfiguration; Gen1Recomp-, love.js- und WASM-Dateien bleiben unverändert. Ein echter Worker wäre architektonisch vorzuziehen, ist auf dem verifizierten Hostpfad jedoch **NUR MIT HOST-UNTERSTÜTZUNG** verfügbar.

Status: **NICHT VERIFIZIERT (Gerät)**.
