// Story Mode (web 7.3.0): Bella's recorded lines, the ten chapters and their tasks, the
// doors, the twist after chapter 5 (all three practice areas), the end of the story,
// and the chapter list after it.
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/story.mjs http://localhost:8765
// It cannot hear: it checks what plays, where, and what the game does. Bella's lines are
// cut short here (t.skip) so the walk through the story does not take its full length.

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORY_LINES } from '../js/storymode-lines.js';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

// ------------------------------------------------------------------ the recordings (read from the files)
{
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = JSON.parse(readFileSync(join(root, 'packs', 'manifest.json'), 'utf8'));
  const p = manifest.packs['story-voice'];
  const buf = readFileSync(join(root, 'packs', p.file));
  const n = buf.readUInt32LE(8);
  const head = JSON.parse(buf.slice(12, 12 + n).toString('utf8'));
  const ids = Object.keys(STORY_LINES);
  const names = new Set(head.entries.map((e) => e.name));
  check(buf.length === p.bytes && head.pack === 'story-voice' && head.entries.length === ids.length && ids.every((id) => names.has('vc_' + id)),
    `every one of Story Mode's ${ids.length} lines has its recording in the story-voice pack, and no more`);
  check(head.entries.every((e) => e.kind === 'voice' && buf.slice(12 + n + e.offset, 12 + n + e.offset + 4).toString() === 'OggS'), 'all of them Ogg recordings of kind voice');
  const want = [];
  for (let c = 1; c <= 22; c++) want.push(`story.${c}.story`, `story.${c}.task`, `story.${c}.done`);
  want.push('story.2.task2', 'story.5.task2');
  want.push('story.23.story', 'story.23.end', 'story.twist.twist', 'story.twist.back');
  for (const k of ['battle', 'guardian', 'abyss']) want.push(`story.twist.${k}`, `story.twist.${k}.done`);
  for (let c = 1; c <= 5; c++) want.push(`story.14.call.${c}`);
  check(want.every((id) => STORY_LINES[id]) && want.length === ids.length, `the lines (7.5.0): a story, a task and a done line for chapters 1 to 22, second tasks for chapters 2 and 5, chapter 23's story and end, the twist, its three areas, and Bella's five calls: ${ids.length}`);
  check(/headphones/.test(STORY_LINES['story.1.story']) && !/Gemini|Claude/.test(Object.values(STORY_LINES).join(' ')), 'the story is how the game works, not how it was made: chapter 1 is about headphones, and no line names Gemini or Claude');
}

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/api\.github|ERR_FAILED|CORS/.test(m.text())) errors.push(m.text()); });
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 180000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio;
  const t = window.__t = { said: [], played: [], placed: [] };
  const step = g.frame.bind(g); g.frame = () => {}; g._f = step;
  const play = a.play.bind(a);
  a.play = (name, opts) => { t.played.push(name); if (opts && opts.at) t.placed.push([name, [...opts.at]]); return play(name, opts); };
  const speak = g.tts.speak.bind(g.tts);
  g.tts.speak = (text, o) => { if (text) t.said.push(text); return speak(text, o); };
  t.frames = async (seconds, dt = 1 / 30) => { const t0 = performance.now(); for (let i = 0; i < Math.round(seconds / dt); i++) { g._f(dt); const ahead = t0 + (i + 1) * dt * 1000 - performance.now(); await new Promise((r) => setTimeout(r, Math.max(0, ahead))); } };
  // Bella's lines, by id, as she says them.
  t.lines = [];
  const say = g._smSay.bind(g);
  g._smSay = (item) => { const r = say(item); if (r) t.lines.push([item.ln.id, item.pos ? [...item.pos] : null]); return r; };
  // Every line waiting heard out at once (each one's `after` runs).
  t.skip = async () => {
    for (let i = 0; i < 80; i++) {
      const s = g.sm && g.sm.say;
      if (!s || (!s.queue.length && !s.line && !(s.voice && s.voice.busy))) return;
      if (s.voice) { s.voice.stop(); }
      s.until = 0;
      await t.frames(0.1);
    }
  };
  t.face = (pos) => { const dx = pos[0] - g.playerPos[0]; const dy = pos[1] - g.playerPos[1]; g._turnStop(); g._face(Math.atan2(dx, -dy), true); };
  t.walkTo = async (pos, near = 1.6) => {
    const where = () => (g.sm ? `${g.sm.chapter}|${g.sm.twist ? g.sm.twist.kind : ''}` : '');
    const sm0 = g.sm; const w0 = where();
    for (let i = 0; i < 200; i++) {
      if (Math.hypot(pos[0] - g.playerPos[0], pos[1] - g.playerPos[1]) < Math.max(near, 1.6)) return true;
      t.face(pos); g.input('up'); await t.frames(0.05);
      if (g.sm !== sm0 || where() !== w0 || g.state !== 'story') return true;
    }
    return false;
  };
  t.doorAways = [];
  t.through = async () => {
    const n0 = g.sm.chapter; const t0 = g.sm.twist;
    await t.skip();
    // (A room whose goal is its door: you are there already, and through it once she has spoken.)
    if (!g.sm || g.sm.chapter !== n0 || g.sm.twist !== t0) return g.sm ? true : g.state === 'menu';
    t.doorAway = g.sm.door ? Math.hypot(g.sm.door.pos[0] - g.playerPos[0], g.sm.door.pos[1] - g.playerPos[1]) : null;
    t.doorAways.push([n0, t.doorAway]);
    if (!g.sm.door) throw new Error('no door: chapter ' + g.sm.chapter + ', ' + g.sm.phase + ', ' + JSON.stringify(g.playerPos));
    await t.walkTo(g.sm.door.pos, 1.0);
    await t.frames(0.2);
    return g.sm ? g.sm.chapter !== n0 || g.sm.twist !== t0 : g.state === 'menu';
  };
});

// ------------------------------------------------------------------ the menu and the basics
await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  // Bella's lines heard out until the task is given.
  t.toTask = async () => { for (let i = 0; i < 10 && g.sm && g.sm.phase === 'story'; i++) await t.skip(); await t.frames(0.1); return g.sm && g.sm.phase; };
  t.path = async (points) => { for (const p of points) await t.walkTo(p, 1.0); };
  t.ch = () => g.sm && g.sm.chapter;
});
const menu = await page.evaluate(() => window.__el.game.menuKeys);
check(menu[0] === 'story' && menu[1] === 'standard' && menu.indexOf('ultimate') === menu.indexOf('museum') + 1, 'Story Mode is first on the main menu, above Standard Mode (7.5.0): ' + menu.join(', '));
const firstHelp = await page.evaluate(() => window.__el.game.helpList.map(([n]) => n).slice(0, 3).join(', '));
check(firstHelp === 'General, Story Mode, Standard Mode' || /^General, Story Mode, /.test(firstHelp), 'and its Help section comes first, after General: ' + firstHelp);
const basics = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const out = {};
  // 7.4.0: the old story's progress does not count; everyone walks the new one first.
  g.scores.settings.storyDone = true; g.scores.settings.storyDone2 = false;
  g.menuIndex = g.menuKeys.indexOf('story'); g.input('enter'); await t.frames(0.5);
  out.start = [g.state, t.ch(), t.lines[0] && t.lines[0][0], t.played.includes('sm_line')];
  // 1. The bell: quiet while Bella speaks.
  out.bellQuiet = !g.sm.room.bell.voice && !!g.sm.bg;
  t.face(g.sm.room.bell.pos); await t.frames(1.0); out.early = g.sm.phase;
  out.task1 = await t.toTask();
  out.bellOn = !!(g.sm.room.bell.voice && g.sm.room.bell.voice.busy);
  g._turnStop(); g._face(g.tn.face + Math.PI / 2, true); await t.frames(1.0); out.off = g.sm.phase;
  t.face(g.sm.room.bell.pos); await t.frames(0.8);
  out.c1 = g.sm.phase; out.chime = t.played.includes('evt_chime_clear');
  out.doorBefore = !!(g.sm.door && g.sm.door.open);
  out.to2 = await t.through() && t.ch() === 2;
  // 2. Turning: not facing north; land on north.
  out.notNorth = Math.abs(Math.sin(g.tn.face / 2)) > 0.1;
  await t.toTask();
  for (let i = 0; i < 12 && Math.abs(Math.sin(g.tn.face / 2)) > 0.01; i++) { g.input('right'); await t.frames(0.5); }
  await t.frames(0.5);
  out.north = t.played.includes('ut_tick_north');
  out.part2 = g.sm.room.step === 1 && t.lines.some((l) => l[0] === 'story.2.task2');
  await t.skip(); await t.frames(0.1);
  // Then the held slide, all the way round; quick turns do not count toward it.
  g.input('right'); await t.frames(0.5); g.input('left'); await t.frames(0.5);
  out.flicksNot = g.sm.phase === 'task' && Math.abs(g.sm.room.turned) < 0.01;
  g.input('turn_right_start');
  for (let i = 0; i < 120 && Math.abs(g.sm.room.turned) < 2 * Math.PI - 0.3; i++) await t.frames(0.1);
  out.stillHeld = g.sm.phase;
  g.input('turn_end'); await t.frames(0.5);
  out.c2 = g.sm.phase;
  out.to3 = await t.through() && t.ch() === 3;
  // 3. In front and behind.
  await t.toTask();
  const room = g.sm.room;
  for (let i = 0; i < 40; i++) { t.face(room.circler.pos); await t.frames(0.05); }
  out.frontFirst = g.sm.phase;
  for (let i = 0; i < 40; i++) { const p = room.circler.pos; t.face([2 * g.playerPos[0] - p[0], 2 * g.playerPos[1] - p[1]]); await t.frames(0.05); }
  for (let i = 0; i < 30 && g.sm.phase === 'task'; i++) { t.face(room.circler.pos); await t.frames(0.05); }
  out.c3 = g.sm.phase;
  out.to4 = await t.through() && t.ch() === 4;
  // 4. The fountain: the courtyard's own air, flowing as you arrive (7.5.1).
  out.fountainAtOnce = !!(g.sm.room.fountain && g.sm.room.fountain.voice && g.sm.phase === 'story');
  await t.toTask();
  const f = g.sm.room.fountain;
  const far = Math.max(...g._smLevels(f.pos, f.gain, f.range, f.floor).slice(0, 2));
  await t.walkTo(f.pos, 4.5); await t.frames(0.1);
  out.louder = Math.max(...g._smLevels(f.pos, f.gain, f.range, f.floor).slice(0, 2)) > 3 * far;
  out.c4 = g.sm.phase;
  out.to5 = await t.through() && t.ch() === 5;
  // 5. Running, then walking backwards.
  await t.toTask();
  out.bellOn5 = !!(g.sm.room.bell && g.sm.room.bell.voice);
  g._turnStop(); g._face(0, true);
  g.input('up'); g.input('up'); await t.frames(0.1);
  out.stepsNot = g.sm.room.runs === 0;
  g.input('run_start');
  for (let i = 0; i < 60 && g.sm.room.step === 0; i++) await t.frames(0.1);
  g.input('stride_end');
  out.ran = g.sm.room.step >= 1 && g.sm.room.runs >= 2;
  await t.skip(); await t.frames(0.1);
  const y0 = g.playerPos[1];
  g.input('back_start');
  for (let i = 0; i < 80 && g.sm.phase === 'task'; i++) await t.frames(0.1);
  g.input('stride_end');
  out.backed = g.playerPos[1] > y0 + 6 && Math.abs(Math.sin(g.tn.face / 2)) < 0.01;
  out.c5 = g.sm.phase;
  out.to6 = await t.through() && t.ch() === 6;
  // 6. The corridor: a knock from a wall; then along it to its end.
  await t.toTask();
  g._turnStop(); g._face(Math.PI / 2, true); t.played.length = 0; g.input('up');
  out.knock = t.played.includes('wall') && g.playerPos[0] === 0;
  await t.path([[0, -15], [15, -15]]); await t.frames(0.1);
  out.c6c = g.sm.phase;
  out.to7c = await t.through() && t.ch() === 7;
  // 7. Echo.
  await t.toTask();
  out.small = g._currentRoom();
  g._turnStop(); g._face(0, true);
  for (let i = 0; i < 2; i++) { g.input('up'); await t.frames(0.05); }
  out.hall = g._currentRoom();
  for (let i = 0; i < 3; i++) { g.input('up'); await t.frames(0.05); }
  out.c7e = g.sm.phase;
  out.to8 = await t.through() && t.ch() === 8;
  // 8. The report.
  await t.toTask();
  await t.frames(1.0); out.wait7 = g.sm.phase;
  g.input('enter'); out.report = t.said[t.said.length - 1];
  await t.frames(1.0); out.during = g.sm.phase;
  await t.frames(4.0); out.c8r = g.sm.phase;
  out.to9 = await t.through() && t.ch() === 9;
  return out;
});
check(basics.start[0] === 'story' && basics.start[1] === 1 && basics.start[2] === 'story.1.story' && basics.start[3], 'the old story walked does not count (7.4.0): Story Mode begins at chapter 1, with Bella\'s recording');
check(basics.bellQuiet && basics.early === 'story' && basics.task1 === 'task' && basics.bellOn, 'chapter 1: only the background while Bella speaks; the bell starts, and counts, once she has given the task');
check(basics.off === 'task' && basics.c1 === 'done' && basics.chime && !basics.doorBefore && basics.to2, 'chapter 1: the bell centred is the task done; the door opens after her done line');
check(basics.notNorth && basics.north && basics.part2, 'chapter 2: you begin facing away from north; flicking to the higher tick of north is the first part, and Bella gives the second');
check(basics.flicksNot && basics.stillHeld === 'task' && basics.c2 === 'done' && basics.to3, 'chapter 2: a held slide all the way round, and the finger lifted, is the task done (flicks do not count for it)');
check(basics.frontFirst === 'task' && basics.c3 === 'done' && basics.to4, 'chapter 3: behind you first, then in front');
check(basics.fountainAtOnce, 'chapter 4: the fountain flows from the moment you arrive, while Bella talks (7.5.1)');
check(basics.louder && basics.c4 === 'done' && basics.to5, 'chapter 4: the fountain grows as you walk to it');
check(basics.bellOn5 && basics.stepsNot && basics.ran && basics.backed && basics.c5 === 'done' && basics.to6, 'chapter 5: single steps are not running; a held slide up runs toward the bell, and a held slide down walks backwards, still facing it');
check(basics.knock && basics.c6c === 'done' && basics.to7c, 'chapter 6: a wall knocks and stops you; the corridor walked to its chime is the task done');
check(basics.small === 'lab' && basics.hall === 'cathedral' && basics.c7e === 'done' && basics.to8, 'chapter 7: a small room\'s echo, then a cathedral\'s');
check(basics.wait7 === 'task' && /Chapter 8 of 23, The report/.test(basics.report || '') && basics.during === 'task' && basics.c8r === 'done' && basics.to9, 'chapter 8: a double tap gives the report, and once it has been heard the task is done: ' + basics.report);

// ------------------------------------------------------------------ the modes, 8 to 10
const modes = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const out = {};
  // 8. Standard Mode: a tiny labyrinth and the exit's beep.
  await t.toTask();
  await t.frames(1.5);
  out.beeps = t.played.filter((n) => /^prox_/.test(n)).length;
  const p0 = t.played.filter((n) => /^prox_/.test(n)).slice(-1)[0];
  await t.path([[0, -12], [12, -12], [12, -18]]); await t.frames(1.5);
  out.higher = Math.max(...t.played.filter((n) => /^prox_/.test(n)).map((n) => Number(n.slice(5)))) > Number((p0 || 'prox_0').slice(5));
  await t.path([[12, -24]]); await t.frames(0.1);
  out.c8 = g.sm.phase;
  out.to10 = await t.through() && t.ch() === 10;
  // 10. Battle Mode.
  await t.toTask();
  const tg = [...g.sm.room.targets];
  out.three = tg.length === 3;
  t.played.length = 0;
  for (const s of tg) { t.face(s.pos); g.input('space'); await t.frames(0.05); }
  await t.frames(0.6);
  out.hits = t.played.filter((n) => n === 'explosion').length;
  out.explodedThere = tg.every((s) => t.placed.some((p) => p[0] === 'explosion' && Math.hypot(p[1][0] - s.pos[0], p[1][1] - s.pos[1]) < 0.01));
  out.c10b = g.sm.phase;
  out.to11 = await t.through() && t.ch() === 11;
  // 11. Driving: your engine from the moment you arrive (7.5.1); north ahead, lanes;
  // the car waits in your lane until you move.
  await t.frames(0.3);
  out.engineAtOnce = g.sm.phase === 'story' && t.played.includes('engine_8') && !!(g.sm.room.engine && g.sm.room.engine.busy);
  out.carQuiet = !g.sm.room.carSound.voice;
  await t.toTask();
  out.noTurn = !g._turnsNow();
  out.engine = t.played.includes('engine_8');
  await t.frames(5.0);
  out.waits = Math.abs(g.sm.room.car.pos[1] + 8) < 0.5 && g.sm.phase === 'task';
  g.input('left');
  out.lane = g.sm.room.lane === 0 && g.playerPos[0] === -4;
  g.input('left'); out.edge = t.played.includes('boundary');
  await t.frames(2.0);
  out.c10 = g.sm.phase;
  await t.skip(); out.walkAgain = g._turnsNow();
  return out;
});
check(modes.beeps >= 2 && modes.higher && modes.c8 === 'done' && modes.to10, `chapter 9: the exit beeps from where it is, higher as you close in; reached, the task is done (${modes.beeps} beeps)`);
check(modes.three && modes.hits === 3 && modes.explodedThere && modes.c10b === 'done' && modes.to11, 'chapter 10: (7.5.1) each one goes down with Battle Mode\'s explosion, from where it stood; three enemies standing still, shot down');
check(modes.engineAtOnce && modes.carQuiet, 'chapter 11: your engine runs from the moment you arrive, while Bella talks; the car comes only after (7.5.1)');
check(modes.noTurn && modes.engine && modes.waits && modes.lane && modes.edge && modes.c10 === 'done' && modes.walkAgain, 'chapter 11: north ahead and your engine; the car waits in your lane; a change of lane lets it pass (and the road has edges); then on foot again');

// ------------------------------------------------------------------ the twist
const tw = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const out = {};
  out.through = await t.through();
  out.twist = g.sm.twist && g.sm.twist.kind;
  await t.frames(0.3);
  out.line = t.lines[t.lines.length - 1][0];
  out.thunderFirst = t.played.some((n) => /^ab_thunder_/.test(n));
  const s = g.sm.say; if (s.voice) s.voice.stop(); s.until = 0;
  await t.frames(0.3);
  out.thunder = t.played.some((n) => /^ab_thunder_/.test(n));
  out.areaWaits = !t.lines.some((l) => l[0] === `story.twist.${out.twist}`);
  for (let i = 0; i < 80 && !t.lines.some((l) => l[0] === `story.twist.${out.twist}`); i++) await t.frames(0.1);
  out.areaLine = t.lines.some((l) => l[0] === `story.twist.${out.twist}`);
  out.targetsQuiet = g.sm.twist.targets.every((x) => !x.voice);
  for (const kind of ['battle', 'guardian', 'abyss']) {
    g._smTwist(kind);
    await t.skip();
    for (let i = 0; i < 80 && !g.sm.twist.targets.length; i++) await t.frames(0.1);
    await t.skip();
    const r = out[kind] = { phase: g.sm.phase, targets: g.sm.twist.targets.length };
    const tg = g.sm.twist.targets;
    if (kind === 'abyss') {
      g._turnStop(); g._face(Math.atan2(tg[0].pos[0], -tg[0].pos[1]) + Math.PI, true);
      t.played.length = 0; g.input('space'); r.farClick = t.played.includes('empty_click');
      await t.walkTo(tg[0].pos, 3.0); r.glass = t.played.some((n) => /glass_step/.test(n));
      t.face(tg[0].pos); g.input('space'); r.smash = t.played.includes('ut_glass_smash');
    } else {
      const shots = kind === 'guardian' ? 3 : 1;
      t.played.length = 0;
      for (const x of [...tg]) { t.face(x.pos); for (let k = 0; k < shots; k++) { g.input('space'); await t.frames(0.05); } }
      await t.frames(0.6);
      r.hits = t.played.filter((n) => n === (kind === 'guardian' ? 'guardian_hit' : 'explosion')).length;
      r.down = t.played.includes('guardian_down');
      g.sm.say.queue = [];
    }
    r.done = g.sm.phase;
  }
  await t.skip(); await t.frames(0.2);
  out.back = t.ch(); out.noTwist = !g.sm.twist;
  return out;
});
check(tw.through && tw.line === 'story.twist.twist' && !tw.thunderFirst && tw.thunder && tw.areaWaits && tw.areaLine && tw.targetsQuiet, `after chapter 11's door (Driving), the twist (${tw.twist}): Bella's line first, then the thunder, then the area, its targets sounding only after her line`);
check(tw.battle.targets === 3 && tw.battle.hits === 3 && tw.battle.done === 'done', 'the battle area: three enemies standing still, shot down');
check(tw.guardian.targets === 1 && tw.guardian.hits === 2 && tw.guardian.down && tw.guardian.done === 'done', 'the island guardian: three centred shots');
check(tw.abyss.farClick && tw.abyss.glass && tw.abyss.smash && tw.abyss.done === 'done', 'the abyss: glass underfoot, the case smashed only within reach');
check(tw.back === 12 && tw.noTwist, 'then back into the story: chapter 12');

// ------------------------------------------------------------------ chapters 11 to 20
const late = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const out = {};
  const goal = async (pos, near) => { await t.toTask(); await t.walkTo(pos(), near); await t.frames(0.2); return g.sm.phase; };
  out.c11 = await goal(() => g.sm.room.goal, 1.0); out.stairs = t.played.includes('stairs_beacon');
  out.to12 = await t.through() && t.ch() === 13;
  await t.toTask(); await t.frames(2.0); out.ding = t.placed.some((p) => p[0] === 'elevator_ding');
  await t.walkTo(g.sm.room.goal, 1.0); await t.frames(0.2); out.c12 = g.sm.phase; out.sand = t.played.some((n) => /step_sand/.test(n));
  out.to13 = await t.through() && t.ch() === 14;
  await t.toTask(); await t.frames(3.5);
  const bella = g.sm.room.bella;
  const calls = t.lines.filter((l) => /story\.14\.call/.test(l[0]));
  out.calls = calls.length > 0 && calls.every((l) => l[1] && Math.hypot(l[1][0] - bella[0], l[1][1] - bella[1]) < 0.01);
  g.sm.say.queue = []; if (g.sm.say.voice) g.sm.say.voice.stop(); g.sm.say.until = 0;
  await t.walkTo(bella, 4.0); await t.frames(0.1); out.c13 = g.sm.phase;
  out.to14 = await t.through() && t.ch() === 15;
  out.door14Quiet = !!(g.sm.door && !g.sm.door.voice);
  await t.toTask(); await t.frames(0.1); out.door14On = !!(g.sm.door && g.sm.door.voice);
  await t.walkTo(g.sm.door.pos, 1.0); await t.frames(0.1); out.c14 = g.sm.phase;
  await t.skip(); await t.frames(0.2); out.to15 = t.ch() === 16;
  await t.toTask(); await t.frames(2.0); out.board = t.placed.some((p) => p[0] === 'wp_board');
  t.played.length = 0;
  await t.walkTo(g.sm.room.board, 4.0); await t.frames(0.1); out.c15 = g.sm.phase;
  out.dryFeet = t.played.some((n) => /^step_stone_/.test(n)) && !t.played.some((n) => /water_step/.test(n));
  out.to16 = await t.through() && t.ch() === 17;
  await t.toTask();
  await t.walkTo(g.sm.room.memory, 3.0); await t.frames(0.1); out.tune = g.sm.phase;
  await t.frames(3.5);
  const c = g.sm.room.targets[0];
  out.case = !!c && g.sm.phase === 'task';
  await t.walkTo(c.pos, 3.0); t.face(c.pos); await t.frames(0.1); g.input('space');
  out.smash = t.played.includes('ut_glass_smash'); out.c16 = g.sm.phase;
  out.to17 = await t.through() && t.ch() === 18;
  await t.toTask();
  const r = g.sm.room;
  out.aOnly = r.vb && r.vb.r < 0.01 && r.va.r > 0.1;
  g._turnStop(); g._face(0, true);
  for (let i = 0; i < 8 && g.sm.phase === 'task'; i++) { g.input('up'); await t.frames(0.1); }
  out.bNow = r.vb && r.vb.r > r.va.r;
  out.c17 = g.sm.phase;
  out.toCompass = await t.through() && t.ch() === 19;
  // 19. The compass: the safe zone is silent; the compass on (a held finger), its beep
  // from the goal, higher facing it; followed there.
  await t.toTask();
  const cr = g.sm.room;
  t.played.length = 0; await t.frames(1.0);
  out.silent = !t.played.some((n) => /^ut_compass_/.test(n));
  g._turnStop(); g._face(Math.atan2(cr.goal[0], -cr.goal[1]) + Math.PI, true);
  g.input('hold'); await t.frames(1.0);
  out.on = cr.on && /Compass on\. Safe zone, \d+ steps\./.test(t.said.join(' | '));
  const away = t.played.filter((n) => /^ut_compass_/.test(n)).map((n) => Number(n.slice(11)));
  t.face(cr.goal); t.played.length = 0; await t.frames(1.0);
  const toward = t.played.filter((n) => /^ut_compass_/.test(n)).map((n) => Number(n.slice(11)));
  out.pitch = away.length > 0 && toward.length > 0 && Math.max(...toward) > Math.max(...away);
  await t.walkTo(cr.goal, 1.0); await t.frames(3.0);
  out.arrived = t.said.some((x) => /You are in the safe zone\. Compass off\./.test(x));
  out.c19 = g.sm.phase;
  out.toHazel = await t.through() && t.ch() === 20;
  // 20. Mother Hazel: she greets from where she stands; met, her story, her gift.
  await t.toTask(); await t.frames(4.0);
  const hz = g.sm.room.hazel;
  const greets = t.lines.filter((l) => /^witch\.greet\./.test(l[0]));
  out.greets = greets.length > 0 && greets.every((l) => l[1] && Math.hypot(l[1][0] - hz[0], l[1][1] - hz[1]) < 0.01);
  out.herVoice = t.played.includes('sm_line');
  g.sm.say.queue = []; if (g.sm.say.voice) g.sm.say.voice.stop(); g.sm.say.until = 0;
  await t.walkTo(hz, 3.0); await t.frames(0.2);
  await t.skip(); await t.frames(0.3);
  out.hazelLines = t.lines.map((l) => l[0]).filter((x) => /^witch\.(story|gift)/.test(x)).join();
  out.gift = t.played.includes('potion_drink');
  out.c20 = g.sm.phase;
  out.to21 = await t.through() && t.ch() === 21;
  out.chaosExit = !!g.sm.room.exit && !g.sm.door;
  out.c18 = await goal(() => g.sm.room.exit, 1.0);
  out.exitQuiet = !g.sm.room.exitSound;
  out.to19 = await t.through() && t.ch() === 22;
  // 22. Events: north ahead; each swipe a step that way.
  await t.toTask();
  out.noTurn19 = !g._turnsNow();
  const x0 = g.playerPos[0]; g.input('right'); out.east = g.playerPos[0] === x0 + 3;
  for (let k = 0; k < 3 && g.sm.phase === 'task'; k++) {
    for (let i = 0; i < 30; i++) {
      const it = g.sm.room.item; if (!it) break;
      const dx = it.pos[0] - g.playerPos[0]; const dy = it.pos[1] - g.playerPos[1];
      if (Math.hypot(dx, dy) < 0.5) break;
      g.input(Math.abs(dx) > 0.5 ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      await t.frames(0.05);
    }
    await t.frames(0.1);
  }
  out.picked = t.played.filter((n) => n === 'event_pickup_bell').length;
  out.c19e = g.sm.phase;
  await t.skip();
  for (let i = 0; i < 40 && t.ch() === 22; i++) {
    const d = g.sm.door.pos; const dx = d[0] - g.playerPos[0]; const dy = d[1] - g.playerPos[1];
    g.input(Math.abs(dx) > 1.6 ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    await t.frames(0.1);
  }
  out.to20 = t.ch() === 23;
  out.before = !!(g.sm.door && g.sm.door.open);
  await t.skip();
  out.lines20 = t.lines.slice(-2).map((l) => l[0]).join();
  await t.walkTo(g.sm.door.pos, 1.0); await t.frames(0.2);
  out.menu = g.state; out.done2 = g.scores.settings.storyDone2;
  out.finished = t.said.some((x) => /Story Mode finished/.test(x));
  return out;
});
check(late.c11 === 'done' && late.stairs && late.to12, 'chapter 12: the stairs beacon, walked to');
check(late.ding && late.c12 === 'done' && late.sand && late.to13, 'chapter 13: the elevator\'s hum and chime, on sand, walked to');
check(late.calls && late.c13 === 'done' && late.to14, 'chapter 14: Bella calls from where she stands; reaching her is the task');
check(late.door14Quiet && late.door14On && late.c14 === 'done' && late.to15, 'chapter 15: the door, the goal, sounds only once Bella has given the task');
check(late.dryFeet, 'chapter 16: the park\'s ordinary footsteps, not wading (7.5.1)');
check(late.board && late.c15 === 'done' && late.to16, 'chapter 16: the diving board among the park\'s sounds');
check(late.tune === 'tune' && late.case && late.smash && late.c16 === 'done' && late.to17, 'chapter 17: the memory\'s tune, then a glass case to smash');
check(late.aOnly && late.bNow && late.c17 === 'done' && late.toCompass, 'chapter 18: one place\'s background gives way to the next across the border');
check(late.silent && late.on && late.pitch && late.arrived && late.c19 === 'done' && late.toHazel, 'chapter 19: the safe zone is silent; a held finger turns the compass on, it names the goal and how far, beeps higher facing it, and says when you arrive');
check(late.greets && late.herVoice && late.hazelLines === 'witch.story.001,witch.gift.001' && late.gift && late.c20 === 'done' && late.to21, 'chapter 20: Mother Hazel greets from where she stands, in her own recorded voice; beside her, her story and her gift');
check(late.chaosExit && late.c18 === 'done' && late.exitQuiet && late.to19, 'chapter 21: the exit\'s Morse signal, reached; it falls silent, and the door opens elsewhere (7.5.1)');
check(late.noTurn19 && late.east && late.picked === 3 && late.c19e === 'done' && late.to20, 'chapter 22: north ahead, a step each way, three chimes collected');
check(!late.before && late.lines20 === 'story.23.story,story.23.end' && late.menu === 'menu' && late.done2 && late.finished, 'chapter 23: no task; the last door leads back to the menu, the story marked as walked');

// ------------------------------------------------------------------ the chapter list
const list = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const out = {};
  g.menuIndex = g.menuKeys.indexOf('story'); g.input('enter');
  out.state = g.state; out.first = t.said[t.said.length - 1];
  g.input('up'); out.back = t.said[t.said.length - 1];
  g.input('up'); out.twenty = t.said[t.said.length - 1];
  for (let i = 0; i < 6; i++) g.input('up');
  out.fourteen = t.said[t.said.length - 1];
  g.input('enter'); await t.frames(0.3);
  out.started = g.state; out.chapter = t.ch(); out.twistDone = g.sm.twistDone;
  g.input('enter'); out.report = t.said[t.said.length - 1];
  g.input('back'); out.quit = g.state;
  g.input('down'); g.input('enter'); await t.frames(0.1);
  out.menu = g.state;
  g.menuIndex = g.menuKeys.indexOf('story'); g.input('enter');
  for (let i = 0; i < 8; i++) g.input('down');
  g.input('enter'); await t.frames(0.2);
  out.nine = t.ch(); out.nineTwist = !g.sm.twistDone;
  g._stopRunSounds(); g.runId += 1; g._toMenu();
  return out;
});
const aways = await page.evaluate(() => window.__t.doorAways);
const near = aways.filter(([n, d]) => n !== 15 && d !== null && d < 11.9);
check(aways.length >= 20 && near.length === 0, `every door opens at least four steps from where you stand (7.5.1), but the Abyss's, which is the goal: ${near.map(([n, d]) => `chapter ${n} ${d.toFixed(1)}`).join(', ') || 'none nearer'}`);
check(list.state === 'story_menu' && /Choose a chapter\. Chapter 1, Welcome/.test(list.first) && list.back === 'Back to the main menu' && list.twenty === 'Chapter 23, Help and settings', 'once walked, Story Mode opens with the list of twenty-three chapters: ' + list.first);
check(list.fourteen === 'Chapter 17, The Museum' && list.started === 'story' && list.chapter === 17 && list.twistDone, 'a chapter chosen from the list begins there (past chapter 11, no twist)');
check(/Chapter 17 of 23, The Museum/.test(list.report || ''), 'double tap: the chapter: ' + list.report);
check(list.quit === 'confirm_exit' && list.menu === 'menu', 'Escape asks before leaving, as in every mode');
check(list.nine === 9 && list.nineTwist, 'from chapter 9, the twist still comes after chapter 11');

check(errors.length === 0, 'no errors: ' + errors.slice(0, 5).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
