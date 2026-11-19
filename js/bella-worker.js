// Bella's worker (web 6.0.0): the Kokoro voice model, run with ONNX Runtime Web in
// a thread of its own so the game never waits for it.
//
// What it is given: the addresses of ONNX Runtime Web (MIT), the model and the
// voices, and then lines to say as the model's numbers (made from the game's own
// hand-written dictionary by js/bella-words.js; nothing here reads text). What it
// gives back: the spoken sound, 24000 samples a second, and how long it took.
//
// The files come from the internet the first time and are kept by the browser
// (the Cache API), so they download once. Lines are made one at a time, the ones
// wanted now before the ones being prepared ahead; a line no longer wanted is
// dropped before it is started.
//
// More voices on request (web 6.0.0, Ultimate Mode's safe zone characters,
// js/modes/ultimate/cast.js): { type: 'voice', name, url } loads that voice's style
// file (kept like the others) and answers { type: 'voice', name, ok }. A line can be
// asked for in any loaded voice; British voices are simply given British phonemes.
//
// No GPL code: the model is fed phoneme numbers directly. kokoro-js and eSpeak NG
// are not used.

/* global ort */
const STYLE_DIM = 256;
const STYLE_ROWS = 510;
let session = null;
let inputNames = [];
const voices = new Map();      // name -> Float32Array (510 x 256)
let queue = [];                // [{ id, ids, voice, speed, now }]
let busy = false;
let current = null;            // the line being made now
let cacheName = 'endless-labyrinth-voice-v1';

function post(msg, transfer) { self.postMessage(msg, transfer || []); }

// A file from the browser's cache, or from the internet (and then kept). Progress
// is reported for the big one.
async function fetchKept(url, progress) {
  let cache = null;
  try { cache = await caches.open(cacheName); } catch (e) { cache = null; }
  if (cache) {
    try {
      const hit = await cache.match(url);
      if (hit && hit.ok) return await hit.arrayBuffer();
    } catch (e) { /* read afresh */ }
  }
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  let buf;
  const total = Number(res.headers.get('Content-Length') || 0);
  if (progress && res.body && res.body.getReader) {
    const reader = res.body.getReader();
    const parts = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      progress(got, total);
    }
    const all = new Uint8Array(got);
    let at = 0;
    for (const p of parts) { all.set(p, at); at += p.length; }
    buf = all.buffer;
  } else buf = await res.arrayBuffer();
  if (cache) {
    try { await cache.put(url, new Response(buf.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } })); } catch (e) { /* storage full: it downloads again next time */ }
  }
  return buf;
}

// A voice's style file, once: 510 rows of 256 numbers.
const voiceLoads = new Map();   // name -> Promise of true/false
function loadVoice(name, url) {
  if (voices.has(name)) return Promise.resolve(true);
  if (!voiceLoads.has(name)) {
    voiceLoads.set(name, fetchKept(url).then((buf) => {
      const f = new Float32Array(buf);
      if (f.length < STYLE_ROWS * STYLE_DIM) throw new Error(`${name}: the voice file is too short`);
      voices.set(name, f);
      return true;
    }).catch(() => { voiceLoads.delete(name); return false; }));
  }
  return voiceLoads.get(name);
}

// ONNX Runtime Web's script. On an isolated page a script from another site is only
// let in if that site marks it so; fetched as text (which jsDelivr allows any site
// to do) and run from here, it always is. If that cannot be done, the plain way.
let threads = 1;
async function loadEngine(url) {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(String(res.status));
    const blob = URL.createObjectURL(new Blob([await res.text()], { type: 'text/javascript' }));
    try { importScripts(blob); } finally { URL.revokeObjectURL(blob); }
    if (typeof ort === 'undefined') throw new Error('not loaded');
  } catch (e) {
    importScripts(url);
  }
}

async function init(msg) {
  let stage = 'engine';
  try {
    if (msg.cacheName) cacheName = msg.cacheName;
    if (typeof ort === 'undefined') await loadEngine(msg.ortUrl);
    ort.env.wasm.wasmPaths = msg.wasmPaths;
    // Several processor threads make the voice several times faster, but a browser
    // only allows them on a cross-origin isolated page. GitHub Pages does not send
    // the headers for that, so the site's service worker (sw.js) adds them; without
    // it (or in a browser without threads) the model runs on one thread as before.
    threads = (self.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined')
      ? Math.max(1, Math.min(8, Math.floor(Number(msg.threads) || 1))) : 1;
    ort.env.wasm.numThreads = threads;
    ort.env.wasm.proxy = false;
    stage = 'voices';
    for (const [name, url] of Object.entries(msg.voices || {})) {
      const buf = await fetchKept(url);
      const f = new Float32Array(buf);
      if (f.length < STYLE_ROWS * STYLE_DIM) throw new Error(`${name}: the voice file is too short`);
      voices.set(name, f);
    }
    stage = 'model';
    const model = await fetchKept(msg.modelUrl, (got, total) => post({ type: 'progress', got, total }));
    stage = 'loading';
    session = await ort.InferenceSession.create(new Uint8Array(model), {
      executionProviders: ['wasm'], graphOptimizationLevel: 'all',
    });
    inputNames = session.inputNames.slice();
    stage = 'speaking';
    // One short word, so the first real line is not the slow one and the model is
    // known to speak before the game trusts it.
    const t0 = performance.now();
    const first = voices.keys().next().value;
    const test = await run(msg.testIds || [123, 86, 46, 156, 51], first, 1.0);
    if (!test || test.length < 2400) throw new Error('the model made no sound');
    post({ type: 'ready', inputs: inputNames, warmMs: performance.now() - t0, threads, isolated: !!self.crossOriginIsolated });
  } catch (e) {
    post({ type: 'failed', stage, error: String(e && e.message || e), threads });
  }
}

function styleFor(voice, count) {
  const v = voices.get(voice);
  if (!v) throw new Error(`no voice ${voice}`);
  const row = Math.max(0, Math.min(count, STYLE_ROWS - 1));
  return v.slice(row * STYLE_DIM, (row + 1) * STYLE_DIM);
}

async function run(ids, voice, speed) {
  const n = ids.length;
  const feeds = {};
  for (const name of inputNames) {
    const low = name.toLowerCase();
    if (low === 'input_ids' || low === 'tokens') {
      const t = new BigInt64Array(n + 2);
      for (let i = 0; i < n; i++) t[i + 1] = BigInt(ids[i]);
      feeds[name] = new ort.Tensor('int64', t, [1, n + 2]);
    } else if (low === 'style') {
      feeds[name] = new ort.Tensor('float32', styleFor(voice, n), [1, STYLE_DIM]);
    } else if (low === 'speed') {
      feeds[name] = new ort.Tensor('float32', new Float32Array([speed]), [1]);
    }
  }
  const out = await session.run(feeds);
  const wave = out[session.outputNames[0]];
  return wave ? Float32Array.from(wave.data) : null;
}

async function pump() {
  if (busy || !session) return;
  const item = queue.shift();
  if (!item) return;
  busy = true;
  current = item;
  const t0 = performance.now();
  try {
    const samples = await run(item.ids, item.voice, item.speed);
    const ms = performance.now() - t0;
    if (samples) post({ type: 'audio', id: item.id, samples, ms, waited: t0 - item.at, behind: !!item.behind }, [samples.buffer]);
    else post({ type: 'error', id: item.id, error: 'no sound' });
  } catch (e) {
    post({ type: 'error', id: item.id, error: String(e && e.message || e) });
  }
  busy = false;
  current = null;
  setTimeout(pump, 0);
}

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type === 'init') init(msg);
  else if (msg.type === 'voice') {
    if (!msg.name || !msg.url || !/^[a-z]{2}_[a-z0-9_]+$/i.test(msg.name)) { post({ type: 'voice', name: msg.name, ok: false }); return; }
    loadVoice(msg.name, msg.url).then((ok) => post({ type: 'voice', name: msg.name, ok }));
  }
  else if (msg.type === 'synth') {
    const item = { id: msg.id, ids: msg.ids, voice: msg.voice, speed: msg.speed || 1.0, now: !!msg.now, lead: !!msg.lead, at: performance.now(),
      // (Waiting behind a line that was being made ahead is not the device being slow.)
      behind: !!(current && !current.now) };
    // Lines wanted now go before every line being prepared ahead.
    if (item.now) {
      const k = queue.findIndex((q) => !q.now);
      if (k < 0) queue.push(item); else queue.splice(k, 0, item);
    } else if (item.lead) {
      // (6.0.1) The guide's calls: made ahead, but before every other line made ahead.
      const k = queue.findIndex((q) => !q.now && !q.lead);
      if (k < 0) queue.push(item); else queue.splice(k, 0, item);
    } else queue.push(item);
    pump();
  } else if (msg.type === 'cancel') {
    const drop = new Set(msg.ids || []);
    const keep = [];
    for (const q of queue) {
      if (drop.has(q.id) || (msg.all && (msg.all === true || q.voice === msg.all))) post({ type: 'dropped', id: q.id });
      else keep.push(q);
    }
    queue = keep;
  }
};
