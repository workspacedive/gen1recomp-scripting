# Performance

Goals: the game's native 60 fps with the least CPU/GPU/battery cost on
iPhone/iPad, fast start-up, and no work in the Scripting JS context that
native APIs or the WebView JIT can do better (AGENT.md §2.5).

## 1. Cooperative frame pacing (no busy-waits)

love.js has no asyncify: `love.timer.sleep` → `SDL_Delay` is a **busy-wait
on the browser main thread** (it freezes input and audio and burns battery).
gen1recomp paces its own loop with `love.timer.sleep`
(`main.lua` `love.run`: `sleepUntilFrame`, `FrameCap`, 15 fps on the idle
import screen after 30 s without input, 10 fps when invisible).

RecompDeck makes sleep cooperative (`rd_host/platform.lua` + `player.js`):

1. `love.timer.sleep(s)` never blocks. It advances the value returned by
   `love.timer.getTime()` for the rest of the current frame, so the game's
   pacing loop exits immediately with the timing it expects.
2. The requested wake-up time is sent to the page (`frame.wake`, capped at
   2 s); the page's `requestAnimationFrame` wrapper skips callbacks until
   then (`skippedRaf` counter).
3. The real swap interval stays 1 (rAF). The game's `setVSync(0)` (from
   `VSync.silenceDriver`) would switch Emscripten to `setTimeout(0)`
   (uncapped), so vsync is virtualised: the game
   sees the state it set, the browser keeps presenting at display rate.
4. An additional user frame cap (30/60/120/display, default 60) is applied in
   the rAF wrapper — on 120 Hz ProMotion displays 60 halves the work.

A first design (virtual sleep with a sub-second cap) produced a 66 ms
busy-wait per frame in the harness and was replaced by the scheme above.

## 2. Measured (E2E, headless Chromium)

Run: `npm run harness -- --game .cache/game-0.3.14.love --lovejs
.cache/lovejs/compat --transport chunks --duration 40 --shots 15,40`
(file:// page with chunked blobs — the iOS transport; viewport 390×844@2;
software WebGL/SwiftShader on a server CPU; 2 s samples).

| Phase | fps | work per frame (avg) | worst frame | skipped rAF / 2 s |
|---|---|---|---|---|
| boot (first sample, includes loading) | 33.1 | 8 ms | 440.7 ms | 0 |
| official launcher, active (samples 2–15) | 59.5–60 | 0.8–1.1 ms | ≤ 8.7 ms | 0 |
| idle import screen after 30 s (game caps to 15 fps) | 15 | 1.1–1.3 ms | ≤ 2.8 ms | 90 |

wasm heap: 192 MiB (initial memory setting), no growth; 0 errors, no
`engineFault`. Earlier http-transport runs measured 60 fps at ~1.3–1.5 ms per
frame. The skip counter (90 per 2 s = 45/s = 60 − 15) proves that the idle
cap is realised by skipping frames, not by spinning.

These numbers characterise relative cost (no busy-waits, no per-frame
overhead from the bridge); absolute numbers on an iPhone GPU/CPU must be
measured on the device (Diagnostics screen, [verification.md](verification.md)).

## 3. Start-up and data transport

- WKWebView pages loaded from `file://` cannot `fetch()` local files, and
  message-passing megabytes of base64 through `evaluateJavaScript` is slow.
  The host therefore publishes binary assets (game archive ≈ 24 MB,
  `love.wasm` 4.7 MB, packs) as **chunked script files** (`RD.chunk(id, i,
  "<base64>")`, 3 MiB raw per chunk, a multiple of 3 so only the last chunk
  carries padding) that the page loads with `<script src>`; decoding happens
  in the page (JIT) directly into the destination buffer
  (`b64ToBytesInto`), no intermediate strings per byte in Scripting's JS.
- Chunk sets are derived artifacts keyed by the source file's content hash
  (`src/player/blobs.ts`); they are only regenerated when the source changes.
- Hashing (SHA-1/SHA-256) always uses the native `Crypto` module on `Data`,
  decompression uses `Data.decompressed` (Apple Compression framework), ZIP
  handling uses `FileManager.zip/unzip`.

## 4. ROM import cache

The game decodes graphics/data from the ROM on first import (seconds of
work). After the game reports completion, the page packs
`<ver>/data/generated`, `<ver>/assets/generated` and `rom-cache.complete`
into an **RDPK** pack streamed to the host (`persist.cache.*`), stored in
`cache/`. Next boots mount the pack instead of re-importing. The pack is
used only while its recorded game version matches the installed archive
(`model.ts`); after a game update the ROM is imported again.

## 5. Persistence without stalls

- The game's writes are tracked in Lua and streamed debounced (shortly after
  the last write) through a **binary device file** (`FS_createDevice`), so
  save data moves from Lua to the page without base64/JSON; the page batches
  changes to the host (`persist.user`).
- The host writes only changed files; automatic rolling backups happen once
  per session start, not per write.

## 6. Pause and background

- Opening the native menu pauses simulation (bridge mod hook
  `core.update`), the Emscripten main loop and audio.
- `visibilitychange` (app backgrounded, screen locked) flushes pending save
  data immediately and suspends audio; WebKit stops `requestAnimationFrame`
  for hidden pages, and the game itself caps at 10 fps while invisible.

## 7. Memory

- Initial wasm memory 128/192/256/384 MiB (default 192), grows on demand.
- The game archive is mounted from memory once. A ROM is staged into the
  in-memory FS (`/rd/rom`) only for an import session; its chunk set in the
  player directory is removed by `pruneBlobs` at the start of the next
  session that does not need it (everything stays inside the app sandbox).

## 8. Tuning checklist (Settings)

| Setting | Effect |
|---|---|
| Frame cap 30/60/120/display | CPU/GPU work per second |
| High-DPI rendering | sharper output vs. fill-rate |
| Pixelated upscaling | nearest-neighbour CSS scaling (no cost) |
| Fill edges | draw under notch/home indicator |
| Initial memory | fewer heap growths vs. RAM footprint |
