// Endless Labyrinth's old service worker, retired (web 6.1.0).
//
// Web 6.0.1 to 6.0.3 had a service worker here that added headers to the site's
// pages, so the voice made on the player's device could use several processor
// threads. Since web 6.1.0 the game's voices are recordings and nothing is made on
// the device, so it is not needed. A browser that still has the old one fetches this
// file, finds it changed, and runs this one: it does nothing to any request and
// takes itself away at once, so the site's pages are loaded straight from the site
// again, exactly as they were before 6.0.1.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(self.registration.unregister());
});
