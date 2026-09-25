# Evidenzprotokoll

Stand: 2026-09-25. Dieses Dokument trennt beobachtete Fakten von Annahmen.

## Untersuchte Artefakte

| Artefakt | Revision / Digest | Status | Bemerkung |
|---|---|---|---|
| Gen1Recomp Source | Tag `v0.3.18`, Commit `b83f805a7c7b6043370b783ea7a4b65fd8c93ef4` | VERIFIZIERT | Tag lokal ausgecheckt und Quellcode untersucht. |
| Android Release | `gen1recomp-0.3.18-android.apk`, 40,036,414 Bytes, publizierter SHA-256 `1314d5a7dccc6aed29b5a9e27d356fa81eb9014f5c5eb7522fdc70293e02fd88` | TEILWEISE VERIFIZIERT | GitHub Release API und exakter Tag verifiziert. Der Binärdownload brach in der Sandbox am Release-CDN wiederholt mit TLS/EOF ab; daher keine unabhängige Dekompilierung. Buildquellen und Android-Paketpipeline derselben Revision wurden analysiert. |
| iOS Release | `gen1recomp++-0.3.18-ios.ipa`, publizierter SHA-256 `df9f92498ba2db887ff60087c8549e878d39889f6285212fb42e23c57d80f62e` | VERIFIZIERT (Metadaten) | Belegt, dass ein nativer LÖVE-iOS-Port existiert; er ist nicht dasselbe wie eine Scripting-App. |
| Scripting offizielle Dokumentation | Repository `ScriptingApp/scriptingapp.github.io`, Commit `381a7a623cecac4f6a51fdff958c8c0c00e3c911`, App-Store-Dokumentations-ZIP | VERIFIZIERT | ZIP und `doc.json` lokal analysiert. Dokumentation enthält Changelog bis 3.2.0. |
| Scripting Beispiele/Doku-Spiegel | `Honye/scripting-scripts`, Commit `41f3d2387c9a9dae4dfc9596b2fdd040cae55b11` | TEILWEISE VERIFIZIERT | Ergänzende Quelle, nicht als Host-Primärbeleg verwendet. |

## Gen1Recomp – verifizierte Fakten

- **VERIFIZIERT:** v0.3.18 ist keine APK-spezifische Java-App, sondern eine eingebettete LÖVE-Anwendung. `scripts/build_android.sh` packt `game.love`; `mobile/android` vendort love-android 11.5a, SDL2 und LuaJIT. Android ergänzt SAF-Dateiauswahl, HTTPS-Download, Schritte und Paketinstallation über native Bridges.
- **VERIFIZIERT:** Der aktuelle iOS-Port verwendet LÖVE 12.0 und native Swift/Objective-C-Bridges. `UIFileSharingEnabled` und `LSSupportsOpeningDocumentsInPlace` machen den Documents-Root in Dateien sichtbar.
- **VERIFIZIERT:** Der Core ist Lua/LÖVE, nicht `lua.wasm`. Es gibt in v0.3.18 kein mitgeliefertes `.wasm`-Core-Artefakt.
- **VERIFIZIERT:** Ein historischer/experimenteller Webpfad ist angedeutet: `scripts/split_web_build.py` erwartet ein von love.js erzeugtes `game.js`/`game.data`. Es existiert aber weder ein Web-Release-Artefakt noch eine CI-Webpipeline im Tag. Das ist kein Nachweis der Spielfähigkeit auf iOS/Scripting.
- **VERIFIZIERT:** ROM-Import validiert SHA-1 gegen versionierte Manifeste, extrahiert private Tabellen/Grafiken/Audio-Programme und muss die ROM danach nicht für normale Starts behalten. Red/Blue/Yellow können getrennt existieren. Der heutige Tag unterstützt darüber hinaus weitere Spiele; deren Aufnahme in die Scripting-P0 ist nicht impliziert.
- **VERIFIZIERT:** Timing: `FixedStep.lua` trennt Logikschritt und Präsentation; 60-Hz-Schritt, Akkumulatorbegrenzung, Hitch-Unterdrückung und Arbeitsbudget sind vorhanden. `love.run` besitzt VSync-/Present-Sync-, Frame-Cap- und Idle-Presentation-Logik.
- **VERIFIZIERT:** Rendering: 160×144-Canvas, nearest/integer scaling und Map-SpriteBatch existieren. Asset-, Map- und Bildcaches existieren bereits. Ein paralleler Renderer wäre ein großer Kompatibilitätsbruch.
- **VERIFIZIERT:** GC: `Game.lua` führt alle vier Frames einen kleinen `collectgarbage("step", 1)` aus; Importpfade nutzen gezielte Vollsammlungen. Das ist eine bestehende inkrementelle Strategie, die nicht blind ersetzt werden darf.
- **VERIFIZIERT:** Threads werden für Audio, Import, Netzwerk, Updates und begrenzte Mod-Jobs verwendet; mehrere Pfade haben Fallbacks, aber Audio-/Importverhalten muss im threadlosen Webbuild separat geprüft werden.
- **VERIFIZIERT:** Mods besitzen Manifest v2, Semver-Abhängigkeiten, optionale Abhängigkeiten, Konflikte, Zielspiele, API-/Engine-Ranges und Berechtigungen (`network`, `filesystem`, `engine_internals`, `steps`, `background`, `compute`). Das ist nicht identisch mit dem feineren Ziel-Capability-Modell.
- **VERIFIZIERT:** Hooks sind priorisierte, vorbereitete Chains. Fehlerhafte Mod-Wrapper werden attributiert und übersprungen; Vanilla läuft höchstens einmal. String→Registry-Optimierung darf erst nach Profiling erfolgen.
- **VERIFIZIERT:** SaveData nutzt deterministische Lua-Datenserialisierung mit data-only Parser, Migration, Validierung/Quarantäne sowie `.tmp`/`.bak`-Recovery. LÖVE bietet dort keine atomare Rename-API; der bestehende Pfad kompensiert dies mit Witness und Backup.
- **VERIFIZIERT:** Der Updater nutzt versionierte `.love`-Payloads, SHA-256, Staging/`.part`, Shell-/Host-Kompatibilitätsgates und `pending.txt` als Crash Guard. Er ist GitHub-spezifisch und kein vollständiger allgemeiner Repository Provider.
- **VERIFIZIERT:** Der Launcher wurde von retained FlexLove auf unmittelbares Zeichnen umgestellt, nachdem ~9 ms Build+Draw profiliert wurden. Er verwendet explizite Pixel-Layouts, virtualisierte/seitige Listen und action queues. Das ist relevante UX-/Performance-Evidenz.

## Scripting App – verifizierte Fakten

Aus der offiziellen App-Store-Dokumentations-ZIP:

- **VERIFIZIERT, FREE:** TypeScript/TSX, SwiftUI-basierte Views, `WebView` und `WebViewController` sind nicht als Pro markiert.
- **VERIFIZIERT, FREE:** `FileManager.documentsDirectory` ist sichtbar in Dateien. Asynchrones Lesen/Schreiben als Bytes, Rename, Copy, Remove, Stat, Verzeichnisse und ZIP/Unzip sind dokumentiert.
- **VERIFIZIERT, FREE:** `DocumentPicker` unterstützt Datei-/Ordnerauswahl, Export und persistente security-scoped Bookmarks.
- **VERIFIZIERT, FREE:** `AppEvents.scenePhase` meldet `active | inactive | background`.
- **VERIFIZIERT, FREE:** `Canvas` und `TimelineCanvas` sind nicht als Pro markiert. TimelineCanvas tickt laut Dokumentation ungefähr 60 fps und teilt sich den Main Thread. Es ist ein JS-Kommandosammler, der über SwiftUI `GraphicsContext` replayt, kein LÖVE-/OpenGL-Backend.
- **VERIFIZIERT, FREE:** `AVPlayer`, SharedAudioSession und WebView-Nachrichtenbridge sind dokumentiert und nicht als Pro markiert.
- **VERIFIZIERT, PRO:** `BackgroundKeeper` ist in `doc.json` als Pro markiert. Dieses Projekt verwendet ihn nicht.
- **NICHT VERIFIZIERT:** Scripting garantiert keine eigene Lua- oder LÖVE-Runtime.
- **NICHT VERIFIZIERT:** Die offizielle Dokumentation nennt WebAssembly, WebGL, WebGPU, Worker, SharedArrayBuffer, OffscreenCanvas, SIMD, Gamepad/GameController oder Streaming Compilation nicht als Scripting-Vertrag.
- **TECHNISCH UNBEKANNT:** `WebViewController` wirkt wie WKWebView und allgemeines WKWebView kann WebAssembly unterstützen; daraus folgt jedoch ohne Device-Probe keine Scripting-Garantie. Gleiches gilt für IndexedDB, Web Audio und lokale Subresource-CORS-Regeln.
- **NICHT VERIFIZIERT:** Eine atomare Replace-Garantie für `FileManager.rename` ist nicht dokumentiert. Transaktionen müssen mit Journal/Backup statt mit behaupteter Atomizität entworfen werden.
- **NICHT VERIFIZIERT:** Memory-Limits, Background-Zeit, WebView-Prozess-Recovery und Controller-Support sind nicht dokumentiert.

## Zentrale Schlussfolgerung

**NUR MIT HOST-UNTERSTÜTZUNG / EXPERIMENTELL:** Der realistische Weg mit minimalem Core-Delta ist ein love.js/Emscripten-Artefakt in Scripting `WebViewController`, umgeben von einer nativen Scripting-Library-/Storage-UI. Vor einer Zusage „spielbar“ müssen auf einem echten Gerät mindestens WASM, WebGL, Web Audio, lokale Subresources, persistentes VFS, Touch und Speicher geprüft und ein v0.3.18-Webbuild gebootet werden.

**NICHT REALISTISCH als P0:** 958 Lua-Dateien und LÖVE APIs in TypeScript/TimelineCanvas nachzubauen. Das würde einen zweiten inkompatiblen Engine-Core schaffen, Mods/Hooks brechen und die Vorgabe „Original möglichst wenig ändern“ verletzen.

## Primärquellen

- Gen1Recomp: <https://github.com/bryanthaboi/gen1recomp/tree/v0.3.18>
- Release: <https://github.com/bryanthaboi/gen1recomp/releases/tag/v0.3.18>
- Scripting Docs: <https://github.com/ScriptingApp/scriptingapp.github.io>
- Scripting Website: <https://scripting.fun/doc_v2/>
- Scripting App Store: <https://apps.apple.com/app/id6479691128>
- love.js 11.5 (Kandidat, nicht Produktbeleg): <https://github.com/Davidobot/love.js>
