// Ultimate Mode (web 2.0.0), end to end in Chromium through Playwright.
// Run: serve the site folder (python3 -m http.server 8765), then
//   node --import ./tests/github-stub.mjs tests/ultimate.mjs http://localhost:8765
// A scripted player starts a run, walks, shoots, meets the compass, rides an
// island elevator, lives through a regeneration (hurried along) and dies. It
// cannot hear: how the world sounds is for a person with headphones.

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
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 90000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
const said = () => page.evaluate(() => document.getElementById('said').textContent);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --------------------------------------------------------------- menu, help, sounds, boards
const setup = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio;
  const { HELP } = await import('./js/game.js');
  const mod = await import('./js/modes/ultimate.js');
  const names = HELP.map(([n]) => n);
  const section = HELP.find(([n]) => n === 'Ultimate Mode');
  const demos = HELP.find(([n]) => n === 'Demos, Ultimate Mode');
  const demoSounds = demos[1].map((i) => i.sound).filter(Boolean);
  // Before any run, from the main menu's Help, every demo must be there (the
  // made tones were once only made when a run began).
  const missingBeforeRun = demoSounds.filter((n) => !a.has(n));
  // ...and each one plays, through Help itself: open the section, step to the demo,
  // and the sound starts when its words have been read.
  const silentBeforeRun = [];
  for (const n of demoSounds) {
    await a.prepare(n);
    const v = a.play(n, { volume: 0.01 });
    await new Promise((r) => setTimeout(r, 120));
    if (!v || v.stopped || (!v.dry && !v.busy)) silentBeforeRun.push(n);
    if (v) v.stop();
  }
  g.menuIndex = g.menuKeys.indexOf('ultimate');
  g.input('enter');
  const missing = demoSounds.filter((n) => !a.has(n));
  const bgMissing = mod.EVENT_BACKGROUNDS.filter((n) => !a.has(n));
  return {
    menu: g.menuOptions.slice(), names, topics: section[1].length, demos: demoSounds.length, missing, missingBeforeRun, silentBeforeRun, bgMissing,
    boards: g._scoreLines(), state: g.state, spatial: a.spatial, hasWorld: !!(a.worldIn && a.worldGain && a.worldFilter),
    stats: Object.keys(g.scores.stats.time),
  };
});
check(setup.menu.indexOf('Ultimate Mode') === setup.menu.indexOf('Chaos Mode') + 1, 'main menu: Ultimate Mode right after Chaos: ' + setup.menu.join(', '));
check(setup.names.indexOf('Ultimate Mode') === setup.names.indexOf('Chaos Mode') + 1 && setup.names.indexOf('Demos, Ultimate Mode') > setup.names.indexOf('Demos, Chaos Mode'), 'help sections in order: ' + setup.names.join(' | '));
check(setup.topics === 18 && setup.demos === 15, `help: ${setup.topics} topics, ${setup.demos} demos`);
check(setup.silentBeforeRun.length === 0, 'every demo plays before any run' + (setup.silentBeforeRun.length ? ': silent ' + setup.silentBeforeRun.join(', ') : ''));
check(setup.missingBeforeRun.length === 0, 'every demo sound exists before any run, for Help from the main menu' + (setup.missingBeforeRun.length ? ': missing ' + setup.missingBeforeRun.join(', ') : ''));
check(setup.missing.length === 0, 'every demo sound exists' + (setup.missing.length ? ': missing ' + setup.missing.join(', ') : ''));
check(setup.bgMissing.length === 0, 'every event background is in the packs' + (setup.bgMissing.length ? ': missing ' + setup.bgMissing.join(', ') : ''));
check(setup.boards.includes('Ultimate Mode: No score yet'), 'high scores list the board: ' + setup.boards.join(' | '));
check(setup.stats.includes('ultimate'), 'stats keep an ultimate line');
check(setup.state === 'ultimate' && setup.spatial && setup.hasWorld, 'a run starts in the 3D world (spatial on, world chain made)');

// --------------------------------------------------------------- the first world
await sleep(700);
const w0 = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const u = g.ut;
  const kinds = u.world.areas.map((x) => x.kind);
  const enemyAreas = u.world.areas.filter((x) => ['battle', 'island', 'tower'].includes(x.kind));
  const perArea = {};
  for (const e of u.enemies) perArea[e.area.id] = (perArea[e.area.id] || 0) + 1;
  const near = [...a.live].filter((v) => v.loop).map((v) => v.name);
  const placed = [...a.live].filter((v) => v.loop && v.placed).length;
  return {
    worldNo: u.worldNo, areas: kinds, hp: u.hp, ammo: u.ammo, points: u.points, worldTime: u.worldTime, safe: u.safe,
    enemies: u.enemies.length, enemyAreas: enemyAreas.length, perArea, labsQuiet: u.enemies.every((e) => e.area.kind !== 'labyrinth' && e.area.kind !== 'event'),
    kindsRight: u.enemies.every((e) => (e.kind === 'thrower') === (e.area.kind === 'tower')),
    pickups: u.pickups.map((p) => p.kind), safeAmmo: u.pickups.filter((p) => p.safe).length, eventAreas: kinds.filter((k) => k === 'event').length,
    loops: near.length, placed, buses: a.areaBuses.size, said: document.getElementById('said').textContent,
    // The area echo: a beacon placed beside the player sends into the area's bus
    // (the first build's bug: a string key against the buses' numbers, so no sound
    // ever reached an echo).
    echo: await (async () => {
      const area = u.area.room ? u.area : u.world.areas.find((x) => x.room);
      if (!area) return { skipped: true };
      u.area = area; g.playerPos = [(area.x0 + 11) * 3, (area.y0 + 11) * 3]; g._utRefreshRooms();
      const c = { kind: 'credit', area, pos: [g.playerPos[0] + 6, g.playerPos[1]], value: 40, beacon: 'credit_beacon_40', gain: 0.7 };
      u.pickups.push(c);
      g.updateUltimateMode(1 / 30);
      await new Promise((r) => setTimeout(r, 500));
      const v = c.voice;
      if (!v || !v.wet || !v.wet.taps || !v.wet.taps.size) return { name: v && v.name, taps: 0 };
      const t = [...v.wet.taps.values()][0];
      return { name: v.name, taps: v.wet.taps.size, gain: t.gain.value, wl: v.wet.wl.gain.value, conv: !!(t.bus && t.bus.conv && t.bus.conv.buffer), room: area.room };
    })(),
    farFromEnemies: u.enemies.every((e) => Math.hypot(g._utEnemyPos(e)[0] - g.playerPos[0], g._utEnemyPos(e)[1] - g.playerPos[1]) >= 10),
    towerItems: u.towerItems.size, towers: kinds.filter((k) => k === 'tower').length,
  };
});
check(w0.worldNo === 1 && w0.areas.length >= 5 && w0.areas.length <= 10, `world 1 has ${w0.areas.length} areas: ${w0.areas.join(', ')}`);
check(w0.eventAreas >= 1, 'at least one event area (the safe zone)');
check(w0.hp === 100 && w0.ammo === 0 && w0.points === 0, 'starts with 100 health, no ammo, no points');
check(w0.worldTime > 118 && w0.worldTime <= 120, `the first world lasts 2 minutes (${w0.worldTime.toFixed(1)} left)`);
check(w0.labsQuiet && w0.kindsRight, 'enemies only in battle, island and tower areas; throwers in tower areas only');
check(w0.enemies === w0.enemyAreas, `easy stretch: ${w0.enemies} enemies in ${w0.enemyAreas} enemy areas (one each: a chaser, or a tower area's one rival)`);
check(w0.farFromEnemies, 'no enemy within 10 units of the player at the start');
check(w0.pickups.filter((k) => k === 'ammo').length >= 3 && w0.safeAmmo === w0.eventAreas, `ammo scattered (${w0.pickups.filter((k) => k === 'ammo').length}), one in each safe zone`);
check(w0.pickups.filter((k) => k === 'credit').length >= 2 && w0.pickups.filter((k) => k === 'credit').length <= 3, 'two or three credits');
check(w0.towerItems === w0.towers, 'one item lying in each tower area');
check(w0.placed >= 1 && w0.loops >= 1 && w0.buses >= 1, `${w0.loops} loops, ${w0.placed} placed in 3D, ${w0.buses} area echo buses`);
check(w0.echo && (w0.echo.skipped || (w0.echo.taps >= 1 && w0.echo.gain > 0.2 && w0.echo.wl > 0.02 && w0.echo.conv)), 'a placed sound sends into its area\'s echo: ' + JSON.stringify(w0.echo));
check(w0.said === '' || !/Ultimate/.test(w0.said), 'dropped in silently (nothing said: "' + w0.said + '")');

// --------------------------------------------------------------- walking, walls, the report
const walk = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut;
  const before = [...g.playerPos];
  let moved = 0; let walls = 0;
  const dirs = ['up', 'right', 'down', 'left'];
  for (let i = 0; i < 40; i++) {
    const p0 = [...g.playerPos];
    g.input(dirs[i % 4]);
    if (g.playerPos[0] !== p0[0] || g.playerPos[1] !== p0[1]) moved += 1; else walls += 1;
  }
  g.input('enter');
  const report = document.getElementById('said').textContent;
  g.input('space');
  const empty = u.ammo;
  return { moved, walls, report, empty, area: u.area.kind, same: before[0] === g.playerPos[0] && before[1] === g.playerPos[1] };
});
check(walk.moved >= 1, `steps move (${walk.moved} moved, ${walk.walls} walls)`);
check(/^\d+ health\. \d+ points?\. \d+ shots?\.$/.test(walk.report) && !/world|area|labyrinth|island|tower|battle|event/i.test(walk.report), 'the report says health, points and ammo only: ' + walk.report);
check(walk.empty === 0, 'firing with no ammo spends nothing (the empty click)');

// --------------------------------------------------------------- ammo, shooting a chaser, points, the low-ammo tone
const shoot = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio;
  // Give the player ammo as a cartridge would, and put a chaser straight ahead.
  const battle = u.world.areas.find((x) => x.kind === 'battle' || x.kind === 'island');
  if (!battle) return { skipped: true };
  const cell = battle.floorCells[Math.floor(battle.floorCells.length / 2)];
  g.playerPos = [cell[0] * 3, cell[1] * 3];
  u.area = battle; g._utRefreshRooms();
  u.safe = 0;
  const chaser = u.enemies.find((e) => e.area === battle && e.kind === 'chaser');
  if (!chaser) return { skipped: true };
  chaser.x = g.playerPos[0]; chaser.y = g.playerPos[1] - 12;
  u.ammo = 6;
  const played = [];
  const orig = a.play.bind(a);
  a.play = (name, opts) => { played.push(name); return orig(name, opts); };
  const kills0 = u.kills; const points0 = u.points; const enemies0 = u.enemies.length;
  g.input('space');
  const afterShot = { kills: u.kills, points: u.points, ammo: u.ammo, enemies: u.enemies.length };
  // Five more shots at nothing: the low-ammo tones follow each (5, 4, 3, 2, 1 left);
  // then one more, at zero: the empty click.
  for (let i = 0; i < 6; i++) g.input('space');
  a.play = orig;
  return {
    skipped: false, kills0, points0, enemies0, afterShot, ammo: u.ammo,
    played, lowTones: played.filter((n) => /^ut_low_ammo_\d$/.test(n)), laser: played.filter((n) => n === 'laser').length, clicks: played.filter((n) => n === 'empty_click').length,
  };
});
if (shoot.skipped) console.log('SKIP no chaser to shoot in this world');
else {
  check(shoot.afterShot.kills === shoot.kills0 + 1 && shoot.afterShot.enemies === shoot.enemies0 - 1, 'a shot at a centred chaser kills it');
  check(shoot.afterShot.points === shoot.points0 + 10, `a chaser is worth 10 points in world 1 (${shoot.afterShot.points - shoot.points0})`);
  check(shoot.afterShot.ammo === 5, 'the shot cost one round');
  check(JSON.stringify(shoot.lowTones) === JSON.stringify(['ut_low_ammo_5', 'ut_low_ammo_4', 'ut_low_ammo_3', 'ut_low_ammo_2', 'ut_low_ammo_1']), 'low-ammo tones from five shots left down to one: ' + shoot.lowTones.join(', '));
  check(shoot.laser === 6 && shoot.clicks === 1 && shoot.ammo === 0, `six shots fired, then the empty click (${shoot.laser} lasers, ${shoot.clicks} clicks)`);
}

// --------------------------------------------------------------- a chaser strikes: health, the cap, the warning
const hit = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut;
  const battle = u.world.areas.find((x) => x.kind === 'battle' || x.kind === 'island');
  if (!battle) return { skipped: true };
  const cell = battle.floorCells[Math.floor(battle.floorCells.length / 2)];
  g.playerPos = [cell[0] * 3, cell[1] * 3];
  u.area = battle;
  u.safe = 0; u.hitCooldown = 0;
  let chaser = u.enemies.find((e) => e.area === battle && e.kind === 'chaser');
  if (!chaser) chaser = g._utSpawnEnemy(battle);
  chaser.x = g.playerPos[0]; chaser.y = g.playerPos[1] + 0.5;
  const hp0 = u.hp;
  g.updateUltimateMode(1 / 30);
  const hp1 = u.hp;
  const far = Math.hypot(chaser.x - g.playerPos[0], chaser.y - g.playerPos[1]);
  // Deep into a run the damage reaches the cap and never passes it.
  const dmgEasy = g._utDamage();
  const saved = u.elapsed; u.elapsed = 3600; const dmgLate = g._utDamage(); u.elapsed = saved;
  return { skipped: false, hp0, hp1, far, dmgEasy, dmgLate, cooldown: u.hitCooldown };
});
if (!hit.skipped) {
  check(hit.hp1 === hit.hp0 - 5, `a touch in the easy stretch costs 5 health (${hit.hp0} to ${hit.hp1})`);
  check(hit.far >= 14, `the chaser that struck is set back (${hit.far.toFixed(1)} units)`);
  check(hit.dmgEasy === 5 && hit.dmgLate === 25, `damage: ${hit.dmgEasy} early, ${hit.dmgLate} an hour in (the cap)`);
  check(hit.cooldown > 0, 'hits cannot chain (cooldown set)');
}

// --------------------------------------------------------------- the compass
const compass = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio;
  // Stand somewhere outside a safe zone.
  const away = u.world.areas.find((x) => x.kind !== 'event');
  const cell = away.floorCells[0];
  g.playerPos = [cell[0] * 3, cell[1] * 3]; u.area = away;
  const pos0 = [...g.playerPos];
  const f0 = a.worldFilter.frequency.value;
  g.input('hold');
  const on = u.compass.on;
  const saidOn = document.getElementById('said').textContent;
  g.input('up'); const stillThere = g.playerPos[0] === pos0[0] && g.playerPos[1] === pos0[1];
  g.input('right'); const saidRight = document.getElementById('said').textContent;
  const played = [];
  const orig = a.play.bind(a);
  a.play = (name, opts) => { played.push([name, opts]); return orig(name, opts); };
  for (let i = 0; i < 60; i++) g.updateUltimateMode(1 / 30);   // two seconds: beeps
  a.play = orig;
  await new Promise((r) => setTimeout(r, 600));
  const fOn = a.worldFilter.frequency.value;
  const ammo0 = u.ammo; g.input('space'); const ammoAfter = u.ammo;
  const route = g._utRouteStep();
  g.input('compass');
  const off = u.compass.on;
  await new Promise((r) => setTimeout(r, 600));
  const fOff = a.worldFilter.frequency.value;
  // In a safe zone: refused, with the exact words.
  const safe = u.world.areas.find((x) => x.kind === 'event');
  const sc = safe.floorCells[Math.floor(safe.floorCells.length / 2)];
  g.playerPos = [sc[0] * 3, sc[1] * 3]; u.area = safe;
  g.input('hold');
  const saidSafe = document.getElementById('said').textContent;
  const onInSafe = u.compass.on;
  const beeps = played.filter(([n]) => /^ut_compass_\d$/.test(n));
  return { on, saidOn, stillThere, saidRight, beeps: beeps.length, direct: beeps.every(([, o]) => o && o.direct), f0, fOn, fOff, ammo0, ammoAfter, route, off, saidSafe, onInSafe };
});
check(compass.on && /Compass on/.test(compass.saidOn), 'a held finger turns the compass on: ' + compass.saidOn);
check(compass.stillThere, 'while the compass is on, a swipe turns the compass and the player does not move');
check(/^Right(\.|, \d+ steps?, (then turn|and you are there)\.)( (A labyrinth|An island|A tower area|A battle area|A safe zone|The edge of the world), \d+ steps? away(, then (a labyrinth|an island|a tower area|a battle area|a safe zone))?\.| Beyond it, .*\.)?$/.test(compass.saidRight), 'turning speaks the direction, with the leg\'s length when it is the way, and what lies that way: ' + compass.saidRight);
check(compass.beeps >= 3 && compass.direct, `the compass beeps (${compass.beeps} in two seconds), played direct (never muffled)`);
check(compass.f0 >= 19000 && compass.fOn < 2000 && compass.fOff >= 19000, `the world is muffled while the compass is on (${Math.round(compass.f0)} Hz, ${Math.round(compass.fOn)}, ${Math.round(compass.fOff)})`);
check(compass.ammo0 === compass.ammoAfter, 'the weapon does not fire while the compass is on');
check(Array.isArray(compass.route) && compass.route.length === 2, 'the route to the nearest safe zone has a first step: ' + JSON.stringify(compass.route));
check(!compass.off, 'C turns the compass off');
check(compass.saidSafe === 'Compass not available. Safe zone detected.' && !compass.onInSafe, 'in a safe zone: "' + compass.saidSafe + '"');

// --------------------------------------------------------------- the island elevator and the seabed
const island = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio;
  const isl = u.world.areas.find((x) => x.kind === 'island');
  if (!isl) return { skipped: true };
  // Step onto the elevator from beside it.
  u.area = isl;
  g.playerPos = [isl.elevator[0] * 3, (isl.elevator[1] + 1) * 3];
  u.liftArmed = false;
  g.updateUltimateMode(1 / 30);   // arms the lift (we are a step away)
  g.input('up');
  g.updateUltimateMode(1 / 30);
  const riding = u.place;
  const blocked = g.mode.blockPause(g);
  const pos0 = [...g.playerPos];
  g.input('up');   // nothing moves on a ride
  const held = g.playerPos[0] === pos0[0] && g.playerPos[1] === pos0[1];
  // Let the ride run its length (its clock waits for the recording to decode).
  for (let i = 0; i < 30 * 20 && u.place === 'ride'; i++) {
    g.updateUltimateMode(1 / 30);
    if (i % 30 === 0) await new Promise((r) => setTimeout(r, 20));
  }
  const place = u.place;
  const under = u.seabed && u.seabed.under ? u.seabed.under.name : null;
  const pickups = u.seabed ? u.seabed.pickups.map((p) => p.kind) : [];
  const routeSeabed = g._utRouteStep();
  // Walk out and back: the elevator up.
  g.input('up'); g.input('up');
  g.updateUltimateMode(1 / 30);
  const route2 = g._utRouteStep();
  g.input('down'); g.input('down');
  g.updateUltimateMode(1 / 30);
  const upRide = u.place;
  for (let i = 0; i < 30 * 20 && u.place === 'ride'; i++) {
    g.updateUltimateMode(1 / 30);
    if (i % 30 === 0) await new Promise((r) => setTimeout(r, 20));
  }
  return { skipped: false, riding, blocked, held, place, under, pickups, routeSeabed, route2, upRide, back: u.place, area: u.area.kind, at: g.playerPos, lift: isl.elevator.map((c) => c * 3), buses: a.areaBuses.size };
});
if (island.skipped) console.log('SKIP no island in this world');
else {
  check(island.riding === 'ride' && island.blocked && island.held, 'walking into the elevator starts a ride; no pause and no steps during it');
  check(island.place === 'seabed' && island.under === 'underwater', 'the ride arrives on the seabed, with the water');
  check(island.pickups.filter((k) => k === 'ammo').length >= 1, 'the seabed holds ammo: ' + island.pickups.join(', '));
  check(island.routeSeabed === null && JSON.stringify(island.route2) === JSON.stringify([0, 1]), 'on the seabed the compass points to the elevator');
  check(island.upRide === 'ride' && island.back === 'world' && island.area === 'island' && island.at[0] === island.lift[0] && island.at[1] === island.lift[1], 'the elevator up brings you back onto the island, at the lift');
}

// --------------------------------------------------------------- a tower area: items only, never the laser
// (Regenerate, hurried along, until the world has a tower area with its thrower.)
await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut;
  for (let n = 0; n < 12 && !u.enemies.some((e) => e.kind === 'thrower'); n++) {
    u.worldTime = 0.05;
    for (let i = 0; i < 60; i++) g.updateUltimateMode(1 / 30);
    await new Promise((r) => setTimeout(r, 40));
  }
});
const tower = await page.evaluate(() => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio;
  const tw = u.world.areas.find((x) => x.kind === 'tower');
  if (!tw) return { skipped: true };
  const thrower = u.enemies.find((e) => e.area === tw && e.kind === 'thrower');
  if (!thrower) return { skipped: true };
  const item = u.towerItems.get(tw.id);
  u.area = tw; u.safe = 0;
  const ip = g._utItemPos(item);
  g.playerPos = [ip[0], ip[1] + 3];
  g.input('up');
  g.updateUltimateMode(1 / 30);
  const held = g._utItemsHeld();
  const fresh = u.towerItems.has(tw.id);
  // The thrower straight ahead: the attack throws the item (ammo untouched).
  thrower.x = g.playerPos[0] - tw.centre[0]; thrower.y = g.playerPos[1] - tw.centre[1] - 10;
  u.ammo = 3;
  const hits0 = thrower.hitsTaken;
  g.input('space');
  const afterThrow = { held: g._utItemsHeld(), ammo: u.ammo, hits: thrower.hitsTaken, needed: thrower.hitsNeeded, alive: u.enemies.includes(thrower) };
  const played = []; const orig = a.play.bind(a); a.play = (n, o) => { played.push(n); return orig(n, o); };
  g.input('space');   // nothing held: the empty click, not the laser (ammo is no fallback in a tower area)
  a.play = orig;
  const afterShot = { ammo: u.ammo, hits: thrower.hitsTaken, alive: u.enemies.includes(thrower), played };
  // Leaving the area loses the items.
  u.towerCarry = { area: tw.id, count: 3 };
  const other = u.world.areas.find((x) => x !== tw);
  const oc = other.floorCells[0];
  const from = [...g.playerPos];
  g.playerPos = [oc[0] * 3, (oc[1] + 1) * 3];
  g.input('up');
  const after = g._utItemsHeld();
  return { skipped: false, held, fresh, afterThrow, afterShot, after, carry: u.towerCarry, from };
});
if (tower.skipped) console.log('SKIP no tower area with a thrower in this world');
else {
  check(tower.held === 1 && tower.fresh, 'walking into a tower item takes it, and a fresh one appears');
  check(tower.afterThrow.held === 0 && tower.afterThrow.ammo === 3 && (tower.afterThrow.hits === 1 || !tower.afterThrow.alive), 'the attack throws the held item at the centred thrower, spending no ammo');
  check(tower.afterShot.ammo === 3 && tower.afterShot.played.includes('empty_click') && !tower.afterShot.played.includes('laser') && (!tower.afterShot.alive || tower.afterShot.hits === tower.afterThrow.hits), 'with no item held, the attack in a tower area is the empty click: no laser, no ammo spent: ' + JSON.stringify(tower.afterShot.played));
  check(tower.after === 0 && tower.carry === null, 'tower items are gone on leaving the area');
}

// --------------------------------------------------------------- regeneration
const regen = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio;
  const world1 = u.world; const no1 = u.worldNo; const worlds1 = u.worlds;
  u.worldTime = 15.5; u.warned = false;
  const played = [];
  const orig = a.play.bind(a);
  a.play = (name, opts) => { played.push(name); return orig(name, opts); };
  const spoken = [];
  const origSpeak = g.tts.speak.bind(g.tts);
  g.tts.speak = (t, o) => { if (t) spoken.push(t); return origSpeak(t, o); };
  const levels = [];
  const origLevel = a.setWorldLevel.bind(a);
  a.setWorldLevel = (l, s) => { levels.push([l, s]); return origLevel(l, s); };
  let phases = new Set(); let atEnd = null; let atStart = null; let firstTime = null;
  u.ammo = 7;
  for (let i = 0; i < 30 * 20; i++) {
    g.updateUltimateMode(1 / 30);
    phases.add(u.phase);
    if (u.worldNo === no1) atEnd = { hp: u.hp, ammo: u.ammo };   // the last values of the old world (a chaser may still strike during the fade)
    if (u.worldNo === no1 + 1 && !atStart) { atStart = { hp: u.hp, ammo: u.ammo }; firstTime = u.worldTime; }
    if (u.worldNo === no1 + 1 && u.phase === 'play') break;
    if (i % 15 === 0) await new Promise((r) => setTimeout(r, 15));
  }
  a.play = orig; g.tts.speak = origSpeak; a.setWorldLevel = origLevel;
  await new Promise((r) => setTimeout(r, 1200));
  return {
    worldNo: u.worldNo, no1, worlds: u.worlds, worlds1, newWorld: u.world !== world1, phases: [...phases], spoken, counts: played.filter((n) => n === 'countdown_high').length,
    levels, safe: u.safe, atEnd, atStart, worldTime: firstTime, mult: g._utMultiplier(),
    compassOff: !u.compass.on, place: u.place, carry: u.towerCarry, areas: u.world.areas.length, loops: [...a.live].filter((v) => v.loop).length,
  };
});
check(regen.worldNo === regen.no1 + 1 && regen.newWorld && regen.worlds === regen.worlds1 + 1, `the world regenerates into world ${regen.no1 + 1}`);
check(regen.spoken.includes('World regenerating in 15 seconds.'), 'the voice warns with the exact words: ' + JSON.stringify(regen.spoken));
check(regen.counts === 5, `Battle's countdown over the last five seconds (${regen.counts} beeps)`);
check(regen.phases.includes('fading') && !regen.phases.includes('silence') && regen.phases.includes('fadein'), 'fade out, then the new world at once, no silence: ' + regen.phases.join(', '));
check(regen.levels.some(([l, s]) => l === 0 && s === 2) && regen.levels.some(([l, s]) => l === 1 && s === 0.5), 'the world fades out over two seconds and the new one rises in half a second: ' + JSON.stringify(regen.levels));
check(regen.worldTime > 119 && regen.worldTime <= 120, `the next world lasts two minutes too (${regen.worldTime && regen.worldTime.toFixed(1)})`);
check(regen.atEnd && regen.atStart && regen.atEnd.hp === regen.atStart.hp && regen.atEnd.ammo === regen.atStart.ammo && regen.atStart.ammo === 7, 'health and ammo carry over: ' + JSON.stringify([regen.atEnd, regen.atStart]));
check(Math.abs(regen.mult - (1 + 0.5 * regen.worlds)) < 1e-9, `the multiplier is now ${regen.mult} (${regen.worlds} worlds survived)`);
check(regen.place === 'world' && regen.carry === null && regen.compassOff, 'on the ground, no tower items, compass off');
check(regen.loops >= 1, `the new world sounds (${regen.loops} loops)`);

// --------------------------------------------------------------- scoring with the multiplier, no points in a safe zone
const score = await page.evaluate(() => {
  const g = window.__el.game; const u = g.ut;
  const safe = u.world.areas.find((x) => x.kind === 'event');
  const danger = u.world.areas.find((x) => x.kind !== 'event');
  const sc = safe.floorCells[Math.floor(safe.floorCells.length / 2)];
  g.playerPos = [sc[0] * 3, sc[1] * 3]; u.area = safe;
  const p0 = u.points;
  const ammoP = g._utSpawnPickup('ammo', safe, { pos: [...g.playerPos], safe: true });
  const a0 = u.ammo;
  g._utTakePickup(ammoP);
  const safePoints = u.points - p0; const gotAmmo = u.ammo - a0;
  const dc = danger.floorCells[Math.floor(danger.floorCells.length / 2)];
  g.playerPos = [dc[0] * 3, dc[1] * 3]; u.area = danger;
  const p1 = u.points;
  const credit = { kind: 'credit', area: danger, pos: [...g.playerPos], value: 40, beacon: 'credit_beacon_40', gain: 0.7 };
  u.pickups.push(credit);
  g._utTakePickup(credit);
  const creditPoints = u.points - p1;
  const timers = u.timers.map((t) => t.kind + (t.danger ? ':danger' : '') + (t.safe ? ':safe' : ''));
  return { safePoints, gotAmmo, creditPoints, timers, mult: g._utMultiplier() };
});
check(score.safePoints === 0 && score.gotAmmo > 0, 'a cartridge taken in the safe zone gives ammo but no points');
check(score.creditPoints === Math.round(40 * score.mult), `a 40 credit is worth ${Math.round(40 * score.mult)} now (times ${score.mult}): ${score.creditPoints}`);
check(score.timers.includes('ammo:safe') && score.timers.includes('credit:danger'), 'the safe zone\'s cartridge comes back there; the credit comes back in a dangerous area: ' + score.timers.join(', '));

// --------------------------------------------------------------- pause freezes the countdown; game over
const end = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut;
  // (The safe zone above may have put us within reach of its water slide, which refuses the pause.)
  if (u.place === 'slide') { u.slide = null; u.place = 'world'; }
  const t0 = u.worldTime;
  g.input('pause');
  for (let i = 0; i < 30; i++) g.updateUltimateMode(1 / 30);
  const frozen = u.worldTime === t0 && g.isPaused;
  const dbg = { t0, t1: u.worldTime, paused: g.isPaused, place: u.place, phase: u.phase, state: g.state, said: document.getElementById('said').textContent.slice(0, 60) };
  g.input('pause');
  u.hp = 5; u.safe = 0; u.hitCooldown = 0;
  g._utHurt(null);
  const state = g.state;
  await new Promise((r) => setTimeout(r, 300));
  const said = document.getElementById('said').textContent;
  const spatial = window.__el.audio.spatial;
  const score = g.scores.scores.ultimate;
  return { frozen, dbg, state, said, spatial, score, points: u.points };
});
check(end.frozen, 'the pause freezes the regeneration countdown: ' + JSON.stringify(end.dbg));
check(end.state === 'game_over', 'health at zero ends the run');
check(/^Game Over\. You scored \d+ points?, survived .+, and made it through \d+ worlds?\./.test(end.said), 'the end says points, time survived and worlds: ' + end.said);
check(!end.spatial, 'the 3D world closes with the run');
check(end.score === end.points && end.points > 0, `the score is saved to the board (${end.score})`);

// --------------------------------------------------------------- back to the menu; errors
await page.evaluate(() => { window.__el.game.input('enter'); });
const after = await page.evaluate(() => ({ state: window.__el.game.state, live: [...window.__el.audio.live].filter((v) => v.loop).length }));
check(after.state === 'menu' && after.live === 0, 'back at the menu with nothing looping');
check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
