// Web 6.3.6 (Russell, 21 November 2026: "when you're facing the exit, the beeping can
// still sound like it's on your left or your right ... like the beeping is reflecting
// off of something invisible, instead of coming from one central spot").
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/web636.mjs http://localhost:8765
//
// What was wrong, measured here at the game's own output in a real browser engine:
// a placed one-shot (the exit's beep, a knock, a pickup, a spoken line) plays through
// an HRTF panner handed on from a pool. A browser stops working a panner while nothing
// plays through it, and such a panner misses every turn of the listener made meanwhile:
// 1. If the next sound is put in the very same place in the world (you stood still and
//    turned), the browser sees that the panner has not moved and goes on using the
//    direction it worked out before your turn: the whole beep comes from where the exit
//    was, relative to your head, the last time that panner played.
// 2. If the place is different, the browser works the direction out afresh but slides to
//    it from the old one over about 45 milliseconds: the beep starts on the wrong side.
// With a pool of panners of different ages, one beep came from the left, the next from
// the middle, the next from the right. Now a panner taken from the pool is woken: its
// HRTF state is made new (so it starts exactly where it is put) and its place is always
// sent as a changed one (so the browser works the direction out afresh).
//
// Checked:
// - A beep in the west, heard facing north; then you turn to face west and it beeps
//   again from the same place: it must be in the middle, from its first millisecond.
// - A beep that was on the left and is next on the right starts on the right.
// - The same two in Ultimate Mode's 3D world.
// - A sound held and carried on after a turn (a pause, a far-off area) is in the right place.
// - No panner is made while a free one waits, and none is ever unplugged.
// - In a Standard labyrinth and a Chaos labyrinth: facing the exit after turning, every
//   beep is centred from its first moment.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));
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
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Record what the game puts out (the master mix, before the limiter).
  const rec = (a) => {
    const ctx = a.ctx; const sp = ctx.createScriptProcessor(2048, 2, 2);
    const L = []; const R = [];
    sp.onaudioprocess = (e) => { L.push(Float32Array.from(e.inputBuffer.getChannelData(0))); R.push(Float32Array.from(e.inputBuffer.getChannelData(1))); };
    a.out.connect(sp); sp.connect(ctx.destination);
    return () => {
      try { a.out.disconnect(sp); sp.disconnect(); } catch (e) { /* gone */ }
      const cat = (arr) => { const n = arr.reduce((s, x) => s + x.length, 0); const o = new Float32Array(n); let k = 0; for (const x of arr) { o.set(x, k); k += x.length; } return o; };
      return [cat(L), cat(R)];
    };
  };
  // Right ear over left ear, in decibels: at the sound's onset, and over all of it.
  const sides = ([L, R], from = 0) => {
    let peak = 0; for (let i = from; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const th = peak * 0.05; let i0 = -1;
    for (let i = from; i < L.length; i++) if (Math.abs(L[i]) > th || Math.abs(R[i]) > th) { i0 = i; break; }
    const e = (x, a, b) => { let s = 0; for (let i = a; i < Math.min(b, x.length); i++) s += x[i] * x[i]; return s; };
    const db = (v) => 10 * Math.log10(v + 1e-12);
    const w = (ms) => Math.round(ms * 44.1);
    const d = (a, b) => +(db(e(R, i0 + w(a), i0 + w(b))) - db(e(L, i0 + w(a), i0 + w(b)))).toFixed(1);
    return { found: i0 >= 0 && peak > 1e-4, peak: +peak.toFixed(3), onset10: d(0, 10), onset30: d(0, 30), all: d(0, 400) };
  };
  const a = window.__el.audio;
  const own = { binaural: a.binaural, relOf: a.relOf, turns: a.turns, turnsNow: a.turnsNow, room: a.room };
  const restore = () => { a.stopAll(); Object.assign(a, own); a.setFacing(0, true); };
  window.__c = { sleep, rec, sides, restore };
});

const D = Math.PI / 180;

// ------------------------------------------------------------------ 1. the 3D modes (every mode but Ultimate)
const bin = await page.evaluate(async (D) => {
  const { sleep, rec, sides } = window.__c;
  const a = window.__el.audio; const mod = await import('./js/audio.js');
  a.stopAll(); a.binaural = true; a.turns = true; a.turnsNow = () => true; a.relOf = (p) => p; a.room = null;
  a.setFacing(0, true);
  const out = {};
  // The beep's own length, for the record.
  out.beepMs = Math.round(a.buffers.get('dry:prox_10').duration * 1000);
  // Several beeps in the west, facing north, as a labyrinth's exit would give.
  for (let i = 0; i < 4; i++) { a.play('prox_10', { at: [-1, 0], volume: 0.4 }); await sleep(300); }
  // Their panners go back to the pool four seconds after they end.
  await sleep(4800);
  // You turn to face west, as the game turns you: a string of small glided changes.
  for (let i = 1; i <= 15; i++) { a.setFacing(-i * 6 * D); await sleep(17); }
  await sleep(400);
  const s0 = { ...mod.pannerStats }; const m0 = { ...window.__m };
  // The exit beeps again, from the same place in the world: now straight ahead.
  const ahead = [];
  for (let i = 0; i < 4; i++) {
    const stop = rec(a); await sleep(120);
    a.play('prox_10', { at: [-1, 0], volume: 0.4 });
    await sleep(500);
    ahead.push(sides(stop()));
  }
  out.ahead = ahead;
  out.made = mod.pannerStats.made - s0.made; out.reused = mod.pannerStats.reused - s0.reused;
  out.nodesMade = window.__m.made - m0.made; out.cut = window.__m.cut - m0.cut;
  await sleep(4800);
  // And one that was on your left is next on your right: it starts on the right.
  a.setFacing(0, true);
  for (let i = 0; i < 3; i++) { a.play('prox_10', { at: [-1, 0], volume: 0.4 }); await sleep(300); }
  await sleep(4800);
  const stop = rec(a); await sleep(120);
  a.play('prox_10', { at: [1, 0], volume: 0.4 });
  await sleep(500);
  out.right = sides(stop());
  // A looping sound held while you turn, then carried on (a pause, a far-off area).
  await sleep(4500);
  a.setFacing(0, true);
  const loop = a.play('credit_beacon', { loops: -1, at: [-1, 0], volume: 0.5 }) || null;
  out.loopName = loop ? 'credit_beacon' : null;
  if (loop) {
    await sleep(600);
    loop.pause();
    await sleep(300);
    for (let i = 1; i <= 15; i++) { a.setFacing(-i * 6 * D); await sleep(17); }
    await sleep(300);
    const stop2 = rec(a); await sleep(120);
    loop.resume();
    await sleep(700);
    out.held = sides(stop2());
    loop.stop();
  }
  a.setFacing(0, true);
  return out;
}, D);
const centred = (s, tol = 1.5) => s.found && Math.abs(s.onset10) <= tol && Math.abs(s.onset30) <= tol && Math.abs(s.all) <= tol;
const show = (s) => `first 10 ms ${s.onset10} dB, first 30 ms ${s.onset30} dB, all of it ${s.all} dB`;
console.log(`(the exit's beep is ${bin.beepMs} milliseconds long; right ear over left ear, 0 is the middle)`);
bin.ahead.forEach((s, i) => check(centred(s), `3D modes: beep ${i + 1} after turning to face it is in the middle from its first moment: ${show(s)}`));
check(bin.made === 0 && bin.nodesMade === 0 && bin.cut === 0, `and those beeps reused the pool's panners: ${bin.reused} reused, ${bin.made} made, ${bin.cut} unplugged`);
check(bin.right.found && bin.right.onset10 > 3 && bin.right.all > 3, `3D modes: a beep on the right, after ones on the left, starts on the right: ${show(bin.right)}`);
if (bin.loopName) check(centred(bin.held, 2), `3D modes: a beacon held while you turn to face it carries on in the middle: ${show(bin.held)}`);
else console.log('SKIP the held beacon: no such recording');

// ------------------------------------------------------------------ 2. Ultimate Mode's 3D world (and Chaos's worlds)
const sp = await page.evaluate(async (D) => {
  const { sleep, rec, sides } = window.__c;
  const a = window.__el.audio; const mod = await import('./js/audio.js');
  a.stopAll(); await sleep(4500);
  a.binaural = false; a.spatialOn(); a.setFacing(0, true);
  const out = {};
  for (let i = 0; i < 4; i++) { a.play('prox_10', { pos: [-6, 0], volume: 0.4 }); await sleep(300); }
  await sleep(4800);
  for (let i = 1; i <= 15; i++) { a.setFacing(-i * 6 * D); await sleep(17); }
  await sleep(400);
  const s0 = { ...mod.pannerStats };
  const ahead = [];
  for (let i = 0; i < 3; i++) {
    const stop = rec(a); await sleep(120);
    a.play('prox_10', { pos: [-6, 0], volume: 0.4 });
    await sleep(500);
    ahead.push(sides(stop()));
  }
  out.ahead = ahead; out.made = mod.pannerStats.made - s0.made;
  await sleep(4500);
  a.spatialOff({ now: true });
  window.__c.restore();
  return out;
}, D);
sp.ahead.forEach((s, i) => check(centred(s), `Ultimate's world: beep ${i + 1} after turning to face it is in the middle from its first moment: ${show(s)}`));
check(sp.made === 0, `and no panner was made for them (${sp.made})`);

// ------------------------------------------------------------------ 3. a Standard labyrinth, and a Chaos labyrinth: turn to face the exit
for (const mode of ['standard', 'chaos']) {
  const lab = await page.evaluate(async ([mode, D]) => {
    const { sleep, rec, sides } = window.__c;
    const g = window.__el.game; const a = window.__el.audio;
    if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); }
    await sleep(300);
    g.menuIndex = g.menuKeys.indexOf(mode); g.input('enter');
    // (Chaos opens on a level of any kind: wait for a labyrinth, moving it on if need be.)
    let tries = 0;
    await sleep(2500);
    while (mode === 'chaos' && g.state !== 'standard' && tries < 40) {
      tries += 1;
      if (g._chaosForce) break;
      g._chaosNextLevel(); await sleep(2500);
    }
    const out = { state: g.state, tries };
    if (g.state !== 'standard') return out;
    g.timeLeft = 900;
    // Walk and turn for a while, so the pool holds panners of every age and direction.
    for (let i = 0; i < 26; i++) { g.timeLeft = 900; g.input(['up', 'left', 'up', 'right', 'right', 'up'][i % 6]); await sleep(260); }
    await sleep(600);
    // Somewhere the exit is a few steps off (right beside it, the smallest step swings its direction).
    const away = () => Math.hypot(g.exitPos[0] - g.playerPos[0], g.exitPos[1] - g.playerPos[1]);
    for (let i = 0; i < 40 && away() < 3; i++) { g.timeLeft = 900; g.input(i % 4 === 3 ? 'left' : 'up'); await sleep(260); }
    await sleep(700);
    // How far off straight ahead the exit is, in degrees (to the right is positive).
    const off = () => {
      const dx = g.exitPos[0] - g.playerPos[0]; const dy = g.exitPos[1] - g.playerPos[1];
      let t = Math.atan2(dx, -dy) - (a.facing || 0);
      while (t > Math.PI) t -= 2 * Math.PI; while (t < -Math.PI) t += 2 * Math.PI;
      return t / D;
    };
    // Turn to face it, as the game turns you: small glided steps.
    const from = a.facing || 0; const turn = off() * D;
    out.turned = +(turn / D).toFixed(1);
    const steps = Math.max(1, Math.round(Math.abs(turn) / (6 * D)));
    for (let i = 1; i <= steps; i++) { g._face(from + turn * i / steps); await sleep(17); }
    await sleep(300);
    out.exitAway = +away().toFixed(1);
    // Hear the next beeps, one at a time, with the background and the rest held back.
    const beeps = [];
    const op = a.play.bind(a);
    let last = null;
    // (Only the beep is let through: the level's credit, its background and the clock's
    // countdown would be measured with it.)
    if (g.timeCredit) { if (g.timeCredit.channel) g.timeCredit.channel.stop(); g.timeCredit = null; }
    // (And the beep's own direct sound first: the room's echo of it is the room's, measured after.)
    let dryOnly = true;
    a.play = (name, opts) => { if (!/^prox_/.test(name)) return null; last = performance.now(); return op(name, dryOnly ? { ...opts, send: 0 } : opts); };
    const hush = () => { for (const v of [...a.live]) if (v.loop) v.stop(); };
    for (let n = 0; n < 9; n++) {
      dryOnly = n < 6;
      g.timeLeft = 900; hush();
      // Start listening just after a beep has gone, so the next one is caught whole.
      last = null;
      let t0 = performance.now();
      while (last === null && performance.now() - t0 < 4000) await sleep(5);
      await sleep(200); hush();
      const stop = rec(a);
      last = null;
      t0 = performance.now();
      while (last === null && performance.now() - t0 < 4000) await sleep(5);
      await sleep(190);
      const s = sides(stop());
      s.off = +off().toFixed(1);
      (dryOnly ? beeps : (out.withEcho = out.withEcho || [])).push(s);
    }
    a.play = op;
    out.beeps = beeps;
    g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu();
    return out;
  }, [mode, D]);
  if (lab.state !== 'standard') { console.log(`SKIP ${mode}: no labyrinth came up (${lab.state})`); continue; }
  const good = lab.beeps.filter((s) => s.found && Math.abs(s.off) < 1 && Math.abs(s.onset10) <= 1.5 && Math.abs(s.onset30) <= 1.5);
  check(lab.beeps.length >= 5 && good.length === lab.beeps.length,
    `${mode}: facing the exit (${lab.exitAway} away, after a turn of ${lab.turned} degrees) each beep starts in the middle: ` + lab.beeps.map((s) => `${s.onset10}/${s.onset30}`).join(', ') + ' dB (first 10 / 30 ms)'
    + (good.length === lab.beeps.length ? '' : ' ' + JSON.stringify(lab.beeps)));
  console.log(`     (${mode}: the same beep with the room's echo of it, which leans as the room does: ` + (lab.withEcho || []).map((s) => `${s.onset10}/${s.onset30}/${s.all}`).join(', ') + ' dB, first 10 ms / first 30 ms / all of it)');
}

check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
