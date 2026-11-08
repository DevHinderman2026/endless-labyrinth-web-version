// Every mode added to the web version beyond Standard and Battle, in the
// desktop's main menu order (Standard, Battle, Driving, Tower, Island, Chaos,
// then the web's own Ultimate Mode, then Events, Event High Scores). Each one is a module of its own; see PORTING.md
// for what a mode provides. Standard and Battle live in game.js itself.
import driving from './driving.js';
import tower from './tower.js';
import island from './island.js';
import chaos from './chaos.js';
import ultimate from './ultimate.js';
import events from './events.js';

// Ultimate Mode (web 2.0.0, the web's own) comes right after Chaos.
export const MODES = [driving, tower, island, chaos, ultimate, events];
