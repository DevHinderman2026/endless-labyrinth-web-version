// End-to-end checks of what web 5.0.0 added to events (format 2: the building blocks
// and the seven new missions), in a real browser engine (Chromium, through Playwright).
// Run: serve the site folder (python3 -m http.server 8774), then
//   node tests/events5.mjs http://localhost:8774 [desktop folder]
// The events come from the desktop repository's templates folder. They are checked
// with the game's own checkEvent and started directly, without their signatures (a
// new template is unsigned until the developer signs it in the Event Maker;
// events.mjs checks signatures). It cannot hear: how things sound is for a person.

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const base = process.argv[2] || 'http://localhost:8774';
const desk = process.argv[3] || '/home/claude/work/desktop';
const TEMPLATES = path.join(desk, 'Developer Tools', 'templates');

let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext();
// The live events folder is answered as empty: this test brings its own events.
await context.route('https://api.github.com/**', (route) => route.fulfill({
  status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 120000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
check(true, 'game started');

// Start an event from its settings (a template's file, or a base event with changes).
async function start(data) {
  return page.evaluate(async (d) => {
    const { checkEvent } = await import('./js/modes/events/schema.js');
    const G = window.__el.game;
    const [ev, errs] = checkEvent(d);
    if (errs.length || !ev) return { errs };
    if (G.state === 'event') G.triggerGameOver();
    G._toMenu('');
    G.state = 'events_menu';
    document.getElementById('said').textContent = '';
    G._eventLoadThenStart(ev);
    for (let i = 0; i < 300 && G.state !== 'event'; i++) await new Promise((res) => setTimeout(res, 50));
    return { state: G.state, errs: [] };
  }, data);
}

// A base event: the defaults, with changes by path ('item.total': 3).
async function baseEvent(mission, changes = {}, stages = null) {
  return page.evaluate(async ({ mission, changes, stages }) => {
    const { DEFAULTS } = await import('./js/modes/events/schema.js');
    const ev = structuredClone(DEFAULTS);
    Object.assign(ev, { id: 'test-event', name: 'Test', mission, start: '2026-01-01T00:00:00Z', end: '2027-01-01T00:00:00Z' });
    for (const [p, v] of Object.entries(changes)) {
      const parts = p.split('.'); let d = ev;
      for (const k of parts.slice(0, -1)) d = d[k];
      d[parts[parts.length - 1]] = v;
    }
    if (stages) ev.stages = stages;
    delete ev.signature;
    return ev;
  }, { mission, changes, stages });
}

// Run script in the page with G the game; helpers: stepOnto(thing), run(seconds), said().
async function inGame(src) {
  return page.evaluate((src) => {
    const G = window.__el.game;
    const H = {
      run: (seconds) => { for (let i = 0; i < Math.round(seconds * 30) && G.state === 'event'; i++) G.frame(1 / 30); },
      cell: (t) => [Math.round(t.x / 3), Math.round(t.y / 3)],
      // Walk onto a thing the way a player does: from the square south of it, one step north.
      stepOnto: (t) => { const c = H.cell(t); G.playerPos = [c[0] * 3, c[1] * 3 + 3]; G.input('up'); G.frame(1 / 30); },
      said: () => { const el = document.getElementById('said'); const t = el.textContent; return t; },
    };
    return new Function('G', 'H', src)(G, H);
  }, src);
}

// ------------------------------------------------------------ random play, every format 2 template
const files = fs.readdirSync(TEMPLATES).filter((n) => n.endsWith('.json'));
const newer = files.filter((f) => JSON.parse(fs.readFileSync(path.join(TEMPLATES, f), 'utf8')).format === 2);
check(newer.length >= 30, `${newer.length} format 2 templates found`);
for (const f of newer) {
  const data = JSON.parse(fs.readFileSync(path.join(TEMPLATES, f), 'utf8'));
  delete data.signature;
  const before = errors.length;
  const st = await start(data);
  if (st.errs.length) { check(false, `${f} is valid: ${st.errs.join(' | ').slice(0, 300)}`); continue; }
  const r = await page.evaluate(() => {
    const G = window.__el.game;
    const keys = ['up', 'down', 'left', 'right', 'space', 'enter', 'clock'];
    let frames = 0; let bad = null;
    try {
      for (; frames < 40 * 30 && G.state === 'event'; frames++) {
        G.frame(1 / 30);
        if (G.state !== 'event') break;
        if (frames % 4 === 0) G.input(keys[Math.floor(Math.random() * keys.length)]);
      }
    } catch (e) { bad = String(e && e.stack || e).slice(0, 600); }
    const state = G.state;
    if (G.state === 'event') G.triggerGameOver();
    return { state, frames, bad };
  });
  check(st.state === 'event' && !r.bad && errors.length === before, `${f} starts and plays ${r.frames} frames at random` + (r.bad ? ': ' + r.bad : '') + (errors.length > before ? ': ' + errors.slice(before).join(' | ').slice(0, 400) : ''));
}

// ------------------------------------------------------------ levels and endings
await start(await baseEvent('memories', { 'clock.on': false, 'ending.kind': 'fixed', 'ending.levels': 2, 'levels.items_fewest': 2, 'levels.items_most': 2 }));
let r = await inGame(`
  const out = { items: G.evItems.length, frags: new Set(G.evItems.map((t) => t.frag)).size, end: G.bEndAfter };
  for (const t of [...G.evItems]) H.stepOnto(t);
  out.level = G.bLevel; out.items2 = G.evItems.length; out.said = H.said(); out.total = G.ev.item.total; out.collected = G.evCollected;
  for (const t of [...G.evItems]) H.stepOnto(t);
  out.state = G.state; out.end2 = H.said();
  return out;`);
check(r.items === 2 && r.frags === 2 && r.end === 2, 'memories: a level\'s items are all out at once, each with its own fragment');
check(r.level === 2 && r.items2 === 2 && /Level 2\./.test(r.said) && r.total === 4 && r.collected === 2, 'finding a level\'s last item begins the next level, announced: ' + r.said.slice(0, 80));
check(r.state === 'game_over' && /You finished every level!/.test(r.end2) && /found 4 .* finished 2 levels/.test(r.end2), 'the last level ends the run and says so: ' + r.end2.slice(0, 140));

// ------------------------------------------------------------ glass cases
await start(await baseEvent('smash', { 'item.at_once': 1, 'item.points': 5, 'cases.extra': 'points', 'cases.points': 20, 'cases.noise': 'chasers',
  'cases.chasers_fewest': 2, 'cases.chasers_most': 2, 'hazards.on_touch': 'lose_points' }));
r = await inGame(`
  const th = G.evItems[0]; const out = { cased: th.cased };
  H.stepOnto(th); out.walked = G.evCollected;
  const c = H.cell(th); G.playerPos = [c[0] * 3 + 3, c[1] * 3]; H.run(0.1); out.near = th.near;
  document.getElementById('said').textContent = '';
  G.input('space'); G.frame(1 / 30);
  out.collected = G.evCollected; out.points = G.evPoints; out.said = H.said(); out.glass = G._bFloorAt([c[0] * 3, c[1] * 3]);
  out.roles = G.evHazards.map((h) => h.role); out.gain = G._bGain(G.evHazards[0], G.evHazards[0].kind);
  return out;`);
check(r.cased && r.walked === 0 && r.near, 'a case is not taken by walking onto it, and its bell rings beside it');
check(r.collected === 1 && r.points === 25 && /20 points\./.test(r.said), 'the attack beside it smashes it: the item at once, and only the reward is said: ' + r.said.slice(0, 60));
check(r.glass === 'glass' && r.roles.join() === 'chaser,chaser' && r.gain < 0.05, 'broken glass is left, and two chasers come, silent at first');

// ------------------------------------------------------------ the listener
await start(await baseEvent('collect', { 'hazards.count': 1, 'hazards.behavior': 'listen', 'hazards.notice_steps': 3, 'hazards.growl_seconds': 1.0,
  'hazards.charge_seconds': 2, 'hazards.speed': 1.0, 'hazards.hearing': 30, 'story.wake': 'It has heard you.' }));
r = await inGame(`
  const L = G.evHazards[0]; const out = { start: L.state };
  G.evElapsed = 10; L.x = 0; L.y = 0; L.face = [0, -1];
  G.playerPos = [9, 0]; H.run(0.2); out.beside = L.state;
  G.playerPos = [0, 6]; H.run(0.2); out.behind = L.state; out.quiet = G._bGain(L, G.ev.hazards);
  G.playerPos = [0, -9]; out.clear = G._bGain(L, G.ev.hazards); H.run(0.1); out.front = L.state; out.said = H.said();
  G.playerPos = [0, -45]; H.run(1.2); out.charge = L.state; H.run(2.2); out.after = L.state; out.y = L.y;
  G.playerPos = [L.x + 12, L.y]; G.bGlassExtra.add(Math.round(G.playerPos[0] / 3) + ',' + Math.round(G.playerPos[1] / 3)); G._bOnStep(); out.glass = L.state;
  return out;`);
check(r.start === 'rest' && r.beside === 'rest' && r.behind === 'rest' && r.quiet === 0.6 && r.clear === 1, 'a listener rests; beside and behind it are safe, and it is quieter from behind');
check(r.front === 'growl' && /It has heard you\./.test(r.said) && r.charge === 'charge' && r.after === 'rest' && r.y < -3, 'in front of it wakes it: a growl, a charge, then it stops where it is');
check(r.glass === 'growl', 'a step on glass within its hearing wakes it');

// ------------------------------------------------------------ walls and floors
await start(await baseEvent('collect', { 'walls.on': true, 'walls.density': 0.22, 'item.at_once': 6, 'hazards.count': 2, 'hazards.behavior': 'hunt', 'hazards.on_touch': 'lose_points' }));
r = await inGame(`
  const out = { walls: G.bWalls.size };
  const home = [Math.round(G.playerPos[0] / 3), Math.round(G.playerPos[1] / 3)];
  out.open = G._bFlood(home, G.bWalls).size; out.cells = G._bCellsAll().length;
  const key = (t) => Math.round(t.x / 3) + ',' + Math.round(t.y / 3);
  out.clear = [...G.evItems, ...G.evHazards].every((t) => !G.bWalls.has(key(t)));
  const n = G.bCells;
  const wall = [...G.bWalls].map((k) => k.split(',').map(Number)).find(([i, j]) => Math.abs(i) < n && Math.abs(j) < n && !G.bWalls.has(i + ',' + (j + 1)));
  G.playerPos = [wall[0] * 3, wall[1] * 3 + 3]; const before = [...G.playerPos]; G.input('up');
  out.stopped = G.playerPos[0] === before[0] && G.playerPos[1] === before[1];
  const c = G.evHazards[0]; let through = false;
  G.playerPos = [-home[0] * 3, -home[1] * 3];
  for (let i = 0; i < 1500; i++) { G._eventMoveHazard(c, 1 / 30); G.evElapsed += 1 / 30; if (G.bWalls.has(key(c))) through = true; }
  out.through = through; out.dist = Math.hypot(c.x - G.playerPos[0], c.y - G.playerPos[1]);
  return out;`);
check(r.walls > 50 && r.open + r.walls === r.cells && r.clear, `a walled room: ${r.walls} walls, every open square reachable, nothing laid in a wall`);
check(r.stopped && !r.through && r.dist < 3.1, 'a wall stops a step, and a creature finds its way round the walls: ended ' + r.dist.toFixed(1) + ' away');
await start(await baseEvent('collect', { 'floor.main': 'ice', 'floor.patch': 'mud', 'floor.patch_share': 0.0 }));
r = await inGame(`
  G.evItems[0].x = 40; G.evItems[0].y = 40; G.playerPos = [0, 0];
  G.input('up'); const out = { slide: [...G.playerPos] };
  G.bPatch.add('0,-3'); G.input('up'); out.mud = [...G.playerPos]; G.input('up'); out.held = [...G.playerPos];
  H.run(0.6); G.input('up'); out.free = G.playerPos[1];
  return out;`);
check(r.slide[1] === -6 && r.mud[1] === -9 && r.held[1] === -9 && r.free < -9, 'ice slides one more step, a slide onto mud stops there, and mud holds a moment');

for (const floor of ['snow', 'water', 'ice', 'mud', 'glass']) {
  await start(await baseEvent('collect', { 'floor.main': floor }));
  r = await inGame(`return { step: G.bStepSound(), has: G.audio.has(G.bStepSound()), smash: G.bSnd.smash, knock: G.audio.has('event_case_knock') };`);
  check(new RegExp('step_' + floor + '_[1-4]').test(r.step) && r.has, `a ${floor} floor's footsteps are its own recordings: ${r.step}`);
}
check(/evt_glass_smash/.test(r.smash) && r.knock, 'a smash is the glass recording, and the knock is in the packs: ' + r.smash);

// ------------------------------------------------------------ kinds of creature
await start(await baseEvent('collect', { 'hazards.count': 1, 'hazards.behavior': 'statue', 'hazards.speed': 2.0, 'hazards.on_touch': 'lose_points',
  'hazards2.count': 1, 'hazards2.behavior': 'run', 'hazards2.points_for_down': 9, 'hazards2.sound': 'enemy',
  'hazards3.count': 1, 'hazards3.behavior': 'throw', 'hazards3.on_touch': 'end_run', 'hazards3.windup_seconds': 1.0, 'hazards3.throw_every_seconds': 2.0 }));
r = await inGame(`
  const [S, R, T] = G.evHazards; const out = { kinds: G.evHazards.map((h) => (h.kind ? h.kind.behavior : 'first')) };
  G.playerPos = [0, 0]; S.x = 30; S.y = 0; R.x = -45; R.y = -45; T.x = 0; T.y = 24; G.evElapsed = 10; G.bLastStepAt = -99; T.timer = 99;
  H.run(1.0); out.still = S.x; G.bLastStepAt = G.evElapsed; H.run(0.3); out.moved = S.x; S.x = 45;
  R.x = 9; R.y = 0; H.run(0.5); out.fled = R.x; R.x = 1; R.y = 0; R.age = 5; const p = G.evPoints; H.run(0.1); out.caught = R.downFor >= 0 && G.evPoints === p + 9;
  T.timer = 0; H.run(0.1); out.windup = T.state; G.playerPos = [6, 0]; H.run(1.2); out.missed = G.state === 'event' && T.state === 'idle';
  T.timer = 0; H.run(1.3); out.hit = G.state;
  return out;`);
check(r.kinds.join() === 'first,run,throw' && r.still === 30 && r.moved < 30 && r.fled > 9 && r.caught, 'three kinds: a statue moves only while you move; a runner flees and is caught by walking into it');
check(r.windup === 'windup' && r.missed && r.hit === 'game_over', 'a thrower winds up; step aside and it misses, stay and it lands');

// ------------------------------------------------------------ the new missions
await start(await baseEvent('song', { 'levels.items_fewest': 3, 'levels.items_most': 3, 'ending.kind': 'fixed', 'ending.levels': 1, 'song.points_per_song': 30, 'fragments.tune': 'ode_to_joy' }));
r = await inGame(`
  const frs = G.evItems.map((t) => t.frag); const played = [];
  const real = G.audio.play; G.audio.play = (name, opts) => { played.push(name); return real(name, opts); };
  H.run(6.0); const out = { pieces: new Set(frs).size, silent: G.evItems.every((t) => !t.channel), calls: frs.every((f) => played.includes(f)) };
  played.length = 0; for (const t of [...G.evItems]) H.stepOnto(t);
  out.whole = played.some((n) => /_0_all$/.test(n)); out.points = G.evPoints; G.audio.play = real; return out;`);
check(r.pieces === 3 && r.silent && r.calls && r.whole && r.points === 33, 'rebuild the song: silent pieces that call, and the whole melody when all are found');
await start(await baseEvent('lure', { 'hazards.count': 1, 'hazards.behavior': 'listen', 'hazards.hearing': 30, 'lure.start_stones': 1, 'lure.throw_steps': 5, 'hazards.growl_seconds': 0.5 }));
r = await inGame(`
  const L = G.evHazards[0]; L.x = 0; L.y = -30; L.face = [0, -1]; G.playerPos = [0, 3]; G.evElapsed = 10;
  G.input('up'); G.input('space'); const out = { carry: G.bCarry, land: G.bPending[0] && G.bPending[0][2] };
  H.run(0.7); out.woke = L.state; out.target = L.target; H.run(9.0); out.rest = L.state; out.y = L.y; return out;`);
check(r.carry === 0 && r.land && r.land[1] === -15 && r.woke === 'growl' && r.target && r.target[1] === -15 && r.rest === 'rest' && Math.abs(r.y + 15) < 2, 'lure: a stone flies the way you last stepped, and a listener goes to where it landed');
await start(await baseEvent('storm', { 'storm.seconds_first': 6, 'storm.seconds_least': 5, 'clock.on': false }));
r = await inGame(`
  H.stepOnto(G.bShelter); const out = { points: G.evPoints, n: G.bShelters, said: H.said() };
  G.playerPos = [0, 0]; G.bShelter.x = 45; G.bShelter.y = 45; H.run(6.5); out.state = G.state; out.end = H.said(); return out;`);
check(r.points === 10 && r.n === 1 && /Shelter 2\./.test(r.said) && r.state === 'game_over' && /The storm caught you\./.test(r.end), 'storm chase: a shelter in time, then the storm: ' + r.end.slice(0, 80));
await start(await baseEvent('silent', { 'silent.first_room': 2, 'hazards.behavior': 'listen', 'floor.patch': 'glass', 'floor.patch_share': 0.3 }));
r = await inGame(`const out = { rest: G.evHazards.map((h) => h.state).join() }; H.stepOnto(G.mExit); out.n = G.evHazards.length; out.said = H.said(); out.points = G.evPoints; return out;`);
check(r.rest === 'rest,rest' && r.n === 3 && /Room 2\./.test(r.said) && r.points === 10, 'silent escape: the way out leads to the next room, with one more listener');

// ------------------------------------------------------------ stages
await start(await baseEvent('collect', { 'item.points': 2 }, [
  { mission: 'collect', item: { total: 1, at_once: 1 }, story: { levels: ['Find the key.'] } },
  { mission: 'storm', ending: { kind: 'fixed', levels: 1 }, storm: { points_per_shelter: 5 } }]));
r = await inGame(`
  const out = { first: G.ev.mission, line: H.said() };
  H.stepOnto(G.evItems[0]); out.second = G.ev.mission; out.state = G.state; out.said = H.said(); out.points = G.evPoints;
  H.stepOnto(G.bShelter); out.end = G.state; out.endSaid = H.said(); return out;`);
check(r.first === 'collect' && /Find the key\./.test(r.line) && r.second === 'storm' && r.state === 'event' && /Stage 2\./.test(r.said) && r.points === 2, 'stages: finishing one begins the next, announced, and the points come with it');
check(r.end === 'game_over' && /You finished every stage!/.test(r.endSaid) && /2 of 2 stages for 7 points/.test(r.endSaid), 'the last stage ends the run with one score: ' + r.endSaid.slice(0, 120));

// ------------------------------------------------------------ the 25 further missions (more.js)
const X = (m, changes = {}) => baseEvent(m, changes);
const put = `const put = (i, j) => { G.playerPos = [i * 3, j * 3]; }; const press = (k) => { G.input(k); G.frame(1 / 30); }; const n = Math.floor(G.arenaLimit / 3);`;
r = await page.evaluate(async () => {
  const { MORE, HELP } = await import('./js/modes/events/more-spec.js');
  const { DEFAULTS, checkEvent } = await import('./js/modes/events/schema.js');
  const bad = [];
  for (const m of Object.keys(MORE)) {
    const ev = structuredClone(DEFAULTS);
    Object.assign(ev, { id: 't', name: 'T', mission: m, start: '2026-01-01T00:00:00Z', end: '2027-01-01T00:00:00Z' });
    if (m === 'sonar') ev.walls.on = true;
    if (m === 'tables') ev.hazards.count = 1;
    delete ev.signature;
    const errs = checkEvent(ev)[1];
    if (errs.length) bad.push(m + ': ' + errs.join(' | '));
  }
  const G = window.__el.game;
  const missing = Object.keys(MORE).filter((m) => !['start', 'status', 'result'].every((part) => typeof G[`_x_${m}_${part}`] === 'function'));
  return { count: Object.keys(MORE).length, bad, missing, help: HELP.length };
});
check(r.count === 25 && !r.bad.length && !r.missing.length && r.help === 25, '25 further missions: each valid by its defaults, with its start, report and results ' + r.bad.concat(r.missing).join(' ; ').slice(0, 300));

await start(await X('redlight'));
r = await inGame(put + `Object.assign(G.x, { green: true, left: 99 }); H.stepOnto(G.x.goal);
  const out = { done: G.xDone, points: G.evPoints, said: H.said() };
  Object.assign(G.x, { green: false, left: 99, redAt: G.evElapsed - 2 }); put(0, 0); press('up'); out.lives = G.xLives;
  press('enter'); out.status = H.said(); return out;`);
check(r.done === 1 && r.points === 10 && /Round 2\./.test(r.said) && r.lives === 2 && /Round 2\. Red light\. 2 lives\./.test(r.status), 'red light, green light: the goal scores; a step in the silence costs a life');
await start(await X('mines'));
r = await inGame(put + `const out = { start: G.playerPos[1] === n * 3 && G.x.goal.y === -n * 3 };
  G.x.mines = new Set([(1) + ',' + (n - 2), (-1) + ',' + (n - 2)]); G.xPending = []; put(0, n); press('up');
  out.clicks = G.xPending.filter((e) => e[4] === 'click').length;
  G.x.mines = new Set(['0,' + (n - 2)]); press('up'); out.lives = G.xLives; out.left = G.x.mines.size;
  G.x.mines = new Set(); H.stepOnto(G.x.goal); out.done = G.xDone; out.points = G.evPoints; out.back = G.playerPos[1] === n * 3; return out;`);
check(r.start && r.clicks === 2 && r.lives === 2 && r.left === 0 && r.done === 1 && r.points === 20 && r.back, 'minefield: clicks count the mines beside you; a mine costs a life; the goal begins a new field');
await start(await X('stones', { 'stones.first_length': 4 }));
r = await inGame(put + `const path = G.x.path.map((c) => [...c]); const out = { len: path.length, notes: G.xPending.filter((e) => e[4] === 'stone').length };
  press('up'); out.held = G.playerPos[1] === n * 3; G.x.until = 0;
  const go = (c) => { const pi = Math.round(G.playerPos[0] / 3), pj = Math.round(G.playerPos[1] / 3); press({ '0,-1': 'up', '1,0': 'right', '-1,0': 'left' }[(c[0] - pi) + ',' + (c[1] - pj)]); };
  for (const c of path) go(c);
  out.done = G.xDone; out.points = G.evPoints; out.next = G.x.path.length; return out;`);
check(r.len === 4 && r.notes === 4 && r.held && r.done === 1 && r.points === 15 && r.next === 5, 'stepping stones: the path is played, then walked from memory; the next is longer');
await start(await X('pong'));
r = await inGame(put + `H.run(1.2); const b = G.x.ball; const out = { served: Boolean(b) && G.x.vy > 0 };
  put(0, 1); b.x = 0; b.y = 2; Object.assign(G.x, { vx: 0, vy: 9 }); H.run(0.3); out.hit = G.xDone; out.back = G.x.vy < 0;
  b.x = 9; b.y = 2; Object.assign(G.x, { vx: 0, vy: 9 }); H.run(0.3); out.lives = G.xLives; out.gone = G.x.ball === null; return out;`);
check(r.served && r.hit === 1 && r.back && r.lives === 2 && r.gone, 'bat and ball: in its line it is hit back; out of its line costs a life');
await start(await X('rival', { 'item.total': 2, 'item.at_once': 1 }));
r = await inGame(`for (let k = 0; k < 2 && G.state === 'event'; k++) { const it = G.evItems[0]; G.x.rival.x = it.x + 1; G.x.rival.y = it.y; H.run(0.1); }
  return { state: G.state, said: H.said() };`);
check(r.state === 'game_over' && /the rival took 2\. The rival wins\./.test(r.said), 'race a rival: the rival takes items, and the shared total ends the run: ' + r.said.slice(0, 90));
await start(await X('thief', { 'thief.treasures': 2 }));
r = await inGame(put + `put(0, 0); H.run(2.2); const t = G.x.thief; const out = { came: Boolean(t) };
  const goal = G.x.treasures.reduce((a, b) => (Math.hypot(a.x - t.x, a.y - t.y) < Math.hypot(b.x - t.x, b.y - t.y) ? a : b));
  G.playerPos = [goal.x < 0 ? goal.x + 30 : goal.x - 30, goal.y]; t.x = goal.x + 0.2; t.y = goal.y; H.run(0.1); out.held = goal.state; out.flee = t.state;
  G.playerPos = [t.x, t.y + 1]; H.run(0.05); out.done = G.xDone; out.home = goal.state; out.points = G.evPoints; return out;`);
check(r.came && r.held === 'held' && r.flee === 'flee' && r.done === 1 && r.home === 'home' && r.points === 10, 'catch the thief: it takes a treasure and runs; walking into it brings the treasure back');
await start(await X('boss', { 'boss.health': 2, 'boss.stalk_seconds': 2, 'boss.tired_seconds': 3 }));
r = await inGame(put + `const b = G.x.boss; put(0, 0); b.x = 0; b.y = -30; H.run(1.0); const out = { stalk: b.state };
  press('space'); H.run(0.5); out.hp = G.x.hp; H.run(0.7); out.roar = b.state; H.run(1.3); out.charge = b.state; put(4, 0); H.run(3.5); out.tired = b.state;
  G.playerPos = [b.x, b.y + 9]; press('space'); out.hp2 = G.x.hp; press('space'); out.done = G.xDone; out.points = G.evPoints; out.said = H.said(); return out;`);
check(r.stalk === 'stalk' && r.hp === 2 && r.roar === 'roar' && r.charge === 'charge' && r.tired === 'tired' && r.hp2 === 1 && r.done === 1 && r.points === 54 && /Boss 2\./.test(r.said), 'boss: it stalks, roars, charges and tires; only then do shots hurt');
await start(await X('escort', { 'escort.raiders': 1 }));
r = await inGame(`const f = G.x.friend, home = G.x.home, rd = G.x.raiders[0]; const out = { sides: f.x === -home.x };
  rd.downFor = 0; rd.timer = 99; const x0 = f.x; G.playerPos = [f.x > 0 ? f.x - 60 : f.x + 60, f.y]; H.run(1.0); out.waits = f.x === x0;
  G.playerPos = [f.x, f.y + 3]; H.run(1.0); out.walks = Math.abs(f.x - x0) > 1;
  rd.downFor = rd.timer; H.run(0.05); G.playerPos = [rd.x, rd.y + 9]; G.input('space'); out.shot = rd.downFor >= 0 && G.evPoints === 2;
  rd.downFor = 0; rd.timer = 99; f.x = home.x + 0.5; f.y = home.y; G.playerPos = [f.x, f.y + 3]; H.run(0.5); out.done = G.xDone; out.said = H.said(); return out;`);
check(r.sides && r.waits && r.walks && r.shot && r.done === 1 && /Trip 2\./.test(r.said), 'escort: the friend walks only while you are near; raiders can be shot; home scores');
await start(await X('gallery', { 'gallery.friend_share': 0, 'gallery.misses_allowed': 1 }));
r = await inGame(put + `put(0, 0); H.run(1.2); let t = G.x.target; const out = { up: Boolean(t) && t.y === -15 };
  G.playerPos = [t.x, 0]; press('space'); out.hit = G.xDone; H.run(1.0); G.x.target.timer = 0.01; H.run(0.1); out.state = G.state; out.said = H.said(); return out;`);
check(r.up && r.hit === 1 && r.state === 'game_over' && /Too many targets got away\. You hit 1 target/.test(r.said), 'shooting gallery: a lined-up shot hits; targets that get away end the run');
await start(await X('odd'));
r = await inGame(`const th = G.x.silent; const out = { k: th.length, notes: new Set(th.map((t) => t.note)).size };
  H.stepOnto(th.find((t) => t.role === 'same')); out.lives = G.xLives; H.stepOnto(G.x.silent.find((t) => t.role === 'odd'));
  out.done = G.xDone; out.next = G.x.silent.length; return out;`);
check(r.k === 3 && r.notes === 2 && r.lives === 2 && r.done === 1 && r.next === 4, 'odd one out: one of three is pitched apart; the wrong one costs a life, the odd one scores');
await start(await X('cover', { 'cover.streak': 2, 'cover.streak_bonus': 5, 'cover.squares_to_cover': 3 }));
r = await inGame(put + `put(0, 0); G.x.seen = new Set(['0,0']); press('up'); const out = { one: G.evPoints }; press('down'); out.same = G.evPoints; press('left'); press('left');
  out.state = G.state; out.said = H.said(); return out;`);
check(r.one === 1 && r.same === 1 && r.state === 'game_over' && /You covered them all! You covered 3 squares for 8 points\./.test(r.said), 'cover the ground: new squares score, old ones do not, a streak earns its bonus');
await start(await X('sonar', { 'walls.on': true, 'sonar.pings': 2 }));
r = await inGame(put + `const ex = G.x.exit; const out = { silent: ex.channel === null && G.bWalls.size > 10 };
  G.bWalls = new Set(['0,-1', '1,0', '9,9']); put(0, 0); G.xPending = []; press('space'); out.pings = G.xPending.filter((e) => e[4] === 'ping').length; out.left = G.x.pings;
  G.bWalls = new Set(); H.stepOnto(ex); out.done = G.xDone; out.walls = G.bWalls.size > 10; out.said = H.said(); return out;`);
check(r.silent && r.pings === 3 && r.left === 1 && r.done === 1 && r.walls && /Maze 2\./.test(r.said), 'sonar maze: a ping is answered by the walls near you and the way out; the way out builds a new maze');
await start(await X('courier'));
r = await inGame(`const sh = G.x.shelves, cu = G.x.customer; const out = { row: sh.map((t) => Math.round(t.x / 3)).join(), south: cu.y >= 0 };
  H.stepOnto(cu); H.stepOnto(sh[(cu.role + 1) % 4]); G.evPoints = 7; H.stepOnto(cu); out.wrong = G.evPoints;
  H.stepOnto(sh[cu.role]); H.stepOnto(cu); out.done = G.xDone; out.points = G.evPoints; out.next = G.x.customer !== cu; return out;`);
check(r.row === '-3,-1,1,3' && r.south && r.wrong === 2 && r.done === 1 && r.points === 12 && r.next, 'courier: the wrong thing loses points, the right one scores and brings a new customer');
await start(await X('dance'));
r = await inGame(put + `const seq = [...G.x.seq]; const names = ['up', 'right', 'down', 'left']; const out = { len: seq.length };
  press('up'); out.still = G.playerPos[0] === 0 && G.playerPos[1] === 0; H.run(0.9 + 3 * 0.7 + 0.2); out.phase = G.x.phase;
  press(names[(seq[0] + 1) % 4]); out.lives = G.xLives; H.run(0.9 + 3 * 0.7 + 0.2); for (const d of seq) press(names[d]);
  out.done = G.xDone; out.points = G.evPoints; out.next = G.x.seq.length; return out;`);
check(r.len === 3 && r.still && r.phase === 'answer' && r.lives === 2 && r.done === 1 && r.points === 6 && r.next === 4, 'dance steps: the row is called, then repeated with swipes; a wrong one costs a life');
await start(await X('tag'));
r = await inGame(put + `const it = G.x.it; put(0, 0); for (const t of G.x.players) { t.x = 30; t.y = 30; } H.run(2.0); const out = { points: G.evPoints > 1.8 && G.evPoints < 2.2 };
  H.run(1.2); it.x = 1; it.y = 0; H.run(0.05); out.you = G.x.it === null; out.said = H.said(); const o = G.x.players[1]; H.run(2.2);
  o.x = G.playerPos[0] + 1; o.y = G.playerPos[1]; H.run(0.05); out.passed = G.x.it === o; out.said2 = H.said(); return out;`);
check(r.points && r.you && /You are it\./.test(r.said) && r.passed && /Tagged\./.test(r.said2), 'tag: not being it scores; a touch makes you it; walking into one passes it on');
await start(await X('crossing'));
r = await inGame(put + `const cars = G.x.cars; const out = { lanes: G.x.lanes, rows: cars.map((t) => Math.round(t.y / 3)).sort((a, b) => a - b).join() === [n - 4, n - 3, n - 2].join() };
  for (const t of cars) { t.timer = 0; t.x = -30; } const c = cars[0]; G.playerPos = [0, c.y]; c.x = 1; H.run(0.05); out.lives = G.xLives; out.back = G.playerPos[1] === n * 3;
  c.x = -30; G.playerPos = [6, (G.x.goalRow + 1) * 3]; press('up'); out.done = G.xDone; out.next = G.x.lanes; return out;`);
check(r.lanes === 3 && r.rows && r.lives === 2 && r.back && r.done === 1 && r.next === 4, 'crossing the road: a car in your square costs a life; the far side brings a wider road');
await start(await X('mirror'));
r = await inGame(put + `const tw = G.x.twin; put(0, 0); tw.x = 9; tw.y = 9; G.x.target.x = -27; G.x.target.y = -27; press('up'); const out = { south: tw.y === 12 }; press('left'); out.east = tw.x === 12;
  tw.x = 9; tw.y = 9; const old = G.x.target; old.x = 9; old.y = 12; press('up'); out.done = G.xDone; out.moved = G.x.target !== old; return out;`);
check(r.south && r.east && r.done === 1 && r.moved, 'mirror twin: it steps the opposite way; on the spot it scores');
await start(await X('march', { 'march.misses_allowed': 3 }));
r = await inGame(put + `put(0, 0); G.evItems[0].x = 27; G.evItems[0].y = 27; H.run(3.9); const out = { countIn: G.x.beats === 4 && G.x.misses === 0 };
  while (G.x.beats < 5) G.frame(1 / 30); press('up'); H.run(0.5); out.inStep = G.x.misses === 0; H.run(0.9); out.missed = G.x.misses === 1; return out;`);
check(r.countIn && r.inStep && r.missed, 'march in time: four beats to get ready; a step on the beat is in step, a beat with no step is not');
await start(await X('count'));
r = await inGame(put + `const num = G.x.number; const out = { chimes: G.xPending.filter((e) => e[4] === 'chime').length === num };
  G.x.until = 0; for (let k = 0; k < num; k++) press('up'); press('space'); out.done = G.xDone; out.back = G.playerPos[1] === n * 3;
  G.x.until = 0; const now = G.x.number; press('space'); out.lives = G.xLives; out.said = H.said().includes('It was ' + now + '.'); return out;`);
check(r.chimes && r.done === 1 && r.back && r.lives === 2 && r.said, 'count the chimes: as many steps as chimes scores; a wrong count costs a life and is told');
await start(await X('tide'));
r = await inGame(put + `const out = { row: G.x.row === n + 2, treasures: G.x.treasures.length }; G.x.nextRise = G.evElapsed; H.run(0.05); out.rose = G.x.row === n + 1;
  G.x.row = n + 9; G.x.nextRise = G.evElapsed + 99; H.stepOnto(G.x.treasures[0]); out.points = G.evPoints; H.stepOnto(G.x.goal); out.done = G.xDone;
  G.x.row = n; H.run(0.05); out.state = G.state; out.said = H.said(); return out;`);
check(r.row && r.treasures === 4 && r.rose && r.points === 5 && r.done === 1 && r.state === 'game_over' && /The tide caught you\. You outran 1 tide for 25 points\./.test(r.said), 'rising tide: the water rises behind you; high ground scores; the water ends the run');
await start(await X('snake'));
r = await inGame(put + `put(0, 0); G.evItems[0].x = 27; G.evItems[0].y = 27; Object.assign(G.x, { prev: '0,0', tail: [] }); for (let k = 0; k < 3; k++) press('up');
  const out = { tail: G.x.tail.join(' ') }; G._x_snake_taken(null, G.ev.snake); out.length = G.x.length; press('down'); out.state = G.state; out.said = H.said(); return out;`);
check(r.tail === '0,-1 0,-2' && r.length === 4 && r.state === 'game_over' && /You stepped on your own tail\./.test(r.said), 'snake: the tail follows, items lengthen it, and stepping on it ends the run');
await start(await X('push'));
r = await inGame(put + `const c = G.x.crate, t = G.x.target; c.x = 0; c.y = 0; t.x = 0; t.y = -6; put(0, 1); press('up'); const out = { pushed: c.y === -3 && G.playerPos[1] === 0 };
  press('up'); out.done = G.xDone; out.points = G.evPoints; const c2 = G.x.crate; G.x.target.x = 27; G.x.target.y = 27; c2.x = 0; c2.y = -n * 3; put(0, -n + 1); press('up');
  out.stuck = c2.y === -n * 3 && G.playerPos[1] === (-n + 1) * 3; press('space'); out.reset = G.evPoints === 10; return out;`);
check(r.pushed && r.done === 1 && r.points === 15 && r.stuck && r.reset, 'push the crate: it moves a square when walked into, not into the edge; the attack puts it somewhere new');
await start(await X('code'));
r = await inGame(`const pads = G.x.pads, order = G.x.order; const out = { ring: pads.length === 3 && pads[0].y === -9 };
  H.stepOnto(pads[order[1]]); out.tries = G.x.tries; for (const k of order) H.stepOnto(pads[k]); out.done = G.xDone; out.points = G.evPoints; out.next = G.x.pads.length; return out;`);
check(r.ring && r.tries === 1 && r.done === 1 && r.points === 19 && r.next === 4, 'crack the code: a wrong pad starts the order again; the whole order scores, less the wrong tries');
await start(await X('tables', { 'hazards.count': 1, 'hazards.on_touch': 'lose_points', 'hazards.behavior': 'hunt' }));
r = await inGame(put + `put(0, 0); G.evItems[0].x = -27; G.evItems[0].y = -27; const b = G.evHazards[0]; b.x = 27; b.y = 27; H.run(3.2); G.x.nextPower = 0.01; H.run(0.05);
  const out = { power: Boolean(G.x.power) }; b.x = 27; b.y = 27; H.stepOnto(G.x.power); out.powered = G._xPowered(); G.playerPos = [0, 0]; b.x = 9; b.y = 0; H.run(1.0); out.flees = b.x > 10;
  b.x = 1; b.y = 0; b.age = 9; G.evPoints = 0; H.run(0.05); out.down = b.downFor >= 0 && G.evPoints === 10; G.x.until = G.evElapsed - 0.01; H.run(0.05); out.back = b.downFor < 0; return out;`);
check(r.power && r.powered && r.flees && r.down && r.back, 'turn the tables: with the power the creatures run and can be brought down; then they come back');
await start(await X('map'));
r = await inGame(put + `const said = G.x.said; const out = { said: H.said().includes(said) && said.includes('step') }; const [i, j] = G.x.target.split(',').map(Number);
  put(i, j); G.evPoints = 0; press('space'); out.done = G.xDone; out.points = G.evPoints; out.fresh = typeof G.x.target === 'string'; press('enter'); out.repeat = H.said().includes(G.x.said); return out;`);
check(r.said && r.done === 1 && r.points === 15 && r.fresh && r.repeat, 'treasure map: spoken directions lead to the square to dig; the report repeats them');
await start(await baseEvent('collect', {}, [{ mission: 'cover', cover: { squares_to_cover: 2 } }, { mission: 'map', ending: { kind: 'fixed', levels: 1 } }]));
r = await inGame(put + `const log = []; const speak = G.tts.speak; G.tts.speak = function (t, o) { if (t) log.push(t); return speak.call(this, t, o); };
  press('up'); press('up'); const out = { second: G.ev.mission, said: log.join(' | ') }; const [i, j] = G.x.target.split(',').map(Number); put(i, j); press('space');
  G.tts.speak = speak; out.state = G.state; out.end = H.said(); return out;`);
check(r.second === 'map' && /Stage 2\. \| \d+ steps? /.test(r.said) && r.state === 'game_over' && /You finished every stage!/.test(r.end), 'the further missions work as stages, and directions follow the stage number: ' + r.said.slice(0, 80));
r = await page.evaluate(async () => {
  const { eventHelp } = await import('./js/modes/events/help.js');
  const all = eventHelp(); const titles = all.map((e) => e.title);
  const mine = all.slice(titles.indexOf('Events Red Light, Green Light'), titles.indexOf('Events Treasure Map') + 1);
  const keys = mine.filter((e) => /\b(Space|Enter|arrows?)\b/.test(e.desc)).map((e) => e.title + ': ' + e.desc.match(/[^.]*\b(Space|Enter|arrows?)\b[^.]*/)[0]);
  return { n: mine.length, keys, before: titles.indexOf('Events Treasure Map') < titles.indexOf('Events No Clock') };
});
check(r.n === 25 && !r.keys.length && r.before, 'the help has the 25 missions, in gestures: ' + r.keys.join(' | ').slice(0, 300));

// ------------------------------------------------------------ an event from a newer version still
r = await page.evaluate(async () => {
  const { DEFAULTS, newerStub, checkEvent } = await import('./js/modes/events/schema.js');
  const ev = structuredClone(DEFAULTS);
  Object.assign(ev, { id: 'from-the-future', name: 'Later', format: 3, start: '2026-01-01T00:00:00Z', end: '2027-01-01T00:00:00Z' });
  const stub = newerStub(ev);
  const G = window.__el.game;
  return { errs: checkEvent(ev)[1].length, stub: Boolean(stub && stub._website_only), line: stub ? G._eventLine(['event', stub]) : '' };
});
check(r.errs > 0 && r.stub && /needs a newer version of the game/.test(r.line), 'an event of a newer format is listed, with what to do: ' + r.line.slice(0, 90));

// ------------------------------------------------------------ Trapped in Darkness: creatures by level, and a charge that is heard
const TID = JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'trapped-in-darkness.json'), 'utf8'));
await start(TID);
r = await inGame(`
  const counts = [G.evHazards.length]; const own = []; let glass = G.bPatch.size + G.bGlassExtra.size;
  for (let level = 0; level < 5 && G.state === 'event'; level++) {
    own.push(new Set(G.evItems.map((t) => t.beacon)).size === G.evItems.length);
    for (const t of [...G.evItems]) { t.cased = false; G._eventTakeItem(t); }
    if (G.state !== 'event') break;
    counts.push(G.evHazards.filter((c) => c.role !== 'chaser').length);
  }
  return { counts, own, glass };`);
check(r.counts.slice(0, 4).join() === '1,2,3,3' && Math.max(...r.counts) === 3, 'Trapped in Darkness: one creature on level 1, one more each level, never more than three: ' + r.counts.join(', '));
check(r.own.every(Boolean) && r.glass === 0, 'each memory on a level has a sound of its own, and no glass lies on the floor before a case is smashed');
await start(TID);
r = await inGame(`
  const L = G.evHazards[0]; const hz = G.ev.hazards;
  L.x = 0; L.y = -30; L.face = [0, 1]; G.playerPos = [0, 30]; G.evElapsed = 10;
  const played = []; const shot = G._bShotAt.bind(G);
  G._bShotAt = (name, pos, gain = 1.0) => { played.push([String(name), pos[0], pos[1]]); return shot(name, pos, gain); };
  H.run(1.0);
  const resting = played.filter((p) => p[0].startsWith('step')).length;
  G._bWake(L, hz); H.run(hz.growl_seconds + 0.1);
  const state = L.state; played.length = 0; const y0 = L.y;
  H.run(2.0);
  const steps = played.filter((p) => p[0].startsWith('step'));
  G._bShotAt = shot;
  return { resting, state, steps: steps.length, ran: Math.abs(L.y - y0) / 3, from: steps.every((p) => Math.abs(p[1] - L.x) < 3.1 && p[2] <= L.y + 0.1) };`);
check(r.resting === 0 && r.state === 'charge', 'a creature at rest makes no footsteps, and after its growl it charges');
check(r.steps >= 3 && Math.abs(r.steps - r.ran) <= 1.5 && r.from, `a charging creature's footsteps are heard from where it is, one for each step it runs: ${r.steps} over ${r.ran.toFixed(1)} steps`);
r = await page.evaluate(async () => {
  const { checkEvent, DEFAULTS } = await import('./js/modes/events/schema.js');
  const ev = Object.assign(structuredClone(DEFAULTS), { id: 'test-event', name: 'Test', mission: 'collect', start: '2026-01-01T00:00:00Z', end: '2027-01-01T00:00:00Z' });
  ev.levels.on = true; ev.hazards.count = 4; ev.levels.creatures_most = 3;
  return { def: DEFAULTS.levels.creatures_most, errs: checkEvent(ev)[1] };
});
check(r.def === 0 && r.errs.some((e) => /fewer than the creatures the event starts with/.test(e)), 'the most creatures on a level is off unless set, and one below the starting creatures is refused in words');

// ------------------------------------------------------------ unlimited shots
const HUNT = { 'weapon.enabled': true, 'hazards.count': 2, 'hazards.can_be_shot': true, 'hazards.respawn_seconds': 5, 'hazards.speed': 0.2, 'hunt.ammo_every_seconds': 1 };
const SHOOT = `
  const played = []; const play = G.audio.play.bind(G.audio);
  G.audio.play = (n, ...a) => { played.push(n); return play(n, ...a); };
  for (let i = 0; i < 40; i++) { G.input('space'); G.frame(1 / 30); }
  H.run(5);
  document.getElementById('said').textContent = '';
  G.input('enter'); G.frame(1 / 30);
  const out = { lasers: played.filter((n) => n === 'laser').length, clicks: played.filter((n) => n === 'empty_click').length,
    shots: G.evShots, ammo: G.mAmmo.length, beacons: played.filter((n) => n === 'ammo_beacon').length, said: H.said(), state: G.state };
  G.audio.play = play;
  return out;`;
await start(await baseEvent('hunt', { ...HUNT, 'weapon.start_shots': 2 }));
r = await inGame(SHOOT);
check(r.lasers === 2 && r.clicks === 38 && r.beacons > 0 && / shots?\./.test(r.said) && !/Unlimited/.test(r.said),
  `without unlimited shots, two shots are two lasers, then the empty click, and ammo boxes appear: ${r.lasers} lasers, ${r.clicks} clicks; ` + r.said.slice(0, 70));
await start(await baseEvent('hunt', { ...HUNT, 'weapon.start_shots': 2, 'weapon.unlimited_shots': true }));
r = await inGame(SHOOT);
check(r.lasers === 40 && r.clicks === 0 && r.shots === 2, `with unlimited shots, forty shots are forty lasers and never the empty click: ${r.lasers} lasers, ${r.clicks} clicks`);
check(r.ammo === 0 && r.beacons === 0 && /Unlimited shots\./.test(r.said) && !/ 2 shots/.test(r.said), 'no ammo boxes appear, and the status says unlimited shots: ' + r.said.slice(0, 80));
await start(await baseEvent('hunt', { ...HUNT, 'weapon.start_shots': 0, 'weapon.unlimited_shots': true, 'clock.on': false, 'hazards.respawn_seconds': 0, 'hazards.on_touch': 'lose_points', 'hunt.ammo_every_seconds': 0 }));
r = await inGame(`H.run(3); return { state: G.state };`);
check(r.state === 'event', 'a hunt with no clock and unlimited shots does not end for want of shots');
await start(await baseEvent('collect', { 'weapon.enabled': true, 'weapon.unlimited_shots': true, 'supplies.ammo_every_seconds': 1 }));
r = await inGame(`
  H.run(6);
  const out = { ammo: G.bSupplies.filter((t) => t.role === 'ammo').length, before: G.evPoints };
  document.getElementById('said').textContent = '';
  G._bReward({ extra: 'shots', shots: 5, seconds: 10, points: 40, random_kinds: ['shots'] });
  out.after = G.evPoints; out.shots = G.evShots; out.said = H.said();
  return out;`);
check(r.ammo === 0 && r.after === r.before + 40 && r.shots === 8 && !/shot/.test(r.said), 'with unlimited shots no ammo supplies appear, and a reward of shots is points: ' + r.said.slice(0, 40));
r = await page.evaluate(async () => {
  const { checkEvent, DEFAULTS } = await import('./js/modes/events/schema.js');
  const make = (weapon) => Object.assign(structuredClone(DEFAULTS), { id: 'test-event', name: 'Test', mission: 'collect',
    start: '2026-01-01T00:00:00Z', end: '2027-01-01T00:00:00Z', weapon });
  return { def: DEFAULTS.weapon.unlimited_shots, off: checkEvent(make({ enabled: false, start_shots: 8, unlimited_shots: true }))[1],
    bad: checkEvent(make({ enabled: true, start_shots: 8, unlimited_shots: 'yes' }))[1],
    old: checkEvent(make({ enabled: true, start_shots: 8 }))[1], ok: checkEvent(make({ enabled: true, start_shots: 8, unlimited_shots: true }))[1] };
});
check(r.def === false && r.old.length === 0 && r.ok.length === 0, 'unlimited shots is off unless an event turns it on, and an older file without it is still valid');
check(r.off.some((e) => /Unlimited shots needs the weapon/.test(e)) && r.bad.some((e) => /Unlimited shots on or off must be true or false/.test(e)), 'unlimited shots with the weapon off, or not true or false, is refused in words');

check(errors.length === 0, 'no errors in the page: ' + errors.slice(0, 3).join(' | ').slice(0, 500));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
