// The Water Park (web 7.0.0): its parks, its clock, each attraction's token and its
// mistake, the gate to the next park, and the Water Park stage of Chaos Mode. Run:
// serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/park.mjs http://localhost:8790
// It cannot hear: it checks what plays, where, and what the game does.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8790';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/api\.github|ERR_FAILED|CORS/.test(m.text())) errors.push(m.text()); });
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 120000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio;
  const t = window.__t = { said: [], played: [], proto: Object.getPrototypeOf(g) };
  const play = a.play.bind(a);
  a.play = (name, opts) => { t.played.push(name); return play(name, opts); };
  const speak = g.tts.speak.bind(g.tts);
  g.tts.speak = (text, o) => { if (text) t.said.push(text); return speak(text, o); };
  t.frames = async (seconds, dt = 1 / 30) => { for (let i = 0; i < Math.round(seconds / dt); i++) { g.frame(dt); if (i % 15 === 0) await new Promise((r) => setTimeout(r, 1)); } };
  t.start = (key) => {
    if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); }
    g.menuIndex = g.menuKeys.indexOf(key); g.input('enter'); g.frame(1 / 30);
  };
  // Face a place and walk to it, a step at a time (the frames between steps).
  // (inside: keep going inside an attraction, as under the water; otherwise stop on entering one.)
  t.walkTo = async (pos, near = 1.5, inside = false) => {
    const was = !!(g.pk && (g.pk.at || g.pk.ride)); const pk0 = g.pk;
    for (let i = 0; i < 200; i++) {
      const dx = pos[0] - g.playerPos[0]; const dy = pos[1] - g.playerPos[1];
      if (Math.hypot(dx, dy) < near) return true;
      g._turnStop(); g._face(Math.atan2(dx, -dy), true);
      g.input('up');
      g.frame(1 / 30);
      if (!g.pk || g.state !== 'park' || g.pk !== pk0) return true;
      if (!inside && !was && (g.pk.at || g.pk.ride)) return true;
      if (inside && !g.pk.at) return true;
    }
    return false;
  };
});

// ------------------------------------------------------------------ the menu and the start
const menu = await page.evaluate(() => window.__el.game.menuKeys);
check(menu.indexOf('park') === menu.indexOf('abyss') + 1 && menu.indexOf('park') < menu.indexOf('ultimate'), 'Water Park is on the main menu after The Abyss: ' + menu.join(', '));
const start = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start('park');
  await t.frames(1.0);
  const pk = g.pk;
  return { state: g.state, park: pk.park, count: pk.count, clock: Math.round(g.timeLeft), kinds: pk.attractions.map((x) => x.kind),
    amb: pk.amb && pk.amb.voice && pk.amb.voice.name, said: [...t.said], turns: g._turnsNow(),
    near: Math.min(...pk.attractions.map((x) => Math.hypot(x.pos[0], x.pos[1]))) };
});
check(start.state === 'park' && start.park === 1 && start.count === 3, `a run starts in park 1 with 3 attractions: ${start.kinds.join(', ')}`);
check(new Set(start.kinds).size === 3, 'the first park\'s three attractions are three different kinds');
check(start.clock >= 128 && start.clock <= 130, `park 1's clock is 40 + 3 x 30 = 130 seconds: ${start.clock}`);
check(start.amb === 'wp_park', 'the park\'s own air plays');
check(start.said.includes('Level 1.'), 'the voice says the level: ' + start.said.join(' | '));
check(start.turns, 'the park turns with you');
check(start.near >= 23, 'no attraction is right where you start');

const sizes = await page.evaluate(async () => {
  const m = await import('./js/modes/park.js');
  return { a: [1, 2, 3, 6].map((p) => m.attractionsFor(p)), c: [1, 2, 3, 13, 20].map((p) => m.clockFor(p)), bends: [1, 2, 9, 20].map((p) => m.bendsFor(p)),
    deal: [...Array(200)].map(() => m.dealKinds(4)).every((d) => new Set(d).size === 4), deal6: m.dealKinds(6) };
});
check(JSON.stringify(sizes.a) === '[3,4,5,8]', 'one more attraction in every park: ' + sizes.a.join(', '));
check(sizes.c[0] === 130 && sizes.c[1] === 40 + 29 * 4 && sizes.c[3] === 40 + 18 * 15 && sizes.c[4] === 40 + 18 * 22, 'the clock: 30 a park\'s attraction, one less each park, never under 18: ' + sizes.c.join(', '));
check(JSON.stringify(sizes.bends) === '[3,4,10,10]', 'a slide\'s bends: 3, one more each park, at most 10: ' + sizes.bends.join(', '));
check(sizes.deal, 'every kind comes once before any comes twice');

// ------------------------------------------------------------------ each attraction
// A park made of one kind at a time, so each can be played on its own.
async function only(kind) {
  return page.evaluate(async (kind) => {
    const g = window.__el.game; const t = window.__t;
    t.start('park');
    await t.frames(0.2);
    const pk = g.pk;
    for (const at of pk.attractions) if (at.voice) { at.voice.stop(); at.voice = null; }
    pk.attractions = [];
    g._pkLayout([kind]);
    pk.count = 1;
    t.played.length = 0; t.said.length = 0;
    return pk.attractions[0].pos;
  }, kind);
}

// The slide: climb, steer, splash, token.
await only('slide');
const slide = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const pk = g.pk;
  const at = pk.attractions[0];
  g.frame(1 / 30);
  const heard = t.played.includes('stairs_beacon') || (at.voice && at.voice.name === 'stairs_beacon');
  await t.walkTo(at.pos);
  const riding = !!pk.ride;
  const pauseBlocked = g.mode.blockPause(g);
  const clock0 = g.timeLeft;
  let rideTime = 0;
  // Steer right at every bend but one, which is missed.
  let bends = 0; let missed = 0; let swung = [];
  for (let i = 0; i < 30 * 40 && pk.ride; i++) {
    g.frame(1 / 30); rideTime += 1 / 30;
    const r = pk.ride;
    if (r && r.cue && r.cue.answered === null && r.cue.t < 0.3) {
      const rush = r.rush; swung.push([r.cue.side, rush ? +(rush.l - rush.r).toFixed(2) : null]);
      if (bends === 1) { g.input(r.cue.side === 'left' ? 'right' : 'left'); missed += 1; } else g.input(r.cue.side);
      bends += 1;
    }
  }
  return { heard, riding, pauseBlocked, bends, missed, swung, done: at.done, won: pk.won, exit: !!pk.exit, lost: +(clock0 - g.timeLeft - rideTime).toFixed(1),
    played: [...new Set(t.played)], said: [...t.said] };
});
check(slide.heard, 'the slide is heard by its staircase beacon');
check(slide.riding && slide.pauseBlocked, 'walking up to it starts the ride, and a pause waits until it is over');
check(slide.bends === 3 && slide.swung.every(([s, d]) => (s === 'left' ? d > 0.3 : d < -0.3)), 'three bends, the rush swinging to the bend\'s side before each: ' + JSON.stringify(slide.swung));
check(slide.played.includes('stairs_climb') && slide.played.includes('wp_rush') && slide.played.includes('evt_water_splash') && slide.played.includes('wp_token') && slide.played.includes('boundary'),
  'the climb, the rush, a bump at the missed bend, the splash, the token: ' + slide.played.join(', '));
check(slide.lost > 1.8 && slide.lost < 2.3, `the missed bend cost 2 seconds, besides the ride's own time: ${slide.lost}`);
check(slide.done && slide.won === 1 && slide.exit, 'the token is won at the splash, and with the park\'s only token the gate opens');
check(slide.said.includes('The exit is open.'), 'the voice says the gate is open: ' + slide.said.join(' | '));

// The gate: the clock stops, and walking through it is the next park, bigger.
const gate = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const pk = g.pk;
  const c0 = g.timeLeft; await t.frames(2.0); const still = g.timeLeft === c0;
  const ex = pk.exit; const morse = ex.voice && ex.voice.name;
  await t.walkTo(ex.pos, 0.5);
  const n = g.pk;
  return { still, morse, park: n.park, count: n.count, clock: Math.round(g.timeLeft), parks: n.parks, said: [...t.said], amb: n.amb && n.amb.voice && n.amb.voice.busy };
});
check(gate.still, 'the clock stops once the gate is open');
check(gate.morse === 'exit_morse', 'the gate is heard by the battle exit\'s Morse signal');
check(gate.park === 2 && gate.count === 4 && gate.parks === 1, `walking through it: park 2, with 4 attractions (parks finished: ${gate.parks})`);
check(gate.clock === 40 + 29 * 4, 'park 2\'s own clock, nothing carried on: ' + gate.clock);
check(gate.amb, 'the park\'s air plays on into the next park');
check(gate.said.includes('Level 2.'), 'the voice says level 2');

// The diving pool: out of breath first (the whistle), then the token.
await only('dive');
const dive = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const pk = g.pk;
  const at = pk.attractions[0];
  await t.frames(2.5);
  const board = t.played.includes('wp_board');
  await t.walkTo(at.pos);
  const diving = !!(pk.at && pk.at.kind === 'dive');
  await t.frames(0.6);
  const under = pk.at && pk.at.under && pk.at.under.name;
  const ping = pk.at && pk.at.ping && pk.at.ping.name;
  const c0 = g.timeLeft;
  await t.frames(16);
  const out = { saidD: [...t.said], board, diving, under, ping, back: !pk.at, lowAir: t.said.includes('Low air.'), whistle: t.played.includes('wp_whistle'),
    lost: +(c0 - g.timeLeft).toFixed(1), onBoard: Math.hypot(g.playerPos[0] - at.pos[0], g.playerPos[1] - at.pos[1]) < 0.01, done1: at.done };
  // Again: step off the board, back onto it, and swim to it.
  t.played.length = 0;
  g.frame(1 / 30);
  out.notAgain = !pk.at;
  g.playerPos = [at.pos[0] + 5, at.pos[1]]; g.frame(1 / 30);
  await t.walkTo(at.pos);
  await t.frames(0.6);
  const tok = pk.at && pk.at.token;
  if (tok) await t.walkTo(tok, 0.5, true);
  await t.frames(0.1);
  out.strokes = t.played.filter((n) => n.startsWith('ut_dive_stroke')).length;
  out.done = at.done; out.token = t.played.includes('wp_token');
  return out;
});
check(dive.board, 'the diving pool is heard by its board');
check(dive.diving && dive.under === 'underwater' && dive.ping === 'event_beacon_bell', 'walking onto the board dives in: the water all round, the token\'s bell');
check(dive.lowAir && dive.whistle && dive.back && dive.onBoard && !dive.done1, 'out of breath: Low air, then the whistle, and back up at the board without the token: ' + JSON.stringify([dive.lowAir, dive.whistle, dive.back, dive.onBoard, dive.done1, dive.saidD]));
check(dive.lost > 20 && dive.lost < 23, `the whistle cost 5 seconds besides the 16 played: ${dive.lost}`);
check(dive.notAgain, 'standing on the board after coming up does not dive again until you step off it');
check(dive.strokes > 0 && dive.done && dive.token, `swimming to the token takes it (${dive.strokes} strokes)`);

// The wave pool: a step into a breaking wave carries you back; standing still holds.
await only('wave');
const wave = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const pk = g.pk;
  const at = pk.attractions[0];
  await t.walkTo(at.pos);
  const inPool = !!(pk.at && pk.at.kind === 'wave');
  const w = pk.at;
  // Wade in three steps, then wait for a wave and step into it as it breaks.
  for (let i = 0; i < 3; i++) { g.input('up'); g.frame(1 / 30); }
  const before = g._pkWaveLocal(w)[0];
  at.next = 0; g.frame(1 / 30);
  const waveSound = t.played.includes('wp_wave');
  for (let i = 0; i < 30 && (!w.wave || w.wave.t < 0.7); i++) g.frame(1 / 30);
  g.input('up'); g.frame(1 / 30);
  const after = pk.at ? g._pkWaveLocal(w)[0] : -99;
  // Then stand still through a wave.
  at.next = 0; g.frame(1 / 30);
  const p0 = [...g.playerPos];
  for (let i = 0; i < 45; i++) g.frame(1 / 30);
  const held = Math.hypot(g.playerPos[0] - p0[0], g.playerPos[1] - p0[1]) < 0.01;
  // Then wade across between the waves.
  for (let i = 0; i < 400 && !at.done; i++) {
    const wv = w.wave;
    if (!(wv && wv.t > 0.2 && wv.t < 1.1)) { g._face(Math.atan2(at.axis[0], -at.axis[1]), true); g.input('up'); }
    g.frame(1 / 30);
  }
  return { inPool, before: +before.toFixed(1), after: +after.toFixed(1), waveSound, held, done: at.done, wades: t.played.filter((n) => n.startsWith('ut_water_step')).length };
});
check(wave.inPool && wave.waveSound, 'walking into the wave pool, and its waves');
check(wave.after < wave.before - 4, `a step into a breaking wave carries you back: ${wave.before} -> ${wave.after}`);
check(wave.held, 'standing still as a wave breaks holds your ground');
check(wave.done && wave.wades > 3, `wading across between the waves takes the token (${wave.wades} steps)`);

// The tipping bucket: caught under the dump (the whistle), then in just after a dump.
await only('bucket');
const bucket = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const pk = g.pk;
  const at = pk.attractions[0];
  at.phase = 'fill'; at.t = 0;
  await t.frames(1.0);
  const fill = at.voice && at.voice.name;
  // Stand under it just before the dump.
  at.t = 5.6; g.playerPos = [at.pos[0] + 3.5, at.pos[1]];
  const c0 = g.timeLeft;
  await t.frames(0.6);
  const caught = { dump: t.played.includes('wp_bucket_dump'), whistle: t.played.includes('wp_whistle'), d: Math.hypot(g.playerPos[0] - at.pos[0], g.playerPos[1] - at.pos[1]), lost: +(c0 - g.timeLeft).toFixed(1), done: at.done };
  // Wait for the next dump, then dash in.
  while (at.phase !== 'dump') g.frame(1 / 30);
  while (at.phase === 'dump') g.frame(1 / 30);
  await t.walkTo(at.pos, 0.5);
  await t.frames(1.3);
  return { fill, caught, done: at.done, token: t.played.includes('wp_token') };
});
check(bucket.fill === 'wp_bucket_fill', 'the bucket is heard filling');
check(bucket.caught.dump && bucket.caught.whistle && bucket.caught.d > 8 && !bucket.caught.done, `caught under the dump: the whistle, pushed back (${bucket.caught.d.toFixed(1)} away)`);
check(bucket.caught.lost > 5 && bucket.caught.lost < 6, `the whistle cost 5 seconds: ${bucket.caught.lost}`);
check(bucket.done && bucket.token, 'in just after a dump, and a moment under it: the token');

// ------------------------------------------------------------------ the voice: all recordings
const voice = await page.evaluate(() => {
  const b = window.__el.game.tts.bella;
  const lines = ['Level 1.', 'Level 12.', '2 to go.', '1 to go.', 'The exit is open.', 'Missed.', 'Low air.', 'Level 3. 2 of 5 found.', 'All 4 found.', '0 of 3 found.'];
  return lines.map((l) => [l, b.canSay(l)]);
});
check(voice.every(([, ok]) => ok), 'every line said in a park is a recording: ' + voice.filter(([, ok]) => !ok).map(([l]) => l).join(' | '));

// ------------------------------------------------------------------ closing time
const closing = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start('park');
  await t.frames(0.2);
  g.pk.parks = 2; g.pk.tokens = 9;
  g.timeLeft = 0.5; t.played.length = 0; t.said.length = 0;
  await t.frames(1.0);
  return { state: g.state, bell: t.played.includes('wp_bell'), said: t.said.join(' | '), best: g.scores.scores.park };
});
check(closing.state === 'game_over' && closing.bell, 'closing time ends the visit, with the bell');
check(/Closing time\. You finished 2 parks and won 9 tokens\./.test(closing.said) && closing.best === 2, 'the score is the parks finished, on the Water Park board: ' + closing.said);

// ------------------------------------------------------------------ Chaos
const chaos = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  const { CHAOS_STAGE_WEIGHTS } = await import('./js/modes/chaos.js');
  t.start('chaos');
  await t.frames(0.2);
  const out = { weight: CHAOS_STAGE_WEIGHTS.park };
  // A water park comes next.
  g._chaosPickNext = () => 'park';
  g.chaosParkSize = null; g.chaosParkCount = 0;     // (the run's first level may have been a park already)
  g._chaosBeginGap(); await t.frames(0.3);
  delete g._chaosPickNext;
  out.state = g.state; out.count = g.pk && g.pk.count; out.chaos = g.pk && g.pk.chaos;
  out.amb = g.pk && g.pk.amb && g.pk.amb.voice && g.pk.amb.voice.name;
  // Every token but by the rules: each one won is 15 seconds.
  const c0 = g.timeLeft;
  for (const at of [...g.pk.attractions]) { g._pkQuiet(at); g._pkToken(at); }
  out.added = Math.round(g.timeLeft - c0);
  out.exit = !!g.pk.exit; out.won = g.chaosMode && g._chaosExitOpen();
  const c1 = g.timeLeft; await t.frames(2.0); out.waits = g.timeLeft === c1;
  out.ambAtExit = !!(g.pk.amb && g.pk.amb.voice && g.pk.amb.voice.busy && g.pk.amb.voice.l > 0.5);
  const amb = g.pk.amb.voice;
  const pts = g.chaosPoints;
  await t.walkTo(g.pk.exit.pos, 0.5);
  await t.frames(0.5);
  out.next = g.state; out.points = g.chaosPoints - pts; out.ambFades = !!amb.fadingOut || !amb.busy;
  // The next water park in the run has one more attraction.
  g._chaosPickNext = () => 'park';
  g._chaosBeginGap(); await t.frames(0.3);
  out.count2 = g.pk && g.pk.count;
  g.pk.chaos && (g.chaosParkSize = 6); g._chaosBeginGap(); await t.frames(0.3);
  out.count3 = g.pk && g.pk.count;
  return out;
});
check(chaos.weight === 1, 'a water park comes up in Chaos as often as an abyss');
check(chaos.state === 'park' && chaos.chaos && chaos.count === 3 && chaos.amb === 'wp_park', 'a chaos water park: three attractions, the park\'s air');
check(chaos.added === 45, `each token is 15 seconds on the chaos clock: ${chaos.added}`);
check(chaos.exit && chaos.won && chaos.waits, 'every token won: the exit, and the chaos clock waits');
check(chaos.ambAtExit, 'the park\'s air plays on when the exit opens');
check(chaos.next !== 'park' && chaos.points === 10 && chaos.ambFades, `through the exit: the next level, ten points, the park's air fading under it (now ${chaos.next})`);
check(chaos.count2 === 4 && chaos.count3 === 6, `the next water park has one more attraction, at most six: ${chaos.count2}, ${chaos.count3}`);

check(errors.length === 0, 'no errors in the page' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
