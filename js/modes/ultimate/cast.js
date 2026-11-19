// Ultimate Mode's safe zone characters (web 6.0.0, Russell, 19 November 2026):
// who stands in each safe zone, what they say, and their voices.
//
// The data is agent "story"'s: js/data/safe-zone-cast.json (the characters: id,
// name, Kokoro voice id, the backgrounds they live in, their gift group) and
// js/data/story-lines.json (each character's greetings, call-backs, gift lines and
// story lines, with stable ids, Misaki phonemes, and a flag on the story lines that
// are hints). They are read once, when the game starts; a format they may come in
// is normalised here (normaliseCast), so the rest of the mode sees one shape:
//
//   character = { id, name, voice, group (1..8), backgrounds: [stem], lines: {
//     greeting: [line], callback: [line], gift: [line], story: [line] } }
//   line = { id, text, phonemes, hint }
//
// The voices: Kokoro (js/bella.js's one engine and worker, the one Bella and the
// guide use), a small style file per character (voices/<id>.bin, fetched and kept
// only when that character is first needed), each line made straight from its own
// phonemes. Lines are made ahead while you walk and kept within a modest budget.

import { KOKORO_BASE, shape } from '../../bella.js';

export const CAST_URL = 'js/data/safe-zone-cast.json';
export const LINES_URL = 'js/data/story-lines.json';
export const CHAR_RMS = 0.11;                 // each line's loudness, as the guide's (bella.js GUIDE_RMS)
export const KEEP_BYTES = 6e6;                // lines kept made, about a minute of speech
export const KOKORO_RATE = 24000;

// Russell's eight groups (19 Nov), by name as the data may give them.
export const GROUPS = ['spooky', 'towns', 'kitchens', 'fire', 'holy', 'water', 'wild', 'cold'];
const GROUP_WORDS = [
  [1, /spook|witch|haunt|ghost|grave/], [2, /town|travel|city|market|village|station/], [3, /kitchen|food|cafe|restaurant|tavern/],
  [4, /fire|hearth|camp/], [5, /holy|quiet|church|cathedral|organ|library|choir/], [6, /water|ocean|river|rain|sea|marsh/],
  [7, /wild|nature|forest|jungle|bird|insect/], [8, /cold|storm|machine|space|ice|wind|industrial|winter/],
];
export function groupOf(g) {
  if (typeof g === 'number' && g >= 1 && g <= 8) return Math.floor(g);
  const n = Number(g);
  if (n >= 1 && n <= 8) return Math.floor(n);
  const s = String(g || '').toLowerCase();
  if (GROUPS.includes(s)) return GROUPS.indexOf(s) + 1;
  for (const [k, re] of GROUP_WORDS) if (re.test(s)) return k;
  return 8;
}

const stemOf = (b) => String(b || '').replace(/\.(ogg|wav|mp3|flac)$/i, '').replace(/^(?!evt_amb_)/, 'evt_amb_');
const KIND_WORDS = { greeting: 'greeting', greetings: 'greeting', hello: 'greeting', callback: 'callback', callbacks: 'callback', call_back: 'callback',
  call_backs: 'callback', 'call-back': 'callback', 'call-backs': 'callback', gift: 'gift', gifts: 'gift', story: 'story', stories: 'story',
  hint: 'story', hints: 'story', 'story-hint': 'story', story_hint: 'story', 'story-hints': 'story', story_hints: 'story', rumour: 'story', rumours: 'story' };

function line(raw, kind, owner, i) {
  if (typeof raw === 'string') return { id: `${owner}:${kind}:${i}`, text: raw, phonemes: null, hint: false };
  if (!raw || typeof raw !== 'object' || !raw.text) return null;
  return { id: String(raw.id !== undefined ? raw.id : `${owner}:${kind}:${i}`), text: String(raw.text), phonemes: raw.phonemes || raw.ph || null,
    hint: !!(raw.hint || raw.is_hint || /hint/.test(String(raw.kind || raw.type || ''))), lang: raw.lang || null };
}

// The two files, in whatever reasonable shape, as the characters above.
export function normaliseCast(castData, linesData) {
  const list = Array.isArray(castData) ? castData : (castData && (castData.characters || castData.cast)) || [];
  const byId = new Map();
  for (const c of list) {
    if (!c || !c.id) continue;
    byId.set(String(c.id), {
      id: String(c.id), name: c.name || String(c.id), voice: c.voice || c.voice_id || c.kokoro || null, lang: c.lang || c.accent || null,
      group: groupOf(c.group !== undefined ? c.group : c.group_name),
      backgrounds: (c.backgrounds || c.zones || []).map(stemOf),
      lines: { greeting: [], callback: [], gift: [], story: [] },
    });
  }
  const L = linesData && (linesData.lines || linesData.characters || linesData);
  const add = (owner, kind, raw, i) => {
    const ch = byId.get(owner);
    const k = KIND_WORDS[kind];
    if (!ch || !k) return;
    const ln = line(raw, k, owner, i);
    if (!ln) return;
    if (/hint/.test(kind)) ln.hint = true;
    ch.lines[k].push(ln);
  };
  if (Array.isArray(L)) {
    // A flat list: { character, kind, ... }.
    L.forEach((r, i) => add(String(r.character || r.character_id || r.char || r.cid || r.owner), String(r.kind || r.type || '').toLowerCase(), r, i));
  } else if (L && typeof L === 'object') {
    for (const [owner, groups] of Object.entries(L)) {
      if (!groups || typeof groups !== 'object') continue;
      if (Array.isArray(groups)) { groups.forEach((r, i) => add(owner, String(r.kind || r.type || '').toLowerCase(), r, i)); continue; }
      for (const [kind, arr] of Object.entries(groups)) if (Array.isArray(arr)) arr.forEach((r, i) => add(owner, kind.toLowerCase(), r, i));
    }
  }
  return [...byId.values()].filter((c) => c.lines.greeting.length || c.lines.story.length);
}

// ------------------------------------------------------------------ the cast, read once
let cast = [];
let byStem = new Map();
let loading = null;

export function setCast(list) {
  cast = list || [];
  byStem = new Map();
  for (const c of cast) for (const s of c.backgrounds) if (!byStem.has(s)) byStem.set(s, c);
}

export function loadCast() {
  if (!loading) {
    const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    loading = Promise.all([get(CAST_URL), get(LINES_URL)]).then(([c, l]) => { if (c && l) setCast(normaliseCast(c, l)); return cast; });
  }
  return loading;
}

export function castFor(stem) { return byStem.get(stem) || null; }
export function castList() { return cast; }

// ------------------------------------------------------------------ the voices
// Made through Bella's engine (one model), or null when that cannot be: no engine,
// the engine not ready, or this character's voice not loadable by it.
export class CastVoices {
  constructor(getEngine) {
    this.getEngine = getEngine;
    this.kept = new Map();          // `${voice}|${line.id}` -> { buffer, bytes } (or { pending })
    this.bytes = 0;
    this.voices = new Map();        // voice -> 'ready' | 'loading' | 'failed'
    this.listening = null;
  }

  get engine() { try { return this.getEngine(); } catch (e) { return null; } }

  // Whether this voice can be heard now, or will be (false: the device's voice).
  usable(voice) {
    const e = this.engine;
    if (!e || !voice || e.state === 'failed' || !e.ready) return false;
    return this._voice(voice) !== 'failed';
  }

  // The engine's worker loads its voices when it starts; a character's own voice is
  // asked for when first needed ({ type: 'voice', name, url }, answered with
  // { type: 'voice', name, ok }). A worker that never answers leaves it 'failed'
  // after a while, and the character speaks with the device's voice.
  _voice(voice) {
    const e = this.engine;
    const st = this.voices.get(voice);
    if (st) return st;
    if (e.voiceLoaded && e.voiceLoaded(voice)) { this.voices.set(voice, 'ready'); return 'ready'; }
    if (e.loadVoice) {
      this.voices.set(voice, 'loading');
      Promise.resolve(e.loadVoice(voice)).then((ok) => this.voices.set(voice, ok === false ? 'failed' : 'ready'), () => this.voices.set(voice, 'failed'));
      return 'loading';
    }
    const w = e.worker;
    if (!w || !w.postMessage) { this.voices.set(voice, 'failed'); return 'failed'; }
    if (!this.listening) {
      this.listening = (ev) => { const m = ev.data || {}; if (m.type === 'voice' && m.name) this.voices.set(m.name, m.ok === false ? 'failed' : 'ready'); };
      try { w.addEventListener('message', this.listening); } catch (err) { /* old worker */ }
    }
    this.voices.set(voice, 'loading');
    try { w.postMessage({ type: 'voice', name: voice, url: `${KOKORO_BASE}voices/${voice}.bin` }); } catch (err) { this.voices.set(voice, 'failed'); }
    setTimeout(() => { if (this.voices.get(voice) === 'loading') this.voices.set(voice, 'failed'); }, 20000);
    return 'loading';
  }

  // A line's sound if it is made, else null (and it is made now, ahead).
  peek(voice, ln, ctx) {
    const k = `${voice}|${ln.id}`;
    const got = this.kept.get(k);
    if (got && got.buffer) { this.kept.delete(k); this.kept.set(k, got); return got.buffer; }
    if (!got) this.make(voice, ln, ctx);
    return null;
  }

  make(voice, ln, ctx, now = false) {
    const k = `${voice}|${ln.id}`;
    if (this.kept.has(k) || !ln.phonemes || !this.usable(voice) || this._voice(voice) !== 'ready') return;
    const e = this.engine;
    // Sentence by sentence: a long story line made in one piece would hold the voice
    // engine for many seconds on a phone, and the game's own lines would wait behind
    // it. The sentences are joined again with a breath between them.
    const parts = String(ln.phonemes).split(/(?<=[.!?…])\s+/).filter((p) => p.trim());
    const jobs = (parts.length ? parts : [ln.phonemes]).map((p) => e.synth(p, voice, { now }));
    const entry = { pending: true };
    this.kept.set(k, entry);
    Promise.all(jobs.map((j) => j.promise)).then((rs) => {
      let y = null;
      if (rs.every((r) => r && r.samples)) {
        const made = rs.map((r) => shape(r.samples, CHAR_RMS)).filter((x) => x);
        const gap = Math.round(0.18 * KOKORO_RATE);
        const n = made.reduce((s, m) => s + m.length, 0) + gap * Math.max(0, made.length - 1);
        if (made.length) {
          y = new Float32Array(n);
          let at = 0;
          for (const m of made) { y.set(m, at); at += m.length + gap; }
        }
      }
      if (!y) { this.kept.delete(k); return; }
      let buf;
      try { buf = new AudioBuffer({ length: y.length, numberOfChannels: 1, sampleRate: KOKORO_RATE }); } catch (err) { buf = ctx.createBuffer(1, y.length, KOKORO_RATE); }
      buf.getChannelData(0).set(y);
      entry.pending = false; entry.buffer = buf; entry.bytes = y.length * 4;
      this.bytes += entry.bytes;
      for (const [kk, v] of this.kept) {
        if (this.bytes <= KEEP_BYTES) break;
        if (kk === k || !v.buffer) continue;
        this.kept.delete(kk); this.bytes -= v.bytes;
      }
    });
  }

  release() { this.kept.clear(); this.bytes = 0; }
}

// ------------------------------------------------------------------ the mystery: lines heard
// Which story lines a player has heard, kept between runs in the game's own saved
// settings (a short list of ids). Unheard ones come first; when a character's are
// all heard, theirs start over.
export function pickStory(ch, settings) {
  const heard = new Set((settings && settings.storyHeard) || []);
  const all = ch.lines.story;
  if (!all.length) return null;
  let pool = all.filter((l) => !heard.has(l.id));
  if (!pool.length) {
    if (settings) settings.storyHeard = (settings.storyHeard || []).filter((id) => !all.some((l) => l.id === id));
    pool = all;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export function noteHeard(settings, ln) {
  if (!settings || !ln) return;
  // (A new list each time, never the old one added to: the saved settings tell a
  // changed setting by its being a different thing from the one last saved, and a
  // list added to in place would be taken for unchanged and lost at the next save.)
  const list = (settings.storyHeard || []).slice();
  if (!list.includes(ln.id)) list.push(ln.id);
  while (list.length > 3000) list.shift();
  settings.storyHeard = list;
}
