// Web 6.3.0 (Russell, 20 November 2026), played by script in a real browser engine.
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/web63.mjs http://localhost:8790
// What is checked:
// - Chaos worlds: a chaser shot down puts 20 seconds on the chaos clock, a thrower
//   30, ammo or a potion picked up 10, a chest's points 30; nothing in a safe zone;
//   and nothing in Ultimate Mode itself, which has no chaos clock.
// - Footsteps in the open air: a safe zone's ground follows its sound (grass, snow,
//   mud, sand; stone everywhere else), and the grass steps are loaded.
// - The sound engine: a finished sound lets go of every panner it had, so none pile
//   up; a level too little different to hear is not sent again, a small change
//   waits a thirtieth of a second, and a big one goes at once.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8790';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
// Panners made and let go, counted from the start (before the game makes any).
await page.addInitScript(() => {
  const open = window.__panners = new Set();
  const C = BaseAudioContext.prototype; const make = C.createPanner;
  C.createPanner = function () { const n = make.call(this); open.add(n); return n; };
  const cut = AudioNode.prototype.disconnect;
  AudioNode.prototype.disconnect = function (...x) { if (!x.length) open.delete(this); return cut.apply(this, x); };
  const sent = window.__sent = { n: 0 };
  const P = AudioParam.prototype;
  for (const k of ['setValueAtTime', 'setTargetAtTime', 'linearRampToValueAtTime']) {
    const o = P[k]; P[k] = function (...x) { sent.n += 1; return o.apply(this, x); };
  }
});
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 90000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
await page.evaluate(() => {
  const g = window.__el.game;
  const t = window.__t = { said: [] };
  const speak = g.tts.speak.bind(g.tts);
  g.tts.speak = (text, o) => { if (text) t.said.push(text); return speak(text, o); };
  t.menu = () => { if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); } };
  t.chaosWorld = () => {
    t.menu();
    g._chaosPickNext = () => 'ultimate';
    g.menuIndex = g.menuKeys.indexOf('chaos'); g.input('enter'); g.frame(1 / 30);
  };
  t.ultimate = () => { t.menu(); g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter'); g.frame(1 / 30); };
  // Stand in an area of the given kind (out of any safe zone, or in one).
  t.standIn = (kind) => {
    const u = g.ut; const a = u.world.areas.find((x) => x.kind === kind);
    if (!a) return null;
    u.area = a; u.compass.on = false;
    g.playerPos = [...(a.centre || [a.x0 + 2, a.y0 + 2])];
    return a;
  };
  t.enemy = (kind, area) => {
    const u = g.ut;
    let e = u.enemies.find((x) => x.kind === kind);
    if (!e) {
      e = { kind, x: g.playerPos[0] + 30, y: g.playerPos[1], area, voice: null, registerPlayerPickup() {} };
      u.enemies.push(e);
    }
    return e;
  };
});

// ------------------------------------------------------------------ 1. Chaos world time
const time = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const out = {};
  t.chaosWorld();
  out.state = g.state; out.chaos = !!(g.ut && g.ut.chaos);
  if (!g.ut) return out;
  const u = g.ut;
  const area = t.standIn('battle') || t.standIn('labyrinth') || t.standIn('island');
  const gain = (fn) => { const t0 = g.timeLeft; fn(); return Math.round(g.timeLeft - t0); };
  out.chaser = gain(() => g._utKillEnemy(t.enemy('chaser', area)));
  out.thrower = gain(() => g._utKillEnemy(t.enemy('thrower', area)));
  const pick = (kind) => { const p = { kind, shots: 3, voice: null, area, pos: [...g.playerPos] }; u.pickups.push(p); return gain(() => g._utTakePickup(p)); };
  out.ammo = pick('ammo');
  out.potion = pick('potion');
  // A chest pays points only some of the time; each one that does, 30 seconds with them.
  out.chests = [];
  for (let i = 0; i < 25 && out.chests.length < 3; i++) {
    t.said.length = 0;
    const p0 = g.chaosPoints; const d = gain(() => g._utOpenChest());
    if (g.chaosPoints > p0) out.chests.push(d);
  }
  // In a safe zone nothing scores, so nothing goes on the clock.
  const zone = t.standIn('event');
  out.safe = zone ? gain(() => g._utKillEnemy(t.enemy('chaser', zone))) : null;
  // With the compass on, the same.
  t.standIn('battle'); u.compass.on = true;
  out.compass = gain(() => g._utKillEnemy(t.enemy('chaser', area)));
  u.compass.on = false;
  // Ultimate Mode itself has no chaos clock: nothing changes.
  t.ultimate();
  if (g.ut && !g.ut.chaos) {
    const a2 = t.standIn('battle') || t.standIn('labyrinth');
    const t0 = g.timeLeft; g._utKillEnemy(t.enemy('chaser', a2));
    out.ultimate = g.timeLeft === t0;
  }
  t.menu();
  return out;
});
check(time.state === 'ultimate' && time.chaos, 'a chaos world stage to test with: ' + JSON.stringify(time));
check(time.chaser === 20, `a chaser shot down in a chaos world puts 20 seconds on the chaos clock: ${time.chaser}`);
check(time.thrower === 30, `a thrower, 30 seconds: ${time.thrower}`);
check(time.ammo === 10 && time.potion === 10, `ammo or a potion picked up, 10 seconds: ${time.ammo}, ${time.potion}`);
check(time.chests.length > 0 && time.chests.every((d) => d >= 30), `a chest's points, 30 seconds with them: ${JSON.stringify(time.chests)}`);
check(time.safe === 0, `in a safe zone nothing scores, and nothing goes on the clock: ${time.safe}`);
check(time.compass === 0, `nor with the compass on: ${time.compass}`);
check(time.ultimate === true, 'Ultimate Mode itself has no chaos clock to add to');

// ------------------------------------------------------------------ 2. Footsteps in the open air
const steps = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  const ult = await import('./js/modes/ultimate.js');
  const map = ult.SAFE_ZONE_STEPS;
  const out = { grass: ['step_grass_1', 'step_grass_2', 'step_grass_3'].every((n) => window.__el.audio.has(n)), zones: [], wrong: [] };
  t.ultimate();
  for (let k = 0; k < 12 && g.ut; k++) {
    for (const a of g.ut.world.areas) {
      if (a.kind === 'event') {
        const want = (map[a.stem] || []).filter((n) => window.__el.audio.has(n));
        const expect = want.length ? want : ['step_stone_1', 'step_stone_2', 'step_stone_3', 'step_stone_4'];
        out.zones.push(a.stem);
        if (JSON.stringify(a.steps) !== JSON.stringify(expect)) out.wrong.push([a.stem, a.steps]);
        // Walking there plays one of them.
        g.ut.area = a;
        if (!g._utInPool(g.playerPos) && !g._utOnGlass(g.playerPos) && !expect.includes(g._utStepSound(a))) out.wrong.push([a.stem, 'played']);
      } else {
        const expect = a.kind === 'island' ? 'step_sand' : 'step_stone';
        if (!a.steps.every((n) => n.startsWith(expect))) out.wrong.push([a.kind, a.steps]);
      }
    }
    g._utNewWorld();
  }
  out.surfaces = {
    crickets: map.evt_amb_crickets, forest: map.evt_amb_forest_night, blizzard: map.evt_amb_blizzard,
    marsh: map.evt_amb_marsh_frogs, desert: map.evt_amb_desert, market: map.evt_amb_market || null, cathedral: map.evt_amb_cathedral || null,
  };
  t.menu();
  return out;
});
check(steps.grass, 'the three grass steps are loaded (the outdoor pack)');
check(steps.zones.length >= 6 && !steps.wrong.length, `every safe zone is walked on its own ground, every other area on stone or an island's sand (${steps.zones.length} zones): ${JSON.stringify(steps.wrong)}`);
check(/grass/.test(steps.surfaces.crickets) && /grass/.test(steps.surfaces.forest) && /snow/.test(steps.surfaces.blizzard)
  && /mud/.test(steps.surfaces.marsh) && /sand/.test(steps.surfaces.desert) && !steps.surfaces.market && !steps.surfaces.cathedral,
  'crickets and a forest are grass, a blizzard snow, a marsh mud, a desert sand; a market and a cathedral stone: ' + JSON.stringify(steps.surfaces));

// ------------------------------------------------------------------ 3. The sound engine
const before = await page.evaluate(() => window.__panners.size);
await page.evaluate(() => {
  const a = window.__el.audio;
  for (let i = 0; i < 30; i++) a.play('step_stone_' + (1 + (i % 4)), { at: [2 + (i % 5), -3 + (i % 7)] });
});
const during = await page.evaluate(() => window.__panners.size);
await page.waitForTimeout(6000);
const after = await page.evaluate(() => window.__panners.size);
check(during > before && after <= before, `thirty placed sounds make their panners, and let go of every one when they are done: ${before} before, ${during} while playing, ${after} after`);

const levels = await page.evaluate(async () => {
  const a = window.__el.audio; const s = window.__sent; const out = {};
  const v = a.play('ammo_beacon', { loop: true, volume: 0.5 });
  await new Promise((r) => setTimeout(r, 300));
  const n = () => s.n;
  let k = n(); v.setVolume(0.5); out.same = n() - k;
  k = n(); v.setVolume(0.501); out.tiny = n() - k;
  await new Promise((r) => setTimeout(r, 100));
  k = n(); v.setVolume(0.52); out.small = n() - k;
  k = n(); v.setVolume(0.53); out.soon = n() - k;
  k = n(); v.setVolume(0.9); out.big = n() - k;
  await new Promise((r) => setTimeout(r, 100));
  k = n(); v.setVolume(0.91); out.later = n() - k;
  v.stop();
  return out;
});
check(levels.same === 0 && levels.tiny === 0, `a level the same, or too little different to hear, is not sent again: ${JSON.stringify(levels)}`);
check(levels.small > 0 && levels.soon === 0, 'a small change is sent, and another within a thirtieth of a second waits');
check(levels.big > 0 && levels.later > 0, 'a big change goes at once, and a small one later is sent again');

check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
