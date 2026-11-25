// Story Mode (web 7.3.0, Russell's design, 25 November 2026; website only).
//
// A walk through how Endless Labyrinth works, told by Bella, the game's own recorded
// voice: twenty-three chapters (web 7.5.0; 7.4.0 had twenty; 7.3.0's ten told how the
// game was made, which the website's Story page already tells). The first eight are the basics: headphones and
// centring a sound, turning, in front and behind, distance and walking, walls, echo and
// the report. Then a chapter for every mode, each a small room with one task. Bella
// tells the chapter and gives the task; only the room's background plays while she
// talks, and its own sounds (and the door) start once she has finished (7.3.1, Russell).
// When the task is done a door opens: find it by ear and walk through it. Nothing can
// hurt you, there is no clock, and no task can be failed.
//
// Midway, once, after chapter 11, Driving (Russell: "but not everything is so easy"), you are
// dropped into one practice area at random: a battle whose three enemies stand still, an
// island's guardian that never moves, or the abyss with a glass case to smash. Bella says
// what it is, you finish its one task, and you are pulled back into the story.
//
// The first time through, the chapters come in order. Once the story has been walked to
// its end (the setting storyDone2: 7.4.0 started everyone afresh), Story Mode opens with
// a list of the chapters; the story carries on from the chapter chosen to the end.
//
// Bella's lines are js/storymode-lines.js, recorded (packs/story-voice-*.elpack, played
// by their ids as the characters' lines are: js/voice.js CastVoices). Without their
// recordings, or with the Speech setting Off, the device's voice (or the Braille
// display) says them instead.

import { aliasRecording, addMade } from './events/sounds.js';
import { CastVoices } from './ultimate/cast.js';
import { CASE_SOUND, CASE_CHIME, CASE_SMASH, CASE_REACH, AMBIENCE_LEVEL, BACKGROUND_SEND } from './ultimate.js';
import { AB_IDLE, AB_BACKGROUND, AB_STEPS_GLASS, AB_THUNDERS } from './abyss.js';
import { tuneSound } from './museum.js';
import { makeSounds as makeUltimateSounds, compassName, COMPASS_BEEP_EVERY, COMPASS_BEEP_TURNING, GUIDE_LEVEL } from './ultimate.js';
import { STORY_LINES } from '../storymode-lines.js';
import { RULES } from '../sound-rules.js';

export const STATE = 'story';
export const MENU_STATE = 'story_menu';

// ------------------------------------------------------------------ constants
export const SM_STEP = 3.0;                     // one step, in the game's units
export const SM_HALF = 30.0;                    // a room: this far each way from its middle (20 steps across)
export const SM_DOOR_REACH = 3.5;               // units: this near the door is walking through it
export const SM_DOOR_RANGE = [15.0, 24.0];      // how far from you the door appears
export const SM_DOOR_AWAY = 12.0;               // and never nearer than this (four steps: you always walk to it)
export const SM_DOOR = 'exit_morse';            // the door, sounding: the battle exit's Morse signal
export const SM_DOOR_LEVEL = 0.9;
export const SM_DOOR_OPEN = 'mu_door_open';     // (the Museum's door)
export const SM_DOOR_CLOSE = 'mu_door_close';
export const SM_DONE = 'evt_chime_clear';       // a task done
export const SM_VOICE_LEVEL = 1.0;              // Bella, telling the story (not placed: she is the narrator)
export const SM_VOICE_SEND = 0.12;
export const SM_WAIT_VOICE = 2.5;               // seconds a line waits for its recording to be decoded
export const SM_STEPS_STONE = ['step_stone_1', 'step_stone_2', 'step_stone_3', 'step_stone_4'];
export const SM_REACH = 3.0;                    // units: this near a goal (the stairs, the elevator, a corridor's end) is reaching it
// Chapter 1: the bell is centred within this share of its distance, for this long.
export const SM_CENTRED = 0.17;                 // about 10 degrees either side
export const SM_CENTRED_FOR = 0.5;
// Chapter 2: facing north, held this long (a turn that has landed).
export const SM_NORTH_FOR = 0.3;
// Chapter 2: the held slide's full circle, give or take this much.
export const SM_ROUND_SLACK = 0.35;             // about 20 degrees
// Chapter 5: the run and the walk backwards.
export const SM_RUN_FROM = 24.0;                // you begin this far south of the middle, the bell as far north (16 steps apart)
export const SM_RUN_STEPS = 5;                  // run steps for the run to count
export const SM_BACK_STEPS = 4;                 // steps walked backwards, by a held slide down
// Chapter 19: the compass leads to a safe zone this far away.
export const SM_COMPASS_DIST = 24.0;
// Chapter 20: Mother Hazel stands this far away, greets every so often, and is met this near.
export const SM_HAZEL_DIST = 18.0;
export const SM_HAZEL_REACH = 4.5;
export const SM_GREET_GAP = [3.5, 5.5];
// Chapter 3: the circling enemy, and how long it must be behind you, then in front.
export const SM_CIRCLE_R = 12.0;
export const SM_CIRCLE_LAP = 24.0;              // seconds a lap
export const SM_BEHIND_FOR = 1.2;
export const SM_FRONT_FOR = 0.8;
// Chapter 4: the fountain is reached this near; it fades over this far.
export const SM_FOUNTAIN_REACH = 5.0;
export const SM_FOUNTAIN_RANGE = 34.0;
// Chapter 6: the small room, and where the great hall begins.
export const SM_SMALL_HALF = 6.0;               // the small room: this far each side
export const SM_SMALL_BACK = 6.0;               // ... its back wall (you begin a step in front of it)
export const SM_HALL_FROM = -3.0;               // the opening: the hall is north of this (two steps ahead)
export const SM_HALL_DONE = -12.0;              // three steps into the hall
export const SM_HALL_FAR = -48.0;               // the hall's far wall (15 steps on)
// Chapter 10: the road's three lanes, and the car coming at you.
export const SM_LANES = [-4.0, 0.0, 4.0];
export const SM_CAR_FROM = 60.0;                // it starts this far ahead
export const SM_CAR_SPEED = 12.0;               // units a second
export const SM_CAR_WAIT = 8.0;                 // in your lane, it waits this far ahead until you move
export const SM_CAR_GONE = 30.0;                // and is gone this far behind you
// Chapter 13: Bella calls from here, and is reached this near.
export const SM_BELLA_DIST = [20.0, 26.0];
export const SM_BELLA_REACH = 6.0;
export const SM_CALL_GAP = [1.0, 2.0];
export const SM_CALLS = 5;
// Chapter 17: two places, the border between them at the room's middle.
export const SM_AREA_START = 12.0;              // you begin four steps south of the border
export const SM_AREA_BLEND = 6.0;               // the next place is heard from two steps before the border
export const SM_AREA_DONE = -9.0;               // three steps past it
// Chapter 19: the items of the collecting mission.
export const SM_ITEMS = 3;
// The practice areas (the twist), and chapter 9's battle.
export const SM_ENEMIES = 3;
export const SM_AIM = 0.3;                      // a shot hits what is centred within this share of its distance
export const SM_GUARDIAN_HITS = 3;
export const SM_GUARDIAN_GAIN = 1.3;

const RATE = 44100;
// Chapter 20's Mother Hazel: lines she already says in Ultimate Mode (js/data/story-lines.json),
// recorded in her own voice.
const HAZEL = {
  greet: [
    { id: 'witch.greet.001', text: 'Over here, dearie. Follow the bubbling.' },
    { id: 'witch.greet.005', text: "I'm by the pot. Follow your ears." },
    { id: 'witch.greet.006', text: 'Hello there. Over here, by the steam.' },
    { id: 'witch.greet.010', text: "Follow my voice. That's it. A little closer." },
    { id: 'witch.greet.011', text: 'Psst. Here. By the bubbling pot.' },
  ],
  story: { id: 'witch.story.001', text: "Ah, a visitor. Sit a while. The world won't wait, but I will." },
  gift: { id: 'witch.gift.001', text: 'Here you are, dearie. Fresh from the pot.' },
};
const VOICE_ROOMS = ['lab', 'tower', 'battle', 'cathedral', 'hall'];

// The chapters, as the chapter list names them, and each room's echo (web 7.4.0: the
// new Story Mode, about how the game works; Russell, 25 November 2026).
export const CHAPTERS = [
  { n: 1, title: 'Welcome', room: 'lab' },
  { n: 2, title: 'Turning', room: 'lab' },
  { n: 3, title: 'In front and behind', room: 'battle' },
  { n: 4, title: 'Walking', room: 'battle' },
  { n: 5, title: 'Running and walking backwards', room: 'battle' },
  { n: 6, title: 'Walls and edges', room: 'lab' },
  { n: 7, title: 'Echo', room: 'lab' },
  { n: 8, title: 'The report', room: 'lab' },
  { n: 9, title: 'Standard Mode', room: 'lab' },
  { n: 10, title: 'Battle Mode', room: 'battle' },
  { n: 11, title: 'Driving Mode', room: null },
  { n: 12, title: 'Tower Mode', room: 'tower' },
  { n: 13, title: 'Island Mode', room: null },
  { n: 14, title: 'Find the Voice', room: 'battle' },
  { n: 15, title: 'The Abyss', room: 'battle' },
  { n: 16, title: 'Water Park', room: 'hall' },
  { n: 17, title: 'The Museum', room: 'hall' },
  { n: 18, title: 'Ultimate Mode', room: 'lab' },
  { n: 19, title: 'The compass', room: 'battle' },
  { n: 20, title: 'Safe zones and characters', room: 'lab' },
  { n: 21, title: 'Chaos Mode', room: 'battle' },
  { n: 22, title: 'Events', room: 'battle' },
  { n: 23, title: 'Help and settings', room: 'lab' },
];
export const SM_CHAPTERS = CHAPTERS.length;
export const SM_TWIST_AFTER = 11;               // the twist comes after this chapter's door (Driving)
// The setting that says the story has been walked to its end. (7.4.0: a new one, so
// every player walks the new, longer story in order before the chapter list opens.)
export const SM_DONE_KEY = 'storyDone2';
export const TWISTS = ['battle', 'guardian', 'abyss'];

// ------------------------------------------------------------------ helpers
const rand = Math.random;
const uniform = (a, b) => a + (b - a) * rand();
const choice = (arr) => arr[Math.floor(rand() * arr.length)];
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const TAU = Math.PI * 2;
const wrapPi = (a) => { let x = a % TAU; if (x > Math.PI) x -= TAU; if (x < -Math.PI) x += TAU; return x; };
// A spot at this bearing (radians, clockwise from north) and distance from a place.
const at = (from, bearing, d) => [from[0] + Math.sin(bearing) * d, from[1] - Math.cos(bearing) * d];

export function storyLine(id) { return STORY_LINES[id] ? { id, text: STORY_LINES[id] } : null; }

// The lines a chapter says as you arrive, and when its task is done.
function linesOf(n) {
  if (n === CHAPTERS.length) return { arrive: [`story.${n}.story`, `story.${n}.end`], done: [] };
  return { arrive: [`story.${n}.story`, `story.${n}.task`], done: [`story.${n}.done`] };
}

// ------------------------------------------------------------------ the game's methods
const mixin = {
  // Story Mode from the main menu: the first time, chapter 1; after the story has been
  // walked to its end, the chapter list.
  openStoryMode() {
    if (this.scores && this.scores.settings && this.scores.settings[SM_DONE_KEY]) {
      this.state = MENU_STATE;
      this.storyMenuIndex = 0;
      this.tts.speak('Story Mode. Choose a chapter. ' + this._smMenuLine(0));
      return;
    }
    this.startStory(1);
  },

  _smMenuItems() { return [...CHAPTERS.map((c) => c.n), 'back']; },

  _smMenuLine(i) {
    const k = this._smMenuItems()[i];
    if (k === 'back') return 'Back to the main menu';
    return `Chapter ${k}, ${CHAPTERS[k - 1].title}`;
  },

  storyMenuInput(g) {
    const items = this._smMenuItems();
    if (g === 'back') { this._toMenu(); return; }
    if (g === 'up' || g === 'down') {
      this.storyMenuIndex = (this.storyMenuIndex + (g === 'up' ? -1 : 1) + items.length) % items.length;
      this.audio.play('menu_move');
      this.tts.speak(this._smMenuLine(this.storyMenuIndex));
    } else if (g === 'enter') {
      this.audio.play('menu_move');
      const k = items[this.storyMenuIndex];
      if (k === 'back') this._toMenu();
      else this.startStory(k);
    }
  },

  // A walk through the story, from chapter `n` to the end.
  startStory(n = 1) {
    this.state = STATE;
    this.resetGameState();
    this.state = STATE;
    this._wake(true);
    if (this.ambienceChannel) { this.ambienceChannel.stop(); this.ambienceChannel = null; }
    if (this.beatChannel) { this.beatChannel.stop(); this.beatChannel = null; }
    this.sm = { run: this.runId, chapter: 0, twistDone: n > SM_TWIST_AFTER, room: null, say: { queue: [], voice: null, until: 0, line: null, waitSince: 0 }, sounds: [], extra: [], phase: 'story', door: null };
    this._smChapter(n);
  },

  _smVoices() {
    if (!this.castVoices) this.castVoices = new CastVoices(this.tts && this.tts.bella ? this.tts.bella.library : null);
    return this.castVoices;
  },

  _smSilent() { try { return !!(this.tts && this.tts.muted && this.tts.muted()); } catch (e) { return false; } },

  // ---------------------------------------------------------------- Bella
  // Lines wait their turn; `after` runs once the line has been heard out. `pos`: said
  // from there (chapter 6's calls), placed; otherwise she is the narrator, unplaced.
  _smQueue(id, { after = null, pos = null } = {}) {
    const ln = storyLine(id);
    if (!ln) { if (after) after(); return; }
    const say = this.sm.say;
    say.queue.push({ ln, after, pos });
    this._smPrefetch(id);
  },

  // A line's recording decoded ahead, so it is ready when its turn comes.
  _smPrefetch(id) {
    const ln = storyLine(id);
    try { const cv = this._smVoices(); if (ln && cv.has(ln)) cv.peek(ln); } catch (e) { /* said by the device */ }
  },

  _smTalking() {
    const say = this.sm.say;
    return !!(say.voice && say.voice.busy) || say.until > 0 || !!say.line || say.queue.length > 0;
  },

  _smHush() {
    const say = this.sm && this.sm.say;
    if (!say) return;
    if (say.voice) { say.voice.stop(); say.voice = null; }
    say.until = 0; say.line = null; say.queue = [];
  },

  // Say the item now: its recording; the device's voice if it has none (or it cannot be
  // decoded in time); the Braille display alone with the Speech setting Off. False
  // while its recording is still being decoded.
  _smSay(item) {
    const say = this.sm.say; const ln = item.ln;
    if (this._smSilent()) {
      this.tts.speak(ln.text, { interrupt: false });
      say.until = 0.6 + ln.text.length * 0.065;
      say.line = item;
      return true;
    }
    const cv = this._smVoices();
    if (cv.has(ln)) {
      const buf = cv.peek(ln);
      if (buf) {
        const name = 'sm_line';
        this.audio.entries.set(name, { dry: { frames: 0, made: true } });
        RULES.FAMILY[name] = 'speech';
        RULES.ROOMS[name] = VOICE_ROOMS;
        this.audio.buffers.set('dry:' + name, buf);
        this.audio.buffers.delete('dull:' + name);
        // keep: a line is never the sound cut off when too many play at once.
        say.voice = this.audio.play(name, { volume: item.pos ? 0.0 : SM_VOICE_LEVEL, send: SM_VOICE_SEND, keep: true });
        say.until = 0; say.waitSince = 0; say.line = item;
        this._smLevelVoice();
        return true;
      }
      const now = performance.now();
      if (!say.waitSince || say.waitFor !== ln.id) { say.waitSince = now; say.waitFor = ln.id; }
      if (!cv.failed(ln) && now - say.waitSince < SM_WAIT_VOICE * 1000) return false;
    }
    say.waitSince = 0;
    this.tts.speak(ln.text, { interrupt: false });
    say.until = 0.6 + ln.text.length * 0.065;
    say.line = item;
    return true;
  },

  _smLevelVoice() {
    const say = this.sm.say;
    const item = say.line;
    if (!item || !item.pos || !say.voice || !say.voice.busy) return;
    const [l, r] = this._smLevels(item.pos, 1.0, 48.0, 0.18);
    say.voice.setVolume(l, r, this._behind(item.pos));
  },

  _smUpdateSay(dt) {
    const sm = this.sm; const say = sm.say;
    if (say.voice && !say.voice.busy) say.voice = null;
    if (say.until > 0) say.until -= dt;
    if (say.voice) { this._smLevelVoice(); return; }
    if (say.until > 0) return;
    if (say.line) {
      const item = say.line;
      say.line = null;
      try { this._smVoices().done(item.ln); } catch (e) { /* nothing held */ }
      if (item.after) { item.after(); if (this.sm !== sm) return; }
    }
    if (say.queue.length && this._smSay(say.queue[0])) say.queue.shift();
  },

  // ---------------------------------------------------------------- sounds of a room
  // Levels for a place, panned as Battle pans: `gain` beside you, falling to `floor`
  // at `range` and beyond.
  _smLevels(pos, gain, range, floor) {
    const dx = pos[0] - this.playerPos[0]; const dy = pos[1] - this.playerPos[1];
    const d = Math.hypot(dx, dy);
    const pan = d > 0 ? dx / d : 0;
    const v = Math.min(1, Math.max(floor, 1 - d / range) * gain);
    return [v * (1 - Math.max(0, pan)), v * (1 - Math.max(0, -pan)), d];
  },

  // An event's recording under a name that sounds from a place (a beacon: its echo,
  // and the dull copy behind you), or as a room's background.
  _smEventName(stem, role = 'beacon') {
    const name = role === 'amb' ? `event_amb_file_${stem}` : `event_beacon_file_${stem}`;
    return aliasRecording(this.audio, stem, name) || (this.audio.has(stem) ? stem : null);
  },

  // A sound that loops at a place, kept level every frame. gain/range/floor: its
  // loudness as you come near (`floor` keeps it heard across the room).
  _smPlace(name, pos, { gain = 0.9, range = 40.0, floor = 0.12, tag = null, always = false } = {}) {
    if (!name || !this.audio.has(name)) return null;
    // (7.3.1, Russell: a room's own sounds start only once Bella has said what to do;
    // until then only its background plays. sm.live: they may sound.)
    // (`always`: part of the room's air, like chapter 4's fountain, it plays from the
    // moment you arrive, while Bella talks. 7.5.1, Russell.)
    const s = { name, pos, gain, range, floor, tag, always, voice: this.sm.live || always ? this.audio.play(name, { loops: -1, volume: 0.0, fadeMs: 300 }) : null };
    this.sm.sounds.push(s);
    this._smLevelSound(s);
    return s;
  },

  _smLevelSound(s) {
    if (!s.voice && (this.sm.live || s.always)) s.voice = this.audio.play(s.name, { loops: -1, volume: 0.0, fadeMs: 300 });
    if (!s.voice || !s.voice.busy) return;
    const [l, r] = this._smLevels(s.pos, s.gain, s.range, s.floor);
    s.voice.setVolume(l, r, this._behind(s.pos));
  },

  _smUnplace(s, fadeMs = 300) {
    if (!s) return;
    if (s.voice) { s.voice.fadeout(fadeMs); s.voice = null; }
    this.sm.sounds = this.sm.sounds.filter((x) => x !== s);
  },

  // A one-shot from a place.
  _smShot(name, pos, volume = 0.9, keep = false) {
    if (!name || !this.audio.has(name)) return null;
    const [l, r] = this._smLevels(pos, volume, 40.0, 0.15);
    return this.audio.play(name, { at: pos, volume: Math.max(l, r), keep });
  },

  // The room's background: wide, all round you.
  _smBackground(stem, level = AMBIENCE_LEVEL) {
    const sm = this.sm;
    if (sm.bg) { sm.bg.fadeout(600); sm.bg = null; }
    if (!stem) return;
    const name = stem.startsWith('evt_') ? this._smEventName(stem, 'amb') : stem;
    if (name && this.audio.has(name)) sm.bg = this.audio.play(name, { loops: -1, volume: level, fadeMs: 800, send: BACKGROUND_SEND });
  },

  // Everything of the room stopped (between chapters, quitting).
  _smClearRoom(fadeMs = 300) {
    const sm = this.sm;
    if (!sm) return;
    for (const s of sm.sounds) if (s.voice) { if (fadeMs > 0) s.voice.fadeout(fadeMs); else s.voice.stop(); }
    sm.sounds = [];
    if (sm.bg) { if (fadeMs > 0) sm.bg.fadeout(fadeMs); else sm.bg.stop(); sm.bg = null; }
    if (sm.door && sm.door.voice) { if (fadeMs > 0) sm.door.voice.fadeout(fadeMs); else sm.door.voice.stop(); }
    for (const v of sm.extra) if (v) { if (fadeMs > 0) v.fadeout(fadeMs); else v.stop(); }
    sm.extra = [];
    if (sm.room && sm.room.engine) { sm.room.engine.stop(); sm.room.engine = null; }
    sm.door = null;
    sm.room = null;
  },

  // ---------------------------------------------------------------- chapters
  // A chapter: you at the room's start, facing north (chapter 2: any way but north), the
  // room's background, the places of its sounds (which start only once Bella has told you
  // what to do: sm.live), and Bella's lines.
  _smChapter(n) {
    const sm = this.sm;
    this._smClearRoom();
    this._smHush();
    sm.chapter = n;
    sm.twist = null;
    sm.phase = 'story';
    sm.live = false;
    sm.waitFor = null;
    sm.freshDue = true;
    this.level = n;
    this.playerPos = [0.0, 0.0];
    this.arenaLimit = SM_HALF;
    this.stride = null;
    this._face(0, true);
    const room = sm.room = { n, held: 0, step: 0, ok: null, steps: SM_STEPS_STONE };
    this._syncRoom();
    const p0 = [0, 0];
    const set = SETUP[n];
    if (set) set.call(this, room, p0);
    this._syncRoom();
    const { arrive } = linesOf(n);
    arrive.forEach((id, i) => this._smQueue(id, { after: i === arrive.length - 1 ? () => this._smTaskBegins() : null }));
    for (const id of [...linesOf(n).done, `story.${n}.task2`]) this._smPrefetch(id);
  },

  // A task in two parts (chapters 2 and 5): the first part done, a soft click; Bella's
  // second line; the second part counts once she has said it.
  _smNextPart(r) {
    if (r.step !== 0) return;
    r.step = 1;
    this.audio.play('ut_click', { volume: 0.6 });
    const sm = this.sm;
    this._smQueue(`story.${r.n}.task2`, { after: () => { if (sm.room === r) { r.step = 2; r.face = this.tn.face; r.turned = 0; } } });
  },

  // A line that is not Bella's (chapter 20's Mother Hazel), said as hers are.
  _smQueueLine(ln, { after = null, pos = null } = {}) {
    this.sm.say.queue.push({ ln, after, pos });
    try { const cv = this._smVoices(); if (cv.has(ln)) cv.peek(ln); } catch (e) { /* said by the device */ }
  },

  // Chapter 19's compass: on (it names the goal and how far, the room goes quiet, and
  // its beep guides you), or off.
  _smCompass(on, quiet = false) {
    const room = this.sm.room;
    if (!room || !room.compass || room.arrived) return;
    if (on === undefined) on = !room.on;
    room.on = on;
    if (on) {
      room.used = true;
      room.beep = 0.3;
      const steps = Math.max(1, Math.round(dist2(room.goal, this.playerPos) / SM_STEP));
      this.tts.speak(`Compass on. Safe zone, ${steps} ${steps === 1 ? 'step' : 'steps'}.`, { interrupt: true });
      if (this.sm.bg) this.sm.bg.setVolume(0.15);
    } else {
      if (!quiet) this.tts.speak('Compass off.', { interrupt: true });
      if (this.sm.bg) this.sm.bg.setVolume(0.6);
    }
  },

  // The task line heard out: the room's sounds start, and the task counts from now. The
  // last chapter has none: its door opens.
  _smTaskBegins() {
    const sm = this.sm; const room = sm.room;
    sm.live = true;
    if (sm.chapter === SM_CHAPTERS) { sm.phase = 'done'; this._smOpenDoor(); return; }
    sm.phase = 'task';
    if (room && room.onLive) room.onLive.call(this, room);
  },

  // A task done: the chime, Bella's line, and the door opens.
  _smTaskDone() {
    const sm = this.sm; const room = sm.room;
    if (sm.phase !== 'task') return;
    sm.phase = 'done';
    if (sm.twist) { this._smTwistDone(); return; }
    this.audio.play(SM_DONE, { volume: 0.8, keep: true });
    if (room.onDone) room.onDone.call(this, room);
    const { done } = linesOf(sm.chapter);
    // (A room whose goal is where its door stands opens the door at once: you are there.)
    const here = room.doorHere;
    done.forEach((id, i) => this._smQueue(id, { after: i === done.length - 1 && !here ? () => this._smOpenDoor(room.doorAt || null) : null }));
    if (here) this._smOpenDoor(sm.door ? sm.door.pos : room.doorAt);
  },

  // The door: it opens, and sounds where it stands until you walk through it.
  // (`sound: false`: a door that is the task's goal, sounding from the task's start, shut.)
  _smOpenDoor(pos = null, { sound = true } = {}) {
    const sm = this.sm; const room = sm.room;
    if (sm.door && sm.door.open) return;
    if (!pos) {
      const lim = SM_HALF - 2;
      for (let i = 0; i < 400 && !pos; i++) {
        const p = at(this.playerPos, uniform(0, TAU), uniform(...SM_DOOR_RANGE));
        if (room && room.events) { p[0] = Math.round(p[0] / SM_STEP) * SM_STEP; p[1] = Math.round(p[1] / SM_STEP) * SM_STEP; }
        const fits = room && (room.doorOk || room.ok);
        if (dist2(p, this.playerPos) < SM_DOOR_AWAY) continue;
        if (fits ? fits(p) : Math.abs(p[0]) <= lim && Math.abs(p[1]) <= lim) pos = p;
      }
      if (!pos) pos = [0, -SM_HALF + 3];
    }
    if (sm.door && sm.door.voice && dist2(sm.door.pos, pos) > 0.01) { sm.door.voice.fadeout(300); sm.door.voice = null; }
    if (!sm.door || dist2(sm.door.pos, pos) > 0.01) sm.door = { pos, voice: null };
    sm.door.open = sound;
    if (sound) this._smShot(SM_DOOR_OPEN, pos, 0.9, true);
    this._smLevelDoor();
  },

  _smLevelDoor() {
    const door = this.sm.door;
    if (door && !door.voice && this.sm.live) door.voice = this.audio.play(SM_DOOR, { loops: -1, volume: 0.0, fadeMs: 400 });
    if (!door || !door.voice) return 1e9;
    const [l, r, d] = this._smLevels(door.pos, SM_DOOR_LEVEL, 45.0, 0.2);
    door.voice.setVolume(l, r, this._behind(door.pos));
    return d;
  },

  // Through the door: the next chapter (after chapter 10, the twist, once); after the
  // last, the menu.
  _smThroughDoor() {
    const sm = this.sm;
    this.audio.play(SM_DOOR_CLOSE, { volume: 0.8, keep: true });
    const n = sm.chapter;
    if (n >= SM_CHAPTERS) { this._smFinish(); return; }
    if (n === SM_TWIST_AFTER && !sm.twistDone) { this._smTwist(); return; }
    this._smChapter(n + 1);
  },

  _smFinish() {
    if (this.scores && this.scores.settings) { this.scores.settings[SM_DONE_KEY] = true; try { this.scores.save(); } catch (e) { /* kept next time */ } }
    this._smStopAll();
    this._stopRunSounds();
    this.runId += 1;
    this._toMenu('Story Mode finished. From now on, Story Mode opens with a list of the chapters. Main Menu. ');
  },

  // ---------------------------------------------------------------- the twist
  _smTwist(kind = null) {
    const sm = this.sm;
    this._smClearRoom(80);
    this._smHush();
    sm.twistDone = true;
    sm.phase = 'story';
    sm.live = false;
    sm.freshDue = true;
    const t = sm.twist = { kind: kind || choice(TWISTS), hp: SM_GUARDIAN_HITS, targets: [] };
    sm.room = { n: 'twist', steps: t.kind === 'abyss' ? AB_STEPS_GLASS : SM_STEPS_STONE };
    this.playerPos = [0.0, 0.0];
    this.arenaLimit = SM_HALF;
    this.stride = null;
    this._face(0, true);
    this._syncRoom();
    // (7.3.1, Russell: the thunder cut her line off. She says it first, in silence; then
    // the thunder, heard out; then the practice area.)
    this._smQueue('story.twist.twist', {
      after: () => {
        if (this.sm !== sm || sm.twist !== t) return;
        const thunder = AB_THUNDERS.find((s) => this.audio.has(s));
        const v = thunder ? this.audio.play(thunder, { volume: 0.9, keep: true }) : null;
        sm.waitFor = { voice: v, then: () => this._smTwistArea() };
      },
    });
  },

  _smTwistArea() {
    const sm = this.sm; const t = sm.twist;
    if (!t) return;
    const p0 = this.playerPos;
    if (t.kind === 'battle') {
      this._smEnemies(t.targets, p0);
      this._smBackground('drm_06_tribal_beat', 0.3);
    } else if (t.kind === 'guardian') {
      const s = this._smPlace('guardian', at(p0, uniform(0, TAU), 15.0), { gain: SM_GUARDIAN_GAIN, range: 40, floor: 0.2, tag: 'guardian' });
      if (s) t.targets.push(s);
      this._smBackground('island_06_wind_and_waves', AMBIENCE_LEVEL);
    } else {
      const s = this._smPlace(this._smEventName(CASE_SOUND), at(p0, uniform(0, TAU), 20.0), { gain: 0.75, range: 50, floor: 0.2, tag: 'case' });
      if (s) t.targets.push(s);
      this._smBackground(AB_BACKGROUND, AMBIENCE_LEVEL);
    }
    this._syncRoom();
    this._smQueue(`story.twist.${t.kind}`, { after: () => { if (this.sm === sm && sm.twist === t) { sm.phase = 'task'; sm.live = true; } } });
  },

  _smTwistDone() {
    const sm = this.sm; const t = sm.twist;
    this.audio.play(SM_DONE, { volume: 0.8, keep: true });
    this._smQueue(`story.twist.${t.kind}.done`);
    this._smQueue('story.twist.back', {
      after: () => {
        if (this.sm !== sm) return;
        const warp = this._smEventName('evt_exit_warp', 'pickup');
        if (warp) this.audio.play(warp, { volume: 0.7, keep: true });
        this._smChapter(SM_TWIST_AFTER + 1);
      },
    });
  },

  // Three battle enemies standing still around a place, a third of a circle apart.
  _smEnemies(into, p0) {
    const b = uniform(0, TAU);
    const names = ['obstacle_0', 'obstacle_3', 'obstacle_6'];
    for (let i = 0; i < SM_ENEMIES; i++) {
      const s = this._smPlace(names[i], at(p0, b + i * TAU / SM_ENEMIES + uniform(-0.3, 0.3), uniform(12.0, 18.0)), { gain: 0.9, range: 40, floor: 0.2, tag: 'enemy' });
      if (s) into.push(s);
    }
  },

  // A glass case within reach and faced, as The Abyss's and The Museum's are.
  _smCaseReady(c) {
    if (!c) return false;
    const [side, ahead] = this._rel(c.pos);
    const d = dist2(c.pos, this.playerPos);
    return d < CASE_REACH + 1.5 && (d < 1.0 || (ahead > 0 && Math.abs(side) / d < 0.5));
  },

  // The attack (a two-finger tap, or the spacebar): in the practice areas, chapter 9's
  // battle and chapter 16's glass case.
  _smFire() {
    const sm = this.sm; const t = sm.twist; const room = sm.room;
    if (sm.phase !== 'task' || !room) return;
    let kind = t ? t.kind : room.fire;
    if (!kind) return;
    const list = t ? t.targets : (room.targets || []);
    const live = list.filter((s) => sm.sounds.includes(s));
    if (kind === 'abyss' || kind === 'case') {
      const c = live[0];
      if (this._smCaseReady(c)) {
        this._smShot(CASE_SMASH, c.pos, 1.0, true);
        this._smUnplace(c, 80);
        this._smTaskDone();
      } else this.audio.play('empty_click');
      return;
    }
    this.audio.play('laser');
    let best = null; let bestD = Infinity;
    for (const s of live) {
      const [side, ahead] = this._rel(s.pos);
      const d = dist2(s.pos, this.playerPos);
      if (d > 0 && ahead > 0 && Math.abs(side) / d < SM_AIM && d < bestD) { best = s; bestD = d; }
    }
    if (!best) return;
    if (kind === 'guardian') {
      t.hp -= 1;
      if (t.hp > 0) { this._smShot('guardian_hit', best.pos, 1.0, true); return; }
      this._smUnplace(best, 80);
      this._smShot('guardian_down', best.pos, 1.0, true);
      this._smTaskDone();
      return;
    }
    // Down: Battle Mode's explosion from where it stood, a moment after the shot (the
    // farther it was, the later), as in Battle (7.5.1, Russell).
    this._smUnplace(best, 60);
    this._later(bestD * 0.015, 'explosion', [...best.pos]);
    if (!list.some((s) => sm.sounds.includes(s))) this._smTaskDone();
  },

  // ---------------------------------------------------------------- the frame
  updateStory(dt) {
    const sm = this.sm;
    if (!sm || this.isPaused || this.state !== STATE) return;
    this._smUpdateSay(dt);
    if (this.sm !== sm || this.state !== STATE) return;
    // A sound heard out before what comes next (the twist's thunder).
    if (sm.waitFor && !(sm.waitFor.voice && sm.waitFor.voice.busy)) { const f = sm.waitFor.then; sm.waitFor = null; f(); if (this.sm !== sm) return; }
    const room = sm.room;
    if (!room) return;
    if (room.frame && sm.live) room.frame.call(this, room, dt);
    if (this.sm !== sm) return;
    for (const s of sm.sounds) this._smLevelSound(s);
    const d = this._smLevelDoor();
    if (sm.phase === 'task' && !sm.twist && room.check) room.check.call(this, room, dt);
    if (this.sm !== sm) return;
    if (sm.phase === 'tune') {
      room.tuneWait -= dt;
      if (room.tuneWait <= 0 && !(room.tuneVoice && room.tuneVoice.busy)) { room.tuneVoice = null; sm.phase = 'task'; if (room.afterTune) room.afterTune.call(this, room); }
    }
    if (sm.phase === 'done' && sm.door && sm.door.open && d < SM_DOOR_REACH && !this._smTalking()) this._smThroughDoor();
  },

  // ---------------------------------------------------------------- walking
  _smStep(g) {
    const sm = this.sm; const room = sm && sm.room;
    if (!room || sm.phase === 'tune') return;
    let from = [...this.playerPos];
    if (room.drive) return;
    if (room.events) {
      // An event's step: one step north, south, west or east, whatever the way you face.
      const dir = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[g];
      const to = [from[0] + dir[0] * SM_STEP, from[1] + dir[1] * SM_STEP];
      if (Math.abs(to[0]) > SM_HALF || Math.abs(to[1]) > SM_HALF) { this.audio.play('boundary'); return; }
      this.playerPos = to;
    } else {
      const f = this.playerFacing = this._forward();
      const dir = g === 'up' ? f : [-f[0], -f[1]];
      if (room.ok) {
        // A room with walls of its own: straight into one, its knock from where it
        // stands; at a slant, you slide along it.
        const to = [from[0] + dir[0] * SM_STEP, from[1] + dir[1] * SM_STEP];
        let dest = null;
        if (room.ok(to)) dest = to;
        else if (room.ok([to[0], from[1]]) && Math.abs(to[0] - from[0]) >= SM_STEP * 0.25) dest = [to[0], from[1]];
        else if (room.ok([from[0], to[1]]) && Math.abs(to[1] - from[1]) >= SM_STEP * 0.25) dest = [from[0], to[1]];
        if (!dest) {
          // The wall: the first spot along the step that is not floor.
          let hit = to;
          for (let k = 1; k <= 6; k++) { const q = [from[0] + dir[0] * SM_STEP * k / 6, from[1] + dir[1] * SM_STEP * k / 6]; if (!room.ok(q)) { hit = q; break; } }
          this.audio.play('wall', { at: hit });
          return;
        }
        this.playerPos = dest;
      } else if (!this._walkArena(dir, SM_STEP, SM_HALF, { sound: false })) return;
    }
    this._syncRoom();
    const steps = typeof room.steps === 'function' ? room.steps.call(this, room) : room.steps;
    const bank = (steps || SM_STEPS_STONE).filter((nm) => this.audio.has(nm));
    if (bank.length) this.audio.play(choice(bank));
    if (room.onStep && sm.live) room.onStep.call(this, room);
    if (sm.twist && sm.twist.kind === 'abyss') this._smCaseChime(sm.twist.targets.find((s) => sm.sounds.includes(s)), sm.twist);
    if (sm.phase === 'task' && !sm.twist && room.check) room.check.call(this, room, 0);
    if (this.sm === sm && sm.phase === 'done' && sm.door && sm.door.open && this._smLevelDoor() < SM_DOOR_REACH && !this._smTalking()) this._smThroughDoor();
  },

  // A glass case's chime as you come within reach of it, facing it.
  _smCaseChime(c, holder) {
    if (!c) return;
    const ready = this._smCaseReady(c);
    if (ready && !holder.chimed) { holder.chimed = true; this._smShot(CASE_CHIME, c.pos, 0.8, true); } else if (!ready) holder.chimed = false;
  },

  // Left and right: a turn; on chapter 10's road, a change of lane.
  _smSide(g) {
    const sm = this.sm; const room = sm && sm.room;
    if (room && room.drive) {
      if (sm.phase !== 'task') return;
      const lane = room.lane + (g === 'right' ? 1 : -1);
      if (lane < 0 || lane > 2) { this.audio.play('boundary'); return; }
      room.lane = lane;
      this.playerPos = [SM_LANES[lane], 0];
      return;
    }
    if (room && room.events) { this._smStep(g); return; }
    this._turnQuick(g === 'right' ? 1 : -1);
  },

  // The room's echo.
  _smRoom() {
    const sm = this.sm;
    if (!sm || !sm.room) return 'lab';
    if (sm.twist) return sm.twist.kind === 'guardian' ? null : 'battle';
    const room = sm.room;
    if (room.roomAt) return room.roomAt.call(this, room);
    return CHAPTERS[room.n - 1].room;
  },

  // Enter's report: the chapter, and whether its door is open. (Chapter 7's task.)
  _smReport() {
    const sm = this.sm;
    if (!sm) return;
    let text;
    if (sm.twist) text = 'Story Mode. A practice area.' + (sm.phase === 'task' ? ' Nothing here can hurt you.' : '');
    else {
      const c = CHAPTERS[sm.chapter - 1];
      const open = sm.door && sm.door.open ? ' The door is open.' : '';
      text = `Story Mode. Chapter ${c.n} of ${SM_CHAPTERS}, ${c.title}.${open}`;
    }
    this._report(text);
    const room = sm.room;
    if (room && room.onReport && sm.phase === 'task') room.onReport.call(this, room, text);
  },

  // Chapter 14: Bella calls from where she stands until you reach her.
  _smBellaCalls(dt) {
    const room = this.sm.room;
    if (this._smTalking()) return;
    room.wait -= dt;
    if (room.wait > 0) return;
    room.wait = uniform(...SM_CALL_GAP);
    room.calls = (room.calls % SM_CALLS) + 1;
    const id = `story.14.call.${room.calls}`;
    // With the Speech setting Off, or no recording of her call, a soft shimmering
    // beacon sounds where she stands instead (as Find the Voice's guide's).
    let cv = null; try { cv = this._smVoices(); } catch (e) { /* none */ }
    if (this._smSilent() || !cv || !cv.has(storyLine(id))) {
      if (!room.beacon) room.beacon = this._smPlace('event_beacon_shimmer', room.bella, { gain: 0.7, range: 48, floor: 0.18 });
      return;
    }
    this._smQueue(id, { pos: room.bella });
  },

  _smStopAll() {
    const sm = this.sm;
    if (!sm) return;
    this._smHush();
    this._smClearRoom(0);
    sm.stopped = true;
  },
};

// ------------------------------------------------------------------ the rooms
// Each chapter's room: SETUP[n] lays it out (`this` is the game). A room may give:
//   ok(p)      its own walls (a spot is floor); otherwise the open floor of SM_HALF
//   check()    whether the task is done (each frame, and after each step)
//   frame()    what moves, once its sounds are live
//   onLive()   what starts when Bella has given the task
//   onDone()   what stops when it is done
//   doorAt, doorHere   where its door opens (doorHere: where the task's goal is)
//   roomAt()   its echo, if it changes with where you stand
//   steps      its footsteps
const rect = (x0, x1, y0, y1) => (p) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
const any = (...fs) => (p) => fs.some((f) => f(p));

const SETUP = {
  // 1. Welcome: centre the bell.
  1(room, p0) {
    room.bell = this._smPlace('event_beacon_bell', at(p0, uniform(70, 290) * Math.PI / 180, 22.0), { gain: 0.9, range: 50, floor: 0.25 });
    this._smBackground('evt_amb_water_drip', AMBIENCE_LEVEL * 0.7);
    room.check = function (r, dt) {
      const [side, ahead] = this._rel(r.bell.pos);
      const d = dist2(r.bell.pos, this.playerPos);
      r.held = ahead > 0 && Math.abs(side) / d < SM_CENTRED ? r.held + dt : 0;
      if (r.held >= SM_CENTRED_FOR) this._smTaskDone();
    };
    room.onDone = function (r) { this._smUnplace(r.bell, 1200); };
  },
  // 2. Turning: you begin facing any way but north. First, flick to north; then (once
  // her second line is heard) a held slide all the way round, past north and back.
  2(room) {
    this._face(choice([3, 4, 5, 6, 7, 8, 9]) * Math.PI / 6, true);
    this._smBackground('lab_04_dungeon_air', 0.5);
    room.turned = 0;
    room.check = function (r, dt) {
      if (r.step === 0) {
        const north = Math.abs(wrapPi(this.tn.face)) < 0.01 && !this.tn.turn;
        r.held = north ? r.held + dt : 0;
        if (r.held >= SM_NORTH_FOR) this._smNextPart(r);
      } else if (r.step === 2) {
        // Turned all the way round with a held slide, and the finger lifted.
        if (Math.abs(r.turned) >= TAU - SM_ROUND_SLACK && !this.sm.holding) this._smTaskDone();
      }
    };
    room.frame = function (r) {
      if (r.step === 2 && this.sm.holding) r.turned += wrapPi(this.tn.face - r.face);
      r.face = this.tn.face;
    };
  },
  // 3. In front and behind: the circling enemy.
  3(room, p0) {
    room.angle = uniform(0, TAU);
    room.circler = this._smPlace(choice(['obstacle_3', 'obstacle_5', 'obstacle_1']), at(p0, room.angle, SM_CIRCLE_R), { gain: 0.9, range: 40, floor: 0.2 });
    this._smBackground('drm_06_tribal_beat', 0.3);
    room.frame = function (r, dt) {
      r.angle = (r.angle + TAU / SM_CIRCLE_LAP * dt) % TAU;
      r.circler.pos = at([0, 0], r.angle, SM_CIRCLE_R);
    };
    room.check = function (r, dt) {
      const [, ahead] = this._rel(r.circler.pos);
      const d = dist2(r.circler.pos, this.playerPos);
      if (r.step === 0) {
        r.held = ahead < -0.75 * d ? r.held + dt : 0;
        if (r.held >= SM_BEHIND_FOR) { r.step = 1; r.held = 0; this.audio.play('ut_click', { volume: 0.6 }); }
      } else {
        r.held = ahead > 0.9 * d ? r.held + dt : 0;
        if (r.held >= SM_FRONT_FOR) this._smTaskDone();
      }
    };
    room.onDone = function (r) { this._smUnplace(r.circler, 1200); };
  },
  // 4. Distance and walking: the fountain.
  4(room, p0) {
    room.fountain = this._smPlace(this._smEventName('evt_amb_waterfall'), at(p0, uniform(0, TAU), 26.0), { gain: 1.0, range: SM_FOUNTAIN_RANGE, floor: 0.04, always: true });
    this._smBackground('evt_amb_morning_birds', AMBIENCE_LEVEL * 0.8);
    room.check = function (r) { if (dist2(r.fountain.pos, this.playerPos) <= SM_FOUNTAIN_REACH) this._smTaskDone(); };
  },
  // 5. Running and walking backwards: run to a far bell (a held slide up); then back
  // away from it (a held slide down).
  5(room) {
    this.playerPos = [0.0, SM_RUN_FROM];
    room.goal = [0.0, -SM_RUN_FROM];
    room.bell = this._smPlace('event_beacon_bell', room.goal, { gain: 0.9, range: 60, floor: 0.25 });
    room.runs = 0; room.backs = 0;
    this._smBackground('evt_amb_morning_birds', AMBIENCE_LEVEL * 0.6);
    room.onStep = function (r) {
      const s = this.stride;
      if (r.step === 0 && s && s.dir === 'up') r.runs += 1;
      if (r.step === 2 && s && s.dir === 'down') r.backs += 1;
    };
    room.check = function (r) {
      if (r.step === 0 && (r.runs >= SM_RUN_STEPS || (r.runs >= 2 && dist2(r.goal, this.playerPos) < SM_REACH + 1))) this._smNextPart(r);
      else if (r.step === 2 && r.backs >= SM_BACK_STEPS) this._smTaskDone();
    };
    room.onDone = function (r) { this._smUnplace(r.bell, 1200); };
  },
  // 6. Walls and edges: an L-shaped corridor, north and then east, a chime at its end.
  6(room) {
    // (7.5.1, Russell: the door never opens where you stand. The corridor runs on five
    // steps past the chime, to the door.)
    room.ok = any(rect(-1.6, 1.6, -16.6, 1.6), rect(-1.6, 31.6, -16.6, -13.4));
    room.end = [15.0, -15.0];
    room.chime = this._smPlace('event_beacon_shimmer', room.end, { gain: 0.8, range: 40, floor: 0.2 });
    this._smBackground('lab_01_cavewind', 0.6);
    room.doorAt = [30.0, -15.0];
    room.check = function (r) { if (dist2(r.end, this.playerPos) < SM_REACH) this._smTaskDone(); };
    room.onDone = function (r) { this._smUnplace(r.chime, 600); };
  },
  // 7. Echo: the small room, and the great hall two steps ahead.
  7(room) {
    this.playerPos = [0.0, SM_SMALL_BACK - SM_STEP];
    const small = rect(-SM_SMALL_HALF, SM_SMALL_HALF, SM_HALL_FROM + 0.01, SM_SMALL_BACK);
    const hall = rect(-SM_HALF, SM_HALF, SM_HALL_FAR, SM_HALL_FROM);
    room.ok = any(small, hall);
    room.doorOk = (p) => hall(p) && p[1] < SM_HALL_FROM - 6;
    room.roomAt = function () { return this.playerPos[1] > SM_HALL_FROM ? 'lab' : 'cathedral'; };
    room.check = function () { if (this.playerPos[1] <= SM_HALL_DONE) this._smTaskDone(); };
  },
  // 8. The report: double tap, and listen.
  8(room) {
    this._smBackground('lab_03_scifi_cave', 0.5);
    room.onReport = function (r, text) { if (r.reported === undefined) r.reported = 0.8 + String(text).length * 0.065; };
    room.check = function (r, dt) {
      if (r.reported === undefined) return;
      r.reported -= dt;
      if (r.reported <= 0) this._smTaskDone();
    };
  },
  // 9. Standard Mode: a tiny labyrinth, and its exit's beep.
  9(room) {
    // (The labyrinth runs on five steps past its exit, to the door. 7.5.1.)
    room.ok = any(rect(-1.6, 1.6, -13.6, 1.6), rect(-1.6, 13.6, -13.6, -10.4), rect(10.4, 13.6, -40.6, -10.4));
    room.exit = [12.0, -24.0];
    room.beep = 0;
    room.doorAt = [12.0, -39.0];
    this._smBackground('lab_02_scary_cave', 0.6);
    room.frame = function (r, dt) {
      if (this.sm.phase !== 'task') return;
      const d = dist2(r.exit, this.playerPos) / SM_STEP;    // (the labyrinth's own steps)
      r.beep -= dt;
      if (r.beep > 0) return;
      r.beep = Math.max(0.15, d * 0.05 * SM_STEP);
      const pitch = Math.max(0, Math.min(19, 19 - Math.trunc(d)));
      const level = Math.max(0.2, 1 - d * SM_STEP / 300);
      this.audio.play('prox_' + pitch, { at: r.exit, volume: level * 0.4 });
    };
    room.check = function (r) { if (dist2(r.exit, this.playerPos) < SM_REACH) this._smTaskDone(); };
  },
  // 10. Battle Mode: three enemies standing still.
  10(room, p0) {
    room.targets = [];
    room.fire = 'battle';
    this._smEnemies(room.targets, p0);
    this._smBackground('drm_06_tribal_beat', 0.3);
  },
  // 11. Driving Mode: the middle lane, a car coming straight at you; change lanes.
  11(room) {
    room.drive = true;
    room.lane = 1;
    this.playerPos = [SM_LANES[1], 0];
    room.car = { pos: [SM_LANES[1], -SM_CAR_FROM], lane: 1, passed: false };
    room.carSound = this._smPlace('enemy_car_oncoming', room.car.pos, { gain: 1.0, range: 70, floor: 0.08 });
    // Your engine runs from the moment you arrive, while Bella talks (7.5.1, Russell).
    room.engine = this.audio.play('engine_8', { loops: -1, volume: 0.45, fadeMs: 600 });
    room.frame = function (r, dt) {
      const c = r.car;
      if (!r.carSound) return;
      // It comes on until it is close; in your lane, it waits there for you to move.
      const stop = c.lane === r.lane && !c.passed ? -SM_CAR_WAIT : Infinity;
      c.pos[1] = Math.min(stop, c.pos[1] + SM_CAR_SPEED * dt);
      if (c.lane !== r.lane && c.pos[1] > -SM_CAR_WAIT) c.passed = true;
      r.carSound.pos = c.pos;
      if (c.pos[1] > SM_CAR_GONE) { this._smUnplace(r.carSound, 800); r.carSound = null; }
    };
    room.check = function (r) { if (r.car.passed && r.car.pos[1] > 4.0) this._smTaskDone(); };
    room.onDone = function (r) {
      // Off the road: on foot again, for the door.
      r.drive = false;
      if (r.engine) { r.engine.fadeout(1200); r.engine = null; }
      this._face(0, true);
    };
  },
  // 12. Tower Mode: the stairs.
  12(room, p0) {
    room.goal = at(p0, uniform(0, TAU), 20.0);
    room.stairs = this._smPlace('stairs_beacon', room.goal, { gain: 0.9, range: 45, floor: 0.2 });
    this._smBackground('tow_01_night_castle', 0.6);
    room.check = function (r) { if (dist2(r.goal, this.playerPos) < SM_REACH) this._smTaskDone(); };
    room.onDone = function (r) { this._smUnplace(r.stairs, 800); };
  },
  // 13. Island Mode: the elevator, its hum and its chime.
  13(room, p0) {
    room.goal = at(p0, uniform(0, TAU), 20.0);
    room.hum = this._smPlace('elevator_hum', room.goal, { gain: 0.8, range: 45, floor: 0.2 });
    room.chimeT = 0.5;
    room.steps = ['step_sand_1', 'step_sand_2', 'step_sand_3', 'step_sand_4'];
    this._smBackground('island_02_sandy_beach_calm', 0.7);
    room.frame = function (r, dt) {
      if (!r.hum) return;
      r.chimeT -= dt;
      if (r.chimeT <= 0) { r.chimeT = 1.6; this._smShot('elevator_ding', r.goal, 0.8); }
    };
    room.check = function (r) { if (dist2(r.goal, this.playerPos) < SM_REACH) this._smTaskDone(); };
    room.onDone = function (r) { this._smUnplace(r.hum, 800); r.hum = null; };
  },
  // 14. Find the Voice: Bella calls from where she stands.
  14(room, p0) {
    room.bella = at(p0, uniform(0, TAU), uniform(...SM_BELLA_DIST));
    room.calls = 0; room.wait = 0.8;
    room.frame = function (r, dt) { if (this.sm.phase === 'task') this._smBellaCalls(dt); };
    room.check = function (r) { if (dist2(r.bella, this.playerPos) <= SM_BELLA_REACH) this._smTaskDone(); };
    room.onDone = function (r) { if (r.beacon) this._smUnplace(r.beacon, 300); };
  },
  // 15. The Abyss: glass underfoot, a sleeping creature, the door the goal.
  15(room, p0) {
    const b = uniform(-0.7, 0.7);
    const door = at(p0, b, 27.0);
    const mid = at(p0, b, 13.5);
    const side = choice([-1, 1]) * uniform(4.0, 6.0);
    room.creature = this._smPlace(this._smEventName(AB_IDLE), [mid[0] + Math.cos(b) * side, mid[1] + Math.sin(b) * side], { gain: 0.9, range: 36, floor: 0.12 });
    room.steps = AB_STEPS_GLASS;
    this._smBackground(AB_BACKGROUND, AMBIENCE_LEVEL);
    this._smOpenDoor(door, { sound: false });
    room.doorHere = true;
    room.check = function () { const dr = this.sm.door; if (dr && dist2(dr.pos, this.playerPos) < SM_DOOR_REACH) this._smTaskDone(); };
  },
  // 16. Water Park: the diving board among the attractions.
  16(room, p0) {
    const b = uniform(0, TAU);
    room.board = at(p0, b, 24.0);
    room.shots = [
      { name: 'wp_board', pos: room.board, every: 1.3, t: 0.4, volume: 0.95 },
      { name: 'wp_wave', pos: at(p0, b + 1.3, 20.0), every: 3.2, t: 1.2, volume: 0.8 },
      { name: this._smEventName('evt_water_splash'), pos: at(p0, b - 1.4, 22.0), every: 4.1, t: 2.3, volume: 0.8 },
    ];
    this._smPlace('wp_bucket_fill', at(p0, b + 2.6, 18.0), { gain: 0.6, range: 40, floor: 0.12 });
    this._smPlace('wp_organ', at(p0, b - 2.6, 18.0), { gain: 0.45, range: 40, floor: 0.12 });
    this._smBackground('wp_park', 0.35);
    room.frame = function (r, dt) { for (const s of r.shots) { s.t -= dt; if (s.t <= 0) { s.t += s.every; this._smShot(s.name, s.pos, s.volume); } } };
    room.check = function (r) { if (dist2(r.board, this.playerPos) <= 5.0) this._smTaskDone(); };
  },
  // 17. The Museum: follow the memory's tune; then a glass case hums: smash it.
  17(room, p0) {
    if (!this.audio.has('event_beacon_story_tune')) addMade(this.audio, 'event_beacon_story_tune', tuneSound([0, 2, 4, 5, 4, 2]));
    room.memory = at(p0, uniform(0, TAU), 22.0);
    room.tune = this._smPlace('event_beacon_story_tune', room.memory, { gain: 0.75, range: 60, floor: 0.25 });
    room.targets = [];
    room.check = function (r) {
      if (r.step === 0 && r.tune && dist2(r.memory, this.playerPos) <= 3.5) {
        // The memory found: its tune plays once, whole; then the case starts to hum.
        this._smUnplace(r.tune, 100);
        r.tune = null;
        this.sm.phase = 'tune';
        r.tuneVoice = this.audio.play('event_beacon_story_tune', { volume: 0.8, keep: true });
        r.tuneWait = 0.2;
      }
    };
    room.afterTune = function (r) {
      r.step = 1;
      r.fire = 'case';
      const c = this._smPlace(this._smEventName(CASE_SOUND), at(this.playerPos, uniform(0, TAU), 18.0), { gain: 0.75, range: 50, floor: 0.2 });
      if (c) { c.pos[0] = Math.max(-SM_HALF + 3, Math.min(SM_HALF - 3, c.pos[0])); c.pos[1] = Math.max(-SM_HALF + 3, Math.min(SM_HALF - 3, c.pos[1])); r.targets.push(c); }
    };
    room.onStep = function (r) { if (r.step === 1) this._smCaseChime(r.targets.find((s) => this.sm.sounds.includes(s)), r); };
  },
  // 18. Ultimate Mode: one place's background gives way to the next across a border.
  18(room) {
    this.playerPos = [0.0, SM_AREA_START];
    room.a = this._smEventName('evt_amb_forest_night', 'amb');
    room.b = this._smEventName('evt_amb_market', 'amb');
    room.va = room.a ? this.audio.play(room.a, { loops: -1, volume: AMBIENCE_LEVEL, fadeMs: 800, send: BACKGROUND_SEND }) : null;
    room.vb = null;
    this.sm.extra.push(room.va);
    room.steps = function (r) { return this.playerPos[1] > 0 ? ['step_grass_1', 'step_grass_2', 'step_grass_3', 'step_grass_4'] : SM_STEPS_STONE; };
    room.onLive = function (r) { r.vb = r.b ? this.audio.play(r.b, { loops: -1, volume: 0.0, fadeMs: 300, send: BACKGROUND_SEND }) : null; this.sm.extra.push(r.vb); };
    room.frame = function (r) {
      // Heard only near the border: within two steps of it, the next place rises.
      const t = Math.max(0, Math.min(1, (SM_AREA_BLEND - this.playerPos[1]) / (2 * SM_AREA_BLEND)));
      if (r.va) r.va.setVolume(AMBIENCE_LEVEL * (1 - t));
      if (r.vb) r.vb.setVolume(AMBIENCE_LEVEL * t);
    };
    room.check = function () { if (this.playerPos[1] <= SM_AREA_DONE) this._smTaskDone(); };
    room.roomAt = function () { return this.playerPos[1] > 0 ? 'lab' : 'hall'; };
  },
  // 19. The compass: turn it on; follow its beep to a safe zone you cannot otherwise hear.
  19(room, p0) {
    makeUltimateSounds(this.audio);
    room.goal = at(p0, uniform(0.5, TAU - 0.5), SM_COMPASS_DIST);
    room.compass = true;
    room.beep = 0;
    this._smBackground('lab_02_scary_cave', 0.6);
    room.frame = function (r, dt) {
      if (!r.on) return;
      r.beep -= dt;
      if (r.beep > 0) return;
      r.beep = this.tn.turn ? COMPASS_BEEP_TURNING : COMPASS_BEEP_EVERY;
      const f = this._forward();
      const dx = r.goal[0] - this.playerPos[0]; const dy = r.goal[1] - this.playerPos[1];
      const d = Math.hypot(dx, dy);
      const dot = d > 1e-6 ? (f[0] * dx + f[1] * dy) / d : 1;
      this.audio.play(compassName(Math.round((dot + 1) / 2 * 8)), { at: r.goal, volume: GUIDE_LEVEL, send: 0, keep: true });
    };
    room.check = function (r, dt) {
      if (r.arrived) { r.saidFor -= dt; if (r.saidFor <= 0) this._smTaskDone(); return; }
      if (!r.used || dist2(r.goal, this.playerPos) >= SM_REACH) return;
      if (r.on) this._smCompass(false, true);
      // Arrived: the compass says so, and the safe zone's own air comes in.
      this.tts.speak('You are in the safe zone. Compass off.', { interrupt: true });
      this._smBackground('evt_amb_ocean_night', AMBIENCE_LEVEL);
      r.saidFor = 2.5;
      r.arrived = true;
    };
  },
  // 20. Safe zones and characters: Mother Hazel greets you from where she stands; step
  // up beside her, and she tells you something and gives you her gift.
  20(room, p0) {
    room.hazel = at(p0, uniform(0, TAU), SM_HAZEL_DIST);
    room.greet = 0; room.wait = 0.6;
    room.steps = ['step_grass_1', 'step_grass_2', 'step_grass_3', 'step_grass_4'];
    this._smBackground('evt_amb_witch', AMBIENCE_LEVEL);
    room.frame = function (r, dt) {
      if (this.sm.phase !== 'task' || r.met || this._smTalking()) return;
      r.wait -= dt;
      if (r.wait > 0) return;
      r.wait = uniform(...SM_GREET_GAP);
      r.greet = (r.greet % HAZEL.greet.length) + 1;
      const ln = HAZEL.greet[r.greet - 1];
      // With the Speech setting Off, or no recording of her greeting, a soft shimmering
      // beacon sounds where she stands instead, as for Bella in chapter 14 (7.5.2).
      let cv = null; try { cv = this._smVoices(); } catch (e) { /* none */ }
      if (this._smSilent() || !cv || !cv.has(ln)) {
        if (!r.beacon) r.beacon = this._smPlace('event_beacon_shimmer', r.hazel, { gain: 0.7, range: 48, floor: 0.18 });
        return;
      }
      this._smQueueLine(ln, { pos: r.hazel });
    };
    room.check = function (r) {
      if (r.met || dist2(r.hazel, this.playerPos) > SM_HAZEL_REACH) return;
      r.met = true;
      if (r.beacon) { this._smUnplace(r.beacon, 300); r.beacon = null; }
      this.sm.say.queue = [];
      this._smQueueLine(HAZEL.story, { pos: r.hazel });
      this._smQueueLine(HAZEL.gift, {
        pos: r.hazel,
        after: () => { if (this.sm.room !== r) return; this._smShot('potion_drink', r.hazel, 0.9, true); this._smTaskDone(); },
      });
    };
  },
  // 21. Chaos Mode: a level's exit, the Morse signal.
  21(room, p0) {
    this._smBackground('drm_03_loop_75', 0.25);
    // The level's exit, the Morse signal, is the goal; reached, it falls silent and the
    // door opens somewhere else in the room, to walk to (7.5.1, Russell: the door never
    // opens where you stand).
    room.exit = at(p0, uniform(0, TAU), 22.0);
    room.exitSound = this._smPlace(SM_DOOR, room.exit, { gain: SM_DOOR_LEVEL, range: 45, floor: 0.2 });
    room.onLive = function () { const th = AB_THUNDERS.find((s) => this.audio.has(s)); if (th) this.audio.play(th, { volume: 0.6 }); };
    room.check = function (r) { if (dist2(r.exit, this.playerPos) < SM_DOOR_REACH) this._smTaskDone(); };
    room.onDone = function (r) { this._smUnplace(r.exitSound, 200); r.exitSound = null; };
  },
  // 22. Events: a collecting mission, stepped north, south, west and east.
  22(room) {
    room.events = true;
    room.items = 0;
    this._smBackground('evt_amb_campfire', AMBIENCE_LEVEL);
    room.next = function (r) {
      const spots = [];
      for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
        const p = [this.playerPos[0] + i * SM_STEP, this.playerPos[1] + j * SM_STEP];
        const d = Math.abs(i) + Math.abs(j);
        if (d >= 3 && d <= 5 && Math.abs(p[0]) <= SM_HALF - 3 && Math.abs(p[1]) <= SM_HALF - 3) spots.push(p);
      }
      r.item = this._smPlace('event_beacon_bell', choice(spots), { gain: 0.9, range: 40, floor: 0.2 });
    };
    room.onLive = function (r) { r.next.call(this, r); };
    room.check = function (r) {
      if (!r.item || dist2(r.item.pos, this.playerPos) > 1.0) return;
      this._smShot('event_pickup_bell', r.item.pos, 0.9, true);
      this._smUnplace(r.item, 80);
      r.item = null;
      r.items += 1;
      if (r.items >= SM_ITEMS) this._smTaskDone(); else r.next.call(this, r);
    };
  },
  // 23. Help and settings: no task.
  23() {
    this._smBackground('evt_amb_fireplace', AMBIENCE_LEVEL * 0.8);
  },
};

// ------------------------------------------------------------------ help
const HELP_SECTIONS = [
  ['Story Mode', [
    { title: 'Story Mode', sound: null, desc: 'Story Mode, new in 7.3.0, is a walk through how Endless Labyrinth works, in twenty-three chapters, told by Bella, the game\'s own voice. The first chapters are the basics: headphones and centring a sound, turning with a flick and with a held slide, telling in front from behind, walking, running and walking backwards, walls and edges, echo, and the report. Then there is a chapter for every mode, from Standard Mode to Chaos Mode, with three for Ultimate Mode: the world, the compass, and the safe zones and their characters. Then Events, and last of all help and settings. Each chapter is a room with one small task: as you arrive, Bella tells you about it, then gives you the task. Only the room\'s background plays while she talks; everything you play with starts once she has finished. Nothing can hurt you, there is no clock, and no task can be failed: take as long as you like. You turn and walk as in every walking mode (see General Turning), except on the road in the Driving chapter and in the Events chapter, where north stays ahead, as it does in those modes. About 35 minutes from start to finish. Double tap for the chapter you are in and whether its door is open, and the way you are facing.' },
    { title: 'Story Mode Doors', sound: null, desc: 'When a chapter\'s task is done you hear a chime, Bella says so, and a door opens somewhere in the room: it sounds like a battle exit\'s Morse signal. Find it by ear and walk through it into the next chapter. You can stay in a room as long as you like first. Through the last door, after chapter 23, you are back at the main menu.' },
    { title: 'Story Mode The Twist', sound: null, desc: 'Once, midway through the story, not everything is so easy. You will find out when you get there. Whatever happens, nothing there can hurt you either.' },
    { title: 'Story Mode Chapters', sound: null, desc: 'The first time, the chapters come in order. Once you have walked the story to its end, Story Mode opens with a list of the chapters: choose one and the story carries on from there to the end. (In 7.4.0 the story became a tour of how the game works, and everyone started again from chapter 1; 7.5.0 made it twenty-three chapters.) With the Speech setting turned Off, Bella\'s lines go to your Braille display.' },
  ]],
];

// ------------------------------------------------------------------ the mode
function reset(game) {
  if (game.sm) game._smStopAll();
  game.sm = null;
}

function input(game, g) {
  const sm = game.sm;
  if (!sm) return;
  if (g === 'clock') { game.tts.speak('There is no clock in Story Mode.', { interrupt: true }); return; }
  if (g === 'enter') { game._smReport(); return; }
  if (g === 'space') { game._smFire(); return; }
  if (g === 'hold' || g === 'compass') {
    if (sm.room && sm.room.compass && sm.phase === 'task') game._smCompass();
    else if (g === 'compass') game.tts.speak('There is no compass here. It is in Ultimate Mode, and in chapter 19.', { interrupt: true });
    return;
  }
  if (g === 'left' || g === 'right') { game._smSide(g); return; }
  if (g === 'up' || g === 'down') game._smStep(g);
}

export default {
  // (7.5.0, Russell) First on the main menu, above Standard Mode, and first in Help.
  menu: [{ key: 'story', label: 'Story Mode', first: true, select: (game) => game.openStoryMode() }],
  playStates: [STATE],
  mixin,
  init(game) { game.sm = null; game.storyMenuIndex = 0; },
  reset,
  update(game, dt) { game.updateStory(dt); },
  input,
  stopAll(game) { if (game.sm) game._smStopAll(); },
  finish() { return { custom: true, message: 'Story Mode. ' }; },
  room(game) { return game._smRoom(); },
  // A held slide's turn, start to end (chapter 2 counts it).
  // (7.5.3, Russell: in Story Mode the static came back after a while, and a pause
  // cleared it. A run of half an hour kept one sound engine all that time, where every
  // other mode's runs get a fresh one each time (6.3.7). Now each chapter gets a fresh
  // engine too, at your first touch or key press once Bella has finished speaking (a
  // phone starts a new engine only inside a touch, and a recording still playing would
  // be cut off with the old engine). The room's sounds carry on in the new one.)
  freshDue(game) {
    const sm = game.sm;
    if (!sm || !sm.freshDue || game.state !== STATE) return false;
    if (!(sm.phase === 'task' || sm.phase === 'done') || sm.waitFor || game._smTalking()) return false;
    sm.freshDue = false;
    return true;
  },
  turnInput(game, g) { if (game.sm && game.state === STATE) game.sm.holding = g !== 'turn_end'; },
  // A finger held still: the compass, in chapter 19 only.
  holdGesture(game) { return !!(game.sm && game.sm.room && game.sm.room.compass); },
  // (Chapter 10's road and chapter 19's event do not turn: north is ahead there.)
  turns(game) { return game.state === STATE && !(game.sm && game.sm.room && (game.sm.room.drive || game.sm.room.events)); },
  surroundings(game, pos, room) {
    if (room === 'cathedral') return [1.0, 0.0];
    return game._arenaSurroundings(pos);
  },
  strideSig(game) { return game.sm ? `${game.sm.chapter}|${game.sm.twist ? game.sm.twist.kind : ''}` : ''; },
  status(game) {
    const sm = game.sm;
    if (!sm) return 'Story Mode.';
    if (sm.twist) return 'Story Mode. A practice area.';
    return `Story Mode. Chapter ${sm.chapter} of ${SM_CHAPTERS}.`;
  },
  inputStates: { [MENU_STATE]: (game, g) => game.storyMenuInput(g) },
  statusFor: { [MENU_STATE]: (game) => 'Story Mode: ' + game._smMenuLine(game.storyMenuIndex || 0) },
  help: { sections: HELP_SECTIONS, demos: [], first: true },
};
