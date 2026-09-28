# PotatoVoxel-1.5.8-Lua-Kompatibilität 0.13.5

Stand: 2026-09-28

## Eingangsartefakt

Das vom Benutzer auf dem Arbeitsbranch bereitgestellte `potato_voxel-1.5.8.zip` wurde unverändert untersucht.

- SHA-256: `2d4b4b8768c95dea02a36dedfac5a397da359f853d2916f92dd8dfaf0abe8091`
- ZIP-CRC: vollständig fehlerfrei
- Manifest: `id=potato_voxel`, `version=1.5.8`, API 2, Einstieg `main.lua`
- deklarierte Berechtigungen: `engine_internals`, `filesystem`

## Reproduzierter Fehler

**VERIFIZIERT:** Von 77 Lua-Dateien scheitern im Lua-5.1-kompatiblen Parser ohne Normalisierung exakt zwei:

1. `lib/BattleScene.lua` beginnt mit `EF BB BF`, einer UTF-8-BOM. Der Mod liest Teilmodule über `mod:read()` und kompiliert den resultierenden String mit `load()`. Anders als ein dateibasierter Loader überspringt PUC Lua 5.1 diese BOM im String nicht und meldet `unexpected symbol near '<\\239>'`.
2. `lib/VRXR.lua` verwendet die LuaJIT-Erweiterungen `0x7fffffffffffffffLL` und `0x0001000000000000ULL`. PUC Lua 5.1 in love.js kennt die Suffixe `LL`/`ULL` nicht.

Nach Entfernen ausschließlich der führenden BOM beziehungsweise der beiden Zahlensuffixe kompilieren alle 77 Dateien. Das beweist noch nicht vollständige Modfunktion auf iOS, isoliert aber den gemeldeten Compilerfehler und die unmittelbar folgende zweite Compilergrenze.

## Begrenzter Adapter r26

Der Host verändert weder das gespeicherte Mod-ZIP noch den transienten `mods/<id>/`-Inhalt. Stattdessen erweitert r26 ausschließlich die vorhandene Lua-Dialektgrenze des love.js-Adapters:

1. Jede dynamische Textquelle wird zunächst unverändert kompiliert.
2. Nur wenn das fehlschlägt und die ersten drei Bytes exakt `EF BB BF` sind, wird ohne diese BOM erneut kompiliert.
3. Nur wenn auch eine Kompilierung scheitert und die Quelle selbst ein tokenbegrenztes `LL`-/`ULL`-Suffix an einer hexadezimalen Zahl enthält, wird dieses entfernt und genau einmal erneut kompiliert. r27 bindet den Retry bewusst an den Quelltoken statt an den Wortlaut der VM-Fehlermeldung, weil der Gerätelauf einen abweichend formatierten Fehler für dieselbe Syntaxgrenze belegt.
4. Andere Syntaxfehler bleiben unverändert Fehler. Bytecode-, Mod-Sandbox-, Berechtigungs- und Pfadregeln werden nicht gelockert.

Gen1Recomps Loader, Mod-API, Sandbox und UI bleiben unverändert. Player, love.js und WASM bleiben opaque und SHA-256-gepinnt; r26 versioniert nur den Hostadapter seitlich neben r25.

## Berechtigungssymbole

**VERIFIZIERT (offizieller Pin):** `src/mods/ManagerState.lua` weist den Berechtigungszeilen `engine_internals` und `filesystem` fest das Glyph `!` zu. Es ist eine Risikowarnung über die Manifestdeklaration, kein Hinweis auf eine fehlende Hostfähigkeit. Der Modstatus `FOR GEN 1 FAILED` und der Compilertext sind davon getrennt.

## r28: begrenzte Legacy-Paketkonfiguration

Der r27-Gerätelauf erreicht erstmals `MeshCache.dir()` und belegt damit, dass BOM und LuaJIT-Suffixe passiert werden. Dort liest PotatoVoxel `package.config:sub(1, 1)`, um `/` gegen `\\` zu unterscheiden. Gen1Recomps `LegacyCompat.packageShim` ist absichtlich eine isolierte Datentabelle und enthält kein `config`; die echte `package`-Tabelle darf wegen Modullader-/Sandboxzugriff nicht sichtbar werden.

r28 instrumentiert allgemein die Rückgabe von `src.mods.LegacyCompat.new`: Nur wenn dessen isolierter `globals.package`-Shim kein eigenes `config` besitzt, erhält er den Konfigurationsstring des Host-Lua. `loaded`, Loader, Suchpfade und die echte Paket-Tabelle werden nicht übernommen. Damit bleibt PotatoVoxels anschließender Datei-I/O in den bereits offiziellen virtuellen/scoped Legacy-Fassaden.

## r30: sichere Canvas-Formatprüfung und entfernter GBCFX-Clear

Der vollständige r29-Gerätelog nennt als letzte native LÖVE-Ausgabe: `The depth24 readable canvas format is not supported by your graphics drivers.` PotatoVoxel testet mehrere optionale lesbare Tiefenformate absichtlich mit `pcall`; wenn alle abgelehnt werden, sieht sein Quellcode bereits den internen, nicht lesbaren Tiefenpuffer als vorgesehenen Fallback vor. love.js öffnet beim Eintritt in die native `newCanvas`-Bindung jedoch bereits seinen fatalen Browseralert, bevor der Lua-`pcall` diesen gewöhnlichen Capability-Fehler handhaben kann.

r30 fragt LÖVEs eigene `love.graphics.getCanvasFormats()`-Tabelle einmal ab. Nur ein dort ausdrücklich mit `false` gemeldetes Format wird vor der nativen love.js-Bindung als Lua-Fehler zurückgegeben. Unterstützte, unbekannte und formatlose Canvas-Aufrufe gehen unverändert an `newCanvas`. So kann PotatoVoxel seinen bereits vorhandenen internen Depth-Buffer-Fallback wählen, ohne dass der Web-Wrapper den Prozess als fatal behandelt. Es wird keine Grafikfähigkeit erfunden.

Derselbe Log belegt außerdem, dass PotatoVoxel noch `src.render.GBCFX.setLevel(0)` zum Abschalten eines konkurrierenden Effekts verwendet. Gen1Recomp 0.3.20 hat GBCFX offiziell entfernt und durch ShaderFX ersetzt. r30 stellt deshalb ausschließlich diese schmale Clear-Operation bereit: `setLevel(0)` deaktiviert die aktuelle ShaderFX-Kette. Nicht-null GBCFX-Stufen oder der entfernte Effekt werden nicht emuliert.

## r31: lesbare und nicht lesbare Capability getrennt

Der r30-Gerätetest korrigiert eine Annahme der ersten Vorprüfung: LÖVE 11 bietet zwei offizielle Varianten, `getCanvasFormats(true)` und `getCanvasFormats(false)`. Auf dem Gerät ist `depth24` als nicht lesbarer Render-Tiefenpuffer unterstützt, aber nicht als lesbare Shader-Textur. r31 speichert beide Tabellen und prüft exakt gegen `settings.readable`. Diese Trennung verhindert den love.js-Alert, ohne den unterstützten internen Depth-Buffer-Fallback versehentlich ebenfalls zu sperren.

## Evidenzstatus

- Ursachenanalyse und Parser-Reproduktion: **VERIFIZIERT**.
- Begrenzte Retry-Logik und unveränderte Ablehnung anderer Syntaxfehler: **VERIFIZIERT** durch automatisierten Test.
- Start und Funktion von PotatoVoxel 1.5.8 auf iOS/love.js r26: **TEILWEISE VERIFIZIERT**, Gerätetest erforderlich.
- Laufzeit-, Grafik- und Performanceeignung des Mods: **BENCHMARK ERFORDERLICH**.
