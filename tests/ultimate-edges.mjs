// Ultimate Mode (web 2.0.0): the edges. A regeneration while on the seabed
// and while riding, the compass between worlds, help and quitting with the
// compass on, a pause during the fade, throwers' throws and deaths, the seabed in
// the world's own coordinates, and a clean start of another mode afterwards.
//   node --import ./tests/github-stub.mjs tests/ultimate-edges.mjs http://localhost:8765

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A run whose world has an island, a tower area and a battle area (made again until it does).
await page.evaluate(async () => {
  const g = window.__el.game;
  for (let i = 0; i < 40; i++) {
    g.menuIndex = g.menuKeys.indexOf('ultimate');
    g.input('enter');
    const kinds = g.ut.world.areas.map((a) => a.kind);
    if (kinds.includes('island') && kinds.includes('tower') && kinds.includes('battle') && kinds.includes('labyrinth')) return;
    g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu();
    await new Promise((r) => setTimeout(r, 50));
  }
});
await sleep(500);

// --------------------------------------------------------------- the seabed, in world coordinates
const seabed = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut;
  const isl = u.world.areas.find((x) => x.kind === 'island');
  u.area = isl; u.safe = 0;
  g.playerPos = [isl.elevator[0] * 3, (isl.elevator[1] + 1) * 3];
  u.liftArmed = false; g.updateUltimateMode(1 / 30);
  g.input('up'); g.updateUltimateMode(1 / 30);
  // The lift's hum is silent in the car (Island Mode stops it as the ride begins).
  const hum = u.areaSounds.get(isl.id) && u.areaSounds.get(isl.id).hum;
  let humInCar = 0;
  for (let i = 0; i < 30 * 20 && u.place === 'ride'; i++) { g.updateUltimateMode(1 / 30); if (hum) humInCar = Math.max(humInCar, hum.l); if (i % 30 === 0) await new Promise((r) => setTimeout(r, 20)); }
  const humOnSeabed = hum ? hum.l : 0;
  const lift = [isl.elevator[0] * 3, isl.elevator[1] * 3];
  const atLift = g.playerPos[0] === lift[0] && g.playerPos[1] === lift[1];
  const origin = u.seabed.origin;
  // Walk to the seabed's edge: the wall stops you there, six cells out.
  let steps = 0; let p0 = [...g.playerPos];
  for (let i = 0; i < 10; i++) { const b = [...g.playerPos]; g.input('right'); if (g.playerPos[0] !== b[0]) steps += 1; }
  const edge = (g.playerPos[0] - lift[0]) / 3;
  // Walk onto a seabed pickup: it is taken (ammo or a credit).
  const pk = u.seabed.pickups[0];
  const a0 = u.ammo; const pts0 = u.points;
  g.playerPos = [pk.pos[0], pk.pos[1] + 3];
  g.input('up'); g.updateUltimateMode(1 / 30);
  const taken = !u.seabed.pickups.includes(pk) && (u.ammo > a0 || u.points > pts0);
  const inside = u.seabed.pickups.every((q) => Math.abs(q.pos[0] - lift[0]) <= 18 && Math.abs(q.pos[1] - lift[1]) <= 18);
  // The compass points back toward the lift.
  g.input('hold');
  const route = g._utRouteStep();
  const toward = route && Math.sign(route[0]) === -Math.sign(g.playerPos[0] - lift[0] || 0) || (route && route[0] === 0);
  g.input('compass');
  // The shore is heard from above, placed at the player (not off at the island's middle).
  const s = u.areaSounds.get(isl.id);
  const ambPos = s && s.amb && s.amb.pos3 ? s.amb.pos3.slice() : null;
  return { place: u.place, atLift, origin: JSON.stringify(origin) === JSON.stringify(isl.elevator), steps, edge, taken, inside, route, toward, ambPos, under: !!(u.seabed && u.seabed.under), humInCar, humOnSeabed, hadHum: !!hum };
});
check(seabed.place === 'seabed' && seabed.atLift && seabed.origin, 'the ride down lands under the lift; the seabed\'s origin is the elevator\'s cell');
check(seabed.steps === 6 && seabed.edge === 6, `the seabed is six cells across from the lift, with a wall beyond (${seabed.steps} steps)`);
check(seabed.taken && seabed.inside, 'a seabed pickup is walked onto and taken, and every pickup lies within the seabed');
check(seabed.route && seabed.toward, 'the compass on the seabed points back toward the elevator: ' + JSON.stringify(seabed.route));
check(seabed.ambPos && Math.abs(seabed.ambPos[0]) < 0.1 && seabed.ambPos[1] > 5 && seabed.under, `on the seabed the shore is straight above (${seabed.ambPos && seabed.ambPos.map((v) => v.toFixed(1)).join(', ')}) and the water plays`);
check(seabed.hadHum && seabed.humInCar === 0 && seabed.humOnSeabed === 0, `the lift's hum is silent in the car and on the seabed (${seabed.humInCar}, ${seabed.humOnSeabed})`);

// --------------------------------------------------------------- a regeneration while on the seabed
const regenSeabed = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio;
  const f0 = a.worldFilter.frequency.value;
  u.worldTime = 2.5;
  for (let i = 0; i < 30 * 12; i++) { g.updateUltimateMode(1 / 30); if (u.worldNo === 2 && u.phase === 'play') break; if (i % 15 === 0) await new Promise((r) => setTimeout(r, 10)); }
  await new Promise((r) => setTimeout(r, 300));
  const onFloor = u.world.floor.has(Math.round(g.playerPos[0] / 3) + ',' + Math.round(g.playerPos[1] / 3));
  return { worldNo: u.worldNo, place: u.place, seabed: u.seabed, rideMix: u.rideMix, onFloor, area: u.area && u.area.kind, f: a.worldFilter.frequency.value, f0 };
});
check(regenSeabed.worldNo === 2 && regenSeabed.place === 'world' && regenSeabed.seabed === null && regenSeabed.rideMix === null && regenSeabed.onFloor, 'regenerating from the seabed lands you on the floor of the new world, with no seabed or ride left');

// --------------------------------------------------------------- the compass between worlds, and a regeneration mid-ride
const between = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio;
  // Mid-ride: step into an island's lift (make one if the new world has none).
  let isl = u.world.areas.find((x) => x.kind === 'island');
  let rode = null;
  if (isl) {
    u.area = isl; u.safe = 0;
    g.playerPos = [isl.elevator[0] * 3, (isl.elevator[1] + 1) * 3];
    u.liftArmed = false; g.updateUltimateMode(1 / 30);
    g.input('up'); g.updateUltimateMode(1 / 30);
    rode = u.place;
  }
  u.worldTime = 2.5;
  // The new world is there the moment the count reaches zero (no silence); the
  // compass, turned on and off in its first rising moments, leaves it unmuffled.
  let sawSilence = false; let compassAtRise = null; let gapAtRise = null;
  for (let i = 0; i < 30 * 12; i++) {
    g.updateUltimateMode(1 / 30);
    if (u.phase === 'silence') sawSilence = true;
    if (u.phase === 'fadein' && compassAtRise === null) {
      gapAtRise = u.gap;
      if (u.place === 'world' && !g._utInSafeZone()) { g.input('hold'); compassAtRise = u.compass.on; g.input('hold'); } else compassAtRise = 'n/a';
    }
    if (u.worldNo === 3 && u.phase === 'play') break;
    if (i % 15 === 0) await new Promise((r) => setTimeout(r, 10));
  }
  await new Promise((r) => setTimeout(r, 900));
  return { rode, worldNo: u.worldNo, place: u.place, sawSilence, compassAtRise, gapAtRise, compassNow: u.compass.on, f: a.worldFilter.frequency.value, ride: u.ride };
});
check(between.rode === null || (between.rode === 'ride' && between.ride === null && between.place === 'world'), 'a regeneration during a ride ends the ride and lands you in the new world');
check(between.worldNo === 3 && !between.sawSilence && between.gapAtRise !== null && between.gapAtRise <= 0.5, `no silence between worlds: the next one rises at once (${between.gapAtRise} s)`);
check((between.compassAtRise === true || between.compassAtRise === 'n/a') && !between.compassNow && between.f > 19000, `the compass works in the new world's first moments and leaves it unmuffled (${Math.round(between.f)} Hz)`);

// --------------------------------------------------------------- help and quitting with the compass on
const helpQuit = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio;
  const away = u.world.areas.find((x) => x.kind !== 'event');
  const c = away.floorCells[0]; g.playerPos = [c[0] * 3, c[1] * 3]; u.area = away;
  g.input('hold');
  const on = u.compass.on;
  g.input('help');                       // a keyboard's H during a run opens help
  const helpState = g.state; const offInHelp = !u.compass.on;
  g.input('back');                       // leave help, resume
  const back = g.state;
  g.input('hold');
  await new Promise((r) => setTimeout(r, 500));
  const muffled = a.worldFilter.frequency.value < 2000;
  g.input('back');                       // Escape: the quit question
  g.input('yes');
  await new Promise((r) => setTimeout(r, 600));
  return { on, helpState, offInHelp, back, muffled, state: g.state, spatial: a.spatial, worldGain: !!a.worldGain, live: [...a.live].filter((v) => v.loop).length };
});
check(helpQuit.on && helpQuit.helpState === 'help' && helpQuit.offInHelp && helpQuit.back === 'ultimate', 'opening help puts the compass away; leaving help resumes the run');
check(helpQuit.muffled && helpQuit.state === 'menu' && !helpQuit.spatial && !helpQuit.worldGain && helpQuit.live === 0, 'quitting with the compass on closes the 3D world and its muffle, with nothing looping');

// --------------------------------------------------------------- another mode afterwards is itself
const after = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio;
  g.menuIndex = g.menuKeys.indexOf('standard'); g.input('enter');
  await new Promise((r) => setTimeout(r, 400));
  const v = [...a.live].find((x) => x.loop);
  const r = { state: g.state, room: a.room, spatial: a.spatial, placed: v ? v.placed : null, toOut: v && v.dry ? true : null, buses: a.areaBuses.size };
  g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu();
  return r;
});
check(after.state === 'standard' && after.room === 'lab' && !after.spatial && after.placed === false && after.buses === 0, 'Standard Mode after a run is plain stereo in the labyrinth room, no 3D left over');

// --------------------------------------------------------------- throwers: a throw hits, a kill respawns, a pause during the fade
await page.evaluate(async () => {
  const g = window.__el.game;
  for (let i = 0; i < 40; i++) {
    g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter');
    if (g.ut.world.areas.some((a) => a.kind === 'tower')) return;
    g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu();
    await new Promise((r) => setTimeout(r, 50));
  }
});
await sleep(400);
const thrower = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio;
  const tw = u.world.areas.find((x) => x.kind === 'tower');
  const e = u.enemies.find((x) => x.area === tw && x.kind === 'thrower');
  if (!e) return { skipped: true };
  u.area = tw; u.safe = 0; u.hitCooldown = 0;
  // In the middle of the area (the middle of the floor list is a cell at its edge).
  g.playerPos = [(tw.x0 + 11) * 3, (tw.y0 + 11) * 3];
  // The thrower holds an item, is ready, and stands ten units north: it winds up and throws.
  e.x = g.playerPos[0] - tw.centre[0]; e.y = g.playerPos[1] - tw.centre[1] - 10;
  e.items = 1; e.cooldown = 0; e.notice = 0; e.recover = 0; e.winding = 0; e.pending = 0;
  const played = [];
  const orig = a.play.bind(a);
  a.play = (n, o) => { played.push(n); return orig(n, o); };
  const hp0 = u.hp;
  let flew = 0; let hitAt = null;
  for (let i = 0; i < 30 * 6; i++) {
    g.updateUltimateMode(1 / 30);
    flew = Math.max(flew, u.projectiles.length);
    if (u.hp < hp0 && hitAt === null) hitAt = i;
    if (hitAt !== null) break;
  }
  a.play = orig;
  const windup = played.some((n) => /^enemy_windup/.test(n)); const thrown = played.includes('item_throw'); const buzz = played.includes('item_buzz');
  // Bring it down with thrown items (the laser never fires in a tower area): a
  // respawn is scheduled for its area.
  u.ammo = 30;
  e.x = g.playerPos[0] - tw.centre[0]; e.y = g.playerPos[1] - tw.centre[1] - 8;
  u.towerCarry = { area: tw.id, count: 40 };
  let shots = 0;
  while (u.enemies.includes(e) && shots < 40) { g.input('space'); shots += 1; }
  const ammoLeft = u.ammo;
  const respawn = (u.respawn.get(tw.id) || []).length;
  const kills = u.kills;
  // Enemies come back after a while (hurried).
  for (const [id, list] of u.respawn) u.respawn.set(id, list.map(() => 0.01));
  const n0 = u.enemies.length;
  g.updateUltimateMode(1 / 30);
  return { skipped: false, windup, thrown, buzz, flew, hit: hitAt !== null, hp: u.hp, hp0, shots, ammoLeft, needed: e.hitsNeeded, respawn, kills, back: u.enemies.length - n0 };
});
if (thrower.skipped) console.log('SKIP no thrower');
else {
  check(thrower.windup && thrower.thrown && thrower.buzz && thrower.flew >= 1, `a thrower winds up, throws, and the item buzzes in flight (windup ${thrower.windup}, throw ${thrower.thrown}, buzz ${thrower.buzz}, in flight ${thrower.flew})`);
  check(thrower.hit && thrower.hp === thrower.hp0 - 5, `a thrown item that reaches you costs 5 health in the easy stretch (${thrower.hp0} to ${thrower.hp})`);
  check(thrower.shots === thrower.needed && thrower.ammoLeft === 30 && thrower.respawn === 1, `thrown items bring a thrower down in its ${thrower.needed} hits with no ammo spent, and another is due in its area`);
  check(thrower.back === 1, 'a shot enemy comes back in its own area');
}

// A fresh sound engine mid-run (the phone stopped the old one): the world is made
// again in it, with its buses, and the placed loops carry on, placed.
const recovered = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio;
  const before = { loops: [...a.live].filter((v) => v.loop).length, buses: a.areaBuses.size };
  const oldCtx = a.ctx;
  a.recover();
  await new Promise((r) => setTimeout(r, 600));
  for (let i = 0; i < 10; i++) g.updateUltimateMode(1 / 30);
  const live = [...a.live].filter((v) => v.loop);
  const moved = live.filter((v) => v.pos3).every((v) => v.ctx === a.ctx && v.dry && v.dry.panner);
  // Placed sounds move with the player: a step changes a loop's panner position.
  const v = live.find((x) => x.pos3 && x.dry && x.dry.panner && x.name.startsWith('obstacle_')) || live.find((x) => x.pos3 && x.dry && x.dry.panner);
  const p0 = v ? v.pos3.slice() : null;
  g.input('left'); g.updateUltimateMode(1 / 30);
  const p1 = v ? v.pos3.slice() : null;
  return { before, newCtx: a.ctx !== oldCtx, spatial: a.spatial, world: !!(a.worldIn && a.worldGain), buses: a.areaBuses.size, loops: live.length, moved, p0, p1 };
});
check(recovered.newCtx && recovered.spatial && recovered.world && recovered.buses >= 1 && recovered.loops >= 1 && recovered.moved, `a fresh engine keeps the 3D world: ${recovered.loops} loops rebound and placed, ${recovered.buses} buses`);
check(recovered.p0 && recovered.p1 && Math.abs((recovered.p1[0] - recovered.p0[0]) - 3) < 0.3, `a step left moves a placed sound three units right relative to you: ${JSON.stringify(recovered.p0)} -> ${JSON.stringify(recovered.p1)}`);

// A pause during the fade holds the world where it is; resuming carries on to the new world.
const fadePause = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio;
  const levels = [];
  const o = a.setWorldLevel.bind(a); a.setWorldLevel = (l, s) => { levels.push([l, +s.toFixed(2)]); return o(l, s); };
  u.worldTime = 1.6; u.phase = 'play';
  g.updateUltimateMode(1 / 30);           // enters 'fading'
  const fading = u.phase;
  g.input('pause');
  const held = levels[levels.length - 1];
  g.updateUltimateMode(1); g.updateUltimateMode(1);
  const stillFading = u.phase === 'fading' && u.worldTime > 0;
  g.input('pause');
  const resumed = levels[levels.length - 1];
  const w0 = u.worldNo;
  for (let i = 0; i < 30 * 8; i++) { g.updateUltimateMode(1 / 30); if (u.worldNo > w0 && u.phase === 'play') break; if (i % 15 === 0) await new Promise((r) => setTimeout(r, 10)); }
  a.setWorldLevel = o;
  return { fading, held, stillFading, resumed, regenerated: u.worldNo === w0 + 1 };
});
check(fadePause.fading === 'fading' && fadePause.held && fadePause.held[1] === 0.01 && fadePause.stillFading, 'a pause in the fade holds the level and the clock');
check(fadePause.resumed && fadePause.resumed[0] === 0 && fadePause.regenerated, 'resuming carries the fade on to the new world');

// --------------------------------------------------------------- game over during the fade, then the menu
const endFade = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio;
  u.worldTime = 1.0; u.phase = 'play'; g.updateUltimateMode(1 / 30);
  u.hp = 3; u.safe = 0; u.hitCooldown = 0;
  g._utHurt(null);
  await new Promise((r) => setTimeout(r, 300));
  return { state: g.state, spatial: a.spatial, said: document.getElementById('said').textContent };
});
check(endFade.state === 'game_over' && !endFade.spatial && /^Game Over\./.test(endFade.said), 'dying during the fade ends the run cleanly: ' + endFade.said.slice(0, 60));
await page.evaluate(() => window.__el.game.input('enter'));
check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
