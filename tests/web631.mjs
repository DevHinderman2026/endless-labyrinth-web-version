// Web 6.3.1 (Russell, 20 November 2026), played by script in a real browser engine.
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/web631.mjs http://localhost:8790
// What is checked:
// - The popping in a Standard labyrinth: a finished sound's panner is no longer
//   unplugged from the mix but handed to the next sound, so standing in a labyrinth
//   with the exit beeping, the mix's inputs never change and no panner is unplugged.
// - Backgrounds turn with you in every mode that turns, and the four recorded with
//   both sides the same are given a second side, so they turn too.
// - The island in Ultimate Mode: the lift's hum and the ride are quieter, and the
//   island's air and the seabed's water are brought down to the rest of the world.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8790';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => {
  const m = window.__m = { made: 0, cut: 0 };
  const C = BaseAudioContext.prototype; const mk = C.createPanner;
  C.createPanner = function () { m.made += 1; return mk.call(this); };
  const od = AudioNode.prototype.disconnect;
  AudioNode.prototype.disconnect = function (...x) { if (this instanceof PannerNode && !x.length) m.cut += 1; return od.apply(this, x); };
});
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 90000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
await page.evaluate(() => {
  const g = window.__el.game;
  window.__t = { menu: () => { if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); } } };
});

// ------------------------------------------------------------------ 1. no unplugging in a labyrinth
await page.evaluate(() => {
  const g = window.__el.game;
  g.menuIndex = g.menuKeys.indexOf('standard'); g.input('enter');
  g.grid.clear(); g.playerPos = [0, 0]; g.exitPos = [7, 9]; g.timeCredit = null;
  window.__keep = setInterval(() => { g.timeLeft = Math.max(g.timeLeft || 0, 500); }, 200);
});
await page.waitForTimeout(3000);
const s0 = await page.evaluate(() => ({ ...window.__m, beeps: 0 }));
await page.evaluate(() => { const a = window.__el.audio; const op = a.play.bind(a); window.__beeps = 0; a.play = (n, o) => { if (/^prox_/.test(n)) window.__beeps += 1; return op(n, o); }; });
await page.waitForTimeout(12000);
const s1 = await page.evaluate(() => ({ ...window.__m, beeps: window.__beeps }));
check(s1.beeps >= 10, `the exit beeps all the while (${s1.beeps} in twelve seconds)`);
check(s1.cut - s0.cut === 0, `no panner is unplugged from the mix while you stand in a labyrinth: ${s1.cut - s0.cut}`);
check(s1.made - s0.made <= s1.beeps / 3, `the beeps' panners are handed on, not made anew: ${s1.made - s0.made} made for ${s1.beeps} beeps`);
await page.evaluate(() => { clearInterval(window.__keep); window.__t.menu(); });

// ------------------------------------------------------------------ 2. backgrounds turn
const sides = await page.evaluate(async () => {
  const a = window.__el.audio; const mod = await import('./js/audio.js');
  const out = {};
  for (const n of mod.TWO_SIDED) {
    const b = await a._decode('dry:' + n, a.entries.get(n).dry || a.entries.get(n));
    const l = b.getChannelData(0); const r = b.numberOfChannels > 1 ? b.getChannelData(1) : l;
    let same = true; for (let i = 0; i < l.length; i += 97) if (l[i] !== r[i]) { same = false; break; }
    out[n] = { ch: b.numberOfChannels, same };
  }
  return out;
});
check(Object.keys(sides).length === 4 && Object.values(sides).every((x) => x.ch === 2 && !x.same), 'the four backgrounds recorded with both sides alike are given a second side: ' + JSON.stringify(sides));

const modes = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const t = window.__t;
  const out = {};
  for (const m of ['standard', 'battle', 'tower', 'island', 'findvoice', 'abyss', 'chaos']) {
    t.menu();
    if (m === 'chaos') g._chaosPickNext = () => 'standard';
    g.menuIndex = g.menuKeys.indexOf(m); g.input('enter');
    await new Promise((r) => setTimeout(r, 2500));
    const loops = [...a.live].filter((v) => v.loop && v.dry);
    out[m] = { turns: !!(a.turnsNow ? a.turnsNow() : a.turns), flat: loops.filter((v) => !v.dry.wide && !v.dry.panner).map((v) => v.name), n: loops.length };
  }
  // One of the four, in a labyrinth: it plays as a wide pair, which turns.
  t.menu(); g.menuIndex = g.menuKeys.indexOf('standard'); g.input('enter');
  await new Promise((r) => setTimeout(r, 500));
  await a.prepare('lab_01_cavewind');
  const v = a.play('lab_01_cavewind', { loops: -1, volume: 0.5 });
  await new Promise((r) => setTimeout(r, 300));
  out.cave = !!(v && v.dry && v.dry.wide);
  if (v) v.stop();
  t.menu();
  return out;
});
for (const [m, r] of Object.entries(modes)) {
  if (m === 'cave') continue;
  check(r.turns && r.n > 0 && !r.flat.length, `${m}: every background turns with you: ${JSON.stringify(r)}`);
}
check(modes.cave, 'the cave wind, one of the four, now turns with you in a labyrinth');

// ------------------------------------------------------------------ 3. the island in Ultimate Mode
const isle = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const mod = await import('./js/modes/ultimate.js');
  const out = { trims: [mod.ISLAND_AIR_TRIM, mod.SEABED_WATER_TRIM, mod.HUM_LEVEL, mod.RIDE_LEVEL] };
  t.menu(); g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter');
  let a = g.ut.world.areas.find((x) => x.kind === 'island');
  for (let k = 0; !a && k < 20; k++) { g._utNewWorld(); a = g.ut.world.areas.find((x) => x.kind === 'island'); }
  if (!a) return out;
  g.ut.area = a; g.playerPos = [a.elevator[0] * 3, a.elevator[1] * 3];
  g._utStartRide('down');
  out.ride = g.ut.ride && g.ut.ride.voice ? +Math.max(g.ut.ride.voice.l, g.ut.ride.voice.r).toFixed(3) : null;
  window.__keep2 = setInterval(() => { g.timeLeft = Math.max(g.timeLeft || 0, 500); if (g.ut) { g.ut.hp = 100; g.ut.safe = 99; } }, 200);
  for (let k = 0; k < 40 && g.ut.place !== 'seabed'; k++) await new Promise((r) => setTimeout(r, 500));
  await new Promise((r) => setTimeout(r, 1000));
  clearInterval(window.__keep2);
  const s = g.ut.seabed;
  out.place = g.ut.place;
  out.hum = s && s.hum ? Math.max(s.hum.l, s.hum.r) : null;
  out.water = s && s.underWide ? Math.max(s.underWide.l, s.underWide.r) : null;
  t.menu();
  return out;
});
check(JSON.stringify(isle.trims) === JSON.stringify([0.5, 0.46, 0.4, 0.7]), 'the island\'s air at half, the seabed\'s water at 0.46, the lift\'s hum at 0.4, the ride at 0.7: ' + JSON.stringify(isle.trims));
check(isle.ride === 0.7, 'the ride plays at 0.7: ' + isle.ride);
check(isle.place === 'seabed' && isle.hum !== null && isle.hum <= 0.4 + 1e-6, 'on the seabed, standing at the lift, its hum is no louder than 0.4: ' + JSON.stringify(isle));
check(isle.water !== null && isle.water <= 0.8 * 0.46 + 1e-6, 'and the water all round you is brought down with it: ' + isle.water);

check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
