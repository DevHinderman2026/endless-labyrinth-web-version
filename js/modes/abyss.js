// The Abyss (web 6.2.0, Russell's design, 20 November 2026; website only).
//
// A huge, endless abyss, in the spirit of Papa Sangre II. There are no walls and no
// edge, and the whole floor is broken glass: there is no silent floor anywhere, so
// every step you take can be heard. Creatures live all through it. They are blind,
// like you, and hunt by sound, and they move only while you move: walk, and the
// ones that hear you creep toward the sound; run, and they charge (a little slower
// than your run) and hear you from twice as far. Stop, and they stop hunting you
// and go back to wandering, very slowly and aimlessly, never toward you, and
// always veering off before they come within three steps of you (Russell, 20
// November 2026: they hunt by sound, so one that has not heard you cannot stumble
// into you). Standing still never gets you away; it only holds them off. (6.3.4 had
// them go on to where they last heard you; 6.3.5 takes that back, Russell, 21
// November 2026: you could not outrun them, walking or running.)
//
// Lightning is your cover. Every few seconds it strikes somewhere in the abyss,
// really loud, and the creatures run toward the strike; for five seconds after it
// your steps are not heard. Strikes come every 6 to 10 seconds at first and spread
// out as you go, never more than 20 seconds apart.
//
// The goal: smash as many glass cases as you can before the clock runs out. A case
// hums, and knocks as you close in (as in Ultimate Mode); a bell says when you are
// beside it and facing it, and your attack smashes it. Smashing is loud: every
// creature that hears it charges you for about 3 seconds (unless the lightning's
// cover is still on). Each case gives time: 10 seconds mostly, sometimes 20 or 30,
// and very rarely 60. About one case in four also holds lightning (one in six until
// 6.3.3): as it breaks, a strike lands somewhere in the abyss and the creatures run to
// it instead of you; and about one in ten an extra life (6.3.3, not in Chaos).
// The clock starts at 60 seconds. You have three lives: a catch costs one, and the
// creature that caught you is thrown far off. Every three cases one more creature
// wakes and the lightning comes a little less often. The score is the cases smashed.
//
// Chaos Mode has Abyss stages too (js/modes/chaos.js): lightning strikes the moment
// you arrive, a quota of cases (3 or 4, growing each visit), then everything else
// goes and only an exit is heard; a catch costs 25 of the chaos run's one health bar (6.3.0) for the whole
// chaos run, and its cases give chaos time.
//
// (The abyss is endless, but phones are not: creatures and cases appear around you
// as you travel and go once they are far behind, with only a few heard at once.)
//
// The creature's sounds are its own (Pixabay, AlesiaDavina; web-only, in the abyss
// pack): "Monster Sniffing Sound Effect - Deep Beast Breathing" while it wanders, and
// "Hungry Monster Growl: Deep Demonic Beast Breathing SFX" while it hunts, each cut
// to a seamless loop (Developer Tools/Web Packs/web-only/abyss.json).

import { aliasRecording } from './events/sounds.js';
import { RULES } from '../sound-rules.js';
import {
  CASE_SOUND, CASE_CHIME, CASE_SMASH, CASE_GAIN, CASE_REACH, CASE_REARM, CASE_LINED, CASE_UNLINED,
  CASE_KNOCK, CASE_KNOCK_RANGE, CASE_KNOCK_EVERY, CASE_KNOCK_LEVEL, AMBIENCE_LEVEL, BACKGROUND_SEND,
} from './ultimate.js';

export const STATE = 'abyss';
export const BOARD = 'abyss';

// ------------------------------------------------------------------ constants
export const AB_STEP = 3.0;                     // one step, in the game's units
// (6.3.4, Russell, 21 November 2026: "the abyss levels are too easy".) The clock starts at
// 45 seconds (was 60) and a case gives 10 or 20 seconds (no more 30 or 60); Chaos's Abyss
// stages keep the old rewards for the chaos clock (AB_CHAOS_REWARDS).
export const AB_START_TIME = 45.0;              // the clock at the start of a run
export const AB_LIVES = 3;
// A case's time, and how often: 10 mostly, sometimes 20.
export const AB_REWARDS = [[10, 0.7], [20, 0.3]];
// In Chaos's Abyss stages: 10 mostly, sometimes 20 or 30, very rarely 60 (as before 6.3.4).
export const AB_CHAOS_REWARDS = [[10, 0.62], [20, 0.25], [30, 0.10], [60, 0.03]];
// Web 6.3.3 (Russell, 21 November 2026): one case in four also holds lightning (was one
// in six), here and in Chaos's Abyss stages; and in The Abyss itself, not Chaos, one case
// in ten (one in twenty from 6.3.4) also holds an extra life, with no limit on lives, a
// rare reward for a strong run.
export const AB_LIGHTNING_CASE = 1 / 4;         // a case that also holds lightning
export const AB_LIFE_CASE = 1 / 20;             // a case that also holds an extra life (The Abyss only; 6.3.4: was 1 in 10)
export const AB_LIFE_SOUND = 'event_pickup_heart';   // the heart the events play for an extra life
// Lightning: every 6 to 10 seconds at first; each tier (three cases) a second more at
// the short end and two at the long end, never more than 20 seconds apart (6.3.3 made it
// 15; 6.3.4 put it back, Russell, 21 November 2026, as the Abyss had become too easy). (6.3.1
// kept it at 6 to 10 all the way; 6.3.2 puts the growth back, Russell, 20 November
// 2026: with lightning that often, the clock could climb to four minutes, so it
// never got harder. The creatures' spacing from 6.3.1 stays.)
export const AB_STRIKE_GAP = [6.0, 10.0];
export const AB_STRIKE_GROW = [1.0, 2.0];
export const AB_STRIKE_MAX = 20.0;              // (6.3.4: back to 20; 6.3.3 made it 15)
export const AB_COVER = 5.0;                    // seconds after a strike that your steps are not heard
// (6.3.1, Russell: "they're too close, so when they run, they're actually running
// into each other most of the time ... the lightning actually doesn't send them
// away.") The strike lands 15 to 25 steps off (it was 8 to 15), every creature
// awake hears it and runs, each to a spot of its own around it, and the creatures
// keep three steps apart from one another wherever they go.
export const AB_STRIKE_DIST = [45.0, 75.0];     // units from you that it lands (15 to 25 steps)
export const AB_STRIKE_PULL = 170.0;            // creatures this near the strike run to it (every one about)
export const AB_STRIKE_SPREAD = [6.0, 18.0];    // units from the strike that each creature makes for
export const AB_APART = 9.0;                    // units (three steps): how close two creatures may come
export const AB_SMASH_CHARGE = 3.0;             // seconds every creature charges you after a smash
export const AB_SMASH_HEAR = 60.0;              // units: how far a smash is heard
// The creatures: three at first, one more every three cases, at most seven.
export const AB_TIER_CASES = 3;
export const AB_CREATURES = [3, 1, 7];
// Speeds in steps a minute. Your run is 280 (game.js RUN_STEPS_PER_MINUTE): a
// charging creature is a little slower, as in Find the Voice; a creeping one far slower.
export const AB_CHARGE_SPM = 220;
export const AB_CREEP_SPM = 90;
export const AB_WALK_HEAR = 30.0;               // units (ten steps): how far a walking step is heard
export const AB_RUN_HEAR = 60.0;                // units (twenty steps): a running step
export const AB_WALK_MOVE = 0.6;                // seconds a creature creeps after each walking step it hears
export const AB_RUN_MOVE = 0.3;                 // seconds it charges after each running step (they come every 0.21)
// Wandering (6.2.0, Russell, 20 November 2026): a creature that is not hunting drifts
// very slowly in a direction of its own, changing it now and then, never toward you,
// and turns away before it comes within three steps of you.
export const AB_WANDER_SPM = 30;
export const AB_WANDER_TURN = [3.0, 6.0];       // seconds between changes of direction
export const AB_WANDER_KEEP = 9.0;              // units (three steps): it never wanders nearer to you than this
export const AB_WANDER_STEP_GAIN = 0.45;        // its footsteps while it wanders: faint
export const AB_CATCH = 1.5;                    // units: this near, it has you
export const AB_GRACE = 2.0;                    // seconds after a catch before another can catch you
export const AB_CREATURE_SPAWN = [45.0, 75.0];  // units from you that a creature wakes (15 to 25 steps; 6.3.1, was 10 to 20)
export const AB_SPAWN_APART = 15.0;             // units (five steps): never this near another creature, or a case
export const AB_CREATURE_FAR = 110.0;           // further off than this, it goes (and another appears)
export const AB_CREATURE_RANGE = 75.0;          // heard within this many units (6.3.1: as far as one wakes)
export const AB_CREATURE_GAIN = 1.0;            // moving, at a battle enemy's loudness
export const AB_IDLE_GAIN = 0.55;               // still: quieter
export const AB_STEP_GAIN = 0.9;                // its footsteps on the glass
export const AB_THROW_FAR = 45.0;               // after a catch it is thrown at least this far from you
// The cases: three around you at a time. Web 6.3.3 (Russell, 21 November 2026: with all
// three knocking from three directions, centring one could take more than 40 seconds,
// even at the start): only one knocks, the nearest, kept until it is smashed or another
// is AB_KNOCK_SWAP nearer; the others only hum, softer (AB_HUM_OTHERS).
export const AB_CASES_AROUND = 3;
export const AB_KNOCK_SWAP = 6.0;               // units (two steps): how much nearer another case must be to take the knocking over
export const AB_HUM_OTHERS = 0.6;               // the hum of a case that is not the one knocking
export const AB_CASE_SPAWN = [25.0, 55.0];
export const AB_CASE_FAR = 110.0;
export const AB_CASE_CLEAR = 15.0;              // no creature this near a new case
export const AB_CASE_RANGE = 70.0;              // its hum is heard within this many units
// Chaos: the quota of cases, and the exit.
export const AB_CHAOS_QUOTA_FIRST = [3, 4];
export const AB_CHAOS_QUOTA_GROW = 1;
export const AB_CHAOS_QUOTA_MAX = 8;
export const AB_EXIT_RANGE = [15.0, 30.0];
export const AB_EXIT_REACH = 3.0;
// Sounds.
export const AB_BACKGROUND = 'evt_amb_howling_wind';   // the abyss's air (no thunder of its own in it)
// Three real thunderclaps (Pixabay, web-only, in the abyss pack), one at random each
// strike, never the same twice running. (Four until 6.3.3, when Russell dropped the
// second, freesound_community's "Thunder Clap", which sounded dry to him; it is no
// longer in the pack. Thunder Strike, the one he chose as better, stays.)
export const AB_THUNDERS = ['ab_thunder_1', 'ab_thunder_3', 'ab_thunder_4'];
export const AB_THUNDER = AB_THUNDERS[0];
export const AB_IDLE = 'ab_creature_still';     // a wandering creature: sniffing, deep breathing
export const AB_GROWL = 'ab_creature_hunt';     // a hunting creature: a hungry growl
export const AB_STEPS_GLASS = ['ut_glass_step_1', 'ut_glass_step_2', 'ut_glass_step_3', 'ut_glass_step_4'];
// No echo at all (Russell, 20 November 2026: with the battle arena's echo it sounded
// like a large hall, not an endless space with no walls): open air, as the events'
// 'open' room, where nothing bounces back and sounds only fade with distance.
export const AB_ROOM = 'open';
// (6.2.0 fix, Russell, 20 November 2026: "I can't even hear lightning at all"; "they
// have to be thunderclaps".) The events' thunder recording was a ten-second rumble
// that swelled in after a moment, lost under the wind, the cases' hum and the
// creatures, and being long it was let go from memory between strikes and came late.
// Now each strike is a real thunderclap, cut to its loud moment at full level, the
// background and the cases' hum dip under it for a moment, and the recordings the
// mode needs are held in memory for the whole run.
export const AB_DUCK = [1.2, 0.8];              // seconds held down, then seconds coming back
export const AB_DUCK_TO = 0.35;                 // the background and the hums, under a strike

// ------------------------------------------------------------------ helpers
const rand = Math.random;
const uniform = (a, b) => a + (b - a) * rand();
const randint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const choice = (arr) => arr[Math.floor(rand() * arr.length)];
const plural = (n, word, many = word + 's') => (n === 1 ? word : many);
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const stepsPerSecond = (spm) => spm / 60 * AB_STEP;

function pointToSegment(x, y, a, b) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const span = dx * dx + dy * dy;
  const t = span <= 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / span));
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

// A case's time, by AB_REWARDS.
export function rollReward(r = rand(), table = AB_REWARDS) {
  for (const [v, share] of table) { r -= share; if (r < 0) return v; }
  return table[0][0];
}

// How hard it is: one tier for every three cases smashed.
export function tierOf(smashed) { return Math.floor(Math.max(0, smashed) / AB_TIER_CASES); }
export function creaturesFor(smashed) { return Math.min(AB_CREATURES[2], AB_CREATURES[0] + AB_CREATURES[1] * tierOf(smashed)); }
export function strikeGap(smashed) {
  const t = tierOf(smashed);
  const lo = Math.min(AB_STRIKE_MAX, AB_STRIKE_GAP[0] + AB_STRIKE_GROW[0] * t);
  const hi = Math.min(AB_STRIKE_MAX, AB_STRIKE_GAP[1] + AB_STRIKE_GROW[1] * t);
  return [lo, Math.max(lo, hi)];
}

// ------------------------------------------------------------------ the game's methods
const mixin = {
  startAbyss() {
    this.state = STATE;
    this.resetGameState();
    this.state = STATE;
    this._syncRoom();
    this._wake(true);
    if (this.ambienceChannel) { this.ambienceChannel.stop(); this.ambienceChannel = null; }
    if (this.beatChannel) { this.beatChannel.stop(); this.beatChannel = null; }
    this.timeLeft = AB_START_TIME;
    this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / 30.0) * 30.0;
    this.thirtySecAnnounced = this.timeLeft <= 30.0;
    this.lastBeepSecond = -1;
    this._abBegin({ chaos: false, quota: 0, lives: AB_LIVES });
  },

  // A run, or a chaos stage (quota: the cases wanted; 0 for a run of its own).
  _abBegin({ chaos, quota, lives, adopt = null }) {
    this.abNames = new Map(this._abNames());
    // Held in memory for the whole run (unpinned in _abStopAll), so no strike or
    // creature waits for its recording to be decoded again.
    for (const [stem, name] of this.abNames) if (name) this.audio.prepare(name, stem === AB_BACKGROUND ? null : `abyss:${stem}`);
    this.playerPos = [0.0, 0.0];
    this.arenaLimit = 1e9;
    this.stride = null;
    const ab = this.ab = {
      run: this.runId, chaos, quota, lives, smashed: 0,
      creatures: [], cases: [], steps: [],
      cover: 0, grace: 0, strike: null, duck: 0,
      nextStrike: uniform(...strikeGap(0)),
      amb: null, exit: null, done: false,
    };
    this._abBackground(adopt);
    this._abFillCases();
    this._abFillCreatures();
    // In chaos, lightning strikes the moment you arrive, so you know at once where you
    // are and that you must move (Russell, 20 November 2026).
    if (chaos) this._abStrike();
  },

  // The recordings the mode plays, under the names their sound rules want.
  _abNames() {
    const a = this.audio;
    return [
      [AB_BACKGROUND, aliasRecording(a, AB_BACKGROUND, `event_amb_file_${AB_BACKGROUND}`)],
      ...AB_THUNDERS.map((t) => [t, aliasRecording(a, t, `event_sfx_file_${t}`)]),
      [AB_IDLE, aliasRecording(a, AB_IDLE, `event_beacon_hazard_file_${AB_IDLE}`)],
      [AB_GROWL, aliasRecording(a, AB_GROWL, `event_beacon_hazard_file_${AB_GROWL}`)],
    ];
  },

  _abName(stem) {
    if (!this.abNames) this.abNames = new Map(this._abNames());
    return this.abNames.get(stem) || null;
  },

  _abBackground(adopt = null) {
    const ab = this.ab;
    const name = this._abName(AB_BACKGROUND);
    let voice = null;
    if (adopt && adopt.busy && adopt.name === name) { voice = adopt; voice.setVolume(AMBIENCE_LEVEL); }
    else {
      if (adopt) adopt.fadeout(400);
      voice = name ? this.audio.play(name, { loops: -1, volume: AMBIENCE_LEVEL, fadeMs: 400, send: BACKGROUND_SEND }) : null;
    }
    ab.amb = { name, voice };
  },

  // How loud a thing is from where you stand (as the battle's levels, over a range
  // of its own, silent beyond it): [left, right, distance].
  _abLevels(pos, gain, range) {
    const dx = pos[0] - this.playerPos[0];
    const dy = pos[1] - this.playerPos[1];
    const d = Math.hypot(dx, dy);
    const pan = d > 0 ? dx / d : 0.0;
    const v = Math.min(1.0, Math.max(0.0, 1.0 - d / range) * gain);
    return [v * (1.0 - Math.max(0.0, pan)), v * (1.0 - Math.max(0.0, -pan)), d];
  },

  // A spot lo to hi from you, at least `apart` from every spot in `away`; failing
  // that, the try that came furthest from them.
  _abSpot(lo, hi, away = [], apart = 0, tries = 200) {
    const [px, py] = this.playerPos;
    let best = null; let bestGap = -1;
    for (let i = 0; i < tries; i++) {
      const a = uniform(0, Math.PI * 2); const d = uniform(lo, hi);
      const p = [px + Math.sin(a) * d, py - Math.cos(a) * d];
      const gap = away.length ? Math.min(...away.map((q) => dist2(p, q))) : 1e9;
      if (gap >= apart) return p;
      if (gap > bestGap) { best = p; bestGap = gap; }
    }
    return best;
  },

  // ---------------------------------------------------------------- the creatures
  _abNewCreature(lo = AB_CREATURE_SPAWN[0], hi = AB_CREATURE_SPAWN[1]) {
    const ab = this.ab;
    const away = [...ab.cases.filter((c) => !c.smashed).map((c) => [c.x, c.y]), ...ab.creatures.map((o) => [o.x, o.y])];
    const [x, y] = this._abSpot(lo, hi, away, Math.max(AB_CASE_CLEAR, AB_SPAWN_APART));
    const c = { x, y, charge: 0, storm: 0, move: 0, moveSpeed: 0, target: null, knock: AB_STEP, voice: null, note: null, moving: false,
      heading: uniform(0, Math.PI * 2), turnIn: uniform(...AB_WANDER_TURN), wandering: false };
    ab.creatures.push(c);
    return c;
  },

  // As many creatures as the cases smashed call for, none too far off.
  _abFillCreatures() {
    const ab = this.ab;
    for (const c of [...ab.creatures]) {
      if (dist2([c.x, c.y], this.playerPos) > AB_CREATURE_FAR) this._abDropCreature(c);
    }
    while (ab.creatures.length < creaturesFor(ab.smashed)) this._abNewCreature();
  },

  _abDropCreature(c) {
    const ab = this.ab;
    if (c.voice) { c.voice.fadeout(300); c.voice = null; }
    ab.creatures = ab.creatures.filter((x) => x !== c);
  },

  // Its sound: a growl while it moves, its quieter sound while it is still; nothing
  // at all from beyond hearing.
  _abCreatureSound(c) {
    const [l, r, d] = this._abLevels([c.x, c.y], c.moving ? AB_CREATURE_GAIN : AB_IDLE_GAIN, AB_CREATURE_RANGE);
    if (d > AB_CREATURE_RANGE) {
      if (c.voice) { c.voice.fadeout(300); c.voice = null; c.note = null; }
      return;
    }
    const want = this._abName(c.moving ? AB_GROWL : AB_IDLE);
    if (c.note !== want || !(c.voice && c.voice.busy)) {
      if (c.voice) c.voice.fadeout(150);
      c.voice = want ? this.audio.play(want, { loops: -1, volume: 0.0, fadeMs: 150 }) : null;
      c.note = want;
    }
    if (c.voice) c.voice.setVolume(l, r, this._behind([c.x, c.y]));
  },

  // A step of yours, heard by every creature in range (unless the lightning covers
  // it): walking, they creep toward it a moment; running, they charge.
  _abHeard(running) {
    const ab = this.ab;
    if (ab.cover > 0) return;
    const range = running ? AB_RUN_HEAR : AB_WALK_HEAR;
    for (const c of ab.creatures) {
      if (c.storm > 0 || c.charge > 0) continue;
      if (dist2([c.x, c.y], this.playerPos) > range) continue;
      c.move = running ? AB_RUN_MOVE : AB_WALK_MOVE;
      c.moveSpeed = stepsPerSecond(running ? AB_CHARGE_SPM : AB_CREEP_SPM);
      c.target = [...this.playerPos];
    }
  },

  // A wandering creature's next little move: along its own heading, turned now and
  // then; never toward you, and never nearer to you than AB_WANDER_KEEP.
  _abWander(c, dt) {
    c.turnIn -= dt;
    if (c.turnIn <= 0) { c.heading = uniform(0, Math.PI * 2); c.turnIn = uniform(...AB_WANDER_TURN); }
    const px = this.playerPos[0]; const py = this.playerPos[1];
    const tx = px - c.x; const ty = py - c.y;
    const dNow = Math.hypot(tx, ty);
    let hx = Math.sin(c.heading); let hy = -Math.cos(c.heading);
    // Heading anywhere toward you: it turns to go along, or away from, you instead.
    if (dNow > 1e-6 && hx * tx + hy * ty > 0) {
      const ax = -tx / dNow; const ay = -ty / dNow;               // straight away from you
      const side = hx * ty - hy * tx >= 0 ? 1 : -1;                // the side it was already drifting to
      hx = 0.5 * ax + 0.866 * side * -ay; hy = 0.5 * ay + 0.866 * side * ax;
      c.heading = Math.atan2(hx, -hy);
    }
    const step = stepsPerSecond(AB_WANDER_SPM) * dt;
    const nx = c.x + hx * step; const ny = c.y + hy * step;
    if (Math.hypot(nx - px, ny - py) < AB_WANDER_KEEP && Math.hypot(nx - px, ny - py) < dNow) return 0;
    c.x = nx; c.y = ny;
    return step;
  },

  // Every frame: each creature charges (a smash), runs to the lightning, hunts the
  // last step it heard, or wanders. Then, whether it has you.
  _abUpdateCreatures(dt) {
    const ab = this.ab;
    for (const c of ab.creatures) {
      let target = null; let speed = 0;
      if (c.charge > 0) { c.charge -= dt; target = this.playerPos; speed = stepsPerSecond(AB_CHARGE_SPM); }
      else if (c.storm > 0) { c.storm -= dt; target = c.stormSpot || ab.strike; speed = stepsPerSecond(AB_CHARGE_SPM); }
      else if (c.move > 0) { c.move -= dt; target = c.target; speed = c.moveSpeed; }
      let moved = 0;
      if (target) {
        const dx = target[0] - c.x; const dy = target[1] - c.y;
        const d = Math.hypot(dx, dy);
        const step = Math.min(d, speed * dt);
        if (d > 1e-6 && step > 0) { c.x += dx / d * step; c.y += dy / d * step; moved = step; }
      }
      c.moving = moved > 0;
      c.wandering = false;
      if (!target) { moved = this._abWander(c, dt); c.wandering = moved > 0; }
      // A footstep on the glass for every step it takes, from where it is (faint
      // while it only wanders).
      if (moved > 0) {
        c.knock += moved;
        if (c.knock >= AB_STEP) {
          c.knock -= AB_STEP;
          const bank = AB_STEPS_GLASS.filter((n) => this.audio.has(n));
          const [l, r, d] = this._abLevels([c.x, c.y], c.wandering ? AB_STEP_GAIN * AB_WANDER_STEP_GAIN : AB_STEP_GAIN, AB_CREATURE_RANGE);
          if (bank.length && d < AB_CREATURE_RANGE) this.audio.play(choice(bank), { at: [c.x, c.y], volume: Math.max(l, r) });
        }
      }
      this._abCreatureSound(c);
    }
    this._abKeepApart();
    // It has you: this near now, or you walked through where it is.
    if (ab.grace > 0) return;
    for (const c of ab.creatures) {
      let near = dist2([c.x, c.y], this.playerPos);
      for (const [a, b] of ab.steps) near = Math.min(near, pointToSegment(c.x, c.y, a, b));
      if (near < AB_CATCH) { this._abCaught(c); return; }
    }
  },

  _abCaught(c) {
    const ab = this.ab;
    this.audio.play('player_hit', { keep: true });
    this.stride = null;
    // In chaos (web 6.3.0) a catch costs 25 of the run's one health bar, not a life.
    if (ab.chaos) {
      if (this._chaosHurt(this._chaosCatchDamage(), 'catch')) { ab.lost = true; return; }
    } else {
      ab.lives -= 1;
      if (ab.lives <= 0) {
        ab.lost = true;
        this.triggerGameOver();
        return;
      }
    }
    // Thrown far off; every other creature stops hunting (it wanders again); a moment's grace.
    const others = ab.creatures.filter((x) => x !== c).map((x) => [x.x, x.y]);
    [c.x, c.y] = this._abSpot(AB_THROW_FAR, AB_THROW_FAR + 20, others, 10);
    for (const x of ab.creatures) { x.charge = 0; x.storm = 0; x.move = 0; x.moving = false; }
    ab.grace = AB_GRACE;
    if (ab.chaos) { if (!this.towerLowWarned || this.towerHp > 35) this.tts.speak('Caught.', { interrupt: true }); }
    else this.tts.speak(`Caught. ${ab.lives} ${plural(ab.lives, 'life', 'lives')} left.`, { interrupt: true });
  },

  // No two creatures nearer than AB_APART (three steps): any two that are, are eased
  // apart along the line between them, each half the way (6.3.1).
  _abKeepApart() {
    const cs = this.ab.creatures;
    // (A few passes: easing one pair apart can bring another together.)
    for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i]; const b = cs[j];
        let dx = b.x - a.x; let dy = b.y - a.y; let d = Math.hypot(dx, dy);
        if (d >= AB_APART) continue;
        if (d < 1e-6) { const t = uniform(0, Math.PI * 2); dx = Math.sin(t); dy = -Math.cos(t); d = 1; }
        const gap = AB_APART - Math.hypot(b.x - a.x, b.y - a.y);
        // A creature that is not hunting you (wandering, still, or running to the
        // lightning) is never eased nearer to you than it may wander (AB_WANDER_KEEP),
        // so keeping apart can never walk it into you: the other one moves instead.
        const ux = dx / d; const uy = dy / d;
        const blocked = (c, sx, sy) => {
          if (c.charge > 0 || c.move > 0) return false;
          const now = dist2([c.x, c.y], this.playerPos);
          const then = dist2([c.x + sx, c.y + sy], this.playerPos);
          return then < AB_WANDER_KEEP && then < now;
        };
        let pa = gap / 2; let pb = gap / 2;
        const aStuck = blocked(a, -ux * pa, -uy * pa); const bStuck = blocked(b, ux * pb, uy * pb);
        if (aStuck && bStuck) continue;
        if (aStuck) { pa = 0; pb = gap; } else if (bStuck) { pb = 0; pa = gap; }
        a.x -= ux * pa; a.y -= uy * pa;
        b.x += ux * pb; b.y += uy * pb;
        moved = true;
      }
    }
    if (!moved) break;
    }
  },

  // Each creature drawn to a strike makes for a spot of its own around it, AB_APART
  // or more from every other's (of a few tries, the one furthest from the rest).
  _abStormSpots(p, drawn) {
    const taken = [];
    for (const c of drawn) {
      let best = null; let bestGap = -1;
      for (let i = 0; i < 24; i++) {
        const a = uniform(0, Math.PI * 2); const r = uniform(...AB_STRIKE_SPREAD);
        const q = [p[0] + Math.sin(a) * r, p[1] - Math.cos(a) * r];
        const gap = taken.length ? Math.min(...taken.map((t) => dist2(q, t))) : 1e9;
        if (gap >= AB_APART) { best = q; break; }
        if (gap > bestGap) { best = q; bestGap = gap; }
      }
      taken.push(best);
      c.stormSpot = best;
    }
  },

  // ---------------------------------------------------------------- the lightning
  // Where it lands: 45 to 75 units off (15 to 25 steps), chosen so that the creatures it draws do not
  // run past you on the way (of a few tries, the one whose paths keep furthest from you).
  _abStrikeSpot() {
    const ab = this.ab;
    const near = ab.creatures.filter((c) => dist2([c.x, c.y], this.playerPos) < AB_STRIKE_PULL + AB_STRIKE_DIST[1]);
    let best = null; let bestGap = -1;
    for (let i = 0; i < 8; i++) {
      const p = this._abSpot(AB_STRIKE_DIST[0], AB_STRIKE_DIST[1]);
      let gap = 1e9;
      for (const c of near) {
        if (dist2([c.x, c.y], p) > AB_STRIKE_PULL) continue;
        gap = Math.min(gap, pointToSegment(this.playerPos[0], this.playerPos[1], [c.x, c.y], p));
      }
      if (gap > bestGap) { best = p; bestGap = gap; }
    }
    return best;
  },

  _abStrike() {
    const ab = this.ab;
    const p = this._abStrikeSpot();
    ab.strike = p;
    ab.cover = AB_COVER;
    ab.duck = AB_DUCK[0] + AB_DUCK[1];
    const pool = AB_THUNDERS.filter((t) => t !== ab.lastThunder && this._abName(t));
    const pick = pool.length ? choice(pool) : null;
    ab.lastThunder = pick;
    const name = pick && this._abName(pick);
    if (name) this.audio.play(name, { at: p, volume: 1.0, keep: true });
    this._abDuck();
    const drawn = [];
    for (const c of ab.creatures) {
      if (dist2([c.x, c.y], p) > AB_STRIKE_PULL) continue;
      c.storm = AB_COVER; c.charge = 0; c.move = 0;
      drawn.push(c);
    }
    this._abStormSpots(p, drawn);
    ab.nextStrike = uniform(...strikeGap(ab.smashed));
  },

  // Under a strike the background and the cases' hum dip, then come back.
  _abDuckFactor() {
    const ab = this.ab;
    if (!ab || ab.duck <= 0) return 1;
    if (ab.duck > AB_DUCK[1]) return AB_DUCK_TO;
    return AB_DUCK_TO + (1 - AB_DUCK_TO) * (1 - ab.duck / AB_DUCK[1]);
  },

  _abDuck() {
    const ab = this.ab;
    if (ab.amb && ab.amb.voice) ab.amb.voice.setVolume(AMBIENCE_LEVEL * this._abDuckFactor());
  },

  // ---------------------------------------------------------------- the cases
  _abNewCase() {
    const ab = this.ab;
    const away = [...ab.creatures.map((c) => [c.x, c.y]), ...ab.cases.filter((c) => !c.smashed).map((c) => [c.x, c.y])];
    const [x, y] = this._abSpot(AB_CASE_SPAWN[0], AB_CASE_SPAWN[1], away, AB_CASE_CLEAR);
    const c = { x, y, smashed: false, voice: null, knockT: 0, near: false, value: rollReward(rand(), ab.chaos ? AB_CHAOS_REWARDS : AB_REWARDS), lightning: rand() < AB_LIGHTNING_CASE,
      life: !ab.chaos && rand() < AB_LIFE_CASE };
    ab.cases.push(c);
    return c;
  },

  _abFillCases() {
    const ab = this.ab;
    for (const c of [...ab.cases]) {
      if (!c.smashed && dist2([c.x, c.y], this.playerPos) > AB_CASE_FAR) this._abDropCase(c);
    }
    ab.cases = ab.cases.filter((c) => !c.smashed);
    while (ab.cases.length < AB_CASES_AROUND) this._abNewCase();
  },

  _abDropCase(c) {
    if (c.voice) { c.voice.fadeout(300); c.voice = null; }
    this.ab.cases = this.ab.cases.filter((x) => x !== c);
  },

  // How far off straight ahead a case is, in radians.
  _abCaseOff(c) {
    const f = this._forward();
    const dx = c.x - this.playerPos[0]; const dy = c.y - this.playerPos[1];
    const d = Math.hypot(dx, dy);
    if (d < 0.5) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (dx * f[0] + dy * f[1]) / d)));
  },

  _abCaseInReach() {
    for (const c of this.ab.cases) {
      if (!c.smashed && dist2([c.x, c.y], this.playerPos) < CASE_REACH && this._abCaseOff(c) <= CASE_LINED) return c;
    }
    return null;
  },

  // The case that knocks (web 6.3.3): the nearest within knocking range, kept until it is
  // smashed or gone, or another case is AB_KNOCK_SWAP nearer than it; null if none is in range.
  _abKnocker() {
    const ab = this.ab;
    const live = ab.cases.filter((c) => !c.smashed);
    const dist = (c) => dist2([c.x, c.y], this.playerPos);
    let best = null;
    for (const c of live) if (dist(c) < CASE_KNOCK_RANGE && (!best || dist(c) < dist(best))) best = c;
    const was = live.includes(ab.knocker) && dist(ab.knocker) < CASE_KNOCK_RANGE ? ab.knocker : null;
    if (was && best && best !== was && dist(best) > dist(was) - AB_KNOCK_SWAP) best = was;
    ab.knocker = best;
    return best;
  },

  // Each case hums where it stands; the nearest knocks as you close in (6.3.3: one
  // knocking sound to centre, not three); and a case rings its bell once you are
  // beside it and facing it.
  _abUpdateCases(dt) {
    const knocker = this._abKnocker();
    for (const c of this.ab.cases) {
      if (c.smashed) continue;
      const hum = c === knocker || !knocker ? 1 : AB_HUM_OTHERS;
      const [l, r, d] = this._abLevels([c.x, c.y], CASE_GAIN * hum * this._abDuckFactor(), AB_CASE_RANGE);
      if (!c.voice && d < AB_CASE_RANGE && this.audio.has(CASE_SOUND)) c.voice = this.audio.play(CASE_SOUND, { loops: -1, volume: 0.0, fadeMs: 300 });
      else if (c.voice && d > AB_CASE_RANGE + 5) { c.voice.fadeout(300); c.voice = null; }
      if (c.voice) c.voice.setVolume(l, r, this._behind([c.x, c.y]));
      c.knockT = Math.max(0, c.knockT - dt);
      if (c === knocker && d < CASE_KNOCK_RANGE && c.knockT <= 0 && this.audio.has(CASE_KNOCK)) {
        const near = 1 - d / CASE_KNOCK_RANGE;
        c.knockT = CASE_KNOCK_EVERY[1] + (CASE_KNOCK_EVERY[0] - CASE_KNOCK_EVERY[1]) * near;
        this.audio.play(CASE_KNOCK, { at: [c.x, c.y], volume: CASE_KNOCK_LEVEL[0] + (CASE_KNOCK_LEVEL[1] - CASE_KNOCK_LEVEL[0]) * near });
      }
      const off = this._abCaseOff(c);
      if (d < CASE_REACH && off <= CASE_LINED) {
        if (!c.near) { c.near = true; if (this.audio.has(CASE_CHIME)) this.audio.play(CASE_CHIME, { at: [c.x, c.y], volume: 0.8, keep: true }); }
      } else if (d > CASE_REARM || off > CASE_UNLINED) c.near = false;
    }
  },

  // Smash it: its time is yours at once, and the voice says how much. The smash is
  // heard (unless the lightning covers it) and the creatures charge; a lightning case
  // sends a strike instead, and they run to that.
  _abSmash(c) {
    const ab = this.ab;
    c.smashed = true;
    if (c.voice) { c.voice.stop(); c.voice = null; }
    const smash = this.audio.has(CASE_SMASH) ? CASE_SMASH : aliasRecording(this.audio, 'evt_glass_smash', 'event_sfx_file_evt_glass_smash');
    if (smash) this.audio.play(smash, { at: [c.x, c.y], keep: true });
    ab.smashed += 1;
    this.timeLeft += c.value;
    this.thirtySecAnnounced = this.timeLeft <= 30.0;
    const step = this._announceStep();
    this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / step) * step;
    this.lastBeepSecond = -1;
    // (6.3.3) A case with an extra life: one more life, however many you have already.
    if (c.life && !ab.chaos) {
      ab.lives += 1;
      if (this.audio.has(AB_LIFE_SOUND)) this.audio.play(AB_LIFE_SOUND, { at: [c.x, c.y], keep: true });
      this.tts.speak(`${c.value} more seconds. Extra life, ${ab.lives} lives.`, { interrupt: true });
    } else this.tts.speak(`${c.value} more seconds.`, { interrupt: true });
    if (c.lightning) this._abStrike();
    else if (ab.cover <= 0) {
      for (const x of ab.creatures) {
        if (dist2([x.x, x.y], this.playerPos) <= AB_SMASH_HEAR) { x.charge = AB_SMASH_CHARGE; x.storm = 0; x.move = 0; }
      }
    }
    if (ab.chaos && ab.smashed >= ab.quota) { this._abOpenExit(); return; }
    this._abFillCases();
    this._abFillCreatures();
  },

  // ---------------------------------------------------------------- Chaos: the exit
  // The quota is smashed: the creatures, the cases and the lightning go, and the exit
  // is heard over the abyss's own air. (6.3.7, Russell, 22 November 2026: the air stays.
  // Until now it faded out with the rest, and the stage went dead.) The chaos clock
  // waits until you reach it (chaos.js _chaosExitOpen).
  _abOpenExit() {
    const ab = this.ab;
    for (const c of ab.creatures) if (c.voice) { c.voice.fadeout(300); c.voice = null; }
    ab.creatures = [];
    for (const c of ab.cases) if (c.voice) { c.voice.fadeout(300); c.voice = null; }
    ab.cases = [];
    ab.cover = 0; ab.strike = null;
    const pos = this._abSpot(AB_EXIT_RANGE[0], AB_EXIT_RANGE[1]);
    ab.exit = { pos, voice: this.audio.play('exit_morse', { loops: -1, volume: 0.0 }) };
    this._abLevelExit();
  },

  _abLevelExit() {
    const ex = this.ab.exit;
    if (!ex || !ex.voice) return 1e9;
    const [l, r, d] = this._battleLevels(ex.pos, 0.9);
    ex.voice.setVolume(l, r, this._behind(ex.pos));
    return d;
  },

  _abLeaveByExit() {
    const ex = this.ab.exit;
    if (ex && ex.voice) ex.voice.stop();
    this.ab.exit = null;
    this.ab.done = true;
    this.nextLevel();
  },

  // ---------------------------------------------------------------- the frame
  updateAbyss(dt) {
    const ab = this.ab;
    if (!ab || this.isPaused) return;
    // The clock: a run's own, or the chaos clock (it waits while the exit is open).
    if (this._advanceTimer(dt)) return;
    if (this.state !== STATE || this.ab !== ab) return;
    if (ab.exit) {
      if (this._abLevelExit() < AB_EXIT_REACH) this._abLeaveByExit();
      return;
    }
    ab.cover = Math.max(0, ab.cover - dt);
    ab.grace = Math.max(0, ab.grace - dt);
    if (ab.duck > 0) { ab.duck = Math.max(0, ab.duck - dt); this._abDuck(); }
    ab.nextStrike -= dt;
    if (ab.nextStrike <= 0) this._abStrike();
    this._abUpdateCreatures(dt);
    ab.steps = [];
    if (this.state !== STATE || this.ab !== ab) return;
    this._abUpdateCases(dt);
  },

  // A step, or a run's step: always on glass, always heard (but under the lightning).
  _abStep(g) {
    const ab = this.ab;
    const f = this.playerFacing = this._forward();
    const dir = g === 'up' ? f : [-f[0], -f[1]];
    const w = this._walkArena(dir, AB_STEP, 1e9, { sound: false });
    if (!w) return;
    ab.steps.push(w);
    const bank = AB_STEPS_GLASS.filter((n) => this.audio.has(n));
    if (bank.length) this.audio.play(choice(bank));
    if (ab.exit) {
      if (this._abLevelExit() < AB_EXIT_REACH) this._abLeaveByExit();
      return;
    }
    this._abHeard(this.strideStepping === 'up');
    this._abFillCases();
    this._abFillCreatures();
  },

  _abAttack() {
    const ab = this.ab;
    if (ab.exit) { this.audio.play('empty_click'); return; }
    const c = this._abCaseInReach();
    if (c) { this._abSmash(c); return; }
    this.audio.play('empty_click');
  },

  // Enter's report: the cases smashed, your lives, the clock, and the way you face (in
  // chaos: the cases of the quota, then the clock and the points).
  _abReport() {
    const ab = this.ab;
    const lv = `${ab.lives} ${plural(ab.lives, 'life', 'lives')} left.`;
    // (Worded with words the recorded voice already has: js/voice-text.js.)
    if (ab.chaos) {
      // (Its health is added by _report, as in every chaos level.)
      this._report(ab.exit ? `All ${ab.quota} glass cases.` : `${ab.smashed} of ${ab.quota} glass cases.`, true);
      return;
    }
    this._report(`Glass cases: ${ab.smashed}. ${lv}`, true);
  },

  // Everything of the mode stopped and forgotten (a game over, quitting, a chaos stage ending).
  _abStopAll() {
    const ab = this.ab;
    if (!ab) return;
    for (const c of ab.creatures) if (c.voice) { c.voice.stop(); c.voice = null; }
    for (const c of ab.cases) if (c.voice) { c.voice.stop(); c.voice = null; }
    if (ab.amb && ab.amb.voice) ab.amb.voice.stop();
    ab.amb = null;
    if (ab.exit && ab.exit.voice) ab.exit.voice.stop();
    ab.exit = null;
    ab.stopped = true;
    for (const stem of [...AB_THUNDERS, AB_IDLE, AB_GROWL]) this.audio.pins.delete(`abyss:${stem}`);
  },
};

// ------------------------------------------------------------------ help
const HELP_SECTIONS = [
  ['The Abyss', [
    { title: 'The Abyss', sound: null, desc: 'The Abyss is a mode of its own, new in 6.2.0, inspired by Papa Sangre, the horror game made only of sound, where you creep through the dark past monsters you can only hear. You are in a huge, endless abyss, with no walls and no edge, and the whole floor is broken glass: every step you take can be heard. Creatures live all through it. Your goal is to smash as many glass cases as you can before the clock runs out. You turn and walk as in every walking mode (see General Turning). Double tap for the cases you have smashed, your lives, the seconds left and the way you are facing. Since 8.0.0, choosing The Abyss on the main menu opens a small menu: The Abyss, or its sub mode The Edge, where you cross the abyss on a narrow ledge (see The Edge).' },
    { title: 'The Abyss The Creatures', sound: null, desc: 'The creatures are blind, just like you, and they hunt by sound, so they come for you only while you move. Walk, and the ones within about ten steps creep toward the sound of your steps. Run, and the ones within about twenty steps charge you, a little slower than you can run. Stop, and they stop hunting you: each one goes back to wandering the abyss very slowly, in no particular direction, never toward you, and it always turns away before it comes within three steps of you, so a creature that has not heard you can never stumble into you. Standing still never gets you away from them; it only holds them off, while the clock runs on. A wandering creature makes a quieter sound and faint footsteps; a hunting one growls, with a footstep on the glass for every step it takes. The creatures always keep about three steps apart from one another, and a creature that wakes does so fifteen to twenty-five steps from you, never right beside another. You cannot shoot them. If one catches you, you lose a life, and it is thrown far away.' },
    { title: 'The Abyss Lightning', sound: null, desc: 'Lightning is your cover. Every few seconds it strikes somewhere in the abyss, really loud: a thunderclap from where it strikes, while the wind and the hum of the cases dip under it. It lands fifteen to twenty-five steps from you, and every creature in the abyss runs toward it, each to its own spot around the strike, so they spread out instead of crowding into one pack. For five seconds after a strike your steps are not heard, so that is the moment to move. At first it strikes every six to ten seconds; as you smash more cases it comes less often, but never more than twenty seconds apart.' },
    { title: 'The Abyss Glass Cases', sound: null, desc: 'A glass case hums where it stands. Three stand around you at a time, but only one knocks: the nearest, from about fifteen steps away, faster and louder as you close in, so you can turn until the knocking is centred between your ears. The others only hum, more softly, and the knocking moves to another case only when you smash this one or come two steps nearer to another. When you are beside a case and facing it, a bell rings: tap with two fingers to smash it, or press the spacebar. Smashing glass is loud: every creature that hears it charges you for about three seconds, unless the five seconds after a lightning strike have not yet run out, so a case is best smashed just after the lightning. Each case gives you time: usually ten seconds, sometimes twenty. About one case in four also holds lightning: as it breaks, lightning strikes somewhere in the abyss and the creatures run to it instead of to you. And about one case in twenty also holds an extra life: you hear the heart, and the voice says it with your lives, such as 10 more seconds. Extra life, 4 lives. There is no limit to how many lives you can have. (Not in Chaos Mode, where the run has its one health bar.)' },
    { title: 'The Abyss Clock, Lives and Score', sound: null, desc: 'The clock starts at forty-five seconds, and only glass cases add to it. You start with three lives, and a rare case gives you another, with no limit: when the clock runs out, or a creature catches you when you have one life left, the run is over. Every three cases you smash, one more creature wakes in the abyss, up to seven, and the lightning comes a little less often, never more than twenty seconds apart. Your score is the number of cases you smash, and The Abyss has its own high score board.' },
    { title: 'The Abyss in Chaos Mode', sound: null, desc: 'Chaos Mode has Abyss levels too. You know you are in one at once: lightning strikes the moment you arrive, so move. There you must smash a set number of cases: three or four the first time in a run, and one more each time after, at most eight. Each case adds its time to the chaos clock: usually ten seconds, sometimes twenty or thirty, and very rarely sixty. When you have smashed enough, the creatures, the cases and the lightning all go, and over the wind of the abyss, which plays on, an exit is heard, the battle exit\'s Morse signal; the chaos clock waits until you walk through it. There a catch costs 25 health from the one health bar of the chaos run (see Chaos Health) instead of a life. There, double tap for the cases smashed, then your health, the clock and the points.' },
  ]],
];

const HELP_DEMOS = [
  ['Demos, The Abyss', [
    { title: 'The Abyss Demos', sound: null, desc: 'The sounds of The Abyss.' },
    { title: 'Lightning', sound: AB_THUNDER, desc: 'A lightning strike: one of three thunderclaps. For five seconds after a strike, the creatures cannot hear your steps.' },
    { title: 'Creature, Wandering', sound: AB_IDLE, desc: 'A creature wandering the abyss. It has not heard you, but it is listening.' },
    { title: 'Creature, Hunting', sound: AB_GROWL, desc: 'A creature hunting you: it growls while it moves.' },
    { title: 'Footstep on Glass', sound: AB_STEPS_GLASS[0], desc: 'A step on the broken glass that covers the whole abyss.' },
    { title: 'Glass Case', sound: CASE_SOUND, desc: 'The hum of a glass case.' },
    { title: 'Glass Case Knocking', sound: 'ut_case_knock_demo', desc: 'The knocking of a glass case, faster as you come closer. Centre it between your ears.' },
    { title: 'Lined Up', sound: CASE_CHIME, desc: 'The bell when you are beside a case and facing it: smash it now.' },
  ]],
];

// ------------------------------------------------------------------ the mode
function reset(game) {
  if (game.ab) game._abStopAll();
  game.ab = null;
}

function input(game, g) {
  const ab = game.ab;
  if (!ab) return;
  if (g === 'clock') {
    const secs = Math.trunc(game.timeLeft);
    game.tts.speak(`${secs} second${secs === 1 ? '' : 's'} remaining.`, { interrupt: true });
    return;
  }
  if (g === 'enter') { game._abReport(); return; }
  if (g === 'space') { game._abAttack(); return; }
  if (g === 'left' || g === 'right') { game._turnQuick(g === 'right' ? 1 : -1); return; }
  if (g === 'up' || g === 'down') game._abStep(g);
}

// ------------------------------------------------------------------ the Abyss menu
// Web 8.0.0 (Russell, 25 November 2026): The Abyss on the main menu opens a small menu
// of its own, The Abyss or its sub mode The Edge (js/modes/edge.js), and Back.
export const S_ABYSS_MENU = 'abyss_menu';
export const ABYSS_MENU = [['abyss', 'The Abyss'], ['edge', 'The Edge'], ['back', 'Back to the main menu']];

function openAbyssMenu(game) {
  game.state = S_ABYSS_MENU;
  game.abyssMenuIndex = 0;
  game.tts.speak(`The Abyss. Swipe up and down to choose, double tap to start. ${ABYSS_MENU[0][1]}`, { interrupt: true });
}

function abyssMenuInput(game, g) {
  const toMain = () => {
    game.state = 'menu';
    game._refreshMenu();
    game.tts.speak('Main Menu. ' + game.menuOptions[game.menuIndex], { interrupt: true });
  };
  if (g === 'back') { toMain(); return; }
  if (g === 'up' || g === 'down') {
    const n = ABYSS_MENU.length;
    game.abyssMenuIndex = ((game.abyssMenuIndex || 0) + (g === 'up' ? -1 : 1) + n) % n;
    game.audio.play('menu_move');
    game.tts.speak(ABYSS_MENU[game.abyssMenuIndex][1], { interrupt: true });
    return;
  }
  if (g === 'enter') {
    const [k] = ABYSS_MENU[game.abyssMenuIndex || 0];
    game.audio.play('menu_move');
    if (k === 'back') toMain();
    else if (k === 'edge') game.startEdge();
    else game.startAbyss();
  }
}

export default {
  menu: [{ key: 'abyss', label: 'The Abyss', select: (game) => openAbyssMenu(game) }],
  inputStates: { [S_ABYSS_MENU]: abyssMenuInput },
  statusFor: { [S_ABYSS_MENU]: (game) => 'The Abyss: ' + ABYSS_MENU[game.abyssMenuIndex || 0][1] },
  playStates: [STATE],
  mixin,
  init(game) {
    game.ab = null;
  },
  reset,
  update(game, dt) { game.updateAbyss(dt); },
  input,
  stopAll(game) { if (game.ab) game._abStopAll(); },
  finish(game) {
    const n = game.ab ? game.ab.smashed : 0;
    const opener = game.timeLeft <= 0 ? 'Time up.' : 'Game Over.';
    return { key: BOARD, score: n, message: `${opener} You smashed ${n} glass ${plural(n, 'case')}. ` };
  },
  room() { return AB_ROOM; },
  turns(game) { return game.state === STATE; },
  surroundings() { return [1.0, 0.0]; },     // no walls anywhere
  strideSig(game) { return game.ab ? `${!!game.ab.exit}` : ''; },
  status(game) {
    const ab = game.ab;
    if (!ab) return 'The Abyss.';
    return `The Abyss. ${ab.smashed} ${plural(ab.smashed, 'case')} smashed. ${ab.lives} ${plural(ab.lives, 'life', 'lives')}.`;
  },
  boards: [{ key: BOARD, label: 'The Abyss', fmt: (v) => `${v} ${v === 1 ? 'case' : 'cases'}` }],
  help: { sections: HELP_SECTIONS, demos: HELP_DEMOS },
};
