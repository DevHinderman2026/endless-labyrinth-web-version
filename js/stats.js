// The Game Stats page (web 1.1.0): everything this browser has saved about the
// reader's play, read straight from the browser's storage: time played and runs
// per mode (counted since web 1.1.0), the best score on every board, and every
// event played with its best run and medal. Nothing is sent anywhere.
//
// An event whose file has been deleted from GitHub stays here, labelled "no
// longer available", as the Windows game keeps its Event High Scores (Russell's
// decision). Which events are still published is checked with the same feed the
// game uses; if GitHub cannot be reached, nothing is labelled.

import { KEY, readStats, STAT_MODES } from './storage.js';
import { EventFeed, EVENT_SCORES_KEY } from './modes/events/feed.js';
import { count } from './calendar.js';

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else if (v !== null && v !== undefined) e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

export const MODE_NAMES = { standard: 'Standard Mode', battle: 'Battle Mode', drive: 'Driving Mode', tower: 'Tower Mode', island: 'Island Mode', chaos: 'Chaos Mode', ultimate: 'Ultimate Test Mode', event: 'Events' };

// The high score boards, in the game's own High Scores order and words.
export const BOARDS = [
  ['chaos', 'Chaos Mode', (v) => count(v, 'point')],
  ['tower', 'Tower Mode', (v) => count(v, 'floor')],
  ['drive', 'Driving Mode', (v) => count(v, 'car')],
  ['drive_distance', 'Driving Distance', (v) => `${v} m`],
  ['island', 'Island Mode', (v) => count(v, 'point')],
  ['ultimate', 'Ultimate Test Mode', (v) => count(v, 'point')],
  ['standard', 'Standard Mode', (v) => `Level ${v}`],
  ['battle', 'Battle Mode', (v) => count(v, 'enemy')],
];

// Seconds as words: "2 hours 5 minutes", "45 seconds", "none yet".
export function playTime(seconds) {
  const s = Math.round(Math.max(0, seconds || 0));
  if (!s) return 'none yet';
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  const w = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (h) return m ? `${w(h, 'hour')} ${w(m, 'minute')}` : w(h, 'hour');
  if (m) return sec ? `${w(m, 'minute')} ${w(sec, 'second')}` : w(m, 'minute');
  return w(sec, 'second');
}

function readJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { data: null, failed: false };
    const data = JSON.parse(raw);
    return { data: data && typeof data === 'object' ? data : null, failed: false };
  } catch (e) {
    return { data: null, failed: true };
  }
}

// The reader's saved play, from both of the game's saves.
export function readPlay() {
  const main = readJson(KEY);
  const events = readJson(EVENT_SCORES_KEY);
  const stats = readStats(main.data);
  const scores = {};
  for (const [k, v] of Object.entries((main.data && main.data.scores) || {})) if (typeof v === 'number' && isFinite(v)) scores[k] = Math.max(0, Math.floor(v));
  const evs = {};
  for (const [id, r] of Object.entries((events.data && events.data.events) || {})) {
    if (!r || typeof r !== 'object') continue;
    evs[id] = { name: String(r.name || id), best: Math.trunc(r.best || 0), runs: Math.trunc(r.runs || 0), unit: r.unit || 'point', medal: r.medal || null, best_when: r.best_when || '' };
  }
  return { stats, scores, events: evs, failed: main.failed || events.failed };
}

function dayWords(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  try { return d.toLocaleDateString(undefined, { dateStyle: 'long' }); } catch (e) { return ymd; }
}

function list(items) {
  const ul = el('ul', { class: 'stats' });
  for (const it of items) ul.append(el('li', { text: it }));
  return ul;
}

export async function showStats() {
  const play = readPlay();
  const note = $('stats-note');
  if (play.failed) note.textContent = 'Your saved play could not be read from this browser just now. Nothing is changed; try again later.';
  else note.textContent = 'Everything here comes from this browser alone. Time played and runs per mode are counted from web version 1.1.0 on; your best scores and events go back to your first run.';

  // Time played.
  const total = STAT_MODES.reduce((a, k) => a + (play.stats.time[k] || 0), 0);
  $('time-total').textContent = `Total time played: ${playTime(total)}.`;
  $('time-modes').replaceChildren(list(STAT_MODES.map((k) => `${MODE_NAMES[k]}: ${playTime(play.stats.time[k])}`)));

  // Runs per mode.
  const runsTotal = STAT_MODES.reduce((a, k) => a + (play.stats.runs[k] || 0), 0);
  $('runs-total').textContent = `Runs started: ${runsTotal}.`;
  $('runs-modes').replaceChildren(list(STAT_MODES.map((k) => `${MODE_NAMES[k]}: ${count(play.stats.runs[k] || 0, 'run')}`)));

  // Best scores.
  $('scores').replaceChildren(list(BOARDS.map(([k, label, fmt]) => `${label}: ${play.scores[k] > 0 ? fmt(play.scores[k]) : 'No score yet'}`)));

  // Events: which are still published, if GitHub can be reached.
  const evs = Object.entries(play.events).filter(([, r]) => r.runs > 0 || r.best > 0);
  const played = evs.length;
  const medals = { gold: 0, silver: 0, bronze: 0 };
  for (const [, r] of evs) if (r.medal in medals) medals[r.medal] += 1;
  $('events-completed').textContent = `Events completed: ${played}. An event counts once you have played it at least once.`;
  $('medals').textContent = `Medals earned: ${medals.gold} gold, ${medals.silver} silver, ${medals.bronze} bronze.`;
  const box = $('event-runs');
  if (!evs.length) {
    box.replaceChildren(el('p', { class: 'none', text: 'No event runs yet. Play an event from the Events menu in the game, and your best run in it is kept here.' }));
    return;
  }
  let published = null;   // ids still on GitHub, or null when that could not be checked
  try {
    const feed = new EventFeed();
    await feed.wait();
    if (feed.reachedGitHub()) published = new Set(Object.keys(feed.events));
  } catch (e) { published = null; }
  evs.sort((a, b) => (a[1].best_when < b[1].best_when ? 1 : a[1].best_when > b[1].best_when ? -1 : a[1].name.localeCompare(b[1].name)));
  const items = [];
  for (const [id, r] of evs) {
    const gone = published && !published.has(id);
    const parts = [`${r.name}${gone ? ', no longer available' : ''}`, `Best run ${count(r.best, r.unit)}`];
    if (r.medal) parts.push(`${r.medal} medal`);
    parts.push(count(r.runs, 'run'));
    let line = parts.join(', ') + '.';
    const day = dayWords(r.best_when);
    if (day) line += ` Best set on ${day}.`;
    items.push(line);
  }
  box.replaceChildren(list(items));
  if (published === null) box.append(el('p', { class: 'none', text: 'Which events are still available could not be checked just now.' }));
}

if (typeof document !== 'undefined' && document.getElementById('stats-note')) {
  showStats().catch((e) => { console.error(e); $('stats-note').textContent = 'Your stats could not be shown just now. Please try again later.'; });
}
