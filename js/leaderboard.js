// The weekly leaderboard (web 7.2.0, Russell's design, 23 November 2026).
//
// Every Chaos Mode run that scores sends its points, with this device's random ID and
// nothing else, to the game's leaderboard relay (a small Cloudflare Worker,
// leaderboard-worker/ in this repository), which checks it and keeps each device's
// best of the week in a public GitHub repository of scores (SCORES_REPO), one file a
// week. There are no names and no accounts: the board shows only scores. A week runs
// from Monday 12:00 AM to Sunday 11:59 PM, Eastern time.
//
// Each Monday the developer looks at last week's best score in the Event Maker, and if
// it is fair signs the week's result with the same key that signs the events
// (js/modes/events/sign.js). The result names the winning device's ID and its reward,
// which rotates week by week: more health, more ammo, more time. The game believes only
// a signed result, so nobody can make their device the winner. The winning device gets
// the reward in every run all that next week, and hears a ceremony the first time it
// opens the game: the week's score and reward announced, the developer's pen signing,
// and applause. Anyone can replay that week's ceremony from the Weekly Leaderboard menu.
//
// The relay's address (RELAY_URL) is set once the developer has put the relay up; until
// then nothing is sent.

import { pyParse, pyPlain, checkSignature } from './modes/events/sign.js';
import { GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH } from './modes/events/feed.js';

// Where scores go, and where they and the results are read from.
export const RELAY_URL = '';                                   // the Worker's address, e.g. https://el-leaderboard.<name>.workers.dev
export const SCORES_REPO = `${GITHUB_OWNER}/Endless-Labyrinth-score-leaderboard`;
export const SCORES_RAW = `https://raw.githubusercontent.com/${SCORES_REPO}/main/weeks/`;
export const RESULTS_RAW = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/leaderboard/`;
export const TIME_ZONE = 'America/New_York';
export const BOARD_KEY = 'chaos';                              // the score the board ranks: Chaos Mode points
// The rewards, in the order they rotate (the developer's Event Maker picks the week's).
export const REWARDS = ['health', 'ammo', 'time'];
export const REWARD_HEALTH = 1.25;                             // 25% more health where there is health...
export const REWARD_LIVES = 1;                                 // ...and one extra life where there are lives
export const REWARD_AMMO = 1.5;                                // 50% more ammo
export const REWARD_TIME = 30;                                 // 30 extra seconds on every starting clock
export const REWARD_WORDS = {
  health: 'one extra life, or 25 percent more health',
  ammo: '50 percent more ammo',
  time: '30 extra seconds on every starting clock',
};

const ID_KEY = 'endless-labyrinth-web-device-id';
const RESULT_KEY = 'endless-labyrinth-web-leaderboard-result';
const SEEN_KEY = 'endless-labyrinth-web-leaderboard-ceremony';
const PENDING_KEY = 'endless-labyrinth-web-leaderboard-pending';
const PENDING_MAX = 5;
export const MIN_SECONDS = 10;                                 // a run shorter than this is not sent

const store = {
  get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage blocked: nothing kept */ } },
};

// ------------------------------------------------------------------ the week
// The Monday a moment falls in, as 'YYYY-MM-DD', by Eastern time.
export function weekOf(ms = Date.now()) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }).formatToParts(new Date(ms))) parts[p.type] = p.value;
  const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[parts.weekday] || 0;
  const d = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - back));
  return d.toISOString().slice(0, 10);
}
export function addWeeks(week, n) {
  const [y, m, d] = week.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 7 * n)).toISOString().slice(0, 10);
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function weekWords(week) {
  const [, m, d] = week.split('-').map(Number);
  return `Monday ${d} ${MONTHS[m - 1]}`;
}

// ------------------------------------------------------------------ this device
// A random ID, made once and kept on this device: it says nothing about the player.
export function deviceId() {
  let id = store.get(ID_KEY);
  if (!id || !/^[0-9a-f]{32}$/.test(id)) {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    id = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    store.set(ID_KEY, id);
  }
  return id;
}

// ------------------------------------------------------------------ sending a score
let relay = RELAY_URL;
export function _setRelay(url) { relay = url; }      // for the tests

async function post(body) {
  const res = await fetch(relay.replace(/\/$/, '') + '/score', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store',
  });
  if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
  return res.ok;
}

function pending() {
  try { const p = JSON.parse(store.get(PENDING_KEY) || '[]'); return Array.isArray(p) ? p : []; } catch (e) { return []; }
}

// A Chaos run's points, sent in the background; one that cannot be sent now (no
// connection) is kept and sent the next time the game opens, if still in its week.
export function submit(score, seconds) {
  score = Math.floor(Number(score) || 0);
  seconds = Math.round(Number(seconds) || 0);
  if (score <= 0 || seconds < MIN_SECONDS) return false;
  const body = { id: deviceId(), score, seconds, week: weekOf(), at: Date.now() };
  if (!relay) return false;
  post(body).catch(() => {
    const p = pending().concat([body]).slice(-PENDING_MAX);
    store.set(PENDING_KEY, JSON.stringify(p));
  });
  return true;
}

export async function sendPending() {
  const p = pending();
  if (!p.length || !relay) return;
  store.set(PENDING_KEY, '[]');
  const now = weekOf();
  for (const body of p) {
    if (body.week !== now) continue;           // a past week's board is closed
    try { await post(body); } catch (e) { /* still offline: dropped, the next run sends again */ }
  }
}

// ------------------------------------------------------------------ the board
// This week's (or a given week's) board: [{ id, best, runs }], best first.
export async function board(week = weekOf()) {
  const res = await fetch(SCORES_RAW + week + '.json', { cache: 'no-store' });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return rankOf(data);
}
export function rankOf(data) {
  const s = (data && data.scores) || {};
  return Object.entries(s).map(([id, v]) => ({ id, best: Math.floor(Number(v && v.best) || 0), runs: Math.floor(Number(v && v.runs) || 0) }))
    .filter((e) => e.best > 0).sort((a, b) => b.best - a.best || a.id.localeCompare(b.id));
}

// ------------------------------------------------------------------ the signed result
// A week's result is believed only with the developer's signature on it. Returns the
// result ({ week, score, winner, reward, players }) or null.
export async function readResult(text, pubHex = undefined) {
  let tree;
  try { tree = pyParse(String(text).replace(/^﻿/, '')); } catch (e) { return null; }
  const [ok] = await checkSignature(tree, pubHex);
  if (!ok) return null;
  const r = pyPlain(tree);
  if (!r || r.kind !== 'weekly leaderboard' || !/^\d{4}-\d{2}-\d{2}$/.test(r.week || '')) return null;
  if (!/^[0-9a-f]{32}$/.test(r.winner || '') || !REWARDS.includes(r.reward)) return null;
  const score = Math.floor(Number(r.score));
  if (!(score > 0)) return null;
  return { week: r.week, score, winner: r.winner, reward: r.reward, players: Math.floor(Number(r.players) || 0) };
}

let current = null;            // last week's result, once read and believed
let currentFor = null;         // the week it was looked up for

// Last week's result: from the published file, or the copy kept from last time.
export async function loadResult(now = Date.now()) {
  const last = addWeeks(weekOf(now), -1);
  if (currentFor === last && current) return current;
  let text = null;
  try {
    const res = await fetch(RESULTS_RAW + last + '.json', { cache: 'no-store' });
    if (res.ok) text = await res.text();
  } catch (e) { /* offline: the kept copy */ }
  if (text === null) text = store.get(RESULT_KEY);
  const r = text ? await readResult(text) : null;
  currentFor = last;
  current = r && r.week === last ? r : null;
  if (current && text) store.set(RESULT_KEY, text);
  return current;
}
export function result() { return current; }

// The reward this device has now, if it won last week: 'health', 'ammo', 'time' or null.
export function reward(now = Date.now()) {
  const r = current;
  if (!r || r.winner !== deviceId()) return null;
  return addWeeks(r.week, 1) === weekOf(now) ? r.reward : null;
}
export const won = () => reward() !== null;

// The reward applied where a run starts (each mode calls these on its starting values).
export const health = (hp) => (reward() === 'health' ? Math.round(hp * REWARD_HEALTH) : hp);
export const lives = (n) => (reward() === 'health' ? n + REWARD_LIVES : n);
export const ammo = (n) => (reward() === 'ammo' ? Math.ceil(n * REWARD_AMMO) : n);
export const time = (s) => (reward() === 'time' ? s + REWARD_TIME : s);

// The winner's ceremony plays by itself once a week, the first time the game opens.
export function ceremonyDue() {
  const r = current;
  return !!(r && won() && store.get(SEEN_KEY) !== r.week);
}
export function ceremonySeen() { if (current) store.set(SEEN_KEY, current.week); }

// For the tests: forget what was read.
export function _reset() { current = null; currentFor = null; }
export function _setResult(r) { current = r; currentFor = r ? addWeeks(weekOf(), -1) : null; }
