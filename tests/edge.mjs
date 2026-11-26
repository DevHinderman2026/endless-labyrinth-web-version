// The Edge (web 8.0.0): The Abyss's menu, the crossing's layout, throwing glass, loose
// stones, falling, the buzzer and the next crossing, and the Edge levels of Chaos Mode.
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/edge.mjs http://localhost:8765
// It cannot hear: it checks what plays, where, and what the game does.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

// ------------------------------------------------------------------ the layout, on its own
{
  const E = await import('../js/modes/edge.js');
  let ok = true; let widest = 0; let lens = new Set(); let bendsOk = true; let neverBeside = true; let patchOk = true; let neverBack = true; let drift = 0; let exitAhead = true;
  for (let i = 0; i < 400; i++) {
    const bends = E.bendsFor(1 + (i % 15));
    const lay = E.layCrossing(bends);
    const has = (x, y) => lay.stones.has(`${x},${y}`);
    // The starting square: five across, you in the middle, two steps from the edge every way.
    for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) if (!has(x, y)) ok = false;
    for (const [dx, dy] of [[0, -3], [3, 0], [0, 3], [-3, 0]]) if (dx === 0 && dy === -3 ? false : has(dx, dy)) ok = false;
    // The ledge: from the middle of the north side; runs of one or two stones between quarter turns.
    const L = lay.ledge;
    if (L[0][0] !== 0 || L[0][1] !== -3) ok = false;
    let run = 1; let turns = 0;
    for (let k = 1; k < L.length; k++) {
      const d = [L[k][0] - L[k - 1][0], L[k][1] - L[k - 1][1]];
      if (d[1] > 0) neverBack = false;
      drift = Math.max(drift, Math.abs(L[k][0]));
      if (Math.abs(d[0]) + Math.abs(d[1]) !== 1) ok = false;
      const prev = k >= 2 ? [L[k - 1][0] - L[k - 2][0], L[k - 1][1] - L[k - 2][1]] : [0, -1];
      if (d[0] === prev[0] && d[1] === prev[1]) run += 1; else { lens.add(run); run = 1; turns += 1; if (d[0] === -prev[0] && d[1] === -prev[1]) ok = false; }
      widest = Math.max(widest, run);
    }
    if (turns !== bends) bendsOk = false;
    // One step wide: each stone of the ledge touches, side to side, only the stones before and after it.
    for (let k = 0; k < L.length; k++) {
      const [x, y] = L[k];
      const touch = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => has(x + dx, y + dy)).length;
      if (touch !== 2) neverBeside = false;
    }
    // The far side: open stone three across, three deep, the exit at its far end.
    if (lay.patch.length !== 9 || !has(...lay.exit)) patchOk = false;
    const lastTwo = L.slice(-1)[0]; if (!(lay.exit[0] === lastTwo[0] && lay.exit[1] < lastTwo[1])) exitAhead = false;
  }
  check(ok, 'every crossing starts on a square five stones across, the ledge leaving from the middle of the side ahead');
  check(widest <= 2 && [...lens].every((n) => n >= 1 && n <= 2), `the ledge never runs straight more than two stones between bends (longest ${widest})`);
  check(bendsOk, 'each crossing has exactly the bends it should, all quarter turns');
  check(neverBeside, 'the ledge is one stone wide everywhere: it never runs beside itself');
  check(patchOk, 'the far side opens out three across and three deep, with the exit on stone');
  check(neverBack, 'the path only ever goes forward or sideways, never back, away from the buzzer (8.0.3)');
  check(drift <= 4, `it never drifts more than four steps to either side (${drift})`);
  check(exitAhead, 'its last stretch is forward, the exit straight on from it');
  check(E.bendsFor(1) === 6 && E.bendsFor(2) === 8 && E.bendsFor(99) === 30, 'six bends in the first crossing, two more each crossing, at most thirty');
  check(E.bendsFor(1, E.ED_CHAOS_BENDS) === 6 && E.bendsFor(2, E.ED_CHAOS_BENDS) === 8 && E.bendsFor(50, E.ED_CHAOS_BENDS) === 12, 'in chaos: six, two more each time, at most twelve (8.0.3)');
  check(String(E.turnCell([0, -1], 1)) === '1,0' && String(E.turnCell([0, -1], 2)) === '0,1' && String(E.turnCell([0, -1], 3)) === '-1,0', 'a crossing can be turned to face any main direction');
}

// ------------------------------------------------------------------ the recordings (read from the files)
{
  const { readFileSync } = await import('node:fs');
  const root = new URL('..', import.meta.url).pathname;
  const manifest = JSON.parse(readFileSync(root + 'packs/manifest.json', 'utf8'));
  const p = manifest.packs.edge;
  const buf = readFileSync(root + 'packs/' + p.file);
  const n = buf.readUInt32LE(8);
  const head = JSON.parse(buf.slice(12, 12 + n).toString('utf8'));
  const want = ['ed_step_1', 'ed_step_2', 'ed_step_3', 'ed_step_4', 'ed_glass_stone', 'ed_glass_whoosh', 'ed_glass_below', 'ed_kick', 'ed_fall', 'ed_scream'];
  check(buf.length === p.bytes && head.pack === 'edge' && head.entries.length === 10 && want.every((w) => head.entries.some((e) => e.name === w)),
    'the edge pack holds its ten recordings (8.0.1: four gravel steps, the glass set down on gravel): ' + head.entries.map((e) => `${e.name} ${(e.frames / head.rate).toFixed(2)} s`).join(', '));
  check(head.entries.every((e) => !e.loop && buf.slice(12 + n + e.offset, 12 + n + e.offset + 4).toString() === 'OggS'), 'all of them Ogg one-shots');
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
  // Face a main direction (0 north, 1 east, 2 south, 3 west).
  t.face = (k) => { g._turnStop(); g._face(k * Math.PI / 2, true); };
  t.dirTo = (from, to) => { const dx = to[0] - from[0]; const dy = to[1] - from[1]; return dx > 0 ? 1 : dx < 0 ? 3 : dy > 0 ? 2 : 0; };
});

// ------------------------------------------------------------------ The Abyss's menu
const menu = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  const keys = g.menuKeys.slice();
  g.menuIndex = g.menuKeys.indexOf('abyss'); t.said.length = 0; g.input('enter');
  const st1 = g.state; const s1 = t.said.slice();
  g.input('down'); const s2 = t.said[t.said.length - 1];
  g.input('down'); const s3 = t.said[t.said.length - 1];
  g.input('down'); const s4 = t.said[t.said.length - 1];
  g.input('back'); const st2 = g.state;
  g.menuIndex = g.menuKeys.indexOf('abyss'); g.input('enter'); g.input('enter'); const st3 = g.state;
  t.menu(); g.menuIndex = g.menuKeys.indexOf('abyss'); g.input('enter'); g.input('down'); g.input('enter'); const st4 = g.state;
  return { keys, st1, s1, s2, s3, s4, st2, st3, st4, edgeKey: keys.includes('edge') };
});
check(menu.st1 === 'abyss_menu' && /The Abyss\. Swipe up and down/.test(menu.s1.join(' ')), 'The Abyss on the main menu opens its own menu: ' + menu.s1.join(' | '));
check(menu.s2 === 'The Edge' && menu.s3 === 'Back to the main menu' && menu.s4 === 'The Abyss', 'it offers The Abyss, The Edge, and Back');
check(menu.st2 === 'menu', 'Back (triple tap) returns to the main menu');
check(menu.st3 === 'abyss', 'The Abyss, chosen there, starts The Abyss as before');
check(menu.st4 === 'edge', 'The Edge, chosen there, starts The Edge');
check(!menu.edgeKey, 'The Edge has no main menu entry of its own');

// ------------------------------------------------------------------ the start
const start = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const ed = g.ed;
  return { state: g.state, crossing: ed.crossing, cell: ed.cell, pos: g.playerPos, said: t.said.slice(), turns: g._turnsNow(),
    room: g._currentRoom(), amb: ed.amb && ed.amb.voice && ed.amb.voice.name, face: g.tn.face, clock: g.timeLeft,
    exit: ed.exit, stones: ed.stones.size, ledge0: ed.stones.has('0,-3'), side: ['3,0', '0,3', '-3,0'].some((k) => ed.stones.has(k)), square: [-2, -1, 0, 1, 2].every((x) => [-2, -1, 0, 1, 2].every((y) => ed.stones.has(`${x},${y}`))),
    creatures: !!(g.ab && g.ab.creatures && g.ab.creatures.length) };
});
check(start.state === 'edge' && start.crossing === 1 && start.said.includes('Crossing 1.'), 'a run starts on crossing 1, and says so');
check(start.square && start.cell.join() === '0,0', 'you start in the middle of a square of stone, two steps from the edge every way');
check(start.face === 0 && start.ledge0 && !start.side, 'facing north, the ledge leaving ahead of you');
check(start.turns && start.room === 'open', 'The Edge turns with you, in open air with no echo');
check(/howling_wind/.test(start.amb || ''), 'the abyss\'s wind plays: ' + start.amb);
check(!start.creatures, 'no creatures');

// ------------------------------------------------------------------ the buzzer
const buzz = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  t.played.length = 0; t.frames(4);
  const bz = g.ed.buzz;
  return { played: t.played.filter((n) => n === 'mu_buzzer').length, live: !!(bz.voice) };
});
check(buzz.played >= 1, `the Museum's buzzer sounds from the far side from the start (${buzz.played} buzzes in 4 s)`);

// ------------------------------------------------------------------ throwing glass
const glass = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const ed = g.ed;
  const E = g.edNames;
  t.face(0); t.placed.length = 0; t.played.length = 0;
  g.input('space'); t.frames(0.5);
  const onStone = t.placed.map(([n, p]) => [n, p.join()]);
  // At the square's north edge, facing west: over the edge.
  ed.cell = [-2, 0]; g.playerPos = g._edPos(ed.cell); t.face(3); t.placed.length = 0;
  g.input('space'); const whoosh = t.placed.map(([n, p]) => [n, p.join()]);
  t.placed.length = 0; t.frames(3);
  const below = t.placed.map(([n, p]) => [n, p.join()]);
  // A little off a main direction still throws along it.
  ed.cell = [0, 0]; g.playerPos = [0, 0]; g._turnStop(); g._face(0.35, true); t.placed.length = 0; t.frames(0.5);
  g.input('space'); const off = t.placed.map(([n, p]) => p.join()); const offName = t.placed.map(([n]) => n);
  const rel = t.placed.length ? g._rel(t.placed[0][1]) : null; const offRel = rel ? [+rel[0].toFixed(3), +rel[1].toFixed(3)] : null;
  // Turned a little off west at the square's west edge: over the edge, still straight ahead.
  ed.cell = [-2, 0]; g.playerPos = g._edPos(ed.cell); g._turnStop(); g._face(3 * Math.PI / 2 + 0.35, true); t.placed.length = 0; t.frames(0.5);
  g.input('space'); const wRel = t.placed.length ? g._rel(t.placed[0][1]) : null; const wName = t.placed.map(([n]) => n);
  return { onStone, whoosh, below, off, offName, offRel, wRel: wRel && [+wRel[0].toFixed(3), +wRel[1].toFixed(3)], wName, names: Object.fromEntries(E), throws: ed.throws };
});
check(glass.names.ed_glass_stone === 'ed_glass_stone' && glass.names.ed_scream === 'ed_scream' && glass.names.ed_kick === 'ed_kick', 'The Edge plays its own recordings: ' + JSON.stringify(glass.names));
check(glass.onStone.length === 1 && glass.onStone[0][0] === glass.names.ed_glass_stone && glass.onStone[0][1] === '0,-3', 'glass thrown ahead shatters on the stone one step ahead: ' + JSON.stringify(glass.onStone));
check(glass.whoosh.length === 1 && glass.whoosh[0][0] === glass.names.ed_glass_whoosh && glass.whoosh[0][1] === '-9,0', 'glass thrown over the edge whooshes away from there: ' + JSON.stringify(glass.whoosh));
check(glass.below.length === 1 && glass.below[0][0] === glass.names.ed_glass_below, 'and a moment later breaks far below: ' + JSON.stringify(glass.below));
check(glass.off.length === 1 && glass.offName[0] === glass.names.ed_glass_stone && glass.offRel && Math.abs(glass.offRel[0]) < 0.01 && glass.offRel[1] > 2.9, 'turned a little off north, the glass still lands on the stone to the north, and is heard straight in front of you (8.0.2): ' + JSON.stringify(glass.offRel));
check(glass.wName[0] === glass.names.ed_glass_whoosh && glass.wRel && Math.abs(glass.wRel[0]) < 0.01 && glass.wRel[1] > 2.9, 'turned a little off west at the edge, the glass goes over it, heard straight in front of you: ' + JSON.stringify(glass.wRel));

// ------------------------------------------------------------------ walking and loose stones
const walk = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const ed = g.ed;
  ed.cell = [0, 0]; g.playerPos = [0, 0]; t.face(0); t.played.length = 0;
  g.input('up'); const c1 = ed.cell.join(); const step = t.played.slice();
  g.input('down'); const c2 = ed.cell.join();
  // Every edge stone loose: walking to the square's east side kicks one off.
  const n = g.edNames.get('ed_kick');
  ed.loose.clear(); ed.loose.set('2,0>1,0', true);   // (the mode keeps its own Math.random: the stone is made loose by hand)
  t.face(1); t.placed.length = 0; g.input('up'); g.input('up');
  const kicked = t.placed.filter(([nm]) => nm === n).map(([, p]) => p.join());
  // Back and forward again: it warns again (8.0.2: every time).
  ed.loose.clear(); g.input('down'); t.placed.length = 0; g.input('up');
  const again = t.placed.filter(([nm]) => nm === n).length;
  // None loose: no warning at all.
  ed.loose.clear(); ed.loose.set('2,-2>0,-1', false); t.face(0); t.placed.length = 0; g.input('up'); g.input('up');
  const none = t.placed.filter(([nm]) => nm === n).length;
  return { c1, c2, step, kicked, again, none, cell: ed.cell.join(), state: g.state };
});
check(walk.c1 === '0,-1' && walk.c2 === '0,0' && walk.step.some((s) => /^ed_step_[1-4]$/.test(s)), 'a step forward and back, with a footstep on gravel (8.0.1): ' + walk.step.join());
check(walk.kicked.length === 1 && walk.kicked[0] === '9,0', 'at the edge, a loose stone is kicked off ahead of you: ' + JSON.stringify(walk.kicked));
check(walk.again === 1, 'back and forward again: the warning comes again, every time (8.0.2)');
check(walk.none === 0 && walk.state === 'edge', 'a stone that is not loose gives no warning');

// ------------------------------------------------------------------ falling, in The Edge
const fall = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const ed = g.ed;
  ed.cell = [2, 0]; g.playerPos = g._edPos(ed.cell); t.face(1); t.played.length = 0; t.said.length = 0;
  g.input('up');
  const falling = !!ed.falling; const played = t.played.slice();
  const nm = g.edNames;
  t.frames(1.0); const stillRun = g.state;
  t.frames(2.0);
  return { falling, played, scream: nm.get('ed_scream'), fallName: nm.get('ed_fall'), stillRun, state: g.state, said: t.said.slice() };
});
check(fall.falling && fall.played.includes(fall.fallName), 'stepping off the edge, you fall');
check(fall.stillRun === 'edge' && fall.state === 'game_over', 'the fall plays out, then the run is over');
check(fall.said.some((s) => /You fell into the abyss\. You finished 0 crossings\./.test(s)), 'and the voice says so: ' + fall.said.join(' | '));

// ------------------------------------------------------------------ a whole crossing, by the stones
const cross = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  const E = await import('./js/modes/edge.js');
  t.menu(); g.menuIndex = g.menuKeys.indexOf('abyss'); g.input('enter'); g.input('down'); g.input('enter'); t.frames(0.2);
  const ed = g.ed;
  // Find the way by breadth-first search over the stones, then walk it, facing each step.
  const goal = ed.exit.join();
  const prev = new Map([['0,0', null]]); const q = ['0,0'];
  while (q.length) {
    const c = q.shift(); if (c === goal) break;
    const [x, y] = c.split(',').map(Number);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { const n = `${x + dx},${y + dy}`; if (ed.stones.has(n) && !prev.has(n)) { prev.set(n, c); q.push(n); } }
  }
  const path = []; for (let c = goal; c; c = prev.get(c)) path.unshift(c.split(',').map(Number));
  t.said.length = 0;
  for (let i = 1; i < path.length; i++) { t.face(t.dirTo(path[i - 1], path[i])); g.input('up'); t.frames(0.05); }
  const next = !!g.ed.next; const crossed = g.ed.crossed;
  t.frames(2.0);
  return { len: path.length, next, crossed, crossing: g.ed.crossing, said: t.said.slice(), bends: g.ed.bends, state: g.state, board: g.scores.scores.edge || 0 };
});
check(cross.next && cross.crossed === 1, `walking the ledge to the buzzer finishes the crossing (${cross.len} stones)`);
check(cross.crossing === 2 && cross.bends === 8 && cross.said.includes('Crossing 2.'), 'a moment later crossing 2 begins, with two more bends');

// ------------------------------------------------------------------ the report and the clock
const rep = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; t.said.length = 0;
  g.input('enter'); g.input('clock');
  return t.said.slice();
});
check(rep.length === 1 && /^Crossing 2\. Crossed: 1\. Facing /.test(rep[0]), 'double tap: the crossing, the crossings finished, the way you face: ' + rep.join(' | '));

// ------------------------------------------------------------------ the recorded voice says its lines
{
  const { readFileSync } = await import('node:fs');
  const { plan, makeIndex } = await import('../js/voice-text.js');
  const root = new URL('..', import.meta.url).pathname;
  const manifest = JSON.parse(readFileSync(root + 'packs/manifest.json', 'utf8'));
  const buf = readFileSync(root + 'packs/' + manifest.packs['voice-bella'].file);
  const n = buf.readUInt32LE(8);
  const idx = makeIndex(JSON.parse(buf.slice(12, 12 + n).toString('utf8')).entries);
  const lines = ['Crossing 1.', 'Crossing 12.', 'Crossing 3. Crossed: 2.', 'Lost 60 seconds. 65 health. 120 seconds remaining.', 'Lost 60 seconds. 5 health. 7 seconds remaining.'];
  const missing = lines.filter((s) => !plan(s, idx));
  check(missing.length === 0, 'every line The Edge says during a run is in the recorded voice' + (missing.length ? ': missing ' + missing.join(' | ') : ''));
}

// ------------------------------------------------------------------ Chaos
const chaos = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.menu();
  const pick = g._chaosPickNext;
  const seq = ['edge', 'standard', 'standard'];
  g._chaosPickNext = () => seq.shift() || 'standard';
  g.menuIndex = g.menuKeys.indexOf('chaos'); g.input('enter'); t.frames(0.2);
  const ed = g.ed;
  const r = { state: g.state, chaos: ed && ed.chaos, bends: ed && ed.bends, clock0: g.timeLeft, hp0: g.towerHp };
  t.frames(10); r.clock1 = g.timeLeft;
  // A fall: 35 health and 60 seconds, then back on the stone you left.
  ed.cell = [0, -1]; g.playerPos = g._edPos(ed.cell); t.face(1); g.input('up'); g.input('up'); g.input('up');
  r.fallingAt = ed.falling && ed.falling.at.join();
  t.said.length = 0; t.frames(3);
  r.hp1 = g.towerHp; r.clock2 = g.timeLeft; r.back = ed.cell.join(); r.said = t.said.slice(); r.state2 = g.state;
  // Report.
  t.said.length = 0; g.input('enter'); r.report = t.said.slice();
  // Facing east, the next crossing would lie to the east: try the layout turning.
  // Low on time: a fall that takes the clock to nothing ends the run.
  g.timeLeft = 50; ed.cell = [2, 0]; g.playerPos = g._edPos(ed.cell); t.face(1); g.input('up'); t.said.length = 0; t.frames(3);
  r.end = g.state; r.endSaid = t.said.slice();
  g._chaosPickNext = pick;
  return r;
});
check(chaos.state === 'edge' && chaos.chaos && chaos.bends === 6, 'Chaos can bring an Edge level, six bends the first time');
check(Math.abs(chaos.clock1 - chaos.clock0) < 0.01, `the chaos clock waits through the level (${chaos.clock0} then ${chaos.clock1})`);
check(chaos.fallingAt === '1,-1' || chaos.fallingAt === '3,-1', 'off the edge in chaos you fall too');
check(chaos.hp1 === chaos.hp0 - 35 && Math.abs(chaos.clock2 - (chaos.clock0 - 60)) < 0.01, `a fall costs 35 health and 60 seconds (${chaos.hp0} to ${chaos.hp1}, ${chaos.clock0} to ${chaos.clock2})`);
check(chaos.state2 === 'edge' && chaos.back === String([Number(chaos.fallingAt.split(',')[0]) - 1, -1]), 'and you are put back on the stone you stepped off from: ' + chaos.back);
check(chaos.said.some((s) => /^Lost 60 seconds\. \d+ health\. \d+ seconds remaining\.$/.test(s)), 'the voice says what it cost: ' + chaos.said.join(' | '));
check(chaos.report.length === 1 && /health\. Clock \d+ seconds\. \d+ points total\. Facing /.test(chaos.report[0]), 'double tap in chaos: health, clock, points: ' + chaos.report.join(' | '));
check(chaos.end === 'game_over' && chaos.endSaid.some((s) => /^Time up\./.test(s)), 'with less than 60 seconds left, a fall ends the run: ' + chaos.endSaid.join(' | '));

// A chaos crossing reached: the next level.
const chaos2 = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.menu();
  const pick = g._chaosPickNext;
  const seq = ['edge', 'standard', 'standard'];
  g._chaosPickNext = () => seq.shift() || 'standard';
  // Facing east when the level begins: the crossing lies to the east.
  g.menuIndex = g.menuKeys.indexOf('chaos'); g.input('enter');
  const ed0 = g.ed; t.face(1);
  g.ed = null; g._edBegin({ chaos: true, crossing: 1 }); const ed = g.ed;
  const east = ed.exit[0] > 2;
  const goal = ed.exit.join();
  const prev = new Map([['0,0', null]]); const q = ['0,0'];
  while (q.length) {
    const c = q.shift(); if (c === goal) break;
    const [x, y] = c.split(',').map(Number);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { const n = `${x + dx},${y + dy}`; if (ed.stones.has(n) && !prev.has(n)) { prev.set(n, c); q.push(n); } }
  }
  const path = []; for (let c = goal; c; c = prev.get(c)) path.unshift(c.split(',').map(Number));
  const pts = g.chaosPoints;
  for (let i = 1; i < path.length; i++) { t.face(t.dirTo(path[i - 1], path[i])); g.input('up'); }
  const st = g.state;
  g._chaosPickNext = pick;
  return { east, st, pts0: pts, pts1: g.chaosPoints, ed0: !!ed0 };
});
check(chaos2.east, 'in chaos the crossing lies ahead of the way you face (east, here)');
check(chaos2.st !== 'edge' && chaos2.pts1 === chaos2.pts0 + 10, `reaching the buzzer in chaos goes on to the next level, for ten points (${chaos2.st})`);

// ------------------------------------------------------------------ help and high scores
const help = await page.evaluate(async () => {
  const g = window.__el.game;
  const { MODES } = await import('./js/modes/index.js');
  const names = MODES.flatMap((m) => (m.help && m.help.sections) || []).map(([n]) => n);
  return { names, lines: g._scoreLines() };
});
check(help.names.indexOf('The Edge') === help.names.indexOf('The Abyss') + 1, 'The Edge\'s help comes right after The Abyss\'s');
check(help.lines.some((l) => /^The Edge: /.test(l)), 'The Edge has its own high score board: ' + help.lines.find((l) => /Edge/.test(l)));

check(errors.length === 0, 'no errors on the page: ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
