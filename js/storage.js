// High scores and settings, kept on this phone in the browser's storage.
//
// Nothing is sent anywhere. The save format carries a version number from the
// first release on, so later updates (new modes, events) add to it and never
// lose what is already there. On an iPhone or iPad, Safari deletes a website's
// saved data after seven days of using Safari without visiting it; a game added
// to the Home Screen is not affected, which is why the game asks for that.

const KEY = 'endless-labyrinth-web';
const FORMAT = 1;
const DEFAULT_SCORES = { standard: 0, battle: 0 };

export class Store {
  constructor() {
    this.scores = { ...DEFAULT_SCORES };
    this.settings = { speechRate: 3, practiced: false, homeTipSaid: false };
    this.readFailed = false;   // the save is there but could not be read: never overwrite it
    this.resetAt = 0;          // when the boards were last reset, in any copy of the game
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
      window.localStorage.setItem(KEY, JSON.stringify({ format: FORMAT, scores: this.scores, settings: this.settings, resetAt: this.resetAt }));
      this._seen = { ...this.settings };
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
