// Every mode added to the web version beyond Standard and Battle, in main menu
// order. Each one is a module of its own; see PORTING.md for what a mode provides.
// Standard and Battle live in game.js itself.
// Web 6.0.0 (Russell, 19 Nov): the menu ends with Find the Voice, then Ultimate
// Mode, then Chaos Mode, the very last mode, since it now holds the other two:
// Standard, Battle, Driving, Tower, Island, Events, Event High Scores, Find the
// Voice, Ultimate Mode, Chaos Mode. (Until then Chaos came after Island, and
// Ultimate Mode, Events and Event High Scores after it.)
import driving from './driving.js';
import tower from './tower.js';
import island from './island.js';
import chaos from './chaos.js';
import ultimate from './ultimate.js';
import events from './events.js';
import findvoice from './findvoice.js';

export const MODES = [driving, tower, island, events, findvoice, ultimate, chaos];
