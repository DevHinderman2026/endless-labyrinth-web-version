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
//                     yourself, then ride down: just before each bend the rush of the
//                     water swings left or right, and you turn that way (flick, or the
//                     arrow key) before the bend comes. A bend missed bumps you into
//                     the side of the slide, two seconds off the clock. The token is
//                     yours at the splash at the bottom.
//   the diving pool   someone bouncing on its board. Walk onto the board and you dive:
//                     underwater you hold your breath, find the token by its ping and
//                     swim to it, and come back up with it. Out of breath: the whistle.
//   the wave pool     its waves. Walk into it at its edge; the token's ping is on the
//                     far side. You hear each wave rise before it breaks: stand still
//                     as it hits you and you hold your ground; walk into it and it
//                     carries you three steps back.
//   the tipping bucket  the water filling it, louder as it fills, then the dump. The
//                     token is under it: dash in just after a dump and stay under it a
//                     moment to take the token. Caught under the dump: the whistle.
// A first park has three attractions, each new park one more, drawn from these kinds.
// The clock is the park's own: forty seconds, and thirty for each attraction, one
// second less for each attraction in every new park, never under eighteen. Left-over
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
// token won and the bell (Developer Tools/Web Packs/web-only/waterpark.json).

import { AMBIENCE_LEVEL, BACKGROUND_SEND, makeSounds as makeUltimateSounds } from './ultimate.js';
import { addMade } from './events/sounds.js';

export const STATE = 'park';
export const BOARD = 'park';

// ------------------------------------------------------------------ constants
export const PK_STEP = 3.0;                   // one step, in the game's units
// The parks and their clock.
export const PK_FIRST = 3;                    // attractions in the first park; one more in each park after
export const PK_CLOCK_BASE = 40.0;            // seconds, plus PK_CLOCK_EACH for each attraction
export const PK_CLOCK_EACH = 30.0;            // ...one second less for each attraction in every new park...
export const PK_CLOCK_EACH_MIN = 18.0;        // ...never under this
export const PK_MISTAKE = 5.0;                // seconds a whistle costs
export const PK_BUMP = 2.0;                   // seconds a bend missed on the slide costs
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
export const PK_EXIT_REACH = 3.0;
// The water slide.
export const PK_CLIMB = 2.6;                  // seconds up the stairs
export const PK_BENDS = [3, 10];              // bends in the first park's slide, and the most (one more each park)
export const PK_CUE = [1.1, 0.6];             // seconds from the rush swinging to the bend: the first park's, and the least
export const PK_CUE_SHRINK = 0.05;            // ...shorter by this in each park
export const PK_BEND_GAP = [1.0, 0.5];        // seconds between one bend and the next swing: first, least
export const PK_SLIDE_SWING = 0.3;            // the far ear's level while the rush swings to one side
export const PK_SLIDE_LEVEL = 0.75;
// The diving pool.
export const PK_BREATH = 15.0;                // seconds of breath under the water
export const PK_BREATH_WARN = 6.0;            // Low air, then the high beeps, faster and faster
export const PK_POOL_R = 12.0;                // the pool's bottom, around the board
export const PK_DIVE_TOKEN = [6.0, 10.0];     // units from where you land that the token lies
export const PK_TAKE = 2.5;                   // units: near enough to take a token
export const PK_BOARD_EVERY = 2.2;            // seconds between bounces on the board, heard on the deck
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
// Sounds.
export const PK_BACKGROUND = 'wp_park';
export const PK_BUCKET_FILL = 'wp_bucket_fill';
export const PK_BUCKET_DUMP = 'wp_bucket_dump';
export const PK_WAVE = 'wp_wave';
export const PK_BOARD = 'wp_board';
export const PK_WHISTLE = 'wp_whistle';
export const PK_TOKEN = 'wp_token';
export const PK_BELL = 'wp_bell';
export const PK_RUSH = 'wp_rush';             // made by the game: the water down the slide
export const PK_SPLASH = 'evt_water_splash';
export const PK_STAIRS = 'stairs_beacon';
export const PK_CLIMB_SOUND = 'stairs_climb';
export const PK_WAVES_LOOP = 'island_09_waves_breaking';
export const PK_PING = 'event_beacon_bell';   // a token under water, or across the wave pool
export const PK_WADE = ['ut_water_step_1', 'ut_water_step_2', 'ut_water_step_3', 'ut_water_step_4'];
export const PK_STROKES = ['ut_dive_stroke_1', 'ut_dive_stroke_2', 'ut_dive_stroke_3', 'ut_dive_stroke_4'];
export const PK_KINDS = ['slide', 'dive', 'wave', 'bucket'];
export const PK_ROOM = 'open';                // outdoors: nothing echoes back

// ------------------------------------------------------------------ helpers
const rand = Math.random;
const uniform = (a, b) => a + (b - a) * rand();
const choice = (arr) => arr[Math.floor(rand() * arr.length)];
const plural = (n, word, many = word + 's') => (n === 1 ? word : many);
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// How many attractions a park has, and its clock.
export function attractionsFor(park) { return PK_FIRST + Math.max(0, park - 1); }
export function clockEach(park) { return Math.max(PK_CLOCK_EACH_MIN, PK_CLOCK_EACH - Math.max(0, park - 1)); }
export function clockFor(park, n = attractionsFor(park)) { return PK_CLOCK_BASE + clockEach(park) * n; }
// The attractions' own difficulty, by the park (in Chaos, by the visit).
export function bendsFor(park) { return Math.min(PK_BENDS[1], PK_BENDS[0] + Math.max(0, park - 1)); }
export function cueFor(park) { return Math.max(PK_CUE[1], PK_CUE[0] - PK_CUE_SHRINK * Math.max(0, park - 1)); }
export function bendGapFor(park) { return Math.max(PK_BEND_GAP[1], PK_BEND_GAP[0] - 0.04 * Math.max(0, park - 1)); }
export function waveLongFor(park) { return Math.min(PK_WAVE_LONG[1], PK_WAVE_LONG[0] + 1.5 * Math.max(0, park - 1)); }
export function waveEveryFor(park) { return Math.max(PK_WAVE_EVERY[1], PK_WAVE_EVERY[0] - 0.15 * Math.max(0, park - 1)); }
export function fillFor(park) { return Math.max(PK_FILL[1], PK_FILL[0] - 0.2 * Math.max(0, park - 1)); }

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

// The water down the slide: noise through a resonant band, steady, made to loop.
function rushSound(seconds = 2.0) {
  const SR = 44100;
  const n = Math.floor(SR * seconds);
  const L = new Float64Array(n); const R = new Float64Array(n);
  let seed = 4242;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
  const mk = () => ({ lp: 0, bp: 0 });
  const fl = mk(); const fr = mk();
  const run = (f, x, hz, q) => {
    const w = 2 * Math.sin(Math.PI * hz / SR);
    const hp = x - f.lp - f.bp / q;
    f.bp += w * hp; f.lp += w * f.bp;
    return f.bp;
  };
  // Run twice round, and keep the second turn, so the filters are settled at its start
  // as at its end and the loop has no seam.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const wob = 1 + 0.08 * Math.sin(2 * Math.PI * 3 * i / n);    // three slow swells a loop
      const x = rnd();
      const l = run(fl, x, 900 * wob, 1.6);
      const r = run(fr, rnd() * 0.4 + x * 0.6, 960 * wob, 1.6);
      if (pass) { L[i] = l * 32768; R[i] = r * 32768; }
    }
  }
  let peak = 1; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = 0.7 * 32767 / peak;
  for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
  return [L, R];
}

export function makeParkSounds(audio) {
  if (!audio || audio.has(PK_RUSH)) return;
  addMade(audio, PK_RUSH, rushSound());
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
    makeParkSounds(this.audio);
    // Held in memory for the whole run (let go in _pkStopAll).
    this.audio.prepare(PK_BACKGROUND);
    this.audio.prepare(PK_WAVES_LOOP, 'park:waves');
    this.audio.prepare(PK_BUCKET_FILL, 'park:fill');
    const prev = this.pk;
    const tokens = prev && !chaos ? prev.tokens : 0;
    const parks = prev && !chaos ? prev.parks : 0;
    this.playerPos = [0.0, 0.0];
    this.arenaLimit = 1e9;
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
      this.timeLeft = clockFor(park, count);
      this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / 30.0) * 30.0;
      this.thirtySecAnnounced = this.timeLeft <= 30.0;
      this.lastBeepSecond = -1;
      if (this.audio.has(PK_BELL)) this.audio.play(PK_BELL, { keep: true });
      this.tts.speak(`Level ${park}.`, { interrupt: true });
    }
  },

  _pkBackground(adopt = null) {
    const pk = this.pk;
    if (pk.amb && pk.amb.voice && pk.amb.voice.busy) { pk.amb.voice.setVolume(AMBIENCE_LEVEL); return; }
    let voice = null;
    if (adopt && adopt.busy && adopt.name === PK_BACKGROUND) { voice = adopt; voice.setVolume(AMBIENCE_LEVEL); }
    else {
      if (adopt) adopt.fadeout(400);
      voice = this.audio.has(PK_BACKGROUND) ? this.audio.play(PK_BACKGROUND, { loops: -1, volume: AMBIENCE_LEVEL, fadeMs: 400, send: BACKGROUND_SEND }) : null;
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
  },

  _pkLevels(pos, gain, range = 60.0) {
    const dx = pos[0] - this.playerPos[0];
    const dy = pos[1] - this.playerPos[1];
    const d = Math.hypot(dx, dy);
    const pan = d > 0 ? dx / d : 0.0;
    const v = Math.min(1.0, Math.max(0.12, 1.0 - d / range) * gain);
    return [v * (1.0 - Math.max(0.0, pan)), v * (1.0 - Math.max(0.0, -pan)), d];
  },

  // ---------------------------------------------------------------- the deck
  // Every attraction not yet won is heard from where it stands.
  _pkUpdateDeck(dt) {
    const pk = this.pk;
    for (const at of pk.attractions) {
      if (at.done) { this._pkQuiet(at); continue; }
      if (pk.at && pk.at.at === at) continue;       // (the pool you are in is heard from inside it)
      if (at.kind === 'slide') this._pkLoop(at, PK_STAIRS, at.pos, 0.8);
      else if (at.kind === 'wave') {
        const mid = [at.pos[0] + at.axis[0] * at.long * 0.5, at.pos[1] + at.axis[1] * at.long * 0.5];
        this._pkLoop(at, PK_WAVES_LOOP, at.pos, 0.55, mid);
      } else if (at.kind === 'dive') {
        at.t -= dt;
        if (at.t <= 0) {
          at.t = PK_BOARD_EVERY;
          const [l, r] = this._pkLevels(at.pos, 0.9);
          if (this.audio.has(PK_BOARD)) this.audio.play(PK_BOARD, { at: at.pos, volume: Math.max(l, r) });
        }
      } else if (at.kind === 'bucket') this._pkBucket(at, dt);
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
    if (!at.voice || !at.voice.busy) at.voice = this.audio.play(name, { loops: -1, volume: 0.0, fadeMs: 200 });
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
      pk.ride = { at, stage: 'climb', t: 0, bend: 0, bends: bendsFor(pk.park), cue: null, rush: null };
      this.audio.play(PK_CLIMB_SOUND, { keep: true });
      return;
    }
    if (at.kind === 'dive') {
      this._pkQuiet(at);
      pk.at = { at, kind: 'dive', breath: PK_BREATH, warned: false, beepIn: 0, under: null, ping: null,
        centre: [...at.pos], token: this._pkDiveSpot(at.pos) };
      if (this.audio.has(PK_BOARD)) this.audio.play(PK_BOARD, { keep: true });
      pk.at.splashIn = 0.35;
      this._pkDuckAir(true);
      return;
    }
    if (at.kind === 'wave') {
      pk.at = { at, kind: 'wave', ping: null };
      this.playerPos = [...at.pos];
      this._pkStep('wade');
    }
  },

  _pkDiveSpot(centre) {
    const a = uniform(0, Math.PI * 2); const d = uniform(PK_DIVE_TOKEN[0], PK_DIVE_TOKEN[1]);
    return [centre[0] + Math.sin(a) * d, centre[1] - Math.cos(a) * d];
  },

  // Under the water, or on the slide, the park's air is far off.
  _pkDuckAir(on) {
    const pk = this.pk;
    if (pk.amb && pk.amb.voice) pk.amb.voice.setVolume(AMBIENCE_LEVEL * (on ? 0.25 : 1.0));
    for (const at of pk.attractions) if (on && at.voice) { at.voice.fadeout(200); at.voice = null; }
  },

  // ---------------------------------------------------------------- the water slide
  _pkUpdateSlide(dt) {
    const pk = this.pk;
    const r = pk.ride;
    r.t += dt;
    if (r.stage === 'climb') {
      if (r.t < PK_CLIMB) return;
      r.stage = 'down'; r.t = 0; r.next = 0.8;
      this._pkDuckAir(true);
      r.rush = this.audio.has(PK_RUSH) ? this.audio.play(PK_RUSH, { loops: -1, volume: PK_SLIDE_LEVEL, fadeMs: 250, keep: true }) : null;
      return;
    }
    if (r.stage !== 'down') return;
    // A bend coming: the rush swings to its side; at the bend, were you turned that way?
    if (!r.cue) {
      r.next -= dt;
      if (r.next > 0) return;
      if (r.bend >= r.bends) { this._pkSlideEnd(); return; }
      const side = rand() < 0.5 ? 'left' : 'right';
      r.cue = { side, t: cueFor(pk.park), answered: null };
      if (r.rush) r.rush.setVolume(side === 'left' ? PK_SLIDE_LEVEL : PK_SLIDE_LEVEL * PK_SLIDE_SWING, side === 'right' ? PK_SLIDE_LEVEL : PK_SLIDE_LEVEL * PK_SLIDE_SWING);
      return;
    }
    r.cue.t -= dt;
    if (r.cue.t > 0) return;
    // The bend.
    const ok = r.cue.answered === r.cue.side;
    r.bend += 1;
    if (ok) {
      // Round the bend: a splash of the slide's water.
      const bank = PK_WADE.filter((n) => this.audio.has(n));
      if (bank.length) this.audio.play(choice(bank), { volume: 0.8 });
    } else {
      this.audio.play('boundary', { keep: true });
      this._pkCost(PK_BUMP);
    }
    r.cue = null;
    r.next = bendGapFor(pk.park);
    if (r.rush) r.rush.setVolume(PK_SLIDE_LEVEL, PK_SLIDE_LEVEL);
  },

  _pkSteer(side) {
    const r = this.pk.ride;
    if (!r || r.stage !== 'down') return;
    if (r.cue && r.cue.answered === null) { r.cue.answered = side; return; }
    // A turn with no bend coming: only a gentle bump, no time lost.
    if (!r.cue) this.audio.play('empty_click', { volume: 0.5 });
  },

  _pkSlideEnd() {
    const pk = this.pk;
    const r = pk.ride;
    if (r.rush) { r.rush.fadeout(150); r.rush = null; }
    if (this.audio.has(PK_SPLASH)) this.audio.play(PK_SPLASH, { keep: true });
    // You come up beside the slide's pool, a few steps from its stairs.
    const a = uniform(0, Math.PI * 2);
    this.playerPos = [r.at.pos[0] + Math.sin(a) * 8.0, r.at.pos[1] - Math.cos(a) * 8.0];
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
      if (this.audio.has(PK_SPLASH)) this.audio.play(PK_SPLASH, { keep: true });
      d.under = this.audio.play('underwater', { loops: -1, volume: 0.7, fadeMs: 300 });
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
        this.audio.play('countdown_high');
      }
    }
    if (this.audio.has(PK_PING)) {
      if (!d.ping || !d.ping.busy) d.ping = this.audio.play(PK_PING, { loops: -1, volume: 0.0 });
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
    if (this.audio.has(PK_SPLASH)) this.audio.play(PK_SPLASH, { volume: 0.7 });
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
    this._pkLoop(at, PK_WAVES_LOOP, at.pos, 0.55, this.playerPos);
    if (this.audio.has(PK_PING)) {
      if (!w.ping || !w.ping.busy) w.ping = this.audio.play(PK_PING, { loops: -1, volume: 0.0 });
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
      if (this.audio.has(PK_WAVE)) this.audio.play(PK_WAVE, { at: from, volume: 1.0, keep: true });
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
    if (this.audio.has(PK_SPLASH)) this.audio.play(PK_SPLASH, { volume: 0.8, keep: true });
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
        if (!at.voice || !at.voice.busy) at.voice = this.audio.play(PK_BUCKET_FILL, { loops: -1, volume: 0.0, fadeMs: 150 });
        const rise = 0.35 + 0.65 * clamp(at.t / fill, 0, 1);
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
        if (this.audio.has(PK_BUCKET_DUMP)) this.audio.play(PK_BUCKET_DUMP, { at: at.pos, volume: Math.max(l, r, 0.6), keep: true });
      }
      return;
    }
    // The dump coming down: under it, you are caught.
    at.under = 0;
    if (d < PK_DRENCH && !at.caught) {
      at.caught = true;
      const away = d > 0.5 ? [(this.playerPos[0] - at.pos[0]) / d, (this.playerPos[1] - at.pos[1]) / d] : [0, 1];
      this.playerPos = [at.pos[0] + away[0] * (PK_DRENCH + 4.5), at.pos[1] + away[1] * (PK_DRENCH + 4.5)];
      this.stride = null;
      this._pkWhistle();
    }
    if (at.t >= PK_DUMP) { at.phase = 'fill'; at.t = 0; at.caught = false; }
  },

  // ---------------------------------------------------------------- tokens, mistakes and the gate
  _pkToken(at) {
    const pk = this.pk;
    at.done = true;
    pk.won += 1;
    pk.tokens += 1;
    if (this.audio.has(PK_TOKEN)) this.audio.play(PK_TOKEN, { keep: true });
    if (pk.chaos) this._pkClock(PK_CHAOS_TOKEN);
    const left = pk.count - pk.won;
    if (left > 0) { this.tts.speak(`${left} to go.`, { interrupt: true }); return; }
    this._pkOpenExit();
  },

  _pkWhistle() {
    if (this.audio.has(PK_WHISTLE)) this.audio.play(PK_WHISTLE, { keep: true });
    this._pkCost(PK_MISTAKE);
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
    if (this.audio.has(PK_BELL)) this.audio.play(PK_BELL, { keep: true });
    let pos = null;
    for (let i = 0; i < 40 && !pos; i++) {
      const a = uniform(0, Math.PI * 2); const d = uniform(PK_EXIT_RANGE[0], PK_EXIT_RANGE[1]);
      const p = [this.playerPos[0] + Math.sin(a) * d, this.playerPos[1] - Math.cos(a) * d];
      pos = p;
    }
    pk.exit = { pos, voice: this.audio.play('exit_morse', { loops: -1, volume: 0.0 }) };
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
    if (pk.at && pk.at.kind === 'dive') {
      if (pk.at.splashIn > 0) return;
      // The pool's walls.
      const c = pk.at.centre;
      const d = dist2(to, c);
      if (d > PK_POOL_R) {
        const k = PK_POOL_R / d;
        to = [c[0] + (to[0] - c[0]) * k, c[1] + (to[1] - c[1]) * k];
        if (dist2(to, from) < PK_STEP * 0.25) { this.audio.play('boundary'); this.stride = null; return; }
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
        if (dist2(cl, from) < PK_STEP * 0.25) { this.audio.play('boundary'); this.stride = null; return; }
        to = cl;
      }
      pk.lastStepAt = pk.clock;
      this.playerPos = to;
      this._pkStep('wade');
      if (along < -1.0) { this._pkLeaveWave(w, false); return; }
      if (dist2(to, w.at.token) < PK_TAKE + 1.0 || along >= w.at.long) { this.playerPos = [...w.at.token]; this._pkLeaveWave(w, true); }
      return;
    }
    this.playerPos = to;
    this._playStep();
    if (pk.exit && this._pkLevelExit() < PK_EXIT_REACH) this._pkLeaveByExit();
  },

  _pkStep(kind) {
    const bank = (kind === 'swim' ? PK_STROKES : PK_WADE).filter((n) => this.audio.has(n));
    if (bank.length) this.audio.play(choice(bank));
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
    for (const k of ['park:waves', 'park:fill']) this.audio.pins.delete(k);
  },
};

// ------------------------------------------------------------------ help
const HELP_SECTIONS = [
  ['Water Park', [
    { title: 'Water Park', sound: null, desc: 'Water Park is a mode of its own, new in 7.0.0. You are in a water park on a summer\'s day, open ground with no walls, and its attractions are all around you, each found by its own sound. Every attraction holds one token. Win every token before closing time, and a gate opens to the next park, which is bigger. Nothing in the park can hurt you: only closing time ends your visit. You turn and walk as in every walking mode (see General Turning). Double tap for the level, the tokens you have found, the seconds left and the way you are facing.' },
    { title: 'Water Park Water Slide', sound: null, desc: 'The water slide is found by its staircase beacon, Tower Mode\'s stairs: three short chimes rising, each with a footstep on metal stairs under it. Walk up to it and you climb the stairs by yourself, then ride down. On the way down you steer: just before each bend, the rush of the water swings to your left or to your right, and you turn that way, with a flick left or right, or an arrow key, before the bend comes. Turn the right way and you whoosh round the bend. Turn the wrong way, or not at all, and you bump into the side of the slide, which costs two seconds. However many bends you miss, the token is yours at the splash at the bottom, and you come up beside the slide. The first park\'s slide has three bends; every park after it has one more, up to ten, and the warning before each bend gets a little shorter. While you are on the slide you cannot walk or pause.' },
    { title: 'Water Park Diving Pool', sound: null, desc: 'The diving pool is found by someone bouncing on its diving board. Walk onto the board and you dive in. Under the water you hold your breath for fifteen seconds. The token lies on the bottom, a few steps away: you hear its bell ringing, so turn until it is centred and swim to it, each step a swimming stroke. Reach it and you come back up with it. With six seconds of breath left, the voice says Low air and the high beeps begin, faster and faster. Run out of breath and the lifeguard blows the whistle: you come back up at the board without the token, and it costs five seconds. Dive again to try once more.' },
    { title: 'Water Park Wave Pool', sound: null, desc: 'The wave pool is found by its waves. Walk into it at its edge, and the token\'s bell rings from its far side. Wade toward it, one step at a time. Every few seconds a wave comes: you hear it rise ahead of you, and then break over you. Stand still as it breaks and you hold your ground. Take a step just as it breaks, and it carries you three steps back, and if that takes you out of the pool, you are back at its edge. Reach the far side and the token is yours. The waves come a little more often in every park, and the pool is a little longer.' },
    { title: 'Water Park Tipping Bucket', sound: null, desc: 'The tipping bucket is found by the water filling it, louder and louder as it fills, until it tips and dumps its water with a crash, then starts to fill again. The token is right under it. Dash in just after a dump, and stay under it for a moment, a second, to take the token. If the bucket dumps while you are under it, or close beside it, you are caught: the lifeguard blows the whistle, you are pushed back from the bucket, and it costs five seconds. The bucket fills a little faster in every park.' },
    { title: 'Water Park Closing Time and Score', sound: null, desc: 'Each park has its own clock: forty seconds, and thirty more for each attraction, with one second less for each attraction in every new park, never less than eighteen. The first park has three attractions, two minutes and ten seconds. Every token you win is announced with how many are left to go. When the last one is won, the clock stops, a bell rings, and the gate is heard, the battle exit\'s Morse signal: walk through it to the next park, which has one more attraction. Time left over is not carried on. When closing time comes, the bell rings and your visit is over. Your score is the number of parks you finished, and Water Park has its own high score board.' },
    { title: 'Water Park in Chaos Mode', sound: null, desc: 'Chaos Mode has water parks too, one park to a level, which you know by the busy pool and its children. A water park in chaos has three attractions the first time in a run, and one more each time after, at most six. There is no park clock there: each token you win adds fifteen seconds to the chaos clock, and a mistake takes its seconds off it. When the last token is won, the exit is heard over the park, which plays on, and the chaos clock waits until you walk through it. There, double tap for the tokens found, then your health, the clock and the points.' },
  ]],
];

const HELP_DEMOS = [
  ['Demos, Water Park', [
    { title: 'Water Park Demos', sound: null, desc: 'The sounds of the Water Park.' },
    { title: 'The Water Park', sound: PK_BACKGROUND, desc: 'The air of the park: a busy outdoor pool, with children splashing and playing.' },
    { title: 'Water Slide Stairs', sound: PK_STAIRS, desc: 'The water slide\'s staircase beacon.' },
    { title: 'Down the Slide', sound: PK_RUSH, desc: 'The rush of the water down the slide. Before a bend it swings to one side: turn that way.' },
    { title: 'Diving Board', sound: PK_BOARD, desc: 'Someone bouncing on the diving board: the diving pool is there.' },
    { title: 'Token Under Water', sound: PK_PING, desc: 'The bell of a token, under the water or across the wave pool.' },
    { title: 'A Wave', sound: PK_WAVE, desc: 'A wave rising and breaking in the wave pool. Stand still as it breaks.' },
    { title: 'Bucket Filling', sound: PK_BUCKET_FILL, desc: 'The tipping bucket filling, louder as it fills.' },
    { title: 'Bucket Dumping', sound: PK_BUCKET_DUMP, desc: 'The tipping bucket dumping its water. Dash in just after.' },
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
  if (pk.ride) {
    if (g === 'left' || g === 'right') game._pkSteer(g);
    else if (g === 'turn_left_start' || g === 'turn_right_start') game._pkSteer(g === 'turn_right_start' ? 'right' : 'left');
    return;
  }
  if (g === 'space') { game.audio.play('empty_click'); return; }
  if (g === 'left' || g === 'right') { game._turnQuick(g === 'right' ? 1 : -1); return; }
  if (g === 'up' || g === 'down') game._pkWalk(g);
}

export default {
  menu: [{ key: 'park', label: 'Water Park', select: (game) => game.startPark() }],
  playStates: [STATE],
  mixin,
  init(game) {
    game.pk = null;
    try { if (game.audio && game.audio.ctx) makeParkSounds(game.audio); } catch (e) { /* made when a run begins */ }
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
  // Down the slide you steer, and the world does not turn; everywhere else it does.
  turns(game) { return game.state === STATE && !(game.pk && game.pk.ride); },
  keepFacing(game) { return !!(game.pk && game.pk.ride); },
  blockPause(game) { return !!(game.pk && game.pk.ride); },
  blockStride(game) { return !!(game.pk && (game.pk.ride || (game.pk.at && game.pk.at.splashIn > 0))); },
  surroundings() { return [1.0, 0.0]; },     // no walls anywhere
  strideSig(game) { const pk = game.pk; return pk ? `${pk.park}|${!!pk.exit}|${pk.at ? pk.at.kind : ''}|${!!pk.ride}` : ''; },
  status(game) {
    const pk = game.pk;
    if (!pk) return 'Water Park.';
    return `Water Park. Level ${pk.park}. ${pk.won} of ${pk.count} tokens.`;
  },
  boards: [{ key: BOARD, label: 'Water Park', fmt: (v) => `${v} ${v === 1 ? 'park' : 'parks'}` }],
  help: { sections: HELP_SECTIONS, demos: HELP_DEMOS },
};
