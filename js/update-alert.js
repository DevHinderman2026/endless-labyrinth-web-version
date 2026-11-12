// The Windows update alert on the home page (web 1.4.0, Russell's design; a region named Alert since the evening of 6 November 2026).
//
// When a new release of the Windows game is published on GitHub, the home page
// opens with an alert, for everyone, saying that an update is available and that
// downloading it is strongly recommended, with a link to the release. It cannot be
// dismissed.
//
// It is a REGION NAMED "Alert" (role="region", aria-label="Alert"), the way Google's
// sites do it: a screen reader says "Alert, region" on entering it and "end of
// region" on leaving, and lists it among the page's landmarks. It is deliberately
// not role="alert": a live alert speaks over whatever the screen reader is already
// reading, which cut the player off (Russell, testing with VoiceOver).
//
// It appears by itself and goes away by itself, like an event: it shows for
// ALERT_DAYS (30) after the latest release was published, judged by internet time
// from this site's own Date header, never by the device's clock, and if the
// internet time or GitHub cannot be reached it is not shown at all. So a new
// release turns the alert on the moment it is published, and nothing on the site
// needs changing for it. On the home page (index.html); the Update History page
// loads this file too, for an alert of its own (see the end of the file).
//
// The region is added by script, after the checks, at the very top of the page, so
// it is the first thing a screen reader reaches; being a plain region, not a live
// one, it never interrupts.

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
  return el('section', { role: 'region', 'aria-label': 'Alert', class: 'site-alert', id: 'windows-update-alert' }, [
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

// ------------------------------------------------------------------ the Update History's alert (web 5.0.0)
// Nothing is announced inside the game (Russell, 11 November 2026: no one-time
// notices there). What a player must know about a version is said here instead:
// a region named Alert at the top of the Update History page, the same kind of
// region as the home page's, shown for ALERT_DAYS from the day the version came
// out, judged by internet time, and gone by itself after that. If the internet
// time cannot be read it is not shown.
export const HISTORY_ALERT = {
  version: '5.0.0',
  from: Date.UTC(2026, 10, 12) / 1000,        // 12 November 2026, the day 5.0.0 came out
  heading: 'New in version 5: ',
  text: 'the walking modes now turn with you. In Standard, Battle, Tower, Island and the walking levels of Chaos you '
    + 'turn where you stand and walk the way you face, as in Ultimate Mode: flick or press left or right to turn, and '
    + 'swipe or press up to walk. Driving and the events keep their controls, with north always ahead. The whole game is '
    + 'now heard in binaural 3D sound, and Windows computers can play all of it here. The Windows version and this web '
    + 'version are developed side by side: compatibility between them, the events included, will be maintained to the '
    + 'highest extent that both can allow. ',
  link: ['help.html#faq-turning', 'How turning works, in the frequently asked questions'],
};

export function buildHistoryAlert(a = HISTORY_ALERT) {
  return el('section', { role: 'region', 'aria-label': 'Alert', class: 'site-alert', id: 'history-alert' }, [
    el('p', {}, [el('strong', { text: a.heading }), a.text, el('a', { href: a.link[0], text: a.link[1] }), '.']),
  ]);
}

export async function showHistoryAlert(a = HISTORY_ALERT) {
  const now = await siteTime();
  if (!alertDue(a.from, now)) return false;
  const alert = buildHistoryAlert(a);
  const header = document.querySelector('header.site');
  if (header) header.before(alert); else document.body.prepend(alert);
  return true;
}

if (typeof document !== 'undefined' && document.body && document.body.dataset.updateAlert === 'home') {
  showUpdateAlert().catch((e) => console.error(e));
}
if (typeof document !== 'undefined' && document.body && document.body.dataset.updateAlert === 'history') {
  showHistoryAlert().catch((e) => console.error(e));
}
