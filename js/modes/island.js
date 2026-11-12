// Island Mode: the desktop game's island mode (endless_labyrinth.py, version 1.0.1,
// start_island to island_status), played with touch gestures. Names and numbers
// follow the desktop code so the two can be compared line by line.
//
// A run is a chain of islands joined by the seabed. Every island has an elevator
// that works at any time, so you can dive mid-fight to reload, but the longer you
// stay down the more enemies are waiting when you come back. The way onward is
// locked: to reach the next island the current one must be clear AND you must
// have found its key on the seabed. Until then the elevator up brings you back to
// the island you left. Treasure, trapped divers and guardians are the extras.
//
// The desktop's `if self.chaos_mode` branches are here too, guarded by
// this.chaosMode, so Chaos mode can reuse them; with chaosMode false (standalone
// Island Mode) they never run.

// ------------------------------------------------------------------ constants
// A run is a chain of islands. Shoot every enemy on an island and its elevator starts
// calling. Ride it down to the seabed, gather ammo on one breath, and find the elevator
// up to the next island before the air runs out. Drowning ends the run, exactly like
// an enemy reaching you. The score is islands crossed.
const ISLAND_ARENA = 35.0;
const SEABED_ARENA = 38.0;
const ISLAND_START_AMMO = 8;
// Enemies on island n: 3 + n of them, up to 1 + n // 2 at once (never more than 6).
const ISLAND_MAX_CONCURRENT = 6;
// One ride, down or up. A ride lasts as long as the elevator_ride sound, kept between
// MIN and MAX; RIDE_TIME is the length of the generated stand-in.
const ISLAND_RIDE_TIME = 8.0;
const ISLAND_RIDE_MIN = 4.0;
const ISLAND_RIDE_MAX = 16.0;
// A ride has three stages, set as fractions of the ride so they follow the recording.
//   Doors closing: where you are goes muffled, because you are now inside a box.
//   Moving:        the muffled old place fades out and the muffled new place in.
//   Doors opening: the new place opens up to its full, clear sound.
const ISLAND_DOORS_SHUT = 0.34;
const ISLAND_DOORS_OPEN = 0.67;
const ISLAND_DOORS_WIDE = 0.93;
// The car chimes just before its doors open: two chimes arriving on an island (the
// next trip is down), one arriving on the seabed (the next trip is up). Seconds
// before the doors open.
const ISLAND_ARRIVE_CHIME_LEAD = 0.5;
// How loud a place is while heard through the closed elevator, against its normal level.
const ISLAND_MUFFLED_LEVEL = 0.75;
// And a little of the place's clear sound leaks through the walls as well, as a
// share of how loud it is heard muffled.
const ISLAND_WALL_LEAK = 0.3;
// Going down, the island you left is held through the walls for this share of the
// car's move before it gives way to the water.
const ISLAND_LEAVE_HOLD = 0.5;
// Air on the seabed: thirty seconds a dive. The last fifteen seconds beep once a
// second, after a spoken Low air warning. An air vent tops it back up to full.
const ISLAND_AIR = 30.0;
const ISLAND_AIR_WARN = 15.0;          // its beeps are the high countdown, never the clock's
const ISLAND_VENT_AGAIN = 10.0;         // web 5.0.0: every dive has an air vent, and this long after you take one the next appears somewhere else (Russell, 12 November 2026; until then about half of all dives had one, once)
// Treasure, trapped divers and guardians: the extras.
const ISLAND_TREASURE_CHANCE = 0.35;   // per island; it lies on the island until collected
const ISLAND_DIVER_CHANCE = 0.25;      // per island, from island two on
// Which islands have a guardian is drawn as the run goes: never the first island,
// never two in a row, about one island in three, and never more than this many
// islands without one.
const ISLAND_GUARDIAN_CHANCE = 1 / 3;
const ISLAND_GUARDIAN_MAX_GAP = 4;
const ISLAND_GUARDIAN_HITS = 3;        // plus one more for every guardian island before it
const ISLAND_GUARDIAN_POST = 7.0;      // how far from the elevator it keeps its post
const ISLAND_GUARDIAN_LEASH = 9.0;     // how far from its post it will follow you
const ISLAND_GUARDIAN_REACT = 13.0;    // it comes at you once you are this close to its post
const ISLAND_GUARDIAN_SPEED = 1.7;
const ISLAND_GUARDIAN_STRIKE = 4.0;    // get this close to the guardian and it strikes you: the run ends
const ISLAND_GUARDIAN_GAIN = 2.4;      // louder than any other enemy
const ISLAND_GUARDIAN_FLOOR = 0.5;     // and never quieter than half across the whole island
const ISLAND_GUARDIAN_HUNT_SPEED = 10.5;  // out of shots with the guardian standing: it comes for you
// While the guardian is alive the elevator will not open. Walking into it gives the
// buzz instead, at most this often.
const ISLAND_BLOCKED_BUZZ = 1.0;
const ISLAND_ARRIVAL_GRACE = 3.0;      // seconds nothing can touch you after stepping out of the lift
// Reinforcements: while you are on the seabed, one more enemy lands on the island
// every this many seconds, the first after FIRST seconds, up to MAX per dive.
const ISLAND_REINFORCE_FIRST = 10.0;
const ISLAND_REINFORCE_EVERY = 8.0;
const ISLAND_REINFORCE_MAX = 4;
// Points.
const ISLAND_POINTS_ISLAND = 100;
const ISLAND_POINTS_ENEMY = 10;
const ISLAND_POINTS_TREASURE = 50;
const ISLAND_POINTS_DIVER = 150;
const ISLAND_POINTS_GUARDIAN = 100;
// Every seabed beacon has its own sound, and sits a little under the elevator.
const ISLAND_ITEM_SOUNDS = { key: 'key_beacon', treasure: 'treasure_beacon', diver: 'diver_tap', vent: 'vent' };
const ISLAND_ITEM_GAIN = { key: 0.75, treasure: 0.55, diver: 0.7, vent: 1.0, credit: 0.85 };
// Under every air vent's bubbling, much quieter, the tower's health potion chime.
const ISLAND_VENT_POTION_GAIN = 0.3;
// You never arrive on an island within this many units of its elevator.
const ISLAND_ARRIVE_MIN = 12.0;
const ISLAND_REACH = 3.0;
// Each cartridge lands in one of these bands from you, drawn at random.
const ISLAND_AMMO_BANDS = [[8.0, 18.0], [14.0, 28.0], [24.0, 42.0]];
const ISLAND_AMMO_BAND_WEIGHTS = [2, 3, 2];
// Each island's seabed holds ONE supply of ammo, fixed when the island is made and
// shared by every dive to it, always covering what the island needs.
const ISLAND_AMMO_CARTRIDGES = [2, 6];
const ISLAND_AMMO_POOL_REINFORCE = 3;
const ISLAND_AMMO_SHOTS = [2, 6];      // shots in a cartridge
// Coming back up from the seabed, an enemy that was standing where you step out is
// set back to at least this far, so the arrival is never a strike.
const ISLAND_RETURN_CLEAR = 14.0;
// Everything in a place fades in over this long when you step out of the elevator;
// what you are leaving fades out over ISLAND_LEAVE_FADE as the doors close.
const ISLAND_SEABED_FADE = 1.2;
const ISLAND_LEAVE_FADE = 2.5;
const ISLAND_SURFACE_VOLUME = 0.8;
const ISLAND_UNDER_VOLUME = 0.8;
// Every island sounds different: real shore recordings, dealt out in a shuffled
// order, never repeating one until all of them have been used.
const ISLAND_SHORES = ['island_01_maldives_beach', 'island_02_sandy_beach_calm', 'island_03_waves_birdsong_gull',
  'island_04_sea_and_seagull', 'island_05_lapping_far_gulls', 'island_06_wind_and_waves', 'island_07_rock_beach',
  'island_08_gentle_shore', 'island_09_waves_breaking', 'island_10_beach_ambiance'];
// Sand for an island.
const STEP_SAND = ['step_sand_1', 'step_sand_2', 'step_sand_3', 'step_sand_4'];
// Battle's, used by the enemies and cartridges here (the desktop's own values).
const BATTLE_SPAWN_PAN = 0.55;      // (the desktop's: enemies ahead or behind only; since web 5.0.0 they come from any side)
const BATTLE_AMMO_CLEARANCE = 14.0;
// Chaos only (see the chaosMode branches).
const CHAOS_CREDIT_VALUES = [40, 50, 60];
const CHAOS_CREDIT_FLOOR = 0.15;
const CHAOS_CREDIT_ISLAND = 0.5;
const CHAOS_CREDIT_SEABED = 0.33;

const FPS = 30;
const RATE = 44100;
const ISLAND = 'island';

// ------------------------------------------------------------------ helpers
const rand = Math.random;
const uniform = (a, b) => a + (b - a) * rand();
const randint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const choice = (arr) => arr[Math.floor(rand() * arr.length)];
function weighted(values, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < values.length; i++) { r -= weights[i]; if (r < 0) return values[i]; }
  return values[values.length - 1];
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
const sample = (arr) => shuffle([...arr]);
const plural = (n, one, many) => (n === 1 ? one : many);

function pointToSegment(x, y, a, b) {
  const [ax, ay] = a; const [bx, by] = b;
  const dx = bx - ax; const dy = by - ay;
  const span = dx * dx + dy * dy;
  const t = span <= 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / span));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

function perFrameChance(chance, dt) {
  if (chance >= 1.0) return 1.0;
  if (chance <= 0.0 || dt <= 0.0) return 0.0;
  return 1.0 - Math.pow(1.0 - chance, dt * FPS);
}

// The desktop's Obstacle (battle's enemy), as in game.js.
class Obstacle {
  constructor(player, level, soundIdx, avoid = [], speedCap = 4.6, speedRate = 0.065, box = 39.0) {
    const [px, py] = player;
    this.soundIdx = soundIdx;
    this.soundName = 'obstacle_' + soundIdx;
    this.x = null;
    for (const [clearance, minRange] of [[BATTLE_AMMO_CLEARANCE, 12.0], [8.0, 12.0]]) {
      for (let i = 0; i < 500; i++) {
        // From any side (web 5.0.0: you turn to face them).
        const angle = uniform(0.0, Math.PI * 2);
        const dist = uniform(20.0, 32.0);
        const tx = px + Math.sin(angle) * dist;
        const ty = py - Math.cos(angle) * dist;
        if (!(tx >= -box && tx <= box && ty >= -box && ty <= box)) continue;
        if (Math.hypot(tx - px, ty - py) < minRange) continue;
        if (avoid.some(([ax, ay]) => Math.hypot(tx - ax, ty - ay) < clearance)) continue;
        this.x = tx; this.y = ty;
        break;
      }
      if (this.x !== null) break;
    }
    if (this.x === null) {
      const corners = [[-box, -box], [-box, box], [box, -box], [box, box]];
      let best = corners[0]; let bestD = -1;
      for (const c of corners) {
        const d = avoid.length ? Math.min(...avoid.map(([ax, ay]) => Math.hypot(c[0] - ax, c[1] - ay))) : 0.0;
        if (d > bestD) { best = c; bestD = d; }
      }
      [this.x, this.y] = best;
    }
    this.speed = Math.min(speedCap, 1.75 + Math.max(0, level) * speedRate);
    this.channel = null;
  }

  update(player, dt) {
    const dx = player[0] - this.x;
    const dy = player[1] - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      this.x += (dx / dist) * this.speed * dt;
      this.y += (dy / dist) * this.speed * dt;
    }
    return dist;
  }
}

// The desktop's AmmoCartridge, as in game.js (the facing it is given is unused there too).
class AmmoCartridge {
  constructor(player, avoid = [], maxDist = null, shots = null, minDist = null) {
    const [px, py] = player;
    const near = minDist || 14.0;
    const far = maxDist || 200.0;
    this.x = null;
    for (let i = 0; i < 300; i++) {
      const tx = uniform(-38.0, 38.0);
      const ty = uniform(-38.0, 38.0);
      const d = Math.hypot(tx - px, ty - py);
      if (d < near || d > far) continue;
      if (avoid.some(([ax, ay]) => Math.hypot(tx - ax, ty - ay) < BATTLE_AMMO_CLEARANCE)) continue;
      this.x = tx; this.y = ty;
      break;
    }
    if (this.x === null) {
      let placed = false;
      for (let i = 0; i < 300; i++) {
        const tx = uniform(-38.0, 38.0);
        const ty = uniform(-38.0, 38.0);
        const d = Math.hypot(tx - px, ty - py);
        if (Math.min(near, 10.0) <= d && d <= far) { this.x = tx; this.y = ty; placed = true; break; }
      }
      if (!placed) {
        const step = Math.max(10.0, near);
        this.x = Math.max(-38.0, Math.min(38.0, px + (px >= 0 ? -step : step)));
        this.y = Math.max(-38.0, Math.min(38.0, py + (py >= 0 ? -step : step)));
      }
    }
    this.shots = shots !== null ? shots : randint(3, 6);
    this.channel = null;
  }
}

// ------------------------------------------------------------------ the game's own methods
const mixin = {
  startIsland() {
    this.state = ISLAND;
    this.resetGameState();
    this.state = ISLAND;
    this._syncRoom();
    this._wake(true);
    if (this.ambienceChannel) { this.ambienceChannel.stop(); this.ambienceChannel = null; }
    if (this.beatChannel) { this.beatChannel.stop(); this.beatChannel = null; }
    this.ammo = ISLAND_START_AMMO;
    this.kills = 0;
    this.islandNumber = 1;
    this.guardianPlan = {};
    this.islandCrossed = 0;
    this.islandPoints = 0;
    this.islandDeath = '';
    this.islandRide = null;
    this.islandItems = [];
    this.islandCarryingDiver = false;
    // Web: the ride is a long recording, decoded ahead so it starts with its doors.
    this.audio.prepare('elevator_ride');
    // Both ambiences run for the whole run and only their volumes move, so a ride
    // is a true cross-fade rather than one sound stopping and another starting.
    this.islandShoreOrder = [];
    this.islandShore = this._islandNextShore();
    this.islandAmb = {
      under: this.audio.play('underwater', { loops: -1, volume: 0.0 }),
    };
    this._islandPlayShore(this.islandShore, ISLAND_SURFACE_VOLUME);
    this.tts.speak('Island Mode.');
    this._islandNewIsland();
  },

  // The shores the packs hold (the desktop's audio.island_shores).
  _islandShores() {
    const shores = ISLAND_SHORES.filter((n) => this.audio.has(n));
    return shores.length ? shores : ['island_surface'];
  },

  _islandNextShore() {
    // The next island's shore sound: a shuffled deal through every recording,
    // never the same one twice in a row, reshuffled once they have all been used.
    const shores = this._islandShores();
    if (!this.islandShoreOrder.length) {
      this.islandShoreOrder = sample(shores);
      const last = this.islandShore;
      if (shores.length > 1 && this.islandShoreOrder[0] === last) this.islandShoreOrder.push(this.islandShoreOrder.shift());
      // Web: a run's first shore was drawn ahead (by the same rule: any shore but
      // the one the last run ended on) and decoded, so the run starts with it at
      // once. It goes to the front of this first deal.
      const first = this.islandFirstShore;
      this.islandFirstShore = null;
      if (first && this.islandShoreOrder.includes(first) && first !== last) {
        this.islandShoreOrder.splice(this.islandShoreOrder.indexOf(first), 1);
        this.islandShoreOrder.unshift(first);
      }
    }
    const shore = this.islandShoreOrder.shift();
    // Web: in chaos the next island's shore is held ready too (with its muffled
    // copy), however many levels come before it. When this deal is used up, the
    // next is dealt now, by the same rule, so its first shore can be ready too.
    if (this.chaosMode && !this.islandShoreOrder.length) {
      this.islandShoreOrder = sample(shores);
      if (shores.length > 1 && this.islandShoreOrder[0] === shore) this.islandShoreOrder.push(this.islandShoreOrder.shift());
    }
    const next = this.chaosMode ? this.islandShoreOrder[0] : null;
    if (next) {
      this.audio.prepare(next, 'next:shore');
      this.audio.prepare(this._islandMuffled(next), 'next:shore_muffled');
    }
    return shore;
  },

  // Web: draw the next run's first shore and decode it (and its muffled copy)
  // ahead, as game.js does for the next drone.
  _islandPrepareFirstShore() {
    const shores = this._islandShores().filter((n) => n !== this.islandShore);
    if (!shores.length) return;
    this.islandFirstShore = choice(shores);
    this.audio.prepare(this.islandFirstShore, 'next:shore');
    this.audio.prepare(this._islandMuffled(this.islandFirstShore), 'next:shore_muffled');
  },

  // The desktop's audio.muffled(name, wait=False): the muffled copy (made by the
  // pack builder with the desktop's own code), or the sound itself if there is none.
  _islandMuffled(name) {
    return this.audio.has(name + '_muffled') ? name + '_muffled' : name;
  },

  _islandStopAll() {
    // Stop every looping sound island mode owns. Safe to call at any time.
    const amb = this.islandAmb || {};
    for (const ch of Object.values(amb)) if (ch) ch.stop();
    this.islandAmb = {};
    this.islandShorePending = null;
    for (const attr of ['islandElevatorCh', 'islandHumCh', 'islandRideCh']) {
      const ch = this[attr];
      if (ch) ch.stop();
      this[attr] = null;
    }
    for (const it of this.islandItems || []) {
      for (const c of ['ch', 'ch2']) if (it[c]) it[c].stop();
    }
    this.islandItems = [];
    this.islandElevator = null;
    this.islandRide = null;
    if (this.islandPhase === undefined) this.islandPhase = 'island';
  },

  _islandPlayShore(name, clear = 0.0, fadeMs = 0) {
    // Start an island's shore, clear and muffled together so they stay in step.
    const amb = this.islandAmb;
    for (const k of ['surface', 'muffled']) {
      if (amb[k]) amb[k].stop();
      amb[k] = null;
    }
    const muffled = this._islandMuffled(name);
    const start = () => {
      amb.surface = this.audio.play(name, { loops: -1, volume: clear, fadeMs });
      amb.muffled = this.audio.play(muffled, { loops: -1, volume: 0.0 });
    };
    const ready = (n) => !this.audio.has(n) || this.audio.buffers.has('dry:' + n);
    if (ready(name) && ready(muffled)) {
      this.islandShorePending = null;
      start();
      return;
    }
    // Web: a long recording is decoded when first needed. The two copies start
    // together once both are ready, so they stay in step to the sample, at the
    // levels the place has by then.
    const token = {};
    const run = this.runId;
    this.islandShorePending = token;
    Promise.all([this.audio.prepare(name), this.audio.prepare(muffled)]).then(() => {
      if (this.islandShorePending !== token || this.runId !== run || this.islandAmb !== amb) return;
      this.islandShorePending = null;
      start();
      if (this.islandLevels) this._islandSetLevels(...this.islandLevels);
    });
  },

  _islandSetLevels(clear, muffled, water) {
    // Each 0..1: the island as heard outside, the island through the elevator
    // walls, and the seabed.
    this.islandLevels = [clear, muffled, water];
    const amb = this.islandAmb || {};
    if (amb.surface) amb.surface.setVolume(ISLAND_SURFACE_VOLUME * clear);
    if (amb.muffled) amb.muffled.setVolume(ISLAND_SURFACE_VOLUME * ISLAND_MUFFLED_LEVEL * muffled);
    if (amb.under) amb.under.setVolume(ISLAND_UNDER_VOLUME * water);
  },

  _islandSetMix(surface) {
    // Standing outside the elevator: 1.0 all island, 0.0 all water.
    this._islandSetLevels(surface, 0.0, 1.0 - surface);
  },

  _islandClearRoom(fadeMs = 0) {
    // Clear the place of everything in it. With fadeMs, their sounds fade out over
    // that long instead of stopping dead: how a place sounds through the closing
    // doors of the elevator you have just stepped into.
    const quiet = (ch) => {
      try { if (fadeMs > 0) ch.fadeout(Math.trunc(fadeMs)); else ch.stop(); } catch (e) { /* gone */ }
    };
    for (const obs of this.obstacles) if (obs.channel) quiet(obs.channel);
    this.obstacles = [];
    for (const pkp of this.ammoPickups) if (pkp.channel) quiet(pkp.channel);
    this.ammoPickups = [];
    for (const it of this.islandItems) {
      for (const c of ['ch', 'ch2']) if (it[c]) quiet(it[c]);
    }
    this.islandItems = [];
  },

  _islandPlace(lo, hi, limit, avoid = [], far = []) {
    // A spot between lo and hi units from the player, inside the room, at least ten
    // units from anything in avoid so two beacons never sit together, and well
    // clear of anything in far (the guardian's ground).
    const [px, py] = this.playerPos;
    for (let tries = 0; tries < 800; tries++) {
      const tx = uniform(-limit, limit);
      const ty = uniform(-limit, limit);
      const d = Math.hypot(tx - px, ty - py);
      if (!(lo <= d && d <= hi)) continue;
      if (tries < 600 && avoid.some(([ax, ay]) => Math.hypot(tx - ax, ty - ay) < 10.0)) continue;
      if (tries < 700 && far.some(([ax, ay]) => Math.hypot(tx - ax, ty - ay) < ISLAND_GUARDIAN_REACT + ISLAND_REACH + 1.0)) continue;
      return [tx, ty];
    }
    return [px > 0 ? -limit * 0.9 : limit * 0.9, py > 0 ? -limit * 0.9 : limit * 0.9];
  },

  _guardianOn(n) {
    // Whether island n of this run has a guardian. Drawn island by island and
    // remembered, so the next island's guardian is already known when the seabed
    // works out how much ammo to lay out for it.
    if (!this.guardianPlan) this.guardianPlan = {};
    const plan = this.guardianPlan;
    for (let k = 1; k <= n; k++) {
      if (k in plan) continue;
      const before = Object.keys(plan).map(Number).filter((j) => j < k && plan[j]);
      const last = before.length ? Math.max(...before) : 0;
      if (k === 1 || plan[k - 1]) plan[k] = false;                 // never the first, never two in a row
      else if (k - 1 - last >= ISLAND_GUARDIAN_MAX_GAP) plan[k] = true;   // never too long without one
      else plan[k] = rand() < ISLAND_GUARDIAN_CHANCE;
    }
    return plan[n];
  },

  _guardianHits(n) {
    // Hits the guardian on island n takes, or 0 for no guardian: three for the
    // first one met, and one more for every guardian before it.
    if (!this._guardianOn(n)) return 0;
    const before = Object.entries(this.guardianPlan).filter(([k, g]) => Number(k) < n && g).length;
    return ISLAND_GUARDIAN_HITS + before;
  },

  _islandEnemiesLeft() { return Math.max(0, this.islandTargets - this.islandKillsHere); },

  // ------------------------------------------------------------------ islands
  _islandNewIsland() {
    // Everything an island keeps for as long as you are on it.
    const n = this.islandNumber;
    this.islandTargets = 3 + n;
    this.islandKillsHere = 0;
    this.islandCleared = false;
    this.islandKey = false;
    this.islandTreasure = rand() < ISLAND_TREASURE_CHANCE;
    this.islandDiver = n > 1 && rand() < ISLAND_DIVER_CHANCE;
    this.islandGuardianHp = this._guardianHits(n);
    // This island's one supply of ammo, on its seabed.
    let need = this.islandTargets + this.islandGuardianHp + ISLAND_AMMO_POOL_REINFORCE;
    need += this._guardianHits(n + 1);
    const [lo, hi] = ISLAND_AMMO_SHOTS;
    const count = randint(...ISLAND_AMMO_CARTRIDGES);
    const cartridges = [];
    for (let k = 0; k < count; k++) cartridges.push(randint(lo, hi));
    // A lean draw is filled up to the need, counting what you already carry.
    need = Math.max(0, need - this.ammo);
    let i = 0;
    const sum = () => cartridges.reduce((s, c) => s + c, 0);
    while (sum() < need) {
      if (cartridges.every((c) => c >= hi)) cartridges.push(randint(lo, hi));
      else {
        cartridges[i % cartridges.length] = Math.min(hi, cartridges[i % cartridges.length] + 1);
        i += 1;
      }
    }
    shuffle(cartridges);
    this.islandAmmoCartridges = cartridges;
    this.islandAmmoBudget = sum();
    this.islandReinforced = 0;
    this.islandSaved = null;        // what was on the island when you last left it
    this.islandCreditRolled = false;
    this.islandSeabedCredit = null;
    const ang = uniform(0, 2 * Math.PI);
    this.islandGuardianPost = [Math.cos(ang) * ISLAND_GUARDIAN_POST, Math.sin(ang) * ISLAND_GUARDIAN_POST];
    this._islandSetupSurface();
  },

  _islandSetupSurface() {
    // Step out of the elevator onto the island: a little way from the lift, never
    // within reach of it, and clear of any guardian's post.
    this._islandClearRoom();
    this.islandPhase = 'island';
    this.arenaLimit = ISLAND_ARENA;
    for (;;) {
      this.playerPos = [uniform(-ISLAND_ARENA + 3, ISLAND_ARENA - 3), uniform(-ISLAND_ARENA + 3, ISLAND_ARENA - 3)];
      if (Math.hypot(this.playerPos[0], this.playerPos[1]) <= ISLAND_ARRIVE_MIN) continue;
      // Never within the guardian's reach when you step out.
      if (this.islandGuardianHp > 0) {
        const [gx, gy] = this.islandGuardianPost;
        if (Math.hypot(this.playerPos[0] - gx, this.playerPos[1] - gy) <= ISLAND_GUARDIAN_REACT + 2.0) continue;
      }
      break;
    }
    this.playerFacing = [0, -1];
    this.islandGrace = ISLAND_ARRIVAL_GRACE;
    this.islandConcurrent = Math.min(ISLAND_MAX_CONCURRENT, 1 + Math.floor(this.islandNumber / 2));
    this.islandPlaceT = 0.0;
    this._islandSetMix(1.0);
    this._islandStartLift([0.0, 0.0]);
    // Its first call waits for the fade in, so it is not lost in silence.
    this.islandDingTimer = ISLAND_SEABED_FADE * 0.7;
    this.islandLiftArmed = true;
    this.islandBuzzTimer = 0.0;
    if (this.islandGuardianHp > 0) this._islandSpawnGuardian();
    const saved = this.islandSaved;
    if (saved !== null && saved !== undefined) {
      // Back from the seabed: the island as you left it.
      this.islandSaved = null;
      const n = this.islandNumber;
      for (const [idx, x0, y0, speed] of saved.enemies) {
        let x = x0; let y = y0;
        const obs = new Obstacle(this.playerPos, n * 2, idx, [], 6.0, 0.13);
        // Where it stood, but never on top of where you step out: anything closer
        // than the arrival distance is set back along the same line.
        let dx = x - this.playerPos[0]; let dy = y - this.playerPos[1];
        let d = Math.hypot(dx, dy);
        if (d < ISLAND_RETURN_CLEAR) {
          if (d < 0.01) { dx = 1.0; dy = 0.0; d = 1.0; }
          x = this.playerPos[0] + dx / d * ISLAND_RETURN_CLEAR;
          y = this.playerPos[1] + dy / d * ISLAND_RETURN_CLEAR;
          if (Math.abs(x) > ISLAND_ARENA || Math.abs(y) > ISLAND_ARENA) {
            // That line runs off the island; set it back toward the middle instead.
            const cx = -this.playerPos[0]; const cy = -this.playerPos[1];
            const cd = Math.hypot(cx, cy) || 1.0;
            x = this.playerPos[0] + cx / cd * ISLAND_RETURN_CLEAR;
            y = this.playerPos[1] + cy / cd * ISLAND_RETURN_CLEAR;
          }
          x = Math.max(-ISLAND_ARENA, Math.min(ISLAND_ARENA, x));
          y = Math.max(-ISLAND_ARENA, Math.min(ISLAND_ARENA, y));
        }
        obs.x = x; obs.y = y; obs.speed = speed;
        obs.channel = this.audio.play(obs.soundName, { loops: -1, volume: 0.0 });
        this.obstacles.push(obs);
      }
      for (const [kind, pos, value] of saved.items) {
        if (kind === 'treasure') {
          this.islandItems.push({ kind: 'treasure', pos, ch: this.audio.play('treasure_beacon', { loops: -1, volume: 0.0 }) });
        } else {
          this.islandItems.push({ kind: 'credit', pos, value, ch: this.audio.play(`credit_beacon_${value}`, { loops: -1, volume: 0.0 }) });
        }
      }
      return;
    }
    if (this.islandTreasure) {
      // Treasure lies on the island itself, out in the open where the enemies are,
      // a step inside the shore, and waits there until you pick it up.
      const far = this.islandGuardianHp > 0 ? [[...this.islandGuardianPost]] : [];
      const pos = this._islandPlace(10.0, 35.0, ISLAND_ARENA - 3.0, [[0.0, 0.0]], far);
      this.islandItems.push({ kind: 'treasure', pos, ch: this.audio.play('treasure_beacon', { loops: -1, volume: 0.0 }) });
    }
    if (!this.islandCreditRolled) {
      // Once an island: diving and coming back never deals a second one.
      this.islandCreditRolled = true;
      this._islandMaybeCredit(CHAOS_CREDIT_ISLAND, 12.0, 38.0, ISLAND_ARENA,
        [[0.0, 0.0], ...this.islandItems.map((it) => it.pos)]);
    }
  },

  _islandSpawnGuardian() {
    // The guardian keeps a post a few steps from the elevator. It stays near it,
    // and comes at you whenever you are close.
    const g = new Obstacle(this.playerPos, 0, 0);
    g.post = this.islandGuardianPost;
    [g.x, g.y] = g.post;
    g.guardian = true;
    g.speed = ISLAND_GUARDIAN_SPEED;
    g.soundName = 'guardian';
    g.channel = this.audio.play('guardian', { loops: -1, volume: 0.0 });
    this.obstacles.push(g);
  },

  _guardianHunting() {
    // Out of shots with the guardian still standing: there is nothing left to do
    // but be caught, so the guardian leaves its post and comes for you.
    return this.ammo <= 0 && this.islandGuardianHp > 0 && this.islandGrace <= 0;
  },

  _islandMoveGuardian(g, dt) {
    const [px, py] = this.playerPos;
    let [tx, ty] = g.post;
    const hunting = this._guardianHunting();
    let speed = g.speed;
    if (hunting) {
      tx = px; ty = py;
      speed = ISLAND_GUARDIAN_HUNT_SPEED;
    } else if (this.islandGrace <= 0 && Math.hypot(px - g.post[0], py - g.post[1]) < ISLAND_GUARDIAN_REACT) {
      tx = px; ty = py;
    }
    const dx = tx - g.x; const dy = ty - g.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.05) {
      const step = Math.min(d, speed * dt);
      g.x += dx / d * step;
      g.y += dy / d * step;
    }
    if (!hunting) {
      const lx = g.x - g.post[0]; const ly = g.y - g.post[1];
      const ld = Math.hypot(lx, ly);
      if (ld > ISLAND_GUARDIAN_LEASH) {
        g.x = g.post[0] + lx / ld * ISLAND_GUARDIAN_LEASH;
        g.y = g.post[1] + ly / ld * ISLAND_GUARDIAN_LEASH;
      }
    }
    return Math.hypot(px - g.x, py - g.y);
  },

  // ------------------------------------------------------------------ the lift
  _islandStartLift(pos) {
    if (this.islandHumCh) this.islandHumCh.stop();
    this.islandElevator = pos;
    this.islandDingTimer = 0.0;
    this.islandHumCh = this.audio.play('elevator_hum', { loops: -1, volume: 0.0 });
    this.audio.prepare('elevator_ride');     // web: ready for the ride
  },

  _islandUpdateElevator(dt) {
    // Pan the elevator's hum and ring its chime every 1.6 seconds. Returns the
    // distance to it.
    let [left, right, dist] = this._battleLevels(this.islandElevator);
    const f = this._islandSeabedFade();
    const behind = this._behind(this.islandElevator);
    if (this.islandHumCh) this.islandHumCh.setVolume(left * f, right * f, behind);
    this.islandDingTimer -= dt;
    if (this.islandDingTimer <= 0) {
      this.islandDingTimer = 1.6;
      // On the seabed the only way is up, so the car calls with one tone; on an
      // island the next trip is down, so it calls with its two note chime.
      const onSeabed = this.islandPhase === 'seabed';
      const ch = this.audio.play(onSeabed ? 'elevator_arrive_1' : 'elevator_ding');
      left *= f; right *= f;
      if (ch) ch.setVolume(left, right, behind);
      this.islandElevatorCh = ch;
    }
    return dist;
  },

  _islandStartRide(direction) {
    for (const attr of ['islandHumCh', 'islandElevatorCh']) {
      const ch = this[attr];
      if (ch) ch.stop();
      this[attr] = null;
    }
    this.islandElevator = null;
    if (direction === 'up' && this.islandPhase === 'seabed') {
      // A cartridge left lying on the seabed goes back into the island's supply:
      // it is still there on the next dive.
      for (const p of this.ammoPickups) {
        this.islandAmmoCartridges.unshift(p.shots);
        this.islandAmmoBudget = (this.islandAmmoBudget || 0) + p.shots;
      }
    }
    if (direction === 'down' && this.islandPhase === 'island') {
      // The island stays as you left it: the same enemies, with the same voices,
      // where they stood, and whatever was lying on the sand.
      this.islandSaved = {
        enemies: this.obstacles.filter((o) => !o.guardian).map((o) => [o.soundIdx, o.x, o.y, o.speed]),
        items: this.islandItems.filter((it) => it.kind === 'treasure' || it.kind === 'credit')
          .map((it) => [it.kind, it.pos, it.value]),
      };
    }
    this._islandClearRoom(ISLAND_LEAVE_FADE * 1000);
    this.islandRideOnward = false;
    if (direction === 'up') {
      // A rescued diver is safe the moment they are in the elevator with you.
      if (this.islandCarryingDiver) {
        this.islandCarryingDiver = false;
        this.islandPoints += ISLAND_POINTS_DIVER;
      }
      // Onward only with the island clear and its key in hand. Otherwise this car
      // goes back to the island you left, and its shore is the one you hear.
      this.islandRideOnward = this.islandCleared && this.islandKey;
      if (this.islandRideOnward && this.chaosMode) {
        // In chaos, what comes next is chosen now, and its own sound rises through
        // the elevator doors in place of a new island's shore.
        this.chaosNext = this._chaosPickNext();
        this.chaosPreview = this._chaosPreviewName(this.chaosNext);
        this._islandPlayShore(this.chaosPreview, 0.0);
      } else {
        if (this.islandRideOnward) this.islandShore = this._islandNextShore();
        this._islandPlayShore(this.islandShore, 0.0);
      }
    }
    // The ride lasts exactly as long as the ride sound, so the doors in the
    // recording open on the moment you arrive. A recording far longer than a ride
    // should be is capped and eased out.
    const e = this.audio.entries && this.audio.entries.get('elevator_ride');
    const own = e && e.dry ? e.dry.frames / RATE : ISLAND_RIDE_TIME;
    const length = Math.max(ISLAND_RIDE_MIN, Math.min(ISLAND_RIDE_MAX, own));
    this.islandRide = { dir: direction, t: 0.0, faded: false, len: length, capped: length < own - 0.05 };
    this.islandRide.chimed = false;
    this.islandRideCh = this.audio.play('elevator_ride');
  },

  _islandUpdateRide(dt) {
    const r = this.islandRide;
    // Web: the ride recording is long, so it may still be decoding on the first
    // frames of a ride. The ride's clock waits for it, so the doors in the
    // recording still open the moment you arrive.
    if (this.islandRideCh && this.islandRideCh.busy && !this.islandRideCh.dry) return;
    r.t += dt;
    if (r.dir === 'up' && !this.islandAmb.surface && !this.islandShorePending) {
      // Whatever should be rising with this ride is not playing. Retry, at silence:
      // the mix below brings it in from wherever the ride is now.
      const name = this.chaosPreview || this.islandShore;
      if (name) this._islandPlayShore(name, 0.0);
    }
    const L = r.len;
    const stage = (a, b) => Math.min(1.0, Math.max(0.0, (r.t - a * L) / ((b - a) * L)));
    const shut = stage(0.0, ISLAND_DOORS_SHUT);                     // doors closing
    const move = stage(ISLAND_DOORS_SHUT, ISLAND_DOORS_OPEN);       // car moving
    const wide = stage(ISLAND_DOORS_OPEN, ISLAND_DOORS_WIDE);       // doors opening
    const m = ISLAND_MUFFLED_LEVEL;
    let clear; let muffled; let water;
    if (r.dir === 'down') {
      // The island goes muffled as the doors close, holds there a while, then gives
      // way to the water as the car moves, and the water opens up as the doors open.
      const hold = ISLAND_DOORS_SHUT + (ISLAND_DOORS_OPEN - ISLAND_DOORS_SHUT) * ISLAND_LEAVE_HOLD;
      const going = stage(hold, ISLAND_DOORS_OPEN);
      muffled = shut * (1.0 - going);
      clear = 1.0 - shut;
      water = move * (m + (1.0 - m) * wide);
    } else {
      // The water goes quiet as the doors close, gives way to the island, heard
      // muffled, while the car moves, and the island opens up with the doors.
      water = (1.0 - shut * (1.0 - m)) * (1.0 - move);
      muffled = move * (1.0 - wide);
      clear = wide;
    }
    // Through the walls, a little of the clear sound comes with the muffled.
    clear = Math.min(1.0, clear + ISLAND_WALL_LEAK * m * muffled);
    this._islandSetLevels(clear, muffled, water);
    // The arrival chime, just before the doors open: two arriving on an island,
    // one arriving on the seabed.
    if (!r.chimed && r.t >= ISLAND_DOORS_OPEN * L - ISLAND_ARRIVE_CHIME_LEAD) {
      r.chimed = true;
      // In chaos, a ride up that leads on to some other kind of level is not an
      // elevator arriving anywhere: no chime at all.
      const onwardElsewhere = this.chaosMode && r.dir === 'up' && this.islandRideOnward
        && this.chaosNext !== null && this.chaosNext !== undefined && this.chaosNext !== ISLAND;
      if (!onwardElsewhere) this.islandChimeCh = this.audio.play(r.dir === 'up' ? 'elevator_arrive_2' : 'elevator_arrive_1');
    }
    if (r.capped && !r.faded && r.t >= r.len - 1.0) {
      r.faded = true;
      if (this.islandRideCh) this.islandRideCh.fadeout(1000);
    }
    if (r.t < r.len) return;
    this.islandRide = null;
    this.islandRideCh = null;
    if (r.dir === 'down') {
      this._islandSetupSeabed();
      return;
    }
    // Up. Nothing is said and nothing extra is played: the shore tells you where you are.
    if (this.islandRideOnward) {
      if (this.chaosMode) {
        // The island is done; chaos picks what comes next.
        this.islandCrossed += 1;
        this.islandPoints += ISLAND_POINTS_ISLAND;
        this.nextLevel();
        return;
      }
      this.islandCrossed += 1;
      this.islandPoints += ISLAND_POINTS_ISLAND;
      this.islandNumber += 1;
      this._islandNewIsland();
    } else {
      this._islandSetupSurface();
    }
  },

  // ------------------------------------------------------------------ the seabed
  _islandSetupSeabed() {
    this.islandPhase = 'seabed';
    this.arenaLimit = SEABED_ARENA;
    this.playerPos = [0.0, 0.0];
    this.playerFacing = [0, -1];
    this.islandAir = ISLAND_AIR;
    this.islandAirWarned = false;
    this.islandLastAirBeep = -1;
    this.islandBubbleTimer = uniform(2.0, 4.0);
    this.islandReinforceTimer = ISLAND_REINFORCE_FIRST;
    this.islandDiveReinforced = 0;
    this.islandPlaceT = 0.0;
    this._islandSetMix(0.0);
    // The way up is always well away from where you arrive, so finding it is a swim
    // and not a step. Everything else is spread out around it.
    const up = this._islandPlace(25.0, 48.0, SEABED_ARENA);
    this._islandStartLift(up);
    // The first call comes once the fade in is well under way.
    this.islandDingTimer = ISLAND_SEABED_FADE * 0.7;
    this.islandLiftArmed = true;
    const taken = [up];
    const put = (kind, lo, hi) => {
      const pos = this._islandPlace(lo, hi, SEABED_ARENA, taken);
      taken.push(pos);
      const it = { kind, pos, ch: this.audio.play(ISLAND_ITEM_SOUNDS[kind], { loops: -1, volume: 0.0 }) };
      if (kind === 'vent') it.ch2 = this.audio.play('potion_beacon', { loops: -1, volume: 0.0 });
      this.islandItems.push(it);
    };
    if (!this.islandKey) put('key', 15.0, 40.0);
    if (this.islandDiver) put('diver', 20.0, 44.0);
    put('vent', 12.0, 35.0);
    this.islandVentTimer = 0.0;
    // Drawn once per island, like the island's own credit (chaos only).
    if (this.chaosMode) {
      if (this.islandSeabedCredit === null || this.islandSeabedCredit === undefined) {
        // Decided at the first dive: a value, or 0 for none.
        this.islandSeabedCredit = rand() < CHAOS_CREDIT_SEABED ? choice(CHAOS_CREDIT_VALUES) : 0;
      }
      if (this.islandSeabedCredit) {
        // Still there until it is collected, at a new spot each dive.
        this._islandMaybeCredit(1.0, 15.0, 42.0, SEABED_ARENA, taken, this.islandSeabedCredit, true);
      }
    }
    this._islandRestock(taken);
    // Nothing is said. What is down here is there to be found by ear.
  },

  _islandRestock(avoid = null) {
    // Keep one cartridge on the seabed while the island's supply lasts.
    if (this.ammoPickups.length) return;
    const left = this.islandAmmoCartridges;
    if (!left || !left.length) return;
    avoid = avoid ? [...avoid] : [];
    if (this.islandElevator) avoid.push(this.islandElevator);
    avoid.push(...this.islandItems.map((it) => it.pos));
    const shots = left.shift();
    this.islandAmmoBudget = Math.max(0, (this.islandAmmoBudget || 0) - shots);
    const [near, far] = weighted(ISLAND_AMMO_BANDS, ISLAND_AMMO_BAND_WEIGHTS);
    const pickup = new AmmoCartridge(this.playerPos, avoid, far, shots, near);
    pickup.channel = this.audio.play('ammo_beacon', { loops: -1, volume: 0.0 });
    this.ammoPickups.push(pickup);
  },

  _islandMaybeCredit(chance, lo, hi, limit, avoid, value = null, seabed = false) {
    // Chaos only: perhaps lay a chaos time credit here, on the island or the seabed.
    if (!this.chaosMode || rand() >= chance) return;
    value = value || choice(CHAOS_CREDIT_VALUES);
    const far = (limit === ISLAND_ARENA && (this.islandGuardianHp || 0) > 0) ? [[...this.islandGuardianPost]] : [];
    // On an island, a step inside the shore, for the same reason as the treasure.
    const pos = this._islandPlace(lo, hi, limit === ISLAND_ARENA ? limit - 3.0 : limit, avoid, far);
    this.islandItems.push({ kind: 'credit', pos, value, seabed,
      ch: this.audio.play(`credit_beacon_${value}`, { loops: -1, volume: 0.0 }) });
  },

  _islandTake(it) {
    const kind = it.kind;
    for (const c of ['ch', 'ch2']) if (it[c]) it[c].stop();
    this.islandItems.splice(this.islandItems.indexOf(it), 1);
    if (kind === 'key') {
      this.islandKey = true;
      this.audio.play('key_pickup');
    } else if (kind === 'treasure') {
      this.islandTreasure = false;
      this.islandPoints += ISLAND_POINTS_TREASURE;
      this.audio.play('treasure_pickup');
    } else if (kind === 'diver') {
      this.islandDiver = false;
      this.islandCarryingDiver = true;
      this.audio.play('diver_rescued');
    } else if (kind === 'credit') {
      this.timeLeft += it.value;
      if (it.seabed) this.islandSeabedCredit = 0;        // collected: this seabed has no more
      this.thirtySecAnnounced = this.timeLeft <= 30.0;
      const step = this._announceStep();
      this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / step) * step;
      this.lastBeepSecond = -1;
      this.audio.play('credit_chaos');
    } else if (kind === 'vent') {
      // The next one appears somewhere else in a while (see _islandUpdateSeabed).
      this.islandVentTimer = ISLAND_VENT_AGAIN;
      this.islandAir = ISLAND_AIR;
      this.islandAirWarned = false;
      this.islandLastAirBeep = -1;
      this.audio.play('vent_refill');
    }
  },

  // ------------------------------------------------------------------ each frame
  updateIslandMode(dt) {
    if (this.isPaused) return;
    // The chaos clock stops while you are in the elevator.
    if (this.chaosMode && !this.islandRide && this._advanceTimer(dt)) return;
    if (this.islandRide) {
      this._islandUpdateRide(dt);
      return;
    }
    if (this.islandPhase === 'seabed') this._islandUpdateSeabed(dt);
    else this._islandUpdateSurface(dt);
  },

  _islandUpdateSurface(dt) {
    // The step taken since the last frame, if any, judged once below and then gone.
    const steps = [...(this.battleSteps || [])];
    this.battleSteps = [];
    this.islandPlaceT = (this.islandPlaceT || 0.0) + dt;
    const fade = this._islandSeabedFade();
    if (!this.islandAmb.surface && this.islandShore && !this.islandShorePending) {
      // The shore is not playing. Try again now.
      this._islandPlayShore(this.islandShore, ISLAND_SURFACE_VOLUME);
    }
    if (this.islandGrace > 0) this.islandGrace -= dt;
    const n = this.islandNumber;
    const regular = this.obstacles.filter((o) => !o.guardian);
    if (!this.islandCleared && regular.length < this.islandConcurrent
        && this.islandKillsHere + regular.length < this.islandTargets
        && rand() < perFrameChance(0.03 + 0.01 * n, dt)) {
      const used = new Set(regular.map((o) => o.soundIdx));
      const available = [...Array(10).keys()].filter((i) => !used.has(i));
      if (available.length) {
        const obs = new Obstacle(this.playerPos, n * 2, choice(available), [], 6.0, 0.13, ISLAND_ARENA);
        obs.channel = this.audio.play(obs.soundName, { loops: -1, volume: 0.0 });
        this.obstacles.push(obs);
      }
    }

    for (const obs of this.obstacles) {
      const was = [obs.x, obs.y];          // where it stood while the steps were taken
      let dist; let reach; let gain;
      if (obs.guardian) {
        dist = this._islandMoveGuardian(obs, dt);
        reach = ISLAND_GUARDIAN_STRIKE;
        gain = ISLAND_GUARDIAN_GAIN;
      } else {
        // During the arrival grace nothing closes in.
        dist = obs.update(this.playerPos, this.islandGrace <= 0 ? dt : 0.0);
        reach = 0.8;
        gain = 1.0;
      }
      for (const [a, b] of steps) {
        // An enemy anywhere along a step reached you, as in battle.
        dist = Math.min(dist, pointToSegment(was[0], was[1], a, b));
      }
      let [left, right] = this._battleLevels([obs.x, obs.y], gain);
      if (obs.guardian) {
        // Never faint, wherever it stands: it is the thing on this island.
        const loud = Math.max(left, right);
        if (loud > 0.0 && loud < ISLAND_GUARDIAN_FLOOR) {
          const scale = ISLAND_GUARDIAN_FLOOR / loud;
          left = Math.min(1.0, left * scale); right = Math.min(1.0, right * scale);
        }
      }
      if (obs.channel) obs.channel.setVolume(left * fade, right * fade, this._behind([obs.x, obs.y]));
      if (dist < reach && this.islandGrace <= 0) {
        this.audio.play('player_hit');
        this.islandDeath = 'enemy';
        this.triggerGameOver();
        return;
      }
    }

    for (const it of [...this.islandItems]) {
      const [left, right, dist] = this._islandItemLevels(it);
      if (it.ch) it.ch.setVolume(left * fade, right * fade, this._behind(it.pos));
      if (dist < ISLAND_REACH) this._islandTake(it);
    }

    if (!this.islandCleared && this.islandKillsHere >= this.islandTargets && this.islandGuardianHp <= 0) {
      this.islandCleared = true;
      // The war horn battle mode blows when a wave begins: here it is the island won.
      this.audio.play('wave_start');
    }

    if (this.islandElevator) {
      const dist = this._islandUpdateElevator(dt);
      if (!this.islandLiftArmed && dist > ISLAND_REACH + 2.0) this.islandLiftArmed = true;
      this.islandBuzzTimer = Math.max(0.0, this.islandBuzzTimer - dt);
      if (this.islandLiftArmed && dist < ISLAND_REACH) {
        if (this.islandGuardianHp > 0) {
          // Shut while the guardian lives. The buzz says so.
          if (this.islandBuzzTimer <= 0) {
            this.islandBuzzTimer = ISLAND_BLOCKED_BUZZ;
            this.audio.play('boundary');
          }
        } else {
          this._islandStartRide('down');
        }
      }
    }
  },

  _chaosCreditLevelsIsland(pos) {
    // The desktop's _chaos_credit_levels: heard from anywhere, never fully silent.
    if (this._chaosCreditLevels) return this._chaosCreditLevels(pos);
    const dx = pos[0] - this.playerPos[0];
    const dy = pos[1] - this.playerPos[1];
    const dist = Math.hypot(dx, dy);
    const pan = dist > 0 ? dx / dist : 0.0;
    const vol = Math.max(CHAOS_CREDIT_FLOOR, 1.0 - dist / 45.0);
    return [vol * (1.0 - Math.max(0.0, pan)), vol * (1.0 - Math.max(0.0, -pan)), dist];
  },

  _islandItemLevels(it) {
    // Stereo levels for an island item. A chaos credit is heard the way every chaos
    // credit is; everything else falls off across the island like an enemy does.
    if (it.kind === 'credit') {
      const [left, right, dist] = this._chaosCreditLevelsIsland(it.pos);
      const g = ISLAND_ITEM_GAIN.credit;
      return [left * g, right * g, dist];
    }
    return this._battleLevels(it.pos, ISLAND_ITEM_GAIN[it.kind]);
  },

  _islandSeabedFade() {
    // 0 to 1 over the first moments in a place, island or seabed.
    const t = this.islandPlaceT === undefined ? ISLAND_SEABED_FADE : this.islandPlaceT;
    return Math.min(1.0, t / ISLAND_SEABED_FADE);
  },

  _islandUpdateSeabed(dt) {
    this.battleSteps = [];              // no enemies down here: a step is just a step
    this.islandPlaceT = (this.islandPlaceT || 0.0) + dt;
    const fade = this._islandSeabedFade();
    if (!this.islandAmb.under) {
      // The water is not playing. Try again now.
      this.islandAmb.under = this.audio.play('underwater', { loops: -1, volume: 0.0 });
    }
    this.islandAir -= dt;
    if (this.islandAir <= 0) {
      this.audio.play('drown');
      this.islandDeath = 'drown';
      this.triggerGameOver();
      return;
    }
    if (this.islandAir <= ISLAND_AIR_WARN) {
      if (!this.islandAirWarned) {
        this.islandAirWarned = true;
        this.tts.speak('Low air.');
      }
      const sec = Math.trunc(this.islandAir);
      if (sec !== this.islandLastAirBeep) {
        this.islandLastAirBeep = sec;
        this.audio.play('countdown_high');
      }
    }

    // Reinforcements land on the island while you are down here, unless it is
    // already clear. A few at most per dive.
    if (!this.islandCleared && this.islandDiveReinforced < ISLAND_REINFORCE_MAX) {
      this.islandReinforceTimer -= dt;
      if (this.islandReinforceTimer <= 0) {
        this.islandReinforceTimer = ISLAND_REINFORCE_EVERY;
        this.islandTargets += 1;
        this.islandDiveReinforced += 1;
      }
    }

    this.islandBubbleTimer -= dt;
    if (this.islandBubbleTimer <= 0) {
      this.islandBubbleTimer = uniform(3.0, 5.0);
      this.audio.play('bubbles', { volume: 0.5 });
    }

    for (const pickup of [...this.ammoPickups]) {
      const [left, right, dist] = this._battleLevels([pickup.x, pickup.y], 0.55);
      if (pickup.channel) pickup.channel.setVolume(left * fade, right * fade, this._behind([pickup.x, pickup.y]));
      if (dist < ISLAND_REACH) {
        this.ammo += pickup.shots;
        this.audio.play('ammo');
        if (pickup.channel) pickup.channel.stop();
        this.ammoPickups.splice(this.ammoPickups.indexOf(pickup), 1);
        this._islandRestock();
      }
    }

    for (const it of [...this.islandItems]) {
      let [left, right, dist] = this._islandItemLevels(it);
      left *= fade; right *= fade;
      const behind = this._behind(it.pos);
      if (it.ch) it.ch.setVolume(left, right, behind);
      if (it.ch2) it.ch2.setVolume(left * ISLAND_VENT_POTION_GAIN, right * ISLAND_VENT_POTION_GAIN, behind);
      if (dist < ISLAND_REACH) this._islandTake(it);
    }

    // Another air vent, a while after the last was taken (web 5.0.0).
    if (this.islandVentTimer > 0) {
      this.islandVentTimer -= dt;
      if (this.islandVentTimer <= 0 && !this.islandItems.some((q) => q.kind === 'vent')) {
        const taken = this.islandItems.map((q) => q.pos).concat(this.islandElevator ? [this.islandElevator] : []);
        const pos = this._islandPlace(12.0, 35.0, SEABED_ARENA, taken);
        this.islandItems.push({ kind: 'vent', pos,
          ch: this.audio.play(ISLAND_ITEM_SOUNDS.vent, { loops: -1, volume: 0.0 }),
          ch2: this.audio.play('potion_beacon', { loops: -1, volume: 0.0 }) });
      }
    }

    if (this.islandElevator && this._islandUpdateElevator(dt) < ISLAND_REACH) this._islandStartRide('up');
  },

  // ------------------------------------------------------------------ keys
  islandFire() {
    if (this.islandRide) return;
    if (this.islandPhase === 'seabed') { this.audio.play('empty_click'); return; }
    if (this.islandCleared) {
      // The island is won: nothing left to shoot, and no shot is spent.
      this.audio.play('empty_click');
      return;
    }
    if (this.ammo <= 0) { this.audio.play('empty_click'); return; }
    this.ammo -= 1;
    this.audio.play('laser');
    // The same rule as battle mode: whatever is centred in your ears is hit.
    const hit = this._battleLocked();
    if (!hit) return;
    const d = Math.hypot(hit.x - this.playerPos[0], hit.y - this.playerPos[1]);
    if (hit.guardian) {
      this.islandGuardianHp -= 1;
      if (this.islandGuardianHp > 0) {
        this.audio.play('guardian_hit', { at: [hit.x, hit.y] });
        return;
      }
      if (hit.channel) hit.channel.stop();
      this.obstacles.splice(this.obstacles.indexOf(hit), 1);
      this.islandPoints += ISLAND_POINTS_GUARDIAN;
      this._later(d * 0.015, 'guardian_down', [hit.x, hit.y]);
      return;
    }
    if (hit.channel) hit.channel.stop();
    this.obstacles.splice(this.obstacles.indexOf(hit), 1);
    this.kills += 1;
    this.islandKillsHere += 1;
    this.islandPoints += ISLAND_POINTS_ENEMY;
    this._later(d * 0.015, 'explosion', [hit.x, hit.y]);
  },

  islandStatus() {
    const key = this.islandKey ? 'Key found.' : 'Key not found.';
    const shots = `${this.ammo} shot${this.ammo === 1 ? '' : 's'}.`;
    if (this.islandRide) {
      this._report(`Riding the elevator ${this.islandRide.dir}.`, this.chaosMode);
    } else if (this.islandPhase === 'seabed') {
      const bits = [`${Math.max(0, Math.trunc(this.islandAir))} seconds of air.`, shots, key];
      if (this.islandCarryingDiver) bits.push('Diver with you.');
      this._report(bits.join(' '), this.chaosMode);
    } else {
      const bits = [shots];
      if (this.islandCleared) bits.push('Island clear.');
      else {
        const n = this._islandEnemiesLeft();
        bits.push(`${n} enem${n === 1 ? 'y' : 'ies'} left.`);
      }
      if (this.islandGuardianHp > 0) bits.push(`Guardian, ${this.islandGuardianHp} hit${this.islandGuardianHp === 1 ? '' : 's'}.`);
      bits.push(key);
      if (!this.chaosMode) bits.push(`${this.islandPoints} points.`);
      this._report(bits.join(' '), this.chaosMode);
    }
  },

  _holdRide(hold, stop = false) {
    // Hold an elevator ride still while the quit question is up, or let it go
    // again; with stop, silence it. (A chime the pause itself was holding stays
    // held until the pause ends: the game's own pause resumes it.)
    for (const ch of [this.islandRideCh, this.islandChimeCh]) {
      if (!ch) continue;
      if (stop) ch.stop();
      else if (hold) ch.pause();
      else if (!this.isPaused && !(this.pausedVoices || []).includes(ch)) ch.resume();
    }
    if (stop) this.islandChimeCh = null;
  },

  // The keys during a run: Space fires, Enter reports, the arrows walk.
  _islandInput(g) {
    if (g === 'clock') {
      // Any mode that runs a clock answers T: on an island, only in chaos.
      if (this.chaosMode) {
        const secs = Math.trunc(this.timeLeft);
        this.tts.speak(`${secs} second${secs === 1 ? '' : 's'} remaining.`);
      }
      return;
    }
    if (g === 'space') { this.islandFire(); return; }
    if (g === 'enter') { this.islandStatus(); return; }
    // No walking while the elevator is moving.
    if (this.islandRide) return;
    // Web 5.0.0: you turn where you stand and walk the way you face (js/turning.js).
    if (g === 'left' || g === 'right') { this._turnQuick(g === 'right' ? 1 : -1); return; }
    if (g !== 'up' && g !== 'down') return;
    const f = this.playerFacing = this._forward();
    // Where the step began, so an enemy it passed straight through counts as
    // reaching you. Moving on the seabed makes no sound at all; on an island, sand.
    const w = this._walkArena(g === 'up' ? f : [-f[0], -f[1]], 3.0, this.arenaLimit, { sound: false });
    if (!w) return;
    this.battleSteps = [...(this.battleSteps || []), w];
    if (this.islandPhase !== 'seabed') this.audio.play(choice(STEP_SAND));
  },
};

// ------------------------------------------------------------------ help
// The desktop's "Island Mode" and "Demos, Island Mode", keys turned into gestures.
const HELP_SECTIONS = [
  ['Island Mode', [
    { title: 'Island Mode', sound: null, desc: 'A chain of islands with the sea in between, and the only way across is down. Every island has an elevator in the middle that takes you down to the seabed whenever you like, and every island\'s way onward is locked. To reach the next island you need two things: the island cleared of enemies, and its key, which lies somewhere on the seabed. With both, the elevator up from the seabed takes you on to a new island. Without them, it brings you back up to the island you left. If an enemy reaches you, a guardian strikes you, or your air runs out on the seabed, the run is over. Nothing in this mode is ever described to you. You arrive at a random spot on each island, every island sounds different, and everything that happens has its own sound, so this help section is where you learn what each one means. The only words you will hear during play are Low air, and whatever you ask for with a double tap.' },
    { title: 'Island Enemies and Shooting', sound: null, desc: 'Enemies on an island work exactly like battle mode: whatever sounds centred between your ears, straight ahead of you or directly behind you, is what a two-finger tap hits. An island turns with you, as the seabed does: flick left or right to turn 30 degrees, slide and keep your finger down to keep turning, and swipe up to walk the way you face. Enemies come from any side, so turn until one is centred, then fire; one behind you sounds duller (see Behind You). In the elevator you do not turn. Island one has four enemies and every island after it adds one more, with more of them at once and faster as you go. There is no ammo on an island. You begin with eight shots, and everything after that comes from the seabed.' },
    { title: 'Island Elevators', sound: null, desc: 'An elevator is a steady low hum with a soft chime every second or two: two notes on an island, and a single note on the seabed. On an island it stands in the middle, and it works at any time, even mid-fight. When you come up onto an island you step out somewhere away from it, so finding it again is up to your ears. On the seabed the elevator up is always a long swim from where you arrive. A ride takes about fifteen seconds and you cannot move. As the doors close, where you are goes muffled, because you are inside, and it stays with you a few seconds longer, faint through the walls. While the car moves, that gives way to where you are going, which you hear coming through the walls before the doors open; when they open it opens up to its full sound. In chaos mode, if the next level is not an island, it is that level\'s own sound that rises through the doors.' },
    { title: 'Island Reinforcements', sound: null, desc: 'Diving mid-fight to reload is allowed, but the island does not wait for you. Stay down more than ten seconds and one more enemy lands on the island, then another every eight seconds, up to four per dive. Nothing tells you how many arrived; double tap on the island to hear how many enemies are left. Enemies still on the island when you leave are not lost, they are waiting. A cleared island gets no reinforcements, so once it is clear you can take as long as your air allows.' },
    { title: 'Island The Seabed and Air', sound: null, desc: 'On the seabed you are holding your breath: thirty seconds every dive. Nothing is announced when you arrive. With fifteen seconds left you hear Low air and then a high beep every second, and if it runs out you drown. That high beep is not the clock\'s: the clock\'s countdown is the lower one. You cannot shoot underwater and there are no enemies below. Cartridges lie there one at a time, marked by the same fast spinning beacon as battle mode, and the moment you take one the next appears somewhere else, nearer or further, but only until the island\'s supply runs out. Every island\'s seabed holds one supply of ammo, fixed when the island is made and shared by every dive to it: between two and six cartridges, drawn at random, of two to six shots each, and, counting what you already carry, never less than the island needs (a deep island that needs more than six full cartridges gets more) for its enemies, its guardian, three reinforcements, and any guardian waiting on the next island. Some islands are rich and some are lean. What you leave on the seabed is still there on your next dive. When it is gone, it is gone, so every shot you waste up top is a shot the island will not give back. Double tap for your air, your ammo and whether you have the key.' },
    { title: 'Island Air Vents', sound: null, desc: 'Every dive has an air vent somewhere on the seabed: loud, steady bubbling, and quietly underneath it the chime of a tower health potion, the game\'s sound for something that restores you. Swim into it and you hear the rush of your air being refilled, back up to a full thirty seconds. Each vent works once, but ten seconds after you take one, another appears somewhere else on the seabed, so a long dive is a matter of swimming from vent to vent with your errands in between. When you hear one, it is often worth going to it first.' },
    { title: 'Island The Key', sound: null, desc: 'Every island has a key on the seabed, marked by three small bright metal clinks. You need it to move on: the elevator up takes you to the next island only once the island is clear and you have its key. You can find the key before or after clearing the island, on any dive. Once you have it, it is yours for that island, and a double tap tells you whether you have it.' },
    { title: 'Island Treasure', sound: null, desc: 'Some islands have treasure lying out on the island itself, marked by a soft high shimmer that never stops. It is out in the open where the enemies are, and it waits there until you walk to it. It is worth fifty points.' },
    { title: 'Island Trapped Divers', sound: null, desc: 'From island two on, a diver is sometimes trapped on the seabed, knocking on their tank: three hollow taps, a pause, three more. Swim to them to free them, and they come with you. Get them into the elevator up and they are worth one hundred and fifty points. If you drown with them, the run is over for both of you.' },
    { title: 'Island Guardians', sound: null, desc: 'Some islands have a guardian, and nothing warns you, not even a pattern you could count: never the first island, never two in a row, about one island in three, and never more than four islands without one. You hear it: a deep, slow, throbbing growl, louder and far lower than any other enemy. It keeps its post a few steps from the elevator, and while it lives the elevator will not open. There is no ammo on an island, so bring the guardian\'s shots with you: the seabed of the island before always holds them. Walk into the elevator and you only get the buzz. You have to bring the guardian down. It takes several hits, three plus one for every guardian before it, and each hit that does not finish it lands with a metal clank. When it goes down you hear a deep boom that falls away. Keep your distance while you do it: it comes at you whenever you get near its post, and if you get within a few steps of it, it strikes you and the run is over. You never arrive on an island close to it.' },
    { title: 'Island What Each Sound Means', sound: null, desc: 'Island mode never tells you anything in words, so these are the sounds to know. The island is clear: the same war horn battle mode blows when a wave begins. The key, lying on the seabed: three small bright metal clinks; picking it up: the jingle of keys. Treasure, lying on an island: a soft high shimmer; picking it up: coins pouring into a box, fifty points. A trapped diver on the seabed: three hollow taps on a tank, a pause, three more; freeing them: a two note chime, and they come with you. An air vent: loud bubbling with a potion\'s chime quietly underneath; using it: the hiss of an air tank filling, and your air is full again. A guardian: the deep, loud, throbbing growl; a hit that does not finish it: a metal clank; bringing it down: a deep boom that falls away. The buzz means no: the elevator is shut because the guardian lives. The empty click means you pulled the trigger on nothing: you are out of ammo, you tried to shoot underwater, or the island is already clear. Every one of these is in Demos, Island Mode.' },
    { title: 'Island Scoring', sound: null, desc: 'Your score is the islands you cross plus the points you gain. Every island crossed is worth one hundred. On top of that, each enemy is worth ten, a guardian one hundred, treasure fifty and a rescued diver one hundred and fifty. At the end of a run you hear both parts and the total. A double tap on an island tells you your points so far.' },
    { title: 'Island Sounds', sound: null, desc: 'The elevator ride and the island shores are real recordings from Pixabay.' },
  ]],
];

const HELP_DEMOS = [
  ['Demos, Island Mode', [
    { title: 'Island Demos', sound: null, desc: 'Every sound island mode makes. The elevator is the one to learn: it is how you leave every island and every seabed.' },
    { title: 'Island Shore', sound: 'island_demo', desc: 'One of the island shores. Every island has a different one.' },
    { title: 'Underwater', sound: 'underwater', desc: 'The deep water of the seabed.' },
    { title: 'Elevator Calling', sound: 'elevator_beacon_demo', desc: 'The hum and chime of an elevator on an island. Walk toward it. On an island it calls with two notes, because the trip from there is down; on the seabed it calls with a single note, because the only way from there is up.' },
    { title: 'Elevator Ride', sound: 'elevator_ride', desc: 'The elevator moving between an island and the seabed. Just before the doors open it chimes: two notes, one high and one low, when you arrive on an island, because the next trip is down, and a single note when you arrive on the seabed, because the next trip is up.' },
    { title: 'The Key', sound: 'key_beacon', desc: 'Three small bright clinks. Every island\'s key sounds like this.' },
    { title: 'Key Found', sound: 'key_pickup', desc: 'You picked up the key. Nothing is said; this is how you know.' },
    { title: 'Treasure', sound: 'treasure_beacon', desc: 'The soft high shimmer of treasure lying on an island.' },
    { title: 'Treasure Collected', sound: 'treasure_pickup', desc: 'Fifty points.' },
    { title: 'Trapped Diver', sound: 'diver_tap', desc: 'Three hollow taps on a tank. Someone needs you.' },
    { title: 'Diver Rescued', sound: 'diver_rescued', desc: 'You freed a trapped diver. They are with you; get them to the elevator up.' },
    { title: 'Low Air', sound: 'countdown_high', desc: 'The high countdown, once a second over your last fifteen seconds of air. It is far higher than the clock\'s countdown, so in chaos mode you can tell your air from your time.' },
    { title: 'Air Vent', sound: 'vent', desc: 'Loud bubbling, with a potion\'s chime quietly underneath. Swim into it for a full breath.' },
    { title: 'Air Refilled', sound: 'vent_refill', desc: 'The rush of air: thirty seconds of air again.' },
    { title: 'Guardian', sound: 'guardian', desc: 'The guardian. Louder and far lower than any other enemy, and heard from anywhere on the island. It blocks the elevator until you bring it down. Run out of shots while it still stands and it leaves its post and comes for you, because there is no ammo on an island and it bars the way down to where the ammo is. It is faster than you can walk at a steady pace, so it catches you.' },
    { title: 'Guardian Down', sound: 'guardian_down', desc: 'The deep boom of a guardian falling. Now the elevator will open.' },
    { title: 'Island Clear', sound: 'wave_start', desc: 'Every enemy on the island is down. The same war horn battle mode blows when a wave begins.' },
    { title: 'Guardian Hit', sound: 'guardian_hit', desc: 'A hit that landed but did not bring it down.' },
    { title: 'Footstep on Sand', sound: 'step_sand_1', desc: 'A step on an island. The seabed makes no sound at all.' },
    { title: 'Bubbles', sound: 'bubbles', desc: 'Heard now and then while you are underwater.' },
    { title: 'Drowning', sound: 'drown', desc: 'Your air ran out. The run is over.' },
  ]],
];

// ------------------------------------------------------------------ the mode
export default {
  menu: [{ key: 'island', label: 'Island Mode', select: (game) => game.startIsland() }],
  playStates: [ISLAND],
  mixin,

  init(game) {
    if (game.chaosMode === undefined) game.chaosMode = false;
    game.islandAmb = {};
    game.islandItems = [];
    game._islandPrepareFirstShore();
    // Web: when the page is hidden mid-ride (the phone locked), the game pauses
    // itself (autoPause); the ride's own sound is held with it at once, as the
    // quit question holds it on the computer. The ride lets go when play resumes
    // (see update).
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && game.state === ISLAND && game.islandRide && game.isPaused) game._holdRide(true);
    });
  },

  // The island lines of reset_game_state.
  reset(game) { game._islandStopAll(); },

  update(game, dt) {
    // Web: a pause the page itself made (the phone locked mid-ride) holds the ride's
    // own sound with the ride, as the quit question does on the computer.
    if (game.isPaused) { if (game.islandRide) game._holdRide(true); return; }
    if (game.islandRide) game._holdRide(false);
    game.updateIslandMode(dt);
  },

  input(game, g) { game._islandInput(g); },

  // An island and its seabed turn with you (web 5.0.0); the elevator does not.
  turns(game) { return game.state === ISLAND && !game.islandRide; },
  keepFacing(game) { return game.state === ISLAND; },

  stopAll(game) {
    game._holdRide(false, true);
    game._islandStopAll();
    if (game.islandShore !== undefined && !game.islandFirstShore) game._islandPrepareFirstShore();
  },

  finish(game) {
    const g = game;
    if (g.chaosMode) {
      // On a chaos island the run is chaos's.
      const score = (g.chaosPoints || 0) + (g.islandPoints || 0);
      const opener = g.timeLeft <= 0 ? 'Time up.' : g.islandDeath === 'drown' ? 'You drowned.' : 'Game Over.';
      return { key: 'chaos', score, message: `${opener} You scored ${score} points. ` };
    }
    const opener = g.islandDeath === 'drown' ? 'You drowned.' : 'Game Over.';
    const isl = g.islandCrossed === 1 ? 'island' : 'islands';
    const fromIslands = g.islandCrossed * ISLAND_POINTS_ISLAND;
    return {
      key: 'island',
      score: g.islandPoints,
      message: `${opener} You crossed ${g.islandCrossed} ${isl}, worth ${fromIslands}, `
        + `and gained ${g.islandPoints - fromIslands} points, for a score of ${g.islandPoints}. `,
    };
  },

  // Islands, the seabed and the elevator have no room echo.
  room() { return null; },

  // No pausing, and no help, during an elevator ride: P and H only give the buzz.
  // (Web: a ride the page itself paused can always be resumed.)
  blockPause(game) { return !!game.islandRide && !game.isPaused; },

  hold(game, on) { game._holdRide(on); },

  status(game) {
    const g = game;
    const where = g.islandRide ? `Elevator going ${g.islandRide.dir}` : g.islandPhase === 'seabed' ? 'Seabed' : 'On the island';
    const bits = [`Island ${g.islandNumber}. ${where}.`, `Ammo: ${g.ammo}.`,
      `Points: ${g.islandPoints}. Islands crossed: ${g.islandCrossed}.`, g.islandKey ? 'Key: found.' : 'Key: on the seabed.'];
    if (g.islandPhase === 'seabed' && !g.islandRide) {
      bits.push(`Air: ${Math.max(0, Math.trunc(g.islandAir))}s.`);
      if (g.islandCarryingDiver) bits.push('Rescued diver with you.');
    } else if (g.islandPhase === 'island' && !g.islandRide) {
      bits.push(g.islandCleared ? 'ISLAND CLEAR.' : `Enemies left: ${g._islandEnemiesLeft()}.`);
      if (g.islandGuardianHp > 0) bits.push(`Guardian: ${g.islandGuardianHp} hits.`);
    }
    return bits.join(' ');
  },

  boards: [{ key: 'island', label: 'Island Mode', fmt: (v) => `${v} ${plural(v, 'point', 'points')}` }],

  help: { sections: HELP_SECTIONS, demos: HELP_DEMOS },
};

