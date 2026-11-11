// Ultimate Mode (web 4.1.0): the pool at the foot of a water slide, and the glass
// cases. You splash down in the middle of a pool and wade (or, running, swim) out
// of it; a glass case hums where it stands, chimes when you are within a step of
// it, and your attack smashes it: the reward is yours at once and spoken, two to
// five fast chasers come from far off unannounced, broken glass crunches underfoot,
// and leaving the area loses the chasers.
//   node --import ./tests/github-stub.mjs tests/ultimate-glass.mjs http://localhost:8765

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

await page.evaluate(() => { const g = window.__el.game; g.scores.settings.turnTold = true; g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter'); });
await sleep(800);

await page.evaluate(async () => {
  const a = window.__el.audio; const g = window.__el.game;
  const mod = await import('./js/modes/ultimate.js');
  const world = await import('./js/modes/ultimate/world.js');
  const K = { north: 0, east: 1, south: 2, west: 3 };
  const T = window.__t = {
    mod, world,
    face(way) { g._utTurnStop(); g._utFace(K[way] * Math.PI / 2, true); },
    go(way) { this.face(way); g.input('up'); },
    // Another world, until `ok()` likes it (or `tries` are used up).
    async regen(ok, tries = 40) {
      const u = g.ut;
      for (let n = 0; n < tries; n++) {
        if (n > 0 || !ok()) {
          u.place = 'world'; u.slide = null;
          u.worldTime = 0.05;
          for (let i = 0; i < 90 && u.worldTime < 1; i++) g.updateUltimateMode(1 / 30);
          for (let i = 0; i < 30; i++) g.updateUltimateMode(1 / 30);
          await new Promise((r) => setTimeout(r, 30));
        }
        if (ok()) return true;
      }
      return false;
    },
    // What is played and said from now on.
    listen() {
      const played = []; const spoken = [];
      const op = a.play.bind(a); const os = g.tts.speak.bind(g.tts);
      a.play = (n, o) => { played.push(n); return op(n, o); };
      g.tts.speak = (t, o) => { spoken.push(t); return os(t, o); };
      return { played, spoken, stop() { a.play = op; g.tts.speak = os; } };
    },
    // Nothing that could get in a check's way: no enemies, no bus, no hurt.
    calm() { const u = g.ut; for (const e of u.enemies) if (e.voice) { e.voice.stop(); u.voices.delete(e.voice); } u.enemies = []; u.respawn.clear(); u.bus = null; u.busAt = null; u.safe = 0; u.worldTime = Math.max(u.worldTime, 200); },
    floorSet(area) { return new Set(area.floorCells.map(([x, y]) => `${x},${y}`)); },
  };
  T.DIRS = [['north', 0, -1], ['east', 1, 0], ['south', 0, 1], ['west', -1, 0]];
});

// ------------------------------------------------------------------ 1. the pool
const pool = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__t; const W = T.world;
  const { POOL_RADIUS, STEPS_WATER, SWIM_STROKES, SLIDE_LAND_AWAY, SLIDE_CLIMB, SLIDE_DOWN } = T.mod;
  const out = { radius: POOL_RADIUS };
  // A park whose pool has four open squares in a row to one side of its middle.
  const way = () => {
    const sl = (u.slides || [])[0]; if (!sl || !sl.pool) return null;
    const floor = T.floorSet(sl.area); const c = W.cellOf(sl.pool);
    return T.DIRS.find(([, dx, dy]) => [1, 2, 3, 4, 5].every((k) => floor.has(`${c[0] + dx * k},${c[1] + dy * k}`))) || null;
  };
  out.found = await T.regen(() => !!way());
  if (!out.found) return out;
  T.calm();
  const sl = u.slides[0]; const area = sl.area; const [name, dx, dy] = way();
  out.every = u.slides.every((s) => s.pool && W.areaAt(u.world, s.pool) === s.area && W.isFloor(u.world, ...W.cellOf(s.pool)) && Math.hypot(s.pool[0] - s.pos[0], s.pool[1] - s.pos[1]) >= Math.min(SLIDE_LAND_AWAY, 8));
  out.away = Math.hypot(sl.pool[0] - sl.pos[0], sl.pool[1] - sl.pos[1]);
  out.sounds = [...STEPS_WATER, ...SWIM_STROKES].every((n) => window.__el.audio.has(n));
  // Ride the slide: you come up in the middle of the pool.
  const floor = T.floorSet(area); const sc = W.cellOf(sl.pos);
  const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([sx, sy]) => [1, 2].every((k) => floor.has(`${sc[0] + sx * k},${sc[1] + sy * k}`))) || [1, 0];
  const toward = side[0] === 1 ? 'west' : side[0] === -1 ? 'east' : side[1] === 1 ? 'north' : 'south';
  u.area = area; g.playerPos = [sl.pos[0] + side[0] * 6, sl.pos[1] + side[1] * 6]; g._utRefreshRooms(); g._utListenerMix();
  T.go(toward);
  out.riding = u.place === 'slide';
  for (let i = 0; i < 30 * (SLIDE_CLIMB + SLIDE_DOWN + 1) && u.place === 'slide'; i++) g.updateUltimateMode(1 / 30);
  out.landedInPool = u.place === 'world' && g.playerPos[0] === sl.pool[0] && g.playerPos[1] === sl.pool[1] && u.area === area;
  out.inPool = g._utInPool(g.playerPos);
  // Walk out: three steps in the water, the fourth on the park's own floor.
  const L = T.listen();
  const stepsOf = () => L.played.filter((n) => /^(step_|ut_water_step_|ut_swim_|ut_glass_step_)/.test(n));
  for (let i = 0; i < 4; i++) T.go(name);
  out.walkOut = stepsOf().slice();
  out.outNow = !g._utInPool(g.playerPos);
  out.dist = Math.hypot(g.playerPos[0] - sl.pool[0], g.playerPos[1] - sl.pool[1]);
  out.parkSteps = area.steps;
  // One more step on dry floor, then backwards: into the water again.
  L.played.length = 0;
  T.face(name); g.input('down');
  out.backIn = stepsOf().slice(); out.backInPool = g._utInPool(g.playerPos);
  // Running in the pool is swimming: a stroke for each step, the first included.
  g.playerPos = [sl.pool[0], sl.pool[1]]; g._utListenerMix();
  L.played.length = 0;
  T.face(name);
  g.input('run_start');
  out.strideOn = !!(g.stride && g.stride.dir === 'up');
  for (let i = 0; i < 400 && g._utInPool(g.playerPos) && g.stride; i++) g._tickStride(1 / 60);
  out.swim = stepsOf().slice();
  out.swamOut = !g._utInPool(g.playerPos);
  g.input('stride_end');
  // Walking backwards while running backwards is still wading (only a run swims).
  g.playerPos = [sl.pool[0], sl.pool[1]]; g._utListenerMix();
  L.played.length = 0;
  T.face(name); g.input('back_start');
  out.backward = stepsOf().slice();
  g.input('stride_end');
  // The pool is the park's alone: the same spot in the eyes of another area is dry.
  const other = u.world.areas.find((x) => x !== area);
  const keep = u.area; u.area = other; out.otherArea = g._utInPool(sl.pool); u.area = keep;
  // And on the seabed or a ride there is no pool.
  u.place = 'seabed'; out.seabed = g._utInPool(sl.pool); u.place = 'world';
  L.stop();
  return out;
});
check(pool.found, 'a world with a water park and room round its pool was found');
if (pool.found) {
  check(pool.every && pool.away >= 15, `every slide has its pool, on the park's own floor and well away from the slide (${pool.away.toFixed(1)} units)`);
  check(pool.sounds, 'the four wading steps and the four swimming strokes are in the pack');
  check(pool.riding && pool.landedInPool && pool.inPool, 'the slide lands you in the middle of the pool');
  check(pool.walkOut.length === 4 && pool.walkOut.slice(0, 3).every((n) => /^ut_water_step_/.test(n)) && pool.parkSteps.includes(pool.walkOut[3]) && pool.outNow,
    'walking out takes three steps in the water, and the fourth is on the park\'s own floor: ' + JSON.stringify(pool.walkOut));
  check(pool.backIn.length === 1 && /^ut_water_step_/.test(pool.backIn[0]) && pool.backInPool, 'a step backwards from the edge is back in the water: ' + JSON.stringify(pool.backIn));
  check(pool.strideOn && pool.swim.length >= 3 && pool.swim.slice(0, 3).every((n) => /^ut_swim_/.test(n)) && pool.swamOut && !pool.swim.some((n) => /^ut_water_step_/.test(n)),
    'running in the pool is swimming, a stroke for each step, until you are out: ' + JSON.stringify(pool.swim));
  check(pool.backward.length === 1 && /^ut_water_step_/.test(pool.backward[0]), 'going backwards in the pool is wading, not swimming: ' + JSON.stringify(pool.backward));
  check(pool.otherArea === false && pool.seabed === false, 'the pool is only in its own park, and only on the ground');
}

// ------------------------------------------------------------------ 2. where the cases stand
const places = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__t; const W = T.world;
  const { CASE_KINDS, CASE_MAX } = T.mod;
  const out = { worlds: 0, total: 0, bad: [], kinds: {}, most: 0, none: 0 };
  for (let n = 0; n < 40; n++) {
    await T.regen(() => false, 1);
    out.worlds += 1;
    const cs = u.cases || [];
    out.total += cs.length; out.most = Math.max(out.most, cs.length); if (!cs.length) out.none += 1;
    const seen = new Set();
    for (const c of cs) {
      out.kinds[c.area.kind] = (out.kinds[c.area.kind] || 0) + 1;
      if (!CASE_KINDS.includes(c.area.kind)) out.bad.push('kind ' + c.area.kind);
      if (W.areaAt(u.world, c.pos) !== c.area || !W.isFloor(u.world, ...W.cellOf(c.pos))) out.bad.push('not on its floor');
      if (seen.has(c.area.id)) out.bad.push('two in one area'); seen.add(c.area.id);
      if (c.smashed || c.near) out.bad.push('not fresh');
      if (Math.hypot(c.pos[0] - g.playerPos[0], c.pos[1] - g.playerPos[1]) < 15) out.bad.push('on top of you');
    }
    if (cs.length > CASE_MAX) out.bad.push('too many');
    if ((u.glass || []).length) out.bad.push('glass in a new world');
    if (u.enemies.some((e) => e.hunter)) out.bad.push('a hunter in a new world');
  }
  out.max = CASE_MAX;
  return out;
});
check(places.total > 0 && places.bad.length === 0 && places.most <= places.max,
  `over ${places.worlds} worlds: ${places.total} glass cases, at most ${places.most} in a world, ${places.none} worlds with none, only in battle areas, islands and labyrinths, each on its own area's floor ${JSON.stringify(places.kinds)} ${JSON.stringify(places.bad.slice(0, 4))}`);

// ------------------------------------------------------------------ 3. the hum, the chime, the smash
const smash = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__t; const W = T.world; const a = window.__el.audio;
  const { CASE_SOUND, CASE_CHIME, CASE_SMASH, CASE_REACH, CASE_REARM, GLASS_RADIUS, STEPS_GLASS, HUNTER_QUIET, HUNTER_RISE, HUNTER_SPEED } = T.mod;
  const out = {};
  // A case in a battle area with four open squares in a row to one side of it.
  const way = () => {
    for (const c of u.cases || []) {
      if (c.area.kind !== 'battle') continue;
      const floor = T.floorSet(c.area); const cc = W.cellOf(c.pos);
      const d = T.DIRS.find(([, dx, dy]) => [1, 2, 3, 4, 5, 6].every((k) => floor.has(`${cc[0] + dx * k},${cc[1] + dy * k}`)));
      if (d) return { c, d };
    }
    return null;
  };
  out.found = await T.regen(() => !!way(), 80);
  if (!out.found) return out;
  T.calm();
  const { c, d: [name, dx, dy] } = way(); const area = c.area;
  const back = { north: 'south', south: 'north', east: 'west', west: 'east' }[name];
  out.sounds = [CASE_SOUND, CASE_CHIME, CASE_SMASH, ...STEPS_GLASS].every((n) => a.has(n));
  // Six squares off: its hum is heard, placed where it stands, and looping.
  u.area = area; u.compass.on = false;
  g.playerPos = [c.pos[0] + dx * 18, c.pos[1] + dy * 18]; g._utRefreshRooms(); g._utListenerMix();
  for (let i = 0; i < 20; i++) g.updateUltimateMode(1 / 30);
  await new Promise((r) => setTimeout(r, 300));
  g.updateUltimateMode(1 / 30);
  out.hum = c.voice ? { name: c.voice.name, placed: !!c.voice.placed, level: c.voice.l, loops: c.voice.loops } : null;
  // The compass's nearby list names it.
  out.nearby = g._utCompassNearby().join('; ');
  // Its ping (web 4.1.1): from where it stands, highest when you face it, lower
  // off to the side and lowest behind you; faster the closer you are; not from
  // beyond its range.
  {
    const { CASE_PING_RANGE, casePingName } = T.mod;
    const pings = []; const op = a.play.bind(a);
    a.play = (n, o) => { if (/^ut_case_ping_\d$/.test(n)) pings.push([n, o && o.pos ? o.pos.map((x) => +x.toFixed(2)) : null]); return op(n, o); };
    const listen = (seconds) => { pings.length = 0; for (let i = 0; i < 30 * seconds; i++) g.updateUltimateMode(1 / 30); return pings.map((x) => x[0]); };
    const toCase = Math.atan2(-dx, dy);          // the way to the case from where we stand (it lies the other way from the open squares)
    const at = (deg) => { g._utTurnStop(); g._utFace(toCase + deg * Math.PI / 180, true); return listen(2); };
    const ahead = at(0);
    out.ping = { ahead, placed: pings[0] ? pings[0][1] : null, want: [-dx * 18, -dy * 18].map((x) => +x.toFixed(2)), has: [0, 8].every((k) => a.has(casePingName(k))) && a.has('ut_case_ping_demo') };
    out.ping.byAngle = [0, 7, 15, 30, -30, 45, 90, -90, 120, 180].map((deg) => [deg, [...new Set(at(deg))].join(',')]);
    out.ping.count18 = at(0).length;
    g.playerPos = [c.pos[0] + dx * 6, c.pos[1] + dy * 6]; g._utListenerMix();
    out.ping.count6 = at(0).length;
    // Beyond its range, and from the next area, nothing.
    g.playerPos = [c.pos[0] + dx * 18, c.pos[1] + dy * 18]; g._utListenerMix();
    const keepPos = [c.pos[0], c.pos[1]];
    c.pos = [g.playerPos[0] - dx * (CASE_PING_RANGE + 1), g.playerPos[1] - dy * (CASE_PING_RANGE + 1)];
    out.ping.beyond = at(0).length;
    c.pos = keepPos;
    const here = u.area; u.area = u.world.areas.find((x) => x !== area); out.ping.otherArea = listen(2).length; u.area = here;
    // With the compass on it carries on (the hum does too).
    a.play = op;
    g._utTurnStop(); g._utFace({ north: 0, east: 1, south: 2, west: 3 }[back] * Math.PI / 2, true);
    g.playerPos = [c.pos[0] + dx * 18, c.pos[1] + dy * 18]; g._utListenerMix();
    for (let i = 0; i < 5; i++) g.updateUltimateMode(1 / 30);
  }
  // Out of reach, the attack is the laser, as ever.
  const L = T.listen();
  u.ammo = 5;
  g.input('space');
  out.farShot = { ammo: u.ammo, laser: L.played.includes('laser'), smashed: c.smashed };
  // Walk up to it: the chime, once, as you come within a step of it.
  L.played.length = 0;
  let chimes = () => L.played.filter((n) => n === CASE_CHIME).length;
  const seenAt = [];
  for (let i = 0; i < 5; i++) { T.go(back); seenAt.push([Math.round(Math.hypot(g.playerPos[0] - c.pos[0], g.playerPos[1] - c.pos[1])), chimes()]); }
  out.approach = seenAt;
  for (let i = 0; i < 30; i++) g.updateUltimateMode(1 / 30);
  out.chimedOnce = chimes() === 1;
  out.reach = Math.hypot(g.playerPos[0] - c.pos[0], g.playerPos[1] - c.pos[1]);
  // Away and back: it chimes again.
  for (let i = 0; i < 4; i++) T.go(name);
  for (let i = 0; i < 4; i++) T.go(back);
  out.chimedAgain = chimes() === 2;
  out.rearm = [CASE_REACH, CASE_REARM];
  // Smash it: no shot spent, no laser; the smash where it stood; its hum gone;
  // the reward spoken and nothing about who is coming.
  L.played.length = 0; L.spoken.length = 0;
  u.ammo = 5; u.hp = 60; u.items = 0;
  const before = { ammo: u.ammo, hp: u.hp, items: u.items, points: u.points, time: u.worldTime };
  g.input('space');
  const after = { ammo: u.ammo, hp: u.hp, items: u.items, points: u.points, time: u.worldTime };
  out.smashed = c.smashed; out.played = L.played.slice(); out.spoken = L.spoken.slice();
  out.humGone = !c.voice;
  out.last = u.lastCase;
  const hunters = u.enemies.filter((e) => e.hunter);
  out.hunters = hunters.length;
  out.hunterDist = hunters.map((e) => Math.round(Math.hypot(e.x - g.playerPos[0], e.y - g.playerPos[1])));
  out.hunterArea = hunters.every((e) => e.area === area && W.areaAt(u.world, [e.x, e.y]) === area);
  out.hunterSpeed = hunters.map((e) => e.speed);
  out.speedRange = HUNTER_SPEED;
  out.delta = { ammo: after.ammo - before.ammo, hp: after.hp - before.hp, items: after.items - before.items, points: after.points - before.points, time: Math.round(after.time - before.time) };
  // A second attack there is the laser again (nothing left to smash).
  L.played.length = 0; const ammoWas = u.ammo;
  g.input('space');
  out.second = { laser: L.played.includes('laser') || L.played.includes('empty_click'), smashAgain: L.played.includes(CASE_SMASH), spent: ammoWas - u.ammo };
  // They are not heard at once: silent for HUNTER_QUIET, then rising.
  u.enemies = u.enemies.filter((e) => e.hunter);   // (whatever the second shot left)
  const hs = u.enemies.slice();
  u.safe = 999;                                   // (they may reach us in this check; they must not end it)
  g.updateUltimateMode(1 / 30);
  out.quietAtFirst = hs.every((e) => !e.voice || e.voice.l <= 0.001);
  const d0 = hs.map((e) => Math.hypot(e.x - g.playerPos[0], e.y - g.playerPos[1]));
  for (let i = 0; i < 30; i++) g.updateUltimateMode(1 / 30);
  const d1 = hs.map((e) => Math.hypot(e.x - g.playerPos[0], e.y - g.playerPos[1]));
  out.closing = hs.map((e, i) => +(d0[i] - d1[i]).toFixed(2));
  for (let i = 0; i < Math.ceil(30 * (HUNTER_QUIET + HUNTER_RISE)); i++) g.updateUltimateMode(1 / 30);
  out.heardLater = hs.filter((e) => u.enemies.includes(e)).some((e) => e.voice && e.voice.l > 0.05);
  out.stillThere = hs.filter((e) => u.enemies.includes(e)).length;
  // (Through those four seconds beside it, the smashed case never pinged.)
  out.pingAfter = L.played.filter((n) => /^ut_case_ping_/.test(n)).length;
  // The glass on the floor: it crunches within two steps of where the case stood.
  L.played.length = 0;
  const stepsOf = () => L.played.filter((n) => /^(step_|ut_glass_step_|ut_water_step_)/.test(n));
  g.playerPos = [c.pos[0] + dx * 3, c.pos[1] + dy * 3]; g._utListenerMix();
  T.go(back);                    // onto where the case stood
  T.go(name); T.go(name);        // one and two steps from it
  T.go(name);                    // three steps: clear of it
  out.glassSteps = stepsOf().slice(); out.areaSteps = area.steps;
  out.glass = (u.glass || []).length; out.glassRadius = GLASS_RADIUS;
  // The compass no longer names it.
  out.nearbyAfter = g._utCompassNearby().join('; ');
  // Leave the area: the hunters give up and are gone, and none comes in their place.
  u.respawn.clear();
  const others = u.world.areas.filter((x) => x !== area);
  const next = others[0];
  u.area = next; g.playerPos = [next.centre[0], next.centre[1]];
  g._utRefreshRooms(); g._utListenerMix();
  for (let i = 0; i < 10; i++) g.updateUltimateMode(1 / 30);
  out.goneWhenYouLeave = !u.enemies.some((e) => e.hunter);
  out.noRespawn = (u.respawn.get(area.id) || []).length === 0;
  // A new world: no glass, no smashed cases, no hunters.
  u.safe = 0;
  await T.regen(() => false, 1);
  out.fresh = (u.glass || []).length === 0 && (u.cases || []).every((x) => !x.smashed) && !u.enemies.some((e) => e.hunter);
  L.stop();
  return out;
});
check(smash.found, 'a world with a glass case in a battle area was found');
if (smash.found) {
  check(smash.sounds, 'the hum, the chime, the smash and the four glass steps are loaded');
  check(smash.hum && smash.hum.name === 'evt_crystal_hum' && smash.hum.placed && smash.hum.level > 0.3, 'a case hums where it stands (the crystal hum, placed): ' + JSON.stringify(smash.hum));
  check(/a glass case/.test(smash.nearby), 'the compass names it among the things nearby: ' + smash.nearby);
  const pg = smash.ping; const stepOf = Object.fromEntries(pg.byAngle);
  check(pg.has && pg.ahead.length >= 2 && pg.ahead.every((n) => n === 'ut_case_ping_8') && pg.placed && Math.abs(pg.placed[0] - pg.want[0]) < 0.01 && Math.abs(pg.placed[1] - pg.want[1]) < 0.01,
    `a case pings from where it stands, at its highest pitch when you face it (${pg.ahead.length} pings in two seconds from six squares off)`);
  check(stepOf[0] === 'ut_case_ping_8' && stepOf[7] === 'ut_case_ping_8' && stepOf[15] === 'ut_case_ping_7' && stepOf[30] === 'ut_case_ping_6' && stepOf[-30] === 'ut_case_ping_6'
    && stepOf[45] === 'ut_case_ping_5' && stepOf[90] === 'ut_case_ping_2' && stepOf[-90] === 'ut_case_ping_2' && stepOf[120] === 'ut_case_ping_0' && stepOf[180] === 'ut_case_ping_0',
    'the ping drops a step for every 15 degrees the case is off to either side, to its lowest behind you: ' + JSON.stringify(pg.byAngle));
  check(pg.count6 > pg.count18 && pg.count18 >= 2, `it repeats faster as you close: ${pg.count18} in two seconds from six squares, ${pg.count6} from two`);
  check(pg.beyond === 0 && pg.otherArea === 0, 'no ping from beyond twelve steps, nor from another area');
  check(smash.farShot.laser && smash.farShot.ammo === 4 && !smash.farShot.smashed, 'out of reach of it, the attack is the laser as ever');
  check(smash.chimedOnce && smash.approach.every(([d, n]) => (d < smash.rearm[0]) === (n === 1)) && smash.reach < smash.rearm[0],
    'the chime rings once, as you come within a step of it: ' + JSON.stringify(smash.approach));
  check(smash.chimedAgain, 'go away and come back, and it chimes again');
  check(smash.smashed && smash.played.includes('ut_glass_smash') && !smash.played.includes('laser') && smash.humGone,
    'within reach, the attack smashes it: the smash is heard, no laser, and its hum stops: ' + JSON.stringify(smash.played));
  check(smash.spoken.length === 1 && /^Glass case: .+\.$/.test(smash.spoken[0]) && !/enem|chaser|hunter|coming|\b[2-5] (are|more)/i.test(smash.spoken[0]),
    'the voice says what was in it, and nothing of who is coming: ' + JSON.stringify(smash.spoken));
  const k = smash.last && smash.last.kind; const dl = smash.delta;
  const rewardOk = (k === 'shots' && dl.ammo > smash.hunters && dl.ammo <= smash.hunters + 3 && new RegExp(`^Glass case: ${dl.ammo} shots\\.$`).test(smash.spoken[0]))
    || (k === 'points' && dl.points > 0 && dl.ammo === 0 && new RegExp(`^Glass case: ${dl.points} points\\.$`).test(smash.spoken[0]))
    || (k === 'time' && dl.time === 30 && dl.ammo === 0 && /30 more seconds in this world/.test(smash.spoken[0]))
    || (k === 'items' && dl.items >= 2 && dl.items <= 3 && dl.ammo === 0 && new RegExp(`${dl.items} tower items`).test(smash.spoken[0]))
    || (k === 'health' && dl.hp === 30 && dl.ammo === 0 && /30 health/.test(smash.spoken[0]));
  check(rewardOk, `the reward (${k}) is yours at once, as spoken, and smashing spent no shot: ${JSON.stringify(dl)}`);
  check(smash.hunters >= 2 && smash.hunters <= 5 && smash.hunterArea && smash.hunterDist.every((d) => d >= 14),
    `${smash.hunters} chasers came, in the case's own area, from far off (${smash.hunterDist.join(', ')} units)`);
  check(smash.hunterSpeed.every((s) => s >= smash.speedRange[0] && s <= smash.speedRange[1]) && smash.closing.every((x) => x > 5),
    `they come fast: ${smash.closing.join(', ')} units nearer in a second`);
  check(smash.quietAtFirst && (smash.heardLater || smash.stillThere === 0), 'they are not heard at once, and are heard a few seconds on');
  check(smash.second.laser && !smash.second.smashAgain, 'a smashed case cannot be smashed again');
  check(smash.pingAfter === 0, 'a smashed case no longer pings');
  check(smash.glass === 1 && smash.glassSteps.length === 4 && smash.glassSteps.slice(0, 3).every((n) => /^ut_glass_step_/.test(n)) && smash.areaSteps.includes(smash.glassSteps[3]),
    'broken glass crunches underfoot for two steps round where the case stood, and not beyond: ' + JSON.stringify(smash.glassSteps));
  check(!/a glass case/.test(smash.nearbyAfter), 'the compass no longer names a smashed case');
  check(smash.goneWhenYouLeave && smash.noRespawn, 'leave the area and the chasers that came for the glass are gone, and none comes in their place');
  check(smash.fresh, 'a new world has no broken glass and no such chasers');
}

// ------------------------------------------------------------------ 4. the rewards, many times over
const many = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__t;
  const { CASE_HUNTERS, CASE_POINTS, CASE_TIME, CASE_HEALTH, CASE_ITEMS, CASE_SHOTS_OVER, START_HP } = T.mod;
  const out = { n: 0, kinds: {}, counts: {}, bad: [], words: new Set() };
  await T.regen(() => (u.cases || []).length > 0, 60);
  const c0 = (u.cases || [])[0];
  if (!c0) return { skipped: true };
  const area = c0.area;
  const L = T.listen();
  u.area = area; g.playerPos = [c0.pos[0], c0.pos[1]]; g._utRefreshRooms(); g._utListenerMix();
  for (let i = 0; i < 600; i++) {
    T.calm(); u.glass = [];
    const c = { area, pos: [c0.pos[0], c0.pos[1]], voice: null, near: true, smashed: false };
    u.cases = [c];
    const full = i % 3 === 0; const compass = i % 5 === 0;
    u.hp = full ? START_HP : 40 + (i % 50); u.compass.on = compass; u.ammo = 3; u.items = 1;
    const b = { ammo: u.ammo, hp: u.hp, items: u.items, points: u.points, wp: u.worldPoints, time: u.worldTime };
    L.spoken.length = 0;
    g._utAttack();
    const came = u.enemies.filter((e) => e.hunter).length;
    const k = u.lastCase.kind; const said = L.spoken[L.spoken.length - 1] || '';
    out.n += 1; out.kinds[k] = (out.kinds[k] || 0) + 1; out.counts[came] = (out.counts[came] || 0) + 1;
    out.words.add(said.replace(/\d+/g, 'N'));
    const d = { ammo: u.ammo - b.ammo, hp: u.hp - b.hp, items: u.items - b.items, points: u.points - b.points, time: u.worldTime - b.time };
    const only = (key) => Object.keys(d).every((x) => x === key || Math.abs(d[x]) < 1e-6);
    if (came !== u.lastCase.came) out.bad.push('count');
    if (came < 2 || came > 5) out.bad.push('came ' + came);
    if (k === 'shots' && !(only('ammo') && d.ammo >= came + CASE_SHOTS_OVER[0] && d.ammo <= came + CASE_SHOTS_OVER[1] && said === `Glass case: ${d.ammo} shots.`)) out.bad.push('shots ' + JSON.stringify(d) + said);
    if (k === 'points' && !(only('points') && !compass && d.points === Math.round(CASE_POINTS * g._utMultiplier()) && u.worldPoints - b.wp === CASE_POINTS && said === `Glass case: ${d.points} points.`)) out.bad.push('points ' + JSON.stringify(d) + said);
    if (k === 'time' && !(only('time') && Math.abs(d.time - CASE_TIME) < 1e-6 && said === `Glass case: ${CASE_TIME} more seconds in this world.`)) out.bad.push('time ' + JSON.stringify(d) + said);
    if (k === 'items' && !(only('items') && d.items >= CASE_ITEMS[0] && d.items <= CASE_ITEMS[1] && said === `Glass case: ${d.items} tower items.`)) out.bad.push('items ' + JSON.stringify(d) + said);
    if (k === 'health' && !(only('hp') && !full && d.hp === Math.min(CASE_HEALTH, START_HP - b.hp) && u.hp <= START_HP && said === `Glass case: ${d.hp} health.`)) out.bad.push('health ' + JSON.stringify(d) + said);
    if (/\b(enem|chaser|hunter)/i.test(said)) out.bad.push('said who comes');
  }
  u.compass.on = false;
  L.stop();
  out.words = [...out.words]; out.shares = CASE_HUNTERS;
  // Away from here before the next section: a clean world.
  T.calm(); u.cases = []; u.glass = [];
  return out;
});
check(!many.skipped, 'a world with a glass case was found for the rewards');
if (!many.skipped) {
  check(many.bad.length === 0, `${many.n} cases smashed: every reward is what the voice says, is given at once, and shots are always more than the chasers that came ${JSON.stringify(many.kinds)} ${JSON.stringify(many.bad.slice(0, 3))}`);
  check(['points', 'shots', 'time', 'items', 'health'].every((k) => many.kinds[k] > 20), 'all five rewards turn up: points, shots, time, tower items and health');
  const c = many.counts; const n = many.n;
  check(Object.keys(c).every((x) => x >= 2 && x <= 5) && (c[2] + c[3]) / n > 0.62 && (c[2] + c[3]) / n < 0.88 && c[5] / n > 0.04 && c[5] / n < 0.17 && c[4] > 0,
    `two to five chasers come, mostly two or three, five only now and then: ${JSON.stringify(c)}`);
  check(many.words.every((w) => /^Glass case: N (shots|points|more seconds in this world|tower items|health)\.$/.test(w)), 'the spoken rewards: ' + JSON.stringify(many.words));
}

// ------------------------------------------------------------------ 5. the chasers, and a labyrinth
const hunt = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__t; const W = T.world;
  const out = {};
  out.found = await T.regen(() => u.world.areas.some((x) => x.kind === 'labyrinth') && u.world.areas.some((x) => x.kind === 'battle'), 60);
  if (!out.found) return out;
  // In a labyrinth they keep to the corridors.
  const lab = u.world.areas.find((x) => x.kind === 'labyrinth');
  T.calm(); u.cases = []; u.glass = [];
  const cells = lab.floorCells; const mid = cells[Math.floor(cells.length / 2)];
  u.area = lab; g.playerPos = W.posOf(mid[0], mid[1]); g._utRefreshRooms(); g._utListenerMix();
  const c = { area: lab, pos: [g.playerPos[0], g.playerPos[1]], voice: null, near: true, smashed: false };
  u.cases = [c]; u.safe = 999; u.ammo = 0; u.hp = 100;
  g._utAttack();
  const hs = u.enemies.filter((e) => e.hunter);
  out.came = hs.length;
  out.start = hs.map((e) => Math.round(Math.hypot(e.x - g.playerPos[0], e.y - g.playerPos[1])));
  let off = 0; let frames = 0; let nearest = Infinity;
  for (let i = 0; i < 30 * 40; i++) {
    g.updateUltimateMode(1 / 30); frames += 1;
    for (const e of hs) {
      if (!u.enemies.includes(e)) continue;
      if (!W.isFloor(u.world, ...W.cellOf([e.x, e.y]))) off += 1;
      nearest = Math.min(nearest, Math.hypot(e.x - g.playerPos[0], e.y - g.playerPos[1]));
    }
    if (nearest < 2) break;
  }
  out.offFloor = off; out.reached = nearest < 2; out.nearest = +nearest.toFixed(1); out.seconds = +(frames / 30).toFixed(1);
  // Shoot one that came for the glass: it is dead, pays as any chaser, and none comes in its place.
  const battle = u.world.areas.find((x) => x.kind === 'battle');
  T.calm(); u.cases = []; u.glass = [];
  u.area = battle; g.playerPos = [battle.centre[0], battle.centre[1]]; g._utRefreshRooms(); g._utListenerMix();
  u.cases = [{ area: battle, pos: [g.playerPos[0], g.playerPos[1]], voice: null, near: true, smashed: false }];
  u.safe = 999; u.compass.on = false;
  g._utAttack();
  const hb = u.enemies.filter((e) => e.hunter);
  out.cameB = hb.length;
  // Put one six units due north and face it.
  const e = hb[0]; e.x = g.playerPos[0]; e.y = g.playerPos[1] - 6;
  for (const o of hb.slice(1)) { o.x = g.playerPos[0]; o.y = g.playerPos[1] + 40; }
  T.face('north'); u.ammo = 5; const p0 = u.points; const k0 = u.kills;
  g.input('space');
  out.killed = !u.enemies.includes(e); out.paid = u.points > p0; out.kills = u.kills - k0;
  out.respawn = (u.respawn.get(battle.id) || []).length;
  out.left = u.enemies.filter((x) => x.hunter).length;
  // One that reaches you hurts as any chaser does.
  u.safe = 0; u.hitCooldown = 0; u.hp = 100;
  const o = u.enemies.find((x) => x.hunter);
  if (o) { o.x = g.playerPos[0] + 0.5; o.y = g.playerPos[1]; g.updateUltimateMode(1 / 30); }
  out.hurt = o ? 100 - u.hp : null;
  out.stillPlaying = g.state === 'ultimate';
  // On a bus, a slide or the lift you are out of the area too: they are gone.
  u.place = 'bus'; g._utUpdateEnemies(1 / 30); out.goneOnBus = !u.enemies.some((x) => x.hunter); u.place = 'world';
  return out;
});
check(hunt.found, 'a world with a labyrinth and a battle area was found');
if (hunt.found) {
  check(hunt.came >= 2 && hunt.offFloor === 0 && hunt.reached, `in a labyrinth the ${hunt.came} chasers keep to the corridors (never in a wall) and reach you (from ${hunt.start.join(', ')} units, in ${hunt.seconds} seconds)`);
  check(hunt.killed && hunt.paid && hunt.kills === 1 && hunt.respawn === 0 && hunt.left === hunt.cameB - 1, 'one you shoot is dead and pays as any chaser, and none comes in its place');
  check(hunt.hurt > 0 && hunt.stillPlaying, `one that reaches you hurts as any chaser (${hunt.hurt} health)`);
  check(hunt.goneOnBus, 'on a bus you are out of their area, and they are gone');
}

check(errors.length === 0, 'no page errors: ' + errors.slice(0, 3).join(' | '));
await browser.close();
if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nAll glass and pool checks passed.');
