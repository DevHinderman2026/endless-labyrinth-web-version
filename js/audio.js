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
import { reverbIsLoop } from './modes/events/sounds.js';

const RATE = 44100;
// Recordings longer than this are decoded only when they are about to play, and
// let go when they have not been used for a while, so a phone never holds every
// drone in memory at once.
const BIG_FRAMES = RATE * 6;
const BIG_KEEP = 6;

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// Which sounds a pause holds: every beacon, chime and beep (the desktop's
// PAUSE_BEEP_PARTS and PAUSE_BEEP_NAMES). An event creature's own recording is
// named as a beacon, but it is a creature, and creatures play on.
const PAUSE_BEEP_PARTS = ['beacon', 'prox_', 'elevator_arrive'];
const PAUSE_BEEP_NAMES = new Set(['countdown', 'countdown_high', 'exit_morse', 'health_low', 'diver_tap', 'vent',
  'vent_hint', 'elevator_ding', 'event_pad', 'event_bomb_tick', 'event_falling']);
export function isPauseBeep(name) {
  if (name.startsWith('event_beacon_hazard_')) return false;
  return PAUSE_BEEP_NAMES.has(name) || PAUSE_BEEP_PARTS.some((k) => name.includes(k));
}

function newContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  try {
    return new AC({ sampleRate: RATE, latencyHint: 'interactive' });
  } catch (e) {
    return new AC();
  }
}

export class AudioEngine {
  constructor() {
    this.ctx = newContext();
    this.out = this.ctx.createGain();
    this.out.connect(this.ctx.destination);
    this.recoveries = 0;
    this.entries = new Map();     // name -> {dry, dull} pack entries
    this.irEntries = new Map();   // room key -> [entry per take]
    this.buffers = new Map();     // 'dry:name' / 'dull:name' -> AudioBuffer
    this.pending = new Map();     // same key -> Promise of the buffer
    this.bigUsed = new Map();     // big buffer key -> last used time
    this.pins = new Map();        // what a recording is held ready for -> its buffer key
    this.irBuffers = new Map();   // 'key#take' -> AudioBuffer
    this.convolvers = new Map();  // 'key#take' -> ConvolverNode
    // A looping sound's own echo, made once per room and sound (the desktop's
    // reverb_apply with loop=True: folded into the loop's length, so it loops with
    // it to the sample and stops, pauses and fades with it).
    this.loopWets = new Map();    // 'roomKey|name' -> AudioBuffer
    this.loopWetPending = new Map();
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
    // Phones keep audio off until the player touches something. The sound is
    // 'ambient', which mixes with the game's own speech. ('playback' does not mix:
    // on an iPhone the speech then stopped the game's sound altogether.) Ambient
    // sound is muted by an iPhone's silent mode, so the game asks for that off.
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (e) { /* older Safari */ }
    try { await this.ctx.resume(); } catch (e) { /* tried again on the next touch */ }
    // A moment of silence through the context, which some phones need before the
    // first real sound plays.
    const b = this.ctx.createBuffer(1, 64, this.ctx.sampleRate);
    const s = this.ctx.createBufferSource();
    s.buffer = b; s.connect(this.out); s.start();
  }

  get running() { return this.ctx.state === 'running'; }

  resume() {
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  // Called on every touch, tap and key press, which are the moments a phone
  // allows sound to be started. If the phone has stopped the game's sound (a
  // call, another app, the screen reader being turned off, or speech), it is
  // started again; if it will not start again, a fresh sound engine is made.
  //
  // An iPhone can call the sound 'interrupted' while it is still playing (as it
  // turns sounds down under the game's speech), so the engine is replaced only
  // when its clock has truly stopped, and at most once in five seconds.
  wake() {
    if (this.ctx.state === 'running' || this.waking) return;
    this.waking = true;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    ctx.resume().catch(() => {});
    setTimeout(() => {
      this.waking = false;
      if (this.ctx !== ctx || ctx.state === 'running') return;
      const moving = ctx.currentTime - t0 > 0.2;
      const recent = performance.now() - (this.recoveredAt || -1e9) < 5000;
      if (!moving && !recent) this.recover();
    }, 400);
  }

  // Whether sound is really coming out: running, or its clock still moving.
  get audible() {
    if (this.ctx.state === 'running') return true;
    const now = this.ctx.currentTime;
    const was = this._lastClock;
    this._lastClock = now;
    return was !== undefined && now > was;
  }

  // A fresh sound engine: everything that was looping carries on from where it
  // was (drones, beacons, enemies); a one-shot that was cut off is not replayed.
  // Sounds already decoded are kept: they belong to no engine in particular.
  recover() {
    const old = this.ctx;
    this.recoveries += 1;
    this.recoveredAt = performance.now();
    this.ctx = newContext();
    this.out = this.ctx.createGain();
    this.out.connect(this.ctx.destination);
    this.convolvers = new Map();
    for (const v of [...this.live]) v.rebind(old);
    // The old engine is kept a moment, so a one-shot already sounding there (a
    // footstep, a shot) finishes rather than being cut off.
    setTimeout(() => { try { old.close(); } catch (e) { /* already closed */ } }, 2000);
    this.ctx.resume().catch(() => {});
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
        // (A lazy entry, such as the event library's, is decoded only when an event uses it.)
        if (e && e.frames <= BIG_FRAMES && !e.lazy) small.push(this._decode(kind + ':' + name, e));
      }
    }
    for (const base of ['lab', 'battle', 'tower', 'tunnel', 'cathedral', 'hall']) {
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
    // Pinned recordings (see prepare) are held on top of the BIG_KEEP most
    // recently used others.
    const pinned = new Set(this.pins.values());
    const free = [...this.bigUsed.keys()].filter((k) => !pinned.has(k));
    if (free.length <= BIG_KEEP) return;
    const playing = new Set();
    for (const v of this.live) { playing.add('dry:' + v.name); playing.add('dull:' + v.name); }
    // Nor is anything let go that was decoded or asked for in the last few
    // seconds: it is about to play (a shore and its muffled twin start together).
    const recent = performance.now() - 5000;
    const old = free.filter((k) => !playing.has(k) && k !== key && this.bigUsed.get(k) < recent)
      .sort((a, b) => this.bigUsed.get(a) - this.bigUsed.get(b));
    let n = free.length;
    while (n > BIG_KEEP && old.length) {
      const k = old.shift();
      this.bigUsed.delete(k);
      this.buffers.delete(k);
      if (k.startsWith('dry:')) this._releaseWets(k.slice(4));
      n -= 1;
    }
  }

  // Have a long recording decoded and waiting, so it starts the moment it is asked for.
  // With `pin`, it is held for that purpose (the next labyrinth's drone, say) and
  // never let go to make room, until something else is pinned for it: a chaos run
  // goes through every kind of level, and the desktop has every sound ready.
  prepare(name, pin = null) {
    const pair = this.entries.get(name);
    if (!pair || !pair.dry) return Promise.resolve(null);
    if (pin) this.pins.set(pin, 'dry:' + name);
    if (this.bigUsed.has('dry:' + name)) this.bigUsed.set('dry:' + name, performance.now());
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

  setRoom(room) {
    if (room !== this.room && room) {
      const key = this.variants[room];
      setTimeout(() => {
        if (this.room !== room) return;
        this._buildAhead(room, room);
        if (key && this.variants[room] === key) this._buildAhead(room, key);
      }, 200);
    }
    this.room = room;
  }

  // A drone starting changes the room with it: each drone has its own slight
  // variation of its mode's echo (the desktop's REVERB_VARIANTS). Its impulses
  // are loaded in the background; until then the room's own echo is used.
  setVariant(base, stem) {
    const key = base + '/' + stem;
    if (this.variants[base] === key) return;
    this.variants[base] = key;
    const takes = (this.irEntries.get(key) || []).length;
    for (let t = 0; t < takes; t++) {
      const p = this._irBuffer(key, t).catch(() => {});
      // Once its impulse is in, the loops already heard in this room get their echo
      // in the new variation too, in the background.
      if (t === 0) p.then(() => { if (this.variants[base] === key && this.room === base) this._buildAhead(base, key); });
    }
    // Let go of other variations of this room (their tails ring out first).
    for (const [k, node] of [...this.convolvers]) {
      const rk = k.split('#')[0];
      if (rk.startsWith(base + '/') && rk !== key) {
        this.convolvers.delete(k);
        // A sound already playing keeps the echo it began with, as on the desktop,
        // so the node goes only once nothing live feeds it any more.
        const retire = () => {
          if ([...this.live].some((v) => v.wet && v.wet.conv === node)) setTimeout(retire, 6000);
          else { try { node.disconnect(); } catch (e) { /* gone */ } }
        };
        setTimeout(retire, 6000);
      }
    }
    for (const k of [...this.loopWets.keys()]) {
      const rk = k.split('|')[0];
      if (rk.startsWith(base + '/') && rk !== key) this.loopWets.delete(k);
    }
    for (const k of [...this.irBuffers.keys()]) {
      const rk = k.split('#')[0];
      if (rk.startsWith(base + '/') && rk !== key) this.irBuffers.delete(k);
    }
  }

  // The convolver for a room as heard now (its variation if ready), one take.
  _convolver(room, take, baseOnly = false) {
    for (const key of baseOnly ? [room] : [this.variants[room], room]) {
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
      node.key = k;
      this.convolvers.set(k, node);
      return node;
    }
    return null;
  }

  // A looping sound's echo in a room (variation first, if its impulse is ready),
  // or null while it is being made: the desktop builds these ahead, and plays a
  // sound clean until its echo is ready; here the room's shared echo stands in.
  _loopWet(room, name, dry) {
    for (const key of [this.variants[room], room]) {
      if (!key) continue;
      const k = key + '|' + name;
      const have = this.loopWets.get(k);
      if (have) return have;
      const ir = this.irBuffers.get(key + '#0');
      if (!ir) continue;
      this._buildLoopWet(room, key, name, dry, ir);
      // Not made yet: the plain room's echo stands in, if it is ready (the
      // desktop's _pair: the variation's echo if built, or else the room's).
    }
    return null;
  }

  _buildLoopWet(room, key, name, dry, ir) {
    const k = key + '|' + name;
    if (this.loopWets.has(k) || this.loopWetPending.has(k)) return this.loopWetPending.get(k) || Promise.resolve();
    const p = this._renderLoopWet(ir, dry).then((buf) => {
      // Kept only while it is still this room's echo, and while the sound is held.
      if (buf && (this.variants[room] === key || key === room) && this.buffers.get('dry:' + name) === dry) this.loopWets.set(k, buf);
    }).catch(() => {}).finally(() => this.loopWetPending.delete(k));
    this.loopWetPending.set(k, p);
    return p;
  }

  // The desktop builds every echo ahead (prepare_reverb, prepare_variant). Here the
  // looping sounds' own echoes for a room are made in the background, one at a
  // time, when the room (or its variation) comes into use: for the room itself,
  // every loop that can echo in it; for a variation, those already used here.
  _buildAhead(room, key) {
    const token = {};
    this._ahead = this._ahead || {};
    this._ahead[key] = token;
    const ir = this.irBuffers.get(key + '#0');
    if (!ir) return;
    const names = [];
    for (const [name, pair] of this.entries) {
      if (!pair.dry || !(pair.dry.loop || reverbIsLoop(name))) continue;
      if (!(RULES.ROOMS[name] || []).includes(room) || !(RULES.REVERB_SEND[RULES.FAMILY[name] || 'event'] > 0)) continue;
      const dry = this.buffers.get('dry:' + name);
      if (!dry || pair.dry.frames > BIG_FRAMES) continue;
      if (key !== room && !this.loopWets.has(room + '|' + name)) continue;
      names.push([name, dry]);
    }
    const next = () => {
      if (this._ahead[key] !== token || !names.length) return;
      if (key !== room && this.variants[room] !== key) return;
      const [name, dry] = names.shift();
      this._buildLoopWet(room, key, name, dry, ir).then(() => setTimeout(next, 30));
    };
    next();
  }

  // A long recording let go of: its own echoes go with it.
  _releaseWets(name) {
    for (const k of [...this.loopWets.keys()]) if (k.endsWith('|' + name)) this.loopWets.delete(k);
  }

  // The desktop's reverb_apply for a loop: the loop convolved circularly with the
  // room's impulse (the loop played round enough times for the echo to settle,
  // then one turn of it taken), never louder at its peak than 0.9 of full scale.
  async _renderLoopWet(ir, dry) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return null;
    const n = dry.length;
    const turns = Math.ceil(Math.max(1, ir.length - 1) / n) + 1;
    const off = new OAC(2, turns * n, RATE);
    const src = off.createBufferSource();
    src.buffer = dry;
    src.loop = true;
    const conv = off.createConvolver();
    conv.normalize = false;
    conv.buffer = ir;
    src.connect(conv);
    conv.connect(off.destination);
    src.start(0);
    const out = await off.startRendering();
    const buf = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: RATE });
    let peak = 0;
    for (let c = 0; c < 2; c++) {
      const seg = out.getChannelData(c).subarray((turns - 1) * n, turns * n);
      for (let i = 0; i < n; i++) { const v = Math.abs(seg[i]); if (v > peak) peak = v; }
      buf.copyToChannel(seg, c);
    }
    if (peak > 0.9 * 32767 / 32768) {
      const k = (0.9 * 32767 / 32768) / peak;
      for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] *= k; }
    }
    return buf;
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
      // A drone starting is the room changing with it (the desktop's
      // reverb_ambience_base), even heard ahead through the elevator's walls as
      // its muffled copy. The road's tunnels set theirs themselves.
      const drone = name.endsWith('_muffled') ? name.slice(0, -'_muffled'.length) : name;
      if (drone.startsWith('lab_')) this.setVariant('lab', drone);
      else if (drone.startsWith('bat_')) this.setVariant('battle', drone);
      else if (drone.startsWith('tow_')) this.setVariant('tower', drone);
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

  begin(offset = 0) {
    const a = this.audio;
    const dryKey = 'dry:' + this.name;
    const buf = a.buffers.get(dryKey);
    if (!buf) {
      // A long recording not decoded yet: it starts the moment it is ready.
      a._decode(dryKey, this.pair.dry).then(() => { if (!this.stopped) this.begin(offset); }).catch(() => this.stop());
      return;
    }
    if (buf && this.pair.dry.frames > BIG_FRAMES) a._noteBig(dryKey);
    this.dry = this._branch(buf);
    const dullBuf = this.pair.dull ? a.buffers.get('dull:' + this.name) : null;
    if (dullBuf && a.room !== 'tunnel') this.dull = this._branch(dullBuf);
    // The echo. A looping sound gets its own (see AudioEngine._loopWet), played in
    // step with it, so it stops, pauses and fades with it as the desktop's does.
    // Anything else sends into the room's convolver; a loop sound played once gets
    // the plain room's first take, as the desktop's one-shot echo of a loop.
    const rooms = RULES.ROOMS[this.name] || [];
    const loopWet = (a.room && this.send > 0 && rooms.includes(a.room) && this.loop)
      ? a._loopWet(a.room, this.name, buf) : null;
    if (loopWet) {
      const br = this._branch(loopWet);
      this.wet = { buffer: loopWet, fade: br.fade, split: br.split, wl: br.gl, wr: br.gr, merge: br.merge };
    } else if (a.room && this.send > 0 && rooms.includes(a.room)) {
      const takes = RULES.TAKES[this.name] || 1;
      const once = !this.loop && (this.pair.dry.loop || reverbIsLoop(this.name));
      const conv = once ? a._convolver(a.room, 0, true)
        : (a._convolver(a.room, Math.floor(Math.random() * takes)) || a._convolver(a.room, 0));
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
        this.wet = { split, wl, wr, merge, conv };
        // The desktop's echo of a one-shot is never louder at its peak than 0.9 of
        // full scale (reverb_apply); the factor it scales by comes from the build.
        // A variation's own factor for the game's sounds; an event recording gets
        // its room's (the build works those out for the rooms only).
        const OS = RULES.ONCE_SCALE || {};
        const own = (OS[conv.key] || {})[this.name];
        const base = this.pair.dry.lazy ? (OS[conv.key.replace(/\/[^#]*/, '')] || {})[this.name] : undefined;
        this.wetScale = own || base || 1;
      }
    }
    const now = this.ctx.currentTime;
    // Nothing has sounded yet: the first levels are set outright, not glided to
    // (the desktop sets a channel's volume before it is ever mixed).
    this.begunAt = now;
    for (const br of [this.dry, this.dull, this.wet && this.wet.buffer ? this.wet : null]) {
      if (!br) continue;
      if (this.fadeMs > 0) {
        br.fade.gain.setValueAtTime(0, now);
        br.fade.gain.linearRampToValueAtTime(1, now + this.fadeMs / 1000);
      }
    }
    this.apply(true);
    this._startSources(offset);
  }

  // Carry a looping sound over to a fresh sound engine (see AudioEngine.recover).
  rebind(oldCtx) {
    if (this.stopped || this.ended) return;
    // A loop still being decoded begins in the new engine when it is ready.
    if (this.loop && !this.dry) { this.ctx = this.audio.ctx; return; }
    // One fading out was on its way out anyway.
    if (this.fadingOut) { this.stop(); return; }
    if (!this.loop || !this.dry) {
      // A one-shot plays out where it began (see recover); it is just no longer
      // tracked here.
      this.audio.live.delete(this);
      return;
    }
    const wasPaused = this.paused;
    const offset = wasPaused ? this.offset : Math.max(0, oldCtx.currentTime - this.startedAt);
    this._stopSources();
    this._disconnect();
    this.ctx = this.audio.ctx;
    this.dry = this.dull = this.wet = null;
    this.fadeMs = 0;
    this.paused = false;
    this.begin(offset);
    if (wasPaused) this.pause();
  }

  _startSources(offset) {
    const now = this.ctx.currentTime;
    this.sources = [];
    let first = null;
    for (const br of [this.dry, this.dull, this.wet && this.wet.buffer ? this.wet : null]) {
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
    if (instant || now <= this.begunAt) { param.cancelScheduledValues(now); param.setValueAtTime(v, now); }
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
    const k = this.wetScale || 1;
    this._set(this.wet.wl.gain, clamp(wl, 0, 1) * k, instant);
    this._set(this.wet.wr.gain, clamp(wr, 0, 1) * k, instant);
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
    this.fadingOut = true;
    const now = this.ctx.currentTime;
    for (const br of [this.dry, this.dull, this.wet && this.wet.buffer ? this.wet : null]) {
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
