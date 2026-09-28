# Architektur-Konformitätsprüfung 0.10.0

Stand: 2026-09-26

## Umfang

Diese Iteration behebt den auf dem echten Gerät beobachteten Abbruch `StreamMD5 requires bit or bit32` und stellt genau eine bereits erkannte Library-ROM für einen expliziten experimentellen Start bereit. Sie beansprucht noch keinen bestandenen Gameplay-, Audio-, Save- oder Lifecycle-Test.

## Unveränderte Upstreams

**VERIFIZIERT (Repository/Hashes):** Gen1Recomp 0.3.20, `player.js`, `love.js`, `love.wasm` und die upstream Datei `lua/normalize1.lua` wurden nicht verändert. Runtime r5 enthält zusätzlich `runtime/adapter/normalize1.lua`; der Adapter beginnt bytegleich mit upstream `normalize1.lua` und ergänzt danach Host-Kompatibilität. Die Bridge liefert ausschließlich für die bestehende Player-Anfrage `lua/normalize1.lua` den separat gehashten Adapter aus.

## Bit-Kompatibilität

**VERIFIZIERT (reproduzierbarer Test):** Der reine Lua-Adapter stellt getrennte LuaBitOp-kompatible `bit`- und Lua-5.2-kompatible `bit32`-Tabellen bereit. Geprüft sind `band`, `bor`, `bxor`, `bnot`, logische und arithmetische Shifts, Rotation, `tobit`, Varargs, Vorzeichen und Shift-Grenzen. Die unveränderte upstream `StreamMD5.lua` besteht die Standardvektoren für leere Eingabe, `abc` und `message digest` in Fengari. Dies ist kein Geräte- oder Performancebeleg.

## ROM-Übergabe

**VERIFIZIERT (statische Architektur und Tests):** Der Startknopf ist nur bei einem durch die bekannte SHA-1-Tabelle erkannten Library-Datensatz sichtbar. Vor jedem Start liest der Host `Library/content/<sha256>/original.gb` erneut und prüft Länge, SHA-256 und SHA-1. Genau diese Daten werden unter dem festen, allowlist-beschränkten Bridge-Namen `rom/import.gb` übertragen. Der offizielle Player legt sie vor Lua-Start schreibgeschützt unter `/usr/local/share/lua/5.1/import.gb` ab.

Der Host-Adapter liefert `POKEPORT_IMPORT_ROM` und `POKEPORT_FORCE_IMPORT=1` nur dann über einen schmalen `os.getenv`-Wrapper, wenn diese Datei tatsächlich geöffnet werden kann. Das Erzwingen verhindert, dass ein bereits persistierter Red-Cache die neu ausgewählte Blue-/Yellow-ROM überspringt; Gen1Recomp erkennt die importierte Edition selbst und startet sie über seinen unveränderten offiziellen Callback. Der Launcher-Test ohne ROM erhält beide Variablen nicht.

## WASM-Grenze

**VERIFIZIERT (statische Prüfung):** Der Host hasht und transportiert die opaque `love.wasm`-Datei. Er validiert oder instantiiert WASM nicht, ruft keine Exports auf, liest keinen linearen Speicher und patcht keine Bytes. Instanziierung bleibt im offiziellen love.js-Loader.

## Update- und Speichertrennung

**VERIFIZIERT (Repository):** `lovejs-11.5-r5` wird side-by-side neben r1–r4 installiert und deklariert r4 als Vorgänger. Adapter, Runtime, Payload, Library-ROM, Mods und Host-Shell bleiben getrennt. Es wird weiterhin kein aktiver Core-Pointer veröffentlicht. Die Library-Originaldatei bleibt dauerhaft in Documents; die Runtime erhält nur eine sitzungsgebundene Kopie.

## Offene Gates

- Launcher-Darstellung mit r5: **NICHT VERIFIZIERT**
- ROM-Import auf echtem Gerät: **NICHT VERIFIZIERT**
- Tatsächliches Gameplay und Eingabe: **NICHT VERIFIZIERT**
- Audio: **NICHT VERIFIZIERT**
- Save-Synchronisierung in die sichtbare Host-Struktur: **NICHT VERIFIZIERT**
- Hintergrund/Vordergrund, Abbruch und Wiederanlauf: **NICHT VERIFIZIERT**
- Bit-Adapter-Leistung auf dem Gerät: **BENCHMARK ERFORDERLICH**

Die UI bezeichnet den Start daher ausdrücklich als experimentell und fordert nach dem Schließen einen Gerätebericht an.
