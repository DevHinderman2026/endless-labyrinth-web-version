// Toy Memory (web 8.2.0): Battle's menu, a box opening, the toy playing once, the round's
// order, the narrow laser's hits and misses, lives, the end of a round, the Chaos stage,
// the high score board, the help, and the pack.
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/toymemory.mjs http://localhost:8766
// It cannot hear: it checks what plays, where, and what the game does.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8766';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

// ------------------------------------------------------------------ the rules, on their own
{
  const T = await import('../js/modes/toymemory.js');
  check([0, 2, 3, 5, 6, 9, 12, 15, 99].map(T.enemiesFor).join() === '2,2,3,3,4,5,6,6,6', 'two enemies at first, one more every three boxes, at most six: ' + [0, 2, 3, 5, 6, 9, 12, 15, 99].map(T.enemiesFor).join());
  check([1, 2, 3, 4, 5, 9].map(T.chaosBoxes).join() === '2,3,4,5,5,5', 'in chaos: two boxes the first time, one more each time, at most five');
  let ok = true; let order = true;
  for (let i = 0; i < 2000; i++) {
    const n = 1 + (i % 6);
    const s = T.pickSlots(n);
    if (s.length !== n || new Set(s).size !== n || s.some((x) => x < 0 || x > 11)) ok = false;
    for (const a of s) for (const b of s) if (a !== b && (Math.abs(a - b) === 1 || Math.abs(a - b) === 11)) ok = false;
    // Clockwise from the first: each next one further round, wrapping once at most.
    let wraps = 0; for (let k = 1; k < s.length; k++) if (s[k] < s[k - 1]) wraps += 1;
    if (wraps > 1 || (wraps === 1 && s[s.length - 1] >= s[0])) order = false;
  }
  check(ok, 'the enemies stand on the quick turn\'s thirty degree steps, never two on neighbouring steps (at least sixty degrees apart)');
  check(order, 'and take their turns going round you clockwise');
  const p = T.slotPos([3, 3], 3, 15);
  check(Math.abs(p[0] - 18) < 1e-9 && Math.abs(p[1] - 3) < 1e-9, 'step 3 of the twelve is due east');
  check(T.TM_AIM_DEG * 2 < 60 && T.TM_AIM_DEG <= 15, `the laser (${T.TM_AIM_DEG} degrees either side) cannot reach two enemies sixty degrees apart`);
}

// ------------------------------------------------------------------ the recordings (read from the files)
{
  const { readFileSync } = await import('node:fs');
  const root = new URL('..', import.meta.url).pathname;
  const manifest = JSON.parse(readFileSync(root + 'packs/manifest.json', 'utf8'));
  const p = manifest.packs.toymemory;
  const buf = readFileSync(root + 'packs/' + p.file);
  const n = buf.readUInt32LE(8);
  const head = JSON.parse(buf.slice(12, 12 + n).toString('utf8'));
  const e = (nm) => head.entries.find((x) => x.name === nm);
  check(buf.length === p.bytes && head.pack === 'toymemory' && head.entries.length === 3 && e('tm_ambience') && e('tm_beacon') && e('tm_box_open'),
    'the toymemory pack holds its three recordings: ' + head.entries.map((x) => `${x.name} ${(x.frames / head.rate).toFixed(2)} s`).join(', '));
  check(e('tm_ambience').loop && e('tm_beacon').loop && !e('tm_box_open').loop, 'the ambience and the music box loop; the opening plays once');
  const beacon = e('tm_beacon').frames / head.rate;
  check(beacon >= 2 && beacon <= 4, `the music box is one short phrase (${beacon.toFixed(2)} s)`);
  check(head.entries.every((x) => buf.slice(12 + n + x.offset, 12 + n + x.offset + 4).toString() === 'OggS'), 'all of them Ogg');
}

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/api\.github|ERR_FAILED|CORS/.test(m.text())) errors.push(m.text()); });
await page.goto(base + '/play.html?desktop=1');
await page.evaluate(() => { window.__elNoChests = true; });
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 180000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio;
  const t = window.__t = { said: [], played: [], log: [], now: 0 };
  const step = g.frame.bind(g); g.frame = () => {}; g._f = step;
  const play = a.play.bind(a);
  a.play = (name, opts) => { t.played.push(name); t.log.push({ name, at: opts && opts.at ? [...opts.at] : null, t: t.now, loops: opts && opts.loops }); return play(name, opts); };
  const speak = g.tts.speak.bind(g.tts);
  g.tts.speak = (text, o) => { if (text) t.said.push(text); return speak(text, o); };
  t.frames = (seconds, dt = 1 / 30) => { for (let i = 0; i < Math.round(seconds / dt); i++) { t.now += dt; g._f(dt); } };
  t.menu = () => { if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); } };
  t.face = (deg) => { g._turnStop(); g._face(deg * Math.PI / 180, true); };
  t.start = () => { t.menu(); g.menuIndex = g.menuKeys.indexOf('battle'); g.input('enter'); g.input('down'); g.input('enter'); };
  // Walk into the box (put beside it, then the frame finds it) and wait for the round.
  t.open = () => { const tm = g.tm; g.playerPos = [tm.box.pos[0] + 1, tm.box.pos[1]]; t.frames(1 / 30); };
  t.toRound = () => { let k = 0; while (g.tm.phase !== 'round' && k < 300) { t.frames(1 / 30); k += 1; } };
  t.faceEnemy = (e) => t.face(e.slot * 30);
  t.match = () => g.tm.enemies.find((e) => e.match);
  t.other = () => g.tm.enemies.find((e) => !e.match);
});

// ------------------------------------------------------------------ the Battle menu
const menu = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  const keys = g.menuKeys.slice();
  g.menuIndex = g.menuKeys.indexOf('battle'); t.said.length = 0; g.input('enter');
  const st1 = g.state; const s1 = t.said.slice(); const status = g._statusLine();
  g.input('down'); const s2 = t.said[t.said.length - 1];
  g.input('down'); const s3 = t.said[t.said.length - 1];
  g.input('down'); const s4 = t.said[t.said.length - 1];
  g.input('back'); const st2 = g.state; const idx = g.menuKeys[g.menuIndex];
  g.menuIndex = g.menuKeys.indexOf('battle'); g.input('enter'); g.input('enter'); const st3 = g.state;
  t.menu(); g.menuIndex = g.menuKeys.indexOf('battle'); g.input('enter'); g.input('up'); g.input('enter'); const st5 = g.state;
  t.start(); const st4 = g.state; const said4 = t.said.slice(-2);
  return { keys, st1, s1, s2, s3, s4, st2, idx, st3, st4, st5, said4, status, tmKey: keys.includes('toymemory') };
});
check(menu.st1 === 'battle_menu' && /^Battle Mode\. Swipe up and down to choose, double tap to start\. Battle$/.test(menu.s1.join(' ')), 'Battle Mode on the main menu opens its own menu: ' + menu.s1.join(' | '));
check(menu.s2 === 'Toy Memory' && menu.s3 === 'Back to the main menu' && menu.s4 === 'Battle', 'it offers Battle, Toy Memory, and Back');
check(menu.status === 'Battle Mode: Battle', 'the screen shows where you are on it: ' + menu.status);
check(menu.st2 === 'menu' && menu.idx === 'battle', 'Back (triple tap) returns to the main menu, on Battle Mode');
check(menu.st3 === 'battle', 'Battle, chosen there, starts Battle as before');
check(menu.st5 === 'menu', 'Back to the main menu, chosen there, returns to the main menu');
check(menu.st4 === 'toymemory' && menu.said4.includes('Toy Memory started.'), 'Toy Memory, chosen there, starts Toy Memory: ' + menu.said4.join(' | '));
check(!menu.tmKey, 'Toy Memory has no main menu entry of its own');

// ------------------------------------------------------------------ the start and the box
const start = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  t.start(); t.played.length = 0; t.log.length = 0;
  const tm = g.tm; const clock0 = g.timeLeft;
  t.frames(1.0);
  const box = tm.box.pos; const dx = box[0] - g.playerPos[0]; const dy = box[1] - g.playerPos[1];
  const d = Math.hypot(dx, dy); const deg = ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;
  // Many boxes: always a whole number of steps along a thirty degree step, inside the floor.
  let allOk = true;
  for (let i = 0; i < 300; i++) {
    g.playerPos = [Math.random() * 70 - 35, Math.random() * 70 - 35];
    g._tmNewBox(); const b = g.tm.box.pos; const ddx = b[0] - g.playerPos[0]; const ddy = b[1] - g.playerPos[1];
    const dd = Math.hypot(ddx, ddy); const a = ((Math.atan2(ddx, -ddy) * 180 / Math.PI) + 360) % 360;
    if (Math.abs(dd / 3 - Math.round(dd / 3)) > 1e-6 || dd < 11.9 || dd > 21.1 || Math.abs(a / 30 - Math.round(a / 30)) > 1e-6 || Math.abs(b[0]) > 34.01 || Math.abs(b[1]) > 34.01) allOk = false;
  }
  return { state: g.state, lives: tm.lives, phase: tm.phase, d, deg, allOk, turns: g._turnsNow(), room: g._currentRoom(), clock0, clock1: g.timeLeft,
    amb: tm.amb && tm.amb.voice && tm.amb.voice.name, beacon: tm.beacon && tm.beacon.name, beaconBusy: !!(tm.beacon && tm.beacon.busy),
    crowd: !!g.battleCrowdChannel, drums: !!g.beatChannel, enemies: tm.enemies.length, statsKey: g._statsKey(), status: g._statusLine() };
});
check(start.state === 'toymemory' && start.lives === 3 && start.phase === 'box' && start.enemies === 0, 'a run starts with three lives and a box to find');
check(start.amb === 'tm_ambience' && start.beacon === 'tm_beacon' && start.beaconBusy, `the fountain plays, and the box's music box: ${start.amb}, ${start.beacon}`);
check(!start.crowd && !start.drums, 'no crowd, no drums');
check(start.clock0 === start.clock1, 'no clock: nothing counts down');
check(start.turns && start.room === 'battle', 'it turns with you, in Battle\'s arena echo');
check(start.allOk, 'a box is always four to seven whole steps away along one of the thirty degree steps, inside the floor');
check(start.statsKey === 'toymemory' && /^Toy Memory\. 0 boxes solved\. 3 lives\.$/.test(start.status), `its play time counts under Toy Memory, and the screen says so: ${start.status}`);

// Walking in, as in Battle: face it and walk straight on.
const walk = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  t.start(); const tm = g.tm;
  g.playerPos = [0, 0]; tm.box = { pos: [12, 0] };      // four steps due east
  t.face(90); t.played.length = 0;
  const steps = [];
  for (let i = 0; i < 4 && tm.phase === 'box'; i++) { g.input('up'); steps.push([...g.playerPos]); }
  const opened = tm.phase; const openPlayed = t.played.includes('tm_box_open'); const stepSounds = t.played.filter((n) => /^step_stone/.test(n)).length;
  const beaconAfter = tm.beacon;
  // While the box is open and the enemies out, a step only buzzes.
  t.played.length = 0; const at = [...g.playerPos]; g.input('up');
  const buzz = t.played.includes('boundary') && g.playerPos[0] === at[0] && g.playerPos[1] === at[1];
  return { steps, opened, openPlayed, stepSounds, beaconAfter: !!beaconAfter, buzz };
});
check(walk.opened === 'open' && walk.openPlayed && walk.stepSounds >= 3, `turning to face it and walking straight on, as in Battle, opens it with its sound (${walk.steps.map((p) => p.map((v) => v.toFixed(0)).join(',')).join(' ')})`);
check(!walk.beaconAfter, 'the music box stops as it opens');
check(walk.buzz, 'while the box is open and its enemies out, a step only buzzes: you stand and turn');

// ------------------------------------------------------------------ the toy, once; the round
const round = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  t.start(); t.open(); const tm = g.tm;
  t.log.length = 0; t.now = 0;
  const toy = tm.toy; const toyPlays0 = tm.toyPlays;
  t.toRound();
  const beforeRound = t.log.filter((e) => /^obstacle_/.test(e.name)).map((e) => ({ ...e }));
  const enemies = tm.enemies.map((e) => ({ slot: e.slot, x: e.x, y: e.y, sound: e.sound, match: e.match, d: Math.hypot(e.x - g.playerPos[0], e.y - g.playerPos[1]) }));
  const first = beforeRound.slice(1);      // (the first turn is played the moment the round begins)
  t.log.length = 0;
  t.frames(16);
  const r0 = first.length ? first[0].t : 0;
  const plays = [...first, ...t.log.filter((e) => /^obstacle_/.test(e.name))].map((e) => ({ name: e.name, at: e.at, t: +(e.t - r0).toFixed(2) }));
  // Space before the round (with a box out): an empty click, no life lost.
  return { toy, toyPlays0, toyPlays: tm.toyPlays, beforeRound, enemies, plays, turns: tm.turns.slice(0, 12), rounds: tm.rounds };
});
const n = round.enemies.length;
check(round.toyPlays0 === 0 && round.toyPlays === 1 && round.beforeRound.length >= 1 && round.beforeRound[0].name === round.toy && !round.beforeRound[0].at,
  `opening the box: the toy plays its enemy's sound once, in front of you (${round.toy})`);
check(n === 2 && round.enemies.filter((e) => e.match).length === 1 && new Set(round.enemies.map((e) => e.sound)).size === n && round.enemies.find((e) => e.match).sound === round.toy,
  'two enemies in the first round, each a different Battle enemy, exactly one of them the toy\'s: ' + round.enemies.map((e) => e.sound + (e.match ? '*' : '')).join(', '));
check(round.enemies.every((e) => Math.abs(e.d - 15) < 0.01), 'they stand five steps from you, all round');
const inOrder = round.plays.every((p, i) => p.name === round.enemies[i % n].sound && Math.abs(p.at[0] - round.enemies[i % n].x) < 1e-6 && Math.abs(p.at[1] - round.enemies[i % n].y) < 1e-6);
check(inOrder && round.plays.length >= 2 * n, 'they sound one at a time, each from where it stands, always in the same order: ' + round.plays.map((p) => `${p.name}@${p.t}`).join(' '));
const gaps = round.plays.slice(1).map((p, i) => +(p.t - round.plays[i].t).toFixed(2));
check(gaps.every((gp, i) => (((i + 1) % n === 0) ? Math.abs(gp - 3.0) < 0.1 : Math.abs(gp - 1.9) < 0.1)), `a second's sound and 0.9 s of quiet between them, and 2 s more before the round repeats: gaps ${gaps.join(', ')}`);
const matchE = round.enemies.find((e) => e.match);
check(round.toyPlays === 1 && round.plays.filter((p) => p.name === round.toy).every((p) => Math.abs(p.at[0] - matchE.x) < 1e-6 && Math.abs(p.at[1] - matchE.y) < 1e-6), 'the toy itself is never played again (only its enemy, in its turn)');

// ------------------------------------------------------------------ the narrow laser, lives
const shots = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const g = window.__el.game; const t = window.__t;
  const r = {};
  t.start(); const tm = g.tm;
  // Space before the round: an empty click, nothing lost.
  t.played.length = 0; g.input('space'); r.early = t.played.includes('empty_click') && tm.lives === 3 && !t.played.includes('laser');
  t.open(); t.toRound();
  const m = t.match(); const o = t.other();
  // Aimed 15 degrees off the right one: a miss (Battle's laser would have hit it).
  t.face(m.slot * 30 + 15); t.said.length = 0; t.played.length = 0; g.input('space');
  r.laser = t.played.includes('laser'); r.missLives = tm.lives; r.missSaid = t.said.slice(); r.enemiesAfterMiss = tm.enemies.length; r.phaseAfterMiss = tm.phase;
  await sleep(500); t.frames(0.4); r.buzzMiss = t.log.slice(-20).some((e) => e.name === g._tmName('tm_wrong') && !e.at);
  // Straight away again: too soon, ignored.
  t.frames(0.1); g.input('space'); r.tooSoon = tm.lives === 2 && tm.shots === 1;
  // Battle's aim at 15 degrees would hit: check the wide one, for the comparison.
  r.battleWide = Math.abs(Math.sin(15 * Math.PI / 180)) < 0.72;
  // Aimed 10 degrees off: still within the beam.
  t.face(m.slot * 30 + 10); r.within10 = g._tmAimed() === m;
  t.face(m.slot * 30 + 180); r.behind = g._tmAimed() !== m;
  // The wrong one, squarely: a life, the buzz from where it stands, and the round goes on.
  t.frames(1.0); t.faceEnemy(o); t.said.length = 0; t.log.length = 0; g.input('space'); await sleep(500); t.frames(0.4);
  r.wrongLives = tm.lives; r.wrongSaid = t.said.slice(); r.buzzWrong = t.log.some((e) => e.name === g._tmName('tm_wrong') && e.at && Math.abs(e.at[0] - o.x) < 1e-6 && Math.abs(e.at[1] - o.y) < 1e-6);
  r.stillThere = tm.enemies.length === 2 && tm.phase === 'round';
  const k0 = tm.turns.length; t.frames(5); r.roundGoesOn = tm.turns.length > k0;
  // Double tap: lives and boxes, never the toy.
  t.said.length = 0; g.input('enter'); r.report = t.said.slice();
  // The right one: shot down, the others vanish, then the next box.
  t.frames(1.0); t.faceEnemy(m); t.log.length = 0; t.said.length = 0; g.input('space');
  r.rightSolved = tm.solved; r.rightPhase = tm.phase; r.rightEnemies = tm.enemies.length; r.rightLives = tm.lives;
  await sleep(700); t.frames(1.0); r.explosion = t.log.some((e) => e.name === 'explosion' && e.at && Math.abs(e.at[0] - m.x) < 1e-6); r.vanish = t.log.some((e) => e.name === g._tmName('tm_vanish'));
  r.saidRight = t.said.slice();
  t.frames(1.2); r.nextPhase = tm.phase; r.nextBox = tm.boxes; r.nextBeacon = !!(tm.beacon && tm.beacon.busy);
  return r;
});
check(shots.early, 'before the enemies are out, the fire gesture only clicks, and costs nothing');
check(shots.laser && shots.missLives === 2 && shots.missSaid.includes('Missed. 2 lives left.') && shots.enemiesAfterMiss === 2 && shots.phaseAfterMiss === 'round', 'aimed fifteen degrees off the right one, the narrow laser misses: a life lost, "Missed. 2 lives left.", the round goes on: ' + shots.missSaid.join(' | '));
check(shots.battleWide, '(Battle\'s wide laser would have hit at fifteen degrees)');
check(shots.buzzMiss, 'a miss buzzes in front of you');
check(shots.tooSoon, 'a second shot within 0.6 s is not taken (no second life lost)');
check(shots.within10 && shots.behind, 'ten degrees off still hits; straight behind never does');
check(shots.wrongLives === 1 && shots.wrongSaid.includes('Wrong. 1 life left.') && shots.buzzWrong, 'the wrong one: a life, "Wrong. 1 life left.", the buzz from where it stands: ' + shots.wrongSaid.join(' | '));
check(shots.stillThere && shots.roundGoesOn, 'after a wrong shot the enemies stay and keep taking turns');
check(shots.report.length === 1 && /^Boxes: 0\. 1 life left\. Facing [a-z-]+\.$/.test(shots.report[0]), 'double tap: the boxes solved and the lives (not the toy): ' + shots.report.join(' | '));
check(shots.rightSolved === 1 && shots.rightPhase === 'next' && shots.rightEnemies === 0 && shots.rightLives === 1, 'the right one solves the box: the others vanish');
check(shots.explosion && shots.vanish, 'it is shot down from where it stood, and the others vanish with a twinkle');
check(shots.nextPhase === 'box' && shots.nextBox === 2 && shots.nextBeacon, 'two seconds later the next box\'s music box plays');

// ------------------------------------------------------------------ more enemies, and the end of a run
const more = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  t.start(); const tm = g.tm; const counts = [];
  for (let b = 0; b < 14; b++) {
    t.open(); t.toRound(); counts.push(tm.enemies.length);
    t.faceEnemy(t.match()); tm.shotT = 0; g.input('space'); t.frames(2.1);
  }
  const solved = tm.solved;
  // Three wrong: the run ends.
  t.open(); t.toRound();
  for (let k = 0; k < 3 && g.state === 'toymemory'; k++) { t.frames(0.7); t.faceEnemy(t.other()); t.said.length = 0; g.input('space'); }
  const end = g.state; const said = t.said.slice(); const lines = g._scoreLines();
  return { counts, solved, end, said, lines };
});
check(more.counts.join() === '2,2,2,3,3,3,4,4,4,5,5,5,6,6', 'one more enemy every three boxes, up to six: ' + more.counts.join(','));
check(more.solved === 14 && more.end === 'game_over' && more.said.some((s) => /^Game Over\. You solved 14 boxes\. /.test(s)), 'losing the last life ends the run, scored by boxes solved: ' + more.said.join(' | '));
const iBattle = more.lines.findIndex((l) => /^Battle Mode/.test(l));
check(/^Toy Memory: 14 boxes$/.test(more.lines[iBattle + 1] || ''), 'Toy Memory has its own high score board, right after Battle\'s: ' + more.lines[iBattle + 1]);

// ------------------------------------------------------------------ Chaos
const chaos = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  t.menu();
  const pick = g._chaosPickNext;
  const seq = ['toymemory', 'toymemory', 'standard', 'standard'];
  g._chaosPickNext = () => seq.shift() || 'standard';
  g.menuIndex = g.menuKeys.indexOf('chaos'); g.input('enter'); t.frames(0.2);
  const tm = g.tm; const r = {};
  r.state = g.state; r.chaos = tm && tm.chaos; r.quota = tm && tm.quota; r.lives = tm && tm.lives;
  r.amb = tm.amb && tm.amb.voice && tm.amb.voice.name; r.beacon = !!(tm.beacon && tm.beacon.busy);
  const c0 = g.timeLeft; t.frames(5); r.clockRuns = c0 - g.timeLeft;
  t.open(); t.toRound(); r.enemies = tm.enemies.length;
  // A wrong shot: 15 health, no life.
  const hp0 = g.towerHp; t.faceEnemy(t.other()); t.said.length = 0; g.input('space');
  r.hurt = hp0 - g.towerHp; r.wrongSaid = t.said.slice(); r.stillOn = g.state === 'toymemory' && tm.enemies.length > 0;
  t.frames(1); t.said.length = 0; g.input('enter'); r.report = t.said.slice();
  // Two boxes solved: the next level, for ten points.
  const pts = g.chaosPoints;
  t.faceEnemy(t.match()); tm.shotT = 0; g.input('space'); t.frames(2.1);
  r.afterOne = g.state; r.box2 = tm.phase;
  t.open(); t.toRound(); t.faceEnemy(t.match()); tm.shotT = 0; g.input('space'); t.frames(2.2);
  r.afterTwo = g.chaosToyCount; r.pts = g.chaosPoints - pts; r.tmGone = !g.tm || g.tm.solved === 0;
  // The second Toy Memory level of the run: three boxes, and the enemies grown with the two solved.
  t.frames(0.3);
  r.state2 = g.state; r.quota2 = g.tm && g.tm.quota;
  t.open(); t.toRound(); r.enemies2 = g.tm.enemies.length;
  // A wrong shot with too little health ends the run.
  g.towerHp = 10; t.faceEnemy(t.other()); g.tm.shotT = 0; t.said.length = 0; g.input('space');
  r.end = g.state; r.endSaid = t.said.slice();
  g._chaosPickNext = pick;
  return r;
});
check(chaos.state === 'toymemory' && chaos.chaos && chaos.quota === 2 && chaos.lives === 0, 'Chaos can bring a Toy Memory level: two boxes the first time in a run');
check(chaos.amb === 'tm_ambience' && chaos.beacon, 'with its fountain and its music box');
check(chaos.clockRuns > 4.9 && chaos.clockRuns < 5.1, 'the chaos clock runs as usual: ' + chaos.clockRuns.toFixed(2));
check(chaos.hurt === 15 && chaos.stillOn && chaos.wrongSaid.includes('Wrong.'), 'a wrong shot costs 15 health instead of a life, and the round goes on: ' + chaos.wrongSaid.join(' | '));
check(chaos.report.length === 1 && /^0 of 2 boxes\. \d+ health\. Clock \d+ seconds\. \d+ points total\. Facing /.test(chaos.report[0]), 'double tap: boxes solved and wanted, health, clock, points: ' + chaos.report.join(' | '));
check(chaos.afterOne === 'toymemory' && chaos.box2 === 'box', 'one box solved: the next box');
check(chaos.afterTwo === 2 && chaos.pts === 10 && chaos.tmGone, `the second solves the level: on to the next (here another Toy Memory level), for ten points (${chaos.afterTwo}, ${chaos.pts})`);
check(chaos.state2 === 'toymemory' && chaos.quota2 === 3 && chaos.enemies2 === 2, `the next Toy Memory level asks three boxes (enemies by the run's boxes: ${chaos.enemies2})`);
check(chaos.end === 'game_over' && chaos.endSaid.some((s) => /^Out of health\./.test(s)), 'a wrong shot with too little health ends the run: ' + chaos.endSaid.join(' | '));

// ------------------------------------------------------------------ help, stats
const help = await page.evaluate(async () => {
  const g = window.__el.game;
  const names = g.helpList.map(([n]) => n);
  const { STAT_MODES } = await import('./js/storage.js');
  const { BOARDS, MODE_NAMES } = await import('./js/stats.js');
  return { names, stat: STAT_MODES.indexOf('toymemory') === STAT_MODES.indexOf('battle') + 1, name: MODE_NAMES.toymemory,
    board: BOARDS.findIndex((b) => b[0] === 'toymemory') === BOARDS.findIndex((b) => b[0] === 'battle') + 1, fmt: BOARDS.find((b) => b[0] === 'toymemory')[2](3) };
});
check(help.names.indexOf('Toy Memory') === help.names.indexOf('Battle Mode') + 1, 'Toy Memory\'s help comes right after Battle\'s');
check(help.names.indexOf('Demos, Toy Memory') === help.names.indexOf('Demos, Battle Mode') + 1, 'and its demos right after Battle\'s demos');
check(help.stat && help.name === 'Toy Memory' && help.board && help.fmt === '3 boxes', 'the Game Stats page counts Toy Memory, and shows its board, right after Battle');

// ------------------------------------------------------------------ the recorded voice
{
  const { readFileSync, writeFileSync } = await import('node:fs');
  const { plan, makeIndex } = await import('../js/voice-text.js');
  const root = new URL('..', import.meta.url).pathname;
  const manifest = JSON.parse(readFileSync(root + 'packs/manifest.json', 'utf8'));
  const buf = readFileSync(root + 'packs/' + manifest.packs['voice-bella'].file);
  const n2 = buf.readUInt32LE(8);
  const idx = makeIndex(JSON.parse(buf.slice(12, 12 + n2).toString('utf8')).entries);
  const lines = ['Toy Memory started.', 'Missed. 2 lives left.', 'Missed. 1 life left.', 'Wrong. 2 lives left.', 'Wrong. 1 life left.', 'Wrong.', 'Missed.',
    'Boxes: 0. 3 lives left.', 'Boxes: 14. 1 life left.', '0 of 2 boxes.', 'All 5 boxes.'];
  const missing = lines.filter((s) => !plan(s, idx));
  check(missing.length === 0, 'every line Toy Memory says during a run can be said in the recorded voice' + (missing.length ? ': missing ' + missing.join(' | ') : ''));
}

check(errors.length === 0, 'no errors on the page: ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
