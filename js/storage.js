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
// The modes stats are kept for, by the key the Game Stats page shows them under.
export const STAT_MODES = ['standard', 'battle', 'drive', 'tower', 'island', 'chaos', 'event'];
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
    this.settings = { speechRate: 3, practiced: false, homeTipSaid: false };
    this.readFailed = false;   // the save is there but could not be read: never overwrite it
    this.resetAt = 0;          // when the boards were last reset, in any copy of the game
    this.stats = emptyStats();  // seconds played and runs started, per mode (web 1.1.0)
    this._statsUnsaved = 0;     // seconds of play not yet written
    this.load();
    // The game can be open twice (a Home Screen copy and a Safari tab): what one
    // saves, the other takes in, so neither erases the other's records.
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
    for (const [k, v] of Object.entries(data.scores || {})) {
      if (typeof v === 'number' && isFinite(v)) this.scores[k] = Math.max(this.scores[k] || 0, Math.floor(v));
    }
    this.stats = mergeStats(this.stats, readStats(data));
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
      window.localStorage.setItem(KEY, JSON.stringify({ format: FORMAT, scores: this.scores, settings: this.settings, resetAt: this.resetAt, stats: this.stats }));
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
