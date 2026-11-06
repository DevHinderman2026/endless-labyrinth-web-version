// The Help page (web 1.3.0), in a real browser engine: every topic of the game's
// help, in the game's order, after the frequently asked questions; each topic a
// button with a screen reader hint, opening its subtopics under headings, word for
// word; a Play button on every subtopic with a sound, which downloads only that
// sound (a range request), or keeps the whole pack once if the server ignores
// ranges; the wording matches the device. Run with the site served:
//   node --import ./tests/github-stub.mjs tests/help.mjs http://localhost:8765
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { LEFTOVER } from '../js/keywords.js';

const base = process.argv[2] || 'http://localhost:8765';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const IPHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1', hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } };
const MAC = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15', viewport: { width: 1280, height: 900 } };

// The site's packs, served with range requests answered (as GitHub Pages does), or not.
async function context(opts, { ranges = true } = {}) {
  const ctx = await browser.newContext(opts);
  if (opts.hasTouch) await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 }));
  const served = { bytes: 0, whole: 0, requests: [] };
  if (ranges) {
    await ctx.route('**/packs/*.elpack', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').pop();
      const file = fs.readFileSync(path.join(root, 'packs', name));
      const m = /bytes=(\d+)-(\d+)/.exec(route.request().headers().range || '');
      if (!m) { served.bytes += file.length; served.whole += 1; served.requests.push(name + ' whole'); return route.fulfill({ status: 200, body: file }); }
      const a = +m[1]; const b = Math.min(+m[2], file.length - 1);
      served.bytes += b - a + 1; served.requests.push(`${name} ${a}-${b}`);
      return route.fulfill({ status: 206, body: file.subarray(a, b + 1), headers: { 'Content-Range': `bytes ${a}-${b}/${file.length}`, 'Accept-Ranges': 'bytes', 'Content-Type': 'application/octet-stream' } });
    });
  } else {
    await ctx.route('**/packs/*.elpack', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').pop();
      const file = fs.readFileSync(path.join(root, 'packs', name));
      served.bytes += file.length; served.whole += 1; served.requests.push(name + ' whole');
      return route.fulfill({ status: 200, body: file, headers: { 'Content-Type': 'application/octet-stream' } });
    });
  }
  await ctx.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return { ctx, page, served, errors };
}

// ------------------------------------------------------------ the game's help itself
{
  const { ctx, page } = await context(IPHONE);
  await page.goto(base + '/index.html');
  const h = await page.evaluate(async () => {
    const { HELP } = await import('./js/game.js');
    return HELP.map(([n, items]) => [n, items.map((i) => [i.title, i.sound || null])]);
  });
  const names = h.map(([n]) => n);
  check(names[names.length - 1] === 'Demos, Events', `the game's help ends with Demos, Events: ${names.join(', ')}`);
  const ev = h.find(([n]) => n === 'Events')[1];
  const demos = h.find(([n]) => n === 'Demos, Events')[1];
  check(!ev.some(([t]) => / (Item|Collected)$/.test(t)) && demos.length >= 10 && demos.every(([t, s]) => / (Item|Collected)$/.test(t) && s), `the item and collected sounds moved from Events to Demos, Events: ${demos.length}`);
  check(ev.some(([t, s]) => t === 'Events The Bell' && s === 'event_toll') && ev.filter(([, s]) => s).length >= 5, 'Events keeps the topics that explain a sound (the bell, the mission sounds)');
  const helpMenu = await page.evaluate(async () => (await import('./js/game.js')).HELP[0][1][0].desc);
  check(/one for ambience and one for events/.test(helpMenu) && /Help page of the website/.test(helpMenu), 'the Help Menu topic names Demos, Events and the Help page');
  await ctx.close();
}

// ------------------------------------------------------------ the page, on a phone
const { ctx, page, served, errors } = await context(IPHONE);
await page.goto(base + '/help.html');
await page.waitForSelector('#help-demos-events');
const HELP = await page.evaluate(async () => (await import('./js/game.js')).HELP.map(([n, items]) => [n, items.map((i) => ({ title: i.title, desc: i.desc, sound: i.sound || null }))]));
{
  const topics = await page.locator('section.help-topic > h2 > button.topic-toggle').allTextContents();
  check(topics.length === HELP.length + 1 && topics[0] === 'Frequently Asked Questions' && topics.slice(1).join('|') === HELP.map(([n]) => n).join('|'), `the topics: the questions first, then the game's ${HELP.length} in its order: ${topics.join(', ')}`);
  const closed = await page.locator('section.help-topic button.topic-toggle[aria-expanded="false"]').count();
  const hidden = await page.locator('div.topic-panel[hidden]').count();
  check(closed === topics.length && hidden === topics.length, 'every topic starts closed');
  // Every button names what it controls and has a hint.
  const wiring = await page.evaluate(() => [...document.querySelectorAll('button.topic-toggle')].map((b) => ({
    panel: !!document.getElementById(b.getAttribute('aria-controls')), hint: (document.getElementById(b.getAttribute('aria-describedby')) || {}).textContent || '' })));
  check(wiring.every((w) => w.panel && /^Opens /.test(w.hint)), `every topic button controls its panel and has an "Opens" hint: ${wiring.filter((w) => !w.panel || !/^Opens/.test(w.hint)).length} without`);
  const evHint = await page.locator('#help-events-hint').textContent();
  const evItems = HELP.find(([n]) => n === 'Events')[1];
  check(evHint === `Opens ${evItems.length} subtopics, ${evItems.filter((i) => i.sound).length} of them with a Play button, from Events to ${evItems[evItems.length - 1].title}.`, `the Events hint says what opening it does: ${evHint}`);
  const demoHint = await page.locator('#help-demos-events-hint').textContent();
  check(/^Opens \d+ sound demos, each with a Play button, from \w+ Item to \w+ Collected\.$/.test(demoHint), `a demo topic's hint: ${demoHint}`);
  const faqHint = await page.locator('#faq-hint').textContent();
  check(/^Opens the 8 frequently asked questions, from What is the difference between the website version and the Windows version\? to How do events work\?$/.test(faqHint), `the questions' hint: ${faqHint}`);
  check(/^Opens every topic at once/.test(await page.locator('#open-all-hint').textContent()) && /^Plays the sound this subtopic describes/.test(await page.locator('#play-hint').textContent()), 'Open every topic and Play have hints too');
  const visible = await page.locator('.sr-hint').first().boundingBox();
  check(visible && visible.width <= 1 && visible.height <= 1, 'the hints are for screen readers, not shown on screen');
}
{
  // Opening Events: its subtopics, each under a heading, word for word.
  await page.click('#help-events button.topic-toggle');
  const r = await page.evaluate(() => ({
    expanded: document.querySelector('#help-events button.topic-toggle').getAttribute('aria-expanded'),
    hidden: document.getElementById('help-events-panel').hidden,
    hint: document.getElementById('help-events-hint').textContent,
    heads: [...document.querySelectorAll('#help-events-panel h3')].map((h) => h.textContent),
    texts: [...document.querySelectorAll('#help-events-panel h3 + p')].map((p) => p.textContent),
  }));
  const items = HELP.find(([n]) => n === 'Events')[1];
  check(r.expanded === 'true' && !r.hidden && r.hint === 'Closes the Events subtopics.', `tapping Events opens it, and its hint now says it closes: ${r.hint}`);
  check(r.heads.join('|') === items.map((i) => i.title).join('|'), `every Events subtopic has its heading, in order: ${r.heads.length}`);
  check(r.texts.every((t, i) => t === items[i].desc), 'each subtopic is the game\'s own text, word for word');
  await page.click('#help-events button.topic-toggle');
  check((await page.locator('#help-events button.topic-toggle').getAttribute('aria-expanded')) === 'false' && await page.locator('#help-events-panel').isHidden(), 'tapping it again closes it');
}
{
  // Every subtopic with a sound has a Play button.
  const sounds = HELP.flatMap(([, items]) => items.filter((i) => i.sound)).length;
  const plays = await page.locator('button.play').count();
  const wired = await page.locator('button.play[aria-describedby="play-hint"]').count();
  check(plays === sounds && wired === plays, `a Play button for each of the ${sounds} sounds: ${plays}`);
  const label = await page.locator('#help-demos-battle-mode-panel button.play').first().textContent();
  check(/^Play: /.test(label), `a Play button names its sound: ${label}`);
}
{
  // Open every topic, then close them all.
  await page.click('#open-all');
  const open = await page.locator('button.topic-toggle[aria-expanded="true"]').count();
  check(open === HELP.length + 1 && (await page.textContent('#open-all')) === 'Close every topic', `Open every topic opens all ${open}`);
  await page.click('#open-all');
  check((await page.locator('button.topic-toggle[aria-expanded="true"]').count()) === 0 && (await page.textContent('#open-all')) === 'Open every topic', 'and Close every topic closes them');
}
{
  // Playing a demo: only that sound is downloaded.
  await page.click('#help-demos-battle-mode button.topic-toggle');
  const play = page.locator('#help-demos-battle-mode-panel button.play').first();
  const before = served.bytes;
  await play.click();
  await page.waitForFunction(() => /^(Playing|Finished|That sound)/.test(document.getElementById('demo-status').textContent), null, { timeout: 30000 });
  const st = await page.textContent('#demo-status');
  const total = fs.readdirSync(path.join(root, 'packs')).filter((f) => f.endsWith('.elpack')).reduce((s, f) => s + fs.statSync(path.join(root, 'packs', f)).size, 0);
  const got = served.bytes - before;
  check(/^(Playing|Finished): /.test(st), `Play plays the sound: ${st}`);
  check(served.whole === 0 && got < 2_500_000, `only what is needed is downloaded: ${(got / 1024).toFixed(0)} KB of ${(total / 1048576).toFixed(0)} MB, ${served.requests.length} requests`);
  const playing = await page.evaluate(() => document.getElementById('demo-stop').hidden);
  if (/^Playing/.test(st)) {
    check(!playing, 'while it plays, Stop the sound is offered');
    await page.click('#demo-stop');
    check((await page.textContent('#demo-status')) === 'Stopped.' && await page.locator('#demo-stop').isHidden(), 'Stop the sound stops it');
  }
  // A second demo from the same pack reads only its own sound.
  const n = served.requests.length;
  await page.locator('#help-demos-battle-mode-panel button.play').nth(1).click();
  await page.waitForFunction(() => /^(Playing|Finished|That sound)/.test(document.getElementById('demo-status').textContent) && !/ready/.test(document.getElementById('demo-status').textContent), null, { timeout: 30000 });
  const extra = served.requests.slice(n);
  check(/^(Playing|Finished): /.test(await page.textContent('#demo-status')) && extra.length <= 2, `a second demo fetches only its own sound: ${extra.length} request(s)`);
  // An event demo, from the events packs, and the bell in Events.
  await page.click('#help-demos-events button.topic-toggle');
  await page.locator('#help-demos-events-panel button.play').first().click();
  await page.waitForFunction(() => /^(Playing|Finished|That sound)/.test(document.getElementById('demo-status').textContent) && !/ready/.test(document.getElementById('demo-status').textContent), null, { timeout: 30000 });
  check(/^(Playing|Finished): /.test(await page.textContent('#demo-status')), `an event sound demo plays: ${await page.textContent('#demo-status')}`);
  check(served.whole === 0 && served.bytes < 4_000_000, `still only what is needed: ${(served.bytes / 1024).toFixed(0)} KB in all`);
}
{
  // A link to a subtopic opens its topic there.
  await page.goto(base + '/help.html#events--events-walking-into-things');
  await page.waitForSelector('#help-demos-events');
  await page.waitForFunction(() => document.querySelector('#help-events button.topic-toggle').getAttribute('aria-expanded') === 'true');
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
  check(focused === 'events--events-walking-into-things', `a link to a subtopic opens its topic and puts you on it: ${focused}`);
}
check(await page.locator('nav.site a[href="help.html"][aria-current="page"]').count() === 1, 'Help is in the site links, marked current');
{
  const navs = await page.locator('nav.site a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check(navs.indexOf('help.html') === navs.indexOf('about.html') + 1, `Help comes right after About and how to play: ${navs.join(', ')}`);
}
// The phone's wording: gestures.
{
  const general = await page.evaluate(() => [...document.querySelectorAll('#help-general-panel p')].map((p) => p.textContent).join(' '));
  check(/Swipe up, down, left or right/.test(general), 'on a phone the help names gestures');
}
check(errors.length === 0, `no page errors on a phone ${errors}`);
await ctx.close();

// ------------------------------------------------------------ on a computer: keys
{
  const { ctx, page, errors } = await context(MAC);
  await page.goto(base + '/help.html');
  await page.waitForSelector('#help-demos-events');
  const topicsText = await page.evaluate(() => [...document.querySelectorAll('section.help-topic:not(#faq)')].map((s) => s.textContent).join(' '));
  const left = LEFTOVER.exec(topicsText);
  check(!left, `on a computer the help names keys, never gestures${left ? ': ' + topicsText.slice(Math.max(0, left.index - 60), left.index + 40) : ''}`);
  const gk = await page.locator('#general--general-gestures').textContent();
  check(gk === 'General Keys', `on a computer General Gestures is headed General Keys, and keeps its link: ${gk}`);
  check(errors.length === 0, `no page errors on a computer ${errors}`);
  await ctx.close();
}

// ------------------------------------------------------------ a server that ignores ranges
// The page reads each pack's index from the start of the file and stops there; only
// the pack holding the sound is downloaded whole, once, and kept.
{
  const { ctx, page, served, errors } = await context(IPHONE, { ranges: false });
  await page.goto(base + '/help.html');
  await page.waitForSelector('#help-demos-standard-mode');
  await page.click('#help-demos-standard-mode button.topic-toggle');
  await page.locator('#help-demos-standard-mode-panel button.play').first().click();
  await page.waitForFunction(() => /^(Playing|Finished|That sound)/.test(document.getElementById('demo-status').textContent) && !/ready/.test(document.getElementById('demo-status').textContent), null, { timeout: 60000 });
  check(/^(Playing|Finished): /.test(await page.textContent('#demo-status')), `with no range support the demo still plays: ${await page.textContent('#demo-status')}`);
  const kept = await page.evaluate(async () => (await (await caches.open('endless-labyrinth-sounds')).keys()).map((r) => r.url.split('/').pop()));
  const packs = fs.readdirSync(path.join(root, 'packs')).filter((f) => f.endsWith('.elpack'));
  check(kept.length >= 1 && kept.length <= 2 && kept.every((k) => /^(standard|core)-/.test(k)), `only the pack the sound is in is kept, not all ${packs.length}: ${kept.join(', ')}`);
  await page.reload();
  await page.waitForSelector('#help-demos-standard-mode');
  const n = served.requests.length;
  await page.click('#help-demos-standard-mode button.topic-toggle');
  await page.locator('#help-demos-standard-mode-panel button.play').nth(1).click();
  await page.waitForFunction(() => /^(Playing|Finished|That sound)/.test(document.getElementById('demo-status').textContent) && !/ready/.test(document.getElementById('demo-status').textContent), null, { timeout: 60000 });
  const again = served.requests.slice(n).filter((r) => kept.some((k) => r.startsWith(k)));
  check(/^(Playing|Finished): /.test(await page.textContent('#demo-status')) && again.length === 0, `a kept pack is never asked for again: ${again.join(', ') || 'none'}`);
  check(errors.length === 0, `no page errors ${errors}`);
  await ctx.close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
