// The event mode itself (the desktop's EventModeMixin in event_engine.py): the
// Events menu, Event High Scores, and a run of an event in its event room, using the
// game's own sound, movement, pause and help. Names follow the desktop in camelCase
// (start_event is startEvent, self.ev_items is this.evItems) so the two can be read
// side by side. Inside these methods `this` is the game.

import { EventFeed, EventScores, EVENT_START_CHECK } from './feed.js';
import { status as eventStatus, describeDuration, hasClock, ITEMS_NEEDED, canEndWithoutClock, TOTAL_UNUSED,
  soundFiles, pyRound } from './schema.js';
import { aliasRecording, addMade, fromBuffer, ringPeriodCopy, warpCopy, padded, ensureCopies } from './sounds.js';
import { uniform, randint, randrange, choice, sample, choices, random, shuffle } from './py.js';

// Event descriptions are written for a keyboard (they are signed, so they are
// never changed). Spoken here, the keys they name become the phone's gestures
// (Russell's decision); event help explains any wording this does not know.
// A double tap's report already says the time left, so "T" goes.
const GESTURE_WORDS = [
  [/\bwith the arrow keys\b/g, 'by swiping'],
  [/\bPress the arrow toward it\b/g, 'Swipe toward it'],
  [/\bThe wrong arrow\b/g, 'The wrong swipe'],
  [/\bLeft and Right turn you and take a step\b/g, 'Swipes left and right turn you and take a step'],
  [/\bwith Up or Down\b/g, 'with a swipe up or down'],
  [/\bEnter tells you\b/g, 'A double tap tells you'],
  [/,? and T the time( left)?/g, ' and the time$1'],
  [/\bwith the laser on Space\b/g, 'with the laser, a two-finger tap'],
  [/\bwith Space\b/g, 'with a two-finger tap'],
  [/\bPress Space\b/g, 'Tap with two fingers'],
  [/\bpress Space\b/g, 'tap with two fingers'],
  [/\bpressing off the beat\b/g, 'tapping off the beat'],
];
export function gestureWords(text) {
  let t = text;
  for (const [re, to] of GESTURE_WORDS) t = t.replace(re, to);
  return t;
}


export const S_EVENT = 'event';
export const S_EVENTS_MENU = 'events_menu';
export const S_EVENT_SCORES = 'event_scores';
const S_MENU = 'menu';
const S_GAME_OVER = 'game_over';

const EVENT_REACH = 3.0;              // one step: the size of the square a thing sits in
// Missions that never use the ordinary items: none are laid out when the run starts.
const NO_ORDINARY_ITEMS = ['memory', 'pairs', 'detector', 'dodge', 'hold', 'bomb', 'reflex', 'chairs', 'keys', 'rhythm', 'lamps', 'whack'];
// Walking into things, in events only: a thing is reached only on an Up or Down step
// that lands the player in its square.
export const EVENT_SQUARE_HALF = 1.5;
const EVENT_CREDIT_GAIN = 0.7;        // credits a little quieter than the items, like battle mode
const EVENT_ITEM_SPACING = 8.0;       // items and credits never appear closer than this to each other
// How much louder the echo is in each event room than the game's usual slight echo.
export const EVENT_ROOM_GAIN = { cathedral: 2.2, hall: 1.5 };
const EVENT_AMBIENCE_SOUND = { cathedral: 'event_amb_cathedral', night: 'event_amb_night' };
const CREDIT_TIERS = 6;
const BATTLE_AIM_PAN = 0.72;

const EVENT_STEP = 3.0;
const DECOY_GAPS = [0.9, 2.2];        // silence after each ring: two rhythms per bell, so they never ring in step
const DECOY_START_SPREAD = 2.5;       // the bells of a new level start ringing within this many seconds
const DECOY_EXIT_GAP = 15.0;          // the exit appears at least this far from you
const DECOY_DARK_GUARD = 6.0;         // the exit of the dead opens this far in front of the way out (2 steps)
const DECOY_RING_PAUSE = 1.5;         // after a ring, the real bell is quiet this long before ringing from its new place
const ZONE_LEVEL = 0.75;              // the background zones together, at their loudest
const ZONE_BASE_LEVEL = 0.45;         // the event's main background, when it has zones over it
const ZONE_REACH = 1.1;               // a zone fades out this many half-widths of the room from its spot
const ZONE_PAN = 0.4;                 // how far a zone leans toward its side of the room
const ZONE_SMOOTH = 0.6;              // seconds the air takes to settle after a step
const EVENT_HAZARD_REACH = 2.5;       // a hazard this close has reached you
const EVENT_HAZARD_COOLDOWN = 2.0;    // after reaching you, a creature cannot again for this long
const EVENT_HAZARD_GRACE = 3.0;       // seconds at the start of a run nothing can reach you
const EVENT_HAZARD_START_GAP = 18.0;  // a hazard never starts closer than this to you

// The game's drone banks, for an event whose background is one of them.
const LABYRINTH_DRONES = ['lab_01_cavewind', 'lab_02_scary_cave', 'lab_03_scifi_cave', 'lab_04_dungeon_air',
  'lab_05_catacombs', 'lab_06_creepy_basement', 'lab_07_horror_basement', 'lab_08_waterflow_2',
  'lab_09_waterflow_1', 'lab_10_dreary_tunnels', 'lab_11_tunnel_fan'];
const TOWER_DRONES = ['tow_01_night_castle', 'tow_02_castle_storm', 'tow_03_howling_wind', 'tow_04_wind_lake',
  'tow_05_stormy_wind', 'tow_06_hissy_blizzard', 'tow_07_wind_underground', 'tow_08_polar_wind',
  'tow_09_concrete_hallway', 'tow_10_metallic', 'tow_11_wind_room_tone'];
const BATTLE_DRONES = ['bat_01_deep_drone', 'bat_02_creepy_dark', 'bat_03_dark_ambient', 'bat_04_dark_drone',
  'bat_05_ominous', 'bat_06_grinding', 'bat_07_texture', 'bat_08_eerie', 'bat_09_suspenseful', 'bat_10_static',
  'bat_11_horror_suspense'];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'];

// '1 floor', '5 floors', '2 enemies'.
export function count(n, unit) {
  const many = { enemy: 'enemies' }[unit] || unit + 's';
  return `${n} ${n === 1 ? unit : many}`;
}
// '2 minutes 5 seconds', '40 seconds'.
function minsSecs(seconds) {
  let s = Math.trunc(Math.max(0, seconds));
  const m = Math.floor(s / 60); s %= 60;
  const parts = (m ? [`${m} minute` + (m === 1 ? '' : 's')] : []).concat(s || !m ? [`${s} second` + (s === 1 ? '' : 's')] : []);
  return parts.join(' ');
}
// Whether a spot this far east (dx) and south (dy) of the player is in the given direction.
function inDirection(dx, dy, direction) {
  if (direction === 'anywhere' || (dx === 0 && dy === 0)) return true;
  const ang = Math.atan2(dx, -dy) * 180 / Math.PI;   // 0 ahead, 90 right, -90 left, 180 behind
  if (direction === 'ahead') return Math.abs(ang) <= 60;
  if (direction === 'behind') return Math.abs(ang) >= 120;
  if (direction === 'left') return ang >= -150 && ang <= -30;
  if (direction === 'right') return ang >= 30 && ang <= 150;
  if (direction === 'sides') return Math.abs(ang) >= 45 && Math.abs(ang) <= 135;
  if (direction === 'not_behind') return Math.abs(ang) <= 110;
  return true;
}
export const pts = (n) => `${n} point` + (n === 1 ? '' : 's');
const stemOf = (f) => f.replace(/\.[^.]*$/, '');
const sq = (x, y) => pyRound(x / EVENT_REACH) + ',' + pyRound(y / EVENT_REACH);

export class Thing {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.channel = null;
    this.value = 0;
    this.beacon = this.pickup = null;
    this.age = 0.0;
    this.home = [x, y];
    this.goal = null;
    this.hits = 0;
    this.downFor = -1.0;      // a hazard: -1 while up, else seconds it has been down
    this.extra = null;        // a second sound played with it (the light's shimmer)
    this.note = null;         // a decoys bell: which recording it is ringing now
    this.full = null;
  }
}

export const EngineMixin = {
  // ------------------------------------------------------------ setting up
  _eventSetup() {
    // The desktop makes a sound's dull copy just before it first plays if it is not
    // ready (_copies_now); the sounds made here during a run get theirs the same way.
    const audio = this.audio;
    if (!audio._eventsPlay) {
      const play = audio.play.bind(audio);
      audio._eventsPlay = play;
      audio.play = (name, opts) => { try { ensureCopies(audio, name); } catch (e) { /* plays without it */ } return play(name, opts); };
    }
    this.eventFeed = new EventFeed();
    this.eventScores = new EventScores();
    this.eventMenu = [];
    this.eventMenuIndex = 0;
    this.eventMenuWaiting = false;
    this.eventWarned = false;
    this.ev = null;
    this.evItems = []; this.evCredits = []; this.evHazards = []; this.evFakes = []; this.evZones = [];
    this.evHeld = [];
  },

  // ------------------------------------------------------------ every frame
  _eventTick(dt) {
    const feed = this.eventFeed;
    if (feed && feed.changed) {
      feed.changed = false;
      if (this.state === S_MENU) this._refreshMenu();
      if (this.state === S_EVENTS_MENU && this.eventMenuWaiting) {
        this.eventMenuWaiting = false;
        const pending = this.eventPendingStart;
        this.eventPendingStart = null;
        if (pending) {
          // A double tap on an event, and its file was checked again first, so a
          // stopped, moved or ended event is caught before the run starts.
          this._eventTryStart(this.eventFeed.events[pending] || null, pending);
        } else {
          this._eventBuildMenu();
          this._eventSpeakMenu(true);
        }
      }
    }
    // Keep the menu's Events entry true as events open and close while it sits there.
    this.eventMenuClock = (this.eventMenuClock || 0) + dt;
    if (this.eventMenuClock >= 2.0) {
      this.eventMenuClock = 0.0;
      if (this.state === S_MENU) this._refreshMenu();
    }
    if (!this.eventWarned && this.state === S_MENU) {
      this.eventWarned = true;
      for (const warn of [this.scores.takeWarning ? this.scores.takeWarning() : null, this.eventScores.takeWarning()]) {
        if (warn) this.tts.speak(warn, { interrupt: false });
      }
    }
  },

  // ------------------------------------------------------------ main menu
  _eventMenuLabel(key) {
    if (key === 'event_score') {
      if (this.eventScores.readFailed) return 'Event High Scores';
      const n = Object.keys(this.eventScores.data.events || {}).length;
      return n ? `Event High Scores: ${n} event${n === 1 ? '' : 's'}` : 'Event High Scores';
    }
    const feed = this.eventFeed;
    const [live] = feed.listing();
    const offline = !feed.online && feed.fetchedAt !== null;
    if (live.length) return offline ? `Events: offline, ${live.length} live` : `Events: ${live.length} live`;
    if (feed.busy && feed.fetchedAt === null) return 'Events: checking';
    if (!feed.online) return 'Events: offline';
    return 'Events';
  },

  // Open Event High Scores: the best run in every event played.
  _eventSpeakScore() {
    this.state = S_EVENT_SCORES;
    this.eventScoreIndex = 0;
    const lines = this._eventScoreLines();
    const n = this.eventScores.readFailed ? 0 : this.eventScores.bestRuns().length;
    const intro = n ? `Event High Scores. Your best run in ${n} event${n === 1 ? '' : 's'}. `
      + 'Swipe up and down to hear them. Triple tap goes back. ' : 'Event High Scores. ';
    this.tts.speak(intro + lines[0]);
  },

  _eventScoreLines() {
    if (this.eventScores.readFailed) {
      return ['Event High Scores could not be read this session, so no runs are shown and none are '
        + 'saved. They are read again the next time the game starts.', 'Back to the main menu'];
    }
    const out = [];
    for (const [name, best, runs, when, unit, medal] of this.eventScores.bestRuns()) {
      const played = `${runs} run${runs === 1 ? '' : 's'} played`;
      let day = '';
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(when || '');
      if (m) day = ` Best set on ${MONTHS[+m[2] - 1]} ${+m[3]}, ${+m[1]}.`;
      const won = medal ? ` Best medal: ${medal}.` : '';
      out.push(`${name}: best run ${count(best, unit)}, ${played}.${won}${day}`);
    }
    if (!out.length) out.push('No event runs yet. Play an event from the Events menu, and your best run in it is kept here.');
    return [...out, 'Back to the main menu'];
  },

  eventScoresInput(g) {
    const lines = this._eventScoreLines();
    const i = Math.min(this.eventScoreIndex || 0, lines.length - 1);
    if (g === 'up' || g === 'down') {
      const j = (i + (g === 'up' ? -1 : 1) + lines.length) % lines.length;
      this.eventScoreIndex = j;
      this.audio.play('menu_move');
      this.tts.speak(lines[j]);
    } else if (g === 'back' || (g === 'enter' && i === lines.length - 1)) {
      this.audio.play('menu_move');
      this.state = S_MENU;
      this._refreshMenu();
      this.tts.speak('Main Menu. ' + this.menuOptions[this.menuIndex]);
    } else if (g === 'enter') {
      this.tts.speak(lines[i]);
    }
  },

  // ------------------------------------------------------------ events menu
  openEventsMenu() {
    this.state = S_EVENTS_MENU;
    this.eventMenuIndex = 0;
    this.eventMenuWaiting = false;
    this.eventPendingStart = null;
    this.eventFeed.refresh(false);
    if (this.eventFeed.busy) {
      this.eventMenuWaiting = true;
      this.eventMenu = [['back', null]];
      this.tts.speak('Events. Checking for events, one moment.');
      return;
    }
    this._eventBuildMenu();
    this._eventSpeakMenu(true);
  },

  _eventBuildMenu() {
    const [live, upcoming] = this.eventFeed.listing();
    this.eventMenu = [...live.map(([ev]) => ['event', ev]), ...upcoming.map(([ev]) => ['event', ev]),
      ...this.eventFeed.testOthers().map((ev) => ['event', ev]), ['refresh', null], ['back', null]];
    this.eventMenuIndex = Math.min(this.eventMenuIndex, this.eventMenu.length - 1);
  },

  _eventLine([kind, ev]) {
    if (kind === 'refresh') return 'Check for new events';
    if (kind === 'back') return 'Back to the main menu';
    // Worked out now, every time it is said, so "ends in" is never out of date.
    const nowFor = this.eventFeed.nowFor(ev);
    const now = nowFor === null ? ev._start : nowFor;
    const desc = ev.description.trim() ? ' ' + gestureWords(ev.description.trim()) : '';
    const st = eventStatus(ev, now);
    if (st === 'ended') return `${ev.name} has ended.`;
    if (st === 'stopped') return `${ev.name} has been stopped for now.`;
    if (st === 'upcoming') return `${ev.name}, coming soon: starts in ${describeDuration(ev._start - now)}.${desc}`;
    return `${ev.name}.${desc} Ends in ${describeDuration(ev._end - now)}.`;
  },

  _eventSpeakMenu(intro = false) {
    const feed = this.eventFeed;
    const [live, upcoming] = feed.listing();
    let pre = '';
    if (intro) {
      if (!feed.online && !live.length && !upcoming.length) pre = 'Events. The internet could not be reached, so no events can be shown. ';
      else if (!feed.online) pre = `Events. The internet could not be reached, so only the built-in events are shown. ${live.length} live. `;
      else if (!live.length && !upcoming.length && !feed.testOthers().length) pre = 'Events. No events are on right now. ';
      else pre = `Events. ${live.length} live. `;
    }
    this.tts.speak(pre + this._eventLine(this.eventMenu[this.eventMenuIndex]));
  },

  eventsMenuInput(g) {
    if (g === 'back') {
      this.eventMenuWaiting = false;
      this.eventPendingStart = null;
      this.evPreparing = null;
      this.state = S_MENU;
      this._refreshMenu();
      this.tts.speak('Main Menu. ' + this.menuOptions[this.menuIndex]);
      return;
    }
    if (this.eventMenuWaiting || this.evPreparing) return;
    if (g === 'up' || g === 'down') {
      const step = g === 'up' ? -1 : 1;
      this.eventMenuIndex = (this.eventMenuIndex + step + this.eventMenu.length) % this.eventMenu.length;
      this.audio.play('menu_move');
      this._eventSpeakMenu();
    } else if (g === 'enter') {
      const [kind, pair] = this.eventMenu[this.eventMenuIndex];
      this.audio.play('menu_move');
      if (kind === 'back') {
        this.state = S_MENU;
        this._refreshMenu();
        this.tts.speak('Main Menu. ' + this.menuOptions[this.menuIndex]);
      } else if (kind === 'refresh') {
        this.eventFeed.refresh(true);
        this.eventMenuWaiting = true;
        this.tts.speak('Checking for events, one moment.');
      } else {
        const ev = pair;
        const feed = this.eventFeed;
        const fresh = feed.fetchedAt !== null && performance.now() / 1000 - feed.fetchedAt < EVENT_START_CHECK;
        if (!fresh) {
          // Check the event's file again before a run starts, so one the developer
          // has stopped or changed is never played from an old copy.
          this.eventPendingStart = ev.id;
          this.eventMenuWaiting = true;
          feed.refresh(true);
          this.tts.speak(`${ev.name}. One moment.`);
          return;
        }
        this._eventTryStart(ev);
      }
    }
  },

  // Start an event if it is live right now; otherwise say why not.
  _eventTryStart(ev, pendingName = null) {
    if (ev === null) {
      this._eventBuildMenu();
      const why = this.eventFeed.online ? 'That event is no longer available. '
        : 'The internet could not be reached, so that event cannot be checked right now. ';
      this.tts.speak(why + this._eventLine(this.eventMenu[this.eventMenuIndex]));
      return;
    }
    const cur = this.eventFeed.nowFor(ev);
    const st = cur !== null ? eventStatus(ev, cur) : 'offline';
    if (st === 'live') {
      this._eventLoadThenStart(ev);
      return;
    }
    this._eventBuildMenu();
    let msg;
    if (st === 'upcoming') msg = `${ev.name} has not started yet. It starts in ${describeDuration(ev._start - cur)}. `;
    else if (st === 'stopped') msg = `${ev.name} has been stopped for now. `;
    else if (st === 'offline') msg = 'The internet could not be reached, so events cannot be checked. ';
    else msg = `${ev.name} has ended. `;
    this.tts.speak(msg + this._eventLine(this.eventMenu[this.eventMenuIndex]));
  },

  // Web only: the desktop reads an event's recordings from disk the moment the run
  // starts. Here they are unpacked first (a moment, silently, still on the Events
  // menu), so the run then starts exactly as the desktop's does.
  _eventLoadThenStart(ev) {
    const token = {};
    this.evPreparing = token;
    const files = [...new Set([...soundFiles(ev), ev.item.bonus_file].filter((f) => f))];
    const audio = this.audio;
    this.evRecordings = {};
    // The background drone of a battle or tower room is picked now and decoded with
    // the rest, so it starts the moment the run does, as on the desktop.
    this.evPrepicked = null;
    if (ev.ambience === 'battle') this.evPrepicked = BATTLE_DRONES[randrange(BATTLE_DRONES.length)];
    else if (ev.ambience === 'tower') this.evPrepicked = TOWER_DRONES[this._eventPickTower()];
    const drone = this.evPrepicked ? audio.prepare(this.evPrepicked) : Promise.resolve();
    Promise.all([drone, ...files.map(async (f) => {
      let pair = null;
      try { pair = audio.entries.get(stemOf(f)); } catch (e) { return; }   // not a file name: the theme's own sound
      if (!pair || !pair.dry || pair.dry.made) return;
      const got = {};
      for (const kind of ['dry', 'dull', 'dull1']) {
        try { if (pair[kind]) got[kind] = await audio._decodeEntry(pair[kind]); } catch (e) { /* the theme's own sound is used */ }
      }
      if (got.dry) this.evRecordings[stemOf(f)] = got;
    })]).then(() => {
      if (this.evPreparing !== token || this.state !== S_EVENTS_MENU) {
        if (this.evPreparing === token) this.evPreparing = null;
        if (this.state !== S_EVENT) this.evRecordings = null;
        return;
      }
      this.evPreparing = null;
      this.startEvent(ev);
    });
  },

  // A recording for an event, under its event name (load_event_recording). Returns
  // the name, or null if it is not in the event pack (the theme's own sound is used).
  loadEventRecording(fname, role) {
    if (!fname) return null;
    const stem = stemOf(fname);
    const name = aliasRecording(this.audio, stem, `event_${role}_file_${stem}`);
    if (!name) return null;
    const got = this.evRecordings && this.evRecordings[stem];
    if (got && !this.audio.buffers.has('dry:' + name)) {
      this.audio.buffers.set('dry:' + name, got.dry);
      const pair = this.audio.entries.get(name);
      const dull = pair.dull && (pair.dull === this.audio.entries.get(stem).dull ? got.dull : got.dull1);
      if (dull) this.audio.buffers.set('dull:' + name, dull);
      this.evHeld.push(name);
    }
    return name;
  },

  // ------------------------------------------------------------ a run
  _eventMedal(ev, score) {
    const md = ev.medals || {};
    for (const k of ['gold', 'silver', 'bronze']) if (md[k] && score >= md[k]) return k;
    return null;
  },

  _eventMedalText(ev, score) {
    const medal = this._eventMedal(ev, score);
    if (!Object.values(ev.medals || {}).some((v) => v)) return '';
    this.eventScores.recordMedal(ev, medal);
    if (medal) return `${medal.charAt(0).toUpperCase() + medal.slice(1)} medal! `;
    const first = ['bronze', 'silver', 'gold'].find((k) => ev.medals[k]);
    return `No medal this time: ${count(ev.medals[first], 'point')} wins ${first}. `;
  },

  // Whether the player has walked into something at pos in an event: the last step
  // was Up or Down (Left and Right never touch anything), and it is in the square the
  // player stands in.
  evSteppedOnto(pos, reach = EVENT_REACH) {
    const step = this.evLastStep || [0, -1];
    if (step[0] !== 0) return false;
    const half = EVENT_SQUARE_HALF * reach / EVENT_REACH;
    return Math.abs(pos[0] - this.playerPos[0]) <= half && Math.abs(pos[1] - this.playerPos[1]) <= half;
  },

  startEvent(ev) {
    this.state = S_EVENT;
    this.resetGameState();
    this.evLastStep = [0, -1];      // as if facing north: nothing is near at the start
    this.evUpdatedAt = null;
    // An event's own ambience never picks a room variation, so the plain room is used.
    delete this.audio.variants[ev.room];
    // A random total: each run picks its own number of items. The run plays a copy,
    // so the event itself, and its signature, are never changed.
    const [lo, hi] = ev._total_range || [ev.item.total, ev.item.total_max || 0];
    if (hi > lo && lo > 0) {
      ev = structuredClone(ev);
      ev._total_range = [lo, hi];
      ev.item.total = randint(lo, hi);
    }
    this.ev = ev;
    this.evItems = []; this.evCredits = []; this.evHazards = [];
    this.evCollected = this.evPoints = this.evSpawned = 0;
    this.evElapsed = 0.0;
    this.evAlivePoints = 0.0;
    this.evDowns = 0;
    const tc = ev.time_credits;
    this.evCreditTimer = tc.first_after_seconds;
    this.playerPos = [0.0, 0.0];
    this.playerFacing = [0, -1];
    this.grid = new Set();
    this.arenaLimit = ev.room_size;
    this.evClock = hasClock(ev);
    this.timeLeft = this.evClock ? ev.time_limit_seconds : 0.0;
    const step = this.evClock ? ev.clock.announce_every_seconds : 0;
    this.evNextAnnounce = step ? Math.floor((this.timeLeft - 1) / step) * step : -1.0;
    this.evFakes = []; this.evExit = null; this.evDarkExit = null;
    this.evLevel = 1; this.evLevelsDone = 0;
    this.evRingsLevel = null;
    this.evBonuses = 0;
    this.lastBeepSecond = -1;
    this._syncRoom();
    this._wake(true);
    if (this.ambienceChannel) this.ambienceChannel.stop();
    if (this.beatChannel) { this.beatChannel.stop(); this.beatChannel = null; }
    const amb = ev.ambience;
    let name = EVENT_AMBIENCE_SOUND[amb] || null;
    if (amb === 'labyrinth') name = LABYRINTH_DRONES[this._pickAmb('lab')];
    else if (amb === 'tower') name = this.evPrepicked || TOWER_DRONES[this._eventPickTower()];
    else if (amb === 'battle') name = this.evPrepicked || BATTLE_DRONES[randrange(BATTLE_DRONES.length)];
    this.evPrepicked = null;
    if (!(amb in EVENT_AMBIENCE_SOUND) && !['labyrinth', 'tower', 'battle', 'none'].includes(amb)) {
      // A recording from the library; the cathedral air if it is missing.
      name = this.loadEventRecording(amb, 'amb') || 'event_amb_cathedral';
    }
    const zones = ev.ambience_zones || [];
    const level = Math.min(1.0, (zones.length ? ZONE_BASE_LEVEL : 0.8) * ev.ambience_volume);
    this.ambienceChannel = name && level > 0 ? this.audio.play(name, { loops: -1, volume: level, fadeMs: 400 }) : null;
    this._eventStartZones(zones);
    const it = ev.item;
    this.evBeacon = this.loadEventRecording(it.beacon_file, 'beacon') || `event_beacon_${it.theme}`;
    // Several recordings: each item picks one of them at random.
    const set = (it.beacon_set || []).map((f) => this.loadEventRecording(f, 'beacon')).filter((n) => n);
    this.evBeacons = set.length ? set : [this.evBeacon];
    this.evPickup = this.loadEventRecording(it.pickup_file, 'pickup') || `event_pickup_${it.theme}`;
    this.evBonusBeacon = this.loadEventRecording(it.bonus_file, 'beacon') || `event_beacon_${it.bonus_theme}`;
    this.evBonusPickup = `event_pickup_${it.bonus_theme}`;
    this.evLives = ev.hazards.lives;
    this.evEndSound = this.loadEventRecording(ev.messages.end_sound, 'sting') || 'event_toll_end';
    this.audio.play(this.loadEventRecording(ev.messages.start_sound, 'sting') || 'event_toll');
    // No spoken intro: the event's description, read in the Events menu, already said
    // what to do. This only cuts off the menu's speech.
    this.tts.speak('', { interrupt: true });
    this.evTimeBonus = 0;
    let ownItems = false;
    if (ev.mission === 'decoys') {
      [this.evRealPool, this.evFakePool] = this._decoyPool(ev);
      this._decoyLevel();
      ownItems = true;
    } else if (['relay', 'follow', 'order'].includes(ev.mission)) {
      ownItems = true;
    } else if (NO_ORDINARY_ITEMS.includes(ev.mission)) {
      ownItems = true;
    }
    if (!ownItems) {
      const n = ITEMS_NEEDED.includes(ev.mission) ? Math.max(1, it.at_once) : it.at_once;
      for (let i = 0; i < n; i++) this._eventSpawnItem();
    }
    // Hazards and the weapon.
    this.evHazards = [];
    this.evShots = ev.weapon.enabled ? ev.weapon.start_shots : 0;
    const hz = ev.hazards;
    // With no clock, an event whose only ending is a creature's touch could never end
    // once every creature is shot down for good: then the run ends there.
    try {
      const quiet = { ...ev, hazards: { ...hz, count: 0 } };
      const freshRooms = ev.mission === 'escape' || (ev.mission === 'keys' && (ev.keys || {}).more_creatures_each_room);
      const dc = ev.decoys || {};
      const decoysOnlyCreatures = ev.mission === 'decoys' && !dc.fakes_first_level && !dc.fakes_per_level && !dc.dark_exit_chance;
      this.evEndsByCreaturesOnly = Boolean(!this.evClock && hz.count > 0 && !hz.respawn_seconds && ev.mission !== 'hunt'
        && !freshRooms && (decoysOnlyCreatures || canEndWithoutClock(quiet) !== null));
    } catch (e) {
      this.evEndsByCreaturesOnly = false;
    }
    const snd = hz.sound;
    if (snd === 'guardian') this.evHazardSounds = ['guardian'];
    else if (snd === 'enemy') this.evHazardSounds = sample([...Array(10).keys()], 10).map((i) => `obstacle_${i}`);
    else this.evHazardSounds = [this.loadEventRecording(snd, 'beacon_hazard') || 'guardian'];
    if (ev.mission !== 'escape') for (let i = 0; i < hz.count; i++) this._eventSpawnHazard(i);
    // The mission's own set-up.
    this._mStart(ev);
  },

  // A tower drone for an event's background, never the one just played (_pick_amb).
  _eventPickTower() {
    const last = this.ambLast.tower;
    const idx = choice([...Array(TOWER_DRONES.length).keys()].filter((i) => i !== last));
    this.ambLast.tower = idx;
    return idx;
  },

  _eventSpot(minD, maxD, direction = 'anywhere') {
    const lim = this.arenaLimit - 2.0;
    const [px, py] = this.playerPos;
    // Kept clear: everything already out, the pads of this round as they are laid,
    // and the ways out.
    const taken = [...this.evItems, ...this.evCredits, ...(this.evFakes || []), ...(this.mPads || [])].map((t) => [t.x, t.y]);
    for (const ex of [this.evExit, this.evDarkExit]) if (ex) taken.push([ex.x, ex.y]);
    // And a mission's own things.
    for (const th of [this.mKey, this.mExit, this.mSpot, this.mBomb, this.mBuried, this.mDropoff]) {
      if (th && th.x !== undefined) taken.push([th.x, th.y]);
    }
    for (const t of this.mAmmo || []) taken.push([t.x, t.y]);
    // Never in the player's own square, nor where the mission would take it at once.
    const clear = EVENT_SQUARE_HALF * 1.5;
    const zones = this._eventClearZones();
    const used = new Set(taken.map(([a, b]) => sq(a, b)));
    for (let attempt = 0; attempt < 300; attempt++) {
      const relax = attempt < 200 ? 1.0 : 0.5;
      const x = uniform(-lim, lim); const y = uniform(-lim, lim);
      const d = Math.hypot(x - px, y - py);
      if (d < Math.max(minD * relax, clear) || (maxD && d > maxD)) continue;
      if (used.has(sq(x, y))) continue;
      if (zones.some(([zx, zy, zr]) => Math.hypot(x - zx, y - zy) < zr)) continue;
      if (attempt < 250 && !inDirection(x - px, y - py, direction)) continue;
      if (taken.some(([a, b]) => Math.hypot(x - a, y - b) < EVENT_ITEM_SPACING * relax)) continue;
      return [x, y];
    }
    // A crowded room: the spot, out of a few dozen tried, farthest from everything
    // already there and outside the player's square.
    let best = null; let bestGap = -1.0;
    let least = this._eventFarSpot(); let leastIn = null;
    for (let i = 0; i < 200; i++) {
      const x = uniform(-lim, lim); const y = uniform(-lim, lim);
      if (Math.hypot(x - px, y - py) < clear || used.has(sq(x, y))) continue;
      const out = zones.length ? Math.min(...zones.map(([zx, zy, zr]) => Math.hypot(x - zx, y - zy) - zr)) : 99.0;
      if (out < 0) {
        if (leastIn === null || out > leastIn) { least = [x, y]; leastIn = out; }
        continue;
      }
      const gap = taken.length ? Math.min(...taken.map(([a, b]) => Math.hypot(x - a, y - b))) : 99.0;
      if (gap > bestGap) { best = [x, y]; bestGap = gap; }
    }
    return best !== null ? best : least;
  },

  _eventSpawnItem() {
    const it = this.ev.item;
    if (it.total && this.evSpawned >= it.total) return;
    const [x, y] = this._eventSpot(it.min_distance, it.max_distance, it.direction || 'anywhere');
    const th = new Thing(x, y);
    // Now and then a rare bonus item (never in sorting: no bin takes it).
    th.value = (it.bonus_chance && this.ev.mission !== 'sort' && random() < it.bonus_chance) ? 1 : 0;
    th.beacon = th.value ? this.evBonusBeacon : choice(this.evBeacons || [this.evBeacon]);
    if (this.ev.mission !== 'seek') th.channel = this.audio.play(th.beacon, { loops: -1, volume: 0.0 });
    this.evItems.push(th);
    this.evSpawned += 1;
  },

  // The corner farthest from the player: the one spot always well clear.
  _eventFarSpot() {
    const lim = this.arenaLimit - 3.0;
    const [px, py] = this.playerPos;
    return [px > 0 ? -lim : lim, py > 0 ? -lim : lim];
  },

  _eventHazardHome(respawn = false) {
    const lim = this.arenaLimit - 3.0;
    const home = this.ev.mission === 'defend' ? 'edge' : this.ev.hazards.home;
    const [px, py] = this.playerPos;
    for (let i = 0; i < 100; i++) {
      let x; let y;
      if (home === 'corner') { x = choice([-lim, lim]); y = choice([-lim, lim]); }
      else if (home === 'edge') { const v = uniform(-lim, lim); [x, y] = choice([[v, -lim], [v, lim], [-lim, v], [lim, v]]); }
      else if (home === 'center') { x = uniform(-3, 3); y = uniform(-3, 3); }
      else { x = uniform(-lim, lim); y = uniform(-lim, lim); }
      // A middle start keeps no gap at the start of a run, but one coming back after
      // being shot down never lands on top of the player.
      const d = Math.hypot(x - px, y - py);
      if (d >= Math.min(EVENT_HAZARD_START_GAP, lim)) return [x, y];
      if (home === 'center' && !respawn) {
        // A sleeping guard in the middle starts just out of reach.
        if (this.ev && this.ev.mission === 'sneak' && d < EVENT_HAZARD_REACH + 0.5) continue;
        return [x, y];
      }
    }
    return this._eventFarSpot();
  },

  _eventSpawnHazard(i = 0, th = null) {
    const respawn = th !== null;
    const [x, y] = this._eventHazardHome(respawn || (this.evElapsed || 0.0) > 0.0);
    if (th === null) {
      th = new Thing(x, y);
      th.beacon = this.evHazardSounds[i % this.evHazardSounds.length];
      this.evHazards.push(th);
    }
    th.x = x; th.y = y; th.home = [x, y];
    th.age = 0.0;
    th.hits = 0; th.downFor = -1.0; th.goal = null;
    if (th.channel) th.channel.stop();
    th.channel = this.audio.play(th.beacon, { loops: -1, volume: 0.0 });
    th.note = null;
    if (respawn && this.ev && this.ev.mission === 'sneak') this._mSneakSound(th, this.mGuardAsleep());
    return th;
  },

  _eventMoveHazard(th, dt) {
    const hz = this.ev.hazards;
    const [px, py] = this.playerPos;
    const lim = this.arenaLimit - 1.0;
    let beh = hz.behavior;
    if (this.ev.mission === 'sneak') {
      if (this.mGuardAsleep()) return;
      beh = 'hunt';
    }
    if (this.ev.mission === 'defend') {
      // Straight for the treasure in the middle, a little faster each time one comes back.
      const dx = -th.x; const dy = -th.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.05) {
        const stepd = Math.min(d, (hz.speed + (this.mSpeedBonus || 0.0)) * EVENT_STEP * dt);
        th.x += dx / d * stepd;
        th.y += dy / d * stepd;
      }
      return;
    }
    let gx; let gy;
    if (beh === 'hunt') { gx = px; gy = py; }
    else if (beh === 'guard') {
      if (Math.hypot(px - th.home[0], py - th.home[1]) <= hz.react_distance) { gx = px; gy = py; }
      else [gx, gy] = th.home;
    } else {
      if (th.goal === null || Math.hypot(th.goal[0] - th.x, th.goal[1] - th.y) < 1.0) th.goal = [uniform(-lim, lim), uniform(-lim, lim)];
      [gx, gy] = th.goal;
    }
    const dx = gx - th.x; const dy = gy - th.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.05) {
      const stepd = Math.min(d, hz.speed * EVENT_STEP * dt);     // speed is in steps a second
      th.x = Math.max(-lim, Math.min(lim, th.x + dx / d * stepd));
      th.y = Math.max(-lim, Math.min(lim, th.y + dy / d * stepd));
    }
  },

  // Space: the laser, aimed exactly as in battle mode - whatever is centred between
  // your ears, nearest first, in front or behind.
  eventFire() {
    const ev = this.ev;
    if (ev && ev.mission === 'seek') { this.mPing(); return; }
    if (ev && ev.mission === 'fishing') { this.mCast(); return; }
    if (ev && ev.mission === 'rhythm') { this.mTap(); return; }
    if (!ev || !ev.weapon.enabled) { this.audio.play('empty_click'); return; }
    if (this.evShots <= 0) { this.audio.play('empty_click'); return; }
    this.evShots -= 1;
    this.audio.play('laser');
    let best = null;
    for (const th of this.evHazards) {
      if (th.downFor >= 0) continue;
      const dx = th.x - this.playerPos[0]; const dy = th.y - this.playerPos[1];
      const dist = Math.hypot(dx, dy);
      const pan = dist > 0 ? dx / dist : 0.0;
      if (Math.abs(pan) < BATTLE_AIM_PAN || dist < 1.0) {
        if (best === null || dist < best[0]) best = [dist, th];
      }
    }
    if (best === null || !ev.hazards.can_be_shot) return;
    const th = best[1];
    th.hits += 1;
    const hz = ev.hazards;
    if (th.hits >= hz.hits_to_down) {
      th.downFor = 0.0;
      if (th.channel) { th.channel.stop(); th.channel = null; }
      if (!hz.respawn_seconds && this.evHazards.every((h) => h.downFor >= 0)) {
        // The last one down, and none comes back: the run may end at once, so the
        // explosion is heard now.
        this.audio.play('explosion', { at: [th.x, th.y] });
      } else {
        this._later(Math.min(0.4, best[0] / 60.0), 'explosion', [th.x, th.y]);
      }
      this.evPoints += hz.points_for_down;
      this.evDowns = (this.evDowns || 0) + 1;
    } else {
      this._later(Math.min(0.4, best[0] / 60.0), this.audio.has('guardian_hit') ? 'guardian_hit' : 'enemy_hit', [th.x, th.y]);
    }
  },

  _eventUpdateHazards(dt) {
    const hz = this.ev.hazards;
    for (const th of this.evHazards) {
      if (th.downFor >= 0) {
        th.downFor += dt;
        if (this.ev.mission !== 'defend' && hz.respawn_seconds && th.downFor >= hz.respawn_seconds) this._eventSpawnHazard(0, th);
        continue;
      }
      this._eventMoveHazard(th, dt);
      const [left, right, dist] = this._battleLevels([th.x, th.y], hz.volume * this.mSleepingGain());
      if (th.channel) th.channel.setVolume(Math.min(1.0, left), Math.min(1.0, right), this._behind([th.x, th.y]));
      th.age += dt;
      if (dist < EVENT_HAZARD_REACH && this.evElapsed > EVENT_HAZARD_GRACE && th.age >= EVENT_HAZARD_COOLDOWN && !this.mHazardsHeld()) {
        th.age = 0.0;
        if (this.mTouchHandled(th)) continue;
        this.audio.play('player_hit');
        this._mTouched();
        if (hz.on_touch === 'end_run') {
          this.evLives = (this.evLives === undefined ? 1 : this.evLives) - 1;
          if (this.evLives <= 0) {
            this._eventFinish('caught');
            return true;
          }
          // A life lost: nothing is said, the hit is the sign.
        } else if (hz.on_touch === 'lose_time') {
          this.timeLeft -= hz.penalty;
          this.lastBeepSecond = -1;
          const step = this.ev.clock.announce_every_seconds;
          if (step) this.evNextAnnounce = Math.floor((this.timeLeft - 1) / step) * step;
        } else {
          // Taken from the points for items first, then from the points for staying alive.
          const take = Math.min(hz.penalty, this.evPoints);
          this.evPoints -= take;
          this.evAlivePoints = Math.max(0.0, this.evAlivePoints - (hz.penalty - take));
        }
        // Thrown back, well clear of you, so one touch never becomes two.
        [th.x, th.y] = th.home;
        if (Math.hypot(th.x - this.playerPos[0], th.y - this.playerPos[1]) < EVENT_HAZARD_START_GAP) [th.x, th.y] = this._eventFarSpot();
      }
    }
    return false;
  },

  // ------------------------------------------------------------ background zones
  // Each zone's recording at its own spot: evenly round the room, and with five or
  // more, the last one in the middle.
  _eventStartZones(files) {
    this.evZones = [];
    const lim = this.arenaLimit;
    const ring = files.length <= 4 ? files : files.slice(0, -1);
    files.forEach((f) => {
      const name = this.loadEventRecording(f, 'amb');
      if (!name) return;
      let x; let y;
      if (ring.includes(f) && files.length > 1) {
        const ang = 2 * Math.PI * ring.indexOf(f) / ring.length + Math.PI / 4;
        x = 0.65 * lim * Math.cos(ang); y = 0.65 * lim * Math.sin(ang);
      } else { x = 0.0; y = 0.0; }
      const th = new Thing(x, y);
      th.channel = this.audio.play(name, { loops: -1, volume: 0.0, fadeMs: 400 });
      th.value = 0.0;
      th.age = 0.0;
      this.evZones.push(th);
    });
    this._eventUpdateZones(10.0);
  },

  _eventUpdateZones(dt) {
    const zones = this.evZones || [];
    if (!zones.length) return;
    const [px, py] = this.playerPos;
    const reach = ZONE_REACH * this.arenaLimit;
    const weights = zones.map((th) => Math.max(0.0, 1.0 - Math.hypot(th.x - px, th.y - py) / reach));
    const norm = Math.sqrt(weights.reduce((s, w) => s + w * w, 0)) || 1.0;
    const a = Math.min(1.0, dt / ZONE_SMOOTH);
    zones.forEach((th, i) => {
      const target = Math.min(1.0, ZONE_LEVEL * (this.ev.zones_volume === undefined ? 1.0 : this.ev.zones_volume) * weights[i] / norm);
      th.value += (target - th.value) * a;
      const dx = th.x - px; const dy = th.y - py;
      const d = Math.hypot(dx, dy);
      const pan = d > 1e-6 ? dx / d : 0.0;
      th.age += (pan - th.age) * a;
      const left = th.value * (1.0 - ZONE_PAN * Math.max(0.0, th.age));
      const right = th.value * (1.0 - ZONE_PAN * Math.max(0.0, -th.age));
      if (th.channel) th.channel.setVolume(left, right);
    });
  },

  // ------------------------------------------------------------ the decoys mission
  // The real and fake sounds of a decoys event, made once and kept: for every
  // recording in the item's set, real copies and a warped fake of each, named for the
  // event's room. The recordings themselves are never changed.
  _decoyPool(ev) {
    const it = ev.item;
    const room = ['cathedral', 'hall', 'lab', 'tower', 'battle'].includes(ev.room) ? ev.room : 'open';
    const files = (it.beacon_set && it.beacon_set.length) ? [...it.beacon_set] : (it.beacon_file ? [it.beacon_file] : []);
    const sources = [];
    for (const f of files) {
      const got = this.evRecordings && this.evRecordings[stemOf(f)];
      if (got) sources.push([stemOf(f), got.dry]);
    }
    if (!sources.length) {
      // No recordings: the item theme's own sound.
      const base = this.audio.buffers.get(`dry:event_beacon_${it.theme}`) || this.audio.buffers.get('dry:event_beacon_bell');
      if (base) sources.push([`theme_${it.theme}`, base]);
    }
    const strength = ev.decoys.distortion;
    const every = ev.decoys.ring_every_seconds;
    const real = []; const fake = [];
    this.evNotes = {};
    const draws = this._eventWarpDraws();
    for (const [stem, buf] of sources) {
      this.evNotes[stem] = [[], []];
      let arr = null;
      const src = () => (arr || (arr = fromBuffer(buf)));
      const seed = draws[stem] || [105, 425, 5.5, 8.0];
      if (every) {
        // Every bell strikes once a period, real and false alike.
        let one = null;
        for (const kind of ['real', 'fake']) {
          const name = `event_room_${room}_beacon_${kind}_${stem}_every${Math.trunc(every * 100)}` + (kind === 'fake' ? `_${Math.trunc(strength * 100)}` : '');
          if (!this.audio.has(name)) {
            one = one || ringPeriodCopy(src(), every);
            addMade(this.audio, name, kind === 'real' ? one : warpCopy(one, strength, seed));
          }
          (kind === 'real' ? real : fake).push(name);
          this.evNotes[stem][kind === 'real' ? 0 : 1].push(name);
        }
        continue;
      }
      DECOY_GAPS.forEach((gap, gi) => {
        for (const kind of ['real', 'fake']) {
          const name = `event_room_${room}_beacon_${kind}_${stem}_${gi}` + (kind === 'fake' ? `_${Math.trunc(strength * 100)}` : '');
          if (!this.audio.has(name)) {
            const a = kind === 'real' ? src() : warpCopy(src(), strength, seed);
            addMade(this.audio, name, padded(a, gap));
          }
          (kind === 'real' ? real : fake).push(name);
          this.evNotes[stem][kind === 'real' ? 0 : 1].push(name);
        }
      });
    }
    return [real, fake];
  },

  // The four numbers the desktop's warp_copy draws for each recording, from the pack.
  _eventWarpDraws() {
    if (this._warpDraws) return this._warpDraws;
    // Read from the pack when the sounds were loaded (AudioEngine.load).
    this._warpDraws = this.audio.warpDraws || {};
    return this._warpDraws;
  },

  _decoyCounts() {
    const dc = this.ev.decoys;
    const n = this.evLevel - 1;
    return [Math.min(dc.real_most, dc.real_first_level + dc.real_per_level * n),
      Math.min(dc.fakes_most, dc.fakes_first_level + dc.fakes_per_level * n)];
  },

  // How many times each real one must be rung on this level.
  _decoyRings() {
    const dc = this.ev.decoys;
    if (this.evRingsLevel === this.evLevel) return this.evRingsNow;
    let n;
    if (this.evLevel <= 1) n = dc.rings_first_level;
    else if (dc.rings_random) n = (this.evRingsNow === undefined ? dc.rings_first_level : this.evRingsNow) + randint(0, dc.rings_per_level);
    else n = dc.rings_first_level + dc.rings_per_level * (this.evLevel - 1);
    this.evRingsNow = Math.max(1, Math.min(dc.rings_most, n));
    this.evRingsLevel = this.evLevel;
    return this.evRingsNow;
  },

  // A real bell takes a recording (a note) of its own, never the one in `avoid`.
  _decoyGiveNote(th, avoid = null) {
    const notes = Object.keys(this.evNotes || {});
    const pool = notes.filter((n) => n !== avoid);
    const options = pool.length ? pool : notes;
    if (options.length) {
      th.note = choice(options);
      th.beacon = choice(this.evNotes[th.note][0]);
    } else {
      th.beacon = choice(this.evRealPool);
    }
  },

  // With fakes_match_real, the fakes become warped copies of the notes the real bells
  // are ringing now, shared out among them.
  _decoyFakesFollow(delay = true) {
    if (!(this.ev.decoys.fakes_match_real && this.evItems.length)) return;
    const notes = [];
    for (const th of this.evItems) {
      if (th.note && !notes.includes(th.note) && ((this.evNotes[th.note] || [[], []])[1]).length) notes.push(th.note);
    }
    if (!notes.length) return;
    const owner = new Map();
    for (const note of notes) for (const name of this.evNotes[note][1]) owner.set(name, note);
    const cnt = Object.fromEntries(notes.map((n) => [n, 0]));
    const moving = [];
    const on = new Map();                 // fake -> the note it copies
    for (const th of this.evFakes) {
      const note = owner.get(th.beacon);
      if (note !== undefined && note in cnt) { cnt[note] += 1; on.set(th, note); }
      else moving.push(th);
    }
    const minBy = (arr, key) => arr.reduce((b, x) => (key(x) < key(b) ? x : b));
    const cmp = (nn) => cnt[nn] * 1000 + notes.indexOf(nn);
    for (const th of moving) {
      const note = minBy(notes, cmp);
      cnt[note] += 1;
      on.set(th, note);
    }
    // Shared out: while a rung note has no look-alike and another has two or more,
    // one of those moves over.
    for (;;) {
      const empty = notes.filter((nn) => cnt[nn] === 0);
      const rich = notes.reduce((b, x) => (cnt[x] > cnt[b] ? x : b));
      if (!empty.length || cnt[rich] < 2) break;
      const th = [...this.evFakes].reverse().find((f) => on.get(f) === rich);
      cnt[rich] -= 1;
      cnt[empty[0]] += 1;
      on.set(th, empty[0]);
      if (!moving.includes(th)) moving.push(th);
    }
    for (const th of moving) {
      const note = on.get(th);
      const nw = choice(this.evNotes[note][1]);
      if (th.channel) { th.channel.stop(); th.channel = null; }
      th.beacon = nw;
      th.age = -uniform(0.0, DECOY_START_SPREAD) - (delay ? DECOY_RING_PAUSE : 0.0);
    }
  },

  _decoyClear() {
    const exits = [this.evExit, this.evDarkExit].filter((e) => e);
    for (const th of [...this.evItems, ...this.evFakes, ...exits]) {
      for (const ch of [th.channel, th.extra]) { try { if (ch) ch.stop(); } catch (e) { /* gone */ } }
    }
    this.evItems = []; this.evFakes = []; this.evExit = null; this.evDarkExit = null;
  },

  // Lay out a level: the real ones and the fakes, ringing in their own time.
  _decoyLevel() {
    const it = this.ev.item; const dc = this.ev.decoys;
    this._decoyClear();
    const [realN, fakeN] = this._decoyCounts();
    const rings = this._decoyRings();
    this.evLevelNeed = realN * rings;
    this.evLevelFound = 0;
    for (let i = 0; i < fakeN; i++) {
      const th = new Thing(...this._eventSpot(dc.fake_closest, 0));
      th.beacon = choice(this.evFakePool);
      th.age = -uniform(0.0, DECOY_START_SPREAD);
      this.evFakes.push(th);
    }
    for (let i = 0; i < realN; i++) {
      const th = new Thing(...this._eventSpot(it.min_distance, it.max_distance, it.direction || 'anywhere'));
      this._decoyGiveNote(th);
      th.hits = rings;
      th.age = -uniform(0.0, DECOY_START_SPREAD);
      this.evItems.push(th);
    }
    this._decoyFakesFollow(false);
    // Level 1 is described in the Events menu, so the run starts in silence. Each level
    // after says only how many rings (or real ones) it asks for.
    if (dc.announce_levels && this.evLevel > 1) {
      if (rings > 1 || (dc.rings_random && realN === 1)) {
        this.tts.speak(rings === 1 ? 'Ring once.' : `Ring ${rings} times.`);
      } else {
        const word = realN === 1 ? it.name : it.plural;
        this.tts.speak(`Find ${realN} real ${word}.`);
      }
    }
  },

  // Start a bell when its moment comes, and keep its place in the room.
  _decoySound(th, gain) {
    if (th.channel === null) {
      th.age += this._evDt;
      if (th.age >= 0) th.channel = this.audio.play(th.beacon, { loops: -1, volume: 0.0 });
    }
    const [left, right, dist] = this._battleLevels([th.x, th.y], gain);
    if (th.channel) th.channel.setVolume(left, right, this._behind([th.x, th.y]));
    return dist;
  },

  // Returns true if the run has ended.
  _decoyUpdate(dt) {
    const it = this.ev.item; const dc = this.ev.decoys;
    this._evDt = dt;
    for (const th of [...this.evFakes]) {
      this._decoySound(th, it.volume);
      if (this.evSteppedOnto([th.x, th.y], EVENT_REACH)) {
        // A false one: the run is over. Its own warped ring sounds once more, right
        // beside you, under the hit.
        this._eventFinish('fake');
        this.audio.play(th.beacon, { volume: 1.0 });
        this.audio.play('player_hit');
        return true;
      }
    }
    for (const th of [...this.evItems]) {
      this._decoySound(th, it.volume);
      if (this.evSteppedOnto([th.x, th.y], EVENT_REACH)) {
        if (th.channel) { th.channel.stop(); th.channel = null; }
        this.audio.play(this.evPickup, { at: [th.x, th.y] });
        this.evCollected += 1;
        this.evLevelFound += 1;
        this.evPoints += it.points;
        th.hits -= 1;
        if (th.hits > 0) {
          // Rung, but not done: it falls quiet, then rings from somewhere new with
          // another note, and the fakes take up that note too.
          [th.x, th.y] = this._eventSpot(it.min_distance, it.max_distance);
          this._decoyGiveNote(th, th.note);
          th.age = -DECOY_RING_PAUSE;
          this._decoyFakesFollow();
          continue;
        }
        this.evItems.splice(this.evItems.indexOf(th), 1);
        if (this.evItems.length) this._decoyFakesFollow();
        else this._decoyOpenExit();
      }
    }
    const dark = this.evDarkExit;
    if (dark) {
      const [left, right] = this._battleLevels([dark.x, dark.y], 0.9 * (dc.dark_exit_volume === undefined ? 1.0 : dc.dark_exit_volume));
      if (dark.channel) dark.channel.setVolume(left, right, this._behind([dark.x, dark.y]));
      if (this.evSteppedOnto([dark.x, dark.y], EVENT_REACH)) {
        this._eventFinish('dark');
        return true;
      }
    }
    const ex = this.evExit;
    if (ex) {
      const [left, right] = this._battleLevels([ex.x, ex.y], 0.9);
      for (const [ch, g] of [[ex.channel, 1.0], [ex.extra, 0.8]]) if (ch) ch.setVolume(left * g, right * g, this._behind([ex.x, ex.y]));
      if (this.evSteppedOnto([ex.x, ex.y], EVENT_REACH)) {
        this.evPoints += dc.points_per_level;
        this.evLevelsDone += 1;
        this.evLevel += 1;
        this.audio.play('stairs_climb');
        this._decoyLevel();
      }
    }
    return false;
  },

  // Every real one found: the way out opens. On some levels a second, false way
  // opens too, with its own sound, and walking through it ends the run.
  _decoyOpenExit() {
    const dc = this.ev.decoys;
    const th = new Thing(...this._eventSpot(DECOY_EXIT_GAP, 0));
    let sound = 'exit_morse';
    if (dc.exit_sound !== 'exit_morse') sound = this.loadEventRecording(dc.exit_sound, 'beacon') || 'exit_morse';
    th.channel = this.audio.play(sound, { loops: -1, volume: 0.0 });
    if (dc.exit_shimmer) th.extra = this.audio.play('event_beacon_shimmer', { loops: -1, volume: 0.0 });
    this.evExit = th;
    this.evDarkExit = null;
    if (dc.dark_exit_chance > 0 && this.evLevel >= dc.dark_exit_first_level && random() < dc.dark_exit_chance) {
      const darkSound = this.loadEventRecording(dc.dark_exit_sound, 'beacon');
      if (darkSound) {
        // Right beside the way out, on the player's side of it: two steps in front of
        // it, toward where the player stands as the exits open.
        const [px, py] = this.playerPos;
        const dx = px - th.x; const dy = py - th.y;
        const d = Math.hypot(dx, dy) || 1.0;
        const lim = Math.max(3.0, this.arenaLimit - 1.0);
        let gx = Math.max(-lim, Math.min(lim, th.x + dx / d * DECOY_DARK_GUARD));
        let gy = Math.max(-lim, Math.min(lim, th.y + dy / d * DECOY_DARK_GUARD));
        [gx, gy] = this._eventFreeSquareNear(gx, gy, lim);
        const dark = new Thing(gx, gy);
        dark.channel = this.audio.play(darkSound, { loops: -1, volume: 0.0 });
        this.evDarkExit = dark;
      }
    }
    // Nothing is said: the player hears the way out open.
  },

  // The nearest spot to (x, y) whose square holds nothing yet and is not the player's own.
  _eventFreeSquareNear(x, y, lim) {
    const things = [...this.evItems, ...this.evCredits, ...(this.evFakes || []), ...[this.evExit].filter((t) => t)];
    const used = new Set(things.map((t) => sq(t.x, t.y)));
    const [px, py] = this.playerPos;
    let best = null;
    for (let i = -4; i <= 4; i++) {
      for (let j = -4; j <= 4; j++) {
        const cx = Math.max(-lim, Math.min(lim, x + i * EVENT_REACH));
        const cy = Math.max(-lim, Math.min(lim, y + j * EVENT_REACH));
        if (used.has(sq(cx, cy))) continue;
        if (Math.abs(cx - px) <= EVENT_SQUARE_HALF * 1.5 && Math.abs(cy - py) <= EVENT_SQUARE_HALF * 1.5) continue;
        const d = Math.hypot(cx - x, cy - y);
        if (best === null || d < best[2]) best = [cx, cy, d];
      }
    }
    return best ? [best[0], best[1]] : [x, y];
  },

  // T in an event: the clock, or that there is none.
  eventClockReport() {
    if (this.evClock === undefined || this.evClock) this.tts.speak(`${Math.trunc(Math.max(0, this.timeLeft))} seconds remaining.`);
    else this.tts.speak('There is no clock in this event.');
  },

  _eventSpawnCredit() {
    const tc = this.ev.time_credits;
    const value = choices(tc.values, tc.weights);
    const ranks = [...new Set(tc.values)].sort((a, b) => a - b);
    const i = ranks.indexOf(value);
    const tier = Math.min(i, CREDIT_TIERS - 1) + 1;
    const [x, y] = this._eventSpot(tc.min_distance, 0);
    const th = new Thing(x, y);
    th.value = value;
    th.beacon = `credit_beacon_event_${tier}`; th.pickup = `credit_coins_${tier}`;
    th.channel = this.audio.play(th.beacon, { loops: -1, volume: 0.0 });
    this.evCredits.push(th);
  },

  updateEventMode(dt) {
    if (this.isPaused || !this.ev) return;
    const ev = this.ev;
    this.evElapsed += dt;
    if (dt > 0) this.evUpdatedAt = performance.now() / 1000;
    this._eventUpdateZones(dt);
    // The clock, if the event has one.
    if (this.evClock) this.timeLeft -= dt;
    const step = this.evClock ? ev.clock.announce_every_seconds : 0;
    if (step && this.timeLeft <= this.evNextAnnounce && this.evNextAnnounce > 0) {
      const sec = pyRound(this.evNextAnnounce);
      if (sec % 60 === 0) {
        const m = Math.floor(sec / 60);
        this.tts.speak(`${m} minute${m !== 1 ? 's' : ''} left.`);
      } else {
        this.tts.speak(`${sec} seconds left.`);
      }
      this.evNextAnnounce -= step;
    }
    const cd = this.evClock ? ev.clock.countdown_seconds : 0;
    if (this.timeLeft > 0 && this.timeLeft <= cd) {
      const sec = Math.trunc(this.timeLeft);
      if (sec !== this.lastBeepSecond) {
        this.lastBeepSecond = sec;
        this.audio.play('countdown');
      }
    }
    if (this.evClock && this.timeLeft <= 0) {
      this._eventFinish(ev.mission === 'survive' ? 'survived' : 'time');
      return;
    }
    if (ev.mission === 'survive') this.evAlivePoints += ev.survive.points_per_second * dt;
    if (this.evHazards.length && this._eventUpdateHazards(dt)) return;
    if (this.evEndsByCreaturesOnly && this.evHazards.length && this.evHazards.every((h) => h.downFor >= 0)) {
      this._eventFinish('all_down');
      return;
    }
    if (this.evClock && this.timeLeft <= 0) {
      this._eventFinish(ev.mission === 'survive' ? 'survived' : 'time');
      return;
    }
    if (ev.mission === 'decoys') {
      if (this._decoyUpdate(dt)) return;
      this._eventUpdateCredits(dt, step);
      return;
    }
    if (this.NEW_MISSIONS.includes(ev.mission)) {
      if (this._mUpdate(dt)) return;
      if (this._mUsesOwnItems()) {
        this._eventUpdateCredits(dt, step);
        return;
      }
    }
    // The items.
    const it = ev.item;
    for (const th of [...this.evItems]) {
      const [left, right] = this._battleLevels([th.x, th.y], it.volume);
      if (th.channel) th.channel.setVolume(left, right, this._behind([th.x, th.y]));
      if (this.evSteppedOnto([th.x, th.y], EVENT_REACH)) {
        if (th.channel) th.channel.stop();
        this.evItems.splice(this.evItems.indexOf(th), 1);
        this.audio.play(th.value ? this.evBonusPickup : this.evPickup, { at: [th.x, th.y] });
        this.evCollected += 1;
        this.evPoints += th.value ? it.bonus_points : it.points;
        this.evBonuses = (this.evBonuses || 0) + (th.value ? 1 : 0);
        if (ev.mission === 'steps') this._mStepsCollected();
        if (it.total && this.evCollected >= it.total) {
          this.evPoints += it.all_found_bonus;
          this.evTimeBonus = Math.trunc(Math.max(0, this.timeLeft)) * it.time_bonus;
          this.evPoints += this.evTimeBonus;
          this._eventFinish('all');
          return;
        }
        this._eventSpawnItem();
      }
    }
    if (ev.mission === 'steps' && this.mStepsLeft <= 0) {
      // Out of steps: judged here, after the items, so a last step that lands on one
      // still collects it (and the steps it brings).
      this._eventFinish('no_steps');
      return;
    }
    this._eventUpdateCredits(dt, step);
  },

  // The time credits: laid out, collected, and gone again if they wait too long.
  _eventUpdateCredits(dt, step) {
    const tc = this.ev.time_credits;
    if (!tc.enabled) return;
    this.evCreditTimer -= dt;
    if (this.evCreditTimer <= 0) {
      this.evCreditTimer = tc.every_seconds;
      if (this.evCredits.length < tc.max_at_once) this._eventSpawnCredit();
    }
    for (const th of [...this.evCredits]) {
      th.age += dt;
      if (tc.lasts_seconds && th.age >= tc.lasts_seconds) {
        if (th.channel) th.channel.stop();
        this.evCredits.splice(this.evCredits.indexOf(th), 1);
        continue;
      }
      const [left, right] = this._battleLevels([th.x, th.y], EVENT_CREDIT_GAIN);
      if (th.channel) th.channel.setVolume(left, right, this._behind([th.x, th.y]));
      if (this.evSteppedOnto([th.x, th.y], EVENT_REACH)) {
        if (th.channel) th.channel.stop();
        this.evCredits.splice(this.evCredits.indexOf(th), 1);
        this.timeLeft += th.value;
        this.audio.play(th.pickup);
        this.lastBeepSecond = -1;
        if (step) this.evNextAnnounce = Math.floor((this.timeLeft - 1) / step) * step;
      }
    }
  },

  eventStatusReport() {
    const it = this.ev.item;
    if (this.NEW_MISSIONS.includes(this.ev.mission)) {
      let msg = this._mStatus() || '';
      // How many are left, in the missions that end at a set total and whose own
      // report does not already say so (unless the event keeps it secret).
      const m = this.ev.mission;
      const done = { bomb: this.mDefused || 0, relay: this.mCheckpoints || 0 }[m] ?? this.evCollected;
      if (['sneak', 'rescue', 'herd', 'fishing', 'steps', 'sort', 'whack', 'bomb', 'relay', 'hunt', 'escape', 'defend'].includes(m)
          && it.total && !it.hide_left && !msg.includes('left to find')
          && (it.at_once || !['hunt', 'escape', 'defend'].includes(m))) {
        const what = m === 'relay' ? 'left to reach' : 'left to find';
        msg = msg.trimEnd() + ` ${Math.max(0, it.total - done)} ${what}.`;
      }
      if (this.evClock) msg += ` ${Math.trunc(Math.max(0, this.timeLeft))} seconds left.`;
      this.tts.speak(msg.trim());
      return;
    }
    if (this.ev.mission === 'decoys') {
      let msg;
      if (this._decoyRings() > 1) {
        msg = `Level ${this.evLevel}. ${this.evLevelFound} of ${this.evLevelNeed} rings of the real ${it.name}.`;
      } else {
        const word = this.evLevelNeed === 1 ? it.name : it.plural;
        msg = `Level ${this.evLevel}. ${this.evLevelFound} of ${this.evLevelNeed} real ${word} found.`;
      }
      msg += ` ${pts(this.evPoints)}.`;
      if (this.evExit) msg += ' The way out is open.';
      if (this.ev.weapon.enabled) msg += ` ${this.evShots} shot${this.evShots === 1 ? '' : 's'}.`;
      const hz = this.ev.hazards;
      if (hz.count && hz.on_touch === 'end_run' && hz.lives > 1) {
        const lv = this.evLives === undefined ? 1 : this.evLives;
        msg += ` ${lv} li${lv === 1 ? 'fe' : 'ves'} left.`;
      }
      if (this.evClock) msg += ` ${Math.trunc(Math.max(0, this.timeLeft))} seconds left.`;
      this.tts.speak(msg);
      return;
    }
    const n = this.evCollected;
    const word = n === 1 ? it.name : it.plural;
    const p = this.evPoints + Math.trunc(this.evAlivePoints);
    let msg = it.at_once ? `${n} ${word}, ${pts(p)}.` : `${pts(p)}.`;
    if (it.total && it.at_once && !it.hide_left) msg += ` ${it.total - n} left to find.`;
    if (this.ev.weapon.enabled) msg += ` ${this.evShots} shot${this.evShots === 1 ? '' : 's'}.`;
    const up = this.evHazards.filter((h) => h.downFor < 0);
    if (this.ev.hazards.count) {
      const name = this.ev.hazards.name;
      msg += ` ${up.length} ${name}${up.length === 1 ? '' : 's'} about.`;
      if (this.ev.hazards.on_touch === 'end_run' && this.ev.hazards.lives > 1) {
        const lv = this.evLives === undefined ? 1 : this.evLives;
        msg += ` ${lv} li${lv === 1 ? 'fe' : 'ves'} left.`;
      }
    }
    if (this.evClock) msg += ` ${Math.trunc(Math.max(0, this.timeLeft))} seconds left.`;
    this.tts.speak(msg);
  },

  _eventStopAll() {
    const all = [...(this.evItems || []), ...(this.evCredits || []), ...(this.evHazards || []), ...(this.evFakes || []),
      ...(this.evZones || []), ...(this.evDarkExit ? [this.evDarkExit] : []), ...(this.evExit ? [this.evExit] : [])];
    for (const th of all) {
      try {
        if (th.channel) th.channel.stop();
        if (th.extra) th.extra.stop();
      } catch (e) { /* gone */ }
    }
    this.evItems = []; this.evCredits = []; this.evHazards = [];
    this.evFakes = []; this.evExit = null; this.evDarkExit = null;
    this.evZones = [];
    this._mStopAll();
    // Web only: let go of the long recordings unpacked for this run.
    // The end sound is about to play (the game over's message plays it), so it is
    // kept until it has started; then it goes too.
    const endName = this._evFinishing ? this.evEndSound : null;
    for (const name of this.evHeld || []) {
      if (name === endName) continue;
      this.audio._releaseWets(name);
      const pair = this.audio.entries.get(name);
      if (pair && pair.dry && pair.dry.frames > 44100 * 6) {
        this.audio.buffers.delete('dry:' + name);
        if (pair.dull && !pair.dull.made) this.audio.buffers.delete('dull:' + name);
      }
    }
    this.evHeld = [];
    this.evRecordings = null;
  },

  // The run is over: the game's own game over (which stops every sound, and calls
  // the mode's finish for the message, _eventFinishMessage).
  _eventFinish(reason) {
    this._evReason = reason;
    this._evFinishing = true;
    this.triggerGameOver();
    this._evFinishing = false;
  },

  _eventFinishMessage() {
    const ev = this.ev;
    const reason = this._evReason;
    const endName = this.evEndSound || 'event_toll_end';
    this.audio.play(endName);
    // Web only: a long end sound kept for this moment (see _eventStopAll) is let go
    // of now it is playing.
    const pairEnd = this.audio.entries.get(endName);
    if (pairEnd && pairEnd.dry && pairEnd.dry.frames > 44100 * 6 && (this.evHeld || []).length === 0) {
      setTimeout(() => {
        if (this.state === S_EVENT || (this.evHeld || []).includes(endName)) return;
        this.audio.buffers.delete('dry:' + endName);
        this.audio._releaseWets(endName);
        if (pairEnd.dull && !pairEnd.dull.made) this.audio.buffers.delete('dull:' + endName);
      }, 0);
    }
    const it = ev.item;
    const n = this.evCollected;
    const word = n === 1 ? it.name : it.plural;
    const alive = Math.trunc(this.evAlivePoints);
    this.evPoints += alive;
    this.evPoints = pyRound(this.evPoints);
    const [isBest, prev] = this.eventScores.record(ev, this.evPoints, n);
    this._refreshMenu();        // the Event High Scores entry counts the events played
    let msg = ev.messages.end.trim() ? ev.messages.end.trim() + ' ' : '';
    if (reason === 'all' && ['deliver', 'catch', 'relay', 'bomb'].includes(ev.mission)) {
      const verb = { deliver: 'delivered all', catch: 'caught all', relay: 'reached all', bomb: 'made safe all' }[ev.mission];
      const what = ev.mission === 'relay' ? 'checkpoints' : ev.mission === 'bomb' ? (it.total === 1 ? 'bomb' : 'bombs') : it.plural;
      msg += `You ${verb} ${it.total} ${what}!`;
      if (it.all_found_bonus) msg += ` Bonus ${pts(it.all_found_bonus)}.`;
      if (this.evTimeBonus) msg += ` Time bonus ${pts(this.evTimeBonus)}.`;
      msg += ' ';
    } else if (reason === 'all') {
      const verb = { whack: 'caught', fishing: 'caught', herd: 'penned', rescue: 'rescued', sort: 'sorted' }[ev.mission] || 'found';
      msg += it.total === 1 ? `You ${verb} the only ${it.name}!` : `You ${verb} all ${it.total} ${it.plural}!`;
      if (it.all_found_bonus) msg += ` Bonus ${pts(it.all_found_bonus)}.`;
      if (this.evTimeBonus) msg += ` Time bonus ${pts(this.evTimeBonus)}.`;
      msg += ' ';
    } else if (reason === 'fake') {
      msg += `That was a false ${it.name}. `;
    } else if (reason === 'dark') {
      msg += 'You walked through the exit of the dead. ';
    } else if (reason === 'survived') {
      msg += 'Time up. You survived! ';
    } else if (reason === 'caught') {
      msg += `The ${ev.hazards.name} got you. `;
    } else if (this._mReason(reason)) {
      msg += this._mReason(reason);
    } else {
      msg += 'Time up. ';
    }
    const missionResult = this.NEW_MISSIONS.includes(ev.mission) ? this._mResult() : null;
    if (missionResult) {
      msg += missionResult;
      const downs = this.evDowns || 0;
      if (downs && !['hunt', 'defend'].includes(ev.mission)) {
        // The total above includes the creatures shot down: say so.
        const hn = ev.hazards.name;
        const worth = pts(downs * ev.hazards.points_for_down);
        msg += this.evPoints >= downs * ev.hazards.points_for_down
          ? `Bringing down ${downs} ${hn}${downs === 1 ? '' : 's'} was worth ${worth} of that. `
          : `Bringing down ${downs} ${hn}${downs === 1 ? '' : 's'} was worth ${worth}, before what you lost. `;
      }
    } else if (ev.mission === 'decoys') {
      const lv = this.evLevelsDone;
      const dc = ev.decoys;
      const one = dc.real_first_level === 1 && (dc.real_per_level === 0 || dc.real_most === 1);
      const found = (dc.rings_per_level || dc.rings_first_level > 1)
        ? `rang the real ${one ? it.name : it.plural} ${n} time${n === 1 ? '' : 's'}`
        : `found ${n} real ${word}`;
      msg += `You reached level ${this.evLevel}, ${found} and walked out of ${lv} level${lv === 1 ? '' : 's'}. ${pts(this.evPoints)} in all. `;
    } else if (ev.mission === 'survive') {
      const downs = this.evDowns || 0;
      if (downs) msg += `You brought down ${downs} ${ev.hazards.name}${downs === 1 ? '' : 's'}, worth ${pts(downs * ev.hazards.points_for_down)}. `;
      msg += `${pts(alive)} for staying alive`;
      msg += it.at_once ? `, and ${n} ${word} collected. ` : '. ';
      msg += `${pts(this.evPoints)} in all. `;
    } else {
      const downs = this.evDowns || 0;
      if (downs) {
        msg += `You collected ${n} ${word} and brought down ${downs} ${ev.hazards.name}${downs === 1 ? '' : 's'}, `
          + `worth ${pts(downs * ev.hazards.points_for_down)}. ${pts(this.evPoints)} in all. `;
      } else {
        msg += `You collected ${n} ${word} for ${pts(this.evPoints)}. `;
      }
    }
    if (it.hide_left && it.total && reason !== 'all' && !TOTAL_UNUSED.includes(ev.mission)
        && (it.at_once || !['hunt', 'escape', 'defend', 'survive', 'collect'].includes(ev.mission))) {
      // The total was kept secret while playing; the end of the run tells it.
      const tot = it.total;
      const what = { relay: ['checkpoint', 'checkpoints'], bomb: ['bomb', 'bombs'] }[ev.mission] || [it.name, it.plural];
      msg += `There ${tot === 1 ? 'was' : 'were'} ${tot} ${tot === 1 ? what[0] : what[1]} in all. `;
    }
    if (!this.evClock) msg += `The run lasted ${minsSecs(this.evElapsed)}. `;
    const bonuses = this.evBonuses || 0;
    if (bonuses) msg += `${bonuses} of them ${bonuses === 1 ? 'was a bonus' : 'were bonuses'}. `;
    msg += this._eventMedalText(ev, this.evPoints);
    const unsaved = this.eventScores.readFailed;
    const failed = this.eventScores.saveFailed;
    const where = unsaved ? 'Event High Scores could not be read this session, so it is not saved. '
      : failed ? 'Event High Scores could not be written just now. This run is kept until the game closes, and saved with the next run that can be written. '
        : 'It is saved in Event High Scores. ';
    if (unsaved) msg += where;
    else if (isBest && prev) msg += `A new best run in ${ev.name}, beating ${pts(prev)}! ${where}`;
    else if (isBest || !prev) msg += failed ? `Your best run in ${ev.name}. ${where}` : `Your best run in ${ev.name} is saved in Event High Scores. `;
    else msg += `Your best run in ${ev.name} is still ${pts(prev)}. ` + (failed ? where : '');
    msg += 'Double tap to return to the menu.';
    this.ev = null;
    return msg;
  },
};

export { LABYRINTH_DRONES, TOWER_DRONES, BATTLE_DRONES, EVENT_REACH, shuffle };
