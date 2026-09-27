# Mod-Laufzeitaktivierung 0.13.2

Stand: 2026-09-28

## Befund

- **VERIFIZIERT (offizieller Pin):** Gen1Recomp `64dd9cb3a377b398b6132d223a121878f68b4b07` entdeckt in `src/mods/Loader.lua` ausschließlich Verzeichnisse unter dem virtuellen, kleingeschriebenen Pfad `mods/` und liest dort `<Ordner>/manifest.json`.
- **VERIFIZIERT (offizieller Pin):** `src/mods/LauncherMods.lua` verwendet denselben Ein-Ebene-Vertrag und installiert reguläre Pakete nach `mods/<id>`.
- **VERIFIZIERT (vorheriger Hostcode):** Bis 0.13.1 wurden geprüfte Pakete nur in `Documents/Gen1Recomp/Mods/<id>/<version>/<sha256>` extrahiert. Dieser Hostpfad gehörte nicht zum PhysFS-/LÖVE-Suchpfad des Spiels.

## Umsetzung

1. Der Import behält zusätzlich zu den selbst extrahierten Dateien das ursprüngliche, SHA-256-adressierte ZIP. Neue Importe sind für den nächsten Start freigegeben; pro Mod-ID ist höchstens eine Paketversion freigegeben.
2. Vor jedem Gameplay-Start werden das gespeicherte Archiv, SHA-256, Zentralverzeichnis, Pfade, Symlink-Sperren, Größen/Entpackverhältnis, lokale Header, DEFLATE-Ausgabe, CRC-32 sowie Manifest-ID und -Version erneut geprüft.
3. Ein eigener ZIP32-Overlay-Writer erhält alle lokalen Records und Central-Directory-Records des gepinnten `game.love` byteidentisch. Er ergänzt ausschließlich geprüfte Dateien als `mods/<id>/<relativer Paketpfad>` in ein transientes Startpaket.
4. Nur dieses transiente Paket wird über den bestehenden allowlisteten Ressourcenpfad `gen1recomp/game.love` übertragen. Der gespeicherte Upstream-Payload, `player.js`, love.js und WASM bleiben unverändert. Es gibt keinen direkten WASM-Zugriff und keine Loader-Kopie.
5. Erst wenn der bestehende Runtime-Handshake `runtime.ready` meldet, erhält das Paket einen Zeitstempel „zuletzt laufzeitsichtbar“. „Gespeichert“, „aktiviert für den nächsten Start“ und „zuletzt laufzeitsichtbar“ sind in der UI getrennt.
6. Entfernung publiziert zuerst den reduzierten Index und entfernt danach extrahierte Dateien und das zurückbehaltene Archiv. Saves, ROMs, Profile, Runtime und Payload sind keine Löschziele.

## Migration

0.13.1 und ältere Indexeinträge besitzen kein zurückbehaltenes Quellarchiv. Sie werden verlustfrei als **gespeichert/deaktiviert** übernommen. Weil die freie Scripting-`FileManager`-Schnittstelle kein Verzeichnislisting bereitstellt, wird aus den extrahierten Resten kein unvollständig belegtes Archiv rekonstruiert. Für die Aktivierung ist einmaliges erneutes Importieren desselben Original-ZIPs erforderlich.

## Grenzen und Evidenz

- **VERIFIZIERT (reproduzierbarer Test):** Der Overlay-Writer erhält komprimierte Upstream-Dateien lesbar, ergänzt `mods/<id>/...`, verweigert Pfadkollisionen und ergibt ein von Standard-ZIP-Werkzeugen vollständig prüfbares Archiv.
- **VERIFIZIERT (statische Gates):** Der Gameplaypfad benutzt weiterhin nur die vorhandene Ressourcen-Bridge; Laufzeitsichtbarkeit wird erst nach `runtime.ready` gespeichert; Entfernung ändert den Index vor Dateibereinigung.
- **TEILWEISE VERIFIZIERT:** Das offizielle Loader-Layout und der erzeugte `.love`-Inhalt sind belegt. Der konkrete importierte Mod und der komplette Lauf auf iOS benötigen den Gerätetest.
- **TECHNISCH UNBEKANNT:** Ob ein konkretes Drittanbieter-Manifest alle strengeren offiziellen Gen1Recomp-Regeln, Abhängigkeiten, Konflikte, Spielversionsbereiche und gegebenenfalls erforderliche Benutzerimporte erfüllt, entscheidet weiterhin Gen1Recomps eigener Loader. Der Host dupliziert diese Semantik absichtlich nicht.
- **VORAUSSETZUNG:** Ein älteres, nur gespeichertes Paket muss einmal neu importiert werden, damit sein Originalarchiv für die wiederholbare Laufzeitprüfung verfügbar ist.

Der separat zurückgestellte Files-App-Save-Export ist nicht Bestandteil dieser Änderung.
