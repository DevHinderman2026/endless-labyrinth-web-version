// Driving Mode, end to end in a real browser engine (Chromium, through Playwright).
// Run: serve the site folder (python3 -m http.server 8773), then
//   node tests/driving.mjs http://localhost:8773
// It checks the pack, Russell's driving gestures with synthetic touches and the
// keyboard, the crash penalty, the tunnel echo, then drives a run by script to
// game over, and quits a second run. It cannot hear: how it sounds is for a person.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8773';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(base + '/play.html?desktop=1');
await page.evaluate(() => localStorage.removeItem('endless-labyrinth-web'));
await page.reload();
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 60000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
const said = () => page.evaluate(() => document.getElementById('said').textContent);

// --------------------------------------------------------------- the pack
const pack = await page.evaluate(() => {
  const a = window.__el.audio;
  const names = [...Array(16).keys()].map((i) => `engine_${i}`).concat(['enemy_car', 'enemy_car_oncoming', 'crash', 'brake',
    'drv_skid_1', 'drv_skid_2', 'drv_skid_3', 'lane_change', 'credit_beacon_drive_10', 'credit_beacon_drive_20',
    'credit_beacon_drive_30', 'credit_drive_10', 'credit_drive_20', 'credit_drive_30',
    'laser', 'explosion', 'empty_click', 'ammo', 'ammo_beacon', 'boundary', 'countdown']);
  const missing = names.filter((n) => !a.has(n));
  const irs = ['tunnel', ...[...Array(6).keys()].map((i) => `tunnel/tunnel_${i}`)].filter((k) => (a.irEntries.get(k) || []).length !== 3);
  const dull = names.filter((n) => n.match(/^(engine_|enemy_car|drv_|credit_beacon_drive|credit_drive)/) && a.entries.get(n).dull);
  return { missing, irs, dull };
});
check(pack.missing.length === 0, 'every sound the road plays is loaded' + (pack.missing.length ? ': missing ' + pack.missing.join(', ') : ''));
check(pack.irs.length === 0, 'the tunnel echo and its six variations, three takes each' + (pack.irs.length ? ': missing ' + pack.irs.join(', ') : ''));
check(pack.dull.length === 0, 'no dull copies for the road\'s own sounds (as the desktop\'s behind_applies)');

// --------------------------------------------------------------- menu, help, boards
const menu = await page.evaluate(() => {
  const g = window.__el.game;
  return { opts: g.menuOptions, lines: g._scoreLines() };
});
check(menu.opts.includes('Driving Mode'), 'the main menu has Driving Mode: ' + menu.opts.join(' | '));
check(menu.lines.includes('Driving Mode: No score yet') && menu.lines.includes('Driving Distance: No score yet'), 'the two Driving boards are listed');
const help = await page.evaluate(async () => {
  const { HELP } = await import('/js/game.js');
  const a = window.__el.audio;
  const sec = HELP.find(([n]) => n === 'Driving Mode');
  const demo = HELP.find(([n]) => n === 'Demos, Driving Mode');
  return { sec: sec && sec[1].length, demo: demo && demo[1].length,
    missing: demo ? demo[1].filter((t) => t.sound && !a.has(t.sound)).map((t) => t.sound) : ['(none)'],
    keys: HELP.filter(([n]) => /Driv/.test(n)).flatMap(([, it]) => it).filter((t) => /\b(Space|Enter|arrow|press)\b/i.test(t.desc)).map((t) => t.title) };
});
check(help.sec === 9 && help.demo === 12, `help has Driving Mode (${help.sec} topics) and Demos, Driving Mode (${help.demo})`);
check(help.missing.length === 0, 'every driving demo sound is in the packs');
check(help.keys.length === 0, 'no key names left in the driving help' + (help.keys.length ? ': ' + help.keys.join(', ') : ''));

// --------------------------------------------------------------- start
await page.evaluate(() => {
  const g = window.__el.game;
  window.__g = [];
  const orig = g.input.bind(g);
  g.input = (x) => { window.__g.push(x); orig(x); };
  g.menuIndex = g.menuKeys.indexOf('drive');
  g.input('enter');
});
await page.waitForTimeout(100);
const st = await page.evaluate(() => {
  const g = window.__el.game;
  return { state: g.state, lane: g.driveLane, ammo: g.ammo, time: g.timeLeft, next: g.nextAnnounceTime, room: window.__el.audio.room,
    variant: window.__el.audio.variants.tunnel, engine: [...window.__el.audio.live].filter((v) => v.name.startsWith('engine_')).map((v) => v.name),
    gm: g.gestures.mode };
});
check(st.state === 'drive' && st.lane === 1 && st.ammo === 8, `Driving Mode starts in the middle lane with 8 shots (${st.state}, lane ${st.lane}, ${st.ammo})`);
check(Math.abs(st.time - 120) < 1 && st.next === 60, `two minutes on the clock, first call at one minute (${st.time.toFixed(1)}, ${st.next})`);
check(/Driving Mode\. Two minutes\./.test(await said()), 'it says: ' + (await said()));
check(st.room === 'tunnel' && /^tunnel\/tunnel_[0-5]$/.test(st.variant), `the road is the tunnel room, variation ${st.variant}`);
check(st.engine.length === 1 && st.engine[0] === 'engine_0', 'the engine idles at a standstill: ' + st.engine.join(', '));
check(st.gm === 'drive', 'gestures are in drive mode on the road');
// An empty road while the gestures are tried (the game runs in real time meanwhile).
await page.evaluate(() => { const g = window.__el.game; g.driveThings = []; g.driveSpawnAt = 1e12; g.driveNextCredit = Infinity; g.timeLeft = 600; });

// --------------------------------------------------------------- gestures, by touch
// Touches that stay down: start, move and end are separate steps.
await page.evaluate(() => {
  const el = document.getElementById('stage');
  const down = new Map();
  const mk = (id, x, y) => new Touch({ identifier: id, target: el, clientX: x, clientY: y });
  const fire = (type, changed) => el.dispatchEvent(new TouchEvent(type, {
    touches: [...down.values()], targetTouches: [...down.values()], changedTouches: changed, bubbles: true, cancelable: true }));
  window.__t = {
    start(id, x, y) { const t = mk(id, x, y); down.set(id, t); fire('touchstart', [t]); },
    move(id, x, y) { const t = mk(id, x, y); down.set(id, t); fire('touchmove', [t]); },
    end(id) { const t = down.get(id); down.delete(id); fire('touchend', [t]); },
  };
});
const T = (fn, ...args) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, args]);
const events = () => page.evaluate(() => window.__g.splice(0).filter((x) => x !== 'clock'));
const game = (f) => page.evaluate(f);
const slideUp = async (id = 0) => { await T('start', id, 200, 500); await T('move', id, 200, 480); await T('move', id, 200, 440); };
await events();

// Slide up and hold: accelerating while the finger stays down.
await slideUp();
let ev = await events();
await page.waitForTimeout(700);
let s1 = await game(() => ({ held: window.__el.game.driveUpHeld, acc: window.__el.game.driveAccelerating, speed: window.__el.game.driveSpeed }));
check(JSON.stringify(ev) === '["accel_on"]' && s1.held && s1.acc && s1.speed > 5, `slide up and hold accelerates (${ev.join(' ')}; ${s1.speed.toFixed(1)} m/s)`);
// The held finger moving about a little, and further up, changes nothing.
await T('move', 0, 205, 420); await T('move', 0, 200, 400); await T('move', 0, 203, 410);
check((await events()).length === 0 && await game(() => window.__el.game.driveUpHeld), 'the held finger wandering a little changes nothing');
// A second finger added while accelerating does nothing special.
await T('start', 1, 300, 500); await T('end', 1);
ev = await events();
check(ev.length === 0 && await game(() => window.__el.game.driveUpHeld), 'a second finger added while accelerating does nothing: ' + JSON.stringify(ev));
// Release: coast.
const before = await game(() => window.__el.game.driveSpeed);
await T('end', 0);
ev = await events();
await page.waitForTimeout(400);
s1 = await game(() => ({ held: window.__el.game.driveUpHeld, speed: window.__el.game.driveSpeed }));
check(JSON.stringify(ev) === '["accel_off"]' && !s1.held && s1.speed < before && s1.speed > before - 7 * 0.6, `lifting the finger coasts (${before.toFixed(1)} to ${s1.speed.toFixed(1)} m/s): ${ev.join(' ')}`);
// Slide up, then down without lifting: stops accelerating and brakes once.
await slideUp();
await page.waitForTimeout(500);
await T('move', 0, 200, 400);              // the highest point
await T('move', 0, 200, 420);
let mid = await events();
await T('move', 0, 200, 440);              // 40 px down from the top
ev = await events();
s1 = await game(() => ({ held: window.__el.game.driveUpHeld, live: [...window.__el.audio.live].map((v) => v.name) }));
await T('move', 0, 200, 520);              // further down: nothing more
await T('end', 0);
const ev2 = await events();
check(JSON.stringify(mid) === '["accel_on"]' && JSON.stringify(ev) === '["accel_off","down"]' && !s1.held && ev2.length === 0,
  `sliding the held finger down: ${mid.join(' ')}, then ${ev.join(' ')}, then nothing (${ev2.join(' ')})`);
check(s1.live.includes('brake'), 'that one brake plays the brake');
// Lifted: swipes left and right change lanes; a fresh swipe down brakes.
await game(() => { const g = window.__el.game; g.driveSpeed = 30; g.driveGrace = 5; g.driveThings = []; });
const swipe = async (dx, dy) => { await T('start', 0, 200, 300); await T('move', 0, 200 + dx / 2, 300 + dy / 2); await T('move', 0, 200 + dx, 300 + dy); await T('end', 0); };
await swipe(-80, 0);
const laneL = await game(() => window.__el.game.driveLane);
await swipe(80, 0);
const laneR = await game(() => window.__el.game.driveLane);
const sp0 = await game(() => window.__el.game.driveSpeed);
await swipe(0, 80);
const sp1 = await game(() => window.__el.game.driveSpeed);
ev = await events();
check(JSON.stringify(ev) === '["left","right","down"]' && laneL === 0 && laneR === 1, `swipes left and right change lanes (${laneL}, ${laneR}): ${ev.join(' ')}`);
check(Math.abs((sp0 - sp1) - 34 * 0.35) < 0.5, `a fresh swipe down is one brake: ${sp0.toFixed(1)} to ${sp1.toFixed(1)} m/s`);
// Two-finger tap shoots, double tap reports, at once.
await T('start', 0, 150, 300); await T('start', 1, 250, 300); await T('end', 0); await T('end', 1);
await page.waitForTimeout(30);
await T('start', 0, 200, 300); await T('end', 0); await page.waitForTimeout(60); await T('start', 0, 200, 300); await T('end', 0);
await page.waitForTimeout(30);
ev = await events();
check(JSON.stringify(ev) === '["space","enter"]', 'two-finger tap and double tap: ' + ev.join(' '));
check(/shots?\. \d+ cars? down\. \d+ metres\./.test(await said()), 'the report: ' + (await said()));
// Three fingers pause; the held throttle is let go of; three more resume.
await slideUp();
await T('end', 0);
await events();
await slideUp();
await page.waitForTimeout(50);
await game(() => window.__el.game.input('pause'));
await page.waitForTimeout(80);
s1 = await game(() => ({ p: window.__el.game.isPaused, held: window.__el.game.driveUpHeld, gh: window.__el.game.gestures.accelHeld, gm: window.__el.game.gestures.mode }));
await T('end', 0);
ev = await events();
check(s1.p && !s1.held && !s1.gh && s1.gm === 'menu' && !ev.includes('accel_off'), 'pausing lets go of the throttle, and lifting the finger afterwards does nothing');
await game(() => window.__el.game.input('pause'));
await page.waitForTimeout(80);
check(!(await game(() => window.__el.game.isPaused)) && !(await game(() => window.__el.game.driveAccelerating)), 'resumed, the car coasts until a finger slides up again');
await events();

// The keyboard's held up arrow.
await page.keyboard.down('ArrowUp');
await page.keyboard.down('ArrowUp');       // a repeat
await page.waitForTimeout(300);
const kh = await game(() => window.__el.game.driveAccelerating);
await page.keyboard.up('ArrowUp');
await page.waitForTimeout(50);
ev = await events();
check(kh && JSON.stringify(ev) === '["accel_on","accel_off"]' && !(await game(() => window.__el.game.driveAccelerating)), 'the held up arrow accelerates: ' + ev.join(' '));

// --------------------------------------------------------------- rules
const rules = await page.evaluate(async () => {
  const { RoadThing, DRIVE } = await import('/js/modes/driving.js');
  const g = window.__el.game;
  const a = window.__el.audio;
  const out = {};
  // A crash: thirty seconds and all your speed, the pile-up cleared, grace.
  g.driveThings = [];
  g.driveGrace = 0;
  g.driveSpeed = 40;
  g.timeLeft = 100;
  g.thirtySecAnnounced = false;
  g.driveThings.push(new RoadThing('car', g.driveLane, g.driveDist + 2, { speed: -20, oncoming: true }));
  g.driveThings.push(new RoadThing('car', (g.driveLane + 1) % 3, g.driveDist + 150, { speed: 10 }));
  const dist0 = g.driveTravelled;
  g.frame(0.01);
  out.crashTime = g.timeLeft;
  out.crashSpeed = g.driveSpeed;
  out.grace = g.driveGrace;
  out.left = g.driveThings.length;
  out.kept = g.driveTravelled >= dist0;
  out.sounds = [...a.live].map((v) => v.name).filter((n) => n === 'crash' || n === 'brake');
  out.penalty = DRIVE.DRIVE_CRASH_PENALTY;
  // A crash past the thirty second mark says where the clock is (50 - 0.01 - 30: 19).
  g.driveGrace = 0; g.timeLeft = 50; g.thirtySecAnnounced = false;
  g.driveThings = [new RoadThing('car', g.driveLane, g.driveDist + 1, { speed: -20, oncoming: true })];
  g.frame(0.01);
  out.said = document.getElementById('said').textContent;
  // Standing still: no lane change, only the buzz.
  g.driveSpeed = 0; g.driveThings = [];
  const lane = g.driveLane;
  g.input('left');
  out.stillLane = g.driveLane === lane && [...a.live].some((v) => v.name === 'boundary');
  // Shooting: an oncoming car in the way is passed through, the car behind it goes.
  g.driveSpeed = 20; g.ammo = 2; g.driveKills = 0;
  g.driveThings = [new RoadThing('car', g.driveLane, g.driveDist + 50, { speed: -15, oncoming: true }),
    new RoadThing('car', g.driveLane, g.driveDist + 120, { speed: 15 })];
  g.input('space');
  out.shot = [g.driveKills, g.driveThings.length, g.driveThings[0].oncoming, g.ammo];
  g.input('space');
  out.miss = [g.driveKills, g.ammo];
  g.ammo = 0; g.input('space');
  out.empty = [...a.live].some((v) => v.name === 'empty_click');
  // A credit in your lane: its value onto the clock.
  g.timeLeft = 40; g.driveThings = [new RoadThing('credit', g.driveLane, g.driveDist + 1, { value: 20 })];
  g.frame(0.01);
  out.credit = g.timeLeft;
  out.creditSound = [...a.live].some((v) => v.name === 'credit_drive_20');
  // The clock: once a minute on the road.
  out.step = g._announceStep();
  return out;
});
check(Math.abs(rules.crashTime - (100 - 0.01 - rules.penalty)) < 1e-6 && rules.penalty === 30, `a crash costs DRIVE_CRASH_PENALTY (${rules.penalty}) seconds: 100 to ${rules.crashTime.toFixed(2)}`);
check(rules.crashSpeed === 0 && rules.grace === 3 && rules.left === 1 && rules.kept, 'and all your speed, with three seconds of grace; the pile-up cleared, the road beyond kept, the distance kept');
check(rules.sounds.includes('crash') && rules.sounds.includes('brake'), 'a crash plays the crash and the brake');
check(/^19 seconds left\.$/.test(rules.said), 'a crash past the thirty second mark says where the clock is: ' + rules.said);
check(rules.stillLane, 'a car standing still cannot change lanes: only the boundary buzz');
check(JSON.stringify(rules.shot) === '[1,1,true,1]' && JSON.stringify(rules.miss) === '[1,0]' && rules.empty, `a shot passes through an oncoming car and takes the car behind it; a miss is silent; empty clicks (${rules.shot} / ${rules.miss})`);
check(Math.abs(rules.credit - (40 - 0.01 + 20)) < 1e-6 && rules.creditSound, 'a credit adds its value and plays its own pickup');
check(rules.step === 60, 'the clock is called once a minute on the road');

// --------------------------------------------------------------- the tunnel echo
const echo = await page.evaluate(() => {
  const g = window.__el.game;
  const a = window.__el.audio;
  g.driveThings = [];
  g.driveFeature = null;
  g.driveNextKind = 'tunnel';
  g.driveNextFeature = g.driveDist;
  g.driveUpHeld = true;
  g.timeLeft = 500;
  let maxEnv = 0; let maxDiff = 0; let sawTunnel = false;
  for (let i = 0; i < 30 * 30 && g.state === 'drive'; i++) {
    g.driveGrace = 5;
    const env = g.driveFeatureEnv;       // the room is levelled before the road moves on, as on the desktop
    g.frame(1 / 30);
    if (g.driveFeature && g.driveFeature.kind === 'tunnel') sawTunnel = true;
    maxEnv = Math.max(maxEnv, g.driveFeatureEnv);
    if (g.reverbTick === 0) maxDiff = Math.max(maxDiff, Math.abs(a.roomGain - env));
  }
  return { sawTunnel, maxEnv, maxDiff, env: g.driveFeatureEnv, gain: a.roomGain, variant: a.variants.tunnel };
});
check(echo.sawTunnel && echo.maxEnv === 1 && echo.maxDiff < 1e-9, `a tunnel's echo fades in to full and the room follows it at once (largest gap ${echo.maxDiff})`);

// --------------------------------------------------------------- a run, by script, to game over
const run = await page.evaluate(async () => {
  const { DRIVE } = await import('/js/modes/driving.js');
  const g = window.__el.game;
  const a = window.__el.audio;
  g.input('pause'); g.input('back');               // quit this run...
  g.input('up'); g.input('enter');                 // ...yes
  g.menuIndex = g.menuKeys.indexOf('drive');
  g.input('enter');                                // and a fresh one
  const out = { crashes: 0, credits: 0, ammo: 0, shots: 0, wall: 0, itemClash: 0, spawned: 0, frames: 0, maxRamp: 0, lanes: 0 };
  const seen = new Set();
  g.input('accel_on');
  let lastTime = g.timeLeft;
  for (let i = 0; i < 30 * 60 * 30 && g.state === 'drive'; i++) {
    g.frame(1 / 30);
    out.frames += 1;
    if (g.state !== 'drive') break;
    if (g.timeLeft < lastTime - 20) out.crashes += 1;
    if (g.timeLeft > lastTime + 5) out.credits += 1;
    lastTime = g.timeLeft;
    out.maxRamp = Math.max(out.maxRamp, g._driveRamp());
    // The guarantees, checked for each thing as it comes onto the road.
    for (const t of g.driveThings) {
      if (seen.has(t)) continue;
      seen.add(t);
      out.spawned += 1;
      if (t.kind === 'car' && t.oncoming) {
        const lanes = new Set(g.driveThings.filter((o) => o.kind === 'car' && o.oncoming && Math.abs(o.dist - t.dist) < DRIVE.DRIVE_WALL_WINDOW - 5).map((o) => o.lane));
        if (lanes.size > 3 - DRIVE.DRIVE_MIN_FREE_LANES) out.wall += 1;
      }
      if (t.kind === 'credit' || t.kind === 'ammo') {
        if (g.driveThings.some((o) => o.kind === 'car' && o.oncoming && o.lane === t.lane && o.dist > g.driveDist)) out.itemClash += 1;
      }
    }
    if (i % 3) continue;
    // A simple driver: away from anything coming at you, toward credits, and
    // shoot the car ahead in your lane.
    const ahead = (lane, kind, range, oncoming) => g.driveThings.filter((t) => t.kind === kind && t.lane === lane
      && (oncoming === undefined || t.oncoming === oncoming) && t.dist - g.driveDist > -3 && t.dist - g.driveDist < range);
    const danger = (lane) => ahead(lane, 'car', 140, true).length + ahead(lane, 'car', 12, false).length;
    const me = g.driveLane;
    if (danger(me)) {
      const opts = [me - 1, me + 1].filter((l) => l >= 0 && l < 3).sort((x, y) => danger(x) - danger(y));
      if (opts.length && danger(opts[0]) < danger(me)) { g.input(opts[0] < me ? 'left' : 'right'); out.lanes += 1; continue; }
    }
    if (ahead(me, 'car', 200, false).length && g.ammo > 0) { g.input('space'); out.shots += 1; continue; }
    const credit = g.driveThings.find((t) => (t.kind === 'credit' || t.kind === 'ammo') && t.dist > g.driveDist && t.lane !== me);
    if (credit) {
      const to = credit.lane < me ? me - 1 : me + 1;
      if (!danger(to)) { g.input(to < me ? 'left' : 'right'); out.lanes += 1; }
    }
  }
  out.state = g.state;
  out.kills = g.driveKills;
  out.metres = Math.trunc(g.driveTravelled);
  out.minutes = (out.frames / 30 / 60).toFixed(1);
  out.boards = [g.scores.scores.drive, g.scores.scores.drive_distance];
  out.lines = g._scoreLines().filter((l) => /Driving/.test(l));
  out.loops = [...a.live].filter((v) => v.loop).map((v) => v.name);
  out.things = g.driveThings.length;
  return out;
});
check(run.state === 'game_over', `the scripted driver ran ${run.minutes} minutes to game over: ${run.kills} cars, ${run.metres} m, ${run.crashes} crashes, ${run.credits} credits, ${run.shots} shots, ${run.lanes} lane changes`);
check(run.spawned > 50 && run.wall === 0, `oncoming cars never wall off the road (${run.spawned} things laid down)`);
check(run.itemClash === 0, 'a credit or cartridge never shares a lane with an oncoming car ahead');
check(run.boards[0] === run.kills && run.boards[1] === run.metres, `both boards recorded: ${run.lines.join(' | ')}`);
check(run.loops.length === 0 && run.things === 0, 'no loops left playing after game over: ' + run.loops.join(', '));
await page.waitForTimeout(100);
const over = await said();
check(new RegExp(`^Time up\\. You shot down ${run.kills} cars? and travelled ${run.metres} metres\\. `).test(over)
  && /New distance record: \d+ metres\. Double tap to return to the menu\.$/.test(over), 'game over is spoken: ' + over);

// A second run: no high score message, then the distance line only when beaten.
const second = await page.evaluate(() => {
  const g = window.__el.game;
  g.input('enter');
  g.menuIndex = g.menuKeys.indexOf('drive');
  g.input('enter');
  for (let i = 0; i < 30 * 200 && g.state === 'drive'; i++) g.frame(1 / 30);    // never moves
  return { state: g.state, said: document.getElementById('said').textContent };
});
check(second.state === 'game_over' && /^Time up\. You shot down 0 cars and travelled 0 metres\. (Your high score is \d+\. |No high score yet for cars destroyed\. )Double tap to return to the menu\.$/.test(second.said),
  'a run that never moves: ' + second.said);

// --------------------------------------------------------------- quitting a run
const quit = await page.evaluate(() => {
  const g = window.__el.game;
  const a = window.__el.audio;
  g.input('enter');
  g.menuIndex = g.menuKeys.indexOf('drive');
  g.input('enter');
  g.input('accel_on');
  for (let i = 0; i < 30 * 20; i++) { g.driveGrace = 5; g.frame(1 / 30); }
  const before = [...a.live].filter((v) => v.loop).map((v) => v.name);
  g.input('pause');
  g.input('back');
  const asked = g.state;
  g.input('up');
  g.input('enter');
  for (let i = 0; i < 10; i++) g.frame(1 / 30);
  return { before, asked, state: g.state, loops: [...a.live].filter((v) => v.loop).map((v) => v.name), things: g.driveThings.length, held: g.driveUpHeld };
});
check(quit.before.some((n) => n.startsWith('engine_')) && quit.asked === 'confirm_exit' && quit.state === 'menu', `quitting a run mid-road (${quit.before.length} loops were playing)`);
check(quit.loops.length === 0 && quit.things === 0 && !quit.held, 'no loops left playing after quitting: ' + quit.loops.join(', '));

check(errors.length === 0, 'no errors in the page' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
