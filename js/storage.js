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
    this.readFailed = false;
    this.load();
  }

  load() {
    let raw = null;
    try { raw = window.localStorage.getItem(KEY); } catch (e) { this.readFailed = true; return; }
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        for (const [k, v] of Object.entries(data.scores || {})) {
          if (typeof v === 'number' && isFinite(v)) this.scores[k] = Math.max(0, Math.floor(v));
        }
        Object.assign(this.settings, data.settings || {});
      }
    } catch (e) { /* unreadable: start fresh, and the next save replaces it */ }
  }

  save() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ format: FORMAT, scores: this.scores, settings: this.settings }));
      // Ask the browser to keep this data even when the phone is short of space.
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      return true;
    } catch (e) {
      return false;
    }
  }

  update(mode, score) {
    if (score > (this.scores[mode] || 0)) {
      this.scores[mode] = score;
      this.save();
      return true;
    }
    return false;
  }

  reset() {
    for (const k of Object.keys(this.scores)) this.scores[k] = 0;
    this.save();
  }
}
