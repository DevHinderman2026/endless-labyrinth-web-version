// The Abyss (web 6.2.0), played by script in a real browser engine.
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/abyss.mjs http://localhost:8790
// What is checked: the menu, board and help; the start (clock, lives, creatures,
// cases, the glass); creatures moving only while you move (creeping to a walk,
// charging to a run, from their own hearing distances, freezing when you stop);
// the lightning (where it lands, the creatures running to it, five seconds in which
// your steps are not heard, how often it comes); the glass cases (the bell, the
// smash, the time, the charge it brings, the cover, lightning cases, the odds);
// catches, lives, the end of a run and the time running out; one more creature
// every three cases; an endless floor; the report in recorded words; and Chaos's
// Abyss stages (lightning on arrival, the quota, the exit with everything else gone,
// the clock waiting, the points, the lives of their own). It cannot hear.

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
  const t = window.__t = { said: [], played: [], at: [], seq: [], pick: 0 };
  const play = a.play.bind(a);
  a.play = (name, opts) => { t.played.push(name); if (opts && opts.at) t.at.push([name, opts.at]); return play(name, opts); };
  const speak = g.tts.speak.bind(g.tts);
  g.tts.speak = (text, o) => { if (text) t.said.push(text); return speak(text, o); };
  const pick = g._chaosPickNext.bind(g);
  t.realPick = pick;
  g._chaosPickNext = (w) => (t.seq.length ? t.seq[t.pick++ % t.seq.length] : pick(w));
  t.frames = (seconds, dt = 1 / 30) => { for (let i = 0; i < Math.round(seconds / dt); i++) g.frame(dt); };
  t.menu = () => { if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); } };
  t.start = (key, seq = []) => { t.menu(); t.seq = seq; t.pick = 0; t.said.length = 0; g.menuIndex = g.menuKeys.indexOf(key); g.input('enter'); g.frame(1 / 30); };
  t.loops = () => [...a.live].filter((v) => v.loop && v.busy && !v.fadingOut).map((v) => v.name);
  // A quiet abyss to test in: no lightning due, every creature and case placed by hand.
  t.calm = () => { const ab = g.ab; ab.nextStrike = 1e9; ab.cover = 0; ab.grace = 0; if (g.timeLeft < 900) g.timeLeft = 999; };
  t.put = (c, x, y) => { c.x = x; c.y = y; c.charge = 0; c.storm = 0; c.move = 0; };
  // Beside a case and facing it (from the south, facing north).
  t.lineUp = (c) => { g.playerPos = [c.x, c.y + 3]; g._turnStop(); g._face(0, true); g.updateAbyss(1 / 30); };
});

// ------------------------------------------------------------------ menu, board, help
const setup = await page.evaluate(async () => {
  const g = window.__el.game;
  const { HELP } = await import('./js/game.js');
  return { menu: g.menuOptions.slice(), keys: g.menuKeys.slice(), lines: g._scoreLines(), names: HELP.map(([n]) => n),
    demos: (HELP.find(([n]) => n === 'Demos, The Abyss') || [0, []])[1].map((i) => i.sound).filter((s) => s) };
});
const mi = (k) => setup.keys.indexOf(k);
check(mi('abyss') === mi('findvoice') + 1 && mi('ultimate') === mi('abyss') + 1 && mi('chaos') === mi('ultimate') + 1, 'The Abyss comes after Find the Voice on the main menu: ' + setup.menu.join(', '));
check(setup.lines.some((l) => /^The Abyss: No score yet$/.test(l)), 'The Abyss has its own high score board');
check(setup.names.includes('The Abyss') && setup.names.includes('Demos, The Abyss'), 'help has a section for The Abyss and its demos');
const demoOk = await page.evaluate((sounds) => sounds.map((s) => [s, window.__el.audio.has(s)]), setup.demos);
check(demoOk.length >= 7 && demoOk.every(([, ok]) => ok), 'every demo has its sound: ' + JSON.stringify(demoOk));

// ------------------------------------------------------------------ the start
const start = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start('abyss');
  const ab = g.ab;
  const out = { state: g.state, time: g.timeLeft, lives: ab.lives, creatures: ab.creatures.length, cases: ab.cases.length,
    turns: g._turnsNow(), said: t.said.slice(), next: ab.nextStrike };
  out.creatureD = ab.creatures.map((c) => Math.hypot(c.x - g.playerPos[0], c.y - g.playerPos[1]));
  out.caseD = ab.cases.map((c) => Math.hypot(c.x - g.playerPos[0], c.y - g.playerPos[1]));
  t.played.length = 0;
  g.input('up'); g.frame(1 / 30);
  out.step = t.played.filter((n) => /^ut_glass_step_/.test(n)).length;
  out.bg = ab.amb && ab.amb.name;
  return out;
});
check(start.state === 'abyss' && Math.abs(start.time - 60) < 0.1 && start.lives === 3, 'a run begins with sixty seconds and three lives: ' + JSON.stringify([start.time, start.lives]));
check(start.creatures === 3 && start.creatureD.every((d) => d >= 29.9 && d <= 60.1), 'three creatures, 30 to 60 units away: ' + start.creatureD.map((d) => d.toFixed(0)).join(', '));
check(start.cases === 3 && start.caseD.every((d) => d >= 24.9 && d <= 55.1), 'three glass cases, 25 to 55 units away');
check(start.turns && start.next >= 5.9 && start.next <= 10, 'it turns with you, and the first lightning comes 6 to 10 seconds in: ' + start.next.toFixed(1));
check(start.step === 1 && /howling_wind/.test(start.bg), 'every step is on glass; the air is a howling wind: ' + start.bg);
check(!start.said.length, 'nothing is said as a run begins');

// ------------------------------------------------------------------ creatures move only while you move
const moves = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const ab = g.ab;
  t.calm();
  g.playerPos = [0, 0]; g._turnStop(); g._face(0, true);
  const [a, b, c] = ab.creatures;
  t.put(a, 0, 24); t.put(b, 0, -45); t.put(c, 200, 0);    // a: in a walk's hearing; b: only a run's; c: neither (and too far: replaced)
  const out = {};
  // While you stand still they only wander: slowly, never toward you.
  const dist = (x) => Math.hypot(x.x - g.playerPos[0], x.y - g.playerPos[1]);
  const d0 = [dist(a), dist(b)]; const p0 = [[a.x, a.y], [b.x, b.y]];
  t.frames(2.0);
  out.wanderSpeed = Math.max(Math.hypot(a.x - p0[0][0], a.y - p0[0][1]), Math.hypot(b.x - p0[1][0], b.y - p0[1][1])) / 2.0;
  out.neverCloser = dist(a) >= d0[0] - 1e-6 && dist(b) >= d0[1] - 1e-6;
  out.notHunting = !a.moving && !b.moving && a.wandering;
  t.put(a, 0, 24); t.put(b, 0, -45);
  // One walking step (north): a creeps toward it for 0.6 s, b does not hear it.
  g.input('down');                                     // a step back, to the south
  const a0 = [a.x, a.y]; const b0 = [b.x, b.y];
  t.frames(0.3); out.aMoving = a.moving; out.creep = Math.hypot(a.x - a0[0], a.y - a0[1]) / 0.3;
  out.bStayed = !b.moving;
  t.frames(0.5); const a1 = [a.x, a.y]; t.frames(1.0);
  out.aFrozen = !a.moving && Math.hypot(a.x - a1[0], a.y - a1[1]) <= 1.5 + 1e-6;
  // A run's step (as the game marks one): b hears it now, and charges.
  g.strideStepping = 'up'; g.input('up'); g.strideStepping = null;
  const b1 = [b.x, b.y]; t.frames(0.2);
  out.charge = Math.hypot(b.x - b1[0], b.y - b1[1]) / 0.2;
  t.frames(0.5); const b2 = [b.x, b.y]; t.frames(1.0);
  out.bFrozen = !b.moving && Math.hypot(b.x - b2[0], b.y - b2[1]) <= 1.5 + 1e-6;
  out.replaced = !ab.creatures.includes(c) && ab.creatures.length === 3;
  out.footsteps = t.at.filter(([n]) => /^ut_glass_step_/.test(n)).length;
  return out;
});
check(moves.wanderSpeed > 0.5 && moves.wanderSpeed <= 1.5 + 1e-6 && moves.neverCloser && moves.notHunting, 'while you stand still they only wander, 30 steps a minute, never toward you: ' + moves.wanderSpeed.toFixed(2));
check(moves.aMoving && Math.abs(moves.creep - 4.5) < 0.3 && moves.bStayed, 'a walking step: creatures within ten steps creep toward it (90 steps a minute); one further off does not hear it: ' + moves.creep.toFixed(2));
check(moves.aFrozen && moves.bFrozen, 'then they stop hunting, and only wander, until they hear you again');
check(Math.abs(moves.charge - 11) < 0.3, 'a running step is heard from twenty steps, and they charge, 220 steps a minute (your run is 280): ' + moves.charge.toFixed(2));
check(moves.footsteps >= 2, 'a moving creature makes a footstep on the glass from where it is');
check(moves.replaced, 'a creature far behind is gone, and another appears nearer');

const keep = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const ab = g.ab;
  t.calm(); g.playerPos = [0, 0];
  let nearest = 1e9;
  for (let k = 0; k < 40; k++) {
    for (const [i, c] of ab.creatures.entries()) { const a = (i + k) * 1.7; t.put(c, Math.sin(a) * 12, -Math.cos(a) * 12); c.heading = a + Math.PI; c.turnIn = 1e9; }
    for (let f = 0; f < 120; f++) { ab.grace = 0; g.updateAbyss(1 / 30); for (const c of ab.creatures) nearest = Math.min(nearest, Math.hypot(c.x, c.y)); }
  }
  return { nearest, lives: ab.lives };
});
check(keep.nearest >= 9 - 1e-6 && keep.lives === 3, 'a wandering creature turns away before it comes within three steps of you, so it never catches you while you are still: nearest ' + keep.nearest.toFixed(2));

// ------------------------------------------------------------------ lightning
const storm = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const ab = g.ab;
  const mod = await import('./js/modes/abyss.js');
  t.calm(); g.playerPos = [0, 0];
  const [a, b, c] = ab.creatures;
  t.put(a, 0, 20); t.put(b, 30, 0); t.put(c, -150, 0);
  t.at.length = 0;
  ab.nextStrike = 0; g.updateAbyss(1 / 30);
  const out = { cover: ab.cover, strike: ab.strike, d: Math.hypot(ab.strike[0], ab.strike[1]) };
  out.thunder = t.at.filter(([n]) => /thunder/.test(n)).map(([, p]) => p);
  out.ducked = g._abDuckFactor();
  out.pinned = [1, 2, 3, 4].every((k) => [...window.__el.audio.pins.values()].includes(`dry:event_sfx_file_ab_thunder_${k}`));
  const names = []; for (let k = 0; k < 12; k++) { ab.nextStrike = 0; g.updateAbyss(1 / 30); names.push(ab.lastThunder); }
  out.varied = new Set(names).size >= 3 && names.every((x, i) => i === 0 || x !== names[i - 1]);
  out.storm = [a.storm > 0, b.storm > 0, c.storm > 0];
  const da = Math.hypot(a.x - ab.strike[0], a.y - ab.strike[1]);
  t.frames(1.0);
  out.toward = Math.hypot(a.x - ab.strike[0], a.y - ab.strike[1]) < da;
  // Your steps under the cover are not heard.
  const bm = b.move; g.input('up'); out.coveredStep = b.move === bm || b.storm > 0;
  t.frames(4.5); out.coverAfter = ab.cover;
  // After the cover: heard again.
  t.put(a, g.playerPos[0], g.playerPos[1] + 20); a.storm = 0;
  g.input('up'); out.heardAgain = a.move > 0;
  out.gaps = [mod.strikeGap(0), mod.strikeGap(3), mod.strikeGap(9), mod.strikeGap(30), mod.strikeGap(300)];
  out.next = ab.nextStrike;
  return out;
});
check(storm.cover === 5 && storm.d >= 24.9 && storm.d <= 45.1, 'lightning strikes 25 to 45 units off, and covers your steps for five seconds: ' + storm.d.toFixed(1));
check(storm.thunder.length === 1 && Math.hypot(storm.thunder[0][0] - storm.strike[0], storm.thunder[0][1] - storm.strike[1]) < 0.01, 'the thunder is heard from where it strikes');
check(storm.ducked < 0.5 && storm.pinned && storm.varied, 'each strike is one of four thunderclaps, never the same twice running; the wind and hums dip under it; the claps are held in memory: ' + JSON.stringify([storm.ducked, storm.pinned, storm.varied]));
check(storm.storm[0] && storm.storm[1] && !storm.storm[2] && storm.toward, 'creatures near the strike run toward it; one far off does not: ' + JSON.stringify(storm.storm));
check(storm.coveredStep, 'a step during the cover is not heard');
check(storm.coverAfter === 0 && storm.heardAgain, 'once the five seconds are over, your steps are heard again');
check(JSON.stringify(storm.gaps) === JSON.stringify([[6, 10], [7, 12], [9, 16], [16, 20], [20, 20]]), 'strikes every 6 to 10 seconds, less often every three cases, never more than 20 apart: ' + JSON.stringify(storm.gaps));

// ------------------------------------------------------------------ glass cases
const cases = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const ab = g.ab;
  const mod = await import('./js/modes/abyss.js');
  const out = {};
  t.calm();
  g.playerPos = [0, 0];
  const c = ab.cases[0];
  c.x = 0; c.y = -40; c.near = false; c.value = 20; c.lightning = false;
  for (const x of ab.creatures) t.put(x, 500, 500);
  g.updateAbyss(1 / 30);
  out.hum = !!(c.voice && c.voice.busy);
  t.played.length = 0; t.frames(2.0);
  out.knock = t.played.filter((n) => n === 'event_case_knock').length;
  // Lined up: the bell, once.
  t.played.length = 0;
  t.lineUp(c);
  out.bell = t.played.filter((n) => n === 'evt_chime_clear').length;
  // Creatures: one within hearing of the smash, one beyond.
  const [a, b] = ab.creatures;
  t.put(a, c.x + 45, c.y + 3); t.put(b, c.x + 300, c.y);   // (45 units: three seconds of its charge cannot reach you)
  const time0 = g.timeLeft; t.said.length = 0; t.played.length = 0;
  g.input('space');
  out.smash = t.played.includes('ut_glass_smash');
  out.time = +(g.timeLeft - time0).toFixed(2);
  out.said = t.said.slice();
  out.charge = [a.charge, b.charge];
  out.smashed = ab.smashed;
  out.refilled = ab.cases.filter((x) => !x.smashed).length;
  const a0 = Math.hypot(a.x - g.playerPos[0], a.y - g.playerPos[1]);
  t.frames(1.0);
  out.closer = Math.hypot(a.x - g.playerPos[0], a.y - g.playerPos[1]) < a0 - 9;
  t.frames(2.5); out.chargeOver = a.charge <= 0;
  // A smash under the lightning's cover: no charge.
  const d = ab.cases.find((x) => !x.smashed); d.value = 10; d.lightning = false;
  t.put(a, d.x + 20, d.y); ab.cover = 3; ab.grace = 1;
  t.lineUp(d); ab.cover = 3; g.input('space');
  out.coveredSmash = a.charge === 0;
  // A lightning case: a strike instead of a charge.
  const e = ab.cases.find((x) => !x.smashed); e.value = 10; e.lightning = true;
  ab.cover = 0; t.put(a, e.x + 20, e.y); t.lineUp(e);
  t.played.length = 0; ab.grace = 1; g.input('space');
  out.lightningCase = t.played.some((n) => /thunder/.test(n)) && a.charge === 0 && a.storm > 0;
  // Nothing in reach: a click.
  ab.cover = 0; g.playerPos = [5000, 5000]; g.updateAbyss(1 / 30);
  t.played.length = 0; g.input('space'); out.click = t.played.includes('empty_click');
  // The odds.
  const n = { 10: 0, 20: 0, 30: 0, 60: 0 };
  for (let i = 0; i < 40000; i++) n[mod.rollReward()] += 1;
  out.odds = n;
  out.creaturesFor = [0, 2, 3, 6, 9, 12, 30].map((k) => mod.creaturesFor(k));
  return out;
});
check(cases.hum && cases.knock >= 1, 'a case hums where it stands, and knocks as you close in');
check(cases.bell === 1, 'beside it and facing it, the bell rings once');
check(cases.smash && cases.time === 20 && cases.said.includes('20 more seconds.'), 'the attack smashes it: its time is yours, and the voice says how much: ' + JSON.stringify([cases.time, cases.said]));
check(cases.charge[0] === 3 && cases.charge[1] === 0 && cases.closer && cases.chargeOver, 'the smash brings every creature in hearing charging for three seconds: ' + JSON.stringify(cases.charge));
check(cases.refilled === 3, 'a new case appears in its place, so three are always around');
check(cases.coveredSmash, 'a smash under the lightning\'s cover brings no charge');
check(cases.lightningCase, 'a lightning case sends a strike, and the creatures run to it instead of you');
check(cases.click, 'with nothing in reach, the attack clicks');
const o = cases.odds; const sh = (k) => o[k] / 40000;
check(Math.abs(sh(10) - 0.62) < 0.02 && Math.abs(sh(20) - 0.25) < 0.02 && Math.abs(sh(30) - 0.10) < 0.015 && Math.abs(sh(60) - 0.03) < 0.01, 'cases give 10 seconds mostly, sometimes 20 or 30, rarely 60: ' + JSON.stringify(o));
check(JSON.stringify(cases.creaturesFor) === JSON.stringify([3, 3, 4, 5, 6, 7, 7]), 'one more creature every three cases, at most seven: ' + JSON.stringify(cases.creaturesFor));

// ------------------------------------------------------------------ endless, the report
const far = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const ab = g.ab;
  t.calm(); g.playerPos = [0, 0]; g._turnStop(); g._face(0, true);
  for (const x of ab.creatures) t.put(x, 9000, 9000);
  t.played.length = 0;
  for (let i = 0; i < 80; i++) { ab.grace = 1; g.input('up'); g.frame(1 / 30); }
  const out = { y: g.playerPos[1], boundary: t.played.includes('boundary') };
  out.creaturesNear = ab.creatures.every((c) => Math.hypot(c.x - g.playerPos[0], c.y - g.playerPos[1]) < 85);
  out.casesNear = ab.cases.filter((c) => !c.smashed).every((c) => Math.hypot(c.x - g.playerPos[0], c.y - g.playerPos[1]) < 110);
  t.said.length = 0; g.input('enter'); out.report = t.said[t.said.length - 1];
  out.canSay = window.__el.speech.bella ? window.__el.speech.bella.canSay(out.report) : null;
  out.canSayCaught = window.__el.speech.bella ? ['Caught. 2 lives left.', '10 more seconds.', '60 more seconds.'].every((x) => window.__el.speech.bella.canSay(x)) : null;
  return out;
});
check(Math.abs(far.y + 240) < 0.01 && !far.boundary, 'the abyss has no edge: eighty steps north, and no boundary');
check(far.creaturesNear && far.casesNear, 'creatures and cases are always around you, wherever you go');
check(/^Glass cases: 3\. 3 lives left\. Clock \d+ seconds\. Facing north\.$/.test(far.report), 'the report: ' + far.report);
check(far.canSay !== false && far.canSayCaught !== false, 'the report and the mode\'s lines are all in the recorded voice: ' + JSON.stringify([far.canSay, far.canSayCaught]));

// ------------------------------------------------------------------ catches and the end
const end = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const ab = g.ab;
  const out = {};
  t.calm();
  const c = ab.creatures[0];
  t.put(c, g.playerPos[0], g.playerPos[1] + 1); t.said.length = 0;
  g.updateAbyss(1 / 30);
  out.first = [ab.lives, t.said.slice(), Math.hypot(c.x - g.playerPos[0], c.y - g.playerPos[1])];
  out.allStill = ab.creatures.every((x) => x.charge === 0 && x.storm === 0 && x.move === 0);
  // The grace: no second catch at once.
  t.put(ab.creatures[1], g.playerPos[0], g.playerPos[1] + 1); g.updateAbyss(1 / 30);
  out.grace = ab.lives;
  ab.grace = 0; g.updateAbyss(1 / 30); out.second = ab.lives;
  ab.grace = 0; t.put(ab.creatures[2], g.playerPos[0], g.playerPos[1] + 1); g.updateAbyss(1 / 30);
  out.state = g.state; out.over = t.said.slice(-1)[0];
  out.loops = t.loops();
  return out;
});
check(end.first[0] === 2 && end.first[1].includes('Caught. 2 lives left.') && end.first[2] >= 44.9, 'a catch costs a life, and the creature is thrown far off: ' + JSON.stringify(end.first));
check(end.allStill && end.grace === 2 && end.second === 1, 'the others hold still, and there is a moment\'s grace before another catch');
check(end.state === 'game_over' && /^Game Over\. You smashed 3 glass cases\. /.test(end.over), 'the third catch ends the run; the score is the cases smashed: ' + end.over);
check(!end.loops.length, 'nothing is left playing after the run: ' + end.loops.join(', '));

const timeUp = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  t.start('abyss'); t.calm();
  for (const x of g.ab.creatures) t.put(x, 9000, 9000);
  g.timeLeft = 0.5; t.frames(1.0);
  return [g.state, t.said.slice(-1)[0]];
});
check(timeUp[0] === 'game_over' && /^Time up\. You smashed 0 glass cases\. /.test(timeUp[1]), 'when the clock runs out: ' + timeUp[1]);

// ------------------------------------------------------------------ Chaos
const chaos = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  t.start('chaos', ['abyss', 'abyss', 'standard']);
  const ab = g.ab;
  const out = { state: g.state, chaos: ab && ab.chaos, quota: ab && ab.quota, lives: ab && ab.lives, cover: ab && ab.cover,
    thunder: t.played.some((n) => /thunder/.test(n)), saidLevel: t.said.some((s) => /Abyss|Level/.test(s)) };
  // The creatures wander here too, never toward you, never within three steps.
  { const c0 = ab.creatures[0]; ab.cover = 0; for (const s of ab.creatures) s.storm = 0;
    t.put(c0, g.playerPos[0], g.playerPos[1] - 12); c0.heading = Math.PI; c0.turnIn = 1e9;
    let nearest = 1e9; const p0 = [c0.x, c0.y];
    for (let f = 0; f < 90; f++) { g.updateAbyss(1 / 30); nearest = Math.min(nearest, Math.hypot(c0.x - g.playerPos[0], c0.y - g.playerPos[1])); }
    out.chaosWander = { moved: Math.hypot(c0.x - p0[0], c0.y - p0[1]), nearest, hunting: c0.moving }; }
  t.calm(); const ticks0 = g.timeLeft; for (const x of ab.creatures) t.put(x, 9000, 9000);
  t.frames(1.0); out.ticks = +(ticks0 - g.timeLeft).toFixed(2);
  // A case adds to the chaos clock.
  const c = ab.cases[0]; c.value = 30; c.lightning = false; t.lineUp(c);
  const tc = g.timeLeft; g.input('space'); out.caseTime = +(g.timeLeft - tc).toFixed(2);
  // The rest of the quota.
  while (!ab.exit) { const d = ab.cases.find((x) => !x.smashed); d.lightning = false; t.lineUp(d); ab.cover = 1; g.input('space'); }
  out.exitLoops = t.loops();
  out.creatures = ab.creatures.length;
  const t1 = g.timeLeft; t.frames(2.0); out.waits = g.timeLeft === t1;
  g.input('enter'); out.report = t.said[t.said.length - 1];
  const pts = g.chaosPoints;
  const ex = ab.exit; g.playerPos = [ex.pos[0], ex.pos[1] + 4.5]; g._turnStop(); g._face(0, true); g.input('up');
  out.gap = g.state; out.points = g.chaosPoints - pts;
  t.frames(1.0);
  const ab2 = g.ab;
  out.second = { state: g.state, quota: ab2 && ab2.quota, count: g.chaosAbyssCount };
  // Catches use the stage's own lives, for the whole run.
  t.calm(); ab2.grace = 0; t.put(ab2.creatures[0], g.playerPos[0], g.playerPos[1] + 1); g.updateAbyss(1 / 30);
  out.stageLives = [ab2.lives, g.chaosAbyssLives];
  ab2.grace = 0; t.put(ab2.creatures[1], g.playerPos[0], g.playerPos[1] + 1); g.updateAbyss(1 / 30);
  ab2.grace = 0; t.put(ab2.creatures[2], g.playerPos[0], g.playerPos[1] + 1); g.updateAbyss(1 / 30);
  out.end = [g.state, t.said.slice(-1)[0]];
  return out;
});
check(chaos.state === 'abyss' && chaos.chaos && (chaos.quota === 3 || chaos.quota === 4) && chaos.lives === 3, 'Chaos has Abyss stages: a quota of 3 or 4 the first time, three lives: ' + JSON.stringify([chaos.quota, chaos.lives]));
check(chaos.chaosWander.moved > 1 && chaos.chaosWander.nearest >= 9 - 1e-6 && !chaos.chaosWander.hunting, 'in Chaos too, the creatures wander while you are still, never within three steps: ' + JSON.stringify(chaos.chaosWander));
check(chaos.thunder && chaos.cover > 4.9 && !chaos.saidLevel, 'lightning strikes the moment you arrive, and nothing says which stage it is');
check(chaos.ticks > 0.9 && chaos.caseTime === 30, 'the chaos clock runs, and a case adds its time to it');
check(chaos.exitLoops.length === 1 && chaos.exitLoops[0] === 'exit_morse' && chaos.creatures === 0, 'the quota smashed, every creature goes and only the exit is heard: ' + chaos.exitLoops.join(', '));
check(chaos.waits && /^All [34] glass cases\. 3 lives left\. Clock \d+ seconds\. \d+ points total\. Facing north\.$/.test(chaos.report), 'the clock waits for you to reach the exit; the report: ' + chaos.report);
check(chaos.gap === 'chaos_gap' && chaos.points === 10, 'through the exit: ten points, and the next stage');
check(chaos.second.state === 'abyss' && chaos.second.quota === Math.min(8, chaos.quota + 1) && chaos.second.count === 2, 'the next Abyss stage wants one case more: ' + JSON.stringify(chaos.second));
check(chaos.stageLives[0] === 2 && chaos.stageLives[1] === 2, 'a catch costs one of the stage\'s own lives');
check(chaos.end[0] === 'game_over' && /^Caught\. You scored \d+ points\. /.test(chaos.end[1]), 'losing all three ends the chaos run: ' + chaos.end[1]);

check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
