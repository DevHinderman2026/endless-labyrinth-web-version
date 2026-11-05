// The web version on computers, in every browser it may meet: a Chromebook, Linux
// with Chrome and with Firefox, a Mac with Safari and with Chrome, and Windows
// (refused). Each one is played with the keyboard from the play page: the sounds
// load, Enter begins, the menu, a Standard run, a Battle run with Space, pause,
// resume and quitting, with nothing said that names a gesture. A phone is checked
// to keep its gesture wording. Run with the site served:
//   node tests/computers.mjs http://localhost:8765
import { chromium } from 'playwright';
import { LEFTOVER } from '../js/keywords.js';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

const UA = {
  'Chromebook (Chrome)': ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'chromebook', /Control Alt Z/],
  'Linux (Chrome)': ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'linux', /Orca/],
  'Linux (Firefox)': ['Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0', 'linux', /Orca/],
  'Mac (Safari)': ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15', 'mac', /Command F5/],
  'Mac (Chrome)': ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'mac', /Command F5/],
};

async function computer(name, [ua, kind, srHint]) {
  const ctx = await browser.newContext({ userAgent: ua, viewport: { width: 1366, height: 768 } });
  // My workspace cannot reach GitHub from a page (no CORS headers through its
  // proxy): answer an empty events folder, as tests/github-stub.mjs does.
  await ctx.route('https://api.github.com/**', (route) => route.fulfill({
    status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + '/play.html');
  const said = [];
  await page.exposeFunction('__said', (t) => said.push(t));
  await page.evaluate(() => { const s = window.__el.speech; const o = s.show; s.show = (t) => { window.__said(t); o(t); }; });
  check(await page.evaluate(async () => (await import('./js/device.js')).deviceKind()) === kind, `${name}: recognised as ${kind}`);
  check(await page.locator('#start').isVisible(), `${name}: may play`);
  const lead = await page.textContent('#lead');
  check(/Firefox/.test(name) === /Chrome, Edge or Safari is recommended/.test(lead), `${name}: Firefox note only on Firefox`);
  await page.click('#start');
  await page.waitForFunction(() => /press Enter to begin/.test(document.getElementById('lead').textContent), null, { timeout: 180000 });
  check(srHint.test(await page.textContent('#lead')), `${name}: told how to turn its screen reader off`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const g = () => page.evaluate(() => { const x = window.__el.game; return { state: x.state, playing: x.playing, paused: x.isPaused, menu: x.menuOptions, idx: x.menuIndex }; });
  let st = await g();
  check(st.state === 'menu' && !st.menu.includes('Gesture Practice'), `${name}: main menu, no Gesture Practice`);
  check(!st.menu.some((m) => m.startsWith('Walk Backwards')), `${name}: no Walk Backwards by Holding setting (a touch gesture)`);
  // Standard: walk a little, report, pause, resume, quit with Escape and N, then Y.
  await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  st = await g();
  check(st.playing, `${name}: Enter starts Standard mode`);
  for (const k of ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Enter', 't']) { await page.keyboard.press(k); await page.waitForTimeout(120); }
  await page.keyboard.press('p'); await page.waitForTimeout(150);
  check((await g()).paused, `${name}: P pauses`);
  await page.keyboard.press('p'); await page.waitForTimeout(150);
  check(!(await g()).paused, `${name}: P resumes`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.keyboard.press('n'); await page.waitForTimeout(150);
  check((await g()).playing, `${name}: Escape then N keeps playing`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.keyboard.press('y'); await page.waitForTimeout(400);
  st = await g();
  check(!st.playing && st.state === 'menu', `${name}: Escape then Y returns to the menu`);
  // Battle: down one, Enter, fire with Space, report with Enter.
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150);
  await page.keyboard.press('Enter'); await page.waitForTimeout(600);
  st = await g();
  check(st.playing, `${name}: Battle mode starts`);
  for (const k of [' ', 'ArrowLeft', ' ', 'Enter']) { await page.keyboard.press(k); await page.waitForTimeout(150); }
  // Help from the menu.
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.keyboard.press('y'); await page.waitForTimeout(400);
  await page.keyboard.press('h'); await page.waitForTimeout(200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  const bad = said.filter((t) => LEFTOVER.test(t));
  for (const b of bad) console.log('   said: ' + b.slice(0, 160));
  check(said.length > 10 && bad.length === 0, `${name}: ${said.length} lines said, none names a gesture`);
  check(errors.length === 0, `${name}: no page errors ${errors.join(' | ').slice(0, 300)}`);
  await ctx.close();
}

for (const [name, spec] of Object.entries(UA)) await computer(name, spec);

// Windows: refused, on the play page and on the home page.
{
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0' });
  const page = await ctx.newPage();
  await page.goto(base + '/play.html');
  check(!(await page.locator('#start').isVisible()) && /Windows version/.test(await page.textContent('#lead')), 'Windows (Edge): refused, pointed to the Windows version');
  await page.goto(base + '/index.html');
  check(await page.locator('#computer-note').isVisible(), 'Windows: the home page says so');
  await ctx.close();
}

// A phone keeps its gestures.
{
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1', hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(base + '/play.html');
  const words = await page.evaluate(async () => (await import('./js/device.js')).keyboardDevice());
  check(words === false, 'iPhone: keeps the gesture wording');
  await ctx.close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
