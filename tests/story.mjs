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
  for (let c = 1; c <= 9; c++) want.push(`story.${c}.story`, `story.${c}.task`, `story.${c}.done`);
  want.push('story.10.story', 'story.10.end', 'story.twist.twist', 'story.twist.back');
  for (const k of ['battle', 'guardian', 'abyss']) want.push(`story.twist.${k}`, `story.twist.${k}.done`);
  for (let c = 1; c <= 5; c++) want.push(`story.6.call.${c}`);
  check(want.every((id) => STORY_LINES[id]) && want.length === ids.length, 'the lines: a story, a task and a done line for chapters 1 to 9, chapter 10\'s story and end, the twist, its three areas, and Bella\'s five calls');
  check(/twenty|2026/.test(STORY_LINES['story.1.story']) && /Gemini/.test(STORY_LINES['story.1.story']), 'chapter 1 names the summer of 2026 and Gemini');
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
  t.through = async () => {
    const n0 = g.sm.chapter; const t0 = g.sm.twist;
    await t.skip();
    if (!g.sm.door) throw new Error('no door: chapter ' + g.sm.chapter + ', ' + g.sm.phase + ', ' + JSON.stringify(g.playerPos));
    await t.walkTo(g.sm.door.pos, 1.0);
    await t.frames(0.2);
    return g.sm ? g.sm.chapter !== n0 || g.sm.twist !== t0 : g.state === 'menu';
  };
});

// ------------------------------------------------------------------ the menu and chapter 1
const menu = await page.evaluate(() => window.__el.game.menuKeys);
check(menu.indexOf('story') === menu.indexOf('museum') + 1 && menu.indexOf('story') < menu.indexOf('ultimate'), 'Story Mode is on the main menu after The Museum: ' + menu.join(', '));
const c1 = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  g.scores.settings.storyDone = false;
  g.menuIndex = g.menuKeys.indexOf('story'); g.input('enter'); await t.frames(0.5);
  const out = { state: g.state, chapter: g.sm.chapter, first: t.lines[0] && t.lines[0][0], recorded: t.played.includes('sm_line'), phase: g.sm.phase, bell: !!g.sm.room.bell,
    bellQuiet: !g.sm.room.bell.voice, bgOn: !!g.sm.bg };
  // Turning before the task has been given does not count.
  t.face(g.sm.room.bell.pos); await t.frames(1.0);
  out.early = g.sm.phase;
  await t.skip();
  out.lines = t.lines.map((l) => l[0]);
  out.task = g.sm.phase;
  await t.frames(0.1); out.bellOn = !!(g.sm.room.bell.voice && g.sm.room.bell.voice.busy);
  g._face(g.tn.face + Math.PI / 2, true); await t.frames(1.0);
  out.offCentre = g.sm.phase;
  t.face(g.sm.room.bell.pos); await t.frames(0.2);
  out.brief = g.sm.phase;
  await t.frames(0.6);
  out.done = g.sm.phase; out.chime = t.played.includes('evt_chime_clear');
  out.doorSound = t.played.includes('mu_door_open') ? 'early' : 'later';
  await t.skip();
  out.door = !!(g.sm.door && g.sm.door.open && g.sm.door.voice); out.opened = t.played.includes('mu_door_open');
  out.doneLine = t.lines.some((l) => l[0] === 'story.1.done');
  out.through = await t.through();
  out.closed = t.played.includes('mu_door_close');
  out.next = g.sm.chapter;
  return out;
});
check(c1.state === 'story' && c1.chapter === 1 && c1.first === 'story.1.story' && c1.recorded, 'the first time, Story Mode begins at chapter 1, with Bella\'s recorded story line');
check(c1.bellQuiet && c1.bgOn && c1.bellOn, 'the room\'s background plays while Bella speaks; the bell starts only once she has said what to do (7.3.1)');
check(c1.early === 'story' && c1.lines.join() === 'story.1.story,story.1.task' && c1.task === 'task', 'the story, then the task: the task counts only once it has been given');
check(c1.offCentre === 'task' && c1.brief === 'task' && c1.done === 'done' && c1.chime, 'chapter 1: the bell held centred for half a second is the task done, with a chime; off centre, or only a moment, is not');
check(c1.doorSound === 'later' && c1.doneLine && c1.door && c1.opened, 'Bella\'s done line, and then the door opens and sounds');
check(c1.through && c1.closed && c1.next === 2, 'walking through the door leads into chapter 2');

// ------------------------------------------------------------------ chapters 2 to 5
const c25 = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const out = {};
  await t.skip();
  const room = g.sm.room;
  out.circling = !!room.circler;
  const a0 = room.angle; await t.frames(1.0); out.moved = room.angle !== a0;
  // Facing it is not enough: it must first be behind you.
  for (let i = 0; i < 40; i++) { t.face(room.circler.pos); await t.frames(0.05); }
  out.frontFirst = g.sm.phase;
  for (let i = 0; i < 40; i++) { const p = room.circler.pos; t.face([2 * g.playerPos[0] - p[0], 2 * g.playerPos[1] - p[1]]); await t.frames(0.05); }
  out.behindStep = room.step;
  for (let i = 0; i < 30 && g.sm.phase === 'task'; i++) { t.face(room.circler.pos); await t.frames(0.05); }
  out.c2 = g.sm.phase;
  out.to3 = await t.through() && g.sm.chapter === 3;
  // Chapter 3: walk to the fountain.
  await t.skip();
  const f = g.sm.room.fountain;
  const far = g._smLevels(f.pos, f.gain, f.range, f.floor);
  await t.walkTo(f.pos, 4.5); await t.frames(0.1);
  const near = g._smLevels(f.pos, f.gain, f.range, f.floor);
  out.louder = Math.max(near[0], near[1]) > 3 * Math.max(far[0], far[1]);
  out.c3 = g.sm.phase;
  out.to4 = await t.through() && g.sm.chapter === 4;
  // Chapter 4: a full circle, in twelve quick turns.
  await t.skip();
  out.placed4 = g.sm.sounds.length;
  // (Turned by hand, a twelfth of a circle at a time, as a quick turn turns.)
  for (let i = 0; i < 11; i++) { g._face(g.tn.face + Math.PI / 6, true); await t.frames(0.2); }
  out.eleven = g.sm.phase;
  g._face(g.tn.face + Math.PI / 6, true); await t.frames(0.3);
  out.c4 = g.sm.phase;
  out.to5 = await t.through() && g.sm.chapter === 5;
  // Chapter 5: the small room, then the great hall.
  await t.skip();
  out.small = g._currentRoom();
  g._turnStop(); g._face(Math.PI / 2, true);
  t.played.length = 0;
  for (let i = 0; i < 4; i++) g.input('up');
  out.wall = Math.abs(g.playerPos[0]) <= 6.0001 && t.played.includes('boundary');
  g._turnStop(); g._face(0, true);
  for (let i = 0; i < 2; i++) { g.input('up'); await t.frames(0.05); }
  out.hall = g._currentRoom();
  out.hallPhase = g.sm.phase;
  for (let i = 0; i < 3; i++) { g.input('up'); await t.frames(0.05); }
  out.c5 = g.sm.phase;
  return out;
});
check(c25.circling && c25.moved, 'chapter 2: something circles you');
check(c25.frontFirst === 'task' && c25.behindStep === 1 && c25.c2 === 'done', 'chapter 2: behind you first, then in front of you, is the task done (facing it alone is not)');
check(c25.to3 && c25.louder && c25.c3 === 'done', 'chapter 3: the fountain grows as you walk to it, and reaching it is the task done');
check(c25.to4 && c25.placed4 === 3 && c25.eleven === 'task' && c25.c4 === 'done', 'chapter 4: three sounds stay where they are; eleven twelfths of a circle are not a full circle, twelve are');
check(c25.to5 && c25.small === 'lab' && c25.wall && c25.hall === 'cathedral', `chapter 5: the small room has its walls and a small room's echo, and the great hall a cathedral's: ${c25.small}, ${c25.hall}`);
check(c25.hallPhase === 'task' && c25.c5 === 'done', 'chapter 5: the hall two steps ahead; three steps into it is the task done');

// ------------------------------------------------------------------ the twist
const tw = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const out = {};
  out.through = await t.through();
  out.twist = g.sm.twist && g.sm.twist.kind;
  await t.frames(0.3);
  out.line = t.lines[t.lines.length - 1][0];
  out.thunderFirst = t.played.some((n) => /^ab_thunder_/.test(n));
  // Her line heard out: then the thunder, heard out, before the practice area's line.
  const s = g.sm.say; if (s.voice) s.voice.stop(); s.until = 0;
  await t.frames(0.3);
  out.thunder = t.played.some((n) => /^ab_thunder_/.test(n));
  out.areaWaits = !t.lines.some((l) => l[0] === `story.twist.${out.twist}`);
  for (let i = 0; i < 80 && !t.lines.some((l) => l[0] === `story.twist.${out.twist}`); i++) await t.frames(0.1);
  out.areaLine = t.lines.some((l) => l[0] === `story.twist.${out.twist}`);
  out.targetsQuiet = g.sm.twist.targets.every((x) => !x.voice);
  out.chapter = g.sm.chapter;
  // Each of the three practice areas, in turn.
  for (const kind of ['battle', 'guardian', 'abyss']) {
    g._smTwist(kind);
    await t.skip();
    // (Then the thunder, heard out, before the area and its line.)
    for (let i = 0; i < 80 && !g.sm.twist.targets.length; i++) await t.frames(0.1);
    await t.skip();
    const r = out[kind] = { line: t.lines.slice(-2).map((l) => l[0]).join(), phase: g.sm.phase, targets: g.sm.twist.targets.length };
    const tg = g.sm.twist.targets;
    if (kind === 'abyss') {
      g._face(Math.atan2(tg[0].pos[0], -tg[0].pos[1]) + Math.PI, true);
      t.played.length = 0; g.input('space'); r.farClick = t.played.includes('empty_click');
      await t.walkTo(tg[0].pos, 3.0); r.glass = t.played.some((n) => /glass_step/.test(n)); r.chime = t.played.includes('evt_chime_clear') || t.played.includes('event_pickup_file_evt_chime_clear');
      t.face(tg[0].pos); g.input('space');
      r.smash = t.played.includes('ut_glass_smash');
    } else {
      const shots = kind === 'guardian' ? 3 : 1;
      // A shot off centre misses (aimed well away from every one of them).
      let away = 0;
      for (let k = 0; k < 36; k++) {
        const a = k * Math.PI / 18;
        if (tg.every((s) => { const b = Math.atan2(s.pos[0] - g.playerPos[0], -(s.pos[1] - g.playerPos[1])); return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) > 0.6; })) { away = a; break; }
      }
      g._turnStop(); g._face(away, true);
      t.played.length = 0; g.input('space'); r.miss = t.played.includes('laser') && !t.played.includes('enemy_hit') && !t.played.includes('guardian_hit');
      for (const s of [...tg]) { t.face(s.pos); for (let k = 0; k < shots; k++) { g.input('space'); await t.frames(0.05); } }
      r.hits = t.played.filter((n) => n === (kind === 'guardian' ? 'guardian_hit' : 'enemy_hit')).length;
      r.down = t.played.includes('guardian_down');
      r.still = tg.every((s) => !s.moved);
    }
    r.done = g.sm.phase;
    if (kind !== 'abyss') { g.sm.say.queue = []; }
  }
  // Heard out: back into the story, chapter 6.
  await t.skip(); await t.frames(0.2);
  out.lines = t.lines.map((l) => l[0]).slice(t.lines.map((l) => l[0]).lastIndexOf('story.twist.abyss'));
  out.back = g.sm.chapter; out.noTwist = !g.sm.twist;
  out.warp = t.played.some((n) => /evt_exit_warp/.test(n));
  return out;
});
check(!tw.thunderFirst && tw.thunder && tw.areaWaits && tw.areaLine && tw.targetsQuiet, 'the twist: Bella\'s line first, in silence; then the thunder, heard out; then the practice area, whose targets sound only after her line (7.3.1)');
check(tw.through && ['battle', 'guardian', 'abyss'].includes(tw.twist) && tw.thunder && tw.line === 'story.twist.twist', `after chapter 5's door, the twist: thunder, "${'But not everything here is so easy.'}", and a practice area at random (${tw.twist})`);
check(tw.battle.line === 'story.twist.twist,story.twist.battle' || tw.battle.line.endsWith('story.twist.battle'), 'the battle area: Bella says what it is');
check(tw.battle.targets === 3 && tw.battle.miss && tw.battle.hits === 3 && tw.battle.done === 'done', 'the battle area: three enemies standing still; a shot off centre misses, and three centred shots bring them down');
check(tw.guardian.targets === 1 && tw.guardian.hits === 2 && tw.guardian.down && tw.guardian.done === 'done', 'the island guardian: three centred shots, the third bringing it down');
check(tw.abyss.farClick && tw.abyss.glass && tw.abyss.chime && tw.abyss.smash && tw.abyss.done === 'done', 'the abyss: glass underfoot, the case chimes within reach, and it is smashed only there');
check(tw.lines.slice(0, 4).join() === 'story.twist.abyss,story.twist.abyss.done,story.twist.back,story.6.story' && tw.back === 6 && tw.noTwist && tw.warp, `then pulled back into the story: chapter 6 (${tw.lines.join(', ')})`);

// ------------------------------------------------------------------ chapters 6 to 10
const c610 = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const out = {};
  await t.skip();
  const bella = g.sm.room.bella;
  await t.frames(3.5);
  const calls = t.lines.filter((l) => /story\.6\.call/.test(l[0]));
  out.calls = calls.length; out.placedAtHer = calls.length > 0 && calls.every((l) => l[1] && Math.hypot(l[1][0] - bella[0], l[1][1] - bella[1]) < 0.01);
  g.sm.say.queue = []; if (g.sm.say.voice) g.sm.say.voice.stop(); g.sm.say.until = 0;
  await t.walkTo(bella, 4.0); await t.frames(0.1);
  out.c6 = g.sm.phase;
  out.to7 = await t.through() && g.sm.chapter === 7;
  // Chapter 7: the door sounds from the start, shut; reaching it is the task.
  await t.skip();
  out.door7 = !!(g.sm.door && g.sm.door.voice && !g.sm.door.open);
  out.creature = g.sm.sounds.length === 1;
  t.played.length = 0;
  await t.walkTo(g.sm.door.pos, 1.0); await t.frames(0.1);
  out.glass = t.played.some((n) => /glass_step/.test(n));
  out.c7 = g.sm.phase; out.open7 = g.sm.door.open;
  await t.skip(); await t.frames(0.2);
  out.to8 = g.sm.chapter === 8;
  // Chapter 8: the diving board among the park's sounds.
  await t.skip();
  await t.frames(3.0);
  out.board = t.placed.some((p) => p[0] === 'wp_board');
  await t.walkTo(g.sm.room.board, 4.0); await t.frames(0.1);
  out.c8 = g.sm.phase;
  out.to9 = await t.through() && g.sm.chapter === 9;
  // Chapter 9: the memory's tune, then played whole.
  await t.skip();
  out.tuneLoop = !!g.sm.room.tune;
  await t.walkTo(g.sm.room.memory, 3.0); await t.frames(0.1);
  out.tunePhase = g.sm.phase;
  await t.frames(3.5);
  out.c9 = g.sm.phase;
  out.to10 = await t.through() && g.sm.chapter === 10;
  // Chapter 10: no task; the door opens after its lines.
  out.before = !!(g.sm.door && g.sm.door.open);
  await t.skip();
  out.lines10 = t.lines.slice(-2).map((l) => l[0]).join();
  out.after = !!(g.sm.door && g.sm.door.open);
  await t.walkTo(g.sm.door.pos, 1.0); await t.frames(0.2);
  out.menu = g.state; out.storyDone = g.scores.settings.storyDone;
  out.finished = t.said.some((s) => /Story Mode finished/.test(s));
  return out;
});
check(c610.calls >= 1 && c610.placedAtHer && c610.c6 === 'done', `chapter 6: Bella calls from where she stands (${c610.calls} calls), and reaching her is the task done`);
check(c610.to7 && c610.door7 && c610.creature && c610.glass && c610.c7 === 'done' && c610.open7, 'chapter 7: glass underfoot, a sleeping creature, the door sounding from the start; reaching it opens it');
check(c610.to8 && c610.board && c610.c8 === 'done', 'chapter 8: the diving board bounces where it stands, and reaching it is the task done');
check(c610.to9 && c610.tuneLoop && c610.tunePhase === 'tune' && c610.c9 === 'done', 'chapter 9: the memory\'s tune, played whole when found, then the task is done');
check(c610.to10 && !c610.before && c610.lines10 === 'story.10.story,story.10.end' && c610.after, 'chapter 10: no task; the door opens after Bella\'s last lines');
check(c610.menu === 'menu' && c610.storyDone && c610.finished, 'through the last door: back at the main menu, the story marked as walked');

// ------------------------------------------------------------------ the chapter list
const list = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const out = {};
  g.menuIndex = g.menuKeys.indexOf('story'); g.input('enter');
  out.state = g.state; out.first = t.said[t.said.length - 1];
  g.input('down'); out.second = t.said[t.said.length - 1];
  g.input('up'); g.input('up'); out.back = t.said[t.said.length - 1];
  g.input('down'); g.input('down'); g.input('down');
  g.input('down'); g.input('down'); g.input('down');
  g.input('down');
  out.seven = t.said[t.said.length - 1];
  g.input('enter'); await t.frames(0.3);
  out.started = g.state; out.chapter = g.sm.chapter; out.twistDone = g.sm.twistDone;
  g.input('enter'); out.report = t.said[t.said.length - 1];
  g.input('back'); out.quit = g.state;
  g.input('down'); g.input('enter'); await t.frames(0.1);
  out.menu = g.state;
  // From the list, chapter 4 and on still meets the twist after chapter 5.
  g.menuIndex = g.menuKeys.indexOf('story'); g.input('enter');
  for (let i = 0; i < 3; i++) g.input('down');
  g.input('enter'); await t.frames(0.2);
  out.four = g.sm.chapter; out.fourTwist = !g.sm.twistDone;
  g._stopRunSounds(); g.runId += 1; g._toMenu();
  return out;
});
check(list.state === 'story_menu' && /Choose a chapter\. Chapter 1, Where it started/.test(list.first) && /Chapter 2, Growing into six modes/.test(list.second) && list.back === 'Back to the main menu',
  'once walked, Story Mode opens with the chapter list: ' + list.first);
check(list.seven === 'Chapter 7, Papa Sangre and The Abyss' && list.started === 'story' && list.chapter === 7 && list.twistDone, 'a chapter chosen from the list begins there (past chapter 5, no twist)');
check(/Chapter 7 of 10, Papa Sangre and The Abyss/.test(list.report || ''), 'double tap: the chapter: ' + list.report);
check(list.quit === 'confirm_exit' && list.menu === 'menu', 'Escape asks before leaving, as in every mode');
check(list.four === 4 && list.fourTwist, 'from chapter 4, the twist still comes after chapter 5');

check(errors.length === 0, 'no errors: ' + errors.slice(0, 5).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
