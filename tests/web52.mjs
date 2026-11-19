// What web 5.2.0 added, end to end in Chromium (through the Playwright stand-in):
// Shattered Heaven (Smash and grab with an exit, chasers of their own, weighted and
// ranged rewards), the pause after a climb, the mono copies of looping event sounds,
// old chasers unchanged, the lives in The Jewel Heist's report, and the home page
// Alert for Windows 3.1.0 (since web 6.0.0, for Windows 4.0.0).
//   node web52.mjs http://localhost:8774 <the Windows repository, or its Developer Tools/templates folder>
// It reads only templates (shattered-heaven.json, jewel-heist.json), never a published
// event, whose file name changes whenever the developer restarts it.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const base = process.argv[2] || 'http://localhost:8774';
let dir = process.argv[3] || '.';
if (fs.existsSync(path.join(dir, 'Developer Tools', 'templates'))) dir = path.join(dir, 'Developer Tools', 'templates');
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext();
await context.route('https://api.github.com/**', (route) => route.fulfill({
  status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 180000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu', null, { timeout: 30000 });
check(true, 'game started');

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
    for (let i = 0; i < 400 && G.state !== 'event'; i++) await new Promise((res) => setTimeout(res, 50));
    return { state: G.state, errs: [] };
  }, data);
}

async function inGame(src) {
  return page.evaluate((src) => {
    const G = window.__el.game;
    const H = {
      run: (seconds) => { for (let i = 0; i < Math.round(seconds * 30) && G.state === 'event'; i++) G.frame(1 / 30); },
      settle: () => { for (let i = 0; i < 200 && G.evClimbHold > 0 && G.state === 'event'; i++) G.frame(1 / 30); },
      cell: (t) => [Math.round(t.x / 3), Math.round(t.y / 3)],
      stepOnto: (t) => { const c = H.cell(t); G.playerPos = [c[0] * 3, c[1] * 3 + 3]; G.input('up'); G.frame(1 / 30); },
      beside: (t) => { G.playerPos = [t.x, t.y + 3]; },
      said: () => document.getElementById('said').textContent,
    };
    return new Function('G', 'H', src)(G, H);
  }, src);
}

const tpl = JSON.parse(fs.readFileSync(path.join(dir, 'shattered-heaven.json'), 'utf8'));
delete tpl.signature;
const st = await start(tpl);
check(st.state === 'event' && !st.errs.length, `Shattered Heaven starts on the website: ${JSON.stringify(st)}`);

const room = await inGame(`
  const cases = G.evItems.filter((t) => t.cased);
  return { n: cases.length, all: cases.length === G.evItems.length, exit: !!G.bExit, open: G.bExitOpen, shots: G.evShots,
    exitMono: (() => { const b = G.audio.buffers.get('dry:' + G.bExit.beacon) || null; return b ? b.numberOfChannels : -1; })() };
`);
check(room.n >= 3 && room.n <= 9 && room.all, `the room's cases are all out at once, 3 to 9: ${room.n}`);
check(room.exit && !room.open, 'the exit is there and locked');
check(room.shots === 6, `six shots to start: ${room.shots}`);

const mono = await inGame(`
  const out = {};
  for (const [k, b] of G.audio.buffers) if (/^dry:event_beacon(_hazard)?_file_/.test(k)) out[k] = b.numberOfChannels;
  return out;
`);
check(Object.keys(mono).length > 0 && Object.values(mono).every((n) => n === 1), `looping event recordings are mono copies: ${JSON.stringify(mono)}`);

const locked = await inGame(`H.stepOnto(G.bExit); return { level: G.bLevel, exit: !!G.bExit };`);
check(locked.level === 1 && locked.exit, 'stepping onto the locked exit does not leave the room');

const smash = await inGame(`
  G.playerPos = [0, 0]; H.run(0.2);
  const t0 = G.timeLeft; const s0 = G.evShots;
  const c = G.evItems.find((t) => t.cased);
  H.beside(c); G.input('space'); G.frame(1 / 30);
  const ch = G.evHazards.filter((t) => t.role === 'chaser');
  return { n: ch.length, beacons: ch.map((t) => t.beacon), shots: G.evShots - s0, secs: Math.round(G.timeLeft - t0), own: ch.length && ch[0].kind.own_chaser };
`);
check(smash.n >= 2 && smash.n <= 3, `a smash brings 2 or 3 chasers: ${smash.n}`);
check(smash.beacons.every((b) => /ghost_whispers/.test(b)), `they sound like ghosts: ${smash.beacons}`);
check(smash.shots === 5 || (smash.secs >= 14 && smash.secs <= 46), `the case gave 5 shots or 15 to 45 seconds: ${smash.shots} shots, ${smash.secs} s`);

const shot = await inGame(`
  const ch = G.evHazards.filter((t) => t.role === 'chaser' && t.downFor < 0);
  const c = ch[0];
  for (const t of ch.slice(1)) { t.x = G.playerPos[0] + 40; t.y = G.playerPos[1] + 40; }
  c.x = G.playerPos[0]; c.y = G.playerPos[1] - 9;
  if (G._turnsNow && G._turnsNow()) { /* events keep north ahead */ }
  const p0 = G.evPoints; const s0 = G.evShots;
  G.input('space'); G.frame(1 / 30);
  return { down: c.downFor >= 0, pts: G.evPoints - p0, used: s0 - G.evShots };
`);
check(shot.down && shot.pts === 5 && shot.used === 1, `one shot brings a ghost down, for five points: ${JSON.stringify(shot)}`);

const touch = await inGame(`
  const t = G.evHazards.find((h) => h.role === 'chaser' && h.downFor < 0);
  if (!t) return null;
  G.evElapsed = Math.max(G.evElapsed, 10);
  t.x = G.playerPos[0] + 0.5; t.y = G.playerPos[1]; t.age = 99;
  const before = G.timeLeft;
  G.frame(1 / 30);
  return { lost: before - G.timeLeft, gone: !G.evHazards.includes(t) };
`);
check(touch && touch.lost > 9.5 && touch.lost < 10.6 && touch.gone, `a ghost's touch costs ten seconds and it vanishes: ${JSON.stringify(touch)}`);

const opened = await inGame(`
  for (const c of G.evItems.filter((t) => t.cased)) { H.beside(c); G.input('space'); G.frame(1 / 30); }
  G.reportEvent && G.reportEvent();
  return { open: G.bExitOpen, state: G.state, cases: G.evItems.filter((t) => t.cased).length };
`);
check(opened.open && opened.state === 'event' && opened.cases === 0, `every case smashed: the exit opens: ${JSON.stringify(opened)}`);

const next = await inGame(`
  H.stepOnto(G.bExit);
  const r = { level: G.bLevel, hold: G.evClimbHold, t0: G.timeLeft, pos: [...G.playerPos] };
  G.input('up');
  H.run(0.5);
  r.clockMoved = Math.abs(G.timeLeft - r.t0);
  r.moved = G.playerPos[0] !== r.pos[0] || G.playerPos[1] !== r.pos[1];
  H.settle();
  r.cases = G.evItems.filter((t) => t.cased).length; r.exit = !!G.bExit; r.open = G.bExitOpen;
  return r;
`);
check(next.level === 2, `walking out starts the next room: level ${next.level}`);
check(next.hold > 1.0, `the next room waits for the climb and half a second: ${next.hold}`);
check(next.clockMoved < 0.01, `the clock waits during the climb: ${next.clockMoved}`);
check(!next.moved, 'the player cannot move during the climb');
check(next.cases >= 3 && next.cases <= 9 && next.exit && !next.open, `the new room has its cases and a locked exit: ${JSON.stringify(next)}`);

const ended = await inGame(`G.timeLeft = 0.05; H.run(0.3); return { state: G.state, said: H.said() };`);
check(ended.state !== 'event' && /You escaped 1 room and smashed/.test(ended.said), `the run ends with rooms escaped: ${ended.said.slice(-160)}`);

// Old chasers keep the old rules, and (one switch for shooting) with the laser on they
// can be shot, even when the first kind says it cannot: set up as the first Pumpkin Hunt,
// Second Addition was, from the Jewel Heist template.
const jewel = JSON.parse(fs.readFileSync(path.join(dir, 'jewel-heist.json'), 'utf8'));
delete jewel.signature;
{
  const pumpkin = structuredClone(jewel);
  pumpkin.hazards = Object.assign({}, pumpkin.hazards, { can_be_shot: false });
  const sp = await start(pumpkin);
  check(sp.state === 'event', 'an old-style event (old chasers, laser on, first kind unshootable) starts');
  const old = await inGame(`
    const c = G.evItems.find((t) => t.cased);
    if (!c) return null;
    H.beside(c); G.input('space'); G.frame(1 / 30);
    const ch = G.evHazards.filter((t) => t.role === 'chaser');
    if (!ch.length) return { n: 0, beacons: [] };
    const target = ch[0];
    for (const t of ch.slice(1)) t.downFor = 0.0;
    G.playerPos = [target.x, target.y + 6.0];
    G.evShots = 5;
    G.input('space'); G.frame(1 / 30);
    return { n: ch.length, beacons: ch.map((t) => t.beacon), hit: target.hits >= 1 || target.downFor >= 0 };
  `);
  check(old && old.n > 0 && old.beacons.every((b) => /^obstacle_|guardian/.test(b)), `an old event's chasers still sound like battle enemies: ${old && old.beacons}`);
  check(old && old.hit === true, 'and with the laser on they can be shot, whatever the first kind says (the Pumpkin Hunt trap)');
}

// ------------------------------------------------------------ lives in the report (The Jewel Heist)
// Its guards come only from smashed cases (no creatures at the start), and a touch
// costs one of three lives: the report says the lives from the start of the run.
const jh = structuredClone(jewel);       // the template The Jewel Heist was made from
const sj = await start(jh);
check(sj.state === 'event' && jh.hazards.count === 0, 'The Jewel Heist starts, with no creatures until a case is smashed');
const jl = await inGame(`document.getElementById('said').textContent = ''; G.eventStatusReport(); const a = H.said();
  G.evLives = 1; G.eventStatusReport(); const b = H.said(); G.triggerGameOver(); return { a, b };`);
check(/3 lives left\./.test(jl.a), 'the double tap report says the three lives from the start: ' + jl.a);
check(/1 life left\./.test(jl.b), 'and one life when one is left: ' + jl.b);
const sl = await page.evaluate(async (d) => {
  const { checkEvent, saysLives } = await import('./js/modes/events/schema.js');
  const heaven = structuredClone(d);
  heaven.hazards = Object.assign({}, heaven.hazards, { lives: 3 });
  const own = structuredClone(heaven);
  own.chasers.on_touch = 'end_run';
  return { heaven: saysLives(checkEvent(heaven)[0]), own: saysLives(checkEvent(own)[0]) };
}, tpl);
check(!sl.heaven && sl.own, `Shattered Heaven's ghosts cost time, not lives, so no lives are said; chasers of its own that end the run would: ${JSON.stringify(sl)}`);

check(errors.length === 0, `no page errors: ${errors.slice(0, 5)}`);
await browser.close();

// ------------------------------------------------------------ the home page Alert
const b2 = await chromium.launch();
async function home(release) {
  const p = await b2.newPage();
  await p.route('https://api.github.com/**', (route) => route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify(release) }));
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(base + '/index.html');
  await p.waitForTimeout(1500);
  const a = await p.evaluate(() => { const e = document.getElementById('windows-update-alert'); return e && e.textContent.trim(); });
  await p.close();
  return { a, errs };
}
const day = 86400000;
// (Web 6.0.0: the alert is now Windows 4.0.0's, by GitHub's own date for it; Windows
// 3.1.0 was never released. The alert's own rules are tested in tests/alert.mjs.)
const rOld = { tag_name: 'v3.0.1', published_at: new Date(Date.UTC(2026, 10, 12, 1)).toISOString(), html_url: 'https://github.com/x/releases/tag/v3.0.1' };
const rNew = { tag_name: 'v4.0.0', published_at: new Date(Date.now() - day).toISOString(), html_url: 'https://github.com/x/releases/tag/v4.0.0' };
for (const [r, label] of [[rOld, 'GitHub still on 3.0.1'], [rNew, 'GitHub on 4.0.0']]) {
  const { a, errs } = await home(r);
  if (r === rNew) {
    check(a && /^Windows players, please update: Endless Labyrinth 4\.0\.0 is the latest version/.test(a) && /version 2\.0\.0 or newer, the game updates itself/.test(a) && /Check for Updates/.test(a),
      `${label}: the Alert asks for 4.0.0 and mentions Check for Updates: ${a}`);
  } else check(!a, `${label}: no alert announces a version not yet out: ${a}`);
  check(errs.length === 0, `${label}: no page errors ${errs}`);
}
await b2.close();

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
