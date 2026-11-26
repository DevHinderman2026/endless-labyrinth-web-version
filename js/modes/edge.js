// The Edge (web 8.0.0, Russell's design, 25 November 2026; website only).
//
// A sub mode of The Abyss: choosing The Abyss on the main menu now asks which, The
// Abyss or The Edge. Inspired by the abyss level of Papa Sangre II, where a step or
// two at a time is all the ground there is.
//
// You cross the abyss on a gravel path one step wide (8.0.1, Russell: gravel, not
// stone), with the abyss's wind all
// round you and nothing else: no creatures at all. The ledge runs straight for one
// or two steps, never more, then bends a quarter turn left or right. Near the far
// side it opens out for a few steps, and the exit is there: the Museum's buzzer,
// heard from the start, so you always know which way you are heading.
//
// You cannot see the edge, so you throw glass. You have as much as you like: two
// fingers or the spacebar throws a piece one step ahead, the way you face. If it
// lands on the gravel with a clink, like a cup set down (8.0.1: not a smash), that
// step is safe. If it whooshes away into the dark (and, a
// moment later, breaks far below), that is the edge. And every step that brings you
// to the edge, with the edge straight ahead, kicks a loose stone off it, a warning
// (8.0.2, Russell, 25 November 2026: every time; in 8.0.0 and 8.0.1 only about half
// the edge stones were loose, and once kicked a stone was gone, which made a moment's
// inattention a fall). Step off the ledge and you fall, with a scream: in The Edge itself, that is
// the end of the run at once. Four minutes for the whole run (8.0.4; until then no
// clock). The score is the crossings you finish; each crossing has more bends than the last.
//
// You always begin on a small square of gravel, five steps across, in its middle: two
// steps from the edge on every side, so you can walk and get your bearings, and throw
// glass, before you have to. The ledge leaves from the middle of the side ahead of
// you (Russell, 25 November 2026).
//
// A step always goes in the main direction (north, east, south or west) nearest the
// way you face, and so does a throw, so being turned a little off never sends you
// over the side.
//
// Chaos Mode has Edge levels too (js/modes/chaos.js): one crossing, shorter, from a
// square in the direction you happen to face. The chaos clock runs, and the buzzer
// puts thirty seconds on it (8.0.4). (8.1.0, Russell's idea, 26 November 2026.) A fall
// costs 35 health and no time: you fall the whole way, screaming, and land on the
// abyss's glass floor, where The Abyss's own rules hold (js/modes/abyss.js, `below`):
// smash 3 glass cases on the run's first fall, one more each fall after, at most 8;
// they give no time, and the chaos clock runs on (8.1.1: you land with a heavy thud on the
// glass, and the first strike comes a moment after it, not on the instant); a creature's catch costs 25 health and
// 10 seconds. Then an elevator calls you, and its ride carries you back up onto the stone
// you fell from, with 60 seconds on the chaos clock, and the crossing goes on. Too little
// health or time, anywhere in that, ends the run. (8.0.0 to 8.0.4: a fall cost 35 health
// and 60 seconds and put you straight back on the stone.)
//
// The sounds: the abyss's wind, the Museum's buzzer, and new recordings for the
// gravel footsteps (8.0.1), the glass, the kicked stone, the fall and
// the scream (Pixabay, web-only, in the edge pack; tools/edge/make_sounds.py names
// each one). Should a recording ever be missing, the game's nearest sound stands in
// for it (EDGE_STAND_INS), and the kicked stone is made by the game (kickSound).

import { aliasRecording, addMade } from './events/sounds.js';
import { AMBIENCE_LEVEL, BACKGROUND_SEND } from './ultimate.js';
import { AB_BACKGROUND, STATE as AB_STATE } from './abyss.js';
import { MU_BUZZER, MU_BUZZ_GAP, MU_BUZZ_LEN, MU_STEPS } from './museum.js';
import { wrapAngle, QUARTER, COMPASS_DIRS } from '../turning.js';

export const STATE = 'edge';
export const BOARD = 'edge';

// ------------------------------------------------------------------ constants
export const ED_STEP = 3.0;                     // one step (one stone), in the game's units
export const ED_PLATFORM = 2;                   // the starting square: this many stones each way from its middle (five across)
// The bends in a crossing: six in the first, two more each crossing, at most thirty.
export const ED_BENDS = [6, 2, 30];
// In Chaos: six the first time in a run, two more each time, at most twelve (8.0.3; was
// five, one more each time: a crossing now always has an even number of bends, so its
// last stretch, and the exit, are straight ahead).
export const ED_CHAOS_BENDS = [6, 2, 12];
// (8.0.3, Russell, 25 November 2026: on crossing 2 the way toward the buzzer kept being
// edge, and he could not find a way round. The path could wander off sideways and even
// back, away from the buzzer.) Now it only ever goes forward or sideways, never back:
// forward, then a jog of one or two steps left or right, then forward again, so the
// buzzer is always somewhere ahead, and at every bend after going forward one of the two
// sides leads on; after going sideways, the way on is always forward. Nor does it drift
// more than this many steps to either side of where it began.
export const ED_DRIFT = 4;
export const ED_RUN = [1, 2];                   // stones straight between two bends (never more than two)
export const ED_EXIT_DEPTH = 3;                 // the open stone at the far side: this many steps deep ...
export const ED_EXIT_WIDE = 1;                  // ... and this many stones to each side of the ledge (three across)
export const ED_KICK_CHANCE = 1.0;              // a step to the edge kicks a stone off it: every time (8.0.2; was 0.5)
export const ED_THROW_GAP = 0.3;                // seconds between two throws, at least
export const ED_DROP_DELAY = [1.8, 2.4];        // seconds before glass that went over the edge breaks far below
export const ED_DROP_LEVEL = 0.18;              // how loud that is: far below
// (8.1.0: the new scream, Russell, 26 November 2026.) In The Edge: its first eight seconds,
// fading away as you fall, then the run ends. In Chaos: all of it, landing included.
export const ED_FALL_TIME = 8.0;                // seconds of falling (the scream) before the run ends (8.0.0 to 8.0.4: 2.6)
export const ED_CHAOS_FALL_SECONDS = 11.5;      // in Chaos: seconds of falling before you land on the glass below
export const ED_NEXT_HOLD = 1.6;                // seconds after the buzzer before the next crossing
// (8.0.4, Russell, 25 November 2026: with the path always leading toward the buzzer the
// mode had become much easier.) A clock: four minutes for the whole run, never added to;
// finish as many crossings as you can. It stops during a fall and between crossings.
export const ED_START_TIME = 240.0;
// Chaos (8.0.4): the chaos clock runs through an Edge level, and reaching the buzzer puts
// thirty seconds on it. (8.0.0 to 8.0.3: the clock waited for the whole level.)
export const ED_CHAOS_DONE_TIME = 30;
// The buzzer: as loud as The Museum's door, heard from anywhere on the crossing.
export const ED_BUZZ_GAIN = 1.0;
export const ED_BUZZ_FLOOR = 0.3;
export const ED_BUZZ_RANGE = 90.0;
// Chaos (Russell, 25 November 2026; 8.1.0, 26 November 2026).
export const ED_CHAOS_FALL_HEALTH = 35;         // a fall's cost: health only (8.0.0 to 8.0.4: and 60 seconds)
export const ED_CHAOS_RETURN_TIME = 60;         // seconds on the chaos clock as the elevator brings you back up
export const ED_BELOW_QUOTA = [3, 1, 8];        // cases to smash below: on the run's first fall, more each fall, at most
// Sounds.
export const ED_BACKGROUND = AB_BACKGROUND;     // the abyss's own wind
// Gravel underfoot (8.0.1, Russell: the stone steps sounded like concrete); The Museum's
// stone steps stand in should the gravel ever be missing.
export const ED_STEPS = ['ed_step_1', 'ed_step_2', 'ed_step_3', 'ed_step_4'];
export const ED_GLASS_STONE = 'ed_glass_stone'; // glass landing on the gravel a step ahead, like a cup set down: safe
export const ED_GLASS_WHOOSH = 'ed_glass_whoosh';   // glass flying out over the edge: not safe
export const ED_GLASS_BELOW = 'ed_glass_below'; // and breaking, far below
export const ED_KICK = 'ed_kick';               // a loose stone kicked off the edge, tumbling away
export const ED_FALL = 'ed_fall';               // you, falling (8.1.0: "Blizzard Wind", eight seconds)
export const ED_SCREAM = 'ed_scream';           // a man's scream as you fall, fading away (eight seconds)
export const ED_FALL_WHOLE = 'ed_fall_whole';   // in Chaos: the same, the whole way down (eleven and a half)
export const ED_SCREAM_WHOLE = 'ed_scream_whole';
// (8.1.1, Russell, 26 November 2026: the scream has no impact at its end.) In Chaos, as the
// fall ends: you land on the glass floor below, a heavy body fall with broken glass crunching.
export const ED_LAND = 'ed_land';
export const ED_ROOM = 'open';                  // open air: no echo, as The Abyss
// Should a recording be missing: the sound that stands in for it (an events recording
// by its stem, or the game's own), or one the game makes (ED_KICK).
export const EDGE_STAND_INS = {
  [ED_GLASS_STONE]: ['ut_glass_step_1'],
  [ED_GLASS_WHOOSH]: ['evt_ninja_whoosh'],
  [ED_GLASS_BELOW]: ['ut_glass_smash', 'evt_glass_smash'],
  [ED_FALL]: ['event_falling', 'evt_ninja_whoosh'],
  [ED_SCREAM]: [],
  [ED_FALL_WHOLE]: [ED_FALL, 'event_falling', 'evt_ninja_whoosh'],
  [ED_SCREAM_WHOLE]: [ED_SCREAM],
  [ED_LAND]: ['ut_glass_smash', 'evt_glass_smash'],
  [ED_KICK]: [],
};

const RATE = 44100;

// ------------------------------------------------------------------ helpers
const rand = Math.random;
const uniform = (a, b) => a + (b - a) * rand();
const randint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const choice = (arr) => arr[Math.floor(rand() * arr.length)];
const plural = (n, word, many = word + 's') => (n === 1 ? word : many);
const key = (x, y) => `${x},${y}`;

// The main direction nearest a facing: 0 north, 1 east, 2 south, 3 west.
export function mainOf(face) { return Math.round(wrapAngle(face) / QUARTER) % 4; }
// A stone of the plan (forward = north), turned k quarter turns clockwise.
export function turnCell([x, y], k) {
  let p = [x, y];
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) p = [-p[1], p[0]];
  return p;
}
// The recordings of a crossing (held in memory while it lasts).
export const ED_RECORDINGS = [ED_GLASS_STONE, ED_GLASS_WHOOSH, ED_GLASS_BELOW, ED_KICK, ED_FALL, ED_SCREAM, ED_FALL_WHOLE, ED_SCREAM_WHOLE, ED_LAND];
// The cases to smash on the abyss's floor after a Chaos fall: the run's nth fall.
export function belowQuota(n) { return Math.min(ED_BELOW_QUOTA[2], ED_BELOW_QUOTA[0] + ED_BELOW_QUOTA[1] * Math.max(0, n - 1)); }
export function bendsFor(crossing, table = ED_BENDS) {
  const n = Math.min(table[2], table[0] + table[1] * Math.max(0, crossing - 1));
  return n + (n % 2);      // even, so the last stretch is forward (8.0.3)
}

// ------------------------------------------------------------------ the crossing
// A crossing laid out, facing north from the middle of the starting square:
//   { stones: Set of 'x,y', exit: [x, y], ledge: [[x, y]...], platform: [[x, y]...] }
// The ledge leaves from the middle of the square's north side; it runs ED_RUN stones
// at a time between quarter-turn bends, never beside itself (a stone of the ledge
// touches, side to side, only the stones before and after it), and ends in a patch
// of open stone ED_EXIT_DEPTH deep and three across with the exit at its far end.
export function layCrossing(bends) {
  bends += bends % 2;      // (even: the last stretch, and the exit, straight ahead)
  const P = ED_PLATFORM;
  const platform = [];
  for (let x = -P; x <= P; x++) for (let y = -P; y <= P; y++) platform.push([x, y]);
  for (let attempt = 0; attempt < 400; attempt++) {
    const stones = new Set(platform.map(([x, y]) => key(x, y)));
    const ledge = [];
    let pos = [0, -P]; let dir = [0, -1];
    // Free: not a stone yet, and touching (side to side) no stone but the one it comes from.
    const free = (c, from) => {
      if (stones.has(key(c[0], c[1]))) return false;
      for (const [dx, dy] of COMPASS_DIRS) {
        const n = [c[0] + dx, c[1] + dy];
        if (n[0] === from[0] && n[1] === from[1]) continue;
        if (stones.has(key(n[0], n[1]))) return false;
      }
      return true;
    };
    let ok = true;
    for (let b = 0; b <= bends && ok; b++) {
      const len = randint(ED_RUN[0], ED_RUN[1]);
      for (let i = 0; i < len; i++) {
        const next = [pos[0] + dir[0], pos[1] + dir[1]];
        if (!free(next, pos)) { ok = false; break; }
        stones.add(key(next[0], next[1])); ledge.push(next); pos = next;
      }
      if (!ok || b === bends) break;
      // After going sideways: forward again. After going forward: a jog left or right,
      // whichever the next stone can go (both: either), never further than ED_DRIFT out.
      if (dir[0] !== 0) { dir = [0, -1]; continue; }
      const sides = [[-1, 0], [1, 0]].filter((d) => Math.abs(pos[0] + d[0] * ED_RUN[1]) <= ED_DRIFT || Math.abs(pos[0] + d[0]) < Math.abs(pos[0]));
      const can = sides.filter((d) => free([pos[0] + d[0], pos[1] + d[1]], pos));
      if (!can.length) { ok = false; break; }
      dir = choice(can);
    }
    if (!ok) continue;
    // The open stone at the far side, straight on from the last stone of the ledge.
    const side = [-dir[1], dir[0]];
    const patch = [];
    for (let d = 1; d <= ED_EXIT_DEPTH; d++) {
      for (let s = -ED_EXIT_WIDE; s <= ED_EXIT_WIDE; s++) patch.push([pos[0] + dir[0] * d + side[0] * s, pos[1] + dir[1] * d + side[1] * s]);
    }
    const patchKeys = new Set(patch.map(([x, y]) => key(x, y)));
    const clash = patch.some(([x, y]) => {
      if (stones.has(key(x, y))) return true;
      for (const [dx, dy] of COMPASS_DIRS) {
        const n = key(x + dx, y + dy);
        if (patchKeys.has(n) || n === key(pos[0], pos[1])) continue;
        if (stones.has(n)) return true;
      }
      return false;
    });
    if (clash) continue;
    for (const [x, y] of patch) stones.add(key(x, y));
    const exit = [pos[0] + dir[0] * ED_EXIT_DEPTH, pos[1] + dir[1] * ED_EXIT_DEPTH];
    return { stones, exit, ledge, platform, patch };
  }
  // (Never in practice: a straight ledge always fits.)
  const stones = new Set(platform.map(([x, y]) => key(x, y)));
  const ledge = [];
  for (let i = 1; i <= 4; i++) { ledge.push([0, -P - i]); stones.add(key(0, -P - i)); }
  const patch = [];
  for (let d = 1; d <= ED_EXIT_DEPTH; d++) for (let s = -1; s <= 1; s++) { patch.push([s, -P - 4 - d]); stones.add(key(s, -P - 4 - d)); }
  return { stones, exit: [0, -P - 4 - ED_EXIT_DEPTH], ledge, platform, patch };
}

// ------------------------------------------------------------------ the game's own sounds
// The kicked stone, until its recording is in the game: a few knocks of stone on stone,
// further apart and fainter, as it bounces down and away.
export function kickSound() {
  const n = Math.floor(RATE * 1.4);
  const L = new Float64Array(n);
  let at = 0; let amp = 0.55; let gap = 0.07;
  let seed = 7;
  const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 1073741823.5 - 1; };
  for (let k = 0; k < 6; k++) {
    const start = Math.floor(RATE * at);
    const len = Math.floor(RATE * 0.05);
    let lp = 0;
    const cut = 0.35 - k * 0.04;
    for (let j = 0; j < len && start + j < n; j++) {
      const t = j / RATE;
      lp += cut * (noise() - lp);
      const knock = Math.sin(2 * Math.PI * (900 - k * 90) * t) * 0.5 + lp * 1.6;
      L[start + j] += knock * Math.exp(-t / 0.012) * amp * 32768;
    }
    at += gap; gap *= 1.45; amp *= 0.62;
  }
  return [L, Float64Array.from(L)];
}

export function makeEdgeSounds(audio) {
  if (!audio.has(ED_KICK)) addMade(audio, ED_KICK, kickSound());
}

// ------------------------------------------------------------------ the game's methods
const mixin = {
  startEdge() {
    this.state = STATE;
    this.resetGameState();
    this.state = STATE;
    this._syncRoom();
    this._wake(true);
    if (this.ambienceChannel) { this.ambienceChannel.stop(); this.ambienceChannel = null; }
    if (this.beatChannel) { this.beatChannel.stop(); this.beatChannel = null; }
    this.ed = null;
    this._face(0, true);
    this.timeLeft = ED_START_TIME;
    this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / this._announceStep()) * this._announceStep();
    this.thirtySecAnnounced = this.timeLeft <= 30.0;
    this.lastBeepSecond = -1;
    this._edBegin({ chaos: false, crossing: 1 });
  },

  // A crossing: a run's next, or a chaos level (crossing: how hard).
  _edBegin({ chaos, crossing, adopt = null }) {
    try { makeEdgeSounds(this.audio); } catch (e) { /* made when the sounds are there */ }
    const prev = this.ed;
    const crossed = prev && !chaos ? prev.crossed : 0;
    const keepAir = prev && prev.amb ? prev.amb : null;
    if (prev) this._edSilence(prev, false);
    this.edNames = new Map(this._edNames());
    for (const [stem, name] of this.edNames) if (name && stem !== ED_BACKGROUND) this.audio.prepare(name, `edge:${stem}`);
    const bends = bendsFor(crossing, chaos ? ED_CHAOS_BENDS : ED_BENDS);
    const lay = layCrossing(bends);
    // The crossing is laid out ahead of you: the way you face, to the nearest main direction.
    const k = mainOf(this.tn ? this.tn.face : 0);
    const stones = new Set([...lay.stones].map((s) => { const [x, y] = s.split(',').map(Number); const [a, b] = turnCell([x, y], k); return key(a, b); }));
    const exit = turnCell(lay.exit, k);
    this.playerPos = [0.0, 0.0];
    this.arenaLimit = 1e9;
    this.stride = null;
    const ed = this.ed = {
      run: this.runId, chaos, crossing, crossed, bends,
      stones, exit, cell: [0, 0], loose: new Map(),
      throwT: 0, drops: [], falling: null, next: null, done: false,
      buzz: { voice: null, t: 0.4 }, amb: keepAir, throws: 0,
    };
    if (!keepAir) this._edBackground(adopt);
    if (!chaos) this.tts.speak(`Crossing ${crossing}.`, { interrupt: true });
  },

  // The recordings the mode plays: the pack's own where it has them, the stand-ins until then.
  _edNames() {
    const a = this.audio;
    const pick = (name) => {
      if (a.has(name)) return name;
      for (const s of EDGE_STAND_INS[name] || []) {
        if (a.has(s)) return s;
        const al = aliasRecording(a, s, `event_sfx_file_${s}`);
        if (al) return al;
      }
      return null;
    };
    return [
      [ED_BACKGROUND, aliasRecording(a, ED_BACKGROUND, `event_amb_file_${ED_BACKGROUND}`)],
      ...ED_RECORDINGS.map((n) => [n, pick(n)]),
    ];
  },

  _edName(stem) {
    if (!this.edNames) this.edNames = new Map(this._edNames());
    return this.edNames.get(stem) || null;
  },

  _edBackground(adopt = null) {
    const ed = this.ed;
    const name = this._edName(ED_BACKGROUND);
    let voice = null;
    if (adopt && adopt.busy && adopt.name === name) { voice = adopt; voice.setVolume(AMBIENCE_LEVEL); }
    else {
      if (adopt) adopt.fadeout(400);
      voice = name ? this.audio.play(name, { loops: -1, volume: AMBIENCE_LEVEL, fadeMs: 400, send: BACKGROUND_SEND }) : null;
    }
    ed.amb = { name, voice };
  },

  // A stone's place in the world, and whether there is one.
  _edPos([x, y]) { return [x * ED_STEP, y * ED_STEP]; },
  _edStone([x, y]) { return !!(this.ed && this.ed.stones.has(key(x, y))); },

  // The main direction nearest the way you face, as a step on the grid ([east, south]).
  _edDir() { return COMPASS_DIRS[mainOf(this.tn ? this.tn.face : 0)]; },

  // How loud a thing is from where you are: [left, right, distance] (never quieter than
  // the floor, however far off, with `always`).
  _edLevels(pos, gain, range, floor = 0, always = false) {
    const dx = pos[0] - this.playerPos[0]; const dy = pos[1] - this.playerPos[1];
    const d = Math.hypot(dx, dy);
    const pan = d > 0 ? dx / d : 0.0;
    const v = d > range ? (always ? Math.min(1.0, floor * gain) : 0) : Math.min(1.0, Math.max(floor, 1.0 - d / range) * gain);
    return [v * (1.0 - Math.max(0.0, pan)), v * (1.0 - Math.max(0.0, -pan)), d];
  },

  // ---------------------------------------------------------------- the glass
  // A piece of glass, one step ahead the way you face: it lands on the gravel, or it
  // whooshes out over the edge and, a moment later, breaks far below.
  _edThrow() {
    const ed = this.ed;
    if (ed.falling || ed.next || ed.throwT > 0) return;
    ed.throwT = ED_THROW_GAP;
    ed.throws += 1;
    const d = this._edDir();
    const cell = [ed.cell[0] + d[0], ed.cell[1] + d[1]];
    // (8.0.2, Russell, 25 November 2026: the glass is always heard straight in front of you,
    // never off to the right or left, even when you face a little off a main direction.
    // Where it lands, safe or not, is still the step in the nearest main direction.)
    const f = this._forward();
    const pos = [this.playerPos[0] + f[0] * ED_STEP, this.playerPos[1] + f[1] * ED_STEP];
    if (this._edStone(cell)) {
      const n = this._edName(ED_GLASS_STONE);
      if (n) this.audio.play(n, { at: pos, volume: 0.9, keep: true });
      return;
    }
    const w = this._edName(ED_GLASS_WHOOSH);
    if (w) this.audio.play(w, { at: pos, volume: 0.9, keep: true });
    // (Further out, and far below: it is heard away ahead of you, faint.)
    ed.drops.push({ t: uniform(...ED_DROP_DELAY), pos: [pos[0] + f[0] * ED_STEP * 2, pos[1] + f[1] * ED_STEP * 2] });
  },

  _edUpdateDrops(dt) {
    const ed = this.ed;
    for (const dr of ed.drops) {
      dr.t -= dt;
      if (dr.t > 0) continue;
      const n = this._edName(ED_GLASS_BELOW);
      if (n) this.audio.play(n, { at: dr.pos, volume: ED_DROP_LEVEL, keep: true });
    }
    ed.drops = ed.drops.filter((dr) => dr.t > 0);
  },

  // ---------------------------------------------------------------- walking
  // A step, forward or back, along the main direction nearest the way you face.
  _edStep(g) {
    const ed = this.ed;
    if (ed.falling || ed.next) return;
    const f = this._edDir();
    const d = g === 'up' ? f : [-f[0], -f[1]];
    this.playerFacing = this._forward();
    const to = [ed.cell[0] + d[0], ed.cell[1] + d[1]];
    if (!this._edStone(to)) { this._edFall(to); return; }
    ed.cell = to;
    this.playerPos = this._edPos(to);
    let bank = ED_STEPS.filter((n) => this.audio.has(n));
    if (!bank.length) bank = MU_STEPS.filter((n) => this.audio.has(n));
    if (bank.length) this.audio.play(choice(bank));
    if (to[0] === ed.exit[0] && to[1] === ed.exit[1]) { this._edCrossed(); return; }
    this._edMaybeKick(d);
  },

  // At an edge straight ahead, a stone is kicked off it: you hear it go, and tumble away.
  // Every time you step to an edge (8.0.2). (ed.loose can still mark a spot, by hand, as
  // giving no warning: false.)
  _edMaybeKick(d) {
    const ed = this.ed;
    const ahead = [ed.cell[0] + d[0], ed.cell[1] + d[1]];
    if (this._edStone(ahead)) return;
    const k = `${key(ed.cell[0], ed.cell[1])}>${d[0]},${d[1]}`;
    if (ed.loose.has(k) ? !ed.loose.get(k) : rand() >= ED_KICK_CHANCE) return;
    const n = this._edName(ED_KICK);
    if (n) this.audio.play(n, { at: this._edPos(ahead), volume: 0.9, keep: true });
  },

  // Off the edge: you fall, screaming. In The Edge, the run is over once the scream
  // has gone; in Chaos (8.1.0), all the way down to the abyss's floor (_edLand).
  _edFall(at) {
    const ed = this.ed;
    this.stride = null;
    this._turnStop();
    this.playerPos = this._edPos(at);
    ed.falling = { t: ed.chaos ? ED_CHAOS_FALL_SECONDS : ED_FALL_TIME, at };
    ed.drops = [];
    for (const n of ed.chaos ? [ED_FALL_WHOLE, ED_SCREAM_WHOLE] : [ED_FALL, ED_SCREAM]) {
      const name = this._edName(n);
      if (name) this.audio.play(name, { volume: 1.0, keep: true });
    }
    if (ed.buzz.voice) { ed.buzz.voice.fadeout(300); ed.buzz.voice = null; }
  },

  _edUpdateFall(dt) {
    const ed = this.ed; const fl = ed.falling;
    fl.t -= dt;
    if (fl.t > 0) return;
    ed.falling = null;
    if (!ed.chaos) {
      ed.dead = true;
      this.triggerGameOver();
      return;
    }
    // Chaos (8.1.0): 35 health (with too little, the run ends there), and no time; then
    // you land on the abyss's glass floor.
    if (this._chaosHurt(ED_CHAOS_FALL_HEALTH, 'fall')) return;
    this._edLand();
  },

  // ---------------------------------------------------------------- Chaos: below (8.1.0)
  // You land on the glass floor of the abyss: for now this level is an abyss (the state is
  // The Abyss's own, and abyss.js plays it, with `below` set), and the crossing waits
  // above, just as you left it (this.ed, with ed.below), until the elevator brings you
  // back up (_edReturn). The abyss's wind, the same wind as the Edge's, plays on throughout.
  _edLand() {
    const ed = this.ed;
    this.chaosEdgeFalls = (this.chaosEdgeFalls || 0) + 1;
    const quota = belowQuota(this.chaosEdgeFalls);
    ed.below = { quota, fall: this.chaosEdgeFalls };
    ed.drops = [];
    if (ed.buzz.voice) { ed.buzz.voice.stop(); ed.buzz.voice = null; }
    const wind = ed.amb && ed.amb.voice ? ed.amb.voice : null;
    ed.amb = null;
    // (8.1.1) The landing: a heavy body fall on the glass, with the glass crunching.
    const land = this._edName(ED_LAND);
    if (land) this.audio.play(land, { volume: 1.0, keep: true });
    this.state = AB_STATE;
    this._syncRoom();
    this.stride = null;
    this._abBegin({ chaos: true, quota, lives: 0, adopt: wind, below: true });
    if (!this.towerLowWarned || this.towerHp > 35) this.tts.speak(`${this.towerHp} health.`, { interrupt: true });
  },

  // Back up (from abyss.js, at the end of the elevator's ride): onto the stone you fell
  // from, with ED_CHAOS_RETURN_TIME on the chaos clock, and the crossing goes on.
  _edReturn(wind = null) {
    const ed = this.ed;
    if (!ed) return;
    ed.below = null;
    this.state = STATE;
    this._syncRoom();
    this.stride = null;
    const name = this._edName(ED_BACKGROUND);
    if (wind && wind.busy && wind.name === name) { wind.setVolume(AMBIENCE_LEVEL); ed.amb = { name, voice: wind }; }
    else this._edBackground(wind);
    const back = this._edStone(ed.cell) ? ed.cell : [0, 0];
    ed.cell = [...back];
    this.playerPos = this._edPos(back);
    ed.buzz.t = 0.6;
    this.timeLeft += ED_CHAOS_RETURN_TIME;
    this.thirtySecAnnounced = this.timeLeft <= 30.0;
    const step = this._announceStep();
    this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / step) * step;
    this.lastBeepSecond = -1;
    this.tts.speak(`${ED_CHAOS_RETURN_TIME} more seconds. ${this.towerHp} health.`, { interrupt: true });
  },

  // ---------------------------------------------------------------- the exit
  _edUpdateBuzzer(dt) {
    const ed = this.ed; const bz = ed.buzz;
    const pos = this._edPos(ed.exit);
    bz.t -= dt;
    if (bz.voice && !bz.voice.busy) bz.voice = null;
    if (!bz.voice && bz.t <= 0 && this.audio.has(MU_BUZZER)) {
      bz.voice = this.audio.play(MU_BUZZER, { volume: 0.0, keep: true });
      bz.t = MU_BUZZ_GAP + MU_BUZZ_LEN;
    }
    const [l, r] = this._edLevels(pos, ED_BUZZ_GAIN, ED_BUZZ_RANGE, ED_BUZZ_FLOOR, true);
    if (bz.voice) bz.voice.setVolume(l, r, this._behind(pos));
  },

  // At the buzzer: across. In The Edge the next crossing begins after a moment; in
  // Chaos, the next level.
  _edCrossed() {
    const ed = this.ed;
    this.stride = null;
    this._turnStop();
    if (ed.buzz.voice) { ed.buzz.voice.fadeout(200); ed.buzz.voice = null; }
    ed.crossed += 1;
    if (ed.chaos) {
      // Thirty seconds on the chaos clock, its announcements put right as every chaos credit does.
      this.timeLeft += ED_CHAOS_DONE_TIME;
      this.thirtySecAnnounced = this.timeLeft <= 30.0;
      const step = this._announceStep();
      this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / step) * step;
      this.lastBeepSecond = -1;
      this.tts.speak(`${ED_CHAOS_DONE_TIME} more seconds.`, { interrupt: true });
      ed.done = true; this.nextLevel(); return;
    }
    ed.next = { t: ED_NEXT_HOLD };
  },

  // ---------------------------------------------------------------- the frame
  updateEdge(dt) {
    const ed = this.ed;
    if (!ed || this.isPaused || ed.dead || ed.done) return;
    ed.throwT = Math.max(0, ed.throwT - dt);
    this._edUpdateDrops(dt);
    if (ed.falling) { this._edUpdateFall(dt); return; }
    if (ed.next) {
      ed.next.t -= dt;
      if (ed.next.t <= 0) this._edBegin({ chaos: false, crossing: ed.crossing + 1 });
      return;
    }
    // The clock (8.0.4): the run's four minutes, or the chaos clock. Not during a fall or
    // between crossings (above).
    if (this._advanceTimer(dt)) return;
    if (this.state !== STATE || this.ed !== ed) return;
    this._edUpdateBuzzer(dt);
  },

  // Enter's report: the crossing and the crossings finished (in chaos: the health, the
  // clock and the points), and the way you face.
  _edReport() {
    const ed = this.ed;
    if (ed.chaos) { this._report('', true); return; }
    this._report(`Crossing ${ed.crossing}. Crossed: ${ed.crossed}.`, true);
  },

  // Everything of a crossing stopped (`all`: the wind too).
  _edSilence(ed, all = true) {
    if (ed.buzz && ed.buzz.voice) { ed.buzz.voice.stop(); ed.buzz.voice = null; }
    ed.drops = [];
    if (all && ed.amb && ed.amb.voice) { ed.amb.voice.stop(); ed.amb = null; }
  },

  _edStopAll() {
    const ed = this.ed;
    if (!ed) return;
    this._edSilence(ed, true);
    ed.amb = null;
    ed.stopped = true;
    for (const stem of ED_RECORDINGS) this.audio.pins.delete(`edge:${stem}`);
  },
};

// ------------------------------------------------------------------ help
const HELP_SECTIONS = [
  ['The Edge', [
    { title: 'The Edge', sound: null, desc: 'The Edge is a mode of its own inside The Abyss, new in 8.0.0: choose The Abyss on the main menu, then The Edge. Inspired by the abyss level of Papa Sangre II, you cross the abyss on a narrow path of gravel, one step wide, with only the wind of the abyss around you. There are no creatures at all: the only danger is the edge. The way across is marked by the buzzer of The Museum\'s door, which you hear from the start. Reach it, and you are across. You have four minutes for the whole run. You turn and walk as in every walking mode (see General Turning). Double tap for the crossing you are on, the crossings you have finished, the clock, and the way you are facing.' },
    { title: 'The Edge Throwing Glass', sound: null, desc: 'You cannot see the edge, so you throw glass, and you have as much of it as you like. Tap with two fingers, or press the spacebar, and a piece of glass lands one step ahead of you, the way you face. If it lands on the gravel with a clink, like a cup set down, that step is safe. The glass is always heard straight in front of you, never to one side. If it whooshes away into the dark, and a moment later breaks far below, that is the edge: do not step there. Turn and throw again until you find the way on. A throw always goes in the main direction, north, east, south or west, nearest the way you face, and so does every step, so being turned a little off never takes you over the side.' },
    { title: 'The Edge The Ledge', sound: null, desc: 'You always begin in the middle of a small square of gravel, five steps across, so you are two steps from the edge on every side: walk about, get your bearings and throw some glass before you set out. The ledge leaves from the middle of the side ahead of you. It runs straight for one or two steps, never more, then bends a quarter turn to the left or the right: three flicks, and the ticks for north, east, south and west help you count. It only ever goes forward or sideways, never back, so the buzzer is always somewhere ahead of where you started: after a stretch forward, the way on is to your left or your right; after a stretch sideways, the way on is forward again, toward the buzzer. Near the far side it opens out, three steps wide and three deep, and the buzzer is at its far end, so you can walk straight in.' },
    { title: 'The Edge Loose Stones', sound: null, desc: 'Every time a step brings you to the edge, with the edge straight ahead of you, your foot kicks a stone off it, and you hear it tumble away: do not step forward again. Turn, throw glass, and find the way on. The warning comes only for the edge straight ahead, the way you walked; the edge beside you is found with the glass.' },
    { title: 'The Edge Clock, Falling and Score', sound: null, desc: 'You have four minutes for the whole run: finish as many crossings as you can before the clock runs out. Nothing adds time to it. The clock stops while you fall, and for the moment between one crossing and the next. Step off the path and you fall, screaming, and the run is over at once: there are no lives. Each crossing you finish counts: the next one begins a moment after the buzzer, on a new path with two more bends than the last, up to thirty. Your score is the number of crossings you finish, and The Edge has its own high score board.' },
    { title: 'The Edge in Chaos Mode', sound: null, desc: 'Chaos Mode has Edge levels too, one crossing to a level: you know one by the gravel underfoot, the wind of the abyss and the buzzer. You begin in the middle of a square of gravel, two steps from the edge on every side, and the path leaves from the side you happen to be facing. A crossing in chaos has six bends the first time in a run, and two more each time after, up to twelve. The chaos clock keeps running while you cross, and reaching the buzzer puts thirty seconds on it. A fall costs 35 health and no time, but it is a long one: you fall the whole way, screaming, and land with a heavy thud on the broken glass floor of the abyss below. The first lightning strike comes a moment after you land. There The Abyss\'s own rules hold (see The Abyss): listen for the lightning, as for five seconds after a strike your steps are not heard; the creatures hunt by sound; the glass cases hum, and the nearest one knocks. Smash three cases the first time you fall in a run, and one more each time you fall after that, up to eight. They give no time, and the chaos clock keeps running while you are down there. A creature that catches you costs 25 health and 10 seconds. When the last case breaks, the creatures and the lightning go, and an elevator calls you, with its hum and a single note, as on an island\'s seabed. Walk into it: the ride up stops the clock, and it carries you back onto the spot you fell from, with sixty more seconds on the chaos clock, and the crossing goes on, the buzzer still ahead. If a fall, or anything below, leaves you with no health, or the chaos clock with no time, the run is over. Double tap for your health, the clock and the points; below, for the cases smashed first.' },
  ]],
];

const HELP_DEMOS = [
  ['Demos, The Edge', [
    { title: 'The Edge Demos', sound: null, desc: 'The sounds of The Edge.' },
    { title: 'Footstep on Gravel', sound: ED_STEPS[0], desc: 'A step on the gravel path.' },
    { title: 'Glass on Gravel', sound: ED_GLASS_STONE, desc: 'Your glass landing on the gravel, like a cup set down: that step is safe.' },
    { title: 'Glass Over the Edge', sound: ED_GLASS_WHOOSH, desc: 'Your glass flying out over the edge: do not step there.' },
    { title: 'Glass Far Below', sound: ED_GLASS_BELOW, desc: 'A moment after it goes over the edge, the glass breaks far below.' },
    { title: 'Loose Stone', sound: ED_KICK, desc: 'A stone kicked off the edge, tumbling away: the edge is straight ahead. Every step to the edge kicks one.' },
    { title: 'The Buzzer', sound: MU_BUZZER, desc: 'The buzzer at the far side: walk to it.' },
    { title: 'Falling', sound: ED_SCREAM, desc: 'A fall into the abyss.' },
    { title: 'Landing', sound: ED_LAND, desc: 'In Chaos Mode, the end of a fall: you land on the broken glass floor of the abyss below.' },
  ]],
];

// ------------------------------------------------------------------ the mode
function reset(game) {
  if (game.ed) game._edStopAll();
  game.ed = null;
}

function input(game, g) {
  const ed = game.ed;
  if (!ed) return;
  if (g === 'clock') {
    // The run's clock, or the chaos clock (8.0.4).
    const secs = Math.trunc(game.timeLeft);
    game.tts.speak(`${secs} second${secs === 1 ? '' : 's'} remaining.`, { interrupt: true });
    return;
  }
  if (g === 'enter') { game._edReport(); return; }
  if (ed.falling || ed.next || ed.dead) return;
  if (g === 'space') { game._edThrow(); return; }
  if (g === 'left' || g === 'right') { game._turnQuick(g === 'right' ? 1 : -1); return; }
  if (g === 'up' || g === 'down') game._edStep(g);
}

export default {
  // (No main menu entry of its own: The Abyss's menu offers it, js/modes/abyss.js.)
  menu: [],
  statKey: 'edge',
  playStates: [STATE],
  mixin,
  init(game) {
    game.ed = null;
  },
  reset,
  update(game, dt) { game.updateEdge(dt); },
  input,
  stopAll(game) { if (game.ed) game._edStopAll(); },
  finish(game) {
    const ed = game.ed;
    const n = ed ? ed.crossed : 0;
    const opener = ed && ed.dead ? 'You fell into the abyss.' : game.timeLeft <= 0 ? 'Time up.' : 'Game Over.';
    return { key: BOARD, score: n, message: `${opener} You finished ${n} ${plural(n, 'crossing')}. ` };
  },
  room() { return ED_ROOM; },
  turns(game) { return game.state === STATE && !(game.ed && (game.ed.falling || game.ed.next)); },
  blockPause(game) { return !!(game.ed && game.ed.falling); },
  // (Between crossings you keep the way you face: the next crossing is laid out ahead of it.)
  keepFacing(game) { return !!(game.ed && game.ed.next); },
  blockStride(game) { return !!(game.ed && (game.ed.falling || game.ed.next || game.ed.dead)); },
  surroundings() { return [1.0, 0.0]; },     // no walls anywhere
  strideSig(game) { const ed = game.ed; return ed ? `${ed.crossing}|${!!ed.falling}|${!!ed.next}` : ''; },
  status(game) {
    const ed = game.ed;
    if (!ed) return 'The Edge.';
    return `The Edge. Crossing ${ed.crossing}. ${ed.crossed} crossed.`;
  },
  boards: [{ key: BOARD, label: 'The Edge', fmt: (v) => `${v} ${v === 1 ? 'crossing' : 'crossings'}` }],
  help: { sections: HELP_SECTIONS, demos: HELP_DEMOS },
};

