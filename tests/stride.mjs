// Running and walking backwards on a touch screen (web 1.2.0), in a real browser
// engine, with synthetic touches: slide up and hold runs at 280 steps a minute;
// a finger held still for half a second walks backwards at 200; only lifting
// stops it; it stops by itself at a wall, the arena's edge and a new level; a
// quick swipe is still one step; turning, taps and driving are unchanged. Run:
//   node --import ./tests/github-stub.mjs tests/stride.mjs http://localhost:8765
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 60000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');

// Every gesture the game receives, with the time it arrived (steps of a run arrive
// through the game's own input, so they are recorded too).
await page.evaluate(() => {
  const g = window.__el.game;
  window.__log = [];
  const orig = g.input.bind(g);
  g.input = (x) => { window.__log.push([x, performance.now()]); orig(x); };
  window.__sounds = [];
  const play = g.audio.play.bind(g.audio);
  g.audio.play = (name, o) => { window.__sounds.push(name); return play(name, o); };
});
const fire = (type, pts) => page.evaluate(({ type, pts }) => {
  const el = document.getElementById('stage');
  const list = pts.map(([id, x, y]) => new Touch({ identifier: id, target: el, clientX: x, clientY: y }));
  el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : list, targetTouches: type === 'touchend' ? [] : list, changedTouches: list, bubbles: true, cancelable: true }));
}, { type, pts });
const down = (x = 200, y = 400, id = 0) => fire('touchstart', [[id, x, y]]);
const move = (x, y, id = 0) => fire('touchmove', [[id, x, y]]);
const up = (x = 200, y = 400, id = 0) => fire('touchend', [[id, x, y]]);
const wait = (ms) => page.waitForTimeout(ms);
const clear = () => page.evaluate(() => { window.__log = []; window.__sounds = []; });
const log = () => page.evaluate(() => window.__log.slice());
const steps = (l, dir) => l.filter(([x]) => x === dir).map(([, t]) => t);
const gaps = (ts) => ts.slice(1).map((t, i) => t - ts[i]);
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const game = (fn, arg) => page.evaluate(fn, arg);
// Russell's tempos, read from the game itself.
const { RUN, BACK } = await page.evaluate(async () => {
  const m = await import('./js/game.js');
  return { RUN: m.RUN_STEPS_PER_MINUTE, BACK: m.BACK_STEPS_PER_MINUTE };
});
check(RUN === 280 && BACK === 200, `the tempos are 280 steps a minute forward and 200 backward: ${RUN}, ${BACK}`);
const RUN_MS = 60000 / RUN;
const BACK_MS = 60000 / BACK;
const expectSteps = (heldMs, everyMs, delay = 0) => 1 + Math.floor((heldMs - delay) / everyMs);

// A labyrinth with nothing in the way, far from the exit.
const openLabyrinth = () => game(() => {
  const g = window.__el.game;
  g.startGame('standard');
  g.grid = new Set(); g.gridSize = 60; g.exitPos = [55, 55]; g.playerPos = [0, 0]; g.timeLeft = 999;
});

// ------------------------------------------------------------ running
await openLabyrinth();
await clear();
await down(); await move(200, 340);           // slide up 60 px and hold
await wait(1600);
let l = await log();
await up(200, 340);
await wait(450);
let l2 = await log();
{
  const ups = steps(l, 'up');
  const g = gaps(ups);
  check(l[0] && l[0][0] === 'run_start', `sliding up and holding starts a run: ${l.map(([x]) => x).slice(0, 3)}`);
  const want = expectSteps(1600, RUN_MS);
  check(Math.abs(ups.length - want) <= 1, `a 1.6 second run takes about ${want} steps forward: ${ups.length}`);
  check(Math.abs(mean(g) - RUN_MS) < 25, `at ${RUN} steps a minute (a step every ${RUN_MS.toFixed(0)} ms): ${mean(g).toFixed(0)} ms`);
  check(steps(l2, 'up').length === ups.length && l2.some(([x]) => x === 'stride_end'), 'lifting the finger stops the run at once');
  const pos = await game(() => window.__el.game.playerPos);
  check(pos[0] === 0 && pos[1] === -ups.length, `every step went forward, one cell each: ${pos}`);
}

// A quick swipe up is still one step.
await openLabyrinth(); await clear();
await down(); await move(200, 370); await move(200, 330); await up(200, 330);
await wait(500);
l = await log();
check(steps(l, 'up').length === 1 && (await game(() => window.__el.game.playerPos))[1] === -1, `a quick swipe up is one step: ${steps(l, 'up').length}`);

// ------------------------------------------------------------ walking backwards
await openLabyrinth(); await clear();
await down();
await wait(400);
l = await log();
check(steps(l, 'down').length === 0, 'a finger held still does nothing for the first half second');
await wait(1350);
l = await log();
await up();
await wait(600);
l2 = await log();
{
  const downs = steps(l, 'down');
  const first = downs[0] - (l.find(([x]) => x === 'back_start') || [0, 0])[1];
  check(l.some(([x]) => x === 'back_start'), 'holding still for half a second starts walking backwards');
  const want = expectSteps(1750, BACK_MS, 500);
  check(Math.abs(downs.length - want) <= 1, `1.75 seconds held: about ${want} steps back: ${downs.length}`);
  check(first < 50, 'the first backward step is at once');
  check(Math.abs(mean(gaps(downs)) - BACK_MS) < 25, `at ${BACK} steps a minute (every ${BACK_MS.toFixed(0)} ms): ${mean(gaps(downs)).toFixed(0)} ms`);
  check(steps(l2, 'down').length === downs.length, 'lifting stops the backward walk');
  const pos = await game(() => window.__el.game.playerPos);
  check(pos[0] === 0 && pos[1] === downs.length, `every step went back, one cell each: ${pos}`);
  check(!l2.some(([x]) => x === 'enter' || x === 'tap'), 'a long hold is never a tap');
}

// ------------------------------------------------------------ only lifting stops
await openLabyrinth(); await clear();
await down(); await move(200, 340);
await wait(350);
await move(200, 460);                          // slide back down, still touching
await move(140, 460);                          // and sideways
await wait(700);
l = await log();
await down(260, 300, 1); await up(260, 300, 1); // a second finger taps
await wait(400);
l2 = await log();
await up(140, 460);
{
  check(!l.some(([x]) => x === 'down' || x === 'left') && steps(l, 'up').length >= 3, `sliding down or sideways while running neither stops it nor turns: ${l.map(([x]) => x).join(' ')}`);
  check(!l2.some(([x]) => x === 'space' || x === 'enter') && steps(l2, 'up').length > steps(l, 'up').length, 'a second finger does nothing, and the run carries on (lift to shoot)');
}

// Taps and turning are unchanged.
await openLabyrinth(); await clear();
await down(); await up(); await wait(60); await down(); await up();
await wait(300);
await down(); await move(260, 400); await move(300, 400); await up(300, 400);
await wait(700);
l = await log();
check(l.some(([x]) => x === 'enter') && !l.some(([x]) => x === 'back_start'), 'a double tap is still the report, not a hold');
check(l.filter(([x]) => x === 'right').length === 1 && !l.some(([x]) => x === 'run_start'), 'a swipe right is still one turn and step to the right');

// ------------------------------------------------------------ stopping by itself
// A wall three cells north: two steps, the wall sounds once, and the run stops.
await openLabyrinth();
await game(() => { window.__el.game.grid.add('0,-3'); });
await clear();
await down(); await move(200, 340);
await wait(1600);
l = await log();
await up(200, 340);
{
  const walls = (await game(() => window.__sounds)).filter((n) => n === 'wall').length;
  const pos = await game(() => window.__el.game.playerPos);
  check(pos[1] === -2 && steps(l, 'up').length === 3, `a run stops at a wall: at ${pos} after ${steps(l, 'up').length} steps`);
  check(walls === 1, `the wall sounds once: ${walls}`);
}
// The exit two cells north: the level changes, and the run stops there.
await openLabyrinth();
await game(() => { const g = window.__el.game; g.exitPos = [0, -2]; window.__lv = g.level; });
await clear();
await down(); await move(200, 340);
await wait(1300);
l = await log();
await up(200, 340);
{
  const r = await game(() => ({ level: window.__el.game.level, was: window.__lv, stride: window.__el.game.stride }));
  check(r.level === r.was + 1 && steps(l, 'up').length === 2 && !r.stride, `a run stops when a new level begins: level ${r.was} to ${r.level}, ${steps(l, 'up').length} steps`);
}
// Battle: the edge of the arena stops a run.
await game(() => { const g = window.__el.game; g.startGame('battle'); g.playerPos = [0, -36]; g.timeLeft = 999; });
await clear();
await down(); await move(200, 340);
await wait(1300);
l = await log();
await up(200, 340);
{
  const r = await game(() => ({ pos: window.__el.game.playerPos, boundary: window.__sounds.filter((n) => n === 'boundary').length }));
  check(r.pos[1] === -39 && r.boundary === 1 && steps(l, 'up').length === 2, `a battle run stops at the arena's edge: ${r.pos}, boundary sounds ${r.boundary}`);
}
// A pause stops it, and resuming with the finger still down does not restart it.
await openLabyrinth(); await clear();
await down(); await move(200, 340);
await wait(700);
await game(() => window.__el.game.autoPause());
const atPause = steps(await log(), 'up').length;
await wait(600);
await game(() => { const g = window.__el.game; g.isPaused = false; g._resumeSounds(); });
await wait(800);
l = await log();
await up(200, 340);
check(steps(l, 'up').length === atPause, `a pause stops the run, and it stays stopped until the finger lifts: ${atPause} then ${steps(l, 'up').length}`);

// ------------------------------------------------------------ other modes
await game(() => { const g = window.__el.game; g.startTower(); g.playerPos = [0, 0]; });
await clear();
await down(); await move(200, 340);
await wait(1000);
await up(200, 340);
{
  const pos = await game(() => window.__el.game.playerPos);
  check(pos[1] <= -9 && pos[1] % 3 === 0 && pos[0] === 0, `tower: a run steps forward a full step at a time: ${pos}`);
}
await game(() => { const g = window.__el.game; g._stopRunSounds(); g.state = 'menu'; g.startDrive(); });
await wait(200);
await clear();
await down(); await move(200, 340);
await wait(800);
l = await log();
await up(200, 340);
await wait(100);
l2 = await log();
check(l.some(([x]) => x === 'accel_on') && !l.some(([x]) => x === 'run_start' || x === 'back_start'), 'driving keeps its own accelerator: slide up and hold accelerates');
check(l2.some(([x]) => x === 'accel_off'), 'and lifting lets go of it');
await game(() => { const g = window.__el.game; g._stopRunSounds(); g.state = 'menu'; });
{
  // A reflex event answers with up and down: holding never repeats them there.
  const r = await game(() => {
    const g = window.__el.game;
    const keep = { state: g.state, ev: g.ev };
    g.state = 'event'; g.ev = { mission: 'reflex' };
    const reflex = g._canStride();
    g.ev = { mission: 'collect' };
    const collect = g._canStride();
    g.state = keep.state; g.ev = keep.ev;
    return { reflex, collect };
  });
  check(r.reflex === false && r.collect === true, `no running in a reflex event, running in other events: ${JSON.stringify(r)}`);
}
{
  // The keyboard is unchanged: a held arrow is one step.
  await openLabyrinth(); await clear();
  await page.keyboard.down('ArrowUp'); await wait(900); await page.keyboard.up('ArrowUp');
  l = await log();
  check(steps(l, 'up').length === 1, `a held arrow key is still one step: ${steps(l, 'up').length}`);
}

// ------------------------------------------------------------ Gesture Practice
await game(() => { const g = window.__el.game; g._stopRunSounds(); g.state = 'menu'; g._startPractice(); });
await wait(100);
const said = () => page.evaluate(() => document.getElementById('said').textContent);
await down(); await move(200, 360); await move(200, 320); await up(200, 320);
await wait(150);
check((await said()) === 'Swipe up.', `practice: a quick slide up is a swipe up: ${await said()}`);
await down(); await move(200, 340); await wait(500);
check(/^Slide up and hold\./.test(await said()), `practice: slide up and hold is named: ${await said()}`);
await up(200, 340); await wait(100);
check(/^Lifted\./.test(await said()), `practice: lifting is named: ${await said()}`);
await down(); await wait(700);
check(/^Holding still\./.test(await said()), `practice: holding still is named: ${await said()}`);
await up(); await wait(100);
check(errors.length === 0, `no page errors ${errors}`);

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
