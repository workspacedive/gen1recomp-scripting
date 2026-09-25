#!/usr/bin/env node
// Sets up everything the E2E harness needs, reproducibly, under .cache/:
//   .cache/lovejs/compat/{love.js,love.wasm}  pinned love.js build (npm tarball,
//                                              SHA-1 + SHA-256 verified)
//   .cache/browser/node_modules               puppeteer-core + @sparticuz/chromium
//   .cache/game-<version>.love                game archive built from a gen1recomp
//                                              checkout with the pack_love.sh file set
// Usage: node tools/harness/setup.mjs [--gen1recomp <checkout>] [--skip-browser]
// SPDX-License-Identifier: GPL-3.0-or-later
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE = path.join(REPO, '.cache');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

// Keep in sync with scripting/RecompDeck/src/core/pins.ts (RUNTIME_PIN)
const PIN = {
  url: 'https://registry.npmjs.org/@jeduden-love2d/love.js/-/love.js-11.5.1.tgz',
  sha1: 'a5c135170ec13306bc3067c33c584b79ad680248',
  sha256: '8f94acd7e77b1b6999eb2b6c6202e20b6963643f4655c39d0a118dc34161cd9e',
  files: {
    'package/src/compat/love.js': ['love.js', '86a993add89e4b62af875995ad954f39a23725f3f48553a1618b520738b228a0'],
    'package/src/compat/love.wasm': ['love.wasm', '8e955d3ca1db20c2c3509313c0093cf81826fc391f509194f85562ac57c601fa'],
  },
};

const hash = (algo, buf) => crypto.createHash(algo).update(buf).digest('hex');

function untar(buf) {
  const out = {};
  for (let off = 0; off + 512 <= buf.length;) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const str = (a, b) => h.subarray(a, b).toString('latin1').replace(/\0.*$/s, '');
    const size = parseInt(str(124, 136).trim() || '0', 8);
    const prefix = str(345, 500);
    const name = (prefix ? prefix + '/' : '') + str(0, 100);
    out[name] = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

async function setupLovejs() {
  const dir = path.join(CACHE, 'lovejs', 'compat');
  fs.mkdirSync(dir, { recursive: true });
  const ok = Object.values(PIN.files).every(([n, sha]) => fs.existsSync(path.join(dir, n)) && hash('sha256', fs.readFileSync(path.join(dir, n))) === sha);
  if (ok) { console.log('love.js: cached'); return; }
  const res = await fetch(PIN.url);
  if (!res.ok) throw new Error(`love.js download failed: HTTP ${res.status}`);
  const tgz = Buffer.from(await res.arrayBuffer());
  if (hash('sha1', tgz) !== PIN.sha1) throw new Error('love.js tarball SHA-1 mismatch (npm dist.shasum)');
  if (hash('sha256', tgz) !== PIN.sha256) throw new Error('love.js tarball SHA-256 mismatch');
  const files = untar(zlib.gunzipSync(tgz));
  for (const [tarPath, [name, sha]] of Object.entries(PIN.files)) {
    const data = files[tarPath];
    if (!data) throw new Error(`missing ${tarPath}`);
    if (hash('sha256', data) !== sha) throw new Error(`${name} SHA-256 mismatch`);
    fs.writeFileSync(path.join(dir, name), data);
  }
  console.log('love.js: installed + verified ->', dir);
}

function setupBrowser() {
  const dir = path.join(CACHE, 'browser');
  if (fs.existsSync(path.join(dir, 'node_modules', '@sparticuz', 'chromium'))) { console.log('browser: cached'); return; }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'rd-harness-browser', private: true }));
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '@sparticuz/chromium@153.0.0', 'puppeteer-core@24'], { cwd: dir, stdio: 'inherit' });
  console.log('browser: installed ->', dir);
}

// Same include/exclude set as gen1recomp scripts/pack_love.sh (v0.3.14) and the
// same release version stamp as scripts/build.sh. `--rebuild-game` forces a rebuild.
function buildGame(checkout) {
  const version = execFileSync('git', ['-C', checkout, 'describe', '--tags', '--always'], { encoding: 'utf8' }).trim().replace(/^v/, '');
  const out = path.join(CACHE, `game-${version}.love`);
  if (fs.existsSync(out) && !args.includes('--rebuild-game')) { console.log('game: cached', out); return; }
  fs.rmSync(out, { force: true });
  const include = ['main.lua', 'conf.lua', 'src', 'data', 'assets', 'tools/save-editor',
    ...['', '_blue', '_yellow', '_gold', '_silver', '_crystal', '_firered', '_leafgreen'].map((s) => `tools/rom_manifest${s}.json`),
    'PATCH_NOTES.md', 'mobile/ios/app-repo.json'].filter((p) => fs.existsSync(path.join(checkout, p)));
  execFileSync('zip', ['-q', '-9', '-r', out, ...include, '-x', '*.DS_Store', 'data/generated/*', 'assets/generated/*'], { cwd: checkout, stdio: 'inherit' });
  // Stamp the release version exactly like upstream scripts/build.sh: patch a
  // staged copy of src/core/Version.lua (engine = "X.Y.Z"), replace the entry
  // in the archive in place, read it back. The checkout is never modified.
  if (/^\d+\.\d+\.\d+$/.test(version)) {
    const stage = path.join(CACHE, 'stamp');
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(path.join(stage, 'src/core'), { recursive: true });
    const src = fs.readFileSync(path.join(checkout, 'src/core/Version.lua'), 'utf8');
    const stamped = src.split('\n').map((l) => l.replace(/(engine[ \t]*=[ \t]*")[^"]*(")/, `$1${version}$2`)).join('\n');
    fs.writeFileSync(path.join(stage, 'src/core/Version.lua'), stamped);
    execFileSync('zip', ['-q', out, 'src/core/Version.lua'], { cwd: stage, stdio: 'inherit' });
    const back = execFileSync('unzip', ['-p', out, 'src/core/Version.lua'], { encoding: 'utf8' });
    if (!new RegExp(`engine[ \\t]*=[ \\t]*"${version.replace(/\./g, '\\.')}"`).test(back)) throw new Error('version stamp failed');
    console.log('game: stamped engine version', version);
  }
  console.log('game: built', out, fs.statSync(out).size, 'bytes, sha256', hash('sha256', fs.readFileSync(out)));
}

await setupLovejs();
if (!args.includes('--skip-browser')) setupBrowser();
const checkout = opt('--gen1recomp') || path.join(CACHE, 'gen1recomp');
if (fs.existsSync(path.join(checkout, 'main.lua'))) buildGame(checkout);
else console.log('game: no gen1recomp checkout (pass --gen1recomp <dir> or clone into .cache/gen1recomp)');
