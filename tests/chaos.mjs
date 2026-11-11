// Chaos Mode, played by script in a real browser engine (Chromium, through
// Playwright). Run: serve the site folder (python3 -m http.server 8775), then
//   node --import ./tests/github-stub.mjs tests/chaos.mjs http://localhost:8775
// The kind of each level is chosen by the test (a fixed list in place of the
// random pick) so every kind is played: labyrinth, battle, tower floor (twice in a
// row, for the climb), road and island. A simple bot plays each one by its own
// mode's rules. The test checks the rules that matter; it cannot hear.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8775';
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

// An iPhone fails or closes the page after a few dozen OfflineAudioContexts (WebKit
// bug 224279): a whole chaos run must make none, and no extra AudioContext either.
await page.evaluate(() => {
  window.__ctxMade = { offline: 0, live: 0 };
  const O = window.OfflineAudioContext; const A = window.AudioContext;
  window.OfflineAudioContext = function (...x) { window.__ctxMade.offline += 1; return new O(...x); };
  window.AudioContext = function (...x) { window.__ctxMade.live += 1; return new A(...x); };
});

// --------------------------------------------------------------- menu, boards, help, packs
const setup = await page.evaluate(async () => {
  const g = window.__el.game;
  const a = window.__el.audio;
  const { HELP } = await import('/js/game.js');
  const names = HELP.map(([n]) => n);
  const demos = (HELP.find(([n]) => n === 'Demos, Chaos Mode') || [0, []])[1].filter((d) => d.sound).map((d) => d.sound);
  const drones = ['lab_01_cavewind', 'lab_11_tunnel_fan', 'bat_01_deep_drone', 'bat_11_horror_suspense',
    'tow_01_night_castle', 'tow_11_wind_room_tone', 'engine_0'];
  const general = HELP[0][1];
  return {
    menu: g.menuOptions.slice(), names, lines: g._scoreLines(),
    missing: [...demos, 'credit_beacon_40', 'credit_beacon_50', 'credit_beacon_60', 'credit_chaos', 'exit_morse',
      ...drones.map((d) => d + '_muffled')].filter((n) => !a.has(n)),
    keys: HELP.filter(([n]) => /Chaos/.test(n)).flatMap(([, it]) => it).filter((t) => /\b(Space|Enter|Escape|arrow|Braille|Windows)\b|Press /.test(t.desc)).map((t) => t.title),
    general: general.map((t) => t.title),
    generalKeys: general.filter((t) => /\b(Space|Enter|Escape|Braille|Windows|folder|GitHub)\b|Press /.test(t.desc.replace(/the spacebar|like Enter|the arrows, with the up arrow held down to accelerate, Enter, Space, Escape, P to pause, H for help, T for the clock and C for the compass in Ultimate Mode/g, ''))).map((t) => t.title),
  };
});
check(setup.menu.indexOf('Chaos Mode') === setup.menu.indexOf('Island Mode') + 1
  // Ultimate Mode (web 2.0.0) follows Chaos; then Events, which reads "Events"
  // or, while GitHub is still being asked, "Events: checking".
  && setup.menu.indexOf('Ultimate Mode') === setup.menu.indexOf('Chaos Mode') + 1
  && setup.menu.findIndex((m) => /^Events\b(?!.*High)/.test(m)) === setup.menu.indexOf('Chaos Mode') + 2, 'the main menu has Chaos Mode between Island and Ultimate Mode, then Events: ' + setup.menu.join(', '));
const lineAt = (k) => setup.lines.findIndex((l) => l.startsWith(k));
check(lineAt('Chaos Mode') === 2 && lineAt('Tower Mode') === 3 && lineAt('Driving Mode') === 4 && lineAt('Driving Distance') === 5
  && lineAt('Island Mode') === 6 && setup.lines.includes('Chaos Mode: No score yet'), 'the boards in the desktop\'s order: ' + setup.lines.join(' | '));
check(setup.names.indexOf('Chaos Mode') === setup.names.indexOf('Island Mode') + 1 && setup.names.indexOf('Events') === setup.names.indexOf('Chaos Mode') + 2
  && setup.names.indexOf('Demos, Chaos Mode') === setup.names.indexOf('Demos, Island Mode') + 1, 'help has Chaos Mode and its demos in menu order');
check(setup.missing.length === 0, 'every chaos sound, its demos and the elevator\'s muffled drones are in the packs' + (setup.missing.length ? ': missing ' + setup.missing.join(', ') : ''));
check(setup.keys.length === 0, 'no key names in the chaos help: ' + setup.keys.join(', '));
check(JSON.stringify(setup.general) === JSON.stringify(['Help Menu', 'General Gestures', 'General Sound on Your Device', 'General Room Reverb',
  'General Behind You', 'General Pause and Resume', 'General Quitting a Run', 'General High Scores', 'General Checking Where You Stand', 'General The Soundtrack'])
  && setup.generalKeys.length === 0, 'General help: the desktop topics without Braille, with gestures: ' + setup.generalKeys.join(', '));

// --------------------------------------------------------------- the harness
await page.evaluate(async () => {
  const g = window.__el.game;
  const a = window.__el.audio;
  const { RoadThing } = await import('/js/modes/driving.js');
  const t = window.__t = { played: [], said: [], RoadThing };
  t.loops = () => [...a.live].filter((v) => v.loop && !v.stopped).map((v) => v.name);
  const play = a.play.bind(a);
  a.play = (name, opts) => { t.played.push(name); return play(name, opts); };
  const speak = g.tts.speak.bind(g.tts);
  g.tts.speak = (text, o) => { t.said.push(text); return speak(text, o); };
  // The test chooses each level's kind (the desktop picks at random).
  t.seq = [];
  t.pick = 0;
  g._chaosPickNext = () => t.seq[t.pick++ % t.seq.length];
  t.start = (seq) => {
    t.seq = seq; t.pick = 0;
    g.state = 'menu';
    g.menuIndex = g.menuKeys.indexOf('chaos');
    g.input('enter');
  };
  t.towards = (tx, ty) => {
    const [px, py] = g.playerPos;
    const dx = tx - px; const dy = ty - py;
    if (Math.abs(dx) >= Math.abs(dy)) g.input(dx > 0 ? 'right' : 'left'); else g.input(dy > 0 ? 'down' : 'up');
  };
  // A chaos credit laid by hand (the desktop's TimeCredit(x, y, chaos=True)).
  t.credit = (x, y, value = 50, tower = false) => {
    const c = { value, soundName: 'credit_chaos', beaconName: 'credit_beacon_' + value, x, y, channel: null };
    c.channel = tower ? g._towerLoop('credit', c.beaconName) : a.play(c.beaconName, { loops: -1 });
    g.timeCredit = c;
    return c;
  };

  // ---- the bots, one per kind of level
  t.labyrinth = () => {
    // Shortest way on the grid: to the credit first if there is one, then the exit.
    const gs = g.gridSize;
    const goal = g.timeCredit ? [Math.trunc(g.timeCredit.x), Math.trunc(g.timeCredit.y)] : g.exitPos;
    const start = [Math.trunc(g.playerPos[0]), Math.trunc(g.playerPos[1])];
    const k = (x, y) => x + ',' + y;
    const prev = new Map([[k(...start), null]]);
    const q = [start];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === goal[0] && y === goal[1]) break;
      for (const [dx, dy, gname] of [[0, -1, 'up'], [0, 1, 'down'], [-1, 0, 'left'], [1, 0, 'right']]) {
        const nx = x + dx; const ny = y + dy;
        if (Math.abs(nx) > gs || Math.abs(ny) > gs || g.grid.has(k(nx, ny)) || prev.has(k(nx, ny))) continue;
        prev.set(k(nx, ny), [x, y, gname]);
        q.push([nx, ny]);
      }
    }
    let at = k(...goal); let move = null;
    while (prev.get(at)) { const [x, y, gname] = prev.get(at); move = gname; if (x === start[0] && y === start[1]) break; at = k(x, y); }
    if (move) g.input(move);
  };
  t.battle = () => {
    const [px, py] = g.playerPos;
    if (g.battleExitActive) { t.towards(...g.exitPos); return; }
    const near = g.obstacles.slice().sort((p, q) => Math.hypot(p.x - px, p.y - py) - Math.hypot(q.x - px, q.y - py))[0];
    if (g.ammo <= 1 && g.ammoPickups.length && (!near || Math.hypot(near.x - px, near.y - py) > 12)) { t.towards(g.ammoPickups[0].x, g.ammoPickups[0].y); return; }
    if (g._battleLocked() && g.ammo > 0) { g.input('space'); return; }
    if (near) { g.input(near.x > px ? 'right' : 'left'); return; }
    if (g.ammoPickups.length && g.ammo < 6) t.towards(g.ammoPickups[0].x, g.ammoPickups[0].y);
  };
  t.dodge = 0;
  t.tower = () => {
    const e = g.towerEnemy;
    const [px, py] = g.playerPos;
    if (g.towerStairsActive) { t.towards(...g.towerStairsPos); return; }
    if (!e) return;
    if ((e.winding > 0 || e.pending > 0) && t.dodge < 2) {
      const lx = px - e.x; const ly = py - e.y;
      if (Math.abs(ly) >= Math.abs(lx)) g.input(px > 0 ? 'left' : 'right'); else g.input(py > 0 ? 'up' : 'down');
      t.dodge += 1;
      return;
    }
    if (e.winding <= 0 && e.pending <= 0) t.dodge = 0;
    const dist = Math.hypot(e.x - px, e.y - py);
    const left = e.hitsNeeded - e.hitsTaken;
    if (g.towerItems <= left && g.towerItem) { t.towards(g.towerItem.x, g.towerItem.y); return; }
    if (g.towerItems > 0 && dist > 0 && Math.abs((e.x - px) / dist) < 0.72) { g.input('space'); return; }
    g.input(e.x > px ? 'right' : 'left');
  };
  t.road = () => {
    const ahead = (lane, kind, range, oncoming) => g.driveThings.filter((r) => r.kind === kind && r.lane === lane
      && (oncoming === undefined || r.oncoming === oncoming) && r.dist - g.driveDist > -3 && r.dist - g.driveDist < range);
    const danger = (lane) => ahead(lane, 'car', 140, true).length + ahead(lane, 'car', 12, false).length;
    const me = g.driveLane;
    if (!g.driveUpHeld) g.input('accel_on');
    if (danger(me)) {
      const opts = [me - 1, me + 1].filter((l) => l >= 0 && l < 3).sort((x, y) => danger(x) - danger(y));
      if (opts.length && danger(opts[0]) < danger(me)) { g.input(opts[0] < me ? 'left' : 'right'); return; }
    }
    if (ahead(me, 'car', 200, false).length && g.ammo > 0) { g.input('space'); return; }
    const goal = g.driveThings.find((r) => r.kind === 'exit' && r.dist > g.driveDist)
      || g.driveThings.find((r) => r.kind === 'ammo' && r.dist > g.driveDist && r.lane !== me);
    if (goal && goal.lane !== me) {
      const to = goal.lane < me ? me - 1 : me + 1;
      if (!danger(to)) g.input(to < me ? 'left' : 'right');
    }
  };
  t.island = () => {
    const [px, py] = g.playerPos;
    if (g.islandRide) return;
    if (g.islandPhase === 'seabed') {
      const key = g.islandItems.find((it) => it.kind === 'key');
      if (key) { t.walkTo(...key.pos); return; }
      const vent = g.islandItems.find((it) => it.kind === 'vent');
      if (vent && g.islandAir < 20) { t.walkTo(...vent.pos); return; }
      const p = g.ammoPickups[0];
      if (p && g.islandAir > 14 && g.ammo < 30) { t.walkTo(p.x, p.y); return; }
      t.walkTo(...g.islandElevator);
      return;
    }
    const guardian = g.obstacles.find((o) => o.guardian);
    const regular = g.obstacles.filter((o) => !o.guardian);
    if (g.islandCleared && !guardian) { t.walkTo(0, 0); return; }
    if (g.ammo <= 0) { t.walkTo(0, 0); return; }
    const locked = g._battleLocked();
    if (locked && (!locked.guardian || Math.hypot(locked.x - px, locked.y - py) > 8)) { g.input('space'); return; }
    if (regular.length) {
      let near = regular[0];
      for (const o of regular) if (Math.hypot(o.x - px, o.y - py) < Math.hypot(near.x - px, near.y - py)) near = o;
      g.input(near.x > px ? 'right' : 'left');
      return;
    }
    if (guardian) {
      const [gx, gy] = guardian.post;
      const ty = Math.abs(gy + 17) <= 33 ? gy + 17 : gy - 17;
      t.walkTo(gx, ty);
    }
  };
  t.walkTo = (tx, ty) => {
    const [px, py] = g.playerPos;
    if (Math.abs(tx - px) < 1.5 && Math.abs(ty - py) < 1.5) return;
    t.towards(tx, ty);
  };
});

// --------------------------------------------------------------- a whole chaos run, by script
const SEQ = ['standard', 'battle', 'tower', 'tower', 'drive', 'island', 'standard', 'battle', 'drive', 'island',
  'tower', 'standard', 'battle', 'drive', 'standard', 'battle', 'tower', 'drive', 'island'];
const playRun = () => page.evaluate(async (seq) => {
  const g = window.__el.game;
  const a = window.__el.audio;
  const t = window.__t;
  const out = { starts: [], done: [], clockUps: [], gapTicks: [], gaps: [], rooms: {}, gestures: {}, adopt: [], frames: 0,
    battleExit: [], towerStairs: [], roadExit: [], climb: null, report: '', gapClock: '', said: '' };
  t.said.length = 0;
  t.idle = false;
  t.start(seq);
  const PLAY = ['standard', 'battle', 'tower', 'drive', 'island'];
  out.opening = t.said.slice();
  out.startClock = g.timeLeft;
  const counters = () => ({
    kind: g.state, time: g.timeLeft, lab: g.labyrinthLevel, battles: g.battleLevel, grid: g.gridSize,
    targets: g.state === 'battle' ? g._battleTargetsNeeded() : null, maxAtOnce: g.state === 'battle' ? g._battleMaxConcurrent() : null,
    floors: g.chaosTowerFloors, floor: g.towerFloor, tower: g.towerNumber, hp: g.towerHp, items: g.towerItems,
    roads: g.chaosDriveCount, quota: g.chaosDriveQuota, elapsed: g.driveElapsed,
    islands: g.chaosIslandCount, island: g.islandNumber, islandTargets: g.islandTargets,
    ammo: g.ammo, points: g.chaosPoints + g.islandPoints, level: g.level,
  });
  out.starts.push(counters());
  // Every level begun: its counters, taken as it is set up.
  const setupLevel = g._setupChaosLevel.bind(g);
  g._setupChaosLevel = () => { setupLevel(); out.starts.push(counters()); };
  // Every level finished: what it was, and the clock and points at that moment.
  const nextLevel = g.nextLevel.bind(g);
  g.nextLevel = () => {
    const was = g.state;
    const rec = { kind: was, time: g.timeLeft, chaosPoints: g.chaosPoints, islandPoints: g.islandPoints };
    if (was === 'island') rec.preview = { name: g.chaosPreview, voice: g.islandAmb.surface, next: g.chaosNext };
    nextLevel();
    rec.after = g.state;
    rec.gap = g.state === 'chaos_gap' ? g.chaosGap : null;
    rec.chaosPointsAfter = g.chaosPoints;
    out.done.push(rec);
    if (rec.preview) {
      const p = rec.preview;
      const now = p.next === 'standard' || p.next === 'battle' ? g.ambienceChannel
        : p.next === 'tower' ? g.towerLoops.ambience : p.next === 'island' ? g.islandAmb.surface : null;
      out.adopt.push({ next: p.next, name: p.name, voice: p.voice && p.voice.name, same: !!p.voice && now === p.voice,
        engineFading: p.next === 'drive' ? !!p.voice && g.driveLoops.engine !== p.voice : null, state: g.state });
      delete rec.preview;
    }
  };
  let prevState = g.state;
  let gapRun = 0;
  let battleDone = false; let towerDone = false; let roadDone = false;
  for (let i = 0; i < 30 * 60 * 30 && g.state !== 'game_over'; i++) {
    const before = g.timeLeft;
    const st = g.state;
    t.played.length = 0;
    // ---- the won-level checks, armed just before the level is won
    if (st === 'battle' && !battleDone && !g.battleExitActive && g.kills === g._battleTargetsNeeded() - 1 && !g.timeCredit) {
      t.credit(g.playerPos[0] > 0 ? -39 : 39, g.playerPos[1] > 0 ? -39 : 39);
    }
    if (st === 'tower' && !towerDone && g.towerEnemy && !g.towerStairsActive && !g.timeCredit
      && g.towerEnemy.hitsNeeded - g.towerEnemy.hitsTaken === 1) {
      t.credit(g.playerPos[0] > 0 ? -30 : 30, g.playerPos[1] > 0 ? -30 : 30, 40, true);
    }
    if (st === 'drive' && !roadDone && g.driveKills === g.chaosDriveQuota - 1 && !g.driveThings.some((r) => r.kind === 'credit')) {
      const c = new t.RoadThing('credit', (g.driveLane + 1) % 3, g.driveDist + 2000, { value: 60 });
      c.chaos = true;
      g.driveThings.push(c);
    }
    const credit = g.timeCredit;
    const roadCredit = st === 'drive' ? g.driveThings.find((r) => r.kind === 'credit') : null;
    g.frame(1 / 30);
    out.frames += 1;
    const now = g.state;
    // The clock only ever goes up by a credit.
    const coins = t.played.includes('credit_chaos');
    if (g.timeLeft > before + 1e-9 && !coins) out.clockUps.push([st, now, before, g.timeLeft]);
    if (st === 'chaos_gap' && now === 'chaos_gap' && g.timeLeft !== before) out.gapTicks.push([before, g.timeLeft]);
    if (PLAY.includes(now)) {
      out.rooms[now] = out.rooms[now] || new Set();
      out.rooms[now].add(String(a.room));
      out.gestures[now] = g.gestures.mode;
    }
    if (now === 'chaos_gap') {
      if (prevState !== 'chaos_gap') {
        gapRun = 0;
        if (prevState === 'tower' && g.chaosNext === 'tower') out.climb = { gap: g.chaosGap, climb: g.chaosClimb && g.chaosClimb.name };
      }
      gapRun += 1;
      // T between levels.
      if (!out.gapClock) { t.said.length = 0; g.input('clock'); out.gapClock = t.said.join(' / '); }
    } else if (prevState === 'chaos_gap') out.gaps.push(gapRun);

    // ---- a battle won: the Morse exit, the laser off, the credit gone, the clock still
    if (now === 'battle' && g.battleExitActive && !battleDone) {
      battleDone = true;
      g.frame(1 / 30);
      const r = { credit: !!credit && !credit.channel.busy && g.timeCredit === null, morse: t.loops().includes('exit_morse') };
      const ammo = g.ammo;
      t.played.length = 0;
      g.input('space');
      r.click = t.played.includes('empty_click') && !t.played.includes('laser') && g.ammo === ammo;
      const t0 = g.timeLeft;
      const rnd = Math.random;
      Math.random = () => 0;               // a battle credit would come at once, if it could
      for (let k = 0; k < 20; k++) g.frame(1 / 30);
      Math.random = rnd;
      r.noNewCredit = g.timeCredit === null;
      r.clockStill = g.timeLeft === t0 && g.state === 'battle';
      r.noBeep = !t.played.some((n) => n.startsWith('prox_'));
      out.battleExit.push(r);
    }
    // ---- a tower floor won: the stairs, the credit gone, the clock still
    // (Only on a floor won with a credit lying there. Now and then a floor is won
    // with none, the one this test lays down not being there at that moment, and
    // then there is nothing to see go: about one run in thirty, measured on web
    // 3.3.0, where this check then failed. The run's next tower floor is watched
    // instead.)
    if (now === 'tower' && g.towerStairsActive && !towerDone && credit) {
      towerDone = true;
      g.frame(1 / 30);
      const r = { credit: !!credit && credit.channel.stopped && g.timeCredit === null && !('credit' in g.towerLoops) };
      r.saw = { had: !!credit, stopped: !!credit && !!credit.channel.stopped, busy: !!credit && !!credit.channel.busy, gone: g.timeCredit === null, loop: 'credit' in g.towerLoops, state: g.state };
      const t0 = g.timeLeft;
      for (let k = 0; k < 15 && g.state === 'tower'; k++) g.frame(1 / 30);
      r.clockStill = g.timeLeft === t0;
      r.saw.t0 = t0; r.saw.t1 = g.timeLeft; r.saw.after = g.state;
      out.towerStairs.push(r);
    }
    // ---- a road won: no credits once the quota is shot; the exit, the clock still
    if (now === 'drive' && !roadDone && g.driveKills >= g.chaosDriveQuota && g.chaosDriveExitSeen) {
      roadDone = true;
      g.frame(1 / 30);
      const r = { creditGone: !!roadCredit && !g.driveThings.some((x) => x.kind === 'credit'), exit: g.driveThings.some((x) => x.kind === 'exit') };
      g.driveNextCredit = g.driveDist;
      const t0 = g.timeLeft;
      for (let k = 0; k < 10 && g.state === 'drive'; k++) g.frame(1 / 30);
      r.noNewCredit = !g.driveThings.some((x) => x.kind === 'credit');
      r.clockStill = g.timeLeft === t0 || g.state !== 'drive';
      out.roadExit.push(r);
    }
    if (now !== prevState && PLAY.includes(now)) {
      t.dodge = 0;
      // The double tap in a labyrinth: the clock and the points.
      if (now === 'standard' && !out.report) { t.said.length = 0; g.input('enter'); out.report = t.said.join(' / '); }
    }
    prevState = now;
    if (now === 'game_over') break;
    // Let timers and decoding run: always now and then, and through an elevator
    // ride whose next sound is still being decoded.
    if (now === 'island' && g.islandRide && g.islandShorePending) await new Promise((r) => setTimeout(r, 25));
    else if (i % 15 === 0) await new Promise((r) => setTimeout(r, 1));
    // ---- the bots
    // Once enough has been seen, the bot stops in the next labyrinth and lets the clock run out.
    if (!t.idle && out.done.length >= 10 && PLAY.every((k) => out.done.some((d) => d.kind === k)) && battleDone && towerDone && roadDone) t.idle = true;
    if (now === 'standard' && i % 2 === 0) { if (!t.idle) t.labyrinth(); }
    else if (now === 'battle' && i % 2 === 0) t.battle();
    else if (now === 'tower' && i % 5 === 0) t.tower();
    else if (now === 'drive' && i % 3 === 0) t.road();
    else if (now === 'island' && i % 6 === 0) t.island();
  }
  delete g.nextLevel;
  delete g._setupChaosLevel;
  await new Promise((r) => setTimeout(r, 100));
  out.end = g.state;
  out.timeLeft = g.timeLeft;
  out.islandDeath = g.islandDeath;
  out.chaosPoints = g.chaosPoints;
  out.islandPoints = g.islandPoints;
  out.message = document.getElementById('said').textContent;
  out.best = g.scores.scores.chaos;
  out.line = g._scoreLines().find((l) => l.startsWith('Chaos Mode'));
  out.loops = t.loops();
  out.rooms = Object.fromEntries(Object.entries(out.rooms).map(([k, v]) => [k, [...v]]));
  return out;
}, SEQ);

let run = null;
for (let attempt = 1; attempt <= 4; attempt++) {
  const r = await playRun();
  const kinds = new Set(r.done.map((d) => d.kind));
  console.log(`  run ${attempt}: ${r.done.length} levels (${r.done.map((d) => d.kind).join(', ')}), ended ${r.end} `
    + `with ${r.timeLeft.toFixed(1)}s left${r.islandDeath ? ' (' + r.islandDeath + ')' : ''}, ${r.frames} frames`);
  if (!run || r.done.length > run.done.length) run = r;
  if (r.done.length >= 8 && ['standard', 'battle', 'tower', 'drive', 'island'].every((k) => kinds.has(k))
    && r.battleExit.length && r.towerStairs.length && r.roadExit.length) { run = r; break; }
  await page.evaluate(() => { const g = window.__el.game; if (g.state === 'game_over') g.input('enter'); });
}

const kinds = run.done.map((d) => d.kind);
check(run.opening.includes('Chaos Mode. Five minutes.') && run.startClock === 300, 'the run opens with "Chaos Mode. Five minutes." and five minutes on the clock');
check(kinds.length >= 8 && ['standard', 'battle', 'tower', 'drive', 'island'].every((k) => kinds.includes(k)),
  `${kinds.length} levels finished, every kind among them: ${kinds.join(', ')}`);
check(run.clockUps.length === 0, 'the clock never resets or rises between levels, only by a credit' + (run.clockUps.length ? ': ' + JSON.stringify(run.clockUps.slice(0, 3)) : ''));
check(run.starts.length >= run.done.length && run.done.every((d, i) => !run.starts[i + 1] || run.starts[i + 1].time === d.time),
  'each level starts on exactly what the last one left on the clock: ' + run.starts.map((s) => s.time.toFixed(1)).join(', '));
check(run.gapTicks.length === 0, 'the clock waits through the silence between levels');
const gapTimes = run.done.filter((d) => d.gap !== null).map((d) => d.gap);
check(gapTimes.length > 0 && gapTimes.every((x) => x === 0.1) && run.done.filter((d) => d.kind === 'island').every((d) => d.gap === null)
  && run.gaps.every((n) => n <= 4 || (n >= 20 && n <= 46)),
  `the gap between levels is a tenth of a second (${run.gaps.join(', ')} frames; longer ones are a climb), and none after an island`);
check(run.climb && run.climb.climb === 'stairs_climb' && run.climb.gap > 0.5 && run.climb.gap <= 1.5,
  'from one tower floor to the next the climb is heard and the floor waits for it: ' + JSON.stringify(run.climb));
check(/^\d+ seconds? remaining\.$/.test(run.gapClock), 'T between levels says the clock: ' + run.gapClock);
check(/^\d+ seconds? left\. \d+ points total\.$/.test(run.report), 'double tap in a chaos labyrinth: ' + run.report);

// Each kind scales on its own count.
const seen = {};
const scaleBad = [];
for (const s of run.starts) {
  seen[s.kind] = (seen[s.kind] || 0) + 1;
  const n = seen[s.kind];
  if (s.kind === 'standard' && !(s.lab === n && s.grid === (n <= 10 ? 8 + Math.floor(n * 0.4) : 12 + (n - 10)))) scaleBad.push(['labyrinth', n, s.lab, s.grid]);
  if (s.kind === 'battle' && !(s.battles === n && s.targets === 3 + Math.trunc(n * 0.6) && s.maxAtOnce === Math.min(4, 1 + Math.floor(n / 6)))) scaleBad.push(['battle', n, s.battles, s.targets]);
  if (s.kind === 'tower' && s.floors !== n) scaleBad.push(['tower', n, s.floors]);
  if (s.kind === 'drive' && !(s.roads === n && s.quota === 2 + n && s.elapsed === 30 * (n - 1))) scaleBad.push(['road', n, s.roads, s.quota, s.elapsed]);
  if (s.kind === 'island' && !(s.islands === n && s.island === n && s.islandTargets === 3 + n)) scaleBad.push(['island', n, s.islands, s.island, s.islandTargets]);
}
check(scaleBad.length === 0, 'each kind of level scales on its own count: '
  + Object.entries(seen).map(([k, n]) => `${n} ${k}`).join(', ') + (scaleBad.length ? ' BAD ' + JSON.stringify(scaleBad) : ''));
const towers = run.starts.filter((s) => s.kind === 'tower');
check(towers.length >= 2 && towers.every((s, i) => i === 0 || (s.floor === towers[i - 1].floor + 1 || (s.floor === 1 && s.tower === towers[i - 1].tower + 1))),
  'the tower is one climb through the run, a floor each time: ' + towers.map((s) => `tower ${s.tower} floor ${s.floor}, ${s.hp} health, ${s.items} items`).join('; '));

// Points: ten a level, islands their own.
const pointsBad = run.done.filter((d) => d.chaosPointsAfter !== d.chaosPoints + (d.kind === 'island' ? 0 : 10));
check(pointsBad.length === 0 && run.chaosPoints === 10 * kinds.filter((k) => k !== 'island').length,
  `ten points for every level but an island (${run.chaosPoints}), islands pay their own (${run.islandPoints})`);

// The won-level checks.
const be = run.battleExit[0] || {};
check(be.morse && be.click && be.noBeep, 'a won chaos battle: the Morse exit sounds, the laser only clicks, no locating beep');
check(be.credit && be.noNewCredit && be.clockStill, 'from the Morse exit on, the credit lying there goes, no new one comes, and the clock waits');
const ts = run.towerStairs[0] || {};
check(ts.credit && ts.clockStill, 'a won tower floor: once the stairs sound its credit goes and the clock waits' + (ts.credit && ts.clockStill ? '' : ': ' + JSON.stringify(ts.saw)));
const re = run.roadExit[0] || {};
check(re.creditGone && re.noNewCredit && re.exit && re.clockStill, 'a won road: the credit on it goes, none comes, the exit is on the road and the clock waits');

// Rooms and gestures follow the level.
check(JSON.stringify(run.rooms.standard) === '["lab"]' && JSON.stringify(run.rooms.battle) === '["battle"]' && JSON.stringify(run.rooms.tower) === '["tower"]'
  && JSON.stringify(run.rooms.drive) === '["tunnel"]' && JSON.stringify(run.rooms.island) === '["null"]', 'the echo follows the level: ' + JSON.stringify(run.rooms));
check(run.gestures.drive === 'drive' && run.gestures.standard === 'run' && run.gestures.island === 'run', 'the driving gestures on a road, the run gestures elsewhere');

// Leaving an island: the next level's sound came up with the elevator.
check(run.adopt.length > 0 && run.adopt.every((p) => (p.next === 'drive' ? p.engineFading : p.same) && p.state === p.next),
  'the ride up out of an island brings in the next level\'s own sound, and that level keeps it: '
  + run.adopt.map((p) => `${p.next} (${p.voice})`).join(', '));

// The end.
const score = run.chaosPoints + run.islandPoints;
const opener = run.timeLeft <= 0 ? 'Time up.' : run.islandDeath === 'drown' ? 'You drowned.' : 'Game Over.';
check(run.end === 'game_over' && run.message.startsWith(`${opener} You scored ${score} points. `) && run.message.endsWith('Double tap to return to the menu.'),
  'the game over message: ' + run.message);
check(run.best >= score && run.line === `Chaos Mode: ${run.best} point${run.best === 1 ? '' : 's'}`, 'the Chaos board: ' + run.line);
check(run.loops.length === 0, 'no loops left after game over: ' + run.loops.join(', '));
await page.waitForTimeout(3000);
const late = await page.evaluate(() => window.__t.loops());
check(late.length === 0, 'and none a few seconds later: ' + late.join(', '));

// --------------------------------------------------------------- quitting
const quit = await page.evaluate(async () => {
  const g = window.__el.game;
  const t = window.__t;
  g.input('enter');                        // back to the menu
  const out = {};
  // Mid-road.
  t.start(['drive', 'battle']);
  g.input('accel_on');
  for (let i = 0; i < 90; i++) g.frame(1 / 30);
  out.roadLoops = t.loops().length;
  g.input('pause'); g.input('back'); g.input('up'); g.input('enter');
  await new Promise((r) => setTimeout(r, 60));
  out.road = [g.state, t.loops()];
  // Just after a level ends, with the old air still fading out.
  t.start(['battle', 'standard']);
  for (let i = 0; i < 30; i++) g.frame(1 / 30);
  g.nextLevel();
  out.gapState = g.state;
  out.fading = (g.chaosFading || []).length;
  g.input('back'); g.input('up'); g.input('enter');
  await new Promise((r) => setTimeout(r, 60));
  out.gap = [g.state, t.loops()];
  // Mid-ride, up out of an island toward a tower floor.
  t.start(['island', 'tower']);
  for (let i = 0; i < 10; i++) g.frame(1 / 30);
  for (const o of g.obstacles) if (o.channel) o.channel.stop();
  g.obstacles = [];
  g.islandKillsHere = g.islandTargets;
  g.islandGuardianHp = 0;
  g.islandKey = true;
  g.frame(1 / 30);
  g._islandStartRide('up');
  g.islandRideOnward = true;
  for (let i = 0; i < 60; i++) { g.frame(1 / 30); await new Promise((r) => setTimeout(r, 5)); }
  out.ride = [!!g.islandRide, g.chaosNext, g.chaosPreview];
  g.input('back'); g.input('up'); g.input('enter');
  await new Promise((r) => setTimeout(r, 60));
  out.rideQuit = [g.state, t.loops()];
  return out;
});
check(quit.roadLoops > 0 && quit.road[0] === 'menu' && quit.road[1].length === 0, 'quitting on a road: back at the menu, no loops: ' + quit.road[1].join(', '));
check(quit.gapState === 'chaos_gap' && quit.fading > 0 && quit.gap[0] === 'menu' && quit.gap[1].length === 0,
  'quitting between levels, the old air still fading: no loops: ' + quit.gap[1].join(', '));
check(quit.rideQuit[0] === 'menu' && quit.rideQuit[1].length === 0, `quitting mid-ride (${JSON.stringify(quit.ride)}): no loops: ` + quit.rideQuit[1].join(', '));
await page.waitForTimeout(3000);
const late2 = await page.evaluate(() => window.__t.loops());
check(late2.length === 0, 'and none a few seconds later: ' + late2.join(', '));

// Phones have no T: in chaos's battles, roads, tower floors and islands the double
// tap's report ends with the clock, then the points (Russell's decision).
const reports = await page.evaluate(async () => {
  const g = window.__el.game;
  const out = {};
  for (const kind of ['battle', 'tower', 'drive', 'island']) {
    g.menuIndex = g.menuKeys.indexOf('chaos');
    const orig = g._chaosPickNext;
    g._chaosPickNext = () => kind;
    g.input('enter');
    g._chaosPickNext = orig;
    for (let i = 0; i < 10; i++) { g.frame(1 / 30); await new Promise((r) => setTimeout(r, 5)); }
    g.input('enter');
    await new Promise((r) => setTimeout(r, 30));
    out[kind] = [g.state, document.getElementById('said').textContent];
    g.input('pause'); g.input('back'); g.input('up'); g.input('enter');
    await new Promise((r) => setTimeout(r, 30));
  }
  return out;
});
for (const [kind, [state, said]] of Object.entries(reports)) {
  check(state === kind && / Clock \d+ seconds?\. \d+ points total\.$/.test(said), `double tap on a chaos ${kind} level ends with the clock: ${said}`);
}

// A fresh standard run after chaos is plain standard again.
const after = await page.evaluate(() => {
  const g = window.__el.game;
  g.menuIndex = g.menuKeys.indexOf('standard');
  g.input('enter');
  const r = { chaos: g.chaosMode, step: g._announceStep(), state: g.state };
  g.input('pause'); g.input('back'); g.input('up'); g.input('enter');
  return r;
});
check(after.state === 'standard' && after.chaos === false && after.step === 30, 'standard mode after a chaos run is plain standard mode');

const made = await page.evaluate(() => window.__ctxMade);
check(made.offline === 0 && made.live === 0, `no audio engine made during the chaos runs (offline ${made.offline}, live ${made.live})`);
check(errors.length === 0, 'no errors in the page' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
