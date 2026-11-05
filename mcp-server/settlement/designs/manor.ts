// Manor house, hand-designed. Design coordinates: ground-floor walls x0..20, z0..10, front (door side) at high z.
// Converted to a Blueprint with a non-negative local frame (offset dx=+1, dz=+2).
import type { Blueprint, Op } from "../src/blueprint.ts";

type P = [number, number, number];
const DX = 3, DZ = 2;
const stages: Record<string, Op[]> = {};
let cur: Op[] = [];
const stage = (id: string) => { cur = stages[id] = []; };
const sh = (p: P): [number, number, number] => [p[0] + DX, p[1], p[2] + DZ];
const box = (a: P, b: P, block: string) => cur.push({ kind: "box", from: sh(a), to: sh(b), block });
const walls = (a: P, b: P, block: string) => cur.push({ kind: "walls", from: sh(a), to: sh(b), block });
const put = (a: P, block: string) => cur.push({ kind: "block", from: sh(a), block });

const STONE = "minecraft:stone_bricks", MOSSY = "minecraft:mossy_stone_bricks", INFILL = "minecraft:polished_diorite",
  POST = "minecraft:oak_log", BEAM = "minecraft:stripped_oak_wood", FLOOR = "minecraft:spruce_planks", PANE = "minecraft:glass_pane",
  RN = "minecraft:deepslate_tile_stairs[facing=south,half=bottom]", RS = "minecraft:deepslate_tile_stairs[facing=north,half=bottom]",
  RE = "minecraft:deepslate_tile_stairs[facing=east,half=bottom]", RW = "minecraft:deepslate_tile_stairs[facing=west,half=bottom]",
  BARGE_N = "minecraft:oak_stairs[facing=south,half=bottom]", BARGE_S = "minecraft:oak_stairs[facing=north,half=bottom]",
  COPPER = "minecraft:waxed_cut_copper", BRICK = "minecraft:bricks";

// ---- foundation & ground floor (stone) ----
stage("foundation");
box([0, 0, 0], [20, 0, 10], MOSSY);
box([0, 1, 0], [20, 1, 10], STONE);
box([1, 1, 1], [19, 1, 9], FLOOR);
box([6, 0, 11], [14, 1, 13], STONE);              // porch platform
box([8, 0, 14], [12, 0, 14], "minecraft:stone_brick_stairs[facing=south,half=bottom]");

stage("ground");
walls([0, 2, 0], [20, 5, 10], STONE);
box([1, 2, 1], [19, 4, 9], "minecraft:air");
for (const x of [2, 3, 7, 13, 17, 18]) { put([x, 3, 0], PANE); if (x < 7 || x > 13) put([x, 3, 10], PANE); }
for (const z of [3, 7]) { put([0, 3, z], PANE); put([20, 3, z], PANE); }
put([10, 2, 10], "minecraft:spruce_door[facing=north,half=lower,hinge=left]");
put([10, 3, 10], "minecraft:spruce_door[facing=north,half=upper,hinge=left]");
box([9, 4, 10], [11, 4, 10], BEAM);
box([1, 5, 1], [19, 5, 9], FLOOR);                // upper floor deck

// ---- upper floor: jettied timber frame ----
stage("upper");
box([0, 5, -1], [20, 5, -1], BEAM); box([0, 5, 11], [20, 5, 11], BEAM);
for (let x = 0; x <= 20; x += 2) { put([x, 4, -1], "minecraft:oak_stairs[facing=south,half=top]"); if (x < 6 || x > 14) put([x, 4, 11], "minecraft:oak_stairs[facing=north,half=top]"); }
walls([0, 6, -1], [20, 9, 11], INFILL);
box([1, 6, 0], [19, 9, 10], "minecraft:air");
box([1, 5, 0], [19, 5, 0], FLOOR); box([1, 5, 10], [19, 5, 10], FLOOR);
for (const x of [0, 4, 8, 12, 16, 20]) { box([x, 6, -1], [x, 9, -1], POST); box([x, 6, 11], [x, 9, 11], POST); }
for (const z of [-1, 3, 7, 11]) { box([0, 6, z], [0, 9, z], POST); box([20, 6, z], [20, 9, z], POST); }
box([0, 8, -1], [20, 8, -1], BEAM); box([0, 8, 11], [20, 8, 11], BEAM);   // mid rail between window and plate
for (const x of [2, 6, 10, 14, 18]) { put([x, 7, -1], PANE); if (x < 6 || x > 14) put([x, 7, 11], PANE); }
for (const z of [1, 5, 9]) { put([0, 7, z], PANE); put([20, 7, z], PANE); }
box([0, 10, -1], [20, 10, 11], BEAM);              // plate + attic floor
box([1, 10, 0], [19, 10, 10], FLOOR);

// ---- front bay (porch below, room above), balcony ----
stage("bay");
for (const x of [6, 14]) box([x, 2, 13], [x, 5, 13], POST);
box([6, 5, 11], [14, 5, 13], BEAM);
for (const x of [7, 9, 11, 13]) put([x, 4, 13], "minecraft:oak_stairs[facing=north,half=top]");
walls([6, 6, 11], [14, 9, 13], INFILL);
for (const x of [6, 14]) for (const z of [11, 13]) box([x, 6, z], [x, 9, z], POST);
box([7, 6, 11], [13, 9, 12], "minecraft:air");
box([7, 5, 11], [13, 5, 12], FLOOR);
put([8, 7, 13], PANE); put([12, 7, 13], PANE);
put([10, 6, 13], "minecraft:spruce_door[facing=south,half=lower,hinge=left]");
put([10, 7, 13], "minecraft:spruce_door[facing=south,half=upper,hinge=left]");
box([7, 5, 14], [13, 5, 14], "minecraft:spruce_slab[type=top]");
box([7, 6, 15], [13, 6, 15], "minecraft:oak_fence"); put([6, 6, 14], "minecraft:oak_fence"); put([14, 6, 14], "minecraft:oak_fence");
box([7, 5, 15], [13, 5, 15], "minecraft:spruce_slab[type=top]");
put([7, 7, 15], "minecraft:lantern"); put([13, 7, 15], "minecraft:lantern");

// ---- roofs ----
stage("roof");
for (let k = 0; k <= 7; k++) {
  const y = 10 + k, zn = -2 + k, zs = 12 - k;
  if (zn === zs) { box([-1, y, zn], [21, y, zn], "minecraft:deepslate_tiles"); box([-1, y + 1, zn], [21, y + 1, zn], "minecraft:deepslate_tile_slab[type=bottom]"); break; }
  box([-1, y, zn], [21, y, zn], RN); box([-1, y, zs], [21, y, zs], RS);
  put([-1, y, zn], BARGE_N); put([21, y, zn], BARGE_N); put([-1, y, zs], BARGE_S); put([21, y, zs], BARGE_S);
  if (k > 0 && zs - zn > 1) { box([0, y, zn + 1], [0, y, zs - 1], INFILL); box([20, y, zn + 1], [20, y, zs - 1], INFILL); }
}
for (const x of [0, 20]) { box([x, 11, 5], [x, 16, 5], POST); put([x, 13, 3], PANE); put([x, 13, 7], PANE); }
// Cross gable over the bay: ridge along z at x = 10, from the main roof out to the bay front.
for (let k = 0; k <= 5; k++) {
  const y = 10 + k, xw = 5 + k, xe = 15 - k;
  if (xw === xe) { box([10, y, 6], [10, y, 14], "minecraft:deepslate_tiles"); box([10, y + 1, 6], [10, y + 1, 14], "minecraft:deepslate_tile_slab[type=bottom]"); break; }
  box([xw, y, 6 + k], [xw, y, 14], RE); box([xe, y, 6 + k], [xe, y, 14], RW);
  put([xw, y, 14], "minecraft:oak_stairs[facing=east,half=bottom]"); put([xe, y, 14], "minecraft:oak_stairs[facing=west,half=bottom]");
  if (k > 0 && xe - xw > 1) box([xw + 1, y, 13], [xe - 1, y, 13], INFILL);
}
box([10, 11, 13], [10, 11, 13], COPPER); box([9, 12, 13], [9, 12, 13], COPPER); box([11, 12, 13], [11, 12, 13], COPPER); box([10, 13, 13], [10, 13, 13], COPPER);
put([10, 12, 13], "minecraft:glass");

// ---- tower (east) and chimney (west) ----
stage("tower");
walls([16, 2, 1], [20, 9, 5], STONE);
walls([16, 10, 1], [20, 16, 5], INFILL);
for (const x of [16, 20]) for (const z of [1, 5]) box([x, 10, z], [x, 16, z], POST);
box([16, 13, 1], [20, 13, 5], BEAM); box([16, 17, 1], [20, 17, 5], BEAM);
box([17, 10, 2], [19, 16, 4], "minecraft:air");
for (const [x, z] of [[18, 1], [18, 5], [16, 3], [20, 3]] as [number, number][]) { put([x, 11, z], PANE); put([x, 15, z], PANE); }
for (let k = 0; k <= 2; k++) {
  const y = 18 + k, lo = 15 + k, hi = 21 - k;
  box([lo, y, lo - 15], [hi, y, lo - 15], "minecraft:waxed_cut_copper_stairs[facing=south,half=bottom]");
  box([lo, y, hi - 15], [hi, y, hi - 15], "minecraft:waxed_cut_copper_stairs[facing=north,half=bottom]");
  box([lo, y, lo - 14], [lo, y, hi - 16], "minecraft:waxed_cut_copper_stairs[facing=east,half=bottom]");
  box([hi, y, lo - 14], [hi, y, hi - 16], "minecraft:waxed_cut_copper_stairs[facing=west,half=bottom]");
}
put([18, 21, 3], COPPER); put([18, 22, 3], "minecraft:lightning_rod");
stage("chimney");
box([-2, 0, 4], [-1, 19, 6], BRICK);
box([-2, 17, 4], [-1, 17, 6], COPPER);
box([-2, 20, 4], [-1, 20, 6], "minecraft:brick_wall");
put([-1, 2, 5], "minecraft:air"); put([0, 2, 5], "minecraft:air");
put([-1, 1, 5], "minecraft:campfire[lit=true,facing=east]");

// ---- interior ----
stage("interior");
box([1, 2, 2], [1, 2, 4], "minecraft:smoker[facing=east]");
put([1, 2, 6], "minecraft:barrel[facing=up]"); put([1, 2, 7], "minecraft:water_cauldron[level=3]");
box([3, 2, 4], [4, 2, 6], "minecraft:spruce_slab[type=top]");
box([14, 2, 5], [17, 2, 5], "minecraft:spruce_slab[type=top]");
box([14, 2, 4], [17, 2, 4], "minecraft:spruce_stairs[facing=south,half=bottom]");
box([14, 2, 6], [17, 2, 6], "minecraft:spruce_stairs[facing=north,half=bottom]");
box([8, 2, 4], [12, 2, 8], "minecraft:red_carpet");
for (let i = 0; i < 4; i++) put([2 + i, 2 + i, 1], "minecraft:spruce_stairs[facing=east,half=bottom]");
box([3, 5, 1], [6, 5, 2], "minecraft:air");
for (const x of [5, 10, 15]) put([x, 4, 5], "minecraft:lantern[hanging=true]");
put([17, 6, 3], "minecraft:red_bed[facing=north,part=head]"); put([17, 6, 4], "minecraft:red_bed[facing=north,part=foot]");
put([19, 6, 2], "minecraft:chest[facing=west]");
box([1, 6, 3], [1, 7, 8], "minecraft:bookshelf");
put([4, 6, 6], "minecraft:lectern[facing=west]");
for (const x of [5, 10, 15]) put([x, 9, 5], "minecraft:lantern[hanging=true]");

export const manor: Blueprint = {
  id: "manor", name: "Manor House", purpose: "Hall, kitchen & dining, bedroom, study, balcony; tower and chimney",
  size: { w: 25, h: 23, d: 18 },
  palette: {},
  stages: Object.entries(stages).map(([id, ops]) => ({ id, name: id, ops })),
  notes: ["Front (door, porch, balcony) is local +z; place facing north so it opens onto the manor court.",
    "Upper floor jetties one block over the ground floor on the long sides, carried on upside-down oak stair corbels."],
};
