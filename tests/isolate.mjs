// Several threads for the voice (web 6.0.1): the service worker (sw.js) and the
// script that switches it on (js/isolate.js) make the game's page cross-origin
// isolated, with one reload at most; the site's other pages go on working; and the
// voice's worker is told how many threads to use.
//   node tests/isolate.mjs http://localhost:8765
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch();

// 1. A first visit straight to the game's page.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  let loads = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('load', () => { loads += 1; });
  await page.route('https://**', (r) => r.abort());
  await page.goto(base + '/play.html');
  await page.waitForFunction(() => window.crossOriginIsolated === true, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  check(await page.evaluate(() => window.crossOriginIsolated === true), 'the game\'s page is cross-origin isolated on a first visit');
  check(loads >= 1 && loads <= 2, `it loaded itself once more at most (${loads} loads counted)`);
  check(await page.evaluate(() => typeof SharedArrayBuffer === 'function'), 'shared memory (what threads need) is there');
  check(await page.evaluate(() => !!document.getElementById('start')), 'the Start button is there after the reload');
  check(errors.length === 0, 'no errors on the page ' + errors.join(' | '));
  // The page's own files still load (a module, a sound pack list, the worker's file).
  const got = await page.evaluate(async () => {
    const out = {};
    for (const u of ['js/bella.js', 'version.json', 'js/bella-worker.js', 'css/site.css']) {
      const r = await fetch(u); out[u] = r.status + ' ' + (r.headers.get('Cross-Origin-Embedder-Policy') || '');
    }
    return out;
  });
  check(Object.values(got).every((v) => v === '200 require-corp'), 'the site\'s own files pass through with the headers ' + JSON.stringify(got));
  // A worker can be started, is isolated too, and may use threads.
  const w = await page.evaluate(() => new Promise((resolve) => {
    const src = 'self.postMessage({ iso: self.crossOriginIsolated, sab: typeof SharedArrayBuffer })';
    const wk = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    wk.onmessage = (e) => resolve(e.data); wk.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 4000);
  }));
  check(w && w.iso === true && w.sab === 'function', 'a worker on the page is isolated too');
  // Opening it again: no further reload.
  loads = 0;
  await page.goto(base + '/play.html');
  await page.waitForTimeout(1500);
  check(loads === 1 && await page.evaluate(() => window.crossOriginIsolated === true), 'the next visit is isolated at once, with no reload');
  // The other pages work as before.
  for (const p of ['/index.html', '/help.html', '/history.html']) {
    const errs = [];
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errs.push(String(e)));
    await pg.route('https://**', (r) => r.abort());
    await pg.goto(base + p);
    await pg.waitForTimeout(600);
    check(errs.length === 0 && (await pg.title()).length > 0, `${p} opens without errors ${errs.join(' | ')}`);
    await pg.close();
  }
  await ctx.close();
}

// 2. A visit that starts on the home page: the game's page is isolated at once.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('https://**', (r) => r.abort());
  await page.goto(base + '/index.html');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
  let loads = 0;
  page.on('load', () => { loads += 1; });
  await page.goto(base + '/play.html');
  await page.waitForTimeout(1500);
  check(await page.evaluate(() => window.crossOriginIsolated === true) && loads === 1, `from the home page, the game's page is isolated with no reload (${loads} load)`);
  await ctx.close();
}

// 3. A browser where isolation never comes: one reload, never a loop.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('**/sw.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",(e)=>e.waitUntil(self.clients.claim()));' }));
  await page.route('https://**', (r) => r.abort());
  let loads = 0;
  page.on('load', () => { loads += 1; });
  await page.goto(base + '/play.html');
  await page.waitForTimeout(4000);
  check(loads <= 2 && await page.evaluate(() => !!document.getElementById('start')), `without isolation the page reloads once at most and the game is there (${loads} loads)`);
  await ctx.close();
}

// 3b. Start pressed before the service worker is ready: the game is never interrupted.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('**/sw.js*', async (r) => { await new Promise((res) => setTimeout(res, 2000)); await r.continue(); });
  await page.route('https://**', (r) => r.abort());
  let loads = 0;
  page.on('load', () => { loads += 1; });
  await page.goto(base + '/play.html');
  await page.click('#start');
  await page.waitForTimeout(4500);
  check(loads === 1 && await page.evaluate(() => !!(window.__el && window.__el.audio)), `Start pressed before the service worker was ready: no reload, the game goes on (${loads} load)`);
  await ctx.close();
}

// 4. The thread count, and what the worker does with it.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('https://**', (r) => r.abort());
  await page.goto(base + '/index.html');
  const t = await page.evaluate(async () => {
    const B = await import('./js/bella.js');
    const sent = [];
    const e = new B.KokoroEngine({ makeWorker: () => ({ postMessage: (m) => sent.push(m), terminate() {} }) });
    e.threads = 4;
    e.start();
    // Several threads fail to start: once more with one.
    e._message({ type: 'failed', stage: 'loading', error: 'out of memory' });
    const again = { state: e.state, threads: e.threads, inits: sent.filter((m) => m.type === 'init').map((m) => m.threads) };
    e._message({ type: 'failed', stage: 'loading', error: 'out of memory' });
    return { counts: [1, 2, 4, 6, 8, 12].map((c) => B.voiceThreads(c)), again, final: e.state };
  });
  check(JSON.stringify(t.counts) === '[1,1,3,4,4,4]', 'threads: one core left for the game, four at most ' + JSON.stringify(t.counts));
  check(JSON.stringify(t.again.inits) === '[4,1]' && t.again.state === 'loading', 'several threads that will not start: tried once more with one ' + JSON.stringify(t.again));
  check(t.final === 'failed', 'and if one thread fails too, the device voice is used');
  await ctx.close();
}
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
check(!/caches\./.test(sw) && /require-corp/.test(sw) && /same-origin/.test(sw), 'the service worker stores nothing; it only adds the headers');

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
