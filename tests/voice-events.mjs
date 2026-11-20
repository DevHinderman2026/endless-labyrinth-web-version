// The recorded voice in events (web 6.1.0, the Fable review, 19 November 2026).
// Run with the site served:
//   node tests/voice-events.mjs http://localhost:8765 [the Windows game's folder] [lines.json]
// (lines.json: write every line heard to that file. tests/voice-event-lines.json is
// that list; tools/voice/catalog.mjs reads it, so that each run of words between two
// numbers of these lines is one recording. Write it again when events are added.)
//
// Russell: an event is described in the Events menu by the device's own voice, but
// while it is being played every line must be one of the game's recordings, never the
// device's voice. tests/voice.mjs checks the lines heard in a short run of each event;
// this goes through every event template and published event and makes each one say
// everything it can say during a run: its report (Enter) in every state (none, one or
// several of everything it counts), its clock, every level's and stage's line, every
// story line, every reward, and Call of Fate's "Ring N times" up to the most the event
// allows. Every such line must be one the recordings can say, with no word left to be
// joined on its own.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
const here = path.dirname(fileURLToPath(import.meta.url));
const win = process.argv[3] || path.join(here, '..', '..', 'Endless Labyrinth');
const outFile = process.argv[4] || null;
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const files = [];
for (const d of [path.join(win, 'Developer Tools', 'templates'), path.join(win, 'events')]) {
  if (fs.existsSync(d)) for (const f of fs.readdirSync(d).sort()) if (f.endsWith('.json')) files.push(path.join(d, f));
}
if (!files.length) { console.log('(The Windows game\'s folder was not found: no event files to play.)'); process.exit(0); }

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + '/play.html?desktop=1');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 180000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');

const all = new Map();      // line -> the first event that said it
const perEvent = [];
let menuDevice = 0; let menuBella = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const r = await page.evaluate(async (t) => {
    const { trusted } = await import('./js/modes/events/feed.js');
    const G = window.__el.game; const sp = window.__el.speech;
    const list = await trusted(t);
    if (!list || !list[0]) return { state: 'not trusted' };
    const ev0 = list[0];
    G._toMenu('');
    G.state = 'events_menu';
    // The menu's own lines (the event's name and description) are the device's voice.
    const d0 = sp.deviceLines; const b0 = sp.bellaLines;
    try { sp.speak(`${ev0.name}. ${ev0.description || ''}`); } catch (e) { /* counted below */ }
    await new Promise((res) => setTimeout(res, 30));
    const menu = { device: sp.deviceLines - d0, bella: sp.bellaLines - b0 };
    sp.stop();
    G._eventLoadThenStart(ev0);
    for (let i = 0; i < 300 && G.state !== 'event'; i++) await new Promise((res) => setTimeout(res, 50));
    if (G.state !== 'event') return { state: G.state, menu };
    await new Promise((res) => setTimeout(res, 400));
    // From here every line is kept, not said (no sound is needed to know what is said).
    const said = new Set();
    const realSpeak = sp.speak;
    sp.speak = (text, opts = {}) => {
      let s = text;
      try { if (s && sp.words) s = sp.words(s); } catch (e) { /* as written */ }
      if (s && String(s).trim() && !opts.device) said.add(String(s).trim());
    };
    const tryIt = (fn) => { try { fn(); } catch (e) { /* a state the event never reaches */ } };
    const ev = G.ev;
    const report = () => { tryIt(() => G.eventStatusReport()); };
    // 1. The report, as the run stands, and the clock.
    report();
    tryIt(() => G.eventClockReport());
    // 2. The report with none, one and several of everything it counts.
    const isInt = (v) => typeof v === 'number' && Number.isFinite(v);
    const fields = Object.keys(G).filter((k) => /^(ev|b|m|x)[A-Z]/.test(k) && isInt(G[k]));
    const inner = G.x && typeof G.x === 'object' ? Object.keys(G.x).filter((k) => isInt(G.x[k])) : [];
    const keep = Object.fromEntries(fields.map((k) => [k, G[k]]));
    const keepX = Object.fromEntries(inner.map((k) => [k, G.x[k]]));
    const keepTime = G.timeLeft;
    const restore = () => { for (const k of fields) G[k] = keep[k]; for (const k of inner) G.x[k] = keepX[k]; G.timeLeft = keepTime; };
    for (const v of [0, 1, 2, 3, 7, 12, 45]) {
      for (const k of fields) G[k] = v;
      report();
      for (const k of inner) G.x[k] = v;
      report();
      restore();
    }
    for (const k of fields) for (const v of [0, 1, 2]) { G[k] = v; report(); G[k] = keep[k]; }
    for (const k of inner) for (const v of [0, 1, 2]) { G.x[k] = v; report(); G.x[k] = keepX[k]; }
    for (const tl of [0, 1, 2, 59, 60, 61, 119, 120, 289, 600]) { G.timeLeft = tl; report(); tryIt(() => G.eventClockReport()); }
    G.timeLeft = keepTime;
    // ... with no creature about, one, and all of them; with the exit open.
    const hz = G.evHazards;
    if (Array.isArray(hz)) {
      for (const n of [0, 1, 2]) { G.evHazards = hz.slice(0, n); for (const lv of [1, 2, 3]) { const l = G.evLives; G.evLives = lv; report(); G.evLives = l; } }
      G.evHazards = hz;
    }
    for (const k of ['evExit', 'bExitOpen']) { const was = G[k]; G[k] = was || (k === 'evExit' ? { x: 0, y: 0, channel: null, extra: null } : true); report(); G[k] = was; }
    const items = G.evItems;
    if (Array.isArray(items)) { for (const n of [0, 1, 2]) { G.evItems = items.slice(0, n); report(); } G.evItems = items; }
    // 3. Every level's, room's, shelter's and stage's line, and the story's lines.
    const st = ev.story || {};
    const levels = Array.isArray(st.levels) ? st.levels.length : 0;
    const word = ev[ev.mission] && typeof ev[ev.mission].word === 'string' ? ev[ev.mission].word : null;
    for (let n = 1; n <= Math.max(12, levels + 2); n++) {
      tryIt(() => G._bSayLevel(n));
      if (ev.mission === 'silent') tryIt(() => G._bSayLevel(n, 'Room'));
      if (ev.mission === 'storm') tryIt(() => G._bSayLevel(n, 'Shelter'));
      if (word) tryIt(() => G._bSayLevel(n, word));
    }
    tryIt(() => G._bBeginWords(false));
    if (G.bStageBase) for (const s of [1, 2, 3]) tryIt(() => { const was = G.bStage; G.bStage = s; G._bBeginWords(true); report(); G.bStage = was; });
    if (Array.isArray(st.found)) for (const f of st.found) tryIt(() => G._bSay(Array.isArray(f) ? f[1] : f));
    if (st.wake) tryIt(() => G._bSay(st.wake));
    // 4. Rewards (a case's, a chest's).
    for (const n of [1, 2, 3, 5, 10, 15, 20, 25, 30, 45, 60]) {
      for (const kind of ['seconds', 'shots', 'points']) tryIt(() => G._bReward({ extra: kind, seconds: n, shots: n, points: n }));
    }
    tryIt(() => { const l = G.evLives; G._bReward({ extra: 'life' }); G.evLives = l; });
    restore();
    // 5. Call of Fate and its kind: what each level asks.
    if (ev.mission === 'decoys') {
      const dc = ev.decoys; const it = ev.item;
      const most = Math.max(2, Math.min(40, dc.rings_most || 1));
      said.add('Ring once.');
      for (let n = 2; n <= most; n++) said.add(`Ring ${n} times.`);
      for (let n = 1; n <= Math.max(1, dc.real_most || 1); n++) said.add(`Find ${n} real ${n === 1 ? it.name : it.plural}.`);
    }
    // 6. What the further missions say of their own.
    if (ev.mission === 'tag') { said.add('You are it.'); said.add('Tagged.'); }
    if (ev.mission === 'count') for (let n = 1; n <= Math.max(1, ev.count.most || 12); n++) said.add(`It was ${n}.`);
    if (ev.mission === 'seek') said.add('No pings left.');
    if (ev.mission === 'map') for (let k = 0; k < 40; k++) tryIt(() => { const fn = G._x_map_round || G._x_map_next; if (fn) fn.call(G, ev.map); });
    sp.speak = realSpeak;
    restore();
    tryIt(() => G.triggerGameOver());
    await new Promise((res) => setTimeout(res, 300));
    for (let i = 0; i < 20 && G.state !== 'menu'; i++) { G.input('enter'); await new Promise((res) => setTimeout(res, 120)); }
    // Which of them the recordings can say, and how.
    const v = sp.bella;
    const lines = [...said].map((line) => {
      const p = v._plan(line);
      return { line, ok: !!p, lone: p ? Math.max(...p.map((s) => s.filter((x) => x.kind === 'word').length)) : 0, pieces: p ? Math.max(...p.map((s) => s.length)) : 0 };
    });
    return { state: 'event', name: ev.name, mission: ev.mission, menu, lines };
  }, text);
  const name = path.basename(file);
  if (r.state !== 'event') { console.log(`  (not started: ${name}: ${r.state})`); perEvent.push({ file: name, started: false }); continue; }
  menuDevice += r.menu.device; menuBella += r.menu.bella;
  const missing = r.lines.filter((l) => !l.ok);
  const lone = r.lines.filter((l) => l.ok && l.lone > 0);
  perEvent.push({ file: name, name: r.name, mission: r.mission, started: true, lines: r.lines.length, missing: missing.map((l) => l.line), lone: lone.map((l) => l.line) });
  for (const l of r.lines) if (!all.has(l.line)) all.set(l.line, { ...l, event: name });
}
await browser.close();

const started = perEvent.filter((e) => e.started);
const bad = started.filter((e) => e.missing.length);
const loneEv = started.filter((e) => e.lone.length);
check(started.length === files.length, `every one of the ${files.length} event files was played (${started.length} started)`);
check(menuBella === 0 && menuDevice === started.length, `in the Events menu an event's name and description are said by the device's voice (${menuDevice} of ${started.length})`);
check(bad.length === 0, `every line an event says while it is played has its recording: ${all.size} different lines across ${started.length} events`
  + (bad.length ? '; NOT in ' + bad.length + ' events, such as ' + JSON.stringify(bad.slice(0, 6).map((e) => [e.file, e.missing.slice(0, 3)])) : ''));
check(loneEv.length === 0, 'no line needs a word joined on its own'
  + (loneEv.length ? ': ' + JSON.stringify(loneEv.slice(0, 6).map((e) => [e.file, e.lone.slice(0, 3)])) : ''));
check(errors.length === 0, 'no page errors ' + errors.slice(0, 3).join(' | '));
if (outFile) fs.writeFileSync(outFile, JSON.stringify([...all.keys()].sort(), null, 0));
for (const e of started) if (e.missing.length) console.log(`  ${e.file}: ${e.missing.length} lines with no recording, such as ${JSON.stringify(e.missing[0])}`);
// The list the recordings were made from is the list of today's lines.
const listFile = path.join(here, 'voice-event-lines.json');
if (fs.existsSync(listFile)) {
  const listed = new Set(JSON.parse(fs.readFileSync(listFile, 'utf8')));
  const fresh = [...all.keys()].filter((l) => !listed.has(l));
  console.log(`(${fresh.length} of these lines are not in tests/voice-event-lines.json${fresh.length ? ', such as ' + JSON.stringify(fresh[0]) : ''}.)`);
}
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
