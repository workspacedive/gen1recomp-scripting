# Architektur-Konformitätsprüfung 0.5.1

Stand: 2026-09-26

## Anlass und Gerätebefund

Der reale Capability-Bericht wurde vollständig geschrieben. Belegt sind lokales HTML/JavaScript, WebAssembly mit SIMD, WebGL 1/2 samt Readback, WebAudio-Kontextkonstruktion, IndexedDB-API und Eingabe-APIs. Nicht verfügbar sind `crossOriginIsolated` und `SharedArrayBuffer`.

Der getrennte love.js-Boot-Test kehrte hingegen nicht zurück und schrieb keinen Endbericht. Die alte Implementierung verließ sich für den Abbruch ausschließlich auf einen Timer innerhalb derselben WebView, deren Runtime möglicherweise blockierte. Die konkrete Wartephase ist deshalb **TECHNISCH UNBEKANNT**.

## Korrektur

0.5.1 behält den unveränderten gepinnten Runtimebestand und die bestehende Bridge bei, ergänzt aber zwei Hostmaßnahmen:

1. Die gesamte Kette aus `loadFile`, `waitForLoad` und Bridge-Ereignis läuft gegen einen unabhängigen Scripting-Host-Timer von 40 Sekunden.
2. Vor jeder blockierbaren Phase wird `Diagnostics/lovejs-boot-progress.v1.json` mit Startzeit und Phase persistiert.

Bei Erfolg, Fehler oder Timeout schreibt der Host `Diagnostics/lovejs-boot.v1.json`. Der Endbericht enthält `stage`, Status und Detail. Der Fortschrittsbericht wird nach einem regulären Endbericht entfernt; nach einem Prozessabbruch bleibt er als Diagnose zurück.

## Schichtengrenzen

- Gen1Recomp-Payload: unverändert, ungemountet und inaktiv.
- love.js: sämtliche upstream Bytes und Pins unverändert.
- Runtime-Harness: unverändert.
- Hostadapter: ausschließlich Timeout-, Phasenjournal- und Berichtskorrektur.
- Mods, Saves, Library und Nutzerdaten: unberührt.

Damit bleibt die Forderung erfüllt, Hostfunktion nur über den Adapter zu nutzen und Gen1Recomp nicht invasiv zu ändern.

## Aussagegrenze

Der Host-Watchdog beweist keine Runtime-Kompatibilität. Er garantiert nur einen begrenzten Diagnosevorgang, sofern die Scripting-Host-Ereignisschleife weiterläuft. Das nächste Geräteergebnis muss anhand von `lovejs-boot.v1.json` beziehungsweise bei Prozessabbruch `lovejs-boot-progress.v1.json` ausgewertet werden.

`APP.runtimeEnabled` bleibt `false`; es existiert weiterhin kein Spielstart oder aktiver Payload-/Runtime-Pointer.
