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
// out as you go, never more than 25 seconds apart (8.1.0; 20 until then, and still 20 in Chaos).
//
// The goal: smash as many glass cases as you can before the clock runs out. A case
// hums, and knocks as you close in (as in Ultimate Mode); a bell says when you are
// beside it and facing it, and your attack smashes it. Smashing is loud: every
// creature that hears it charges you for about 3 seconds (unless the lightning's
// cover is still on). Each case gives time: 10 seconds mostly, sometimes 20 or 30,
// and very rarely 60. About three cases in ten also hold lightning (8.1.0; one in four in
// Chaos, as from 6.3.3 to 8.0.4; one in six until 6.3.3): as it breaks, a strike lands somewhere in the abyss and the creatures run to
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
// (8.0.2, Russell, 25 November 2026: in The Abyss itself, not Chaos, every glass case
// gives ten seconds, never 20, 30 or 60.)
export const AB_START_TIME = 45.0;              // the clock at the start of a run
export const AB_LIVES = 3;
// A case's time: always 10 (8.0.2; 6.3.4 to 8.0.1: 10 mostly, sometimes 20).
export const AB_REWARDS = [[10, 1.0]];
// (8.1.4, Russell, 26 November 2026: as the cases appear further off, ten seconds no longer
// paid for the walk to one.) In The Abyss itself the time grows gently: one second more for
// every six cases smashed (15 at case 30, 20 at case 60). The voice still does not say it.
// Chaos's Abyss levels keep AB_CHAOS_REWARDS; below the Edge, cases give no time.
export const AB_REWARD_GROW_CASES = 6;
export function caseReward(smashed) { return AB_REWARDS[0][0] + Math.floor(Math.max(0, smashed) / AB_REWARD_GROW_CASES); }
// In Chaos's Abyss stages: 10 mostly, sometimes 20 or 30, very rarely 60 (as before 6.3.4).
// (8.1.5, Russell, 26 November 2026: Chaos gave too much time.) Ten seconds a case, always.
// (Until 8.1.4: 10 mostly, sometimes 20 or 30, very rarely 60.)
export const AB_CHAOS_REWARDS = [[10, 1.0]];
// Web 6.3.3 (Russell, 21 November 2026): one case in four also holds lightning (was one
// in six), here and in Chaos's Abyss stages; and in The Abyss itself, not Chaos, one case
// in ten (one in twenty from 6.3.4) also holds an extra life, with no limit on lives, a
// rare reward for a strong run.
// (8.1.0, Russell, 26 November 2026, for harder long runs: three in ten in The Abyss
// itself; Chaos's Abyss stages keep one in four, AB_CHAOS_LIGHTNING_CASE.)
export const AB_LIGHTNING_CASE = 3 / 10;        // a case that also holds lightning (The Abyss; 6.3.3 to 8.0.4: 1 in 4)
export const AB_CHAOS_LIGHTNING_CASE = 3 / 10;  // the same in Chaos's Abyss stages (8.1.4: as The Abyss; 1 in 4 until then)
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
export const AB_STRIKE_MAX = 25.0;              // (8.1.0, Russell, 26 November 2026: 25 in The Abyss; 6.3.4 to 8.0.4: 20; 6.3.3: 15)
export const AB_CHAOS_STRIKE_MAX = 25.0;        // Chaos's Abyss stages (8.1.4: as The Abyss; 20 until then)
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
// (8.1.4, Russell, 26 November 2026: he got an extra life and was caught at once.) A smash
// is heard within ten steps, not twenty, so a creature that charges is one already close.
export const AB_SMASH_HEAR = 30.0;              // units (ten steps): how far a smash is heard (was 60)
// The creatures: three at first, one more every three cases, at most ten (8.1.0, Russell,
// 26 November 2026: he once smashed over seventy cases, as nothing grew harder after case 12;
// 6.2.0 to 8.0.4: at most seven). Chaos's Abyss stages keep seven (a stage asks at most
// eight cases, so it never comes to more than five there).
export const AB_TIER_CASES = 3;
export const AB_CREATURES = [3, 1, 10];
export const AB_CHAOS_CREATURES_MAX = 10;      // (8.1.4: as The Abyss; 7 until then)
// Speeds in steps a minute. Your run is 280 (game.js RUN_STEPS_PER_MINUTE): a
// charging creature is a little slower, as in Find the Voice; a creeping one far slower.
export const AB_CHARGE_SPM = 220;
export const AB_CREEP_SPM = 90;
// (8.1.4, Russell, 26 November 2026: walking sounded as loud as running, the creatures still
// heard it and seemed to charge.) Quiet walking: your walking step is softer (AB_WALK_GAIN),
// heard only within about four steps; a creature that hears it creeps a little (no growl:
// its quieter breathing and faint steps), and falls behind if you keep walking.
// (Until 8.1.3: heard within ten steps, 0.6 s of creeping a step, growling.)
export const AB_WALK_HEAR = 12.0;               // units (four steps): how far a walking step is heard
export const AB_WALK_GAIN = 0.5;                // your walking step on the glass, against a running one
export const AB_RUN_HEAR = 60.0;                // units (twenty steps): a running step
// (8.1.6, Russell, 26 November 2026: walking away, a creature never seemed to fall behind.)
// It did (it loses a walking step after about three of yours), but its breathing faded in
// a straight line over 25 steps, still more than half as loud 12 steps back. A creature that
// is not growling now fades steeply: half as loud every AB_QUIET_HALF (about six steps),
// a quarter by twelve, and very faint out to its 25 steps (so a new one waking is still
// faintly heard). A growling one still fades in a straight line over 25 steps, as a warning.
export const AB_QUIET_HALF = 18.0;              // units: a breathing creature is half as loud every six steps
export const AB_QUIET_TAIL = 10.0;              // units: the last of its range, faded to silence
export function quietFade(d, range) {
  if (d >= range) return 0;
  return Math.pow(0.5, d / AB_QUIET_HALF) * Math.min(1, (range - d) / AB_QUIET_TAIL);
}
export const AB_WALK_MOVE = 0.4;                // seconds a creature creeps after each walking step it hears (8.1.4; was 0.6)
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
// (8.1.3, Russell, 26 November 2026: "every three cases a creature wakes up. Right now it's
// happening every case.") The count was right, but a creature left too far behind was
// replaced by one waking 15 to 25 steps from you, well within hearing, so it sounded like a
// new creature waking after nearly every case. A replacement now appears out of hearing
// (beyond AB_CREATURE_RANGE), 27 to 33 steps off; only the new creature every three cases
// (and the first ones of a run) wakes where you can hear it. In Chaos's Abyss levels too.
export const AB_REPLACE_SPAWN = [80.0, 100.0];   // units from you that a replacement appears (unheard)
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
export const AB_CASE_SPAWN = [25.0, 55.0];     // units from you that a case appears (about 8 to 18 steps), at first
export const AB_CASE_FAR = 110.0;
export const AB_CASE_CLEAR = 15.0;              // no creature this near a new case
export const AB_CASE_RANGE = 70.0;              // its hum is heard within this many units, at first
// (8.1.0, Russell, 26 November 2026) In The Abyss itself, not Chaos, new cases appear one
// step further off for every tier (three cases), with no end: about 18 to 28 steps at case
// 30, 28 to 38 at case 60. Their hum carries further in step (so the furthest is heard as
// well as it was at first), and they are let go further off. The knocking still starts
// within fifteen steps (CASE_KNOCK_RANGE): the hum leads you in from further away.
export const AB_CASE_FURTHER = 3.0;             // units (a step) further per tier
// Chaos: the quota of cases, and the exit.
export const AB_CHAOS_QUOTA_FIRST = [3, 4];
export const AB_CHAOS_QUOTA_GROW = 1;
export const AB_CHAOS_QUOTA_MAX = 8;
export const AB_EXIT_RANGE = [15.0, 30.0];
export const AB_EXIT_REACH = 3.0;
// Below the Edge (8.1.0, Russell's idea, 26 November 2026): in Chaos, a fall from an Edge
// level lands you on this glass floor (edge.js _edLand, `below`). The cases give no time
// and the chaos clock runs on; a catch costs 25 health and 10 seconds; once the cases are
// smashed an elevator calls you (its hum, and the single note of an island's elevator on
// the seabed, as the only way is up), and its ride (the chaos clock stopped) takes you back
// onto the ledge (edge.js _edReturn; 8.1.2: no time for it, and a smash says nothing; the
// double tap tells the cases smashed and wanted).
export const AB_BELOW_CATCH_TIME = 10;          // seconds off the chaos clock for a catch below
export const AB_BELOW_FIRST_STRIKE = 1.5;       // seconds after you land before the first strike (8.1.1)
export const AB_LIFT_RANGE = [15.0, 30.0];      // units from you that the elevator appears (5 to 10 steps)
export const AB_LIFT_REACH = 3.0;
export const AB_LIFT_DING = 1.6;                // seconds between its calls, as an island's
export const AB_RIDE = [8.0, 15.0];             // the ride: as long as its recording, within these
// Sounds.
export const AB_BACKGROUND = 'evt_amb_howling_wind';   // the abyss's air (no thunder of its own in it)
// Three real thunderclaps (Pixabay, web-only, in the abyss pack), one at random each
// strike, never the same twice running. (Four until 6.3.3, when Russell dropped the
// second, freesound_community's "Thunder Clap", which sounded dry to him; it is no
// longer in the pack. Thunder Strike, the one he chose as better, stays.) (8.1.0, Russell,
// 26 November 2026: thunder 4, freesound_community's "big thunder clap", is out of The
// Abyss too, and ab_thunder_5 takes its place: six seconds of rcroller's "BIG THUNDER
// recorded in stereo with rain fall and lightning", its opening clap and the roll after
// it. tools/abyss/thunder.py.)
export const AB_THUNDERS = ['ab_thunder_1', 'ab_thunder_3', 'ab_thunder_5'];
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
export function creaturesFor(smashed, chaos = false) {
  return Math.min(chaos ? AB_CHAOS_CREATURES_MAX : AB_CREATURES[2], AB_CREATURES[0] + AB_CREATURES[1] * tierOf(smashed));
}
export function strikeGap(smashed, chaos = false) {
  const t = tierOf(smashed);
  const most = chaos ? AB_CHAOS_STRIKE_MAX : AB_STRIKE_MAX;
  const lo = Math.min(most, AB_STRIKE_GAP[0] + AB_STRIKE_GROW[0] * t);
  const hi = Math.min(most, AB_STRIKE_GAP[1] + AB_STRIKE_GROW[1] * t);
  return [lo, Math.max(lo, hi)];
}
// Where new cases appear, how far their hum carries, and how far off they are let go
// (8.1.0: further each tier in The Abyss itself; as before in Chaos).
export function caseRing(smashed, chaos = false) {
  // (8.1.4, Russell, 26 November 2026: Chaos's Abyss levels, and the abyss below the Edge,
  // take The Abyss's harder rules too: this, the creatures, the lightning. Not the rewards.)
  const more = AB_CASE_FURTHER * tierOf(smashed);
  return [AB_CASE_SPAWN[0] + more, AB_CASE_SPAWN[1] + more];
}
export function caseRange(smashed, chaos = false) {
  return AB_CASE_RANGE * caseRing(smashed, chaos)[1] / AB_CASE_SPAWN[1];
}
export function caseFar(smashed, chaos = false) {
  return AB_CASE_FAR + (caseRange(smashed, chaos) - AB_CASE_RANGE);
}
export function lightningCaseOdds(chaos = false) { return chaos ? AB_CHAOS_LIGHTNING_CASE : AB_LIGHTNING_CASE; }

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
  _abBegin({ chaos, quota, lives, adopt = null, below = false }) {
    this.abNames = new Map(this._abNames());
    // Held in memory for the whole run (unpinned in _abStopAll), so no strike or
    // creature waits for its recording to be decoded again.
    for (const [stem, name] of this.abNames) if (name) this.audio.prepare(name, stem === AB_BACKGROUND ? null : `abyss:${stem}`);
    this.playerPos = [0.0, 0.0];
    this.arenaLimit = 1e9;
    this.stride = null;
    const ab = this.ab = {
      run: this.runId, chaos, below, quota, lives, smashed: 0, lift: null,
      creatures: [], cases: [], steps: [],
      cover: 0, grace: 0, strike: null, duck: 0,
      nextStrike: uniform(...strikeGap(0, chaos)),
      amb: null, exit: null, done: false,
    };
    this._abBackground(adopt);
    this._abFillCases();
    this._abFillCreatures();
    // In chaos, lightning strikes the moment you arrive, so you know at once where you
    // are and that you must move (Russell, 20 November 2026). (8.1.1) Below the Edge, a
    // moment after you land (AB_BELOW_FIRST_STRIKE), so the strike does not cover the landing.
    if (below) ab.nextStrike = AB_BELOW_FIRST_STRIKE;
    else if (chaos) this._abStrike();
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
  _abLevels(pos, gain, range, quiet = false) {
    const dx = pos[0] - this.playerPos[0];
    const dy = pos[1] - this.playerPos[1];
    const d = Math.hypot(dx, dy);
    const pan = d > 0 ? dx / d : 0.0;
    // (8.1.6) A quiet creature (breathing, not growling) fades steeply with distance.
    const v = Math.min(1.0, (quiet ? quietFade(d, range) : Math.max(0.0, 1.0 - d / range)) * gain);
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

  // As many creatures as the cases smashed call for, none too far off. One that is left
  // too far behind is replaced out of hearing (8.1.3); a new one, every three cases, wakes
  // where it is heard.
  _abFillCreatures() {
    const ab = this.ab;
    let replace = 0;
    for (const c of [...ab.creatures]) {
      if (dist2([c.x, c.y], this.playerPos) > AB_CREATURE_FAR) { this._abDropCreature(c); replace += 1; }
    }
    while (ab.creatures.length < creaturesFor(ab.smashed, ab.chaos)) {
      if (replace > 0) { this._abNewCreature(AB_REPLACE_SPAWN[0], AB_REPLACE_SPAWN[1]); replace -= 1; }
      else this._abNewCreature();
    }
  },

  _abDropCreature(c) {
    const ab = this.ab;
    if (c.voice) { c.voice.fadeout(300); c.voice = null; }
    ab.creatures = ab.creatures.filter((x) => x !== c);
  },

  // Its sound: a growl while it moves, its quieter sound while it is still; nothing
  // at all from beyond hearing.
  _abCreatureSound(c) {
    // (8.1.4) It growls only while it charges, runs to the lightning or hunts a running step;
    // creeping to a walking step it keeps its quieter breathing.
    const growl = c.moving && !c.creeping;
    const [l, r, d] = this._abLevels([c.x, c.y], growl ? AB_CREATURE_GAIN : AB_IDLE_GAIN, AB_CREATURE_RANGE, !growl);
    if (d > AB_CREATURE_RANGE) {
      if (c.voice) { c.voice.fadeout(300); c.voice = null; c.note = null; }
      return;
    }
    const want = this._abName(growl ? AB_GROWL : AB_IDLE);
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
      c.creep = !running;     // (8.1.4) creeping to a walking step: no growl
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
      let target = null; let speed = 0; let creeping = false;
      if (c.charge > 0) { c.charge -= dt; target = this.playerPos; speed = stepsPerSecond(AB_CHARGE_SPM); }
      else if (c.storm > 0) { c.storm -= dt; target = c.stormSpot || ab.strike; speed = stepsPerSecond(AB_CHARGE_SPM); }
      else if (c.move > 0) { c.move -= dt; target = c.target; speed = c.moveSpeed; creeping = !!c.creep; }
      c.creeping = creeping;
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
          const quiet = c.wandering || c.creeping;
          const [l, r, d] = this._abLevels([c.x, c.y], quiet ? AB_STEP_GAIN * AB_WANDER_STEP_GAIN : AB_STEP_GAIN, AB_CREATURE_RANGE, quiet);
          if (bank.length && d < AB_CREATURE_RANGE) this.audio.play(choice(bank), { at: [c.x, c.y], volume: Math.max(l, r) });
        }
      }
      this._abCreatureSound(c);
    }
    this._abKeepApart();
    // It has you: this near now, or you walked through where it is. (8.1.3, Russell, 26
    // November 2026: under the lightning's cover he ran, unheard, and was caught anyway, as
    // creatures sprinting to the strike ran into him, above all with many crowded round. A
    // creature running to the lightning is not hunting you, so it cannot catch you, even if
    // it passes right by you or you run through it.)
    if (ab.grace > 0) return;
    for (const c of ab.creatures) {
      if (c.storm > 0) continue;
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
      // (8.1.0) Below the Edge, a catch costs time too.
      if (ab.below) {
        this.timeLeft -= AB_BELOW_CATCH_TIME;
        if (this.timeLeft <= 0) { this.timeLeft = 0; ab.lost = true; this.triggerGameOver(); return; }
        this.thirtySecAnnounced = this.timeLeft <= 30.0;
        const step = this._announceStep();
        this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / step) * step;
        this.lastBeepSecond = -1;
      }
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
    if (ab.below) { if (!this.towerLowWarned || this.towerHp > 35) this.tts.speak(`Caught. Lost ${AB_BELOW_CATCH_TIME} seconds.`, { interrupt: true }); }
    else if (ab.chaos) { if (!this.towerLowWarned || this.towerHp > 35) this.tts.speak('Caught.', { interrupt: true }); }
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
          // (8.1.4) One running from the lightning is never eased any nearer to you at all.
          if (c.storm > 0) return then < now;
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
      c.stormSpot = this._abAwayFromYou(c, best);
    }
  },

  // (8.1.4, Russell, 26 November 2026: "when the lightning hits, the creatures actually move
  // towards you. They should go away from the player.") A creature on the far side of you
  // from the strike ran straight past you to reach it. Now, if the way to its spot would
  // bring it any nearer to you, it runs off away from you instead, bending toward the
  // strike's side: every step it takes under the lightning takes it further from you.
  _abAwayFromYou(c, spot) {
    const [px, py] = this.playerPos;
    let ux = c.x - px; let uy = c.y - py; const ud = Math.hypot(ux, uy);
    if (ud < 1e-6) { const a = uniform(0, Math.PI * 2); ux = Math.sin(a); uy = -Math.cos(a); } else { ux /= ud; uy /= ud; }
    const tx = spot[0] - c.x; const ty = spot[1] - c.y;
    const along = tx * ux + ty * uy;
    if (along >= 0) return spot;            // straight there, never nearer to you
    let sx = tx - along * ux; let sy = ty - along * uy; const sl = Math.hypot(sx, sy);
    let dx = ux; let dy = uy;
    if (sl > 1e-6) { dx += 0.6 * sx / sl; dy += 0.6 * sy / sl; }
    const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
    const run = Math.max(20, Math.min(45, Math.hypot(tx, ty)));
    return [c.x + dx * run, c.y + dy * run];
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
    ab.nextStrike = uniform(...strikeGap(ab.smashed, ab.chaos));
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
    const [x, y] = this._abSpot(...caseRing(ab.smashed, ab.chaos), away, AB_CASE_CLEAR);
    const c = { x, y, smashed: false, voice: null, knockT: 0, near: false, value: rollReward(rand(), ab.chaos ? AB_CHAOS_REWARDS : AB_REWARDS), lightning: rand() < lightningCaseOdds(ab.chaos),
      life: !ab.chaos && rand() < AB_LIFE_CASE };
    ab.cases.push(c);
    return c;
  },

  _abFillCases() {
    const ab = this.ab;
    const far = caseFar(ab.smashed, ab.chaos);
    for (const c of [...ab.cases]) {
      if (!c.smashed && dist2([c.x, c.y], this.playerPos) > far) this._abDropCase(c);
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
    const range = caseRange(this.ab.smashed, this.ab.chaos);
    for (const c of this.ab.cases) {
      if (c.smashed) continue;
      const hum = c === knocker || !knocker ? 1 : AB_HUM_OTHERS;
      const [l, r, d] = this._abLevels([c.x, c.y], CASE_GAIN * hum * this._abDuckFactor(), range);
      if (!c.voice && d < range && this.audio.has(CASE_SOUND)) c.voice = this.audio.play(CASE_SOUND, { loops: -1, volume: 0.0, fadeMs: 300 });
      else if (c.voice && d > range + 5) { c.voice.fadeout(300); c.voice = null; }
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
    if (!ab.chaos) c.value = caseReward(ab.smashed);   // (8.1.4) growing gently
    // (8.1.0) Below the Edge, a case gives no time: only the climb back gives time.
    if (!ab.below) {
      this.timeLeft += c.value;
      this.thirtySecAnnounced = this.timeLeft <= 30.0;
      const step = this._announceStep();
      this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / step) * step;
      this.lastBeepSecond = -1;
    }
    // (6.3.3) A case with an extra life: one more life, however many you have already.
    // (8.0.4, Russell, 25 November 2026: in The Abyss itself every case is ten seconds, so the
    // voice no longer says so; it still says an extra life. Chaos's cases vary, and say their time.)
    if (c.life && !ab.chaos) {
      ab.lives += 1;
      if (this.audio.has(AB_LIFE_SOUND)) this.audio.play(AB_LIFE_SOUND, { at: [c.x, c.y], keep: true });
      this.tts.speak(`Extra life, ${ab.lives} lives.`, { interrupt: true });
    } else if (ab.below) {
      // (8.1.2, Russell: below the Edge, smashing a case says nothing; the double tap tells.)
    } else if (ab.chaos) this.tts.speak(`${c.value} more seconds.`, { interrupt: true });
    if (c.lightning) this._abStrike();
    else if (ab.cover <= 0) {
      for (const x of ab.creatures) {
        if (dist2([x.x, x.y], this.playerPos) <= AB_SMASH_HEAR) { x.charge = AB_SMASH_CHARGE; x.storm = 0; x.move = 0; }
      }
    }
    if (ab.below && ab.smashed >= ab.quota) { this._abOpenLift(); return; }
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

  // ---------------------------------------------------------------- below the Edge: the elevator
  // The cases are smashed (8.1.0): the creatures, the cases and the lightning go, as at a
  // Chaos stage's exit, the wind plays on, and an elevator calls you.
  _abOpenLift() {
    const ab = this.ab;
    for (const c of ab.creatures) if (c.voice) { c.voice.fadeout(300); c.voice = null; }
    ab.creatures = [];
    for (const c of ab.cases) if (c.voice) { c.voice.fadeout(300); c.voice = null; }
    ab.cases = [];
    ab.cover = 0; ab.strike = null;
    const pos = this._abSpot(AB_LIFT_RANGE[0], AB_LIFT_RANGE[1]);
    ab.lift = { pos, hum: this.audio.play('elevator_hum', { loops: -1, volume: 0.0 }), ding: 0, ride: null };
    this.audio.prepare('elevator_ride');
    this._abLevelLift(0);
  },

  // Its hum where it stands, and its call every AB_LIFT_DING seconds. Returns the distance.
  _abLevelLift(dt) {
    const lf = this.ab.lift;
    const [l, r, d] = this._battleLevels(lf.pos, 0.9);
    const behind = this._behind(lf.pos);
    if (lf.hum) lf.hum.setVolume(l, r, behind);
    lf.ding -= dt;
    if (lf.ding <= 0) {
      lf.ding = AB_LIFT_DING;
      const ch = this.audio.play('elevator_arrive_1');
      if (ch) ch.setVolume(l, r, behind);
    }
    return d;
  },

  // In: the ride up. The chaos clock stops while it moves.
  _abRideUp() {
    const ab = this.ab; const lf = ab.lift;
    this.stride = null;
    this._turnStop();
    if (lf.hum) { lf.hum.stop(); lf.hum = null; }
    const e = this.audio.entries && this.audio.entries.get('elevator_ride');
    const own = e && e.dry ? e.dry.frames / 44100 : AB_RIDE[1];
    const len = Math.max(AB_RIDE[0], Math.min(AB_RIDE[1], own));
    lf.ride = { t: 0, len, chimed: false, faded: false, capped: len < own - 0.05, voice: this.audio.play('elevator_ride') };
  },

  _abUpdateRide(dt) {
    const ab = this.ab; const r = ab.lift.ride;
    // (The ride's recording is long: its clock waits until it is playing.)
    if (r.voice && r.voice.busy && !r.voice.dry) return;
    r.t += dt;
    if (!r.chimed && r.t >= r.len - 0.8) { r.chimed = true; this.audio.play('elevator_arrive_2'); }
    if (r.capped && !r.faded && r.t >= r.len - 1.0) { r.faded = true; if (r.voice) r.voice.fadeout(1000); }
    if (r.t < r.len) return;
    // At the top: the abyss's wind goes up with you, and the crossing goes on (edge.js).
    const wind = ab.amb && ab.amb.voice ? ab.amb.voice : null;
    ab.amb = null;
    ab.lift = null;
    ab.done = true;
    this._abStopAll();
    this.ab = null;
    this._edReturn(wind);
  },

  // ---------------------------------------------------------------- the frame
  updateAbyss(dt) {
    const ab = this.ab;
    if (!ab || this.isPaused) return;
    // (8.1.0) Riding the elevator up from below the Edge: the chaos clock waits.
    if (ab.lift && ab.lift.ride) { this._abUpdateRide(dt); return; }
    // The clock: a run's own, or the chaos clock (it waits while the exit is open).
    if (this._advanceTimer(dt)) return;
    if (this.state !== STATE || this.ab !== ab) return;
    if (ab.exit) {
      if (this._abLevelExit() < AB_EXIT_REACH) this._abLeaveByExit();
      return;
    }
    if (ab.lift) {
      if (this._abLevelLift(dt) < AB_LIFT_REACH) this._abRideUp();
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
    const running = this.strideStepping === 'up';
    if (bank.length) this.audio.play(choice(bank), { volume: running ? 1.0 : AB_WALK_GAIN });   // (8.1.4) walking is softer
    if (ab.exit) {
      if (this._abLevelExit() < AB_EXIT_REACH) this._abLeaveByExit();
      return;
    }
    if (ab.lift) {
      if (!ab.lift.ride && this._abLevelLift(0) < AB_LIFT_REACH) this._abRideUp();
      return;
    }
    this._abHeard(running);
    this._abFillCases();
    this._abFillCreatures();
  },

  _abAttack() {
    const ab = this.ab;
    if (ab.exit || ab.lift) { this.audio.play('empty_click'); return; }
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
      // (8.1.2, Russell: below the Edge the double tap still says how many are wanted, but
      // smashing a case says nothing.)
      this._report(ab.exit || ab.lift ? `All ${ab.quota} glass cases.` : `${ab.smashed} of ${ab.quota} glass cases.`, true);
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
    if (ab.lift) {
      if (ab.lift.hum) ab.lift.hum.stop();
      if (ab.lift.ride && ab.lift.ride.voice) ab.lift.ride.voice.stop();
      ab.lift = null;
    }
    ab.stopped = true;
    for (const stem of [...AB_THUNDERS, AB_IDLE, AB_GROWL]) this.audio.pins.delete(`abyss:${stem}`);
  },
};

// ------------------------------------------------------------------ help
const HELP_SECTIONS = [
  ['The Abyss', [
    { title: 'The Abyss', sound: null, desc: 'The Abyss is a mode of its own, new in 6.2.0, inspired by Papa Sangre, the horror game made only of sound, where you creep through the dark past monsters you can only hear. You are in a huge, endless abyss, with no walls and no edge, and the whole floor is broken glass: every step you take can be heard. Creatures live all through it. Your goal is to smash as many glass cases as you can before the clock runs out. You turn and walk as in every walking mode (see General Turning). Double tap for the cases you have smashed, your lives, the seconds left and the way you are facing. Since 8.0.0, choosing The Abyss on the main menu opens a small menu: The Abyss, or its sub mode The Edge, where you cross the abyss on a narrow ledge (see The Edge).' },
    { title: 'The Abyss The Creatures', sound: null, desc: 'The creatures are blind, just like you, and they hunt by sound, so they come for you only while you move. Walk, and your steps on the glass are soft: only a creature within about four steps hears them, and it creeps a little toward the sound, quietly, breathing rather than growling, so if you keep walking you leave it behind. Run, and your steps are loud: the ones within about twenty steps hear them and charge you, growling, a little slower than you can run. Stop, and they stop hunting you: each one goes back to wandering the abyss very slowly, in no particular direction, never toward you, and it always turns away before it comes within three steps of you, so a creature that has not heard you can never stumble into you. Standing still never gets you away from them; it only holds them off, while the clock runs on. A wandering or creeping creature makes a quieter sound and faint footsteps, and it fades quickly as you leave it behind: half as loud about six steps away, a quarter by twelve, and only just heard further off. One charging you, or running to the lightning, growls, with a footstep on the glass for every step it takes, and carries much further. The creatures always keep about three steps apart from one another, and a creature that wakes does so fifteen to twenty-five steps from you, never right beside another. You cannot shoot them. If one catches you, you lose a life, and it is thrown far away.' },
    { title: 'The Abyss Lightning', sound: null, desc: 'Lightning is your cover. Every few seconds it strikes somewhere in the abyss, really loud: a thunderclap from where it strikes, while the wind and the hum of the cases dip under it. It lands fifteen to twenty-five steps from you, and every creature in the abyss runs toward it, each to its own spot around the strike, so they spread out instead of crowding into one pack. None of them ever comes nearer to you on the way: one on the far side of you from the strike runs off away from you instead. For five seconds after a strike your steps are not heard, so that is the moment to move, and a creature running to the lightning cannot catch you, even if it runs right past you. At first it strikes every six to ten seconds; as you smash more cases it comes less often, but never more than twenty-five seconds apart.' },
    { title: 'The Abyss Glass Cases', sound: null, desc: 'A glass case hums where it stands. Three stand around you at a time, and new ones appear further away the more you smash, a step further for every three cases, with no end, so on a long run you walk further for each one; their hum carries further to match, but only one knocks: the nearest, from about fifteen steps away, faster and louder as you close in, so you can turn until the knocking is centred between your ears. The others only hum, more softly, and the knocking moves to another case only when you smash this one or come two steps nearer to another. When you are beside a case and facing it, a bell rings: tap with two fingers to smash it, or press the spacebar. Smashing glass is loud: every creature within about ten steps charges you for about three seconds, unless the five seconds after a lightning strike have not yet run out, so a case is best smashed just after the lightning. Each case gives you time: ten seconds at first, and one second more for every six cases you smash, so fifteen at case thirty and twenty at case sixty, to pay for the longer walks; the voice does not say it. About three cases in ten also hold lightning: as it breaks, lightning strikes somewhere in the abyss and the creatures run to it instead of to you. And about one case in twenty also holds an extra life: you hear the heart, and the voice says it with your lives, such as Extra life, 4 lives. There is no limit to how many lives you can have. (Not in Chaos Mode, where the run has its one health bar.)' },
    { title: 'The Abyss Clock, Lives and Score', sound: null, desc: 'The clock starts at forty-five seconds, and only glass cases add to it, a little more for each case as the run goes on. You start with three lives, and a rare case gives you another, with no limit: when the clock runs out, or a creature catches you when you have one life left, the run is over. Every three cases you smash, one more creature wakes in the abyss, up to ten, the lightning comes a little less often, never more than twenty-five seconds apart, and new cases appear a step further away, with no end. Your score is the number of cases you smash, and The Abyss has its own high score board.' },
    { title: 'The Abyss in Chaos Mode', sound: null, desc: 'Chaos Mode has Abyss levels too. You know you are in one at once: lightning strikes the moment you arrive, so move. There you must smash a set number of cases: three or four the first time in a run, and one more each time after, at most eight. Each case adds ten seconds to the chaos clock. When you have smashed enough, the creatures, the cases and the lightning all go, and over the wind of the abyss, which plays on, an exit is heard, the battle exit\'s Morse signal; the chaos clock waits until you walk through it. There a catch costs 25 health from the one health bar of the chaos run (see Chaos Health) instead of a life. There, double tap for the cases smashed, then your health, the clock and the points. Since 8.1.4 these levels follow The Abyss\'s own rules for the creatures, the lightning and the cases, as described above, but keep their own rewards. A fall from the edge of an abyss in Chaos Mode also lands you on an abyss\'s floor, with cases to smash and an elevator back up instead of an exit (see The Edge in Chaos Mode).' },
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
  if (g === 'enter') {
    if (ab.lift && ab.lift.ride) { game._report('Riding the elevator up.', true); return; }
    game._abReport(); return;
  }
  if (ab.lift && ab.lift.ride) return;      // (8.1.0) no moving in the elevator
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
  turns(game) { return game.state === STATE && !(game.ab && game.ab.lift && game.ab.lift.ride); },
  blockPause(game) { return !!(game.ab && game.ab.lift && game.ab.lift.ride); },
  blockStride(game) { return !!(game.ab && game.ab.lift && game.ab.lift.ride); },
  surroundings() { return [1.0, 0.0]; },     // no walls anywhere
  strideSig(game) { return game.ab ? `${!!game.ab.exit}|${!!game.ab.lift}|${!!(game.ab.lift && game.ab.lift.ride)}` : ''; },
  status(game) {
    const ab = game.ab;
    if (!ab) return 'The Abyss.';
    return `The Abyss. ${ab.smashed} ${plural(ab.smashed, 'case')} smashed. ${ab.lives} ${plural(ab.lives, 'life', 'lives')}.`;
  },
  boards: [{ key: BOARD, label: 'The Abyss', fmt: (v) => `${v} ${v === 1 ? 'case' : 'cases'}` }],
  help: { sections: HELP_SECTIONS, demos: HELP_DEMOS },
};
