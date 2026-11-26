// High scores and settings, kept on this phone in the browser's storage.
//
// Nothing is sent anywhere. The save format carries a version number from the
// first release on, so later updates (new modes, events) add to it and never
// lose what is already there. On an iPhone or iPad, Safari deletes a website's
// saved data after seven days of using Safari without visiting it; a game added
// to the Home Screen is not affected, which is why the game asks for that.

export const KEY = 'endless-labyrinth-web';
// Format 2 (web 1.1.0) adds stats: seconds played and runs started, per mode. A
// format 1 save is read as it is; its stats start at nothing.
export const FORMAT = 2;
const DEFAULT_SCORES = { standard: 0, battle: 0 };
// Web 6.3.5 (Russell, 21 November 2026: "have every single score on the website reset
// back to 0 for all players, since there has been so much refinement"; "Not events").
// Every mode's high score board saved before this moment is set back to 0 the first
// time the game or the site is opened on 6.3.5, on every device, once. Event High
// Scores are kept elsewhere and are not touched; nor are play time and runs (stats).
export const SCORES_RESET_AT = Date.UTC(2026, 10, 21, 19, 0, 0);   // 21 November 2026, 2 PM Eastern
// Web 8.1.0 (Russell, 26 November 2026: "everything of the abyss will be reset for scores and
// backups will not be able to bring them back"; "Reset those too" for its stats). A reset of
// one board at a time: each board named here, with its high score AND its Game Stats (play
// time and runs), is set back to 0 in a save that does not carry this mark for it, once, on
// every device. A save, another tab's save or a backup made before the mark cannot bring them
// back; one made after it can. Every other board, its stats, and the Event High Scores are
// not touched. (A board's key is also its key in the stats.)
// (8.1.3, Russell, 26 November 2026: The Abyss reset again, as replaced creatures were heard
// waking after nearly every case; not The Edge. The mark moved from 4 PM to 6 PM Eastern, so
// every save and backup from before 8.1.3 counts as from before the reset.)
// (8.1.4, Russell, 26 November 2026: The Abyss and The Edge both reset, after the fixes and
// changes of 8.1.4; the marks moved to 8 PM Eastern.)
export const BOARD_RESETS = { abyss: Date.UTC(2026, 10, 27, 1, 0, 0), edge: Date.UTC(2026, 10, 27, 1, 0, 0) };   // 26 November 2026, 8 PM Eastern

// The boards that a save's own marks say are from before their reset.
export function staleBoards(data) {
  const marks = data && typeof data === 'object' && data.boardResets && typeof data.boardResets === 'object' ? data.boardResets : {};
  return Object.keys(BOARD_RESETS).filter((k) => !((Number(marks[k]) || 0) >= BOARD_RESETS[k]));
}

// Those boards set back to 0 in a set of scores and stats (changed in place).
export function clearBoards(scores, stats, keys) {
  for (const k of keys) {
    if (scores && k in scores) scores[k] = 0;
    if (stats) { if (stats.time) stats.time[k] = 0; if (stats.runs) stats.runs[k] = 0; }
  }
}

// The marks to save: the newer of each.
export function newerMarks(...sets) {
  const out = { ...BOARD_RESETS };
  for (const m of sets) {
    if (!m || typeof m !== 'object') continue;
    for (const [k, v] of Object.entries(m)) if (typeof v === 'number' && isFinite(v) && v > (out[k] || 0)) out[k] = v;
  }
  return out;
}
// The modes stats are kept for, by the key the Game Stats page shows them under.
export const STAT_MODES = ['standard', 'battle', 'drive', 'tower', 'island', 'chaos', 'findvoice', 'abyss', 'edge', 'park', 'museum', 'ultimate', 'event'];
const STATS_FLUSH_SECONDS = 15;   // play time is written this often, and at the end of a run

export function emptyStats() {
  const time = {}; const runs = {};
  for (const k of STAT_MODES) { time[k] = 0; runs[k] = 0; }
  return { time, runs };
}

// Stats read from a save of any format: numbers only, never below zero.
export function readStats(data) {
  const out = emptyStats();
  const given = data && typeof data === 'object' && data.stats && typeof data.stats === 'object' ? data.stats : {};
  for (const part of ['time', 'runs']) {
    for (const [k, v] of Object.entries(given[part] || {})) {
      if (typeof v === 'number' && isFinite(v) && v > 0) out[part][k] = part === 'runs' ? Math.floor(v) : v;
    }
  }
  return out;
}

// Two sets of stats as one: the larger total of each, so that two copies of the
// game, or a backup and the phone it is restored on, never count a run twice.
export function mergeStats(a, b) {
  const out = emptyStats();
  for (const part of ['time', 'runs']) {
    for (const k of new Set([...Object.keys(a[part] || {}), ...Object.keys(b[part] || {})])) {
      out[part][k] = Math.max(Number((a[part] || {})[k]) || 0, Number((b[part] || {})[k]) || 0);
    }
  }
  return out;
}

export class Store {
  constructor() {
    this.scores = { ...DEFAULT_SCORES };
    this.settings = { speechRate: 3, practiced: false, homeTipSaid: false, turnTold: false };   // (turnTold, web 4.0.0: Ultimate Mode has said once that the world now turns with you)
    this.readFailed = false;   // the save is there but could not be read: never overwrite it
    this.resetAt = SCORES_RESET_AT;   // when the boards were last reset, in any copy of the game (6.3.5: a new save starts after the site-wide reset)
    this.boardResets = { ...BOARD_RESETS };   // (8.1.0) a board reset of its own, per board: a new save starts after it
    this.stats = emptyStats();  // seconds played and runs started, per mode (web 1.1.0)
    this._statsUnsaved = 0;     // seconds of play not yet written
    this.load();
    // The game can be open twice in the same browser (two tabs): what one saves,
    // the other takes in, so neither erases the other's records. (On an iPhone or
    // iPad a Home Screen copy has storage of its own, separate from Safari's.)
    try { window.addEventListener('storage', (e) => { if (e.key === KEY) this._merge(); }); } catch (e) { /* none */ }
  }

  _read() {
    const raw = window.localStorage.getItem(KEY);   // throws when storage is blocked
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      return data && typeof data === 'object' ? data : null;
    } catch (e) { return null; }   // unreadable: start fresh, and the next save replaces it
  }

  load() {
    let data = null;
    try { data = this._read(); } catch (e) { this.readFailed = true; return; }
    if (!data) return;
    for (const [k, v] of Object.entries(data.scores || {})) {
      if (typeof v === 'number' && isFinite(v)) this.scores[k] = Math.max(0, Math.floor(v));
    }
    Object.assign(this.settings, data.settings || {});
    this.resetAt = Number(data.resetAt) || 0;
    this.stats = readStats(data);
    this._seen = { ...this.settings };
    let write = false;
    // (6.3.5) The boards from before the site-wide reset go back to 0, once.
    if (this.resetAt < SCORES_RESET_AT) {
      for (const k of Object.keys(this.scores)) this.scores[k] = 0;
      this.resetAt = SCORES_RESET_AT;
      write = true;
    }
    // (8.1.0) A board reset of its own (The Abyss): its score and its stats go back to 0, once.
    const stale = staleBoards(data);
    if (stale.length) { clearBoards(this.scores, this.stats, stale); write = true; }
    this.boardResets = newerMarks(data.boardResets);
    if (write) this._write();
  }

  // What another copy of the game has saved since: the higher score on every
  // board, unless that copy has reset the boards since this one last looked.
  _merge() {
    if (this.readFailed) return;
    let data = null;
    try { data = this._read(); } catch (e) { return; }
    if (!data) return;
    const theirReset = Number(data.resetAt) || 0;
    if (theirReset > this.resetAt) {
      for (const k of Object.keys(this.scores)) this.scores[k] = 0;
      this.resetAt = theirReset;
    }
    // (8.1.0) A board the other copy has from before its reset (an older copy of the game
    // still open) brings nothing back; one it has reset since this copy looked is reset here too.
    const stale = new Set(staleBoards(data));
    const theirMarks = (data.boardResets && typeof data.boardResets === 'object') ? data.boardResets : {};
    for (const [k, v] of Object.entries(theirMarks)) {
      if (typeof v === 'number' && v > (this.boardResets[k] || 0)) clearBoards(this.scores, this.stats, [k]);
    }
    this.boardResets = newerMarks(this.boardResets, theirMarks);
    for (const [k, v] of Object.entries(data.scores || {})) {
      if (stale.has(k)) continue;
      if (typeof v === 'number' && isFinite(v)) this.scores[k] = Math.max(this.scores[k] || 0, Math.floor(v));
    }
    const theirs = readStats(data);
    clearBoards(null, theirs, [...stale]);
    this.stats = mergeStats(this.stats, theirs);
    // A setting the other copy changed, and this one has not, is taken in too.
    const seen = this._seen || {};
    for (const [k, v] of Object.entries(data.settings || {})) {
      if (this.settings[k] === seen[k]) this.settings[k] = v;
    }
    this._seen = { ...this.settings };
  }

  // Take in what another copy of the game has saved (before a score is compared).
  refresh() { this._merge(); }

  save() {
    if (this.readFailed) return false;
    this._merge();
    return this._write();
  }

  _write() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ format: FORMAT, scores: this.scores, settings: this.settings, resetAt: this.resetAt, boardResets: this.boardResets, stats: this.stats }));
      this._seen = { ...this.settings };
      this._statsUnsaved = 0;
      // Ask the browser to keep this data even when the phone is short of space.
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      return true;
    } catch (e) {
      return false;
    }
  }

  update(mode, score) {
    if (this.readFailed) return false;   // the real boards are unknown this session: nothing is claimed
    this._merge();
    if (score > (this.scores[mode] || 0)) {
      this.scores[mode] = score;
      this._write();
      return true;
    }
    return false;
  }

  // A run has started in a mode (web 1.1.0). Counted when it starts: a run that
  // is quit was still played.
  runStarted(mode) {
    if (this.readFailed || !mode) return;
    this._merge();
    this.stats.runs[mode] = Math.floor(this.stats.runs[mode] || 0) + 1;
    this._write();
  }

  // Seconds of play in a mode: inside a run, not paused. Written every
  // STATS_FLUSH_SECONDS, and by flushStats() at the end of a run.
  addPlayTime(mode, seconds) {
    if (this.readFailed || !mode || !(seconds > 0)) return;
    this.stats.time[mode] = (this.stats.time[mode] || 0) + seconds;
    this._statsUnsaved += seconds;
    if (this._statsUnsaved >= STATS_FLUSH_SECONDS) this.flushStats();
  }

  flushStats() {
    if (this.readFailed || !(this._statsUnsaved > 0)) return;
    this._merge();
    this._write();
  }

  reset() {
    if (this.readFailed) return;
    this._merge();
    for (const k of Object.keys(this.scores)) this.scores[k] = 0;
    this.resetAt = Date.now();
    this._write();
  }

  // Said once on the main menu (the desktop's take_warning).
  takeWarning() {
    if (this.readFailed && !this.readFailedSaid) {
      this.readFailedSaid = true;
      return 'Your high score file could not be read just now, so this time the game will not save mode high scores, '
        + 'to keep your saved ones safe. Restart the game to try again.';
    }
    return null;
  }
}
