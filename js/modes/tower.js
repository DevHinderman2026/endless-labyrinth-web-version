// Tower Mode: the desktop game's tower (endless_labyrinth.py, version 1.0.1), played
// with touch gestures. Names and numbers follow the desktop code so the two can be
// compared line by line: TowerItem, TowerProjectile, TowerEnemy and volley_spread,
// start_tower, _setup_tower_floor, update_tower_mode and the _tower_ helpers.
//
// The `this.chaosMode` branches are the desktop's chaos tower floors, kept so Chaos
// mode can reuse this code; standalone Tower Mode never takes them.

// ------------------------------------------------------------------ constants
// Roughly how fast a player crosses ground: 3.0 units a step at about 3 steps a
// second. Used only to keep the tower item races close to even.
const TOWER_PLAYER_PACE = 9.0;
// How tall a tower can be. A three floor tower is a sprint to the same difficulty a
// ten floor one arrives at gradually.
const TOWER_FLOORS_MIN = 3;
const TOWER_FLOORS_MAX = 10;
// How loud a thrown item's flight buzz is, against the rival's other sounds.
const TOWER_BUZZ_GAIN = 0.75;
// Lingering on a floor makes the rival hoard, on every tower: for every this many
// seconds on a floor without destroying it, it can hold one more item, up to
// TOWER_LINGER_MAX (or more where the tower already allows it). While hoarding it
// holds what it has until its arms are full and then throws the lot at once - or
// throws whatever it holds once TOWER_HOARD_PATIENCE seconds have passed since it
// last took one.
const TOWER_LINGER_STEP = 30.0;
const TOWER_LINGER_MAX = 5;
const TOWER_HOARD_PATIENCE = 12.0;
const BATTLE_AIM_PAN = 0.72;
const AMBIENCE_CROSSFADE = 0.8;     // a new tower floor's air, seconds
// Chaos only: climbing from one chaos tower floor to the next, the new floor waits
// for the climb up the stairs (its own length, up to CHAOS_CLIMB_TIME_MAX).
const CHAOS_CLIMB_TIME = 0.8;
const CHAOS_CLIMB_TIME_MAX = 1.5;
// The chaos gap state (STATE_CHAOS_GAP), for when Chaos mode is ported.
const STATE_CHAOS_GAP = 'chaos_gap';

// The tower's drones (the desktop's TOWER_DRONES). The desktop's in-game names
// tower_amb_N play TOWER_DRONES[N % TOWER_DRONES.length].
export const TOWER_DRONES = ['tow_01_night_castle', 'tow_02_castle_storm', 'tow_03_howling_wind', 'tow_04_wind_lake',
  'tow_05_stormy_wind', 'tow_06_hissy_blizzard', 'tow_07_wind_underground', 'tow_08_polar_wind',
  'tow_09_concrete_hallway', 'tow_10_metallic', 'tow_11_wind_room_tone'];
const towerAmb = (n) => TOWER_DRONES[n % TOWER_DRONES.length];

const STATE = 'tower';

// ------------------------------------------------------------------ helpers
const rand = Math.random;
const uniform = (a, b) => a + (b - a) * rand();
const randint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const choice = (arr) => arr[Math.floor(rand() * arr.length)];
const radians = (d) => (d * Math.PI) / 180;
// Python's round(): halves go to the even number (round(2.5) is 2).
function pyRound(x) {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff === 0.5) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}

function pointToSegment(x, y, a, b) {
  const [ax, ay] = a; const [bx, by] = b;
  const dx = bx - ax; const dy = by - ay;
  const span = dx * dx + dy * dy;
  const t = span <= 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / span));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

// Enter's report (the desktop's _report). In chaos mode every report ends with the
// run's points.
function report(game, text) {
  if (game.chaosMode) text = text.replace(/\s+$/, '') + game._clockTail();   // phones have no T
  if (game.chaosMode) text = text.replace(/\s+$/, '') + ` ${(game.chaosPoints || 0) + (game.islandPoints || 0)} points total.`;
  game.tts.speak(text, { interrupt: true });
}

// ------------------------------------------------------------------ things on a floor
// A throwable item lying somewhere on a tower floor.
export class TowerItem {
  constructor(playerPos, arena, minDist = 10.0) {
    const [px, py] = playerPos;
    this.x = Math.max(-arena, Math.min(arena, px + arena * 0.7));
    this.y = Math.max(-arena, Math.min(arena, py + arena * 0.7));
    for (let i = 0; i < 300; i++) {
      const angle = uniform(0, 2 * Math.PI);
      const dist = uniform(Math.max(12.0, minDist), arena * 0.95);
      const tx = px + Math.cos(angle) * dist;
      const ty = py + Math.sin(angle) * dist;
      if (tx >= -arena && tx <= arena && ty >= -arena && ty <= arena && Math.hypot(tx - px, ty - py) >= minDist) {
        this.x = tx; this.y = ty;
        break;
      }
    }
    this.active = true;
    this.channel = null;
  }
}

// An item the rival has thrown, travelling toward where the player stood when it
// was released. Moving off that line is what dodges it.
export class TowerProjectile {
  constructor(x, y, target, speed) {
    this.x = x; this.y = y;
    const dx = target[0] - x;
    const dy = target[1] - y;
    const d = Math.hypot(dx, dy) || 1.0;
    this.vx = (dx / d) * speed;
    this.vy = (dy / d) * speed;
    // Long enough to reach where it was thrown at, and a little past.
    this.life = Math.max(3.5, d / Math.max(speed, 0.1) + 2.0);
    this.channel = null;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    return this.life > 0;
  }
}

// The rival guarding a tower floor. It does not attack by touch: it competes with
// the player for the same items and throws what it collects back at them.
export class TowerEnemy {
  constructor(playerPos, difficulty, soundIdx, arena, tower = 1) {
    // Which tower this rival is standing in: the ceilings lift with the tower, so a
    // deeper rival is genuinely worse rather than just longer.
    this.tower = Math.max(1, tower);
    const over = Math.max(0, this.tower - 5);   // how far past the last tower that had headroom
    this.soundIdx = soundIdx;
    this.soundName = 'obstacle_' + soundIdx;
    const [px, py] = playerPos;
    this.x = px >= 0 ? -arena : arena;
    this.y = py >= 0 ? -arena : arena;
    for (let i = 0; i < 500; i++) {
      const angle = uniform(0, 2 * Math.PI);
      const dist = uniform(12.0, arena * 0.95);
      const tx = px + Math.cos(angle) * dist;
      const ty = py + Math.sin(angle) * dist;
      if (tx >= -arena && tx <= arena && ty >= -arena && ty <= arena && Math.hypot(tx - px, ty - py) >= 10.0) {
        this.x = tx; this.y = ty;
        break;
      }
    }
    // Grows with the square root of difficulty, not in step with it: 2 or 3 hits on
    // the first floor, about 21 by tower five.
    this.hitsNeeded = 1 + Math.trunc(1.6 * Math.sqrt(Math.max(1, difficulty)));
    this.hitsTaken = 0;
    // Patrol speed climbs with difficulty; 2.0 lets a floor-one rival reposition, and
    // 8.4 stays short of the player's own pace (9.0) so races stay races.
    this.speed = Math.max(2.0, Math.min(5.5 + 0.4 * over, 8.4, 1.25 + difficulty * 0.055));
    // Empty handed: it has to win a race for every item it throws.
    this.items = 0;
    this.throwCd = Math.max(1.15 - 0.05 * over, 0.70, 4.5 - difficulty * 0.055);
    // Never shorter with depth: the help promises a throw is always dodgeable.
    this.windupLen = 0.85;
    this.throwSpeed = Math.min(22.0, 10.0 + difficulty * 0.3);
    this.cooldown = this.throwCd;
    this.winding = 0.0;
    // A head start for the player on a new floor, to hear where the item is.
    this.notice = 2.5;
    // After releasing a throw it cannot immediately snatch the next item.
    this.recover = 0.0;
    // Capacity: deeper rivals hoard more items and unleash them in one burst.
    this.capacity = 1 + Math.max(0, Math.min(4 + over, 9, Math.floor((difficulty - 30) / 20)));
    // What the tower itself allows; lingering can raise capacity above this.
    this.baseCapacity = this.capacity;
    this.floorTime = 0.0;
    this.sinceThrow = 0.0;
    // How many go out on ONE wind-up (distinct from capacity, how many it may hoard).
    this.volley = 1 + Math.max(0, Math.min(2, Math.floor((difficulty - 30) / 45)));
    this.volleySize = 0;
    // Set when this wind-up is emptying the whole stockpile.
    this.dumping = false;
    // Gap between items inside a burst: only enough for the ear to count them.
    this.burstGap = 0.08;
    this.pending = 0;
    this.shotTimer = 0.0;
    // Where the player stood when the wind-up began; every item of a burst is
    // committed to that spot, fanned out round it (see volleySpread).
    this.aim = null;
    // The rival watches the player stockpile: every pickup on this floor makes it
    // quicker and throw more often, up to a ceiling; it resets on the next floor.
    this.baseSpeed = this.speed;
    this.baseThrowCd = this.throwCd;
    this.alert = 0;
    this.alertCap = Math.max(8, Math.floor(this.hitsNeeded / 2));
    // Which way it circles the player, and when it next switches.
    this.orbit = choice([-1.0, 1.0]);
    this.orbitTimer = uniform(2.5, 5.0);
    this.channel = null;
  }

  registerPlayerPickup() {
    if (this.alert >= this.alertCap) return;
    this.alert += 1;
    // Alertness only ever makes the rival quicker.
    this.speed = Math.max(this.baseSpeed, Math.min(8.8, this.baseSpeed * Math.pow(1.09, this.alert)));
    this.throwCd = Math.min(this.baseThrowCd, Math.max(0.9, this.baseThrowCd * Math.pow(0.93, this.alert)));
    // (Never touches this.channel: escalation is a movement and timing change only.)
  }

  // True once lingering has raised what it can hold above the tower's own.
  get hoarding() { return this.capacity > this.baseCapacity; }

  update(playerPos, itemPos, arena, dt) {
    // Time on this floor, and time since its last throw. See TOWER_LINGER_STEP.
    this.floorTime += dt;
    this.sinceThrow += dt;
    const extra = Math.trunc(Math.floor(this.floorTime / TOWER_LINGER_STEP));
    this.capacity = Math.min(this.baseCapacity + extra, Math.max(TOWER_LINGER_MAX, this.baseCapacity));
    if (this.notice > 0) this.notice -= dt;
    if (this.recover > 0) this.recover -= dt;

    // It never charges the player. Empty handed it races them for the item on the
    // floor; holding something it keeps its distance and lines up a throw.
    const seeking = (this.items < this.capacity && itemPos !== null
      && this.notice <= 0 && this.recover <= 0 && this.winding <= 0 && this.pending <= 0);
    let tx; let ty;
    if (seeking) {
      [tx, ty] = itemPos;
    } else {
      const dx = this.x - playerPos[0];
      const dy = this.y - playerPos[1];
      const d = Math.hypot(dx, dy) || 1.0;
      this.orbitTimer -= dt;
      if (this.orbitTimer <= 0) {
        this.orbit = -this.orbit;
        this.orbitTimer = uniform(2.5, 5.0);
      }
      // A radial move blended with a lateral one, then normalised.
      const ux = dx / d; const uy = dy / d;   // points from player toward rival
      const sx = -uy; const sy = ux;          // tangent, straight around the player
      let rad; let lat;
      if (d < 14.0) { rad = 1.0; lat = 0.35; }          // too close: back off, curving
      else if (d > 24.0) { rad = -1.0; lat = 0.35; }    // too far: close in, curving
      else { rad = 0.0; lat = 1.0; }                     // in range: circle
      const mvx = ux * rad + sx * this.orbit * lat;
      const mvy = uy * rad + sy * this.orbit * lat;
      const mlen = Math.hypot(mvx, mvy) || 1.0;
      tx = this.x + (mvx / mlen) * 10.0;
      ty = this.y + (mvy / mlen) * 10.0;
    }
    // It lunges when contesting an item, so a race is genuinely losable.
    const pace = this.speed * (seeking ? 2.2 : 1.0);
    const mx = tx - this.x; const my = ty - this.y;
    const md = Math.hypot(mx, my);
    if (md > 0.4) {
      this.x += (mx / md) * pace * dt;
      this.y += (my / md) * pace * dt;
    }
    this.x = Math.max(-arena, Math.min(arena, this.x));
    this.y = Math.max(-arena, Math.min(arena, this.y));
    return Math.hypot(playerPos[0] - this.x, playerPos[1] - this.y);
  }
}

// Angular offsets, in radians, for the items in one volley. Nine degrees between
// items: a fan is escapable but a flinch is not enough. Wider dumps get a tighter
// angle so the fan stays a thing you outrun.
export function volleySpread(count) {
  if (count <= 1) return [0.0];
  const step = radians(count <= 3 ? 9.0 : Math.max(3.2, 27.0 / count));
  const mid = (count - 1) / 2.0;
  return [...Array(count).keys()].map((i) => (i - mid) * step);
}

// ------------------------------------------------------------------ the game's tower methods
const mixin = {
  // A random drone for a new tower floor - never the one just played, so the air
  // changing still means you have moved on (the desktop's _pick_amb('tower')). The
  // one after it is picked at the same moment and decoded ahead, as game.js does
  // for its own banks. A drone the chaos elevator already chose is used instead.
  _towerPrepareUpcoming(current) {
    const n = TOWER_DRONES.length;
    const idx = choice([...Array(n).keys()].filter((i) => i !== current));
    this.upcoming.tower = idx;
    this.audio.prepare(TOWER_DRONES[idx], 'next:tower');
  },

  _towerPickAmb() {
    const pending = this.ambPending || {};
    if ('tower' in pending) { const i = pending.tower; delete pending.tower; return i; }
    const last = this.ambLast.tower;
    let idx = this.upcoming.tower;
    if (idx === undefined || idx === last) idx = choice([...Array(TOWER_DRONES.length).keys()].filter((i) => i !== last));
    this.ambLast.tower = idx;
    this._towerPrepareUpcoming(idx);
    return idx;
  },

  startTower() {
    this.state = STATE;
    this._syncRoom();
    this.resetGameState();
    this.state = STATE;
    this._wake(true);

    if (this.ambienceChannel) this.ambienceChannel.stop();
    if (this.beatChannel) this.beatChannel.stop();

    // Roomier than a duelling pit - the player has to cross it to fetch items.
    this.arenaLimit = 35.0;
    this.towerNumber = 1;
    this.towerHeight = randint(TOWER_FLOORS_MIN, TOWER_FLOORS_MAX);
    this.towerFloor = 1;
    // No clock at all: attrition is the whole fail condition.
    this.towerHp = this.towerMaxHp;
    this.towerItems = 2;
    this.level = 0;  // tower score counts floors actually COMPLETED

    this.tts.speak('Tower Mode.', { interrupt: true });
    this._setupTowerFloor();
  },

  _setupTowerFloor() {
    // The old floor's air fades out under the new floor's: taken out of the
    // registry first, so stopping the floor's loops does not cut it.
    const oldAir = this.towerLoops.ambience || null;
    delete this.towerLoops.ambience;
    if (oldAir) oldAir.fadeout(AMBIENCE_CROSSFADE * 1000);
    this._towerStopLoops();
    if (this.towerEnemy && this.towerEnemy.channel) this.towerEnemy.channel.stop();
    this.towerEnemy = null;
    if (this.towerStairsChannel) {
      this.towerStairsChannel.stop();
      this.towerStairsChannel = null;
    }
    this.towerStairsActive = false;
    if (this.towerItem && this.towerItem.channel) this.towerItem.channel.stop();
    this.towerItem = null;
    if (this.towerPotion && this.towerPotion.channel) this.towerPotion.channel.stop();
    this.towerPotion = null;
    this._towerClearProjectiles();
    if (this.ambienceChannel && this.ambienceChannel !== oldAir) this.ambienceChannel.stop();

    // Its own drones, so no floor sounds like a battle.
    const ambIdx = this._towerPickAmb();
    const adopt = this.chaosAdopt;
    this.chaosAdopt = null;
    if (adopt && adopt[0] === towerAmb(ambIdx)) {
      // The elevator ride up out of an island already faded this floor's air in.
      this.ambienceChannel = adopt[1];
      this.towerLoops.ambience = adopt[1];
    } else {
      this.ambienceChannel = this._towerLoop('ambience', towerAmb(ambIdx), 0.8, AMBIENCE_CROSSFADE * 1000);
    }

    this.playerPos = [0.0, 0.0];
    this.playerFacing = [0, -1];
    // Health and items deliberately PERSIST between floors. Nothing restores them
    // except a health potion.
    this.towerHitCooldown = 0.0;
    this.towerLowWarned = false;

    const enemy = new TowerEnemy(this.playerPos, this._towerDifficulty(), randint(0, 9), this.arenaLimit, this.towerNumber);
    enemy.channel = this._towerLoop('rival', enemy.soundName);
    this.towerEnemy = enemy;
    this._towerSpawnItem();

    // Each new floor is announced in tower mode itself, but not in chaos.
    if (!this.chaosMode) this.tts.speak(`Floor ${this.towerFloor} of ${this.towerHeight}.`, { interrupt: false });
  },

  updateTowerMode(dt) {
    if (this.isPaused) return;
    // Chaos runs one clock across every kind of level.
    if (this.chaosMode && this._advanceTimer(dt)) return;
    if (this.chaosMode && this.timeCredit) this._updateTimeCredit();

    // Brief grace period after being struck, so hits can never chain.
    if (this.towerHitCooldown > 0) this.towerHitCooldown -= dt;

    const enemy = this.towerEnemy;
    if (enemy) {
      const itemPos = this.towerItem ? [this.towerItem.x, this.towerItem.y] : null;
      enemy.update(this.playerPos, itemPos, this.arenaLimit, dt);
      const [left, right] = this._towerBeaconLevels([enemy.x, enemy.y]);
      // Re-pan through the loop registry: the authoritative handle on what loops.
      const rivalCh = this.towerLoops.rival || enemy.channel;
      if (rivalCh) rivalCh.setVolume(left, right, this._behind([enemy.x, enemy.y]));
      // The race for the floor's single item. Whoever arrives first takes it.
      if (this.towerItem && enemy.items < enemy.capacity && enemy.winding <= 0
          && enemy.recover <= 0 && enemy.notice <= 0 && enemy.pending <= 0) {
        // 1.2 rather than the player's 3.0: the rival has to arrive at the item.
        if (Math.hypot(this.towerItem.x - enemy.x, this.towerItem.y - enemy.y) < 1.2) {
          enemy.items += 1;
          // A hoarder that is still winning races keeps on hoarding.
          enemy.sinceThrow = 0.0;
          const gx = this.towerItem.x; const gy = this.towerItem.y;
          this._towerStopLoop('item');
          this.towerItem = null;
          // Panned at the spot it was taken from.
          const [gl, gr] = this._towerBeaconLevels([gx, gy]);
          const gch = this.audio.play('enemy_grab');
          if (gch) gch.setVolume(gl, gr, this._behind([gx, gy]));
          this._towerSpawnItem();
        }
      }
      // Wind up, then release. The wind-up is the player's cue to move.
      if (enemy.winding > 0) {
        enemy.winding -= dt;
        if (enemy.winding <= 0) {
          // One wind-up releases one volley, not the whole stockpile.
          enemy.pending = Math.max(1, Math.min(enemy.volleySize, enemy.items));
          enemy.shotTimer = 0.0;
        }
      } else if (enemy.pending > 0) {
        enemy.shotTimer -= dt;
        if (enemy.shotTimer <= 0) {
          enemy.items -= 1;
          enemy.pending -= 1;
          // Every item is committed to where the player stood when the wind-up
          // began, rotated off that line by its place in the fan.
          let target = enemy.aim !== null ? enemy.aim : [...this.playerPos];
          const total = Math.max(1, enemy.volleySize);
          const offsets = volleySpread(total);
          const idx = Math.min(offsets.length - 1, total - 1 - enemy.pending);
          const ang = offsets[idx];
          const tdx = target[0] - enemy.x; const tdy = target[1] - enemy.y;
          const ca = Math.cos(ang); const sa = Math.sin(ang);
          target = [enemy.x + tdx * ca - tdy * sa, enemy.y + tdx * sa + tdy * ca];
          const shot = new TowerProjectile(enemy.x, enemy.y, target, enemy.throwSpeed);
          // The throw itself: the same sound as the player's own, from the rival.
          const tch = this.audio.play('item_throw', { at: [enemy.x, enemy.y] });
          if (tch) tch.setVolume(left, right);
          // Then the item buzzes as it flies, until it has passed you.
          shot.channel = this.audio.play('item_buzz', { loops: -1, volume: 0.0 });
          this.towerProjectiles.push(shot);
          enemy.shotTimer = enemy.burstGap;
          if (enemy.pending <= 0) {
            // Surviving a dump earns real breathing room.
            const wasDump = enemy.dumping;
            enemy.aim = null;
            enemy.volleySize = 0;
            enemy.dumping = false;
            enemy.cooldown = enemy.throwCd * (wasDump ? 2.2 : 1.0);
            enemy.recover = wasDump ? 2.6 : 1.2;
            enemy.sinceThrow = 0.0;
          }
        }
      } else if (enemy.items > 0 && enemy.hoarding && enemy.items < enemy.capacity
          && enemy.sinceThrow < TOWER_HOARD_PATIENCE) {
        // Hoarding: it holds what it has and goes on racing you for more.
      } else if (enemy.items > 0) {
        enemy.cooldown -= dt;
        if (enemy.hoarding) enemy.cooldown = 0.0;
        if (enemy.cooldown <= 0) {
          // A rival that has filled its arms throws the lot.
          enemy.dumping = ((enemy.capacity > 1 && enemy.items >= enemy.capacity)
            || (enemy.hoarding && enemy.items > 1));
          // A dump gets a much longer wind-up.
          enemy.winding = enemy.windupLen * (enemy.dumping ? 1.9 : 1.0);
          if (enemy.dumping) enemy.winding = Math.max(0.9, enemy.winding);
          // The WHOLE volley commits to this spot.
          enemy.aim = [...this.playerPos];
          enemy.volleySize = enemy.dumping ? enemy.items : Math.min(enemy.volley, enemy.items);
          // The warning states the size of what is coming.
          let name;
          if (enemy.dumping && enemy.volleySize >= 3) name = 'enemy_windup_full';
          else if (enemy.volleySize <= 1) name = 'enemy_windup';
          else name = `enemy_windup_${Math.min(3, enemy.volleySize)}`;
          const ch = this.audio.play(name);
          if (ch) ch.setVolume(left, right, this._behind([enemy.x, enemy.y]));
        }
      }
    }

    // Thrown items in flight. They travel to where the player WAS.
    for (const shot of [...this.towerProjectiles]) {
      const was = [shot.x, shot.y];
      const alive = shot.update(dt);
      const lv = this._towerBeaconLevels([shot.x, shot.y]);
      const pl = lv[0]; const pr = lv[1];
      // Judged along the whole way it flew this frame.
      const pd = Math.min(lv[2], pointToSegment(this.playerPos[0], this.playerPos[1], was, [shot.x, shot.y]));
      // The flight buzz follows the item, and stops for good once it is past you.
      if (shot.channel) {
        const rx = this.playerPos[0] - shot.x; const ry = this.playerPos[1] - shot.y;
        if (rx * shot.vx + ry * shot.vy < 0) {
          shot.channel.stop();
          shot.channel = null;
        } else {
          shot.channel.setVolume(pl * TOWER_BUZZ_GAIN, pr * TOWER_BUZZ_GAIN, this._behind([shot.x, shot.y]));
        }
      }
      const hit = pd < 2.2 && this.towerHitCooldown <= 0;
      const atWall = Math.abs(shot.x) > this.arenaLimit + 0.5 || Math.abs(shot.y) > this.arenaLimit + 0.5;
      const spent = !alive;
      if (hit || atWall || spent) {
        if (shot.channel) shot.channel.stop();
        this.towerProjectiles.splice(this.towerProjectiles.indexOf(shot), 1);
        if (hit) {
          this.towerHp -= this._towerHitDamage();
          this.towerHitCooldown = 1.0;
          this.audio.play('player_hit');
          if (this.towerHp <= 0) {
            this.towerHp = 0;
            this._towerDefeat();
            return;
          }
          const low = Math.max(35, 2 * this._towerHitDamage());
          if (this.towerHp <= low && !this.towerLowWarned) {
            this.towerLowWarned = true;
            this.audio.play('health_low');
            if (!this.chaosMode) this.tts.speak(`Health low. ${this.towerHp}.`, { interrupt: true });
          }
        }
      }
    }

    if (this.towerItem) {
      const [left, right, dist] = this._towerBeaconLevels([this.towerItem.x, this.towerItem.y]);
      if (this.towerItem.channel) this.towerItem.channel.setVolume(left, right, this._behind([this.towerItem.x, this.towerItem.y]));
      if (dist < 3.0) {
        this.towerItems += 1;
        this.audio.play('ammo');
        this._towerStopLoop('item');
        this.towerItem = null;
        // A fresh item always appears while the enemy lives, but the rival notices
        // the stockpiling and presses harder each time.
        if (this.towerEnemy) {
          this.towerEnemy.registerPlayerPickup();
          this._towerSpawnItem();
        }
      }
    }

    if (this.towerPotion) {
      const [left, right, dist] = this._towerBeaconLevels([this.towerPotion.x, this.towerPotion.y]);
      if (this.towerPotion.channel) this.towerPotion.channel.setVolume(left, right, this._behind([this.towerPotion.x, this.towerPotion.y]));
      if (dist < 3.0) {
        this.towerHp = this.towerMaxHp;
        this.towerLowWarned = false;
        this._towerStopLoop('potion');
        this.towerPotion = null;
        this.audio.play('potion_drink');
      }
    }

    this._towerProximityBeep();

    if (this.towerStairsActive) {
      const [left, right, dist] = this._towerBeaconLevels(this.towerStairsPos);
      if (this.towerStairsChannel) this.towerStairsChannel.setVolume(left, right, this._behind(this.towerStairsPos));
      if (dist < 3.0) this._towerNextFloor();
    }
  },

  // Volume spans exactly the arena's corner-to-corner distance: 1.0 underfoot down
  // to 0.2 far away.
  _towerBeaconLevels(target) {
    const dx = target[0] - this.playerPos[0];
    const dy = target[1] - this.playerPos[1];
    const dist = Math.hypot(dx, dy);
    const span = this.arenaLimit * 2.84;  // corner to corner
    const vol = 1.0 - 0.8 * Math.min(1.0, dist / span);
    const pan = dist > 0 ? dx / dist : 0.0;
    return [vol * (1.0 - Math.max(0.0, pan)), vol * (1.0 - Math.max(0.0, -pan)), dist];
  },

  // A beep that rises in pitch and quickens on approach, for the two things that
  // are hard to home in on: the item while the rival lives, and a health potion.
  // The staircase deliberately gets none.
  _towerProximityBeep() {
    let target;
    if (this.towerPotion) target = [this.towerPotion.x, this.towerPotion.y];
    else if (this.towerItem) target = [this.towerItem.x, this.towerItem.y];
    else return;
    const [left, right, dist] = this._towerBeaconLevels(target);
    const interval = Math.max(0.14, Math.min(1.2, dist * 0.035));
    const now = performance.now() / 1000;
    if (now - this.towerBeepTime > interval) {
      const pitchIdx = Math.max(0, Math.min(19, 19 - Math.trunc(dist / 3.0)));
      const chan = this.audio.play(`prox_${pitchIdx}`);
      if (chan) chan.setVolume(left * 0.45, right * 0.45, this._behind(target));
      this.towerBeepTime = now;
    }
  },

  // Damage one thrown item does. Also decides when a potion may appear. It creeps
  // two points per tower past the fifth, so deep in a climb two hits finish a run.
  _towerHitDamage() {
    const base = Math.min(40, 12 + Math.floor(this._towerDifficulty() / 4) * 3);
    return Math.min(55, base + 2 * Math.max(0, this.towerNumber - 5));
  },

  // Difficulty for the current floor. Each tower ends at exactly double the
  // difficulty the previous one ended at (10, 20, 40, 80, 160 ...), driven by how
  // far THROUGH the tower you are, whatever its height.
  _towerDifficulty() {
    const n = this.towerNumber;
    const h = Math.max(1, this.towerHeight);
    const progress = Math.min(1.0, this.towerFloor / h);
    const prevEnd = n <= 1 ? 0 : 10 * (2 ** (n - 2));
    const thisEnd = 10 * (2 ** (n - 1));
    return Math.max(1, Math.trunc(pyRound(prevEnd + progress * (thisEnd - prevEnd))));
  },

  // Every looping sound tower mode starts is registered under a tag, so it can
  // always be stopped by name. Re-using a tag stops the previous holder first.
  // (The desktop also remembers each tag's sound, so a pygame channel since handed
  // to another sound is never stopped by a stale handle. A Voice here is never
  // reused, so stopping it is always safe.)
  _towerLoop(tag, name, volume = 1.0, fadeMs = 0) {
    this._towerStopLoop(tag);
    const ch = this.audio.play(name, { loops: -1, volume, fadeMs });
    if (ch) this.towerLoops[tag] = ch;
    return ch;
  },

  _towerStopLoop(tag) {
    const ch = (this.towerLoops || {})[tag];
    if (this.towerLoops) delete this.towerLoops[tag];
    if (ch) ch.stop();
  },

  _towerStopLoops() {
    for (const ch of Object.values(this.towerLoops || {})) ch.stop();
    this.towerLoops = {};
  },

  _towerClearProjectiles() {
    for (const shot of this.towerProjectiles || []) if (shot.channel) shot.channel.stop();
    if (this.towerProjectiles) this.towerProjectiles.length = 0;
  },

  _towerSpawnItem() {
    if (this.towerItem && this.towerItem.channel) this.towerItem.channel.stop();
    const enemy = this.towerEnemy;
    let item = null;
    if (enemy) {
      // Place the item so the race is nearly even.
      const rivalPace = enemy.speed * 2.2;
      let best = null;
      for (let i = 0; i < 80; i++) {
        const cand = new TowerItem(this.playerPos, this.arenaLimit);
        const rD = Math.hypot(cand.x - enemy.x, cand.y - enemy.y);
        if (rD < 12.0) continue;   // never drop the resupply at the rival's feet
        const pT = Math.hypot(cand.x - this.playerPos[0], cand.y - this.playerPos[1]) / TOWER_PLAYER_PACE;
        const rT = rD / rivalPace;
        // 1.45: the time it takes to hear the beacon and resolve its direction.
        const score = Math.abs(rT - pT * 1.45);
        if (best === null || score < best[0]) best = [score, cand];
      }
      item = best ? best[1] : null;
    }
    if (item === null) item = new TowerItem(this.playerPos, this.arenaLimit);
    item.channel = this._towerLoop('item', 'item_beacon');
    this.towerItem = item;
  },

  throwTowerItem() {
    // The floor is won - nothing left to throw at, climb.
    if (this.towerStairsActive) {
      this.audio.play('empty_click');
      return;
    }
    const enemy = this.towerEnemy;
    if (!enemy) return;
    if (this.towerItems <= 0) {
      // No words: the empty click says it.
      this.audio.play('empty_click');
      return;
    }
    const dx = enemy.x - this.playerPos[0];
    const dy = enemy.y - this.playerPos[1];
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;   // the very same spot: nothing thrown, nothing spent
    this.towerItems -= 1;
    this.audio.play('item_throw');
    // The same aiming rule, and the same band, as battle mode.
    const pan = dx / dist;
    if (Math.abs(pan) < BATTLE_AIM_PAN) {
      enemy.hitsTaken += 1;
      if (enemy.hitsTaken >= enemy.hitsNeeded) {
        // By tag, so the rival's loop can never outlive it.
        this._towerStopLoop('rival');
        enemy.channel = null;
        this.towerEnemy = null;
        this._towerStopLoop('item');
        this.towerItem = null;
        this._towerClearProjectiles();
        this._later(Math.min(0.5, dist * 0.015), 'explosion', [enemy.x, enemy.y]);
        this._towerSpawnStairs();
      } else {
        // No speech - the impact sound says it landed.
        this._later(Math.min(0.4, dist * 0.012), 'enemy_hit', [enemy.x, enemy.y]);
      }
    }
  },

  _towerSpawnStairs() {
    this.towerStairsActive = true;
    const a = this.arenaLimit;
    let sx = this.playerPos[0] >= 0 ? -a : a;
    let sy = this.playerPos[1] >= 0 ? -a : a;
    for (let i = 0; i < 300; i++) {
      const tx = uniform(-a, a);
      const ty = uniform(-a, a);
      if (Math.hypot(tx - this.playerPos[0], ty - this.playerPos[1]) >= a * 0.8) { sx = tx; sy = ty; break; }
    }
    // Offered within two hits of the end, AND at least one hit down already.
    const dmg = this._towerHitDamage();
    if (this.towerHp <= Math.min(2 * dmg, this.towerMaxHp - dmg) && rand() < 0.30) {
      const potion = new TowerItem(this.playerPos, a, a * 0.8);
      potion.channel = this._towerLoop('potion', 'potion_beacon');
      this.towerPotion = potion;
    }
    this.towerStairsPos = [sx, sy];
    // No announcement: the explosion and the rising stair signal carry it.
    this.towerStairsChannel = this._towerLoop('stairs', 'stairs_beacon');
  },

  _towerNextFloor() {
    this._towerStopLoop('stairs');
    this.towerStairsChannel = null;
    this.towerStairsActive = false;
    let climb = null;
    if (this.chaosMode) {
      // In chaos, what comes next is chosen here, on the stairs: the climb is only
      // heard when it leads up to another tower floor.
      this.chaosNext = this._chaosPickNext();
      if (this.chaosNext === STATE) climb = this.audio.play('stairs_climb');
    } else {
      this.audio.play('stairs_climb');
    }
    if (!this.chaosMode) this.level += 1;  // total floors climbed - this is the tower score

    if (this.towerFloor >= this.towerHeight) {
      const completed = this.towerNumber;
      this.towerNumber += 1;
      this.towerHeight = randint(TOWER_FLOORS_MIN, TOWER_FLOORS_MAX);
      this.towerFloor = 1;
      // Enough items to bring down roughly two of the rivals on the tower being
      // entered; no cap, so it doubles with the difficulty.
      const reward = 2 * (1 + Math.trunc(1.6 * Math.sqrt(Math.max(1, this._towerDifficulty()))));
      this.towerItems += reward;
      this.audio.play('ammo');
      if (!this.chaosMode) this.tts.speak(`Tower ${completed} complete. ${reward} bonus items.`, { interrupt: true });
    } else {
      this.towerFloor += 1;
    }

    if (this.chaosMode) {
      // One floor is one chaos level. The next floor waits for the climb.
      this.nextLevel();
      if (this.state === STATE_CHAOS_GAP && climb) {
        const e = this.audio.entries.get('stairs_climb');
        const length = e && e.dry ? e.dry.frames / 44100 : CHAOS_CLIMB_TIME;
        this.chaosGap = Math.max(this.chaosGap, Math.min(CHAOS_CLIMB_TIME_MAX, length));
        this.chaosClimb = climb;
      }
      return;
    }
    this._setupTowerFloor();
  },

  _towerDefeat() {
    if (this.towerEnemy && this.towerEnemy.channel) this.towerEnemy.channel.stop();
    this.towerEnemy = null;
    if (this.towerStairsChannel) {
      this.towerStairsChannel.stop();
      this.towerStairsChannel = null;
    }
    this.towerStairsActive = false;
    if (this.towerItem && this.towerItem.channel) this.towerItem.channel.stop();
    this.towerItem = null;
    if (this.towerPotion && this.towerPotion.channel) this.towerPotion.channel.stop();
    this.towerPotion = null;
    this._towerClearProjectiles();
    this._towerStopLoops();
    // One life: a defeat ends the run outright.
    this.triggerGameOver();
  },
};

// The desktop's reset_game_state, tower lines: stop what is still looping before
// the references are dropped, then set everything back.
function reset(game) {
  for (const holder of [game.towerEnemy, game.towerItem, game.towerPotion]) {
    if (holder && holder.channel) holder.channel.stop();
  }
  if (game.towerStairsChannel) game.towerStairsChannel.stop();
  game._towerStopLoops();
  for (const shot of game.towerProjectiles || []) if (shot.channel) shot.channel.stop();
  game.towerNumber = 1;
  game.towerFloor = 1;
  game.towerHeight = 0;
  game.towerMaxHp = 100;
  game.towerHp = 100;
  game.towerHitCooldown = 0.0;
  game.towerLowWarned = false;
  game.towerItems = 2;
  game.towerItem = null;
  game.towerPotion = null;
  game.towerProjectiles = [];
  game.towerLoops = {};
  game.towerBeepTime = 0.0;
  game.towerEnemy = null;
  game.towerStairsActive = false;
  game.towerStairsPos = [0.0, 0.0];
  game.towerStairsChannel = null;
}

// Everything the tower owns, stopped and forgotten (the tower lines of the
// desktop's trigger_game_over and of quitting to the menu).
function stopAll(game) {
  if (game.towerEnemy && game.towerEnemy.channel) game.towerEnemy.channel.stop();
  if (game.towerStairsChannel) game.towerStairsChannel.stop();
  if (game.towerItem && game.towerItem.channel) game.towerItem.channel.stop();
  if (game.towerPotion && game.towerPotion.channel) game.towerPotion.channel.stop();
  for (const shot of game.towerProjectiles || []) if (shot.channel) shot.channel.stop();
  game._towerStopLoops();
  game.towerProjectiles = [];
  game.towerStairsChannel = null;
  game.towerStairsActive = false;
  game.towerEnemy = game.towerItem = game.towerPotion = null;
}

function input(game, g) {
  // Any mode that runs a clock answers T: in the tower only a chaos floor does.
  if (g === 'clock') {
    if (game.chaosMode) {
      const secs = Math.trunc(game.timeLeft);
      game.tts.speak(`${secs} second${secs === 1 ? '' : 's'} remaining.`, { interrupt: true });
    }
    return;
  }
  // A double tap reports and two fingers throw, the same as every mode that attacks.
  if (g === 'enter') {
    // Chaos never says level numbers, so no floor there.
    const bits = (game.chaosMode ? [] : [`Floor ${game.towerFloor} of ${game.towerHeight}`]).concat([
      `${game.towerHp} health`,
      `${game.towerItems} item` + (game.towerItems === 1 ? '' : 's')]);
    if (game.towerEnemy) bits.push(`${game.towerEnemy.hitsNeeded - game.towerEnemy.hitsTaken} to go`);
    report(game, bits.join(', ') + '.');
    return;
  }
  if (g === 'space') { game.throwTowerItem(); return; }
  let [nx, ny] = game.playerPos;
  const step = 3.0;
  if (g === 'up') { ny -= step; game.playerFacing = [0, -1]; }
  else if (g === 'down') { ny += step; game.playerFacing = [0, 1]; }
  else if (g === 'left') { nx -= step; game.playerFacing = [-1, 0]; }
  else if (g === 'right') { nx += step; game.playerFacing = [1, 0]; }
  else return;
  const lim = game.arenaLimit;
  if (nx >= -lim && nx <= lim && ny >= -lim && ny <= lim) {
    game.playerPos = [nx, ny];
    game._playStep();
  } else {
    game.audio.play('boundary');
  }
}

// ------------------------------------------------------------------ help
// The desktop's help for the tower, with keys turned into gestures.
const HELP_SECTIONS = [
  ['Tower Mode', [
    { title: 'Tower Mode', sound: null, desc: 'Climb a tower one floor at a time. A single rival guards each floor and the stairs only appear once you have destroyed it. Every tower is between three and ten floors, so a tower is a short sharp run rather than a long haul, and a double tap tells you which floor you are on and how tall the tower is. Each new floor is announced as you reach it, for example floor 2 of 5, and finishing a tower is announced with the bonus items it gave you, for example tower 1 complete, 12 bonus items. Reaching the top hands you a stock of bonus items and starts the next tower, which is twice as hard as the one you just finished. Tower one is the gentlest stretch in the game and is your run-up before that doubling starts. There is no clock anywhere in this mode. When your health first drops low on a floor you hear three quick falling low notes and then Health low with the number you have left, and finishing a tower is marked by the bonus chime before it is announced. Your score is the total floors climbed.' },
    { title: 'Tower The Rival', sound: null, desc: 'The rival never charges you and never hurts you by touching you. It wants exactly what you want: the item lying on the floor. It begins every floor holding nothing, so it has to win a race before it can throw anything, and items are placed so those races are close. You get a couple of seconds at the start of each floor before it will contest anything, which is your window to hear where the item is and start moving. Use it, because once that grace is gone it sprints. It also cannot snatch an item while it is winding up, nor for a moment after it has thrown, so every throw it makes hands you a genuine chance at the next one. Once it is holding something it backs off to throwing range and starts hurling items at you. Every item it takes is both a throw it gains and a throw you lose.' },
    { title: 'Tower Winding Up The Rival', sound: null, desc: 'The rival watches you collect. Every item you pick up on a floor makes it move faster and throw more often, and it keeps ramping to a ceiling set by how long that floor is, so on a long floor it always has somewhere left to go. A fresh rival on the next floor starts calm again. This is why you cannot simply farm a floor for supplies: the longer you spend gathering, the faster the thing you still have to bring down becomes, until it is quicker than you and starts winning every race itself. There is no cap on what you may carry, so stockpiling is allowed, it just gets more dangerous the longer you do it. Lingering has a second cost, on every tower, tower one included: for every thirty seconds you stay on a floor without destroying the rival, it can hold one more item, up to five. While it is hoarding it keeps what it takes and goes on racing you for more, and when its arms are full it throws them all at once: a dump of three or more comes behind the long, low wind-up of a full dump, and one of two behind the ordinary two beats. If you keep beating it to the items so it stops gaining any, it throws whatever it holds twelve seconds after the last one it took. The wind-up never gets shorter however alert it becomes, so throws stay dodgeable to the end.' },
    { title: 'Tower Incoming Throws', sound: null, desc: 'The wind-up is your only warning, and it is quite literally the sound of a throw played backwards, swelling up and cutting off at the moment of release. Count its beats: one beat is one item, two or three beats mean a fan of that many arriving together. Move the instant you hear it. The throw is committed to the spot you were standing when the wind-up started, so a single step to either side takes you off its line before it is even released. Once it is thrown, the item buzzes as it flies, and you can hear the buzz move across the room toward you. If you stepped aside, the buzz goes past you and stops the moment the item is by, so that is how a miss sounds. If it hits you, you hear the hit instead. Step sideways to dodge, never backwards: the item keeps going in a straight line past where you were and it travels faster than you run, so retreating along its path is the one move that guarantees it catches you.' },
    { title: 'Tower Bursts', sound: null, desc: 'Deep in a climb the rival stops throwing one item at a time. It hoards a stockpile and throws two or three at once in a fan, then goes straight back to hunting while still carrying the rest. This is the hardest thing in the mode. Listen to the wind-up, because it tells you how many are coming while you still have time to act. One beat is a single item; two or three beats mean a fan of that many, spreading apart as it crosses the floor. The whole fan is committed to the spot you were standing when the wind-up began, exactly like a single throw, so leaving that spot still beats all of it. What changes is how far you have to go. One item is beaten by one step. A fan of three spreads as it flies, about six units across from throwing range and more from far off, so it takes two or three steps, and you must commit to them rather than flinching. Move in one direction and keep going until you have heard the last item pass.' },
    { title: 'Tower The Full Dump', sound: null, desc: 'Learn this one before you need it. It is longer and lower than any other wind-up, with a fast run of beats and a drone underneath, and it means the rival is throwing everything it has at once. It happens for one reason: you let it fill its arms. Every item in that stockpile is a race you did not contest. Up to five items on the early towers, and as many as ten deep in a climb, leave together in a wide fan, committed to where you were standing when the wind-up began, so leaving that spot still beats all of it, but a fan that wide needs three full steps and you must commit the moment you hear it. Do not flinch and do not stop until it is over. Survive one and you get the best moment in the mode: the rival is completely empty and has to win races from nothing before it can threaten you again. That window is yours. Use it to put hits on it.' },
    { title: 'Tower Items', sound: null, desc: 'You do not have a laser here. You throw items, and you have to find them, and so does the rival. A low double knock is the sound of an item lying on the floor, and it carries across the entire floor. Only one item is ever out at a time, and a fresh one appears the moment either of you takes it, so a floor can never become impossible, but you are never collecting in peace either. There is no limit on how many you may carry, so banking a stock on the easier floors is the way to survive the hard ones.' },
    { title: 'Tower Losing The Race', sound: null, desc: 'A short snatch sound means the rival reached the item before you did, and it comes from the exact spot where you lost it, so it tells you where the rival is standing as well as what just happened. When you hear it, that item is gone and a fresh one appears somewhere else. Hearing it repeatedly means the rival is stocking up and you are about to be under heavy fire, so it is often worth abandoning a long trip and contesting the next one instead.' },
    { title: 'Tower Navigation', sound: null, desc: 'Left and right you can hear straight away from the stereo balance. Forward and backward sit in the same place between your ears, but a thing behind you, south of you, sounds duller (see Behind You). On top of that, two things get a locating beep: the item while the rival is alive, and a health potion whenever one has appeared. The beep rises in pitch and repeats faster the closer you get. If you cannot tell whether something is in front or behind, take one step and listen. Faster and higher means you chose correctly, slower and lower means turn around. The staircase has no beep, because its own rising chimes and metal footsteps are already distinct enough to walk toward.' },
    { title: 'Tower Controls', sound: null, desc: 'Tap with two fingers to throw an item at the rival. Double tap at any time for a full status report: your health, how many items you are carrying, and how many more hits the rival needs. Aim the same way as battle mode: move until the rival\'s sound sits centred between both ears, then throw.' },
    { title: 'Tower Health and Items Carry Over', sound: null, desc: 'This is the most important rule in the mode. Your health and your items are never restored between floors and never restored between towers. Whatever you finish a floor with is what you start the next one with. There is no free reset, so an item wasted on a bad throw and health lost to a dodge you did not make are gone for the rest of the climb. Only a health potion restores anything.' },
    { title: 'Tower Health Potions', sound: null, desc: 'A shimmering chime is a health potion, and it restores your health completely. Two things have to be true for one to appear. You must have just destroyed a floor\'s rival, and you must be hurt enough to be within two hits of the end. That second test is measured against how hard the rival on that floor hits rather than against a fixed number, so it keeps meaning the same thing as you climb. A potion will never turn up while you are healthy, so do not count on one rescuing you later. When you do qualify, it shows up on roughly one cleared floor in three. It is always placed far away from you but you can hear it from anywhere, and it is the one thing the locating beep will lead you to once a floor is clear. With no clock running you can always afford the walk, so take every one you find.' },
    { title: 'Tower Stairs', sound: null, desc: 'Learn this signal, because the game will not tell you out loud. When you destroy a floor\'s rival you hear an explosion, and then a pattern begins repeating: three short chimes rising from low to high, each with a footstep on metal stairs under it, followed by a pause. That repeating rise is the staircase. Walk toward it to climb. It pans left and right and grows louder as you close in, exactly like every other beacon in the game.' },
    { title: 'Tower Difficulty', sound: null, desc: 'Every tower is exactly twice as hard as the one below it. Not a little harder, twice. Difficulty climbs steadily across a tower however tall it happens to be, then doubles again the moment you start the next one, and it never drops back. A short tower is not an easier tower: it finishes at exactly the same difficulty a tall one would, it just gets there in bigger strides, so a three floor tower ramps fast. Tower one is the exception and the only gentle stretch, so use it to learn the sounds. What the doubling buys the rival is pace, not padding. It moves faster, it throws far more often, and from tower four onward it carries several items at once and unloads them on a single wind-up. Deep in a climb it is the stockpile that keeps growing: the rival\'s pace has to stop short of yours or the races would stop being races, but the number of items it can hoard just keeps rising, and it spends them two and three at a time without stopping to refill. The wind-up itself never gets shorter however deep you go, so a throw is always dodgeable and a burst is always beaten by moving and not stopping. Damage reaches forty a hit by tower three, which is three clean hits from full health, and then creeps up, so deep in a climb two hits will finish you. The hits needed to bring a rival down rise too, from a couple on the opening floors to twenty or more deep in a climb with no upper limit, but deliberately far more slowly than everything else.' },
    { title: 'Tower Rewards', sound: null, desc: 'Finishing a tower hands you a stock of bonus items, and the size of that stock is worked out from the tower you are about to walk into. It is always roughly enough to bring down two of the rivals waiting up there, so it doubles right along with the difficulty and there is no cap on it: twelve items after tower one, around thirty after tower four, over a hundred deep in a long run. It is the one moment in the mode where you are handed anything, and the payout scales, so a long climb never leaves you poorer than a short one.' },
    { title: 'Tower Defeat', sound: null, desc: 'If your health reaches zero the run ends immediately. There are no retries and no second chances. Your carried health, your carried items and the health potions are the only safety net you get, which is why dodging well and taking every potion you find both matter so much.' },
  ]],
];

const HELP_DEMOS = [
  ['Demos, Tower Mode', [
    { title: 'Tower Demos', sound: null, desc: 'Every sound tower mode makes, including all four wind-ups. The wind-ups are the ones worth learning cold.' },
    { title: 'Health Low', sound: 'health_low', desc: 'Three quick falling low notes: your health has dropped low on this floor. In tower mode the game then says Health low and how much you have left; in chaos mode nothing is said.' },
    { title: 'Item Beacon', sound: 'item_beacon', desc: 'The low double knock of an item lying on the floor, waiting to be raced for.' },
    { title: 'Throw', sound: 'item_throw', desc: 'An item leaving a hand, yours or the rival\'s.' },
    { title: 'Item In Flight', sound: 'item_buzz', desc: 'The buzz of an item the rival has thrown, flying toward you. It stops once the item has passed you.' },
    { title: 'Losing The Race', sound: 'enemy_grab', desc: 'The snatch that means the rival reached the item first. It comes from where the item was.' },
    { title: 'Hitting The Rival', sound: 'enemy_hit', desc: 'Your throw connected.' },
    { title: 'Wind Up, One Beat', sound: 'enemy_windup', desc: 'One item is coming. One step sideways beats it.' },
    { title: 'Wind Up, Two Beats', sound: 'enemy_windup_2', desc: 'A fan of two. Two steps, and commit to them.' },
    { title: 'Wind Up, Three Beats', sound: 'enemy_windup_3', desc: 'A fan of three, wider again.' },
    { title: 'Wind Up, Full Dump', sound: 'enemy_windup_full', desc: 'Longer and lower, with a fast run of beats and a drone underneath. Everything the rival has, at once. Three full steps.' },
    { title: 'Health Potion Beacon', sound: 'potion_beacon', desc: 'The shimmering chime of a potion waiting on a cleared floor.' },
    { title: 'Drinking A Potion', sound: 'potion_drink', desc: 'Your health going back to full.' },
    { title: 'Stairs Beacon', sound: 'stairs_beacon', desc: 'Three short chimes rising, each with a footstep on metal stairs under it, then a pause, repeating. The staircase.' },
    { title: 'Climbing', sound: 'stairs_climb', desc: 'You reached the stairs and the next floor is starting.' },
  ]],
];

// ------------------------------------------------------------------ the mode
export default {
  menu: [{ key: 'tower', label: 'Tower Mode', select: (game) => game.startTower() }],
  playStates: [STATE],
  mixin,
  init(game) {
    if (game.chaosMode === undefined) game.chaosMode = false;
    game.towerLoops = {};
    game.towerProjectiles = [];
    // The first floor's air, decoded ahead so a climb starts with it at once.
    game._towerPrepareUpcoming(null);
  },
  reset,
  update(game, dt) { game.updateTowerMode(dt); },
  input,
  stopAll,
  finish(game) {
    const n = game.level;
    return { key: 'tower', score: n, message: `Game Over. You climbed ${n} floor${n === 1 ? '' : 's'}. ` };
  },
  room(game, state) { return state === STATE ? 'tower' : null; },
  surroundings(game, pos, room) {
    if (room === 'tower') return game._arenaSurroundings(pos);
    return [1.0, 0.0];
  },
  // The desktop's screen for a tower floor, for sighted helpers.
  status(game) {
    const info = [`Tower ${game.towerNumber} - Floor ${game.towerFloor} of ${game.towerHeight}`,
      `Health: ${game.towerHp} / ${game.towerMaxHp}`, `Items held: ${game.towerItems}`];
    if (game.towerPotion) info.push('HEALTH POTION ON THIS FLOOR');
    info.push(`Floors climbed: ${game.level}`);
    const e = game.towerEnemy;
    if (e) {
      info.push(`Enemy hits remaining: ${e.hitsNeeded - e.hitsTaken}`);
      info.push(`Enemy items held: ${e.items}`);
      if (e.winding > 0) info.push('ENEMY WINDING UP - MOVE');
    }
    if (game.towerProjectiles.length) info.push(`Incoming: ${game.towerProjectiles.length}`);
    else if (game.towerStairsActive) info.push('STAIRS ACTIVE - climb to advance');
    return info.join('. ') + '.';
  },
  boards: [{ key: 'tower', label: 'Tower Mode', fmt: (v) => `${v} ${v === 1 ? 'floor' : 'floors'}` }],
  help: { sections: HELP_SECTIONS, demos: HELP_DEMOS },
};
