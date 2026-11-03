// Driving Mode: the desktop game's road (endless_labyrinth.py, version 1.0.1:
// the DRIVE_ constants, RoadThing, and start_drive to drive_change_lane), played
// with touch. Names follow the desktop code in camelCase so the two can be read
// side by side; the desktop's comments are kept, shortened, where they explain a
// rule.
//
// Controls (Russell's decision, gestures.js 'drive' mode): put a finger down and
// slide up, and the car accelerates for as long as that finger stays down (the
// desktop's held up arrow); lift it and the car coasts. Each swipe down is one
// brake (one press of the down arrow); sliding the accelerating finger back down
// stops accelerating and brakes once. Lift, then swipe left or right to change
// lanes; lift, then tap with two fingers to shoot or double tap for the report.
// A keyboard's held up arrow accelerates too.
//
// The `if (this.chaosMode)` branches are the desktop's chaos-mode road, ported
// as they are so Chaos mode can reuse this file; standalone driving never takes
// them. The chaos helpers they call (_chaosLevelWon, _chaosDriveExitCheck,
// nextLevel for a chaos level, chaosDriveQuota, chaosPoints, islandPoints) belong
// to the Chaos port.

// ------------------------------------------------------------------ constants
// Three lanes: left, middle, right. Odd, so there is a middle one to sit in.
const DRIVE_LANES = 3;
// Metres per second. Coasting bleeds speed slowly, the brake takes it off hard.
const DRIVE_MAX_SPEED = 52.0;
const DRIVE_ACCEL = 17.0;
const DRIVE_COAST = 7.0;
const DRIVE_BRAKE = 34.0;
// How far ahead the road is simulated, and the closest anything may be spawned.
// At full speed the player covers 52 metres a second, so anything appearing
// nearer than this would arrive before they could hear it.
const DRIVE_HORIZON = 200.0;
const DRIVE_MIN_SPAWN = 95.0;
// Two minutes, called every minute.
const DRIVE_TIME_LIMIT = 120.0;
const DRIVE_TIME_ANNOUNCE = 60.0;
// What a crash costs off the clock.
const DRIVE_CRASH_PENALTY = 30.0;
// Oncoming cars are heard from further out than anything else, because they close
// at the sum of both speeds.
const DRIVE_ONCOMING_HORIZON = 360.0;
// The difficulty ramp: gentle until the knee (in ramp minutes), then climbing hard.
const DRIVE_RAMP_KNEE = 3.0;
const DRIVE_RAMP_EARLY = 3.3;
const DRIVE_RAMP_LATE_SQ = 3.0;
const DRIVE_RAMP_LATE_LIN = 4.2;
// The ramp's clock runs this much faster than the real one.
const DRIVE_RAMP_PACE = 1.5;
// The engine: one loop per speed step, each blended into the next.
const DRIVE_ENGINE_BANDS = 16;
const DRIVE_ENGINE_BLEND = 160;      // ms the old engine loop takes to fade out
// Three guarantees that keep a deep run hard rather than impossible:
// 1. Always this many seconds of warning on an oncoming car.
const DRIVE_MIN_WARNING = 2.0;
// 2. Oncoming cars may never wall off the road: within this stretch of road at
//    least this many lanes have nothing coming at you.
const DRIVE_WALL_WINDOW = 55.0;
const DRIVE_MIN_FREE_LANES = 1;
// 3. A car hunting your lane can never cross one faster than this.
const DRIVE_MIN_TRACK_TIME = 0.45;
// How far one lane over sits in the stereo field (0 centre, 1 hard to one side).
const DRIVE_LANE_PAN = 0.75;
// An item due while every lane has an oncoming car ahead waits this many metres.
const DRIVE_ITEM_RETRY = 15.0;
// A car cannot change lanes slower than this (metres a second): only the buzz.
const DRIVE_MIN_LANE_SPEED = 1.0;
// A lane change swings your engine toward that side and settles back over this long.
const DRIVE_SWERVE_PAN = 0.75;
const DRIVE_SWERVE_TIME = 0.4;
// A lane change skids the tyres from this fraction of top speed.
const DRIVE_SKID_SPEED = 0.7;
// Ammo slot chance = BASE + PER_TARGET x (cars running your way ahead)
//                    + LOW_BONUS at LOW shots or fewer, capped at MAX.
const DRIVE_AMMO_BASE = 0.5;
const DRIVE_AMMO_PER_TARGET = 0.04;
const DRIVE_AMMO_LOW_BONUS = 0.3;
const DRIVE_AMMO_LOW = 3;
const DRIVE_AMMO_MAX = 0.85;
// Credits run on their own schedule in metres of road, the gap widening with the
// ramp: gap = SPACING + PER_RAMP x ramp, give or take JITTER.
const DRIVE_CREDIT_SPACING = 1200.0;
const DRIVE_CREDIT_PER_RAMP = 15.0;
const DRIVE_CREDIT_JITTER = 0.25;
// Tunnels and overpasses, in metres of road. Neither is ever announced.
const DRIVE_TUNNEL_VARIANTS = 6;
const DRIVE_TUNNEL_GAP = [1200.0, 2400.0];      // road between tunnels
const DRIVE_TUNNEL_LEN = [180.0, 420.0];
const DRIVE_OVERPASS_GAP = [450.0, 900.0];      // road between overpasses
const DRIVE_OVERPASS_TIME = 0.35;               // seconds the overpass echo holds, once faded in
const DRIVE_OVERPASS_LEVEL = 0.8;
const DRIVE_FEATURE_FADE = 0.5;                 // seconds for the echo to fade in or out
const DRIVE_FIRST_FEATURE = [300.0, 900.0];     // road before the first one
// Tyre skids: Rubber Tire Screech 4, 7 and 12.
const DRIVE_SKIDS = ['drv_skid_1', 'drv_skid_2', 'drv_skid_3'];
// Chaos only (see the note at the top).
const CHAOS_CREDIT_VALUES = [40, 50, 60];
const CHAOS_CREDIT_ROAD_GAP = 2000.0;

const STATE = 'drive';

// ------------------------------------------------------------------ helpers (as in game.js)
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
const s = (n) => (n === 1 ? '' : 's');
// Python's round(): halves go to the even number.
function roundHalfEven(x) {
  const r = Math.round(x);
  return (Math.abs(x % 1) === 0.5 && r % 2 !== 0) ? r - 1 : r;
}

// ------------------------------------------------------------------ things on the road
// Anything sitting on the road ahead: a car, a cartridge or a time credit. `dist` is
// an absolute position along the road, so closing on something is just the
// player's own distance rising toward it.
export class RoadThing {
  constructor(kind, lane, dist, { value = 0, speed = 0.0, track = 1.0, oncoming = false } = {}) {
    this.kind = kind;           // 'car' | 'ammo' | 'credit' (| 'exit' in chaos)
    this.lane = lane;
    this.dist = dist;
    this.value = value;         // credit seconds, unused otherwise
    this.speed = speed;         // cars roll forward too, so closing is gradual
    this.channel = null;
    this.alive = true;
    // Cars hunt the player's lane, one lane at a time, on their own clock: a swerve
    // buys time and distance, never safety. `track` scales how quickly; it shrinks
    // as the run heats up. The floor only stops a degenerate zero.
    this.trackScale = Math.max(0.12, track);
    this.trackTimer = Math.max(DRIVE_MIN_TRACK_TIME, uniform(1.2, 2.2) * this.trackScale);
    // Traffic running your way hunts your lane and has to be shot; a car coming the
    // other way never changes lane, so it can be dodged, and cannot be shot.
    this.oncoming = oncoming;
  }
}

// ------------------------------------------------------------------ the game's methods
const mixin = {
  // ================================================================= DRIVING
  startDrive() {
    this.state = STATE;
    this.resetGameState();
    this.state = STATE;
    this._syncRoom();
    this._wake(true);

    this.driveLane = Math.floor(DRIVE_LANES / 2);
    this.driveSpeed = 0.0;
    this.driveDist = 0.0;
    this.driveThings = [];
    this.driveKills = 0;
    this.driveBand = -1;
    this.driveLoops = {};
    this.driveAccelerating = false;
    this.driveSpawnAt = 40.0;
    this.driveGrace = 3.0;
    this.drivePendingItem = null;
    this.driveSwerve = 0.0;
    // Where on the road the first credit is due. See DRIVE_CREDIT_SPACING.
    this.driveNextCredit = this.driveDist + this._driveCreditGap();
    this.ammo = 8;
    this.level = 0;          // score is cars destroyed

    this.timeLeft = DRIVE_TIME_LIMIT;
    this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / DRIVE_TIME_ANNOUNCE) * DRIVE_TIME_ANNOUNCE;
    this.thirtySecAnnounced = false;
    this.lastBeepSecond = -1;

    this._driveResetFeatures();
    this._driveEngine();
    this.tts.speak('Driving Mode. Two minutes.');
  },

  // A fresh road: no tunnel yet, the first one some way ahead.
  _driveResetFeatures() {
    this.driveFeature = null;
    this.driveFeatureEnv = 0.0;
    this.driveFeatureTarget = 0.0;
    this.driveNextFeature = (this.driveDist || 0.0) + uniform(...DRIVE_FIRST_FEATURE);
    this.driveNextKind = 'overpass';
    this._drivePickTunnel();
  },

  // The next tunnel's own slight variation of the tunnel echo, chosen now so that
  // its echoes are ready by the time the road reaches it.
  _drivePickTunnel() {
    this.audio.setVariant('tunnel', `tunnel_${randint(0, DRIVE_TUNNEL_VARIANTS - 1)}`);
  },

  // Tunnels and overpasses. Nothing is said about them: the road's echo simply
  // comes and goes.
  _driveUpdateFeatures(dt) {
    const d = this.driveDist;
    const f = this.driveFeature;
    if (f === null || f === undefined) {
      if (d >= (this.driveNextFeature ?? Infinity)) {
        const kind = this.driveNextKind || 'overpass';
        const nf = kind === 'tunnel'
          ? { kind: 'tunnel', end: d + uniform(...DRIVE_TUNNEL_LEN) }
          : { kind: 'overpass', until: DRIVE_OVERPASS_TIME };
        this.driveFeature = nf;
        this.driveFeatureTarget = kind === 'tunnel' ? 1.0 : DRIVE_OVERPASS_LEVEL;
      }
    } else {
      let done = false;
      if (f.kind === 'tunnel') {
        done = d >= f.end;
      } else {
        // The hold only counts once the echo has faded all the way in.
        if ((this.driveFeatureEnv || 0.0) >= DRIVE_OVERPASS_LEVEL - 1e-6) f.until -= dt;
        done = f.until <= 0;
      }
      if (done) {
        this.driveFeature = null;
        this.driveFeatureTarget = 0.0;
        // Overpasses are the common ones; a tunnel comes every few of them.
        this.driveNextKind = rand() < 0.3 ? 'tunnel' : 'overpass';
        const gap = this.driveNextKind === 'tunnel' ? DRIVE_TUNNEL_GAP : DRIVE_OVERPASS_GAP;
        this.driveNextFeature = d + uniform(...gap);
        if (this.driveNextKind === 'tunnel') this._drivePickTunnel();
      }
    }
    // The echo fades in and out rather than switching.
    let env = this.driveFeatureEnv || 0.0;
    const target = this.driveFeatureTarget || 0.0;
    const step = dt / DRIVE_FEATURE_FADE;
    if (env < target) env = Math.min(target, env + step);
    else if (env > target) env = Math.max(target, env - step);
    this.driveFeatureEnv = env;
  },

  // A tagged registry of the road's loops, so each can be stopped by name.
  _driveLoop(tag, name, volume = 1.0) {
    this._driveStopLoop(tag);
    const ch = this.audio.play(name, { loops: -1, volume });
    if (ch) this.driveLoops[tag] = ch;
    return ch;
  },

  _driveStopLoop(tag) {
    const loops = this.driveLoops || {};
    const ch = loops[tag];
    delete loops[tag];
    if (ch) ch.stop();
  },

  _driveStopLoops() {
    for (const ch of Object.values(this.driveLoops || {})) if (ch) ch.stop();
    this.driveLoops = {};
    for (const t of this.driveThings || []) {
      if (t.channel) t.channel.stop();
      t.channel = null;
    }
  },

  // Swap the engine loop when the speed crosses into a new band. This is the
  // player's speedometer.
  _driveEngine() {
    const frac = this.driveSpeed / DRIVE_MAX_SPEED;
    const last = DRIVE_ENGINE_BANDS - 1;
    const pos = frac * last;
    let band = this.driveBand;
    // Change step only once the speed is clearly into the next one, so a speed on
    // a boundary never flickers between two loops.
    if (band < 0 || pos > band + 0.75 || pos < band - 0.75) {
      band = Math.max(0, Math.min(last, roundHalfEven(pos)));
    }
    // The engine never stops, even at a standstill: the idle rumble is how the
    // player knows the car is running and waiting for them.
    const vol = 0.44 + 0.26 * frac;
    // After a lane change the engine leans toward the side moved to (negative left).
    const pan = this.driveSwerve || 0.0;
    const left = vol * (1.0 - Math.max(0.0, pan));
    const right = vol * (1.0 - Math.max(0.0, -pan));
    if (band !== this.driveBand) {
      this.driveBand = band;
      // Blend rather than cut: the old loop fades out under the new one.
      const old = this.driveLoops.engine;
      delete this.driveLoops.engine;
      if (old) old.fadeout(DRIVE_ENGINE_BLEND);
      const ch = this._driveLoop('engine', `engine_${band}`, vol);
      if (ch) ch.setVolume(left, right);
    } else {
      let ch = this.driveLoops.engine;
      if (!ch || !ch.busy) {
        // Lost somehow: restart it rather than leave the player in a silent car.
        ch = this._driveLoop('engine', `engine_${band}`, vol);
      }
      if (ch) ch.setVolume(left, right);
    }
  },

  // Stereo position and loudness for something `gap` metres ahead in `lane`. Lane
  // offset is the pan and nothing else; distance is volume only.
  _driveLevels(lane, gap, ref = null) {
    const off = lane - this.driveLane;
    const pan = Math.max(-1.0, Math.min(1.0, off * DRIVE_LANE_PAN));
    const near = Math.max(0.0, 1.0 - Math.max(0.0, gap) / (ref || DRIVE_HORIZON));
    // Linear, with a high floor: everything on the road starts clearly audible.
    const vol = 0.42 + 0.58 * near;
    return [vol * (1.0 - Math.max(0.0, pan)), vol * (1.0 - Math.max(0.0, -pan))];
  },

  // How hard the road is right now, measured only in minutes survived (at
  // DRIVE_RAMP_PACE). Nothing caps it.
  _driveRamp() {
    const mins = this.driveElapsed / 60.0 * DRIVE_RAMP_PACE;
    if (mins <= DRIVE_RAMP_KNEE) return mins * DRIVE_RAMP_EARLY;
    const over = mins - DRIVE_RAMP_KNEE;
    return DRIVE_RAMP_KNEE * DRIVE_RAMP_EARLY + over * over * DRIVE_RAMP_LATE_SQ + over * DRIVE_RAMP_LATE_LIN;
  },

  // How far out an oncoming car becomes audible: the horizon, but never less than
  // DRIVE_MIN_WARNING seconds of full-speed closing.
  _driveReach(closing) {
    return Math.max(DRIVE_ONCOMING_HORIZON, (Math.abs(closing) + DRIVE_MAX_SPEED) * DRIVE_MIN_WARNING);
  },

  // A lane for an oncoming car that still leaves the player somewhere to go, or
  // null when placing anything would close the road.
  _driveFreeLane(where) {
    const taken = new Set();
    for (const t of this.driveThings) {
      if (t.kind === 'car' && t.oncoming && Math.abs(t.dist - where) < DRIVE_WALL_WINDOW) taken.add(t.lane);
    }
    const free = [...Array(DRIVE_LANES).keys()].filter((i) => !taken.has(i));
    // Placing this car uses up one free lane, so there have to be enough spare.
    if (free.length <= DRIVE_MIN_FREE_LANES) return null;
    // Never into a lane that still has a credit or ammo waiting ahead.
    const items = this._driveItemLanesAhead();
    const openLanes = free.filter((i) => !items.has(i));
    if (!openLanes.length) return null;
    return choice(openLanes);
  },

  // Lanes with an oncoming car still ahead of the player.
  _driveOncomingLanesAhead() {
    return new Set(this.driveThings.filter((t) => t.kind === 'car' && t.oncoming && t.dist > this.driveDist).map((t) => t.lane));
  },

  // Lanes with a credit or ammo still ahead of the player.
  _driveItemLanesAhead() {
    return new Set(this.driveThings.filter((t) => ['credit', 'ammo', 'exit'].includes(t.kind) && t.dist > this.driveDist).map((t) => t.lane));
  },

  // A lane for a credit or ammo with no oncoming car in it, or null.
  _driveItemLane() {
    const blocked = this._driveOncomingLanesAhead();
    const openLanes = [...Array(DRIVE_LANES).keys()].filter((i) => !blocked.has(i));
    return openLanes.length ? choice(openLanes) : null;
  },

  // Put a credit or ammo on the road. False if every lane is blocked: the item is
  // held back and tried again shortly.
  _drivePlaceItem(kind, value = 0) {
    if (kind === 'credit' && this.chaosMode && this._chaosLevelWon()) {
      this.drivePendingItem = null;
      return true;     // no credits once a chaos road is won
    }
    const lane = this._driveItemLane();
    if (lane === null) {
      this.drivePendingItem = [kind, value];
      return false;
    }
    this.drivePendingItem = null;
    if (kind === 'credit') {
      // At the far edge of hearing: a credit needs a decision.
      const dist = this.driveDist + uniform(DRIVE_HORIZON * 0.88, DRIVE_HORIZON);
      this.driveThings.push(new RoadThing('credit', lane, dist, { value }));
    } else {
      const dist = this.driveDist + uniform(DRIVE_MIN_SPAWN, DRIVE_HORIZON);
      this.driveThings.push(new RoadThing('ammo', lane, dist));
    }
    return true;
  },

  // Chance that an ammo slot gets a cartridge, from the cars you need to shoot
  // (only traffic running your way counts).
  _driveAmmoChance() {
    const targets = this.driveThings.filter((t) => t.kind === 'car' && !t.oncoming && t.dist > this.driveDist).length;
    let chance = DRIVE_AMMO_BASE + DRIVE_AMMO_PER_TARGET * targets;
    if (this.ammo <= DRIVE_AMMO_LOW) chance += DRIVE_AMMO_LOW_BONUS;
    return Math.min(DRIVE_AMMO_MAX, chance);
  },

  // Metres of road until the next credit, from how hard the road is now.
  _driveCreditGap() {
    const gap = DRIVE_CREDIT_SPACING + DRIVE_CREDIT_PER_RAMP * this._driveRamp();
    return gap * uniform(1.0 - DRIVE_CREDIT_JITTER, 1.0 + DRIVE_CREDIT_JITTER);
  },

  // Put the next credit on the road once its stretch of road comes into hearing.
  // If every lane has an oncoming car ahead, it waits a short way: delayed, never lost.
  _driveScheduleCredit() {
    if (this.driveDist + DRIVE_HORIZON < (this.driveNextCredit ?? Infinity)) return;
    if (this.chaosMode && this._chaosLevelWon()) return;   // a won chaos road's clock has stopped
    const lane = this._driveItemLane();
    if (lane === null) {
      this.driveNextCredit += DRIVE_ITEM_RETRY;
      return;
    }
    // 10s common, 20s and 30s a little rarer but not by much.
    let value = weighted([10, 20, 30], [38, 33, 29]);
    if (this.chaosMode) value = choice(CHAOS_CREDIT_VALUES);   // chaos credits, chaos beacons
    const dist = this.driveDist + uniform(DRIVE_HORIZON * 0.88, DRIVE_HORIZON);
    const thing = new RoadThing('credit', lane, dist, { value });
    thing.chaos = !!this.chaosMode;
    this.driveThings.push(thing);
    const gap = this.chaosMode ? CHAOS_CREDIT_ROAD_GAP * uniform(0.6, 1.4) : this._driveCreditGap();
    this.driveNextCredit = this.driveDist + DRIVE_HORIZON + gap;
  },

  // Lay down the next thing on the road, always beyond the reaction floor. False
  // only when a credit or ammo is waiting for a clear lane.
  _driveSpawn() {
    // An item that could not be placed last time goes first.
    if (this.drivePendingItem) {
      const [kind, value] = this.drivePendingItem;
      return this._drivePlaceItem(kind, value);
    }
    const roll = rand();
    let lane = randint(0, DRIVE_LANES - 1);
    const dist = this.driveDist + uniform(DRIVE_MIN_SPAWN, DRIVE_HORIZON);
    if (roll < 0.645) {
      // Time survived is the main dial; cars destroyed adds to it.
      const ramp = this._driveRamp();
      const heat = this.driveKills + ramp * 6.0;
      // Oncoming traffic grows from a third of the road to about half.
      if (rand() < Math.min(0.52, 0.33 + ramp * 0.02)) {
        // Coming the other way: no ceiling on its speed, and it never changes lane.
        const closing = uniform(12.0, 26.0) + ramp * 3.2;
        // Spawn beyond wherever it will first become audible.
        const reach = this._driveReach(closing);
        const where = this.driveDist + reach * uniform(1.02, 1.3);
        lane = this._driveFreeLane(where);
        // Every safe lane here is taken: this car simply does not exist.
        if (lane === null) return undefined;
        this.driveThings.push(new RoadThing('car', lane, where, { speed: -closing, oncoming: true }));
      } else {
        // Running your way: capped below the player's own top speed, so it can
        // always be caught. This is the kind that hunts your lane.
        const lo = Math.min(26.0, 9.0 + heat * 0.45);
        const hi = Math.min(36.0, 20.0 + heat * 0.55);
        this.driveThings.push(new RoadThing('car', lane, dist, { speed: uniform(lo, hi), track: Math.max(0.18, 1.0 - heat * 0.022) }));
      }
    } else if (roll < 0.875) {
      if (rand() >= this._driveAmmoChance()) return null;     // slot left empty
      return this._drivePlaceItem('ammo');
    } else {
      // This slot used to hold a credit; it is left empty so the traffic is
      // exactly as dense as it was (credits have their own schedule).
      return null;
    }
    return undefined;
  },

  updateDriveMode(dt) {
    if (this.isPaused) return;
    if (this._advanceTimer(dt)) return;

    // ---- the car ----
    if (this.driveAccelerating) this.driveSpeed = Math.min(DRIVE_MAX_SPEED, this.driveSpeed + DRIVE_ACCEL * dt);
    else this.driveSpeed = Math.max(0.0, this.driveSpeed - DRIVE_COAST * dt);
    const prevDist = this.driveDist;
    this.driveDist += this.driveSpeed * dt;
    this.driveTravelled += this.driveSpeed * dt;
    this.driveElapsed += dt;
    if (this.driveGrace > 0) this.driveGrace -= dt;
    // The engine settles back to the middle after a lane change.
    const sw = this.driveSwerve || 0.0;
    if (sw) {
      const step = DRIVE_SWERVE_PAN * dt / DRIVE_SWERVE_TIME;
      this.driveSwerve = Math.abs(sw) <= step ? 0.0 : sw - Math.sign(sw) * step;
    }
    this._driveUpdateFeatures(dt);
    this._driveEngine();

    // ---- keep the road populated ----
    // A chaos road whose quota is shot is finished: nothing new comes onto it.
    if (this.chaosMode && this.driveKills >= (this.chaosDriveQuota ?? Infinity)) {
      this.driveSpawnAt = Math.max(this.driveSpawnAt, this.driveDist + DRIVE_HORIZON);
    }
    while (this.driveDist + DRIVE_HORIZON > this.driveSpawnAt) {
      if (this._driveSpawn() === false) {
        // An item waiting for a lane with no oncoming car: try a little further on.
        this.driveSpawnAt += DRIVE_ITEM_RETRY;
        continue;
      }
      // Spacing between things on the road, tightening as the ramp climbs.
      const r = this._driveRamp();
      this.driveSpawnAt += uniform(Math.max(30.0, 70.0 - r * 1.1), Math.max(55.0, 130.0 - r * 2.0));
    }
    if (this.chaosMode) this._chaosDriveExitCheck();
    this._driveScheduleCredit();

    // ---- everything on it ----
    for (const t of [...this.driveThings]) {
      // Contact is judged across the whole frame, not just where things end up, so
      // a fast head-on car can never step clean over you between two frames, and
      // a stutter can never skip you past a credit.
      const prevGap = t.dist - prevDist;
      if (t.speed) t.dist += t.speed * dt;
      const gap = t.dist - this.driveDist;
      const loGap = Math.min(prevGap, gap);
      const hiGap = Math.max(prevGap, gap);

      if (t.kind === 'car' && t.lane === this.driveLane && this.driveGrace <= 0 && loGap < 4.0 && hiGap > -4.0) {
        this._driveCrash();
        return;
      }

      // Only cleared once it was already behind you at the start of the frame.
      if (gap < -18.0 && prevGap < -5.0) {
        // Behind and gone. Cars that get away are not a penalty, just a miss.
        if (t.channel) t.channel.stop();
        this.driveThings.splice(this.driveThings.indexOf(t), 1);
        continue;
      }
      if (t.kind === 'car' && !t.oncoming && gap > DRIVE_HORIZON * 1.5) {
        // Pulled away ahead of you and gone over the horizon.
        if (t.channel) t.channel.stop();
        this.driveThings.splice(this.driveThings.indexOf(t), 1);
        continue;
      }

      let [left, right] = this._driveLevels(t.lane, gap);

      if (t.kind === 'car') {
        const reach = t.oncoming ? this._driveReach(t.speed) : DRIVE_HORIZON;
        [left, right] = this._driveLevels(t.lane, gap, reach);
        if (t.channel && !t.oncoming && gap > DRIVE_HORIZON) {
          // Pulled away out of hearing: silent until back within reach, so a car you
          // can hear is always one you can shoot.
          t.channel.stop();
          t.channel = null;
        }
        if (t.channel === null && gap < reach) {
          t.channel = this.audio.play(t.oncoming ? 'enemy_car_oncoming' : 'enemy_car', { loops: -1 });
        }
        if (t.channel) t.channel.setVolume(left, right);
        // Only traffic running your way hunts your lane, and only once close enough
        // to have noticed. Oncoming cars never steer at all.
        if (!t.oncoming && gap > 0 && gap < 130.0 && this.driveGrace <= 0) {
          t.trackTimer -= dt;
          if (t.trackTimer <= 0) {
            if (t.lane < this.driveLane) t.lane += 1;
            else if (t.lane > this.driveLane) t.lane -= 1;
            t.trackTimer = Math.max(DRIVE_MIN_TRACK_TIME, uniform(1.2, 2.2) * t.trackScale);
          }
        }
        continue;
      }

      if (t.kind === 'credit') {
        if (t.channel === null && gap < DRIVE_HORIZON) {
          const beacon = t.chaos ? `credit_beacon_${t.value}` : `credit_beacon_drive_${t.value}`;
          t.channel = this.audio.play(beacon, { loops: -1 });
        }
        // Credits ride above everything else on the road.
        if (t.channel) t.channel.setVolume(Math.min(1.0, left * 1.35), Math.min(1.0, right * 1.35));
        if (loGap < 5.0 && hiGap > -5.0 && t.lane === this.driveLane) {
          if (t.channel) { t.channel.stop(); t.channel = null; }
          this.driveThings.splice(this.driveThings.indexOf(t), 1);
          this.timeLeft += t.value;
          this.thirtySecAnnounced = this.timeLeft <= 30.0;
          const step = this._announceStep();
          this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / step) * step;
          this.lastBeepSecond = -1;
          this.audio.play(t.chaos ? 'credit_chaos' : `credit_drive_${t.value}`);
        }
        continue;
      }

      if (t.kind === 'exit') {
        // Chaos only: the way out of this stretch of road.
        if (t.channel === null) t.channel = this.audio.play('exit_morse', { loops: -1 });
        if (t.channel) t.channel.setVolume(Math.min(1.0, left * 1.2), Math.min(1.0, right * 1.2));
        if (loGap < 5.0 && hiGap > -5.0 && t.lane === this.driveLane) {
          this.nextLevel();
          return;
        }
        continue;
      }

      // ammo
      if (t.channel === null && gap < DRIVE_HORIZON * 0.75) t.channel = this.audio.play('ammo_beacon', { loops: -1 });
      if (t.channel) t.channel.setVolume(left * 0.8, right * 0.8);
      if (loGap < 5.0 && hiGap > -5.0 && t.lane === this.driveLane) {
        if (t.channel) { t.channel.stop(); t.channel = null; }
        this.driveThings.splice(this.driveThings.indexOf(t), 1);
        const gained = randint(3, 6);
        this.ammo += gained;
        this.audio.play('ammo');
      }
    }
  },

  // Hitting a car stops the car; it does not send you back. It costs thirty
  // seconds and all your speed. Distance is the whole distance driven, and
  // nothing takes it away.
  _driveCrash() {
    this._driveStopLoops();
    // Clear only the pile-up you are sitting in, not the road.
    for (const t of [...this.driveThings]) {
      if (Math.abs(t.dist - this.driveDist) < 30.0) {
        if (t.channel) t.channel.stop();
        this.driveThings.splice(this.driveThings.indexOf(t), 1);
      }
    }
    this.audio.play('crash');
    // The car brakes itself to a stop after the impact: its own sound tells the
    // player the stop was the game's doing, not theirs.
    this.audio.play('brake');
    this.timeLeft = Math.max(0.0, this.timeLeft - DRIVE_CRASH_PENALTY);
    if (this.timeLeft <= 30.0 && !this.thirtySecAnnounced) {
      // The crash took the clock straight past its warning: say where it is.
      const t = Math.trunc(this.timeLeft);
      this.tts.speak(`${t} second${s(t)} left.`);
    }
    this.thirtySecAnnounced = this.thirtySecAnnounced || this.timeLeft <= 30.0;
    const step = this._announceStep();
    this.nextAnnounceTime = Math.min(this.nextAnnounceTime, Math.floor(Math.max(0.0, this.timeLeft - 1) / step) * step);
    this.driveSpeed = 0.0;
    this.driveBand = -1;
    // Cars hold off for a moment after a crash, so a setback never becomes a spiral.
    this.driveGrace = 3.0;
    this._driveEngine();
  },

  // One shot, one car, straight down the lane you are in.
  driveShoot() {
    if (this.ammo <= 0) {
      this.audio.play('empty_click');
      return;
    }
    this.ammo -= 1;
    this.audio.play('laser');
    let target = null;
    for (const t of this.driveThings) {
      // Oncoming cars cannot be shot at all.
      if (t.kind !== 'car' || t.oncoming || t.lane !== this.driveLane) continue;
      const gap = t.dist - this.driveDist;
      // Only a car you can hear.
      if (gap < 0 || gap > DRIVE_HORIZON) continue;
      if (target === null || gap < target.dist - this.driveDist) target = t;
    }
    // A miss is silent beyond the shot itself: no sound means nothing was there.
    if (target === null) return;
    if (target.channel) { target.channel.stop(); target.channel = null; }
    this.driveThings.splice(this.driveThings.indexOf(target), 1);
    this.audio.play('explosion');
    this.driveKills += 1;
    if (!this.chaosMode) this.level = this.driveKills;
  },

  driveChangeLane(delta) {
    const nw = this.driveLane + delta;
    if (nw < 0 || nw >= DRIVE_LANES) {
      this.audio.play('boundary');
      return;
    }
    // A car standing still cannot change lanes.
    if (this.driveSpeed < DRIVE_MIN_LANE_SPEED) {
      this.audio.play('boundary');
      return;
    }
    this.driveLane = nw;
    // Your own engine swings toward the lane you moved into and settles back.
    this.driveSwerve = delta < 0 ? -DRIVE_SWERVE_PAN : DRIVE_SWERVE_PAN;
    this._driveEngine();
    // At high speed the tyres skid as well, from that side, louder the faster.
    const frac = this.driveSpeed / DRIVE_MAX_SPEED;
    if (frac >= DRIVE_SKID_SPEED) {
      const vol = 0.6 + 0.4 * Math.min(1.0, (frac - DRIVE_SKID_SPEED) / (1.0 - DRIVE_SKID_SPEED));
      const skids = DRIVE_SKIDS.filter((n) => this.audio.has(n));
      const ch = this.audio.play(choice(skids.length ? skids : ['drv_skid_1']));
      if (ch) {
        if (delta < 0) ch.setVolume(vol, vol * 0.3);
        else ch.setVolume(vol * 0.3, vol);
      }
    }
  },

  // The brake: a discrete action (the desktop's down arrow).
  _driveBrake() {
    if (this.driveSpeed > 1.0) this.audio.play('brake');
    this.driveSpeed = Math.max(0.0, this.driveSpeed - DRIVE_BRAKE * 0.35);
    this._driveEngine();
  },

  // Enter's report. In chaos mode every report ends with the run's points.
  _driveReport(text) {
    text = text.trimEnd() + this._clockTail();   // phones have no T: the clock rides on the report
    if (this.chaosMode) text = text.trimEnd() + ` ${this.chaosPoints + this.islandPoints} points total.`;
    this.tts.speak(text);
  },
};

// ------------------------------------------------------------------ help
// The desktop's two driving sections, word for word, with the keys turned into
// gestures (the Controls topic describes Russell's driving gestures; T, a
// keyboard key only, is left out as in the other modes' help).
const HELP_SECTIONS = [
  ['Driving Mode', [
    { title: 'Driving Mode', sound: null, desc: 'A two minute run down an open road, and the only mode where you are not walking. You are driving a car in one of three lanes: left, middle and right. Time credits are scattered along the road and buy you more clock, which is the only thing that ends the run. Everything you need arrives through your ears: which lane something is in, how far ahead it is, and how fast you are going.' },
    { title: 'Driving The Two Scores', sound: null, desc: 'This mode keeps two high scores, and they are kept apart because the safest way to win at one is the worst way to win at the other. The first is cars destroyed, and every car you shoot down counts for the whole run whatever happens afterwards. The second is distance in metres: every metre you drive across the whole run, and nothing takes it away. A crash costs you thirty seconds and all of your speed, which costs you road indirectly - you have to build back up from a standstill while the traffic keeps coming - but the metres you already drove are yours. Racking up kills means putting yourself in the lane of something coming for you, over and over, and every one of those is a chance to crash and lose half a minute. Travelling far means holding the throttle down, dodging rather than fighting, and passing up shot after shot. Both are worth chasing on their own terms. Double tap at any time for your ammo, your kills and your distance, and then the seconds left on your clock.' },
    { title: 'Driving Controls', sound: null, desc: 'Put a finger on the screen and slide it up to accelerate, and keep that finger on the screen for as long as you want to keep accelerating. This is the only control in the game you hold rather than tap, and letting go is itself an instruction: lift your finger and you coast, bleeding speed gradually. Swiping down is the brake and takes speed off hard: each swipe down is one touch of the brake, and sliding your accelerating finger back down stops accelerating and brakes once. Swiping left and right moves you one lane at a time, lifting your finger first, and you will hear your own engine swing toward the side you moved to and then settle back to the middle. Above about seventy percent of top speed the tyres also skid as you swerve, from the side you moved toward. You cannot change lanes while stopped: you have to be moving first, and swiping left or right at a standstill only gives you the boundary buzz. Lift your finger, then tap with two fingers to shoot straight down your own lane, or double tap for your status; the car coasts while your finger is off the screen.' },
    { title: 'Driving Your Engine', sound: null, desc: 'Your engine is your speedometer and it is the only one you get. It runs even at a dead stop, so that low rumble under everything is your car waiting for you. It is all bass, and it stays bass at every speed - what changes most is how fast it beats. At idle it lopes; flat out it is a hard flutter, with more bite and more grain behind it, and the note itself climbs slowly and evenly the whole way up, so you can hear when you are at full speed. There are sixteen small steps, each one blended into the next, so speeding up and coasting down both sound smooth. You feel them mostly as a change in pulse rather than a change in note, which is how a real engine tells you what it is doing, and it leaves the middle of your hearing clear for the cars you actually need to listen for. Speed is a genuine trade: fast covers more road and meets more cars and more credits, but everything arrives sooner and you have less time to hear it, pick a lane and fire.' },
    { title: 'Driving Other Cars', sound: null, desc: 'There are two kinds of car and they sound nothing alike, because they need completely different answers. Traffic running your way has a low, thin, wavering note just above your own engine. It hunts you: once it has noticed you it works across into whatever lane you are in, one lane at a time. Swerving shakes it off for a few seconds and never for good, so sooner or later this kind has to be shot, and it is always slower than you so you can always close on one. The other kind is coming straight at you, pitched much higher with a fast urgent wobble. It closes at your speed plus its own, which is quick early and frightening later, but it never changes lane, not once, so one clean sidestep beats it every time. And here is the rule that matters most: you cannot shoot it. Not ever. Your shots pass straight through. Traffic running your way is a target and cannot be outrun. A car coming at you is an obstacle and cannot be destroyed. Telling the two sounds apart is the whole skill of this mode. How far left or right either sits tells you the lane, how loud it is tells you how close, and driving into either one crashes you.' },
    { title: 'Driving The Ramp', sound: null, desc: 'The road gets harder the longer you are on it, measured purely in minutes survived. Nothing you do slows it and nothing caps it. For the first two minutes it climbs steadily, which is the stretch where you learn which sound is which. After two minutes it starts climbing in a curve with no ceiling at all, so minute three is harder than minute two by more than minute two was harder than the start, and every minute after that is a bigger jump than the one before. What that buys the road is speed and aggression. Traffic running your way gets quicker and changes lanes faster. Cars coming at you get quicker with no limit, so a head on that gives you about five seconds of warning at the start gives you about three and a half at two minutes, two and a half at three minutes, and from about three and a half minutes on you are down to the two second minimum. The road packs in too, and the mix shifts from about a third coming at you to about half. Cars you destroy add to the ramp on top of the clock, so hunting hard makes the road hunt you back. It never levels off. Three things it can never take from you, however deep you get: you always get two full seconds of warning on a car coming at you, because the faster one is closing the further out you hear it; there is always at least one lane with nothing coming at you, so two cars can come at you side by side but never three, and the road can be crowded but never walled off; and a car hunting your lane can never cross one in less than about half a second, so swerving always buys real time. Everything else keeps climbing forever.' },
    { title: 'Driving Crashing', sound: null, desc: 'Hitting another car brakes you to a dead stop where you are and takes thirty seconds off the clock, a quarter of everything you were given at the start. You stay on the same stretch of road, in the same lane, and your distance is untouched - it is the total road you have driven and nothing takes it back. What it really costs you is speed: you have to build up again from nothing while the traffic keeps coming, and the road you would have covered in those seconds is gone along with the thirty from the clock. So a crash is a setback and not a death, but they add up: two of them is half your starting clock, and four of them is all of it. Traffic holds off for three seconds while you get moving, and the cars immediately around you are cleared, so one bad moment can never turn straight into another. You cannot change lanes until you are moving again, so ease onto the throttle, then use what is left of those three seconds to move into a clear lane.' },
    { title: 'Driving Ammo and Shooting', sound: null, desc: 'A two-finger tap fires one shot straight down your lane and it hits the nearest car running your way in that lane, as long as it is near enough to hear, within two hundred metres. One hit destroys one car. Cars coming the other way are not targets: a shot passes straight through, and if one sits between you and a car you could have hit, your shot takes the one behind it. If there was nothing shootable you hear the shot and nothing else, and that silence is your answer. Cartridges lie on the road like everything else and you collect them by being in their lane as you reach them. A cartridge is never in the same lane as a car coming at you, so you will never have to dodge one to reach it. Each gives three to six shots and how often they turn up depends on the road. At the start it is roughly four a minute. The more cars there are running your way, the more cartridges appear, so supply climbs with the difficulty, and if you are down to three shots or fewer they turn up more often still. So you can shoot freely, but not wastefully. You start with eight.' },
    { title: 'Driving Time Credits', sound: null, desc: 'Credits are worth ten, twenty or thirty seconds and nothing on this road is ever worth more. Each value has its own beacon, and higher and faster spinning is worth more. The ten is the most common but only just, because at speed you drive past plenty of them and it would be miserable if the ones you caught were nearly always the small ones. They are placed at the very edge of hearing and play louder than anything else on the road, so you get about three and a half seconds of warning at full speed, and more the slower you go. A credit is never in the same lane as a car coming at you, so a credit always sits in a lane of its own and is never hidden behind one. You have to be in a credit\'s lane when you arrive, so the moment you hear one, work out which side it is on and move. There is no coming back for one you have passed, and slowing down does not help you find more. They also thin out the longer you drive. Early on one turns up roughly every twenty seconds at full speed, and the gap keeps widening as the road hardens, so the deeper you get the more each one you catch matters, and the more each crash costs you.' },
  ]],
];
const HELP_DEMOS = [
  ['Demos, Driving Mode', [
    { title: 'Driving Demos', sound: null, desc: 'Every sound on the road. The two car sounds are the pair to learn: one is a target, the other is an obstacle, and confusing them is how runs end.' },
    { title: 'Engine, Idle', sound: 'engine_0', desc: 'Your engine at a dead stop. A slow, low lope - six beats a second.' },
    { title: 'Engine, Middle', sound: 'engine_8', desc: 'Your engine around half speed. Same bass, beating more than three times as fast.' },
    { title: 'Engine, Flat Out', sound: 'engine_15', desc: 'Your engine flat out. Still bass, now a hard flutter with real grunt behind it.' },
    { title: 'Car Running Your Way', sound: 'enemy_car', desc: 'Low, thin and wavering, just above your engine. It hunts your lane and it is slower than you. Shoot it.' },
    { title: 'Car Coming At You', sound: 'enemy_car_oncoming', desc: 'Higher, with a fast urgent wobble. It never changes lane and it cannot be shot. Move.' },
    { title: 'Lane Change', sound: 'lane_change', desc: 'A lane change at speed, here to the right. Your engine swings toward the lane you moved into and settles back, and above about seventy percent of top speed the tyres screech from that side as well.' },
    { title: 'Brake', sound: 'brake', desc: 'A swipe down, taking speed off hard.' },
    { title: 'Crash', sound: 'crash', desc: 'You hit a car: metal crunching, then the brakes locking. Thirty seconds gone and you are stopped dead, but the distance you have driven stays.' },
    { title: 'Road Credit, Ten Seconds', sound: 'credit_beacon_drive_10', desc: 'The beacon of the smallest and most common road credit.' },
    { title: 'Road Credit, Twenty Seconds', sound: 'credit_beacon_drive_20', desc: 'Higher and faster spinning. Worth twenty.' },
    { title: 'Road Credit, Thirty Seconds', sound: 'credit_beacon_drive_30', desc: 'The highest and fastest. Worth thirty, and the most it ever gets.' },
  ]],
];

// ------------------------------------------------------------------ the mode
export default {
  menu: [{ key: 'drive', label: 'Driving Mode', select: (game) => game.startDrive() }],
  playStates: [STATE],
  mixin,

  init(game) {
    if (game.chaosMode === undefined) game.chaosMode = false;
    // The road's echo, before any road has been driven (the desktop's getattr defaults).
    game.driveFeature = null;
    game.driveFeatureEnv = 0.0;
    game.driveFeatureTarget = 0.0;
    game.driveUpHeld = false;
    // Driving calls the clock once a minute (the desktop's _announce_step):
    // only on the road, so every other mode keeps its own step.
    const base = game._announceStep;
    game._announceStep = function _announceStep() {
      if (this.state === STATE && !this.chaosMode) return DRIVE_TIME_ANNOUNCE;
      return base.call(this);
    };
  },

  // The desktop's reset_game_state lines for driving.
  reset(game) {
    game.chaosDriveExitSeen = false;
    game.driveLane = Math.floor(DRIVE_LANES / 2);
    game.driveSpeed = 0.0;
    game.driveDist = 0.0;
    game.driveTravelled = 0.0;
    game.driveElapsed = 0.0;
    game._driveStopLoops();        // before the registries below are emptied
    game.driveThings = [];
    game.driveKills = 0;
    game.driveBand = -1;
    game.driveLoops = {};
    game.driveAccelerating = false;
    game.driveSpawnAt = 0.0;
    game.driveGrace = 0.0;
    game.driveNextCredit = Infinity;
    game.driveUpHeld = false;
  },

  update(game, dt) {
    // The throttle is the one control that is held rather than tapped, so it is
    // read as live state every frame (the desktop reads the up arrow here):
    // held from accel_on to accel_off.
    game.driveAccelerating = !!game.driveUpHeld;
    game.updateDriveMode(dt);
  },

  // Whenever the road is not being driven (paused, help, the quit question, the
  // end of a run) the gestures let go of the throttle without a word, so the
  // game lets go of it too: a finger lifted meanwhile never reaches the game.
  tick(game) {
    if (game.state !== STATE || game.isPaused) game.driveUpHeld = false;
  },

  input(game, g) {
    if (g === 'accel_on') { game.driveUpHeld = true; return; }
    if (g === 'accel_off') { game.driveUpHeld = false; return; }
    if (g === 'clock') {
      // Any mode that runs a clock answers T.
      const secs = Math.trunc(game.timeLeft);
      game.tts.speak(`${secs} second${s(secs)} remaining.`);
      return;
    }
    // Space shoots and Enter reports, the same as every mode that shoots.
    if (g === 'space') game.driveShoot();
    else if (g === 'enter') {
      game._driveReport(`${game.ammo} shot${s(game.ammo)}. ${game.driveKills} car${s(game.driveKills)} down. ${Math.trunc(game.driveTravelled)} metres.`);
    } else if (g === 'left') game.driveChangeLane(-1);
    else if (g === 'right') game.driveChangeLane(1);
    else if (g === 'down') game._driveBrake();
  },

  stopAll(game) {
    // The road's own registry plus a looping sound on every car still out on it.
    game._driveStopLoops();
    game.driveThings = [];
    game.driveSpeed = 0.0;
    game.driveAccelerating = false;
    game.driveUpHeld = false;
    game.driveBand = -1;
  },

  // The desktop's trigger_game_over for driving. A whole message of its own: the
  // desktop says "No high score yet for cars destroyed" here, and adds the
  // distance record line after the high score lines.
  finish(game) {
    const kills = game.driveKills;
    const metres = Math.trunc(game.driveTravelled);
    const prevHigh = game.scores.scores.drive || 0;
    const isHigh = game.scores.update('drive', kills);
    // Distance keeps its own board, recorded whatever happened to the kill count.
    const distanceRecord = game.scores.update('drive_distance', metres);
    let msg = `Time up. You shot down ${kills} car${s(kills)} and travelled ${metres} metres. `;
    if (game.scores.readFailed) {
      msg += 'High scores could not be read this session, so this score is not saved. ';
    } else if (isHigh) {
      msg += prevHigh <= 0 ? `Your first high score for this mode: ${kills}! ` : `New high score! You beat your previous best of ${prevHigh}. `;
    } else if (prevHigh <= 0) {
      msg += game.chaosMode ? 'No high score yet for this mode. ' : 'No high score yet for cars destroyed. ';
    } else {
      msg += `Your high score is ${prevHigh}. `;
    }
    if (distanceRecord) msg += `New distance record: ${metres} metres. `;
    msg += 'Double tap to return to the menu.';
    return { custom: true, message: msg };
  },

  // Always the tunnel room on the road: the echoes are there but silent, and a
  // tunnel or an overpass turns them up (drive_feature_env).
  room(game, state) { return state === STATE ? 'tunnel' : null; },
  surroundings(game, pos) {
    if (pos) return [1.0, 0.0];
    // The third value is the easing step: the tunnel's own fade is already
    // smooth, so the desktop eases it at once (tick = 1.0).
    return [game.driveFeatureEnv || 0.0, 0.0, 1.0];
  },
  // Never behind on the road, where everything is ahead of the car.
  behind() { return 0; },
  gestureMode() { return 'drive'; },

  status(game) {
    const cars = (game.driveThings || []).filter((t) => t.kind === 'car').length;
    return `Driving Mode. Time ${Math.max(0, Math.trunc(game.timeLeft))}s. Speed ${Math.trunc(game.driveSpeed)}. `
      + `Lane ${game.driveLane + 1} of ${DRIVE_LANES}. Ammo ${game.ammo}. Cars destroyed ${game.driveKills}. `
      + `Distance ${Math.trunc(game.driveTravelled)} m. Cars ahead ${cars}.`;
  },

  boards: [
    { key: 'drive', label: 'Driving Mode', fmt: (v) => `${v} car${s(v)}` },
    { key: 'drive_distance', label: 'Driving Distance', fmt: (v) => `${v} m` },
  ],

  help: { sections: HELP_SECTIONS, demos: HELP_DEMOS },
};

// For the tests: the rules' numbers, as the desktop has them.
export const DRIVE = {
  DRIVE_LANES, DRIVE_MAX_SPEED, DRIVE_CRASH_PENALTY, DRIVE_HORIZON, DRIVE_MIN_LANE_SPEED, DRIVE_TIME_LIMIT,
  DRIVE_WALL_WINDOW, DRIVE_MIN_FREE_LANES,
};
