// The Accessibility page (web 1.1.0), in a real browser engine: the screen
// reader named for each kind of device, that device's guide first, and the
// display options saved with the game's settings and applied on every page,
// the play page included. Run with the site served:
//   node --import ./tests/github-stub.mjs tests/accessibility.mjs http://localhost:8765
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
const browser = await chromium.launch();

const DEVICES = {
  iPhone: [{ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1', hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } }, /^You are on an iPhone\. VoiceOver reads this website/, 'ios', /turn VoiceOver off while you play/],
  iPad: [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15', hasTouch: true, isMobile: true, viewport: { width: 1024, height: 1366 } }, /^You are on an iPad\. VoiceOver/, 'ios', /turn VoiceOver off/],
  Android: [{ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } }, /^You are on a phone\. TalkBack reads this website/, 'android', /turn TalkBack off/],
  Chromebook: [{ userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' }, /^You are on a Chromebook\. ChromeVox reads this website.*Control Alt Z/, 'chromebook', /turn ChromeVox off/],
  Mac: [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15', viewport: { width: 1440, height: 900 } }, /^You are on a Mac\. VoiceOver reads this website.*Command F5/, 'mac', /turn VoiceOver off/],
  Linux: [{ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' }, /^You are on a computer\. Orca reads this website.*Super Alt S/, 'linux', /turn Orca off/],
  Windows: [{ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' }, /^You are on a Windows computer\..*The whole game plays here/, 'windows', /Windows version/],
};
for (const [name, [opts, advice, guide, off]] of Object.entries(DEVICES)) {
  const ctx = await browser.newContext(opts);
  if (opts.hasTouch) await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + '/accessibility.html');
  const text = await page.locator('#device-advice').textContent();
  check(advice.test(text) && off.test(text), `${name}: the right screen reader is named, and told to go off while playing: ${text.slice(0, 90)}`);
  const first = await page.locator('#guides section').first().getAttribute('id');
  const heading = await page.locator('#guides section').first().locator('h3').textContent();
  check(first === 'guide-' + guide && / \(your device\)$/.test(heading), `${name}: its own guide comes first, marked as yours: ${heading}`);
  check(errors.length === 0, `${name}: no page errors ${errors}`);
  await ctx.close();
}

// ---------------------------------------------------------- display options
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(base + '/accessibility.html');
  const root = () => page.evaluate(() => ({ contrast: document.documentElement.dataset.contrast || null, text: document.documentElement.dataset.text || null, size: getComputedStyle(document.documentElement).fontSize, bg: getComputedStyle(document.body).backgroundColor }));
  const before = await root();
  check(before.contrast === null && before.text === null && before.size === '18px', `normal to begin with: ${JSON.stringify(before)}`);
  await page.check('#contrast');
  await page.selectOption('#text-size', 'larger');
  const after = await root();
  check(after.contrast === 'high' && after.text === 'larger' && after.size === '27px' && after.bg === 'rgb(0, 0, 0)', `high contrast and larger text apply at once: ${JSON.stringify(after)}`);
  check(/^Saved: high contrast, larger text/.test(await page.locator('#display-status').textContent()), 'and the page says they are saved');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('endless-labyrinth-web')).settings.display);
  check(saved.contrast === 'high' && saved.text === 'larger', `kept with the game's settings: ${JSON.stringify(saved)}`);
  // Another page, and the play page, follow.
  await page.goto(base + '/about.html');
  const about = await root();
  check(about.contrast === 'high' && about.size === '27px', `the About page uses them: ${JSON.stringify(about)}`);
  await page.goto(base + '/play.html?desktop=1');
  const play = await root();
  check(play.contrast === 'high' && play.text === 'larger', `the play page uses them: ${JSON.stringify(play)}`);
  // The game's own store keeps them beside its other settings.
  const store = await page.evaluate(async () => { const { Store } = await import('./js/storage.js'); const s = new Store(); return { display: s.settings.display, rate: s.settings.speechRate }; });
  check(store.display.contrast === 'high' && store.rate === 3, `the game's store reads them beside the speech rate: ${JSON.stringify(store)}`);
  // Back to normal.
  await page.goto(base + '/accessibility.html');
  check(await page.isChecked('#contrast') && (await page.inputValue('#text-size')) === 'larger', 'the page shows the saved choices');
  await page.uncheck('#contrast');
  await page.selectOption('#text-size', 'normal');
  const back = await root();
  check(back.contrast === null && back.text === null && back.size === '18px', `back to normal: ${JSON.stringify(back)}`);
  check(await page.locator('nav.site a[href="accessibility.html"][aria-current="page"]').count() === 1, 'Accessibility is in the site links and marked current');
  check(errors.length === 0, `no page errors ${errors}`);
  await ctx.close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
