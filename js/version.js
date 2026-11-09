// Fresh files after an update (web 3.2.0, Russell: updates should show at once).
//
// GitHub Pages lets a browser keep a page and its files for ten minutes without
// asking again, so for a while after every push a player could get the old game
// (the Braille Keyboard setting was still there after a push on 9 November). Two
// things stop that:
//
// 1. Every page asks for its scripts and its style sheet by addresses that carry
//    the version, game.js?v=3.2.0 and so on: the script tags and the style sheet
//    link directly, and every module the scripts import through the page's import
//    map. A new version is new addresses, which no browser has kept. The version
//    lives in version.json; tools/stamp-version.mjs writes it into every page, and
//    tests/versions.mjs fails if any page is not stamped with it, or if it is not
//    the newest entry of the Update History.
//
// 2. The page itself can still be an old kept copy for those ten minutes. So each
//    page, as it opens, asks the site for version.json (never from the browser's
//    store), and if the site's version is newer than the one this page was built
//    with, it opens itself once more at an address carrying the new version, which
//    the browser has never seen and so fetches afresh. Once per version and
//    browsing session, so a slow server can never make it go round in circles; on
//    the play page only before Start is pressed; and if the site cannot be
//    reached, nothing happens.
//
// Nothing here touches the saved scores, settings or stats: they live in the
// browser's site storage, not in its store of files, and a reload leaves them
// exactly as they were.

// The version this page's files were built with: this file's own address carries
// it (js/version.js?v=3.2.0, through the import map), or null without one.
export const LOADED = (() => {
  try { return new URL(import.meta.url).searchParams.get('v'); } catch (e) { return null; }
})();

export const VERSION_URL = 'version.json';
const MARK = 'endless-labyrinth-web-freshened';   // sessionStorage: the version already reloaded for

// The version on the site now, or null when it cannot be had.
export async function siteVersion() {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const v = String((await res.json()).version || '').trim();
    return /^\d+(\.\d+){1,3}$/.test(v) ? v : null;
  } catch (e) {
    return null;
  }
}

// Reload this page once, at an address carrying the site's version, if the files
// it is running are an older version. `stillOk()` is asked again just before
// reloading (the play page: only while Start has not been pressed). Returns true
// when the page is being reloaded.
export async function freshen({ stillOk = () => true } = {}) {
  if (!LOADED) return false;
  const latest = await siteVersion();
  if (!latest || latest === LOADED) return false;
  try {
    if (sessionStorage.getItem(MARK) === latest) return false;   // tried once already
    sessionStorage.setItem(MARK, latest);
  } catch (e) {
    return false;   // no session storage: never risk reloading round and round
  }
  if (!stillOk()) return false;
  const u = new URL(location.href);
  u.searchParams.set('v', latest);
  location.replace(u.href);
  return true;
}
