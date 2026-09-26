# Architektur-Konformitätsprüfung 0.8.0

Stand: 2026-09-26

## Verifizierter Runtimebefund

Der reale r3-Bericht meldet `ready`, `Module.postrun reached` und die vollständige Sequenz `bridge.ready`, `resources.ready`, `player.loaded`, `runtime.ready`. Canvas, WASM-API und IndexedDB waren vorhanden. Damit sind lokaler WebView-Start, Host-Resource-Bridge, offizieller love.js-Player, opaker WASM-Transport und LÖVE-11.5-Initialisierung mit `nogame.love` **VERIFIZIERT**.

Nicht bewiesen sind Gen1Recomp, Audioausgabe, VFS-Persistenz, Lifecycle, Inputfunktion oder Gameplay.

## Payload-Gate

Adapter r4 ergänzt `session.config`. Der Host bestimmt pro Diagnosevorgang:

- Game-Paketpfad,
- geschlossene Ressourcenliste,
- WebView-Watchdog.

Für das neue Gate lautet das Game-Paket `payload/gen1recomp-0.3.20.love`. Vor Bereitstellung lädt der Host das bestehende Kandidatenmanifest, prüft Version, Revision, Bytezahl und SHA-256 erneut und liest danach dieselben verifizierten Bytes als opake Bridge-Ressource.

Der Harness sowie upstream `player.js`, `love.js`, `love.wasm` und der Gen1Recomp-Payload bleiben unverändert. Es wird weder Lua gepatcht noch ausgewertet, bevor der offizielle LÖVE-Loader das Paket übernimmt.

## Sicherheits- und Schichtengrenzen

- Der Payloadalias ist fest in der Bridge-Allowlist; beliebige Dateien bleiben unerreichbar.
- Chunks bleiben auf 128 KiB begrenzt und müssen pro Ressource streng fortlaufende Offsets verwenden.
- Die WebView erhält keine absoluten Hostpfade.
- ROMs, Mods, Saves, Library und Profile werden nicht als Ressourcen registriert oder gemountet.
- Es gibt keinen aktiven Pointer, keine Aktivierung und keinen Spielstart in „Spiele“.
- Ein erfolgreicher Bericht ändert keine Konfiguration und schaltet keine Funktion frei.
- `runtime.ready` wird nur akzeptiert, wenn upstream `Player.uri` noch exakt dem angeforderten Paket entspricht; der eingebaute Player-Fallback auf `nogame.love` kann daher keinen falschen Payload-Erfolg erzeugen.

## Updatefähigkeit

`lovejs-11.5-r4` deklariert Adapterversion 4, Bridgeprotokoll 1 und Vorgänger r3. Die Runtime wird seitlich installiert. Der Payload bleibt als eigene Komponente unter `Cores/payloads/0.3.20`; er wird nicht in den Runtimeordner kopiert. Eine künftige Runtime- oder Payloadversion benötigt jeweils einen neuen geprüften Pin und ein eigenes Gate.

## Ressourcen- und Zeitgrenzen

Der Payload umfasst 24.908.860 Byte und ist deutlich größer als `nogame.love`. Für das experimentelle Gate gelten 90 Sekunden im WebView und 105 Sekunden im Host. Speicherbedarf, Transferzeit und Stabilität sind **BENCHMARK ERFORDERLICH**; aus dem Boot-Gate werden keine Performanceversprechen abgeleitet.

## Aussage eines Erfolgs

`Module.postrun` für den Gen1Recomp-Payload würde ausschließlich belegen, dass der unveränderte Payload ohne gemountete Nutzerdaten unter dieser Runtime initialisiert. Es wäre noch kein Nachweis für sichtbares Launcher-Rendering, ROM-Import, Gameplay, Audio, Saves oder Wiederherstellung.

Gesamtstatus: **EXPERIMENTELL / TEILWEISE VERIFIZIERT**. `APP.runtimeEnabled` bleibt `false`.
