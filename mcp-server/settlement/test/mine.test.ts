import { test } from "node:test";
import assert from "node:assert/strict";
import { stairStep, branchCell, retracePath, addCrumb, leakNeighbours } from "../src/mine.ts";

test("staircase descends one block per step, 3 high, with a floor below", () => {
  const e = { x: 100, y: 71, z: 200 };
  const s1 = stairStep(e, "east", 1);
  assert.deepEqual(s1.feet, { x: 101, y: 70, z: 200 });
  assert.deepEqual(s1.dig.map((p) => p.y), [70, 71, 72]);
  assert.deepEqual(s1.floor, { x: 101, y: 69, z: 200 });
  const s10 = stairStep(e, "north", 10);
  assert.deepEqual(s10.feet, { x: 100, y: 61, z: 190 });
});

test("climbing back is always possible: each step's head-room covers the jump from the step below", () => {
  const e = { x: 0, y: 64, z: 0 };
  for (let i = 2; i < 20; i++) {
    const lower = stairStep(e, "south", i), upper = stairStep(e, "south", i - 1);
    // Jumping from lower feet (y) onto upper feet (y+1) needs upper cells y+1..y+2 open: upper.dig covers y+1..y+3.
    assert.equal(upper.feet.y, lower.feet.y + 1);
    assert.ok(upper.dig.some((p) => p.y === lower.feet.y + 2));
    // And the lower column is 3 high so the head clears while stepping down.
    assert.equal(lower.dig[2].y, lower.feet.y + 2);
  }
});

test("branch cells are 2 high and level", () => {
  const b = branchCell({ x: 10, y: 12, z: 10 }, "west", 3);
  assert.deepEqual(b.feet, { x: 7, y: 12, z: 10 });
  assert.equal(b.dig.length, 2);
});

test("leak check looks above and to the sides, not below", () => {
  const n = leakNeighbours({ x: 0, y: 0, z: 0 });
  assert.equal(n.length, 5);
  assert.ok(!n.some((p) => p.y === -1));
});

test("breadcrumbs are spaced and retrace runs newest to oldest, ending at the start", () => {
  const trail: { task: string; x: number; y: number; z: number }[] = [];
  for (let i = 0; i <= 30; i++) addCrumb(trail, "t1", { x: i, y: 64 - Math.floor(i / 3), z: 0 });
  addCrumb(trail, "t2", { x: 500, y: 64, z: 0 });
  const mine = trail.filter((t) => t.task === "t1");
  assert.ok(mine.length < 31, "nearby points are skipped");
  const path = retracePath(mine);
  assert.equal(path[0].x, mine[mine.length - 1].x);
  assert.deepEqual(path[path.length - 1], mine[0]);
  for (let i = 1; i < path.length - 1; i++) {
    assert.ok(Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y, path[i].z - path[i - 1].z) >= 6);
  }
});

import { tunnelPath } from "../src/mine.ts";
test("side tunnel goes along z first, then x, staying level and ending at the target", () => {
  const p = tunnelPath({ x: 323, y: 53, z: 672 }, { x: 321, z: 662 });
  assert.equal(p.length, 12);
  assert.deepEqual(p[0], { x: 323, y: 53, z: 671 });
  assert.deepEqual(p[9], { x: 323, y: 53, z: 662 });
  assert.deepEqual(p[11], { x: 321, y: 53, z: 662 });
  assert.ok(p.every((c) => c.y === 53));
});

import { stairCells, tunnelConflicts } from "../src/mine.ts";
test("a tunnel running back under a south-going staircase is detected; leaving sideways is safe", () => {
  const e = { x: 323, y: 71, z: 654 };
  const stairs = stairCells(e, "south", 40);
  const start = { x: 323, y: 53, z: 672 }; // step 18
  // The live bug: z first, back north under the steps.
  assert.ok(tunnelConflicts(tunnelPath(start, { x: 321, z: 661 }, "z"), stairs).length > 0);
  // Sideways first (x), then north at x=321: clear of the 1-wide staircase.
  assert.deepEqual(tunnelConflicts(tunnelPath(start, { x: 321, z: 661 }, "x"), stairs), []);
});
