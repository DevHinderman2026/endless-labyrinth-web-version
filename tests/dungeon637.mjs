// Web 6.3.7 (Russell, 22 November 2026): Dungeon Keys' guards listen for you, as Trapped in
// Darkness's creatures do, instead of wandering into you. Played by script in a real browser
// engine, from the event file in the desktop repository (unsigned until Russell signs it in
// the Event Maker, so it is started from its settings, as tests/events5.mjs does).
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/dungeon637.mjs http://localhost:8790 [desktop folder]
// What is checked:
// - the event and its template pass the game's own checks, as format 2, guards listening;
// - a guard rests where it is, and a player standing still beside or behind it for a minute
//   is never caught and never wakes it;
// - stepping close in front of it wakes it: a growl, then a charge, at 0.7 steps a second
//   (it was 1.2, always moving), which a player walking away escapes;
// - the next cells still add a guard each, none lying on or beside the keys.

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const base = process.argv[2] || 'http://localhost:8790';
const desk = process.argv[3] || '/home/claude/work/desktop';
const EVENT = JSON.parse(fs.readFileSync(path.join(desk, 'events', 'dungeon-keys-2026.json'), 'utf8'));
const TEMPLATE = JSON.parse(fs.readFileSync(path.join(desk, 'Developer Tools', 'templates', 'dungeon-keys.json'), 'utf8'));
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext();
await context.route('https://api.github.com/**', (route) => route.fulfill({
  status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 120000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');

const checks = await page.evaluate(async ({ event, template }) => {
  const { checkEvent } = await import('./js/modes/events/schema.js');
  const out = {};
  for (const [k, d] of [['event', event], ['template', template]]) {
    const [ev, errs] = checkEvent(d);
    out[k] = { errs, format: d.format, behavior: ev && ev.hazards.behavior, speed: ev && ev.hazards.speed };
  }
  return out;
}, { event: EVENT, template: TEMPLATE });
for (const k of ['event', 'template']) {
  const c = checks[k];
  check(c.errs.length === 0 && c.format === 2 && c.behavior === 'listen' && c.speed === 0.7,
    `the ${k} passes the game's checks as format 2, guards listening at 0.7: ${JSON.stringify(c)}`);
}

const r = await page.evaluate(async (d) => {
  const { checkEvent } = await import('./js/modes/events/schema.js');
  const G = window.__el.game; const out = {};
  const [ev] = checkEvent(d);
  G._toMenu(''); G.state = 'events_menu';
  G._eventLoadThenStart(ev);
  for (let i = 0; i < 300 && G.state !== 'event'; i++) await new Promise((res) => setTimeout(res, 50));
  out.state = G.state;
  if (G.state !== 'event') return out;
  const run = (s) => { for (let i = 0; i < Math.round(s * 30) && G.state === 'event'; i++) G.frame(1 / 30); };
  for (let i = 0; i < 100 && G.state === 'event' && G.evClimbHold > 0; i++) G.frame(0.1);
  run(4);       // (a listener ignores the first three seconds)
  const STEP = 3.0;
  const g = G.evHazards[0];
  out.guards = G.evHazards.length;
  out.restState = g.state;
  out.lives0 = G.evLives;
  // Beside it, then behind it, standing still for a minute each.
  const side = [-g.face[1], g.face[0]];
  for (const [label, at] of [['beside', [g.x + side[0] * STEP * 1.2, g.y + side[1] * STEP * 1.2]],
    ['behind', [g.x - g.face[0] * STEP * 1.2, g.y - g.face[1] * STEP * 1.2]]]) {
    G.playerPos = at;
    run(60);
    out[label] = { state: g.state, lives: G.evLives, moved: Math.hypot(g.x - g.home[0], g.y - g.home[1]) };
  }
  // Close in front of it: it wakes, growls, then charges.
  const hx = g.x; const hy = g.y;
  G.playerPos = [g.x + g.face[0] * STEP * 2, g.y + g.face[1] * STEP * 2];
  run(0.2); out.woke = g.state;
  run(1.6); out.after = g.state;
  // Its speed while charging, measured over one second with the player well ahead of it.
  const away = [g.face[0], g.face[1]];
  G.playerPos = [g.x + away[0] * STEP * 6, g.y + away[1] * STEP * 6];
  const p0 = [g.x, g.y]; run(1.0);
  out.chargeSpeed = Math.hypot(g.x - p0[0], g.y - p0[1]) / STEP;   // steps in that second
  out.chargeTrace = [g.state];
  // Walk away from it, a step about every half second, and see whether it catches up.
  for (let i = 0; i < 12 && G.state === 'event'; i++) {
    G.playerPos = [G.playerPos[0] + away[0] * STEP, G.playerPos[1] + away[1] * STEP];
    run(0.5);
  }
  out.livesAfterEscape = G.evLives;
  out.endState = g.state;
  out.home = [hx, hy];
  // The next cells: one more guard each, and none settles on or beside the key or the door,
  // nor faces them from within its notice (so both can always be reached past the guards).
  out.cells = []; out.blocked = [];
  for (let trial = 0; trial < 8; trial++) {
    for (let room = 2; room <= 7 && G.state === 'event'; room++) {
      G.mRoom = room; G.mHasKey = false;
      G.playerPos = [0, 0];
      G._mKeysRoom();
      run(0.1);
      if (trial === 0) out.cells.push(G.evHazards.length);
      for (const h of G.evHazards) {
        if (h.state !== 'rest' || !h.face) continue;
        for (const [name, t] of [['key', G.mKey], ['door', G.mExit]]) {
          const d = Math.hypot(t.x - h.x, t.y - h.y);
          const ahead = d > 0.01 ? ((t.x - h.x) * h.face[0] + (t.y - h.y) * h.face[1]) / d : 1;
          if (d < 2.5 * STEP || (d <= 3.5 * STEP && ahead >= 0.707)) out.blocked.push(`${name} room ${room}: ${d.toFixed(1)} ahead ${ahead.toFixed(2)}`);
        }
      }
    }
    // A fresh run for the next trial.
    G.triggerGameOver(); G._toMenu(''); G.state = 'events_menu';
    G._eventLoadThenStart(ev);
    for (let i = 0; i < 300 && G.state !== 'event'; i++) await new Promise((res) => setTimeout(res, 50));
    for (let i = 0; i < 100 && G.state === 'event' && G.evClimbHold > 0; i++) G.frame(0.1);
  }
  G.triggerGameOver(); G._toMenu('');
  return out;
}, EVENT);
check(r.state === 'event', 'Dungeon Keys starts: ' + r.state);
check(r.guards === 1 && r.restState === 'rest', `the first cell has one guard, resting: ${r.guards}, ${r.restState}`);
check(r.beside && r.beside.state === 'rest' && r.beside.lives === r.lives0 && r.beside.moved < 0.01, `standing still beside a guard for a minute: not woken, not caught, it never moves: ${JSON.stringify(r.beside)}`);
check(r.behind && r.behind.state === 'rest' && r.behind.lives === r.lives0 && r.behind.moved < 0.01, `the same behind it: ${JSON.stringify(r.behind)}`);
check(r.woke === 'growl' && r.after === 'charge', `close in front of it, it growls, then charges: ${r.woke}, ${r.after}`);
check(r.chargeSpeed > 0.6 && r.chargeSpeed < 0.8, `it charges at about 0.7 steps a second: ${r.chargeSpeed && r.chargeSpeed.toFixed(2)} (${r.chargeTrace})`);
check(r.livesAfterEscape === r.lives0, `walking away from the charge escapes it: lives ${r.lives0} -> ${r.livesAfterEscape}`);
check(JSON.stringify(r.cells) === JSON.stringify([2, 3, 4, 5, 6, 7]), `cells 2 to 7 add one guard each: ${JSON.stringify(r.cells)}`);
check(r.blocked && r.blocked.length === 0, `no guard rests on, beside or facing the key or the door, over 8 runs of 6 cells: ${JSON.stringify((r.blocked || []).slice(0, 5))}`);
check(errors.length === 0, 'no errors in the page: ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
