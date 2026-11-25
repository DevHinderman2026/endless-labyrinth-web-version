// Story Mode (web 7.3.0, Russell's design, 25 November 2026; website only).
//
// A walk through the story of how Endless Labyrinth was made, in ten chapters. Bella,
// the game's own recorded voice, tells each part of the story as you arrive in a room
// from that part of the game's life; one small task in the room shows off the web
// game's 3D sound. When the task is done a door starts to sound: find it by ear and walk
// through it into the next chapter. Nothing can hurt you, there is no clock, and no
// task can be failed.
//
// Midway, once (Russell: "but not everything is so easy"), walking out of chapter 5
// drops you into one practice area at random: a battle whose three enemies stand still,
// an island's guardian that never moves, or the abyss with a glass case to smash. Bella
// says what it is, you finish its one task, and you are pulled back into the story.
//
// The first time through, the chapters come in order. Once the story has been walked to
// its end (the setting storyDone), Story Mode opens with a list of the chapters; the
// story carries on from the chapter chosen to the end.
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
import { STORY_LINES } from '../storymode-lines.js';
import { RULES } from '../sound-rules.js';

export const STATE = 'story';
export const MENU_STATE = 'story_menu';

// ------------------------------------------------------------------ constants
export const SM_STEP = 3.0;                     // one step, in the game's units
export const SM_HALF = 30.0;                    // a room: this far each way from its middle (20 steps across)
export const SM_DOOR_REACH = 3.5;               // units: this near the door is walking through it
export const SM_DOOR_RANGE = [15.0, 24.0];      // how far from you the door appears
export const SM_DOOR = 'exit_morse';            // the door, sounding: the battle exit's Morse signal
export const SM_DOOR_LEVEL = 0.9;
export const SM_DOOR_OPEN = 'mu_door_open';     // (the Museum's door)
export const SM_DOOR_CLOSE = 'mu_door_close';
export const SM_DONE = 'evt_chime_clear';       // a task done
export const SM_VOICE_LEVEL = 1.0;              // Bella, telling the story (not placed: she is the narrator)
export const SM_VOICE_SEND = 0.12;
export const SM_WAIT_VOICE = 2.5;               // seconds a line waits for its recording to be decoded
export const SM_STEPS_STONE = ['step_stone_1', 'step_stone_2', 'step_stone_3', 'step_stone_4'];
export const SM_STEPS_WATER = ['ut_water_step_1', 'ut_water_step_2', 'ut_water_step_3', 'ut_water_step_4'];
// Chapter 1: the bell is centred within this share of its distance, for this long.
export const SM_CENTRED = 0.17;                 // about 10 degrees either side
export const SM_CENTRED_FOR = 0.5;
// Chapter 2: the circling enemy, and how long it must be behind you, then in front.
export const SM_CIRCLE_R = 12.0;
export const SM_CIRCLE_LAP = 24.0;              // seconds a lap
export const SM_BEHIND_FOR = 1.2;
export const SM_FRONT_FOR = 0.8;
// Chapter 3: the fountain is reached this near; it fades over this far.
export const SM_FOUNTAIN_REACH = 5.0;
export const SM_FOUNTAIN_RANGE = 34.0;
// Chapter 5: the small room, and where the great hall begins.
export const SM_SMALL_HALF = 6.0;               // the small room: this far each side
export const SM_SMALL_BACK = 6.0;               // ... its back wall (you begin a step in front of it)
export const SM_HALL_FROM = -3.0;               // the opening: the hall is north of this (two steps ahead)
export const SM_HALL_DONE = -12.0;              // three steps into the hall
export const SM_HALL_FAR = -48.0;               // the hall's far wall (15 steps on)
// Chapter 6: Bella calls from here, and is reached this near.
export const SM_BELLA_DIST = [20.0, 26.0];
export const SM_BELLA_REACH = 6.0;
export const SM_CALL_GAP = [1.0, 2.0];
export const SM_CALLS = 5;
// The practice areas.
export const SM_ENEMIES = 3;
export const SM_AIM = 0.3;                      // a shot hits what is centred within this share of its distance
export const SM_GUARDIAN_HITS = 3;
export const SM_GUARDIAN_GAIN = 1.3;

const RATE = 44100;
const VOICE_ROOMS = ['lab', 'tower', 'battle', 'cathedral', 'hall'];

// The chapters, as the chapter list names them, and each room's echo.
export const CHAPTERS = [
  { n: 1, title: 'Where it started', room: 'lab' },
  { n: 2, title: 'Growing into six modes', room: 'battle' },
  { n: 3, title: 'Building a world out of sound', room: 'battle' },
  { n: 4, title: 'Phones, tablets and computers', room: 'lab' },
  { n: 5, title: 'Ultimate Mode', room: 'lab' },
  { n: 6, title: 'A voice of its own', room: 'battle' },
  { n: 7, title: 'Papa Sangre and The Abyss', room: 'battle' },
  { n: 8, title: 'Water Park', room: 'hall' },
  { n: 9, title: 'The Museum', room: 'hall' },
  { n: 10, title: 'How the game is made today', room: 'lab' },
];
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
  if (n === 10) return { arrive: ['story.10.story', 'story.10.end'], done: [] };
  return { arrive: [`story.${n}.story`, `story.${n}.task`], done: [`story.${n}.done`] };
}

// ------------------------------------------------------------------ the game's methods
const mixin = {
  // Story Mode from the main menu: the first time, chapter 1; after the story has been
  // walked to its end, the chapter list.
  openStoryMode() {
    if (this.scores && this.scores.settings && this.scores.settings.storyDone) {
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
    this.sm = { run: this.runId, chapter: 0, twistDone: n > 5, room: null, say: { queue: [], voice: null, until: 0, line: null, waitSince: 0 }, sounds: [], phase: 'story', door: null };
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
  _smPlace(name, pos, { gain = 0.9, range = 40.0, floor = 0.12, tag = null } = {}) {
    if (!name || !this.audio.has(name)) return null;
    const s = { name, pos, gain, range, floor, tag, voice: this.audio.play(name, { loops: -1, volume: 0.0, fadeMs: 300 }) };
    this.sm.sounds.push(s);
    this._smLevelSound(s);
    return s;
  },

  _smLevelSound(s) {
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
    sm.door = null;
    sm.room = null;
  },

  // ---------------------------------------------------------------- chapters
  _smChapter(n) {
    const sm = this.sm;
    this._smClearRoom();
    this._smHush();
    sm.chapter = n;
    sm.twist = null;
    sm.phase = 'story';
    this.level = n;
    this.playerPos = [0.0, 0.0];
    this.arenaLimit = SM_HALF;
    this.stride = null;
    this._face(0, true);
    this._syncRoom();
    const room = sm.room = { n, held: 0, step: 0 };
    const p0 = [0, 0];
    if (n === 1) {
      room.bell = this._smPlace('event_beacon_bell', at(p0, uniform(70, 290) * Math.PI / 180, 22.0), { gain: 0.9, range: 50, floor: 0.25 });
      this._smBackground('evt_amb_water_drip', AMBIENCE_LEVEL * 0.7);
    } else if (n === 2) {
      room.angle = uniform(0, TAU);
      const o = choice(['obstacle_3', 'obstacle_5', 'obstacle_1']);
      room.circler = this._smPlace(o, at(p0, room.angle, SM_CIRCLE_R), { gain: 0.9, range: 40, floor: 0.2 });
      this._smBackground('drm_06_tribal_beat', 0.3);
    } else if (n === 3) {
      room.fountain = this._smPlace(this._smEventName('evt_amb_waterfall'), at(p0, uniform(0, TAU), 26.0), { gain: 1.0, range: SM_FOUNTAIN_RANGE, floor: 0.04 });
      this._smBackground('evt_amb_morning_birds', AMBIENCE_LEVEL * 0.8);
    } else if (n === 4) {
      const b = uniform(0, TAU);
      this._smPlace(this._smEventName('evt_amb_clock'), at(p0, b, 10.0), { gain: 0.8, range: 30, floor: 0.2 });
      this._smPlace(this._smEventName('evt_amb_water_drip'), at(p0, b + TAU / 3, 10.0), { gain: 0.8, range: 30, floor: 0.2 });
      this._smPlace(this._smEventName('evt_owl_hoot'), at(p0, b + 2 * TAU / 3, 10.0), { gain: 0.7, range: 30, floor: 0.2 });
      room.turned = 0; room.face = this.tn.face;
    } else if (n === 5) {
      this.playerPos = [0.0, SM_SMALL_BACK - SM_STEP];
    } else if (n === 6) {
      room.bella = at(p0, uniform(0, TAU), uniform(...SM_BELLA_DIST));
      room.calls = 0; room.wait = 0.8;
    } else if (n === 7) {
      const b = uniform(-0.7, 0.7);
      const door = at(p0, b, 27.0);
      const mid = at(p0, b, 13.5);
      const side = choice([-1, 1]) * uniform(4.0, 6.0);
      room.creature = this._smPlace(this._smEventName(AB_IDLE), [mid[0] + Math.cos(b) * side, mid[1] + Math.sin(b) * side], { gain: 0.9, range: 36, floor: 0.12 });
      this._smBackground(AB_BACKGROUND, AMBIENCE_LEVEL);
      this._smOpenDoor(door, { sound: false });
    } else if (n === 8) {
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
    } else if (n === 9) {
      if (!this.audio.has('event_beacon_story_tune')) addMade(this.audio, 'event_beacon_story_tune', tuneSound([0, 2, 4, 5, 4, 2]));
      room.memory = at(p0, uniform(0, TAU), 22.0);
      room.tune = this._smPlace('event_beacon_story_tune', room.memory, { gain: 0.75, range: 60, floor: 0.25 });
    }
    const { arrive } = linesOf(n);
    arrive.forEach((id, i) => this._smQueue(id, { after: i === arrive.length - 1 ? () => this._smTaskBegins() : null }));
    for (const id of linesOf(n).done) this._smPrefetch(id);
  },

  // The task line heard out: the task counts from now. Chapter 10 has none: its door opens.
  _smTaskBegins() {
    const sm = this.sm;
    if (sm.chapter === 10) { sm.phase = 'done'; this._smOpenDoor(); return; }
    sm.phase = 'task';
  },

  // A task done: the chime, Bella's line, and the door opens.
  _smTaskDone() {
    const sm = this.sm; const room = sm.room;
    if (sm.phase !== 'task') return;
    sm.phase = 'done';
    if (sm.twist) { this._smTwistDone(); return; }
    this.audio.play(SM_DONE, { volume: 0.8, keep: true });
    const n = sm.chapter;
    if (n === 1 && room.bell) this._smUnplace(room.bell, 1200);
    if (n === 2 && room.circler) this._smUnplace(room.circler, 1200);
    const { done } = linesOf(n);
    done.forEach((id, i) => this._smQueue(id, { after: i === done.length - 1 && n !== 7 ? () => this._smOpenDoor() : null }));
    if (n === 7) this._smOpenDoor(sm.door ? sm.door.pos : null);
  },

  // The door: it opens, and sounds where it stands until you walk through it.
  // (`sound: false`: chapter 7's door sounds from the start, shut, as the task's goal.)
  _smOpenDoor(pos = null, { sound = true } = {}) {
    const sm = this.sm;
    if (sm.door && sm.door.open) return;
    if (!pos) {
      for (let i = 0; i < 300 && !pos; i++) {
        const p = at(this.playerPos, uniform(0, TAU), uniform(...SM_DOOR_RANGE));
        const lim = sm.chapter === 5 ? null : SM_HALF - 2;
        if (lim === null ? this._smInHall(p) && p[1] < SM_HALL_FROM - 6 : Math.abs(p[0]) <= lim && Math.abs(p[1]) <= lim) pos = p;
      }
      if (!pos) pos = [0, -SM_HALF + 3];
    }
    if (sm.door && sm.door.voice && dist2(sm.door.pos, pos) > 0.01) { sm.door.voice.fadeout(300); sm.door.voice = null; }
    if (!sm.door || !sm.door.voice) sm.door = { pos, voice: this.audio.play(SM_DOOR, { loops: -1, volume: 0.0, fadeMs: 400 }) };
    sm.door.open = sound;
    if (sound) this._smShot(SM_DOOR_OPEN, pos, 0.9, true);
    this._smLevelDoor();
  },

  _smLevelDoor() {
    const door = this.sm.door;
    if (!door || !door.voice) return 1e9;
    const [l, r, d] = this._smLevels(door.pos, SM_DOOR_LEVEL, 45.0, 0.2);
    door.voice.setVolume(l, r, this._behind(door.pos));
    return d;
  },

  // Through the door: the next chapter (after chapter 5, the twist, once); after
  // chapter 10, the menu.
  _smThroughDoor() {
    const sm = this.sm;
    this.audio.play(SM_DOOR_CLOSE, { volume: 0.8, keep: true });
    const n = sm.chapter;
    if (n >= 10) { this._smFinish(); return; }
    if (n === 5 && !sm.twistDone) { this._smTwist(); return; }
    this._smChapter(n + 1);
  },

  _smFinish() {
    if (this.scores && this.scores.settings) { this.scores.settings.storyDone = true; try { this.scores.save(); } catch (e) { /* kept next time */ } }
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
    const t = sm.twist = { kind: kind || choice(TWISTS), hp: SM_GUARDIAN_HITS, targets: [] };
    sm.room = { n: 'twist' };
    this.playerPos = [0.0, 0.0];
    this.arenaLimit = SM_HALF;
    this.stride = null;
    this._face(0, true);
    this._syncRoom();
    const thunder = AB_THUNDERS.find((s) => this.audio.has(s));
    if (thunder) this.audio.play(thunder, { volume: 0.9, keep: true });
    this._smQueue('story.twist.twist', { after: () => this._smTwistArea() });
  },

  _smTwistArea() {
    const sm = this.sm; const t = sm.twist;
    if (!t) return;
    const p0 = this.playerPos;
    if (t.kind === 'battle') {
      const b = uniform(0, TAU);
      const names = ['obstacle_0', 'obstacle_3', 'obstacle_6'];
      for (let i = 0; i < SM_ENEMIES; i++) {
        const s = this._smPlace(names[i], at(p0, b + i * TAU / SM_ENEMIES + uniform(-0.3, 0.3), uniform(12.0, 18.0)), { gain: 0.9, range: 40, floor: 0.2, tag: 'enemy' });
        if (s) t.targets.push(s);
      }
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
    this._smSyncTwistRoom();
    this._smQueue(`story.twist.${t.kind}`, { after: () => { if (this.sm === sm && sm.twist === t) sm.phase = 'task'; } });
  },

  _smSyncTwistRoom() { this._syncRoom(); },

  _smTwistDone() {
    const sm = this.sm; const t = sm.twist;
    this.audio.play(SM_DONE, { volume: 0.8, keep: true });
    this._smQueue(`story.twist.${t.kind}.done`);
    this._smQueue('story.twist.back', {
      after: () => {
        if (this.sm !== sm) return;
        const warp = this._smEventName('evt_exit_warp', 'pickup');
        if (warp) this.audio.play(warp, { volume: 0.7, keep: true });
        this._smChapter(6);
      },
    });
  },

  // The attack (a two-finger tap, or the spacebar): only in the practice areas.
  _smFire() {
    const sm = this.sm; const t = sm.twist;
    if (!t || sm.phase !== 'task') return;
    const live = t.targets.filter((s) => sm.sounds.includes(s));
    if (t.kind === 'abyss') {
      const c = live[0];
      const [side, ahead] = c ? this._rel(c.pos) : [0, 0];
      const d = c ? dist2(c.pos, this.playerPos) : 1e9;
      if (c && d < CASE_REACH + 1.5 && (d < 1.0 || (ahead > 0 && Math.abs(side) / d < 0.5))) {
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
    if (t.kind === 'guardian') {
      t.hp -= 1;
      if (t.hp > 0) { this._smShot('guardian_hit', best.pos, 1.0, true); return; }
      this._smUnplace(best, 80);
      this._smShot('guardian_down', best.pos, 1.0, true);
      this._smTaskDone();
      return;
    }
    this._smUnplace(best, 60);
    this._smShot('enemy_hit', best.pos, 1.0, true);
    if (!t.targets.some((s) => sm.sounds.includes(s))) this._smTaskDone();
  },

  // ---------------------------------------------------------------- the frame
  updateStory(dt) {
    const sm = this.sm;
    if (!sm || this.isPaused || this.state !== STATE) return;
    this._smUpdateSay(dt);
    if (this.sm !== sm || this.state !== STATE) return;
    const room = sm.room;
    if (!room) return;
    // Sounds that move, or call now and then.
    if (room.n === 2 && room.circler && room.circler.voice) {
      room.angle = (room.angle + TAU / SM_CIRCLE_LAP * dt) % TAU;
      room.circler.pos = at([0, 0], room.angle, SM_CIRCLE_R);
    }
    if (room.n === 8) {
      for (const s of room.shots) { s.t -= dt; if (s.t <= 0) { s.t += s.every; this._smShot(s.name, s.pos, s.volume); } }
    }
    for (const s of sm.sounds) this._smLevelSound(s);
    const d = this._smLevelDoor();
    if (sm.phase === 'task') this._smCheckTask(dt);
    if (sm.phase === 'tune') {
      room.tuneWait -= dt;
      if (room.tuneWait <= 0 && !(room.tuneVoice && room.tuneVoice.busy)) { room.tuneVoice = null; sm.phase = 'task'; this._smTaskDone(); }
    }
    if (this.sm !== sm) return;
    if (sm.phase === 'task' && room.n === 6) this._smBellaCalls(dt);
    if (sm.phase === 'done' && sm.door && sm.door.open && d < SM_DOOR_REACH && !this._smTalking()) this._smThroughDoor();
  },

  // Whether the room's task has just been done (checked every frame, and after a step).
  _smCheckTask(dt = 0) {
    const sm = this.sm; const room = sm.room;
    if (!room || sm.phase !== 'task' || sm.twist) return;
    const n = room.n;
    if (n === 1 && room.bell) {
      const [side, ahead] = this._rel(room.bell.pos);
      const d = dist2(room.bell.pos, this.playerPos);
      room.held = ahead > 0 && Math.abs(side) / d < SM_CENTRED ? room.held + dt : 0;
      if (room.held >= SM_CENTRED_FOR) this._smTaskDone();
    } else if (n === 2 && room.circler) {
      const [, ahead] = this._rel(room.circler.pos);
      const d = dist2(room.circler.pos, this.playerPos);
      if (room.step === 0) {
        room.held = ahead < -0.75 * d ? room.held + dt : 0;
        if (room.held >= SM_BEHIND_FOR) { room.step = 1; room.held = 0; this.audio.play('ut_click', { volume: 0.6 }); }
      } else {
        room.held = ahead > 0.9 * d ? room.held + dt : 0;
        if (room.held >= SM_FRONT_FOR) this._smTaskDone();
      }
    } else if (n === 3 && room.fountain) {
      if (dist2(room.fountain.pos, this.playerPos) <= SM_FOUNTAIN_REACH) this._smTaskDone();
    } else if (n === 4) {
      room.turned += wrapPi(this.tn.face - room.face);
      room.face = this.tn.face;
      if (Math.abs(room.turned) >= TAU - 0.05) this._smTaskDone();
    } else if (n === 5) {
      if (this.playerPos[1] <= SM_HALL_DONE) this._smTaskDone();
    } else if (n === 6) {
      if (dist2(room.bella, this.playerPos) <= SM_BELLA_REACH) this._smTaskDone();
    } else if (n === 7) {
      if (sm.door && dist2(sm.door.pos, this.playerPos) < SM_DOOR_REACH) this._smTaskDone();
    } else if (n === 8) {
      if (dist2(room.board, this.playerPos) <= 5.0) this._smTaskDone();
    } else if (n === 9 && room.tune) {
      if (dist2(room.memory, this.playerPos) <= 3.5) {
        // The memory found: its tune plays once, whole, then Bella speaks.
        this._smUnplace(room.tune, 100);
        room.tune = null;
        sm.phase = 'tune';
        room.tuneVoice = this.audio.play('event_beacon_story_tune', { volume: 0.8, keep: true });
        room.tuneWait = 0.2;
      }
    }
  },

  // Chapter 6: Bella calls from where she stands until you reach her.
  _smBellaCalls(dt) {
    const room = this.sm.room;
    if (this._smTalking() || this.sm.say.queue.length) return;
    room.wait -= dt;
    if (room.wait > 0) return;
    room.wait = uniform(...SM_CALL_GAP);
    room.calls = (room.calls % SM_CALLS) + 1;
    const id = `story.6.call.${room.calls}`;
    // With the Speech setting Off, or no recording of her call, a soft shimmering
    // beacon sounds where she stands instead (as Find the Voice's guide's).
    let cv = null; try { cv = this._smVoices(); } catch (e) { /* none */ }
    if (this._smSilent() || !cv || !cv.has(storyLine(id))) {
      if (!room.beacon) room.beacon = this._smPlace('event_beacon_shimmer', room.bella, { gain: 0.7, range: 48, floor: 0.18 });
      return;
    }
    this._smQueue(id, { pos: room.bella });
  },

  // ---------------------------------------------------------------- walking
  _smInHall(p) { return p[1] <= SM_HALL_FROM && p[1] >= SM_HALL_FAR && Math.abs(p[0]) <= SM_HALF; },
  _smInSmall(p) { return p[1] > SM_HALL_FROM && p[1] <= SM_SMALL_BACK && Math.abs(p[0]) <= SM_SMALL_HALF; },

  _smStep(g) {
    const sm = this.sm;
    if (!sm || !sm.room || sm.phase === 'tune') return;
    const f = this.playerFacing = this._forward();
    const dir = g === 'up' ? f : [-f[0], -f[1]];
    if (sm.room.n === 5) {
      // The small room and the great hall: walls of their own.
      const from = [...this.playerPos];
      const to = [from[0] + dir[0] * SM_STEP, from[1] + dir[1] * SM_STEP];
      const ok = (p) => this._smInSmall(p) || this._smInHall(p);
      let dest = null;
      if (ok(to)) dest = to;
      else if (ok([to[0], from[1]]) && Math.abs(to[0] - from[0]) >= SM_STEP * 0.25) dest = [to[0], from[1]];
      else if (ok([from[0], to[1]]) && Math.abs(to[1] - from[1]) >= SM_STEP * 0.25) dest = [from[0], to[1]];
      if (!dest) { this.audio.play('boundary'); return; }
      this.playerPos = dest;
    } else if (!this._walkArena(dir, SM_STEP, SM_HALF, { sound: false })) return;
    this._syncRoom();
    const glass = (sm.room.n === 7) || (sm.twist && sm.twist.kind === 'abyss');
    const bank = (glass ? AB_STEPS_GLASS : sm.room.n === 8 ? SM_STEPS_WATER : SM_STEPS_STONE).filter((nm) => this.audio.has(nm));
    if (bank.length) this.audio.play(choice(bank.length ? bank : SM_STEPS_STONE));
    // The abyss's glass case: its chime as you come within reach of it.
    if (sm.twist && sm.twist.kind === 'abyss') {
      const c = sm.twist.targets.find((s) => sm.sounds.includes(s));
      if (c) {
        const near = dist2(c.pos, this.playerPos) < CASE_REACH + 1.5;
        if (near && !sm.twist.chimed) { sm.twist.chimed = true; this._smShot(CASE_CHIME, c.pos, 0.8, true); } else if (!near) sm.twist.chimed = false;
      }
    }
    this._smCheckTask(0);
    if (this.sm === sm && sm.phase === 'done' && sm.door && sm.door.open && this._smLevelDoor() < SM_DOOR_REACH && !this._smTalking()) this._smThroughDoor();
  },

  // The room's echo: chapter 5's changes as you cross from the small room into the hall.
  _smRoom() {
    const sm = this.sm;
    if (!sm || !sm.room) return 'lab';
    if (sm.twist) return sm.twist.kind === 'guardian' ? null : 'battle';
    if (sm.room.n === 5) return this.playerPos[1] > SM_HALL_FROM ? 'lab' : 'cathedral';
    return CHAPTERS[sm.room.n - 1].room;
  },

  // Enter's report: the chapter, and whether its door is open.
  _smReport() {
    const sm = this.sm;
    if (!sm) return;
    if (sm.twist) { this._report('Story Mode. A practice area.' + (sm.phase === 'task' ? ' Nothing here can hurt you.' : '')); return; }
    const c = CHAPTERS[sm.chapter - 1];
    const open = sm.door && sm.door.open ? ' The door is open.' : '';
    this._report(`Story Mode. Chapter ${c.n} of 10, ${c.title}.${open}`);
  },

  _smStopAll() {
    const sm = this.sm;
    if (!sm) return;
    this._smHush();
    this._smClearRoom(0);
    sm.stopped = true;
  },
};

// ------------------------------------------------------------------ help
const HELP_SECTIONS = [
  ['Story Mode', [
    { title: 'Story Mode', sound: null, desc: 'Story Mode, new in 7.3.0, is a walk through the story of how Endless Labyrinth was made, in ten chapters, told by Bella, the game\'s own voice. Each chapter is a room from that part of the game\'s life. As you arrive, Bella tells that part of the story, then gives you one small task that shows off the game\'s 3D sound: centring a bell, telling in front from behind, walking to a fountain, turning a full circle, and more. Nothing can hurt you, there is no clock, and no task can be failed: take as long as you like. You turn and walk as in every walking mode (see General Turning). About 10 to 15 minutes from start to finish. Double tap for the chapter you are in and whether its door is open, and the way you are facing.' },
    { title: 'Story Mode Doors', sound: null, desc: 'When a chapter\'s task is done you hear a chime, Bella says so, and a door opens somewhere in the room: it sounds like a battle exit\'s Morse signal. Find it by ear and walk through it into the next chapter. You can stay in a room as long as you like first. Through the last door, after chapter 10, you are back at the main menu.' },
    { title: 'Story Mode The Twist', sound: null, desc: 'Once, midway through the story, not everything is so easy. You will find out when you get there. Whatever happens, nothing there can hurt you either.' },
    { title: 'Story Mode Chapters', sound: null, desc: 'The first time, the chapters come in order, from where the game started to how it is made today. Once you have walked the story to its end, Story Mode opens with a list of the chapters: choose one and the story carries on from there to the end. With the Speech setting turned Off, Bella\'s lines go to your Braille display.' },
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
  if (g === 'left' || g === 'right') { game._turnQuick(g === 'right' ? 1 : -1); return; }
  if (g === 'up' || g === 'down') game._smStep(g);
}

export default {
  menu: [{ key: 'story', label: 'Story Mode', select: (game) => game.openStoryMode() }],
  playStates: [STATE],
  mixin,
  init(game) { game.sm = null; game.storyMenuIndex = 0; },
  reset,
  update(game, dt) { game.updateStory(dt); },
  input,
  stopAll(game) { if (game.sm) game._smStopAll(); },
  finish() { return { custom: true, message: 'Story Mode. ' }; },
  room(game) { return game._smRoom(); },
  turns(game) { return game.state === STATE; },
  surroundings(game, pos, room) {
    if (room === 'cathedral') return [1.0, 0.0];
    return game._arenaSurroundings(pos);
  },
  strideSig(game) { return game.sm ? `${game.sm.chapter}|${game.sm.twist ? game.sm.twist.kind : ''}` : ''; },
  status(game) {
    const sm = game.sm;
    if (!sm) return 'Story Mode.';
    if (sm.twist) return 'Story Mode. A practice area.';
    return `Story Mode. Chapter ${sm.chapter} of 10.`;
  },
  inputStates: { [MENU_STATE]: (game, g) => game.storyMenuInput(g) },
  statusFor: { [MENU_STATE]: (game) => 'Story Mode: ' + game._smMenuLine(game.storyMenuIndex || 0) },
  help: { sections: HELP_SECTIONS, demos: [] },
};
