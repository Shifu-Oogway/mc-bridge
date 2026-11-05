// Watermill on the user's outline x279..299, z647..661 (sign at 293,71,655). Lake to the west (x<=288, surface y62),
// slope x289..291, land y70 from x292. Materials match the manor: deepslate base, dark oak frame, mud-brick infill,
// blackstone roof. Two large water wheels on the lake gable, fed from above by a timber flume (overshot), standing in
// a deepslate millrace channel. World coordinates throughout; y70 = ground/outline level.
import type { Blueprint, Op } from "../src/blueprint.ts";

const C = new Map<string, string>();
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const set = (x: number, y: number, z: number, b: string) => { C.set(key(x, y, z), b); };
const get = (x: number, y: number, z: number) => C.get(key(x, y, z));
const fill = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: string) => {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) set(x, y, z, b);
};
const ring = (x0: number, y: number, z0: number, x1: number, z1: number, b: string) => {
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (x === x0 || x === x1 || z === z0 || z === z1) set(x, y, z, b);
};

const DSB = "minecraft:deepslate_bricks", PDS = "minecraft:polished_deepslate", CDS = "minecraft:cobbled_deepslate",
  POST = "minecraft:dark_oak_log", BEAM = "minecraft:dark_oak_wood", MUD = "minecraft:mud_bricks", FLOOR = "minecraft:spruce_planks",
  PANE = "minecraft:glass_pane", AIR = "minecraft:air", PLANK = "minecraft:dark_oak_planks",
  RS = (f: string) => `minecraft:polished_blackstone_brick_stairs[facing=${f},half=bottom]`, RSLAB = "minecraft:polished_blackstone_brick_slab[type=bottom]",
  RFULL = "minecraft:polished_blackstone_bricks", BARGE = (f: string) => `minecraft:dark_oak_stairs[facing=${f},half=bottom]`,
  HANG = (f: string) => `minecraft:dark_oak_stairs[facing=${f},half=top]`;
const OUT: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
const shutter = (x: number, y: number, z: number, out: string) => { const [dx, dz] = OUT[out]; if (!get(x + dx, y, z + dz)) set(x + dx, y, z + dz, `minecraft:dark_oak_trapdoor[facing=${out},half=bottom,open=true]`); };

// Mill house walls: x285..299, z647..661.
const X0 = 285, X1 = 299, Z0 = 647, Z1 = 661;
// Solid deepslate base under the whole mill house from the lake bed up to the floor (buttresses are added after).
fill(X0, 56, Z0, X1, 69, Z1, CDS); for (let x = X0; x <= X1; x++) for (const z of [Z0, Z1]) fill(x, 56, z, x, 69, z, DSB);
for (let z = Z0; z <= Z1; z++) for (const x of [X0, X1]) fill(x, 56, z, x, 69, z, DSB);
// Ground floor (deepslate) y71..74 on a y70 plinth; floor planks inside.
for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) {
  const edge = x === X0 || x === X1 || z === Z0 || z === Z1;
  set(x, 70, z, edge ? CDS : FLOOR);
  if (edge) { fill(x, 71, z, x, 74, z, DSB); set(x, 71, z, PDS); } else fill(x, 71, z, x, 74, z, AIR);
}
// Paired ground-floor windows with shutters on the long walls and the east gable.
function pairWindows(y: number, h: number) {
  for (let x = X0 + 2; x <= X1 - 3; x += 5) for (const [z, out] of [[Z0, "north"], [Z1, "south"]] as [number, string][]) {
    for (let yy = y; yy < y + h; yy++) { set(x, yy, z, PANE); set(x + 1, yy, z, PANE); shutter(x - 1, yy, z, out); shutter(x + 2, yy, z, out); }
  }
  for (let z = Z0 + 3; z <= Z1 - 4; z += 5) for (let yy = y; yy < y + h; yy++) { set(X1, yy, z, PANE); set(X1, yy, z + 1, PANE); shutter(X1, yy, z - 1, "east"); shutter(X1, yy, z + 2, "east"); }
}
pairWindows(72, 2);
// East entrance (land side) with steps, and a loading door on the south wall.
set(X1, 71, 654, "minecraft:spruce_door[facing=east,half=lower,hinge=left]"); set(X1, 72, 654, "minecraft:spruce_door[facing=east,half=upper,hinge=left]");
set(X1 + 1, 70, 654, "minecraft:deepslate_brick_stairs[facing=west,half=bottom]");
fill(X1 + 1, 74, 653, X1 + 1, 74, 655, "minecraft:dark_oak_slab[type=top]"); set(X1 + 1, 73, 653, "minecraft:lantern[hanging=true]");
fill(292, 71, Z1, 293, 73, Z1, AIR); fill(291, 74, Z1, 294, 74, Z1, BEAM);
// Upper floor (timber) y76..79 on a y75 deck, jettied one block north and south, brackets at every post.
const UZ0 = Z0 - 1, UZ1 = Z1 + 1;
fill(X0, 75, UZ0, X1, 75, UZ1, FLOOR); ring(X0, 75, UZ0, X1, UZ1, BEAM);
for (let x = X0; x <= X1; x++) for (let z = UZ0; z <= UZ1; z++) {
  const edge = x === X0 || x === X1 || z === UZ0 || z === UZ1;
  if (!edge) { fill(x, 76, z, x, 79, z, AIR); continue; }
  const zFace = z === UZ0 || z === UZ1, along = zFace ? x - X0 : z - UZ0, len = zFace ? X1 - X0 : UZ1 - UZ0;
  const post = along % 3 === 0 || along === len;
  for (let y = 76; y <= 79; y++) set(x, y, z, post ? POST : MUD);
  if (!post) {
    set(x, 76, z, BEAM);
    const bay = Math.floor(along / 3), corner = bay === 0 || along > len - 3;
    if (bay % 2 === 1 && !corner) {
      const out = z === UZ0 ? "north" : z === UZ1 ? "south" : x === X0 ? "west" : "east";
      set(x, 77, z, PANE); set(x, 78, z, PANE);
      const [dx, dz] = OUT[out]; set(x + dx, 76, z + dz, "minecraft:flowering_azalea_leaves[persistent=true]");
      if (along % 3 === 1) for (const y of [77, 78]) shutter(x - (dz ? 1 : 0), y, z - (dx ? 1 : 0), out);
      if (along % 3 === 2) for (const y of [77, 78]) shutter(x + (dz ? 1 : 0), y, z + (dx ? 1 : 0), out);
    }
  }
}
ring(X0, 80, UZ0, X1, UZ1, BEAM);
for (let x = X0; x <= X1; x += 3) { set(x, 74, UZ0, HANG("south")); set(x, 73, UZ0, "minecraft:dark_oak_fence"); set(x, 74, UZ1, HANG("north")); set(x, 73, UZ1, "minecraft:dark_oak_fence"); }

// Roof: ridge along x over eaves at z645 / z663, from y80 (45 degrees), barges and a hanging second edge.
const RZ0 = UZ0 - 1, RZ1 = UZ1 + 1;
for (let r = 0; ; r++) {
  const zn = RZ0 + r, zs = RZ1 - r, y = 80 + r;
  if (zn > zs) break;
  if (zn === zs) { fill(X0 - 1, y, zn, X1 + 1, y, zn, RFULL); fill(X0 - 1, y + 1, zn, X1 + 1, y + 1, zn, RSLAB); break; }
  fill(X0 - 1, y, zn, X1 + 1, y, zn, RS("south")); fill(X0 - 1, y, zs, X1 + 1, y, zs, RS("north"));
  for (const [x, f] of [[X0 - 1, "west"], [X1 + 1, "east"]] as [number, string][]) {
    set(x, y, zn, BARGE("south")); set(x, y, zs, BARGE("north"));
    if (!get(x, y - 1, zn)) set(x, y - 1, zn, HANG(f)); if (!get(x, y - 1, zs)) set(x, y - 1, zs, HANG(f));
  }
  if (r > 1) for (const x of [X0, X1]) for (let z = zn + 1; z < zs; z++) set(x, y, z, z === 654 ? POST : MUD);
}
// Gable windows (one round-ish pair in each gable) and a hoist beam on the east gable.
for (const x of [X0, X1]) { set(x, 84, 653, PANE); set(x, 84, 655, PANE); set(x, 85, 654, PANE); }
fill(X1 + 1, 86, 654, X1 + 3, 86, 654, BEAM); set(X1 + 3, 85, 654, "minecraft:chain"); set(X1 + 3, 84, 654, "minecraft:chain");

// Water side: deepslate millrace channel in the lake, flume on posts, two large wheels on shafts.
fill(280, 55, 646, 280, 69, 662, DSB); fill(284, 55, 646, 284, 69, 662, DSB);       // channel walls
fill(280, 69, 646, 280, 69, 662, PDS); fill(284, 69, 662, 284, 69, 646, PDS);          // wall caps
for (const z of [649, 655]) {
  set(282, 71, z + 2, "create:large_water_wheel[axis=x]");
  fill(283, 71, z + 2, X0, 71, z + 2, "create:shaft[axis=x]");
  set(X0 + 1, 71, z + 2, "create:gearbox[axis=x]");
  set(X0 + 2, 71, z + 2, "create:shaft[axis=x]"); set(X0 + 3, 71, z + 2, "create:gearbox[axis=y]");
  set(X0 + 3, 72, z + 2, "create:millstone");
  fill(X0, 71, z + 2, X0, 71, z + 2, "create:shaft[axis=x]");
}
// Flume: dark oak trough at y75 over x281..283, z648..660, on posts down into the channel; water pours through
// two openings onto the wheels.
for (const [x, z] of [[281, 648], [283, 648], [281, 660], [283, 660], [281, 654], [283, 654]]) fill(x, 60, z, x, 74, z, POST);
fill(281, 75, 648, 283, 75, 660, PLANK); fill(281, 76, 648, 281, 76, 660, PLANK); fill(283, 76, 648, 283, 76, 660, PLANK);
fill(282, 76, 648, 282, 76, 648, PLANK); fill(282, 76, 660, 282, 76, 660, PLANK);
for (const z of [651, 657]) { set(282, 75, z, AIR); set(282, 74, z, AIR); set(282, 73, z, AIR); }
fill(282, 76, 649, 282, 76, 659, "minecraft:water");
// A short timber walkway from the mill's upper floor door out along the flume
set(X0, 77, 654, "minecraft:spruce_door[facing=west,half=lower,hinge=left]"); set(X0, 78, 654, "minecraft:spruce_door[facing=west,half=upper,hinge=left]");
fill(X0 - 1, 76, 653, 284, 76, 655, "minecraft:dark_oak_slab[type=top]");
fill(X0 - 1, 77, 653, X0 - 1, 77, 653, "minecraft:dark_oak_fence"); fill(X0 - 1, 77, 655, X0 - 1, 77, 655, "minecraft:dark_oak_fence");
set(284, 78, 654, "minecraft:lantern");
set(284, 77, 654, "minecraft:dark_oak_fence");

// Chimney on the east gable for the bakery oven
fill(296, 70, 657, 297, 91, 658, "minecraft:bricks"); fill(296, 89, 657, 297, 89, 658, "minecraft:waxed_weathered_cut_copper");
set(296, 71, 657, "minecraft:smoker[facing=west]"); set(297, 71, 657, AIR);

// Interior: millstones (above), hoppers below to chests, flour barrels, sacks, bakery corner, stair to the loft.
for (const z of [651, 657]) { set(X0 + 3, 73, z, "minecraft:hopper[facing=down]"); set(X0 + 4, 71, z, "minecraft:chest[facing=east]"); }
fill(291, 71, 648, 294, 72, 648, "minecraft:barrel[facing=south]"); fill(291, 71, 660, 294, 71, 660, "minecraft:hay_block");
set(295, 71, 657, "minecraft:furnace[facing=west]"); set(294, 71, 657, "minecraft:crafting_table");
for (let i = 0; i < 4; i++) set(298, 71 + i, 649 + i, "minecraft:spruce_stairs[facing=south,half=bottom]");
fill(298, 75, 650, 298, 75, 653, AIR);
for (const z of [650, 658]) { set(292, 74, z, "minecraft:lantern[hanging=true]"); set(292, 79, z, "minecraft:lantern[hanging=true]"); }
fill(287, 76, 648, 297, 76, 648, "minecraft:barrel[facing=up]"); set(296, 76, 660, "minecraft:white_bed[facing=east,part=head]"); set(295, 76, 660, "minecraft:white_bed[facing=east,part=foot]");

export const MILL_NOTE = "Overshot wheels: water from the flume falls through two openings onto the large wheels; check rotation in game.";
export function blueprint(): Blueprint {
  const all = [...C.entries()].map(([k, b]) => { const [x, y, z] = k.split(",").map(Number); return { x, y, z, b }; });
  const mn = { x: Math.min(...all.map((c) => c.x)), y: Math.min(...all.map((c) => c.y)), z: Math.min(...all.map((c) => c.z)) };
  const mx = { x: Math.max(...all.map((c) => c.x)), y: Math.max(...all.map((c) => c.y)), z: Math.max(...all.map((c) => c.z)) };
  const rows = new Map<string, { x: number; b: string }[]>();
  for (const c of all) { const k = `${c.y},${c.z}`; (rows.get(k) ?? rows.set(k, []).get(k)!).push({ x: c.x, b: c.b }); }
  const ops: Op[] = [];
  for (const [k, list] of rows) {
    const [y, z] = k.split(",").map(Number); list.sort((a, b) => a.x - b.x); let s = 0;
    for (let i = 1; i <= list.length; i++) if (i === list.length || list[i].b !== list[s].b || list[i].x !== list[i - 1].x + 1) {
      ops.push({ kind: "box", from: [list[s].x - mn.x, y - mn.y, z - mn.z], to: [list[i - 1].x - mn.x, y - mn.y, z - mn.z], block: list[s].b }); s = i;
    }
  }
  ops.sort((a, b) => a.from[1] - b.from[1] || (/water/.test(a.block) ? 1 : 0) - (/water/.test(b.block) ? 1 : 0));
  return { id: "watermill", name: "Watermill", purpose: "Overshot twin-wheel grain mill on the lake shore", size: { w: mx.x - mn.x + 1, h: mx.y - mn.y + 1, d: mx.z - mn.z + 1 }, palette: {}, stages: [{ id: "all", name: "all", ops }],
    notes: [`World-aligned: origin ${mn.x},${mn.y},${mn.z} facing south.`, MILL_NOTE] };
}
export const PLACE = () => { const all = [...C.keys()].map((k) => k.split(",").map(Number)); return { x: Math.min(...all.map((p) => p[0])), y: Math.min(...all.map((p) => p[1])), z: Math.min(...all.map((p) => p[2])) }; };
