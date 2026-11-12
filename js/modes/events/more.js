// The 25 further missions of web 5.0.0 (Windows 3.0.0): a line-by-line port of the
// desktop's event_more.py; more-spec.js is their table of settings (written from the
// desktop's event_more_spec.py). The engine calls this mixin where it calls the blocks:
//
//   _xStart(ev)            after the blocks' things are laid
//   _xUpdate(dt)           every frame; true if the run ended
//   _xFire()               the attack (Space, a two-finger tap); true if the mission used it
//   _xArrow(key)           an arrow or swipe; true if the mission used it (no step is taken)
//   _xOnStep()             a step has landed
//   _xStepRefused(x, y)    true if a step to that spot cannot be taken
//   _xItemTaken(th)        an ordinary item was collected; true if that ended the run
//   _xClosing(reason)      once, as a run ends: a last bonus
//   _xMoves(th, dt)        true if the mission moved a creature itself
//   _xTouchHandled(th)     true if the mission dealt with a creature's touch itself
//   _xStatus(), _xReason(reason), _xResult(), _xStopAll()
//
// A mission's own methods keep the desktop's names (_x_<id>_start and so on) and are
// found by name. Every step is one square (3 units), north is up (y falls going
// north). A square is kept as the text 'i,j'.

import { MORE, REC_DEFAULTS } from './more-spec.js';
import { pyRound } from './schema.js';
import { addMade, fromBuffer, pitch } from './sounds.js';
import { uniform, randint, randrange, choice, random, shuffle } from './py.js';

const STEP = 3.0;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];          // north, east, south, west
const NEAR8 = [];
for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) if (i || j) NEAR8.push([i, j]);
const RED_GRACE = 0.35;            // seconds after the music stops before a step counts against you
const CLICK_GAP = 0.13;            // seconds between a minefield's clicks
const PONG_REACH = 1.9;            // how near the ball's line counts as in it (a square is 3 across)
const SCALE = [0, 2, 4, 7, 9, 12, 9, 7, 4, 2];            // the notes of a path of stones, rising and falling
const CARS_MOST = 10;              // cars sounding at once, whatever the lanes
const MARCH_COUNT_IN = 4;          // beats before the marching is judged
const DANCE_NOTES = [7, 4, 0, -5]; // ahead, right, behind, left
const MAP_WORDS = { '0,-1': 'north', '0,1': 'south', '1,0': 'east', '-1,0': 'west' };

const sq = (x, y) => [pyRound(x / STEP), pyRound(y / STEP)];
const K = (i, j) => i + ',' + j;
const sqKey = (x, y) => K(...sq(x, y));
const s = (n) => (n === 1 ? '' : 's');
const lifeWord = (n) => `${n} li${n === 1 ? 'fe' : 'ves'}`;
const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));

export const MORE_IDS = Object.keys(MORE);
export const X_OWN = MORE_IDS.filter((m) => !MORE[m].items);

const X_REASONS = {
  moved: 'You moved on a red light. ',
  mine: 'You stepped on a mine. ',
  splash: 'You fell in the water. ',
  missed: 'You missed the ball. ',
  rival_end: 'Every one has been taken. ',
  robbed: 'Every treasure is gone. ',
  boss: 'The boss got you. ',
  friend_lost: 'The friend was lost. ',
  gallery_out: 'Too many targets got away. ',
  wrong_one: 'That was not the odd one. ',
  covered: 'You covered them all! ',
  customers_lost: 'Too many customers gave up. ',
  misstep: 'You lost the steps. ',
  tagged_out: 'You were tagged once too often. ',
  run_over: 'You were run over. ',
  out_of_step: 'You fell out of step. ',
  miscount: 'You lost count. ',
  tide: 'The tide caught you. ',
  bitten: 'You stepped on your own tail. ',
  locked_out: 'Too many wrong pads. ',
};

export const MoreMixin = {
  MORE: MORE_IDS,
  X_OWN,

  // ================================================================ helpers
  _xReset() {
    this.xThings = [];          // every looping thing of the mission, to be stopped
    this.xPending = [];         // sounds to come: [when, name, where or null, loudness, tag]
    this.xDone = 0;             // rounds, crossings, hits: what the ending block counts
    this.xLives = 0;
    this.xClosed = false;
    this.xMusic = null;
    this.x = {};                // the mission's own state
  },

  _xIs() { return Boolean(this.ev) && MORE_IDS.includes(this.ev.mission); },

  // A sound setting of the mission: the event's own recording, or the usual
  // recording if the packs have it, or a sound the game makes.
  _xSnd(key, role, made) {
    const m = this.ev.mission;
    const usual = REC_DEFAULTS[`${m}.${key}`];
    return this._bRec(this.ev[m][key], role) || (usual ? this._bRec(usual, role) : null) || made;
  },

  _xThing(sound, x, y) {
    const th = this._bLoop(new this._Thing(x, y), sound);
    this.xThings.push(th);
    return th;
  },

  _xDrop(th) {
    if (!th) return;
    this._mStop(th);
    const i = this.xThings.indexOf(th);
    if (i >= 0) this.xThings.splice(i, 1);
  },

  // The middle of the last row of squares before the room's edge.
  _xEdge() { return Math.floor(this.arenaLimit / STEP) * STEP; },

  _xSoon(delay, name, where = null, gain = 1.0, tag = '') {
    this.xPending.push([this.evElapsed + delay, name, where, gain, tag]);
  },

  _xPlay(name, where = null, gain = 1.0) {
    if (!name) return;
    if (where === null) this.audio.play(name, { volume: Math.min(1.0, gain) });
    else this._bShotAt(name, where, gain);
  },

  // A life lost. True if it was the last: the run has ended.
  _xLoseLife(reason) {
    this.xLives -= 1;
    this.audio.play(this.audio.has('player_hit') ? 'player_hit' : 'event_wrong');
    if (this.xLives <= 0) { this._eventFinish(reason); return true; }
    return false;
  },

  // A round (a crossing, a field, a hit) is done. True if it was the run's last.
  _xRoundDone(points, sound = 'stairs_climb') {
    this.evPoints += points;
    this.xDone += 1;
    if (sound) this.audio.play(sound);
    if (this._bEndingReached(this.xDone)) return true;
    const word = MORE[this.ev.mission].word;
    if (word) this._bSayLevel(this.xDone + 1, word);
    return false;
  },

  // The event's item sound at a pitch, from an octave down to an octave up.
  _xNote(semi) {
    const notes = this._mNotes(this.evBeacons[0]);
    return notes[Math.max(-12, Math.min(12, Math.trunc(semi)))];
  },

  // A free square at least minD from the player that no thing of the mission stands in.
  _xFreeSpot(minD) {
    let spot = this._eventSpot(minD, 0);
    for (let k = 0; k < 30; k++) {
      const here = sqKey(...spot);
      if ([...this.xThings, ...(this.x.silent || [])].every((t) => sqKey(t.x, t.y) !== here)) break;
      spot = this._eventSpot(minD, 0);
    }
    return spot;
  },

  // A square on the edge of the room, on any side.
  _xEdgeSpot() {
    const n = Math.floor(this.arenaLimit / STEP);
    const k = randint(-n, n) * STEP; const edge = n * STEP;
    return choice([[k, -edge], [k, edge], [-edge, k], [edge, k]]);
  },

  // What a shot takes, aimed as everywhere in the game: whatever is centred between
  // your ears, nearest first, in front or behind. [distance, thing] or null.
  _xAimed(things) {
    let best = null;
    for (const th of things) {
      const dx = th.x - this.playerPos[0]; const dy = th.y - this.playerPos[1];
      const dist = Math.hypot(dx, dy);
      if (dist < 1.0 || Math.abs(dx / dist) < 0.72) {
        if (best === null || dist < best[0]) best = [dist, th];
      }
    }
    return best;
  },

  _xBoom(th, dist, name = 'explosion') {
    if (this.audio.has(name)) this._later(Math.min(0.4, dist / 60.0), name, [th.x, th.y]);
  },

  // The event's item sound at any pitch, in semitones and parts of one.
  _xPitched(semi) {
    const base = this.audio.has(this.evBeacons[0]) ? this.evBeacons[0] : 'event_beacon_bell';
    const name = `event_x_${base}_${pyRound(semi * 100)}`;
    if (!this.audio.has(name)) {
      const buf = this.audio.buffers.get('dry:' + base) || this.audio.buffers.get('dry:event_beacon_bell');
      addMade(this.audio, name, pitch(fromBuffer(buf), semi));
    }
    return name;
  },

  _xNear(th, reach) { return Math.hypot(th.x - this.playerPos[0], th.y - this.playerPos[1]) < reach; },

  // Move a thing straight toward a spot. True once it is there.
  _xGo(th, gx, gy, dist) {
    const dx = gx - th.x; const dy = gy - th.y;
    const d = Math.hypot(dx, dy);
    if (d <= dist) { th.x = gx; th.y = gy; return true; }
    th.x += dx / d * dist;
    th.y += dy / d * dist;
    return false;
  },

  // ================================================================ the engine's calls
  _xStart(ev) {
    this._xReset();
    const fn = MORE_IDS.includes(ev.mission) ? this[`_x_${ev.mission}_start`] : null;
    if (fn) fn.call(this, ev[ev.mission]);
  },

  _xUpdate(dt) {
    for (const entry of [...this.xPending]) {
      if (this.evElapsed >= entry[0]) {
        this.xPending.splice(this.xPending.indexOf(entry), 1);
        this._xPlay(entry[1], entry[2], entry[3]);
      }
    }
    const m = this.ev.mission;
    const fn = this[`_x_${m}_update`];
    return fn ? Boolean(fn.call(this, dt, this.ev[m])) : false;
  },

  _xFire() {
    if (!this._xIs()) return false;
    const fn = this[`_x_${this.ev.mission}_fire`];
    if (!fn) return false;
    fn.call(this, this.ev[this.ev.mission]);
    return true;
  },

  _xArrow(key) {
    if (!this._xIs()) return false;
    const fn = this[`_x_${this.ev.mission}_arrow`];
    return fn ? Boolean(fn.call(this, key, this.ev[this.ev.mission])) : false;
  },

  _xOnStep() {
    if (!this._xIs()) return;
    const fn = this[`_x_${this.ev.mission}_step`];
    if (fn) fn.call(this, this.ev[this.ev.mission]);
  },

  _xStepRefused(nx, ny) {
    if (!this._xIs()) return false;
    const fn = this[`_x_${this.ev.mission}_refused`];
    return fn ? Boolean(fn.call(this, nx, ny, this.ev[this.ev.mission])) : false;
  },

  _xItemTaken(th) {
    if (!this._xIs()) return false;
    const fn = this[`_x_${this.ev.mission}_taken`];
    return fn ? Boolean(fn.call(this, th, this.ev[this.ev.mission])) : false;
  },

  _xClosing(reason) {
    if (!this._xIs() || this.xClosed !== false) return;
    this.xClosed = true;
    const fn = this[`_x_${this.ev.mission}_closing`];
    if (fn) fn.call(this, reason, this.ev[this.ev.mission]);
  },

  _xStatus() {
    const m = this.ev.mission;
    const fn = this[`_x_${m}_status`];
    const pts = Math.trunc(this.evPoints);
    return (fn ? fn.call(this, this.ev[m]) + ' ' : '') + `${pts} point${s(pts)}.`;
  },

  _xReason(reason) { return this._xIs() ? (X_REASONS[reason] || null) : null; },

  _xResult() {
    if (!this._xIs()) return null;
    const m = this.ev.mission;
    const fn = this[`_x_${m}_result`];
    if (!fn) return null;
    const total = Math.trunc(this.evPoints);
    return fn.call(this, this.ev[m], `${total} point${s(total)}`);
  },

  _xStopAll() {
    for (const th of [...(this.xThings || [])]) this._mStop(th);
    this.xThings = []; this.xPending = [];
    if (this.xMusic) { try { this.xMusic.stop(); } catch (e) { /* already stopped */ } }
    this.xMusic = null;
  },

  // ================================================================ 1. red light, green light
  _x_redlight_start(c) {
    this.xLives = c.lives;
    const made = this._bFragSound('ode_to_joy', 0, null) || this.evBeacons[0];
    Object.assign(this.x, { music: this._xSnd('music', 'beacon', made),
      goalSnd: this._xSnd('goal_sound', 'beacon', 'event_beacon_shimmer'), goal: null });
    this._x_redlight_goal(c);
  },

  _x_redlight_goal(c) {
    this._xDrop(this.x.goal);
    this.x.goal = this._xThing(this.x.goalSnd, ...this._eventSpot(c.goal_distance, 0));
    this._x_redlight_green(c);
  },

  _x_redlight_green(c) {
    const most = Math.max(c.green_least, c.green_most - c.shorter_each * this.xDone);
    Object.assign(this.x, { green: true, left: uniform(c.green_least, most) });
    if (this.xMusic === null) this.xMusic = this.audio.play(this.x.music, { loops: -1, volume: 0.6 });
  },

  _x_redlight_update(dt, c) {
    this.x.left -= dt;
    if (this.x.left <= 0) {
      if (this.x.green) {
        if (this.xMusic) this.xMusic.stop();
        this.xMusic = null;
        Object.assign(this.x, { green: false, left: uniform(c.red_least, c.red_most), redAt: this.evElapsed });
      } else {
        this._x_redlight_green(c);
      }
    }
    if (this._mReached(this.x.goal, 0.9)) {
      if (this._xRoundDone(c.points_per_goal, 'event_checkpoint')) return true;
      this._x_redlight_goal(c);
    }
    return false;
  },

  _x_redlight_step(c) {
    if (this.x.green || this.evElapsed - (this.x.redAt ?? 0.0) < RED_GRACE) return;
    this.audio.play('event_wrong');
    if (c.on_move === 'end_run') this._eventFinish('moved');
    else this._xLoseLife('moved');
  },

  _x_redlight_status(c) {
    const lives = c.on_move === 'lose_life' ? ` ${lifeWord(this.xLives)}.` : '';
    return `Round ${this.xDone + 1}. ${this.x.green ? 'Green' : 'Red'} light.${lives}`;
  },

  _x_redlight_result(c, pts) { return `You reached ${this.xDone} goal${s(this.xDone)} for ${pts}. `; },

  // ================================================================ 2. minefield
  _x_mines_start(c) {
    this.xLives = c.lives;
    Object.assign(this.x, { goalSnd: this._xSnd('goal_sound', 'beacon', 'event_beacon_shimmer'), goal: null, mines: new Set() });
    this._x_mines_field(c);
  },

  // A new field: the player at the south edge, the goal at the north, and mines
  // everywhere but along one winding way through.
  _x_mines_field(c) {
    const n = Math.floor(this.arenaLimit / STEP); const edge = this._xEdge();
    this._xDrop(this.x.goal);
    this.playerPos = [0.0, edge];
    this.x.goal = this._xThing(this.x.goalSnd, 0.0, -edge);
    const safe = new Set([K(0, n)]);
    let i = 0; let j = n;
    while (j > -n) {
      const turn = random();
      if (turn < 0.3 && i > -n) i -= 1;
      else if (turn < 0.6 && i < n) i += 1;
      else j -= 1;
      safe.add(K(i, j));
    }
    while (i !== 0) {                     // along the last row to the goal
      i += i < 0 ? 1 : -1;
      safe.add(K(i, j));
    }
    const share = Math.min(c.share_most, c.mines_share + c.more_each * this.xDone);
    const mines = new Set();
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) if (!safe.has(K(a, b)) && random() < share) mines.add(K(a, b));
    this.x.mines = mines;
    this.xPending = this.xPending.filter((e) => e[4] !== 'click');
    for (let k = 0; k < this._x_mines_beside(); k++) {     // what lies beside the first square, before any step
      this._xSoon(1.0 + k * CLICK_GAP, 'event_lost_tick', null, 0.9, 'click');
    }
  },

  _x_mines_beside() {
    const [i, j] = sq(...this.playerPos);
    return NEAR8.filter(([a, b]) => this.x.mines.has(K(i + a, j + b))).length;
  },

  _x_mines_step(c) {
    const here = sqKey(...this.playerPos);
    this.xPending = this.xPending.filter((e) => e[4] !== 'click');
    if (this.x.mines.has(here)) {
      this.x.mines.delete(here);
      this.audio.play('explosion');
      if (c.on_mine === 'end_run') { this._eventFinish('mine'); return; }
      if (this._xLoseLife('mine')) return;
    }
    for (let k = 0; k < this._x_mines_beside(); k++) this._xSoon(0.12 + k * CLICK_GAP, 'event_lost_tick', null, 0.9, 'click');
  },

  _x_mines_update(dt, c) {
    if (this._mReached(this.x.goal, 0.9)) {
      if (this._xRoundDone(c.points_per_crossing)) return true;
      this._x_mines_field(c);
    }
    return false;
  },

  _x_mines_status(c) {
    const k = this._x_mines_beside();
    const lives = c.on_mine === 'lose_life' ? ` ${lifeWord(this.xLives)}.` : '';
    return `Field ${this.xDone + 1}. ${k} mine${s(k)} beside you.${lives}`;
  },

  _x_mines_result(c, pts) { return `You crossed ${this.xDone} field${s(this.xDone)} for ${pts}. `; },

  // ================================================================ 3. stepping stones
  _x_stones_start(c) {
    this.xLives = c.lives;
    this.x.splash = this._bRec('evt_water_splash.ogg', 'pickup') || 'event_wrong';
    this._x_stones_path(c);
  },

  // A new path from the south bank: each stone is north, east or west of the one
  // before, never back the way it came.
  _x_stones_path(c) {
    const n = Math.floor(this.arenaLimit / STEP); const edge = this._xEdge();
    const length = Math.min(c.longest, c.first_length + c.longer_each * this.xDone);
    const path = []; const seen = new Set();
    let i = 0; let j = n; let last = [0, -1];
    for (let k = 0; k < length; k++) {
      const ways = [[0, -1], [1, 0], [-1, 0]].filter((d) => Math.abs(i + d[0]) <= n && j + d[1] >= -n
        && (d[0] === 0 || d[0] !== -last[0]) && !seen.has(K(i + d[0], j + d[1])));
      if (!ways.length) break;              // boxed in at the far bank: the path ends here
      const north = ways.filter((d) => d[1] === -1);
      const side = ways.filter((d) => d[1] !== -1);
      const d = north.length && (random() < 0.55 || ways.length === 1) ? north[0] : choice(side.length ? side : ways);
      i += d[0]; j += d[1]; last = d;
      path.push([i, j]); seen.add(K(i, j));
    }
    Object.assign(this.x, { path, at: 0, replays: c.replays, home: [0.0, edge] });
    this.playerPos = [0.0, edge];
    this._x_stones_play(c);
  },

  // The path is played, each stone's note from where it lies; no step is taken until it has finished.
  _x_stones_play(c) {
    this.xPending = this.xPending.filter((e) => e[4] !== 'stone');
    this.x.path.forEach(([i, j], k) => {
      this._xSoon(0.8 + k * c.note_seconds, this._xNote(SCALE[k % SCALE.length] - 5), [i * STEP, j * STEP], 1.0, 'stone');
    });
    this.x.until = this.evElapsed + 0.8 + this.x.path.length * c.note_seconds;
  },

  _x_stones_refused(nx, ny, c) { return this.evElapsed < (this.x.until ?? 0.0); },

  _x_stones_step(c) {
    const here = sqKey(...this.playerPos);
    const path = this.x.path;
    if (this.x.at < path.length && here === K(...path[this.x.at])) {
      this.audio.play(this._xNote(SCALE[this.x.at % SCALE.length] - 5));
      this.x.at += 1;
      if (this.x.at >= path.length) {
        if (!this._xRoundDone(c.points_per_crossing)) this._x_stones_path(c);
      }
      return;
    }
    this.audio.play(this.x.splash);
    if (c.on_wrong === 'end_run') { this._eventFinish('splash'); return; }
    if (this._xLoseLife('splash')) return;
    this.playerPos = [...this.x.home];
    this.x.at = 0;
    this._x_stones_play(c);
  },

  _x_stones_fire(c) {
    if (this.evElapsed < (this.x.until ?? 0.0)) return;
    if (this.x.replays <= 0) { this.audio.play('empty_click'); return; }
    this.x.replays -= 1;
    this._x_stones_play(c);
  },

  _x_stones_status(c) {
    const lives = c.on_wrong === 'lose_life' ? ` ${lifeWord(this.xLives)}.` : '';
    const r = this.x.replays;
    return `Crossing ${this.xDone + 1}. ${this.x.at} of ${this.x.path.length} stones.${lives} ${r} replay${s(r)} left.`;
  },

  _x_stones_result(c, pts) { return `You made ${this.xDone} crossing${s(this.xDone)} for ${pts}. `; },

  // ================================================================ 4. bat and ball
  _x_pong_start(c) {
    this.xLives = c.lives;
    Object.assign(this.x, { snd: this._xSnd('ball_sound', 'beacon', 'event_bomb_tick'), ball: null, serveIn: 1.0, vx: 0.0, vy: 0.0 });
  },

  _x_pong_speed(c) { return Math.min(c.top_speed, c.ball_speed * (1.0 + c.faster_each) ** this.xDone); },

  _x_pong_serve(c) {
    const n = Math.floor(this.arenaLimit / STEP); const edge = this._xEdge();
    this._xDrop(this.x.ball);
    this.x.ball = this._xThing(this.x.snd, randint(-n, n) * STEP, -edge);
    const sp = this._x_pong_speed(c);
    Object.assign(this.x, { vx: choice([-0.6, -0.3, 0.0, 0.3, 0.6]) * sp, vy: sp });
  },

  _x_pong_update(dt, c) {
    const ball = this.x.ball; const edge = this._xEdge();
    if (!ball) {
      this.x.serveIn -= dt;
      if (this.x.serveIn <= 0) this._x_pong_serve(c);
      return false;
    }
    const before = ball.y;
    ball.x += this.x.vx * dt;
    ball.y += this.x.vy * dt;
    if (Math.abs(ball.x) > edge) {                // off a side wall
      ball.x = Math.sign(ball.x) * (2 * edge - Math.abs(ball.x));
      this.x.vx = -this.x.vx;
    }
    if (ball.y < -edge && this.x.vy < 0) { ball.y = -edge; this.x.vy = -this.x.vy; }   // off the far wall
    const py = this.playerPos[1];
    const crossed = this.x.vy > 0 && before < py && py <= ball.y;
    if (crossed || ball.y > edge) {
      if (crossed && Math.abs(ball.x - this.playerPos[0]) <= PONG_REACH) {
        this.evPoints += c.points_per_hit;
        this.xDone += 1;
        this.audio.play('event_checkpoint');
        if (this._bEndingReached(this.xDone)) return true;
        const sp = this._x_pong_speed(c);
        ball.y = py - 0.01;
        Object.assign(this.x, { vx: choice([-0.6, -0.3, 0.0, 0.3, 0.6]) * sp, vy: -sp });
      } else {
        this._xDrop(ball);
        Object.assign(this.x, { ball: null, serveIn: 1.2 });
        this.audio.play('event_wrong');
        if (this._xLoseLife('missed')) return true;
        return false;
      }
    }
    this._bFollow(ball, 1.0);
    return false;
  },

  _x_pong_status(c) { return `${this.xDone} hit${s(this.xDone)}. ${lifeWord(this.xLives)}.`; },

  _x_pong_result(c, pts) { return `You hit the ball ${this.xDone} time${s(this.xDone)} for ${pts}. `; },

  // ================================================================ 5. race a rival
  _x_rival_start(c) {
    Object.assign(this.x, { got: 0, won: null });
    this.x.rival = this._xThing(this._xSnd('rival_sound', 'beacon_hazard', 'guardian'), ...this._eventFarSpot());
  },

  // Whether the set total has been taken, by the player and the rival together.
  _x_rival_gone() {
    const total = this.ev.item.total;
    return Boolean(total) && this.evCollected + this.x.got >= total;
  },

  _x_rival_update(dt, c) {
    const rival = this.x.rival;
    const items = this.evItems.filter((t) => !t.cased);
    if (items.length) {
      let near = items[0];
      for (const t of items) if (Math.hypot(t.x - rival.x, t.y - rival.y) < Math.hypot(near.x - rival.x, near.y - rival.y)) near = t;
      const speed = c.rival_speed * (1.0 + c.faster_each * this.x.got);
      this._bMoveToward(rival, near.x, near.y, speed * dt, this.arenaLimit - 1.0);
      if (Math.hypot(near.x - rival.x, near.y - rival.y) < 1.5) {
        this._mStop(near);
        this.evItems.splice(this.evItems.indexOf(near), 1);
        this._bShotAt(this.evPickup, [near.x, near.y], 0.6);
        this.x.got += 1;
        if (this._x_rival_gone()) { this._eventFinish('rival_end'); return true; }
        this._eventSpawnItem();
      }
    }
    this._bFollow(rival, 0.9);
    return false;
  },

  _x_rival_taken(th, c) {
    if (this._x_rival_gone()) { this._eventFinish('rival_end'); return true; }
    return false;
  },

  _x_rival_closing(reason, c) {
    if (['time', 'rival_end', 'all'].includes(reason) && this.evCollected > this.x.got) {
      this.x.won = true;
      this.evPoints += c.win_bonus;
    }
  },

  _x_rival_status(c) { return `You have ${this.evCollected}, the ${c.rival_name.trim()} has ${this.x.got}.`; },

  _x_rival_result(c, pts) {
    const it = this.ev.item; const n = this.evCollected; const got = this.x.got; const who = c.rival_name.trim();
    const word = n === 1 ? it.name : it.plural;
    let end;
    if (this.x.won) end = 'You win! ' + (c.win_bonus ? `Bonus ${c.win_bonus} point${s(c.win_bonus)}. ` : '');
    else if (n === got) end = 'A draw. ';
    else if (n > got) end = 'You were ahead. ';
    else end = `The ${who} wins. `;
    return `You found ${n} ${word} and the ${who} took ${got}. ${end}${pts} in all. `;
  },

  // ================================================================ 6. catch the thief
  _x_thief_start(c) {
    Object.assign(this.x, { snd: this._xSnd('thief_sound', 'beacon_hazard', 'obstacle_0'),
      tsnd: this._xSnd('treasure_sound', 'beacon', this.evBeacons[0]), treasures: [], thief: null, rest: 2.0, held: null });
    for (let k = 0; k < c.treasures; k++) {
      const th = this._xThing(this.x.tsnd, ...this._xFreeSpot(9.0));
      th.state = 'home';
      this.x.treasures.push(th);
    }
  },

  _x_thief_home() { return this.x.treasures.filter((t) => t.state === 'home'); },

  _x_thief_update(dt, c) {
    let thief = this.x.thief;
    for (const t of this._x_thief_home()) this._bFollow(t, 0.7);
    if (!thief) {
      if (!this._x_thief_home().length) { this._eventFinish('robbed'); return true; }
      this.x.rest -= dt;
      if (this.x.rest <= 0) {
        thief = this.x.thief = this._xThing(this.x.snd, ...this._xEdgeSpot());
        thief.state = 'seek';
      }
      return false;
    }
    const speed = c.thief_speed * (1.0 + c.faster_each * this.xDone);
    const far = (p) => Math.hypot(p[0] - thief.x, p[1] - thief.y);
    if (thief.state === 'seek') {
      const home = this._x_thief_home();
      if (!home.length) {
        thief.state = 'flee'; thief.target = this._xEdgeSpot();
      } else {
        let goal = home[0];
        for (const t of home) if (far([t.x, t.y]) < far([goal.x, goal.y])) goal = t;
        if (this._xGo(thief, goal.x, goal.y, speed * dt)) {
          this._mStop(goal);
          goal.state = 'held';
          this.x.held = goal;
          const edge = this._xEdge();
          let best = null;
          for (const p of [[thief.x, -edge], [thief.x, edge], [-edge, thief.y], [edge, thief.y]]) if (!best || far(p) < far(best)) best = p;
          thief.target = best;
          thief.state = 'flee';
          this._bShotAt('event_wrong', [thief.x, thief.y], 0.7);
        }
      }
    } else if (this._xGo(thief, thief.target[0], thief.target[1], speed * 1.15 * dt)) {
      const held = this.x.held;
      if (held) {
        held.state = 'gone';
        this._xDrop(held);
        this.audio.play('event_wrong');
      }
      Object.assign(this.x, { held: null, thief: null, rest: c.thief_rest });
      this._xDrop(thief);
      return false;
    }
    if (this._xNear(thief, 2.2)) {
      const held = this.x.held;
      if (held) {
        held.state = 'home';
        this._bLoop(held, this.x.tsnd);
      }
      Object.assign(this.x, { held: null, thief: null, rest: c.thief_rest });
      this._xDrop(thief);
      this.evPoints += c.points_per_catch;
      this.xDone += 1;
      this.audio.play('event_checkpoint');
      return this._bEndingReached(this.xDone);
    }
    this._bFollow(thief, 1.0);
    return false;
  },

  _x_thief_status(c) {
    const left = this.x.treasures.filter((t) => t.state !== 'gone').length;
    return `${this.xDone} catch${this.xDone === 1 ? '' : 'es'}. ${left} treasure${s(left)} left.`;
  },

  _x_thief_result(c, pts) { return `You caught the thief ${this.xDone} time${s(this.xDone)} for ${pts}. `; },

  // ================================================================ 7. boss
  _x_boss_start(c) {
    this.xLives = c.lives;
    Object.assign(this.x, { roar: this._xSnd('roar_sound', 'pickup', 'event_falling'), pant: 0.0 });
    this.x.boss = this._xThing(this._xSnd('boss_sound', 'beacon_hazard', 'guardian'), ...this._eventFarSpot());
    this._x_boss_fresh(c);
  },

  _x_boss_fresh(c) {
    const boss = this.x.boss;
    [boss.x, boss.y] = this._eventFarSpot();
    boss.state = 'stalk'; boss.timer = c.stalk_seconds;
    boss.hits = 0;
    this.x.hp = c.health + c.stronger_each * this.xDone;
  },

  _x_boss_update(dt, c) {
    const boss = this.x.boss;
    const [px, py] = this.playerPos;
    boss.timer -= dt;
    let hurt = false;
    if (boss.state === 'stalk') {
      this._xGo(boss, px, py, c.speed * dt);
      hurt = this._xNear(boss, 2.2);
      if (boss.timer <= 0 && !hurt) {
        boss.state = 'roar'; boss.timer = 1.2; boss.target = [px, py];
        this._bShotAt(this.x.roar, [boss.x, boss.y], 1.0);
      }
    } else if (boss.state === 'roar') {
      if (boss.timer <= 0) {
        const dx = boss.target[0] - boss.x; const dy = boss.target[1] - boss.y;
        const d = Math.hypot(dx, dy) || 1.0;
        const lim = this._xEdge();
        boss.target = [clamp(boss.target[0] + dx / d * 9.0, lim), clamp(boss.target[1] + dy / d * 9.0, lim)];
        boss.state = 'charge';
      }
    } else if (boss.state === 'charge') {
      const done = this._xGo(boss, boss.target[0], boss.target[1], c.charge_speed * dt);
      hurt = this._xNear(boss, 2.2);
      if (done && !hurt) {
        boss.state = 'tired'; boss.timer = c.tired_seconds;
        this.x.pant = 0.0;
      }
    } else {                                    // tired: it pants, and only now can it be hurt
      this.x.pant -= dt;
      if (this.x.pant <= 0) {
        this.x.pant = 0.5;
        this._bShotAt('event_lost_tick', [boss.x, boss.y], 0.9);
      }
      if (boss.timer <= 0) { boss.state = 'stalk'; boss.timer = c.stalk_seconds; }
    }
    if (hurt) {
      if (this._xLoseLife('boss')) return true;
      const hp = this.x.hp;
      this._x_boss_fresh(c);
      this.x.hp = hp;
    }
    this._bFollow(boss, boss.state === 'tired' ? 0.55 : 1.0);
    return false;
  },

  _x_boss_fire(c) {
    const boss = this.x.boss;
    this.audio.play('laser');
    const aimed = this._xAimed([boss]);
    if (!aimed) return;
    if (boss.state !== 'tired') { this._xBoom(boss, aimed[0], 'wall'); return; }
    this.x.hp -= 1;
    this.evPoints += c.points_per_hit;
    if (this.x.hp > 0) {
      this._xBoom(boss, aimed[0], this.audio.has('guardian_hit') ? 'guardian_hit' : 'enemy_hit');
      return;
    }
    this.audio.play('explosion', { at: [boss.x, boss.y] });
    if (!this._xRoundDone(c.points_for_boss, null)) this._x_boss_fresh(c);
  },

  _x_boss_status(c) {
    const hp = this.x.hp;
    const tired = this.x.boss.state === 'tired' ? ' It is tired.' : '';
    return `Boss ${this.xDone + 1}. ${hp} hit${s(hp)} to go.${tired} ${lifeWord(this.xLives)}.`;
  },

  _x_boss_result(c, pts) { return `You brought down ${this.xDone} boss${this.xDone === 1 ? '' : 'es'} for ${pts}. `; },

  // ================================================================ 8. escort
  _x_escort_start(c) {
    Object.assign(this.x, { lives: c.friend_lives, friend: null, home: null, raiders: [],
      fsnd: this._xSnd('friend_sound', 'beacon', this.evBeacons[0]),
      hsnd: this._xSnd('home_sound', 'beacon', 'event_beacon_shimmer'),
      rsnd: this._xSnd('raider_sound', 'beacon_hazard', 'obstacle_1') });
    this._x_escort_trip(c);
  },

  _x_escort_trip(c) {
    for (const th of [this.x.friend, this.x.home, ...this.x.raiders]) this._xDrop(th);
    const n = Math.floor(this.arenaLimit / STEP); const edge = this._xEdge();
    const side = choice([-1, 1]);
    this.x.friend = this._xThing(this.x.fsnd, side * edge, randint(-n, n) * STEP);
    this.x.home = this._xThing(this.x.hsnd, -side * edge, randint(-n, n) * STEP);
    const more = c.more_every ? Math.floor(this.xDone / c.more_every) : 0;
    this.x.raiders = [];
    for (let k = 0; k < Math.min(6, c.raiders + more); k++) {
      const th = this._xThing(this.x.rsnd, ...this._xEdgeSpot());
      th.downFor = 0.0;                         // each comes in after a moment, not all at once
      th.timer = uniform(1.0, 4.0);
      this._mStop(th);
      this.x.raiders.push(th);
    }
  },

  _x_escort_update(dt, c) {
    const friend = this.x.friend; const home = this.x.home;
    if (this._xNear(friend, c.stay_within + 0.5)) {
      if (this._xGo(friend, home.x, home.y, c.friend_speed * dt)) {
        if (this._xRoundDone(c.points_per_trip)) return true;
        this._x_escort_trip(c);
        return false;
      }
    }
    for (const th of this.x.raiders) {
      if (th.downFor >= 0) {
        th.downFor += dt;
        if (th.downFor >= th.timer) {
          [th.x, th.y] = this._xEdgeSpot();
          th.downFor = -1.0;
          this._bLoop(th, this.x.rsnd);
        }
        continue;
      }
      if (this._xGo(th, friend.x, friend.y, c.raider_speed * dt)) {
        this.x.lives -= 1;
        this.audio.play(this.audio.has('player_hit') ? 'player_hit' : 'event_wrong', { at: [friend.x, friend.y] });
        this._mStop(th);
        th.downFor = 0.0; th.timer = 3.0;
        if (this.x.lives <= 0) { this._eventFinish('friend_lost'); return true; }
        continue;
      }
      this._bFollow(th, 1.0);
    }
    this._bFollow(friend, 0.9);
    this._bFollow(home, 0.7);
    return false;
  },

  _x_escort_fire(c) {
    this.audio.play('laser');
    const aimed = this._xAimed(this.x.raiders.filter((t) => t.downFor < 0));
    if (!aimed) return;
    const th = aimed[1];
    this._mStop(th);
    th.downFor = 0.0; th.timer = 3.0;
    this.evPoints += c.points_per_raider;
    this._xBoom(th, aimed[0]);
  },

  _x_escort_status(c) { return `Trip ${this.xDone + 1}. The friend has ${lifeWord(this.x.lives)}.`; },

  _x_escort_result(c, pts) { return `You brought the friend home ${this.xDone} time${s(this.xDone)} for ${pts}. `; },

  // ================================================================ 9. shooting gallery
  _x_gallery_start(c) {
    Object.assign(this.x, { tsnd: this._xSnd('target_sound', 'beacon_hazard', 'obstacle_2'),
      fsnd: this._xSnd('friend_sound', 'beacon', this.evBeacons[0]), target: null, gap: 1.0, shown: 0, misses: 0 });
  },

  _x_gallery_update(dt, c) {
    let th = this.x.target;
    if (!th) {
      this.x.gap -= dt;
      if (this.x.gap <= 0) {
        const friend = random() < c.friend_share;
        const edge = this._xEdge();
        const y = Math.max(-edge, this.playerPos[1] - c.distance);
        th = this._xThing(friend ? this.x.fsnd : this.x.tsnd, randint(-c.width, c.width) * STEP, y);
        th.role = friend ? 'friend' : 'target';
        th.timer = Math.max(c.shortest, c.up_seconds - c.shorter_each * this.x.shown);
        this.x.shown += 1;
        this.x.target = th;
      }
      return false;
    }
    th.timer -= dt;
    if (th.timer <= 0) {
      this._xDrop(th);
      Object.assign(this.x, { target: null, gap: 0.8 });
      if (th.role === 'target') {
        this.x.misses += 1;
        this.audio.play('event_wrong');
        if (c.misses_allowed && this.x.misses >= c.misses_allowed) { this._eventFinish('gallery_out'); return true; }
      }
      return false;
    }
    this._bFollow(th, 1.0);
    return false;
  },

  _x_gallery_fire(c) {
    this.audio.play('laser');
    const th = this.x.target;
    const aimed = th ? this._xAimed([th]) : null;
    if (!aimed) return;
    this._xDrop(th);
    Object.assign(this.x, { target: null, gap: 0.8 });
    if (th.role === 'friend') {
      this.evPoints = Math.max(0, this.evPoints - c.friend_penalty);
      this.audio.play('event_wrong');
      return;
    }
    this.evPoints += c.points_per_target;
    this.xDone += 1;
    this._xBoom(th, aimed[0]);
    this._bEndingReached(this.xDone);
  },

  _x_gallery_status(c) {
    const ms = this.x.misses;
    const allowed = c.misses_allowed ? ` of ${c.misses_allowed} allowed` : '';
    return `${this.xDone} hit${s(this.xDone)}. ${ms} miss${ms === 1 ? '' : 'es'}${allowed}.`;
  },

  _x_gallery_result(c, pts) { return `You hit ${this.xDone} target${s(this.xDone)} for ${pts}. `; },

  // ================================================================ 10. odd one out
  _x_odd_start(c) {
    this.xLives = c.lives;
    this.x.silent = [];
    this._x_odd_round(c);
  },

  // Lay out a round: things that sound in turn, all on one note but one.
  _x_odd_round(c) {
    const k = Math.min(c.things_most, c.things_first + this.xDone);
    const diff = Math.max(c.difference_least, c.difference_first - c.closer_each * this.xDone);
    const base = randint(-3, 3);
    const odd = randrange(k);
    this.x.silent = [];
    for (let i = 0; i < k; i++) {
      const th = new this._Thing(...this._xFreeSpot(9.0));
      th.note = this._xPitched(base + (i === odd ? choice([-diff, diff]) : 0.0));
      th.role = i === odd ? 'odd' : 'same';
      this.x.silent.push(th);
    }
    Object.assign(this.x, { turn: 0, nextAt: this.evElapsed + 0.8 });
  },

  _x_odd_update(dt, c) {
    const things = this.x.silent;
    if (this.evElapsed >= this.x.nextAt) {
      const th = things[this.x.turn % things.length];
      this._bShotAt(th.note, [th.x, th.y], 1.0);
      this.x.turn += 1;
      this.x.nextAt = this.evElapsed + 0.9;
    }
    for (const th of things) {
      if (!this.evSteppedOnto([th.x, th.y])) continue;
      if (th.role === 'odd') {
        if (this._xRoundDone(c.points_per_round, 'event_checkpoint')) return true;
      } else {
        this.audio.play('event_wrong');
        if (c.on_wrong === 'end_run') { this._eventFinish('wrong_one'); return true; }
        if (this._xLoseLife('wrong_one')) return true;
      }
      this._x_odd_round(c);
      break;
    }
    return false;
  },

  _x_odd_status(c) {
    const lives = c.on_wrong === 'lose_life' ? ` ${lifeWord(this.xLives)}.` : '';
    return `Round ${this.xDone + 1}. ${this.x.silent.length} things.${lives}`;
  },

  _x_odd_result(c, pts) { return `You found ${this.xDone} odd one${s(this.xDone)} for ${pts}. `; },

  // ================================================================ 11. cover the ground
  _x_cover_start(c) {
    Object.assign(this.x, { seen: new Set([sqKey(...this.playerPos)]), streak: 0,
      snd: this._xSnd('new_sound', 'pickup', 'event_detector_beep') });
  },

  _x_cover_step(c) {
    const here = sqKey(...this.playerPos);
    if (this.x.seen.has(here)) { this.x.streak = 0; return; }
    this.x.seen.add(here);
    this.x.streak += 1;
    this.xDone += 1;
    this.evPoints += c.points_per_square;
    this._xPlay(this.x.snd, null, 0.5);
    if (c.streak && this.x.streak % c.streak === 0) {
      this.evPoints += c.streak_bonus;
      this.audio.play('event_checkpoint');
    }
    if (c.squares_to_cover && this.xDone >= c.squares_to_cover) this._eventFinish('covered');
  },

  _x_cover_status(c) {
    const toGo = c.squares_to_cover ? ` ${Math.max(0, c.squares_to_cover - this.xDone)} to go.` : '';
    return `${this.xDone} square${s(this.xDone)} covered.${toGo}`;
  },

  _x_cover_result(c, pts) { return `You covered ${this.xDone} square${s(this.xDone)} for ${pts}. `; },

  // ================================================================ 12. sonar maze
  _x_sonar_start(c) {
    Object.assign(this.x, { snd: this._xSnd('exit_sound', 'pickup', 'event_checkpoint'), ready: 0.0 });
    this._x_sonar_exit(c);
  },

  _x_sonar_exit(c) {
    this.x.exit = new this._Thing(...this._eventSpot(c.exit_distance, 0));
    this.x.silent = [this.x.exit];
    this.x.pings = c.pings;
  },

  _x_sonar_fire(c) {
    if (this.evElapsed < this.x.ready || (c.pings && this.x.pings <= 0)) { this.audio.play('empty_click'); return; }
    if (c.pings) this.x.pings -= 1;
    this.x.ready = this.evElapsed + c.ping_seconds;
    this.audio.play('event_ping');
    const [i, j] = sq(...this.playerPos);
    const near = [];
    for (const key of this.bWalls) {
      const [a, b] = key.split(',').map(Number);
      const d = Math.hypot(a - i, b - j);
      if (d <= c.ping_range) near.push([d, a, b]);
    }
    near.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
    for (const [d, a, b] of near.slice(0, 14)) {   // the walls answer, the nearest first
      this._xSoon(0.15 + 0.06 * d, 'event_lost_tick', [a * STEP, b * STEP], 0.9, 'ping');
    }
    const ex = this.x.exit;
    const d = Math.hypot(ex.x - this.playerPos[0], ex.y - this.playerPos[1]) / STEP;
    this._xSoon(Math.min(1.4, 0.2 + 0.06 * d), this.x.snd, [ex.x, ex.y], 1.0, 'ping');
  },

  _x_sonar_update(dt, c) {
    const ex = this.x.exit;
    if (this.evSteppedOnto([ex.x, ex.y])) {
      if (this._xRoundDone(c.points_per_maze)) return true;
      this.xPending = [];
      this._bClearThings();
      this._bLayRoom();
      this._bLayThings();
      this._x_sonar_exit(c);
    }
    return false;
  },

  _x_sonar_status(c) {
    const left = c.pings ? ` ${this.x.pings} ping${s(this.x.pings)} left.` : '';
    return `Maze ${this.xDone + 1}.${left}`;
  },

  _x_sonar_result(c, pts) { return `You escaped ${this.xDone} maze${this.xDone === 1 ? '' : 's'} for ${pts}. `; },

  // ================================================================ 13. courier
  _x_courier_start(c) {
    const n = Math.floor(this.arenaLimit / STEP); const k = c.shelves;
    const own = c.shelf_sounds.map((f) => this._bRec(f, 'beacon'));
    const notes = [-9, -4, 0, 5, 9, 12];
    Object.assign(this.x, { shelves: [], customer: null, carrying: null, misses: 0, patience: null,
      csnd: this._xSnd('customer_sound', 'beacon', 'event_beacon_shimmer') });
    for (let i = 0; i < k; i++) {
      const snd = (i < own.length && own[i] ? own[i] : null) || this._xNote(notes[i]);
      const th = this._xThing(snd, (2 * i - (k - 1)) * STEP, -(n - 1) * STEP);
      th.note = snd; th.role = i;
      this.x.shelves.push(th);
    }
    this._x_courier_new(c);
  },

  _x_courier_new(c) {
    this._xDrop(this.x.customer);
    let spot = this._xFreeSpot(9.0);
    for (let k = 0; k < 20; k++) {
      if (spot[1] >= 0) break;
      spot = this._xFreeSpot(9.0);
    }
    const th = this._xThing(this.x.csnd, ...spot);
    th.role = randrange(c.shelves);
    this.x.customer = th;
    this.x.carrying = null;
    this.x.patience = c.patience_seconds ? Math.max(c.patience_least, c.patience_seconds - c.shorter_each * this.xDone) : null;
  },

  _x_courier_update(dt, c) {
    const cust = this.x.customer;
    if (this.x.patience !== null) {
      this.x.patience -= dt;
      if (this.x.patience <= 0) {
        this.x.misses += 1;
        this.audio.play('event_wrong');
        if (c.misses_allowed && this.x.misses >= c.misses_allowed) { this._eventFinish('customers_lost'); return true; }
        this._x_courier_new(c);
        return false;
      }
    }
    for (const th of this.x.shelves) {
      if (this._mStepped(th, 0.6)) {
        this.x.carrying = th.role;
        this.audio.play(this.evPickup);
      }
    }
    if (this._mStepped(cust, 0.9)) {
      const carrying = this.x.carrying;
      if (carrying === null) {
        this.audio.play(this.x.shelves[cust.role].note);      // the order, said once
      } else if (carrying === cust.role) {
        this.evPoints += c.points_per_order;
        this.xDone += 1;
        this.audio.play('event_checkpoint');
        if (this._bEndingReached(this.xDone)) return true;
        this._x_courier_new(c);
      } else {
        this.x.carrying = null;
        this.evPoints = Math.max(0, this.evPoints - c.wrong_cost);
        this.audio.play('event_wrong');
      }
    }
    return false;
  },

  _x_courier_status(c) {
    const ms = this.x.misses;
    const carry = this.x.carrying !== null ? ' Carrying something.' : '';
    const wait = this.x.patience !== null ? ` ${Math.trunc(Math.max(0, this.x.patience))} seconds of patience left.` : '';
    return `${this.xDone} served, ${ms} lost.${carry}${wait}`;
  },

  _x_courier_result(c, pts) { return `You served ${this.xDone} customer${s(this.xDone)} for ${pts}. `; },

  // ================================================================ 14. dance steps
  _x_dance_start(c) {
    this.xLives = c.lives;
    this._x_dance_round(c, true);
  },

  // The caller plays the row (a new one, or the same again after a slip); the
  // player's turn begins when it has finished.
  _x_dance_round(c, fresh) {
    if (fresh) {
      const length = Math.min(c.longest, c.first_length + this.xDone);
      this.x.seq = Array.from({ length }, () => randrange(4));
    }
    this.xPending = [];
    const [px, py] = this.playerPos;
    this.x.seq.forEach((d, k) => {
      this._xSoon(0.9 + k * c.beat_seconds, this._xNote(DANCE_NOTES[d]), [px + DIRS[d][0] * 6.0, py + DIRS[d][1] * 6.0], 1.0, 'dance');
    });
    const turn = 0.9 + this.x.seq.length * c.beat_seconds;
    this._xSoon(turn, 'event_lost_tick', null, 0.8, 'dance');
    Object.assign(this.x, { phase: 'call', turnAt: this.evElapsed + turn, at: 0 });
  },

  _x_dance_update(dt, c) {
    if (this.x.phase === 'call') {
      if (this.evElapsed >= this.x.turnAt) Object.assign(this.x, { phase: 'answer', deadline: this.evElapsed + c.answer_seconds });
    } else if (this.evElapsed > this.x.deadline) {
      return this._x_dance_slip(c);
    }
    return false;
  },

  _x_dance_slip(c) {
    this.audio.play('event_wrong');
    if (this._xLoseLife('misstep')) return true;
    this._x_dance_round(c, false);
    return false;
  },

  _x_dance_arrow(key, c) {
    if (this.x.phase !== 'answer') return true;   // while the caller plays, the arrows do nothing
    const d = { up: 0, right: 1, down: 2, left: 3 }[key];
    if (d === undefined) return true;
    if (d !== this.x.seq[this.x.at]) { this._x_dance_slip(c); return true; }
    this.audio.play(this._xNote(DANCE_NOTES[d]));
    this.x.at += 1;
    this.x.deadline = this.evElapsed + c.answer_seconds;
    if (this.x.at >= this.x.seq.length) {
      if (!this._xRoundDone(c.points_per_step * this.x.seq.length, 'event_checkpoint')) this._x_dance_round(c, true);
    }
    return true;
  },

  _x_dance_status(c) {
    return `Round ${this.xDone + 1}. ${this.x.seq.length} step${s(this.x.seq.length)}. ${lifeWord(this.xLives)}.`;
  },

  _x_dance_result(c, pts) { return `You danced ${this.xDone} round${s(this.xDone)} for ${pts}. `; },

  // ================================================================ 15. tag
  _x_tag_start(c) {
    Object.assign(this.x, { isnd: this._xSnd('it_sound', 'beacon_hazard', 'guardian'),
      rsnd: this._xSnd('runner_sound', 'beacon_hazard', 'obstacle_3'), players: [], it: null, tagged: 0, freeAt: 3.0 });
    for (let i = 0; i < c.players; i++) {
      const th = this._xThing(i === 0 ? this.x.isnd : this.x.rsnd, ...this._bOpenNear(...this._xEdgeSpot()));
      th.target = null;
      this.x.players.push(th);
    }
    this.x.it = this.x.players[0];
  },

  _x_tag_voice(th, snd) {
    this._mStop(th);
    this._bLoop(th, snd);
  },

  _x_tag_update(dt, c) {
    const it = this.x.it; const lim = this.arenaLimit - 1.0;
    const [px, py] = this.playerPos;
    const free = this.evElapsed >= this.x.freeAt;
    for (const th of this.x.players) {
      if (it === null) {                          // you are it: they all run from you
        const dx = th.x - px; const dy = th.y - py;
        const d = Math.hypot(dx, dy) || 1.0;
        const [gx, gy] = this._bOpenNear(clamp(th.x + dx / d * 9.0, lim), clamp(th.y + dy / d * 9.0, lim));
        this._bMoveToward(th, gx, gy, c.runner_speed * dt, lim);
      } else if (th === it) {
        if (free) this._bMoveToward(th, px, py, c.it_speed * dt, lim);
      } else {                                    // the others wander about
        if (!th.target || Math.hypot(th.target[0] - th.x, th.target[1] - th.y) < 1.5) th.target = this._eventSpot(6.0, 0);
        this._bMoveToward(th, th.target[0], th.target[1], c.runner_speed * 0.5 * dt, lim);
      }
      this._bFollow(th, 1.0);
    }
    if (it !== null) {
      this.evPoints += c.points_per_second * dt;
      if (free && this._xNear(it, 2.2)) {
        this.x.tagged += 1;
        this.audio.play('event_wrong');
        if (c.times_it_allowed && this.x.tagged >= c.times_it_allowed) { this._eventFinish('tagged_out'); return true; }
        this._bSay('You are it.');
        this._x_tag_voice(it, this.x.rsnd);
        Object.assign(this.x, { it: null, freeAt: this.evElapsed + c.head_start });
      }
    } else if (free) {
      for (const th of this.x.players) {
        if (this._xNear(th, 2.2)) {
          this.audio.play('event_checkpoint');
          this._bSay('Tagged.');
          this._x_tag_voice(th, this.x.isnd);
          Object.assign(this.x, { it: th, freeAt: this.evElapsed + c.head_start });
          break;
        }
      }
    }
    return false;
  },

  _x_tag_status(c) {
    const k = this.x.tagged;
    return (this.x.it === null ? 'You are it. ' : 'You are not it. ') + `Tagged ${k} time${s(k)}.`;
  },

  _x_tag_result(c, pts) {
    const k = this.x.tagged;
    return `You were tagged ${k} time${s(k)}. ${pts} in all. `;
  },

  // ================================================================ 16. crossing the road
  _x_crossing_start(c) {
    this.xLives = c.lives;
    Object.assign(this.x, { csnd: this._xSnd('car_sound', 'beacon_hazard', 'obstacle_4'),
      gsnd: this._xSnd('goal_sound', 'beacon', 'event_beacon_shimmer'), cars: [], goal: null });
    this._x_crossing_road(c);
  },

  // A new road: the player on the south verge, lanes of cars above, and the far side
  // calling from the row beyond the last lane.
  _x_crossing_road(c) {
    for (const th of [...this.x.cars, this.x.goal]) this._xDrop(th);
    const n = Math.floor(this.arenaLimit / STEP); const edge = this._xEdge();
    const lanes = Math.max(1, Math.min(c.lanes_most, c.lanes_first + this.xDone, 2 * n - 2));
    this.playerPos = [0.0, edge];
    Object.assign(this.x, { lanes, goalRow: n - 2 - lanes, cars: [], reach: edge + 9.0 });
    this.x.goal = this._xThing(this.x.gsnd, 0.0, this.x.goalRow * STEP);
    const each = Math.min(c.cars_per_lane, Math.max(1, Math.floor(CARS_MOST / lanes)));
    const base = c.car_speed * (1.0 + c.faster_each * this.xDone);
    const reach = this.x.reach;
    for (let i = 0; i < lanes; i++) {
      const way = choice([-1, 1]); const speed = base * uniform(0.8, 1.25);
      const first = uniform(-reach, reach);
      for (let k = 0; k < each; k++) {
        const x = ((first + k * 2 * reach / each + reach) % (2 * reach) + 2 * reach) % (2 * reach) - reach;
        const th = this._xThing(this.x.csnd, x, (n - 2 - i) * STEP);
        th.face = way; th.timer = speed;
        this.x.cars.push(th);
      }
    }
  },

  _x_crossing_update(dt, c) {
    const reach = this.x.reach;
    const [px, py] = this.playerPos;
    for (const th of this.x.cars) {
      th.x += th.face * th.timer * dt;
      if (Math.abs(th.x) > reach) th.x -= Math.sign(th.x) * 2 * reach;   // off one side, back in from the other
      this._bFollow(th, 1.0);
      if (Math.abs(th.y - py) < 0.5 && Math.abs(th.x - px) < 2.0) {
        if (this._xLoseLife('run_over')) return true;
        this.playerPos = [0.0, this._xEdge()];
        return false;
      }
    }
    this._bFollow(this.x.goal, 0.9);
    if (sq(px, py)[1] <= this.x.goalRow) {
      if (this._xRoundDone(c.points_per_crossing)) return true;
      this._x_crossing_road(c);
    }
    return false;
  },

  _x_crossing_status(c) {
    const k = this.x.lanes;
    return `Road ${this.xDone + 1}. ${k} lane${s(k)}. ${lifeWord(this.xLives)}.`;
  },

  _x_crossing_result(c, pts) { return `You crossed ${this.xDone} road${s(this.xDone)} for ${pts}. `; },

  // ================================================================ 17. mirror twin
  _x_mirror_start(c) {
    Object.assign(this.x, { tsnd: this._xSnd('target_sound', 'beacon', 'event_beacon_shimmer'), target: null });
    this.x.twin = this._xThing(this._xSnd('twin_sound', 'beacon', this.evBeacons[0]), ...this._xFreeSpot(9.0));
    this._x_mirror_target(c);
  },

  _x_mirror_target(c) {
    this._xDrop(this.x.target);
    const twin = this.x.twin;
    let spot = this._xFreeSpot(6.0);
    for (let k = 0; k < 30; k++) {
      if (Math.hypot(spot[0] - twin.x, spot[1] - twin.y) >= c.target_distance) break;
      spot = this._xFreeSpot(6.0);
    }
    this.x.target = this._xThing(this.x.tsnd, ...spot);
  },

  _x_mirror_step(c) {
    const twin = this.x.twin; const target = this.x.target;
    const [dx, dy] = this.evLastStep || [0, -1];
    const mx = -dx; const my = c.mirror === 'both' ? -dy : dy;
    const nx = twin.x + mx * STEP; const ny = twin.y + my * STEP;
    const edge = this._xEdge();
    if (Math.abs(nx) <= edge && Math.abs(ny) <= edge && !this.bWalls.has(sqKey(nx, ny))) { twin.x = nx; twin.y = ny; }
    if (sqKey(twin.x, twin.y) === sqKey(target.x, target.y)) {
      this.evPoints += c.points_per_target;
      this.xDone += 1;
      this.audio.play('event_checkpoint');
      if (!this._bEndingReached(this.xDone)) this._x_mirror_target(c);
    }
  },

  _x_mirror_update(dt, c) {
    this._bFollow(this.x.twin, 1.0);
    this._bFollow(this.x.target, 0.8);
    return false;
  },

  _x_mirror_status(c) { return `${this.xDone} spot${s(this.xDone)} reached.`; },

  _x_mirror_result(c, pts) { return `You steered the twin onto ${this.xDone} spot${s(this.xDone)} for ${pts}. `; },

  // ================================================================ 18. march in time
  _x_march_start(c) {
    Object.assign(this.x, { snd: this._xSnd('drum_sound', 'pickup', 'event_drum'), beat: c.beat_seconds, misses: 0,
      last: null, beats: 0, next: { t: this.evElapsed + 1.0, used: false, done: false, counts: false } });
  },

  _x_march_miss(c) {
    this.x.misses += 1;
    this._xPlay('event_wrong', null, 0.6);
    if (this.x.misses >= c.misses_allowed) { this._eventFinish('out_of_step'); return true; }
    return false;
  },

  _x_march_update(dt, c) {
    const nxt = this.x.next;
    if (this.evElapsed >= nxt.t) {
      this.audio.play(this.x.snd);
      this.x.beats += 1;
      this.x.last = nxt;
      this.x.next = { t: nxt.t + this.x.beat, used: false, done: false, counts: this.x.beats >= MARCH_COUNT_IN };
    }
    const last = this.x.last;
    if (last && !last.done && this.evElapsed > last.t + c.window) {
      last.done = true;
      if (last.counts && !last.used) return this._x_march_miss(c);    // a beat went by with no step
    }
    return false;
  },

  _x_march_step(c) {
    const now = this.evElapsed; const last = this.x.last; const nxt = this.x.next;
    const beat = last && (now - last.t) <= (nxt.t - now) ? last : nxt;
    if (!beat.counts) return;
    if (Math.abs(now - beat.t) <= c.window && !beat.used) { beat.used = true; return; }
    this._x_march_miss(c);                        // a step off the beat, or a second step on one
  },

  _x_march_taken(th, c) {
    this.x.beat = Math.max(c.beat_least, this.x.beat * (1.0 - c.faster_each));
    return false;
  },

  _x_march_status(c) {
    const it = this.ev.item; const n = this.evCollected;
    return `${n} ${n === 1 ? it.name : it.plural}. Out of step ${this.x.misses} of ${c.misses_allowed} times.`;
  },

  _x_march_result(c, pts) {
    const it = this.ev.item; const n = this.evCollected; const ms = this.x.misses;
    return `You collected ${n} ${n === 1 ? it.name : it.plural} for ${pts}, out of step ${ms} time${s(ms)}. `;
  },

  // ================================================================ 19. count the chimes
  _x_count_start(c) {
    this.xLives = c.lives;
    this.x.snd = this._xSnd('chime_sound', 'pickup', 'event_pickup_bell');
    this._x_count_round(c);
  },

  _x_count_round(c) {
    const n = Math.floor(this.arenaLimit / STEP);
    const most = Math.min(c.most, c.most_first + c.more_each * this.xDone, 2 * n);
    const gap = Math.max(0.15, c.chime_seconds * (1.0 - c.faster_each) ** this.xDone);
    Object.assign(this.x, { number: randint(1, Math.max(1, most)), home: n });
    this.playerPos = [0.0, n * STEP];
    this.xPending = [];
    for (let k = 0; k < this.x.number; k++) this._xSoon(1.0 + k * gap, this.x.snd, null, 1.0, 'chime');
    this.x.until = this.evElapsed + 1.0 + (this.x.number - 1) * gap;
  },

  _x_count_fire(c) {
    if (this.evElapsed < this.x.until) return;    // the chimes are still ringing
    const walked = this.x.home - sq(...this.playerPos)[1];
    if (walked === this.x.number) {
      if (!this._xRoundDone(c.points_per_round, 'event_checkpoint')) this._x_count_round(c);
      return;
    }
    this.audio.play('event_wrong');
    this._bSay(`It was ${this.x.number}.`);
    if (!this._xLoseLife('miscount')) this._x_count_round(c);
  },

  _x_count_status(c) { return `Round ${this.xDone + 1}. ${lifeWord(this.xLives)}.`; },

  _x_count_result(c, pts) { return `You counted ${this.xDone} round${s(this.xDone)} right for ${pts}. `; },

  // ================================================================ 20. rising tide
  _x_tide_start(c) {
    Object.assign(this.x, { wsnd: this._xSnd('water_sound', 'beacon', 'event_bomb_tick'),
      gsnd: this._xSnd('goal_sound', 'beacon', 'event_beacon_shimmer'),
      tsnd: this._xSnd('treasure_sound', 'beacon', this.evBeacons[0]), water: null, goal: null, treasures: [] });
    this._x_tide_level(c);
  },

  _x_tide_level(c) {
    for (const th of [...this.x.treasures, this.x.water, this.x.goal]) this._xDrop(th);
    const n = Math.floor(this.arenaLimit / STEP); const edge = this._xEdge();
    this.playerPos = [0.0, edge];
    const rise = Math.max(c.row_least, c.row_seconds * (1.0 - c.faster_each) ** this.xDone);
    Object.assign(this.x, { row: n + 2, rise, nextRise: this.evElapsed + rise, treasures: [] });
    this.x.goal = this._xThing(this.x.gsnd, 0.0, -edge);
    this.x.water = this._xThing(this.x.wsnd, 0.0, (n + 2) * STEP);
    for (let k = 0; k < c.treasures; k++) this.x.treasures.push(this._xThing(this.x.tsnd, ...this._xFreeSpot(6.0)));
  },

  _x_tide_update(dt, c) {
    if (this.evElapsed >= this.x.nextRise) {
      this.x.row -= 1;
      this.x.nextRise += this.x.rise;
    }
    const water = this.x.water;
    water.x = this.playerPos[0]; water.y = this.x.row * STEP;
    this._bFollow(water, 1.0);
    if (sq(...this.playerPos)[1] >= this.x.row) { this._eventFinish('tide'); return true; }
    for (const th of [...this.x.treasures]) {
      if (sq(th.x, th.y)[1] >= this.x.row) {        // under water now
        this.x.treasures.splice(this.x.treasures.indexOf(th), 1);
        this._xDrop(th);
      } else if (this._mReached(th, 0.8)) {
        this.x.treasures.splice(this.x.treasures.indexOf(th), 1);
        this._xDrop(th);
        this.evPoints += c.points_per_treasure;
        this.audio.play(this.evPickup);
      }
    }
    if (this._mReached(this.x.goal, 0.9)) {
      if (this._xRoundDone(c.points_per_level)) return true;
      this._x_tide_level(c);
    }
    return false;
  },

  _x_tide_status(c) {
    const rows = Math.max(0, this.x.row - sq(...this.playerPos)[1]);
    return `Tide ${this.xDone + 1}. The water is ${rows} step${s(rows)} behind you.`;
  },

  _x_tide_result(c, pts) { return `You outran ${this.xDone} tide${s(this.xDone)} for ${pts}. `; },

  // ================================================================ 21. snake
  _x_snake_start(c) {
    this.xLives = c.lives;
    Object.assign(this.x, { tail: [], length: c.start_tail, prev: sqKey(...this.playerPos),
      snd: this._xSnd('tail_sound', 'pickup', 'event_lost_tick') });
  },

  _x_snake_step(c) {
    const [hi, hj] = sq(...this.playerPos);
    const here = K(hi, hj); const tail = this.x.tail;
    if (here === this.x.prev) return;
    tail.push(this.x.prev);                       // the square just left joins the tail
    tail.splice(0, Math.max(0, tail.length - this.x.length));
    this.x.prev = here;
    if (tail.includes(here)) {
      this.audio.play('event_wrong');
      if (c.on_bite === 'end_run') { this._eventFinish('bitten'); return; }
      if (this._xLoseLife('bitten')) return;
      this.x.length = Math.max(1, Math.floor(this.x.length / 2));
      tail.splice(0, Math.max(0, tail.length - this.x.length));
      if (tail.includes(here)) tail.splice(tail.indexOf(here), 1);
    }
    for (const [a, b] of DIRS) {                  // a piece of tail right beside you hisses from its side
      if (tail.includes(K(hi + a, hj + b))) this._bShotAt(this.x.snd, [(hi + a) * STEP, (hj + b) * STEP], 0.6);
    }
  },

  _x_snake_taken(th, c) {
    this.x.length += c.tail_per_item;
    return false;
  },

  _x_snake_status(c) {
    const it = this.ev.item; const n = this.evCollected; const k = this.x.length;
    const lives = c.on_bite === 'lose_life' ? ` ${lifeWord(this.xLives)}.` : '';
    return `${n} ${n === 1 ? it.name : it.plural}. Your tail is ${k} square${s(k)} long.${lives}`;
  },

  _x_snake_result(c, pts) {
    const it = this.ev.item; const n = this.evCollected; const k = this.x.length;
    return `You collected ${n} ${n === 1 ? it.name : it.plural} for ${pts}, with a tail ${k} square${s(k)} long. `;
  },

  // ================================================================ 22. push the crate
  _x_push_start(c) {
    Object.assign(this.x, { csnd: this._xSnd('crate_sound', 'beacon', this.evBeacons[0]),
      tsnd: this._xSnd('target_sound', 'beacon', 'event_beacon_shimmer'), crate: null, target: null });
    this._x_push_new(c);
  },

  // A free square that is not in the room's outermost row, where a crate would be stuck.
  _x_push_spot(minD) {
    const n = Math.floor(this.arenaLimit / STEP);
    let spot = this._xFreeSpot(minD);
    for (let k = 0; k < 40; k++) {
      const [i, j] = sq(...spot);
      if (Math.abs(i) < n && Math.abs(j) < n) break;
      spot = this._xFreeSpot(minD);
    }
    return spot;
  },

  _x_push_new(c) {
    this._xDrop(this.x.crate);
    this._xDrop(this.x.target);
    this.x.target = null;
    const crate = this.x.crate = this._xThing(this.x.csnd, ...this._x_push_spot(c.crate_distance));
    let spot = this._x_push_spot(6.0);
    for (let k = 0; k < 40; k++) {
      if (Math.hypot(spot[0] - crate.x, spot[1] - crate.y) >= c.target_distance) break;
      spot = this._x_push_spot(6.0);
    }
    this.x.target = this._xThing(this.x.tsnd, ...spot);
  },

  _x_push_refused(nx, ny, c) {
    const crate = this.x.crate;
    if (sqKey(nx, ny) !== sqKey(crate.x, crate.y)) return false;
    const bx = crate.x + (nx - this.playerPos[0]); const by = crate.y + (ny - this.playerPos[1]);
    const edge = this._xEdge();
    if (Math.abs(bx) > edge || Math.abs(by) > edge || this.bWalls.has(sqKey(bx, by))) {
      this.audio.play('wall', { at: [crate.x, crate.y] });
      return true;                                // it will not move: neither do you
    }
    crate.x = bx; crate.y = by;
    return false;
  },

  _x_push_step(c) {
    const crate = this.x.crate; const target = this.x.target;
    if (sqKey(crate.x, crate.y) === sqKey(target.x, target.y)) {
      this.evPoints += c.points_per_crate;
      this.xDone += 1;
      this.audio.play('event_checkpoint');
      if (!this._bEndingReached(this.xDone)) this._x_push_new(c);
    }
  },

  _x_push_fire(c) {
    this.evPoints = Math.max(0, this.evPoints - c.reset_cost);
    this.audio.play('event_ping');
    [this.x.crate.x, this.x.crate.y] = this._x_push_spot(c.crate_distance);
  },

  _x_push_update(dt, c) {
    this._bFollow(this.x.crate, 0.9);
    this._bFollow(this.x.target, 0.8);
    return false;
  },

  _x_push_status(c) { return `${this.xDone} crate${s(this.xDone)} home.`; },

  _x_push_result(c, pts) { return `You pushed ${this.xDone} crate${s(this.xDone)} home for ${pts}. `; },

  // ================================================================ 23. crack the code
  _x_code_start(c) {
    Object.assign(this.x, { pads: [], wrong: 0 });
    this._x_code_round(c);
  },

  // Pads in a ring round the middle, three steps out, the first straight ahead; each
  // hums its note, and the order to step on them is secret.
  _x_code_round(c) {
    for (const th of this.x.pads) this._xDrop(th);
    const k = Math.min(c.pads_most, c.pads_first + this.xDone);
    const semis = this._mSpread(k, 3);
    this.x.pads = [];
    semis.forEach((semi, i) => {
      const ang = 2 * Math.PI * i / k - Math.PI / 2;
      const th = this._xThing(this._xNote(semi), pyRound(3 * Math.cos(ang)) * STEP, pyRound(3 * Math.sin(ang)) * STEP);
      th.note = this._xNote(semi); th.age = 0.0;
      this.x.pads.push(th);
    });
    const order = shuffle(Array.from({ length: k }, (_, i) => i));
    Object.assign(this.x, { order, at: 0, tries: 0 });
    this.playerPos = [0.0, 0.0];
  },

  _x_code_update(dt, c) {
    for (let i = 0; i < this.x.pads.length; i++) {
      const th = this.x.pads[i];
      if (!this._mStepped(th, 0.45)) continue;
      if (i === this.x.order[this.x.at]) {
        this.audio.play(th.note);
        this.x.at += 1;
        if (this.x.at >= this.x.pads.length) {
          const points = Math.max(0, c.points_per_code - c.try_cost * this.x.tries);
          if (this._xRoundDone(points)) return true;
          this._x_code_round(c);
          return false;
        }
      } else {
        this.audio.play('event_wrong');
        this.x.at = 0;
        this.x.tries += 1;
        this.x.wrong += 1;
        if (c.tries_allowed && this.x.wrong >= c.tries_allowed) { this._eventFinish('locked_out'); return true; }
      }
    }
    return false;
  },

  _x_code_status(c) {
    const t = this.x.tries;
    return `Code ${this.xDone + 1}. ${this.x.at} of ${this.x.pads.length} right. ${t} wrong tr${t === 1 ? 'y' : 'ies'}.`;
  },

  _x_code_result(c, pts) { return `You cracked ${this.xDone} code${s(this.xDone)} for ${pts}. `; },

  // ================================================================ 24. turn the tables
  _x_tables_start(c) {
    Object.assign(this.x, { snd: this._xSnd('power_sound', 'beacon', 'event_beacon_star'), power: null,
      nextPower: c.power_every_seconds, until: -1.0, warn: 0.0, downs: 0, down: [] });
  },

  _xPowered() {
    return Boolean(this.ev) && this.ev.mission === 'tables' && Boolean(this.x) && this.evElapsed < (this.x.until ?? -1.0);
  },

  // A creature's move, if the mission moves it itself: with the power, they run.
  _xMoves(th, dt) {
    if (!this._xPowered()) return false;
    const hz = th.kind || this.ev.hazards;
    const lim = this.arenaLimit - 1.0;
    const dx = th.x - this.playerPos[0]; const dy = th.y - this.playerPos[1];
    const d = Math.hypot(dx, dy) || 1.0;
    const [gx, gy] = this._bOpenNear(clamp(th.x + dx / d * 9.0, lim), clamp(th.y + dy / d * 9.0, lim));
    this._bMoveToward(th, gx, gy, hz.speed * STEP * dt, lim);
    return true;
  },

  // A creature has reached the player. With the power, it is the one brought down.
  _xTouchHandled(th) {
    if (!this._xPowered()) return false;
    th.downFor = 0.0;
    this._mStop(th);
    this.evPoints += this.ev.tables.points_per_creature;
    this.x.downs += 1;
    this.x.down.push(th);
    this.audio.play('event_checkpoint');
    return true;
  },

  _x_tables_update(dt, c) {
    const powered = this._xPowered();
    let th = this.x.power;
    if (!th) {
      this.x.nextPower -= dt;
      if (this.x.nextPower <= 0) {
        th = this.x.power = this._xThing(this.x.snd, ...this._xFreeSpot(9.0));
        th.timer = 0.0;
      }
    } else {
      th.timer += dt;
      if (this._mReached(th, 0.9)) {
        this._xDrop(th);
        Object.assign(this.x, { power: null, nextPower: c.power_every_seconds, until: this.evElapsed + c.power_seconds, warn: 0.0 });
        this.audio.play('event_pickup_star');
      } else if (th.timer >= c.power_lasts_seconds) {
        this._xDrop(th);
        Object.assign(this.x, { power: null, nextPower: c.power_every_seconds });
      }
    }
    if (powered && this.x.until - this.evElapsed <= 3.0) {
      this.x.warn -= dt;
      if (this.x.warn <= 0) {
        this.x.warn = 1.0;
        this.audio.play('countdown');
      }
    }
    if (!powered && this.x.down.length) {         // the power is over: those brought down come back
      for (const one of this.x.down) if (this.evHazards.includes(one) && one.downFor >= 0) this._eventSpawnHazard(0, one);
      this.x.down = [];
    }
    return false;
  },

  _x_tables_status(c) {
    const it = this.ev.item; const n = this.evCollected;
    const left = (this.x.until ?? -1.0) - this.evElapsed;
    const secs = Math.trunc(left) + 1;
    const power = left > 0 ? ` The power lasts ${secs} more second${s(secs)}.` : '';
    return `${n} ${n === 1 ? it.name : it.plural}. ${this.x.downs} brought down.${power}`;
  },

  _x_tables_result(c, pts) {
    const it = this.ev.item; const n = this.evCollected; const k = this.x.downs;
    return `You collected ${n} ${n === 1 ? it.name : it.plural} and brought down ${k} creature${s(k)} for ${pts}. `;
  },

  // ================================================================ 25. treasure map
  _x_map_start(c) {
    this.x.open = this._bRec('evt_chest_open.ogg', 'pickup') || this.evPickup;
    this._x_map_new(c);
  },

  // Directions to a new treasure, counted from where the player stands: one leg
  // along one line, the next along the other, never out of the room.
  _x_map_new(c) {
    const n = Math.floor(this.arenaLimit / STEP);
    const legs = Math.min(c.legs_most, c.legs_first + Math.floor(this.xDone / 3));
    let [i, j] = sq(...this.playerPos);
    let along = choice([0, 1]);                   // 0: east or west first; 1: north or south first
    const parts = [];
    for (let leg = 0; leg < legs; leg++) {
      const here = along ? j : i;
      const ways = [-1, 1].filter((w) => Math.abs(here + w) <= n);
      const w = choice(ways);
      const k = randint(1, Math.max(1, Math.min(c.steps_most, n - here * w)));
      if (along) j += w * k; else i += w * k;
      parts.push(`${k} step${s(k)} ${MAP_WORDS[along ? `0,${w}` : `${w},0`]}`);
      along = 1 - along;
    }
    Object.assign(this.x, { target: K(i, j), said: parts.join(', then ') + '.' });
    this._bSay(this.x.said);
  },

  _x_map_fire(c) {
    if (sqKey(...this.playerPos) === this.x.target) {
      this.evPoints += c.points_per_treasure;
      this.xDone += 1;
      this.audio.play(this.x.open);
      if (this._bEndingReached(this.xDone)) return;
    } else {
      this.evPoints = Math.max(0, this.evPoints - c.miss_cost);
      this.audio.play('event_wrong');
    }
    this._x_map_new(c);
  },

  _x_map_status(c) { return `${this.x.said} ${this.xDone} found.`; },

  _x_map_result(c, pts) { return `You dug up ${this.xDone} treasure${s(this.xDone)} for ${pts}. `; },
};
