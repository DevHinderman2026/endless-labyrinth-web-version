// Ultimate Mode soak (web 2.0.0): a bot plays for several worlds, hurried
// along, while memory, the number of live sounds and errors are watched. Not part
// of the quick suite (it takes a few minutes):
//   node --import ./tests/github-stub.mjs tests/ultimate-soak.mjs http://localhost:8765 [worlds]

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
const worldsWanted = Number(process.argv[3] || 6);
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'] });
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
await page.evaluate(() => { const g = window.__el.game; g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter'); });

const samples = [];
let worlds = 0;
for (let round = 0; round < 400 && worlds < worldsWanted; round++) {
  const r = await page.evaluate(async () => {
    const g = window.__el.game; const u = g.ut; const a = window.__el.audio;
    if (!u || g.state !== 'ultimate') return { over: true, state: g.state };
    // Stay alive: full health, plenty of ammo; wander and shoot; hurry the clock.
    u.hp = 100; u.ammo = Math.max(u.ammo, 20);
    const dirs = ['up', 'right', 'down', 'left'];
    for (let i = 0; i < 20; i++) {
      g.input(dirs[Math.floor(Math.random() * 4)]);
      if (Math.random() < 0.3) g.input('space');
    }
    if (Math.random() < 0.05 && u.place === 'world') g.input('hold');
    if (u.compass.on && Math.random() < 0.5) g.input('compass');
    // Three seconds of frames, and the clock hurried by twenty.
    for (let i = 0; i < 90; i++) g.updateUltimateMode(1 / 30);
    if (u.phase === 'play' && u.worldTime > 20) u.worldTime -= 20;
    await new Promise((res) => setTimeout(res, 120));
    const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null;
    return {
      over: false, worldNo: u.worldNo, elapsed: Math.round(u.elapsed), live: a.live.size, loops: [...a.live].filter((v) => v.loop).length,
      buffers: a.buffers.size, big: a.bigUsed.size, buses: a.areaBuses.size, enemies: u.enemies.length, pickups: u.pickups.length, mem,
      place: u.place, dmg: g._utDamage(), mul: g._utSpeedMul().toFixed(2),
    };
  });
  if (r.over) { console.log('run over:', r.state); break; }
  if (r.worldNo > worlds) {
    worlds = r.worldNo;
    samples.push(r);
    console.log(`world ${r.worldNo} at ${r.elapsed}s: live ${r.live} (loops ${r.loops}), buffers ${r.buffers}, big ${r.big}, buses ${r.buses}, enemies ${r.enemies}, pickups ${r.pickups}, heap ${r.mem} MB, damage ${r.dmg}, speed x${r.mul}, ${r.place}`);
  }
}
check(worlds >= worldsWanted, `played ${worlds} worlds`);
// (The bot plays twenty inputs in a burst, so one-shots pile up far beyond what a
// hand can make; the loops are the measure of a leak.)
const loops = samples.map((s) => s.loops);
check(Math.max(...loops) < 40, `looping sounds stay bounded (most ${Math.max(...loops)}; live at most ${Math.max(...samples.map((s) => s.live))})`);
const heaps = samples.map((s) => s.mem).filter((m) => m !== null);
if (heaps.length >= 3) {
  const late = heaps.slice(-2); const early = heaps.slice(1, 3);
  check(Math.max(...late) < Math.max(...early) * 1.8 + 60, `heap levels off: ${heaps.join(' -> ')} MB`);
}
check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
