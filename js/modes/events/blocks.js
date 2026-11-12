// The building blocks web 5.0.0 added to events (the desktop's BlocksMixin in
// event_blocks.py, Windows 3.0.0), beside the missions in missions.js.
//
// Floors and what they do, walls, levels and endings, glass display cases and their
// rewards, several kinds of creature and four new ways for one to behave (the
// listener, the runner, the statue, the thrower), one meter, things in the room
// (traps, safe spots, teleports, treasure chests), supplies, stages, story lines,
// musical fragments, and what the seven new missions need of their own.
//
// Every block is off unless an event turns it on, so an event made before format 2
// plays exactly as it did. What each setting means is in the desktop's
// event_schema.py. Names follow the desktop in camelCase (_b_lay_room is _bLayRoom,
// self.b_walls is this.bWalls) so the two can be read side by side. Inside these
// methods `this` is the game. A square is kept as the text 'i,j'.

import { kinds, levelsOn, endingApplies, DEFAULT_SOUNDS, CASE_MISSIONS, FRAGMENT_MISSIONS, ALWAYS_LEVELS,
  FLOOR_FILES, pyRound } from './schema.js';
import { addMade } from './sounds.js';
import { uniform, randint, randrange, choice, random, shuffle } from './py.js';
import * as tunes from './tunes.js';
import { MORE } from './more-spec.js';

const STEP = 3.0;                      // one step, in the game's units
export const CASE_REACH = 4.5;         // beside a case: the squares next to it and at its corners
const CASE_REARM = 9.0;                // go this far from a case and its bell rings again when you come back
const CASE_KNOCK_RANGE = 45.0;         // a case knocks from within fifteen steps
const CASE_KNOCK_EVERY = [0.35, 1.1];  // seconds between knocks: beside the case, and at the edge of the range
const CASE_KNOCK_LEVEL = [0.35, 0.9];  // the knock's level: at the edge of the range, and beside the case
const CHARGE_STEP_GAIN = 0.9;          // a charging creature's footsteps, against its own volume
const LISTENER_ROOM = 2.5 * STEP;      // no item lies this near a resting listener, nor it this near one
const GLASS_RADIUS = 4.5;              // broken glass: the case's square and the eight round it, three steps across
export const CHASER_FADE = 4.0;        // seconds a chaser takes to be heard at full, after a smash
const CHASER_START = 30.0;             // a chaser starts at least this far from you
const CREATURES_MOST = 10;             // creatures up at a time, chasers included
const NOTICE_CONE = 0.707;             // a listener's front: within 45 degrees of the way it faces
export const LISTEN_BESIDE = 0.6;      // a listener at rest is this loud from beside or behind it
const MUD_WAIT = 0.45;                 // seconds mud holds you after a step
const STATUE_MOVES = 0.5;              // a statue moves for this long after each of your steps
const THROW_BAND = 3.0;                // a thrower holds its distance within this much
const PATH_EVERY = 0.4;                // seconds between a creature working out its way round walls
const SAFE_REFILL = 3.0;               // seconds a safe spot takes to fill an empty meter
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // north, east, south, west (north is up: y falls)
// Reasons a run ends that count as finishing it: in an event in stages these start the next stage.
const SUCCESS = ['all', 'finished', 'all_down', 'survived', 'covered', 'rival_end'];
// The game's own footsteps, and the web's own recordings for glass and water (the
// ultimate pack's), used where the events pack has none under the desktop's names.
const STONE = ['step_stone_1', 'step_stone_2', 'step_stone_3', 'step_stone_4'];
const WEB_STEPS = { sand: 'step_sand_', glass: 'ut_glass_step_', water: 'ut_water_step_' };

export const cellOf = (x, y) => [pyRound(x / STEP), pyRound(y / STEP)];
const K = (i, j) => i + ',' + j;
export const sqKey = (x, y) => K(...cellOf(x, y));
const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));
const sign = (v) => (v < 0 ? -1 : 1);
const s = (n) => (n === 1 ? '' : 's');

// A case's knock, made by the game: two quick raps on glass.
export function knockSound() {
  const SR = 44100; const n = Math.trunc(SR * 0.5);
  const out = new Float64Array(n);
  let seed = 620;
  const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1.0; };
  for (const [at, freq, amp] of [[0.0, 620, 1.0], [0.13, 660, 0.8]]) {
    const k = Math.trunc(at * SR); const len = Math.trunc(SR * 0.22);
    for (let i = 0; i < len && k + i < n; i++) {
      const t = i / SR;
      const body = (Math.sin(2 * Math.PI * freq * t) + 0.55 * Math.sin(2 * Math.PI * freq * 2.03 * t)
        + 0.25 * Math.sin(2 * Math.PI * freq * 3.1 * t)) * Math.exp(-t * 26);
      out[k + i] += amp * (body + noise() * Math.exp(-t * 90) * 0.35);
    }
  }
  let peak = 1e-9;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < n; i++) out[i] *= 0.8 / peak * 32767;
  return [out, out];
}

export const BlocksMixin = {
  // ================================================================ a run begins
  _bReset() {
    this.bLevels = false;
    this.bLevel = 1; this.bLevelsDone = 0; this.bEndAfter = null;
    this.bBanks = {};
    this.bPatch = new Set(); this.bGlassExtra = new Set(); this.bWalls = new Set();
    this.bCells = 0;
    this.bMudUntil = -1.0;
    this.bSliding = false;
    this.bLastStepAt = -99.0;
    this.bTraps = []; this.bSafes = []; this.bPorts = []; this.bChests = [];
    this.bSupplies = []; this.bSupplyTimers = {};
    this.bRefills = []; this.bRefillTimer = 0.0;
    this.bMeter = null; this.bMeterWarn = 0.0;
    this.bStones = []; this.bCarry = 0;
    this.bPending = [];
    this.bWoke = false;
    this.bFoundSaid = new Set();
    this.bFrags = []; this.bFragAt = 0; this.bTune = null;
    this.bRoomsDone = 0;
    this.bShelter = null; this.bStormLeft = 0.0; this.bStormFull = 1.0; this.bStormFrom = [0, -1]; this.bThunder = 0.0;
    this.bShelters = 0;
  },

  // The event a run plays. An event in stages plays the stage it has reached; an
  // event in levels plays a copy, because each level sets its own number of items.
  _bRunCopy(ev, carry = null) {
    const stages = ev._stages || [];
    if (carry === null) {
      this.bStageBase = stages.length ? ev : null;
      this.bStage = 0;
      this.bElapsedBefore = 0.0;
    }
    if (stages.length) {
      const base = this.bStageBase;
      const stage = structuredClone(base._stages[this.bStage]);
      for (const k of ['_source', '_file', '_name', '_start', '_end', '_total_range']) if (k in base) stage[k] = base[k];
      return stage;
    }
    if (levelsOn(ev)) return structuredClone(ev);
    return ev;
  },

  // Before anything is laid out: the walls and the floor, the level's items, the
  // ending, the sounds the blocks need.
  _bPrepare(ev) {
    this._bReset();
    this._bSounds(ev);
    const en = ev.ending;
    if (endingApplies(ev) && en.kind === 'fixed') this.bEndAfter = en.levels;
    else if (endingApplies(ev) && en.kind === 'random') this.bEndAfter = randint(en.levels, Math.max(en.levels, en.levels_most));
    this.bLevels = levelsOn(ev);
    this.bCells = Math.floor(this.arenaLimit / STEP);
    this._bLayRoom();
    if (FRAGMENT_MISSIONS.includes(ev.mission)) this._bNewTune();
    if (this.bLevels) this._bLevelItems();
    if (ev.meter.on) {
      this.bMeter = ev.meter.seconds;
      this.bRefillTimer = ev.meter.pickup_every_seconds;
    }
    const su = ev.supplies;
    for (const k of ['ammo', 'life', 'points']) if (su[`${k}_every_seconds`]) this.bSupplyTimers[k] = su[`${k}_every_seconds`];
  },

  _bRec(fname, role) { return this.loadEventRecording(fname, role); },

  // The footstep banks, and the blocks' own sounds: an event's own recording, or the
  // block's usual one, or a sound the game makes if that file is missing.
  _bSounds(ev) {
    const fl = ev.floor;
    const has = (n) => this.audio.has(n);
    this.bBanks = { stone: STONE };
    for (const floor of new Set([fl.main, fl.patch, 'glass', 'sand'])) {
      if (floor === 'stone' || floor === 'none') continue;
      let bank = [];
      if (FLOOR_FILES.includes(floor)) bank = [1, 2, 3, 4].map((i) => this._bRec(`step_${floor}_${i}.ogg`, 'step')).filter((n) => n);
      if (!bank.length && WEB_STEPS[floor]) bank = [1, 2, 3, 4].map((i) => WEB_STEPS[floor] + i).filter(has);
      this.bBanks[floor] = bank.length ? bank : STONE;
    }
    const d = DEFAULT_SOUNDS;
    const pick = (own, usual, made) => this._bRec(own, 'beacon') || this._bRec(usual, 'beacon') || made;
    this.bSnd = {
      hum: this._bRec(d.case_hum, 'beacon') || 'event_beacon_gem',
      bell: this._bRec(d.case_bell, 'pickup') || 'event_checkpoint',
      smash: this._bRec(d.case_smash, 'pickup') || (has('ut_glass_smash') ? 'ut_glass_smash' : 'explosion'),
      trap: pick(ev.traps.sound, d.trap, 'event_bomb_tick'),
      safe: pick(ev.safe_spots.sound, d.safe_spot, 'event_beacon_shimmer'),
      port: pick(ev.teleports.sound, d.teleport, 'event_beacon_star'),
      chest: pick(ev.chests.sound, d.chest, 'event_beacon_gem'),
      chest_open: this._bRec(d.chest_open, 'pickup') || 'event_pickup_gem',
      refill: this._bRec(ev.meter.pickup_sound, 'beacon') || (has('vent') ? 'vent' : 'event_beacon_heart'),
      warn: this._bRec(ev.meter.warn_sound, 'pickup') || (has('health_low') ? 'health_low' : 'countdown'),
      stone: this._bRec(ev.lure.stone_sound, 'beacon') || 'event_pad',
      shelter: this._bRec(ev.storm.shelter_sound, 'beacon') || 'event_beacon_shimmer',
      thunder: pick(ev.storm.thunder_sound, d.thunder, 'explosion'),
    };
    if (!has('event_case_knock')) {
      try { addMade(this.audio, 'event_case_knock', knockSound()); } catch (e) { /* the hum and the bell still tell */ }
    }
    const su = ev.supplies;
    this.bSupplySnd = {
      ammo: [this._bRec(su.ammo_sound, 'beacon') || (has('ammo_beacon') ? 'ammo_beacon' : 'event_beacon_gem'), 'ammo'],
      // (A bell, not the heartbeat: the heartbeat is too low to be heard from far off.)
      life: [this._bRec(su.life_sound, 'beacon') || 'event_beacon_bell', 'event_pickup_heart'],
      points: [this._bRec(su.points_sound, 'beacon') || 'event_beacon_star', 'event_pickup_star'],
    };
  },

  // ================================================================ the room: walls and floor
  _bCellsAll() {
    const n = this.bCells; const out = [];
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push([i, j]);
    return out;
  },

  // Every square that can be walked to from a square, round the walls (a set of keys).
  _bFlood(start, walls) {
    const n = this.bCells;
    const seen = new Set([K(...start)]); const todo = [start];
    while (todo.length) {
      const [cx, cy] = todo.pop();
      for (const [dx, dy] of DIRS) {
        const c = [cx + dx, cy + dy]; const key = K(...c);
        if (!seen.has(key) && !walls.has(key) && Math.abs(c[0]) <= n && Math.abs(c[1]) <= n) { seen.add(key); todo.push(c); }
      }
    }
    return seen;
  },

  // The walls and the floor patches of a level (or a room, or a stage). Always with
  // a way through: a square walled off from the player becomes wall itself, so every
  // open square can be reached, and so can everything laid out on one.
  _bLayRoom() {
    const ev = this.ev;
    const home = cellOf(...this.playerPos);
    const keep = new Set([K(...home), ...DIRS.map(([dx, dy]) => K(home[0] + dx, home[1] + dy))]);
    const cells = this._bCellsAll();
    this.bWalls = new Set();
    if (ev.walls.on) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const walls = new Set(cells.filter((c) => !keep.has(K(...c)) && random() < ev.walls.density).map((c) => K(...c)));
        const reach = this._bFlood(home, walls);
        if (reach.size >= 0.6 * cells.length) {
          this.bWalls = new Set(cells.map((c) => K(...c)).filter((key) => !reach.has(key)));
          break;
        }
      }
    }
    const fl = ev.floor;
    this.bPatch = new Set(); this.bGlassExtra = new Set();
    if (fl.patch === 'none') return;
    let share = fl.patch_share;
    if (fl.patch_share_most > share) {
      share = uniform(share, fl.patch_share_most);
      if (fl.patch_share_most >= 0.995 && share >= 0.85) share = 1.0;   // with a most of all, the top of the range is a level that is all patch
    }
    const openCells = cells.filter((c) => !this.bWalls.has(K(...c)));
    if (share >= 0.995) { this.bPatch = new Set(openCells.map((c) => K(...c))); return; }
    const want = pyRound(share * openCells.length);
    const free = new Set(openCells.map((c) => K(...c)).filter((key) => !keep.has(key)));   // never under your feet as a level begins
    const order = shuffle(openCells.filter((c) => free.has(K(...c))));
    const patch = new Set(); const edge = [];
    while (patch.size < want && (order.length || edge.length)) {
      let c;
      if (edge.length && random() > 0.06) c = edge.splice(randrange(edge.length), 1)[0];     // a patch grows
      else if (order.length) c = order.pop();                                               // a new patch begins
      else continue;
      if (patch.has(K(...c))) continue;
      patch.add(K(...c));
      for (const [dx, dy] of DIRS) {
        const nb = [c[0] + dx, c[1] + dy];
        if (free.has(K(...nb)) && !patch.has(K(...nb))) edge.push(nb);
      }
    }
    this.bPatch = patch;
  },

  // The floor under a spot (under the player, if none is given).
  _bFloorAt(pos = null) {
    const key = sqKey(...(pos || this.playerPos));
    if (this.bGlassExtra.has(key)) return 'glass';
    const fl = this.ev.floor;
    return this.bPatch.has(key) ? fl.patch : fl.main;
  },

  // The footstep for the floor the player has just stepped onto.
  bStepSound() {
    const bank = this.bBanks[this._bFloorAt()] || this.bBanks.stone || STONE;
    return choice(bank);
  },

  // Whether a step to a spot cannot be taken: mud is still holding the player
  // (nothing is heard: the step simply has not come yet), or a wall stands there.
  bStepRefused(nx, ny) {
    if (!this.ev) return false;
    if (this.evElapsed < this.bMudUntil) return true;
    if (this.bWalls.has(sqKey(nx, ny))) { this.audio.play('wall', { at: [nx, ny] }); return true; }
    return this._xStepRefused(nx, ny);
  },

  // A step has landed: what the floor does, and what lies on the square.
  _bOnStep() {
    this.bLastStepAt = this.evElapsed;
    const floor = this._bFloorAt();
    if (floor === 'glass') this._bNoise('glass', [...this.playerPos]);
    else if (floor === 'mud') this.bMudUntil = this.evElapsed + MUD_WAIT;
    this._bStepThings();
  },

  // Ice: once the step has landed (and taken whatever lay there), it slides the
  // player one more step the same way, unless a wall or the edge of the room is
  // there. One slide a step, never a second.
  _bAfterStep() {
    if (this.bSliding || !this.ev || this.state !== 'event') return;
    if (this._bFloorAt() !== 'ice') return;
    const [dx, dy] = this.evLastStep || [0, -1];
    const nx = this.playerPos[0] + dx * STEP; const ny = this.playerPos[1] + dy * STEP;
    if (Math.abs(nx) > this.arenaLimit || Math.abs(ny) > this.arenaLimit || this.bWalls.has(sqKey(nx, ny))) return;
    this.bSliding = true;
    try {
      this.playerPos = [nx, ny];
      this.audio.play(this.bStepSound());
      this.mOnStep();
    } finally { this.bSliding = false; }
  },

  // A spot, or if a wall stands there the middle of the nearest open square.
  _bOpenNear(x, y) {
    if (!this.bWalls.size || !this.bWalls.has(sqKey(x, y))) return [x, y];
    const [cx, cy] = cellOf(x, y); const n = this.bCells;
    for (let r = 1; r < 2 * n + 2; r++) {
      const ring = [];
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) === r && Math.abs(cx + i) <= n && Math.abs(cy + j) <= n
          && !this.bWalls.has(K(cx + i, cy + j))) ring.push([cx + i, cy + j]);
      }
      if (ring.length) { const c = choice(ring); return [c[0] * STEP, c[1] * STEP]; }
    }
    return [x, y];
  },

  // The squares to walk through from one square to another, round the walls (the
  // first is the next square to step to), or null if there is no way.
  _bPath(start, goal) {
    if (this.bWalls.has(K(...goal))) return null;
    const n = this.bCells; const goalKey = K(...goal);
    const came = new Map([[K(...start), null]]); const todo = [start];
    for (let at = 0; at < todo.length; at++) {            // breadth first
      const c = todo[at];
      if (K(...c) === goalKey) break;
      for (const [dx, dy] of DIRS) {
        const nb = [c[0] + dx, c[1] + dy]; const key = K(...nb);
        if (!came.has(key) && !this.bWalls.has(key) && Math.abs(nb[0]) <= n && Math.abs(nb[1]) <= n) { came.set(key, c); todo.push(nb); }
      }
    }
    if (!came.has(goalKey)) return null;
    const path = []; let c = goal; const startKey = K(...start);
    while (K(...c) !== startKey) { path.push(c); c = came.get(K(...c)); }
    return path.reverse();
  },

  // Move a creature up to dist toward a spot: straight there in an open room
  // (exactly as before format 2), by the passages in a walled one. True if it has
  // somewhere to go.
  _bMoveToward(th, gx, gy, dist, lim) {
    let tx = gx; let ty = gy;
    if (this.bWalls.size) {
      const here = cellOf(th.x, th.y); const goal = cellOf(gx, gy);
      const hereKey = K(...here); const goalKey = K(...goal);
      if (hereKey !== goalKey) {
        if (th.path === null || th.path === undefined || th.pathGoal !== goalKey || this.evElapsed - th.pathAt > PATH_EVERY) {
          th.path = this._bPath(here, goal); th.pathGoal = goalKey; th.pathAt = this.evElapsed;
        }
        while (th.path && th.path.length && K(...th.path[0]) === hereKey) th.path.shift();
        if (!th.path || !th.path.length) return false;
        tx = th.path[0][0] * STEP; ty = th.path[0][1] * STEP;
      }
    }
    const dx = tx - th.x; const dy = ty - th.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.05) {
      const stepd = Math.min(d, dist);
      th.x = clamp(th.x + dx / d * stepd, lim);
      th.y = clamp(th.y + dy / d * stepd, lim);
    }
    return true;
  },

  // Squares nothing may be laid out on: the walls.
  _bBlockedSquares() { return this.bWalls; },

  // Where the blocks' own things lie, so nothing else is laid out on them.
  _bTaken() {
    return [...this.bTraps, ...this.bSafes, ...this.bPorts, ...this.bChests, ...this.bSupplies, ...this.bRefills,
      ...this.bStones, ...(this.bShelter ? [this.bShelter] : [])].map((t) => [t.x, t.y]);
  },

  // [x, y, radius] where nothing new may be laid out: in front of a creature that
  // listens, as far as it notices, so everything can be reached past it.
  _bClearZones() {
    const zones = [];
    for (const th of this.evHazards || []) {
      const hz = th.kind || this.ev.hazards;
      if (hz.behavior === 'listen' && th.state === 'rest' && th.face && th.downFor < 0) {
        const reach = hz.notice_steps * STEP;
        zones.push([th.x + th.face[0] * reach / 2, th.y + th.face[1] * reach / 2, reach / 2 + STEP]);
        // And round the creature itself, so nothing lies on it or beside it, where it
        // could only be reached by walking into it.
        zones.push([th.x, th.y, LISTENER_ROOM]);
      }
    }
    return zones;
  },

  // Whether a creature that listens, put down here, would lie on an item or beside
  // one: it rests where it is, so that item could only be reached by walking into it.
  _bCrowdsAnItem(x, y, kind = null) {
    const hz = kind || this.ev.hazards;
    if (hz.behavior !== 'listen') return false;
    return (this.evItems || []).some((t) => Math.hypot(t.x - x, t.y - y) < LISTENER_ROOM);
  },

  // ================================================================ levels, endings, stages
  // This level's number of items. The item total is counted on from what has been
  // found so far, so every count the missions keep stays true.
  _bLevelItems() {
    const ev = this.ev; const lv = ev.levels; const it = ev.item;
    const n = randint(lv.items_fewest, Math.max(lv.items_fewest, lv.items_most));
    this.evSpawned = this.evCollected;
    it.total = this.evCollected + n; it.total_max = 0;
    if (ALWAYS_LEVELS.includes(ev.mission)) it.at_once = Math.min(10, n);   // every one of a level's memories is out at once
  },

  // Said without cutting off what is being said: a reward and the level it finished are both heard.
  _bSay(text) {
    if (text && text.trim()) this.tts.speak(text.trim(), { interrupt: false });
  },

  _bStoryLine(index) {
    const lines = this.ev.story.levels;
    return index >= 0 && index < lines.length ? lines[index].trim() : '';
  },

  // Levels are always announced, so a player knows one is done: the number, and the
  // event's own line for that level if it has one.
  _bSayLevel(n, word = 'Level') { this._bSay(`${word} ${n}. ${this._bStoryLine(n - 1)}`); },

  _bNextLevel() {
    const ev = this.ev;
    this.bLevel += 1;
    this._bClearThings();
    const glass = new Set(this.bGlassExtra);
    this._bLayRoom();
    // The glass of the cases already smashed stays where it lies, as long as no wall
    // of the new level stands on it.
    this.bGlassExtra = new Set([...glass].filter((k) => !this.bWalls.has(k)));
    if (ev.mission === 'song') this._bNewTune();
    this._bLevelItems();
    this._bLevelCreatures(ev.levels.more_creatures_each);
    this._bLayThings();
    for (let i = 0; i < Math.max(1, ev.item.at_once); i++) this._eventSpawnItem();
    this.audio.play('stairs_climb');
    this._bSayLevel(this.bLevel);
  },

  // A new level: the chasers of the last are gone, every other creature is put
  // somewhere new (at rest, if it listens), and the first kind may gain some.
  _bLevelCreatures(more) {
    for (const th of this.evHazards.filter((h) => h.role === 'chaser')) {
      this._mStop(th);
      this.evHazards.splice(this.evHazards.indexOf(th), 1);
    }
    for (const th of this.evHazards) this._eventSpawnHazard(0, th);
    const most = this.ev.levels.creatures_most || CREATURES_MOST;     // the event's own limit
    for (let i = 0; i < more; i++) {
      if (this.evHazards.length >= Math.min(most, CREATURES_MOST)) break;
      this._eventSpawnHazard(this.evHazards.length);
    }
  },

  // Called by every mission with levels, rooms or rounds as one is finished. True if
  // that was the run's last: the run has ended (or the next stage begun).
  _bEndingReached(done) {
    if (this.bEndAfter && done >= this.bEndAfter) {
      this.evPoints += this.ev.ending.finish_bonus;
      this._eventFinish('finished');
      return true;
    }
    return false;
  },

  // Asked as a run is about to end. True if it goes on instead: the next level
  // begins, or the next stage.
  _bInterceptFinish(reason) {
    if (!this.ev) return false;
    if (reason === 'all' && this.bLevels) {
      this.bLevelsDone += 1;
      this.evPoints += this.ev.levels.points_per_level;
      if (this.ev.mission === 'song') {
        this.evPoints += this.ev.song.points_per_song;
        const whole = this._bFragSound(this.bTune, 0, null);
        if (whole) this.audio.play(whole);
      }
      if (this._bEndingReached(this.bLevelsDone)) return true;
      this._bNextLevel();
      return true;
    }
    const base = this.bStageBase;
    if (base && SUCCESS.includes(reason) && this.bStage + 1 < base._stages.length) {
      const carry = { points: this.evPoints + Math.trunc(this.evAlivePoints), collected: this.evCollected,
        downs: this.evDowns || 0, bonuses: this.evBonuses || 0, elapsed: this.evElapsed };
      // (Web only: the recordings unpacked for the whole run are kept for its next stage.)
      this._bStageTurn = true;
      try { this._eventStopAll(); } finally { this._bStageTurn = false; }
      this.bStage += 1;
      this.startEvent(base, carry);
      return true;
    }
    return false;
  },

  // A new stage: what the run has earned so far comes with it. (The stage's own time
  // starts at nothing, so its creatures wait their few seconds as at the start of any
  // run; the run's whole length is kept apart.)
  _bCarryIn(carry) {
    this.evPoints = carry.points; this.evCollected = carry.collected;
    this.evSpawned = carry.collected;
    this.evDowns = carry.downs; this.evBonuses = carry.bonuses;
    this.bElapsedBefore = (this.bElapsedBefore || 0.0) + carry.elapsed;
  },

  // What is said as a run, or a stage, begins: nothing for an ordinary event, the
  // stage's number after the first, and the event's own first line if it has one.
  _bBeginWords(carried) {
    const head = carried ? `Stage ${this.bStage + 1}. ` : '';
    this._bSay(head + this._bStoryLine(0));
  },

  // ================================================================ rewards and story
  // Give one of a block's rewards (a case's extra, a chest's): seconds, shots, points
  // or a life. The voice says only the reward.
  _bReward(block) {
    let kind = 'extra' in block ? block.extra : 'random';
    if (kind === 'none') return;
    if (kind === 'random') kind = choice(block.random_kinds);
    if (kind === 'seconds' && !this.evClock) kind = 'points';
    if (kind === 'shots' && (!this.ev.weapon.enabled || this.evUnlimited())) kind = 'points';
    if (kind === 'seconds') {
      const n = block.seconds;
      this.timeLeft += n;
      this.lastBeepSecond = -1;
      const step = this.ev.clock.announce_every_seconds;
      if (step) this.evNextAnnounce = Math.floor((this.timeLeft - 1) / step) * step;
      this._bSay(`${n} more second${s(n)}.`);
    } else if (kind === 'shots') {
      const n = block.shots;
      this.evShots += n;
      this._bSay(`${n} shot${s(n)}.`);
    } else if (kind === 'life') {
      this.evLives = (this.evLives === undefined ? 1 : this.evLives) + 1;
      this._bSay('An extra life.');
    } else {
      const n = block.points;
      this.evPoints += n;
      this._bSay(`${n} point${s(n)}.`);
    }
  },

  // An item has been collected: the meter it refills, the story line it brings.
  _bItemTaken() {
    const ev = this.ev;
    if (this.bMeter !== null && ev.meter.refill === 'items') this._bRefill();
    for (const [count, line] of ev.story.found) {
      if (this.evCollected >= count && !this.bFoundSaid.has(count)) {
        this.bFoundSaid.add(count);
        this._bSay(line);
      }
    }
  },

  // ================================================================ sounds placed in the room
  // A sound played once from a spot in the room, leaning left or right.
  _bShotAt(name, pos, gain = 1.0) {
    if (!name) return null;
    const [left, right] = this._battleLevels(pos, gain);
    const ch = this.audio.play(name, { at: pos });
    if (ch) ch.setVolume(Math.min(1.0, left), Math.min(1.0, right), this._behind(pos));
    return ch;
  },

  _bLoop(th, name) {
    th.channel = this.audio.play(name, { loops: -1, volume: 0.0 });
    return th;
  },

  // Keep a looping thing's place in the room; returns how far off it is.
  _bFollow(th, gain = 1.0) {
    const [left, right, dist] = this._battleLevels([th.x, th.y], gain);
    if (th.channel) th.channel.setVolume(Math.min(1.0, left), Math.min(1.0, right), this._behind([th.x, th.y]));
    return dist;
  },

  // ================================================================ noise, and those who listen
  // A loud sound at a spot. Creatures at rest that listen, and are near enough to
  // hear it, wake: they come for the player, or for a thrown stone go to where it landed.
  _bNoise(kind, pos) {
    if (!this.ev.noise[kind]) return;
    for (const th of this.evHazards) {
      const hz = th.kind || this.ev.hazards;
      if (hz.behavior !== 'listen' || th.state !== 'rest' || th.downFor >= 0 || th.role) continue;
      if (Math.hypot(th.x - pos[0], th.y - pos[1]) <= hz.hearing) this._bWake(th, hz, kind === 'stones' ? pos : null);
    }
  },

  _bWake(th, hz, target = null) {
    th.state = 'growl'; th.timer = hz.growl_seconds; th.target = target;
    const growl = this._bRec(hz.growl_sound, 'pickup') || this._bRec(DEFAULT_SOUNDS.growl, 'pickup')
      || (this.audio.has('guardian_hit') ? 'guardian_hit' : 'player_hit');
    this._bShotAt(growl, [th.x, th.y], hz.volume);
    if (!this.bWoke) {
      this.bWoke = true;
      this._bSay(this.ev.story.wake);
    }
  },

  // A listener breathes at rest and has its own voice when it charges.
  _bListenerSound(th, hz, resting) {
    let want = th.beacon;
    if (resting) want = this._bRec(hz.rest_sound, 'beacon_hazard') || this._bRec(DEFAULT_SOUNDS.rest, 'beacon_hazard') || th.beacon;
    if (th.note !== want) {
      if (th.channel) th.channel.stop();
      th.channel = this.audio.play(want, { loops: -1, volume: 0.0 });
      th.note = want;
    }
  },

  _bRest(th, hz, face = null) {
    th.state = 'rest'; th.timer = 0.0; th.target = null; th.path = null;
    th.home = [th.x, th.y];
    if (face) th.face = face;
    this._bListenerSound(th, hz, true);
  },

  // ================================================================ creatures: kinds and behaviours
  // The second and third kinds of creature, after the first is out.
  _bSpawnKinds() {
    for (const key of ['hazards2', 'hazards3']) {
      const hz = this.ev[key];
      if (!hz.count) continue;
      let names;
      if (hz.sound === 'guardian') names = ['guardian'];
      else if (hz.sound === 'enemy') names = shuffle([...Array(10).keys()]).map((i) => `obstacle_${i}`);
      else names = [this._bRec(hz.sound, 'beacon_hazard') || 'guardian'];
      for (let i = 0; i < hz.count; i++) {
        if (this.evHazards.length >= CREATURES_MOST) break;
        this._eventSpawnHazard(this.evHazards.length, null, hz, names);
      }
    }
  },

  // A creature has just been put in the room (new, or back after being brought
  // down): a listener settles facing a way that leaves the player and every item out
  // of its sight; a thrower waits a while before its first throw.
  _bCreatureReady(th) {
    const hz = th.kind || this.ev.hazards;
    th.state = null; th.timer = 0.0; th.target = null; th.path = null;
    if (['sneak', 'defend'].includes(this.ev.mission) && !th.kind) return;   // those missions move the first kind themselves
    if (hz.behavior === 'listen') {
      const reach = hz.notice_steps * STEP;
      const spots = [...this.evItems.map((t) => [t.x, t.y]), [...this.playerPos]];
      if (this.mExit) spots.push([this.mExit.x, this.mExit.y]);
      const clear = (face) => {
        const cx = th.x + face[0] * reach / 2; const cy = th.y + face[1] * reach / 2;
        return spots.every(([sx, sy]) => Math.hypot(sx - cx, sy - cy) > reach / 2 + STEP);
      };
      const faces = shuffle([...DIRS]);
      th.face = faces.find(clear) || faces[0];
      th.note = null;
      this._bRest(th, hz);
    } else if (hz.behavior === 'throw') {
      th.state = 'idle'; th.timer = uniform(0.5, 1.0) * hz.throw_every_seconds;
    }
  },

  // Move a chaser, or a creature with one of the behaviours format 2 added.
  _bMove(th, dt, hz, lim) {
    const [px, py] = this.playerPos;
    const speed = hz.speed * STEP * dt;
    const d = Math.hypot(px - th.x, py - th.y);
    if (th.role === 'chaser') {
      th.fade = Math.min(CHASER_FADE, (th.fade || 0.0) + dt);
      this._bMoveToward(th, px, py, speed, lim);
      return;
    }
    const beh = hz.behavior;
    if (beh === 'listen') {
      if (th.state === 'rest') {
        if (this.evElapsed > 3.0 && d > 0.01 && th.face) {
          let reach = hz.notice_steps * STEP + STEP / 2;
          if (this._bFloorAt() === 'water') reach *= 0.5;            // wading is quiet
          const ahead = ((px - th.x) * th.face[0] + (py - th.y) * th.face[1]) / d;
          if (d <= reach && ahead >= NOTICE_CONE && !this._bSafe()) this._bWake(th, hz);
        }
        return;
      }
      th.timer -= dt;
      if (th.state === 'growl') {
        if (th.timer <= 0) {
          th.state = 'charge'; th.timer = hz.charge_seconds;
          th.knock = STEP;                    // its first footstep lands as the charge begins
          this._bListenerSound(th, hz, false);
        }
        return;
      }
      const [gx, gy] = th.target || [px, py];
      const ox = th.x; const oy = th.y;
      this._bMoveToward(th, gx, gy, speed, lim);
      // A charge is heard coming: a footstep for every step it runs, on the floor it
      // is running over, from where it is.
      th.knock = (th.knock || 0.0) + Math.hypot(th.x - ox, th.y - oy);
      if (th.knock >= STEP) {
        th.knock -= STEP;
        const bank = this.bBanks[this._bFloorAt([th.x, th.y])] || this.bBanks.stone || STONE;
        this._bShotAt(choice(bank), [th.x, th.y], CHARGE_STEP_GAIN * hz.volume);
      }
      const arrived = th.target !== null && Math.hypot(gx - th.x, gy - th.y) < 1.5;
      if (th.timer <= 0 || arrived) {
        const mx = gx - ox; const my = gy - oy;
        let face = th.face;
        if (Math.abs(mx) > 0.01 || Math.abs(my) > 0.01) face = Math.abs(mx) >= Math.abs(my) ? [sign(mx), 0] : [0, sign(my)];
        this._bRest(th, hz, face);          // it stops where it is, not back where it began
      }
      return;
    }
    if (beh === 'run') {
      if (d > 0.01 && d < hz.flee_distance) {
        this._bMoveToward(th, clamp(th.x + (th.x - px) / d * 3 * STEP, lim), clamp(th.y + (th.y - py) / d * 3 * STEP, lim), speed, lim);
      } else {
        if (th.goal === null || Math.hypot(th.goal[0] - th.x, th.goal[1] - th.y) < 1.0) th.goal = this._bOpenNear(uniform(-lim, lim), uniform(-lim, lim));
        if (!this._bMoveToward(th, th.goal[0], th.goal[1], speed * 0.4, lim)) th.goal = null;
      }
      return;
    }
    if (beh === 'statue') {
      if (this.evElapsed - this.bLastStepAt <= STATUE_MOVES) this._bMoveToward(th, px, py, speed, lim);
      return;
    }
    if (beh === 'throw') {
      if (th.state === 'windup') {
        th.timer -= dt;
        if (th.timer <= 0) {
          const spot = th.target || [px, py];
          const hit = sqKey(px, py) === sqKey(...spot) && !this._bSafe();
          this._bShotAt(hit ? 'explosion' : 'wall', spot, hz.volume);
          if (hit) this.bPending.push([this.evElapsed, 'hit', hz]);     // judged next frame, in _bUpdate
          th.state = 'idle'; th.timer = hz.throw_every_seconds; th.target = null;
        }
        return;
      }
      const keep = hz.keep_distance;
      if (d > keep + THROW_BAND) this._bMoveToward(th, px, py, speed, lim);
      else if (d > 0.01 && d < keep - THROW_BAND) {
        this._bMoveToward(th, clamp(th.x + (th.x - px) / d * 2 * STEP, lim), clamp(th.y + (th.y - py) / d * 2 * STEP, lim), speed, lim);
      }
      th.timer -= dt;
      if (th.timer <= 0 && this.evElapsed > 3.0) {
        th.state = 'windup'; th.timer = hz.windup_seconds; th.target = [px, py];
        const wind = this._bRec(hz.windup_sound, 'pickup')
          || ['enemy_windup', 'tower_windup', 'event_falling'].find((n) => this.audio.has(n)) || 'countdown';
        this._bShotAt(wind, [th.x, th.y], hz.volume);
      }
    }
  },

  // How loud a creature is, on top of its own volume: a chaser fades in from silence,
  // and a listener at rest is clearer from in front of it, which is how a player
  // hears which way it faces.
  _bGain(th, hz) {
    if (th.role === 'chaser') return Math.min(1.0, (th.fade || 0.0) / CHASER_FADE);
    if (hz.behavior === 'listen' && th.state === 'rest' && th.face) {
      const ahead = (this.playerPos[0] - th.x) * th.face[0] + (this.playerPos[1] - th.y) * th.face[1];
      return ahead > 0 ? 1.0 : LISTEN_BESIDE;
    }
    return 1.0;
  },

  // A creature has reached the player. True if its behaviour deals with that itself:
  // a listener at rest (or still growling) only wakes, and a runner is caught.
  _bTouchHandled(th) {
    const hz = th.kind || this.ev.hazards;
    if (th.role || (['sneak', 'defend'].includes(this.ev.mission) && !th.kind)) return false;
    if (hz.behavior === 'listen' && ['rest', 'growl'].includes(th.state)) {
      if (th.state === 'rest') this._bWake(th, hz);
      return true;
    }
    if (hz.behavior === 'run') {
      th.downFor = 0.0;
      this._mStop(th);
      this.evPoints += hz.points_for_down;
      this.evDowns = (this.evDowns || 0) + 1;
      this.audio.play('event_checkpoint');
      return true;
    }
    return false;
  },

  // What a creature's touch costs, for a hit that is not a touch (a thrower's throw
  // landing). True if it ended the run.
  _bApplyTouch(hz) {
    this.audio.play('player_hit');
    this._mTouched();
    if (hz.on_touch === 'end_run') {
      this.evLives = (this.evLives === undefined ? 1 : this.evLives) - 1;
      if (this.evLives <= 0) { this._eventFinish('caught'); return true; }
    } else if (hz.on_touch === 'lose_time') {
      if (this.evClock) { this.timeLeft -= hz.penalty; this.lastBeepSecond = -1; }
    } else {
      const take = Math.min(hz.penalty, this.evPoints);
      this.evPoints -= take;
      this.evAlivePoints = Math.max(0.0, this.evAlivePoints - (hz.penalty - take));
    }
    return false;
  },

  // A smash has been heard: a few fast creatures come from far off, silent at first.
  // They follow the first kind's rules for a touch and for being shot.
  _bChasers() {
    const ca = this.ev.cases;
    const kind = { ...this.ev.hazards, behavior: 'hunt', speed: ca.chaser_speed, respawn_seconds: 0 };
    const lim = this.arenaLimit - 3.0;
    const [px, py] = this.playerPos;
    const n = randint(ca.chasers_fewest, Math.max(ca.chasers_fewest, ca.chasers_most));
    for (let c = 0; c < n; c++) {
      if (this.evHazards.filter((h) => h.downFor < 0).length >= CREATURES_MOST) break;
      let [x, y] = this._eventFarSpot();
      for (let t = 0; t < 40; t++) {
        const v = uniform(-lim, lim);
        const [cx, cy] = choice([[v, -lim], [v, lim], [-lim, v], [lim, v]]);
        if (Math.hypot(cx - px, cy - py) >= Math.min(CHASER_START, lim)) { x = cx; y = cy; break; }
      }
      [x, y] = this._bOpenNear(x, y);
      const th = new this._Thing(x, y);
      th.kind = kind; th.role = 'chaser'; th.fade = 0.0;
      th.beacon = this.audio.has('obstacle_0') ? `obstacle_${randrange(10)}` : this.evHazardSounds[0];
      this._bLoop(th, th.beacon);
      this.evHazards.push(th);
    }
  },

  // ================================================================ items: cases and fragments
  // An ordinary item has just been laid out: its fragment of the tune, if the
  // mission's items are musical, and whether it is locked in a glass case.
  _bItemSpawned(th) {
    const ev = this.ev; const m = ev.mission;
    if (FRAGMENT_MISSIONS.includes(m)) {
      th.frag = this._bNextFrag();
      if (m === 'echo' || m === 'song') {
        this._mStop(th);                      // hidden: it is heard only when it plays its notes
        th.knock = uniform(0.3, ev[m].call_every_seconds);
      }
    }
    const share = m === 'smash' ? 1.0 : (CASE_MISSIONS.includes(m) ? ev.cases.share : 0.0);
    if (share && random() < share) {
      th.cased = true; th.near = false; th.knock = uniform(0.0, 0.6);
      this._mStop(th);
      this._bLoop(th, this.bSnd.hum);
    }
  },

  // A case knocks from within fifteen steps, faster and louder as you close, and its
  // bell rings once when you are beside it; a hidden fragment plays its notes every so often.
  _bUpdateItems(dt) {
    const ev = this.ev;
    const [px, py] = this.playerPos;
    const calls = ev.mission === 'echo' || ev.mission === 'song';
    for (const th of this.evItems) {
      if (th.cased) {
        const d = Math.hypot(th.x - px, th.y - py);
        if (d < CASE_KNOCK_RANGE) {
          th.knock -= dt;
          if (th.knock <= 0) {
            const near = 1.0 - d / CASE_KNOCK_RANGE;
            th.knock = CASE_KNOCK_EVERY[1] + (CASE_KNOCK_EVERY[0] - CASE_KNOCK_EVERY[1]) * near;
            this._bShotAt('event_case_knock', [th.x, th.y], CASE_KNOCK_LEVEL[0] + (CASE_KNOCK_LEVEL[1] - CASE_KNOCK_LEVEL[0]) * near);
          }
        }
        if (d < CASE_REACH) {
          if (!th.near) { th.near = true; this._bShotAt(this.bSnd.bell, [th.x, th.y], 0.8); }
        } else if (d > CASE_REARM) th.near = false;
      } else if (calls && th.frag && !th.channel) {
        th.knock -= dt;
        if (th.knock <= 0) {
          th.knock = ev[ev.mission].call_every_seconds * uniform(0.85, 1.15);
          this._bShotAt(th.frag, [th.x, th.y], ev.item.volume);
        }
      }
    }
  },

  // Space (a two-finger tap), before the weapon gets it. True if it was used here: to
  // smash the case the player stands beside, or in a Lure event to throw a stone.
  _bFire() {
    const [px, py] = this.playerPos;
    let best = null;
    for (const th of this.evItems) {
      if (th.cased) {
        const d = Math.hypot(th.x - px, th.y - py);
        if (d < CASE_REACH && (best === null || d < best[0])) best = [d, th];
      }
    }
    if (best) { this._bSmash(best[1]); return true; }
    if (this.ev.mission === 'lure') { this._bThrow(); return true; }
    return false;
  },

  // A case is smashed: always the sound of glass. Broken glass lies round where it
  // stood; then its extra reward, and what the noise brings; and whatever was in it
  // is the player's at once, with nothing to pick up.
  _bSmash(th) {
    const ca = this.ev.cases;
    const pos = [th.x, th.y];
    th.cased = false;
    this._mStop(th);
    this._bShotAt(this.bSnd.smash, pos);
    const [cx, cy] = cellOf(...pos);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      if (Math.hypot(i, j) * STEP < GLASS_RADIUS && !this.bWalls.has(K(cx + i, cy + j))) this.bGlassExtra.add(K(cx + i, cy + j));
    }
    this._bReward(ca);
    if (ca.noise === 'wake') this._bNoise('smash', pos);
    else if (ca.noise === 'chasers') this._bChasers();
    this._eventTakeItem(th);                  // last: it may end the level, or the run
  },

  _bNewTune() {
    const fr = this.ev.fragments;
    if (fr.tune === 'random') {
      const names = tunes.tuneNames().filter((n) => n !== this.bTune);
      this.bTune = choice(names.length ? names : tunes.tuneNames());
    } else this.bTune = fr.tune;
    this.bFrags = []; this.bFragAt = 0;
  },

  // The next item's fragment. In Rebuild the Song the tune is cut into as many pieces
  // as the level has items, handed out in a shuffled order; otherwise it is cut into
  // fragments of a few notes, taken in turn from its first note on.
  _bNextFrag() {
    const fr = this.ev.fragments; const it = this.ev.item;
    if (!this.bFrags.length) {
      if (this.ev.mission === 'song') this.bFrags = shuffle(tunes.pieces(this.bTune, Math.max(1, it.total - this.evCollected)));
      else this.bFrags = tunes.split(this.bTune, fr.notes_fewest, fr.notes_most);
      this.bFragAt = 0;
    }
    const [start, count] = this.bFrags[this.bFragAt % this.bFrags.length];
    this.bFragAt += 1;
    return this._bFragSound(this.bTune, start, count);
  },

  // The sound of some notes of a tune (count null: to its end), made the first time it is asked for.
  _bFragSound(tune, start, count) {
    const inst = this.ev.fragments.instrument;
    const name = `event_frag_${tune}_${inst}_${start}_${count === null ? 'all' : count}`;
    if (!this.audio.has(name)) {
      try { addMade(this.audio, name, tunes.render(tune, inst, start, count)); } catch (e) { return null; }
    }
    return name;
  },

  // ================================================================ things in the room
  _bThing(sound, minD = 9.0) {
    return this._bLoop(new this._Thing(...this._eventSpot(minD, 0)), sound);
  },

  // Traps, safe spots, teleports and treasure chests, for a level.
  _bLayThings() {
    const ev = this.ev;
    for (let i = 0; i < ev.traps.count; i++) this.bTraps.push(this._bThing(this.bSnd.trap));
    for (let i = 0; i < ev.safe_spots.count; i++) this.bSafes.push(this._bThing(this.bSnd.safe, 12.0));
    for (let i = 0; i < ev.teleports.pairs; i++) {
      const a = this._bThing(this.bSnd.port);
      this.bPorts.push(a);
      const b = this._bThing(this.bSnd.port, 12.0);
      this.bPorts.push(b);
      a.target = b; b.target = a;
    }
    for (let i = 0; i < ev.chests.count; i++) if (random() < ev.chests.chance) this.bChests.push(this._bThing(this.bSnd.chest, 12.0));
  },

  _bClearThings() {
    for (const th of [...this.bTraps, ...this.bSafes, ...this.bPorts, ...this.bChests]) this._mStop(th);
    this.bTraps = []; this.bSafes = []; this.bPorts = []; this.bChests = [];
  },

  // Whether the player stands in a safe spot, where no creature can touch them.
  _bSafe() {
    const r = this.ev ? this.ev.safe_spots.radius : 0;
    const [px, py] = this.playerPos;
    return (this.bSafes || []).some((t) => Math.hypot(t.x - px, t.y - py) <= r);
  },

  // The step that has just landed: onto a trap, or onto a teleport. Any step counts
  // for these (they are not things to collect), sideways steps too.
  _bStepThings() {
    const ev = this.ev;
    const here = sqKey(...this.playerPos);
    for (const th of [...this.bTraps]) {
      if (sqKey(th.x, th.y) === here) {
        const tr = ev.traps;
        this.audio.play('player_hit');
        [th.x, th.y] = this._eventSpot(9.0, 0);       // sprung: it is set again somewhere else
        if (tr.cost === 'life') this.bPending.push([this.evElapsed, 'life', null]);
        else if (tr.cost === 'time' && this.evClock) { this.timeLeft -= tr.penalty; this.lastBeepSecond = -1; }
        else this.evPoints = Math.max(0, this.evPoints - tr.penalty);
        return;
      }
    }
    for (const th of this.bPorts) {
      if (sqKey(th.x, th.y) === here && th.target) {
        const other = th.target;
        this.audio.play('event_pickup_star');
        const c = cellOf(other.x, other.y);
        this.playerPos = [c[0] * STEP, c[1] * STEP];
        return;
      }
    }
  },

  // ================================================================ the new missions' own things
  // Lure: a stone flies a set number of steps the way the player last stepped (a wall
  // or the edge of the room stops it short), and lands with a noise.
  _bThrow() {
    const lu = this.ev.lure;
    if (this.bCarry <= 0) { this.audio.play('empty_click'); return; }
    this.bCarry -= 1;
    const [dx, dy] = this.evLastStep || [0, -1];
    let [x, y] = this.playerPos;
    for (let i = 0; i < lu.throw_steps; i++) {
      const nx = x + dx * STEP; const ny = y + dy * STEP;
      if (Math.abs(nx) > this.arenaLimit || Math.abs(ny) > this.arenaLimit || this.bWalls.has(sqKey(nx, ny))) break;
      x = nx; y = ny;
    }
    if (this.audio.has('item_throw')) this.audio.play('item_throw');
    this.bPending.push([this.evElapsed + 0.5, 'stone', [x, y]]);
  },

  // Silent escape: a room's way out and its creatures, the first kind more in each
  // room. After the first room the walls, floor and things are laid afresh.
  _bSilentRoom(first = false) {
    const si = this.ev.silent;
    if (!first) { this._bClearThings(); this._bLayRoom(); }
    this._mStop(this.mExit);
    for (const h of this.evHazards) this._mStop(h);
    this.evHazards = [];
    const snd = si.exit_sound === 'exit_morse' ? 'exit_morse' : (this._bRec(si.exit_sound, 'beacon') || 'exit_morse');
    this.mExit = this._bLoop(new this._Thing(...this._eventSpot(si.exit_distance, 0)), snd);
    const want = Math.min(si.most, si.first_room + si.more_each_room * this.bRoomsDone);
    for (let i = 0; i < want; i++) this._eventSpawnHazard(i);
    this._bSpawnKinds();
    if (!first) this._bLayThings();
  },

  // Storm chase: the next shelter, and the storm coming from a new side.
  _bStormNext() {
    const sm = this.ev.storm;
    this._mStop(this.bShelter);
    this.bShelter = this._bLoop(new this._Thing(...this._eventSpot(sm.shelter_distance, 0)), this.bSnd.shelter);
    this.bStormLeft = Math.max(sm.seconds_least, sm.seconds_first - sm.seconds_less_each * this.bShelters);
    this.bStormFull = this.bStormLeft;
    this.bStormFrom = choice(DIRS); this.bThunder = 1.5;
  },

  // After the mission has set itself up: the other kinds of creature, the things in
  // the room, and what the new missions need.
  _bStart(ev, carried = false) {
    const m = ev.mission;
    if (m === 'silent') this._bSilentRoom(true);
    else this._bSpawnKinds();
    this._bLayThings();
    if (m === 'lure') {
      this.bCarry = ev.lure.start_stones;
      for (let i = 0; i < ev.lure.stones_at_once; i++) this.bStones.push(this._bThing(this.bSnd.stone));
    }
    if (m === 'storm') this._bStormNext();
    this._bBeginWords(carried);
  },

  // ================================================================ every frame
  _bRefill() {
    const me = this.ev.meter;
    const full = me.seconds;
    this.bMeter = !me.refill_seconds ? full : Math.min(full, this.bMeter + me.refill_seconds);
    this.bMeterWarn = 0.0;
  },

  // The blocks' work each frame. True if the run ended (or a new stage began).
  _bUpdate(dt) {
    const ev = this.ev;
    const m = ev.mission;
    for (const entry of [...this.bPending]) {
      const [when, what, data] = entry;
      if (this.evElapsed < when) continue;
      this.bPending.splice(this.bPending.indexOf(entry), 1);
      if (what === 'stone') {
        this._bShotAt('wall', data);
        this._bNoise('stones', data);
      } else if (what === 'hit') {
        if (this._bApplyTouch(data)) return true;
      } else if (what === 'life') {
        this.evLives = (this.evLives === undefined ? 1 : this.evLives) - 1;
        if (this.evLives <= 0) { this._eventFinish('trap'); return true; }
      }
    }
    this._bUpdateItems(dt);
    const tr = ev.traps;
    for (const th of this.bTraps) {
      const [left, right, dist] = this._battleLevels([th.x, th.y], 1.0);
      const f = Math.max(0.0, Math.min(1.0, 2.0 * (1.0 - dist / tr.hearing)));     // a faint warning, only from near
      if (th.channel) th.channel.setVolume(Math.min(1.0, left) * f, Math.min(1.0, right) * f, this._behind([th.x, th.y]));
    }
    for (const th of [...this.bSafes, ...this.bPorts]) this._bFollow(th, 0.7);
    for (const th of [...this.bChests]) {
      this._bFollow(th, 0.8);
      if (this.evSteppedOnto([th.x, th.y])) {
        this._mStop(th);
        this.bChests.splice(this.bChests.indexOf(th), 1);
        this.audio.play(this.bSnd.chest_open);
        this._bReward({ ...ev.chests, extra: 'random' });
      }
    }
    const su = ev.supplies;
    for (const k of Object.keys(this.bSupplyTimers)) {
      this.bSupplyTimers[k] -= dt;
      if (this.bSupplyTimers[k] <= 0) {
        this.bSupplyTimers[k] = su[`${k}_every_seconds`];
        if (k === 'ammo' && this.evUnlimited()) continue;       // unlimited shots: no ammo boxes
        if (!this.bSupplies.some((t) => t.role === k)) {
          const th = this._bThing(this.bSupplySnd[k][0], su.min_distance);
          th.role = k; th.age = 0.0;
          this.bSupplies.push(th);
        }
      }
    }
    for (const th of [...this.bSupplies]) {
      th.age += dt;
      const taken = this.evSteppedOnto([th.x, th.y]);
      if (taken || (su.lasts_seconds && th.age >= su.lasts_seconds)) {
        this._mStop(th);
        this.bSupplies.splice(this.bSupplies.indexOf(th), 1);
        if (taken) {
          this.audio.play(this.bSupplySnd[th.role][1]);
          if (th.role === 'ammo') this.evShots += su.ammo_amount;
          else if (th.role === 'life') this.evLives = (this.evLives === undefined ? 1 : this.evLives) + 1;
          else this.evPoints += su.points_amount;
        }
        continue;
      }
      this._bFollow(th, 0.8);
    }
    if (this.bMeter !== null) {
      const me = ev.meter;
      const full = me.seconds;
      if (me.refill === 'safe_spot' && this._bSafe()) this.bMeter = Math.min(full, this.bMeter + full * dt / SAFE_REFILL);
      else this.bMeter -= dt;
      if (me.refill === 'pickups') {
        this.bRefillTimer -= dt;
        if (this.bRefillTimer <= 0) {
          this.bRefillTimer = me.pickup_every_seconds;
          if (this.bRefills.length < 2) this.bRefills.push(this._bThing(this.bSnd.refill, 12.0));
        }
        for (const th of [...this.bRefills]) {
          this._bFollow(th, 0.8);
          if (this.evSteppedOnto([th.x, th.y])) {
            this._mStop(th);
            this.bRefills.splice(this.bRefills.indexOf(th), 1);
            this.audio.play('event_pickup_heart');
            this._bRefill();
          }
        }
      }
      if (this.bMeter <= 0) { this._eventFinish('meter'); return true; }
      if (this.bMeter <= me.warn_at_seconds) {
        this.bMeterWarn -= dt;
        if (this.bMeterWarn <= 0) {
          this.bMeterWarn = Math.max(0.4, 1.6 * this.bMeter / Math.max(1.0, me.warn_at_seconds));
          this.audio.play(this.bSnd.warn);
        }
      }
    }
    if (m === 'lure') {
      for (const th of this.bStones) {
        this._bFollow(th, 0.7);
        if (this.bCarry < ev.lure.carry_most && this.evSteppedOnto([th.x, th.y])) {
          this.bCarry += 1;
          this.audio.play('event_checkpoint');
          [th.x, th.y] = this._eventSpot(9.0, 0);
        }
      }
    } else if (m === 'silent') {
      const ex = this.mExit;
      if (ex && this._mReached(ex, 0.9)) {
        this.evPoints += ev.silent.points_per_room;
        this.bRoomsDone += 1;
        this.audio.play('stairs_climb');
        if (this._bEndingReached(this.bRoomsDone)) return true;
        this._bSilentRoom();
        this._bSayLevel(this.bRoomsDone + 1, 'Room');
      }
    } else if (m === 'storm') {
      const sm = ev.storm;
      this.bStormLeft -= dt;
      const frac = Math.max(0.0, this.bStormLeft / Math.max(1.0, this.bStormFull));
      this.bThunder -= dt;
      if (this.bThunder <= 0) {
        // The thunder comes nearer, louder and more often as the time runs out.
        this.bThunder = 1.0 + 5.0 * frac;
        const far = 12.0 + 70.0 * frac;
        this._bShotAt(this.bSnd.thunder, [this.playerPos[0] + this.bStormFrom[0] * far, this.playerPos[1] + this.bStormFrom[1] * far], 0.6 + 0.9 * (1.0 - frac));
      }
      if (this._mReached(this.bShelter, 0.9)) {
        this.evPoints += sm.points_per_shelter;
        this.bShelters += 1;
        this.audio.play('event_checkpoint');
        if (this._bEndingReached(this.bShelters)) return true;
        this._bStormNext();
        this._bSayLevel(this.bShelters + 1, 'Shelter');
      } else if (this.bStormLeft <= 0) { this._eventFinish('storm'); return true; }
    }
    return false;
  },

  // ================================================================ the report, and the end of a run
  // What the blocks add to the report: the stage, the level, the meter.
  _bStatusExtra() {
    const ev = this.ev;
    if (!ev) return '';
    const m = ev.mission; const bits = [];
    const base = this.bStageBase;
    if (base) bits.push(`Stage ${this.bStage + 1} of ${base._stages.length}.`);
    if (this.bLevels) bits.push(`Level ${this.bLevel}.`);
    if (m === 'silent') bits.push(`Room ${this.bRoomsDone + 1}.`);
    else if (m === 'storm') bits.push(`Shelter ${this.bShelters + 1}. ${Math.trunc(Math.max(0, this.bStormLeft))} seconds before the storm.`);
    else if (m === 'lure') bits.push(`${this.bCarry} stone${s(this.bCarry)} in hand.`);
    if (this.bMeter !== null && this.bMeter !== undefined) {
      const name = ev.meter.name.trim();
      bits.push(`${name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()}: ${Math.trunc(Math.max(0, this.bMeter))} seconds.`);
    }
    return bits.length ? ' ' + bits.join(' ') : '';
  },

  // What ended the run, for the endings format 2 added, or null.
  _bReason(reason) {
    const ev = this.ev;
    if (reason === 'finished') {
      if (this.bStageBase) return 'You finished every stage! ';
      const what = { silent: 'escaped every room', escape: 'escaped every room', keys: 'unlocked every door',
        storm: 'reached every shelter', song: 'rebuilt every song', order: 'finished every round',
        memory: 'finished every round', pairs: 'finished every round', chairs: 'finished every round' }[ev.mission]
        || (MORE[ev.mission] || {}).finished || 'finished every level';
      const bonus = ev.ending.finish_bonus;
      return `You ${what}! ` + (bonus ? `Bonus ${bonus} point${s(bonus)}. ` : '');
    }
    return { meter: `Your ${ev.meter.name.trim()} ran out. `, storm: 'The storm caught you. ', trap: 'A trap got you. ' }[reason] || null;
  },

  // The results of a run of a new mission, or of an event in stages; null for the
  // rest, which keep their own.
  _bResult() {
    const ev = this.ev; const it = ev.item;
    const m = ev.mission; const n = this.evCollected;
    const total = Math.trunc(this.evPoints);
    const p = `${total} point${s(total)}`;
    const word = n === 1 ? it.name : it.plural;
    const base = this.bStageBase;
    if (base) {
      const done = this.bStage + (SUCCESS.includes(this.bLastReason) ? 1 : 0);
      return `You finished ${done} of ${base._stages.length} stages for ${p}. `;
    }
    const lv = this.bLevelsDone;
    if (m === 'memories') return `You found ${n} ${word} and finished ${lv} level${s(lv)} for ${p}. `;
    if (m === 'smash') return `You smashed ${n} case${s(n)} for ${p}. `;
    if (m === 'silent') return `You escaped ${this.bRoomsDone} room${s(this.bRoomsDone)} for ${p}. `;
    if (m === 'echo') return `You found ${n} ${word} for ${p}. `;
    if (m === 'lure') return `You collected ${n} ${word} for ${p}. `;
    if (m === 'song') return `You rebuilt ${lv} song${s(lv)} and found ${n} piece${s(n)} for ${p}. `;
    if (m === 'storm') return `You reached ${this.bShelters} shelter${s(this.bShelters)} for ${p}. `;
    return null;
  },

  _bStopAll() {
    for (const th of [...(this.bTraps || []), ...(this.bSafes || []), ...(this.bPorts || []), ...(this.bChests || []),
      ...(this.bSupplies || []), ...(this.bRefills || []), ...(this.bStones || []), ...(this.bShelter ? [this.bShelter] : [])]) this._mStop(th);
    this.bTraps = []; this.bSafes = []; this.bPorts = []; this.bChests = [];
    this.bSupplies = []; this.bRefills = []; this.bStones = []; this.bShelter = null;
    this.bPending = [];
  },
};
