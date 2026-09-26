# Architektur-Konformitätsprüfung 0.7.0

Stand: 2026-09-26

## Gerätebefund und Ursache

Der r2-Bericht enthält `bridge.ready` und anschließend `resources.error` mit `TypeError: Load failed` in `resource-preflight`. Damit sind Scripting-Message-Bridge, lokales HTML und JavaScript funktionsfähig. WKWebView lehnt jedoch den verwendeten lokalen `fetch` ab, noch bevor upstream Player oder WASM starten.

Status: **VERIFIZIERT** auf dem realen Gerät.

## Resource Bridge

Adapter r3 transportiert die vom offiziellen Player benötigten Binärpakete über `gen1HostBridge` v1. Die Allowlist ist geschlossen:

- `nogame.love`
- `lua/normalize1.lua`
- `lua/normalize2.lua`
- `11.5/love.wasm`

Eine Anforderung enthält Pfad, Offset und Länge. Der Host akzeptiert ausschließlich ganzzahlige nichtnegative Offsets und Längen von 1 bis 131.072 Byte. Antworten enthalten Pfad, Offset, Gesamtgröße, Base64-Nutzlast und EOF-Markierung. Traversal, beliebige Dateien und übergroße Nachrichten sind nicht möglich.

Der Host lädt nur Dateien aus dem bereits veröffentlichten und unmittelbar zuvor vollständig SHA-256-revalidierten Runtimekandidaten. Er gibt keine absoluten Pfade an die WebView weiter.

## WASM-Grenze

Die Bridge behandelt `love.wasm` als opake Bytes:

- erlaubt: Identität hashen, feste Bereiche lesen, unverändert transportieren;
- verboten: validieren, instanziieren, patchen, Exporte aufrufen, linearen Speicher untersuchen oder Laufzeitfunktionen direkt steuern.

Der Harness setzt Chunks bytegetreu zusammen und stellt dem unveränderten Player ein normales `Response`-Objekt bereit. Ausschließlich das byteidentische upstream `love.js`/Emscripten besitzt anschließend Laden und Instanziierung. Hostkommunikation bleibt unabhängig davon auf `gen1HostBridge` beschränkt.

## Eingriffsfläche

- `player.js`, `love.js`, `love.wasm`, Normalizer und `nogame.love`: unveränderte gepinnte upstream Bytes.
- Hostadapter: Allowlist, Rangeprüfung, Chunktransport und Diagnose.
- Gen1Recomp-Payload: nicht gemountet und nicht ausgeführt.
- Saves, Mods, Library und Nutzerdaten: unberührt.

Der Harness überschreibt `fetch` ausschließlich für die vier exakten Allowlistpfade. Alle anderen Requests verwenden die native Browserfunktion.

## Updatefähigkeit

`lovejs-11.5-r3` deklariert Adapterversion 3, Bridgeprotokoll 1, Vorgänger r2 und `reviewed-side-by-side-candidate`. Installation erfolgt in einen neuen Runtimeordner. r1 und r2 werden weder überschrieben noch gelöscht. Es gibt weiterhin keinen aktiven Pointer oder automatischen Fallback auf ungeprüfte Bytes.

## Verbleibende Gates

1. realer Chunktransfer aller vier Ressourcen;
2. Rückkehr von `player.js`;
3. `Module.postrun` für `nogame.love`;
4. anschließend getrennt: Audio nach User-Geste, Save-Bridge, Lifecycle und erst danach Gen1Recomp-Payload.

Gesamtstatus: **EXPERIMENTELL / TEILWEISE VERIFIZIERT**. `APP.runtimeEnabled` bleibt `false`.
