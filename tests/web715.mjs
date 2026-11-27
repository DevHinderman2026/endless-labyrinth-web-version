// Web 7.1.5 (Russell, 23 November 2026: "Can you take another wing at the static bug ... I
// believe it's because of something not being cleared ... the pause menu is always stopping
// it"). Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/web715.mjs http://localhost:8790
//
// What was found, in Chromium: nothing in the game's sound piles up (the nodes the sound
// thread visits stay a few hundred over long runs; no setting's list of scheduled changes
// grows past a handful, by Safari's rules for keeping them). What a pause stops is movement.
// While a panner's place glides (walking) or the listener's facing glides (turning: every
// panner at once), an HRTF panner works its direction out for every one of the 128 samples of
// a slice of sound, then uses only the first: sixteen panners took 22 percent of a core
// turning against 3.4 standing still; in Battle Mode, turning took 24 percent against 8 paused.
// Now the panners' places and the listener's facing are worked out once a slice (automation
// rate 'k-rate'): sixteen panners turning, 5.7 percent; Battle Mode turning, 12.
//
// Checked:
// - The listener's nine settings are k-rate, in a fresh engine too (the one made after a run).
// - Every panner the game makes is k-rate: placed sounds' (the exit's beep, an enemy's loop,
//   which begins wide and is placed on its first frame), wide sounds' west and east, in a
//   Standard labyrinth, a Battle arena and Ultimate Mode's world.
// - What is heard is the same: one scene (the listener turning in the game's own glides, four
//   sounds moving in theirs), rendered the old way and the new, differs by less than -100 dB.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8790';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));
await page.addInitScript(() => {
  const all = window.__panners = [];
  const mk = BaseAudioContext.prototype.createPanner;
  BaseAudioContext.prototype.createPanner = function (...x) { const p = mk.apply(this, x); all.push(p); return p; };
});
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 120000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');

const LISTENER = ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'];
const PANNER = ['positionX', 'positionY', 'positionZ', 'orientationX', 'orientationY', 'orientationZ'];

const listenerRates = () => page.evaluate((names) => names.map((k) => window.__el.audio.ctx.listener[k].automationRate), LISTENER);
const pannerRates = () => page.evaluate((names) => {
  const ctx = window.__el.audio.ctx;
  const mine = window.__panners.filter((p) => p.context === ctx);
  const bad = mine.filter((p) => names.some((k) => p[k].automationRate !== 'k-rate')).length;
  return { made: mine.length, bad };
}, PANNER);
const startRun = async (mode, ms = 4000) => {
  // (8.2.0: Battle's and Driving's own menus, then the mode.)
  await page.evaluate((mode) => { const g = window.__el.game; g.menuIndex = g.menuKeys.indexOf(mode); g.input('enter'); if (g.state === 'battle_menu' || g.state === 'drive_menu') g.input('enter'); }, mode);
  await page.waitForTimeout(ms);
};
const toMenu = async () => {
  await page.evaluate(() => { const g = window.__el.game; if (g.playing) g._toMenu(''); });
  await page.waitForTimeout(600);
};

// ------------------------------------------------------------------ the listener
let lr = await listenerRates();
check(lr.every((r) => r === 'k-rate'), 'the listener\'s nine settings are worked out once a slice: ' + lr.join(' '));

// ------------------------------------------------------------------ a Standard labyrinth
await startRun('standard');
await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(1500); await page.keyboard.up('ArrowLeft');
const std = await page.evaluate(async () => {
  const a = window.__el.audio; const g = window.__el.game;
  // Wait for the exit's beep, and look at it.
  for (let i = 0; i < 60; i++) {
    const v = [...a.live].find((x) => /^prox_/.test(x.name) && x.dry && x.dry.panner);
    if (v) return { state: g.state, name: v.name, rates: ['positionX', 'orientationX'].map((k) => v.dry.panner[k].automationRate) };
    await new Promise((r) => setTimeout(r, 50));
  }
  return { state: g.state, name: null };
});
check(std.name && std.rates.every((r) => r === 'k-rate'), `Standard: the exit's beep (${std.name}) plays through a k-rate panner: ${JSON.stringify(std)}`);
let pr = await pannerRates();
check(pr.made > 0 && pr.bad === 0, `Standard: every panner made is k-rate (${pr.made} made, ${pr.bad} not)`);
await toMenu();

// ------------------------------------------------------------------ a Battle arena
await startRun('battle', 3000);
const bat = await page.evaluate(async () => {
  const a = window.__el.audio; const g = window.__el.game;
  // An enemy's loop (or the ammo beacon) begins wide and is placed on its first frame.
  for (let i = 0; i < 200; i++) {
    const v = [...a.live].find((x) => /^(obstacle_|ammo_beacon)/.test(x.name) && x.loop && x.dry && x.dry.panner);
    if (v) {
      const wide = [...a.live].find((x) => x.dry && x.dry.wide);
      return { state: g.state, name: v.name, placed: ['positionX', 'orientationX'].map((k) => v.dry.panner[k].automationRate), wide: wide ? wide.name : null, sides: wide ? [wide.dry.wide.west.positionX.automationRate, wide.dry.wide.east.positionX.automationRate] : [] };
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return { state: g.state, name: null };
});
check(bat.name && bat.placed.every((r) => r === 'k-rate') && bat.wide && bat.sides.every((r) => r === 'k-rate'), `Battle: an enemy's loop (${bat.name}), placed after beginning wide, and a wide background's west and east (${bat.wide}) play through k-rate panners: ` + JSON.stringify(bat));
pr = await pannerRates();
check(pr.made > 0 && pr.bad === 0, `Battle: every panner made is k-rate, the wide loops' west and east included (${pr.made} made, ${pr.bad} not)`);
await toMenu();

// ------------------------------------------------------------------ Ultimate Mode's world
await startRun('ultimate', 5000);
await page.keyboard.down('ArrowRight'); await page.waitForTimeout(1200); await page.keyboard.up('ArrowRight');
pr = await pannerRates();
lr = await listenerRates();
check(pr.made > 0 && pr.bad === 0 && lr.every((r) => r === 'k-rate'), `Ultimate Mode: every panner made is k-rate (${pr.made} made, ${pr.bad} not), and the listener`);
await toMenu();

// ------------------------------------------------------------------ a fresh engine
const fresh = await page.evaluate((names) => { const a = window.__el.audio; const old = a.ctx; a.fresh(); return { renewed: a.ctx !== old, rates: names.map((k) => a.ctx.listener[k].automationRate) }; }, LISTENER);
check(fresh.renewed && fresh.rates.every((r) => r === 'k-rate'), 'a fresh engine\'s listener is k-rate too: ' + fresh.rates.join(' '));

// ------------------------------------------------------------------ the same sound
const same = await page.evaluate(async () => {
  const render = async (krate) => {
    const sr = 48000; const len = sr * 3;
    const ctx = new OfflineAudioContext(2, len, sr);
    const K = (p) => { if (krate) p.automationRate = 'k-rate'; };
    const l = ctx.listener;
    for (const k of ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ']) K(l[k]);
    const buf = ctx.createBuffer(1, sr, sr); const d = buf.getChannelData(0);
    let seed = 7; for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647 * 2 - 1) * 0.2; }
    const glide = (p, v0, v, t, secs) => { p.setValueAtTime(v0, t); p.linearRampToValueAtTime(v, t + secs); };
    const ps = [];
    for (let i = 0; i < 4; i++) {
      // A panner as the game makes one (audio.js takePanner).
      const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'linear'; p.rolloffFactor = 0; p.refDistance = 1; p.maxDistance = 10000;
      for (const k of ['positionX', 'positionY', 'positionZ', 'orientationX', 'orientationY', 'orientationZ']) K(p[k]);
      const a = i * Math.PI / 2 + 0.3; p.positionX.value = Math.sin(a) * 3; p.positionZ.value = -Math.cos(a) * 3;
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(p); p.connect(ctx.destination); s.start(0);
      ps.push([p, a]);
    }
    // The listener turns in 45 ms glides every frame (setFacing); the sounds move in 60 ms glides (_place).
    let th = 0;
    for (let t = 0.1; t < 2.9; t += 0.016) { const th1 = th + 0.02; glide(l.forwardX, Math.sin(th), Math.sin(th1), t, 0.045); glide(l.forwardZ, -Math.cos(th), -Math.cos(th1), t, 0.045); th = th1; }
    let m = 0;
    for (let t = 0.1; t < 2.9; t += 0.033) { const m1 = m + 0.03; for (const [p, a] of ps) { glide(p.positionX, Math.sin(a + m) * 3, Math.sin(a + m1) * 3, t, 0.06); glide(p.positionZ, -Math.cos(a + m) * 3, -Math.cos(a + m1) * 3, t, 0.06); } m = m1; }
    const out = await ctx.startRendering();
    return [out.getChannelData(0).slice(), out.getChannelData(1).slice()];
  };
  // A first render, thrown away: the browser loads its HRTF data on the first panner, and a
  // render begun before that has finished (a busy machine) starts with plain panning.
  await render(false);
  const A = await render(false); const B = await render(true);
  let se = 0; let sa = 0;
  for (let c = 0; c < 2; c++) for (let i = 0; i < A[c].length; i++) { const dd = A[c][i] - B[c][i]; se += dd * dd; sa += A[c][i] * A[c][i]; }
  return { diffDb: +(10 * Math.log10(se / sa + 1e-30)).toFixed(1), heard: sa > 0 };
});
check(same.heard && same.diffDb < -100, `the same scene, the old way and the new, differs by ${same.diffDb} dB (under -100: the same sound)`);

check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
