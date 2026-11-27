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
// Each level is one cave: a wide open cavern with no walls inside it (8.2.0, Russell, 27
// November 2026: "no walls in the cave; the bombs are the only thing you have to avoid; the
// only wall is the edge"). Somewhere in it is the hole down to the next level. It beeps from where it is, faster
// and higher the nearer you are, like a labyrinth's exit. Drive into it: a pop, a drop,
// and you land in the next cave down. Nothing says the level; a double tap does.
//
// Ticking bombs lie about the cavern, each ticking like a clock, twice a second (tick, tock).
// One explodes only if you drive into it head on: then you are back at the start of that
// cave, and the clock runs on. Brushing past one does nothing: steer round it. The cavern's
// edge is its only wall: it stops the car with a thud of rock, and costs no time: turn, and
// drive on. Glancing along it, the car slides along it with a softer knock.
//
// The lava is all around you, never touching you: Escape the Cave's lava ("Cauldron
// Boiling"), growing louder the deeper you go, exactly as that game raises it (lavaLevel).
//
// The clock: two minutes to start, with time credits of 10, 20 and 30 seconds lying in
// the caves, each marked by coins clinking, quietly, from where it lies (8.2.1, Russell: the
// game's credit beacons were far too loud here; 8.2.2, his pick after keys jingling). The run
// ends only when the time runs out. Deeper caves have more bombs, the hole farther away,
// and more bombs on the way to it; the credits stay the same at every depth. The score is the
// deepest level reached, on Volcanic Caves' own high score board.
//
// Chaos Mode has Volcanic Caves levels too (js/modes/chaos.js): reach the hole a set number
// of times (VC_CHAOS_HOLES); a bomb costs health and time there instead of a restart.
//
// The sounds: the cave's own bubbling air, the lava, the bombs' clock ticking and explosion, the
// rock, the pop and the landing (Pixabay, web-only, in the volcanic pack;
// tools/volcanic/make_sounds.py names each one), the Driving engine, the game's proximity
// beeps for the hole, the events' clinking coins for a credit, and the game's coins. Should a recording ever be
// missing, the game's nearest sound stands in for it (VC_STAND_INS).

import { aliasRecording } from './events/sounds.js';
import { AMBIENCE_LEVEL, BACKGROUND_SEND } from './ultimate.js';
import { wrapAngle, QUARTER } from '../turning.js';

export const STATE = 'volcanic';
export const BOARD = 'volcanic';

// ------------------------------------------------------------------ constants
export const VC_STEP = 6.0;                    // one stretch of cave, in the game's units: the hole's beeps count them
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
export const VC_CREDIT_PICKUPS = ['credit_10', 'credit_20', 'credit_30'];
export const VC_CREDIT_NEAR = [10, 22];         // units from where you start (8.2.3: near you; until then anywhere in the cavern)
// (8.2.0, Russell, 27 November 2026: the credit beacons were far too loud.) A credit is marked
// instead by coins clinking, "Clinking Coins 8" (the events' evt_coins; 8.2.2, Russell's pick of
// four, after he did not take to 8.2.1's keys jingling, evt_keys_jingle), from where it lies, once
// every VC_JINGLE_EVERY seconds, quieter than a beacon. The pickup coins still tell what it was worth.
export const VC_JINGLE = 'evt_coins';
export const VC_JINGLE_EVERY = 1.8;
export const VC_CREDIT_GAIN = 0.5;
export const VC_CREDIT_RANGE = 90.0;
export const VC_CREDIT_FLOOR = 0.08;
export const VC_REACH = 3.0;                   // units: this close to the hole or a credit, and you have it
// The cave's layout, by depth (level 1 the first cave): an open square cavern, bigger every level,
// you landing somewhere in it and the hole any way from you, near or far (layCave, 8.2.6). Deeper
// caves have more bombs, most of them on the way to the hole.
export const VC_HOLE_DIST = [40, 8, 200];      // units: the depth's distance to the hole (8.2.6: the hole is 12 units to 1.4 times this away)
export function holeDistFor(depth) { return Math.min(VC_HOLE_DIST[2], VC_HOLE_DIST[0] + VC_HOLE_DIST[1] * Math.max(0, depth - 1)); }
export const VC_EDGE_PAST = 24;                // units of cavern beyond the hole, and at least this round you
// Bombs (8.2.4, Russell, 27 November 2026): one in the first cave; then as many as the level, or
// one more, at random (level 2: two or three; level 5: five or six), at most twenty. (8.2.1 to
// 8.2.3: three in the first cave, one more every level.)
export const VC_BOMBS_MAX = 20;
export function bombsFor(depth, r = rand()) { return depth <= 1 ? 1 : Math.min(VC_BOMBS_MAX, depth + (r < 0.5 ? 0 : 1)); }
export const VC_ON_THE_WAY = 0.6;              // of them lie on the way to the hole (within VC_WAY_WIDE of the line)
export const VC_WAY_WIDE = 5.0;
export const VC_BOMB_APART = 14.0;             // never closer together than this (8.2.5, Russell: spread out much more; was 5)
export const VC_BOMB_CLEAR = 12.0;             // never this close to where you start, nor VC_HOLE_CLEAR to the hole
export const VC_HOLE_CLEAR = 6.0;
export const VC_TICK_EVERY = 0.5;              // seconds between a bomb's ticks, from the edge of hearing (8.2.0: always)
// (8.2.3, Russell, 27 November 2026: the clocks must actually tick faster.) A bomb ticks faster
// the closer you are: every VC_TICK_EVERY seconds at the edge of hearing (VC_TICK_RANGE),
// quickening steadily to every VC_TICK_FASTEST right before you would drive into it.
export const VC_TICK_FASTEST = 0.12;
export function tickEvery(d) {
  const t = Math.min(1, Math.max(0, (d - VC_BOMB_HIT) / (VC_TICK_RANGE - VC_BOMB_HIT)));
  return VC_TICK_FASTEST + (VC_TICK_EVERY - VC_TICK_FASTEST) * t;
}
export const VC_TICK_GAIN = 0.8;
export const VC_TICK_RANGE = 48.0;             // eight stretches of cave
export const VC_TICK_HEARD = 3;                // the nearest this many bombs tick; the rest are silent until nearer (fewer placed sounds at once: the static)
export const VC_BOMB_HIT = 2.0;                // units: closer than this to a bomb's middle is driving into it head on
export const VC_BOMB_MIN_SPEED = 0.5;          // (standing still, or creeping slower, never sets one off)
export const VC_BOOM_HOLD = 1.6;               // seconds after an explosion before you are back at the start
// The hole's beacon: the labyrinth exit's proximity beeps (prox_0 to prox_19), measured in
// stretches of cave (VC_STEP).
export const VC_HOLE_GAIN = 0.55;
export const VC_HOLE_FLOOR = 0.25;
export const VC_HOLE_RANGE = 240.0;
// (8.2.3, Russell's formula, 27 November 2026.) Reaching the hole puts time on the clock: 5 seconds
// for leaving the first cave, one more for every two levels deeper, 10 from level 11 on (deeper
// holes are farther away). In Chaos, 5 seconds for each hole, so Chaos does not give too much time.
export const VC_HOLE_BONUS = [5, 10];
export const VC_CHAOS_HOLE_BONUS = 5;
export function holeBonusFor(depth, chaos = false) {
  if (chaos) return VC_CHAOS_HOLE_BONUS;
  return Math.min(VC_HOLE_BONUS[1], VC_HOLE_BONUS[0] + Math.floor(Math.max(0, depth - 1) / 2));
}
export const VC_DROP_TIME = 1.6;               // seconds from the pop to the next cave (the clock waits)
export const VC_LAND_AT = 0.7;                 // seconds into the drop: the landing below
// The edge.
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
export const VC_TICK = 'vc_tick';              // a clock's tick ...
export const VC_TOCK = 'vc_tock';              // ... and its tock: a bomb ticks tick, tock, tick, tock
export const VC_BOOM = 'vc_boom';
export const VC_ROCK = 'vc_rock';
export const VC_POP = 'vc_pop';
export const VC_LAND = 'vc_land';
export const VC_ROOM = 'lab';                  // a cave's echo, tighter near the edge
export const VC_STAND_INS = {
  [VC_AIR]: ['lab_02_scary_cave'],
  [VC_LAVA]: ['evt_cauldron'],
  [VC_TICK]: ['ut_click'],
  [VC_TOCK]: [VC_TICK, 'ut_click'],
  [VC_BOOM]: ['crash', 'evt_explosion'],
  [VC_ROCK]: ['boundary'],
  [VC_POP]: ['evt_pop', 'menu_move'],
  [VC_LAND]: ['event_falling'],
};
export const VC_RECORDINGS = [VC_AIR, VC_LAVA, VC_TICK, VC_TOCK, VC_BOOM, VC_ROCK, VC_POP, VC_LAND];

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
// (8.2.5, Russell, 27 November 2026: twice as strong. Quite loud by level 15, and by level 20 so loud
// that the bombs and the hole are hard to hear, though never blotted out, and still rising, level
// after level, without end.) Twice 8.2.0 to 8.2.4's loudness: about 0.62 at level 15, 0.83 at 20,
// toward 1.9. A sound plays no louder than full, so past 1.0 a second copy of the lava joins the
// first, half a loop apart (VC_LAVA_TWIN, as the arena crowd's two copies).
export const VC_LAVA_STRENGTH = 2.0;
export function lavaLevel(level) { return VC_LAVA_STRENGTH * VC_LAVA_TOP * lavaVolume(level) / LAVA_CEILING; }
export const VC_LAVA_TWIN = 0.5;               // of the loop: where the second copy starts
export const VC_LAVA_LOOP = 19.4;              // seconds: the lava loop's length (tools/volcanic/make_sounds.py)
// And, as in Escape the Cave (beacon_volume), everything you listen for, the bombs, the hole and
// the credits, grows quieter as the lava grows louder: full on level 1, 35 percent from level 22
// (BEACON_VOLUME_FLOOR, BEACON_FLOOR_AT), so the deep caves' lava drowns out nearly everything.
export const VC_LISTEN_FLOOR = 0.35;
export const VC_LISTEN_FLOOR_AT = 22;
export function listenLevel(level) { return 1.0 - (1.0 - VC_LISTEN_FLOOR) * Math.min(1, Math.max(0, (level - 1) / (VC_LISTEN_FLOOR_AT - 1))); }

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
// A cave laid out around where you land (0, 0), in the game's units:
//   { bounds: [x0, y0, x1, y1], the cavern's edge on each side, hole: [x, y],
//     bombs: [[x, y]...], credit: [x, y] or null }
// No walls inside: only the edge. (8.2.6, Russell, 27 November 2026: you land somewhere different
// in each cave, sometimes right by the hole, sometimes far from it.) The hole lies any way from
// you, at a random distance from VC_HOLE_NEAREST to VC_HOLE_FARTHEST times the depth's distance
// (holeDistFor); the cavern is a square, as big as the depth makes it, placed at random round the
// two of you. The bombs reflect it: those on the way lie between you and the hole, so a hole close
// by has few or none in the way and the rest lie elsewhere in the cavern; a far hole has more.
// (8.2.1 to 8.2.5: you always began in the middle, the hole ahead of you at the depth's distance.)
export const VC_HOLE_NEAREST = 12;             // units: the closest the hole ever is
export const VC_HOLE_FARTHEST = 1.4;           // times holeDistFor(depth): the farthest
export const VC_EDGE_ROOM = 12;                // units: you and the hole are always this far inside the edge
export function layCave(depth) {
  const far = Math.max(VC_HOLE_NEAREST + 1, holeDistFor(depth) * VC_HOLE_FARTHEST);
  const d = VC_HOLE_NEAREST + rand() * (far - VC_HOLE_NEAREST);
  const a = rand() * Math.PI * 2;
  const hole = [Math.sin(a) * d, -Math.cos(a) * d];
  // The cavern: a square as big as the depth makes it (as 8.2.1 to 8.2.5's), placed at random so
  // that you and the hole both lie at least VC_EDGE_ROOM inside it.
  const side = 2 * (holeDistFor(depth) + VC_EDGE_PAST);
  const lo = [Math.min(0, hole[0]) - VC_EDGE_ROOM, Math.min(0, hole[1]) - VC_EDGE_ROOM];
  const hi = [Math.max(0, hole[0]) + VC_EDGE_ROOM, Math.max(0, hole[1]) + VC_EDGE_ROOM];
  const size = [Math.max(side, hi[0] - lo[0]), Math.max(side, hi[1] - lo[1])];
  const x0 = hi[0] - size[0] + rand() * (size[0] - (hi[0] - lo[0]));
  const y0 = hi[1] - size[1] + rand() * (size[1] - (hi[1] - lo[1]));
  const bounds = [x0, y0, x0 + size[0], y0 + size[1]];
  const inside = (p, m = 3) => p[0] >= bounds[0] + m && p[0] <= bounds[2] - m && p[1] >= bounds[1] + m && p[1] <= bounds[3] - m;
  const anywhere = (m) => [bounds[0] + m + rand() * (bounds[2] - bounds[0] - 2 * m), bounds[1] + m + rand() * (bounds[3] - bounds[1] - 2 * m)];
  const bombs = [];
  const fits = (p) => inside(p) && Math.hypot(p[0], p[1]) >= VC_BOMB_CLEAR
    && Math.hypot(p[0] - hole[0], p[1] - hole[1]) >= VC_HOLE_CLEAR
    && bombs.every((b) => Math.hypot(b[0] - p[0], b[1] - p[1]) >= VC_BOMB_APART);
  const n = bombsFor(depth);
  const onWay = Math.round(n * VC_ON_THE_WAY);
  const across = [Math.cos(a), Math.sin(a)];    // across the way to the hole
  // (Those on the way that cannot be fitted that far apart go elsewhere in the cavern.)
  let wayTries = 0;
  for (let tries = 0; tries < 4000 && bombs.length < n; tries++) {
    let p;
    if (bombs.length < onWay && wayTries++ < 600) {
      const t = 0.15 + rand() * 0.75; const off = (rand() * 2 - 1) * VC_WAY_WIDE;
      p = [hole[0] * t + across[0] * off, hole[1] * t + across[1] * off];
    } else p = anywhere(3);
    if (fits(p)) bombs.push(p);
  }
  // A credit, two times in three: near you (8.2.3, Russell: credits far away cost more time than
  // they give), VC_CREDIT_NEAR units from where you land, any way, not by a bomb or the hole.
  let credit = null;
  if (rand() < VC_CREDIT_CHANCE) {
    for (let tries = 0; tries < 400 && !credit; tries++) {
      const ang = rand() * Math.PI * 2;
      const r = VC_CREDIT_NEAR[0] + rand() * (VC_CREDIT_NEAR[1] - VC_CREDIT_NEAR[0]);
      const p = [Math.sin(ang) * r, -Math.cos(ang) * r];
      if (inside(p, 6) && bombs.every((b) => Math.hypot(b[0] - p[0], b[1] - p[1]) >= 6)
        && Math.hypot(p[0] - hole[0], p[1] - hole[1]) >= 8) credit = p;
    }
  }
  return { bounds, hole, bombs, credit };
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
    const keep = prev ? { air: prev.air, lava: prev.lava, lava2: prev.lava2, engine: prev.engine, band: prev.band } : null;
    if (prev) this._vcSilence(prev, false);
    this.vcNames = new Map(this._vcNames());
    for (const [stem, name] of this.vcNames) if (name) this.audio.prepare(name, `volcanic:${stem}`);
    const lay = layCave(depth);
    // (8.2.6: the hole may lie any way from you, so the cave is no longer turned to the way you face.)
    const vc = this.vc = {
      run: this.runId, chaos, depth, holes, reached: prev && prev.chaos === chaos ? prev.reached : 0,
      bounds: lay.bounds, hole: lay.hole, start: [0.0, 0.0], startFace: this.tn ? this.tn.face : 0,
      bombs: lay.bombs.map((c) => ({ pos: c, t: rand() * VC_TICK_EVERY, tock: rand() < 0.5 })),
      credit: null,
      speed: 0.0, throttle: !!(prev && prev.throttle), touching: false, rockT: 0,
      beepT: 0, drop: null, boom: null, done: false,
      air: keep ? keep.air : null, lava: keep ? keep.lava : null, lava2: keep ? keep.lava2 : null,
      engine: keep ? keep.engine : null, band: keep ? keep.band : -1,
      deepest: Math.max(depth, prev ? prev.deepest || 0 : 0),
    };
    if (lay.credit) {                // (Chaos's caves have them too: 8.2.0, Russell)
      let r = rand(); let i = 0;
      while (i < VC_CREDIT_VALUES.length - 1 && r >= VC_CREDIT_WEIGHTS[i]) { r -= VC_CREDIT_WEIGHTS[i]; i += 1; }
      vc.credit = { pos: lay.credit, value: VC_CREDIT_VALUES[i], pickup: VC_CREDIT_PICKUPS[i], jingleT: 0.3 };
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
    const one = Math.min(1.0, level); const two = Math.min(1.0, Math.max(0.0, level - 1.0));
    if (vc.lava && vc.lava.busy) vc.lava.setVolume(one);
    else vc.lava = lava ? this.audio.play(lava, { loops: -1, volume: one, fadeMs: 600, send: BACKGROUND_SEND }) : null;
    if (two > 0 && lava) {
      if (vc.lava2 && vc.lava2.busy) vc.lava2.setVolume(two);
      else {
        vc.lava2 = this.audio.play(lava, { loops: -1, volume: two, fadeMs: 600, send: BACKGROUND_SEND, offset: VC_LAVA_LOOP * VC_LAVA_TWIN });
      }
    } else if (vc.lava2) { vc.lava2.fadeout(300); vc.lava2 = null; }
  },

  // Whether a place is inside the cavern (the edge is its only wall).
  _vcInside(p) { const b = this.vc && this.vc.bounds; return !!b && p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]; },

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
    this._vcCredit(dt);
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
      // Straight into the edge: a thud of rock, and the car stops. No time is lost.
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
      // Glancing along the edge: a softer knock, and the car slides on along it.
      const at = [res.hit[0], res.hit[1]];
      const [l, r] = this._vcLevels(at, VC_GLANCE_GAIN, 30.0, 0.5);
      this._vcShot(this._vcName(VC_ROCK), at, l, r);
      vc.rockT = VC_ROCK_GAP;
    }
    vc.touching = !!res.hit;
    this.playerPos = res.pos;
    this._vcBombCheck();
    if (this.vc !== vc || vc.boom) return;
    if (Math.hypot(vc.hole[0] - this.playerPos[0], vc.hole[1] - this.playerPos[1]) < VC_REACH) this._vcIntoHole();
  },

  // A frame's worth of driving: straight on if it stays inside the cavern; at the edge at a
  // slant, the part of it along the edge (the car slides along it, `hit` set); straight at the
  // edge, nowhere (moved 0).
  _vcStep(from, f, len) {
    const to = [from[0] + f[0] * len, from[1] + f[1] * len];
    if (this._vcInside(to)) return { pos: to, moved: len, hit: null };
    const b = this.vc.bounds;
    const hit = [Math.max(b[0], Math.min(b[2], to[0])), Math.max(b[1], Math.min(b[3], to[1]))];
    const vx = f[0] * len; const vy = f[1] * len;
    const parts = Math.abs(vx) >= Math.abs(vy) ? [[vx, 0], [0, vy]] : [[0, vy], [vx, 0]];
    for (const [sx, sy] of parts) {
      const part = Math.abs(sx) + Math.abs(sy);
      if (part < 0.25 * len) continue;          // (square on to the edge: no sliding)
      const p = [from[0] + sx, from[1] + sy];
      if (this._vcInside(p)) return { pos: p, moved: part, hit };
    }
    return { pos: [from[0], from[1]], moved: 0, hit };
  },

  // ---------------------------------------------------------------- bombs
  // Each bomb ticks twice a second, from where it lies; only the nearest few are heard.
  _vcTicks(dt) {
    const vc = this.vc;
    const tick = this._vcName(VC_TICK); const tock = this._vcName(VC_TOCK) || tick;
    const near = vc.bombs.map((b) => [b, Math.hypot(b.pos[0] - this.playerPos[0], b.pos[1] - this.playerPos[1])])
      .sort((a, b) => a[1] - b[1]).slice(0, VC_TICK_HEARD).map(([b]) => b);
    for (const b of vc.bombs) {
      b.t -= dt;
      if (b.t > 0) continue;
      const every = tickEvery(Math.hypot(b.pos[0] - this.playerPos[0], b.pos[1] - this.playerPos[1]));
      b.t = Math.max(every * 0.5, b.t + every);  // (never two at once, after a long frame)
      b.tock = !b.tock;                         // tick, tock, tick, tock
      if (!near.includes(b)) continue;
      const [l, r, d] = this._vcLevels(b.pos, VC_TICK_GAIN * listenLevel(vc.depth), VC_TICK_RANGE);
      if (d < VC_TICK_RANGE) this._vcShot(b.tock ? tock : tick, b.pos, l, r);
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
    const pos = vc.hole;
    const [l, r, d] = this._vcLevels(pos, VC_HOLE_GAIN * listenLevel(vc.depth), VC_HOLE_RANGE, VC_HOLE_FLOOR);
    const cells = d / VC_STEP;
    vc.beepT = Math.max(0.15, cells * 0.05);
    const pitch = Math.max(0, Math.min(19, 19 - Math.trunc(cells)));
    if (this.audio.has('prox_' + pitch)) this._vcShot('prox_' + pitch, pos, l, r);
  },

  _vcIntoHole() {
    const vc = this.vc;
    const pos = vc.hole;
    const pop = this._vcName(VC_POP);
    if (pop) this.audio.play(pop, { at: this.audio.binaural ? pos : null, volume: 1.0, keep: true });
    vc.speed = 0.0;
    this._vcEngine();
    vc.drop = { t: VC_DROP_TIME, landed: false };
    vc.reached += 1;
    // The time for reaching it (holeBonusFor). Nothing is said (8.2.4, Russell: the voice is silent
    // unless you double tap; 8.2.3 said the seconds): the double tap's clock tells it.
    const bonus = holeBonusFor(vc.depth, vc.chaos);
    this.timeLeft += bonus;
    this.thirtySecAnnounced = this.timeLeft <= 30.0;
    const step = this._announceStep();
    this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / step) * step;
    this.lastBeepSecond = -1;
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
  _vcCredit(dt = 0) {
    const vc = this.vc;
    const c = vc.credit;
    if (!c) return;
    // The coins clinking, from where it lies, now and then.
    c.jingleT -= dt;
    if (c.jingleT <= 0) {
      c.jingleT = VC_JINGLE_EVERY;
      const name = aliasRecording(this.audio, VC_JINGLE, `event_sfx_file_${VC_JINGLE}`);
      const [l, r] = this._vcLevels(c.pos, VC_CREDIT_GAIN * listenLevel(vc.depth), VC_CREDIT_RANGE, VC_CREDIT_FLOOR);
      if (name) this._vcShot(name, c.pos, l, r);
    }
    if (Math.hypot(c.pos[0] - this.playerPos[0], c.pos[1] - this.playerPos[1]) >= VC_REACH) return;
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
    if (all) {
      for (const k of ['air', 'lava', 'lava2', 'engine']) if (vc[k]) { vc[k].stop(); vc[k] = null; }
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
    { title: 'Volcanic Caves', sound: null, desc: 'Volcanic Caves is a mode of its own inside Driving, new in 8.2.0: choose Driving Mode on the main menu, then Volcanic Caves. Inspired by Roller Ball in Sonar Islands, you drive down through volcanic caves toward the centre of the Earth. Each level is one cave: a wide open cavern with no walls inside it, only its edge all round. Somewhere in it is the hole down to the next level, and it beeps from where it is, faster and higher the nearer you are, like a labyrinth\'s exit. Drive into it: you hear it pop, you drop, and you land in the next cave down. No voice tells you the level: double tap for it, with the clock and the way you are facing. The lava is all around you and never touches you, but it grows louder the deeper you go, as in Escape the Cave, without end: quite loud by the fifteenth cave, and by the twentieth so loud that the bombs, the hole and the credits, which grow quieter as it rises, are hard to hear, though never lost completely.' },
    { title: 'Volcanic Caves Driving and Turning', sound: null, desc: 'You drive as in Driving Mode: slide one finger up and keep it down to accelerate, and slide that finger back down, or swipe down, to brake. But here the cave turns with you, as when you walk. To turn, lift the accelerating finger first, then flick left or right for one small turn of 30 degrees, or slide left or right and keep your finger down to keep turning until you lift it. The car coasts while your finger is up, slowing a little, so turn, then accelerate again. On a keyboard, hold the up arrow to accelerate, press or hold the left and right arrows to turn, and press the down arrow to brake. The ticks for north, east, south and west help you count your turns. Each cave you land somewhere different, and the hole can be any way from you: sometimes right beside you, sometimes far across the cavern, so listen for it before you set off.' },
    { title: 'Volcanic Caves Bombs and the Edge', sound: null, desc: 'The bombs are the only thing to avoid. Each one ticks like a clock, tick, tock, from where it lies, and the closer you are, the faster it ticks: slowly from far off, twice a second, and quicker and quicker as you near it, fastest right before you would drive into it. You hear the nearest three. Most of them lie on the way to the hole, spread well apart, never closer together than a couple of car lengths. A bomb goes off only if you drive into it head on. Then the cave shakes, and a moment later you are back at the start of that cave, facing as you began it, and the clock keeps running. Brushing past one does nothing: when a bomb ticks straight ahead of you, turn a little to one side and drive round it, then turn back toward the hole. A bomb that has gone off is gone. Deeper caves have more bombs: one in the first cave, then as many as the cave\'s level, or one more, so two or three in the second, up to twenty. There are no walls inside a cave: its only wall is its edge, and the cave\'s echo grows tighter as you near it. Drive straight into the edge and the car stops with a thud of rock. That costs no time: turn, and drive on. If you only glance along it, a softer knock tells you so, and the car slides on along it.' },
    { title: 'Volcanic Caves Clock and Score', sound: null, desc: 'You start with two minutes, and the run ends only when the time runs out. Time credits worth 10, 20 or 30 seconds lie in about two caves in three, always near where you start the cave, each marked by coins clinking now and then from where it lies, quietly, louder as you come closer. Drive onto one to take it, and the coins tell you which you got. Reaching the hole quietly puts time on the clock, and a double tap\'s clock tells you the new time: 5 seconds for leaving the first cave, one more for every two caves deeper, and 10 from the eleventh cave on. The clock waits while you drop down a hole. Each cave deeper has the hole farther away and more bombs, but the credits stay the same. Your score is the deepest level you reach, and Volcanic Caves has its own high score board, right after Driving\'s.' },
    { title: 'Volcanic Caves in Chaos Mode', sound: null, desc: 'Chaos Mode has Volcanic Caves levels too: you know one by the bubbling of the volcanic cave, the lava, your engine, and the clock ticking of bombs. There you must reach the hole two times in your first Volcanic level of a run, one more for each such level after, up to five, each hole dropping you into a new cave. A bomb there costs 20 health and 15 seconds instead of sending you back, and you drive on from where you are. The chaos clock keeps running, but waits while you drop, and each hole puts 5 seconds on it. Time credits of 10, 20 or 30 seconds lie in these caves too, marked by the same clinking coins. Double tap for the cave you are in and how many the level asks for, such as Level 1 of 2, then your health, the clock and the points.' },
  ]],
];

const HELP_DEMOS = [
  ['Demos, Volcanic Caves', [
    { title: 'Volcanic Caves Demos', sound: null, desc: 'The sounds of Volcanic Caves.' },
    { title: 'Volcanic Cave Air', sound: VC_AIR, desc: 'The bubbling air of a volcanic cave, heard all through it.' },
    { title: 'Lava', sound: VC_LAVA, desc: 'The lava around the caves: faint at first, louder the deeper you go.' },
    { title: 'Bomb Ticking', sound: VC_TICK, desc: 'A bomb ticking: tick, and then tock. Each bomb ticks like a clock, twice a second.' },
    { title: 'Bomb Tock', sound: VC_TOCK, desc: 'The tock of a bomb\'s tick-tock.' },
    { title: 'Explosion', sound: VC_BOOM, desc: 'A bomb you drove into head on.' },
    { title: 'The Edge of the Cave', sound: VC_ROCK, desc: 'The car driving into the rock at the edge of the cave.' },
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
  // The echo is tighter near the cavern's edge, and leans toward the side it is on (as a
  // battle arena's: game.js _arenaSurroundings), so the edge can be heard coming.
  surroundings(game, pos) {
    const vc = game.vc;
    if (!vc) return [1.0, 0.0];
    const p = pos || game.playerPos;
    const range = 18.0;
    const b = vc.bounds;
    const west = Math.max(0.0, 1.0 - (p[0] - b[0]) / range); const east = Math.max(0.0, 1.0 - (b[2] - p[0]) / range);
    const nearY = Math.max(0.0, 1.0 - Math.min(p[1] - b[1], b[3] - p[1]) / range);
    const nearX = Math.max(west, east);
    const near = Math.min(1.0, Math.max(nearX, nearY));
    const gain = 0.85 + (1.2 - 0.85) * near;
    return [gain, nearX > 0 ? 0.2 * (east - west) : 0.0];
  },
  status(game) {
    const vc = game.vc;
    if (!vc) return 'Volcanic Caves.';
    return `Volcanic Caves. Level ${vc.depth}. Time ${Math.max(0, Math.trunc(game.timeLeft))}s. Speed ${Math.trunc(vc.speed)}.`;
  },
  boards: [{ key: BOARD, label: 'Volcanic Caves', fmt: (v) => `Level ${v}` }],
  help: { sections: HELP_SECTIONS, demos: HELP_DEMOS },
};
