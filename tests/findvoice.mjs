// Find the Voice (web 6.0.0), played by script in a real browser engine.
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/findvoice.mjs http://localhost:8790
// What is checked: the menu, boards and help; the guide calling (with the device's
// voice and her beacon while Heart is not ready, and with Heart when a source is
// set); reaching her, the chime and the half second; five finds a level; the
// background (the witch first, then event backgrounds only); the glass and the
// creature (its speeds against the run, its charge and its stop, its footsteps,
// the glass kept away from it, the rings round the guide); catches, lives and the
// end; the report. It cannot hear: how it sounds is for a person.

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
  window.T = {
    frames: (seconds, dt = 1 / 30) => { for (let i = 0; i < Math.round(seconds / dt); i++) g.frame(dt); },
    start: (key) => { if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); } g.menuIndex = g.menuKeys.indexOf(key); g.input('enter'); g.frame(1 / 30); },
    said: () => document.getElementById('said').textContent,
    heard: () => {
      const names = []; const at = []; const op = a.play.bind(a);
      a.play = (n, o) => { names.push(n); if (o && o.at) at.push([n, o.at]); return op(n, o); };
      const spoken = []; const sp = window.__el.speech.speak.bind(window.__el.speech);
      window.__el.speech.speak = (t, o) => { if (t) spoken.push(t); return sp(t, o); };
      return { names, at, spoken, stop: () => { a.play = op; window.__el.speech.speak = sp; } };
    },
  };
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ menu, boards, help
const setup = await page.evaluate(async () => {
  const g = window.__el.game;
  const { HELP } = await import('./js/game.js');
  return { menu: g.menuOptions.slice(), keys: g.menuKeys.slice(), lines: g._scoreLines(), names: HELP.map(([n]) => n),
    demos: (HELP.find(([n]) => n === 'Demos, Find the Voice') || [0, []])[1].map((i) => i.sound) };
});
const mi = (k) => setup.keys.indexOf(k);
check(mi('findvoice') === mi('island') + 1 && mi('ultimate') === mi('findvoice') + 1 && mi('chaos') === mi('ultimate') + 1 && mi('events') === mi('chaos') + 1 && mi('event_score') === mi('chaos') + 2 && mi('scores') === mi('chaos') + 3,
  'the main menu ends its modes with Find the Voice, Ultimate Mode, then Chaos Mode: ' + setup.menu.join(', '));
check(setup.lines.some((l) => /^Find the Voice: No score yet$/.test(l)), 'Find the Voice has its own high score board');
check(setup.names.includes('Find the Voice') && setup.names.includes('Demos, Find the Voice'), 'help has a Find the Voice section and its demos');
const demoOk = await page.evaluate(async (sounds) => {
  const a = window.__el.audio;
  await new Promise((r) => setTimeout(r, 1500));
  const out = {};
  for (const s of sounds.filter((x) => x)) { const b = await a.prepare(s); out[s] = !!b && b.duration > 0.5; }
  return out;
}, setup.demos);
check(Object.keys(demoOk).length === 5 && Object.values(demoOk).every((x) => x), 'its five demos play (guide, chime, the creature at rest and charging, a step on glass): ' + JSON.stringify(demoOk));

// ------------------------------------------------------------------ a run: the start
const start = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const T = window.T;
  const L = T.heard();
  T.start('findvoice');
  const fv = g.fv;
  const out = { state: g.state, said: T.said(), turns: g._turnsNow(), bg: fv.amb && fv.amb.stem, room: g._currentRoom(),
    lives: fv.lives, quota: fv.quota, creature: fv.creature.state, cDist: Math.hypot(fv.creature.x, fv.creature.y),
    breath: fv.creature.voice && fv.creature.voice.name, glassNear: 0, gDist: Math.hypot(...fv.guide.pos) };
  for (const k of fv.glass) { const [i, j] = k.split(',').map(Number); if (Math.hypot(i * 3 - fv.creature.x, j * 3 - fv.creature.y) < 24) out.glassNear += 1; }
  T.frames(1.2);
  out.beacon = L.names.includes('event_beacon_shimmer');
  out.spokeCall = L.spoken.length > 0;
  const mod = await import('./js/modes/findvoice-guide.js');
  out.fallback = L.spoken.some((t) => mod.FALLBACK_PHRASES.includes(t));
  // Turning, as Standard turns.
  g.input('right'); T.frames(0.4);
  out.face = Math.round(g.tn.face * 180 / Math.PI);
  g._turnStop(); g._face(0, true);
  // No clock.
  L.spoken.length = 0; g.input('clock'); out.clock = L.spoken.slice();
  // The report.
  g.input('enter'); out.report = T.said();
  L.stop();
  return out;
});
check(start.state === 'findvoice' && start.said === 'Level 1.' && start.turns && start.face === 30, 'Find the Voice starts at level 1 and turns as the walking modes do: ' + JSON.stringify([start.said, start.face]));
check(start.bg === 'evt_amb_witch' && start.room === 'battle', 'level 1 is always the witch\'s background, in the battle arena\'s echo: ' + start.bg + ' ' + start.room);
check(start.lives === 3 && start.quota === 5, 'three lives, five finds a level');
check(start.creature === 'rest' && start.cDist >= 28 && /evt_beast_breathing/.test(start.breath) && start.glassNear === 0,
  'one creature, idle and breathing, far from you, with no glass near it: ' + JSON.stringify([start.cDist.toFixed(1), start.breath]));
check(start.gDist >= 12 && start.gDist <= 22, 'the guide calls from 12 to 22 units away on level 1: ' + start.gDist.toFixed(1));
check(start.beacon && start.fallback, 'without Heart her calls are said by the device\'s voice, with the shimmering beacon placed where she is');
check(start.clock.length === 0, 'there is no clock (T says nothing)');
check(start.report === 'Level 1. 0 of 5 found. 3 lives left. Facing north.', 'the report: ' + start.report);

// ------------------------------------------------------------------ speeds
const speeds = await page.evaluate(async () => {
  const g = window.__el.game; const fv = g.fv;
  const { RUN_STEPS_PER_MINUTE } = await import('./js/game.js');
  const F = await import('./js/modes/findvoice.js');
  const out = { run: RUN_STEPS_PER_MINUTE, l1: F.chargeStepsPerMinute(1), l2: F.chargeStepsPerMinute(2), l9: F.chargeStepsPerMinute(9), l50: F.chargeStepsPerMinute(50) };
  // Measured: one second of charging, the player standing on glass far away.
  g.playerPos = [0, 0]; fv.glass.clear(); fv.glass.add('0,0');
  fv.creature.x = 60; fv.creature.y = 0; fv.caughtAt = null;
  g.updateFindVoice(1 / 30);
  const x0 = fv.creature.x;
  for (let i = 0; i < 30; i++) g.updateFindVoice(1 / 30);
  out.measured = (x0 - fv.creature.x) / 3 * 60;
  out.state = fv.creature.state;
  fv.glass.clear(); g._fvCreatureSound(false);
  return out;
});
check(speeds.run === 280 && speeds.l1 === 220 && speeds.l2 === 225 && speeds.l9 === 260 && speeds.l50 === 260 && speeds.l50 < speeds.run,
  'the creature charges at 220 steps a minute, 5 more a level, never over 260; the run is 280: ' + JSON.stringify(speeds));
check(Math.abs(speeds.measured - 220) < 2 && speeds.state === 'charge', 'measured: one second of charge covers 220 steps a minute: ' + speeds.measured.toFixed(1));

// ------------------------------------------------------------------ glass: the charge and the stop
const glass = await page.evaluate(() => {
  const g = window.__el.game; const fv = g.fv; const T = window.T;
  const out = {};
  const L = T.heard();
  fv.guide.pos = [-60, -60];
  g.playerPos = [0, 0]; g._face(0, true);
  fv.creature.x = 0; fv.creature.y = 34; g._fvCreatureSound(false);
  fv.glass.clear(); fv.glass.add('0,-1'); fv.glass.add('0,-2');
  g.input('up');                                    // onto glass
  T.frames(1 / 30);
  out.stepGlass = L.names.some((n) => /^ut_glass_step_/.test(n));
  out.charge = fv.creature.state;
  out.growl = fv.creature.voice && fv.creature.voice.name;
  T.frames(1.0);
  out.stillOnGlass = fv.creature.state;
  out.feet = L.at.filter(([n]) => /^step_stone_|^ut_glass_step_/.test(n)).length;
  out.feetWhere = L.at.filter(([n]) => /^step_stone_|^ut_glass_step_/.test(n)).map(([, p]) => +p[1].toFixed(1)).slice(0, 3);
  g.input('down');                                  // back on concrete
  out.stepStone = L.names.slice(-3).some((n) => /^step_stone_/.test(n));
  T.frames(0.5); out.half = fv.creature.state;
  T.frames(0.7); out.after = fv.creature.state === 'rest' ? 'idle' : fv.creature.state;
  out.breath = fv.creature.voice && fv.creature.voice.name;
  out.cy = fv.creature.y;
  let near = 0;
  for (const k of fv.glass) { const [i, j] = k.split(',').map(Number); if (Math.hypot(i * 3 - fv.creature.x, j * 3 - fv.creature.y) < 24) near += 1; }
  out.near = near;
  L.stop();
  return out;
});
check(glass.stepGlass && glass.charge === 'charge' && /evt_monster_growl/.test(glass.growl), 'a step on glass crunches and the creature charges, growling: ' + glass.growl);
check(glass.stillOnGlass === 'charge' && glass.feet >= 3, 'it keeps charging while you stand on glass, a footstep for every step it runs, from where it is: ' + JSON.stringify([glass.feet, glass.feetWhere]));
check(glass.stepStone && glass.half !== 'idle' && glass.after === 'idle' && /evt_beast_breathing/.test(glass.breath), 'back on concrete it runs on about a second, then stops and breathes: ' + JSON.stringify([glass.half, glass.after]));
check(glass.near === 0, 'and no glass is left near where it stopped');

// ------------------------------------------------------------------ layouts: glass never near it, rings round her
const layouts = await page.evaluate(() => {
  const g = window.__el.game; const fv = g.fv;
  const out = { near: 0, rings: 0, ringLeaks: 0, mine: 0, spots: 0, bandOk: 0, apart: 0 };
  for (let n = 0; n < 150; n++) {
    fv.level = 1 + (n % 8);
    g._fvBeginLevel(false);
    for (const k of fv.glass) { const [i, j] = k.split(',').map(Number); if (Math.max(Math.abs(i), Math.abs(j)) <= 1) out.mine += 1; }
    for (let m = 0; m < 4; m++) {
      g.playerPos = [Math.random() * 60 - 30, Math.random() * 60 - 30];
      if (g._fvOnGlass()) continue;
      g._fvNewGuideSpot();
      out.spots += 1;
      const [lo, hi] = [Math.min(43.2, 12 + 4 * (fv.level - 1)), Math.min(43.2, 12 + 4 * (fv.level - 1)) + 10];
      const d = Math.hypot(fv.guide.pos[0] - g.playerPos[0], fv.guide.pos[1] - g.playerPos[1]);
      if (d >= lo - 0.01 && d <= hi + 0.01) out.bandOk += 1;
      if (Math.hypot(fv.guide.pos[0] - fv.creature.x, fv.guide.pos[1] - fv.creature.y) >= 15) out.apart += 1;
      for (const k of fv.glass) { const [i, j] = k.split(',').map(Number); if (Math.hypot(i * 3 - fv.creature.x, j * 3 - fv.creature.y) < 24) out.near += 1; }
      if (!fv.ring) continue;
      out.rings += 1;
      // Every spot within reach of her (inside the room) is glass.
      for (let a = 0; a < 72; a++) for (const r of [0, 1.5, 3, 4.5, 5.9]) {
        const p = [fv.guide.pos[0] + Math.sin(a * Math.PI / 36) * r, fv.guide.pos[1] - Math.cos(a * Math.PI / 36) * r];
        if (Math.abs(p[0]) > 36 || Math.abs(p[1]) > 36) continue;
        if (!g._fvOnGlass(p)) out.ringLeaks += 1;
      }
    }
  }
  fv.level = 1; g._fvBeginLevel(false);
  return out;
});
check(layouts.near === 0 && layouts.mine === 0, 'over 150 levels: no glass within eight steps of the creature, none under or beside you as a level begins: ' + JSON.stringify(layouts));
check(layouts.bandOk >= layouts.spots * 0.97 && layouts.apart >= layouts.spots * 0.95, 'the guide calls from her level\'s band, 12 units and 4 more a level, and away from the creature');
check(layouts.rings > 40 && layouts.ringLeaks === 0, 'some spots are reached only across glass (every spot within reach of her is glass): ' + JSON.stringify([layouts.rings, layouts.ringLeaks]));

// ------------------------------------------------------------------ finding her
const find = await page.evaluate(async () => {
  const g = window.__el.game; const fv = g.fv; const T = window.T;
  const out = {};
  fv.glass.clear(); fv.creature.x = 30; fv.creature.y = 30; g._fvCreatureSound(false);
  const L = T.heard();
  g.playerPos = [0, 0]; g._face(0, true);
  fv.guide.pos = [0, -9.5]; fv.guide.phase = 'calling';
  const was = [...fv.guide.pos];
  g.input('up');                          // 6.5 away: not yet
  out.notYet = fv.finds;
  g.input('up');                          // 3.5 away: found
  out.finds = fv.finds;
  out.chime = L.names.filter((n) => /evt_chime_clear/.test(n));
  out.phase = fv.guide.phase;
  // The chime is heard out (its voice still busy: she stays quiet), then half a
  // second, then her new spot.
  const chime = fv.chime;
  out.chimeBusy = !!(chime && chime.busy);
  for (let i = 0; i < 90; i++) g.updateFindVoice(1 / 30);
  out.during = fv.guide.phase;
  if (chime) chime.stop();
  for (let i = 0; i < 12; i++) g.updateFindVoice(1 / 30);
  out.at04 = fv.guide.phase;
  for (let i = 0; i < 4; i++) g.updateFindVoice(1 / 30);
  out.at053 = fv.guide.phase;
  out.moved = Math.hypot(fv.guide.pos[0] - was[0], fv.guide.pos[1] - was[1]);
  L.stop();
  return out;
});
check(find.notYet === 0 && find.finds === 1 && find.chime.length === 1 && find.phase === 'pause', 'within two steps of her is a find: one chime, always the same: ' + find.chime.join());
check(find.chimeBusy && find.during === 'pause' && find.at04 === 'pause' && find.at053 === 'calling' && find.moved > 5, 'after the chime, half a second of quiet, then she calls from a new spot: ' + JSON.stringify(find));

// ------------------------------------------------------------------ five finds: the next level
const level = await page.evaluate(() => {
  const g = window.__el.game; const fv = g.fv; const T = window.T;
  const L = T.heard();
  const out = { bgs: [] };
  for (let lv = 0; lv < 3; lv++) {
    for (let k = fv.finds; k < 5; k++) {
      fv.glass.clear(); fv.guide.phase = 'calling'; g.playerPos = [0, 0]; fv.guide.pos = [0, -3]; g._face(0, true);
      g.input('up');
      fv.pause = 0; fv.chime = null; g.updateFindVoice(1 / 30);
    }
    out.bgs.push(fv.amb.stem);
  }
  out.level = fv.level; out.completed = fv.completed; out.said = L.spoken.filter((t) => /^Level/.test(t));
  out.speed = +(fv.creature.speed / 3 * 60).toFixed(1);
  out.band = [...(window.__fvBand = null) || []];
  L.stop();
  return out;
});
check(level.level === 4 && level.completed === 3 && level.said.join('|') === 'Level 2.|Level 3.|Level 4.', 'five finds complete a level and the next begins at once: ' + level.said.join(' '));
check(level.bgs.every((b) => /^evt_amb_/.test(b) && b !== 'evt_amb_witch' && b !== 'evt_amb_stadium_crowd') && new Set(level.bgs).size === 3, 'each level has a new event background: ' + level.bgs.join(', '));
check(level.speed === 235, 'the creature is 5 steps a minute faster each level: ' + level.speed);
const band = await page.evaluate(async () => { const F = await import('./js/modes/findvoice.js'); return [F.guideBand(1), F.guideBand(4), F.guideBand(30)]; });
check(band[0][0] === 12 && band[0][1] === 22 && band[1][0] === 24 && Math.abs(band[2][0] - 43.2) < 1e-9, 'and the guide calls from further away: ' + JSON.stringify(band));

// ------------------------------------------------------------------ caught
const caught = await page.evaluate(() => {
  const g = window.__el.game; const fv = g.fv; const T = window.T;
  const L = T.heard();
  const out = {};
  const catchOnce = () => {
    g.playerPos = [0, 0]; fv.glass.clear(); fv.glass.add('0,0'); fv.caughtAt = null;
    fv.creature.x = 0; fv.creature.y = -8;
    for (let i = 0; i < 60 && g.state === 'findvoice' && fv.lives === lives0(); i++) g.updateFindVoice(1 / 30);
  };
  const lives0 = (() => { let v = fv.lives; return () => v; })();
  catchOnce();
  out.one = { lives: fv.lives, said: T.said(), state: fv.creature.state === 'rest' ? 'idle' : fv.creature.state, far: Math.hypot(fv.creature.x, fv.creature.y), hit: L.names.includes('player_hit'), breath: fv.creature.voice && fv.creature.voice.name };
  // Still standing on the glass you were caught on: it waits for a new step onto glass.
  for (let i = 0; i < 30; i++) g.updateFindVoice(1 / 30);
  out.waits = fv.creature.state;
  fv.glass.add('0,-1'); g._turnStop(); g._face(0, true); g.input('up'); g.updateFindVoice(1 / 30);
  out.newStep = fv.creature.state;
  const lv = fv.lives; const ll = () => lv;
  g.playerPos = [0, 0]; fv.glass.clear(); fv.glass.add('0,0'); fv.caughtAt = null; fv.creature.x = 0; fv.creature.y = -8;
  for (let i = 0; i < 60 && g.state === 'findvoice' && fv.lives === lv; i++) g.updateFindVoice(1 / 30);
  out.two = { lives: fv.lives, said: T.said() };
  const best = g.scores.scores.findvoice || 0;
  { const lv2 = fv.lives; g.playerPos = [0, 0]; fv.glass.clear(); fv.glass.add('0,0'); fv.caughtAt = null; fv.creature.x = 0; fv.creature.y = -8;
    for (let i = 0; i < 60 && g.state === 'findvoice' && fv.lives === lv2; i++) g.updateFindVoice(1 / 30); }
  out.end = { state: g.state, said: T.said(), board: g.scores.scores.findvoice, best };
  L.stop();
  return out;
});
check(caught.one.lives === 2 && caught.one.said === 'Caught. 2 lives left.' && caught.one.hit, 'a catch costs a life: ' + caught.one.said);
check(caught.waits === 'rest' && caught.newStep === 'charge', 'after a catch it ignores the glass you are still standing on, until you step onto glass again: ' + JSON.stringify([caught.waits, caught.newStep]));
check(caught.one.state === 'idle' && caught.one.far >= 30 && /evt_beast_breathing/.test(caught.one.breath), 'and the creature is thrown far off, breathing, idle: ' + caught.one.far.toFixed(1));
check(caught.two.said === 'Caught. 1 life left.', 'the second: ' + caught.two.said);
check(caught.end.state === 'game_over' && /^Game Over\. You completed 3 levels\. /.test(caught.end.said) && caught.end.board === 3, 'the third ends the run; the score is the levels completed: ' + caught.end.said);
const quiet = await page.evaluate(() => [...window.__el.audio.live].filter((v) => v.loop && v.busy).map((v) => v.name));
check(quiet.length === 0, 'nothing is left playing after the run: ' + quiet.join(', '));

// ------------------------------------------------------------------ Heart is given time (6.0.1)
const hold = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const T = window.T;
  const mod = await import('./js/modes/findvoice-guide.js');
  const st = { stock: 0, busy: true, n: 0 };
  const fake = { ready: () => true, stock: () => st.stock, get busy() { return st.busy; },
    next: () => { st.n += 1; if (st.stock < 1) return { buffer: null, text: 'Over here.', id: null };
      const b = a.ctx.createBuffer(1, 22050, 44100); b.getChannelData(0).fill(0.1); return { buffer: b, text: 'Over here.', id: 'hold' + st.n }; } };
  const bel = window.__el.speech.bella; const realGuide = bel ? bel.guide : null;
  if (bel) bel.guide = fake;
  mod.setGuideSource(fake);
  const out = {};
  const said = () => L.spoken.filter((t) => t === 'Over here.').length;
  let L = T.heard();
  // Her first call waits while her calls are being made...
  T.start('findvoice'); T.frames(4.0);
  out.heldCalls = st.n; out.heldSpoken = said();
  // ...and comes in her own voice as soon as two are ready.
  st.stock = 2; T.frames(0.3);
  out.afterReady = st.n; out.heartVoice = !![...a.live].find((x) => /^fv_guide_hold/.test(x.name)); out.spokenThen = said();
  // Later, a call due while her next is still being made waits a moment, then the device's voice says it.
  st.stock = 0;
  if (g.fv.guide.voice) g.fv.guide.voice.stop();
  T.frames(2.2); out.midHeld = said();
  T.frames(1.8); out.midSpoken = said();
  L.stop(); g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu();
  // The first call never waits more than eight seconds.
  L = T.heard(); st.n = 0; st.stock = 0; st.busy = true;
  T.start('findvoice'); T.frames(7.5); out.longHeld = said(); T.frames(1.6); out.longSpoken = said();
  L.stop(); g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu();
  // Nothing being made (she cannot speak just now): no waiting at all.
  L = T.heard(); st.n = 0; st.stock = 0; st.busy = false;
  T.start('findvoice'); T.frames(1.5); out.idleSpoken = said();
  L.stop(); g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu();
  if (bel) bel.guide = realGuide;
  mod.setGuideSource(realGuide);
  return out;
});
check(hold.heldCalls === 0 && hold.heldSpoken === 0, `her first call waits while her calls are still being made (${JSON.stringify(hold)})`);
check(hold.afterReady === 1 && hold.heartVoice && hold.spokenThen === 0, 'and comes in her own voice once two are ready, with nothing from the device\'s voice');
check(hold.midHeld === 0 && hold.midSpoken >= 1, 'a later call waits a moment for her, then the device\'s voice says it');
check(hold.longHeld === 0 && hold.longSpoken >= 1, 'the first call never waits more than eight seconds');
check(hold.idleSpoken >= 1, 'when none of her calls is being made, nothing is waited for');

// ------------------------------------------------------------------ Speech off: the beacon in place of her voice (6.0.1)
const silent = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const T = window.T;
  const mod = await import('./js/modes/findvoice-guide.js');
  let n = 0;
  const fake = { ready: () => true, stock: () => 5, busy: false,
    next: () => { n += 1; const b = a.ctx.createBuffer(1, 22050, 44100); b.getChannelData(0).fill(0.1); return { buffer: b, text: 'Over here.', id: 'sil' + n }; } };
  const bel = window.__el.speech.bella; const realGuide = bel ? bel.guide : null;
  if (bel) bel.guide = fake;
  mod.setGuideSource(fake);
  const tts = g.tts; const realMuted = tts.muted;
  const spoken = [];
  const synth = window.speechSynthesis; const realSpeak = synth.speak.bind(synth);
  synth.speak = (u) => { spoken.push(u.text); };
  const beacon = () => !!(g.fv.guide.beacon && g.fv.guide.beacon.busy);
  const heart = () => [...a.live].filter((x) => /^fv_guide_sil/.test(x.name) && x.busy).length;
  const out = {};
  tts.muted = () => true;
  T.start('findvoice'); T.frames(4.0);
  out.off = { taken: n, heart: heart(), beacon: beacon(), spoken: spoken.filter((t) => /Over here/.test(t)).length, placed: g.fv.guide.beacon ? g.fv.guide.beacon.volume > 0 || true : false };
  // Speech turned on again in the same run: her voice returns, the beacon goes.
  tts.muted = () => false;
  T.frames(4.0);
  out.on = { taken: n, beacon: beacon() };
  tts.muted = realMuted; synth.speak = realSpeak;
  if (bel) bel.guide = realGuide;
  mod.setGuideSource(realGuide);
  g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu();
  const { HELP } = await import('./js/help-data.js').catch(() => ({ HELP: [] }));
  return out;
});
check(silent.off.taken === 0 && silent.off.heart === 0 && silent.off.spoken === 0, `with Speech off no voice is heard for the guide, neither Heart's nor the device's (${JSON.stringify(silent.off)})`);
check(silent.off.beacon, 'her shimmering beacon plays where she stands instead');
check(silent.on.taken >= 1 && !silent.on.beacon, 'with Speech on again her voice returns and the beacon stops');

// ------------------------------------------------------------------ Heart, when the voice module is ready
const heart = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const T = window.T;
  const mod = await import('./js/modes/findvoice-guide.js');
  let n = 0;
  const fake = { ready: () => true, next: () => { n += 1; const b = a.ctx.createBuffer(1, 22050, 44100); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.sin(i / 10) * 0.2; return { buffer: b, text: 'Over here.', id: 'test' + (n % 3) }; } };
  // (The game takes the voice module's guide when there is one: the test's stands in for it.)
  const bel = window.__el.speech.bella; const realGuide = bel ? bel.guide : null;
  if (bel) bel.guide = fake;
  mod.setGuideSource(fake);
  const L = T.heard();
  T.start('findvoice');
  T.frames(1.5);
  const v = [...a.live].find((x) => /^fv_guide_test/.test(x.name));
  const out = { calls: n, placed: !!(v && v.binPlaced), spoken: L.spoken.filter((t) => t === 'Over here.').length, beacon: L.names.includes('event_beacon_shimmer') };
  // Only her latest call stays in the sound engine (a run hears hundreds).
  for (let i = 0; i < 6; i++) { if (g.fv.guide.voice) g.fv.guide.voice.stop(); T.frames(2.5); }   // (each call heard out)
  out.later = n;
  out.kept = [...a.buffers.keys()].filter((k) => k.startsWith('dry:fv_guide_test')).length;
  // Her level: as loud as the in-run voice beside her, fading with distance.
  const fv = g.fv;
  g.playerPos = [fv.guide.pos[0], fv.guide.pos[1] + 5.9]; out.near = g._fvLevels(fv.guide.pos, 1, 48, 0.15).slice(0, 2).map((x) => +x.toFixed(2));
  g.playerPos = [fv.guide.pos[0], fv.guide.pos[1] + 60]; out.far = g._fvLevels(fv.guide.pos, 1, 48, 0.15).slice(0, 2).map((x) => +x.toFixed(2));
  if (bel) bel.guide = realGuide;
  mod.setGuideSource(realGuide);
  L.stop();
  g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu();
  return out;
});
check(heart.calls >= 1 && heart.placed && heart.spoken === 0 && !heart.beacon, 'with Heart ready her calls are her own recordings, placed in 3D, and the device\'s voice stays quiet: ' + JSON.stringify(heart));
check(heart.later >= 3 && heart.kept === 1, 'only her latest call is kept in memory: ' + JSON.stringify([heart.later, heart.kept]));
check(heart.near[0] >= 0.85 && heart.far[0] < 0.2, 'she is about as loud as the in-run voice when close, fading with distance: ' + JSON.stringify([heart.near, heart.far]));

check(errors.length === 0, 'no page errors ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
