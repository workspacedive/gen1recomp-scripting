#!/usr/bin/env node
// tools/harness/run-player.mjs
// End-to-end harness: boots the REAL game archive on love.js inside headless
// Chromium through the exact RecompDeck player + Lua bootstrap, records every
// host message, console line and periodic screenshots, and can replay the
// persisted save directory into a second boot (persistence round trip).
//
// Usage:
//   node tools/harness/run-player.mjs --game <game.love> --lovejs <compatDir>
//        [--out <dir>] [--duration 20] [--shots 5,10,20] [--viewport 390x844@3]
//        [--arg=--game=red ...] [--env KEY=VALUE ...] [--os iOS]
//        [--save-pack <rdpk>] [--tap x,y@sec ...] [--key Enter@sec ...]
//        [--chrome <path>] [--auto-start]
//
// Chromium: pass --chrome or set CHROME_PATH; otherwise @sparticuz/chromium +
// puppeteer-core are resolved from RD_BROWSER_MODULES (a node_modules dir).
//
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPack, packDirectory, parsePack } from '../lib/rdpk.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const RUNTIME = path.join(REPO, 'scripting', 'RecompDeck', 'runtime');

function parseArgs(argv) {
  const o = { args: [], env: {}, taps: [], keys: [], shots: [5, 10, 20], duration: 20, viewport: '390x844@3', os: 'iOS', out: path.join(REPO, '.cache', 'harness-run'), autoStart: true, fpsCap: 60 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--game') o.game = next();
    else if (a === '--lovejs') o.lovejs = next();
    else if (a === '--out') o.out = next();
    else if (a === '--duration') o.duration = Number(next());
    else if (a === '--shots') o.shots = next().split(',').map(Number);
    else if (a === '--viewport') o.viewport = next();
    else if (a.startsWith('--arg=')) o.args.push(a.slice(6));
    else if (a === '--env') { const [k, ...v] = next().split('='); o.env[k] = v.join('='); }
    else if (a === '--os') o.os = next();
    else if (a === '--save-pack') (o.savePacks = o.savePacks || []).push(next());
    else if (a === '--file') (o.files = o.files || []).push(next()); // dest:path:localfile
    else if (a === '--tap') o.taps.push(next());
    else if (a === '--key') o.keys.push(next());
    else if (a === '--chrome') o.chrome = next();
    else if (a === '--no-auto-start') o.autoStart = false;
    else if (a === '--fps-cap') o.fpsCap = Number(next());
    else if (a === '--transport') o.transport = next(); // fetch (http) | chunks (file://, like WKWebView)
    else if (a === '--memory') o.memoryMB = Number(next());
    else if (a === '--selftest') o.selftest = true;
    else if (a === '--trace-exceptions') o.traceExceptions = true;
    else throw new Error(`unknown argument ${a}`);
  }
  o.lovejs = o.lovejs || path.join(REPO, '.cache', 'lovejs', 'compat');
  if (!o.game) throw new Error('--game is required (see npm run harness:setup)');
  return o;
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function prepareSite(o) {
  const site = path.join(o.out, 'site');
  fs.rmSync(o.out, { recursive: true, force: true });
  fs.mkdirSync(path.join(site, 'blobs'), { recursive: true });
  for (const f of ['player.html', 'player.js', 'player.css']) {
    fs.copyFileSync(path.join(RUNTIME, 'web', f), path.join(site, f));
  }
  fs.copyFileSync(path.join(o.lovejs, 'love.js'), path.join(site, 'love.js'));
  const CHUNK = 3 * 1024 * 1024; // == CHUNK_SIZE in src/player/blobs.ts
  const blob = (role, bytes) => {
    const sha = sha256(bytes);
    if (o.transport === 'chunks') {
      const id = 'b' + sha.slice(0, 20);
      const dir = path.join(site, 'blobs', sha);
      fs.mkdirSync(dir, { recursive: true });
      const count = Math.max(1, Math.ceil(bytes.length / CHUNK));
      const chunks = [];
      for (let i = 0; i < count; i++) {
        const part = Buffer.from(bytes.subarray(i * CHUNK, Math.min(bytes.length, (i + 1) * CHUNK)));
        fs.writeFileSync(path.join(dir, `${i}.js`), `RD.chunk("${id}",${i},"${part.toString('base64')}");\n`);
        chunks.push(`blobs/${sha}/${i}.js`);
      }
      return { id, chunks, chunkSize: CHUNK, size: bytes.length, sha256: sha };
    }
    const file = `blobs/${role}.bin`;
    fs.writeFileSync(path.join(site, file), bytes);
    return { id: role, url: file, size: bytes.length, sha256: sha };
  };
  const wasm = fs.readFileSync(path.join(o.lovejs, 'love.wasm'));
  const game = fs.readFileSync(o.game);
  const hostPack = buildPack(packDirectory(path.join(RUNTIME, 'lua')));
  const bridgePack = buildPack(packDirectory(path.join(RUNTIME, 'mods'), 'mods/'));
  const packs = [
    { id: 'host', dest: 'host', blob: blob('host-pack', hostPack) },
    { id: 'bridge-mod', dest: 'save', blob: blob('bridge-pack', bridgePack) },
  ];
  (o.savePacks || []).forEach((file, i) => packs.push({ id: `save-${i}`, dest: 'save', blob: blob(`save-pack-${i}`, fs.readFileSync(file)) }));
  const [w, rest] = o.viewport.split('x');
  const [h, dpr] = rest.split('@');
  const config = {
    version: 1,
    transport: o.transport === 'chunks' ? 'chunks' : 'fetch',
    memoryMB: o.memoryMB || 192,
    fpsCap: o.fpsCap,
    highdpi: true,
    autoStart: o.autoStart,
    identity: 'pokemon-love2d',
    args: o.args,
    env: Object.assign({ RECOMPDECK_BRIDGE: '1', POKEPORT_NO_DISCORD: '1' }, o.env),
    platform: { os: o.os },
    runtime: { loveJs: { src: 'love.js' }, loveWasm: blob('love-wasm', wasm) },
    game: blob('game-love', game),
    packs,
    files: (o.files || []).map((spec, i) => { const [dest, p, local] = spec.split(':'); return { dest, path: p, blob: blob(`file-${i}`, fs.readFileSync(local)) }; }),
    statsInterval: 2000,
    selftest: !!o.selftest,
    perf: true,
    traceExceptions: !!o.traceExceptions,
    debug: true,
  };
  fs.writeFileSync(path.join(site, 'config.js'), `window.RD_CONFIG = ${JSON.stringify(config, null, 1)};\n`);
  return { site, viewport: { width: Number(w), height: Number(h), deviceScaleFactor: Number(dpr || 1) }, config };
}

function serve(root) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream' };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(root, path.normalize(url).replace(/^([/\\])+/, ''));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function launchBrowser(o) {
  const modDir = process.env.RD_BROWSER_MODULES || path.join(REPO, '.cache', 'browser', 'node_modules');
  const req = createRequire(modDir ? path.join(modDir, 'noop.js') : import.meta.url);
  const puppeteer = await import(pathToFileURL(req.resolve('puppeteer-core')).href);
  let executablePath = o.chrome || process.env.CHROME_PATH;
  let args = ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  if (!executablePath) {
    const chromium = (await import(pathToFileURL(req.resolve('@sparticuz/chromium')).href)).default;
    executablePath = await chromium.executablePath();
    // Serverless flags that destabilise WebGL/WASM or weaken the security
    // model under test (single-process, disabled web security) are dropped.
    const drop = new Set(['--single-process', '--no-zygote', '--in-process-gpu', '--disable-web-security', '--allow-running-insecure-content', "--headless='shell'"]);
    args = [...chromium.args.filter((a) => !drop.has(a)), ...args];
    // non-Lambda Linux hosts lack NSS: unpack the bundled libraries once
    const mod = await import(pathToFileURL(req.resolve('@sparticuz/chromium')).href);
    const binDir = path.join(path.dirname(req.resolve('@sparticuz/chromium')), '..', 'bin');
    const libDir = await mod.inflate(path.join(binDir, 'al2023.tar.br'));
    process.env.LD_LIBRARY_PATH = [path.join(libDir, 'lib'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  }
  return (puppeteer.default || puppeteer).launch({ executablePath, args, headless: true, protocolTimeout: 600000 });
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const { site, viewport } = prepareSite(o);
  const server = await serve(site);
  const port = server.address().port;
  const report = { started: new Date().toISOString(), options: { ...o, game: path.basename(o.game) }, host: [], console: [], stats: [], shots: [], persisted: { user: {}, cache: {} } };
  const persistDir = path.join(o.out, 'persisted');
  fs.mkdirSync(path.join(persistDir, 'user'), { recursive: true });
  fs.mkdirSync(path.join(persistDir, 'cache'), { recursive: true });
  const cacheParts = {};

  const browser = await launchBrowser(o);
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, isMobile: true, hasTouch: true });
  page.on('console', (m) => report.console.push(`[${m.type()}] ${m.text()}`.slice(0, 2000)));
  page.on('pageerror', (e) => report.console.push(`[pageerror] ${e.message}`));
  let crashed = null;
  page.on('error', (e) => { crashed = e.message; report.console.push(`[crash] ${e.message}`); });

  await page.exposeFunction('__rdHostStub', (topic, data) => {
    const t = Date.now();
    if (topic === 'persist.user') {
      for (const f of data.files || []) {
        const dest = path.join(persistDir, 'user', f.path);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, Buffer.from(f.b64, 'base64'));
        report.persisted.user[f.path] = f.size;
      }
      for (const r of data.removes || []) { fs.rmSync(path.join(persistDir, 'user', r), { force: true }); delete report.persisted.user[r]; }
      report.host.push({ t, topic, files: (data.files || []).map((f) => `${f.path} (${f.size})`), removes: data.removes, dirs: data.dirs });
      return true;
    }
    if (topic === 'persist.cache.begin') { cacheParts[data.version] = []; report.host.push({ t, topic, data }); return true; }
    if (topic === 'persist.cache.part') { cacheParts[data.version][data.index] = Buffer.from(data.b64, 'base64'); return true; }
    if (topic === 'persist.cache.end') {
      const buf = Buffer.concat(cacheParts[data.version]);
      fs.writeFileSync(path.join(persistDir, 'cache', `${data.version}.rdpk`), buf);
      report.persisted.cache[data.version] = { size: buf.length, sha256ok: !data.sha256 || sha256(buf) === data.sha256, entries: parsePack(new Uint8Array(buf)).length };
      report.host.push({ t, topic, data });
      return true;
    }
    if (topic === 'stats') { report.stats.push({ t, ...data }); return true; }
    report.host.push({ t, topic, data });
    return true;
  });

  const t0 = Date.now();
  const entry = o.transport === 'chunks' ? pathToFileURL(path.join(site, 'player.html')).href : `http://127.0.0.1:${port}/player.html`;
  report.entry = entry;
  await page.goto(entry, { waitUntil: 'load', timeout: 120000 });

  const events = [];
  for (const s of o.shots) events.push({ at: s, kind: 'shot' });
  for (const tp of o.taps) { const [xy, at] = tp.split('@'); const [x, y] = xy.split(',').map(Number); events.push({ at: Number(at), kind: 'tap', x, y }); }
  for (const k of o.keys) { const [key, at] = k.split('@'); events.push({ at: Number(at), kind: 'key', key }); }
  events.sort((a, b) => a.at - b.at);
  for (const ev of events) {
    const wait = t0 + ev.at * 1000 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (crashed) break;
    if (ev.kind === 'shot') {
      const file = path.join(o.out, `shot-${String(ev.at).padStart(3, '0')}s.png`);
      try { await page.screenshot({ path: file }); report.shots.push(path.basename(file)); }
      catch (e) { report.console.push(`[harness] screenshot failed: ${e.message}`); crashed = crashed || e.message; break; }
    } else if (ev.kind === 'tap') {
      await page.touchscreen.tap(ev.x, ev.y);
    } else if (ev.kind === 'key') {
      await page.keyboard.press(ev.key);
    }
  }
  const remaining = t0 + o.duration * 1000 - Date.now();
  if (remaining > 0 && !crashed) await new Promise((r) => setTimeout(r, remaining));
  report.crashed = crashed;
  try {
    await page.evaluate(() => window.RD && window.RD.receive('flush'));
    await new Promise((r) => setTimeout(r, 1500));
    report.playerLogs = await page.evaluate(() => (window.RD && window.RD.logs) ? window.RD.logs() : []);
  } catch (e) { report.console.push(`[harness] final evaluate failed: ${e.message}`); }
  report.finished = new Date().toISOString();
  report.elapsed = (Date.now() - t0) / 1000;
  fs.writeFileSync(path.join(o.out, 'report.json'), JSON.stringify(report, null, 1));

  // bundle persisted user data into an RDPK for a follow-up boot
  const userRoot = path.join(persistDir, 'user');
  if (fs.readdirSync(userRoot).length) {
    fs.writeFileSync(path.join(o.out, 'userdata.rdpk'), buildPack(packDirectory(userRoot)));
  }
  await browser.close().catch(() => {});
  server.close();
  const topics = report.host.map((h) => h.topic);
  const summary = {
    crashed: report.crashed,
    ready: topics.includes('ready'),
    errors: report.host.filter((h) => h.topic === 'error').map((h) => h.data && h.data.message),
    topics: [...new Set(topics)],
    lastStats: report.stats[report.stats.length - 1],
    persistedUserFiles: Object.keys(report.persisted.user).length,
    cachePacks: report.persisted.cache,
    shots: report.shots,
  };
  console.log(JSON.stringify(summary, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
