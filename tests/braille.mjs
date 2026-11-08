// Braille keyboard and display support on Windows (web 2.0.0, js/braille.js), in
// Chromium through Playwright with a Windows user agent. Run with the site served:
//   node --import ./tests/github-stub.mjs tests/braille.mjs http://localhost:8765
// A Braille driver's text is imitated the two ways a browser can see it: key
// presses with no key code (Windows' VK_PACKET, what Chrome makes of a screen
// reader typing a character) and text typed into the box with no key press behind
// it (beforeinput). Nothing here can hear or touch a real display: the key test on
// the BrailleNote Evolve is for Russell.

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
const beforeStart = await page.evaluate(() => ({ hidden: document.getElementById('console').hidden, enabled: window.__el.braille.enabled, mode: window.__el.braille.mode }));
check(beforeStart.hidden && beforeStart.enabled && beforeStart.mode === 'auto', 'before Start the box is hidden; Braille is enabled on Windows, mode Auto');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 90000 });
await sleep(200);

// --------------------------------------------------------------- the focus lives in the box
const loaded = await page.evaluate(() => ({
  hidden: document.getElementById('console').hidden, focused: document.activeElement && document.activeElement.id,
  lead: document.getElementById('lead').textContent, value: document.getElementById('console').value,
}));
check(!loaded.hidden && loaded.focused === 'console', 'when the sounds are loaded the game\'s text box is shown and has the focus');
check(/text box that now has the focus/.test(loaded.lead) && loaded.value === loaded.lead.replace(/\s+/g, ' ').trim().slice(0, loaded.value.length) && loaded.value.length > 40, 'the instructions mention the box, and are written into it for the display');
await page.evaluate(() => document.body.focus());
await page.evaluate(() => document.getElementById('said').focus());
await sleep(150);
check((await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'console', 'the focus comes back to the box when something else takes it');

// Enter begins (a Braille keyboard's Enter is a real key press).
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
await sleep(300);
const menu = await page.evaluate(() => {
  const g = window.__el.game;
  return { menu: g.menuOptions.slice(), said: document.getElementById('said').textContent, value: document.getElementById('console').value, focused: document.activeElement.id };
});
check(menu.menu.some((m) => /^Braille Keyboard: Auto, no Braille device yet$/.test(m)) && menu.menu.includes('Speech: On, no Braille output') && menu.menu.includes('Braille Key Test'), 'the menu carries the Windows game\'s Braille settings: ' + menu.menu.join(' | '));
check(menu.value === menu.said && /Welcome to Endless Labyrinth/.test(menu.value) && menu.focused === 'console', 'the welcome is on the display (the box holds what was said) and the focus stays in the box');

// --------------------------------------------------------------- helpers: a Braille driver's text
await page.evaluate(() => {
  const field = document.getElementById('console');
  // A character typed by software: a key press with no key code (Chrome's VK_PACKET).
  window.__typeCodeless = (text) => {
    for (const ch of text) field.dispatchEvent(new KeyboardEvent('keydown', { key: ch, code: '', bubbles: true, cancelable: true }));
  };
  // Text arriving with no key press at all (an input event).
  window.__inputText = (text) => {
    field.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true }));
  };
  window.__ordinaryKey = (key, code) => {
    field.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true }));
  };
});

// --------------------------------------------------------------- Auto: the first Braille text turns the mode on
const spoken = [];
await page.exposeFunction('__noteSpoken', (t) => spoken.push(t));
await page.evaluate(() => { const s = window.__el.speech; const orig = s.speak.bind(s); s.speak = (t, o) => { window.__noteSpoken(String(t || '')); return orig(t, o); }; });
// "have" typed by the driver as four code-less key presses: H, help opens.
await page.evaluate(() => window.__typeCodeless('have'));
await sleep(400);
const afterHave = await page.evaluate(() => ({ state: window.__el.game.state, detected: window.__el.braille.detected, active: window.__el.braille.active, value: document.getElementById('console').value }));
check(afterHave.detected && afterHave.active, 'text with no key code marks a Braille device found; Auto turns the translation on');
check(afterHave.state === 'help', 'the wordsign "have" is the letter H: help opens');
await page.keyboard.press('Escape'); await sleep(300);
check((await page.evaluate(() => window.__el.game.state)) === 'menu' && spoken.some((t) => /Braille device detected\. Braille keyboard mode is on\./.test(t)), 'back at the menu, and the detection was announced: ' + spoken.filter((t) => /Braille/.test(t)).slice(-1));
const labels = await page.evaluate(() => window.__el.game.menuOptions.slice());
check(labels.includes('Braille Keyboard: Auto, Braille device found') && labels.includes('Speech: On'), 'the menu now says a Braille device was found, and speech can be set: ' + labels.join(' | '));

// A single letter, with the contracted input's trailing space, is that letter; a
// space alone is the space; letters that make no key do nothing.
await page.evaluate(() => { window.__el.game.menuIndex = 0; });
await page.evaluate(() => window.__typeCodeless('h '));
await sleep(300);
const h = await page.evaluate(() => window.__el.game.state);
check(h === 'help', '"h " (a letter and the space that ends it) is H');
await page.keyboard.press('Escape'); await sleep(300);
await page.evaluate(() => window.__typeCodeless('xyz'));
await sleep(300);
check((await page.evaluate(() => window.__el.game.state)) === 'menu', 'a burst that is no letter and no wordsign does nothing');

// Text that arrives as an input event with no key press behind it.
await page.evaluate(() => window.__inputText('have'));
await sleep(300);
check((await page.evaluate(() => window.__el.game.state)) === 'help', 'the same word typed straight into the box (no key presses) is H too');
await page.keyboard.press('Escape'); await sleep(300);

// An ordinary key acts at once, and the same character typed into the box right
// after it is the same press, not a second one.
let helpOpens = 0;
await page.evaluate(() => { window.__helpOpens = 0; const g = window.__el.game; const o = g._openHelp.bind(g); g._openHelp = () => { window.__helpOpens += 1; return o(); }; });
await page.evaluate(() => { window.__ordinaryKey('h', 'KeyH'); window.__inputText('h'); });
await sleep(300);
helpOpens = await page.evaluate(() => window.__helpOpens);
check(helpOpens === 1 && (await page.evaluate(() => window.__el.game.state)) === 'help', `an ordinary H opens help once, its echo as typed text is ignored (${helpOpens})`);
await page.keyboard.press('Escape'); await sleep(300);

// Enter typed as a line break counts once, even with the key press beside it.
await page.evaluate(() => { window.__enters = 0; const g = window.__el.game; const oi = g.input.bind(g); g.input = (x) => { if (x === 'enter') window.__enters += 1; return oi(x); }; });
await page.evaluate(() => { window.__el.game.menuIndex = window.__el.game.menuKeys.indexOf('scores'); });
await page.evaluate(() => {
  const field = document.getElementById('console');
  field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: '', bubbles: true, cancelable: true }));
  field.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertLineBreak', bubbles: true, cancelable: true }));
});
await sleep(300);
const enters = await page.evaluate(() => ({ n: window.__enters, state: window.__el.game.state }));
check(enters.n === 1 && enters.state === 'high_scores', 'Enter arriving as a key and as a typed line break is one Enter: ' + JSON.stringify(enters));
await page.keyboard.press('Escape'); await sleep(300);
// A line break with no key press at all is an Enter of its own.
await page.evaluate(() => { window.__enters = 0; window.__el.game.menuIndex = window.__el.game.menuKeys.indexOf('scores'); });
await sleep(200);
await page.evaluate(() => document.getElementById('console').dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertLineBreak', bubbles: true, cancelable: true })));
await sleep(200);
check((await page.evaluate(() => window.__enters)) === 1 && (await page.evaluate(() => window.__el.game.state)) === 'high_scores', 'a typed line break with no key press is Enter');
await page.keyboard.press('Escape'); await sleep(300);
await page.evaluate(() => { window.__el.game.menuIndex = 0; });
check((await page.evaluate(() => window.__el.game.state)) === 'menu', 'back at the menu');

// --------------------------------------------------------------- Speech: Off, Braille only
const sp = await page.evaluate(async () => {
  const g = window.__el.game; const b = window.__el.braille; const s = window.__el.speech;
  const state0 = g.state;
  g.menuIndex = g.menuKeys.indexOf('speech');
  g.input('enter');
  const off = { state0, state1: g.state, label: g.menuOptions[g.menuIndex], muted: s.muted(), setting: g.scores.settings.speech };
  // Something said while muted still reaches the box, and what follows it still runs.
  let ran = false;
  s.speak('Testing the display.', { after: () => { ran = true; } });
  await new Promise((r) => setTimeout(r, 1200));
  const shown = document.getElementById('console').value;
  g.input('enter');
  const on = { label: g.menuOptions[g.menuIndex], muted: s.muted() };
  return { off, on, shown, ran };
});
check(sp.off.label === 'Speech: Off, Braille only' && sp.off.muted && sp.off.setting === 'off', 'Speech can be turned off for Braille only once a Braille device is found: ' + JSON.stringify(sp.off));
check(sp.shown === 'Testing the display.' && sp.ran, 'with speech off a message still goes to the display, and what follows it still runs');
check(sp.on.label === 'Speech: On' && !sp.on.muted, 'and back on');

// Speech cannot be turned off while Braille is off (never speechless and Brailleless).
const guard = await page.evaluate(() => {
  const g = window.__el.game; const b = window.__el.braille;
  g.menuIndex = g.menuKeys.indexOf('braille');
  g.input('right'); g.input('right');          // Auto -> On -> Off
  const modeLabel = g.menuOptions[g.menuIndex];
  g.menuIndex = g.menuKeys.indexOf('speech');
  g.input('enter');
  const said = document.getElementById('said').textContent;
  const speechLabel = g.menuOptions[g.menuIndex];
  g.menuIndex = g.menuKeys.indexOf('braille');
  g.input('right');                             // Off -> Auto
  return { modeLabel, said, speechLabel, muted: window.__el.speech.muted(), mode: b.mode, saved: g.scores.settings.brailleKeyboard, active: b.active };
});
check(guard.modeLabel === 'Braille Keyboard: Off' && /Speech stays on/.test(guard.said) && guard.speechLabel === 'Speech: On, no Braille output' && !guard.muted, 'with the Braille keyboard Off, speech stays on: ' + guard.said);
check(guard.mode === 'auto' && guard.saved === 'auto' && guard.active, 'the setting cycles Auto, On, Off and is saved; Auto with a device found is on');

// With the keyboard Off, a Braille letter goes to the game as the letters it came as.
await page.evaluate(() => { const g = window.__el.game; g.menuIndex = g.menuKeys.indexOf('braille'); g.input('right'); g.input('right'); g.menuIndex = 0; });
await page.evaluate(() => window.__typeCodeless('that'));
await sleep(300);
const offState = await page.evaluate(() => ({ state: window.__el.game.state, active: window.__el.braille.active }));
check(!offState.active && offState.state === 'help', 'Off: no translation, the letters t, h, a, t reach the game one by one (so the h of "that" opens help: the very trouble the mode is for)');
await page.keyboard.press('Escape'); await sleep(300);
await page.evaluate(() => { const g = window.__el.game; g.menuIndex = g.menuKeys.indexOf('braille'); g.input('right'); g.menuIndex = 0; });   // back to Auto

// --------------------------------------------------------------- the key test
spoken.length = 0;
await page.evaluate(() => { const g = window.__el.game; g.menuIndex = g.menuKeys.indexOf('keytest'); g.input('enter'); });
await sleep(200);
await page.evaluate(() => { window.__ordinaryKey('ArrowUp', 'ArrowUp'); window.__typeCodeless('you'); });
await sleep(300);
await page.evaluate(() => window.__inputText('can'));
await sleep(300);
await page.evaluate(() => window.__typeCodeless(' '));
await sleep(300);
const test = await page.evaluate(() => ({ state: window.__el.game.state, status: document.getElementById('status').textContent }));
check(test.state === 'key_test' && /Braille Key Test/.test(test.status), 'the key test runs as its own state');
check(spoken.some((t) => /^Braille key test\./.test(t)) && spoken.some((t) => t === 'Key ArrowUp.') && spoken.some((t) => t === 'Braille key you, the letter Y.') && spoken.some((t) => t === 'Braille key can, the letter C.') && spoken.some((t) => t === 'Braille key Space.'), 'it names a key, two wordsigns with their letters, and the space: ' + JSON.stringify(spoken.filter((t) => /^(Key|Braille key)/.test(t))));
await page.keyboard.press('Escape'); await sleep(300);
check((await page.evaluate(() => window.__el.game.state)) === 'menu' && spoken.some((t) => /Key test finished\. Main menu\./.test(t)), 'Escape ends the key test and returns to the menu');

// --------------------------------------------------------------- in a run: the box follows the game, a Braille C is the compass
await page.evaluate(() => { const g = window.__el.game; g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter'); });
await sleep(800);
await page.evaluate(() => window.__typeCodeless('can'));
await sleep(300);
const run = await page.evaluate(() => ({ state: window.__el.game.state, on: window.__el.game.ut.compass.on, said: document.getElementById('said').textContent, value: document.getElementById('console').value, focused: document.activeElement.id }));
check(run.state === 'ultimate' && (run.on || /Compass not available/.test(run.said)), 'in a run the wordsign "can" is C, the compass: ' + run.said);
check(run.value === run.said && run.focused === 'console', 'what the game says is on the display, and the focus is still in the box');
await page.keyboard.press('Escape'); await sleep(200); await page.keyboard.press('y'); await sleep(300);
check((await page.evaluate(() => window.__el.game.state)) === 'menu', 'Escape then Y returns to the menu');
// Escape leaves the focus in the box (blurred and refocused, for the screen reader's focus mode).
await page.evaluate(() => { window.__focusEvents = 0; document.getElementById('console').addEventListener('focus', () => { window.__focusEvents += 1; }); });
await page.keyboard.press('Escape'); await sleep(250);
const esc = await page.evaluate(() => ({ focused: document.activeElement.id, events: window.__focusEvents }));
check(esc.focused === 'console' && esc.events >= 1, 'after Escape the box is focused afresh (a new focus event for NVDA and JAWS): ' + JSON.stringify(esc));

// --------------------------------------------------------------- not Windows: nothing of this
{
  const mac = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15' });
  await stub(mac);
  const p2 = await mac.newPage();
  await p2.goto(base + '/play.html');
  const m = await p2.evaluate(() => ({ enabled: window.__el.braille.enabled, hidden: document.getElementById('console').hidden }));
  check(!m.enabled && m.hidden, 'on a Mac the Braille module is off and the box stays hidden');
  await p2.evaluate(() => { document.getElementById('console').dispatchEvent(new KeyboardEvent('keydown', { key: 'h', code: '', bubbles: true })); });
  const d = await p2.evaluate(() => window.__el.braille.detected);
  check(!d, 'and text without a key code is not taken for a Braille device there');
  await mac.close();
}

check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
