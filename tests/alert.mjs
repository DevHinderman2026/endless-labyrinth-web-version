// The Windows update alert on the home page (web 1.4.0; a region named Alert since the evening of 6 November 2026, never a live alert),
// for 30 days after the latest release, by internet time; on the home page only;
// never when GitHub or the time cannot be reached; and with no way to dismiss it.
//   node tests/alert.mjs http://localhost:8765
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch();
const RELEASES = 'https://api.github.com/repos/DevHinderman2026/Endless-Labyrinth/releases/latest';

async function open(path, release, { github = true } = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('https://api.github.com/**', (route) => {
    if (!github) return route.abort();
    if (route.request().url().startsWith(RELEASES) && release) {
      return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify(release) });
    }
    return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' });
  });
  await page.goto(base + path);
  await page.waitForTimeout(1200);
  const alert = await page.evaluate(() => {
    const a = document.getElementById('windows-update-alert');
    if (!a) return null;
    return {
      role: a.getAttribute('role'), label: a.getAttribute('aria-label'), live: a.getAttribute('aria-live'),
      liveAlerts: document.querySelectorAll('[role="alert"]').length, tag: a.tagName,
      id: a.id, text: a.textContent.trim(),
      // The first thing a screen reader meets (the empty live region before it is never reached).
      first: [...document.body.children].find((c) => c.id !== 'site-announcer') === a,
      link: a.querySelector('a') ? a.querySelector('a').getAttribute('href') : null,
      buttons: a.querySelectorAll('button').length,
    };
  });
  await page.close();
  return { alert, errors };
}

const day = 86400 * 1000;
const fresh = { tag_name: 'v2.0.0', published_at: new Date(Date.now() - 2 * day).toISOString(), html_url: 'https://github.com/DevHinderman2026/Endless-Labyrinth/releases/tag/v2.0.0' };
const old = { ...fresh, published_at: new Date(Date.now() - 31 * day).toISOString() };
const edge = { ...fresh, published_at: new Date(Date.now() - 29 * day).toISOString() };

{
  const { alert, errors } = await open('/index.html', fresh);
  check(alert && alert.id === 'windows-update-alert', 'a release two days old shows the alert on the home page');
  check(alert && alert.first, 'the alert is the first thing on the page');
  check(alert && alert.role === 'region' && alert.label === 'Alert' && alert.tag === 'SECTION', `it is a region named Alert: ${alert && [alert.tag, alert.role, alert.label]}`);
  check(alert && !alert.live && alert.liveAlerts === 0, 'it is not a live alert, so it never interrupts the screen reader');
  check(alert && /^Update available for Windows: Endless Labyrinth 2\.0\.0 includes important bug fixes and stability improvements that make gameplay considerably easier\. For the best experience, we strongly recommend downloading the update\. Download Endless Labyrinth 2\.0\.0 for Windows\.$/.test(alert.text), `the wording, with the version number: ${alert && alert.text}`);
  check(alert && alert.link === fresh.html_url, 'the link goes to the release');
  check(alert && alert.buttons === 0, 'there is nothing to dismiss it with');
  check(errors.length === 0, `no page errors: ${errors}`);
}
{
  const { alert } = await open('/index.html', edge);
  check(alert !== null, 'a release 29 days old still shows it');
}
{
  const { alert } = await open('/index.html', old);
  check(alert === null, 'a release 31 days old does not');
}
{
  // (While Windows 3.0.1's own alert has its 15 days it shows by its date alone: see below.)
  const { alert } = await open('/index.html', null);
  const due = Date.now() >= Date.UTC(2026, 10, 12) && Date.now() < Date.UTC(2026, 10, 12) + 15 * day;
  check(due ? (alert && /^Windows players, please update/.test(alert.text)) : alert === null, 'no release: no ordinary alert');
}
// Windows 3.0.1's own alert (12 November 2026): 15 days from 12 November, by
// internet time; it interrupts the screen reader through the empty assertive
// live region, which it fills a moment after the page loads and empties later.
const RELEASE_FROM = Date.UTC(2026, 10, 12);
const inWindow = Date.now() >= RELEASE_FROM && Date.now() < RELEASE_FROM + 15 * day;
const r301 = { tag_name: 'v3.0.1', published_at: new Date(RELEASE_FROM + 3600 * 1000).toISOString(), html_url: 'https://github.com/DevHinderman2026/Endless-Labyrinth/releases/tag/v3.0.1' };
const WORDS = 'Windows players, please update: Endless Labyrinth 3.0.1 is the latest version for Windows, and we strongly urge every Windows player to install it. It brings many fixes, and the event system has been rebalanced. Download Endless Labyrinth 3.0.1 for Windows.';
async function openLive(release, { github = true } = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('https://api.github.com/**', (route) => {
    if (!github) return route.abort();
    return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify(release) });
  });
  await page.goto(base + '/index.html');
  const box = await page.evaluate(() => {
    const b = document.getElementById('site-announcer');
    return b && { live: b.getAttribute('aria-live'), atomic: b.getAttribute('aria-atomic'), text: b.textContent, inHtml: true };
  });
  await page.waitForTimeout(2500);
  const later = await page.evaluate(() => {
    const a = document.getElementById('windows-update-alert');
    return {
      spoken: document.getElementById('site-announcer').textContent,
      alert: a && { role: a.getAttribute('role'), label: a.getAttribute('aria-label'), text: a.textContent.trim(), link: a.querySelector('a').getAttribute('href'), buttons: a.querySelectorAll('button').length },
    };
  });
  await page.close();
  return { box, later, errors };
}
{
  const { box, later, errors } = await openLive(r301);
  check(box && box.live === 'assertive' && box.atomic === 'true' && box.text === '', 'the home page has an empty assertive live region from the start');
  if (inWindow) {
    check(later.alert && later.alert.role === 'region' && later.alert.label === 'Alert', 'within 15 days of 12 November, 3.0.1 has its own region named Alert');
    check(later.alert && later.alert.text === WORDS, `its wording: ${later.alert && later.alert.text}`);
    check(later.alert && later.alert.link === r301.html_url && later.alert.buttons === 0, 'it links to the release and cannot be dismissed');
    check(later.spoken === WORDS, `it is spoken by the live region after the page loads: ${later.spoken}`);
  } else {
    check(!later.alert && later.spoken === '', 'after its 15 days, 3.0.1 shows no alert at all (not even the ordinary one)');
  }
  check(errors.length === 0, `no page errors: ${errors}`);
}
{
  const { later, errors } = await openLive(r301, { github: false });
  check(inWindow ? (later.alert && later.spoken === WORDS) : !later.alert, 'GitHub unreachable: the 3.0.1 alert goes by its date alone');
  check(errors.length === 0, `GitHub unreachable: no page error: ${errors}`);
}
{
  // Once it has been spoken, the live region is emptied, so the words are met only once.
  const page = await browser.newPage();
  await page.route('https://api.github.com/**', (route) => route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify(r301) }));
  await page.goto(base + '/index.html');
  await page.waitForTimeout(10500);
  const spoken = await page.evaluate(() => document.getElementById('site-announcer').textContent);
  check(spoken === '', 'the live region is empty again a few seconds later');
  await page.close();
}
{
  // The ordinary alert never interrupts: a newer release than 3.0.1 shows it, and the live region stays empty.
  const { later } = await openLive(fresh);
  check(later.alert && /^Update available for Windows: Endless Labyrinth 2\.0\.0/.test(later.alert.text) && later.spoken === '', 'another release brings back the ordinary alert, which does not interrupt');
}
for (const path of ['/about.html', '/play.html', '/help.html', '/events.html']) {
  const { alert } = await open(path, fresh);
  check(alert === null, `${path}: no alert, the home page only`);
}
{
  // The time is the site's, not the device's: a device clock a year ahead changes nothing.
  const page = await browser.newPage();
  await page.route('https://api.github.com/**', (route) => route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify(fresh) }));
  await page.addInitScript(() => {
    const realNow = Date.now;
    Date.now = () => realNow() + 400 * 86400 * 1000;
  });
  await page.goto(base + '/index.html');
  await page.waitForTimeout(1200);
  const shown = await page.evaluate(() => !!document.getElementById('windows-update-alert'));
  check(shown, 'a device clock a year ahead does not hide a fresh release (internet time decides)');
  await page.close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
