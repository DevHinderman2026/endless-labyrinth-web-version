// The Events calendar page (web 1.1.0), in a real browser engine. GitHub is never
// reached: the published events are served from the desktop repository's events
// folder, plus altered and unsigned copies that must be refused, and this site's
// Date header is set to a fixed day. Run with the site served:
//   node tests/calendar.mjs http://localhost:8765 [desktop folder]
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const base = process.argv[2] || 'http://localhost:8765';
const desk = process.argv[3] || '/home/claude/work/desktop';
const EVENTS = path.join(desk, 'events');
const API = 'https://api.github.com/repos/DevHinderman2026/Endless-Labyrinth/contents/events?ref=main';
const RAW = 'https://raw.githubusercontent.com/DevHinderman2026/Endless-Labyrinth/main/events/';
// Pumpkin Hunt has ended, Turkey Hunt is on, Call of Fate, The Angry Papa and The
// Music Box are still to come.
const NOW = new Date('2026-11-10T12:00:00Z');

let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const files = {};
for (const f of fs.readdirSync(EVENTS).filter((n) => n.endsWith('.json'))) files[f] = fs.readFileSync(path.join(EVENTS, f), 'utf8');
const pumpkin = files['pumpkin-hunt-2026.json'];
files['zz-altered.json'] = pumpkin.replace('"id": "pumpkin-hunt-2026"', '"id": "pumpkin-hunt-altered"').replace('Pumpkin Hunt', 'Pumpkin Hunt Altered');
const unsigned = JSON.parse(pumpkin); unsigned.id = 'pumpkin-unsigned'; unsigned.name = 'Pumpkin Unsigned'; delete unsigned.signature;
files['zz-unsigned.json'] = JSON.stringify(unsigned, null, 1);
// A stopped event: a signed file with enabled false would need re-signing, so a
// stopped one is simulated by the game's own rule (status 'stopped') in a unit check below.

const browser = await chromium.launch();
let mode = 'ok';   // 'ok', 'offline', 'limit'

async function open(opts = {}, before = null) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // A refused or failed request to GitHub is logged by the browser itself; that is the point of those checks.
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const cors = { 'Access-Control-Allow-Origin': '*' };
  await ctx.route(API, (route) => {
    if (mode === 'offline') return route.abort('failed');
    if (mode === 'limit') return route.fulfill({ status: 403, headers: cors, contentType: 'application/json', body: '{"message":"API rate limit exceeded"}' });
    const list = Object.keys(files).map((name) => ({ name, type: 'file', download_url: RAW + name }));
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(list) });
  });
  await ctx.route(RAW + '*', (route) => {
    const name = decodeURIComponent(route.request().url().slice(RAW.length));
    if (!(name in files)) return route.fulfill({ status: 404, headers: cors, body: '' });
    return route.fulfill({ status: 200, headers: cors, contentType: 'text/plain; charset=utf-8', body: files[name] });
  });
  // The site's own time: the Date header of packs/manifest.json.
  await ctx.route('**/packs/manifest.json', async (route) => {
    const res = await route.fetch();
    const headers = { ...res.headers(), date: NOW.toUTCString() };
    return route.fulfill({ response: res, headers });
  });
  if (before) await page.addInitScript(before);
  await page.goto(base + '/events.html');
  await page.waitForFunction(() => !/Checking the events now/.test(document.getElementById('events-status').textContent));
  return { ctx, page, errors };
}

// ------------------------------------------------------------------ the groups
{
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';
  const { ctx, page, errors } = await open({ userAgent: IPHONE, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } }, () => {
    localStorage.setItem('endless-labyrinth-web-event-scores', JSON.stringify({ total: 0, events: {
      'pumpkin-hunt-2026': { name: 'Pumpkin Hunt', best: 40, runs: 3, unit: 'point', medal: 'silver', best_when: '2026-11-02' },
      'turkey-hunt-2026-2': { name: 'Turkey Hunt', best: 1, runs: 1, unit: 'enemy' },
    } }));
  });
  const names = async (id) => page.locator(`#${id} article h3`).allTextContents();
  const live = await names('live'); const up = await names('upcoming'); const past = await names('past');
  check(live.join('|') === 'Turkey Hunt', `on now: ${live}`);
  check(up.join('|') === 'Call of Fate|The Angry Papa|The Music Box', `coming soon, soonest first: ${up}`);
  check(past.join('|') === 'Pumpkin Hunt', `past: ${past}`);
  const all = [...live, ...up, ...past];
  check(!all.some((n) => /Altered|Unsigned/.test(n)), 'an altered or unsigned event is never shown');
  check(await page.locator('#live').evaluate((e) => e.compareDocumentPosition(document.getElementById('upcoming')) & 4), 'on now comes before coming soon');
  const status = await page.textContent('#events-status');
  check(status === '5 events: 1 on now, 3 coming soon, 1 past.', `the count line: ${status}`);
  const turkey = page.locator('#event-turkey-hunt-2026-2');
  check(/^On now\. Ends in \d+ days? /.test(await turkey.locator('.event-status').textContent()), `Turkey Hunt says it is on now: ${await turkey.locator('.event-status').textContent()}`);
  check(/your local time\.$/.test(await turkey.locator('.event-dates').textContent()), 'dates are shown in local time');
  check((await turkey.locator('.event-runs').textContent()) === 'Your best run: 1 enemy, 1 run played.', `own runs in Turkey Hunt: ${await turkey.locator('.event-runs').textContent()}`);
  const pumpkinRuns = await page.locator('#event-pumpkin-hunt-2026 .event-runs').textContent();
  check(/^Your best run: 40 points, silver medal, 3 runs played\. Best set on .*2026\.$/.test(pumpkinRuns), `own runs with a medal and a date: ${pumpkinRuns}`);
  check(/^Ended on /.test(await page.locator('#event-pumpkin-hunt-2026 .event-status').textContent()), 'an ended event says when it ended');
  const fate = page.locator('#event-call-of-fate-2026');
  check(/^Coming soon\. Starts in \d+ days/.test(await fate.locator('.event-status').textContent()), 'Call of Fate is coming soon');
  check((await fate.locator('.event-runs').textContent()) === 'You have not played this event on this device.', 'an event never played says so');
  const desc = await fate.locator('.event-description').textContent();
  check(/double tap|swipe|two-finger/i.test(desc) && !/\bEnter tells you\b|\bwith Space\b/.test(desc), 'on a phone the description names gestures');
  check(await page.locator('nav.site a[href="events.html"][aria-current="page"]').count() === 1, 'the Events page is in the site links and marked current');
  check(errors.length === 0, `no page errors ${errors}`);
  await ctx.close();
}

// --------------------------------------------------------- a Windows computer
{
  const { ctx, page } = await open({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
  const desc = await page.locator('#event-call-of-fate-2026 .event-description').textContent();
  check(/\bEnter\b|\bSpace\b|arrow/.test(desc) && !/double tap|two-finger/.test(desc), 'on a Windows computer the description keeps the keyboard words');
  await ctx.close();
}

// ----------------------------------------------- GitHub cannot be reached
for (const m of ['offline', 'limit']) {
  mode = m;
  const { ctx, page, errors } = await open();
  const status = await page.textContent('#events-status');
  check(status === "The event server can't be reached. Please try again later.", `${m}: the page says the event server can't be reached: ${status}`);
  check(await page.locator('#groups').isHidden(), `${m}: no groups are shown`);
  check(errors.length === 0, `${m}: no page errors ${errors}`);
  await ctx.close();
}
mode = 'ok';

// ------------------------------------------------- the grouping rule itself
{
  const { grouped } = await import('../js/calendar.js');
  const ev = (id, start, end, enabled = true) => ({ id, name: id, _start: start, _end: end, enabled });
  const g = grouped([ev('a', 0, 10), ev('b', 5, 20), ev('c', 30, 40), ev('d', 25, 35), ev('e', 0, 15), ev('f', 50, 60, false)], 12);
  check(g.live.map((e) => e.id).join('') === 'eb', `on now, soonest ending first: ${g.live.map((e) => e.id)}`);
  check(g.upcoming.map((e) => e.id).join('') === 'dc', `coming soon, soonest starting first: ${g.upcoming.map((e) => e.id)}`);
  check(g.past.map((e) => e.id).join('') === 'fa', `past, most recently ended first, a stopped event among them: ${g.past.map((e) => e.id)}`);
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
