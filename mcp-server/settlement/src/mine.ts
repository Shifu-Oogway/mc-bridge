// Pure geometry for the dedicated staircase mine and for retracing breadcrumbs. Unit-tested; tools.ts drives the game.

export type Dir = "north" | "south" | "east" | "west";
export type P = { x: number; y: number; z: number };
export const DV: Record<Dir, { x: number; z: number }> = { north: { x: 0, z: -1 }, south: { x: 0, z: 1 }, east: { x: 1, z: 0 }, west: { x: -1, z: 0 } };

/**
 * Staircase step i (1-based) going down from `entrance` (the standing cell at the top): the player stands at
 * feet = entrance + i*dir, y - i. Each column is dug 3 high (feet, head, and one above for the jump when climbing
 * back), and the floor below the feet must be solid.
 */
export function stairStep(entrance: P, dir: Dir, i: number) {
  const d = DV[dir];
  const feet = { x: entrance.x + d.x * i, y: entrance.y - i, z: entrance.z + d.z * i };
  return { feet, dig: [feet, { ...feet, y: feet.y + 1 }, { ...feet, y: feet.y + 2 }], floor: { ...feet, y: feet.y - 1 } };
}

/** Branch tunnel cell j (1-based) from the stair bottom: 2 high, floor below. */
export function branchCell(bottom: P, dir: Dir, j: number) {
  const d = DV[dir];
  const feet = { x: bottom.x + d.x * j, y: bottom.y, z: bottom.z + d.z * j };
  return { feet, dig: [feet, { ...feet, y: feet.y + 1 }], floor: { ...feet, y: feet.y - 1 } };
}

/**
 * Feet cells of an L-shaped side tunnel from `start` (excluded) to `to` at the same y. The first leg runs along
 * `firstAxis`; for a tunnel leaving a staircase this must be the axis perpendicular to the stairs, otherwise the
 * tunnel runs under the steps and digs out their floors (happened live on 2026-11-03).
 */
export function tunnelPath(start: P, to: { x: number; z: number }, firstAxis: "x" | "z" = "z"): P[] {
  const out: P[] = [];
  let { x, z } = start;
  const legX = () => { while (x !== to.x) { x += Math.sign(to.x - x); out.push({ x, y: start.y, z }); } };
  const legZ = () => { while (z !== to.z) { z += Math.sign(to.z - z); out.push({ x, y: start.y, z }); } };
  if (firstAxis === "x") { legX(); legZ(); } else { legZ(); legX(); }
  return out;
}

/** Every cell the staircase needs (its dug cells and the floor under each step), keyed "x,y,z". */
export function stairCells(entrance: P, dir: Dir, steps: number): Set<string> {
  const s = new Set<string>([`${entrance.x},${entrance.y - 1},${entrance.z}`]);
  for (let i = 1; i <= steps + 1; i++) {
    const st = stairStep(entrance, dir, i);
    for (const c of [...st.dig, st.floor]) s.add(`${c.x},${c.y},${c.z}`);
  }
  return s;
}

/** Cells of a tunnel (2-high + floor) that would touch the staircase; empty means the tunnel is safe. */
export function tunnelConflicts(path: P[], stairs: Set<string>): P[] {
  const bad: P[] = [];
  for (const f of path) for (const c of [f, { ...f, y: f.y + 1 }, { ...f, y: f.y - 1 }]) if (stairs.has(`${c.x},${c.y},${c.z}`)) bad.push(c);
  return bad;
}

/** The six neighbours of a cell that could leak fluid into it once it is opened (not the one below). */
export function leakNeighbours(c: P): P[] {
  return [{ ...c, y: c.y + 1 }, { ...c, x: c.x + 1 }, { ...c, x: c.x - 1 }, { ...c, z: c.z + 1 }, { ...c, z: c.z - 1 }];
}

/**
 * Waypoints to walk back along a breadcrumb trail (newest first), thinned so consecutive points are at least
 * `spacing` apart. The last point is the trail's start (where the task began).
 */
export function retracePath(trail: P[], spacing = 6): P[] {
  const rev = [...trail].reverse();
  const out: P[] = [];
  for (const p of rev) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) >= spacing) out.push(p);
  }
  const start = rev[rev.length - 1];
  if (start && out[out.length - 1] !== start) out.push(start);
  return out;
}

/** Add a breadcrumb only if the player moved at least `min` blocks since the last one of the same task. */
export function addCrumb(trail: { task: string; x: number; y: number; z: number }[], task: string, p: P, min = 3) {
  const last = [...trail].reverse().find((t) => t.task === task);
  if (last && Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) < min) return false;
  trail.push({ task, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, z: Math.round(p.z * 10) / 10 });
  return true;
}
