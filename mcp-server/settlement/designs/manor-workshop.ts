// Manor/workshop on the user's L-shaped outline (sign at 320,72,631).
// House = north block x300..325, z609..619 (3 storeys + attic). Workshop = south wing x311..325, z619..640 (2 storeys).
// User materials: deepslate brick ground floor, stripped spruce frame, mud brick infill, blackstone roof,
// glass panes, weathered copper accents on the workshop. Entrance porch in the inside corner of the L.
// Built as a cell map in coordinates relative to O = (300, 70, 609); y0 = the outline/ground layer.
import type { Blueprint, Op } from "../src/blueprint.ts";

export const ORIGIN = { x: 300, y: 70, z: 609 };
const C = new Map<string, string>();
const k = (x: number, y: number, z: number) => `${x},${y},${z}`;
const set = (x: number, y: number, z: number, b: string) => { C.set(k(x, y, z), b); };
const fill = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: string) => {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) set(x, y, z, b);
};
const ring = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: string) => {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) if (x === x0 || x === x1 || z === z0 || z === z1) set(x, y, z, b);
};
const get = (x: number, y: number, z: number) => C.get(k(x, y, z));

const DSB = "minecraft:deepslate_bricks", PDS = "minecraft:polished_deepslate", CDS = "minecraft:cobbled_deepslate",
  POST = "minecraft:dark_oak_log", BEAM = "minecraft:dark_oak_wood", MUD = "minecraft:mud_bricks", FLOOR = "minecraft:spruce_planks",
  PANE = "minecraft:glass_pane", AIR = "minecraft:air", CU = "minecraft:waxed_weathered_cut_copper",
  RS = (f: string) => `minecraft:polished_blackstone_brick_stairs[facing=${f},half=bottom]`, RSLAB = "minecraft:polished_blackstone_brick_slab[type=bottom]",
  RFULL = "minecraft:polished_blackstone_bricks", BARGE = (f: string) => `minecraft:dark_oak_stairs[facing=${f},half=bottom]`,
  CORBEL = (f: string) => `minecraft:dark_oak_stairs[facing=${f},half=top]`;

// ---------- footprint parts ----------
// House block: x0..25, z0..10. Wing: x11..25, z10..31 (shares the z10 wall with the house).
const inHouse = (x: number, z: number) => x >= 0 && x <= 25 && z >= 0 && z <= 10;
const inWing = (x: number, z: number) => x >= 11 && x <= 25 && z >= 10 && z <= 31;
const inside = (x: number, z: number) => inHouse(x, z) || inWing(x, z);
const isEdge = (x: number, z: number) => inside(x, z) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => !inside(x + dx, z + dz));

// Foundation + ground floor (deepslate): y0 plinth course, walls y1..4.
for (let x = -1; x <= 26; x++) for (let z = -1; z <= 32; z++) if (inside(x, z)) {
  set(x, 0, z, isEdge(x, z) ? CDS : FLOOR);
  if (isEdge(x, z)) { fill(x, 1, z, x, 4, z, DSB); set(x, 1, z, PDS); } else fill(x, 1, z, x, 4, z, AIR);
}
// Shutters: open dark oak trapdoors flat against the wall either side of a window, on the outside.
const OUT: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
const shutter = (x: number, y: number, z: number, out: string) => { const [dx, dz] = OUT[out]; set(x + dx, y, z + dz, `minecraft:dark_oak_trapdoor[facing=${out},half=bottom,open=true]`); };
// Ground-floor windows: pairs (2 wide, 2 tall) every 6 blocks with shutters, skipping corners and the inner corner.
for (let x = 0; x <= 25; x++) for (let z = 0; z <= 31; z++) if (isEdge(x, z)) {
  const zFace = z === 0 || z === 10 || z === 31;
  const along = zFace ? x : z;
  const out = z === 0 ? "north" : z === 31 ? "south" : z === 10 && x <= 10 ? "south" : x === 0 ? "west" : x === 25 ? "east" : x === 11 ? "west" : "";
  if (!out || along % 6 < 2 || along % 6 > 3 || along < 2 || (zFace && x > 23) || (!zFace && z > 29)) continue;
  set(x, 2, z, PANE); set(x, 3, z, PANE);
  const prevAlong = along % 6 === 2, step = zFace ? [1, 0] : [0, 1];
  if (prevAlong) for (const y of [2, 3]) shutter(x - step[0], y, z - step[1], out);
  else for (const y of [2, 3]) shutter(x + step[0], y, z + step[1], out);
}

// ---------- timber storeys ----------
function storey(y0: number, h: number, parts: { x0: number; z0: number; x1: number; z1: number }[], jet: { n?: number; s?: number; w?: number; e?: number }) {
  for (const p of parts) {
    const x0 = p.x0 - (jet.w ?? 0), x1 = p.x1 + (jet.e ?? 0), z0 = p.z0 - (jet.n ?? 0), z1 = p.z1 + (jet.s ?? 0);
    // deck (floor) with beam edge, corbels under any overhang
    fill(x0, y0 - 1, z0, x1, y0 - 1, z1, FLOOR); ring(x0, y0 - 1, z0, x1, y0 - 1, z1, BEAM);
    // Brackets under the overhang at every post: an upside-down stair with a short post below it.
    const bracket = (x: number, z: number, f: string) => { set(x, y0 - 2, z, CORBEL(f)); set(x, y0 - 3, z, "minecraft:dark_oak_fence"); };
    if (jet.n) for (let x = x0; x <= x1; x += 3) bracket(x, z0, "south");
    if (jet.s) for (let x = x0; x <= x1; x += 3) bracket(x, z1, "north");
    if (jet.w) for (let z = z0; z <= z1; z += 3) bracket(x0, z, "east");
    if (jet.e) for (let z = z0; z <= z1; z += 3) bracket(x1, z, "west");
    // walls: mud brick infill, posts every 3, a mid rail under the windows, windows between posts
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const edge = x === x0 || x === x1 || z === z0 || z === z1;
      if (!edge) { fill(x, y0, z, x, y0 + h - 1, z, AIR); continue; }
      const along = (z === z0 || z === z1) ? x - x0 : z - z0, len = (z === z0 || z === z1) ? x1 - x0 : z1 - z0;
      const post = along % 3 === 0 || along === len;
      for (let y = y0; y < y0 + h; y++) set(x, y, z, post ? POST : MUD);
      if (!post) {
        set(x, y0, z, BEAM);
        // Windows only in every other bay (paired panes), solid mud-brick bays between; shutters and a flower box outside.
        const bay = Math.floor(along / 3), corner = bay === 0 || along > len - 3;
        if (bay % 2 === 1 && !corner) {
          set(x, y0 + 1, z, PANE); set(x, y0 + 2, z, PANE);
          const out = z === z0 ? "north" : z === z1 ? "south" : x === x0 ? "west" : "east";
          const [dx, dz] = OUT[out];
          set(x + dx, y0, z + dz, "minecraft:flowering_azalea_leaves[persistent=true]");
          if (along % 3 === 1) for (const y of [y0 + 1, y0 + 2]) shutter(x - (dz ? 1 : 0), y, z - (dx ? 1 : 0), out);
          if (along % 3 === 2) for (const y of [y0 + 1, y0 + 2]) shutter(x + (dz ? 1 : 0), y, z + (dx ? 1 : 0), out);
        }
      }
    }
    ring(x0, y0 + h, z0, x1, y0 + h, z1, BEAM); // plate
  }
}
// House: two timber storeys over the ground floor, north side jettied 1 then 2 (double jetty). Wing: one timber storey, jettied 1 east and west.
storey(6, 4, [{ x0: 0, z0: 0, x1: 25, z1: 10 }], { n: 1 });
storey(11, 4, [{ x0: 0, z0: 0, x1: 25, z1: 10 }], { n: 2 });
storey(6, 4, [{ x0: 11, z0: 11, x1: 25, z1: 31 }], { w: 1, e: 1 });
fill(0, 5, 0, 25, 5, 10, FLOOR); fill(11, 5, 11, 25, 5, 31, FLOOR); // ground-floor ceilings
fill(1, 10, 0, 24, 10, 9, FLOOR);                                    // house second floor deck
// Opening between house and wing on both levels
fill(14, 1, 10, 16, 3, 10, AIR); fill(14, 6, 10, 16, 8, 10, AIR);

// ---------- roofs ----------
// House: ridge along x, eaves at z = -3 (outside the double jetty) and z = 11, from y15.
const houseTop = (z: number) => 15 + Math.min(z + 3, 11 - z); // roof surface height over row z
for (let r = 0; ; r++) {
  const zn = -3 + r, zs = 11 - r, y = 15 + r;
  if (zn > zs) break;
  if (zn === zs) { fill(-1, y, zn, 26, y, zn, RFULL); fill(-1, y + 1, zn, 26, y + 1, zn, RSLAB); break; }
  fill(-1, y, zn, 26, y, zn, RS("south")); fill(-1, y, zs, 26, y, zs, RS("north"));
  for (const x of [-1, 26]) { set(x, y, zn, BARGE("south")); set(x, y, zs, BARGE("north")); }
  if (r > 0) for (const x of [0, 25]) for (let z = zn + 1; z < zs; z++) set(x, y, z, z === 4 ? POST : MUD); // gable ends, king post on the ridge line
}
// Wing: ridge along z at x18, eaves at x9 and x27 (outside the jetties), from y10, running from the house to z33.
// Cells that would sit under the house roof are skipped, so the wing roof dies into it as a valley.
for (let r = 0; ; r++) {
  const xw = 9 + r, xe = 27 - r, y = 10 + r;
  if (xw > xe) break;
  for (let z = 4; z <= 33; z++) {
    if (z <= 11 && y <= houseTop(z)) continue;
    if (xw === xe) { set(xw, y, z, RFULL); set(xw, y + 1, z, RSLAB); continue; }
    set(xw, y, z, RS("east")); set(xe, y, z, RS("west"));
    if (z === 33) { set(xw, y, z, BARGE("east")); set(xe, y, z, BARGE("west")); }
  }
  if (xw === xe) break;
  if (r > 0) for (let x = xw + 1; x < xe; x++) set(x, y, 32, x === 18 ? POST : MUD); // south gable end (wing jetty line z32)
}
fill(10, 6, 32, 26, 9, 32, AIR); // wing's south gable wall is the z31 wall; z32 above is only the gable triangle
// Wing south gable triangle sits on the z31 wall line instead
for (let r = 1; r <= 8; r++) for (let x = 9 + r + 1; x < 27 - r; x++) { set(x, 10 + r, 31, x === 18 ? POST : MUD); set(x, 10 + r, 32, AIR); }

// ---------- carved bargeboards: a hanging second edge under every roof-edge stair ----------
for (let r = 0; r <= 7; r++) {
  const y = 15 + r;
  for (const [x, f] of [[-1, "west"], [26, "east"]] as [number, string][]) for (const z of [-3 + r, 11 - r]) if (!get(x, y - 1, z)) set(x, y - 1, z, `minecraft:dark_oak_stairs[facing=${f},half=top]`);
}
for (let r = 0; r <= 8; r++) for (const x of [9 + r, 27 - r]) if (!get(x, 10 + r - 1, 33)) set(x, 10 + r - 1, 33, "minecraft:dark_oak_stairs[facing=south,half=top]");

// ---------- dormers on the water-side (north) roof ----------
function dormerN(xc: number) {
  for (let z = -2; z <= 2; z++) for (let y = 16; y <= 20; y++) for (let x = xc - 1; x <= xc + 1; x++) if (z >= -1 && y <= 17) set(x, y, z, AIR);
  for (const x of [xc - 1, xc + 1]) { fill(x, 16, -1, x, 17, -1, POST); fill(x, 16, 0, x, 17, 2, MUD); }
  set(xc, 16, -1, PANE); set(xc, 17, -1, PANE); fill(xc - 1, 18, -1, xc + 1, 18, -1, BEAM);
  fill(xc - 1, 19, -2, xc - 1, 19, 2, RS("east")); fill(xc + 1, 19, -2, xc + 1, 19, 2, RS("west"));
  fill(xc, 19, -2, xc, 19, 2, RFULL); fill(xc, 20, -2, xc, 20, 2, RSLAB); fill(xc - 1, 18, 0, xc + 1, 18, 2, MUD);
  set(xc - 1, 18, -2, "minecraft:dark_oak_stairs[facing=east,half=bottom]"); set(xc + 1, 18, -2, "minecraft:dark_oak_stairs[facing=west,half=bottom]");
}
dormerN(7); dormerN(18);

// ---------- entrance porch in the inside corner ----------
fill(6, 0, 11, 10, 0, 15, PDS);
for (const [x, z] of [[6, 15], [10, 15], [6, 11]]) fill(x, 1, z, x, 4, z, POST);
fill(6, 5, 11, 10, 5, 15, BEAM);
for (let r = 0; r <= 2; r++) { fill(5 + r, 6 + r, 11, 5 + r, 6 + r, 16, RS("east")); fill(11 - r, 6 + r, 11, 11 - r, 6 + r, 16, RS("west")); }
fill(8, 9, 11, 8, 9, 16, RFULL);
set(8, 0, 16, "minecraft:deepslate_brick_stairs[facing=north,half=bottom]");
set(10, 1, 13, "minecraft:spruce_door[facing=west,half=lower,hinge=left]"); set(10, 2, 13, "minecraft:spruce_door[facing=west,half=upper,hinge=left]");
fill(10, 1, 12, 10, 4, 12, DSB); fill(10, 1, 14, 10, 4, 14, DSB); fill(10, 3, 13, 10, 4, 13, DSB);
// door through the house's south wall too
set(8, 1, 10, "minecraft:spruce_door[facing=south,half=lower,hinge=left]"); set(8, 2, 10, "minecraft:spruce_door[facing=south,half=upper,hinge=left]");
set(8, 4, 15, "minecraft:lantern[hanging=true]");
// Wing door: from the porch into the workshop on the wing's west wall
set(11, 1, 13, "minecraft:spruce_door[facing=west,half=lower,hinge=left]"); set(11, 2, 13, "minecraft:spruce_door[facing=west,half=upper,hinge=left]");
fill(10, 1, 13, 10, 2, 13, AIR);

// ---------- chimneys & copper accents ----------
fill(1, 0, 3, 2, 24, 5, "minecraft:bricks"); fill(1, 1, 4, 1, 1, 4, "minecraft:campfire[lit=true,facing=east]"); set(2, 1, 4, AIR);
fill(1, 22, 3, 2, 22, 5, CU);
// Workshop stack (weathered copper bands) at the wing's south-east corner, and a copper ridge vent
fill(22, 0, 28, 24, 24, 30, "minecraft:bricks"); fill(23, 1, 29, 23, 23, 29, AIR); set(23, 21, 29, "minecraft:campfire[lit=true]");
for (const y of [12, 18, 23]) ring(22, y, 28, 24, y, 30, CU);
fill(17, 20, 20, 19, 20, 22, CU); fill(18, 21, 21, 18, 21, 21, "minecraft:lightning_rod");

// ---------- interiors ----------
// House ground floor: hall with stair, kitchen west, dining east.
fill(1, 1, 1, 1, 1, 2, "minecraft:smoker[facing=east]"); set(1, 1, 6, "minecraft:barrel[facing=up]"); set(1, 1, 7, "minecraft:water_cauldron[level=3]");
fill(4, 1, 4, 6, 1, 5, "minecraft:spruce_slab[type=top]");
fill(18, 1, 4, 23, 1, 4, "minecraft:spruce_slab[type=top]"); fill(18, 1, 3, 23, 1, 3, "minecraft:spruce_stairs[facing=south,half=bottom]"); fill(18, 1, 5, 23, 1, 5, "minecraft:spruce_stairs[facing=north,half=bottom]");
for (let i = 0; i < 4; i++) set(11 + i, 1 + i, 1, "minecraft:spruce_stairs[facing=east,half=bottom]");
fill(12, 5, 1, 15, 5, 2, AIR);
for (let i = 0; i < 4; i++) set(11 + i, 6 + i, 2, "minecraft:spruce_stairs[facing=east,half=bottom]");
fill(12, 10, 1, 15, 10, 3, AIR);
for (const [x, z] of [[5, 5], [12, 5], [20, 5]]) { set(x, 4, z, "minecraft:lantern[hanging=true]"); set(x, 9, z, "minecraft:lantern[hanging=true]"); set(x, 14, z, "minecraft:lantern[hanging=true]"); }
// First floor: two bedrooms
set(4, 6, 2, "minecraft:red_bed[facing=north,part=head]"); set(4, 6, 3, "minecraft:red_bed[facing=north,part=foot]");
set(21, 6, 2, "minecraft:blue_bed[facing=north,part=head]"); set(21, 6, 3, "minecraft:blue_bed[facing=north,part=foot]");
set(2, 6, 1, "minecraft:chest[facing=east]"); set(23, 6, 1, "minecraft:chest[facing=west]");
// Second floor: library/study
fill(1, 11, 1, 1, 13, 9, "minecraft:bookshelf"); fill(24, 11, 1, 24, 13, 9, "minecraft:bookshelf"); set(8, 11, 5, "minecraft:lectern[facing=north]");
// Workshop: Create line along the wing, storage, crafting
fill(13, 4, 20, 23, 4, 20, "create:shaft[axis=x]");
set(15, 3, 20, "create:mechanical_press[facing=north]"); set(15, 1, 20, "create:depot");
set(19, 3, 20, "create:mechanical_mixer"); set(19, 1, 20, "create:basin");
fill(12, 1, 29, 16, 1, 30, "minecraft:barrel[facing=up]"); fill(24, 1, 13, 24, 2, 17, "minecraft:chest[facing=west]");
set(12, 1, 24, "minecraft:crafting_table"); set(12, 1, 25, "create:mechanical_crafter[facing=east]");
for (const z of [15, 22, 28]) { set(18, 4, z, "minecraft:lantern[hanging=true]"); set(18, 9, z, "minecraft:lantern[hanging=true]"); }
fill(13, 6, 13, 23, 6, 15, "minecraft:barrel[facing=up]");

// ---------- export ----------
export function cells(): { x: number; y: number; z: number; b: string }[] {
  return [...C.entries()].map(([key, b]) => { const [x, y, z] = key.split(",").map(Number); return { x: ORIGIN.x + x, y: ORIGIN.y + y, z: ORIGIN.z + z, b }; });
}
/** Same building as a Blueprint (runs of identical blocks along x merged into boxes) for verification and survival building. */
export function blueprint(): Blueprint {
  const all = cells(); const mn = { x: Math.min(...all.map((c) => c.x)), y: ORIGIN.y, z: Math.min(...all.map((c) => c.z)) };
  const rows = new Map<string, { x: number; b: string }[]>();
  for (const c of all) { const key = `${c.y},${c.z}`; (rows.get(key) ?? rows.set(key, []).get(key)!).push({ x: c.x, b: c.b }); }
  const ops: Op[] = [];
  for (const [key, list] of rows) {
    const [y, z] = key.split(",").map(Number); list.sort((a, b) => a.x - b.x);
    let s = 0;
    for (let i = 1; i <= list.length; i++) if (i === list.length || list[i].b !== list[s].b || list[i].x !== list[i - 1].x + 1) {
      ops.push({ kind: "box", from: [list[s].x - mn.x, y - mn.y, z - mn.z], to: [list[i - 1].x - mn.x, y - mn.y, z - mn.z], block: list[s].b }); s = i;
    }
  }
  ops.sort((a, b) => a.from[1] - b.from[1]);
  const mx = { x: Math.max(...all.map((c) => c.x)), y: Math.max(...all.map((c) => c.y)), z: Math.max(...all.map((c) => c.z)) };
  return { id: "manor-workshop", name: "Manor & Workshop", purpose: "House (north block) and Create workshop (south wing) on the user's L outline",
    size: { w: mx.x - mn.x + 1, h: mx.y - mn.y + 1, d: mx.z - mn.z + 1 }, palette: {}, stages: [{ id: "all", name: "all", ops }],
    notes: [`World-aligned: place with origin ${mn.x},${mn.y},${mn.z} facing south.`] };
}
export const PLACE = () => { const all = cells(); return { x: Math.min(...all.map((c) => c.x)), y: ORIGIN.y, z: Math.min(...all.map((c) => c.z)) }; };
void get;
