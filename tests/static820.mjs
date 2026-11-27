// Web 8.2.0 (Russell, 27 November 2026: "The static still keeps coming back. It's still clearing
// when you pause it. I don't know if there's too many sounds coming in one channel or if the
// channel is being overloaded."). Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/static820.mjs http://localhost:8768
//
// What was found (five-minute runs measured in Chromium): nothing in the game's sound piles up
// over a run, but in Battle Mode and Driving the sounds added together went over the top most of
// the time, and the limiter, quick and hard at work, can crackle. What a pause does that nothing
// else in a run does is have the phone's own voice speak, which restarts the phone's sound output.
//
// Checked:
// - The limiter: attack 3 ms, release a quarter second (was 2 ms and 0.15 s), in a fresh engine too.
// - The master level per mode: Battle, Driving, and Chaos's battles and roads about 3 dB quieter
//   (the game's mix at 0.708); Standard, The Abyss, Ultimate Mode and the menus as before (1); the
//   help opened from a battle keeps the battle's level; the master itself, where Bella plays, stays
//   at 0.85 everywhere, so her loudness never changes.
// - A fresh sound engine in the middle of a run: not before 180 seconds of play, not while paused,
//   not while a one-shot plays; then, at a touch, the engine changes, every loop carries on in the
//   new one (same count, same names, playing), crossing over in 40 ms, the new engine keeps the
//   mode's level, and the old engine is closed eight seconds later.
// - No page errors.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8768';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 180000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');

const MASTER = 1; const LOUD = 0.708;
// The game's sounds pass through the mix (js/audio.js AudioEngine.mix) into the master, which
// stays at 0.85 (Bella goes to the master itself, so her loudness never changes).
const master = () => page.evaluate(() => window.__el.audio.mix.gain.value);
const bella = () => page.evaluate(() => window.__el.audio.out.gain.value);
const toMenu = async () => { await page.evaluate(() => { const g = window.__el.game; if (g.state === 'help') { g.state = g.prevState; g.isPaused = false; } if (g.playing) g._toMenu(''); g.chaosMode = false; }); await page.waitForTimeout(500); };
const start = async (mode, ms = 1500) => {
  await page.evaluate((mode) => {
    const g = window.__el.game;
    g.menuIndex = g.menuKeys.indexOf(mode); g.input('enter');
    for (let i = 0; i < 3 && /_menu$/.test(g.state); i++) g.input('enter');   // (Battle's and Driving's own menus: their first item)
  }, mode);
  await page.waitForTimeout(ms);
  return page.evaluate(() => window.__el.game.state);
};

// ------------------------------------------------------------------ the limiter
const lim = await page.evaluate(() => { const l = window.__el.audio.limiter; return { attack: l.attack.value, release: l.release.value, threshold: l.threshold.value, ratio: l.ratio.value }; });
check(near(lim.attack, 0.003, 1e-4) && near(lim.release, 0.25, 1e-4) && lim.threshold === -3 && lim.ratio === 20, 'the limiter: attack 3 ms, release 0.25 s, threshold -3, ratio 20: ' + JSON.stringify(lim));

// ------------------------------------------------------------------ the master level per mode
let m = await master();
check(near(m, MASTER), `the main menu at the usual level (${m.toFixed(3)})`);
for (const [mode, loud] of [['battle', true], ['drive', true], ['standard', false], ['abyss', false], ['ultimate', false]]) {
  const st = await start(mode);
  m = await master();
  const b = await bella();
  check(near(m, loud ? LOUD : MASTER) && near(b, 0.85), `${mode} (${st}): the game's sounds at ${m.toFixed(3)}, ${loud ? 'about 3 dB quieter' : 'as before'}; the master (Bella's level) ${b.toFixed(3)}`);
  if (mode === 'battle') {
    const bm = await page.evaluate(() => { const v = window.__el.speech.bella; return v && v._master ? v._master() : null; });
    check(bm === null || near(bm, 1 / 0.85), `Bella is levelled as before in a battle (${bm && bm.toFixed(3)}, 1/0.85)`);
    await page.evaluate(() => window.__el.game.input('help'));      // (four taps reach the help only while paused: pause first)
    await page.evaluate(() => { const g = window.__el.game; if (g.state !== 'help') { g.input('pause'); g.input('help'); } });
    await page.waitForTimeout(400);
    const hs = await page.evaluate(() => window.__el.game.state);
    m = await master();
    check(hs !== 'help' || near(m, LOUD), `the help opened from a battle (${hs}) keeps the battle's level: ${m.toFixed(3)}`);
  }
  await toMenu();
}
m = await master();
check(near(m, MASTER), `back on the main menu, the usual level again (${m.toFixed(3)})`);

// Chaos: a battle and a road in a Chaos run are quieter too; its labyrinth is not.
for (const [stage, loud] of [['battle', true], ['drive', true], ['standard', false]]) {
  await page.evaluate((stage) => { const g = window.__el.game; g._chaosPickNext = () => stage; }, stage);
  const st = await start('chaos', 2500);
  const cm = await page.evaluate(() => window.__el.game.chaosMode);
  m = await master();
  check(st === stage && cm && near(m, loud ? LOUD : MASTER), `Chaos ${stage} (state ${st}, chaos ${cm}): master ${m.toFixed(3)}`);
  await toMenu();
}
await page.evaluate(() => { delete window.__el.game._chaosPickNext; });

// ------------------------------------------------------------------ a fresh engine in the middle of a run
await start('battle', 2500);
const touch = () => page.evaluate(() => document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
const quiet = () => page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio;
  g.tts.stop();
  for (let i = 0; i < 100; i++) {
    if (![...a.live].some((v) => !v.loop && !v.ended && !v.stopped)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
});
// Not yet: under 180 seconds of play on this engine.
await page.evaluate(() => { window.__ctx0 = window.__el.audio.ctx; });
await quiet(); await touch();
let r = await page.evaluate(() => ({ same: window.__el.audio.ctx === window.__ctx0, since: window.__el.game.playSinceFresh }));
check(r.same && r.since < 180, `no fresh engine before 180 seconds of play (${r.since.toFixed(1)} s)`);
// Not while paused.
await page.evaluate(() => { const g = window.__el.game; g.playSinceFresh = 200; g.input('pause'); });
await touch();
r = await page.evaluate(() => ({ same: window.__el.audio.ctx === window.__ctx0 }));
check(r.same, 'no fresh engine while paused');
await page.evaluate(() => window.__el.game.input('pause'));
// Not while a one-shot plays.
r = await page.evaluate(() => {
  const g = window.__el.game; const a = window.__el.audio;
  g.tts.stop(); g.playSinceFresh = 200;
  const v = a.play('laser');
  const due = g.freshSoundDue();
  if (v) v.stop();
  return { played: !!v, due, same: a.ctx === window.__ctx0 };
});
check(r.played && !r.due && r.same, 'no fresh engine while a one-shot (a shot) is playing');
// Now: quiet, 200 seconds of play.
await page.evaluate(() => { window.__el.game.playSinceFresh = 200; });
const ok = await quiet();
const before = await page.evaluate(() => {
  const a = window.__el.audio;
  window.__ctx0 = a.ctx;
  const loops = [...a.live].filter((v) => v.loop).map((v) => v.name).sort();
  return { loops, fresh: a.freshened || 0 };
});
await touch();
await page.waitForTimeout(300);
const after = await page.evaluate(() => {
  const a = window.__el.audio; const g = window.__el.game;
  const loops = [...a.live].filter((v) => v.loop);
  return {
    changed: a.ctx !== window.__ctx0, fresh: a.freshened || 0, since: g.playSinceFresh,
    loops: loops.map((v) => v.name).sort(),
    playing: loops.filter((v) => v.dry && v.ctx === a.ctx && (v.sources.length > 0 || v.paused)).length,
    faded: loops.filter((v) => v.fadeMs === 40).length,
    oldState: window.__ctx0.state, master: a.mix.gain.value, bellaMaster: a.out.gain.value, attack: a.limiter.attack.value, pending: !!a.nextFreshFade,
  };
});
check(ok && after.changed && after.fresh === before.fresh + 1, `at a touch after 180 s of quiet play, a fresh sound engine (made ${before.fresh} -> ${after.fresh})`);
check(after.loops.length === before.loops.length && after.loops.join() === before.loops.join() && after.loops.length > 0, `every loop carried on: ${before.loops.length} before, ${after.loops.length} after (${after.loops.join(', ')})`);
check(after.playing === after.loops.length, `each one playing in the new engine (${after.playing} of ${after.loops.length})`);
check(after.faded === after.loops.length && !after.pending, `each one crossing over in 40 ms (${after.faded} of ${after.loops.length})`);
check(near(after.master, LOUD) && near(after.bellaMaster, 0.85) && near(after.attack, 0.003, 1e-4), `the new engine keeps Battle's level (${after.master.toFixed(3)}, master ${after.bellaMaster.toFixed(3)}) and the gentler limiter`);
check(after.oldState !== 'closed' && after.since < 5, `the old engine still open a moment (${after.oldState}); the play count started again (${after.since.toFixed(1)} s)`);
await page.waitForTimeout(8500);
const closed = await page.evaluate(() => window.__ctx0.state);
check(closed === 'closed', `the old engine closed eight seconds later (${closed})`);
// The run goes on in the new engine: a shot is heard there.
r = await page.evaluate(() => { const a = window.__el.audio; const v = a.play('laser'); return { inNew: !!v && v.ctx === a.ctx && v.ctx !== window.__ctx0, ctxRunning: a.ctx.state }; });
check(r.inNew && r.ctxRunning === 'running', `a shot after it plays in the new engine (${r.ctxRunning})`);
await toMenu();

check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
