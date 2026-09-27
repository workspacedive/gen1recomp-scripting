# Release-Candidate-Konformität 0.13.0

Stand: 2026-09-27

## Geräteabnahme

Folgende Gates sind mit Runtime r24 **VERIFIZIERT (Gerät)**:

- STORE-Import und Host-Boot,
- Payload-Staging und Launcher,
- kanonischer ROM-Import,
- New Game, Karte und Eingabe,
- QueueableSource-/ChipAudio-Wiedergabe,
- In-Game-Save, vollständiger Scripting-Neustart und `CONTINUE`,
- Pokémon Yellows Eich-Demo-Glyphe `POKE BALL ×1`,
- Trainer- und Wildkampfstart.

Der letzte Performance-Datensatz bestätigt 15–20 ms für normale synchrone Songstarts, 43 ms für den untersuchten Kampfmusikstart und 3603 ms für einen 216-Frame-Übergang (Soll: 3600 ms). Damit sind Musik-Preroll und Übergangstakt im gemessenen Pfad korrigiert.

## Release-Änderungen

- `APP.runtimeEnabled` wird aktiviert.
- Der Bibliotheksbutton heißt regulär `Spiel starten`; experimentelle Hinweise und Navigationstitel entfallen.
- Vor jedem Start bleiben die bestehenden ROM-, Payload- und Runtime-Prüfungen zwingend.
- Temporäre Profilereignisse sind standardmäßig deaktiviert, sodass kein Diagnose-Bridgeverkehr und keine Profil-Datei während normaler Sitzungen entsteht.
- Erforderliche Adapter bleiben erhalten: Lua-5.2-Hex-Escapes, QueueableSource-Fassade, persistentes/debounced IDBFS, 2048-Sample-Sync-Puffer und 60-Hz-Übergangspacing.

## Verbleibende Gates

- Mehrstündige Audio-/Gameplay-Sitzung mit Prüfung auf Unterläufe: **NICHT VERIFIZIERT**.
- Wiederholte Hintergrund-/Vordergrundzyklen einschließlich anschließendem Save/Relaunch: **NICHT VERIFIZIERT**.
- Separater Files-Save-Export: auf ausdrücklichen Benutzerwunsch zurückgestellt.

Die Aktivierung ist aufgrund der bestätigten Kernpfade vertretbar; die offenen Punkte sind Release-Härtung und keine bekannten Startblocker.
