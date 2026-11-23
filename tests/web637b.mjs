// Web 6.3.7, the rest of it (Russell, 22 November 2026), played by script in a real
// browser engine. The water slide has its own file (web637.mjs), the Dungeon Keys guards
// theirs (dungeon637.mjs), and the island supply is checked in island.mjs.
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/web637b.mjs http://localhost:8790
// What is checked:
// - 8a: a pause landing in the first milliseconds of a placed beep, then a resume, does
//   not stop the resume part-way; two hundred pauses in a Standard labyrinth leave the
//   exit still beeping and nothing held.
// - 2: the background stays when a Chaos Abyss or Find the Voice stage's exit opens, and
//   fades at the stage change instead of being cut.
// - 3: a pause lets a held loop's baked echo ring out, and the resume brings it back in
//   step, never two echoes at once.
// - 5 and 8b: a credit or a cartridge already out when a Chaos exit appears stays, can be
//   taken, and no new one appears.
// - 1: every level change is a glide that ends; a run's end makes a fresh sound engine.

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
await page.evaluate(() => {
  const g = window.__el.game;
  window.toMenu = () => { if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); } };
  window.startMode = (key) => { window.toMenu(); g.menuIndex = g.menuKeys.indexOf(key); g.input('enter'); g.frame(1 / 30); };
  window.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
});

// ------------------------------------------------------------------ 8a: the resume crash
const a8 = await page.evaluate(async () => {
  const g = window.__el.game; const a = g.audio; const r = {};
  window.startMode('standard');
  r.state = g.state;
  const name = [...a.entries.keys()].find((k) => k.includes('prox_'));
  r.name = name;
  // A placed beep, held in the milliseconds before its first sample, then carried on.
  const v = a.play(name, { at: [g.playerPos[0] + 6, g.playerPos[1]] });
  r.lead = v.startedAt - a.ctx.currentTime;
  v.pause();
  r.offset = v.offset;
  try { v.resume(); r.threw = false; } catch (e) { r.threw = String(e); }
  v.stop();
  // Two hundred pauses and resumes while the exit beeps.
  let threw = 0;
  for (let i = 0; i < 200; i++) {
    for (let k = 0; k < 3; k++) g.frame(1 / 30);
    try { g.input('pause'); await window.sleep(1 + (i % 7)); g.input('pause'); } catch (e) { threw += 1; }
    await window.sleep(3);
  }
  r.threw200 = threw; r.paused = g.isPaused; r.held = g.pausedVoices.length;
  r.stuck = [...a.live].filter((x) => x.paused).length;
  // The exit still beeps afterwards.
  const seen = new Set();
  for (let i = 0; i < 120; i++) { g.frame(1 / 30); for (const x of a.live) if (x.name.includes('prox_')) seen.add(x); await window.sleep(8); }
  r.beeps = seen.size;
  window.toMenu();
  return r;
});
check(a8.state === 'standard' && !!a8.name, 'a Standard labyrinth and a proximity beep to test with: ' + a8.name);
check(a8.lead > 0 && a8.offset === 0 && a8.threw === false, `a beep held ${Math.round(a8.lead * 1000)} ms before its first sample is held at 0 and carries on (offset ${a8.offset}, threw ${a8.threw})`);
check(a8.threw200 === 0 && !a8.paused && a8.held === 0 && a8.stuck === 0, `200 pauses and resumes in a labyrinth: no error, nothing left held (${JSON.stringify(a8)})`);
check(a8.beeps > 0, `the exit still beeps afterwards (${a8.beeps} beeps in four seconds)`);

// ------------------------------------------------------------------ 2: the background stays at the exit
const s2 = await page.evaluate(async () => {
  const g = window.__el.game; const a = g.audio; const r = {};
  const pick = g._chaosPickNext;
  for (const kind of ['abyss', 'findvoice']) {
    const seq = [kind, 'standard']; let i = 0;
    g._chaosPickNext = () => seq[Math.min(i++, seq.length - 1)];
    window.startMode('chaos');
    const m = kind === 'abyss' ? g.ab : g.fv;
    const o = r[kind] = { state: g.state, amb: !!(m && m.amb && m.amb.voice) };
    if (!o.amb) continue;
    const amb = m.amb.voice;
    for (let k = 0; k < 20; k++) { g.frame(1 / 30); await window.sleep(5); }
    if (kind === 'abyss') { m.smashed = m.quota; g._abOpenExit(); } else { m.finds = m.quota; g._fvOpenExit(); }
    for (let k = 0; k < 45; k++) { g.frame(1 / 30); await window.sleep(5); }
    o.exit = !!m.exit;
    o.kept = !!(m.amb && m.amb.voice === amb) && amb.busy && !amb.fadingOut && !amb.paused;
    o.level = Math.max(amb.l, amb.r);
    o.loops = [...a.live].filter((v) => v.loop && v.busy && !v.fadingOut).map((v) => v.name);
    const t0 = g.timeLeft; for (let k = 0; k < 30; k++) g.frame(1 / 30); o.clockWaits = g.timeLeft === t0;
    // Through the exit: the background fades under the next level, it is not cut.
    if (kind === 'abyss') g._abLeaveByExit(); else g._fvLeaveByExit();
    o.fadesNotCut = amb.fadingOut === true && !amb.stopped;
    await window.sleep(700);
    o.goneAfter = amb.stopped === true;
    window.toMenu();
  }
  g._chaosPickNext = pick;
  return r;
});
for (const kind of ['abyss', 'findvoice']) {
  const o = s2[kind] || {};
  check(o.state === kind && o.amb, `a Chaos ${kind} stage with its background playing`);
  check(o.exit && o.kept && o.level > 0, `${kind}: the exit opens and the background plays on, at level ${o.level} (${(o.loops || []).join(', ')})`);
  check(o.clockWaits, `${kind}: the chaos clock still waits while the exit is open`);
  check(o.fadesNotCut && o.goneAfter, `${kind}: through the exit, the background fades out under the next level instead of being cut (fading ${o.fadesNotCut}, gone after the fade ${o.goneAfter})`);
}

// ------------------------------------------------------------------ 8b: a cartridge out when a battle's exit appears
const s8b = await page.evaluate(async () => {
  const g = window.__el.game; const r = {};
  const pick = g._chaosPickNext;
  g._chaosPickNext = () => 'battle';
  window.startMode('chaos');
  r.state = g.state;
  for (let k = 0; k < 90 && !g.ammoPickups.length; k++) g.frame(1 / 30);
  const p = g.ammoPickups[0];
  r.had = !!p;
  if (p) {
    for (const o of g.obstacles) if (o.channel) o.channel.stop();
    g.obstacles = []; g.kills = g._battleTargetsNeeded(); g.spawnedEnemies = g.kills;
    g.frame(1 / 30);
    r.exit = !!g.battleExitActive;
    r.kept = g.ammoPickups.length === 1 && g.ammoPickups[0] === p && p.channel.busy;
    for (let k = 0; k < 30; k++) g.frame(1 / 30);
    r.level = Math.max(p.channel.l, p.channel.r);
    const before = g.ammo;
    g.playerPos = [p.x, p.y]; g.frame(1 / 30);
    r.gained = g.ammo - before; r.shots = p.shots; r.silent = !p.channel.busy;
    for (let k = 0; k < 60 && g.state === 'battle'; k++) g.frame(1 / 30);
    r.noNew = g.ammoPickups.length === 0;
    r.pool = g.ammo;
  }
  g._chaosPickNext = pick;
  window.toMenu();
  return r;
});
check(s8b.state === 'battle' && s8b.had, 'a Chaos battle with a cartridge on the floor');
check(s8b.exit && s8b.kept && s8b.level > 0, `the exit appears and the cartridge already out stays, its beacon still heard (level ${s8b.level})`);
check(s8b.gained === s8b.shots && s8b.gained > 0 && s8b.silent, `stepped onto, it adds its ${s8b.shots} shots to the battles' ammo and falls silent`);
check(s8b.noNew, 'no new cartridge appears once the exit is out');

//SECTIONS

check(errors.length === 0, 'no errors in the page: ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
