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
      id: a.id, text: a.textContent.trim(), first: document.body.firstElementChild === a,
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
  const { alert } = await open('/index.html', null);
  check(alert === null, 'no release, no alert');
}
{
  const { alert, errors } = await open('/index.html', fresh, { github: false });
  check(alert === null && errors.length === 0, `GitHub unreachable: no alert and no page error: ${errors}`);
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
