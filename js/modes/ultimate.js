// Ultimate Test Mode (web 2.0.0): the hardest mode in the game, made for the web
// alone, from Russell's design of 8 November 2026 (the plan document "Endless
// Labyrinth Web: Ultimate Test Mode Plan"). Chaos tests switching between modes
// against the clock; this tests survival: how long you can last in one huge,
// mixed world, heard in binaural 3D (the browser's HRTF panning, see audio.js).
//
// The world (ultimate/world.js) is five to ten areas of five kinds, each keeping
// its home mode's sounds: labyrinths (walls, navigation), islands (a shore, sand
// underfoot, an elevator down to the seabed, chasers), tower areas (throwers that
// race you for items and throw them), battle areas (chasers you shoot) and event
// areas (the event backgrounds; no enemies: the safe zones). It regenerates on a
// timer (3 minutes, then 2 and a half, then 2), with a spoken warning at 15
// seconds and Battle's countdown over the last 5, fading out, a silence, and a
// new world fading in with 5 safe seconds. There is no clock on the run: it ends
// when health runs out. Points come from kills, pickups and credits, times a
// survival multiplier that rises with every world survived. Every number marked
// "tune" is a starting value for Russell to judge by ear.
//
// Enemies never leave their areas. Ammo is carried everywhere and has no limit;
// tower items belong to the tower area they were found in. A compass (hold a
// finger still for a second; C on a keyboard) points along the walkable route to
// the nearest safe zone with a centred beep, highest toward the way to go, while
// the world is muffled and nothing can move.

import { TowerEnemy, TowerItem, TowerProjectile, volleySpread, TOWER_DRONES } from './tower.js';
import { addMade, aliasRecording, ensureCopies } from './events/sounds.js';
import { HELP_SECTIONS, HELP_DEMOS } from './ultimate/help.js';
import {
  makeWorld, makeSeabed, CELL, AREA_CELLS, key, cellOf, posOf, isFloor, areaAt, nearestPointOf, leakPoint, echoMix,
  randomFloor, firstStepToward,
} from './ultimate/world.js';

export const STATE = 'ultimate';
export const BOARD = 'ultimate';

// ------------------------------------------------------------------ the numbers (tune)
export const WORLD_SECONDS = [180, 150, 120];   // the first world, the second, then every one after
export const WARN_AT = 15;                      // "World regenerating in 15 seconds."
export const COUNT_FROM = 5;                    // Battle's countdown over the last seconds
export const NO_SPAWN_FROM = 3;                 // nothing new appears in the last seconds
export const FADE_OUT = 2.0;                    // the old world fades over its last two seconds
export const SILENCE = 0.6;                     // between worlds
export const FADE_IN = 1.0;
export const SAFE_SECONDS = 5.0;                // after a new world fades in
export const EASY_SECONDS = 120;                // the easy stretch
export const START_HP = 100;
export const DAMAGE_START = 5;                  // a hit in the easy stretch
export const DAMAGE_CAP = 25;                   // Tower's cap: death takes at least four hits
export const DAMAGE_PER_MINUTE = 1.5;           // after the easy stretch, toward the cap
export const ENEMIES_EASY = [1, 2];             // per enemy area
export const ENEMIES_MAX = 10;                  // in one area (the event engine's creature limit)
export const ENEMIES_PER_MINUTE = 1.0;          // the base count rises this fast after the easy stretch
export const SPEED_RISE = 0.25;                 // speed multiplier added over SPEED_RISE_MINUTES
export const SPEED_RISE_MINUTES = 10;
export const SPEED_WELL = 1.10;                 // a world done well: enemies this much faster
export const SPEED_CAP = 1.5;
export const WELL_POINTS = 60;                  // doing well in a world: at least this many base points...
export const WELL_DAMAGE = 25;                  // ...with no more damage than this
export const CHASER_SPEED = 2.6;                // units a second (the player's run is about 14)
export const CHASER_TOUCH = 1.6;
export const CHASER_PUSH = 15.0;                // a chaser that struck is set back this far
export const HIT_COOLDOWN = 1.0;
export const RESPAWN_ENEMY = [8, 15];           // seconds after a kill
export const RESPAWN_PICKUP = [10, 20];         // ammo and credits, out in the world
export const SAFE_AMMO_EVERY = 15;              // a safe zone's one cartridge comes back after this long
export const AMMO_SHOTS = [3, 6];
export const AMMO_PER_ENEMY = 0.6;              // cartridges in the world per enemy, never under AMMO_MIN
export const AMMO_MIN = 3;
export const CREDITS_AT_ONCE = [2, 3];
export const CREDIT_VALUES = [40, 50, 60];
export const POTION_BELOW = 50;
export const POTION_DELAY = [3, 8];
export const LOW_AMMO_FROM = 5;
export const POINTS = { chaser: 10, thrower: 20, ammo: 5, potion: 10 };
export const MULTIPLIER_STEP = 0.5;             // times 1, 1.5, 2 ... by world
export const HEAR_RANGE = 55.0;                 // enemies and pickups fade to nothing by here
export const AMBIENCE_RANGE = 45.0;             // an area's air, outside it
export const AMBIENCE_LEVEL = 0.8;
export const DOOR_LEAK = 0.85;                  // through a doorway, against an open border
export const REACH = 1.6;                       // walking into a thing: its own cell
export const COMPASS_HOLD_MS = 1000;
export const COMPASS_BEEP_EVERY = 0.45;
export const ARENA = (AREA_CELLS - 1) / 2 * CELL;   // an area, as a tower floor sees it: 31.5 each way
export const SEABED_RANGE = 30.0;
export const RIDE_MIN = 4.0;
export const RIDE_MAX = 16.0;
export const RIDE_TIME = 8.0;
const DOORS_SHUT = 0.34; const DOORS_OPEN = 0.67; const DOORS_WIDE = 0.93;   // the ride's stages (island.js)
const ARRIVE_CHIME_LEAD = 0.5;
const FPS = 30;
const RATE = 44100;

const LABYRINTH_DRONES = ['lab_01_cavewind', 'lab_02_scary_cave', 'lab_03_scifi_cave', 'lab_04_dungeon_air',
  'lab_05_catacombs', 'lab_06_creepy_basement', 'lab_07_horror_basement', 'lab_08_waterflow_2',
  'lab_09_waterflow_1', 'lab_10_dreary_tunnels', 'lab_11_tunnel_fan'];
const BATTLE_DRONES = ['bat_01_deep_drone', 'bat_02_creepy_dark', 'bat_03_dark_ambient', 'bat_04_dark_drone',
  'bat_05_ominous', 'bat_06_grinding', 'bat_07_texture', 'bat_08_eerie', 'bat_09_suspenseful', 'bat_10_static',
  'bat_11_horror_suspense'];
const BATTLE_DRUMS = ['drm_01_tribe_loop', 'drm_02_horde_war', 'drm_03_loop_75', 'drm_04_loop_80',
  'drm_05_ancient_war', 'drm_06_tribal_beat', 'drm_07_tribal_drums', 'drm_08_hybrid_epic', 'drm_09_djembe'];
const ISLAND_SHORES = ['island_01_maldives_beach', 'island_02_sandy_beach_calm', 'island_03_waves_birdsong_gull',
  'island_04_sea_and_seagull', 'island_05_lapping_far_gulls', 'island_06_wind_and_waves', 'island_07_rock_beach',
  'island_08_gentle_shore', 'island_09_waves_breaking', 'island_10_beach_ambiance'];
// The event backgrounds an event area may have (the event library's ambiences;
// the Event Maker's own list). Each is a place in its own right.
export const EVENT_BACKGROUNDS = ['evt_amb_bees', 'evt_amb_blizzard', 'evt_amb_cafe', 'evt_amb_campfire', 'evt_amb_cathedral',
  'evt_amb_cathedral_organ', 'evt_amb_cave_drips', 'evt_amb_cicadas', 'evt_amb_city_night', 'evt_amb_clock', 'evt_amb_crickets',
  'evt_amb_dark_choir', 'evt_amb_desert', 'evt_amb_fast_food', 'evt_amb_fireplace', 'evt_amb_fireworks', 'evt_amb_forest_night',
  'evt_amb_ghost_choir', 'evt_amb_graveyard', 'evt_amb_halloween_strings', 'evt_amb_haunted_house', 'evt_amb_haunted_space',
  'evt_amb_howling_wind', 'evt_amb_ice_cave', 'evt_amb_industrial', 'evt_amb_jungle', 'evt_amb_kitchen', 'evt_amb_lava',
  'evt_amb_library', 'evt_amb_market', 'evt_amb_marsh_frogs', 'evt_amb_medieval_village', 'evt_amb_morning_birds',
  'evt_amb_ocean_night', 'evt_amb_organ', 'evt_amb_rain', 'evt_amb_restaurant_kitchen', 'evt_amb_river', 'evt_amb_ship_creak',
  'evt_amb_sizzling_oil', 'evt_amb_space', 'evt_amb_spaceship', 'evt_amb_spooky', 'evt_amb_spring_birds', 'evt_amb_stadium_crowd',
  'evt_amb_storm', 'evt_amb_summer', 'evt_amb_tavern', 'evt_amb_train_station', 'evt_amb_underwater', 'evt_amb_water_drip',
  'evt_amb_waterfall', 'evt_amb_wind_trees', 'evt_amb_winter_wind', 'evt_amb_witch'];
// Backgrounds that sound like the open air ring in the long hall, the rest in the cathedral.
const OPEN_AIR = /bees|blizzard|cicadas|city|crickets|desert|fireworks|forest|graveyard|howling|jungle|market|marsh|medieval|morning|ocean|rain|river|spring|stadium|storm|summer|village|water|wind|winter/;
const STEPS_STONE = ['step_stone_1', 'step_stone_2', 'step_stone_3', 'step_stone_4'];
const STEPS_SAND = ['step_sand_1', 'step_sand_2', 'step_sand_3', 'step_sand_4'];

// ------------------------------------------------------------------ helpers
const rand = Math.random;
const uniform = (a, b) => a + (b - a) * rand();
const randint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const choice = (arr) => arr[Math.floor(rand() * arr.length)];
const plural = (n, word, many = word + 's') => (n === 1 ? word : many);
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const levelAt = (d, range = HEAR_RANGE) => Math.max(0, 1 - d / range);
const BATTLE_AIM_PAN = 0.72;

function pointToSegment(x, y, a, b) {
  const [ax, ay] = a; const [bx, by] = b;
  const dx = bx - ax; const dy = by - ay;
  const span = dx * dx + dy * dy;
  const t = span <= 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / span));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

// Seconds as words for the end of a run: "4 minutes 12 seconds".
export function spokenTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60); const r = s % 60;
  if (!m) return `${r} ${plural(r, 'second')}`;
  if (!r) return `${m} ${plural(m, 'minute')}`;
  return `${m} ${plural(m, 'minute')} ${r} ${plural(r, 'second')}`;
}

// ------------------------------------------------------------------ the game's own sounds
// Made by the game itself (no recording, no credit): the low-ammo tones, highest
// at five shots left and lowest at one, and the compass beep.
const LOW_AMMO_HZ = [0, 554, 622, 698, 784, 880];     // index = shots left
function tone(hz, seconds, peak = 0.35, decay = 0.012) {
  const n = Math.floor(RATE * seconds);
  const L = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.004) * Math.exp(-t / (seconds * 0.35));
    L[i] = Math.sin(2 * Math.PI * hz * t) * env * peak * 32768;
  }
  return [L, Float64Array.from(L)];
}
function joined(parts, gapSeconds) {
  const gap = Math.floor(RATE * gapSeconds);
  const n = parts.reduce((s, p) => s + p[0].length + gap, 0);
  const L = new Float64Array(n); let at = 0;
  for (const p of parts) { L.set(p[0], at); at += p[0].length + gap; }
  return [L, Float64Array.from(L)];
}
export const COMPASS_HZ = [392, 1046];   // the beep, lowest away from the route, highest toward it
export function compassName(step) { return `ut_compass_${step}`; }   // step 0..8
export function makeSounds(audio) {
  if (audio.has('ut_low_ammo_1')) return;
  for (let n = 1; n <= LOW_AMMO_FROM; n++) addMade(audio, `ut_low_ammo_${n}`, tone(LOW_AMMO_HZ[n], 0.22));
  addMade(audio, 'ut_low_ammo_demo', joined([5, 4, 3, 2, 1].map((n) => tone(LOW_AMMO_HZ[n], 0.22)), 0.3));
  for (let s = 0; s <= 8; s++) {
    const hz = COMPASS_HZ[0] * Math.pow(COMPASS_HZ[1] / COMPASS_HZ[0], s / 8);
    addMade(audio, compassName(s), tone(hz, 0.16, 0.3));
  }
  addMade(audio, 'ut_compass_demo', joined([0, 2, 4, 6, 8, 6, 4, 2, 0].map((s) => {
    const hz = COMPASS_HZ[0] * Math.pow(COMPASS_HZ[1] / COMPASS_HZ[0], s / 8);
    return tone(hz, 0.16, 0.3);
  }), 0.3));
  for (const n of ['ut_low_ammo_demo', 'ut_compass_demo']) ensureCopies(audio, n);
}

// ------------------------------------------------------------------ things in the world
// A chaser (Battle's enemy, in a battle or island area): it comes at you while you
// are in its area, wanders when you are not, and never leaves the area.
class Chaser {
  constructor(area, pos, speed, soundIdx) {
    this.kind = 'chaser';
    this.area = area;
    [this.x, this.y] = pos;
    this.speed = speed;
    this.soundIdx = soundIdx;
    this.soundName = 'obstacle_' + soundIdx;
    this.voice = null;
    this.goal = null;
    this.goalTimer = 0;
  }
}

// ------------------------------------------------------------------ the mode
const mixin = {
  startUltimate() {
    this.state = STATE;
    this.resetGameState();
    this.state = STATE;
    this._wake(true);
    if (this.ambienceChannel) { this.ambienceChannel.stop(); this.ambienceChannel = null; }
    if (this.beatChannel) { this.beatChannel.stop(); this.beatChannel = null; }
    makeSounds(this.audio);
    this.audio.spatialOn();
    this.audio.setWorldLevel(1, 0.01);
    this.audio.setMuffle(false, 0.01);
    this.audio.prepare('elevator_ride');
    const u = this.ut = {
      run: this.runId,
      worldNo: 0, worlds: 0, elapsed: 0.0, worldTime: 0.0, phase: 'play', gap: 0.0, safe: 0.0, warned: false, lastCount: -1,
      hp: START_HP, ammo: 0, points: 0, worldPoints: 0, worldDamage: 0, kills: 0, speedBonus: 1.0,
      world: null, area: null, areaSounds: new Map(), enemies: [], projectiles: [], towerItems: new Map(), towerCarry: null,
      pickups: [], timers: [], respawn: new Map(), potionPending: 0, hitCooldown: 0, lowWarned: false,
      place: 'world', ride: null, seabed: null, lift: null, liftArmed: false, dingTimer: 0,
      compass: { on: false, dir: 0, t: 0 }, prox: 0, steps: [],
      voices: new Set(),
    };
    this.tts.speak('', { interrupt: true });   // the menu's words stop; the world says the rest
    this._utNewWorld(true);
  },

  // ---------------------------------------------------------------- difficulty (tune)
  _utEasy() { return this.ut.elapsed < EASY_SECONDS; },

  _utDamage() {
    const t = this.ut.elapsed;
    if (t < EASY_SECONDS) return DAMAGE_START;
    return Math.min(DAMAGE_CAP, Math.round(DAMAGE_START + (t - EASY_SECONDS) / 60 * DAMAGE_PER_MINUTE));
  },

  // How many enemies an enemy area gets, drawn when the world is made.
  _utEnemyCount() {
    const t = this.ut.elapsed;
    if (t < EASY_SECONDS) return randint(ENEMIES_EASY[0], ENEMIES_EASY[1]);
    const base = Math.min(ENEMIES_MAX, 1 + Math.floor((t - EASY_SECONDS) / 60 * ENEMIES_PER_MINUTE));
    return randint(base, Math.min(ENEMIES_MAX, base + 2));
  },

  // Enemy speed against the start: slowly up with time after the easy stretch,
  // and a little more for every world done well, never above SPEED_CAP.
  _utSpeedMul() {
    const t = this.ut.elapsed;
    const time = t < EASY_SECONDS ? 0 : Math.min(SPEED_RISE, (t - EASY_SECONDS) / (SPEED_RISE_MINUTES * 60) * SPEED_RISE);
    return Math.min(SPEED_CAP, (1 + time) * this.ut.speedBonus);
  },

  // A thrower's difficulty for TowerEnemy: tower one's first floors at the start,
  // tower three's deep into a run (its hits needed and throws follow).
  _utThrowerDifficulty() {
    return Math.max(1, Math.min(40, 1 + Math.floor(this.ut.elapsed / 30)));
  },

  _utMultiplier() { return 1 + MULTIPLIER_STEP * this.ut.worlds; },

  _utShotsPerCartridge() {
    const load = this._utEasy() ? 0 : Math.floor((this.ut.elapsed - EASY_SECONDS) / 60 * ENEMIES_PER_MINUTE);
    return randint(AMMO_SHOTS[0], AMMO_SHOTS[1]) + Math.floor(load / 3);
  },

  // Points earned now: nothing in a safe zone, nothing while the compass is on.
  _utScore(base) {
    const u = this.ut;
    if (u.compass.on || this._utInSafeZone()) return;
    const got = Math.round(base * this._utMultiplier());
    u.points += got;
    u.worldPoints += base;
  },

  _utInSafeZone() {
    const u = this.ut;
    return u.place === 'world' && u.area && u.area.kind === 'event';
  },

  // ---------------------------------------------------------------- a world
  _utNewWorld(first = false) {
    const u = this.ut;
    u.worldNo += 1;
    u.world = makeWorld();
    const w = u.world;
    u.worldTime = WORLD_SECONDS[Math.min(WORLD_SECONDS.length - 1, u.worldNo - 1)];
    u.warned = false; u.lastCount = -1;
    u.phase = first ? 'play' : 'fadein';
    u.gap = first ? 0 : FADE_IN;
    u.safe = SAFE_SECONDS + (first ? 0 : FADE_IN);
    u.enemies = []; u.projectiles = []; u.pickups = []; u.timers = []; u.respawn = new Map();
    u.towerItems = new Map(); u.towerCarry = null; u.potionPending = 0;
    u.place = 'world'; u.ride = null; u.rideMix = null; u.seabed = null; u.lift = null; u.liftArmed = false; u.dingTimer = 0;
    this._utCompassOff(true);
    u.worldPoints = 0; u.worldDamage = 0;
    u.steps = [];
    this.battleSteps = [];
    this.stride = null;
    // Each area's own air: a drone of its home mode, a shore, or an event background.
    const used = new Set();
    const pick = (list) => { const free = list.filter((n) => !used.has(n)); const n = choice(free.length ? free : list); used.add(n); return n; };
    for (const a of w.areas) {
      a.room = { labyrinth: 'lab', battle: 'battle', tower: 'tower', island: null, event: null }[a.kind];
      a.stretch = { labyrinth: 0.9, battle: 1.4, tower: 1.15, island: 1, event: 1 }[a.kind] * uniform(0.9, 1.15);
      a.steps = a.kind === 'island' ? STEPS_SAND : STEPS_STONE;
      if (a.kind === 'labyrinth') a.ambience = pick(LABYRINTH_DRONES);
      else if (a.kind === 'battle') { a.ambience = pick(BATTLE_DRONES); a.drums = pick(BATTLE_DRUMS); }
      else if (a.kind === 'tower') a.ambience = pick(TOWER_DRONES);
      else if (a.kind === 'island') {
        a.ambience = pick(ISLAND_SHORES.filter((n) => this.audio.has(n)));
        a.elevator = [a.x0 + Math.floor(AREA_CELLS / 2), a.y0 + Math.floor(AREA_CELLS / 2)];   // the middle of the island
      }
      else {
        const stem = pick(EVENT_BACKGROUNDS.filter((n) => this.audio.has(n)));
        a.ambience = aliasRecording(this.audio, stem, `event_amb_file_${stem}`) || 'event_amb_cathedral';
        a.room = OPEN_AIR.test(stem) ? 'hall' : 'cathedral';
        a.stretch = (a.room === 'hall' ? 1.3 : 1.0) * uniform(0.9, 1.2);
      }
    }
    // Dropped in silently, somewhere at random.
    const startArea = choice(w.areas);
    const startCell = choice(startArea.floorCells.filter(([cx, cy]) => !(startArea.elevator && cx === startArea.elevator[0] && cy === startArea.elevator[1])));
    this.playerPos = posOf(startCell[0], startCell[1]);
    this.playerFacing = [0, -1];
    this.arenaLimit = 0;
    u.area = startArea;
    // Enemies, by area; ammo, credits; the safe zones' own cartridges.
    const mul = this._utSpeedMul();
    let total = 0;
    for (const a of w.areas) {
      if (!['battle', 'island', 'tower'].includes(a.kind)) continue;
      a.enemyCount = this._utEnemyCount();
      total += a.enemyCount;
      for (let i = 0; i < a.enemyCount; i++) this._utSpawnEnemy(a, mul, true);
      if (a.kind === 'tower') this._utSpawnTowerItem(a);
    }
    const cartridges = Math.max(AMMO_MIN, Math.ceil(total * AMMO_PER_ENEMY));
    for (let i = 0; i < cartridges; i++) this._utSpawnPickup('ammo', choice(w.areas.filter((a) => a.kind !== 'event')));
    for (const a of w.areas.filter((x) => x.kind === 'event')) this._utSpawnPickup('ammo', a, { safe: true });
    const credits = randint(CREDITS_AT_ONCE[0], CREDITS_AT_ONCE[1]);
    for (let i = 0; i < credits; i++) this._utSpawnPickup('credit', choice(w.areas));
    this._utRefreshRooms();
    this._utMaybePotion();     // already below fifty: the new world gets its potion too
    if (!first) this.audio.setWorldLevel(1, FADE_IN);
  },

  // Stop and forget every sound of the world that is ending.
  _utStopWorld(fadeMs = 0) {
    const u = this.ut;
    for (const v of [...u.voices]) { if (fadeMs > 0) v.fadeout(fadeMs); else v.stop(); }
    u.voices.clear();
    u.areaSounds.clear();
    for (const e of u.enemies) e.voice = null;
    for (const p of u.pickups) p.voice = null;
    for (const s of u.projectiles) s.channel = null;
    for (const it of u.towerItems.values()) it.channel = null;
    u.lift = null;
    if (u.ride && u.ride.voice) { u.ride.voice.stop(); u.ride.voice = null; }
    u.rideMix = null;
    if (u.compass.on) this._utCompassOff(true);
    this.stride = null;
  },

  // A sound of this world: played, remembered, and placed.
  _utPlay(name, pos, { loops = 0, volume = 1.0, fadeMs = 0, height = 0, direct = false } = {}) {
    const u = this.ut;
    const rel = this._utRel(pos);
    const v = this.audio.play(name, { loops, volume: 0.0, fadeMs, pos: pos ? rel : null, height, areaMix: pos ? this._utMixAt(pos) : null, direct });
    if (!v) return null;
    if (pos) v.setSpatial(volume, rel[0], rel[1], this._behind(pos), height); else v.setVolume(volume, volume);
    if (loops === -1) u.voices.add(v);
    return v;
  },

  // Where a position is, relative to the player (x east, z south).
  _utRel(pos) { return pos ? [pos[0] - this.playerPos[0], pos[1] - this.playerPos[1]] : [0, 0]; },

  _utMixAt(pos) {
    const u = this.ut;
    if (u.place !== 'world' || !u.world) return {};
    return echoMix(u.world, pos);
  },

  // Keep a placed loop up to date: level by distance, place, behind, echo mix.
  _utFollow(v, pos, level, height = 0) {
    if (!v) return;
    const rel = this._utRel(pos);
    v.setSpatial(level, rel[0], rel[1], this._behind(pos), height);
    v.setAreaMix(this._utMixAt(pos));
  },

  // The echoes kept ready: the player's area and its neighbours.
  _utRefreshRooms() {
    const u = this.ut;
    if (u.place !== 'world') { this.audio.setAreaRooms([]); return; }
    const near = this._utNearAreas();
    this.audio.setAreaRooms(near.map((a) => ({ id: a.id, room: a.room, stretch: a.stretch })));
  },

  _utNearAreas() {
    const u = this.ut;
    const a = u.area;
    if (!a) return [];
    const ids = new Set([a.id]);
    for (const b of a.borders) ids.add(b.a === a.id ? b.b : b.a);
    return u.world.areas.filter((x) => ids.has(x.id));
  },

  // ---------------------------------------------------------------- enemies
  _utSpawnEnemy(a, mul = this._utSpeedMul(), atStart = false) {
    const u = this.ut;
    const avoid = u.enemies.filter((e) => e.area === a).map((e) => [e.x, e.y]);
    const pos = randomFloor(u.world, a, rand, { from: this.playerPos, minDist: 14.0, avoid, clearance: 6.0 })
      || randomFloor(u.world, a, rand, { from: this.playerPos, minDist: 10.0 });
    if (!pos) return null;
    let e;
    if (a.kind === 'tower') {
      const diff = this._utThrowerDifficulty();
      e = new TowerEnemy([0, 0], diff, randint(0, 9), ARENA, 1, 0);
      e.kind = 'thrower';
      e.area = a;
      [e.x, e.y] = [pos[0] - a.centre[0], pos[1] - a.centre[1]];
      e.baseSpeed = e.speed = e.speed * mul;
      e.throwCd = e.baseThrowCd = e.throwCd / mul;
      e.cooldown = e.throwCd;
      e.notice = atStart ? 2.5 : 1.0;
      e.voice = null;
    } else {
      e = new Chaser(a, pos, CHASER_SPEED * mul, randint(0, 9));
    }
    u.enemies.push(e);
    return e;
  },

  _utEnemyPos(e) { return e.kind === 'thrower' ? [e.x + e.area.centre[0], e.y + e.area.centre[1]] : [e.x, e.y]; },

  _utKillEnemy(e, hitBy) {
    const u = this.ut;
    const pos = this._utEnemyPos(e);
    if (e.voice) { e.voice.stop(); u.voices.delete(e.voice); e.voice = null; }
    u.enemies.splice(u.enemies.indexOf(e), 1);
    u.kills += 1;
    this._utScore(POINTS[e.kind]);
    const d = dist2(pos, this.playerPos);
    this._utLater(Math.min(0.5, d * 0.015), 'explosion', pos);
    if (e.kind === 'thrower') {
      // Its throws in the air go with it.
      for (const s of [...u.projectiles]) if (s.owner === e) this._utDropProjectile(s);
    }
    // Another comes, in a while.
    const a = e.area;
    const t = u.respawn.get(a.id) || [];
    t.push(uniform(RESPAWN_ENEMY[0], RESPAWN_ENEMY[1]));
    u.respawn.set(a.id, t);
  },

  _utDropProjectile(s) {
    const u = this.ut;
    if (s.channel) { s.channel.stop(); u.voices.delete(s.channel); s.channel = null; }
    const i = u.projectiles.indexOf(s);
    if (i >= 0) u.projectiles.splice(i, 1);
  },

  // Struck: the damage of the moment, never over the cap; the run ends at zero.
  _utHurt(by) {
    const u = this.ut;
    if (u.safe > 0 || u.hitCooldown > 0 || u.compass.on) return;
    const dmg = this._utDamage();
    u.hp = Math.max(0, u.hp - dmg);
    u.worldDamage += dmg;
    u.hitCooldown = HIT_COOLDOWN;
    this.audio.play('player_hit');
    if (u.hp <= 0) { this._utGameOver(); return; }
    // Tower's low-health warning, with its words and its threshold.
    const low = Math.max(35, 2 * dmg);
    if (u.hp <= low && !u.lowWarned) {
      u.lowWarned = true;
      this.audio.play('health_low');
      this.tts.speak(`Health low. ${u.hp}.`, { interrupt: true });
    }
    this._utMaybePotion();
  },

  _utMaybePotion() {
    const u = this.ut;
    if (u.hp >= POTION_BELOW || u.potionPending > 0 || u.pickups.some((p) => p.kind === 'potion')) return;
    u.potionPending = uniform(POTION_DELAY[0], POTION_DELAY[1]);
  },

  // ---------------------------------------------------------------- pickups
  _utSpawnPickup(kind, area, { safe = false, pos = null } = {}) {
    const u = this.ut;
    const taken = u.pickups.map((p) => p.pos);
    const p = { kind, area, safe, pos: pos || randomFloor(u.world, area, rand, { from: this.playerPos, minDist: 10.0, avoid: taken, clearance: 7.0 }) };
    if (!p.pos) return null;
    if (area.elevator && cellOf(p.pos)[0] === area.elevator[0] && cellOf(p.pos)[1] === area.elevator[1]) return null;
    if (kind === 'ammo') { p.shots = this._utShotsPerCartridge(); p.beacon = 'ammo_beacon'; p.gain = 0.55; }
    else if (kind === 'credit') { p.value = choice(CREDIT_VALUES); p.beacon = `credit_beacon_${p.value}`; p.gain = 0.7; }
    else { p.beacon = 'potion_beacon'; p.gain = 0.8; }
    u.pickups.push(p);
    return p;
  },

  _utTakePickup(p) {
    const u = this.ut;
    const safe = this._utInSafeZone();
    if (p.voice) { p.voice.stop(); u.voices.delete(p.voice); p.voice = null; }
    u.pickups.splice(u.pickups.indexOf(p), 1);
    if (p.kind === 'ammo') {
      u.ammo += p.shots;
      this.audio.play('ammo');
      if (!safe) this._utScore(POINTS.ammo);
      if (p.safe) u.timers.push({ at: SAFE_AMMO_EVERY, kind: 'ammo', area: p.area, safe: true });
      else u.timers.push({ at: uniform(RESPAWN_PICKUP[0], RESPAWN_PICKUP[1]), kind: 'ammo' });
    } else if (p.kind === 'credit') {
      this.audio.play('credit_chaos');
      this._utScore(p.value);
      // A credit taken in a safe zone comes back out in a dangerous area.
      u.timers.push({ at: uniform(RESPAWN_PICKUP[0], RESPAWN_PICKUP[1]), kind: 'credit', danger: true });
    } else {
      u.hp = START_HP;
      u.lowWarned = false;
      this.audio.play('potion_drink');
      if (!safe) this._utScore(POINTS.potion);
    }
  },

  _utSpawnTowerItem(a) {
    const u = this.ut;
    const old = u.towerItems.get(a.id);
    if (old && old.channel) { old.channel.stop(); u.voices.delete(old.channel); }
    const pos = randomFloor(u.world, a, rand, { from: this.playerPos, minDist: 10.0,
      avoid: u.enemies.filter((e) => e.area === a).map((e) => this._utEnemyPos(e)), clearance: 10.0 });
    if (!pos) { u.towerItems.delete(a.id); return; }
    const item = new TowerItem([0, 0], ARENA);
    [item.x, item.y] = [pos[0] - a.centre[0], pos[1] - a.centre[1]];
    item.area = a;
    item.channel = null;
    u.towerItems.set(a.id, item);
  },

  _utItemPos(item) { return [item.x + item.area.centre[0], item.y + item.area.centre[1]]; },

  // How many tower items the player holds, here: they belong to the area.
  _utItemsHeld() {
    const u = this.ut;
    return u.towerCarry && u.area && u.towerCarry.area === u.area.id ? u.towerCarry.count : 0;
  },

  // ---------------------------------------------------------------- timing
  _utLater(delay, name, pos) {
    const run = this.ut.run;
    const fire = () => {
      if (!this.ut || this.ut.run !== run || this.state !== STATE) return;
      if (this.isPaused || this.state === 'confirm_exit' || this.state === 'help') { setTimeout(fire, 250); return; }
      this._utPlay(name, pos);
    };
    setTimeout(fire, Math.max(0, delay) * 1000);
  },

  // ---------------------------------------------------------------- the frame
  updateUltimateMode(dt) {
    const u = this.ut;
    if (!u || this.isPaused) return;
    if (u.phase === 'silence' || u.phase === 'fadein') {
      u.gap -= dt;
      if (u.phase === 'silence' && u.gap <= 0) {
        this._utNewWorld();
        return;
      }
      if (u.phase === 'fadein' && u.gap <= 0) u.phase = 'play';
    }
    if (u.phase === 'silence') return;
    u.elapsed += dt;
    if (u.safe > 0) u.safe -= dt;
    if (u.hitCooldown > 0) u.hitCooldown -= dt;
    // The regeneration countdown runs whatever else is happening (the compass too).
    u.worldTime -= dt;
    if (!u.warned && u.worldTime <= WARN_AT) {
      u.warned = true;
      this.tts.speak(`World regenerating in ${WARN_AT} seconds.`, { interrupt: true });
    }
    const left = Math.ceil(u.worldTime);
    if (left >= 1 && left <= COUNT_FROM && left !== u.lastCount) {
      u.lastCount = left;
      this.audio.play('countdown_high');
    }
    if (u.phase === 'play' && u.worldTime <= FADE_OUT) {
      u.phase = 'fading';
      this.audio.setWorldLevel(0, FADE_OUT);
    }
    if (u.worldTime <= 0) {
      this._utEndWorld();
      return;
    }
    if (u.compass.on) {
      this._utCompassTick(dt);
      this._utUpdateSounds(dt);   // the world keeps breathing under the muffle
      return;
    }
    if (u.place === 'ride') { this._utUpdateRide(dt); return; }
    if (u.place === 'seabed') { this._utUpdateSeabed(dt); this._utUpdateSounds(dt); return; }
    this._utTimers(dt);
    this._utUpdateEnemies(dt);
    if (this.state !== STATE) return;
    this._utUpdatePickups();
    this._utUpdateTower(dt);
    this._utUpdateLift(dt);
    this._utUpdateSounds(dt);
  },

  _utEndWorld() {
    const u = this.ut;
    const base = u.worldPoints;
    const well = base >= WELL_POINTS && u.worldDamage <= WELL_DAMAGE;
    if (well) u.speedBonus = Math.min(SPEED_CAP, u.speedBonus * SPEED_WELL);
    u.worlds += 1;
    this._utStopWorld();
    this.audio.setWorldLevel(0, 0.01);
    this.audio.setAreaRooms([]);
    u.phase = 'silence';
    u.gap = SILENCE;
    u.worldTime = 0;
  },

  _utTimers(dt) {
    const u = this.ut;
    const noSpawn = u.worldTime <= NO_SPAWN_FROM;
    // Pickups coming back.
    for (const t of [...u.timers]) {
      t.at -= dt;
      if (t.at > 0 || noSpawn) continue;
      u.timers.splice(u.timers.indexOf(t), 1);
      const w = u.world;
      let area = t.area;
      if (!area) {
        const pool = t.danger ? w.areas.filter((a) => a.kind !== 'event') : w.areas.filter((a) => a.kind !== 'event' || t.kind !== 'ammo');
        area = choice(pool.length ? pool : w.areas);
      }
      // No spot found this time (a crowded area): tried again in a moment.
      if (!this._utSpawnPickup(t.kind, area, { safe: !!t.safe })) { t.at = 2.0; u.timers.push(t); }
    }
    // Enemies coming back.
    for (const [id, list] of u.respawn) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i] -= dt;
        if (list[i] > 0 || noSpawn) continue;
        list.splice(i, 1);
        this._utSpawnEnemy(u.world.areas[id]);
      }
    }
    // The potion, once health is low.
    if (u.potionPending > 0) {
      u.potionPending -= dt;
      if (u.potionPending <= 0 && !noSpawn) {
        u.potionPending = 0;
        if (!this._utSpawnPickup('potion', choice(u.world.areas))) u.potionPending = 2.0;
      }
    }
  },

  // ---------------------------------------------------------------- enemies, every frame
  _utUpdateEnemies(dt) {
    const u = this.ut;
    const steps = u.steps; u.steps = [];
    const here = u.area;
    for (const e of [...u.enemies]) {
      if (e.kind === 'thrower') { this._utUpdateThrower(e, dt, e.area === here); continue; }
      const a = e.area;
      const was = [e.x, e.y];
      if (a === here) {
        const dx = this.playerPos[0] - e.x; const dy = this.playerPos[1] - e.y;
        const d = Math.hypot(dx, dy);
        if (d > 0) { e.x += dx / d * e.speed * dt; e.y += dy / d * e.speed * dt; }
      } else {
        // Not in its area: it wanders slowly between spots of its own area.
        e.goalTimer -= dt;
        if (!e.goal || e.goalTimer <= 0) { e.goal = randomFloor(u.world, a, rand) || [e.x, e.y]; e.goalTimer = uniform(4, 9); }
        const dx = e.goal[0] - e.x; const dy = e.goal[1] - e.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.5) { e.x += dx / d * e.speed * 0.4 * dt; e.y += dy / d * e.speed * 0.4 * dt; }
      }
      // Never out of its area.
      e.x = Math.max(a.x0 * CELL, Math.min(a.x1 * CELL, e.x));
      e.y = Math.max(a.y0 * CELL, Math.min(a.y1 * CELL, e.y));
      if (a !== here) continue;
      let d = dist2([e.x, e.y], this.playerPos);
      for (const [p, q] of steps) d = Math.min(d, pointToSegment(was[0], was[1], p, q));
      if (d < CHASER_TOUCH && u.safe <= 0 && u.hitCooldown <= 0) {
        this._utHurt(e);
        if (this.state !== STATE) return;
        // It struck: set back, and it comes again.
        const back = randomFloor(u.world, a, rand, { from: this.playerPos, minDist: CHASER_PUSH });
        if (back) [e.x, e.y] = back;
      }
    }
  },

  // A thrower: Tower Mode's rival, in its own area (local coordinates about the
  // area's centre). It contests the area's item and throws only while you are in
  // the area; the wind-up is the warning, and a throw is committed to where you
  // stood, as in Tower Mode.
  _utUpdateThrower(e, dt, playerHere) {
    const u = this.ut;
    const a = e.area;
    const local = [this.playerPos[0] - a.centre[0], this.playerPos[1] - a.centre[1]];
    const item = u.towerItems.get(a.id) || null;
    const itemPos = item ? [item.x, item.y] : null;
    if (playerHere) e.update(local, itemPos, ARENA, dt);
    else {
      // You are elsewhere: it only races for items, calmly, and holds what it has.
      e.floorTime += dt; e.sinceThrow += dt;
      if (e.notice > 0) e.notice -= dt;
      if (e.recover > 0) e.recover -= dt;
      if (itemPos && e.items < e.capacity) {
        const mx = itemPos[0] - e.x; const my = itemPos[1] - e.y; const md = Math.hypot(mx, my);
        if (md > 0.4) { e.x += mx / md * e.speed * dt; e.y += my / md * e.speed * dt; }
      }
    }
    // Only where the floor is (a tower area has no walls, but the square has edges).
    e.x = Math.max(-ARENA, Math.min(ARENA, e.x));
    e.y = Math.max(-ARENA, Math.min(ARENA, e.y));
    const pos = this._utEnemyPos(e);
    // The race for the item.
    if (item && e.items < e.capacity && e.winding <= 0 && e.recover <= 0 && e.notice <= 0 && e.pending <= 0) {
      if (Math.hypot(item.x - e.x, item.y - e.y) < 1.2) {
        e.items += 1;
        e.sinceThrow = 0.0;
        const gp = this._utItemPos(item);
        if (item.channel) { item.channel.stop(); u.voices.delete(item.channel); }
        u.towerItems.delete(a.id);
        this._utPlay('enemy_grab', gp, { volume: levelAt(dist2(gp, this.playerPos)) });
        this._utSpawnTowerItem(a);
      }
    }
    if (!playerHere || u.safe > 0) return;
    const level = levelAt(dist2(pos, this.playerPos));
    if (e.winding > 0) {
      e.winding -= dt;
      if (e.winding <= 0) { e.pending = Math.max(1, Math.min(e.volleySize, e.items)); e.shotTimer = 0.0; }
    } else if (e.pending > 0) {
      e.shotTimer -= dt;
      if (e.shotTimer <= 0) {
        e.items -= 1; e.pending -= 1;
        let target = e.aim !== null ? e.aim : [...local];
        const total = Math.max(1, e.volleySize);
        const offsets = volleySpread(total);
        const ang = offsets[Math.min(offsets.length - 1, total - 1 - e.pending)];
        const tdx = target[0] - e.x; const tdy = target[1] - e.y;
        const ca = Math.cos(ang); const sa = Math.sin(ang);
        target = [e.x + tdx * ca - tdy * sa, e.y + tdx * sa + tdy * ca];
        const shot = new TowerProjectile(e.x, e.y, target, e.throwSpeed * this._utSpeedMul());
        shot.owner = e; shot.area = a;
        this._utPlay('item_throw', pos, { volume: level });
        shot.channel = this._utPlay('item_buzz', pos, { loops: -1, volume: 0.0 });
        u.projectiles.push(shot);
        e.shotTimer = e.burstGap;
        if (e.pending <= 0) {
          const wasDump = e.dumping;
          e.aim = null; e.volleySize = 0; e.dumping = false;
          e.cooldown = e.throwCd * (wasDump ? 2.2 : 1.0);
          e.recover = wasDump ? 2.6 : 1.2;
          e.sinceThrow = 0.0;
        }
      }
    } else if (e.items > 0 && e.hoarding && e.items < e.capacity && e.sinceThrow < 12.0) {
      // Hoarding (Tower's TOWER_HOARD_PATIENCE): it holds what it has.
    } else if (e.items > 0) {
      e.cooldown -= dt;
      if (e.hoarding) e.cooldown = 0.0;
      if (e.cooldown <= 0) {
        e.dumping = (e.capacity > 1 && e.items >= e.capacity) || (e.hoarding && e.items > 1);
        e.winding = e.windupLen * (e.dumping ? 1.9 : 1.0);
        if (e.dumping) e.winding = Math.max(0.9, e.winding);
        e.aim = [...local];
        e.volleySize = e.dumping ? e.items : Math.min(e.volley, e.items);
        let name;
        if (e.dumping && e.volleySize >= 3) name = 'enemy_windup_full';
        else if (e.volleySize <= 1) name = 'enemy_windup';
        else name = `enemy_windup_${Math.min(3, e.volleySize)}`;
        this._utPlay(name, pos, { volume: level });
      }
    }
  },

  // Thrown items in flight, the tower items and the proximity beep.
  _utUpdateTower(dt) {
    const u = this.ut;
    for (const s of [...u.projectiles]) {
      const a = s.area;
      const was = [s.x + a.centre[0], s.y + a.centre[1]];
      const alive = s.update(dt);
      const now = [s.x + a.centre[0], s.y + a.centre[1]];
      const here = u.area === a;
      const d = here ? Math.min(dist2(now, this.playerPos), pointToSegment(this.playerPos[0], this.playerPos[1], was, now)) : Infinity;
      if (s.channel) {
        const rx = this.playerPos[0] - now[0]; const ry = this.playerPos[1] - now[1];
        if (here && rx * s.vx + ry * s.vy < 0) { s.channel.stop(); u.voices.delete(s.channel); s.channel = null; }
        else this._utFollow(s.channel, now, levelAt(dist2(now, this.playerPos)) * 0.75);
      }
      const hit = d < 2.2 && u.hitCooldown <= 0 && u.safe <= 0;
      const atWall = Math.abs(s.x) > ARENA + 0.5 || Math.abs(s.y) > ARENA + 0.5;
      if (hit || atWall || !alive) {
        this._utDropProjectile(s);
        if (hit) { this._utHurt(s); if (this.state !== STATE) return; }
      }
    }
    // The item in the player's own tower area: walked onto, it is yours.
    const a = u.area;
    if (a && a.kind === 'tower') {
      const item = u.towerItems.get(a.id);
      if (item) {
        const pos = this._utItemPos(item);
        if (dist2(pos, this.playerPos) < REACH) {
          if (!u.towerCarry || u.towerCarry.area !== a.id) u.towerCarry = { area: a.id, count: 0 };
          u.towerCarry.count += 1;
          this.audio.play('ammo');
          if (item.channel) { item.channel.stop(); u.voices.delete(item.channel); }
          u.towerItems.delete(a.id);
          for (const e of u.enemies) if (e.area === a && e.kind === 'thrower') e.registerPlayerPickup();
          this._utSpawnTowerItem(a);
        } else {
          // Tower's proximity beep for the item, rising and quickening as you close.
          const d = dist2(pos, this.playerPos);
          const interval = Math.max(0.14, Math.min(1.2, d * 0.035));
          const now = performance.now() / 1000;
          if (now - u.prox > interval) {
            u.prox = now;
            const idx = Math.max(0, Math.min(19, 19 - Math.trunc(d / 3.0)));
            this._utPlay(`prox_${idx}`, pos, { volume: levelAt(d) * 0.45 });
          }
        }
      }
    }
  },

  _utUpdatePickups() {
    const u = this.ut;
    for (const p of [...u.pickups]) {
      if (p.area !== u.area) continue;
      if (dist2(p.pos, this.playerPos) < REACH) this._utTakePickup(p);
    }
  },

  // ---------------------------------------------------------------- the island's elevator and the seabed
  _utUpdateLift(dt) {
    const u = this.ut;
    const a = u.area;
    if (!a || a.kind !== 'island') { u.liftArmed = false; return; }
    const lp = posOf(a.elevator[0], a.elevator[1]);
    const d = dist2(lp, this.playerPos);
    if (d >= REACH) u.liftArmed = true;
    else if (u.liftArmed) { this._utStartRide('down'); return; }
    u.dingTimer -= dt;
    if (u.dingTimer <= 0) {
      u.dingTimer = 1.6;
      this._utPlay('elevator_ding', lp, { volume: levelAt(d) });
    }
  },

  _utStartRide(dir) {
    const u = this.ut;
    const a = u.place === 'seabed' ? u.seabed.area : u.area;
    const e = this.audio.entries.get('elevator_ride');
    const own = e && e.dry ? e.dry.frames / RATE : RIDE_TIME;
    const len = Math.max(RIDE_MIN, Math.min(RIDE_MAX, own));
    u.place = 'ride';
    u.liftArmed = false;
    u.ride = { dir, t: 0, len, area: a, chimed: false, voice: this.audio.play('elevator_ride', { direct: false }) };
    if (dir === 'down') {
      // The seabed lies straight under the island's elevator, in the world's own
      // coordinates: its cell (0, 0) is the elevator's cell, so every position in
      // the mode stays in one system and nothing above is misplaced.
      const [ex, ey] = a.elevator;
      u.seabed = { area: a, grid: makeSeabed(), origin: [ex, ey], pickups: [], under: null };
      // The seabed's own supply: a cartridge or two, and now and then a credit.
      const g = u.seabed.grid;
      const spot = () => {
        for (let i = 0; i < 50; i++) {
          const cx = randint(-g.half, g.half); const cy = randint(-g.half, g.half);
          if (Math.hypot(cx, cy) >= 3) return posOf(ex + cx, ey + cy);
        }
        return posOf(ex + g.half, ey);
      };
      for (let i = 0; i < randint(1, 2); i++) u.seabed.pickups.push({ kind: 'ammo', pos: spot(), shots: this._utShotsPerCartridge(), beacon: 'ammo_beacon', gain: 0.55 });
      if (rand() < 0.3) { const v = choice(CREDIT_VALUES); u.seabed.pickups.push({ kind: 'credit', pos: spot(), value: v, beacon: `credit_beacon_${v}`, gain: 0.7 }); }
      // The water, placed so it can rise from below you on the way down.
      u.seabed.under = this._utPlay('underwater', this.playerPos, { loops: -1, volume: 0.0, height: -6 });
    } else {
      for (const p of u.seabed.pickups) if (p.voice) { p.voice.stop(); u.voices.delete(p.voice); p.voice = null; }
    }
    this.stride = null;
  },

  // The ride (Island Mode's stages): going down, the island goes muffled and the
  // water rises from below you; coming up, the reverse. Height is what the ear
  // gets from it in 3D.
  _utUpdateRide(dt) {
    const u = this.ut;
    const r = u.ride;
    if (r.voice && r.voice.busy && !r.voice.dry) return;    // the recording still decoding
    r.t += dt;
    const L = r.len;
    const stage = (p, q) => Math.min(1, Math.max(0, (r.t - p * L) / ((q - p) * L)));
    const shut = stage(0, DOORS_SHUT); const move = stage(DOORS_SHUT, DOORS_OPEN); const wide = stage(DOORS_OPEN, DOORS_WIDE);
    let above; let water; let height;
    if (r.dir === 'down') { above = (1 - shut * 0.7) * (1 - move); water = move * (0.75 + 0.25 * wide); height = -6 * (1 - move); }
    else { water = (1 - shut * 0.7) * (1 - move); above = move * (0.75 + 0.25 * wide); height = 6 * (1 - move); }
    u.rideMix = { above, water, height };
    if (u.seabed && u.seabed.under) u.seabed.under.setSpatial(0.8 * water, 0, -0.05, 0, height);
    this._utUpdateSounds(dt);
    if (!r.chimed && r.t >= DOORS_OPEN * L - ARRIVE_CHIME_LEAD) {
      r.chimed = true;
      this.audio.play(r.dir === 'down' ? 'elevator_arrive_1' : 'elevator_arrive_2');
    }
    if (r.t < L) return;
    // Arrived.
    u.ride = null;
    u.rideMix = null;
    if (r.dir === 'down') {
      u.place = 'seabed';
      this.playerPos = posOf(r.area.elevator[0], r.area.elevator[1]);   // in the car, under the lift
      u.liftArmed = false;
      u.area = r.area;
      if (u.seabed.under) u.seabed.under.setSpatial(0.8, 0, -0.05, 0, 0);
      this._utRefreshRooms();
    } else {
      u.place = 'world';
      u.seabed = null;
      u.area = r.area;
      this.playerPos = posOf(r.area.elevator[0], r.area.elevator[1]);
      u.liftArmed = false;
      this._utRefreshRooms();
    }
  },

  _utUpdateSeabed(dt) {
    const u = this.ut;
    const s = u.seabed;
    for (const p of [...s.pickups]) {
      if (dist2(p.pos, this.playerPos) < REACH) {
        if (p.voice) { p.voice.stop(); u.voices.delete(p.voice); }
        s.pickups.splice(s.pickups.indexOf(p), 1);
        if (p.kind === 'ammo') { u.ammo += p.shots; this.audio.play('ammo'); this._utScore(POINTS.ammo); }
        else { this.audio.play('credit_chaos'); this._utScore(p.value); }
      }
    }
    const lp = posOf(s.origin[0], s.origin[1]);
    const d = dist2(lp, this.playerPos);
    if (d >= REACH) u.liftArmed = true;
    else if (u.liftArmed) { this._utStartRide('up'); return; }
    u.dingTimer -= dt;
    if (u.dingTimer <= 0) {
      u.dingTimer = 1.6;
      this._utPlay('elevator_arrive_1', lp, { volume: levelAt(d, SEABED_RANGE) });
    }
  },

  // A seabed position's cell, counted from the elevator.
  _utSeabedCell(pos) {
    const [cx, cy] = cellOf(pos);
    const [ex, ey] = this.ut.seabed.origin;
    return [cx - ex, cy - ey];
  },

  // ---------------------------------------------------------------- every sound, every frame
  _utUpdateSounds(dt) {
    const u = this.ut;
    const w = u.world;
    if (!w) return;
    const onWorld = u.place === 'world';
    const ride = u.rideMix;
    const seabed = u.place === 'seabed';
    // How much of the world above is heard: all of it on the ground, through the
    // elevator's stages on a ride, faintly from above on the seabed.
    const aboveLevel = onWorld ? 1 : ride ? ride.above : 0.0;
    const aboveHeight = onWorld ? 0 : ride ? ride.height : 8;
    const near = this._utNearAreas();
    const nearIds = new Set(near.map((a) => a.id));
    // Each area's air: its own area at full, a neighbour's from its border or its
    // doorway, fading with the distance to it. Areas further off are silent, and
    // their sounds are let go.
    for (const a of w.areas) {
      let s = u.areaSounds.get(a.id);
      if (!nearIds.has(a.id)) {
        if (s) { for (const v of Object.values(s)) if (v) { v.fadeout(800); u.voices.delete(v); } u.areaSounds.delete(a.id); }
        continue;
      }
      if (!s) {
        // Each background twice, in step: a wide copy for standing inside the area
        // (plain stereo, all round you), and a placed copy for hearing it from
        // outside, through its doorway or across its border.
        s = {
          amb: this._utPlay(a.ambience, a.centre, { loops: -1, volume: 0.0, fadeMs: 600 }),
          ambIn: this._utPlay(a.ambience, null, { loops: -1, volume: 0.0, fadeMs: 600 }),
        };
        if (a.drums) {
          s.drums = this._utPlay(a.drums, a.centre, { loops: -1, volume: 0.0, fadeMs: 600 });
          s.drumsIn = this._utPlay(a.drums, null, { loops: -1, volume: 0.0, fadeMs: 600 });
        }
        if (a.kind === 'island') s.hum = this._utPlay('elevator_hum', posOf(a.elevator[0], a.elevator[1]), { loops: -1, volume: 0.0 });
        u.areaSounds.set(a.id, s);
      }
      let level; let from; let inside = 0; const height = aboveHeight;
      if (a === u.area) {
        level = AMBIENCE_LEVEL;
        if (seabed) level = 0.22;
        // On the seabed and in the car the island is straight above you.
        if (seabed || ride) from = this.playerPos; else { from = null; inside = 1; }
      } else if (seabed) {
        level = 0; from = a.centre;
      } else {
        const [, outside] = nearestPointOf(a, this.playerPos);
        from = leakPoint(w, u.area, a, this.playerPos);
        const bd = a.borders.find((b) => (b.a === u.area.id && b.b === a.id) || (b.b === u.area.id && b.a === a.id));
        level = AMBIENCE_LEVEL * levelAt(outside, AMBIENCE_RANGE) * (bd && bd.door ? DOOR_LEAK : 1);
        if (!onWorld) level *= 0.3;
      }
      level *= aboveLevel || (seabed ? 1 : 0);
      const mixHere = this._utMixAt(this.playerPos);
      const pair = (placed, wide, gain) => {
        if (placed) {
          if (from) this._utFollow(placed, from, level * gain * (1 - inside), height);
          else { placed.setSpatial(0, 0, -0.05, 0, height); placed.setAreaMix(mixHere); }
        }
        if (wide) { wide.setVolume(level * gain * inside, level * gain * inside); wide.setAreaMix(mixHere); }
      };
      pair(s.amb, s.ambIn, 1);
      pair(s.drums, s.drumsIn, 0.85);
      if (s.hum) {
        const lp = posOf(a.elevator[0], a.elevator[1]);
        const hl = (seabed && a === u.area) ? 0 : levelAt(dist2(lp, this.playerPos)) * (onWorld ? 1 : (ride ? ride.above : 0));
        this._utFollow(s.hum, lp, hl, aboveHeight);
      }
    }
    // Enemies: heard across the world, fading with distance, never from the seabed.
    for (const e of u.enemies) {
      const pos = this._utEnemyPos(e);
      const d = dist2(pos, this.playerPos);
      const level = levelAt(d) * (onWorld ? 1 : (ride ? ride.above * 0.6 : 0));
      if (!e.voice && level > 0.01) e.voice = this._utPlay(e.soundName, pos, { loops: -1, volume: 0.0 });
      else if (e.voice && level <= 0.001 && d > HEAR_RANGE + 10) { e.voice.stop(); u.voices.delete(e.voice); e.voice = null; }
      if (e.voice) this._utFollow(e.voice, pos, level, aboveHeight);
    }
    // Pickups and tower items: beacons, as far as the ear carries.
    for (const p of u.pickups) {
      const d = dist2(p.pos, this.playerPos);
      const level = levelAt(d) * p.gain * (onWorld ? 1 : (ride ? ride.above * 0.6 : 0));
      if (!p.voice && level > 0.01) p.voice = this._utPlay(p.beacon, p.pos, { loops: -1, volume: 0.0 });
      else if (p.voice && level <= 0.001 && d > HEAR_RANGE + 10) { p.voice.stop(); u.voices.delete(p.voice); p.voice = null; }
      if (p.voice) this._utFollow(p.voice, p.pos, level, aboveHeight);
    }
    for (const it of u.towerItems.values()) {
      const pos = this._utItemPos(it);
      const d = dist2(pos, this.playerPos);
      const level = levelAt(d) * (onWorld ? 1 : 0);
      if (!it.channel && level > 0.01) it.channel = this._utPlay('item_beacon', pos, { loops: -1, volume: 0.0 });
      else if (it.channel && level <= 0.001 && d > HEAR_RANGE + 10) { it.channel.stop(); u.voices.delete(it.channel); it.channel = null; }
      if (it.channel) this._utFollow(it.channel, pos, level, aboveHeight);
    }
    // The seabed's own things.
    if (u.seabed) {
      const waterLevel = seabed ? 1 : (ride ? ride.water : 0);
      const h = seabed ? 0 : (ride ? -ride.height : -6);
      for (const p of u.seabed.pickups) {
        const d = dist2(p.pos, this.playerPos);
        const level = levelAt(d, SEABED_RANGE) * p.gain * waterLevel;
        if (!p.voice && level > 0.01) p.voice = this._utPlay(p.beacon, p.pos, { loops: -1, volume: 0.0 });
        if (p.voice) { const rel = this._utRel(p.pos); p.voice.setSpatial(level, rel[0], rel[1], this._behind(p.pos), h); }
      }
    }
  },

  // ---------------------------------------------------------------- walking and shooting
  _utStep(g) {
    const u = this.ut;
    if (u.place === 'ride') { this.audio.play('boundary'); return; }
    let [nx, ny] = this.playerPos;
    if (g === 'up') { ny -= CELL; this.playerFacing = [0, -1]; }
    else if (g === 'down') { ny += CELL; this.playerFacing = [0, 1]; }
    else if (g === 'left') { nx -= CELL; this.playerFacing = [-1, 0]; }
    else { nx += CELL; this.playerFacing = [1, 0]; }
    const [cx, cy] = cellOf([nx, ny]);
    let ok;
    if (u.place === 'seabed') { const [sx, sy] = this._utSeabedCell([nx, ny]); ok = u.seabed.grid.floor.has(key(sx, sy)); }
    else ok = isFloor(u.world, cx, cy);
    if (!ok) {
      // A wall, where it is (the world's edge is a wall too).
      this._utPlay('wall', [nx, ny]);
      return;
    }
    u.steps.push([[...this.playerPos], [nx, ny]]);
    this.playerPos = [nx, ny];
    if (u.place === 'world') {
      const a = areaAt(u.world, this.playerPos);
      if (a !== u.area) {
        u.area = a;
        // Tower items stay with their area: leaving, they are gone.
        if (u.towerCarry && u.towerCarry.area !== a.id) u.towerCarry = null;
        this._utRefreshRooms();
      }
      this.audio.play(choice(a.steps));
    }
    // (The seabed makes no sound underfoot, as in Island Mode.)
  },

  _utAttack() {
    const u = this.ut;
    if (u.place !== 'world') { this.audio.play('empty_click'); return; }
    const a = u.area;
    // In a tower area, an item you hold is thrown first; the laser is the fallback.
    if (a.kind === 'tower' && this._utItemsHeld() > 0) { this._utThrow(); return; }
    if (u.ammo <= 0) { this.audio.play('empty_click'); return; }
    u.ammo -= 1;
    this.audio.play('laser');
    if (u.ammo <= LOW_AMMO_FROM && u.ammo >= 1) this.audio.play(`ut_low_ammo_${u.ammo}`, { areaMix: this._utMixAt(this.playerPos) });
    const hit = this._utLocked();
    if (!hit) return;
    if (hit.kind === 'thrower') {
      hit.hitsTaken += 1;
      if (hit.hitsTaken >= hit.hitsNeeded) this._utKillEnemy(hit, 'laser');
      else this._utLater(Math.min(0.4, dist2(this._utEnemyPos(hit), this.playerPos) * 0.012), 'enemy_hit', this._utEnemyPos(hit));
    } else this._utKillEnemy(hit, 'laser');
  },

  _utThrow() {
    const u = this.ut;
    const a = u.area;
    const throwers = u.enemies.filter((e) => e.kind === 'thrower' && e.area === a);
    if (!throwers.length) { this.audio.play('empty_click'); return; }
    u.towerCarry.count -= 1;
    this.audio.play('item_throw');
    // Battle's aiming rule: the nearest thrower centred between the ears.
    let best = null; let bestD = Infinity;
    for (const e of throwers) {
      const pos = this._utEnemyPos(e);
      const dx = pos[0] - this.playerPos[0]; const dy = pos[1] - this.playerPos[1];
      const d = Math.hypot(dx, dy);
      if (d > 0 && Math.abs(dx / d) < BATTLE_AIM_PAN && d < bestD) { best = e; bestD = d; }
    }
    if (!best) return;
    best.hitsTaken += 1;
    if (best.hitsTaken >= best.hitsNeeded) this._utKillEnemy(best, 'item');
    else this._utLater(Math.min(0.4, bestD * 0.012), 'enemy_hit', this._utEnemyPos(best));
  },

  // What a shot takes: the nearest enemy of the player's own area that sits
  // centred between the ears, in front or behind, within hearing.
  _utLocked() {
    const u = this.ut;
    let best = null; let bestD = Infinity;
    for (const e of u.enemies) {
      if (e.area !== u.area) continue;
      const pos = this._utEnemyPos(e);
      const dx = pos[0] - this.playerPos[0]; const dy = pos[1] - this.playerPos[1];
      const d = Math.hypot(dx, dy);
      if (d <= 0 || d > HEAR_RANGE) continue;
      if (Math.abs(dx / d) < BATTLE_AIM_PAN && d < bestD) { best = e; bestD = d; }
    }
    return best;
  },

  _utReport() {
    const u = this.ut;
    this.tts.speak(`${u.hp} health. ${u.points} ${plural(u.points, 'point')}. ${u.ammo} ${plural(u.ammo, 'shot')}.`, { interrupt: true });
  },

  // ---------------------------------------------------------------- the compass
  _utCompassToggle() {
    const u = this.ut;
    if (u.compass.on) { this._utCompassOff(); return; }
    if (u.place === 'ride') { this.audio.play('boundary'); return; }
    if (this._utInSafeZone()) {
      this.tts.speak('Compass not available. Safe zone detected.', { interrupt: true });
      return;
    }
    u.compass.on = true;
    u.compass.dir = 0;
    u.compass.t = 0;
    this.stride = null;
    this.audio.setMuffle(true, 0.4);
    this.tts.speak('Compass on. Ahead.', { interrupt: true });
  },

  _utCompassOff(quiet = false) {
    const u = this.ut;
    if (!u.compass.on) return;
    u.compass.on = false;
    this.audio.setMuffle(false, 0.4);
    if (!quiet) this.tts.speak('Compass off.', { interrupt: true });
  },

  // The route's first step (one of four directions), or null: already there, or no way.
  _utRouteStep() {
    const u = this.ut;
    if (u.place === 'seabed') {
      const [cx, cy] = this._utSeabedCell(this.playerPos);
      if (!cx && !cy) return null;
      return Math.abs(cx) >= Math.abs(cy) ? [-Math.sign(cx), 0] : [0, -Math.sign(cy)];
    }
    return firstStepToward(u.world, cellOf(this.playerPos), (a) => a.kind === 'event');
  },

  _utCompassTurn(g) {
    const u = this.ut;
    const idx = { up: 0, right: 1, down: 2, left: 3 }[g];
    if (idx === undefined) return;
    u.compass.dir = idx;
    u.compass.t = COMPASS_BEEP_EVERY;   // a beep at once, for the new direction
    this.tts.speak(['Ahead', 'Right', 'Behind', 'Left'][idx] + '.', { interrupt: true });
  },

  _utCompassTick(dt) {
    const u = this.ut;
    u.compass.t += dt;
    if (u.compass.t < COMPASS_BEEP_EVERY) return;
    u.compass.t = 0;
    const route = this._utRouteStep();
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const d = dirs[u.compass.dir];
    let step = 0;
    if (route) {
      const dot = d[0] * route[0] + d[1] * route[1];   // 1 toward, 0 across, -1 away
      step = Math.round((dot + 1) / 2 * 8);
    }
    this.audio.play(compassName(step), { direct: true, volume: 0.6 });
  },

  // ---------------------------------------------------------------- the end
  _utGameOver() {
    this._utStopWorld();
    this.triggerGameOver();
  },
};

// ------------------------------------------------------------------ the mode
function reset(game) {
  if (game.ut) {
    for (const v of [...game.ut.voices]) v.stop();
    game.ut.voices.clear();
    if (game.ut.compass.on) game.audio.setMuffle(false, 0.01);
  }
  if (game.audio && game.audio.spatial) game.audio.spatialOff();
  game.ut = null;
}

// The run is over (or quit): its sounds stop and the 3D world closes. What the run
// scored is kept for finish(); the next run's reset clears it.
function stopAll(game) {
  if (game.ut) {
    for (const v of [...game.ut.voices]) v.stop();
    game.ut.voices.clear();
    if (game.ut.ride && game.ut.ride.voice) game.ut.ride.voice.stop();
    if (game.ut.compass.on) { game.ut.compass.on = false; game.audio.setMuffle(false, 0.01); }
  }
  if (game.audio && game.audio.spatial) game.audio.spatialOff();
}

function input(game, g) {
  const u = game.ut;
  if (!u) return;
  if (g === 'clock') return;   // no clock in this mode
  if (u.phase === 'silence') return;   // between worlds nothing answers
  if (g === 'hold' || g === 'compass') { game._utCompassToggle(); return; }
  if (u.compass.on) {
    // Only the compass turns; nothing else moves.
    if (['up', 'down', 'left', 'right'].includes(g)) game._utCompassTurn(g);
    else if (g === 'enter') game._utReport();
    else if (g === 'space') game.audio.play('empty_click');
    return;
  }
  if (g === 'enter') { game._utReport(); return; }
  if (g === 'space') { game._utAttack(); return; }
  if (['up', 'down', 'left', 'right'].includes(g)) game._utStep(g);
}

export default {
  menu: [{ key: 'ultimate', label: 'Ultimate Test Mode', select: (game) => game.startUltimate() }],
  playStates: [STATE],
  mixin,
  init(game) { game.ut = null; },
  reset,
  update(game, dt) { game.updateUltimateMode(dt); },
  input,
  stopAll,
  // No pause during an elevator ride, as in Island Mode.
  blockPause(game) { return !!(game.ut && game.ut.place === 'ride') && !game.isPaused; },
  // A finger held still turns the compass (gestures.js emits 'hold' only when asked).
  holdGesture(game) { return !!(game.ut && game.ut.place !== 'ride'); },
  // Help opens: the compass goes off, so the help's demos are not heard muffled.
  interrupted(game) { if (game.ut) game._utCompassOff(true); },
  // A pause in the last two seconds of a world holds the fade where it is; the
  // fade carries on from there when the run resumes.
  paused(game, on) {
    const u = game.ut; const a = game.audio;
    if (!u || u.phase !== 'fading' || !a.worldGain) return;
    if (on) a.setWorldLevel(a.worldGain.gain.value, 0.01);
    else a.setWorldLevel(0, Math.max(0.05, u.worldTime));
  },
  // A run or a backward walk never carries across a regeneration or a ride, and
  // never happens while the compass is on, on a ride, or between worlds.
  strideSig(game) { return game.ut ? `${game.ut.worldNo}|${game.ut.place}` : ''; },
  blockStride(game) { const u = game.ut; return !u || u.compass.on || u.place === 'ride' || u.phase === 'silence'; },
  finish(game) {
    const u = game.ut || { points: 0, elapsed: 0, worlds: 0 };
    const worlds = u.worlds;
    return {
      key: BOARD, score: u.points,
      message: `Game Over. You scored ${u.points} ${plural(u.points, 'point')}, survived ${spokenTime(u.elapsed)}, `
        + `and made it through ${worlds} ${plural(worlds, 'world')}. `,
    };
  },
  // The echo is the area's own (audio.js buses); the room is never set here.
  room() { return null; },
  surroundings() { return [1.0, 0.0]; },
  status(game) {
    const u = game.ut;
    if (!u) return 'Ultimate Test Mode.';
    const bits = [`Ultimate Test Mode. World ${u.worldNo}.`, `Health ${u.hp}.`, `${u.points} points.`, `${u.ammo} shots.`];
    if (u.place === 'seabed') bits.push('Seabed.');
    if (u.compass.on) bits.push('Compass on.');
    if (u.worldTime <= WARN_AT) bits.push(`Regenerating in ${Math.max(0, Math.ceil(u.worldTime))}.`);
    return bits.join(' ');
  },
  boards: [{ key: BOARD, label: 'Ultimate Test Mode', fmt: (v) => `${v} ${v === 1 ? 'point' : 'points'}` }],
  help: { sections: HELP_SECTIONS, demos: HELP_DEMOS },
};
