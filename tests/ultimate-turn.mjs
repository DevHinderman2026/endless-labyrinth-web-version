// Ultimate Mode turns with you (web 4.0.0, Russell's design of 11 November 2026),
// in a real browser engine. Run:
//   node --import ./tests/github-stub.mjs tests/ultimate-turn.mjs http://localhost:8765
// What is checked: the facing and the listener that turns with it; a quick turn
// to the next main direction; a held turn that is free and stops where it is let
// go; the ticks at the main directions; a step that goes exactly where you face,
// with walls that stop you and, at a slant, let you slide; the aim; the compass
// that turns you for real; the report; and the gestures and keys that do all of
// it. The last section renders real sound through the browser's own 3D panner
// and measures each ear, so that a turn is known to move a sound that is already
// playing; how the whole world sounds as it sweeps round is still for a person
// with headphones.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

await page.goto(base + '/play.html?desktop=1');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 90000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A run, with helpers on the page: the module's numbers, a place to stand with
// open floor all round, frames on demand, and a record of what is played and said.
const startRun = async () => {
  await page.evaluate(async () => {
    const g = window.__el.game; const a = window.__el.audio;
    if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); }
    g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter');
    const mod = await import('./js/modes/ultimate.js');
    const world = await import('./js/modes/ultimate/world.js');
    const Q = Math.PI / 2;
    const T = window.__t = { mod, world, Q, deg: (r) => r * 180 / Math.PI };
    // (A run's steps are the game's own business, not the mode's: ticked here too.)
    T.frames = (seconds, hz = 60) => { for (let i = 0; i < Math.round(seconds * hz); i++) { g._tickStride(1 / hz); g.updateUltimateMode(1 / hz); } };
    T.land = () => { for (let i = 0; i < 90 && g.ut.turn && g.ut.turn.quick; i++) g.updateUltimateMode(1 / 60); };
    T.face = (deg) => { g._utTurnStop(); g._utFace(deg * Math.PI / 180, true); };
    T.calm = () => { const u = g.ut; u.safe = 999; u.hp = 100; u.worldTime = 200; u.bus = null; u.busAt = null; };
    // The middle of an open area (no labyrinth walls, no island lift underfoot): floor for many steps every way.
    T.open = () => {
      const u = g.ut;
      const area = u.world.areas.find((x) => x.kind === 'battle') || u.world.areas.find((x) => x.kind === 'tower') || u.world.areas.find((x) => x.kind === 'event');
      if (!area) return null;
      u.area = area; u.place = 'world'; u.slide = null; u.slides = [];
      g.playerPos = world.posOf(area.x0 + 16, area.y0 + 16);
      g._utRefreshRooms(); g._utListenerMix();
      T.calm();
      return area;
    };
    T.played = [];
    const play = a.play.bind(a);
    a.play = (n, o) => { const v = play(n, o); T.played.push([n, o || {}, v]); return v; };
    T.spoken = [];
    const speak = g.tts.speak.bind(g.tts);
    g.tts.speak = (t, o) => { if (t) T.spoken.push(t); return speak(t, o); };
    T.log = [];
    const input = g.input.bind(g);
    g.input = (x) => { T.log.push([x, performance.now()]); input(x); };
  });
  await sleep(600);
};
// --------------------------------------------------------------- 0. the first run after the update says, once, that turning has changed
// (Russell, 11 November 2026: yes, once.) This page's storage is new, so the run
// started here is the first on this device.
const notice = await page.evaluate(async () => {
  const g = window.__el.game;
  const mod = await import('./js/modes/ultimate.js');
  const { keyWords, LEFTOVER } = await import('./js/keywords.js');
  const { NOTICE_SAFE, NOTICE_AFTER, NOTICE_LIMIT, SAFE_SECONDS } = mod;
  const out = { NOTICE_SAFE, NOTICE_AFTER, NOTICE_LIMIT, SAFE_SECONDS, toldBefore: g.scores.settings.turnTold };
  const frames = (seconds) => { for (let i = 0; i < Math.round(seconds * 30); i++) g.updateUltimateMode(1 / 30); };
  const start = () => { if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); } g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter'); g.ut.worldTime = 500; return g.ut; };
  // (The voice held at "still saying it", or let go, as the test needs: a browser with no one listening ends a line when it likes.)
  const saying = (u, on) => { g.tts.speaking = on; g.tts.current = on ? u.notice.said : ''; };
  let u = start();
  out.said = document.getElementById('said').textContent;
  out.touch = mod.TURN_NOTICE + mod.TURN_NOTICE_END;
  out.keys = keyWords(out.touch);
  out.leftover = LEFTOVER.test(out.keys);
  out.toldAfter = g.scores.settings.turnTold;
  out.saved = Object.keys(localStorage).some((k) => /"turnTold":true/.test(localStorage.getItem(k)));
  out.atStart = { safe: u.safe, notice: !!u.notice, current: !!u.notice && g.tts.current === u.notice.said };
  // For as long as it is being said nothing can hurt you, long after the twenty seconds; and for a moment after it ends.
  saying(u, true); frames(30);
  out.at30 = { safe: u.safe, notice: !!u.notice };
  saying(u, false); frames(0.1);
  out.ended = { safe: u.safe, notice: !!u.notice };
  frames(NOTICE_AFTER + 0.2);
  out.later = u.safe;
  // The next run says nothing: it has been said.
  g.tts.speak('', { interrupt: true });
  u = start();
  out.second = { safe: u.safe, notice: !!u.notice, current: g.tts.current, speaking: g.tts.speaking };
  // (As on another device, three times more.) Said quickly, the twenty seconds from its beginning still stand.
  g.scores.settings.turnTold = false; u = start();
  saying(u, true); frames(6); saying(u, false); frames(0.1);
  out.quick = { safe: u.safe, notice: !!u.notice };
  // A voice that never reports its end does not keep you safe for ever.
  g.scores.settings.turnTold = false; u = start();
  saying(u, true); frames(NOTICE_LIMIT + 1);
  out.limit = { safe: u.safe, notice: !!u.notice };
  // Cut off by the report, it is over, and is not said again.
  g.scores.settings.turnTold = false; u = start();
  frames(2); g.input('enter'); frames(0.1);
  out.cut = { safe: u.safe, notice: !!u.notice, said: document.getElementById('said').textContent, told: g.scores.settings.turnTold };
  g.tts.speak('', { interrupt: true });
  return out;
});
check(notice.toldBefore === false && notice.toldAfter === true && notice.saved, 'the first run on a device marks the notice as said, and saves that at once');
// (This page plays as a touch screen does. A computer's wording is the same line
// through keyWords, as everything the game says there is; braille.mjs hears it on
// a Windows computer, with the notetaker's sentence.)
check(notice.said === notice.touch && /^New in version 4: you now turn where you stand, and the whole world turns with you\. Nothing can hurt you while you hear this\. Swipe left or right for a quick turn\. Slide left or right and hold to keep turning\. Swipe up to walk the way you are facing\. The help for Ultimate Mode explains more\.$/.test(notice.said),
  'on a touch screen it names the gestures: ' + notice.said);
check(!notice.leftover && /Press the left or right arrow for a quick turn\. Hold the left or right arrow down to keep turning\. Press the up arrow to walk the way you are facing, or hold it down to run\. The help for Ultimate Mode explains more\.$/.test(notice.keys) && !/notetaker/.test(notice.keys),
  'on a computer the same line is in keys, with no gesture named: ' + notice.keys);
check(notice.atStart.notice && notice.atStart.current && notice.atStart.safe === notice.NOTICE_SAFE, `nothing can hurt you from the moment it begins: ${notice.atStart.safe} safe seconds`);
check(notice.at30.notice && notice.at30.safe > notice.NOTICE_AFTER - 0.1 && !notice.ended.notice && notice.ended.safe > notice.NOTICE_AFTER - 0.2 && notice.later <= 0,
  `still being said after 30 seconds, you are still safe (${notice.at30.safe.toFixed(1)}); when it ends you have ${notice.NOTICE_AFTER} seconds more, and then the run is as any other (${notice.later.toFixed(1)})`);
check(!notice.second.notice && notice.second.safe === notice.SAFE_SECONDS && !notice.second.speaking, `the next run says nothing and begins as every run does (${notice.second.safe} safe seconds)`);
check(!notice.quick.notice && notice.quick.safe > notice.NOTICE_SAFE - 6.3 && notice.quick.safe < notice.NOTICE_SAFE - 5.9, `said quickly, the twenty seconds from its beginning still stand (${notice.quick.safe.toFixed(1)} left after six)`);
check(!notice.limit.notice && notice.limit.safe < notice.NOTICE_AFTER, `a voice that never reports its end keeps you safe for ${notice.NOTICE_LIMIT} seconds at most`);
check(!notice.cut.notice && notice.cut.told && /health\./.test(notice.cut.said) && notice.cut.safe > 17 && notice.cut.safe < 18.1, `cut off by the report, the notice is over (${notice.cut.said}), and what is left of its twenty seconds still runs (${notice.cut.safe.toFixed(1)})`);

// (A world with an open area, a labyrinth, an island and a tower area: made again until it has them.)
for (let n = 0; n < 40; n++) {
  await startRun();
  const kinds = await page.evaluate(() => window.__el.game.ut.world.areas.map((a) => a.kind));
  if (['battle', 'labyrinth', 'island', 'tower', 'event'].every((k) => kinds.includes(k))) break;
}

// --------------------------------------------------------------- 1. the facing, and the listener that turns with it
const facing = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const u = g.ut; const T = window.__t;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  T.open();
  const L = a.ctx.listener;
  const heard = () => (L.forwardX ? [L.forwardX.value, L.forwardZ.value] : null);
  const out = { start: u.face, forward0: g._utForward().slice() };
  await wait(150);
  out.heard0 = heard();
  const seen = {};
  for (const [name, deg] of [['east', 90], ['south', 180], ['west', 270], ['north', 0], ['slant', 30]]) {
    T.face(deg);
    await wait(120);
    seen[name] = { face: T.deg(u.face), forward: g._utForward().map((v) => +v.toFixed(6)), heard: heard() && heard().map((v) => +v.toFixed(3)), engine: T.deg(a.facing) };
  }
  out.seen = seen;
  // Squared up, the forward vector is exact (so a step is cell to cell).
  T.face(90); out.exactEast = g._utForward()[0] === 1 && g._utForward()[1] === 0;
  T.face(270); out.exactWest = g._utForward()[0] === -1 && g._utForward()[1] === 0;
  T.face(180); out.exactSouth = g._utForward()[0] === 0 && g._utForward()[1] === 1;
  // An angle past a full circle, or below none, is brought back into it.
  g._utFace(Math.PI * 2 + Math.PI / 2); out.wrapped = T.deg(u.face);
  g._utFace(-Math.PI / 2); out.wrappedBack = T.deg(u.face);
  // How far behind you a place is, for its dull copy: by the way you face.
  const north = [g.playerPos[0], g.playerPos[1] - 30];
  T.face(0); out.behindFacingNorth = g._behind(north);
  T.face(180); out.behindFacingSouth = g._behind(north);
  T.face(90); out.behindFacingEast = g._behind(north);
  T.face(135); out.behindFacingSouthEast = g._behind(north);
  T.face(0);
  return out;
});
check(facing.start === 0 && facing.forward0[0] === 0 && facing.forward0[1] === -1, 'a run begins facing north');
check(facing.heard0 === null || (Math.abs(facing.heard0[0]) < 1e-3 && Math.abs(facing.heard0[1] + 1) < 1e-3), 'and the listener faces north with you: ' + JSON.stringify(facing.heard0));
check(facing.seen.east.heard === null || (facing.seen.east.heard[0] === 1 && facing.seen.east.heard[1] === 0 && facing.seen.south.heard[1] === 1 && facing.seen.west.heard[0] === -1 && facing.seen.north.heard[1] === -1),
  'the listener turns with you, so every placed sound sweeps round: east, south, west and north are heard as faced: ' + JSON.stringify(Object.fromEntries(Object.entries(facing.seen).map(([k, v]) => [k, v.heard]))));
check(facing.seen.slant.heard === null || (Math.abs(facing.seen.slant.heard[0] - 0.5) < 0.002 && Math.abs(facing.seen.slant.heard[1] + 0.866) < 0.002), 'and at a slant: 30 degrees east of north is heard as ' + JSON.stringify(facing.seen.slant.heard));
check(facing.exactEast && facing.exactWest && facing.exactSouth, 'squared up, the way you face is exact: a step will be cell to cell with nothing left over');
check(Math.abs(facing.wrapped - 90) < 1e-9 && Math.abs(facing.wrappedBack - 270) < 1e-9, `an angle beyond the circle is brought back into it (${facing.wrapped}, ${facing.wrappedBack})`);
check(facing.behindFacingNorth === 0 && facing.behindFacingSouth === 1 && facing.behindFacingEast === 0 && facing.behindFacingSouthEast > 0.3 && facing.behindFacingSouthEast < 1,
  `the dull copy for what is behind you follows the way you face: a sound to the north is ${facing.behindFacingNorth} behind facing north, ${facing.behindFacingSouth} facing south, ${facing.behindFacingEast} facing east, ${facing.behindFacingSouthEast.toFixed(2)} facing south-east`);

// --------------------------------------------------------------- 2. a quick turn: to the next main direction
const quick = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__t;
  const { TURN_QUICK } = T.mod;
  T.open();
  const out = {};
  const turn = (side) => { g.input(side); T.land(); return T.deg(u.face); };
  // Squared up: a quarter turn each time, right round, and back.
  T.face(0);
  out.right = [turn('right'), turn('right'), turn('right'), turn('right')];
  out.left = [turn('left'), turn('left'), turn('left'), turn('left')];
  // In between: it squares you up, to the next main direction that way.
  const from = (deg, side) => { T.face(deg); return turn(side); };
  out.slants = { r30: from(30, 'right'), l30: from(30, 'left'), r100: from(100, 'right'), l100: from(100, 'left'), r350: from(350, 'right'), l350: from(350, 'left'), r89: from(89, 'right'), l1: from(1, 'left') };
  // It is a turn you hear, not a jump: a quarter turn takes about a quarter of a second.
  T.face(0);
  const at = [...g.playerPos];
  T.played.length = 0;
  g.input('right');
  const begun = { turning: !!(u.turn && u.turn.quick), face: T.deg(u.face) };
  let frames = 0; const path = [];
  while (u.turn && frames < 200) { g.updateUltimateMode(1 / 60); frames += 1; path.push(T.deg(u.face)); }
  out.sweep = { begun, frames, seconds: frames / 60, wanted: (Math.PI / 2) / TURN_QUICK, rising: path.every((v, i) => i === 0 || v > path[i - 1]), mid: path[Math.floor(path.length / 2)], end: T.deg(u.face) };
  out.stood = g.playerPos[0] === at[0] && g.playerPos[1] === at[1];
  out.sounds = T.played.map(([n]) => n).filter((n) => /^step_|^wall$|^boundary$|^ut_tick/.test(n));
  // Two swipes before the first has landed: a half turn. One each way: back where you were.
  T.face(0); g.input('right'); T.frames(0.05); g.input('right'); T.land(); out.twoRight = T.deg(u.face);
  T.face(0); g.input('right'); T.frames(0.05); g.input('left'); T.land(); out.rightLeft = T.deg(u.face);
  T.face(0); g.input('left'); T.frames(0.05); g.input('left'); T.frames(0.05); g.input('left'); T.land(); out.threeLeft = T.deg(u.face);
  // The tick of each landing: north the higher one.
  T.face(0); T.played.length = 0;
  for (let i = 0; i < 4; i++) { g.input('right'); T.land(); }
  out.ticks = T.played.filter(([n]) => /^ut_tick/.test(n)).map(([n, o]) => [n, !!o.direct]);
  T.face(0);
  return out;
});
check(quick.right.join() === '90,180,270,0' && quick.left.join() === '270,180,90,0', `squared up, a swipe is a quarter turn: right ${quick.right.join(', ')}; left ${quick.left.join(', ')}`);
check(quick.slants.r30 === 90 && quick.slants.l30 === 0 && quick.slants.r100 === 180 && quick.slants.l100 === 90 && quick.slants.r350 === 0 && quick.slants.l350 === 270 && quick.slants.r89 === 90 && quick.slants.l1 === 0,
  'in between, a swipe squares you up to the next main direction that way: ' + JSON.stringify(quick.slants));
check(quick.sweep.begun.turning && quick.sweep.begun.face === 0 && quick.sweep.rising && Math.abs(quick.sweep.seconds - quick.sweep.wanted) < 0.05 && quick.sweep.mid > 20 && quick.sweep.mid < 70 && quick.sweep.end === 90,
  `a quick turn sweeps round, it does not jump: a quarter turn in ${quick.sweep.seconds.toFixed(2)} seconds, ${quick.sweep.mid.toFixed(0)} degrees half way ` + JSON.stringify(quick.sweep));
check(quick.stood && quick.sounds.join() === 'ut_tick', 'turning does not move you and makes no footstep: only the tick of the landing is heard (' + quick.sounds.join(', ') + ')');
check(quick.twoRight === 180 && quick.rightLeft === 0 && quick.threeLeft === 90, `swipes before the first has landed add up: two right ${quick.twoRight}, right then left ${quick.rightLeft}, three left ${quick.threeLeft}`);
check(JSON.stringify(quick.ticks) === JSON.stringify([['ut_tick', true], ['ut_tick', true], ['ut_tick', true], ['ut_tick_north', true]]), 'each landing has its tick, a higher one for north, played past the world\'s filter: ' + JSON.stringify(quick.ticks));

// --------------------------------------------------------------- 3. a held turn: free, slow at first, stopped where it is let go
const held = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__t;
  const { TURN_SLOW, TURN_FAST, TURN_EASE, TURN_LIMIT } = T.mod;
  T.open();
  const out = { slow: T.deg(TURN_SLOW), fast: T.deg(TURN_FAST), ease: TURN_EASE };
  const hold = (side, seconds, from = 0) => { T.face(from); g.input(`turn_${side}_start`); T.frames(seconds); g.input('turn_end'); return T.deg(u.face); };
  // A short hold is a small nudge; a longer one goes further and faster.
  out.nudge = hold('right', 0.1);
  out.short = hold('right', 0.25);
  out.second = hold('right', 1.0);
  out.two = hold('right', 2.0) ;
  out.leftNudge = hold('left', 0.1);
  // It stops exactly where it is let go, and stays there.
  T.face(0); g.input('turn_right_start'); T.frames(0.6); g.input('turn_end');
  const stopped = u.face; T.frames(0.5);
  out.stays = u.face === stopped && u.turn === null; out.stoppedAt = T.deg(stopped);
  // A full circle at full speed.
  T.face(0); g.input('turn_right_start'); T.frames(TURN_EASE[1]);
  const a0 = u.face; T.frames(1.0); const a1 = u.face;
  out.fullSpeed = T.deg(a1 - a0);
  g.input('turn_end');
  // The ticks: each main direction as it is passed, north the higher; none for the one you set off from.
  T.face(0); T.played.length = 0;
  g.input('turn_right_start'); T.frames(3.2); g.input('turn_end');
  out.ticksRight = T.played.filter(([n]) => /^ut_tick/.test(n)).map(([n]) => n); out.afterRight = T.deg(u.face);
  T.face(0); T.played.length = 0;
  g.input('turn_left_start'); T.frames(1.6); g.input('turn_end');
  out.ticksLeft = T.played.filter(([n]) => /^ut_tick/.test(n)).map(([n]) => n); out.afterLeft = T.deg(u.face);
  T.face(90); T.played.length = 0;
  g.input('turn_right_start'); T.frames(0.3); g.input('turn_end');
  out.ticksLeaving = T.played.filter(([n]) => /^ut_tick/.test(n)).length;
  // An end with no turn under way is nothing; a turn that is never ended gives up.
  T.face(0); g.input('turn_end'); out.strayEnd = u.turn === null && u.face === 0;
  g.input('turn_right_start'); T.frames(TURN_LIMIT + 1, 20); out.gaveUp = u.turn === null;
  // A held turn on top of a quick one: the quick one lands first.
  T.face(0); g.input('right'); T.frames(0.05); g.input('turn_right_start'); out.onTop = { face: T.deg(u.face), free: !!(u.turn && u.turn.free) }; g.input('turn_end');
  // A quick turn ends a held one that was never let go (the other arrow pressed).
  T.face(0); g.input('turn_right_start'); T.frames(0.5); g.input('left'); T.land(); out.quickAfterHeld = T.deg(u.face);
  // A hold let go almost at once with the swipe sent straight after it (what the
  // gestures send when a finger pauses before it lifts, or a key is let go a moment
  // late): the swipe counts from where the hold began.
  const brief = (side, from, seconds = 0.15) => {
    T.face(from); T.played.length = 0;
    g.input(`turn_${side}_start`); T.frames(seconds); const mid = T.deg(u.face);
    g.input('turn_end'); g.input(side); T.land();
    return { mid, end: T.deg(u.face), ticks: T.played.filter(([n]) => /^ut_tick/.test(n)).map(([n]) => n) };
  };
  out.briefPlain = brief('right', 10);       // on from 10 degrees to east
  out.briefOver = brief('right', 87);        // carried just past east by the hold: back to east, not on to south
  out.briefOverLeft = brief('left', 3);      // carried just past north: back to north, not on to west
  // A swipe that comes a moment later is a swipe of its own, from where you are by then.
  T.face(87); g.input('turn_right_start'); T.frames(0.15); g.input('turn_end'); T.frames(0.1); g.input('right'); T.land(); out.laterSwipe = T.deg(u.face);
  // And after a real hold, a swipe straight after is never taken back to where the hold began.
  T.face(0); g.input('turn_right_start'); T.frames(1.2); const longAt = T.deg(u.face); g.input('turn_end'); g.input('right'); T.land(); out.longThenSwipe = [longAt, T.deg(u.face)];
  T.face(0);
  return out;
});
check(held.nudge > 1 && held.nudge < 6 && held.short > held.nudge && held.short < 10 && held.leftNudge > 354 && held.leftNudge < 359,
  `a held turn begins slowly, so a short hold is a small nudge: ${held.nudge.toFixed(1)} degrees in a tenth of a second, ${held.short.toFixed(1)} in a quarter (left: ${(360 - held.leftNudge).toFixed(1)})`);
check(held.second > 60 && held.second < 120 && held.two > 200 && held.two < 290, `and it gathers speed: ${held.second.toFixed(0)} degrees in one second, ${held.two.toFixed(0)} in two`);
check(Math.abs(held.fullSpeed - held.fast) < 2 && Math.abs(held.fast - 150) < 1e-6, `at full speed it turns ${held.fullSpeed.toFixed(0)} degrees a second: a full circle in ${(360 / held.fullSpeed).toFixed(1)} seconds`);
check(held.stays && held.stoppedAt > 5 && held.stoppedAt % 90 !== 0, `let go, you stop exactly there and stay there, between the main directions if that is where you are (${held.stoppedAt.toFixed(1)} degrees)`);
check(held.ticksRight.join() === 'ut_tick,ut_tick,ut_tick,ut_tick_north' && held.afterRight > 0 && held.afterRight < 90, `a held turn ticks at each main direction as it passes, the higher one at north: ${held.ticksRight.join(', ')} (ending at ${held.afterRight.toFixed(0)} degrees)`);
check(held.ticksLeft[0] === 'ut_tick' && held.ticksLeft.length >= 1 && held.ticksLeaving === 0, `turning left ticks too (${held.ticksLeft.join(', ')}), and the direction you set off from does not tick (${held.ticksLeaving})`);
check(held.strayEnd && held.gaveUp, 'an end with no turn under way is nothing, and a turn never ended gives up by itself');
check(held.briefPlain.mid > 11 && held.briefPlain.end === 90 && held.briefPlain.ticks.join() === 'ut_tick'
  && held.briefOver.mid > 90 && held.briefOver.end === 90 && held.briefOver.ticks.join() === 'ut_tick'
  && held.briefOverLeft.mid > 350 && held.briefOverLeft.end === 0 && held.briefOverLeft.ticks.join() === 'ut_tick_north',
  `a hold let go at once with a swipe after it is that swipe, counted from where the hold began: from 10 degrees to ${held.briefPlain.end}; from 87, carried to ${held.briefOver.mid.toFixed(1)}, back to ${held.briefOver.end} with one tick; from 3 turning left, carried to ${held.briefOverLeft.mid.toFixed(1)}, back to ${held.briefOverLeft.end}`);
check(held.laterSwipe === 180 && held.longThenSwipe[0] > 95 && held.longThenSwipe[1] === 180,
  `a swipe that comes later, or after a real hold, counts from where you are: ${held.laterSwipe}; ${held.longThenSwipe[0].toFixed(0)} then ${held.longThenSwipe[1]}`);
check(held.onTop.face === 90 && held.onTop.free && held.quickAfterHeld % 90 === 0, `a hold on top of a quick turn lets that one land first (${held.onTop.face}), and a swipe ends a hold by squaring up (${held.quickAfterHeld})`);

// --------------------------------------------------------------- 4. a step goes exactly where you face
const walking = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__t;
  T.open();
  const out = {};
  const step = (deg, way = 'up') => { T.face(deg); const p = [...g.playerPos]; g.input(way); return [g.playerPos[0] - p[0], g.playerPos[1] - p[1]]; };
  out.north = step(0); out.east = step(90); out.south = step(180); out.west = step(270);
  out.back = step(0, 'down');
  out.ne = step(45); out.slant = step(30); out.slantBack = step(30, 'down');
  out.any = step(217);
  // Steps and their sounds: a footstep each, and the path kept for the chasers' reach.
  T.face(60); T.played.length = 0; u.steps = [];
  const p0 = [...g.playerPos];
  g.input('up');
  out.sound = T.played.map(([n]) => n).filter((n) => /^step_/.test(n)).length;
  out.kept = u.steps.length === 1 && u.steps[0][0][0] === p0[0] && u.steps[0][1][0] === g.playerPos[0];
  // Left and right no longer step: you stay where you are.
  T.face(0); const q = [...g.playerPos];
  g.input('left'); T.land(); g.input('right'); T.land();
  out.sideways = g.playerPos[0] === q[0] && g.playerPos[1] === q[1];
  // A run goes the way you face, and curves if you turn as you run (a keyboard can).
  T.open(); T.face(90);
  const r0 = [...g.playerPos];
  g.input('run_start'); T.frames(1.0); g.input('stride_end');
  out.run = { dx: g.playerPos[0] - r0[0], dy: g.playerPos[1] - r0[1] };
  T.open(); T.face(0);
  const c0 = [...g.playerPos];
  g.input('run_start'); g.input('turn_right_start'); T.frames(1.5); g.input('turn_end'); g.input('stride_end');
  out.curve = { dx: g.playerPos[0] - c0[0], dy: g.playerPos[1] - c0[1], face: T.deg(u.face) };
  T.open(); T.face(180);
  const b0 = [...g.playerPos];
  g.input('back_start'); T.frames(1.0); g.input('stride_end');
  out.backRun = { dx: g.playerPos[0] - b0[0], dy: g.playerPos[1] - b0[1] };
  T.face(0);
  return out;
});
const near = (v, x, y, tol = 1e-9) => Math.abs(v[0] - x) < tol && Math.abs(v[1] - y) < tol;
check(near(walking.north, 0, -3) && near(walking.east, 3, 0) && near(walking.south, 0, 3) && near(walking.west, -3, 0), 'squared up, a step is three units exactly the way you face, and nothing sideways: ' + JSON.stringify([walking.north, walking.east, walking.south, walking.west]));
check(near(walking.back, 0, 3), 'a step back goes straight back: ' + JSON.stringify(walking.back));
check(near(walking.ne, 3 * Math.SQRT1_2, -3 * Math.SQRT1_2, 1e-9) && near(walking.slant, 1.5, -3 * Math.cos(Math.PI / 6), 1e-9) && near(walking.slantBack, -1.5, 3 * Math.cos(Math.PI / 6), 1e-9),
  'at a slant you walk exactly where you face: north-east ' + JSON.stringify(walking.ne.map((v) => +v.toFixed(3))) + ', 30 degrees ' + JSON.stringify(walking.slant.map((v) => +v.toFixed(3))) + ', and back the other way');
check(Math.abs(Math.hypot(...walking.any) - 3) < 1e-9, 'every step is three units long, whichever way: ' + Math.hypot(...walking.any).toFixed(6));
check(walking.sound === 1 && walking.kept, 'a step at a slant has its footstep, and its path is kept for a chaser\'s reach');
check(walking.sideways, 'a swipe to the left or the right no longer steps: you turn where you stand');
check(walking.run.dx >= 12 && Math.abs(walking.run.dy) < 1e-9, `a run goes the way you face: facing east, ${walking.run.dx} units east in a second`);
check(walking.curve.dx > 3 && walking.curve.dy < -3 && walking.curve.face > 30, `and curves when you turn as you run: ${walking.curve.dx.toFixed(1)} east and ${(-walking.curve.dy).toFixed(1)} north, ending at ${walking.curve.face.toFixed(0)} degrees`);
check(walking.backRun.dy <= -6 && Math.abs(walking.backRun.dx) < 1e-9, `walking backwards goes away from the way you face: facing south, ${-walking.backRun.dy} units north in a second`);

// --------------------------------------------------------------- 5. walls: stopped squarely, sliding at a slant (the rule itself, on a floor drawn here)
const walls = await page.evaluate(async () => {
  const T = window.__t;
  const { walkStep, SLIDE_MIN } = T.mod;
  // A floor of cells: '#' is wall, '.' floor; cell (0, 0) is the top left one. A
  // cell is three units square, centred on (3x, 3y).
  const floorOf = (rows) => (p) => { const x = Math.round(p[0] / 3); const y = Math.round(p[1] / 3); return y >= 0 && y < rows.length && x >= 0 && x < rows[y].length && rows[y][x] === '.'; };
  const dirOf = (deg) => [Math.sin(deg * Math.PI / 180), -Math.cos(deg * Math.PI / 180)];
  const go = (rows, from, deg, len = 3) => { const r = walkStep(from, deg % 90 === 0 ? [[0, -1], [1, 0], [0, 1], [-1, 0]][(deg / 90) % 4] : dirOf(deg), len, floorOf(rows)); return { dx: +(r.pos[0] - from[0]).toFixed(6), dy: +(r.pos[1] - from[1]).toFixed(6), moved: +r.moved.toFixed(6), hit: !!r.hit }; };
  const room = ['#######', '#.....#', '#.....#', '#.....#', '#######'];
  const out = { SLIDE_MIN };
  const mid = [9, 6];                      // the middle of the room
  out.open = go(room, mid, 0);             // nothing in the way
  const top = [9, 3];                      // against the north wall
  out.square = go(room, top, 0);           // squarely into it: stopped
  out.nearlySquare = go(room, top, 10);    // nearly square: still stopped (the part along the wall is too small)
  out.slant30 = go(room, top, 30);         // at a slant: along the wall
  out.slant60 = go(room, top, 60);
  out.slantLeft = go(room, top, 330);
  out.corner = go(room, [15, 3], 45);      // into a corner: nowhere
  out.cornerAlong = go(room, [15, 3], 300);   // out of the corner, along the north wall
  // From off the middle of a cell, squared up: still cell to cell, however far off.
  out.offCentre = go(room, [9 + 1.2, 6 - 1.1], 90);
  out.offCentreWall = go(room, [15 + 1.2, 6], 90);
  // Never between two walls that meet at a corner.
  const pinch = ['####', '#.##', '##.#', '####'];
  out.pinch = go(pinch, [3, 3], 135);
  out.pinchSmall = go(pinch, [3 + 1.3, 3 + 1.3], 135, 1);
  // Round an outside corner: the step that would clip it goes along one side instead.
  const ell = ['#####', '#...#', '#.#.#', '#...#', '#####'];
  out.clip = go(ell, [3, 6], 55);          // from the west side, more east than north: the middle block's corner is in the way
  out.graze = go(ell, [3, 6], 45);         // exactly along the diagonal: past the corner's very point, with floor on the other side of it
  // A doorway two cells wide, crossed at a slant.
  const door = ['######', '#....#', '##..##', '#....#', '######'];
  out.door = go(door, [6, 9], 20);
  out.doorPost = go(door, [3, 9], 0);
  // Nothing in the game puts you inside a wall; but if a fault ever did, you could
  // walk out of it onto the floor (never further into the wall).
  out.outOfWall = go(room, [9, 0], 180);
  out.outOfWallSlant = go(room, [9, 0.4], 150);
  out.deeperIntoWall = go(room, [9, 0], 90);
  return out;
});
check(walls.open.moved === 3 && !walls.open.hit && walls.open.dy === -3, 'on open floor a step is a step');
check(walls.square.moved === 0 && walls.square.hit && walls.nearlySquare.moved === 0 && walls.nearlySquare.hit, 'squarely into a wall you stop, as you always did; nearly square (10 degrees) you stop too: ' + JSON.stringify([walls.square, walls.nearlySquare]));
check(walls.slant30.hit && walls.slant30.dy === 0 && Math.abs(walls.slant30.dx - 1.5) < 1e-6 && walls.slant60.dy === 0 && Math.abs(walls.slant60.dx - 2.598076) < 1e-5 && walls.slantLeft.dy === 0 && Math.abs(walls.slantLeft.dx + 1.5) < 1e-6,
  `at a slant you slide along the wall by the part of the step that runs along it: ${walls.slant30.dx} units at 30 degrees, ${walls.slant60.dx} at 60, ${walls.slantLeft.dx} the other way`);
check(walls.corner.moved === 0 && walls.corner.hit && walls.cornerAlong.hit && walls.cornerAlong.dy === 0 && walls.cornerAlong.dx < -2, 'in a corner you stop; turned along one wall, you slide out along it: ' + JSON.stringify([walls.corner, walls.cornerAlong]));
check(walls.offCentre.dx === 3 && walls.offCentre.dy === 0 && !walls.offCentre.hit && walls.offCentreWall.moved === 0 && walls.offCentreWall.hit, 'off the middle of a square and squared up, a step is still square to square, and a wall still a wall');
check(walls.pinch.moved === 0 && walls.pinchSmall.moved === 0, 'you never pass between two walls that meet at a corner: ' + JSON.stringify([walls.pinch, walls.pinchSmall]));
check(walls.clip.hit && walls.clip.moved > 1.5 && walls.clip.dx === 0 && walls.clip.dy < -1.5 && walls.graze.moved === 3 && !walls.graze.hit, 'a step that would clip an outside corner goes along one side of it instead; one that only passes the corner\'s point goes through: ' + JSON.stringify([walls.clip, walls.graze]));
check(walls.outOfWall.moved === 3 && walls.outOfWall.dy === 3 && walls.outOfWallSlant.moved === 3 && walls.deeperIntoWall.moved === 0 && walls.deeperIntoWall.hit,
  'were you ever inside a wall, a step would take you out onto the floor, and never further in: ' + JSON.stringify([walls.outOfWall, walls.outOfWallSlant, walls.deeperIntoWall]));
check(walls.door.moved === 3 && !walls.door.hit && walls.doorPost.moved === 0 && walls.doorPost.hit, 'a doorway is walked through at a slant, and its post is a wall: ' + JSON.stringify([walls.door, walls.doorPost]));

// --------------------------------------------------------------- 5b. the same rule on the real world: every square, and a long walk at every angle
const fuzz = await page.evaluate(() => {
  const g = window.__el.game; const u = g.ut; const T = window.__t; const W = T.world;
  const { walkStep } = T.mod;
  const world = u.world;
  const open = (p) => { const [cx, cy] = W.cellOf(p); return W.isFloor(world, cx, cy); };
  let seed = 4242; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const cells = world.areas.flatMap((a) => a.floorCells);
  const out = { steps: 0, offFloor: 0, tooFar: 0, through: 0, slides: 0, stops: 0, free: 0, squareBad: 0, squareChecked: 0, worst: 0, kinds: world.areas.map((a) => a.kind).join(', ') };
  // Squared up from the middle of a square: exactly the old step, for every floor
  // square of the world and each of the four ways.
  for (const [cx, cy] of cells) for (const d of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const r = walkStep(W.posOf(cx, cy), d, 3, open);
    const went = r.moved === 3 && !r.hit && r.pos[0] === (cx + d[0]) * 3 && r.pos[1] === (cy + d[1]) * 3;
    const stayed = r.moved === 0 && !!r.hit && r.pos[0] === cx * 3 && r.pos[1] === cy * 3;
    out.squareChecked += 1;
    if (W.isFloor(world, cx + d[0], cy + d[1]) ? !went : !stayed) out.squareBad += 1;
  }
  // A long walk at every angle, forwards and back: wherever a step ends it is on
  // the floor, it is never longer than a step, and its path never goes through a
  // wall (looked at every twentieth of a unit).
  let pos = W.posOf(...cells[Math.floor(rnd() * cells.length)]);
  let angle = 0;
  for (let i = 0; i < 20000; i++) {
    if (rnd() < 0.3) angle = rnd() * Math.PI * 2;
    if (rnd() < 0.02) pos = W.posOf(...cells[Math.floor(rnd() * cells.length)]);    // (now and then, somewhere else in the world)
    const f = [Math.sin(angle), -Math.cos(angle)];
    const r = walkStep(pos, rnd() < 0.2 ? [-f[0], -f[1]] : f, 3, open);
    out.steps += 1;
    if (!open(r.pos)) out.offFloor += 1;
    const d = Math.hypot(r.pos[0] - pos[0], r.pos[1] - pos[1]);
    if (d > 3 + 1e-9 || Math.abs(d - r.moved) > 1e-9) out.tooFar += 1;
    let run = 0; let worst = 0;
    const n = Math.ceil(d / 0.05);
    for (let k = 1; k < n; k++) {
      const p = [pos[0] + (r.pos[0] - pos[0]) * k / n, pos[1] + (r.pos[1] - pos[1]) * k / n];
      if (open(p)) run = 0; else { run += d / n; worst = Math.max(worst, run); }
    }
    out.worst = Math.max(out.worst, worst);
    if (worst > 0.3) out.through += 1;
    if (!r.hit) out.free += 1; else if (r.moved > 0) out.slides += 1; else out.stops += 1;
    pos = r.pos;
  }
  return out;
});
check(fuzz.squareBad === 0 && fuzz.squareChecked > 1000, `squared up in the middle of a square, a step is exactly the step it always was: every floor square of this world, each way (${fuzz.squareChecked} steps; ${fuzz.kinds})`);
check(fuzz.offFloor === 0 && fuzz.tooFar === 0 && fuzz.through === 0,
  `a walk of ${fuzz.steps} steps at every angle never leaves the floor, never goes further than a step and never passes through a wall (${fuzz.free} clear, ${fuzz.slides} along something, ${fuzz.stops} stopped; off floor ${fuzz.offFloor}, too far ${fuzz.tooFar}, through ${fuzz.through}; the most of a corner ever cut: ${fuzz.worst.toFixed(2)} of a unit)`);
check(fuzz.free > 1000 && fuzz.slides > 100 && fuzz.stops > 100, 'and that walk met walls squarely and at a slant, as well as open floor');

// --------------------------------------------------------------- 6. walls in the world: the sound of each, and the run along one
const worldWalls = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__t; const W = T.world;
  const { WALL_TOUCH } = T.mod;
  const out = { WALL_TOUCH };
  // A floor cell of a kind of area with a wall straight to its north and open floor to its east.
  const against = (kind) => {
    const area = u.world.areas.find((x) => x.kind === kind);
    if (!area) return null;
    for (const [cx, cy] of area.floorCells) {
      if (!W.isFloor(u.world, cx, cy - 1) && [1, 2, 3].every((k) => W.isFloor(u.world, cx + k, cy) && !W.isFloor(u.world, cx + k, cy - 1) && W.areaAt(u.world, W.posOf(cx + k, cy)) === area)) {
        if (area.elevator && Math.abs(cx - area.elevator[0]) < 5 && Math.abs(cy - area.elevator[1]) < 5) continue;
        u.area = area; u.place = 'world'; g.playerPos = W.posOf(cx, cy); g._utRefreshRooms(); g._utListenerMix(); T.calm();
        return area;
      }
    }
    return null;
  };
  // (Each sound with the level it was given and whether it has a place in the world.)
  const tryStep = (deg) => { T.face(deg); T.played.length = 0; const p = [...g.playerPos]; g.input('up'); return { dx: +(g.playerPos[0] - p[0]).toFixed(4), dy: +(g.playerPos[1] - p[1]).toFixed(4), sounds: T.played.filter(([n]) => /^wall$|^boundary$|^step_/.test(n)).map(([n, o, v]) => [n.replace(/_\d$/, ''), v ? +Math.max(v.l, v.r).toFixed(2) : null, !!o.pos, o.pos ? o.pos.map((x) => +x.toFixed(2)) : null]) }; };
  if (against('battle') || against('tower') || against('labyrinth')) {
    out.kind = u.area.kind;
    out.square = tryStep(0);
    out.slide = tryStep(40);
    // A run along the wall at a slant carries on, sliding; squarely into it, it ends at once.
    g.playerPos = [g.playerPos[0] - out.slide.dx, g.playerPos[1]];
    T.face(40); const r0 = [...g.playerPos];
    g.input('run_start'); T.frames(0.5); const running = !!g.stride; g.input('stride_end');
    out.runSlide = { dx: +(g.playerPos[0] - r0[0]).toFixed(3), dy: +(g.playerPos[1] - r0[1]).toFixed(3), running };
    T.face(0); g.input('run_start'); out.runSquare = { running: !!g.stride }; g.input('stride_end');
  }
  if (against('island')) {
    out.islandSquare = tryStep(0);
    out.islandSlide = tryStep(40);
  }
  T.face(0);
  return out;
});
check(worldWalls.square && worldWalls.square.dx === 0 && worldWalls.square.dy === 0 && worldWalls.square.sounds.length === 1 && worldWalls.square.sounds[0][0] === 'wall' && worldWalls.square.sounds[0][1] === 1 && worldWalls.square.sounds[0][2],
  `squarely into a wall (${worldWalls.kind} area): no step, and the wall sounds where it is: ` + JSON.stringify(worldWalls.square));
check(worldWalls.slide && worldWalls.slide.dy === 0 && worldWalls.slide.dx > 1.5 && worldWalls.slide.sounds.some(([n, level]) => n === 'wall' && level === worldWalls.WALL_TOUCH) && worldWalls.slide.sounds.some(([n]) => n === 'step_stone' || n === 'step_sand'),
  'at a slant you slide along it: a footstep, and the wall beside you, quieter: ' + JSON.stringify(worldWalls.slide));
// (Where it is heard: the middle of the square in your way. Facing 40 degrees east
// of north with the wall to the north, that is to your left, not ahead.)
const wallAt = (r) => { const w = r && r.sounds.find(([n]) => n === 'wall'); return w ? w[3] : null; };
const sideOf = (rel, deg) => rel[0] * Math.cos(deg * Math.PI / 180) + rel[1] * Math.sin(deg * Math.PI / 180);   // to your right (+) or left (-)
check(wallAt(worldWalls.square) && wallAt(worldWalls.square).join() === '0,-3' && wallAt(worldWalls.slide) && wallAt(worldWalls.slide)[1] === -3 && sideOf(wallAt(worldWalls.slide), 40) < -1,
  `the wall sounds from the square that stopped you: straight ahead when you meet it squarely (${JSON.stringify(wallAt(worldWalls.square))}), to your left when you slide along one on your left (${JSON.stringify(wallAt(worldWalls.slide))})`);
check(worldWalls.runSlide && worldWalls.runSlide.running && worldWalls.runSlide.dx > 3 && worldWalls.runSlide.dy === 0 && worldWalls.runSquare && !worldWalls.runSquare.running,
  `a run slides along a wall for as long as it moves you (${worldWalls.runSlide && worldWalls.runSlide.dx} units), and ends squarely against one`);
check(!worldWalls.islandSquare || (worldWalls.islandSquare.dx === 0 && worldWalls.islandSquare.dy === 0 && worldWalls.islandSquare.sounds.length === 1 && worldWalls.islandSquare.sounds[0][0] === 'boundary' && worldWalls.islandSquare.sounds[0][1] === 1),
  'an island\'s edge is still the boundary buzz, never a wall: ' + JSON.stringify(worldWalls.islandSquare));
check(!worldWalls.islandSlide || (worldWalls.islandSlide.dx > 1.5 && worldWalls.islandSlide.sounds.some(([n, level]) => n === 'boundary' && level === worldWalls.WALL_TOUCH) && !worldWalls.islandSlide.sounds.some(([n]) => n === 'wall')),
  'and along it at a slant you slide, with the buzz, quieter: ' + JSON.stringify(worldWalls.islandSlide));

// --------------------------------------------------------------- 7. the report and the line on the screen
const report = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__t;
  T.open();
  const said = {};
  for (const deg of [0, 45, 90, 135, 180, 225, 270, 315, 20, 25, 340, 359.5, 68]) { T.face(deg); g.input('enter'); said[deg] = (/Facing ([a-z-]+)\.$/.exec(document.getElementById('said').textContent) || [])[1]; }
  T.face(90);
  g.input('enter');
  const whole = document.getElementById('said').textContent;
  const line = g._statusLine();
  T.face(0);
  return { said, whole, line };
});
check(report.said[0] === 'north' && report.said[45] === 'north-east' && report.said[90] === 'east' && report.said[135] === 'south-east' && report.said[180] === 'south' && report.said[225] === 'south-west' && report.said[270] === 'west' && report.said[315] === 'north-west',
  'the report ends with the way you face, as one of eight words: ' + JSON.stringify(report.said));
check(report.said[20] === 'north' && report.said[25] === 'north-east' && report.said[340] === 'north' && report.said['359.5'] === 'north' && report.said[68] === 'east', 'in between, the nearest of the eight');
check(/^\d+ health\. \d+ points?\. \d+ shots?\. \d+ items?\. Facing east\.$/.test(report.whole), 'the whole report: ' + report.whole);
check(/ Facing east\.$/.test(report.line), 'the line on the screen says it too: ' + report.line);

// --------------------------------------------------------------- 8. the compass turns you for real
const compass = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__t; const W = T.world;
  const { COMPASS_BEEP_EVERY, COMPASS_BEEP_TURNING } = T.mod;
  // Outside a safe zone, somewhere with a way to go.
  const area = u.world.areas.find((x) => x.kind !== 'event' && x.kind !== 'island');
  u.area = area; u.place = 'world';
  g.playerPos = W.posOf(...area.floorCells[Math.floor(area.floorCells.length / 2)]);
  g._utRefreshRooms(); g._utListenerMix(); T.calm();
  const leg = g._utRoute().leg;
  if (!leg) return { skipped: true };
  const ways = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const legAt = ways.findIndex((d) => d[0] === leg.dir[0] && d[1] === leg.dir[1]);
  const out = { legAt };
  const beepsOver = (seconds) => { T.played.length = 0; T.frames(seconds); return T.played.filter(([n]) => /^ut_compass_\d$/.test(n)).map(([n]) => +n.slice(-1)); };
  // Facing the way to go when it comes on.
  T.face(legAt * 90);
  T.spoken.length = 0;
  g.input('hold');
  out.on = u.compass.on; out.briefing = T.spoken[T.spoken.length - 1];
  out.toward = beepsOver(1.0);
  // A quick turn is a real turn: it lands, says what lies ahead now, and the beep drops.
  const at = [...g.playerPos];
  T.spoken.length = 0;
  g.input('right'); T.land();
  out.afterRight = { face: T.deg(u.face), said: T.spoken[T.spoken.length - 1], stood: g.playerPos[0] === at[0] && g.playerPos[1] === at[1] };
  out.across = beepsOver(1.0);
  g.input('right'); T.land();
  out.awayFace = T.deg(u.face); out.awaySaid = T.spoken[T.spoken.length - 1];
  out.away = beepsOver(1.0);
  // No walking and no shot while it is on; a swipe up says the way ahead again.
  const ammo = u.ammo;
  T.spoken.length = 0;
  g.input('up'); g.input('down'); g.input('space');
  out.frozen = g.playerPos[0] === at[0] && g.playerPos[1] === at[1] && u.ammo === ammo; out.again = T.spoken[T.spoken.length - 1];
  // A held turn with the compass on: the beeps come quicker and their pitch follows the turn.
  T.played.length = 0;
  g.input('turn_right_start'); T.frames(1.2);
  const turning = T.played.filter(([n]) => /^ut_compass_\d$/.test(n)).map(([n]) => +n.slice(-1));
  g.input('turn_end');
  out.turning = { beeps: turning.length, distinct: new Set(turning).size, slant: u.face % (Math.PI / 2) !== 0 };
  out.every = [COMPASS_BEEP_EVERY, COMPASS_BEEP_TURNING];
  // At a slant, a swipe up says the way you face.
  T.face(45); T.spoken.length = 0; g.input('up'); out.slantSaid = T.spoken[T.spoken.length - 1];
  // Turn to the way to go by ear, turn the compass off, and you are facing it: walk.
  T.face(((legAt + 3) % 4) * 90);
  g.input('right'); T.land();
  out.homeSaid = T.spoken[T.spoken.length - 1];
  g.input('hold');
  out.off = !u.compass.on; out.facingWay = T.deg(u.face) === legAt * 90;
  const p0 = [...g.playerPos];
  g.input('up');
  out.walked = [g.playerPos[0] - p0[0], g.playerPos[1] - p0[1]]; out.legDir = leg.dir;
  // The briefing counts the way to start from the way you face.
  const start = (deg) => { T.face(deg); T.spoken.length = 0; g.input('hold'); const s = T.spoken[T.spoken.length - 1]; g.input('hold'); return (/starting (ahead|right|behind|left)\./.exec(s) || [])[1]; };
  g.playerPos = p0;
  out.starts = [0, 1, 2, 3].map((k) => start(((legAt + 4 - k) % 4) * 90));
  out.startSlant = start(legAt * 90 + 30);
  T.face(0);
  return out;
});
if (compass.skipped) console.log('SKIP no way to go from the place chosen');
else {
  check(compass.on && /^Compass on\. You are .* This way, \d+ steps?(, then (right|left)| to (the safe zone|the bus|the way out))\.$/.test(compass.briefing), 'facing the way to go, the compass comes on with the briefing and then the leg ahead: ' + compass.briefing);
  check(compass.toward.length >= 2 && compass.toward.every((s) => s === 8), 'the beep is at its highest when you face the way to go: ' + compass.toward.join(' '));
  check(compass.afterRight.face === ((compass.legAt + 1) % 4) * 90 && compass.afterRight.stood && /The way is to your left\.$/.test(compass.afterRight.said), 'a swipe right with the compass on is a real quarter turn, where you stand, and it says what lies ahead and that the way is now to your left: ' + compass.afterRight.said);
  check(compass.across.every((s) => s === 4) && compass.away.every((s) => s === 0) && /The way is behind you\.$/.test(compass.awaySaid), `the beep drops as you turn away: across the way ${compass.across.join(' ')}, with your back to it ${compass.away.join(' ')} ("${compass.awaySaid}")`);
  check(compass.frozen && compass.again === compass.awaySaid, 'with the compass on you cannot walk or shoot; a swipe up says the way ahead again');
  check(compass.turning.beeps >= 5 && compass.turning.distinct >= 3 && compass.turning.slant && compass.every[1] < compass.every[0], `while you hold a turn the beeps come quicker and their pitch follows the turn (${compass.turning.beeps} beeps, ${compass.turning.distinct} pitches in 1.2 seconds)`);
  check(/^Facing (north|south)-(east|west)\.$/.test(compass.slantSaid), 'at a slant a swipe up says the way you face: ' + compass.slantSaid);
  check(/^This way, /.test(compass.homeSaid) && compass.off && compass.facingWay && compass.walked[0] === compass.legDir[0] * 3 && compass.walked[1] === compass.legDir[1] * 3, 'turned to the way to go, the compass turned off, you are facing it: the next step is along the way (' + compass.homeSaid + ')');
  check(compass.starts.join() === 'ahead,right,behind,left' && ['ahead', 'right'].includes(compass.startSlant), 'the briefing counts the way to start from the way you face: ' + compass.starts.join(', ') + '; at a slant the nearest of the four (' + compass.startSlant + ')');
}

// --------------------------------------------------------------- 9. the throw, the bus at the door, the lift's square
const others = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__t; const W = T.world;
  const out = {};
  // A thrower: taken by a throw only when it is in front of you (or within two steps).
  const tw = u.world.areas.find((x) => x.kind === 'tower');
  const e = tw && u.enemies.find((x) => x.area === tw && x.kind === 'thrower');
  if (e) {
    u.area = tw; u.place = 'world'; g.playerPos = W.posOf(tw.x0 + 16, tw.y0 + 16); g._utRefreshRooms(); g._utListenerMix(); T.calm();
    const put = (deg, steps) => { const t = deg * Math.PI / 180; e.x = g.playerPos[0] - tw.centre[0] + Math.sin(t) * steps * 3; e.y = g.playerPos[1] - tw.centre[1] - Math.cos(t) * steps * 3; };
    const thrown = (faceDeg, atDeg, steps) => { T.face(faceDeg); put(atDeg, steps); e.hitsTaken = 0; e.hitsNeeded = 99; u.items = 5; g.input('space'); return { hit: e.hitsTaken === 1, spent: 5 - u.items }; };
    out.throwAhead = thrown(0, 0, 8); out.throwSide = thrown(0, 90, 8); out.throwBehind = thrown(0, 180, 8); out.throwTurned = thrown(180, 180, 8); out.throwClose = thrown(0, 180, 1.5); out.throwEdge = thrown(90, 50, 8);
  }
  // The lift: stepping onto its square starts the ride, wherever on the square you cross it.
  const isl = u.world.areas.find((x) => x.kind === 'island');
  if (isl) {
    const [ex, ey] = isl.elevator;
    const rideFrom = (pos, deg) => {
      u.area = isl; u.place = 'world'; u.ride = null; u.seabed = null; u.rideMix = null;
      g.playerPos = pos; u.liftArmed = false; T.calm();
      g.updateUltimateMode(1 / 30);
      T.face(deg); g.input('up'); g.updateUltimateMode(1 / 30);
      const rode = u.place === 'ride';
      if (u.ride && u.ride.voice) u.ride.voice.stop();
      u.place = 'world'; u.ride = null; u.rideMix = null;
      if (u.seabed) { for (const k of ['under', 'hum', 'breath']) if (u.seabed[k]) u.seabed[k].stop(); u.seabed = null; }
      return rode;
    };
    out.liftSquare = rideFrom(W.posOf(ex, ey + 1), 0);                       // straight on, through the middle
    out.liftCorner = rideFrom([ex * 3 + 1.3, (ey + 1) * 3], 0);             // off to one side of the square
    out.liftSlant = rideFrom([ex * 3 - 1.2, (ey + 1) * 3 + 0.5], 20);       // across it at a slant
    out.liftMiss = rideFrom(W.posOf(ex + 1, ey + 1), 0);                     // the next square along: no ride
    // (Leave the island with nothing of the rides left.)
    T.open();
  }
  // The bus's engine at the door is in front of you, whichever way that is.
  const area = T.open();
  T.face(90);
  u.bus = { area, pos: [g.playerPos[0] + 3, g.playerPos[1]], stage: 'boarding', t: 0, voice: null, rideVoice: null, pullVoice: null, doorVoice: null, ride: 20, steps: 100, stepped: true, closed: true };
  u.place = 'bus';
  T.frames(0.2);
  const v = u.bus && u.bus.voice;
  out.busAhead = v && v.pos3 ? v.pos3.map((x) => +x.toFixed(3)) : null;
  if (v) v.stop();
  u.bus = null; u.place = 'world';
  T.face(0);
  return out;
});
check(!others.throwAhead || (others.throwAhead.hit && others.throwAhead.spent === 1 && !others.throwSide.hit && !others.throwBehind.hit && others.throwTurned.hit && others.throwClose.hit && others.throwEdge.hit),
  'a throw takes the thrower in front of you, not one to the side or behind; turn to face it and it does; within two steps it does anyway: ' + JSON.stringify(others));
check(others.liftSquare === undefined || (others.liftSquare && others.liftCorner && others.liftSlant && !others.liftMiss), `stepping onto the lift's square starts the ride wherever you cross it (middle ${others.liftSquare}, off to one side ${others.liftCorner}, at a slant ${others.liftSlant}), and the next square along does not (${others.liftMiss})`);
check(others.busAhead && Math.abs(others.busAhead[0] - 1.5) < 0.01 && Math.abs(others.busAhead[2]) < 0.01, 'the bus\'s engine at the door is in front of you whichever way you face (facing east: ' + JSON.stringify(others.busAhead) + ')');

// --------------------------------------------------------------- 10. a pause, help and the quit question end a turn; a new run faces north
const stops = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__t;
  T.open();
  const out = {};
  // A held turn, then a pause: it ends, and the finger lifting during the pause is taken.
  T.face(0); g.input('turn_right_start'); T.frames(0.5);
  g.input('pause');
  out.paused = g.isPaused; out.endedByPause = u.turn === null;
  const at = u.face;
  g.input('turn_end');
  g.input('turn_left_start');            // a slide begun while paused does nothing
  out.noStartPaused = u.turn === null;
  g.input('turn_end');
  g.input('pause');
  T.frames(0.3);
  out.resumedStill = !g.isPaused && u.face === at && u.turn === null;
  // A quick turn under way when the pause comes: it lands where it was going.
  T.face(0); g.input('right'); T.frames(0.05); g.input('pause');
  out.quickLanded = T.deg(u.face); g.input('pause');
  // The quit question, answered No.
  T.face(0); g.input('turn_right_start'); T.frames(0.4);
  g.input('back');
  out.asking = g.state === 'confirm_exit'; out.endedByQuit = u.turn === null;
  g.input('turn_end'); g.input('no');
  out.backInRun = g.state === 'ultimate';
  // Help.
  T.face(0); g.input('turn_right_start'); T.frames(0.4);
  g.input('help');
  out.inHelp = g.state === 'help'; out.endedByHelp = u.turn === null;
  g.input('turn_end'); g.input('back');
  out.backFromHelp = g.state === 'ultimate';
  // A new world leaves you facing as you were.
  T.face(135);
  u.worldTime = 0.05; for (let i = 0; i < 90 && u.worldNo === 1; i++) g.updateUltimateMode(1 / 30);
  out.newWorld = u.worldNo; out.keptFacing = T.deg(u.face);
  return out;
});
check(stops.paused && stops.endedByPause && stops.noStartPaused && stops.resumedStill, 'a pause ends a held turn where it is, nothing turns while paused, and resuming does not carry it on');
check(stops.quickLanded === 90, 'a quick turn under way when the pause comes lands where it was going (' + stops.quickLanded + ')');
check(stops.asking && stops.endedByQuit && stops.backInRun && stops.inHelp && stops.endedByHelp && stops.backFromHelp, 'the quit question and help end a turn too');
check(stops.newWorld >= 2 && Math.abs(stops.keptFacing - 135) < 1e-9, `a new world leaves you facing as you were (${stops.keptFacing})`);
const fresh = await (async () => {
  await page.evaluate(() => { const g = window.__el.game; window.__t.face(200); g.ut.hp = 0; g.triggerGameOver(); });
  await sleep(300);
  const after = await page.evaluate(() => ({ state: window.__el.game.state, engine: window.__el.audio.facing }));
  await page.evaluate(() => { const g = window.__el.game; if (g.state === 'game_over') g.input('enter'); });
  await startRun();
  const begun = await page.evaluate(() => ({ face: window.__el.game.ut.face, engine: window.__el.audio.facing }));
  return { after, begun };
})();
check(fresh.after.engine === 0 && fresh.begun.face === 0 && fresh.begun.engine === 0, 'a run that ended facing elsewhere leaves nothing behind: the next begins facing north');

// --------------------------------------------------------------- 11. touch: a swipe, and a slide and hold
// A whole gesture is played inside the page, on the page's own clock, so that its
// timing does not depend on how long this script takes to reach the browser:
// [wait in ms, what, x, y, finger]. 'snap' notes what the game has by then.
const gesture = (script) => page.evaluate(async (script) => {
  const el = document.getElementById('stage');
  const g = window.__el.game; const T = window.__t;
  const down = (window.__down = window.__down || new Map());
  const snaps = [];
  for (const [ms, what, x, y, id = 0] of script) {
    if (ms) await new Promise((r) => setTimeout(r, ms));
    if (what === 'snap') { const u = g.ut; snaps.push({ face: u ? u.face * 180 / Math.PI : null, turn: u && u.turn ? (u.turn.free ? 'free' : 'quick') : null, pos: [...g.playerPos], log: T.log.map(([n]) => n) }); continue; }
    const t = new Touch({ identifier: id, target: el, clientX: x, clientY: y });
    if (what === 'touchend') down.delete(id); else down.set(id, t);
    const still = [...down.values()];
    el.dispatchEvent(new TouchEvent(what, { touches: still, targetTouches: still, changedTouches: [t], bubbles: true, cancelable: true }));
  }
  return snaps;
}, script);
const state = () => page.evaluate(() => { const g = window.__el.game; const u = g.ut; return { face: u ? u.face * 180 / Math.PI : null, turn: u && u.turn ? (u.turn.free ? 'free' : 'quick') : null, pos: [...g.playerPos], log: window.__t.log.map(([x]) => x) }; });
const reset = (deg = 0) => page.evaluate((deg) => { const T = window.__t; T.open(); T.face(deg); T.log.length = 0; T.spoken.length = 0; }, deg);
const ranFrom = await page.evaluate(() => { const T = window.__t; const a = T.open(); return [(a.x0 + 16) * 3, (a.y0 + 16) * 3]; });

await reset();
// A swipe: the finger slides and lifts. One quick turn, taken when it lifts.
let snaps = await gesture([[0, 'touchstart', 200, 400], [15, 'touchmove', 232, 402], [15, 'touchmove', 265, 404], [0, 'snap'], [15, 'touchend', 265, 404], [0, 'snap'], [450, 'snap']]);
check(snaps[0].log.length === 0 && snaps[1].log.join() === 'right' && snaps[2].face === 90 && snaps[2].turn === null, `a swipe right is one quick turn, taken when the finger lifts: you face east (${snaps[2].log.join(', ')}; ${snaps[2].face})`);
await reset();
snaps = await gesture([[0, 'touchstart', 200, 400], [15, 'touchmove', 165, 400], [15, 'touchmove', 130, 398], [15, 'touchend', 130, 398], [450, 'snap']]);
check(snaps[0].log.join() === 'left' && snaps[0].face === 270, `a swipe left turns you to the west (${snaps[0].face})`);

// Slide and hold: once the finger rests, you turn until it lifts, and stop there.
await reset();
snaps = await gesture([[0, 'touchstart', 200, 400], [15, 'touchmove', 232, 400], [15, 'touchmove', 262, 400], [40, 'snap'], [660, 'snap'], [0, 'touchend', 262, 400], [0, 'snap'], [400, 'snap']]);
check(snaps[0].log.length === 0 && snaps[1].log.join() === 'turn_right_start' && snaps[1].turn === 'free' && snaps[1].face > 5, `slide right and hold: a moment after the finger rests the turn begins, and goes on while it is held (${snaps[1].face.toFixed(0)} degrees so far)`);
check(snaps[2].log.join() === 'turn_right_start,turn_end' && snaps[2].turn === null && snaps[3].face === snaps[2].face && snaps[3].face % 90 !== 0, `lifting stops you exactly there, with no swipe on top (${snaps[3].face.toFixed(1)} degrees)`);
await reset();
snaps = await gesture([[0, 'touchstart', 200, 400], [15, 'touchmove', 160, 400], [500, 'snap'], [0, 'touchend', 160, 400], [300, 'snap']]);
check(snaps[0].log.join() === 'turn_left_start' && snaps[0].face > 270 && snaps[0].face < 359 && snaps[1].face === snaps[0].face || (snaps[1].face < snaps[0].face && snaps[1].turn === null), `slide left and hold turns you left, and stops on the lift (${snaps[1].face.toFixed(1)} degrees)`);

// However slowly you swipe, a swipe is a quick turn: the finger never came to rest.
await reset();
snaps = await gesture([[0, 'touchstart', 200, 400], ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => [45, 'touchmove', 200 + i * 14, 400]), [20, 'touchend', 326, 400], [500, 'snap']]);
check(snaps[0].face === 90 && snaps[0].log.includes('right') && snaps[0].turn === null, `a slow swipe is still a quick turn: you end facing east, squared up (${snaps[0].log.join(', ')}; ${snaps[0].face})`);

// A finger that pauses for a moment before it lifts has still swiped: the hold
// that began ends at once, and the turn goes on to the next main direction.
await reset();
snaps = await gesture([[0, 'touchstart', 200, 400], [15, 'touchmove', 232, 400], [15, 'touchmove', 262, 400], [190, 'touchend', 262, 400], [0, 'snap'], [450, 'snap']]);
check(snaps[0].log.join() === 'turn_right_start,turn_end,right' && snaps[1].face === 90 && snaps[1].turn === null, `a swipe that pauses before it lifts is still a swipe: you end facing east, squared up (${snaps[0].log.join(', ')}; ${snaps[1].face})`);
await reset();
snaps = await gesture([[0, 'touchstart', 200, 400], [15, 'touchmove', 168, 400], [15, 'touchmove', 138, 400], [190, 'touchend', 138, 400], [450, 'snap']]);
check(snaps[0].log.join() === 'turn_left_start,turn_end,left' && snaps[0].face === 270, `and the same to the left (${snaps[0].log.join(', ')}; ${snaps[0].face})`);
// Held a little longer, it is a hold: a small nudge, stopped where it is.
await reset();
snaps = await gesture([[0, 'touchstart', 200, 400], [15, 'touchmove', 232, 400], [15, 'touchmove', 262, 400], [420, 'touchend', 262, 400], [300, 'snap']]);
check(snaps[0].log.join() === 'turn_right_start,turn_end' && snaps[0].face > 4 && snaps[0].face < 20 && snaps[0].turn === null, `held for a third of a second it is a nudge, not a swipe (${snaps[0].face.toFixed(1)} degrees)`);

// A second finger while you turn does nothing; the turn ends when its own finger lifts.
await reset();
snaps = await gesture([[0, 'touchstart', 200, 400], [15, 'touchmove', 262, 400], [400, 'touchstart', 120, 300, 1], [250, 'snap'], [0, 'touchend', 262, 400, 0], [200, 'snap'], [0, 'touchend', 120, 300, 1], [200, 'snap']]);
check(snaps[0].turn === 'free' && !snaps[0].log.includes('space') && snaps[1].turn === null && snaps[1].log.join() === 'turn_right_start,turn_end' && snaps[2].log.join() === 'turn_right_start,turn_end',
  'a second finger landing while you turn does nothing (no shot); the turn ends when the turning finger lifts: ' + snaps[2].log.join(', '));

// The other gestures are as they were: slide up and hold runs, now the way you face.
await reset(90);
snaps = await gesture([[0, 'touchstart', 200, 400], [15, 'touchmove', 200, 340], [800, 'touchend', 200, 340], [300, 'snap']]);
check(snaps[0].log[0] === 'run_start' && snaps[0].log.includes('stride_end') && snaps[0].pos[0] - ranFrom[0] >= 9 && snaps[0].pos[1] === ranFrom[1], `slide up and hold still runs, now the way you face (east: ${snaps[0].pos[0] - ranFrom[0]} units)`);
// A two-finger tap is still the attack, and a finger held still is still the compass.
await reset();
await page.evaluate(() => { window.__el.game.ut.ammo = 5; });
snaps = await gesture([[0, 'touchstart', 200, 400, 0], [10, 'touchstart', 260, 400, 1], [60, 'touchend', 200, 400, 0], [10, 'touchend', 260, 400, 1], [100, 'snap']]);
check(snaps[0].log.join() === 'space', 'a two-finger tap is still the attack: ' + snaps[0].log.join(', '));
await reset();
snaps = await gesture([[0, 'touchstart', 200, 400], [1150, 'touchend', 200, 400], [50, 'snap']]);
const compassHold = await page.evaluate(() => { const g = window.__el.game; const on = g.ut.compass.on; if (on) g.input('hold'); return on; });
check(compassHold && snaps[0].log[0] === 'hold', 'a finger held still is still the compass');

// --------------------------------------------------------------- 12. the keyboard: press for one, hold to keep going
await reset();
await page.keyboard.down('ArrowRight'); await sleep(60); await page.keyboard.up('ArrowRight');
await sleep(450);
const tapped = await state();
check(tapped.log.join() === 'right' && tapped.face === 90, `one press of the right arrow is a quick turn (${tapped.log.join(', ')}; facing ${tapped.face})`);
await reset();
await page.keyboard.down('ArrowLeft'); await sleep(60); await page.keyboard.up('ArrowLeft');
await page.keyboard.down('ArrowLeft'); await sleep(60); await page.keyboard.up('ArrowLeft');
await sleep(700);
const tappedTwice = await state();
check(tappedTwice.log.join() === 'left,left' && tappedTwice.face === 180, `two presses are a half turn (facing ${tappedTwice.face})`);

await reset();
await page.keyboard.down('ArrowRight');
await sleep(120);
const before = await state();
await sleep(700);
const during = await state();
await page.keyboard.up('ArrowRight');
const after = await state();
await sleep(300);
const rested = await state();
check(before.log.length === 0 && during.log.join() === 'turn_right_start' && during.turn === 'free' && after.log.join() === 'turn_right_start,turn_end' && rested.face === after.face && rested.face > 5 && rested.face % 90 !== 0,
  `holding the right arrow turns you until you let go, and you stop exactly there (${rested.face.toFixed(1)} degrees)`);

// A slow press is still a press: let go a moment after the hold began, the turn
// goes on to the next main direction. (Keys pressed inside the page, on its own clock.)
const pressFor = (key, ms) => page.evaluate(async ([key, ms]) => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, ms));
  document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 450));
}, [key, ms]);
await reset();
await pressFor('ArrowRight', 270);
const slowPress = await state();
check(slowPress.log.join() === 'turn_right_start,turn_end,right' && slowPress.face === 90 && slowPress.turn === null, `a slow press of the right arrow is still a quick turn (${slowPress.log.join(', ')}; facing ${slowPress.face})`);
await reset();
await pressFor('ArrowLeft', 270);
const slowLeft = await state();
check(slowLeft.log.join() === 'turn_left_start,turn_end,left' && slowLeft.face === 270, `and of the left arrow (${slowLeft.log.join(', ')}; facing ${slowLeft.face})`);
await reset();
await pressFor('ArrowRight', 480);
const nudged = await state();
check(nudged.log.join() === 'turn_right_start,turn_end' && nudged.face > 4 && nudged.face < 25 && nudged.turn === null, `held for half a second it is a nudge, stopped where it is (${nudged.face.toFixed(1)} degrees)`);

// Up and down: a press is one step, a hold runs or walks back, the way you face.
await reset(90);
await page.keyboard.down('ArrowUp'); await sleep(50); await page.keyboard.up('ArrowUp');
await sleep(150);
const stepped = await state();
check(stepped.log.join() === 'run_start,up,stride_end' && stepped.pos[0] - ranFrom[0] === 3, `one press of the up arrow is one step, the way you face (${stepped.log.join(', ')})`);
await reset(90);
await page.keyboard.down('ArrowUp'); await sleep(900); await page.keyboard.up('ArrowUp');
await sleep(300);
const keyRun = await state();
const keySteps = keyRun.log.filter((x) => x === 'up').length;
check(keySteps >= 4 && keySteps <= 6 && keyRun.pos[0] - ranFrom[0] === keySteps * 3 && keyRun.log[keyRun.log.length - 1] === 'stride_end', `holding the up arrow runs, at the touch screen's pace (${keySteps} steps in 0.9 seconds), and stops when you let go`);
await reset(90);
await page.keyboard.down('ArrowDown'); await sleep(900); await page.keyboard.up('ArrowDown');
await sleep(300);
const keyBack = await state();
const backSteps = keyBack.log.filter((x) => x === 'down').length;
check(backSteps >= 3 && backSteps <= 4 && ranFrom[0] - keyBack.pos[0] === backSteps * 3, `holding the down arrow walks backwards, more slowly (${backSteps} steps in 0.9 seconds)`);

// Both at once: a run that curves.
await reset(0);
await page.keyboard.down('ArrowUp'); await sleep(100);
await page.keyboard.down('ArrowRight'); await sleep(1100);
await page.keyboard.up('ArrowRight'); await sleep(100);
await page.keyboard.up('ArrowUp');
await sleep(300);
const curved = await state();
check(curved.face > 20 && curved.pos[0] - ranFrom[0] > 2 && ranFrom[1] - curved.pos[1] > 2 && curved.log.includes('turn_right_start') && curved.log.filter((x) => x === 'up').length >= 4, `holding up and right together curves the run: ${(curved.pos[0] - ranFrom[0]).toFixed(1)} east, ${(ranFrom[1] - curved.pos[1]).toFixed(1)} north, facing ${curved.face.toFixed(0)} degrees`);

// The page losing the keyboard lets go of the keys.
await reset(0);
await page.keyboard.down('ArrowRight'); await page.keyboard.down('ArrowUp');
await sleep(500);
await page.evaluate(() => window.dispatchEvent(new Event('blur')));
const blurred = await state();
await sleep(400);
const afterBlur = await state();
await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowUp');
check(blurred.log.includes('turn_end') && blurred.log.includes('stride_end') && afterBlur.face === blurred.face && afterBlur.pos[0] === blurred.pos[0] && afterBlur.pos[1] === blurred.pos[1], 'when the page loses the keyboard the turn and the run both end, though no key was heard to come up');

// A pause with keys held, then let go: nothing carries on after resuming.
await reset(0);
await page.keyboard.down('ArrowRight');
await sleep(500);
await page.keyboard.press('p');
await sleep(200);
await page.keyboard.up('ArrowRight');
const pausedFace = (await state()).face;
await page.keyboard.press('p');
await sleep(400);
const resumed = await state();
check(resumed.face === pausedFace && resumed.turn === null, 'a turn held into a pause does not carry on when the game resumes');

// --------------------------------------------------------------- 13. every other mode is as it was
await page.evaluate(() => { const g = window.__el.game; g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); g.startGame('standard'); g.grid = new Set(); g.gridSize = 60; g.exitPos = [55, 55]; g.playerPos = [30, 30]; g.timeLeft = 999; window.__t.log.length = 0; });
await sleep(300);
snaps = await gesture([[0, 'touchstart', 200, 400], [15, 'touchmove', 265, 400], [0, 'snap'], [300, 'touchend', 265, 400], [50, 'snap']]);
const stdHold = await page.evaluate(() => window.__el.game.gestures.turnHold);
check(snaps[0].log.join() === 'right' && snaps[0].pos[0] === 31 && snaps[1].log.join() === 'right' && stdHold === false, 'in Standard Mode a swipe right is taken at once, as the finger slides, and steps right as it always did, held or not: ' + JSON.stringify(snaps[1]));
await page.evaluate(() => { window.__t.log.length = 0; });
await page.keyboard.down('ArrowUp'); await sleep(700); await page.keyboard.up('ArrowUp');
await page.keyboard.down('ArrowLeft'); await sleep(500); await page.keyboard.up('ArrowLeft');
const stdKeys = await page.evaluate(() => window.__t.log.map(([x]) => x));
check(stdKeys.join() === 'up,left', 'and its arrow keys are one step a press, however long they are held: ' + stdKeys.join(', '));

// --------------------------------------------------------------- 14. the sound itself: rendered by the browser's engine and measured in each ear
// Everything above checks where the game points the listener. This renders real
// sound, off line, through the same 3D panner the game uses and the engine's own
// setFacing: one sound in the east that never moves, while the listener turns.
const ears = await page.evaluate(async () => {
  const set = window.__el.audio.constructor.prototype.setFacing;
  const RATE = 44100; const D = Math.PI / 180;
  const render = async (plan, seconds) => {
    const ctx = new OfflineAudioContext(2, Math.round(RATE * seconds), RATE);
    const stand = { ctx, facing: 0 };
    const noise = ctx.createBuffer(1, Math.round(RATE * seconds), RATE);
    const d = noise.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = (seed / 0x7fffffff) * 2 - 1; }
    const src = ctx.createBufferSource(); src.buffer = noise;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'linear'; p.refDistance = 1; p.rolloffFactor = 0;
    if (p.positionX) { p.positionX.value = 3; p.positionY.value = 0; p.positionZ.value = 0; } else p.setPosition(3, 0, 0);
    src.connect(p); p.connect(ctx.destination);
    if (ctx.listener.upX) { ctx.listener.upX.value = 0; ctx.listener.upY.value = 1; ctx.listener.upZ.value = 0; }
    set.call(stand, plan[0][1], true);
    for (const [at, theta] of plan.slice(1)) ctx.suspend(at).then(() => { set.call(stand, theta); ctx.resume(); });
    src.start(0);
    const buf = await ctx.startRendering();
    const L = buf.getChannelData(0); const R = buf.getChannelData(1);
    const rms = (ch, a, b) => { let t = 0; const i0 = Math.round(a * RATE); const i1 = Math.round(b * RATE); for (let i = i0; i < i1; i++) t += ch[i] * ch[i]; return Math.sqrt(t / (i1 - i0)); };
    return (a, b) => [rms(L, a, b), rms(R, a, b)];
  };
  if (!new OfflineAudioContext(2, 128, RATE).suspend) return null;
  // Quarter turns while the sound plays: north, east, south, west.
  const q = await render([[0, 0], [0.5, 90 * D], [1.0, 180 * D], [1.5, 270 * D]], 2.0);
  // A turn in the game's own small steps, six degrees a frame, from north to south.
  const plan = [[0, 0]];
  for (let i = 1; i <= 30; i++) plan.push([0.5 + i / 60, i * 6 * D]);
  const w = await render(plan, 2.0);
  return { north: q(0.2, 0.45), east: q(0.7, 0.95), south: q(1.2, 1.45), west: q(1.7, 1.95), before: w(0.2, 0.45), mid: w(0.72, 0.78), after: w(1.3, 1.9) };
});
if (!ears) console.log('SKIP the rendered sound: this browser cannot stop an off-line rendering part way');
else {
  const lr = ([l, r]) => `left ${l.toFixed(3)}, right ${r.toFixed(3)}`;
  check(ears.north[1] > 2 * ears.north[0] && ears.north[0] > 0, `facing north, a sound in the east is in your right ear (${lr(ears.north)})`);
  check(Math.abs(ears.east[0] - ears.east[1]) < 0.05 * ears.east[0] && ears.east[0] > 0, `turn to face it and it is straight ahead, the same in both ears (${lr(ears.east)})`);
  check(ears.south[0] > 2 * ears.south[1] && ears.south[1] > 0, `turn on to the south and the same sound, still playing, is in your left ear (${lr(ears.south)})`);
  check(Math.abs(ears.west[0] - ears.west[1]) < 0.05 * ears.west[0] && ears.west[0] > 0, `with your back to it, it is the same in both ears again (${lr(ears.west)})`);
  const side = ([l, r]) => (r - l) / (r + l);
  check(side(ears.before) > 0.3 && side(ears.after) < -0.3 && side(ears.mid) < side(ears.before) && side(ears.mid) > side(ears.after),
    `a turn in small steps sweeps it across: right before (${side(ears.before).toFixed(2)}), on its way part through (${side(ears.mid).toFixed(2)}), left after (${side(ears.after).toFixed(2)})`);
}

check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
