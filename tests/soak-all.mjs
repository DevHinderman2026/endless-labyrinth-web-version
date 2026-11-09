// Every mode, several games back to back without a reload (web 3.1.0): the way a
// player plays an evening. After each game: how many sounds are live, how many
// Voice objects are still alive at all (after a forced garbage collection), how
// many echo buses and audio nodes exist, and the JS heap. Anything that grows
// game after game is a leak (Russell: the game crashed after three games).
// Not part of the quick suite:
//   node --import ./tests/github-stub.mjs tests/soak-all.mjs http://localhost:8765 [games per mode] [desktop folder]

import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
const perMode = Number(process.argv[3] || 3);
const desk = process.argv[4] || '/home/claude/work/desktop';
const TEMPLATES = path.join(desk, 'Developer Tools', 'templates');
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const cdp = await page.context().newCDPSession(page);
await page.goto(base + '/play.html?desktop=1');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 90000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');

// Count every Voice ever made and every one finalised, and every AudioNode made.
await page.evaluate(async () => {
  const a = window.__el.audio; const ctx = a.ctx;
  window.__soak = { voicesMade: 0, voicesGone: 0, nodesMade: 0, byKind: {} };
  const reg = new FinalizationRegistry(() => { window.__soak.voicesGone += 1; });
  const orig = a.play.bind(a);
  a.play = (...args) => { const v = orig(...args); if (v) { window.__soak.voicesMade += 1; reg.register(v, 1); } return v; };
  for (const k of ['createGain', 'createPanner', 'createConvolver', 'createBufferSource', 'createChannelSplitter', 'createChannelMerger', 'createBiquadFilter']) {
    const o = ctx[k].bind(ctx);
    ctx[k] = (...x) => { window.__soak.nodesMade += 1; window.__soak.byKind[k] = (window.__soak.byKind[k] || 0) + 1; return o(...x); };
  }
});

const sample = async (label) => {
  await new Promise((r) => setTimeout(r, 4500));    // let the engine's own 4 s disconnects run
  await cdp.send('HeapProfiler.collectGarbage');
  await new Promise((r) => setTimeout(r, 300));
  await cdp.send('HeapProfiler.collectGarbage');
  await new Promise((r) => setTimeout(r, 300));
  const s = await page.evaluate(() => {
    const a = window.__el.audio; const g = window.__el.game;
    return {
      live: a.live.size, loops: [...a.live].filter((v) => v.loop).length, liveNames: [...a.live].map((v) => v.name).slice(0, 8),
      voicesAlive: window.__soak.voicesMade - window.__soak.voicesGone, voicesMade: window.__soak.voicesMade,
      nodesMade: window.__soak.nodesMade, buses: a.areaBuses.size, convolvers: a.convolvers.size, loopWets: a.loopWets.size,
      buffers: a.buffers.size, big: a.bigUsed.size, spatial: a.spatial, worldIn: !!a.worldIn,
      heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null, state: g.state,
    };
  });
  console.log(`${label}: live ${s.live} (loops ${s.loops}) ${JSON.stringify(s.liveNames)}, Voice objects alive ${s.voicesAlive} of ${s.voicesMade} made, nodes made ${s.nodesMade}, buses ${s.buses}, convolvers ${s.convolvers}, loopWets ${s.loopWets}, buffers ${s.buffers}, big ${s.big}, 3D ${s.spatial}/${s.worldIn}, heap ${s.heap} MB, ${s.state}`);
  return s;
};

const toMenu = async () => {
  await page.evaluate(async () => {
    const g = window.__el.game;
    for (let i = 0; i < 20 && g.state !== 'menu'; i++) { g.input('enter'); await new Promise((r) => setTimeout(r, 150)); }
  });
};

// A game: start the mode, play a while with random swipes and shots at full
// health, then end it.
const playGame = async (key, seconds) => {
  await page.evaluate((k) => { const g = window.__el.game; g.menuIndex = g.menuKeys.indexOf(k); g.input('enter'); }, key);
  await new Promise((r) => setTimeout(r, 1500));
  const started = await page.evaluate(() => window.__el.game.state);
  const dirs = ['up', 'right', 'down', 'left'];
  for (let t = 0; t < seconds * 4; t++) {
    await page.evaluate((dirs) => {
      const g = window.__el.game;
      if (g.state === 'menu' || g.state === 'game_over') return;
      if (g.hp !== undefined) g.hp = Math.max(g.hp, 50);
      if (g.ut) { g.ut.hp = 100; g.ut.ammo = Math.max(g.ut.ammo, 20); if (g.ut.phase === 'play' && g.ut.worldTime > 12 && Math.random() < 0.1) g.ut.worldTime = 8; }
      for (let i = 0; i < 4; i++) { g.input(dirs[Math.floor(Math.random() * 4)]); if (Math.random() < 0.4) g.input('space'); }
    }, dirs);
    await new Promise((r) => setTimeout(r, 250));
  }
  const ended = await page.evaluate(() => {
    const g = window.__el.game;
    const s = g.state;
    if (s !== 'menu' && s !== 'game_over') { if (g.ut) g.ut.hp = 0; g.triggerGameOver(); }
    return { before: s, after: g.state };
  });
  await new Promise((r) => setTimeout(r, 800));
  await toMenu();
  return { started, ended };
};

const startEvent = async (file) => {
  const text = fs.readFileSync(path.join(TEMPLATES, file), 'utf8');
  return page.evaluate(async (t) => {
    const { trusted } = await import('./js/modes/events/feed.js');
    const G = window.__el.game;
    const [ev] = await trusted(t);
    G._toMenu('');
    G.state = 'events_menu';
    G._eventLoadThenStart(ev);
    for (let i = 0; i < 200 && G.state !== 'event'; i++) await new Promise((res) => setTimeout(res, 50));
    return G.state;
  }, text);
};

const playEvent = async (file, seconds) => {
  const started = await startEvent(file);
  const dirs = ['up', 'right', 'down', 'left'];
  for (let t = 0; t < seconds * 4; t++) {
    await page.evaluate((dirs) => {
      const g = window.__el.game;
      if (g.state !== 'event') return;
      for (let i = 0; i < 4; i++) { g.input(dirs[Math.floor(Math.random() * 4)]); if (Math.random() < 0.4) g.input('space'); }
    }, dirs);
    await new Promise((r) => setTimeout(r, 250));
  }
  await page.evaluate(() => { const g = window.__el.game; if (g.state === 'event') g.triggerGameOver(); });
  await new Promise((r) => setTimeout(r, 800));
  await toMenu();
  return { started };
};

const baseline = await sample('after loading');
const modes = await page.evaluate(() => window.__el.game.menuKeys.filter((k) => !['scores', 'practice', 'rate', 'leave', 'braille', 'speech', 'keytest', 'events'].includes(k)));
console.log('modes:', modes.join(', '));
const results = {};
for (const key of modes) {
  results[key] = [];
  for (let n = 0; n < perMode; n++) {
    const r = await playGame(key, key === 'ultimate' ? 14 : 8);
    const s = await sample(`${key} game ${n + 1} (${r.started} -> ${r.ended.after})`);
    results[key].push(s);
  }
}
// The same event three times (a different event decodes different recordings,
// which is the caches filling, not a leak), then two others once each.
const eventFiles = fs.existsSync(TEMPLATES) ? fs.readdirSync(TEMPLATES).filter((f) => f.endsWith('.json')) : [];
results.events = [];
for (const f of [eventFiles[1], eventFiles[1], eventFiles[1]].filter(Boolean)) {
  const r = await playEvent(f, 6);
  results.events.push(await sample(`event ${f} (${r.started})`));
}
const others = [];
for (const f of eventFiles.slice(2, 4)) {
  const r = await playEvent(f, 6);
  others.push(await sample(`event ${f} (${r.started})`));
}
const final = await sample('at the end');

// Judgement: after every game, no loop is left playing, no echo bus is left, no 3D
// chain is left, and Voice objects do not pile up (the few still alive are the
// menu's own sounds and the last game's dying echoes).
const all = [...Object.values(results).flat(), ...others];
check(all.every((s) => s.loops === 0), 'no looping sound survives a game over, in any mode');
check(all.every((s) => s.buses === 0 && !s.worldIn && !s.spatial), 'no echo bus and no 3D chain survives a game over');
check(all.every((s) => s.live <= 3), `at most a few sounds live after a game (${Math.max(...all.map((s) => s.live))})`);
const aliveSeq = all.map((s) => s.voicesAlive);
check(Math.max(...aliveSeq) <= 40, `Voice objects do not pile up across games (${aliveSeq.join(' ')})`);
const heaps = all.map((s) => s.heap);
// The engine keeps decoded recordings and loop echoes in bounded caches, so the
// heap settles higher than at the start; what must not happen is growth from one
// game of a mode to the next.
const growth = Object.entries(results).filter(([, v]) => v.length >= 2).map(([k, v]) => [k, v[v.length - 1].heap - v[0].heap]);
check(growth.every(([, d]) => d < 25), `no mode's heap grows game after game (${growth.map(([k, d]) => `${k} ${d >= 0 ? '+' : ''}${d}`).join(', ')} MB)`);
check(final.heap - baseline.heap < 150, `the heap settles within the caches' bounds (${baseline.heap} -> ${final.heap} MB; ${heaps.join(' ')})`);
check(all.every((s) => s.big <= 12), `long recordings are let go at a game over (most kept at once: ${Math.max(...all.map((s) => s.big))})`);
check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
await browser.close();
process.exit(failures ? 1 : 0);
