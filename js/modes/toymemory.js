// Toy Memory (web 8.2.0, Russell's design, 27 November 2026; website only).
//
// A sub mode of Battle: choosing Battle Mode on the main menu now asks which, Battle
// or Toy Memory (the Battle menu, below; Battle itself lives in js/game.js). Gentle
// and relaxing, not meant to be hard: no clock, no crowd, nothing ever hurts you.
//
// A relaxing ambience plays (a zen fountain). A box waits somewhere near you, marked by
// a soft music box placed where it stands. You turn and walk to it as in Battle, and
// walking into it opens it: the box opens, and a toy inside plays the sound of ONE of
// Battle's enemies, ONCE ONLY. It is never played again: remembering it is the point.
//
// Then enemies appear around you, standing still. They never hit you or chase you.
// They sound one at a time, in a round that repeats, always in the same order (going
// round you clockwise), so you can hear where each one stands. Each has a different
// one of Battle's enemy sounds, and exactly one matches the toy. Shoot that one. The
// laser is much narrower here than in Battle (TM_AIM_DEG), and the enemies stand on
// the quick turn's thirty degree steps, never two side by side, so a flick lines up a
// shot exactly and a shot can only ever hit one.
//
// Three lives. A wrong shot or a miss costs one; the round goes on, the enemies stay
// and keep taking turns, until you hit the right one or run out of lives. The right
// one: it is shot down, the others vanish, and the next box appears. Two enemies at
// first, one more every three boxes, at most six. The score is the boxes solved, on a
// board of its own. While the enemies are out you stand where you are (a step only
// buzzes): turn and listen.
//
// Chaos Mode has Toy Memory levels too (js/modes/chaos.js): solve a number of boxes
// (TM_CHAOS_BOXES); a wrong shot or a miss costs Chaos health (TM_CHAOS_WRONG_HEALTH)
// instead of a life; the chaos clock runs as usual.
//
// The sounds: the ambience, the music box and the box opening are Pixabay recordings in
// the toymemory pack (tools/toymemory/make_sounds.py names each one); should one ever be
// missing, the game's nearest sound stands in for it (TM_STAND_INS). The toys and the
// enemies are Battle's own enemy sounds (obstacle_0 to obstacle_9).

import { aliasRecording } from './events/sounds.js';
import { AMBIENCE_LEVEL, BACKGROUND_SEND } from './ultimate.js';
import { forwardOf, TURN_STEP, TURN_STEPS } from '../turning.js';

export const STATE = 'toymemory';
export const BOARD = 'toymemory';

// ------------------------------------------------------------------ constants
// (8.2.0, Russell's design, 27 November 2026; the numbers below are Claude's
// suggestions, for Russell to approve or change.)
export const TM_STEP = 3.0;                     // one step, as Battle's arena step (game.js ARENA_STEP)
export const TM_ARENA = 40.0;                   // the floor: as Battle's arena, the boundary buzzing at its edge
export const TM_LIVES = 3;
// Enemies in a round: two at first, one more every three boxes solved, at most six.
export const TM_ENEMIES_FIRST = 2;
export const TM_ENEMIES_EVERY = 3;
export const TM_ENEMIES_MAX = 6;
// The box: this many steps from you (exactly, along one of the quick turn's thirty degree
// steps, so a flick or two lines you up with it and walking straight on reaches it), and
// always this far inside the edge of the floor.
export const TM_BOX_STEPS = [4, 7];
export const TM_BOX_EDGE = 34.0;
export const TM_BOX_REACH = 3.0;                // units: this near, you have walked into it (as Battle's pickups)
// The music box: heard from anywhere on the floor, never quieter than the floor level.
export const TM_BEACON_GAIN = 0.7;
export const TM_BEACON_RANGE = 60.0;
export const TM_BEACON_FLOOR = 0.2;
// Opening it: the opening sound, then the toy, then the enemies.
export const TM_OPEN_MAX = 2.0;                 // seconds of the opening sound waited for, at most, before the toy
export const TM_TOY_GAP = 0.4;                  // seconds after the opening sound before the toy plays
export const TM_TOY_LEVEL = 1.0;                // the toy, heard in front of you (you are at the box)
export const TM_AFTER_TOY = 1.5;                // seconds after the toy before the first enemy sounds
// The enemies: this far from you (five steps), on the quick turn's thirty degree steps
// (twelve round you), never two on neighbouring steps, so at least sixty degrees apart.
export const TM_ENEMY_DIST = 15.0;
export const TM_ENEMY_LEVEL = 0.9;
// The round: after each enemy's sound (Battle's are one second long), this many seconds
// of quiet before the next; after the last of the round, a longer pause before it repeats.
export const TM_TURN_GAP = 0.9;
export const TM_ROUND_PAUSE = 2.0;
// The laser (this mode only): it hits only an enemy within this many degrees either side
// of straight ahead, and never behind. Battle's hits anything within about 46 degrees
// either side, ahead or behind (game.js BATTLE_AIM_PAN 0.72). With the enemies at least
// sixty degrees apart, a shot can never hit two.
export const TM_AIM_DEG = 12;
export const TM_SHOT_GAP = 0.6;                 // seconds between two shots, at least (a double tap twice is not two lost lives)
export const TM_WRONG_AFTER = 0.25;             // seconds after the laser that a wrong shot's or a miss's buzz is heard
export const TM_VANISH_AFTER = 0.4;             // seconds after the right shot that the others vanish, with a twinkle
export const TM_NEXT_HOLD = 2.0;                // seconds after the right shot before the next box appears
// Chaos (8.2.0): boxes to solve: two the first time in a run, one more each time, at most
// five. A wrong shot or a miss costs this much health (no life is lost: Chaos has its one
// health bar). In Chaos the enemies grow with all the boxes solved in the run's Toy Memory
// levels together, by the same rule as above.
export const TM_CHAOS_BOXES = [2, 1, 5];
export const TM_CHAOS_WRONG_HEALTH = 15;
// Sounds.
export const TM_AMBIENCE = 'tm_ambience';       // a zen fountain, looped
export const TM_BEACON = 'tm_beacon';           // a short phrase of a music box, looped, mono
export const TM_OPEN = 'tm_box_open';           // the box opening: a wooden latch, mono
export const TM_ENEMY_SOUNDS = [...Array(10).keys()].map((i) => 'obstacle_' + i);   // Battle's ten enemies
export const TM_WRONG = 'tm_wrong';             // a wrong shot or a miss (the events' wrong buzz)
export const TM_VANISH = 'tm_vanish';           // the others vanishing (the events' magic twinkle)
export const TM_ROOM = 'battle';                // Battle's arena echo, so the enemies sound as they do there
// Should a recording be missing: the sound that stands in for it (an events recording by
// its stem, or the game's own).
export const TM_STAND_INS = {
  [TM_AMBIENCE]: ['evt_amb_spring_birds', 'evt_amb_morning_birds'],
  [TM_BEACON]: ['evt_music_box', 'evt_wind_chimes'],
  [TM_OPEN]: ['evt_chest_open', 'mu_door_open'],
  [TM_WRONG]: ['event_wrong', 'evt_error_beep', 'boundary'],
  [TM_VANISH]: ['evt_magic_twinkle', 'evt_harp_glissando'],
};
export const TM_RECORDINGS = [TM_AMBIENCE, TM_BEACON, TM_OPEN, TM_WRONG, TM_VANISH];

// ------------------------------------------------------------------ helpers
const rand = Math.random;
const randint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const choice = (arr) => arr[Math.floor(rand() * arr.length)];
const plural = (n, word, many = word + 's') => (n === 1 ? word : many);
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const RATE = 44100;

// Enemies in a round, after this many boxes solved.
export function enemiesFor(solved) {
  return Math.min(TM_ENEMIES_MAX, TM_ENEMIES_FIRST + Math.floor(Math.max(0, solved) / TM_ENEMIES_EVERY));
}
// Boxes to solve in the run's nth Toy Memory level of Chaos.
export function chaosBoxes(n) {
  return Math.min(TM_CHAOS_BOXES[2], TM_CHAOS_BOXES[0] + TM_CHAOS_BOXES[1] * Math.max(0, n - 1));
}
// n of the twelve thirty degree steps round you, never two neighbours (n at most six),
// in clockwise order from a random one of them.
export function pickSlots(n) {
  n = Math.max(1, Math.min(TURN_STEPS / 2, n));
  for (let attempt = 0; attempt < 200; attempt++) {
    const taken = [];
    for (const s of shuffle([...Array(TURN_STEPS).keys()])) {
      if (taken.length >= n) break;
      if (taken.some((t) => Math.abs(t - s) === 1 || Math.abs(t - s) === TURN_STEPS - 1)) continue;
      taken.push(s);
    }
    if (taken.length === n) {
      taken.sort((a, b) => a - b);
      const k = randint(0, n - 1);
      return [...taken.slice(k), ...taken.slice(0, k)];
    }
  }
  // (Never in practice: every other step always fits.)
  const start = randint(0, 1);
  return [...Array(n).keys()].map((i) => (start + i * 2) % TURN_STEPS);
}
// A place this far from `from`, along the thirty degree step `slot` (0 north, then clockwise).
export function slotPos(from, slot, dist) {
  const a = slot * TURN_STEP;
  return [from[0] + Math.sin(a) * dist, from[1] - Math.cos(a) * dist];
}

// ------------------------------------------------------------------ the game's methods
const mixin = {
  // The Battle menu (8.2.0), from the main menu's Battle Mode (game.js _menuInput).
  openBattleMenu() {
    this.state = S_BATTLE_MENU;
    this.battleMenuIndex = 0;
    this.tts.speak(`Battle Mode. Swipe up and down to choose, double tap to start. ${BATTLE_MENU[0][1]}`, { interrupt: true });
  },

  startToyMemory() {
    this.state = STATE;
    this.resetGameState();
    this.state = STATE;
    this._syncRoom();
    this._wake(true);
    if (this.ambienceChannel) { this.ambienceChannel.stop(); this.ambienceChannel = null; }
    if (this.beatChannel) { this.beatChannel.stop(); this.beatChannel = null; }
    this.tm = null;
    this._face(0, true);
    this._tmBegin({ chaos: false });
    this.tts.speak('Toy Memory started.', { interrupt: true });
  },

  // A run, or a chaos level (quota: the boxes to solve).
  _tmBegin({ chaos, quota = 0, adopt = null }) {
    this.tmNames = new Map(this._tmNames());
    for (const [stem, name] of this.tmNames) if (name && stem !== TM_AMBIENCE) this.audio.prepare(name, `toymemory:${stem}`);
    this.arenaLimit = TM_ARENA;
    this.stride = null;
    const tm = this.tm = {
      run: this.runId, chaos, quota, solved: 0, lives: chaos ? 0 : TM_LIVES,
      phase: 'box', t: 0, box: null, boxes: 0, beacon: null, amb: null,
      toy: null, toyPlays: 0, enemies: [], turn: 0, rounds: 0, turns: [],
      shotT: 0, shots: 0, wrong: 0, missed: 0, dead: false, done: false,
    };
    this._tmBackground(adopt);
    this._tmNewBox();
  },

  // The recordings the mode plays: the pack's own where it has them, the stand-ins until then.
  _tmNames() {
    const a = this.audio;
    const pick = (name, amb = false) => {
      if (a.has(name)) return name;
      for (const s of TM_STAND_INS[name] || []) {
        const al = aliasRecording(a, s, `${amb ? 'event_amb_file_' : 'event_sfx_file_'}${s}`);
        if (al) return al;
        if (a.has(s)) return s;
      }
      return null;
    };
    return TM_RECORDINGS.map((n) => [n, pick(n, n === TM_AMBIENCE)]);
  },

  _tmName(stem) {
    if (!this.tmNames) this.tmNames = new Map(this._tmNames());
    return this.tmNames.get(stem) || null;
  },

  // The ambience's name, for Chaos's elevator to bring in ahead (chaos.js _chaosPreviewName).
  _tmAmbName() { return this._tmName(TM_AMBIENCE); },

  _tmBackground(adopt = null) {
    const tm = this.tm;
    const name = this._tmName(TM_AMBIENCE);
    let voice = null;
    if (adopt && adopt.busy && adopt.name === name) { voice = adopt; voice.setVolume(AMBIENCE_LEVEL); }
    else {
      if (adopt) adopt.fadeout(400);
      voice = name ? this.audio.play(name, { loops: -1, volume: AMBIENCE_LEVEL, fadeMs: 400, send: BACKGROUND_SEND }) : null;
    }
    tm.amb = { name, voice };
  },

  // How loud a thing is from where you are: [left, right, distance], never quieter than the floor.
  _tmLevels(pos, gain, range, floor) {
    const dx = pos[0] - this.playerPos[0]; const dy = pos[1] - this.playerPos[1];
    const d = Math.hypot(dx, dy);
    const pan = d > 0 ? dx / d : 0.0;
    const v = Math.min(1.0, Math.max(floor, 1.0 - d / range) * gain);
    return [v * (1.0 - Math.max(0.0, pan)), v * (1.0 - Math.max(0.0, -pan)), d];
  },

  // ---------------------------------------------------------------- the box
  // A new box: a whole number of steps away along one of the thirty degree steps, inside the floor.
  _tmNewBox() {
    const tm = this.tm;
    const p = this.playerPos;
    const inside = (q) => Math.abs(q[0]) <= TM_BOX_EDGE && Math.abs(q[1]) <= TM_BOX_EDGE;
    let pos = null;
    for (let i = 0; i < 200 && !pos; i++) {
      const q = slotPos(p, randint(0, TURN_STEPS - 1), randint(TM_BOX_STEPS[0], TM_BOX_STEPS[1]) * TM_STEP);
      if (inside(q)) pos = q;
    }
    if (!pos) {
      // (Never in practice: some direction always leads back toward the middle.)
      const opts = [...Array(TURN_STEPS).keys()].map((s) => slotPos(p, s, TM_BOX_STEPS[0] * TM_STEP)).filter(inside);
      pos = opts.length ? choice(opts) : [0, 0];
    }
    tm.box = { pos };
    tm.boxes += 1;
    tm.phase = 'box';
    tm.t = 0;
    tm.enemies = [];
    tm.toy = null;
  },

  _tmUpdateBeacon() {
    const tm = this.tm;
    if (tm.phase !== 'box' || !tm.box) { this._tmStopBeacon(); return; }
    if (tm.beacon && !tm.beacon.busy) tm.beacon = null;
    const name = this._tmName(TM_BEACON);
    if (!tm.beacon && name) tm.beacon = this.audio.play(name, { loops: -1, volume: 0.0 });
    const [l, r, d] = this._tmLevels(tm.box.pos, TM_BEACON_GAIN, TM_BEACON_RANGE, TM_BEACON_FLOOR);
    if (tm.beacon) tm.beacon.setVolume(l, r, this._behind(tm.box.pos));
    if (d < TM_BOX_REACH) this._tmOpen();
  },

  _tmStopBeacon(fade = 0) {
    const tm = this.tm;
    if (tm && tm.beacon) { if (fade) tm.beacon.fadeout(fade); else tm.beacon.stop(); tm.beacon = null; }
  },

  // Walked into: it opens, and a moment later the toy inside plays, once.
  _tmOpen() {
    const tm = this.tm;
    this.stride = null;
    this._tmStopBeacon(200);
    tm.phase = 'open';
    const name = this._tmName(TM_OPEN);
    let len = 0;
    if (name) {
      this.audio.play(name, { volume: 1.0, keep: true });
      const e = this.audio.entries.get(name);
      len = e && e.dry && e.dry.frames ? e.dry.frames / RATE : TM_OPEN_MAX;
    }
    tm.t = Math.min(TM_OPEN_MAX, len) + TM_TOY_GAP;
    // The round is chosen now: its enemies, which of them the toy is, and where they stand.
    const n = enemiesFor(tm.chaos ? (this.chaosToySolved || 0) : tm.solved);
    const sounds = shuffle(TM_ENEMY_SOUNDS.filter((s) => this.audio.has(s))).slice(0, n);
    const slots = pickSlots(sounds.length);
    const match = randint(0, sounds.length - 1);
    const at = [...this.playerPos];
    tm.enemies = slots.map((slot, i) => {
      const [x, y] = slotPos(at, slot, TM_ENEMY_DIST);
      return { slot, x, y, sound: sounds[i], match: i === match, voice: null };
    });
    tm.toy = sounds[match] || null;
  },

  // The toy: the sound of one of the round's enemies, once only. Nothing plays it again.
  _tmPlayToy() {
    const tm = this.tm;
    tm.phase = 'toy';
    let len = 1.0;
    if (tm.toy) {
      this.audio.play(tm.toy, { volume: TM_TOY_LEVEL, keep: true });
      tm.toyPlays += 1;
      const e = this.audio.entries.get(tm.toy);
      if (e && e.dry && e.dry.frames) len = e.dry.frames / RATE;
    }
    tm.t = len + TM_AFTER_TOY;
  },

  // ---------------------------------------------------------------- the round
  _tmUpdateRound(dt) {
    const tm = this.tm;
    tm.t -= dt;
    if (tm.t > 0 || !tm.enemies.length) return;
    const i = tm.turn % tm.enemies.length;
    const e = tm.enemies[i];
    e.voice = this.audio.play(e.sound, { at: [e.x, e.y], volume: TM_ENEMY_LEVEL });
    tm.turns.push(i);
    const pair = this.audio.entries.get(e.sound);
    const len = pair && pair.dry && pair.dry.frames ? pair.dry.frames / RATE : 1.0;
    const last = i === tm.enemies.length - 1;
    tm.t = len + (last ? TM_ROUND_PAUSE : TM_TURN_GAP);
    tm.turn = i + 1;
    if (last) tm.rounds += 1;
  },

  // The enemy the narrow laser hits: within TM_AIM_DEG of straight ahead, never behind.
  _tmAimed() {
    let best = null; let bestA = Infinity;
    for (const e of this.tm.enemies) {
      const [side, ahead] = this._rel([e.x, e.y]);
      if (ahead <= 0) continue;
      const a = Math.abs(Math.atan2(side, ahead)) * 180 / Math.PI;
      if (a <= TM_AIM_DEG && a < bestA) { best = e; bestA = a; }
    }
    return best;
  },

  _tmFire() {
    const tm = this.tm;
    if (tm.shotT > 0) return;
    if (tm.phase !== 'round') { this.audio.play('empty_click'); return; }
    tm.shotT = TM_SHOT_GAP;
    tm.shots += 1;
    this.audio.play('laser');
    const hit = this._tmAimed();
    if (hit && hit.match) { this._tmRight(hit); return; }
    this._tmWrong(hit);
  },

  // The right one: shot down, the others vanish, and the next box comes.
  _tmRight(hit) {
    const tm = this.tm;
    const d = Math.hypot(hit.x - this.playerPos[0], hit.y - this.playerPos[1]);
    for (const e of tm.enemies) if (e.voice && e.voice.busy) e.voice.fadeout(120);
    this._later(d * 0.015, 'explosion', [hit.x, hit.y]);
    const vanish = this._tmName(TM_VANISH);
    if (vanish) this._later(TM_VANISH_AFTER, vanish);
    tm.enemies = [];
    tm.solved += 1;
    if (tm.chaos) this.chaosToySolved = (this.chaosToySolved || 0) + 1;
    tm.phase = 'next';
    tm.t = TM_NEXT_HOLD;
  },

  // A wrong one, or nothing: a life (in Chaos, health), and the round goes on.
  _tmWrong(hit) {
    const tm = this.tm;
    const name = this._tmName(TM_WRONG);
    const ends = tm.chaos ? this.towerHp <= TM_CHAOS_WRONG_HEALTH : tm.lives <= 1;
    // (The last one is heard at once: the run is over before a later one would play.)
    if (name && ends) this.audio.play(name, { at: hit ? [hit.x, hit.y] : null, keep: true });
    else if (name) this._later(TM_WRONG_AFTER, name, hit ? [hit.x, hit.y] : null);
    const word = hit ? 'Wrong.' : 'Missed.';
    if (hit) tm.wrong += 1; else tm.missed += 1;
    if (tm.chaos) {
      if (this._chaosHurt(TM_CHAOS_WRONG_HEALTH, 'toy')) return;
      if (!this.towerLowWarned || this.towerHp > 35) this.tts.speak(word, { interrupt: true });
      return;
    }
    tm.lives -= 1;
    if (tm.lives <= 0) {
      tm.lives = 0;
      tm.dead = true;
      this.triggerGameOver();
      return;
    }
    this.tts.speak(`${word} ${tm.lives} ${plural(tm.lives, 'life', 'lives')} left.`, { interrupt: true });
  },

  // ---------------------------------------------------------------- walking
  // As in Battle, the way you face; but while a box is open and its enemies out, you
  // stand where you are (a step only buzzes).
  _tmStep(g) {
    const tm = this.tm;
    if (tm.phase !== 'box') { this.audio.play('boundary'); return; }
    const f = forwardOf(this.tn.face);
    const dir = g === 'up' ? f : [-f[0], -f[1]];
    this.playerFacing = f;
    this._walkArena(dir, TM_STEP);
    this._tmUpdateBeacon();
  },

  // ---------------------------------------------------------------- the frame
  updateToyMemory(dt) {
    const tm = this.tm;
    if (!tm || this.isPaused || tm.dead || tm.done) return;
    tm.shotT = Math.max(0, tm.shotT - dt);
    // Chaos's clock runs as usual; Toy Memory itself has none.
    if (tm.chaos) {
      if (this._advanceTimer(dt)) return;
      if (this.state !== STATE || this.tm !== tm) return;
    }
    if (tm.phase === 'box') { this._tmUpdateBeacon(); return; }
    if (tm.phase === 'round') { this._tmUpdateRound(dt); return; }
    tm.t -= dt;
    if (tm.t > 0) return;
    if (tm.phase === 'open') this._tmPlayToy();
    else if (tm.phase === 'toy') { tm.phase = 'round'; tm.turn = 0; tm.t = 0; this._tmUpdateRound(0); }
    else if (tm.phase === 'next') {
      if (tm.chaos && tm.solved >= tm.quota) { tm.done = true; this.nextLevel(); return; }
      this._tmNewBox();
    }
  },

  // Double tap: the lives and the boxes solved (never the toy); in Chaos, the boxes solved
  // and wanted, then health, the clock and the points.
  _tmReport() {
    const tm = this.tm;
    if (tm.chaos) {
      this._report(tm.solved >= tm.quota ? `All ${tm.quota} boxes.` : `${tm.solved} of ${tm.quota} boxes.`, true);
      return;
    }
    this._report(`Boxes: ${tm.solved}. ${tm.lives} ${plural(tm.lives, 'life', 'lives')} left.`);
  },

  // Chaos (8.2.0, chaos.js _setupChaosLevel): a Toy Memory level.
  _chaosSetupToyMemory() {
    this.chaosToyCount = (this.chaosToyCount || 0) + 1;
    const adopt = this.chaosAdopt;
    this.chaosAdopt = null;
    this.tm = null;
    this._tmBegin({ chaos: true, quota: chaosBoxes(this.chaosToyCount), adopt: adopt && adopt[1] ? adopt[1] : null });
  },

  // Everything of a run stopped.
  _tmStopAll() {
    const tm = this.tm;
    if (!tm) return;
    this._tmStopBeacon();
    for (const e of tm.enemies) if (e.voice && e.voice.busy) e.voice.stop();
    if (tm.amb && tm.amb.voice) tm.amb.voice.stop();
    tm.amb = null;
    tm.stopped = true;
    for (const stem of TM_RECORDINGS) this.audio.pins.delete(`toymemory:${stem}`);
  },
};

// ------------------------------------------------------------------ help
const HELP_SECTIONS = [
  ['Toy Memory', [
    { title: 'Toy Memory', sound: null, desc: 'Toy Memory is a gentle mode of its own inside Battle, new in 8.2.0, on the website only: choose Battle Mode on the main menu, then Toy Memory. It is a memory game, meant to be relaxing, not hard. There is no clock, no crowd, and nothing can hurt you. A calm fountain plays all the while. Somewhere near you is a box, playing a soft music box tune from where it stands. Turn toward it and walk into it, as you turn and walk in Battle (see General Turning): it is always a whole number of steps away along one of the quick turn\'s steps, so flick until the music box is straight ahead and walk straight on. Walking into the box opens it, and a toy inside plays the sound of one of Battle\'s enemies, once only. It is never played again, so listen carefully and remember it: that is the whole game. Double tap for your lives and the boxes you have solved.' },
    { title: 'Toy Memory The Enemies', sound: null, desc: 'A moment after the toy, enemies appear around you, five steps away. They never move, never chase you and never hit you. They sound one at a time, each from where it stands, always in the same order, going round you clockwise, with a short pause after the last one before the round starts again, and it goes on repeating until you shoot. Each enemy has a different one of Battle\'s enemy sounds, and exactly one of them is the sound the toy played. Turn to face that one and tap with two fingers to fire. There are two enemies for your first three boxes, then one more every three boxes, up to six. While the enemies are out you stand where you are: a step only buzzes, so just turn and listen.' },
    { title: 'Toy Memory The Laser', sound: null, desc: 'In Toy Memory the laser is much narrower than in Battle: it hits only an enemy almost straight ahead of you, within about twelve degrees, and never one behind you. The enemies always stand on the quick turn\'s steps, every thirty degrees round you, and never two side by side, so a flick lines you up exactly with an enemy, and a well aimed shot can only ever hit one. The ticks for north, east, south and west help you count your flicks. An enemy straight ahead of you sounds in the middle, between your ears.' },
    { title: 'Toy Memory Lives and Score', sound: null, desc: 'You have three lives. Shoot an enemy that is not the toy\'s, and you hear a soft buzz from where it stands and lose a life; shoot and hit nothing, and you hear the buzz in front of you and lose a life too. Either way the round goes on: the enemies stay and keep taking their turns until you hit the right one, or run out of lives. Lose your last life and the run is over. Hit the right one and it is shot down, the others vanish with a twinkle, and a moment later the next box plays its music box somewhere near you. Your score is the number of boxes you solve, and Toy Memory has its own high score board, right after Battle\'s.' },
    { title: 'Toy Memory in Chaos Mode', sound: null, desc: 'Chaos Mode has Toy Memory levels too: you know one by the fountain and the music box. Solve a number of boxes to finish the level: two the first time in a run, one more each time after, up to five. The rules are the same, except that a wrong shot or a miss costs 15 health from the chaos run\'s one health bar instead of a life (see Chaos Health), and the chaos clock keeps running as usual all the while, so do not wait too long. The enemies grow with all the boxes you have solved in the run\'s Toy Memory levels together: two at first, one more every three boxes, up to six. If a wrong shot leaves you with no health, or the clock runs out, the run is over. Double tap for the boxes solved and wanted, then your health, the clock and the points.' },
  ]],
];

const HELP_DEMOS = [
  ['Demos, Toy Memory', [
    { title: 'Toy Memory Demos', sound: null, desc: 'The sounds of Toy Memory. The toys and the enemies are Battle\'s own enemy sounds: hear them in the Battle demos.' },
    { title: 'Fountain', sound: TM_AMBIENCE, desc: 'The calm fountain that plays all through Toy Memory.' },
    { title: 'Music Box', sound: TM_BEACON, desc: 'The music box that marks where the box is: walk into it.' },
    { title: 'Box Opening', sound: TM_OPEN, desc: 'The box opening. The toy inside plays a moment later, once only.' },
  ]],
];

// ------------------------------------------------------------------ the Battle menu
// Web 8.2.0 (Russell, 27 November 2026): Battle Mode on the main menu opens a small menu
// of its own, Battle or its sub mode Toy Memory, and Back (as The Abyss's, abyss.js).
export const S_BATTLE_MENU = 'battle_menu';
export const BATTLE_MENU = [['battle', 'Battle'], ['toymemory', 'Toy Memory'], ['back', 'Back to the main menu']];

function battleMenuInput(game, g) {
  const toMain = () => {
    game.state = 'menu';
    game._refreshMenu();
    game.tts.speak('Main Menu. ' + game.menuOptions[game.menuIndex], { interrupt: true });
  };
  if (g === 'back') { toMain(); return; }
  if (g === 'up' || g === 'down') {
    const n = BATTLE_MENU.length;
    game.battleMenuIndex = ((game.battleMenuIndex || 0) + (g === 'up' ? -1 : 1) + n) % n;
    game.audio.play('menu_move');
    game.tts.speak(BATTLE_MENU[game.battleMenuIndex][1], { interrupt: true });
    return;
  }
  if (g === 'enter') {
    const [k] = BATTLE_MENU[game.battleMenuIndex || 0];
    game.audio.play('menu_move');
    if (k === 'back') toMain();
    else if (k === 'toymemory') game.startToyMemory();
    else game.startGame('battle');
  }
}

// ------------------------------------------------------------------ the mode
function reset(game) {
  if (game.tm) game._tmStopAll();
  game.tm = null;
  // (A chaos run's Toy Memory counts start afresh with every run: chaos.js startChaos
  // resets the game state before it begins.)
  game.chaosToyCount = 0;
  game.chaosToySolved = 0;
}

function input(game, g) {
  const tm = game.tm;
  if (!tm) return;
  if (g === 'clock') {
    // Chaos's clock; Toy Memory itself has none, so its report.
    if (tm.chaos) { const secs = Math.trunc(game.timeLeft); game.tts.speak(`${secs} second${secs === 1 ? '' : 's'} remaining.`, { interrupt: true }); }
    else game._tmReport();
    return;
  }
  if (g === 'enter') { game._tmReport(); return; }
  if (tm.dead || tm.done) return;
  if (g === 'space') { game._tmFire(); return; }
  if (g === 'left' || g === 'right') { game._turnQuick(g === 'right' ? 1 : -1); return; }
  if (g === 'up' || g === 'down') game._tmStep(g);
}

export default {
  // (No main menu entry of its own: Battle Mode's menu offers it, above.)
  menu: [],
  statKey: 'toymemory',
  inputStates: { [S_BATTLE_MENU]: battleMenuInput },
  statusFor: { [S_BATTLE_MENU]: (game) => 'Battle Mode: ' + BATTLE_MENU[game.battleMenuIndex || 0][1] },
  playStates: [STATE],
  mixin,
  init(game) {
    game.tm = null;
  },
  reset,
  update(game, dt) { game.updateToyMemory(dt); },
  input,
  stopAll(game) { if (game.tm) game._tmStopAll(); },
  finish(game) {
    const n = game.tm ? game.tm.solved : 0;
    return { key: BOARD, score: n, message: `Game Over. You solved ${n} ${plural(n, 'box', 'boxes')}. ` };
  },
  room() { return TM_ROOM; },
  turns(game) { return game.state === STATE; },
  blockStride(game) { return !!(game.tm && (game.tm.phase !== 'box' || game.tm.dead)); },
  strideSig(game) { const tm = game.tm; return tm ? `${tm.boxes}|${tm.phase}` : ''; },
  status(game) {
    const tm = game.tm;
    if (!tm) return 'Toy Memory.';
    return `Toy Memory. ${tm.solved} ${plural(tm.solved, 'box', 'boxes')} solved. ${tm.lives} ${plural(tm.lives, 'life', 'lives')}.`;
  },
  boards: [{ key: BOARD, label: 'Toy Memory', fmt: (v) => `${v} ${v === 1 ? 'box' : 'boxes'}` }],
  help: { sections: HELP_SECTIONS, demos: HELP_DEMOS },
};
