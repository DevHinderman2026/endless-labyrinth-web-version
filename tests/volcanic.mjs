// Volcanic Caves (web 8.2.0): Driving's menu, the cave's layout, driving and turning, walls,
// bombs, the hole, credits, the lava's rise, the board, and the Volcanic levels of Chaos Mode.
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/volcanic.mjs http://localhost:8765
// It cannot hear: it checks what plays, where, and what the game does.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

// ------------------------------------------------------------------ the layout, on its own
{
  const V = await import('../js/modes/volcanic.js');
  let ahead = true; let inside = true; let bombsOk = true; let apart = true; let onWay = true; let creditsOk = true;
  for (const depth of [1, 3, 6, 10, 15, 30]) {
    for (let i = 0; i < 150; i++) {
      const c = V.layCave(depth);
      const d = Math.hypot(c.hole[0], c.hole[1]);
      // The hole: ahead (north, give or take 70 degrees), at its depth's distance, inside the edge.
      if (Math.abs(d - V.holeDistFor(depth)) > 1e-6 || c.hole[1] >= 0 || Math.abs(Math.atan2(c.hole[0], -c.hole[1])) > 70.01 * Math.PI / 180) ahead = false;
      if (Math.abs(c.hole[0]) > c.half - 20 || Math.abs(c.hole[1]) > c.half - 20) inside = false;
      // Bombs: as many as the depth asks, never near the start or the hole, never close together, inside the edge.
      if (c.bombs.length !== V.bombsFor(depth)) bombsOk = false;
      let near = 0;
      for (const b of c.bombs) {
        if (Math.hypot(b[0], b[1]) < 12 || Math.hypot(b[0] - c.hole[0], b[1] - c.hole[1]) < 6) bombsOk = false;
        if (Math.abs(b[0]) > c.half || Math.abs(b[1]) > c.half) inside = false;
        // distance from the line from you to the hole
        const t = Math.max(0, Math.min(1, (b[0] * c.hole[0] + b[1] * c.hole[1]) / (d * d)));
        if (Math.hypot(b[0] - c.hole[0] * t, b[1] - c.hole[1] * t) <= 4.01) near += 1;
      }
      if (near < Math.round(c.bombs.length * 0.6)) onWay = false;
      for (let a = 0; a < c.bombs.length; a++) for (let b = a + 1; b < c.bombs.length; b++) if (Math.hypot(c.bombs[a][0] - c.bombs[b][0], c.bombs[a][1] - c.bombs[b][1]) < 5) apart = false;
      if (c.credit && (Math.abs(c.credit[0]) > c.half || Math.abs(c.credit[1]) > c.half || Math.hypot(c.credit[0], c.credit[1]) > 22.001 || Math.hypot(c.credit[0], c.credit[1]) < 9.999)) creditsOk = false;
    }
  }
  check(ahead, 'the hole lies ahead, give or take 70 degrees, at its depth\'s distance');
  check(inside, 'the hole and the bombs lie inside the cavern\'s edge, with room beyond the hole');
  check(bombsOk && apart, 'as many bombs as the depth asks, never near the start or the hole, never close together');
  check(onWay, 'most bombs lie on the way to the hole');
  check(creditsOk, 'a credit always lies near where you start (10 to 22 units), inside the cavern');
  check(V.tickEvery(48) === 0.5 && Math.abs(V.tickEvery(2) - 0.12) < 1e-9 && V.tickEvery(10) < V.tickEvery(30), 'a bomb ticks faster the closer you are: every half second at the edge of hearing, every 0.12 s right before it');
  check(V.holeBonusFor(1) === 5 && V.holeBonusFor(3) === 6 && V.holeBonusFor(11) === 10 && V.holeBonusFor(40) === 10 && V.holeBonusFor(1, true) === 5 && V.holeBonusFor(30, true) === 5, 'the hole gives 5 seconds, one more every two levels, 10 from level 11; 5 in Chaos');
  check(V.holeDistFor(1) === 40 && V.holeDistFor(6) === 80 && V.holeDistFor(99) === 200, 'the hole farther every level: 40, then 8 more a level, at most 200');
  check(V.bombsFor(1) === 3 && V.bombsFor(5) === 7 && V.bombsFor(99) === 20, 'three bombs in the first cave, one more every level, at most twenty');
  check(V.listenLevel(1) === 1 && Math.abs(V.listenLevel(22) - 0.35) < 1e-9 && V.listenLevel(11) < 1 && V.listenLevel(11) > 0.35, 'the bombs, the hole and the credits grow quieter as the lava rises: full at level 1, 35 percent from 22 (Escape the Cave)');
  // Escape the Cave's lava curve: faint at 1, full at 22, rising on toward the ceiling.
  const L = V.lavaVolume;
  check(Math.abs(L(1) - 0.05) < 1e-9 && Math.abs(L(22) - 1.0) < 1e-9 && L(30) > 1.0 && L(200) < 2.1 && L(12) > L(11), 'the lava rises level after level, as in Escape the Cave (0.05 at level 1, 1.0 at level 22, toward 2.1)');
  check(V.lavaLevel(1) < V.lavaLevel(10) && V.lavaLevel(10) < V.lavaLevel(40) && V.lavaLevel(500) <= 0.95, 'and is played louder the deeper the cave: ' + [1, 10, 22, 40].map((n) => V.lavaLevel(n).toFixed(3)).join(', '));
  check(V.chaosHolesFor(1) === 2 && V.chaosHolesFor(2) === 3 && V.chaosHolesFor(9) === 5, 'Chaos asks for two holes, one more each Volcanic level, at most five');
}

// ------------------------------------------------------------------ the recordings
{
  const { readFileSync } = await import('node:fs');
  const root = new URL('..', import.meta.url).pathname;
  const manifest = JSON.parse(readFileSync(root + 'packs/manifest.json', 'utf8'));
  const p = manifest.packs.volcanic;
  const buf = readFileSync(root + 'packs/' + p.file);
  const n = buf.readUInt32LE(8);
  const head = JSON.parse(buf.slice(12, 12 + n).toString('utf8'));
  const want = ['vc_air', 'vc_lava', 'vc_tick', 'vc_tock', 'vc_boom', 'vc_rock', 'vc_pop', 'vc_land'];
  check(buf.length === p.bytes && head.pack === 'volcanic' && head.entries.length === 8 && want.every((w) => head.entries.some((e) => e.name === w)),
    'the volcanic pack holds its eight recordings: ' + head.entries.map((e) => `${e.name} ${(e.frames / head.rate).toFixed(2)} s${e.loop ? ' loop' : ''}`).join(', '));
  const loop = (nm) => (head.entries.find((e) => e.name === nm) || {}).loop;
  check(loop('vc_air') && loop('vc_lava') && !loop('vc_tick'), 'the air and the lava loop; the rest are one-shots');
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
  const t = window.__t = { said: [], played: [], placed: [] };
  const step = g.frame.bind(g); g.frame = () => {}; g._f = step;
  const play = a.play.bind(a);
  a.play = (name, opts) => { t.played.push(name); if (opts && opts.at) t.placed.push([name, [...opts.at]]); return play(name, opts); };
  const speak = g.tts.speak.bind(g.tts);
  g.tts.speak = (text, o) => { if (text) t.said.push(text); return speak(text, o); };
  t.frames = (seconds, dt = 1 / 30) => { for (let i = 0; i < Math.round(seconds / dt); i++) g._f(dt); };
  t.menu = () => { if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); } };
  t.face = (k) => { g._turnStop(); g._face(k * Math.PI / 2, true); };
  // A test cave: open, 60 units each way, the hole 48 ahead (north). Bombs and a credit at units.
  t.straight = (bombs = [], credit = null) => {
    const vc = g.vc;
    vc.half = 60; vc.hole = [0, -48]; vc.bombs = bombs.map((p) => ({ pos: p, t: 0.1, tock: false }));
    vc.credit = credit; g.playerPos = [0, 0]; vc.speed = 0; vc.throttle = false; vc.start = [0, 0]; vc.startFace = 0; t.face(0);
  };
});

// ------------------------------------------------------------------ Driving's menu
const menu = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  const keys = g.menuKeys.slice();
  g.menuIndex = g.menuKeys.indexOf('drive'); t.said.length = 0; g.input('enter');
  const st1 = g.state; const s1 = t.said.slice();
  g.input('down'); const s2 = t.said[t.said.length - 1];
  g.input('down'); const s3 = t.said[t.said.length - 1];
  g.input('down'); const s4 = t.said[t.said.length - 1];
  g.input('back'); const st2 = g.state;
  g.menuIndex = g.menuKeys.indexOf('drive'); g.input('enter'); g.input('enter'); const st3 = g.state;
  t.menu(); g.menuIndex = g.menuKeys.indexOf('drive'); g.input('enter'); g.input('down'); t.said.length = 0; g.input('enter'); const st4 = g.state;
  return { keys, st1, s1, s2, s3, s4, st2, st3, st4, said4: t.said.slice(), vcKey: keys.includes('volcanic') };
});
check(menu.st1 === 'drive_menu' && /Driving\. Swipe up and down/.test(menu.s1.join(' ')), 'Driving Mode on the main menu opens its own menu: ' + menu.s1.join(' | '));
check(menu.s2 === 'Volcanic Caves' && menu.s3 === 'Back to the main menu' && menu.s4 === 'Driving Mode', 'it offers Driving Mode, Volcanic Caves, and Back');
check(menu.st2 === 'menu', 'Back (triple tap) returns to the main menu');
check(menu.st3 === 'drive', 'Driving Mode, chosen there, starts the road as before');
check(menu.st4 === 'volcanic' && menu.said4.includes('Volcanic Caves. Two minutes.'), 'Volcanic Caves, chosen there, starts Volcanic Caves');
check(!menu.vcKey, 'Volcanic Caves has no main menu entry of its own');

// ------------------------------------------------------------------ the start
const start = await page.evaluate(() => {
  const g = window.__el.game; const vc = g.vc;
  return { state: g.state, depth: vc.depth, pos: g.playerPos, turns: g._turnsNow(), room: g._currentRoom(), gm: g.mode.gestureMode(g),
    air: vc.air && vc.air.name, lava: vc.lava && vc.lava.name, engine: vc.engine && vc.engine.name, clock: g.timeLeft,
    north: vc.hole[1] < 0, turnHold: (g._f(1 / 30), g.gestures.turnHold), gmode: g.gestures.mode };
});
check(start.state === 'volcanic' && start.depth === 1 && start.pos.join() === '0,0', 'a run starts in the first cave, at its start');
check(start.turns && start.gm === 'drive' && start.gmode === 'drive' && start.turnHold, 'the cave turns with you, with the driving gestures and turning both on');
check(start.room === 'lab', 'a cave\'s echo');
check(start.air === 'vc_air' && start.lava === 'vc_lava' && /^engine_\d+$/.test(start.engine || ''), `the cave's air, the lava and the engine play: ${start.air}, ${start.lava}, ${start.engine}`);
check(Math.abs(start.clock - 120) < 0.1, 'two minutes on the clock: ' + start.clock);
check(start.north, 'the hole lies ahead, to the north');

// ------------------------------------------------------------------ driving, turning, walls
const drive = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const vc = g.vc;
  t.straight();
  g.input('accel_on'); t.frames(1.0); const s1 = vc.speed; const y1 = g.playerPos[1];
  g.input('accel_off'); t.frames(0.5); const s2 = vc.speed;
  g.input('down'); const s3 = vc.speed;
  // Turn right a quarter (three flicks), and drive east: open cave, all the way to the edge.
  vc.speed = 0; g.input('right'); t.frames(0.3); g.input('right'); t.frames(0.3); g.input('right'); t.frames(0.3);
  const face = g.tn.face;
  g.playerPos = [0, -10]; t.played.length = 0; g.input('accel_on'); t.frames(3.0);
  const openRun = g.playerPos[0] > 20 && !t.played.includes('vc_rock');
  t.frames(6.0); g.input('accel_off');
  const rock = t.played.filter((n) => n === 'vc_rock').length; const stopped = vc.speed; const x = g.playerPos[0];
  // Turned 30 degrees off the edge, the car slides on along it.
  t.face(1); g.input('left'); t.frames(0.3); const y0 = g.playerPos[1]; vc.speed = 6; g.input('accel_on'); t.frames(0.5); g.input('accel_off');
  const slid = g.playerPos[1] < y0 - 1 && Math.abs(g.playerPos[0] - 60) < 0.5;
  return { s1, y1, s2, s3, face, openRun, rock, stopped, x, slid, clock: g.timeLeft };
});
check(drive.s1 > 5 && drive.y1 < -2, `the throttle accelerates the car the way it faces (speed ${drive.s1.toFixed(1)}, ${(-drive.y1).toFixed(1)} units north)`);
check(drive.s2 < drive.s1 && drive.s2 > 0, 'lifting the finger, the car coasts');
check(drive.s3 < drive.s2, 'a brake slows it');
check(Math.abs(drive.face - Math.PI / 2) < 1e-6, 'three flicks turn it a quarter, to east');
check(drive.openRun, 'no walls inside the cave: the car drives on and on');
check(drive.rock >= 1 && drive.stopped === 0 && Math.abs(drive.x - 60) < 0.5, `the edge is the only wall: a thud of rock, and the car stops there (${drive.rock} thuds)`);
check(drive.slid, 'turned a little off the edge, the car slides on along it');

// ------------------------------------------------------------------ bombs
const bomb = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const vc = g.vc;
  t.straight([[0, -18]]);
  t.placed.length = 0; t.frames(1.2);
  const ticks = t.placed.filter(([n]) => n === 'vc_tick' || n === 'vc_tock');
  g.playerPos = [0, -14]; t.frames(0.3); t.placed.length = 0; t.frames(1.2);
  const nearTicks = t.placed.filter(([n]) => n === 'vc_tick' || n === 'vc_tock').length;
  g.playerPos = [0, 0];
  const tickTock = ticks.some(([n]) => n === 'vc_tick') && ticks.some(([n]) => n === 'vc_tock');
  const tickAt = ticks.length ? ticks[0][1].join() : null;
  // Brushing past, a few units to one side: nothing.
  t.straight([[0, -18]]); g.playerPos = [3.5, -1]; vc.speed = 4; t.face(0); g.input('accel_on'); t.frames(2.5); g.input('accel_off');
  const passed = vc.bombs.length === 1 && !vc.boom && g.playerPos[1] < -21;
  const brushAt = g.playerPos.map((x) => +x.toFixed(2));
  // Head on: it goes off, and a moment later you are back at the start; the clock ran on.
  t.straight([[0, -18]]); t.played.length = 0; const c0 = g.timeLeft;
  g.input('accel_on'); t.frames(2.6); g.input('accel_off');
  const boomed = t.played.includes('vc_boom'); const gone = vc.bombs.length === 0;
  t.frames(2.0);
  return { ticks: ticks.length, nearTicks, tickAt, tickTock, passed, brushAt, boomed, gone, back: g.playerPos.join(), ran: c0 - g.timeLeft };
});
check(bomb.ticks >= 2 && bomb.tickAt === '0,-18' && bomb.tickTock, `a bomb ticks like a clock, tick and tock, twice a second, from where it lies (${bomb.ticks} in 1.2 s at ${bomb.tickAt})`);
check(bomb.nearTicks > bomb.ticks * 1.5, `closer to it, the ticking is faster (${bomb.ticks} ticks in 1.2 s 18 away, ${bomb.nearTicks} 4 away)`);
check(bomb.passed, 'brushing past a bomb, a few units to one side, does nothing: ' + bomb.brushAt);
check(bomb.boomed && bomb.gone, 'driving into a bomb head on sets it off, and it is gone');
check(bomb.back === '0,0' && bomb.ran > 3.5, `back at the start of the cave, the clock having run on (${bomb.ran.toFixed(1)} s)`);

// ------------------------------------------------------------------ the hole and the next cave
const hole = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const vc = g.vc;
  t.straight();
  t.placed.length = 0; t.frames(1.0);
  const beeps = t.placed.filter(([n]) => /^prox_/.test(n));
  const far = beeps.length ? +beeps[0][0].slice(5) : -1;
  g.playerPos = [0, -40]; t.placed.length = 0; t.frames(0.6);
  const nb = t.placed.filter(([n]) => /^prox_/.test(n)); const near = nb.length ? +nb[nb.length - 1][0].slice(5) : -1;
  const atHole = nb.length ? nb[nb.length - 1][1].join() : null;
  t.played.length = 0; t.said.length = 0; const c0 = g.timeLeft; const lava0 = vc.lava.l === undefined ? null : vc.lava.l;
  g.playerPos = [0, -44]; vc.speed = 6; g.input('accel_on'); t.frames(0.6); g.input('accel_off');
  const popped = t.played.includes('vc_pop'); const c1 = g.timeLeft; const bonusSaid = t.said.slice();
  t.frames(2.0);
  const v2 = g.vc;
  return { beeps: beeps.length, far, near, atHole, popped, waited: Math.abs(c1 - c0) < 0.4, depth: v2.depth, said: t.said.slice(), land: t.played.includes('vc_land'),
    gained: c1 - c0, bonusSaid, pos: g.playerPos.join(), sameAir: v2.air === vc.air || (v2 === vc), lava: v2.lava && v2.lava.name };
});
check(hole.beeps >= 1 && hole.near > hole.far && hole.atHole === '0,-48', `the hole beeps from where it is, higher the nearer you are (pitch ${hole.far} far, ${hole.near} near)`);
check(hole.popped && hole.land, 'driving into the hole: a pop, then the landing below');
check(hole.gained > 4.5 && hole.bonusSaid.includes('5 more seconds.'), `leaving the first cave puts 5 seconds on the clock, and says so (${hole.gained.toFixed(1)} s): ${hole.bonusSaid.join(' | ')}`);
check(hole.depth === 2 && hole.pos === '0,0', 'and you are at the start of the next cave down, level 2');
check(!hole.said.some((x) => /level/i.test(x)), 'no voice says the level: ' + JSON.stringify(hole.said));

// ------------------------------------------------------------------ the facing kept through the drop
const bend = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const vc = g.vc;
  vc.half = 60; vc.hole = [40, 0]; vc.bombs = []; vc.credit = null;
  g.playerPos = [0, 0]; vc.speed = 0; t.face(1);
  const depth0 = vc.depth;
  g.input('accel_on'); t.frames(5); g.input('accel_off');
  const faceInDrop = g.tn.face; t.frames(2.5);
  return { depth0, depth1: g.vc.depth, faceInDrop, faceAfter: g.tn.face, hole: g.vc.hole };
});
check(bend.depth1 === bend.depth0 + 1, `driving east into the hole (level ${bend.depth0} to ${bend.depth1})`);
check(Math.abs(bend.faceInDrop - Math.PI / 2) < 1e-6 && Math.abs(bend.faceAfter - Math.PI / 2) < 1e-6, 'the drop keeps the way you faced (east)');
check(bend.hole[0] > 0, 'and the next cave\'s hole lies ahead of it, to the east: ' + bend.hole.map((x) => x.toFixed(1)));

// ------------------------------------------------------------------ the report, the credit, the lava
const misc = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const vc = g.vc;
  t.said.length = 0; g.input('enter'); const report = t.said.slice();
  t.straight([], { pos: [0, -14], value: 20, pickup: 'credit_20', jingleT: 0 });
  const c0 = g.timeLeft; t.played.length = 0; t.placed.length = 0; g.input('accel_on'); t.frames(2.4); g.input('accel_off');
  const jingles = t.placed.filter(([n]) => /evt_coins/.test(n)).map(([, p]) => p.join());
  const beacon = t.played.some((n) => /credit_beacon/.test(n));
  const took = g.timeLeft - c0;
  const coins = t.played.includes('credit_20');
  return { report, took, coins, credit: vc.credit, jingles, beacon };
});
check(misc.report.length === 1 && /^Level 3\./.test(misc.report[0]) && /seconds/.test(misc.report[0]) && /Facing/.test(misc.report[0]), 'double tap reports the level, the clock and the way you face: ' + misc.report[0]);
check(misc.jingles.length >= 1 && misc.jingles[0] === '0,-14' && !misc.beacon, 'a credit is marked by coins clinking from where it lies, not a credit beacon: ' + JSON.stringify(misc.jingles));
check(misc.coins && misc.took > 17 && misc.took < 20 && !misc.credit, `a credit driven onto adds its time (${misc.took.toFixed(1)} s net) with its coins`);

// ------------------------------------------------------------------ the end of the run, the board
const end = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  t.said.length = 0; g.timeLeft = 0.05; t.frames(0.2);
  return { state: g.state, said: t.said.join(' '), board: g.scores.scores.volcanic, hs: g._highScoreLines ? null : null };
});
check(end.state === 'game_over' && /reached level 3 of the volcanic caves/.test(end.said) && end.board === 3, 'time up ends the run, scored by the deepest level reached, on its own board: ' + end.said);

// ------------------------------------------------------------------ Chaos
const chaos = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  t.menu();
  g.startChaos ? g.startChaos() : null;
  g.chaosVolcanicCount = 0; g.chaosNext = 'volcanic'; g._chaosClearEverything(); g.state = 'chaos_gap'; g.chaosGap = 0.01; t.frames(0.5);
  const vc = g.vc;
  const st = g.state; const holes = vc && vc.holes;
  t.straight([[0, -18]]);
  const hp0 = g.towerHp; const c0 = g.timeLeft;
  g.input('accel_on'); t.frames(2.6); g.input('accel_off');
  const hurt = hp0 - g.towerHp; const lost = c0 - g.timeLeft; const stay = !vc.boom && Math.abs(g.playerPos[1]) > 15;
  t.said.length = 0; g.input('enter'); const report = t.said.slice();
  // Reach the hole twice: the level is won.
  let pts0 = g.chaosPoints;
  t.straight(); g.playerPos = [0, -44]; vc.speed = 6; g.input('accel_on'); t.frames(0.6); g.input('accel_off'); t.frames(2.0);
  const second = g.vc; const depth2 = second && second.depth; const reached = second && second.reached;
  t.straight(); g.playerPos = [0, -44]; second.speed = 6; g.input('accel_on'); t.frames(0.6); g.input('accel_off'); t.frames(2.0);
  return { st, holes, hurt, lost, stay, report, depth2, reached, won: g.chaosPoints - pts0, after: g.state };
});
check(chaos.st === 'volcanic' && chaos.holes === 2, 'a Chaos Volcanic level asks for two holes the first time');
check(chaos.hurt === 20 && chaos.lost > 14 && chaos.stay, `a bomb there costs 20 health and 15 seconds, and you drive on (${chaos.hurt} health, ${chaos.lost.toFixed(1)} s)`);
check(chaos.report.length === 1 && /^Level 1 of 2\./.test(chaos.report[0]) && /health/.test(chaos.report[0]) && /points/.test(chaos.report[0]), 'double tap there: the cave of those wanted, health, clock and points: ' + chaos.report[0]);
check(chaos.reached === 1 && chaos.depth2 === 2, 'the first hole drops you into a new cave');
check(chaos.won >= 10, `the second wins the level (${chaos.won} points, now ${chaos.after})`);

check(errors.length === 0, 'no page errors: ' + errors.slice(0, 5).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
