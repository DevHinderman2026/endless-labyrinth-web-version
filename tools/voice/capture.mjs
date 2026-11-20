// Every line the game says during a run, heard by playing (web 6.1.0). Used in
// Claude's workspace to check the recordings' list (tools/voice/catalog.mjs) against
// what the game really says: every mode several times, with random moves, shots and
// reports, on a phone and on a computer, and every event template and published
// event for a while. Writes the lines to a JSON file.
//
//   node tools/voice/capture.mjs <site url> <Windows repo> <out.json> [seconds per game]

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [base, win, out, secArg] = process.argv.slice(2);
const SECS = Number(secArg || 20);
const TEMPLATES = path.join(win, 'Developer Tools', 'templates');
const EVENTS = path.join(win, 'events');
const lines = new Map();   // text -> { n, where }
// (CAPTURE_ADD=1: add to the lines already in the file; CAPTURE_SESSIONS=phone,computer: which to play.)
if (process.env.CAPTURE_ADD && fs.existsSync(out)) for (const l of JSON.parse(fs.readFileSync(out, 'utf8'))) lines.set(l.text, { n: l.n, where: l.where });
const SESSIONS = (process.env.CAPTURE_SESSIONS || 'phone,computer').split(',');
const errors = [];

const save = () => fs.writeFileSync(out, JSON.stringify([...lines].map(([t, v]) => ({ text: t, n: v.n, where: v.where })), null, 1));
const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

async function session(phone) {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext(phone ? { userAgent: PHONE, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {});
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + '/play.html' + (phone ? '' : '?desktop=1'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('#start');
  await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 120000 });
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
  await page.evaluate(() => {
    const sp = window.__el.speech;
    window.__said = [];
    const orig = sp.speak.bind(sp);
    sp.speak = (text, opts = {}) => {
      try {
        const g = window.__el.game;
        const run = !!(g && g.playing && !g.isPaused);
        const t = text && sp.words ? sp.words(text) : text;
        if (run && t && String(t).trim() && !opts.device) window.__said.push({ t: String(t), where: g.state });
      } catch (e) { /* not counted */ }
      return orig(text, opts);
    };
  });
  const take = async (label) => {
    const got = await page.evaluate(() => { const s = window.__said; window.__said = []; return s; });
    for (const { t, where } of got) {
      const have = lines.get(t);
      if (have) have.n += 1; else lines.set(t, { n: 1, where: `${label} (${where})` });
    }
  };
  const toMenu = async () => {
    await page.evaluate(async () => {
      const g = window.__el.game;
      for (let i = 0; i < 20 && g.state !== 'menu'; i++) { g.input('enter'); await new Promise((r) => setTimeout(r, 150)); }
    });
  };
  const playGame = async (key, seconds) => {
    await page.evaluate((k) => { const g = window.__el.game; g.menuIndex = g.menuKeys.indexOf(k); g.input('enter'); }, key);
    await new Promise((r) => setTimeout(r, 1500));
    for (let t = 0; t < seconds * 4; t++) {
      await page.evaluate(() => {
        const g = window.__el.game;
        if (g.state === 'menu' || g.state === 'game_over') return;
        if (g.hp !== undefined) g.hp = Math.max(g.hp, 50);
        if (g.ut) {
          g.ut.hp = Math.max(30, g.ut.hp); g.ut.ammo = Math.max(g.ut.ammo, 20);
          if (g.ut.phase === 'play' && g.ut.worldTime > 12 && Math.random() < 0.05) g.ut.worldTime = 8;
          if (Math.random() < 0.08) g.input('help_hold');
        }
        if (g.timeLeft !== undefined && g.timeLeft < 15 && Math.random() < 0.5) g.timeLeft += 20;
        const all = ['up', 'right', 'down', 'left', 'up', 'up'];
        for (let i = 0; i < 4; i++) {
          g.input(all[Math.floor(Math.random() * all.length)]);
          if (Math.random() < 0.4) g.input('space');
          if (Math.random() < 0.08) g.input('enter');
          if (Math.random() < 0.05) g.input(Math.random() < 0.5 ? 'turn_left_start' : 'turn_right_start');
          if (Math.random() < 0.05) g.input('turn_end');
          if (Math.random() < 0.03) g.input('compass');
        }
      });
      await new Promise((r) => setTimeout(r, 250));
      if (t % 8 === 0) await take(key);
    }
    await take(key);
    save();
    await page.evaluate(() => { const g = window.__el.game; if (g.state !== 'menu' && g.state !== 'game_over') { if (g.ut) g.ut.hp = 0; g.triggerGameOver(); } });
    await new Promise((r) => setTimeout(r, 800));
    await toMenu();
  };
  const playEvent = async (file, seconds) => {
    const text = fs.readFileSync(file, 'utf8');
    const st = await page.evaluate(async (t) => {
      const { trusted } = await import('./js/modes/events/feed.js');
      const G = window.__el.game;
      const list = await trusted(t);
      if (!list || !list.length) return 'not trusted';
      G._toMenu('');
      G.state = 'events_menu';
      G._eventLoadThenStart(list[0]);
      for (let i = 0; i < 200 && G.state !== 'event'; i++) await new Promise((res) => setTimeout(res, 50));
      return G.state;
    }, text);
    if (st !== 'event') { console.log('  (not started:', path.basename(file), st, ')'); return; }
    for (let t = 0; t < seconds * 4; t++) {
      await page.evaluate(() => {
        const g = window.__el.game;
        if (g.state !== 'event') return;
        if (g.timeLeft !== undefined && g.timeLeft < 10) g.timeLeft += 20;
        for (let i = 0; i < 4; i++) { g.input(['up', 'right', 'down', 'left'][Math.floor(Math.random() * 4)]); if (Math.random() < 0.4) g.input('space'); if (Math.random() < 0.08) g.input('enter'); }
      });
      await new Promise((r) => setTimeout(r, 250));
    }
    await take('event ' + path.basename(file));
    save();
    await page.evaluate(() => { const g = window.__el.game; if (g.state === 'event') g.triggerGameOver(); });
    await new Promise((r) => setTimeout(r, 600));
    await toMenu();
  };
  const modes = await page.evaluate(() => window.__el.game.menuKeys.filter((k) => !['scores', 'event_score', 'practice', 'rate', 'leave', 'braille', 'speech', 'keytest', 'events'].includes(k)));
  return { browser, page, playGame, playEvent, modes };
}

const files = [];
for (const d of [TEMPLATES, EVENTS]) if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.endsWith('.json')) files.push(path.join(d, f));

for (const phone of [true, false].filter((p) => SESSIONS.includes(p ? 'phone' : 'computer'))) {
  const s = await session(phone);
  console.log(phone ? 'phone' : 'computer', 'modes:', s.modes.join(', '));
  for (const key of s.modes) for (let n = 0; n < (phone ? 3 : 1); n++) { await s.playGame(key, key === 'ultimate' ? SECS * 2 : SECS); console.log(`  ${key} ${n + 1}: ${lines.size} lines so far`); }
  if (phone) for (const f of files) await s.playEvent(f, Math.max(6, SECS / 2));
  console.log(`  events: ${lines.size} lines so far`);
  await s.browser.close();
}
save();
console.log(`${lines.size} different lines; page errors ${errors.length}${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
