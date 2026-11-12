// The Tower rebalance (web 5.1.0, retuned in 5.1.1: Russell, 12 November 2026), for Tower Mode and
// Chaos's tower floors, and that Ultimate Mode's tower-area rivals are untouched.
//   node tests/tower-rebalance.mjs http://localhost:8771
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8771';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + '/play.html?desktop=1');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 90000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');

const r = await page.evaluate(async () => {
  const g = window.__el.game;
  const T = await import('./js/modes/tower.js');
  const out = {};
  g.startTower();
  g.towerHeight = 5; g.towerFloor = 1; g.towerNumber = 1; g._setupTowerFloor();
  const tune = () => { const e = g.towerEnemy; return { race: +(e.speed * e.lunge).toFixed(3), throwSpeed: +e.throwSpeed.toFixed(3), every: +e.throwCd.toFixed(3), windup: +e.windupLen.toFixed(3), notice: +e.notice.toFixed(2), guard: e.guard }; };
  out.t1 = tune();
  g.towerNumber = 2; g.towerFloor = 1; g._setupTowerFloor(); out.t2 = tune();
  g.towerNumber = 11; g.towerFloor = 1; g._setupTowerFloor(); out.t11 = tune();
  g.towerNumber = 21; g.towerFloor = 1; g._setupTowerFloor(); out.t21 = tune();
  // Within a tower it rises floor by floor.
  g.towerNumber = 1; g.towerHeight = 5; g.towerFloor = 3; g._setupTowerFloor(); out.t1f3 = tune();
  g.towerFloor = 1; g._setupTowerFloor();
  // Each pickup: 3% faster, up to five times.
  const e = g.towerEnemy; const s0 = e.speed; const c0 = e.throwCd;
  for (let i = 0; i < 9; i++) e.registerPlayerPickup();
  out.boost = { speed: +(e.speed / s0).toFixed(4), every: +(c0 / e.throwCd).toFixed(4), times: e.alert };
  // New items: 12 to 30 units from you, 12 or more from the rival, with a head start.
  const dists = [];
  for (let i = 0; i < 60; i++) {
    g.playerPos = [0, 0]; g.towerEnemy.notice = 0;
    g._towerSpawnItem();
    const it = g.towerItem;
    dists.push([Math.hypot(it.x, it.y), Math.hypot(it.x - g.towerEnemy.x, it.y - g.towerEnemy.y), g.towerEnemy.notice]);
  }
  out.items = { near: Math.min(...dists.map((d) => d[0])), far: Math.max(...dists.map((d) => d[0])), rival: Math.min(...dists.map((d) => d[1])), notice: Math.min(...dists.map((d) => d[2])) };
  // No guard (5.1.1): the rival still races you for an item only a step or two from you.
  {
    const en = g.towerEnemy;
    en.notice = 0; en.recover = 0; en.winding = 0; en.pending = 0; en.items = 0;
    g.playerPos = [0, 0]; g.towerItem.x = 4; g.towerItem.y = 0; en.x = 7; en.y = 0;
    const before = g.towerItem;
    for (let i = 0; i < 60; i++) g.updateTowerMode(1 / 60);
    out.close = { taken: g.towerItem !== before, rivalItems: en.items, guard: en.guard };
  }
  g._toMenu();
  // Ultimate Mode's rival, made straight from the class as Ultimate makes it: as before.
  const u = new T.TowerEnemy([0, 0], 5, 0, 31.5, 1, 0);
  const us = u.speed; const uc = u.throwCd;
  for (let i = 0; i < 9; i++) u.registerPlayerPickup();
  out.ultimate = { lunge: u.lunge, guard: u.guard, boost: u.boost, windup: u.windupLen, throwSpeed: u.throwSpeed,
    speedUp: +(u.speed / us).toFixed(4), expect: +Math.min(8.8 / us, Math.pow(1.09, 8)).toFixed(4), every: +(uc / u.throwCd).toFixed(4), guarded: u.guarded([0, 0], [1, 0]) };
  return out;
});

const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;
check(near(r.t1.race, 7.5) && near(r.t1.throwSpeed, 5.0) && near(r.t1.every, 7.0) && near(r.t1.windup, 1.5) && !r.t1.guard && near(r.t1.notice, 1.5), `tower one: race just over a walk (7.5), throws at 5 units a second every 7 seconds, wind-up 1.5 s, no guard, 1.5 s head start: ${JSON.stringify(r.t1)}`);
check(near(r.t2.race, 7.875) && near(r.t2.throwSpeed, 5.4) && near(r.t2.every, 6.44) && near(r.t2.windup, 1.4) && near(r.t2.notice, 1.3), `tower two: 5% faster race, 0.2 s less head start, 8% faster and more often throws, wind-up 0.1 s shorter: ${JSON.stringify(r.t2)}`);
check(r.t11.windup === 0.85 && r.t21.windup === 0.85 && r.t11.race < 14 && r.t21.race > 14 && r.t21.race > r.t11.race, `no level-off: under a run at tower 11 (${r.t11.race}), faster than a run by tower 21 (${r.t21.race}), and the wind-up never drops below 0.85 s`);
check(r.t1f3.race > r.t1.race && r.t1f3.race < r.t2.race, `it rises floor by floor within a tower: ${r.t1.race} < ${r.t1f3.race} < ${r.t2.race}`);
check(near(r.boost.speed, Math.pow(1.03, 5), 0.001) && near(r.boost.every, Math.pow(1.03, 5), 0.001) && r.boost.times === 5, `each pickup: 3% faster and 3% more often, five times at most: ${JSON.stringify(r.boost)}`);
check(r.items.near >= 12 && r.items.far <= 30.01 && r.items.rival >= 12 && r.items.notice >= 1.5, `new items 12 to 30 units from you, 12 or more from the rival, each with a head start: ${JSON.stringify(r.items)}`);
check(r.close.taken && r.close.rivalItems === 1 && !r.close.guard, `no guard: the rival still wins an item a step or two from you if it gets there first: ${JSON.stringify(r.close)}`);
check(r.ultimate.lunge === undefined && !r.ultimate.guard && !r.ultimate.boost && r.ultimate.windup === 0.85 && near(r.ultimate.speedUp, r.ultimate.expect, 0.001) && !r.ultimate.guarded,
  `Ultimate Mode's rival is unchanged (old lunge, no guard, old 9% boost, 0.85 s wind-up): ${JSON.stringify(r.ultimate)}`);
check(errors.length === 0, `no page errors: ${errors.join(' | ')}`);

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
