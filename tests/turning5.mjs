// Web 5.0.0: every mode in binaural 3D, and the walking modes turn with you.
// Run: serve the site folder, then  node tests/turning5.mjs http://localhost:8765
// (add --import ./tests/github-stub.mjs where the browser cannot reach GitHub).
//
// What is checked here: which modes turn and which do not; a quick turn, a held
// turn and the ticks; walking the way you face, with walls and edges; the aim,
// ahead or directly behind by the way you face; that every positioned sound goes
// through an HRTF panner placed where the thing is, and that the listener turns;
// the dull behind-you copy by the way you face; backgrounds that turn; and the
// new rules of Standard, Battle, Tower, Island and Ultimate Mode's seabed.
// It cannot hear: how it sounds is for a person.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 60000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
await page.evaluate(() => {
  const g = window.__el.game;
  window.T = {
    deg: (r) => Math.round(r * 180 / Math.PI * 10) / 10,
    frames: (seconds, dt = 1 / 30) => { for (let i = 0; i < Math.round(seconds / dt); i++) g.frame(dt); },
    start: (key) => { if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); } g.menuIndex = g.menuKeys.indexOf(key); g.input('enter'); g.frame(1 / 30); },
    said: () => document.getElementById('said').textContent,
    heard: () => { const a = window.__el.audio; const names = []; const op = a.play.bind(a); a.play = (n, o) => { names.push(n); return op(n, o); }; return { names, stop: () => { a.play = op; } }; },
  };
});

// ------------------------------------------------------------------ 1. Standard: turning and walking
const std = await page.evaluate(() => {
  const g = window.__el.game; const a = window.__el.audio; const T = window.T; const out = {};
  T.start('standard');
  out.start = { time: g.timeLeft, binaural: a.binaural, turns: g._turnsNow(), hold: g.gestures.turnHold, face: g.tn.face };
  out.drone = [...a.live].filter((v) => v.loop && /^lab_/.test(v.name)).map((v) => v.wide)[0];
  const L = T.heard();
  g.input('right'); T.frames(0.5);
  out.quick = { face: T.deg(g.tn.face), listener: T.deg(a.facing), click: L.names.includes('ut_click') };
  g.input('right'); g.input('right'); T.frames(0.6);
  out.quarter = { face: T.deg(g.tn.face), tick: L.names.includes('ut_tick') };
  g.input('turn_left_start'); T.frames(0.4); g.input('turn_end');
  out.held = T.deg(g.tn.face);
  g._turnStop(); g._face(Math.PI / 6, true); g.input('left'); T.frames(0.5);
  out.north = L.names.includes('ut_tick_north') && g.tn.face === 0;
  g._turnStop(); g._face(0, true);
  // Walking: open floor, then walls.
  g.grid.clear(); g.gridSize = 20; g.exitPos = [19, 19]; g.playerPos = [0, 0]; g.timeLeft = 500;
  g.input('up'); out.north1 = [...g.playerPos];
  g.input('down'); out.back1 = [...g.playerPos];
  g._face(Math.PI / 6, true); g.input('up'); out.slant = g.playerPos.map((x) => +x.toFixed(3));
  // A wall straight ahead stops you with its sound; at a slant you slide in silence.
  g.playerPos = [0, 0]; g._face(0, true); g.grid.add('0,-1'); g.grid.add('1,-1'); g.grid.add('-1,-1');
  L.names.length = 0; g.input('up');
  out.wall = { pos: [...g.playerPos], wall: L.names.includes('wall'), step: L.names.some((n) => n.startsWith('step_')) };
  L.names.length = 0; g._face(Math.PI / 3, true); g.input('up');
  out.slide = { pos: g.playerPos.map((x) => +x.toFixed(3)), wall: L.names.includes('wall'), step: L.names.some((n) => n.startsWith('step_')) };
  // The exit's beep is placed where the exit is; the report ends with the facing.
  g.grid.clear(); g.playerPos = [0, 0]; g.exitPos = [0, 8]; g._face(0, true); g.lastBeepTime = 0;
  g.frame(1 / 30);
  const beep = [...a.live].filter((v) => /^prox_/.test(v.name)).pop();
  out.beep = beep ? { panner: !!(beep.dry && beep.dry.panner), dir: beep.dir.map((x) => +x.toFixed(2)), behind: +beep.heard[2].toFixed(2), equal: beep.heard[0] === beep.heard[1] } : null;
  g._face(Math.PI, true); g.lastBeepTime = 0; g.frame(1 / 30);
  const beep2 = [...a.live].filter((v) => /^prox_/.test(v.name)).pop();
  out.beepFacing = beep2 ? { dir: beep2.dir.map((x) => +x.toFixed(2)), behind: +beep2.heard[2].toFixed(2) } : null;
  g.input('enter'); out.report = T.said();
  // A credit: twenty, thirty or forty seconds.
  out.credits = [...new Set(Array.from({ length: 400 }, () => { g.generateLabyrinth(false); return g.timeCredit ? g.timeCredit.value : 0; }))].sort((x, y) => x - y);
  L.stop();
  return out;
});
check(std.start.time > 59.9 && std.start.time <= 60 && std.start.binaural && std.start.turns && std.start.hold && std.start.face === 0, `Standard starts with 60 seconds, in binaural 3D, facing north, and it turns: ${JSON.stringify(std.start)}`);
check(std.drone === true, 'its background is a wide recording, so it turns with the world');
check(std.quick.face === 30 && std.quick.listener === 30 && std.quick.click, `a flick is a quick turn of 30 degrees, the listener turns with it, and it clicks: ${JSON.stringify(std.quick)}`);
check(std.quarter.face === 90 && std.quarter.tick, 'three of them are a quarter turn, with the tick of a main direction');
check(std.held < 90 && std.held > 40, `a held turn is free and stops where it is let go (${std.held} degrees)`);
check(std.north, 'north has its own higher tick');
check(std.north1[0] === 0 && std.north1[1] === -1 && std.back1[1] === 0, 'a swipe up is one step the way you face, a swipe down one step straight back');
check(Math.abs(std.slant[0] - 0.5) < 0.01 && Math.abs(std.slant[1] + 0.866) < 0.01, `facing 30 degrees east of north, a step goes exactly that way: ${std.slant}`);
check(std.wall.wall && !std.wall.step && std.wall.pos[1] === 0, 'a wall straight ahead stops you, with its sound');
check(!std.slide.wall && std.slide.step && std.slide.pos[0] > 0.8 && Math.abs(std.slide.pos[1]) < 1e-6, `met at a slant, you slide along the wall in silence: ${std.slide.pos}`);
check(std.beep && std.beep.panner && std.beep.dir[0] === 0 && std.beep.dir[1] === 1 && std.beep.equal && std.beep.behind === 1, `the exit's beep goes through a panner placed where the exit is (south: behind you, dull): ${JSON.stringify(std.beep)}`);
check(std.beepFacing && std.beepFacing.dir[1] === 1 && std.beepFacing.behind === 0, 'turn to face it and it is no longer behind you: the place in the world is the same, the dullness is gone');
check(/^\d+ seconds? left\. Facing south\.$/.test(std.report), 'the report ends with the way you face: ' + std.report);
check(JSON.stringify(std.credits) === '[0,20,30,40]', 'credits are worth 20, 30 or 40 seconds: ' + std.credits);

// ------------------------------------------------------------------ 2. Battle
const bat = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const T = window.T; const out = {};
  T.start('battle');
  out.start = { time: g.timeLeft, need: g._battleTargetsNeeded(), ammo: g.ammo, max: g._battleMaxConcurrent() };
  // The clock waits until the first enemy is after you.
  const t0 = g.timeLeft; let n = 0;
  while (!g.obstacles.length && n < 900) { g.frame(1 / 30); n += 1; }
  out.waited = { clock: g.timeLeft === t0, frames: n };
  T.frames(1); out.runs = g.timeLeft < t0;
  // One at a time in the first three waves.
  let most = 0; for (let i = 0; i < 600; i++) { g.frame(1 / 30); most = Math.max(most, g.obstacles.length); if (g.state !== 'battle') break; for (const o of g.obstacles) { o.x = g.playerPos[0] + 30; o.y = g.playerPos[1]; } }
  out.most = most;
  out.atOnce = [1, 3, 4, 6, 7, 9, 10, 25].map((w) => { g.battleWave = w; return g._battleMaxConcurrent(); });
  out.needs = [1, 2, 3, 4, 5, 10, 25].map((w) => { g.battleWave = w; return g._battleTargetsNeeded(); });
  g.battleWave = 1;
  // Aim: centred ahead or directly behind, by the way you face.
  const o = g.obstacles[0];
  const lock = (deg, ox, oy) => { g._face(deg * Math.PI / 180, true); o.x = g.playerPos[0] + ox; o.y = g.playerPos[1] + oy; return g._battleLocked() === o; };
  out.aim = { northAhead: lock(0, 0, -20), northSide: lock(0, 20, 0), eastAhead: lock(90, 20, 0), eastBehind: lock(90, -20, 0), eastSide: lock(90, 0, -20), slant: lock(30, 10, -17.3) };
  // The enemy's voice is placed where it is.
  g._face(0, true); o.x = g.playerPos[0] + 20; o.y = g.playerPos[1]; g.frame(1 / 30);
  out.voice = o.channel ? { panner: !!(o.channel.dry && o.channel.dry.panner), dir: o.channel.dir.map((x) => +x.toFixed(2)) } : null;
  // Enemies come from any side.
  const mod = await import('./js/game.js');
  const quads = new Set();
  for (let i = 0; i < 60; i++) { g.obstacles = []; g.spawnedEnemies = 0; let k = 0; while (!g.obstacles.length && k < 300) { g.frame(1 / 30); k += 1; } const e = g.obstacles[0]; if (e) { const dx = e.x - g.playerPos[0]; const dy = e.y - g.playerPos[1]; quads.add(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N')); } }
  out.sides = [...quads].sort().join('');
  // A wave break: 3 to 6 credits, worth 15, 25 or 35; breaks from 52 seconds down to 25.
  g.obstacles = []; g.spawnedEnemies = g._battleTargetsNeeded(); g.frame(1 / 30);
  out.breakOn = g.inWaveBreak; out.breakLen = Math.round(g.waveBreakTimer); out.creditsLeft0 = g.breakCreditsLeft + (g.timeCredit ? 1 : 0);
  const tBreak = g.timeLeft; T.frames(1); out.breakClockRuns = g.timeLeft < tBreak;
  const vals = new Set(); let taken = 0;
  for (let i = 0; i < 40 && g.inWaveBreak; i++) { g.frame(1 / 30); if (!g.timeCredit) break; vals.add(g.timeCredit.value); g.playerPos = [g.timeCredit.x, g.timeCredit.y]; g.frame(1 / 30); taken += 1; g.waveBreakTimer = 30; }
  out.taken = taken; out.vals = [...vals].sort((x, y) => x - y);
  out.breaks = [1, 10, 28, 40].map((w) => { g.battleWave = w; g._battleOpenBreak(); return g.waveBreakTimer; });
  g.input('enter'); out.report = T.said();
  return out;
});
check(bat.start.time === 80 && bat.start.need === 6 && bat.start.ammo === 9 && bat.start.max === 1, `Battle starts with 80 seconds, six enemies in wave one (nine shots), one at a time: ${JSON.stringify(bat.start)}`);
check(bat.waited.clock && bat.runs, `the clock waits while nothing is after you (${bat.waited.frames} frames) and runs once an enemy appears`);
check(bat.most === 1, `in wave one never more than one enemy is after you at once (${bat.most})`);
check(bat.atOnce.join() === '1,1,2,2,3,3,4,4', 'enemies at once: one in waves 1 to 3, two in 4 to 6, three in 7 to 9, four from wave 10, never more: ' + bat.atOnce);
check(bat.needs.join() === '6,6,6,7,9,15,33', 'no wave has fewer than six enemies: ' + bat.needs);
check(bat.aim.northAhead && !bat.aim.northSide && bat.aim.eastAhead && bat.aim.eastBehind && !bat.aim.eastSide && bat.aim.slant, 'a shot takes what is centred ahead of you or directly behind, by the way you face: ' + JSON.stringify(bat.aim));
check(bat.voice && bat.voice.panner && bat.voice.dir[0] === 1 && Math.abs(bat.voice.dir[1]) < 0.01, 'an enemy to the east is placed to the east by its panner: ' + JSON.stringify(bat.voice));
check(bat.sides === 'ENSW', 'enemies come from any side: ' + bat.sides);
check(bat.breakOn && bat.breakLen === 52 && bat.breakClockRuns, `the first wave break is 52 seconds, and its clock runs (${bat.breakLen})`);
check(bat.creditsLeft0 >= 3 && bat.creditsLeft0 <= 6 && bat.taken === bat.creditsLeft0 && bat.vals.every((v) => [15, 25, 35].includes(v)), `a break has 3 to 6 credits and no more once taken (${bat.taken} of ${bat.creditsLeft0}), worth 15, 25 or 35: ${bat.vals}`);
check(bat.breaks.join() === '52,43,25,25', 'breaks shrink a second a wave, from 52 to a floor of 25: ' + bat.breaks);
check(/Facing [a-z-]+\.$/.test(bat.report), 'the Battle report ends with the way you face: ' + bat.report);

// ------------------------------------------------------------------ 3. Tower, Island, Driving, events, Chaos
const rest = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const T = window.T; const out = {};
  const tower = await import('./js/modes/tower.js');
  T.start('tower');
  out.tower = { turns: g._turnsNow(), pace: tower.TOWER_RIVAL_PACE, enemyPace: g.towerEnemy && g.towerEnemy.pace };
  { const probe = new tower.TowerEnemy([0, 0], g._towerDifficulty(), 0, g.arenaLimit, 1, 1); out.tower.slower = g.towerEnemy ? +(g.towerEnemy.baseSpeed / probe.speed).toFixed(2) : null; }
  // Web 5.1.0: the rival races for an item at a third of a walk in tower one.
  out.tower.race = g.towerEnemy ? +(g.towerEnemy.baseSpeed * g.towerEnemy.lunge).toFixed(2) : null;
  out.tower.walkThird = +(tower.TOWER_WALK / 3).toFixed(2);
  g.playerPos = [0, 0]; g._face(Math.PI / 2, true); g.input('up'); out.tower.step = [...g.playerPos];
  g.input('left'); T.frames(0.4); out.tower.turned = T.deg(g.tn.face);
  { const e = g.towerEnemy; g._face(Math.PI / 2, true); g.playerPos = [0, 0]; e.x = -15; e.y = 0; e.hitsTaken = 0; e.hitsNeeded = 5; g.towerItems = 3; g.throwTowerItem(); out.tower.hitBehind = e.hitsTaken; e.x = 0; e.y = -15; g.throwTowerItem(); out.tower.hitSide = e.hitsTaken; }
  g.input('enter'); out.tower.report = T.said();
  // Island: turns on the island and the seabed, not in the elevator; a vent on every dive, the next ten seconds after one is taken.
  T.start('island');
  out.island = { turns: g._turnsNow() };
  g.playerPos = [0, 0]; g._face(Math.PI, true); g.input('up'); out.island.step = [...g.playerPos];
  g.islandRide = { dir: 'down', t: 0 }; out.island.rideTurns = g._turnsNow(); g.islandRide = null;
  {
    const count = () => g.islandItems.filter((q) => q.kind === 'vent').length;
    const every = []; for (let i = 0; i < 12; i++) { for (const q of g.islandItems) { if (q.ch) q.ch.stop(); if (q.ch2) q.ch2.stop(); } g.islandItems = []; g._islandSetupSeabed(); every.push(count()); }
    const v = g.islandItems.find((q) => q.kind === 'vent'); const was = [...v.pos];
    g.islandAir = 12; g._islandTake(v);
    const air = g.islandAir; const gone = count();
    for (let i = 0; i < 30 * 9.5; i++) g._islandUpdateSeabed(1 / 30);
    const before = count();
    for (let i = 0; i < 30 * 1; i++) g._islandUpdateSeabed(1 / 30);
    const nv = g.islandItems.find((q) => q.kind === 'vent');
    out.island.vent = { every: every.every((n) => n === 1), air, gone, before, after: count(), moved: !!nv && Math.hypot(nv.pos[0] - was[0], nv.pos[1] - was[1]) > 1, seabedTurns: g._turnsNow() };
  }
  // Ultimate Mode's treasure chest: two or three things at once, and the voice says only what they are.
  {
    const ult = await import('./js/modes/ultimate.js');
    const world = await import('./js/modes/ultimate/world.js');
    T.start('ultimate');
    const u = g.ut; const seen = new Set(); let ok = true; let words = '';
    for (let i = 0; i < 60; i++) {
      u.hp = 50; const b = { ammo: u.ammo, items: u.items, points: u.points, hp: u.hp, time: u.worldTime };
      g._utOpenChest();
      const said = T.said(); words = said;
      const got = u.lastChest;
      for (const k of got) seen.add(k);
      if (/chest/i.test(said) || got.length < 2 || got.length > 4) ok = false;
      if (got.includes('shots') !== (u.ammo > b.ammo) || got.includes('items') !== (u.items > b.items) || got.includes('health') !== (u.hp > b.hp) || got.includes('time') !== (u.worldTime > b.time + 50)) ok = false;
    }
    out.chest = { ok, seen: [...seen].sort().join(), words, cells: world.SEABED_CELLS, chance: ult.CHEST_CHANCE, time: ult.CHEST_TIME, caseTime: ult.CASE_TIME };
    // Its sounds (five recordings in the ultimate pack since 5.0.0), and a stroke for each step along the seabed, never a blur of them.
    const a2 = window.__el.audio;
    const names = ['ut_chest', 'ut_dive_stroke_1', 'ut_dive_stroke_2', 'ut_dive_stroke_3', 'ut_dive_stroke_4', 'evt_chest_open'];
    out.chest.sounds = names.filter((n) => !a2.has(n));
    out.chest.loop = !!(a2.entries.get('ut_chest') && a2.entries.get('ut_chest').dry.loop);
    out.chest.beacon = ult.CHEST_SOUNDS[0]; out.chest.opens = ult.CHEST_OPEN_SOUNDS[0];
    {
      // A dive, by hand: onto an island's seabed, then steps along it.
      const isl = u.world.areas.find((x) => x.kind === 'island');
      if (isl) {
        const W = world; u.area = isl; u.safe = 999;
        g.playerPos = W.posOf(isl.elevator[0], isl.elevator[1] + 1); u.liftArmed = false; g.updateUltimateMode(1 / 30);
        g._utTurnStop(); g._utFace(0, true); g.input('up'); g.updateUltimateMode(1 / 30);      // onto the lift's square: the ride down
        for (let i = 0; i < 30 * 20 && u.place === 'ride'; i++) { g.updateUltimateMode(1 / 30); if (i % 30 === 0) await new Promise((r) => setTimeout(r, 20)); }
        const played = []; const op = a2.play.bind(a2); a2.play = (n, o) => { played.push(n); return op(n, o); };
        g._utTurnStop(); g._utFace(0, true);
        for (let i = 0; i < 4; i++) g.input('up');                 // four steps at once: one stroke
        const burst = played.filter((n) => /^ut_dive_stroke_/.test(n)).length;
        await new Promise((r) => setTimeout(r, 500)); g.input('up');
        const later = played.filter((n) => /^ut_dive_stroke_/.test(n)).length;
        a2.play = op;
        out.chest.dive = { place: u.place, burst, later, moved: Math.round(Math.hypot(g.playerPos[0] - W.posOf(isl.elevator[0], isl.elevator[1])[0], g.playerPos[1] - W.posOf(isl.elevator[0], isl.elevator[1])[1])) };
      } else out.chest.dive = null;
    }
  }
  {
    // What keeps the way you face, and what does not.
    T.start('island'); g._face(Math.PI / 2, true); T.frames(0.1);
    const keep = {};
    g.islandRide = { dir: 'down', t: 0 }; g._tickTurn(1 / 30); keep.ride = T.deg(a.facing); g.islandRide = null;
    const was = g.state; g.prevState = was; g.state = 'help'; g._tickTurn(1 / 30); keep.help = T.deg(g.tn.face); g.state = was;
    g.state = 'chaos_gap'; g._tickTurn(1 / 30); keep.gap = T.deg(g.tn.face); g.state = was;
    g.state = 'drive'; g._tickTurn(1 / 30); keep.road = T.deg(g.tn.face); g.state = was;
    out.keep = keep;
  }
  T.start('drive'); out.drive = { turns: g._turnsNow(), facing: a.facing, hold: g.gestures.turnHold };
  return out;
});
check(rest.tower.turns && rest.tower.race !== null && Math.abs(rest.tower.race - rest.tower.walkThird) < 0.25, `a tower floor turns, and in tower one its rival races at about a third of a walk (web 5.1.0): ${JSON.stringify(rest.tower)}`);
check(rest.tower.step[0] === 3 && rest.tower.step[1] === 0 && rest.tower.turned === 60, 'facing east, a step goes three units east; a flick left turns you 30 degrees');
check(rest.tower.hitBehind === 1 && rest.tower.hitSide === 1, 'a throw takes the rival centred ahead or directly behind, by the way you face, and misses one to the side');
check(/Facing [a-z-]+\.$/.test(rest.tower.report), 'the tower report ends with the way you face: ' + rest.tower.report);
check(rest.island.turns && rest.island.step[1] === 3 && !rest.island.rideTurns, 'an island turns with you (facing south, a step goes south), and the elevator does not');
check(rest.island.vent.every && rest.island.vent.air === 30 && rest.island.vent.gone === 0 && rest.island.vent.before === 0 && rest.island.vent.after === 1 && rest.island.vent.moved && rest.island.vent.seabedTurns,
  'every dive has an air vent; ten seconds after you take one, the next appears somewhere else; the seabed turns with you: ' + JSON.stringify(rest.island.vent));
check(rest.chest.sounds.length === 0 && rest.chest.loop && rest.chest.beacon === 'ut_chest' && rest.chest.opens === 'evt_chest_open',
  'the chest calls with its own looping recording and opens with the chest opening; the four underwater strokes are in the packs ' + rest.chest.sounds.join(', '));
check(rest.chest.dive === null || (rest.chest.dive.place === 'seabed' && rest.chest.dive.burst === 1 && rest.chest.dive.later === 2 && rest.chest.dive.moved === 15),
  'each step along the seabed is a swimming stroke, and steps taken at once share one: ' + JSON.stringify(rest.chest.dive));
check(rest.chest.ok && rest.chest.seen === 'health,items,points,shots,time' && !/chest/i.test(rest.chest.words) && rest.chest.cells === 24 && rest.chest.time === 90 && rest.chest.caseTime === 60,
  `Ultimate Mode: a treasure chest gives two or three things at once (and rarely 90 seconds), the voice says only what they are, the seabed is 25 squares across, and a glass case's time is 60 seconds: "${rest.chest.words}"`);
check(rest.keep && rest.keep.ride === 90 && rest.keep.help === 90 && rest.keep.gap === 90 && rest.keep.road === 0, 'an elevator ride, the help and the gap between chaos levels keep the way you face; a road puts north ahead again: ' + JSON.stringify(rest.keep));
check(!rest.drive.turns && rest.drive.facing === 0 && !rest.drive.hold, 'Driving does not turn: north stays ahead, and a slide is not a held turn there');

// ------------------------------------------------------------------ 4. the Update History's alert, and the FAQ
{
  const at = async (iso) => {
    const p2 = await browser.newPage();
    await p2.route('**/packs/manifest.json', (route) => route.fulfill({ status: 200, headers: { Date: new Date(iso).toUTCString() }, contentType: 'application/json', body: '{}' }));
    await p2.goto(base + '/history.html');
    await p2.waitForTimeout(700);
    const r = await p2.evaluate(() => {
      const a = document.getElementById('history-alert');
      return a ? { role: a.getAttribute('role'), label: a.getAttribute('aria-label'), text: a.textContent, first: document.body.firstElementChild === a, link: a.querySelector('a').getAttribute('href') } : null;
    });
    const top = await p2.evaluate(() => document.querySelector('main h2').textContent);
    await p2.close();
    return { r, top };
  };
  const during = await at('2026-11-20T12:00:00Z');
  const before = await at('2026-11-11T12:00:00Z');
  const after = await at('2026-12-13T12:00:00Z');
  check(during.r && during.r.role === 'region' && during.r.label === 'Alert' && during.r.first && during.r.link === 'help.html#faq-turning'
    && /the walking modes now turn with you/.test(during.r.text) && /Driving and the events keep their controls/.test(during.r.text)
    && /compatibility between them, the events included, will be maintained to the highest extent that both can allow/.test(during.r.text)
    && !/fr[eo]z/i.test(during.r.text),
    'for thirty days the Update History opens with a region named Alert: turning, and compatibility between Windows and the web');
  check(before.r === null && after.r === null, 'it is not there before 5.0.0 came out, and it is gone after thirty days');
  check(/^5\.1\.0 \(12 November 2026\), web only/.test(during.top), 'the Update History begins with 5.1.0 (web 5.1.0 came after 5.0.0): ' + during.top);
  await page.goto(base + '/help.html');
  const faq = await page.evaluate(() => ['faq-turning', 'faq-turning-lost', 'faq-turning-aim', 'faq-turning-walls', 'faq-turning-which', 'faq-turning-slide'].map((id) => { const h = document.getElementById(id); return h ? h.textContent : null; }));
  check(faq.every(Boolean), 'the frequently asked questions have six questions about turning: ' + faq.join(' | '));
  // No page of the site says the Windows version is frozen.
  let frozen = [];
  for (const pg of ['index.html', 'about.html', 'help.html', 'history.html', 'story.html', 'accessibility.html', 'accessibility-statement.html', 'terms.html', 'privacy.html', 'play.html']) {
    await page.goto(base + '/' + pg);
    const t = await page.evaluate(() => document.body.textContent);
    if (/\bfr(eeze|ozen|eezing)\b[^.]*Windows|Windows[^.]*\bfr(eeze|ozen|eezing)\b/i.test(t)) frozen.push(pg);
  }
  check(frozen.length === 0, 'no page says the Windows version is frozen ' + frozen.join(', '));
}

check(errors.length === 0, 'no page errors ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
