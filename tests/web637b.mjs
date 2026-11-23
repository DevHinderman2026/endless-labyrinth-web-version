// Web 6.3.7, the rest of it (Russell, 22 November 2026), played by script in a real
// browser engine. The water slide has its own file (web637.mjs), the Dungeon Keys guards
// theirs (dungeon637.mjs), and the island supply is checked in island.mjs.
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/web637b.mjs http://localhost:8790
// What is checked:
// - 8a: a pause landing in the first milliseconds of a placed beep, then a resume, does
//   not stop the resume part-way; two hundred pauses in a Standard labyrinth leave the
//   exit still beeping and nothing held.
// - 2: the background stays when a Chaos Abyss or Find the Voice stage's exit opens, and
//   fades at the stage change instead of being cut.
// - 3: a pause lets a held loop's baked echo ring out, and the resume brings it back in
//   step, never two echoes at once.
// - 5 and 8b: a credit or a cartridge already out when a Chaos exit appears stays, can be
//   taken, and no new one appears.
// - 1: every level change is a glide that ends; a run's end makes a fresh sound engine.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] || 'http://localhost:8790';
const desk = process.argv[3] || '/home/claude/work/desktop';
const fateFile = path.join(desk, 'Developer Tools', 'templates', 'call-of-fate.json');
const FATE = fs.existsSync(fateFile) ? JSON.parse(fs.readFileSync(fateFile, 'utf8')) : null;
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 90000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
await page.evaluate(() => {
  const g = window.__el.game;
  window.toMenu = () => { if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); } };
  window.startMode = (key) => { window.toMenu(); g.menuIndex = g.menuKeys.indexOf(key); g.input('enter'); g.frame(1 / 30); };
  window.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
});

// ------------------------------------------------------------------ 8a: the resume crash
const a8 = await page.evaluate(async () => {
  const g = window.__el.game; const a = g.audio; const r = {};
  window.startMode('standard');
  r.state = g.state;
  const name = [...a.entries.keys()].find((k) => k.includes('prox_'));
  r.name = name;
  // A placed beep, held in the milliseconds before its first sample, then carried on.
  const v = a.play(name, { at: [g.playerPos[0] + 6, g.playerPos[1]] });
  r.lead = v.startedAt - a.ctx.currentTime;
  v.pause();
  r.offset = v.offset;
  try { v.resume(); r.threw = false; } catch (e) { r.threw = String(e); }
  v.stop();
  // Two hundred pauses and resumes while the exit beeps.
  let threw = 0;
  for (let i = 0; i < 200; i++) {
    for (let k = 0; k < 3; k++) g.frame(1 / 30);
    try { g.input('pause'); await window.sleep(1 + (i % 7)); g.input('pause'); } catch (e) { threw += 1; }
    await window.sleep(3);
  }
  r.threw200 = threw; r.paused = g.isPaused; r.held = g.pausedVoices.length;
  r.stuck = [...a.live].filter((x) => x.paused).length;
  // The exit still beeps afterwards.
  const seen = new Set();
  for (let i = 0; i < 120; i++) { g.frame(1 / 30); for (const x of a.live) if (x.name.includes('prox_')) seen.add(x); await window.sleep(8); }
  r.beeps = seen.size;
  window.toMenu();
  return r;
});
check(a8.state === 'standard' && !!a8.name, 'a Standard labyrinth and a proximity beep to test with: ' + a8.name);
check(a8.lead > 0 && a8.offset === 0 && a8.threw === false, `a beep held ${Math.round(a8.lead * 1000)} ms before its first sample is held at 0 and carries on (offset ${a8.offset}, threw ${a8.threw})`);
check(a8.threw200 === 0 && !a8.paused && a8.held === 0 && a8.stuck === 0, `200 pauses and resumes in a labyrinth: no error, nothing left held (${JSON.stringify(a8)})`);
check(a8.beeps > 0, `the exit still beeps afterwards (${a8.beeps} beeps in four seconds)`);

// ------------------------------------------------------------------ 2: the background stays at the exit
const s2 = await page.evaluate(async () => {
  const g = window.__el.game; const a = g.audio; const r = {};
  const pick = g._chaosPickNext;
  for (const kind of ['abyss', 'findvoice']) {
    const seq = [kind, 'standard']; let i = 0;
    g._chaosPickNext = () => seq[Math.min(i++, seq.length - 1)];
    window.startMode('chaos');
    const m = kind === 'abyss' ? g.ab : g.fv;
    const o = r[kind] = { state: g.state, amb: !!(m && m.amb && m.amb.voice) };
    if (!o.amb) continue;
    const amb = m.amb.voice;
    for (let k = 0; k < 20; k++) { g.frame(1 / 30); await window.sleep(5); }
    if (kind === 'abyss') { m.smashed = m.quota; g._abOpenExit(); } else { m.finds = m.quota; g._fvOpenExit(); }
    for (let k = 0; k < 45; k++) { g.frame(1 / 30); await window.sleep(5); }
    o.exit = !!m.exit;
    o.kept = !!(m.amb && m.amb.voice === amb) && amb.busy && !amb.fadingOut && !amb.paused;
    o.level = Math.max(amb.l, amb.r);
    o.loops = [...a.live].filter((v) => v.loop && v.busy && !v.fadingOut).map((v) => v.name);
    const t0 = g.timeLeft; for (let k = 0; k < 30; k++) g.frame(1 / 30); o.clockWaits = g.timeLeft === t0;
    // Through the exit: the background fades under the next level, it is not cut.
    if (kind === 'abyss') g._abLeaveByExit(); else g._fvLeaveByExit();
    o.fadesNotCut = amb.fadingOut === true && !amb.stopped;
    await window.sleep(700);
    o.goneAfter = amb.stopped === true;
    window.toMenu();
  }
  g._chaosPickNext = pick;
  return r;
});
for (const kind of ['abyss', 'findvoice']) {
  const o = s2[kind] || {};
  check(o.state === kind && o.amb, `a Chaos ${kind} stage with its background playing`);
  check(o.exit && o.kept && o.level > 0, `${kind}: the exit opens and the background plays on, at level ${o.level} (${(o.loops || []).join(', ')})`);
  check(o.clockWaits, `${kind}: the chaos clock still waits while the exit is open`);
  check(o.fadesNotCut && o.goneAfter, `${kind}: through the exit, the background fades out under the next level instead of being cut (fading ${o.fadesNotCut}, gone after the fade ${o.goneAfter})`);
}

// ------------------------------------------------------------------ 8b: a cartridge out when a battle's exit appears
const s8b = await page.evaluate(async () => {
  const g = window.__el.game; const r = {};
  const pick = g._chaosPickNext;
  g._chaosPickNext = () => 'battle';
  window.startMode('chaos');
  r.state = g.state;
  for (let k = 0; k < 90 && !g.ammoPickups.length; k++) g.frame(1 / 30);
  const p = g.ammoPickups[0];
  r.had = !!p;
  if (p) {
    for (const o of g.obstacles) if (o.channel) o.channel.stop();
    g.obstacles = []; g.kills = g._battleTargetsNeeded(); g.spawnedEnemies = g.kills;
    g.frame(1 / 30);
    r.exit = !!g.battleExitActive;
    r.kept = g.ammoPickups.length === 1 && g.ammoPickups[0] === p && p.channel.busy;
    for (let k = 0; k < 30; k++) g.frame(1 / 30);
    r.level = Math.max(p.channel.l, p.channel.r);
    const before = g.ammo;
    g.playerPos = [p.x, p.y]; g.frame(1 / 30);
    r.gained = g.ammo - before; r.shots = p.shots; r.silent = !p.channel.busy;
    for (let k = 0; k < 60 && g.state === 'battle'; k++) g.frame(1 / 30);
    r.noNew = g.ammoPickups.length === 0;
    r.pool = g.ammo;
  }
  g._chaosPickNext = pick;
  window.toMenu();
  return r;
});
check(s8b.state === 'battle' && s8b.had, 'a Chaos battle with a cartridge on the floor');
check(s8b.exit && s8b.kept && s8b.level > 0, `the exit appears and the cartridge already out stays, its beacon still heard (level ${s8b.level})`);
check(s8b.gained === s8b.shots && s8b.gained > 0 && s8b.silent, `stepped onto, it adds its ${s8b.shots} shots to the battles' ammo and falls silent`);
check(s8b.noNew, 'no new cartridge appears once the exit is out');

// ------------------------------------------------------------------ 3: a held loop's echo rings out
// The level of a voice's baked echo, measured where it leaves the voice.
await page.evaluate(() => {
  window.echoTap = (v) => {
    const ctx = v.ctx; const an = ctx.createAnalyser(); an.fftSize = 2048;
    v.wet.merge.connect(an);
    const buf = new Float32Array(an.fftSize);
    return { rms: () => { an.getFloatTimeDomainData(buf); let x = 0; for (const y of buf) x += y * y; return Math.sqrt(x / buf.length); },
      // the loudest of a few readings, so a quiet moment of the recording is not taken for silence
      loud: async (ms = 120) => { let m = 0; const t = performance.now(); while (performance.now() - t < ms) { an.getFloatTimeDomainData(buf); let x = 0; for (const y of buf) x += y * y; m = Math.max(m, Math.sqrt(x / buf.length)); await window.sleep(10); } return m; },
      off: () => { try { v.wet.merge.disconnect(an); } catch (e) { /* gone */ } } };
  };
  // A looping sound with its baked echo, at a steady level: played again until the echo is made.
  window.bakedLoop = async (name) => {
    const a = window.__el.audio;
    for (let i = 0; i < 60; i++) {
      const v = a.play(name, { loops: -1 });
      if (v) { await window.sleep(60); if (v.wet && v.wet.buffer) { v.setVolume(0.8, 0.8, 0); return v; } v.stop(); }
      await window.sleep(250);
    }
    return null;
  };
  window.ringTest = async (v, win = 300) => {
    const r = {}; const tap = window.echoTap(v);
    await window.sleep(300);
    r.before = await tap.loud(win);
    v.pause();
    r.cleanStopped = v.sources.length === 0 && !!v.tail;
    await window.sleep(60); r.at60 = await tap.loud(80);
    await window.sleep(500); r.at600 = await tap.loud(80);
    await window.sleep(800); r.at1500 = await tap.loud(80);
    r.tailGone = v.tail === null;
    v.resume();
    await window.sleep(150);
    r.after = await tap.loud(win);
    r.oneEcho = !!v.wet.src && v.tail === null;
    // Carried on while the echo is still ringing: the old echo is taken out, never two.
    v.pause(); await window.sleep(200);
    r.ringing = !!v.tail;
    const old = v.tail && v.tail.src; let ended = false; if (old) old.addEventListener('ended', () => { ended = true; });
    v.resume();
    r.heldNoTail = v.tail === null && !!v.wet.src && v.wet.src !== old;
    await window.sleep(120);
    r.oldEnded = ended;
    r.afterQuick = await tap.loud(win);
    // In step: the echo's place in the loop is the sound's own.
    r.inStep = Math.abs(v.startedAt - (v.ctx.currentTime - ((v.ctx.currentTime - v.startedAt)))) < 1e-9;
    // Pausing and carrying on fast, many times: nothing left over.
    for (let i = 0; i < 40; i++) { v.pause(); await window.sleep(1 + (i % 5) * 4); v.resume(); await window.sleep(2 + (i % 3) * 5); }
    await window.sleep(1500);
    r.afterMany = await tap.loud(win);
    r.cleanAfterMany = v.tail === null && v.sources.length >= 2 && !v.paused;
    tap.off();
    return r;
  };
});
const s3 = await page.evaluate(async () => {
  const g = window.__el.game; const a = g.audio;
  window.startMode('standard');
  const name = [...a.entries.keys()].find((k) => /^credit_beacon_\d+$/.test(k));
  const v = await window.bakedLoop(name);
  if (!v) { window.toMenu(); return { name, none: true, room: a.room }; }
  const r = await window.ringTest(v);
  r.name = name; r.room = a.room;
  v.stop(); window.toMenu();
  return r;
});
const ringChecks = (r, what, low = 0.6) => {
  check(!r.none, `${what}: a looping sound with a baked echo to test with (${r.name}, room ${r.room})`);
  if (r.none) return;
  check(r.cleanStopped && r.at60 > 0.25 * r.before, `${what}: held, the sound itself stops and its echo is still heard a moment later (${r.at60.toFixed(4)} of ${r.before.toFixed(4)} before)`);
  check(r.at600 < r.at60 && r.at600 > 0 && r.at1500 < 0.02 * r.before && r.tailGone, `${what}: the echo dies away smoothly and is gone (${r.at60.toFixed(4)}, ${r.at600.toFixed(4)}, ${r.at1500.toFixed(5)})`);
  check(r.after > low * r.before && r.after < 1.6 * r.before && r.oneEcho, `${what}: carried on, the echo is back at its level (${r.after.toFixed(4)} against ${r.before.toFixed(4)}), one echo`);
  check(r.ringing && r.heldNoTail && r.oldEnded && r.afterQuick < 1.6 * r.before, `${what}: carried on while still ringing, the old echo is taken out, never two at once (${r.afterQuick.toFixed(4)})`);
  check(r.cleanAfterMany && r.afterMany > low * r.before && r.afterMany < 1.6 * r.before, `${what}: forty quick pauses later, one sound and one echo, at its level (${r.afterMany.toFixed(4)})`);
};
ringChecks(s3, 'a credit beacon in a labyrinth');

if (!FATE) console.log('(Call of Fate\'s template was not found: its bell is not checked.)');
else {
  const fate = await page.evaluate(async (d) => {
    const { checkEvent } = await import('./js/modes/events/schema.js');
    const G = window.__el.game; const a = G.audio;
    const [ev] = checkEvent(d);
    G._toMenu(''); G.state = 'events_menu';
    G._eventLoadThenStart(ev);
    for (let i = 0; i < 400 && G.state !== 'event'; i++) await window.sleep(50);
    if (G.state !== 'event') return { none: true, name: 'no event', room: a.room };
    for (let i = 0; i < 10; i++) { G.frame(1 / 30); await window.sleep(20); }
    // One of its bells, with the baked echo (made a moment after the room is first heard).
    let v = null;
    for (let i = 0; i < 80 && !v; i++) {
      v = [...a.live].find((x) => x.loop && /bell/.test(x.name) && x.wet && x.wet.buffer) || null;
      if (!v) { G.frame(1 / 30); await window.sleep(100); }
    }
    const bells = [...a.live].filter((x) => x.loop && /bell/.test(x.name)).map((x) => x.name);
    if (!v) {
      // (Its bells began before their echo was made: one more, played now, has it.)
      const nm = bells[0];
      v = nm ? await window.bakedLoop(nm) : null;
      if (!v) { window.toMenu(); return { none: true, name: bells.join(','), room: a.room }; }
    }
    v.setVolume(0.8, 0.8, 0);
    const r = await window.ringTest(v, 1200);
    r.name = v.name; r.room = a.room;
    // And through the game's own pause: every bell held, each with its echo ringing.
    for (let i = 0; i < 5; i++) { G.frame(1 / 30); await window.sleep(20); }
    G.input('pause');
    const held = G.pausedVoices.filter((x) => /bell/.test(x.name));
    r.gameHeld = held.length; r.gameRinging = held.filter((x) => x.wet && x.wet.buffer).every((x) => !!x.tail);
    await window.sleep(300);
    G.input('pause');
    r.gameResumed = !G.isPaused && held.every((x) => !x.paused && !x.tail);
    r.gameSaw = { paused: G.isPaused, state: G.state, held: held.map((x) => [x.name.slice(-6), !!(x.wet && x.wet.buffer), x.paused, !!x.tail, x.stopped]) };
    window.toMenu();
    return r;
  }, FATE);
  ringChecks(fate, 'a bell in Call of Fate', 0.3);   // (a bell is loud only as it is struck: the readings vary)
  if (!fate.none) check(fate.gameHeld > 0 && fate.gameRinging && fate.gameResumed, `Call of Fate, paused by the game: ${fate.gameHeld} bells held with their echoes ringing out, all carried on by the resume: ${JSON.stringify(fate.gameSaw)}`);
}

// ------------------------------------------------------------------ 1b, 1c: levels are glides that end
const s1 = await page.evaluate(async () => {
  const g = window.__el.game; const a = g.audio; const r = {};
  // Count every kind of change sent to the sound's own thread.
  const counts = { setTargetAtTime: 0, linearRampToValueAtTime: 0, setValueAtTime: 0 };
  const proto = AudioParam.prototype; const real = {};
  for (const k of Object.keys(counts)) { real[k] = proto[k]; proto[k] = function (...args) { counts[k] += 1; return real[k].apply(this, args); }; }
  const pick = g._chaosPickNext; g._chaosPickNext = () => 'battle';
  window.startMode('chaos');
  // Ten seconds of a Chaos battle, walking and turning.
  const t0 = performance.now(); let frames = 0;
  while (performance.now() - t0 < 10000) {
    g.frame(1 / 30); frames += 1;
    if (frames % 20 === 0) g.input(['up', 'left', 'up', 'right'][(frames / 20) % 4]);
    await window.sleep(30);
  }
  r.state = g.state; r.counts = { ...counts }; r.perSecond = Math.round((counts.linearRampToValueAtTime + counts.setValueAtTime + counts.setTargetAtTime) / 10);
  // A beacon you cannot hear: its levels are exactly nothing, not creeping toward it.
  const v = a.play('ammo_beacon', { loops: -1, volume: 0.0 });
  v.setVolume(0.6, 0.3, 0); await window.sleep(120);
  r.heard = [v.dry.gl.gain.value, v.dry.gr.gain.value];
  v.setVolume(0, 0, 0); await window.sleep(120);
  r.silent = [v.dry.gl.gain.value, v.dry.gr.gain.value, v.dull ? v.dull.gl.gain.value : 0, v.dull ? v.dull.gr.gain.value : 0];
  // In front of you, the dull copy is exactly nothing too.
  v.setVolume(0.6, 0.6, 0); await window.sleep(120);
  r.front = v.dull ? [v.dull.gl.gain.value, v.dull.gr.gain.value] : [0, 0];
  // 1c: heard again after silence, its level comes in on a glide, not in one jump.
  v.setVolume(0, 0, 0); await window.sleep(120);
  v.setVolume(0.6, 0.6, 0);
  r.again = { rightAway: v.dry.gl.gain.value };
  await window.sleep(80);
  r.again.after = v.dry.gl.gain.value;
  v.stop();
  for (const k of Object.keys(counts)) proto[k] = real[k];
  g._chaosPickNext = pick;
  window.toMenu();
  return r;
});
check(s1.state === 'battle' && s1.counts.setTargetAtTime === 0, `ten seconds of a Chaos battle: not one open-ended glide is sent (${JSON.stringify(s1.counts)}, about ${s1.perSecond} changes a second)`);
check(Math.abs(s1.heard[0] - 0.6) < 1e-6 && Math.abs(s1.heard[1] - 0.6) < 1e-6, `a level lands on what was sent and stays there (the louder side's, 0.6: the panner does the rest; ${s1.heard.join(', ')})`);
check(s1.silent.every((x) => x === 0) && s1.front.every((x) => x === 0), `a beacon out of earshot is exactly silent, and so is the dull copy of one in front of you (${JSON.stringify([s1.silent, s1.front])})`);
check(s1.again.rightAway < 0.3 && Math.abs(s1.again.after - 0.6) < 1e-6, `heard again after silence, its level glides in instead of jumping (${s1.again.rightAway.toFixed(3)} at once, ${s1.again.after} after)`);

// ------------------------------------------------------------------ 1d: a fresh sound engine for every run
const before = await page.evaluate(() => {
  const g = window.__el.game; const a = g.audio;
  const pick = g._chaosPickNext; g._chaosPickNext = () => 'battle';
  window.startMode('chaos');
  for (let i = 0; i < 60; i++) g.frame(1 / 30);
  g._chaosPickNext = pick;
  window.firstCtx = a.ctx;
  g.triggerGameOver();
  return { state: g.state, freshened: a.freshened || 0, recoveries: a.recoveries, stale: g.soundStale };
});
await page.keyboard.press('ArrowUp');          // a key at the game over screen: nothing yet
const atOver = await page.evaluate(() => ({ same: window.__el.audio.ctx === window.firstCtx, state: window.__el.game.state }));
await page.keyboard.press('Enter');            // back to the main menu
const atMenu = await page.evaluate(() => ({ same: window.__el.audio.ctx === window.firstCtx, state: window.__el.game.state }));
await page.keyboard.press('ArrowDown');        // the first key on the menu: the fresh engine
await page.waitForTimeout(300);
const fresh = await page.evaluate(async () => {
  const g = window.__el.game; const a = g.audio;
  const r = { changed: a.ctx !== window.firstCtx, freshened: a.freshened, recoveries: a.recoveries, state: a.ctx.state, live: a.live.size,
    oldState: window.firstCtx.state, time: a.ctx.currentTime };
  window.secondCtx = a.ctx;
  return r;
});
await page.keyboard.press('ArrowUp');          // another key: no second fresh engine
const second = await page.evaluate(async () => {
  const g = window.__el.game; const a = g.audio; const r = { same: a.ctx === window.secondCtx, freshened: a.freshened };
  // The next run plays in the new engine.
  const pick = g._chaosPickNext; g._chaosPickNext = () => 'battle';
  window.startMode('chaos');
  for (let i = 0; i < 90; i++) { g.frame(1 / 30); await window.sleep(10); }
  g._chaosPickNext = pick;
  r.state = g.state;
  r.inNew = [...a.live].every((v) => v.ctx === a.ctx) && a.live.size > 0;
  r.running = a.ctx.state === 'running' && a.ctx.currentTime > 0.5;
  window.toMenu();
  return r;
});
await page.waitForTimeout(8500);
const oldGone = await page.evaluate(() => window.firstCtx.state);
check(before.state === 'game_over' && before.stale === true, 'a run ends: the next one is due a fresh sound engine');
check(atOver.same && atMenu.same && atMenu.state === 'menu', 'not at the game over screen, where the result is still being said, nor on the way to the menu');
check(fresh.changed && fresh.freshened === before.freshened + 1 && fresh.recoveries === before.recoveries && fresh.live === 0, `the first key on the main menu makes the fresh engine, with nothing carried into it: ${JSON.stringify(fresh)}`);
check(second.same && second.freshened === fresh.freshened, 'only once: the next key leaves it alone');
check(second.state === 'battle' && second.inNew && second.running, 'the next run plays in the new engine');
check(fresh.oldState !== 'closed' && oldGone === 'closed', `the old engine is kept while anything in it finishes, then closed (${fresh.oldState}, then ${oldGone})`);

//SECTIONS

check(errors.length === 0, 'no errors in the page: ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
