// Ultimate Mode soak (web 2.0.0): a bot plays for several worlds, hurried
// along, while memory, the number of live sounds and errors are watched; since
// web 4.0.0 it turns and walks at every angle, and where it stands is watched too. Not part
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
const every = [];     // every round, not only each world's first
let worlds = 0;
for (let round = 0; round < 400 && worlds < worldsWanted; round++) {
  const r = await page.evaluate(async () => {
    const g = window.__el.game; const u = g.ut; const a = window.__el.audio;
    if (!u || g.state !== 'ultimate') return { over: true, state: g.state };
    // Stay alive: full health, plenty of ammo; wander and shoot; hurry the clock.
    u.hp = 100; u.ammo = Math.max(u.ammo, 20);
    // (Web 4.0.0: it turns, with a quick turn or a held one let go at whatever
    // slant it has reached, then walks the way it faces, forward mostly, so that
    // walls are met at every angle.)
    let frames = 0;
    const run = (n) => { for (let i = 0; i < n; i++) g.updateUltimateMode(1 / 30); frames += n; };
    for (let i = 0; i < 6; i++) {
      const pick = Math.random();
      if (pick < 0.35) g.input(Math.random() < 0.5 ? 'left' : 'right');
      else if (pick < 0.6) { g.input(Math.random() < 0.5 ? 'turn_left_start' : 'turn_right_start'); run(3 + Math.floor(Math.random() * 30)); g.input('turn_end'); }
      run(9);       // (a quick turn lands)
      for (let k = 0; k < 3; k++) {
        g.input(Math.random() < 0.8 ? 'up' : 'down');
        if (Math.random() < 0.3) g.input('space');
      }
    }
    if (Math.random() < 0.05 && u.place === 'world') g.input('hold');
    if (u.compass.on && Math.random() < 0.5) g.input('compass');
    // Three seconds of frames in all, and the clock hurried by twenty.
    run(Math.max(0, 90 - frames));
    if (u.phase === 'play' && u.worldTime > 20) u.worldTime -= 20;
    // Where it stands: on the floor, always (never inside a wall), and how it faces.
    const cell = (pos) => [Math.round(pos[0] / 3), Math.round(pos[1] / 3)];
    let onFloor = true;
    if (u.place === 'world' && u.world) { const [cx, cy] = cell(g.playerPos); onFloor = u.world.floor.has(cx + ',' + cy); }
    else if (u.place === 'seabed' && u.seabed) { const [cx, cy] = cell(g.playerPos); onFloor = u.seabed.grid.floor.has((cx - u.seabed.origin[0]) + ',' + (cy - u.seabed.origin[1])); }
    const quarter = u.face / (Math.PI / 2);
    const slant = Math.abs(quarter - Math.round(quarter)) > 1e-6;
    const offCentre = Math.abs(g.playerPos[0] / 3 - Math.round(g.playerPos[0] / 3)) > 1e-6 || Math.abs(g.playerPos[1] / 3 - Math.round(g.playerPos[1] / 3)) > 1e-6;
    await new Promise((res) => setTimeout(res, 120));
    const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null;
    return {
      over: false, worldNo: u.worldNo, elapsed: Math.round(u.elapsed), live: a.live.size, loops: [...a.live].filter((v) => v.loop).length,
      running: [...a.live].filter((v) => v.loop && !v.paused).length, shots: [...a.live].filter((v) => !v.loop).length, maxShots: a.maxShots3d,
      buffers: a.buffers.size, big: a.bigUsed.size, buses: a.areaBuses.size, enemies: u.enemies.length, pickups: u.pickups.length, mem,
      place: u.place, dmg: g._utDamage(), mul: g._utSpeedMul().toFixed(2),
      onFloor, slant, offCentre, pos: g.playerPos.map((x) => +x.toFixed(2)), face: +(u.face * 180 / Math.PI).toFixed(1),
    };
  });
  if (r.over) { console.log('run over:', r.state); break; }
  every.push(r);
  if (r.worldNo > worlds) {
    worlds = r.worldNo;
    samples.push(r);
    console.log(`world ${r.worldNo} at ${r.elapsed}s: live ${r.live} (loops ${r.loops}, ${r.running} of them running; one-shots ${r.shots}), buffers ${r.buffers}, big ${r.big}, buses ${r.buses}, enemies ${r.enemies}, pickups ${r.pickups}, heap ${r.mem} MB, damage ${r.dmg}, speed x${r.mul}, ${r.place}`);
  }
}
check(worlds >= worldsWanted, `played ${worlds} worlds`);
// (web 4.0.0) Walking at every angle, it is never found inside a wall or off the
// floor; and it did stand at a slant and off the middle of its square, so the
// free walking was really played.
const offFloor = every.filter((s) => !s.onFloor);
check(offFloor.length === 0, `it always stands on the floor (${every.length} looks)` + (offFloor.length ? ': ' + JSON.stringify(offFloor.slice(0, 3).map((s) => [s.place, s.pos, s.face])) : ''));
check(every.some((s) => s.slant) && every.some((s) => !s.slant) && every.some((s) => s.offCentre),
  `it faced at a slant in ${every.filter((s) => s.slant).length} looks and squared up in ${every.filter((s) => !s.slant).length}, and stood off the middle of its square in ${every.filter((s) => s.offCentre).length}`);
// (The bot plays twenty inputs in a burst, so one-shots pile up far beyond what a
// hand can make; the loops are the measure of a leak.)
const loops = samples.map((s) => s.loops);
check(Math.max(...loops) < 40, `looping sounds stay bounded (most ${Math.max(...loops)}; live at most ${Math.max(...samples.map((s) => s.live))})`);
// (web 3.3.0) The loops of areas nobody can hear are held, so far fewer run than
// are alive; and one-shots never pass their own ceiling, whatever the bot does.
const running = every.map((s) => s.running);
check(Math.max(...running) < 30 && Math.max(...running) <= Math.max(...every.map((s) => s.loops)), `the loops actually running stay well below those alive (most ${Math.max(...running)} running; most alive ${Math.max(...every.map((s) => s.loops))})`);
check(every.every((s) => s.shots <= s.maxShots + 4), `one-shots stay at their ceiling of ${every.length ? every[0].maxShots : '?'} (most ${Math.max(...every.map((s) => s.shots))}; a few cues may sound above it)`);
const heaps = samples.map((s) => s.mem).filter((m) => m !== null);
if (heaps.length >= 3) {
  const late = heaps.slice(-2); const early = heaps.slice(1, 3);
  check(Math.max(...late) < Math.max(...early) * 1.8 + 60, `heap levels off: ${heaps.join(' -> ')} MB`);
}
check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
