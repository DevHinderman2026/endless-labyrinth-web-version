// Chaos Mode's two new kinds of stage (web 6.0.0): Find the Voice, and a world of
// Ultimate Mode (website only). Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/chaos60.mjs http://localhost:8790
// What is checked: how often each kind comes up; a Find the Voice stage's quota
// (3 or 4, one more each time, never over 8), its lives for the whole run, its
// exit (everything else gone, the clock waiting) and the end of a run by a third
// catch; a world stage's length, its time credits in glass cases, its points,
// its slides' thirty seconds, its ammo carried to the next world stage, and its
// end going straight on to the next stage. It cannot hear.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8790';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 90000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
await page.evaluate(() => {
  const g = window.__el.game; const a = window.__el.audio;
  const proto = Object.getPrototypeOf(g);
  const t = window.__t = { said: [], played: [], seq: [], pick: 0, proto };
  const play = a.play.bind(a);
  a.play = (name, opts) => { t.played.push(name); return play(name, opts); };
  const speak = g.tts.speak.bind(g.tts);
  g.tts.speak = (text, o) => { if (text) t.said.push(text); return speak(text, o); };
  g._chaosPickNext = () => t.seq[t.pick++ % t.seq.length];
  t.frames = (seconds, dt = 1 / 30) => { for (let i = 0; i < Math.round(seconds / dt); i++) g.frame(dt); };
  t.start = (seq) => {
    if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); }
    t.seq = seq; t.pick = 0; t.said.length = 0;
    g.menuIndex = g.menuKeys.indexOf('chaos'); g.input('enter'); g.frame(1 / 30);
  };
  t.loops = () => [...a.live].filter((v) => v.loop && v.busy && !v.fadingOut).map((v) => v.name);
  // Find her, wherever she is calling from (the floor cleared of glass first).
  t.find = () => {
    const fv = g.fv;
    fv.glass.clear();
    if (fv.guide.phase !== 'calling') { fv.pause = 0; if (fv.chime) fv.chime.stop(); fv.chime = null; g.updateFindVoice(1 / 30); }
    // (From the side the room's middle is on: from beyond her when she stands near the
    // south edge, the step would begin outside the room and be stopped by its boundary,
    // and the find never came. The Fable review, 6.1.0: this failed one run in five.)
    const south = fv.guide.pos[1] <= 0;
    g.playerPos = [fv.guide.pos[0], fv.guide.pos[1] + (south ? 7.5 : -7.5)]; g._turnStop(); g._face(south ? 0 : Math.PI, true);
    g.input('up');
  };
  t.reachExit = () => {
    const ex = g.fv.exit;
    const south = ex.pos[1] <= 0;
    g.playerPos = [ex.pos[0], ex.pos[1] + (south ? 4.5 : -4.5)]; g._turnStop(); g._face(south ? 0 : Math.PI, true);
    g.input('up');
  };
});

// ------------------------------------------------------------------ how often
const weights = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  const { CHAOS_STAGE_WEIGHTS } = await import('./js/modes/chaos.js');
  const n = {};
  for (let i = 0; i < 40000; i++) { const k = t.proto._chaosPickNext.call(g); n[k] = (n[k] || 0) + 1; }
  let noWorld = 0;
  for (let i = 0; i < 4000; i++) if (t.proto._chaosPickNext.call(g, 'ultimate') === 'ultimate') noWorld += 1;
  return { n, w: CHAOS_STAGE_WEIGHTS, noWorld };
});
const share = (k) => weights.n[k] / 40000;
check(Object.keys(weights.n).length === 10 && Math.abs(share('abyss') - share('island')) < 0.02 && Math.abs(share('park') - share('island')) < 0.02 && Math.abs(share('museum') - share('island')) < 0.02 && Math.abs(share('findvoice') - share('island')) < 0.02 && share('ultimate') < share('island') * 0.65 && share('ultimate') > 0.04,
  'every kind comes up; Find the Voice and The Abyss as often as an island, a world the rarest: ' + JSON.stringify(weights.n));
check(weights.noWorld === 0, 'a kind can be kept from coming next (no world straight after an island\'s ride up)');

// ------------------------------------------------------------------ a Find the Voice stage
const fv1 = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start(['findvoice', 'findvoice', 'findvoice', 'standard']);
  const fv = g.fv;
  const out = { state: g.state, chaos: fv.chaos, quota: fv.quota, lives: fv.lives, said: t.said.slice(), bg: fv.amb && fv.amb.stem };
  const t0 = g.timeLeft; t.frames(1.0); out.ticks = +(t0 - g.timeLeft).toFixed(2);
  g.input('enter'); out.report = t.said[t.said.length - 1];
  // A catch: 25 of the run's one health bar (web 6.2.0), not a life.
  g.playerPos = [0, 0]; fv.glass.clear(); fv.glass.add('0,0');
  fv.creature.x = 0; fv.creature.y = -6; fv.caughtAt = null;
  const hp0 = g.towerHp;
  for (let i = 0; i < 30 && g.towerHp === hp0; i++) g.updateFindVoice(1 / 30);
  out.afterCatch = [hp0, g.towerHp, fv.lives];
  // 6.1.1: the same longer charge in Chaos: one step on glass and off again, at least 5 seconds.
  fv.caughtAt = null; fv.glass.clear(); fv.glass.add('0,-1');
  g.playerPos = [0, 0]; g._turnStop(); g._face(0, true);
  fv.creature.x = 0; fv.creature.y = 90; g._fvCreatureSound(false);
  g.input('up'); t.frames(1 / 30); g.input('down'); t.frames(1 / 30);
  t.frames(4.4); out.chaosAt45 = fv.creature.state;
  t.frames(0.9); out.chaosAt53 = fv.creature.state;
  fv.glass.clear();
  for (let k = 0; k < fv.quota; k++) t.find();
  out.exit = !!fv.exit;
  out.loops = t.loops();
  out.creature = fv.creature.state;
  const t1 = g.timeLeft; t.frames(2.0); out.waits = g.timeLeft === t1;
  const pts = g.chaosPoints;
  t.reachExit();
  out.gap = g.state;
  out.points = g.chaosPoints - pts;
  t.frames(0.3);
  return out;
});
check(fv1.state === 'findvoice' && fv1.chaos && (fv1.quota === 3 || fv1.quota === 4) && fv1.lives === 3, 'a Find the Voice stage: a quota of 3 or 4 the first time, three lives: ' + JSON.stringify([fv1.quota, fv1.lives]));
check(fv1.bg === 'evt_amb_witch', 'the first Find the Voice stage of a chaos run has the witch\'s air (as the Windows game): ' + fv1.bg);
check(!fv1.said.some((s) => /Level/.test(s)) && /^evt_amb_/.test(fv1.bg) && fv1.ticks > 0.9, 'nothing says which stage it is; an event background; the chaos clock runs: ' + JSON.stringify([fv1.bg, fv1.ticks]));
check(/^0 of [34] found\. 100 health\. Clock \d+ seconds\. 0 points total\. Facing north\.$/.test(fv1.report), 'its report, with the run\'s health: ' + fv1.report);
check(fv1.afterCatch[1] === fv1.afterCatch[0] - 25 && fv1.afterCatch[2] === 3, 'a catch costs 25 of the run\'s health, not a life (6.2.0): ' + JSON.stringify(fv1.afterCatch));
check(fv1.chaosAt45 === 'charge' && fv1.chaosAt53 === 'rest', 'in Chaos too, one step on glass gives a charge of at least 5 seconds (6.1.1): ' + JSON.stringify([fv1.chaosAt45, fv1.chaosAt53]));
check(fv1.exit && fv1.loops.length === 2 && fv1.loops.includes('exit_morse') && fv1.loops.some((n) => /^event_amb_file_/.test(n)) && fv1.creature === 'gone', 'the quota found, the exit appears over the room\'s background, which plays on (6.3.7), and the rest goes: ' + fv1.loops.join(', '));
check(fv1.waits, 'the chaos clock waits until you go through the exit');
check(fv1.gap === 'chaos_gap' && fv1.points === 10, 'through the exit: ten points, and the next stage: ' + JSON.stringify([fv1.gap, fv1.points]));

const fv2 = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  const fv = g.fv;
  const out = { state: g.state, quota: fv.quota, lives: fv.lives, count: g.chaosFvCount, speed: Math.round(fv.creature.speed / 3 * 60) };
  // Up to the most there will ever be.
  g.chaosFvQuota = 8;
  for (let k = 0; k < fv.quota; k++) t.find();
  t.reachExit(); t.frames(0.3);
  out.capped = g.fv && g.fv.quota;
  // Catches until the run's health is gone end it.
  const f3 = g.fv;
  out.hpAfterExits = g.towerHp;
  const catchOnce = () => { g.playerPos = [0, 0]; f3.glass.clear(); f3.glass.add('0,0'); f3.creature.x = 0; f3.creature.y = -6; f3.caughtAt = null; const hp = g.towerHp; for (let i = 0; i < 30 && g.state === 'findvoice' && g.towerHp === hp; i++) g.updateFindVoice(1 / 30); };
  g.towerHp = 40;
  catchOnce(); out.left = g.towerHp;
  catchOnce();
  out.end = { state: g.state, said: t.said[t.said.length - 1], loops: t.loops() };
  return out;
});
check(fv2.state === 'findvoice' && fv2.count === 2, 'the next Find the Voice stage');
check(fv2.quota === [3, 4].map((q) => q + 1).find((q) => q === fv2.quota) && fv2.capped === 8 && fv2.speed === 225, 'its quota is one more each time, never over 8; its creature a little faster: ' + JSON.stringify([fv2.quota, fv2.capped, fv2.speed]));
check(fv2.left === 15 && fv2.end.state === 'game_over' && /^Caught\. You scored \d+ points\. /.test(fv2.end.said) && fv2.end.loops.length === 0, 'a catch that takes the last of the run\'s health ends it: ' + JSON.stringify([fv2.left, fv2.end.said]));

// ------------------------------------------------------------------ a world stage
const w1 = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const t = window.__t;
  const U = await import('./js/modes/ultimate.js');
  t.start(['battle', 'ultimate', 'ultimate', 'standard']);
  g.ammo = 5;                                  // the battle's own shots
  g.nextLevel(); t.frames(0.3);                // into the world stage
  const u = g.ut;
  const out = { state: g.state, chaos: u && u.chaos, spatial: a.spatial, len: u.worldLen, battleAmmo: g.chaosAmmo.battle };
  out.credits = u.pickups.filter((p) => p.kind === 'credit').length;
  out.cases = u.cases.map((c) => c.credit);
  out.enemies = u.enemies.length; out.busAt = u.busAt;
  out.consts = [U.CHAOS_WORLD_ENEMIES, U.CHAOS_WORLD_BUSES, U.CHAOS_SLIDE_TIME];
  // The chaos clock runs in a world.
  const t0 = g.timeLeft; for (let i = 0; i < 30; i++) g.frame(1 / 30); out.ticks = +(t0 - g.timeLeft).toFixed(2);
  // A case: a chaos time credit, and nothing else.
  if (u.cases.length) {
    const c = u.cases[0];
    u.safe = 999;
    const before = g.timeLeft; const pts = u.points;
    g._utSmash(c);
    out.smash = { added: Math.round(g.timeLeft - before), value: c.credit, said: t.said[t.said.length - 1], points: u.points - pts, coin: t.played.includes('credit_chaos') };
  }
  // Points toward the chaos score.
  const cp = g.chaosPoints;
  u.compass.on = false; u.place = 'world';
  const wasArea = u.area; u.area = u.world.areas.find((x) => x.kind !== 'event');
  g._utScore(10);
  u.area = wasArea;
  out.score = { chaos: g.chaosPoints - cp, mul: g._utMultiplier() };
  // A slide: thirty seconds the moment you splash in.
  const before = g.timeLeft;
  const zone = u.world.areas.find((x) => x.kind === 'event');
  u.slide = { sl: { area: zone, pos: [zone.centre[0], zone.centre[1]], pool: [zone.centre[0], zone.centre[1]] }, t: 0, stage: 'down' };
  u.place = 'slide';
  g._utUpdateSlide(5);
  out.slide = Math.round(g.timeLeft - before);
  // The report.
  g.input('enter'); out.report = t.said[t.said.length - 1];
  // The world ends: straight on, carrying its ammo and items; nothing for its end.
  u.ammo = 37; u.items = 6; u.face = Math.PI / 2;
  const before2 = g.chaosPoints;
  u.worldTime = 0.01; g.frame(1 / 30);
  out.after = { state: g.state, spatial: a.spatial, ut: g.ut, face: Math.round(g.tn.face * 180 / Math.PI), points: g.chaosPoints - before2 };
  t.frames(0.3);
  const u2 = g.ut;
  out.next = { state: g.state, ammo: u2 && u2.ammo, items: u2 && u2.items, worlds: u2 && u2.worlds, battle: g.chaosAmmo.battle };
  // A world's end by health: the chaos run ends.
  u2.safe = 0; u2.hitCooldown = 0; u2.hp = 1; u2.compass.on = false; u2.place = 'world';
  g._utHurt('test');
  out.dead = { state: g.state, said: t.said[t.said.length - 1], spatial: a.spatial, loops: t.loops() };
  return out;
});
check(w1.state === 'ultimate' && w1.chaos && w1.spatial && w1.len >= 120 && w1.len <= 300, 'a world stage: a world of Ultimate Mode, 2 to 5 minutes long: ' + Math.round(w1.len));
check(w1.credits === 0 && w1.cases.length >= 2 && w1.cases.length <= 3 && w1.cases.every((v) => [40, 50, 60].includes(v)), 'its credits: 2 or 3, every one a chaos time credit in a glass case: ' + JSON.stringify(w1.cases));
check(w1.consts[0] && w1.consts[1] && w1.enemies > 0, 'Ultimate\'s enemies and buses come along unchanged: ' + JSON.stringify([w1.enemies, w1.busAt]));
check(w1.ticks > 0.9, 'the chaos clock runs in a world');
check(w1.smash && w1.smash.added === w1.smash.value && w1.smash.said === `${w1.smash.value} more seconds.` && w1.smash.points === 0 && w1.smash.coin, 'a case gives its time to the chaos clock, never points: ' + JSON.stringify(w1.smash));
check(w1.score.chaos === 10 && w1.score.mul === 1, 'everything else pays points as in Ultimate Mode, toward the chaos score');
check(w1.slide === 30, 'each water slide adds 30 seconds the moment you splash in: ' + w1.slide);
check(/^\d+ health\. \d+ shots\. \d+ items\. Clock \d+ seconds\. \d+ points total\. Facing [a-z-]+\.$/.test(w1.report), 'its report: ' + w1.report);
check(w1.after.state === 'chaos_gap' && !w1.after.spatial && w1.after.ut === null && w1.after.face === 90 && w1.after.points === 0, 'when the world ends chaos goes straight on, facing as you did, with nothing paid for the end: ' + JSON.stringify(w1.after));
check(w1.next.state === 'ultimate' && w1.next.ammo === 37 && w1.next.items === 6 && w1.next.worlds === 1 && w1.next.battle === 5, 'the next world stage has the ammo and items you left with, kept apart from the battles\' shots, and the multiplier of a world survived: ' + JSON.stringify(w1.next));
check(w1.dead.state === 'game_over' && /^Game Over\. You scored \d+ points\. /.test(w1.dead.said) && !w1.dead.spatial && w1.dead.loops.length === 0, 'health running out in a world ends the chaos run: ' + w1.dead.said);

// ------------------------------------------------------------------ a world after an island's ride up: never
const ride = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  t.start(['standard']);
  g.chaosNext = 'ultimate';
  const name = g._chaosPreviewName('ultimate');
  return { next: g.chaosNext, name };
});
check(ride.next !== 'ultimate' && typeof ride.name === 'string', 'an island\'s ride up never brings a world (it has no one sound to bring in): ' + JSON.stringify(ride));
await page.evaluate(() => { const g = window.__el.game; g._stopRunSounds(); g.runId += 1; g.state = 'menu'; });

check(errors.length === 0, 'no page errors ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
