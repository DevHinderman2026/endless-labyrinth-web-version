// Web 6.3.3 (Russell, 21 November 2026), played by script in a real browser engine.
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/web633.mjs http://localhost:8790
// What is checked:
// - The elevator's chime, and any placed sound: it starts from its own place. An HRTF
//   panner crossfades from where it last played to where it is put, over about 45
//   milliseconds, so a panner handed on from the pool (6.3.1) while still pointing
//   somewhere else started the next sound there: a chime on the right began on the
//   left. Measured at the game's output, the chime's first milliseconds must be louder
//   in the ear on its side, in the modes heard in 3D and in Ultimate Mode's world.
// - A chime ringing again and again from one place still reuses its panners, and in a
//   labyrinth no panner is unplugged while you stand there, as in 6.3.1.
// - Ultimate Mode (and Chaos's worlds): at most three of an area's chasers come for you at
//   once; the others wait their turn four steps off and never strike; shoot one and the
//   next comes. A returning cartridge goes first to the battle or island area you are in.
// - The Abyss: only the nearest case knocks (the others hum, softer), until it is smashed
//   or another is two steps nearer; one case in four holds lightning, and in The Abyss
//   itself one in ten an extra life, with no limit on lives.
// - The loudness (the static on an iPhone): the limiter's own makeup gain is undone after
//   it, so below its threshold the mix passes at its own level and a mix over full scale
//   comes out under it; and a sound's muffled copy plays through its clean copy's HRTF
//   panner, one panner for the two instead of two.

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
  // Right ear over left ear, in decibels, at the sound's onset and later on.
  const sides = ([L, R]) => {
    let peak = 0; for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const th = peak * 0.05; let i0 = -1;
    for (let i = 0; i < L.length; i++) if (Math.abs(L[i]) > th || Math.abs(R[i]) > th) { i0 = i; break; }
    const e = (x, a, b) => { let s = 0; for (let i = a; i < Math.min(b, x.length); i++) s += x[i] * x[i]; return s; };
    const db = (v) => 10 * Math.log10(v + 1e-12);
    const w = (ms) => Math.round(ms * 44.1);
    const d = (a, b) => +(db(e(R, i0 + w(a), i0 + w(b))) - db(e(L, i0 + w(a), i0 + w(b)))).toFixed(1);
    return { found: i0 >= 0, peak: +peak.toFixed(3), onset10: d(0, 10), onset45: d(0, 45), later: d(60, 400) };
  };
  // The game's own settings for the engine, put back after the checks that change them.
  const a = window.__el.audio;
  const own = { binaural: a.binaural, relOf: a.relOf, turns: a.turns };
  const restore = () => { a.stopAll(); Object.assign(a, own); };
  window.__c = { sleep, rec, sides, restore };
});

// ------------------------------------------------------------------ 1. the chime starts from its own place (3D modes)
const bin = await page.evaluate(async () => {
  const { sleep, rec, sides } = window.__c;
  const a = window.__el.audio; const mod = await import('./js/audio.js');
  a.stopAll(); a.binaural = true; a.turns = false; a.relOf = (p) => p;
  const out = {};
  for (const [name, from, to] of [['elevator_ding', [-1, 0], [1, 0]], ['elevator_ding', [1, 0], [-1, 0]], ['elevator_arrive_1', [-1, 0], [1, 0]]]) {
    // Two chimes on one side; their panners go back to the pool four seconds after.
    a.play(name, { at: from });
    await sleep(400);
    a.play(name, { at: from });
    await sleep(5800);
    const s0 = { ...mod.pannerStats };
    const stop = rec(a);
    await sleep(250);
    a.play(name, { at: to });
    await sleep(800);
    const r = sides(stop());
    r.made = mod.pannerStats.made - s0.made; r.reused = mod.pannerStats.reused - s0.reused;
    out[`${name} ${from[0] < 0 ? 'left' : 'right'} then ${to[0] < 0 ? 'left' : 'right'}`] = r;
    await sleep(5000);
  }
  window.__c.restore();
  return out;
});
for (const [k, r] of Object.entries(bin)) {
  const want = k.endsWith('right') ? 1 : -1;
  check(r.found && r.onset10 * want >= 3 && r.onset45 * want >= 3 && r.later * want >= 3,
    `3D modes, ${k}: the onset is louder in the ear on the chime's side (right over left, dB: first 10 ms ${r.onset10}, first 45 ms ${r.onset45}, after ${r.later}; panners made ${r.made}, reused ${r.reused})`);
}

// ------------------------------------------------------------------ 2. the same in the 3D world (Ultimate Mode's engine)
const sp = await page.evaluate(async () => {
  const { sleep, rec, sides } = window.__c;
  const a = window.__el.audio; const mod = await import('./js/audio.js');
  a.stopAll(); a.binaural = false; a.spatialOn(); a.setFacing(0, true);
  const out = {};
  for (const [from, to] of [[[-4, 0], [4, 0]], [[0, 3], [0, -3]]]) {
    a.play('elevator_ding', { pos: from });
    await sleep(400);
    a.play('elevator_ding', { pos: from });
    await sleep(5800);
    const s0 = { ...mod.pannerStats };
    const stop = rec(a);
    await sleep(250);
    a.play('elevator_ding', { pos: to });
    await sleep(800);
    const r = sides(stop());
    r.made = mod.pannerStats.made - s0.made; r.reused = mod.pannerStats.reused - s0.reused;
    out[JSON.stringify([from, to])] = r;
    await sleep(5000);
  }
  a.spatialOff({ now: true });
  window.__c.restore();
  return out;
});
const [lr, ba] = Object.values(sp);
check(lr.found && lr.onset10 >= 3 && lr.onset45 >= 3 && lr.later >= 3,
  `Ultimate's world, a chime on the right after two on the left: its onset is on the right (dB: ${lr.onset10}, ${lr.onset45}, after ${lr.later}; made ${lr.made}, reused ${lr.reused})`);
check(ba.found && Math.abs(ba.onset10) <= 3 && Math.abs(ba.onset45) <= 3 && Math.abs(ba.later) <= 3,
  `Ultimate's world, a chime ahead after two behind: it is centred from its first moment (dB: ${ba.onset10}, ${ba.onset45}, after ${ba.later})`);

// ------------------------------------------------------------------ 3. one place, again and again: the panners are reused
const again = await page.evaluate(async () => {
  const { sleep } = window.__c;
  const a = window.__el.audio; const mod = await import('./js/audio.js');
  a.stopAll(); a.binaural = true; a.relOf = (p) => p;
  const s0 = { ...mod.pannerStats };
  for (let i = 0; i < 10; i++) { a.play('elevator_ding', { at: [0.6, -0.8] }); await sleep(1600); }
  await sleep(500);
  window.__c.restore();
  return { made: mod.pannerStats.made - s0.made, reused: mod.pannerStats.reused - s0.reused };
});
check(again.made + again.reused <= 20 && again.made <= 8 && again.reused >= 10, `a chime ringing ten times from one place reuses its panners (6.3.5: in the modes heard in 3D its muffled copy has its own again): ${again.made} made, ${again.reused} reused`);

// ------------------------------------------------------------------ 4. a labyrinth: no panner unplugged, few made
await page.evaluate(() => {
  const g = window.__el.game;
  g.menuIndex = g.menuKeys.indexOf('standard'); g.input('enter');
  g.grid.clear(); g.playerPos = [0, 0]; g.exitPos = [7, 9]; g.timeCredit = null;
  window.__keep = setInterval(() => { g.timeLeft = Math.max(g.timeLeft || 0, 500); }, 200);
});
await page.waitForTimeout(3000);
const l0 = await page.evaluate(async () => { const mod = await import('./js/audio.js'); return { ...window.__m, ...mod.pannerStats }; });
await page.waitForTimeout(8000);
// Walk about while the exit beeps, so its direction keeps changing.
await page.evaluate(async () => {
  const g = window.__el.game; const { sleep } = window.__c;
  for (let i = 0; i < 40; i++) { g._face((i % 12) * Math.PI / 6, true); await sleep(250); }
});
// (6.3.4, Russell: "the popping is back in standard mode".) Walk about for forty seconds
// too: the exit's beep keeps coming from new directions, and still nothing is unplugged
// (6.3.3 unplugged 42 panners in a minute's walk, dropping them from a full pool).
await page.evaluate(async () => {
  const g = window.__el.game; const { sleep } = window.__c;
  for (let i = 0; i < 160; i++) { const k = i % 7; g.input(k < 4 ? 'up' : (k < 6 ? 'left' : 'right')); await sleep(250); }
});
const l1 = await page.evaluate(async () => { const mod = await import('./js/audio.js'); return { ...window.__m, ...mod.pannerStats }; });
check(l1.cut - l0.cut === 0, `standing, turning and walking in a labyrinth, no panner is unplugged from the mix: ${l1.cut - l0.cut}`);
check(l1.dropped - l0.dropped === 0, `nor dropped from a full pool: ${l1.dropped - l0.dropped}`);
check(l1.reused - l0.reused >= 20, `the exit's beeps are placed, each on panners from the pool or new ones: ${l1.reused - l0.reused} reused`);
check(l1.made - l0.made <= 64, `walking about, no more panners are made than the pool holds (64), and after that they are reused (6.3.4): ${l1.made - l0.made} made, ${l1.reused - l0.reused} reused`);
await page.evaluate(() => { clearInterval(window.__keep); const g = window.__el.game; g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); });

// ------------------------------------------------------------------ 5. Ultimate: three chasers at once
const crowd = await page.evaluate(async () => {
  const g = window.__el.game;
  g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter');
  const u = g.ut; const M = await import('./js/modes/ultimate.js');
  for (let n = 0; n < 12 && !u.world.areas.some((x) => x.kind === 'battle'); n++) {
    u.worldTime = 0.05; for (let i = 0; i < 60; i++) g.updateUltimateMode(1 / 30);
    await new Promise((r) => setTimeout(r, 50));
  }
  const area = u.world.areas.find((x) => x.kind === 'battle');
  if (!area) return { skipped: true };
  const W = await import('./js/modes/ultimate/world.js');
  const mid = area.floorCells[Math.floor(area.floorCells.length / 2)];
  g.playerPos = W.posOf(mid[0], mid[1]); u.area = area; u.place = 'world';
  g._utRefreshRooms(); g._utListenerMix();
  u.bus = null; u.busAt = null;
  u.enemies = u.enemies.filter((e) => e.area !== area);
  const mk = (dx, dy) => ({ kind: 'chaser', area, x: g.playerPos[0] + dx, y: g.playerPos[1] + dy, speed: 2.2, soundIdx: 0, soundName: 'obstacle_0', voice: null, goal: null, goalTimer: 0 });
  const ring = [[14, 0], [-14, 0], [0, 14], [0, -14], [10, 10], [-10, 10], [10, -10], [-10, -10]];
  for (const [dx, dy] of ring) u.enemies.push(mk(dx, dy));
  u.hp = 1000; u.safe = 0; u.hitCooldown = 0; u.respawn = new Map();
  const strikes = [];
  const hurt = g._utHurt.bind(g);
  g._utHurt = (by) => { strikes.push(!!(by && (by.coming || by.hunter))); u.hitCooldown = 0; return hurt(by); };
  let mostComing = 0; let nearestWaiting = 1e9; let waitedOnce = false;
  const mine = () => u.enemies.filter((e) => e.area === area && e.kind === 'chaser');
  for (let i = 0; i < 30 * 12; i++) {
    u.worldTime = 1000; u.hp = 1000;
    g.updateUltimateMode(1 / 30);
    const list = mine();
    const coming = list.filter((e) => e.coming || e.hunter);
    mostComing = Math.max(mostComing, coming.length);
    for (const e of list) if (!e.coming && !e.hunter) { waitedOnce = true; nearestWaiting = Math.min(nearestWaiting, Math.hypot(e.x - g.playerPos[0], e.y - g.playerPos[1])); }
  }
  // Shoot one that is coming: another takes its place.
  const before = mine().filter((e) => e.coming).length;
  const victim = mine().find((e) => e.coming);
  g._utKillEnemy(victim, 'laser');
  g.updateUltimateMode(1 / 30);
  const after = mine().filter((e) => e.coming).length;
  g._utHurt = hurt;
  // A returning cartridge goes to the battle area you are in, when it has none.
  const places = [];
  for (let k = 0; k < 6; k++) {
    for (const p of [...u.pickups]) if (p.kind === 'ammo' && p.area === area) { if (p.voice) p.voice.stop(); u.pickups.splice(u.pickups.indexOf(p), 1); }
    u.timers = [{ at: 0.01, kind: 'ammo' }];
    u.worldTime = 1000;
    g._utTimers(0.05);
    const got = u.pickups.filter((p) => p.kind === 'ammo' && p.area === area);
    places.push(got.length);
  }
  const left = mine().length;
  return { skipped: false, mostComing, nearestWaiting: +nearestWaiting.toFixed(1), waitedOnce, strikes: strikes.length, strikesByComing: strikes.every((x) => x), before, after, left, places, keepOff: M.CHASER_KEEP_OFF, atOnce: M.CHASERS_AT_ONCE };
});
if (crowd.skipped) console.log('SKIP no battle area found');
else {
  check(crowd.atOnce === 3 && crowd.mostComing === 3 && crowd.waitedOnce, `at most three of an area's eight chasers come for you at once (most ${crowd.mostComing})`);
  check(crowd.nearestWaiting >= crowd.keepOff - 1.5, `the others wait their turn, never nearer than about four steps (nearest ${crowd.nearestWaiting} units)`);
  check(crowd.strikes >= 1 && crowd.strikesByComing, `only those coming for you strike (${crowd.strikes} strikes)`);
  check(crowd.before === 3 && crowd.after === 3 && crowd.left === 7, `shoot one and the next comes: ${crowd.before} coming before, ${crowd.after} after, ${crowd.left} left`);
  check(crowd.places.every((n) => n === 1), `a returning cartridge comes back in the battle area you are in, when it has none: ${crowd.places.join(' ')}`);
}
await page.evaluate(() => { const g = window.__el.game; g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); });

// ------------------------------------------------------------------ 6. The Abyss: one knocking case; lightning and lives
const abyss = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio;
  const AB = await import('./js/modes/abyss.js'); const UT = await import('./js/modes/ultimate.js');
  g.menuIndex = g.menuKeys.indexOf('abyss'); g.input('enter'); if (g.state === 'abyss_menu') g.input('enter');
  const ab = g.ab;
  // The odds, over many cases.
  const roll = (chaos) => { ab.chaos = chaos; let l = 0; let life = 0; const n = 4000; for (let i = 0; i < n; i++) { const c = g._abNewCase(); if (c.lightning) l += 1; if (c.life) life += 1; ab.cases.splice(ab.cases.indexOf(c), 1); } ab.chaos = false; return { l: l / n, life: life / n }; };
  const odds = roll(false); const chaosOdds = roll(true);
  // Three cases, only the nearest knocks.
  for (const c of ab.cases) if (c.voice) { c.voice.stop(); c.voice = null; }
  for (const c of ab.creatures) { if (c.voice) c.voice.stop(); c.voice = null; }
  ab.creatures = [];
  const [px, py] = g.playerPos;
  const mkCase = (dx, dy) => ({ x: px + dx, y: py + dy, smashed: false, voice: null, knockT: 0, near: false, value: 10, lightning: false, life: false });
  ab.cases = [mkCase(20, 0), mkCase(-26, 0), mkCase(0, 32)];
  const knocks = [];
  const orig = a.play.bind(a);
  a.play = (n, o) => { if (n === UT.CASE_KNOCK) knocks.push(o && o.at ? o.at.join(',') : '?'); return orig(n, o); };
  for (let i = 0; i < 90; i++) g._abUpdateCases(1 / 30);
  const first = new Set(knocks);
  // Another case only 3 units nearer than the knocking one: the knocking stays put.
  knocks.length = 0;
  g.playerPos = [px - 4.5, py];   // now 24.5 from the first, 21.5 from the second
  for (let i = 0; i < 90; i++) g._abUpdateCases(1 / 30);
  const stays = new Set(knocks);
  // Two steps nearer: it moves over.
  knocks.length = 0;
  g.playerPos = [px - 8, py];     // now 28 from the first, 18 from the second
  for (let i = 0; i < 90; i++) g._abUpdateCases(1 / 30);
  const moved = new Set(knocks);
  a.play = orig;
  // An extra life, over three, said with the seconds.
  g.playerPos = [px, py];
  const said = [];
  const speak = g.tts.speak.bind(g.tts);
  g.tts.speak = (t, o) => { said.push(t); return speak(t, o); };
  const played = [];
  const op = a.play.bind(a);
  a.play = (n, o) => { played.push(n); return op(n, o); };
  ab.lives = 3;
  const c1 = mkCase(1, 0); c1.life = true; ab.cases = [c1]; g._abSmash(c1);
  const c2 = mkCase(1, 0); c2.life = true; c2.value = 20; ab.cases = [c2]; g._abSmash(c2);
  a.play = op; g.tts.speak = speak;
  const lives = ab.lives;
  g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu();
  return { odds, chaosOdds, first: [...first], stays: [...stays], moved: [...moved], firstAt: `${px + 20},${py}`, secondAt: `${px - 26},${py}`, lives, said, heart: played.includes(AB.AB_LIFE_SOUND), consts: [AB.AB_LIGHTNING_CASE, AB.AB_LIFE_CASE] };
});
check(abyss.consts[0] === 0.3 && abyss.consts[1] === 0.05, 'The Abyss: lightning in three cases in ten (8.1.0), an extra life in one in twenty (6.3.4)');
check(Math.abs(abyss.odds.l - 0.3) < 0.03 && Math.abs(abyss.odds.life - 0.05) < 0.015, `over 4000 cases: lightning ${abyss.odds.l.toFixed(3)}, extra lives ${abyss.odds.life.toFixed(3)}`);
check(Math.abs(abyss.chaosOdds.l - 0.3) < 0.03 && abyss.chaosOdds.life === 0, `in Chaos's Abyss: lightning ${abyss.chaosOdds.l.toFixed(3)} as well (8.1.4: three in ten), and no extra lives`);
check(abyss.first.length === 1 && abyss.first[0] === abyss.firstAt, 'of three cases in range, only the nearest knocks: ' + JSON.stringify(abyss.first));
check(abyss.stays.length === 1 && abyss.stays[0] === abyss.firstAt, 'another case a little nearer does not take the knocking over: ' + JSON.stringify(abyss.stays));
check(abyss.moved.length >= 1 && abyss.moved[abyss.moved.length - 1] === abyss.secondAt, 'two steps nearer, it does: ' + JSON.stringify(abyss.moved));
check(abyss.lives === 5 && abyss.heart && abyss.said.includes('Extra life, 4 lives.') && abyss.said.includes('Extra life, 5 lives.') && !abyss.said.some((x) => /more seconds/.test(x)), 'an extra life: the heart and the lives said (8.0.4: not the seconds), and no limit (' + abyss.lives + ' lives): ' + JSON.stringify(abyss.said));

// ------------------------------------------------------------------ 7. the limiter adds nothing below its threshold
const lim = await page.evaluate(async () => {
  const mod = await import('./js/audio.js');
  const run = async (amp) => {
    const sr = 44100; const n = sr; const ctx = new OfflineAudioContext(2, n, sr);
    const { out } = mod.outChain(ctx, 1.0);
    const osc = ctx.createOscillator(); osc.frequency.value = 440;
    const g = ctx.createGain(); g.gain.value = amp; osc.connect(g); g.connect(out); osc.start();
    const d = (await ctx.startRendering()).getChannelData(0);
    let s = 0; let pk = 0; for (let i = n / 2; i < n; i++) { s += d[i] * d[i]; pk = Math.max(pk, Math.abs(d[i])); }
    return { db: +(20 * Math.log10(Math.sqrt(s / (n / 2)) / (amp / Math.SQRT2))).toFixed(2), peak: +pk.toFixed(3) };
  };
  return { quiet: await run(0.1), near: await run(0.6), loud: await run(1.0), hot: await run(2.0) };
});
check(Math.abs(lim.quiet.db) <= 0.3 && lim.near.db <= 0.3 && lim.near.db >= -1.5, `below its threshold the limiter adds nothing (its own makeup gain is undone): ${lim.quiet.db} dB quiet, ${lim.near.db} dB just under it`);
check(lim.loud.peak < 1.0 && lim.hot.peak < 1.0, `a mix at or over full scale comes out under it: peaks ${lim.loud.peak} and ${lim.hot.peak}`);

// ------------------------------------------------------------------ 8. a muffled copy plays through its clean copy's panner
const share = await page.evaluate(async () => {
  const { sleep } = window.__c;
  const a = window.__el.audio; const mod = await import('./js/audio.js');
  const out = {};
  for (const mode of ['binaural', 'spatial']) {
    a.stopAll();
    if (mode === 'spatial') { a.binaural = false; a.spatialOn(); a.setFacing(0, true); } else { a.binaural = true; a.relOf = (p) => p; }
    const s0 = { ...mod.pannerStats };
    const v = mode === 'spatial' ? a.play('elevator_ding', { pos: [3, -4] }) : a.play('elevator_ding', { at: [0.6, -0.8] });
    await sleep(150);
    out[mode] = { dull: !!(v && v.dull), shared: !!(v && v.dull && v.dull.shared && v.dull.panner === v.dry.panner),
      took: mod.pannerStats.made + mod.pannerStats.reused - s0.made - s0.reused };
    await sleep(3500);
    if (mode === 'spatial') a.spatialOff({ now: true });
  }
  window.__c.restore();
  return out;
});
check(share.binaural.dull && !share.binaural.shared && share.binaural.took === 2
  && (!share.spatial.dull || share.spatial.shared) && share.spatial.took === 1,
  `in Ultimate's world a sound's muffled copy plays through its clean copy's panner, one HRTF panner for the two; in the other 3D modes each has its own, as before 6.3.3 (6.3.5): ${JSON.stringify(share)}`);

check(errors.length === 0, 'no page errors: ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
