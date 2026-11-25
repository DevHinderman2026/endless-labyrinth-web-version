// Chaos's one health bar (web 6.3.0, Russell, 20 November 2026), played by script.
// Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/chaos-health.mjs http://localhost:8790
// What is checked: a run starts at 100; every finished level gives 10, up to 150 (7.2.16);
// a battle's enemy reaching you costs 25 (it is gone and counted, the crowd groans,
// a moment's grace); an island's enemy costs 25, its guardian 40 and stays, falling back
// a while after (7.2.17), and out of shots it hunts more slowly, the elevator lets you
// down, and with the seabed empty it throws a cartridge; out of air, 10 a second until you reach air; a
// crash costs 20 and its 30 seconds; a tower potion back to 100 only if below; a
// world starts from the run's health and gives back what is left; the low-health
// warning (notes and voice, once, again after healing); the closing words; and
// every chaos double tap gives the health.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8790';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 90000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
await page.evaluate(() => {
  const g = window.__el.game; const a = window.__el.audio;
  const t = window.__t = { said: [], played: [], seq: [], pick: 0 };
  const play = a.play.bind(a);
  a.play = (name, opts) => { t.played.push(name); return play(name, opts); };
  const speak = g.tts.speak.bind(g.tts);
  g.tts.speak = (text, o) => { if (text) t.said.push(text); return speak(text, o); };
  g._chaosPickNext = () => t.seq[t.pick++ % t.seq.length];
  t.frames = (seconds, dt = 1 / 30) => { for (let i = 0; i < Math.round(seconds / dt); i++) g.frame(dt); };
  t.start = (seq) => {
    if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); }
    t.seq = seq; t.pick = 0; t.said.length = 0;
    g.menuIndex = g.menuKeys.indexOf('chaos'); g.input('enter'); g.frame(1 / 30);
  };
});

// ------------------------------------------------------------------ start, levels, no cap
const start = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  t.start(['standard', 'standard', 'standard']);
  const out = { hp: g.towerHp, state: g.state };
  for (let k = 0; k < 7; k++) { g.nextLevel(); t.frames(1.5); }
  out.after7 = g.towerHp;
  t.said.length = 0; g.input('enter'); out.report = t.said[t.said.length - 1];
  return out;
});
check(start.hp === 100, 'a chaos run starts with 100 health');
check(start.after7 === 150, 'every finished level gives 10 more, up to 150 (7.2.16): ' + start.after7);
check(/ 150 health\. \d+ points total\. Facing [a-z-]+\.$/.test(start.report), 'the double tap gives the health: ' + start.report);

// ------------------------------------------------------------------ battle
const battle = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  t.start(['battle', 'battle']);
  const out = {};
  t.frames(3.0);
  let o = g.obstacles[0];
  for (let i = 0; i < 300 && !o; i++) { g.frame(1 / 30); o = g.obstacles[0]; }
  out.had = !!o;
  if (!o) return out;
  const k0 = g.kills; const hp0 = g.towerHp; t.played.length = 0;
  o.x = g.playerPos[0]; o.y = g.playerPos[1] + 0.2;
  g.updateBattleMode(1 / 30);
  out.hit = [hp0, g.towerHp, g.state, g.obstacles.includes(o), g.kills - k0];
  out.groanSoon = true;
  // Grace: another at once does nothing.
  const o2 = g.obstacles[0];
  if (o2) { o2.x = g.playerPos[0]; o2.y = g.playerPos[1] + 0.2; const h = g.towerHp; g.updateBattleMode(1 / 30); out.grace = g.towerHp === h; } else out.grace = true;
  return out;
});
await page.waitForTimeout(400);
const groan = await page.evaluate(() => window.__t.played.some((n) => /^ut_crowd_hit_/.test(n)));
check(battle.had && battle.hit[1] === battle.hit[0] - 25 && battle.hit[2] === 'battle' && !battle.hit[3] && battle.hit[4] === 1, 'in a chaos battle an enemy reaching you costs 25 health, not the run; it is gone, and counted: ' + JSON.stringify(battle.hit));
check(groan, 'the crowd groans when you are hit (chaos battles only)');
check(battle.grace, 'a moment\'s grace before another hit can land');

// ------------------------------------------------------------------ island: enemy, guardian, air
const island = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  t.start(['island', 'island']);
  const out = {};
  g.islandGrace = 0; g.chaosHitGrace = 0;
  // An enemy.
  let o = g.obstacles.find((x) => !x.guardian);
  for (let i = 0; i < 600 && !o; i++) { g.islandGrace = 0; g.frame(1 / 30); o = g.obstacles.find((x) => !x.guardian); }
  if (o) {
    const hp0 = g.towerHp; const k0 = g.islandKillsHere;
    o.x = g.playerPos[0]; o.y = g.playerPos[1] + 0.2; g.islandGrace = 0; g.chaosHitGrace = 0;
    g._islandUpdateSurface(1 / 30);
    out.enemy = [hp0, g.towerHp, g.obstacles.includes(o), g.islandKillsHere - k0, g.state];
  }
  // The guardian, with shots: 25, and it stays.
  for (const x of [...g.obstacles]) if (!x.guardian) { if (x.channel) x.channel.stop(); g.obstacles.splice(g.obstacles.indexOf(x), 1); }
  let gd = g.obstacles.find((x) => x.guardian);
  if (!gd) { g.islandGuardianHp = 3; g._islandSpawnGuardian(); gd = g.obstacles.find((x) => x.guardian); }
  g.ammo = 5; g.chaosHitGrace = 0; g.islandGrace = 0;
  // (At its post: away from it, its leash pulls it back.)
  g.playerPos = [gd.post[0], gd.post[1] + 0.2]; gd.x = gd.post[0]; gd.y = gd.post[1];
  let hp1 = g.towerHp; g._islandUpdateSurface(1 / 30);
  out.guardian = [hp1, g.towerHp, g.obstacles.includes(gd), g.state];
  // Air: out of it on the seabed, 10 a second.
  g._islandSetupSeabed();
  g.islandAir = 0.05; g.chaosHitGrace = 0;
  const hp2 = g.towerHp;
  for (let i = 0; i < 64; i++) g._islandUpdateSeabed(1 / 30);
  out.air = [hp2, g.towerHp, g.state];
  return out;
});
check(island.enemy && island.enemy[1] === island.enemy[0] - 25 && !island.enemy[2] && island.enemy[3] === 1 && island.enemy[4] === 'island', 'on a chaos island an enemy reaching you costs 25; it is gone, and counted: ' + JSON.stringify(island.enemy));
check(island.guardian[1] === island.guardian[0] - 40 && island.guardian[2] && island.guardian[3] === 'island', 'the guardian costs 40 while you have shots, and stays (7.2.17): ' + JSON.stringify(island.guardian));
check(island.air[1] === island.air[0] - 20 && island.air[2] === 'island', 'out of air, 10 health every second: ' + JSON.stringify(island.air));

const guardianOut = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start(['island', 'island']);
  g.islandGrace = 0; g.chaosHitGrace = 0;
  for (const x of [...g.obstacles]) if (!x.guardian) { if (x.channel) x.channel.stop(); g.obstacles.splice(g.obstacles.indexOf(x), 1); }
  let gd = g.obstacles.find((x) => x.guardian);
  if (!gd) { g.islandGuardianHp = 3; g._islandSpawnGuardian(); gd = g.obstacles.find((x) => x.guardian); }
  const out = {};
  // Out of shots, it reaches you: forty, not all your health, and it falls back.
  g.towerHp = 120; g.ammo = 0; g.islandAmmoCartridges = [5];
  g.playerPos = [gd.post[0], gd.post[1] + 0.2]; gd.x = gd.post[0]; gd.y = gd.post[1];
  g._islandUpdateSurface(1 / 30);
  out.hit = [g.towerHp, g.state, (g.islandGuardianBack || 0) > 3];
  g.chaosHitGrace = 0;
  g._islandUpdateSurface(1 / 30);
  out.noSecond = g.towerHp;
  // Then it hunts you, slower than you run.
  g.islandGuardianBack = 0; g.chaosHitGrace = 0;
  g.playerPos = [gd.post[0] + 20, gd.post[1]]; gd.x = gd.post[0]; gd.y = gd.post[1];
  const x0 = gd.x;
  for (let i = 0; i < 30; i++) g._islandMoveGuardian(gd, 1 / 30);
  out.speed = +(gd.x - x0).toFixed(1);
  // The elevator lets you down while you are out of shots.
  g.playerPos = [0.5, 0.5]; g.islandLiftArmed = true; g.islandGrace = 0;
  gd.x = gd.post[0] + 30; gd.y = gd.post[1] + 30;
  g._islandUpdateSurface(1 / 30);
  out.down = !!(g.islandRide && g.islandRide.dir === 'down');
  return out;
});
check(guardianOut.hit[0] === 80 && guardianOut.hit[1] === 'island' && guardianOut.hit[2], 'out of shots, the guardian\'s hit costs 40, not all your health, and it falls back (7.2.17): ' + JSON.stringify(guardianOut.hit));
check(guardianOut.noSecond === 80, 'falling back, it does not strike again at once: ' + guardianOut.noSecond);
check(guardianOut.speed > 7.5 && guardianOut.speed < 8.5, `out of shots it hunts you at 8 a second, slower than your run (7.2.17): ${guardianOut.speed}`);
check(guardianOut.down, 'out of shots, the elevator takes you down to the seabed for more (7.2.17)');

const thrown = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start(['island', 'island']);
  g.islandGrace = 0; g.chaosHitGrace = 0;
  for (const x of [...g.obstacles]) if (!x.guardian) { if (x.channel) x.channel.stop(); g.obstacles.splice(g.obstacles.indexOf(x), 1); }
  let gd = g.obstacles.find((x) => x.guardian);
  if (!gd) { g.islandGuardianHp = 3; g._islandSpawnGuardian(); gd = g.obstacles.find((x) => x.guardian); }
  g.islandGuardianHp = 4;
  g.ammo = 0; g.islandAmmoCartridges = []; g.towerHp = 150;
  g.playerPos = [gd.post[0] + 30, gd.post[1] + 30];
  const heard = []; const ap = g.audio.play.bind(g.audio); g.audio.play = (n, o) => { heard.push(n); return ap(n, o); };
  g._islandUpdateSurface(1 / 30);
  g.audio.play = ap;
  const it = g.islandItems.find((x) => x.kind === 'ammo');
  const out = { thrown: !!it, shots: it && it.value, whoosh: heard.some((n) => /ninja_whoosh/.test(n)) };
  g._islandUpdateSurface(1 / 30);
  out.one = g.islandItems.filter((x) => x.kind === 'ammo').length;
  if (it) { g.playerPos = [...it.pos]; gd.x = gd.post[0]; gd.y = gd.post[1]; g._islandUpdateSurface(1 / 30); }
  out.ammo = g.ammo; out.gone = !g.islandItems.some((x) => x.kind === 'ammo');
  return out;
});
check(thrown.thrown && thrown.shots === 4 && thrown.whoosh && thrown.one === 1, 'out of shots with the seabed empty, the guardian throws one cartridge, with just its four hits, heard flying (7.2.17): ' + JSON.stringify(thrown));
check(thrown.ammo === 4 && thrown.gone, 'reach it, and its shots are yours: ' + JSON.stringify(thrown));

// ------------------------------------------------------------------ a crash
const crash = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  t.start(['drive', 'drive']);
  const hp0 = g.towerHp; const t0 = g.timeLeft;
  g._driveCrash();
  return [hp0 - g.towerHp, Math.round(t0 - g.timeLeft), g.state];
});
check(crash[0] === 20 && crash[1] === 30 && crash[2] === 'drive', 'a crash on a chaos road costs 20 health and 30 seconds: ' + JSON.stringify(crash));

// ------------------------------------------------------------------ tower potions, the warning
const tower = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  t.start(['tower', 'tower']);
  const out = {};
  const drink = (hp) => {
    g.towerHp = hp;
    g.towerPotion = { x: g.playerPos[0], y: g.playerPos[1] + 1, channel: null };
    g.updateTowerMode(1 / 30);
    return g.towerHp;
  };
  out.potion = [drink(40), drink(140)];
  // The warning: the notes and the voice, once; again after healing.
  g.towerHp = 50; g.towerLowWarned = false; t.said.length = 0; t.played.length = 0;
  g._chaosHurt(20, 'hit');
  out.warn1 = [t.played.includes('health_low'), t.said.slice()];
  t.said.length = 0; g._chaosHurt(5, 'hit');
  out.warnAgain = t.said.slice();
  g.towerHp = 80; g._chaosLowCheck(); t.said.length = 0; g._chaosHurt(50, 'hit');
  out.warn2 = t.said.slice();
  g.input('enter'); out.report = t.said[t.said.length - 1];
  return out;
});
check(tower.potion[0] === 100 && tower.potion[1] === 140, 'a tower potion brings you back to 100 if below, and does nothing above: ' + JSON.stringify(tower.potion));
check(tower.warn1[0] && tower.warn1[1].includes('Health low. 30.'), 'falling to 35 or less, the notes and the voice: Health low, and how much: ' + JSON.stringify(tower.warn1));
check(!tower.warnAgain.length && tower.warn2.includes('Health low. 30.'), 'once, and again only after healing above it');
check(/\b30 health\b/.test(tower.report), 'a tower floor\'s double tap gives the run\'s health: ' + tower.report);

// ------------------------------------------------------------------ a world
const world = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t;
  t.start(['ultimate', 'standard']);
  const out = { state: g.state };
  if (!g.ut) return out;
  out.start = g.ut.hp;
  g.towerHp = 0;
  g.ut.hp = 63;
  g._utChaosWorldDone();
  out.after = g.towerHp;
  return out;
});
check(world.start === 100 && world.after === 73, 'a world starts from the run\'s health and hands back what is left, plus 10 for the level: ' + JSON.stringify(world));

// ------------------------------------------------------------------ the treasure chest (7.2.17)
const chest = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  const { CHAOS_CHEST_CHANCE } = await import('./js/modes/chaos.js');
  t.start(['battle', 'battle']);
  const out = { chance: CHAOS_CHEST_CHANCE };
  for (const x of [...g.obstacles]) { if (x.channel) x.channel.stop(); }
  g.obstacles = [];
  g.battleExitActive = true; g.exitPos = [30, 0]; g.playerPos = [0, 0];
  g.chaosChestRolled = false; g._chaosChestUpdate();
  out.rolled = g.chaosChestRolled;
  g._chaosChestGone(); g.chaosChestRolled = true;
  g._chaosChestPlace(g.exitPos);
  out.pos = g.chaosChest && g.chaosChest.pos.map((v) => +v.toFixed(1));
  out.chime = !!(g.chaosChest && g.chaosChest.channel);
  // At 150 health: no health, the other two.
  g.towerHp = 150; const t0 = g.timeLeft; const p0 = g.chaosPoints || 0;
  g.playerPos = [24, 0]; g._chaosChestUpdate();
  out.full = { opened: !g.chaosChest, hp: g.towerHp, time: Math.round(g.timeLeft - t0), points: (g.chaosPoints || 0) - p0, said: t.said[t.said.length - 1] };
  // Below it: never past 150.
  let top = 0;
  for (let k = 0; k < 12; k++) { g.towerHp = 140; g.playerPos = [0, 0]; g._chaosChestPlace(g.exitPos); g.playerPos = [24, 0]; g._chaosChestUpdate(); top = Math.max(top, g.towerHp); }
  out.top = top;
  // A new level: none left over.
  g.playerPos = [0, 0]; g._chaosChestPlace(g.exitPos); g._chaosClearEverything();
  out.cleared = !g.chaosChest && !g.chaosChestRolled;
  return out;
});
check(chest.chance === 0.1 && chest.rolled, 'once a level, when the exit opens, a one in ten chance of a chest (7.2.17): ' + JSON.stringify(chest.chance));
check(JSON.stringify(chest.pos) === '[24,0]' && chest.chime, 'the chest lies two steps from the exit, on your way to it, heard by its chime: ' + JSON.stringify(chest.pos));
check(chest.full.opened && chest.full.hp === 150 && chest.full.time === 30 && chest.full.points === 50 && chest.full.said === '30 more seconds and 50 points.',
  'at 150 health it gives no health, only time and points: ' + JSON.stringify(chest.full));
check(chest.top === 150, 'and it never takes you past 150: ' + chest.top);
check(chest.cleared, 'a chest left behind is gone with the level');

check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
