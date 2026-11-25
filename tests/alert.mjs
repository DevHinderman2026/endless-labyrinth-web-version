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
    const a = document.getElementById('windows-update-alert') || document.getElementById('windows-coming-alert');
    if (!a) return null;
    return {
      role: a.getAttribute('role'), label: a.getAttribute('aria-label'), live: a.getAttribute('aria-live'),
      liveAlerts: document.querySelectorAll('[role="alert"]').length, tag: a.tagName,
      id: a.id, text: a.textContent.trim(),
      // The first thing a screen reader meets (the empty live region before it is never reached).
      first: [...document.body.children].find((c) => c.id !== 'site-announcer' && c.id !== 'scores-reset-alert') === a,
      link: a.querySelector('a') ? a.querySelector('a').getAttribute('href') : null,
      buttons: a.querySelectorAll('button').length,
    };
  });
  await page.close();
  return { alert, errors };
}

const day = 86400 * 1000;
const fresh = { tag_name: 'v9.0.0', published_at: new Date(Date.now() - 2 * day).toISOString(), html_url: 'https://github.com/DevHinderman2026/Endless-Labyrinth/releases/tag/v9.0.0' };
const old = { ...fresh, published_at: new Date(Date.now() - 31 * day).toISOString() };
const edge = { ...fresh, published_at: new Date(Date.now() - 29 * day).toISOString() };

{
  const { alert, errors } = await open('/index.html', fresh);
  check(alert && alert.id === 'windows-update-alert', 'a release two days old shows the alert on the home page');
  check(alert && alert.first, 'the alert is the first thing on the page');
  check(alert && alert.role === 'region' && alert.label === 'Alert' && alert.tag === 'SECTION', `it is a region named Alert: ${alert && [alert.tag, alert.role, alert.label]}`);
  check(alert && !alert.live && alert.liveAlerts === 0, 'it is not a live alert, so it never interrupts the screen reader');
  check(alert && /^Update available for Windows: Endless Labyrinth 9\.0\.0 includes important bug fixes and stability improvements that make gameplay considerably easier\. For the best experience, we strongly recommend downloading the update\. Download Endless Labyrinth 9\.0\.0 for Windows\.$/.test(alert.text), `the wording, with the version number: ${alert && alert.text}`);
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
  const { alert } = await open('/index.html', null);
  check(alert === null, 'no release from GitHub: no alert at all');
}
// Windows 4.0.0's own alert: 15 days from the day GitHub says 4.0.0 was published, by
// internet time (web 5.2.0; never by a date written in the site, so this test does not
// depend on today's date); it interrupts the screen reader through the empty assertive
// live region, which it fills a moment after the page loads and empties later.
const inWindow = true;
const r301 = { tag_name: 'v4.0.0', published_at: new Date(Date.now() - 2 * day).toISOString(), html_url: 'https://github.com/DevHinderman2026/Endless-Labyrinth/releases/tag/v4.0.0' };
const r310old = Object.assign({}, r301, { published_at: new Date(Date.now() - 16 * day).toISOString() });
const r301real = { tag_name: 'v3.0.1', published_at: new Date(Date.now() - 6 * day).toISOString(), html_url: 'https://github.com/DevHinderman2026/Endless-Labyrinth/releases/tag/v3.0.1' };
const WORDS = 'Windows players, please update: Endless Labyrinth 4.0.0 is the latest version for Windows, and we strongly urge every Windows player to install it. It brings true 3D sound for headphones, turning in the walking modes, the new Find the Voice mode, and many fixes. If you have version 2.0.0 or newer, the game updates itself when you ask it to: choose Check for Updates on the main menu, then press Y. Download Endless Labyrinth 4.0.0 for Windows.';
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
    const a = document.getElementById('windows-update-alert') || document.getElementById('windows-coming-alert');
    return {
      spoken: document.getElementById('site-announcer').textContent,
      alert: a && { id: a.id, role: a.getAttribute('role'), label: a.getAttribute('aria-label'), text: a.textContent.trim(), link: a.querySelector('a').getAttribute('href'), buttons: a.querySelectorAll('button').length },
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
  check(!later.alert && later.spoken === '', 'GitHub unreachable: no alert (it never announces a version it cannot see)');
  check(errors.length === 0, `GitHub unreachable: no page error: ${errors}`);
}
{
  const { later } = await openLive(r301real);
  const COMING = 'Windows players: version 6.0.0 of the game is here on the website now, with the new Find the Voice mode. The Windows version, 4.0.0, is coming later. Until then, you can play the latest version right here in your browser. Play Endless Labyrinth on the website.';
  check(later.alert && later.alert.id === 'windows-coming-alert' && later.alert.role === 'region' && later.alert.label === 'Alert', 'while GitHub still says 3.0.1, nothing announces 4.0.0 as out: the alert says it is coming');
  check(later.alert && later.alert.text === COMING && later.spoken === COMING, `it says the latest version can be played on the website, and is spoken once: ${later.alert && later.alert.text}`);
  check(later.alert && later.alert.link === 'play.html' && later.alert.buttons === 0, 'it links to the game on the website');
}
{
  const { later } = await openLive(r310old);
  check(!later.alert && later.spoken === '', '16 days after 4.0.0 came out: no alert at all (its 15 days are over)');
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
  check(later.alert && /^Update available for Windows: Endless Labyrinth 9\.0\.0/.test(later.alert.text) && later.spoken === '', 'another release brings back the ordinary alert, which does not interrupt');
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

// ------------------------------------------------------------------ the high scores reset alert (web 6.3.5)
{
  const RESET = Date.UTC(2026, 10, 21, 19, 0, 0);
  // (A release fresh at the time of the reset: dated from the run's own day, it would
  // lie in the future of the page's clock once the test is a few days old.)
  const freshThen = { ...fresh, published_at: new Date(RESET - 1 * day).toISOString() };
  const at = async (ms) => {
    const page = await browser.newPage();
    await page.route('https://api.github.com/**', (route) => route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify(freshThen) }));
    await page.route('**/packs/manifest.json', async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, headers: { ...res.headers(), date: new Date(ms).toUTCString() } });
    });
    await page.goto(base + '/index.html');
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const kids = [...document.body.children].filter((c) => c.id !== 'site-announcer');
      const s = document.getElementById('scores-reset-alert');
      return { shown: !!s, first: kids[0] === s, windowsNext: !!s && !!s.nextElementSibling && /windows/.test(s.nextElementSibling.id),
        role: s && s.getAttribute('role'), label: s && s.getAttribute('aria-label'), text: s ? s.textContent : '' };
    });
    await page.close();
    return r;
  };
  const during = await at(RESET + 2 * 3600 * 1000);
  check(during.shown && during.first && during.windowsNext && during.role === 'region' && during.label === 'Alert' && /set back to zero/.test(during.text) && /Event High Scores/.test(during.text),
    'two hours after the reset, the high scores alert is the first region on the home page, named Alert, with the Windows alert right below it: ' + JSON.stringify(during));
  const after = await at(RESET + 6 * 3600 * 1000 + 60000);
  const before = await at(RESET - 60000);
  check(!after.shown && !before.shown, 'it is gone six hours after the reset, and was not there before it');
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
