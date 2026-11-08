// Ultimate Mode's world generator (web 2.0.0), in Node alone: over many
// seeds, every world is connected, every area is reachable from every other,
// every world has a safe zone, labyrinths join through doorways, and the compass
// finds a first step from anywhere. Run: node tests/world.mjs
import { makeWorld, floodFrom, firstStepToward, stepsToward, areaAt, echoMix, randomFloor, rng, KINDS, WORLD_AREAS, posOf } from '../js/modes/ultimate/world.js';

let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
const SEEDS = 400;
let disconnected = 0; let noSafe = 0; let outOfRange = 0; let noRoute = 0; let openLab = 0; let carvedMax = 0; let bigCarve = 0;
const kinds = Object.fromEntries(KINDS.map((k) => [k, 0]));
const t0 = Date.now();
for (let seed = 1; seed <= SEEDS; seed++) {
  const w = makeWorld({ seed });
  if (w.areas.length < WORLD_AREAS[0] || w.areas.length > WORLD_AREAS[1]) outOfRange++;
  if (!w.areas.some((a) => a.kind === 'event')) noSafe++;
  const cells = [...w.floor];
  if (floodFrom(w, cells[0]).size !== w.floor.size) disconnected++;
  for (const a of w.areas) {
    kinds[a.kind]++;
    const c = a.floorCells[Math.floor(a.floorCells.length / 2)];
    if (!isFinite(stepsToward(w, c, (x) => x.kind === 'event'))) noRoute++;
    if (a.kind !== 'event' && !firstStepToward(w, c, (x) => x.kind === 'event')) noRoute++;
  }
  for (const b of w.borders) {
    const lab = w.areas[b.a].kind === 'labyrinth' || w.areas[b.b].kind === 'labyrinth';
    if (lab && b.type !== 'door') openLab++;
  }
  carvedMax = Math.max(carvedMax, w.carved);
  if (w.carved > 20) bigCarve++;
}
const ms = Date.now() - t0;
check(disconnected === 0, `${SEEDS} worlds: every floor cell reachable from every other (${disconnected} not)`);
check(noSafe === 0, 'every world has at least one event area, the safe zone');
check(outOfRange === 0, `every world has ${WORLD_AREAS[0]} to ${WORLD_AREAS[1]} areas`);
check(noRoute === 0, 'the compass finds a route to a safe zone from the middle of every area');
check(openLab === 0, 'a labyrinth always joins its neighbours through doorways');
check(bigCarve === 0, `connecting the world never opens more than 20 walls (most ${carvedMax})`);
check(Object.values(kinds).every((n) => n > 0), 'every kind of area occurs: ' + JSON.stringify(kinds));
check(ms / SEEDS < 150, `a world is made in ${(ms / SEEDS).toFixed(0)} ms on average`);
// The same seed makes the same world; different seeds differ.
const a1 = makeWorld({ seed: 42 }); const a2 = makeWorld({ seed: 42 }); const b = makeWorld({ seed: 43 });
check(JSON.stringify(a1.areas.map((x) => [x.kind, x.ax, x.ay])) === JSON.stringify(a2.areas.map((x) => [x.kind, x.ax, x.ay])) && a1.floor.size === a2.floor.size, 'a seed makes the same world again');
check(JSON.stringify(a1.areas.map((x) => x.kind)) !== JSON.stringify(b.areas.map((x) => x.kind)) || a1.floor.size !== b.floor.size, 'another seed makes another world');
// Positions, areas and the echo mix.
const w = makeWorld({ seed: 7 });
const area = w.areas[0];
const r = rng(5);
const p = randomFloor(w, area, r, { from: area.centre, minDist: 6 });
check(p && areaAt(w, p) === area, 'a random floor spot of an area is in that area');
const mix = echoMix(w, area.centre);
check(Object.keys(mix).length === 1 && mix[area.id] === 1, 'in the middle of an area the echo is that area\'s alone');
// Near a border the other side comes in (an open border, if the world has one).
const open = w.borders.find((bd) => bd.type === 'open') || w.borders[0];
const near = open.axis === 'x' ? posOf(open.line - 1, open.cells[0][1]) : posOf(open.cells[0][0], open.line - 1);
const m2 = echoMix(w, near);
check(Object.keys(m2).length === 2 && Math.abs(m2[open.a] + m2[open.b] - 1) < 1e-6, `beside a border both echoes are heard, weights summing to one: ${JSON.stringify(m2)}`);
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
