# Architektur-Konformitätsprüfung 0.12.0

Stand: 2026-09-26

## Gerätebefund

Der Benutzer bestätigt, dass Spielstart, Karte, Steuerung und Audio mit r17 funktionieren. **VERIFIZIERT (Gerät)**. Drei neue Befunde bleiben:

1. Der In-Game-Speichervorgang meldet Erfolg, nach vollständigem Neustart fehlt `CONTINUE`: **VERIFIZIERT (Gerät)**.
2. Trainer-/Wildkampfstarts sind deutlich langsam: **VERIFIZIERT (Gerät), BENCHMARK ERFORDERLICH**.
3. In Professor Eichs Gelb-Catch-Demo wird der Pokéball-Anzahlbereich als ungewöhnliche Zeichenfolge dargestellt: **VERIFIZIERT (Gerät), genaue Glyphenfolge noch unbekannt**.

## Save-Ursache

Der gesamte Persistenzpfad wurde geprüft:

- Gen1Recomp schreibt transaktional über `love.filesystem` nach `save_yellow.lua` beziehungsweise den versionsspezifischen Namen und meldet den erfolgreichen In-Memory-VFS-Schreibvorgang.
- love.js mountet `/home/web_user` über IDBFS, lädt es beim Start mit `FS.syncfs(true)` und schreibt es erst in `Module.exit` mit `FS.syncfs(false)` zurück.
- Der Host erzeugte jedoch ausdrücklich `WebViewController({ ephemeral: true })`. Damit liegt IndexedDB in einem flüchtigen WKWebView-Datenspeicher und kann nach Controller-/App-Neustart nicht fortbestehen.
- Zusätzlich ist der `onbeforeunload`-Kommentar des offiziellen Players korrekt: ein erst beim Schließen gestarteter asynchroner Sync ist nicht zuverlässig abschließbar.

## Korrektur

0.12.0/r18 verwendet für den Runtime-WebView den persistenten, dokumentierten Datenspeicher (`ephemeral: false`). Der Harness synchronisiert IDBFS nach `Module.postrun` alle 750 ms, serialisiert überlappende Syncs und fordert zusätzliche Flushes bei `visibilitychange` und `pagehide` an. Damit wird ein bestätigter In-Game-Save zeitnah in persistentes IndexedDB geschrieben, statt allein vom unsicheren Exit-Pfad abzuhängen.

Der Host liest oder interpretiert dabei weder WASM noch linearen Speicher. Er nutzt ausschließlich das von love.js selbst exponierte `Module.FS.syncfs` für dessen eigenes IDBFS-Mount.

## Noch offen

- Save über vollständigen Scripting-Neustart: **NICHT VERIFIZIERT**, Gerätetest mit 0.12.0 erforderlich.
- Sichtbare, exportierbare Save-Sicherung unter `Documents/Gen1Recomp/Saves`: noch **NICHT IMPLEMENTIERT**; IndexedDB-Persistenz ist der erste Recovery-Gate, nicht das endgültige Backupdesign.
- Kampfstart-Performance: **BENCHMARK ERFORDERLICH**; keine spekulative Audio-/Frameänderung ohne Messpfad.
- Gelb-Demo-Glyphe: **NICHT VERIFIZIERT** ohne exakte sichtbare Zeichenfolge/Screenshot; der statische Pfad setzt numerisch `qty = 1` und zeichnet anschließend das Multiplikationszeichen plus `tostring(count)`.
