// Turning, shared by every mode that turns (web 5.0.0).
//
// Ultimate Mode has turned with you since web 4.0.0: the facing is an angle, a
// swipe left or right is a quick turn of 30 degrees, a held turn is free and
// stops where you let go, and a step goes exactly where you face. From 5.0.0
// Standard, Battle, Tower, Island and Chaos's walking levels turn the same way,
// on this one piece of code, so the turn feels the same everywhere.
//
// Nothing here knows about a mode. The facing and the turn under way are kept on
// a holder object the mode owns ({ face, turn, turnWas }); the mode says what a
// new facing means (the listener turns: AudioEngine.setFacing) and plays the
// ticks. The walk over a floor of squares (walkStep) is here too: stopped by a
// wall, and sliding along it when you meet it at a slant.

export const DEG = Math.PI / 180;
export const TWO_PI = Math.PI * 2;
export const QUARTER = Math.PI / 2;
// A held turn's speed. (Until 5.0.0 it began at 30 degrees a second, a nudge for
// aiming; Russell, 11 November 2026: a short slide turned too little to hear.
// It now begins fast enough that a third of a second is about a quick turn.)
export const TURN_SLOW = 75 * DEG;
export const TURN_FAST = 150 * DEG;             // a full circle in 2.4 seconds
export const TURN_EASE = [0.25, 0.85];          // seconds held: the first speed until the first, full speed by the second
export const TURN_STEP = 30 * DEG;              // a quick turn (a flick, one press of an arrow)
export const TURN_STEPS = 12;                   // of them in a full circle
export const TURN_QUICK = 240 * DEG;            // a quick turn sweeps at this rate: its 30 degrees in an eighth of a second
export const TURN_LIMIT = 30;                   // seconds: no held turn lasts longer (a finger or a key whose lifting never arrived)
export const TURN_BRIEF = 0.3;                  // seconds: a held turn let go within this may have been a swipe after all
export const TICK_LEVEL = 0.5;                  // the tick at each main direction, as you turn
export const CLICK_LEVEL = 0.3;                 // the softer click of a quick turn that lands between two main directions
export const SLIDE_MIN = 0.75;                  // of a step: a blocked step still slides along the wall when its part along the wall is at least this
export const STEP_SAMPLE = 0.25;                // of a square: how finely a step's path is checked against the walls
export const COMPASS_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // north, east, south, west (exact, so a squared-up step is square to square)
export const FACING_WORDS = ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east',
  'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'];
export const MAIN_WORDS = ['north', 'east', 'south', 'west'];

export const wrapAngle = (a) => { a %= TWO_PI; return a < 0 ? a + TWO_PI : a; };

// Which main direction an angle is (0 north, 1 east, 2 south, 3 west), or -1 when
// it lies between two of them.
export function mainIndex(angle) {
  const q = wrapAngle(angle) / QUARTER;
  const k = Math.round(q);
  return Math.abs(q - k) < 1e-6 ? k % 4 : -1;
}

// An angle as it is kept: exactly, when squared up; and exactly on a quick turn's step.
export function snapFace(angle) {
  const k = mainIndex(angle);
  if (k >= 0) return k * QUARTER;
  const st = Math.round(angle / TURN_STEP);
  return Math.abs(angle / TURN_STEP - st) < 1e-6 ? wrapAngle(st * TURN_STEP) : wrapAngle(angle);
}

// The way a facing points, as a unit vector in the world ([east, south]).
export function forwardOf(face) {
  const k = mainIndex(face);
  if (k >= 0) return COMPASS_DIRS[k];
  return [Math.sin(face), -Math.cos(face)];
}

export function facingWord(face) { return FACING_WORDS[Math.round(wrapAngle(face) / (QUARTER / 4)) % 16]; }

// A place as you meet it: [to your right, ahead of you], from where you stand and
// the way you face. (Ahead is positive.)
export function relTo(face, from, pos) {
  const f = forwardOf(face);
  const dx = pos[0] - from[0]; const dy = pos[1] - from[1];
  return [dx * -f[1] + dy * f[0], dx * f[0] + dy * f[1]];
}

// A fresh holder: facing north, no turn under way.
export function newTurn() { return { face: 0, turn: null, turnWas: null }; }

// A quick turn: to the next step of 30 degrees that way, so three of them from a
// main direction reach the next one. Stopped in between two steps by a held turn,
// it takes you onto the next step.
export function turnQuick(h, dir) {
  const was = h.turnWas;
  h.turnWas = null;
  if (h.turn && h.turn.quick) {
    // A second swipe before the first has landed carries on from where that one
    // is going (three swipes are a quarter turn; one each way brings you back).
    const target = (Math.round(h.turn.target / TURN_STEP) + dir) * TURN_STEP;
    h.turn = { quick: true, at: h.turn.at, target, dir: target >= h.turn.at ? 1 : -1 };
    return;
  }
  // A swipe that began as a hold (the finger paused before it lifted, or the key
  // was let go a moment late) counts from where that hold began, so the little
  // it had already turned never carries it past the direction it was going to.
  let from = h.face; let at = h.face;
  if (was && was.dir === dir) { from = was.from; at = was.from + dir * wrapAngle((h.face - was.from) * dir); }
  const q = from / TURN_STEP;
  const k = dir > 0 ? Math.floor(q + 1e-6) + 1 : Math.ceil(q - 1e-6) - 1;
  h.turn = { quick: true, at, target: k * TURN_STEP, dir };
}

// A held turn: free until it is let go; you stop exactly there. `face(angle)` is
// the mode's own way of facing (a quick turn still under way lands first).
export function turnStart(h, dir, face) {
  if (h.turn && h.turn.quick) face(h.turn.target);
  h.turn = { free: true, dir, t: 0, from: h.face };
  h.turnWas = null;
}

export function turnEnd(h) {
  if (!h || !h.turn || !h.turn.free) return;
  // (Let go almost at once, it may have been a swipe: remembered until the next
  // frame, in case the swipe follows; see turnQuick.)
  h.turnWas = h.turn.t < TURN_BRIEF ? { from: h.turn.from, dir: h.turn.dir } : null;
  h.turn = null;
}

// Whatever turn is under way ends now (a pause, help, a ride): a quick turn lands
// where it was going, a held one stops where it is.
export function turnStop(h, face) {
  if (!h) return;
  h.turnWas = null;
  if (!h.turn) return;
  if (h.turn.quick) face(h.turn.target, true);
  h.turn = null;
}

// The turn, every frame. `on` is the mode's: face(angle, instant), tick(k) for a
// main direction passed or landed on, click() for a quick turn landing between
// two of them, landed(k) once a quick turn is over (k is the main direction, or -1).
export function updateTurn(h, dt, on) {
  const t = h.turn;
  h.turnWas = null;      // (a swipe that follows a brief hold arrives with its end, never a frame later)
  if (!t) return;
  if (t.quick) {
    const step = TURN_QUICK * dt;
    const left = (t.target - t.at) * t.dir;
    if (left > step + 1e-9) { t.at += t.dir * step; on.face(t.at); return; }
    // Landed on its step: on a main direction its tick (unless a brief hold had
    // already carried you just past it, and ticked there), between two of them
    // the softer click.
    h.turn = null;
    on.face(t.target);
    const k = mainIndex(h.face);
    if (k < 0) { if (on.click) on.click(); } else if (left > -1e-9 && on.tick) on.tick(k);
    if (on.landed) on.landed(k);
    return;
  }
  t.t += dt;
  if (t.t > TURN_LIMIT) { h.turn = null; return; }
  const ease = Math.min(1, Math.max(0, (t.t - TURN_EASE[0]) / (TURN_EASE[1] - TURN_EASE[0])));
  const speed = TURN_SLOW + (TURN_FAST - TURN_SLOW) * ease;
  const a = h.face / QUARTER;
  const to = h.face + t.dir * speed * dt;
  const b = to / QUARTER;
  // A tick for each main direction passed (not for the one you set off from).
  if (on.tick) {
    if (t.dir > 0) { for (let m = Math.floor(a + 1e-9) + 1; m <= Math.floor(b + 1e-9); m++) on.tick(m); }
    else { for (let m = Math.ceil(a - 1e-9) - 1; m >= Math.ceil(b - 1e-9); m--) on.tick(m); }
  }
  on.face(to);
}

// One step's walk over a floor of squares: from `from`, `len` units along `dir`
// (a unit vector), wherever `open(pos)` says there is floor. `cellOf(pos)` names
// the square a place is in and `posOf(cx, cy)` gives a square's middle; `unit` is
// a square's width. Clear all the way: there. Stopped by a wall: along it, when
// the step meets it at a slant. Returns { pos, moved, hit }: where you end, how
// far that is, and where the wall was met (null when nothing was in the way).
export function walkStep(from, dir, len, open, cellOf, posOf, unit = 1) {
  // The square you stand in never stops you leaving it. You are always on floor,
  // so this changes nothing; but if a fault ever put you inside a wall, you could
  // still walk out of it, as you could when a step was square to square.
  const home = cellOf(from);
  const clear = (p) => { const c = cellOf(p); return (c[0] === home[0] && c[1] === home[1]) || open(p); };
  const sample = STEP_SAMPLE * unit;
  const shutAt = (vx, vy) => {
    const n = Math.max(1, Math.ceil(Math.hypot(vx, vy) / sample));
    let prev = from;
    for (let i = 1; i <= n; i++) {
      // (The last look is at the very place the step would end, to the last digit.)
      const p = i === n ? [from[0] + vx, from[1] + vy] : [from[0] + vx * i / n, from[1] + vy * i / n];
      if (!clear(p)) return p;
      // Never between two shut squares that meet at a corner.
      const a = cellOf(prev); const b = cellOf(p);
      if (a[0] !== b[0] && a[1] !== b[1] && !clear(posOf(b[0], a[1])) && !clear(posOf(a[0], b[1]))) return p;
      prev = p;
    }
    return null;
  };
  const vx = dir[0] * len; const vy = dir[1] * len;
  const hit = shutAt(vx, vy);
  if (!hit) return { pos: [from[0] + vx, from[1] + vy], moved: len, hit: null };
  // Along it: the bigger part of the step first. When the way along it is the
  // way you are mostly facing (a corridor you face a little off its line), the
  // step glides a whole step down it (web 4.1.2). Otherwise, only the part of the
  // step that runs along it.
  const slideMin = SLIDE_MIN * unit;
  const bigX = Math.abs(vx) >= Math.abs(vy);
  const parts = bigX ? [[vx, 0], [0, vy]] : [[0, vy], [vx, 0]];
  for (let i = 0; i < parts.length; i++) {
    const [sx, sy] = parts[i];
    const part = Math.abs(sx) + Math.abs(sy);
    if (part < slideMin) continue;
    if (i === 0) {
      const gx = sx ? Math.sign(sx) * len : 0; const gy = sy ? Math.sign(sy) * len : 0;
      if (!shutAt(gx, gy)) return { pos: [from[0] + gx, from[1] + gy], moved: len, hit };
    }
    if (!shutAt(sx, sy)) return { pos: [from[0] + sx, from[1] + sy], moved: part, hit };
  }
  return { pos: [from[0], from[1]], moved: 0, hit };
}
