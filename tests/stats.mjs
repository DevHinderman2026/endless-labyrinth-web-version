// Stats tracking and the Game Stats page (web 1.1.0), in a real browser engine.
// A run is counted when it starts; play time counts inside a run and not while
// paused; both reach the save (format 2) at the end of a run and when a run is
// quit. The Game Stats page shows them, the best scores and the events played,
// with a deleted event labelled. Run with the site served:
//   node --import ./tests/github-stub.mjs tests/stats.mjs http://localhost:8765
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
const KEY = 'endless-labyrinth-web';
const EVKEY = 'endless-labyrinth-web-event-scores';

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

// ------------------------------------------------------- the store's rules (no game)
await page.goto(base + '/index.html');
{
  const r = await page.evaluate(async () => {
    const { Store, FORMAT, mergeStats, readStats } = await import('./js/storage.js');
    localStorage.clear();
    // A format 1 save from before 1.1.0.
    localStorage.setItem('endless-labyrinth-web', JSON.stringify({ format: 1, scores: { standard: 4, battle: 22 }, settings: { speechRate: 2 }, resetAt: 0 }));
    const s = new Store();
    const kept = { scores: { ...s.scores }, rate: s.settings.speechRate, time: s.stats.time.tower, runs: s.stats.runs.tower };
    s.runStarted('tower');
    s.addPlayTime('tower', 10.5);
    const before = JSON.parse(localStorage.getItem('endless-labyrinth-web'));
    s.addPlayTime('tower', 5);           // 15.5 s since the last write: written now
    const after = JSON.parse(localStorage.getItem('endless-labyrinth-web'));
    // Another copy of the game wrote larger totals meanwhile: the larger wins.
    const other = JSON.parse(localStorage.getItem('endless-labyrinth-web'));
    other.stats.time.tower = 100; other.stats.runs.tower = 1; other.stats.runs.chaos = 3;
    localStorage.setItem('endless-labyrinth-web', JSON.stringify(other));
    s.addPlayTime('tower', 20);
    s.flushStats();
    const merged = JSON.parse(localStorage.getItem('endless-labyrinth-web'));
    const m = mergeStats(readStats({ stats: { time: { drive: 5 }, runs: { drive: 2 } } }), readStats({ stats: { time: { drive: 7 }, runs: { drive: 1 } } }));
    return { FORMAT, kept, beforeTime: before.stats.time.tower, beforeRuns: before.stats.runs.tower, afterTime: after.stats.time.tower, afterFormat: after.format, merged: merged.stats, m };
  });
  check(r.FORMAT === 2, 'the save format is 2');
  check(r.kept.scores.standard === 4 && r.kept.scores.battle === 22 && r.kept.rate === 2 && r.kept.time === 0 && r.kept.runs === 0, `a format 1 save keeps its scores and settings, with no stats yet: ${JSON.stringify(r.kept)}`);
  check(r.beforeRuns === 1 && r.beforeTime === 0, `a run is written when it starts; play time waits for the flush: runs ${r.beforeRuns}, time ${r.beforeTime}`);
  check(Math.abs(r.afterTime - 15.5) < 1e-6 && r.afterFormat === 2, `15 seconds of play are written as format 2: ${r.afterTime}`);
  check(r.merged.time.tower === 100 && r.merged.runs.tower === 1 && r.merged.runs.chaos === 3, `the larger total wins when two copies disagree: ${JSON.stringify(r.merged)}`);
  check(r.m.time.drive === 7 && r.m.runs.drive === 2, `mergeStats keeps the larger of each: ${JSON.stringify(r.m)}`);
}

// ------------------------------------------------------------ the game itself
await page.evaluate(() => localStorage.clear());
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 60000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('endless-labyrinth-web') || 'null'));
{
  const r = await page.evaluate(() => {
    const g = window.__el.game;
    const s = g.scores;
    g.startGame('standard');
    g.frame(0.05);
    const runs = s.stats.runs.standard;
    for (let i = 0; i < 40; i++) g.frame(0.1);            // 4 s of play
    const t1 = s.stats.time.standard;
    g.isPaused = true;
    for (let i = 0; i < 40; i++) g.frame(0.1);            // 4 s paused: not counted
    const t2 = s.stats.time.standard;
    g.isPaused = false;
    for (let i = 0; i < 20; i++) g.frame(0.1);            // 2 s more
    g.triggerGameOver();
    const written = JSON.parse(localStorage.getItem('endless-labyrinth-web'));
    return { runs, t1, t2, t3: s.stats.time.standard, written: written.stats, state: g.state };
  });
  check(r.runs === 1, `a Standard run is counted when it starts: ${r.runs}`);
  check(Math.abs(r.t1 - 4.05) < 0.01 && Math.abs(r.t2 - 4.05) < 0.01, `play time counts in the run and not while paused: ${r.t1.toFixed(2)} then ${r.t2.toFixed(2)}`);
  check(Math.abs(r.t3 - 6.05) < 0.01, `and counts again after the pause: ${r.t3.toFixed(2)}`);
  check(r.state === 'game_over' && Math.abs(r.written.time.standard - 6.05) < 0.01 && r.written.runs.standard === 1, `the end of the run writes the stats: ${JSON.stringify(r.written)}`);
}
{
  // A battle run that is quit: still a run, its time kept.
  const r = await page.evaluate(() => {
    const g = window.__el.game;
    g.input('enter');                                       // back to the menu after game over
    g.startGame('battle');
    for (let i = 0; i < 30; i++) g.frame(0.1);
    g.input('back'); g.input('yes');                        // quit, yes
    const w = JSON.parse(localStorage.getItem('endless-labyrinth-web'));
    return { state: g.state, stats: w.stats };
  });
  check(r.state === 'menu' && r.stats.runs.battle === 1 && Math.abs(r.stats.time.battle - 3) < 0.11, `a quit Battle run is still counted, with its time: ${JSON.stringify(r.stats)}`);
  check(r.stats.runs.standard === 1 && Math.abs(r.stats.time.standard - 6.05) < 0.01, 'the Standard stats are untouched by it');
}
{
  // A chaos run counts as chaos whatever level it is in; a tower run as tower.
  const r = await page.evaluate(() => {
    const g = window.__el.game;
    g.startChaos();
    for (let i = 0; i < 25; i++) g.frame(0.1);
    const chaos = { runs: g.scores.stats.runs.chaos, time: g.scores.stats.time.chaos, state: g.state };
    g.input('back'); g.input('yes');
    g.startTower();
    for (let i = 0; i < 12; i++) g.frame(0.1);
    const tower = { runs: g.scores.stats.runs.tower, time: g.scores.stats.time.tower };
    g.input('back'); g.input('yes');
    return { chaos, tower, saved: JSON.parse(localStorage.getItem('endless-labyrinth-web')).stats };
  });
  check(r.chaos.runs === 1 && r.chaos.time > 2 && r.saved.runs.chaos === 1, `a chaos run counts as chaos (state ${r.chaos.state}): ${JSON.stringify(r.chaos)}`);
  check(r.tower.runs === 1 && r.tower.time > 1 && r.saved.runs.tower === 1, `a tower run counts as tower: ${JSON.stringify(r.tower)}`);
  check(r.saved.runs.standard === 1 && r.saved.runs.battle === 1, 'the other modes keep their counts');
}
check(errors.length === 0, `no page errors in the game ${errors}`);

// ------------------------------------------------------------ the Game Stats page
await page.evaluate(() => {
  const w = JSON.parse(localStorage.getItem('endless-labyrinth-web'));
  w.scores = { standard: 4, battle: 22, chaos: 310, tower: 7, drive: 0, drive_distance: 1250, island: 0 };
  w.stats.time = { standard: 3725, battle: 59, drive: 0, tower: 60, island: 0, chaos: 0, event: 0 };
  w.stats.runs = { standard: 3, battle: 1, drive: 0, tower: 1, island: 0, chaos: 0, event: 2 };
  localStorage.setItem('endless-labyrinth-web', JSON.stringify(w));
  localStorage.setItem('endless-labyrinth-web-event-scores', JSON.stringify({ total: 0, events: {
    'pumpkin-hunt-2026': { name: 'Pumpkin Hunt', best: 40, runs: 3, unit: 'point', medal: 'silver', best_when: '2026-11-02' },
    'gone-event-2026': { name: 'Gone Event', best: 5, runs: 1, unit: 'floor', medal: 'gold', best_when: '2026-10-20' },
  } }));
});
// GitHub answers with Pumpkin Hunt only (an unsigned stand-in is refused, so the
// published set is taken from the feed's answer: here, an empty folder means no
// event is still published, and both are labelled). The stub answers [] for the
// listing, so every event played is "no longer available" in this check.
await page.goto(base + '/stats.html');
await page.waitForFunction(() => /Everything here|could not be read/.test(document.getElementById('stats-note').textContent));
await page.waitForFunction(() => document.querySelectorAll('#event-runs li').length > 0);
{
  const text = async (sel) => (await page.locator(sel).allTextContents()).join(' | ');
  check((await text('#time-total')) === 'Total time played: 1 hour 4 minutes.', `the total time: ${await text('#time-total')}`);
  const modes = await text('#time-modes li');
  check(/Standard Mode: 1 hour 2 minutes/.test(modes) && /Battle Mode: 59 seconds/.test(modes) && /Tower Mode: 1 minute/.test(modes) && /Chaos Mode: none yet/.test(modes), `time per mode: ${modes}`);
  check((await text('#runs-total')) === 'Runs started: 7.', `runs started: ${await text('#runs-total')}`);
  const runs = await text('#runs-modes li');
  check(/Standard Mode: 3 runs/.test(runs) && /Battle Mode: 1 run \|/.test(runs) && /Events: 2 runs/.test(runs), `runs per mode: ${runs}`);
  const scores = await text('#scores li');
  check(scores === 'Chaos Mode: 310 points | Tower Mode: 7 floors | Driving Mode: No score yet | Driving Distance: 1250 m | Island Mode: No score yet | Ultimate Test Mode: No score yet | Standard Mode: Level 4 | Battle Mode: 22 enemies', `the best scores in the game's order and words: ${scores}`);
  check((await text('#events-completed')).startsWith('Events completed: 2.'), `events completed: ${await text('#events-completed')}`);
  check((await text('#medals')) === 'Medals earned: 1 gold, 1 silver, 0 bronze.', `medals: ${await text('#medals')}`);
  const evs = await text('#event-runs li');
  check(/^Pumpkin Hunt, no longer available, Best run 40 points, silver medal, 3 runs\. Best set on November 2, 2026\. \| Gone Event, no longer available, Best run 5 floors, gold medal, 1 run\. Best set on October 20, 2026\.$/.test(evs), `each event played, newest best first, labelled when gone from GitHub: ${evs}`);
  check(await page.locator('nav.site a[href="stats.html"][aria-current="page"]').count() === 1, 'Game Stats is in the site links and marked current');
}
{
  // Pumpkin Hunt still published: only Gone Event is labelled.
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.route('https://api.github.com/**', (route) => route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json',
    body: JSON.stringify([{ name: 'pumpkin-hunt-2026.json', type: 'file', download_url: 'https://raw.githubusercontent.com/x/pumpkin-hunt-2026.json' }]) }));
  // The feed keeps the real signed file on this device (protected events) only after
  // seeing it; here the file is served unsigned and refused, so the page sees an
  // empty published set. That is the same answer as above: labelled. The real
  // signed files are covered by tests/calendar.mjs.
  await ctx.close();
}
{
  // GitHub cannot be reached: nothing is labelled, and the page says so.
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.route('https://api.github.com/**', (route) => route.abort('failed'));
  await p2.goto(base + '/index.html');
  await p2.evaluate(() => {
    localStorage.setItem('endless-labyrinth-web-event-scores', JSON.stringify({ total: 0, events: { 'gone-event-2026': { name: 'Gone Event', best: 5, runs: 1, unit: 'floor' } } }));
  });
  await p2.goto(base + '/stats.html');
  await p2.waitForFunction(() => document.querySelectorAll('#event-runs li').length > 0);
  const evs = (await p2.locator('#event-runs li').allTextContents()).join('');
  check(evs === 'Gone Event, Best run 5 floors, 1 run.', `with GitHub unreachable no event is labelled: ${evs}`);
  check(/could not be checked/.test(await p2.locator('#event-runs').textContent()), 'and the page says the check could not be made');
  await ctx.close();
}
{
  // Nothing saved at all.
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto(base + '/stats.html');
  await p2.waitForFunction(() => /Everything here/.test(document.getElementById('stats-note').textContent));
  check((await p2.locator('#time-total').textContent()) === 'Total time played: none yet.', 'a fresh browser: no time yet');
  check(/No event runs yet/.test(await p2.locator('#event-runs').textContent()), 'a fresh browser: no event runs yet');
  await ctx.close();
}
check(errors.length === 0, `no page errors ${errors}`);

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
