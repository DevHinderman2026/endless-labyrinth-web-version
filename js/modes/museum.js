// The Museum (web 7.2.0, Russell's design, 23 November 2026; website only).
//
// Inspired by Papa Sangre. Each museum holds the soul of one of Ultimate Mode's safe
// zone characters, chosen at random, and its rooms are quiet but for that
// character's own world, playing softly in a great echoing hall. Their memories are
// scattered through it, each a little tune that loops where it lies; some are locked
// in glass cases. The character calls to you from beside the memory they want you to
// find next (as the Find the Voice guide does), and each memory you find gives them
// back a piece of their life, which they tell you. Find every memory, and a buzzer
// sounds from the museum's door: walk to it, the door opens, you walk through by
// yourself into the next museum, the door closes behind you, and it begins again with
// another character. Each museum is the same size, with one more memory than the last
// (three in the first, never more than eight).
//
// The one danger: bottomless pools that dissolve memory. They lie all through the
// museum, around the memories, and sometimes you must go round one to reach a memory.
// Each pool bubbles where it lies, and the character warns you when you come near an
// edge. Fall in, and the run is over at once: there are no lives. Each museum has more
// pools, closer round the memories, but a way through is always left.
//
// Creatures sleep in the museum, one in the first museum, two in the second, three from
// the third on. They wake only on noise, never because you walk near: smash a glass
// case and they charge you for about three seconds; collect a fiery memory (about one
// in four) and a firework (one of four, all short) bursts on your left or right, the
// character warns you, and the sparks are released: every step you take, whichever way,
// pops one with a firecracker pop just ahead of you (silent until you move; 4 to 6
// of them); the creatures sleep on through the burst, wake with a roar at the first spark
// you pop, and charge you until the last one has popped, so keep moving (web 7.2.3 to
// 7.2.7, Russell's design). A creature that reaches you knocks you toward the nearest
// bottomless pool and leaves you one step from its edge (7.2.10). That creature then
// calms down and wanders off, and the others lose your trail for a moment, so you are
// never shoved twice running. You fall into a pool only walking straight at it; one
// off to a side you walk round (7.2.10).
//
// No clock. The score is souls freed: the museums you complete.
//
// Chaos Mode has museums too (js/modes/chaos.js): one museum to a stage, with three
// memories the first time in a run and one more each time, at most eight. Each memory
// puts twenty seconds on the chaos clock, a fiery one thirty. The door leads on to the
// next stage, and the chaos clock waits while it is open. A pool ends the whole run.
//
// The recordings (Pixabay, web-only, in the museum pack; tools/museum/make_sounds.py):
// the pools' bubbling, the firework, a spark's firecracker pop, the door's
// buzzer (Russell's choice) and the door opening and closing. The creatures are The
// Abyss's; the glass cases Ultimate Mode's; the characters' lines are recordings in
// their own Kokoro voices (js/data/museum-lines.json, the museum-voice pack).

import { aliasRecording, addMade } from './events/sounds.js';
import {
  CASE_SOUND, CASE_CHIME, CASE_SMASH, CASE_GAIN, CASE_REACH, CASE_REARM, CASE_LINED, CASE_UNLINED,
  CASE_KNOCK, CASE_KNOCK_RANGE, CASE_KNOCK_EVERY, CASE_KNOCK_LEVEL, AMBIENCE_LEVEL, BACKGROUND_SEND,
  makeSounds as makeUltimateSounds,
} from './ultimate.js';
import { AB_IDLE, AB_GROWL, AB_STEPS_GLASS } from './abyss.js';
import { loadCast, castList, CastVoices } from './ultimate/cast.js';
import { sayLocatable, FALLBACK_PHRASES } from './findvoice-guide.js';
import { RULES } from '../sound-rules.js';

export const STATE = 'museum';
export const BOARD = 'museum';

// ------------------------------------------------------------------ constants
export const MU_STEP = 3.0;                     // one step, in the game's units
export const MU_HALF = 42.0;                    // the museum: this far each way from its middle (28 steps across), the same every time
// Memories: three in the first museum, one more each museum, never more than eight.
export const MU_FIRST = 3;
export const MU_MAX = 8;
export const MU_CASE_SHARE = 1 / 3;             // a memory locked in a glass case
export const MU_FIERY_SHARE = 1 / 4;            // a fiery memory
export const MU_TAKE = 3.5;                     // units: near enough to take a memory lying on the floor
export const MU_MEMORY_APART = 15.0;            // memories at least five steps apart ...
export const MU_MEMORY_FROM_START = 18.0;       // ... and six from where you come in
export const MU_TUNE_RANGE = 60.0;              // a memory's tune is heard within this many units ...
export const MU_TUNE_GAIN = 0.7;                // ... at this loudness beside it ...
export const MU_TUNE_FLOOR = 0.12;              // ... and never quieter than this within the range
export const MU_TUNE_OTHERS = 0.55;             // the tunes of memories the character is not calling from
// The bottomless pools: three in the first museum, one more every second museum, never
// more than eight; and round the memories, closer every museum until the tenth (7.2.6,
// Russell: by museums 3 and 4 there were far too many; it was 1.5 more a museum, up to
// fourteen, closest by the sixth).
export const MU_POOLS = [3, 0.5, 8];
export const MU_POOL_R = [3.0, 4.5];            // a pool's radius, units (a pool is two to three steps across)
export const MU_POOL_NEAR_MEMORY = [[6.0, 9.0], [3.0, 4.5]];   // a guarding pool's edge from its memory: first museum, closest
export const MU_GUARD_CHANCE = [0.35, 0.85];    // the chance a memory has a pool beside it: first museum, most
export const MU_PATH = 2.5;                     // units: every way through is at least this clear of a pool's edge, either side
export const MU_POOL_RANGE = 30.0;              // a pool's bubbling is heard within this many units (ten steps)
export const MU_POOL_GAIN = 0.75;
export const MU_POOLS_HEARD = 3;                // only the nearest few bubble at once
// The character warns you when the step straight ahead of you (with half a unit to
// spare) would take you into a pool: only then, so a pool beside you or behind you,
// however near, is not called "ahead" (web 7.2.1, Russell).
export const MU_WARN = MU_STEP + 0.5;
export const MU_WARN_AGAIN = 6.0;               // seconds before another warning while you stay near
// The creatures: one in the first museum, two in the second, three from the third on.
export const MU_CREATURES = [1, 1, 3];
export const MU_CHARGE_SPM = 220;               // steps a minute, charging (your run is 280)
export const MU_CALM_SPM = 60;                  // walking off after a shove
export const MU_SMASH_CHARGE = 3.0;             // seconds every creature charges after a smash
// A smashed case leaves its broken glass on the floor (this museum only). A step over it
// crunches, and if no creature is charging already, wakes them for MU_GLASS_CHARGE; it
// never adds time to a charge that is going (7.2.11, Russell).
export const MU_GLASS_R = 2.0;                  // units round where the case stood
export const MU_GLASS_CHARGE = 2.0;
export const MU_CATCH = 1.5;                    // units: this near while charging, it has you
// A creature that reaches you knocks you toward the nearest bottomless pool, step by
// step, and leaves you one step from its edge (7.2.10, Russell: three steps the way it
// ran barely did anything; its goal is to knock you in). The way there is clear of every
// other pool; with no clear way to any pool, it shoves you three steps as before.
export const MU_SHOVE_STEPS = 3;                // the old shove, when no pool can be reached
export const MU_KNOCK_FROM_EDGE = 3.0;          // units (one step) from the pool's edge that it leaves you
export const MU_SHOVE_EVERY = 0.14;             // seconds between the steps of a shove
// You fall into a pool only walking straight at it: within this angle of its middle.
// One off to a side, even with its edge across your way, you walk round (7.2.10, Russell).
export const MU_STRAIGHT_ON = 30;               // degrees
export const MU_LOST = 3.0;                     // seconds the other creatures lose your trail after a shove
export const MU_CREATURE_FROM_START = 24.0;     // units (eight steps): no creature sleeps nearer where you come in
export const MU_CREATURE_FROM_MEMORY = 12.0;
export const MU_CREATURE_APART = 15.0;
export const MU_CREATURE_RANGE = 54.0;
// A creature roars from its bed as it wakes, before it moves, so you know which way it is
// coming (web 7.2.5, Russell; The Abyss had it too in 7.2.5, taken out in 7.2.6 at his
// word). "Dinosaur Growl" by DRAGON-STUDIO, its first 2.2 seconds, in the museum pack.
export const CREATURE_ROAR = 'creature_roar';
export const ROAR_GAIN = 1.0;
export const ROAR_FLOOR = 0.35;                 // never quieter than this, however far off it is
export const MU_ROAR_RANGE = 120.0;             // it fades over the whole museum
export const MU_IDLE_GAIN = 0.5;                // asleep: its breathing, softly
export const MU_CREATURE_GAIN = 1.0;            // charging: a battle enemy's loudness
export const MU_STEP_GAIN = 0.9;
export const MU_CALM_AWAY = 30.0;               // after a shove it goes at least this far from you, then sleeps
// A fiery memory: the firework goes up and bursts, releasing its sparks. They are not
// scattered places to find (7.2.0 to 7.2.2 placed them on the floor around you, popping):
// they are always straight ahead, whichever way you face, and each step pops the next.
// Four short fireworks, one at random (7.2.6, Russell: the one long one was far too
// long): each with the second, into its recording, that it bursts. The burst is heard on
// your left or your right (at random); the sparks that pop after it are always ahead of you.
export const MU_FIREWORKS = [['mu_firework_1', 0.15], ['mu_firework_2', 0.30], ['mu_firework_3', 0.17], ['mu_firework_4', 0.82]];
export const MU_FIRE_SIDE = 3.0;                // units to your left or right that the firework bursts
export const MU_SPARKS = [4, 6];                // sparks a firework releases: that many steps to pop them all
export const MU_POP_AHEAD = 1.5;                // units straight ahead of you that a spark pops
export const MU_POP_LEVEL = 1.0;
export const MU_WARN_AFTER = 0.5;               // seconds into the firework that the character warns you (7.2.9, Russell)
export const MU_STORY_AFTER = 3.0;              // seconds after the last spark pops before the memory's story (7.2.8, Russell)
// The character.
export const MU_VOICE_LEVEL = 1.0;              // beside them: the in-run voice's level
// (Web 7.2.1, Russell: too quiet, above all from far off. Their recordings are 4 dB
// louder in the museum-voice pack, and they fade far less: over 90 units, not 60, to
// no less than 0.45, not 0.18.)
export const MU_VOICE_RANGE = 90.0;             // they fade over this many units ...
export const MU_VOICE_FLOOR = 0.45;             // ... and are never quieter than this, from across the museum
export const MU_VOICE_SEND = 0.25;
export const MU_CALL_GAP = [1.2, 2.2];          // seconds of quiet between two calls
export const MU_FALLBACK_GAP = [2.2, 3.2];      // between two calls said by the device's voice
export const MU_PAUSE = 0.5;                    // the quiet after a memory's line, before they call from the next one
export const MU_WAIT_VOICE = 2.0;               // seconds a line may wait for its recording to be decoded
export const MU_BEACON = 'event_beacon_shimmer';   // where they stand, while the device's voice speaks for them
// The door.
export const MU_DOOR_FROM = 30.0;               // units (ten steps): the door is at least this far from you when it buzzes
export const MU_DOOR_REACH = 4.0;
export const MU_BUZZ_GAP = 1.4;                 // seconds of quiet between buzzes
export const MU_BUZZ_LEN = 2.0;                 // seconds of one buzz (cut from 3.3 in 7.2.4, Russell: too long)
export const MU_DOOR_GAIN = 1.0;
export const MU_DOOR_FLOOR = 0.3;
export const MU_DOOR_RANGE = 90.0;
export const MU_WALK_STEPS = 4;                 // the steps you take through the door by yourself
export const MU_WALK_EVERY = 0.45;
export const MU_DOOR_HOLD = 0.8;                // the quiet after the door has closed, before the next museum
// Chaos.
export const MU_CHAOS_TIME = 20;                // seconds on the chaos clock for a memory
export const MU_CHAOS_TIME_FIERY = 30;          // and for a fiery one
// Sounds.
export const MU_POOL = 'mu_pool';
// A spark popping as you step on it (back to the firecracker pop in 7.2.3, Russell; 7.2.2
// tried a fizzle the game made, with a sizzle under each spark, which he did not want).
export const MU_STAMP_SOUND = 'mu_stamp';
export const MU_BUZZER = 'mu_buzzer';
export const MU_DOOR_OPEN = 'mu_door_open';
export const MU_DOOR_CLOSE = 'mu_door_close';
export const MU_FALL = 'evt_water_splash';
export const MU_STEPS = ['step_stone_1', 'step_stone_2', 'step_stone_3', 'step_stone_4'];
export const MU_ROOM = 'hall';                  // a great hall's echo
export const MU_SEND = 0.35;                    // how much of a museum sound goes into the hall's echo
export const MU_AMBIENCE = AMBIENCE_LEVEL * 0.6;   // the character's world, softly
export const LINES_URL = 'js/data/museum-lines.json';

const RATE = 44100;
const VOICE_ROOMS = ['lab', 'tower', 'battle', 'cathedral', 'hall'];

// ------------------------------------------------------------------ helpers
const rand = Math.random;
const uniform = (a, b) => a + (b - a) * rand();
const randint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const choice = (arr) => arr[Math.floor(rand() * arr.length)];
const plural = (n, word, many = word + 's') => (n === 1 ? word : many);
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const stepsPerSecond = (spm) => spm / 60 * MU_STEP;

export function pointToSegment(p, a, b) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const span = dx * dx + dy * dy;
  const t = span <= 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / span));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// How much is in a museum (in chaos, by the stage's count in the run).
export function memoriesFor(museum) { return Math.min(MU_MAX, MU_FIRST + Math.max(0, museum - 1)); }
export function poolsFor(museum) { return Math.min(MU_POOLS[2], Math.floor(MU_POOLS[0] + MU_POOLS[1] * Math.max(0, museum - 1))); }
export function creaturesFor(museum) { return Math.min(MU_CREATURES[2], MU_CREATURES[0] + MU_CREATURES[1] * Math.max(0, museum - 1)); }
// How hard the pools press in, from 0 (the first museum) to 1 (the tenth on).
export const MU_SQUEEZE_BY = 10;
export function squeezeFor(museum) { return Math.min(1, Math.max(0, museum - 1) / (MU_SQUEEZE_BY - 1)); }

// ------------------------------------------------------------------ the lines
let lines = null;          // character id -> { intro: [line], call: [...], ... }
let linesLoading = null;
export function setMuseumLines(doc) {
  lines = new Map();
  for (const l of (doc && doc.lines) || []) {
    if (!lines.has(l.character)) lines.set(l.character, {});
    const k = lines.get(l.character);
    (k[l.type] = k[l.type] || []).push({ id: l.id, text: l.text, phonemes: l.phonemes, n: l.n });
  }
  for (const k of lines.values()) if (k.memory) k.memory.sort((a, b) => a.n - b.n);
  return lines;
}
export function loadMuseumLines() {
  if (!linesLoading) {
    linesLoading = fetch(LINES_URL).then((r) => (r.ok ? r.json() : null)).then((d) => (d ? setMuseumLines(d) : null)).catch(() => null);
  }
  return linesLoading;
}
export function museumLines() { return lines; }

// ------------------------------------------------------------------ the tunes
// Each memory's tune: a few notes of a music box, made by the game, different for
// every memory of a museum. It loops where the memory lies, and plays once, whole,
// when you find it.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];   // C major pentatonic, two octaves
export function dealTunes(n) {
  const seen = new Set(); const out = [];
  for (let tries = 0; out.length < n && tries < 500; tries++) {
    const len = randint(3, 5);
    const notes = [randint(0, 4)];
    while (notes.length < len) notes.push(Math.max(0, Math.min(SCALE.length - 1, notes[notes.length - 1] + choice([-2, -1, 1, 2, 3]))));
    const key = notes.join(',');
    if (seen.has(key)) continue;
    seen.add(key); out.push(notes);
  }
  return out;
}
export function tuneSound(notes, gap = 0.26, rest = 1.1) {
  const ring = 0.9;
  const n = Math.floor(RATE * (gap * notes.length + rest));
  const L = new Float64Array(n);
  notes.forEach((k, i) => {
    const hz = SCALE[k]; const at = Math.floor(RATE * gap * i);
    const m = Math.min(n - at, Math.floor(RATE * ring));
    for (let j = 0; j < m; j++) {
      const t = j / RATE;
      const env = Math.min(1, t / 0.003) * Math.exp(-t / 0.28);
      const s = Math.sin(2 * Math.PI * hz * t) + 0.3 * Math.sin(4 * Math.PI * hz * t) * Math.exp(-t / 0.08) + 0.12 * Math.sin(6 * Math.PI * hz * t);
      L[at + j] += s * env * 0.28 * 32768;
    }
  });
  return [L, Float64Array.from(L)];
}

// Help's demo of a memory's tune (the game's own sound, made once; the website's Help
// page makes it too, js/help-page.js).
export function makeMuseumSounds(audio) {
  if (!audio.has('mu_tune_demo')) addMade(audio, 'mu_tune_demo', tuneSound([0, 2, 4, 5, 4], 0.26, 0.4));
}

// ------------------------------------------------------------------ the layout
// The floor is checked on a grid of small squares: a spot is open if it is inside the
// walls and at least MU_PATH clear of every pool's edge. Every memory, where you come
// in, and the door, must be joined by open floor.
const GRID = 1.5;
export function openFloor(pools, half = MU_HALF, path = MU_PATH) {
  const n = Math.floor(half / GRID);
  const size = 2 * n + 1;
  const open = new Uint8Array(size * size);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const p = [(i - n) * GRID, (j - n) * GRID];
      if (Math.abs(p[0]) > half - 1.5 || Math.abs(p[1]) > half - 1.5) continue;
      if (pools.some((q) => dist2(p, q.pos) < q.r + path)) continue;
      open[i * size + j] = 1;
    }
  }
  return { n, size, open };
}
export function reachable(floor, from) {
  const { n, size, open } = floor;
  const seen = new Uint8Array(size * size);
  const cell = (p) => [Math.round(p[0] / GRID) + n, Math.round(p[1] / GRID) + n];
  const [si, sj] = cell(from);
  const q = [];
  if (si >= 0 && sj >= 0 && si < size && sj < size && open[si * size + sj]) { seen[si * size + sj] = 1; q.push(si * size + sj); }
  while (q.length) {
    const c = q.pop(); const i = Math.floor(c / size); const j = c % size;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di; const b = j + dj;
      if (a < 0 || b < 0 || a >= size || b >= size) continue;
      const k = a * size + b;
      if (open[k] && !seen[k]) { seen[k] = 1; q.push(k); }
    }
  }
  return (p) => {
    const [i, j] = cell(p);
    if (i < 0 || j < 0 || i >= size || j >= size) return false;
    // (A spot counts as reached if any square beside it is: the memory itself may sit
    // a little nearer a pool's edge than the path is wide.)
    for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di; const b = j + dj;
      if (a >= 0 && b >= 0 && a < size && b < size && seen[a * size + b]) return true;
    }
    return false;
  };
}

// A whole museum laid out: where you come in, the memories, the pools, where the
// creatures sleep. Tried again until every memory can be reached.
export function layMuseum(museum, count = memoriesFor(museum)) {
  const start = [0, MU_HALF - 4.5];
  const squeeze = squeezeFor(museum);
  for (let attempt = 0; attempt < 60; attempt++) {
    const memories = [];
    for (let k = 0; k < count; k++) {
      let best = null; let bestGap = -1;
      for (let i = 0; i < 300; i++) {
        const p = [uniform(-MU_HALF + 8, MU_HALF - 8), uniform(-MU_HALF + 8, MU_HALF - 10)];
        if (dist2(p, start) < MU_MEMORY_FROM_START) continue;
        const gap = memories.length ? Math.min(...memories.map((m) => dist2(p, m.pos))) : 1e9;
        if (gap >= MU_MEMORY_APART) { best = p; break; }
        if (gap > bestGap) { best = p; bestGap = gap; }
      }
      memories.push({ pos: best });
    }
    // The pools: first one beside some of the memories, then the rest anywhere.
    const pools = [];
    const want = poolsFor(museum);
    const guard = lerp(MU_GUARD_CHANCE[0], MU_GUARD_CHANCE[1], squeeze);
    const near = [lerp(MU_POOL_NEAR_MEMORY[0][0], MU_POOL_NEAR_MEMORY[1][0], squeeze), lerp(MU_POOL_NEAR_MEMORY[0][1], MU_POOL_NEAR_MEMORY[1][1], squeeze)];
    const fits = (pos, r) => Math.abs(pos[0]) < MU_HALF - r - 3 && Math.abs(pos[1]) < MU_HALF - r - 3
      && dist2(pos, start) > r + 9 && pools.every((q) => dist2(pos, q.pos) > q.r + r + 2 * MU_PATH + 1)
      && memories.every((m) => dist2(pos, m.pos) > r + MU_PATH + 0.5);
    for (const m of memories) {
      if (pools.length >= want || rand() > guard) continue;
      for (let i = 0; i < 40; i++) {
        const r = uniform(...MU_POOL_R); const a = uniform(0, Math.PI * 2); const d = r + uniform(...near);
        const pos = [m.pos[0] + Math.sin(a) * d, m.pos[1] - Math.cos(a) * d];
        if (fits(pos, r)) { pools.push({ pos, r, voice: null }); break; }
      }
    }
    for (let i = 0; pools.length < want && i < 600; i++) {
      const r = uniform(...MU_POOL_R);
      const pos = [uniform(-MU_HALF + 6, MU_HALF - 6), uniform(-MU_HALF + 6, MU_HALF - 6)];
      if (fits(pos, r) && memories.every((m) => dist2(pos, m.pos) > r + near[0])) pools.push({ pos, r, voice: null });
    }
    const can = reachable(openFloor(pools), start);
    if (!memories.every((m) => can(m.pos))) continue;
    // The creatures' beds.
    const beds = [];
    for (let k = 0; k < creaturesFor(museum); k++) {
      for (let i = 0; i < 300; i++) {
        const p = [uniform(-MU_HALF + 5, MU_HALF - 5), uniform(-MU_HALF + 5, MU_HALF - 5)];
        if (dist2(p, start) < MU_CREATURE_FROM_START) continue;
        if (memories.some((m) => dist2(p, m.pos) < MU_CREATURE_FROM_MEMORY)) continue;
        if (pools.some((q) => dist2(p, q.pos) < q.r + 5)) continue;
        if (beds.some((b) => dist2(p, b) < MU_CREATURE_APART)) continue;
        beds.push(p); break;
      }
    }
    return { start, memories, pools, beds, can };
  }
  // (Never in practice: with no pools at all, everything is reachable.)
  return { start, memories: [], pools: [], beds: [], can: () => true };
}

// The world a character's museum plays softly: one of their safe zone backgrounds.
export function museumStem(ch) {
  const stems = (ch && ch.backgrounds) || [];
  return stems.length ? choice(stems) : 'evt_amb_cathedral';
}

// ------------------------------------------------------------------ the game's methods
const mixin = {
  startMuseum() {
    this.state = STATE;
    this.resetGameState();
    this.state = STATE;
    this._syncRoom();
    this._wake(true);
    if (this.ambienceChannel) { this.ambienceChannel.stop(); this.ambienceChannel = null; }
    if (this.beatChannel) { this.beatChannel.stop(); this.beatChannel = null; }
    this.mu = null;
    this._muBegin({ chaos: false, museum: 1, count: memoriesFor(1) });
  },

  // A museum: a run's next, or a chaos stage (count: its memories; museum: how hard;
  // ch: a character already chosen, as a chaos ride's preview does).
  _muBegin({ chaos, museum, count, ch = null, stem = null, adopt = null }) {
    try { makeUltimateSounds(this.audio); } catch (e) { /* the knock is the events' own */ }
    try { makeMuseumSounds(this.audio); } catch (e) { /* made when the sounds are there */ }
    const prev = this.mu;
    const freed = prev && !chaos ? prev.freed : 0;
    const memoriesTotal = prev && !chaos ? prev.memoriesTotal : 0;
    if (prev) this._muSilence(prev, false);
    for (const name of [MU_POOL, MU_STAMP_SOUND, ...MU_FIREWORKS.map(([n]) => n), MU_BUZZER, MU_DOOR_OPEN, MU_DOOR_CLOSE, CREATURE_ROAR, ...AB_STEPS_GLASS]) if (this.audio.has(name)) this.audio.prepare(name, `museum:${name}`);
    this.muCreatureNames = [[AB_IDLE, aliasRecording(this.audio, AB_IDLE, `event_beacon_hazard_file_${AB_IDLE}`)],
      [AB_GROWL, aliasRecording(this.audio, AB_GROWL, `event_beacon_hazard_file_${AB_GROWL}`)]];
    for (const [, n] of this.muCreatureNames) if (n) this.audio.prepare(n, `museum:${n}`);
    const who = ch || this._muPickCharacter(prev && prev.ch ? prev.ch.id : null);
    const lay = layMuseum(museum, count);
    this.playerPos = [...lay.start];
    // (A museum of its own begins facing into it; in chaos your facing carries on.)
    if (!chaos) this._face(0, true);
    this.arenaLimit = MU_HALF;
    this.stride = null;
    const tunes = dealTunes(lay.memories.length);
    // Which memories are in cases, and which are fiery.
    const memories = lay.memories.map((m, i) => ({
      pos: m.pos, inCase: rand() < MU_CASE_SHARE, fiery: rand() < MU_FIERY_SHARE, taken: false,
      tune: this._muTune(museum, i, tunes[i] || [0, 2, 4]), voice: null, knockT: 0, near: false,
    }));
    const mu = this.mu = {
      run: this.runId, chaos, museum, count, found: 0, freed, memoriesTotal,
      ch: who, lines: (lines && who && lines.get(who.id)) || null,
      memories, pools: lay.pools, can: lay.can,
      creatures: lay.beds.map((p) => ({ x: p[0], y: p[1], mode: 'sleep', charge: 0, voice: null, note: null, knock: MU_STEP, dir: [0, 1], calmTo: null })),
      sparksLeft: 0, firework: null, fireMemory: null, storyIn: 0, storyLater: null, warnIn: 0, warnLine: null, glass: [],
      lost: 0, shove: null, shoveGrace: 0,
      speaker: { pos: null, voice: null, beacon: null, until: chaos ? 0.3 : 1.0, wait: 0.6, phase: 'intro', target: null, line: null, queue: [], lastCall: null, waitSince: 0, pause: 0, loadWait: 0 },
      warnCool: 0, warnNear: false,
      door: null, walk: null, done: false, dead: false, steps: [],
      amb: null, tunesMade: memories.map((m) => m.tune),
    };
    this._muBackground(adopt, stem);
    // The character stands beside the first memory they want found; they introduce themselves from there.
    this._muNextTarget();
    if (!chaos) this.tts.speak(`Level ${museum}.`, { interrupt: true });
    const intro = this._muLine('intro');
    if (intro) mu.speaker.queue.push(intro);
  },

  // (The characters and their lines are read when the game starts, a moment after the
  // sounds; a museum begun before they arrive takes its character as soon as they do.)
  _muEnsureCharacter() {
    const mu = this.mu;
    if (mu.ch && mu.lines) return;
    const who = mu.ch && lines && lines.get(mu.ch.id) ? mu.ch : this._muPickCharacter();
    if (!who || !lines || !lines.get(who.id)) return;
    const had = !!mu.ch;
    mu.ch = who;
    mu.lines = lines.get(who.id);
    if (!had) {
      if (mu.amb && mu.amb.voice) mu.amb.voice.fadeout(600);
      mu.amb = null;
      this._muBackground(null);
    }
    const intro = this._muLine('intro');
    if (intro && !mu.found) mu.speaker.queue.unshift(intro);
  },

  // A character: any of the 26, never the one just freed.
  _muPickCharacter(not = null) {
    const all = castList().filter((c) => !lines || lines.has(c.id));
    const pool = all.filter((c) => c.id !== not);
    return (pool.length ? choice(pool) : all[0]) || null;
  },

  _muTune(museum, i, notes) {
    const name = `mu_tune_${i}`;
    // (The same names every museum: the last museum's tunes are replaced, never kept.)
    addMade(this.audio, name, tuneSound(notes));
    RULES.ROOMS[name] = ['hall', 'battle', 'cathedral'];
    return name;
  },

  // A museum sound, ringing in its hall unless told otherwise.
  _muPlay(name, opts = {}) { return this.audio.play(name, { send: MU_SEND, ...opts }); },

  _muBackground(adopt = null, chosen = null) {
    const mu = this.mu;
    const stem = chosen || museumStem(mu.ch);
    const name = aliasRecording(this.audio, stem, `event_amb_file_${stem}`);
    let voice = null;
    if (adopt && adopt.busy && adopt.name === name) { voice = adopt; voice.setVolume(MU_AMBIENCE); }
    else {
      if (adopt) adopt.fadeout(400);
      voice = name ? this.audio.play(name, { loops: -1, volume: MU_AMBIENCE, fadeMs: 800, send: BACKGROUND_SEND }) : null;
    }
    mu.amb = { name, voice, stem };
  },

  // How loud a thing is from where you are: [left, right, distance].
  // With `always`, never quieter than the floor however far off, even past the range
  // (the door's buzzer and the character's voice: 7.2.12. The museum is about 119 units
  // corner to corner; past 90 they had gone silent, so the buzzer could not be heard
  // from the far corner until you took a few steps.)
  _muLevels(pos, gain, range, floor = 0, always = false) {
    const dx = pos[0] - this.playerPos[0]; const dy = pos[1] - this.playerPos[1];
    const d = Math.hypot(dx, dy);
    const pan = d > 0 ? dx / d : 0.0;
    const v = d > range ? (always ? Math.min(1.0, floor * gain) : 0) : Math.min(1.0, Math.max(floor, 1.0 - d / range) * gain);
    return [v * (1.0 - Math.max(0.0, pan)), v * (1.0 - Math.max(0.0, -pan)), d];
  },

  // ---------------------------------------------------------------- the character
  _muLine(kind, n = null) {
    const mu = this.mu;
    const list = (mu.lines && mu.lines[kind]) || [];
    if (!list.length) return null;
    if (n !== null) return list[Math.min(list.length, Math.max(1, n)) - 1];
    const pool = list.length > 1 ? list.filter((l) => l !== mu.speaker['last_' + kind]) : list;
    const ln = choice(pool);
    mu.speaker['last_' + kind] = ln;
    return ln;
  },

  _muVoices() {
    if (!this.castVoices) this.castVoices = new CastVoices(this.tts && this.tts.bella ? this.tts.bella.library : null);
    return this.castVoices;
  },

  _muSilent() { try { return !!(this.tts && this.tts.muted && this.tts.muted()); } catch (e) { return false; } },

  _muTalking() {
    const sp = this.mu.speaker;
    return !!(sp.voice && sp.voice.busy) || sp.until > 0;
  },

  _muHush(fadeMs = 120) {
    const sp = this.mu.speaker;
    if (sp.voice) { if (fadeMs > 0) sp.voice.fadeout(fadeMs); else sp.voice.stop(); sp.voice = null; }
    sp.until = 0;
    sp.line = null;
  },

  // Say a line from where they stand: its recording, in their own voice; the device's
  // voice only if the recording cannot be played (a call then also lights their
  // beacon, so they can still be found). False while the recording is being decoded.
  _muSay(ln, { call = false } = {}) {
    const mu = this.mu; const sp = mu.speaker;
    if (!ln) return true;
    if (this._muSilent()) {
      // The Speech setting Off: no voice for them; a call is their beacon, and
      // anything else they say goes to the Braille display.
      if (call) {
        if (!sp.beacon && this.audio.has(MU_BEACON)) sp.beacon = this.audio.play(MU_BEACON, { loops: -1, volume: 0.0 });
        sp.until = 1.5;
      } else {
        this.tts.speak(ln.text, { interrupt: false });
        sp.until = 0.6 + ln.text.length * 0.065;
      }
      sp.line = ln;
      return true;
    }
    const cv = this._muVoices();
    if (cv.has(ln)) {
      const buf = cv.peek(ln);
      if (buf) {
        const name = `mu_line_${ln.id}`;
        if (this.muLast && this.muLast !== name) { this.audio.buffers.delete('dry:' + this.muLast); this.audio.entries.delete(this.muLast); }
        this.muLast = name;
        this.audio.entries.set(name, { dry: { frames: 0, made: true } });
        RULES.FAMILY[name] = 'speech';
        RULES.ROOMS[name] = VOICE_ROOMS;
        this.audio.buffers.set('dry:' + name, buf);
        sp.voice = this.audio.play(name, { volume: 0.0, send: MU_VOICE_SEND });
        sp.until = 0; sp.waitSince = 0; sp.line = ln;
        if (sp.beacon) { sp.beacon.fadeout(200); sp.beacon = null; }
        this._muLevelSpeaker();
        return true;
      }
      const now = performance.now();
      if (!sp.waitSince || sp.waitFor !== ln.id) { sp.waitSince = now; sp.waitFor = ln.id; }
      if (!cv.failed(ln) && now - sp.waitSince < MU_WAIT_VOICE * 1000) return false;
    }
    sp.waitSince = 0;
    sayLocatable(this.tts, ln.text);
    sp.until = 0.6 + ln.text.length * 0.065;
    sp.line = ln;
    if (call && !sp.beacon && this.audio.has(MU_BEACON)) sp.beacon = this.audio.play(MU_BEACON, { loops: -1, volume: 0.0 });
    return true;
  },

  _muLevelSpeaker() {
    const sp = this.mu.speaker;
    if (!sp.pos) return;
    const [l, r] = this._muLevels(sp.pos, MU_VOICE_LEVEL, MU_VOICE_RANGE, MU_VOICE_FLOOR, true);
    const behind = this._behind(sp.pos);
    if (sp.voice && sp.voice.busy) sp.voice.setVolume(l, r, behind);
    if (sp.beacon && sp.beacon.busy) sp.beacon.setVolume(l * 0.7, r * 0.7, behind);
  },

  // The memory they call from next: the nearest one not yet found.
  _muNextTarget() {
    const mu = this.mu;
    const left = mu.memories.filter((m) => !m.taken);
    let best = null;
    for (const m of left) if (!best || dist2(m.pos, this.playerPos) < dist2(best.pos, this.playerPos)) best = m;
    mu.speaker.target = best;
    mu.speaker.pos = best ? [...best.pos] : mu.speaker.pos;
    return best;
  },

  _muUpdateSpeaker(dt) {
    const mu = this.mu; const sp = mu.speaker;
    if (sp.voice && !sp.voice.busy) sp.voice = null;
    if (sp.until > 0) sp.until -= dt;
    if (sp.voice) this._muLevelSpeaker();
    if (this._muTalking()) { this._muLevelSpeaker(); return; }
    if (sp.line) {
      // A line heard out: let go of its recording.
      const said = sp.line;
      try { this._muVoices().done(said); } catch (e) { /* nothing held */ }
      sp.line = null;
      if (sp.after && sp.after.line === said) { const f = sp.after.f; sp.after = null; f(); }
    }
    // Lines waiting their turn come first: an introduction, a warning, a memory's story.
    if (sp.queue.length) {
      const ln = sp.queue[0];
      if (this._muSay(ln)) { sp.queue.shift(); sp.wait = uniform(...MU_CALL_GAP); }
      return;
    }
    if (sp.pause > 0) { sp.pause -= dt; return; }
    if (mu.walk || mu.firework || mu.sparksLeft > 0 || mu.storyIn > 0) return;     // nothing to call for while sparks are out, the story waits, or you walk through the door
    if (mu.door) return;                                        // the buzzer calls now
    if (!sp.target) return;
    sp.wait -= dt;
    if (sp.wait > 0) return;
    const ln = this._muLine('call');
    if (!ln) {
      // (No lines for them: the device's voice calls, from where they stand.)
      sayLocatable(this.tts, choice(FALLBACK_PHRASES));
      if (!sp.beacon && this.audio.has(MU_BEACON)) sp.beacon = this.audio.play(MU_BEACON, { loops: -1, volume: 0.0 });
      sp.until = 1.2; sp.wait = uniform(...MU_FALLBACK_GAP);
      return;
    }
    if (this._muSay(ln, { call: true })) sp.wait = uniform(...(sp.voice ? MU_CALL_GAP : MU_FALLBACK_GAP));
    else sp.wait = 0.05;
  },

  // A line they must say now: whatever they were saying stops (a story cut short is
  // told again after).
  _muSayNow(ln) {
    const sp = this.mu.speaker;
    if (!ln) return;
    const cut = sp.line && sp.line.id && /\.memory\.|\.intro\./.test(sp.line.id) && this._muTalking() ? sp.line : null;
    this._muHush(80);
    sp.queue = sp.queue.filter((q) => q !== ln);
    sp.queue.unshift(ln);
    if (cut && !sp.queue.includes(cut)) sp.queue.splice(1, 0, cut);
  },

  // ---------------------------------------------------------------- the memories
  _muUpdateMemories(dt) {
    const mu = this.mu;
    const target = mu.speaker.target;
    // Only the nearest case knocks (as in The Abyss); every case hums.
    let knocker = null;
    for (const m of mu.memories) if (!m.taken && m.inCase && dist2(m.pos, this.playerPos) < CASE_KNOCK_RANGE && (!knocker || dist2(m.pos, this.playerPos) < dist2(knocker.pos, this.playerPos))) knocker = m;
    for (const m of mu.memories) {
      if (m.taken) continue;
      if (m.inCase) {
        const [l, r, d] = this._muLevels(m.pos, CASE_GAIN * (m === knocker || !knocker ? 1 : 0.6), MU_TUNE_RANGE, MU_TUNE_FLOOR);
        if (!m.voice && this.audio.has(CASE_SOUND)) m.voice = this._muPlay(CASE_SOUND, { loops: -1, volume: 0.0, fadeMs: 300 });
        if (m.voice) m.voice.setVolume(l, r, this._behind(m.pos));
        m.knockT = Math.max(0, m.knockT - dt);
        if (m === knocker && d < CASE_KNOCK_RANGE && m.knockT <= 0 && this.audio.has(CASE_KNOCK)) {
          const near = 1 - d / CASE_KNOCK_RANGE;
          m.knockT = CASE_KNOCK_EVERY[1] + (CASE_KNOCK_EVERY[0] - CASE_KNOCK_EVERY[1]) * near;
          this._muPlay(CASE_KNOCK, { at: m.pos, volume: CASE_KNOCK_LEVEL[0] + (CASE_KNOCK_LEVEL[1] - CASE_KNOCK_LEVEL[0]) * near });
        }
        const off = this._muOff(m.pos);
        if (d < CASE_REACH && off <= CASE_LINED) {
          if (!m.near) { m.near = true; if (this.audio.has(CASE_CHIME)) this._muPlay(CASE_CHIME, { at: m.pos, volume: 0.8, keep: true }); }
        } else if (d > CASE_REARM || off > CASE_UNLINED) m.near = false;
      } else {
        const gain = MU_TUNE_GAIN * (m === target ? 1 : MU_TUNE_OTHERS);
        const [l, r] = this._muLevels(m.pos, gain, MU_TUNE_RANGE, MU_TUNE_FLOOR);
        if (!m.voice && this.audio.has(m.tune)) m.voice = this._muPlay(m.tune, { loops: -1, volume: 0.0, fadeMs: 200 });
        if (m.voice) m.voice.setVolume(l, r, this._behind(m.pos));
      }
    }
  },

  // How far off straight ahead a spot is, in radians.
  _muOff(pos) {
    const f = this._forward();
    const dx = pos[0] - this.playerPos[0]; const dy = pos[1] - this.playerPos[1];
    const d = Math.hypot(dx, dy);
    if (d < 0.5) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (dx * f[0] + dy * f[1]) / d)));
  },

  _muCaseInReach() {
    for (const m of this.mu.memories) {
      if (!m.taken && m.inCase && dist2(m.pos, this.playerPos) < CASE_REACH && this._muOff(m.pos) <= CASE_LINED) return m;
    }
    return null;
  },

  // A memory found: its tune plays once, whole; the character remembers (a fiery one
  // first sets off its firework, and the story waits until the sparks are out).
  _muTake(m) {
    const mu = this.mu;
    if (mu.storyIn > 0) this._muTellStory();      // (another memory before the last one's story: that story first)
    m.taken = true;
    if (m.voice) { m.voice.fadeout(150); m.voice = null; }
    mu.found += 1;
    mu.memoriesTotal += 1;
    if (this.audio.has(m.tune)) this._muPlay(m.tune, { at: m.pos, volume: 1.0, keep: true });
    if (mu.chaos) this._muChaosTime(m.fiery ? MU_CHAOS_TIME_FIERY : MU_CHAOS_TIME);
    const sp = mu.speaker;
    this._muHush(100);
    if (sp.beacon) { sp.beacon.fadeout(200); sp.beacon = null; }
    sp.pos = [...m.pos];
    const story = this._muLine('memory', mu.found);
    if (m.fiery) {
      // One of the four, bursting on your left or your right.
      const [name, burst] = choice(MU_FIREWORKS);
      const side = rand() < 0.5 ? -1 : 1;
      mu.sparkSide = side;
      const f = this._forward();
      const at = [this.playerPos[0] - f[1] * side * MU_FIRE_SIDE, this.playerPos[1] + f[0] * side * MU_FIRE_SIDE];
      mu.firework = { t: 0, burst, name, pos: at };
      if (this.audio.has(name)) this._muPlay(name, { at, volume: 1.0, keep: true });
      mu.pendingStory = story;
      sp.queue = [];
      this.stride = null;                 // you stop at the firework: the sparks pop only when you step again (7.2.10)
      // The warning comes half a second into the firework, cutting in at once (7.2.9,
      // Russell); its recording starts decoding now so it is ready then.
      const warn = this._muLine('fiery');
      mu.warnLine = warn; mu.warnIn = warn ? MU_WARN_AFTER : 0;
      if (warn && !this._muSilent()) { const cv = this._muVoices(); if (cv.has(warn)) cv.peek(warn); }
      return;
    }
    sp.queue = story ? [story] : [];
    this._muAfterStory(story);
  },

  // Once the memory's story is told: the next memory, or the door.
  _muAfterStory(story = null) {
    const mu = this.mu; const sp = mu.speaker;
    const f = () => {
      if (this.mu !== mu || mu.dead) return;
      sp.pause = MU_PAUSE;
      if (mu.found >= mu.count) { this._muOpenDoor(); return; }
      this._muNextTarget();
      sp.wait = 0;
    };
    // (No story to tell: straight on. Otherwise once that very line has been heard out,
    // even if a warning cut in and it was told again after.)
    if (!story) { sp.after = null; f(); return; }
    sp.after = { line: story, f };
  },

  // ---------------------------------------------------------------- the pools
  _muUpdatePools(dt) {
    const mu = this.mu;
    if (mu.walk) return;
    // The nearest few bubble; the rest wait in silence.
    const order = mu.pools.map((p) => [p, dist2(p.pos, this.playerPos) - p.r]).sort((a, b) => a[1] - b[1]);
    order.forEach(([p, edge], i) => {
      const heard = i < MU_POOLS_HEARD && edge < MU_POOL_RANGE;
      if (!heard) { if (p.voice) { p.voice.fadeout(400); p.voice = null; } return; }
      if (!p.voice && this.audio.has(MU_POOL)) p.voice = this._muPlay(MU_POOL, { loops: -1, volume: 0.0, fadeMs: 300 });
      if (!p.voice) return;
      // (Heard from its nearest edge, so a big pool sounds as near as it is.)
      const dx = this.playerPos[0] - p.pos[0]; const dy = this.playerPos[1] - p.pos[1];
      const d = Math.hypot(dx, dy) || 1;
      const at = [p.pos[0] + dx / d * Math.min(p.r, d), p.pos[1] + dy / d * Math.min(p.r, d)];
      const [l, r] = this._muLevels(at, MU_POOL_GAIN, MU_POOL_RANGE);
      p.voice.setVolume(l, r, this._behind(at));
    });
    // The character warns you when the step straight ahead would take you in: as soon
    // as it would, and again while it still would.
    mu.warnCool = Math.max(0, mu.warnCool - dt);
    const isNear = !!this._muPoolAhead();
    if (isNear && (!mu.warnNear || mu.warnCool <= 0) && !mu.walk && !mu.shove) {
      const ln = this._muLine('pool');
      if (ln) this._muSayNow(ln);
      mu.warnCool = MU_WARN_AGAIN;
    }
    mu.warnNear = isNear;
  },

  // The pool the step straight ahead of you would take you into (with half a unit to
  // spare), or null. Only straight ahead, the way you face now.
  _muPoolAhead() {
    const f = this._forward();
    const p = this.playerPos;
    return this._muPoolOn(p, [p[0] + f[0] * MU_WARN, p[1] + f[1] * MU_WARN], true);
  },

  // Whether a step from a to b goes into a pool: the pool, or null.
  // With `straight`, only a pool you are heading straight at (MU_STRAIGHT_ON).
  _muPoolOn(a, b, straight = false) {
    const sx = b[0] - a[0]; const sy = b[1] - a[1]; const sl = Math.hypot(sx, sy) || 1;
    const cos = Math.cos(MU_STRAIGHT_ON * Math.PI / 180);
    for (const p of this.mu.pools) {
      if (pointToSegment(p.pos, a, b) >= p.r) continue;
      if (straight) {
        const cx = p.pos[0] - a[0]; const cy = p.pos[1] - a[1]; const cl = Math.hypot(cx, cy) || 1;
        if ((sx * cx + sy * cy) / (sl * cl) < cos) continue;
      }
      return p;
    }
    return null;
  },

  // A spot moved just out of every pool it is in (round a pool's side), or null.
  _muOutOfPools(p) {
    let q = [...p];
    for (let k = 0; k < 4; k++) {
      const inn = this.mu.pools.find((o) => dist2(q, o.pos) < o.r + 0.3);
      if (!inn) return q;
      const dx = q[0] - inn.pos[0]; const dy = q[1] - inn.pos[1]; const d = Math.hypot(dx, dy) || 1;
      q = [inn.pos[0] + dx / d * (inn.r + 0.35), inn.pos[1] + dy / d * (inn.r + 0.35)];
    }
    return this.mu.pools.some((o) => dist2(q, o.pos) < o.r) ? null : q;
  },

  // Into a bottomless pool: the run is over.
  _muFall(pool, at) {
    const mu = this.mu;
    if (mu.dead) return;
    mu.dead = true;
    this.playerPos = [...at];
    this.stride = null;
    if (this.audio.has(MU_FALL)) this.audio.play(MU_FALL, { keep: true });
    else this.audio.play('player_hit', { keep: true });
    if (mu.chaos) this.chaosDeath = 'pool';
    this.triggerGameOver();
  },

  // ---------------------------------------------------------------- the creatures
  _muCreatureSound(c) {
    const charging = c.mode === 'charge';
    const [l, r, d] = this._muLevels([c.x, c.y], charging ? MU_CREATURE_GAIN : MU_IDLE_GAIN, MU_CREATURE_RANGE);
    if (d > MU_CREATURE_RANGE) { if (c.voice) { c.voice.fadeout(300); c.voice = null; c.note = null; } return; }
    const names = new Map(this.muCreatureNames || []);
    const want = names.get(charging ? AB_GROWL : AB_IDLE) || null;
    if (c.note !== want || !(c.voice && c.voice.busy)) {
      if (c.voice) c.voice.fadeout(150);
      c.voice = want ? this._muPlay(want, { loops: -1, volume: 0.0, fadeMs: 150 }) : null;
      c.note = want;
    }
    if (c.voice) c.voice.setVolume(l, r, this._behind([c.x, c.y]));
  },

  // Noise: every creature wakes and charges (for `secs`, or until the sparks are out: Infinity).
  // One that was asleep roars from its bed first, so you hear which way it is coming
  // (web 7.2.5, Russell).
  _muWake(secs) {
    for (const c of this.mu.creatures) {
      if (c.mode === 'calm') continue;
      if (c.mode !== 'charge' && this.audio.has(CREATURE_ROAR)) {
        const [l, r] = this._muLevels([c.x, c.y], ROAR_GAIN, MU_ROAR_RANGE, ROAR_FLOOR);
        this._muPlay(CREATURE_ROAR, { at: [c.x, c.y], volume: Math.max(l, r), keep: true });
      }
      c.mode = 'charge';
      c.charge = Math.max(c.charge, secs);
    }
  },

  // A creature's next move toward `target`, going round any pool in its way.
  _muCreatureMove(c, target, speed, dt) {
    const dx = target[0] - c.x; const dy = target[1] - c.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return 0;
    const step = Math.min(d, speed * dt);
    const base = Math.atan2(dx, -dy);
    for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6]) {
      const a = base + turn;
      const nx = c.x + Math.sin(a) * step; const ny = c.y - Math.cos(a) * step;
      if (Math.abs(nx) > MU_HALF - 1 || Math.abs(ny) > MU_HALF - 1) continue;
      if (this.mu.pools.some((p) => dist2([nx, ny], p.pos) < p.r + 1.0)) continue;
      c.dir = [Math.sin(a), -Math.cos(a)];
      c.x = nx; c.y = ny;
      return step;
    }
    return 0;
  },

  _muUpdateCreatures(dt) {
    const mu = this.mu;
    mu.lost = Math.max(0, mu.lost - dt);
    mu.shoveGrace = Math.max(0, mu.shoveGrace - dt);
    const sparksOut = mu.sparksLeft > 0 || !!mu.firework;
    for (const c of mu.creatures) {
      let moved = 0;
      if (c.mode === 'charge') {
        if (c.charge !== Infinity) c.charge -= dt;
        if (c.charge === Infinity && !sparksOut) c.charge = 0;
        if (c.charge <= 0) { c.mode = 'sleep'; c.charge = 0; }
        else if (mu.lost <= 0 && !mu.shove && !mu.walk) moved = this._muCreatureMove(c, this.playerPos, stepsPerSecond(MU_CHARGE_SPM), dt);
      } else if (c.mode === 'calm') {
        moved = c.calmTo ? this._muCreatureMove(c, c.calmTo, stepsPerSecond(MU_CALM_SPM), dt) : 0;
        if (!c.calmTo || dist2([c.x, c.y], c.calmTo) < 1.0 || moved === 0) { c.mode = 'sleep'; c.calmTo = null; }
      }
      if (moved > 0) {
        c.knock += moved;
        if (c.knock >= MU_STEP) {
          c.knock -= MU_STEP;
          const bank = MU_STEPS.filter((n) => this.audio.has(n));
          const [l, r, d] = this._muLevels([c.x, c.y], c.mode === 'calm' ? MU_STEP_GAIN * 0.45 : MU_STEP_GAIN, MU_CREATURE_RANGE);
          if (bank.length && d < MU_CREATURE_RANGE) this._muPlay(choice(bank), { at: [c.x, c.y], volume: Math.max(l, r) });
        }
      }
      this._muCreatureSound(c);
    }
    // One that reaches you while charging shoves you.
    if (mu.shove || mu.shoveGrace > 0 || mu.walk) return;
    for (const c of mu.creatures) {
      if (c.mode !== 'charge') continue;
      let near = dist2([c.x, c.y], this.playerPos);
      for (const [a, b] of mu.steps) near = Math.min(near, pointToSegment([c.x, c.y], a, b));
      if (near < MU_CATCH) { this._muShove(c); return; }
    }
  },

  // A shove: three steps the way it was running; then it calms down and goes, and the
  // others lose your trail for a moment.
  _muShove(c) {
    const mu = this.mu;
    this.audio.play('player_hit', { keep: true });
    this.stride = null;
    const dir = Math.hypot(c.dir[0], c.dir[1]) > 0.5 ? c.dir
      : (() => { const dx = this.playerPos[0] - c.x; const dy = this.playerPos[1] - c.y; const d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; })();
    // Toward the nearest pool it can knock you to, one step from its edge.
    const to = this._muKnockSpot();
    mu.shove = to ? { to, t: 0 } : { dir: [...dir], left: MU_SHOVE_STEPS, t: 0 };
    c.mode = 'calm';
    c.charge = 0;
    // Away from you, at least MU_CALM_AWAY, then it sleeps again.
    let best = null; let bestD = -1;
    for (let i = 0; i < 40; i++) {
      const p = [uniform(-MU_HALF + 5, MU_HALF - 5), uniform(-MU_HALF + 5, MU_HALF - 5)];
      if (mu.pools.some((q) => dist2(p, q.pos) < q.r + 4)) continue;
      const d = dist2(p, this.playerPos);
      if (d >= MU_CALM_AWAY) { best = p; break; }
      if (d > bestD) { best = p; bestD = d; }
    }
    c.calmTo = best;
    mu.lost = MU_LOST;
    mu.shoveGrace = MU_LOST;
  },

  // The spot one step from the nearest pool's edge (on your side of it) that you can be
  // knocked to in a straight line clear of every pool, or null.
  _muKnockSpot() {
    const p = this.playerPos; const lim = MU_HALF - 1.0;
    const order = this.mu.pools.map((q) => [q, dist2(p, q.pos) - q.r]).sort((a, b) => a[1] - b[1]);
    for (const [q] of order) {
      const dx = p[0] - q.pos[0]; const dy = p[1] - q.pos[1]; const d = Math.hypot(dx, dy) || 1;
      const to = [q.pos[0] + dx / d * (q.r + MU_KNOCK_FROM_EDGE), q.pos[1] + dy / d * (q.r + MU_KNOCK_FROM_EDGE)];
      if (Math.abs(to[0]) > lim || Math.abs(to[1]) > lim) continue;
      if (this._muPoolOn(p, to)) continue;
      if (this.mu.pools.some((o) => dist2(to, o.pos) < o.r + MU_KNOCK_FROM_EDGE - 0.01 && o !== q)) continue;
      return to;
    }
    return null;
  },

  _muUpdateShove(dt) {
    const mu = this.mu; const s = mu.shove;
    s.t -= dt;
    if (s.t > 0) return;
    s.t = MU_SHOVE_EVERY;
    const from = [...this.playerPos];
    if (s.to) {
      // A step at a time toward the spot beside the pool.
      const dx = s.to[0] - from[0]; const dy = s.to[1] - from[1]; const d = Math.hypot(dx, dy);
      const step = Math.min(MU_STEP, d);
      const to = d < 1e-6 ? [...s.to] : [from[0] + dx / d * step, from[1] + dy / d * step];
      const pool = this._muPoolOn(from, to);
      if (pool) { this._muFall(pool, to); return; }
      this.playerPos = to;
      const bank = MU_STEPS.filter((n) => this.audio.has(n));
      if (bank.length && step > 0.2) this.audio.play(choice(bank));
      this._muCheckUnderfoot(from, to);
      if (dist2(to, s.to) < 0.01) mu.shove = null;
      return;
    }
    const lim = MU_HALF - 1.0;
    const to = [Math.max(-lim, Math.min(lim, from[0] + s.dir[0] * MU_STEP)), Math.max(-lim, Math.min(lim, from[1] + s.dir[1] * MU_STEP))];
    const pool = this._muPoolOn(from, to);
    if (pool) { this._muFall(pool, to); return; }
    if (dist2(to, from) < 0.5) { this.audio.play('boundary'); s.left = 0; }
    else {
      this.playerPos = to;
      const bank = MU_STEPS.filter((n) => this.audio.has(n));
      if (bank.length) this.audio.play(choice(bank));
      s.left -= 1;
      this._muCheckUnderfoot(from, to);
    }
    if (s.left <= 0) mu.shove = null;
  },

  // ---------------------------------------------------------------- fireworks and sparks
  _muUpdateFire(dt) {
    const mu = this.mu;
    if (mu.firework) {
      mu.firework.t += dt;
      if (mu.firework.t >= mu.firework.burst) this._muBurst();
    }
    if (mu.warnIn > 0) { mu.warnIn -= dt; if (mu.warnIn <= 0) { const w = mu.warnLine; mu.warnLine = null; if (w) this._muSayNow(w); } }
    if (mu.storyIn > 0) { mu.storyIn -= dt; if (mu.storyIn <= 0) this._muTellStory(); }
  },

  // The burst: the sparks are released.
  _muBurst() {
    const mu = this.mu;
    // The sparks are released, silent until you step. The creatures sleep on: they wake
    // at the first spark you pop (7.2.4, Russell).
    mu.firework = null;
    mu.sparksLeft = randint(MU_SPARKS[0], MU_SPARKS[1]);
  },

  // A step while sparks are out pops the next one, with a firecracker pop just ahead of
  // you, whichever way you face. Popping them is the noise: every creature wakes and charges
  // until the last has popped.
  _muPopSpark() {
    const mu = this.mu;
    if (mu.firework) this._muBurst();          // a step before the burst still pops one: a step always does
    if (mu.sparksLeft <= 0) return;
    this._muWake(Infinity);
    // Always just ahead of you, the way you face (7.2.7, Russell: only the firework is on a side).
    const f = this._forward();
    const at = [this.playerPos[0] + f[0] * MU_POP_AHEAD, this.playerPos[1] + f[1] * MU_POP_AHEAD];
    if (this.audio.has(MU_STAMP_SOUND)) this._muPlay(MU_STAMP_SOUND, { at, volume: MU_POP_LEVEL, keep: true });
    mu.sparksLeft -= 1;
    if (mu.sparksLeft <= 0) this._muSparksOut();
  },

  // A memory lying on the floor is taken by stepping onto it.
  _muCheckUnderfoot(from, to) {
    const mu = this.mu;
    if (mu.door || mu.firework) return;
    for (const m of mu.memories) {
      if (m.taken || m.inCase) continue;
      if (dist2(m.pos, to) < MU_TAKE || pointToSegment(m.pos, from, to) < MU_TAKE * 0.7) { this._muTake(m); return; }
    }
  },

  // The last spark has popped: the creatures calm down, and the memory's story is told.
  _muSparksOut() {
    const mu = this.mu;
    for (const c of mu.creatures) if (c.mode === 'charge' && c.charge === Infinity) { c.mode = 'sleep'; c.charge = 0; }
    // The story waits a few seconds after the last pop (7.2.8, Russell).
    mu.storyLater = mu.pendingStory;
    mu.pendingStory = null;
    mu.storyIn = MU_STORY_AFTER;
  },

  // Now the memory's story, and after it the next call (or the door).
  _muTellStory() {
    const mu = this.mu;
    const story = mu.storyLater;
    mu.storyLater = null;
    mu.storyIn = 0;
    if (story) mu.speaker.queue.push(story);
    this._muAfterStory(story);
  },

  // ---------------------------------------------------------------- the door
  // Every memory found: the character says so, and the buzzer sounds from the door, on
  // a wall at least ten steps from you, with open floor all the way.
  _muOpenDoor() {
    const mu = this.mu;
    const lim = MU_HALF - 1.5;
    let best = null; let bestD = -1;
    for (let i = 0; i < 400; i++) {
      const t = uniform(-lim + 6, lim - 6);
      const side = randint(0, 3);
      const p = side === 0 ? [t, -lim] : side === 1 ? [t, lim] : side === 2 ? [-lim, t] : [lim, t];
      const inner = [p[0] * (lim - 3) / lim, p[1] * (lim - 3) / lim];
      if (!mu.can(inner)) continue;
      const d = dist2(p, this.playerPos);
      if (d >= MU_DOOR_FROM) { best = p; break; }
      if (d > bestD) { best = p; bestD = d; }
    }
    mu.door = { pos: best || [0, -lim], voice: null, t: 0 };
    mu.speaker.pos = [...mu.door.pos];
    mu.speaker.target = null;
    // The character does not say the door is open: you find it by its buzzer (7.2.6, Russell).
  },

  _muUpdateDoor(dt) {
    const mu = this.mu; const dr = mu.door;
    if (!dr) return;
    if (mu.walk) { this._muUpdateWalk(dt); return; }
    dr.t -= dt;
    if (dr.voice && !dr.voice.busy) dr.voice = null;
    if (!dr.voice && dr.t <= 0 && this.audio.has(MU_BUZZER)) {
      dr.voice = this._muPlay(MU_BUZZER, { volume: 0.0, keep: true });
      dr.t = MU_BUZZ_GAP + MU_BUZZ_LEN;
    }
    const [l, r, d] = this._muLevels(dr.pos, MU_DOOR_GAIN, MU_DOOR_RANGE, MU_DOOR_FLOOR, true);
    if (dr.voice) dr.voice.setVolume(l, r, this._behind(dr.pos));
    if (d < MU_DOOR_REACH) this._muThroughDoor();
  },

  // At the door: it opens, you walk through by yourself, they say goodbye, and it closes behind you.
  _muThroughDoor() {
    const mu = this.mu; const dr = mu.door;
    if (dr.voice) { dr.voice.fadeout(150); dr.voice = null; }
    this.stride = null;
    this._turnStop();
    mu.freed += 1;
    if (this.audio.has(MU_DOOR_OPEN)) this._muPlay(MU_DOOR_OPEN, { at: dr.pos, keep: true });
    // Out through the wall, the way the door faces.
    const lim = MU_HALF - 1.5;
    const out = Math.abs(dr.pos[1]) >= lim - 0.01 ? [0, Math.sign(dr.pos[1])] : [Math.sign(dr.pos[0]), 0];
    mu.walk = { t: 0.7, steps: MU_WALK_STEPS, dir: out, closed: false, hold: 0 };
    this.playerPos = [...dr.pos];
    mu.speaker.pos = [dr.pos[0] + out[0] * MU_STEP * 2, dr.pos[1] + out[1] * MU_STEP * 2];
    this._muHush(150);
    mu.speaker.queue = [];
    const bye = this._muLine('goodbye');
    if (bye) mu.speaker.queue.push(bye);
    // Everything of this museum falls quiet but its air and the character.
    for (const p of mu.pools) if (p.voice) { p.voice.fadeout(500); p.voice = null; }
    for (const c of mu.creatures) if (c.voice) { c.voice.fadeout(500); c.voice = null; }
    mu.creatures = [];
    mu.sparksLeft = 0;
  },

  _muUpdateWalk(dt) {
    const mu = this.mu; const w = mu.walk;
    w.t -= dt;
    if (w.t > 0) return;
    if (w.steps > 0) {
      w.steps -= 1;
      w.t = MU_WALK_EVERY;
      this.playerPos = [this.playerPos[0] + w.dir[0] * MU_STEP * 0.5, this.playerPos[1] + w.dir[1] * MU_STEP * 0.5];
      const bank = MU_STEPS.filter((n) => this.audio.has(n));
      if (bank.length) this.audio.play(choice(bank));
      return;
    }
    // Through: wait for their goodbye, then the door closes behind you.
    if (this._muTalking() || mu.speaker.queue.length) return;
    if (!w.closed) {
      w.closed = true;
      if (this.audio.has(MU_DOOR_CLOSE)) this.audio.play(MU_DOOR_CLOSE, { keep: true });
      w.t = MU_DOOR_HOLD + 1.2;
      return;
    }
    // The next museum (in chaos, the next stage).
    mu.done = true;
    if (mu.chaos) { this.nextLevel(); return; }
    this._muBegin({ chaos: false, museum: mu.museum + 1, count: memoriesFor(mu.museum + 1) });
  },

  // ---------------------------------------------------------------- chaos
  _muChaosTime(secs) {
    this.timeLeft += secs;
    this.thirtySecAnnounced = this.timeLeft <= 30.0;
    const step = this._announceStep();
    this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / step) * step;
    this.lastBeepSecond = -1;
  },

  // ---------------------------------------------------------------- the frame
  updateMuseum(dt) {
    const mu = this.mu;
    if (!mu || this.isPaused || mu.dead) return;
    // A chaos stage runs on the chaos clock (it waits while the door is open).
    if (mu.chaos && this._advanceTimer(dt)) return;
    if (this.state !== STATE || this.mu !== mu) return;
    if (!mu.lines) this._muEnsureCharacter();
    if (mu.shove) { this._muUpdateShove(dt); if (mu.dead || this.mu !== mu) return; }
    this._muUpdateFire(dt);
    this._muUpdateCreatures(dt);
    mu.steps = [];
    if (mu.dead || this.mu !== mu) return;
    this._muUpdatePools(dt);
    this._muUpdateMemories(dt);
    this._muUpdateDoor(dt);
    if (this.mu !== mu) return;
    this._muUpdateSpeaker(dt);
  },

  // A step, or a run's step, on the museum's stone floor.
  _muStep(g) {
    const mu = this.mu;
    if (mu.walk || mu.shove || mu.dead) return;
    const f = this.playerFacing = this._forward();
    const dir = g === 'up' ? f : [-f[0], -f[1]];
    const from = [...this.playerPos];
    const want = [from[0] + dir[0] * MU_STEP, from[1] + dir[1] * MU_STEP];
    // (Into a pool before the wall stops anything: the water is checked on the step you meant.)
    // Only a pool you walk straight at takes you (7.2.10).
    const pool = this._muPoolOn(from, want, true);
    if (pool) {
      const lim = MU_HALF;
      if (Math.abs(want[0]) <= lim && Math.abs(want[1]) <= lim) { this._muFall(pool, want); return; }
    }
    const w = this._walkArena(dir, MU_STEP, MU_HALF, { sound: false });
    if (!w) return;
    const ahead = this._muPoolOn(w[0], w[1], true);
    if (ahead) { this._muFall(ahead, w[1]); return; }
    // One off to a side: you walk round its edge instead.
    if (this._muPoolOn(w[0], w[1])) {
      const round = this._muOutOfPools(w[1]);
      if (!round) { this.playerPos = [...w[0]]; this.audio.play('boundary'); return; }
      this.playerPos = round; w[1] = [...round];
    }
    mu.steps.push(w);
    // Over broken glass: a crunch, and the noise may wake the creatures (7.2.11).
    const onGlass = mu.glass.some((gp) => pointToSegment(gp, w[0], w[1]) < MU_GLASS_R);
    const bank = (onGlass ? AB_STEPS_GLASS : MU_STEPS).filter((n) => this.audio.has(n));
    if (bank.length) this.audio.play(choice(bank));
    if (onGlass && !mu.creatures.some((c) => c.mode === 'charge')) this._muWake(MU_GLASS_CHARGE);
    const fireBefore = mu.firework;                 // (not the firework this very step sets off)
    this._muCheckUnderfoot(w[0], w[1]);
    // (A step while a firework's sparks are out, or before it has burst, always pops one.)
    if ((mu.sparksLeft > 0 || (fireBefore && mu.firework === fireBefore)) && this.mu === mu) this._muPopSpark();
    if (mu.door && dist2(this.playerPos, mu.door.pos) < MU_DOOR_REACH) this._muThroughDoor();
  },

  _muAttack() {
    const mu = this.mu;
    if (mu.door || mu.walk || mu.firework) { this.audio.play('empty_click'); return; }
    const m = this._muCaseInReach();
    if (!m) { this.audio.play('empty_click'); return; }
    // Smashed: the memory is yours at once, and the noise wakes the creatures.
    if (m.voice) { m.voice.stop(); m.voice = null; }
    const smash = this.audio.has(CASE_SMASH) ? CASE_SMASH : aliasRecording(this.audio, 'evt_glass_smash', 'event_sfx_file_evt_glass_smash');
    if (smash) this._muPlay(smash, { at: m.pos, keep: true });
    mu.glass.push([...m.pos]);                 // its broken glass stays on the floor
    // (A fiery one's case: its sparks wake them, when you step on them, not the glass. 7.2.10.)
    if (!m.fiery) this._muWake(MU_SMASH_CHARGE);
    this._muTake(m);
  },

  // Enter's report: the level and the memories found (in chaos: the memories, then the
  // health, the clock and the points), and the way you face.
  _muReport() {
    const mu = this.mu;
    const found = mu.door ? `All ${mu.count} found.` : `${mu.found} of ${mu.count} found.`;
    if (mu.chaos) { this._report(found, true); return; }
    this._report(`Level ${mu.museum}. ${found}`);
  },

  // Everything of a museum stopped (`all`: its air too).
  _muSilence(mu, all = true) {
    for (const m of mu.memories) if (m.voice) { m.voice.stop(); m.voice = null; }
    for (const p of mu.pools) if (p.voice) { p.voice.stop(); p.voice = null; }
    for (const c of mu.creatures) if (c.voice) { c.voice.stop(); c.voice = null; }
    const sp = mu.speaker;
    for (const k of ['voice', 'beacon']) if (sp[k]) { sp[k].stop(); sp[k] = null; }
    if (mu.door && mu.door.voice) { mu.door.voice.stop(); mu.door.voice = null; }
    if (all) {
      if (mu.amb && mu.amb.voice) mu.amb.voice.stop();
      mu.amb = null;
    } else if (mu.amb && mu.amb.voice) {
      // (The next museum's air comes in over this one's.)
      mu.amb.voice.fadeout(900);
      mu.amb = null;
    }
  },

  _muStopAll() {
    const mu = this.mu;
    if (!mu) return;
    this._muSilence(mu, true);
    mu.door = null;
    mu.stopped = true;
    for (const name of [MU_POOL, MU_STAMP_SOUND, ...MU_FIREWORKS.map(([n]) => n), MU_BUZZER, MU_DOOR_OPEN, MU_DOOR_CLOSE, CREATURE_ROAR, ...AB_STEPS_GLASS]) this.audio.pins.delete(`museum:${name}`);
    for (const [, n] of this.muCreatureNames || []) if (n) this.audio.pins.delete(`museum:${n}`);
  },
};

// ------------------------------------------------------------------ help
const HELP_SECTIONS = [
  ['The Museum', [
    { title: 'The Museum', sound: null, desc: 'The Museum is a mode of its own, new in 7.2.0, inspired by Papa Sangre, where you must save a soul in the land of the dead, and by Papa Sangre II, which has a Museum of Memories of its own. Each museum holds the soul of one of the characters of Ultimate Mode\'s safe zones, chosen at random, and you hear their own world playing softly through a great echoing hall. Their memories are scattered through the museum. Find every one, then walk out of the door, and their soul is free. Then you walk on into the next museum, with another character, and one more memory to find. There is no clock. You turn and walk as in every walking mode (see General Turning). Double tap for the level, the memories found and the way you are facing.' },
    { title: 'The Museum Memories', sound: null, desc: 'A memory sounds like music: each one plays a little tune of its own, over and over, where it lies, so you can tell them apart, and the one the character is calling you to plays louder than the rest. Walk onto a memory to take it, and its whole tune plays once. About one memory in three is locked in a glass case instead: it hums, and the nearest case knocks as you close in, faster as you come nearer; when you are beside it and facing it a bell rings: tap with two fingers to smash it, or press the spacebar, and the memory is yours at once. But smashing glass is loud. The first museum has three memories, and each museum after it has one more, up to eight.' },
    { title: 'The Museum Characters', sound: null, desc: 'The character whose museum it is guides you. They call to you from beside the memory they want you to find next, the nearest one, in their own voice, so walk toward their voice. Each memory you find gives them back a piece of their life, and they tell you about it; then they call from beside the next one. When every memory is found, they say nothing of the door: listen for its buzzer. As you walk out, they say goodbye, and they are free. They also warn you whenever you come close to the edge of a bottomless pool.' },
    { title: 'The Museum Bottomless Pools', sound: null, desc: 'The one danger in the museum is its bottomless pools, which dissolve memory. They lie all through the museum, many of them close around the memories, and sometimes you have to go around one to reach a memory. Each pool bubbles where it lies, louder as you come closer, and the nearest few are heard at once. When the step straight ahead of you would take you into a pool, the character warns you, so stop, turn, and go another way; a pool beside you or behind you is not called ahead, so listen to its bubbling too. You fall in only walking straight at a pool: one off to your side you simply walk round. Fall into a pool, and the run is over at once. There are no lives. Every museum has more pools than the last, closer around the memories, but there is always a way through to every memory and to the door.' },
    { title: 'The Museum Creatures', sound: null, desc: 'Creatures sleep in the museum: one in the first museum, two in the second, and three from the third museum on. You hear them breathing softly. They wake only on noise, never because you walk near them. Smash a glass case (unless it holds a fiery memory, whose sparks wake them instead), and every creature wakes with a roar from where it sleeps, so you can tell which way it is coming, and charges you for about three seconds, growling, with a footstep for every step it runs. Run the other way: you are a little faster than they are. A smashed case leaves its broken glass on the floor, crunching under your feet: step on it while no creature is charging, and the noise wakes them for about two seconds; while they are already charging, it adds nothing. The glass stays only in that museum. A creature that reaches you knocks you toward the nearest bottomless pool and leaves you one step from its edge, so be careful which way you step next. Then it calms down and walks away, and the other creatures lose your trail for a moment, so you are never shoved twice in a row. You cannot shoot them.' },
    { title: 'The Museum Fiery Memories', sound: null, desc: 'About one memory in four is a fiery one. When you take it, you stop where you are, a firework bursts on your left or your right, and the character warns you; there are four different fireworks, all short. The burst releases four to six sparks: you do not have to find them, and they make no sound until you move. Every step you take pops one, whichever way you walk, with a firecracker pop just in front of you. The creatures sleep through the bang, but the first spark you pop wakes every one of them, each with a roar from where it sleeps, and they keep charging until the last spark has popped, so once you start, do not stop moving until the popping is over. Then the creatures calm down, and a few seconds later the character tells you about the memory.' },
    { title: 'The Museum Door and Score', sound: null, desc: 'When every memory is found, a buzzer sounds from the museum\'s door, on one of its walls, ten steps or more away. Walk to it. The door opens, and you walk through by yourself while the character says goodbye; the door closes behind you, and the next museum begins. Your score is the number of souls you free, the museums you complete, and The Museum has its own high score board.' },
    { title: 'The Museum in Chaos Mode', sound: null, desc: 'Chaos Mode has museums too, one museum to a level, which you know by a character introducing themselves over their own world. A museum in chaos has three memories the first time in a run, and one more each time after, at most eight. Each memory puts twenty seconds on the chaos clock, and a fiery one thirty. When every memory is found the buzzer sounds, the chaos clock waits until you reach the door, and the door leads on to the next level. A fall into a bottomless pool ends the whole chaos run, however much health you have. There, double tap for the memories found, then your health, the clock and the points.' },
  ]],
];

const HELP_DEMOS = [
  ['Demos, The Museum', [
    { title: 'The Museum Demos', sound: null, desc: 'The sounds of The Museum.' },
    { title: 'A Memory', sound: 'mu_tune_demo', desc: 'The tune of a memory. Every memory has a tune of its own.' },
    { title: 'Bottomless Pool', sound: MU_POOL, desc: 'A bottomless pool, bubbling. Keep away from it.' },
    { title: 'Glass Case', sound: CASE_SOUND, desc: 'The hum of a glass case, with a memory locked inside.' },
    { title: 'Glass Case Knocking', sound: 'ut_case_knock_demo', desc: 'The knocking of the nearest glass case, faster as you come closer.' },
    { title: 'Creature, Sleeping', sound: AB_IDLE, desc: 'A creature asleep. Only noise wakes it.' },
    { title: 'Creature, Charging', sound: AB_GROWL, desc: 'A creature charging you.' },
    { title: 'Firework 1', sound: 'mu_firework_1', desc: 'One of a fiery memory\'s four fireworks: a burst with an echo.' },
    { title: 'Firework 2', sound: 'mu_firework_2', desc: 'One of a fiery memory\'s four fireworks: a single burst.' },
    { title: 'Firework 3', sound: 'mu_firework_3', desc: 'One of a fiery memory\'s four fireworks: a crackling burst.' },
    { title: 'Firework 4', sound: 'mu_firework_4', desc: 'One of a fiery memory\'s four fireworks: another crackling burst.' },
    { title: 'A Spark Popping', sound: MU_STAMP_SOUND, desc: 'A spark popping as you step, after a fiery memory\'s firework. Each step pops one, until they are all gone.' },
    { title: 'A Creature Waking', sound: CREATURE_ROAR, desc: 'A creature roaring as it wakes, from where it was sleeping, just before it charges you.' },
    { title: 'The Buzzer', sound: MU_BUZZER, desc: 'The buzzer of the museum\'s door: every memory is found. Walk to it.' },
    { title: 'Door Opening', sound: MU_DOOR_OPEN, desc: 'The door opening.' },
    { title: 'Door Closing', sound: MU_DOOR_CLOSE, desc: 'The door closing behind you, before the next museum.' },
  ]],
];

// ------------------------------------------------------------------ the mode
function reset(game) {
  if (game.mu) game._muStopAll();
  game.mu = null;
}

function input(game, g) {
  const mu = game.mu;
  if (!mu) return;
  if (g === 'clock') {
    // No clock in this mode; a chaos stage answers with the chaos clock.
    if (mu.chaos) { const secs = Math.trunc(game.timeLeft); game.tts.speak(`${secs} second${secs === 1 ? '' : 's'} remaining.`, { interrupt: true }); }
    return;
  }
  if (g === 'enter') { game._muReport(); return; }
  if (mu.walk || mu.dead) return;
  if (g === 'space') { game._muAttack(); return; }
  if (g === 'left' || g === 'right') { game._turnQuick(g === 'right' ? 1 : -1); return; }
  if (g === 'up' || g === 'down') game._muStep(g);
}

export default {
  menu: [{ key: 'museum', label: 'The Museum', select: (game) => game.startMuseum() }],
  playStates: [STATE],
  mixin,
  init(game) {
    game.mu = null;
    loadCast();
    loadMuseumLines();
    // Help's demo of a memory's tune (made once).
    try { if (game.audio && game.audio.ctx) makeMuseumSounds(game.audio); } catch (e) { /* made when the sounds are there */ }
  },
  reset,
  update(game, dt) { game.updateMuseum(dt); },
  input,
  stopAll(game) { if (game.mu) game._muStopAll(); },
  finish(game) {
    const mu = game.mu;
    const freed = mu ? mu.freed : 0;
    const found = mu ? mu.memoriesTotal : 0;
    const opener = mu && mu.dead ? 'You fell into a bottomless pool.' : 'Game Over.';
    return { key: BOARD, score: freed, message: `${opener} You freed ${freed} ${plural(freed, 'soul')} and found ${found} ${plural(found, 'memory', 'memories')}. ` };
  },
  room() { return MU_ROOM; },
  turns(game) { return game.state === STATE && !(game.mu && (game.mu.walk || game.mu.shove)); },
  keepFacing(game) { return !!(game.mu && game.mu.walk); },
  blockPause(game) { return !!(game.mu && (game.mu.walk || game.mu.shove)); },
  blockStride(game) { return !!(game.mu && (game.mu.walk || game.mu.shove || game.mu.dead)); },
  // The hall's echo grows near the walls, as Battle's does near its edge.
  surroundings(game, pos) { return game._arenaSurroundings(pos); },
  strideSig(game) { const mu = game.mu; return mu ? `${mu.museum}|${!!mu.door}|${!!mu.walk}|${!!mu.shove}` : ''; },
  status(game) {
    const mu = game.mu;
    if (!mu) return 'The Museum.';
    return `The Museum. Level ${mu.museum}. ${mu.found} of ${mu.count} memories.`;
  },
  boards: [{ key: BOARD, label: 'The Museum', fmt: (v) => `${v} ${v === 1 ? 'soul' : 'souls'}` }],
  help: { sections: HELP_SECTIONS, demos: HELP_DEMOS },
};
