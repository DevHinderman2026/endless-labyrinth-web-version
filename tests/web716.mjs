// Web 7.1.6 (Russell, 23 November 2026: "can you look at how updates are refreshed when the
// player refreshes for updates due to the fact that the game re-downloads the whole entire
// sound pack upon game launch? It should only re-download the missing sound packs").
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/web716.mjs http://localhost:8790
//
// The cause: the play page's Refresh button (7.1.4) emptied everything the browser keeps for
// the site, the sound packs' store with it, so the next start downloaded every pack again.
// Checked:
// - A first start downloads every pack named in packs/manifest.json.
// - Refresh: the page opens afresh, other kept files are let go, and the next start downloads
//   no pack at all: every one is read from the phone.
// - A pack that has changed on the site (a new fingerprint in its name) is the only one
//   downloaded on the next start, and the old copy of it is removed from the phone.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8790';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext();
await ctx.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let fetched = [];
page.on('request', (r) => { const m = r.url().match(/\/packs\/([^/?#]+\.elpack)/); if (m && !r.headers().range) fetched.push(m[1]); });
const manifest = JSON.parse(await (await page.request.get(base + '/packs/manifest.json')).text());
const files = Object.values(manifest.packs).map((p) => p.file);

const start = async () => {
  await page.click('#start');
  await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 180000 });
};
const kept = () => page.evaluate(async () => {
  const names = await caches.keys();
  const out = {};
  for (const n of names) out[n] = (await (await caches.open(n)).keys()).map((q) => new URL(q.url).pathname.split('/').pop());
  return out;
});

// A first start: every pack.
await page.goto(base + '/play.html');
fetched = [];
await start();
check(files.every((f) => fetched.includes(f)), `a first start downloads every pack (${new Set(fetched).size} of ${files.length})`);
let k = await kept();
check(files.every((f) => (k['endless-labyrinth-sounds'] || []).includes(f)), 'and keeps every one on the device');

// Something else kept for the site, which Refresh should let go.
await page.evaluate(async () => { const c = await caches.open('some-other-files'); await c.put('/old-page.html', new Response('old')); });

// Refresh, from a fresh play page (Refresh works only before Start).
await page.goto(base + '/play.html');
await Promise.all([page.waitForURL(/refresh=\d+/, { timeout: 15000 }), page.click('#refresh')]);
await page.waitForLoadState('load');
k = await kept();
check(!k['some-other-files'], 'Refresh lets go of the other files the browser kept for the site');
check(files.every((f) => (k['endless-labyrinth-sounds'] || []).includes(f)), 'and keeps the sound packs: ' + (k['endless-labyrinth-sounds'] || []).length + ' kept');
fetched = [];
await start();
check(fetched.length === 0, `the start after Refresh downloads no pack (${fetched.length}: ${fetched.join(', ')})`);

// One pack changed on the site: a new name (fingerprint), served with the same bytes.
const changed = Object.keys(manifest.packs).find((n) => n === 'driving') || Object.keys(manifest.packs)[0];
const oldFile = manifest.packs[changed].file;
const newFile = oldFile.replace(/-[0-9a-f]+\.elpack$/, '-0123456789.elpack');
const bytes = await (await page.request.get(base + '/packs/' + oldFile)).body();
const next = JSON.parse(JSON.stringify(manifest));
next.packs[changed].file = newFile;
await page.route('**/packs/manifest.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(next) }));
await page.route('**/packs/' + newFile + '*', (r) => r.fulfill({ status: 200, contentType: 'application/octet-stream', body: bytes }));
await page.goto(base + '/play.html');
fetched = [];
await start();
check(fetched.length === 1 && fetched[0] === newFile, `a pack changed on the site: only it is downloaded (${fetched.join(', ') || 'none'})`);
k = await kept();
const s = k['endless-labyrinth-sounds'] || [];
check(s.includes(newFile) && !s.includes(oldFile) && s.length === files.length, `its old copy is removed, the rest kept (${s.length} packs kept)`);

check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
