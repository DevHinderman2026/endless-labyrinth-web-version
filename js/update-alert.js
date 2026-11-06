// The Windows update alert on the home page (web 1.4.0, Russell's design).
//
// When a new release of the Windows game is published on GitHub, the home page
// opens with an alert, for everyone, saying that an update is available and that
// downloading it is strongly recommended, with a link to the release. It is a
// real alert region (role="alert"), so a screen reader announces it as soon as it
// appears, the way Google's sites announce theirs, and it cannot be dismissed.
//
// It appears by itself and goes away by itself, like an event: it shows for
// ALERT_DAYS (30) after the latest release was published, judged by internet time
// from this site's own Date header, never by the device's clock, and if the
// internet time or GitHub cannot be reached it is not shown at all. So a new
// release turns the alert on the moment it is published, and nothing on the site
// needs changing for it. Home page only (index.html loads this file; no other
// page does).
//
// The alert is added by script, after the checks, rather than written into the
// page: an alert that is in the HTML when the page loads is not announced by
// every screen reader, while one inserted later is.

import { el } from './site.js';

export const RELEASE_API = 'https://api.github.com/repos/DevHinderman2026/Endless-Labyrinth/releases/latest';
export const RELEASE_PAGE = 'https://github.com/DevHinderman2026/Endless-Labyrinth/releases/latest';
export const ALERT_DAYS = 30;
const TIME_URL = 'packs/manifest.json';   // the game's own site, for the time

// The time now from this site (seconds since 1970), or null.
async function siteTime() {
  try {
    const res = await fetch(TIME_URL, { method: 'HEAD', cache: 'no-store' });
    const d = res.headers.get('Date');
    const t = d ? Date.parse(d) : NaN;
    return Number.isFinite(t) ? t / 1000 : null;
  } catch (e) {
    return null;
  }
}

// The latest release: { version, published (seconds since 1970), url }, or null.
async function latestRelease() {
  try {
    const res = await fetch(RELEASE_API, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const info = await res.json();
    const m = /^[vV]?(\d+(?:\.\d+){0,3})$/.exec(String(info.tag_name || '').trim());
    const published = Date.parse(info.published_at || '');
    if (!m || !Number.isFinite(published)) return null;
    return { version: m[1], published: published / 1000, url: String(info.html_url || RELEASE_PAGE) };
  } catch (e) {
    return null;
  }
}

// Whether the alert is shown for a release published at `published`, now being `now`.
export function alertDue(published, now, days = ALERT_DAYS) {
  if (published === null || now === null) return false;
  return now >= published && now < published + days * 86400;
}

export function alertText(version) {
  return `Update available for Windows: Endless Labyrinth ${version} includes important bug fixes and `
    + 'stability improvements that make gameplay considerably easier. For the best experience, we strongly '
    + 'recommend downloading the update.';
}

export function buildAlert(release) {
  return el('div', { role: 'alert', class: 'site-alert', id: 'windows-update-alert' }, [
    el('p', {}, [
      el('strong', { text: 'Update available for Windows: ' }),
      `Endless Labyrinth ${release.version} includes important bug fixes and stability improvements that make `
      + 'gameplay considerably easier. For the best experience, we strongly recommend downloading the update. ',
      el('a', { href: release.url, text: `Download Endless Labyrinth ${release.version} for Windows` }),
      '.',
    ]),
  ]);
}

export async function showUpdateAlert() {
  const [now, release] = await Promise.all([siteTime(), latestRelease()]);
  if (!release || !alertDue(release.published, now)) return false;
  const alert = buildAlert(release);
  const header = document.querySelector('header.site');
  if (header) header.before(alert); else document.body.prepend(alert);
  return true;
}

if (typeof document !== 'undefined' && document.body && document.body.dataset.updateAlert === 'home') {
  showUpdateAlert().catch((e) => console.error(e));
}
