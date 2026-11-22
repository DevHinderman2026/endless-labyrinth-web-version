// Web 6.3.7 (Russell, 22 November 2026), played by script in a real browser engine.
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/web637.mjs http://localhost:8790
// What is checked:
// - Chaos worlds' water slide: the first ride in a world puts 30 seconds on the chaos
//   clock at the splash, each ride after it 5 less, never below 10 (30, 25, 20, 15, 10,
//   10); every slide in the world counts together; a new world starts again at 30; and
//   Ultimate Mode itself, which has no chaos clock, gets no time.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8790';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 90000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');

const out = await page.evaluate(() => {
  const g = window.__el.game; const r = {};
  const menu = () => { if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); } };
  const chaosWorld = () => {
    menu();
    g._chaosPickNext = () => 'ultimate';
    g.menuIndex = g.menuKeys.indexOf('chaos'); g.input('enter'); g.frame(1 / 30);
  };
  // One ride down a slide, start to splash, with the clock kept from running so only
  // the slide's own time is measured.
  const ride = (sl) => {
    const u = g.ut;
    g._utStartSlide(sl);
    const before = g.timeLeft;
    let guard = 0;
    while (u.place === 'slide' && guard++ < 400) {
      const keep = g.timeLeft;
      g._utUpdateSlide(1 / 30);
      if (u.place === 'slide') g.timeLeft = keep;      // (no clock in between, only the award)
    }
    return Math.round(g.timeLeft - before);
  };
  const fakeSlide = (u) => {
    const a = u.world.areas.find((x) => x.kind !== 'event') || u.world.areas[0];
    return { area: a, pos: [...(a.centre || [a.x0 + 2, a.y0 + 2])], pool: null, voice: null };
  };
  chaosWorld();
  r.state = g.state; r.chaos = !!(g.ut && g.ut.chaos);
  if (!g.ut) return r;
  const s1 = fakeSlide(g.ut); const s2 = fakeSlide(g.ut);
  r.rides = [ride(s1), ride(s1), ride(s1), ride(s2), ride(s1), ride(s2)];
  // A new world: the count starts again.
  g._utNewWorld(false);
  r.newWorld = ride(fakeSlide(g.ut));
  // Ultimate Mode itself: no chaos clock, no time.
  menu();
  g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter'); g.frame(1 / 30);
  if (g.ut && !g.ut.chaos) r.ultimate = ride(fakeSlide(g.ut));
  menu();
  return r;
});
check(out.state === 'ultimate' && out.chaos, 'a chaos world stage to test with: ' + JSON.stringify(out));
check(JSON.stringify(out.rides) === JSON.stringify([30, 25, 20, 15, 10, 10]), `six rides, two slides counting together, give 30, 25, 20, 15, 10, 10: ${JSON.stringify(out.rides)}`);
check(out.newWorld === 30, `a new world starts again at 30: ${out.newWorld}`);
check(out.ultimate === 0, `Ultimate Mode itself gets no time from a ride: ${out.ultimate}`);
check(errors.length === 0, 'no errors in the page: ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
