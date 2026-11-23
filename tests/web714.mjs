// Web 7.1.4: an iPad is told about its top button, an iPhone its side button (the Home
// button on older models of both); and the play page's Refresh and check for updates
// button. Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/web714.mjs http://localhost:8790

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8790';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

async function lead(opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 }));
  await page.goto(base + '/play.html');
  await page.click('#start');
  await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 120000 });
  const text = await page.locator('#lead').textContent();
  await ctx.close();
  return text;
}
const ipad = await lead({ userAgent: MAC, hasTouch: true, isMobile: true, viewport: { width: 1024, height: 1366 } });
check(/triple-click the top button, or the Home button on older models/.test(ipad) && !/side button/.test(ipad), 'an iPad is told to triple-click the top button, or the Home button on older models: ' + ipad.slice(0, 220));
const iphone = await lead({ userAgent: IPHONE, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
check(/triple-click the side button, or the Home button on older models/.test(iphone) && !/top button/.test(iphone), 'an iPhone is told the side button: ' + iphone.slice(0, 200));

// The Refresh button.
{
  const ctx = await browser.newContext();
  await ctx.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  await page.goto(base + '/play.html');
  const version = JSON.parse(await (await page.request.get(base + '/version.json')).text()).version;
  const first = await page.evaluate(() => {
    const i = document.getElementById('intro');
    const b = document.getElementById('refresh');
    return { firstControl: i.querySelector('button, a') === b, label: b.textContent, note: document.getElementById('refresh-note').textContent, live: document.getElementById('refresh-note').getAttribute('aria-live') };
  });
  check(first.firstControl && first.label === 'Refresh and check for updates', 'the play page has Refresh and check for updates at its top, before Start');
  check(first.note === `Version ${version}.` && first.live === 'polite', `it says the version this page is: ${first.note}`);
  // Same version: it says so, and opens the page afresh at a new address.
  const notes = [];
  await page.exposeFunction('noteSeen', (t) => notes.push(t));
  await page.evaluate(() => new MutationObserver(() => window.noteSeen(document.getElementById('refresh-note').textContent)).observe(document.getElementById('refresh-note'), { childList: true, characterData: true, subtree: true }));
  await Promise.all([page.waitForURL(/refresh=\d+/, { timeout: 10000 }), page.click('#refresh')]);
  const u1 = new URL(page.url());
  check(notes.includes('Checking for updates.') && notes.some((n) => n === `You have the newest version, ${version}. Refreshing.`), 'same version: it checks, then says you have the newest version: ' + notes.join(' | '));
  check(u1.pathname.endsWith('/play.html') && u1.searchParams.get('v') === version && /^\d+$/.test(u1.searchParams.get('refresh')), 'and opens the game afresh, at a new address: ' + u1.search);
  // A newer version on the site: it says it is updating.
  await page.waitForLoadState('load'); await page.waitForTimeout(800);
  await page.route('**/version.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{ "version": "99.0.0" }' }));
  const notes2 = [];
  await page.exposeFunction('noteSeen2', (t) => notes2.push(t));
  await page.evaluate(() => new MutationObserver(() => window.noteSeen2(document.getElementById('refresh-note').textContent)).observe(document.getElementById('refresh-note'), { childList: true, characterData: true, subtree: true }));
  await Promise.all([page.waitForURL(/v=99\.0\.0/, { timeout: 10000 }), page.click('#refresh')]);
  check(notes2.includes('Updating to version 99.0.0.'), 'a newer version: it says it is updating to it: ' + notes2.join(' | '));
  await ctx.close();
  // No connection: it says so, and stays.
  const ctx2 = await browser.newContext();
  await ctx2.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));
  const p2 = await ctx2.newPage();
  await p2.goto(base + '/play.html');
  await p2.waitForTimeout(500);
  await p2.route('**/version.json*', (r) => r.abort());
  await p2.click('#refresh');
  await p2.waitForFunction(() => /could not be reached/.test(document.getElementById('refresh-note').textContent));
  check(!(await p2.locator('#refresh').isDisabled()) && !/refresh=/.test(p2.url()), 'with no connection it says the website could not be reached, stays, and the button works again');
  await ctx2.close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
