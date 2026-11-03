// Tower Mode, end to end, in a real browser engine (Chromium, through Playwright).
// Run: serve the site folder (python3 -m http.server 8771), then
//   node tests/tower.mjs http://localhost:8771
// A scripted player climbs at least two floors (collecting items, throwing at the
// rival when it is centred, dodging wind-ups, walking to the stairs), takes a hit on
// the second floor so carried health can be checked, then stands still until the
// run ends. It cannot hear: how things sound is for a person.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8771';
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
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 90000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
const said = () => page.evaluate(() => document.getElementById('said').textContent);

// --------------------------------------------------------------- menu, help, sounds
const setup = await page.evaluate(async () => {
  const g = window.__el.game;
  const a = window.__el.audio;
  const { HELP } = await import('./js/game.js');
  const { default: tower, TOWER_DRONES } = await import('./js/modes/tower.js');
  const names = HELP.map(([n]) => n);
  const demoSounds = HELP.filter(([n]) => n === 'Demos, Tower Mode').flatMap(([, items]) => items.map((i) => i.sound).filter(Boolean));
  const missing = [...demoSounds, ...TOWER_DRONES, 'obstacle_0', 'obstacle_9', 'prox_0', 'prox_19', 'ammo', 'explosion',
    'empty_click', 'player_hit', 'boundary'].filter((n) => !a.has(n));
  const irs = ['tower', ...TOWER_DRONES.map((s) => 'tower/' + s)].filter((k) => !(a.irEntries.get(k) || []).length);
  return {
    menu: g.menuOptions.slice(), names, demoSounds, missing, irs,
    sectionLen: (HELP.find(([n]) => n === 'Tower Mode') || [0, []])[1].length,
    boards: g._scoreLines(),
    noKeys: HELP.filter(([n]) => n.includes('Tower')).every(([, items]) => items.every((i) => !/\b(Enter|Space|spacebar|Escape|Braille|Windows)\b|Press /.test(i.desc))),
    modeKeys: Object.keys(tower),
  };
});
check(setup.menu.indexOf('Tower Mode') === setup.menu.indexOf('Driving Mode') + 1 || (setup.menu.indexOf('Tower Mode') === 2 && !setup.menu.includes('Driving Mode')), 'main menu: ' + setup.menu.join(', '));
check(setup.names.includes('Tower Mode') && setup.names.indexOf('Tower Mode') > setup.names.indexOf('Battle Mode')
  && setup.names.indexOf('Demos, Tower Mode') > setup.names.indexOf('Demos, Battle Mode'), 'help sections: ' + setup.names.join(' | '));
check(setup.sectionLen === 16, `Tower Mode help has the desktop's 16 topics (${setup.sectionLen})`);
check(setup.demoSounds.length === 14, `tower demos: ${setup.demoSounds.length} sounds, the desktop's 14 (its tower drones are in Demos, Ambience, as on the desktop)`);
check(setup.missing.length === 0, 'every tower sound is in the packs' + (setup.missing.length ? ': missing ' + setup.missing.join(', ') : ''));
check(setup.irs.length === 0, 'the tower room and its 11 drone variations are in the packs' + (setup.irs.length ? ': missing ' + setup.irs.join(', ') : ''));
check(setup.noKeys, 'tower help names gestures, not keys');
check(setup.boards.includes('Tower Mode: No score yet'), 'high scores list the Tower board');

// --------------------------------------------------------------- the start of a climb
const start = await page.evaluate(() => {
  const g = window.__el.game;
  g.menuIndex = g.menuKeys.indexOf('tower');
  g.input('enter');
  const a = window.__el.audio;
  return {
    state: g.state, hp: g.towerHp, items: g.towerItems, level: g.level, floor: g.towerFloor, height: g.towerHeight,
    number: g.towerNumber, arena: g.arenaLimit, room: a.room, variant: a.variants.tower,
    loops: [...a.live].filter((v) => v.loop).map((v) => v.name).sort(),
    tags: Object.keys(g.towerLoops).sort(),
    hits: g.towerEnemy.hitsNeeded, diff: g._towerDifficulty(), dmg: g._towerHitDamage(),
    rivalAt: Math.hypot(g.towerEnemy.x, g.towerEnemy.y),
  };
});
check(start.state === 'tower' && start.hp === 100 && start.items === 2 && start.level === 0 && start.floor === 1 && start.number === 1,
  'tower starts with 100 health, 2 items, no floors climbed, on floor 1 of tower 1');
check(start.height >= 3 && start.height <= 10, `the tower is ${start.height} floors tall (three to ten)`);
check(start.arena === 35, 'the floor is 35 units each way');
check(start.room === 'tower' && /^tower\/tow_/.test(start.variant || ''), `the tower room, following its drone: ${start.variant}`);
check(JSON.stringify(start.tags) === '["ambience","item","rival"]', 'the floor loops its air, the rival and the item: ' + start.loops.join(', '));
check(start.rivalAt >= 10 && start.rivalAt <= 35 * 1.5, `the rival starts ${start.rivalAt.toFixed(1)} units away; needs ${start.hits} hits; difficulty ${start.diff}, damage ${start.dmg}`);
await page.waitForTimeout(50);
const report = await page.evaluate(() => { window.__el.game.input('enter'); return document.getElementById('said').textContent; });
check(new RegExp(`^Floor 1 of ${start.height}, 100 health, 2 items, ${start.hits} to go\\.$`).test(report), 'double tap reports: ' + report);

// The arena edge buzzes and does not move you.
const edge = await page.evaluate(() => {
  const g = window.__el.game;
  const a = window.__el.audio;
  const pos = [...g.playerPos];
  g.playerPos = [33.0, 0.0];
  const before = new Set(a.live);
  g.input('right');
  const buzz = [...a.live].filter((v) => !before.has(v)).map((v) => v.name);
  const stayed = g.playerPos[0] === 33.0;
  g.input('left');
  const moved = g.playerPos[0] === 30.0;
  const step = [...a.live].filter((v) => !before.has(v)).map((v) => v.name);
  g.playerPos = pos;
  return { buzz, stayed, moved, step };
});
check(edge.buzz.includes('boundary') && edge.stayed, 'walking into the edge buzzes and you stay put');
check(edge.moved && edge.step.some((n) => n.startsWith('step_stone_')), 'a step is three units, with a footstep');

// Pause holds the beacons and beeps; the rival and the air play on.
const paused = await page.evaluate(() => {
  const g = window.__el.game;
  g.input('pause');
  const held = g.pausedVoices.map((v) => v.name);
  const still = [...window.__el.audio.live].filter((v) => !v.paused).map((v) => v.name);
  const rx = g.towerEnemy.x;
  for (let i = 0; i < 30; i++) g.frame(1 / 30);
  const frozen = g.towerEnemy.x === rx;
  g.input('pause');
  return { held, still, frozen };
});
check(paused.held.includes('item_beacon') && paused.held.every((n) => /beacon|^prox_|health_low/.test(n)), 'pausing holds only beacons and beeps: ' + paused.held.join(', '));
check(paused.still.some((n) => n.startsWith('obstacle_')) && paused.still.some((n) => n.startsWith('tow_')) && paused.frozen,
  'the rival and the air play on while paused, and nothing moves');

// --------------------------------------------------------------- the scripted climb
const run = await page.evaluate(() => {
  const g = window.__el.game;
  const a = window.__el.audio;
  const out = { transitions: [], throws: 0, hits: 0, pickups: 0, grabs: 0, dodges: 0, hitsTaken: 0, windups: {}, said: [], frames: 0 };
  const snap = () => ({
    hp: g.towerHp, items: g.towerItems, floor: g.towerFloor, number: g.towerNumber, height: g.towerHeight, level: g.level,
    drone: g.ambienceChannel ? g.ambienceChannel.name : null, enemy: !!g.towerEnemy,
    enemyFresh: g.towerEnemy ? g.towerEnemy.hitsTaken === 0 && g.towerEnemy.items === 0 : false, item: !!g.towerItem,
  });
  const origNext = g._towerNextFloor.bind(g);
  g._towerNextFloor = () => {
    const b = snap();
    origNext();
    out.transitions.push({ b, a: snap(), said: document.getElementById('said').textContent, liveDrones: [...a.live].filter((v) => v.name.startsWith('tow_') && !v.stopped).length });
  };
  const origPlay = a.play.bind(a);
  a.play = (name, opts) => {
    if (name.startsWith('enemy_windup')) out.windups[name] = (out.windups[name] || 0) + 1;
    if (name === 'enemy_grab') out.grabs += 1;
    if (name === 'player_hit') out.hitsTaken += 1;
    return origPlay(name, opts);
  };
  const origSpeak = g.tts.speak.bind(g.tts);
  g.tts.speak = (t, o) => { out.said.push(t); return origSpeak(t, o); };

  const towards = (tx, ty) => {
    const [px, py] = g.playerPos;
    const dx = tx - px; const dy = ty - py;
    if (Math.abs(dx) > Math.abs(dy)) g.input(dx > 0 ? 'right' : 'left'); else g.input(dy > 0 ? 'down' : 'up');
  };
  let dodgeSteps = 0;
  let phase = 'climb';
  for (let i = 0; i < 90000 && g.state === 'tower'; i++) {
    g.frame(1 / 30);
    out.frames = i;
    if (g.state !== 'tower') break;
    // Floor two: stand still until the rival lands one, so carried health can be
    // checked; then climb again. After two floors, stand still to the end.
    if (g.level >= 2) phase = 'still';
    else if (g.level === 1 && g.towerHp === 100) phase = 'wait';
    else phase = 'climb';
    if (phase !== 'climb') continue;
    if (i % 10) continue;          // about three steps a second, the desktop's pace
    const e = g.towerEnemy;
    const [px, py] = g.playerPos;
    if (g.towerStairsActive) {
      towards(...g.towerStairsPos);
      continue;
    }
    if (!e) continue;
    // A wind-up names the spot it is aimed at: two steps sideways off the line.
    if ((e.winding > 0 || e.pending > 0) && dodgeSteps < 2) {
      const lx = px - e.x; const ly = py - e.y;
      if (Math.abs(ly) >= Math.abs(lx)) g.input(px > 0 ? 'left' : 'right'); else g.input(py > 0 ? 'up' : 'down');
      dodgeSteps += 1;
      out.dodges += 1;
      continue;
    }
    if (e.winding <= 0 && e.pending <= 0) dodgeSteps = 0;
    const dist = Math.hypot(e.x - px, e.y - py);
    // Keep one item more than the rival still needs, so some are carried upstairs.
    const left = e.hitsNeeded - e.hitsTaken;
    if (g.towerItems <= left && g.towerItem) {
      const n = g.towerItems;
      towards(g.towerItem.x, g.towerItem.y);
      g.frame(0); if (g.towerItems > n) out.pickups += 1;
      continue;
    }
    if (g.towerItems > 0 && dist > 0 && Math.abs((e.x - px) / dist) < 0.72) {
      const before = e.hitsTaken;
      g.input('space');
      out.throws += 1;
      if (e.hitsTaken > before) out.hits += 1;
      continue;
    }
    // Centre the rival: step across toward it.
    g.input(e.x > px ? 'right' : 'left');
  }
  out.end = g.state;
  out.level = g.level;
  out.score = g.scores.scores.tower;
  out.liveLoops = [...a.live].filter((v) => v.loop).map((v) => v.name);
  out.tags = Object.keys(g.towerLoops);
  out.refs = [g.towerEnemy, g.towerItem, g.towerPotion, g.towerStairsChannel, g.ambienceChannel].filter(Boolean).length + g.towerProjectiles.length;
  a.play = origPlay;
  g.tts.speak = origSpeak;
  delete g._towerNextFloor;
  return out;
});
console.log(`  bot: ${run.frames} frames, ${run.throws} throws (${run.hits} hit), ${run.pickups} items taken, ${run.dodges} dodge steps, `
  + `${run.grabs} items lost to the rival, ${run.hitsTaken} hits taken, wind-ups ${JSON.stringify(run.windups)}`);
check(run.transitions.length >= 2, `climbed ${run.transitions.length} floors`);
for (const [n, t] of run.transitions.entries()) {
  const { b, a: af } = t;
  const top = b.floor >= b.height;
  const reward = af.items - b.items;
  check(af.hp === b.hp, `floor ${n + 1}: health carries over (${b.hp} -> ${af.hp})`);
  if (top) {
    check(af.number === b.number + 1 && af.floor === 1 && reward > 0 && t.said === `Tower ${b.number} complete. ${reward} bonus items.`,
      `floor ${n + 1}: top of tower ${b.number}, bonus ${reward}, said "${t.said}"`);
  } else {
    check(af.items === b.items && af.floor === b.floor + 1 && af.number === b.number,
      `floor ${n + 1}: items carry over (${b.items} -> ${af.items}), floor ${b.floor} -> ${af.floor} of ${af.height}`);
  }
  check(af.level === b.level + 1, `floor ${n + 1}: the score counts it (${af.level})`);
  check(af.enemy && af.enemyFresh && af.item && af.drone && af.drone !== b.drone,
    `floor ${n + 1}: a fresh rival, a new item and new air (${b.drone} -> ${af.drone})`);
}
check(run.transitions.some((t) => t.b.hp < 100 && t.a.hp === t.b.hp), 'reduced health is carried up the stairs');
check(run.transitions.some((t) => t.b.items > 0 && t.a.items >= t.b.items), 'unspent items are carried up the stairs');
check(run.said.some((s) => /^Floor 2 of \d+\.$/.test(s) || /^Floor 1 of \d+\.$/.test(s)), 'each new floor is announced');
check(run.end === 'game_over' && run.score === run.level && run.level >= 2, `the run ends; ${run.level} floors saved as the high score`);
check(run.liveLoops.length === 0, 'no loops left playing after game over' + (run.liveLoops.length ? ': ' + run.liveLoops.join(', ') : ''));
check(run.tags.length === 0 && run.refs === 0, 'the tower forgets every channel at game over');
await page.waitForTimeout(1200);
const over = await said();
check(over.startsWith(`Game Over. You climbed ${run.level} floors. Your first high score for this mode: ${run.level}!`), 'game over is spoken: ' + over);
const lateLoops = await page.evaluate(() => [...window.__el.audio.live].filter((v) => v.loop).map((v) => v.name));
check(lateLoops.length === 0, 'still no loops a second later' + (lateLoops.length ? ': ' + lateLoops.join(', ') : ''));
const board = await page.evaluate(() => window.__el.game._scoreLines().find((l) => l.startsWith('Tower')));
check(board === `Tower Mode: ${run.level} floors`, 'the board reads: ' + board);

// --------------------------------------------------------------- the top of a tower
// The bot's climbs rarely reach a tower's top, so the last floor's stairs are taken
// here directly: health and items carry on, and the bonus is the desktop's.
const top = await page.evaluate(() => {
  const g = window.__el.game;
  g.input('enter');                   // game over -> menu
  g.menuIndex = g.menuKeys.indexOf('tower');
  g.input('enter');
  for (let i = 0; i < 60; i++) g.frame(1 / 30);
  g.towerFloor = g.towerHeight;
  g.towerHp = 64;
  g.towerItems = 5;
  const lines = [];
  const orig = g.tts.speak.bind(g.tts);
  g.tts.speak = (t, o) => { lines.push(t); return orig(t, o); };
  const level = g.level;
  g._towerNextFloor();
  g.tts.speak = orig;
  return { lines, hp: g.towerHp, items: g.towerItems, number: g.towerNumber, floor: g.towerFloor, height: g.towerHeight,
    diff: g._towerDifficulty(), level: g.level - level };
});
check(top.number === 2 && top.floor === 1 && top.height >= 3 && top.height <= 10 && top.level === 1, `tower 2 begins (${top.height} floors), difficulty ${top.diff}`);
check(top.hp === 64 && top.items === 5 + 12, `health carries into the next tower (${top.hp}), and 12 bonus items join the 5 held (${top.items})`);
check(top.lines[0] === 'Tower 1 complete. 12 bonus items.' && /^Floor 1 of \d+\.$/.test(top.lines[1] || ''), 'said: ' + top.lines.join(' / '));
// The desktop's numbers: each tower ends at double the last (10, 20, 40, 80, 160),
// about 21 hits by tower five, forty damage by tower three, nine degree fans.
const nums = await page.evaluate(async () => {
  const g = window.__el.game;
  const { TowerEnemy, volleySpread } = await import('./js/modes/tower.js');
  const keep = [g.towerNumber, g.towerFloor, g.towerHeight];
  const ends = [];
  const dmg = [];
  for (let n = 1; n <= 5; n++) {
    g.towerNumber = n; g.towerHeight = 7; g.towerFloor = 7;
    ends.push(g._towerDifficulty());
    dmg.push(g._towerHitDamage());
  }
  [g.towerNumber, g.towerFloor, g.towerHeight] = keep;
  const e = new TowerEnemy([0, 0], 160, 0, 35, 5);
  return { ends, dmg, hits: e.hitsNeeded, cap: e.capacity, volley: e.volley, fan: volleySpread(3).map((r) => Math.round(r * 180 / Math.PI)) };
});
check(JSON.stringify(nums.ends) === '[10,20,40,80,160]', 'towers end at difficulty ' + nums.ends.join(', '));
check(nums.hits === 21 && nums.dmg[2] === 40 && JSON.stringify(nums.fan) === '[-9,0,9]',
  `tower five's rival needs ${nums.hits} hits (capacity ${nums.cap}, volley ${nums.volley}); damage by tower ${nums.dmg.join(', ')}; a fan of three at ${nums.fan.join(', ')} degrees`);
await page.evaluate(() => { const g = window.__el.game; g.input('pause'); g.input('back'); g.input('up'); g.input('enter'); });

// --------------------------------------------------------------- quitting mid-climb
const quit = await page.evaluate(async () => {
  const g = window.__el.game;
  const a = window.__el.audio;
  g.menuIndex = g.menuKeys.indexOf('tower');
  g.input('enter');
  const fresh = { hp: g.towerHp, items: g.towerItems, level: g.level };
  for (let i = 0; i < 300; i++) g.frame(1 / 30);
  // Throw once at the rival (if centred), so a delayed impact is in flight.
  g.input('space');
  const during = [...a.live].filter((v) => v.loop).map((v) => v.name);
  g.input('pause');
  g.input('back');
  const asked = g.state;
  g.input('up');                      // Yes
  g.input('enter');
  const after = g.state;
  const loops = [...a.live].filter((v) => v.loop).map((v) => v.name);
  await new Promise((r) => setTimeout(r, 1500));
  const later = [...a.live].map((v) => v.name);
  return { fresh, during, asked, after, loops, later, tags: Object.keys(g.towerLoops) };
});
check(quit.fresh.hp === 100 && quit.fresh.items === 2 && quit.fresh.level === 0, 'a new climb starts fresh');
check(quit.during.some((n) => n.startsWith('obstacle_')), 'mid-climb loops: ' + quit.during.join(', '));
check(quit.asked === 'confirm_exit' && quit.after === 'menu', 'pause, triple tap, yes: back at the menu');
check(quit.loops.length === 0 && quit.tags.length === 0, 'no loops left after quitting' + (quit.loops.length ? ': ' + quit.loops.join(', ') : ''));
check(quit.later.length === 0 || quit.later.every((n) => n === 'menu_move'), 'nothing sounds a moment later: ' + quit.later.join(', '));

// --------------------------------------------------------------- a tower demo in help
await page.evaluate(async () => {
  const g = window.__el.game;
  const { HELP } = await import('./js/game.js');
  g.input('help');
  const target = HELP.findIndex(([n]) => n === 'Demos, Tower Mode');
  for (let i = 0; i < target; i++) g.input('down');
  g.input('enter');
  g.input('down');                    // Health Low
});
await page.waitForFunction(() => window.__el.audio.demoVoice, null, { timeout: 20000 }).then(
  () => check(true, 'a tower demo plays after its topic is read'), () => check(false, 'a tower demo plays after its topic is read'));
const demo = await page.evaluate(() => ({ name: window.__el.audio.demoVoice && window.__el.audio.demoVoice.name, room: window.__el.audio.room }));
check(demo.name === 'health_low' && demo.room === 'tower', `the demo is ${demo.name}, in the ${demo.room} room`);

check(errors.length === 0, 'no errors in the page' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
