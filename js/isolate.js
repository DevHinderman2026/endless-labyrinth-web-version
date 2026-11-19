// Switches on the site's service worker (sw.js), which lets the game's voice use
// several processor threads (web 6.0.1; see sw.js). A plain script, first in the
// page, so that on the page with the game it runs before anything else.
//
// The headers only take effect on a page loaded through the service worker, so the
// first time the game's page is opened in a browser it loads itself once more,
// straight away and before anything is said, and never after Start has been
// pressed. That is done once per visit at most:
// if the browser still does not allow threads, the game simply goes on with one.
(function () {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  var game = /(^|\/)play\.html$/.test(location.pathname);
  var KEY = 'el-isolate-reloaded';
  // Never once Start has been pressed: a game that has begun is not interrupted.
  // (That visit goes on with one thread; the next one has several.)
  var started = false;
  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'start') started = true;
  }, true);
  var again = function () {
    if (!game || started || window.crossOriginIsolated) return;
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, '1');
    } catch (e) { return; }               // no storage: never risk a loop of reloads
    location.reload();
  };
  var here = document.currentScript && document.currentScript.src;
  var url = here ? new URL('../sw.js', here).href : 'sw.js';
  navigator.serviceWorker.register(url).then(function () {
    if (navigator.serviceWorker.controller) { again(); return; }
    navigator.serviceWorker.addEventListener('controllerchange', again);
  }).catch(function () { /* no service worker: one thread, as before */ });
})();
