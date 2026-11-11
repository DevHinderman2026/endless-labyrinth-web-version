// Ultimate Mode (web 3.0.0): how it sounds, measured. Run with the site served
// (python3 -m http.server 8765):
//   node --import ./tests/github-stub.mjs tests/ultimate-sound.mjs http://localhost:8765
// Russell's second play-test: footsteps, the countdown and pickups were dry, the
// backgrounds had no room, a safe zone's walls rang too long, a neighbour's air
// stopped and restarted as he crossed borders, there was a gap between worlds, a
// swipe in the elevator buzzed, the seabed's edge was a wall. Each is checked here
// by what the sound engine actually does: the echo is measured with an
// AnalyserNode on the area's convolver, not assumed from the wiring.

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
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 90000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// (The first run's notice, web 4.0.0, is ultimate-turn.mjs's to check: here it has been said.)
await page.evaluate(() => { const g = window.__el.game; g.scores.settings.turnTold = true; g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter'); });
await sleep(800);

// Helpers shared by the checks, installed on the page once.
await page.evaluate(async () => {
  const a = window.__el.audio; const g = window.__el.game;
  const mod = await import('./js/modes/ultimate.js');
  const world = await import('./js/modes/ultimate/world.js');
  window.__ut = { mod, world };
  // Put the player in the middle of an area of a given kind (or any with a room).
  window.__ut.goTo = (pick) => {
    const u = g.ut;
    const area = u.world.areas.find(pick);
    if (!area) return null;
    u.area = area; u.safe = 0;
    // (No bus and no slide underfoot: a check that walks must not be carried off.)
    u.bus = null; u.busAt = null; u.slide = null; u.slides = []; u.place = 'world';
    // The middle of the area, or the open square nearest it: in a labyrinth the
    // very middle is sometimes a wall, and a check made from inside a wall fails.
    const mx = area.x0 + 16; const my = area.y0 + 16;
    const [cx, cy] = world.isFloor(u.world, mx, my) ? [mx, my]
      : area.floorCells.reduce((b, c) => (Math.hypot(c[0] - mx, c[1] - my) < Math.hypot(b[0] - mx, b[1] - my) ? c : b));
    g.playerPos = [cx * 3, cy * 3];
    g._utRefreshRooms(); g._utListenerMix();
    g.updateUltimateMode(1 / 30);
    return area;
  };
  // Measure, over `ms`, the RMS of what an area's convolver puts out (the echo)
  // and of a voice's own dry branch, with everything else of the world silenced.
  // `wet` is the echo out of the area's convolver (every sound of the area
  // rings there), `send` what this voice alone sends into it, `dry` its own sound.
  window.__ut.measure = async (voice, areaId, ms = 400) => {
    const bus = a.areaBuses.get(areaId);
    if (!bus || !bus.conv) return { wet: -1, dry: -1, why: 'no bus' };
    const ctx = a.ctx;
    // (The widest window the analyser has, 0.74 s at 44.1 kHz: a short sound is
    // caught whole however the headless browser paces its audio clock.)
    const mk = () => { const n = ctx.createAnalyser(); n.fftSize = 32768; return n; };
    const wetA = mk(); const dryA = mk(); const sendA = mk();
    bus.conv.connect(wetA);
    if (voice && voice.dry) voice.dry.merge.connect(dryA);
    if (voice && voice.wet && voice.wet.merge) voice.wet.merge.connect(sendA);
    const rms = (an) => { const buf = new Float32Array(an.fftSize); an.getFloatTimeDomainData(buf); let s = 0; for (const x of buf) s += x * x; return Math.sqrt(s / buf.length); };
    let wet = 0; let dry = 0; let send = 0; const t0 = performance.now();
    while (performance.now() - t0 < ms) { await new Promise((r) => setTimeout(r, 10)); wet = Math.max(wet, rms(wetA)); dry = Math.max(dry, rms(dryA)); send = Math.max(send, rms(sendA)); }
    try { bus.conv.disconnect(wetA); } catch (e) { /* fine */ }
    if (voice && voice.dry) { try { voice.dry.merge.disconnect(dryA); } catch (e) { /* fine */ } }
    if (voice && voice.wet && voice.wet.merge) { try { voice.wet.merge.disconnect(sendA); } catch (e) { /* fine */ } }
    return { wet, dry, send };
  };
  // The next voice `play` makes for a name.
  window.__ut.capture = (name) => new Promise((resolve) => {
    const orig = a.play.bind(a);
    a.play = (n, o) => { const v = orig(n, o); if (n === name) { a.play = orig; resolve(v); } return v; };
    setTimeout(() => { if (a.play !== orig) { a.play = orig; resolve(null); } }, 3000);
  });
  // Regenerate (hurried along) until the world has an area of this kind.
  window.__ut.ensureKind = async (kind) => {
    const u = g.ut;
    for (let n = 0; n < 12 && !u.world.areas.some((x) => x.kind === kind); n++) {
      u.worldTime = 0.05;
      for (let i = 0; i < 30 * 2; i++) g.updateUltimateMode(1 / 30);
      await new Promise((r) => setTimeout(r, 50));
    }
    u.bus = null; u.busAt = null;
    return u.world.areas.some((x) => x.kind === kind);
  };
  window.__ut.quiet = () => { for (const v of [...a.live]) if (v.loop) v.stop(); g.ut.areaSounds.clear(); g.ut.voices.clear(); for (const e of g.ut.enemies) e.voice = null; for (const p of g.ut.pickups) p.voice = null; };
  // Since web 4.0.0 the world turns with you and a step goes the way you face.
  // The checks here still walk north, east, south and west, so they face that way
  // first (tests/ultimate-turn.mjs checks turning itself).
  const K = { north: 0, east: 1, south: 2, west: 3 };
  window.__ut.face = (way) => { g._utTurnStop(); g._utFace(K[way] * Math.PI / 2, true); };
  window.__ut.go = (way) => { window.__ut.face(way); g.input('up'); };
  window.__ut.land = () => { for (let i = 0; i < 60 && g.ut.turn; i++) g.updateUltimateMode(1 / 60); };
  window.__ut.turn = (side) => { g.input(side); window.__ut.land(); };
  // Every playing of the ride recording, with who asked for it: the check on its
  // easing out has now and then found one that no ride of the test began.
  window.__ut.rideLog = [];
  const play0 = a.play.bind(a);
  a.play = (n, o) => {
    if (n === 'elevator_ride') window.__ut.rideLog.push({ at: a.ctx.currentTime.toFixed(2), place: g.ut && g.ut.place, world: g.ut && g.ut.worldNo, by: (new Error().stack || '').split('\n').slice(2, 6).map((l) => l.trim().replace(/https?:\/\/[^/]+\//, '')).join(' < ') });
    return play0(n, o);
  };
});

// --------------------------------------------------------------- 1. sounds with no place of their own ring in the player's room
const unplaced = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const u = g.ut; const T = window.__ut;
  // (Not a tower area: the laser never fires there.)
  const area = T.goTo((x) => x.kind === 'labyrinth' || x.kind === 'battle') || T.goTo((x) => !!x.room && x.kind !== 'tower');
  if (!area) return { skipped: true };
  T.quiet();
  const out = { room: area.room, mix: a.listenerMix };
  // A footstep: a swipe onto a floor cell.
  const dirs = [['north', 0, -1], ['east', 1, 0], ['south', 0, 1], ['west', -1, 0]];
  let stepped = null;
  for (const [d, dx, dy] of dirs) {
    const [cx, cy] = T.world.cellOf([g.playerPos[0] + dx * 3, g.playerPos[1] + dy * 3]);
    if (T.world.isFloor(u.world, cx, cy)) { stepped = d; break; }
  }
  // (captured by family: whichever stone step is chosen)
  const names = ['step_stone_1', 'step_stone_2', 'step_stone_3', 'step_stone_4'];
  const anyStep = new Promise((resolve) => { const orig = a.play.bind(a); a.play = (n, o) => { const v = orig(n, o); if (names.includes(n)) { a.play = orig; resolve(v); } return v; }; });
  T.go(stepped || 'north');
  const sv = await anyStep;
  out.step = sv ? { taps: sv.wet && sv.wet.taps ? sv.wet.taps.size : 0, mix: sv.areaMix, ...(await T.measure(sv, area.id)) } : null;
  // The countdown's beep, as the frame plays it.
  u.worldTime = 4.9; u.lastCount = -1;
  const cdP = T.capture('countdown_high');
  g.updateUltimateMode(1 / 30);
  const cd = await cdP;
  u.worldTime = 170;
  out.countdown = cd ? { taps: cd.wet && cd.wet.taps ? cd.wet.taps.size : 0, ...(await T.measure(cd, area.id)) } : null;
  // The ammo chime, taken by stepping onto a cartridge in the cell ahead.
  const [sx, sy] = dirs.find(([d]) => d === (stepped || 'north')).slice(1);
  const ahead = [g.playerPos[0] + sx * 3, g.playerPos[1] + sy * 3];
  const [acx, acy] = T.world.cellOf(ahead);
  let ammo = null; let ammoSync = null;
  if (T.world.isFloor(u.world, acx, acy)) {
    const p = { kind: 'ammo', area, safe: false, pos: ahead, shots: 4, beacon: 'ammo_beacon', gain: 0.55 };
    u.pickups.push(p);
    let playedAt = null; const orig = a.play.bind(a); let got = null;
    a.play = (n, o) => { const v = orig(n, o); if (n === 'ammo' && !got) { got = v; playedAt = performance.now(); } return v; };
    const before = performance.now();
    T.go(stepped || 'north');
    const after = performance.now();
    a.play = orig;
    ammoSync = got ? { withinInput: playedAt >= before && playedAt <= after, ms: playedAt - before } : { withinInput: false, ms: null };
    ammo = got ? { taps: got.wet && got.wet.taps ? got.wet.taps.size : 0, ...(await T.measure(got, area.id)) } : null;
  }
  out.ammo = ammo; out.ammoSync = ammoSync;
  // The laser.
  u.ammo = 10;
  const lp = T.capture('laser');
  g.input('space');
  const lv = await lp;
  out.laser = lv ? { taps: lv.wet && lv.wet.taps ? lv.wet.taps.size : 0, ...(await T.measure(lv, area.id)) } : null;
  return out;
});
const rings = (r) => r && r.taps >= 1 && r.wet > 0.001 && r.dry > 0.005 && r.send / r.dry > 0.1;   // (by its share of the sound: under load the analyser can catch less of a short sound, echo and all, so absolute levels wander; a silent echo reads 0 and sends 0)
check(unplaced.skipped || (unplaced.mix && Object.keys(unplaced.mix).length >= 1), 'the engine knows the echo mix where the player stands: ' + JSON.stringify(unplaced.mix));
check(unplaced.skipped || rings(unplaced.step), `a footstep rings in the room (${unplaced.room}): ` + JSON.stringify(unplaced.step));
check(unplaced.skipped || rings(unplaced.countdown), 'the countdown beep rings in the room: ' + JSON.stringify(unplaced.countdown));
check(unplaced.skipped || unplaced.ammo === null || rings(unplaced.ammo), 'the ammo chime rings in the room: ' + JSON.stringify(unplaced.ammo));
check(unplaced.skipped || unplaced.ammoSync === null || (unplaced.ammoSync.withinInput && unplaced.ammoSync.ms < 20), 'a cartridge is taken, and its chime played, in the same swipe that steps onto it: ' + JSON.stringify(unplaced.ammoSync));
check(unplaced.skipped || rings(unplaced.laser), 'the laser rings in the room: ' + JSON.stringify(unplaced.laser));

// --------------------------------------------------------------- 2. backgrounds ring lightly; an island's shore does not
const backgrounds = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const u = g.ut; const T = window.__ut;
  const out = {};
  for (const kind of ['labyrinth', 'battle', 'tower', 'event', 'island']) {
    await T.ensureKind(kind);
    const area = T.goTo((x) => x.kind === kind);
    if (!area) { out[kind] = { skipped: true }; continue; }
    T.quiet();
    g.updateUltimateMode(1 / 30);          // starts the area's air
    await new Promise((r) => setTimeout(r, 700));  // past its fade-in
    const s = u.areaSounds.get(area.id);
    const v = s && s.ambIn;
    if (!v) { out[kind] = { noVoice: true }; continue; }
    const m = area.room ? await T.measure(v, area.id, 1500) : { wet: 0, dry: 0 };   // (a sparse background, drips, needs a while)
    out[kind] = { name: v.name, sendLevel: v.send, taps: v.wet && v.wet.taps ? v.wet.taps.size : 0, room: area.room, stretch: area.stretch, vol: v.l, ...m };
  }
  return out;
});
for (const kind of ['labyrinth', 'battle', 'tower', 'event']) {
  const b = backgrounds[kind];
  check(!b || b.skipped || (Math.abs(b.sendLevel - 0.15) < 1e-6 && b.taps >= 1 && b.wet > 0.001 && b.dry > 0.002 && b.send > b.dry * 0.05 && b.send < b.dry * 0.4), `a ${kind} area's background rings lightly in its own room: ` + JSON.stringify(b));
}
check(!backgrounds.island || backgrounds.island.skipped || (backgrounds.island.sendLevel === 0 && backgrounds.island.taps === 0 && !backgrounds.island.room), 'an island\'s shore has no echo: ' + JSON.stringify(backgrounds.island));

// --------------------------------------------------------------- 3. a safe zone's room is sized to its background; its walls ring softer
const safeRooms = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const u = g.ut; const T = window.__ut;
  const { backgroundRoom, SAFE_WALL_SEND, EVENT_BACKGROUNDS } = T.mod;
  // Every background has a room, and the sizes are as described.
  const table = {};
  for (const stem of EVENT_BACKGROUNDS) table[stem] = backgroundRoom(stem);
  const big = ['evt_amb_cathedral', 'evt_amb_cave_drips', 'evt_amb_ice_cave'].map((s) => table[s]);
  const small = ['evt_amb_kitchen', 'evt_amb_library', 'evt_amb_tavern'].map((s) => table[s]);
  const open = ['evt_amb_rain', 'evt_amb_forest_night', 'evt_amb_ocean_night'].map((s) => table[s]);
  // The safe zone in this world: its bus's impulse is its room's, stretched.
  const area = T.goTo((x) => x.kind === 'event'); const w = u.world;
  let bus = null; let wall = null;
  if (area) {
    const b = a.areaBuses.get(area.id);
    const ir = b && b.conv && b.conv.buffer;
    const plain = a.irBuffers.get(area.room + '#0');
    bus = { room: area.room, stretch: area.stretch, seconds: ir ? ir.duration : null, plain: plain ? plain.duration : null };
    // A wall in the safe zone: the wall's echo level is the softer one.
    const dirs = [['north', 0, -1], ['east', 1, 0], ['south', 0, 1], ['west', -1, 0]];
    // Stand on a floor cell of the safe zone next to a wall, and step into the wall.
    const W = T.world; let spot = null;
    for (const [cx, cy] of area.floorCells) {
      const d = dirs.find(([, dx, dy]) => !w.floor.has(W.key(cx + dx, cy + dy)));
      if (d) { spot = [[cx, cy], d[0]]; break; }
    }
    if (spot) {
      g.playerPos = W.posOf(spot[0][0], spot[0][1]); g._utListenerMix();
      const wp = T.capture('wall');
      T.go(spot[1]);
      const wv = await wp;
      wall = wv ? { send: wv.send, taps: wv.wet && wv.wet.taps ? wv.wet.taps.size : 0 } : { missing: true };
    }
  }
  return { bigOk: big.every(([r, s]) => r === 'cathedral' && s >= 0.9), smallOk: small.every(([r, s]) => r === 'tower' && s <= 0.9), openOk: open.every(([r, s]) => r === 'hall' && s <= 0.6), bus, wall, SAFE_WALL_SEND };
});
check(safeRooms.bigOk && safeRooms.smallOk && safeRooms.openOk, 'cathedral, cave and ice cave are large rooms; kitchen, library and tavern small; rain, forest and ocean a short open-air tail');
check(!safeRooms.bus || (safeRooms.bus.seconds && safeRooms.bus.plain && Math.abs(safeRooms.bus.seconds - safeRooms.bus.plain * Math.round(safeRooms.bus.stretch * 20) / 20) < 0.1), 'the safe zone\'s echo is its room\'s impulse, stretched to size: ' + JSON.stringify(safeRooms.bus));
check(safeRooms.wall && !safeRooms.wall.missing && (Math.abs(safeRooms.wall.send - safeRooms.SAFE_WALL_SEND) < 1e-6 && safeRooms.wall.taps >= 1), `a safe zone's wall rings softer (send ${safeRooms.SAFE_WALL_SEND}): ` + JSON.stringify(safeRooms.wall));

// --------------------------------------------------------------- 4. a neighbour's air is never stopped and restarted by a border crossing
const hysteresis = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const u = g.ut; const T = window.__ut; const W = T.world;
  const w = u.world;
  // Find areas A and B that border each other, and an area C that borders A but not B.
  const bordersOf = (x) => new Set(x.borders.map((b) => (b.a === x.id ? b.b : b.a)));
  let found = null;
  for (const A of w.areas) {
    for (const bId of bordersOf(A)) {
      const B = w.areas[bId];
      for (const cId of bordersOf(A)) {
        if (cId === bId) continue;
        if (!bordersOf(B).has(cId)) { found = [A, B, w.areas[cId]]; break; }
      }
      if (found) break;
    }
    if (found) break;
  }
  if (!found) return { skipped: true };
  const [A, B, C] = found;
  // Stand in A at its border with B, on the walkable route to B.
  const bd = A.borders.find((b) => (b.a === A.id && b.b === B.id) || (b.b === A.id && b.a === B.id));
  // Use the compass route machinery to get adjacent floor cells across the border.
  // (A border's open cells belong to the west or north area, so the crossing
  // step may start from one of those.)
  let pair = null;
  for (const k0 of w.floor) {
    if (w.cellArea.get(k0) !== A.id) continue;
    const [cx, cy] = k0.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = W.key(cx + dx, cy + dy);
      if (w.floor.has(k) && w.cellArea.get(k) === B.id && W.areaAt(w, W.posOf(cx, cy)) === A && W.areaAt(w, W.posOf(cx + dx, cy + dy)) === B) { pair = [[cx, cy], [cx + dx, cy + dy], dx, dy]; break; }
    }
    if (pair) break;
  }
  if (!pair) return { skipped: true, why: 'no crossing' };
  const [from, , dx, dy] = pair;
  u.area = A; g.playerPos = W.posOf(from[0], from[1]); g._utRefreshRooms(); g._utListenerMix(); u.safe = 0;
  T.quiet();
  g.updateUltimateMode(1 / 30);
  await new Promise((r) => setTimeout(r, 100));
  const before = u.areaSounds.get(C.id);
  const cVoice = before && before.amb;
  const dir = dx === 1 ? 'east' : dx === -1 ? 'west' : dy === 1 ? 'south' : 'north';
  T.go(dir);
  g.updateUltimateMode(1 / 30);
  await new Promise((r) => setTimeout(r, 100));
  const after = u.areaSounds.get(C.id);
  const cSlots = Math.max(Math.abs(C.ax - B.ax), Math.abs(C.ay - B.ay));
  return {
    crossed: u.area === B, hadC: !!cVoice, keptC: !!(after && after.amb === cVoice), stillRunning: !!(cVoice && !cVoice.stopped && !cVoice.fadingOut),
    cLevel: after && after.amb ? after.amb.l : null, cSlots, kinds: [A.kind, B.kind, C.kind],
  };
});
check(hysteresis.skipped || (hysteresis.crossed && hysteresis.hadC && hysteresis.keptC && hysteresis.stillRunning), 'crossing from A into B keeps the air of C (A\'s other neighbour) running, the same voice, not stopped: ' + JSON.stringify(hysteresis));
check(hysteresis.skipped || hysteresis.cLevel === 0, 'and C, no neighbour of B, is kept silent, not heard: level ' + hysteresis.cLevel);

// --------------------------------------------------------------- 5. the elevator and the seabed, as in Island Mode
const island = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const u = g.ut; const T = window.__ut; const W = T.world;
  await T.ensureKind('island');
  const isl = u.world.areas.find((x) => x.kind === 'island');
  if (!isl) return { skipped: true };
  u.area = isl; u.safe = 0;
  g.playerPos = W.posOf(isl.elevator[0], isl.elevator[1] + 1); g._utRefreshRooms(); g._utListenerMix();
  // (Every ride begun and every ride recording played from here on is noted: a
  // failure below then says what happened.)
  const rides = []; const startRide = g._utStartRide;
  g._utStartRide = (dir) => { rides.push(`${dir} at ${a.ctx.currentTime.toFixed(2)} from ${u.place}`); return startRide.call(g, dir); };
  u.liftArmed = false; g.updateUltimateMode(1 / 30);
  T.go('north'); g.updateUltimateMode(1 / 30);
  const inCar = u.place;
  // In the car: swipes, the shot and the throw make no sound at all; a hold speaks.
  const played = []; const orig = a.play.bind(a); a.play = (n, o) => { played.push(n); return orig(n, o); };
  const spoken = []; const os = g.tts.speak.bind(g.tts); g.tts.speak = (t, o) => { spoken.push(t); return os(t, o); };
  const facedInCar = u.face;
  for (const d of ['up', 'down', 'left', 'right', 'turn_left_start', 'turn_end', 'space', 'enter']) g.input(d);
  g.input('hold');
  const compassInCar = u.compass.on;
  const turnedInCar = u.face !== facedInCar || !!u.turn;
  const playedInCar = played.slice(); played.length = 0;
  // Down to the seabed.
  for (let i = 0; i < 30 * 40 && u.place === 'ride'; i++) { g.updateUltimateMode(1 / 30); if (i % 30 === 0) await new Promise((r) => setTimeout(r, 5)); }   // (the ride recording may need decoding again)
  const onSeabed = u.place;
  // Walk to the seabed's edge: the boundary buzz, never a wall.
  let edgeSound = null; const trail = [];
  for (let i = 0; i < 40 && !edgeSound; i++) {
    played.length = 0;
    T.go('west');
    trail.push([g.playerPos.slice(), u.place, g.state, played.slice()]);
    const s = played.find((n) => n === 'boundary' || n === 'wall');
    if (s) edgeSound = s;
  }
  const stepsOnSeabed = played.filter((n) => /^step_/.test(n)).length;
  // Island Mode's seabed: the ride recording is eased out by arrival, the way up
  // hums where it stands, and your own bubbles come now and then.
  await new Promise((r) => setTimeout(r, 300));
  const rideStill = [...a.live].filter((v) => v.name === 'elevator_ride' && v.busy).length;
  const rideVoices = [...a.live].filter((v) => v.name === 'elevator_ride' && v.busy).map((v) => ({ fading: !!v.fadingOut, paused: v.paused, begun: !!v.dry, age: a.ctx.currentTime - (v.startedAt || 0), now: a.ctx.currentTime.toFixed(2), place: u.place, rides: rides.slice(), worldNo: u.worldNo, phase: u.phase, log: T.rideLog.slice(-4) }));
  const seabedHum = u.seabed && u.seabed.hum && !u.seabed.hum.stopped ? u.seabed.hum.l : null;
  const br = u.seabed && u.seabed.breath;
  const breathing = br ? { name: br.name, loop: br.loop, level: br.l, send: br.send, wet: !!br.wet, busy: br.busy, placed: br.placed } : null;
  played.length = 0;
  for (let i = 0; i < 30 * 6; i++) g.updateUltimateMode(1 / 30);
  const bubbles = played.filter((n) => n === 'bubbles').length;
  // Back to the way up and ride to the surface: the water and the seabed's hum go
  // with it, and Island Mode's arrival grace holds for a moment.
  const W2 = T.world;
  const [ex, ey] = u.seabed.origin;
  g.playerPos = W2.posOf(ex + 1, ey); u.liftArmed = true;
  T.go('west');
  g.updateUltimateMode(1 / 30);
  const rodeUp = u.place;
  for (let i = 0; i < 30 * 40 && u.place === 'ride'; i++) { g.updateUltimateMode(1 / 30); if (i % 30 === 0) await new Promise((r) => setTimeout(r, 5)); }
  const backUp = u.place;
  const safeAfter = u.safe;
  const outCell = W2.cellOf(g.playerPos);
  const outSteps = Math.hypot(outCell[0] - isl.elevator[0], outCell[1] - isl.elevator[1]);
  const outOnSand = isl.floorCells.some(([x, y]) => x === outCell[0] && y === outCell[1]);
  // (Web 4.0.0: you step out with your back to the lift, squared up.)
  const outFacing = g.playerFacing.slice();
  const outWay = [g.playerPos[0] - isl.elevator[0] * 3, g.playerPos[1] - isl.elevator[1] * 3];
  const outAway = (outFacing[0] * outWay[0] + outFacing[1] * outWay[1]) / (Math.hypot(outWay[0], outWay[1]) || 1);
  const outSquare = Number.isInteger(Math.round(u.face / (Math.PI / 2) * 1e6) / 1e6);
  // One step back toward the lift does not ride you down unless it lands on the lift.
  const outArmed = u.liftArmed;
  // The rule itself, many times over, with chasers on the island: a few steps
  // out, on the sand, never on a pickup, clear of the chasers wherever possible.
  const rule = [];
  for (let i = 0; i < 60; i++) {
    const pos = g._utArrivalPos(isl);
    const c = W2.cellOf(pos);
    const near = Math.min(Infinity, ...u.enemies.filter((e) => e.area === isl).map((e) => Math.hypot(g._utEnemyPos(e)[0] - pos[0], g._utEnemyPos(e)[1] - pos[1])));
    const onPickup = u.pickups.some((p) => p.area === isl && Math.hypot(p.pos[0] - pos[0], p.pos[1] - pos[1]) < 3.2);
    rule.push({ steps: Math.hypot(c[0] - isl.elevator[0], c[1] - isl.elevator[1]), sand: isl.floorCells.some(([x, y]) => x === c[0] && y === c[1]), near, onPickup });
  }
  await new Promise((r) => setTimeout(r, 300));
  const waterLeft = [...a.live].filter((v) => v.name === 'underwater' && v.busy).length;
  await new Promise((r) => setTimeout(r, 700));
  const breathLeft = [...a.live].filter((v) => v.name === 'ut_diver_breathing' && v.busy).length;
  a.play = orig; g.tts.speak = os;
  g._utStartRide = startRide;
  return { inCar, playedInCar, spoken, compassInCar, turnedInCar, onSeabed, edgeSound, stepsOnSeabed, trail: trail.slice(0, 12), rideStill, rideVoices, seabedHum, breathing, bubbles, rodeUp, backUp, safeAfter, waterLeft, breathLeft, outSteps, outOnSand, outFacing, outAway, outSquare, outArmed, rule, chasers: u.enemies.filter((e) => e.area === isl).length };
});
check(island.skipped || island.rideStill === 0, `the ride recording is eased out by the time you arrive (${island.rideStill} still playing${island.rideStill ? ': ' + JSON.stringify(island.rideVoices) : ''})`);
check(island.skipped || (island.seabedHum !== null && island.seabedHum > 0), `on the seabed the way up hums where it stands (level ${island.seabedHum && island.seabedHum.toFixed(2)})`);
check(island.skipped || (island.breathing && island.breathing.loop && island.breathing.busy && Math.abs(island.breathing.level - 0.85) < 0.01 && island.breathing.send === 0 && !island.breathing.wet && !island.breathing.placed), 'on the seabed the diver\'s breathing loops all round you, with no echo: ' + JSON.stringify(island.breathing));
check(island.skipped || island.bubbles >= 1, `your own bubbles come now and then on the seabed (${island.bubbles} in six seconds)`);
check(island.skipped || (island.rodeUp === 'ride' && island.backUp === 'world' && island.safeAfter >= 2.5 && island.waterLeft === 0 && island.breathLeft === 0), 'the ride up lands you on the island with Island Mode\'s arrival grace, the water and the breathing left behind: ' + JSON.stringify({ rodeUp: island.rodeUp, backUp: island.backUp, safe: island.safeAfter, waterLeft: island.waterLeft, breathLeft: island.breathLeft }));
check(island.skipped || (island.outOnSand && island.outSteps >= 4 && island.outSteps <= 6), `back up, you step out on the sand a few steps from the lift, as in Island Mode (${island.outSteps && island.outSteps.toFixed(1)} steps)`);
check(island.skipped || (island.outSquare && island.outAway >= 0.7), `and with your back to the lift, squared up, so walking on takes you away from it (facing ${JSON.stringify(island.outFacing)}, ${island.outAway && island.outAway.toFixed(2)} of it away from the lift)`);
check(island.skipped || island.rule.every((r) => r.sand && r.steps >= 4 && r.steps <= 6 && !r.onPickup), 'every step-out square is sand, 4 to 6 steps from the lift, never a pickup\'s square (60 draws)');
check(island.skipped || island.chasers === 0 || island.rule.filter((r) => r.near >= 12).length >= 54, `the step-out square keeps clear of the chasers (${island.chasers} on the island; ${island.rule ? island.rule.filter((r) => r.near >= 12).length : 0} of 60 at least four steps from every one)`);
check(!island.skipped, 'a world with an island was found');

// The island elevator's hum belongs to its island: silent from a neighbouring area,
// however near the border, and heard once you are on the island.
const hum = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__ut; const W = T.world;
  if (!u.world) return { skipped: 'no run' };
  await T.ensureKind('island');
  const isl = u.world.areas.find((x) => x.kind === 'island');
  if (!isl) return { skipped: 'no island' };
  const bd = isl.borders.find((b) => b.a === isl.id || b.b === isl.id);
  if (!bd) return { skipped: 'no neighbour' };
  const nb = u.world.areas.find((x) => x.id === (bd.a === isl.id ? bd.b : bd.a));
  const lp = W.posOf(isl.elevator[0], isl.elevator[1]);
  const near = nb.floorCells.map(([x, y]) => W.posOf(x, y)).reduce((b, p) => (Math.hypot(p[0] - lp[0], p[1] - lp[1]) < Math.hypot(b[0] - lp[0], b[1] - lp[1]) ? p : b));
  u.place = 'world'; u.safe = 99;
  const at = (area, pos) => { u.area = area; g.playerPos = pos; g._utRefreshRooms(); g._utListenerMix(); for (let i = 0; i < 6; i++) g.updateUltimateMode(1 / 30); };
  at(nb, near);
  const s = u.areaSounds.get(isl.id);
  const outside = s && s.hum ? s.hum.l : null;
  const fromLift = Math.hypot(near[0] - lp[0], near[1] - lp[1]) / 3;
  // On the island, the same distance from the lift.
  const inCell = isl.floorCells.map(([x, y]) => W.posOf(x, y)).find((p) => Math.abs(Math.hypot(p[0] - lp[0], p[1] - lp[1]) / 3 - Math.min(fromLift, 14)) < 1);
  at(isl, inCell || W.posOf(isl.elevator[0], isl.elevator[1] + 3));
  const inside = s && s.hum ? s.hum.l : null;
  return { outside, inside, fromLift, nb: nb.kind };
});
check((hum.skipped && hum.skipped !== 'no run') || (hum.outside === 0 && hum.inside > 0), `the island elevator's hum is silent from the ${hum.nb || 'next'} area beside the island (${hum.fromLift ? hum.fromLift.toFixed(1) : '?'} steps from the lift: ${hum.outside}) and heard on the island (${hum.inside && hum.inside.toFixed(2)})` + (hum.skipped ? ' [skipped: ' + hum.skipped + ']' : ''));
check(island.skipped || (island.inCar === 'ride' && island.playedInCar.length === 0), 'in the elevator car every swipe, the shot and the throw are silent (Island Mode): played ' + JSON.stringify(island.playedInCar));
check(island.skipped || (island.compassInCar === false && island.spoken.some((t) => /Compass not available in the elevator/.test(t))), 'a hold in the car says the compass is not available there: ' + JSON.stringify(island.spoken));
check(island.skipped || island.turnedInCar === false, 'and in the car you cannot turn: a swipe to the side and a held turn do nothing');
check(island.skipped || (island.onSeabed === 'seabed' && island.edgeSound === 'boundary'), `the seabed's edge is the boundary buzz, not a wall (${island.edgeSound})` + (island.edgeSound === 'boundary' ? '' : ' ' + JSON.stringify(island.trail)));
check(island.skipped || island.stepsOnSeabed === 0, 'the seabed makes no sound underfoot');

// --------------------------------------------------------------- 6. one cartridge, one beacon
const beacons = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const u = g.ut;
  const T = window.__ut;
  if (u.place !== 'world') { u.place = 'world'; u.ride = null; u.seabed = null; u.rideMix = null; }
  const area = T.goTo((x) => x.kind === 'battle') || T.goTo((x) => x.kind !== 'event');
  T.quiet();
  u.pickups = u.pickups.filter((p) => p.area !== area);
  const p = { kind: 'ammo', area, safe: false, pos: [g.playerPos[0] + 9, g.playerPos[1]], shots: 4, beacon: 'ammo_beacon', gain: 0.55 };
  u.pickups.push(p);
  for (let i = 0; i < 10; i++) g.updateUltimateMode(1 / 30);
  await new Promise((r) => setTimeout(r, 300));
  const voices = [...a.live].filter((v) => v.name === 'ammo_beacon');
  return { voices: voices.length, sources: voices.map((v) => v.sources.length), taps: voices.map((v) => v.wet && v.wet.taps ? v.wet.taps.size : 0) };
});
check(beacons.voices === 1 && beacons.sources.every((n) => n <= 2), `one cartridge in earshot: one beacon voice (${beacons.voices}), its dry and dull sources only (${beacons.sources})`);

// The cartridges of a new world are spread one to an area before any area gets two,
// and a beacon's echo in a stretched room is held to the plain room's.
const spread = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio;
  const counts = [];
  for (let n = 0; n < 4; n++) {
    u.worldTime = 0.05;
    for (let i = 0; i < 30 * 2; i++) g.updateUltimateMode(1 / 30);
    const per = new Map();
    for (const p of u.pickups.filter((x) => x.kind === 'ammo' && !x.safe)) per.set(p.area.id, (per.get(p.area.id) || 0) + 1);
    const dangerous = u.world.areas.filter((x) => x.kind !== 'event').length;
    const total = [...per.values()].reduce((x, y) => x + y, 0);
    counts.push({ total, dangerous, max: Math.max(...per.values()), areasWithOne: per.size });
    await new Promise((r) => setTimeout(r, 30));
  }
  // The beacon's tap into a stretched battle room.
  const T = window.__ut;
  await T.ensureKind('battle');
  const area = T.goTo((x) => x.kind === 'battle' && x.stretch > 1.05);
  let tap = null;
  if (area) {
    T.quiet();
    const p = { kind: 'ammo', area, safe: false, pos: [g.playerPos[0] + 6, g.playerPos[1]], shots: 4, beacon: 'ammo_beacon', gain: 0.55 };
    u.pickups.push(p);
    for (let i = 0; i < 5; i++) g.updateUltimateMode(1 / 30);
    await new Promise((r) => setTimeout(r, 400));
    const v = p.voice; const bus = a.areaBuses.get(area.id);
    const t = v && v.wet && v.wet.taps ? v.wet.taps.get(area.id) : null;
    tap = t ? { gain: t.gain.value, want: v.areaMix[area.id], stretch: bus.stretch } : null;
  }
  return { counts, tap };
});
check(spread.counts.every((c) => c.total <= c.dangerous ? c.max === 1 : c.max <= Math.ceil(c.total / c.dangerous)), 'a new world spreads its cartridges one to an area before any area gets two: ' + JSON.stringify(spread.counts));
check(spread.tap && spread.tap.gain < spread.tap.want / spread.tap.stretch + 0.02, 'a beacon\'s echo in a stretched room is held to the plain room\'s: ' + JSON.stringify(spread.tap));

// --------------------------------------------------------------- 7. a regeneration with no gap
const regen = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio;
  const w1 = u.world;
  u.worldTime = 0.05;
  const phases = [];
  let loopsRightAfter = null;
  for (let i = 0; i < 30 * 3; i++) {
    g.updateUltimateMode(1 / 30);
    phases.push(u.phase);
    if (u.world !== w1 && loopsRightAfter === null) { await new Promise((r) => setTimeout(r, 120)); loopsRightAfter = [...a.live].filter((v) => v.loop).length; }
  }
  return { newWorld: u.world !== w1, phases: [...new Set(phases)], loopsRightAfter, worldTime: u.worldTime };
});
check(regen.newWorld && !regen.phases.includes('silence') && regen.loopsRightAfter >= 1, 'at zero the next world is there at once, its air already running: ' + JSON.stringify(regen));

// --------------------------------------------------------------- 8. reach, tower items, the rivals' ramp, the arena crowd (Russell's third report)
const third = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio; const T = window.__ut; const W = T.world;
  const { EVENT_BACKGROUNDS, BATTLE_CROWD, PICKUP_REACH, ITEM_NEAR } = T.mod;
  const out = { poolHasCrowd: EVENT_BACKGROUNDS.includes(BATTLE_CROWD), reach: PICKUP_REACH };
  // A cartridge is taken from the square beside it, not only its own; not from the diagonal.
  await T.ensureKind('battle');
  const area = T.goTo((x) => x.kind === 'battle');
  u.pickups = u.pickups.filter((p) => p.area !== area);
  const here = g.playerPos.slice();
  const side = { kind: 'ammo', area, safe: false, pos: [here[0] + 3, here[1]], shots: 2, beacon: 'ammo_beacon', gain: 0.55 };
  const diag = { kind: 'ammo', area, safe: false, pos: [here[0] - 3, here[1] - 3], shots: 2, beacon: 'ammo_beacon', gain: 0.55 };
  u.pickups.push(side, diag);
  const ammo0 = u.ammo;
  g._utUpdatePickups();
  out.sideTaken = !u.pickups.includes(side); out.diagLeft = u.pickups.includes(diag); out.gained = u.ammo - ammo0;
  u.pickups = u.pickups.filter((p) => p !== diag);
  // A tower item appears 12 to 30 units from you while you are in its area.
  await T.ensureKind('tower');
  const tw = T.goTo((x) => x.kind === 'tower');
  const dists = [];
  for (let i = 0; i < 12; i++) { g._utSpawnTowerItem(tw); const it = u.towerItems.get(tw.id); if (it) dists.push(W.dist2 ? 0 : Math.hypot(g._utItemPos(it)[0] - g.playerPos[0], g._utItemPos(it)[1] - g.playerPos[1])); }
  out.itemDists = dists.map((d) => Math.round(d));
  out.itemsNear = dists.length === 12 && dists.every((d) => d >= ITEM_NEAR[0] - 0.01 && d <= ITEM_NEAR[1] + 0.01);
  // The rival's ramp: difficulty and hits at ten minutes.
  const el0 = u.elapsed;
  u.elapsed = 600;
  out.diff10 = g._utThrowerDifficulty();
  const e = g._utSpawnEnemy(tw);
  out.hits10 = e ? e.hitsNeeded : null;
  if (e) { u.enemies.splice(u.enemies.indexOf(e), 1); }
  u.elapsed = 300;
  out.diff5 = g._utThrowerDifficulty();
  const e5 = g._utSpawnEnemy(tw);
  out.hits5 = e5 ? e5.hitsNeeded : null;
  if (e5) u.enemies.splice(u.enemies.indexOf(e5), 1);
  u.elapsed = 60 * 120;
  out.diffMax = g._utThrowerDifficulty();
  u.elapsed = 30;
  const e2 = g._utSpawnEnemy(tw);
  out.hitsStart = e2 ? e2.hitsNeeded : null;
  if (e2) u.enemies.splice(u.enemies.indexOf(e2), 1);
  u.elapsed = el0;
  // The crowd: every battle area has one, under its drone and drums, in its room.
  await T.ensureKind('battle');
  const barea = T.goTo((x) => x.kind === 'battle');
  T.quiet();
  g.updateUltimateMode(1 / 30);
  await new Promise((r) => setTimeout(r, 800));
  const s = barea && u.areaSounds.get(barea.id);
  out.crowd = s && s.crowdIn ? { name: s.crowdIn.name, level: s.crowdIn.l, send: s.crowdIn.send, placedToo: !!s.crowd } : null;
  out.everyBattleHasCrowd = u.world.areas.filter((x) => x.kind === 'battle').every((x) => !!x.crowd);
  out.safeZonesWithout = u.world.areas.filter((x) => x.kind === 'event').every((x) => !/stadium_crowd/.test(x.ambience));
  return out;
});
check(third.sideTaken && third.diagLeft && third.gained === 2, `a cartridge is taken from the square beside it, not from the diagonal (reach ${third.reach})`);
check(third.itemsNear, 'a tower item appears 12 to 30 units from you, as on a tower floor: ' + JSON.stringify(third.itemDists));
check(third.diff10 === 6 && third.hits10 === 3 && third.hitsStart === 1 && third.diff5 === 3 && third.hits5 === 2 && third.diffMax === 20, `the rival grows hard slowly (Russell, 9 Nov): difficulty 3 and 2 hits at five minutes, 6 and 3 hits at ten (14 and 6 before), 1 hit at the start, never above 20: ${third.diff5}/${third.hits5}, ${third.diff10}/${third.hits10}, ${third.hitsStart}, ${third.diffMax}`);
// The crowd erupts right after the bang of a chaser going down in a battle area.
const roar = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio; const T = window.__ut;
  await T.ensureKind('battle');
  const area = T.goTo((x) => x.kind === 'battle');
  if (!area) return { skipped: true };
  const played = []; const orig = a.play.bind(a);
  a.play = (n, o) => { played.push([n, performance.now(), o || {}]); return orig(n, o); };
  const e = g._utSpawnEnemy(area) || u.enemies.find((x) => x.area === area && x.kind === 'chaser');
  if (!e) { a.play = orig; return { skipped: true }; }
  e.x = g.playerPos[0]; e.y = g.playerPos[1] - 6;
  g._utKillEnemy(e, 'laser');
  await new Promise((r) => setTimeout(r, 1500));
  a.play = orig;
  const bang = played.find(([n]) => n === 'explosion'); const cheer = played.find(([n]) => /^ut_crowd_roar_/.test(n));
  // Seven roars, all in the pack, never the same twice running.
  const roars = T.mod.ROARS.filter((n) => a.has(n)).length;
  const picks = []; for (let i = 0; i < 40; i++) picks.push(g._utFresh(T.mod.ROARS, 'lastRoar'));
  const roarVariety = { inPack: roars, distinct: new Set(picks).size, repeat: picks.some((n, i) => i > 0 && picks[i - 1] === n) };
  // A kill in a labyrinth draws no roar.
  const lab = T.goTo((x) => x.kind !== 'battle' && x.kind !== 'event');
  let elsewhere = null;
  if (lab) {
    const before = played.length; const spy = []; a.play = (n, o) => { spy.push(n); return orig(n, o); };
    const e2 = { kind: 'chaser', area: lab, x: g.playerPos[0], y: g.playerPos[1] - 6, voice: null };
    u.enemies.push(e2); g._utKillEnemy(e2, 'laser');
    await new Promise((r) => setTimeout(r, 1200));
    a.play = orig; elsewhere = spy.filter((n) => /^ut_crowd_roar_/.test(n)).length;
  }
  return { roarVariety, bang: !!bang, cheer: cheer ? { name: cheer[0], after: cheer[1] - (bang ? bang[1] : 0), placed: !!(cheer[2].pos), volume: cheer[2].volume } : null, elsewhere };
});
check(roar.skipped || (roar.bang && roar.cheer && roar.cheer.after > 250 && roar.cheer.after < 700 && !roar.cheer.placed), 'the crowd erupts about a third of a second after the bang, all round you: ' + JSON.stringify(roar.cheer));
check(roar.skipped || roar.elsewhere === 0, 'a kill outside a battle area draws no roar');
check(roar.skipped || (roar.roarVariety.inPack === 7 && roar.roarVariety.distinct >= 5 && !roar.roarVariety.repeat), `seven roars in the pack (${roar.roarVariety && roar.roarVariety.inPack}), ${roar.roarVariety && roar.roarVariety.distinct} different ones in forty picks, never the same twice running`);
check(!third.poolHasCrowd && third.safeZonesWithout && third.everyBattleHasCrowd && third.crowd && /stadium_crowd/.test(third.crowd.name) && Math.abs(third.crowd.level - 0.8 * 0.55) < 0.02 && third.crowd.placedToo, 'the stadium crowd roars in every battle area, under the drone and drums, and in no safe zone: ' + JSON.stringify(third.crowd));

// --------------------------------------------------------------- 9. the water park
const park = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio; const T = window.__ut; const W = T.world;
  const { WATER_PARK, SLIDE_POINTS, SLIDE_CLIMB, SLIDE_DOWN } = T.mod;
  // Regenerate until a safe zone with a water background exists (its slide with it).
  for (let n = 0; n < 20 && !(u.slides && u.slides.length); n++) {
    u.worldTime = 0.05;
    for (let i = 0; i < 60; i++) g.updateUltimateMode(1 / 30);
    await new Promise((r) => setTimeout(r, 40));
  }
  u.bus = null; u.busAt = null;
  if (!(u.slides && u.slides.length)) return { skipped: true };
  const sl = u.slides[0]; const area = sl.area;
  const out = { kind: area.kind, water: WATER_PARK.test(area.ambience), parksRight: u.world.areas.filter((x) => x.kind === 'event').every((x) => (!!x.waterPark) === WATER_PARK.test(x.ambience)) && u.slides.length === u.world.areas.filter((x) => x.waterPark).length };
  // Stand in the park, a few steps from the slide, on a side whose squares are floor
  // (the slide may stand by a wall or the park's edge): its beacon is Tower's staircase, placed.
  const floor = new Set(area.floorCells.map(([cx, cy]) => `${cx},${cy}`));
  const sc = W.cellOf(sl.pos);
  const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => [1, 2, 3].every((k) => floor.has(`${sc[0] + dx * k},${sc[1] + dy * k}`))) || [1, 0];
  const toward = side[0] === 1 ? 'west' : side[0] === -1 ? 'east' : side[1] === 1 ? 'north' : 'south';
  u.area = area; u.safe = 0; g.playerPos = [sl.pos[0] + side[0] * 9, sl.pos[1] + side[1] * 9]; g._utRefreshRooms(); g._utListenerMix();
  T.quiet();
  g.updateUltimateMode(1 / 30);
  await new Promise((r) => setTimeout(r, 300));
  out.beacon = sl.voice ? { name: sl.voice.name, placed: sl.voice.placed, level: sl.voice.l } : null;
  // Step onto the square beside it: the ride takes over.
  const played = []; const orig = a.play.bind(a); a.play = (n, o) => { played.push(n); return orig(n, o); };
  const spoken = []; const os = g.tts.speak.bind(g.tts); g.tts.speak = (t, o) => { spoken.push(t); return os(t, o); };
  const p0 = u.points; const mult = g._utMultiplier();
  g.playerPos = [sl.pos[0] + side[0] * 6, sl.pos[1] + side[1] * 6]; g._utListenerMix();
  T.go(toward);                            // onto the square beside the slide
  out.started = u.place === 'slide' && u.slide && u.slide.stage === 'climb';
  // Nothing answers on the slide: no step, no shot, no turn, no compass.
  const before = [...g.playerPos]; const faced = u.face;
  for (const d of ['up', 'down', 'left', 'right', 'turn_left_start', 'turn_end', 'space', 'enter']) g.input(d);
  g.input('hold');
  out.heldStill = g.playerPos[0] === before[0] && g.playerPos[1] === before[1] && u.face === faced && !u.turn && !u.compass.on && spoken.some((t) => /Compass not available on the slide/.test(t));
  out.stepSounds = played.filter((n) => /^step_/.test(n)).length;
  out.pauseBlocked = T.mod.default.blockPause(g);
  // Ride it out.
  for (let i = 0; i < 30 * (SLIDE_CLIMB + SLIDE_DOWN + 1) && u.place === 'slide'; i++) g.updateUltimateMode(1 / 30);
  await new Promise((r) => setTimeout(r, 200));
  a.play = orig; g.tts.speak = os;
  out.sounds = { climb: played.includes('stairs_climb'), rush: played.includes('ut_slide'), splash: played.includes('evt_water_splash') };
  out.order = ['stairs_climb', 'ut_slide', 'evt_water_splash'].map((n) => played.indexOf(n));
  out.landed = u.place === 'world' && u.area === area && W.areaAt(u.world, g.playerPos) === area;
  out.away = Math.hypot(g.playerPos[0] - sl.pos[0], g.playerPos[1] - sl.pos[1]);
  out.points = u.points - p0; out.expected = Math.round(SLIDE_POINTS * mult);
  out.slideStays = u.slides.includes(sl);
  return out;
});
check(!park.skipped, 'a world with a water park was found');
check(park.skipped || (park.kind === 'event' && park.water && park.parksRight), 'every safe zone with a water background has a slide, and no other does');
check(park.skipped || (park.beacon && park.beacon.name === 'stairs_beacon' && park.beacon.placed && park.beacon.level > 0.3), 'the slide\'s beacon is Tower Mode\'s staircase, placed where the slide is: ' + JSON.stringify(park.beacon));
check(park.skipped || (park.started && park.heldStill && park.stepSounds <= 1 && park.pauseBlocked), 'stepping beside the slide starts the ride; on it nothing answers (no walking, no shot, no compass, no pause)');
check(park.skipped || (park.sounds.climb && park.sounds.rush && park.sounds.splash && park.order[0] < park.order[1] && park.order[1] < park.order[2]), 'the climb, then the rush, then the splash: ' + JSON.stringify(park.sounds));
check(park.skipped || (park.landed && park.away >= 15 && park.slideStays), `you come up elsewhere in the park (${park.away && park.away.toFixed(1)} units away) and the slide stays to be found again`);
check(park.skipped || park.points === park.expected, `a ride earns ${park.expected} points (15 times the multiplier) even though it is a safe zone: ${park.points}`);

// --------------------------------------------------------------- 10. the bus
const bus = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio; const T = window.__ut; const W = T.world;
  const { BUS_FAR_STEPS, BUS_RIDE, BUS_GO_AT, BUS_STEP_AT, BUS_STEP_GAP, BUS_PULL_STOP } = T.mod;
  // Stand in a dangerous area; the world is young; make the safe zone count as far.
  const area = T.goTo((x) => x.kind !== 'event');
  u.bus = null; u.busElapsed = 30; u.busAt = 25; u.worldTime = 250; u.safe = 0;
  const realSteps = g._utStepsToSafety();
  g._utStepsToSafety = () => 100;
  const played = []; const orig = a.play.bind(a); a.play = (n, o) => { played.push([n, u.busElapsed]); return orig(n, o); };
  g.updateUltimateMode(1 / 30);
  const b = u.bus;
  // First it pulls up, heard where it will stand; the chime comes when it has stopped.
  const pulling = { stage: b && b.stage, sound: played.some(([n]) => n === 'ut_bus_arrive'), voice: !!(b && b.pullVoice && b.pullVoice.placed), chimeYet: played.some(([n]) => n === 'ut_bus_chime') };
  for (let i = 0; b && i < 30 * (BUS_PULL_STOP + 0.3) && b.stage === 'coming'; i++) { g.updateUltimateMode(1 / 30); if (i % 10 === 0) await new Promise((r) => setTimeout(r, 5)); }
  const out = { realSteps, pulling, came: !!b && b.stage === 'waiting', chime: played.some(([n]) => n === 'ut_bus_chime'), ride: b && b.ride, near: b ? Math.hypot(b.pos[0] - g.playerPos[0], b.pos[1] - g.playerPos[1]) : null, outsideSafe: b && b.area.kind !== 'event' };
  if (!b) { a.play = orig; return out; }
  await new Promise((r) => setTimeout(r, 300));
  out.engine = b.voice ? { name: b.voice.name, placed: b.voice.placed, level: b.voice.l } : null;
  // The compass points to the bus while it waits.
  const leg = g._utRouteLeg();
  const busCell = W.cellOf(b.pos); const here = W.cellOf(g.playerPos);
  // (The first leg is a step along the walkable way to the bus: one step that way
  // and the way is one step shorter. In a labyrinth that first step may well be
  // away from the bus as the crow flies, which an older form of this check took
  // for a fault.)
  out.legTowardBus = null;
  if (leg) {
    const r0 = g._utRoute(); const stood = [...g.playerPos];
    g.playerPos = [stood[0] + leg.dir[0] * 3, stood[1] + leg.dir[1] * 3];
    const r1 = g._utRoute();
    g.playerPos = stood;
    out.legTowardBus = r0.target.name === 'the bus' && !!r0.path && (r1.path ? r1.path.length === r0.path.length - 1 : r0.path.length === 1);
  }
  out.routeDbg = (() => { const r = g._utRoute(); const gc = W.cellOf(b.pos); return { t: r.target.name, p: r.path && r.path.length, from: here, goal: gc, goalFloor: W.isFloor(u.world, gc[0], gc[1]), fromFloor: W.isFloor(u.world, here[0], here[1]), place: u.place, stage: b.stage }; })();
  g.input('hold'); out.compassSaid = document.getElementById('said').textContent; g.input('hold');
  // Walk onto it, from a square beside it that is floor (a step is walked now, so
  // it cannot begin inside a wall).
  const bc = W.cellOf(b.pos);
  const beside = [[1, 0, 'west'], [-1, 0, 'east'], [0, 1, 'north'], [0, -1, 'south']].find(([dx, dy]) => W.isFloor(u.world, bc[0] + dx, bc[1] + dy)) || [1, 0, 'west'];
  g.playerPos = W.posOf(bc[0] + beside[0], bc[1] + beside[1]); g._utListenerMix();
  T.go(beside[2]);
  out.boarded = u.place === 'bus' && b.stage === 'boarding';
  const before = [...g.playerPos]; const faced = u.face;
  for (const d of ['up', 'down', 'left', 'right', 'turn_right_start', 'turn_end', 'space', 'enter']) g.input(d);
  out.heldStill = g.playerPos[0] === before[0] && g.playerPos[1] === before[1] && u.face === faced && !u.turn;
  // Ride it out (with yields, for the recordings to decode).
  const total = BUS_GO_AT + b.ride + BUS_GO_AT + 2;
  const boardAt = u.busElapsed;
  let arrivedAt = null; let rideVoice = null; let rideAt = null; let arriveStart = null; let goneAt = null;
  let hpBefore = null; let hpAfter = null; let shBus = 0; let windowsDull = null;
  for (let i = 0; i < 30 * total && u.bus; i++) {
    g.updateUltimateMode(1 / 30);
    if (rideAt === null && u.bus && u.bus.stage === 'riding') rideAt = u.busElapsed;
    if (u.bus && u.bus.stage === 'riding' && u.bus.rideVoice) rideVoice = { name: u.bus.rideVoice.name, loop: u.bus.rideVoice.loop };
    if (u.bus && u.bus.stage === 'riding' && hpBefore === null && u.busElapsed - rideAt > 2) {
      // A chaser at your seat strikes: nothing reaches you on the bus.
      hpBefore = u.hp; u.safe = 0; u.hitCooldown = 0;
      g._utHurt({ kind: 'chaser', area: u.area, x: g.playerPos[0], y: g.playerPos[1], voice: null }); hpAfter = u.hp;
      shBus = u.shBus;
      const s = u.areaSounds.get(u.area.id); windowsDull = s && s.ambIn ? s.ambIn.behind : null;
    }
    if (arriveStart === null && u.bus && u.bus.stage === 'arriving') arriveStart = u.busElapsed;
    if (u.place === 'world' && arrivedAt === null && u.bus && u.bus.stage === 'arriving') arrivedAt = u.busElapsed;
    if (i % 10 === 0) await new Promise((r) => setTimeout(r, 10));
  }
  goneAt = u.bus ? null : u.busElapsed;
  out.boardToRide = rideAt - boardAt; out.offAfter = arrivedAt - arriveStart; out.goneAfter = goneAt - arriveStart;
  out.hpBefore = hpBefore; out.hpAfter = hpAfter; out.shBus = shBus; out.windowsDull = windowsDull;
  out.landedSafe = u.place === 'world' && u.area.kind === 'event' && W.areaAt(u.world, g.playerPos) === u.area;
  // In the safe zone the world beyond sounds further off; out in the open, it comes back.
  for (let i = 0; i < 45; i++) g.updateUltimateMode(1 / 30);
  out.shSafe = u.shSafe;
  const neighbour = u.world.areas.find((x) => x !== u.area && u.areaSounds.get(x.id) && u.areaSounds.get(x.id).amb && u.areaSounds.get(x.id).amb.l > 0);
  out.outsideDull = neighbour ? u.areaSounds.get(neighbour.id).amb.behind : null;
  const ownWide = u.areaSounds.get(u.area.id).ambIn; out.ownDull = ownWide ? ownWide.behind : null;
  if (out.outsideDull === null) {
    // Stand by the safe zone's edge, where a neighbour's air comes through.
    const zone = u.area;
    const edge = zone.floorCells.filter(([cx, cy]) => cx === zone.x0 || cy === zone.y0 || cx === zone.x1 || cy === zone.y1);
    for (const [cx, cy] of edge.filter((_, i) => i % 3 === 0)) {
      g.playerPos = W.posOf(cx, cy); u.area = zone; g._utListenerMix();
      for (let i = 0; i < 3; i++) g.updateUltimateMode(1 / 30);
      const nb = u.world.areas.find((x) => x !== zone && u.areaSounds.get(x.id) && u.areaSounds.get(x.id).amb && u.areaSounds.get(x.id).amb.l > 0.01);
      if (nb) { out.outsideDull = u.areaSounds.get(nb.id).amb.behind; out.outsideLevel = u.areaSounds.get(nb.id).amb.l; break; }
    }
  }
  T.goTo((x) => x.kind !== 'event');
  for (let i = 0; i < 60; i++) g.updateUltimateMode(1 / 30);
  out.shSafeOut = u.shSafe;
  await new Promise((r) => setTimeout(r, 1500));   // (the steps are real-time timers; the ride here ran faster than life)
  a.play = orig;
  const names = played.map(([n]) => n);
  const seq = ['ut_bus_doors_open', 'ut_bus_doors_close', 'ut_bus_doors_open', 'ut_bus_doors_close', 'ut_bus_leave'];
  let at = -1; let inOrder = true;
  for (const n of seq) { const i = names.indexOf(n, at + 1); if (i < 0) { inOrder = false; break; } at = i; }
  out.inOrder = inOrder; out.steps = names.filter((n) => /^step_/.test(n)).length; out.rideVoice = rideVoice;
  out.gone = !u.bus; out.idleLeft = [...a.live].filter((v) => /^ut_bus_(idle|ride)$/.test(v.name) && v.busy && !v.fadingOut).length;
  return out;
});
check(bus.pulling && bus.pulling.stage === 'coming' && bus.pulling.sound && bus.pulling.voice && !bus.pulling.chimeYet, 'the bus is first heard pulling up where it will stand, before any chime: ' + JSON.stringify(bus.pulling));
check(bus.came && bus.chime && bus.outsideSafe && bus.near >= 10 && bus.near <= 40, `when a safe zone is far (${bus.realSteps} steps here, told 100) a bus pulls up near you with its chime: ` + JSON.stringify({ near: bus.near && bus.near.toFixed(1), ride: bus.ride }));
check(bus.ride && Math.abs(bus.ride - (15 + 15 * (100 - 45) / 105)) < 0.01, `the ride's length follows the walk it saves (${bus.ride && bus.ride.toFixed(1)} s for 100 steps)`);
check(bus.engine && bus.engine.name === 'ut_bus_idle' && bus.engine.placed && bus.engine.level > 0.3, 'its engine idles where it stands: ' + JSON.stringify(bus.engine));
check(bus.legTowardBus && /^Compass on\. You are (in|on) .*\. The bus is \d+ steps? away, starting (ahead|right|behind|left)\. /.test(bus.compassSaid), 'the compass points to the waiting bus and says so: ' + bus.compassSaid + ' ' + JSON.stringify(bus.routeDbg));
check(bus.boarded && bus.heldStill, 'stepping up to the bus boards it; on the bus nothing answers');
check(bus.inOrder && bus.steps >= 5 && bus.rideVoice && bus.rideVoice.loop, 'doors open, steps, doors close, the ride from your seat, doors open, steps, doors close, and it drives off: ' + JSON.stringify({ steps: bus.steps, ride: bus.rideVoice }));
check(bus.landedSafe && bus.gone && bus.idleLeft === 0, 'you are left on the floor of the nearest safe zone, the bus gone and its engine with it');
check(bus.boardToRide > 2.8 && bus.boardToRide < 3.6 && bus.offAfter > 1.2 && bus.offAfter < 1.8 && bus.goneAfter < 3.6, `getting on and off is brisk: the ride starts ${bus.boardToRide && bus.boardToRide.toFixed(1)} s after boarding, you are off ${bus.offAfter && bus.offAfter.toFixed(1)} s after the doors open, and the bus is gone at ${bus.goneAfter && bus.goneAfter.toFixed(1)} s`);
check(bus.hpBefore !== null && bus.hpAfter === bus.hpBefore, `no chaser can strike you on the bus (${bus.hpBefore} → ${bus.hpAfter})`);
check(bus.shBus > 0.9 && bus.windowsDull > 0.7, `on the bus the world is dulled, as through the windows (shelter ${bus.shBus && bus.shBus.toFixed(2)}, dull ${bus.windowsDull})`);
check(bus.shSafe > 0.8 && bus.outsideDull !== null && bus.outsideDull > 0.6 && bus.ownDull !== null && bus.ownDull < 0.1, `in a safe zone the world beyond is quieter and dulled, its own air clear (shelter ${bus.shSafe && bus.shSafe.toFixed(2)}, outside ${bus.outsideDull}, own ${bus.ownDull})`);
check(bus.shSafeOut < 0.1, `out in the open again, the world comes back (${bus.shSafeOut && bus.shSafeOut.toFixed(2)})`);

// --------------------------------------------------------------- 11. the crowd reacts to a hit (Russell, 8 Nov; the announcer is gone)
const hits = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio; const T = window.__ut;
  const out = { annNames: [...a.entries.keys()].filter((n) => /^ut_ann_/.test(n)).length, has: a.has('ut_crowd_hit_1') && a.has('ut_crowd_hit_2') };
  await T.ensureKind('battle');
  const area = T.goTo((x) => x.kind === 'battle');
  if (!area) return { skipped: true, ...out };
  // (The arena's own chasers are sent away, so that only the strikes made here
  // are counted: one of them reaching you in the pauses below was a hit more.)
  for (const e of u.enemies) if (e.area === area && e.voice) { e.voice.stop(); u.voices.delete(e.voice); e.voice = null; }
  u.enemies = u.enemies.filter((e) => e.area !== area);
  // (And a strike one of them landed as you arrived has had its reaction.)
  await new Promise((r) => setTimeout(r, 400));
  const foe = { kind: 'chaser', area, x: g.playerPos[0], y: g.playerPos[1] - 6, voice: null };
  const played = []; const orig = a.play.bind(a);
  a.play = (n, o) => { played.push([n, performance.now(), o || {}, a.listenerMix !== null]); return orig(n, o); };
  const strike = () => { u.hp = 100; u.safe = 0; u.hitCooldown = 0; u.place = 'world'; if (u.compass.on) g._utCompassOff(true); g._utHurt(foe); };
  strike();
  await new Promise((r) => setTimeout(r, 700));
  const hit = played.find(([n]) => n === 'player_hit'); const react = played.find(([n]) => /^ut_crowd_hit_/.test(n));
  out.first = react ? { name: react[0], after: react[1] - (hit ? hit[1] : 0), placed: !!react[2].pos, volume: react[2].volume, room: react[3] } : null;
  // Many hits: the groan and the gasp both come, one to a hit.
  for (let i = 0; i < 16; i++) strike();
  await new Promise((r) => setTimeout(r, 600));
  const names = played.filter(([n]) => /^ut_crowd_hit_/.test(n)).map(([n]) => n);
  out.count = names.length; out.distinct = new Set(names).size; out.repeat = names.some((n, i) => i > 0 && names[i - 1] === n);
  // Not outside a battle area.
  const lab = T.goTo((x) => x.kind !== 'battle' && x.kind !== 'event');
  if (lab) {
    const before = played.filter(([n]) => /^ut_crowd_hit_/.test(n)).length;
    foe.area = lab; strike();
    await new Promise((r) => setTimeout(r, 600));
    out.elsewhere = played.filter(([n]) => /^ut_crowd_hit_/.test(n)).length - before;
  }
  // The fatal hit in an arena: the crowd reacts with it, and Game Over comes at once.
  T.goTo((x) => x.kind === 'battle'); foe.area = u.area;
  const k = played.length;
  u.hp = 1; u.safe = 0; u.hitCooldown = 0; g._utHurt(foe);
  out.overAtOnce = g.state === 'game_over';
  out.fatalReact = played.slice(k).some(([n]) => /^ut_crowd_hit_/.test(n));
  a.play = orig;
  return out;
});
check(hits.annNames === 0 && hits.has, `the announcer's lines are gone from the pack (${hits.annNames}) and the crowd's groan and gasp are in it`);
check(hits.skipped || (hits.first && hits.first.after > 100 && hits.first.after < 450 && !hits.first.placed && hits.first.room), 'a hit in a battle area: the crowd reacts just after the hit sound, all round you, in the room: ' + JSON.stringify(hits.first));
check(hits.skipped || (hits.count === 17 && hits.distinct >= 3 && !hits.repeat), `one reaction to every hit (${hits.count} of 17), ${hits.distinct} different ones heard, never the same twice running`);
check(hits.skipped || hits.elsewhere === 0, 'a hit outside a battle area draws no reaction');
check(hits.skipped || (hits.overAtOnce && hits.fatalReact), 'the fatal hit in an arena: the crowd reacts with it, and Game Over comes at once');

// The last check ended the run: back to the menu and into a new one, with the helpers' world.
await page.evaluate(async () => {
  const g = window.__el.game;
  if (g.state === 'game_over') g.input('enter');
  g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter');
});
await sleep(800);

// --------------------------------------------------------------- 12. Russell's fourth report (8 Nov): island edges, the bus and the throwers, the compass survey
const edges = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio; const T = window.__ut; const W = T.world;
  const out = {};
  const bump = (area) => {
    // Stand on a floor cell of the area whose next cell one way is not floor, and step that way.
    for (const [cx, cy] of area.floorCells) {
      for (const [g2, dx, dy] of [['west', -1, 0], ['east', 1, 0], ['north', 0, -1], ['south', 0, 1]]) {
        if (W.isFloor(u.world, cx + dx, cy + dy)) continue;
        g.playerPos = W.posOf(cx, cy); u.area = area; u.place = 'world'; g._utListenerMix();
        const played = []; const orig = a.play.bind(a); a.play = (n, o) => { played.push(n); return orig(n, o); };
        const before = [...g.playerPos];
        T.go(g2);
        a.play = orig;
        return { played, stayed: before[0] === g.playerPos[0] && before[1] === g.playerPos[1] };
      }
    }
    return null;
  };
  if (await T.ensureKind('island')) out.island = bump(T.goTo((x) => x.kind === 'island'));
  if (await T.ensureKind('labyrinth')) out.lab = bump(T.goTo((x) => x.kind === 'labyrinth'));
  return out;
});
check(!edges.island || (edges.island.stayed && edges.island.played.includes('boundary') && !edges.island.played.includes('wall')), 'on an island the edge is the boundary buzz, never a wall: ' + JSON.stringify(edges.island));
check(!edges.lab || (edges.lab.stayed && edges.lab.played.includes('wall')), 'in a labyrinth a wall is still a wall: ' + JSON.stringify(edges.lab));

const aboard = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio; const T = window.__ut;
  if (!(await T.ensureKind('tower'))) return { skipped: true };
  const area = T.goTo((x) => x.kind === 'tower');
  u.enemies = u.enemies.filter((e) => e.area !== area);
  const e = g._utSpawnEnemy(area);
  if (!e || e.kind !== 'thrower') return { skipped: true };
  // Armed and awake: it throws at you on the floor.
  e.items = 3; e.cooldown = 0; e.notice = 0; e.recover = 0; e.winding = 0; e.pending = 0;
  u.safe = 0; u.hitCooldown = 0;
  let flying = 0;
  for (let i = 0; i < 30 * 4 && !flying; i++) { g.updateUltimateMode(1 / 30); flying = u.projectiles.length; }
  const out = { threwOnFloor: flying > 0 };
  // A chaser of the same area, far off, to watch its mind.
  const foe = { kind: 'chaser', area, x: g.playerPos[0] + 40, y: g.playerPos[1], speed: 2.2, voice: null, goal: null, goalTimer: 0, soundName: 'enemy_0' };
  u.enemies.push(foe);
  // The bus stands beside you; step up to it.
  u.bus = { area, pos: [g.playerPos[0] + 3, g.playerPos[1]], stage: 'waiting', t: 0, voice: null, rideVoice: null, pullVoice: null, doorVoice: null, ride: 20, steps: 100 };
  e.items = 3; e.cooldown = 0; e.notice = 0; e.recover = 0;
  T.go('east');
  out.boarded = u.place === 'bus';
  out.droppedAtBoarding = u.projectiles.length === 0;
  const played = []; const orig = a.play.bind(a); a.play = (n, o) => { played.push(n); return orig(n, o); };
  const d0 = Math.hypot(foe.x - g.playerPos[0], foe.y - g.playerPos[1]);
  for (let i = 0; i < 30 * 5; i++) { g.updateUltimateMode(1 / 30); if (i % 15 === 0) await new Promise((r) => setTimeout(r, 5)); }
  a.play = orig;
  out.stillAboard = u.place === 'bus'; out.stage = u.bus && u.bus.stage;
  out.throwsAboard = played.filter((n) => /^item_throw$|^enemy_windup/.test(n)).length;
  out.projectilesAboard = u.projectiles.length;
  out.chaserWanders = !!foe.goal; out.chaserCloser = Math.hypot(foe.x - g.playerPos[0], foe.y - g.playerPos[1]) < d0 - 8;
  u.bus = null; u.place = 'world'; u.enemies = u.enemies.filter((x) => x !== foe);
  return out;
});
check(aboard.skipped || aboard.threwOnFloor, 'a thrower with items throws at you on the floor');
check(aboard.skipped || (aboard.boarded && aboard.droppedAtBoarding && aboard.stillAboard), `boarding the bus drops whatever was in the air (${aboard.stage})`);
check(aboard.skipped || (aboard.throwsAboard === 0 && aboard.projectilesAboard === 0), `on the bus a thrower in your area neither winds up nor throws (${aboard.throwsAboard} sounds, ${aboard.projectilesAboard} in the air)`);
check(aboard.skipped || (aboard.chaserWanders && !aboard.chaserCloser), 'on the bus a chaser of your area wanders instead of coming for you');

const survey = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__ut; const W = T.world;
  const area = T.goTo((x) => x.kind !== 'event') || T.goTo(() => true);
  const names = { labyrinth: 'a labyrinth', island: 'an island', tower: 'a tower area', battle: 'a battle area', event: 'a safe zone' };
  // (Web 4.0.0: you turn for real, and the compass says what lies ahead of you
  // when you face a main direction: the leg with its turn when that is the way to
  // go, else how far it is open and what lies beyond, and then where the way is
  // from there.)
  const ways = ['north', 'east', 'south', 'west'];
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const [cx, cy] = W.cellOf(g.playerPos);
  const out = { words: [], ok: true, route: 0, wanted: [] };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const cap = (t) => t[0].toUpperCase() + t.slice(1);
  const leg = g._utRoute().leg;
  const legAt = leg ? dirs.findIndex((d) => d[0] === leg.dir[0] && d[1] === leg.dir[1]) : -1;
  for (let i = 0; i < 4; i++) {
    T.face(ways[i]);
    const w = g._utCompassWords(i);
    out.words.push(w);
    const [dx, dy] = dirs[i];
    if (/^This way, \d+ steps?, then (right|left)\.$|^This way, \d+ steps? to (the safe zone|the bus|the way out)\.$/.test(w)) { out.route += 1; out.wanted.push('(route)'); if (i !== legAt) out.ok = false; continue; }
    const side = legAt < 0 ? '' : ` The way is ${['ahead', 'to your right', 'behind you', 'to your left'][(legAt - i + 4) % 4]}.`;
    // Walk that way ourselves: how far it is open, and what stops us.
    let open = 0; let x = cx; let y = cy; let stop = 'wall';
    for (let k = 0; k < 40; k++) {
      x += dx; y += dy;
      if (!W.isFloor(u.world, x, y)) { stop = 'wall'; break; }
      if (W.areaAt(u.world, W.posOf(x, y)) !== area) { stop = 'border'; break; }
      open += 1;
    }
    const next = u.world.areas.find((o) => o.ax === area.ax + dx && o.ay === area.ay + dy);
    const far = u.world.areas.find((o) => o.ax === area.ax + 2 * dx && o.ay === area.ay + 2 * dy);
    const toBorder = Math.max(1, dx > 0 ? area.x1 + 1 - cx : dx < 0 ? cx - (area.x0 - 1) : dy > 0 ? area.y1 + 1 - cy : cy - (area.y0 - 1));
    const then = far ? `, then ${names[far.kind]}` : '';
    const blocker = area.kind === 'island' ? "the island's edge" : 'a wall';
    let want;
    if (stop === 'border') want = `open to the border, ${plural(open, 'step')}, into ${names[next.kind]}${then}.`;
    else if (!next) want = open ? `open for ${plural(open, 'step')}, then ${blocker}; the edge of the world is ${plural(toBorder, 'step')} away.` : `${blocker}; the edge of the world is ${plural(toBorder, 'step')} away.`;
    else want = (open ? `open for ${plural(open, 'step')}, then ${blocker}. ` : `${blocker}. `) + `Beyond, ${names[next.kind]}, ${plural(toBorder, 'step')} away${then}.`;
    want = cap(want) + side;
    out.wanted.push(want);
    if (w !== want) out.ok = false;
  }
  // Compass on, for real, facing north: the briefing, then the way ahead. The way
  // to start is counted from the way you face.
  T.face('north');
  g.input('hold'); out.said = document.getElementById('said').textContent;
  out.startNorth = (/starting (ahead|right|behind|left)\./.exec(out.said) || [])[1];
  out.wantNorth = legAt < 0 ? undefined : ['ahead', 'right', 'behind', 'left'][legAt];
  g.input('hold');
  // Facing east, the same leg starts a quarter turn further round to the left.
  T.face('east');
  g.input('hold'); out.startEast = (/starting (ahead|right|behind|left)\./.exec(document.getElementById('said').textContent) || [])[1]; g.input('hold');
  out.wantEast = legAt < 0 ? undefined : ['ahead', 'right', 'behind', 'left'][(legAt - 1 + 4) % 4];
  T.face('north');
  return out;
});
check(survey.ok && survey.route === 1, 'facing each main direction, the compass says how far it is open, what stops you, what lies beyond and where the way is, and one of them is the route leg with its turn: ' + JSON.stringify(survey.words) + (survey.ok ? '' : ' wanted ' + JSON.stringify(survey.wanted)));
check(/^Compass on\. You are (in|on) (a labyrinth|an island|a tower area|a battle area|a safe zone)\. (The safe zone|The bus|The way out) is \d+ steps? away, starting (ahead|right|behind|left)\. (Nearby: [^.]*(steps? away, starting (ahead|right|behind|left)|right here)[^.]*\.|Nothing to pick up nearby\.) (This way|Open|A wall|The island's edge)[ ,;.].*$/.test(survey.said), 'turning the compass on gives the briefing, then the way ahead: ' + survey.said);
check(survey.startNorth === survey.wantNorth && survey.startEast === survey.wantEast, `the way to start is counted from the way you face: facing north "starting ${survey.startNorth}", facing east "starting ${survey.startEast}"`);

// --------------------------------------------------------------- 13. regeneration under a pile of sounds (Russell, 8 Nov: roars carried over; a crash)
const regenLoad = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio; const T = window.__ut;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!(await T.ensureKind('battle'))) return { skipped: true };
  const area = T.goTo((x) => x.kind === 'battle');
  const out = { culledBefore: a.culled };
  // A fight: eight chasers fall within a second, a strike lands, the crowd roars and groans.
  u.enemies = u.enemies.filter((e) => e.area !== area);
  for (let i = 0; i < 8; i++) u.enemies.push({ kind: 'chaser', area, x: g.playerPos[0] + 4 + i, y: g.playerPos[1], speed: 2.2, voice: null, goal: null, goalTimer: 0, soundName: 'enemy_0' });
  u.safe = 0; u.hitCooldown = 0; u.hp = 100;
  for (const e of [...u.enemies].filter((e) => e.area === area)) g._utKillEnemy(e, 'laser');
  g._utHurt({ kind: 'chaser', area, x: g.playerPos[0], y: g.playerPos[1] });
  await sleep(500);   // bangs and the first roars are sounding; more roars are due
  out.roaring = [...a.live].filter((v) => /^ut_crowd_/.test(v.name)).length;
  out.shotsBefore = u.shots.size;
  const oldWorld = u.worldNo;
  // The world ends now.
  u.worldTime = 0.05;
  for (let i = 0; i < 45; i++) { g.updateUltimateMode(1 / 30); if (i % 15 === 0) await sleep(5); }
  out.newWorld = u.worldNo === oldWorld + 1;
  out.atOnce = { crowd: [...a.live].filter((v) => /^ut_crowd_|^explosion$/.test(v.name) && v.busy).length, oldBuses: 0 };
  await sleep(1200);   // every roar that was due has had its moment
  for (let i = 0; i < 30; i++) g.updateUltimateMode(1 / 30);
  const shotsNow = () => [...a.live].filter((v) => !v.loop).length;
  out.later = { crowd: [...a.live].filter((v) => /^ut_crowd_|^explosion$/.test(v.name) && v.busy).length, shotsStopped: [...u.shots].filter((v) => !v.busy).length, shots: shotsNow(), max: a.maxShots3d };
  // A pile of one-shots at once, with the bus's chime sounding (web 3.3.0: found
  // by Russell, in a crowded world the chime sometimes never sounded). The
  // ceiling on one-shots holds, the loops stay, and the chime, a cue, plays on.
  const loopsBefore = [...a.live].filter((v) => v.loop).length;
  const chime = g._utBusChime();
  const plain = g._utPlay('explosion', [g.playerPos[0] + 3, g.playerPos[1] + 2]);    // older than every bang to come, and no cue
  for (let i = 0; i < 90; i++) g._utPlay('explosion', [g.playerPos[0] + (i % 7), g.playerPos[1] + 2]);
  out.pile = { shots: shotsNow(), loops: [...a.live].filter((v) => v.loop).length, loopsBefore, culled: a.culled - out.culledBefore,
    chime: !!chime && chime.keep && chime.busy, plainGone: !!plain && plain.stopped };
  // Loops never cost a one-shot its place: with more loops alive than the old
  // ceiling of 56 voices, a one-shot still starts, and nothing gives way for it.
  for (const v of [...a.live]) if (!v.loop && v !== chime) v.stop();
  const extra = [];
  for (let i = 0; i < 70; i++) extra.push(a.play('item_beacon', { loops: -1, volume: 0 }));
  const culledAt = a.culled;
  const among = a.play('explosion', { volume: 0 });
  out.loops = { alive: [...a.live].filter((v) => v.loop).length, started: !!among && among.busy, culled: a.culled - culledAt, chime: !!chime && chime.busy };
  for (const v of extra) if (v) v.stop();
  if (among) among.stop();
  // A house full of cues: a plain newcomer gives way (no cue is cut for it), and
  // one more cue still sounds.
  for (const v of [...a.live]) if (!v.loop) v.stop();
  const cues = [];
  for (let i = 0; i < a.maxShots3d; i++) cues.push(a.play('ut_bus_chime', { volume: 0, keep: true }));
  const refused = a.play('explosion', { volume: 0 });
  const oneMore = a.play('ut_bus_chime', { volume: 0, keep: true });
  out.cues = { all: cues.every((v) => v && v.busy), refused: refused === null, oneMore: !!oneMore && oneMore.busy };
  for (const v of [...cues, oneMore]) if (v) v.stop();
  await sleep(300);
  return out;
});
check(regenLoad.skipped || (regenLoad.roaring >= 1 && regenLoad.newWorld), `a fight in the arena had the crowd going (${regenLoad.roaring} crowd sounds) when the world ended`);
check(regenLoad.skipped || (regenLoad.atOnce.crowd === 0 && regenLoad.later.crowd === 0), `no roar, groan or bang of the old world is heard in the new one, not at once (${regenLoad.atOnce && regenLoad.atOnce.crowd}) and not when its timers come due (${regenLoad.later && regenLoad.later.crowd})`);
check(regenLoad.skipped || (regenLoad.later.shotsStopped === 0 && regenLoad.later.shots <= regenLoad.later.max), `finished one-shots are forgotten and the one-shots stay under their ceiling (${regenLoad.later && regenLoad.later.shots} of ${regenLoad.later && regenLoad.later.max})`);
check(regenLoad.skipped || (regenLoad.later.max === 16 && regenLoad.pile.shots <= regenLoad.later.max && regenLoad.pile.loops === regenLoad.pile.loopsBefore && regenLoad.pile.culled > 0 && regenLoad.pile.plainGone), `ninety bangs at once: the ceiling on one-shots holds (${regenLoad.pile && regenLoad.pile.shots} of ${regenLoad.later && regenLoad.later.max}), the loops all stay (${regenLoad.pile && regenLoad.pile.loops}), the oldest bangs gave way (${regenLoad.pile && regenLoad.pile.culled})`);
check(regenLoad.skipped || regenLoad.pile.chime, 'and the bus\'s chime, a cue, plays on through all ninety: it is never the one to give way');
check(regenLoad.skipped || (regenLoad.loops.alive >= 70 && regenLoad.loops.started && regenLoad.loops.culled === 0 && regenLoad.loops.chime), `loops never cost a one-shot its place: with ${regenLoad.loops && regenLoad.loops.alive} loops alive a bang still starts, and nothing gives way for it`);
check(regenLoad.skipped || (regenLoad.cues.all && regenLoad.cues.refused && regenLoad.cues.oneMore), 'a house full of cues: a plain newcomer gives way, no cue is cut for it, and one more cue still sounds: ' + JSON.stringify(regenLoad.cues));

// --------------------------------------------------------------- 14. potions live in the safe zones (Russell, 8 Nov; web 3.1.0)
const potions = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__ut;
  const { POTION_BELOW, POTION_REFILL } = T.mod;
  const zones = () => u.world.areas.filter((a) => a.kind === 'event');
  const pots = () => u.pickups.filter((p) => p.kind === 'potion');
  const out = { below: POTION_BELOW };
  u.hp = 100; g._utPotions(0);
  out.noneAtFull = pots().length === 0;
  // One hit below the line: every safe zone has a potion at once, and nowhere else does.
  u.hp = POTION_BELOW - 1; g._utPotions(0);
  out.zones = zones().length; out.potions = pots().length;
  out.oneEach = zones().every((z) => pots().filter((p) => p.area === z).length === 1);
  out.onlySafe = pots().every((p) => p.area.kind === 'event');
  // Drinking one: full health, the rest vanish, nothing comes back while health holds.
  const z = zones()[0]; const p = pots().find((x) => x.area === z);
  g.playerPos = [...p.pos]; u.area = z; u.place = 'world';
  g._utUpdatePickups();
  out.hpAfter = u.hp; g.updateUltimateMode(1 / 30); out.afterDrink = pots().length;
  for (let i = 0; i < 60; i++) g.updateUltimateMode(1 / 30);
  out.stillNone = pots().length === 0;
  // Low again: they are back, but the zone just drunk from waits its refill.
  u.hp = POTION_BELOW - 10; g._utPotions(0);
  out.backElsewhere = zones().filter((x) => x !== z).every((x) => pots().some((q) => q.area === x));
  out.drunkZoneWaits = !pots().some((q) => q.area === z) && u.potionDue.get(z.id) > 0;
  for (let i = 0; i < 30 * (POTION_REFILL + 0.5); i++) g.updateUltimateMode(1 / 30);
  out.refilled = pots().some((q) => q.area === z);
  // Healed by other means: gone again.
  u.hp = 100; for (let i = 0; i < 3; i++) g.updateUltimateMode(1 / 30);
  out.goneWhenWell = pots().length === 0;
  return out;
});
check(potions.below === 75 && potions.noneAtFull, 'at full health there is no potion anywhere');
check(potions.potions === potions.zones && potions.oneEach && potions.onlySafe && potions.zones >= 1, `below 75 every safe zone holds one potion and nowhere else does (${potions.potions} in ${potions.zones} zones)`);
check(potions.hpAfter === 100 && potions.afterDrink === 0 && potions.stillNone, 'drinking one restores full health and the others disappear: ' + JSON.stringify({ hp: potions.hpAfter, left: potions.afterDrink, still: potions.stillNone }));
check(potions.backElsewhere && potions.drunkZoneWaits && potions.refilled, 'low again: the other zones have theirs at once, the zone drunk from refills after its wait: ' + JSON.stringify({ e: potions.backElsewhere, w: potions.drunkZoneWaits, r: potions.refilled }));
check(potions.goneWhenWell, 'healed above the line, they disappear again');

// --------------------------------------------------------------- 15. the crowd rings in the arena (Russell, 8 Nov; web 3.1.0)
const crowdRoom = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const a = window.__el.audio; const T = window.__ut;
  if (!(await T.ensureKind('battle'))) return { skipped: true };
  const area = T.goTo((x) => x.kind === 'battle');
  const { ROARS, HIT_REACTIONS, ROAR_LEVEL, HIT_REACT_LEVEL, CROWD_SEND, CROWD_SEND_LIVE, CROWD_LIVE_RECORDED } = T.mod;
  const out = { each: [] };
  // Each recording, played as the game plays it, measured through the arena's echo.
  for (const name of [...ROARS, ...HIT_REACTIONS]) {
    if (!a.has(name)) continue;
    const send = CROWD_LIVE_RECORDED.includes(name) ? CROWD_SEND_LIVE : CROWD_SEND;
    const v = g._utPlay(name, null, { volume: ROARS.includes(name) ? ROAR_LEVEL : HIT_REACT_LEVEL, send });
    await new Promise((r) => setTimeout(r, 60));
    const m = await T.measure(v, area.id, 500);
    v.stop();
    // (The share of the sound that goes into the room: its own send against its dry
    // level. The room's output itself carries every sound in the arena, so it is
    // not a measure of this one.)
    out.each.push({ name, send, taps: v.wet && v.wet.taps ? v.wet.taps.size : 0, ratio: m.dry > 0 ? +(m.send / m.dry).toFixed(3) : null, dry: +m.dry.toFixed(3), room: +m.wet.toFixed(3) });
    await new Promise((r) => setTimeout(r, 150));
  }
  // The background crowd loop is as it was: the light background send.
  const s = u.areaSounds.get(area.id);
  out.crowdLoop = s && s.crowdIn ? { send: s.crowdIn.send, sendSet: !!s.crowdIn.sendSet } : null;
  // For comparison, a footstep's ratio in the same room.
  const fs = a.play('step_stone_1', { volume: 0.3 });
  await new Promise((r) => setTimeout(r, 40));
  const fm = fs ? await T.measure(fs, area.id, 400) : null;
  out.footstep = fm && fm.dry > 0 ? +(fm.send / fm.dry).toFixed(3) : null;
  out.closeSend = CROWD_SEND;
  return out;
});
check(crowdRoom.skipped || (crowdRoom.each.length === 13 && crowdRoom.each.every((e) => e.taps >= 1 && e.ratio !== null && e.ratio > 0.2 && e.ratio < 0.8)), 'all thirteen crowd recordings send into the arena\'s room, each between a fifth and four fifths of its dry level: ' + JSON.stringify(crowdRoom.each.map((e) => [e.name.replace('ut_crowd_', ''), e.ratio])));
check(crowdRoom.skipped || crowdRoom.each.filter((e) => e.send === crowdRoom.closeSend).every((e) => e.ratio > (crowdRoom.footstep || 0) * 0.8), `the close-up recordings carry at least as much room as a footstep does (footstep ${crowdRoom.footstep})`);
check(crowdRoom.skipped || (crowdRoom.crowdLoop && Math.abs(crowdRoom.crowdLoop.send - 0.15) < 0.001), 'the background stadium crowd keeps its light send: ' + JSON.stringify(crowdRoom.crowdLoop));

// --------------------------------------------------------------- 16. the aim is the front quarter (Russell, 11 Nov; web 4.0.0), and more chasers (9 Nov; web 3.2.0)
const aim = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__ut;
  if (!u.world) return { skipped: 'no run' };
  await T.ensureKind('battle');
  const area = T.goTo((x) => x.kind === 'battle');
  if (!area) return { skipped: 'no battle area' };
  const mine = u.enemies.filter((e) => e.area === area);
  const saved = mine.map((e) => [e.x, e.y]);
  u.enemies = u.enemies.filter((e) => e.area !== area || e === mine[0]);
  const e = mine[0];
  const [px, py] = g.playerPos;
  // The chaser `steps` away at `deg` degrees clockwise from north: does a shot take it?
  const at = (deg, steps) => { const r = steps * 3; const t = deg * Math.PI / 180; e.x = px + Math.sin(t) * r; e.y = py - Math.cos(t) * r; return g._utLocked() === e; };
  const facing = (deg) => { g._utTurnStop(); g._utFace(deg * Math.PI / 180, true); };
  facing(0);
  const out = {
    // Facing north: straight ahead and up to 45 degrees either side; nothing wider, nothing behind.
    ahead: at(0, 8), at30: at(30, 8), at44: at(44, 8), at45: at(45, 8), atMinus45: at(-45, 8),
    at47: at(47, 8), atMinus47: at(-47, 8), side90: at(90, 8), behind: at(180, 8), behind30: at(150, 8),
    // Within two steps, whatever side, behind you too.
    closeSide: at(90, 1.5), closeDiag: at(75, 1.9), closeBehind: at(180, 1.9), notClose: at(90, 2.5), notCloseBehind: at(180, 2.5),
  };
  // The aim turns with you: facing east, what was to the side is ahead.
  facing(90);
  out.east = { ahead: at(90, 8), north: at(0, 8), south: at(180, 8), at130: at(130, 8), at140: at(140, 8) };
  // At a slant too: facing 30 degrees, 40 degrees to the right of that is in, 50 to the left is out.
  facing(30);
  out.slant = { right40: at(70, 8), left50: at(-20, 8), left40: at(-10, 8) };
  // Every way an enemy can be is in front of you for one of the four main directions
  // at least, so quick turns alone can face any enemy (a Braille notetaker's keys
  // cannot be held).
  let uncovered = 0;
  for (let deg = 0; deg < 360; deg += 1) {
    let seen = false;
    for (const f of [0, 90, 180, 270]) { facing(f); if (at(deg, 8)) seen = true; }
    if (!seen) uncovered += 1;
  }
  out.uncovered = uncovered;
  facing(0);
  u.enemies.push(...mine.slice(1));
  mine.forEach((m, i) => { [m.x, m.y] = saved[i]; });
  // The counts: one or two in the easy stretch, up to eight later.
  const el0 = u.elapsed;
  const easy = new Set(); for (let i = 0; i < 200; i++) { u.elapsed = 30; easy.add(g._utEnemyCount()); }
  let most = 0; for (let i = 0; i < 400; i++) { u.elapsed = 60 * 40; most = Math.max(most, g._utEnemyCount()); }
  u.elapsed = el0;
  out.easy = [...easy].sort(); out.most = most;
  return out;
});
check(!aim.skipped && aim.ahead && aim.at30 && aim.at44 && aim.at45 && aim.atMinus45, 'a shot takes a chaser in the front quarter: straight ahead and up to 45 degrees either side: ' + JSON.stringify(aim));
check(!aim.skipped && !aim.at47 && !aim.atMinus47 && !aim.side90 && !aim.behind && !aim.behind30, 'a chaser wider than that, or behind you, is not taken (47 and 90 degrees off, and behind, eight steps away)');
check(!aim.skipped && aim.closeSide && aim.closeDiag && aim.closeBehind && !aim.notClose && !aim.notCloseBehind, 'a chaser within two steps is hit whatever side it is on, behind you too; at two and a half steps it is not');
check(!aim.skipped && aim.east.ahead && !aim.east.north && !aim.east.south && aim.east.at130 && !aim.east.at140, 'the aim turns with you: facing east, east is ahead and north and south are to the side: ' + JSON.stringify(aim.east));
check(!aim.skipped && aim.slant.right40 && aim.slant.left40 && !aim.slant.left50, 'and at a slant: facing 30 degrees, 40 degrees either side is in and 50 is out: ' + JSON.stringify(aim.slant));
check(!aim.skipped && aim.uncovered === 0, `whichever way an enemy lies, one of the four main directions has it in front, so quick turns alone can face it (${aim.uncovered} of 360 degrees uncovered)`);
check(!aim.skipped && aim.easy.join() === '1,2' && aim.most === 8, `battle and island areas hold one or two chasers in the easy stretch and up to eight later: ${aim.easy}, ${aim.most}`);

// --------------------------------------------------------------- 17. beacons over the arena, and cartridges that do not grow (Russell, 9 Nov; web 3.2.0)
const loud = await page.evaluate(async () => {
  const g = window.__el.game; const u = g.ut; const T = window.__ut;
  if (!u.world) return { skipped: 'no run' };
  const out = {};
  // Every cartridge holds three to six shots, early or late.
  const el0 = u.elapsed; const shots = [];
  for (const t of [30, 600, 2400]) { u.elapsed = t; for (let i = 0; i < 100; i++) shots.push(g._utShotsPerCartridge()); }
  u.elapsed = el0;
  out.minShots = Math.min(...shots); out.maxShots = Math.max(...shots);
  // The same cartridge beacon, five steps away, in a battle area and in a labyrinth.
  const levelIn = async (kind) => {
    await T.ensureKind(kind);
    const area = T.goTo((x) => x.kind === kind);
    if (!area) return null;
    u.safe = 99;
    const W = T.world; const [cx, cy] = W.cellOf(g.playerPos);
    const cell = area.floorCells.find(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - 5) < 0.6 && W.isFloor(u.world, x, y));
    if (!cell) return null;
    const p = g._utSpawnPickup('ammo', area, { pos: W.posOf(cell[0], cell[1]) });
    if (!p) return null;
    for (let i = 0; i < 4; i++) g.updateUltimateMode(1 / 30);
    const d = Math.hypot(p.pos[0] - g.playerPos[0], p.pos[1] - g.playerPos[1]);
    const level = p.voice ? p.voice.l : null;
    if (p.voice) { p.voice.stop(); u.voices.delete(p.voice); }
    u.pickups.splice(u.pickups.indexOf(p), 1);
    return level === null ? null : level / (Math.max(0, 1 - d / 70) * 0.55);
  };
  out.battle = await levelIn('battle');
  out.labyrinth = await levelIn('labyrinth');
  return out;
});
check(!loud.skipped && loud.minShots === 3 && loud.maxShots === 6, `every cartridge holds three to six shots at half a minute, ten minutes and forty (${loud.minShots} to ${loud.maxShots})`);
check(!loud.skipped && loud.battle !== null && Math.abs(loud.battle - 2) < 0.05 && loud.labyrinth !== null && Math.abs(loud.labyrinth - 1) < 0.05, `a cartridge's beacon plays twice as loud in a battle area as in a labyrinth (battle ×${loud.battle && loud.battle.toFixed(2)}, labyrinth ×${loud.labyrinth && loud.labyrinth.toFixed(2)})`);

// --------------------------------------------------------------- 18. an area nobody can hear costs nothing (web 3.3.0)
const parking = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const u = g.ut; const T = window.__ut; const W = T.world;
  const { PARK_AFTER, AMBIENCE_RANGE } = T.mod;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const LOOPS = ['amb', 'ambIn', 'drums', 'drumsIn', 'crowd', 'crowdIn'];
  const voicesOf = (area) => { const s = u.areaSounds.get(area.id); return s ? LOOPS.map((k) => s[k]).filter(Boolean) : []; };
  // A late world, so that its areas are full; the player in the middle of an area
  // with an open border, every neighbour's border too far off to be heard.
  u.elapsed = 15 * 60;
  let A = null; let B = null;
  for (let n = 0; n < 12 && !A; n++) {
    for (const bd of u.world.borders || []) {
      const x = u.world.areas.find((q) => q.id === bd.a); const y = u.world.areas.find((q) => q.id === bd.b);
      // (Not from an island: its middle is the lift, and coming back to it would be a ride down.)
      const plain = (q) => q.kind !== 'island' && q.kind !== 'event';
      if (x && y && !bd.door && (x.ay === y.ay || x.ax === y.ax) && (plain(x) || plain(y))) { [A, B] = plain(x) ? [x, y] : [y, x]; break; }
    }
    if (!A) { u.worldTime = 0.05; for (let i = 0; i < 60; i++) g.updateUltimateMode(1 / 30); await sleep(50); }
  }
  if (!A) return { skipped: true };
  T.goTo((x) => x === A);
  u.worldTime = 170; u.hp = 100;
  T.quiet();
  const frames = async (seconds) => { for (let t = 0; t < seconds; t += 1 / 30) { u.safe = 99; u.hp = 100; u.worldTime = 170; g.updateUltimateMode(1 / 30); if (Math.round(t * 30) % 6 === 0) await sleep(15); } };
  // Every kept area's air is decoded and begun, then held if unheard (ten seconds at most).
  const out = {};
  const unheard = () => u.world.areas.filter((x) => x !== A && u.areaSounds.has(x.id));
  for (let i = 0; i < 20; i++) {
    await frames(PARK_AFTER + 0.5);
    if (unheard().every((x) => voicesOf(x).every((v) => v.paused))) break;
  }
  const own = voicesOf(A);
  out.kept = unheard().length;
  out.ownRunning = own.length >= 2 && own.every((v) => v.busy && !v.paused);
  out.ownHeard = u.areaSounds.get(A.id).ambIn.l > 0;
  out.othersHeld = unheard().every((x) => voicesOf(x).length >= 2 && voicesOf(x).every((v) => v.busy && v.paused));
  out.running = [...a.live].filter((v) => v.loop && !v.paused && [...u.areaSounds.values()].some((s) => LOOPS.some((k) => s[k] === v))).length;
  out.ownCount = own.length;
  const sB = u.areaSounds.get(B.id);
  const heldAt = sB.amb.offset;
  // A second and a half of silence, exactly: not held before it, held after it.
  // (Two cells from B's border, then back to the middle.)
  const horizontal = A.ay === B.ay;
  const nearB = horizontal ? [(B.ax > A.ax ? A.x1 - 2 : A.x0 + 2), A.y0 + 16] : [A.x0 + 16, (B.ay > A.ay ? A.y1 - 2 : A.y0 + 2)];
  const mid = [...g.playerPos];
  // Towards B: its air is heard again, and carries on from where it was held, the two copies in step.
  g.playerPos = W.posOf(nearB[0], nearB[1]); g._utListenerMix();
  g.updateUltimateMode(1 / 30);
  // (How far apart the two copies of B's background are by their own clocks: they
  // were started one straight after the other, so a few thousandths of a second
  // at most. Holding them and letting them go must add nothing to it, ever.)
  const skew = () => sB.amb.startedAt - sB.ambIn.startedAt;
  const skew0 = skew();
  out.near = { level: sB.amb.l, resumed: voicesOf(B).every((v) => !v.paused && v.busy), skew: skew0,
    carriedOn: Math.abs((a.ctx.currentTime - sB.amb.startedAt) - heldAt) < 0.25, sources: sB.amb.sources.length > 0 && sB.ambIn.sources.length > 0 };
  await sleep(150);
  // Back to the middle: B's air plays on unheard for a moment (no flapping at a border), then it is held again.
  g.playerPos = mid; g._utListenerMix();
  await frames(PARK_AFTER - 0.4);
  out.grace = { level: sB.amb.l, running: voicesOf(B).every((v) => !v.paused) };
  await frames(0.8);
  out.again = voicesOf(B).every((v) => v.paused);
  // Many times over: the two copies never drift apart.
  const apart = [];
  for (let n = 0; n < 6; n++) {
    g.playerPos = W.posOf(nearB[0], nearB[1]); g._utListenerMix(); g.updateUltimateMode(1 / 30);
    apart.push(Math.abs(skew() - skew0));
    await sleep(40);
    g.playerPos = mid; g._utListenerMix(); await frames(PARK_AFTER + 0.3);
  }
  out.apart = Math.max(...apart);
  // Stepping over the border, the wide copy takes over at full, at once.
  g.playerPos = W.posOf(nearB[0], nearB[1]); g._utListenerMix(); g.updateUltimateMode(1 / 30);
  u.area = B; g.playerPos = W.posOf(horizontal ? (B.ax > A.ax ? B.x0 + 1 : B.x1 - 1) : B.x0 + 16, horizontal ? B.y0 + 16 : (B.ay > A.ay ? B.y0 + 1 : B.y1 - 1));
  g._utRefreshRooms(); g._utListenerMix(); g.updateUltimateMode(1 / 30);
  out.inside = { wide: sB.ambIn.l, placed: sB.amb.l, running: !sB.ambIn.paused && !sB.amb.paused };
  // The lift's hum: held off its island, playing on it.
  const isl = u.world.areas.find((x) => x.kind === 'island' && u.areaSounds.has(x.id) && x !== u.area);
  if (isl) {
    await frames(PARK_AFTER + 0.5);
    const hum = u.areaSounds.get(isl.id).hum;
    out.hum = { held: !!hum && (hum.paused || !hum.dry) };
    u.area = isl; u.place = 'world'; u.liftArmed = false;
    g.playerPos = W.posOf(isl.elevator[0], isl.elevator[1] + 3); g._utRefreshRooms(); g._utListenerMix();
    g.updateUltimateMode(1 / 30);
    const hum2 = u.areaSounds.get(isl.id).hum;
    out.hum.same = hum2 === hum; out.hum.playing = !!hum2 && !hum2.paused && hum2.l > 0;
  }
  return out;
});
check(parking.skipped || (parking.ownRunning && parking.ownHeard), 'the air of the area you stand in plays, heard: ' + JSON.stringify(parking));
check(parking.skipped || (parking.kept >= 2 && parking.othersHeld), `every other kept area (${parking.kept} of them), unheard from the middle of yours, has its loops held, none of them stopped`);
check(parking.skipped || parking.running === parking.ownCount, `so the only area loops running are your own area's (${parking.running} running, ${parking.ownCount} your own)`);
check(parking.skipped || (parking.near.level > 0 && parking.near.resumed && parking.near.sources && parking.near.carriedOn), 'near a neighbour\'s border its air is heard again, carrying on from where it was held: ' + JSON.stringify(parking.near));
check(parking.skipped || (Math.abs(parking.near.skew) < 0.02 && parking.apart < 1e-9), `its placed copy and its wide copy are in step when it carries on (${parking.near && parking.near.skew} seconds apart by their clocks), and being held six more times adds nothing to that (${parking.apart})`);
check(parking.skipped || (parking.grace.level === 0 && parking.grace.running && parking.again), 'out of earshot again it plays on unheard for a moment, then is held again: ' + JSON.stringify(parking.grace) + ' ' + parking.again);
check(parking.skipped || (parking.inside.running && parking.inside.wide > 0.5 && parking.inside.placed === 0), 'across the border its wide copy takes over at once: ' + JSON.stringify(parking.inside));
check(parking.skipped || !parking.hum || (parking.hum.held && parking.hum.same && parking.hum.playing), 'the lift\'s hum is held off its island and plays, the same voice, on it: ' + JSON.stringify(parking.hum));

// --------------------------------------------------------------- 19. a chaser in the area you left is let go at once (web 3.3.0)
const leftBehind = await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio; const u = g.ut; const T = window.__ut; const W = T.world;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let A = null; let B = null;
  for (const bd of u.world.borders || []) {
    const x = u.world.areas.find((q) => q.id === bd.a); const y = u.world.areas.find((q) => q.id === bd.b);
    // (Not from an island: its middle is the lift, and standing there would be a ride down.)
    const plain = (q) => q.kind !== 'island' && q.kind !== 'event';
    if (x && y && !bd.door && (x.ay === y.ay || x.ax === y.ax) && (plain(x) || plain(y))) { [A, B] = plain(x) ? [x, y] : [y, x]; break; }
  }
  if (!A) return { skipped: true };
  T.goTo((x) => x === A);
  u.worldTime = 170; u.hp = 100; u.safe = 99;
  u.enemies = [];
  T.quiet();
  const horizontal = A.ay === B.ay;
  const edge = horizontal ? [(B.ax > A.ax ? A.x1 - 1 : A.x0 + 1), A.y0 + 16] : [A.x0 + 16, (B.ay > A.ay ? A.y1 - 1 : A.y0 + 1)];
  g.playerPos = W.posOf(edge[0], edge[1]); g._utListenerMix();
  const e = { kind: 'chaser', area: A, x: g.playerPos[0] + (horizontal ? 0 : 6), y: g.playerPos[1] + (horizontal ? 6 : 0), speed: 0, voice: null, goal: null, goalTimer: 0, soundName: 'obstacle_1' };
  u.enemies.push(e);
  g.updateUltimateMode(1 / 30);
  const voice = e.voice;
  const out = { had: !!voice && voice.busy, place: u.place, phase: u.phase, kinds: [A.kind, B.kind], loopsBefore: [...a.live].filter((v) => v.loop && v.name === 'obstacle_1').length };
  // Over the border into B.
  u.area = B; g.playerPos = W.posOf(horizontal ? (B.ax > A.ax ? B.x0 + 1 : B.x1 - 1) : B.x0 + 16, horizontal ? B.y0 + 16 : (B.ay > A.ay ? B.y0 + 1 : B.y1 - 1));
  g._utRefreshRooms(); g._utListenerMix(); u.safe = 99;
  g.updateUltimateMode(1 / 30); g.updateUltimateMode(1 / 30);
  out.letGo = e.voice === null;
  await sleep(250);
  out.stopped = !!voice && voice.stopped; out.loopsAfter = [...a.live].filter((v) => v.loop && v.name === 'obstacle_1').length;
  // Back into A: it is heard again, with a voice of its own.
  u.area = A; g.playerPos = W.posOf(edge[0], edge[1]); g._utRefreshRooms(); g._utListenerMix(); u.safe = 99;
  g.updateUltimateMode(1 / 30);
  out.back = !!e.voice && e.voice !== voice && e.voice.busy;
  if (e.voice) { e.voice.stop(); u.voices.delete(e.voice); }
  u.enemies = [];
  return out;
});
check(leftBehind.skipped || (leftBehind.had && leftBehind.letGo && leftBehind.stopped && leftBehind.loopsAfter === 0), 'a chaser in the area you have just left is let go at once, not left playing unheard: ' + JSON.stringify(leftBehind));
check(leftBehind.skipped || leftBehind.back, 'and it is heard again, afresh, when you step back into its area');

check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
