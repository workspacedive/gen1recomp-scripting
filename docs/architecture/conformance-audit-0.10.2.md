# Architektur-Konformitätsprüfung 0.10.2

Stand: 2026-09-26

## Gerätebefund aus 0.10.1

**VERIFIZIERT:** Die Diagnosehülle hat den verdeckten Root Cause erhalten. `src/core/Data.lua:271` ruft für erzeugte ROM-Daten `load(bytes, chunkname, "t", {})` auf. Das ist der Lua-5.2+-Vertrag. love.js 11.5 stellt hier jedoch Lua 5.1 bereit, dessen `load` als erstes Argument ausschließlich eine Reader-Funktion akzeptiert. Deshalb scheiterte `Game.load` vor `self.stack = StateStack`; der zuvor sichtbare `Game.stack`-Fehler war nur die Folge.

## Runtime r7

Der Host-Adapter ergänzt eine eng begrenzte Lua-5.2-`load`-Kompatibilität:

- String-Chunks werden unter Lua 5.1 mit `loadstring` kompiliert.
- Ein explizites Environment wird mit `setfenv` ausschließlich auf den neuen Chunk angewendet.
- `mode` akzeptiert nur `b`, `t` oder `bt`; Text- und Binärmodus werden vor dem Kompilieren durchgesetzt.
- Der native Lua-5.1-Readerpfad bleibt unverändert, solange weder Modus noch Environment angefordert werden.
- Reader mit Kompatibilitätsargumenten werden kontrolliert eingesammelt und über denselben Modus-/Environment-Pfad kompiliert.
- Falsche Chunk- und Reader-Typen scheitern geschlossen.

**VERIFIZIERT (automatisiert):** Der Test emuliert den Lua-5.1-`loadstring`-/`setfenv`-Pfad, lädt einen Text-Chunk in eine isolierte Umgebung, prüft einen Reader-Chunk und weist einen Text-Chunk im Binärmodus zurück. Die bestehenden Bit-, MD5- und Root-Cause-Tests bleiben aktiv.

## Grenzen

- Runtime r7 und der neue `load`-Pfad auf love.js/iOS: **NICHT VERIFIZIERT**
- Gameplay, Eingabe, Audio, Saves und Lifecycle: **NICHT VERIFIZIERT**

Gen1Recomp, upstream love.js, Player, WASM und upstream Normalisierung bleiben byteidentisch. Runtime r7 wird side-by-side neben r1–r6 installiert.
