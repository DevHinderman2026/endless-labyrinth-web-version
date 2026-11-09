// Braille display and Braille keyboard support on Windows (js/braille.js; web
// 3.0.0, reworked in 3.1.0 after Russell's test on his BrailleNote Evolve), in
// Chromium through Playwright with a Windows user agent. Run with the site served:
//   node --import ./tests/github-stub.mjs tests/braille.mjs http://localhost:8765
// A Braille driver's typed text is imitated as key presses with no key code
// (Windows' VK_PACKET, what Chrome makes of a screen reader typing a character);
// a Braille notetaker's held key as a quick stream of separate key presses with
// real key codes (what the BrailleNote's arrows sent). Nothing here can hear or
// touch a real display: what a screen reader does with the game area's name was
// tried by Russell on his BrailleNote (a test page, 9 November 2026: Test 1).

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ userAgent: WIN_UA, viewport: { width: 1366, height: 768 } });
// The workspace cannot reach GitHub from a page: an empty events folder, as tests/github-stub.mjs answers.
const stub = (c) => c.route('https://api.github.com/**', (route) => route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));
await stub(ctx);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(base + '/play.html');
await page.evaluate(() => localStorage.clear());
await page.reload();
const beforeStart = await page.evaluate(() => {
  const el = document.getElementById('console');
  return { hidden: el.hidden, enabled: window.__el.braille.enabled, tag: el.tagName, role: el.getAttribute('role'), editable: el.isContentEditable || 'value' in el, tabindex: el.getAttribute('tabindex') };
});
check(beforeStart.hidden && beforeStart.enabled, 'before Start the game area is hidden; Braille is enabled on Windows');
check(beforeStart.tag === 'DIV' && beforeStart.role === 'application' && !beforeStart.editable && beforeStart.tabindex === '0', 'the game area is a focusable application, not a text box (in a text box the screen reader holds Braille keys until the space): ' + JSON.stringify(beforeStart));
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 90000 });
await sleep(200);

// --------------------------------------------------------------- the focus lives in the game area
const name = () => document.getElementById('console').getAttribute('aria-label');
const loaded = await page.evaluate(() => ({
  hidden: document.getElementById('console').hidden, focused: document.activeElement && document.activeElement.id,
  lead: document.getElementById('lead').textContent, name: document.getElementById('console').getAttribute('aria-label'),
}));
check(!loaded.hidden && loaded.focused === 'console', 'when the sounds are loaded the game area is shown and has the focus');
check(/game area that now has the focus/.test(loaded.lead) && !/text box/.test(loaded.lead) && loaded.name === loaded.lead.replace(/\s+/g, ' ').trim(), 'the instructions mention the game area, and become its name for the display');
await page.evaluate(() => document.body.focus());
await page.evaluate(() => document.getElementById('said').focus());
await sleep(150);
check((await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'console', 'the focus comes back to the game area when something else takes it');

// Enter begins (a Braille keyboard's Enter is a real key press).
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
await sleep(300);
const menu = await page.evaluate((nameSrc) => {
  const g = window.__el.game;
  return { menu: g.menuOptions.slice(), keys: g.menuKeys.slice(), said: document.getElementById('said').textContent, name: document.getElementById('console').getAttribute('aria-label'), focused: document.activeElement.id };
});
check(menu.keys.join() === 'ultimate,scores,speech,keytest,rate,leave' && menu.menu.includes('Speech: On') && menu.menu.includes('Braille Key Test') && !menu.menu.some((m) => /Braille Keyboard/.test(m)), 'the Windows menu: Speech and the Braille Key Test, no Braille Keyboard setting: ' + menu.menu.join(' | '));
check(menu.name === menu.said && /Welcome to Endless Labyrinth/.test(menu.name) && !/Braille device/.test(menu.name) && menu.focused === 'console', 'the welcome is the game area\'s name (on the display), with no detection announcement, and the focus stays there');

// --------------------------------------------------------------- helpers
await page.evaluate(() => {
  const field = document.getElementById('console');
  // A character typed by software: a key press with no key code (Chrome's VK_PACKET).
  window.__typeCodeless = (text) => {
    for (const ch of text) field.dispatchEvent(new KeyboardEvent('keydown', { key: ch, code: '', bubbles: true, cancelable: true }));
  };
  window.__key = (key, code, repeat = false) => {
    field.dispatchEvent(new KeyboardEvent('keydown', { key, code, repeat, bubbles: true, cancelable: true }));
    if (!repeat) field.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true, cancelable: true }));
  };
});
const stream = async (key, code, n, gap, repeat = false) => {
  for (let i = 0; i < n; i++) {
    await page.evaluate(([k, c, r]) => window.__key(k, c, r && true), [key, code, repeat && i > 0]);
    await sleep(gap);
  }
};

// --------------------------------------------------------------- Braille typed as text is always translated
const spoken = [];
await page.exposeFunction('__noteSpoken', (t) => spoken.push(t));
await page.evaluate(() => { const s = window.__el.speech; const orig = s.speak.bind(s); s.speak = (t, o) => { window.__noteSpoken(String(t || '')); return orig(t, o); }; });
await page.evaluate(() => window.__typeCodeless('have'));
await sleep(400);
check((await page.evaluate(() => window.__el.game.state)) === 'help', 'the wordsign "have", typed as text with no key codes, is the letter H: help opens (no setting, no detection)');
await page.keyboard.press('Escape'); await sleep(300);
await page.evaluate(() => { window.__el.game.menuIndex = 0; });
await page.evaluate(() => window.__typeCodeless('h '));
await sleep(300);
check((await page.evaluate(() => window.__el.game.state)) === 'help', '"h " (a letter and the space that ends it) is H');
await page.keyboard.press('Escape'); await sleep(300);
await page.evaluate(() => window.__typeCodeless('xyz'));
await sleep(300);
check((await page.evaluate(() => window.__el.game.state)) === 'menu', 'a burst that is no letter and no wordsign does nothing');

// An ordinary H (a real key code) acts at once, once.
await page.evaluate(() => { window.__helpOpens = 0; const g = window.__el.game; const o = g._openHelp.bind(g); g._openHelp = () => { window.__helpOpens += 1; return o(); }; });
await page.evaluate(() => window.__key('h', 'KeyH'));
await sleep(300);
check((await page.evaluate(() => window.__helpOpens)) === 1 && (await page.evaluate(() => window.__el.game.state)) === 'help', 'an ordinary H opens help, once');
await page.keyboard.press('Escape'); await sleep(400);

// --------------------------------------------------------------- a key held down on a notetaker is one press
await page.evaluate(() => { window.__moves = []; const g = window.__el.game; const oi = g.input.bind(g); g.input = (x, o) => { window.__moves.push(x); return oi(x, o); }; g.menuIndex = 0; });
await stream('ArrowDown', 'ArrowDown', 12, 40);          // the BrailleNote's held arrow: whole presses every 40 ms
await sleep(300);
const held = await page.evaluate(() => ({ downs: window.__moves.filter((x) => x === 'down').length, index: window.__el.game.menuIndex }));
check(held.downs === 1 && held.index === 1, `twelve presses of one arrow 40 ms apart, as a notetaker sends a held key, are one press: ${JSON.stringify(held)}`);
await page.evaluate(() => { window.__moves = []; window.__el.game.menuIndex = 0; });
await stream('ArrowDown', 'ArrowDown', 3, 220);          // three deliberate presses, about four a second
await sleep(200);
const paced = await page.evaluate(() => ({ downs: window.__moves.filter((x) => x === 'down').length, index: window.__el.game.menuIndex }));
check(paced.downs === 3 && paced.index === 3, `three deliberate presses 220 ms apart are three: ${JSON.stringify(paced)}`);
await page.evaluate(() => { window.__moves = []; window.__el.game.menuIndex = 0; });
await page.evaluate(() => { window.__key('ArrowDown', 'ArrowDown'); window.__key('ArrowUp', 'ArrowUp'); });
await sleep(100);
check((await page.evaluate(() => window.__moves.join())) === 'down,up', 'two different keys close together are both counted');
await sleep(300);   // (a press of the same key within 150 ms of the last would belong to that hold)
await page.evaluate(() => { window.__moves = []; window.__el.game.menuIndex = 0; });
await stream('ArrowDown', 'ArrowDown', 8, 35, true);     // an ordinary keyboard's own repeat, flagged
await sleep(200);
check((await page.evaluate(() => window.__moves.filter((x) => x === 'down').length)) === 1, 'an ordinary keyboard\'s flagged repeat is still one press');
await page.evaluate(() => { window.__el.game.menuIndex = 0; });

// --------------------------------------------------------------- Speech: the game's own voice off
const sp = await page.evaluate(async () => {
  const g = window.__el.game; const s = window.__el.speech;
  g.menuIndex = g.menuKeys.indexOf('speech');
  g.input('enter');
  const off = { label: g.menuOptions[g.menuIndex], muted: s.muted(), setting: g.scores.settings.speech };
  let ran = false;
  s.speak('Testing the display.', { after: () => { ran = true; } });
  await new Promise((r) => setTimeout(r, 1200));
  const shown = document.getElementById('console').getAttribute('aria-label');
  g.input('enter');
  const on = { label: g.menuOptions[g.menuIndex], muted: s.muted(), setting: g.scores.settings.speech };
  return { off, on, shown, ran };
});
check(sp.off.label === 'Speech: Off, screen reader and Braille only' && sp.off.muted && sp.off.setting === 'off', 'the game\'s own voice can be turned off at any time, with no Braille device to find first: ' + JSON.stringify(sp.off));
check(sp.shown === 'Testing the display.' && sp.ran, 'with the voice off a message still becomes the game area\'s name (screen reader and display), and what follows it still runs');
check(sp.on.label === 'Speech: On' && !sp.on.muted && sp.on.setting === 'on', 'and back on, saved');

// --------------------------------------------------------------- the key test
spoken.length = 0;
await page.evaluate(() => { const g = window.__el.game; g.menuIndex = g.menuKeys.indexOf('keytest'); g.input('enter'); });
await sleep(200);
await page.evaluate(() => { window.__key('ArrowUp', 'ArrowUp'); window.__typeCodeless('you'); });
await sleep(500);
await page.evaluate(() => window.__typeCodeless('can'));
await sleep(300);
await page.evaluate(() => window.__typeCodeless(' '));
await sleep(300);
await stream('ArrowLeft', 'ArrowLeft', 8, 50);           // a notetaker's held arrow
await sleep(600);
await stream('ArrowRight', 'ArrowRight', 6, 40, true);   // a keyboard's held arrow, its repeats flagged
await sleep(600);
const test = await page.evaluate(() => ({ state: window.__el.game.state, status: document.getElementById('status').textContent }));
const named = spoken.filter((t) => /^(Key|Braille key)/.test(t));
check(test.state === 'key_test' && /Braille Key Test/.test(test.status), 'the key test runs as its own state');
check(spoken.some((t) => /^Braille key test\./.test(t) && /held down/.test(t)) && named.includes('Key ArrowUp.') && named.includes('Braille key you, the letter Y.') && named.includes('Braille key can, the letter C.') && named.includes('Braille key Space.'), 'it names a key, two wordsigns with their letters, and the space: ' + JSON.stringify(named));
const leftHeld = named.find((t) => /^Key ArrowLeft, held/.test(t)) || '';
const rightHeld = named.find((t) => /^Key ArrowRight, held/.test(t)) || '';
const leftEvery = Number((leftHeld.match(/about every (\d+) milliseconds/) || [])[1]);
check(named.filter((t) => t === 'Key ArrowLeft.').length === 1 && /^Key ArrowLeft, held: it arrived 8 times, about every \d+ milliseconds, as separate presses\.$/.test(leftHeld) && leftEvery >= 40 && leftEvery <= 150, 'a notetaker\'s held arrow is named once, then reported as held, with how many times, how far apart, and as separate presses: ' + leftHeld);
check(/^Key ArrowRight, held: it arrived 6 times, about every \d+ milliseconds, as a key held down\.$/.test(rightHeld), 'a keyboard\'s held arrow is reported as a key held down: ' + rightHeld);
await page.keyboard.press('Escape'); await sleep(300);
check((await page.evaluate(() => window.__el.game.state)) === 'menu' && spoken.some((t) => /Key test finished\. Main menu\./.test(t)), 'Escape ends the key test and returns to the menu');

// --------------------------------------------------------------- in a run: a Braille C is the compass; a held arrow is one step
await page.evaluate(() => { const g = window.__el.game; g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter'); });
await sleep(800);
await page.evaluate(() => window.__typeCodeless('can'));
await sleep(300);
const run = await page.evaluate(() => ({ state: window.__el.game.state, on: window.__el.game.ut.compass.on, said: document.getElementById('said').textContent, name: document.getElementById('console').getAttribute('aria-label'), focused: document.activeElement.id }));
check(run.state === 'ultimate' && (run.on || /Compass not available/.test(run.said)), 'in a run the wordsign "can" is C, the compass: ' + run.said);
check(run.name === run.said && run.focused === 'console', 'what the game says is the game area\'s name, and the focus is still there');
if (run.on) { await page.evaluate(() => window.__typeCodeless('c')); await sleep(300); }
await page.evaluate(() => { window.__steps = []; const g = window.__el.game; const oi = g.input.bind(g); g.input = (x, o) => { if (['up', 'down', 'left', 'right'].includes(x)) window.__steps.push(x); return oi(x, o); }; });
await stream('ArrowLeft', 'ArrowLeft', 15, 40);
await sleep(300);
check((await page.evaluate(() => window.__steps.length)) === 1, 'in a run, a notetaker\'s held arrow is one step: ' + (await page.evaluate(() => window.__steps.join())));
await page.keyboard.press('Escape'); await sleep(200); await page.keyboard.press('y'); await sleep(300);
check((await page.evaluate(() => window.__el.game.state)) === 'menu', 'Escape then Y returns to the menu');
// Escape leaves the focus in the game area (blurred and refocused, for the screen reader's focus mode).
await page.evaluate(() => { window.__focusEvents = 0; document.getElementById('console').addEventListener('focus', () => { window.__focusEvents += 1; }); });
await page.keyboard.press('Escape'); await sleep(250);
const esc = await page.evaluate(() => ({ focused: document.activeElement.id, events: window.__focusEvents }));
check(esc.focused === 'console' && esc.events >= 1, 'after Escape the game area is focused afresh (a new focus event for NVDA and JAWS): ' + JSON.stringify(esc));

// --------------------------------------------------------------- not Windows: nothing of this
{
  const mac = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15' });
  await stub(mac);
  const p2 = await mac.newPage();
  await p2.goto(base + '/play.html');
  const m = await p2.evaluate(() => ({ enabled: window.__el.braille.enabled, hidden: document.getElementById('console').hidden, muted: window.__el.braille.speechMuted, gestures: !!(window.__el.gestures.braille && window.__el.gestures.braille.enabled) }));
  check(!m.enabled && m.hidden && !m.muted && !m.gestures, 'on a Mac the Braille module is off, the game area stays hidden, and the held-key rule does not apply: ' + JSON.stringify(m));
  await mac.close();
}

check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
