// Volcanic Caves (web 8.2.0, Russell's design, 27 November 2026; website only).
//
// A sub mode of Driving: choosing Driving on the main menu now asks which, Driving or
// Volcanic Caves (js/modes/driving.js DRIVE_MENU), the way The Abyss asks for The Edge.
// Inspired by Roller Ball in Sonar Islands: you drive down through volcanic caves, each
// level a cave deeper toward the centre of the Earth.
//
// Driving is as on the road: slide up and hold to accelerate, slide the held finger back
// down to brake (or swipe down), double tap to report. But here the cave turns with you,
// as walking does (3D turning): lift the accelerating finger, then flick left or right
// for one 30-degree turn, or slide and hold to keep turning. The car coasts while the
// finger is up. On a keyboard: hold the up arrow to accelerate, the left and right arrows
// turn (pressed or held), the down arrow brakes.
//
// Each level is one cave: passages of rock, one passage wide, that twist and branch.
// Somewhere in it is the hole down to the next level. It beeps from where it is, faster
// and higher the nearer you are, like a labyrinth's exit. Drive into it: a pop, a drop,
// and you land in the next cave down. Nothing says the level; a double tap does.
//
// Ticking bombs lie in the passages, each ticking twice a second. One explodes only if
// you drive into it head on: then you are back at the start of that cave, and the clock
// runs on. Brushing past one does nothing (hug the passage wall to get by). A cave wall
// stops the car with a thud of rock, and costs no time: turn, and drive on. Glancing
// along a wall, the car slides along it with a softer knock.
//
// The lava is all around you, never touching you: Escape the Cave's lava ("Cauldron
// Boiling"), growing louder the deeper you go, exactly as that game raises it (lavaLevel).
//
// The clock: two minutes to start, with time credits of 10, 20 and 30 seconds lying in
// the caves (the game's spinning credit beacons, higher and faster for more). The run
// ends only when the time runs out. Deeper caves have more bombs, the hole farther away,
// and twistier passages; the credits stay the same at every depth. The score is the
// deepest level reached, on Volcanic Caves' own high score board.
//
// Chaos Mode has Volcanic Caves levels too (js/modes/chaos.js): reach the hole a set number
// of times (VC_CHAOS_HOLES); a bomb costs health and time there instead of a restart.
//
// The sounds: the cave's own bubbling air, the lava, the bombs' ticking and explosion, the
// rock, the pop and the landing (Pixabay, web-only, in the volcanic pack;
// tools/volcanic/make_sounds.py names each one), the Driving engine, the game's proximity
// beeps for the hole, and its credit beacons and coins. Should a recording ever be
// missing, the game's nearest sound stands in for it (VC_STAND_INS).

import { aliasRecording } from './events/sounds.js';
import { AMBIENCE_LEVEL, BACKGROUND_SEND } from './ultimate.js';
import { wrapAngle, QUARTER, COMPASS_DIRS, walkStep, mainIndex } from '../turning.js';

export const STATE = 'volcanic';
export const BOARD = 'volcanic';

// ------------------------------------------------------------------ constants
export const VC_CELL = 6.0;                    // one stretch of passage, in the game's units (a passage is this wide)
// The car (units a second). Slower than the road's: a cave is tight.
export const VC_MAX_SPEED = 11.0;
export const VC_ACCEL = 7.0;
export const VC_COAST = 2.5;                   // the car slows by this while no finger is on the throttle
export const VC_BRAKE = 5.0;                   // each brake takes this off
// The clock (Russell): two minutes; credits of 10, 20 and 30 seconds.
export const VC_START_TIME = 120.0;
export const VC_CREDIT_CHANCE = 0.65;          // a cave has a credit about two times in three
export const VC_CREDIT_VALUES = [10, 20, 30];
export const VC_CREDIT_WEIGHTS = [0.5, 0.35, 0.15];
export const VC_CREDIT_BEACONS = ['credit_beacon_battle_10', 'credit_beacon_battle_15', 'credit_beacon_battle_20'];
export const VC_CREDIT_PICKUPS = ['credit_10', 'credit_20', 'credit_30'];
export const VC_CREDIT_GAIN = 0.75;
export const VC_CREDIT_RANGE = 90.0;
export const VC_CREDIT_FLOOR = 0.12;
// The hole and a credit are taken by driving into their stretch of passage (their cell).
export const VC_CENTRE_PULL = 2.0;             // units a second: driving squarely down a passage, the car keeps to its middle
// The cave's layout, by depth (level 1 the first cave). Its passages run straight for a
// few stretches, then bend a quarter turn: more bends deeper down, and shorter runs between
// them (twistier), so the hole is farther away along the way. Side passages that lead
// nowhere grow in number too.
export const VC_BENDS = [2, 1, 16];            // the first cave's bends, more each level, at most
export function bendsFor(depth) { return Math.min(VC_BENDS[2], VC_BENDS[0] + VC_BENDS[1] * Math.max(0, depth - 1)); }
export function runFor(depth) {                // stretches straight between two bends: [fewest, most]
  if (depth <= 2) return [3, 5];
  if (depth <= 5) return [2, 4];
  if (depth <= 9) return [2, 3];
  return [1, 3];
}
export function branchesFor(depth) { return Math.min(6, Math.floor(depth / 2)); }
// Bombs: one in the first cave, one more every second level, at most twelve.
export function bombsFor(depth) { return Math.min(12, 1 + Math.floor((depth - 1) / 2)); }
export const VC_TICK_EVERY = 0.5;              // seconds between a bomb's ticks (Russell: every half second)
export const VC_TICK_GAIN = 0.8;
export const VC_TICK_RANGE = 48.0;             // eight stretches of passage
export const VC_TICK_HEARD = 3;                // the nearest this many bombs tick; the rest are silent until nearer (fewer placed sounds at once: the static)
export const VC_BOMB_HIT = 1.6;                // units: closer than this to a bomb's middle is driving into it head on
export const VC_BOMB_MIN_SPEED = 0.5;          // (standing still, or creeping slower, never sets one off)
export const VC_BOOM_HOLD = 1.6;               // seconds after an explosion before you are back at the start
// The hole's beacon: the labyrinth exit's proximity beeps (prox_0 to prox_19), measured in
// stretches of passage.
export const VC_HOLE_GAIN = 0.55;
export const VC_HOLE_FLOOR = 0.25;
export const VC_HOLE_RANGE = 240.0;
export const VC_DROP_TIME = 1.6;               // seconds from the pop to the next cave (the clock waits)
export const VC_LAND_AT = 0.7;                 // seconds into the drop: the landing below
// Walls.
export const VC_ROCK_GAIN = 0.9;
export const VC_GLANCE_GAIN = 0.35;
export const VC_ROCK_GAP = 0.45;               // seconds: a thud no more often than this
// The engine: the Driving engine's loops, quieter, so the bombs and the hole are heard over it.
export const VC_ENGINE_BANDS = 16;
export const VC_ENGINE_BLEND = 160;
export const VC_ENGINE_LEVEL = [0.3, 0.2];     // at a standstill, and more at full speed
// The lava (Escape the Cave's lava_volume, cave_settings.py): barely there on level 1, at its
// old full loudness on level 22, then still rising every level, more slowly, toward a ceiling.
export const LAVA_VOLUME_START = 0.05;
export const LAVA_VOLUME_END = 1.0;
export const LAVA_VOLUME_FULL_AT = 22;
export const LAVA_CEILING = 2.1;
export const LAVA_RISE_SPAN = 25;
export const VC_LAVA_TOP = 0.95;               // the web's loudness at the ceiling (Escape the Cave plays it LAVA_CEILING times quieter than made)
export const VC_AIR_LEVEL = AMBIENCE_LEVEL * 0.8;
// Chaos (Russell's design; the numbers are Claude's, for him to settle).
export const VC_CHAOS_HOLES = [2, 1, 5];       // holes to reach: the run's first Volcanic level, one more each level, at most
export const VC_CHAOS_BOMB_HEALTH = 20;
export const VC_CHAOS_BOMB_TIME = 15;
// Sounds.
export const VC_AIR = 'vc_air';
export const VC_LAVA = 'vc_lava';
export const VC_TICK = 'vc_tick';
export const VC_BOOM = 'vc_boom';
export const VC_ROCK = 'vc_rock';
export const VC_POP = 'vc_pop';
export const VC_LAND = 'vc_land';
export const VC_ROOM = 'lab';                  // a cave's echo, tighter near the rock
export const VC_STAND_INS = {
  [VC_AIR]: ['lab_02_scary_cave'],
  [VC_LAVA]: ['evt_cauldron'],
  [VC_TICK]: ['ut_click'],
  [VC_BOOM]: ['crash', 'evt_explosion'],
  [VC_ROCK]: ['boundary'],
  [VC_POP]: ['evt_pop', 'menu_move'],
  [VC_LAND]: ['event_falling'],
};
export const VC_RECORDINGS = [VC_AIR, VC_LAVA, VC_TICK, VC_BOOM, VC_ROCK, VC_POP, VC_LAND];

// ------------------------------------------------------------------ helpers
const rand = Math.random;
const randint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const choice = (arr) => arr[Math.floor(rand() * arr.length)];
const plural = (n, word, many = word + 's') => (n === 1 ? word : many);
const key = (x, y) => `${x},${y}`;
const s = (n) => (n === 1 ? '' : 's');

// Escape the Cave's lava_volume(level), word for word: 1.0 is its loudness at LAVA_VOLUME_FULL_AT.
export function lavaVolume(level) {
  const t = Math.min(1.0, Math.max(0.0, (level - 1) / (LAVA_VOLUME_FULL_AT - 1)));
  const base = LAVA_VOLUME_START + (LAVA_VOLUME_END - LAVA_VOLUME_START) * t;
  const past = level - LAVA_VOLUME_FULL_AT;
  if (past <= 0) return base;
  return LAVA_VOLUME_END + (LAVA_CEILING - LAVA_VOLUME_END) * (1.0 - Math.exp(-past / LAVA_RISE_SPAN));
}
// The lava's loudness in the game, on a level.
export function lavaLevel(level) { return VC_LAVA_TOP * lavaVolume(level) / LAVA_CEILING; }

// The holes a Chaos Volcanic level asks for, the run's nth.
export function chaosHolesFor(n) { return Math.min(VC_CHAOS_HOLES[2], VC_CHAOS_HOLES[0] + VC_CHAOS_HOLES[1] * Math.max(0, n - 1)); }

// The main direction nearest a facing: 0 north, 1 east, 2 south, 3 west.
export function mainOf(face) { return Math.round(wrapAngle(face) / QUARTER) % 4; }
// A cell of the plan (forward = north), turned k quarter turns clockwise.
export function turnCell([x, y], k) {
  let p = [x, y];
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) p = [-p[1], p[0]];
  return p;
}

// ------------------------------------------------------------------ the cave
// A cave laid out, facing north from its start (0, 0):
//   { open: Set of 'x,y', path: [[x, y]...] (start to hole), hole: [x, y],
//     branches: [[[x, y]...]...], bombs: [[x, y]...], credit: [x, y] or null }
// Passages are one cell wide and never run beside one another (a cell of a passage
// touches, side to side, only the cells before and after it, and where a side passage
// leaves), so every passage is a clean tunnel with rock either side.
export function layCave(depth) {
  const bends = bendsFor(depth);
  const [r0, r1] = runFor(depth);
  for (let attempt = 0; attempt < 400; attempt++) {
    const open = new Set([key(0, 0)]);
    const path = [[0, 0]];
    let pos = [0, 0]; let dir = [0, -1];
    const free = (c, from) => {
      if (open.has(key(c[0], c[1]))) return false;
      for (const [dx, dy] of COMPASS_DIRS) {
        const n = [c[0] + dx, c[1] + dy];
        if (n[0] === from[0] && n[1] === from[1]) continue;
        if (open.has(key(n[0], n[1]))) return false;
      }
      return true;
    };
    let ok = true;
    for (let b = 0; b <= bends && ok; b++) {
      const len = randint(r0, r1) + (b === 0 ? 1 : 0);
      for (let i = 0; i < len; i++) {
        const next = [pos[0] + dir[0], pos[1] + dir[1]];
        if (!free(next, pos)) { ok = false; break; }
        open.add(key(next[0], next[1])); path.push(next); pos = next;
      }
      if (!ok || b === bends) break;
      // A quarter turn, left or right, whichever the next cell can go.
      const sides = [[-dir[1], dir[0]], [dir[1], -dir[0]]];
      const can = sides.filter((d) => free([pos[0] + d[0], pos[1] + d[1]], pos));
      if (!can.length) { ok = false; break; }
      dir = choice(can);
    }
    if (!ok) continue;
    const hole = path[path.length - 1];
    // Side passages: from a straight cell of the way, out to one side, two to four cells,
    // leading nowhere.
    const branches = [];
    const straightAt = (i) => i > 0 && i < path.length - 1
      && path[i + 1][0] - path[i][0] === path[i][0] - path[i - 1][0]
      && path[i + 1][1] - path[i][1] === path[i][1] - path[i - 1][1];
    const want = branchesFor(depth);
    const usedAt = new Set();
    for (let tries = 0; tries < 60 && branches.length < want; tries++) {
      const i = randint(2, Math.max(2, path.length - 3));
      if (!straightAt(i) || usedAt.has(i)) continue;       // (one side passage from a cell: no crossroads)
      const along = [path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]];
      const d = choice([[-along[1], along[0]], [along[1], -along[0]]]);
      const n = randint(2, 4);
      const cells = [];
      let at = path[i]; let good = true;
      for (let k = 0; k < n; k++) {
        const c = [at[0] + d[0], at[1] + d[1]];
        if (!free(c, at)) { good = false; break; }
        cells.push(c); at = c;
        open.add(key(c[0], c[1]));     // (added as it goes: the next cell checks against it)
      }
      if (!good || cells.length < 2) { for (const c of cells) open.delete(key(c[0], c[1])); continue; }
      branches.push(cells);
      usedAt.add(i);
    }
    // Bombs: on straight stretches of the way (never at a bend, the start or the hole's
    // last cells, where they could not be passed), and at the far ends of side passages;
    // never two side by side.
    const spots = [];
    for (let i = 3; i < path.length - 2; i++) if (straightAt(i) && Math.abs(path[i][0]) + Math.abs(path[i][1]) >= 3) spots.push(path[i]);
    for (const br of branches) { const e = br[br.length - 1]; if (Math.abs(e[0]) + Math.abs(e[1]) >= 3) spots.push(e); }
    const bombs = [];
    const nBombs = bombsFor(depth);
    const pool = spots.slice();
    while (bombs.length < nBombs && pool.length) {
      const c = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      if (bombs.some((b) => Math.abs(b[0] - c[0]) + Math.abs(b[1] - c[1]) < 2)) continue;
      bombs.push(c);
    }
    // A credit, two times in three: at the end of a side passage with no bomb (a reward for
    // looking), or else midway along the way.
    let credit = null;
    if (rand() < VC_CREDIT_CHANCE) {
      const ends = branches.map((br) => br[br.length - 1]).filter((c) => !bombs.some((b) => b[0] === c[0] && b[1] === c[1]));
      if (ends.length) credit = choice(ends);
      else {
        const mid = path.slice(2, -2).filter((c) => !bombs.some((b) => Math.abs(b[0] - c[0]) + Math.abs(b[1] - c[1]) < 2));
        if (mid.length) credit = choice(mid);
      }
    }
    return { open, path, hole, branches, bombs, credit };
  }
  // (Never in practice: a short straight passage always fits.)
  const open = new Set(); const path = [];
  for (let i = 0; i <= 5; i++) { open.add(key(0, -i)); path.push([0, -i]); }
  return { open, path, hole: [0, -5], branches: [], bombs: [], credit: null };
}

// ------------------------------------------------------------------ the game's methods
const mixin = {
  startVolcanic() {
    this.state = STATE;
    this.resetGameState();
    this.state = STATE;
    this._syncRoom();
    this._wake(true);
    if (this.ambienceChannel) { this.ambienceChannel.stop(); this.ambienceChannel = null; }
    if (this.beatChannel) { this.beatChannel.stop(); this.beatChannel = null; }
    this.vc = null;
    this._face(0, true);
    this.timeLeft = VC_START_TIME;
    this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / this._announceStep()) * this._announceStep();
    this.thirtySecAnnounced = this.timeLeft <= 30.0;
    this.lastBeepSecond = -1;
    this._vcBegin({ chaos: false, depth: 1 });
    this.tts.speak('Volcanic Caves. Two minutes.', { interrupt: true });
  },

  // A cave: a run's next level down, or a Chaos level (`holes` to reach there).
  _vcBegin({ chaos, depth, holes = 0, adopt = null }) {
    const prev = this.vc;
    const keep = prev ? { air: prev.air, lava: prev.lava, engine: prev.engine, band: prev.band } : null;
    if (prev) this._vcSilence(prev, false);
    this.vcNames = new Map(this._vcNames());
    for (const [stem, name] of this.vcNames) if (name) this.audio.prepare(name, `volcanic:${stem}`);
    const lay = layCave(depth);
    // The cave is laid out ahead of you: the way you face, to the nearest main direction.
    const k = mainOf(this.tn ? this.tn.face : 0);
    const T = (c) => turnCell(c, k);
    const open = new Set([...lay.open].map((q) => { const [x, y] = q.split(',').map(Number); const [a, b] = T([x, y]); return key(a, b); }));
    const vc = this.vc = {
      run: this.runId, chaos, depth, holes, reached: prev && prev.chaos === chaos ? prev.reached : 0,
      open, hole: T(lay.hole), start: [0.0, 0.0], startFace: this.tn ? this.tn.face : 0,
      bombs: lay.bombs.map((c) => ({ cell: T(c), pos: this._vcPos(T(c)), t: rand() * VC_TICK_EVERY })),
      credit: null,
      speed: 0.0, throttle: !!(prev && prev.throttle), touching: false, rockT: 0,
      beepT: 0, drop: null, boom: null, done: false,
      air: keep ? keep.air : null, lava: keep ? keep.lava : null,
      engine: keep ? keep.engine : null, band: keep ? keep.band : -1,
      deepest: Math.max(depth, prev ? prev.deepest || 0 : 0),
      path: lay.path.map(T),
    };
    if (lay.credit && !chaos) {      // (no time credits in Chaos's caves)
      let r = rand(); let i = 0;
      while (i < VC_CREDIT_VALUES.length - 1 && r >= VC_CREDIT_WEIGHTS[i]) { r -= VC_CREDIT_WEIGHTS[i]; i += 1; }
      vc.credit = { cell: T(lay.credit), pos: this._vcPos(T(lay.credit)), value: VC_CREDIT_VALUES[i],
        beacon: VC_CREDIT_BEACONS[i], pickup: VC_CREDIT_PICKUPS[i], voice: null };
    }
    this.playerPos = [0.0, 0.0];
    this.arenaLimit = 1e9;
    this.stride = null;
    this._vcBackground(adopt);
    this._vcEngine();
  },

  // The recordings the mode plays: the pack's own where it has them, the stand-ins until then.
  _vcNames() {
    const a = this.audio;
    const pick = (name) => {
      if (a.has(name)) return name;
      for (const st of VC_STAND_INS[name] || []) {
        if (a.has(st)) return st;
        const al = aliasRecording(a, st, `event_sfx_file_${st}`);
        if (al) return al;
      }
      return null;
    };
    return VC_RECORDINGS.map((n) => [n, pick(n)]);
  },

  _vcName(stem) {
    if (!this.vcNames) this.vcNames = new Map(this._vcNames());
    return this.vcNames.get(stem) || null;
  },

  // The cave's air and the lava, both all round you; the lava louder the deeper you are.
  _vcBackground(adopt = null) {
    const vc = this.vc;
    const air = this._vcName(VC_AIR);
    if (!(vc.air && vc.air.busy)) {
      if (adopt && adopt.busy && adopt.name === air) { vc.air = adopt; vc.air.setVolume(VC_AIR_LEVEL); }
      else {
        if (adopt) adopt.fadeout(400);
        vc.air = air ? this.audio.play(air, { loops: -1, volume: VC_AIR_LEVEL, fadeMs: 400, send: BACKGROUND_SEND }) : null;
      }
    }
    const lava = this._vcName(VC_LAVA);
    const level = lavaLevel(vc.depth);
    if (vc.lava && vc.lava.busy) vc.lava.setVolume(level);
    else vc.lava = lava ? this.audio.play(lava, { loops: -1, volume: level, fadeMs: 600, send: BACKGROUND_SEND }) : null;
  },

  // A cell's middle in the world, and whether it is open (passage, not rock).
  _vcPos([x, y]) { return [x * VC_CELL, y * VC_CELL]; },
  _vcCellOf(p) { return [Math.round(p[0] / VC_CELL), Math.round(p[1] / VC_CELL)]; },
  _vcOpenAt(p) { const c = this._vcCellOf(p); return !!(this.vc && this.vc.open.has(key(c[0], c[1]))); },

  // How loud a thing is from where you are: [left, right, distance] (as the battle's levels,
  // over a range of its own; never quieter than `floor`, however far off).
  _vcLevels(pos, gain, range, floor = 0) {
    const dx = pos[0] - this.playerPos[0]; const dy = pos[1] - this.playerPos[1];
    const d = Math.hypot(dx, dy);
    const pan = d > 0 ? dx / d : 0.0;
    const v = Math.min(1.0, Math.max(floor, 1.0 - d / range) * gain);
    return [v * (1.0 - Math.max(0.0, pan)), v * (1.0 - Math.max(0.0, -pan)), d];
  },

  // A one-shot from a place: in 3D sound, played at that place; otherwise panned.
  _vcShot(name, pos, l, r) {
    if (!name) return;
    const level = Math.max(l, r);
    if (level <= 0.005) return;
    if (this.audio.binaural) this.audio.play(name, { at: pos, volume: level });
    else {
      const ch = this.audio.play(name);
      if (ch) ch.setVolume(l, r, this._behind(pos));
    }
  },

  // ---------------------------------------------------------------- the engine
  // The Driving engine's loops, one per speed band, each blended into the next.
  _vcEngine() {
    const vc = this.vc;
    if (!vc) return;
    const frac = vc.speed / VC_MAX_SPEED;
    const last = VC_ENGINE_BANDS - 1;
    const pos = frac * last;
    let band = vc.band;
    if (band < 0 || pos > band + 0.75 || pos < band - 0.75) band = Math.max(0, Math.min(last, Math.round(pos)));
    const vol = VC_ENGINE_LEVEL[0] + VC_ENGINE_LEVEL[1] * frac;
    if (band !== vc.band || !(vc.engine && vc.engine.busy)) {
      const old = vc.engine;
      if (old) old.fadeout(VC_ENGINE_BLEND);
      vc.band = band;
      vc.engine = this.audio.has(`engine_${band}`) ? this.audio.play(`engine_${band}`, { loops: -1, volume: vol }) : null;
    } else if (vc.engine) vc.engine.setVolume(vol);
  },

  // ---------------------------------------------------------------- one frame
  updateVolcanic(dt) {
    const vc = this.vc;
    if (!vc || this.isPaused || vc.done) return;
    vc.rockT = Math.max(0, vc.rockT - dt);
    if (vc.drop) { this._vcUpdateDrop(dt); return; }
    if (vc.boom) {
      vc.boom.t -= dt;
      if (this._advanceTimer(dt)) return;       // (the clock runs on: Russell)
      if (vc.boom.t <= 0) this._vcBackToStart();
      this._vcTicks(dt);
      this._vcHoleBeacon(dt);
      return;
    }
    if (this._advanceTimer(dt)) return;
    if (this.state !== STATE || this.vc !== vc) return;
    this._vcDrive(dt);
    if (this.vc !== vc || vc.drop || vc.boom) return;
    this._vcTicks(dt);
    this._vcHoleBeacon(dt);
    this._vcCredit();
  },

  // The car: the throttle, coasting, and a step of the way it faces; rock stops it.
  _vcDrive(dt) {
    const vc = this.vc;
    if (vc.throttle) vc.speed = Math.min(VC_MAX_SPEED, vc.speed + VC_ACCEL * dt);
    else vc.speed = Math.max(0.0, vc.speed - VC_COAST * dt);
    this._vcEngine();
    if (vc.speed <= 0) return;
    const f = this._forward();
    const from = this.playerPos;
    const res = this._vcStep(from, f, vc.speed * dt);
    if (res.hit && res.moved <= 1e-6) {
      // Straight into the rock: a thud, and the car stops. No time is lost.
      if (vc.rockT <= 0) {
        const at = [from[0] + f[0] * 2.0, from[1] + f[1] * 2.0];
        const [l, r] = this._vcLevels(at, VC_ROCK_GAIN, 30.0, 0.5);
        this._vcShot(this._vcName(VC_ROCK), at, l, r);
        vc.rockT = VC_ROCK_GAP;
      }
      vc.speed = 0.0;
      vc.touching = true;
      this._vcEngine();
      return;
    }
    if (res.hit && !vc.touching && vc.rockT <= 0) {
      // Glancing along the rock: a softer knock, and the car slides on along it.
      const at = [res.hit[0], res.hit[1]];
      const [l, r] = this._vcLevels(at, VC_GLANCE_GAIN, 30.0, 0.5);
      this._vcShot(this._vcName(VC_ROCK), at, l, r);
      vc.rockT = VC_ROCK_GAP;
    }
    vc.touching = !!res.hit;
    this.playerPos = res.pos;
    // Driving squarely along a passage (facing straight down it, not touching the rock), the car
    // keeps to the middle of it, so it meets a bomb head on unless you steer past: turn a little
    // toward a wall and slide along the rock (VC_CENTRE_PULL).
    if (!res.hit) {
      const k = mainIndex(this.tn ? this.tn.face : 0);
      if (k >= 0) {
        const axis = k % 2 === 0 ? 0 : 1;            // facing north or south: keep to the middle across x
        const c = this._vcCellOf(this.playerPos);
        const mid = c[axis] * VC_CELL;
        const off = this.playerPos[axis] - mid;
        const pull = Math.min(Math.abs(off), VC_CENTRE_PULL * dt);
        const p = this.playerPos.slice(); p[axis] -= Math.sign(off) * pull; this.playerPos = p;
      }
    }
    this._vcBombCheck();
    if (this.vc !== vc || vc.boom) return;
    // The hole is reached by driving into its stretch of passage (wherever across it you are).
    const here = this._vcCellOf(this.playerPos);
    if (here[0] === vc.hole[0] && here[1] === vc.hole[1]) this._vcIntoHole();
  },

  // A frame's worth of driving: straight on if the way is open; against the rock at a slant,
  // the part of it along the rock (the car slides along the wall, `hit` set); straight into
  // the rock, nowhere (moved 0). (walkStep, the walking modes' step, glides only a whole
  // step's worth, and a frame's is far smaller.)
  _vcStep(from, f, len) {
    const res = walkStep(from, f, len, (p) => this._vcOpenAt(p), (p) => this._vcCellOf(p), (x, y) => this._vcPos([x, y]), VC_CELL);
    if (!res.hit || res.moved > 1e-6) return res;
    const vx = f[0] * len; const vy = f[1] * len;
    const parts = Math.abs(vx) >= Math.abs(vy) ? [[vx, 0], [0, vy]] : [[0, vy], [vx, 0]];
    for (const [sx, sy] of parts) {
      const part = Math.abs(sx) + Math.abs(sy);
      if (part < 0.25 * len) continue;          // (square on to the rock: no sliding)
      const to = [from[0] + sx, from[1] + sy];
      if (this._vcOpenAt(to)) return { pos: to, moved: part, hit: res.hit };
    }
    return res;
  },

  // ---------------------------------------------------------------- bombs
  // Each bomb ticks twice a second, from where it lies; only the nearest few are heard.
  _vcTicks(dt) {
    const vc = this.vc;
    const name = this._vcName(VC_TICK);
    const near = vc.bombs.map((b) => [b, Math.hypot(b.pos[0] - this.playerPos[0], b.pos[1] - this.playerPos[1])])
      .sort((a, b) => a[1] - b[1]).slice(0, VC_TICK_HEARD).map(([b]) => b);
    for (const b of vc.bombs) {
      b.t -= dt;
      if (b.t > 0) continue;
      b.t += VC_TICK_EVERY;
      if (b.t <= 0) b.t = VC_TICK_EVERY;
      if (!near.includes(b)) continue;
      const [l, r, d] = this._vcLevels(b.pos, VC_TICK_GAIN, VC_TICK_RANGE);
      if (d < VC_TICK_RANGE) this._vcShot(name, b.pos, l, r);
    }
  },

  // Driven into head on: it goes off. Brushing past (further from its middle) does nothing.
  _vcBombCheck() {
    const vc = this.vc;
    if (vc.speed < VC_BOMB_MIN_SPEED) return;
    const b = vc.bombs.find((q) => Math.hypot(q.pos[0] - this.playerPos[0], q.pos[1] - this.playerPos[1]) < VC_BOMB_HIT);
    if (!b) return;
    vc.bombs = vc.bombs.filter((q) => q !== b);     // (a bomb that has gone off is gone)
    const boom = this._vcName(VC_BOOM);
    if (boom) this.audio.play(boom, { volume: 1.0, keep: true });
    vc.speed = 0.0;
    vc.throttle = false;
    this._vcEngine();
    if (vc.chaos) {
      // In Chaos: health and time, and you drive on from where you are.
      this.timeLeft = Math.max(0, this.timeLeft - VC_CHAOS_BOMB_TIME);
      if (this._chaosHurt(VC_CHAOS_BOMB_HEALTH, 'bomb')) return;
      if (this.timeLeft <= 0) { this.triggerGameOver(); return; }
      return;
    }
    vc.boom = { t: VC_BOOM_HOLD };
  },

  // After an explosion: back to the start of this cave, facing as it began. The clock ran on.
  _vcBackToStart() {
    const vc = this.vc;
    vc.boom = null;
    this.playerPos = [vc.start[0], vc.start[1]];
    this._face(vc.startFace, true);
    vc.speed = 0.0;
    vc.touching = false;
    this._vcEngine();
  },

  // ---------------------------------------------------------------- the hole
  // Its beeps: from where it is, faster and higher the nearer you are (the labyrinth's exit).
  _vcHoleBeacon(dt) {
    const vc = this.vc;
    vc.beepT -= dt;
    if (vc.beepT > 0) return;
    const pos = this._vcPos(vc.hole);
    const [l, r, d] = this._vcLevels(pos, VC_HOLE_GAIN, VC_HOLE_RANGE, VC_HOLE_FLOOR);
    const cells = d / VC_CELL;
    vc.beepT = Math.max(0.15, cells * 0.05);
    const pitch = Math.max(0, Math.min(19, 19 - Math.trunc(cells)));
    if (this.audio.has('prox_' + pitch)) this._vcShot('prox_' + pitch, pos, l, r);
  },

  _vcIntoHole() {
    const vc = this.vc;
    const pos = this._vcPos(vc.hole);
    const pop = this._vcName(VC_POP);
    if (pop) this.audio.play(pop, { at: this.audio.binaural ? pos : null, volume: 1.0, keep: true });
    vc.speed = 0.0;
    this._vcEngine();
    vc.drop = { t: VC_DROP_TIME, landed: false };
    vc.reached += 1;
  },

  // The drop: the pop, then the landing, then the next cave down. The clock waits.
  _vcUpdateDrop(dt) {
    const vc = this.vc;
    vc.drop.t -= dt;
    if (!vc.drop.landed && vc.drop.t <= VC_DROP_TIME - VC_LAND_AT) {
      vc.drop.landed = true;
      const land = this._vcName(VC_LAND);
      if (land) this.audio.play(land, { volume: 0.9, keep: true });
    }
    if (vc.drop.t > 0) return;
    vc.drop = null;
    if (vc.chaos && vc.reached >= vc.holes) {
      vc.done = true;
      this.nextLevel();       // (chaos.js _chaosNextLevel: ten points and ten health)
      return;
    }
    this._vcBegin({ chaos: vc.chaos, depth: vc.depth + 1, holes: vc.holes });
  },

  // ---------------------------------------------------------------- the credit
  _vcCredit() {
    const vc = this.vc;
    const c = vc.credit;
    if (!c) return;
    if (!(c.voice && c.voice.busy)) c.voice = this.audio.has(c.beacon) ? this.audio.play(c.beacon, { loops: -1, volume: 0.0 }) : null;
    const [l, r] = this._vcLevels(c.pos, VC_CREDIT_GAIN, VC_CREDIT_RANGE, VC_CREDIT_FLOOR);
    if (c.voice) c.voice.setVolume(l, r, this._behind(c.pos));
    const here = this._vcCellOf(this.playerPos);
    if (here[0] !== c.cell[0] || here[1] !== c.cell[1]) return;     // (taken by driving into its stretch of passage)
    if (c.voice) c.voice.stop();
    vc.credit = null;
    this.timeLeft += c.value;
    this.thirtySecAnnounced = this.timeLeft <= 30.0;
    const step = this._announceStep();
    this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / step) * step;
    this.lastBeepSecond = -1;
    if (this.audio.has(c.pickup)) this.audio.play(c.pickup, { keep: true });
  },

  // ---------------------------------------------------------------- reports and stopping
  // Double tap: the level (no voice says it otherwise), the clock and the way you face; in
  // Chaos, the cave you are in of those wanted, then health, the clock and the points.
  _vcReport() {
    const vc = this.vc;
    if (!vc) return;
    // (In Chaos: the cave you are in, of the caves the level asks for, said in Bella's
    // recorded words: "Level 1 of 2.")
    if (vc.chaos) { this._report(`Level ${Math.min(vc.reached + 1, vc.holes)} of ${vc.holes}.`, true); return; }
    this._report(`Level ${vc.depth}.`, true);
  },

  _vcBrake() {
    const vc = this.vc;
    if (!vc || vc.drop) return;
    vc.speed = Math.max(0.0, vc.speed - VC_BRAKE);
    if (this.audio.has('brake') && vc.speed > 0) this.audio.play('brake', { volume: 0.5 });
    this._vcEngine();
  },

  // Everything of a cave stopped (`all`: the air, the lava and the engine too).
  _vcSilence(vc, all = true) {
    if (vc.credit && vc.credit.voice) { vc.credit.voice.stop(); vc.credit.voice = null; }
    if (all) {
      for (const k of ['air', 'lava', 'engine']) if (vc[k]) { vc[k].stop(); vc[k] = null; }
    }
  },

  _vcStopAll() {
    const vc = this.vc;
    if (!vc) return;
    this._vcSilence(vc, true);
    vc.done = true;
    for (const stem of VC_RECORDINGS) this.audio.pins.delete(`volcanic:${stem}`);
  },
};

// ------------------------------------------------------------------ help
const HELP_SECTIONS = [
  ['Volcanic Caves', [
    { title: 'Volcanic Caves', sound: null, desc: 'Volcanic Caves is a mode of its own inside Driving, new in 8.2.0: choose Driving Mode on the main menu, then Volcanic Caves. Inspired by Roller Ball in Sonar Islands, you drive down through volcanic caves toward the centre of the Earth. Each level is one cave of rock passages, one passage wide, that twist and branch. Somewhere in it is the hole down to the next level, and it beeps from where it is, faster and higher the nearer you are, like a labyrinth\'s exit. Drive into it: you hear it pop, you drop, and you land in the next cave down. No voice tells you the level: double tap for it, with the clock and the way you are facing. The lava is all around you and never touches you, but it grows louder the deeper you go, as in Escape the Cave.' },
    { title: 'Volcanic Caves Driving and Turning', sound: null, desc: 'You drive as in Driving Mode: slide one finger up and keep it down to accelerate, and slide that finger back down, or swipe down, to brake. But here the cave turns with you, as when you walk. To turn, lift the accelerating finger first, then flick left or right for one small turn of 30 degrees, or slide left or right and keep your finger down to keep turning until you lift it. The car coasts while your finger is up, slowing a little, so turn, then accelerate again. On a keyboard, hold the up arrow to accelerate, press or hold the left and right arrows to turn, and press the down arrow to brake. The ticks for north, east, south and west help you count your turns. Each new cave is laid out ahead of the way you face, to the nearest of north, east, south and west.' },
    { title: 'Volcanic Caves Walls and Bombs', sound: null, desc: 'Drive straight into the rock and the car stops with a thud. That costs no time: turn, and drive on. If you only glance along a wall, a softer knock tells you so, and the car slides on along it. Ticking bombs lie in the passages, each ticking twice a second from where it lies; you hear the nearest three. A bomb goes off only if you drive into it head on. Then the cave shakes, and a moment later you are back at the start of that cave, facing as you began it, and the clock keeps running. Brushing past one does nothing: when a bomb ticks straight ahead, turn a little toward a wall and let the car slide along the rock past it, then turn back. A bomb that has gone off is gone. Deeper caves have more bombs.' },
    { title: 'Volcanic Caves Clock and Score', sound: null, desc: 'You start with two minutes, and the run ends only when the time runs out. Time credits worth 10, 20 or 30 seconds lie in about two caves in three, often at the far end of a side passage, marked by the spinning credit beacon, higher and faster the more it is worth. Drive onto one to take it, and the coins tell you which you got. The clock waits while you drop down a hole. Each cave deeper has the hole farther away, twistier passages and more bombs, but the credits stay the same. Your score is the deepest level you reach, and Volcanic Caves has its own high score board, right after Driving\'s.' },
    { title: 'Volcanic Caves in Chaos Mode', sound: null, desc: 'Chaos Mode has Volcanic Caves levels too: you know one by the bubbling of the volcanic cave, the lava, your engine, and the ticking of bombs. There you must reach the hole two times in your first Volcanic level of a run, one more for each such level after, up to five, each hole dropping you into a new cave. A bomb there costs 20 health and 15 seconds instead of sending you back, and you drive on from where you are. The chaos clock keeps running, but waits while you drop. There are no time credits in these levels. Double tap for the cave you are in and how many the level asks for, such as Level 1 of 2, then your health, the clock and the points.' },
  ]],
];

const HELP_DEMOS = [
  ['Demos, Volcanic Caves', [
    { title: 'Volcanic Caves Demos', sound: null, desc: 'The sounds of Volcanic Caves.' },
    { title: 'Volcanic Cave Air', sound: VC_AIR, desc: 'The bubbling air of a volcanic cave, heard all through it.' },
    { title: 'Lava', sound: VC_LAVA, desc: 'The lava around the caves: faint at first, louder the deeper you go.' },
    { title: 'Bomb Ticking', sound: VC_TICK, desc: 'One tick of a bomb. Each bomb ticks twice a second.' },
    { title: 'Explosion', sound: VC_BOOM, desc: 'A bomb you drove into head on.' },
    { title: 'Rock Wall', sound: VC_ROCK, desc: 'The car driving into the rock.' },
    { title: 'Into the Hole', sound: VC_POP, desc: 'The car dropping into the hole.' },
    { title: 'Landing Below', sound: VC_LAND, desc: 'Landing in the next cave down.' },
  ]],
];

// ------------------------------------------------------------------ the mode
export default {
  menu: [],                                    // (reached from Driving's menu: driving.js)
  statKey: BOARD,
  playStates: [STATE],
  mixin,
  init(game) { game.vc = null; },
  reset(game) { if (game.vc) game._vcStopAll(); game.vc = null; },
  update(game, dt) { game.updateVolcanic(dt); },
  // Whenever the cave is not being driven (paused, help, the quit question) the gestures
  // let go of the throttle without a word, so the game lets go of it too (as Driving).
  tick(game) { if ((game.state !== STATE || game.isPaused) && game.vc) game.vc.throttle = false; },
  input(game, g) {
    const vc = game.vc;
    if (!vc) return;
    if (g === 'accel_on') { vc.throttle = true; return; }
    if (g === 'accel_off') { vc.throttle = false; return; }
    if (g === 'clock') { const secs = Math.trunc(game.timeLeft); game.tts.speak(`${secs} second${s(secs)} remaining.`); return; }
    if (g === 'enter') { game._vcReport(); return; }
    if (vc.drop) return;
    if (g === 'left' || g === 'right') { game._turnQuick(g === 'right' ? 1 : -1); return; }
    if (g === 'down') game._vcBrake();
  },
  stopAll(game) { if (game.vc) game._vcStopAll(); },
  finish(game) {
    const n = game.vc ? game.vc.deepest || game.vc.depth : 1;
    return { key: BOARD, score: n, message: `Time up. You reached level ${n} of the volcanic caves. ` };
  },
  room() { return VC_ROOM; },
  turns(game) { return game.state === STATE && !!game.vc && !game.vc.drop; },
  // (The drop does not turn, but keeps the way you faced: the next cave is laid out ahead of it.)
  keepFacing(game) { return game.state === STATE && !!(game.vc && game.vc.drop); },
  gestureMode() { return 'drive'; },
  // The echo is tighter where the rock is close, and leans toward the side it is on (as a
  // labyrinth's: game.js _labSurroundings), so the passage can be heard round you.
  surroundings(game, pos) {
    const vc = game.vc;
    if (!vc) return [1.0, 0.0];
    const p = pos || game.playerPos;
    const [cx, cy] = game._vcCellOf(p);
    const rock = (x, y) => !vc.open.has(key(x, y));
    let around = 0;
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) if ((dx || dy) && rock(cx + dx, cy + dy)) around += 1;
    const near = Math.min(1.0, around / 6.0);
    const gain = 0.85 + (1.2 - 0.85) * near;
    const wl = rock(cx - 1, cy); const wr = rock(cx + 1, cy);
    return [gain, wl && !wr ? -0.2 : wr && !wl ? 0.2 : 0.0];
  },
  status(game) {
    const vc = game.vc;
    if (!vc) return 'Volcanic Caves.';
    return `Volcanic Caves. Level ${vc.depth}. Time ${Math.max(0, Math.trunc(game.timeLeft))}s. Speed ${Math.trunc(vc.speed)}.`;
  },
  boards: [{ key: BOARD, label: 'Volcanic Caves', fmt: (v) => `Level ${v}` }],
  help: { sections: HELP_SECTIONS, demos: HELP_DEMOS },
};
