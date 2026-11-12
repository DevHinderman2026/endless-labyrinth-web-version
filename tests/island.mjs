// Island Mode, played by script in a real browser engine (Chromium, through
// Playwright). Run: serve the site folder (python3 -m http.server 8772), then
//   node tests/island.mjs http://localhost:8772
// A simple bot shoots centred enemies, dives for ammo and the key, and rides the
// elevator up; the test checks the rules that matter. It cannot hear.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8772';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
// Web 5.0.0: the walking modes turn with you. These bots still think in the
// world's own directions, so `go` takes one step north, east, south or west
// whichever way the player faces, and leaves them facing north, where the old
// rules of thumb (an enemy due north or south is in the line of fire) still hold.
// Turning itself is tested in tests/turning5.mjs.
await page.addInitScript(() => {
  window.go = (d) => {
    const g = window.__el.game;
    const way = { up: 0, right: Math.PI / 2, down: Math.PI, left: 3 * Math.PI / 2 }[d];
    if (way === undefined || !g._turnsNow()) { g.input(d); return; }
    g._turnStop(); g._face(way, true); g.input('up');
    if (g._turnsNow()) g._face(0, true);
  };
  // Turn to face an enemy, fire, and face north again: how a shot is aimed now.
  window.shootAt = (o) => {
    const g = window.__el.game;
    if (!g._turnsNow()) { g.input('space'); return; }
    g._turnStop(); g._face(Math.atan2(o.x - g.playerPos[0], -(o.y - g.playerPos[1])), true);
    g.input('space');
    if (g._turnsNow()) g._face(0, true);
  };
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 60000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
const said = () => page.evaluate(() => document.getElementById('said').textContent);

// Menu, help and boards.
const menu = await page.evaluate(() => {
  const g = window.__el.game;
  return { options: g.menuOptions, lines: g._scoreLines() };
});
check(menu.options.includes('Island Mode'), 'the main menu has Island Mode: ' + menu.options.join(' | '));
check(menu.lines.includes('Island Mode: No score yet'), 'the high score list has the Island board');

// Helpers inside the page: start a run, play frames, the bot.
await page.evaluate(() => {
  const g = window.__el.game;
  const a = window.__el.audio;
  window.__t = {
    start() {
      g.state = 'menu';
      g.menuIndex = g.menuKeys.indexOf('island');
      g.input('enter');
    },
    loops() { return [...a.live].filter((v) => v.loop && !v.stopped).map((v) => v.name); },
    played: [],
  };
  const play = a.play.bind(a);
  a.play = (name, opts) => { window.__t.played.push(name); return play(name, opts); };
  // One bot decision: walk toward a spot (one step on the longer axis).
  window.__t.walk = (tx, ty) => {
    const [px, py] = g.playerPos;
    const dx = tx - px; const dy = ty - py;
    if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5) return false;
    if (Math.abs(dx) >= Math.abs(dy)) window.go(dx > 0 ? 'right' : 'left'); else window.go(dy > 0 ? 'down' : 'up');
    return true;
  };
  window.__t.bot = () => {
    const t = window.__t;
    const [px, py] = g.playerPos;
    if (g.islandRide) return;
    if (g.islandPhase === 'seabed') {
      // The key first, then the diver and ammo while the air lasts, then up.
      const key = g.islandItems.find((it) => it.kind === 'key');
      if (key) { t.walk(...key.pos); return; }
      const vent = g.islandItems.find((it) => it.kind === 'vent');
      if (vent && g.islandAir < 20) { t.walk(...vent.pos); return; }
      const diver = g.islandItems.find((it) => it.kind === 'diver');
      if (diver && g.islandAir > 14) { t.walk(...diver.pos); return; }
      const p = g.ammoPickups[0];
      if (p && g.islandAir > 14 && g.ammo < 30) { t.walk(p.x, p.y); return; }
      t.walk(...g.islandElevator);
      return;
    }
    // On the island.
    const guardian = g.obstacles.find((o) => o.guardian);
    const regular = g.obstacles.filter((o) => !o.guardian);
    if (g.islandCleared && !guardian) { t.walk(0, 0); return; }
    if (g.ammo <= 0) { t.walk(0, 0); return; }                 // dive to reload
    const locked = g._battleLocked();
    if (locked && (!locked.guardian || Math.hypot(locked.x - px, locked.y - py) > 8)) { g.input('space'); return; }
    if (regular.length) {
      let near = regular[0];
      for (const o of regular) if (Math.hypot(o.x - px, o.y - py) < Math.hypot(near.x - px, near.y - py)) near = o;
      if (g.ammo > 0) window.shootAt(near); else window.go(near.x > px ? 'right' : 'left');
      return;
    }
    if (guardian) {
      // Stand north or south of its post, out of its reach, and shoot.
      const [gx, gy] = guardian.post;
      const ty = Math.abs(gy + 17) <= 33 ? gy + 17 : gy - 17;
      t.walk(gx, ty);
    }
  };
});

// --------------------------------------------------------------- the start of a run
const st = await page.evaluate(async () => {
  const g = window.__el.game;
  window.__t.start();
  for (let i = 0; i < 40; i++) { g.frame(1 / 30); await new Promise((r) => setTimeout(r, 5)); }
  const amb = g.islandAmb;
  return {
    state: g.state, ammo: g.ammo, n: g.islandNumber, room: window.__el.audio.room,
    shore: g.islandShore, surface: amb.surface && amb.surface.name, muffled: amb.muffled && amb.muffled.name,
    under: amb.under && amb.under.name, levels: [amb.surface && amb.surface.l, amb.muffled && amb.muffled.l, amb.under && amb.under.l],
    lift: g.islandElevator, dist: Math.hypot(g.playerPos[0], g.playerPos[1]), targets: g.islandTargets,
    hum: g.islandHumCh && g.islandHumCh.name,
  };
});
check(st.state === 'island' && st.ammo === 8 && st.n === 1, `island mode starts on island 1 with ${st.ammo} shots`);
check(st.surface === st.shore && st.muffled === st.shore + '_muffled' && st.under === 'underwater',
  `the shore ${st.shore}, its muffled copy and the water all play`);
check(Math.abs(st.levels[0] - 0.8) < 1e-6 && st.levels[1] === 0 && st.levels[2] === 0, 'on the island: shore at 0.8, muffled and water silent');
check(st.room === null, 'no room echo on an island');
check(st.lift[0] === 0 && st.lift[1] === 0 && st.dist > 12 && st.hum === 'elevator_hum', `the elevator hums in the middle; you arrive ${st.dist.toFixed(1)} away`);
check(st.targets === 4, 'island one has four enemies');

// --------------------------------------------------------------- the bot plays
const run = await page.evaluate(async () => {
  const g = window.__el.game;
  const t = window.__t;
  const out = { attempts: 0, crossed: 0, dives: 0, ups: 0, kills: 0, keys: 0, rideChecks: [], seabedSteps: 0, strokes: 0, seabedSand: 0,
    sandSteps: 0, maxIsland: 1, deaths: [], chimes: [], fadeChecks: [] };
  for (let attempt = 0; attempt < 8 && out.crossed < 1; attempt++) {
    out.attempts += 1;
    t.start();
    let phase = g.islandPhase;
    let rideSeen = null;
    for (let i = 0; i < 30 * 600 && g.state === 'island'; i++) {
      t.played.length = 0;
      g.frame(1 / 30);
      if (g.state !== 'island') break;
      if (g.islandRide && !rideSeen) {
        rideSeen = g.islandRide.dir;
        if (rideSeen === 'down') out.dives += 1; else out.ups += 1;
        // During a ride: no walking, no pause, no help.
        const pos = [...g.playerPos];
        t.played.length = 0;
        window.go('up');
        g.input('pause');
        g.input('help');
        out.rideChecks.push({
          moved: pos[0] !== g.playerPos[0] || pos[1] !== g.playerPos[1],
          paused: g.isPaused, state: g.state, buzz: t.played.filter((n) => n === 'boundary').length,
        });
      }
      if (g.islandRide) {
        // The arrival chime, just before the doors open.
        const r = g.islandRide;
        if (t.played.some((n) => n.startsWith('elevator_arrive'))) out.chimes.push([r.dir, t.played.find((n) => n.startsWith('elevator_arrive')), +(r.t / r.len).toFixed(2)]);
      }
      if (!g.islandRide && rideSeen) rideSeen = null;
      if (g.islandPhase !== phase) phase = g.islandPhase;
      out.maxIsland = Math.max(out.maxIsland, g.islandNumber);
      out.crossed = Math.max(out.crossed, g.islandCrossed);
      if (out.crossed >= 1 && g.islandPhase === 'island' && !g.islandRide && g.islandPlaceT > 2) break;
      if (i % 6) continue;
      const before = t.played.length;
      t.bot();
      const steps = t.played.slice(before).filter((n) => n.startsWith('step_'));
      const strokes = t.played.slice(before).filter((n) => n.startsWith('ut_dive_stroke_'));
      if (g.islandPhase === 'seabed') { out.seabedSteps += steps.length; out.strokes += strokes.length; } else out.sandSteps += steps.filter((n) => n.startsWith('step_sand_')).length;
    }
    out.kills += g.kills;
    if (g.state !== 'island') out.deaths.push(g.islandDeath || 'game over');
  }
  out.points = g.islandPoints;
  out.number = g.islandNumber;
  out.state = g.state;
  out.key = g.islandKey;
  out.shoreNow = g.islandShore;
  return out;
});
check(run.crossed >= 1 && run.number >= 2, `the bot crossed ${run.crossed} island(s) in ${run.attempts} attempt(s): ${run.dives} rides down, ${run.ups} up, ${run.kills} kills, deaths: ${run.deaths.join(', ') || 'none'}`);
check(run.state === 'island' && !run.key, `on island ${run.number} the key is to be found again; ${run.points} points so far`);
check(run.rideChecks.length > 0 && run.rideChecks.every((c) => !c.moved && !c.paused && c.state === 'island' && c.buzz === 2),
  `during every ride (${run.rideChecks.length}): no walking, and pause and help give only the buzz`);
const chimeOk = run.chimes.length > 0 && run.chimes.every(([dir, name, frac]) => name === (dir === 'up' ? 'elevator_arrive_2' : 'elevator_arrive_1') && frac > 0.6 && frac < 0.68);
check(chimeOk, 'the arrival chime rings just before the doors open, two notes arriving up, one down: ' + JSON.stringify(run.chimes.slice(0, 3)));
check(run.seabedSteps === 0 && run.sandSteps > 0, `sand footsteps on the island (${run.sandSteps}), none on the seabed`);
check(run.strokes > 0, `web 5.1.0: swimming strokes on the seabed, Ultimate Mode's own recordings (${run.strokes})`);

// --------------------------------------------------------------- report and fire
const rep = await page.evaluate(async () => {
  const g = window.__el.game;
  g.input('enter');
  await new Promise((r) => setTimeout(r, 50));
  return document.getElementById('said').textContent;
});
check(/^\d+ shots?\. (\d+ enem(y|ies) left|Island clear)\..*Key not found\. \d+ points\. Facing north\.$/.test(rep), 'double tap reports on the island: ' + rep);

// --------------------------------------------------------------- the ride, the quit question and the pause
const q = await page.evaluate(async () => {
  const g = window.__el.game;
  // Clear the island and walk into the lift.
  for (const o of g.obstacles) if (o.channel) o.channel.stop();
  g.obstacles = [];
  g.islandGuardianHp = 0;
  g.islandKillsHere = g.islandTargets;
  g.frame(1 / 30);
  g.playerPos = [0, 1];
  g.islandGrace = 0;
  g.frame(1 / 30);
  const out = { ride: !!g.islandRide && g.islandRide.dir };
  for (let i = 0; i < 60; i++) { g.frame(1 / 30); await new Promise((r) => setTimeout(r, 2)); }
  const t0 = g.islandRide.t;
  g.input('back');                       // a keyboard's Escape: the quit question
  out.q = g.state;
  out.rideHeld = !!(g.islandRideCh && g.islandRideCh.paused);
  for (let i = 0; i < 30; i++) g.frame(1 / 30);
  out.tStill = g.islandRide.t === t0;
  g.input('no');
  out.back = g.state;
  out.rideGoes = !!(g.islandRideCh && !g.islandRideCh.paused);
  g.frame(1 / 30);
  out.tMoves = g.islandRide.t > t0;
  out.report = '';
  g.input('enter');
  await new Promise((r) => setTimeout(r, 30));
  out.report = document.getElementById('said').textContent;
  // The page hidden mid-ride (autoPause): the ride holds, and three fingers resume it.
  g.autoPause();
  g.frame(1 / 30);
  const t1 = g.islandRide.t;
  out.autoHeld = g.isPaused && !!g.islandRideCh.paused;
  g.frame(1 / 30);
  out.autoStill = g.islandRide.t === t1;
  g.input('pause');
  g.frame(1 / 30);
  out.autoResumed = !g.isPaused && !g.islandRideCh.paused && g.islandRide.t > t1;
  // Let the ride finish: on the seabed.
  for (let i = 0; i < 30 * 20 && g.islandRide; i++) g.frame(1 / 30);
  out.phase = g.islandPhase;
  out.levels = [g.islandAmb.surface.l, g.islandAmb.muffled.l, g.islandAmb.under.l];
  out.air = g.islandAir;
  out.liftDist = Math.hypot(g.islandElevator[0], g.islandElevator[1]);
  out.ammoOnSeabed = g.ammoPickups.length;
  g.input('space');
  out.shotUnderwater = g.ammo;
  return out;
});
check(q.ride === 'down', 'walking into the lift of a clear island starts the ride down');
check(q.q === 'confirm_exit' && q.rideHeld && q.tStill, 'the quit question holds the ride: its sound and its clock');
check(q.back === 'island' && q.rideGoes && q.tMoves, 'No lets the ride go on');
check(q.report === 'Riding the elevator down.', 'double tap during a ride: ' + q.report);
check(q.autoHeld && q.autoStill && q.autoResumed, 'a pause made by the page mid-ride holds the ride, and three fingers resume it');
check(q.phase === 'seabed' && q.levels[0] === 0 && q.levels[1] === 0 && Math.abs(q.levels[2] - 0.8) < 1e-6,
  'the ride ends on the seabed: shore silent, water at 0.8');
check(q.liftDist >= 25 && q.ammoOnSeabed === 1, `the way up is a swim away (${q.liftDist.toFixed(1)}), one cartridge waits`);

// --------------------------------------------------------------- drowning
const dr = await page.evaluate(async () => {
  const g = window.__el.game;
  const t = window.__t;
  const out = { lowAir: false, beeps: 0 };
  for (let i = 0; i < 30 * 40 && g.state === 'island'; i++) {
    t.played.length = 0;
    g.frame(1 / 30);
    out.beeps += t.played.filter((n) => n === 'countdown_high').length;
    if (/Low air/.test(document.getElementById('said').textContent)) out.lowAir = true;
    if (g.state !== 'island') { out.lastPlayed = [...t.played]; break; }
  }
  await new Promise((r) => setTimeout(r, 80));
  out.state = g.state;
  out.death = g.islandDeath;
  out.said = document.getElementById('said').textContent;
  out.loops = t.loops();
  return out;
});
check(dr.state === 'game_over' && dr.death === 'drown' && dr.lastPlayed.includes('drown'), 'the air runs out: you drown and the run ends');
check(dr.lowAir && (dr.beeps === 15 || dr.beeps === 16), `Low air is said, and the high countdown beeps ${dr.beeps} times`);
check(/^You drowned\. You crossed \d+ islands?, worth \d+, and gained \d+ points, for a score of \d+\. /.test(dr.said), 'the island message: ' + dr.said);
check(dr.loops.length === 0, 'no loops left after game over: ' + dr.loops.join(', '));
await page.waitForTimeout(3000);
const late = await page.evaluate(() => window.__t.loops());
check(late.length === 0, 'and none a few seconds later: ' + late.join(', '));

// --------------------------------------------------------------- quitting mid-run (and mid-ride)
const quit = await page.evaluate(async () => {
  const g = window.__el.game;
  const t = window.__t;
  g.input('enter');                      // back to the menu
  t.start();
  for (let i = 0; i < 20; i++) g.frame(1 / 30);
  g.obstacles.forEach((o) => o.channel && o.channel.stop());
  g.obstacles = [];
  g.islandGuardianHp = 0;
  g.playerPos = [0, 1];
  g.islandGrace = 0;
  g.frame(1 / 30);
  const riding = !!g.islandRide;
  for (let i = 0; i < 200; i++) g.frame(1 / 30);
  const ride = g.islandRideCh;
  g.input('back');
  g.input('up');                          // to Yes
  g.input('enter');
  await new Promise((r) => setTimeout(r, 60));
  return { riding, state: g.state, loops: t.loops(), rideStopped: !!ride && ride.stopped };
});
check(quit.riding && quit.state === 'menu', 'quitting mid-ride returns to the menu');
check(quit.loops.length === 0 && quit.rideStopped, 'no loops left after quitting, and the ride sound is stopped: ' + quit.loops.join(', '));
await page.waitForTimeout(3000);
const late2 = await page.evaluate(() => window.__t.loops());
check(late2.length === 0, 'and none a few seconds later: ' + late2.join(', '));

// --------------------------------------------------------------- the board, help and demos
const hb = await page.evaluate(async () => {
  const g = window.__el.game;
  const lines = g._scoreLines();
  g.input('help');
  const { HELP } = await import('/js/game.js');
  const names = HELP.map(([n]) => n);
  const demos = HELP.find(([n]) => n === 'Demos, Island Mode')[1].filter((d) => d.sound);
  const missing = demos.filter((d) => !window.__el.audio.has(d.sound)).map((d) => d.sound);
  g.input('back');
  return { line: lines.find((l) => l.startsWith('Island Mode')), names, missing, count: demos.length };
});
check(/^Island Mode: \d+ points?$/.test(hb.line), 'the Island board: ' + hb.line);
check(hb.names.includes('Island Mode') && hb.names.includes('Demos, Island Mode'), 'help has Island Mode and its demos');
check(hb.missing.length === 0, `every island demo sound (${hb.count}) is in the packs` + (hb.missing.length ? ': missing ' + hb.missing.join(', ') : ''));

// --------------------------------------------------------------- an island kept as you left it
const kept = await page.evaluate(async () => {
  const g = window.__el.game;
  const t = window.__t;
  t.start();
  for (let i = 0; i < 30 * 40 && g.obstacles.length < 1; i++) { g.islandGrace = 1; g.frame(1 / 30); }
  const before = g.obstacles.map((o) => o.soundIdx).sort();
  g.playerPos = [0, 1];
  g.frame(1 / 30);                          // into the lift
  for (let i = 0; i < 30 * 20 && g.islandRide; i++) g.frame(1 / 30);
  g.playerPos = [g.islandElevator[0], g.islandElevator[1] + 1];
  g.frame(1 / 30);                          // straight back up
  const onward = g.islandRideOnward;
  for (let i = 0; i < 30 * 20 && g.islandRide; i++) g.frame(1 / 30);
  const after = g.obstacles.map((o) => o.soundIdx).sort();
  const nearest = Math.min(...g.obstacles.map((o) => Math.hypot(o.x - g.playerPos[0], o.y - g.playerPos[1])));
  return { before, after, onward, n: g.islandNumber, nearest, phase: g.islandPhase };
});
check(!kept.onward && kept.n === 1 && kept.phase === 'island', 'without the key the elevator up brings you back to the island you left');
check(JSON.stringify(kept.before) === JSON.stringify(kept.after) && kept.nearest >= 14 - 1e-6,
  `its enemies are still there with the same voices (${kept.after.join(',')}), none within 14 of you (${kept.nearest.toFixed(1)})`);

// --------------------------------------------------------------- a guardian
const gd = await page.evaluate(async () => {
  const g = window.__el.game;
  const t = window.__t;
  const out = {};
  // Island two of a run that draws a guardian there.
  g.islandNumber = 2;
  g.guardianPlan = { 1: false, 2: true };
  g._islandNewIsland();
  const guard = g.obstacles.find((o) => o.guardian);
  out.hp = g.islandGuardianHp;
  out.post = Math.hypot(...guard.post);
  out.arrive = Math.hypot(g.playerPos[0] - guard.post[0], g.playerPos[1] - guard.post[1]);
  g.islandKillsHere = g.islandTargets;      // no ordinary enemies, to watch the guardian alone
  g.islandGrace = 0;
  // Walk into the lift: shut while it lives.
  g.playerPos = [0, 1];
  t.played.length = 0;
  g.frame(1 / 30);
  out.buzz = t.played.includes('boundary') && !g.islandRide;
  // Out of its reach, due south of its post, and fire.
  const [gx, gy] = guard.post;
  guard.x = gx; guard.y = gy;
  g.playerPos = [gx, gy + 17];
  t.played.length = 0;
  const pts = g.islandPoints;
  for (let i = 0; i < 3; i++) { g.input('space'); g.frame(1 / 30); }
  out.hits = t.played.filter((n) => n === 'guardian_hit').length;
  out.gone = !g.obstacles.includes(guard);
  out.points = g.islandPoints - pts;
  await new Promise((r) => setTimeout(r, 600));
  out.down = t.played.includes('guardian_down');
  g.frame(1 / 30);
  out.clear = g.islandCleared && t.played.includes('wave_start');
  // Another guardian island, and no shots: it leaves its post and comes for you.
  g.islandNumber = 4;
  g.guardianPlan = { 1: false, 2: true, 3: false, 4: true };
  g._islandNewIsland();
  out.hp2 = g.islandGuardianHp;
  g.islandKillsHere = g.islandTargets;
  g.ammo = 0;
  g.islandGrace = 0;
  let secs = 0;
  for (let i = 0; i < 30 * 30 && g.state === 'island'; i++) { g.frame(1 / 30); secs += 1 / 30; }
  out.caught = g.state === 'game_over' && g.islandDeath === 'enemy';
  out.secs = secs;
  return out;
});
check(gd.hp === 3 && Math.abs(gd.post - 7) < 1e-6 && gd.arrive > 15, `the first guardian takes 3 hits, keeps its post 7 from the lift, and you arrive ${gd.arrive.toFixed(1)} from it`);
check(gd.buzz, 'the lift is shut while the guardian lives: the buzz');
check(gd.hits === 2 && gd.gone && gd.points === 100 && gd.down && gd.clear, 'two clanks, then it goes down (100 points, the boom), and the island is clear');
check(gd.hp2 === 4, 'the second guardian takes 4 hits');
check(gd.caught, `out of shots, the guardian hunts you down (${gd.secs.toFixed(1)} s)`);

check(errors.length === 0, 'no errors in the page' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
