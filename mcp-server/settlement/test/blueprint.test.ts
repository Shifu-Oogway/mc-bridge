import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as B from "../src/blueprint.ts";

const bp = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "blueprints", "starter-workshop.json"), "utf8")) as B.Blueprint;

test("starter workshop blueprint validates", () => {
  assert.deepEqual(B.validate(bp), []);
});

test("rotation: local +z maps to the facing direction", () => {
  assert.deepEqual(B.rotateXZ(0, 1, B.turnsFor("south")), [0, 1]);
  assert.deepEqual(B.rotateXZ(0, 1, B.turnsFor("west")), [-1, 0]);
  assert.deepEqual(B.rotateXZ(0, 1, B.turnsFor("north")), [0, -1]);
  assert.deepEqual(B.rotateXZ(0, 1, B.turnsFor("east")), [1, 0]);
});

test("block states rotate with the building", () => {
  // Front turned east: the local back (north) now points west.
  assert.equal(B.rotateProps({ facing: "north" }, B.turnsFor("east")).facing, "west");
  assert.equal(B.rotateProps({ facing: "south" }, B.turnsFor("east")).facing, "east");
  assert.equal(B.rotateProps({ facing: "north" }, B.turnsFor("north")).facing, "south");
  assert.equal(B.rotateProps({ axis: "x" }, 1).axis, "z");
  assert.equal(B.rotateProps({ axis: "x" }, 2).axis, "x");
  assert.equal(B.rotateProps({ rotation: "14" }, 1).rotation, "2");
});

test("door faces into the building for every orientation", () => {
  for (const f of ["north", "east", "south", "west"] as B.Facing[]) {
    const cells = B.expand(bp, { origin: { x: 100, y: 64, z: 200 }, facing: f }, { stages: ["frame"] });
    const door = cells.find((c) => c.id === "minecraft:oak_door" && c.props.half === "lower")!;
    // The door's facing is the direction a player walks to enter: opposite of the building's front.
    const opposite = { north: "south", south: "north", east: "west", west: "east" }[f];
    assert.equal(door.props.facing, opposite, `facing ${f}`);
  }
});

test("expand is bottom-up and later ops override earlier ones", () => {
  const cells = B.expand(bp, { origin: { x: 0, y: 0, z: 0 }, facing: "south" }, { stages: ["frame"] });
  for (let i = 1; i < cells.length; i++) assert.ok(cells[i].pos.y >= cells[i - 1].pos.y);
  const win = cells.find((c) => c.pos.x === 2 && c.pos.y === 3 && c.pos.z === 7)!;
  assert.equal(win.id, "minecraft:glass_pane");
});

test("footprint matches size for rotated placements", () => {
  const fp = B.footprint(bp, { origin: { x: 10, y: 64, z: 10 }, facing: "east" });
  assert.equal(fp.to.x - fp.from.x + 1, bp.size.d);
  assert.equal(fp.to.z - fp.from.z + 1, bp.size.w);
});

test("materials: doors count once, air counts nothing", () => {
  const cells = B.expand(bp, { origin: { x: 0, y: 0, z: 0 }, facing: "south" });
  const m = B.materials(cells);
  assert.equal(m["minecraft:oak_door"], 1);
  assert.equal(m["minecraft:air"], undefined);
  assert.ok(m["minecraft:cobbled_deepslate_stairs"] > 50);
});

test("classify distinguishes missing, obstructed and wrong state", () => {
  const c: B.Cell = { pos: { x: 0, y: 0, z: 0 }, id: "minecraft:oak_stairs", props: { facing: "north", half: "bottom" }, stage: "s" };
  assert.equal(B.classify(c, { id: "minecraft:air" }), "missing");
  assert.equal(B.classify(c, { id: "minecraft:short_grass", replaceable: true }), "missing");
  assert.equal(B.classify(c, { id: "minecraft:dirt" }), "obstructed");
  assert.equal(B.classify(c, { id: "minecraft:oak_stairs", properties: { facing: "east", half: "bottom" } }), "wrong_state");
  assert.equal(B.classify(c, { id: "minecraft:oak_stairs", properties: { facing: "north", half: "bottom", shape: "outer_left" } }), "ok");
  assert.equal(B.classify(c, { id: "minecraft:air", loaded: false }), "unloaded");
});

test("standFor puts the player behind stairs and in front of furnaces", () => {
  const stair: B.Cell = { pos: { x: 0, y: 0, z: 0 }, id: "minecraft:oak_stairs", props: { facing: "north" }, stage: "s" };
  assert.deepEqual(B.standFor(stair), { x: 0, y: 0, z: 2 });
  const furnace: B.Cell = { pos: { x: 0, y: 0, z: 0 }, id: "minecraft:furnace", props: { facing: "south" }, stage: "s" };
  assert.deepEqual(B.standFor(furnace), { x: 0, y: 0, z: 2 });
});

test("substitutions swap palette entries", () => {
  const cells = B.expand(bp, { origin: { x: 0, y: 0, z: 0 }, facing: "south" }, { stages: ["frame"], substitutions: { I: "minecraft:birch_planks" } });
  assert.ok(cells.some((c) => c.id === "minecraft:birch_planks"));
  assert.ok(!cells.some((c) => c.id === "minecraft:smooth_sandstone"));
});
