// Find the Voice (web 6.0.0, Russell's design, 19 November 2026).
//
// A guide calls from somewhere in the room, placed in 3D, with Kokoro's Heart
// voice (js/modes/findvoice-guide.js), and keeps calling, never the same phrase
// twice running, until you reach her: within two steps. One chime, always the
// same; half a second of silence; and she calls from somewhere new. Five finds
// complete a level, and the next level begins at once, with a new background
// (the events' backgrounds only: level 1 is always the witch's) and the guide
// further away.
//
// The room's floor is concrete with broken glass scattered over parts of it. A
// creature lives in the room, one a level: blind, like you, it hunts by sound.
// Step on glass and it charges you, growling, a footstep for every step it runs,
// heard from where it is; it keeps charging for as long as you are on glass, and
// stops about a second after you are back on concrete, where it then stands,
// breathing. Glass never lies near it, so there is always time to turn and get
// off. Sometimes the guide calls from a spot that can be reached only across
// glass. A catch costs one of three lives and the creature is thrown back to a
// far-off spot; there is no clock, and the run ends with the third catch. The
// score is the levels completed.
//
// The mode turns as the walking modes do (js/turning.js, through the game's own
// turning, exactly as Standard uses it): left and right turn, up walks or runs,
// down steps back.
//
// Chaos Mode plays Find the Voice stages too (js/modes/chaos.js): a quota of finds,
// then an exit, with the stage's own three lives for the whole chaos run.

import { aliasRecording } from './events/sounds.js';
import { EVENT_BACKGROUNDS, AMBIENCE_LEVEL, BACKGROUND_SEND } from './ultimate.js';
import { RULES } from '../sound-rules.js';
import { getGuideCall, guideVoiceReady, guideRunStarts, guideRunEnds, setGuideSource, sayLocatable, guideStock, guideMaking, FALLBACK_PHRASES } from './findvoice-guide.js';

export const STATE = 'findvoice';
export const BOARD = 'findvoice';

// ------------------------------------------------------------------ constants
// (The same numbers and choices as the Windows game's find_the_voice.py, 4.0.0.)
export const FV_STEP = 3.0;                     // one step, in the game's units (the arena's step)
export const FV_REACH = 2 * FV_STEP;            // within two steps of the guide is reaching her
export const FV_FINDS_PER_LEVEL = 5;
export const FV_LIVES = 3;
export const FV_ARENA = 36.0;                   // the room: this far each way from its middle (24 steps across)
// Where she calls from, in units from you: at least 12, 4 more each level (never
// over 1.2 times the room's half-width), within a span of 10.
export const FV_GUIDE_DIST = [12.0, 4.0, 10.0];
export const FV_GUIDE_APART = 15.0;             // and at least this far from the creature
export const FV_GUIDE_LEVEL = 1.0;              // her level when you are beside her (the in-run voice's)
export const FV_GUIDE_RANGE = 48.0;             // she fades over this many units ...
export const FV_GUIDE_FLOOR = 0.15;             // ... and is never quieter than this, from across the room
export const FV_CALL_GAP = [1.0, 2.0];          // seconds of quiet between two of Heart's calls
export const FV_FALLBACK_GAP = [2.2, 3.2];      // between two calls said by the device's voice
export const FV_FIRST_CALL = 0.8;               // the first call of a run, after the level is said
// (6.0.1, Russell) Heart is given time: her first call of a run waits until two of
// her calls are made, this long at most; and later, a call that is due while her
// next one is still being made waits this long for it. Only then does the device's
// voice speak for her. (Nothing is waited for when Heart cannot speak at all.)
export const FV_FIRST_HOLD = 8.0;
export const FV_FIRST_STOCK = 2;
export const FV_HEART_WAIT = 1.5;
export const FV_PAUSE = 0.5;                    // the quiet after the chime before she calls again (as Call of Fate)
export const FV_CHIME = 'evt_chime_clear';      // reaching her: one chime, always this one (as Trapped in Darkness's)
export const FV_CHIME_LEVEL = 0.9;
export const FV_GUIDE_BEACON = 'event_beacon_shimmer';   // where she stands, while the device's voice speaks for her
export const FV_BEACON_LEVEL = 0.7;
// The creature. Speeds are in steps a minute: 220 at level 1, 5 more a level, never
// over 260; the player's run is 280 (game.js RUN_STEPS_PER_MINUTE). Trapped in
// Darkness's charging creature runs at 3.1 steps a second, 186 a minute.
export const FV_CHARGE_SPM = 220;
export const FV_CHARGE_RISE = 5;
export const FV_CHARGE_CAP = 260;
export const FV_CHARGE_TAIL = 1.0;              // seconds it runs on after you are back on concrete
export const FV_CATCH = 1.5;                    // units: this near while charging, it has you
export const FV_THROW_FAR = 30.0;               // thrown back at least this far from you after a catch
export const FV_GLASS_CLEAR = 24.0;             // units (eight steps): no glass this near where it rests
export const FV_GROWL = 'evt_monster_growl';    // charging: Trapped in Darkness's charging creature
export const FV_BREATH = 'evt_beast_breathing'; // at rest: the events' resting creature
export const FV_CREATURE_GAIN = 1.0;            // at the loudness of a battle enemy
export const FV_STEP_GAIN = 0.9;                // its footsteps, against its own level (the events' CHARGE_STEP_GAIN)
// The floor: patches of glass, laid each level; now and then a disc of it round the guide.
export const FV_PATCHES = [4, 1, 9];            // patches: 4 on level 1, one more each level, at most 9
export const FV_PATCH_SIZE = [2, 6];            // squares in a patch
export const FV_MOAT_CHANCE = 0.3;
export const FV_MOAT_RADIUS = 8.3;              // every square whose middle is this close to her: any spot within reach of her is glass
export const FV_STEPS_STONE = ['step_stone_1', 'step_stone_2', 'step_stone_3', 'step_stone_4'];
export const FV_STEPS_GLASS = ['ut_glass_step_1', 'ut_glass_step_2', 'ut_glass_step_3', 'ut_glass_step_4'];
export const FV_VOICE_SEND = 0.22;              // the guide's echo (the speech family's)
export const FV_ROOM = 'battle';                // the room's echo: the battle arena's
export const FV_FIRST_BACKGROUND = 'evt_amb_witch';
// Chaos: the stage's exit, and how far off it appears.
export const FV_EXIT_RANGE = [15.0, 30.0];
export const FV_EXIT_REACH = 3.0;

const SQ = FV_STEP;                             // a square of floor is one step across
const N = Math.floor(FV_ARENA / SQ);            // squares each way from the middle
const RATE = 44100;
const VOICE_ROOMS = ['lab', 'tower', 'battle', 'cathedral', 'hall'];

// ------------------------------------------------------------------ helpers
const rand = Math.random;
const uniform = (a, b) => a + (b - a) * rand();
const randint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const choice = (arr) => arr[Math.floor(rand() * arr.length)];
const plural = (n, word, many = word + 's') => (n === 1 ? word : many);
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cellOf = (p) => [Math.round(p[0] / SQ), Math.round(p[1] / SQ)];
const K = (i, j) => i + ',' + j;
const posOf = (i, j) => [i * SQ, j * SQ];
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

function pointToSegment(x, y, a, b) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const span = dx * dx + dy * dy;
  const t = span <= 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / span));
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

// Steps a minute for the creature at a level (or a chaos stage's count).
export function chargeStepsPerMinute(level) {
  return Math.min(FV_CHARGE_CAP, FV_CHARGE_SPM + FV_CHARGE_RISE * (Math.max(1, level) - 1));
}

// The band, in units from you, the guide calls from at a level.
export function guideBand(level) {
  const lo = Math.min(FV_ARENA * 1.2, FV_GUIDE_DIST[0] + FV_GUIDE_DIST[1] * (Math.max(1, level) - 1));
  return [lo, lo + FV_GUIDE_DIST[2]];
}

// ------------------------------------------------------------------ the mode's own sounds
// A buffer handed in (one of Heart's calls, a demo) made playable under a name.
function registerBuffer(audio, name, buffer, family = 'speech') {
  audio.entries.set(name, { dry: { frames: 0, made: true } });
  audio.buffers.set('dry:' + name, buffer);
  audio.buffers.delete('dull:' + name);
  RULES.FAMILY[name] = family;
  RULES.ROOMS[name] = VOICE_ROOMS;
  return name;
}

// The help's demos that are made, not recorded (the guide's calls, the creature
// charging), as soon as what they are made from is ready. The website's Help page
// calls this too, before it plays a demo of this mode.
export async function makeFindVoiceSounds(audio) {
  await Promise.all([makeGuideDemo(audio), makeChargeDemo(audio)]);
}

// Help's demo of the guide: three of her calls, a moment apart, when Heart's voice
// is ready; otherwise the shimmering beacon that marks where she stands.
export async function makeGuideDemo(audio) {
  const name = 'fv_demo_guide';
  try {
    if (guideVoiceReady()) {
      const calls = [getGuideCall(), getGuideCall(), getGuideCall()].filter((c) => c.buffer);
      if (calls.length) {
        const rate = calls[0].buffer.sampleRate;
        const gap = Math.floor(rate * 1.2);
        const n = calls.reduce((s, c) => s + c.buffer.length + gap, 0);
        const out = audio.ctx.createBuffer(1, n, rate);
        const d = out.getChannelData(0); let at = 0;
        for (const c of calls) { d.set(c.buffer.getChannelData(0), at); at += c.buffer.length + gap; }
        return registerBuffer(audio, name, out);
      }
    }
    const b = await audio.prepare(FV_GUIDE_BEACON);
    return b ? registerBuffer(audio, name, b, 'beacon') : null;
  } catch (e) {
    return null;
  }
}

// Help's demo of the creature charging: its growl, and its footsteps running
// closer, as it is heard in a run.
export async function makeChargeDemo(audio) {
  const name = 'fv_demo_charge';
  if (audio.buffers.has('dry:' + name)) return name;
  try {
    const growl = await audio.prepare(FV_GROWL);
    const steps = (await Promise.all(FV_STEPS_STONE.map((s) => audio.prepare(s)))).filter((x) => x);
    if (!growl || !steps.length) return null;
    const rate = growl.sampleRate;
    const n = growl.length;
    const out = audio.ctx.createBuffer(1, n, rate);
    const d = out.getChannelData(0);
    const mono = (b) => { const c0 = b.getChannelData(0); if (b.numberOfChannels < 2) return c0; const c1 = b.getChannelData(1); const m = new Float32Array(b.length); for (let i = 0; i < b.length; i++) m[i] = 0.5 * (c0[i] + c1[i]); return m; };
    const g = mono(growl);
    for (let i = 0; i < n; i++) d[i] = 0.8 * g[i];
    const every = Math.floor(rate * 60 / FV_CHARGE_SPM);
    let k = 0;
    for (let at = Math.floor(rate * 0.2); at < n - every; at += every, k++) {
      const s = mono(steps[k % steps.length]);
      const gain = FV_STEP_GAIN * (0.45 + 0.55 * at / n);   // coming closer
      for (let i = 0; i < s.length && at + i < n; i++) d[at + i] += gain * s[i];
    }
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0.98) for (let i = 0; i < n; i++) d[i] *= 0.98 / peak;
    return registerBuffer(audio, name, out, 'event');
  } catch (e) {
    return null;
  }
}

// ------------------------------------------------------------------ the game's methods
const mixin = {
  startFindVoice() {
    this.state = STATE;
    this.resetGameState();
    this.state = STATE;
    this._syncRoom();
    this._wake(true);
    if (this.ambienceChannel) { this.ambienceChannel.stop(); this.ambienceChannel = null; }
    if (this.beatChannel) { this.beatChannel.stop(); this.beatChannel = null; }
    this._fvBegin({ chaos: false, level: 1, quota: FV_FINDS_PER_LEVEL, lives: FV_LIVES });
    // (6.0.1, Russell: only the level is said; the mode's name was just heard on the menu.)
    this.tts.speak('Level 1.', { interrupt: true });
  },

  // A run, or a chaos stage. `level` sets the creature's speed, the glass and the
  // guide's distance (in chaos, the stage's count in the run); `quota` the finds wanted.
  _fvBegin({ chaos, level, quota, lives, background = null, adopt = null }) {
    this._fvWireGuide();
    guideRunStarts();
    // The creature's two recordings and the chime (the events' library, decoded only
    // when first needed) are decoded now, so the first breath is heard at once.
    for (const [stem, role] of [[FV_BREATH, 'beacon_hazard'], [FV_GROWL, 'beacon_hazard'], [FV_CHIME, 'pickup']]) {
      const n = aliasRecording(this.audio, stem, `event_${role}_file_${stem}`);
      if (n) this.audio.prepare(n);
    }
    const fv = this.fv = {
      run: this.runId, chaos, level, quota, lives, finds: 0, completed: 0,
      guide: { pos: null, voice: null, beacon: null, wait: FV_FIRST_CALL, until: 0, phase: 'calling', calls: 0 },
      chime: null, pause: 0, caughtAt: null,
      creature: { x: 0, y: 0, state: 'rest', tail: 0, knock: 0, voice: null, note: null, speed: 0 },
      glass: new Set(), moat: new Set(), amb: null, exit: null, steps: [],
    };
    this._fvBackground(background || (chaos ? this._fvNextBackground() : FV_FIRST_BACKGROUND), 0.4, adopt);
    this._fvBeginLevel(true);
  },

  // A level (or a chaos stage): you at the middle of the room, a creature at rest far
  // off, the glass laid, and the guide's first spot.
  _fvBeginLevel(first) {
    const fv = this.fv;
    this._fvStopGuide(0);
    if (fv.creature.voice) { fv.creature.voice.fadeout(200); fv.creature.voice = null; }
    this.playerPos = [0.0, 0.0];
    this.arenaLimit = FV_ARENA;
    this.stride = null;
    fv.finds = 0;
    fv.caughtAt = null;
    fv.exit = null;
    const c = fv.creature = { x: 0, y: 0, state: 'rest', tail: 0, knock: 0, voice: null, note: null,
      speed: chargeStepsPerMinute(fv.level) / 60 * FV_STEP };
    [c.x, c.y] = this._fvSpot(FV_GLASS_CLEAR + 4.0, FV_ARENA * 1.4);
    this._fvCreatureSound(false);
    this._fvLayGlass();
    this._fvNewGuideSpot(true);          // (never inside glass as a level begins)
    fv.guide.wait = first ? FV_FIRST_CALL : 0;
    fv.guide.until = 0;
  },

  // Heart's calls come from the voice module (js/bella.js GuideVoice, as
  // speech.bella.guide), when it could be made; without it, the device's voice.
  _fvWireGuide() {
    const b = this.tts && this.tts.bella;
    if (b && b.guide) setGuideSource(b.guide);
  },

  // ---------------------------------------------------------------- the background
  // The next background: every event background but the witch's, in a shuffled
  // order, none again until all have been heard (the bag is the game's, so a chaos
  // run's stages go on through it).
  _fvNextBackground() {
    const have = EVENT_BACKGROUNDS.filter((s) => s !== FV_FIRST_BACKGROUND && this.audio.has(s));
    if (!have.length) return this.audio.has(FV_FIRST_BACKGROUND) ? FV_FIRST_BACKGROUND : null;
    if (!this.fvBag || !this.fvBag.length) {
      this.fvBag = shuffle(have.slice());
      if (this.fvBag.length > 1 && this.fvBag[this.fvBag.length - 1] === this.fvLastBg) this.fvBag.unshift(this.fvBag.pop());
    }
    const s = this.fvBag.pop();
    this.fvLastBg = s;
    // The one after it, decoded ahead so the next level's air comes in at once.
    if (this.fvBag.length) { const nx = aliasRecording(this.audio, this.fvBag[this.fvBag.length - 1], `event_amb_file_${this.fvBag[this.fvBag.length - 1]}`); if (nx) this.audio.prepare(nx, 'next:fv'); }
    return s;
  },

  // (`adopt`: the same background already playing, brought in by a chaos island's
  // ride up: it carries straight on.)
  _fvBackground(stem, fade = 0.8, adopt = null) {
    const fv = this.fv;
    if (fv.amb && fv.amb.voice) fv.amb.voice.fadeout(fade * 1000);
    fv.amb = null;
    if (!stem) { if (adopt) adopt.fadeout(fade * 1000); return; }
    const name = aliasRecording(this.audio, stem, `event_amb_file_${stem}`);
    let voice = null;
    if (adopt && adopt.busy && adopt.name === name) { voice = adopt; voice.setVolume(AMBIENCE_LEVEL); }
    else {
      if (adopt) adopt.fadeout(fade * 1000);
      voice = name ? this.audio.play(name, { loops: -1, volume: AMBIENCE_LEVEL, fadeMs: fade * 1000, send: BACKGROUND_SEND }) : null;
    }
    fv.amb = { stem, name, voice };
  },

  // ---------------------------------------------------------------- the room and its floor
  _fvOnGlass(pos = this.playerPos) { return !!this.fv && this.fv.glass.has(K(...cellOf(pos))); },

  // A spot lo to hi from you, inside the room, at least `apart` from every spot in
  // `away`; failing that, the try that came nearest.
  _fvSpot(lo, hi, away = [], apart = 0, tries = 400) {
    const [px, py] = this.playerPos;
    const lim = FV_ARENA - 1.5;
    let best = null; let bestScore = -1e9;
    for (let i = 0; i < tries; i++) {
      const a = uniform(0, Math.PI * 2); const d = uniform(lo, hi);
      const x = px + Math.sin(a) * d; const y = py - Math.cos(a) * d;
      if (x < -lim || x > lim || y < -lim || y > lim) continue;
      const gap = away.length ? Math.min(...away.map((q) => Math.hypot(x - q[0], y - q[1]))) : 1e9;
      if (gap >= apart) return [x, y];
      if (gap > bestScore) { best = [x, y]; bestScore = gap; }
    }
    return best || [uniform(-lim, lim), uniform(-lim, lim)];
  },

  _fvGlassOk(i, j, home) {
    if (Math.abs(i - home[0]) <= 1 && Math.abs(j - home[1]) <= 1) return false;
    const c = this.fv.creature;
    return dist2(posOf(i, j), [c.x, c.y]) >= FV_GLASS_CLEAR;
  },

  // Patches of glass over the concrete, a level's worth: none near where the
  // creature rests, none under or beside you.
  _fvLayGlass() {
    const fv = this.fv;
    fv.glass = new Set(); fv.moat = new Set();
    const home = cellOf(this.playerPos);
    const n = Math.min(FV_PATCHES[2], FV_PATCHES[0] + FV_PATCHES[1] * (fv.level - 1));
    for (let p = 0; p < n; p++) {
      let start = null;
      for (let t = 0; t < 60 && !start; t++) { const i = randint(-N, N); const j = randint(-N, N); if (this._fvGlassOk(i, j, home)) start = [i, j]; }
      if (!start) continue;
      const patch = [start];
      for (let k = randint(FV_PATCH_SIZE[0], FV_PATCH_SIZE[1]) - 1; k > 0; k--) {
        const [bi, bj] = choice(patch);
        const nb = [bi + randint(-1, 1), bj + randint(-1, 1)];
        if (Math.abs(nb[0]) <= N && Math.abs(nb[1]) <= N && this._fvGlassOk(nb[0], nb[1], home)) patch.push(nb);
      }
      for (const [i, j] of patch) fv.glass.add(K(i, j));
    }
  },

  // Sometimes she stands where only glass will take you: every square within reach
  // of her is glass. Only where all of it is far enough from the creature, and not
  // under you.
  _fvMoatAround(pos) {
    const fv = this.fv; const c = fv.creature;
    const cells = new Set();
    const [ci, cj] = cellOf(pos);
    const r = Math.ceil(FV_MOAT_RADIUS / SQ) + 1;
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      if (Math.abs(i) > N || Math.abs(j) > N) continue;
      if (dist2(posOf(i, j), pos) > FV_MOAT_RADIUS) continue;
      if (dist2(posOf(i, j), [c.x, c.y]) < FV_GLASS_CLEAR) return false;
      cells.add(K(i, j));
    }
    if (cells.has(K(...cellOf(this.playerPos)))) return false;
    for (const k of fv.moat) fv.glass.delete(k);
    fv.moat = cells;
    for (const k of cells) fv.glass.add(k);
    return true;
  },

  // The creature has stopped where its charge ended: the glass near it goes, so no
  // step on glass is ever within its reach before you hear it coming (the help's
  // promise; a level's glass is otherwise laid once).
  _fvClearGlassNear(pos) {
    const fv = this.fv;
    for (const k of [...fv.glass]) { const [i, j] = k.split(',').map(Number); if (dist2(posOf(i, j), pos) < FV_GLASS_CLEAR) { fv.glass.delete(k); fv.moat.delete(k); } }
  },

  // ---------------------------------------------------------------- the guide
  // Her next spot, farther from you each level, away from the creature; now and
  // then (never her first spot of a level) inside a disc of glass.
  _fvNewGuideSpot(first = false) {
    const fv = this.fv; const c = fv.creature;
    const [lo, hi] = guideBand(fv.level);
    fv.guide.pos = this._fvSpot(lo, hi, [[c.x, c.y]], FV_GUIDE_APART);
    fv.ring = false;
    if (!first && rand() < FV_MOAT_CHANCE) fv.ring = this._fvMoatAround(fv.guide.pos);
  },

  // Whether her calls are said by the device's voice (Heart not available).
  _fvFallback() { return !guideVoiceReady(); },

  // One call from her spot: Heart's voice when it is ready, placed; otherwise the
  // device's voice says it (not placed) and her shimmering beacon plays where she stands.
  // (6.0.1, Russell) With the Speech setting Off no voice is heard for her at all,
  // neither Heart's nor the device's: her shimmering beacon takes the voice's place.
  _fvSilent() { try { return !!(this.tts && this.tts.muted && this.tts.muted()); } catch (e) { return false; } },

  _fvCall() {
    const fv = this.fv; const gd = fv.guide;
    if (this._fvSilent()) {
      gd.calls += 1;
      gd.heart = false;
      if (gd.voice) { gd.voice.fadeout(120); gd.voice = null; }
      if (!gd.beacon && this.audio.has(FV_GUIDE_BEACON)) gd.beacon = this.audio.play(FV_GUIDE_BEACON, { loops: -1, volume: 0.0 });
      gd.until = 0;
      gd.gap = FV_FALLBACK_GAP;
      this._fvLevelGuide();
      return;
    }
    const call = getGuideCall();
    gd.calls += 1;
    gd.lastText = call.text;
    if (call.buffer) {
      if (gd.beacon) { gd.beacon.fadeout(200); gd.beacon = null; }
      const name = registerBuffer(this.audio, `fv_guide_${call.id !== null && call.id !== undefined ? call.id : 'call'}`, call.buffer);
      // Only her latest call is kept in the sound engine: the one before has been
      // heard out (a run hears hundreds; kept for good they would fill a phone's memory).
      if (this.fvGuideLast && this.fvGuideLast !== name) { this.audio.buffers.delete('dry:' + this.fvGuideLast); this.audio.entries.delete(this.fvGuideLast); }
      this.fvGuideLast = name;
      gd.voice = this.audio.play(name, { volume: 0.0, send: FV_VOICE_SEND });
      gd.until = call.buffer.duration;
      gd.gap = FV_CALL_GAP;
      gd.heart = true;
    } else {
      gd.heart = false;
      sayLocatable(this.tts, call.text);   // (heard whatever the Speech setting: she is found by it)
      if (!gd.beacon && this.audio.has(FV_GUIDE_BEACON)) gd.beacon = this.audio.play(FV_GUIDE_BEACON, { loops: -1, volume: 0.0 });
      gd.until = 0;
      gd.gap = FV_FALLBACK_GAP;
    }
    this._fvLevelGuide();
  },

  _fvStopGuide(fadeMs = 80) {
    const gd = this.fv && this.fv.guide;
    if (!gd) return;
    for (const k of ['voice', 'beacon']) { if (gd[k]) { if (fadeMs > 0) gd[k].fadeout(fadeMs); else gd[k].stop(); gd[k] = null; } }
  },

  // Levels for a place, panned as Battle pans (its east over distance), the loudness
  // falling from `gain` beside you to `floor` at `range` and beyond.
  _fvLevels(target, gain, range, floor) {
    const dx = target[0] - this.playerPos[0]; const dy = target[1] - this.playerPos[1];
    const dist = Math.hypot(dx, dy);
    const pan = dist > 0 ? dx / dist : 0.0;
    const vol = Math.max(floor, 1.0 - dist / range) * gain;
    return [Math.min(1, vol * (1.0 - Math.max(0.0, pan))), Math.min(1, vol * (1.0 - Math.max(0.0, -pan))), dist];
  },

  _fvLevelGuide() {
    const gd = this.fv.guide;
    if (!gd.pos) return;
    const [l, r] = this._fvLevels(gd.pos, FV_GUIDE_LEVEL, FV_GUIDE_RANGE, FV_GUIDE_FLOOR);
    const behind = this._behind(gd.pos);
    if (gd.voice && gd.voice.busy) gd.voice.setVolume(l, r, behind);
    if (gd.beacon && gd.beacon.busy) gd.beacon.setVolume(l * FV_BEACON_LEVEL, r * FV_BEACON_LEVEL, behind);
  },

  // Reached her: the chime, her next spot chosen; she calls from it once the chime
  // has been heard out and half a second of quiet has passed. Five finds (in Chaos,
  // the quota) and the level is done.
  _fvFound() {
    const fv = this.fv; const gd = fv.guide;
    this._fvStopGuide();
    fv.finds += 1;
    const chime = aliasRecording(this.audio, FV_CHIME, `event_pickup_file_${FV_CHIME}`);
    fv.chime = chime ? this.audio.play(chime, { volume: FV_CHIME_LEVEL, keep: true }) : null;
    fv.pause = FV_PAUSE;
    if (fv.chaos && fv.finds >= fv.quota) { this._fvOpenExit(); return; }
    if (!fv.chaos && fv.finds >= fv.quota) {
      // A level complete: the next begins at once.
      fv.completed += 1;
      fv.level += 1;
      this.level = fv.level;
      this._fvBackground(this._fvNextBackground());
      this._fvBeginLevel(false);
      this.tts.speak(`Level ${fv.level}.`, { interrupt: false });
    } else {
      this._fvNewGuideSpot();
    }
    gd.phase = 'pause';
  },

  // ---------------------------------------------------------------- the creature
  _fvCreatureSound(charging) {
    const c = this.fv.creature;
    c.state = charging ? 'charge' : 'rest';
    const stem = charging ? FV_GROWL : FV_BREATH;
    const want = aliasRecording(this.audio, stem, `event_beacon_hazard_file_${stem}`);
    if (c.note !== want || !(c.voice && c.voice.busy)) {
      if (c.voice) c.voice.fadeout(120);
      c.voice = want ? this.audio.play(want, { loops: -1, volume: 0.0, fadeMs: 120 }) : null;
      c.note = want;
    }
    this._fvLevelCreature();
  },

  _fvLevelCreature() {
    const c = this.fv.creature;
    if (!c.voice) return;
    const [l, r] = this._battleLevels([c.x, c.y], FV_CREATURE_GAIN);
    c.voice.setVolume(l, r, this._behind([c.x, c.y]));
  },

  // Every frame: at rest it breathes and waits. You on glass: it charges, for as long
  // as you are and about a second after; then it stops where it is. After a catch it
  // waits for a new step onto glass, not the square you were caught on.
  _fvUpdateCreature(dt) {
    const fv = this.fv; const c = fv.creature;
    if (c.state === 'gone') return;
    let onGlass = this._fvOnGlass();
    if (fv.caughtAt !== null) {
      if (K(...cellOf(this.playerPos)) === fv.caughtAt) onGlass = false;
      else fv.caughtAt = null;
    }
    if (onGlass) {
      if (c.state !== 'charge') { c.knock = FV_STEP; this._fvCreatureSound(true); }   // its first footstep lands as the charge begins
      c.tail = FV_CHARGE_TAIL;
    } else if (c.state === 'charge') {
      c.tail -= dt;
      if (c.tail <= 0) {
        this._fvCreatureSound(false);                   // it stops where it is
        this._fvClearGlassNear([c.x, c.y]);
      }
    }
    if (c.state === 'charge') {
      const ox = c.x; const oy = c.y;
      const dx = this.playerPos[0] - c.x; const dy = this.playerPos[1] - c.y;
      const d = Math.hypot(dx, dy);
      const move = Math.min(d, c.speed * dt);
      if (d > 1e-6) { c.x += dx / d * move; c.y += dy / d * move; }
      // A footstep for every step it runs, on the floor it is crossing, from where it is.
      c.knock += Math.hypot(c.x - ox, c.y - oy);
      if (c.knock >= FV_STEP) {
        c.knock -= FV_STEP;
        const bank = (this._fvOnGlass([c.x, c.y]) ? FV_STEPS_GLASS : FV_STEPS_STONE).filter((n) => this.audio.has(n));
        const [l, r] = this._battleLevels([c.x, c.y], FV_STEP_GAIN);
        if (bank.length) this.audio.play(choice(bank), { at: [c.x, c.y], volume: Math.max(l, r) });
      }
    }
    this._fvLevelCreature();
    // It has you: this near now, or you walked through where it is.
    if (c.state !== 'charge') return;
    let near = dist2([c.x, c.y], this.playerPos);
    for (const [a, b] of fv.steps) near = Math.min(near, pointToSegment(c.x, c.y, a, b));
    if (near < FV_CATCH) this._fvCaught();
  },

  _fvCaught() {
    const fv = this.fv;
    fv.lives -= 1;
    if (fv.chaos) this.chaosFvLives = fv.lives;
    this.audio.play('player_hit', { keep: true });
    this.stride = null;
    if (fv.lives <= 0) {
      fv.lost = true;
      this.triggerGameOver();
      return;
    }
    // Thrown back, far off and away from the glass, still breathing; at rest.
    const c = fv.creature;
    const glass = [...fv.glass].slice(0, 200).map((k) => posOf(...k.split(',').map(Number)));
    [c.x, c.y] = this._fvSpot(FV_THROW_FAR, FV_ARENA * 1.5, glass, FV_GLASS_CLEAR);
    this._fvCreatureSound(false);
    this._fvClearGlassNear([c.x, c.y]);
    fv.caughtAt = K(...cellOf(this.playerPos));
    this.tts.speak(`Caught. ${fv.lives} ${plural(fv.lives, 'life', 'lives')} left.`, { interrupt: true });
  },

  // ---------------------------------------------------------------- Chaos: the exit
  // The quota is found: everything else goes, the creature, the guide, the glass
  // and the air, and only the exit is heard. The chaos clock waits until you reach
  // it (chaos.js _chaosExitOpen).
  _fvOpenExit() {
    const fv = this.fv;
    this._fvStopGuide();
    fv.guide.pos = null;
    const c = fv.creature;
    if (c.voice) { c.voice.fadeout(300); c.voice = null; }
    c.state = 'gone';
    if (fv.amb && fv.amb.voice) fv.amb.voice.fadeout(600);
    fv.amb = null;
    fv.glass.clear(); fv.moat.clear();
    const pos = this._fvSpot(FV_EXIT_RANGE[0], FV_EXIT_RANGE[1]);
    fv.exit = { pos, voice: this.audio.play('exit_morse', { loops: -1, volume: 0.0 }) };
    this._fvLevelExit();
  },

  _fvLevelExit() {
    const ex = this.fv.exit;
    if (!ex || !ex.voice) return 1e9;
    const [l, r, d] = this._battleLevels(ex.pos, 0.9);
    ex.voice.setVolume(l, r, this._behind(ex.pos));
    return d;
  },

  _fvLeaveByExit() {
    const ex = this.fv.exit;
    if (ex && ex.voice) ex.voice.stop();
    this.fv.exit = null;
    this.fv.done = true;
    this.nextLevel();
  },

  // ---------------------------------------------------------------- the frame
  updateFindVoice(dt) {
    const fv = this.fv;
    if (!fv || this.isPaused) return;
    // A chaos stage runs on the chaos clock (it waits while the exit is open).
    if (fv.chaos && this._advanceTimer(dt)) return;
    if (this.state !== STATE || this.fv !== fv) return;
    if (fv.exit) {
      if (this._fvLevelExit() < FV_EXIT_REACH) this._fvLeaveByExit();
      return;
    }
    this._fvUpdateCreature(dt);
    fv.steps = [];
    if (this.state !== STATE || this.fv !== fv) return;
    const gd = fv.guide;
    if (gd.phase === 'pause') {
      // The chime is heard out, then half a second of quiet; then she calls.
      if (!(fv.chime && fv.chime.busy)) fv.pause -= dt;
      if (fv.pause <= 0) { fv.chime = null; gd.phase = 'calling'; gd.wait = 0; gd.until = 0; }
      return;
    }
    if (!gd.pos) return;
    if (dist2(this.playerPos, gd.pos) <= FV_REACH) { this._fvFound(); return; }
    const playing = gd.voice && gd.voice.busy;
    if (gd.until > 0) gd.until -= dt;
    if (!playing && gd.until <= 0) {
      if (gd.voice) gd.voice = null;
      if (gd.wait === null || gd.wait === undefined || gd.wait < 0) gd.wait = uniform(...(gd.gap || FV_CALL_GAP));
      gd.wait -= dt;
      if (gd.wait <= 0) {
        const first = gd.calls === 0 && !fv.chaos;
        const short = !this._fvSilent() && (first ? guideStock() < FV_FIRST_STOCK : guideStock() < 1);
        gd.held = (gd.held || 0) + (short ? dt : 0);
        if (short && guideMaking() && gd.held < (first ? FV_FIRST_HOLD : FV_HEART_WAIT)) gd.wait = 0;   // a moment more for Heart
        else { gd.wait = -1; gd.held = 0; this._fvCall(); }
      }
    }
    this._fvLevelGuide();
  },

  // A step, or a run's step: concrete or glass under your feet; within two steps of
  // her is a find.
  _fvStep(g) {
    const fv = this.fv;
    const f = this.playerFacing = this._forward();
    const dir = g === 'up' ? f : [-f[0], -f[1]];
    const w = this._walkArena(dir, FV_STEP, FV_ARENA, { sound: false });
    if (!w) return;
    fv.steps.push(w);
    const bank = (this._fvOnGlass() ? FV_STEPS_GLASS : FV_STEPS_STONE).filter((n) => this.audio.has(n));
    if (bank.length) this.audio.play(choice(bank));
    if (fv.exit) {
      if (this._fvLevelExit() < FV_EXIT_REACH) this._fvLeaveByExit();
      return;
    }
    if (fv.guide.phase === 'calling' && fv.guide.pos && dist2(this.playerPos, fv.guide.pos) <= FV_REACH) this._fvFound();
  },

  // Enter's report: the level, how many found, your lives, and the way you face (in
  // chaos: no level, and the clock and the points).
  _fvReport() {
    const fv = this.fv;
    const lv = `${fv.lives} ${plural(fv.lives, 'life', 'lives')} left.`;
    if (fv.chaos) {
      this._report(fv.exit ? `All ${fv.quota} found. ${lv}` : `${fv.finds} of ${fv.quota} found. ${lv}`, true);
      return;
    }
    this._report(`Level ${fv.level}. ${fv.finds} of ${fv.quota} found. ${lv}`);
  },

  // Everything of the mode stopped and forgotten (a game over, quitting, a chaos stage ending).
  _fvStopAll() {
    const fv = this.fv;
    if (!fv) return;
    this._fvStopGuide(0);
    if (fv.chime) { fv.chime.stop(); fv.chime = null; }
    if (fv.creature.voice) { fv.creature.voice.stop(); fv.creature.voice = null; }
    if (fv.amb && fv.amb.voice) fv.amb.voice.stop();
    fv.amb = null;
    if (fv.exit && fv.exit.voice) fv.exit.voice.stop();
    fv.exit = null;
    fv.stopped = true;
    guideRunEnds();
  },
};

// ------------------------------------------------------------------ help
const HELP_SECTIONS = [
  ['Find the Voice', [
    { title: 'Find the Voice', sound: null, desc: "Find the Voice is a mode of its own, new in 6.0.0. A woman's voice, the guide, calls to you from somewhere in a dark room: over here, this way, follow me, and hundreds more. Find her. Turn until her voice is centred between your ears and bright, then walk to her. You turn and walk as in every walking mode (see General Turning). When you are within two steps of her you hear a chime, always the same one; after half a second of quiet she calls again from somewhere new. Five finds complete a level, and the next level begins at once. You are not alone in the room, and there is no clock. Double tap for the level, how many you have found, your lives and the way you are facing." },
    { title: 'Find the Voice The Guide', sound: null, desc: "The guide's voice is Heart, a natural American voice made by Kokoro on your own device, as Bella's is (see The Game's Voice), and you hear her from where she stands: as loud as the game's voice up close, and fainter the farther away she is, but never so faint that you lose her. She never says the same thing twice in a row. On each new level she stands farther away. With the Speech setting turned Off no voice is heard for her: a soft shimmering beacon plays where she stands in place of her voice, and you follow that. Until her voice is ready, or if your device cannot make it, your device's own voice says her words instead, in the middle of your head, and a soft shimmering beacon plays where she stands, so you follow the beacon. Everything else in this mode is said by the game's voice." },
    { title: 'Find the Voice The Creature', sound: null, desc: 'One creature shares each level with you. Creatures are blind, just like you, and they hunt by sound. At rest it breathes calmly and does not move. Step on glass and it hears you: it charges, with a constant aggressive growl and a footstep for every step it runs, heard from where it is. It keeps coming for as long as you are on glass, and about a second after you are back on concrete; then it stops where it is and breathes calmly again. It runs a little slower than you can run, so when it charges, get off the glass and run. It keeps charging through the chime, too. If it catches you, you lose a life, and it is thrown back far away, still breathing, at rest.' },
    { title: 'Find the Voice Glass', sound: null, desc: 'The floor is concrete, with patches of broken glass, and your footsteps tell you which you are on. Glass is never laid close to where the creature rests, so when you step on it there is always time to turn and get away. Sometimes the guide stands where only glass will take you to her: then you must decide when to cross, and be ready to run.' },
    { title: 'Find the Voice Levels, Lives and Score', sound: null, desc: 'You have three lives and there is no clock: a run lasts until the creature has caught you three times. Each level, the guide stands farther away and the creature runs five steps a minute faster, up to a limit that stays below your run. Each level has new air: the first is always the witch\'s, and after that a different event background each level, never repeated until you have heard them all. Your score is the number of levels you complete, and Find the Voice has its own high score board.' },
    { title: 'Find the Voice in Chaos Mode', sound: null, desc: 'Chaos Mode has Find the Voice levels too, about as often as islands. There the guide must be found a set number of times: three or four the first time in a run, and one more each time after, at most eight. When you have found her enough, everything else goes silent and only an exit is heard, the battle exit\'s Morse signal; the chaos clock waits until you walk through it. Find the Voice levels have three lives of their own for the whole chaos run, and losing all three ends the run. There, double tap for how many you have found and your lives, then the clock and the points.' },
  ]],
];

const HELP_DEMOS = [
  ['Demos, Find the Voice', [
    { title: 'Find the Voice Demos', sound: null, desc: 'The sounds of Find the Voice.' },
    { title: 'The Guide', sound: 'fv_demo_guide', desc: 'Three of the guide\'s calls, as you hear her from a few steps away. Until her voice is ready on your device, or if it cannot be made, you hear instead the soft shimmering beacon that marks where she stands while your device\'s own voice says her words.' },
    { title: 'Guide Reached', sound: FV_CHIME, desc: 'The chime when you reach her. It is always the same.' },
    { title: 'Creature at Rest', sound: FV_BREATH, desc: 'The creature breathing calmly. It is not hunting, and it does not move.' },
    { title: 'Creature Charging', sound: 'fv_demo_charge', desc: 'The creature charging: a constant growl, and a footstep for every step it runs.' },
    { title: 'Footstep on Glass', sound: FV_STEPS_GLASS[0], desc: 'A step on broken glass. The creature hears this one.' },
  ]],
];

// ------------------------------------------------------------------ the mode
function reset(game) {
  if (game.fv) game._fvStopAll();
  game.fv = null;
}

function input(game, g) {
  const fv = game.fv;
  if (!fv) return;
  if (g === 'clock') {
    // No clock in this mode; a chaos stage answers with the chaos clock.
    if (fv.chaos) { const secs = Math.trunc(game.timeLeft); game.tts.speak(`${secs} second${secs === 1 ? '' : 's'} remaining.`, { interrupt: true }); }
    return;
  }
  if (g === 'enter') { game._fvReport(); return; }
  if (g === 'left' || g === 'right') { game._turnQuick(g === 'right' ? 1 : -1); return; }
  if (g === 'up' || g === 'down') game._fvStep(g);
}

export default {
  menu: [{ key: 'findvoice', label: 'Find the Voice', select: (game) => game.startFindVoice() }],
  playStates: [STATE],
  mixin,
  init(game) {
    game.fv = null;
    game.fvBag = [];
    try { game._fvWireGuide(); } catch (e) { /* the device's voice */ }
    try { if (game.audio && game.audio.ctx) makeFindVoiceSounds(game.audio); } catch (e) { /* made again when a run begins */ }
  },
  reset,
  update(game, dt) { game.updateFindVoice(dt); },
  input,
  stopAll(game) { if (game.fv) game._fvStopAll(); },
  finish(game) {
    const n = game.fv ? game.fv.completed : 0;
    return { key: BOARD, score: n, message: `Game Over. You completed ${n} ${plural(n, 'level')}. ` };
  },
  // The room rings as the battle arena does (as on Windows).
  room() { return FV_ROOM; },
  turns(game) { return game.state === STATE; },
  surroundings(game, pos, room) { return game._arenaSurroundings(pos); },
  strideSig(game) { return game.fv ? `${game.fv.level}|${!!game.fv.exit}` : ''; },
  status(game) {
    const fv = game.fv;
    if (!fv) return 'Find the Voice.';
    return `Find the Voice. Level ${fv.level}. ${fv.finds} of ${fv.quota} found. ${fv.lives} ${plural(fv.lives, 'life', 'lives')}.`;
  },
  boards: [{ key: BOARD, label: 'Find the Voice', fmt: (v) => `${v} ${v === 1 ? 'level' : 'levels'}` }],
  help: { sections: HELP_SECTIONS, demos: HELP_DEMOS },
};

export { FALLBACK_PHRASES };
