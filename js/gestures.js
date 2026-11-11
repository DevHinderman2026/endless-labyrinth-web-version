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
//   slide down and hold   'back_start': the game steps backward at once, then
//                         keeps stepping (200 a minute) until the finger lifts
//   lift                  'stride_end'
// Only lifting stops it: once a finger is running or walking back, sliding it
// any way does nothing more, and a second finger does nothing (lift to shoot).
// A quick swipe up or down is a start and a stride_end at once: one step, as
// before. A finger held still does nothing (web 1.4.0: until then a still
// finger walked backwards after half a second, with a setting to turn that off;
// Russell had always meant the slide down, the mirror of the run).
// A keyboard is unchanged: a held arrow is one press.
//
// The compass (web 2.0.0, Ultimate Mode only): while the game asks for it
// (holdCompass), one finger held still for HOLD_MS emits 'hold'; that finger then
// does nothing more until it lifts. In every other mode a still finger still does
// nothing. On a keyboard, C emits 'compass'.
//
// Turning (web 4.0.0, Ultimate Mode only, Russell's design: the world turns with
// you). While the game asks for it (turnHold):
//   swipe left or right     'left' or 'right' when the finger lifts: a quick turn
//   slide left or right     'turn_left_start' or 'turn_right_start' once the
//   and hold                finger has come to rest (or has been sliding a good
//                           while): you turn until it lifts, then 'turn_end'
// A slide is a swipe for as long as the finger keeps moving, however slowly, and
// becomes a hold when it rests; so a quick turn never depends on how fast you
// swipe. A hold that ends almost as soon as it began (a finger that paused before
// lifting) was a swipe after all: 'turn_end', then 'left' or 'right', so a swipe
// always ends squared up, with its tick. Only lifting ends a held turn, and a
// second finger does nothing.
// On a keyboard there (run mode): a left or right arrow let go at once is 'left'
// or 'right'; held past KEY_HOLD_MS it is the held turn, until the key is let go
// (and let go within KEY_BRIEF_MS of that, it was a slow press: a quick turn).
// The up and down arrows send 'run_start' and 'back_start' when pressed and
// 'stride_end' when let go, so a press is one step and a hold runs or walks back;
// an arrow may be held with another, which curves a run. A Braille notetaker's
// held key (a stream of presses, see _key) is still one press: one turn, one step.

const SWIPE_MIN = 30;       // pixels a finger must travel for a swipe
const HOLD_MS = 1000;       // a finger still this long is the compass
const TAP_MOVE = 22;        // more than this and it is not a tap
const TAP_TIME = 350;       // ms a tap may last
const TAP_GAP = 330;        // ms between taps of one count
const MULTI_START = 220;    // ms within which the fingers of a multi-finger tap must land
const TURN_REST_MS = 110;   // a sliding finger still this long has come to rest: the slide is a hold
const TURN_WAIT_MS = 280;   // and one that has slid on this long without lifting is a hold too
const TURN_STILL = 8;       // pixels: less movement than this is rest
const TURN_BRIEF_MS = 200;  // a hold that ends this soon after it began was a swipe after all: one quick turn
export const KEY_HOLD_MS = 180;    // an arrow key down this long is held
export const KEY_BRIEF_MS = 170;   // and one let go this soon after that was a press after all: one quick turn

// Windows: presses of one key closer together than this are a key held down on a
// Braille notetaker (see _key).
export const HELD_GAP = 150;

export class Gestures {
  constructor(el, onGesture) {
    this.el = el;
    this.emit = onGesture;
    this.mode = 'menu';         // 'menu', 'run', 'drive' or 'practice' (menu taps, with the holds)
    this.accelHeld = false;     // driving: the throttle is held...
    this.accelBy = null;        // ...by a finger ('touch') or the up arrow ('key')
    this.taps = 0;
    this.tapTimer = null;
    this.holdCompass = false;   // Ultimate Mode: a still finger is the compass
    this.holdTimer = null;
    this.turnHold = false;      // Ultimate Mode: sliding left or right and holding turns you, and held arrows turn and run
    this.turnTimer = null;
    this.turnKey = null;        // the arrow key that is turning, or waiting to: { key, dir, on, timer }
    this.strideKey = null;      // the arrow key that is running or walking back
    this.braille = null;        // Windows: the Braille keyboard translator (main.js sets it)
    this.lastPress = new Map(); // Windows: when each key last arrived, held or not
    this.g = null;              // the gesture in progress
    const opts = { passive: false };
    el.addEventListener('touchstart', (e) => this._start(e), opts);
    el.addEventListener('touchmove', (e) => this._move(e), opts);
    el.addEventListener('touchend', (e) => this._end(e), opts);
    el.addEventListener('touchcancel', (e) => this._cancel(e), opts);
    document.addEventListener('keydown', (e) => this._key(e));
    document.addEventListener('keyup', (e) => this._keyUp(e));
    // A key still down when the page loses the keyboard is never heard to come up.
    window.addEventListener('blur', () => this._releaseKeys());
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
      this._endTurn(true);
      this._releaseKeys();
      this._cancelHold();
      this.mode = mode;
      this._resetTaps();
    }
  }

  _cancelHold() {
    clearTimeout(this.holdTimer);
    this.holdTimer = null;
  }

  // One finger has landed and nothing else is happening: if it stays still for
  // HOLD_MS, it is the compass (only when the game asks for it).
  _armHold() {
    this._cancelHold();
    if (!this.holdCompass || !this._holds()) return;
    const g = this.g;
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      if (this.g !== g || g.max !== 1 || g.moved || g.swiped || g.stride || g.strideDone || g.touches.size !== 1) return;
      g.held = true;
      g.strideDone = true;     // the finger does nothing more until it lifts
      this._resetTaps();
      this.emit('hold');
    }, HOLD_MS);
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
    if (g && g.stride) {
      g.stride = null;
      g.strideDone = true;
      this.emit('stride_end');
    } else if (g && dead) g.strideDone = true;
  }

  // A slide left or right has begun (turnHold): a swipe until the finger rests.
  _armTurn(g, dir, id, p) {
    const now = performance.now();
    g.turn = { dir, id, on: false, at: now, movedAt: now, x: p.x, y: p.y, onAt: 0 };
    const watch = () => {
      this.turnTimer = null;
      const t = g.turn;
      if (this.g !== g || !t || t.on) return;
      const at = performance.now();
      if (at - t.movedAt >= TURN_REST_MS || at - t.at >= TURN_WAIT_MS) {
        t.on = true; t.onAt = at;
        this.emit(`turn_${t.dir}_start`);
        return;
      }
      this.turnTimer = setTimeout(watch, 25);
    };
    clearTimeout(this.turnTimer);
    this.turnTimer = setTimeout(watch, 25);
  }

  // The turning finger has lifted (or the run is paused or over: `dead`). A slide
  // that never came to rest was a swipe: one quick turn.
  _endTurn(dead = false) {
    const g = this.g;
    if (!g || !g.turn) return;
    const t = g.turn;
    g.turn = null;
    g.strideDone = true;       // that finger does nothing more
    clearTimeout(this.turnTimer);
    this.turnTimer = null;
    if (t.on) {
      this.emit('turn_end');
      // (So brief a hold was a swipe after all, by a finger that paused before it
      // lifted: it goes on to the next main direction, as a swipe does.)
      if (!dead && performance.now() - t.onAt < TURN_BRIEF_MS) this.emit(t.dir);
    } else if (!dead) this.emit(t.dir);
  }

  // Whatever arrow keys were turning or running are let go of (a pause, a menu,
  // the page losing the keyboard).
  _releaseKeys() {
    const t = this.turnKey;
    if (t) {
      this.turnKey = null;
      clearTimeout(t.timer);
      if (t.on) this.emit('turn_end', { keyboard: true });
    }
    if (this.strideKey) {
      this.strideKey = null;
      this.emit('stride_end', { keyboard: true });
    }
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
    // A second finger: a finger already running, walking back or turning carries
    // on, and the new finger does nothing (lift to shoot).
    if (g.max > 1 && (g.stride || g.turn)) g.moved = true;
    if (g.max === 1) this._armHold(); else this._cancelHold();
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
      if (d > TAP_MOVE) { g.moved = true; this._cancelHold(); }
      if (g.held) continue;        // the compass finger: nothing more until it lifts
      if (g.stride) continue;      // running or walking back: only lifting stops it
      if (g.turn) {
        // Turning, or a slide that may yet be a swipe: while the finger keeps
        // moving it has not come to rest. Only lifting ends it.
        const tn = g.turn;
        if (tn.id === t.identifier && Math.hypot(p.x - tn.x, p.y - tn.y) >= TURN_STILL) {
          tn.x = p.x; tn.y = p.y; tn.movedAt = performance.now();
        }
        continue;
      }
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
        if (Math.abs(dx) > Math.abs(dy)) {
          // Left or right: a swipe; where the game asks (Ultimate Mode), a slide
          // that may become a held turn, so it waits for the finger to lift or rest.
          if (this.turnHold && this._holds() && !g.strideDone) this._armTurn(g, dx > 0 ? 'right' : 'left', t.identifier, p);
          else this.emit(dx > 0 ? 'right' : 'left');
        } else if (dy < 0 && this.mode === 'drive') {
          // Slide up and hold: the throttle stays on while this finger stays down.
          g.accelId = t.identifier;
          p.top = p.y;
          const was = this.accelHeld;
          this.accelHeld = true;
          this.accelBy = 'touch';
          if (!was) this.emit('accel_on');
        } else if (this._holds() && !g.strideDone) {
          // Slide up and hold: a run; slide down and hold: a backward walk. Either
          // lasts for as long as this finger stays down.
          g.stride = dy < 0 ? 'run' : 'back';
          this.emit(dy < 0 ? 'run_start' : 'back_start');
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
      if (g.turn && g.turn.id === t.identifier) this._endTurn();     // the turning finger itself
    }
    if (g.touches.size > 0) return;
    this._cancelHold();
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
    this._cancelHold();
    this._endStride();
    this._endTurn(true);
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
    // Windows: Braille text typed by a screen reader is read by js/braille.js first
    // (a wordsign such as "have" is the letter H); it says when it has taken a key.
    if (this.braille && this.braille.keydown(e)) return;
    const map = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      Enter: 'enter', Escape: 'back', ' ': 'space', p: 'pause', P: 'pause', h: 'help', H: 'help',
      t: 'clock', T: 'clock', y: 'yes', Y: 'yes', n: 'no', N: 'no', c: 'compass', C: 'compass',
    };
    // The desktop never turns on key repeat: a held key is one press.
    if (e.repeat && !(e.key === 'ArrowUp' && this.mode === 'drive')) {
      if (map[e.key]) e.preventDefault();
      return;
    }
    // Windows (3.2.0): a Braille notetaker's key held down arrives as a stream of
    // whole, separate presses with no repeat flag (the BrailleNote Evolve's arrows
    // walked the player on and on). A press of the same key within HELD_GAP of the
    // one before it, counted or not, is part of that hold, so the whole stream is
    // one press, as on a keyboard. Nobody presses one key on purpose that fast.
    if (this.braille && this.braille.enabled && map[e.key] && !(e.key === 'ArrowUp' && this.mode === 'drive')) {
      const now = performance.now();
      const last = this.lastPress.get(e.key);
      this.lastPress.set(e.key, now);
      if (last !== undefined && now - last < HELD_GAP) { e.preventDefault(); return; }
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
    if (this.turnHold && this.mode === 'run' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      // Ultimate Mode: a turn. Let go at once it is a quick turn (see _keyUp);
      // still down after KEY_HOLD_MS it is a held turn, until the key is let go.
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 'right' : 'left';
      const was = this.turnKey;
      if (was) {
        // The other arrow was down: its turn ends here (a quick one, if it had
        // not yet become a hold).
        this.turnKey = null;
        clearTimeout(was.timer);
        this.emit(was.on ? 'turn_end' : was.dir, { keyboard: true });
      }
      const tk = { key: e.key, dir, on: false, onAt: 0, timer: null };
      tk.timer = setTimeout(() => {
        if (this.turnKey !== tk) return;
        tk.on = true; tk.onAt = performance.now();
        this.emit(`turn_${dir}_start`, { keyboard: true });
      }, KEY_HOLD_MS);
      this.turnKey = tk;
      return;
    }
    if (this.turnHold && this.mode === 'run' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      // Ultimate Mode: a step at once, and more for as long as the key is held
      // (the touch screen's slide and hold).
      e.preventDefault();
      if (this.strideKey) this.emit('stride_end', { keyboard: true });
      this.strideKey = e.key;
      this.emit(e.key === 'ArrowUp' ? 'run_start' : 'back_start', { keyboard: true });
      return;
    }
    const g = map[e.key];
    if (!g) return;
    e.preventDefault();
    this.emit(g, { keyboard: true });
  }

  _keyUp(e) {
    // Ultimate Mode's arrows: the turn ends, or was a quick one; the run stops.
    const tk = this.turnKey;
    if (tk && e.key === tk.key) {
      e.preventDefault();
      this.turnKey = null;
      clearTimeout(tk.timer);
      if (!tk.on) this.emit(tk.dir, { keyboard: true });
      else {
        this.emit('turn_end', { keyboard: true });
        // (Held only a moment: a slow press, so a quick turn after all.)
        if (performance.now() - tk.onAt < KEY_BRIEF_MS) this.emit(tk.dir, { keyboard: true });
      }
      return;
    }
    if (this.strideKey && e.key === this.strideKey) {
      e.preventDefault();
      this.strideKey = null;
      this.emit('stride_end', { keyboard: true });
      return;
    }
    if (e.key !== 'ArrowUp' || this.accelBy !== 'key') return;
    e.preventDefault();
    this.accelHeld = false;
    this.accelBy = null;
    this.emit('accel_off', { keyboard: true });
  }
}
