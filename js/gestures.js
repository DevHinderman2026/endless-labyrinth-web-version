// Touch gestures, turned into the game's keys.
//
//   swipe up, down, left, right   the arrow keys
//   double tap                    Enter
//   triple tap                    back (Escape)      menus only
//   four taps                     help (H)           menus only
//   two-finger tap                Space
//   three-finger tap              pause and resume
//
// In menus a tap count is final once no further tap follows for a moment, so a
// double tap waits that moment to be sure it is not a triple. During a run only
// the double tap counts, so it acts at once and a stray extra tap can never quit
// a run. A Bluetooth keyboard works too, with the desktop game's keys.
//
// Driving ('drive' mode, Russell's decision): put one finger down and slide it
// up: 'accel_on', and the car accelerates until that finger lifts ('accel_off')
// or slides back down from its highest point ('accel_off', then one 'down': one
// brake). That is the desktop's held up arrow. A fresh swipe down is one brake
// ('down'); swipes left and right are 'left' and 'right'. Taps work as in a run.
// A keyboard's held up arrow accelerates too (keydown and keyup).
//
// Running and walking backwards (web 1.2.0, Russell's design; touch only, in
// 'run' mode, so every mode but driving, and in Gesture Practice):
//   slide up and hold     'run_start': the game steps forward at once, then keeps
//                         stepping (280 a minute) until the finger lifts
//   hold still (0.5 s)    'back_start': the game steps backward, then keeps
//                         stepping (200 a minute) until the finger lifts
//   lift                  'stride_end'
// Only lifting stops it: once a finger is running or walking back, sliding it
// any way does nothing more, and a second finger does nothing (lift to shoot).
// A quick swipe up is a run_start and a stride_end at once: one step, as before.
// A keyboard is unchanged: a held arrow is one press.

const SWIPE_MIN = 30;       // pixels a finger must travel for a swipe
const TAP_MOVE = 22;        // more than this and it is not a tap
const TAP_TIME = 350;       // ms a tap may last
const TAP_GAP = 330;        // ms between taps of one count
const MULTI_START = 220;    // ms within which the fingers of a multi-finger tap must land
const HOLD_BACK = 500;      // ms a still finger waits before it walks backwards (Russell)

export class Gestures {
  constructor(el, onGesture) {
    this.el = el;
    this.emit = onGesture;
    this.mode = 'menu';         // 'menu', 'run', 'drive' or 'practice' (menu taps, with the holds)
    this.accelHeld = false;     // driving: the throttle is held...
    this.accelBy = null;        // ...by a finger ('touch') or the up arrow ('key')
    this.holdBack = true;       // a still finger walks backwards (the game's setting)
    this.taps = 0;
    this.tapTimer = null;
    this.g = null;              // the gesture in progress
    const opts = { passive: false };
    el.addEventListener('touchstart', (e) => this._start(e), opts);
    el.addEventListener('touchmove', (e) => this._move(e), opts);
    el.addEventListener('touchend', (e) => this._end(e), opts);
    el.addEventListener('touchcancel', (e) => this._cancel(e), opts);
    document.addEventListener('keydown', (e) => this._key(e));
    document.addEventListener('keyup', (e) => this._keyUp(e));
  }

  setMode(mode) {
    if (mode !== this.mode) {
      // A pause, help, a menu or the end of a run lets go of the throttle. Passing
      // from one chaos road to the next keeps it: the desktop reads the held up
      // arrow every frame, so a finger still down accelerates on the new road.
      if (mode === 'menu') this._dropAccel();
      // A pause, a menu or a driving road ends a run or a backward walk; the finger
      // still down does nothing more until it lifts.
      this._endStride(true);
      this.mode = mode;
      this._resetTaps();
    }
  }

  _resetTaps() {
    this.taps = 0;
    clearTimeout(this.tapTimer);
    this.tapTimer = null;
  }

  _holds() { return this.mode === 'run' || this.mode === 'practice'; }

  // The finger that was running or walking back has lifted (or the run is over).
  _endStride(dead = false) {
    const g = this.g;
    if (g) { clearTimeout(g.holdTimer); g.holdTimer = null; }
    if (g && g.stride) {
      g.stride = null;
      g.strideDone = true;
      this.emit('stride_end');
    } else if (g && dead) g.strideDone = true;
  }

  // Buttons and links on the page keep working as buttons and links.
  static _native(e) { return e.target && e.target.closest && e.target.closest('button, a, [data-native]'); }

  _start(e) {
    if (Gestures._native(e)) return;
    e.preventDefault();
    const now = performance.now();
    if (!this.g) {
      this.g = { start: now, touches: new Map(), max: 0, swiped: false, moved: false, lastStart: now };
    }
    for (const t of e.changedTouches) {
      this.g.touches.set(t.identifier, { x: t.clientX, y: t.clientY, x0: t.clientX, y0: t.clientY });
    }
    this.g.lastStart = now;
    this.g.max = Math.max(this.g.max, this.g.touches.size);
    if (this.g.max > 1 && now - this.g.start > MULTI_START) this.g.moved = true;   // not one tap
    const g = this.g;
    if (g.max > 1) {
      // A second finger: not a hold. A finger already running or walking back
      // carries on, and the new finger does nothing (lift to shoot).
      clearTimeout(g.holdTimer); g.holdTimer = null;
      if (g.stride) g.moved = true;
    } else if (this._holds() && this.holdBack !== false && !g.holdTimer && !g.stride && !g.strideDone) {
      // One still finger, held long enough, walks backwards.
      g.holdTimer = setTimeout(() => {
        g.holdTimer = null;
        if (this.g !== g || g.max !== 1 || g.moved || g.swiped || g.stride || g.strideDone || !this._holds() || this.holdBack === false) return;
        g.stride = 'back';
        g.swiped = true;           // no swipe, and no tap, from this finger now
        this._resetTaps();
        this.emit('back_start');
      }, HOLD_BACK);
    }
  }

  _move(e) {
    if (!this.g && Gestures._native(e)) return;
    e.preventDefault();
    const g = this.g;
    if (!g) return;
    for (const t of e.changedTouches) {
      const p = g.touches.get(t.identifier);
      if (!p) continue;
      p.x = t.clientX; p.y = t.clientY;
      const dx = p.x - p.x0;
      const dy = p.y - p.y0;
      const d = Math.hypot(dx, dy);
      if (d > TAP_MOVE) { g.moved = true; clearTimeout(g.holdTimer); g.holdTimer = null; }
      if (g.stride) continue;      // running or walking back: only lifting stops it
      if (g.accelId === t.identifier) {
        // The accelerating finger: sliding back down from its highest point lets
        // go of the throttle and brakes once.
        p.top = Math.min(p.top, p.y);
        if (p.y - p.top >= SWIPE_MIN) {
          this._releaseAccel();
          this.emit('down');
        }
        continue;
      }
      if (g.max === 1 && !g.swiped && d >= SWIPE_MIN) {
        g.swiped = true;
        this._resetTaps();
        if (Math.abs(dx) > Math.abs(dy)) this.emit(dx > 0 ? 'right' : 'left');
        else if (dy < 0 && this.mode === 'drive') {
          // Slide up and hold: the throttle stays on while this finger stays down.
          g.accelId = t.identifier;
          p.top = p.y;
          const was = this.accelHeld;
          this.accelHeld = true;
          this.accelBy = 'touch';
          if (!was) this.emit('accel_on');
        } else if (dy < 0 && this._holds() && !g.strideDone) {
          // Slide up and hold: a run, for as long as this finger stays down.
          g.stride = 'run';
          this.emit('run_start');
        } else this.emit(dy > 0 ? 'down' : 'up');
      }
    }
  }

  _end(e) {
    const g = this.g;
    if (!g) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      g.touches.delete(t.identifier);
      if (g.accelId === t.identifier) this._releaseAccel();
    }
    if (g.touches.size > 0) return;
    clearTimeout(g.holdTimer); g.holdTimer = null;
    if (g.stride) { this._endStride(); this.g = null; return; }
    this.g = null;
    if (g.strideDone) return;
    if (g.swiped || g.moved) return;
    if (performance.now() - g.start > TAP_TIME + (g.max > 1 ? 150 : 0)) return;
    if (g.max === 2) { this._resetTaps(); this.emit('space'); return; }
    if (g.max === 3) { this._resetTaps(); this.emit('pause'); return; }
    if (g.max === 1) this._tap();
  }

  _cancel() {
    if (this.g && this.g.accelId !== undefined && this.g.accelId !== null) this._releaseAccel();
    this._endStride();
    this.g = null;
  }

  // Driving: the throttle let go of, by the finger lifting or sliding down, or
  // the up arrow released.
  _releaseAccel() {
    if (this.g) this.g.accelId = null;
    if (!this.accelHeld) return;
    this.accelHeld = false;
    this.accelBy = null;
    this.emit('accel_off');
  }

  // Driving has ended or is held: the throttle is simply gone (the game lets go
  // of it too), and that finger does nothing more.
  _dropAccel() {
    if (this.g) this.g.accelId = null;
    this.accelHeld = false;
    this.accelBy = null;
  }

  _tap() {
    this.taps += 1;
    clearTimeout(this.tapTimer);
    if (this.mode === 'run' || this.mode === 'drive') {
      if (this.taps >= 2) { this._resetTaps(); this.emit('enter'); return; }
      this.tapTimer = setTimeout(() => this._resetTaps(), TAP_GAP);
      return;
    }
    this.tapTimer = setTimeout(() => {
      const n = this.taps;
      this._resetTaps();
      if (n === 2) this.emit('enter');
      else if (n === 3) this.emit('back');
      else if (n >= 4) this.emit('help');
      else this.emit('tap');       // one tap: does nothing, but practice reports it
    }, TAP_GAP);
  }

  _key(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const map = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      Enter: 'enter', Escape: 'back', ' ': 'space', p: 'pause', P: 'pause', h: 'help', H: 'help',
      t: 'clock', T: 'clock', y: 'yes', Y: 'yes', n: 'no', N: 'no',
    };
    // The desktop never turns on key repeat: a held key is one press.
    if (e.repeat && !(e.key === 'ArrowUp' && this.mode === 'drive')) {
      if (map[e.key]) e.preventDefault();
      return;
    }
    if (e.key === 'ArrowUp' && this.mode === 'drive') {
      // The held up arrow is the throttle; its repeats change nothing.
      e.preventDefault();
      if (!this.accelHeld) {
        this.accelHeld = true;
        this.accelBy = 'key';
        this.emit('accel_on', { keyboard: true });
      }
      return;
    }
    const g = map[e.key];
    if (!g) return;
    e.preventDefault();
    this.emit(g, { keyboard: true });
  }

  _keyUp(e) {
    if (e.key !== 'ArrowUp' || this.accelBy !== 'key') return;
    e.preventDefault();
    this.accelHeld = false;
    this.accelBy = null;
    this.emit('accel_off', { keyboard: true });
  }
}
