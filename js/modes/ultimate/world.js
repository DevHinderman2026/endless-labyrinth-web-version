// Ultimate Mode: the world (web 2.0.0, Russell's design of 8 November 2026).
//
// One continuous space, built at random every world: five to ten square areas of
// five kinds (labyrinth, island, tower, battle, event), laid side by side on a
// grid of slots. Every border between two neighbouring areas is either open (the
// two floors simply meet) or a doorway (a wall with a gap you have to find); a
// labyrinth always joins its neighbours through doorways, so its way out is found
// by the next area's sounds leaking through the gap. A labyrinth area has walls
// inside it as well. At least one area is an event area, which has no enemies and
// is the safe zone. Every floor cell of the world can be reached from every
// other: a wall is removed wherever that would not otherwise be so.
//
// The world is made of cells CELL units square: a step is one cell, as in the
// arena modes (3.0 units). Positions are cell centres: x = cx * CELL.
//
// This file has no sound and no DOM in it, so Node can test it (tests/world.mjs).

export const CELL = 3.0;
export const AREA_CELLS = 33;          // an area is this many cells square (99 units; 22 until the first play test, Russell: 1.5 times bigger)
export const PITCH = AREA_CELLS + 1;   // slot to slot: the shared border line takes one cell
export const WORLD_AREAS = [5, 10];
export const KINDS = ['labyrinth', 'island', 'tower', 'battle', 'event'];
export const LAB_DENSITY = [0.10, 0.16];   // (0.16 to 0.24 at first: too many turns for the compass)
export const DOOR_CELLS = 2;           // a doorway is this many cells wide
export const OPEN_BORDER_CHANCE = 0.45;
export const SEABED_CELLS = 12;        // the seabed under an island, its own small floor

// A seeded random source, so a world can be made again (the tests), or
// Math.random when none is given.
export function rng(seed) {
  if (seed === undefined || seed === null) return Math.random;
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const key = (x, y) => x + ',' + y;
const randint = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const choice = (r, arr) => arr[Math.floor(r() * arr.length)];
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // north, east, south, west

// A connected set of n slots on the slot grid, grown from (0, 0).
function growSlots(r, n) {
  const slots = [[0, 0]];
  const have = new Set([key(0, 0)]);
  let guard = 0;
  while (slots.length < n && guard++ < 10000) {
    const [sx, sy] = choice(r, slots);
    const [dx, dy] = choice(r, DIRS);
    const k = key(sx + dx, sy + dy);
    if (have.has(k)) continue;
    have.add(k);
    slots.push([sx + dx, sy + dy]);
  }
  return slots;
}

// Make a world. opts: { seed, areas (count), kinds (forced list, tests) }.
export function makeWorld(opts = {}) {
  const r = rng(opts.seed);
  const n = opts.areas || randint(r, WORLD_AREAS[0], WORLD_AREAS[1]);
  const slots = growSlots(r, n);
  // Kinds: fully random, except that at least one area is an event area.
  const kinds = opts.kinds ? [...opts.kinds] : slots.map(() => choice(r, KINDS));
  if (!kinds.includes('event')) kinds[Math.floor(r() * kinds.length)] = 'event';
  const areas = slots.map(([ax, ay], i) => {
    const x0 = ax * PITCH; const y0 = ay * PITCH;
    return {
      id: i, ax, ay, kind: kinds[i], x0, y0, x1: x0 + AREA_CELLS - 1, y1: y0 + AREA_CELLS - 1,
      centre: [(x0 + (AREA_CELLS - 1) / 2) * CELL, (y0 + (AREA_CELLS - 1) / 2) * CELL],
      borders: [],
    };
  });
  const slotIndex = new Map(slots.map(([ax, ay], i) => [key(ax, ay), i]));
  const floor = new Set();
  const cellArea = new Map();
  for (const a of areas) {
    for (let x = a.x0; x <= a.x1; x++) for (let y = a.y0; y <= a.y1; y++) { floor.add(key(x, y)); cellArea.set(key(x, y), a.id); }
  }
  // Borders between neighbouring slots (east and south of each slot, once each).
  const borders = [];
  for (const a of areas) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const j = slotIndex.get(key(a.ax + dx, a.ay + dy));
      if (j === undefined) continue;
      const b = areas[j];
      const lab = a.kind === 'labyrinth' || b.kind === 'labyrinth';
      const type = !lab && r() < OPEN_BORDER_CHANCE ? 'open' : 'door';
      // The cells of the border line between them.
      const line = [];
      if (dx) { const x = a.x1 + 1; for (let y = a.y0; y <= a.y1; y++) line.push([x, y]); }
      else { const y = a.y1 + 1; for (let x = a.x0; x <= a.x1; x++) line.push([x, y]); }
      let open;
      if (type === 'open') open = line;
      else {
        const at = randint(r, 2, line.length - 1 - DOOR_CELLS - 1);
        open = line.slice(at, at + DOOR_CELLS);
      }
      for (const [x, y] of open) { floor.add(key(x, y)); cellArea.set(key(x, y), a.id); }
      const door = open.length === line.length ? null
        : [(open[0][0] + open[open.length - 1][0]) / 2 * CELL, (open[0][1] + open[open.length - 1][1]) / 2 * CELL];
      const border = { a: a.id, b: b.id, type, cells: open, door, axis: dx ? 'x' : 'y', line: dx ? a.x1 + 1 : a.y1 + 1 };
      borders.push(border);
      a.borders.push(border); b.borders.push(border);
    }
  }
  // Walls inside labyrinth areas, clear of the cells beside their openings.
  const keepClear = new Set();
  for (const bd of borders) {
    for (const [x, y] of bd.cells) for (const [dx, dy] of DIRS) keepClear.add(key(x + dx, y + dy));
  }
  for (const a of areas) {
    if (a.kind !== 'labyrinth') continue;
    const density = LAB_DENSITY[0] + r() * (LAB_DENSITY[1] - LAB_DENSITY[0]);
    a.density = density;
    for (let x = a.x0; x <= a.x1; x++) {
      for (let y = a.y0; y <= a.y1; y++) {
        const k = key(x, y);
        if (keepClear.has(k)) continue;
        if (r() < density) floor.delete(k);
      }
    }
  }
  const world = {
    seed: opts.seed, areas, borders, floor, cellArea,
    bounds: {
      x0: Math.min(...areas.map((a) => a.x0)), x1: Math.max(...areas.map((a) => a.x1)),
      y0: Math.min(...areas.map((a) => a.y0)), y1: Math.max(...areas.map((a) => a.y1)),
    },
  };
  world.carved = connectAll(world, r);
  // A labyrinth's floor cells, for placing things off its walls.
  for (const a of areas) a.floorCells = areaFloor(world, a);
  return world;
}

// Every floor cell reachable from every other. Where not, a wall cell that
// touches both the reached and the unreached floor is opened, until it is so.
// Returns how many walls were opened (the tests check it stays small).
export function connectAll(world, r = Math.random) {
  let carved = 0;
  for (let round = 0; round < 500; round++) {
    const cells = [...world.floor];
    if (!cells.length) return carved;
    const reached = floodFrom(world, cells[0]);
    if (reached.size === world.floor.size) return carved;
    // Walls (not floor, inside the world's box or a border line) next to both.
    const candidates = [];
    const seen = new Set();
    for (const k of world.floor) {
      if (!reached.has(k)) continue;
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of DIRS) {
        const wx = x + dx; const wy = y + dy; const wk = key(wx, wy);
        if (world.floor.has(wk) || seen.has(wk)) continue;
        seen.add(wk);
        if (!insideWorld(world, wx, wy)) continue;
        if (DIRS.some(([ex, ey]) => { const nk = key(wx + ex, wy + ey); return world.floor.has(nk) && !reached.has(nk); })) candidates.push(wk);
      }
    }
    if (!candidates.length) {
      // Two cells apart (a wall two thick): open a straight run between them.
      const unreached = cells.find((k) => !reached.has(k));
      const [ux, uy] = unreached.split(',').map(Number);
      let best = null;
      for (const k of reached) {
        const [x, y] = k.split(',').map(Number);
        const d = Math.abs(x - ux) + Math.abs(y - uy);
        if (!best || d < best[0]) best = [d, x, y];
      }
      let [, x, y] = best;
      while (x !== ux || y !== uy) {
        if (x !== ux) x += Math.sign(ux - x); else y += Math.sign(uy - y);
        if (!world.floor.has(key(x, y))) { world.floor.add(key(x, y)); carved += 1; }
      }
      continue;
    }
    const pick = candidates[Math.floor(r() * candidates.length)];
    world.floor.add(pick);
    if (!world.cellArea.has(pick)) {
      const [x, y] = pick.split(',').map(Number);
      const near = DIRS.map(([dx, dy]) => world.cellArea.get(key(x + dx, y + dy))).find((v) => v !== undefined);
      if (near !== undefined) world.cellArea.set(pick, near);
    }
    carved += 1;
  }
  return carved;
}

function insideWorld(world, x, y) {
  const b = world.bounds;
  return x >= b.x0 - 1 && x <= b.x1 + 1 && y >= b.y0 - 1 && y <= b.y1 + 1;
}

export function floodFrom(world, startKey) {
  const reached = new Set([startKey]);
  const queue = [startKey];
  let head = 0;
  while (head < queue.length) {
    const [x, y] = queue[head++].split(',').map(Number);
    for (const [dx, dy] of DIRS) {
      const k = key(x + dx, y + dy);
      if (world.floor.has(k) && !reached.has(k)) { reached.add(k); queue.push(k); }
    }
  }
  return reached;
}

export function areaFloor(world, a) {
  const out = [];
  for (let x = a.x0; x <= a.x1; x++) for (let y = a.y0; y <= a.y1; y++) if (world.floor.has(key(x, y))) out.push([x, y]);
  return out;
}

// ---------------------------------------------------------------- positions
export const toCell = (v) => Math.round(v / CELL);
export const cellOf = (pos) => [toCell(pos[0]), toCell(pos[1])];
export const posOf = (cx, cy) => [cx * CELL, cy * CELL];

export function isFloor(world, cx, cy) { return world.floor.has(key(cx, cy)); }

// The area a position is in (border cells count with the area they were given;
// a position off every area, such as a wall, gets the nearest area).
export function areaAt(world, pos) {
  const [cx, cy] = cellOf(pos);
  const id = world.cellArea.get(key(cx, cy));
  if (id !== undefined) return world.areas[id];
  let best = null;
  for (const a of world.areas) {
    const d = Math.hypot(pos[0] - a.centre[0], pos[1] - a.centre[1]);
    if (!best || d < best[0]) best = [d, a];
  }
  return best ? best[1] : null;
}

// The nearest point of an area's square to a position, in world units, and how
// far outside it the position is (0 inside).
export function nearestPointOf(a, pos) {
  const lo = [a.x0 * CELL, a.y0 * CELL]; const hi = [a.x1 * CELL, a.y1 * CELL];
  const px = Math.max(lo[0], Math.min(hi[0], pos[0]));
  const py = Math.max(lo[1], Math.min(hi[1], pos[1]));
  return [[px, py], Math.hypot(pos[0] - px, pos[1] - py)];
}

// Where a neighbouring area's sound reaches a listener from: through the doorway
// when the two areas join through one, else the nearest point of the border.
export function leakPoint(world, listenerArea, area, pos) {
  const bd = area.borders.find((b) => (b.a === listenerArea.id && b.b === area.id) || (b.b === listenerArea.id && b.a === area.id));
  if (bd && bd.door) return bd.door;
  return nearestPointOf(area, pos)[0];
}

// The echo weights of a position over the areas near it: its own area, and,
// within BLEND units of a border, the area across that border too.
export const BLEND = 9.0;
export function echoMix(world, pos) {
  const a = areaAt(world, pos);
  if (!a) return {};
  const mix = { [a.id]: 1.0 };
  for (const bd of a.borders) {
    const other = bd.a === a.id ? bd.b : bd.a;
    const linePos = bd.line * CELL;
    const d = Math.abs((bd.axis === 'x' ? pos[0] : pos[1]) - linePos);
    if (d >= BLEND) continue;
    // Through a doorway the other side is heard only near the gap itself.
    if (bd.door) {
      const along = bd.axis === 'x' ? Math.abs(pos[1] - bd.door[1]) : Math.abs(pos[0] - bd.door[0]);
      if (along > BLEND) continue;
    }
    const w = 0.5 * (1 - d / BLEND);
    mix[other] = Math.max(mix[other] || 0, w);
    mix[a.id] = Math.min(mix[a.id], 1 - w);
  }
  return mix;
}

// A random floor cell of an area at least `minDist` units from `from` and from
// everything in `avoid`, or null.
export function randomFloor(world, a, r, { from = null, minDist = 0, maxDist = Infinity, avoid = [], clearance = 9.0, tries = 200 } = {}) {
  const cells = a.floorCells || areaFloor(world, a);
  if (!cells.length) return null;
  for (let i = 0; i < tries; i++) {
    const [cx, cy] = cells[Math.floor(r() * cells.length)];
    const p = posOf(cx, cy);
    if (from) { const d = Math.hypot(p[0] - from[0], p[1] - from[1]); if (d < minDist || d > maxDist) continue; }
    if (avoid.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < clearance)) continue;
    return p;
  }
  return null;
}

// ---------------------------------------------------------------- the compass
// The shortest walk from a cell to any cell of an area that `isGoal(area)`
// accepts, as the cells after the start, or null when already there or no way.
// With `goalCell`, the goal is that one cell instead (the bus, say).
export function routeToward(world, fromCell, isGoal, goalCell = null) {
  const start = key(fromCell[0], fromCell[1]);
  if (!world.floor.has(start)) return null;
  const goalKey = goalCell ? key(goalCell[0], goalCell[1]) : null;
  const atGoal = (k, id) => (goalKey ? k === goalKey : (id !== undefined && isGoal(world.areas[id])));
  if (atGoal(start, world.cellArea.get(start))) return null;
  const prev = new Map([[start, null]]);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const k = queue[head++];
    const [x, y] = k.split(',').map(Number);
    const id = world.cellArea.get(k);
    if (k !== start && atGoal(k, id)) {
      const path = [];
      for (let cur = k; cur && cur !== start; cur = prev.get(cur)) path.push(cur.split(',').map(Number));
      return path.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const nk = key(x + dx, y + dy);
      if (world.floor.has(nk) && !prev.has(nk)) { prev.set(nk, k); queue.push(nk); }
    }
  }
  return null;
}

// The route's first leg: its direction (one of DIRS), how many steps it runs
// straight before the route turns, and whether it reaches the goal without
// turning; null when already there or no way. (The compass speaks this.)
export function firstLegToward(world, fromCell, isGoal, goalCell = null) {
  const path = routeToward(world, fromCell, isGoal, goalCell);
  if (!path || !path.length) return null;
  const dir = [path[0][0] - fromCell[0], path[0][1] - fromCell[1]];
  let steps = 1;
  for (let i = 1; i < path.length; i++) {
    const d = [path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]];
    if (d[0] !== dir[0] || d[1] !== dir[1]) break;
    steps += 1;
  }
  return { dir, steps, arrives: steps === path.length };
}

// The first step alone, or null (see firstLegToward).
export function firstStepToward(world, fromCell, isGoal) {
  const leg = firstLegToward(world, fromCell, isGoal);
  return leg ? leg.dir : null;
}

// Steps from a cell to the nearest goal area (the tests), or Infinity.
export function stepsToward(world, fromCell, isGoal) {
  const start = key(fromCell[0], fromCell[1]);
  const dist = new Map([[start, 0]]);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const k = queue[head++];
    const id = world.cellArea.get(k);
    if (id !== undefined && isGoal(world.areas[id])) return dist.get(k);
    const [x, y] = k.split(',').map(Number);
    for (const [dx, dy] of DIRS) {
      const nk = key(x + dx, y + dy);
      if (world.floor.has(nk) && !dist.has(nk)) { dist.set(nk, dist.get(k) + 1); queue.push(nk); }
    }
  }
  return Infinity;
}

// The seabed under an island: its own square floor, the elevator in the middle.
export function makeSeabed() {
  const half = Math.floor(SEABED_CELLS / 2);
  const floor = new Set();
  for (let x = -half; x <= half; x++) for (let y = -half; y <= half; y++) floor.add(key(x, y));
  return { floor, half, elevator: [0, 0] };
}
