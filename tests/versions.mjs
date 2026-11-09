// Fresh files after an update (web 3.2.0; js/version.js, tools/stamp-version.mjs).
// Run with the site served:
//   node --import ./tests/github-stub.mjs tests/versions.mjs http://localhost:8765
// First, without a browser: version.json holds the version, it is the newest entry
// of the Update History, and every page is exactly as tools/stamp-version.mjs would
// write it (every script and style sheet address, and the import map of every
// module, carry the version). Then in a browser: every file a page loads comes by
// its versioned address, once; a page that is an old kept copy (the site says a
// newer version) opens itself afresh once, never round and round, and the saved
// scores are untouched; nothing happens when the site cannot be reached; and the
// play page never reloads once Start has been pressed.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { stamp, modules } from '../tools/stamp-version.mjs';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = process.cwd();

// --------------------------------------------------------------- the files themselves
const version = JSON.parse(readFileSync(join(root, 'version.json'), 'utf8')).version;
check(/^\d+\.\d+\.\d+$/.test(version), `version.json holds a version: ${version}`);
const history = readFileSync(join(root, 'history.html'), 'utf8');
const newest = (history.match(/<h2>([^<]*)<\/h2>/) || [])[1] || '';
check(newest.startsWith(version + ' ('), `the newest Update History entry is that version: ${newest}`);
const list = modules(join(root, 'js'));
const pages = readdirSync(root).filter((n) => n.endsWith('.html')).sort();
const unstamped = pages.filter((n) => { const html = readFileSync(join(root, n), 'utf8'); return stamp(html, version, list) !== html; });
check(unstamped.length === 0, `every page is stamped with ${version} (run node tools/stamp-version.mjs after changing version.json or adding a module): ` + (unstamped.join(', ') || `${pages.length} pages, ${list.length} modules`));
const loose = [];
for (const n of pages) {
  const html = readFileSync(join(root, n), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)) if (!m[1].endsWith('?v=' + version)) loose.push(`${n}: ${m[1]}`);
}
check(loose.length === 0, 'no page asks for a script or style sheet without the version: ' + (loose.slice(0, 5).join(', ') || 'none'));

// --------------------------------------------------------------- in a browser
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const stub = (c) => c.route('https://api.github.com/**', (route) => route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));
const errors = [];

// onVersion answers the page's question for version.json; it can be changed later
// through the returned `answer` holder (null: the real file).
async function freshPage(onVersion) {
  const ctx = await browser.newContext();
  await stub(ctx);
  const answer = { now: onVersion };
  await ctx.route('**/version.json*', (route) => (answer.now ? answer.now(route) : route.continue()));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  const navs = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()); });
  const files = [];
  page.on('request', (r) => { const u = r.url(); if (/\/(js|css)\//.test(u)) files.push(u.slice(u.indexOf('/', 8) + 1)); });
  return { ctx, page, navs, files, answer };
}

// Every file by its versioned address, once, and no reload when all is current.
for (const name of ['play.html', 'help.html']) {
  const { ctx, page, navs, files } = await freshPage(null);
  await page.goto(`${base}/${name}`);
  await sleep(1500);
  const plain = files.filter((u) => !u.endsWith('?v=' + version));
  const names = files.map((u) => u.split('?')[0]);
  const twice = names.filter((n, i) => names.indexOf(n) !== i);
  check(files.length > 3 && plain.length === 0 && twice.length === 0, `${name}: all ${files.length} scripts and style sheets come by their ${version} address, each once` + (plain.length || twice.length ? ': ' + JSON.stringify({ plain, twice }) : ''));
  check(navs.length === 1 && !/[?&]v=/.test(page.url()), `${name}: a current page does not reload itself`);
  await ctx.close();
}

// An old kept copy: the site says a newer version. One reload, at a new address,
// never a second, and the saved scores and settings exactly as they were.
const SAVED = JSON.stringify({ format: 1, scores: { ultimate: [{ score: 1234, date: '2026-11-09' }] }, settings: { speechRate: 5 } });
for (const name of ['play.html', 'help.html']) {
  const { ctx, page, navs, answer } = await freshPage(null);
  await page.goto(`${base}/privacy.html`);   // (any page of the site, current, to set the storage first)
  await sleep(500);
  await page.evaluate((s) => { localStorage.setItem('endless-labyrinth-web', s); localStorage.setItem('endless-labyrinth-web-event-scores', '{"pumpkin":77}'); }, SAVED);
  answer.now = (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{ "version": "99.0.0" }' });
  navs.length = 0;
  await page.goto(`${base}/${name}#top`);
  await sleep(2500);
  const after = await page.evaluate(() => ({ url: location.href, main: localStorage.getItem('endless-labyrinth-web'), events: localStorage.getItem('endless-labyrinth-web-event-scores') }));
  check(navs.length === 2 && /[?&]v=99\.0\.0/.test(after.url) && after.url.includes(name) && after.url.endsWith('#top'), `${name}: an old copy opens itself afresh once, at an address with the new version (keeping its place): ${navs.map((u) => u.replace(base, '')).join(' -> ')}`);
  check(after.main !== null && JSON.parse(after.main).scores.ultimate[0].score === 1234 && after.events === '{"pumpkin":77}', `${name}: the saved scores, settings and event scores are untouched by it`);
  await ctx.close();
}

// The site cannot be reached: nothing happens.
{
  const { ctx, page, navs } = await freshPage((route) => route.abort());
  await page.goto(`${base}/play.html`);
  await sleep(1500);
  check(navs.length === 1, 'with the site out of reach, the page simply stays');
  await ctx.close();
}

// The play page, once Start is pressed, never reloads: the answer comes late here.
{
  const { ctx, page, navs } = await freshPage(async (route) => { await sleep(2500); await route.fulfill({ status: 200, contentType: 'application/json', body: '{ "version": "99.0.0" }' }); });
  await page.goto(`${base}/play.html`);
  await page.click('#start');
  await sleep(3500);
  check(navs.length === 1 && (await page.evaluate(() => !!window.__el.audio)), 'once Start is pressed the play page never reloads itself, even for a newer version');
  await ctx.close();
}

check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
