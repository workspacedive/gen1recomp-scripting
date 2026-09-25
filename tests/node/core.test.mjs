// Unit tests for the pure host modules (compiled by `npm run build:test`).
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildPack as buildPackNode, parsePack as parsePackNode } from '../../tools/lib/rdpk.mjs';

const require = createRequire(import.meta.url);
const B = '../../.cache/test-build/';
const rdpk = require(B + 'rdpk.js');
const zip = require(B + 'zipScan.js');
const manifest = require(B + 'manifest.js');
const paths = require(B + 'paths.js');
const semver = require(B + 'semver.js');
const roms = require(B + 'roms.js');
const lua = require(B + 'luaTable.js');
const slots = require(B + 'slots.js');
const archive = require(B + 'archive.js');
const bridge = require(B + 'bridgeSchema.js');
const launch = require(B + 'launch.js');
const settings = require(B + 'settings.js');
const pins = require(B + 'pins.js');

test('rdpk: host builder is byte-identical to the Node/player format', () => {
  const entries = [
    { path: 'saves', type: 1, mtime: 0 },
    { path: 'saves/red/slot1.lua', type: 0, mtime: 123.5, data: new TextEncoder().encode('return {}\n') },
    { path: 'prints/ümlaut✓.png', type: 0, mtime: 0, data: Uint8Array.from([0, 255, 1]) },
  ];
  const a = rdpk.buildPack(entries);
  const b = buildPackNode(entries);
  assert.deepEqual(Buffer.from(a), Buffer.from(b));
  const parsed = rdpk.parsePack(a);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[2].path, 'prints/ümlaut✓.png');
  assert.deepEqual([...a.subarray(parsed[2].offset, parsed[2].offset + 3)], [0, 255, 1]);
  assert.equal(parsePackNode(a)[1].path, 'saves/red/slot1.lua');
  assert.throws(() => rdpk.parsePack(a.subarray(0, a.length - 1)));
});

function makeZip(files) {
  // minimal stored-only ZIP writer for tests
  const enc = new TextEncoder(); const local = []; const cen = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name); const data = f.data || new Uint8Array(0);
    const lh = new Uint8Array(30 + name.length); const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(8, f.method ?? 0, true); dv.setUint32(18, f.csize ?? data.length, true); dv.setUint32(22, f.usize ?? data.length, true); dv.setUint16(26, name.length, true); lh.set(name, 30);
    local.push(lh, data);
    const ch = new Uint8Array(46 + name.length); const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, (f.unix ? 3 : 0) << 8, true); cv.setUint16(8, f.flags ?? 0, true); cv.setUint16(10, f.method ?? 0, true);
    cv.setUint32(20, f.csize ?? data.length, true); cv.setUint32(24, f.usize ?? data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(38, (f.unix ?? 0) << 16, true); cv.setUint32(42, off, true); ch.set(name, 46);
    cen.push(ch); off += lh.length + data.length;
  }
  const cdSize = cen.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array(22); const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, off, true);
  const all = [...local, ...cen, eocd]; const total = all.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total); let p = 0; for (const c of all) { out.set(c, p); p += c.length; } return out;
}
function scan(bytes) {
  const e = zip.findEocd(bytes, bytes.length);
  const entries = zip.parseCentralDirectory(bytes.subarray(e.cdOffset, e.cdOffset + e.cdSize), e.count);
  return zip.checkEntries(entries);
}

test('zipScan: clean mod archive passes, root folder detected', () => {
  const z = makeZip([{ name: 'my_mod/manifest.json', data: new TextEncoder().encode('{}') }, { name: 'my_mod/main.lua', data: new Uint8Array(3) }]);
  const r = scan(z);
  assert.deepEqual(r.problems, []);
  assert.equal(zip.commonRoot(r.entries), 'my_mod/');
});

test('zipScan: rejects traversal, absolute, backslash, symlink, encrypted, bombs', () => {
  const bad = scan(makeZip([
    { name: '../evil.lua' }, { name: '/abs.lua' }, { name: 'a\\b.lua' }, { name: 'C:/x.lua' },
    { name: 'link', unix: 0o120777 }, { name: 'enc.lua', flags: 1 },
    { name: 'bomb.bin', method: 8, csize: 1000, usize: 900 * 1024 * 1024 },
  ]));
  const text = bad.problems.join('\n');
  for (const needle of ['unsafe path: ../evil.lua', 'unsafe path: /abs.lua', 'unsafe path: a\\b.lua', 'unsafe path: C:/x.lua', 'symbolic link', 'encrypted', 'entry too large', 'suspicious compression ratio']) {
    assert.ok(text.includes(needle), 'missing: ' + needle);
  }
  assert.throws(() => zip.findEocd(new Uint8Array(100), 100), /not a ZIP/);
});

test('manifest: valid v2 manifest, permissions and reserved id', () => {
  const ok = manifest.validateManifest({ id: 'example_dexnav', name: 'DexNav', version: '1.0.0', api: 2, entry: 'main.lua', category: 'TOOL', permissions: ['network'] });
  assert.equal(ok.errors.length, 0);
  assert.deepEqual(ok.manifest.permissions, ['network']);
  assert.deepEqual(ok.manifest.games, ['gen1']);
  assert.ok(manifest.modTargets(ok.manifest, 'red', 1));
  assert.ok(!manifest.modTargets(ok.manifest, 'gold', 2));
  const bad = manifest.validateManifest({ id: '../x', version: 'one', api: 3, entry: '../main.lua', permissions: ['root'] });
  assert.equal(bad.manifest, null);
  assert.ok(bad.errors.length >= 4);
  assert.ok(manifest.validateManifest({ id: 'recompdeck_bridge', version: '1.0.0' }).errors.length);
  const g2 = manifest.validateManifest({ id: 'm', version: '1.0.0', gen2compat: true });
  assert.deepEqual(g2.manifest.games, ['gen1', 'gen2']);
});

test('paths: validation and classification', () => {
  for (const p of ['saves/red/slot1.lua', 'options.lua', 'prints/a.png']) assert.ok(paths.isSafeRelPath(p), p);
  for (const p of ['', '/etc/passwd', '../x', 'a/../b', 'a//b', 'a\\b', 'a/\u0001b', 'x'.repeat(600)]) assert.ok(!paths.isSafeRelPath(p), p);
  assert.deepEqual(paths.classifySavePath('red/data/generated/maps.lua'), { kind: 'cache', game: 'red' });
  assert.deepEqual(paths.classifySavePath('gold/rom-cache.complete'), { kind: 'cache', game: 'gold' });
  assert.deepEqual(paths.classifySavePath('.rd/game.love'), { kind: 'runtime' });
  assert.deepEqual(paths.classifySavePath('mods/recompdeck_bridge/main.lua'), { kind: 'hostMod', modId: 'recompdeck_bridge' });
  assert.deepEqual(paths.classifySavePath('saves/red/slot1.lua'), { kind: 'user' });
  assert.equal(paths.safeFileName('../../Pokémon Red (UE) [S].gb'), 'Pok_mon Red _UE_ _S_.gb');
});

test('semver ordering', () => {
  assert.ok(semver.compareSemver('v0.3.14', '0.3.9') > 0);
  assert.ok(semver.compareSemver('1.0.0', '1.0.0-rc.1') > 0);
  assert.ok(semver.compareSemver('1.0.0-rc.2', '1.0.0-rc.10') < 0);
  assert.ok(semver.isNewer('0.3.15', '0.3.14'));
  assert.ok(!semver.isNewer('0.3.14', '0.3.14'));
  assert.equal(semver.parseSemver('nope'), null);
});

test('roms: canonical table (11 entries) and identification', () => {
  assert.equal(roms.ROMS.length, 11);
  assert.equal(roms.identifyRom(1048576, 'EA9BCAE617FDF159B045185467AE58B2E4A48B9A').game, 'red');
  assert.equal(roms.identifyRom(2097152, 'ea9bcae617fdf159b045185467ae58b2e4a48b9a'), null);
  assert.equal(roms.romsFor('crystal').length, 2);
  for (const r of roms.ROMS) assert.match(r.sha1, /^[0-9a-f]{40}$/);
});

test('luaTable: parses SaveSerializer output and rejects code', () => {
  const src = 'return {\n  player = {\n    name = "RED\\226\\153\\130",\n    badges = { true, false, true },\n  },\n  playTime = 3725,\n  pokedex = { owned = { BULBASAUR = true, PIKACHU = true } },\n  [1] = "x",\n  ["key with space"] = -1.5e2,\n}\n';
  const v = lua.parseLuaReturn(src);
  assert.equal(v.player.name, 'RED\u00e2\u0099\u0082');
  assert.equal(v['key with space'], -150);
  const s = slots.summarizeSave(v);
  assert.deepEqual({ badges: s.badges, dex: s.dexCount, time: s.timeText }, { badges: 2, dex: 2, time: '1:02' });
  for (const evil of ['return os.execute("x")', 'return (function() end)()', 'return {a = b}', 'x = 1', 'return 1 + 1', 'return {}; os.exit()']) {
    assert.throws(() => lua.parseLuaReturn(evil), undefined, evil);
  }
  const g2 = slots.summarizeSave(lua.parseLuaReturn('return { generation = 2, player = { name = "GOLD", badges = { a = true }, kantoBadges = { b = true } }, playTime = { hours = 10, minutes = 5, seconds = 0 }, pokedex = { caught = { x = true } } }'));
  assert.deepEqual([g2.name, g2.badges, g2.timeText, g2.dexCount], ['GOLD', 2, '10:05', 1]);
});

test('slots: discovery', () => {
  const found = slots.findSlots('red', ['saves/red/slot10.lua', 'saves/red/slot2.lua', 'saves/red/slot2.lua.bak', 'saves/blue/slot1.lua']);
  assert.deepEqual(found.map((x) => x.id), ['slot2', 'slot10']);
  assert.deepEqual(slots.findSlots('red', ['save.lua']).map((x) => x.id), ['legacy']);
  assert.deepEqual(slots.findSlots('blue', ['save_blue.lua']).map((x) => x.path), ['save_blue.lua']);
});

test('archive: gzip frame and tar listing', () => {
  const zlib = require('node:zlib');
  // build a tiny tar with one file
  const header = new Uint8Array(512);
  const put = (s, off) => { for (let i = 0; i < s.length; i++) header[off + i] = s.charCodeAt(i); };
  put('package/src/compat/love.js', 0); put('0000644\0', 100); put('00000000005\0', 124); put('0', 156); put('ustar\0', 257);
  for (let i = 148; i < 156; i++) header[i] = 32;
  let sum = 0; for (const b of header) sum += b; put(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  const data = new Uint8Array(512); data.set(new TextEncoder().encode('hello'));
  const tar = Buffer.concat([header, data, Buffer.alloc(1024)]);
  const entries = archive.listTar((off) => new Uint8Array(tar.subarray(off, off + 512)), tar.length);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, 'package/src/compat/love.js');
  assert.equal(entries[0].size, 5);
  const gz = zlib.gzipSync(tar);
  const f = archive.parseGzipFrame(new Uint8Array(gz.subarray(0, 512)), new Uint8Array(gz.subarray(gz.length - 8)), gz.length);
  const raw = zlib.inflateRawSync(gz.subarray(f.deflateStart, f.deflateEnd));
  assert.equal(raw.length, tar.length);
  assert.equal(f.isize, tar.length);
});

test('bridgeSchema: accepts valid, rejects hostile messages', () => {
  assert.equal(bridge.parseBridgeMessage({ topic: 'haptic', data: { style: 'heavy' } }).data.style, 'heavy');
  assert.equal(bridge.parseBridgeMessage({ topic: 'openURL', data: { url: 'javascript:alert(1)' } }), null);
  assert.equal(bridge.parseBridgeMessage({ topic: 'openURL', data: { url: 'http://example.com' } }), null);
  assert.ok(bridge.parseBridgeMessage({ topic: 'openURL', data: { url: 'https://github.com/bryanthaboi/gen1recomp' } }));
  assert.equal(bridge.parseBridgeMessage({ topic: 'persist.user', data: { files: [{ path: '../x', size: 1, b64: 'AA==' }] } }), null);
  assert.equal(bridge.parseBridgeMessage({ topic: 'persist.user', data: { files: [{ path: 'a.txt', size: 1, b64: '<script>' }] } }), null);
  assert.equal(bridge.parseBridgeMessage({ topic: 'persist.cache.part', data: { version: 'mars', index: 0, b64: '' } }), null);
  assert.equal(bridge.parseBridgeMessage({ topic: 'eval', data: {} }), null);
  const ok = bridge.parseBridgeMessage({ topic: 'persist.user', data: { files: [{ path: 'saves/red/slot1.lua', size: 2, b64: 'AAA=' }], removes: ['a', '../b'], dirs: ['saves'] } });
  assert.deepEqual(ok.data.removes, ['a']);
});

test('launch: plans use only documented options', () => {
  const s = settings.DEFAULT_SETTINGS;
  assert.deepEqual(launch.buildLaunchPlan({ game: 'red', slot: 'slot2' }, s).args, ['--game=red', '--slot=slot2', '--no-sync']);
  const imp = launch.buildLaunchPlan({ game: 'blue', importRomPath: '/rd/rom/blue.gb' }, s);
  assert.equal(imp.env.POKEPORT_IMPORT_ROM, '/rd/rom/blue.gb');
  assert.equal(imp.env.RECOMPDECK_BRIDGE, '1');
  assert.throws(() => launch.buildLaunchPlan({ game: 'red', slot: '../x' }, s));
  assert.throws(() => launch.buildLaunchPlan({ importRomPath: '/etc/passwd' }, s));
  assert.deepEqual(launch.requestFromQuery({ game: 'Yellow', slot: '3' }), { game: 'yellow', slot: 'slot3' });
  assert.equal(launch.requestFromQuery({ game: 'mars' }), null);
});

test('settings: sanitising', () => {
  const s = settings.sanitizeSettings({ fpsCap: 999, memoryMB: 7, haptics: 'yes', language: 'de', backupsToKeep: 3 });
  assert.equal(s.fpsCap, 60); assert.equal(s.memoryMB, 192); assert.equal(s.haptics, true); assert.equal(s.language, 'de'); assert.equal(s.backupsToKeep, 3);
});

test('pins: formats, allowlist, sha256sums parser', () => {
  assert.match(pins.RUNTIME_PIN.tarballSha1, /^[0-9a-f]{40}$/);
  for (const f of pins.RUNTIME_PIN.files) assert.match(f.sha256, /^[0-9a-f]{64}$/);
  assert.ok(pins.hostAllowed('https://registry.npmjs.org/x'));
  assert.ok(!pins.hostAllowed('https://evil.example.com/registry.npmjs.org'));
  assert.ok(!pins.hostAllowed('http://github.com/'));
  assert.ok(!pins.hostAllowed('https://github.com.evil.io/'));
  const sums = pins.parseSha256Sums('aaaa\n' + 'a'.repeat(64) + '  gen1recomp-0.3.14.love\n' + 'B'.repeat(64) + ' *dist/x.apk\n');
  assert.equal(sums['gen1recomp-0.3.14.love'], 'a'.repeat(64));
  assert.equal(sums['x.apk'], 'b'.repeat(64));
});

test('luaTable: reads REAL SaveSerializer.encode output (fixture generated with gen1recomp v0.3.14 under LuaJIT)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('./fixtures/save_serializer_sample.lua', import.meta.url), 'latin1');
  const v = lua.parseLuaReturn(src);
  assert.equal(v.player.name, 'RED\u00e2\u0099\u0082');
  assert.equal(v.player.money, 3000);
  assert.equal(v.party['1'].nick, 'SPARKY\n\t"q"\\');
  assert.equal(v.weird, '\u0000\u0001\u0002\u007f\u00c8\u00ff');
  assert.equal(v.flags['255'], false);
  assert.equal(v.neg, -12.5e-3);
  assert.equal(v.big, 1e21);
  assert.equal(v.playTime, 7384.75);
  const s = slots.summarizeSave(v);
  assert.deepEqual([s.name, s.badges, s.dexCount, s.timeText], ['RED\u00e2\u0099\u0082', 2, 3, '2:03']);
});
