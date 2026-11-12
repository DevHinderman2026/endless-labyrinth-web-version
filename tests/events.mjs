// End-to-end checks of the events, in a real browser engine (Chromium, through Playwright).
// Run: serve the site folder (python3 -m http.server 8774), then
//   node tests/events.mjs http://localhost:8774 [desktop folder]
// GitHub is never reached: the published events are served from the desktop
// repository's own events folder (and a few altered copies) by intercepting the
// requests, and this site's Date header is set to a fixed day, so the same events
// are live every time. It cannot hear: how things sound is for a person.

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pyParse, eventMessage } from '../js/modes/events/sign.js';

const base = process.argv[2] || 'http://localhost:8774';
const desk = process.argv[3] || '/home/claude/work/desktop';
const EVENTS = path.join(desk, 'events');
const TEMPLATES = path.join(desk, 'Developer Tools', 'templates');
const API = 'https://api.github.com/repos/DevHinderman2026/Endless-Labyrinth/contents/events?ref=main';
const RAW = 'https://raw.githubusercontent.com/DevHinderman2026/Endless-Labyrinth/main/events/';
const NOW = new Date('2026-11-26T12:00:00Z');   // Call of Fate, Turkey Hunt and The Angry Papa are live

let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

// ------------------------------------------------------------ the files GitHub would serve
const files = {};
for (const f of fs.readdirSync(EVENTS).filter((n) => n.endsWith('.json'))) files[f] = fs.readFileSync(path.join(EVENTS, f), 'utf8');
const pumpkin = files['pumpkin-hunt-2026.json'];
// Changed after signing: one setting.
files['zz-altered.json'] = pumpkin.replace('"id": "pumpkin-hunt-2026"', '"id": "pumpkin-hunt-altered"');
// Not signed at all.
const unsigned = JSON.parse(pumpkin); unsigned.id = 'pumpkin-unsigned'; delete unsigned.signature;
files['zz-unsigned.json'] = JSON.stringify(unsigned, null, 1);
// Signed, but with someone else's key.
const { privateKey } = crypto.generateKeyPairSync('ed25519');
const foreign = JSON.parse(pumpkin); foreign.id = 'pumpkin-foreign';
foreign.signature = '';
const foreignTree = pyParse(JSON.stringify(foreign));
foreign.signature = crypto.sign(null, Buffer.from(eventMessage(foreignTree)), privateKey).toString('hex');
files['zz-foreign.json'] = JSON.stringify(foreign, null, 2);
let listing404 = false;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const cors = { 'Access-Control-Allow-Origin': '*' };
await context.route(API, (route) => {
  if (listing404) return route.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{"message":"Not Found"}' });
  const list = Object.keys(files).map((name) => ({ name, type: 'file', download_url: RAW + name }));
  return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(list) });
});
await context.route(RAW + '*', (route) => {
  const name = decodeURIComponent(route.request().url().slice(RAW.length));
  if (!(name in files)) return route.fulfill({ status: 404, headers: cors, body: '' });
  return route.fulfill({ status: 200, headers: cors, contentType: 'text/plain; charset=utf-8', body: files[name] });
});
// The time: this site's own Date header, on the request the game makes for it.
await context.route('**/packs/manifest.json', (route) => {
  if (route.request().method() === 'HEAD') {
    return route.fulfill({ status: 200, headers: { Date: NOW.toUTCString(), 'Content-Type': 'application/json' }, body: '' });
  }
  return route.continue();
});

async function startGame() {
  await page.goto(base + '/play.html?desktop=1');
  await page.click('#start');
  await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 120000 });
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
  await page.waitForFunction(() => window.__el.game.eventFeed.fetchedAt !== null, null, { timeout: 30000 });
}
await startGame();
check(true, 'game started and the event feed finished its first check');

// ------------------------------------------------------------ the feed, the time and the signatures
const feed = await page.evaluate(() => {
  const f = window.__el.game.eventFeed;
  return { ids: Object.keys(f.events).sort(), problems: f.problems.map(([n, p]) => [n, p.join(' ')]), online: f.online,
    from: f.clockFrom, now: f.internetNow(), label: window.__el.game._menuLabel('events') };
});
check(feed.online && feed.from === 'site' && Math.abs(feed.now - NOW / 1000) < 60, `the time comes from the site's Date header (${feed.from}, ${new Date(feed.now * 1000).toISOString()})`);
check(JSON.stringify(feed.ids) === JSON.stringify(['call-of-fate-2026', 'pumpkin-hunt-2026', 'the-angry-papa-2026', 'the-music-box-2026', 'trapped-in-darkness-2026', 'turkey-hunt-2026-2']),
  'every published event is read: ' + feed.ids.join(', '));
const refused = Object.fromEntries(feed.problems);
check(/does not match/.test(refused['zz-altered.json'] || ''), 'an altered event is refused: ' + refused['zz-altered.json']);
check(/not signed/.test(refused['zz-unsigned.json'] || ''), 'an unsigned event is refused');
check(/does not match/.test(refused['zz-foreign.json'] || ''), "an event signed with another key is refused");
check(feed.label === 'Events: 3 live', 'the main menu says ' + feed.label);

const checks = await page.evaluate(async ({ texts }) => {
  const { trusted } = await import('./js/modes/events/feed.js');
  const sign = await import('./js/modes/events/sign.js');
  const out = { passed: 0, failed: [] };
  for (const [name, text] of texts) {
    const [ev, errs] = await trusted(text);
    if (ev && !errs.length) out.passed += 1; else out.failed.push(name + ': ' + errs.join(' '));
  }
  out.engine = sign.signatureEngine.last;
  // The desktop's own verify, ported, gives the same answers.
  sign.signatureEngine.forcePlain = true;
  let plain = 0;
  for (const [, text] of texts.slice(0, 6)) { const [ev] = await trusted(text); if (ev) plain += 1; }
  out.plain = plain;
  sign.signatureEngine.forcePlain = false;
  return out;
}, { texts: [...fs.readdirSync(EVENTS).map((f) => [f, fs.readFileSync(path.join(EVENTS, f), 'utf8')]),
  ...fs.readdirSync(TEMPLATES).map((f) => [f, fs.readFileSync(path.join(TEMPLATES, f), 'utf8')])] });
const total = fs.readdirSync(EVENTS).length + fs.readdirSync(TEMPLATES).length;
check(checks.passed === total, `every published event and template passes the signature and check_event: ${checks.passed} of ${total}` + (checks.failed.length ? ' ' + checks.failed.join(' | ') : ''));
check(checks.plain === 6, `the ported Ed25519 verify agrees (${checks.engine} was used by the browser)`);
// Python's json.dumps decides what is signed: a reformatted file with the same values
// still verifies; 1.0 written as 1 does not (Python would write 1, not 1.0).
const fmt = await page.evaluate(async ({ a, b }) => {
  const { trusted } = await import('./js/modes/events/feed.js');
  return [(await trusted(a))[1].length === 0, (await trusted(b))[1].join(' ')];
}, { a: pumpkin.replace(/\n\s*/g, '').replace('"volume": 1.6', '"volume":1.60'), b: pumpkin.replace('"ambience_volume": 1.0', '"ambience_volume": 1') });
check(fmt[0] && /does not match/.test(fmt[1]), 'signatures follow Python number formatting exactly (1.60 is 1.6; 1 is not 1.0)');

// ------------------------------------------------------------ in-page helpers: a simple player
await page.evaluate(() => {
  const g = () => window.__el.game;
  // The next swipe toward a thing at (tx, ty): walk the grid of steps, landing on it
  // with a swipe up or down, never landing (up or down) in a square in `avoid`.
  window.__toward = (tx, ty, avoid = []) => {
    const G = g();
    const sx = Math.round(G.playerPos[0] / 3); const sy = Math.round(G.playerPos[1] / 3);
    const tcx = Math.round(tx / 3); const tcy = Math.round(ty / 3);
    const lim = Math.floor(G.arenaLimit / 3);
    const bad = new Set(avoid.map(([x, y]) => Math.round(x / 3) + ',' + Math.round(y / 3)));
    const prev = new Map([[sx + ',' + sy, null]]);
    const q = [[sx, sy]];
    while (q.length) {
      const [cx, cy] = q.shift();
      for (const [dx, dy, gname] of [[0, -1, 'up'], [0, 1, 'down'], [-1, 0, 'left'], [1, 0, 'right']]) {
        const nx = cx + dx; const ny = cy + dy;
        if (Math.abs(nx) > lim || Math.abs(ny) > lim) continue;
        const k = nx + ',' + ny;
        if (dy && nx === tcx && ny === tcy) {
          // Found: walk back to the first move.
          let first = gname; let at = cx + ',' + cy;
          while (prev.get(at)) { first = prev.get(at)[1]; at = prev.get(at)[0]; }
          return first;
        }
        if (prev.has(k)) continue;
        if (dy && bad.has(k)) continue;
        prev.set(k, [cx + ',' + cy, gname]);
        q.push([nx, ny]);
      }
    }
    return null;
  };
  window.__liveLoops = () => [...window.__el.audio.live].filter((v) => v.loop).map((v) => v.name);
});

// Run frames with a player function until the run ends (or a limit of game seconds).
async function play(fnSource, seconds = 400, every = 4) {
  return page.evaluate(({ src, seconds, every }) => {
    const G = window.__el.game;
    const act = new Function('G', src);
    let frames = 0;
    for (; frames < seconds * 30 && G.state === 'event'; frames++) {
      G.frame(1 / 30);
      if (G.state !== 'event') break;
      if (frames % every === 0) act(G);
    }
    return { state: G.state, frames, said: document.getElementById('said').textContent, loops: window.__liveLoops() };
  }, { src: fnSource, seconds, every });
}

async function chooseEvent(id) {
  return page.evaluate(async (wanted) => {
    const G = window.__el.game;
    G._toMenu('');
    G.menuIndex = G.menuKeys.indexOf('events');
    G.input('enter');
    const opened = document.getElementById('said').textContent;
    for (let i = 0; i < 10 && !(G.eventMenu[G.eventMenuIndex][1] && G.eventMenu[G.eventMenuIndex][1].id === wanted); i++) G.input('down');
    const line = document.getElementById('said').textContent;
    G.input('enter');
    for (let i = 0; i < 200 && G.state !== 'event'; i++) await new Promise((r) => setTimeout(r, 50));
    return { opened, line, state: G.state, ev: G.ev && G.ev.id, room: window.__el.audio.room };
  }, id);
}

// ------------------------------------------------------------ The Angry Papa: collect all 25, from the menu
let r = await chooseEvent('the-angry-papa-2026');
check(/^Events\. 3 live\. /.test(r.opened), 'the Events menu opens: ' + r.opened.slice(0, 120));
check(r.state === 'event' && r.ev === 'the-angry-papa-2026' && r.room === 'lab', `a double tap starts The Angry Papa in its room (${r.room})`);
r = await play(`
  const t = G.evItems.slice().sort((a, b) => Math.hypot(a.x - G.playerPos[0], a.y - G.playerPos[1]) - Math.hypot(b.x - G.playerPos[0], b.y - G.playerPos[1]))[0];
  if (t) { const m = window.__toward(t.x, t.y); if (m) G.input(m); }
`);
check(r.state === 'game_over' && /You found all \d+ Cookies/.test(r.said), 'the scripted player collects every one (a random total, 25 or more) and the run ends: ' + r.said);
check(r.loops.length === 0, 'no loops left after the run: ' + r.loops.join(', '));
const papaBest = await page.evaluate(() => window.__el.game.eventScores.data.events['the-angry-papa-2026']);
check(papaBest && papaBest.runs === 1 && papaBest.best > 0 && /saved in Event High Scores/.test(r.said), `Event High Scores keep the run: best ${papaBest && papaBest.best}`);

// A run quit part way keeps nothing.
r = await chooseEvent('the-angry-papa-2026');
const quit = await page.evaluate(() => {
  const G = window.__el.game;
  for (let i = 0; i < 90; i++) G.frame(1 / 30);
  const during = window.__liveLoops().length;
  G.input('back'); G.input('up'); G.input('enter');
  return { during, state: G.state, ev: G.ev, loops: window.__liveLoops(), runs: G.eventScores.data.events['the-angry-papa-2026'].runs };
});
check(quit.during > 0 && quit.state === 'menu' && quit.ev === null && quit.loops.length === 0 && quit.runs === 1,
  `quitting a run stops its ${quit.during} loops and keeps nothing (still ${quit.runs} run)`);

// ------------------------------------------------------------ Turkey Hunt: shoot until the clock runs out
r = await chooseEvent('turkey-hunt-2026-2');
check(r.state === 'event', 'Turkey Hunt starts');
const hunt0 = await page.evaluate(() => ({ amb: window.__el.game.ambienceChannel && window.__el.game.ambienceChannel.name, hz: window.__el.game.evHazards.length, shots: window.__el.game.evShots }));
check(/^bat_/.test(hunt0.amb || '') && hunt0.hz === 10 && hunt0.shots === 999, `its battle drone plays (${hunt0.amb}), ten turkeys, 999 shots`);
r = await play(`
  const up = G.evHazards.filter((h) => h.downFor < 0);
  if (!up.length) return;
  const n = up.sort((a, b) => Math.hypot(a.x - G.playerPos[0], a.y - G.playerPos[1]) - Math.hypot(b.x - G.playerPos[0], b.y - G.playerPos[1]))[0];
  const dx = n.x - G.playerPos[0]; const d = Math.hypot(dx, n.y - G.playerPos[1]);
  if (Math.abs(dx / d) < 0.72) G.input('space'); else G.input(dx > 0 ? 'right' : 'left');
`, 200, 6);
const turkey = await page.evaluate(() => window.__el.game.eventScores.data.events['turkey-hunt-2026-2']);
check(r.state === 'game_over' && /Time up\. You brought down \d+ turkey/i.test(r.said) && turkey && turkey.best > 0, 'the hunt runs to the end of its clock: ' + r.said.slice(0, 160));

// ------------------------------------------------------------ Call of Fate: real and false bells
r = await chooseEvent('call-of-fate-2026');
const cof0 = await page.evaluate(() => ({ real: window.__el.game.evItems.length, fakes: window.__el.game.evFakes.length,
  names: window.__el.game.evFakes.map((f) => f.beacon).concat(window.__el.game.evItems.map((t) => t.beacon)) }));
check(r.state === 'event' && cof0.real === 1 && cof0.fakes === 2 && cof0.names.every((n) => /^event_room_cathedral_beacon_(real|fake)_evt_/.test(n)),
  'Call of Fate lays out one real bell and two warped fakes: ' + cof0.names.join(', '));
r = await play(`
  const avoid = G.evFakes.map((f) => [f.x, f.y]).concat(G.evDarkExit ? [[G.evDarkExit.x, G.evDarkExit.y]] : []);
  const t = G.evItems[0] || G.evExit;
  if (G.evLevel >= 3) {          // enough: walk into a fake to end the run
    const f = G.evFakes[0]; const m = window.__toward(f.x, f.y); if (m) G.input(m); return;
  }
  if (t) { const m = window.__toward(t.x, t.y, avoid); if (m) G.input(m); }
`, 600);
const cof = await page.evaluate(() => window.__el.game.eventScores.data.events['call-of-fate-2026']);
check(r.state === 'game_over' && /That was a false bell\. You reached level 3/.test(r.said) && cof.best >= 50, 'the player rings the real bell through two levels, then a fake ends it: ' + r.said.slice(0, 170));

// ------------------------------------------------------------ several more missions, from the templates
async function startTemplate(file) {
  const text = fs.readFileSync(path.join(TEMPLATES, file), 'utf8');
  return page.evaluate(async (t) => {
    const { trusted } = await import('./js/modes/events/feed.js');
    const G = window.__el.game;
    const [ev] = await trusted(t);
    G._toMenu('');
    G.state = 'events_menu';
    G._eventLoadThenStart(ev);
    for (let i = 0; i < 200 && G.state !== 'event'; i++) await new Promise((res) => setTimeout(res, 50));
    return G.state;
  }, text);
}
const missions = [
  ['city-sprint.json', 'relay', `if (G.mCheckpoints >= 4) return; const t = G.evItems[0]; if (t) { const m = window.__toward(t.x, t.y); if (m) G.input(m); }`, /Time ran out to reach the checkpoint\. You reached 4 checkpoints/],
  ['bell-scale.json', 'order', `const need = G.mOrderNeed[0]; const t = G.evItems.find((i) => i.note === need);
     const avoid = G.evItems.filter((i) => i !== t).map((i) => [i.x, i.y]); if (t) { const m = window.__toward(t.x, t.y, avoid); if (m) G.input(m); }`, /Time up\. You finished [1-9]\d* rounds?/],
  ['barnyard-band.json', 'memory', `if (G.evElapsed < G.mTurnAt) return; const want = G.mRoundsDone >= 2 ? (G.mTune[G.mPos] + 1) % G.mPads.length : G.mTune[G.mPos];
     const t = G.mPads[want]; const avoid = G.mPads.filter((p) => p !== t).map((p) => [p.x, p.y]); const m = window.__toward(t.x, t.y, avoid); if (m) G.input(m);`, /That was the wrong pad\. You played back 2 tunes/],
  ['ninja-reflex.json', 'reflex', `if (!G.mCueLive) return; const right = G.mAnswered < 8; const d = G.mCueDir;
     const map = { ahead: 'up', behind: 'down', left: 'left', right: 'right' }; G.input(right ? map[d] : (d === 'left' ? 'right' : 'left'));`, /Out of lives\. You answered 8/],
  ['drum-circle.json', 'rhythm', `if (G.mOnBeat < 12 && G.mBeatTimes.length) G.input('space');`, /Off the beat\. You hit 12 beats/],
  ['kitchen-rush.json', 'deliver', `const t = G.mCarry ? G.mDropoff : G.evItems[0]; if (t) { const m = window.__toward(t.x, t.y); if (m) G.input(m); }`, /Time up\. You delivered [1-9]\d* /],
];
for (const [file, mission, bot, want] of missions) {
  const st = await startTemplate(file);
  const res = st === 'event' ? await play(bot, 400, mission === 'rhythm' ? 1 : 4) : { state: st, said: '', loops: [] };
  check(res.state === 'game_over' && want.test(res.said) && res.loops.length === 0, `${mission} (${file}) is played to its end: ${res.said.slice(0, 150)}`);
}

// ------------------------------------------------------------ every template: a while of play, then quit
const smoke = [];
for (const file of fs.readdirSync(TEMPLATES).sort()) {
  const st = await startTemplate(file);
  const res = await page.evaluate(() => {
    const G = window.__el.game;
    const moves = ['up', 'down', 'left', 'right', 'up', 'up', 'space', 'enter', 'clock'];
    for (let i = 0; i < 30 * 40 && G.state === 'event'; i++) {
      G.frame(1 / 30);
      if (i % 9 === 0 && G.state === 'event') G.input(moves[Math.floor(Math.random() * moves.length)]);
    }
    const ended = G.state;
    if (G.state === 'event') { G.input('back'); G.input('up'); G.input('enter'); } else G.input('enter');
    return { mission: G.eventScores && ended, state: G.state, loops: window.__liveLoops() };
  });
  smoke.push([file, st, res.mission, res.loops.length]);
}
const badSmoke = smoke.filter(([, st, , loops]) => st !== 'event' || loops);
check(badSmoke.length === 0 && errors.length === 0, `all ${smoke.length} templates (all 30 missions) start, play 40 seconds of random gestures and stop cleanly`
  + (badSmoke.length ? ': ' + JSON.stringify(badSmoke) : ''));

// ------------------------------------------------------------ Event High Scores
const scores = await page.evaluate(() => {
  const G = window.__el.game;
  G._toMenu('');
  G.menuIndex = G.menuKeys.indexOf('event_score');
  const label = G.menuOptions[G.menuIndex];
  G.input('enter');
  const first = document.getElementById('said').textContent;
  G.scores.reset();                    // the High Scores reset never touches them
  const kept = Object.keys(G.eventScores.data.events).length;
  G.input('back');
  return { label, first, kept, state: G.state };
});
check(/^Event High Scores: \d+ events$/.test(scores.label) && /^Event High Scores\. Your best run in \d+ events\./.test(scores.first) && scores.kept >= 9,
  `Event High Scores list the best runs (${scores.label}) and survive a high score reset`);

// The help section (38 topics since web 1.3.0 moved the item and collected demos into Demos, Events;
// 79 since web 5.0.0: 16 for the building blocks and their missions, 25 for the further missions).
const help = await page.evaluate(async () => {
  const { HELP } = await import('./js/game.js');
  const sec = HELP.find(([n]) => n === 'Events');
  const names = HELP.map(([n]) => n);
  return { n: sec ? sec[1].length : 0, after: names.indexOf('Events') > names.indexOf('Battle Mode') && names.indexOf('Events') < names.findIndex((n) => n.startsWith('Demos')),
    sounds: sec ? sec[1].filter((t) => t.sound).every((t) => window.__el.audio.has(t.sound)) : false,
    keys: sec ? sec[1].filter((t) => /\b(Enter|Escape|Space|arrow|Arrow)\b/.test(t.desc.replace(/Descriptions are written for the computer version too[^.]*\./, ''))).map((t) => t.title) : [] };
});
check(help.n === 79 && help.after && help.sounds && help.keys.length === 0, `the help has an Events section of ${help.n} topics, before the demos, every demo sound in the pack, no key names (but the one sentence on descriptions written for a keyboard)`);

// ------------------------------------------------------------ protected events are kept on the device
listing404 = true;
const errorsBefore = errors.length;
await startGame();
// (The browser itself logs the 404 of the missing events folder.)
for (let i = errors.length - 1; i >= errorsBefore; i--) if (/status of 404/.test(errors[i])) errors.splice(i, 1);
const kept = await page.evaluate(() => ({ ids: Object.keys(window.__el.game.eventFeed.events).sort(), best: window.__el.game.eventScores.data.events['the-angry-papa-2026'] }));
check(JSON.stringify(kept.ids) === JSON.stringify(['call-of-fate-2026', 'pumpkin-hunt-2026']), 'with the events folder gone, the protected events are still offered: ' + kept.ids.join(', '));
check(kept.best && kept.best.best === papaBest.best, 'Event High Scores survive a reload');

check(errors.length === 0, 'no errors in the page' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
