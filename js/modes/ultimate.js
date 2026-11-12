// Ultimate Mode (web 2.0.0): the hardest mode in the game, made for the web
// alone, from Russell's design of 8 November 2026 (the plan document "Endless
// Labyrinth Web: Ultimate Mode Plan"). Chaos tests switching between modes
// against the clock; this tests survival: how long you can last in one huge,
// mixed world, heard in binaural 3D (the browser's HRTF panning, see audio.js).
//
// The world (ultimate/world.js) is five to ten areas of five kinds, each keeping
// its home mode's sounds: labyrinths (walls, navigation), islands (a shore, sand
// underfoot, an elevator down to the seabed, chasers), tower areas (throwers that
// race you for items and throw them), battle areas (chasers you shoot) and event
// areas (the event backgrounds; no enemies: the safe zones). It regenerates every
// two minutes, with a spoken warning at 15
// seconds and Battle's countdown over the last 5, fading out, and a new world
// there at once, with 5 safe seconds. There is no clock on the run: it ends
// when health runs out. Points come from kills, pickups and credits, times a
// survival multiplier that rises with every world survived. Every number marked
// "tune" is a starting value for Russell to judge by ear.
//
// Enemies never leave their areas. Ammo and tower items are carried everywhere
// and have no limit; an item is thrown only in a tower area (until web 3.3.0 the
// items belonged to the tower area they were found in). A compass (hold a
// finger still for a second; C on a keyboard) points along the walkable route to
// the nearest safe zone with a centred beep, highest toward the way to go, while
// the world is muffled and nothing can move; it says how far the leg runs.
//
// Web 4.0.0 (Russell, 11 November 2026): the world turns with you. Until then
// north was always ahead, and a swipe both faced you and stepped you. Now the
// facing is an angle: a swipe left or right is a quick turn to the next main
// direction, a held turn is free and stops where you let go, a step goes exactly
// where you face (walls stop you; at a slant you slide along them), the aim is
// the front quarter, and the compass turns you for real. The sound engine turns
// the listener (AudioEngine.setFacing), so every placed sound sweeps round with
// the turn. See "turning" below.
//
// Russell's first play test (8 November 2026, night) set: every world three
// minutes; areas one and a half times bigger with neighbours heard only near their
// borders; one rival per tower area; one chaser per battle or island area at first,
// never more than six; slower chasers and two seconds between strikes; the compass
// speaking its leg; the lift's hum silent in the car; and the area echoes, which a
// string-against-number lookup had left silent.

import { TowerEnemy, TowerItem, TowerProjectile, volleySpread, TOWER_DRONES } from './tower.js';
import { addMade, aliasRecording, ensureCopies } from './events/sounds.js';
import { knockSound } from './events/blocks.js';
import { HELP_SECTIONS, HELP_DEMOS } from './ultimate/help.js';
import { RULES } from '../sound-rules.js';
import {
  makeWorld, makeSeabed, CELL, AREA_CELLS, key, cellOf, posOf, isFloor, areaAt, nearestPointOf, leakPoint, echoMix,
  randomFloor, routeToward,
} from './ultimate/world.js';

import {
  DEG, TWO_PI, QUARTER, TURN_SLOW, TURN_FAST, TURN_EASE, TURN_STEP, TURN_STEPS, TURN_QUICK, TURN_LIMIT, TURN_BRIEF,
  TICK_LEVEL, CLICK_LEVEL, SLIDE_MIN, STEP_SAMPLE, COMPASS_DIRS, FACING_WORDS, MAIN_WORDS,
  wrapAngle, mainIndex, snapFace, forwardOf, facingWord, turnQuick, turnStart, turnEnd, turnStop, updateTurn,
  walkStep as walkSquares,
} from '../turning.js';
export {
  QUARTER, TURN_SLOW, TURN_FAST, TURN_EASE, TURN_STEP, TURN_STEPS, TURN_QUICK, TURN_LIMIT, TURN_BRIEF,
  TICK_LEVEL, CLICK_LEVEL, SLIDE_MIN, STEP_SAMPLE, FACING_WORDS, MAIN_WORDS,
};

export const STATE = 'ultimate';
export const BOARD = 'ultimate';

// ------------------------------------------------------------------ the numbers (tune)
// How long a world lasts: drawn at random for every world, between these (Russell,
// 8 Nov, web 3.1.0: no fixed length, and nothing says how long is left; the only
// warning is the five-second countdown. Two, three and five minutes were tried).
export const WORLD_SECONDS = [60, 240];
export const COUNT_FROM = 5;                    // Battle's countdown over the last seconds
export const NO_SPAWN_FROM = 3;                 // nothing new appears in the last seconds
export const FADE_OUT = 2.0;                    // the old world fades over its last two seconds
export const SILENCE = 0;                       // between worlds: none, the next world fills in the moment the count reaches zero (was 0.6)
export const FADE_IN = 0.5;                     // the new world's rise (was 1.0)
export const SAFE_SECONDS = 5.0;                // after a new world fades in
export const EASY_SECONDS = 120;                // the easy stretch
export const START_HP = 100;
// What a run begins with in hand, drawn afresh for every run (Russell, 10 Nov:
// about ten shots and about three items, so you can defend yourself from the
// first moment; picked at random, close to those). Until web 3.3.0 a run began
// with neither.
export const START_AMMO = [8, 12];
export const START_ITEMS = [2, 4];
export const DAMAGE_START = 5;                  // a hit in the easy stretch
export const DAMAGE_CAP = 25;                   // Tower's cap: death takes at least four hits
export const DAMAGE_PER_MINUTE = 1.5;           // after the easy stretch, toward the cap
export const ENEMIES_EASY = [1, 2];             // chasers per battle or island area in the easy stretch (1 to 1 until 9 Nov; Russell: a bit more)
export const ENEMIES_MAX = 8;                   // chasers in one area (10, then 6 until 9 Nov); a tower area always has one thrower
export const ENEMIES_PER_MINUTE = 1.0;          // the base count rises this fast after the easy stretch
export const SPEED_RISE = 0.25;                 // speed multiplier added over SPEED_RISE_MINUTES
export const SPEED_RISE_MINUTES = 10;
export const SPEED_WELL = 1.10;                 // a world done well: enemies this much faster
export const SPEED_CAP = 1.5;
export const WELL_POINTS = 60;                  // doing well in a world: at least this many base points...
export const WELL_DAMAGE = 25;                  // ...with no more damage than this
export const CHASER_SPEED = 2.2;                // units a second at the start (was 2.6; the player's run is about 14)
export const CHASER_TOUCH = 1.6;
export const CHASER_PUSH = 15.0;                // a chaser that struck is set back this far
export const HIT_COOLDOWN = 2.0;                // between strikes (was 1.0)
export const RESPAWN_ENEMY = [8, 15];           // seconds after a kill
export const RESPAWN_PICKUP = [10, 20];         // ammo and credits, out in the world
export const SAFE_AMMO_EVERY = 15;              // a safe zone's one cartridge comes back after this long
export const AMMO_SHOTS = [3, 6];               // shots in every cartridge, the whole run (Russell, 9 Nov: they grew with the minutes and ammo piled up past 400)
export const BATTLE_BEACON_BOOST = 2.0;         // cartridge and credit beacons in a battle area, over the drums, drone and crowd (Russell, 9 Nov: hard to hear)
export const AMMO_PER_ENEMY = 0.6;              // cartridges in the world per enemy, never under AMMO_MIN
export const AMMO_MIN = 3;
export const CREDITS_AT_ONCE = [2, 3];
export const CREDIT_VALUES = [40, 50, 60];
// Potions (Russell, 8 Nov, web 3.1.0): healing has a place to go. While your
// health is under POTION_BELOW every safe zone holds one potion; drink it and that
// zone has another after POTION_REFILL seconds if you are still under; back at
// or above the line, they all disappear. None appears anywhere else.
export const POTION_BELOW = 75;
export const POTION_REFILL = 10;
export const LOW_AMMO_FROM = 5;
export const POINTS = { chaser: 10, thrower: 20, ammo: 5, potion: 10 };
export const MULTIPLIER_STEP = 0.5;             // times 1, 1.5, 2 ... by world
export const HEAR_RANGE = 70.0;                 // enemies and pickups fade to nothing by here, inside their area
export const AMBIENCE_RANGE = 15.0;             // a neighbouring area's air, and its pickups, reach this far past its border or doorway (was 45)
export const AMBIENCE_LEVEL = 0.8;
export const DOOR_LEAK = 0.85;                  // through a doorway, against an open border
export const KEEP_SLOTS = 2;                    // an area's air keeps running while within this many slots of yours
export const PARK_BELOW = 0.0005;               // an area's air quieter than this is unheard ...
export const PARK_AFTER = 1.5;                  // ... and after this many seconds unheard its loops are held where they are (see _utUpdateSounds)
const AREA_LOOPS = ['amb', 'ambIn', 'drums', 'drumsIn', 'crowd', 'crowdIn'];   // an area's air: each background's placed copy and its wide one
export const REACH = 1.6;                       // (until web 4.0.0: walking into the elevator was coming this near its middle; now it is stepping onto its square)
export const PICKUP_REACH = 3.2;                // a cartridge, credit, potion or tower item: its cell or the next (Battle, Tower and Island take theirs within 3 units)
export const ITEM_NEAR = [12.0, 30.0];          // a tower item lies this far from you when it appears, as on a tower floor (was anywhere in the area)
export const THROWER_SECONDS = 120;             // a tower rival's difficulty rises one point this often (30, then 45 until 9 Nov: Russell, even 5 to 10 minutes in it should not be that hard)
export const THROWER_HITS_MINUTES = 4;          // and the hits it takes never exceed 1 + minutes played / this (was 2)
export const THROWER_MAX = 20;                  // its difficulty never goes above this here (tower mode's own cap is 40)
export const COMPASS_HOLD_MS = 1000;
export const COMPASS_BEEP_EVERY = 0.45;
export const COMPASS_BEEP_TURNING = 0.16;       // while you turn with the compass on, so the pitch follows the turn
// ---- turning (web 4.0.0; shared with every mode that turns since 5.0.0: js/turning.js).
// The facing is an angle, clockwise from north.
export const AIM_HALF = 30.5 * DEG;              // the aim: this far either side of straight ahead (web 4.1.0: 30 degrees, and the half over so that one exactly on the line is in; it was 45.5, the front quarter. A quick turn's steps are 30 degrees, so some step always has an enemy within 15)
export const WALL_TOUCH = 0.45;                 // the wall's level when you slide along it instead of stopping at it
// (Web 4.0.0 to 4.1.2 said once, on a device's first run, that turning had changed.
// Since 5.0.0 nothing is announced inside the game: the Update History says it.)
export const COMPASS_NEAR_RANGE = 60;           // units: how far the compass briefing looks for things to pick up
export const COMPASS_NEAR_COUNT = 3;            // how many it names
export const ARENA = (AREA_CELLS - 1) / 2 * CELL;   // an area, as a tower floor sees it: 31.5 each way
export const SEABED_RANGE = 60.0;               // how far the seabed's things carry (web 5.0.0, with the bigger seabed; was 30)
export const SEABED_FLOOR = 0.12;               // and they are never quieter than this, however far (Island Mode's own floor): everything down there can be found by ear
const seaLevel = (d) => Math.max(SEABED_FLOOR, 1 - d / SEABED_RANGE);
// Treasure chests (web 5.0.0, Russell, 11 November 2026): about one seabed in
// three has one, far from the lift. Swim onto it and it opens: an assortment,
// worth more than a glass case, and the voice says only what was inside.
export const CHEST_CHANCE = 1 / 3;
export const CHEST_FAR = 7;                     // squares: at least this far from the lift
export const CHEST_GAIN = 0.7;
export const CHEST_REWARDS = [2, 3];            // how many different things are inside
export const CHEST_SHOTS = [6, 10];
export const CHEST_POINTS = 100;                // times the multiplier
export const CHEST_HEALTH = 40;
export const CHEST_FULL_HEAL = 0.1;             // the chance its health is a full heal instead
export const CHEST_ITEMS = [4, 6];              // a bundle of tower items
export const CHEST_TIME = 90;                   // seconds more in the world above
export const CHEST_TIME_CHANCE = 0.1;           // and how often a chest holds them
// Its sounds, and the strokes of swimming along the seabed (recordings from
// Pixabay, in the ultimate pack since 5.0.0): the chest calls with a sparkling
// chime, about four seconds long, again and again; it opens with the events'
// own chest opening; and each step along the seabed is one of four underwater
// strokes. (The names after the first are what is used if a pack is missing one.)
export const CHEST_SOUNDS = ['ut_chest', 'treasure_beacon'];
export const CHEST_OPEN_SOUNDS = ['evt_chest_open', 'treasure_pickup'];
export const DIVE_STROKES = ['ut_dive_stroke_1', 'ut_dive_stroke_2', 'ut_dive_stroke_3', 'ut_dive_stroke_4'];
export const DIVE_STROKE_LEVEL = 0.6;
export const DIVE_STROKE_EVERY = 0.35;          // seconds: no stroke starts sooner than this after the last, so a run along the seabed is a string of strokes, not a blur of them
export const RIDE_MIN = 4.0;
export const RIDE_MAX = 16.0;
export const RIDE_TIME = 8.0;
const DOORS_SHUT = 0.34; const DOORS_OPEN = 0.67; const DOORS_WIDE = 0.93;   // the ride's stages (island.js)
const ARRIVE_CHIME_LEAD = 0.5;
const ARRIVAL_GRACE = 3.0;             // Island Mode: seconds nothing can touch you after stepping out of the lift
export const ARRIVE_STEPS = [4, 6];    // Island Mode: back up on the island you step out this many steps from the lift (Island's own minimum is 12 units, four steps)
const ARRIVE_CLEAR = 12.0;             // and, where the island allows, at least this far (units) from every chaser
const BUBBLES_EVERY = [3.0, 5.0];     // Island Mode: your own bubbles on the seabed
const BUBBLES_FIRST = [2.0, 4.0];
const BREATHING_LEVEL = 0.85;         // the diver's breathing on the seabed (a web-only recording, in the ultimate pack)
const FPS = 30;
const RATE = 44100;

const LABYRINTH_DRONES = ['lab_01_cavewind', 'lab_02_scary_cave', 'lab_03_scifi_cave', 'lab_04_dungeon_air',
  'lab_05_catacombs', 'lab_06_creepy_basement', 'lab_07_horror_basement', 'lab_08_waterflow_2',
  'lab_09_waterflow_1', 'lab_10_dreary_tunnels', 'lab_11_tunnel_fan'];
const BATTLE_DRONES = ['bat_01_deep_drone', 'bat_02_creepy_dark', 'bat_03_dark_ambient', 'bat_04_dark_drone',
  'bat_05_ominous', 'bat_06_grinding', 'bat_07_texture', 'bat_08_eerie', 'bat_09_suspenseful', 'bat_10_static',
  'bat_11_horror_suspense'];
const BATTLE_DRUMS = ['drm_01_tribe_loop', 'drm_02_horde_war', 'drm_03_loop_75', 'drm_04_loop_80',
  'drm_05_ancient_war', 'drm_06_tribal_beat', 'drm_07_tribal_drums', 'drm_08_hybrid_epic', 'drm_09_djembe'];
const ISLAND_SHORES = ['island_01_maldives_beach', 'island_02_sandy_beach_calm', 'island_03_waves_birdsong_gull',
  'island_04_sea_and_seagull', 'island_05_lapping_far_gulls', 'island_06_wind_and_waves', 'island_07_rock_beach',
  'island_08_gentle_shore', 'island_09_waves_breaking', 'island_10_beach_ambiance'];
// The event backgrounds an event area may have (the event library's ambiences;
// the Event Maker's own list). Each is a place in its own right.
export const EVENT_BACKGROUNDS = ['evt_amb_bees', 'evt_amb_blizzard', 'evt_amb_cafe', 'evt_amb_campfire', 'evt_amb_cathedral',
  'evt_amb_cathedral_organ', 'evt_amb_cave_drips', 'evt_amb_cicadas', 'evt_amb_city_night', 'evt_amb_clock', 'evt_amb_crickets',
  'evt_amb_dark_choir', 'evt_amb_desert', 'evt_amb_fast_food', 'evt_amb_fireplace', 'evt_amb_fireworks', 'evt_amb_forest_night',
  'evt_amb_ghost_choir', 'evt_amb_graveyard', 'evt_amb_halloween_strings', 'evt_amb_haunted_house', 'evt_amb_haunted_space',
  'evt_amb_howling_wind', 'evt_amb_ice_cave', 'evt_amb_industrial', 'evt_amb_jungle', 'evt_amb_kitchen', 'evt_amb_lava',
  'evt_amb_library', 'evt_amb_market', 'evt_amb_marsh_frogs', 'evt_amb_medieval_village', 'evt_amb_morning_birds',
  'evt_amb_ocean_night', 'evt_amb_organ', 'evt_amb_rain', 'evt_amb_restaurant_kitchen', 'evt_amb_river', 'evt_amb_ship_creak',
  'evt_amb_sizzling_oil', 'evt_amb_space', 'evt_amb_spaceship', 'evt_amb_spooky', 'evt_amb_spring_birds',
  'evt_amb_storm', 'evt_amb_summer', 'evt_amb_tavern', 'evt_amb_train_station', 'evt_amb_underwater', 'evt_amb_water_drip',
  'evt_amb_waterfall', 'evt_amb_wind_trees', 'evt_amb_winter_wind', 'evt_amb_witch'];
// The arena crowd (Russell, 8 Nov): the stadium crowd is a battle area's, under its
// drone and drums, not a safe zone's.
export const BATTLE_CROWD = 'evt_amb_stadium_crowd';
export const CROWD_LEVEL = 0.55;                // against the drone's 1 and the drums' 0.85
export const ROARS = ['ut_crowd_roar_1', 'ut_crowd_roar_2', 'ut_crowd_roar_3', 'ut_crowd_roar_4', 'ut_crowd_roar_5', 'ut_crowd_roar_6', 'ut_crowd_roar_7'];   // the crowd erupting when a chaser goes down (web-only recordings, the ultimate pack; seven, never the same twice running: Russell, 8 Nov, two were repetitive)
export const ROAR_LEVEL = 0.6;
export const ROAR_AFTER = 0.35;                 // seconds after the bang
// When a chaser strikes you in a battle area the crowd reacts (Russell, 8 Nov):
// a groan or a gasp, all round you, in the arena's room. Universfield's "Crowd
// Disappointment Reaction" and "Crowd Shocked Reaction" (Pixabay).
export const HIT_REACTIONS = ['ut_crowd_hit_1', 'ut_crowd_hit_2', 'ut_crowd_hit_3', 'ut_crowd_hit_4', 'ut_crowd_hit_5', 'ut_crowd_hit_6'];   // groans, gasps, awws and boos; never the same twice running
export const HIT_REACT_LEVEL = 0.6;
// The crowd's roars and reactions ring in the arena's room (Russell, 8 Nov: some
// sounded dry). The web-only recordings have no room list in the sound rules, so
// without a send of their own they had no echo at all. The two roars cut from a
// live stadium recording carry the stadium's own echo and get less; the close-up
// recordings get more. The stadium crowd loop in the background is unchanged.
export const CROWD_SEND = 0.5;
export const CROWD_SEND_LIVE = 0.3;
export const CROWD_LIVE_RECORDED = ['ut_crowd_roar_1', 'ut_crowd_roar_2'];
export const HIT_REACT_AFTER = 0.15;            // seconds after the hit sound
// The water park (Russell, 8 Nov): a safe zone whose background is water has a
// water slide. Its beacon is Tower Mode's staircase; reach it and you climb by
// yourself (Tower's stairs), slide down (a rush made by the game) and splash into
// the water, for points, landing somewhere else in the park.
export const WATER_PARK = /ocean|river|waterfall|rain|marsh|underwater|water_drip/;
export const SLIDE_POINTS = 15;                 // a ride, times the multiplier (the one thing a safe zone pays for)
export const SLIDE_CLIMB = 2.6;                 // seconds up the stairs
export const SLIDE_DOWN = 3.0;                  // seconds down the slide
export const SLIDE_LAND_AWAY = 15.0;            // you come up at least this far from the slide
export const SLIDE_BEACON_GAIN = 0.8;
// The buses (Russell, 8 Nov): when a safe zone is a long walk away, a bus may be
// standing near you, engine idling, with a chime to say it has come, and the
// compass points to it while it waits. Reach it and the doors open, you climb in
// and sit, the doors close, and it carries you to the nearest safe zone: a quarter
// of a minute from nearby, half a minute from the far end of the world. The doors
// open, you climb down, they close, and it drives off. At most one a world, never
// in a world's last minute, so the ride is never cut short by the regeneration.
export const BUS_CHANCE = 0.67;                 // of a world having a bus at all
export const BUS_APPEARS = [20, 60];            // from this many seconds in, to this many before the regeneration
export const BUS_FAR_STEPS = 45;                // a safe zone at least this many steps' walk away: the bus comes
export const BUS_RIDE = [15, 30];               // seconds on the road, from BUS_FAR_STEPS away to BUS_FAREST_STEPS or more
export const BUS_FAREST_STEPS = 150;
export const BUS_NEAR = [10, 25];               // it stands this far from you
export const BUS_RETRY = 10;                    // seconds before it looks again, when the safe zone was near
// Getting on and off is brisk (Russell, 8 Nov: it was too slow): each door
// recording is cut short with a fade, the steps come as the doors open, and the
// bus is away as soon as its doors have shut.
export const BUS_STEP_AT = 0.8;                 // the first step up or down, after the doors start opening
export const BUS_STEP_GAP = 0.35;               // three steps
export const BUS_CLOSE_AT = 1.9;                // the doors start closing
export const BUS_DOOR_CUT = 2.0;                // a door recording plays this long, then fades out
export const BUS_GO_AT = 3.1;                   // the ride begins, or the bus drives off
// The bus pulling up (Russell, 8 Nov): derrickmckinnon's "Bus at bus stop"
// (Pixabay), the pull-in ending on the air brakes, where it stands; then the chime.
export const BUS_PULL_STOP = 9.8;               // the air brakes, in the recording: the bus has stopped
export const BUS_PULL_GAIN = 0.9;
export const BUS_IDLE_GAIN = 0.9;
export const BUS_WINDOWS = 0.25;                // how much of the world comes through the windows on the ride
// Sheltered (Russell, 8 Nov): on the bus the whole world, and in a safe zone the
// world beyond its borders, sounds further off: quieter and dulled, as if through
// walls or windows. The change eases in and out as you cross.
export const SAFE_OUTSIDE = 0.45;               // the level of what lies outside a safe zone, heard from inside it
export const SHELTER_DULL = 0.85;               // how dulled (the "behind you" copy's share)
export const SHELTER_EASE = 0.6;                // seconds
export const BUS_CHIME_HZ = [659, 880];         // the bus's chime, made by the game: two notes
// Each safe zone's echo is sized to its background: a cathedral, a cave or an ice
// cave ring long (the cathedral's echo, stretched); a kitchen, a library or a
// tavern are small rooms (the tower's short echo); the open air has a short,
// light tail (the hall's echo, shortened). [room, stretch]
const LARGE = ['cathedral', 1.2]; const BIG = ['cathedral', 0.9]; const HALL = ['hall', 1.0];
const MEDIUM = ['battle', 1.0]; const SMALL = ['tower', 0.9]; const TINY = ['tower', 0.7]; const OPEN = ['hall', 0.5];
const BACKGROUND_ROOMS = {
  evt_amb_cathedral: LARGE, evt_amb_cathedral_organ: LARGE, evt_amb_organ: LARGE, evt_amb_dark_choir: LARGE, evt_amb_ghost_choir: LARGE,
  evt_amb_cave_drips: BIG, evt_amb_ice_cave: BIG, evt_amb_water_drip: BIG, evt_amb_lava: BIG, evt_amb_train_station: BIG,
  evt_amb_haunted_house: HALL, evt_amb_haunted_space: HALL, evt_amb_space: HALL, evt_amb_industrial: HALL, evt_amb_stadium_crowd: HALL,
  evt_amb_spooky: MEDIUM, evt_amb_halloween_strings: MEDIUM, evt_amb_spaceship: MEDIUM, evt_amb_underwater: MEDIUM, evt_amb_witch: MEDIUM,
  evt_amb_library: SMALL, evt_amb_clock: SMALL, evt_amb_ship_creak: SMALL, evt_amb_fireplace: SMALL,
  evt_amb_kitchen: TINY, evt_amb_restaurant_kitchen: TINY, evt_amb_sizzling_oil: TINY, evt_amb_cafe: TINY, evt_amb_fast_food: TINY, evt_amb_tavern: TINY,
};
// Any other background is the open air.
export function backgroundRoom(stem) { return BACKGROUND_ROOMS[stem] || OPEN; }
// A background's own echo: light (every world has one but an island's shore and
// the seabed); the walls of a safe zone ring softer than its room would have them.
export const BACKGROUND_SEND = 0.15;
export const SAFE_WALL_SEND = 0.05;
const STEPS_STONE = ['step_stone_1', 'step_stone_2', 'step_stone_3', 'step_stone_4'];
const STEPS_SAND = ['step_sand_1', 'step_sand_2', 'step_sand_3', 'step_sand_4'];
// ---- the pool at the foot of a water slide (web 4.1.0; Russell, 11 November
// 2026): you splash down in the middle of a pool and have to get out of it, a few
// steps whichever way you go. A step in it is a wading step; a run in it is
// swimming, a stroke for each step. Walk back into it and you are in the water
// again. (Recordings from Pixabay, in the ultimate pack.)
export const POOL_RADIUS = 10.6;                // units: from its middle three steps are in the water, and the fourth is out of it
export const STEPS_WATER = ['ut_water_step_1', 'ut_water_step_2', 'ut_water_step_3', 'ut_water_step_4'];
export const SWIM_STROKES = ['ut_swim_1', 'ut_swim_2', 'ut_swim_3', 'ut_swim_4'];
// ---- the glass cases (web 4.1.0; Russell, 11 November 2026): here and there in
// battle areas, on islands and in labyrinths stands a case made of glass, humming.
// Come within a step of it and it chimes; your attack then smashes it, at no cost
// in shots. What was in it is yours at once, and the voice says what. But the
// enemies hear glass break: two to five chasers come from far off, fast, and the
// voice does not say how many. Shoot them, or get out of the area: they do not
// follow you out of it. The broken glass lies round where the case stood, and
// crunches underfoot.
export const CASE_KINDS = ['battle', 'island', 'labyrinth'];   // never a safe zone (nothing can hurt you there), never a tower area (no laser there)
export const CASE_CHANCE = 0.5;                 // each such area, until the world has CASE_MAX
export const CASE_MAX = 3;
export const CASE_SOUND = 'evt_crystal_hum';    // its own sound: a humming crystal (already in the game, for events)
export const CASE_CHIME = 'evt_chime_clear';    // within reach of it: a clear bell (already in the game too)
export const CASE_SMASH = 'ut_glass_smash';
export const CASE_GAIN = 0.75;
export const CASE_REACH = 4.5;                  // units: the squares beside it and the ones at its corners
export const CASE_REARM = 9.0;                  // go this far from it and it will chime again when you come back
// The ping (web 4.1.1; Russell, 11 November 2026: the hum alone is not enough to
// centre a case). On top of the hum, a short glassy ping from where the case
// stands, made by the game itself. Its pitch says how squarely you face the case:
// highest when it is straight ahead, a step lower for every 15 degrees it is off
// to either side, lowest behind you. It repeats faster as you come closer.
// The knock (web 5.0.0, Russell, 11 November 2026; it replaces 4.1.1's ping): two
// quick raps on glass, made by the game, from where the case stands. It starts
// within fifteen steps, faster and louder as you close, so you can turn until it
// is centred between your ears. The numbers are the events' display cases' own
// (js/modes/events/blocks.js), so a case sounds the same wherever you meet one.
export const CASE_KNOCK = 'event_case_knock';
export const CASE_KNOCK_RANGE = 45.0;           // units: fifteen steps; no knock from further off, nor from another area (the hum leads you in from there)
export const CASE_KNOCK_EVERY = [0.35, 1.1];    // seconds between knocks: beside the case, and at the edge of the range
export const CASE_KNOCK_LEVEL = [0.35, 0.9];    // its level: at the edge of the range, and beside the case
// Lined up (web 5.0.0): beside the case and facing it. The bell says so, once, and
// then your attack smashes it. (Until then the bell rang as you came beside it,
// whichever way you faced, and the attack smashed it from there.)
export const CASE_LINED = 30.5 * DEG;           // this far either side of straight ahead (the aim's own width)
export const CASE_UNLINED = 45 * DEG;           // turned further off than this, the bell will ring again when you come back
// Protection while you line up (web 5.0.0): within three steps of a case not yet
// broken, nothing can hit you, for at most this long in all at any one case.
export const CASE_GUARD_RANGE = 9.0;            // units: three steps
export const CASE_GUARD_SECONDS = 15;
export const CASE_HUNTERS = [[2, 0.35], [3, 0.40], [4, 0.15], [5, 0.10]];   // how many come, and how often: mostly two or three, five if you are very unlucky
export const HUNTER_FROM = [70, 60, 50, 40, 30, 20, 14];   // units: they start as far from you as the area has floor, trying the furthest first (70 is out of earshot)
export const HUNTER_QUIET = 1.2;                // seconds before one can be heard at all, wherever it started ...
export const HUNTER_RISE = 2.0;                 // ... and seconds over which its sound then comes up to what the distance gives
export const HUNTER_SPEED = [6.5, 10.0];        // units a second, from the start of a run to the enemies' fastest: three to four and a half times an area's own chasers at the start (2.2), but always slower than your run (14)
export const GLASS_RADIUS = 6.5;                // units: the broken glass lies two steps round where the case stood
export const STEPS_GLASS = ['ut_glass_step_1', 'ut_glass_step_2', 'ut_glass_step_3', 'ut_glass_step_4'];
export const CASE_POINTS = 60;                  // times the multiplier, as everything you earn
export const CASE_SHOTS_OVER = [1, 3];          // shots: this many more than the chasers that are coming
export const CASE_TIME = 60;                    // seconds put back on the world's clock (web 5.0.0; was 30)
export const CASE_HEALTH = 30;
export const CASE_ITEMS = [2, 3];

// ------------------------------------------------------------------ helpers
const rand = Math.random;
const uniform = (a, b) => a + (b - a) * rand();
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const randint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const choice = (arr) => arr[Math.floor(rand() * arr.length)];
const plural = (n, word, many = word + 's') => (n === 1 ? word : many);
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const levelAt = (d, range = HEAR_RANGE) => Math.max(0, 1 - d / range);
// Aiming. Until web 4.0.0 a shot took what sat centred between the ears, in
// front or behind, within about 58 degrees (Russell, 9 Nov: a kinder aim than
// battle mode's). Now that you turn to face an enemy, a shot or a throw takes the
// nearest one in the front quarter (AIM_HALF either side of straight ahead) and
// nothing behind you; a chaser within two steps is still hit wherever it is.
export const AIM_CLOSE = 6.0;                   // units: two steps

// One step's walk over the floor (js/turning.js: stopped by a wall, sliding along
// it at a slant), on this mode's squares.
export function walkStep(from, dir, len, open) { return walkSquares(from, dir, len, open, cellOf, posOf); }

function pointToSegment(x, y, a, b) {
  const [ax, ay] = a; const [bx, by] = b;
  const dx = bx - ax; const dy = by - ay;
  const span = dx * dx + dy * dy;
  const t = span <= 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / span));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

// Seconds as words for the end of a run: "4 minutes 12 seconds".
export function spokenTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60); const r = s % 60;
  if (!m) return `${r} ${plural(r, 'second')}`;
  if (!r) return `${m} ${plural(m, 'minute')}`;
  return `${m} ${plural(m, 'minute')} ${r} ${plural(r, 'second')}`;
}

// ------------------------------------------------------------------ the game's own sounds
// Made by the game itself (no recording, no credit): the low-ammo tones, highest
// at five shots left and lowest at one, and the compass beep.
const LOW_AMMO_HZ = [0, 554, 622, 698, 784, 880];     // index = shots left
function tone(hz, seconds, peak = 0.35, decay = 0.012) {
  const n = Math.floor(RATE * seconds);
  const L = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.004) * Math.exp(-t / (seconds * 0.35));
    L[i] = Math.sin(2 * Math.PI * hz * t) * env * peak * 32768;
  }
  return [L, Float64Array.from(L)];
}
function joined(parts, gapSeconds) {
  const gap = Math.floor(RATE * gapSeconds);
  const n = parts.reduce((s, p) => s + p[0].length + gap, 0);
  const L = new Float64Array(n); let at = 0;
  for (const p of parts) { L.set(p[0], at); at += p[0].length + gap; }
  return [L, Float64Array.from(L)];
}
export const COMPASS_HZ = [392, 1046];   // the beep, lowest away from the route, highest toward it
export const TICK_HZ = [1320, 1980];     // the tick of a turn at east, south and west, and at north
export const CLICK_HZ = 880;             // the softer click of a quick turn landing between two of them (web 4.1.0)
export function compassName(step) { return `ut_compass_${step}`; }   // step 0..8
export function makeSounds(audio) {
  if (audio.has('ut_low_ammo_1')) return;
  for (let n = 1; n <= LOW_AMMO_FROM; n++) addMade(audio, `ut_low_ammo_${n}`, tone(LOW_AMMO_HZ[n], 0.22));
  addMade(audio, 'ut_low_ammo_demo', joined([5, 4, 3, 2, 1].map((n) => tone(LOW_AMMO_HZ[n], 0.22)), 0.3));
  for (let s = 0; s <= 8; s++) {
    const hz = COMPASS_HZ[0] * Math.pow(COMPASS_HZ[1] / COMPASS_HZ[0], s / 8);
    addMade(audio, compassName(s), tone(hz, 0.16, 0.3));
  }
  addMade(audio, 'ut_compass_demo', joined([0, 2, 4, 6, 8, 6, 4, 2, 0].map((s) => {
    const hz = COMPASS_HZ[0] * Math.pow(COMPASS_HZ[1] / COMPASS_HZ[0], s / 8);
    return tone(hz, 0.16, 0.3);
  }), 0.3));
  addMade(audio, 'ut_slide', slideRush(SLIDE_DOWN));
  addMade(audio, 'ut_bus_chime', joined([tone(BUS_CHIME_HZ[0], 0.5, 0.4), tone(BUS_CHIME_HZ[1], 0.7, 0.4)], 0.05));
  // A glass case's knock (web 5.0.0): the events' own, made here too so that Help
  // has it before any event is played; and its demo, three knocks closing in.
  if (!audio.has(CASE_KNOCK)) addMade(audio, CASE_KNOCK, knockSound());
  { const k = knockSound(); addMade(audio, 'ut_case_knock_demo', joined([k, k, k, k], 0.5)); }
  // The ticks of a turn (web 4.0.0): one as you pass east, south or west, a
  // higher one for north.
  addMade(audio, 'ut_tick', tone(TICK_HZ[0], 0.07, 0.3));
  addMade(audio, 'ut_tick_north', tone(TICK_HZ[1], 0.07, 0.3));
  // The click of a quick turn that lands between two main directions (web 4.1.0).
  addMade(audio, 'ut_click', tone(CLICK_HZ, 0.05, 0.3));
  // The demo: six quick turns, half way round to north: click, click, a main
  // direction's tick, click, click, and north's higher tick.
  { const c = () => tone(CLICK_HZ, 0.05, 0.3 * CLICK_LEVEL / TICK_LEVEL);
    addMade(audio, 'ut_tick_demo', joined([c(), c(), tone(TICK_HZ[0], 0.07, 0.3), c(), c(), tone(TICK_HZ[1], 0.07, 0.3)], 0.4)); }
  for (const n of ['ut_low_ammo_demo', 'ut_compass_demo', 'ut_slide', 'ut_bus_chime', 'ut_tick_demo', 'ut_case_knock_demo']) ensureCopies(audio, n);
}

// The rush of a water slide: noise through a resonant band that falls from a
// hiss to a roar as you pick up speed, swelling to the splash at the bottom.
function slideRush(seconds) {
  const n = Math.floor(RATE * seconds);
  const L = new Float64Array(n); const R = new Float64Array(n);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
  // Two band-pass filters (state variable), one per ear, slightly apart.
  const mk = () => ({ lp: 0, bp: 0 });
  const fl = mk(); const fr = mk();
  const run = (f, x, hz, q) => {
    const w = 2 * Math.sin(Math.PI * Math.min(hz, RATE / 6) / RATE);
    const hp = x - f.lp - f.bp / q;
    f.bp += w * hp; f.lp += w * f.bp;
    return f.bp;
  };
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const hz = 2600 * Math.pow(0.12, t);                   // 2600 Hz down to about 310
    const env = Math.min(1, i / (RATE * 0.25)) * (0.35 + 0.65 * t) * Math.min(1, (n - i) / (RATE * 0.08));
    const x = rnd();
    L[i] = run(fl, x, hz, 2.2) * env * 0.9 * 32768;
    R[i] = run(fr, rnd() * 0.5 + x * 0.5, hz * 1.06, 2.2) * env * 0.9 * 32768;
  }
  // Keep the peak in range.
  let peak = 1; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = 0.8 * 32767 / peak;
  for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
  return [L, R];
}

// ------------------------------------------------------------------ things in the world
// A chaser (Battle's enemy, in a battle or island area): it comes at you while you
// are in its area, wanders when you are not, and never leaves the area.
class Chaser {
  constructor(area, pos, speed, soundIdx) {
    this.kind = 'chaser';
    this.area = area;
    [this.x, this.y] = pos;
    this.speed = speed;
    this.soundIdx = soundIdx;
    this.soundName = 'obstacle_' + soundIdx;
    this.voice = null;
    this.goal = null;
    this.goalTimer = 0;
  }
}

// ------------------------------------------------------------------ the mode
const mixin = {
  startUltimate() {
    this.state = STATE;
    this.resetGameState();
    this.state = STATE;
    this._wake(true);
    if (this.ambienceChannel) { this.ambienceChannel.stop(); this.ambienceChannel = null; }
    if (this.beatChannel) { this.beatChannel.stop(); this.beatChannel = null; }
    makeSounds(this.audio);
    this.audio.spatialOn();
    this.audio.setWorldLevel(1, 0.01);
    this.audio.setMuffle(false, 0.01);
    this.audio.prepare('elevator_ride');
    const u = this.ut = {
      run: this.runId,
      worldNo: 0, worlds: 0, elapsed: 0.0, worldTime: 0.0, worldLen: 0.0, phase: 'play', gap: 0.0, safe: 0.0, lastCount: -1,
      hp: START_HP, ammo: randint(START_AMMO[0], START_AMMO[1]), items: randint(START_ITEMS[0], START_ITEMS[1]),
      points: 0, worldPoints: 0, worldDamage: 0, kills: 0, speedBonus: 1.0,
      world: null, area: null, areaSounds: new Map(), enemies: [], projectiles: [], towerItems: new Map(),
      pickups: [], timers: [], respawn: new Map(), potionDue: new Map(), hitCooldown: 0, lowWarned: false,
      place: 'world', ride: null, seabed: null, lift: null, liftArmed: false, dingTimer: 0,
      compass: { on: false, t: 0 }, prox: 0, steps: [],
      face: 0, turn: null, turnWas: null,   // the way you face (radians clockwise from north), the turn in progress, if any, and a held turn only just let go (_utTurnEnd)
      voices: new Set(), shots: new Set(),
    };
    // The menu's words stop; the world says the rest. (Nothing is announced: the
    // one-time notice of 4.0.0 is gone since 5.0.0.)
    this.tts.speak('', { interrupt: true });
    this._utNewWorld(true);
  },

  // ---------------------------------------------------------------- difficulty (tune)
  _utEasy() { return this.ut.elapsed < EASY_SECONDS; },

  _utDamage() {
    const t = this.ut.elapsed;
    if (t < EASY_SECONDS) return DAMAGE_START;
    return Math.min(DAMAGE_CAP, Math.round(DAMAGE_START + (t - EASY_SECONDS) / 60 * DAMAGE_PER_MINUTE));
  },

  // How many enemies an enemy area gets, drawn when the world is made.
  _utEnemyCount() {
    const t = this.ut.elapsed;
    if (t < EASY_SECONDS) return randint(ENEMIES_EASY[0], ENEMIES_EASY[1]);
    const base = Math.min(ENEMIES_MAX, 1 + Math.floor((t - EASY_SECONDS) / 60 * ENEMIES_PER_MINUTE));
    return randint(base, Math.min(ENEMIES_MAX, base + 2));
  },

  // Enemy speed against the start: slowly up with time after the easy stretch,
  // and a little more for every world done well, never above SPEED_CAP.
  _utSpeedMul() {
    const t = this.ut.elapsed;
    const time = t < EASY_SECONDS ? 0 : Math.min(SPEED_RISE, (t - EASY_SECONDS) / (SPEED_RISE_MINUTES * 60) * SPEED_RISE);
    return Math.min(SPEED_CAP, (1 + time) * this.ut.speedBonus);
  },

  // A thrower's difficulty for TowerEnemy: tower one's first floors at the start,
  // tower three's deep into a run (its hits needed and throws follow).
  _utThrowerDifficulty() {
    return Math.max(1, Math.min(THROWER_MAX, 1 + Math.floor(this.ut.elapsed / THROWER_SECONDS)));
  },

  _utMultiplier() { return 1 + MULTIPLIER_STEP * this.ut.worlds; },

  // Every cartridge holds AMMO_SHOTS, early or late: the number of cartridges
  // already rises with the enemies (AMMO_PER_ENEMY), so growing each one as well
  // counted the rise twice and ammo piled up without end.
  _utShotsPerCartridge() {
    return randint(AMMO_SHOTS[0], AMMO_SHOTS[1]);
  },

  // Points earned now: nothing in a safe zone, nothing while the compass is on.
  _utScore(base, { safeOk = false } = {}) {
    const u = this.ut;
    if (u.compass.on || (this._utInSafeZone() && !safeOk)) return;
    const got = Math.round(base * this._utMultiplier());
    u.points += got;
    u.worldPoints += base;
  },

  _utInSafeZone() {
    const u = this.ut;
    return (u.place === 'world' || u.place === 'slide' || u.place === 'bus') && u.area && u.area.kind === 'event';
  },

  // ---------------------------------------------------------------- a world
  _utNewWorld(first = false) {
    const u = this.ut;
    u.worldNo += 1;
    u.world = makeWorld();
    const w = u.world;
    u.worldLen = uniform(WORLD_SECONDS[0], WORLD_SECONDS[1]);
    u.worldTime = u.worldLen;
    u.lastCount = -1;
    u.phase = first ? 'play' : 'fadein';
    u.gap = first ? 0 : FADE_IN;
    u.safe = SAFE_SECONDS + (first ? 0 : FADE_IN);
    u.enemies = []; u.projectiles = []; u.pickups = []; u.timers = []; u.respawn = new Map();
    u.towerItems = new Map(); u.potionDue = new Map();    // (the items in your hands stay there: they are carried like ammo)
    u.place = 'world'; u.ride = null; u.rideMix = null; u.seabed = null; u.lift = null; u.liftArmed = false; u.dingTimer = 0; u.slide = null; u.slides = []; u.cases = []; u.glass = []; u.bus = null; u.busAt = null; u.shSafe = 0; u.shBus = 0;
    this._utCompassOff(true);
    u.worldPoints = 0; u.worldDamage = 0;
    u.steps = [];
    this.battleSteps = [];
    this.stride = null;
    // Each area's own air: a drone of its home mode, a shore, or an event background.
    const used = new Set();
    const pick = (list) => { const free = list.filter((n) => !used.has(n)); const n = choice(free.length ? free : list); used.add(n); return n; };
    for (const a of w.areas) {
      a.room = { labyrinth: 'lab', battle: 'battle', tower: 'tower', island: null, event: null }[a.kind];
      a.stretch = { labyrinth: 0.9, battle: 1.4, tower: 1.15, island: 1, event: 1 }[a.kind] * uniform(0.9, 1.15);
      a.steps = a.kind === 'island' ? STEPS_SAND : STEPS_STONE;
      if (a.kind === 'labyrinth') a.ambience = pick(LABYRINTH_DRONES);
      else if (a.kind === 'battle') {
        a.ambience = pick(BATTLE_DRONES); a.drums = pick(BATTLE_DRUMS);
        if (this.audio.has(BATTLE_CROWD)) a.crowd = aliasRecording(this.audio, BATTLE_CROWD, `event_amb_file_${BATTLE_CROWD}`);
      }
      else if (a.kind === 'tower') a.ambience = pick(TOWER_DRONES);
      else if (a.kind === 'island') {
        a.ambience = pick(ISLAND_SHORES.filter((n) => this.audio.has(n)));
        a.elevator = [a.x0 + Math.floor(AREA_CELLS / 2), a.y0 + Math.floor(AREA_CELLS / 2)];   // the middle of the island
      }
      else {
        const stem = pick(EVENT_BACKGROUNDS.filter((n) => this.audio.has(n)));
        a.ambience = aliasRecording(this.audio, stem, `event_amb_file_${stem}`) || 'event_amb_cathedral';
        [a.room, a.stretch] = backgroundRoom(stem);
        a.stretch *= uniform(0.95, 1.08);
        if (WATER_PARK.test(stem)) a.waterPark = true;
      }
    }
    // Dropped in silently, somewhere at random.
    const startArea = choice(w.areas);
    const startCell = choice(startArea.floorCells.filter(([cx, cy]) => !(startArea.elevator && cx === startArea.elevator[0] && cy === startArea.elevator[1])));
    this.playerPos = posOf(startCell[0], startCell[1]);
    // (You face as you did: nothing turns you. A new run begins facing north.)
    this._utFace(u.face, true);
    this.arenaLimit = 0;
    u.area = startArea;
    this._utListenerMix();
    // Enemies, by area; ammo, credits; the safe zones' own cartridges.
    const mul = this._utSpeedMul();
    let total = 0;
    for (const a of w.areas) {
      if (!['battle', 'island', 'tower'].includes(a.kind)) continue;
      // A tower area has one rival, as a tower floor does; chasers go by the ramp.
      a.enemyCount = a.kind === 'tower' ? 1 : this._utEnemyCount();
      total += a.enemyCount;
      for (let i = 0; i < a.enemyCount; i++) this._utSpawnEnemy(a, mul, true);
      if (a.kind === 'tower') this._utSpawnTowerItem(a);
    }
    const cartridges = Math.max(AMMO_MIN, Math.ceil(total * AMMO_PER_ENEMY));
    // Spread across the areas: every dangerous area gets one before any gets two,
    // so one cartridge is never mistaken for several beeping together.
    const dangerous = w.areas.filter((a) => a.kind !== 'event');
    const order = []; while (order.length < cartridges) order.push(...shuffle(dangerous.slice()));
    for (let i = 0; i < cartridges; i++) this._utSpawnPickup('ammo', order[i]);
    for (const a of w.areas.filter((x) => x.kind === 'event')) this._utSpawnPickup('ammo', a, { safe: true });
    const credits = randint(CREDITS_AT_ONCE[0], CREDITS_AT_ONCE[1]);
    for (let i = 0; i < credits; i++) this._utSpawnPickup('credit', choice(w.areas));
    // The water parks: one slide in each safe zone with a water background.
    u.slides = [];
    for (const a of w.areas.filter((x) => x.waterPark)) {
      const pos = randomFloor(u.world, a, rand, { from: this.playerPos, minDist: 12.0, avoid: u.pickups.map((p) => p.pos), clearance: 6.0 });
      if (!pos) continue;
      // Its pool: somewhere else in the park, where you splash down.
      // (All of it inside the park where there is room, so that every way out of
      // it is the same few steps; and never so near the slide that it reaches it.)
      let pool = null;
      const inside = (p) => p[0] - a.x0 * CELL >= POOL_RADIUS && a.x1 * CELL - p[0] >= POOL_RADIUS && p[1] - a.y0 * CELL >= POOL_RADIUS && a.y1 * CELL - p[1] >= POOL_RADIUS;
      for (let i = 0; i < 40 && !pool; i++) {
        const p = randomFloor(u.world, a, rand, { from: pos, minDist: SLIDE_LAND_AWAY, avoid: u.pickups.map((q) => q.pos), clearance: POOL_RADIUS });
        if (p && inside(p)) pool = p;
      }
      if (!pool) pool = randomFloor(u.world, a, rand, { from: pos, minDist: SLIDE_LAND_AWAY }) || randomFloor(u.world, a, rand, { from: pos, minDist: 8.0 });
      u.slides.push({ area: a, pos, voice: null, pool });
    }
    u.slide = null;
    // The glass cases: one in some of the battle areas, islands and labyrinths.
    u.cases = []; u.glass = [];
    if (this.audio.has(CASE_SOUND)) {
      for (const a of shuffle(w.areas.filter((x) => CASE_KINDS.includes(x.kind)))) {
        if (u.cases.length >= CASE_MAX || rand() >= CASE_CHANCE) continue;
        const avoid = [...u.pickups.map((p) => p.pos), ...u.enemies.filter((e) => e.area === a).map((e) => [e.x, e.y]), ...(a.elevator ? [posOf(a.elevator[0], a.elevator[1])] : [])];
        const pos = randomFloor(u.world, a, rand, { from: this.playerPos, minDist: 15.0, avoid, clearance: 6.0 });
        if (pos) u.cases.push({ area: a, pos, voice: null, near: false, smashed: false });
      }
    }
    // The bus, if this world has one: due at a random moment of the world's
    // middle; it comes the first time, from then, that a safe zone is far from you.
    u.bus = null;
    u.busAt = (rand() < BUS_CHANCE && u.worldTime > BUS_APPEARS[0] + BUS_APPEARS[1] + 10) ? uniform(BUS_APPEARS[0], u.worldTime - BUS_APPEARS[1]) : null;
    u.busElapsed = 0;
    this._utRefreshRooms();
    this._utPotions(0);        // already low: the new world's safe zones have their potions from the start
    if (!first) this.audio.setWorldLevel(1, FADE_IN);
  },

  // Stop and forget every sound of the world that is ending.
  _utStopWorld(fadeMs = 0) {
    const u = this.ut;
    for (const v of [...u.voices]) { if (fadeMs > 0) v.fadeout(fadeMs); else v.stop(); }
    u.voices.clear();
    // The world's one-shots too (a crowd's roar, a door, the slide): a sound of the
    // old world must not fade back in with the new one (Russell, 8 Nov).
    for (const v of [...u.shots]) { if (fadeMs > 0) v.fadeout(fadeMs); else v.stop(); }
    u.shots.clear();
    u.areaSounds.clear();
    for (const e of u.enemies) e.voice = null;
    for (const p of u.pickups) p.voice = null;
    for (const s of u.projectiles) s.channel = null;
    for (const it of u.towerItems.values()) it.channel = null;
    for (const sl of u.slides || []) sl.voice = null;
    for (const c of u.cases || []) c.voice = null;
    if (u.bus) { if (u.bus.pullVoice) u.bus.pullVoice.stop(); u.bus.voice = null; u.bus.rideVoice = null; u.bus.pullVoice = null; u.bus.doorVoice = null; }
    u.lift = null;
    if (u.ride && u.ride.voice) { u.ride.voice.stop(); u.ride.voice = null; }
    u.rideMix = null;
    this.audio.listenerMix = null;
    if (u.compass.on) this._utCompassOff(true);
    this.stride = null;
  },

  // A sound of this world: played, remembered, and placed.
  // (`keep`: a cue that is never stopped to make room for newer one-shots; see
  // AudioEngine.play.)
  // (`wide`: a recording with no place that still turns with the world as you turn.)
  _utPlay(name, pos, { loops = 0, volume = 1.0, fadeMs = 0, height = 0, direct = false, send = null, keep = false, wide = false } = {}) {
    const u = this.ut;
    const rel = this._utRel(pos);
    const v = this.audio.play(name, { loops, volume: 0.0, fadeMs, pos: pos ? rel : null, height, areaMix: pos ? this._utMixAt(pos) : null, direct, send, keep, wide });
    if (!v) return null;
    if (pos) v.setSpatial(volume, rel[0], rel[1], this._behind(pos), height); else v.setVolume(volume, volume);
    if (loops === -1) u.voices.add(v); else u.shots.add(v);
    return v;
  },

  // One of a list, never the one heard last (so a crowd of seven roars is not
  // heard to repeat itself).
  _utFresh(list, memo) {
    const u = this.ut;
    const pool = list.length > 1 ? list.filter((n) => n !== u[memo]) : list;
    const n = choice(pool);
    u[memo] = n;
    return n;
  },

  // The world's one-shots that have finished are forgotten (a few at a time).
  _utPruneShots() {
    const u = this.ut;
    if (u.shots.size === 0) return;
    for (const v of u.shots) if (!v.busy) u.shots.delete(v);
  },

  // Where a position is, relative to the player (x east, z south).
  // Where a thing is from where you stand, in the world's own directions (east,
  // south): the listener's turning (AudioEngine.setFacing) does the rest.
  _utRel(pos) { return pos ? [pos[0] - this.playerPos[0], pos[1] - this.playerPos[1]] : [0, 0]; },

  // ---------------------------------------------------------------- turning (web 4.0.0)
  // The way you face, as a unit vector in the world ([east, south]). Squared up it
  // is exact, so a step is cell to cell with nothing left over.
  _utForward() { return forwardOf(this.ut.face); },

  // Face a new way: the listener turns, and every placed sound with it.
  _utFace(angle, instant = false) {
    const u = this.ut;
    u.face = snapFace(angle);
    this.playerFacing = this._utForward();
    this.audio.setFacing(u.face, instant);
  },

  // Whether a place is in front of you: within AIM_HALF of the way you face.
  _utInFront(pos) {
    const f = this._utForward();
    const dx = pos[0] - this.playerPos[0]; const dy = pos[1] - this.playerPos[1];
    const d = Math.hypot(dx, dy);
    return d > 0 && (dx * f[0] + dy * f[1]) / d >= Math.cos(AIM_HALF);
  },

  // Which way a direction of the world lies from the way you face: 'ahead',
  // 'right', 'behind' or 'left', whichever is nearest.
  _utSide(dir) {
    const rel = wrapAngle(Math.atan2(dir[0], -dir[1]) - this.ut.face);
    return ['ahead', 'right', 'behind', 'left'][Math.round(rel / QUARTER) % 4];
  },

  // Where a main direction of the world lies from the way you face, in words that
  // name it: "north, straight ahead", "east, to your right", "south, behind you",
  // "west, 30 degrees to your left" (to the nearest five degrees).
  _utBearing(dir) {
    const name = MAIN_WORDS[COMPASS_DIRS.findIndex((d) => d[0] === dir[0] && d[1] === dir[1])];
    let off = wrapAngle(Math.atan2(dir[0], -dir[1]) - this.ut.face);
    if (off > Math.PI) off -= TWO_PI;          // (to your right when it is more than nothing)
    const deg = Math.round(Math.abs(off) / DEG / 5) * 5;
    const side = off > 0 ? 'right' : 'left';
    if (deg < 5) return `${name}, straight ahead`;
    if (deg > 175) return `${name}, behind you`;
    if (deg === 90) return `${name}, to your ${side}`;
    return `${name}, ${deg} degrees to your ${side}`;
  },

  // You can turn on the ground and on the seabed: not on a ride, and not between worlds.
  _utCanTurn() {
    const u = this.ut;
    return !!u && u.phase !== 'silence' && (u.place === 'world' || u.place === 'seabed');
  },

  // A quick turn (a swipe, one press of an arrow): to the next step of 30 degrees
  // that way, so three of them from a main direction reach the next one. Stopped
  // in between two steps by a held turn, it takes you onto the next step.
  _utTurnQuick(dir) {
    const u = this.ut;
    if (!this._utCanTurn()) { u.turnWas = null; return; }
    turnQuick(u, dir);
  },

  // A held turn: free until it is let go; you stop exactly there.
  _utTurnStart(dir) {
    if (!this._utCanTurn()) return;
    turnStart(this.ut, dir, (a) => this._utFace(a));
  },

  _utTurnEnd() { turnEnd(this.ut); },

  // Whatever turn is under way ends now (a pause, help, a ride): a quick turn
  // lands where it was going, a held one stops where it is.
  _utTurnStop() { turnStop(this.ut, (a, instant) => this._utFace(a, instant)); },

  // The tick of a main direction, as you pass it or land on it: north the higher one.
  _utTick(k) {
    this.audio.play(((k % 4) + 4) % 4 === 0 ? 'ut_tick_north' : 'ut_tick', { direct: true, volume: TICK_LEVEL });
  },

  // The softer, lower click of a quick turn that lands between two main directions.
  _utClick() {
    this.audio.play('ut_click', { direct: true, volume: CLICK_LEVEL });
  },

  // The turn, every frame.
  _utUpdateTurn(dt) {
    const u = this.ut;
    if (u.turn && !this._utCanTurn()) { this._utTurnStop(); return; }
    updateTurn(u, dt, {
      face: (a, instant) => this._utFace(a, instant),
      tick: (k) => this._utTick(k),
      click: () => this._utClick(),
      // Landed on its step: with the compass on, what lies ahead.
      landed: (k) => {
        if (!u.compass.on) return;
        u.compass.t = COMPASS_BEEP_EVERY;   // a beep at once, for the new way
        this.tts.speak(this._utCompassWords(k), { interrupt: true });
      },
    });
  },

  _utMixAt(pos) {
    const u = this.ut;
    if ((u.place !== 'world' && u.place !== 'slide' && u.place !== 'bus') || !u.world) return {};
    return echoMix(u.world, pos);
  },

  // The echo where the player stands, for every sound played with no place of its
  // own (a footstep, the countdown, a pickup's chime, the laser): set whenever the
  // player moves or the world changes under them.
  _utListenerMix() {
    this.audio.listenerMix = this._utMixAt(this.playerPos);
  },

  // Keep a placed loop up to date: level by distance, place, behind, echo mix.
  _utFollow(v, pos, level, height = 0, dull = 0) {
    if (!v) return;
    const rel = this._utRel(pos);
    v.setSpatial(level, rel[0], rel[1], Math.max(this._behind(pos), dull), height);
    v.setAreaMix(this._utMixAt(pos));
  },

  // The echoes kept ready: the player's area and its neighbours.
  _utRefreshRooms() {
    const u = this.ut;
    if (u.place !== 'world') { this.audio.setAreaRooms([]); return; }
    const near = this._utNearAreas();
    this.audio.setAreaRooms(near.map((a) => ({ id: a.id, room: a.room, stretch: a.stretch })));
  },

  _utNearAreas() {
    const u = this.ut;
    const a = u.area;
    if (!a) return [];
    const ids = new Set([a.id]);
    for (const b of a.borders) ids.add(b.a === a.id ? b.b : b.a);
    return u.world.areas.filter((x) => ids.has(x.id));
  },

  // ---------------------------------------------------------------- enemies
  _utSpawnEnemy(a, mul = this._utSpeedMul(), atStart = false) {
    const u = this.ut;
    const avoid = u.enemies.filter((e) => e.area === a).map((e) => [e.x, e.y]);
    const pos = randomFloor(u.world, a, rand, { from: this.playerPos, minDist: 14.0, avoid, clearance: 6.0 })
      || randomFloor(u.world, a, rand, { from: this.playerPos, minDist: 10.0 });
    if (!pos) return null;
    let e;
    if (a.kind === 'tower') {
      const diff = this._utThrowerDifficulty();
      e = new TowerEnemy([0, 0], diff, randint(0, 9), ARENA, 1, 0);
      // The hits it takes grow with the minutes, not the square root of the difficulty
      // alone: items are won one race at a time here (tower one caps them by floor).
      e.hitsNeeded = Math.max(1, Math.min(e.hitsNeeded, 1 + Math.floor(this.ut.elapsed / 60 / THROWER_HITS_MINUTES)));
      e.kind = 'thrower';
      e.area = a;
      [e.x, e.y] = [pos[0] - a.centre[0], pos[1] - a.centre[1]];
      e.baseSpeed = e.speed = e.speed * mul;
      e.throwCd = e.baseThrowCd = e.throwCd / mul;
      e.cooldown = e.throwCd;
      e.notice = atStart ? 2.5 : 1.0;
      e.voice = null;
    } else {
      e = new Chaser(a, pos, CHASER_SPEED * mul, randint(0, 9));
    }
    u.enemies.push(e);
    return e;
  },

  _utEnemyPos(e) { return e.kind === 'thrower' ? [e.x + e.area.centre[0], e.y + e.area.centre[1]] : [e.x, e.y]; },

  _utKillEnemy(e, hitBy) {
    const u = this.ut;
    const pos = this._utEnemyPos(e);
    if (e.voice) { e.voice.stop(); u.voices.delete(e.voice); e.voice = null; }
    u.enemies.splice(u.enemies.indexOf(e), 1);
    u.kills += 1;
    this._utScore(POINTS[e.kind]);
    const d = dist2(pos, this.playerPos);
    const bang = Math.min(0.5, d * 0.015);
    this._utLater(bang, 'explosion', pos);
    // In a battle area the crowd erupts the moment the bang is heard (Russell, 8
    // Nov): all round you, in the area's room.
    if (e.area && e.area.crowd && e.area === u.area) {
      const roar = ROARS.filter((n) => this.audio.has(n));
      if (roar.length) { const name = this._utFresh(roar, 'lastRoar'); this._utLater(bang + ROAR_AFTER, name, null, { volume: ROAR_LEVEL, send: crowdSend(name) }); }
    }
    if (e.kind === 'thrower') {
      // Its throws in the air go with it.
      for (const s of [...u.projectiles]) if (s.owner === e) this._utDropProjectile(s);
    }
    // Another comes, in a while (not for one that came for the glass: those are
    // only as many as came).
    if (e.hunter) return;
    const a = e.area;
    const t = u.respawn.get(a.id) || [];
    t.push(uniform(RESPAWN_ENEMY[0], RESPAWN_ENEMY[1]));
    u.respawn.set(a.id, t);
  },

  _utDropProjectile(s) {
    const u = this.ut;
    if (s.channel) { s.channel.stop(); u.voices.delete(s.channel); s.channel = null; }
    const i = u.projectiles.indexOf(s);
    if (i >= 0) u.projectiles.splice(i, 1);
  },

  // Struck: the damage of the moment, never over the cap; the run ends at zero.
  _utHurt(by) {
    const u = this.ut;
    if (u.safe > 0 || u.hitCooldown > 0 || u.compass.on) return;
    if (u.place === 'bus' || u.place === 'slide') return;   // aboard the bus or on the slide, nothing reaches you
    const dmg = this._utDamage();
    u.hp = Math.max(0, u.hp - dmg);
    u.worldDamage += dmg;
    u.hitCooldown = HIT_COOLDOWN;
    this.audio.play('player_hit', { keep: true });
    // In a battle area the crowd reacts to the blow (the last one too).
    const crowd = !!(u.area && u.area.crowd && u.place === 'world');
    const react = HIT_REACTIONS.filter((n) => this.audio.has(n));
    if (u.hp <= 0) {
      if (crowd && react.length) { const name = this._utFresh(react, 'lastReact'); this._utPlay(name, null, { volume: HIT_REACT_LEVEL, send: crowdSend(name) }); }
      this._utGameOver();
      return;
    }
    if (crowd && react.length) { const name = this._utFresh(react, 'lastReact'); this._utLater(HIT_REACT_AFTER, name, null, { volume: HIT_REACT_LEVEL, send: crowdSend(name) }); }
    // Tower's low-health warning, with its words and its threshold.
    const low = Math.max(35, 2 * dmg);
    if (u.hp <= low && !u.lowWarned) {
      u.lowWarned = true;
      this.audio.play('health_low', { keep: true });
      this.tts.speak(`Health low. ${u.hp}.`, { interrupt: true });
    }
    this._utPotions(0);
  },

  // The potions, every frame: one in every safe zone while health is low (a
  // drunk one back after a wait), none once it is not.
  _utPotions(dt) {
    const u = this.ut;
    if (!u.world) return;
    // A zone's refill wait runs on whatever the health does.
    for (const [id, due] of u.potionDue) { if (due - dt <= 0) u.potionDue.delete(id); else u.potionDue.set(id, due - dt); }
    if (u.hp >= POTION_BELOW) {
      for (const p of u.pickups.filter((x) => x.kind === 'potion')) this._utRemovePickup(p);
      return;
    }
    for (const a of u.world.areas) {
      if (a.kind !== 'event') continue;
      if (u.pickups.some((p) => p.kind === 'potion' && p.area === a)) continue;
      if (u.potionDue.has(a.id)) continue;
      if (!this._utSpawnPickup('potion', a, { safe: true })) u.potionDue.set(a.id, 1.0);
    }
  },

  _utRemovePickup(p) {
    const u = this.ut;
    if (p.voice) { p.voice.stop(); u.voices.delete(p.voice); p.voice = null; }
    const i = u.pickups.indexOf(p);
    if (i >= 0) u.pickups.splice(i, 1);
  },

  // ---------------------------------------------------------------- pickups
  _utSpawnPickup(kind, area, { safe = false, pos = null } = {}) {
    const u = this.ut;
    const taken = u.pickups.map((p) => p.pos);
    const p = { kind, area, safe, pos: pos || randomFloor(u.world, area, rand, { from: this.playerPos, minDist: 10.0, avoid: taken, clearance: 7.0 }) };
    if (!p.pos) return null;
    if (area.elevator && cellOf(p.pos)[0] === area.elevator[0] && cellOf(p.pos)[1] === area.elevator[1]) return null;
    if (kind === 'ammo') { p.shots = this._utShotsPerCartridge(); p.beacon = 'ammo_beacon'; p.gain = 0.55; }
    else if (kind === 'credit') { p.value = choice(CREDIT_VALUES); p.beacon = `credit_beacon_${p.value}`; p.gain = 0.7; }
    else { p.beacon = 'potion_beacon'; p.gain = 0.8; }
    u.pickups.push(p);
    return p;
  },

  _utTakePickup(p) {
    const u = this.ut;
    const safe = this._utInSafeZone();
    if (p.voice) { p.voice.stop(); u.voices.delete(p.voice); p.voice = null; }
    u.pickups.splice(u.pickups.indexOf(p), 1);
    if (p.kind === 'ammo') {
      u.ammo += p.shots;
      this.audio.play('ammo');
      if (!safe) this._utScore(POINTS.ammo);
      if (p.safe) u.timers.push({ at: SAFE_AMMO_EVERY, kind: 'ammo', area: p.area, safe: true });
      else u.timers.push({ at: uniform(RESPAWN_PICKUP[0], RESPAWN_PICKUP[1]), kind: 'ammo' });
    } else if (p.kind === 'credit') {
      this.audio.play('credit_chaos');
      this._utScore(p.value);
      // A credit taken in a safe zone comes back out in a dangerous area.
      u.timers.push({ at: uniform(RESPAWN_PICKUP[0], RESPAWN_PICKUP[1]), kind: 'credit', danger: true });
    } else {
      u.hp = START_HP;
      u.lowWarned = false;
      this.audio.play('potion_drink');
      if (!safe) this._utScore(POINTS.potion);
      u.potionDue.set(p.area.id, POTION_REFILL);   // this zone's next, if health is low again by then
    }
  },

  _utSpawnTowerItem(a) {
    const u = this.ut;
    const old = u.towerItems.get(a.id);
    if (old && old.channel) { old.channel.stop(); u.voices.delete(old.channel); }
    // Where a tower floor puts it: 12 to 30 units from you (from the area's middle
    // while you are elsewhere), clear of the rival; failing that, anywhere in the area.
    const from = u.area === a ? this.playerPos : a.centre;
    const avoid = u.enemies.filter((e) => e.area === a).map((e) => this._utEnemyPos(e));
    const pos = randomFloor(u.world, a, rand, { from, minDist: ITEM_NEAR[0], maxDist: ITEM_NEAR[1], avoid, clearance: 10.0 })
      || randomFloor(u.world, a, rand, { from, minDist: ITEM_NEAR[0], maxDist: ITEM_NEAR[1] * 1.5, avoid, clearance: 6.0 })
      || randomFloor(u.world, a, rand, { from, minDist: 10.0, avoid, clearance: 10.0 });
    if (!pos) { u.towerItems.delete(a.id); return; }
    const item = new TowerItem([0, 0], ARENA);
    [item.x, item.y] = [pos[0] - a.centre[0], pos[1] - a.centre[1]];
    item.area = a;
    item.channel = null;
    u.towerItems.set(a.id, item);
  },

  _utItemPos(item) { return [item.x + item.area.centre[0], item.y + item.area.centre[1]]; },

  // How many tower items the player holds. They are carried like ammo, from area
  // to area and from world to world, and thrown only in a tower area (Russell,
  // 10 Nov: so that the player is not hunting for items all the time. Until web
  // 3.3.0 they belonged to the tower area they were picked up in, and were gone
  // on leaving it).
  _utItemsHeld() { return this.ut.items; },

  // ---------------------------------------------------------------- timing
  _utLater(delay, name, pos, opts = {}) {
    const run = this.ut.run; const worldNo = this.ut.worldNo;
    const fire = () => {
      // Only in the run and the world it was meant for: a roar due as the world
      // ends is not heard in the next one.
      if (!this.ut || this.ut.run !== run || this.ut.worldNo !== worldNo || this.state !== STATE) return;
      if (this.isPaused || this.state === 'confirm_exit' || this.state === 'help') { setTimeout(fire, 250); return; }
      this._utPlay(name, pos, opts);
    };
    setTimeout(fire, Math.max(0, delay) * 1000);
  },

  // ---------------------------------------------------------------- the frame
  updateUltimateMode(dt) {
    const u = this.ut;
    if (!u || this.isPaused) return;
    if (u.phase === 'silence' || u.phase === 'fadein') {
      u.gap -= dt;
      if (u.phase === 'silence' && u.gap <= 0) {
        this._utNewWorld();
        return;
      }
      if (u.phase === 'fadein' && u.gap <= 0) u.phase = 'play';
    }
    if (u.phase === 'silence') return;
    u.elapsed += dt;
    if (u.safe > 0) u.safe -= dt;
    if (u.hitCooldown > 0) u.hitCooldown -= dt;
    // The regeneration countdown runs whatever else is happening (the compass too).
    u.worldTime -= dt;
    // Nothing says how long is left: the five-second count is the only warning.
    const left = Math.ceil(u.worldTime);
    if (left >= 1 && left <= COUNT_FROM && left !== u.lastCount) {
      u.lastCount = left;
      this.audio.play('countdown_high', { keep: true });   // the only warning there is: never crowded out
    }
    if (u.phase === 'play' && u.worldTime <= FADE_OUT) {
      u.phase = 'fading';
      this.audio.setWorldLevel(0, FADE_OUT);
    }
    if (u.worldTime <= 0) {
      this._utEndWorld();
      return;
    }
    this._utUpdateTurn(dt);
    if (u.compass.on) {
      this._utCompassTick(dt);
      this._utUpdateSounds(dt);   // the world keeps breathing under the muffle
      return;
    }
    if (u.place === 'ride') { this._utUpdateRide(dt); return; }
    if (u.place === 'slide') {
      // On the water slide: the world goes on around you, you cannot act.
      this._utUpdateSlide(dt);
      if (u.place === 'slide') { this._utTimers(dt); this._utUpdateEnemies(dt); if (this.state !== STATE) return; this._utUpdateProjectiles(dt); this._utUpdateSounds(dt); return; }
    }
    this._utUpdateBus(dt);
    if (u.place === 'bus') { this._utTimers(dt); this._utUpdateEnemies(dt); if (this.state !== STATE) return; this._utUpdateSounds(dt); return; }
    if (u.place === 'seabed') { this._utUpdateSeabed(dt); this._utUpdateSounds(dt); return; }
    this._utTimers(dt);
    this._utUpdateEnemies(dt);
    if (this.state !== STATE) return;
    this._utUpdatePickups();
    this._utUpdateCases(dt);
    this._utUpdateTower(dt);
    this._utUpdateLift(dt);
    this._utUpdateSounds(dt);
  },

  _utEndWorld() {
    const u = this.ut;
    const base = u.worldPoints;
    const well = base >= WELL_POINTS && u.worldDamage <= WELL_DAMAGE;
    if (well) u.speedBonus = Math.min(SPEED_CAP, u.speedBonus * SPEED_WELL);
    u.worlds += 1;
    this._utStopWorld();
    this.audio.setWorldLevel(0, 0.01);
    this.audio.setAreaRooms([], { now: true });   // the old rooms go at once: nothing of them is heard again
    u.phase = 'silence';
    u.gap = SILENCE;
    u.worldTime = 0;
    // No gap: the next world is there the moment the count reaches zero.
    if (SILENCE <= 0) this._utNewWorld();
  },

  _utTimers(dt) {
    const u = this.ut;
    const noSpawn = u.worldTime <= NO_SPAWN_FROM;
    // Pickups coming back.
    for (const t of [...u.timers]) {
      t.at -= dt;
      if (t.at > 0 || noSpawn) continue;
      u.timers.splice(u.timers.indexOf(t), 1);
      const w = u.world;
      let area = t.area;
      if (!area) {
        let pool = t.danger ? w.areas.filter((a) => a.kind !== 'event') : w.areas.filter((a) => a.kind !== 'event' || t.kind !== 'ammo');
        // A cartridge comes back in an area without one, while there is such an area.
        if (t.kind === 'ammo') { const empty = pool.filter((a) => !u.pickups.some((p) => p.kind === 'ammo' && p.area === a)); if (empty.length) pool = empty; }
        area = choice(pool.length ? pool : w.areas);
      }
      // No spot found this time (a crowded area): tried again in a moment.
      if (!this._utSpawnPickup(t.kind, area, { safe: !!t.safe })) { t.at = 2.0; u.timers.push(t); }
    }
    // Enemies coming back.
    for (const [id, list] of u.respawn) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i] -= dt;
        if (list[i] > 0 || noSpawn) continue;
        list.splice(i, 1);
        this._utSpawnEnemy(u.world.areas[id]);
      }
    }
    // The potions in the safe zones, while health is low.
    if (!noSpawn) this._utPotions(dt);
  },

  // ---------------------------------------------------------------- enemies, every frame
  _utUpdateEnemies(dt) {
    const u = this.ut;
    const steps = u.steps; u.steps = [];
    // On the bus or the slide you are out of their reach and out of their minds:
    // a thrower only races for items, a chaser wanders (Russell, 8 Nov: on the bus
    // the throwers kept throwing).
    const here = u.place === 'world' ? u.area : null;
    for (const e of [...u.enemies]) {
      if (e.kind === 'thrower') { this._utUpdateThrower(e, dt, e.area === here); continue; }
      const a = e.area;
      const was = [e.x, e.y];
      // A chaser woken by breaking glass hunts you only while you are on the ground
      // in its area: get out of the area (or onto a bus, or down the lift) and it
      // gives up and is gone.
      if (e.hunter && a !== here) { this._utDropHunter(e); continue; }
      if (e.hunter) e.age += dt;
      if (a === here) {
        // Straight at you; but in a labyrinth a hunter cannot come through the
        // walls, so it follows the corridors, square by square, the shortest way.
        let to = this.playerPos;
        if (e.hunter && a.kind === 'labyrinth') {
          const mine = cellOf([e.x, e.y]); const yours = cellOf(this.playerPos);
          e.pathT = (e.pathT || 0) - dt;
          if (!e.path || e.pathT <= 0 || !e.pathGoal || e.pathGoal[0] !== yours[0] || e.pathGoal[1] !== yours[1]) {
            e.path = routeToward(u.world, mine, null, yours) || [];
            e.pathGoal = yours; e.pathT = 0.6;
          }
          while (e.path.length && e.path[0][0] === mine[0] && e.path[0][1] === mine[1]) e.path.shift();
          if (e.path.length) to = posOf(e.path[0][0], e.path[0][1]);
        }
        const dx = to[0] - e.x; const dy = to[1] - e.y;
        const d = Math.hypot(dx, dy);
        if (d > 0) { const go = Math.min(d, e.speed * dt); e.x += dx / d * go; e.y += dy / d * go; }
      } else {
        // Not in its area: it wanders slowly between spots of its own area.
        e.goalTimer -= dt;
        if (!e.goal || e.goalTimer <= 0) { e.goal = randomFloor(u.world, a, rand) || [e.x, e.y]; e.goalTimer = uniform(4, 9); }
        const dx = e.goal[0] - e.x; const dy = e.goal[1] - e.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.5) { e.x += dx / d * e.speed * 0.4 * dt; e.y += dy / d * e.speed * 0.4 * dt; }
      }
      // Never out of its area.
      e.x = Math.max(a.x0 * CELL, Math.min(a.x1 * CELL, e.x));
      e.y = Math.max(a.y0 * CELL, Math.min(a.y1 * CELL, e.y));
      if (a !== here) continue;
      let d = dist2([e.x, e.y], this.playerPos);
      for (const [p, q] of steps) d = Math.min(d, pointToSegment(was[0], was[1], p, q));
      if (d < CHASER_TOUCH && u.safe <= 0 && u.hitCooldown <= 0) {
        this._utHurt(e);
        if (this.state !== STATE) return;
        // It struck: set back, and it comes again.
        const back = randomFloor(u.world, a, rand, { from: this.playerPos, minDist: CHASER_PUSH });
        if (back) { [e.x, e.y] = back; e.path = null; }
      }
    }
  },

  // A thrower: Tower Mode's rival, in its own area (local coordinates about the
  // area's centre). It contests the area's item and throws only while you are in
  // the area; the wind-up is the warning, and a throw is committed to where you
  // stood, as in Tower Mode.
  _utUpdateThrower(e, dt, playerHere) {
    const u = this.ut;
    const a = e.area;
    const local = [this.playerPos[0] - a.centre[0], this.playerPos[1] - a.centre[1]];
    const item = u.towerItems.get(a.id) || null;
    const itemPos = item ? [item.x, item.y] : null;
    if (playerHere) e.update(local, itemPos, ARENA, dt);
    else {
      // You are elsewhere: it only races for items, calmly, and holds what it has.
      e.floorTime += dt; e.sinceThrow += dt;
      if (e.notice > 0) e.notice -= dt;
      if (e.recover > 0) e.recover -= dt;
      if (itemPos && e.items < e.capacity) {
        const mx = itemPos[0] - e.x; const my = itemPos[1] - e.y; const md = Math.hypot(mx, my);
        if (md > 0.4) { e.x += mx / md * e.speed * dt; e.y += my / md * e.speed * dt; }
      }
    }
    // Only where the floor is (a tower area has no walls, but the square has edges).
    e.x = Math.max(-ARENA, Math.min(ARENA, e.x));
    e.y = Math.max(-ARENA, Math.min(ARENA, e.y));
    const pos = this._utEnemyPos(e);
    // The race for the item.
    if (item && e.items < e.capacity && e.winding <= 0 && e.recover <= 0 && e.notice <= 0 && e.pending <= 0) {
      if (Math.hypot(item.x - e.x, item.y - e.y) < 1.2) {
        e.items += 1;
        e.sinceThrow = 0.0;
        const gp = this._utItemPos(item);
        if (item.channel) { item.channel.stop(); u.voices.delete(item.channel); }
        u.towerItems.delete(a.id);
        this._utPlay('enemy_grab', gp, { volume: levelAt(dist2(gp, this.playerPos)) });
        this._utSpawnTowerItem(a);
      }
    }
    if (!playerHere || u.safe > 0) return;
    const level = levelAt(dist2(pos, this.playerPos));
    if (e.winding > 0) {
      e.winding -= dt;
      if (e.winding <= 0) { e.pending = Math.max(1, Math.min(e.volleySize, e.items)); e.shotTimer = 0.0; }
    } else if (e.pending > 0) {
      e.shotTimer -= dt;
      if (e.shotTimer <= 0) {
        e.items -= 1; e.pending -= 1;
        let target = e.aim !== null ? e.aim : [...local];
        const total = Math.max(1, e.volleySize);
        const offsets = volleySpread(total);
        const ang = offsets[Math.min(offsets.length - 1, total - 1 - e.pending)];
        const tdx = target[0] - e.x; const tdy = target[1] - e.y;
        const ca = Math.cos(ang); const sa = Math.sin(ang);
        target = [e.x + tdx * ca - tdy * sa, e.y + tdx * sa + tdy * ca];
        const shot = new TowerProjectile(e.x, e.y, target, e.throwSpeed * this._utSpeedMul());
        shot.owner = e; shot.area = a;
        this._utPlay('item_throw', pos, { volume: level });
        shot.channel = this._utPlay('item_buzz', pos, { loops: -1, volume: 0.0 });
        u.projectiles.push(shot);
        e.shotTimer = e.burstGap;
        if (e.pending <= 0) {
          const wasDump = e.dumping;
          e.aim = null; e.volleySize = 0; e.dumping = false;
          e.cooldown = e.throwCd * (wasDump ? 2.2 : 1.0);
          e.recover = wasDump ? 2.6 : 1.2;
          e.sinceThrow = 0.0;
        }
      }
    } else if (e.items > 0 && e.hoarding && e.items < e.capacity && e.sinceThrow < 12.0) {
      // Hoarding (Tower's TOWER_HOARD_PATIENCE): it holds what it has.
    } else if (e.items > 0) {
      e.cooldown -= dt;
      if (e.hoarding) e.cooldown = 0.0;
      if (e.cooldown <= 0) {
        e.dumping = (e.capacity > 1 && e.items >= e.capacity) || (e.hoarding && e.items > 1);
        e.winding = e.windupLen * (e.dumping ? 1.9 : 1.0);
        if (e.dumping) e.winding = Math.max(0.9, e.winding);
        e.aim = [...local];
        e.volleySize = e.dumping ? e.items : Math.min(e.volley, e.items);
        let name;
        if (e.dumping && e.volleySize >= 3) name = 'enemy_windup_full';
        else if (e.volleySize <= 1) name = 'enemy_windup';
        else name = `enemy_windup_${Math.min(3, e.volleySize)}`;
        this._utPlay(name, pos, { volume: level, keep: true });   // the wind-up is the only warning of a throw
      }
    }
  },

  // Thrown items in flight, the tower items and the proximity beep.
  _utUpdateTower(dt) {
    this._utUpdateProjectiles(dt);
    if (this.state !== STATE) return;
    this._utUpdateTowerItem();
  },

  // Throws in the air fly on wherever you are (on the slide too, so none hangs
  // buzzing in mid-air); a hit lands only on the floor (_utHurt).
  _utUpdateProjectiles(dt) {
    const u = this.ut;
    for (const s of [...u.projectiles]) {
      const a = s.area;
      const was = [s.x + a.centre[0], s.y + a.centre[1]];
      const alive = s.update(dt);
      const now = [s.x + a.centre[0], s.y + a.centre[1]];
      const here = u.area === a;
      const d = here ? Math.min(dist2(now, this.playerPos), pointToSegment(this.playerPos[0], this.playerPos[1], was, now)) : Infinity;
      if (s.channel) {
        const rx = this.playerPos[0] - now[0]; const ry = this.playerPos[1] - now[1];
        if (here && rx * s.vx + ry * s.vy < 0) { s.channel.stop(); u.voices.delete(s.channel); s.channel = null; }
        else this._utFollow(s.channel, now, levelAt(dist2(now, this.playerPos)) * 0.75);
      }
      const hit = d < 2.2 && u.hitCooldown <= 0 && u.safe <= 0;
      const atWall = Math.abs(s.x) > ARENA + 0.5 || Math.abs(s.y) > ARENA + 0.5;
      if (hit || atWall || !alive) {
        this._utDropProjectile(s);
        if (hit) { this._utHurt(s); if (this.state !== STATE) return; }
      }
    }
  },

  _utUpdateTowerItem() {
    const u = this.ut;
    // The item in the player's own tower area: walked onto, it is yours.
    const a = u.area;
    if (a && a.kind === 'tower') {
      const item = u.towerItems.get(a.id);
      if (item) {
        const pos = this._utItemPos(item);
        if (dist2(pos, this.playerPos) < PICKUP_REACH) {
          u.items += 1;
          this.audio.play('ammo');
          if (item.channel) { item.channel.stop(); u.voices.delete(item.channel); }
          u.towerItems.delete(a.id);
          for (const e of u.enemies) if (e.area === a && e.kind === 'thrower') e.registerPlayerPickup();
          this._utSpawnTowerItem(a);
        } else {
          // Tower's proximity beep for the item, rising and quickening as you close.
          const d = dist2(pos, this.playerPos);
          const interval = Math.max(0.14, Math.min(1.2, d * 0.035));
          const now = performance.now() / 1000;
          if (now - u.prox > interval) {
            u.prox = now;
            const idx = Math.max(0, Math.min(19, 19 - Math.trunc(d / 3.0)));
            this._utPlay(`prox_${idx}`, pos, { volume: levelAt(d) * 0.45 });
          }
        }
      }
    }
  },

  _utUpdatePickups() {
    const u = this.ut;
    for (const p of [...u.pickups]) {
      if (p.area !== u.area) continue;
      if (dist2(p.pos, this.playerPos) < PICKUP_REACH) this._utTakePickup(p);
    }
    if (u.place === 'world') {
      for (const sl of u.slides || []) {
        if (sl.area === u.area && dist2(sl.pos, this.playerPos) < PICKUP_REACH) { this._utStartSlide(sl); break; }
      }
      const b = this._utBusWaiting();
      if (b && dist2(b.pos, this.playerPos) < PICKUP_REACH) this._utBoardBus();
    }
  },

  // ---------------------------------------------------------------- the bus
  // How many steps the walk to the nearest safe zone is from here (null: none).
  _utStepsToSafety() {
    const u = this.ut;
    if (u.place !== 'world' || !u.world) return null;
    const path = routeToward(u.world, cellOf(this.playerPos), (a) => a.kind === 'event');
    return path ? path.length : (this._utInSafeZone() ? 0 : null);
  },

  _utUpdateBus(dt) {
    const u = this.ut;
    u.busElapsed += dt;
    // Due, and a safe zone far away: the bus comes, near you, with its chime. Near
    // one, it looks again in a while, until the world's last minute.
    if (!u.bus && u.busAt !== null && u.busElapsed >= u.busAt && u.place === 'world' && this.audio.has('ut_bus_idle')) {
      const steps = this._utStepsToSafety();
      if (u.worldTime <= BUS_APPEARS[1]) u.busAt = null;
      else if (steps === null || steps < BUS_FAR_STEPS) u.busAt = u.busElapsed + BUS_RETRY;
      else {
        const here = u.area;
        const pos = randomFloor(u.world, here, rand, { from: this.playerPos, minDist: BUS_NEAR[0], maxDist: BUS_NEAR[1], avoid: u.pickups.map((p) => p.pos), clearance: 4.0 })
          || randomFloor(u.world, here, rand, { from: this.playerPos, minDist: 6.0, maxDist: BUS_NEAR[1] * 1.6 });
        u.busAt = null;
        if (pos) {
          // The ride is as long as the walk would have been far.
          const far = Math.max(0, Math.min(1, (steps - BUS_FAR_STEPS) / (BUS_FAREST_STEPS - BUS_FAR_STEPS)));
          u.bus = { area: here, pos, stage: 'coming', t: 0, voice: null, rideVoice: null, pullVoice: null, doorVoice: null, ride: BUS_RIDE[0] + (BUS_RIDE[1] - BUS_RIDE[0]) * far, steps };
          // It pulls up where it will stand, then the chime says it has come.
          if (this.audio.has('ut_bus_arrive')) u.bus.pullVoice = this._utPlay('ut_bus_arrive', pos, { volume: 0.0, keep: true });
          else { u.bus.stage = 'waiting'; this._utBusChime(); }
        }
      }
    }
    const b = u.bus;
    if (!b || b.stage === 'waiting') return;
    b.t += dt;
    if (b.stage === 'coming') {
      if (b.t >= BUS_PULL_STOP) { b.stage = 'waiting'; b.t = 0; b.pullVoice = null; this._utBusChime(); }
      return;
    }
    const steps = () => { for (let i = 0; i < 3; i++) this._utLater(i * BUS_STEP_GAP, choice(STEPS_STONE), null); };
    const door = (name, pos) => {
      if (b.doorVoice) b.doorVoice.fadeout(200);
      b.doorVoice = this._utPlay(name, pos || null, { keep: true });
      b.doorAt = b.t;
    };
    if (b.doorVoice && b.t - b.doorAt >= BUS_DOOR_CUT) { b.doorVoice.fadeout(400); b.doorVoice = null; }
    if (b.stage === 'boarding') {
      if (!b.stepped && b.t >= BUS_STEP_AT) { b.stepped = true; steps(); }
      if (!b.closed && b.t >= BUS_CLOSE_AT) { b.closed = true; door('ut_bus_doors_close'); }
      if (b.t >= BUS_GO_AT) {
        // Off we go: the idling engine gives way to the ride, heard from your seat.
        b.stage = 'riding'; b.t = 0;
        if (b.voice) { b.voice.fadeout(800); u.voices.delete(b.voice); b.voice = null; }
        if (this.audio.has('ut_bus_ride')) b.rideVoice = this._utPlay('ut_bus_ride', null, { loops: -1, volume: 0.9, fadeMs: 1200, send: 0 });
      }
    } else if (b.stage === 'riding') {
      if (b.t >= b.ride) {
        // Arrived at the nearest safe zone: the engine idles at the stop, the doors open.
        b.stage = 'arriving'; b.t = 0; b.stepped = false; b.closed = false;
        if (b.rideVoice) { b.rideVoice.fadeout(1000); u.voices.delete(b.rideVoice); b.rideVoice = null; }
        const safe = u.world.areas.filter((a) => a.kind === 'event');
        const near = safe.slice().sort((x, y) => dist2(x.centre, b.pos) - dist2(y.centre, b.pos))[0] || u.area;
        const spot = randomFloor(u.world, near, rand, { avoid: u.pickups.map((p) => p.pos), clearance: 3.0 }) || posOf(...near.floorCells[0]);
        b.pos = spot; b.area = near;
        this.playerPos = spot; u.area = near;
        this._utRefreshRooms(); this._utListenerMix();
        door('ut_bus_doors_open');
      }
    } else if (b.stage === 'arriving') {
      if (!b.stepped && b.t >= BUS_STEP_AT) { b.stepped = true; steps(); }
      if (u.place === 'bus' && b.t >= BUS_STEP_AT + 2 * BUS_STEP_GAP) {
        // Down the last step, onto the safe zone's floor: yours to walk again.
        u.place = 'world';
      }
      if (!b.closed && b.t >= BUS_CLOSE_AT) { b.closed = true; door('ut_bus_doors_close', b.pos); }
      if (b.t >= BUS_GO_AT) {
        // And away: the engine goes with it.
        b.stage = 'gone';
        if (b.doorVoice) { b.doorVoice.fadeout(400); b.doorVoice = null; }
        if (b.voice) { b.voice.fadeout(600); u.voices.delete(b.voice); b.voice = null; }
        if (this.audio.has('ut_bus_leave')) this._utPlay('ut_bus_leave', b.pos);
        u.bus = null;
      }
    }
  },

  // The two notes that say a bus has come. A cue: nothing is allowed to push it
  // out (Russell, 10 Nov: in certain cases the chime did not sound. In a crowded
  // world the sound engine's full house stopped it for the next footstep or
  // shot; see AudioEngine.play).
  _utBusChime() { return this.audio.play('ut_bus_chime', { volume: 0.7, keep: true }); },

  _utBoardBus() {
    const u = this.ut; const b = u.bus;
    u.place = 'bus';
    this._utTurnStop();
    // Whatever was in the air for you falls short: the bus is leaving.
    for (const s of [...u.projectiles]) this._utDropProjectile(s);
    b.stage = 'boarding'; b.t = 0; b.stepped = false; b.closed = false;
    this.stride = null;
    if (b.doorVoice) b.doorVoice.fadeout(200);
    b.doorVoice = this._utPlay('ut_bus_doors_open', null, { keep: true }); b.doorAt = 0;
  },

  // ---------------------------------------------------------------- the water park
  // Reaching the slide: you climb by yourself (Tower's stairs), slide down (the
  // rush, made by the game), splash into the water for points, and come up
  // somewhere else in the park; the slide is where it was, to be found again.
  _utStartSlide(sl) {
    const u = this.ut;
    this._utTurnStop();
    u.place = 'slide';
    u.slide = { sl, t: 0, stage: 'climb' };
    if (sl.voice) { sl.voice.stop(); u.voices.delete(sl.voice); sl.voice = null; }
    this.stride = null;
    this._utPlay('stairs_climb', null, { keep: true });
  },

  _utUpdateSlide(dt) {
    const u = this.ut;
    const r = u.slide;
    if (!r) { u.place = 'world'; return; }
    r.t += dt;
    if (r.stage === 'climb' && r.t >= SLIDE_CLIMB) {
      r.stage = 'down';
      r.t = 0;
      if (this.audio.has('ut_slide')) this._utPlay('ut_slide', null, { volume: 0.9, keep: true });
    } else if (r.stage === 'down' && r.t >= SLIDE_DOWN) {
      // The splash, the points, and up somewhere else in the park.
      if (this.audio.has('evt_water_splash')) this._utPlay('evt_water_splash', null, { keep: true });
      // (Since web 4.1.0 you come up in the middle of the park's pool, and have to
      // wade or swim out of it; until then, on dry floor somewhere at random.)
      const a = r.sl.area;
      const spot = r.sl.pool
        || randomFloor(u.world, a, rand, { from: r.sl.pos, minDist: SLIDE_LAND_AWAY, avoid: u.pickups.map((p) => p.pos), clearance: 3.0 })
        || randomFloor(u.world, a, rand, { from: r.sl.pos, minDist: 8.0 });
      if (spot) { this.playerPos = [spot[0], spot[1]]; u.area = a; }
      u.place = 'world';
      u.slide = null;
      this._utScore(SLIDE_POINTS, { safeOk: true });
      this._utRefreshRooms();
      this._utListenerMix();
    }
  },

  // ---------------------------------------------------------------- the island's elevator and the seabed
  _utUpdateLift(dt) {
    const u = this.ut;
    const a = u.area;
    if (!a || a.kind !== 'island') { u.liftArmed = false; return; }
    const lp = posOf(a.elevator[0], a.elevator[1]);
    const d = dist2(lp, this.playerPos);
    // Walking into the elevator is stepping onto its square, anywhere on it (web
    // 4.0.0: you walk at any angle, so you may cross the square off its middle;
    // until then it was coming within REACH of the middle).
    const [cx, cy] = cellOf(this.playerPos);
    if (cx !== a.elevator[0] || cy !== a.elevator[1]) u.liftArmed = true;
    else if (u.liftArmed) { this._utStartRide('down'); return; }
    u.dingTimer -= dt;
    if (u.dingTimer <= 0) {
      u.dingTimer = 1.6;
      this._utPlay('elevator_ding', lp, { volume: levelAt(d) });
    }
  },

  _utStartRide(dir) {
    const u = this.ut;
    const a = u.place === 'seabed' ? u.seabed.area : u.area;
    const e = this.audio.entries.get('elevator_ride');
    const own = e && e.dry ? e.dry.frames / RATE : RIDE_TIME;
    const len = Math.max(RIDE_MIN, Math.min(RIDE_MAX, own));
    u.place = 'ride';
    u.liftArmed = false;
    this._utTurnStop();
    // (Island Mode: a recording far longer than a ride should be is capped and
    // eased out over its last second.)
    u.ride = { dir, t: 0, len, area: a, chimed: false, capped: len < own - 0.05, faded: false, voice: this.audio.play('elevator_ride', { direct: false, keep: true }) };
    if (dir === 'down') {
      // The seabed lies straight under the island's elevator, in the world's own
      // coordinates: its cell (0, 0) is the elevator's cell, so every position in
      // the mode stays in one system and nothing above is misplaced.
      const [ex, ey] = a.elevator;
      u.seabed = { area: a, grid: makeSeabed(), origin: [ex, ey], pickups: [], under: null, bubbleTimer: uniform(BUBBLES_FIRST[0], BUBBLES_FIRST[1]), hum: null, breath: null };
      // The seabed's own supply: a cartridge or two, and now and then a credit.
      const g = u.seabed.grid;
      const spot = () => {
        for (let i = 0; i < 50; i++) {
          const cx = randint(-g.half, g.half); const cy = randint(-g.half, g.half);
          if (Math.hypot(cx, cy) >= 3) return posOf(ex + cx, ey + cy);
        }
        return posOf(ex + g.half, ey);
      };
      for (let i = 0; i < randint(2, 3); i++) u.seabed.pickups.push({ kind: 'ammo', pos: spot(), shots: this._utShotsPerCartridge(), beacon: 'ammo_beacon', gain: 0.55 });
      if (rand() < 0.3) { const v = choice(CREDIT_VALUES); u.seabed.pickups.push({ kind: 'credit', pos: spot(), value: v, beacon: `credit_beacon_${v}`, gain: 0.7 }); }
      // A treasure chest, on about one seabed in three: far from the lift.
      if (rand() < CHEST_CHANCE) {
        let at = null;
        for (let i = 0; i < 80 && !at; i++) {
          const cx = randint(-g.half, g.half); const cy = randint(-g.half, g.half);
          if (Math.hypot(cx, cy) >= CHEST_FAR) at = posOf(ex + cx, ey + cy);
        }
        const beacon = CHEST_SOUNDS.find((n) => this.audio.has(n));
        if (at && beacon) {
          u.seabed.pickups.push({ kind: 'chest', pos: at, beacon, gain: CHEST_GAIN });
          // (Its opening is a recording from the events' library, decoded now so it sounds the moment the chest opens.)
          this.audio.prepare(CHEST_OPEN_SOUNDS[0]);
        }
      }
      // The water, placed so it can rise from below you on the way down.
      u.seabed.under = this._utPlay('underwater', this.playerPos, { loops: -1, volume: 0.0, height: -6 });
      // And a wide copy, in step, for when it is all round you (see _utPlaceWater).
      u.seabed.underWide = this._utPlay('underwater', null, { loops: -1, volume: 0.0, wide: true });
    } else {
      for (const p of u.seabed.pickups) if (p.voice) { p.voice.stop(); u.voices.delete(p.voice); p.voice = null; }
      if (u.seabed.hum) { u.seabed.hum.stop(); u.voices.delete(u.seabed.hum); u.seabed.hum = null; }
      // Your breathing stops with the doors closing: the car has air.
      if (u.seabed.breath) { u.seabed.breath.fadeout(600); u.voices.delete(u.seabed.breath); u.seabed.breath = null; }
    }
    this.stride = null;
  },

  // The ride (Island Mode's stages): going down, the island goes muffled and the
  // water rises from below you; coming up, the reverse. Height is what the ear
  // gets from it in 3D.
  _utUpdateRide(dt) {
    const u = this.ut;
    const r = u.ride;
    if (r.voice && r.voice.busy && !r.voice.dry) return;    // the recording still decoding
    r.t += dt;
    const L = r.len;
    const stage = (p, q) => Math.min(1, Math.max(0, (r.t - p * L) / ((q - p) * L)));
    const shut = stage(0, DOORS_SHUT); const move = stage(DOORS_SHUT, DOORS_OPEN); const wide = stage(DOORS_OPEN, DOORS_WIDE);
    let above; let water; let height;
    if (r.dir === 'down') { above = (1 - shut * 0.7) * (1 - move); water = move * (0.75 + 0.25 * wide); height = -6 * (1 - move); }
    else { water = (1 - shut * 0.7) * (1 - move); above = move * (0.75 + 0.25 * wide); height = 6 * (1 - move); }
    u.rideMix = { above, water, height };
    if (u.seabed && u.seabed.under) this._utPlaceWater(0.8 * water, height);
    this._utUpdateSounds(dt);
    if (!r.chimed && r.t >= DOORS_OPEN * L - ARRIVE_CHIME_LEAD) {
      r.chimed = true;
      this.audio.play(r.dir === 'down' ? 'elevator_arrive_1' : 'elevator_arrive_2', { keep: true });
    }
    if (r.capped && !r.faded && r.t >= L - 1.0) { r.faded = true; if (r.voice) r.voice.fadeout(1000); }
    if (r.t < L) return;
    // Arrived. (The ride recording, if somehow still going, goes with the ride.)
    if (r.voice && r.voice.busy) r.voice.fadeout(200);
    u.ride = null;
    u.rideMix = null;
    if (r.dir === 'down') {
      u.place = 'seabed';
      this.playerPos = posOf(r.area.elevator[0], r.area.elevator[1]);   // in the car, under the lift
      u.liftArmed = false;
      u.area = r.area;
      if (u.seabed.under) this._utPlaceWater(0.8, 0);
      // Under the water you hear yourself breathe through the regulator, in and
      // out with the bubbles: all round you, no echo (the open sea), for as long
      // as you are down here; there is no limit on your air in this mode.
      if (this.audio.has('ut_diver_breathing')) u.seabed.breath = this._utPlay('ut_diver_breathing', null, { loops: -1, volume: BREATHING_LEVEL, fadeMs: 600, send: 0 });
      this._utRefreshRooms();
    } else {
      // The water is left behind (it was already down to nothing with the ride).
      if (u.seabed && u.seabed.under) { u.seabed.under.stop(); u.voices.delete(u.seabed.under); }
      if (u.seabed && u.seabed.underWide) { u.seabed.underWide.stop(); u.voices.delete(u.seabed.underWide); }
      u.place = 'world';
      u.seabed = null;
      u.area = r.area;
      // Island Mode: you step out a few steps from the lift, never onto it, so a
      // stray swipe cannot send you straight back down.
      this.playerPos = this._utArrivalPos(r.area);
      // You step out with your back to the lift, squared up, so walking on takes
      // you away from it.
      const lift = posOf(r.area.elevator[0], r.area.elevator[1]);
      if (dist2(lift, this.playerPos) > 0.1) this._utFace(Math.round(Math.atan2(this.playerPos[0] - lift[0], lift[1] - this.playerPos[1]) / QUARTER) * QUARTER, true);
      u.liftArmed = false;
      // Island Mode's arrival grace: nothing can touch you for a moment after
      // stepping out of the lift.
      u.safe = Math.max(u.safe, ARRIVAL_GRACE);
      this._utRefreshRooms();
      this._utListenerMix();
    }
  },

  // Where you step out on an island after the ride up: a sand square ARRIVE_STEPS
  // from the elevator, never a pickup's square, and away from the chasers where
  // the island allows it (else the square farthest from them).
  _utArrivalPos(a) {
    const u = this.ut;
    const [ex, ey] = a.elevator;
    const chasers = u.enemies.filter((e) => e.area === a).map((e) => this._utEnemyPos(e));
    const things = u.pickups.filter((p) => p.area === a).map((p) => p.pos);
    const far = (pos) => (chasers.length ? Math.min(...chasers.map((c) => dist2(c, pos))) : Infinity);
    const pick = (lo, hi) => a.floorCells
      .filter(([cx, cy]) => { const d = Math.hypot(cx - ex, cy - ey); return d >= lo && d <= hi; })
      .map(([cx, cy]) => posOf(cx, cy))
      .filter((pos) => !things.some((t) => dist2(t, pos) < PICKUP_REACH));
    let spots = pick(ARRIVE_STEPS[0], ARRIVE_STEPS[1]);
    if (!spots.length) spots = pick(2, AREA_CELLS);   // (a tiny island: anywhere off the lift)
    if (!spots.length) return posOf(ex, ey);
    const clear = spots.filter((pos) => far(pos) >= ARRIVE_CLEAR);
    if (clear.length) return choice(clear);
    return spots.reduce((best, pos) => (far(pos) > far(best) ? pos : best));
  },

  // The water. On the ride it is a thing in a place, below you and rising (or
  // sinking away under you on the way up). Round you, on the seabed, it is its
  // wide copy: the recording's left side in the world's west and its right side
  // in the east, so it turns round you as you turn (web 4.1.0; in 4.0.0 it was
  // kept in front of your face and did not turn). The two cross over as it
  // reaches you.
  _utPlaceWater(level, height) {
    const s = this.ut.seabed;
    const around = s.underWide ? Math.max(0, 1 - Math.abs(height) / 6) : 0;
    if (s.under) s.under.setSpatial(level * (1 - around), 0, -0.05, 0, height);
    if (s.underWide) s.underWide.setVolume(level * around, level * around);
  },

  _utUpdateSeabed(dt) {
    const u = this.ut;
    const s = u.seabed;
    if (s.under) this._utPlaceWater(0.8, 0);
    for (const p of [...s.pickups]) {
      if (dist2(p.pos, this.playerPos) < PICKUP_REACH) {
        if (p.voice) { p.voice.stop(); u.voices.delete(p.voice); }
        s.pickups.splice(s.pickups.indexOf(p), 1);
        if (p.kind === 'ammo') { u.ammo += p.shots; this.audio.play('ammo'); this._utScore(POINTS.ammo); }
        else if (p.kind === 'chest') this._utOpenChest();
        else { this.audio.play('credit_chaos'); this._utScore(p.value); }
      }
    }
    const lp = posOf(s.origin[0], s.origin[1]);
    const d = dist2(lp, this.playerPos);
    const [sx, sy] = this._utSeabedCell(this.playerPos);     // (the lift's own square, as above)
    if (sx !== 0 || sy !== 0) u.liftArmed = true;
    else if (u.liftArmed) { this._utStartRide('up'); return; }
    // The way up calls with one tone every 1.6 seconds and hums where it stands
    // (Island Mode's seabed); the hum is a seabed thing here, never heard from above.
    u.dingTimer -= dt;
    if (u.dingTimer <= 0) {
      u.dingTimer = 1.6;
      this._utPlay('elevator_arrive_1', lp, { volume: seaLevel(d) });
    }
    if (!s.hum) s.hum = this._utPlay('elevator_hum', lp, { loops: -1, volume: 0.0 });
    this._utFollow(s.hum, lp, seaLevel(d));
    // Your own bubbles now and then, as on Island Mode's seabed.
    s.bubbleTimer -= dt;
    if (s.bubbleTimer <= 0) {
      s.bubbleTimer = uniform(BUBBLES_EVERY[0], BUBBLES_EVERY[1]);
      this.audio.play('bubbles', { volume: 0.5 });
    }
  },

  // A treasure chest opens (web 5.0.0): two or three different things at once,
  // and the voice says only what they are, never "treasure chest".
  _utOpenChest() {
    const u = this.ut;
    const open = CHEST_OPEN_SOUNDS.find((n) => this.audio.has(n));
    if (open) this.audio.play(open, { keep: true });
    const kinds = shuffle(['shots', 'points', 'items', ...(u.hp < START_HP ? ['health'] : [])]);
    const take = kinds.slice(0, randint(CHEST_REWARDS[0], CHEST_REWARDS[1]));
    if (rand() < CHEST_TIME_CHANCE) take.push('time');
    const words = [];
    for (const kind of take) {
      if (kind === 'shots') { const got = randint(CHEST_SHOTS[0], CHEST_SHOTS[1]); u.ammo += got; words.push(`${got} shots`); }
      else if (kind === 'points') {
        const got = Math.round(CHEST_POINTS * this._utMultiplier());
        u.points += got; u.worldPoints += CHEST_POINTS;
        words.push(`${got} points`);
      } else if (kind === 'items') { const got = randint(CHEST_ITEMS[0], CHEST_ITEMS[1]); u.items += got; words.push(`${got} tower items`); }
      else if (kind === 'health') {
        const full = rand() < CHEST_FULL_HEAL;
        const got = full ? START_HP - u.hp : Math.min(CHEST_HEALTH, START_HP - u.hp);
        u.hp += got;
        if (u.hp > 35) u.lowWarned = false;
        words.push(full ? 'full health' : `${got} health`);
      } else { u.worldTime += CHEST_TIME; words.push(`${CHEST_TIME} more seconds in this world`); }
    }
    u.chests = (u.chests || 0) + 1;
    u.lastChest = take;
    const said = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0];
    this.tts.speak(`${said[0].toUpperCase()}${said.slice(1)}.`, { interrupt: true });
  },

  // A seabed position's cell, counted from the elevator.
  _utSeabedCell(pos) {
    const [cx, cy] = cellOf(pos);
    const [ex, ey] = this.ut.seabed.origin;
    return [cx - ex, cy - ey];
  },

  // ---------------------------------------------------------------- every sound, every frame
  _utUpdateSounds(dt) {
    const u = this.ut;
    const w = u.world;
    if (!w) return;
    this._utPruneShots();
    const onWorld = u.place === 'world' || u.place === 'slide';
    const ride = u.rideMix;
    const seabed = u.place === 'seabed';
    const inBus = u.place === 'bus';
    // How much of the world above is heard: all of it on the ground, through the
    // elevator's stages on a ride, faintly from above on the seabed.
    const aboveLevel = onWorld ? 1 : ride ? ride.above : inBus ? BUS_WINDOWS : 0.0;
    const aboveHeight = onWorld ? 0 : ride ? ride.height : inBus ? 0 : 8;
    // Sheltered: in a safe zone what lies beyond it, on the bus everything, sounds
    // further off (eased, so a border crossing is a gentle change).
    const inSafe = onWorld && !!u.area && u.area.kind === 'event';
    const ease = Math.min(1, dt / SHELTER_EASE);
    u.shSafe = (u.shSafe || 0) + ((inSafe ? 1 : 0) - (u.shSafe || 0)) * ease;
    u.shBus = (u.shBus || 0) + ((inBus ? 1 : 0) - (u.shBus || 0)) * ease;
    const outsideGain = 1 - (1 - SAFE_OUTSIDE) * u.shSafe;
    const dullOf = (area) => SHELTER_DULL * (area === u.area ? u.shBus : Math.max(u.shSafe, u.shBus));
    const near = this._utNearAreas();
    const nearIds = new Set(near.map((a) => a.id));
    // Each area's air: its own area at full, a neighbour's from its border or its
    // doorway, fading with the distance to it. An area further off is silent, but
    // its sounds are kept running while it is anywhere near (within two slots of
    // the player's area), so crossing a border never stops and restarts a
    // neighbour's air: an area's sound is only let go once it is well away.
    const keep = (a) => nearIds.has(a.id) || (u.area && Math.max(Math.abs(a.ax - u.area.ax), Math.abs(a.ay - u.area.ay)) <= KEEP_SLOTS);
    for (const a of w.areas) {
      let s = u.areaSounds.get(a.id);
      if (!keep(a)) {
        if (s) { for (const k of [...AREA_LOOPS, 'hum']) { const v = s[k]; if (v) { v.fadeout(800); u.voices.delete(v); } } u.areaSounds.delete(a.id); }
        continue;
      }
      if (!s) {
        // Each background twice, in step: a wide copy for standing inside the area
        // (all round you: its left side in the world's west, its right side in the
        // east, so since web 4.1.0 it turns round you as you turn, like everything
        // else), and a placed copy for hearing it from outside, through its doorway
        // or across its border. Every background but an island's shore rings
        // lightly in its own room.
        const send = a.kind === 'island' ? 0 : BACKGROUND_SEND;
        s = {
          amb: this._utPlay(a.ambience, a.centre, { loops: -1, volume: 0.0, fadeMs: 600, send }),
          ambIn: this._utPlay(a.ambience, null, { loops: -1, volume: 0.0, fadeMs: 600, send, wide: true }),
        };
        if (a.drums) {
          s.drums = this._utPlay(a.drums, a.centre, { loops: -1, volume: 0.0, fadeMs: 600, send });
          s.drumsIn = this._utPlay(a.drums, null, { loops: -1, volume: 0.0, fadeMs: 600, send, wide: true });
        }
        if (a.crowd) {
          s.crowd = this._utPlay(a.crowd, a.centre, { loops: -1, volume: 0.0, fadeMs: 600, send });
          s.crowdIn = this._utPlay(a.crowd, null, { loops: -1, volume: 0.0, fadeMs: 600, send, wide: true });
        }
        if (a.kind === 'island') s.hum = this._utPlay('elevator_hum', posOf(a.elevator[0], a.elevator[1]), { loops: -1, volume: 0.0 });
        u.areaSounds.set(a.id, s);
      }
      let level; let from; let inside = 0; const height = aboveHeight;
      if (a === u.area) {
        level = AMBIENCE_LEVEL;
        if (seabed) level = 0.22;
        // On the seabed and in the car the island is straight above you.
        if (seabed || ride) from = this.playerPos; else { from = null; inside = 1; }
      } else if (seabed || !nearIds.has(a.id)) {
        // From the seabed, or not a neighbour: kept running, unheard.
        level = 0; from = a.centre;
      } else {
        const [, outside] = nearestPointOf(a, this.playerPos);
        from = leakPoint(w, u.area, a, this.playerPos);
        const bd = a.borders.find((b) => (b.a === u.area.id && b.b === a.id) || (b.b === u.area.id && b.a === a.id));
        level = AMBIENCE_LEVEL * levelAt(outside, AMBIENCE_RANGE) * (bd && bd.door ? DOOR_LEAK : 1) * outsideGain;
        if (!onWorld) level *= 0.3;
      }
      level *= aboveLevel || (seabed ? 1 : 0);
      // An area nobody can hear costs the phone nothing: after a moment unheard,
      // its loops are held where they are, and they carry on from there the moment
      // the area is heard again. All of an area's loops are held and let go in the
      // same frame, so each background's two copies stay in step, and its drums
      // stay with its drone. (Until web 3.3.0 every kept area's loops played on at
      // no volume: thirty and more of them late in a run, each with its panners.)
      s.quiet = level > PARK_BELOW ? 0 : (s.quiet || 0) + dt;
      const parked = s.quiet > PARK_AFTER;
      // (One still being decoded cannot be held yet: it is, the frame it begins.)
      if (AREA_LOOPS.some((k) => s[k] && s[k].busy && s[k].paused !== parked && (!parked || s[k].dry))) {
        this.audio.holdAll(AREA_LOOPS.map((k) => s[k]), parked);
      }
      if (!parked) {
        const mixHere = this._utMixAt(this.playerPos);
        const dull = dullOf(a);
        const pair = (placed, wide, gain) => {
          if (placed) {
            if (from) this._utFollow(placed, from, level * gain * (1 - inside), height, dull);
            else { placed.setSpatial(0, 0, -0.05, 0, height); placed.setAreaMix(mixHere); }
          }
          if (wide) { wide.setVolume(level * gain * inside, level * gain * inside, dull); wide.setAreaMix(mixHere); }
        };
        pair(s.amb, s.ambIn, 1);
        pair(s.drums, s.drumsIn, 0.85);
        pair(s.crowd, s.crowdIn, CROWD_LEVEL);
      }
      if (s.hum) {
        const lp = posOf(a.elevator[0], a.elevator[1]);
        // The lift's hum is a thing of the ground: silent in the car and on the
        // seabed, as Island Mode stops it when the ride begins. Like its chime, it
        // belongs to its own island: silent from any other area, however near.
        // Unheard, it is held like the island's air, by its own level.
        const hl = onWorld && u.area === a ? levelAt(dist2(lp, this.playerPos)) : 0;
        s.humQuiet = hl > PARK_BELOW ? 0 : (s.humQuiet || 0) + dt;
        if (s.humQuiet > PARK_AFTER) s.hum.pause();
        else { s.hum.resume(); this._utFollow(s.hum, lp, hl, aboveHeight); }
      }
    }
    // Enemies: heard only in the area you are in (a neighbour's wait, unheard,
    // until you cross its border), fading with distance, never from the seabed.
    for (const e of u.enemies) {
      const pos = this._utEnemyPos(e);
      const d = dist2(pos, this.playerPos);
      // (One that came for broken glass is not heard at once: silent at first, then rising.)
      const woke = e.hunter ? Math.max(0, Math.min(1, (e.age - HUNTER_QUIET) / HUNTER_RISE)) : 1;
      const level = e.area !== u.area ? 0 : levelAt(d) * woke * (onWorld ? 1 : (ride ? ride.above * 0.6 : 0));
      if (!e.voice && level > 0.01) e.voice = this._utPlay(e.soundName, pos, { loops: -1, volume: 0.0 });
      // (One in another area is let go at once: it would only play on unheard, and
      // its sound starts afresh when you come back into its area.)
      else if (e.voice && level <= 0.001 && (d > HEAR_RANGE + 10 || e.area !== u.area)) { e.voice.fadeout(80); u.voices.delete(e.voice); e.voice = null; }
      if (e.voice) this._utFollow(e.voice, pos, level, aboveHeight);
    }
    // Pickups and tower items: beacons, as far as the ear carries in your own
    // area; a neighbour's only within AMBIENCE_RANGE of its border, as its air.
    const reach = (area, pos) => {
      if (area === u.area) return levelAt(dist2(pos, this.playerPos));
      if (!onWorld) return 0;
      const [, outside] = nearestPointOf(area, this.playerPos);
      return levelAt(dist2(pos, this.playerPos)) * levelAt(outside, AMBIENCE_RANGE) * outsideGain;
    };
    for (const p of u.pickups) {
      const d = dist2(p.pos, this.playerPos);
      const level = reach(p.area, p.pos) * p.gain * (p.area.kind === 'battle' ? BATTLE_BEACON_BOOST : 1) * (onWorld ? 1 : (ride ? ride.above * 0.6 : 0));
      if (!p.voice && level > 0.01) p.voice = this._utPlay(p.beacon, p.pos, { loops: -1, volume: 0.0 });
      else if (p.voice && level <= 0.001 && d > HEAR_RANGE + 10) { p.voice.stop(); u.voices.delete(p.voice); p.voice = null; }
      if (p.voice) this._utFollow(p.voice, p.pos, level, aboveHeight, dullOf(p.area));
    }
    const bus = u.bus;
    if (bus && (bus.stage === 'waiting' || bus.stage === 'arriving' || bus.stage === 'boarding')) {
      const d = dist2(bus.pos, this.playerPos);
      const level = bus.stage === 'waiting' ? reach(bus.area, bus.pos) * BUS_IDLE_GAIN * (onWorld ? 1 : 0) : BUS_IDLE_GAIN;
      if (!bus.voice && level > 0.01) bus.voice = this._utPlay('ut_bus_idle', bus.pos, { loops: -1, volume: 0.0, fadeMs: 400 });
      else if (bus.voice && level <= 0.001 && d > HEAR_RANGE + 10) { bus.voice.stop(); u.voices.delete(bus.voice); bus.voice = null; }
      if (bus.voice) {
        if (bus.stage === 'waiting') this._utFollow(bus.voice, bus.pos, level, aboveHeight, dullOf(bus.area));
        else { const f = this._utForward(); bus.voice.setSpatial(level, f[0] * 1.5, f[1] * 1.5, 0, 0); }    // at the door, right in front of you
      }
    }
    if (bus && bus.stage === 'coming' && bus.pullVoice) {
      // Pulling up: heard wherever you are in its area (it is meant to be noticed).
      const r = reach(bus.area, bus.pos);
      this._utFollow(bus.pullVoice, bus.pos, (bus.area === u.area ? Math.max(0.35, r) : r) * BUS_PULL_GAIN * (onWorld ? 1 : 0), aboveHeight, dullOf(bus.area));
    }
    for (const sl of u.slides || []) {
      if (u.slide && u.slide.sl === sl) continue;     // riding it: no beacon
      const d = dist2(sl.pos, this.playerPos);
      const level = reach(sl.area, sl.pos) * SLIDE_BEACON_GAIN * (onWorld ? 1 : 0);
      if (!sl.voice && level > 0.01) sl.voice = this._utPlay('stairs_beacon', sl.pos, { loops: -1, volume: 0.0 });
      else if (sl.voice && level <= 0.001 && d > HEAR_RANGE + 10) { sl.voice.stop(); u.voices.delete(sl.voice); sl.voice = null; }
      if (sl.voice) this._utFollow(sl.voice, sl.pos, level, aboveHeight, dullOf(sl.area));
    }
    // The glass cases: each hums where it stands, until it is smashed.
    for (const c of u.cases || []) {
      if (c.smashed) continue;
      const d = dist2(c.pos, this.playerPos);
      const level = reach(c.area, c.pos) * CASE_GAIN * (onWorld ? 1 : 0);
      if (!c.voice && level > 0.01) c.voice = this._utPlay(CASE_SOUND, c.pos, { loops: -1, volume: 0.0, fadeMs: 300 });
      else if (c.voice && level <= 0.001 && d > HEAR_RANGE + 10) { c.voice.stop(); u.voices.delete(c.voice); c.voice = null; }
      if (c.voice) this._utFollow(c.voice, c.pos, level, aboveHeight, dullOf(c.area));
      // Its knock (web 5.0.0), in your own area and within fifteen steps: from
      // where the case stands, faster and louder as you close.
      c.knockT = Math.max(0, (c.knockT || 0) - dt);
      if (onWorld && c.area === u.area && d < CASE_KNOCK_RANGE && c.knockT <= 0) {
        const near = 1 - d / CASE_KNOCK_RANGE;
        c.knockT = CASE_KNOCK_EVERY[1] + (CASE_KNOCK_EVERY[0] - CASE_KNOCK_EVERY[1]) * near;
        this._utPlay(CASE_KNOCK, c.pos, { volume: CASE_KNOCK_LEVEL[0] + (CASE_KNOCK_LEVEL[1] - CASE_KNOCK_LEVEL[0]) * near });
      }
    }
    for (const it of u.towerItems.values()) {
      const pos = this._utItemPos(it);
      const d = dist2(pos, this.playerPos);
      const level = reach(it.area, pos) * (onWorld ? 1 : 0);
      if (!it.channel && level > 0.01) it.channel = this._utPlay('item_beacon', pos, { loops: -1, volume: 0.0 });
      else if (it.channel && level <= 0.001 && d > HEAR_RANGE + 10) { it.channel.stop(); u.voices.delete(it.channel); it.channel = null; }
      if (it.channel) this._utFollow(it.channel, pos, level, aboveHeight, dullOf(it.area));
    }
    // The seabed's own things.
    if (u.seabed) {
      const waterLevel = seabed ? 1 : (ride ? ride.water : 0);
      const h = seabed ? 0 : (ride ? -ride.height : -6);
      for (const p of u.seabed.pickups) {
        const d = dist2(p.pos, this.playerPos);
        const level = seaLevel(d) * p.gain * waterLevel;
        if (!p.voice && level > 0.01) p.voice = this._utPlay(p.beacon, p.pos, { loops: -1, volume: 0.0 });
        if (p.voice) { const rel = this._utRel(p.pos); p.voice.setSpatial(level, rel[0], rel[1], this._behind(p.pos), h); }
      }
    }
  },

  // ---------------------------------------------------------------- the pool, the glass, the cases
  // Whether a place is in a water park's pool.
  _utInPool(pos) {
    const u = this.ut;
    if (u.place !== 'world') return false;
    for (const sl of u.slides || []) if (sl.pool && sl.area === u.area && dist2(sl.pool, pos) < POOL_RADIUS) return true;
    return false;
  },

  // Whether broken glass lies there (round a smashed case, until the world ends).
  _utOnGlass(pos) {
    const u = this.ut;
    for (const g of u.glass || []) if (g.area === u.area && dist2(g.pos, pos) < GLASS_RADIUS) return true;
    return false;
  },

  // What a step sounds like where you now stand: in the pool a wading step, or a
  // swimming stroke when the step is a run's (game.js marks those); on broken glass its crunch; otherwise
  // the area's own floor. (A missing recording falls back to the floor.)
  _utStepSound(a) {
    const pick = (list) => { const have = list.filter((n) => this.audio.has(n)); return have.length ? choice(have) : null; };
    let name = null;
    if (this._utInPool(this.playerPos)) name = pick(this.strideStepping === 'up' ? SWIM_STROKES : STEPS_WATER);
    else if (this._utOnGlass(this.playerPos)) name = pick(STEPS_GLASS);
    return name || choice(a.steps);
  },

  // How far off straight ahead a case is, in radians (0 when you stand on it).
  _utCaseOff(c) {
    const f = this._utForward();
    const dx = c.pos[0] - this.playerPos[0]; const dy = c.pos[1] - this.playerPos[1];
    const d = Math.hypot(dx, dy);
    if (d < 0.5) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (dx * f[0] + dy * f[1]) / d)));
  },

  // The glass case you are lined up with, if there is one: in your area, not yet
  // smashed, beside you, and in front of you.
  _utCaseInReach() {
    const u = this.ut;
    if (u.place !== 'world') return null;
    for (const c of u.cases || []) {
      if (!c.smashed && c.area === u.area && dist2(c.pos, this.playerPos) < CASE_REACH && this._utCaseOff(c) <= CASE_LINED) return c;
    }
    return null;
  },

  // Every frame, and on every step (web 5.0.0). The bell, once, the moment you are
  // lined up with a case: beside it and facing it (again, if you have turned well
  // away or walked off and come back). And the protection: within three steps
  // of a case not yet broken nothing can hit you, for CASE_GUARD_SECONDS in all
  // at that case, so there is time to line up by ear.
  _utUpdateCases(dt = 0) {
    const u = this.ut;
    if (u.place !== 'world') return;
    for (const c of u.cases || []) {
      if (c.smashed || c.area !== u.area) continue;
      const d = dist2(c.pos, this.playerPos);
      const off = this._utCaseOff(c);
      if (d < CASE_REACH && off <= CASE_LINED) {
        if (!c.near) { c.near = true; if (this.audio.has(CASE_CHIME)) this._utPlay(CASE_CHIME, c.pos, { volume: 0.8, keep: true }); }
      } else if (d > CASE_REARM || off > CASE_UNLINED) c.near = false;
      if (dt > 0 && d < CASE_GUARD_RANGE && (c.guard || 0) < CASE_GUARD_SECONDS) {
        c.guard = (c.guard || 0) + dt;
        u.safe = Math.max(u.safe, 0.25);
      }
    }
  },

  // Smash it. The reward is yours at once and the voice says what it is; the
  // chasers that heard the glass are on their way, and the voice does not say so.
  _utSmash(c) {
    const u = this.ut;
    c.smashed = true;
    if (c.voice) { c.voice.stop(); u.voices.delete(c.voice); c.voice = null; }
    if (this.audio.has(CASE_SMASH)) this._utPlay(CASE_SMASH, c.pos, { keep: true }); else this._utPlay('explosion', c.pos, { keep: true });
    u.glass.push({ area: c.area, pos: [c.pos[0], c.pos[1]] });
    u.smashed = (u.smashed || 0) + 1;
    // The chasers: mostly two or three, from as far off as the area allows.
    let roll = rand(); let count = CASE_HUNTERS[0][0];
    for (const [n, share] of CASE_HUNTERS) { count = n; roll -= share; if (roll < 0) break; }
    // Their speed: the lower figure at the start of a run, the upper one once the
    // enemies are as fast as they ever get.
    const pace = Math.max(0, Math.min(1, (this._utSpeedMul() - 1) / (SPEED_CAP - 1)));
    const speed = HUNTER_SPEED[0] + (HUNTER_SPEED[1] - HUNTER_SPEED[0]) * pace;
    let came = 0;
    for (let i = 0; i < count; i++) {
      const avoid = u.enemies.filter((e) => e.area === c.area).map((e) => [e.x, e.y]);
      let pos = null;
      for (const far of HUNTER_FROM) { pos = randomFloor(u.world, c.area, rand, { from: this.playerPos, minDist: far, avoid, clearance: 4.0, tries: 80 }); if (pos) break; }
      if (!pos) continue;
      const e = new Chaser(c.area, pos, speed, randint(0, 9));
      e.hunter = true; e.age = 0;
      u.enemies.push(e);
      came += 1;
    }
    // The reward, one of five (health only if you have any to gain).
    // (No points while the compass is on, as everywhere; so then it is not points.
    // As things stand the compass takes the attack away altogether, so this is only a guard.)
    const kinds = ['shots', 'time', 'items'];
    if (!u.compass.on) kinds.push('points');
    if (u.hp < START_HP) kinds.push('health');
    const kind = choice(kinds);
    let words;
    if (kind === 'points') {
      const got = Math.round(CASE_POINTS * this._utMultiplier());
      u.points += got; u.worldPoints += CASE_POINTS;
      words = `${got} ${plural(got, 'point')}`;
    } else if (kind === 'shots') {
      const got = came + randint(CASE_SHOTS_OVER[0], CASE_SHOTS_OVER[1]);
      u.ammo += got;
      words = `${got} ${plural(got, 'shot')}`;
    } else if (kind === 'time') {
      u.worldTime += CASE_TIME;
      words = `${CASE_TIME} more seconds in this world`;
    } else if (kind === 'items') {
      const got = randint(CASE_ITEMS[0], CASE_ITEMS[1]);
      u.items += got;
      words = `${got} tower ${plural(got, 'item')}`;
    } else {
      const got = Math.min(CASE_HEALTH, START_HP - u.hp);
      u.hp += got;
      if (u.hp > 35) u.lowWarned = false;
      words = `${got} health`;
    }
    u.lastCase = { kind, came };
    this.tts.speak(`${words[0].toUpperCase()}${words.slice(1)}.`, { interrupt: true });   // (the reward alone: web 4.1.2, Russell)
  },

  // A hunter that has lost you: gone, with no bang and no points, and no other in its place.
  _utDropHunter(e) {
    const u = this.ut;
    if (e.voice) { e.voice.stop(); u.voices.delete(e.voice); e.voice = null; }
    const i = u.enemies.indexOf(e);
    if (i >= 0) u.enemies.splice(i, 1);
  },

  // ---------------------------------------------------------------- walking and shooting
  // One step: three units exactly where you face, or straight back (web 4.0.0;
  // until then a swipe stepped north, east, south or west and faced you that
  // way). What is in the way stops you, or at a slant lets you slide along it
  // (walkStep).
  _utStep(g) {
    const u = this.ut;
    if (u.place === 'ride' || u.place === 'slide' || u.place === 'bus') return;   // no walking in the elevator (Island Mode: a swipe does nothing), on the slide or on the bus
    if (g !== 'up' && g !== 'down') return;
    const f = this._utForward();
    const dir = g === 'up' ? f : [-f[0], -f[1]];
    const seabed = u.place === 'seabed';
    const open = seabed
      ? (p) => { const [sx, sy] = this._utSeabedCell(p); return u.seabed.grid.floor.has(key(sx, sy)); }
      : (p) => { const [cx, cy] = cellOf(p); return isFloor(u.world, cx, cy); };
    const from = [this.playerPos[0], this.playerPos[1]];
    const w = walkStep(from, dir, CELL, open);
    if (w.hit && w.moved <= 0) {
      // Stopped by it. (Sliding along a wall is silent since web 4.1.2, Russell:
      // a footstep and a wall at once on every step in a corridor was confusing.
      // Until then the wall sounded beside you, quieter, at WALL_TOUCH.) The seabed has no walls:
      // its edge is the boundary buzz, as in Island Mode; so is an island's edge
      // (Russell, 8 Nov: no labyrinth wall on an island). Elsewhere a wall, where
      // it is (the world's edge is a wall too); a safe zone's walls ring softer
      // than the room would have them.
      // The wall is heard where it stands: the middle of the square that was in
      // your way, so one you slide along is to that side of you, not ahead.
      const level = w.moved > 0 ? WALL_TOUCH : 1.0;
      if (seabed || (u.area && u.area.kind === 'island')) this.audio.play('boundary', { volume: level });
      else this._utPlay('wall', posOf(...cellOf(w.hit)), { volume: level, ...(u.area && u.area.kind === 'event' ? { send: SAFE_WALL_SEND } : {}) });
    }
    if (w.moved <= 0) return;
    u.steps.push([from, w.pos]);
    this.playerPos = w.pos;
    if (u.place === 'world') {
      const a = areaAt(u.world, this.playerPos);
      if (a !== u.area) {
        u.area = a;
        this._utRefreshRooms();
      }
      this._utListenerMix();
      // Pickups are taken the moment you step onto them, not a frame later.
      this._utUpdatePickups();
      this._utUpdateCases();
      this.audio.play(this._utStepSound(a));
    }
    // (Until web 5.0.0 the seabed made no sound underfoot, as in Island Mode. Now
    // each step along it is a swimming stroke under water.)
    if (seabed) {
      const st = DIVE_STROKES.filter((n) => this.audio.has(n));
      const now = this.audio.ctx.currentTime;
      if (st.length && !(now - (u.strokeAt ?? -9) < DIVE_STROKE_EVERY)) { u.strokeAt = now; this.audio.play(this._utFresh(st, 'lastStroke'), { volume: DIVE_STROKE_LEVEL }); }
    }
  },

  _utAttack() {
    const u = this.ut;
    if (u.place === 'ride' || u.place === 'slide' || u.place === 'bus') return;   // nothing fires in the car (Island Mode), on the slide or on the bus
    if (u.place !== 'world') { this.audio.play('empty_click'); return; }   // the seabed: Island Mode's click
    const a = u.area;
    // Within a step of a glass case, the attack smashes it, and no shot is spent.
    const glassCase = this._utCaseInReach();
    if (glassCase) { this._utSmash(glassCase); return; }
    // In a tower area only items are thrown, as on a tower floor: with none held
    // the attack is the empty click, never the laser (Russell, 8 Nov: ammo is no
    // fallback there; get more items or leave the area).
    if (a.kind === 'tower') {
      if (this._utItemsHeld() > 0) this._utThrow(); else this.audio.play('empty_click');
      return;
    }
    if (u.ammo <= 0) { this.audio.play('empty_click'); return; }
    u.ammo -= 1;
    this.audio.play('laser');
    if (u.ammo <= LOW_AMMO_FROM && u.ammo >= 1) this.audio.play(`ut_low_ammo_${u.ammo}`, { areaMix: this._utMixAt(this.playerPos) });
    const hit = this._utLocked();
    if (!hit) return;
    if (hit.kind === 'thrower') {
      hit.hitsTaken += 1;
      if (hit.hitsTaken >= hit.hitsNeeded) this._utKillEnemy(hit, 'laser');
      else this._utLater(Math.min(0.4, dist2(this._utEnemyPos(hit), this.playerPos) * 0.012), 'enemy_hit', this._utEnemyPos(hit));
    } else this._utKillEnemy(hit, 'laser');
  },

  _utThrow() {
    const u = this.ut;
    const a = u.area;
    const throwers = u.enemies.filter((e) => e.kind === 'thrower' && e.area === a);
    if (!throwers.length) { this.audio.play('empty_click'); return; }
    u.items -= 1;
    this.audio.play('item_throw');
    // The aim: the nearest thrower in front of you (or within two steps).
    let best = null; let bestD = Infinity;
    for (const e of throwers) {
      const pos = this._utEnemyPos(e);
      const d = dist2(pos, this.playerPos);
      if (d > 0 && (this._utInFront(pos) || d <= AIM_CLOSE) && d < bestD) { best = e; bestD = d; }
    }
    if (!best) return;
    best.hitsTaken += 1;
    if (best.hitsTaken >= best.hitsNeeded) this._utKillEnemy(best, 'item');
    else this._utLater(Math.min(0.4, bestD * 0.012), 'enemy_hit', this._utEnemyPos(best));
  },

  // What a shot takes: the nearest enemy of the player's own area that is in
  // front of you (within AIM_HALF of the way you face) and within hearing, or any
  // within AIM_CLOSE whatever side it is on.
  _utLocked() {
    const u = this.ut;
    let best = null; let bestD = Infinity;
    for (const e of u.enemies) {
      if (e.area !== u.area) continue;
      const pos = this._utEnemyPos(e);
      const dx = pos[0] - this.playerPos[0]; const dy = pos[1] - this.playerPos[1];
      const d = Math.hypot(dx, dy);
      if (d <= 0 || d > HEAR_RANGE) continue;
      if ((this._utInFront(pos) || d <= AIM_CLOSE) && d < bestD) { best = e; bestD = d; }
    }
    return best;
  },

  _utReport() {
    const u = this.ut;
    // (Shots, then items: what the attack has to work with, wherever you are.)
    // Last, the way you face, as one of eight words (web 4.0.0: you can stop at any angle).
    this.tts.speak(`${u.hp} health. ${u.points} ${plural(u.points, 'point')}. ${u.ammo} ${plural(u.ammo, 'shot')}. ${u.items} ${plural(u.items, 'item')}. Facing ${this._utFacingWord()}.`, { interrupt: true });
  },

  // The way you face, to the nearest of eight.
  _utFacingWord() { return facingWord(this.ut.face); },

  // ---------------------------------------------------------------- the compass
  // (Russell, 8 Nov, fourth and fifth reports: the compass costs time to use, so
  // every use should earn it. It now works in a safe zone too, where it leads to
  // the way out; turning it on gives a briefing, and each turn says the leg with
  // its turn, or what lies that way: walls, the border, the areas beyond.)
  // Web 4.0.0: the compass turns you for real. With it on, a turn is your own
  // turn: the beep rises as you face the way to go, and landing on a main
  // direction says what lies ahead of you now. Turn it off and you are already
  // facing the way you chose. (Until then it had a pointer of its own with four
  // positions, and the world never turned.)
  _utCompassToggle() {
    const u = this.ut;
    if (u.compass.on) { this._utCompassOff(); return; }
    if (u.place === 'ride') { this.tts.speak('Compass not available in the elevator.', { interrupt: true }); return; }
    if (u.place === 'slide') { this.tts.speak('Compass not available on the slide.', { interrupt: true }); return; }
    if (u.place === 'bus') { this.tts.speak('Compass not available on the bus.', { interrupt: true }); return; }
    u.compass.on = true;
    u.compass.t = 0;
    this.stride = null;
    this.audio.setMuffle(true, 0.4);
    // The briefing, which says where the way to go is, then what lies ahead of you.
    this.tts.speak(`Compass on. ${this._utCompassBriefing()} ${this._utCompassWords(mainIndex(u.face), true)}`, { interrupt: true });
  },

  _utCompassOff(quiet = false) {
    const u = this.ut;
    if (!u.compass.on) return;
    u.compass.on = false;
    this.audio.setMuffle(false, 0.4);
    if (!quiet) this.tts.speak('Compass off.', { interrupt: true });
  },

  // Where the compass leads: a waiting bus; from inside a safe zone, the way out
  // of it; otherwise the nearest safe zone. (On the seabed, the way up: below.)
  _utRouteTarget() {
    const u = this.ut;
    const bus = this._utBusWaiting();
    if (bus) return { name: 'the bus', isGoal: null, goalCell: cellOf(bus.pos) };
    if (this._utInSafeZone()) { const here = u.area; return { name: 'the way out', isGoal: (a) => a !== here, goalCell: null }; }
    return { name: 'the safe zone', isGoal: (a) => a.kind === 'event', goalCell: null };
  },

  // The route and its first leg: { target, path, leg }, leg = { dir, steps,
  // arrives, next (the direction of the leg after, or null) }, or leg null when
  // already there or there is no way.
  _utRoute() {
    const u = this.ut;
    if (u.place === 'seabed') {
      const [cx, cy] = this._utSeabedCell(this.playerPos);
      const target = { name: 'the way up' };
      if (!cx && !cy) return { target, path: null, leg: null };
      const along = Math.abs(cx) >= Math.abs(cy);
      const dir = along ? [-Math.sign(cx), 0] : [0, -Math.sign(cy)];
      const steps = along ? Math.abs(cx) : Math.abs(cy);
      const arrives = along ? cy === 0 : cx === 0;
      const next = arrives ? null : (along ? [0, -Math.sign(cy)] : [-Math.sign(cx), 0]);
      return { target, path: null, leg: { dir, steps, arrives, next } };
    }
    const target = this._utRouteTarget();
    const from = cellOf(this.playerPos);
    const path = routeToward(u.world, from, target.isGoal, target.goalCell);
    return { target, path, leg: legOf(path, from) };
  },

  _utRouteLeg() { return this._utRoute().leg; },

  _utBusWaiting() { const b = this.ut.bus; return b && b.stage === 'waiting' ? b : null; },

  _utRouteStep() { const leg = this._utRouteLeg(); return leg ? leg.dir : null; },

  // The briefing when the compass comes on: where you are, how far the goal is
  // and which way to start, and the nearest things worth walking to.
  _utCompassBriefing() {
    const u = this.ut;
    const parts = [];
    if (u.place === 'seabed') {
      parts.push('You are on the seabed.');
      const { leg } = this._utRoute();
      parts.push(leg ? `The way up is ${this._utDistanceWords(leg)}.` : 'The way up is here.');
      return parts.join(' ');
    }
    const a = u.area;
    const where = { labyrinth: 'in a labyrinth', island: 'on an island', tower: 'in a tower area', battle: 'in a battle area', event: 'in a safe zone' }[a ? a.kind : ''] || 'in the world';
    parts.push(`You are ${where}.`);
    const { target, path, leg } = this._utRoute();
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    if (!leg) {
      const from = cellOf(this.playerPos);
      const here = target.goalCell ? (target.goalCell[0] === from[0] && target.goalCell[1] === from[1]) : (a && target.isGoal && target.isGoal(a));
      parts.push(here ? `${cap(target.name)} is here.` : `No way to ${target.name} from here.`);
    } else parts.push(`${cap(target.name)} is ${path.length} ${plural(path.length, 'step')} away, starting ${this._utBearing(leg.dir)}.`);
    const near = this._utCompassNearby();
    parts.push(near.length ? `Nearby: ${near.join('; ')}.` : 'Nothing to pick up nearby.');
    return parts.join(' ');
  },

  // The nearest things worth walking to, by the walking route: cartridges,
  // credits, potions, a tower item, the water slide, the island's elevator, up to
  // three, each with its route length and the way to start.
  _utCompassNearby() {
    const u = this.ut; const w = u.world; const a = u.area;
    if (!w || !a) return [];
    const from = cellOf(this.playerPos);
    const things = [];
    for (const p of u.pickups) {
      const name = p.kind === 'ammo' ? 'ammo' : p.kind === 'credit' ? `a ${p.value} credit` : p.kind === 'potion' ? 'a potion' : null;
      if (name) things.push({ name, pos: p.pos });
    }
    const item = a.kind === 'tower' ? u.towerItems.get(a.id) : null;
    if (item) things.push({ name: 'a tower item', pos: this._utItemPos(item) });
    for (const sl of u.slides || []) if (sl.area === a) things.push({ name: 'the water slide', pos: sl.pos });
    for (const c of u.cases || []) if (c.area === a && !c.smashed) things.push({ name: 'a glass case', pos: c.pos });
    if (a.kind === 'island' && a.elevator && u.place === 'world') things.push({ name: 'the elevator', pos: posOf(a.elevator[0], a.elevator[1]) });
    // The six nearest as the crow flies, then the three shortest walks among them.
    const byAir = things.map((t) => ({ ...t, d: dist2(t.pos, this.playerPos) })).filter((t) => t.d < COMPASS_NEAR_RANGE)
      .sort((x, y) => x.d - y.d).slice(0, 6);
    const walked = [];
    for (const t of byAir) {
      const goal = cellOf(t.pos);
      if (goal[0] === from[0] && goal[1] === from[1]) { walked.push({ ...t, steps: 0, leg: null }); continue; }
      const path = routeToward(w, from, null, goal);
      if (!path) continue;
      walked.push({ ...t, steps: path.length, leg: legOf(path, from) });
    }
    walked.sort((x, y) => x.steps - y.steps);
    return walked.slice(0, COMPASS_NEAR_COUNT).map((t) => t.steps === 0 ? `${t.name}, right here` : `${t.name}, ${this._utDistanceWords(t)}`);
  },

  // "6 steps away, starting west, to your left" for a route of that many steps
  // whose first leg goes that way: the direction by name, and where it is from
  // the way you face.
  _utDistanceWords(t) {
    const steps = t.steps !== undefined ? t.steps : t.path ? t.path.length : null;
    const leg = t.leg || t;
    const n = steps !== null && steps !== undefined ? steps : leg.steps;
    return `${n} ${plural(n, 'step')} away, starting ${this._utBearing(leg.dir)}`;
  },

  // What the compass says for the way you face (web 4.1.0: it describes, where it
  // used to say only "This way"). Every answer begins with the direction's name.
  // Facing a main direction (idx 0 north, 1 east, 2 south, 3 west): how far that
  // way is open, what stops you and what lies beyond. If it is the way to go, it
  // says so first, and ends with the walk: "North, the way to the safe zone. Open
  // for 6 steps, then a wall. Beyond, a tower area, 9 steps away. Walk 6 steps this
  // way, then turn left, to face west." If it is not, it ends with where the way
  // is: "The way to the safe zone is north, to your left." Facing between two main
  // directions (idx -1) there is no row of squares to describe: it names the way
  // you face and where the way to go is, in degrees. `brief`: without where the
  // way is (the briefing has just said it).
  _utCompassWords(idx, brief = false) {
    const { target, leg } = this._utRoute();
    const cap = (t) => t[0].toUpperCase() + t.slice(1);
    // ("The way to the safe zone", "the way to the bus"; "the way out" and "the way up" as they are.)
    const wayName = target && /^the way /.test(target.name) ? target.name : `the way to ${target ? target.name : 'go'}`;
    if (idx < 0) {
      const facing = `Facing ${this._utFacingWord()}.`;
      return leg && !brief ? `${facing} ${cap(wayName)} is ${this._utBearing(leg.dir)}.` : facing;
    }
    const d = COMPASS_DIRS[idx];
    const name = cap(MAIN_WORDS[idx]);
    const way = this._utCompassWay(idx);
    const said = way ? cap(way) + ' ' : '';
    if (leg && leg.dir[0] === d[0] && leg.dir[1] === d[1]) {
      const n = leg.steps;
      const walk = `Walk ${n} ${plural(n, 'step')} this way`;
      if (leg.arrives) return `${name}, ${wayName}. ${said}${walk}, and you are there.`;
      // (Clockwise from the leg to the one after it is a turn to the right.)
      const right = leg.dir[0] * leg.next[1] - leg.dir[1] * leg.next[0] > 0;
      const next = MAIN_WORDS[COMPASS_DIRS.findIndex((o) => o[0] === leg.next[0] && o[1] === leg.next[1])];
      return `${name}, ${wayName}. ${said}${walk}, then turn ${right ? 'right' : 'left'}, to face ${next}.`;
    }
    if (!leg || brief) return `${name}. ${said}`.trim() || `${name}.`;
    return `${name}. ${said}${cap(wayName)} is ${this._utBearing(leg.dir)}.`;
  },

  // That way from here: open for how many steps, what stops you (a wall, the
  // island's edge, the border), and the areas beyond (in reach, then in view).
  _utCompassWay(idx) {
    const u = this.ut; const w = u.world; const a = u.area;
    const [dx, dy] = COMPASS_DIRS[idx];
    if (u.place === 'seabed') {
      const [cx, cy] = this._utSeabedCell(this.playerPos);
      const half = u.seabed.grid.half;
      const open = dx ? (dx > 0 ? half - cx : half + cx) : (dy > 0 ? half - cy : half + cy);
      return open > 0 ? `open for ${open} ${plural(open, 'step')}, then the edge.` : 'the edge.';
    }
    if (!w || !a || u.place !== 'world') return '';
    const [cx, cy] = cellOf(this.playerPos);
    let open = 0; let x = cx; let y = cy; let stop = 'wall';
    for (let i = 0; i < AREA_CELLS + 2; i++) {
      x += dx; y += dy;
      if (!isFloor(w, x, y)) { stop = 'wall'; break; }
      if (areaAt(w, posOf(x, y)) !== a) { stop = 'border'; break; }
      open += 1;
    }
    const toBorder = Math.max(1, dx > 0 ? a.x1 + 1 - cx : dx < 0 ? cx - (a.x0 - 1) : dy > 0 ? a.y1 + 1 - cy : cy - (a.y0 - 1));
    const next = w.areas.find((o) => o.ax === a.ax + dx && o.ay === a.ay + dy) || null;
    const beyond = w.areas.find((o) => o.ax === a.ax + 2 * dx && o.ay === a.ay + 2 * dy) || null;
    const name = (o) => ({ labyrinth: 'a labyrinth', island: 'an island', tower: 'a tower area', battle: 'a battle area', event: 'a safe zone' })[o.kind];
    const then = beyond ? `, then ${name(beyond)}` : '';
    const steps = (n) => `${n} ${plural(n, 'step')}`;
    if (stop === 'border') return `open to the border, ${steps(open)}, into ${name(next)}${then}.`;
    const blocker = a.kind === 'island' ? "the island's edge" : 'a wall';
    if (!next) return open ? `open for ${steps(open)}, then ${blocker}; the edge of the world is ${steps(toBorder)} away.` : `${blocker}; the edge of the world is ${steps(toBorder)} away.`;
    const beyondWords = `Beyond, ${name(next)}, ${steps(toBorder)} away${then}.`;
    return open ? `open for ${steps(open)}, then ${blocker}. ${beyondWords}` : `${blocker}. ${beyondWords}`;
  },

  // Swipe up with the compass on: what lies ahead, said again.
  _utCompassAgain() {
    const u = this.ut;
    u.compass.t = COMPASS_BEEP_EVERY;   // and a beep at once
    this.tts.speak(this._utCompassWords(mainIndex(u.face)), { interrupt: true });
  },

  // The beep: highest when you face the way to go, lowest with your back to it,
  // and quicker while you turn, so the pitch follows the turn.
  _utCompassTick(dt) {
    const u = this.ut;
    u.compass.t += dt;
    if (u.compass.t < (u.turn ? COMPASS_BEEP_TURNING : COMPASS_BEEP_EVERY)) return;
    u.compass.t = 0;
    const route = this._utRouteStep();
    let step = 0;
    if (route) {
      const f = this._utForward();
      const dot = f[0] * route[0] + f[1] * route[1];   // 1 toward, 0 across, -1 away
      step = Math.round((dot + 1) / 2 * 8);
    }
    this.audio.play(compassName(step), { direct: true, volume: 0.6 });
  },

  // ---------------------------------------------------------------- the end
  _utGameOver() {
    this._utStopWorld();
    this.triggerGameOver();
  },
};

function crowdSend(name) { return CROWD_LIVE_RECORDED.includes(name) ? CROWD_SEND_LIVE : CROWD_SEND; }

// The first leg of a route: how far it runs straight, and which way it turns.
function legOf(path, fromCell) {
  if (!path || !path.length) return null;
  const dir = [path[0][0] - fromCell[0], path[0][1] - fromCell[1]];
  let steps = 1;
  for (let i = 1; i < path.length; i++) {
    const d = [path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]];
    if (d[0] !== dir[0] || d[1] !== dir[1]) break;
    steps += 1;
  }
  const next = steps < path.length ? [path[steps][0] - path[steps - 1][0], path[steps][1] - path[steps - 1][1]] : null;
  return { dir, steps, arrives: steps === path.length, next };
}

// ------------------------------------------------------------------ the mode
function reset(game) {
  if (game.ut) {
    for (const v of [...game.ut.voices]) v.stop();
    game.ut.voices.clear();
    for (const v of [...game.ut.shots]) v.stop();
    game.ut.shots.clear();
    if (game.ut.compass.on) game.audio.setMuffle(false, 0.01);
  }
  if (game.audio && game.audio.spatial) game.audio.spatialOff();
  game.ut = null;
}

// The run is over (or quit): its sounds stop and the 3D world closes. What the run
// scored is kept for finish(); the next run's reset clears it.
function stopAll(game) {
  const u = game.ut;
  if (u) {
    for (const v of [...u.voices]) v.stop();
    u.voices.clear();
    for (const v of [...u.shots]) v.stop();
    u.shots.clear();
    if (u.ride && u.ride.voice) u.ride.voice.stop();
    if (u.bus && u.bus.pullVoice) u.bus.pullVoice.stop();
    if (u.compass.on) { u.compass.on = false; game.audio.setMuffle(false, 0.01); }
    // The finished run's world is let go of at once, not kept until the next
    // run replaces it (Russell, 8 Nov: the game crashed after three games). Every
    // placed sound of a world holds two HRTF panners and the areas' sounds held
    // some thirty voices; the run's score and times stay for the Game Over words.
    u.areaSounds.clear(); u.enemies = []; u.projectiles = []; u.pickups = []; u.slides = []; u.slide = null;
    u.bus = null; u.towerItems.clear(); u.ride = null; u.seabed = null; u.lift = null;
    u.world = null; u.area = null;
  }
  if (game.audio && game.audio.spatial) game.audio.spatialOff({ now: true });
  // The long recordings this run decoded (the areas' backgrounds, up to twenty of
  // them) are released now that nothing plays, down to the engine's usual few.
  if (game.audio && game.audio.trimBig) game.audio.trimBig();
}

function input(game, g) {
  const u = game.ut;
  if (!u) return;
  if (g === 'clock') return;   // no clock in this mode
  if (u.phase === 'silence') return;   // between worlds nothing answers
  if (g === 'hold' || g === 'compass') { game._utCompassToggle(); return; }
  // A swipe left or right, or one press of an arrow: a quick turn (the compass
  // on or off; a held turn arrives through turnInput, below).
  if (g === 'left' || g === 'right') { game._utTurnQuick(g === 'right' ? 1 : -1); return; }
  if (u.compass.on) {
    // You turn, and nothing else moves.
    if (g === 'up') game._utCompassAgain();
    else if (g === 'enter') game._utReport();
    else if (g === 'space') game.audio.play('empty_click');
    return;
  }
  if (g === 'enter') { game._utReport(); return; }
  if (g === 'space') { game._utAttack(); return; }
  if (g === 'up' || g === 'down') game._utStep(g);
}

export default {
  menu: [{ key: 'ultimate', label: 'Ultimate Mode', select: (game) => game.startUltimate() }],
  playStates: [STATE],
  mixin,
  init(game) {
    game.ut = null;
    // The mode's own tones (the compass, the low-ammo tones, the slide, the bus
    // chime) are made now, with the game, so Help's demos have them before any run
    // (they were made only when a run began, and the demos were silent until then).
    try { if (game.audio && game.audio.ctx) makeSounds(game.audio); } catch (e) { /* made again when a run begins */ }
  },
  reset,
  update(game, dt) { game.updateUltimateMode(dt); },
  input,
  stopAll,
  // No pause during an elevator ride, as in Island Mode.
  blockPause(game) { return !!(game.ut && (game.ut.place === 'ride' || game.ut.place === 'slide' || game.ut.place === 'bus')) && !game.isPaused; },
  // A finger held still turns the compass (gestures.js emits 'hold' only when asked).
  holdGesture(game) { return !!(game.ut && game.ut.place !== 'ride'); },
  // Sliding left or right and holding, or holding an arrow key, turns you until
  // it is let go; on a keyboard, holding up or down runs or walks back (web
  // 4.0.0; gestures.js does these only when asked).
  turnGesture(game) { return !!game.ut; },
  // The start and the end of a held turn. The end is taken whatever else is
  // going on (a finger may lift during a pause); a start only in play.
  turnInput(game, g) {
    const u = game.ut;
    if (!u) return;
    if (g === 'turn_end') { game._utTurnEnd(); return; }
    if (game.state !== STATE || game.isPaused) return;
    game._utTurnStart(g === 'turn_right_start' ? 1 : -1);
  },
  // A run carries on for as long as a step moves you, wherever you are facing
  // (sliding along a wall counts; stopped by one, the run ends).
  strideMoved(game, before) { const d = dist2(before, game.playerPos); return d > 0.5 && d < 3.5; },
  // How far behind you a place is (0 in front, 1 straight behind), for its dull
  // copy: by the way you face.
  behind(game, pos) {
    if (!game.ut) return undefined;
    const f = game._utForward();
    const dx = pos[0] - game.playerPos[0]; const dy = pos[1] - game.playerPos[1];
    const d = Math.hypot(dx, dy);
    if (d <= 1e-6) return 0.0;
    const back = -(dx * f[0] + dy * f[1]) / d;
    return back <= 0 ? 0.0 : Math.min(1.0, Math.pow(back, RULES.BEHIND_CURVE));   // (the curve every mode uses)
  },
  // The quit question holds the run: a turn under way ends.
  hold(game, on) { if (on && game.ut) game._utTurnStop(); },
  // Help opens: the compass goes off, so the help's demos are not heard muffled.
  interrupted(game) { if (game.ut) { game._utTurnStop(); game._utCompassOff(true); } },
  // A pause ends a turn under way. A pause in the last two seconds of a world
  // holds the fade where it is; the fade carries on from there when the run resumes.
  paused(game, on) {
    const u = game.ut; const a = game.audio;
    if (u && on) game._utTurnStop();
    if (!u || u.phase !== 'fading' || !a.worldGain) return;
    if (on) a.setWorldLevel(a.worldGain.gain.value, 0.01);
    else a.setWorldLevel(0, Math.max(0.05, u.worldTime));
  },
  // A run or a backward walk never carries across a regeneration or a ride, and
  // never happens while the compass is on, on a ride, or between worlds.
  strideSig(game) { return game.ut ? `${game.ut.worldNo}|${game.ut.place}` : ''; },
  blockStride(game) { const u = game.ut; return !u || u.compass.on || u.place === 'ride' || u.place === 'slide' || u.place === 'bus' || u.phase === 'silence'; },
  finish(game) {
    const u = game.ut || { points: 0, elapsed: 0, worlds: 0 };
    const worlds = u.worlds;
    return {
      key: BOARD, score: u.points,
      message: `Game Over. You scored ${u.points} ${plural(u.points, 'point')}, survived ${spokenTime(u.elapsed)}, `
        + `and made it through ${worlds} ${plural(worlds, 'world')}. `,
    };
  },
  // The echo is the area's own (audio.js buses); the room is never set here.
  room() { return null; },
  surroundings() { return [1.0, 0.0]; },
  status(game) {
    const u = game.ut;
    if (!u) return 'Ultimate Mode.';
    const bits = [`Ultimate Mode. World ${u.worldNo}.`, `Health ${u.hp}.`, `${u.points} ${plural(u.points, 'point')}.`, `${u.ammo} ${plural(u.ammo, 'shot')}.`, `${u.items} ${plural(u.items, 'item')}.`, `Facing ${game._utFacingWord()}.`];
    if (u.place === 'seabed') bits.push('Seabed.');
    if (u.compass.on) bits.push('Compass on.');
    return bits.join(' ');
  },
  boards: [{ key: BOARD, label: 'Ultimate Mode', fmt: (v) => `${v} ${v === 1 ? 'point' : 'points'}` }],
  help: { sections: HELP_SECTIONS, demos: HELP_DEMOS },
};
