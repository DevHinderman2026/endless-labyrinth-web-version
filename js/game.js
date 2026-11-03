// Endless Labyrinth, Standard and Battle modes: the desktop game's rules, timings
// and sounds (endless_labyrinth.py, version 1.0.1), played with touch gestures.
// Names and numbers follow the desktop code so the two can be compared line by line.

import { HELP as BASE_HELP } from './help-data.js';
import { MODES } from './modes/index.js';
import { RATES } from './speech.js';

// ------------------------------------------------------------------ constants
const FPS = 30;
const BATTLE_AIM_PAN = 0.72;
const BATTLE_SPAWN_PAN = 0.55;
const BATTLE_AMMO_CLEARANCE = 14.0;
const BATTLE_BREAK_START = 24.0;
const BATTLE_BREAK_DECAY = 0.5;
const BATTLE_BREAK_MIN = 10.0;
const BATTLE_MAX_PICKUPS = 1;
const BATTLE_PICKUP_BANDS = [[8.0, 16.0], [16.0, 26.0], [26.0, 38.0]];
const BATTLE_BEAT_SWAP = [34.0, 62.0];
const BATTLE_AMB_SWAP = [23.0, 41.0];
const BATTLE_TIME_LIMIT = 60.0;
const BATTLE_TIME_ANNOUNCE = 60.0;
const BATTLE_CREDIT_VALUES = [10, 15, 20];
const BATTLE_CREDIT_WEIGHTS = [55, 30, 15];
const BATTLE_EMERGENCY_DIST = [12.0, 26.0];
const BATTLE_CREDIT_MIN_DIST = 15.0;
const BATTLE_CREDIT_GAIN = 0.7;
const BATTLE_BREAK_COUNTDOWN = 5;
const STANDARD_CREDIT_VALUES = [15, 20, 30];
const STANDARD_CREDIT_WEIGHTS = [70, 22, 8];
const STANDARD_CREDIT_CHANCE = 0.35;
const STANDARD_START_TIME = 45.0;
const CREDIT_STEPS = [4, 8];
const AMBIENCE_CROSSFADE = 0.8;
const BATTLE_SWAP_FADE = 1.5;
const CHAOS_AMBIENCE_FADE = 0.4;     // how a run's first drone fades in
const REVERB_GAIN_OPEN = 0.85;
const REVERB_GAIN_WALL = 1.2;
const REVERB_LEAN_MAX = 0.2;
const REVERB_WALL_RANGE = 8.0;
const REVERB_REFRESH = 0.05;
const BEHIND_CURVE = 1.5;
// Chaos mode's branches in Standard and Battle (the rest of Chaos is js/modes/chaos.js).
// Chaos runs on a flat five minutes, with the clock spoken every two minutes.
const CHAOS_TIME_ANNOUNCE = 120.0;
const CHAOS_CREDIT_VALUES = [40, 50, 60];
const CHAOS_CREDIT_LABYRINTH = 0.5;       // chance a chaos labyrinth has one
const CHAOS_CREDIT_BATTLE_RATE = 1 / 80;  // per second of a chaos battle, one at a time

const LABYRINTH_DRONES = ['lab_01_cavewind', 'lab_02_scary_cave', 'lab_03_scifi_cave', 'lab_04_dungeon_air',
  'lab_05_catacombs', 'lab_06_creepy_basement', 'lab_07_horror_basement', 'lab_08_waterflow_2',
  'lab_09_waterflow_1', 'lab_10_dreary_tunnels', 'lab_11_tunnel_fan'];
const BATTLE_DRONES = ['bat_01_deep_drone', 'bat_02_creepy_dark', 'bat_03_dark_ambient', 'bat_04_dark_drone',
  'bat_05_ominous', 'bat_06_grinding', 'bat_07_texture', 'bat_08_eerie', 'bat_09_suspenseful', 'bat_10_static',
  'bat_11_horror_suspense'];
const BATTLE_DRUMS = ['drm_01_tribe_loop', 'drm_02_horde_war', 'drm_03_loop_75', 'drm_04_loop_80',
  'drm_05_ancient_war', 'drm_06_tribal_beat', 'drm_07_tribal_drums', 'drm_08_hybrid_epic', 'drm_09_djembe'];
const BANKS = { lab: LABYRINTH_DRONES, battle_amb: BATTLE_DRONES, battle_beat: BATTLE_DRUMS };
const STEPS = ['step_stone_1', 'step_stone_2', 'step_stone_3', 'step_stone_4'];

const S = {
  MENU: 'menu', HELP: 'help', STANDARD: 'standard', BATTLE: 'battle', GAME_OVER: 'game_over',
  HIGH_SCORES: 'high_scores', CONFIRM_EXIT: 'confirm_exit', CONFIRM_RESET: 'confirm_reset', PRACTICE: 'practice',
};
const PLAYING = [S.STANDARD, S.BATTLE];

// The modes in js/modes/: their methods join the game's own, their runs count as
// play, and their help sections go after Battle's (and their demos after Battle's
// demos), all in main menu order.
const isRunState = (st) => PLAYING.includes(st) || MODES.some((m) => (m.playStates || []).includes(st));
const modeOf = (st) => MODES.find((m) => (m.playStates || []).includes(st)) || null;
// A mode whose run passes through other modes' states (Chaos) answers for the whole
// run while ownsRun is true: its finish and status line are used whatever the state.
const runOwner = (game) => MODES.find((m) => m.ownsRun && m.ownsRun(game)) || null;
const HELP = (() => {
  const isDemo = ([name]) => name.startsWith('Demos');
  const base = BASE_HELP.filter((s) => !isDemo(s));
  const baseDemos = BASE_HELP.filter(isDemo);
  const extra = MODES.flatMap((m) => (m.help && m.help.sections) || []);
  const extraDemos = MODES.flatMap((m) => (m.help && m.help.demos) || []);
  return [...base, ...extra, ...baseDemos, ...extraDemos];
})();
export { HELP, isRunState, modeOf };

// ------------------------------------------------------------------ helpers
const rand = Math.random;
const uniform = (a, b) => a + (b - a) * rand();
const randint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const choice = (arr) => arr[Math.floor(rand() * arr.length)];
function weighted(values, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < values.length; i++) { r -= weights[i]; if (r < 0) return values[i]; }
  return values[values.length - 1];
}
const plural = (n, word, many = word + 's') => (n === 1 ? word : many);
const key = (x, y) => x + ',' + y;

function pointToSegment(x, y, a, b) {
  const [ax, ay] = a; const [bx, by] = b;
  const dx = bx - ax; const dy = by - ay;
  const span = dx * dx + dy * dy;
  const t = span <= 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / span));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

function perFrameChance(chance, dt) {
  if (chance >= 1.0) return 1.0;
  if (chance <= 0.0 || dt <= 0.0) return 0.0;
  return 1.0 - Math.pow(1.0 - chance, dt * FPS);
}

function calculate3dPanning(player, target, maxDist = 20.0) {
  const dx = target[0] - player[0];
  const dy = target[1] - player[1];
  const dist = Math.hypot(dx, dy);
  if (dist > maxDist) return [0.0, 0.0, dist];
  const base = Math.max(0.02, 1.0 - dist / maxDist);
  const pan = dist > 0 ? dx / dist : 0;
  return [base * (1.0 - Math.max(0, pan)), base * (1.0 - Math.max(0, -pan)), dist];
}

// ------------------------------------------------------------------ things in the world
class Obstacle {
  constructor(player, level, soundIdx, avoid = [], speedCap = 4.6, speedRate = 0.065, box = 39.0) {
    const [px, py] = player;
    this.soundIdx = soundIdx;
    this.soundName = 'obstacle_' + soundIdx;
    this.x = null;
    for (const [clearance, minRange] of [[BATTLE_AMMO_CLEARANCE, 12.0], [8.0, 12.0]]) {
      for (let i = 0; i < 500; i++) {
        const off = uniform(-BATTLE_SPAWN_PAN, BATTLE_SPAWN_PAN);
        const angle = Math.asin(off) + (rand() < 0.5 ? 0.0 : Math.PI);
        const dist = uniform(20.0, 32.0);
        const tx = px + Math.sin(angle) * dist;
        const ty = py - Math.cos(angle) * dist;
        if (!(tx >= -box && tx <= box && ty >= -box && ty <= box)) continue;
        if (Math.hypot(tx - px, ty - py) < minRange) continue;
        if (avoid.some(([ax, ay]) => Math.hypot(tx - ax, ty - ay) < clearance)) continue;
        this.x = tx; this.y = ty;
        break;
      }
      if (this.x !== null) break;
    }
    if (this.x === null) {
      const corners = [[-box, -box], [-box, box], [box, -box], [box, box]];
      let best = corners[0]; let bestD = -1;
      for (const c of corners) {
        const d = avoid.length ? Math.min(...avoid.map(([ax, ay]) => Math.hypot(c[0] - ax, c[1] - ay))) : 0.0;
        if (d > bestD) { best = c; bestD = d; }
      }
      [this.x, this.y] = best;
    }
    this.speed = Math.min(speedCap, 1.75 + Math.max(0, level) * speedRate);
    this.channel = null;
  }

  update(player, dt) {
    const dx = player[0] - this.x;
    const dy = player[1] - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      this.x += (dx / dist) * this.speed * dt;
      this.y += (dy / dist) * this.speed * dt;
    }
    return dist;
  }
}

class AmmoCartridge {
  constructor(player, avoid = [], maxDist = null, shots = null, minDist = null) {
    const [px, py] = player;
    const near = minDist || 14.0;
    const far = maxDist || 200.0;
    this.x = null;
    for (let i = 0; i < 300; i++) {
      const tx = uniform(-38.0, 38.0);
      const ty = uniform(-38.0, 38.0);
      const d = Math.hypot(tx - px, ty - py);
      if (d < near || d > far) continue;
      if (avoid.some(([ax, ay]) => Math.hypot(tx - ax, ty - ay) < BATTLE_AMMO_CLEARANCE)) continue;
      this.x = tx; this.y = ty;
      break;
    }
    if (this.x === null) {
      let placed = false;
      for (let i = 0; i < 300; i++) {
        const tx = uniform(-38.0, 38.0);
        const ty = uniform(-38.0, 38.0);
        const d = Math.hypot(tx - px, ty - py);
        if (Math.min(near, 10.0) <= d && d <= far) { this.x = tx; this.y = ty; placed = true; break; }
      }
      if (!placed) {
        const step = Math.max(10.0, near);
        this.x = Math.max(-38.0, Math.min(38.0, px + (px >= 0 ? -step : step)));
        this.y = Math.max(-38.0, Math.min(38.0, py + (py >= 0 ? -step : step)));
      }
    }
    this.shots = shots !== null ? shots : randint(3, 6);
    this.channel = null;
    this.emergency = false;
  }
}

class TimeCredit {
  constructor(x, y, battle = false, chaos = false) {
    if (battle) {
      this.value = weighted(BATTLE_CREDIT_VALUES, BATTLE_CREDIT_WEIGHTS);
      this.soundName = { 10: 'credit_10', 15: 'credit_20', 20: 'credit_30' }[this.value];
      this.beaconName = 'credit_beacon_battle_' + this.value;
    } else if (chaos) {
      // Chaos mode: 40, 50 or 60 seconds, a beacon per value, one pickup for all.
      this.value = choice(CHAOS_CREDIT_VALUES);
      this.soundName = 'credit_chaos';
      this.beaconName = 'credit_beacon_' + this.value;
    } else {
      this.value = weighted(STANDARD_CREDIT_VALUES, STANDARD_CREDIT_WEIGHTS);
      this.soundName = { 15: 'credit_10', 20: 'credit_20', 30: 'credit_30' }[this.value];
      this.beaconName = 'credit_beacon';
    }
    this.x = x; this.y = y;
    this.channel = null;
  }
}

// ------------------------------------------------------------------ the game
export class Game {
  constructor({ audio, speech, store, gestures, view, leave }) {
    this.audio = audio;
    this.tts = speech;
    this.scores = store;
    this.gestures = gestures;
    this.view = view;
    this.leave = leave;
    this.audio.sourceEffect = (p) => this._sourceEffect(p);
    this.audio.behindOf = (p) => this._behind(p);
    this.state = S.MENU;
    this.prevState = S.MENU;
    this.menuIndex = 0;
    this.helpCat = null;
    this.helpCatIndex = 0;
    this.helpIndex = 0;
    this.helpRoom = null;
    this.ambLast = {};
    this.upcoming = {};
    this.runId = 0;
    this.pausedVoices = [];
    this.wakeLock = null;
    this.reverbTick = 0;
    this.helpSavedRoomGain = null;
    for (const m of MODES) if (m.init) m.init(this);
    this._refreshMenu();
    this.resetGameState();
    // The first drones, decoded ahead so a run starts with its air at once.
    for (const kind of Object.keys(BANKS)) this._prepareUpcoming(kind, null);
  }

  // -------------------------------------------------------------- menu
  _menuItems() { return MODES.flatMap((m) => m.menu || []); }

  _menuKeys() {
    return ['standard', 'battle', ...this._menuItems().map((i) => i.key), 'scores', 'practice', 'rate', 'leave'];
  }

  _menuLabel(k) {
    const item = this._menuItems().find((i) => i.key === k);
    if (item) return typeof item.label === 'function' ? item.label(this) : item.label;
    return {
      standard: 'Standard Mode', battle: 'Battle Mode', scores: 'High Scores', practice: 'Gesture Practice',
      rate: `Speech Rate: ${this.tts.rateLevel} of ${RATES.length}`, leave: 'Leave Game',
    }[k];
  }

  _refreshMenu() {
    this.menuKeys = this._menuKeys();
    this.menuOptions = this.menuKeys.map((k) => this._menuLabel(k));
  }

  welcome() {
    let line = 'Welcome to Endless Labyrinth. Please wear headphones as this is a 3D audio game. '
      + 'Swipe up and down to navigate. Double tap to select. Tap four times for Help. ';
    if (!this.scores.settings.practiced) line += 'New here? Try Gesture Practice, on this menu. ';
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (ios && !standalone && !this.scores.settings.homeTipSaid) {
      line += 'Tip: to keep your high scores safe, add this game to your Home Screen from the Share menu, and play it from there. ';
      this.scores.settings.homeTipSaid = true;
      this.scores.save();
    }
    this.tts.speak(line + this.menuOptions[this.menuIndex]);
  }

  // -------------------------------------------------------------- state
  resetGameState() {
    this.runId += 1;
    this.battleSteps = [];
    for (const v of this.pausedVoices) v.stop();
    this.pausedVoices = [];
    for (const ch of [this.ambienceChannel, this.beatChannel]) if (ch) ch.stop();
    if (this.timeCredit && this.timeCredit.channel) this.timeCredit.channel.stop();
    for (const group of [this.obstacles, this.ammoPickups]) for (const t of group || []) if (t.channel) t.channel.stop();
    this.level = 1;
    this.playerPos = [0.0, 0.0];
    this.playerFacing = [0, -1];
    this.timeLeft = 30.0;
    this.isPaused = false;
    this.arenaLimit = 40.0;
    this.ambienceChannel = null;
    this.beatChannel = null;
    this.grid = new Set();
    this.gridSize = 0;
    this.exitPos = [0, 0];
    this.timeCredit = null;
    this.lastBeepTime = 0;
    this.nextAnnounceTime = 0.0;
    this.thirtySecAnnounced = false;
    this.lastBeepSecond = -1;
    this.ammo = 3;
    this.obstacles = [];
    this.ammoPickups = [];
    this.kills = 0;
    this.spawnedEnemies = 0;
    this.waveBreakTimer = 0.0;
    this.inWaveBreak = false;
    this.battleEmergencyUsed = false;
    this.battleWaveShots = 0;
    this.battleWave = 1;
    this.waveKills = 0;
    this.battleBeatTimer = uniform(...BATTLE_BEAT_SWAP);
    this.battleAmbTimer = uniform(...BATTLE_AMB_SWAP);
    this.battleBeatIdx = -1;
    this.battleAmbIdx = -1;
    this.breakLastBeep = null;
    for (const m of MODES) if (m.reset) m.reset(this);
  }

  get playing() { return isRunState(this.state); }
  get mode() { return modeOf(this.state); }

  // -------------------------------------------------------------- drones
  // A drone is picked at random, never the one just played; the one after it is
  // picked at the same moment and decoded ahead, so a new level's air comes in
  // at once. (The same choice the desktop makes when the level begins.)
  _prepareUpcoming(kind, current) {
    const n = BANKS[kind].length;
    const idx = choice([...Array(n).keys()].filter((i) => i !== current));
    this.upcoming[kind] = idx;
    this.audio.prepare(BANKS[kind][idx], 'next:' + kind);
  }

  _pickAmb(kind) {
    // A drone the chaos elevator already chose and faded in is used instead of a new pick.
    const pending = this.ambPending || {};
    if (kind in pending) { const i = pending[kind]; delete pending[kind]; return i; }
    const last = this.ambLast[kind];
    let idx = this.upcoming[kind];
    if (idx === undefined || idx === last) idx = choice([...Array(BANKS[kind].length).keys()].filter((i) => i !== last));
    this.ambLast[kind] = idx;
    this._prepareUpcoming(kind, idx);
    return idx;
  }

  _battleSwapBeat(fade = BATTLE_SWAP_FADE) {
    let idx = this.upcoming.battle_beat;
    if (idx === undefined || idx === this.battleBeatIdx) {
      idx = choice([...Array(BATTLE_DRUMS.length).keys()].filter((i) => i !== this.battleBeatIdx));
    }
    this.battleBeatIdx = idx;
    this._prepareUpcoming('battle_beat', idx);
    if (this.beatChannel) this.beatChannel.fadeout(fade * 1000);
    this.beatChannel = this.audio.play(BATTLE_DRUMS[idx], { loops: -1, volume: 0.7, fadeMs: fade * 1000 });
  }

  _battleSwapAmb(fade = BATTLE_SWAP_FADE) {
    let idx = this.upcoming.battle_amb;
    if (idx === undefined || idx === this.battleAmbIdx) {
      idx = choice([...Array(BATTLE_DRONES.length).keys()].filter((i) => i !== this.battleAmbIdx));
    }
    this.battleAmbIdx = idx;
    this._prepareUpcoming('battle_amb', idx);
    if (this.ambienceChannel) this.ambienceChannel.fadeout(fade * 1000);
    this.ambienceChannel = this.audio.play(BATTLE_DRONES[idx], { loops: -1, volume: 0.8, fadeMs: fade * 1000 });
  }

  // -------------------------------------------------------------- starting
  startGame(mode) {
    this.state = mode;
    this.resetGameState();
    this._syncRoom();
    this._wake(true);
    if (mode === S.BATTLE) {
      this._battleSwapBeat(CHAOS_AMBIENCE_FADE);
      this._battleSwapAmb(CHAOS_AMBIENCE_FADE);
    } else {
      const amb = this._pickAmb('lab');
      this.ambienceChannel = this.audio.play(LABYRINTH_DRONES[amb], { loops: -1, volume: 0.8, fadeMs: CHAOS_AMBIENCE_FADE * 1000 });
    }
    if (mode === S.STANDARD) {
      this.timeLeft = STANDARD_START_TIME;
      this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / 30.0) * 30.0;
      this.thirtySecAnnounced = this.timeLeft <= 30.0;
      this.lastBeepSecond = -1;
      this.generateLabyrinth();
    } else {
      this.ammo = this._battleTargetsNeeded() + 3;
      this.timeLeft = BATTLE_TIME_LIMIT;
      this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / BATTLE_TIME_ANNOUNCE) * BATTLE_TIME_ANNOUNCE;
      this.thirtySecAnnounced = this.timeLeft <= 30.0;
      this.lastBeepSecond = -1;
      this.tts.speak('Battle mode started.');
    }
  }

  generateLabyrinth(announce = true) {
    if (this.timeCredit && this.timeCredit.channel) this.timeCredit.channel.stop();
    this.timeCredit = null;
    this.grid.clear();
    this.playerPos = [0.0, 0.0];
    const diff = this._difficultyLevel();
    let gridSize; let density;
    if (diff <= 10) {
      gridSize = 8 + Math.floor(diff * 0.4);
      density = 0.04 + diff * 0.01;
    } else {
      gridSize = 12 + (diff - 10);
      density = 0.14 + (diff - 10) * 0.02;
    }
    density = Math.min(0.35, density);
    this.gridSize = gridSize;
    const minExitDist = Math.max(3.0, gridSize / 2.0);
    let validExits = [];
    let reachable = [];
    let walk = new Map();
    for (let attempt = 0; attempt < 60; attempt++) {
      this.grid.clear();
      for (let x = -gridSize; x <= gridSize; x++) {
        for (let y = -gridSize; y <= gridSize; y++) {
          if (x === 0 && y === 0) continue;
          if (rand() < density) this.grid.add(key(x, y));
        }
      }
      reachable = [];
      walk = new Map([[key(0, 0), 0]]);
      const queue = [[0, 0]];
      let head = 0;
      while (head < queue.length) {
        const [cx, cy] = queue[head++];
        reachable.push([cx, cy]);
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          const nx = cx + dx; const ny = cy + dy;
          if (nx >= -gridSize && nx <= gridSize && ny >= -gridSize && ny <= gridSize) {
            const k = key(nx, ny);
            if (!walk.has(k) && !this.grid.has(k)) {
              walk.set(k, walk.get(key(cx, cy)) + 1);
              queue.push([nx, ny]);
            }
          }
        }
      }
      validExits = reachable.filter((p) => Math.hypot(p[0], p[1]) >= minExitDist);
      if (validExits.length && reachable.length >= 4 * gridSize) break;
    }
    if (!validExits.length) {
      for (let i = 1; i <= gridSize; i++) { this.grid.delete(key(i, 0)); this.grid.delete(key(gridSize, i)); }
      validExits = [[gridSize, gridSize]];
      reachable = [];
      for (let i = 0; i <= gridSize; i++) reachable.push([i, 0]);
      for (let i = 1; i <= gridSize; i++) reachable.push([gridSize, i]);
      walk = new Map(reachable.map((p) => [key(p[0], p[1]), Math.abs(p[0]) + Math.abs(p[1])]));
    }
    this.exitPos = choice(validExits);
    const exitK = key(this.exitPos[0], this.exitPos[1]);
    const creditSpots = (lo, hi, slack, openSides) => reachable.filter((p) => {
      const w = walk.get(key(p[0], p[1]));
      if (w === undefined || w < lo || w > hi || key(p[0], p[1]) === exitK) return false;
      if (w > Math.abs(p[0]) + Math.abs(p[1]) + slack) return false;
      const around = [[0, 1], [1, 0], [0, -1], [-1, 0]].filter(([dx, dy]) => this.grid.has(key(p[0] + dx, p[1] + dy))).length;
      return around <= 4 - openSides;
    });
    let openCredits = [];
    for (const [lo, hi, slack, sides] of [[CREDIT_STEPS[0], CREDIT_STEPS[1], 1, 3], [CREDIT_STEPS[0], CREDIT_STEPS[1], 2, 2],
      [CREDIT_STEPS[0] - 1, CREDIT_STEPS[1] + 3, 3, 2], [CREDIT_STEPS[0] - 1, CREDIT_STEPS[1] + 6, 6, 1]]) {
      openCredits = creditSpots(lo, hi, slack, sides);
      if (openCredits.length) break;
    }
    // Chaos labyrinth levels use rare, high-value credits.
    if (this.chaosMode) {
      if (rand() < CHAOS_CREDIT_LABYRINTH) {
        const valid = openCredits.length ? openCredits
          : reachable.filter((p) => { const w = walk.get(key(p[0], p[1])); return w !== undefined && w >= 3 && w <= 14 && key(p[0], p[1]) !== exitK; });
        if (valid.length) {
          const [cx, cy] = choice(valid);
          this.timeCredit = new TimeCredit(cx, cy, false, true);
          this.timeCredit.channel = this.audio.play(this.timeCredit.beaconName, { loops: -1 });
        }
      }
    } else if (this.state === S.STANDARD && rand() < STANDARD_CREDIT_CHANCE) {
      const valid = openCredits.length ? openCredits
        : reachable.filter((p) => { const w = walk.get(key(p[0], p[1])); return w !== undefined && w >= 3 && w <= 14 && key(p[0], p[1]) !== exitK; });
      if (valid.length) {
        const [cx, cy] = choice(valid);
        this.timeCredit = new TimeCredit(cx, cy);
        this.timeCredit.channel = this.audio.play(this.timeCredit.beaconName, { loops: -1 });
      }
    }
    if (announce) this.tts.speak(`Level ${this.level}.`);
  }

  // -------------------------------------------------------------- the clock
  _announceStep() {
    // Chaos gets sparse two minute calls.
    if (this.chaosMode) return CHAOS_TIME_ANNOUNCE;
    return this.state === S.BATTLE ? BATTLE_TIME_ANNOUNCE : 30.0;
  }

  _advanceTimer(dt) {
    if (this.isPaused) return false;
    if (this.chaosMode && this._chaosExitOpen()) {
      // The level is won; the way to its exit costs no time. So a credit still
      // lying in the level goes: walked to now, it would be free time.
      this._chaosDropCredits();
      return false;
    }
    this.timeLeft -= dt;
    if (this.timeLeft <= this.nextAnnounceTime && this.nextAnnounceTime > 30) {
      const secLeft = Math.floor(this.nextAnnounceTime);
      if (secLeft % 60 === 0) {
        const mins = secLeft / 60;
        this.tts.speak(`${mins} minute${mins > 1 ? 's' : ''} left.`);
      } else {
        this.tts.speak(`${secLeft} seconds left.`);
      }
      this.nextAnnounceTime -= this._announceStep();
    }
    if (this.timeLeft <= 30 && !this.thirtySecAnnounced) {
      this.tts.speak('30 seconds left.');
      this.thirtySecAnnounced = true;
    }
    const currentSec = Math.trunc(this.timeLeft);
    if (this.timeLeft <= 15.0 && this.timeLeft > 0 && currentSec !== this.lastBeepSecond) {
      this.lastBeepSecond = currentSec;
      this.audio.play('countdown');
    }
    if (this.timeLeft <= 0) {
      this.triggerGameOver();
      return true;
    }
    return false;
  }

  _updateTimeCredit() {
    // Panning and pickup of an active time credit (standard, chaos labyrinth, chaos
    // battle or chaos tower floor).
    const c = this.timeCredit;
    if (!c) return;
    const [l, r, dist] = this.chaosMode ? this._chaosCreditLevels([c.x, c.y])
      : calculate3dPanning(this.playerPos, [c.x, c.y], Math.max(20.0, 2.5 * (this.gridSize || 8)));
    if (c.channel) c.channel.setVolume(l, r, this._behind([c.x, c.y]));
    // In a labyrinth, on the grid, from its own cell: never through a wall.
    const taken = this.state === S.STANDARD
      ? Math.trunc(this.playerPos[0]) === Math.trunc(c.x) && Math.trunc(this.playerPos[1]) === Math.trunc(c.y)
      : dist < 3.0;
    if (taken) {
      this.timeLeft += c.value;
      this.thirtySecAnnounced = this.timeLeft <= 30.0;
      const step = this._announceStep();
      this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / step) * step;
      this.lastBeepSecond = -1;
      this.audio.play(c.soundName);
      if (c.channel) c.channel.stop();
      this.timeCredit = null;
      // A chaos tower floor's credit was registered as a tower loop: forget that
      // handle too (the tower's state is 'tower', in js/modes/tower.js).
      if (this.state === 'tower' && this.towerLoops) delete this.towerLoops.credit;
    }
  }

  // -------------------------------------------------------------- standard
  updateStandardMode(dt) {
    if (this.isPaused) return;
    if (this._advanceTimer(dt)) return;
    this._updateTimeCredit();
    const [l, r, dist] = calculate3dPanning(this.playerPos, this.exitPos, 300.0);
    const interval = Math.max(0.15, dist * 0.05);
    const now = performance.now() / 1000;
    if (now - this.lastBeepTime > interval) {
      const pitch = Math.max(0, Math.min(19, 19 - Math.trunc(dist)));
      const ch = this.audio.play('prox_' + pitch);
      if (ch) ch.setVolume(l * 0.4, r * 0.4, this._behind(this.exitPos));
      this.lastBeepTime = now;
    }
  }

  nextLevel() {
    this.level += 1;
    // A chaos level of any kind (the clock is NOT reset): see _chaosNextLevel.
    if (this.chaosMode) { this._chaosNextLevel(); return; }
    if (this.ambienceChannel) this.ambienceChannel.fadeout(AMBIENCE_CROSSFADE * 1000);
    const amb = this._pickAmb('lab');
    this.ambienceChannel = this.audio.play(LABYRINTH_DRONES[amb], { loops: -1, volume: 0.8, fadeMs: AMBIENCE_CROSSFADE * 1000 });
    this.timeLeft += 7.0;
    this.generateLabyrinth();
    this.lastBeepSecond = -1;
    this.thirtySecAnnounced = this.timeLeft <= 30.0;
    this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / 30.0) * 30.0;
  }

  // -------------------------------------------------------------- battle
  _difficultyLevel() {
    // Inside chaos mode each kind of level carries its own count: a battle is as
    // hard as the number of BATTLES played, a labyrinth as the labyrinths.
    if (this.chaosMode) return this.state === S.BATTLE ? this.battleLevel : this.labyrinthLevel;
    return this.state === S.BATTLE ? this.battleWave : this.level;
  }

  // True in standard battle mode, which has no levels and no exit. Chaos battles
  // end, hand you an exit, and keep the old halved scaling.
  _battleEndless() { return this.state === S.BATTLE && !this.chaosMode; }

  _battleTargetsNeeded() {
    const rate = this._battleEndless() ? 1.2 : 0.6;
    return 3 + Math.trunc(this._difficultyLevel() * rate);
  }

  _battleMaxConcurrent() {
    // One more enemy at once every three waves in battle mode, every six in chaos,
    // and chaos keeps its ceiling of four.
    const step = this._battleEndless() ? 3 : 6;
    const base = 1 + Math.floor(this._difficultyLevel() / step);
    return this._battleEndless() ? Math.min(8, base) : Math.min(4, base);
  }

  _battleOpenBreak() {
    this.breakLastBeep = null;
    this.waveBreakTimer = Math.max(BATTLE_BREAK_MIN, BATTLE_BREAK_START - (this.battleWave - 1) * BATTLE_BREAK_DECAY);
    this._battleRestock();
  }

  _battleRestock() {
    while (this.ammoPickups.length < BATTLE_MAX_PICKUPS) {
      const [lo, hi] = choice(BATTLE_PICKUP_BANDS);
      const p = new AmmoCartridge(this.playerPos, this.ammoPickups.map((q) => [q.x, q.y]), hi, null, lo);
      p.channel = this.audio.play('ammo_beacon', { loops: -1 });
      this.ammoPickups.push(p);
    }
  }

  _battleMaybeEmergency() {
    if (!this._battleEndless() || this.inWaveBreak || this.ammo > 0 || this.battleEmergencyUsed) return;
    if (this.battleWaveShots <= 0) return;
    const left = this._battleTargetsNeeded() - this.waveKills;
    if (left <= 0) return;
    this.battleEmergencyUsed = true;
    const p = new AmmoCartridge(this.playerPos, this.obstacles.map((o) => [o.x, o.y]),
      BATTLE_EMERGENCY_DIST[1], null, BATTLE_EMERGENCY_DIST[0]);
    p.shots = Math.max(1, Math.min(left, this.obstacles.length || this._battleMaxConcurrent()));
    p.emergency = true;
    p.channel = this.audio.play('ammo_beacon', { loops: -1 });
    this.ammoPickups.push(p);
  }

  _battleClearEmergency() {
    for (const p of this.ammoPickups.filter((q) => q.emergency)) {
      if (p.channel) p.channel.stop();
      this.ammoPickups.splice(this.ammoPickups.indexOf(p), 1);
    }
  }

  _battleSpawnCredit() {
    const [px, py] = this.playerPos;
    const enemies = this.obstacles.map((o) => [o.x, o.y]);
    for (let i = 0; i < 200; i++) {
      const tx = uniform(-39.0, 39.0);
      const ty = uniform(-39.0, 39.0);
      if (Math.hypot(tx - px, ty - py) < BATTLE_CREDIT_MIN_DIST) continue;
      if (enemies.some(([ex, ey]) => Math.hypot(tx - ex, ty - ey) < BATTLE_AMMO_CLEARANCE)) continue;
      this.timeCredit = new TimeCredit(tx, ty, true);
      this.timeCredit.channel = this.audio.play(this.timeCredit.beaconName, { loops: -1 });
      return;
    }
  }

  _battleUpdateCredit() {
    const c = this.timeCredit;
    if (!c) return;
    const [l, r, dist] = this._battleLevels([c.x, c.y], BATTLE_CREDIT_GAIN);
    if (c.channel) c.channel.setVolume(l, r, this._behind([c.x, c.y]));
    if (dist < 3.0) {
      this.timeLeft += c.value;
      this.thirtySecAnnounced = this.timeLeft <= 30.0;
      this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / BATTLE_TIME_ANNOUNCE) * BATTLE_TIME_ANNOUNCE;
      this.lastBeepSecond = -1;
      this.audio.play(c.soundName);
      if (c.channel) c.channel.stop();
      this.timeCredit = null;
    }
  }

  _battleClearCredit() {
    if (this.timeCredit && this.timeCredit.channel) this.timeCredit.channel.stop();
    this.timeCredit = null;
  }

  _battleLevels(target, gain = 1.0) {
    const dx = target[0] - this.playerPos[0];
    const dy = target[1] - this.playerPos[1];
    const dist = Math.hypot(dx, dy);
    const pan = dist > 0 ? dx / dist : 0.0;
    const vol = Math.max(0.12, 1.0 - dist / 40.0) * gain;
    return [Math.min(1.0, vol * (1.0 - Math.max(0.0, pan))), Math.min(1.0, vol * (1.0 - Math.max(0.0, -pan))), dist];
  }

  _battleLocked() {
    let best = null; let bestD = Infinity;
    for (const o of this.obstacles) {
      const dx = o.x - this.playerPos[0];
      const dy = o.y - this.playerPos[1];
      const dist = Math.hypot(dx, dy);
      if (dist <= 0) continue;
      if (Math.abs(dx / dist) < BATTLE_AIM_PAN && dist < bestD) { best = o; bestD = dist; }
    }
    return best;
  }

  fireLaser() {
    // Once a chaos battle's exit is live the round is over: the click says there is
    // nothing left to shoot.
    if (this.battleExitActive) {
      this.audio.play('empty_click');
      return;
    }
    if (this.inWaveBreak || this.ammo <= 0) {
      this.audio.play('empty_click');
      return;
    }
    this.ammo -= 1;
    this.battleWaveShots += 1;
    this.audio.play('laser');
    const hit = this._battleLocked();
    if (hit) {
      const minDist = Math.hypot(hit.x - this.playerPos[0], hit.y - this.playerPos[1]);
      if (hit.channel) hit.channel.stop();
      this.obstacles.splice(this.obstacles.indexOf(hit), 1);
      this.kills += 1;
      this._later(minDist * 0.015, 'explosion', [hit.x, hit.y]);
      this.waveKills += 1;
      // Chaos battles keep the old two second lull between trickled spawns.
      const totalNeeded = this._battleTargetsNeeded();
      if (!this._battleEndless() && !this.obstacles.length && this.kills < totalNeeded) {
        this.inWaveBreak = true;
        this.waveBreakTimer = 2.0;
      }
    }
  }

  updateBattleMode(dt) {
    if (this.isPaused) return;
    const steps = this.battleSteps;
    this.battleSteps = [];
    // In chaos mode the global run timer keeps ticking during battle levels.
    if (this.chaosMode) {
      if (this._advanceTimer(dt)) return;
      if (this.state !== S.BATTLE) return;
    }
    // Standard battle's own clock, which runs through the breaks as well.
    if (this._battleEndless()) {
      if (this._advanceTimer(dt)) return;
    }
    this.battleBeatTimer -= dt;
    if (this.battleBeatTimer <= 0) { this.battleBeatTimer = uniform(...BATTLE_BEAT_SWAP); this._battleSwapBeat(); }
    this.battleAmbTimer -= dt;
    if (this.battleAmbTimer <= 0) { this.battleAmbTimer = uniform(...BATTLE_AMB_SWAP); this._battleSwapAmb(); }

    let totalNeeded = this._battleTargetsNeeded();
    if (this._battleEndless()) {
      if (this.inWaveBreak) {
        this.waveBreakTimer -= dt;
        const left = Math.ceil(this.waveBreakTimer);
        if (left > 0 && left <= BATTLE_BREAK_COUNTDOWN && left !== this.breakLastBeep) {
          this.breakLastBeep = left;
          this.audio.play('countdown_high');
        }
        if (this.waveBreakTimer > 0) this._battleRestock();
        if (this.waveBreakTimer <= 0) {
          for (const p of this.ammoPickups) if (p.channel) p.channel.stop();
          this.ammoPickups = [];
          this._battleClearCredit();
          this.inWaveBreak = false;
          this.battleWave += 1;
          this.spawnedEnemies = 0;
          this.waveKills = 0;
          this.battleEmergencyUsed = false;
          this.battleWaveShots = 0;
          totalNeeded = this._battleTargetsNeeded();
          this.audio.play('wave_start');
        }
      } else if (this.spawnedEnemies >= totalNeeded && !this.obstacles.length) {
        this.inWaveBreak = true;
        this._battleClearEmergency();
        this._battleClearCredit();
        this.audio.play('wave_clear');
        this._battleOpenBreak();
      }
    } else if (this.inWaveBreak) {
      // A chaos battle's two second lull.
      this.waveBreakTimer -= dt;
      if (this.waveBreakTimer <= 0) this.inWaveBreak = false;
    }
    const maxConcurrent = this._battleMaxConcurrent();

    // Rare high-value time credit can appear on the battlefield in chaos mode.
    if (this.chaosMode && !this.timeCredit && !this._chaosLevelWon() && rand() < CHAOS_CREDIT_BATTLE_RATE * dt) {
      let cx = null; let cy = null;
      for (let i = 0; i < 200; i++) {
        const tx = uniform(-39.0, 39.0);
        const ty = uniform(-39.0, 39.0);
        if (Math.hypot(tx - this.playerPos[0], ty - this.playerPos[1]) >= 15.0) { cx = tx; cy = ty; break; }
      }
      // No spot found: no credit this frame, and the frame goes on.
      if (cx !== null) {
        this.timeCredit = new TimeCredit(cx, cy, false, true);
        this.timeCredit.channel = this.audio.play(this.timeCredit.beaconName, { loops: -1 });
      }
    }

    // Battle mode credits, during wave breaks only.
    if (this._battleEndless() && this.inWaveBreak && this.waveBreakTimer > 0 && this.timeCredit === null) this._battleSpawnCredit();

    if (!this.inWaveBreak && this.obstacles.length < maxConcurrent && this.spawnedEnemies < totalNeeded) {
      if (rand() < perFrameChance(0.03 + 0.01 * this._difficultyLevel(), dt)) {
        const active = this.obstacles.map((o) => o.soundIdx);
        const available = [...Array(10).keys()].filter((i) => !active.includes(i));
        if (available.length) {
          const o = new Obstacle(this.playerPos, this._difficultyLevel(), choice(available),
            this.ammoPickups.map((p) => [p.x, p.y]),
            this._battleEndless() ? 7.0 : 4.6, this._battleEndless() ? 0.13 : 0.065);
          o.channel = this.audio.play(o.soundName, { loops: -1 });
          this.obstacles.push(o);
          this.spawnedEnemies += 1;
        }
      }
    }

    // Chaos battles only: one cartridge on the floor at a time, replaced as it is
    // taken, until the level's quota is met.
    if (!this._battleEndless() && this.ammoPickups.length < 1 && this.kills < totalNeeded) {
      const pickup = new AmmoCartridge(this.playerPos, this.obstacles.map((o) => [o.x, o.y]));
      pickup.channel = this.audio.play('ammo_beacon', { loops: -1 });
      this.ammoPickups.push(pickup);
      this.ammoSpawns += 1;
    }

    for (const o of this.obstacles) {
      const was = [o.x, o.y];
      let dist = o.update(this.playerPos, dt);
      for (const [a, b] of steps) dist = Math.min(dist, pointToSegment(was[0], was[1], a, b));
      const [l, r] = this._battleLevels([o.x, o.y]);
      if (o.channel) o.channel.setVolume(l, r, this._behind([o.x, o.y]));
      if (dist < 0.8) {
        this.audio.play('player_hit');
        this.triggerGameOver();
        return;
      }
    }

    this._battleMaybeEmergency();

    for (const p of [...this.ammoPickups]) {
      const dist = Math.hypot(p.x - this.playerPos[0], p.y - this.playerPos[1]);
      const [l, r] = this._battleLevels([p.x, p.y], 0.55);
      if (p.channel) p.channel.setVolume(l, r, this._behind([p.x, p.y]));
      if (dist < 3.0) {
        this.ammo += p.shots;
        this.audio.play('ammo');
        if (p.channel) p.channel.stop();
        this.ammoPickups.splice(this.ammoPickups.indexOf(p), 1);
      }
    }
    if (this._battleEndless()) this._battleUpdateCredit();
    else this._updateTimeCredit();     // a chaos battlefield credit

    // A chaos battle's exit: the quota shot AND nobody left alive. Standard battle
    // mode has no exit at all.
    if (!this._battleEndless() && this.kills >= totalNeeded && !this.obstacles.length && !this.battleExitActive) {
      this.battleExitActive = true;
      for (const p of this.ammoPickups) if (p.channel) p.channel.stop();
      this.ammoPickups = [];
      // Exactly 40 steps away.
      let placed = false;
      for (let i = 0; i < 500; i++) {
        const ex = uniform(-39.0, 39.0);
        const ey = uniform(-39.0, 39.0);
        if (Math.hypot(ex - this.playerPos[0], ey - this.playerPos[1]) >= 40.0) { this.exitPos = [ex, ey]; placed = true; break; }
      }
      if (!placed) this.exitPos = [this.playerPos[0] >= 0 ? -39.0 : 39.0, this.playerPos[1] >= 0 ? -39.0 : 39.0];
      this.battleExitChannel = this.audio.play('exit_morse', { loops: -1 });
    }
    if (this.battleExitActive) {
      // The Morse signal is the exit's whole identity: no proximity beep on top.
      const [l, r, dist] = this._battleLevels(this.exitPos);
      if (this.battleExitChannel) this.battleExitChannel.setVolume(l, r, this._behind(this.exitPos));
      if (dist < 3.0) this.nextLevel();
    }
  }

  // -------------------------------------------------------------- the end of a run
  _stopRunSounds() {
    for (const ch of [this.ambienceChannel, this.beatChannel]) if (ch) ch.stop();
    if (this.timeCredit && this.timeCredit.channel) this.timeCredit.channel.stop();
    for (const o of this.obstacles) if (o.channel) o.channel.stop();
    for (const p of this.ammoPickups) if (p.channel) p.channel.stop();
    this.audio.stopAllLoops();
    this.obstacles = [];
    this.ammoPickups = [];
    this.timeCredit = null;
    this.ambienceChannel = this.beatChannel = null;
    for (const v of this.pausedVoices) v.stop();
    this.pausedVoices = [];
    this.isPaused = false;
    for (const m of MODES) if (m.stopAll) m.stopAll(this);
  }

  triggerGameOver() {
    const mode = this.state;
    this.state = S.GAME_OVER;
    this._stopRunSounds();
    this._wake(false);
    let prevHigh; let isHigh; let scoreValue; let msg;
    // Another copy of the game may have set a record meanwhile.
    if (this.scores.refresh) this.scores.refresh();
    const m = runOwner(this) || modeOf(mode);
    if (m && m.finish) {
      // An added mode says what its run scored and opens its own message (r.key
      // and r.score; or r.custom with the whole message). The high score lines
      // below are the same for every mode; r.after is added after them.
      const r = m.finish(this, mode);
      if (r.custom) { this.tts.speak(r.message); return; }
      prevHigh = this.scores.scores[r.key] || 0;
      scoreValue = r.score;
      isHigh = this.scores.update(r.key, r.score);
      msg = r.message;
      this._finishAfter = r.after || '';
    } else if (mode === S.STANDARD) {
      prevHigh = this.scores.scores.standard || 0;
      scoreValue = this.level;
      isHigh = this.scores.update('standard', this.level);
      msg = `Game Over. You reached level ${this.level}. `;
    } else {
      prevHigh = this.scores.scores.battle || 0;
      scoreValue = this.kills;
      isHigh = this.scores.update('battle', this.kills);
      const opener = this.timeLeft <= 0 ? 'Time up.' : 'Game Over.';
      const how = this.inWaveBreak ? 'cleared' : 'reached';
      msg = `${opener} You shot down ${this.kills} ${plural(this.kills, 'enemy', 'enemies')} and ${how} wave ${this.battleWave}. `;
    }
    if (this.scores.readFailed) {
      // The saved boards could not be read this session: nothing is compared or
      // saved, so no record is claimed.
      msg += 'High scores could not be read this session, so this score is not saved. ';
    } else if (isHigh) {
      msg += prevHigh <= 0 ? `Your first high score for this mode: ${scoreValue}! ` : `New high score! You beat your previous best of ${prevHigh}. `;
    } else if (prevHigh <= 0) {
      msg += 'No high score yet for this mode. ';
    } else {
      msg += `Your high score is ${prevHigh}. `;
    }
    if (this._finishAfter) { msg += this._finishAfter; this._finishAfter = ''; }
    msg += 'Double tap to return to the menu.';
    this.tts.speak(msg);
  }

  // -------------------------------------------------------------- pause, help, quitting
  _pauseSounds() { this.pausedVoices = this.audio.pauseBeeps(); }

  _resumeSounds() {
    for (const v of this.pausedVoices) v.resume();
    this.pausedVoices = [];
  }

  // Called when the page is hidden: the phone locked, another app, another tab.
  autoPause() {
    if (this.playing && !this.isPaused) {
      this.isPaused = true;
      this._pauseSounds();
      this.tts.speak('Game paused. Tap with three fingers to resume.');
    }
  }

  _later(delay, name, at) {
    const run = this.runId;
    const fire = () => {
      if (this.runId !== run || this.state === S.MENU || this.state === S.GAME_OVER) return;
      if (this.isPaused || this.state === S.CONFIRM_EXIT || this.state === S.HELP) { setTimeout(fire, 250); return; }
      this.audio.play(name, { at });
    };
    setTimeout(fire, Math.max(0, delay) * 1000);
  }

  _openHelp() {
    this.prevState = this.state;
    if (this.playing) {
      this.helpWasPaused = this.isPaused;
      if (!this.isPaused) this._pauseSounds();
    }
    this.state = S.HELP;
    this.helpCat = null;
    this.helpCatIndex = 0;
    this.helpIndex = 0;
    const [name, items] = HELP[0];
    this.tts.speak(`Help menu. Swipe up and down to choose a section, double tap to open it, triple tap to leave. ${name}. ${items.length} topics. Section 1 of ${HELP.length}.`);
  }

  _askQuit() {
    this.prevState = this.state;
    this.state = S.CONFIRM_EXIT;
    this.quitWasPaused = this.isPaused;
    if (!this.isPaused) this._pauseSounds();
    const held = modeOf(this.prevState);    // this.mode is null now: the state is the question
    if (held && held.hold) held.hold(this, true);
    this.confirmYes = false;
    this.tts.speak('Are you sure you want to return to the main menu? Your score will not be saved. Swipe up or down to choose, then double tap. No.');
  }

  _speakHelpCategory(moveSound = true, prefix = '') {
    if (moveSound) this.audio.play('menu_move');
    const [name, items] = HELP[this.helpCatIndex];
    this.tts.speak(`${prefix}${name}. ${items.length} topics. Section ${this.helpCatIndex + 1} of ${HELP.length}.`);
  }

  _stopDemo() {
    if (this.audio.demoVoice) { this.audio.demoVoice.stop(); this.audio.demoVoice = null; }
  }

  _playHelpItem(prefix = '') {
    this._stopDemo();
    this.audio.play('menu_move');
    const [name, items] = HELP[this.helpCat];
    const sec = items[this.helpIndex];
    this.helpRoom = (name.includes('Standard') || name.includes('Chaos')) ? 'lab'
      : name.includes('Tower') ? 'tower' : name.includes('Battle') ? 'battle' : null;
    this.audio.setRoom(this._currentRoom());
    const sound = sec.sound;
    if (sound) this.audio.prepare(sound);
    this.tts.speak(`${prefix}${sec.title}. ${sec.desc}`, {
      after: sound ? () => { if (this.state === S.HELP) this.audio.demoVoice = this.audio.play(sound); } : null,
    });
  }

  _scoreLines() {
    const board = (k, label, fmt) => {
      const v = this.scores.scores[k] || 0;
      if (this.scores.readFailed) return `${label}: could not be read this session`;
      return v <= 0 ? `${label}: No score yet` : `${label}: ${fmt(v)}`;
    };
    // In the desktop's _score_lines order; a board it does not list goes after.
    const order = ['chaos', 'tower', 'drive', 'drive_distance', 'island'];
    const rank = (b) => (order.includes(b.key) ? order.indexOf(b.key) : order.length);
    const boards = MODES.flatMap((md) => md.boards || []).map((b, i) => [b, i])
      .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([b]) => b);
    return [
      board('standard', 'Standard Mode', (v) => `Level ${v}`),
      board('battle', 'Battle Mode', (v) => `${v} ${plural(v, 'enemy', 'enemies')}`),
      ...boards.map((b) => board(b.key, b.label, b.fmt)),
      'Reset all high scores',
    ];
  }

  _toMenu(prefix = 'Main Menu. ') {
    this.state = S.MENU;
    this._wake(false);
    this._refreshMenu();
    this.tts.speak(prefix + this.menuOptions[this.menuIndex]);
  }

  // -------------------------------------------------------------- input
  input(g) {
    this.audio.resume();
    this.lastInputAt = performance.now();
    this._checkSound();
    if (this.state === S.PRACTICE) { this._practiceInput(g); return; }
    for (const md of MODES) {
      const h = md.inputStates && md.inputStates[this.state];
      if (h) { h(this, g); return; }
    }

    // Help from the menu, or from a run (four taps reach here only while paused;
    // a keyboard's H works at any time, as on the computer).
    if (g === 'help' && (this.state === S.MENU || this.playing)) {
      const md0 = this.mode;
      if (md0 && md0.blockPause && md0.blockPause(this)) { this.audio.play('boundary'); return; }
      this._openHelp();
      return;
    }

    if (this.state === S.CONFIRM_EXIT) {
      const yes = g === 'yes' || (g === 'enter' && this.confirmYes);
      const no = g === 'no' || g === 'back' || (g === 'enter' && !this.confirmYes);
      if (g === 'up' || g === 'down') {
        this.confirmYes = !this.confirmYes;
        this.audio.play('menu_move');
        this.tts.speak(this.confirmYes ? 'Yes, return to the main menu.' : 'No, go back.');
      } else if (yes) {
        this._stopRunSounds();
        this.runId += 1;
        this.menuIndex = 0;
        this._toMenu('Returned to Main Menu. ');
      } else if (no) {
        this.state = this.prevState;
        if (this.mode && this.mode.hold) this.mode.hold(this, false);
        if (!this.quitWasPaused) {
          this._resumeSounds();
          this.tts.speak('Resuming.');
        } else {
          this.tts.speak('Still paused. Tap with three fingers to resume.');
        }
      }
      return;
    }

    if (this.playing && (g === 'back')) {
      // A gesture never sends this mid-run (only while paused); a keyboard's Escape does.
      this._askQuit();
      return;
    }

    switch (this.state) {
      case S.MENU: this._menuInput(g); return;
      case S.HELP: this._helpInput(g); return;
      case S.CONFIRM_RESET: this._resetInput(g); return;
      case S.HIGH_SCORES: this._scoresInput(g); return;
      case S.GAME_OVER:
        if (g === 'enter' || g === 'back') this._toMenu();
        return;
      default: break;
    }
    if (this.playing) this._playInput(g);
  }

  // If the phone has stopped the game's sound and it has not come back by the
  // time this gesture is over, say so (once in a while), and how to bring it back.
  _checkSound() {
    if (this.audio.running) return;
    this.audio.audible;           // notes the clock now, to compare below
    setTimeout(() => {
      const now = performance.now();
      if (this.audio.audible || now - (this.soundNoticeAt || -1e9) < 15000) return;
      this.soundNoticeAt = now;
      this.tts.speak('The game\'s sounds were stopped by your device. Tap the screen once to bring them back.', { interrupt: false });
    }, 900);
  }

  _menuInput(g) {
    const k = this.menuKeys[this.menuIndex];
    if (g === 'up' || g === 'down') {
      const n = this.menuOptions.length;
      this.menuIndex = (this.menuIndex + (g === 'up' ? -1 : 1) + n) % n;
      this.audio.play('menu_move');
      this.tts.speak(this.menuOptions[this.menuIndex]);
    } else if ((g === 'left' || g === 'right') && k === 'rate') {
      this._changeRate(g === 'left' ? -1 : 1, false);
    } else if (g === 'enter') {
      this.audio.play('menu_move');
      if (k === 'standard') this.startGame(S.STANDARD);
      else if (k === 'battle') this.startGame(S.BATTLE);
      else if (k === 'scores') {
        this.state = S.HIGH_SCORES;
        this.scoreIndex = 0;
        this.tts.speak('High Scores Menu. Swipe up and down to hear scores. Double tap or triple tap to go back. ' + this._scoreLines()[0]);
      } else if (k === 'practice') this._startPractice();
      else if (this._menuItems().some((i) => i.key === k)) this._menuItems().find((i) => i.key === k).select(this);
      else if (k === 'rate') this._changeRate(1, true);
      else if (k === 'leave') {
        this.tts.speak('Leaving the game. You can turn your screen reader back on now.', { after: () => this.leave() });
        setTimeout(() => this.leave(), 6000);
      }
    }
  }

  _changeRate(step, wrap) {
    let lvl = this.tts.rateLevel + step;
    if (wrap) lvl = ((lvl - 1 + RATES.length) % RATES.length) + 1;
    lvl = Math.max(1, Math.min(RATES.length, lvl));
    this.tts.rateLevel = lvl;
    this.scores.settings.speechRate = lvl;
    this.scores.save();
    this._refreshMenu();
    this.audio.play('menu_move');
    this.tts.speak(`Speech rate ${lvl} of ${RATES.length}.`);
  }

  _helpInput(g) {
    if (this.helpCat === null) {
      if (g === 'back') {
        this._stopDemo();
        this.state = this.prevState;
        this.helpRoom = null;
        if (this.state === S.MENU) this.tts.speak('Main menu. ' + this.menuOptions[this.menuIndex]);
        else if (this.helpWasPaused) this.tts.speak('Still paused. Tap with three fingers to resume.');
        else { this._resumeSounds(); this.tts.speak('Resuming.'); }
      } else if (g === 'up' || g === 'down') {
        this.helpCatIndex = (this.helpCatIndex + (g === 'up' ? -1 : 1) + HELP.length) % HELP.length;
        this._speakHelpCategory();
      } else if (g === 'enter') {
        this.helpCat = this.helpCatIndex;
        this.helpIndex = 0;
        const [name, items] = HELP[this.helpCat];
        // The desktop's key handler and its _play_help_item each play the click.
        this.audio.play('menu_move');
        this._playHelpItem(`${name}. ${items.length} topics. `);
      }
    } else {
      const items = HELP[this.helpCat][1];
      if (g === 'back') {
        this._stopDemo();
        this.helpCat = null;
        this.helpRoom = null;
        this.audio.play('menu_move');
        this._speakHelpCategory(false, 'Sections. ');
      } else if (g === 'up' || g === 'down') {
        this.helpIndex = (this.helpIndex + (g === 'up' ? -1 : 1) + items.length) % items.length;
        this._playHelpItem();
      }
    }
  }

  _scoresInput(g) {
    const lines = this._scoreLines();
    if (g === 'enter' && this.scoreIndex === lines.length - 1) {
      this.state = S.CONFIRM_RESET;
      this.confirmYes = false;
      this.tts.speak('Reset all high scores? Every board goes back to the beginning and this cannot be undone. Swipe up or down to choose, then double tap. No.');
    } else if (g === 'enter' || g === 'back') {
      this.menuIndex = 0;
      this._toMenu();
    } else if (g === 'up' || g === 'down') {
      this.scoreIndex = g === 'up' ? Math.max(0, this.scoreIndex - 1) : Math.min(lines.length - 1, this.scoreIndex + 1);
      this.audio.play('menu_move');
      this.tts.speak(lines[this.scoreIndex]);
    }
  }

  _resetInput(g) {
    const yes = g === 'yes' || (g === 'enter' && this.confirmYes);
    const no = g === 'no' || g === 'back' || (g === 'enter' && !this.confirmYes);
    if (g === 'up' || g === 'down') {
      this.confirmYes = !this.confirmYes;
      this.audio.play('menu_move');
      this.tts.speak(this.confirmYes ? 'Yes, reset everything.' : 'No, keep my scores.');
    } else if (yes) {
      this.state = S.HIGH_SCORES;
      this.scoreIndex = 0;
      if (this.scores.readFailed) {
        // The file could not be read, so it cannot be written either: the saved
        // scores are kept safe, and nothing is claimed.
        this.tts.speak('High scores cannot be changed this session, because the file could not '
          + 'be read. Nothing was reset. Restart the game to try again.');
        return;
      }
      this.scores.reset();
      this.audio.play('explosion');
      this.tts.speak('All high scores reset. ' + this._scoreLines()[0]);
    } else if (no) {
      this.state = S.HIGH_SCORES;
      this.tts.speak('Cancelled. Nothing was reset.');
    }
  }

  _playInput(g) {
    // A mode can refuse the pause for a moment (the desktop's elevator ride:
    // P and H only give the boundary buzz).
    const blocker = this.mode;
    if ((g === 'pause' || g === 'help') && blocker && blocker.blockPause && blocker.blockPause(this)) {
      this.audio.play('boundary');
      return;
    }
    if (g === 'pause') {
      this.isPaused = !this.isPaused;
      if (this.isPaused) {
        this._pauseSounds();
        this.tts.speak('Game paused. Tap with three fingers to resume. Triple tap to quit, or tap four times for help.');
      } else {
        this._resumeSounds();
        this.tts.speak('Game resumed.');
      }
      return;
    }
    if (this.isPaused) return;
    const md = this.mode;
    if (md && md.input) { md.input(this, g); return; }
    if (g === 'clock') {
      const secs = Math.trunc(this.timeLeft);
      this.tts.speak(`${secs} second${secs === 1 ? '' : 's'} remaining.`);
      return;
    }
    if (this.state === S.BATTLE) {
      if (g === 'space') { this.fireLaser(); return; }
      if (g === 'enter') {
        if (!this._battleEndless()) {
          // A chaos battle: the shots, and the run's points.
          this._report(`${this.ammo} shot${this.ammo === 1 ? '' : 's'} remaining.`, true);
          return;
        }
        const left = Math.max(0, this._battleTargetsNeeded() - this.waveKills);
        const shots = `${this.ammo} shot${this.ammo === 1 ? '' : 's'}. ${this.kills} down. `;
        if (this.inWaveBreak) this.tts.speak(`${shots}Wave break, ${Math.trunc(this.waveBreakTimer) + 1} seconds. Clock ${Math.trunc(this.timeLeft)} seconds.`);
        else this.tts.speak(`${shots}Wave ${this.battleWave}, ${left} left. Clock ${Math.trunc(this.timeLeft)} seconds.`);
        return;
      }
    }
    if (this.state === S.STANDARD && g === 'enter') {
      // The report: in a labyrinth, the clock (and in chaos, the points).
      const t = Math.trunc(this.timeLeft);
      this._report(`${t} second${t === 1 ? '' : 's'} left.`);
      return;
    }
    let [nx, ny] = this.playerPos;
    const step = this.state === S.STANDARD ? 1.0 : 3.0;
    if (g === 'up') { ny -= step; this.playerFacing = [0, -1]; }
    else if (g === 'down') { ny += step; this.playerFacing = [0, 1]; }
    else if (g === 'left') { nx -= step; this.playerFacing = [-1, 0]; }
    else if (g === 'right') { nx += step; this.playerFacing = [1, 0]; }
    else return;
    if (this.state === S.STANDARD) {
      const gs = this.gridSize;
      if (gs && (Math.abs(nx) > gs || Math.abs(ny) > gs)) this.audio.play('wall', { at: [nx, ny] });
      else if (this.grid.has(key(Math.trunc(nx), Math.trunc(ny)))) this.audio.play('wall', { at: [nx, ny] });
      else {
        this.playerPos = [nx, ny];
        this._playStep();
        if (Math.trunc(nx) === this.exitPos[0] && Math.trunc(ny) === this.exitPos[1]) this.nextLevel();
      }
    } else if (nx >= -this.arenaLimit && nx <= this.arenaLimit && ny >= -this.arenaLimit && ny <= this.arenaLimit) {
      this.battleSteps.push([[...this.playerPos], [nx, ny]]);
      this.playerPos = [nx, ny];
      this._playStep();
    } else {
      this.audio.play('boundary');
    }
  }

  _playStep() { this.audio.play(choice(STEPS)); }

  // Phones have no T, so a report in a mode with a clock and no clock of its own in
  // the report (driving, and chaos's battles, roads, towers and islands) ends with it.
  _clockTail() {
    const s = Math.max(0, Math.trunc(this.timeLeft));
    return ` Clock ${s} second${s === 1 ? '' : 's'}.`;
  }

  // Enter's report (the desktop's _report). In chaos mode every report ends with the
  // run's points, since that is the score the run is played for.
  _report(text, clock = false) {
    if (clock) text = text.trimEnd() + this._clockTail();
    if (this.chaosMode) text = text.trimEnd() + ` ${(this.chaosPoints || 0) + (this.islandPoints || 0)} points total.`;
    this.tts.speak(text);
  }

  // -------------------------------------------------------------- gesture practice
  _startPractice() {
    this.state = S.PRACTICE;
    this.practiceBackAt = 0;
    this.scores.settings.practiced = true;
    this.scores.save();
    this.tts.speak('Gesture practice. Try any gesture and the game says what it felt. '
      + 'Swipe in four directions, double tap, triple tap, tap four times, tap with two fingers or with three. '
      + 'Triple tap twice in a row to leave, or wait twenty seconds.');
  }

  _practiceInput(g) {
    const names = {
      up: 'Swipe up.', down: 'Swipe down.', left: 'Swipe left.', right: 'Swipe right.',
      enter: 'Double tap. Choose, like Enter.', help: 'Four taps. Help.', tap: 'One tap. It does nothing.',
      space: 'Two-finger tap. Fire, like Space.', pause: 'Three-finger tap. Pause and resume.',
      clock: 'T. The clock.', yes: 'Y. Yes.', no: 'N. No.',
    };
    if (g === 'back') {
      const now = performance.now();
      if (now - this.practiceBackAt < 4000) {
        this.menuIndex = this.menuKeys.indexOf('practice');
        this._toMenu('Gesture practice closed. ');
        return;
      }
      this.practiceBackAt = now;
      this.audio.play('menu_move');
      this.tts.speak('Triple tap. Back. Triple tap again to leave practice.');
      return;
    }
    this.practiceBackAt = 0;
    this.audio.play('menu_move');
    this.tts.speak(names[g] || g);
  }

  // -------------------------------------------------------------- the room
  _syncRoom() { this.audio.setRoom(this._currentRoom()); }

  _currentRoom() {
    const md = this.mode;
    if (md && md.room) return md.room(this, this.state);
    if (this.state === S.STANDARD) return 'lab';
    if (this.state === S.BATTLE) return 'battle';
    if (this.state === S.HELP) return this.helpRoom;
    return null;
  }

  _updateReverb(dt) {
    if (this.state === S.CONFIRM_EXIT) return;
    const inHelpFromGame = this.state === S.HELP && isRunState(this.prevState);
    if (inHelpFromGame && this.helpSavedRoomGain === null) {
      this.helpSavedRoomGain = [this.audio.roomGain, this.audio.roomLean];
      this.audio.roomGain = 1.0; this.audio.roomLean = 0.0;
    } else if (!inHelpFromGame && this.helpSavedRoomGain !== null) {
      [this.audio.roomGain, this.audio.roomLean] = this.helpSavedRoomGain;
      this.helpSavedRoomGain = null;
    }
    const room = this._currentRoom();
    this.audio.setRoom(room);
    this.reverbTick += dt;
    if (this.reverbTick < REVERB_REFRESH) return;
    let tick = this.reverbTick;
    this.reverbTick = 0;
    let gain = 1.0; let lean = 0.0;
    if (room === 'lab') [gain, lean] = this._labSurroundings();
    else if (room === 'battle') [gain, lean] = this._arenaSurroundings();
    if (this.mode && this.mode.surroundings) {
      // A third value, when given, replaces the easing step (the desktop's road
      // uses 1.0: the tunnel's own fade is already smooth, so it applies at once).
      const sr = this.mode.surroundings(this, null, room);
      [gain, lean] = sr;
      if (sr.length > 2) tick = sr[2];
    }
    if (this.state === S.HELP) { gain = 1.0; lean = 0.0; }
    if (this.isPaused || inHelpFromGame) return;
    this.audio.setSurroundings(gain, lean, tick);
  }

  _behind(pos) {
    const md = this.mode;
    if (md && md.behind) { const b = md.behind(this, pos); if (b !== undefined) return b; }
    const dx = pos[0] - this.playerPos[0];
    const dy = pos[1] - this.playerPos[1];
    const dist = Math.hypot(dx, dy);
    if (dist <= 1e-6 || dy <= 0) return 0.0;
    return Math.min(1.0, Math.pow(dy / dist, BEHIND_CURVE));
  }

  _sourceEffect(pos) {
    const room = this._currentRoom();
    if (this.mode && this.mode.surroundings) return this.mode.surroundings(this, pos, room);
    if (room === 'lab') return this._labSurroundings(pos);
    if (room === 'battle') return this._arenaSurroundings(pos);
    return [1.0, 0.0];
  }

  _labSurroundings(pos = null) {
    if (!this.grid.size) return [1.0, 0.0];
    const p = pos || this.playerPos;
    const x = Math.trunc(p[0]); const y = Math.trunc(p[1]);
    let around = 0;
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) if ((dx || dy) && this.grid.has(key(x + dx, y + dy))) around += 1;
    const near = Math.min(1.0, around / 4.0);
    const gain = REVERB_GAIN_OPEN + (REVERB_GAIN_WALL - REVERB_GAIN_OPEN) * near;
    const wl = this.grid.has(key(x - 1, y));
    const wr = this.grid.has(key(x + 1, y));
    let lean = 0.0;
    if (wl && !wr) lean = -REVERB_LEAN_MAX;
    else if (wr && !wl) lean = REVERB_LEAN_MAX;
    return [gain, lean];
  }

  _arenaSurroundings(pos = null) {
    const limit = this.arenaLimit;
    if (limit <= 0) return [1.0, 0.0];
    const p = pos || this.playerPos;
    const nearX = Math.max(0.0, 1.0 - (limit - Math.abs(p[0])) / REVERB_WALL_RANGE);
    const nearY = Math.max(0.0, 1.0 - (limit - Math.abs(p[1])) / REVERB_WALL_RANGE);
    const near = Math.min(1.0, Math.max(nearX, nearY));
    const gain = REVERB_GAIN_OPEN + (REVERB_GAIN_WALL - REVERB_GAIN_OPEN) * near;
    const lean = nearX > 0 ? REVERB_LEAN_MAX * nearX * (p[0] > 0 ? 1.0 : -1.0) : 0.0;
    return [gain, lean];
  }

  // -------------------------------------------------------------- the screen stays on during a run
  async _wake(on) {
    try {
      if (on && !this.wakeLock && navigator.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
      } else if (!on && this.wakeLock) {
        await this.wakeLock.release();
        this.wakeLock = null;
      }
    } catch (e) { /* not allowed here: the phone's own sleep setting applies */ }
  }

  // -------------------------------------------------------------- one frame
  frame(dt) {
    const md = this.mode;
    const gm = md && md.gestureMode ? md.gestureMode(this) : null;
    this.gestures.setMode(this.playing && !this.isPaused ? (gm || 'run') : 'menu');
    if (this.state === S.PRACTICE && performance.now() - (this.lastInputAt || 0) > 20000) {
      this.menuIndex = this.menuKeys.indexOf('practice');
      this._toMenu('Gesture practice closed. ');
    }
    this._updateReverb(dt);
    if (this.state === S.STANDARD) this.updateStandardMode(dt);
    else if (this.state === S.BATTLE) this.updateBattleMode(dt);
    else if (md && md.update) md.update(this, dt);
    for (const m of MODES) if (m.tick) m.tick(this, dt);
    this.view(this._statusLine());
  }

  _statusLine() {
    const md = (this.playing && runOwner(this)) || this.mode;
    if (md && md.status) return md.status(this) + (this.isPaused ? ' Paused.' : '');
    for (const m of MODES) if (m.statusFor && m.statusFor[this.state]) return m.statusFor[this.state](this);
    switch (this.state) {
      case S.STANDARD: return `Standard Mode. Level ${this.level}. ${Math.max(0, Math.trunc(this.timeLeft))} seconds.${this.isPaused ? ' Paused.' : ''}`;
      case S.BATTLE: return `Battle Mode. Wave ${this.battleWave}. ${this.kills} down. ${this.ammo} shots. ${Math.max(0, Math.trunc(this.timeLeft))} seconds.${this.isPaused ? ' Paused.' : ''}`;
      case S.MENU: return 'Main Menu: ' + this.menuOptions[this.menuIndex];
      case S.HELP: return 'Help';
      case S.HIGH_SCORES: return 'High Scores';
      case S.GAME_OVER: return 'Game Over';
      case S.CONFIRM_EXIT: return 'Return to the main menu?';
      case S.CONFIRM_RESET: return 'Reset all high scores?';
      case S.PRACTICE: return 'Gesture Practice';
      default: return '';
    }
  }
}

export const STATES = S;

// Each added mode's methods become the game's own (written with the desktop's
// names, in camelCase, so they read like the desktop code).
for (const m of MODES) if (m.mixin) Object.assign(Game.prototype, m.mixin);
