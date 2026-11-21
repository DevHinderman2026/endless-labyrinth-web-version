// What web 6.0.0 changed in the sound engine, Battle Mode and Ultimate Mode (agent
// web-a), end to end in Chromium through Playwright:
// - every sound heard from a place plays a one-channel copy of its recording,
//   as loud as the recording, the louder side alone where the two sides cancel;
//   a background, the drums and anything not placed keep both channels;
// - the arena crowd in Battle Mode and in Chaos's battles: the stadium crowd under
//   the drums (handed on when the drums change, fading with them when a chaos
//   battle ends), a roar for every enemy shot down and a reaction when one reaches
//   you, all ringing in the arena's echo, no announcer;
// - Ultimate Mode's compass (6.3.3: its freezing): thirty seconds at most, then the world moves without a word, and
//   not again for fifteen seconds;
// - Ultimate Mode's worlds last two to five minutes, with the five countdown beeps;
// - health: a potion fills to 100 and never lowers more, a chest's or a glass
//   case's health goes on top, even over 100.
// Run: serve the site folder (python3 -m http.server 8765), then
//   node --import ./tests/github-stub.mjs tests/web60a.mjs http://localhost:8765
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + '/play.html?desktop=1');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 120000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.evaluate(() => {
  const a = window.__el.audio; const g = window.__el.game;
  window.__t = {
    listen() {
      const played = []; const spoken = [];
      const op = a.play.bind(a); const os = g.tts.speak.bind(g.tts);
      a.play = (n, o) => { const v = op(n, o); played.push([n, o || {}, v]); return v; };
      g.tts.speak = (t, o) => { spoken.push(t); return os(t, o); };
      return { played, spoken, stop() { a.play = op; g.tts.speak = os; } };
    },
  };
});

// ------------------------------------------------------------------ 1. the one-channel copies
const mono = await page.evaluate(async () => {
  const { monoCopy, monoPlan } = await import('./js/audio.js');
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  const n = 44100;
  const make = (fl, fr) => { const b = ctx.createBuffer(2, n, 44100); const l = b.getChannelData(0); const r = b.getChannelData(1); for (let i = 0; i < n; i++) { l[i] = fl(i); r[i] = fr(i); } return b; };
  const pow = (b) => { let s = 0; for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) s += d[i] * d[i]; } return s / b.numberOfChannels / n; };
  const sine = (f, ph = 0) => (i) => 0.4 * Math.sin(2 * Math.PI * f * i / 44100 + ph);
  let seed = 7; const noise = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 0.5; };
  const noiseL = Array.from({ length: n }, noise); const noiseR = Array.from({ length: n }, noise);
  const out = {};
  // Alike on both sides but leaning left (6 dB): averaged, as loud as the recording.
  const lean = make(sine(440), (i) => 0.5 * sine(440)(i));
  const ml = monoCopy(ctx, lean);
  out.lean = { ch: ml.numberOfChannels, plan: monoPlan(lean).mode, ratio: pow(ml) / pow(lean), same: monoCopy(ctx, lean) === ml };
  // One side only: that side, as loud as the recording.
  const one = make(sine(330), () => 0);
  const mo = monoCopy(ctx, one);
  out.one = { plan: monoPlan(one).mode, ratio: pow(mo) / pow(one) };
  // Opposed sides (cancel when added): the louder side alone, not a near-silence.
  const anti = make(sine(220), (i) => -0.8 * sine(220)(i));
  const ma = monoCopy(ctx, anti);
  out.anti = { plan: monoPlan(anti).mode, ratio: pow(ma) / pow(anti) };
  // Unrelated sides (a wide recording): averaged, loudness matched.
  const wide = make((i) => noiseL[i], (i) => noiseR[i]);
  const mw = monoCopy(ctx, wide);
  out.wide = { plan: monoPlan(wide).mode, ratio: pow(mw) / pow(wide), lossDb: monoPlan(wide).lossDb };
  // A one-channel recording is itself.
  const m1 = ctx.createBuffer(1, n, 44100);
  out.single = monoCopy(ctx, m1) === m1;
  return out;
});
const near = (x, y, tol = 0.03) => Math.abs(x - y) <= tol;
check(mono.lean.ch === 1 && mono.lean.plan === 'mix' && near(mono.lean.ratio, 1) && mono.lean.same, 'a recording leaning to one side becomes one channel, both sides averaged, as loud as the recording, made once: ' + JSON.stringify(mono.lean));
check(mono.one.plan === 'left' && near(mono.one.ratio, 1), 'a recording on one side only plays that side, as loud as the recording: ' + JSON.stringify(mono.one));
check(mono.anti.plan === 'left' && near(mono.anti.ratio, 1), 'a recording whose sides cancel when added plays its louder side alone: ' + JSON.stringify(mono.anti));
check(mono.wide.plan === 'mix' && near(mono.wide.ratio, 1) && mono.wide.lossDb < -2.5 && mono.wide.lossDb > -3.5, 'a wide recording (unrelated sides) is averaged and brought back up to its own loudness: ' + JSON.stringify(mono.wide));
check(mono.single, 'a recording already one channel is used as it is');

// ------------------------------------------------------------------ 2. Battle Mode: placed sounds, and the arena crowd
await page.evaluate(() => { const g = window.__el.game; g.menuIndex = g.menuKeys.indexOf('battle'); g.input('enter'); });
await page.waitForFunction(() => window.__el.game.state === 'battle');
await sleep(2500);   // the crowd's long recording is decoded when it is first played
const bat = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio;
  const out = {};
  const c = g.battleCrowdChannel;
  out.crowd = c && { name: c.name, busy: c.busy, loop: c.loop, l: c.l, followed: !!(g.beatChannel && g.beatChannel.followers.includes(c)), send: c.send, sendSet: !!c.sendSet, wet: !!c.wet, ch: c.dry && c.dry.buffer.numberOfChannels, wide: !!(c.dry && c.dry.wide) };
  // (6.1.0) Its twin: the same recording half a loop on, at the same level, with the drums too.
  const t = g.battleCrowdTwin;
  const len = c && c.dry ? c.dry.buffer.duration : 0;
  out.twin = t && { name: t.name, busy: t.busy, l: t.l, followed: !!(g.beatChannel && g.beatChannel.followers.includes(t)),
    apart: len ? +(((a.ctx.currentTime - t.startedAt) - (a.ctx.currentTime - c.startedAt) + len * 10) % len / len).toFixed(2) : null };
  out.drums = g.beatChannel && { name: g.beatChannel.name, ch: g.beatChannel.dry && g.beatChannel.dry.buffer.numberOfChannels, l: g.beatChannel.l };
  out.room = a.room;
  // The drums change: the same crowd goes on, now with the new drums.
  const before = g.battleCrowdChannel; const oldBeat = g.beatChannel;
  g._battleSwapBeat();
  out.swap = { same: g.battleCrowdChannel === before, busy: before.busy, onNew: g.beatChannel.followers.includes(before), offOld: !oldBeat.followers.includes(before), oldFading: !!oldBeat.fadingOut, newBeat: g.beatChannel !== oldBeat };
  // An enemy straight ahead: shot down, and the crowd roars after the bang.
  const L = window.__t.listen();
  g.ammo = 5; g.inWaveBreak = false;
  for (const o of g.obstacles) if (o.channel) o.channel.stop();
  g.obstacles = [];
  g.tn.face = 0; a.setFacing(0, true);
  const o = { x: g.playerPos[0], y: g.playerPos[1] - 10, soundIdx: 0, soundName: 'obstacle_0', update() { return 10; } };
  o.channel = a.play('obstacle_0', { loops: -1 });
  g.obstacles.push(o);
  // A frame of the battle: the enemy's sound is given its place.
  o.channel.setVolume(...g._battleLevels([o.x, o.y]).slice(0, 2), g._behind([o.x, o.y]));
  out.enemy = { ch: o.channel.dry && o.channel.dry.buffer.numberOfChannels, orig: a.buffers.get('dry:obstacle_0').numberOfChannels, panner: !!(o.channel.dry && o.channel.dry.panner) };
  g.fireLaser();
  out.killed = !g.obstacles.includes(o);
  await new Promise((r) => setTimeout(r, 1300));
  const roar = L.played.find(([n]) => /^ut_crowd_roar_\d$/.test(n));
  out.roar = roar && { name: roar[0], volume: roar[1].volume, send: roar[1].send, wet: !!(roar[2] && roar[2].wet), conv: roar[2] && roar[2].wet && roar[2].wet.conv && roar[2].wet.conv.key };
  out.announcer = L.spoken.length;
  // Two kills in a row never roar the same recording twice.
  const names = [];
  for (let i = 0; i < 12; i++) { names.push(g._battleCrowdPick(['ut_crowd_roar_1', 'ut_crowd_roar_2', 'ut_crowd_roar_3'], 'battleLastRoar')); }
  out.repeats = names.some((n, i) => i > 0 && n === names[i - 1]);
  // A beacon heard from a place: the cartridge.
  g._battleRestock && (g.inWaveBreak = true, g._battleRestock(), g.inWaveBreak = false);
  const p = g.ammoPickups[0];
  if (p && p.channel) { p.channel.setVolume(...g._battleLevels([p.x, p.y], 0.55).slice(0, 2), g._behind([p.x, p.y])); out.beacon = { name: p.channel.name, ch: p.channel.dry && p.channel.dry.buffer.numberOfChannels, orig: (a.buffers.get('dry:' + p.channel.name) || {}).numberOfChannels }; }
  // A stereo recording given a place after it began (a loop in a mode that turns
  // begins wide, until its first frame): from then on it plays one channel, from
  // the same point, still one source per branch.
  const st = a.play('stairs_beacon', { loops: -1, volume: 0.5 });
  const was = st && st.dry && { ch: st.dry.buffer.numberOfChannels, wide: !!st.dry.wide, sources: st.sources.length };
  await new Promise((r) => setTimeout(r, 300));
  st.setVolume(0.2, 0.8, 0);
  out.swap1 = { was, ch: st.dry.buffer.numberOfChannels, panner: !!st.dry.panner, sources: st.sources.length, src: st.dry.src === st.sources[0], orig: a.buffers.get('dry:stairs_beacon').numberOfChannels, busy: st.busy };
  st.stop();
  // A one-shot played at a place: one channel from the start.
  const ex = a.play('explosion', { at: [g.playerPos[0] + 5, g.playerPos[1]] });
  out.atPlace = ex && { ch: ex.dry.buffer.numberOfChannels, orig: a.buffers.get('dry:explosion').numberOfChannels, panner: !!ex.dry.panner };
  // An enemy reaches you: the crowd reacts, the run is over, and the crowd goes with the drums.
  const crowd = g.battleCrowdChannel;
  const e = { x: g.playerPos[0], y: g.playerPos[1] - 0.3, soundIdx: 1, soundName: 'obstacle_1', channel: null, update() { return 0.3; } };
  g.obstacles.push(e);
  L.played.length = 0;
  g.updateBattleMode(1 / 30);
  const react = L.played.find(([n]) => /^ut_crowd_hit_\d$/.test(n));
  out.react = react && { name: react[0], volume: react[1].volume, send: react[1].send, wet: !!(react[2] && react[2].wet) };
  out.over = g.state;
  out.crowdAfter = crowd.busy;
  L.stop();
  return out;
});
check(bat.crowd && bat.crowd.name === 'event_amb_file_evt_amb_stadium_crowd' && bat.crowd.busy && bat.crowd.loop && Math.abs(bat.crowd.l - 0.44 * Math.SQRT1_2) < 1e-6, 'Battle Mode: the stadium crowd plays under the drums, at Ultimate\'s level against the drone (two copies, each 0.44/sqrt 2): ' + JSON.stringify(bat.crowd));
check(bat.twin && bat.twin.name === bat.crowd.name && bat.twin.busy && Math.abs(bat.twin.l - bat.crowd.l) < 1e-9 && bat.twin.followed && Math.abs(bat.twin.apart - 0.5) < 0.02,
  '6.1.0: its second copy plays half a loop apart, so the recording\'s quiet stretch is always filled: ' + JSON.stringify(bat.twin));
check(bat.crowd && bat.crowd.followed && bat.crowd.sendSet && Math.abs(bat.crowd.send - 0.15) < 1e-6 && bat.crowd.wet && bat.room === 'battle', 'the crowd goes with the drums and rings lightly in the arena\'s echo, as an Ultimate background does: ' + JSON.stringify(bat.crowd));
check(bat.drums && bat.drums.ch === 2 && bat.crowd.ch === 2, 'the drums and the crowd, not placed, keep both their channels: ' + JSON.stringify([bat.drums, bat.crowd && bat.crowd.ch]));
check(bat.swap.same && bat.swap.busy && bat.swap.onNew && bat.swap.offOld && bat.swap.oldFading && bat.swap.newBeat, 'when the drums change the same crowd carries on with the new drums: ' + JSON.stringify(bat.swap));
check(bat.killed && bat.roar && Math.abs(bat.roar.volume - 0.48) < 1e-6 && Math.abs(bat.roar.send - (/_[12]$/.test(bat.roar.name) ? 0.5 : 0.8)) < 1e-6 && bat.roar.wet && /^battle/.test(bat.roar.conv || ''), 'shooting an enemy down: the crowd roars after the bang, a little quieter than Ultimate\'s (0.48), in the arena\'s echo (0.8, or 0.5 for the live-recorded roars): ' + JSON.stringify(bat.roar));
check(bat.announcer === 0, 'no announcer: nothing is spoken for a kill');
check(!bat.repeats, 'the crowd never roars the same recording twice running');
check(bat.enemy.ch === 1 && bat.enemy.panner, `an enemy heard from its place plays one channel (its recording has ${bat.enemy.orig}): ` + JSON.stringify(bat.enemy));
check(bat.swap1.was && bat.swap1.was.ch === 2 && bat.swap1.orig === 2 && bat.swap1.ch === 1 && bat.swap1.panner && bat.swap1.sources === bat.swap1.was.sources && bat.swap1.src && bat.swap1.busy, 'a stereo loop given its place after it began switches to its one-channel copy then and there: ' + JSON.stringify(bat.swap1));
check(bat.atPlace && bat.atPlace.orig === 2 && bat.atPlace.ch === 1 && bat.atPlace.panner, 'a stereo one-shot played at a place (an explosion) plays one channel: ' + JSON.stringify(bat.atPlace));
check(!bat.beacon || bat.beacon.ch === 1, 'the cartridge\'s beacon, heard from its place, plays one channel: ' + JSON.stringify(bat.beacon));
check(!bat.react && bat.over === 'game_over' && !bat.crowdAfter, '6.1.0: an enemy reaching you: no groan or gasp from the crowd, the run ends, and the crowd stops with the drums: ' + JSON.stringify([bat.react, bat.over, bat.crowdAfter]));

// ------------------------------------------------------------------ 2b. (6.0.3) Louder beacons, and the crowd going wild as a wave begins
await page.evaluate(() => { window.__el.game.input('enter'); });
await page.waitForFunction(() => window.__el.game.state === 'menu');
await page.evaluate(() => { const g = window.__el.game; g.menuIndex = g.menuKeys.indexOf('battle'); g.input('enter'); });
await page.waitForFunction(() => window.__el.game.state === 'battle');
await sleep(1500);
const wave = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio;
  const out = {};
  for (const o of g.obstacles) if (o.channel) o.channel.stop();
  g.obstacles = [];
  // A cartridge twenty units away during a break: twice the old loudness.
  g.inWaveBreak = true; g.waveBreakTimer = 30;
  g._battleRestock();
  const p = g.ammoPickups[0];
  p.x = g.playerPos[0]; p.y = g.playerPos[1] - 20;
  g.updateBattleMode(1 / 30);
  const old = Math.max(0.12, 1 - 20 / 40) * 0.55;
  out.ammo = { l: p.channel.l, r: p.channel.r, want: Math.min(1, old * 2) };
  // Up close it is held to full, never over.
  p.x = g.playerPos[0] + 3.5; p.y = g.playerPos[1];
  g.updateBattleMode(1 / 30);
  out.close = Math.max(p.channel.l, p.channel.r);
  // A credit, twenty units away.
  g._battleSpawnCredit && g._battleSpawnCredit();
  const c = g.timeCredit;
  if (c) { c.x = g.playerPos[0] - 20; c.y = g.playerPos[1]; g.updateBattleMode(1 / 30); out.credit = { v: Math.max(c.channel.l, c.channel.r), want: Math.min(1, Math.max(0.12, 1 - 20 / 40) * 0.7 * 2) }; }
  // The break ends: the war horn, and the crowd goes wild.
  const L = window.__t.listen();
  const crowd = g.battleCrowdChannel;
  out.crowdBefore = crowd && crowd.l;
  g.waveBreakTimer = 0.01;
  g.updateBattleMode(1 / 30);
  out.horn = L.played.some(([n]) => n === 'wave_start');
  for (let i = 0; i < 18; i++) g.updateBattleMode(1 / 30);   // 0.6 seconds
  out.swell = crowd && crowd.l;
  await new Promise((r) => setTimeout(r, 1200));
  const roars = L.played.filter(([n]) => /^ut_crowd_roar_\d$/.test(n));
  out.roars = roars.map(([n, o]) => [n, o.volume]);
  for (let i = 0; i < 150; i++) { g.obstacles = []; g.updateBattleMode(1 / 30); }   // five seconds more
  out.after = crowd && crowd.l;
  out.surge = g.battleCrowdSurge;
  L.stop();
  g.triggerGameOver();   // (as section 2 left it)
  return out;
});
await page.waitForFunction(() => window.__el.game.state === 'game_over');
check(Math.abs(wave.ammo.l - wave.ammo.want) < 1e-6 && Math.abs(wave.ammo.r - wave.ammo.want) < 1e-6, 'Battle Mode (6.0.3): a cartridge beacon is twice as loud as before, to be heard over the crowd: ' + JSON.stringify(wave.ammo));
check(wave.close <= 1 + 1e-9 && wave.close > 0.9, 'and up close it is held to full loudness, never over: ' + wave.close);
check(wave.credit && Math.abs(wave.credit.v - wave.credit.want) < 1e-6, 'a credit beacon is twice as loud too: ' + JSON.stringify(wave.credit));
check(wave.horn, 'the break ends with the war horn');
check(wave.roars.length === 3 && new Set(wave.roars.map(([n]) => n)).size === 3 && wave.roars.every(([, v]) => Math.abs(v - 0.48) < 1e-6), 'and the crowd goes wild: three different roars together, as loud as a kill\'s cheer (6.1.0): ' + JSON.stringify(wave.roars));
check(Math.abs(wave.crowdBefore - 0.44 * Math.SQRT1_2) < 1e-6 && wave.swell > 1.9 * 0.44 * Math.SQRT1_2 && Math.abs(wave.after - 0.44 * Math.SQRT1_2) < 1e-6 && wave.surge === null, `the crowd's murmur swells to twice its level and settles back after a few seconds: ${wave.crowdBefore} -> ${wave.swell} -> ${wave.after}`);

// ------------------------------------------------------------------ 3. Chaos: a battle has the crowd, which fades out with its drums
await page.evaluate(() => { const g = window.__el.game; g.input('enter'); });
await page.waitForFunction(() => window.__el.game.state === 'menu');
const chaos = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio;
  g.menuIndex = g.menuKeys.indexOf('chaos'); g.input('enter');
  const out = { first: g.state };
  g.chaosNext = 'battle';
  g._chaosBeginGap(); g.chaosGap = 0; g.updateChaosGap(0.01);
  out.state = g.state;
  await new Promise((r) => setTimeout(r, 2500));
  const c = g.battleCrowdChannel;
  out.crowd = c && { name: c.name, busy: c.busy, followed: !!(g.beatChannel && g.beatChannel.followers.includes(c)) };
  // The level ends: its drums fade, and the crowd fades with them instead of stopping dead.
  g._chaosBeginGap();
  g.chaosNext = 'battle';     // (the game's own frames carry on through the gap into the next level)
  out.gap = { state: g.state, busy: c && c.busy, fading: !!(c && c.fadingOut) };
  await new Promise((r) => setTimeout(r, 900));
  out.later = c && c.busy;
  // Another battle: a crowd again.
  if (g.state !== 'battle') { g.chaosGap = 0; g.updateChaosGap(0.01); }
  await new Promise((r) => setTimeout(r, 300));
  out.again = !!(g.state === 'battle' && g.battleCrowdChannel && g.battleCrowdChannel.busy && g.battleCrowdChannel !== c);
  g.triggerGameOver();
  return out;
});
check(chaos.state === 'battle' && chaos.crowd && chaos.crowd.busy && chaos.crowd.followed, 'a chaos battle has the arena crowd with its drums: ' + JSON.stringify(chaos));
check(chaos.gap.state !== 'battle' && chaos.gap.busy && chaos.gap.fading && !chaos.later && chaos.again, 'when a chaos battle ends the crowd fades out with its drums, and the next battle has its own: ' + JSON.stringify(chaos));

// ------------------------------------------------------------------ 4. Ultimate Mode
await page.evaluate(() => { const g = window.__el.game; g.input('enter'); });
await page.waitForFunction(() => window.__el.game.state === 'menu');
await page.evaluate(() => { const g = window.__el.game; g.scores.settings.turnTold = true; g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter'); });
await sleep(1500);
const ult = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const u = g.ut;
  const mod = await import('./js/modes/ultimate.js');
  const out = { WORLD_SECONDS: mod.WORLD_SECONDS, COMPASS_MAX_ON: mod.COMPASS_MAX_ON, COMPASS_REST: mod.COMPASS_REST };
  const calm = () => { for (const e of u.enemies) if (e.voice) { e.voice.stop(); u.voices.delete(e.voice); } u.enemies = []; u.respawn.clear(); u.bus = null; u.busAt = null; u.safe = 999; u.place = 'world'; };
  // The placed and the wide copies of the area's air.
  for (let i = 0; i < 10; i++) g.updateUltimateMode(1 / 30);
  await new Promise((r) => setTimeout(r, 1500));
  for (let i = 0; i < 5; i++) g.updateUltimateMode(1 / 30);
  const s = u.areaSounds.get(u.area.id);
  out.air = s && { placed: s.amb && s.amb.dry && s.amb.dry.buffer.numberOfChannels, wide: s.ambIn && s.ambIn.dry && s.ambIn.dry.buffer.numberOfChannels, orig: (a.buffers.get('dry:' + (s.amb && s.amb.name)) || {}).numberOfChannels, name: s.amb && s.amb.name };
  const placed = [...u.voices].filter((v) => v.placed && v.dry);
  out.placedStereo = placed.filter((v) => v.dry.buffer.numberOfChannels !== 1).map((v) => v.name);
  out.placedCount = placed.length;
  // ---- the compass (web 6.3.3: the half minute limits the freezing; the guide stays on)
  const L = window.__t.listen();
  calm(); u.worldTime = 1000;
  g.input('compass');
  out.on = u.compass.on && u.compass.frozen;
  let t = 0;
  while (u.compass.frozen && t < 40) { g.updateUltimateMode(0.1); t += 0.1; u.worldTime = 1000; u.safe = 999; }
  out.thawAfter = +t.toFixed(1);
  out.guideOn = u.compass.on;
  out.spokeOff = L.spoken.some((x) => /Compass off/.test(x));
  g.input('compass');   // off
  L.spoken.length = 0;
  g.input('compass');   // on at once: a guide, the world not frozen
  out.noFreeze = { on: u.compass.on, frozen: u.compass.frozen, said: L.spoken.slice() };
  g.input('compass');   // off
  for (let i = 0; i < 140; i++) { g.updateUltimateMode(0.1); u.worldTime = 1000; u.safe = 999; }
  g.input('compass');   // 14 seconds on: still no freezing
  out.stillNone = { on: u.compass.on, frozen: u.compass.frozen };
  g.input('compass');   // off
  for (let i = 0; i < 15; i++) { g.updateUltimateMode(0.1); u.worldTime = 1000; u.safe = 999; }
  g.input('compass');
  out.backFrozen = u.compass.on && u.compass.frozen;
  // Off and on again quickly: the same half minute of freezing carries on.
  for (let i = 0; i < 200; i++) { g.updateUltimateMode(0.1); u.worldTime = 1000; u.safe = 999; }
  g.input('compass');   // off, at 20 seconds frozen
  for (let i = 0; i < 20; i++) { g.updateUltimateMode(0.1); u.worldTime = 1000; u.safe = 999; }
  g.input('compass');   // on again 2 seconds later
  let t2 = 0;
  while (u.compass.frozen && t2 < 40) { g.updateUltimateMode(0.1); t2 += 0.1; u.worldTime = 1000; u.safe = 999; }
  out.carried = +t2.toFixed(1);
  g.input('compass');   // off
  // After the world has moved for 15 seconds, a fresh half minute.
  for (let i = 0; i < 160; i++) { g.updateUltimateMode(0.1); u.worldTime = 1000; u.safe = 999; }
  g.input('compass');
  let t3 = 0;
  while (u.compass.frozen && t3 < 40) { g.updateUltimateMode(0.1); t3 += 0.1; u.worldTime = 1000; u.safe = 999; }
  out.fresh = +t3.toFixed(1);
  g.input('compass');   // off
  for (let i = 0; i < 160; i++) { g.updateUltimateMode(0.1); u.worldTime = 1000; u.safe = 999; }
  // ---- the world's length, and the countdown
  const lens = [];
  for (let i = 0; i < 60; i++) { u.worldTime = 0.01; g.updateUltimateMode(0.02); calm(); lens.push(u.worldLen); if (i % 10 === 9) await new Promise((r) => setTimeout(r, 200)); }
  out.lens = { min: Math.min(...lens), max: Math.max(...lens), under150: lens.filter((x) => x < 150).length, over270: lens.filter((x) => x > 270).length };
  calm();
  L.played.length = 0;
  u.worldTime = 5.5;
  for (let i = 0; i < 60 && u.worldNo === out.worldNo; i++) { g.updateUltimateMode(0.1); }
  out.worldNo = u.worldNo;
  const startNo = u.worldNo;
  L.played.length = 0;
  u.worldTime = 5.5;
  let frames = 0;
  while (u.worldNo === startNo && frames < 100) { g.updateUltimateMode(0.1); u.safe = 999; frames += 1; }
  out.beeps = L.played.filter(([n]) => n === 'countdown_high').length;
  out.regenerated = u.worldNo === startNo + 1;
  // ---- health
  calm();
  const potion = (hp) => { u.hp = hp; const area = u.world.areas.find((x) => x.kind === 'event') || u.area; const p = { kind: 'potion', area, safe: true, pos: [0, 0], voice: null }; u.pickups.push(p); g._utTakePickup(p); return u.hp; };
  out.potion = { from60: potion(60), from130: potion(130), from100: potion(100) };
  const chest = (hp) => {
    for (let i = 0; i < 400; i++) {
      u.hp = hp; L.spoken.length = 0;
      g._utOpenChest();
      if ((u.lastChest || []).includes('health')) return { hp: u.hp, said: L.spoken[L.spoken.length - 1] };
    }
    return null;
  };
  out.chest100 = chest(100); out.chest130 = chest(130);
  const fulls = []; for (let i = 0; i < 300; i++) { const r = chest(30); if (r) fulls.push(r.hp); }
  out.chestFrom30 = [...new Set(fulls)].sort();
  // The glass case's health.
  const area = u.world.areas.find((x) => ['battle', 'island', 'labyrinth'].includes(x.kind)) || u.area;
  const cell = area.floorCells[Math.floor(area.floorCells.length / 2)];
  const caseHealth = [];
  for (let i = 0; i < 300 && caseHealth.length < 5; i++) {
    calm(); u.hp = 100; L.spoken.length = 0;
    g._utSmash({ area, pos: [cell[0] * 3 + 1.5, cell[1] * 3 + 1.5], voice: null, near: true, smashed: false });
    if (u.lastCase && u.lastCase.kind === 'health') caseHealth.push([u.hp, L.spoken[L.spoken.length - 1]]);
  }
  out.caseHealth = caseHealth;
  calm();
  // A hit takes surplus down like any health.
  u.hp = 140; u.safe = 0; u.hitCooldown = 0; u.compass.on = false;
  const dmg = g._utDamage();
  g._utHurt(null);
  out.hit = { from: 140, to: u.hp, dmg };
  L.spoken.length = 0;
  g._utReport();
  out.report = L.spoken[0];
  out.status = g.mode && g.mode.status ? g.mode.status(g) : '';
  L.stop();
  u.safe = 999;
  return out;
});
check(String(ult.WORLD_SECONDS) === '120,300' && ult.lens.min >= 120 && ult.lens.max <= 300 && ult.lens.under150 > 0 && ult.lens.over270 > 0, 'Ultimate: a world lasts a random two to five minutes: ' + JSON.stringify(ult.lens));
check(ult.beeps === 5 && ult.regenerated, `the five countdown beeps before a new world: ${ult.beeps}`);
check(ult.air && ult.air.placed === 1 && (ult.air.orig === 1 || ult.air.wide === 2), 'an area\'s air: the placed copy is one channel, the wide copy inside keeps both: ' + JSON.stringify(ult.air));
check(ult.placedCount > 0 && ult.placedStereo.length === 0, `every placed sound in the world plays one channel (${ult.placedCount} placed): ` + JSON.stringify(ult.placedStereo));
check(ult.on && ult.thawAfter >= 29.9 && ult.thawAfter <= 30.2 && ult.guideOn && !ult.spokeOff, `the compass freezes the world for thirty seconds at most, then lets it move without a word, the guide still on (${ult.thawAfter} s)`);
check(ult.noFreeze.on && !ult.noFreeze.frozen && ult.noFreeze.said.some((x) => /^Compass on\. /.test(x)) && !ult.noFreeze.said.some((x) => /ready in/.test(x)) && ult.stillNone.on && !ult.stillNone.frozen && ult.backFrozen, 'for fifteen seconds after, it comes on as a guide without freezing the world, and then freezes it again: ' + JSON.stringify([ult.noFreeze, ult.stillNone, ult.backFrozen]));
check(ult.carried >= 9.8 && ult.carried <= 10.2, `turning it off and on again within fifteen seconds keeps the same half minute of freezing (${ult.carried} s left)`);
check(ult.fresh >= 29.9 && ult.fresh <= 30.2, `after the world has moved for fifteen seconds, a fresh half minute (${ult.fresh} s)`);
check(ult.potion.from60 === 100 && ult.potion.from130 === 130 && ult.potion.from100 === 100, 'a potion fills to 100 and never lowers health over 100: ' + JSON.stringify(ult.potion));
check(ult.chest100 && ult.chest100.hp === 140 && /40 health/.test(ult.chest100.said) && ult.chest130 && ult.chest130.hp === 170, 'a chest\'s health goes on top, even at 100 and over: ' + JSON.stringify([ult.chest100, ult.chest130]));
check(ult.chestFrom30.every((h) => h === 70 || h === 100) && ult.chestFrom30.includes(70), 'from low health a chest gives 40, or now and then a full heal to 100: ' + JSON.stringify(ult.chestFrom30));
check(ult.caseHealth.length > 0 && ult.caseHealth.every(([hp, said]) => hp === 130 && said === '30 health.'), 'a glass case\'s health goes on top even at 100: ' + JSON.stringify(ult.caseHealth));
check(ult.hit.to === 140 - ult.hit.dmg, 'a hit takes health over 100 down like any other: ' + JSON.stringify(ult.hit));
check(/^\d+ health\./.test(ult.report) && /Health \d+\./.test(ult.status), 'the report and the status say the health as it is, surplus and all: ' + JSON.stringify([ult.report, ult.status]));

await page.evaluate(() => { const g = window.__el.game; if (g.state === 'ultimate') g.triggerGameOver(); });
// GitHub cannot be reached from a sandbox: only errors of the game's own count.
const own = errors.filter((e) => !/github|Failed to load resource|net::/i.test(e));
check(own.length === 0, 'no errors in the page: ' + own.slice(0, 3).join(' | '));
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
await browser.close();
process.exit(failures ? 1 : 0);
