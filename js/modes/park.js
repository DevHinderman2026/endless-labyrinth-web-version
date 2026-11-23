// The Water Park (web 7.0.0, Russell's design, 22 and 23 November 2026; website only).
//
// A water park on a summer's day, open ground with no walls, heard by its own air: a
// busy outdoor pool, children splashing and playing. Each park has a number of
// attractions, and each attraction holds one token. Win every token before closing
// time and a gate opens to the next park, which is bigger: one more attraction, and a
// little less time for each. Nothing in the park can hurt you; only closing time ends
// a visit. A mistake at an attraction brings the lifeguard's whistle: you are put back
// at the edge of that attraction, and it costs you five seconds.
//
// The attractions, each found by its own sound:
//   the water slide   its staircase beacon (Tower Mode's). Reach it and you climb by
//                     yourself, then ride straight down (7.0.1: until then you steered
//                     round its bends); the token is yours at the splash at the bottom.
//   the diving pool   someone bouncing on its board, again and again. Walk onto the board and you dive:
//                     underwater you hold your breath, find the token by its ping and
//                     swim to it, and come back up with it. Out of breath: the whistle.
//   the wave pool     its waves, one breaking at its edge every few seconds. Walk into it at its edge; the token's ping is on the
//                     far side. You hear each wave rise before it breaks: stand still
//                     as it hits you and you hold your ground; walk into it and it
//                     carries you three steps back.
//   the tipping bucket  the water filling it, louder as it fills, then the dump, then a
//                     chime: run under it now. The token is under it: dash in just after a dump and stay under it a
//                     moment to take the token. Caught under the dump: the whistle.
//   the duck stand    (7.1.0) its carnival organ. Walk up to its counter and take the air
//                     rifle: a ding says start. Ducks fly in at you from all around, two
//                     at a time, quacking; turn until one is straight ahead and shoot it
//                     down. A duck that reaches you: the whistle, ten seconds off, and
//                     another duck in its place. Shoot every duck and the token is yours.
// The park rings like a large hall (7.0.1), and its own air is kept low enough to hear
// every attraction from anywhere in it.
// A first park has three attractions, each new park one more, drawn from these kinds.
// The clock is the park's own: forty seconds, and thirty for each attraction, one
// second less for each attraction in every new park, never under eighteen (7.1.0 made
// it firmer, 7.1.1 put it back: Russell found the firmer clock too strict). Left-over
// time is not carried on. When the last token is won the clock stops, the bell rings
// and the gate is heard (the battle exit's Morse signal); walk through it.
//
// Chaos Mode has water parks too (js/modes/chaos.js): one park per level, with three
// attractions the first time in a run and one more each time, at most six. Each token
// adds fifteen seconds to the chaos clock, and a mistake takes the same seconds off it.
// When the last token is won the exit is heard, the chaos clock waits until you reach
// it, and the park's air plays on.
//
// The park's own recordings (Pixabay, web-only, in the waterpark pack): the park's air,
// the bucket filling and dumping, a wave, the diving board, the lifeguard's whistle, a
// token won and the bell; and (7.1.0) the duck stand's air rifle, carnival organ, ding
// and a duck knocked down (Developer Tools/Web Packs/web-only/waterpark.json). The
// ducks quack with the event library's duck (evt_duck).

import * as lb from '../leaderboard.js';
import { BACKGROUND_SEND, makeSounds as makeUltimateSounds } from './ultimate.js';

export const STATE = 'park';
export const BOARD = 'park';

// ------------------------------------------------------------------ constants
export const PK_STEP = 3.0;                   // one step, in the game's units
// The parks and their clock.
export const PK_FIRST = 3;                    // attractions in the first park; one more in each park after
export const PK_CLOCK_BASE = 40.0;            // seconds, plus PK_CLOCK_EACH for each attraction
export const PK_CLOCK_EACH = 30.0;            // ...
export const PK_CLOCK_DROP = 1.0;             // ...this much less for each attraction in every new park...
export const PK_CLOCK_EACH_MIN = 18.0;        // ...never under this (7.1.1: back to 7.0's clock; 7.1.0 tried 25, 22, 1.5 and 12)
export const PK_MISTAKE = 5.0;                // seconds a whistle costs
// Chaos: the attractions of a park, and each token's time.
export const PK_CHAOS_FIRST = 3;
export const PK_CHAOS_GROW = 1;
export const PK_CHAOS_MAX = 6;
export const PK_CHAOS_TOKEN = 15.0;
// The layout: attractions this far from where you start and from one another.
export const PK_NEAR = 24.0;
export const PK_APART = 22.0;
export const PK_ENTER = 4.0;                  // units from an attraction's spot that starts it
export const PK_EXIT_RANGE = [15.0, 30.0];
export const PK_EDGE = 10.0;            // the fence: this far beyond the farthest attraction
export const PK_EXIT_REACH = 3.0;
// The water slide.
export const PK_CLIMB = 2.6;                  // seconds up the stairs
export const PK_SLIDE_DOWN = 3.0;             // seconds down the slide (Ultimate Mode's own ride)
// The diving pool.
export const PK_BREATH = 15.0;                // seconds of breath under the water
export const PK_BREATH_WARN = 6.0;            // Low air, then the high beeps, faster and faster
export const PK_POOL_R = 12.0;                // the pool's bottom, around the board
export const PK_DIVE_TOKEN = [6.0, 10.0];     // units from where you land that the token lies
export const PK_TAKE = 2.5;                   // units: near enough to take a token
export const PK_BOARD_EVERY = 0.9;            // seconds between bounces on the board, heard on the deck (7.0.1: was 2.2, Russell: more repetitive)
// The wave pool.
export const PK_WAVE_LONG = [18.0, 36.0];     // units from its edge to the token: first park, most (1.5 more each park)
export const PK_WAVE_WIDE = 7.5;              // units either side of the line across it
export const PK_WAVE_EVERY = [5.5, 3.5];      // seconds between waves: first park, least (0.15 less each park)
export const PK_WAVE_BREAK = 0.75;            // seconds into the wave's sound that it breaks over you
export const PK_WAVE_HIT = [0.45, 0.25];      // a step this long before, or after, the break is a step into it
export const PK_WAVE_BACK = 3;                // steps it carries you back
// The tipping bucket.
export const PK_FILL = [6.0, 3.5];            // seconds it fills: first park, least (0.2 less each park)
export const PK_DUMP = 1.2;                   // seconds the dump comes down
export const PK_DRENCH = 4.5;                 // units: caught under the dump within this
export const PK_GRAB = 1.0;                   // seconds under it to take the token
// The duck stand (7.1.0, Russell's design, 23 November 2026).
export const PK_DUCKS = [4, 10];              // ducks to shoot down: first park, most (one more each park)
export const PK_DUCK_AIR = 2;                 // ducks in the air at once
export const PK_DUCK_TIME = [6.0, 3.5];       // seconds a duck takes to reach you: first park, least (0.3 less each park)
export const PK_DUCK_FROM = 24.0;             // units away a duck sets off from
export const PK_DUCK_START = 1.2;             // seconds from the ding to the first duck
export const PK_DUCK_GAP = 0.6;               // seconds before another duck sets off
export const PK_DUCK_SPREAD = 0.8;            // radians: two ducks in the air never set off closer than this
export const PK_DUCK_QUACK = 1.0;             // seconds between a duck's quacks (the quack is about a second long)
export const PK_DUCK_AIM = 0.6;               // a shot takes a duck this close to dead ahead (the sine of the angle: about 37 degrees)
export const PK_RELOAD = 0.5;                 // seconds to cock the air rifle again
export const PK_DUCK_HIT = 10.0;              // seconds a duck reaching you costs
export const PK_STAND_ORGAN = 0.35;           // the organ's loudness at the counter while you shoot
export const PK_STAND_AIR = 0.5;              // the park's air at the counter while you shoot (of PK_AMBIENCE)
// Sounds.
export const PK_RIFLE = 'wp_rifle';
export const PK_ORGAN = 'wp_organ';
export const PK_DING = 'wp_ding';
export const PK_DUCK_DOWN = 'wp_duck_down';
export const PK_QUACK = 'evt_duck';
export const PK_BACKGROUND = 'wp_park';
export const PK_BUCKET_FILL = 'wp_bucket_fill';
export const PK_BUCKET_DUMP = 'wp_bucket_dump';
export const PK_WAVE = 'wp_wave';
export const PK_BOARD = 'wp_board';
export const PK_WHISTLE = 'wp_whistle';
export const PK_TOKEN = 'wp_token';
export const PK_BELL = 'wp_bell';
export const PK_RUSH = 'ut_slide';            // the rush down the slide, made by the game (Ultimate Mode's)
export const PK_SPLASH = 'evt_water_splash';
export const PK_STAIRS = 'stairs_beacon';
export const PK_CLIMB_SOUND = 'stairs_climb';
export const PK_WAVES_LOOP = 'island_09_waves_breaking';
export const PK_PING = 'event_beacon_bell';   // a token under water, or across the wave pool
export const PK_WADE = ['ut_water_step_1', 'ut_water_step_2', 'ut_water_step_3', 'ut_water_step_4'];
export const PK_STROKES = ['ut_dive_stroke_1', 'ut_dive_stroke_2', 'ut_dive_stroke_3', 'ut_dive_stroke_4'];
export const PK_KINDS = ['slide', 'dive', 'wave', 'bucket', 'duck'];
// (7.0.1, Russell, 23 November 2026: "a water park would have a lot of reverberation
// since it's big".) The park rings like a large hall, a big indoor water park: the
// game's own hall echo, and every sound of the park sent into it (PK_SEND), above the
// water. Under the water nothing rings.
export const PK_ROOM = 'hall';
// (7.0.1, Russell: the wave pool could not be heard at all, the slide's beacon and the
// bucket were too quiet, and the park's air was a little too loud to hear where things
// are.) The park's air comes down from Ultimate Mode's background level, every
// attraction is heard louder and further, and never quieter than PK_FLOOR from
// anywhere in the park; the wave pool also sounds a breaking wave from its edge every
// few seconds (the waves' loop alone was lost under the park's own splashing); and
// when the bucket has dumped, a chime says: run under it now.
export const PK_AMBIENCE = 0.55;              // the park's air (Ultimate's backgrounds: 0.8)
export const PK_FLOOR = 0.3;                  // an attraction's least loudness, however far
export const PK_RANGE = 90.0;                 // units over which an attraction's sound falls to PK_FLOOR
export const PK_WAVE_CALL = 2.6;              // seconds between the wave pool's breaking waves heard on the deck
export const PK_BUCKET_CHIME = 'evt_chime_clear';
export const PK_SEND = 0.4;                   // how much of a park sound goes into the hall's echo

// ------------------------------------------------------------------ helpers
const rand = Math.random;
const uniform = (a, b) => a + (b - a) * rand();
const choice = (arr) => arr[Math.floor(rand() * arr.length)];
const plural = (n, word, many = word + 's') => (n === 1 ? word : many);
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// How many attractions a park has, and its clock.
export function attractionsFor(park) { return PK_FIRST + Math.max(0, park - 1); }
export function clockEach(park) { return Math.max(PK_CLOCK_EACH_MIN, PK_CLOCK_EACH - PK_CLOCK_DROP * Math.max(0, park - 1)); }
export function clockFor(park, n = attractionsFor(park)) { return PK_CLOCK_BASE + clockEach(park) * n; }
// The attractions' own difficulty, by the park (in Chaos, by the visit).
export function waveLongFor(park) { return Math.min(PK_WAVE_LONG[1], PK_WAVE_LONG[0] + 1.5 * Math.max(0, park - 1)); }
export function waveEveryFor(park) { return Math.max(PK_WAVE_EVERY[1], PK_WAVE_EVERY[0] - 0.15 * Math.max(0, park - 1)); }
export function fillFor(park) { return Math.max(PK_FILL[1], PK_FILL[0] - 0.2 * Math.max(0, park - 1)); }
export function ducksFor(park) { return Math.min(PK_DUCKS[1], PK_DUCKS[0] + Math.max(0, park - 1)); }
export function duckTimeFor(park) { return Math.max(PK_DUCK_TIME[1], PK_DUCK_TIME[0] - 0.3 * Math.max(0, park - 1)); }

// The kinds of a park's attractions: every kind once before any comes twice, in no
// fixed order.
export function dealKinds(n) {
  const out = [];
  while (out.length < n) {
    const deck = [...PK_KINDS];
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    // (Never the same kind twice running across two decks.)
    if (out.length && deck[0] === out[out.length - 1]) deck.push(deck.shift());
    out.push(...deck);
  }
  return out.slice(0, n);
}

// ------------------------------------------------------------------ the game's methods
const mixin = {
  startPark() {
    this.state = STATE;
    this.resetGameState();
    this.state = STATE;
    this._syncRoom();
    this._wake(true);
    if (this.ambienceChannel) { this.ambienceChannel.stop(); this.ambienceChannel = null; }
    if (this.beatChannel) { this.beatChannel.stop(); this.beatChannel = null; }
    this._pkBegin({ chaos: false, park: 1, count: attractionsFor(1) });
  },

  // A park: a run's next, or a chaos stage (count: its attractions; park: how hard).
  _pkBegin({ chaos, park, count, adopt = null }) {
    try { makeUltimateSounds(this.audio); } catch (e) { /* the stairs' climb has its own sound */ }
    // Held in memory for the whole run (let go in _pkStopAll).
    this.audio.prepare(PK_BACKGROUND);
    this.audio.prepare(PK_WAVES_LOOP, 'park:waves');
    this.audio.prepare(PK_BUCKET_FILL, 'park:fill');
    this.audio.prepare(PK_ORGAN, 'park:organ');
    if (this.audio.has(PK_QUACK)) this.audio.prepare(PK_QUACK, 'park:duck');
    const prev = this.pk;
    const tokens = prev && !chaos ? prev.tokens : 0;
    const parks = prev && !chaos ? prev.parks : 0;
    this.playerPos = [0.0, 0.0];
    this.arenaLimit = 1e9;     // set by _pkLayout, once the attractions are placed
    this.stride = null;
    const pk = this.pk = {
      run: this.runId, chaos, park, count, won: 0, tokens, parks,
      attractions: [], at: null, ride: null, exit: null, done: false,
      amb: prev && prev.amb && !prev.stopped ? prev.amb : null, lastStepAt: -1e9, clock: 0,
    };
    if (prev && prev !== pk) this._pkSilence(prev, false);
    this._pkBackground(adopt);
    this._pkLayout(dealKinds(count));
    if (!chaos) {
      this.timeLeft = lb.time(clockFor(park, count));   // (7.2.0: the leaderboard's reward, if this device won last week)
      this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / 30.0) * 30.0;
      this.thirtySecAnnounced = this.timeLeft <= 30.0;
      this.lastBeepSecond = -1;
      if (this.audio.has(PK_BELL)) this._pkPlay(PK_BELL, { keep: true });
      this.tts.speak(`Level ${park}.`, { interrupt: true });
    }
  },

  // A sound of the park, ringing in its hall (PK_SEND) unless told otherwise.
  _pkPlay(name, opts = {}) { return this.audio.play(name, { send: PK_SEND, ...opts }); },

  _pkBackground(adopt = null) {
    const pk = this.pk;
    if (pk.amb && pk.amb.voice && pk.amb.voice.busy) { pk.amb.voice.setVolume(PK_AMBIENCE); return; }
    let voice = null;
    if (adopt && adopt.busy && adopt.name === PK_BACKGROUND) { voice = adopt; voice.setVolume(PK_AMBIENCE); }
    else {
      if (adopt) adopt.fadeout(400);
      voice = this.audio.has(PK_BACKGROUND) ? this._pkPlay(PK_BACKGROUND, { loops: -1, volume: PK_AMBIENCE, fadeMs: 400, send: BACKGROUND_SEND }) : null;
    }
    pk.amb = { name: PK_BACKGROUND, voice };
  },

  // Where the attractions stand: around you, PK_NEAR or more from where you start and
  // PK_APART from one another, further out the more there are.
  _pkLayout(kinds) {
    const pk = this.pk;
    const reach = PK_NEAR + 6.0 * kinds.length;
    const taken = [[0, 0]];
    for (const kind of kinds) {
      let best = null; let bestGap = -1;
      for (let i = 0; i < 300; i++) {
        const a = uniform(0, Math.PI * 2); const d = uniform(PK_NEAR, reach);
        const p = [Math.sin(a) * d, -Math.cos(a) * d];
        const gap = Math.min(...taken.map((q) => dist2(p, q)));
        if (gap >= PK_APART) { best = p; break; }
        if (gap > bestGap) { best = p; bestGap = gap; }
      }
      taken.push(best);
      const at = { kind, pos: best, done: false, voice: null, t: 0 };
      if (kind === 'wave') {
        // The pool runs away from the middle of the park: its edge here, its far side out there.
        const d = Math.hypot(best[0], best[1]) || 1;
        at.axis = [best[0] / d, best[1] / d];
        at.long = waveLongFor(pk.park);
        at.token = [best[0] + at.axis[0] * at.long, best[1] + at.axis[1] * at.long];
        at.next = uniform(1.5, waveEveryFor(pk.park));
      } else if (kind === 'bucket') {
        at.phase = 'fill';
        at.t = uniform(0, fillFor(pk.park) * 0.7);
        at.under = 0;
      } else if (kind === 'dive') {
        at.t = uniform(0, PK_BOARD_EVERY);
      }
      pk.attractions.push(at);
    }
    // The park's fence (web 7.0.1): a square round everything, PK_EDGE beyond the
    // farthest pool, slide or bucket. Walked into, it buzzes, as Battle's edge does.
    let far = 0;
    for (const at of pk.attractions) {
      const spots = [at.pos];
      if (at.kind === 'wave') {
        const side = [-at.axis[1] * PK_WAVE_WIDE, at.axis[0] * PK_WAVE_WIDE];
        for (const end of [at.pos, at.token]) spots.push([end[0] + side[0], end[1] + side[1]], [end[0] - side[0], end[1] - side[1]]);
      }
      const pad = at.kind === 'dive' ? PK_POOL_R : 0;
      for (const q of spots) far = Math.max(far, Math.abs(q[0]) + pad, Math.abs(q[1]) + pad);
    }
    pk.limit = this.arenaLimit = far + PK_EDGE;
  },

  // A spot kept inside the fence, a little way in from it.
  _pkInside(p) {
    const lim = (this.pk ? this.pk.limit : this.arenaLimit) - 2.0;
    return [clamp(p[0], -lim, lim), clamp(p[1], -lim, lim)];
  },

  _pkLevels(pos, gain, range = PK_RANGE, floor = PK_FLOOR) {
    const dx = pos[0] - this.playerPos[0];
    const dy = pos[1] - this.playerPos[1];
    const d = Math.hypot(dx, dy);
    const pan = d > 0 ? dx / d : 0.0;
    const v = Math.min(1.0, Math.max(floor, 1.0 - d / range) * gain);
    return [v * (1.0 - Math.max(0.0, pan)), v * (1.0 - Math.max(0.0, -pan)), d];
  },

  // ---------------------------------------------------------------- the deck
  // Every attraction not yet won is heard from where it stands.
  _pkUpdateDeck(dt) {
    const pk = this.pk;
    for (const at of pk.attractions) {
      if (at.done) { this._pkQuiet(at); continue; }
      if (pk.at && pk.at.at === at) continue;       // (the pool you are in is heard from inside it)
      if (at.kind === 'slide') this._pkLoop(at, PK_STAIRS, at.pos, 1.0);
      else if (at.kind === 'wave') {
        const mid = [at.pos[0] + at.axis[0] * at.long * 0.5, at.pos[1] + at.axis[1] * at.long * 0.5];
        this._pkLoop(at, PK_WAVES_LOOP, at.pos, 1.0, mid);
        // A wave breaking at its edge, every few seconds.
        at.call = (at.call === undefined ? uniform(0, PK_WAVE_CALL) : at.call) - dt;
        if (at.call <= 0) {
          at.call = PK_WAVE_CALL;
          const [l, r] = this._pkLevels(at.pos, 1.0);
          if (this.audio.has(PK_WAVE)) this._pkPlay(PK_WAVE, { at: at.pos, volume: Math.max(l, r) });
        }
      } else if (at.kind === 'dive') {
        at.t -= dt;
        if (at.t <= 0) {
          at.t = PK_BOARD_EVERY;
          const [l, r] = this._pkLevels(at.pos, 1.0);
          if (this.audio.has(PK_BOARD)) this._pkPlay(PK_BOARD, { at: at.pos, volume: Math.max(l, r) });
        }
      } else if (at.kind === 'bucket') this._pkBucket(at, dt);
      else if (at.kind === 'duck') this._pkLoop(at, PK_ORGAN, at.pos, 1.0);
    }
    // Walking up to one starts it.
    if (pk.at || pk.ride) return;
    // (An attraction you have just come out of, without its token, starts again only once
    // you have stepped away from it and come back: Ultimate Mode's elevator does the same.)
    for (const at of pk.attractions) {
      if (at.done || at.kind === 'bucket') continue;
      const d = dist2(at.pos, this.playerPos);
      if (d >= PK_ENTER) { at.armed = true; continue; }
      if (at.armed !== false) { this._pkEnter(at); return; }
    }
  },

  _pkLoop(at, name, pos, gain, heardAt = null) {
    if (!this.audio.has(name)) return;
    const p = heardAt || pos;
    if (!at.voice || !at.voice.busy) at.voice = this._pkPlay(name, { loops: -1, volume: 0.0, fadeMs: 200 });
    if (!at.voice) return;
    const [l, r] = this._pkLevels(p, gain);
    at.voice.setVolume(l, r, this._behind(p));
  },

  _pkQuiet(at) {
    if (at.voice) { at.voice.fadeout(300); at.voice = null; }
  },

  _pkEnter(at) {
    const pk = this.pk;
    this.stride = null;
    if (at.kind === 'slide') {
      this._turnStop();
      this._pkQuiet(at);
      pk.ride = { at, stage: 'climb', t: 0, rush: null };
      this._pkPlay(PK_CLIMB_SOUND, { keep: true });
      return;
    }
    if (at.kind === 'dive') {
      this._pkQuiet(at);
      pk.at = { at, kind: 'dive', breath: PK_BREATH, warned: false, beepIn: 0, under: null, ping: null,
        centre: [...at.pos], token: this._pkDiveSpot(at.pos) };
      if (this.audio.has(PK_BOARD)) this._pkPlay(PK_BOARD, { keep: true });
      pk.at.splashIn = 0.35;
      this._pkDuckAir(true);
      return;
    }
    if (at.kind === 'wave') {
      pk.at = { at, kind: 'wave', ping: null };
      this.playerPos = [...at.pos];
      this._pkStep('wade');
      return;
    }
    if (at.kind === 'duck') {
      // At the counter, the air rifle in your hands: the ding says start.
      this.playerPos = [...at.pos];
      pk.at = { at, kind: 'duck', total: ducksFor(pk.park), shot: 0, ducks: [], startIn: PK_DUCK_START, nextIn: 0, reload: 0, hits: 0 };
      this._pkDuckAir(true, at, PK_STAND_AIR);
      if (this.audio.has(PK_DING)) this._pkPlay(PK_DING, { keep: true });
    }
  },

  _pkDiveSpot(centre) {
    const a = uniform(0, Math.PI * 2); const d = uniform(PK_DIVE_TOKEN[0], PK_DIVE_TOKEN[1]);
    return [centre[0] + Math.sin(a) * d, centre[1] - Math.cos(a) * d];
  },

  // Under the water, or on the slide, the park's air is far off (at the duck stand,
  // quieter, and its organ plays on: `keep`).
  _pkDuckAir(on, keep = null, level = 0.25) {
    const pk = this.pk;
    if (pk.amb && pk.amb.voice) pk.amb.voice.setVolume(PK_AMBIENCE * (on ? level : 1.0));
    for (const at of pk.attractions) if (on && at.voice && at !== keep) { at.voice.fadeout(200); at.voice = null; }
  },

  // ---------------------------------------------------------------- the water slide
  // (7.0.1, Russell, 23 November 2026: "just have the player go straight down".) You
  // climb, then ride straight down, with nothing to do but listen: the rush of the
  // water, Ultimate Mode's own, building to the splash.
  _pkUpdateSlide(dt) {
    const pk = this.pk;
    const r = pk.ride;
    r.t += dt;
    if (r.stage === 'climb') {
      if (r.t < PK_CLIMB) return;
      r.stage = 'down'; r.t = 0;
      this._pkDuckAir(true);
      r.rush = this.audio.has(PK_RUSH) ? this._pkPlay(PK_RUSH, { volume: 0.9, keep: true }) : null;
      return;
    }
    if (r.stage === 'down' && r.t >= PK_SLIDE_DOWN) this._pkSlideEnd();
  },

  _pkSlideEnd() {
    const pk = this.pk;
    const r = pk.ride;
    if (r.rush) { r.rush.fadeout(150); r.rush = null; }
    if (this.audio.has(PK_SPLASH)) this._pkPlay(PK_SPLASH, { keep: true });
    // You come up beside the slide's pool, a few steps from its stairs.
    const a = uniform(0, Math.PI * 2);
    this.playerPos = this._pkInside([r.at.pos[0] + Math.sin(a) * 8.0, r.at.pos[1] - Math.cos(a) * 8.0]);
    pk.ride = null;
    this._pkDuckAir(false);
    this._pkToken(r.at);
  },

  // ---------------------------------------------------------------- the diving pool
  _pkUpdateDive(dt) {
    const pk = this.pk;
    const d = pk.at;
    if (d.splashIn > 0) {
      d.splashIn -= dt;
      if (d.splashIn > 0) return;
      if (this.audio.has(PK_SPLASH)) this._pkPlay(PK_SPLASH, { keep: true });
      d.under = this._pkPlay('underwater', { loops: -1, volume: 0.7, fadeMs: 300, send: 0 });
      this.playerPos = [...d.centre];
      return;
    }
    d.breath -= dt;
    if (d.breath <= 0) { this._pkSurface(false); return; }
    if (d.breath <= PK_BREATH_WARN) {
      if (!d.warned) { d.warned = true; this.tts.speak('Low air.'); }
      d.beepIn -= dt;
      if (d.beepIn <= 0) {
        d.beepIn = Math.max(0.15, 1.0 * d.breath / PK_BREATH_WARN);
        this._pkPlay('countdown_high', { send: 0 });
      }
    }
    if (this.audio.has(PK_PING)) {
      if (!d.ping || !d.ping.busy) d.ping = this._pkPlay(PK_PING, { loops: -1, volume: 0.0, send: 0 });
      const [l, r] = this._pkLevels(d.token, 1.0, 30.0);
      if (d.ping) d.ping.setVolume(l, r, this._behind(d.token));
    }
    if (dist2(d.token, this.playerPos) < PK_TAKE) this._pkSurface(true);
  },

  _pkSurface(won) {
    const pk = this.pk;
    const d = pk.at;
    if (d.under) { d.under.fadeout(300); d.under = null; }
    if (d.ping) { d.ping.stop(); d.ping = null; }
    pk.at = null;
    this.playerPos = [...d.at.pos];
    this._pkDuckAir(false);
    if (this.audio.has(PK_SPLASH)) this._pkPlay(PK_SPLASH, { volume: 0.7 });
    if (won) this._pkToken(d.at);
    else { d.at.t = PK_BOARD_EVERY; d.at.armed = false; this._pkWhistle(); }
  },

  // ---------------------------------------------------------------- the wave pool
  _pkWaveLocal(w, pos = this.playerPos) {
    const dx = pos[0] - w.at.pos[0]; const dy = pos[1] - w.at.pos[1];
    const [ax, ay] = w.at.axis;
    return [dx * ax + dy * ay, -dx * ay + dy * ax];        // [along, across]
  },

  _pkWaveWorld(w, along, across) {
    const [ax, ay] = w.at.axis;
    return [w.at.pos[0] + ax * along - ay * across, w.at.pos[1] + ay * along + ax * across];
  },

  _pkUpdateWave(dt) {
    const pk = this.pk;
    const w = pk.at;
    const at = w.at;
    // Its water, all round you now.
    this._pkLoop(at, PK_WAVES_LOOP, at.pos, 0.8, this.playerPos);
    if (this.audio.has(PK_PING)) {
      if (!w.ping || !w.ping.busy) w.ping = this._pkPlay(PK_PING, { loops: -1, volume: 0.0 });
      const [l, r] = this._pkLevels(at.token, 1.0, 50.0);
      if (w.ping) w.ping.setVolume(l, r, this._behind(at.token));
    }
    // The waves: each rises ahead of you, then breaks over you.
    at.next -= dt;
    if (at.next <= 0 && !w.wave) {
      at.next = waveEveryFor(pk.park);
      const [along] = this._pkWaveLocal(w);
      const from = this._pkWaveWorld(w, Math.min(at.long, along + 6.0), 0);
      w.wave = { t: 0, hit: false };
      if (this.audio.has(PK_WAVE)) this._pkPlay(PK_WAVE, { at: from, volume: 1.0, keep: true });
    }
    if (w.wave) {
      w.wave.t += dt;
      const t = w.wave.t;
      // A step into it, just before the break or just after: carried back.
      if (!w.wave.hit && this.pk.lastStepAt >= this.pk.clock - dt - 1e-6
        && t >= PK_WAVE_BREAK - PK_WAVE_HIT[0] && t <= PK_WAVE_BREAK + PK_WAVE_HIT[1]) {
        w.wave.hit = true;
        this._pkWaveCarry(w);
        if (pk.at !== w) return;
      }
      if (t > PK_WAVE_BREAK + PK_WAVE_HIT[1]) w.wave = null;
    }
  },

  _pkWaveCarry(w) {
    const [along, across] = this._pkWaveLocal(w);
    const back = along - PK_WAVE_BACK * PK_STEP;
    if (this.audio.has(PK_SPLASH)) this._pkPlay(PK_SPLASH, { volume: 0.8, keep: true });
    this.stride = null;
    if (back < -1.0) { this._pkLeaveWave(w, false); return; }
    this.playerPos = this._pkWaveWorld(w, back, across);
  },

  _pkLeaveWave(w, won) {
    const pk = this.pk;
    if (w.ping) { w.ping.stop(); w.ping = null; }
    pk.at = null;
    if (won) {
      this._pkQuiet(w.at);
      this._pkToken(w.at);
    } else {
      // Back on the deck at its edge.
      this.playerPos = this._pkWaveWorld(w, -PK_ENTER - 1.0, 0);
    }
  },

  // ---------------------------------------------------------------- the tipping bucket
  _pkBucket(at, dt) {
    const pk = this.pk;
    const fill = fillFor(pk.park);
    at.t += dt;
    const d = dist2(at.pos, this.playerPos);
    if (at.phase === 'fill') {
      // The water filling it, louder as it fills.
      if (this.audio.has(PK_BUCKET_FILL)) {
        if (!at.voice || !at.voice.busy) at.voice = this._pkPlay(PK_BUCKET_FILL, { loops: -1, volume: 0.0, fadeMs: 150 });
        const rise = 0.6 + 0.4 * clamp(at.t / fill, 0, 1);
        const [l, r] = this._pkLevels(at.pos, rise);
        if (at.voice) at.voice.setVolume(l, r, this._behind(at.pos));
      }
      // Under it: the token is taken after a moment there.
      if (d < PK_TAKE) {
        at.under += dt;
        if (at.under >= PK_GRAB) { this._pkQuiet(at); this._pkToken(at); return; }
      } else at.under = 0;
      if (at.t >= fill) {
        at.phase = 'dump'; at.t = 0;
        if (at.voice) { at.voice.fadeout(120); at.voice = null; }
        const [l, r] = this._pkLevels(at.pos, 1.0);
        if (this.audio.has(PK_BUCKET_DUMP)) this._pkPlay(PK_BUCKET_DUMP, { at: at.pos, volume: Math.max(l, r, 0.8), keep: true });
      }
      return;
    }
    // The dump coming down: under it, you are caught.
    at.under = 0;
    if (d < PK_DRENCH && !at.caught) {
      at.caught = true;
      const away = d > 0.5 ? [(this.playerPos[0] - at.pos[0]) / d, (this.playerPos[1] - at.pos[1]) / d] : [0, 1];
      this.playerPos = this._pkInside([at.pos[0] + away[0] * (PK_DRENCH + 4.5), at.pos[1] + away[1] * (PK_DRENCH + 4.5)]);
      this.stride = null;
      this._pkWhistle();
    }
    if (at.t >= PK_DUMP) {
      at.phase = 'fill'; at.t = 0; at.caught = false;
      // The dump is over: the chime says run under it now.
      const [l, r] = this._pkLevels(at.pos, 1.0);
      if (this.audio.has(PK_BUCKET_CHIME)) this._pkPlay(PK_BUCKET_CHIME, { at: at.pos, volume: Math.max(l, r), keep: true });
    }
  },

  // ---------------------------------------------------------------- the duck stand (7.1.0)
  // Ducks fly in at you from all around, PK_DUCK_AIR at a time, each straight at you,
  // quacking as it comes; one that reaches you hits you. You stay at the counter and
  // turn; the air rifle takes the nearest duck within PK_DUCK_AIM of straight ahead.
  _pkUpdateDuck(dt) {
    const pk = this.pk;
    const s = pk.at;
    this._pkLoop(s.at, PK_ORGAN, s.at.pos, PK_STAND_ORGAN);
    s.reload = Math.max(0, s.reload - dt);
    if (s.startIn > 0) { s.startIn -= dt; return; }
    s.nextIn -= dt;
    if (s.nextIn <= 0 && s.ducks.length < PK_DUCK_AIR && s.shot + s.ducks.length < s.total) {
      this._pkLaunchDuck(s);
      s.nextIn = PK_DUCK_GAP;
    }
    const time = duckTimeFor(pk.park);
    for (const d of [...s.ducks]) {
      d.t += dt;
      const k = Math.max(0, 1 - d.t / time);
      d.pos = [this.playerPos[0] + d.dir[0] * PK_DUCK_FROM * k, this.playerPos[1] + d.dir[1] * PK_DUCK_FROM * k];
      d.quack -= dt;
      if (d.quack <= 0 && d.t < time) {
        d.quack = PK_DUCK_QUACK * uniform(0.85, 1.15);
        const [l, r] = this._pkLevels(d.pos, 1.0, PK_DUCK_FROM * 1.5, 0.15);
        if (this.audio.has(PK_QUACK)) this._pkPlay(PK_QUACK, { at: d.pos, volume: Math.max(l, r) });
      }
      if (d.t >= time) {
        // It reached you: the whistle, ten seconds, and another duck will come.
        s.ducks.splice(s.ducks.indexOf(d), 1);
        s.hits += 1;
        if (this.audio.has(PK_QUACK)) this._pkPlay(PK_QUACK, { volume: 1.0 });
        this._pkWhistle(PK_DUCK_HIT);
        if (this.pk !== pk || pk.at !== s) return;
        s.nextIn = Math.max(s.nextIn, PK_DUCK_GAP);
      }
    }
  },

  _pkLaunchDuck(s) {
    let a = uniform(0, Math.PI * 2);
    // (Never right beside another duck in the air, so two can always be told apart.)
    for (let i = 0; i < 30; i++) {
      if (s.ducks.every((d) => Math.abs(Math.atan2(Math.sin(a - d.angle), Math.cos(a - d.angle))) >= PK_DUCK_SPREAD)) break;
      a = uniform(0, Math.PI * 2);
    }
    const dir = [Math.sin(a), -Math.cos(a)];
    s.ducks.push({ angle: a, dir, t: 0, quack: 0, pos: [this.playerPos[0] + dir[0] * PK_DUCK_FROM, this.playerPos[1] + dir[1] * PK_DUCK_FROM] });
  },

  // Space, or a two-finger tap, at the counter.
  _pkFire() {
    const pk = this.pk;
    const s = pk.at;
    if (s.startIn > 0 || s.reload > 0) { this._pkPlay('empty_click', { send: 0 }); return; }
    s.reload = PK_RELOAD;
    if (this.audio.has(PK_RIFLE)) this._pkPlay(PK_RIFLE, { keep: true });
    let best = null; let bestD = 1e9;
    for (const d of s.ducks) {
      const [side, ahead] = this._rel(d.pos);
      const dist = Math.hypot(side, ahead);
      if (dist <= 0 || ahead <= 0) continue;
      if (Math.abs(side / dist) < PK_DUCK_AIM && dist < bestD) { best = d; bestD = dist; }
    }
    if (!best) return;
    s.ducks.splice(s.ducks.indexOf(best), 1);
    s.shot += 1;
    const [l, r] = this._pkLevels(best.pos, 1.0, PK_DUCK_FROM * 1.5, 0.3);
    if (this.audio.has(PK_DUCK_DOWN)) this._pkPlay(PK_DUCK_DOWN, { at: best.pos, volume: Math.max(l, r), keep: true });
    if (s.shot >= s.total) {
      // Every duck down: the token.
      pk.at = null;
      this._pkQuiet(s.at);
      this._pkDuckAir(false);
      this._pkToken(s.at);
    }
  },

  // ---------------------------------------------------------------- tokens, mistakes and the gate
  _pkToken(at) {
    const pk = this.pk;
    at.done = true;
    pk.won += 1;
    pk.tokens += 1;
    if (this.audio.has(PK_TOKEN)) this._pkPlay(PK_TOKEN, { keep: true });
    if (pk.chaos) this._pkClock(PK_CHAOS_TOKEN);
    const left = pk.count - pk.won;
    if (left > 0) { this.tts.speak(`${left} to go.`, { interrupt: true }); return; }
    this._pkOpenExit();
  },

  _pkWhistle(secs = PK_MISTAKE) {
    if (this.audio.has(PK_WHISTLE)) this._pkPlay(PK_WHISTLE, { keep: true });
    this._pkCost(secs);
    this.tts.speak('Missed.', { interrupt: true });
  },

  // Time off the clock (a run's own, or the chaos clock), or onto it.
  _pkCost(secs) { this._pkClock(-secs); },
  _pkClock(secs) {
    this.timeLeft = Math.max(0.01, this.timeLeft + secs);
    this.thirtySecAnnounced = this.timeLeft <= 30.0;
    const step = this._announceStep();
    this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / step) * step;
    this.lastBeepSecond = -1;
  },

  // Every token won: the bell, and the gate (in Chaos, the exit) over the park's air.
  _pkOpenExit() {
    const pk = this.pk;
    for (const at of pk.attractions) this._pkQuiet(at);
    if (this.audio.has(PK_BELL)) this._pkPlay(PK_BELL, { keep: true });
    let pos = null;
    for (let i = 0; i < 40 && !pos; i++) {
      const a = uniform(0, Math.PI * 2); const d = uniform(PK_EXIT_RANGE[0], PK_EXIT_RANGE[1]);
      const p = [this.playerPos[0] + Math.sin(a) * d, this.playerPos[1] - Math.cos(a) * d];
      // Inside the fence, and still a walk away (the last try takes what it gets).
      const q = this._pkInside(p);
      if (dist2(q, this.playerPos) >= PK_EXIT_RANGE[0] || i === 39) pos = q;
    }
    pk.exit = { pos, voice: this._pkPlay('exit_morse', { loops: -1, volume: 0.0 }) };
    this._pkLevelExit();
    this.tts.speak('The exit is open.', { interrupt: true });
  },

  _pkLevelExit() {
    const ex = this.pk.exit;
    if (!ex || !ex.voice) return 1e9;
    const [l, r, d] = this._battleLevels(ex.pos, 0.9);
    ex.voice.setVolume(l, r, this._behind(ex.pos));
    return d;
  },

  _pkLeaveByExit() {
    const pk = this.pk;
    const ex = pk.exit;
    if (ex && ex.voice) ex.voice.stop();
    pk.exit = null;
    pk.parks += 1;
    if (pk.chaos) { pk.done = true; this.nextLevel(); return; }
    // The next park: bigger, and a little less time for each attraction.
    this._pkBegin({ chaos: false, park: pk.park + 1, count: attractionsFor(pk.park + 1) });
  },

  // ---------------------------------------------------------------- the frame
  updatePark(dt) {
    const pk = this.pk;
    if (!pk || this.isPaused) return;
    pk.clock += dt;
    // The clock: a park's own, which stops once the gate is open, or the chaos clock
    // (which waits while the exit is open: chaos.js _chaosExitOpen).
    if (!(pk.exit && !pk.chaos)) {
      if (this._advanceTimer(dt)) return;
    }
    if (this.state !== STATE || this.pk !== pk) return;
    if (pk.exit) {
      if (this._pkLevelExit() < PK_EXIT_REACH) this._pkLeaveByExit();
      return;
    }
    if (pk.ride) { this._pkUpdateSlide(dt); return; }
    if (pk.at && pk.at.kind === 'dive') { this._pkUpdateDive(dt); return; }
    if (pk.at && pk.at.kind === 'duck') { this._pkUpdateDuck(dt); return; }
    if (pk.at && pk.at.kind === 'wave') this._pkUpdateWave(dt);
    if (this.pk !== pk) return;
    this._pkUpdateDeck(dt);
  },

  // A step, or a run's step: on the deck, wading in the wave pool, or swimming under water.
  _pkWalk(g) {
    const pk = this.pk;
    const f = this.playerFacing = this._forward();
    const dir = g === 'up' ? f : [-f[0], -f[1]];
    const from = [...this.playerPos];
    let to = [from[0] + dir[0] * PK_STEP, from[1] + dir[1] * PK_STEP];
    if (pk.at && pk.at.kind === 'duck') return;     // at the counter until every duck is down
    if (pk.at && pk.at.kind === 'dive') {
      if (pk.at.splashIn > 0) return;
      // The pool's walls.
      const c = pk.at.centre;
      const d = dist2(to, c);
      if (d > PK_POOL_R) {
        const k = PK_POOL_R / d;
        to = [c[0] + (to[0] - c[0]) * k, c[1] + (to[1] - c[1]) * k];
        if (dist2(to, from) < PK_STEP * 0.25) { this._pkPlay('boundary'); this.stride = null; return; }
      }
      this.playerPos = to;
      this._pkStep('swim');
      return;
    }
    if (pk.at && pk.at.kind === 'wave') {
      const w = pk.at;
      let [along, across] = this._pkWaveLocal(w, to);
      if (Math.abs(across) > PK_WAVE_WIDE) {
        across = clamp(across, -PK_WAVE_WIDE, PK_WAVE_WIDE);
        const cl = this._pkWaveWorld(w, along, across);
        if (dist2(cl, from) < PK_STEP * 0.25) { this._pkPlay('boundary'); this.stride = null; return; }
        to = cl;
      }
      pk.lastStepAt = pk.clock;
      this.playerPos = to;
      this._pkStep('wade');
      if (along < -1.0) { this._pkLeaveWave(w, false); return; }
      if (dist2(to, w.at.token) < PK_TAKE + 1.0 || along >= w.at.long) { this.playerPos = [...w.at.token]; this._pkLeaveWave(w, true); }
      return;
    }
    // The deck: the fence stops you, buzzing, as Battle's edge does; met at a
    // slant, you carry on along it.
    if (!this._walkArena(dir, PK_STEP, pk.limit)) { this.stride = null; return; }
    if (pk.exit && this._pkLevelExit() < PK_EXIT_REACH) this._pkLeaveByExit();
  },

  _pkStep(kind) {
    const bank = (kind === 'swim' ? PK_STROKES : PK_WADE).filter((n) => this.audio.has(n));
    if (bank.length) this._pkPlay(choice(bank), kind === 'swim' ? { send: 0 } : {});
  },

  // Enter's report: the park, its tokens, the clock (in chaos: the tokens, then the
  // health, the clock and the points), and the way you face.
  _pkReport() {
    const pk = this.pk;
    const tokens = pk.exit ? `All ${pk.count} found.` : `${pk.won} of ${pk.count} found.`;
    if (pk.chaos) { this._report(tokens, true); return; }
    this._report(`Level ${pk.park}. ${tokens}`, true);
  },

  // Everything stopped (closing time, quitting); `forget` lets go of the run itself.
  _pkSilence(pk, all = true) {
    for (const at of pk.attractions) if (at.voice) { at.voice.stop(); at.voice = null; }
    if (pk.ride && pk.ride.rush) { pk.ride.rush.stop(); pk.ride.rush = null; }
    if (pk.at) { for (const k of ['under', 'ping']) if (pk.at[k]) { pk.at[k].stop(); pk.at[k] = null; } }
    if (pk.exit && pk.exit.voice) pk.exit.voice.stop();
    if (all) {
      if (pk.amb && pk.amb.voice) pk.amb.voice.stop();
      pk.amb = null;
    }
  },

  _pkStopAll() {
    const pk = this.pk;
    if (!pk) return;
    this._pkSilence(pk, true);
    pk.exit = null;
    pk.stopped = true;
    for (const k of ['park:waves', 'park:fill', 'park:organ', 'park:duck']) this.audio.pins.delete(k);
  },
};

// ------------------------------------------------------------------ help
const HELP_SECTIONS = [
  ['Water Park', [
    { title: 'Water Park', sound: null, desc: 'Water Park is a mode of its own, new in 7.0.0. You are in a water park on a summer\'s day, a big one that rings like a huge hall, and its attractions are all around you, each found by its own sound, which you can hear from anywhere in the park. Every attraction holds one token. Win every token before closing time, and a gate opens to the next park, which is bigger. Nothing in the park can hurt you: only closing time ends your visit. The park has a fence all round it, a little beyond its farthest attraction: walk into it and it buzzes, as the edge of Battle Mode\'s arena does, and you stay put; meet it at a slant and you carry on along it. You turn and walk as in every walking mode (see General Turning). Double tap for the level, the tokens you have found, the seconds left and the way you are facing.' },
    { title: 'Water Park Water Slide', sound: null, desc: 'The water slide is found by its staircase beacon, Tower Mode\'s stairs: three short chimes rising, each with a footstep on metal stairs under it. Walk up to it and you climb the stairs by yourself, then ride straight down, the rush of the water building to the splash. The token is yours at the splash at the bottom, and you come up beside the slide. While you are on the slide you cannot walk or pause.' },
    { title: 'Water Park Diving Pool', sound: null, desc: 'The diving pool is found by someone bouncing on its diving board, again and again, about once a second. Walk onto the board and you dive in. Under the water you hold your breath for fifteen seconds. The token lies on the bottom, a few steps away: you hear its bell ringing, so turn until it is centred and swim to it, each step a swimming stroke. Reach it and you come back up with it. With six seconds of breath left, the voice says Low air and the high beeps begin, faster and faster. Run out of breath and the lifeguard blows the whistle: you come back up at the board without the token, and it costs five seconds. Dive again to try once more.' },
    { title: 'Water Park Wave Pool', sound: null, desc: 'The wave pool is found by its waves: you hear them rolling, and a wave breaking at its edge every few seconds. Walk into it at its edge, and the token\'s bell rings from its far side. Wade toward it, one step at a time. Every few seconds a wave comes: you hear it rise ahead of you, and then break over you. Stand still as it breaks and you hold your ground. Take a step just as it breaks, and it carries you three steps back, and if that takes you out of the pool, you are back at its edge. Reach the far side and the token is yours. The waves come a little more often in every park, and the pool is a little longer.' },
    { title: 'Water Park Tipping Bucket', sound: null, desc: 'The tipping bucket is found by the water filling it, louder and louder as it fills, until it tips and dumps its water with a crash. As the last of the water falls, a chime rings: that is your moment to run under it, before it fills again. The token is right under it. Dash in at the chime, and stay under it for a moment, a second, to take the token. If the bucket dumps while you are under it, or close beside it, you are caught: the lifeguard blows the whistle, you are pushed back from the bucket, and it costs five seconds. The bucket fills a little faster in every park.' },
    { title: 'Water Park Duck Stand', sound: null, desc: 'The duck stand, new in 7.1.0, is found by its carnival organ music. Walk up to its counter and you take the air rifle: a ding says start shooting. Ducks fly in toward you from all around, two in the air at once, each quacking as it comes, louder as it nears. Turn until a duck is centred straight ahead of you and shoot, with a two-finger tap or Space: a hit knocks it down with a clang. A shot takes only a duck in front of you. There is no ammo to collect, but the rifle takes half a second to cock again between shots. You stay at the counter while you shoot, turning only. If a duck reaches you, it hits you: the lifeguard blows the whistle, it costs ten seconds, and another duck comes in its place. Shoot down every duck and the token is yours. The first park has four ducks, each taking six seconds to reach you; every new park has one more duck, up to ten, and they fly a little faster, never taking less than three and a half seconds.' },
    { title: 'Water Park Closing Time and Score', sound: null, desc: 'Each park has its own clock: forty seconds, and thirty more for each attraction, with one second less for each attraction in every new park, never less than eighteen. The first park has three attractions, two minutes and ten seconds. Every token you win is announced with how many are left to go. When the last one is won, the clock stops, a bell rings, and the gate is heard, the battle exit\'s Morse signal: walk through it to the next park, which has one more attraction. Time left over is not carried on. When closing time comes, the bell rings and your visit is over. Your score is the number of parks you finished, and Water Park has its own high score board.' },
    { title: 'Water Park in Chaos Mode', sound: null, desc: 'Chaos Mode has water parks too, one park to a level, which you know by the busy pool and its children. A water park in chaos has three attractions the first time in a run, and one more each time after, at most six. There is no park clock there: each token you win adds fifteen seconds to the chaos clock, and a mistake takes its seconds off it. When the last token is won, the exit is heard over the park, which plays on, and the chaos clock waits until you walk through it. There, double tap for the tokens found, then your health, the clock and the points.' },
  ]],
];

const HELP_DEMOS = [
  ['Demos, Water Park', [
    { title: 'Water Park Demos', sound: null, desc: 'The sounds of the Water Park.' },
    { title: 'The Water Park', sound: PK_BACKGROUND, desc: 'The air of the park: a busy outdoor pool, with children splashing and playing.' },
    { title: 'Water Slide Stairs', sound: PK_STAIRS, desc: 'The water slide\'s staircase beacon.' },
    { title: 'Down the Slide', sound: PK_RUSH, desc: 'The rush of the water as you ride straight down the slide, to the splash.' },
    { title: 'Diving Board', sound: PK_BOARD, desc: 'Someone bouncing on the diving board: the diving pool is there.' },
    { title: 'Token Under Water', sound: PK_PING, desc: 'The bell of a token, under the water or across the wave pool.' },
    { title: 'A Wave', sound: PK_WAVE, desc: 'A wave rising and breaking in the wave pool. Stand still as it breaks.' },
    { title: 'Bucket Filling', sound: PK_BUCKET_FILL, desc: 'The tipping bucket filling, louder as it fills.' },
    { title: 'Bucket Dumping', sound: PK_BUCKET_DUMP, desc: 'The tipping bucket dumping its water.' },
    { title: 'Bucket Chime', sound: PK_BUCKET_CHIME, desc: 'The dump is over: run under the bucket now.' },
    { title: 'Duck Stand Organ', sound: PK_ORGAN, desc: 'The carnival organ that marks the duck stand.' },
    { title: 'Duck Stand Ding', sound: PK_DING, desc: 'At the counter: start shooting.' },
    { title: 'A Duck', sound: PK_QUACK, desc: 'A duck flying in toward you. Turn until it is centred, and shoot.' },
    { title: 'Air Rifle', sound: PK_RIFLE, desc: 'The air rifle\'s shot.' },
    { title: 'Duck Knocked Down', sound: PK_DUCK_DOWN, desc: 'A duck hit and knocked down.' },
    { title: 'Lifeguard\'s Whistle', sound: PK_WHISTLE, desc: 'A mistake at an attraction: back to its edge, and five seconds off the clock.' },
    { title: 'Token Won', sound: PK_TOKEN, desc: 'A token won.' },
    { title: 'The Bell', sound: PK_BELL, desc: 'The gate to the next park opening, and closing time.' },
  ]],
];

// ------------------------------------------------------------------ the mode
function reset(game) {
  if (game.pk) game._pkStopAll();
  game.pk = null;
}

function input(game, g) {
  const pk = game.pk;
  if (!pk) return;
  if (g === 'clock') {
    const secs = Math.trunc(game.timeLeft);
    game.tts.speak(`${secs} second${secs === 1 ? '' : 's'} remaining.`, { interrupt: true });
    return;
  }
  if (g === 'enter') { game._pkReport(); return; }
  if (pk.ride) return;          // on the slide: nothing to do but ride
  if (g === 'space') {
    if (pk.at && pk.at.kind === 'duck') game._pkFire();
    else game.audio.play('empty_click');
    return;
  }
  if (g === 'left' || g === 'right') { game._turnQuick(g === 'right' ? 1 : -1); return; }
  if (g === 'up' || g === 'down') game._pkWalk(g);
}

export default {
  menu: [{ key: 'park', label: 'Water Park', select: (game) => game.startPark() }],
  playStates: [STATE],
  mixin,
  init(game) {
    game.pk = null;
  },
  reset,
  update(game, dt) { game.updatePark(dt); },
  input,
  stopAll(game) { if (game.pk) game._pkStopAll(); },
  finish(game) {
    const pk = game.pk;
    const parks = pk ? pk.parks : 0;
    const tokens = pk ? pk.tokens : 0;
    if (game.audio.has(PK_BELL)) game.audio.play(PK_BELL, { keep: true });
    const opener = game.timeLeft <= 0 ? 'Closing time.' : 'Game Over.';
    return { key: BOARD, score: parks, message: `${opener} You finished ${parks} ${plural(parks, 'park')} and won ${tokens} ${plural(tokens, 'token')}. ` };
  },
  room() { return PK_ROOM; },
  // On the slide the world does not turn; everywhere else it does.
  turns(game) { return game.state === STATE && !(game.pk && game.pk.ride); },
  keepFacing(game) { return !!(game.pk && game.pk.ride); },
  blockPause(game) { return !!(game.pk && game.pk.ride); },
  blockStride(game) { return !!(game.pk && (game.pk.ride || (game.pk.at && (game.pk.at.splashIn > 0 || game.pk.at.kind === 'duck')))); },
  // The hall's echo grows near the fence, as Battle's does near its edge.
  surroundings(game, pos) { return game._arenaSurroundings(pos); },
  strideSig(game) { const pk = game.pk; return pk ? `${pk.park}|${!!pk.exit}|${pk.at ? pk.at.kind : ''}|${!!pk.ride}` : ''; },
  status(game) {
    const pk = game.pk;
    if (!pk) return 'Water Park.';
    return `Water Park. Level ${pk.park}. ${pk.won} of ${pk.count} tokens.`;
  },
  boards: [{ key: BOARD, label: 'Water Park', fmt: (v) => `${v} ${v === 1 ? 'park' : 'parks'}` }],
  help: { sections: HELP_SECTIONS, demos: HELP_DEMOS },
};
