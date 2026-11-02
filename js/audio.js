// The sound engine: the desktop game's mixer, rebuilt on the Web Audio API.
//
// On Windows every sound plays on a pygame channel with a left and a right level,
// and alongside it two more copies: its echo in the room the player is in, and
// its dull "behind you" copy, faded in as the thing goes behind the player. Here
// each playing sound is a Voice that does exactly the same. The levels follow
// the desktop's PairedChannel to the letter (see sound-rules.js, which is made
// from the desktop code). The dull copies come ready made in the sound packs, made
// by the desktop's own code; the echo is made live by a convolver loaded with the
// desktop's own room impulse responses.

import { RULES } from './sound-rules.js';
import { loadPacks } from './packs.js';

const RATE = 44100;
// Recordings longer than this are decoded only when they are about to play, and
// let go when they have not been used for a while, so a phone never holds every
// drone in memory at once.
const BIG_FRAMES = RATE * 6;
const BIG_KEEP = 6;

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// Which sounds a pause holds: every beacon, chime and beep (the desktop's
// PAUSE_BEEP_PARTS and PAUSE_BEEP_NAMES, as far as these two modes go).
export function isPauseBeep(name) {
  return name.includes('beacon') || name.startsWith('prox_') ||
    name === 'countdown' || name === 'countdown_high';
}

export class AudioEngine {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    try {
      this.ctx = new AC({ sampleRate: RATE, latencyHint: 'interactive' });
    } catch (e) {
      this.ctx = new AC();
    }
    this.out = this.ctx.createGain();
    this.out.connect(this.ctx.destination);
    this.entries = new Map();     // name -> {dry, dull} pack entries
    this.irEntries = new Map();   // room key -> [entry per take]
    this.buffers = new Map();     // 'dry:name' / 'dull:name' -> AudioBuffer
    this.pending = new Map();     // same key -> Promise of the buffer
    this.bigUsed = new Map();     // big buffer key -> last used time
    this.irBuffers = new Map();   // 'key#take' -> AudioBuffer
    this.convolvers = new Map();  // 'key#take' -> ConvolverNode
    this.room = null;
    this.variants = {};           // 'lab' -> 'lab/lab_03_scifi_cave'
    this.roomGain = 1.0;
    this.roomLean = 0.0;
    this.live = new Set();        // every Voice still playing
    this.sourceEffect = null;     // set by the game: position -> [gain, lean]
    this.behindOf = null;         // set by the game: position -> 0..1
    this.demoVoice = null;
  }

  async unlock() {
    // Phones keep audio off until the player touches something, and an iPhone's
    // silent switch would mute the game unless it asks to be treated as playback.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
    try { await this.ctx.resume(); } catch (e) { /* tried again on the next touch */ }
    // A moment of silence through the context, which some phones need before the
    // first real sound plays.
    const b = this.ctx.createBuffer(1, 64, this.ctx.sampleRate);
    const s = this.ctx.createBufferSource();
    s.buffer = b; s.connect(this.out); s.start();
  }

  resume() {
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  // ---------------------------------------------------------------- loading
  async load(onProgress) {
    const packs = await loadPacks(onProgress);
    for (const pack of packs) {
      for (const e of pack.entries) {
        e.pack = pack;
        if (e.kind === 'ir') {
          if (!this.irEntries.has(e.name)) this.irEntries.set(e.name, []);
          this.irEntries.get(e.name)[e.take] = e;
        } else {
          if (!this.entries.has(e.name)) this.entries.set(e.name, {});
          this.entries.get(e.name)[e.kind] = e;
        }
      }
    }
    // Everything small is decoded now; the long recordings when first needed.
    const small = [];
    for (const [name, pair] of this.entries) {
      for (const kind of ['dry', 'dull']) {
        const e = pair[kind];
        if (e && e.frames <= BIG_FRAMES) small.push(this._decode(kind + ':' + name, e));
      }
    }
    for (const base of ['lab', 'battle']) {
      for (let t = 0; t < (this.irEntries.get(base) || []).length; t++) small.push(this._irBuffer(base, t));
    }
    await Promise.all(small);
  }

  has(name) { return this.entries.has(name); }

  async _decodeEntry(e) {
    const bytes = e.pack.data.slice(e.offset, e.offset + e.length);
    const decoded = await new Promise((resolve, reject) => {
      const p = this.ctx.decodeAudioData(bytes, resolve, reject);
      if (p && p.catch) p.catch(reject);
    });
    // Cut back to the exact length: a loop was written with its own opening on
    // the end, and some browsers decode a few extra samples at the end of a file.
    const frames = Math.min(e.frames, decoded.length);
    if (decoded.length === frames && decoded.numberOfChannels === 2) return decoded;
    const buf = this.ctx.createBuffer(2, frames, decoded.sampleRate);
    for (let c = 0; c < 2; c++) {
      const src = decoded.getChannelData(Math.min(c, decoded.numberOfChannels - 1));
      buf.copyToChannel(src.subarray(0, frames), c);
    }
    return buf;
  }

  _decode(key, e) {
    if (this.buffers.has(key)) return Promise.resolve(this.buffers.get(key));
    if (this.pending.has(key)) return this.pending.get(key);
    const p = this._decodeEntry(e).then((buf) => {
      this.buffers.set(key, buf);
      this.pending.delete(key);
      if (e.frames > BIG_FRAMES) this._noteBig(key);
      return buf;
    }, (err) => { this.pending.delete(key); throw err; });
    this.pending.set(key, p);
    return p;
  }

  _noteBig(key) {
    this.bigUsed.set(key, performance.now());
    if (this.bigUsed.size <= BIG_KEEP) return;
    const playing = new Set();
    for (const v of this.live) { playing.add('dry:' + v.name); playing.add('dull:' + v.name); }
    const old = [...this.bigUsed.entries()].filter(([k]) => !playing.has(k)).sort((a, b) => a[1] - b[1]);
    while (this.bigUsed.size > BIG_KEEP && old.length) {
      const [k] = old.shift();
      this.bigUsed.delete(k);
      this.buffers.delete(k);
    }
  }

  // Have a long recording decoded and waiting, so it starts the moment it is asked for.
  prepare(name) {
    const pair = this.entries.get(name);
    if (!pair || !pair.dry) return Promise.resolve(null);
    return this._decode('dry:' + name, pair.dry).catch(() => null);
  }

  // ---------------------------------------------------------------- the room
  _irBuffer(key, take) {
    const k = key + '#' + take;
    if (this.irBuffers.has(k)) return Promise.resolve(this.irBuffers.get(k));
    const e = (this.irEntries.get(key) || [])[take];
    if (!e) return Promise.resolve(null);
    if (this.pending.has('ir:' + k)) return this.pending.get('ir:' + k);
    const p = this._decodeEntry(e).then((buf) => {
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] *= e.scale;
      }
      this.irBuffers.set(k, buf);
      this.pending.delete('ir:' + k);
      return buf;
    });
    this.pending.set('ir:' + k, p);
    return p;
  }

  setRoom(room) { this.room = room; }

  // A drone starting changes the room with it: each drone has its own slight
  // variation of its mode's echo (the desktop's REVERB_VARIANTS). Its impulses
  // are loaded in the background; until then the room's own echo is used.
  setVariant(base, stem) {
    const key = base + '/' + stem;
    if (this.variants[base] === key) return;
    this.variants[base] = key;
    const takes = (this.irEntries.get(key) || []).length;
    for (let t = 0; t < takes; t++) this._irBuffer(key, t).catch(() => {});
    // Let go of other variations of this room (their tails ring out first).
    for (const [k, node] of [...this.convolvers]) {
      const rk = k.split('#')[0];
      if (rk.startsWith(base + '/') && rk !== key) {
        this.convolvers.delete(k);
        setTimeout(() => { try { node.disconnect(); } catch (e) { /* gone */ } }, 6000);
      }
    }
    for (const k of [...this.irBuffers.keys()]) {
      const rk = k.split('#')[0];
      if (rk.startsWith(base + '/') && rk !== key) this.irBuffers.delete(k);
    }
  }

  // The convolver for a room as heard now (its variation if ready), one take.
  _convolver(room, take) {
    for (const key of [this.variants[room], room]) {
      if (!key) continue;
      const k = key + '#' + take;
      let node = this.convolvers.get(k);
      if (node) return node;
      const buf = this.irBuffers.get(k);
      if (!buf) continue;
      node = this.ctx.createConvolver();
      node.normalize = false;
      node.buffer = buf;
      node.connect(this.out);
      this.convolvers.set(k, node);
      return node;
    }
    return null;
  }

  // Ease the wall effect toward a new setting and re-level every live echo
  // (the desktop's set_surroundings).
  setSurroundings(gain, lean, dt) {
    const a = dt > 0 ? Math.min(1.0, dt / RULES.REVERB_SMOOTH) : 1.0;
    this.roomGain += (gain - this.roomGain) * a;
    this.roomLean += (lean - this.roomLean) * a;
    for (const v of this.live) v.refreshWet();
  }

  // ---------------------------------------------------------------- playing
  // Play a sound. `loops` -1 loops it; `at` is where in the world it happens, if
  // not at the player: its echo then comes from that part of the room, and it
  // sounds dull if that spot is behind the player. Returns the Voice, or null.
  play(name, { loops = 0, volume = 1.0, fadeMs = 0, at = null } = {}) {
    const pair = this.entries.get(name);
    if (!pair || !pair.dry) return null;
    if (loops === -1) {
      if (name.startsWith('lab_')) this.setVariant('lab', name);
      else if (name.startsWith('bat_')) this.setVariant('battle', name);
    }
    let src = null;
    let behind = 0.0;
    if (at && this.sourceEffect) { try { src = this.sourceEffect(at); } catch (e) { src = null; } }
    if (at && this.behindOf) { try { behind = this.behindOf(at); } catch (e) { behind = 0.0; } }
    const v = new Voice(this, name, pair, { loop: loops === -1, volume, fadeMs, src, behind });
    this.live.add(v);
    v.begin();
    return v;
  }

  stopAllLoops(keep = []) {
    for (const v of [...this.live]) {
      if (v.loop && !keep.includes(v)) v.stop();
    }
  }

  stopAll() {
    for (const v of [...this.live]) v.stop();
  }

  pauseBeeps() {
    const held = [];
    for (const v of this.live) {
      if (!v.paused && isPauseBeep(v.name)) { v.pause(); held.push(v); }
    }
    return held;
  }
}

// One playing sound, with its echo and its dull copy: the desktop's PairedChannel.
export class Voice {
  constructor(audio, name, pair, { loop, volume, fadeMs, src, behind }) {
    this.audio = audio;
    this.ctx = audio.ctx;
    this.name = name;
    this.pair = pair;
    this.loop = loop;
    this.l = this.r = clamp(volume, 0, 1);
    this.behind = clamp(behind || 0, 0, 1);
    this.fadeMs = fadeMs;
    this.family = RULES.FAMILY[name] || 'event';
    this.send = RULES.REVERB_SEND[this.family] || 0.0;
    this.srcGain = src ? src[0] : null;
    this.srcLean = src ? src[1] : 0.0;
    this.playGain = 1.0 + (Math.random() * 2 - 1) * RULES.REVERB_PLAY_GAIN;
    this.playLean = (Math.random() * 2 - 1) * RULES.REVERB_PLAY_LEAN;
    this.stopped = false;
    this.paused = false;
    this.ended = false;
    this.sources = [];
    this.offset = 0;
  }

  _branch(buffer) {
    const ctx = this.ctx;
    const fade = ctx.createGain();
    const split = ctx.createChannelSplitter(2);
    const gl = ctx.createGain();
    const gr = ctx.createGain();
    const merge = ctx.createChannelMerger(2);
    gl.gain.value = 0; gr.gain.value = 0;
    fade.connect(split);
    split.connect(gl, 0); split.connect(gr, 1);
    gl.connect(merge, 0, 0); gr.connect(merge, 0, 1);
    merge.connect(this.audio.out);
    return { buffer, fade, split, gl, gr, merge };
  }

  begin() {
    const a = this.audio;
    const dryKey = 'dry:' + this.name;
    const buf = a.buffers.get(dryKey);
    if (!buf) {
      // A long recording not decoded yet: it starts the moment it is ready.
      a._decode(dryKey, this.pair.dry).then(() => { if (!this.stopped) this.begin(); }).catch(() => this.stop());
      return;
    }
    if (buf && this.pair.dry.frames > BIG_FRAMES) a._noteBig(dryKey);
    this.dry = this._branch(buf);
    const dullBuf = this.pair.dull ? a.buffers.get('dull:' + this.name) : null;
    if (dullBuf && a.room !== 'tunnel') this.dull = this._branch(dullBuf);
    // The echo: a send from the clean sound into the room's convolver.
    const rooms = RULES.ROOMS[this.name] || [];
    if (a.room && this.send > 0 && rooms.includes(a.room)) {
      const takes = RULES.TAKES[this.name] || 1;
      const conv = a._convolver(a.room, Math.floor(Math.random() * takes)) || a._convolver(a.room, 0);
      if (conv) {
        const ctx = this.ctx;
        const split = ctx.createChannelSplitter(2);
        const wl = ctx.createGain();
        const wr = ctx.createGain();
        const merge = ctx.createChannelMerger(2);
        wl.gain.value = 0; wr.gain.value = 0;
        this.dry.fade.connect(split);
        split.connect(wl, 0); split.connect(wr, 1);
        wl.connect(merge, 0, 0); wr.connect(merge, 0, 1);
        merge.connect(conv);
        this.wet = { split, wl, wr, merge };
      }
    }
    const now = this.ctx.currentTime;
    for (const br of [this.dry, this.dull]) {
      if (!br) continue;
      if (this.fadeMs > 0) {
        br.fade.gain.setValueAtTime(0, now);
        br.fade.gain.linearRampToValueAtTime(1, now + this.fadeMs / 1000);
      }
    }
    this.apply(true);
    this._startSources(0);
  }

  _startSources(offset) {
    const now = this.ctx.currentTime;
    this.sources = [];
    let first = null;
    for (const br of [this.dry, this.dull]) {
      if (!br) continue;
      const s = this.ctx.createBufferSource();
      s.buffer = br.buffer;
      s.loop = this.loop;
      s.connect(br.fade);
      if (this.loop) s.start(now, offset % br.buffer.duration);
      else if (offset < br.buffer.duration) s.start(now, offset);
      else continue;
      this.sources.push(s);
      if (!first) first = s;
    }
    this.startedAt = now - offset;
    if (first && !this.loop) {
      first.onended = () => { if (!this.paused && !this.stopped) this._finish(); };
    }
    if (!first) this._finish();
  }

  _finish() {
    this.ended = true;
    this.audio.live.delete(this);
    // The echo rings on by itself; the nodes go once it has.
    setTimeout(() => this._disconnect(), 4000);
  }

  _disconnect() {
    for (const br of [this.dry, this.dull]) {
      if (!br) continue;
      try { br.merge.disconnect(); } catch (e) { /* already */ }
    }
    if (this.wet) { try { this.wet.merge.disconnect(); } catch (e) { /* already */ } }
  }

  _set(param, v, instant) {
    const now = this.ctx.currentTime;
    if (instant) { param.cancelScheduledValues(now); param.setValueAtTime(v, now); }
    else param.setTargetAtTime(v, now, 0.008);
  }

  get busy() { return !this.stopped && !this.ended; }

  setVolume(left, right = left, behind = null) {
    this.l = clamp(left, 0, 1);
    this.r = clamp(right, 0, 1);
    if (behind !== null && behind !== undefined) this.behind = clamp(behind, 0, 1);
    this.apply();
  }

  setBehind(b) { this.setVolume(this.l, this.r, b); }

  // The clean sound giving way to its dull copy as the thing goes behind the
  // player, and the echo swelling with it.
  apply(instant = false) {
    if (!this.dry) return;
    const b = this.behind;
    let dg;
    if (this.dull) {
      dg = 1.0 - b * (1.0 - RULES.BEHIND_DRY_MIN);
      this._set(this.dull.gl.gain, Math.min(1.0, this.l * b), instant);
      this._set(this.dull.gr.gain, Math.min(1.0, this.r * b), instant);
    } else {
      dg = 1.0 - b * RULES.BEHIND_NO_COPY_DROP;
    }
    this._set(this.dry.gl.gain, this.l * dg, instant);
    this._set(this.dry.gr.gain, this.r * dg, instant);
    this.refreshWet(instant);
  }

  refreshWet(instant = false) {
    if (!this.wet) return;
    const a = this.audio;
    let send = this.send;
    if (this.family === 'enemy') send *= 1.0 + RULES.REVERB_ENEMY_FAR * (1.0 - Math.min(1.0, Math.max(this.l, this.r)));
    send *= 1.0 + RULES.BEHIND_WET * this.behind;
    let g = a.roomGain * this.playGain;
    let lean = a.roomLean;
    if (this.srcGain !== null) {
      g = Math.sqrt(Math.max(0.0, a.roomGain * this.srcGain)) * this.playGain;
      lean = 0.5 * (a.roomLean + this.srcLean);
    }
    lean = clamp(lean + this.playLean, -1, 1);
    let wl = this.l * send * g;
    let wr = this.r * send * g;
    if (lean < 0) wr *= 1.0 + lean;
    else if (lean > 0) wl *= 1.0 - lean;
    this._set(this.wet.wl.gain, clamp(wl, 0, 1), instant);
    this._set(this.wet.wr.gain, clamp(wr, 0, 1), instant);
  }

  _stopSources() {
    for (const s of this.sources) {
      s.onended = null;
      try { s.stop(); } catch (e) { /* not started */ }
      try { s.disconnect(); } catch (e) { /* gone */ }
    }
    this.sources = [];
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this._stopSources();
    this.audio.live.delete(this);
    setTimeout(() => this._disconnect(), 4000);
  }

  fadeout(ms) {
    if (this.stopped || !this.dry) { this.stop(); return; }
    const now = this.ctx.currentTime;
    for (const br of [this.dry, this.dull]) {
      if (!br) continue;
      const g = br.fade.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + ms / 1000);
    }
    setTimeout(() => this.stop(), ms + 30);
  }

  pause() {
    if (this.paused || this.stopped || this.ended || !this.dry) return;
    this.offset = this.ctx.currentTime - this.startedAt;
    this.paused = true;
    this._stopSources();
  }

  resume() {
    if (!this.paused || this.stopped) return;
    this.paused = false;
    this._startSources(this.offset);
  }
}
