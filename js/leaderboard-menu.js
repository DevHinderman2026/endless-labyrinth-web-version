// The Weekly Leaderboard on the main menu, and the winner's ceremony (web 7.2.0).
// Its data and rules are in js/leaderboard.js; these methods join the game's own
// (js/game.js), like a mode's.

import * as lb from './leaderboard.js';

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
const TOP = 5;
// The ceremony's sounds (web 7.2.0, Pixabay): the developer's pen signing, then
// applause. Until they are in the game, the arena crowd's roar stands in for the applause.
export const LB_PEN = 'lb_pen';
export const LB_APPLAUSE = 'lb_applause';
const APPLAUSE_STANDIN = 'ut_crowd_roar_1';
const PEN_GAP = 0.4;          // seconds from the end of the words to the pen
const APPLAUSE_GAP = 0.3;     // seconds from the end of the pen to the applause

export const LB_HOW = 'How it works. Every Chaos Mode score counts, and only scores are shown, with no names. '
  + 'Each week runs from Monday to Sunday, Eastern time. On Monday the developer checks the best score of the week before, '
  + 'and signs it. That player gets a reward in every run for the whole of the next week, and hears a ceremony: '
  + 'the rewards take turns, week by week, between extra health, extra ammo and extra time. '
  + 'To take part you need only play Chaos Mode: each Chaos score is sent with a random number that stands for this device, '
  + 'and nothing else about you. The Privacy Policy on the website says more.';

export const mixin = {
  // ---------------------------------------------------------------- the menu
  _lbOpen() {
    this.state = 'leaderboard';
    this.lbIndex = 0;
    this.lbLines = ['Weekly Leaderboard. Loading the scores.'];
    this.lbItems = [null];
    const gen = this.lbGen = (this.lbGen || 0) + 1;
    this.tts.speak('Weekly Leaderboard. Swipe up and down to hear them. Double tap to choose, triple tap to go back. Loading the scores.');
    this._lbLoad().then(() => {
      if (this.lbGen !== gen || this.state !== 'leaderboard') return;
      this.tts.speak(this.lbLines[0], { interrupt: false });
    });
  },

  async _lbLoad() {
    const week = lb.weekOf();
    const lines = []; const items = [];
    const add = (text, item = null) => { lines.push(text); items.push(item); };
    let rows = null;
    try { rows = await lb.board(week); } catch (e) { rows = null; }
    let r = null;
    try { r = await lb.loadResult(); } catch (e) { r = null; }
    const me = lb.deviceId();
    if (rows === null) add('The scores could not be loaded. Check your connection, and open this menu again.');
    else if (!rows.length) add(`This week, from ${lb.weekWords(week)}: no Chaos Mode scores yet.`);
    else {
      add(`This week, from ${lb.weekWords(week)}: ${rows.length} ${rows.length === 1 ? 'player' : 'players'}.`);
      rows.slice(0, TOP).forEach((row, i) => add(`${ORDINALS[i]} place: ${row.best} ${row.best === 1 ? 'point' : 'points'}.${row.id === me ? ' That is you.' : ''}`));
      const mine = rows.findIndex((row) => row.id === me);
      if (mine >= 0) add(`Your best this week: ${rows[mine].best} points, place ${mine + 1} of ${rows.length}.`);
      else add('You have no Chaos Mode score this week yet. Play Chaos Mode to be on the board.');
    }
    if (r) {
      const yours = r.winner === me && lb.won();
      add(`Last week's winner scored ${r.score} points. The reward this week: ${lb.REWARD_WORDS[r.reward]}.${yours ? ' That is you! Your reward is on in every run until Sunday at midnight.' : ''}`);
      add('Play the ceremony.', 'ceremony');
    } else add('Last week\'s winner is not announced yet. The developer signs the result on Monday.');
    add(LB_HOW);
    add('Back to the main menu.', 'back');
    this.lbLines = lines; this.lbItems = items;
    if (this.lbIndex >= lines.length) this.lbIndex = 0;
  },

  _lbInput(g) {
    const n = this.lbLines.length;
    if (g === 'up' || g === 'down') {
      this.lbIndex = g === 'up' ? Math.max(0, this.lbIndex - 1) : Math.min(n - 1, this.lbIndex + 1);
      this.audio.play('menu_move');
      this.tts.speak(this.lbLines[this.lbIndex]);
    } else if (g === 'enter') {
      const item = this.lbItems[this.lbIndex];
      if (item === 'ceremony') { this.audio.play('menu_move'); this._lbCeremony(); }
      else if (item === 'back') this._lbClose();
      else this.tts.speak(this.lbLines[this.lbIndex]);
    } else if (g === 'back') this._lbClose();
  },

  _lbClose() {
    this.lbGen = (this.lbGen || 0) + 1;
    this._lbStopCeremony();
    this.audio.play('menu_move');
    this._toMenu();
  },

  // ---------------------------------------------------------------- the ceremony
  // The words (Bella's, when her recordings can say them), the pen signing, applause.
  _lbCeremonyWords(r) {
    const reward = lb.REWARD_WORDS[r.reward];
    if (r.winner === lb.deviceId() && lb.won()) {
      return `Congratulations! You are last week's winner, with ${r.score} points. `
        + `Your reward, in every run all this week: ${reward}. The developer signs your win.`;
    }
    return `Last week's winner scored ${r.score} points. Their reward, all this week: ${reward}. The developer signs the win.`;
  },

  _lbCeremony(auto = false) {
    const r = lb.result();
    if (!r) return false;
    this._lbStopCeremony();
    const cer = this.lbCer = { voices: [], timers: [] };
    const later = (secs, fn) => cer.timers.push(setTimeout(() => { if (this.lbCer === cer) fn(); }, secs * 1000));
    const length = (name) => {
      const e = this.audio.entries && this.audio.entries.get(name);
      return e && e.dry && e.dry.frames ? e.dry.frames / 44100 : 2.0;
    };
    const applause = () => {
      const name = this.audio.has(LB_APPLAUSE) ? LB_APPLAUSE : APPLAUSE_STANDIN;
      if (this.audio.has(name)) cer.voices.push(this.audio.play(name, { volume: 0.9 }));
      later(length(name), () => { this.lbCer = null; });
    };
    const pen = () => {
      if (!this.audio.has(LB_PEN)) { applause(); return; }
      cer.voices.push(this.audio.play(LB_PEN, { volume: 1.0 }));
      later(length(LB_PEN) + APPLAUSE_GAP, applause);
    };
    this.tts.speak(this._lbCeremonyWords(r), { bella: true, interrupt: !auto, after: () => { if (this.lbCer === cer) later(PEN_GAP, pen); } });
    return true;
  },

  _lbStopCeremony() {
    const cer = this.lbCer;
    this.lbCer = null;
    if (!cer) return;
    for (const t of cer.timers) clearTimeout(t);
    for (const v of cer.voices) { try { v.fadeout(300); } catch (e) { /* gone */ } }
  },

  // The winner hears the ceremony by itself once, the first time on the main menu
  // after the result is out.
  _lbMaybeCeremony() {
    if (this.state !== 'menu' || !lb.ceremonyDue()) return false;
    lb.ceremonySeen();
    return this._lbCeremony(true);
  },
};

// Started once the game is on the main menu: a score left unsent is sent, last week's
// result is read, and the winner's ceremony plays.
export function startLeaderboard(game) {
  lb.deviceId();
  lb.sendPending().catch(() => {});
  return lb.loadResult().then(() => { game._lbMaybeCeremony(); }).catch(() => {});
}
