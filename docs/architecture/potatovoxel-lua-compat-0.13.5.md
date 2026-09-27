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
3. Nur wenn auch eine Kompilierung mit einer Fehlermeldung `near 'LL'` oder `near 'ULL'` scheitert, werden tokenbegrenzte Suffixe an hexadezimalen Zahlen entfernt und genau einmal erneut kompiliert.
4. Andere Syntaxfehler bleiben unverändert Fehler. Bytecode-, Mod-Sandbox-, Berechtigungs- und Pfadregeln werden nicht gelockert.

Gen1Recomps Loader, Mod-API, Sandbox und UI bleiben unverändert. Player, love.js und WASM bleiben opaque und SHA-256-gepinnt; r26 versioniert nur den Hostadapter seitlich neben r25.

## Berechtigungssymbole

**VERIFIZIERT (offizieller Pin):** `src/mods/ManagerState.lua` weist den Berechtigungszeilen `engine_internals` und `filesystem` fest das Glyph `!` zu. Es ist eine Risikowarnung über die Manifestdeklaration, kein Hinweis auf eine fehlende Hostfähigkeit. Der Modstatus `FOR GEN 1 FAILED` und der Compilertext sind davon getrennt.

## Evidenzstatus

- Ursachenanalyse und Parser-Reproduktion: **VERIFIZIERT**.
- Begrenzte Retry-Logik und unveränderte Ablehnung anderer Syntaxfehler: **VERIFIZIERT** durch automatisierten Test.
- Start und Funktion von PotatoVoxel 1.5.8 auf iOS/love.js r26: **TEILWEISE VERIFIZIERT**, Gerätetest erforderlich.
- Laufzeit-, Grafik- und Performanceeignung des Mods: **BENCHMARK ERFORDERLICH**.
