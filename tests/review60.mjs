// Web 6.0.0, the Fable review's fixes in Ultimate Mode (19 November 2026):
// time won during a world's last two seconds brings the faded world back, and the
// hunters a smashed case let out give up when you take the elevator down.
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/review60.mjs http://localhost:8790
import { chromium } from 'playwright';
const base = process.argv[2];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 90000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
const out = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio;
  const res = {};
  const start = () => { if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); }
    g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter'); g.frame(1 / 30); };
  const frames = (s) => { for (let i = 0; i < Math.round(s * 30); i++) g.frame(1 / 30); };
  // ---- 1: time added in the last two seconds
  start();
  let u = g.ut; u.enemies = []; u.respawn.clear(); u.safe = 999;
  const levels = [];
  const orig = a.setWorldLevel.bind(a);
  a.setWorldLevel = (l, s) => { levels.push([l, s]); return orig(l, s); };
  u.worldTime = 1.5; frames(0.2);
  res.phaseBefore = u.phase;
  // a glass case's time reward, as _utSmash gives it (and the chest's, the gift's, the mercy's)
  u.worldTime += 60;
  frames(3);
  await new Promise((r) => setTimeout(r, 2500));
  res.phaseAfter = u.phase; res.worldTimeAfter = u.worldTime; res.worldNo = u.worldNo;
  res.gain = a.worldGain.gain.value; res.levels = levels;
  a.setWorldLevel = orig;
  // ---- 2: hunters and the lift
  let tries = 0; let isl = null;
  while (!isl && tries++ < 60) { start(); u = g.ut; isl = u.world.areas.find((x) => x.kind === 'island'); }
  res.islandFound = !!isl;
  if (isl) {
    u.enemies = []; u.respawn.clear(); u.worldTime = 280; u.safe = 0;
    const c = { area: isl, pos: [isl.centre[0] + 9, isl.centre[1]], voice: null, near: false, smashed: false, credit: 0 };
    u.cases.push(c);
    g.playerPos = [isl.centre[0] + 6, isl.centre[1]]; u.area = isl; u.place = 'world';
    g._utSmash(c);
    res.huntersAfterSmash = u.enemies.filter((e) => e.hunter).length;
    // step onto the lift: two cells west
    g.playerPos = [isl.centre[0] + 3, isl.centre[1]]; u.liftArmed = true; u.face = -Math.PI / 2; g._utFace(u.face, true);
    g.input('up'); frames(0.1);
    res.placeAfterStep = u.place;
    let n = 0; while (u.place === 'ride' && n++ < 2000) g.frame(1 / 30);
    res.placeDown = u.place; res.huntersOnSeabed = u.enemies.filter((e) => e.hunter).length;
    frames(5);
    // back up: step off and on
    g.input('up'); frames(0.1); g.input('down'); frames(0.1);
    res.placeUpStart = u.place;
    n = 0; while (u.place === 'ride' && n++ < 2000) g.frame(1 / 30);
    res.placeUp = u.place; frames(0.5);
    res.huntersBackUp = u.enemies.filter((e) => e.hunter).length;
    res.hp0 = u.hp; u.hitCooldown = 0; frames(12); res.hpAfter12s = u.hp; res.huntersLater = u.enemies.filter((e) => e.hunter).length;
  }
  return res;
});
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
check(out.phaseBefore === 'fading' && out.phaseAfter === 'play' && out.gain === 1, 'time won in a world\'s last two seconds brings the world back from its fade: ' + JSON.stringify([out.phaseBefore, out.phaseAfter, out.gain]));
if (out.islandFound) {
  check(out.huntersAfterSmash > 0 && out.huntersOnSeabed === 0 && out.huntersBackUp === 0, 'a smashed case\'s hunters give up when you take the elevator down: ' + JSON.stringify([out.huntersAfterSmash, out.huntersOnSeabed, out.huntersBackUp]));
  check(out.hpAfter12s === out.hp0, 'and none is waiting at the top when you come back up');
}
check(errors.length === 0, 'no page errors ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
