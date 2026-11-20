// The game's recorded voices (web 6.1.0): Bella during a run, the Find the Voice
// guide, and Ultimate Mode's safe zone characters.
//
// Russell (19 November 2026): the voice made live on the player's device (Kokoro
// run in the browser, web 6.0.0 to 6.0.3) still fell back to the device's own voice
// now and then, and the characters' voices must always work. So nothing is made on
// the device any more: every line is a recording, made once with the same Kokoro
// voices in Claude's workspace (tools/voice/) and shipped in the sound packs
// (voice-bella, voice-guide, voice-cast), downloaded with the other sounds and kept
// on the device. There is no model, no download from another site and no wait.
//
// - Bella (af_bella) says every line of a run. A line the game builds itself is
//   said by joining recordings, the fixed words and the numbers each recorded on
//   their own (js/voice-text.js plan()). A line it cannot cover (only text typed into
//   an event made after these recordings, or before the sounds have loaded) is said
//   by the device's voice: never silence. Menus, help, settings, the Events menu,
//   event descriptions, Game Over and the final score keep the device's voice
//   (js/speech.js decides). One fixed speed; centred; heard with the echo of the
//   room or area the player is in, and never through Ultimate Mode's muffle or fade.
//   A new line cuts off whatever she is saying.
// - The guide (Heart, af_heart): her calling phrases, js/data/guide_phrases.json,
//   one recording each (the same files as the Windows game's).
// - The characters: every line of js/data/story-lines.json, one recording each, in
//   the character's own voice.
//
// Recordings are decoded when first needed (a few milliseconds each) and kept, up to
// a limit, so a line said again plays at once.

import { plan, makeIndex, sentenceParts } from './voice-text.js';
import { RULES } from './sound-rules.js';

export const ENTRY_KIND = 'voice';                 // the packs' entries of recordings
export const PREFIX = { bella: 'vb_', guide: 'vg_', cast: 'vc_' };
export const KEEP_BYTES = 24e6;                    // decoded recordings kept (about 2 minutes of speech)
export const KEEP_FRESH_MS = 3000;                 // ... but never let go within this long of being used
export const GUIDE_READY = 6;                      // the guide's calls kept decoded, ready to play

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

// ------------------------------------------------------------------ the recordings
// The voice packs' entries, decoded when asked for and kept within KEEP_BYTES.
export class VoiceLibrary {
  constructor(audio) {
    this.audio = audio;
    this.entries = new Map();     // name -> pack entry
    this.index = null;            // Bella's recordings by the words they say
    this.kept = new Map();        // name -> { buffer, bytes, pinned, used }
    this.pending = new Map();     // name -> Promise<AudioBuffer|null>
    this.bytes = 0;
    this.failed = new Set();
    this.counts = { bella: 0, guide: 0, cast: 0 };
  }

  // Read the recordings' entries from the sound engine's packs (once they are
  // attached). Returns how many there are.
  attach() {
    const a = this.audio;
    if (!a || !a.entries) return 0;
    const bella = [];
    this.entries.clear();
    this.counts = { bella: 0, guide: 0, cast: 0 };
    for (const [name, pair] of a.entries) {
      const e = pair && pair[ENTRY_KIND];
      if (!e) continue;
      this.entries.set(name, e);
      if (name.startsWith(PREFIX.bella)) { bella.push(e); this.counts.bella += 1; }
      else if (name.startsWith(PREFIX.guide)) this.counts.guide += 1;
      else if (name.startsWith(PREFIX.cast)) this.counts.cast += 1;
    }
    this.index = makeIndex(bella);
    return this.entries.size;
  }

  has(name) { return this.entries.has(name); }

  // The decoded recording now, or null (and it is decoded, for next time).
  peek(name) {
    const k = this.kept.get(name);
    if (k) { this._touch(name, k); return k.buffer; }
    this.get(name);
    return null;
  }

  // Used now: last in line to be let go.
  _touch(name, k) {
    k.used = now();
    this.kept.delete(name);
    this.kept.set(name, k);
  }

  // The decoded recording: a Promise of an AudioBuffer, or of null if it cannot be.
  get(name, { pin = false } = {}) {
    const k = this.kept.get(name);
    if (k) { if (pin) k.pinned = true; this._touch(name, k); return Promise.resolve(k.buffer); }
    if (this.pending.has(name)) return this.pending.get(name);
    const e = this.entries.get(name);
    if (!e || this.failed.has(name) || !this.audio || !this.audio._decodeEntry) return Promise.resolve(null);
    const p = this.audio._decodeEntry(e).then((buffer) => {
      this.pending.delete(name);
      const bytes = buffer.length * buffer.numberOfChannels * 4;
      this.kept.set(name, { buffer, bytes, pinned: pin, used: now() });
      this.bytes += bytes;
      this._trim(name);
      return buffer;
    }, () => { this.pending.delete(name); this.failed.add(name); return null; });
    this.pending.set(name, p);
    return p;
  }

  // Over the limit, the recordings used longest ago are let go. Never one used in the
  // last few seconds: several characters near you each keep four lines ready and ask
  // for them on every frame, and on a device whose sound runs at a high rate those can
  // be more than the limit; letting one go only to decode it again on the next frame,
  // over and over, would cost far more than the memory (the Fable review, 6.1.0).
  _trim(keep) {
    if (this.bytes <= KEEP_BYTES) return;
    const fresh = now() - KEEP_FRESH_MS;
    for (const [k, v] of this.kept) {
      if (this.bytes <= KEEP_BYTES) break;
      if (v.pinned || k === keep || v.used > fresh) continue;
      this.kept.delete(k);
      this.bytes -= v.bytes;
    }
  }

  // A recording no longer needed soon (a character's line heard out) is let go.
  release(name) {
    const k = this.kept.get(name);
    if (!k || k.pinned) return;
    this.kept.delete(name);
    this.bytes -= k.bytes;
  }
}

// ------------------------------------------------------------------ Bella
export class GameVoice {
  constructor({ audio = null, library = null } = {}) {
    this.audio = audio;
    this.library = library || new VoiceLibrary(audio);
    this.playing = new Set();       // sources sounding now
    this.gen = 0;                   // bumped by stop(): a line being said stops
    this.convs = new Map();         // room -> ConvolverNode (her own echo)
    this.plans = new Map();         // text -> plan (or null), the last few hundred
    this.missing = new Set();       // lines said by the device voice instead (for the tests)
    this.guide = new GuideVoice({ library: this.library });
  }

  // The sounds have loaded: the recordings are known from now on. (Nothing is decoded
  // ahead here: a recording takes a moment to decode when first said, and decoding a
  // great many at once would hold up the game's own sounds as a run begins. The guide
  // decodes a few of her calls when Find the Voice begins.)
  attach() {
    this.library.attach();
    this.guide.load();
  }

  get ready() { return !!(this.library.index && this.library.counts.bella > 0); }

  _plan(text) {
    if (this.plans.has(text)) return this.plans.get(text);
    const p = this.ready ? plan(text, this.library.index) : null;
    if (this.plans.size > 400) this.plans.delete(this.plans.keys().next().value);
    this.plans.set(text, p);
    if (!p && this.ready && sentenceParts(text)) this.missing.add(text);
    return p;
  }

  // Whether Bella can say the whole of this line.
  canSay(text) { return this.ready && !!this._plan(text); }

  // Say a line. Resolves with 'done' (said to the end), 'stopped' (cut off by a new
  // line or stop()), or { fallback: text }: the part of the line she could not say,
  // for the device voice (the whole line if nothing was said). isCurrent(): false
  // once the line is no longer wanted.
  async say(text, { isCurrent = () => true } = {}) {
    const p = this._plan(text);
    if (!p) return { fallback: text };
    const gen = ++this.gen;
    const live = () => gen === this.gen && isCurrent();
    // Every recording of the line is asked for at once (most are kept already).
    const bufs = p.map((sent) => sent.map((pc) => this.library.get(pc.name)));
    const sentences = sentenceTexts(text);
    for (let s = 0; s < p.length; s++) {
      const got = await Promise.all(bufs[s]);
      if (!live()) return 'stopped';
      if (got.some((b) => !b)) return { fallback: s === 0 ? text : sentences.slice(s).join(' ') };
      const ended = await this._play(got, p[s].map((pc) => pc.gapBefore), live);
      if (!ended || !live()) return 'stopped';
    }
    return 'done';
  }

  // Cut off whatever she is saying.
  stop() {
    this.gen += 1;
    for (const h of [...this.playing]) h.stop();
  }

  // Where her echo comes from: the room the player is in (its variation, as the
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

  // The bus she plays into: the game's master (so the limiter keeps the total under
  // the top), never the 3D world's filter and fade.
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

  // Play one sentence's recordings one after another, each starting exactly where
  // the one before ends (and the quiet given before it), centred, with the room's
  // echo. Resolves true when it has played to its end, false if stopped.
  _play(buffers, gaps, live) {
    const a = this.audio;
    const ctx = a && a.ctx;
    const out = this._out();
    if (!ctx || !out) return Promise.resolve(false);
    try { if (a.wake) a.wake(); } catch (e) { /* the sound wakes on the next touch */ }
    return new Promise((resolve) => {
      const dry = ctx.createGain();
      dry.gain.value = this._master();
      dry.connect(out);
      let wet = null;
      const room = this._room();
      if (room) {
        const send = (RULES.REVERB_SEND && RULES.REVERB_SEND.speech !== undefined) ? RULES.REVERB_SEND.speech : 0.22;
        const g = Math.max(0, Math.min(1.5, a.roomGain === undefined ? 1 : a.roomGain));
        wet = ctx.createGain();
        wet.gain.value = send * g * this._master();
        try { wet.connect(this._conv(ctx, room)); } catch (e) { wet = null; }
      }
      const start = ctx.currentTime + 0.02;
      let at = start;
      const srcs = [];
      buffers.forEach((buffer, i) => {
        at += (gaps[i] || 0) / 1000;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(dry);
        if (wet) src.connect(wet);
        src.start(at);
        at += buffer.duration;
        srcs.push(src);
      });
      const length = at - ctx.currentTime;
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        this.playing.delete(handle);
        setTimeout(() => { try { dry.disconnect(); if (wet) wet.disconnect(); } catch (e) { /* gone */ } }, 4000);
        resolve(ok);
      };
      // A phone that has stopped the sound (locked, a call) never ends the line:
      // never wait for it longer than it lasts and a moment more.
      const guard = setTimeout(() => { for (const s of srcs) { try { s.stop(); } catch (e) { /* ended */ } } finish(live()); }, length * 1000 + 1500);
      const handle = {
        stop: () => {
          if (done) return;
          // A breath of a fade, so a cut-off line does not click.
          const now = ctx.currentTime;
          try { dry.gain.setTargetAtTime(0, now, 0.01); if (wet) wet.gain.setTargetAtTime(0, now, 0.01); } catch (e) { /* gone */ }
          for (const s of srcs) { try { s.stop(now + 0.05); } catch (e) { /* never started */ } }
          finish(false);
        },
      };
      srcs[srcs.length - 1].onended = () => finish(live());
      this.playing.add(handle);
    });
  }

  // The game's master level differs between the 3D world and the other modes
  // (js/audio.js MASTER_LEVEL, MASTER_LEVEL_3D): she is levelled against it so she is
  // the same loudness in every mode.
  _master() {
    const a = this.audio;
    const m = a && a.out && a.out.gain ? a.out.gain.value : 1;
    return m > 0.05 ? 1 / m : 1;
  }
}

function sentenceTexts(text) {
  return String(text).trim().split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter((p) => /\w/.test(p));
}

// ------------------------------------------------------------------ the guide
// The Find the Voice guide (Heart): her calling phrases, hundreds of them, so she
// never sounds the same twice running. A few are kept decoded and ready to play.
//
// For the mode (js/modes/findvoice-guide.js):
//   g.available            true once the recordings are known
//   g.prepare(n)           keep about n ready (a run begins)
//   g.next()               { id, text, buffer } (buffer null only if none is ready)
//   g.release()            the run is over
export class GuideVoice {
  constructor({ library, url = null } = {}) {
    this.library = library;
    this.url = url || new URL('./data/guide_phrases.json' + (typeof import.meta !== 'undefined' ? new URL(import.meta.url).search : ''), import.meta.url).href;
    this.all = null;                // every phrase of the list
    this.phrases = null;            // [{ id, text }] that have a recording
    this.loading = null;
    this.ready = new Map();         // id -> AudioBuffer, decoded and waiting
    this.making = new Set();
    this.want = 0;
    this.recent = [];
  }

  get available() { this._known(); return !!(this.phrases && this.phrases.length); }

  load() {
    if (this.all) { this._known(); return Promise.resolve(this.phrases); }
    if (!this.loading) {
      this.loading = fetch(this.url).then((r) => r.json()).then((data) => {
        this.all = (data.phrases || []).filter((p) => p.text);
        this._known();
        this._top();
        return this.phrases;
      }).catch(() => { this.loading = null; return null; });
    }
    return this.loading;
  }

  // Which phrases have a recording. (Asked again until some do: the list may be read
  // before the sound packs are known, and must not be left empty for good.)
  _known() {
    if (!this.all || (this.phrases && this.phrases.length)) return;
    this.phrases = this.all.filter((p) => this.library.has(PREFIX.guide + p.id));
  }

  prepare(count = GUIDE_READY) {
    this.want = Math.max(this.want, Math.min(40, count | 0));
    this.load().then(() => this._top());
  }

  standBy() { this.prepare(GUIDE_READY); }

  _top() {
    this._known();
    if (!this.phrases || !this.phrases.length) return;
    while (this.ready.size + this.making.size < this.want) {
      const p = this._pick(new Set([...this.ready.keys(), ...this.making, ...this.recent]));
      if (!p) break;
      this.making.add(p.id);
      this.library.get(PREFIX.guide + p.id).then((buf) => {
        this.making.delete(p.id);
        if (buf) this.ready.set(p.id, buf);
      });
    }
  }

  _pick(avoid) {
    const list = this.phrases.filter((p) => !avoid.has(p.id));
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  next() {
    if (!this.available) return { id: 0, text: 'Over here!', buffer: null };
    let id = null;
    for (const k of this.ready.keys()) { id = k; break; }
    let p; let buffer = null;
    if (id !== null) {
      buffer = this.ready.get(id);
      this.ready.delete(id);
      p = this.phrases.find((q) => q.id === id);
    } else {
      p = this._pick(new Set(this.recent)) || this.phrases[0];
      buffer = this.library.peek(PREFIX.guide + p.id);
    }
    this.recent.push(p.id);
    if (this.recent.length > 8) this.recent.shift();
    this.library.release(PREFIX.guide + p.id);
    this._top();
    return { id: p.id, text: p.text, buffer };
  }

  // How many calls are decoded and waiting.
  stock() { return this.ready.size; }
  get busy() { return this.making.size > 0; }

  release() { this.want = GUIDE_READY; }
}

// ------------------------------------------------------------------ the characters
// A safe zone character's line: its recording, by the line's id (vc_<id>).
export class CastVoices {
  constructor(library) {
    this.library = library;
  }

  _name(ln) { return PREFIX.cast + ln.id; }

  // Whether this line has a recording (false: the device's voice says it).
  has(ln) { return !!(ln && this.library && this.library.has(this._name(ln))); }

  // The line's sound if it is decoded, else null (and it is decoded now, for the
  // next frame).
  peek(ln) { return this.has(ln) ? this.library.peek(this._name(ln)) : null; }

  // Whether its recording could not be decoded (the device's voice says it).
  failed(ln) { return !this.has(ln) || this.library.failed.has(this._name(ln)); }

  // A line heard out is let go.
  done(ln) { if (ln) this.library.release(this._name(ln)); }
}
