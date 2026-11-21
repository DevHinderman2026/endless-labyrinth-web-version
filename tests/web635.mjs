// Web 6.3.5: every mode's high score board starts fresh, once, for every player
// (Russell, 21 November 2026), and the Event High Scores are not touched.
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
const browser = await chromium.launch();
const RESET = Date.UTC(2026, 10, 21, 19, 0, 0);

async function withSave(save, events, path = '/play.html?desktop=1') {
  const page = await browser.newPage();
  await page.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));
  await page.addInitScript(([save, events]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('endless-labyrinth-web', JSON.stringify(save));
    if (events) localStorage.setItem(events[0], JSON.stringify(events[1]));
  }, [save, events]);
  await page.goto(base + path);
  await page.waitForTimeout(800);
  return page;
}

const eventsKey = await (async () => { const p = await browser.newPage(); await p.goto(base + '/index.html'); const k = await p.evaluate(async () => (await import('./js/modes/events/feed.js')).EVENT_SCORES_KEY || null); await p.close(); return k; })();
const evs = { total: 120, events: { 'pumpkin-hunt-2026': { name: 'Pumpkin Hunt', best: 77, runs: 3 } } };

// An old save: its boards go back to 0, its play time and runs stay, the events stay.
{
  const page = await withSave({ format: 2, scores: { standard: 12, battle: 9, ultimate: 4400, abyss: 7 }, settings: { speechRate: 4 }, resetAt: 0, stats: { time: { standard: 600 }, runs: { standard: 5 } } }, eventsKey ? [eventsKey, evs] : null);
  const r = await page.evaluate((k) => {
    const d = JSON.parse(localStorage.getItem('endless-labyrinth-web'));
    return { scores: d.scores, resetAt: d.resetAt, time: d.stats.time.standard, runs: d.stats.runs.standard, rate: d.settings.speechRate, events: k ? JSON.parse(localStorage.getItem(k)) : null };
  }, eventsKey);
  check(Object.values(r.scores).every((v) => v === 0) && r.resetAt >= RESET, 'a save from before 6.3.5 has every board set back to 0: ' + JSON.stringify(r.scores));
  check(r.time === 600 && r.runs === 5 && r.rate === 4, 'play time, runs and settings are kept');
  check(!eventsKey || (r.events && r.events.events['pumpkin-hunt-2026'].best === 77), 'the Event High Scores are not touched');
  // A score set after the reset stays the next time the game is opened.
  await page.evaluate(async () => { const { Store } = await import('./js/storage.js'); const s = new Store(); s.scores.standard = 15; s.save(); });
  await page.reload(); await page.waitForTimeout(800);
  const again = await page.evaluate(() => JSON.parse(localStorage.getItem('endless-labyrinth-web')).scores.standard);
  check(again === 15, 'a score made after the reset is kept: ' + again);
  await page.close();
}

// The Game Stats page shows an old save's boards as none, before the game is opened.
{
  const page = await withSave({ format: 2, scores: { standard: 12 }, settings: {}, resetAt: 0, stats: {} }, null, '/stats.html');
  const txt = await page.evaluate(() => (document.getElementById('scores') || document.body).textContent);
  check(!/\b12\b/.test(txt) && /No score yet/.test(txt), 'the Game Stats page shows no old score: ' + txt.slice(0, 120));
  await page.close();
}

// A backup made before 6.3.5 does not bring the old boards back.
{
  const page = await browser.newPage(); await page.goto(base + '/index.html');
  const r = await page.evaluate(async () => {
    const b = await import('./js/backup.js');
    const oldBackup = { game: { scores: { standard: 30 }, settings: {}, resetAt: 0 }, events: { total: 5, events: {} } };
    const mine = { game: { scores: { standard: 3 }, settings: {}, resetAt: Date.UTC(2026, 10, 21, 19, 0, 0) }, events: { total: 0, events: {} } };
    return { combined: b.combine(mine, oldBackup).game.scores.standard, replaced: b.replacement(oldBackup).game.scores.standard || 0 };
  });
  check(r.combined === 3 && r.replaced === 0, 'restoring a backup from before the reset keeps the old boards away: ' + JSON.stringify(r));
  await page.close();
}

// The labyrinth's exit beeps are played at the exit's own place (6.3.5, Russell: "not in one position").
{
  const page = await browser.newPage();
  await page.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));
  await page.goto(base + '/play.html?desktop=1'); await page.click('#start');
  await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 90000 });
  await page.keyboard.press('ArrowUp'); await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
  const r = await page.evaluate(async () => {
    const g = window.__el.game; const a = window.__el.audio; const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    g.menuIndex = g.menuKeys.indexOf('standard'); g.input('enter'); await sleep(2000);
    const beeps = []; const op = a.play.bind(a);
    a.play = (name, opts) => { const v = op(name, opts); if (/^prox_/.test(name)) beeps.push({ at: !!(opts && opts.at), exact: !!(opts && opts.at && opts.at[0] === g.exitPos[0] && opts.at[1] === g.exitPos[1]), dirFirst: !!(v && v.atRel) }); return v; };
    for (let i = 0; i < 24; i++) { g.timeLeft = 500; g.input(i % 3 ? 'up' : 'left'); await sleep(250); }
    a.play = op;
    return { n: beeps.length, ok: beeps.filter((b) => b.at && b.exact && b.dirFirst).length };
  });
  check(r.n > 5 && r.ok === r.n, `every exit beep is played at the exit's place, its direction known before it starts: ${r.ok} of ${r.n}`);
  await page.close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
