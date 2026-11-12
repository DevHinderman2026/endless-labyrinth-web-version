// The event feed and Event High Scores (the desktop's EventFeed and EventScores,
// from event_engine.py).
//
// Events are the small JSON files in the "events" folder of the game's GitHub
// repository, the very files the Windows game reads. The feed fetches that folder in
// the background, checks every file (its signature, then its settings) and keeps
// the ones that pass.
//
// Live means live by internet time. A browser cannot read the time from GitHub's
// answer (another site's Date header is hidden from scripts), so the time comes from
// the Date header of a request to this game's own website, made at the same moment;
// only if that fails is the device's clock used. From there it counts on with a
// clock the device's date settings cannot move (performance.now).

import { checkEvent, status as eventStatus, newerStub } from './schema.js';
import { checkSignature, pyParse, pyPlain, PyInt } from './sign.js';

export const GITHUB_OWNER = 'DevHinderman2026';
export const GITHUB_REPO = 'Endless-Labyrinth';
export const GITHUB_BRANCH = 'main';
export const EVENTS_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/events?ref=${GITHUB_BRANCH}`;
export const EVENTS_REFRESH = 120.0;      // seconds before opening the Events menu checks again
export const EVENT_START_CHECK = 60.0;    // an event is checked again before a run starts if the list is older than this
const TIME_URL = 'packs/manifest.json';   // the game's own site, for the time
export const PROTECTED_KEY = 'endless-labyrinth-web-protected-events';
export const EVENT_SCORES_KEY = 'endless-labyrinth-web-event-scores';
const SCORES_KEY = EVENT_SCORES_KEY;

const monotonic = () => performance.now() / 1000;

// [event, problems] like checkEvent, but only for an event the developer signed.
// The file is read from its own text, so the signature is checked against exactly
// what was published.
export async function trusted(text) {
  let tree;
  try {
    tree = pyParse(String(text).replace(/^﻿/, ''));
  } catch (e) {
    return [null, [`Could not read it: ${e.message}`]];
  }
  const [ok, why] = await checkSignature(tree);
  if (!ok) return [null, [why]];
  const fmt = tree instanceof Map ? tree.get('format') : undefined;
  const plain = pyPlain(tree);
  const [ev, errors] = checkEvent(plain, fmt === undefined || fmt instanceof PyInt);
  if (errors.length || !ev) {
    // web 5.0.0: an event made for a newer version of the game is not left out: it
    // is listed, with what to do about it.
    const stub = newerStub(plain);
    if (stub) return [stub, []];
  }
  return [ev, errors];
}

class HttpError extends Error {
  constructor(code) { super(`HTTP ${code}`); this.code = code; }
}

async function get(url, timeout = 10000) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
  try {
    const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' }, signal: ctl ? ctl.signal : undefined });
    if (!res.ok) throw new HttpError(res.status);
    return await res.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// The time now from this game's own website (seconds since 1970), or null.
async function siteTime() {
  try {
    const res = await fetch(TIME_URL, { method: 'HEAD', cache: 'no-store' });
    const d = res.headers.get('Date');
    const t = d ? Date.parse(d) : NaN;
    return Number.isFinite(t) ? t / 1000 : null;
  } catch (e) {
    return null;
  }
}

// ======================================================================== the feed
export class EventFeed {
  constructor() {
    this.events = {};             // id -> checked event (with _source 'online')
    this.problems = [];           // [file name, [problems]] for files that failed the checks
    this.online = false;
    this.clock = [null, 0.0];     // the time at the last fetch, and monotonic() then
    this.clockFrom = null;        // 'site' or 'device': where that time came from
    this.busy = false;
    this.fetchedAt = null;        // monotonic() of the last finished fetch
    this.changed = false;         // set when a fetch finishes; the game clears it
    this.refresh();
  }

  refresh(force = true) {
    if (this.busy) return;
    if (!force && this.fetchedAt !== null && monotonic() - this.fetchedAt < EVENTS_REFRESH) return;
    this.busy = true;
    this.pending = this._run();   // awaited by the website's Events calendar
  }

  // Resolves when the check under way has finished (the game never waits; the
  // Events calendar page does).
  async wait() { await this.pending; }

  // Whether the last check reached GitHub's events folder: false when the
  // internet was out, and false when GitHub answered with an error (its hourly
  // limit, a fault), in which case only events from an earlier check are known.
  reachedGitHub() { return this.online && !this.problems.some(([name]) => name === 'GitHub'); }

  async _run() {
    let events = {}; const problems = [];
    let online = false; let serverTime = null; let serverMono = 0.0; let from = null;
    let keepPrevious = false;
    try {
      let listing = [];
      const timeAsked = siteTime();
      try {
        const body = await get(EVENTS_API);
        listing = JSON.parse(body);
        online = true;
      } catch (e) {
        // The internet answered, so its time is still trustworthy. A 404 means there
        // is no events folder (or no repository) yet: no events. Anything else -
        // GitHub's hourly limit, a fault at GitHub - says nothing about the events,
        // so the ones already known are kept.
        if (e instanceof HttpError) {
          online = true;
          if (e.code !== 404) {
            keepPrevious = true;
            problems.push(['GitHub', [`GitHub answered ${e.code}; the events from the last check are kept.`]]);
          }
        }
        listing = [];
      }
      const t = await timeAsked;
      if (online) {
        serverMono = monotonic();
        serverTime = t !== null ? t : Date.now() / 1000;
        from = t !== null ? 'site' : 'device';
      }
      for (const item of Array.isArray(listing) ? listing : []) {
        const name = item && typeof item === 'object' ? (item.name || '') : '';
        const url = item && typeof item === 'object' ? item.download_url : null;
        if (!name.toLowerCase().endsWith('.json') || !url) continue;
        let raw;
        try {
          raw = await get(url);
        } catch (e) {
          // The file itself could not be fetched: the copy from the last check is
          // kept, so a live event never vanishes over one lost download.
          const kept = Object.values(this.events).filter((v) => v._source === 'online' && v._name === name);
          for (const v of kept) events[v.id] = v;
          problems.push([name, [`Could not download it: ${e.message}` + (kept.length ? ' The copy from the last check is kept.' : '')]]);
          continue;
        }
        let ev; let errs;
        try {
          [ev, errs] = await trusted(raw);
        } catch (e) {
          [ev, errs] = [null, [`Could not read it: ${e.message}`]];
        }
        if ((errs && errs.length) || !ev) { problems.push([name, errs]); continue; }
        ev._source = 'online';
        ev._file = raw;
        ev._name = name;
        events[ev.id] = ev;
      }
    } catch (e) {
      console.warn('Could not check for events:', e);
    } finally {
      if (keepPrevious) {
        const merged = {};
        for (const [k, v] of Object.entries(this.events)) if (v._source === 'online') merged[k] = v;
        Object.assign(merged, events);
        events = merged;
      }
      // Protected events (built-in ones such as Pumpkin Hunt) are never lost: the
      // last copy seen is kept on this device, and put back if its file ever goes
      // missing from GitHub. Done before the list is handed over.
      try { await this._keepProtected(events); } catch (e) { /* kept as it was */ }
      this.events = events;
      this.problems = problems;
      if (online) {
        this.online = true;
        this.clock = [serverTime, serverMono];
        this.clockFrom = from;
      } else {
        this.online = false;
      }
      this.busy = false;
      this.fetchedAt = monotonic();
      this.changed = true;
    }
  }

  async _keepProtected(events) {
    let kept = {};
    try {
      kept = JSON.parse(window.localStorage.getItem(PROTECTED_KEY) || '{}');
    } catch (e) {
      kept = {};
    }
    if (!kept || typeof kept !== 'object' || Array.isArray(kept)) kept = {};
    let changed = false;
    for (const ev of Object.values(events)) {
      if (ev.protected && ev._source === 'online') {
        // The file exactly as published, signature and all, so it can be checked
        // again whenever it is used.
        if (kept[ev.id] !== ev._file) { kept[ev.id] = ev._file; changed = true; }
      }
    }
    for (const [evId, raw] of Object.entries(kept)) {
      if (evId in events) continue;
      const [ev, errs] = await trusted(raw);
      // Matched by the event's own id, not where it is kept.
      if (ev && !errs.length && ev.protected && !(ev.id in events) && ev.id === evId) {
        ev._source = 'online';
        ev._file = raw;
        events[evId] = ev;
      }
    }
    if (changed) {
      try { window.localStorage.setItem(PROTECTED_KEY, JSON.stringify(kept)); } catch (e) { /* kept next time */ }
    }
  }

  // Internet time now, or null if the internet has not been reached.
  internetNow() {
    const [serverTime, serverMono] = this.clock;
    if (serverTime === null) return null;
    return serverTime + (monotonic() - serverMono);
  }

  // The time an event is judged by (there are no local test events on the web).
  nowFor(ev) { return this.internetNow(); }

  // [live, upcoming]: lists of [event, now] pairs, soonest ending first.
  listing() {
    const live = []; const upcoming = [];
    for (const ev of Object.values(this.events)) {
      const now = this.nowFor(ev);
      if (now === null) continue;
      const st = eventStatus(ev, now);
      if (st === 'live') live.push([ev, now]);
      else if (st === 'upcoming') upcoming.push([ev, now]);
    }
    live.sort((a, b) => a[0]._end - b[0]._end);
    upcoming.sort((a, b) => a[0]._start - b[0]._start);
    return [live, upcoming];
  }

  // The developer's local test events: none on the web.
  testOthers() { return []; }
}

// ===================================================================== the scores
// Event High Scores: the best run in every event played, kept on this device for
// good, with no reset. (Older desktop saves also hold a lifetime total; it is kept
// but no longer grows.)
const MEDAL_RANK = { null: 0, undefined: 0, bronze: 1, silver: 2, gold: 3 };

export class EventScores {
  constructor() {
    this.data = { total: 0, events: {} };
    this.readFailed = false;
    this.saveFailed = false;
    let raw = null;
    try {
      raw = window.localStorage.getItem(SCORES_KEY);
    } catch (e) {
      // Never save over scores that could not be read.
      this.readFailed = true;
      return;
    }
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d && typeof d === 'object') {
        this.data.total = Math.trunc(Number(d.total) || 0);
        this.data.events = (d.events && typeof d.events === 'object') ? { ...d.events } : {};
      }
    } catch (e) {
      this.readFailed = true;
    }
  }

  get total() { return Math.trunc(this.data.total || 0); }

  best(evId) { return Math.trunc(((this.data.events[evId] || {}).best) || 0); }

  // [[event name, best, runs, when the best was set or '', unit, medal]], the most
  // recently set best first; events with no date last.
  bestRuns() {
    const recs = Object.entries(this.data.events || {}).map(([evId, r]) => [r.name || evId, Math.trunc(r.best || 0),
      Math.trunc(r.runs || 0), r.best_when || '', r.unit || 'point', r.medal || null]);
    return recs.map((r, i) => [r, i]).sort((a, b) => (a[0][3] < b[0][3] ? 1 : a[0][3] > b[0][3] ? -1 : a[1] - b[1])).map(([r]) => r);
  }

  _save() {
    try {
      window.localStorage.setItem(SCORES_KEY, JSON.stringify(this.data));
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      return true;
    } catch (e) {
      return false;
    }
  }

  // Add one run. Returns [new best?, previous best].
  record(ev, points, collected, unit = 'point') {
    if (!this.data.events[ev.id]) this.data.events[ev.id] = { name: ev.name, best: 0, runs: 0, points: 0, collected: 0 };
    const rec = this.data.events[ev.id];
    const prev = Math.trunc(rec.best || 0);
    rec.name = ev.name;
    rec.unit = unit;
    rec.runs = Math.trunc(rec.runs || 0) + 1;
    rec.points = Math.trunc(rec.points || 0) + Math.trunc(points);
    rec.collected = Math.trunc(rec.collected || 0) + Math.trunc(collected);
    if (Math.trunc(points) > prev || !rec.best_when) {
      const d = new Date();
      rec.best_when = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    rec.best = Math.max(prev, Math.trunc(points));
    this.saveFailed = false;
    if (!this.readFailed) this.saveFailed = this._save() === false;
    return [points > prev, prev];
  }

  // Keep the best medal won in an event. Called after record() for the run.
  recordMedal(ev, medal) {
    const rec = this.data.events[ev.id];
    if (!rec || !medal) return;
    if (MEDAL_RANK[medal] > (MEDAL_RANK[rec.medal] || 0)) {
      rec.medal = medal;
      if (!this.readFailed) this.saveFailed = this._save() === false;
    }
  }

  takeWarning() {
    if (this.readFailed && !this.readFailedSaid) {
      this.readFailedSaid = true;
      return 'Your event score file could not be read just now, so this time the game will not save event points, '
        + 'to keep your Event High Scores safe. Restart the game to try again.';
    }
    return null;
  }
}
