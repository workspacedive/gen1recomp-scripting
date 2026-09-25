# APK analysis — `gen1recomp-0.3.14-android.apk`

Subject: <https://github.com/bryanthaboi/gen1recomp/releases/download/v0.3.14/gen1recomp-0.3.14-android.apk>

## 0. Method and evidence levels

The sandbox this project was built in cannot download GitHub release assets
(the asset CDN is blocked). The APK was therefore analysed at three levels:

| Level | Source | Status |
|---|---|---|
| **A. Release metadata** | GitHub API (`/releases/tags/v0.3.14`): name, size, server-computed SHA-256 `digest` | done (below) |
| **B. Source reconstruction** | the exact tag `v0.3.14`: `mobile/android/**`, `scripts/build_android.sh`, `.github/workflows/release.yml` — the files that produce the APK | done (below) |
| **C. Binary inspection** | `tools/apk-analysis/analyze.py` (hash, `aapt2 dump badging`, decoded manifest, `apksigner verify --print-certs`, dex/native/asset inventory, embedded `game.love` file-by-file diff against the official `.love`) | tool + CI template ready; run it where downloads work (skill S10) |

Level C reproduces and checks every claim of level B against the real file.
Run: `python3 tools/apk-analysis/analyze.py gen1recomp-0.3.14-android.apk out/ --love gen1recomp-0.3.14.love`
(or enable `tools/ci/workflows/apk-analysis.yml`, see `tools/ci/README.md`).
The analyzer was self-tested on a synthetic APK (`.cache/fake.apk`): it
detected a modified `conf.lua`, an extra file and a native library, and
degrades gracefully when Android build-tools are missing.

## 1. Release metadata (level A)

| Asset | Size (bytes) | SHA-256 (GitHub digest) |
|---|---|---|
| `gen1recomp-0.3.14-android.apk` | 39 250 850 | `d4346876b7a8445cc9724082a988e5a1020fbc1a3d0bac05b243ffd28e072da1` |
| `gen1recomp-0.3.14.love` | 24 110 241 | `b425a2862419ab81731b5aa52dfb95766e78e7ebace0c7a4580cc4f8cb7ac619` |
| `sha256sums.txt` | 1 090 | `9d3371ede01451ac526f65f66723e033417c4a2f08f3d6f050fe5a7823ed0416` |

Published 2026-09-24T21:10:50Z; 13 assets in total (desktop, Android, iOS IPA
`gen1recomp++-0.3.14-ios.ipa` 37 794 320 B, Switch, Xbox UWP, handhelds,
`.love`). The APK is ≈ 15.1 MB larger than the `.love` it embeds: native
libraries for two ABIs, dex, resources.

## 2. Build pipeline (level B)

`release.yml` job *android*: downloads the prebuilt Android ShaderFX bridge
(`shaderfx-bridge-android`), then runs
`scripts/build_android.sh --release --version 0.3.14`, which

1. packs `game.love` itself (no fused mods; fails if the archive contains
   generated ROM data or misses the save editor, the Yellow/Gold/Silver/
   Crystal/FireRed import manifests or the launcher UI kit) and stamps the
   engine version into a copy of `Version.lua` inside the archive;
2. brands the vendored **love-android 11.5a** project via
   `gradle.properties`: `app.name=gen1recomp`,
   `app.application_id=com.theboisclub.pokemonred` (debug: `….dev`,
   "gen1recomp (dev)"), `app.version_name=0.3.14`,
   `app.version_code = major·1 000 000 + minor·1 000 + patch = 3014`;
3. strips `RECORD_AUDIO` and `WRITE_EXTERNAL_STORAGE` and
   `usesCleartextTraffic="true"` from the manifest (keeps VIBRATE, BLUETOOTH,
   INTERNET — link play, issue #287);
4. copies `liblibrashader_bridge.so` into `app/src/main/jniLibs`;
5. builds flavor **embedNoRecord** (`mode {normal, embed} × recording
   {record, noRecord}`), `game.love` in `app/src/embed/assets/`, signed with
   the release keystore from CI secrets; R8 minify + ProGuard for the app
   module.

Toolchain: NDK 25.2.9519653, JDK 17, minSdk 19, compileSdk/targetSdk 36,
ABIs `armeabi-v7a` + `arm64-v8a` (debug adds `x86_64`).

## 3. Manifest (level B, `app/src/main/AndroidManifest.xml` after branding)

- **Permissions:** `VIBRATE`, `BLUETOOTH`, `INTERNET`,
  `REQUEST_INSTALL_PACKAGES` (self-update), `ACTIVITY_RECOGNITION` (step
  counter bridge).
- **Features (all optional except GLES 2.0):** `glEsVersion 0x00020000`,
  touchscreen, bluetooth, gamepad, usb.host, type.pc, audio.low_latency,
  audio.pro, sensor.accelerometer.
- **Intent filters:** `MAIN`/`LAUNCHER` (+ `tv.ouya.intent.category.GAME`);
  `VIEW` + `BROWSABLE` for `gen1recomp++://launch`; `USB_DEVICE_ATTACHED`.
- A `FileProvider` (exports, APK install) and the game activity.

## 4. Native code (level B)

love-android `Android.mk` modules: `liblove` (LÖVE 11.5), `libluajit`
(LuaJIT 2.1), SDL2, OpenAL, oboe, FreeType, HIDAPI, libogg/libvorbis/
libtheora, mpg123, modplug; plus `liblibrashader_bridge.so` (ShaderFX,
librashader preset translation).

## 5. Platform extensions (`love.system`, `wrap_System.cpp` + `GameActivity.java`, 3029 lines)

Standard: `getOS`, `getProcessorCount`, `set/getClipboardText`,
`getPowerInfo`, `openURL`, `vibrate`. **20 Android extensions:** `pickFile`,
`pickFileKinds`, `createFile`, `exportImage`, `syncHealthSteps`,
`restartApp`, `installApk`, `updateShortcuts`, `getLaunchGame`,
`getLaunchURI`, `httpDownload`, `httpPost`, `httpRequest`, `tlsOpen`,
`tlsStatus`, `tlsSend`, `tlsReceive`, `tlsError`, `tlsClose`,
`hasBackgroundMusic`.

## 6. What this means for RecompDeck

| Android mechanism | RecompDeck (Scripting, free tier) |
|---|---|
| embedded `game.love` (repacked by the build script) | the official release `.love`, unmodified, verified (3 checksum sources) |
| LuaJIT 2.1 | PUC Lua 5.1 + compat layer ([compatibility.md](compatibility.md)) |
| GLES 2/3 via SDL | WebGL 1 via love.js, firewall-checked shaders/canvases |
| ShaderFX bridge (`.so`) | unavailable (no FFI); LÖVE shaders work |
| `pickFile`/`createFile`/`exportImage` | DocumentPicker/ShareSheet in the native launcher |
| `gen1recomp++://launch` | `scripting://run/RecompDeck?game=…&slot=…` |
| self-update (`installApk`) | host-side release manager, saves untouched |
| HTTP/TLS extensions, link play, save sync | not available (no sockets); documented |
| step counter (`ACTIVITY_RECOGNITION`) | not available (HealthKit in Scripting is PRO) |
| VIBRATE | `HapticFeedback` |
| Bluetooth/USB gamepads | expected via the Gamepad API (Emscripten SDL2 joystick) if WKWebView exposes it — unverified, device checklist |
| permissions | none requested |

## 7. Open points (need level C)

- Signing certificate (v2/v3 scheme, SHA-256 of the cert).
- Exact native library list and sizes per ABI, dex size.
- Confirmation that the embedded `game.love` equals the release `.love`
  file-by-file (expected: same files; the version stamp is applied in both).
