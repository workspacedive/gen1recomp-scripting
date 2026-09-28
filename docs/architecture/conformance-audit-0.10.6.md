# Architektur-Konformitätsprüfung 0.10.6

Stand: 2026-09-26

## Gerätebefund und Ursache

0.10.5 startet den echten Payload und der Touch-Controller funktioniert auf dem Testgerät (**VERIFIZIERT**). Der neue Spielstand erreicht den Kartenaufbau (**TEILWEISE VERIFIZIERT**), bricht dort aber in `Music.applyVolume` ab: Der von `ChipAudio.playMusic` gelieferte Wert hat den Lua-Typ `function`, obwohl die dokumentierte LÖVE-11.5-Schnittstelle `love.audio.newQueueableSource` eine `Source` liefern muss.

Die statische Prüfung der unveränderten Payload-Kette bestätigt: `ChipAudio` ruft den Konstruktor unter `pcall` auf und gibt dessen ersten Erfolgswert zurück; `Music` behandelt diesen anschließend vertragsgemäß als Source. Damit liegt der beobachtete Typbruch an der Runtime/API-Grenze und nicht in der Lautstärkeoperation. **VERIFIZIERT** für den beobachteten Rückgabewert und die Payload-Kette; die interne Ursache in der opaken Runtime bleibt **TECHNISCH UNBEKANNT**.

## Korrektur

Adapter r11 validiert ausschließlich `love.audio.newQueueableSource`:

1. Der dokumentierte Primärwert bleibt unverändert, wenn er die benötigten Source-Methoden besitzt.
2. Falls love.js mehrere Werte liefert, wird ein tatsächlich vorhandener Source-Wert aus den weiteren Rückgabepositionen übernommen. Dies adressiert den konkreten möglichen Bindingsversatz ohne Annahmen über WASM-Interna.
3. Gibt es keinen Source-Wert, löst der Adapter einen beschreibenden Vertragsfehler aus. `ChipAudio` fängt Konstruktorfehler bereits selbst ab; dadurch gelangt kein Funktionswert mehr bis `Music.applyVolume` und Gameplay kann ohne diesen Sekundärfehler fortgesetzt werden. Audio bleibt dann bewusst nicht als funktionsfähig behauptet.

Ein ausführbarer Fengari-Test deckt sowohl die Wiederherstellung eines Source-Werts aus einer späteren Rückgabeposition als auch den kontrollierten Fehler bei ausschließlich ungültigen Werten ab.

## Grenzen

- Gen1Recomp-Payload, offizielles `player.js`, upstream Normalizer, `love.js` und `love.wasm` bleiben bytegleich und getrennt versioniert: **VERIFIZIERT** durch Manifest-Hashes und Pakettests.
- Der Host interpretiert oder instantiiert WASM nicht: **VERIFIZIERT** durch Quelltest.
- Musik/SFX mit r11: **NICHT VERIFIZIERT**, Gerätetest erforderlich.
- Falls r11 ohne Absturz, aber stumm weiterläuft, ist die QueueableSource-Fähigkeit dieses love.js/iOS-WebView-Pfads **NUR MIT HOST-UNTERSTÜTZUNG** beziehungsweise durch einen späteren Runtime-Fix lösbar; r11 erfindet keine Ersatz-Audioengine.
- Saves, Lifecycle, Langzeitspiel und Performance: **NICHT VERIFIZIERT**.
