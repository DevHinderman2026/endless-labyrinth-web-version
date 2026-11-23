// The sound engine: the desktop game's mixer, rebuilt on the Web Audio API.
//
// On Windows every sound plays on a pygame channel with a left and a right level,
// and alongside it two more copies: its echo in the room the player is in, and
// its dull "behind you" copy, faded in as the thing goes behind the player. Here
// each playing sound is a Voice that does exactly the same. The levels follow
// the desktop's PairedChannel to the letter (see sound-rules.js, which is made
// from the desktop code). The dull copies come ready made in the sound packs, made
// by the desktop's own code; the echo is made live by a convolver loaded with the
// desktop's own room impulse responses.

import { RULES } from './sound-rules.js';
import { loadPacks } from './packs.js';
import { reverbIsLoop } from './modes/events/sounds.js';

const RATE = 44100;
// Ultimate Mode (web 2.0.0) hears the world in binaural 3D: the browser's
// HRTF panner. In that mode (AudioEngine.spatial) every sound played with a
// position goes through a panner, its echo goes to the bus of the area it is in,
// and the whole world passes through one gain and one low-pass filter, so a
// regeneration can fade it out and in and the compass can muffle it. The compass
// beep and the voice's own tones are played 'direct', past that filter. Every
// other mode is untouched: without spatial, nothing below is used.
//
// Web 5.0.0: every mode is heard in binaural 3D (AudioEngine.binaural). The
// modes still work out a left and a right level for each thing exactly as the
// desktop does (one side full, the other lowered by how far to the side the
// thing is) and say how far behind you it is. From those two the engine knows
// which way the thing lies, and places it there with the same HRTF panner
// Ultimate Mode uses, at the loudness the mode gave it. Nothing in a mode's own
// rules changes. In a mode that turns (AudioEngine.turns, js/turning.js), the
// listener turns (setFacing) and every placed sound sweeps round with it; the
// backgrounds turn too (a wide recording: see Voice._branch).
const MUFFLE_OPEN_HZ = 20000;
const MUFFLE_CLOSED_HZ = 650;
// Recordings longer than this are decoded only when they are about to play, and
// let go when they have not been used for a while, so a phone never holds every
// drone in memory at once.
const BIG_FRAMES = RATE * 6;
// A wide recording placed in the world's west and east (Voice._branch, web 4.1.0):
// what the two panners take off it, put back (measured with noise: 0.135 against
// 0.174 plain, facing north; a drone's low notes lose less, so a little under).
const WIDE_GAIN = 1.2;
// (Web 6.1.0, the Fable review; Russell, 19 November 2026: static riding the elevator
// up from Island Mode's seabed.) WIDE_GAIN was set with noise, whose two sides have
// nothing in common. A recording whose two sides are much alike and deep, as the
// seabed's water is, comes out of the two panners far louder than it was made to be:
// "underwater" by 6.8 decibels, more than twice as loud, and at Island Mode's level
// its peaks alone were over the top (1.12 of full scale, before anything else was
// played). So through every dive the limiter was holding the whole game down, and
// with the strokes, the beacons and the elevator on top it could not hold it all.
// Such a recording is trimmed back here to the loudness it has played plain (as it is
// in the Windows game, and was here before backgrounds turned). Outside Ultimate
// Mode only: Ultimate's own levels were set by ear with its backgrounds already wide.
// (Measured: the same recording rendered plain and wide, facing north and east.)
const WIDE_TRIM = { underwater: 0.46 };
const BIG_KEEP = 3;
// A looping sound's own echoes (see _loopWet) are kept up to this many bytes.
const LOOP_WET_KEEP = 32e6;
// The end of the chain (web 5.1.0, Russell, 12 November 2026: distortion and
// stutter, most of all on a crowded seabed). Everything the game plays passes
// through one gain and then a gentle limiter, so however many sounds come in at
// once the total never goes over the top and clips:
// - MASTER_LEVEL: the whole game a little quieter, so the limiter seldom has
//   anything to do. Ultimate Mode keeps its own level (MASTER_LEVEL_3D, as it
//   was), since it is not part of this update.
// - LIMITER: a compressor set as a soft limiter, only peaks near the top are
//   held down; below its threshold it does nothing at all.
const MASTER_LEVEL = 0.85;
// (Web 6.3.3, Russell, 21 November 2026: the iPhone static, still there after 6.3.1.)
// Measured at the output in a world of Ultimate Mode and Chaos: before the limiter the
// peaks reached 1.4 to 2.2 of full scale, and the limiter was holding the whole game down
// by 4 to 8 decibels much of the time, and still let a few samples out over full scale,
// which clip: a limiter that hard at work crackles on the edges of every sound. And the
// browser's compressor quietly adds a makeup gain of its own (1.1475, about 1.2 decibels,
// measured: the spec's DynamicsCompressor does it), so "below its threshold it does nothing
// at all" was never true: everything came out louder, and nearer the top. Now the makeup
// gain is undone after it (LIMITER_TRIM), and Ultimate Mode's level comes down to every
// other mode's: the game is about 1 decibel quieter, Ultimate and Chaos's worlds about 2.5,
// and the limiter seldom has anything to do (Russell chose this, knowing it is quieter).
const MASTER_LEVEL_3D = 0.85;                     // (was 1.0)
const LIMITER = { threshold: -3, knee: 3, ratio: 20, attack: 0.002, release: 0.15 };
const LIMITER_TRIM = 1 / 1.1475;                  // undoes the compressor's own makeup gain
// Outside Ultimate Mode, a one-shot stopped to make room for a newer one is faded
// out over this many milliseconds instead of being cut, which clicked.
const CULL_FADE_MS = 40;
// How far a placed sound's direction must move before its panner is moved again
// (the cosine of about half a degree). Telling a panner again and again where it
// already is kept the browser's audio thread busy for nothing, frame after
// frame, for every sound at once.
const PLACE_SAME = Math.cos(0.5 * Math.PI / 180);
const PLACE_SOON = Math.cos(3 * Math.PI / 180);   // (a turn of the direction smaller than this waits for SEND_GAP)
// (Web 6.2.0, Russell, 20 November 2026: on an iPhone, in any mode, a slight static
// crept onto the edges of every sound the longer he played; pausing cleared it, and
// after resuming it stayed clear for a while, then came back.) A panner's place and
// the listener's facing were glided with setTargetAtTime, a glide that never ends:
// it only ever creeps closer to where it is going. While any glide is open, the
// browser works out that panner's direction afresh for every single sample instead
// of once per slice of sound, the costliest thing an HRTF panner can do; and an
// open glide on the listener does that to every panner at once. Each sound that had
// moved once, and the listener after the first turn, stayed that way for good, so
// the phone's audio thread fell further behind until it began to crackle. Only an
// instant placement closed the glides: resuming from a pause puts the held beacons
// down at once, which is why the static cleared then. Now each move is a short
// straight glide that ends (the same sweep, without a zip), after which the panner
// is back to its cheap, once-a-slice work until it moves again.
const PLACE_GLIDE = 0.06;        // seconds: a placed sound's move (was a 0.02 time constant, about the same sweep)
const FACE_GLIDE = 0.045;        // seconds: the listener's turn (was a 0.015 time constant)
// (Web 6.3.0, Russell, 20 November 2026: the static still came back the longer he
// played, in Chaos mode especially, and pausing the game made it vanish.) Two causes.
// First, a sound's panner was never let go: when a sound ended, the nodes feeding
// its panner were disconnected, but the panner itself stayed connected to the mix,
// so every placed sound ever played stayed in the audio graph for good; a five
// minute Chaos run left about 1,300 of them for the audio thread to visit in every
// slice of sound. A finished sound now lets go of all of it. Second, every sound's
// levels, and in the 3D worlds its place, were sent to the audio thread in every
// frame, sixty times a second: about 8,000 changes a second in a world, each one
// taken under a lock the audio thread also needs. Pausing stopped the frames, which
// is why the static vanished then. A change too small to hear (LEVEL_SAME) is now
// not sent, and a small one waits until a thirtieth of a second has passed since the
// last (SEND_GAP), in every mode, the worlds included.
const LEVEL_SAME = 0.005;        // of a level: a change smaller than this is not sent (about 0.04 decibels)
const SEND_GAP = 1 / 30;         // seconds: the least time between two small changes to one gain or panner
const SEND_BIG = 0.05;           // of a level: a change at least this big is sent at once
// (Web 6.3.7, Russell, 22 November 2026: "static still shows up from time to time, and
// pausing clears it".) A sound's levels were still sent as setTargetAtTime, the kind of
// glide 6.2.0 took off the panners' places: one that never ends. Two costs, for as long
// as the sound lives. A gain with an open glide is worked out afresh for every sample.
// And a level glided to nothing only ever creeps toward it and never is nothing, so the
// browser cannot tell that the branch has gone silent, and everything after it, the
// HRTF panner above all, goes on doing its full work on a sound nobody can hear: a
// beacon out of earshot, and the dull copy of everything in front of you (its own
// panner, outside Ultimate Mode), about half of all the panners in a busy battle.
// Holding those sounds stopped their sources, which is silence the browser can see:
// the static cleared on a pause. Now every level change is a short straight glide that
// ends on the level itself; nothing is left open, and nothing is nothing.
const LEVEL_GLIDE = 0.012;       // seconds: a level's change (was a 0.008 time constant)
const SEND_GLIDE = 0.12;         // seconds: an echo send's, and the master level's (was a 0.05 time constant)

// A glide that ends: from where the parameter is now, straight to v.
function glideTo(p, v, now, secs) {
  p.cancelScheduledValues(now);
  p.setValueAtTime(p.value, now);
  p.linearRampToValueAtTime(v, now + secs);
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// ---------------------------------------------------------------- one channel for a placed sound
// Web 6.0.0 (Russell, 19 November 2026): every sound heard from a place in the
// world (a beacon, a bell, a credit, an exit, a creature, an enemy, anything the
// game puts somewhere) plays a one-channel copy of its recording. The browser's
// HRTF panner hears a two-channel sound as two: its left side goes to the left ear
// and its right side to the right ear, wherever the thing is, so a recording that
// leans to one side, drifts from side to side, or is wide pulled the thing it
// belonged to off its place. The copy is made here, in memory, the first time the
// sound is placed, as loud as the recording (the power of its two sides), and kept
// for as long as the recording is; the file itself is never changed. A recording
// whose two sides work against each other (added together they lose more than
// MONO_THIN of their power: some of it cancels out, and what is left sounds thin
// and hollow), or that is all on one side, gives the louder side alone instead. Backgrounds, music, menus, the
// player's own footsteps and speech are never placed and stay as they are.
// (This takes in 5.2.0's copies for the events' looping sounds, events/engine.js
// monoCopy, which come here already one channel.)
const MONO_THIN = 0.447;         // a power ratio: three and a half decibels (unrelated sides lose three; more is cancelling)
const MONO_ONE_SIDE = 0.01;      // one side under a hundredth of the other's power (20 decibels): the louder side alone
const MONO_MAX_GAIN = 2.0;
const MONO_PEAK = 0.98;
const MONO_FULL_SCAN = 2 * 44100;    // frames: a recording longer than this is measured on every fourth frame
const MONO_COPIES = new WeakMap();   // recording -> its one-channel copy
const MONO_PLANS = new WeakMap();    // recording -> how the copy was made (for the tests)

// How a recording's one-channel copy is made: { mode: 'same' | 'mix' | 'left' | 'right', gain, lossDb }.
export function monoPlan(buf) {
  if (!buf || buf.numberOfChannels < 2) return { mode: 'same', gain: 1, lossDb: 0 };
  const have = MONO_PLANS.get(buf);
  if (have) return have;
  const l = buf.getChannelData(0); const r = buf.getChannelData(1); const n = buf.length;
  let ll = 0; let rr = 0; let lr = 0; let pm = 0; let pl = 0; let pr = 0;
  // (A long recording is measured on every fourth frame: the same powers, a
  // quarter of the time, so a forty-second background placed for the first time
  // costs a phone as little as it can.)
  const step = n > MONO_FULL_SCAN ? 4 : 1;
  for (let i = 0; i < n; i += step) {
    const a = l[i]; const b = r[i];
    ll += a * a; rr += b * b; lr += a * b;
    const m = a + b > 0 ? a + b : -(a + b); if (m > pm) pm = m;
    const x = a > 0 ? a : -a; if (x > pl) pl = x;
    const y = b > 0 ? b : -b; if (y > pr) pr = y;
  }
  const mean = (ll + rr) / 2;                  // the recording's power, both sides
  const mid = (ll + rr + 2 * lr) / 4;          // the power of the two sides averaged
  let mode = 'mix'; let src = mid; let peak = pm / 2;
  if (mean > 0 && (mid < mean * MONO_THIN || Math.min(ll, rr) < Math.max(ll, rr) * MONO_ONE_SIDE)) {
    mode = ll >= rr ? 'left' : 'right'; src = Math.max(ll, rr); peak = mode === 'left' ? pl : pr;
  }
  let gain = src > 0 ? Math.sqrt(mean / src) : 1;
  gain = Math.min(gain, MONO_MAX_GAIN, peak > 0 ? MONO_PEAK / peak : MONO_MAX_GAIN);
  const plan = { mode, gain, lossDb: mean > 0 && mid > 0 ? 10 * Math.log10(mid / mean) : (mean > 0 ? -99 : 0) };
  MONO_PLANS.set(buf, plan);
  return plan;
}

// A recording's one-channel copy (the recording itself if it is one channel already).
export function monoCopy(ctx, buf) {
  if (!buf || buf.numberOfChannels < 2) return buf;
  const have = MONO_COPIES.get(buf);
  if (have) return have;
  const plan = monoPlan(buf);
  const l = buf.getChannelData(0); const r = buf.getChannelData(1); const n = buf.length;
  const out = new Float32Array(n);
  const g = plan.gain;
  if (plan.mode === 'mix') { const h = 0.5 * g; for (let i = 0; i < n; i++) out[i] = (l[i] + r[i]) * h; }
  else { const c = plan.mode === 'left' ? l : r; for (let i = 0; i < n; i++) out[i] = c[i] * g; }
  const mono = ctx.createBuffer(1, n, buf.sampleRate);
  mono.copyToChannel(out, 0);
  MONO_COPIES.set(buf, mono);
  MONO_PLANS.set(mono, { mode: 'same', gain: 1, lossDb: 0, from: plan.mode });
  monoStats.made += 1;
  return mono;
}
export const monoStats = { made: 0 };

// Recordings with sound on one side only (found in the 6.0.0 mono audit): played
// from a centred one-channel copy everywhere, so both ears hear them.
export const CENTRE_COPY = new Set(['ut_crowd_roar_4', 'ut_crowd_roar_5']);
// (Web 6.3.2, Russell, 20 November 2026: "chimes are basically stereo spread instead
// of at one central point".) A chime, a bell, a ding, a gong or a toll is heard from
// one point, as the Windows game hears its placed ones (its mono_sweep): the
// elevator's, the bus's, every event's pickup (Find the Voice's chime among them),
// an event's bell or gong that starts or ends it, a glass case's chime. Placed, it
// is one point where it rings; played where you stand, one point in the middle;
// until now a stereo recording played where you stood was spread from ear to ear.
// (A background is never made one point: it turns with you, its sides west and east.)
export const CENTRE_CHIMES = ['elevator_ding', 'elevator_arrive', 'ut_bus_chime', 'event_pickup_'];
export const CENTRE_WORDS = /chime|bell|(^|_)ding($|_)|gong|(^|_)toll($|_)/;
const NEVER_CENTRED = /^(event_amb_file_|evt_amb_)/;
export function centred(name) {
  if (!name || NEVER_CENTRED.test(name)) return false;
  return CENTRE_COPY.has(name) || CENTRE_CHIMES.some((k) => name.startsWith(k)) || CENTRE_WORDS.test(name);
}
// (Web 6.3.1, Russell, 20 November 2026: "if the world turns with you, then the
// ambience has to turn".) Every background turns with you in a mode that turns,
// its left side in the world's west and its right side in the east; but these four
// were recorded with their two sides the same, so there was nothing to turn: they
// sounded the same whichever way you faced (three of Standard's eleven labyrinth
// backgrounds among them). Each is given a second side when it is decoded: the same
// recording, a little over a third of the way further on, so the two sides are no
// longer alike and it turns like the rest. (Each is a loop, so starting its second
// side partway through leaves no seam; the files themselves are not changed. The
// Windows game does the same: TWO_SIDED there.)
export const TWO_SIDED = new Set(['lab_01_cavewind', 'lab_08_waterflow_2', 'lab_09_waterflow_1', 'island_06_wind_and_waves']);
export const TWO_SIDED_SHIFT = 0.37;    // of the recording's length: how far on its second side starts
export function twoSidedCopy(ctx, buf) {
  if (!buf || buf.numberOfChannels !== 1) return buf;
  const n = buf.length;
  const out = ctx.createBuffer(2, n, buf.sampleRate);
  const x = buf.getChannelData(0);
  out.copyToChannel(x, 0);
  const k = Math.floor(n * TWO_SIDED_SHIFT);
  const r = new Float32Array(n);
  r.set(x.subarray(k), 0);
  r.set(x.subarray(0, k), n - k);
  out.copyToChannel(r, 1);
  return out;
}

function sameSides(buf, frames) {
  if (buf.numberOfChannels < 2) return true;
  const l = buf.getChannelData(0); const r = buf.getChannelData(1);
  for (let i = 0; i < frames; i++) if (l[i] !== r[i]) return false;
  return true;
}

// Which sounds a pause holds: every beacon, chime and beep (the desktop's
// PAUSE_BEEP_PARTS and PAUSE_BEEP_NAMES). An event creature's own recording is
// named as a beacon, but it is a creature, and creatures play on.
const PAUSE_BEEP_PARTS = ['beacon', 'prox_', 'elevator_arrive'];
const PAUSE_BEEP_NAMES = new Set(['countdown', 'countdown_high', 'exit_morse', 'health_low', 'diver_tap', 'vent',
  'vent_hint', 'elevator_ding', 'event_pad', 'event_bomb_tick', 'event_falling']);
export function isPauseBeep(name) {
  if (name.startsWith('event_beacon_hazard_')) return false;
  return PAUSE_BEEP_NAMES.has(name) || PAUSE_BEEP_PARTS.some((k) => name.includes(k));
}

function newContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  try {
    // 'balanced' (web 5.1.0; was 'interactive'): a little more time for each
    // slice of sound, so a phone's audio thread does not fall behind and stutter
    // when many binaural sounds play at once. The difference is a few
    // milliseconds, too little to hear in a gesture.
    return new AC({ sampleRate: RATE, latencyHint: 'balanced' });
  } catch (e) {
    return new AC();
  }
}

// The end of the chain: the master gain, then the limiter, then the speakers.
export function outChain(ctx, level) {
  const out = ctx.createGain();
  out.gain.value = level;
  fixedStereo(out);
  let lim = null;
  try {
    lim = ctx.createDynamicsCompressor();
    lim.threshold.value = LIMITER.threshold;
    lim.knee.value = LIMITER.knee;
    lim.ratio.value = LIMITER.ratio;
    lim.attack.value = LIMITER.attack;
    lim.release.value = LIMITER.release;
    out.connect(lim);
    const trim = ctx.createGain();
    trim.gain.value = LIMITER_TRIM;
    fixedStereo(trim);
    lim.connect(trim);
    trim.connect(ctx.destination);
  } catch (e) {
    out.connect(ctx.destination);   // (a browser without one: as before)
  }
  return { out, lim };
}

// (6.3.1) A mix always two channels, whatever is plugged into it at the moment, so
// a sound joining or leaving it never changes the shape of everything after it.
function fixedStereo(node) {
  try { node.channelCount = 2; node.channelCountMode = 'explicit'; node.channelInterpretation = 'speakers'; } catch (e) { /* as it was */ }
  return node;
}

// Remembered targets of the gains and panners, and when they were sent, so an
// unchanged or barely changed value is not sent to the audio thread again (see
// Voice._set, _place).
const SENT = new WeakMap();
// (Web 6.3.1, Russell, 20 November 2026: in a Standard labyrinth the sound popped
// every few seconds, between the exit's beeps.) 6.3.0 let go of a finished sound's
// panner by unplugging it from the mix, a few seconds after the sound ended; with a
// beep every second or so that meant the mix's inputs changing all the time, and on
// some devices every such change can be heard as a pop. Now a finished sound's
// panner stays plugged in, silent, and is handed to the next sound that needs one:
// the mix's inputs hardly ever change, and their number never grows past the most
// sounds placed at once. (6.3.1 capped the pool at 64 and let one go beyond that; since
// 6.3.4 nothing is ever let go, see below, and 6.3.7 took the unused cap out.)
const PANNERS = new WeakMap();     // mix (a GainNode) -> panners plugged into it, silent, free to take
// (Web 6.3.3, Russell, 21 November 2026: the elevator's chime was "stereo spread instead of
// at one central point", and sometimes the characters' voices were lopsided too.) An HRTF
// panner that is moved does not jump to its new place: it crossfades from where it last
// played to where it is now, over about 45 milliseconds (Chromium's HRTFPanner and Safari's
// alike). A panner handed on from the pool (6.3.1) still pointed wherever its last sound had
// been, so the first 45 milliseconds of the next sound, its onset, the very part the ear
// places a sound by, came from that old place and swept across: a chime on your right began
// on your left (measured in Chromium: the first 10 ms 5.5 dB louder in the wrong ear), a
// voice ahead of you began behind you. Now a sound is given a panner from the pool only if
// that panner last played within PANNER_REUSE_DEG of where the new sound is; otherwise a new
// panner, which starts exactly where it is put. When the pool is full, the panner that goes
// is the one pointing nearest another in the pool, so the pool keeps panners pointing every way.
// (Web 6.3.4, Russell, 21 November 2026: "the popping is back in standard mode".) 6.3.3
// let a full pool drop a panner by unplugging it, and walking a labyrinth, with the exit's
// beep in a new direction every second, made new panners all the time: in a minute's walk,
// 117 made and 42 unplugged, the 6.3.0 pop again. Now no panner is ever unplugged. A mix
// made new panners only until it had 64 of them; after that a sound took the
// free panner pointing nearest its place, even if not within PANNER_REUSE_DEG (with that
// many pointing every way, the nearest is close). Only when every panner is busy is
// another made, and it is kept too.
// (Web 6.3.6, Russell, 21 November 2026: "when you're facing the exit, the beeping can
// still sound like it's on your left or your right ... like the beeping is reflecting off
// of something invisible, instead of coming from one central spot".) Two things a browser
// does with a panner that nothing is playing through, both measured at the game's output
// (tests/web636.mjs: in a Standard labyrinth, facing the exit after a turn, each beep began
// 3 to 6 decibels to one side; in a Chaos labyrinth, 4 to 7 to the other):
// 1. It stops working the panner, and a panner not being worked misses every turn of the
//    listener made meanwhile. Put again in the very same place in the world (you stood
//    still and turned), it is seen not to have moved, and the direction worked out before
//    your turn is used again: the beep comes from where the exit was, relative to your
//    head, the last time that panner played.
// 2. Given a place that is different, it works the direction out afresh, but slides to it
//    from the old one over about 45 milliseconds (6.3.3's finding), a third of a beep.
// The pool's panners last played at different times, facing different ways, so one beep
// came from the left, the next from the middle, the next from the right. Choosing the free
// panner pointing nearest (6.3.3 to 6.3.5) could not help: it compared places in the world,
// and what was stale was the direction from your head. Now a panner is woken whenever it
// is about to play again after a silence (taken from the pool, carried on after being held,
// or heard again after its level was nothing):
// - its HRTF state is made new (the panning model set away and back, which every engine
//   answers with a fresh panner inside the same node: it starts exactly where it is put,
//   as a new panner does, with nothing plugged or unplugged);
// - its place is sent at a different distance from the one before (PANNER_NEAR or
//   PANNER_FAR: the distance is not heard, the roll-off is off), so the place is never
//   "the same as last time" and the direction is always worked out afresh.
// So any free panner is as good as a new one: none is made while one is free, for a chime
// or a voice either, and the pool stays small.
const PANNER_COUNT = new WeakMap(); // mix -> how many panners have been made for it
const PANNER_NEAR = 1; const PANNER_FAR = 1.5;
const START_LEAD = 0.009;          // seconds: three slices of sound
// (Web 6.3.7, Russell, 22 November 2026: in Call of Fate a ringing bell lost its echo the
// moment you paused.) A looping sound's echo is baked into a copy of the loop, played in
// step with it, and a pause stopped that copy in the same instant as the sound: the bell
// and the room it rang in went dead together. Now the sound stops and its echo rings
// out: the copy plays on, dying away over RING_OUT seconds (to a thousandth, a room's
// own decay), and is stopped then. Carried on, the echo comes back in step with the
// sound, over RING_BACK seconds instead of at once; and if it is carried on while the
// old echo is still ringing, that one is taken out over RING_CROSS seconds first, so
// there are never two echoes of one sound.
const RING_OUT = 1.2;
const RING_BACK = 0.012;
const RING_CROSS = 0.015;
export const pannerStats = { made: 0, reused: 0, dropped: 0, woken: 0 };

// The way a place lies, as a unit vector (a point underfoot is a step ahead, as _place has it).
function unitDir(x, y, z) {
  const m = Math.hypot(x, y, z);
  return m < 0.05 ? [0, 0, -1] : [x / m, y / m, z / m];
}

export class AudioEngine {
  constructor() {
    this.ctx = newContext();
    ({ out: this.out, lim: this.limiter } = outChain(this.ctx, MASTER_LEVEL));
    this.recoveries = 0;
    this.entries = new Map();     // name -> {dry, dull} pack entries
    this.irEntries = new Map();   // room key -> [entry per take]
    this.buffers = new Map();     // 'dry:name' / 'dull:name' -> AudioBuffer
    this.pending = new Map();     // same key -> Promise of the buffer
    this.bigUsed = new Map();     // big buffer key -> last used time
    this.pins = new Map();        // what a recording is held ready for -> its buffer key
    this.irBuffers = new Map();   // 'key#take' -> AudioBuffer
    this.convolvers = new Map();  // 'key#take' -> ConvolverNode
    // A looping sound's own echo, made once per room and sound (the desktop's
    // reverb_apply with loop=True: folded into the loop's length, so it loops with
    // it to the sample and stops, pauses and fades with it).
    this.loopWets = new Map();    // 'roomKey|name' -> AudioBuffer
    this.loopWetPending = new Map();
    this.room = null;
    this.variants = {};           // 'lab' -> 'lab/lab_03_scifi_cave'
    this.roomGain = 1.0;
    this.roomLean = 0.0;
    this.live = new Set();        // every Voice still playing
    // A ceiling on one-shots at once: past it the oldest gives way (see play; a
    // phone's audio thread has limits). In the 3D world it is lower, since every
    // placed sound there has its own panners and echo sends. Loops are never
    // counted against a one-shot: they are the world's own, and the mode that
    // plays them keeps their number down (Ultimate Mode holds the ones nobody can
    // hear: see holdAll).
    this.maxShots = 56;
    this.maxShots3d = 16;
    // Binaural 3D outside Ultimate Mode (web 5.1.0; was the plain 56): every mode
    // but Ultimate, on a phone. Loops are never counted, as above.
    this.maxShotsBin = 32;
    this.culled = 0;              // how many a full house has stopped early (for the tests)
    this.sourceEffect = null;     // set by the game: position -> [gain, lean]
    this.behindOf = null;         // set by the game: position -> 0..1
    this.demoVoice = null;
    // Binaural 3D (Ultimate Mode): see spatialOn / spatialOff.
    // Binaural 3D outside Ultimate Mode (web 5.0.0): see the note at the top.
    this.binaural = false;        // set by the game: every positioned sound goes through an HRTF panner
    this.turns = false;           // set by the game, frame by frame: the mode being played turns with you
    this.turnsNow = null;         // set by the game: the same, asked at the moment a sound starts (a run's first background starts before its first frame)
    this.relOf = null;            // set by the game: a place in the world -> the way it lies from the player, [east, south], or null
    this.maxPlaced = 12;          // placed one-shots at once (each has its panners): past it the oldest placed one gives way (16 until web 5.1.0)
    this.spatial = false;
    this.facing = 0;              // the way the listener faces in the 3D world, radians clockwise from north (setFacing)
    this.worldIn = null;          // GainNode: the world's sounds, before the filter and fade
    this.worldFilter = null;
    this.worldGain = null;
    this.areaBuses = new Map();   // area id -> { gain, conv, room, stretch }
    this.stretched = new Map();   // 'room#take@stretch' -> AudioBuffer
    // The echo mix where the player stands ({ areaId: weight }), kept up to date
    // by the mode: a sound played with no place of its own (a footstep, the
    // countdown, a pickup's chime) rings in the room the player is in.
    this.listenerMix = null;
    // The sound's clock, sampled four times a second (see flowing).
    this._clk = [];
    setInterval(() => {
      this._clk.push([this.ctx, this.ctx.currentTime, performance.now()]);
      if (this._clk.length > 2) this._clk.shift();
    }, 250);
  }

  // Whether sound is coming out right now, whatever the phone calls its state: the
  // clock moved on over the last quarter second. An iPhone can leave the sound
  // 'interrupted' after the game's voice has spoken while it plays on, and asking
  // it to resume then, on every swipe, made it dip the sounds of that moment
  // (footsteps, while walking).
  get flowing() {
    if (this.ctx.state === 'running') return true;
    const [a, b] = this._clk;
    if (!a || !b || a[0] !== this.ctx || b[0] !== this.ctx) return false;
    const wall = (b[2] - a[2]) / 1000;
    return wall > 0 && (b[1] - a[1]) > wall * 0.5 && performance.now() - b[2] < 600;
  }

  async unlock() {
    // Phones keep audio off until the player touches something. The sound is
    // 'ambient', which mixes with the game's own speech. ('playback' does not mix:
    // on an iPhone the speech then stopped the game's sound altogether.) Ambient
    // sound is muted by an iPhone's silent mode, so the game asks for that off.
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (e) { /* older Safari */ }
    try { await this.ctx.resume(); } catch (e) { /* tried again on the next touch */ }
    // A moment of silence through the context, which some phones need before the
    // first real sound plays.
    const b = this.ctx.createBuffer(1, 64, this.ctx.sampleRate);
    const s = this.ctx.createBufferSource();
    s.buffer = b; s.connect(this.out); s.start();
  }

  get running() { return this.ctx.state === 'running'; }

  resume() {
    if (!this.flowing) this.ctx.resume().catch(() => {});
  }

  // Called on every touch, tap and key press, which are the moments a phone
  // allows sound to be started. If the phone has stopped the game's sound (a
  // call, another app, the screen reader being turned off, or speech), it is
  // started again; if it will not start again, a fresh sound engine is made.
  //
  // An iPhone can call the sound 'interrupted' while it is still playing (as it
  // turns sounds down under the game's speech), so the engine is replaced only
  // when its clock has truly stopped, and at most once in five seconds.
  wake() {
    if (this.flowing || this.waking) return;
    this.waking = true;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    ctx.resume().catch(() => {});
    setTimeout(() => {
      this.waking = false;
      if (this.ctx !== ctx || ctx.state === 'running') return;
      const moving = ctx.currentTime - t0 > 0.2;
      const recent = performance.now() - (this.recoveredAt || -1e9) < 5000;
      if (!moving && !recent) this.recover();
    }, 400);
  }

  // Whether sound is really coming out: running, or its clock still moving.
  get audible() {
    if (this.ctx.state === 'running') return true;
    const now = this.ctx.currentTime;
    const was = this._lastClock;
    this._lastClock = now;
    return was !== undefined && now > was;
  }

  // A fresh sound engine: everything that was looping carries on from where it
  // was (drones, beacons, enemies); a one-shot that was cut off is not replayed.
  // Sounds already decoded are kept: they belong to no engine in particular.
  recover() {
    this.recoveries += 1;
    this._renew(2000);
  }

  // (Web 6.3.7, Russell, 22 November 2026: "static still shows up from time to time ...
  // the channels are not cleared when you go back to the main menu".) Nothing was still
  // playing after a run, but the sound engine itself carried from one run into the
  // next for as long as the page stayed open: its panners, plugged in and silent, their
  // inner state, every room's echo, the limiter. Now each run starts on a fresh engine.
  // It is made at the first touch or key press on the main menu after a run has ended
  // (js/main.js; game.js soundStale), because a phone starts a new sound engine only
  // inside a touch: made at any other moment it would sit silent until the next one,
  // and the game's own voice with it. The old engine is kept eight seconds, longer than
  // in recover(), so the menu line still being said in it finishes; with every sound of
  // the run stopped it is silent otherwise, which costs next to nothing. Everything
  // decoded is kept, as there.
  fresh() {
    this.freshened = (this.freshened || 0) + 1;
    this._renew(8000);
  }

  _renew(keepOld) {
    const old = this.ctx;
    this.recoveredAt = performance.now();
    this.ctx = newContext();
    ({ out: this.out, lim: this.limiter } = outChain(this.ctx, this.spatial ? MASTER_LEVEL_3D : MASTER_LEVEL));
    this.convolvers = new Map();
    // The world chain and the area echoes belong to the old engine; made again
    // in the new one, for the same areas, by the mode's next call.
    const areas = [...this.areaBuses.values()].map((b) => ({ id: b.id, room: b.room, stretch: b.stretch }));
    this.areaBuses = new Map();
    this.worldIn = this.worldFilter = this.worldGain = null;
    if (this.spatial) this.spatialOn();
    else this.setFacing(this.facing || 0, true);     // (a mode that turns keeps the way it faces)
    for (const v of [...this.live]) v.rebind(old);
    // The echoes come after the voices are in the new engine: setAreaRooms points
    // every voice at its area's new bus, which must not be done to a voice whose
    // nodes still belong to the old one.
    if (this.spatial) this.setAreaRooms(areas);
    // The old engine is kept a moment, so a one-shot already sounding there (a
    // footstep, a shot) finishes rather than being cut off. (6.3.7: never more than
    // one old engine at a time: a phone allows only a few.)
    if (this._oldCtx) { clearTimeout(this._oldTimer); try { this._oldCtx.close(); } catch (e) { /* already closed */ } }
    this._oldCtx = old;
    this._oldTimer = setTimeout(() => {
      if (this._oldCtx === old) this._oldCtx = null;
      try { old.close(); } catch (e) { /* already closed */ }
    }, keepOld);
    this.ctx.resume().catch(() => {});
  }

  // ---------------------------------------------------------------- loading
  async load(onProgress) {
    const packs = await loadPacks(onProgress);
    await this.attach(packs);
    // Everything small is decoded now; the long recordings when first needed.
    const small = [];
    for (const [name, pair] of this.entries) {
      for (const kind of ['dry', 'dull']) {
        const e = pair[kind];
        // (A lazy entry, such as the event library's, is decoded only when an event uses it.)
        if (e && e.frames <= BIG_FRAMES && !e.lazy) small.push(this._decode(kind + ':' + name, e));
      }
    }
    for (const base of ['lab', 'battle', 'tower', 'tunnel', 'cathedral', 'hall']) {
      for (let t = 0; t < (this.irEntries.get(base) || []).length; t++) small.push(this._irBuffer(base, t));
    }
    await Promise.all(small);
  }

  // The packs' entries, known by name; nothing is decoded until it is asked for.
  // The game calls this through load(); the website's Help page calls it with
  // packs read one sound at a time (packs.js openPacks).
  async attach(packs) {
    for (const pack of packs) {
      for (const e of pack.entries) {
        e.pack = pack;
        if (e.kind === 'ir') {
          if (!this.irEntries.has(e.name)) this.irEntries.set(e.name, []);
          this.irEntries.get(e.name)[e.take] = e;
        } else {
          if (!this.entries.has(e.name)) this.entries.set(e.name, {});
          this.entries.get(e.name)[e.kind] = e;
        }
      }
    }
    // The events' warp numbers (data, not a sound), read once now.
    const wd = (this.entries.get('event_warp_draws') || {}).data;
    if (wd && !wd.pack.remote) {
      try { this.warpDraws = JSON.parse(new TextDecoder().decode(await wd.pack.read(wd))); } catch (e) { this.warpDraws = {}; }
    }
  }

  // A room's echo, decoded so a sound can ring in it (the Help page's demos).
  async prepareRoom(base) {
    const takes = (this.irEntries.get(base) || []).length;
    for (let t = 0; t < takes; t++) await this._irBuffer(base, t);
  }

  has(name) { return this.entries.has(name); }

  async _decodeEntry(e) {
    const bytes = await e.pack.read(e);
    const decoded = await new Promise((resolve, reject) => {
      const p = this.ctx.decodeAudioData(bytes, resolve, reject);
      if (p && p.catch) p.catch(reject);
    });
    // Cut back to the exact length: a loop was written with its own opening on
    // the end, and some browsers decode a few extra samples at the end of a file.
    const frames = Math.min(e.frames || decoded.length, decoded.length);
    // A sound whose two sides are the same is kept once (half the memory): every
    // Voice spreads one channel to both ears, exactly as the desktop's copy does.
    const same = decoded.numberOfChannels === 1 || sameSides(decoded, frames);
    const n = same ? 1 : 2;
    if (decoded.length === frames && decoded.numberOfChannels === n) return decoded;
    const buf = this.ctx.createBuffer(n, frames, decoded.sampleRate);
    for (let c = 0; c < n; c++) buf.copyToChannel(decoded.getChannelData(c).subarray(0, frames), c);
    return buf;
  }

  _decode(key, e) {
    if (this.buffers.has(key)) return Promise.resolve(this.buffers.get(key));
    if (this.pending.has(key)) return this.pending.get(key);
    const p = this._decodeEntry(e).then((buf0) => {
      // A recording with sound on one side only is heard in both ears from a
      // centred copy made here (the file itself is never changed: Russell, 19 Nov).
      // (6.0.0 review fix: the key is 'dry:<name>'; asked by the whole key, the copy was never made.)
      const bare = key.slice(key.indexOf(':') + 1);
      let buf = centred(bare) ? monoCopy(this.ctx, buf0) : buf0;
      if (TWO_SIDED.has(bare.replace(/_muffled$/, ''))) buf = twoSidedCopy(this.ctx, buf);
      this.buffers.set(key, buf);
      this.pending.delete(key);
      if (e.frames > BIG_FRAMES) this._noteBig(key);
      return buf;
    }, (err) => { this.pending.delete(key); throw err; });
    this.pending.set(key, p);
    return p;
  }

  _noteBig(key) {
    this.bigUsed.set(key, performance.now());
    // Pinned recordings (see prepare) are held on top of the BIG_KEEP most
    // recently used others.
    const pinned = new Set(this.pins.values());
    const free = [...this.bigUsed.keys()].filter((k) => !pinned.has(k));
    if (free.length <= BIG_KEEP) return;
    const playing = new Set();
    for (const v of this.live) { playing.add('dry:' + v.name); playing.add('dull:' + v.name); }
    // Nor is anything let go that was decoded or asked for in the last few
    // seconds: it is about to play (a shore and its muffled twin start together).
    const recent = performance.now() - 5000;
    const old = free.filter((k) => !playing.has(k) && k !== key && this.bigUsed.get(k) < recent)
      .sort((a, b) => this.bigUsed.get(a) - this.bigUsed.get(b));
    let n = free.length;
    while (n > BIG_KEEP && old.length) {
      const k = old.shift();
      this.bigUsed.delete(k);
      this.buffers.delete(k);
      if (k.startsWith('dry:')) this._releaseWets(k.slice(4));
      n -= 1;
    }
  }

  // Have a long recording decoded and waiting, so it starts the moment it is asked for.
  // With `pin`, it is held for that purpose (the next labyrinth's drone, say) and
  // never let go to make room, until something else is pinned for it: a chaos run
  // goes through every kind of level, and the desktop has every sound ready.
  prepare(name, pin = null) {
    const pair = this.entries.get(name);
    if (!pair || !pair.dry) return Promise.resolve(null);
    if (pin) this.pins.set(pin, 'dry:' + name);
    if (this.bigUsed.has('dry:' + name)) this.bigUsed.set('dry:' + name, performance.now());
    return this._decode('dry:' + name, pair.dry).catch(() => null);
  }

  // ---------------------------------------------------------------- the room
  _irBuffer(key, take) {
    const k = key + '#' + take;
    if (this.irBuffers.has(k)) return Promise.resolve(this.irBuffers.get(k));
    const e = (this.irEntries.get(key) || [])[take];
    if (!e) return Promise.resolve(null);
    if (this.pending.has('ir:' + k)) return this.pending.get('ir:' + k);
    const p = this._decodeEntry(e).then((buf) => {
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] *= e.scale;
      }
      this.irBuffers.set(k, buf);
      this.pending.delete('ir:' + k);
      return buf;
    });
    this.pending.set('ir:' + k, p);
    return p;
  }

  setRoom(room) {
    if (room !== this.room && room) {
      // Leaving a room lets go of its loops' own echoes (a sound still playing
      // keeps the one it has).
      for (const k of [...this.loopWets.keys()]) {
        const r = k.split('|')[0].split('/')[0];
        if (r !== room) this.loopWets.delete(k);
      }
      const key = this.variants[room];
      setTimeout(() => {
        if (this.room !== room) return;
        this._buildAhead(room, room);
        if (key && this.variants[room] === key) this._buildAhead(room, key);
      }, 200);
    }
    this.room = room;
  }

  // A drone starting changes the room with it: each drone has its own slight
  // variation of its mode's echo (the desktop's REVERB_VARIANTS). Its impulses
  // are loaded in the background; until then the room's own echo is used.
  setVariant(base, stem) {
    const key = base + '/' + stem;
    if (this.variants[base] === key) return;
    this.variants[base] = key;
    const takes = (this.irEntries.get(key) || []).length;
    for (let t = 0; t < takes; t++) {
      const p = this._irBuffer(key, t).catch(() => {});
      // Once its impulse is in, the loops already heard in this room get their echo
      // in the new variation too, in the background.
      if (t === 0) p.then(() => { if (this.variants[base] === key && this.room === base) this._buildAhead(base, key); });
    }
    // Let go of other variations of this room (their tails ring out first).
    for (const [k, node] of [...this.convolvers]) {
      const rk = k.split('#')[0];
      if (rk.startsWith(base + '/') && rk !== key) {
        this.convolvers.delete(k);
        // A sound already playing keeps the echo it began with, as on the desktop,
        // so the node goes only once nothing live feeds it any more.
        const retire = () => {
          if ([...this.live].some((v) => v.wet && v.wet.conv === node)) setTimeout(retire, 6000);
          else { try { node.disconnect(); } catch (e) { /* gone */ } }
        };
        setTimeout(retire, 6000);
      }
    }
    for (const k of [...this.loopWets.keys()]) {
      const rk = k.split('|')[0];
      if (rk.startsWith(base + '/') && rk !== key) this.loopWets.delete(k);
    }
    for (const k of [...this.irBuffers.keys()]) {
      const rk = k.split('#')[0];
      if (rk.startsWith(base + '/') && rk !== key) this.irBuffers.delete(k);
    }
  }

  // The convolver for a room as heard now (its variation if ready), one take.
  _convolver(room, take, baseOnly = false) {
    for (const key of baseOnly ? [room] : [this.variants[room], room]) {
      if (!key) continue;
      const k = key + '#' + take;
      let node = this.convolvers.get(k);
      if (node) return node;
      const buf = this.irBuffers.get(k);
      if (!buf) continue;
      node = this.ctx.createConvolver();
      node.normalize = false;
      node.buffer = buf;
      node.connect(this.out);
      node.key = k;
      this.convolvers.set(k, node);
      return node;
    }
    return null;
  }

  // A looping sound's echo in a room (variation first, if its impulse is ready),
  // or null while it is being made: the desktop builds these ahead, and plays a
  // sound clean until its echo is ready; here the room's shared echo stands in.
  _loopWet(room, name, dry) {
    for (const key of [this.variants[room], room]) {
      if (!key) continue;
      const k = key + '|' + name;
      const have = this.loopWets.get(k);
      if (have) return have;
      const ir = this.irBuffers.get(key + '#0');
      if (!ir) continue;
      this._buildLoopWet(room, key, name, dry, ir);
      // Not made yet: the plain room's echo stands in, if it is ready (the
      // desktop's _pair: the variation's echo if built, or else the room's).
    }
    return null;
  }

  _buildLoopWet(room, key, name, dry, ir) {
    const k = key + '|' + name;
    if (this.loopWets.has(k) || this.loopWetPending.has(k)) return this.loopWetPending.get(k) || Promise.resolve();
    const p = this._renderLoopWet(ir, dry).then((buf) => {
      // Kept only while it is still this room's echo, and while the sound is held.
      if (buf && (this.variants[room] === key || key === room) && this.buffers.get('dry:' + name) === dry) {
        this.loopWets.set(k, buf);
        this._capLoopWets();
      }
    }).catch(() => {}).finally(() => this.loopWetPending.delete(k));
    this.loopWetPending.set(k, p);
    return p;
  }

  // The desktop builds every echo ahead (prepare_reverb, prepare_variant). Here the
  // looping sounds' own echoes for a room are made in the background, one at a
  // time, when the room (or its variation) comes into use: for the room itself,
  // every loop that can echo in it; for a variation, those already used here.
  _buildAhead(room, key) {
    const token = {};
    this._ahead = this._ahead || {};
    this._ahead[key] = token;
    const ir = this.irBuffers.get(key + '#0');
    if (!ir) return;
    const names = [];
    for (const [name, pair] of this.entries) {
      if (!pair.dry || !(pair.dry.loop || reverbIsLoop(name))) continue;
      if (!(RULES.ROOMS[name] || []).includes(room) || !(RULES.REVERB_SEND[RULES.FAMILY[name] || 'event'] > 0)) continue;
      const dry = this.buffers.get('dry:' + name);
      if (!dry || pair.dry.frames > BIG_FRAMES) continue;
      if (key !== room && !this.loopWets.has(room + '|' + name)) continue;
      names.push([name, dry]);
    }
    const next = () => {
      if (this._ahead[key] !== token || !names.length) return;
      if (key !== room && this.variants[room] !== key) return;
      const [name, dry] = names.shift();
      this._buildLoopWet(room, key, name, dry, ir).then(() => setTimeout(next, 30));
    };
    next();
  }

  // The oldest echoes go once they pass LOOP_WET_KEEP (Map keeps them in the
  // order they were made); the one just made stays.
  _capLoopWets() {
    let total = 0;
    for (const b of this.loopWets.values()) total += b.length * b.numberOfChannels * 4;
    for (const [k, b] of this.loopWets) {
      if (total <= LOOP_WET_KEEP || this.loopWets.size <= 1) break;
      total -= b.length * b.numberOfChannels * 4;
      this.loopWets.delete(k);
    }
  }

  // A long recording let go of: its own echoes go with it.
  _releaseWets(name) {
    for (const k of [...this.loopWets.keys()]) if (k.endsWith('|' + name)) this.loopWets.delete(k);
  }

  // The desktop's reverb_apply for a loop: the loop convolved circularly with the
  // room's impulse (the loop played round enough times for the echo to settle,
  // then one turn of it taken), never louder at its peak than 0.9 of full scale.
  // Worked out in a background thread (wetworker.js), one at a time, never with
  // an OfflineAudioContext: an iPhone fails or closes the page after a few dozen.
  _renderLoopWet(ir, dry) {
    if (!this._wetWorker) {
      try {
        // (Its address carries this file's version, as the modules' do: js/version.js.)
        this._wetWorker = new Worker(new URL('./wetworker.js' + new URL(import.meta.url).search, import.meta.url));
      } catch (e) { return Promise.resolve(null); }
      this._wetJobs = new Map();
      this._wetSeq = 0;
      this._wetWorker.onmessage = (ev) => {
        const job = this._wetJobs.get(ev.data.id);
        if (!job) return;
        this._wetJobs.delete(ev.data.id);
        if (ev.data.error || !ev.data.out) { job(null); return; }
        const [l, r] = ev.data.out;
        const buf = this.ctx.createBuffer(2, l.length, RATE);
        buf.copyToChannel(l, 0);
        buf.copyToChannel(r, 1);
        job(buf);
      };
      this._wetWorker.onerror = () => {
        for (const job of this._wetJobs.values()) job(null);
        this._wetJobs.clear();
      };
    }
    const id = ++this._wetSeq;
    const chans = (b) => Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c).slice());
    return new Promise((resolve) => {
      this._wetJobs.set(id, resolve);
      const dryCh = chans(dry);
      const irCh = chans(ir);
      this._wetWorker.postMessage({ id, dry: dryCh, ir: irCh }, [...dryCh, ...irCh].map((c) => c.buffer));
    });
  }

  // Ease the wall effect toward a new setting and re-level every live echo
  // (the desktop's set_surroundings).
  setSurroundings(gain, lean, dt) {
    const a = dt > 0 ? Math.min(1.0, dt / RULES.REVERB_SMOOTH) : 1.0;
    this.roomGain += (gain - this.roomGain) * a;
    this.roomLean += (lean - this.roomLean) * a;
    for (const v of this.live) v.refreshWet();
  }

  // ---------------------------------------------------------------- binaural 3D (Ultimate Mode)
  // Turn the 3D world on: from now on a Voice played with `pos` is placed by the
  // HRTF panner (the listener stays at the origin; the way it faces is setFacing's,
  // north until told otherwise), and everything but a 'direct' sound passes through
  // the world's filter and gain. Idempotent; made again for a fresh engine by
  // recover(), which keeps the facing.
  spatialOn() {
    this.spatial = true;
    this._master(MASTER_LEVEL_3D);
    if (this.worldIn) return;
    const ctx = this.ctx;
    this.worldIn = fixedStereo(ctx.createGain());
    this.worldFilter = ctx.createBiquadFilter();
    this.worldFilter.type = 'lowpass';
    this.worldFilter.Q.value = 0.5;
    this.worldFilter.frequency.value = MUFFLE_OPEN_HZ;
    this.worldGain = ctx.createGain();
    this.worldGain.gain.value = 1.0;
    this.worldIn.connect(this.worldFilter);
    this.worldFilter.connect(this.worldGain);
    this.worldGain.connect(this.out);
    const l = ctx.listener;
    try {
      if (l.positionX) { l.positionX.value = 0; l.positionY.value = 0; l.positionZ.value = 0; }
      if (l.upX) { l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
    } catch (e) { /* the defaults are the same */ }
    this.setFacing(this.facing || 0, true);
  }

  // The master level, glided to so it never clicks.
  _master(level) {
    if (!this.out) return;
    const g = this.out.gain;
    const now = this.ctx.currentTime;
    glideTo(g, level, now, SEND_GLIDE);    // (6.3.7: a glide that ends, see LEVEL_GLIDE)
  }

  // The way the listener faces, in radians clockwise from north (web 4.0.0:
  // Ultimate Mode's world turns with you). Every placed sound turns with it at
  // once, those already sounding included; how loud each one is stays the game's
  // own business. A turn is a string of small changes, each glided to, so the
  // world sweeps round without a zip; `instant` is for being put down facing a
  // new way (a fresh run, stepping out of the lift).
  setFacing(theta, instant = false) {
    this.facing = theta;
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const fx = Math.sin(theta); const fz = -Math.cos(theta);
    try {
      if (l.forwardX) {
        const now = this.ctx.currentTime;
        for (const [p, v] of [[l.forwardX, fx], [l.forwardY, 0], [l.forwardZ, fz]]) {
          if (instant) { p.cancelScheduledValues(now); p.setValueAtTime(v, now); } else glideTo(p, v, now, FACE_GLIDE);
        }
      } else if (l.setOrientation) l.setOrientation(fx, 0, fz, 0, 1, 0);   // (browsers without the listener's own parameters)
    } catch (e) { /* the listener stays as it was */ }
  }

  // The 3D world is over: the area echoes go, and sounds play as everywhere else.
  spatialOff({ now = false } = {}) {
    this.spatial = false;
    this._master(MASTER_LEVEL);
    this.listenerMix = null;
    this.setFacing(0, true);     // north again, for whatever comes next
    this.setAreaRooms([], { now });
    if (this.worldGain) {
      const g = this.worldGain; const f = this.worldFilter; const i = this.worldIn;
      this.worldIn = this.worldFilter = this.worldGain = null;
      // Anything still ringing (an explosion's echo) is let finish; at a game over
      // (`now`) every sound of the world has been stopped, so the chain goes at once.
      const drop = () => { for (const n of [i, f, g]) { try { n.disconnect(); } catch (e) { /* gone */ } } };
      if (now) drop(); else setTimeout(drop, 5000);
    }
  }

  // Let go of the long decoded recordings that nothing plays, down to BIG_KEEP
  // (a run of Ultimate Mode can leave twenty of them in memory; a phone minds).
  trimBig() {
    const pinned = new Set(this.pins.values());
    const playing = new Set();
    for (const v of this.live) { playing.add('dry:' + v.name); playing.add('dull:' + v.name); }
    const free = [...this.bigUsed.keys()].filter((k) => !pinned.has(k) && !playing.has(k))
      .sort((a, b) => this.bigUsed.get(a) - this.bigUsed.get(b));
    let n = [...this.bigUsed.keys()].filter((k) => !pinned.has(k)).length;
    for (const k of free) {
      if (n <= BIG_KEEP) break;
      this.bigUsed.delete(k);
      this.buffers.delete(k);
      if (k.startsWith('dry:')) this._releaseWets(k.slice(4));
      n -= 1;
    }
  }

  // Where a Voice's branches go: the world chain in 3D, the output otherwise.
  get bus() { return this.spatial && this.worldIn ? this.worldIn : this.out; }

  // An HRTF panner plugged into the mix, placed at (x, y, z): a free one if there
  // is one (see PANNERS), else a new one.
  // (`to`, web 6.3.3: the mix to plug it into, if not the usual one: the output itself
  // for a placed sound heard clear of the 3D world's muffle and fade, the compass's guide.)
  takePanner(x, y, z, to = null) {
    const bus = to || this.bus; const ctx = this.ctx;
    const free = PANNERS.get(bus);
    let p = null;
    // (6.3.6) Any free panner will do, since it is woken: the one let go of longest ago.
    if (free && free.length) { p = free.shift(); pannerStats.reused += 1; this.wakePanner(p); }
    if (!p) {
      pannerStats.made += 1;
      PANNER_COUNT.set(bus, (PANNER_COUNT.get(bus) || 0) + 1);
      p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'linear';
      p.refDistance = 1;
      p.maxDistance = 10000;
      p.rolloffFactor = 0;
      p.connect(bus);
    }
    p.__bus = bus;
    SENT.delete(p);                 // (what was last sent was for the sound before)
    Voice._place(p, x, y, z, ctx.currentTime, true);
    return p;
  }

  // (6.3.6, see PANNER_NEAR.) A panner about to play again after a silence: made new
  // inside, and its next place sure to be taken as a new one. Only ever done to a panner
  // nothing is sounding through, so nothing is cut short.
  wakePanner(p) {
    if (!p) return;
    try { p.panningModel = 'equalpower'; p.panningModel = 'HRTF'; } catch (e) { /* as it was */ }
    p.__r = p.__r === PANNER_FAR ? PANNER_NEAR : PANNER_FAR;
    SENT.delete(p);
    pannerStats.woken += 1;
  }

  // A panner whose sound is done, its input already cut: kept plugged in for the
  // next sound (6.3.4: always; never unplugged).
  givePanner(p) {
    if (!p) return;
    const bus = p.__bus;
    let free = bus && PANNERS.get(bus);
    if (bus && !free) { free = []; PANNERS.set(bus, free); }
    if (!free || bus.context !== this.ctx || this.ctx.state === 'closed') {
      try { p.disconnect(); } catch (e) { /* already */ }
      return;
    }
    if (free.includes(p)) return;
    free.push(p);
    // (6.3.4) Kept, always: a panner unplugged from the mix can be heard as a pop.
  }

  // The world's level (a regeneration fades it out and in) and its muffling (the
  // compass): both glide over `seconds`.
  setWorldLevel(level, seconds = 0) {
    if (!this.worldGain) return;
    const p = this.worldGain.gain; const now = this.ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(clamp(level, 0, 1), now + Math.max(0.01, seconds));
  }

  setMuffle(on, seconds = 0.4) {
    if (!this.worldFilter) return;
    const p = this.worldFilter.frequency; const now = this.ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.exponentialRampToValueAtTime(on ? MUFFLE_CLOSED_HZ : MUFFLE_OPEN_HZ, now + Math.max(0.01, seconds));
  }

  // A room's impulse response stretched in time, so a bigger area rings longer
  // (the same echo, slowed; its level eased so a long tail is not louder).
  _stretchedIr(room, take, stretch) {
    const src = this.irBuffers.get(room + '#' + take);
    if (!src) return null;
    const s = Math.round(Math.max(0.5, Math.min(2.5, stretch)) * 20) / 20;
    if (Math.abs(s - 1) < 1e-6) return src;
    const k = room + '#' + take + '@' + s;
    const have = this.stretched.get(k);
    if (have) return have;
    const n = Math.floor(src.length * s);
    const out = this.ctx.createBuffer(src.numberOfChannels, n, src.sampleRate);
    const level = 1 / Math.sqrt(s);
    for (let c = 0; c < src.numberOfChannels; c++) {
      const a = src.getChannelData(c); const b = out.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const x = i / s; const j = Math.floor(x); const f = x - j;
        const v0 = a[j] || 0; const v1 = a[j + 1] || 0;
        b[i] = (v0 + (v1 - v0) * f) * level;
      }
    }
    if (this.stretched.size > 24) this.stretched.delete(this.stretched.keys().next().value);
    this.stretched.set(k, out);
    return out;
  }

  // The areas whose echoes are kept ready: [{ id, room, stretch }]. An area that
  // drops off the list keeps ringing for a moment, then its convolver goes. A
  // room with no impulse (null: the open air of an island) gets a bus with no
  // echo, so the sends simply go nowhere.
  setAreaRooms(areas, { now = false } = {}) {
    const keep = new Set(areas.map((a) => a.id));
    for (const [id, b] of [...this.areaBuses]) {
      if (keep.has(id)) continue;
      this.areaBuses.delete(id);
      const retire = () => {
        if (!now && [...this.live].some((v) => v.areaMix && v.areaMix[id])) { setTimeout(retire, 4000); return; }
        try { b.gain.disconnect(); } catch (e) { /* gone */ }
        if (b.conv) { try { b.conv.disconnect(); } catch (e) { /* gone */ } }
      };
      // `now`: the world has ended and is muted, so the old rooms go at once
      // instead of ringing on beside the next world's (a convolver each: on a
      // phone, twenty of them at a regeneration is a load it may not carry).
      if (now) retire(); else setTimeout(retire, 5000);
    }
    for (const a of areas) {
      let b = this.areaBuses.get(a.id);
      if (b && b.room === a.room && b.stretch === a.stretch) continue;
      if (b) { try { b.gain.disconnect(); } catch (e) { /* gone */ } }
      b = { id: a.id, room: a.room, stretch: a.stretch, gain: this.ctx.createGain(), conv: null };
      b.gain.gain.value = 1.0;
      if (a.room) {
        const ir = this._stretchedIr(a.room, 0, a.stretch || 1);
        if (ir) {
          b.conv = this.ctx.createConvolver();
          b.conv.normalize = false;
          b.conv.buffer = ir;
          b.conv.key = a.room + '#0';
          b.gain.connect(b.conv);
          b.conv.connect(this.bus);
        }
      }
      this.areaBuses.set(a.id, b);
      // Voices already sending to this area pick the new bus up.
      for (const v of this.live) if (v.areaMix && v.areaMix[a.id]) v.setAreaMix(v.areaMix);
    }
  }

  // ---------------------------------------------------------------- playing
  // Play a sound. `loops` -1 loops it; `at` is where in the world it happens, if
  // not at the player: its echo then comes from that part of the room, and it
  // sounds dull if that spot is behind the player. Returns the Voice, or null.
  // In 3D (spatial): `pos` [x, y] (and `height`) place the sound relative to the
  // player, `areaMix` { areaId: weight } sends its echo to its area's bus, and
  // `direct` plays it past the world's filter and fade (the compass). A sound
  // given no `areaMix` rings where the player is (listenerMix). `send` sets the
  // sound's echo level in place of its family's (a background's light echo).
  // (Web 6.0.0: `send` outside the 3D world too: the sound rings in the room the
  // player is in at that level, whatever its own room list says. Battle Mode's
  // arena crowd, whose recordings have no room list of their own.)
  // `keep`: a cue that must be heard out (a bus's chime, the countdown): it is
  // never the one-shot that gives way to a newer one.
  // `wide` (3D only, web 4.1.0): a recording with no place of its own that still
  // turns with the world: its left side stands in the world's west and its right
  // side in the east (see Voice._branch).
  // `offset` (web 6.1.0): seconds into the recording to start from (a loop carries on
  // round from there): Battle's crowd plays a second copy of its recording half a
  // loop on (game.js BATTLE_CROWD_COPY).
  // `clear` (3D only, web 6.3.3): placed, but heard past the world's filter and fade, as
  // a 'direct' sound is: the compass's guide, which must stand out of the frozen world's muffle.
  play(name, { loops = 0, volume = 1.0, fadeMs = 0, at = null, pos = null, height = 0, areaMix = null, direct = false, send = null, keep = false, wide = false, offset = 0, clear = false } = {}) {
    const pair = this.entries.get(name);
    if (!pair || !pair.dry) return null;
    if (loops === -1) {
      // A drone starting is the room changing with it (the desktop's
      // reverb_ambience_base), even heard ahead through the elevator's walls as
      // its muffled copy. The road's tunnels set theirs themselves.
      const drone = name.endsWith('_muffled') ? name.slice(0, -'_muffled'.length) : name;
      if (drone.startsWith('lab_')) this.setVariant('lab', drone);
      else if (drone.startsWith('bat_')) this.setVariant('battle', drone);
      else if (drone.startsWith('tow_')) this.setVariant('tower', drone);
    }
    let src = null;
    let behind = 0.0;
    if (at && this.sourceEffect) { try { src = this.sourceEffect(at); } catch (e) { src = null; } }
    if (at && this.behindOf) { try { behind = this.behindOf(at); } catch (e) { behind = 0.0; } }
    if (loops !== -1) {
      // A full house of one-shots: the oldest still playing gives way to the new
      // one. One-shots are counted among themselves. Until web 3.3.0 every voice
      // was counted, loops too, and in a crowded world of Ultimate Mode the loops
      // alone (most of them far-off areas, unheard) nearly filled the house: in a
      // fight each new footstep or shot stopped the oldest one-shot still
      // sounding, which was the long ones first, the bus pulling up, its chime,
      // the crowd's roar; and with loops alone at the ceiling, a one-shot was not
      // started at all. A loop no longer costs a one-shot its place, and a cue
      // marked `keep` is never the one to go.
      // (Outside Ultimate Mode one already fading out of the way no longer counts.)
      const soft = !this.spatial;
      let shots = 0; let oldest = null;
      for (const o of this.live) {
        if (o.loop || (soft && o.culling)) continue;
        shots += 1;
        if (!oldest && !o.direct && !o.keep) oldest = o;
      }
      const ceiling = this.spatial ? this.maxShots3d : this.binaural ? this.maxShotsBin : this.maxShots;
      if (shots >= ceiling) {
        if (oldest) { this._cull(oldest); this.culled += 1; }
        else if (!keep) { this.culled += 1; return null; }   // (every one of them a cue: the newcomer gives way)
      }
    }
    const v = new Voice(this, name, pair, { loop: loops === -1, volume, fadeMs, src, behind });
    v.keep = !!keep;
    if (this.spatial) {
      v.direct = !!direct;
      if (pos) { v.pos3 = [pos[0], height, pos[1]]; v.clear = !!clear && !direct; }
      else v.wide = !!wide && !direct;
      const mix = areaMix || (direct ? null : this.listenerMix);
      if (mix) v.areaMix = { ...mix };
      if (send !== null && send !== undefined) { v.send = send; v.sendSet = true; }
    } else {
      if (send !== null && send !== undefined) { v.send = send; v.sendSet = true; }
    }
    if (!this.spatial && this.binaural) {
      // A sound played at a place is heard from that place.
      if (at && this.relOf) { try { v.atRel = this.relOf(at) || null; } catch (e) { v.atRel = null; } }
      if (v.atRel) v.dir = v.atRel;    // (6.3.3: so its panner is chosen for that place from the start)
      // A background in a mode that turns: it turns with the world (see _branch).
      v.wide = loops === -1 && !v.atRel && !!(this.turnsNow ? this.turnsNow() : this.turns);
      if (v.atRel && loops !== -1) {
        let placed = 0; let first = null;
        for (const o of this.live) if (!o.loop && o.atRel && !o.keep && !o.culling) { placed += 1; if (!first) first = o; }
        if (placed >= this.maxPlaced && first) { this._cull(first); this.culled += 1; }
      }
    }
    this.live.add(v);
    v.begin(Math.max(0, offset || 0));
    return v;
  }

  // A one-shot making room for a newer one: in Ultimate Mode stopped as it always
  // was; everywhere else faded out quickly, since a sound cut off in the middle
  // clicks (web 5.1.0).
  _cull(v) {
    if (this.spatial) { v.stop(); return; }
    v.culling = true;
    v.fadeout(CULL_FADE_MS);
  }

  stopAllLoops(keep = []) {
    // (A sound that follows another, web 6.0.0, is spared with it: see Voice.followers.)
    const spared = new Set(keep.filter((k) => k));
    for (const k of [...spared]) for (const f of k.followers || []) spared.add(f);
    for (const v of [...this.live]) {
      if (v.loop && !spared.has(v)) v.stop();
    }
  }

  stopAll() {
    for (const v of [...this.live]) v.stop();
  }

  // Hold several loops where they are, or let them carry on, as one: a single
  // reading of the clock for all of them, so that two copies of one recording
  // (Ultimate Mode's placed and wide backgrounds) are exactly as far apart
  // afterwards as they were before, however often it happens.
  holdAll(voices, held) {
    const now = this.ctx.currentTime;
    for (const v of voices) {
      if (!v) continue;
      if (held) v.pause(now); else v.resume(now);
    }
  }

  pauseBeeps() {
    const held = [];
    for (const v of this.live) {
      if (!v.paused && isPauseBeep(v.name)) { v.pause(); held.push(v); }
    }
    return held;
  }
}

// One playing sound, with its echo and its dull copy: the desktop's PairedChannel.
export class Voice {
  constructor(audio, name, pair, { loop, volume, fadeMs, src, behind }) {
    this.audio = audio;
    this.ctx = audio.ctx;
    this.name = name;
    this.pair = pair;
    this.loop = loop;
    this.l = this.r = clamp(volume, 0, 1);
    this.behind = clamp(behind || 0, 0, 1);
    this.fadeMs = fadeMs;
    this.family = RULES.FAMILY[name] || 'event';
    this.send = RULES.REVERB_SEND[this.family] || 0.0;
    this.srcGain = src ? src[0] : null;
    this.srcLean = src ? src[1] : 0.0;
    this.playGain = 1.0 + (Math.random() * 2 - 1) * RULES.REVERB_PLAY_GAIN;
    this.playLean = (Math.random() * 2 - 1) * RULES.REVERB_PLAY_LEAN;
    this.stopped = false;
    this.paused = false;
    this.ended = false;
    this.sources = [];
    this.offset = 0;
    // Binaural 3D (see AudioEngine.spatialOn): where the sound is, relative to the
    // player ([x, height, z]: z positive is behind), which areas' echoes it rings
    // in, and whether it plays past the world's filter.
    this.pos3 = null;
    this.areaMix = null;
    this.direct = false;
    this.wide = false;        // a recording with no place that still turns with the world (AudioEngine.play, _branch)
    this.keep = false;        // a cue that is never stopped to make room for a newer one-shot (AudioEngine.play)
    this.clear = false;       // placed, but past the 3D world's filter and fade (AudioEngine.play, web 6.3.3)
    this.jump = false;        // its next place is set at once, not glided to (see resume)
    // Web 6.0.0: sounds that go with this one (Battle Mode's crowd goes with its
    // drums): they stop when it stops and fade when it fades, and a stopAllLoops
    // that spares it spares them.
    this.followers = [];
    // Binaural 3D outside Ultimate Mode (web 5.0.0).
    this.atRel = null;        // played at a place: the way it lies from the player ([east, south], a unit vector)
    this.posd = false;        // the mode gives it a left and a right level: it has a direction
    this.dir = [0, -1];       // the way it lies in the world, as last worked out (north: straight ahead)
  }

  // Whether this voice is placed by the engine from its levels (binaural, outside
  // the 3D world): it was played at a place, or the mode pans it.
  get binPlaced() { return this.audio.binaural && !this.audio.spatial && !this.direct && (!!this.atRel || this.posd); }

  // Whether this voice is placed by the panner: the world is 3D and it has a place.
  get placed() { return this.audio.spatial && !!this.pos3 && !this.direct; }

  // (`share`, web 6.3.3: the panner of this voice's clean branch, which its dull branch
  // plays through too. The two are always at the same place, and a panner is linear, so one
  // panner heard both exactly as two did, at half the work for the phone: an HRTF panner is
  // the costliest thing in the game's sound, and a thing behind you kept two of them busy.)
  _branch(buffer, echo = false, share = null) {
    const ctx = this.ctx;
    // A sound heard from a place plays its one-channel copy (web 6.0.0, see monoCopy).
    // (A wide recording is not placed: its two sides are its west and its east.)
    const wideHere = this.wide && !this.direct && (this.audio.spatial || (this.audio.binaural && buffer.numberOfChannels === 2));
    if (!echo && !wideHere && (this.placed || this.binPlaced)) buffer = monoCopy(ctx, buffer);
    const fade = ctx.createGain();
    // A sound kept as one channel is spread to both sides here.
    fade.channelCount = 2;
    fade.channelCountMode = 'explicit';
    fade.channelCountInterpretation = 'speakers';
    const split = ctx.createChannelSplitter(2);
    const gl = ctx.createGain();
    const gr = ctx.createGain();
    const merge = ctx.createChannelMerger(2);
    gl.gain.value = 0; gr.gain.value = 0;
    fade.connect(split);
    split.connect(gl, 0); split.connect(gr, 1);
    gl.connect(merge, 0, 0); gr.connect(merge, 0, 1);
    let panner = null;
    let wide = null;
    if (wideHere) {
      // A wide recording in the 3D world (web 4.1.0): until now it was plain
      // stereo, all round you, and stayed put while everything else swept round
      // as you turned. Now its left side stands in the world's west and its right
      // side in the world's east, each through its own HRTF panner, always the
      // same way from you wherever you walk. Facing north it is left and right as
      // it always was; turn, and the recording turns round your head with the
      // rest of the world. (A recording whose two sides are the same has nothing
      // to turn: it sounds the same whichever way you face.)
      const side = (x) => {
        const p = ctx.createPanner();
        p.panningModel = 'HRTF';
        p.distanceModel = 'linear';
        p.refDistance = 1;
        p.maxDistance = 10000;
        p.rolloffFactor = 0;
        Voice._place(p, x, 0, 0, ctx.currentTime, true);
        return p;
      };
      const west = side(-1); const east = side(1);
      // (The panners take a little off a sound straight to the side: put back.)
      const lift = ctx.createGain();
      lift.gain.value = WIDE_GAIN * (this.audio.spatial ? 1 : (WIDE_TRIM[this.name] || 1));
      gl.connect(west); gr.connect(east);
      west.connect(lift); east.connect(lift);
      lift.connect(this.audio.bus);
      // (The merged pair is left unconnected: nothing of this sound goes out plain.)
      wide = { west, east, lift };
      return { buffer, fade, split, gl, gr, merge, panner, wide };
    }
    if ((this.placed || this.binPlaced) && share) {
      merge.connect(share);
      return { buffer, fade, split, gl, gr, merge, panner: share, wide, shared: true };
    }
    if (this.placed || this.binPlaced) {
      // The HRTF panner places the sound; the game still sets its loudness by
      // distance itself, so the panner's own distance rolloff is turned off.
      const [x, y, z] = this.placed ? this.pos3 : [this.dir[0], 0, this.dir[1]];
      panner = this.audio.takePanner(x, y, z, this.clear && this.placed ? this.audio.out : null);
      merge.connect(panner);
    } else {
      merge.connect(this.direct ? this.audio.out : this.audio.bus);
    }
    return { buffer, fade, split, gl, gr, merge, panner, wide };
  }

  static _place(panner, x, y, z, now, instant, same = false) {
    // Never exactly at the listener's own point: the panner's direction would be
    // undefined there. A thing underfoot is a step ahead, centred.
    if (Math.hypot(x, y, z) < 0.05) { x = 0; z = -0.05; }
    if (same) {
      // A direction no different from the last one sent is not sent again (web
      // 5.1.0; in the 3D worlds too from 6.3.0, with the panners' distance roll-off
      // turned off only the direction is heard); and a small turn of it waits a
      // thirtieth of a second from the last (SEND_GAP).
      const was = SENT.get(panner);
      if (!instant && was) {
        const m = Math.hypot(x, y, z) * Math.hypot(was[0], was[1], was[2]);
        const cos = m > 0 ? (x * was[0] + y * was[1] + z * was[2]) / m : 1;
        if (cos >= PLACE_SAME) return;
        if (now - was[3] < SEND_GAP && cos >= PLACE_SOON) return;
      }
      SENT.set(panner, [x, y, z, now]);
    }
    panner.__dir = unitDir(x, y, z);     // (where it points now)
    // (6.3.6: the same direction, at this panner's distance of the moment: see wakePanner.)
    const k = panner.__r || 1;
    if (k !== 1) { x *= k; y *= k; z *= k; }
    if (panner.positionX) {
      for (const [p, v] of [[panner.positionX, x], [panner.positionY, y], [panner.positionZ, z]]) {
        if (instant) { p.cancelScheduledValues(now); p.setValueAtTime(v, now); } else glideTo(p, v, now, PLACE_GLIDE);
      }
    } else panner.setPosition(x, y, z);
  }

  // Move a placed sound (3D). Nothing happens outside the 3D world.
  setPosition(x, z, y = 0) {
    this.pos3 = [x, y, z];
    if (!this.dry || !this.audio.spatial) return;
    // (6.3.3) A sound that has ended, or is held, keeps its panner where it last played
    // from: a silent panner does not move inside, whatever it is told, so it is told
    // nothing until it plays again (resume puts it where the sound is then).
    if (this.ended || this.stopped || this.paused) return;
    const now = this.ctx.currentTime;
    // One just carried on after being held (see resume) is put where it now is
    // at once: the player may have come a long way while it was silent.
    const jump = !!this.jump;
    this.jump = false;
    for (const br of [this.dry, this.dull]) if (br && br.panner && !br.shared) Voice._place(br.panner, x, y, z, now, jump, true);
  }

  // Which areas' echoes a placed sound rings in (3D): { areaId: weight }.
  setAreaMix(mix) {
    this.areaMix = mix ? { ...mix } : null;
    const w = this.wet;
    if (!w || !w.taps) return;
    const a = this.audio;
    const now = this.ctx.currentTime;
    // Areas no longer in the mix fade out of it.
    // (6.3.0: a tap's level is sent only when it changes, not in every frame.)
    for (const [id, tap] of w.taps) if (!(this.areaMix && this.areaMix[id]) && tap.want !== 0) { tap.want = 0; glideTo(tap.gain, 0, now, SEND_GLIDE); }
    for (const [key, want] of Object.entries(this.areaMix || {})) {
      // (The mix's keys are strings, as every object key is; the buses are kept
      // by the areas' numbers.)
      const id = Number(key);
      const bus = a.areaBuses.get(id);
      if (!bus) continue;
      let tap = w.taps.get(id);
      if (!tap || tap.bus !== bus) {
        if (tap) { try { tap.disconnect(); } catch (e) { /* gone */ } }
        tap = this.ctx.createGain();
        tap.gain.value = 0;
        tap.bus = bus;
        w.merge.connect(tap);
        tap.connect(bus.gain);
        w.taps.set(id, tap);
      }
      // The desktop's one-shot echo scale for this sound in that area's room. A
      // beacon's beep in a room stretched longer than its own keeps the echo of
      // the plain room: a long tail on a repeating beep sounds like more beeps.
      const OS = RULES.ONCE_SCALE || {};
      let scale = bus.conv ? ((OS[bus.conv.key] || {})[this.name] || 1) : 1;
      if (this.family === 'beacon' && bus.stretch > 1) scale /= bus.stretch;
      const level = clamp(want, 0, 1) * scale;
      if (tap.want !== undefined && Math.abs(tap.want - level) < 1e-3) continue;
      tap.want = level;
      glideTo(tap.gain, level, now, SEND_GLIDE);
    }
  }

  // Level, place and dullness in one call, every frame (3D): the loudness the
  // game worked out for the distance, where the thing is relative to the
  // player, and how far behind.
  setSpatial(level, dx, dz, behind = 0, height = 0) {
    this.setPosition(dx, dz, height);
    this.setVolume(level, level, behind);
  }

  begin(offset = 0) {
    const a = this.audio;
    const dryKey = 'dry:' + this.name;
    const buf = a.buffers.get(dryKey);
    if (!buf) {
      // A long recording not decoded yet: it starts the moment it is ready.
      a._decode(dryKey, this.pair.dry).then(() => { if (!this.stopped) this.begin(offset); }).catch(() => this.stop());
      return;
    }
    if (buf && this.pair.dry.frames > BIG_FRAMES) a._noteBig(dryKey);
    this.dry = this._branch(buf);
    const dullBuf = this.pair.dull ? a.buffers.get('dull:' + this.name) : null;
    if (dullBuf && a.room !== 'tunnel') this.dull = this._branch(dullBuf, false, a.spatial ? (this.dry.panner || null) : null);
    // The echo. A looping sound gets its own (see AudioEngine._loopWet), played in
    // step with it, so it stops, pauses and fades with it as the desktop's does.
    // Anything else sends into the room's convolver; a loop sound played once gets
    // the plain room's first take, as the desktop's one-shot echo of a loop.
    const rooms = RULES.ROOMS[this.name] || [];
    const loopWet = (a.room && this.send > 0 && rooms.includes(a.room) && this.loop && !a.spatial)
      ? a._loopWet(a.room, this.name, buf) : null;
    if (a.spatial && !this.direct && this.send > 0 && (rooms.length || this.pair.dry.made || this.sendSet)) {
      // 3D: the echo is sent to the buses of the areas the sound is in (see
      // setAreaMix), each with that area's own echo. The level is the plain
      // room's one-shot scale, as a one-shot in that room would get.
      const ctx = this.ctx;
      const split = ctx.createChannelSplitter(2);
      const wl = ctx.createGain();
      const wr = ctx.createGain();
      const merge = ctx.createChannelMerger(2);
      wl.gain.value = 0; wr.gain.value = 0;
      this.dry.fade.connect(split);
      split.connect(wl, 0); split.connect(wr, 1);
      wl.connect(merge, 0, 0); wr.connect(merge, 0, 1);
      this.wet = { split, wl, wr, merge, taps: new Map() };
      this.wetScale = 1;
      if (this.areaMix) this.setAreaMix(this.areaMix);
    } else if (loopWet) {
      const br = this._branch(loopWet, true);
      this.wet = { buffer: loopWet, fade: br.fade, split: br.split, wl: br.gl, wr: br.gr, merge: br.merge, panner: br.panner, wide: br.wide };
    } else if (a.room && this.send > 0 && (rooms.includes(a.room) || (this.sendSet && !a.spatial))) {
      const takes = RULES.TAKES[this.name] || 1;
      const once = !this.loop && (this.pair.dry.loop || reverbIsLoop(this.name));
      const conv = once ? a._convolver(a.room, 0, true)
        : (a._convolver(a.room, Math.floor(Math.random() * takes)) || a._convolver(a.room, 0));
      if (conv) {
        const ctx = this.ctx;
        const split = ctx.createChannelSplitter(2);
        const wl = ctx.createGain();
        const wr = ctx.createGain();
        const merge = ctx.createChannelMerger(2);
        wl.gain.value = 0; wr.gain.value = 0;
        this.dry.fade.connect(split);
        split.connect(wl, 0); split.connect(wr, 1);
        wl.connect(merge, 0, 0); wr.connect(merge, 0, 1);
        merge.connect(conv);
        this.wet = { split, wl, wr, merge, conv };
        // The desktop's echo of a one-shot is never louder at its peak than 0.9 of
        // full scale (reverb_apply); the factor it scales by comes from the build.
        // A variation's own factor for the game's sounds; an event recording gets
        // its room's (the build works those out for the rooms only).
        const OS = RULES.ONCE_SCALE || {};
        const own = (OS[conv.key] || {})[this.name];
        const base = this.pair.dry.lazy ? (OS[conv.key.replace(/\/[^#]*/, '')] || {})[this.name] : undefined;
        this.wetScale = own || base || 1;
      }
    }
    const now = this.ctx.currentTime;
    // Nothing has sounded yet: the first levels are set outright, not glided to
    // (the desktop sets a channel's volume before it is ever mixed).
    this.begunAt = now;
    for (const br of [this.dry, this.dull, this.wet && this.wet.buffer ? this.wet : null]) {
      if (!br) continue;
      if (this.fadeMs > 0) {
        br.fade.gain.setValueAtTime(0, now);
        br.fade.gain.linearRampToValueAtTime(1, now + this.fadeMs / 1000);
      }
    }
    this.apply(true);
    this._startSources(offset);
  }

  // Carry a looping sound over to a fresh sound engine (see AudioEngine.recover).
  rebind(oldCtx) {
    if (this.stopped || this.ended) return;
    // A loop still being decoded begins in the new engine when it is ready.
    if (this.loop && !this.dry) { this.ctx = this.audio.ctx; return; }
    // One fading out was on its way out anyway.
    if (this.fadingOut) { this.stop(); return; }
    if (!this.loop || !this.dry) {
      // A one-shot plays out where it began (see recover); it is just no longer
      // tracked here. (6.3.7: one that was being held has nowhere to carry on, its
      // engine is going: it is stopped, so nothing waits for it to end.)
      if (this.paused) this.stop();
      this.audio.live.delete(this);
      return;
    }
    const wasPaused = this.paused;
    const offset = wasPaused ? this.offset : Math.max(0, oldCtx.currentTime - this.startedAt);
    this._endTail(0, oldCtx.currentTime);   // (6.3.7: a ringing echo belongs to the old engine)
    this._stopSources();
    this._disconnect();
    this.ctx = this.audio.ctx;
    this.dry = this.dull = this.wet = null;
    this.fadeMs = 0;
    this.paused = false;
    this.begin(offset);
    if (wasPaused) this.pause(undefined, false);     // (held again in silence: no echo to ring out)
  }

  _startSources(offset, now = this.ctx.currentTime, echoLate = 0) {
    this.sources = [];
    if (!(offset > 0)) offset = 0;       // (6.3.7: never below nothing, nor not a number)
    let first = null;
    // (6.3.6) A placed one-shot starts a few milliseconds on (START_LEAD), so that its
    // panner's new place has surely reached the sound's own thread before its first sample.
    if (!this.loop && this.dry && this.dry.panner) now += START_LEAD;
    for (const br of [this.dry, this.dull, this.wet && this.wet.buffer ? this.wet : null]) {
      if (!br) continue;
      const s = this.ctx.createBufferSource();
      s.buffer = br.buffer;
      s.loop = this.loop;
      s.connect(br.fade);
      // (6.3.7: a baked echo carried on while its old self still rings starts a moment
      // later, that much further on, so it is still in step: see resume.)
      const late = br === this.wet ? echoLate : 0;
      if (this.loop) s.start(now + late, (offset + late) % br.buffer.duration);
      else if (offset < br.buffer.duration) s.start(now, offset);
      else continue;
      br.src = s;
      this.sources.push(s);
      if (!first) first = s;
    }
    this.startedAt = now - offset;
    if (first && !this.loop) {
      first.onended = () => { if (!this.paused && !this.stopped) this._finish(); };
    }
    if (!first) this._finish();
  }

  _finish() {
    this.ended = true;
    this.audio.live.delete(this);
    // The echo rings on by itself; the nodes go once it has.
    setTimeout(() => this._disconnect(), 4000);
  }

  _disconnect() {
    for (const br of [this.dry, this.dull]) {
      if (!br) continue;
      try { br.merge.disconnect(); } catch (e) { /* already */ }
      // (6.3.0: the panner too. Left connected to the mix, it stayed in the audio
      // graph for good, one for every placed sound ever played. 6.3.1: handed on to
      // the next sound instead of unplugged, see PANNERS.)
      if (br.panner && !br.shared) this.audio.givePanner(br.panner);
      br.panner = null;
      if (br.wide) {
        for (const n of [br.wide.west, br.wide.east, br.wide.lift]) { try { n.disconnect(); } catch (e) { /* already */ } }
      }
    }
    if (this.wet) {
      try { this.wet.merge.disconnect(); } catch (e) { /* already */ }
      const w = this.wet;
      if (w.panner) { this.audio.givePanner(w.panner); w.panner = null; }
      for (const n of (w.wide ? [w.wide.west, w.wide.east, w.wide.lift] : [])) { try { n.disconnect(); } catch (e) { /* already */ } }
      for (const tap of (this.wet.taps || new Map()).values()) { try { tap.disconnect(); } catch (e) { /* already */ } }
    }
  }

  _set(param, v, instant) {
    const now = this.ctx.currentTime;
    // A level no different from the last one sent is not sent again (every sound's
    // levels are set every frame; web 5.1.0, and in the 3D worlds too from 6.3.0);
    // nor one too little different to hear (LEVEL_SAME); and a small change waits a
    // thirtieth of a second from the last (SEND_GAP). A level going to or from
    // nothing is always sent.
    const was = SENT.get(param);
    if (!instant && now > this.begunAt && was !== undefined) {
      const d = Math.abs(was[0] - v);
      const top = Math.max(was[0], v);
      if (d < 1e-4) return;
      if (v > 0 && was[0] > 0) {
        if (d < LEVEL_SAME * top) return;
        if (now - was[1] < SEND_GAP && d < SEND_BIG * top) return;
      }
    }
    SENT.set(param, [v, now]);
    if (instant || now <= this.begunAt) { param.cancelScheduledValues(now); param.setValueAtTime(v, now); }
    // (6.3.7) A straight glide that ends, see LEVEL_GLIDE. The last glide has nearly
    // always ended by now (a level is sent at most once a frame), and then the level is
    // exactly what was last sent: the glide starts from there, with nothing to cancel
    // and nothing asked of the audio thread. Otherwise from wherever the level has got to.
    else if (was !== undefined && now - was[1] > LEVEL_GLIDE + 0.004) {
      param.setValueAtTime(was[0], now);
      param.linearRampToValueAtTime(v, now + LEVEL_GLIDE);
    } else glideTo(param, v, now, LEVEL_GLIDE);
  }

  get busy() { return !this.stopped && !this.ended; }

  setVolume(left, right = left, behind = null) {
    this.l = clamp(left, 0, 1);
    this.r = clamp(right, 0, 1);
    if (behind !== null && behind !== undefined) this.behind = clamp(behind, 0, 1);
    // (Binaural: a sound the mode pans, or says is in front of or behind you, has a direction.)
    if (!this.posd && (this.l !== this.r || (behind !== null && behind !== undefined))) this.posd = true;
    this.apply();
  }

  setBehind(b) { this.setVolume(this.l, this.r, b); }

  // Binaural (web 5.0.0): a branch that began plain, or as a wide background,
  // gets its panner the first time the mode gives the sound a direction.
  _binPanner(br) {
    if (br.panner) return br.panner;
    this._toMono(br);
    const share = this.audio.spatial && br === this.dull && this.dry && this.dry.panner ? this.dry.panner : null;
    const p = share || this.audio.takePanner(this.dir[0], 0, this.dir[1], null);
    if (share) br.shared = true;
    if (br.wide) {
      try { br.gl.disconnect(br.wide.west); br.gr.disconnect(br.wide.east); } catch (e) { /* already */ }
      // (6.3.0: the wide pair's own panners go too, not only their way out.)
      for (const n of [br.wide.west, br.wide.east, br.wide.lift]) { try { n.disconnect(); } catch (e) { /* already */ } }
      br.wide = null;
    } else {
      try { br.merge.disconnect(); } catch (e) { /* already */ }
    }
    br.merge.connect(p);
    br.panner = p;
    return p;
  }

  // A branch that began with the recording's two channels, and is now placed (the
  // mode gave the sound a direction after it began, web 6.0.0; a beacon in a mode
  // that turns begins as a wide loop until its first frame): from here on it plays
  // the one-channel copy, from the same point, in the same instant.
  _toMono(br) {
    if (!br || !br.buffer || br.buffer.numberOfChannels < 2) return;
    const mono = monoCopy(this.ctx, br.buffer);
    if (mono === br.buffer) return;
    br.buffer = mono;
    const old = br.src;
    if (!old || this.paused || this.stopped || this.ended) return;   // (held: it carries on from br.buffer)
    const now = this.ctx.currentTime;
    const offset = Math.max(0, now - this.startedAt);
    if (!this.loop && offset >= mono.duration) return;
    const s = this.ctx.createBufferSource();
    s.buffer = mono;
    s.loop = this.loop;
    s.connect(br.fade);
    s.start(now, this.loop ? offset % mono.duration : offset);
    if (old.onended) { s.onended = old.onended; old.onended = null; }
    try { old.stop(now); } catch (e) { /* not started */ }
    const i = this.sources.indexOf(old);
    if (i >= 0) this.sources[i] = s; else this.sources.push(s);
    br.src = s;
  }

  // The clean sound giving way to its dull copy as the thing goes behind the
  // player, and the echo swelling with it.
  apply(instant = false) {
    if (!this.dry) return;
    let b = this.behind; let l = this.l; let r = this.r;
    // (6.3.6) A placed sound heard again after its level was nothing (a beacon you walked
    // out of earshot of, and back): nothing went through its panners meanwhile, so they
    // are woken, as a panner from the pool is (see AudioEngine.wakePanner).
    const quiet = Math.max(l, r) <= 0;
    const again = this.quiet === true && !quiet && !this.paused && !this.ended && !this.stopped;
    this.quiet = quiet;
    if (again && (this.placed || this.binPlaced)) {
      const at = this.placed ? this.pos3 : null;
      for (const br of [this.dry, this.dull]) {
        if (!br || !br.panner || br.shared) continue;
        this.audio.wakePanner(br.panner);
        if (at) Voice._place(br.panner, at[0], at[1], at[2], this.ctx.currentTime, true);
      }
      // (6.3.7: its level is no longer set outright here. 6.3.6 did, and a beacon
      // walking back into earshot jumped from nothing to its level in one sample, a
      // click at the edge of hearing every time. The panner is new and already in
      // its place, so the level comes in with the usual short glide.)
    }
    if (this.binPlaced) {
      // The way the thing lies in the world, from the levels the mode worked out:
      // one side is full and the other lowered by how far to the side it is (the
      // desktop's pan, east over distance), and `behind` is above nothing only for
      // a thing to the south. Played at a place, the place itself says.
      const level = Math.max(l, r);
      if (this.atRel) this.dir = this.atRel;
      else if (level > 1e-6) {
        const pan = clamp((r - l) / level, -1, 1);
        const c = Math.sqrt(Math.max(0, 1 - pan * pan));
        this.dir = [pan, b > 0 ? c : -c];
      }
      const now = this.ctx.currentTime;
      const first = !this.dry.panner;
      for (const br of [this.dry, this.dull]) {
        if (!br) continue;
        const had = !!br.panner;
        // (6.3.3: an ended or held sound's panner stays where it last played from, as in setPosition.)
        if (this.ended || this.stopped || (had && this.paused)) continue;
        const p = this._binPanner(br);
        if (!br.shared) Voice._place(p, this.dir[0], 0, this.dir[1], now, instant || !had || again, true);
      }
      if (first) instant = true;
      // How far behind you it is heard: by the way you face now.
      const f = this.audio.facing || 0;
      const back = -(this.dir[0] * Math.sin(f) - this.dir[1] * Math.cos(f));
      b = back <= 0 ? 0 : Math.min(1, Math.pow(back, RULES.BEHIND_CURVE || 1.5));
      l = r = level;
    }
    this.heard = [l, r, b];
    let dg;
    if (this.dull) {
      dg = 1.0 - b * (1.0 - RULES.BEHIND_DRY_MIN);
      this._set(this.dull.gl.gain, Math.min(1.0, l * b), instant);
      this._set(this.dull.gr.gain, Math.min(1.0, r * b), instant);
    } else {
      dg = 1.0 - b * RULES.BEHIND_NO_COPY_DROP;
    }
    this._set(this.dry.gl.gain, l * dg, instant);
    this._set(this.dry.gr.gain, r * dg, instant);
    this.refreshWet(instant);
  }

  refreshWet(instant = false) {
    if (!this.wet) return;
    const a = this.audio;
    let send = this.send;
    const [hl, hr, hb] = this.heard || [this.l, this.r, this.behind];
    if (this.family === 'enemy') send *= 1.0 + RULES.REVERB_ENEMY_FAR * (1.0 - Math.min(1.0, Math.max(hl, hr)));
    send *= 1.0 + RULES.BEHIND_WET * hb;
    let g = a.roomGain * this.playGain;
    let lean = a.roomLean;
    if (this.srcGain !== null) {
      g = Math.sqrt(Math.max(0.0, a.roomGain * this.srcGain)) * this.playGain;
      lean = 0.5 * (a.roomLean + this.srcLean);
    }
    // (A wall to the west is on your left facing north, and on your right facing south.)
    if (a.binaural && !a.spatial && a.facing) lean *= Math.cos(a.facing);
    lean = clamp(lean + this.playLean, -1, 1);
    let wl = hl * send * g;
    let wr = hr * send * g;
    if (lean < 0) wr *= 1.0 + lean;
    else if (lean > 0) wl *= 1.0 - lean;
    const k = this.wetScale || 1;
    this._set(this.wet.wl.gain, clamp(wl, 0, 1) * k, instant);
    this._set(this.wet.wr.gain, clamp(wr, 0, 1) * k, instant);
  }

  _stopSources() {
    for (const s of this.sources) {
      s.onended = null;
      try { s.stop(); } catch (e) { /* not started */ }
      try { s.disconnect(); } catch (e) { /* gone */ }
    }
    this.sources = [];
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    for (const f of this.followers.splice(0)) f.stop();
    this._stopSources();
    this._endTail(0.03);
    this.audio.live.delete(this);
    setTimeout(() => this._disconnect(), 4000);
  }

  fadeout(ms) {
    // (Its followers fade with it, and are kept until it stops, so a stopAllLoops
    // that spares it while it fades spares them too.)
    for (const f of this.followers) f.fadeout(ms);
    if (this.stopped || !this.dry) { this.stop(); return; }
    this.fadingOut = true;
    const now = this.ctx.currentTime;
    for (const br of [this.dry, this.dull, this.wet && this.wet.buffer ? this.wet : null]) {
      if (!br) continue;
      const g = br.fade.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + ms / 1000);
    }
    setTimeout(() => this.stop(), ms + 30);
  }

  // Held where it is, and carrying on from there. (`now` is the clock's reading
  // to go by: AudioEngine.holdAll gives several voices the same one.)
  pause(now = this.ctx.currentTime, ring = true) {
    if (this.paused || this.stopped || this.ended || !this.dry) return;
    // (6.3.7) Never before the sound's own beginning: a placed one-shot starts a few
    // milliseconds on (START_LEAD), and a pause landing in those milliseconds gave an
    // offset below nothing, which the browser refuses to start from when the sound
    // carries on (the resume stopped part-way, and every beacon after it stayed held).
    this.offset = Math.max(0, now - this.startedAt);
    this.paused = true;
    if (ring) this._ringOut(now);
    this._stopSources();
  }

  resume(now = this.ctx.currentTime) {
    if (!this.paused || this.stopped) return;
    this.paused = false;
    this.jump = true;
    this._reaim(now);
    // (6.3.7) The baked echo comes back in step, over a few milliseconds; if its old
    // self is still ringing out, that is taken away first.
    const w = this.wet && this.wet.buffer ? this.wet : null;
    let late = 0;
    if (w && this.loop && !this.fadingOut) {
      const g = w.fade.gain;
      if (this.tail && now < this.tail.until) {
        late = RING_CROSS;
        this._endTail(RING_CROSS, now);
      } else {
        this._endTail(0, now);
        g.cancelScheduledValues(now);
        g.setValueAtTime(0, now);
      }
      g.setValueAtTime(0, now + late);
      g.linearRampToValueAtTime(1, now + late + RING_BACK);
      this.echoBack = now + late;
    }
    this._startSources(this.offset, now, late);
  }

  // (6.3.7) A held loop's baked echo rings out instead of stopping with it: its source
  // is taken out of the ones a hold stops, and dies away on the echo's own fade.
  _ringOut(now) {
    const w = this.wet && this.wet.buffer ? this.wet : null;
    if (!w || !this.loop || !w.src || this.fadingOut) return;
    const src = w.src;
    const g = w.fade.gain;
    // Where the echo's fade stands, worked out here (not every browser says, of a
    // level in the middle of a glide): full, unless it is still fading in.
    let level = 1;
    if (this.fadeMs > 0 && now < this.begunAt + this.fadeMs / 1000) level = (now - this.begunAt) / (this.fadeMs / 1000);
    if (this.echoBack !== undefined && now < this.echoBack + RING_BACK) level = Math.max(0, (now - this.echoBack) / RING_BACK);
    // (An echo not yet faded in, or one still being brought back: nothing to ring.)
    if (!(level > 0.05)) return;
    const i = this.sources.indexOf(src);
    if (i >= 0) this.sources.splice(i, 1);
    w.src = null;
    this._endTail(0, now);
    g.cancelScheduledValues(now);
    g.setValueAtTime(level, now);
    g.exponentialRampToValueAtTime(level * 0.001, now + RING_OUT);
    g.setValueAtTime(0, now + RING_OUT);
    try { src.stop(now + RING_OUT + 0.02); } catch (e) { /* not started */ }
    const tail = { src, from: now, level, until: now + RING_OUT };
    src.onended = () => { try { src.disconnect(); } catch (e) { /* gone */ } if (this.tail === tail) this.tail = null; };
    this.tail = tail;
  }

  // The ringing echo taken away over `secs` (at once if nothing).
  _endTail(secs = 0, now = this.ctx.currentTime) {
    const t = this.tail;
    if (!t) return;
    this.tail = null;
    const w = this.wet;
    if (secs > 0 && w && w.fade && now < t.until) {
      const g = w.fade.gain;
      // (Where the ring-out has got to, worked out as in _ringOut.)
      const level = t.level * Math.pow(0.001, clamp((now - t.from) / RING_OUT, 0, 1));
      g.cancelScheduledValues(now);
      g.setValueAtTime(level, now);
      g.linearRampToValueAtTime(0, now + secs);
      try { t.src.stop(now + secs); } catch (e) { /* not started */ }
    } else {
      t.src.onended = null;
      try { t.src.stop(); } catch (e) { /* not started */ }
      try { t.src.disconnect(); } catch (e) { /* gone */ }
    }
  }

  // (6.3.3) Before a held sound plays again: each of its panners is put where the sound
  // is now. (6.3.6: and woken, see AudioEngine.wakePanner, so it starts exactly there even
  // if you turned while it was held; until now a panner that last played far from there
  // was swapped for another, which had the same fault.)
  _reaim(now) {
    let at = null;
    if (this.placed && this.pos3) at = this.pos3;
    else if (this.binPlaced) at = [this.dir[0], 0, this.dir[1]];
    if (!at) return;
    for (const br of [this.dry, this.dull]) {
      if (!br || !br.panner) continue;
      if (br.shared) {
        // (It plays through the clean branch's panner: follow it if that one was swapped.)
        if (this.dry && this.dry.panner && br.panner !== this.dry.panner) {
          try { br.merge.disconnect(br.panner); } catch (e) { /* already */ }
          br.panner = this.dry.panner;
          br.merge.connect(br.panner);
        }
        continue;
      }
      this.audio.wakePanner(br.panner);
      Voice._place(br.panner, at[0], at[1], at[2], now, true);
    }
    this.jump = false;
  }
}
