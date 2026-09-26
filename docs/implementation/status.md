# Implementierungsstand der Scripting-App

Stand: 2026-09-26 · App-Version `0.5.1`

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
| Capability-Probe v2 | dokumentiertes lokales `loadFile` mit relativer JS-Subresource, WASM validate/instantiate, SIMD, WebGL context+Readback, AudioContext-Konstruktion, Worker/SAB/Isolation/OffscreenCanvas, IndexedDB-/Gamepad-/Touch-API, Umgebung | PROBE, keine Runtime-Zertifizierung; konkrete WASM/Data-Subresource ausstehend |
| Runtime-Gate | maschinenlesbare Blockiergründe; Start bleibt aus | VERIFIZIERT im Buildgraph |
| Free Tier | keine bekannte Pro-API; `BackgroundKeeper`-Scan | VERIFIZIERT statisch |
| Gepinnter love.js-Kandidat | offizieller LÖVE-11.5-Bestand, acht SHA-256-gebundene Dateien, transaktionale Installation und vollständige Revalidierung vor Boot | TEILWEISE VERIFIZIERT; Geräte-Boot ausstehend |
| Runtime-Bridge | separater lokaler HTML-Harness + ein dokumentierter `runtimeEvent`-Handler; upstream Runtime und Gen1Recomp bleiben unverändert | EXPERIMENTELL; Geräte-Boot ausstehend |
| Buildprüfung | Node strict typecheck, enger dokumentationsbasierter Scripting-Hostvertrag, Global-vs-Modul-Grenzcheck, TSX-Bundlegraph, 30 Tests | VERIFIZIERT lokal |
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

0.5.1 muss auf einem echten Gerät über **Diagnose → Runtime installieren und Boot testen** erneut ausgeführt werden. Erst wenn `Diagnostics/lovejs-boot.v1.json` den Status `ready` meldet, darf der nächste Adapter den bereits separat und unveränderlich gestagten Gen1Recomp-0.3.20-Payload als lokales love.js-Paket zuführen. Auch dieser Schritt bleibt ein Diagnose-Gate ohne Spielstart in „Spiele“; Audio, Save-Bridge und Lifecycle werden danach einzeln geprüft.
