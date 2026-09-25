/*
 * RecompDeck web player
 * ---------------------
 * Runs the unmodified gen1recomp game archive on love.js (LÖVE 11.4 compiled
 * to WebAssembly, "compat" build without pthreads) inside the Scripting app's
 * WKWebView, and connects it to the native host.
 *
 *   host (Scripting, TSX)  <-- webkit.messageHandlers.rd / evaluateJavaScript -->
 *   player (this file)     <-- Module.print (sync) / FS files / device -->
 *   Lua bootstrap (rd_host) + official game archive
 *
 * Responsibilities
 *   - load runtime + game + packs through the best available transport
 *     (fetch over http(s), or base64 chunk scripts under file://)
 *   - verify SHA-256 of every blob when WebCrypto is available
 *   - build the Emscripten Module, inject files at the right boot phases
 *   - bridge: parse Lua bridge lines, reply synchronously, forward to host
 *   - persistence: route streamed save-directory files to the host
 *     (user data individually, ROM-derived cache as one pack per game)
 *   - platform shims: no-op IndexedDB (host owns persistence), audio unlock,
 *     requestAnimationFrame frame cap, window.open/alert interception
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of RecompDeck. Contains no code from the gen1recomp project.
 */
(function () {
  'use strict';

  var RD = (window.RD = window.RD || {});
  var DEFAULTS = {
    version: 1,
    transport: 'auto',
    memoryMB: 192,
    fpsCap: 60,
    highdpi: true,
    pixelated: true,
    fillEdges: false,
    autoStart: false,
    identity: 'pokemon-love2d',
    args: [],
    env: {},
    platform: { os: 'iOS' },
    runtime: null,
    game: null,
    packs: [],
    files: [],
    verify: true,
    statsInterval: 5000,
    debug: false
  };
  var cfg = (RD.config = Object.assign({}, DEFAULTS, window.RD_CONFIG || {}));

  var SAVE_ROOT = '/home/web_user/love/' + cfg.identity;
  var GAME_VERSIONS = ['red', 'blue', 'yellow', 'gold', 'silver', 'crystal', 'firered', 'leafgreen'];
  var CACHE_RE = new RegExp('^(' + GAME_VERSIONS.join('|') + ')/(data/generated/|assets/generated/|rom-cache\\.complete$)');
  var MARKER_RE = new RegExp('^(' + GAME_VERSIONS.join('|') + ')/rom-cache\\.complete$');
  var BRIDGE_MARK = '\u0001RDB\u0001';

  // ------------------------------------------------------------------ util
  var $ = function (id) { return document.getElementById(id); };
  var logRing = [];
  function log(level, text) {
    var line = new Date().toISOString().slice(11, 23) + ' [' + level + '] ' + text;
    logRing.push(line);
    if (logRing.length > 400) logRing.shift();
    if (level === 'error') console.error(line); else if (cfg.debug || level === 'warn') console.log(line);
    if (level === 'error' || level === 'warn') host.post('log', { level: level, text: String(text).slice(0, 4000) });
  }
  RD.log = log;
  RD.logs = function () { return logRing.slice(); };

  function b64ToBytesInto(b64, target, offset) {
    var bin = atob(b64);
    var n = bin.length;
    for (var i = 0; i < n; i++) target[offset + i] = bin.charCodeAt(i);
    return n;
  }
  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64(bytes) {
    var CH = 0x8000;
    var parts = [];
    for (var i = 0; i < bytes.length; i += CH) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CH)));
    }
    return btoa(parts.join(''));
  }
  var textEncoder = new TextEncoder();
  var textDecoder = new TextDecoder('utf-8');

  function hex(buf) {
    var b = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  }
  function sha256(bytes) {
    if (!(window.crypto && crypto.subtle && crypto.subtle.digest)) return Promise.resolve(null);
    return crypto.subtle.digest('SHA-256', bytes).then(hex, function () { return null; });
  }

  // ------------------------------------------------------------------ host
  var host = (RD.host = {
    available: !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.rd),
    post: function (topic, data) {
      try {
        if (this.available) return window.webkit.messageHandlers.rd.postMessage({ topic: topic, data: data || null });
        if (typeof window.__rdHostStub === 'function') return Promise.resolve(window.__rdHostStub(topic, data || null));
      } catch (e) {
        console.error('host.post failed', topic, e);
      }
      return Promise.resolve(null);
    }
  });

  // ------------------------------------------------------------------ ui
  var ui = {
    overlay: $('overlay'), status: $('status'), bar: $('bar-fill'), start: $('start'), error: $('error'),
    setStatus: function (t) { if (this.status) this.status.textContent = t; },
    setProgress: function (f) { if (this.bar) this.bar.style.width = Math.max(0, Math.min(100, f * 100)).toFixed(1) + '%'; },
    show: function () { this.overlay.classList.add('visible'); },
    hide: function () { this.overlay.classList.remove('visible'); },
    fail: function (msg, details) {
      this.show();
      this.setStatus(msg);
      if (details) { this.error.textContent = details; this.error.classList.remove('hidden'); }
    }
  };
  if (cfg.pixelated) document.body.classList.add('pixelated');
  if (cfg.fillEdges) document.body.classList.add('fill-edges');

  function fatal(msg, err) {
    var details = err ? String((err && err.stack) || err) : '';
    log('error', msg + (details ? ': ' + details : ''));
    ui.fail(msg, details);
    host.post('error', { message: msg, traceback: details, stage: 'player' });
  }
  window.addEventListener('error', function (e) { log('error', 'window.onerror: ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  window.addEventListener('unhandledrejection', function (e) { log('error', 'unhandledrejection: ' + (e.reason && e.reason.stack || e.reason)); });

  // ------------------------------------------------------------------ shims
  // 1. IndexedDB: love.js mounts IDBFS at /home/web_user/love and would copy
  //    the whole save directory (including the mounted game archive) into
  //    IndexedDB on unload. The host owns persistence, so IDBFS gets an
  //    in-memory store that never persists anything and never fails.
  function installIndexedDBShim() {
    function Req() { this.onsuccess = null; this.onerror = null; this.onupgradeneeded = null; this.result = undefined; this.error = null; }
    function fire(req, type, target) {
      setTimeout(function () { var h = req['on' + type]; if (h) h.call(req, { target: target || req, preventDefault: function () {} }); }, 0);
    }
    function Store() { this.indexNames = { contains: function () { return true; } }; }
    Store.prototype.createIndex = function () {};
    Store.prototype.index = function () {
      return { openKeyCursor: function () { var r = new Req(); r.result = null; fire(r, 'success', { result: null }); return r; } };
    };
    Store.prototype.put = function () { var r = new Req(); fire(r, 'success'); return r; };
    Store.prototype.delete = function () { var r = new Req(); fire(r, 'success'); return r; };
    Store.prototype.get = function () { var r = new Req(); r.result = undefined; fire(r, 'success', { result: undefined }); return r; };
    function Tx() { this.onerror = null; this.oncomplete = null; var self = this; setTimeout(function () { if (self.oncomplete) self.oncomplete({}); }, 1); }
    Tx.prototype.objectStore = function () { return new Store(); };
    function DB() { this.objectStoreNames = { contains: function () { return true; } }; }
    DB.prototype.transaction = function () { return new Tx(); };
    DB.prototype.createObjectStore = function () { return new Store(); };
    DB.prototype.close = function () {};
    var shim = {
      open: function () {
        var r = new Req();
        r.result = new DB();
        fire(r, 'success', r);
        return r;
      },
      deleteDatabase: function () { var r = new Req(); fire(r, 'success'); return r; },
      __rdShim: true
    };
    try {
      Object.defineProperty(window, 'indexedDB', { value: shim, configurable: true, writable: true });
    } catch (e) {
      window.indexedDB = shim;
    }
  }

  // 2. Audio unlock: WebKit keeps an AudioContext suspended until resume() is
  //    called inside a user gesture. Track every context SDL creates and
  //    resume them on each gesture; also route the session to "playback" so
  //    the ring/silent switch does not mute the game (Safari 16.4+).
  var audioContexts = [];
  function installAudioUnlock() {
    ['AudioContext', 'webkitAudioContext'].forEach(function (name) {
      var Orig = window[name];
      if (!Orig || Orig.__rdWrapped) return;
      var Wrapped = function (opts) {
        // hand SDL the context created (and unlocked) inside the start tap
        if (RD._prewarmedAudio && !RD._prewarmedAudio.__rdTaken) {
          var pre = RD._prewarmedAudio;
          pre.__rdTaken = true;
          return pre;
        }
        var ctx = opts ? new Orig(opts) : new Orig();
        audioContexts.push(ctx);
        return ctx;
      };
      if (!RD._OrigAudioContext) RD._OrigAudioContext = Orig;
      Wrapped.prototype = Orig.prototype;
      Wrapped.__rdWrapped = true;
      window[name] = Wrapped;
    });
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* optional API */ }
    var resumeAll = function () {
      for (var i = 0; i < audioContexts.length; i++) {
        var c = audioContexts[i];
        if (c.state === 'suspended' && !RD.paused) { try { c.resume(); } catch (e) {} }
      }
    };
    ['touchend', 'pointerup', 'keydown', 'mousedown'].forEach(function (t) {
      window.addEventListener(t, resumeAll, { capture: true, passive: true });
    });
    RD.resumeAudio = resumeAll;
    // must run inside a user gesture (the start button)
    RD.prewarmAudio = function () {
      if (RD._prewarmedAudio || !RD._OrigAudioContext) return;
      try {
        var ctx = new RD._OrigAudioContext();
        audioContexts.push(ctx);
        ctx.resume();
        RD._prewarmedAudio = ctx;
      } catch (e) { log('warn', 'audio prewarm failed: ' + e); }
    };
    RD.suspendAudio = function () {
      for (var i = 0; i < audioContexts.length; i++) { try { audioContexts[i].suspend(); } catch (e) {} }
    };
  }

  // 3. Frame cap: love.js drives LÖVE from requestAnimationFrame. On 120 Hz
  //    ProMotion displays a 60 fps cap halves CPU/GPU work; 0 = display rate.
  var frameStats = { frames: 0, since: performance.now(), lastFps: 0, workMs: 0, maxWorkMs: 0, skipped: 0 };
  function installFrameCap() {
    var nativeRAF = window.requestAnimationFrame.bind(window);
    var last = 0;
    window.requestAnimationFrame = function (cb) {
      return nativeRAF(function tick(ts) {
        var cap = RD.fpsCap || 0;
        if (cap > 0 && last && ts - last < 1000 / cap - 2) {
          return nativeRAF(tick);
        }
        // cooperative pacing: the game asked not to run before RD.nextWake
        if (RD.nextWake && ts < RD.nextWake - 2) {
          frameStats.skipped++;
          return nativeRAF(tick);
        }
        RD.nextWake = 0;
        last = ts;
        if (checkEngineFault()) return; // stop driving a corrupted runtime
        frameStats.frames++;
        var t0 = performance.now();
        cb(ts);
        var work = performance.now() - t0;
        frameStats.workMs += work;
        if (work > frameStats.maxWorkMs) frameStats.maxWorkMs = work;
      });
    };
  }

  // 4. love.system.openURL (window.open) and message boxes (alert) go to the
  //    host; nothing is ever opened inside the player.
  function installWindowHooks() {
    window.open = function (url) {
      url = String(url || '');
      if (/^https:\/\//i.test(url)) host.post('openURL', { url: url });
      else log('warn', 'blocked window.open: ' + url.slice(0, 200));
      return null;
    };
    window.alert = function (msg) { log('warn', 'alert: ' + msg); };
    window.confirm = function () { return false; };
    window.prompt = function () { return null; };
  }

  // ------------------------------------------------------------------ loader
  var chunkSinks = {};
  RD.chunk = function (blobId, index, b64) {
    var sink = chunkSinks[blobId];
    if (!sink) return;
    sink.onChunk(index, b64);
  };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { s.remove(); resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function useFetch(desc) {
    if (cfg.transport === 'fetch') return true;
    if (cfg.transport === 'chunks') return false;
    return !!desc.url && /^https?:$/.test(location.protocol);
  }

  // desc: { id, url?, chunks?: [src], chunkSize, size, sha256? }
  function loadBlob(desc, onProgress) {
    if (useFetch(desc)) {
      return fetch(desc.url).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + desc.url);
        return r.arrayBuffer();
      }).then(function (buf) { onProgress && onProgress(1); return new Uint8Array(buf); });
    }
    if (!desc.chunks || !desc.chunks.length) return Promise.reject(new Error('no transport for blob ' + desc.id));
    return new Promise(function (resolve, reject) {
      var out = new Uint8Array(desc.size);
      var got = 0;
      var received = 0;
      chunkSinks[desc.id] = {
        onChunk: function (index, b64) {
          got += b64ToBytesInto(b64, out, index * desc.chunkSize);
          received++;
          onProgress && onProgress(received / desc.chunks.length);
        }
      };
      var seq = Promise.resolve();
      desc.chunks.forEach(function (src) { seq = seq.then(function () { return loadScript(src); }); });
      seq.then(function () {
        delete chunkSinks[desc.id];
        if (received !== desc.chunks.length || got !== desc.size) {
          throw new Error('blob ' + desc.id + ' incomplete: ' + got + '/' + desc.size + ' bytes');
        }
        resolve(out);
      }).catch(function (e) { delete chunkSinks[desc.id]; reject(e); });
    });
  }

  function verifyBlob(desc, bytes) {
    if (!cfg.verify || !desc.sha256) return Promise.resolve(true);
    return sha256(bytes).then(function (h) {
      if (h === null) { log('info', 'WebCrypto unavailable; ' + desc.id + ' was verified by the host'); return true; }
      if (h !== desc.sha256.toLowerCase()) throw new Error('integrity check failed for ' + desc.id + ' (expected ' + desc.sha256 + ', got ' + h + ')');
      return true;
    });
  }

  // ------------------------------------------------------------------ pack
  // RDPK v1 (little endian): "RDPK" u8 ver u8 flags u16 rsv u32 count, then
  // per entry: u16 pathLen, path, u8 type (0 file, 1 dir), u32 size,
  // f64 mtime (s), data.
  var Pack = (RD.Pack = {
    parse: function (bytes, onEntry) {
      var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (bytes.length < 12 || bytes[0] !== 82 || bytes[1] !== 68 || bytes[2] !== 80 || bytes[3] !== 75) throw new Error('not an RDPK pack');
      if (bytes[4] !== 1) throw new Error('unsupported RDPK version ' + bytes[4]);
      var count = dv.getUint32(8, true);
      var p = 12;
      for (var i = 0; i < count; i++) {
        var plen = dv.getUint16(p, true); p += 2;
        var path = textDecoder.decode(bytes.subarray(p, p + plen)); p += plen;
        var type = bytes[p]; p += 1;
        var size = dv.getUint32(p, true); p += 4;
        var mtime = dv.getFloat64(p, true); p += 8;
        if (p + size > bytes.length) throw new Error('RDPK truncated at ' + path);
        onEntry({ path: path, type: type, size: size, mtime: mtime, data: bytes.subarray(p, p + size) });
        p += size;
      }
      return count;
    },
    build: function (entries) {
      var total = 12;
      var encoded = entries.map(function (e) {
        var pb = textEncoder.encode(e.path);
        total += 2 + pb.length + 1 + 4 + 8 + (e.data ? e.data.length : 0);
        return pb;
      });
      var out = new Uint8Array(total);
      var dv = new DataView(out.buffer);
      out.set([82, 68, 80, 75, 1, 0, 0, 0]);
      dv.setUint32(8, entries.length, true);
      var p = 12;
      entries.forEach(function (e, i) {
        var pb = encoded[i];
        dv.setUint16(p, pb.length, true); p += 2;
        out.set(pb, p); p += pb.length;
        out[p] = e.type || 0; p += 1;
        var size = e.data ? e.data.length : 0;
        dv.setUint32(p, size, true); p += 4;
        dv.setFloat64(p, e.mtime || 0, true); p += 8;
        if (size) { out.set(e.data, p); p += size; }
      });
      return out;
    }
  });

  // ------------------------------------------------------------------ fs
  var Module = null;
  function safeRel(path) {
    return typeof path === 'string' && path.length > 0 && path.length <= 512 &&
      path.charAt(0) !== '/' && path.indexOf('..') < 0 && path.indexOf('\\') < 0;
  }
  function mkdirp(abs) {
    var rel = abs.replace(/^\/+/, '');
    if (rel) Module.FS_createPath('/', rel, true, true);
  }
  function writeFile(abs, bytes) {
    var i = abs.lastIndexOf('/');
    var dir = i > 0 ? abs.slice(0, i) : '/';
    var name = abs.slice(i + 1);
    mkdirp(dir);
    try { Module.FS_unlink(abs); } catch (e) { /* not there */ }
    Module.FS_createDataFile(dir, name, bytes, true, true, true);
  }
  function extractPack(bytes, destRoot) {
    return Pack.parse(bytes, function (e) {
      if (!safeRel(e.path)) { log('warn', 'pack entry rejected: ' + e.path); return; }
      var abs = destRoot + '/' + e.path;
      if (e.type === 1) mkdirp(abs); else writeFile(abs, e.data);
    });
  }
  RD.fs = { writeFile: writeFile, mkdirp: mkdirp };

  // ------------------------------------------------------------------ engine faults
  // love.js compat builds have no C++ landing pads in LÖVE's Lua wrappers: a
  // love::Exception unwinds to the next Lua pcall (setjmp) and is swallowed
  // there, corrupting the Lua VM. rd_host/firewall.lua prevents the known
  // cases; this monitor catches the rest: a throw that is not followed by a
  // __cxa_begin_catch before the next frame was swallowed. The runtime is
  // then stopped cleanly and nothing produced afterwards is persisted.
  var lastStdout = '';
  var pendingThrow = null;
  RD.engineFault = null;
  function installExceptionMonitor(env) {
    var origThrow = env.__cxa_throw;
    var origBegin = env.__cxa_begin_catch;
    if (typeof origThrow === 'function') {
      env.__cxa_throw = function (ptr, type, destructor) {
        pendingThrow = { message: lastStdout || 'unknown engine exception', t: performance.now() };
        if (cfg.traceExceptions) log('info', 'TRACE __cxa_throw ' + pendingThrow.message);
        return origThrow.apply(this, arguments);
      };
    }
    if (typeof origBegin === 'function') {
      env.__cxa_begin_catch = function () {
        pendingThrow = null; // caught by C++ as intended
        return origBegin.apply(this, arguments);
      };
    }
  }
  function checkEngineFault() {
    if (!pendingThrow || RD.engineFault) return !!RD.engineFault;
    RD.engineFault = pendingThrow;
    pendingThrow = null;
    log('error', 'engine exception escaped to Lua (swallowed by pcall): ' + RD.engineFault.message);
    try { Module && Module.pauseMainLoop && Module.pauseMainLoop(); } catch (e) {}
    ui.fail('The game engine hit an unrecoverable error.', RD.engineFault.message +
      '\n\nThe session was stopped to protect your save data. Your last saved progress is safe.');
    host.post('engineFault', { message: RD.engineFault.message });
    return true;
  }
  RD.checkEngineFault = checkEngineFault;

  // GLSL validation in the SAME WebGL context LÖVE renders with.
  function validateGLSL(vsrc, psrc) {
    var gl = Module && Module.ctx;
    if (!gl) return { ok: true, skipped: 'no context' };
    var stages = [];
    if (typeof vsrc === 'string') stages.push(['vertex', gl.VERTEX_SHADER, vsrc]);
    if (typeof psrc === 'string') stages.push(['pixel', gl.FRAGMENT_SHADER, psrc]);
    for (var i = 0; i < stages.length; i++) {
      var sh = gl.createShader(stages[i][1]);
      if (!sh) return { ok: true, skipped: 'createShader failed' };
      gl.shaderSource(sh, stages[i][2]);
      gl.compileShader(sh);
      var ok = gl.getShaderParameter(sh, gl.COMPILE_STATUS);
      var infoLog = gl.getShaderInfoLog(sh) || '';
      gl.deleteShader(sh);
      if (!ok && !gl.isContextLost()) {
        return { ok: false, stage: stages[i][0], log: 'Cannot compile ' + stages[i][0] + ' shader code:\n' + infoLog };
      }
    }
    return { ok: true };
  }
  RD.validateGLSL = validateGLSL;

  // ------------------------------------------------------------------ bridge
  var replyDir = '/rd/reply';
  var inboxSeq = 0;
  function writeText(abs, text) { writeFile(abs, textEncoder.encode(text)); }

  function reply(id, result, error) {
    writeText(replyDir + '/' + id + '.json', JSON.stringify({ result: result === undefined ? null : result, error: error || null }));
  }

  // host -> Lua (asynchronous inbox)
  RD.toLua = function (topic, data) {
    if (!Module || !Module.calledRun) return false;
    inboxSeq++;
    writeText('/rd/inbox/' + inboxSeq + '.json', JSON.stringify({ topic: topic, data: data === undefined ? null : data }));
    writeText('/rd/inbox/head', String(inboxSeq));
    return true;
  };

  var bridgeHandlers = {
    log: function (m) { log(m.data && m.data.level || 'info', 'lua: ' + (m.data && m.data.text)); },
    stage: function (m) { log('info', 'stage ' + JSON.stringify(m.data)); host.post('stage', m.data); },
    ready: function (m) {
      RD.ready = true;
      log('info', 'game ready ' + JSON.stringify(m.data));
      ui.hide();
      host.post('ready', m.data);
    },
    error: function (m) { log('error', 'lua error: ' + (m.data && m.data.message)); host.post('error', m.data); },
    quit: function (m) { onQuit(m.data); },
    quitToLauncher: function () { host.post('quitToLauncher', {}); },
    haptic: function (m) { host.post('haptic', m.data); },
    openURL: function (m) {
      var url = m.data && m.data.url;
      var ok = typeof url === 'string' && /^https:\/\//i.test(url) && url.length <= 2048;
      if (ok) host.post('openURL', { url: url });
      if (m.wantsReply) reply(m.id, ok, ok ? null : 'refused');
    },
    pong: function (m) { host.post('pong', m.data); },
    'frame.wake': function (m) {
      var sec = m.data && Number(m.data.s);
      if (sec > 0) RD.nextWake = performance.now() + Math.min(2000, sec * 1000);
    },
    'glsl.validate': function (m) {
      var res;
      try { res = validateGLSL(m.data && m.data.vertex, m.data && m.data.pixel); }
      catch (e) { res = { ok: true, skipped: String(e) }; }
      if (!res.ok) log('warn', 'shader rejected before compile (' + res.stage + ')');
      if (m.wantsReply) reply(m.id, res, null);
    },
    diagnostics: function (m) { host.post('diagnostics', m.data); },
    perf: function (m) { host.post('perf', m.data); },
    selftest: function (m) { log('info', 'selftest ' + JSON.stringify(m.data)); host.post('selftest', m.data); },
    'persist.file': function (m) { persist.beginFile(m.data); },
    'persist.remove': function (m) { persist.remove(m.data && m.data.path); },
    'persist.dir': function (m) { persist.dir(m.data && m.data.path); },
    'persist.batch': function (m) { persist.batchDone(m.data); }
  };

  function onPrint(text) {
    if (typeof text === 'string' && text.indexOf(BRIDGE_MARK) === 0) {
      var msg;
      try { msg = JSON.parse(text.slice(BRIDGE_MARK.length)); } catch (e) { log('warn', 'bad bridge line'); return; }
      if (!msg || typeof msg.topic !== 'string') return;
      var h = bridgeHandlers[msg.topic];
      if (h) {
        try { h(msg); } catch (e) { log('error', 'bridge handler ' + msg.topic + ': ' + e); }
      } else if (msg.wantsReply) {
        reply(msg.id, null, 'unknown topic ' + msg.topic);
      }
      return;
    }
    lastStdout = String(text).slice(0, 500);
    log('info', 'stdout: ' + text);
  }

  // ------------------------------------------------------------------ persistence
  var persist = (RD.persist = {
    current: null,           // { path, size, buf, pos, modtime }
    userFiles: [],           // pending user-data files
    userRemoves: [],
    userDirs: [],
    userBytes: 0,
    flushTimer: 0,
    cache: {},               // version -> { entries: [], snapshot: bool }
    pendingSnapshots: {},
    stats: { userFiles: 0, userBytes: 0, cachePacks: 0 },

    beginFile: function (d) {
      if (RD.engineFault) { this.current = null; log('warn', 'persist: dropped ' + (d && d.path) + ' after engine fault'); return; }
      if (!d || !safeRel(d.path) || typeof d.size !== 'number' || d.size < 0 || d.size > 256 * 1024 * 1024) {
        log('warn', 'persist: rejected file header'); this.current = null; return;
      }
      this.current = { path: d.path, size: d.size, buf: new Uint8Array(d.size), pos: 0, modtime: d.modtime || 0 };
      if (d.size === 0) this.finishFile();
    },
    onByte: function (b) {
      var c = this.current;
      if (!c) return;
      c.buf[c.pos++] = b;
      if (c.pos === c.size) this.finishFile();
    },
    finishFile: function () {
      var c = this.current;
      this.current = null;
      if (!c) return;
      if (c.path.indexOf('.rd/') === 0) return;
      var m = CACHE_RE.exec(c.path);
      if (m) {
        var ver = m[1];
        var bucket = this.cache[ver];
        if (bucket && bucket.snapshot) bucket.entries.push({ path: c.path, type: 0, mtime: c.modtime, data: c.buf });
        if (MARKER_RE.test(c.path) && !(bucket && bucket.snapshot)) this.requestCacheSnapshot(ver);
        return;
      }
      this.userFiles.push({ path: c.path, data: c.buf, modtime: c.modtime });
      this.userBytes += c.size;
      this.scheduleUserFlush();
    },
    remove: function (path) {
      if (!safeRel(path) || CACHE_RE.test(path) || path.indexOf('.rd/') === 0) return;
      this.userRemoves.push(path);
      this.scheduleUserFlush();
    },
    dir: function (path) {
      if (!safeRel(path) || path.indexOf('.rd') === 0) return;
      var m = /^([a-z]+)\//.exec(path);
      if (m && this.cache[m[1]] && this.cache[m[1]].snapshot) {
        this.cache[m[1]].entries.push({ path: path, type: 1, mtime: 0, data: null });
        return;
      }
      if (CACHE_RE.test(path + '/')) return;
      this.userDirs.push(path);
      this.scheduleUserFlush();
    },
    requestCacheSnapshot: function (ver) {
      if (this.pendingSnapshots[ver]) return;
      this.pendingSnapshots[ver] = true;
      log('info', 'cache for ' + ver + ' complete; snapshotting');
      this.cache[ver] = { entries: [], snapshot: true };
      RD.toLua('persist.snapshot', { prefix: ver });
    },
    batchDone: function (d) {
      if (d && d.reason === 'host-snapshot') {
        var self = this;
        Object.keys(this.cache).forEach(function (ver) {
          var bucket = self.cache[ver];
          if (bucket.snapshot && self.pendingSnapshots[ver]) self.sendCachePack(ver, bucket.entries);
        });
      }
      this.flushUser();
    },
    scheduleUserFlush: function () {
      var self = this;
      if (this.userBytes > 8 * 1024 * 1024) return this.flushUser();
      if (!this.flushTimer) this.flushTimer = setTimeout(function () { self.flushTimer = 0; self.flushUser(); }, 400);
    },
    flushUser: function () {
      if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = 0; }
      if (RD.engineFault) { this.userFiles = []; this.userRemoves = []; this.userDirs = []; this.userBytes = 0; return; }
      if (!this.userFiles.length && !this.userRemoves.length && !this.userDirs.length) return;
      var files = this.userFiles.map(function (f) { return { path: f.path, size: f.data.length, modtime: f.modtime, b64: bytesToB64(f.data) }; });
      var payload = { files: files, removes: this.userRemoves, dirs: this.userDirs };
      this.stats.userFiles += files.length;
      this.stats.userBytes += this.userBytes;
      this.userFiles = []; this.userRemoves = []; this.userDirs = []; this.userBytes = 0;
      host.post('persist.user', payload);
    },
    sendCachePack: function (ver, entries) {
      delete this.pendingSnapshots[ver];
      delete this.cache[ver];
      var pack = Pack.build(entries);
      var PART = 3 * 1024 * 1024;
      var parts = Math.ceil(pack.length / PART) || 1;
      var self = this;
      sha256(pack).then(function (digest) {
        host.post('persist.cache.begin', { version: ver, size: pack.length, parts: parts, entries: entries.length, sha256: digest });
        for (var i = 0; i < parts; i++) {
          host.post('persist.cache.part', { version: ver, index: i, b64: bytesToB64(pack.subarray(i * PART, Math.min(pack.length, (i + 1) * PART))) });
        }
        host.post('persist.cache.end', { version: ver, size: pack.length, sha256: digest });
        self.stats.cachePacks++;
        log('info', 'cache pack ' + ver + ': ' + entries.length + ' entries, ' + pack.length + ' bytes');
      });
    }
  });

  // ------------------------------------------------------------------ lifecycle
  var quitting = false;
  function onQuit(data) {
    if (quitting) return;
    quitting = true;
    persist.flushUser();
    try { Module.pauseMainLoop && Module.pauseMainLoop(); } catch (e) {}
    host.post('quit', data || {});
  }

  // Pause: the bridge mod stops the simulation, pending writes are flushed,
  // then the main loop itself is stopped (zero CPU while a native sheet
  // covers the game). Resume restarts the loop first.
  var pauseTimer = 0;
  RD.pause = function () {
    if (RD.paused) return;
    RD.paused = true;
    RD.toLua('pause', {});
    RD.toLua('persist.flush', {});
    RD.suspendAudio && RD.suspendAudio();
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(function () {
      if (RD.paused && Module && Module.pauseMainLoop) { try { Module.pauseMainLoop(); } catch (e) {} }
    }, 250);
  };
  RD.resume = function () {
    if (!RD.paused) return;
    RD.paused = false;
    clearTimeout(pauseTimer);
    try { Module && Module.resumeMainLoop && Module.resumeMainLoop(); } catch (e) {}
    RD.toLua('resume', {});
    RD.resumeAudio && RD.resumeAudio();
  };
  document.addEventListener('visibilitychange', function () {
    if (!RD.ready) return;
    if (document.hidden) { RD.toLua('persist.flush', {}); RD.suspendAudio && RD.suspendAudio(); }
    else if (!RD.paused) RD.resumeAudio && RD.resumeAudio();
  });

  // host -> player entry point (evaluateJavaScript)
  RD.receive = function (topic, data) {
    switch (topic) {
      case 'pause': RD.pause(); return true;
      case 'resume': RD.resume(); return true;
      case 'flush': return RD.toLua('persist.flush', {});
      case 'snapshot': return RD.toLua('persist.snapshot', data || {});
      case 'setFpsCap': RD.fpsCap = Math.max(0, Math.min(240, Number(data) || 0)); return true;
      case 'setPixelated': document.body.classList.toggle('pixelated', !!data); return true;
      case 'ping': return RD.toLua('ping', data || {});
      case 'stats': return collectStats();
      case 'logs': return RD.logs();
      default: log('warn', 'unknown host topic ' + topic); return false;
    }
  };

  function collectStats() {
    var now = performance.now();
    var dt = (now - frameStats.since) / 1000;
    var fps = dt > 0 ? frameStats.frames / dt : 0;
    var avgWork = frameStats.frames ? frameStats.workMs / frameStats.frames : 0;
    var maxWork = frameStats.maxWorkMs;
    var skipped = frameStats.skipped;
    frameStats.frames = 0; frameStats.since = now; frameStats.workMs = 0; frameStats.maxWorkMs = 0; frameStats.skipped = 0;
    frameStats.lastFps = fps;
    var mem = null;
    try { mem = Module && Module.HEAP8 ? Module.HEAP8.length : null; } catch (e) {}
    return { fps: Math.round(fps * 10) / 10, skippedRaf: skipped, frameMs: Math.round(avgWork * 10) / 10, maxFrameMs: Math.round(maxWork * 10) / 10, wasmHeap: mem, persist: persist.stats, ready: !!RD.ready, fault: RD.engineFault ? RD.engineFault.message : null };
  }

  // ------------------------------------------------------------------ boot
  function totalBytes(list) {
    return list.reduce(function (a, d) { return a + (d && d.size || 0); }, 0) || 1;
  }

  function boot() {
    RD.fpsCap = cfg.fpsCap;
    installIndexedDBShim();
    installAudioUnlock();
    installFrameCap();
    installWindowHooks();

    if (!cfg.runtime || !cfg.runtime.loveJs || !cfg.runtime.loveWasm || !cfg.game) {
      return fatal('Player configuration incomplete (runtime or game missing).');
    }
    var blobs = [cfg.runtime.loveWasm, cfg.game].concat(cfg.packs.map(function (p) { return p.blob; }), cfg.files.map(function (f) { return f.blob; }));
    var total = totalBytes(blobs);
    var done = 0;
    var loaded = {};
    function track(desc) {
      return function (f) { ui.setProgress((done + f * desc.size) / total); };
    }
    ui.setStatus('Loading runtime and game…');
    var seq = Promise.resolve();
    blobs.forEach(function (desc) {
      seq = seq.then(function () {
        return loadBlob(desc, track(desc)).then(function (bytes) {
          return verifyBlob(desc, bytes).then(function () { loaded[desc.id] = bytes; done += desc.size; });
        });
      });
    });
    seq.then(function () {
      ui.setStatus('Starting LÖVE…');
      return loadScript(cfg.runtime.loveJs.src);
    }).then(function () {
      if (typeof window.Love !== 'function') throw new Error('love.js did not define Love()');
      if (cfg.autoStart) return start(loaded);
      ui.setStatus('Ready');
      ui.start.classList.remove('hidden');
      ui.start.addEventListener('click', function once() {
        ui.start.removeEventListener('click', once);
        ui.start.classList.add('hidden');
        RD.prewarmAudio && RD.prewarmAudio();
        RD.resumeAudio && RD.resumeAudio();
        start(loaded);
      });
    }).catch(function (e) { fatal('Could not load the game', e); });
  }

  function start(loaded) {
    ui.setStatus('Booting…');
    var canvas = $('canvas');
    var rect = $('stage').getBoundingClientRect();
    var dpr = cfg.highdpi ? (window.devicePixelRatio || 1) : 1;
    var launch = {
      identity: cfg.identity,
      archive: '.rd/game.love',
      env: cfg.env || {},
      platform: cfg.platform || {},
      window: {
        width: Math.max(160, Math.round(rect.width)),
        height: Math.max(144, Math.round(rect.height)),
        highdpi: !!cfg.highdpi
      },
      dpr: dpr,
      bridge: true,
      selftest: !!cfg.selftest,
      perf: !!cfg.perf
    };
    Module = {
      arguments: ['/rd/host'].concat(cfg.args || []),
      INITIAL_MEMORY: Math.max(64, cfg.memoryMB | 0) * 1024 * 1024,
      canvas: canvas,
      wasmBinary: loaded[cfg.runtime.loveWasm.id],
      print: onPrint,
      printErr: function (t) { log('warn', 'stderr: ' + t); },
      setStatus: function (t) { if (t) log('info', 'status: ' + t); },
      monitorRunDependencies: function () {},
      onAbort: function (what) { fatal('The runtime aborted', what); },
      instantiateWasm: function (imports, receive) {
        installExceptionMonitor(imports.env || {});
        WebAssembly.instantiate(Module.wasmBinary, imports).then(function (r) {
          receive(r.instance, r.module);
        }, function (e) { fatal('WebAssembly instantiation failed', e); });
        return {};
      },
      preRun: [function () {
        try {
          ['rd/host', 'rd/inbox', 'rd/reply', 'rd/dev', 'rd/rom'].forEach(function (d) { Module.FS_createPath('/', d, true, true); });
          Module.FS_createDevice('/rd/dev', 'persist', null, function (b) { persist.onByte(b); });
          writeText('/rd/launch.json', JSON.stringify(launch));
          writeText('/rd/inbox/head', '0');
          cfg.packs.forEach(function (p) {
            if (p.dest === 'host') {
              var n = extractPack(loaded[p.blob.id], '/rd/host');
              log('info', 'host pack ' + p.id + ': ' + n + ' entries');
            }
          });
          cfg.files.forEach(function (f) {
            if (f.dest === 'rd' && safeRel(f.path)) writeFile('/rd/' + f.path, loaded[f.blob.id]);
          });
        } catch (e) { fatal('File system setup failed', e); throw e; }
      }],
      onRuntimeInitialized: function () {
        try {
          // IDBFS is mounted and (no-op) populated now: inject the save dir.
          mkdirp(SAVE_ROOT);
          writeFile(SAVE_ROOT + '/.rd/game.love', loaded[cfg.game.id]);
          cfg.packs.forEach(function (p) {
            if (p.dest === 'save') {
              var n = extractPack(loaded[p.blob.id], SAVE_ROOT);
              log('info', 'save pack ' + p.id + ': ' + n + ' entries');
            }
          });
          cfg.files.forEach(function (f) {
            if (f.dest === 'save' && safeRel(f.path)) writeFile(SAVE_ROOT + '/' + f.path, loaded[f.blob.id]);
          });
          // the JS copies are owned by MEMFS now; drop our references
          Object.keys(loaded).forEach(function (k) { loaded[k] = null; });
          host.post('stage', { stage: 'runtime' });
        } catch (e) { fatal('Save directory setup failed', e); throw e; }
      }
    };
    RD.module = Module; // diagnostics only
    try {
      window.Love(Module);
    } catch (e) {
      fatal('LÖVE failed to start', e);
    }
    if (cfg.statsInterval > 0) setInterval(function () { host.post('stats', collectStats()); }, cfg.statsInterval);
  }

  RD.boot = boot;
  if (!cfg.manualBoot) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  }
})();
