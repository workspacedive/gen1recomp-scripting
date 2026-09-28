# Architektur-Konformitätsprüfung 0.11.0

Stand: 2026-09-26

## Verifizierte Ergebnisse

- Das unkomprimierte 0.10.9-Paket lässt sich in Scripting importieren: **VERIFIZIERT (Gerät)**.
- Allgemeine Audioausgabe funktioniert: **VERIFIZIERT (Gerät)**.
- Auch mit dem normalize2-Guard erreicht ein Funktionswert `Music.applyVolume`: **VERIFIZIERT (Gerät)**.

Die wiederholte unveränderte Signatur beweist, dass die Konstruktor-Wrapper auf diesem love.js-Ladepfad nicht die tatsächlich von `ChipAudio` beobachtete Rückgabe kontrollieren. Weitere zeitlich verschobene Konstruktor-Wrappers wären deshalb nicht evidenzbasiert.

## Korrektur r14

r14 validiert nun am letzten stabilen Adapterpunkt vor `Music`: Der bereits verlässlich aktive Require-Adapter umschließt ausschließlich das exportierte `ChipAudio.playMusic`. Eine Rückgabe wird nur akzeptiert, wenn sie die für QueueableSource erforderlichen Methoden `setVolume`, `queue` und `getFreeBufferCount` besitzt.

Bei dem beobachteten Funktionswert wirft der Wrapper einen beschreibenden Fehler einschließlich verfügbarer Lua-Funktionsherkunft. `Music.startSong` führt `ChipAudio.playMusic` bereits unter `pcall` aus und behandelt Fehler als nicht gestarteten Song. Damit wird der ungültige Wert nicht mehr in `Music.applyVolume` dereferenziert; der bestehende Payload-Fallback kann Gameplay fortsetzen. Dies ersetzt keine Audioengine und behauptet keine funktionierende Kartenmusik.

Ein ausführbarer Lua-Test lädt ein unverändertes simuliertes ChipAudio-Modul über denselben Require-Adapter und beweist, dass der Funktionswert vor Music zurückgewiesen wird. Der normalize2-Vertragsguard bleibt als frühere, zusätzliche Laufzeitgrenze bestehen.

## Status

- Verhinderung des sekundären `Music.lua:39`-Absturzes im Test: **VERIFIZIERT**.
- Weiteres Gameplay auf dem Gerät: **NICHT VERIFIZIERT**.
- Allgemeine Audioausgabe: **VERIFIZIERT**.
- Synthetisierte Kartenmusik: **NICHT VERIFIZIERT**; bei Zurückweisung des ungültigen Werts voraussichtlich stumm und für eine vollständige Lösung **NUR MIT HOST-UNTERSTÜTZUNG** beziehungsweise einem love.js-Runtime-Fix.
