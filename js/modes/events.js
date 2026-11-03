// Events: time-limited challenges the developer publishes as signed JSON files in
// the "events" folder of the game's GitHub repository, the same files the Windows
// game plays (event_engine.py, event_missions.py, event_schema.py, event_sign.py
// and the event hooks of endless_labyrinth.py). Two main menu entries, Events and
// Event High Scores; an event run in its event room; all thirty missions.
//
// The desktop's developer test mode (local_events.on and the local events folder)
// does not exist here: only published events are ever offered.

import { EngineMixin, S_EVENT, S_EVENTS_MENU, S_EVENT_SCORES, EVENT_ROOM_GAIN, EVENT_SQUARE_HALF } from './events/engine.js';
import { MissionsMixin } from './events/missions.js';
import { eventHelp } from './events/help.js';

export default {
  name: 'events',
  menu: [
    { key: 'events', label: (g) => g._eventMenuLabel('events'), select: (g) => g.openEventsMenu() },
    { key: 'event_score', label: (g) => g._eventMenuLabel('event_score'), select: (g) => g._eventSpeakScore() },
  ],
  playStates: [S_EVENT],
  mixin: { ...EngineMixin, ...MissionsMixin },

  init(game) { game._eventSetup(); },

  reset(game) {
    game.evLastStep = [0, -1];
  },

  update(game, dt) {
    if (game.isPaused) return;
    game.updateEventMode(dt);
  },

  // A gesture during an unpaused event run (the desktop's STATE_PLAY_EVENT keys).
  input(game, g) {
    if (g === 'clock') { game.eventClockReport(); return; }          // an event with no clock says so
    if (g === 'enter') { game.eventStatusReport(); return; }         // the report, as in every mode
    if (g === 'space') { game.eventFire(); return; }                 // the attack, as in every mode
    if (!['up', 'down', 'left', 'right'].includes(g)) return;
    // Some missions use the swipes for something other than walking: a reflex event
    // answers a sound with the swipe toward it.
    if (game.mArrow(g)) return;
    let [nx, ny] = game.playerPos;
    const step = 3.0;
    if (g === 'up') { ny -= step; game.playerFacing = [0, -1]; }
    else if (g === 'down') { ny += step; game.playerFacing = [0, 1]; }
    else if (g === 'left') { nx -= step; game.playerFacing = [-1, 0]; }
    else { nx += step; game.playerFacing = [1, 0]; }
    const lim = game.arenaLimit;
    if (nx >= -lim && nx <= lim && ny >= -lim && ny <= lim) {
      game.playerPos = [nx, ny];
      game._playStep();
      // An event mission that counts steps, or listens for them.
      game.mOnStep();
    } else {
      game.audio.play('boundary');
    }
  },

  stopAll(game) {
    if (!game.eventFeed) return;
    game._eventStopAll();
    // Quitting a run keeps nothing from it; a run that ended keeps its event until
    // the end of the run has been told (finish, below).
    if (game.state !== 'game_over') game.ev = null;
  },

  finish(game) {
    return { custom: true, message: game._eventFinishMessage() };
  },

  // The event's own room; open air has no echo.
  room(game, state) {
    if (state === S_EVENT && game.ev) return game.ev.room === 'open' ? null : game.ev.room;
    return null;
  },

  // The wall effect: the arena's, and in a cathedral or hall, its louder echo.
  surroundings(game, pos, room) {
    if (room === 'lab') return game._labSurroundings(pos);
    if (room === 'tower' || room === 'battle') return game._arenaSurroundings(pos);
    if (room === 'cathedral' || room === 'hall') {
      const [g, lean] = game._arenaSurroundings(pos);
      return [g * (EVENT_ROOM_GAIN[room] || 1.0), lean];
    }
    return [1.0, 0.0];
  },

  // In the player's own square (an event's step): at their feet, not behind.
  behind(game, pos) {
    const dx = pos[0] - game.playerPos[0];
    const dy = pos[1] - game.playerPos[1];
    if (Math.hypot(dx, dy) > 1e-6 && dy > 0 && Math.abs(dx) <= EVENT_SQUARE_HALF && Math.abs(dy) <= EVENT_SQUARE_HALF) return 0.0;
    return undefined;
  },

  gestureMode() { return 'run'; },

  status(game) {
    const ev = game.ev;
    if (!ev) return 'Event';
    const p = Math.trunc(game.evPoints + (game.evAlivePoints || 0));
    return `${ev.name}. ${p} points.` + (game.evClock ? ` ${Math.max(0, Math.trunc(game.timeLeft))} seconds.` : '');
  },

  help: { sections: [['Events', eventHelp()]], demos: [] },

  inputStates: {
    [S_EVENTS_MENU]: (game, g) => game.eventsMenuInput(g),
    [S_EVENT_SCORES]: (game, g) => game.eventScoresInput(g),
  },

  statusFor: {
    [S_EVENTS_MENU]: (game) => 'Events: ' + (game.eventMenu.length ? game._eventLine(game.eventMenu[Math.min(game.eventMenuIndex, game.eventMenu.length - 1)]).slice(0, 70) : ''),
    [S_EVENT_SCORES]: (game) => 'Event High Scores: ' + game._eventScoreLines()[Math.min(game.eventScoreIndex || 0, game._eventScoreLines().length - 1)].slice(0, 70),
  },

  tick(game, dt) { game._eventTick(dt); },
};
