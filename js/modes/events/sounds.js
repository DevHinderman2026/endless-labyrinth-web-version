// The event sounds made while the game runs, as the desktop makes them: a
// recording from the event library taken on for a role in an event
// (load_event_recording), the Real and False bells (ring_period_copy, warp_copy),
// the pitched notes of In Order, Memory and Find the Pairs (_pitch), and the dull
// "behind you" copy of each (behind_copy), made before it first plays, as the
// desktop's _copies_now does. The desktop's naming rules for echoes and dull copies
// (reverb_family, reverb_rooms_for, reverb_takes, reverb_is_loop, behind_applies)
// are ported here too, so a sound named on the fly gets the echo and dull copy the
// desktop gives the same name.

import { RULES } from '../../sound-rules.js';

const SR = 44100;
const I16 = 32768;          // the desktop's sounds are int16 arrays; ours are -1..1

// ------------------------------------------------------------ the desktop's naming rules
const REVERB_ROOMS = ['lab', 'tower', 'battle', 'tunnel', 'cathedral', 'hall'];
const REVERB_EVENT_ROOMS = ['cathedral', 'hall'];
const REVERB_EVENT_SHARED = ['step', 'boundary', 'countdown', 'credit_beacon_battle_', 'credit_10', 'credit_20',
  'credit_30', 'credit_beacon_event_', 'credit_coins_', 'empty_click', 'laser', 'explosion', 'player_hit', 'enemy_hit',
  'obstacle_', 'exit_morse', 'stairs_climb', 'ammo'];
const REVERB_EVENT_ALSO = ['key_beacon', 'key_pickup', 'guardian', 'guardian_hit'];
const REVERB_TAKES = 3;
const REVERB_VARIED = ['laser', 'explosion', 'empty_click', 'player_hit', 'wall', 'ammo', 'enemy_hit', 'enemy_grab',
  'item_throw', 'potion_drink', 'credit_', 'countdown', 'wave_', 'stairs_climb', 'crash', 'brake', 'lane_change',
  'drv_skid', 'key_pickup', 'treasure_pickup'];
const REVERB_NEVER = ['ambience_', 'tower_amb_', 'battle_amb_', 'battle_beat_', 'lab_', 'tow_', 'bat_', 'drm_', 'island_',
  'step_sand', 'underwater', 'bubbles', 'gasp', 'swim', 'drown', 'elevator', 'diver_', 'vent', 'key_', 'treasure_',
  'guardian', 'ev_', 'drv_road', 'menu_move', 'health_low', 'stairs_beacon_gen', 'island_demo', 'event_amb_'];
const REVERB_DRIVING = ['engine_', 'enemy_car', 'drv_', 'lane_change', 'credit_drive_', 'credit_beacon_drive_', 'crash', 'brake'];
const REVERB_ON_ROAD = ['laser', 'explosion', 'ammo', 'ammo_beacon', 'wall', 'credit_chaos', 'countdown', 'empty_click',
  'exit_morse', 'credit_beacon_30', 'credit_beacon_40', 'credit_beacon_50', 'credit_beacon_60'];
const REVERB_TOWER_ONLY = ['stairs', 'item_', 'enemy_windup', 'enemy_grab', 'enemy_hit', 'potion'];
const REVERB_BATTLE_ONLY = ['wave_', 'battle_'];
const REVERB_LOOPS = ['obstacle_', 'engine_', 'enemy_car', 'item_buzz', 'exit_morse', 'beacon', 'guardian', 'vent',
  'diver_tap', 'elevator_hum', 'drv_road', 'event_pad', 'event_bomb_tick', 'event_falling'];
const BEHIND_SOUNDS = ['obstacle_', 'enemy_windup', 'enemy_grab', 'enemy_hit', 'guardian', 'item_buzz', 'item_throw',
  'prox_', 'exit_morse', 'explosion', 'wall', 'diver_tap', 'key_beacon', 'treasure_beacon', 'elevator_hum',
  'elevator_ding', 'elevator_arrive', 'event_pickup_', 'event_pad', 'event_bomb_tick', 'event_falling', 'event_cue',
  'event_checkpoint', 'event_wrong'];
const BEHIND_EXACT = ['vent'];

const starts = (name, list) => list.some((p) => name.startsWith(p));
const ends = (name, list) => list.some((p) => name.endsWith(p));

export function behindApplies(name) {
  if (ends(name, ['demo', '_muffled']) || starts(name, ['enemy_car', 'drv_', 'island_', 'credit_beacon_drive', 'credit_drive', 'stairs_beacon_gen'])) return false;
  return name.includes('beacon') || starts(name, BEHIND_SOUNDS) || BEHIND_EXACT.includes(name);
}

export function reverbFamily(name) {
  if ((starts(name, REVERB_NEVER) && !REVERB_EVENT_ALSO.includes(name)) || name.endsWith('_muffled')) return 'warning';
  if (name === 'wall') return 'wall';
  if (name.startsWith('event_beacon_hazard_')) return 'enemy';
  if (name.includes('beacon') || starts(name, ['prox_', 'exit_morse', 'vent', 'diver_tap'])) return 'beacon';
  if (starts(name, ['obstacle_', 'enemy_', 'guardian', 'item_buzz'])) return 'enemy';
  if (name.startsWith('engine_')) return 'vehicle';
  if (starts(name, ['step', 'stairs_climb'])) return 'step';
  return 'event';
}

export function reverbRoomsFor(name) {
  if (reverbFamily(name) === 'warning') return [];
  if (name.startsWith('event_room_')) {
    const room = name.slice('event_room_'.length).split('_')[0];
    return REVERB_ROOMS.includes(room) ? [room] : [];
  }
  if (name.startsWith('event_') || REVERB_EVENT_ALSO.includes(name)) return ['lab', 'tower', 'battle', ...REVERB_EVENT_ROOMS];
  if (starts(name, REVERB_DRIVING)) return ['tunnel'];
  let rooms = ['lab', 'tower', 'battle'];
  if (starts(name, REVERB_TOWER_ONLY)) rooms = ['tower'];
  else if (starts(name, REVERB_BATTLE_ONLY)) rooms = ['battle'];
  if (starts(name, REVERB_EVENT_SHARED)) {
    for (const r of ['lab', 'tower', 'battle', ...REVERB_EVENT_ROOMS]) if (!rooms.includes(r)) rooms.push(r);
  }
  if (REVERB_ON_ROAD.includes(name)) rooms.push('tunnel');
  return rooms;
}

export function reverbIsLoop(name) {
  return (starts(name, REVERB_LOOPS) || name.includes('beacon')) && !name.endsWith('demo')
    && !['guardian_hit', 'key_pickup'].includes(name);
}

export function reverbTakes(name) {
  if (reverbIsLoop(name) || !starts(name, REVERB_VARIED)) return 1;
  return REVERB_TAKES;
}

// A sound named on the fly gets the echo rules the desktop gives its name.
function registerRules(name) {
  RULES.FAMILY[name] = reverbFamily(name);
  RULES.ROOMS[name] = reverbRoomsFor(name);
  const t = reverbTakes(name);
  if (t > 1) RULES.TAKES[name] = t; else delete RULES.TAKES[name];
}

// ------------------------------------------------------------ FFT (any length)
const twiddles = new Map();
function radix2(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  let tw = twiddles.get(n);
  if (!tw) {
    tw = { c: new Float64Array(n / 2), s: new Float64Array(n / 2) };
    for (let k = 0; k < n / 2; k++) { tw.c[k] = Math.cos(2 * Math.PI * k / n); tw.s[k] = Math.sin(2 * Math.PI * k / n); }
    twiddles.set(n, tw);
  }
  const sg = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1; const step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const wr = tw.c[k * step]; const wi = sg * tw.s[k * step];
        const a = i + k; const b = a + half;
        const xr = re[b] * wr - im[b] * wi; const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  }
}

const blue = new Map();
// In place, unnormalised (an inverse is scaled by 1/n by the caller).
function fft(re, im, inverse = false) {
  const n = re.length;
  if ((n & (n - 1)) === 0) { radix2(re, im, inverse); return; }
  let b = blue.get(n);
  if (!b) {
    let M = 1; while (M < 2 * n - 1) M <<= 1;
    const wr = new Float64Array(n); const wi = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const a = Math.PI * ((k * k) % (2 * n)) / n;
      wr[k] = Math.cos(a); wi[k] = -Math.sin(a);
    }
    const br = new Float64Array(M); const bi = new Float64Array(M);
    br[0] = wr[0]; bi[0] = -wi[0];
    for (let k = 1; k < n; k++) { br[k] = br[M - k] = wr[k]; bi[k] = bi[M - k] = -wi[k]; }
    radix2(br, bi, false);
    b = { M, wr, wi, br, bi };
    if (blue.size > 8) blue.clear();
    blue.set(n, b);
  }
  const { M, wr, wi, br, bi } = b;
  const ar = new Float64Array(M); const ai = new Float64Array(M);
  const s = inverse ? -1 : 1;     // the inverse is the conjugate chirp
  for (let k = 0; k < n; k++) {
    const xr = re[k]; const xi = s * im[k];
    ar[k] = xr * wr[k] - xi * wi[k]; ai[k] = xr * wi[k] + xi * wr[k];
  }
  radix2(ar, ai, false);
  for (let k = 0; k < M; k++) {
    const r = ar[k] * br[k] - ai[k] * bi[k]; const i = ar[k] * bi[k] + ai[k] * br[k];
    ar[k] = r; ai[k] = i;
  }
  radix2(ar, ai, true);
  for (let k = 0; k < n; k++) {
    const r = ar[k] / M; const i = ai[k] / M;
    re[k] = r * wr[k] - i * wi[k]; im[k] = s * (r * wi[k] + i * wr[k]);
  }
}

// ------------------------------------------------------------ random numbers, seeded
function gauss(seed) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let x; let y; let r;
    do { x = u() * 2 - 1; y = u() * 2 - 1; r = x * x + y * y; } while (r >= 1 || r === 0);
    const f = Math.sqrt(-2 * Math.log(r) / r);
    spare = y * f;
    return x * f;
  };
}

// ------------------------------------------------------------ the desktop's sound making
// A sound here is [left, right], Float64Arrays in the desktop's int16 units.
export function fromBuffer(buf) {
  const L = Float64Array.from(buf.getChannelData(0), (v) => v * I16);
  const R = buf.numberOfChannels > 1 ? Float64Array.from(buf.getChannelData(1), (v) => v * I16) : Float64Array.from(L);
  return [L, R];
}
const toInt16 = (v) => Math.trunc(Math.max(-32768, Math.min(32767, v)));

const BEHIND_LEVEL = 0.75;
const BEHIND_SMEAR = 0.03;
const BEHIND_SMEAR_MIX = 0.45;
const BEHIND_CUT = [300.0, 1800.0];
const BEHIND_CUT_SPAN = 2.2;

// The dull copy of a sound: how it sounds from behind (the desktop's behind_copy).
// Its treble is rolled off from where its own energy is centred, its attack is
// blurred over a few hundredths of a second, and it is set a little under the sound
// it copies. A loop is made circularly. Returns [left, right], or null.
export function behindCopy([xl, xr], sr = SR, loop = false) {
  const n = xl.length;
  if (n < 64) return null;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += xl[i] * xl[i] + xr[i] * xr[i];
  const rms = Math.sqrt(ss / (2 * n));
  if (rms <= 1e-3) return null;
  const m = Math.trunc(sr * BEHIND_SMEAR);
  if (loop && n > LONG_LOOP) return behindCopyLong([xl, xr], sr, rms, m);
  const size = loop ? n : (1 << Math.ceil(Math.log2(Math.max(2, n + m))));
  if (size < m) return null;
  // Both ears in one transform: left in the real part, right in the imaginary.
  const zr = new Float64Array(size); const zi = new Float64Array(size);
  zr.set(xl.subarray(0, Math.min(n, size))); zi.set(xr.subarray(0, Math.min(n, size)));
  fft(zr, zi, false);
  const half = Math.floor(size / 2) + 1;
  const cum = new Float64Array(half);
  let run = 0;
  for (let k = 0; k < half; k++) {
    const j = (size - k) % size;
    const lr = (zr[k] + zr[j]) / 2; const li = (zi[k] - zi[j]) / 2;
    const rr = (zi[k] + zi[j]) / 2; const ri = -(zr[k] - zr[j]) / 2;
    run += lr * lr + li * li + rr * rr + ri * ri;
    cum[k] = run;
  }
  if (cum[half - 1] <= 0) return null;
  const target = 0.5 * cum[half - 1];
  let idx = 0;
  while (idx < half && cum[idx] < target) idx++;
  const f50 = Math.min(half - 1, idx) * sr / size;
  const lo = Math.min(BEHIND_CUT[1], Math.max(BEHIND_CUT[0], 0.9 * f50));
  const hi = lo * BEHIND_CUT_SPAN;
  // The blur: the sound itself plus a short burst of decaying noise after it.
  const noise = gauss(1013 + n);
  const ir = new Float64Array(size); const iri = new Float64Array(size);
  ir[0] = 1.0;
  const tail = new Float64Array(m);
  let ts = 0;
  for (let j = 0; j < m; j++) { tail[j] = noise() * Math.exp(-j / (m / 4.0)); ts += tail[j] * tail[j]; }
  const tk = BEHIND_SMEAR_MIX / (Math.sqrt(ts) + 1e-9);
  for (let j = 0; j < m; j++) ir[j] += tail[j] * tk;
  fft(ir, iri, false);
  for (let k = 0; k < size; k++) {
    const f = Math.min(k, size - k) * sr / size;
    const roll = Math.min(1, Math.max(0, 1.0 - (f - lo) / (hi - lo)));
    const hr = roll * ir[k]; const hiI = roll * iri[k];
    const a = zr[k] * hr - zi[k] * hiI; const b = zr[k] * hiI + zi[k] * hr;
    zr[k] = a; zi[k] = b;
  }
  fft(zr, zi, true);
  const ol = new Float64Array(n); const or = new Float64Array(n);
  let os = 0;
  for (let i = 0; i < n; i++) { ol[i] = zr[i] / size; or[i] = zi[i] / size; os += ol[i] * ol[i] + or[i] * or[i]; }
  const g = BEHIND_LEVEL * rms / (Math.sqrt(os / (2 * n)) + 1e-9);
  let peak = 0;
  for (let i = 0; i < n; i++) { ol[i] *= g; or[i] *= g; peak = Math.max(peak, Math.abs(ol[i]), Math.abs(or[i])); }
  const pk = peak > 32767 * 0.95 ? 32767 * 0.95 / peak : 1;
  for (let i = 0; i < n; i++) { ol[i] = toInt16(ol[i] * pk); or[i] = toInt16(or[i] * pk); }
  return [ol, or];
}

// A long loop's dull copy, made faster: the same filter (the treble roll-off from
// the sound's own centre and the same blur), applied round the loop through a
// kernel KERNEL samples long instead of one as long as the loop. The roll-off's
// response has died away long before the kernel ends, so the copy is the same to
// the ear; it takes a quarter of the time, which on a phone is seconds.
const LONG_LOOP = 1 << 17;
const KERNEL = 1 << 14;
function behindCopyLong([xl, xr], sr, rms, m) {
  const n = xl.length;
  // Where the sound's energy is centred, from its spectrum.
  const P = 1 << Math.ceil(Math.log2(n));
  let zr = new Float64Array(P); let zi = new Float64Array(P);
  zr.set(xl); zi.set(xr);
  fft(zr, zi, false);
  const half = P / 2 + 1;
  let total = 0;
  const pw = new Float64Array(half);
  for (let k = 0; k < half; k++) {
    const j = (P - k) % P;
    const lr = (zr[k] + zr[j]) / 2; const li = (zi[k] - zi[j]) / 2;
    const rr = (zi[k] + zi[j]) / 2; const ri = -(zr[k] - zr[j]) / 2;
    pw[k] = lr * lr + li * li + rr * rr + ri * ri;
    total += pw[k];
  }
  if (total <= 0) return null;
  let run = 0; let idx = 0;
  while (idx < half - 1 && (run += pw[idx]) < 0.5 * total) idx++;
  const f50 = idx * sr / P;
  const lo = Math.min(BEHIND_CUT[1], Math.max(BEHIND_CUT[0], 0.9 * f50));
  const hi = lo * BEHIND_CUT_SPAN;
  // The kernel: the blur and the roll-off, centred.
  const noise = gauss(1013 + n);
  const kr = new Float64Array(KERNEL); const ki = new Float64Array(KERNEL);
  kr[0] = 1.0;
  const tail = new Float64Array(m);
  let ts = 0;
  for (let j = 0; j < m; j++) { tail[j] = noise() * Math.exp(-j / (m / 4.0)); ts += tail[j] * tail[j]; }
  for (let j = 0; j < m; j++) kr[j] += tail[j] * BEHIND_SMEAR_MIX / (Math.sqrt(ts) + 1e-9);
  fft(kr, ki, false);
  for (let k = 0; k < KERNEL; k++) {
    const f = Math.min(k, KERNEL - k) * sr / KERNEL;
    const roll = Math.min(1, Math.max(0, 1.0 - (f - lo) / (hi - lo)));
    kr[k] *= roll; ki[k] *= roll;
  }
  fft(kr, ki, true);
  const H = KERNEL / 2;
  // Round the loop: the sound with its own ends wrapped on, through the kernel.
  const Q = 1 << Math.ceil(Math.log2(n + 2 * KERNEL));
  zr = new Float64Array(Q); zi = new Float64Array(Q);
  for (let t = 0; t < n + KERNEL; t++) { const s = ((t - H) % n + n) % n; zr[t] = xl[s]; zi[t] = xr[s]; }
  const hr = new Float64Array(Q); const hiArr = new Float64Array(Q);
  for (let j = 0; j < KERNEL; j++) hr[j] = kr[(j - H + KERNEL) % KERNEL] / KERNEL;
  fft(zr, zi, false);
  fft(hr, hiArr, false);
  for (let k = 0; k < Q; k++) {
    const a = zr[k] * hr[k] - zi[k] * hiArr[k]; const b = zr[k] * hiArr[k] + zi[k] * hr[k];
    zr[k] = a; zi[k] = b;
  }
  fft(zr, zi, true);
  const ol = new Float64Array(n); const or = new Float64Array(n);
  let os = 0;
  for (let i = 0; i < n; i++) { ol[i] = zr[i + KERNEL] / Q; or[i] = zi[i + KERNEL] / Q; os += ol[i] * ol[i] + or[i] * or[i]; }
  const g = BEHIND_LEVEL * rms / (Math.sqrt(os / (2 * n)) + 1e-9);
  let peak = 0;
  for (let i = 0; i < n; i++) { ol[i] *= g; or[i] *= g; peak = Math.max(peak, Math.abs(ol[i]), Math.abs(or[i])); }
  const pk = peak > 32767 * 0.95 ? 32767 * 0.95 / peak : 1;
  for (let i = 0; i < n; i++) { ol[i] = toInt16(ol[i] * pk); or[i] = toInt16(or[i] * pk); }
  return [ol, or];
}

// How much of a recording sits low, below 300 Hz: 0 to 1, from its first two seconds.
export function lowShare([xl, xr]) {
  const n = Math.min(xl.length, SR * 2);
  if (n < 256) return 0.0;
  const re = new Float64Array(n); const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = ((xl[i] + xr[i]) / 2) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
  fft(re, im, false);
  let low = 0; let all = 0;
  for (let k = 0; k <= Math.floor(n / 2); k++) {
    const a = Math.hypot(re[k], im[k]);
    all += a;
    if (k * SR / n < 300) low += a;
  }
  return low / (all + 1e-9);
}

// A copy of a bell recording that strikes once every `period` seconds when it loops.
export function ringPeriodCopy([al, ar], period) {
  const len = al.length;
  let peak = 0;
  const mag = new Float64Array(len);
  for (let i = 0; i < len; i++) { mag[i] = Math.max(Math.abs(al[i]), Math.abs(ar[i])); peak = Math.max(peak, mag[i]); }
  peak = peak || 1.0;
  let first = -1;
  for (let i = 0; i < len; i++) if (mag[i] > peak * 0.1) { first = i; break; }
  const start = first >= 0 ? Math.max(0, first - Math.trunc(0.003 * SR)) : 0;
  const n = pyRoundLocal(period * SR);
  const ol = new Float64Array(n); const or = new Float64Array(n);
  for (let i = 0; i < n && start + i < len; i++) { ol[i] = al[start + i]; or[i] = ar[start + i]; }
  const fade = Math.min(Math.trunc(0.18 * SR), Math.floor(n / 3));
  for (let j = 0; j < fade; j++) {
    const w = fade > 1 ? (1 - j / (fade - 1)) : 1;     // np.linspace(1, 0, fade)
    ol[n - fade + j] *= w * w; or[n - fade + j] *= w * w;
  }
  for (let i = 0; i < n; i++) { ol[i] = toInt16(ol[i]); or[i] = toInt16(or[i]); }
  return [ol, or];
}

function pyRoundLocal(x) {
  const f = Math.floor(x); const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

// A fake: a distorted copy of a real recording, just as loud (the desktop's
// warp_copy). draws are the four numbers the desktop's np.random.default_rng(seed)
// gives for this recording, carried in the events pack.
export function warpCopy([al, ar], strength, draws) {
  const n = al.length;
  const xl = new Float64Array(n); const xr = new Float64Array(n);
  for (let i = 0; i < n; i++) { xl[i] = al[i] / 32768.0; xr[i] = ar[i] / 32768.0; }
  const [u1, u2, u3, u4] = draws;
  const low = Math.min(1, Math.max(0, (lowShare([xl, xr]) - 0.15) / 0.45));
  const carrier = (1 - low) * u1 + low * u2;
  const mix = Math.min(0.92, 0.75 * strength * (1 + 0.3 * low));
  const yl = new Float64Array(n); const yr = new Float64Array(n);
  const t2 = Math.tanh(2.2);
  let sx = 0; let sy = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const ring = Math.sin(2 * Math.PI * carrier * t);
    const depth = 0.004 * strength * (1 + 1.5 * low) * SR * (0.5 + 0.5 * Math.sin(2 * Math.PI * u3 * t));
    const pos = Math.min(n - 1, Math.max(0, i - depth));
    const i0 = Math.floor(pos); const i1 = Math.min(i0 + 1, n - 1); const fr = pos - i0;
    const shudder = 1 - (0.4 + 0.3 * low) * strength * (0.5 + 0.5 * Math.sin(2 * Math.PI * u4 * t));
    for (const [x, y] of [[xl, yl], [xr, yr]]) {
      const wobble = x[i0] * (1 - fr) + x[i1] * fr;
      let v = (1 - mix) * wobble + mix * x[i] * ring;
      v = Math.tanh(2.2 * v) / t2;
      y[i] = v * shudder;
    }
    sx += xl[i] * xl[i] + xr[i] * xr[i];
    sy += yl[i] * yl[i] + yr[i] * yr[i];
  }
  const g = (Math.sqrt(sx / (2 * n)) + 1e-9) / (Math.sqrt(sy / (2 * n)) + 1e-9);
  let peak = 0;
  for (let i = 0; i < n; i++) { yl[i] *= g; yr[i] *= g; peak = Math.max(peak, Math.abs(yl[i]), Math.abs(yr[i])); }
  const pk = peak > 0.98 ? 0.98 / peak : 1;
  for (let i = 0; i < n; i++) { yl[i] = Math.trunc(yl[i] * pk * 32767); yr[i] = Math.trunc(yr[i] * pk * 32767); }
  return [yl, yr];
}

// A copy of a sound, higher or lower, by resampling (the desktop's _pitch).
export function pitch([al, ar], semitones) {
  if (!semitones) return [al, ar];
  const r = 2.0 ** (semitones / 12.0);
  const len = al.length;
  const n = Math.max(64, Math.trunc(len / r));
  const ol = new Float64Array(n); const or = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const idx = k * r;
    const lo = Math.min(Math.trunc(idx), len - 1);
    const hi = Math.min(lo + 1, len - 1);
    const frac = idx - lo;
    ol[k] = Math.trunc(al[lo] * (1 - frac) + al[hi] * frac);
    or[k] = Math.trunc(ar[lo] * (1 - frac) + ar[hi] * frac);
  }
  return [ol, or];
}

// A sound followed by `seconds` of silence.
export function padded([al, ar], seconds) {
  const extra = Math.trunc(seconds * SR);
  const ol = new Float64Array(al.length + extra); const or = new Float64Array(al.length + extra);
  ol.set(al); or.set(ar);
  return [ol, or];
}

// ------------------------------------------------------------ into the sound engine
function toBuffer(audio, [l, r]) {
  const buf = audio.ctx.createBuffer(2, Math.max(1, l.length), SR);
  const L = buf.getChannelData(0); const R = buf.getChannelData(1);
  for (let i = 0; i < l.length; i++) { L[i] = l[i] / I16; R[i] = r[i] / I16; }
  return buf;
}

// Add a sound made here under its desktop name. Its dull copy, where the desktop
// makes one, is made when it first plays (see ensureCopies), as on the desktop.
export function addMade(audio, name, arrs) {
  const dry = toBuffer(audio, arrs);
  // frames 0: never taken for a long recording, so never let go of while the game runs.
  audio.entries.set(name, { dry: { frames: 0, made: true } });
  audio.buffers.set('dry:' + name, dry);
  audio.buffers.delete('dull:' + name);
  registerRules(name);
  made.set(name, { arrs, dullTried: false });
}
const made = new Map();       // name -> what it was made from, until its dull copy is made

// A recording from the library under its event name, so it gets the event rooms'
// echo and its dull copy (load_event_recording). Its pack entry is shared, so it is
// decoded once, under its event name, and only when needed.
// Its dull copy is the one the events pack carries for a role played looped or once
// (made by the desktop's own behind_copy), or else made here before it first plays.
export function aliasRecording(audio, stem, name) {
  if (audio.entries.has(name)) return name;
  const pair = audio.entries.get(stem);
  if (!pair || !pair.dry) return null;
  const alias = { dry: pair.dry };
  if (behindApplies(name)) {
    const dull = reverbIsLoop(name) ? pair.dull : pair.dull1;
    if (dull) alias.dull = dull;
    else made.set(name, { arrs: null, dullTried: false });
  }
  audio.entries.set(name, alias);
  registerRules(name);
  return name;
}

// A sound made from another only when it is first played (the pitched notes: the
// desktop makes all twenty-five at once; made when needed, they are the same).
export function addLazy(audio, name, maker) {
  audio.entries.set(name, { dry: { frames: 0, made: true } });
  audio.buffers.delete('dry:' + name);
  audio.buffers.delete('dull:' + name);
  registerRules(name);
  made.set(name, { arrs: null, maker, dullTried: false });
}

// The dull copy of a sound made or named here, made now if it is not ready (the
// desktop's _copies_now): before the sound first plays.
export function ensureCopies(audio, name) {
  const m = made.get(name);
  if (!m) return;
  if (m.maker && !audio.buffers.has('dry:' + name)) {
    m.arrs = m.maker();
    m.maker = null;
    audio.buffers.set('dry:' + name, toBuffer(audio, m.arrs));
  }
  if (m.dullTried) { if (!m.maker) made.delete(name); return; }
  if (!behindApplies(name)) { m.dullTried = true; m.arrs = null; made.delete(name); return; }
  let arrs = m.arrs;
  if (!arrs) {
    const buf = audio.buffers.get('dry:' + name);
    if (!buf) return;                         // decoded later; tried again then
    arrs = fromBuffer(buf);
  }
  m.dullTried = true;
  const d = behindCopy(arrs, SR, reverbIsLoop(name));
  m.arrs = null;
  made.delete(name);
  if (!d) return;
  const pair = audio.entries.get(name);
  if (!pair) return;
  audio.entries.set(name, { ...pair, dull: { frames: 0, made: true } });
  audio.buffers.set('dull:' + name, toBuffer(audio, d));
}

export function forgetMade() { made.clear(); }
