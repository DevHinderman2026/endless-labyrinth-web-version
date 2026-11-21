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
// one, it never interrupts. (A release can have its own alert that does interrupt:
// RELEASE_ALERT, below, for Windows 3.0.1.)

import { el } from './site.js';
import { SCORES_RESET_AT } from './storage.js';

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

// ------------------------------------------------------------------ a release's own alert (12 November 2026)
// For a release that every Windows player should install, the home page says so
// in Russell's own words and, unlike the ordinary alert, INTERRUPTS the screen
// reader as the page loads, so it is heard straight away (Russell, 12 November
// 2026, for Windows 3.0.1). It is still a region named Alert at the top of the
// page, so a player can find it again among the landmarks.
//
// Screen readers often stay silent about text that is already on a page when it
// loads, so the words are spoken through a separate, empty live region
// (#site-announcer, aria-live="assertive", written into the home page itself)
// that the text is put into a moment after the page has finished loading; it is
// emptied again a few seconds later, so a player moving through the page meets
// the message once, in the region, and not a second time.
//
// It shows for its own number of days from the day that very release was published
// on GitHub, judged by internet time, and then goes away by itself. (Web 5.2.0, Russell,
// 18 November 2026: until then it went by a date written here, so it could announce a
// version before it was out, and could end before it had had its days.) While it shows it takes the place of the ordinary
// alert for that release, and the ordinary alert is not shown for that release
// afterwards either. A newer release brings the ordinary alert back.
// (Web 6.0.0: now for Windows 4.0.0. Windows 3.1.0 was never released; its fixes went
// into 4.0.0. Version 2.0.0 and newer update themselves from the game's main menu.)
export const RELEASE_ALERT = {
  version: '4.0.0',
  days: 15,                                   // from the day GitHub says 4.0.0 was published
  heading: 'Windows players, please update: ',
  text: 'Endless Labyrinth 4.0.0 is the latest version for Windows, and we strongly urge every Windows player to '
    + 'install it. It brings true 3D sound for headphones, turning in the walking modes, the new Find the Voice '
    + 'mode, and many fixes. If you have version 2.0.0 or '
    + 'newer, the game updates itself when you ask it to: choose Check for Updates on the main menu, then press Y. ',
};

// [major, minor, patch] of a version such as '4.0.0', for comparing.
function versionParts(v) { return String(v).split('.').map((x) => parseInt(x, 10) || 0).concat([0, 0, 0]).slice(0, 3); }
export function isNewerVersion(a, b) {
  const x = versionParts(a); const y = versionParts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}
export const ANNOUNCE_DELAY = 700;             // milliseconds after the page has loaded
export const ANNOUNCE_CLEAR = 8000;            // milliseconds later, the live region is emptied

export function releaseAlertText(a = RELEASE_ALERT) {
  return `${a.heading}${a.text}Download Endless Labyrinth ${a.version} for Windows.`;
}

export function buildReleaseAlert(a = RELEASE_ALERT, url = RELEASE_PAGE) {
  return el('section', { role: 'region', 'aria-label': 'Alert', class: 'site-alert', id: 'windows-update-alert' }, [
    el('p', {}, [
      el('strong', { text: a.heading }),
      a.text,
      el('a', { href: url, text: `Download Endless Labyrinth ${a.version} for Windows` }),
      '.',
    ]),
  ]);
}

// Speaks `text` through the page's assertive live region, once the page has
// loaded and a moment has passed, then empties the region again.
export function announce(text) {
  const box = document.getElementById('site-announcer');
  if (!box) return false;
  const speak = () => {
    setTimeout(() => {
      box.textContent = text;
      setTimeout(() => { box.textContent = ''; }, ANNOUNCE_CLEAR);
    }, ANNOUNCE_DELAY);
  };
  if (document.readyState === 'complete') speak();
  else window.addEventListener('load', speak, { once: true });
  return true;
}

// Until that Windows release is out (web 6.0.0, Russell, 19 November 2026: the website
// is released first, Windows later): Windows players are told that the latest version
// can be played here meanwhile. Shown, and spoken once as the page loads, only while
// GitHub says the latest Windows release is an older one; it goes by itself the moment
// GitHub shows the new release, when that release's own alert takes over. If GitHub
// cannot be reached it is not shown.
export const COMING_ALERT = {
  heading: 'Windows players: ',
  text: 'version 6.0.0 of the game is here on the website now, with the new Find the Voice mode. The Windows '
    + 'version, 4.0.0, is coming later. Until then, you can play the latest version right here in your browser. ',
  link: ['play.html', 'Play Endless Labyrinth on the website'],
};

export function comingAlertText(a = COMING_ALERT) { return `${a.heading}${a.text}${a.link[1]}.`; }

export function buildComingAlert(a = COMING_ALERT) {
  return el('section', { role: 'region', 'aria-label': 'Alert', class: 'site-alert', id: 'windows-coming-alert' }, [
    el('p', {}, [el('strong', { text: a.heading }), a.text, el('a', { href: a.link[0], text: a.link[1] }), '.']),
  ]);
}

// ------------------------------------------------------------------ the high scores reset (web 6.3.5)
// Russell, 21 November 2026: every mode's high score board was set back to 0 for all
// players (see SCORES_RESET_AT in storage.js; not the Event High Scores). The home page
// says so in a region named Alert, above the Windows alert, for six hours from the
// reset, judged by internet time, and then it goes by itself. It is a plain region,
// not spoken over the screen reader.
export const SCORES_ALERT = {
  from: SCORES_RESET_AT / 1000,
  hours: 6,
  heading: 'High scores reset: ',
  text: 'with so much refined in the game over the last few updates, every high score board on the website has been '
    + 'set back to zero for all players, so everyone starts fresh. Event High Scores, play time and runs are not affected.',
};

export function scoresAlertDue(now, a = SCORES_ALERT) {
  return now !== null && now >= a.from && now < a.from + a.hours * 3600;
}

export function buildScoresAlert(a = SCORES_ALERT) {
  return el('section', { role: 'region', 'aria-label': 'Alert', class: 'site-alert', id: 'scores-reset-alert' }, [
    el('p', {}, [el('strong', { text: a.heading }), a.text]),
  ]);
}

// A Windows alert goes just below the high scores alert, if that is showing.
function placeAlert(alert) {
  const first = document.getElementById('scores-reset-alert');
  if (first) { first.after(alert); return; }
  const header = document.querySelector('header.site');
  if (header) header.before(alert); else document.body.prepend(alert);
}

export async function showUpdateAlert() {
  const [now, release] = await Promise.all([siteTime(), latestRelease()]);
  if (scoresAlertDue(now)) {
    const header = document.querySelector('header.site');
    if (header) header.before(buildScoresAlert()); else document.body.prepend(buildScoresAlert());
  }
  const special = RELEASE_ALERT;
  // The release's own alert: only once GitHub says that very release is out, for its
  // days from the day it was published there (web 5.2.0). So it never announces a
  // version players cannot download yet, and it lasts its full days whatever day the
  // release comes out. If GitHub cannot be reached it is not shown.
  if (release && release.version === special.version) {
    if (!alertDue(release.published, now, special.days)) return false;   // its days are over
    const alert = buildReleaseAlert(special, release.url);
    placeAlert(alert);
    announce(releaseAlertText(special));
    return true;
  }
  // An older release than the alert's own is still the latest: the new one is not out
  // yet, and the latest version can be played here meanwhile.
  if (release && isNewerVersion(special.version, release.version)) {
    const alert = buildComingAlert();
    placeAlert(alert);
    announce(comingAlertText());
    return true;
  }
  if (!release || !alertDue(release.published, now)) return false;
  if (!isNewerVersion(release.version, special.version)) return false;
  const alert = buildAlert(release);
  placeAlert(alert);
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
