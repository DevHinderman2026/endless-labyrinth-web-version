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
  let tunnels = true; let ends = true; let bombsOk = true; let neverBeside = true; let longer = true; let creditsOk = true;
  const meanLen = {};
  for (const depth of [1, 3, 6, 10, 15]) {
    let total = 0;
    for (let i = 0; i < 150; i++) {
      const c = V.layCave(depth);
      const has = (x, y) => c.open.has(`${x},${y}`);
      // The way: one cell at a time from (0, 0), north first, to the hole.
      if (c.path[0].join() !== '0,0' || c.path[1].join() !== '0,-1') tunnels = false;
      for (let k = 1; k < c.path.length; k++) if (Math.abs(c.path[k][0] - c.path[k - 1][0]) + Math.abs(c.path[k][1] - c.path[k - 1][1]) !== 1) tunnels = false;
      if (c.hole.join() !== c.path[c.path.length - 1].join()) ends = false;
      // Bombs: on the way's straight stretches or at a side passage's end; never at the start, a bend or the hole.
      for (const b of c.bombs) {
        if (!has(b[0], b[1])) bombsOk = false;
        if (Math.abs(b[0]) + Math.abs(b[1]) < 3) bombsOk = false;
        if (b.join() === c.hole.join()) bombsOk = false;
      }
      if (c.bombs.length > V.bombsFor(depth)) bombsOk = false;
      for (let a = 0; a < c.bombs.length; a++) for (let b = a + 1; b < c.bombs.length; b++) {
        if (Math.abs(c.bombs[a][0] - c.bombs[b][0]) + Math.abs(c.bombs[a][1] - c.bombs[b][1]) < 2) neverBeside = false;
      }
      if (c.credit && !has(c.credit[0], c.credit[1])) creditsOk = false;
      // A cell never has more than three open neighbours (one passage wide: no open rooms).
      for (const k of c.open) {
        const [x, y] = k.split(',').map(Number);
        let n = 0; for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) if (has(x + dx, y + dy)) n += 1;
        if (n > 3) tunnels = false;
        if (has(x + 1, y) && has(x, y + 1) && has(x + 1, y + 1)) tunnels = false;   // no 2-by-2 block of passage
      }
      total += c.path.length;
    }
    meanLen[depth] = total / 150;
  }
  for (const [a, b] of [[1, 6], [6, 15]]) if (!(meanLen[b] > meanLen[a])) longer = false;
  check(tunnels, 'every cave is passages one cell wide, from the start northward');
  check(ends, 'the hole is at the end of the way');
  check(bombsOk && neverBeside, 'bombs lie in the passages, never by the start or at the hole, never two side by side, never more than the depth allows');
  check(creditsOk, 'a credit always lies in a passage');
  check(longer, 'the hole is farther along the way the deeper you go: ' + JSON.stringify(Object.fromEntries(Object.entries(meanLen).map(([k, v]) => [k, +v.toFixed(1)]))));
  check(V.bombsFor(1) === 1 && V.bombsFor(5) === 3 && V.bombsFor(99) === 12, 'one bomb in the first cave, one more every second level, at most twelve');
  check(V.bendsFor(1) === 2 && V.bendsFor(5) === 6 && V.bendsFor(99) === 16, 'more bends deeper down: 2, then one more a level, at most 16');
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
  const want = ['vc_air', 'vc_lava', 'vc_tick', 'vc_boom', 'vc_rock', 'vc_pop', 'vc_land'];
  check(buf.length === p.bytes && head.pack === 'volcanic' && head.entries.length === 7 && want.every((w) => head.entries.some((e) => e.name === w)),
    'the volcanic pack holds its seven recordings: ' + head.entries.map((e) => `${e.name} ${(e.frames / head.rate).toFixed(2)} s${e.loop ? ' loop' : ''}`).join(', '));
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
  // A test cave: a straight passage north from the start, eight cells, the hole at its end.
  t.straight = (bombs = [], credit = null) => {
    const vc = g.vc;
    vc.open = new Set(); for (let i = 0; i <= 8; i++) vc.open.add(`0,${-i}`);
    vc.hole = [0, -8]; vc.bombs = bombs.map((c) => ({ cell: c, pos: g._vcPos(c), t: 0.1 }));
    if (vc.credit && vc.credit.voice) vc.credit.voice.stop();
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
    north: vc.open.has('0,-1'), turnHold: (g._f(1 / 30), g.gestures.turnHold), gmode: g.gestures.mode };
});
check(start.state === 'volcanic' && start.depth === 1 && start.pos.join() === '0,0', 'a run starts in the first cave, at its start');
check(start.turns && start.gm === 'drive' && start.gmode === 'drive' && start.turnHold, 'the cave turns with you, with the driving gestures and turning both on');
check(start.room === 'lab', 'a cave\'s echo');
check(start.air === 'vc_air' && start.lava === 'vc_lava' && /^engine_\d+$/.test(start.engine || ''), `the cave's air, the lava and the engine play: ${start.air}, ${start.lava}, ${start.engine}`);
check(Math.abs(start.clock - 120) < 0.1, 'two minutes on the clock: ' + start.clock);
check(start.north, 'the first passage leads ahead, north');

// ------------------------------------------------------------------ driving, turning, walls
const drive = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const vc = g.vc;
  t.straight();
  g.input('accel_on'); t.frames(1.0); const s1 = vc.speed; const y1 = g.playerPos[1];
  g.input('accel_off'); t.frames(0.5); const s2 = vc.speed;
  g.input('down'); const s3 = vc.speed;
  // Turn right a quarter (three flicks): east is rock, so driving on hits the wall.
  vc.speed = 0; g.input('right'); t.frames(0.3); g.input('right'); t.frames(0.3); g.input('right'); t.frames(0.3);
  const face = g.tn.face;
  t.played.length = 0; g.input('accel_on'); t.frames(1.5); g.input('accel_off');
  const rock = t.played.filter((n) => n === 'vc_rock').length; const stopped = vc.speed; const x = g.playerPos[0];
  // A quick turn back north, then 30 degrees off: the car slides along the passage wall.
  t.face(0); g.input('right'); t.frames(0.3); const y0 = g.playerPos[1]; vc.speed = 6; g.input('accel_on'); t.frames(0.5); g.input('accel_off');
  const slid = g.playerPos[1] < y0 - 1 && Math.abs(g.playerPos[0]) <= 3.0001;
  return { s1, y1, s2, s3, face, rock, stopped, x, slid, clock: g.timeLeft };
});
check(drive.s1 > 5 && drive.y1 < -2, `the throttle accelerates the car the way it faces (speed ${drive.s1.toFixed(1)}, ${(-drive.y1).toFixed(1)} units north)`);
check(drive.s2 < drive.s1 && drive.s2 > 0, 'lifting the finger, the car coasts');
check(drive.s3 < drive.s2, 'a brake slows it');
check(Math.abs(drive.face - Math.PI / 2) < 1e-6, 'three flicks turn it a quarter, to east');
check(drive.rock >= 1 && drive.stopped === 0 && Math.abs(drive.x) <= 3.0001, `driven into the rock: a thud, and the car stops in the passage (${drive.rock} thuds)`);
check(drive.slid, 'turned a little off the passage, the car slides on along its wall');

// ------------------------------------------------------------------ bombs
const bomb = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const vc = g.vc;
  t.straight([[0, -3]]);
  t.placed.length = 0; t.frames(1.2);
  const ticks = t.placed.filter(([n]) => n === 'vc_tick');
  const tickAt = ticks.length ? ticks[0][1].join() : null;
  // Brushing past, turned a little toward the wall and sliding along it: nothing.
  g.playerPos = [2.8, -1]; vc.speed = 4; t.face(0); g.input('right'); t.frames(0.3); g.input('accel_on'); t.frames(2.5); g.input('accel_off');
  const passed = vc.bombs.length === 1 && !vc.boom && g.playerPos[1] < -21;
  const brushAt = g.playerPos.map((x) => +x.toFixed(2));
  // Driving squarely down the passage, the car keeps to its middle.
  t.straight(); g.playerPos = [2.5, 0]; vc.speed = 6; t.face(0); g.input('accel_on'); t.frames(2.0); g.input('accel_off');
  const centred = Math.abs(g.playerPos[0]) < 0.05;
  // Head on: it goes off, and a moment later you are back at the start; the clock ran on.
  t.straight([[0, -3]]); t.played.length = 0; const c0 = g.timeLeft;
  g.input('accel_on'); t.frames(2.6); g.input('accel_off');
  const boomed = t.played.includes('vc_boom'); const gone = vc.bombs.length === 0;
  t.frames(2.0);
  return { ticks: ticks.length, tickAt, passed, brushAt, centred, boomed, gone, back: g.playerPos.join(), ran: c0 - g.timeLeft };
});
check(bomb.ticks >= 2 && bomb.tickAt === '0,-18', `a bomb ticks twice a second from where it lies (${bomb.ticks} ticks in 1.2 s at ${bomb.tickAt})`);
check(bomb.passed, 'brushing past a bomb, sliding along the wall, does nothing: ' + bomb.brushAt);
check(bomb.centred, 'driving squarely down a passage, the car keeps to its middle (so a bomb ahead is met head on)');
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
  const popped = t.played.includes('vc_pop'); const c1 = g.timeLeft;
  t.frames(2.0);
  const v2 = g.vc;
  return { beeps: beeps.length, far, near, atHole, popped, waited: Math.abs(c1 - c0) < 0.4, depth: v2.depth, said: t.said.slice(), land: t.played.includes('vc_land'),
    pos: g.playerPos.join(), sameAir: v2.air === vc.air || (v2 === vc), lava: v2.lava && v2.lava.name };
});
check(hole.beeps >= 1 && hole.near > hole.far && hole.atHole === '0,-48', `the hole beeps from where it is, higher the nearer you are (pitch ${hole.far} far, ${hole.near} near)`);
check(hole.popped && hole.land, 'driving into the hole: a pop, then the landing below');
check(hole.depth === 2 && hole.pos === '0,0', 'and you are at the start of the next cave down, level 2');
check(!hole.said.some((x) => /level/i.test(x)), 'no voice says the level: ' + JSON.stringify(hole.said));

// ------------------------------------------------------------------ round a bend, and the facing kept through the drop
const bend = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const vc = g.vc;
  // An L: north four cells, then east four, the hole at the end.
  vc.open = new Set(); for (let i = 0; i <= 4; i++) vc.open.add(`0,${-i}`); for (let i = 1; i <= 4; i++) vc.open.add(`${i},-4`);
  vc.hole = [4, -4]; vc.bombs = []; if (vc.credit && vc.credit.voice) vc.credit.voice.stop(); vc.credit = null;
  g.playerPos = [0, 0]; vc.speed = 0; t.face(0);
  g.input('accel_on'); t.frames(4); g.input('accel_off');              // to the thud at the bend
  const atBend = g.playerPos.slice();
  g.input('right'); t.frames(0.3); g.input('right'); t.frames(0.3); g.input('right'); t.frames(0.3);
  const depth0 = vc.depth;
  g.input('accel_on'); t.frames(4); g.input('accel_off');
  const dropping = !!vc.drop; const faceInDrop = g.tn.face; t.frames(0.5); const faceLater = g.tn.face;
  t.frames(2.0);
  return { atBend, depth0, depth1: g.vc.depth, dropping, faceInDrop, faceLater, faceAfter: g.tn.face, northOpen: g.vc.open.has('0,-1'), eastOpen: g.vc.open.has('1,0') };
});
check(bend.depth1 === bend.depth0 + 1, `round a bend, the hole is reached (level ${bend.depth0} to ${bend.depth1}; stopped at the bend at ${bend.atBend.map((x) => x.toFixed(1))})`);
check(Math.abs(bend.faceInDrop - Math.PI / 2) < 1e-6 && Math.abs(bend.faceLater - Math.PI / 2) < 1e-6 && Math.abs(bend.faceAfter - Math.PI / 2) < 1e-6, 'the drop keeps the way you faced (east)');
check(bend.eastOpen && !bend.northOpen, 'and the next cave is laid out ahead of it, to the east');

// ------------------------------------------------------------------ the report, the credit, the lava
const misc = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const vc = g.vc;
  t.said.length = 0; g.input('enter'); const report = t.said.slice();
  t.straight([], { cell: [0, -2], pos: g._vcPos([0, -2]), value: 20, beacon: 'credit_beacon_battle_15', pickup: 'credit_20', voice: null });
  const c0 = g.timeLeft; t.played.length = 0; g.input('accel_on'); t.frames(2.2); g.input('accel_off');
  const took = g.timeLeft - c0;
  const coins = t.played.includes('credit_20');
  return { report, took, coins, credit: vc.credit };
});
check(misc.report.length === 1 && /^Level 3\./.test(misc.report[0]) && /seconds/.test(misc.report[0]) && /Facing/.test(misc.report[0]), 'double tap reports the level, the clock and the way you face: ' + misc.report[0]);
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
  const st = g.state; const holes = vc && vc.holes; const credit = vc && vc.credit;
  t.straight([[0, -3]]);
  const hp0 = g.towerHp; const c0 = g.timeLeft;
  g.input('accel_on'); t.frames(2.6); g.input('accel_off');
  const hurt = hp0 - g.towerHp; const lost = c0 - g.timeLeft; const stay = !vc.boom && Math.abs(g.playerPos[1]) > 15;
  t.said.length = 0; g.input('enter'); const report = t.said.slice();
  // Reach the hole twice: the level is won.
  let pts0 = g.chaosPoints;
  t.straight(); g.playerPos = [0, -44]; vc.speed = 6; g.input('accel_on'); t.frames(0.6); g.input('accel_off'); t.frames(2.0);
  const second = g.vc; const depth2 = second && second.depth; const reached = second && second.reached;
  t.straight(); g.playerPos = [0, -44]; second.speed = 6; g.input('accel_on'); t.frames(0.6); g.input('accel_off'); t.frames(2.0);
  return { st, holes, credit, hurt, lost, stay, report, depth2, reached, won: g.chaosPoints - pts0, after: g.state };
});
check(chaos.st === 'volcanic' && chaos.holes === 2 && !chaos.credit, 'a Chaos Volcanic level asks for two holes the first time, with no credits');
check(chaos.hurt === 20 && chaos.lost > 14 && chaos.stay, `a bomb there costs 20 health and 15 seconds, and you drive on (${chaos.hurt} health, ${chaos.lost.toFixed(1)} s)`);
check(chaos.report.length === 1 && /^Level 1 of 2\./.test(chaos.report[0]) && /health/.test(chaos.report[0]) && /points/.test(chaos.report[0]), 'double tap there: the cave of those wanted, health, clock and points: ' + chaos.report[0]);
check(chaos.reached === 1 && chaos.depth2 === 2, 'the first hole drops you into a new cave');
check(chaos.won >= 10 && chaos.after !== 'volcanic', `the second wins the level (${chaos.won} points, now ${chaos.after})`);

check(errors.length === 0, 'no page errors: ' + errors.slice(0, 5).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
