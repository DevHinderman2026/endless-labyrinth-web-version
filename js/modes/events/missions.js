// The event room missions beyond collecting, surviving and real and false (the
// desktop's MissionsMixin in event_missions.py): carry and deliver, catch the
// runaways, checkpoints, follow the guide, hunt, silent search, in order, escape,
// memory, pairs, detector, dodge, defend, hold, sneak, defuse, rescue, reflex,
// musical chairs, fishing, step limit, key and door, whack-a-mole, herding, rhythm,
// sorting and lamplighter. Names follow the desktop in camelCase.

import { Thing } from './engine.js';
import { addLazy, fromBuffer, pitch } from './sounds.js';
import { uniform, randint, randrange, choice, sample, shuffle, random, range } from './py.js';
import { pyRound } from './schema.js';

const STEP = 3.0;                 // one step, in the game's units
const REACH = 3.0;                // how close counts as reaching something
const ESCAPE_GRACE = 2.0;         // seconds into a new escape room before a creature can reach you
const GUIDE_START = 6.0;          // the guide starts this far ahead of you (two steps)
const SNEAK_SOFT = 0.45;          // a sleeping guard snoring with its own sound plays this loud
const ORDER_SPREAD = 12;          // notes are chosen from this many semitones either side of the recording

const NEW_MISSIONS = ['deliver', 'catch', 'relay', 'follow', 'hunt', 'seek', 'order', 'escape', 'memory', 'pairs',
  'detector', 'dodge', 'defend', 'hold', 'sneak', 'bomb', 'rescue', 'reflex', 'chairs', 'fishing', 'steps', 'keys',
  'whack', 'herd', 'rhythm', 'sort', 'lamps'];

const remove = (arr, x) => { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); };
const li = (n) => `li${n === 1 ? 'fe' : 'ves'}`;
const ss = (n) => (n === 1 ? '' : 's');

export const MissionsMixin = {
  NEW_MISSIONS,

  // ------------------------------------------------------------ starting a run
  _mStart(ev) {
    const m = ev.mission;
    this.mCarry = 0;                 // deliver: items in your hands
    this.mCarryBonus = 0;            // ...and how many of them are bonus items
    this.mDelivered = 0;
    this.mDropoff = null;
    this.mCheckpoints = 0;           // relay
    this.mLegLeft = 0.0;
    this.mGuide = null;              // follow
    this.mLost = 0.0;
    this.mWith = 0.0;
    this.mTick = 0.0;
    this.mPingsUsed = 0;             // seek
    this.mPingReady = 0.0;
    this.mAuto = 0.0;
    this.mAnswers = [];
    this.mRound = 1;                 // order
    this.mRoundsDone = 0;
    this.mRoom = 1;                  // escape
    this.mRoomsDone = 0;
    this.mExit = null;
    this.mGrace = 0.0;
    this.mAmmo = [];                 // hunt: ammo boxes
    this.mAmmoTimer = ev.hunt.ammo_every_seconds;
    this.mRelayStart = true;
    const load = (f, role) => this.loadEventRecording(f, role);
    if (m === 'deliver') {
      const dv = ev.deliver;
      this.mDropSound = load(dv.dropoff_sound, 'beacon') || 'event_beacon_shimmer';
      this.mDeliveredSound = load(dv.delivered_sound, 'pickup') || 'event_delivered';
      this._mPlaceDropoff();
      return false;
    }
    if (m === 'relay') {
      this.mLegLeft = ev.relay.seconds_first;
      this._mRelayNext(true);
      return true;
    }
    if (m === 'follow') {
      const g = new Thing(this.playerPos[0], this.playerPos[1] - GUIDE_START);
      g.goal = null;
      g.age = 0.0;                   // seconds left of a stop
      g.channel = this.audio.play(choice(this.evBeacons), { loops: -1, volume: 0.0 });
      this.mGuide = g;
      return true;
    }
    if (m === 'seek') {
      const sk = ev.seek;
      this.mPingSound = load(sk.ping_sound, 'pickup') || 'event_ping';
      this.mAuto = sk.auto_ping_seconds;
      return false;
    }
    if (m === 'order') {
      this.mWrongSound = load(ev.order.wrong_sound, 'pickup') || 'event_wrong';
      this._mOrderRound();
      return true;
    }
    if (m === 'memory') { this._mMemorySetup(); return true; }
    if (m === 'pairs') { this._mPairsRound(); return true; }
    if (m === 'detector') {
      this.mBeepSound = load(ev.detector.beep_sound, 'pickup') || 'event_detector_beep';
      this.mBeepWait = 0.0;
      this._mDetectorHide();
      return true;
    }
    if (m === 'dodge') {
      const dd = ev.dodge;
      this.mFallSound = load(dd.falling_sound, 'beacon') || 'event_falling';
      this.mLandSound = load(dd.landing_sound, 'pickup') || 'explosion';
      this.mFallEvery = dd.every_seconds;
      this.mFallTimer = 2.0;
      this.mFalls = [];
      this.mDodged = 0;
      this.mDodgeLives = dd.lives;
      return true;
    }
    if (m === 'defend') {
      const th = new Thing(0.0, 0.0);
      const snd = load(ev.defend.treasure_sound, 'beacon');
      th.channel = this.audio.play(snd || 'event_beacon_gem', { loops: -1, volume: 0.0 });
      this.mTreasure = th;
      this.mTreasureLives = ev.defend.treasure_lives;
      this.mSpeedBonus = 0.0;
      this.playerPos = [0.0, 6.0];           // just south of the treasure
      this._mReplaceItems();                 // nothing left lying in that square
      return false;
    }
    if (m === 'hold') {
      this.mSpot = null;
      this.mHoldTimer = 0.0;
      this.mHeld = 0.0;
      this._mHoldMove();
      return true;
    }
    if (m === 'sneak') { this._mSneakSetup(ev); return false; }
    if (m === 'bomb') {
      const bo = ev.bomb;
      this.mSafeSound = load(bo.safe_sound, 'beacon') || 'event_beacon_shimmer';
      this.mBang = load(bo.bang_sound, 'pickup') || 'explosion';
      this.mSafe = new Thing(...this._mPlace(bo.safe_place));
      this.mBombLives = bo.lives; this.mDefused = 0; this.mDefusedTries = 0;
      this._mBombNew();
      return true;
    }
    if (m === 'rescue') {
      const rs = ev.rescue;
      this.mHomeSound = load(rs.home_sound, 'beacon') || 'event_beacon_shimmer';
      this.mHome = new Thing(...this._mPlace(rs.home));
      this._mReplaceItems();
      return false;
    }
    if (m === 'reflex') {
      this.mCueSound = load(ev.reflex.cue_sound, 'pickup') || 'event_cue';
      this.mReflexLives = ev.reflex.lives; this.mAnswered = 0;
      this._mReflexNext();
      return true;
    }
    if (m === 'chairs') {
      this.mMusic = load(ev.chairs.music_sound, 'beacon') || this.evBeacons[0];
      this.mPads = [];
      this._mChairsMusic();
      return true;
    }
    if (m === 'fishing') {
      this.mCastSound = load(ev.fishing.cast_sound, 'pickup') || 'event_plop';
      this.mCastReady = 0.0;
      return false;
    }
    if (m === 'steps') { this.mStepsLeft = ev.steps.start; return false; }
    if (m === 'keys') {
      const ke = ev.keys;
      this.mKeySound = load(ke.key_sound, 'beacon') || (this.audio.has('key_beacon') ? 'key_beacon' : this.evBeacons[0]);
      this.mDoorSound = ke.door_sound === 'exit_morse' ? 'exit_morse' : (load(ke.door_sound, 'beacon') || 'exit_morse');
      this._mKeysRoom();
      return true;
    }
    if (m === 'whack') {
      this.mPopTimer = 1.0; this.mPopped = 0; this.mMisses = 0;
      this.mHideSound = load(ev.whack.hide_sound, 'pickup');
      return true;
    }
    if (m === 'herd') {
      const he = ev.herd;
      this.mPen = new Thing(...this._mPlace(he.pen));
      this.mPen.channel = this.audio.play(load(he.pen_sound, 'beacon') || 'event_beacon_shimmer', { loops: -1, volume: 0.0 });
      this._mReplaceItems();
      return false;
    }
    if (m === 'rhythm') {
      const rh = ev.rhythm;
      this.mBeatSound = load(rh.beat_sound, 'pickup') || 'event_drum';
      this.mBpm = rh.beats_per_minute;
      this.mNextBeat = 2.0; this.mBeatTimes = []; this.mBeats = 0;
      this.mOnBeat = 0; this.mRhythmMisses = 0;
      this.mEarly = null;
      return true;
    }
    if (m === 'sort') {
      this.mWrongSound = 'event_wrong';
      this._mSortSetup();
      return false;
    }
    if (m === 'lamps') {
      this.mLightSound = load(ev.lamps.light_sound, 'pickup') || 'event_checkpoint';
      this._mLampsSetup();
      return true;
    }
    if (m === 'escape') {
      this.mExitSound = 'exit_morse';
      if (ev.escape.exit_sound !== 'exit_morse') this.mExitSound = load(ev.escape.exit_sound, 'beacon') || 'exit_morse';
      this._mEscapeRoom();
      return false;
    }
    return false;
  },

  // ------------------------------------------------------------ helpers
  _mLevel(th, gain) {
    const [left, right, dist] = this._battleLevels([th.x, th.y], gain);
    if (th.channel) th.channel.setVolume(left, right, this._behind([th.x, th.y]));
    return dist;
  },

  _mStop(th) {
    try { if (th && th.channel) { th.channel.stop(); th.channel = null; } } catch (e) { /* gone */ }
  },

  _mAllThings() {
    return [this.mDropoff, this.mGuide, this.mExit, this.mTreasure, this.mSpot].filter((t) => t)
      .concat(this.mAmmo || [], this.mPads || [], this.mFalls || [], this.mBins || [])
      .concat([this.mBomb, this.mSafe, this.mHome, this.mKey, this.mPen].filter((t) => t));
  },

  // [x, y, radius] where nothing new may be laid out: inside a pen, round a sorting
  // bin, and on a drop-off, a rescue's home or a bomb's safe place.
  _eventClearZones() {
    const zones = [];
    if (!this.ev) return zones;
    if (this.ev.mission === 'herd' && this.mPen) zones.push([this.mPen.x, this.mPen.y, this._mPenRadius() + STEP]);
    for (const b of this.mBins || []) zones.push([b.x, b.y, REACH * 1.5 + 2 * STEP]);
    const mission = this.ev.mission;
    for (const [spot, ms] of [[this.mDropoff, 'deliver'], [this.mHome, 'rescue'], [this.mSafe, 'bomb']]) {
      if (spot && mission === ms) zones.push([spot.x, spot.y, REACH * 1.5 + STEP]);
    }
    return zones;
  },

  // The pen's size, never more than three quarters of the way to the walls.
  _mPenRadius() { return Math.min(this.ev.herd.pen_radius, 0.75 * this.arenaLimit); },

  // Move any item laid out before the mission's pen or bins existed out of their way.
  _mReplaceItems() {
    const it = this.ev.item;
    const zones = this._eventClearZones();
    const [px, py] = this.playerPos;
    for (const th of this.evItems) {
      if (zones.some(([zx, zy, zr]) => Math.hypot(th.x - zx, th.y - zy) < zr) || Math.hypot(th.x - px, th.y - py) < 2.25) {
        th.x = -999.0; th.y = -999.0;          // not counted where it was
        [th.x, th.y] = this._eventSpot(it.min_distance, it.max_distance, it.direction || 'anywhere');
      }
    }
  },

  _mStopAll() {
    for (const th of this._mAllThings()) this._mStop(th);
    this.mDropoff = this.mGuide = this.mExit = this.mTreasure = this.mSpot = null;
    this.mAmmo = []; this.mPads = []; this.mFalls = []; this.mBins = [];
    this.mBomb = this.mSafe = this.mHome = this.mKey = this.mPen = this.mBuried = null;
    try { if (this.mMusicCh) this.mMusicCh.stop(); } catch (e) { /* gone */ }
  },

  _mPlace(place) {
    const lim = this.arenaLimit - 3.0;
    if (place === 'center') return [0.0, 0.0];
    if (place === 'corner') return [choice([-lim, lim]), choice([-lim, lim])];
    if (place === 'edge') {
      const v = uniform(-lim, lim);
      return choice([[v, -lim], [v, lim], [-lim, v], [lim, v]]);
    }
    return this._eventSpot(12.0, 0);
  },

  // ------------------------------------------------------------ deliver
  _mPlaceDropoff() {
    const old = this.mDropoff;
    let [x, y] = this._mPlace(this.ev.deliver.dropoff);
    if (old) {
      // Moving: somewhere other than where it was.
      for (let i = 0; i < 20; i++) {
        if (Math.hypot(x - old.x, y - old.y) >= 4 * STEP) break;
        [x, y] = this._mPlace(this.ev.deliver.dropoff);
      }
      old.x = x; old.y = y;
    } else {
      this.mDropoff = new Thing(x, y);
    }
    this._mReplaceItems();
  },

  _mDeliverUpdate(dt) {
    const it = this.ev.item; const dv = this.ev.deliver;
    let full = this.mCarry >= dv.carry_most;
    for (const th of [...this.evItems]) {
      if (full) {
        // Hands full: the items wait in silence, so the drop-off is clear.
        if (th.channel) th.channel.setVolume(0.0, 0.0);
        continue;
      }
      if (this._mReached(th, it.volume)) {
        this._mStop(th);
        remove(this.evItems, th);
        this.audio.play(th.value ? this.evBonusPickup : this.evPickup, { at: [th.x, th.y] });
        this.mCarry += 1;
        this.mCarryBonus = (this.mCarryBonus || 0) + (th.value ? 1 : 0);
        this.evCollected += 1;
        full = this.mCarry >= dv.carry_most;
        if (this.evItems.length < Math.max(1, it.at_once)) this._eventSpawnItem();
      }
    }
    const d = this.mDropoff;
    if (this.mCarry && d) {
      if (d.channel === null) d.channel = this.audio.play(this.mDropSound, { loops: -1, volume: 0.0 });
      if (this._mReached(d, 1.0)) {
        const n = this.mCarry; this.mCarry = 0;
        const b = Math.min(n, this.mCarryBonus || 0); this.mCarryBonus = 0;
        this.mDelivered += n;
        // A bonus item is worth its own points instead of the usual.
        this.evPoints += it.points * (n - b) + it.bonus_points * b;
        this.evBonuses = (this.evBonuses || 0) + b;
        this._mStop(d);
        this.audio.play(this.mDeliveredSound);
        if (dv.dropoff_moves) this._mPlaceDropoff();
        if (it.total && this.mDelivered >= it.total) {
          this.evPoints += it.all_found_bonus;
          if (this.evClock) {
            this.evTimeBonus = Math.trunc(Math.max(0, this.timeLeft)) * it.time_bonus;
            this.evPoints += this.evTimeBonus;
          }
          this._eventFinish('all');
          return true;
        }
      }
    } else if (d && d.channel) {
      this._mStop(d);
    }
    return false;
  },

  // A creature reached you: in a deliver event, whatever you carry may fall.
  _mTouched() {
    const ev = this.ev;
    if (ev && ev.mission === 'deliver' && ev.deliver.drop_on_touch && this.mCarry) {
      // Dropped: they go back into the room, somewhere else.
      for (let i = 0; i < this.mCarry; i++) {
        this.evSpawned = Math.max(0, this.evSpawned - 1);
        this.evCollected = Math.max(0, this.evCollected - 1);
        if (this.evItems.length < Math.max(1, ev.item.at_once)) this._eventSpawnItem();
      }
      this.mCarry = this.mCarryBonus = 0;
      this._mStop(this.mDropoff);
    }
  },

  // ------------------------------------------------------------ catch
  _mCatchUpdate(dt) {
    const it = this.ev.item; const ca = this.ev.catch;
    const [px, py] = this.playerPos;
    const lim = this.arenaLimit - 1.0;
    for (const th of [...this.evItems]) {
      const dx = th.x - px; const dy = th.y - py;
      const d = Math.hypot(dx, dy);
      if (d < ca.flee_distance && d > 0.01) {
        // Away from you, straight; a wall stops it, so it can be cornered.
        const sp = ca.speed * STEP * dt;
        th.x = Math.max(-lim, Math.min(lim, th.x + dx / d * sp));
        th.y = Math.max(-lim, Math.min(lim, th.y + dy / d * sp));
        th.goal = null;
      } else if (ca.wanders) {
        if (th.goal === null || Math.hypot(th.goal[0] - th.x, th.goal[1] - th.y) < 1.0) th.goal = [uniform(-lim, lim), uniform(-lim, lim)];
        const gx = th.goal[0] - th.x; const gy = th.goal[1] - th.y;
        const gd = Math.hypot(gx, gy);
        if (gd > 0.01) {
          const sp = 0.4 * ca.speed * STEP * dt;
          th.x += gx / gd * sp;
          th.y += gy / gd * sp;
        }
      }
      if (this._mReached(th, it.volume)) {
        this._mStop(th);
        remove(this.evItems, th);
        this.audio.play(th.value ? this.evBonusPickup : this.evPickup, { at: [th.x, th.y] });
        this.evCollected += 1;
        this.evPoints += th.value ? it.bonus_points : it.points;
        this.evBonuses = (this.evBonuses || 0) + (th.value ? 1 : 0);
        if (it.total && this.evCollected >= it.total) {
          this.evPoints += it.all_found_bonus;
          if (this.evClock) {
            this.evTimeBonus = Math.trunc(Math.max(0, this.timeLeft)) * it.time_bonus;
            this.evPoints += this.evTimeBonus;
          }
          this._eventFinish('all');
          return true;
        }
        this._eventSpawnItem();
      }
    }
    return false;
  },

  // ------------------------------------------------------------ relay
  _mRelayNext(first = false) {
    const rl = this.ev.relay; const it = this.ev.item;
    for (const th of this.evItems) this._mStop(th);
    this.evItems = [];
    if (!first) this.mLegLeft = Math.max(rl.seconds_least, rl.seconds_first - rl.seconds_less_each * this.mCheckpoints);
    this.mBeeped = -1;
    const [x, y] = this._eventSpot(it.min_distance, it.max_distance);
    const th = new Thing(x, y);
    th.beacon = choice(this.evBeacons);
    th.channel = this.audio.play(th.beacon, { loops: -1, volume: 0.0 });
    this.evItems.push(th);
  },

  _mRelayUpdate(dt) {
    const it = this.ev.item;
    this.mLegLeft -= dt;
    const sec = Math.trunc(this.mLegLeft);
    if (this.mLegLeft >= 0 && this.mLegLeft <= 3 && sec !== (this.mBeeped === undefined ? -1 : this.mBeeped)) {
      this.mBeeped = sec;
      this.audio.play('countdown');
    }
    if (this.mLegLeft <= 0) {
      this._eventFinish('late');
      return true;
    }
    for (const th of [...this.evItems]) {
      if (this._mReached(th, it.volume)) {
        this.audio.play('event_checkpoint');
        this.mCheckpoints += 1;
        this.evCollected += 1;
        this.evPoints += it.points;
        if (it.total && this.mCheckpoints >= it.total) {
          this.evPoints += it.all_found_bonus;
          if (this.evClock) {
            this.evTimeBonus = Math.trunc(Math.max(0, this.timeLeft)) * it.time_bonus;
            this.evPoints += this.evTimeBonus;
          }
          this._eventFinish('all');
          return true;
        }
        this._mRelayNext();
      }
    }
    return false;
  },

  // ------------------------------------------------------------ follow
  // The guide's speed now: `speed` at the start, `faster_by` more every
  // `faster_every_seconds` of the run, never above `top_speed` (2.0.0), so a
  // clockless follow event ends on its own once the guide outruns the player.
  _mGuideSpeed() {
    const fo = this.ev.follow;
    const every = Number(fo.faster_every_seconds || 0);
    if (every <= 0) return Number(fo.speed);
    const steps = Math.floor((this.evElapsed || 0.0) / every);
    return Math.min(Number(fo.top_speed ?? fo.speed), Number(fo.speed) + steps * Number(fo.faster_by || 0));
  },

  _mFollowUpdate(dt) {
    const fo = this.ev.follow; const it = this.ev.item;
    const g = this.mGuide;
    const lim = this.arenaLimit - 4.0;
    if (g.age > 0) {
      g.age -= dt;                  // stopped for a moment
    } else {
      if (g.goal === null || Math.hypot(g.goal[0] - g.x, g.goal[1] - g.y) < 1.0) {
        if (g.goal !== null && fo.stops && random() < 0.5) g.age = uniform(1.0, 3.0);
        // The next spot: a few steps on, never straight into a wall.
        let gx; let gy;
        for (let i = 0; i < 20; i++) {
          const ang = uniform(0, 2 * Math.PI);
          const r = uniform(4, 9) * STEP;
          gx = g.x + r * Math.cos(ang); gy = g.y + r * Math.sin(ang);
          if (Math.abs(gx) <= lim && Math.abs(gy) <= lim) break;
        }
        g.goal = [Math.max(-lim, Math.min(lim, gx)), Math.max(-lim, Math.min(lim, gy))];
      }
      const dx = g.goal[0] - g.x; const dy = g.goal[1] - g.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) {
        const sp = Math.min(d, this._mGuideSpeed() * STEP * dt);
        g.x += dx / d * sp;
        g.y += dy / d * sp;
      }
    }
    const dist = this._mLevel(g, it.volume);
    // Never so far that the guide could not get away in this room at all.
    if (dist <= Math.min(fo.near_distance, 2.0 * this.arenaLimit)) {
      this.mLost = 0.0;
      this.mWith += dt;
      this.evPoints += fo.points_per_second * dt;
    } else {
      this.mLost += dt;
      this.mTick -= dt;
      if (this.mTick <= 0) {
        this.mTick = 1.0;
        this.audio.play('event_lost_tick');
      }
      if (this.mLost >= fo.lost_seconds) {
        this._eventFinish('lost');
        return true;
      }
    }
    return false;
  },

  // ------------------------------------------------------------ hunt
  _mHuntUpdate(dt) {
    const hu = this.ev.hunt; const hz = this.ev.hazards;
    if (hu.ammo_every_seconds && !this.evUnlimited()) {
      this.mAmmoTimer -= dt;
      if (this.mAmmoTimer <= 0) {
        this.mAmmoTimer = hu.ammo_every_seconds;
        if (this.mAmmo.length < 2) {
          const th = new Thing(...this._eventSpot(12.0, 0));
          th.channel = this.audio.play('ammo_beacon', { loops: -1, volume: 0.0 });
          this.mAmmo.push(th);
        }
      }
    }
    for (const th of [...this.mAmmo]) {
      if (this._mReached(th, 0.8)) {
        this._mStop(th);
        remove(this.mAmmo, th);
        this.evShots += hu.ammo_amount;
        this.audio.play('ammo');
      }
    }
    if (!hz.respawn_seconds && this.evHazards.length && this.evHazards.every((h) => h.downFor >= 0)) {
      if (this.evClock) {
        this.evTimeBonus = Math.trunc(Math.max(0, this.timeLeft)) * hu.time_bonus;
        this.evPoints += this.evTimeBonus;
      }
      this._eventFinish('all_down');
      return true;
    }
    // No clock, no shots left, no ammo to come or to find, and no creature whose touch
    // could end it: nothing more can happen, so the run ends here and is saved.
    if (!this.evClock && this.evShots <= 0 && !this.evUnlimited() && !hu.ammo_every_seconds && !this.mAmmo.length && hz.on_touch !== 'end_run') {
      this._eventFinish('no_shots');
      return true;
    }
    return false;
  },

  // ------------------------------------------------------------ seek
  // A two-finger tap in a silent search: every item answers once, from where it is.
  mPing(auto = false) {
    const sk = this.ev.seek;
    if (!auto) {
      if (this.evElapsed < this.mPingReady) { this.audio.play('empty_click'); return; }
      if (sk.pings && this.mPingsUsed >= sk.pings) {
        this.audio.play('empty_click');
        this.tts.speak('No pings left.');
        return;
      }
      this.mPingsUsed += 1;
      this.mPingReady = this.evElapsed + sk.ping_wait;
    }
    this.audio.play(this.mPingSound);
    for (const th of this.evItems) {
      // Farther ones answer a little later, as an echo would.
      const d = Math.hypot(th.x - this.playerPos[0], th.y - this.playerPos[1]);
      this.mAnswers.push([this.evElapsed + 0.35 + d / 90.0, th]);
    }
  },

  _mSeekUpdate(dt) {
    const it = this.ev.item; const sk = this.ev.seek;
    if (sk.auto_ping_seconds) {
      this.mAuto -= dt;
      if (this.mAuto <= 0) {
        this.mAuto = sk.auto_ping_seconds;
        this.mPing(true);
      }
    }
    for (const a of [...this.mAnswers]) {
      const [at, th] = a;
      if (!this.evItems.includes(th)) { remove(this.mAnswers, a); continue; }
      if (this.evElapsed >= at) {
        remove(this.mAnswers, a);
        th.extra = this.audio.play(th.beacon || this.evBeacon, { volume: 0.0 });
      }
    }
    for (const th of [...this.evItems]) {
      const [left, right] = this._battleLevels([th.x, th.y], it.volume);
      if (th.channel) { th.channel.stop(); th.channel = null; }       // a silent item never calls by itself
      if (th.extra) { try { th.extra.setVolume(left, right, this._behind([th.x, th.y])); } catch (e) { /* gone */ } }
      if (this.evSteppedOnto([th.x, th.y], REACH)) {
        if (th.extra) { try { th.extra.stop(); } catch (e) { /* gone */ } }
        remove(this.evItems, th);
        this.audio.play(th.value ? this.evBonusPickup : this.evPickup, { at: [th.x, th.y] });
        this.evCollected += 1;
        this.evPoints += th.value ? it.bonus_points : it.points;
        this.evBonuses = (this.evBonuses || 0) + (th.value ? 1 : 0);
        if (it.total && this.evCollected >= it.total) {
          this.evPoints += it.all_found_bonus;
          if (this.evClock) {
            this.evTimeBonus = Math.trunc(Math.max(0, this.timeLeft)) * it.time_bonus;
            this.evPoints += this.evTimeBonus;
          }
          this._eventFinish('all');
          return true;
        }
        this._eventSpawnItem();
      }
    }
    return false;
  },

  // ------------------------------------------------------------ in order
  // The item's sound at every pitch a round may use (made when first played).
  _mOrderNotes() {
    const first = this.evBeacons[0];
    if (this.mNoteBase === first) return;
    this.mNoteNames = this._mPitched(first, 'event_order_');
    this.mNoteBase = first;
  },

  // Web only: the pitched copies of a sound, named as the desktop names them, made
  // from it the moment each is first played (see sounds.js addLazy).
  _mPitched(baseName, prefix) {
    const buf = this.audio.buffers.get('dry:' + baseName) || this.audio.buffers.get('dry:event_beacon_bell');
    let arrs = null;
    const base = () => (arrs || (arrs = fromBuffer(buf)));
    const names = {};
    for (let semi = -ORDER_SPREAD; semi <= ORDER_SPREAD; semi++) {
      const name = `${prefix}${baseName}_${semi + ORDER_SPREAD}`;
      if (!this.audio.has(name)) addLazy(this.audio, name, () => pitch(base(), semi));
      names[semi] = name;
    }
    return names;
  },

  _mOrderRound() {
    const od = this.ev.order; const it = this.ev.item;
    this._mOrderNotes();
    for (const th of this.evItems) this._mStop(th);
    this.evItems = [];
    let n = Math.min(od.most, od.first_round + od.per_round * (this.mRound - 1));
    const gap = Math.max(1, Math.trunc(od.note_gap));
    const grid = range(-ORDER_SPREAD, ORDER_SPREAD + 1, gap);
    // Never more notes than fit at this gap.
    n = Math.max(1, Math.min(n, grid.length));
    const start = randint(0, Math.max(0, grid.length - n));
    // n notes at least the gap apart: a run of the grid, now and then a note skipped.
    let pick = sample(grid.slice(start), Math.min(n, grid.length - start)).sort((a, b) => a - b);
    while (pick.length < n) pick = sample(grid, n).sort((a, b) => a - b);
    for (const semi of pick) {
      const th = new Thing(...this._eventSpot(it.min_distance, it.max_distance));
      th.note = semi;
      th.channel = this.audio.play(this.mNoteNames[semi], { loops: -1, volume: 0.0 });
      th.age = 0.0;
      this.evItems.push(th);
    }
    this.mOrderNeed = [...pick].sort((a, b) => (od.direction === 'high_first' ? b - a : a - b));
  },

  _mOrderUpdate(dt) {
    const od = this.ev.order; const it = this.ev.item;
    for (const th of [...this.evItems]) {
      th.age += dt;
      const on = this._mReached(th, it.volume);
      // A wrong note costs once for each time it is stepped onto.
      const fresh = on && th.goal !== 'on';
      th.goal = on ? 'on' : null;
      if (!on) continue;
      if (th.note === this.mOrderNeed[0]) {
        this._mStop(th);
        remove(this.evItems, th);
        this.mOrderNeed.shift();
        this.audio.play(this.evPickup, { at: [th.x, th.y] });
        this.evCollected += 1;
        this.evPoints += it.points;
        if (!this.mOrderNeed.length) {
          this.evPoints += od.points_per_round;
          this.mRoundsDone += 1;
          if (this._bEndingReached(this.mRoundsDone)) return true;      // web 5.0.0: the run's last one, by its ending (blocks.js)
          this.mRound += 1;
          this.audio.play('stairs_climb');
          this._mOrderRound();
        }
        return false;
      }
      if (!fresh || th.age < 0) continue;      // still on it, or just stepped off and back
      this.audio.play(this.mWrongSound);
      if (od.wrong === 'end_run') {
        this._eventFinish('wrong');
        return true;
      }
      if (od.wrong === 'lose_time') {
        this.timeLeft -= od.penalty;
        this.lastBeepSecond = -1;
        const step = this.evClock ? this.ev.clock.announce_every_seconds : 0;
        if (step) this.evNextAnnounce = Math.floor((this.timeLeft - 1) / step) * step;
      } else {
        this.evPoints = Math.max(0, this.evPoints - od.penalty);
      }
      th.age = -2.0;                // it waits while you step away
    }
    return false;
  },

  // ------------------------------------------------------------ escape
  _mEscapeRoom() {
    const ex = this.ev.escape;
    this._mStop(this.mExit);
    const th = new Thing(...this._eventSpot(ex.exit_distance, 0));
    th.channel = this.audio.play(this.mExitSound, { loops: -1, volume: 0.0 });
    this.mExit = th;
    const want = Math.min(ex.most, ex.first_room + ex.more_each_room * (this.mRoom - 1));
    for (const h of this.evHazards) this._mStop(h);
    this.evHazards = [];
    for (let i = 0; i < want; i++) this._eventSpawnHazard(i);
    this._bSpawnKinds();        // web 5.0.0: the second and third kinds of creature come with each room
    this.mGrace = this.evElapsed + ESCAPE_GRACE;
  },

  _mEscapeUpdate(dt) {
    const ex = this.ev.escape;
    if (this.mExit && this._mReached(this.mExit, 0.9)) {
      this.evPoints += ex.points_per_room;
      this.mRoomsDone += 1;
      if (this._bEndingReached(this.mRoomsDone)) return true;      // web 5.0.0: the run's last one, by its ending (blocks.js)
      this.mRoom += 1;
      this.audio.play('stairs_climb');
      this._mEscapeRoom();
    }
    return false;
  },

  // True while creatures may not reach you yet (a new escape room).
  mHazardsHeld() {
    return Boolean(this.ev && this.ev.mission === 'escape' && this.evElapsed < (this.mGrace || 0.0));
  },

  // ------------------------------------------------------------ pitched notes
  // The sound at every pitch from an octave down to an octave up.
  _mNotes(baseName) {
    const cache = this.mNoteCache || {};
    if (cache[baseName]) return cache[baseName];
    const names = this._mPitched(baseName, 'event_note_');
    cache[baseName] = names;
    this.mNoteCache = cache;
    return names;
  },

  // n notes at least gap semitones apart, within an octave either side.
  _mSpread(n, gap) {
    const grid = range(-ORDER_SPREAD, ORDER_SPREAD + 1, gap);
    return sample(grid, Math.min(n, grid.length)).sort((a, b) => a - b);
  },

  // Keep a thing's place in the room, and say whether the player has walked into it.
  _mReached(th, gain = 1.0, reach = REACH) {
    this._mLevel(th, gain);
    return this.evSteppedOnto([th.x, th.y], reach);
  },

  // True the moment the player steps onto a pad (not while they stay on it).
  _mStepped(th, gain = 1.0) {
    if (th.channel) this._mLevel(th, gain);
    const on = this.evSteppedOnto([th.x, th.y], REACH);
    const was = th.age > 0;
    th.age = on ? 1.0 : 0.0;
    return on && !was;
  },

  // ------------------------------------------------------------ memory
  _mMemorySetup() {
    const me = this.ev.memory;
    const notes = this._mNotes(this.evBeacons[0]);
    const semis = this._mSpread(me.pads, 3);
    this.mPads = [];
    // Never farther out than the player can walk.
    const reachMost = Math.floor(this.arenaLimit / 3.0) * 3.0;
    const dist = Math.min(me.pad_distance, Math.max(3.0, reachMost));
    semis.forEach((semi, i) => {
      const ang = 2 * Math.PI * i / semis.length - Math.PI / 2;     // the first pad straight ahead, north
      const th = new Thing(dist * Math.cos(ang), dist * Math.sin(ang));
      th.note = notes[semi];
      th.age = 0.0;
      this.mPads.push(th);
    });
    this.playerPos = [0.0, 0.0];
    this.mTune = range(0, me.first_length).map(() => randrange(this.mPads.length));
    this._mMemoryPlay();
  },

  // The tune is played from the pads; the player's turn begins after it.
  _mMemoryPlay() {
    for (const th of this.mPads) this._mStop(th);
    const gap = this.ev.memory.note_gap;
    this.mPlaying = this.mTune.map((_, i) => [this.evElapsed + 0.8 + i * gap, i]);
    this.mTurnAt = this.evElapsed + 0.8 + this.mTune.length * gap;
    this.mPos = 0;
  },

  _mMemoryUpdate(dt) {
    const me = this.ev.memory;
    for (const item of [...this.mPlaying]) {
      const [at, i] = item;
      if (this.evElapsed >= at) {
        remove(this.mPlaying, item);
        const pad = this.mPads[this.mTune[i]];
        const ch = this.audio.play(pad.note, { volume: 0.0 });
        if (ch) {
          const [left, right] = this._battleLevels([pad.x, pad.y], 1.0);
          ch.setVolume(left, right, this._behind([pad.x, pad.y]));
        }
      }
    }
    if (this.evElapsed < this.mTurnAt) {
      // The tune is playing: where the player stands is still followed.
      for (const th of this.mPads) th.age = this.evSteppedOnto([th.x, th.y], REACH) ? 1.0 : 0.0;
      return false;
    }
    for (let idx = 0; idx < this.mPads.length; idx++) {
      const th = this.mPads[idx];
      if (me.pads_call && th.channel === null) th.channel = this.audio.play(th.note, { loops: -1, volume: 0.0 });
      const gain = me.pads_call ? 0.35 : 0.0;
      if (!this._mStepped(th, gain)) continue;
      this.audio.play(th.note);
      if (idx === this.mTune[this.mPos]) {
        this.mPos += 1;
        this.evPoints += this.ev.item.points;
        if (this.mPos >= this.mTune.length) {
          this.evPoints += me.points_per_round;
          this.mRoundsDone += 1;
          if (this._bEndingReached(this.mRoundsDone)) return true;      // web 5.0.0: the run's last one, by its ending (blocks.js)
          this.audio.play('stairs_climb');
          if (this.mTune.length < me.longest) this.mTune.push(randrange(this.mPads.length));
          this._mMemoryPlay();
        }
        return false;
      }
      this.audio.play('event_wrong');
      if (me.wrong === 'end_run') {
        this._eventFinish('wrong_pad');
        return true;
      }
      this.evPoints = Math.max(0, this.evPoints - me.penalty);
      this._mMemoryPlay();
      return false;
    }
    return false;
  },

  // ------------------------------------------------------------ pairs
  _mPairsRound() {
    const pa = this.ev.pairs; const it = this.ev.item;
    for (const th of this.mPads || []) this._mStop(th);
    const n = Math.min(pa.most, pa.first_pairs + pa.more_each_round * (this.mRound - 1));
    let hidden;
    if (this.evBeacons.length >= n && it.beacon_set && it.beacon_set.length) {
      hidden = sample(this.evBeacons, n);          // each pair its own recording
    } else {
      const notes = this._mNotes(this.evBeacons[0]);
      hidden = this._mSpread(n, pa.note_gap).map((s) => notes[s]);
    }
    const sounds = shuffle([...hidden, ...hidden]);
    this.mPads = [];
    for (const snd of sounds) {
      const th = new Thing(...this._eventSpot(Math.max(6.0, it.min_distance), it.max_distance));
      th.note = snd;
      th.age = 0.0;
      th.channel = this.audio.play('event_pad', { loops: -1, volume: 0.0 });
      this.mPads.push(th);
    }
    this.mFirst = null;
  },

  _mPairsUpdate(dt) {
    const pa = this.ev.pairs;
    for (const th of [...this.mPads]) {
      if (!this._mStepped(th, 0.6)) continue;
      this.audio.play(th.note);
      if (this.mFirst === null || this.mFirst === th) {
        this.mFirst = th;
        continue;
      }
      if (this.mFirst.note === th.note) {
        // A pair: both go quiet and leave the room.
        for (const p of [this.mFirst, th]) {
          this._mStop(p);
          remove(this.mPads, p);
        }
        this.mFirst = null;
        this.evCollected += 1;
        this.evPoints += pa.points_per_pair;
        this._later(0.6, this.evPickup);
        if (!this.mPads.length) {
          this.evPoints += pa.points_per_round;
          this.mRoundsDone += 1;
          if (this._bEndingReached(this.mRoundsDone)) return true;      // web 5.0.0: the run's last one, by its ending (blocks.js)
          this.mRound += 1;
          this.audio.play('stairs_climb');
          this._mPairsRound();
        }
      } else {
        this.mFirst = th;           // not a pair: this one is now the first of the next try
      }
    }
    return false;
  },

  // ------------------------------------------------------------ detector
  _mDetectorHide() {
    const it = this.ev.item;
    this.mBuried = new Thing(...this._eventSpot(Math.max(15.0, it.min_distance), it.max_distance, it.direction || 'anywhere'));
  },

  _mDetectorUpdate(dt) {
    const de = this.ev.detector; const it = this.ev.item;
    const b = this.mBuried;
    const d = Math.hypot(b.x - this.playerPos[0], b.y - this.playerPos[1]);
    if (this.evSteppedOnto([b.x, b.y], REACH)) {
      this.audio.play(this.evPickup);
      this.evCollected += 1;
      this.evPoints += it.points;
      if (it.total && this.evCollected >= it.total) {
        this.evPoints += it.all_found_bonus;
        if (this.evClock) {
          this.evTimeBonus = Math.trunc(Math.max(0, this.timeLeft)) * it.time_bonus;
          this.evPoints += this.evTimeBonus;
        }
        this._eventFinish('all');
        return true;
      }
      this._mDetectorHide();
      this.mBeepWait = 1.0;
      return false;
    }
    const near = Math.max(0.0, 1.0 - d / de.range);
    const wait = de.slowest - (de.slowest - de.fastest) * near ** 1.5;
    this.mBeepWait -= dt;
    if (this.mBeepWait <= 0) {
      this.mBeepWait = wait;
      const ch = this.audio.play(this.mBeepSound, { volume: 0.0 });
      if (ch) {
        if (de.directional) {
          const [left, right] = this._battleLevels([b.x, b.y], 3.0);
          const top = Math.max(left, right, 1e-6);
          ch.setVolume(0.8 * left / top, 0.8 * right / top);
        } else {
          ch.setVolume(0.8, 0.8);
        }
      }
    }
    return false;
  },

  // ------------------------------------------------------------ dodge
  _mDodgeUpdate(dt) {
    const dd = this.ev.dodge;
    this.mFallTimer -= dt;
    if (this.mFallTimer <= 0) {
      this.mFallTimer = this.mFallEvery;
      this.mFallEvery = Math.max(dd.least_seconds, this.mFallEvery - dd.faster_each);
      const lim = this.arenaLimit - 2.0;
      const ang = uniform(0, 2 * Math.PI); const r = uniform(0, dd.aim_distance);
      const x = Math.max(-lim, Math.min(lim, this.playerPos[0] + r * Math.cos(ang)));
      const y = Math.max(-lim, Math.min(lim, this.playerPos[1] + r * Math.sin(ang)));
      const th = new Thing(x, y);
      th.age = dd.warning_seconds;
      th.channel = this.audio.play(this.mFallSound, { loops: -1, volume: 0.0 });
      this.mFalls.push(th);
    }
    for (const th of [...this.mFalls]) {
      this._mLevel(th, 1.2);
      th.age -= dt;
      if (th.age > 0) continue;
      this._mStop(th);
      remove(this.mFalls, th);
      this.audio.play(this.mLandSound, { at: [th.x, th.y] });
      if (Math.hypot(th.x - this.playerPos[0], th.y - this.playerPos[1]) <= dd.blast_distance) {
        this.audio.play('player_hit');
        this.mDodgeLives -= 1;
        if (this.mDodgeLives <= 0) {
          this._eventFinish('hit');
          return true;
        }
      } else {
        this.mDodged += 1;
        this.evPoints += dd.points_per_dodge;
      }
    }
    return false;
  },

  // ------------------------------------------------------------ defend
  _mDefendUpdate(dt) {
    const df = this.ev.defend;
    this._mLevel(this.mTreasure, 1.0);
    for (const th of this.evHazards) {
      if (th.downFor >= 0) {
        if (th.downFor >= df.respawn_seconds) this._mDefendRespawn(th);
        continue;
      }
      if (Math.hypot(th.x, th.y) < REACH) {
        this.audio.play('player_hit', { at: [0.0, 0.0] });
        this.mTreasureLives -= 1;
        if (this.mTreasureLives <= 0) {
          this._eventFinish('stolen');
          return true;
        }
        this._mDefendRespawn(th);
      }
    }
    return false;
  },

  _mDefendRespawn(th) {
    const lim = this.arenaLimit - 3.0;
    const v = uniform(-lim, lim);
    const [x, y] = choice([[v, -lim], [v, lim], [-lim, v], [lim, v]]);
    if (th.channel) th.channel.stop();
    th.x = x; th.y = y; th.home = [x, y];
    th.hits = 0; th.downFor = -1.0; th.goal = null;
    this.mSpeedBonus += this.ev.defend.faster_each;
    th.channel = this.audio.play(th.beacon, { loops: -1, volume: 0.0 });
  },

  // ------------------------------------------------------------ hold
  _mHoldMove() {
    const it = this.ev.item; const ho = this.ev.hold;
    const old = this.mSpot;
    if (old) this._mStop(old);
    let x; let y;
    for (let i = 0; i < 50; i++) {
      [x, y] = this._eventSpot(Math.max(12.0, it.min_distance), it.max_distance);
      if (!old || Math.hypot(x - old.x, y - old.y) > 2 * ho.radius) break;
    }
    const th = new Thing(x, y);
    th.channel = this.audio.play(choice(this.evBeacons), { loops: -1, volume: 0.0 });
    this.mSpot = th;
    this.mHoldTimer = ho.move_seconds;
    this.mWarned = false;
  },

  _mHoldUpdate(dt) {
    const ho = this.ev.hold;
    const d = this._mLevel(this.mSpot, this.ev.item.volume);
    if (d <= ho.radius) {
      this.mHeld += dt;
      this.evPoints += ho.points_per_second * dt;
    }
    this.mHoldTimer -= dt;
    if (ho.warn_before_move && !this.mWarned && this.mHoldTimer <= 3.0) {
      this.mWarned = true;
      this.audio.play('event_checkpoint');
    }
    if (this.mHoldTimer <= 0) this._mHoldMove();
    return false;
  },

  // ============================================================ sneak
  _mSneakSetup(ev) {
    this.mNoise = 0.0;
    this.mAwake = 0.0;              // seconds the guard has left awake
    this.mSnore = this.loadEventRecording(ev.sneak.snore_sound, 'beacon_hazard');
    for (const h of this.evHazards) this._mSneakSound(h, true);
  },

  mGuardAsleep() { return (this.mAwake || 0.0) <= 0; },

  _mSneakUpdate(dt) {
    const sn = this.ev.sneak;
    if (this.mAwake > 0) {
      this.mAwake -= dt;
      if (this.mAwake <= 0) {
        this.mNoise = 0.0;
        for (const h of this.evHazards) {
          if (h.downFor >= 0) continue;            // shot down: it has no sound until it is back
          h.home = [h.x, h.y];                       // it falls asleep where it is
          this._mSneakSound(h, true);
        }
      }
    } else {
      this.mNoise = Math.max(0.0, this.mNoise - sn.quiet_per_second * dt);
    }
    return false;
  },

  _mSneakSound(h, sleeping) {
    const want = sleeping ? (this.mSnore || h.beacon) : h.beacon;
    if (h.note !== want) {
      if (h.channel) h.channel.stop();
      h.channel = this.audio.play(want, { loops: -1, volume: 0.0 });
      h.note = want;
    }
  },

  _mSneakStep() {
    const sn = this.ev.sneak;
    if (this.mAwake > 0) return;
    for (const h of this.evHazards) {
      if (h.downFor >= 0) continue;                // shot down: it hears nothing
      const d = Math.hypot(h.x - this.playerPos[0], h.y - this.playerPos[1]);
      if (d < sn.hearing) this.mNoise += sn.noise_per_step * (1.0 - d / sn.hearing);
    }
    if (this.mNoise >= 1.0) this._mSneakWake();
  },

  // The guards wake and hunt: from your noise, or from walking right into one.
  _mSneakWake() {
    this.mNoise = 1.0;
    this.mAwake = this.ev.sneak.awake_seconds;
    for (const h of this.evHazards) if (h.downFor < 0) this._mSneakSound(h, false);
    this.audio.play(!this.audio.has('guardian_hit') ? 'player_hit' : 'guardian_hit');
  },

  // A creature has reached you. True if the mission deals with it itself.
  mTouchHandled(th) {
    const m = this.ev ? this.ev.mission : null;
    if (m === 'defend') return true;
    if (m === 'sneak' && this.mGuardAsleep()) { this._mSneakWake(); return true; }
    return false;
  },

  // How loud a sleeping guard is: softly when it has no snoring recording of its own.
  mSleepingGain() {
    if (this.ev && this.ev.mission === 'sneak' && this.mGuardAsleep() && !this.mSnore) return SNEAK_SOFT;
    return 1.0;
  },

  // ============================================================ bomb
  _mBombNew() {
    const bo = this.ev.bomb; const it = this.ev.item;
    const th = new Thing(...this._eventSpot(Math.max(12.0, it.min_distance), it.max_distance));
    th.beacon = (it.beacon_file || (it.beacon_set && it.beacon_set.length)) ? choice(this.evBeacons) : 'event_bomb_tick';
    th.channel = this.audio.play(th.beacon, { loops: -1, volume: 0.0 });
    th.age = Math.max(bo.shortest, bo.fuse_seconds - bo.shorter_each * this.mDefusedTries);
    this.mLastQuick = -1;          // each bomb ticks every one of its last half-seconds
    this.mBomb = th;
    this.mCarryingBomb = false;
  },

  _mBombUpdate(dt) {
    const bo = this.ev.bomb; const it = this.ev.item;
    const b = this.mBomb;
    if (!this.mCarryingBomb) {
      this._mLevel(b, it.volume);
      if (bo.fuse_starts === 'appears') b.age -= dt;
      if (this.evSteppedOnto([b.x, b.y], REACH)) {
        this.mCarryingBomb = true;
        this.audio.play(this.evPickup);
        if (b.channel) b.channel.setVolume(0.7, 0.7, 0.0);   // it ticks in your hands now
        if (this.mSafe.channel === null) this.mSafe.channel = this.audio.play(this.mSafeSound, { loops: -1, volume: 0.0 });
      }
    } else {
      b.age -= dt;
      [b.x, b.y] = this.playerPos;
      this._mLevel(this.mSafe, 1.0);
      if (this.evSteppedOnto([this.mSafe.x, this.mSafe.y], REACH)) {
        this._mStop(b);
        this._mStop(this.mSafe);
        this.audio.play('event_delivered');
        this.mDefused += 1;
        this.mDefusedTries += 1;
        this.evCollected += 1;
        this.evPoints += it.points;
        if (it.total && this.mDefused >= it.total) {
          // Every bomb made safe: the all-found bonus, and the time bonus.
          this.evPoints += it.all_found_bonus;
          if (this.evClock) {
            this.evTimeBonus = Math.trunc(Math.max(0, this.timeLeft)) * it.time_bonus;
            this.evPoints += this.evTimeBonus;
          }
          this._eventFinish('all');
          return true;
        }
        if (this.ev.bomb.safe_place === 'random') [this.mSafe.x, this.mSafe.y] = this._mPlace('random');
        this._mBombNew();
        return false;
      }
    }
    // The last few seconds tick faster: a quick tick on every half second.
    if (b.age > 0 && b.age <= 3.0 && Math.trunc(b.age * 2) !== (this.mLastQuick === undefined ? -1 : this.mLastQuick)) {
      this.mLastQuick = Math.trunc(b.age * 2);
      this.audio.play('countdown');
    }
    if (b.age <= 0) {
      this._mStop(b);
      this._mStop(this.mSafe);
      this.audio.play(this.mBang, { at: [b.x, b.y] });
      this.audio.play('player_hit');
      this.mBombLives -= 1;
      this.mDefusedTries += 1;
      if (this.mBombLives <= 0) {
        this._eventFinish('bang');
        return true;
      }
      this._mBombNew();
    }
    return false;
  },

  // ============================================================ rescue
  _mRescueUpdate(dt) {
    const rs = this.ev.rescue; const it = this.ev.item;
    const [px, py] = this.playerPos;
    for (const th of [...this.evItems]) {
      const d = Math.hypot(th.x - px, th.y - py);
      if (th.goal === 'follow') {
        if (d > rs.lose_distance) {
          th.goal = null;              // left behind: it calls for help again
          if (th.channel === null) th.channel = this.audio.play(th.beacon, { loops: -1, volume: 0.0 });
          continue;
        }
        if (d > STEP) {
          const sp = Math.min(d - STEP * 0.8, rs.follow_speed * STEP * dt);
          th.x += (px - th.x) / d * sp;
          th.y += (py - th.y) / d * sp;
        }
        if (th.channel) this._mLevel(th, it.volume * 0.6);
      } else {
        this._mLevel(th, it.volume);
        if (this.evSteppedOnto([th.x, th.y], REACH)) {
          th.goal = 'follow';
          this.audio.play(th.value ? this.evBonusPickup : this.evPickup, { at: [th.x, th.y] });
        }
      }
    }
    const home = this.mHome;
    if (this.evItems.some((t) => t.goal === 'follow')) {
      if (home.channel === null) home.channel = this.audio.play(this.mHomeSound, { loops: -1, volume: 0.0 });
      this._mLevel(home, 1.0);
    } else if (home.channel) {
      this._mStop(home);
    }
    for (const th of [...this.evItems]) {
      if (th.goal === 'follow' && Math.hypot(th.x - home.x, th.y - home.y) < REACH * 1.5) {
        this._mStop(th);
        remove(this.evItems, th);
        this.audio.play('event_delivered');
        this.evCollected += 1;
        this.evPoints += th.value ? it.bonus_points : it.points;
        this.evBonuses = (this.evBonuses || 0) + (th.value ? 1 : 0);
        if (it.total && this.evCollected >= it.total) {
          this.evPoints += it.all_found_bonus;
          if (this.evClock) {
            this.evTimeBonus = Math.trunc(Math.max(0, this.timeLeft)) * it.time_bonus;
            this.evPoints += this.evTimeBonus;
          }
          this._eventFinish('all');
          return true;
        }
        this._eventSpawnItem();
      }
    }
    return false;
  },

  // ============================================================ reflex
  _mReflexNext() {
    const rf = this.ev.reflex;
    const dirs = rf.directions === 'two' ? ['left', 'right'] : ['ahead', 'behind', 'left', 'right'];
    this.mCueDir = choice(dirs);
    this.mCueAt = this.evElapsed + rf.gap_seconds;
    this.mCueWindow = Math.max(rf.shortest, rf.window_seconds - rf.faster_each * this.mAnswered);
    this.mCueLive = false;
  },

  _mReflexUpdate(dt) {
    this.playerPos = [0.0, 0.0];
    if (!this.mCueLive && this.evElapsed >= this.mCueAt) {
      this.mCueLive = true;
      this.mCueStarted = this.evElapsed;
      const off = { ahead: [0, -20], behind: [0, 20], left: [-20, 0], right: [20, 0] }[this.mCueDir];
      const ch = this.audio.play(this.mCueSound, { volume: 0.0 });
      if (ch) {
        const [left, right] = this._battleLevels(off, 3.0);
        const top = Math.max(left, right, 1e-6);
        ch.setVolume(left / top, right / top, this._behind(off));
      }
    }
    if (this.mCueLive && this.evElapsed - this.mCueStarted > this.mCueWindow) return this._mReflexMiss();
    return false;
  },

  _mReflexMiss() {
    this.audio.play('event_wrong');
    this.mReflexLives -= 1;
    if (this.mReflexLives <= 0) {
      this._eventFinish('slow');
      return true;
    }
    this._mReflexNext();
    return false;
  },

  // A swipe in an event: true if the mission used it (so the player does not walk).
  mArrow(key) {
    if (!this.ev) return false;
    if (this._xArrow(key)) return true;          // web 5.0.0: the swipes are the mission's own (dance steps)
    if (this.ev.mission === 'steps' && (this.mStepsLeft === undefined ? 1 : this.mStepsLeft) <= 0) return true;
    if (this.ev.mission !== 'reflex') return false;
    if (!this.mCueLive) return true;             // between sounds the swipes do nothing
    const said = { up: 'ahead', down: 'behind', left: 'left', right: 'right' }[key];
    if (said === this.mCueDir) {
      const took = this.evElapsed - this.mCueStarted;
      this.mAnswered += 1;
      this.evPoints += this.ev.item.points + pyRound(5 * Math.max(0.0, 1.0 - took / this.mCueWindow));
      this.audio.play('event_checkpoint');
      this._mReflexNext();
    } else {
      this._mReflexMiss();
    }
    return true;
  },

  // ============================================================ musical chairs
  _mChairsMusic() {
    const ch = this.ev.chairs;
    for (const th of this.mPads) this._mStop(th);
    this.mPads = [];
    this.mMusicCh = this.audio.play(this.mMusic, { loops: -1, volume: 0.6 });
    this.mMusicLeft = uniform(ch.music_shortest, ch.music_longest);
    this.mChairLeft = 0.0;
  },

  _mChairsUpdate(dt) {
    const ch = this.ev.chairs;
    if (this.mMusicLeft > 0) {
      this.mMusicLeft -= dt;
      if (this.mMusicLeft <= 0) {
        if (this.mMusicCh) this.mMusicCh.stop();
        const n = Math.max(1, ch.chairs - this.mRoundsDone);
        for (let i = 0; i < n; i++) {
          const th = new Thing(...this._eventSpot(ch.chair_distance, 0));
          th.channel = this.audio.play('event_pad', { loops: -1, volume: 0.0 });
          this.mPads.push(th);
        }
        this.mChairLeft = Math.max(ch.shortest, ch.seconds_first - ch.less_each * this.mRoundsDone);
      }
      return false;
    }
    this.mChairLeft -= dt;
    for (const th of this.mPads) {
      if (this._mReached(th, 1.0)) {
        this.audio.play(this.evPickup);
        this.mRoundsDone += 1;
        this.evPoints += ch.points_per_round;
        if (this._bEndingReached(this.mRoundsDone)) return true;      // web 5.0.0: the run's last one, by its ending (blocks.js)
        this._mChairsMusic();
        return false;
      }
    }
    if (this.mChairLeft <= 0) {
      this._eventFinish('no_chair');
      return true;
    }
    return false;
  },

  // ============================================================ fishing
  _mFishingUpdate(dt) {
    const fi = this.ev.fishing; const it = this.ev.item;
    const lim = this.arenaLimit - 2.0;
    for (const th of this.evItems) {
      if (th.goal === null || Math.hypot(th.goal[0] - th.x, th.goal[1] - th.y) < 1.0) th.goal = [uniform(-lim, lim), uniform(-lim, lim)];
      const gx = th.goal[0] - th.x; const gy = th.goal[1] - th.y;
      const gd = Math.hypot(gx, gy);
      if (gd > 0.01) {
        const sp = fi.fish_speed * STEP * dt;
        th.x += gx / gd * sp;
        th.y += gy / gd * sp;
      }
      this._mLevel(th, it.volume);
    }
    return false;
  },

  mCast() {
    const fi = this.ev.fishing; const it = this.ev.item;
    if (this.evElapsed < (this.mCastReady || 0.0)) { this.audio.play('empty_click'); return; }
    this.mCastReady = this.evElapsed + fi.cast_wait;
    this.audio.play(this.mCastSound);
    let best = null;
    for (const th of this.evItems) {
      const dx = th.x - this.playerPos[0]; const dy = th.y - this.playerPos[1];
      const d = Math.hypot(dx, dy);
      if (d > fi.cast_distance || d < 0.01) continue;
      // A cast goes out in front: north, as everything ahead is.
      if (dy > 0) continue;
      if (Math.abs(dx / d) <= fi.aim && (best === null || d < best[0])) best = [d, th];
    }
    if (!best) return;
    const th = best[1];
    this._mStop(th);
    remove(this.evItems, th);
    const last = Boolean(it.total && this.evCollected + 1 >= it.total);
    if (last) this.audio.play(th.value ? this.evBonusPickup : this.evPickup);
    else this._later(0.4, th.value ? this.evBonusPickup : this.evPickup);
    this.evCollected += 1;
    this.evPoints += th.value ? it.bonus_points : it.points;
    this.evBonuses = (this.evBonuses || 0) + (th.value ? 1 : 0);
    if (it.total && this.evCollected >= it.total) {
      this.evPoints += it.all_found_bonus;
      if (this.evClock) {
        this.evTimeBonus = Math.trunc(Math.max(0, this.timeLeft)) * it.time_bonus;
        this.evPoints += this.evTimeBonus;
      }
      this._eventFinish('all');
      return;
    }
    this._eventSpawnItem();
  },

  // ============================================================ step limit
  mOnStep() {
    if (!this.ev) return;
    // Which way this step went: only a step forward or back can land the player on anything.
    this.evLastStep = [...(this.playerFacing || [0, -1])];
    this._bOnStep();            // web 5.0.0: what the floor does, and traps and teleports (blocks.js)
    if (!this.ev) return;
    this._xOnStep();            // web 5.0.0: the 25 further missions (more.js)
    if (!this.ev) return;
    const m = this.ev.mission;
    if (m === 'sneak') {
      this._mSneakStep();
    } else if (m === 'steps') {
      this.mStepsLeft -= 1;
      const st = this.ev.steps;
      if (this.mStepsLeft > 0 && this.mStepsLeft <= st.warn_at) this.audio.play('countdown');
    }
    // Where this step landed is judged now, with no time passing.
    if (this.state === 'event') this.updateEventMode(0.0);
    this._bAfterStep();         // web 5.0.0: ice slides you one more step
  },

  _mStepsCollected() { this.mStepsLeft += this.ev.steps.per_item; },

  // ============================================================ key and door
  _mKeysRoom() {
    const ke = this.ev.keys; const it = this.ev.item;
    for (const th of [this.mKey, this.mExit]) this._mStop(th);
    const k = new Thing(...this._eventSpot(Math.max(12.0, it.min_distance), it.max_distance));
    k.channel = this.audio.play(this.mKeySound, { loops: -1, volume: 0.0 });
    this.mKey = k;
    // The door at least its distance from the key; if no spot that far is found, the
    // farthest one tried.
    let best = null;
    for (let i = 0; i < 60; i++) {
      const [dx, dy] = this._eventSpot(12.0, 0);
      const d = Math.hypot(dx - k.x, dy - k.y);
      if (best === null || d > best[2]) best = [dx, dy, d];
      if (d >= ke.door_distance) break;
    }
    this.mExit = new Thing(best[0], best[1]);
    this.mHasKey = false;
    if (ke.more_creatures_each_room && this.mRoom > 1) {
      for (let i = 0; i < ke.more_creatures_each_room; i++) {
        // A creature shot down for good comes back as one of the new room's.
        const down = this.evHazards.filter((h) => h.downFor >= 0);
        if (down.length) this._eventSpawnHazard(0, down[0]);
        else if (this.evHazards.length < 10) this._eventSpawnHazard(this.evHazards.length);
      }
    }
  },

  _mKeysUpdate(dt) {
    const ke = this.ev.keys; const it = this.ev.item;
    if (!this.mHasKey) {
      if (this._mReached(this.mKey, it.volume)) {
        this._mStop(this.mKey);
        this.mHasKey = true;
        this.audio.play(this.audio.has('key_pickup') ? 'key_pickup' : this.evPickup);
        this.mExit.channel = this.audio.play(this.mDoorSound, { loops: -1, volume: 0.0 });
      }
      return false;
    }
    if (this._mReached(this.mExit, 0.9)) {
      this.evPoints += ke.points_per_room;
      this.mRoomsDone += 1;
      if (this._bEndingReached(this.mRoomsDone)) return true;      // web 5.0.0: the run's last one, by its ending (blocks.js)
      this.mRoom += 1;
      this.audio.play('stairs_climb');
      this._mKeysRoom();
    }
    return false;
  },

  // ============================================================ whack-a-mole
  _mWhackUpdate(dt) {
    const wh = this.ev.whack; const it = this.ev.item;
    this.mPopTimer -= dt;
    if (this.mPopTimer <= 0 && this.evItems.length < 3) {
      this.mPopTimer = wh.every_seconds;
      const lim = this.arenaLimit - 2.0;
      let x; let y;
      for (let i = 0; i < 40; i++) {
        const ang = uniform(0, 2 * Math.PI); const r = uniform(STEP * 1.5, wh.near);
        x = Math.max(-lim, Math.min(lim, this.playerPos[0] + r * Math.cos(ang)));
        y = Math.max(-lim, Math.min(lim, this.playerPos[1] + r * Math.sin(ang)));
        // Pulled in from a wall it can land beside you: never in your square.
        if ((Math.abs(x - this.playerPos[0]) > STEP * 0.75 || Math.abs(y - this.playerPos[1]) > STEP * 0.75)
            && !this.evItems.some((o) => Math.hypot(x - o.x, y - o.y) < STEP)) break;
      }
      const th = new Thing(x, y);
      th.beacon = choice(this.evBeacons);
      th.channel = this.audio.play(th.beacon, { loops: -1, volume: 0.0 });
      th.age = Math.max(wh.shortest, wh.up_seconds - wh.less_each * this.mPopped);
      this.mPopped += 1;
      this.evItems.push(th);
    }
    for (const th of [...this.evItems]) {
      th.age -= dt;
      if (this._mReached(th, it.volume)) {
        this._mStop(th);
        remove(this.evItems, th);
        this.audio.play(this.evPickup, { at: [th.x, th.y] });
        this.evCollected += 1;
        this.evPoints += it.points;
        if (it.total && this.evCollected >= it.total) {
          // The last one caught: the run ends here.
          this.evPoints += it.all_found_bonus;
          if (this.evClock) {
            this.evTimeBonus = Math.trunc(Math.max(0, this.timeLeft)) * it.time_bonus;
            this.evPoints += this.evTimeBonus;
          }
          this._eventFinish('all');
          return true;
        }
        continue;
      }
      if (th.age <= 0) {
        this._mStop(th);
        remove(this.evItems, th);
        if (this.mHideSound) this.audio.play(this.mHideSound, { at: [th.x, th.y] });
        this.mMisses += 1;
        if (wh.misses_allowed && this.mMisses >= wh.misses_allowed) {
          this._eventFinish('missed');
          return true;
        }
      }
    }
    return false;
  },

  // ============================================================ herding
  _mHerdUpdate(dt) {
    const he = this.ev.herd; const it = this.ev.item;
    const pen = this.mPen;
    this._mLevel(pen, 0.8);
    const [px, py] = this.playerPos;
    const lim = this.arenaLimit - 1.0;
    for (const th of [...this.evItems]) {
      const dx = th.x - px; const dy = th.y - py;
      const d = Math.hypot(dx, dy);
      if (d > 0.01 && d < he.flee_distance) {
        const sp = he.speed * STEP * dt;
        th.x = Math.max(-lim, Math.min(lim, th.x + dx / d * sp));
        th.y = Math.max(-lim, Math.min(lim, th.y + dy / d * sp));
      }
      this._mLevel(th, it.volume);
      if (Math.hypot(th.x - pen.x, th.y - pen.y) < this._mPenRadius()) {
        this._mStop(th);
        remove(this.evItems, th);
        this.audio.play(th.value ? this.evBonusPickup : this.evPickup, { at: [th.x, th.y] });
        this.evCollected += 1;
        this.evPoints += th.value ? it.bonus_points : it.points;
        this.evBonuses = (this.evBonuses || 0) + (th.value ? 1 : 0);
        if (it.total && this.evCollected >= it.total) {
          this.evPoints += it.all_found_bonus;
          if (this.evClock) {
            this.evTimeBonus = Math.trunc(Math.max(0, this.timeLeft)) * it.time_bonus;
            this.evPoints += this.evTimeBonus;
          }
          this._eventFinish('all');
          return true;
        }
        this._eventSpawnItem();
      }
    }
    return false;
  },

  // ============================================================ rhythm
  _mRhythmUpdate(dt) {
    const rh = this.ev.rhythm;
    if (this.evElapsed >= this.mNextBeat) {
      this.audio.play(this.mBeatSound);
      // A beat already answered by an early press is not waited on again.
      if (this.mEarly !== this.mNextBeat) {
        // Judged from when the drum is heard (this frame), not when it was due.
        this.mBeatTimes.push(this.evElapsed);
      }
      this.mEarly = null;
      this.mBeats += 1;
      if (rh.faster_every && this.mBeats % rh.faster_every === 0) {
        // Never slower than it started.
        this.mBpm = Math.min(Math.max(rh.fastest, rh.beats_per_minute), this.mBpm + rh.faster_by);
      }
      this.mNextBeat += 60.0 / this.mBpm;
    }
    // A beat left unanswered past its window is a miss.
    for (const t of [...this.mBeatTimes]) {
      if (this.evElapsed > t + rh.window) {
        remove(this.mBeatTimes, t);
        if (this._mRhythmMiss()) return true;
      }
    }
    return false;
  },

  _mRhythmMiss() {
    this.mRhythmMisses += 1;
    this.audio.play('empty_click');
    if (this.mRhythmMisses >= this.ev.rhythm.misses_allowed) {
      this._eventFinish('offbeat');
      return true;
    }
    return false;
  },

  mTap() {
    const rh = this.ev.rhythm;
    // The run's clock moves on once a frame, but the tap came since: the time from the
    // last update is added, so a tap right on the beat is judged right on the beat.
    const last = this.evUpdatedAt;
    const since = last ? performance.now() / 1000 - last : 0.0;
    const now = this.evElapsed + Math.min(0.1, Math.max(0.0, since));
    const near = this.mBeatTimes.filter((t) => Math.abs(now - t) <= rh.window);
    const upcoming = this.mNextBeat - now;
    if (near.length) {
      remove(this.mBeatTimes, near[0]);
      this.mOnBeat += 1;
      this.evPoints += this.ev.item.points;
    } else if (upcoming >= -rh.window && upcoming <= rh.window && this.mEarly !== this.mNextBeat) {
      // Tapped for the next beat before the game has sounded it: that beat is answered.
      this.mEarly = this.mNextBeat;
      this.mOnBeat += 1;
      this.evPoints += this.ev.item.points;
    } else {
      this._mRhythmMiss();
    }
  },

  // ============================================================ sorting
  _mSortSetup() {
    const lim = this.arenaLimit - 3.0;
    const corners = [[-lim, -lim], [lim, -lim], [lim, lim], [-lim, lim]];
    this.mBins = [];
    this.evBeacons.slice(0, 4).forEach((name, i) => {
      const th = new Thing(...corners[i]);
      th.beacon = name;
      this.mBins.push(th);
    });
    this.mHeld = null;
    this._mReplaceItems();
  },

  _mSortUpdate(dt) {
    const so = this.ev.sort; const it = this.ev.item;
    if (this.mHeld === null) {
      for (const th of [...this.evItems]) {
        if (this._mReached(th, it.volume)) {
          this._mStop(th);
          remove(this.evItems, th);
          this.audio.play(th.beacon, { at: [th.x, th.y] });     // what kind it is, once more
          this.mHeld = th.beacon;
          for (const b of this.mBins) {
            b.channel = this.audio.play(b.beacon, { loops: -1, volume: 0.0 });
            b.goal = null;               // the next arrival at any bin counts
          }
          break;
        }
      }
      return false;
    }
    for (const th of this.evItems) if (th.channel) th.channel.setVolume(0.0, 0.0);   // hands full: the rest wait in silence
    for (const b of this.mBins) {
      // Each arrival at a bin counts once.
      const on = this._mReached(b, 0.8, REACH * 1.5);
      const fresh = on && b.goal !== 'on';
      b.goal = on ? 'on' : null;
      if (fresh) {
        for (const x of this.mBins) this._mStop(x);
        if (b.beacon === this.mHeld) {
          this.audio.play('event_delivered');
          this.evCollected += 1;
          this.evPoints += it.points;
          this.mHeld = null;
          if (it.total && this.evCollected >= it.total) {
            this.evPoints += it.all_found_bonus;
            if (this.evClock) {
              this.evTimeBonus = Math.trunc(Math.max(0, this.timeLeft)) * it.time_bonus;
              this.evPoints += this.evTimeBonus;
            }
            this._eventFinish('all');
            return true;
          }
          this._eventSpawnItem();
        } else {
          this.audio.play(this.mWrongSound);
          if (so.wrong === 'end_run') {
            this._eventFinish('wrong_bin');
            return true;
          }
          this.evPoints = Math.max(0, this.evPoints - so.penalty);
          for (const x of this.mBins) x.channel = this.audio.play(x.beacon, { loops: -1, volume: 0.0 });
          // The player stays where they are; this bin counts again only once they step off it and back on.
        }
        return false;
      }
    }
    return false;
  },

  // ============================================================ lamplighter
  _mLampsSetup() {
    const la = this.ev.lamps;
    this.mPads = [];
    const r = Math.min(this.arenaLimit - 4.0, 0.6 * this.arenaLimit);
    for (let i = 0; i < la.lamps; i++) {
      const ang = 2 * Math.PI * i / la.lamps - Math.PI / 2;
      const th = new Thing(r * Math.cos(ang), r * Math.sin(ang));
      th.beacon = this.evBeacons[i % this.evBeacons.length];
      th.channel = this.audio.play(th.beacon, { loops: -1, volume: 0.0 });
      th.age = la.burn_seconds * uniform(0.6, 1.0);   // seconds of full light left
      th.full = la.burn_seconds;                       // its burn when last lit
      th.value = 1;                                    // 1 lit, 0 out
      this.mPads.push(th);
    }
    this.mLampsOut = 0;
    this.mLit = 0;
  },

  _mLampsUpdate(dt) {
    const la = this.ev.lamps; const it = this.ev.item;
    for (const th of this.mPads) {
      if (th.value) {
        th.age -= dt;
        const bright = th.age > 0 ? 1.0 : Math.max(0.0, 1.0 + th.age / la.fade_seconds);
        if (bright <= 0) {
          th.value = 0;
          this._mStop(th);
          this.audio.play('event_wrong', { at: [th.x, th.y] });
          this.mLampsOut += 1;
          if (this.mLampsOut > la.out_allowed) {
            this._eventFinish('lamps_out');
            return true;
          }
          continue;
        }
        this._mLevel(th, it.volume * (0.25 + 0.75 * bright));
      }
      const on = this.evSteppedOnto([th.x, th.y], REACH);
      // Lighting takes walking onto the lamp. A lamp can be lit once it is out, or has
      // burned down past half of the burn it was last given.
      const fresh = on && !th.goal;
      th.goal = on ? 'on' : null;
      if (fresh && (!th.value || th.age < (th.full === null ? la.burn_seconds : th.full) * 0.5)) {
        if (!th.value) {
          this.mLampsOut -= 1;
          th.value = 1;
          th.channel = this.audio.play(th.beacon, { loops: -1, volume: 0.0 });
        }
        th.age = Math.max(la.shortest, la.burn_seconds - la.shorter_each * this.mLit);
        th.full = th.age;
        this.mLit += 1;
        this.evPoints += it.points;
        this.audio.play(this.mLightSound, { at: [th.x, th.y] });
      }
    }
    return false;
  },

  // ------------------------------------------------------------ every frame
  // The mission's own work each frame. Returns true if the run ended.
  _mUpdate(dt) {
    const fn = {
      deliver: this._mDeliverUpdate, catch: this._mCatchUpdate, relay: this._mRelayUpdate, follow: this._mFollowUpdate,
      hunt: this._mHuntUpdate, seek: this._mSeekUpdate, order: this._mOrderUpdate, escape: this._mEscapeUpdate,
      memory: this._mMemoryUpdate, pairs: this._mPairsUpdate, detector: this._mDetectorUpdate, dodge: this._mDodgeUpdate,
      defend: this._mDefendUpdate, hold: this._mHoldUpdate, sneak: this._mSneakUpdate, bomb: this._mBombUpdate,
      rescue: this._mRescueUpdate, reflex: this._mReflexUpdate, chairs: this._mChairsUpdate, fishing: this._mFishingUpdate,
      keys: this._mKeysUpdate, whack: this._mWhackUpdate, herd: this._mHerdUpdate, rhythm: this._mRhythmUpdate,
      sort: this._mSortUpdate, lamps: this._mLampsUpdate,
    }[this.ev.mission];
    return fn ? fn.call(this, dt) : false;
  },

  // Whether the mission handles the items itself (not the usual collecting).
  _mUsesOwnItems() {
    return ['deliver', 'catch', 'relay', 'follow', 'seek', 'order', 'memory', 'pairs', 'detector', 'dodge', 'hold',
      'bomb', 'rescue', 'reflex', 'chairs', 'fishing', 'keys', 'whack', 'herd', 'rhythm', 'sort', 'lamps'].includes(this.ev.mission);
  },

  // ------------------------------------------------------------ the double tap
  // The report for the new missions, or null for the usual one.
  _mStatus() {
    const ev = this.ev; const it = ev.item;
    const m = ev.mission;
    const p = Math.trunc(this.evPoints);
    const pts = `${p} point${ss(p)}.`;
    let msg;
    if (m === 'deliver') {
      const word = this.mDelivered === 1 ? it.name : it.plural;
      msg = `${this.mDelivered} ${word} delivered. `;
      if (this.mCarry) msg += `Carrying ${this.mCarry}. `;
      msg += pts;
      if (it.total && !it.hide_left) msg += ` ${it.total - this.mDelivered} left to deliver.`;
    } else if (m === 'catch') {
      const word = this.evCollected === 1 ? it.name : it.plural;
      msg = `${this.evCollected} ${word} caught. ` + pts;
      if (it.total && !it.hide_left) msg += ` ${it.total - this.evCollected} left.`;
    } else if (m === 'relay') {
      msg = `${this.mCheckpoints} checkpoint${ss(this.mCheckpoints)}. ${Math.trunc(Math.max(0, this.mLegLeft))} seconds to reach this one. ` + pts;
    } else if (m === 'follow') {
      msg = (this.mLost === 0.0 ? 'With the guide. ' : 'The guide is getting away. ') + pts;
    } else if (m === 'hunt') {
      const up = this.evHazards.filter((h) => h.downFor < 0).length;
      msg = `${up} ${ev.hazards.name}${ss(up)} left. ${this.evShotsWords()} ` + pts;
    } else if (m === 'seek') {
      const word = this.evCollected === 1 ? it.name : it.plural;
      msg = `${this.evCollected} ${word} found. ` + pts;
      if (ev.seek.pings) {
        const left = ev.seek.pings - this.mPingsUsed;
        msg += ` ${left} ping${ss(left)} left.`;
      }
      if (it.total && !it.hide_left) msg += ` ${it.total - this.evCollected} left to find.`;
    } else if (m === 'order') {
      msg = `Round ${this.mRound}. ${this.mOrderNeed.length} left in this round. ` + pts;
    } else if (m === 'escape') {
      const up = this.evHazards.filter((h) => h.downFor < 0).length;
      msg = `Room ${this.mRoom}. ${up} ${ev.hazards.name}${ss(up)} about. ` + pts;
    } else if (m === 'memory') {
      msg = this.evElapsed < this.mTurnAt ? `Round ${this.mRoundsDone + 1}. Listen to the tune. ` + pts
        : `Round ${this.mRoundsDone + 1}. Note ${this.mPos + 1} of ${this.mTune.length}. ` + pts;
    } else if (m === 'pairs') {
      const left = Math.floor(this.mPads.length / 2);
      msg = `Round ${this.mRound}. ${left} pair${ss(left)} left. ` + pts;
    } else if (m === 'detector') {
      const word = this.evCollected === 1 ? it.name : it.plural;
      msg = `${this.evCollected} ${word} found. ` + pts;
      if (it.total && !it.hide_left) msg += ` ${it.total - this.evCollected} left.`;
    } else if (m === 'dodge') {
      msg = `${this.mDodged} dodged. ${this.mDodgeLives} ${li(this.mDodgeLives)} left. ` + pts;
    } else if (m === 'defend') {
      const up = this.evHazards.filter((h) => h.downFor < 0).length;
      const lv = this.mTreasureLives;
      return `The treasure has ${lv} ${li(lv)} left. ${up} ${ev.hazards.name}${ss(up)} `
        + `coming. ${this.evShotsWords()} ` + pts;
    } else if (m === 'sneak') {
      const word = this.evCollected === 1 ? it.name : it.plural;
      const state = this.mAwake > 0 ? 'The guard is awake! ' : (this.mNoise > 0.6 ? 'The guard is stirring. ' : 'The guard is asleep. ');
      msg = `${this.evCollected} ${word}. ` + state + pts;
    } else if (m === 'bomb') {
      msg = `${this.mDefused} defused. ${this.mCarryingBomb ? 'Carrying a bomb. ' : ''}`
        + `${Math.trunc(Math.max(0, this.mBomb.age))} seconds on the fuse. ${this.mBombLives} ${li(this.mBombLives)} left. ` + pts;
    } else if (m === 'rescue') {
      const f = this.evItems.filter((t) => t.goal === 'follow').length;
      msg = `${this.evCollected} rescued. ${f} following you. ` + pts;
    } else if (m === 'reflex') {
      msg = `${this.mAnswered} answered. ${this.mReflexLives} ${li(this.mReflexLives)} left. ` + pts;
    } else if (m === 'chairs') {
      msg = `Round ${this.mRoundsDone + 1}. ` + (this.mMusicLeft > 0 ? 'Music playing. ' : 'Find a chair! ') + pts;
    } else if (m === 'fishing') {
      const word = this.evCollected === 1 ? it.name : it.plural;
      msg = `${this.evCollected} ${word} caught. ` + pts;
    } else if (m === 'steps') {
      const word = this.evCollected === 1 ? it.name : it.plural;
      msg = `${this.evCollected} ${word}. ${this.mStepsLeft} steps left. ` + pts;
    } else if (m === 'keys') {
      msg = `Room ${this.mRoom}. ` + (this.mHasKey ? 'You have the key. ' : 'Find the key. ') + pts;
    } else if (m === 'whack') {
      msg = `${this.evCollected} caught, ${this.mMisses} missed. ` + pts;
    } else if (m === 'herd') {
      const word = this.evCollected === 1 ? it.name : it.plural;
      msg = `${this.evCollected} ${word} in the pen. ` + pts;
    } else if (m === 'rhythm') {
      msg = `${this.mOnBeat} on the beat, ${this.mRhythmMisses} missed. ` + pts;
    } else if (m === 'sort') {
      msg = `${this.evCollected} sorted. ` + (this.mHeld ? 'Carrying one. ' : '') + pts;
    } else if (m === 'lamps') {
      const lit = this.mPads.filter((t) => t.value).length;
      msg = `${lit} of ${this.mPads.length} lamps lit. ` + pts;
    } else if (m === 'hold') {
      const inside = Math.hypot(this.mSpot.x - this.playerPos[0], this.mSpot.y - this.playerPos[1]) <= ev.hold.radius;
      msg = (inside ? 'In the spot. ' : 'Outside the spot. ') + pts;
    } else {
      return null;
    }
    if (ev.weapon.enabled && m !== 'hunt') msg += ' ' + this.evShotsWords();
    if (ev.hazards.on_touch === 'end_run' && ev.hazards.lives > 1 && this.evHazards.length) {
      const lv = this.evLives === undefined ? 1 : this.evLives;
      msg += ` ${lv} ${li(lv)} left`;
      // The mission has lives of its own, said above: tell the two apart.
      if (['dodge', 'bomb', 'reflex'].includes(m)) msg += ` against the ${ev.hazards.name}s`;
      msg += '.';
    }
    return msg;
  },

  // ------------------------------------------------------------ the end of a run
  // What ended the run, for the new missions' own endings, or null.
  _mReason(reason) {
    const ev = this.ev; const it = ev.item;
    return {
      late: 'Time ran out to reach the checkpoint. ',
      lost: 'The guide got away. ',
      no_shots: 'You ran out of shots. ',
      all_down: `You brought down every ${ev.hazards.name}! ` + (this.evTimeBonus
        ? `Time bonus ${this.evTimeBonus} point${ss(this.evTimeBonus)}. ` : ''),
      wrong: `That was the wrong ${it.name}. `,
      wrong_pad: 'That was the wrong pad. ',
      hit: 'You were hit. ',
      stolen: `The ${ev.hazards.name}s took the treasure. `,
      bang: 'The bomb went off. ',
      slow: 'Out of lives. ',
      no_chair: 'No chair! ',
      no_steps: 'Out of steps. ',
      missed: 'Too many got away. ',
      offbeat: 'Off the beat. ',
      wrong_bin: 'That was the wrong bin. ',
      lamps_out: 'The lamps went out. ',
    }[reason] || null;
  },

  // The results of a run of a new mission, or null for the usual ones.
  _mResult() {
    const ev = this.ev; const it = ev.item;
    const m = ev.mission;
    const P = (n) => `${n} point` + ss(n);
    const total = Math.trunc(this.evPoints);
    const word = (n) => (n === 1 ? it.name : it.plural);
    switch (m) {
      case 'deliver': return `You delivered ${this.mDelivered} ${word(this.mDelivered)} for ${P(total)}. `;
      case 'catch': return `You caught ${this.evCollected} ${word(this.evCollected)} for ${P(total)}. `;
      case 'relay': return `You reached ${this.mCheckpoints} checkpoint${ss(this.mCheckpoints)} for ${P(total)}. `;
      case 'follow': return `You stayed with the guide for ${Math.trunc(this.mWith)} seconds, for ${P(total)}. `;
      case 'hunt': { const n = this.evDowns || 0; return `You brought down ${n} ${ev.hazards.name}${ss(n)} for ${P(total)}. `; }
      case 'seek': return `You found ${this.evCollected} ${word(this.evCollected)} with ${this.mPingsUsed} ping${ss(this.mPingsUsed)}, for ${P(total)}. `;
      case 'order': return `You finished ${this.mRoundsDone} round${ss(this.mRoundsDone)} for ${P(total)}. `;
      case 'memory': return `You played back ${this.mRoundsDone} tune${ss(this.mRoundsDone)} for ${P(total)}. `;
      case 'pairs': return `You found ${this.evCollected} pair${ss(this.evCollected)} for ${P(total)}. `;
      case 'detector': return `You dug up ${this.evCollected} ${word(this.evCollected)} for ${P(total)}. `;
      case 'dodge': return `You dodged ${this.mDodged} for ${P(total)}. `;
      case 'defend': { const n = this.evDowns || 0; return `You brought down ${n} ${ev.hazards.name}${ss(n)} for ${P(total)}. `; }
      case 'sneak': return `You took ${this.evCollected} ${word(this.evCollected)} for ${P(total)}. `;
      case 'bomb': return `You defused ${this.mDefused} bomb${ss(this.mDefused)} for ${P(total)}. `;
      case 'rescue': return `You rescued ${this.evCollected} ${word(this.evCollected)} for ${P(total)}. `;
      case 'reflex': return `You answered ${this.mAnswered} for ${P(total)}. `;
      case 'chairs': return `You found a chair ${this.mRoundsDone} time${ss(this.mRoundsDone)} for ${P(total)}. `;
      case 'fishing': return `You caught ${this.evCollected} ${word(this.evCollected)} for ${P(total)}. `;
      case 'steps': return `You collected ${this.evCollected} ${word(this.evCollected)} for ${P(total)}. `;
      case 'keys': return `You unlocked ${this.mRoomsDone} door${ss(this.mRoomsDone)} for ${P(total)}. `;
      case 'whack': return `You caught ${this.evCollected} and missed ${this.mMisses}, for ${P(total)}. `;
      case 'herd': return `You herded ${this.evCollected} ${word(this.evCollected)} into the pen for ${P(total)}. `;
      case 'rhythm': return `You hit ${this.mOnBeat} beat${ss(this.mOnBeat)} for ${P(total)}. `;
      case 'sort': return `You sorted ${this.evCollected} for ${P(total)}. `;
      case 'lamps': return `You lit ${this.mLit} lamp${ss(this.mLit)} for ${P(total)}. `;
      case 'hold': return `You held the spot for ${Math.trunc(this.mHeld)} seconds, for ${P(total)}. `;
      case 'escape': return `You escaped ${this.mRoomsDone} room${ss(this.mRoomsDone)} for ${P(total)}. `;
      default: return null;
    }
  },
};
