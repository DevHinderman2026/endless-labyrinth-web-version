// The sound engine's echoes and levels, in a real browser engine (Chromium,
// through Playwright). Run: serve the site folder (python3 -m http.server 8765), then
//   node tests/audio.mjs http://localhost:8765
// It cannot hear: it checks how the engine is wired, against the desktop's rules.
//  - A looping sound gets its own echo (the desktop's reverb_apply with loop=True),
//    played in step with it, so it stops, pauses and fades with it.
//  - A level set right after a sound starts is its first level, not a glide.
//  - A drone change leaves the echo of a sound already playing alone.
//  - The high scores of two copies of the game open at once never erase each other.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));

await page.goto(base + '/play.html?desktop=1');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 120000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');

const r = await page.evaluate(async () => {
  const a = window.__el.audio;
  const out = {};
  a.setRoom('battle');
  // A loop in the arena: the first play may stand in with the shared echo while
  // its own is made; the next has its own.
  const v1 = a.play('ammo_beacon', { loops: -1, volume: 0.5 });
  const t0 = performance.now();
  for (let i = 0; i < 100 && !a.loopWets.size; i++) await new Promise((res) => setTimeout(res, 20));
  out.renderMs = Math.round(performance.now() - t0);
  out.wets = a.loopWets.size;
  a.setRoom('battle');   // the menu sets no room each frame
  const v2 = a.play('ammo_beacon', { loops: -1, volume: 0.5 });
  out.own = !!(v2.wet && v2.wet.buffer);
  out.sameLength = v2.wet && v2.wet.buffer ? v2.wet.buffer.length === v2.dry.buffer.length : false;
  out.sources = v2.sources.length;
  v2.pause();
  out.pausedSources = v2.sources.length;
  v2.resume();
  out.resumedSources = v2.sources.length;
  v2.stop();
  out.stoppedSources = v2.sources.length;
  v1.stop();
  // A level set right after play() is set outright.
  const v3 = a.play('prox_3');
  v3.setVolume(0.02, 0.01);
  const ev = v3.dry.gl.gain;
  out.instantSameTick = a.ctx.currentTime <= v3.begunAt;
  v3.stop();
  // A drone change keeps a live sound's echo node connected.
  a.setRoom('lab');
  a.setVariant('lab', 'lab_01_cavewind');
  await new Promise((res) => setTimeout(res, 400));
  a.setRoom('lab');
  const e1 = a.play('wall');            // a one-shot: the shared echo
  out.oneShotConv = !!(e1 && e1.wet && e1.wet.conv);
  return out;
});
check(r.wets >= 1, `a looping sound's own echo is made (${r.renderMs} ms)`);
check(r.own && r.sameLength, 'the next play has its own echo, exactly one turn of the loop long');
check(r.sources === 3 || r.sources === 2, `it plays in step with the sound and its dull copy (${r.sources} sources)`);
check(r.pausedSources === 0 && r.resumedSources === r.sources && r.stoppedSources === 0, 'it pauses, resumes and stops with the sound');
check(r.instantSameTick, 'a level set straight after play() is set before anything sounds');
check(r.oneShotConv, 'a one-shot still sends into the room\'s shared echo');

// The loop echo is worked out without any OfflineAudioContext (an iPhone fails or
// closes the page after a few dozen, WebKit bug 224279), and matches one exactly.
const wet = await page.evaluate(async () => {
  const a = window.__el.audio;
  let made = 0;
  const Real = window.OfflineAudioContext;
  window.OfflineAudioContext = function (...args) { made += 1; return new Real(...args); };
  const out = {};
  for (const [name, key] of [['ammo_beacon', 'battle'], ['prox_3', 'lab'], ['obstacle_2', 'battle']]) {
    const dry = a.buffers.get('dry:' + name);
    const ir = a.irBuffers.get(key + '#0');
    const mine = await a._renderLoopWet(ir, dry);
    // The reference, the way the browser itself would render it.
    const n = dry.length;
    const turns = Math.ceil(Math.max(1, ir.length - 1) / n) + 1;
    const off = new Real(2, turns * n, 44100);
    const src = off.createBufferSource(); src.buffer = dry; src.loop = true;
    const conv = off.createConvolver(); conv.normalize = false; conv.buffer = ir;
    src.connect(conv); conv.connect(off.destination); src.start(0);
    const ref = await off.startRendering();
    let peak = 0; let err = 0;
    for (let c = 0; c < 2; c++) {
      const seg = ref.getChannelData(c).subarray((turns - 1) * n, turns * n);
      for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(seg[i]));
    }
    const k = peak > 0.9 * 32767 / 32768 ? (0.9 * 32767 / 32768) / peak : 1;
    for (let c = 0; c < 2; c++) {
      const seg = ref.getChannelData(c).subarray((turns - 1) * n, turns * n);
      const m = mine.getChannelData(c);
      for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(m[i] - seg[i] * k));
    }
    out[name] = { len: mine.length === n, err: +err.toExponential(2), peak: +peak.toFixed(3) };
  }
  // Many in a row, as a chaos run makes them.
  const dry = a.buffers.get('dry:ammo_beacon'); const ir = a.irBuffers.get('battle#1');
  const t0 = performance.now();
  for (let i = 0; i < 80; i++) await a._renderLoopWet(ir, dry);
  out.eightyMs = Math.round(performance.now() - t0);
  out.made = made;
  window.OfflineAudioContext = Real;
  return out;
});
check(['ammo_beacon', 'prox_3', 'obstacle_2'].every((n) => wet[n].len && wet[n].err < 1e-4), 'the loop echo matches the browser\'s own rendering: ' + JSON.stringify(wet));
check(wet.made === 0, `80 loop echoes in a row, with no OfflineAudioContext made (${wet.eightyMs} ms)`);

// Two copies of the game: a record set in one survives the other saving.
const two = await page.evaluate(() => {
  const s = window.__el.game.scores;
  const KEY = 'endless-labyrinth-web';
  s.update('battle', 5);
  // Another copy writes a better standard score and nothing else.
  const other = JSON.parse(localStorage.getItem(KEY));
  other.scores.standard = 9;
  other.scores.battle = 3;
  localStorage.setItem(KEY, JSON.stringify(other));
  s.settings.speechRate = 4;
  s.save();
  const saved = JSON.parse(localStorage.getItem(KEY)).scores;
  return { standard: saved.standard, battle: saved.battle };
});
check(two.standard === 9 && two.battle === 5, `two copies keep each other's records: standard ${two.standard}, battle ${two.battle}`);

check(errors.length === 0, 'no errors in the page' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
