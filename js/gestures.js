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

const SWIPE_MIN = 30;       // pixels a finger must travel for a swipe
const TAP_MOVE = 22;        // more than this and it is not a tap
const TAP_TIME = 350;       // ms a tap may last
const TAP_GAP = 330;        // ms between taps of one count
const MULTI_START = 220;    // ms within which the fingers of a multi-finger tap must land

export class Gestures {
  constructor(el, onGesture) {
    this.el = el;
    this.emit = onGesture;
    this.mode = 'menu';         // 'menu' or 'run'
    this.taps = 0;
    this.tapTimer = null;
    this.g = null;              // the gesture in progress
    const opts = { passive: false };
    el.addEventListener('touchstart', (e) => this._start(e), opts);
    el.addEventListener('touchmove', (e) => this._move(e), opts);
    el.addEventListener('touchend', (e) => this._end(e), opts);
    el.addEventListener('touchcancel', (e) => this._cancel(e), opts);
    document.addEventListener('keydown', (e) => this._key(e));
  }

  setMode(mode) {
    if (mode !== this.mode) {
      this.mode = mode;
      this._resetTaps();
    }
  }

  _resetTaps() {
    this.taps = 0;
    clearTimeout(this.tapTimer);
    this.tapTimer = null;
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
      if (d > TAP_MOVE) g.moved = true;
      if (g.max === 1 && !g.swiped && d >= SWIPE_MIN) {
        g.swiped = true;
        this._resetTaps();
        if (Math.abs(dx) > Math.abs(dy)) this.emit(dx > 0 ? 'right' : 'left');
        else this.emit(dy > 0 ? 'down' : 'up');
      }
    }
  }

  _end(e) {
    const g = this.g;
    if (!g) return;
    e.preventDefault();
    for (const t of e.changedTouches) g.touches.delete(t.identifier);
    if (g.touches.size > 0) return;
    this.g = null;
    if (g.swiped || g.moved) return;
    if (performance.now() - g.start > TAP_TIME + (g.max > 1 ? 150 : 0)) return;
    if (g.max === 2) { this._resetTaps(); this.emit('space'); return; }
    if (g.max === 3) { this._resetTaps(); this.emit('pause'); return; }
    if (g.max === 1) this._tap();
  }

  _cancel() {
    this.g = null;
  }

  _tap() {
    this.taps += 1;
    clearTimeout(this.tapTimer);
    if (this.mode === 'run') {
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
    const g = map[e.key];
    if (!g) return;
    e.preventDefault();
    this.emit(g, { keyboard: true });
  }
}
