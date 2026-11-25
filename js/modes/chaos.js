// Chaos Mode: the desktop game's chaos mode (endless_labyrinth.py, version 1.0.1:
// the CHAOS_ constants, start_chaos, _chaos_clear_everything, _chaos_begin_gap,
// update_chaos_gap, _chaos_pick_next, _chaos_preview_name, _setup_chaos_level,
// _chaos_setup_tower, _chaos_setup_drive, _chaos_drive_exit_check,
// _chaos_setup_island, next_level's chaos part, _chaos_level_won, _chaos_exit_open,
// _chaos_drop_credits and _chaos_credit_levels), played with touch gestures. Names
// and numbers follow the desktop code so the two can be compared line by line.
//
// Chaos mixes every mode. Each level is one of these, chosen at random, and nothing
// says which: you work it out by ear.
//   labyrinth: find the exit          battle: clear it and find the exit
//   tower:     one floor, up the stairs  driving: shoot the quota, drive through the exit
//   island:    clear it, find its key, ride the elevator up
// Each kind gets harder on its own count, never on the overall level number.
//
// A chaos run moves between the states of the other modes ('standard', 'battle',
// 'tower', 'drive', 'island') and its own gap between levels ('chaos_gap'). Each of
// those modes plays its chaos branches behind game.chaosMode (game.js for Standard
// and Battle; tower.js, driving.js and island.js for the rest), so each state's own
// hooks (room, surroundings, behind, gestureMode, input, update, blockPause, hold)
// stay right during a chaos run. This mode owns the run as a whole (ownsRun): its
// finish and its status line are used whichever state the run is in.

import { TOWER_DRONES } from './tower.js';
import { RoadThing } from './driving.js';
import { FV_LIVES, FV_FIRST_BACKGROUND } from './findvoice.js';
import { AB_LIVES, AB_BACKGROUND, AB_CHAOS_QUOTA_FIRST, AB_CHAOS_QUOTA_GROW, AB_CHAOS_QUOTA_MAX } from './abyss.js';
import { aliasRecording } from './events/sounds.js';
import { PK_BACKGROUND, PK_CHAOS_FIRST, PK_CHAOS_GROW, PK_CHAOS_MAX } from './park.js';
import { memoriesFor as museumMemoriesFor, museumStem } from './museum.js';
import { CHAOS_HEALTH_MAX } from './ultimate.js';

// ------------------------------------------------------------------ constants
// Driving: the quota of cars to shoot is BASE plus one per driving level so far, and
// the road starts that many RAMP_STEP seconds further into its difficulty ramp.
const CHAOS_DRIVE_QUOTA_BASE = 2;
const CHAOS_DRIVE_RAMP_STEP = 30.0;
// Every level completed that is not an island is worth ten. Islands are worth the
// most: everything island mode pays, plus one hundred for finishing the island.
const CHAOS_POINTS_LEVEL = 10;
// One health bar for the whole chaos run (Russell, 20 November 2026), in place of
// the tower's own health, a world's fresh 100, and Find the Voice's and the Abyss's
// own lives. It is kept in towerHp (the tower floors already carry it from floor to
// floor); a world stage starts from it and hands back what is left.
export const CHAOS_HEALTH_START = 100;
export const CHAOS_HEALTH_LEVEL = 10;      // for every level finished
// The most health a chaos run can hold, CHAOS_HEALTH_MAX (150, in ultimate.js; 7.2.16,
// Russell: there was no cap). Every gain stops there: a level's ten, and a world stage's
// chests, cases and gifts.
export const CHAOS_HIT = 25;               // a battle's or an island's enemy reaching you
export const CHAOS_CATCH = 25;             // a Find the Voice or Abyss creature catching you
export const CHAOS_DROWN = 10;             // each second out of air on a seabed
export const CHAOS_CRASH = 20;             // a crash on a road (and its 30 seconds, as ever)
export const CHAOS_LOW = 35;               // at or under this, the voice says Health low
export const CHAOS_HIT_GRACE = 1.5;        // seconds after a hit before another can land
// Climbing from one chaos tower floor to the next: what is left of the climb's echo
// is gone as the floor begins (the climb itself is in tower.js).
const CHAOS_CLIMB_TAIL_FADE = 0.06;
// Seconds between one chaos level and the next: just long enough for the old
// level's loops to be silenced cleanly before the new one starts.
const CHAOS_GAP_TIME = 0.1;
// Chaos time credits: heard from anywhere in the room, never quieter than FLOOR,
// worth 40, 50 or 60 seconds against a five minute clock.
const CHAOS_CREDIT_VALUES = [40, 50, 60];
const CHAOS_CREDIT_TOWER = 0.5;           // chance a chaos tower floor has one
const CHAOS_CREDIT_FLOOR = 0.15;
// Roads: one chaos credit roughly every this many metres, give or take 40 percent.
const CHAOS_CREDIT_ROAD_GAP = 2000.0;
const CHAOS_TIME_LIMIT = 300.0;
// Web 6.0.0 (Russell, 19 Nov): two more kinds of stage. Find the Voice: find the
// guide a quota of times, then take the exit. The quota is 3 or 4 the first time
// in a run, one more each time the stage comes up again, never over 8; the stage
// has its own three lives for the whole run, and losing the third ends the run.
// The world stage (website only): a random world of Ultimate Mode. How often each
// kind comes up, against the others: Find the Voice as often as an island, the
// world the rarest of all.
export const CHAOS_FV_QUOTA_FIRST = [3, 4];
export const CHAOS_FV_QUOTA_GROW = 1;
export const CHAOS_FV_QUOTA_MAX = 8;
// (Web 6.2.0: The Abyss joins, as often as Find the Voice.)
// (Web 7.0.0: the Water Park joins, as often as The Abyss.)
// (Web 7.2.0: The Museum joins, as often as The Abyss, Russell, 23 November 2026.)
export const CHAOS_STAGE_WEIGHTS = { standard: 1, battle: 1, tower: 1, drive: 1, island: 1, findvoice: 1, abyss: 1, park: 1, museum: 1, ultimate: 0.5 };
// The old level's air going as the new one comes.
const CHAOS_AMBIENCE_FADE = 0.4;
// The other modes' numbers chaos uses (the desktop's own values).
const ISLAND_START_AMMO = 8;
const ISLAND_SURFACE_VOLUME = 0.8;
const TOWER_FLOORS_MIN = 3;
const TOWER_FLOORS_MAX = 10;
const DRIVE_LANES = 3;
const DRIVE_HORIZON = 200.0;
const DRIVE_ENGINE_BLEND = 160;
// The labyrinth's and the battle's drones (game.js's LABYRINTH_DRONES and
// BATTLE_DRONES, the desktop's ambience_N and battle_amb_N), for the elevator's
// preview of the next level.
const LABYRINTH_DRONES = ['lab_01_cavewind', 'lab_02_scary_cave', 'lab_03_scifi_cave', 'lab_04_dungeon_air',
  'lab_05_catacombs', 'lab_06_creepy_basement', 'lab_07_horror_basement', 'lab_08_waterflow_2',
  'lab_09_waterflow_1', 'lab_10_dreary_tunnels', 'lab_11_tunnel_fan'];
const BATTLE_DRONES = ['bat_01_deep_drone', 'bat_02_creepy_dark', 'bat_03_dark_ambient', 'bat_04_dark_drone',
  'bat_05_ominous', 'bat_06_grinding', 'bat_07_texture', 'bat_08_eerie', 'bat_09_suspenseful', 'bat_10_static',
  'bat_11_horror_suspense'];

// The states a chaos run passes through.
const STANDARD = 'standard';
const BATTLE = 'battle';
const TOWER = 'tower';
const DRIVE = 'drive';
const ISLAND = 'island';
const FINDVOICE = 'findvoice';
const ABYSS = 'abyss';
const PARK = 'park';
const MUSEUM = 'museum';
const WORLD = 'ultimate';
const STATE_CHAOS_GAP = 'chaos_gap';

// A treasure chest (7.2.17, Russell): now and then, when a level's exit opens, a chest
// lies a couple of steps from the exit, on your way to it, heard by its sparkling
// chime; walk onto it to open it. Very rare. Only where there is an exit to walk to:
// a battle, a tower floor, a Find the Voice room, an abyss, a water park, a museum.
// It holds two of: more time, health (never past CHAOS_HEALTH_MAX, and nothing when
// you are already there), and points. Leave the level without it and it is gone.
export const CHAOS_CHEST_CHANCE = 0.1;
export const CHAOS_CHEST_FROM_EXIT = 6.0;     // units (two steps) from the exit, toward you
export const CHAOS_CHEST_REACH = 3.0;
export const CHAOS_CHEST_TIME = 30;
export const CHAOS_CHEST_HEALTH = 25;
export const CHAOS_CHEST_POINTS = 50;
export const CHAOS_CHEST_BEACONS = ['ut_chest', 'treasure_beacon'];

// ------------------------------------------------------------------ helpers
const rand = Math.random;
const uniform = (a, b) => a + (b - a) * rand();
const randint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const choice = (arr) => arr[Math.floor(rand() * arr.length)];

// A chaos time credit (the desktop's TimeCredit(x, y, chaos=True)): the beacon
// differs per value, the pickup chime is the same for all.
function chaosCredit(x, y) {
  const value = choice(CHAOS_CREDIT_VALUES);
  return { value, soundName: 'credit_chaos', beaconName: `credit_beacon_${value}`, x, y, active: true, channel: null };
}

// ------------------------------------------------------------------ the game's chaos methods
const mixin = {
  startChaos() {
    this.resetGameState();
    this.chaosMode = true;
    this.level = 1;
    this._wake(true);

    if (this.ambienceChannel) this.ambienceChannel.stop();
    if (this.beatChannel) this.beatChannel.stop();

    // One flat five minute budget for the ENTIRE run, so every run is worth the same.
    this.timeLeft = CHAOS_TIME_LIMIT;
    this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / 120.0) * 120.0;
    this.thirtySecAnnounced = false;
    this.lastBeepSecond = -1;

    // What carries across the whole chaos run. Each kind of level that shoots -
    // battles, islands and roads - keeps its own ammo. The tower is one climb, a
    // floor at a time, with health and items carried from floor to floor.
    this.chaosAmmo = { battle: ISLAND_START_AMMO, island: ISLAND_START_AMMO, drive: ISLAND_START_AMMO };
    this.chaosAmmoKind = null;
    this.ammo = ISLAND_START_AMMO;
    this.chaosTowerFloors = 0;
    this.chaosDriveCount = 0;
    this.chaosIslandCount = 0;
    this.islandCrossed = 0;
    this.towerNumber = 1;
    this.towerHeight = randint(TOWER_FLOORS_MIN, TOWER_FLOORS_MAX);
    this.towerFloor = 1;
    this.towerHp = CHAOS_HEALTH_START;
    this.towerLowWarned = false;
    this.chaosDeath = null;
    this.chaosHitGrace = 0;
    this.towerItems = 2;
    this.islandPoints = 0;
    this.chaosPoints = 0;
    this.islandShoreOrder = [];
    this.islandShoreDealt = false;
    this.guardianPlan = {};
    this.chaosNext = null;
    this.chaosPreview = null;
    this.chaosAdopt = null;
    this.chaosClimbAir = null;
    this.ambPending = {};
    // Find the Voice stages: their count, their quota so far, and their own lives.
    this.chaosFvCount = 0;
    this.chaosFvQuota = null;
    this.chaosFvLives = FV_LIVES;
    this.chaosFvPreviewStem = null;
    // Abyss stages (web 6.2.0): their count, their quota so far, and their own lives.
    this.chaosAbyssCount = 0;
    this.chaosAbyssQuota = null;
    this.chaosAbyssLives = AB_LIVES;
    // Water parks (web 7.0.0): their count, and how many attractions the last one had.
    this.chaosParkCount = 0;
    this.chaosParkSize = null;
    // Museums (web 7.2.0): their count, and the character a ride's preview chose.
    this.chaosMuseumCount = 0;
    this.chaosMuNext = null;
    this.chaosMuLast = null;
    // World stages: their count, and what carries from one to the next.
    this.chaosWorldCount = 0;
    this.chaosWorld = null;

    this.tts.speak('Chaos Mode. Five minutes.', { interrupt: true });
    this._setupChaosLevel();
  },

  // Silence and forget whatever the last level was, whichever mode it was. `keep`
  // is a Voice, or a list of them, already carrying the next level's sound: spared.
  _chaosClearEverything(keep = null) {
    // The old level's air is not cut: it fades out under the new level's. A fade
    // begun by the last call (the gap clears once, the new level once more a tenth
    // of a second later) is still spared, or the second call would stop it dead.
    const spared = (Array.isArray(keep) ? keep : [keep]).filter((k) => k);
    const fading = (this.chaosFading || []).filter((c) => c.busy);
    spared.push(...fading);
    for (const attr of ['ambienceChannel', 'beatChannel', 'battleExitChannel', 'towerStairsChannel']) {
      const ch = this[attr];
      if (ch && !spared.some((k) => k === ch)) {
        if (attr === 'ambienceChannel' || attr === 'beatChannel') {
          ch.fadeout(CHAOS_AMBIENCE_FADE * 1000);
          spared.push(ch);
          fading.push(ch);
        } else {
          ch.stop();
        }
      }
      this[attr] = null;
    }
    this.chaosFading = fading;
    // A tower floor's air is also in the tower's own registry; taken out so that
    // stopping the tower's loops below does not cut its fade short.
    if (this.towerLoops) delete this.towerLoops.ambience;
    for (const obs of this.obstacles) if (obs.channel) obs.channel.stop();
    this.obstacles = [];
    for (const pkp of this.ammoPickups) if (pkp.channel) pkp.channel.stop();
    this.ammoPickups = [];
    if (this.timeCredit && this.timeCredit.channel) this.timeCredit.channel.stop();
    this.timeCredit = null;
    this._chaosChestGone();
    // tower
    for (const holder of ['towerEnemy', 'towerItem', 'towerPotion']) {
      const obj = this[holder];
      if (obj && obj.channel) obj.channel.stop();
      this[holder] = null;
    }
    this.towerStairsActive = false;
    this._towerClearProjectiles();
    this._towerStopLoops();
    // driving
    this._driveStopLoops();
    this.driveThings = [];
    this.driveSpeed = 0.0;
    this.driveAccelerating = false;
    this.driveBand = -1;
    // island
    this._islandStopAll();
    // Find the Voice, The Abyss, and a world of Ultimate Mode
    // (6.3.7: a Find the Voice or Abyss stage's background now plays on when its exit
    // opens, so here it fades out under the next level's, as every other level's air
    // does, instead of being stopped dead by the stage's own stopAll.)
    for (const m of [this.fv, this.ab, this.pk, this.mu]) {
      const v = m && m.amb ? m.amb.voice : null;
      if (!v) continue;
      m.amb = null;
      if (spared.some((k) => k === v)) continue;
      v.fadeout(CHAOS_AMBIENCE_FADE * 1000);
      spared.push(v);
      fading.push(v);
    }
    if (this.fv) { this._fvStopAll(); this.fv = null; }
    if (this.ab) { this._abStopAll(); this.ab = null; }
    if (this.pk) { this._pkStopAll(); this.pk = null; }
    if (this.mu) { this._muStopAll(); this.mu = null; }
    if (this.ut && this.ut.chaos) this._utChaosLeave();
    this.battleExitActive = false;
    this.inWaveBreak = false;
    // And whatever any of that missed: every loop still running.
    this.audio.stopAllLoops(spared);
  },

  // The level is over. Silence it and wait a moment before the next.
  _chaosBeginGap() {
    // 5.2.0 fix: after a tower floor's stairs the floor's air is spared, and given
    // back as the level's air, so it plays on through the climb and is faded out
    // under the next level's air when that one begins (_setupChaosLevel).
    const air = this.chaosClimbAir || null;
    this.chaosClimbAir = null;
    this._chaosClearEverything(air);
    if (air) this.ambienceChannel = air;
    this.state = STATE_CHAOS_GAP;
    this.chaosGap = CHAOS_GAP_TIME;
  },

  updateChaosGap(dt) {
    if (this.isPaused || this.state !== STATE_CHAOS_GAP) return;
    // The clock waits through the silence between levels too.
    this.chaosGap -= dt;
    if (this.chaosGap <= 0) {
      const climb = this.chaosClimb;
      this.chaosClimb = null;
      if (climb) climb.fadeout(CHAOS_CLIMB_TAIL_FADE * 1000);
      this._setupChaosLevel();
    }
  },

  // Totally random, by CHAOS_STAGE_WEIGHTS. (`without`: a kind that may not come
  // next, as a world straight after an island's ride up.)
  _chaosPickNext(without = null) {
    const kinds = Object.keys(CHAOS_STAGE_WEIGHTS).filter((k) => k !== without && CHAOS_STAGE_WEIGHTS[k] > 0);
    const total = kinds.reduce((s, k) => s + CHAOS_STAGE_WEIGHTS[k], 0);
    let r = rand() * total;
    for (const k of kinds) { r -= CHAOS_STAGE_WEIGHTS[k]; if (r < 0) return k; }
    return kinds[kinds.length - 1];
  },

  // The one looping sound that says what the next level is - its drone, its drums'
  // drone, its stairwell air, its idling engine or its shore - so an elevator ride
  // can bring it in before the level begins.
  _chaosPreviewName(st) {
    if (st === WORLD) {
      // A world has no one sound to bring in ahead (it drops you anywhere in it):
      // after an island's ride up, something else comes instead.
      st = this.chaosNext = this._chaosPickNext(WORLD);
    }
    if (st === STANDARD || st === TOWER) {
      const kind = st === STANDARD ? 'lab' : 'tower';
      const idx = kind === 'lab' ? this._pickAmb('lab') : this._towerPickAmb();
      this.ambPending = this.ambPending || {};
      this.ambPending[kind] = idx;
      return kind === 'lab' ? LABYRINTH_DRONES[idx] : TOWER_DRONES[idx % TOWER_DRONES.length];
    }
    if (st === BATTLE) {
      // Never the drone already playing. (Web: the one decoded ahead, if it qualifies.)
      const n = BATTLE_DRONES.length;
      let idx = this.upcoming.battle_amb;
      if (idx === undefined || idx === this.battleAmbIdx) idx = choice([...Array(n).keys()].filter((i) => i !== this.battleAmbIdx));
      this.battleAmbIdx = idx;
      this._prepareUpcoming('battle_amb', idx);
      return BATTLE_DRONES[this.battleAmbIdx];
    }
    if (st === DRIVE) return 'engine_0';
    if (st === FINDVOICE) {
      // The background the stage will have rises through the doors.
      // The run's first Find the Voice stage always has the witch's air, the mode's
      // signature sound (Russell, 19 Nov, as the Windows game); later ones, the others.
      const stem = this.chaosFvCount === 0 && this.audio.has(FV_FIRST_BACKGROUND)
        ? FV_FIRST_BACKGROUND : this._fvNextBackground();
      this.chaosFvPreviewStem = stem;
      return stem ? aliasRecording(this.audio, stem, `event_amb_file_${stem}`) : null;
    }
    if (st === ABYSS) return aliasRecording(this.audio, AB_BACKGROUND, `event_amb_file_${AB_BACKGROUND}`);
    if (st === PARK) return this.audio.has(PK_BACKGROUND) ? PK_BACKGROUND : null;
    if (st === MUSEUM) {
      // The museum's character is chosen now, so their world rises through the doors.
      const ch = this._muPickCharacter(this.chaosMuLast || null);
      const stem = museumStem(ch);
      this.chaosMuNext = { ch, stem };
      return stem ? aliasRecording(this.audio, stem, `event_amb_file_${stem}`) : null;
    }
    this.islandShore = this._islandNextShore();
    this.islandShoreDealt = true;
    return this.islandShore;
  },

  _setupChaosLevel() {
    // A sound the elevator has already faded in for this level, if any.
    const preview = this.chaosPreview || null;
    let keep = null; let keepM = null;
    if (preview) {
      const amb = this.islandAmb || {};
      keep = amb.surface || null;
      amb.surface = null;
      // A shore's muffled twin, started in step with it, is kept too when the next
      // level is an island, so its ride down still crossfades cleanly.
      if (this.chaosNext === ISLAND && keep) {
        keepM = amb.muffled || null;
        amb.muffled = null;
      }
      this.chaosPreview = null;
    }
    this._chaosClearEverything([keep, keepM]);
    if (keep) keep.setVolume(0.8);

    // Totally random, from every kind of level - unless the ride up chose already.
    this.state = this.chaosNext || this._chaosPickNext();
    this._syncRoom();
    this.chaosNext = null;
    // Each shooting mode's own ammo: put away what the last one had left, and take
    // out this one's.
    const pools = this.chaosAmmo;
    if (pools) {
      const prev = this.chaosAmmoKind;
      if (prev) pools[prev] = this.ammo;
      const kind = { [BATTLE]: 'battle', [ISLAND]: 'island', [DRIVE]: 'drive' }[this.state] || null;
      this.chaosAmmoKind = kind;
      if (kind) this.ammo = pools[kind];
    }
    this.chaosAdopt = keep ? [preview, keep, keepM] : null;
    // (The desktop lets go of the previewed drone's muffled copy here; the web's
    // copies come in the sound packs and are let go by the audio engine itself.)
    this.playerPos = [0.0, 0.0];
    this.playerFacing = [0, -1];
    if (this.state === TOWER) { this._chaosSetupTower(); return; }
    if (this.state === DRIVE) { this._chaosSetupDrive(); return; }
    if (this.state === ISLAND) { this._chaosSetupIsland(); return; }
    if (this.state === FINDVOICE) { this._chaosSetupFindVoice(); return; }
    if (this.state === ABYSS) { this._chaosSetupAbyss(); return; }
    if (this.state === PARK) { this._chaosSetupPark(); return; }
    if (this.state === MUSEUM) { this._chaosSetupMuseum(); return; }
    if (this.state === WORLD) { this._chaosSetupWorld(); return; }
    if (this.state === BATTLE) {
      this.battleLevel += 1;
      this.arenaLimit = 40.0;
    } else {
      this.labyrinthLevel += 1;
    }

    const adopt = this.chaosAdopt;
    this.chaosAdopt = null;
    if (this.state === STANDARD) {
      const ambIdx = this._pickAmb('lab');
      if (adopt && adopt[0] === LABYRINTH_DRONES[ambIdx]) {
        this.ambienceChannel = adopt[1];     // already playing, faded in by the ride
      } else {
        this.ambienceChannel = this.audio.play(LABYRINTH_DRONES[ambIdx], { loops: -1, volume: 0.8, fadeMs: CHAOS_AMBIENCE_FADE * 1000 });
      }
      // Chaos is played by ear: no level announcement. The new drone says it.
      this.generateLabyrinth(false);
    } else {
      // Drums and drone picked independently.
      this._battleSwapBeat(CHAOS_AMBIENCE_FADE);
      if (adopt && adopt[0] === BATTLE_DRONES[this.battleAmbIdx]) {
        this.ambienceChannel = adopt[1];     // the drone the ride brought in
      } else {
        this._battleSwapAmb(CHAOS_AMBIENCE_FADE);
      }
      // Ammo deliberately NOT reset here: battles keep their own ammo across the run.
      this.kills = 0;
      this.spawnedEnemies = 0;
      this.ammoSpawns = 0;
      this.battleExitActive = false;
      this.inWaveBreak = false;
      this.waveBreakTimer = 0.0;
    }
  },

  // A chaos tower level is one floor of the run's single ongoing climb.
  _chaosSetupTower() {
    this.chaosTowerFloors += 1;
    this.arenaLimit = 35.0;
    this._setupTowerFloor();
    if (rand() < CHAOS_CREDIT_TOWER) {
      const a = this.arenaLimit;
      let cx = null; let cy = null;
      for (let i = 0; i < 200; i++) {
        const tx = uniform(-a * 0.95, a * 0.95);
        const ty = uniform(-a * 0.95, a * 0.95);
        if (Math.hypot(tx - this.playerPos[0], ty - this.playerPos[1]) >= 15.0) { cx = tx; cy = ty; break; }
      }
      if (cx !== null) {
        this.timeCredit = chaosCredit(cx, cy);
        // Registered with the tower's loops so it stops with the floor.
        this.timeCredit.channel = this._towerLoop('credit', this.timeCredit.beaconName);
      }
    }
  },

  // A chaos driving level: shoot the quota, then drive through the exit.
  _chaosSetupDrive() {
    this.chaosDriveCount += 1;
    const k = this.chaosDriveCount;
    this.driveLane = Math.floor(DRIVE_LANES / 2);
    this.driveSpeed = 0.0;
    this.driveDist = 0.0;
    this.driveTravelled = 0.0;
    this._driveResetFeatures();
    // Each driving level starts further into the road's difficulty ramp.
    this.driveElapsed = CHAOS_DRIVE_RAMP_STEP * (k - 1);
    this.driveThings = [];
    this.driveKills = 0;
    this.chaosDriveExitSeen = false;
    this.driveBand = -1;
    this.driveLoops = {};
    const adopt = this.chaosAdopt;
    this.chaosAdopt = null;
    if (adopt && adopt[0] === 'engine_0') {
      // The idling engine the ride faded in gives way, over the engine's own blend
      // time, to the same idle started properly on the road. The same sound, so it
      // is not heard as a change.
      adopt[1].fadeout(DRIVE_ENGINE_BLEND);
    }
    this.driveAccelerating = false;
    // A finger (or up arrow) still held from the road before keeps accelerating.
    this.driveUpHeld = !!(this.gestures && this.gestures.accelHeld);
    this.driveSpawnAt = 40.0;
    this.driveGrace = 3.0;
    this.drivePendingItem = null;
    this.driveSwerve = 0.0;
    // Chaos roads carry chaos credits - rarer than driving mode's and worth more.
    this.driveNextCredit = this.driveDist + CHAOS_CREDIT_ROAD_GAP * uniform(0.6, 1.4);
    this.chaosDriveQuota = CHAOS_DRIVE_QUOTA_BASE + k;
    this._driveEngine();
  },

  // Once the quota is shot, an exit waits on the road: the Morse signal of the
  // battle exits, in a lane with nothing coming at you. Miss it and another comes.
  _chaosDriveExitCheck() {
    if (this.driveKills < this.chaosDriveQuota) return;
    if (this.driveThings.some((t) => t.kind === 'exit')) return;
    // Not while any car is still on the road, either kind: whatever is left has to
    // be passed, dodged or shot first.
    if (this.driveThings.some((t) => t.kind === 'car')) return;
    const lane = this._driveItemLane();
    if (lane === null) return;
    this.driveThings.push(new RoadThing('exit', lane, this.driveDist + DRIVE_HORIZON * 0.9));
    // From here the clock waits (see _chaosExitOpen), even if this exit is missed
    // and the next one has to come along.
    this.chaosDriveExitSeen = true;
  },

  // A chaos island level: one full island - clear it, find its key on the seabed,
  // and ride the elevator up.
  _chaosSetupIsland() {
    this.chaosIslandCount += 1;
    this.islandNumber = this.chaosIslandCount;
    if (this.islandCrossed === undefined) this.islandCrossed = 0;
    this.islandDeath = '';
    this.islandRide = null;
    this.islandItems = [];
    this.islandCarryingDiver = false;
    if (!this.islandShoreOrder) this.islandShoreOrder = [];
    const adopt = this.chaosAdopt;
    this.chaosAdopt = null;
    // Web: the ride is a long recording, decoded ahead (as startIsland does).
    this.audio.prepare('elevator_ride');
    this.islandAmb = { under: this.audio.play('underwater', { loops: -1, volume: 0.0 }) };
    if (adopt && adopt[0] === this.islandShore) {
      // This island's shore came in with the ride, with its muffled twin in step
      // beside it; both carry straight on.
      this.islandAmb.surface = adopt[1];
      let twin = adopt.length > 2 ? adopt[2] : null;
      if (!twin) twin = this.audio.play(this._islandMuffled(this.islandShore), { loops: -1, volume: 0.0 });
      this.islandAmb.muffled = twin;
    } else {
      // The ride's preview already dealt this island its shore; only draw a new one
      // if there was no preview at all.
      if (!this.islandShoreDealt) this.islandShore = this._islandNextShore();
      this._islandPlayShore(this.islandShore, ISLAND_SURFACE_VOLUME, CHAOS_AMBIENCE_FADE * 1000);
    }
    this.islandShoreDealt = false;
    this._islandNewIsland();
  },

  // A Find the Voice stage (findvoice.js): its quota, its lives (the run's own
  // three), its creature as fast as this many stages make it.
  _chaosSetupFindVoice() {
    this.chaosFvCount += 1;
    this.chaosFvQuota = this.chaosFvQuota === null || this.chaosFvQuota === undefined
      ? randint(CHAOS_FV_QUOTA_FIRST[0], CHAOS_FV_QUOTA_FIRST[1])
      : Math.min(CHAOS_FV_QUOTA_MAX, this.chaosFvQuota + CHAOS_FV_QUOTA_GROW);
    const adopt = this.chaosAdopt;
    this.chaosAdopt = null;
    const stem = this.chaosFvPreviewStem
      || (this.chaosFvCount === 1 && this.audio.has(FV_FIRST_BACKGROUND) ? FV_FIRST_BACKGROUND : null);
    this.chaosFvPreviewStem = null;
    this._fvBegin({ chaos: true, level: this.chaosFvCount, quota: this.chaosFvQuota, lives: this.chaosFvLives,
      background: stem, adopt: adopt && adopt[1] ? adopt[1] : null });
  },

  // An Abyss stage (abyss.js): its quota of cases, its lives (the run's own three).
  // Lightning strikes the moment it begins.
  _chaosSetupAbyss() {
    this.chaosAbyssCount += 1;
    this.chaosAbyssQuota = this.chaosAbyssQuota === null || this.chaosAbyssQuota === undefined
      ? randint(AB_CHAOS_QUOTA_FIRST[0], AB_CHAOS_QUOTA_FIRST[1])
      : Math.min(AB_CHAOS_QUOTA_MAX, this.chaosAbyssQuota + AB_CHAOS_QUOTA_GROW);
    const adopt = this.chaosAdopt;
    this.chaosAdopt = null;
    this._abBegin({ chaos: true, quota: this.chaosAbyssQuota, lives: this.chaosAbyssLives,
      adopt: adopt && adopt[1] ? adopt[1] : null });
  },

  // A water park (park.js, web 7.0.0): one park, three attractions the first time in a
  // run and one more each time, at most six; its attractions as hard as this many
  // parks make them. Each token is fifteen seconds on the chaos clock.
  _chaosSetupPark() {
    this.chaosParkCount += 1;
    this.chaosParkSize = this.chaosParkSize === null || this.chaosParkSize === undefined
      ? PK_CHAOS_FIRST : Math.min(PK_CHAOS_MAX, this.chaosParkSize + PK_CHAOS_GROW);
    const adopt = this.chaosAdopt;
    this.chaosAdopt = null;
    this.pk = null;
    this._pkBegin({ chaos: true, park: this.chaosParkCount, count: this.chaosParkSize,
      adopt: adopt && adopt[1] ? adopt[1] : null });
  },

  // A museum (museum.js, web 7.2.0): one museum, three memories the first time in a run
  // and one more each time, at most eight; its pools and creatures as this many museums
  // make them. A memory puts no time on the chaos clock (7.2.15; it was twenty seconds,
  // a fiery one thirty).
  _chaosSetupMuseum() {
    this.chaosMuseumCount += 1;
    const adopt = this.chaosAdopt;
    this.chaosAdopt = null;
    const next = this.chaosMuNext;
    this.chaosMuNext = null;
    this.mu = null;
    const k = this.chaosMuseumCount;
    this._muBegin({ chaos: true, museum: k, count: museumMemoriesFor(k), ch: next ? next.ch : null, stem: next ? next.stem : null,
      adopt: adopt && adopt[1] ? adopt[1] : null });
    if (this.mu && this.mu.ch) this.chaosMuLast = this.mu.ch.id;
  },

  // A world stage (ultimate.js _utChaosStart): a random world, for its own length.
  _chaosSetupWorld() {
    this.chaosWorldCount += 1;
    this.chaosAdopt = null;
    this._utChaosStart();
  },

  // next_level's chaos part (game.js's nextLevel has already counted the level).
  _chaosNextLevel() {
    // Ten points for any finished level that is not an island; islands pay their
    // own points as they are played.
    // (A world stage pays as Ultimate Mode does, as it is played: nothing for its end.)
    if (this.state !== ISLAND && this.state !== WORLD) this.chaosPoints += CHAOS_POINTS_LEVEL;
    // Every finished level, of every kind, gives ten health, up to CHAOS_HEALTH_MAX.
    this.towerHp = Math.min(CHAOS_HEALTH_MAX, this.towerHp + CHAOS_HEALTH_LEVEL);
    this._chaosLowCheck();
    // Timer is NOT reset - it keeps counting down across the whole run.
    if (this.chaosPreview) {
      // The elevator ride up out of an island has already faded the next level's
      // sound in: the ride was the pause. Straight on.
      this._setupChaosLevel();
    } else {
      this._chaosBeginGap();
    }
  },

  // ---------------------------------------------------------------- the shared health
  // Something hurt you: it comes off the run's one health bar. True if that ended
  // the run (`why`: 'hit', 'catch', 'drown', 'crash', for the closing words).
  _chaosHitDamage() { return CHAOS_HIT; },
  _chaosCrashDamage() { return CHAOS_CRASH; },
  _chaosCatchDamage() { return CHAOS_CATCH; },

  _chaosHurt(n, why) {
    this.towerHp = Math.max(0, Math.round(this.towerHp - n));
    this.chaosHitGrace = CHAOS_HIT_GRACE;
    if (this.towerHp <= 0) {
      this.chaosDeath = why;
      this.triggerGameOver();
      return true;
    }
    this._chaosLowCheck();
    return false;
  },

  // The low-health warning, once each time health falls to CHAOS_LOW (or the
  // tower's own, higher, line on a tower floor): the three falling notes and the
  // voice saying how much is left. Healed above it, it can warn again.
  _chaosLowCheck(low = CHAOS_LOW) {
    if (this.towerHp > low) { this.towerLowWarned = false; return; }
    if (this.towerLowWarned) return;
    this.towerLowWarned = true;
    this.audio.play('health_low', { keep: true });
    this.tts.speak(`Health low. ${this.towerHp}.`, { interrupt: true });
  },

  // In chaos, is this level won, with only its exit to come or to reach? From then
  // on no credit appears. A battle once its Morse exit sounds; a road once its quota
  // is shot; a tower floor once its stairs appear.
  _chaosLevelWon() {
    if (!this.chaosMode) return false;
    if (this.state === DRIVE) return this.driveKills >= (this.chaosDriveQuota ?? Infinity);
    return this._chaosExitOpen();
  },

  // In chaos, has this level been won with only its exit left to reach? A
  // labyrinth never: there the exit is the whole level. An island's rides already
  // stop the clock.
  _chaosExitOpen() {
    if (!this.chaosMode) return false;
    const st = this.state;
    if (st === BATTLE) return !!this.battleExitActive;
    if (st === TOWER) return !!this.towerStairsActive;
    if (st === DRIVE) return !!this.chaosDriveExitSeen;
    if (st === FINDVOICE) return !!(this.fv && this.fv.exit);
    if (st === ABYSS) return !!(this.ab && this.ab.exit);
    if (st === PARK) return !!(this.pk && this.pk.exit);
    if (st === MUSEUM) return !!(this.mu && this.mu.door);
    return false;
  },

  // ---------------------------------------------------------------- the treasure chest
  // The open exit's position, on a level a chest can lie on; otherwise null.
  _chaosExitPos() {
    const st = this.state;
    if (st === BATTLE) return this.battleExitActive ? this.exitPos : null;
    if (st === TOWER) return this.towerStairsActive ? this.towerStairsPos : null;
    if (st === FINDVOICE) return this.fv && this.fv.exit ? this.fv.exit.pos : null;
    if (st === ABYSS) return this.ab && this.ab.exit ? this.ab.exit.pos : null;
    if (st === PARK) return this.pk && this.pk.exit ? this.pk.exit.pos : null;
    if (st === MUSEUM) return this.mu && this.mu.door ? this.mu.door.pos : null;
    return null;
  },

  // Every frame the exit is open (from _advanceTimer): once a level, perhaps a chest;
  // then its chime, and opening it when you reach it.
  _chaosChestUpdate() {
    if (!this.chaosMode) return;
    if (!this.chaosChestRolled) {
      const exit = this._chaosExitPos();
      if (!exit) return;
      this.chaosChestRolled = true;
      // (Tests that count every second and point turn chests off: window.__elNoChests.)
      const off = typeof window !== 'undefined' && window.__elNoChests;
      if (!off && rand() < CHAOS_CHEST_CHANCE) this._chaosChestPlace(exit);
    }
    const c = this.chaosChest;
    if (!c) return;
    const [l, r, d] = this._chaosCreditLevels(c.pos);
    if (c.channel) c.channel.setVolume(l, r, this._behind(c.pos));
    if (d < CHAOS_CHEST_REACH) this._chaosChestOpen();
  },

  _chaosChestPlace(exit, force = false) {
    const p = this.playerPos;
    const dx = p[0] - exit[0]; const dy = p[1] - exit[1]; const d = Math.hypot(dx, dy);
    if (d < CHAOS_CHEST_FROM_EXIT + 1.0 && !force) return false;       // you are at the exit already
    const u = d > 0.01 ? [dx / d, dy / d] : [0, 1];
    let pos = [exit[0] + u[0] * CHAOS_CHEST_FROM_EXIT, exit[1] + u[1] * CHAOS_CHEST_FROM_EXIT];
    if (this.state === MUSEUM && this._muOutOfPools) { pos = this._muOutOfPools(pos); if (!pos) return false; }
    const beacon = CHAOS_CHEST_BEACONS.find((n) => this.audio.has(n));
    this.chaosChest = { pos, channel: beacon ? this.audio.play(beacon, { loops: -1, volume: 0.0 }) : null };
    return true;
  },

  _chaosChestGone() {
    if (this.chaosChest && this.chaosChest.channel) this.chaosChest.channel.stop();
    this.chaosChest = null;
    this.chaosChestRolled = false;
  },

  _chaosChestOpen() {
    const c = this.chaosChest;
    if (c && c.channel) c.channel.stop();
    this.chaosChest = null;
    const open = aliasRecording(this.audio, 'evt_chest_open', 'event_sfx_file_evt_chest_open') || (this.audio.has('treasure_pickup') ? 'treasure_pickup' : null);
    if (open) this.audio.play(open, { keep: true });
    const kinds = ['time', 'points'];
    if (this.towerHp < CHAOS_HEALTH_MAX) kinds.push('health');
    const take = kinds.sort(() => rand() - 0.5).slice(0, 2);
    const words = [];
    for (const k of ['time', 'health', 'points']) {
      if (!take.includes(k)) continue;
      if (k === 'time') {
        this.timeLeft += CHAOS_CHEST_TIME;
        this.thirtySecAnnounced = this.timeLeft <= 30.0;
        const step = this._announceStep();
        this.nextAnnounceTime = Math.floor((this.timeLeft - 1) / step) * step;
        this.lastBeepSecond = -1;
        words.push(`${CHAOS_CHEST_TIME} more seconds`);
      } else if (k === 'health') {
        const got = Math.min(CHAOS_CHEST_HEALTH, CHAOS_HEALTH_MAX - this.towerHp);
        this.towerHp += got;
        this._chaosLowCheck();
        words.push(`${got} health`);
      } else {
        this.chaosPoints = (this.chaosPoints || 0) + CHAOS_CHEST_POINTS;
        words.push(`${CHAOS_CHEST_POINTS} points`);
      }
    }
    this.chaosChests = (this.chaosChests || 0) + 1;
    const said = words.join(' and ');
    this.tts.speak(`${said[0].toUpperCase()}${said.slice(1)}.`, { interrupt: true });
  },

  // Stereo levels for a chaos credit: heard from anywhere in the room, louder as
  // you close, never fully silent.
  _chaosCreditLevels(pos) {
    const dx = pos[0] - this.playerPos[0];
    const dy = pos[1] - this.playerPos[1];
    const dist = Math.hypot(dx, dy);
    const pan = dist > 0 ? dx / dist : 0.0;
    const vol = Math.max(CHAOS_CREDIT_FLOOR, 1.0 - dist / 45.0);
    return [vol * (1.0 - Math.max(0.0, pan)), vol * (1.0 - Math.max(0.0, -pan)), dist];
  },
};

// ------------------------------------------------------------------ help
// The desktop's two chaos sections, word for word, with the keys turned into
// gestures (T, a keyboard key, is kept as a keyboard's).
const HELP_SECTIONS = [
  ["Chaos Mode", [
    { title: "Chaos Mode", sound: null, desc: "Chaos mode is every mode at once, and the hardest one in the game. Each level is chosen at random from ten kinds: a labyrinth, a battle, one floor of a tower, a stretch of road, an island, a Find the Voice room, an abyss, a water park, a museum, or, rarest of all, a world of Ultimate Mode. Nothing ever tells you which one you are in. You work it out from what you hear, the labyrinth's drone, the battle drums, the tower's thin stairwell air, your engine, the shore, the guide calling, the lightning of an abyss, which strikes the moment you arrive, the busy pool and children of a water park, a character introducing themselves over their own world in a museum, or a world's many places, and then you play it by that mode's rules. Finish a level and the next one begins at once, its air fading in over the old one; after a tower floor's stairs it waits until the climb is over and half a second more, with the floor's air still playing. That silence is the mark of a change of place: the stairs, an exit, a road's exit, and then quiet, and then somewhere new. The one exception is leaving an island: the elevator ride itself carries you across, and the next level's sound rises through its doors. Your score is points. Every level you finish that is not an island or a world is worth ten. Islands are worth the most: everything island mode pays for enemies, guardians, treasure and rescued divers, plus one hundred for finishing the island. A world pays as Ultimate Mode does, while you play it. There are no level numbers anywhere in chaos, only points, and when the run ends you hear your points. In the first five kinds of level the clock is the only thing that speaks, apart from the Low air warning on a seabed, which is kept because your air runs out there just as it does in island mode; a Find the Voice room, an abyss, a water park, a museum and a world speak as those modes do. The walking levels of chaos, its labyrinths, battles, tower floors, islands, Find the Voice rooms, abysses, water parks, museums and worlds, turn with you exactly as those modes do on their own: flick left or right to turn, swipe up to walk the way you face, and your facing carries from one walking level to the next. A road does not turn: there north is always ahead, as in driving mode, and the level after a road begins facing north." },
    { title: "Chaos Health", sound: null, desc: "In chaos mode you have one health bar for the whole run, starting at 100. Every level you finish, of any kind, gives you 10 more, up to 150 at most: no reward ever takes you past 150. Now and then, when a level's exit opens, a treasure chest lies a couple of steps from the exit, on your way to it, heard by its sparkling chime, in a battle, a tower floor, a Find the Voice room, an abyss, a water park or a museum: walk onto it to open it, for two of 30 more seconds, 25 health and 50 points. At 150 health it gives no health. Leave the level without it and it is gone. Everything that hurts you takes from it. In a battle or on an island, an enemy that reaches you costs 25 health and is gone, and the crowd of a battle groans; on an island the guardian's hit costs 40, and then it falls back for a few seconds. Run out of shots while it stands and it comes for you, but slower than you can run, so dash for the elevator: it will take you down to the seabed for more shots. If the seabed has none left, the guardian throws a cartridge somewhere on the island, with just the shots to finish it, and you have to reach it first. On a seabed, once your air runs out, you lose 10 health every second until you reach air again. A crash on a road costs 20 health as well as thirty seconds. In a Find the Voice room or an abyss, a creature catching you costs 25. In a museum a creature only knocks you toward a pool, and a fall into a bottomless pool costs 50 health: you are pulled out, set down a couple of steps from it facing away, and for a few seconds no creature can reach you; with 50 or less left, the fall ends the run. A tower's throws and a world's dangers take what they always take. A tower's health potion, or a world's rare full heal, brings you back to 100 if you are below it, and other rewards simply add, up to 150. When your health first falls to 35 or less, you hear three quick falling notes and the voice says Health low and how much you have left; heal above it and it can warn you again. When it reaches nothing, the run is over. Every double tap tells you your health." },
    { title: "Chaos Time Limit", sound: null, desc: "You get exactly five minutes for the whole run. Not a range, the same five minutes every time, so one run is worth comparing to another. The clock never resets between levels, so survive as many as you can before it runs out. Remaining time is announced every two minutes, and every double tap tells you it, just before your points, or on a keyboard you can press T at any point to check it. The clock stops for the moment of silence between levels and for every elevator ride on an island level. It also stops once a level is won and only its exit is left: from the moment a battle's Morse exit sounds, a road's exit comes into hearing, a tower floor's stairs appear, or the exit of a Find the Voice room, an abyss or a water park, or a museum's door, sounds, until you reach it. In a world of Ultimate Mode the clock runs all the time. A credit already lying in that level stays where it is, its beacon still sounding, and you can still take it for its time; so does a cartridge already out in a battle. No new credit or cartridge appears once the level is won. A labyrinth's clock never stops, because there the exit is the whole level." },
    { title: "Chaos Ammo", sound: null, desc: "In chaos mode, each kind of level that shoots keeps its own ammo: battles, islands and roads each have their own inventory, starting at eight shots, and the worlds of Ultimate Mode have theirs (see Chaos Worlds). Shots you have left at the end of a battle wait for you in the next battle, and the same for islands and for roads. Ammo you collect in one kind of level is never added to another, and you never spend one kind's shots in another. A double tap, in each kind of level, tells you that level's own count. Tower floors use items, not ammo, and keep their own stock as well. A Find the Voice room, an abyss, a water park and a museum have nothing to shoot." },
    { title: "Chaos Battles", sound: null, desc: "A battle inside chaos mode is a level, and that makes it a different game from standard battle mode. It has a fixed number of enemies to eliminate, ammo keeps appearing on the floor while you fight, and once the last enemy is down a Morse code exit appears which you walk to in order to advance the run. There are no waves and no breaks here. Standard battle mode has none of that: no levels, no exit, and ammo only between waves. What the two share is the aiming, the sounds and the endless scaling, and the way enemies come: in turns, never all at once, with the clock waiting whenever none is after you. How many may be after you at once grows with the battles you have played in that run: one at a time in your first three battles, two in the next three, then three, and from the tenth battle four, the most there will ever be. Battles keep their own ammo for the whole chaos run, separate from islands and roads: shots you save in one battle are waiting for you in the next, and they are never used up or added to by any other kind of level. Save them. The arena crowd is there too, as in battle mode: it roars when you shoot an enemy down, and here, since an enemy that reaches you costs health rather than the run (see Chaos Health), it groans when one does." },
    { title: "Chaos Battle Exit", sound: null, desc: "After eliminating every enemy in a chaos battle, find the exit to advance. Once it appears the round is over and your laser is disabled, so just head for it. A Morse code signal is the only thing marking it, and it carries everything you need: it pans left and right for the bearing and grows steadily louder as you close. There is no locating beep on top of it, because the room already has drums, ambience and everything the level made, and a second voice describing the same doorway would be one more thing to listen past." },
    { title: "Chaos Tower Floors", sound: null, desc: "A tower level in chaos is a single floor. Bring the rival down, climb the stairs, and you are sent to another level. The tower is one climb that runs through the whole chaos run: the next time a tower comes up you are on the next floor, and your health and items are exactly what you left with, however many other levels came between. Reaching the top of a tower still hands you its bonus items. Your health there is the chaos run's one health bar (see Chaos Health), and a health potion brings it back to 100 if it is below. If it runs out, the run is over." },
    { title: "Chaos Driving", sound: null, desc: "A driving level in chaos is a stretch of road with a job to do: shoot a certain number of the cars running your way. The game decides how many, three on your first road and one more on every road after, and it never tells you. When you have shot enough, no more cars come onto the road, and once every car still on it has been passed or shot, the battle exit's Morse signal appears in an empty road, so nothing can crash into you on the way to it. Drive through it and you are on to the next level. Miss it and another one comes along further on. Crashing costs thirty seconds off the chaos clock, exactly as it does in driving mode, and 20 health as well (see Chaos Health); each road starts harder than the last." },
    { title: "Chaos Islands", sound: null, desc: "An island level in chaos is one full island by island mode's rules: clear it, find its key on the seabed, and ride the elevator up from the seabed to leave it. The ride up is the transition: whatever comes next, its own sound rises through the elevator doors as you climb, a labyrinth's drone, a battle's drone, a tower's stairwell air, an idling engine or another island's shore, muffled first and then opening up with the doors. There is no pause after an island; when the doors open, you are already in the next level. Reinforcements, air, vents, treasure, trapped divers and guardians all work exactly as they do in island mode, and every island in a chaos run is harder than the last one. Drowning, or an enemy or guardian reaching you, ends the run. The chaos clock stops while you are riding an elevator, down or up, so a ride never costs you time. On the seabed two countdowns can run at once, and they never sound alike: your air beeps high over its last ten seconds, once a second at first and then faster and faster, and the chaos clock beeps low over its last fifteen." },
    { title: "Chaos Worlds", sound: null, desc: "The rarest kind of chaos level is a whole world of Ultimate Mode, chosen at random. You are dropped into it with nothing said, as in that mode, and it lasts as long as that world would, two to five minutes, until its countdown ends; then the next level begins at once. Everything in it works as it does in Ultimate Mode, its enemies, buses, water parks, safe zones and their characters included, and it pays points as Ultimate Mode does, toward your chaos points, with the multiplier rising by a half for every world you have come through in the run. Your health there is the chaos run's one health bar (see Chaos Health): the world starts with what you have, and what is left goes on with you. Your shots and tower items there are the worlds' own, apart from the ammo of battles, islands and roads: what you have left at the end of one world waits for you in the next. Its time credits are all in glass cases, two or three of them, each holding forty, fifty or sixty seconds for the chaos clock; smashing one brings chasers, as in Ultimate Mode. Everything that scores points there puts time on the chaos clock too: twenty seconds for a chaser shot down, thirty for a thrower, ten for ammo or a potion picked up, and thirty for a chest's points; as with the points, nothing in a safe zone or while the compass holds the world frozen. A ride down a water slide adds time to the chaos clock the moment you splash into the pool: thirty seconds for the first ride in a world, five seconds less for each ride after it, and never less than ten, counting every slide in that world together, and a character's rare gift of two more minutes in the world adds three and a half minutes to the chaos clock as well. The chaos clock runs all through a world, and if it runs out, or your health does, the run is over. Double tap for your health, your shots, your tower items, the seconds left on the clock, your points and the way you are facing." },
    { title: "Chaos Credits", sound: null, desc: "Time credits are worth exactly forty, fifty or sixty seconds, and the spinning beacon tells you which before you chase it: the higher the pitch and the faster the spin, the bigger the bonus. Collecting any of them plays the same shower of coins. They can turn up in the first five kinds of level, about half of them: a labyrinth or a tower floor has one about one time in two, a battle a little more often, about six times in ten, and a road one about every two thousand metres, in a lane with nothing coming at you, so drive into its lane as you reach it. An island has one lying on it about one time in two, and each island's seabed has about a one in three chance of one, decided at your first dive there. A credit can always be heard, getting louder as you close in, so when you hear one, it is there to be found and worth going for. Once a level is won and its exit is all that is left, no new credit appears: a battle once its exit sounds, a road once its quota is shot, a tower floor once its stairs appear. A Find the Voice room has no credits; in an abyss the time is in its glass cases (see The Abyss in Chaos Mode), in a water park in its tokens (see Water Park in Chaos Mode), in a museum in its memories (see The Museum in Chaos Mode), and in a world every credit is in a glass case (see Chaos Worlds)." },
    { title: "Chaos Scaling", sound: null, desc: "Every kind of level gets harder on its own count, never on how far into the run you are. Your third battle is as hard as a third battle however many other levels came between, a labyrinth is sized by how many labyrinths you have solved, and so on for towers, roads, islands, Find the Voice rooms, abysses, water parks (each water park has one more attraction than the one before, up to six, and its attractions are as hard as that many parks make them) and museums (each one has one more memory than the one before, up to eight, with more pools and creatures); a world's enemies grow with the minutes you have played in worlds. Each kind of level that shoots keeps its own ammo: battles, roads and islands each have a supply that waits for you and all add to it." },
  ]],
];

const HELP_DEMOS = [
  ["Demos, Chaos Mode", [
    { title: "Chaos Demos", sound: null, desc: "The sounds that belong to chaos mode alone. Everything else it uses comes from the standard and battle demo sections." },
    { title: "Battle Exit, Morse Code", sound: "exit_morse", desc: "The Morse signal marking the exit of a chaos battle. Standard battle mode has no exit and never plays this." },
    { title: "Chaos Credit Collected", sound: "credit_chaos", desc: "A shower of coins, the same for every chaos credit whatever it is worth." },
    { title: "Chaos Credit Beacons", sound: "credit_beacon_scale_demo", desc: "All three beacons in order: forty seconds, then fifty and sixty. Higher and faster is worth more." },
  ]],
];

// ------------------------------------------------------------------ the mode
export default {
  menu: [{ key: 'chaos', label: 'Chaos Mode', select: (game) => game.startChaos() }],
  // The silence between two levels; every other state of a chaos run is a mode's own.
  playStates: [STATE_CHAOS_GAP],
  // The moment between two levels keeps the way you face (web 5.0.0): only a road resets it to north.
  keepFacing(game) { return game.state === STATE_CHAOS_GAP; },
  mixin,

  init(game) {
    if (game.chaosMode === undefined) game.chaosMode = false;
    game.chaosPoints = 0;
    game.chaosFading = [];
  },

  // The desktop's reset_game_state lines for chaos.
  reset(game) {
    game.chaosClimb = null;      // a chaos tower floor's climb still playing out
    game.chaosDriveExitSeen = false;
    // Nothing a chaos ride chose outlives its run.
    for (const ch of game.chaosFading || []) ch.stop();
    game.chaosFading = [];
    game.chaosPreview = null;
    game.chaosNext = null;
    game.chaosAdopt = null;
    game.chaosMuNext = null;
    game.ambPending = {};
    if (game.battleExitChannel) game.battleExitChannel.stop();
    game.battleExitChannel = null;
    game.battleExitActive = false;
    game.ammoSpawns = 0;
    game.chaosMode = false;
    // Chaos mode advances each level TYPE on its own counter.
    game.labyrinthLevel = 0;
    game.battleLevel = 0;
  },

  // The run as a whole is chaos's while chaosMode is on: finish and status.
  ownsRun(game) { return !!game.chaosMode; },

  update(game, dt) { if (game.state === STATE_CHAOS_GAP) game.updateChaosGap(dt); },

  // Between levels there is nothing to act on; T still answers.
  input(game, g) {
    if (g === 'clock') {
      const secs = Math.trunc(game.timeLeft);
      game.tts.speak(`${secs} second${secs === 1 ? '' : 's'} remaining.`, { interrupt: true });
    }
  },

  stopAll(game) {
    if (game.battleExitChannel) game.battleExitChannel.stop();
    game.battleExitChannel = null;
    game.battleExitActive = false;
    for (const ch of game.chaosFading || []) ch.stop();
    game.chaosFading = [];
    game.chaosPreview = null;
    game.chaosAdopt = null;
  },

  // The desktop's trigger_game_over for a chaos run, whichever level it ended in.
  finish(game, state) {
    const score = (game.chaosPoints || 0) + (game.islandPoints || 0);
    let opener;
    if (game.timeLeft <= 0) opener = 'Time up.';
    else if (game.chaosDeath === 'drown' || (state === ISLAND && game.islandDeath === 'drown')) opener = 'You drowned.';
    else if (game.chaosDeath === 'catch') opener = 'Caught.';
    else if (game.chaosDeath === 'pool') opener = 'You fell into a bottomless pool.';
    else if (game.towerHp <= 0) opener = 'Out of health.';
    else opener = 'Game Over.';
    return { key: 'chaos', score, message: `${opener} You scored ${score} points. ` };
  },

  // The gap has no room echo (the desktop's _current_room is None there).
  room() { return null; },
  gestureMode() { return 'run'; },

  // Chaos never says which kind of level this is, on screen either, and has no
  // level numbers: only points.
  status(game) { return `Chaos Mode - ${(game.chaosPoints || 0) + (game.islandPoints || 0)} points`; },

  boards: [{ key: 'chaos', label: 'Chaos Mode', fmt: (v) => `${v} ${v === 1 ? 'point' : 'points'}` }],

  help: { sections: HELP_SECTIONS, demos: HELP_DEMOS },
};
