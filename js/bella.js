// Bella (web 6.0.0): the game's voice during a run, and the Find the Voice guide.
//
// Russell's design (19 November 2026):
// - During a run the game speaks with Kokoro's American female voice Bella
//   (af_bella), played through the game's own sound so it is heard in the room's
//   echo like everything else. Menus, help, settings, the Events menu, event
//   descriptions, Game Over and the final score keep the device's own voice
//   (js/speech.js decides which; this file only says lines it is given).
// - No GPL code: the Kokoro model (hexgrad/Kokoro-82M, Apache 2.0; the ONNX copy
//   published by onnx-community) is run directly with ONNX Runtime Web (MIT), in a
//   worker (js/bella-worker.js), fed phonemes from the game's own hand-written
//   dictionary (js/bella-lexicon.js, js/bella-words.js). kokoro-js and eSpeak NG
//   are not used.
// - Most important rule: a line with any word the dictionary does not have is said
//   by the device's voice. Never silence and never a wrong sound. The same goes for
//   anything else that is not right: the files not downloaded yet (the browser
//   fetches them once, alongside the sound packs, and keeps them), no internet,
//   the model failing, a line not made in time, or a device that cannot keep up.
//   That last one is noticed by itself (the voice made slower than it is spoken,
//   lines missing their moment, the queue backing up), and from then on the device
//   voice is used for the rest of the visit. All of it silently: there is no
//   setting.
// - One fixed, normal speed, whatever the Speech Rate setting. About 5% louder than
//   the device voice. Centred (never placed in 3D), with the echo of the room or
//   area the player is in; in Ultimate Mode it never passes through the world's
//   muffle (the compass) or its fade, but keeps the world's echo.
// - A new line cuts off whatever Bella is saying.
// - Common lines are made ahead (prepare); a line made once is kept for the visit,
//   up to a limit, so lines that change (numbers) are the only ones made on the spot.
//
// The Find the Voice guide (GuideVoice, below) speaks with Kokoro's Heart
// (af_heart), from js/data/guide_phrases.json, shared word for word with the
// Windows game's Dev Builds/guide_phrases.json.

import { toPhonemes, toTokens, sentences, MAX_TOKENS } from './bella-words.js';
import { RULES } from './sound-rules.js';

export const ORT_VERSION = '1.20.1';
export const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
export const ORT_SCRIPT = ORT_BASE + 'ort.wasm.min.js';
export const KOKORO_BASE = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/';
export const MODEL_URL = KOKORO_BASE + 'onnx/model_quantized.onnx';
export const BELLA = 'af_bella';
export const HEART = 'af_heart';
export const VOICE_URLS = Object.freeze({
  [BELLA]: KOKORO_BASE + 'voices/af_bella.bin',
  [HEART]: KOKORO_BASE + 'voices/af_heart.bin',
});
export const CACHE_NAME = 'endless-labyrinth-voice-v1';
export const SAMPLE_RATE = 24000;      // what the model makes
export const SPEED = 1.0;              // one fixed, normal speed
// The level every line is set to (its loudness, RMS) before it plays: a usual level
// for a device's own voice, and Bella about 5% over it (Russell). Set by ear.
export const SPEECH_RMS = 0.11;
export const BELLA_LOUDER = 1.05;
export const GUIDE_RMS = 0.11;
// The guide's calls kept made and waiting while no Find the Voice run is played.
export const GUIDE_STANDING = 4;
// A line wanted now and not made within this long is said by the device voice this
// time (it is still kept for next time). Later sentences of a long line get longer.
export const DEADLINE_MS = 1200;
export const NEXT_DEADLINE_MS = 1500;
export const SENTENCE_GAP_MS = 120;
// Noticing a device that cannot keep up (see _note): the voice made slower than it
// is spoken over the last few lines, a few lines in a row missing their moment, or
// a line waiting this long behind others.
// (6.0.1: these gave up too soon, and for the whole visit. Lines are made ahead, so
// a device somewhat slower than speech still has most of them ready; and a slow
// patch, such as the first minute while a run's lines are all being made, passes.
// So the limits are wider, and giving up is a rest of STRUGGLE_REST_MS, after which
// Bella tries again.)
export const STRUGGLE_RTF = 2.5;
export const STRUGGLE_SAMPLES = 5;
export const STRUGGLE_MISSES = 6;
export const STRUGGLE_WAIT_MS = 8000;
export const STRUGGLE_REST_MS = 60000;
// How many processor threads the voice model may use where the browser allows more
// than one (see bella-worker.js and sw.js): one is always left for the game.
export function voiceThreads(cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2) {
  return Math.max(1, Math.min(4, Math.floor(cores) - 1));
}
// Lines kept for the visit (a phone's memory): about three minutes of speech.
export const KEEP_BYTES = 18e6;

// The lines prepared as soon as Bella is ready: the fixed lines of a run, and the
// counts and clocks said most often. Anything else is kept once it has been said.
export const COMMON_LINES = (() => {
  const lines = [
    'Battle mode started.', 'Tower Mode.', 'Island Mode.', 'Driving Mode. Two minutes.',
    'Chaos Mode. Five minutes.', 'Compass off.', 'Low air.', 'No pings left.', 'Resuming.',
    'Game resumed.', 'There is no clock in this event.', 'Compass not available on the slide.',
    'Compass not available on the bus.', 'Compass not available in the elevator.', 'Ring once.',
  ];
  for (let n = 1; n <= 12; n++) lines.push(`Level ${n}.`);
  for (const n of [30, 20, 10, 5, 4, 3, 2, 1]) lines.push(`${n} second${n === 1 ? '' : 's'} left.`, `${n} second${n === 1 ? '' : 's'} remaining.`);
  for (const n of [1, 2, 3, 4]) lines.push(`${n} minute${n === 1 ? '' : 's'} left.`);
  for (let n = 2; n <= 6; n++) lines.push(`Ring ${n} times.`);
  return lines;
})();

// ------------------------------------------------------------------ sound shaping
// A raw line from the model made ready to play: the silence before and after cut
// to a breath, set to one loudness, never over the top, and eased in and out.
export function shape(samples, rms = SPEECH_RMS, rate = SAMPLE_RATE) {
  const x = samples;
  let peak = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; }
  if (!(peak > 0)) return null;
  const floor = 0.02 * peak;
  let a = 0; let b = x.length - 1;
  while (a < x.length && Math.abs(x[a]) <= floor) a++;
  while (b > a && Math.abs(x[b]) <= floor) b--;
  const pad = Math.round(0.03 * rate);
  a = Math.max(0, a - pad); b = Math.min(x.length - 1, b + pad);
  const y = x.slice(a, b + 1);
  let sum = 0;
  for (let i = 0; i < y.length; i++) sum += y[i] * y[i];
  const now = Math.sqrt(sum / Math.max(1, y.length));
  if (!(now > 1e-6)) return null;
  let g = rms / now;
  if (peak * g > 0.97) g = 0.97 / peak;
  const edge = Math.min(Math.floor(y.length / 2), Math.round(0.005 * rate));
  for (let i = 0; i < y.length; i++) {
    let e = 1;
    if (i < edge) e = i / edge; else if (i >= y.length - edge) e = (y.length - 1 - i) / edge;
    y[i] *= g * e;
  }
  return y;
}

function makeBuffer(ctx, samples, rate = SAMPLE_RATE) {
  let buf;
  try { buf = new AudioBuffer({ length: Math.max(1, samples.length), numberOfChannels: 1, sampleRate: rate }); } catch (e) { buf = ctx.createBuffer(1, Math.max(1, samples.length), rate); }
  if (buf.copyToChannel) buf.copyToChannel(samples, 0); else buf.getChannelData(0).set(samples);
  return buf;
}

const later = (ms) => new Promise((r) => setTimeout(() => r(null), ms));

// ------------------------------------------------------------------ the engine
// The worker and its state, shared by Bella and the guide (one model in memory).
export class KokoroEngine {
  constructor({ makeWorker = null } = {}) {
    this.threads = voiceThreads();  // asked for; threadsUsed is what the browser allowed
    this.threadsUsed = 1;
    this.makeWorker = makeWorker || (() => new Worker(new URL('./bella-worker.js' + new URL(import.meta.url).search, import.meta.url)));
    this.worker = null;
    this.state = 'idle';            // idle, loading, ready, failed
    this.error = '';
    this.progress = 0;              // 0..1 while the model downloads
    this.nextId = 1;
    this.jobs = new Map();          // id -> { resolve, voice, frames }
    this.onReady = [];
    this.voicesIn = new Set(Object.keys(VOICE_URLS));   // voices the worker has (once ready)
    this.voiceWaits = new Map();    // name -> [resolve]
  }

  // Whether the worker has this voice's style (Bella and Heart from the start; others
  // once loaded).
  voiceLoaded(name) { return this.ready && this.voicesIn.has(name); }

  // Load another Kokoro voice (a safe zone character's, voices/<name>.bin from the
  // same place as Bella's, kept by the browser). Resolves true or false; false at once
  // when the engine is not ready or has failed (the character uses the device voice).
  loadVoice(name) {
    if (this.voiceLoaded(name)) return Promise.resolve(true);
    if (!this.ready || !this.worker || !/^[a-z]{2}_[a-z0-9_]+$/i.test(String(name || ''))) return Promise.resolve(false);
    return new Promise((resolve) => {
      const waits = this.voiceWaits.get(name);
      if (waits) { waits.push(resolve); return; }
      this.voiceWaits.set(name, [resolve]);
      this.worker.postMessage({ type: 'voice', name, url: `${KOKORO_BASE}voices/${name}.bin` });
    });
  }

  // Start the download (once). Safe to call again.
  start() {
    if (this.state !== 'idle') return;
    this.state = 'loading';
    try {
      this.worker = this.makeWorker();
    } catch (e) {
      this._fail('worker', e);
      return;
    }
    this.worker.onmessage = (e) => this._message(e.data || {});
    this.worker.onerror = (e) => { if (this.state !== 'ready') this._fail('worker', e && e.message); };
    this.worker.postMessage({
      type: 'init', ortUrl: ORT_SCRIPT, wasmPaths: ORT_BASE, modelUrl: MODEL_URL,
      threads: this.threads,
      voices: { ...VOICE_URLS }, cacheName: CACHE_NAME,
      testIds: toTokens(toPhonemes('Ready.').phonemes || 'ɹˈɛdi.'),
    });
  }

  get ready() { return this.state === 'ready'; }

  _fail(stage, err) {
    // Several threads could not be started on this device (a phone short of memory,
    // say): once more with one thread, as the game always did, before giving up.
    if (this.threads > 1 && this.state === 'loading' && !this.retried
        && (stage === 'loading' || stage === 'speaking' || stage === 'worker' || stage === 'engine')) {
      this.retried = true;
      this.threads = 1;
      try { if (this.worker) this.worker.terminate(); } catch (e) { /* gone */ }
      this.worker = null;
      this.state = 'idle';
      try { console.info(`Bella: several threads did not start (${stage}: ${err && err.message ? err.message : err}); trying one.`); } catch (e) { /* no console */ }
      this.start();
      return;
    }
    this.state = 'failed';
    this.error = `${stage}: ${err && err.message ? err.message : String(err || '')}`;
    for (const [, j] of this.jobs) j.resolve(null);
    this.jobs.clear();
    for (const [, fs] of this.voiceWaits) for (const f of fs) f(false);
    this.voiceWaits.clear();
    try { if (this.worker) this.worker.terminate(); } catch (e) { /* gone */ }
    this.worker = null;
  }

  _message(m) {
    if (m.type === 'progress') this.progress = m.total ? Math.min(1, m.got / m.total) : 0;
    else if (m.type === 'ready') {
      this.state = 'ready';
      this.progress = 1;
      this.inputs = m.inputs;
      this.threadsUsed = m.threads || 1;
      this.isolated = !!m.isolated;
      try { console.info(`Bella: voice ready, ${this.threadsUsed} thread${this.threadsUsed === 1 ? '' : 's'}${this.isolated ? '' : ' (page not isolated)'}, first word in ${Math.round(m.warmMs || 0)} ms.`); } catch (e) { /* no console */ }
      for (const f of this.onReady.splice(0)) { try { f(); } catch (e) { /* a listener's own trouble */ } }
    } else if (m.type === 'failed') this._fail(m.stage, m.error);
    else if (m.type === 'voice') {
      if (m.ok) this.voicesIn.add(m.name);
      for (const f of this.voiceWaits.get(m.name) || []) f(!!m.ok);
      this.voiceWaits.delete(m.name);
    }
    else if (m.type === 'audio' || m.type === 'error' || m.type === 'dropped') {
      const j = this.jobs.get(m.id);
      if (!j) return;
      this.jobs.delete(m.id);
      j.resolve(m.type === 'audio' ? { samples: m.samples, ms: m.ms, waited: m.waited || 0, behind: !!m.behind } : null);
    }
  }

  // Make one line (phonemes) in a voice. Resolves with { samples, ms, waited } or
  // null (failed, dropped, or the engine not ready). `now`: before anything being
  // prepared ahead.
  synth(phonemes, voice, { now = false, lead = false } = {}) {
    if (this.state !== 'ready' || !this.worker) return { id: 0, promise: Promise.resolve(null) };
    const ids = toTokens(phonemes);
    if (!ids.length || ids.length >= MAX_TOKENS) return { id: 0, promise: Promise.resolve(null) };
    const id = this.nextId++;
    const promise = new Promise((resolve) => this.jobs.set(id, { resolve, voice, now }));
    this.worker.postMessage({ type: 'synth', id, ids, voice, speed: SPEED, now, lead });
    return { id, promise };
  }

  // Whether any line being made ahead (the guide's calls, a character's story, lines
  // prepared for later) is still with the worker: a line wanted now may be waiting
  // behind one of them.
  aheadBusy() {
    for (const [, j] of this.jobs) if (!j.now) return true;
    return false;
  }

  cancel(ids) {
    if (!this.worker || !ids.length) return;
    this.worker.postMessage({ type: 'cancel', ids });
  }
}

// ------------------------------------------------------------------ Bella
export class Bella {
  // audio: the game's AudioEngine (js/audio.js). engine: a KokoroEngine to share
  // (one is made if not given).
  constructor({ audio = null, engine = null } = {}) {
    this.audio = audio;
    this.engine = engine || new KokoroEngine();
    this.struggling = false;        // the device cannot keep up: the device voice for a while (see _giveUp)
    this.why = '';                  // why it gave up (for the tests and the console)
    this.restMs = STRUGGLE_REST_MS; // how long it rests before trying again
    this.kept = new Map();          // phonemes -> { buffer, bytes, pinned, pending }
    this.keptBytes = 0;
    this.rtf = [];                  // how long recent lines took to make, against how long they are
    this.misses = 0;                // lines in a row not made in time
    this.playing = new Set();       // sources sounding now
    this.gen = 0;                   // bumped by stop(): a line being said stops
    this.convs = new Map();         // 'ctx#room' -> ConvolverNode (Bella's own echo)
    this.prepQueue = [];
    this.prepping = false;
    this.missingWords = new Set();  // words of lines said by the device voice instead (for the tests)
    // (6.0.1) The guide first: a few of her calls are made as soon as the voice is
    // ready and kept from then on, so Find the Voice has them the moment it starts.
    this.guide = new GuideVoice({ engine: this.engine, audio });
    this.engine.onReady.push(() => this.guide.standBy());
    this.engine.onReady.push(() => this.prepare(COMMON_LINES));
  }

  // Start the download (alongside the sound packs).
  start() { this.engine.start(); }

  get ready() { return this.engine.ready && !this.struggling; }

  // Whether Bella can say this line now: ready, and every word in the dictionary.
  canSay(text) {
    if (!this.ready) return false;
    const r = toPhonemes(text);
    if (!r.phonemes) { for (const w of r.missing) this.missingWords.add(w); return false; }
    return toTokens(r.phonemes).length < MAX_TOKENS && this._parts(text) !== null;
  }

  // The line in sentences, each as phonemes; null if any sentence cannot be said.
  _parts(text) {
    const out = [];
    for (const s of sentences(text)) {
      const { phonemes } = toPhonemes(s);
      if (!phonemes) {
        if (/[A-Za-z0-9]/.test(s)) return null;
        continue;
      }
      if (toTokens(phonemes).length >= MAX_TOKENS) return null;
      out.push(phonemes);
    }
    return out.length ? out : null;
  }

  // ---------------------------------------------------------------- lines kept
  _keep(ph, entry) {
    const old = this.kept.get(ph);
    if (old && old.bytes) this.keptBytes -= old.bytes;
    this.kept.delete(ph);
    this.kept.set(ph, entry);
    if (entry.bytes) this.keptBytes += entry.bytes;
    if (this.keptBytes > KEEP_BYTES) {
      for (const [k, e] of this.kept) {
        if (this.keptBytes <= KEEP_BYTES) break;
        if (e.pinned || !e.buffer || k === ph) continue;
        this.kept.delete(k);
        this.keptBytes -= e.bytes;
      }
    }
  }

  // The sound of one sentence: kept, being made, or made now. Resolves with an
  // AudioBuffer or null.
  _clip(ph, { now = false, pin = false } = {}) {
    const have = this.kept.get(ph);
    if (have) {
      if (pin) have.pinned = true;
      if (have.buffer) {
        // Used again: the newest in the list, the last to be let go.
        this.kept.delete(ph); this.kept.set(ph, have);
        return Promise.resolve(have.buffer);
      }
      if (have.pending) {
        if (now && !have.now) {
          // Wanted now while waiting behind others as a prepared line: asked for again, ahead.
          have.now = true;
          if (have.jobId) this.engine.cancel([have.jobId]);
          const job = this.engine.synth(ph, BELLA, { now: true });
          have.pending = this._finish(ph, job, true, have);
        }
        return have.pending;
      }
    }
    const entry = { buffer: null, bytes: 0, pinned: pin, pending: null, now };
    const job = this.engine.synth(ph, BELLA, { now });
    entry.pending = this._finish(ph, job, now, entry);
    this.kept.set(ph, entry);
    return entry.pending;
  }

  _finish(ph, job, now, entry) {
    entry.jobId = job.id;
    return job.promise.then((r) => {
      if (!r || !r.samples) {
        // Superseded (asked for again, ahead): the newer request answers.
        if (entry.jobId !== job.id && !entry.buffer) return entry.pending;
        if (this.kept.get(ph) === entry && !entry.buffer) this.kept.delete(ph);
        return entry.buffer || null;
      }
      if (entry.buffer) return entry.buffer;           // the other request got there first
      const shaped = shape(r.samples, SPEECH_RMS * BELLA_LOUDER);
      if (!shaped) { this.kept.delete(ph); return null; }
      if (now) this._note(r.ms, r.samples.length / SAMPLE_RATE * 1000, r.behind ? 0 : r.waited);
      const ctx = this.audio && this.audio.ctx;
      entry.buffer = makeBuffer(ctx, shaped);
      entry.bytes = shaped.length * 4;
      entry.pending = null;
      this._keep(ph, entry);
      return entry.buffer;
    });
  }

  // How hard the device found that line: give way for a while if it cannot keep up.
  _note(ms, audioMs, waited) {
    if (!(audioMs > 0)) return;
    this.rtf.push(ms / audioMs);
    if (this.rtf.length > STRUGGLE_SAMPLES) this.rtf.shift();
    if (this.rtf.length >= 3) {
      const sorted = [...this.rtf].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      if (median > STRUGGLE_RTF) this._giveUp(`made at ${median.toFixed(2)} times its own length`);
    }
    if (waited > STRUGGLE_WAIT_MS) this._giveUp(`a line waited ${Math.round(waited)} ms`);
  }

  _missed() {
    this.misses += 1;
    if (this.misses >= STRUGGLE_MISSES) this._giveUp(`${this.misses} lines in a row not made in time`);
  }

  _giveUp(why) {
    if (this.struggling) return;
    this.struggling = true;
    this.why = why;
    // Nothing more is made for Bella; the guide keeps what it has (see GuideVoice).
    const ids = [];
    for (const [k, e] of this.kept) if (!e.buffer && e.jobId) { ids.push(e.jobId); this.kept.delete(k); }
    this.engine.cancel(ids);
    this.prepQueue = [];
    try { console.info('Bella: using the device voice for a while (' + why + ').'); } catch (e) { /* no console */ }
    // A rest, then another try: what was made is kept, and the count starts afresh.
    clearTimeout(this.restTimer);
    this.restTimer = setTimeout(() => {
      this.struggling = false;
      this.rtf = [];
      this.misses = 0;
      this.rests = (this.rests || 0) + 1;
      if (this.engine.ready) this.prepare(COMMON_LINES);
    }, this.restMs);
  }

  // ---------------------------------------------------------------- preparing ahead
  // Lines to have ready before they are said. Made one at a time in the background,
  // with a pause between, behind anything wanted now; kept for the whole visit.
  prepare(lines) {
    for (const line of lines || []) {
      const parts = this._parts(line);
      if (!parts) continue;
      for (const ph of parts) if (!this.kept.has(ph)) this.prepQueue.push(ph);
    }
    this._prepNext();
  }

  _prepNext() {
    if (this.prepping || !this.ready) return;
    const ph = this.prepQueue.shift();
    if (!ph) return;
    this.prepping = true;
    this._clip(ph, { pin: true }).then(() => {
      setTimeout(() => { this.prepping = false; this._prepNext(); }, 250);
    });
  }

  // ---------------------------------------------------------------- saying a line
  // Say a line. Resolves with 'done' (said to the end), 'stopped' (cut off by a new
  // line or stop()), or { fallback: text }: the part of the line Bella could not say
  // in time, for the device voice to say instead (the whole line if nothing was said).
  // isCurrent(): false once the line is no longer wanted.
  async say(text, { isCurrent = () => true } = {}) {
    const parts = this._parts(text);
    if (!parts || !this.ready) return { fallback: text };
    const gen = ++this.gen;
    const said = sentences(text);
    const live = () => gen === this.gen && isCurrent();
    const clips = parts.map((ph) => this._clip(ph, { now: true }));
    for (let i = 0; i < clips.length; i++) {
      const buf = await Promise.race([clips[i], later(i === 0 ? DEADLINE_MS : NEXT_DEADLINE_MS)]);
      if (!live()) return 'stopped';
      if (!buf) {
        // (A line that was late only because a line being prepared ahead was in the
        // worker's hands is not the device failing to keep up: not counted.)
        // Nor one that waited behind the guide's calls or a character's story: only
        // the voice being made slower than it is spoken shows a device that cannot
        // keep up (see _note).
        if (!this.prepping && !(this.engine.aheadBusy && this.engine.aheadBusy())) this._missed();
        return { fallback: i === 0 ? text : said.slice(i).join(' ') };
      }
      this.misses = 0;
      const ended = await this._play(buf, live);
      if (!ended || !live()) return 'stopped';
      if (i + 1 < clips.length) {
        await later(SENTENCE_GAP_MS);
        if (!live()) return 'stopped';
      }
    }
    return 'done';
  }

  // Cut off whatever Bella is saying.
  stop() {
    this.gen += 1;
    for (const p of [...this.playing]) p.stop();
  }

  // Where Bella's echo comes from: the room the player is in (its variation, as the
  // game's own sounds hear it), or in the 3D world the area the player stands in
  // most. Returns { key, ir } or null.
  _room() {
    const a = this.audio;
    if (!a) return null;
    try {
      if (a.spatial && a.listenerMix && a.areaBuses) {
        let best = null; let w = 0;
        for (const [id, weight] of Object.entries(a.listenerMix)) if (weight > w) { w = weight; best = id; }
        const bus = best !== null ? a.areaBuses.get(best) || a.areaBuses.get(Number(best)) : null;
        if (!bus || !bus.room) return null;
        const stretch = bus.stretch || 1;
        const ir = a._stretchedIr(bus.room, 0, stretch);
        return ir ? { key: `${bus.room}@${stretch}`, ir } : null;
      }
      if (!a.room || !a.irBuffers) return null;
      for (const k of [a.variants && a.variants[a.room], a.room]) {
        if (!k) continue;
        const ir = a.irBuffers.get(k + '#0');
        if (ir) return { key: k, ir };
      }
    } catch (e) { /* no echo this time */ }
    return null;
  }

  // The bus Bella plays into: the game's master (so the limiter keeps the total
  // under the top), never the 3D world's filter and fade.
  _out() {
    const a = this.audio;
    return a && a.out ? a.out : (a && a.ctx ? a.ctx.destination : null);
  }

  _conv(ctx, room) {
    const k = room.key;
    const have = this.convs.get(k);
    if (have && have.ctx === ctx && have.ir === room.ir) return have.node;
    if (have) { try { have.node.disconnect(); } catch (e) { /* gone */ } }
    const node = ctx.createConvolver();
    node.normalize = false;
    node.buffer = room.ir;
    node.connect(this._out());
    this.convs.set(k, { ctx, ir: room.ir, node });
    if (this.convs.size > 3) {
      const [oldK, old] = this.convs.entries().next().value;
      this.convs.delete(oldK);
      setTimeout(() => { try { old.node.disconnect(); } catch (e) { /* gone */ } }, 6000);
    }
    return node;
  }

  // Play one sentence, centred, with the room's echo. Resolves true when it has
  // played to its end, false if stopped.
  _play(buffer, live) {
    const a = this.audio;
    const ctx = a && a.ctx;
    const out = this._out();
    if (!ctx || !out) return Promise.resolve(false);
    try { if (a.wake) a.wake(); } catch (e) { /* the sound wakes on the next touch */ }
    return new Promise((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const dry = ctx.createGain();
      dry.gain.value = this._master();
      src.connect(dry);
      dry.connect(out);
      let wet = null;
      const room = this._room();
      if (room) {
        const send = (RULES.REVERB_SEND && RULES.REVERB_SEND.speech !== undefined) ? RULES.REVERB_SEND.speech : 0.22;
        const g = Math.max(0, Math.min(1.5, a.roomGain === undefined ? 1 : a.roomGain));
        wet = ctx.createGain();
        wet.gain.value = send * g * this._master();
        src.connect(wet);
        try { wet.connect(this._conv(ctx, room)); } catch (e) { wet = null; }
      }
      let done = false;
      // A phone that has stopped the sound (locked, a call) never ends the line:
      // never wait for it longer than it lasts and a moment more.
      const guard = setTimeout(() => {
        if (done) return;
        done = true;
        this.playing.delete(handle);
        try { src.stop(); } catch (e) { /* never started */ }
        resolve(live());
      }, buffer.duration * 1000 + 1500);
      const handle = {
        stop: () => {
          if (done) return;
          done = true;
          clearTimeout(guard);
          // A breath of a fade, so a cut-off line does not click.
          const now = ctx.currentTime;
          try { dry.gain.setTargetAtTime(0, now, 0.01); if (wet) wet.gain.setTargetAtTime(0, now, 0.01); src.stop(now + 0.05); } catch (e) { /* already ended */ }
          this.playing.delete(handle);
          resolve(false);
        },
      };
      src.onended = () => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        this.playing.delete(handle);
        setTimeout(() => { try { dry.disconnect(); if (wet) wet.disconnect(); } catch (e) { /* gone */ } }, 4000);
        resolve(live());
      };
      this.playing.add(handle);
      src.start();
    });
  }

  // The game's master level differs between the 3D world and the other modes
  // (js/audio.js MASTER_LEVEL, MASTER_LEVEL_3D): Bella is levelled against it so she
  // is the same loudness in every mode.
  _master() {
    const a = this.audio;
    const m = a && a.out && a.out.gain ? a.out.gain.value : 1;
    return m > 0.05 ? 1 / m : 1;
  }
}

// ------------------------------------------------------------------ the guide
// The Find the Voice guide (Heart, af_heart): short calling phrases ("Over here!"),
// hundreds of them, so she never sounds the same twice in a row. A few at a time are
// made ahead and kept (never all of them: a phone's memory); each one used is let go
// and another made in its place.
//
// For the mode:
//   const g = speech.bella.guide;    // or new GuideVoice({ engine, audio })
//   await g.load();                  // the phrases (once; also called by prepare)
//   g.prepare(12);                   // keep about twelve ready
//   const p = g.next();              // { id, text, buffer } or { id, text, buffer: null }
//   if (p.buffer) { const name = g.install(audio, 'ftv_guide', p); audio.play(name, { pos, ... }); }
//   else { /* not available: say p.text with the device voice and play a placed beacon */ }
//   g.available                      // false until Heart is ready (or if it failed)
//   g.release()                      // the run is over: let every phrase go
// The buffer is one channel at 24000 samples a second, its silence trimmed, at one
// level (GUIDE_RMS); the mode places it, sets its volume and gives it the room's echo.
export class GuideVoice {
  constructor({ engine, audio = null, url = null, voice = HEART } = {}) {
    this.engine = engine;
    this.audio = audio;
    this.voice = voice;
    this.url = url || new URL('./data/guide_phrases.json' + (typeof import.meta !== 'undefined' ? new URL(import.meta.url).search : ''), import.meta.url).href;
    this.phrases = null;            // [{ id, text, phonemes }]
    this.loading = null;
    this.ready = new Map();         // id -> AudioBuffer, made and waiting to be used
    this.making = new Set();        // ids being made
    this.want = 0;
    this.recent = [];               // the last few used, not picked again soon
  }

  get available() { return this.engine.ready && !!this.phrases; }

  load() {
    if (this.phrases) return Promise.resolve(this.phrases);
    if (!this.loading) {
      this.loading = fetch(this.url).then((r) => r.json()).then((data) => {
        this.phrases = (data.phrases || []).filter((p) => p.text && p.phonemes);
        return this.phrases;
      }).catch(() => { this.loading = null; return null; });
    }
    return this.loading;
  }

  // Keep about `count` phrases ready (made in the background, one at a time).
  prepare(count = 12) {
    this.want = Math.max(0, Math.min(40, count | 0));
    this.load().then(() => this._top());
    if (!this.engine.ready) this.engine.onReady.push(() => this._top());
  }

  _top() {
    if (!this.phrases || !this.engine.ready) return;
    while (this.ready.size + this.making.size < this.want) {
      const p = this._pick(new Set([...this.ready.keys(), ...this.making, ...this.recent]));
      if (!p) break;
      this.making.add(p.id);
      this.engine.synth(p.phonemes, this.voice, { lead: true }).promise.then((r) => {
        this.making.delete(p.id);
        if (!r || !r.samples || this.want === 0) { this.failed = (this.failed || 0) + 1; return; }
        const shaped = shape(r.samples, GUIDE_RMS);
        if (shaped) this.ready.set(p.id, makeBuffer(this.audio && this.audio.ctx, shaped));
      });
    }
  }

  _pick(avoid) {
    const list = this.phrases.filter((p) => !avoid.has(p.id));
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  // The next phrase to call with: one made ahead if any is ready ({ id, text,
  // buffer }), else a phrase with buffer null (not available: the mode says it with
  // the device voice and plays its beacon). Each phrase used is let go and another
  // is made.
  next() {
    if (!this.phrases) return { id: 0, text: 'Over here!', buffer: null };
    let id = null;
    for (const k of this.ready.keys()) { id = k; break; }
    let p;
    let buffer = null;
    if (id !== null) {
      buffer = this.ready.get(id);
      this.ready.delete(id);
      p = this.phrases.find((q) => q.id === id);
    } else p = this._pick(new Set(this.recent)) || this.phrases[0];
    this.recent.push(p.id);
    if (this.recent.length > 8) this.recent.shift();
    this._top();
    return { id: p.id, text: p.text, buffer };
  }

  // A phrase's sound if it is ready, without using it up.
  peek(id) { return this.ready.get(id) || null; }

  // Put a phrase's sound into the game's sound engine under a name, so the mode
  // plays it like any other sound (placed in 3D, with the room's echo). Returns the
  // name. (The same entries js/modes/events/sounds.js addMade makes.)
  install(audio, name, phrase) {
    if (!audio || !phrase || !phrase.buffer) return null;
    audio.entries.set(name, { dry: { frames: 0, made: true } });
    audio.buffers.set('dry:' + name, phrase.buffer);
    audio.buffers.delete('dull:' + name);
    return name;
  }

  // The run is over: every phrase let go, nothing more made.
  // (6.0.1: a few are kept standing even then, for the next run.)
  release() {
    this.want = GUIDE_STANDING;
    let n = 0;
    for (const k of [...this.ready.keys()]) { n += 1; if (n > GUIDE_STANDING) this.ready.delete(k); }
  }

  // A few calls made as soon as the voice is ready and kept while no run is played.
  standBy() { if (this.want < GUIDE_STANDING) this.prepare(GUIDE_STANDING); }

  // How many calls are made and waiting, and whether more are being made now.
  stock() { return this.ready.size; }
  get busy() { return this.making.size > 0; }
}
