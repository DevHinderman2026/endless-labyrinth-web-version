// Ultimate Test Mode (web 2.1.0): how it sounds, measured. Run with the site served
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

await page.evaluate(() => { const g = window.__el.game; g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter'); });
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
    g.playerPos = [(area.x0 + 16) * 3, (area.y0 + 16) * 3];
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
  const dirs = [['up', 0, -1], ['right', 1, 0], ['down', 0, 1], ['left', -1, 0]];
  let stepped = null;
  for (const [d, dx, dy] of dirs) {
    const [cx, cy] = T.world.cellOf([g.playerPos[0] + dx * 3, g.playerPos[1] + dy * 3]);
    if (T.world.isFloor(u.world, cx, cy)) { stepped = d; break; }
  }
  // (captured by family: whichever stone step is chosen)
  const names = ['step_stone_1', 'step_stone_2', 'step_stone_3', 'step_stone_4'];
  const anyStep = new Promise((resolve) => { const orig = a.play.bind(a); a.play = (n, o) => { const v = orig(n, o); if (names.includes(n)) { a.play = orig; resolve(v); } return v; }; });
  g.input(stepped || 'up');
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
  const [sx, sy] = dirs.find(([d]) => d === (stepped || 'up')).slice(1);
  const ahead = [g.playerPos[0] + sx * 3, g.playerPos[1] + sy * 3];
  const [acx, acy] = T.world.cellOf(ahead);
  let ammo = null; let ammoSync = null;
  if (T.world.isFloor(u.world, acx, acy)) {
    const p = { kind: 'ammo', area, safe: false, pos: ahead, shots: 4, beacon: 'ammo_beacon', gain: 0.55 };
    u.pickups.push(p);
    let playedAt = null; const orig = a.play.bind(a); let got = null;
    a.play = (n, o) => { const v = orig(n, o); if (n === 'ammo' && !got) { got = v; playedAt = performance.now(); } return v; };
    const before = performance.now();
    g.input(stepped || 'up');
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
const rings = (r) => r && r.taps >= 1 && r.wet > 0.004 && r.dry > 0.01;
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
    const dirs = [['up', 0, -1], ['right', 1, 0], ['down', 0, 1], ['left', -1, 0]];
    // Stand on a floor cell of the safe zone next to a wall, and swipe into the wall.
    const W = T.world; let spot = null;
    for (const [cx, cy] of area.floorCells) {
      const d = dirs.find(([, dx, dy]) => !w.floor.has(W.key(cx + dx, cy + dy)));
      if (d) { spot = [[cx, cy], d[0]]; break; }
    }
    if (spot) {
      g.playerPos = W.posOf(spot[0][0], spot[0][1]); g._utListenerMix();
      const wp = T.capture('wall');
      g.input(spot[1]);
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
  const dir = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';
  g.input(dir);
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
  u.liftArmed = false; g.updateUltimateMode(1 / 30);
  g.input('up'); g.updateUltimateMode(1 / 30);
  const inCar = u.place;
  // In the car: swipes, the shot and the throw make no sound at all; a hold speaks.
  const played = []; const orig = a.play.bind(a); a.play = (n, o) => { played.push(n); return orig(n, o); };
  const spoken = []; const os = g.tts.speak.bind(g.tts); g.tts.speak = (t, o) => { spoken.push(t); return os(t, o); };
  for (const d of ['up', 'down', 'left', 'right', 'space', 'enter']) g.input(d);
  g.input('hold');
  const compassInCar = u.compass.on;
  const playedInCar = played.slice(); played.length = 0;
  // Down to the seabed.
  for (let i = 0; i < 30 * 40 && u.place === 'ride'; i++) { g.updateUltimateMode(1 / 30); if (i % 30 === 0) await new Promise((r) => setTimeout(r, 5)); }   // (the ride recording may need decoding again)
  const onSeabed = u.place;
  // Walk to the seabed's edge: the boundary buzz, never a wall.
  let edgeSound = null; const trail = [];
  for (let i = 0; i < 40 && !edgeSound; i++) {
    played.length = 0;
    g.input('left');
    trail.push([g.playerPos.slice(), u.place, g.state, played.slice()]);
    const s = played.find((n) => n === 'boundary' || n === 'wall');
    if (s) edgeSound = s;
  }
  const stepsOnSeabed = played.filter((n) => /^step_/.test(n)).length;
  // Island Mode's seabed: the ride recording is eased out by arrival, the way up
  // hums where it stands, and your own bubbles come now and then.
  await new Promise((r) => setTimeout(r, 300));
  const rideStill = [...a.live].filter((v) => v.name === 'elevator_ride' && v.busy).length;
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
  g.input('left');
  g.updateUltimateMode(1 / 30);
  const rodeUp = u.place;
  for (let i = 0; i < 30 * 40 && u.place === 'ride'; i++) { g.updateUltimateMode(1 / 30); if (i % 30 === 0) await new Promise((r) => setTimeout(r, 5)); }
  const backUp = u.place;
  const safeAfter = u.safe;
  await new Promise((r) => setTimeout(r, 300));
  const waterLeft = [...a.live].filter((v) => v.name === 'underwater' && v.busy).length;
  await new Promise((r) => setTimeout(r, 700));
  const breathLeft = [...a.live].filter((v) => v.name === 'ut_diver_breathing' && v.busy).length;
  a.play = orig; g.tts.speak = os;
  return { inCar, playedInCar, spoken, compassInCar, onSeabed, edgeSound, stepsOnSeabed, trail: trail.slice(0, 12), rideStill, seabedHum, breathing, bubbles, rodeUp, backUp, safeAfter, waterLeft, breathLeft };
});
check(island.skipped || island.rideStill === 0, `the ride recording is eased out by the time you arrive (${island.rideStill} still playing)`);
check(island.skipped || (island.seabedHum !== null && island.seabedHum > 0), `on the seabed the way up hums where it stands (level ${island.seabedHum && island.seabedHum.toFixed(2)})`);
check(island.skipped || (island.breathing && island.breathing.loop && island.breathing.busy && Math.abs(island.breathing.level - 0.85) < 0.01 && island.breathing.send === 0 && !island.breathing.wet && !island.breathing.placed), 'on the seabed the diver\'s breathing loops all round you, with no echo: ' + JSON.stringify(island.breathing));
check(island.skipped || island.bubbles >= 1, `your own bubbles come now and then on the seabed (${island.bubbles} in six seconds)`);
check(island.skipped || (island.rodeUp === 'ride' && island.backUp === 'world' && island.safeAfter >= 2.5 && island.waterLeft === 0 && island.breathLeft === 0), 'the ride up lands you on the island with Island Mode\'s arrival grace, the water and the breathing left behind: ' + JSON.stringify({ rodeUp: island.rodeUp, backUp: island.backUp, safe: island.safeAfter, waterLeft: island.waterLeft, breathLeft: island.breathLeft }));
check(!island.skipped, 'a world with an island was found');
check(island.skipped || (island.inCar === 'ride' && island.playedInCar.length === 0), 'in the elevator car every swipe, the shot and the throw are silent (Island Mode): played ' + JSON.stringify(island.playedInCar));
check(island.skipped || (island.compassInCar === false && island.spoken.some((t) => /Compass not available in the elevator/.test(t))), 'a hold in the car says the compass is not available there: ' + JSON.stringify(island.spoken));
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
check(third.diff10 === 14 && third.hits10 === 6 && third.hitsStart === 1, `the rival's difficulty is 14 at ten minutes and it takes 6 hits (1 at the start): ${third.diff10}, ${third.hits10}, ${third.hitsStart}`);
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
  return { bang: !!bang, cheer: cheer ? { name: cheer[0], after: cheer[1] - (bang ? bang[1] : 0), placed: !!(cheer[2].pos), volume: cheer[2].volume } : null, elsewhere };
});
check(roar.skipped || (roar.bang && roar.cheer && roar.cheer.after > 250 && roar.cheer.after < 700 && !roar.cheer.placed), 'the crowd erupts about a third of a second after the bang, all round you: ' + JSON.stringify(roar.cheer));
check(roar.skipped || roar.elsewhere === 0, 'a kill outside a battle area draws no roar');
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
  // Stand in the park, a few steps from the slide: its beacon is Tower's staircase, placed.
  u.area = area; u.safe = 0; g.playerPos = [sl.pos[0] + 9, sl.pos[1]]; g._utRefreshRooms(); g._utListenerMix();
  T.quiet();
  g.updateUltimateMode(1 / 30);
  await new Promise((r) => setTimeout(r, 300));
  out.beacon = sl.voice ? { name: sl.voice.name, placed: sl.voice.placed, level: sl.voice.l } : null;
  // Step onto the square beside it: the ride takes over.
  const played = []; const orig = a.play.bind(a); a.play = (n, o) => { played.push(n); return orig(n, o); };
  const spoken = []; const os = g.tts.speak.bind(g.tts); g.tts.speak = (t, o) => { spoken.push(t); return os(t, o); };
  const p0 = u.points; const mult = g._utMultiplier();
  g.playerPos = [sl.pos[0] + 6, sl.pos[1]]; g._utListenerMix();
  g.input('left');                         // onto the square beside the slide
  out.started = u.place === 'slide' && u.slide && u.slide.stage === 'climb';
  // Nothing answers on the slide.
  const before = [...g.playerPos];
  for (const d of ['up', 'down', 'space', 'enter']) g.input(d);
  g.input('hold');
  out.heldStill = g.playerPos[0] === before[0] && g.playerPos[1] === before[1] && !u.compass.on && spoken.some((t) => /Compass not available on the slide/.test(t));
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
  const { BUS_FAR_STEPS, BUS_RIDE, BUS_DOORS_OPEN, BUS_DOORS_CLOSE } = T.mod;
  // Stand in a dangerous area; the world is young; make the safe zone count as far.
  const area = T.goTo((x) => x.kind !== 'event');
  u.bus = null; u.busElapsed = 30; u.busAt = 25; u.worldTime = 250; u.safe = 0;
  const realSteps = g._utStepsToSafety();
  g._utStepsToSafety = () => 100;
  const played = []; const orig = a.play.bind(a); a.play = (n, o) => { played.push([n, u.busElapsed]); return orig(n, o); };
  g.updateUltimateMode(1 / 30);
  const b = u.bus;
  const out = { realSteps, came: !!b && b.stage === 'waiting', chime: played.some(([n]) => n === 'ut_bus_chime'), ride: b && b.ride, near: b ? Math.hypot(b.pos[0] - g.playerPos[0], b.pos[1] - g.playerPos[1]) : null, outsideSafe: b && b.area.kind !== 'event' };
  if (!b) { a.play = orig; return out; }
  await new Promise((r) => setTimeout(r, 300));
  out.engine = b.voice ? { name: b.voice.name, placed: b.voice.placed, level: b.voice.l } : null;
  // The compass points to the bus while it waits.
  const leg = g._utRouteLeg();
  const busCell = W.cellOf(b.pos); const here = W.cellOf(g.playerPos);
  out.legTowardBus = leg ? Math.sign(busCell[0] - here[0]) === leg.dir[0] || Math.sign(busCell[1] - here[1]) === leg.dir[1] : null;
  g.input('hold'); out.compassSaid = document.getElementById('said').textContent; g.input('hold');
  // Walk onto it.
  g.playerPos = [b.pos[0] + 3, b.pos[1]]; g._utListenerMix();
  g.input('left');
  out.boarded = u.place === 'bus' && b.stage === 'boarding';
  const before = [...g.playerPos];
  for (const d of ['up', 'left', 'space', 'enter']) g.input(d);
  out.heldStill = g.playerPos[0] === before[0] && g.playerPos[1] === before[1];
  // Ride it out (with yields, for the recordings to decode).
  const total = BUS_DOORS_OPEN + 0.6 + BUS_DOORS_CLOSE + b.ride + BUS_DOORS_OPEN + 1.2 + BUS_DOORS_CLOSE + 2;
  let arrivedAt = null; let rideVoice = null;
  for (let i = 0; i < 30 * total && u.bus; i++) {
    g.updateUltimateMode(1 / 30);
    if (u.bus && u.bus.stage === 'riding' && u.bus.rideVoice) rideVoice = { name: u.bus.rideVoice.name, loop: u.bus.rideVoice.loop };
    if (u.place === 'world' && arrivedAt === null && u.bus && u.bus.stage === 'arriving') arrivedAt = u.busElapsed;
    if (i % 10 === 0) await new Promise((r) => setTimeout(r, 10));
  }
  await new Promise((r) => setTimeout(r, 1500));   // (the steps are real-time timers; the ride here ran faster than life)
  a.play = orig;
  const names = played.map(([n]) => n);
  const seq = ['ut_bus_doors_open', 'ut_bus_doors_close', 'ut_bus_doors_open', 'ut_bus_doors_close', 'ut_bus_leave'];
  let at = -1; let inOrder = true;
  for (const n of seq) { const i = names.indexOf(n, at + 1); if (i < 0) { inOrder = false; break; } at = i; }
  out.inOrder = inOrder; out.steps = names.filter((n) => /^step_/.test(n)).length; out.rideVoice = rideVoice;
  out.landedSafe = u.place === 'world' && u.area.kind === 'event' && W.areaAt(u.world, g.playerPos) === u.area;
  out.gone = !u.bus; out.idleLeft = [...a.live].filter((v) => /^ut_bus_(idle|ride)$/.test(v.name) && v.busy && !v.fadingOut).length;
  return out;
});
check(bus.came && bus.chime && bus.outsideSafe && bus.near >= 10 && bus.near <= 40, `when a safe zone is far (${bus.realSteps} steps here, told 100) a bus pulls up near you with its chime: ` + JSON.stringify({ near: bus.near && bus.near.toFixed(1), ride: bus.ride }));
check(bus.ride && Math.abs(bus.ride - (15 + 15 * (100 - 45) / 105)) < 0.01, `the ride's length follows the walk it saves (${bus.ride && bus.ride.toFixed(1)} s for 100 steps)`);
check(bus.engine && bus.engine.name === 'ut_bus_idle' && bus.engine.placed && bus.engine.level > 0.3, 'its engine idles where it stands: ' + JSON.stringify(bus.engine));
check(bus.legTowardBus && /Compass on, to the bus/.test(bus.compassSaid), 'the compass points to the waiting bus and says so: ' + bus.compassSaid);
check(bus.boarded && bus.heldStill, 'stepping up to the bus boards it; on the bus nothing answers');
check(bus.inOrder && bus.steps >= 5 && bus.rideVoice && bus.rideVoice.loop, 'doors open, steps, doors close, the ride from your seat, doors open, steps, doors close, and it drives off: ' + JSON.stringify({ steps: bus.steps, ride: bus.rideVoice }));
check(bus.landedSafe && bus.gone && bus.idleLeft === 0, 'you are left on the floor of the nearest safe zone, the bus gone and its engine with it');

check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
