# Statische APK-Analyse — Gen1Recomp 0.3.18 Android

Stand: 2026-09-26. Analysiertes Artefakt: vom Nutzer bereitgestelltes Multipart-ZIP mit `gen1recomp-0.3.18-android.apk`.

> **Sicherheitsgrenze:** Die APK und ihr Code wurden nicht ausgeführt. Alle Aussagen dieses Dokuments beruhen auf Hashing, ZIP-Extraktion, Manifest-/DEX-/Signatur-/ELF-Parsing und einem dateiweiten Vergleich mit dem offiziellen Source-Tag. Laufzeitverhalten ist dadurch nicht bewiesen.

## 1. Chain of custody und Identität

| Stufe | Bytes | SHA-256 | Ergebnis |
|---|---:|---|---|
| `ezyZip.z01` | 20.000.000 | `0b41ba650fdb5a2d273b995b8fff206f7698dc4309b99cbf926255d830a5cd9b` | VERIFIZIERT |
| `ezyZip 2.zip` | 19.739.448 | `0c1cff22700f6582b4c746e703d485d79805463e68b6426d749d28359aabc30e` | VERIFIZIERT |
| zusammengeführtes ZIP | 39.739.428 | `ea9753dc9461ffa6a0658c199bccae601ee3e16e0b605aa83e68c8813b560bf5` | VERIFIZIERT; `unzip -t` ohne Fehler |
| enthaltene APK | 40.036.414 | `1314d5a7dccc6aed29b5a9e27d356fa81eb9014f5c5eb7522fdc70293e02fd88` | **VERIFIZIERT; bytegleich zu den offiziellen GitHub-Release-Metadaten** |
| `assets/game.love` | 24.867.336 | `8aa8bdf1170de4c55de3f58293f7146113f21fcae66641fa2401c91f6027a7e7` | VERIFIZIERT |

Das äußere Archiv enthält genau eine Datei. `unzip -t` meldet für zusammengeführtes ZIP, APK und `game.love` jeweils keine Fehler. Die APK enthält 450 ZIP-Einträge, 59.363.016 Bytes unkomprimiert und 39.978.561 Bytes komprimiert. APK-Eintragszeiten sind auf `1981-01-01` normalisiert; die innere `game.love` bewahrt Quellzeitstempel. Zeitstempel sind keine Provenienzbelege.

Rekonstruktion, ohne Code auszuführen:

```bash
cp 'ezyZip 2.zip' /tmp/apk-upload/ezyZip.zip
cd /tmp/apk-upload
zip -s 0 ezyZip.zip --out /tmp/apk-analysis/merged.zip
unzip -t /tmp/apk-analysis/merged.zip
unzip -q /tmp/apk-analysis/merged.zip -d /tmp/apk-analysis/extracted
sha256sum /tmp/apk-analysis/extracted/gen1recomp-0.3.18-android.apk
unzip -q /tmp/apk-analysis/extracted/gen1recomp-0.3.18-android.apk \
  -d /tmp/apk-analysis/apk
unzip -q /tmp/apk-analysis/apk/assets/game.love -d /tmp/apk-analysis/game
```

## 2. Manifest und Paketoberfläche

**VERIFIZIERT aus dem binären AndroidManifest:**

- Paket `com.theboisclub.pokemonred`, Label `gen1recomp`, Version `0.3.18`, `versionCode=3018`.
- `minSdk=19`, `targetSdk=36`, `compileSdk=36`; `maxSdk` ist nicht gesetzt.
- OpenGL ES 2.0 ist deklariert. Touchscreen, Bluetooth, Gamepad, USB-Host, PC-Gerätetyp, Low-Latency-/Pro-Audio und Accelerometer sind optional.
- Berechtigungen: `VIBRATE`, legacy `BLUETOOTH`, `INTERNET`, `REQUEST_INSTALL_PACKAGES`, `ACTIVITY_RECOGNITION` sowie AndroidX' paketinterne `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`.
- `android:allowBackup="true"`, `extractNativeLibs="true"`, nicht resizebar; Querformat/Sensor-Landscape (`screenOrientation=13`).
- Exportiert ist nur die Launcher-`GameActivity`. Sie akzeptiert browsable URIs ausschließlich auf Manifestebene als `gen1recomp++://launch…` und USB-Attach-Intents.
- `GameActivity$SecondaryActivity`, AndroidX `InitializationProvider` und `FileProvider` sind nicht exportiert. Es gibt keine Services und keine statisch registrierten Receiver.
- Der `FileProvider` hat die Authority `com.theboisclub.pokemonred.full_update_provider`; der getaggte Quellpfad begrenzt ihn auf Cache-Unterpfad `full-update/`.

**Architekturfolge:** Android-Permissions sind keine Anforderungen an Scripting iOS. Der Zielhost übernimmt nur benötigte Fähigkeiten hinter Ports. Insbesondere wird der Android-Selbstinstaller (`REQUEST_INSTALL_PACKAGES`) nicht portiert; Scripting aktualisiert ausschließlich immutable Core-Payloads mit Verify/Stage/Healthcheck/Rollback. Deep Links bleiben standardmäßig deaktiviert, bis Scripting eine dokumentierte, validierbare Eingangs-API bietet.

## 3. Signatur

**VERIFIZIERT:** APK Signature Scheme v1 und v2 sind vorhanden; v3 ist nicht vorhanden. Beide ausgelesenen Signaturinformationen führen auf dasselbe selbstsignierte Zertifikat:

- Subject/Issuer: `CN=Android Debug, O=Android, C=US`
- Seriennummer: `1`
- Gültig: 2023-06-29 20:03:29 UTC bis 2053-06-21 20:03:29 UTC
- Zertifikat-SHA-256: `533ca935ab53dd87a1575dc53e744fdda8c8b68ede803d97d764ee4f3f01fa27`

**Risiko, VERIFIZIERT:** Ein offizielles Release-Artefakt ist mit einer Android-Debug-Identität signiert. Die Signatur schützt die Paketbytes gegen nachträgliche Änderung, begründet aber kein belastbares Publisher-Vertrauen. Sie ist außerdem ein Update-/Distributionsrisiko: Android akzeptiert In-place-Updates nur mit kompatibler Signieridentität. Für Scripting darf diese Identität deshalb **nicht** als Trust Anchor dienen. Der Ziel-Core benötigt unabhängige Manifest-/Artifact-Hashes und vor einer Aussage „signiert/vertraut“ eine eigene Schlüssel-, Rotation- und Revocation-Policy.

## 4. DEX und native Host-Bridges

**VERIFIZIERT:** Eine DEX-Datei enthält 1.097 Klassen und 8.594 Methoden. R8/Minification hat interne Namen verkürzt, die mit `@Keep` erhaltenen Hostmethoden sind aber sichtbar. Unter anderem sind binär vorhanden:

- Datei: `showFilePicker`, `showCreateDocument`, `exportImageToGallery`;
- Lifecycle/Start: `restartApp`, Launch-URI-/Game-Intent-Pfade;
- Netzwerk: `httpDownload`, `httpPost`, `httpRequest`, `tlsOpen/Send/Receive/Status/Close`;
- Update: `installApk`;
- Plattform: `syncHealthSteps`, App Shortcuts, Vibration;
- Display: Secondary-Display-Erkennung, -Frameausgabe und -Touch.

DEX-Literale bestätigen zusätzlich HTTPS-only-Fehlerpfade, maximal fünf Redirect-Hops im getaggten Java-Quellpfad, einen 4-MiB-Response-Deckel für `httpRequest`, `.part`/Staging-Namen, Picker-Zieldateien, Step-Pending-Dateien und das APK-Namensschema. Das belegt die vorhandenen Binärpfade, **nicht** deren korrekte Funktion auf jedem Gerät.

Der getaggte Source implementiert Picker-Ziele mit Kanonisierung unter dem LÖVE-Save-Root, staged Update-APK im begrenzten Provider-Cache, verlangt HTTPS in den Java-HTTP-Bridges und schreibt Step-Übergaben zunächst als temporäre Datei. Da keine reproduzierbare DEX-Neukompilation verglichen wurde, ist die Source-zu-DEX-Zuordnung hierfür **TEILWEISE VERIFIZIERT**: Methodensignaturen und charakteristische Literale stimmen überein, Kontrollfluss wurde statisch stichprobenartig geprüft.

**Portierungsfolge:** Diese Funktionen werden nicht als neue Core-APIs dupliziert. `HostShell`/LÖVE-Aufrufe werden auf Scripting-Ports gemappt, unsupported Funktionen liefern explizite Capability-Fehler. APK-Installation, Activity Recognition, Secondary Display und Raw TLS sind nicht Bestandteil von P0.

## 5. Native Bibliotheken

**VERIFIZIERT:** Genau zwei ABIs sind enthalten: `arm64-v8a` und `armeabi-v7a`. Beide enthalten:

- `liblove.so`
- `librashader_bridge.so`
- `libopenal.so`
- `libmpg123.so`
- `libc++_shared.so`

`readelf` erkennt ELF-Binaries der jeweiligen Architektur. `liblove`, OpenAL, mpg123 und libc++ besitzen GNU Build IDs; `librashader_bridge.so` zeigt in der geprüften Note-Ausgabe keine Build ID. Das Android-Binary ist somit ein nativer LÖVE/OpenAL/mpg123-Host mit Shader-Bridge, kein WASM-Artefakt. Diese `.so`-Dateien sind auf iOS/Scripting nicht verwendbar und beweisen keine love.js-Kompatibilität.

## 6. Eingebetteter Core und Source-Abgleich

Die extrahierte `game.love` enthält 1.150 Dateien (47.609.174 Bytes als extrahierter Verzeichnisbaum): 1.072 Lua-Dateien, 49 PNGs, acht Markdown-, acht JSON-, zwei Shell-, zwei Python-, zwei CFG-, zwei PSD-Dateien sowie je eine OGV-, SVG-, WebP-, TTF- und erweiterungslose Datei.

Vergleich mit dem frisch ausgecheckten offiziellen Tag `v0.3.18`, Commit `b83f805a7c7b6043370b783ea7a4b65fd8c93ef4`:

| Prüfung | Ergebnis |
|---|---:|
| Pfade in `game.love` | 1.150 |
| Pfade mit Gegenstück im Tag | 1.150 |
| Byteidentisch | 1.149 |
| Abweichend | 1 |
| Nur in APK | 0 |

Die einzige Abweichung ist `src/core/Version.lua`: Repositorywert `engine = "0.0.0-dev"`, APK-Wert `engine = "0.3.18"`. Genau diese Ersetzung ist im offiziellen `scripts/pack_love.sh --version X.Y.Z` vorgesehen. Damit ist der vollständige eingebettete Lua-/UI-/Asset-Payload — abgesehen vom erwarteten Release-Stamp — **VERIFIZIERT identisch** zum untersuchten Tag. Das umfasst `LauncherView.lua`, UI-Kit/Theme/Layout, Touchsteuerung, Importer, Mods/Hooks, Saves und die sichtbaren Game-/Launcher-Assets.

Wichtig: Der Archivevergleich beweist Dateiinhalte, nicht deterministische ZIP-Bytes und nicht das Verhalten der nativen Android-Hülle. Die großen `.psd`-Quelldateien (zusammen rund 13,6 MB) werden tatsächlich mitgeliefert; für ein späteres Web-Core-Paket sollte ihre Laufzeitnotwendigkeit **gemessen und lizenzrechtlich geprüft**, nicht blind angenommen oder spekulativ entfernt werden.

Reproduzierbarer Vergleich:

```bash
git clone --depth 1 --branch v0.3.18 \
  https://github.com/bryanthaboi/gen1recomp.git /tmp/gen1recomp-audit
python3 - <<'PY'
from pathlib import Path
import hashlib
source = Path('/tmp/gen1recomp-audit')
payload = Path('/tmp/apk-analysis/game')
for item in sorted(p for p in payload.rglob('*') if p.is_file()):
    rel = item.relative_to(payload)
    peer = source / rel
    assert peer.is_file(), f'missing in source: {rel}'
    if hashlib.sha256(item.read_bytes()).digest() != hashlib.sha256(peer.read_bytes()).digest():
        print(rel)
PY
# Erwartete einzige Ausgabe: src/core/Version.lua
```

## 7. Netzwerkpfade im ausgelieferten Payload

Weil der Lua-Payload bis auf den Versionsstamp byteidentisch ist, sind folgende statisch gefundene Ziele **VERIFIZIERT im APK-Payload vorhanden**:

| Zweck | Ziel / Muster | Aktivierung laut Payload |
|---|---|---|
| Core-/Native-Updates | GitHub API/Release für `bryanthaboi/gen1recomp` | Launcher startet auf unterstütztem Fused Build einen asynchronen Release-Check; Download/Installation bleibt eine Nutzeraktion |
| iOS-Repohinweis | `github.com/bryanthaboi/gen1recomp/.../mobile/ios/app-repo.json` | plattformspezifische Update-Aktion |
| Mod-Katalog/-Updates | GitHub API, GitHub Pages und `raw.githubusercontent.com`, teils aus Nutzer-Repositoryangaben konstruiert | Quellen sind in Options gespeichert; Default `modIndexes = {}`. Launcher prewarmt vorhandene Quellen asynchron |
| Save-/Mod-Sync und Lobby | `https://sync.147.182.215.255.sslip.io` | account-/codegebunden; SyncEngine sendet nur verlinkt automatisch, 2-MiB-Blob- und 4-MiB-Response-Grenze |
| Shader-Presets | `https://buildbot.libretro.com/assets/frontend/shaders_slang.zip` | expliziter Download aus Shader-UI |
| Issue Report | GitHub New-Issue-URL | öffnet eine vom Nutzer ausgelöste URL |
| Projekt-/Lizenzlinks | `bois.icu`, GitHub und dokumentierte Asset-Autorenseiten | Link-/Attributionsziele |

Die nativen Java-Bridges verweigern für ihre HTTP-Helfer Nicht-HTTPS-Ziele; die DEX enthält außerdem rohe TLS-Bridges für andere Core-Pfade. **Nicht verifiziert** ist, welche Requests in einem echten Lauf tatsächlich ausgelöst werden, welche Serverantworten erfolgen oder ob jeder Transportpfad dieselben Limits hat. Ein statischer URL-Scan fand keinen separaten Analytics-/Werbe-Endpunkt; das ist kein allgemeiner Beweis für Abwesenheit dynamisch konstruierter Ziele.

**Architekturfolge:** Scripting übernimmt diese URLs nicht als verstreute Konstanten. Repository-, Sync-, Mod- und Shader-Provider sind getrennte, konfigurierbare Ports mit HTTPS-, Größen-, Redirect-, Datenschutz- und Opt-in-Policy. P0 muss vollständig offline laufen; Sync, Mod-Katalog, Shader-Download und Issue-Report sind optional. Automatische Checks dürfen installierten Content nie sperren und müssen transparent abschaltbar sein.

## 8. ROM-/Save- und Storage-Befund

**VERIFIZIERT:** `game.love` enthält keine Dateien mit den Erweiterungen `.gb`, `.gbc`, `.gba`, `.nds` oder `.sav`; die vom Packskript ausgeschlossenen Verzeichnisse `data/generated` und `assets/generated` fehlen. Enthalten sind jedoch ROM-Manifeste und Extraktions-/Importlogik. Das bestätigt für dieses Artefakt: kein gebündeltes ROM und kein Save, aber Code/Metadaten für lokale Nutzerimporte.

**VERIFIZIERT im Payload:** Persistenz ist auf die LÖVE-Identity ausgerichtet und verwendet getrennte Pfade für Imports, ROM-Kopien nach Policy, generierte Daten, Saves, Mods, Updates, Shader, Prints und temporäre Marker. SaveData besitzt `.tmp`/`.bak`/Witness-Recovery; Updatepfade nutzen `.part`, Hashprüfung, Pending-Marker und Boot-Gate. Die Android-Picker-Bridge kopiert ausgewählte Inhalte unter den gemounteten Save-Root und kanonisiert direkte verschachtelte Ziele.

**Portierungsfolge:** Die Android-Verzeichnisnamen werden nicht blind zum zweiten Storage-System. Der Scripting-Host hält sichtbare, transaktionale Wahrheit in `Documents/Gen1Recomp`; eine Runtime-VFS wird nur über generation-/hashbestätigte Session-Commits gespiegelt. Originale, Saves und Journale liegen nie ausschließlich in WebView/IndexedDB oder Cache.

## 9. UI/UX-Evidenz

Weil sämtliche 1.150 Payload-Pfade vorhanden und alle UI-Dateien außer dem Versionswert byteidentisch sind, steigt die Evidenz des bisherigen UI-Audits von „Source UI“ zu **VERIFIZIERT für die in der APK eingebettete UI-Implementierung und Assets**. Statisch nicht verifiziert bleiben gerenderte Pixel, Fonts/Fallbacks, Safe Areas, OEM-Verhalten, Frametiming, Touch-Latenz und Accessibility im laufenden APK. Dafür wären kontrollierte Screenshots und Gerätetests erforderlich.

Androids XML-/PNG-Ressourcen gehören überwiegend zur nativen LÖVE-/AndroidX-Hülle; die eigentliche Launcher- und In-Game-Oberfläche liegt in `game.love`. Daher bleibt die Zielentscheidung richtig: native Scripting-Library-UX außen, originaler Core-Renderer innerhalb der Runtime. Android-Systemdialoge und Android-Installer werden nicht visuell kopiert.

## 10. Buildmetadaten und Grenzen

- **VERIFIZIERT:** Android Gradle Plugin `8.9.2` ist in APK-Buildmetadaten referenziert.
- **VERIFIZIERT:** `version-control-info.textproto` meldet `NO_SUPPORTED_VCS_FOUND`; die APK trägt somit keinen unabhängigen Commit-Beleg.
- **VERIFIZIERT:** Der Payload-Abgleich bindet `game.love` dennoch vollständig an Tag `v0.3.18` plus dokumentiertem Versionsstamp.
- **NICHT VERIFIZIERT:** reproduzierbarer Android-Build, exakte JDK-/NDK-Hostumgebung, Laufzeitfunktion, Netzwerkziele zur Laufzeit, Gerätekompatibilität und Performance.
- **NICHT VERIFIZIERT:** love.js/WASM, WebGL, WebAudio, Worker, IndexedDB oder Scripting-iOS-Spielbarkeit; nichts davon ist in dieser APK enthalten.

## 11. Verwendete Werkzeuge

- Info-ZIP Zip 3.0 / UnZip 6.00
- Python 3 mit Androguard 4.1.3
- OpenSSL 3.0.20
- GNU `readelf` / Binutils 2.40
- `sha256sum`, `diff`, `strings`, Python-Hashvergleich

Die Analyse ist wiederholbar, solange die genannten Digests als Eingabe dienen. Temporäre Extrakte werden bewusst nicht ins Git-Repository aufgenommen; die beiden Nutzer-Uploads bleiben als Provenienzartefakte vorhanden.
