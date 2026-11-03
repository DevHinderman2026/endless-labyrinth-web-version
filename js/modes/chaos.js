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

// ------------------------------------------------------------------ constants
// Driving: the quota of cars to shoot is BASE plus one per driving level so far, and
// the road starts that many RAMP_STEP seconds further into its difficulty ramp.
const CHAOS_DRIVE_QUOTA_BASE = 2;
const CHAOS_DRIVE_RAMP_STEP = 30.0;
// Every level completed that is not an island is worth ten. Islands are worth the
// most: everything island mode pays, plus one hundred for finishing the island.
const CHAOS_POINTS_LEVEL = 10;
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
const STATE_CHAOS_GAP = 'chaos_gap';

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
    this.towerHp = this.towerMaxHp;
    this.towerItems = 2;
    this.islandPoints = 0;
    this.chaosPoints = 0;
    this.islandShoreOrder = [];
    this.islandShoreDealt = false;
    this.guardianPlan = {};
    this.chaosNext = null;
    this.chaosPreview = null;
    this.chaosAdopt = null;
    this.ambPending = {};

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
    this.battleExitActive = false;
    this.inWaveBreak = false;
    // And whatever any of that missed: every loop still running.
    this.audio.stopAllLoops(spared);
  },

  // The level is over. Silence it and wait a moment before the next.
  _chaosBeginGap() {
    this._chaosClearEverything();
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

  _chaosPickNext() {
    return choice([STANDARD, BATTLE, TOWER, DRIVE, ISLAND]);
  },

  // The one looping sound that says what the next level is - its drone, its drums'
  // drone, its stairwell air, its idling engine or its shore - so an elevator ride
  // can bring it in before the level begins.
  _chaosPreviewName(st) {
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

  // next_level's chaos part (game.js's nextLevel has already counted the level).
  _chaosNextLevel() {
    // Ten points for any finished level that is not an island; islands pay their
    // own points as they are played.
    if (this.state !== ISLAND) this.chaosPoints += CHAOS_POINTS_LEVEL;
    // Timer is NOT reset - it keeps counting down across the whole run.
    if (this.chaosPreview) {
      // The elevator ride up out of an island has already faded the next level's
      // sound in: the ride was the pause. Straight on.
      this._setupChaosLevel();
    } else {
      this._chaosBeginGap();
    }
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
    return false;
  },

  // Take away any credit left in a chaos level once it is won and its clock has
  // stopped. It goes quietly: its beacon simply stops.
  _chaosDropCredits() {
    const c = this.timeCredit;
    if (c) {
      if (this.state === TOWER) this._towerStopLoop('credit');
      else if (c.channel) c.channel.stop();
      this.timeCredit = null;
    }
    if (this.state === DRIVE) {
      for (const t of (this.driveThings || []).filter((x) => x.kind === 'credit')) {
        if (t.channel) { t.channel.stop(); t.channel = null; }
        this.driveThings.splice(this.driveThings.indexOf(t), 1);
      }
    }
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
    { title: "Chaos Mode", sound: null, desc: "Chaos mode is every mode at once, and the hardest one in the game. Each level is chosen at random from all five kinds: a labyrinth, a battle, one floor of a tower, a stretch of road, or an island. Nothing ever tells you which one you are in. You work it out from what you hear, the labyrinth's drone, the battle drums, the tower's thin stairwell air, your engine, or the shore, and then you play it by that mode's rules. Finish a level and the next one begins at once, its air fading in over the old one. That silence is the mark of a change of place: the stairs, an exit, a road's exit, and then quiet, and then somewhere new. The one exception is leaving an island: the elevator ride itself carries you across, and the next level's sound rises through its doors. Your score is points. Every level you finish that is not an island is worth ten. Islands are worth the most: everything island mode pays for enemies, guardians, treasure and rescued divers, plus one hundred for finishing the island. There are no level numbers anywhere in chaos, only points, and when the run ends you hear your points. The clock is the only thing that speaks, apart from the Low air warning on a seabed, which is kept because your air runs out there just as it does in island mode." },
    { title: "Chaos Time Limit", sound: null, desc: "You get exactly five minutes for the whole run. Not a range, the same five minutes every time, so one run is worth comparing to another. The clock never resets between levels, so survive as many as you can before it runs out. Remaining time is announced every two minutes, and every double tap tells you it, just before your points, or on a keyboard you can press T at any point to check it. The clock stops for the moment of silence between levels and for every elevator ride on an island level. It also stops once a level is won and only its exit is left: from the moment a battle's Morse exit sounds, a road's exit comes into hearing, or a tower floor's stairs appear, until you reach it. Any credit still lying in that level goes at the same moment, its beacon falling silent, so take a credit while the clock is still running. A labyrinth's clock never stops, because there the exit is the whole level." },
    { title: "Chaos Ammo", sound: null, desc: "In chaos mode, each kind of level that shoots keeps its own ammo: battles, islands and roads each have their own inventory, starting at eight shots. Shots you have left at the end of a battle wait for you in the next battle, and the same for islands and for roads. Ammo you collect in one kind of level is never added to another, and you never spend one kind's shots in another. A double tap, in each kind of level, tells you that level's own count. Tower floors use items, not ammo, and keep their own stock as well." },
    { title: "Chaos Battles", sound: null, desc: "A battle inside chaos mode is a level, and that makes it a different game from standard battle mode. It has a fixed number of enemies to eliminate, ammo keeps appearing on the floor while you fight, and once the last enemy is down a Morse code exit appears which you walk to in order to advance the run. There are no waves and no breaks here. Standard battle mode has none of that: no levels, no exit, and ammo only between waves. What the two share is the aiming, the sounds and the endless scaling. Battles keep their own ammo for the whole chaos run, separate from islands and roads: shots you save in one battle are waiting for you in the next, and they are never used up or added to by any other kind of level. Save them." },
    { title: "Chaos Battle Exit", sound: null, desc: "After eliminating every enemy in a chaos battle, find the exit to advance. Once it appears the round is over and your laser is disabled, so just head for it. A Morse code signal is the only thing marking it, and it carries everything you need: it pans left and right for the bearing and grows steadily louder as you close. There is no locating beep on top of it, because the room already has drums, ambience and everything the level made, and a second voice describing the same doorway would be one more thing to listen past." },
    { title: "Chaos Tower Floors", sound: null, desc: "A tower level in chaos is a single floor. Bring the rival down, climb the stairs, and you are sent to another level. The tower is one climb that runs through the whole chaos run: the next time a tower comes up you are on the next floor, and your health and items are exactly what you left with, however many other levels came between. Reaching the top of a tower still hands you its bonus items. If your health runs out, the run is over." },
    { title: "Chaos Driving", sound: null, desc: "A driving level in chaos is a stretch of road with a job to do: shoot a certain number of the cars running your way. The game decides how many, three on your first road and one more on every road after, and it never tells you. When you have shot enough, no more cars come onto the road, and once every car still on it has been passed or shot, the battle exit's Morse signal appears in an empty road, so nothing can crash into you on the way to it. Drive through it and you are on to the next level. Miss it and another one comes along further on. Crashing costs thirty seconds off the chaos clock, exactly as it does in driving mode, each road starts harder than the last." },
    { title: "Chaos Islands", sound: null, desc: "An island level in chaos is one full island by island mode's rules: clear it, find its key on the seabed, and ride the elevator up from the seabed to leave it. The ride up is the transition: whatever comes next, its own sound rises through the elevator doors as you climb, a labyrinth's drone, a battle's drone, a tower's stairwell air, an idling engine or another island's shore, muffled first and then opening up with the doors. There is no pause after an island; when the doors open, you are already in the next level. Reinforcements, air, vents, treasure, trapped divers and guardians all work exactly as they do in island mode, and every island in a chaos run is harder than the last one. Drowning, or an enemy or guardian reaching you, ends the run. The chaos clock stops while you are riding an elevator, down or up, so a ride never costs you time. On the seabed two countdowns can run at once, and they never sound alike: your air beeps high, once a second over its last fifteen seconds, and the chaos clock beeps low over its last fifteen." },
    { title: "Chaos Credits", sound: null, desc: "Time credits are worth exactly forty, fifty or sixty seconds, and the spinning beacon tells you which before you chase it: the higher the pitch and the faster the spin, the bigger the bonus. Collecting any of them plays the same shower of coins. They can turn up in every kind of level, about half of them: a labyrinth or a tower floor has one about one time in two, a battle a little more often, about six times in ten, and a road one about every two thousand metres, in a lane with nothing coming at you, so drive into its lane as you reach it. An island has one lying on it about one time in two, and each island's seabed has about a one in three chance of one, decided at your first dive there. A credit can always be heard, getting louder as you close in, so when you hear one, it is there to be found and worth going for. Once a level is won and its exit is all that is left, no new credit appears: a battle once its exit sounds, a road once its quota is shot, a tower floor once its stairs appear." },
    { title: "Chaos Scaling", sound: null, desc: "Every kind of level gets harder on its own count, never on how far into the run you are. Your third battle is as hard as a third battle however many other levels came between, a labyrinth is sized by how many labyrinths you have solved, and so on for towers, roads and islands. Each kind of level that shoots keeps its own ammo: battles, roads and islands each have a supply that waits for you and all add to it." },
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
    else if (state === ISLAND && game.islandDeath === 'drown') opener = 'You drowned.';
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
