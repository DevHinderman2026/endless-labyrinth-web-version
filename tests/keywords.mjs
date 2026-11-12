// On a computer, nothing the game says may name a gesture: every help topic, menu
// line and pause line is passed through keyWords. Run with the site served:
//   node tests/keywords.mjs http://localhost:8765
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + '/play.html');

// Every help topic, from every mode and the events.
const left = await page.evaluate(async () => {
  const { keyWords, LEFTOVER } = await import('./js/keywords.js');
  const texts = [];
  const { HELP } = await import('./js/help-data.js');
  const walk = (x) => {
    if (!x) return;
    if (typeof x === 'string') { texts.push(x); return; }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (typeof x === 'object') { if (x.title) texts.push(x.title); if (x.desc) texts.push(x.desc); if (x.items) walk(x.items); if (x.topics) walk(x.topics); for (const v of Object.values(x)) if (Array.isArray(v)) walk(v); }
  };
  walk(HELP);
  for (const m of ['driving', 'tower', 'island', 'chaos', 'ultimate']) {
    const mod = await import(`./js/modes/${m}.js`);
    walk(Object.values(mod));
    if (mod.default) walk(Object.values(mod.default));
  }
  const ev = await import('./js/modes/events/help.js');
  for (const v of Object.values(ev)) walk(typeof v === 'function' ? (() => { try { return v(); } catch (e) { return null; } })() : v);
  const bad = [];
  for (const t of texts) {
    for (const s of keyWords(t).split(/(?<=[.!?])\s+/)) {
      if (LEFTOVER.test(s) && !/hollow taps/.test(s)) bad.push(s);
    }
  }
  return { n: texts.length, bad: [...new Set(bad)] };
});
check(left.n > 100, `help topics read: ${left.n}`);
for (const b of left.bad) console.log('   left over: ' + b);
check(left.bad.length === 0, 'no help topic names a gesture on a computer');

// The menu and the lines around play, as the game says them.
const said = [];
await page.exposeFunction('__said', (t) => said.push(t));
await page.evaluate(() => { const s = window.__el.speech; const o = s.show; s.show = (t) => { window.__said(t); o(t); }; });
const lead = await page.textContent('#lead');
check(!/Firefox/.test(lead), 'Safari is not told about Firefox');
await page.click('#start');
await page.waitForFunction(() => /press Enter to begin/.test(document.getElementById('lead').textContent), null, { timeout: 120000 });
check(/Command F5/.test(await page.textContent('#lead')), 'a Mac is told how to turn VoiceOver off');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
const menu = await page.evaluate(() => window.__el.game.menuOptions);
check(!menu.includes('Gesture Practice'), 'no Gesture Practice on a computer');
for (const k of ['ArrowDown', 'h', 'ArrowDown', 'Enter', 'Escape', 'Escape']) { await page.keyboard.press(k); await page.waitForTimeout(150); }
await page.keyboard.press('Enter');               // Standard Mode, from the top of the menu
await page.waitForTimeout(600);
await page.keyboard.press('p'); await page.waitForTimeout(200);
await page.keyboard.press('p'); await page.waitForTimeout(200);
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await page.keyboard.press('n'); await page.waitForTimeout(200);
const { LEFTOVER } = await import('../js/keywords.js');
const badSaid = said.filter((t) => LEFTOVER.test(t));
for (const b of badSaid) console.log('   said: ' + b);
check(said.length > 5 && badSaid.length === 0, `nothing said names a gesture (${said.length} lines)`);
check(said.some((t) => /Press P to resume/.test(t)), 'the pause line names P');
check(said.some((t) => /Press Y for yes/.test(t)), 'quitting asks for Y or N');

// Web 5.0.0: nothing is announced inside the game. (4.0.0 to 4.1.2 said once, at
// the first run of Ultimate Mode on a device, that turning had changed; the
// Update History's alert says such things now.)
said.length = 0;
await page.evaluate(() => { const g = window.__el.game; g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter'); });
await page.waitForTimeout(300);
check(said.filter((t) => /New in version/.test(t)).length === 0, 'the first run of Ultimate Mode says no notice: ' + said.join(' | ').slice(0, 120));
check(errors.length === 0, 'no page errors ' + errors.join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
