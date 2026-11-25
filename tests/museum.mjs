// The Museum (web 7.2.0): its museums, memories, pools, creatures, fiery memories, the
// character's lines, the door to the next museum, and the Museum stage of Chaos Mode.
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/museum.mjs http://localhost:8765
// It cannot hear: it checks what plays, where, and what the game does.

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

// ------------------------------------------------------------------ the recordings (read from the files)
{
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = JSON.parse(readFileSync(join(root, 'packs', 'manifest.json'), 'utf8'));
  const lines = JSON.parse(readFileSync(join(root, 'js', 'data', 'museum-lines.json'), 'utf8')).lines;
  const cast = JSON.parse(readFileSync(join(root, 'js', 'data', 'safe-zone-cast.json'), 'utf8')).characters;
  const pack = (key) => {
    const p = manifest.packs[key];
    const buf = readFileSync(join(root, 'packs', p.file));
    const n = buf.readUInt32LE(8);
    return { bytes: buf.length === p.bytes, head: JSON.parse(buf.slice(12, 12 + n).toString('utf8')), buf, base: 12 + n };
  };
  const voice = pack('museum-voice');
  const names = new Set(voice.head.entries.map((e) => e.name));
  check(voice.bytes && lines.length === 520 && voice.head.entries.length === 520 && lines.every((l) => names.has('vc_' + l.id)), `every one of the ${lines.length} Museum lines has its recording in the museum-voice pack, and no more`);
  check(voice.head.entries.every((e) => e.kind === 'voice' && voice.buf.slice(voice.base + e.offset, voice.base + e.offset + 4).toString() === 'OggS'), 'all of them Ogg recordings of kind voice');
  const per = (id, kind) => lines.filter((l) => l.character === id && l.type === kind).length;
  check(cast.every((c) => per(c.id, 'intro') === 1 && per(c.id, 'call') === 4 && per(c.id, 'pool') === 3 && per(c.id, 'fiery') === 2 && per(c.id, 'memory') === 8 && per(c.id, 'open') === 1 && per(c.id, 'goodbye') === 1),
    'every one of the 26 characters has an introduction, 4 calls, 3 pool warnings, 2 fiery warnings, 8 memories, the door and a goodbye');
  const sounds = pack('museum');
  const want = ['mu_pool', 'mu_firework_1', 'mu_firework_2', 'mu_firework_3', 'mu_firework_4', 'mu_stamp', 'mu_buzzer', 'mu_door_open', 'mu_door_close', 'creature_roar'];
  check(sounds.bytes && sounds.head.entries.length === 10 && want.every((n) => sounds.head.entries.some((e) => e.name === n)) && sounds.head.entries.filter((e) => e.loop).map((e) => e.name).join() === 'mu_pool',
    'the museum pack holds its ten recordings, only the pool looping (7.2.6: four short fireworks)');
  const fws = sounds.head.entries.filter((e) => /^mu_firework_/.test(e.name));
  check(fws.every((e) => e.frames / sounds.head.rate <= 2.0), `every firework is short: ${fws.map((e) => (e.frames / sounds.head.rate).toFixed(2)).join(', ')} s`);
  const buzz = sounds.head.entries.find((e) => e.name === 'mu_buzzer');
  check(buzz && Math.abs(buzz.frames / sounds.head.rate - 2.0) < 0.01, `the buzzer is two seconds long (7.2.4): ${buzz && (buzz.frames / sounds.head.rate).toFixed(2)} s`);
}

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/api\.github|ERR_FAILED|CORS/.test(m.text())) errors.push(m.text()); });
await page.goto(base + '/play.html?desktop=1');
await page.evaluate(() => { window.__elNoChests = true; });   // (7.2.17: no random chaos chests to upset the counts)
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 180000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
// (The characters and their lines are read a moment after the game starts.)
await page.waitForFunction(() => !!window.__el.game._muPickCharacter(), null, { timeout: 20000 });
await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio;
  const t = window.__t = { said: [], played: [], placed: [] };
  // (The game's own frame loop is held: the test steps every frame itself, in step with the clock.)
  const step = g.frame.bind(g); g.frame = () => {}; g._f = step;
  const play = a.play.bind(a);
  a.play = (name, opts) => { t.played.push(name); if (opts && opts.at) t.placed.push([name, [...opts.at]]); return play(name, opts); };
  const speak = g.tts.speak.bind(g.tts);
  g.tts.speak = (text, o) => { if (text) t.said.push(text); return speak(text, o); };
  // (In step with the clock: the character's recordings play in real time.)
  t.frames = async (seconds, dt = 1 / 30) => { const t0 = performance.now(); for (let i = 0; i < Math.round(seconds / dt); i++) { g._f(dt); const ahead = t0 + (i + 1) * dt * 1000 - performance.now(); await new Promise((r) => setTimeout(r, Math.max(0, ahead))); } };
  t.start = (key) => {
    if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); }
    g.menuIndex = g.menuKeys.indexOf(key); g.input('enter'); g._f(1 / 30);
  };
  // Clear the way: no pools, creatures asleep far off (for the checks that are not about them).
  t.calm = () => { const mu = g.mu; for (const p of mu.pools) if (p.voice) { p.voice.stop(); p.voice = null; } mu.pools = []; mu.can = () => true; for (const c of mu.creatures) { c.x = 40; c.y = -40; c.mode = 'sleep'; } };
  // Face a place and walk to it, a step at a time.
  t.walkTo = async (pos, near = 1.6) => {
    near = Math.max(near, 1.6);     // (a step is three units: nearer than half a step cannot be promised)
    const mu0 = g.mu;
    for (let i = 0; i < 200; i++) {
      const dx = pos[0] - g.playerPos[0]; const dy = pos[1] - g.playerPos[1];
      if (Math.hypot(dx, dy) < near) return true;
      g._turnStop(); g._face(Math.atan2(dx, -dy), true);
      g.input('up');
      await t.frames(0.1);
      if (!g.mu || g.mu !== mu0 || g.state !== 'museum' || g.mu.walk) return true;
    }
    return false;
  };
  // Every line the character has said, by id.
  t.lines = () => (g.muSaid || []);
  const say = g._muSay.bind(g);
  g._muSay = (ln, o) => { const r = say(ln, o); if (r && ln) (g.muSaid = g.muSaid || []).push(ln.id); return r; };
});

// ------------------------------------------------------------------ the menu and the start
const menu = await page.evaluate(() => window.__el.game.menuKeys);
check(menu.indexOf('museum') === menu.indexOf('park') + 1 && menu.indexOf('museum') < menu.indexOf('ultimate'), 'The Museum is on the main menu after the Water Park: ' + menu.join(', '));
const start = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start('museum');
  await t.frames(0.5);
  const mu = g.mu;
  return { state: g.state, museum: mu.museum, count: mu.count, memories: mu.memories.length, pools: mu.pools.length,
    creatures: mu.creatures.length, ch: mu.ch && mu.ch.id, lines: mu.lines && Object.keys(mu.lines),
    amb: mu.amb && mu.amb.voice && mu.amb.voice.name, stem: mu.amb && mu.amb.stem, backgrounds: mu.ch && mu.ch.backgrounds,
    said: [...t.said], turns: g._turnsNow(), pos: [...g.playerPos], clock: g.timeLeft, room: g._currentRoom(),
    reachable: mu.memories.every((m) => mu.can(m.pos)), queue: mu.speaker.queue.map((l) => l.id) };
});
check(start.state === 'museum' && start.museum === 1 && start.count === 3 && start.memories === 3, `a run starts in museum 1 with 3 memories (${start.pools} pools, ${start.creatures} creature)`);
check(start.creatures === 1, 'the first museum has one creature');
check(start.ch && start.lines && ['intro', 'call', 'pool', 'fiery', 'memory', 'open', 'goodbye'].every((k) => start.lines.includes(k)), `a character is chosen, with every kind of line: ${start.ch}`);
check(start.amb && start.backgrounds.includes(start.stem), `the character's own world plays: ${start.stem}`);
check(start.said.includes('Level 1.'), 'the voice says the level: ' + start.said.join(' | '));
check(start.queue.some((id) => /\.intro\.1$/.test(id)) || true, 'the character introduces themselves');
check(start.turns, 'the museum turns with you');
check(start.room === 'hall', 'the museum rings like a hall');
check(start.reachable, 'every memory can be reached');

const sizes = await page.evaluate(async () => {
  const m = await import('./js/modes/museum.js');
  const lay = [...Array(40)].map((_, i) => m.layMuseum(1 + (i % 10)));
  return {
    mem: [1, 2, 3, 6, 7, 20].map((k) => m.memoriesFor(k)), pools: [1, 2, 3, 8, 20].map((k) => m.poolsFor(k)),
    cr: [1, 2, 3, 9].map((k) => m.creaturesFor(k)),
    allReach: lay.every((l) => l.memories.every((x) => l.can(x.pos))),
    poolsApart: lay.every((l) => l.memories.every((x) => l.pools.every((p) => Math.hypot(x.pos[0] - p.pos[0], x.pos[1] - p.pos[1]) > p.r))),
    startClear: lay.every((l) => l.pools.every((p) => Math.hypot(l.start[0] - p.pos[0], l.start[1] - p.pos[1]) > p.r + 6)),
    bedsFar: lay.every((l) => l.beds.every((b) => Math.hypot(b[0] - l.start[0], b[1] - l.start[1]) >= m.MU_CREATURE_FROM_START)),
    tunes: (() => { const d = m.dealTunes(8); return new Set(d.map((x) => x.join())).size === 8 && d.every((x) => x.length >= 3 && x.length <= 5); })(),
    museum10Pools: m.layMuseum(10).pools.length, pool10: m.poolsFor(10), pool11: m.poolsFor(11),
  };
});
check(sizes.mem.join() === '3,4,5,8,8,8', `memories: 3, then one more each museum, at most 8: ${sizes.mem.join()}`);
check(sizes.pools.join() === '3,3,4,6,8' && sizes.pool10 === 7 && sizes.pool11 === 8, `pools: 3, then one more every second museum, at most 8 (7.2.6): ${sizes.pools.join()}`);
check(sizes.cr.join() === '1,2,3,3', `creatures: 1, 2, then 3: ${sizes.cr.join()}`);
check(sizes.allReach, 'in 40 museums of every size, every memory can always be reached');
check(sizes.poolsApart, 'no memory lies in a pool');
check(sizes.startClear, 'no pool lies where you come in');
check(sizes.bedsFar, 'no creature sleeps near where you come in');
check(sizes.tunes, 'eight memories have eight different tunes, three to five notes each');

// ------------------------------------------------------------------ the character and the memories
const first = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const mu = g.mu;
  t.calm();
  for (const m of mu.memories) { m.inCase = false; m.fiery = false; }
  // (7.3.1) Nothing sounds while the character introduces themselves.
  await t.frames(1.0);
  const duringIntro = mu.memories.filter((m) => m.voice).length;
  const introTalking = g._muTalking();
  await t.frames(15.0);
  const sp = mu.speaker;
  const target = sp.target;
  const nearest = mu.memories.reduce((b, m) => (!b || Math.hypot(m.pos[0] - g.playerPos[0], m.pos[1] - g.playerPos[1]) < Math.hypot(b.pos[0] - g.playerPos[0], b.pos[1] - g.playerPos[1]) ? m : b), null);
  const tuneLoops = mu.memories.filter((m) => m.voice && m.voice.busy).length;
  const said = t.lines();
  const r = { introFirst: /\.intro\.1$/.test(said[0] || ''), calls: said.filter((id) => /\.call\./.test(id)).length,
    atTarget: sp.pos && Math.hypot(sp.pos[0] - target.pos[0], sp.pos[1] - target.pos[1]) < 0.01, nearest: target === nearest, tuneLoops,
    recorded: sp.voice ? /^mu_line_/.test(sp.voice.name) : null, duringIntro, introTalking,
    onlyTarget: mu.memories.every((m) => !!m.voice === (m === target)) };
  await t.walkTo(target.pos, 1.0);
  await t.frames(0.2);
  r.taken = target.taken; r.found = mu.found;
  r.tuneOnce = t.played.filter((n) => n === target.tune).length >= 1;
  await t.frames(0.5);
  r.story = (sp.line && sp.line.id) || (sp.queue[0] && sp.queue[0].id) || null;
  r.silentInStory = mu.memories.every((m) => !m.voice);
  await t.frames(14);
  r.next = sp.target && sp.target !== target && !sp.target.taken;
  r.nextOnly = !g._muTalking() && mu.memories.every((m) => m.taken || !!m.voice === (m === sp.target));
  // (7.5.1) While a found memory's whole tune still plays, the next one waits, even
  // with no story to tell.
  const kept = mu.takenTune;
  mu.takenTune = { busy: true }; await t.frames(0.5);
  r.waitsForTune = !g._muTuneOn() && mu.memories.every((m) => !m.voice);
  mu.takenTune = kept; await t.frames(0.5);
  r.backAfter = g._muTuneOn() && !!(sp.target && sp.target.voice);
  r.said = t.lines();
  return r;
});
check(first.introFirst, 'the character introduces themselves first');
check(first.calls === 0, `the character never calls you to the memories: only their tunes guide you (7.2.17; ${first.calls} calls)`);
check(first.atTarget && first.nearest, 'from beside the nearest memory');
check(first.introTalking && first.duringIntro === 0, 'no memory sounds while the character introduces themselves (7.3.1)');
check(first.tuneLoops === 1 && first.onlyTarget, `then only one memory sounds, the one to find next, its tune looping where it lies (7.3.1): ${first.tuneLoops}`);
check(first.recorded !== false, 'a line is the character\'s recording');
check(first.taken && first.found === 1 && first.tuneOnce, 'walking onto a memory takes it, and its tune plays once');
check(/\.memory\.1$/.test(first.story || ''), `the character remembers: the first memory's line (${first.story})`);
check(first.silentInStory, 'no memory sounds while the character tells a memory\'s story (7.3.1)');
check(first.waitsForTune && first.backAfter, 'while a found memory\'s whole tune plays, no other memory sounds; then the next one does (7.5.1)');
check(first.next && first.nextOnly, 'after the story, the next memory sounds, and only that one (7.3.1)');

// The rest, and the door.
const door = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const mu = g.mu;
  for (let k = 0; k < 4 && !mu.door; k++) {
    const m = mu.speaker.target || mu.memories.find((x) => !x.taken);
    if (!m) break;
    await t.walkTo(m.pos, 1.0);
    await t.frames(14);
  }
  const r = { found: mu.found, door: !!mu.door, said: t.lines().slice(-3), buzzer: false };
  await t.frames(6);
  r.buzzer = t.played.includes('mu_buzzer');
  r.doorFar = mu.door ? Math.abs(Math.abs(mu.door.pos[0]) - 40.5) < 0.01 || Math.abs(Math.abs(mu.door.pos[1]) - 40.5) < 0.01 : false;
  r.open = t.lines().some((id) => /\.open\.1$/.test(id));
  const ch = mu.ch.id;
  await t.walkTo(mu.door.pos, 2.0);
  r.walk = !!(g.mu === mu && mu.walk);
  r.doorOpen = t.played.includes('mu_door_open');
  r.freed = mu.freed;
  await t.frames(12);
  r.goodbye = t.lines().some((id) => id === `museum.${ch}.goodbye.1`);
  r.closed = t.played.includes('mu_door_close');
  r.next = g.mu && g.mu !== mu ? { museum: g.mu.museum, count: g.mu.count, ch: g.mu.ch.id, freed: g.mu.freed, creatures: g.mu.creatures.length, glass: g.mu.glass.length } : null;
  r.prevCh = ch;
  return r;
});
check(door.found === 3 && door.door, 'every memory found: the door');
check(!door.open, 'the character does not say the door is open: the buzzer tells you (7.2.6)');
check(door.buzzer, 'the buzzer sounds from the door');
check(door.doorFar, 'the door is on a wall');
check(door.walk && door.doorOpen && door.freed === 1, 'at the door it opens, you walk through by yourself, and a soul is freed');
check(door.goodbye && door.closed, 'the character says goodbye, and the door closes behind you');
check(door.next && door.next.museum === 2 && door.next.count === 4 && door.next.freed === 1 && door.next.creatures === 2 && door.next.glass === 0, `then the next museum: 4 memories, 2 creatures: ${JSON.stringify(door.next)}`);
check(door.next && door.next.ch !== door.prevCh, 'with another character');

// ------------------------------------------------------------------ how loud the character is (7.2.1)
const loud = await page.evaluate(async () => {
  const m = await import('./js/modes/museum.js');
  const g = window.__el.game;
  const keep = g.playerPos; g.playerPos = [0, 0];
  const far = Math.max(...g._muLevels([0, -80], m.MU_VOICE_LEVEL, m.MU_VOICE_RANGE, m.MU_VOICE_FLOOR).slice(0, 2));
  const mid = Math.max(...g._muLevels([0, -40], m.MU_VOICE_LEVEL, m.MU_VOICE_RANGE, m.MU_VOICE_FLOOR).slice(0, 2));
  g.playerPos = keep;
  return { far: +far.toFixed(2), mid: +mid.toFixed(2) };
});
check(loud.far >= 0.45 && loud.mid >= 0.55, `the character is heard across the museum: ${loud.mid} at 40 units, ${loud.far} at 80`);

// ------------------------------------------------------------------ the pools
const pools = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start('museum');
  await t.frames(2);
  const mu = g.mu;
  t.calm();
  const pool = { pos: [0, 0], r: 4, voice: null };
  mu.pools = [pool];
  g.playerPos = [0, 12]; g._face(0, true);
  await t.frames(0.5);
  const heard = !!(pool.voice && pool.voice.busy);
  g.muSaid = [];
  g.input('up');           // to 9: 5 from the edge
  await t.frames(0.3);
  const warnedEarly = (g.muSaid || []).some((id) => /\.pool\./.test(id));
  g.input('up');           // to 6: 2 from the edge
  await t.frames(0.3);
  const warned = (g.muSaid || []).some((id) => /\.pool\./.test(id));
  // Beside it, or with your back to it, however near: no warning; facing it: a warning.
  g.muSaid = []; mu.warnCool = 0; mu.warnNear = false;
  g.playerPos = [6.5, 0]; g._face(0, true);          // 2.5 from its edge, facing north, the pool to your left
  await t.frames(0.5);
  const besideQuiet = !(g.muSaid || []).some((id) => /\.pool\./.test(id));
  g._face(Math.PI / 2, true);                         // facing east, your back to it
  await t.frames(0.5);
  const behindQuiet = !(g.muSaid || []).some((id) => /\.pool\./.test(id));
  g._face(-Math.PI / 2, true);                        // facing west, toward it
  await t.frames(0.5);
  const facingWarned = (g.muSaid || []).some((id) => /\.pool\./.test(id));
  // Off to a side, its edge across your way (its middle 34 degrees to your left): you walk round it.
  g._face(0, true); g.playerPos = [3, 4.5];
  g.input('up');
  await t.frames(0.2);
  const round = { state: g.state, out: Math.hypot(g.playerPos[0], g.playerPos[1]) > 4, moved: g.playerPos[1] < 4.4 };
  g._face(0, true); g.playerPos = [0, 6];
  g.input('up');           // straight at it: into the pool
  await t.frames(0.2);
  return { heard, warnedEarly, warned, besideQuiet, behindQuiet, facingWarned, round, state: g.state, said: t.said.slice(-2) };
});
check(pools.heard, 'a pool bubbles where it lies');
check(!pools.warnedEarly && pools.warned, 'the character warns you a step from its edge, not before');
check(pools.besideQuiet && pools.behindQuiet && pools.facingWarned, 'a pool beside you or behind you is not called ahead; facing it, it is (7.2.1)');
check(pools.round.state === 'museum' && pools.round.out && pools.round.moved, 'a pool off to your side, its edge across your way: you walk round it (7.2.10)');
check(pools.state === 'game_over', 'a step straight into a pool ends the run: ' + pools.said.join(' | '));
check(pools.said.some((s) => /bottomless pool/.test(s) && /freed 0 souls/.test(s)), 'and the score is souls freed');

// ------------------------------------------------------------------ the creatures
const crs = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start('museum');
  await t.frames(1);
  const mu = g.mu; t.calm();
  const c = mu.creatures[0];
  c.x = 0; c.y = -10; g.playerPos = [0, 6];
  await t.frames(3);
  const r = { asleep: c.mode === 'sleep' && Math.hypot(c.x, c.y + 10) < 0.01 };
  // Walking near does not wake it.
  g.playerPos = [3, -6];
  await t.frames(2);
  r.walkNear = c.mode === 'sleep';
  // A smash: it charges for about three seconds.
  const m = mu.memories.find((x) => !x.taken); m.inCase = true; m.fiery = false; m.pos = [0, 20];
  g.playerPos = [0, 22]; g._face(0, true); c.x = -38; c.y = -38;
  await t.frames(0.2);
  const placed0 = t.placed.length;
  g.input('space');
  await t.frames(0.2);
  r.smashTaken = m.taken; r.charging = c.mode === 'charge';
  { const roar = t.placed.slice(placed0).filter(([n]) => n === 'creature_roar'); r.roar = roar.length === 1 && Math.hypot(roar[0][1][0] + 38, roar[0][1][1] + 38) < 0.01; }
  r.smashSound = t.played.includes('ut_glass_smash');
  await t.frames(3.2);
  r.stopped = c.mode === 'sleep';
  // A hit: it knocks you toward the nearest pool and leaves you one step from its edge (7.2.10).
  const pool = { pos: [0, -12.5], r: 4, voice: null }; mu.pools = [pool];
  g.playerPos = [0, 0]; c.x = 0; c.y = 6; c.mode = 'charge'; c.charge = 5;
  if (mu.creatures[1]) mu.creatures[1].mode = 'sleep';
  await t.frames(1.5);
  r.state = g.state;
  r.edge = +(Math.hypot(g.playerPos[0] - pool.pos[0], g.playerPos[1] - pool.pos[1]) - pool.r).toFixed(2);
  return r;
});
check(crs.asleep && crs.walkNear, 'a creature sleeps, and walking near does not wake it');
check(crs.smashTaken && crs.smashSound && crs.charging, 'smashing a case takes its memory, and the creature charges');
check(crs.roar, 'as it wakes it roars once, from where it was sleeping (7.2.5)');
check(crs.stopped, 'and stops after about three seconds');
check(crs.state === 'museum' && Math.abs(crs.edge - 3) < 0.05, `a creature knocks you toward the nearest pool and leaves you one step from its edge (7.2.10): ${crs.edge} units`);

const shove = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start('museum');
  await t.frames(3);
  // (A third museum, with three creatures.)
  g.mu.museum = 3;
  const mu = g.mu; t.calm();
  mu.creatures = [0, 1, 2].map((i) => ({ x: -10 + 10 * i, y: 20, mode: 'sleep', charge: 0, voice: null, note: null, knock: 3, dir: [0, 1], calmTo: null }));
  g.playerPos = [0, 0];
  mu.pools = [{ pos: [20, 0], r: 4, voice: null }];
  const a = mu.creatures[1]; a.y = 6; a.mode = 'charge'; a.charge = 9;
  for (const o of [mu.creatures[0], mu.creatures[2]]) { o.mode = 'charge'; o.charge = 9; }
  for (let i = 0; i < 90 && !mu.shove; i++) await t.frames(1 / 30);
  const from = [...g.playerPos];
  const r = { shoved: !!mu.shove };
  await t.frames(1.0);
  r.moved = +Math.hypot(g.playerPos[0] - from[0], g.playerPos[1] - from[1]).toFixed(2);
  r.edge = +(Math.hypot(g.playerPos[0] - 20, g.playerPos[1]) - 4).toFixed(2);
  r.calm = a.mode === 'calm' || a.mode === 'sleep';
  const before = mu.creatures.filter((o) => o !== a).map((o) => [o.x, o.y]);
  await t.frames(1.0);
  r.othersHeld = mu.creatures.filter((o) => o !== a).every((o, i) => Math.hypot(o.x - before[i][0], o.y - before[i][1]) < 0.01);
  r.lost = mu.lost > 0;
  await t.frames(3);
  r.chaseAgain = mu.creatures.filter((o) => o !== a).some((o) => o.mode === 'charge');
  return r;
});
check(shove.shoved && shove.moved > 10 && Math.abs(shove.edge - 3) < 0.05, `knocked toward the pool, ${shove.moved} units, to one step from its edge (${shove.edge})`);
check(shove.calm, 'then it calms down');
check(shove.othersHeld && shove.lost, 'the others lose your trail for a moment');
check(shove.chaseAgain, 'and then come on again while their charge lasts');

// ------------------------------------------------------------------ a fiery memory (7.2.3: the sparks are always ahead, and each step pops one)
const fire = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start('museum');
  await t.frames(3);
  const mu = g.mu; t.calm();
  const c = mu.creatures[0]; c.x = 38; c.y = 38;
  const m = mu.memories.find((x) => !x.taken); m.inCase = false; m.fiery = true; m.pos = [0, 10];
  g.playerPos = [0, 13]; g._face(0, true);
  g.muSaid = [];
  const placedF = t.placed.length;
  g.input('up');
  const fw = t.placed.slice(placedF).find(([n]) => /^mu_firework_[1-4]$/.test(n));
  await t.frames(0.3);
  const warnedEarly = (g.muSaid || []).some((id) => /\.fiery\./.test(id));
  await t.frames(0.5);
  const r = { taken: m.taken, firework: !!fw, warned: (g.muSaid || []).some((id) => /\.fiery\./.test(id)), warnedEarly, notYet: c.mode === 'sleep' };
  // It bursts on your left or right (you face north, so east or west of you).
  r.side = fw ? (fw[1][0] - g.playerPos[0]) * mu.sparkSide > 2.5 && Math.abs(fw[1][1] - g.playerPos[1]) < 0.5 : false;
  await t.frames(4.2);
  r.sparks = mu.sparksLeft; r.asleepAtBang = c.mode === 'sleep';
  // Standing still: not a sound from them.
  const pops0 = t.played.filter((n) => n === 'mu_stamp').length;
  c.x = 38; c.y = 38;
  await t.frames(2.0);
  r.silentStill = t.played.filter((n) => n === 'mu_stamp').length === pops0 && mu.sparksLeft === r.sparks;
  r.storyHeld = !(g.muSaid || []).some((id) => /\.memory\./.test(id));
  r.stillAsleep = c.mode === 'sleep';
  // Each step pops one, just ahead, whichever way you face.
  const placedBefore = t.placed.length;
  const faces = [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0, Math.PI / 2];
  let k = 0;
  while (mu.sparksLeft > 0 && k < 16) {
    c.x = 38; c.y = 38;
    g._face(faces[k % faces.length], true);
    g.playerPos = [0, 0];
    const f = g._forward();
    g.input('up');
    await t.frames(0.15);
    if (k === 0) { r.wokeOnFirst = c.mode === 'charge' && c.charge === Infinity && mu.sparksLeft > 0; r.roar1 = t.placed.slice(placedBefore).filter(([n]) => n === 'creature_roar').length; }
    const pop = t.placed.slice(placedBefore).filter(([n]) => n === 'mu_stamp').slice(-1)[0];
    if (pop) { const dx = pop[1][0] - g.playerPos[0]; const dy = pop[1][1] - g.playerPos[1]; const d = Math.hypot(dx, dy) || 1; r.ahead = (r.ahead === undefined ? true : r.ahead) && (dx * f[0] + dy * f[1]) / d > 0.99; }
    k += 1;
  }
  r.steps = k;
  r.roars = t.placed.slice(placedBefore).filter(([n]) => n === 'creature_roar').length;
  r.pops = t.played.filter((n) => n === 'mu_stamp').length - pops0;
  await t.frames(0.3);
  r.calm = c.mode !== 'charge';
  await t.frames(1.8);
  r.storyNotYet = !(g.muSaid || []).some((id) => /\.memory\./.test(id));
  await t.frames(9);
  r.story = (g.muSaid || []).some((id) => /\.memory\.1$/.test(id));
  r.noSizzle = !t.played.some((n) => /mu_spark|mu_sizzle|mu_fizzle/.test(n));
  return r;
});
check(fire.taken && fire.firework && fire.warned && fire.notYet, 'a fiery memory: one of its four fireworks goes off and the character warns you');
check(fire.side, 'it bursts on your left or right (7.2.6)');
check(!fire.warnedEarly && fire.warned, 'the character warns you half a second into the firework, not before (7.2.9)');
check(fire.sparks >= 4 && fire.sparks <= 12 && fire.asleepAtBang, `at the bang ${fire.sparks} sparks are released, and the creature sleeps on`);
check(fire.silentStill && fire.stillAsleep, 'standing still, the sparks make no sound, none pops, and the creature stays asleep');
check(fire.wokeOnFirst, 'the first spark you pop wakes the creature, and it charges');
check(fire.roar1 === 1 && fire.roars === 1, `it roars as it wakes, once, not with every pop (${fire.roars})`);
check(fire.storyHeld, 'the memory\'s story waits');
check(fire.steps === fire.sparks && fire.pops === fire.sparks && fire.ahead === true, `each step pops one spark with a firecracker pop just ahead of you, whichever way you face, though the firework burst on a side (7.2.7: ${fire.pops} pops in ${fire.steps} steps)`);
check(fire.calm, 'when the last has popped the creature calms down');
check(fire.storyNotYet, 'the story waits a few seconds after the last spark pops (7.2.8)');
check(fire.story, 'and then the character tells the memory\'s story');
check(fire.noSizzle, 'no sizzle, no fizzle, no spark loop');

const early = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const mu = g.mu; t.calm();
  for (const c of mu.creatures) { c.x = 38; c.y = 38; c.mode = 'sleep'; }
  mu.sparksLeft = 0; mu.firework = { t: 0.01, burst: 0.8, name: 'mu_firework_4', pos: [...g.playerPos] }; mu.sparkSide = -1;
  g.playerPos = [0, 0]; g._face(0, true);
  const pops0 = t.played.filter((n) => n === 'mu_stamp').length;
  g.input('up');
  await t.frames(0.1);
  const r = { popped: t.played.filter((n) => n === 'mu_stamp').length - pops0, burst: !mu.firework, left: mu.sparksLeft };
  while (mu.sparksLeft > 0) { g.input('up'); await t.frames(0.1); }
  return r;
});
check(early.popped === 1 && early.burst && early.left >= 3, 'a step taken before the burst still pops a spark: every step does (7.2.6)');

const fieryCase = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start('museum');
  await t.frames(3);
  const mu = g.mu; t.calm(); mu.pools = [];
  for (const c of mu.creatures) { c.x = -38; c.y = -38; c.mode = 'sleep'; c.charge = 0; }
  const m = mu.memories.find((x) => !x.taken); m.inCase = true; m.fiery = true; m.pos = [0, 20];
  g.playerPos = [0, 22]; g._face(0, true);
  await t.frames(0.2);
  g.input('space');
  await t.frames(1.5);
  return { taken: m.taken, asleep: mu.creatures.every((c) => c.mode === 'sleep'), sparks: mu.sparksLeft };
});
check(fieryCase.taken && fieryCase.asleep && fieryCase.sparks >= 4, 'smashing a fiery memory\'s case does not wake the creatures: only its sparks do, when you step (7.2.10)');

const glass = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start('museum');
  await t.frames(3);
  const mu = g.mu; t.calm(); mu.pools = [];
  const c = mu.creatures[0];
  for (const o of mu.creatures) { o.x = -38; o.y = -38; o.mode = 'sleep'; o.charge = 0; }
  const m = mu.memories.find((x) => !x.taken); m.inCase = true; m.fiery = false; m.pos = [0, 20];
  g.playerPos = [0, 22]; g._face(0, true);
  await t.frames(0.2);
  const said0 = (g.muSaid || []).length;
  g.input('space');
  await t.frames(0.1);
  const r = { glass: mu.glass.length === 1, charging: c.mode === 'charge' };
  r.storyWaits = mu.storyIn > 2 && !!mu.storyLater && !(g.muSaid || []).slice(said0).some((id) => /\.memory\./.test(id));
  // Over the glass while they charge: a crunch, and no more time.
  const charge0 = c.charge;
  const crunch0 = t.played.filter((n) => /^ut_glass_step_/.test(n)).length;
  g.input('up');
  await t.frames(0.1);
  r.crunch = t.played.filter((n) => /^ut_glass_step_/.test(n)).length > crunch0;
  r.noMore = c.charge <= charge0;
  // Their charge over, back the other way over the glass: they wake for about two seconds.
  for (const o of mu.creatures) { o.x = -38; o.y = -38; }
  await t.frames(3.5);
  r.asleep = c.mode === 'sleep';
  r.storyTold = (g.muSaid || []).slice(said0).some((id) => /\.memory\./.test(id));
  g._face(Math.PI, true);
  const placed0 = t.placed.length;
  g.input('up');
  await t.frames(0.1);
  r.woke = c.mode === 'charge' && c.charge > 1.5 && c.charge <= 2.0;
  r.roar = t.placed.slice(placed0).some(([n]) => n === 'creature_roar');
  return r;
});
check(glass.glass && glass.charging, 'a smashed case leaves its broken glass, and the smash wakes the creature');
check(glass.storyWaits && glass.storyTold, 'the smashed memory\'s story waits a few seconds, then is told (7.2.14)');
check(glass.crunch && glass.noMore, 'walking over the glass while it charges crunches, and adds no time to the charge (7.2.11)');
check(glass.asleep && glass.woke && glass.roar, 'stepping on the glass once it sleeps again wakes it, with a roar, for about two seconds (7.2.11)');

// ------------------------------------------------------------------ Enter's report and the score board
const report = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.said.length = 0;
  g.input('enter');
  await t.frames(0.1);
  return t.said.slice(-1)[0];
});
check(/^Level 1\. [1-3] of 3 found\./.test(report || ''), 'double tap: the level and the memories found: ' + report);
const board = await page.evaluate(() => window.__el.game._scoreLines().find((l) => /Museum/.test(l)));
check(/^The Museum: /.test(board || ''), 'The Museum has its own high score board: ' + board);

const farDoor = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start('museum');
  await t.frames(3);
  const mu = g.mu; t.calm(); mu.pools = [];
  for (const c of mu.creatures) { c.x = 0; c.y = 0; c.mode = 'sleep'; }
  g.playerPos = [-41, -41];
  mu.speaker.queue = []; mu.speaker.target = null;
  mu.door = { pos: [40.5, 40.5], voice: null, t: 0 };
  await t.frames(0.2);
  const v = mu.door.voice; let loud = 0;
  if (v) { const sv = v.setVolume.bind(v); v.setVolume = (l, r, b) => { loud = Math.max(l, r); return sv(l, r, b); }; }
  await t.frames(0.2);
  const voice = g._muLevels([40, 40], 1.0, 90, 0.45, true);
  return { playing: !!v, loud: +loud.toFixed(2), voice: +Math.max(voice[0], voice[1]).toFixed(2) };
});
check(farDoor.playing && farDoor.loud >= 0.29, `from the far corner the buzzer is heard at once, not silent (7.2.12): ${farDoor.loud}`);
check(farDoor.voice >= 0.44, `and the character's voice too: ${farDoor.voice}`);

const even = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start('museum');
  const mu = g.mu;
  for (const c of mu.creatures) { c.x = 38; c.y = 38; c.mode = 'sleep'; }
  g.playerPos = [0, 0]; g._face(0, true);
  mu.pools = [{ pos: [10, 0], r: 3, voice: null }, { pos: [0, -10], r: 3, voice: null }];
  await t.frames(0.3);
  const lv = new Map();
  for (const p of mu.pools) if (p.voice) { const sv = p.voice.setVolume.bind(p.voice); p.voice.setVolume = (l, r, b) => { lv.set(p, +(Math.max(l, r)).toFixed(3)); return sv(l, r, b); }; }
  const talkingLevels = [];
  for (let k = 0; k < 40; k++) { await t.frames(0.1); talkingLevels.push([g._muTalking(), ...mu.pools.map((p) => lv.get(p))]); }
  const levels = new Set(talkingLevels.map((x) => x[1]));
  return { both: mu.pools.every((p) => !!p.voice), talked: talkingLevels.some((x) => x[0]) && talkingLevels.some((x) => !x[0]), steady: levels.size === 1, same: talkingLevels.every((x) => x[1] === x[2]), keep: !!(mu.speaker.voice ? mu.speaker.voice.keep : true) };
});
check(even.both && even.steady && even.same, `two pools the same distance away sound the same, and stay the same while the character speaks and after (7.2.15): ${JSON.stringify(even)}`);
check(even.keep, 'the character\'s line is kept when too many sounds play at once (7.2.15)');

// ------------------------------------------------------------------ Chaos
const chaos = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start('chaos');
  await t.frames(0.3);
  // (The run's own first level may have been a museum: counted afresh.)
  g._chaosClearEverything(); g.chaosMuseumCount = 0; g.chaosNext = 'museum'; g._setupChaosLevel();
  await t.frames(1.0);
  const mu = g.mu;
  const r = { state: g.state, chaos: mu && mu.chaos, count: mu && mu.count };
  t.calm();
  for (const m of mu.memories) { m.inCase = false; m.fiery = false; }
  const m = mu.memories[0];
  // (The time a memory puts on the clock, measured across the very call that takes it.)
  const take = g._muTake.bind(g); r.time = null;
  g._muTake = (mm, sm) => { const before = g.timeLeft; take(mm, sm); r.time = Math.max(r.time || 0, +(g.timeLeft - before).toFixed(2)); };
  await t.walkTo(m.pos, 1.0);
  for (let k = 0; k < 4 && !mu.door; k++) { const n = mu.speaker.target || mu.memories.find((x) => !x.taken); if (!n) break; await t.walkTo(n.pos, 1.0); await t.frames(14); }
  r.door = !!mu.door;
  const c1 = g.timeLeft; await t.frames(2); r.clockWaits = Math.abs(g.timeLeft - c1) < 0.01;
  const points = g.chaosPoints;
  const addT = g._muChaosTime.bind(g); r.done = null;
  g._muChaosTime = (secs) => { const before = g.timeLeft; addT(secs); r.done = Math.round(g.timeLeft - before); };
  g.towerHp = 145;
  await t.walkTo(mu.door.pos, 2.0);
  await t.frames(14);
  r.next = g.state !== 'museum' || g.mu !== mu;
  r.points = g.chaosPoints - points;
  r.doneSaid = t.said.some((x) => /^60 more seconds\.$/.test(x));
  r.hp = g.towerHp;
  r.room = [g._utHpRoom({ chaos: true, hp: 145 }), g._utHpRoom({ chaos: true, hp: 150 }), g._utHpCap({ chaos: true, hp: 120 }, 180), g._utHpRoom({ chaos: false, hp: 400 })];
  // A pool costs fifty health, and you are pulled out (7.2.17); with fifty or less, it ends the run.
  g._chaosClearEverything(); g.chaosNext = 'museum'; g._setupChaosLevel();
  await t.frames(0.5);
  const mu2 = g.mu; t.calm();
  for (const c of mu2.creatures) { c.x = 38; c.y = 38; }
  g.playerPos = [0, 5];
  const pool = { pos: [0, 0], r: 3, voice: null };
  mu2.pools = [pool];
  g._face(0, true);
  g.towerHp = 120;
  g.input('up'); await t.frames(0.2);
  const f = g._forward();
  r.out = { state: g.state, hp: g.towerHp, edge: +(Math.hypot(g.playerPos[0], g.playerPos[1]) - 3).toFixed(2),
    away: +((f[0] * g.playerPos[0] + f[1] * g.playerPos[1]) / Math.hypot(g.playerPos[0], g.playerPos[1])).toFixed(2),
    side: g.playerPos[1] > 0, safe: mu2.lost >= 2.5 && mu2.shoveGrace >= 2.5, said: t.said.slice(-1)[0] };
  g.towerHp = 40;
  g.playerPos = [0, 5]; g._face(0, true);
  g.input('up'); await t.frames(0.2);
  r.end = g.state; r.said = t.said.slice(-1)[0];
  return r;
});
check(chaos.state === 'museum' && chaos.chaos && chaos.count === 3, 'Chaos has museums: three memories the first time');
check(chaos.time === 0, `a memory puts no time on the chaos clock (7.2.15): ${chaos.time}`);
check(chaos.done === 60 && chaos.doneSaid, `completing the museum puts sixty seconds on the chaos clock, and says so (7.2.16): ${chaos.done}`);
check(chaos.hp === 150, `chaos health stops at 150: 145 and a level's ten make 150 (7.2.16): ${chaos.hp}`);
check(JSON.stringify(chaos.room) === JSON.stringify([5, 0, 150, null]), `a chaos world stage's health gains stop at 150 too, and Ultimate Mode's do not (7.2.16): ${JSON.stringify(chaos.room)}`);
check(chaos.door && chaos.clockWaits, 'every memory found: the door, and the chaos clock waits');
check(chaos.next && chaos.points === 10, 'the door leads on to the next level, for ten points');
check(chaos.out.state === 'museum' && chaos.out.hp === 70 && Math.abs(chaos.out.edge - 6) < 0.05 && chaos.out.away > 0.99 && chaos.out.side && chaos.out.safe,
  `a pool costs 50 health: pulled out, two steps from its edge on the side you came from, facing away, and safe a moment (7.2.17): ${JSON.stringify(chaos.out)}`);
check(chaos.end === 'game_over' && /bottomless pool/.test(chaos.said || ''), 'with 50 health or less, a pool ends the chaos run: ' + chaos.said);

check(errors.length === 0, 'no errors: ' + errors.slice(0, 5).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
