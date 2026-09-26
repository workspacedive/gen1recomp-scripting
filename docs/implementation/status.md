# Implementierungsstand der Scripting-App

Stand: 2026-09-26 · App-Version `0.10.9`

## Iteration 0.10.9

- **VERIFIZIERT (Gerät):** Scripting lehnt das 0.10.8-Artefakt als nicht dekomprimierbar ab.
- **VERIFIZIERT (lokal):** Info-ZIP und Python lesen alle 29 Einträge des abgelehnten Pakets einschließlich CRC-Prüfung fehlerfrei; eine lokale Beschädigung ist nicht reproduzierbar. Die konkrete Importerabweichung bleibt **TECHNISCH UNBEKANNT**.
- 0.10.9 verwendet für den äußeren `.scripting`-Transport ausschließlich ZIP STORE. Dadurch entfällt die Dekompression im Scripting-Importer; Projektinhalt und Runtime r13 bleiben identisch.
- Der reproduzierbare Pakettest verbietet jetzt komprimierte Einträge und prüft den normalize2-Adapter ausdrücklich als Pflichtdatei.
- **NICHT VERIFIZIERT:** Geräteimport des STORE-Pakets und anschließender QueueableSource-Test.
- Detailprüfung: [`conformance-audit-0.10.9.md`](../architecture/conformance-audit-0.10.9.md).

## Iteration 0.10.8

- **VERIFIZIERT (Gerät):** Audioausgabe ist grundsätzlich vorhanden, aber r12 reproduziert weiterhin `Music.lua:39` mit einem Funktionswert.
- **VERIFIZIERT (Quellprüfung):** Auch der verzögerte r12-Guard blieb Teil von `normalize1`; love.js stellt für Anpassungen nach Initialisierung optionaler Module ausdrücklich `normalize2` bereit und führt dort bereits seine upstream Audio-Normalisierung aus.
- Runtime r13 verschiebt den Guard vollständig in einen getrennt gehashten normalize2-Adapter. Der Resource-Resolver liefert ihn anstelle der unveränderten upstream Ressource genau an love.js' Post-Modul-Lebenszykluspunkt aus.
- Ein eigener ausführbarer Test prüft gültige und versetzte Source-Rückgaben sowie den ungültigen Funktionswert am normalize2-Pfad. Beide upstream Normalizer bleiben als unveränderte, gehashte Dateien erhalten.
- **NICHT VERIFIZIERT:** QueueableSource-Musik, r13-Geräteaktivierung, Saves, Lifecycle und längeres Gameplay.
- Detailprüfung: [`conformance-audit-0.10.8.md`](../architecture/conformance-audit-0.10.8.md).

## Iteration 0.10.7

- **VERIFIZIERT (Gerät):** r11 änderte den `Music.lua:39`-Fehler nicht; der QueueableSource-Guard war auf dem Gerätepfad nicht aktiv.
- **VERIFIZIERT (Quellprüfung):** r11 versuchte die Installation während `normalize1`, bevor `love.audio` als optionales LÖVE-Modul garantiert verfügbar ist. Ein ausgeführter Guard hätte den beobachteten Funktionswert nicht passieren lassen.
- Adapter r12 installiert den Guard deshalb verzögert aus dem bestehenden Require-Adapter, sobald `love.audio.newQueueableSource` existiert, aber weiterhin vor dem Laden/Benutzen von `ChipAudio`.
- Der ausführbare Lua-Test bildet die späte Audio-Modulinitialisierung nach und beweist Installation, Wiederherstellung eines späteren Source-Rückgabewerts und kontrollierte Zurückweisung des Funktionswerts.
- **NICHT VERIFIZIERT:** r12-Aktivierung auf dem Gerät, Musik/SFX, weiterer Spielfortschritt, Saves und Lifecycle.
- Detailprüfung: [`conformance-audit-0.10.7.md`](../architecture/conformance-audit-0.10.7.md).

## Iteration 0.10.6

- **VERIFIZIERT (Gerät):** 0.10.5 startet Gen1Recomp; der Gameplay-Controller erscheint und funktioniert. Der frühere Theme-Rail-Fehler blockiert den Start nicht mehr.
- **TEILWEISE VERIFIZIERT (Gerät):** Ein neuer Spielstand erreicht den Overworld-Kartenaufbau.
- **VERIFIZIERT (Gerät/Quellprüfung):** Der nächste Blocker ist ein Audio-Typbruch: `ChipAudio.playMusic` erhält von `love.audio.newQueueableSource` einen Lua-Funktionswert statt der dokumentierten Source und reicht ihn an `Music.applyVolume` weiter.
- Adapter r11 prüft die Konstruktor-Rückgabewerte an der LÖVE-Grenze, übernimmt einen tatsächlich vorhandenen Source-Wert aus einer späteren Rückgabeposition und weist andernfalls den ungültigen Runtimewert kontrolliert zurück. Payload und Runtimebytes bleiben unverändert.
- **NICHT VERIFIZIERT:** Musik/SFX, weiterer Spielfortschritt, Saves, Lifecycle und Langzeitspiel benötigen den Gerätetest mit r11.
- Detailprüfung: [`conformance-audit-0.10.6.md`](../architecture/conformance-audit-0.10.6.md).

## Iteration 0.10.5

- **VERIFIZIERT (Quellprüfung):** Der 0.10.4-Fehler `Invalid host session configuration` war eine Hostregression: ein versehentlich asynchroner Script-Message-Handler verletzte Scripting's synchronen Bridge-Rückgabevertrag.
- Runtime r10 stellt den synchronen Handler wieder her; späte Fehler werden fire-and-forget mit eigener Fehlerbehandlung persistiert. Ein Regressionstest sperrt den asynchronen Handler.
- Der ROM-/Gameplay-Modus besitzt nun einen hosteigenen Multitouch-Controller für D-Pad, A, B, START und SELECT über die unveränderten Gen1Recomp-Standardtasten.
- `nogame`, Payload-Gate und Launcher-Vorschau aktivieren den Controller nicht.
- **VERIFIZIERT (Gerät):** r10 startet das Spiel; Controllerereignisse funktionieren und der Rail-Fix passiert die frühere Fehlerstelle.
- **TEILWEISE VERIFIZIERT (Gerät):** Gameplay erreicht den Overworld-Kartenaufbau; Audio scheitert dort am in 0.10.6 adressierten Source-Typbruch. Saves und Lifecycle bleiben **NICHT VERIFIZIERT**.
- Detailprüfung: [`conformance-audit-0.10.5.md`](../architecture/conformance-audit-0.10.5.md).

## Iteration 0.10.4

- Statt weiterer unsystematischer Einzelkorrekturen wurde der vollständige gepinnte Payload statisch gegen bekannte Lua-5.1-/LuaJIT-Abweichungen geprüft.
- Adapter r9 korrigiert den exakten Fließkomma-Wrap in `Theme.versionRail` durch einen begrenzten Moduladapter mit explizitem Index-Modulo; die restliche Theme-Implementierung bleibt unverändert.
- Frühe und späte Alert-/Konsolenfehler werden auch nach `Module.postrun` dauerhaft in `Diagnostics/gen1recomp-gameplay-runtime-error.v1.json` geschrieben.
- **VERIFIZIERT (automatisiert/statisch):** Rail-Wrap, Timer, Bit, MD5, Load, Root-Cause-Erhaltung und das Inventar weiterer post-Lua-5.1-Konstrukte.
- **NICHT VERIFIZIERT:** r9, Gameplay, Eingabe, Audio, Saves und Lifecycle benötigen den nächsten Gerätetest.
- Detailprüfung: [`conformance-audit-0.10.4.md`](../architecture/conformance-audit-0.10.4.md).

## Iteration 0.10.3

- **TEILWEISE VERIFIZIERT (Gerät):** Der vorherige `Data.lua:271`-Fehler erschien nicht erneut; ein Lauf erreichte stattdessen einen allgemeinen love.js-Fensteralarm.
- **VERIFIZIERT (Gerät):** Nach Neustart zeichnete der Launcher bis `Theme.versionRail`; die statisch lückenlose Farbliste wurde mit einem ungültigen dynamischen Index angesprochen.
- Adapter r8 normalisiert nicht-endliche oder rückwärts laufende `love.timer.getTime()`-Werte und wahrt damit LÖVEs numerischen, monotonen Timervertrag.
- Der Harness übermittelt bei einem frühen `window.alert` bis zu acht begrenzte `console.error`-Zeilen über die bestehende Bridge. WASM bleibt opak.
- **NICHT VERIFIZIERT:** Timerfix, früher Fensterfehler, Gameplay, Eingabe, Audio, Saves und Lifecycle benötigen den nächsten Gerätetest.
- Detailprüfung: [`conformance-audit-0.10.3.md`](../architecture/conformance-audit-0.10.3.md).

## Iteration 0.10.2

- **VERIFIZIERT (Gerät):** Der erhaltene Root Cause ist `Data.lua:271`: Gen1Recomp benötigt Lua 5.2s `load(string, name, mode, env)`, während love.js 11.5 Lua 5.1s Reader-only-`load` bereitstellt.
- Adapter r7 ergänzt String-/Reader-Chunks, Modusprüfung und isolierte Environments über Lua 5.1 `loadstring`/`setfenv`, ohne Payload oder Runtime-Upstreams zu verändern.
- **VERIFIZIERT (automatisiert):** isolierter Text-Chunk, Reader-Chunk und geschlossene Modusabwehr sowie alle bisherigen Bit-/MD5-/Diagnosetests.
- **NICHT VERIFIZIERT:** Der neue Kompatibilitätspfad, Gameplay, Eingabe, Audio, Saves und Lifecycle benötigen den nächsten Gerätetest.
- Detailprüfung: [`conformance-audit-0.10.2.md`](../architecture/conformance-audit-0.10.2.md).

## Iteration 0.10.1

- **VERIFIZIERT (Gerät):** Der Bit-/StreamMD5-Blocker ist beim experimentellen Start beseitigt; ROM-Import und Übergabe erreichen das Gen-1-Game-Objekt.
- **NICHT VERIFIZIERT:** `Game.load` scheitert vor der StateStack-Initialisierung. Upstreams `pcall` verdeckt den Root Cause, worauf der erste Draw nur `Game.stack == nil` meldet.
- Adapter r6 bewahrt ausschließlich im Fehlerfall den ursprünglichen `Game.load`-Traceback für den nächsten Gerätetest; erfolgreiches Laden und Zeichnen bleiben unverändert.
- Detailprüfung: [`conformance-audit-0.10.1.md`](../architecture/conformance-audit-0.10.1.md).

## Iteration 0.10.0

- **VERIFIZIERT (automatisiert):** Runtime `lovejs-11.5-r5` ersetzt nur die gebridgte Normalisierungsressource durch einen separat gehashten Host-Adapter. Upstream love.js, WASM, Player, Normalisierung und Gen1Recomp bleiben unverändert.
- **VERIFIZIERT (automatisiert):** Die reine-Lua-Implementierung erfüllt die von Gen1Recomp verwendeten Bitoperationen; unverändertes upstream `StreamMD5.lua` besteht drei bekannte MD5-Vektoren.
- **VERIFIZIERT (statisch):** Ein experimenteller Spielstart revalidiert genau einen erkannten Library-ROM nach Länge, SHA-256 und SHA-1, überträgt ihn schreibgeschützt und aktiviert ausschließlich Gen1Recomps offiziellen `POKEPORT_IMPORT_ROM`-Pfad.
- **NICHT VERIFIZIERT:** Launcher r5, ROM-Import, Gameplay, Eingabe, Audio, Saves und Lifecycle benötigen den echten Gerätetest. Die App bezeichnet diesen Weg ausdrücklich als experimentell.
- Detailprüfung: [`conformance-audit-0.10.0.md`](../architecture/conformance-audit-0.10.0.md).

## Iteration 0.9.0

Drei aufeinanderfolgende Schritte wurden umgesetzt:

1. **Begrenztes Payload-Staging:** Der Netzwerkabruf besitzt zusätzlich zum Request-Timeout ein dokumentiertes `AbortSignal.timeout(180_000)`. Vor Download, Response-Lesen, Größen-/Hashprüfung, ZIP-Preflight, Metadatenprüfung, Schreiben, zweitem Hash und atomarer Publikation wird `Diagnostics/payload-stage-progress.v1.json` aktualisiert. Die UI zeigt dieselbe Phase; ein Hänger ist damit zeitlich begrenzt oder nach Prozessabbruch lokalisierbar.
2. **Payload-Boot-Gate:** Der in 0.8.0 ergänzte, erneut größen-/SHA-256-geprüfte Bridge-Boot bleibt separat verfügbar und schreibt `gen1recomp-payload-boot.v1.json`. Er mountet weiterhin keine ROMs, Mods oder Saves.
3. **Sichtbare Launcher-Vorschau:** Nach demselben fail-closed Payload-Boot kann exakt dieselbe WebView über die dokumentierte `WebViewController.present`-API fullscreen angezeigt werden. Der Bericht wird vor Darstellung gespeichert; beim Schließen wird die WebView entsorgt. Die Vorschau aktiviert keinen Core und besitzt noch keinen ROM-/Save-Bridgepfad.

Status: **EXPERIMENTELL / TEILWEISE VERIFIZIERT** — love.js/nogame ist geräteverifiziert. Begrenztes Staging, Payload-Boot und sichtbare Vorschau benötigen den neuen Gerätelauf.

## Iteration 0.8.0

- **Gerätebefund 0.7.0:** Kandidat `lovejs-11.5-r3` übertrug sämtliche Runtimepakete über `gen1HostBridge` und erreichte mit `nogame.love` eindeutig `Module.postrun`. Meilensteine `bridge.ready → resources.ready → player.loaded → runtime.ready`, Canvas 300×150, WASM- und IndexedDB-Präsenz wurden gemeldet. Das love.js-`nogame`-Boot-Gate ist damit **VERIFIZIERT** auf dem realen Gerät; es beweist weiterhin kein Gameplay.
- Adapter r4 fordert seine Bootkonfiguration über `session.config` an. Derselbe gehashte Harness kann dadurch entweder das verifizierte `nogame`-Gate oder ein strikt getrenntes Gen1Recomp-Payload-Gate ausführen, ohne upstream Player oder Payload zu verändern.
- Der bereits gespeicherte Payload 0.3.20 wird vor jedem Test erneut auf Bytezahl und SHA-256 geprüft und anschließend als opake Ressource `payload/gen1recomp-0.3.20.love` über die allowlistete 128-KiB-Bridge transportiert.
- Das neue Diagnose-Gate mountet keine ROM, Mods oder Saves und erzeugt keinen aktiven Runtime-/Payloadpointer. Es prüft ausschließlich, ob der unveränderte Payload ohne Nutzerdaten bis `Module.postrun` initialisiert.
- Wegen 24.908.860 Payloadbytes gelten getrennte 90-/105-Sekunden Runtime-/Host-Watchdogs. Der Bericht landet in `Diagnostics/gen1recomp-payload-boot.v1.json` und kennzeichnet `probe`, `payloadVersion`, Phase und Meilensteine.
- Kandidat `lovejs-11.5-r4` wird seitlich neben r1–r3 installiert. Die updategebundene Runtime und der separat versionierte Payload bleiben unabhängig austauschbar und inaktiv.

Status: **EXPERIMENTELL / TEILWEISE VERIFIZIERT** — love.js-Boot und Resource-Bridge sind geräteverifiziert. Der erste unveränderte Gen1Recomp-Payload-Boot über die Bridge steht aus.

## Iteration 0.7.0

- **Gerätebefund 0.6.0:** `gen1HostBridge` selbst funktioniert (`bridge.ready`). Der lokale Browser-`fetch` scheiterte dagegen bereits beim Adapter-Preflight mit `TypeError: Load failed`; `resources.error` wurde korrekt über die Bridge zurückgemeldet. Ursache ist damit **VERIFIZIERT** auf lokale `file:`-Fetches eingegrenzt, bevor love.js oder WASM ausgeführt wurden.
- Adapter r3 installiert einen eng allowlisteten Resource-Bridge-Pfad für exakt `nogame.love`, beide Normalizer und `11.5/love.wasm`. Andere Pfade, negative/unganzzahlige Offsets, leere oder über 128 KiB große Anforderungen werden abgelehnt.
- Der Host liest die zuvor vollständig gehashten Kandidatendateien als opake Daten, liefert ausschließlich angeforderte Bereiche als Base64-Antwort und gibt weder Dateisystempfade noch beliebigen Dateizugriff an die WebView frei.
- Der Harness ersetzt `fetch` nur für diese vier exakten Runtimepfade. Er setzt die geordneten 128-KiB-Teile wieder zusammen, cached sie im WebView-Speicher und liefert dem unveränderten upstream Player normale erfolgreiche `Response`-Objekte. `player.js` und `love.js` bleiben byteidentisch.
- Der Host interpretiert oder instanziiert WASM weiterhin nicht, ruft keine Exporte auf und greift nicht auf linearen Speicher zu. WASM wird als opaker, updategebundener Runtimebestand über die Bridge transportiert; ausschließlich upstream love.js/Emscripten besitzt die interne Instanziierung.
- Kandidat `lovejs-11.5-r3` wird mit Adapterversion 3 seitlich neben r1/r2 installiert und überschreibt keine frühere Version. Es bleibt ohne aktiven Pointer.

Status: **EXPERIMENTELL / TEILWEISE VERIFIZIERT** — Ursache des r2-Fehlers und Bridge-Erreichbarkeit sind geräteverifiziert; Chunk-Protokoll, Allowlist und Bytepins sind reproduzierbar getestet. Der r3-Transfer-/Boot-Test steht aus.

## Iteration 0.6.0

- **Gerätebefund 0.5.1:** `loadFile` und `waitForLoad` wurden abgeschlossen; der 40-Sekunden-Watchdog endete in `runtime-event`. Es kam kein einziges altes Terminalereignis an. Damit ist der Fehler auf die undifferenzierte WebView-/Playerstrecke eingegrenzt, aber noch nicht auf Ressourcenladen, Bridge oder Runtimeinitialisierung.
- Der Adapter r2 verwendet jetzt das explizit versionierte Protokoll `gen1HostBridge` v1. Er sendet getrennte Meilensteine für Bridge-Handshake, lesbare Adapterressourcen, zurückgekehrtes `player.js` und `Module.postrun`; Fehler und Timeouts bleiben terminal.
- Der Harness prüft `.love`, Normalizer und `love.js` vorab, greift aber gemäß der neuen Richtlinie **nicht** auf `love.wasm` zu. Ausschließlich der unveränderte upstream love.js-/Emscripten-Loader lädt und instanziiert sein eigenes WASM. Der Scripting-Host ruft keine Exporte auf, inspiziert keinen WASM-Speicher und patcht keine Runtimebytes.
- Capability-Probe v3 prüft nur noch die Präsenz der Browser-WASM-API. Die frühere synthetische direkte Validierung/Instanziierung und SIMD-Probe ist entfernt und als historischer Gerätebefund dokumentiert, nicht als Aktivierungsgate.
- Runtime `lovejs-11.5-r2` wird seitlich neben r1 installiert. Manifest und UI führen Adapterversion, Bridgeprotokoll, Vorgänger und die Richtlinie `reviewed-side-by-side-candidate`; vorhandene Runtimeversionen werden weder überschrieben noch automatisch aktiviert.
- Der Endbericht enthält die erreichten `milestones` und eine feinere `stage`. Gen1Recomp, Saves, Mods und Nutzerdaten bleiben unberührt; `runtimeEnabled` bleibt `false`.

Status: **EXPERIMENTELL / TEILWEISE VERIFIZIERT** — Bridgevertrag, Bytepins, Update-Trennung und das Verbot direkter Host-WASM-Interaktion sind statisch getestet. Der r2-Gerätelauf steht aus.

## Iteration 0.5.1

- **Gerätebefund:** Capability-Probe v2 schrieb einen vollständigen Bericht, der lokales JavaScript, WebAssembly-Validierung/-Instanziierung einschließlich SIMD, WebGL 1/2 mit Readback, WebAudio-Konstruktion, IndexedDB-API, Touch und Gamepad-API bestätigt. `crossOriginIsolated` und `SharedArrayBuffer` sind auf diesem Gerät nicht verfügbar. Dieser Bericht ist **VERIFIZIERT**, aber ausdrücklich keine Runtime-Zertifizierung.
- Der anschließend gestartete love.js-Test kehrte nicht zur UI zurück und erzeugte keinen `lovejs-boot.v1.json`. Deshalb ist noch **TECHNISCH UNBEKANNT**, ob er in `loadFile`, `waitForLoad`, beim Runtime-Event oder durch einen blockierten WebContent-Prozess hing.
- 0.5.1 ergänzt einen hostseitigen, vom WebView-Harness unabhängigen 40-Sekunden-Watchdog um die gesamte Lade-/Eventkette. Somit hängt die Aktion auch dann nicht unbegrenzt, wenn WebView-JavaScript oder dessen Timer blockiert.
- Während des Tests wird `Diagnostics/lovejs-boot-progress.v1.json` vor jeder Await-Phase geschrieben (`load-file`, `wait-for-load`, `runtime-event`). Bei regulärem Abschluss wird er durch den autoritativen Endbericht ersetzt und entfernt.
- Fehler und Host-Timeout werden jetzt ebenfalls als `lovejs-boot.v1.json` gespeichert; dessen `stage` lokalisiert die blockierende Phase. Gameplay bleibt unverändert gesperrt.

Status: **EXPERIMENTELL** — die Endlosschleife ist fail-closed begrenzt; die konkrete Blockierphase benötigt den erneuten Gerätetest.

## Iteration 0.5.0

- Der offizielle love.js-/LÖVE-11.5-Bestand aus Revision `9355186de22db13bd88bf2a0db75d2925647d036` ist reproduzierbar eingebettet: unverändertes `player.js`, `love.js`, `love.wasm`, `nogame.love`, beide Normalizer und Lizenzdatei.
- `runtime-manifest.ts` bindet jede der acht Dateien einschließlich des separaten Host-Harness an SHA-256. Installation erfolgt aus `Script.directory` über `Transactions/runtime-lovejs-11.5-r1` nach `Cores/runtimes/lovejs-11.5-r1`; Quell- und Zielkopie werden vollständig gehasht.
- Ein unvollständiges Transaktionsverzeichnis wird beim Start entfernt. Vor jedem Boot werden alle Kandidatendateien erneut geprüft; vorhandene unbekannte Zielordner werden nie überschrieben.
- Der Host-Harness nutzt ausschließlich den dokumentierten lokalen `WebViewController.loadFile`-Pfad und einen einzigen `runtimeEvent`-Message-Handler. Der upstream Player wird nicht gepatcht und der Gen1Recomp-Payload wird weder kopiert noch gemountet, ausgewertet oder gestartet.
- Das Boot-Gate startet ausschließlich das offizielle `nogame.love`, wartet höchstens 30 Sekunden auf den durch `Module.postrun` sichtbaren Player-Zustand und speichert einen datensparsamen Bericht in `Diagnostics/lovejs-boot.v1.json`.
- `APP.runtimeEnabled` bleibt `false`; ein erfolgreiches `nogame`-Boot beweist ausdrücklich weder Gameplay noch Audio, Saves, Lifecycle oder Kompatibilität des Gen1Recomp-Payloads.

Status: **EXPERIMENTELL / TEILWEISE VERIFIZIERT** — Provenienz, Byteinventar, Trennung, Transaktion und Sperren sind statisch/reproduzierbar geprüft. Ob WKWebView lokale Fetches von `.love`, Lua und WASM in genau diesem `loadFile`-Kontext zulässt und `postrun` erreicht, muss der echte Gerätetest zeigen.

## Iteration 0.4.0

- Der durch den Gerätetest bestätigte Free-Tier-Modimport ist jetzt als **VERIFIZIERT** dokumentiert.
- Einstellungen können nach einer expliziten Release-Metadatenprüfung den exakt im Projekt gepinnten Gen1Recomp-Payload 0.3.20 herunterladen und ausschließlich als inaktiven Kandidaten speichern.
- Vor Publikation werden feste URL/Version/Dateiname/Bytezahl/SHA-256, erlaubter finaler GitHub-Host, vollständige ZIP-Struktur sowie `src/core/Version.lua` geprüft. Kandidaten-Lua wird nie ausgeführt.
- `engine`, `payloadHost` und `minShell` werden als Literale gelesen und gegen den eingebauten Vertrauenspin gegatet. Download, zweite Hashprüfung und content-separierte Publikation erfolgen in `Transactions` beziehungsweise `Cores/payloads/0.3.20`.
- Unterbrochene Payload-Transaktionen werden beim nächsten Appstart verworfen. Ein vorhandener Kandidat wird vor Wiederverwendung erneut gehasht.
- Es gibt weiterhin keinen aktiven Core-Pointer und keinen Startpfad: Der Kandidat bleibt `stored-runtime-gated`, bis love.js und sämtliche Geräte-Gates bestanden sind.

Status: **TEILWEISE VERIFIZIERT** — Vertrauens-, Parsing-, Staging- und Aktivierungssperren sind statisch beziehungsweise durch Tests belegt; der Binärdownload und die Ablage benötigen den echten Gerätetest.


## Iteration 0.3.3

- **Gerätebefund:** Die vollständig Free-Tier-kompatible Eigenextraktion erreichte die Manifestprüfung; die alte Sammelmeldung konnte dort entweder ein fehlendes ZIP-Record oder die zusätzliche Host-`stat().type === "file"`-Annahme für `main.lua` bedeuten. Die Quellprüfung identifizierte diese Host-Typannahme als unnötige Abweichung vom upstream Vertrag.
- Der Check folgt jetzt wieder dem upstream Gen1Recomp-Vertrag: `entry` muss im Manifest ausdrücklich vorhanden und ein sicherer relativer Pfad sein. Das dazugehörige, bereits zentral/lokal/CRC-geprüfte ZIP-Record muss eine Datei sein und das geschriebene Transaktionsziel muss existieren.
- Damit hängt die Freigabe nicht mehr von einer möglicherweise hostversionsabhängigen `FileStat.type`-Zeichenfolge ab. Fehlermeldungen unterscheiden nun „fehlt im ZIP/ist Ordner“ von „geprüft, aber nicht geschrieben“.
- Der zuvor erfundene Fallback auf `main.lua` bei fehlendem `entry` wurde entfernt; offizielles Gen1Recomp verlangt `manifest.entry`.

Status: **TEILWEISE VERIFIZIERT** — der Gerätebefund ist lokalisiert und der Check an upstream angepasst; der konkrete Import benötigt die erneute Gerätebestätigung.


## Iteration 0.3.2

- **Gerätebefund:** Scripting klassifiziert die verwendete `Archive`-API als PRO. Diese API und alle `FileManager.zip/unzip`-Wege wurden vollständig aus dem Produktcode und dem Hostvertrag entfernt.
- ZIP-Lesen und -Entpacken ist jetzt vollständig im Projekt implementiert: EOCD/Zentralverzeichnis, lokale Header, Stored-Einträge, RFC-1951-DEFLATE (ungepackte, feste und dynamische Huffman-Blöcke), Daten-Deskriptoren, Größenprüfung und CRC-32.
- Zentrale und lokale Dateinamen, Flags, Kompressionsmethoden, Größen und CRC müssen übereinstimmen. Jeder Eintrag wird weiterhin nur an einen vorab normalisierten Zielpfad geschrieben.
- Der Free-Tier-Regressionstest sperrt nun dauerhaft `Archive.openForMode`, 7z-Archive sowie `FileManager.zip/unzip` zusätzlich zu `BackgroundKeeper`.
- Standardvektor-CRC, dynamisches/festes/leeres DEFLATE, Stored-/Deflate-/Descriptor-ZIPs und widersprüchliche lokale Header sind getestet.

Status: **TEILWEISE VERIFIZIERT** — die Eigenimplementierung besteht reproduzierbare Tests und benötigt keine bekannte PRO-API; der konkrete Modimport muss erneut auf dem Gerät bestätigt werden.


## Iteration 0.3.1

> Historischer Zwischenstand: Die dort ergänzte `Archive.entries()`-Querprüfung erwies sich auf dem Gerät als PRO-pflichtig und ist in 0.3.2 vollständig entfernt.

- Reagiert auf den auf dem echten Gerät bestätigten Mod-Import-Abbruch: Die bisher zusammengefasste Meldung deutete entweder auf das zu knappe 4.096-Eintragslimit oder beschädigte Verzeichnisgrenzen. Das sichere Limit steigt auf 32.768; beide Ursachen haben jetzt getrennte Meldungen.
- Trennt die Fehlermeldungen für Eintragslimit und beschädigte Zentralverzeichnisgrenzen, damit weitere Gerätebefunde eindeutig sind.
- Liest ein Modarchiv nur noch einmal als `Data` und verwendet dieselben Bytes für SHA-256 und ZIP-Preflight; dadurch entfällt eine zweite vollständige Dateilesung.
- Ergänzt ein 200:1-Entpackverhältnis-Limit und gleicht komprimierte wie entpackte Größen zusätzlich mit Scripting `Archive.entries()` ab.
- Regressionstests decken mehr als 4.096 Einträge und Dekompressionsbomben ab.
- Mod-Importfehler nennen jetzt die genaue Phase und schreiben einen datensparsamen Bericht nach `Diagnostics/mod-import-last-failure.v1.json`; Diagnosefehler können den ursprünglichen Importfehler nicht mehr verdecken.
- Nach erfolgreicher Index-Publikation gilt fehlgeschlagene temporäre Bereinigung nicht mehr fälschlich als fehlgeschlagene Installation; die Start-Recovery übernimmt den Rest.

Status: **TEILWEISE VERIFIZIERT** — der ursprüngliche Fehler ist durch Gerätefeedback belegt; der frühere Grenzwert und die neue Annahme von mehr als 4.096 Einträgen sind reproduzierbar getestet. Ob genau dieser Grenzwert das konkrete ZIP blockierte, zeigt erst der erneute Geräteimport beziehungsweise die nun eindeutige Meldung.


## Iteration 0.3.0

- Vier dokumentationskonforme Bottom-Tabs: Spiele, Mods, Diagnose und Einstellungen, jeweils mit eigenem `NavigationStack`.
- Lokaler Mod-ZIP-Import mit Central-Directory-Preflight, Größenlimits, Symlink-/Traversal-/Duplikat-Sperren, Manifest-Basiskontrolle, SHA-256 und unveränderlichem `id/version/hash`-Speicher. Pakete werden ausdrücklich noch nicht aktiviert.
- Sichtbares Komponenten-Inventar für Scripting-Shell, Gen1Recomp-Payload und love.js; die Release-Prüfung ist nutzerinitiiert und nur lesend.
- Update- und Rollback-Architektur sowie eine explizite Konformitätsprüfung liegen unter `docs/architecture/`.
- Runtime und Netzwerk-Aktivierung bleiben deaktiviert, bis die dokumentierten Geräte-Gates bestanden sind.

Status: **TEILWEISE VERIFIZIERT** — Quellcode/Tests bestanden und die Bottom-Tabs starten auf dem echten Gerät; der erste Mod-ZIP-Test meldete den inzwischen getrennt behandelten Eintragslimit-/Zentralverzeichnisfehler.


## Implementiert

| Bereich | Implementierung | Evidenzstatus |
|---|---|---|
| Sichtbarer Root | `Documents/Gen1Recomp` mit Library, Cores, Profiles, Saves, Mods, Generated, Cache, Transactions, Diagnostics, Recovery, Inbox und Exports | VERIFIZIERT gegen dokumentierte freie FileManager-API; Gerätetest ausstehend |
| Content-Import | Picker → Größenprüfung → SHA-1/SHA-256 → Stage → erneuter SHA-256 → Publish → Index | implementiert; Gerätetest ausstehend |
| Import-Recovery | persistentes `import-pending.v1.json`; veröffentlichten Content in Index übernehmen oder unpubliziertes Stage verwerfen | implementiert und zustandsweise geprüft; Kill-Test ausstehend |
| Content-Identität | kanonische US-Hashes für Red, Blue, Yellow aus upstream v0.3.18; unbekannter Inhalt wird nicht als kompatibel markiert | VERIFIZIERT / Unit-Test |
| Content Store | `Library/content/<sha256>/original.gb|original.bin` plus `content.json` | implementiert |
| Library-Index | validiertes Schema, `.tmp`, `.bak`, Restore bei beschädigtem/fehlendem Primärindex; 0.1-Einträge werden aus dem gespeicherten Original neu erkannt und verlustfrei ergänzt | implementiert |
| Capability-Probe v3 | lokales `loadFile` mit relativer JS-Subresource, reine WASM-API-Präsenz ohne direkte Validierung/Instanziierung, WebGL-Readback, AudioContext-Konstruktion, Worker/SAB/Isolation/OffscreenCanvas, IndexedDB-/Gamepad-/Touch-API | BRIDGE-RICHTLINIE VERIFIZIERT; keine Runtime-Zertifizierung |
| Runtime-Gate | maschinenlesbare Blockiergründe; Start bleibt aus | VERIFIZIERT im Buildgraph |
| Free Tier | keine bekannte Pro-API; `BackgroundKeeper`-Scan | VERIFIZIERT statisch |
| Gepinnter love.js-Kandidat | offizieller LÖVE-11.5-Bestand, acht SHA-256-gebundene Dateien, transaktionale Installation und vollständige Revalidierung vor Boot | TEILWEISE VERIFIZIERT; Geräte-Boot ausstehend |
| Runtime-Bridge | `gen1HostBridge` v1 mit Meilensteinen, Sessionkonfiguration und allowlistetem 128-KiB-Ressourcentransport; upstream Runtime und Gen1Recomp bleiben unverändert | love.js/nogame VERIFIZIERT; Payload-Gate EXPERIMENTELL |
| Buildprüfung | Node strict typecheck, enger dokumentationsbasierter Scripting-Hostvertrag, Global-vs-Modul-Grenzcheck, TSX-Bundlegraph, 35 Tests | VERIFIZIERT lokal |
| Testpaket | deterministisches ZIP mit `.scripting`-Endung, `script.json` im Root, Integritätstest und SHA-256-Sidecar | VERIFIZIERT; `npm run check` erkennt ein fehlendes oder veraltetes Paket |

## Verifizierter Gerätebefund

Version 0.2.1 importierte irrtümlich globale Host-APIs aus dem Modul `scripting`. Die echte App meldete deshalb `DocumentPicker` als fehlenden Export; das importierte `FileManager` war zur Laufzeit `undefined`. Version 0.2.2 entfernt diese Imports. Offizielle Beispiele bestätigen die Trennung: UI-/React-Symbole kommen aus `scripting`, während `DocumentPicker`, `FileManager`, `Crypto` und `WebViewController` globale Hostobjekte sind. Der Buildcheck blockiert diese fehlerhafte Importform nun dauerhaft.

Status: **VERIFIZIERT durch realen Gerätelauf und offizielle Beispiele; in 0.2.2 behoben.**

## Bewusst blockiert

Ein Start-Button wird erst freigeschaltet, wenn **alle** folgenden Artefakte/Tests vorhanden sind:

1. Gerätebestätigung des reproduzierbaren, gepinnten love.js-11.5-Kandidaten;
2. `loadFile`-/Read-Access-Test für dessen lokale `.love`-/Lua-/WASM-Subresources;
3. love.js-`nogame`-Boot bis zum eindeutigen `postrun`-Handshake;
4. WebAudio-Funktion nach User-Gesture sowie Aussetzer-/Lifecycle-Test;
5. VFS-Save → sichtbarer Host-Commit mit Generation, Hash und ACK;
6. Relaunch-, App-Kill- und WebContent-Kill-Recovery;
7. Golden-Parität für Start, Bewegung, Map, Battle, Save/Load;
8. reale Memory-/Frame-/Startzeit-Messungen auf mindestens zwei Geräteklassen.

`config.ts` hält `runtimeEnabled: false`. Ein Capability-API-Häkchen allein darf dieses Flag nicht ändern.

## Nächster implementierbarer Schritt

0.9.0 muss zuerst das begrenzte Payload-Staging abschließen. Danach folgen **Gen1Recomp-Payload Boot testen** und bei Erfolg **Launcher-Vorschau öffnen**. Erst ein bestätigter sichtbarer Launcher erlaubt die nächste getrennte Stufe: einen einzelnen verifizierten Library-ROM-Datensatz über eine neue, schreibgeschützte Import-Bridge bereitzustellen. Erst wenn `Diagnostics/lovejs-boot.v1.json` den Status `ready` meldet, darf der nächste Adapter den bereits separat und unveränderlich gestagten Gen1Recomp-0.3.20-Payload als lokales love.js-Paket zuführen. Auch dieser Schritt bleibt ein Diagnose-Gate ohne Spielstart in „Spiele“; Audio, Save-Bridge und Lifecycle werden danach einzeln geprüft.
