// End-to-end checks in a real browser engine (Chromium, through Playwright).
// Run: serve the site folder (python3 -m http.server 8765), then
//   node tests/smoke.mjs http://localhost:8765
// It loads the sound packs, plays both modes by script, and drives the touch
// gestures with synthetic touches. It cannot hear: how things sound is for a person.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// Home page and the contact address.
await page.goto(base + '/index.html');
const contact = await page.locator('footer [data-contact] a').getAttribute('href');
check(contact === 'mailto:russellhinderman425@gmail.com', 'contact link is written in by script');
check(await page.locator('#computer-note').isVisible(), 'a computer is told to use the Windows version');
for (const pg of ['index.html', 'about.html', 'credits.html', 'history.html']) {
  await page.goto(base + '/' + pg);
  check(await page.locator('nav.site a[href="history.html"]').count() === 1, `${pg} links to the Update History`);
}
await page.goto(base + '/history.html');
check((await page.locator('main h2').allTextContents()).join(' | ').startsWith('1.0.1'), 'the Update History lists the newest version first');
await page.goto(base + '/credits.html');
check((await page.locator('#list li').count()) >= 40, 'credits list the recordings');

// The play page on a computer, with the test switch.
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 60000 });
check(true, 'sound packs downloaded and decoded');
const counts = await page.evaluate(() => ({ entries: window.__el.audio.entries.size, buffers: window.__el.audio.buffers.size }));
check(counts.entries > 80, `pack entries: ${counts.entries}, decoded now: ${counts.buffers}`);

// Exact lengths: a loop is cut to its frames.
const lens = await page.evaluate(async () => {
  const a = window.__el.audio;
  const out = {};
  for (const n of ['obstacle_0', 'ammo_beacon', 'prox_3', 'credit_beacon']) {
    out[n] = [a.buffers.get('dry:' + n).length, a.entries.get(n).dry.frames, !!a.buffers.get('dull:' + n)];
  }
  const drone = await a.prepare('lab_03_scifi_cave');
  out.lab_03 = [drone.length, a.entries.get('lab_03_scifi_cave').dry.frames, false];
  return out;
});
for (const [n, [len, frames, dull]] of Object.entries(lens)) check(len === frames, `${n} decoded to its exact length ${frames}${dull ? ', with its dull copy' : ''}`);

// Swipe up begins (keyboard here).
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
check(true, 'swipe up (ArrowUp) begins the game at the main menu');

// --------------------------------------------------------------- gestures, by touch
const touch = async (kind, points, moves = []) => page.evaluate(({ kind, points, moves }) => {
  const el = document.getElementById('stage');
  const mk = (id, x, y) => new Touch({ identifier: id, target: el, clientX: x, clientY: y });
  const fire = (type, list, changed) => el.dispatchEvent(new TouchEvent(type, {
    touches: list, targetTouches: list, changedTouches: changed, bubbles: true, cancelable: true }));
  const ts = points.map(([x, y], i) => mk(i, x, y));
  fire('touchstart', ts, ts);
  for (const m of moves) { const mt = m.map(([x, y], i) => mk(i, x, y)); fire('touchmove', mt, mt); }
  const last = moves.length ? moves[moves.length - 1].map(([x, y], i) => mk(i, x, y)) : ts;
  fire('touchend', [], last);
}, { kind, points, moves });
const swipe = (dx, dy) => touch('swipe', [[200, 300]], [[[200 + dx / 2, 300 + dy / 2]], [[200 + dx, 300 + dy]]]);
const tap = () => touch('tap', [[200, 300]]);
const taps = async (n) => { for (let i = 0; i < n; i++) { await tap(); await page.waitForTimeout(60); } };
const said = () => page.evaluate(() => document.getElementById('said').textContent);

await page.evaluate(() => { window.__g = []; const orig = window.__el.game.input.bind(window.__el.game); window.__el.game.input = (g) => { window.__g.push(g); orig(g); }; });
await swipe(0, 80); await page.waitForTimeout(50);
await swipe(0, -80); await page.waitForTimeout(50);
await swipe(80, 0); await page.waitForTimeout(50);
await swipe(-80, 0); await page.waitForTimeout(50);
await taps(2); await page.waitForTimeout(450);
let got = await page.evaluate(() => window.__g.splice(0));
check(JSON.stringify(got) === '["down","up","right","left","enter"]', 'swipes and a double tap in a menu: ' + got.join(' '));
// We are now in Standard mode (the menu started at Standard).
check(await page.evaluate(() => window.__el.game.state) === 'standard', 'double tap on Standard Mode starts it');
// During a run a double tap acts at once.
await taps(2); await page.waitForTimeout(30);
got = await page.evaluate(() => window.__g.splice(0));
check(got[0] === 'enter' && /second/.test(await said()), 'mid-run double tap is the clock report at once: ' + (await said()));
// Triple tap mid-run does nothing beyond one report.
await taps(3); await page.waitForTimeout(450);
got = await page.evaluate(() => window.__g.splice(0));
check(!got.includes('back') && await page.evaluate(() => window.__el.game.state) === 'standard', 'a triple tap mid-run never quits: ' + got.join(' '));
// Three fingers pause.
await touch('three', [[100, 300], [200, 300], [300, 300]]);
await page.waitForTimeout(30);
check(await page.evaluate(() => window.__el.game.isPaused), 'three-finger tap pauses');
const held = await page.evaluate(() => window.__el.game.pausedVoices.map((v) => v.name));
check(held.every((n) => n.includes('beacon') || n.startsWith('prox_')), 'the pause holds only beacons and beeps: ' + held.join(', '));
// Paused: triple tap asks to quit; swipe to Yes; double tap.
await taps(3); await page.waitForTimeout(450);
check(await page.evaluate(() => window.__el.game.state) === 'confirm_exit', 'paused, a triple tap asks whether to quit');
await taps(2); await page.waitForTimeout(450);
check(await page.evaluate(() => window.__el.game.state) === 'standard' && /Still paused/.test(await said()), 'No goes back to the paused game');
await touch('three', [[100, 300], [200, 300], [300, 300]]);
await page.waitForTimeout(30);
check(!(await page.evaluate(() => window.__el.game.isPaused)), 'three-finger tap resumes');
// Two fingers: Space.
await touch('two', [[150, 300], [250, 300]]);
await page.waitForTimeout(30);
got = await page.evaluate(() => window.__g.splice(0));
check(got.includes('space'), 'two-finger tap is Space');

// --------------------------------------------------------------- standard mode by script
const std = await page.evaluate(async () => {
  const g = window.__el.game;
  const a = window.__el.audio;
  const out = { walls: 0, steps: 0, levels: 0 };
  // Walk to the exit by the shortest path, three levels.
  const keyOf = (x, y) => x + ',' + y;
  for (let lv = 0; lv < 3; lv++) {
    const start = g.level;
    const prev = new Map([[keyOf(0, 0), null]]);
    const q = [[0, 0]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === g.exitPos[0] && y === g.exitPos[1]) break;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = x + dx; const ny = y + dy;
        if (Math.abs(nx) > g.gridSize || Math.abs(ny) > g.gridSize || g.grid.has(keyOf(nx, ny)) || prev.has(keyOf(nx, ny))) continue;
        prev.set(keyOf(nx, ny), [x, y]); q.push([nx, ny]);
      }
    }
    const path = [];
    let cur = [g.exitPos[0], g.exitPos[1]];
    while (cur && !(cur[0] === 0 && cur[1] === 0)) { path.unshift(cur); cur = prev.get(keyOf(cur[0], cur[1])); }
    let at = [0, 0];
    for (const p of path) {
      const dx = p[0] - at[0]; const dy = p[1] - at[1];
      g.input(dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up');
      g.frame(0.05);
      at = p;
      out.steps += 1;
      if (g.level !== start) break;
    }
    if (g.level === start + 1) out.levels += 1;
    // Bump a wall if one is next to the start.
    for (const [dx, dy, gname] of [[0, -1, 'up'], [0, 1, 'down'], [-1, 0, 'left'], [1, 0, 'right']]) {
      if (g.grid.has(keyOf(dx, dy))) { g.input(gname); out.walls += 1; break; }
    }
  }
  out.live = [...a.live].map((v) => v.name);
  out.room = a.room;
  out.variant = a.variants.lab;
  out.time = g.timeLeft;
  // Run the clock out.
  for (let i = 0; i < 4000 && g.state === 'standard'; i++) g.frame(0.1);
  out.after = g.state;
  out.score = window.__el.game.scores.scores.standard;
  out.liveAfter = [...a.live].filter((v) => v.loop).map((v) => v.name);
  return out;
});
check(std.levels === 3, `walked three labyrinth levels (${std.steps} steps, ${std.walls} wall bumps)`);
check(std.live.some((n) => n.startsWith('lab_')) && std.room === 'lab' && /^lab\/lab_/.test(std.variant), `a labyrinth drone plays and sets the room: ${std.variant}`);
check(std.after === 'game_over' && std.score === 4, `the clock runs out to game over; high score ${std.score}`);
check(std.liveAfter.length === 0, 'no loops left playing after the run: ' + std.liveAfter.join(', '));
await page.waitForTimeout(100);
check(/reached level 4/.test(await said()), 'game over is spoken: ' + (await said()));

// --------------------------------------------------------------- battle mode by script
const bat = await page.evaluate(async () => {
  const g = window.__el.game;
  g.input('enter');               // back to the menu
  g.menuIndex = 1;
  g.input('enter');               // Battle Mode
  const out = { state: g.state, ammo0: g.ammo, waves: 0, kills: 0, breaks: 0, pickups: 0, credits: 0, maxEnemies: 0 };
  let lastWave = 1;
  // A simple player: walk toward ammo and credits during breaks, otherwise line
  // up with the nearest enemy (step sideways) and fire when it is centred.
  for (let i = 0; i < 20000 && g.state === 'battle'; i++) {
    g.frame(1 / 30);
    if (g.state !== 'battle') break;
    out.maxEnemies = Math.max(out.maxEnemies, g.obstacles.length);
    if (g.battleWave !== lastWave) { out.waves += 1; lastWave = g.battleWave; }
    if (i % 6) continue;
    const [px, py] = g.playerPos;
    if (g.inWaveBreak) {
      const t = g.ammoPickups[0] || g.timeCredit;
      if (t) {
        const dx = t.x - px; const dy = t.y - py;
        if (Math.abs(dx) > Math.abs(dy)) g.input(dx > 0 ? 'right' : 'left'); else g.input(dy > 0 ? 'down' : 'up');
      }
      continue;
    }
    const locked = g._battleLocked();
    if (locked && g.ammo > 0) { g.input('space'); continue; }
    if (g.obstacles.length) {
      let near = g.obstacles[0];
      for (const o of g.obstacles) if (Math.hypot(o.x - px, o.y - py) < Math.hypot(near.x - px, near.y - py)) near = o;
      g.input(near.x > px ? 'right' : 'left');
    } else if (g.ammoPickups.length) {
      const t = g.ammoPickups[0];
      const dx = t.x - px; const dy = t.y - py;
      if (Math.abs(dx) > Math.abs(dy)) g.input(dx > 0 ? 'right' : 'left'); else g.input(dy > 0 ? 'down' : 'up');
    }
  }
  out.end = g.state;
  out.kills = g.kills;
  out.wave = g.battleWave;
  out.score = g.scores.scores.battle;
  out.live = [...window.__el.audio.live].filter((v) => v.loop).map((v) => v.name);
  return out;
});
check(bat.state === 'battle' && bat.ammo0 === 7, `battle starts with ${bat.ammo0} shots (wave one's four plus three)`);
check(bat.kills > 0 && bat.waves >= 1, `the scripted player shot ${bat.kills} enemies and reached wave ${bat.wave}, at most ${bat.maxEnemies} at once`);
check(bat.end === 'game_over' && bat.score === bat.kills, `battle ends and saves ${bat.score}`);
check(bat.live.length === 0, 'no loops left after battle: ' + bat.live.join(', '));
await page.waitForTimeout(100);
console.log('  said: ' + (await said()));

// --------------------------------------------------------------- help, and a demo after its text
const help = await page.evaluate(async () => {
  const g = window.__el.game;
  g.input('enter');               // menu
  g.input('help');
  const s1 = g.state;
  // Down to "Demos, Standard Mode", wherever the added modes' sections put it.
  for (let i = 0; i < 40 && document.getElementById('said').textContent.indexOf('Demos, Standard Mode') !== 0; i++) g.input('down');
  const want = g.helpCatIndex;
  g.input('enter');
  g.input('down');                // Footstep
  return { s1, cat: g.helpCat === want ? 4 : -1, idx: g.helpIndex };
});
check(help.s1 === 'help' && help.cat === 4 && help.idx === 1, 'help opens and moves to a demo topic');
await page.waitForFunction(() => window.__el.audio.demoVoice, null, { timeout: 15000 }).then(
  () => check(true, 'the demo plays after its topic is read'), () => check(false, 'the demo plays after its topic is read'));

// --------------------------------------------------------------- high scores kept
await page.reload();
const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('endless-labyrinth-web')).scores);
check(kept.standard === 4 && kept.battle === bat.score, 'scores survive a reload: ' + JSON.stringify(kept));

check(errors.length === 0, 'no errors in the page' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
