// Score backups (web 1.1.0): a file holding everything the game has saved in
// this browser (scores, stats, settings and event runs), to keep on the device,
// in iCloud or in Google Drive, and to restore later, on this device or another.
//
// The file is sealed: a code worked out from its contents, with a key that lives
// in this script. A file that has been edited fails the check and is refused. A
// determined person could still forge one, since the key is in the browser's
// own code; these scores are private, so only that person is fooled. The key is
// the web version's own; the Windows game's save secret is never in the web code.
//
// Restoring always asks first: combine (the better best on every board, the
// larger total of every stat, the better of every event run; this device's
// settings kept) or replace (the file as it is, settings included), or cancel.

import { KEY, FORMAT, readStats, mergeStats } from './storage.js';
import { EVENT_SCORES_KEY } from './modes/events/feed.js';

export const BACKUP_FORMAT = 1;
const SEAL_KEY = 'endless-labyrinth-web-backup-seal-2026';   // the web version's own, never the Windows secret
const MEDAL_RANK = { null: 0, undefined: 0, bronze: 1, silver: 2, gold: 3 };

// JSON with its keys in order, so the same contents always give the same text.
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value === undefined ? null : value);
}

async function hmac(text) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(SEAL_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readJson(key) {
  const raw = window.localStorage.getItem(key);   // throws when storage is blocked
  if (!raw) return null;
  const data = JSON.parse(raw);
  return data && typeof data === 'object' ? data : null;
}

// What this browser has saved: the game's save and the event runs.
export function savedPlay() {
  return { game: readJson(KEY), events: readJson(EVENT_SCORES_KEY) };
}

// The backup file's text, sealed.
export async function makeBackup(play = savedPlay(), made = new Date()) {
  const body = {
    endless_labyrinth_backup: BACKUP_FORMAT,
    made: made.toISOString(),
    game: play.game || { format: FORMAT, scores: {}, settings: {}, resetAt: 0, stats: readStats(null) },
    events: play.events || { total: 0, events: {} },
  };
  body.seal = await hmac(canonical({ ...body, seal: undefined }));
  return JSON.stringify(body, null, 1);
}

// The backup's contents, or a reason it is refused.
export async function readBackup(text) {
  let body;
  try {
    body = JSON.parse(String(text).replace(/^﻿/, ''));
  } catch (e) {
    return { error: 'This is not an Endless Labyrinth backup file.' };
  }
  if (!body || typeof body !== 'object' || body.endless_labyrinth_backup !== BACKUP_FORMAT || typeof body.seal !== 'string') {
    return { error: 'This is not an Endless Labyrinth backup file.' };
  }
  const expected = await hmac(canonical({ ...body, seal: undefined }));
  if (expected !== body.seal) return { error: 'This backup file has been changed since it was made, so it cannot be trusted. Nothing was restored.' };
  if (!body.game || typeof body.game !== 'object' || !body.events || typeof body.events !== 'object') {
    return { error: 'This backup file is incomplete. Nothing was restored.' };
  }
  return { made: new Date(body.made), game: body.game, events: body.events };
}

// A short account of what a backup holds.
export function describe(backup) {
  const scores = Object.values(backup.game.scores || {}).filter((v) => v > 0).length;
  const events = Object.keys((backup.events && backup.events.events) || {}).length;
  const stats = readStats(backup.game);
  const runs = Object.values(stats.runs).reduce((a, b) => a + b, 0);
  let when;
  try { when = backup.made.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' }); } catch (e) { when = backup.made.toString(); }
  return `Backup made on ${when}: ${scores} high score${scores === 1 ? '' : 's'}, ${runs} run${runs === 1 ? '' : 's'} counted, ${events} event${events === 1 ? '' : 's'} played.`;
}

function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

// This browser's play and a backup as one: the better of everything, with this
// device's settings kept.
export function combine(mine, backup) {
  const game = { format: FORMAT, scores: {}, settings: { ...((mine.game && mine.game.settings) || backup.game.settings || {}) }, resetAt: num(mine.game && mine.game.resetAt), stats: null };
  const a = (mine.game && mine.game.scores) || {}; const b = backup.game.scores || {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) game.scores[k] = Math.max(0, Math.floor(Math.max(num(a[k]), num(b[k]))));
  game.stats = mergeStats(readStats(mine.game), readStats(backup.game));
  const events = { total: Math.max(num(mine.events && mine.events.total), num(backup.events.total)), events: {} };
  const ea = (mine.events && mine.events.events) || {}; const eb = backup.events.events || {};
  for (const id of new Set([...Object.keys(ea), ...Object.keys(eb)])) {
    const x = ea[id] || null; const y = eb[id] || null;
    if (!x || !y) { events.events[id] = { ...(x || y) }; continue; }
    const better = num(y.best) > num(x.best) ? y : x;
    events.events[id] = {
      ...x,
      name: better.name || x.name,
      best: Math.max(num(x.best), num(y.best)),
      runs: Math.max(num(x.runs), num(y.runs)),
      points: Math.max(num(x.points), num(y.points)),
      collected: Math.max(num(x.collected), num(y.collected)),
      unit: better.unit || x.unit || 'point',
      best_when: better.best_when || x.best_when || y.best_when || '',
      medal: (MEDAL_RANK[y.medal] || 0) > (MEDAL_RANK[x.medal] || 0) ? y.medal : (x.medal || null),
    };
    if (!events.events[id].medal) delete events.events[id].medal;
  }
  return { game, events };
}

// The backup as it is, settings included. The reset mark is set to now so an
// open copy of the game takes these scores instead of putting its own back.
export function replacement(backup) {
  const game = { ...backup.game, format: FORMAT, resetAt: Date.now() };
  return { game, events: { total: num(backup.events.total), events: { ...(backup.events.events || {}) } } };
}

export function writePlay(play) {
  window.localStorage.setItem(KEY, JSON.stringify(play.game));
  window.localStorage.setItem(EVENT_SCORES_KEY, JSON.stringify(play.events));
}

export function backupFileName(made = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `Endless Labyrinth backup ${made.getFullYear()}-${p(made.getMonth() + 1)}-${p(made.getDate())}.json`;
}
