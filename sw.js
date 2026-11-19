// Endless Labyrinth's service worker (web 6.0.1). It does one thing: it adds the
// headers that make the site's pages "cross-origin isolated", which a browser asks
// for before it lets WebAssembly use more than one processor thread. The game's
// voice (Kokoro, js/bella-worker.js) is several times faster with several threads.
// GitHub Pages cannot send these headers itself, so they are added here, to the
// site's own files as they pass through. Nothing is stored and nothing is changed
// but the headers; with no connection a request fails exactly as it would without
// this file.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  let same = false;
  try { same = new URL(req.url).origin === self.location.origin; } catch (err) { same = false; }
  if (!same) return;                     // other sites' files are left to the browser
  e.respondWith(fetch(req).then((res) => {
    if (!res || res.status === 0 || res.type === 'opaqueredirect') return res;
    const headers = new Headers(res.headers);
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    const bodyless = res.status === 204 || res.status === 205 || res.status === 304;
    return new Response(bodyless ? null : res.body, { status: res.status, statusText: res.statusText, headers });
  }));
});
