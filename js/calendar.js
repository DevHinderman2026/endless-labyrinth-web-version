// The Events calendar page (web 1.1.0): every published event, read from the
// game's GitHub repository with the same signature check the game makes, in three
// groups: on now, coming soon and past. Each one shows its dates in the reader's
// own time zone, its description, and the reader's own runs in it, from the
// scores kept in this browser. Nothing is sent anywhere.
//
// What is on now is judged by internet time, the way the game judges it, so the
// calendar and the game always agree and the device's clock changes nothing.
// A stopped event (one the developer has switched off) is shown as past; an
// event whose file has been deleted from GitHub is not shown (Russell's choice).

import { EventFeed, EventScores } from './modes/events/feed.js';
import { status as eventStatus, describeDuration } from './modes/events/schema.js';
import { siteWords } from './modes/events/wording.js';

export const CANNOT_REACH = 'The event server can\'t be reached. Please try again later.';

const $ = (id) => document.getElementById(id);

// '3 points', '1 floor', '2 enemies': the game's own count() (engine.js), kept
// here so the page loads none of the game.
export function count(n, unit) {
  const many = { enemy: 'enemies' }[unit] || unit + 's';
  return `${n} ${n === 1 ? unit : many}`;
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else if (v !== null && v !== undefined) e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

// A moment in the reader's own time zone: "Wednesday, November 18, 2026 at 8:00 AM".
export function localMoment(seconds) {
  const d = new Date(seconds * 1000);
  try {
    return d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
  } catch (e) {
    return d.toString();
  }
}

function localDay(seconds) {
  const d = new Date(seconds * 1000);
  try { return d.toLocaleDateString(undefined, { dateStyle: 'long' }); } catch (e) { return d.toDateString(); }
}

// 'live', 'upcoming' or 'past' (ended or stopped).
export function group(ev, now) {
  const st = eventStatus(ev, now);
  if (st === 'live') return 'live';
  if (st === 'upcoming') return 'upcoming';
  return 'past';
}

// The three groups, in the order the page shows them: on now (soonest ending
// first), coming soon (soonest starting first), past (most recently ended first).
export function grouped(events, now) {
  const live = []; const upcoming = []; const past = [];
  for (const ev of events) {
    const g = group(ev, now);
    (g === 'live' ? live : g === 'upcoming' ? upcoming : past).push(ev);
  }
  live.sort((a, b) => a._end - b._end || a.name.localeCompare(b.name));
  upcoming.sort((a, b) => a._start - b._start || a.name.localeCompare(b.name));
  past.sort((a, b) => b._end - a._end || a.name.localeCompare(b.name));
  return { live, upcoming, past };
}

// What the reader has done in an event, from this browser's scores.
export function ownRuns(rec) {
  if (!rec) return 'You have not played this event on this device.';
  const best = Math.trunc(rec.best || 0);
  const runs = Math.trunc(rec.runs || 0);
  const parts = [`Your best run: ${count(best, rec.unit || 'point')}`];
  if (rec.medal) parts.push(`${rec.medal} medal`);
  parts.push(`${runs} run${runs === 1 ? '' : 's'} played`);
  let when = '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rec.best_when || '');
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    try { when = ` Best set on ${d.toLocaleDateString(undefined, { dateStyle: 'long' })}.`; } catch (e) { when = ` Best set on ${rec.best_when}.`; }
  }
  return parts.join(', ') + '.' + when;
}

function statusLine(ev, now) {
  const st = eventStatus(ev, now);
  if (st === 'live') return `On now. Ends in ${describeDuration(ev._end - now)}.`;
  if (st === 'upcoming') return `Coming soon. Starts in ${describeDuration(ev._start - now)}.`;
  if (st === 'stopped') return 'Stopped by the developer.';
  return `Ended on ${localDay(ev._end)}.`;
}

function entry(ev, now, rec) {
  const art = el('article', { class: 'panel event', id: 'event-' + ev.id });
  art.append(el('h3', { text: ev.name }));
  art.append(el('p', { class: 'event-status', text: statusLine(ev, now) }));
  art.append(el('p', { class: 'event-dates', text: `From ${localMoment(ev._start)} to ${localMoment(ev._end)}, your local time.` }));
  const desc = (ev.description || '').trim();
  if (desc) art.append(el('p', { class: 'event-description', text: siteWords(desc) }));
  art.append(el('p', { class: 'event-runs', text: ownRuns(rec) }));
  return art;
}

function fill(id, events, now, scores, none) {
  const box = $(id);
  box.replaceChildren();
  if (!events.length) { box.append(el('p', { class: 'none', text: none })); return; }
  for (const ev of events) box.append(entry(ev, now, scores[ev.id]));
}

export async function showCalendar() {
  const status = $('events-status');
  status.textContent = 'Checking the events now.';
  const feed = new EventFeed();
  await feed.wait();
  const now = feed.internetNow();
  if (!feed.reachedGitHub() || now === null) {
    status.textContent = CANNOT_REACH;
    for (const id of ['live', 'upcoming', 'past']) $(id).replaceChildren();
    $('groups').hidden = true;
    return false;
  }
  const scores = new EventScores();
  const recs = scores.readFailed ? {} : (scores.data.events || {});
  const events = Object.values(feed.events);
  const g = grouped(events, now);
  fill('live', g.live, now, recs, 'No event is on right now.');
  fill('upcoming', g.upcoming, now, recs, 'No event is announced yet.');
  fill('past', g.past, now, recs, 'No event has ended yet.');
  $('groups').hidden = false;
  const n = events.length;
  status.textContent = n ? `${n} event${n === 1 ? '' : 's'}: ${g.live.length} on now, ${g.upcoming.length} coming soon, ${g.past.length} past.`
    : 'No events have been published yet.';
  if (scores.readFailed) status.textContent += ' Your own runs could not be read from this browser just now.';
  return true;
}

if (typeof document !== 'undefined' && document.getElementById('events-status')) {
  showCalendar().catch((e) => { console.error(e); $('events-status').textContent = CANNOT_REACH; });
}
