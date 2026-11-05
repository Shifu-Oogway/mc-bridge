// Sawmill on the user's spruce-log outline x341..356, z673..687 (sign at 351,71,683). Ground y65..70 (a gully runs
// north-south through x340..346).
// User choices: open-sided heavy timber shed, blackstone gable roof with a vented clerestory (monitor) along the ridge,
// powered by a line shaft from the foundry's steam engine, a working log -> plank saw line, a lumber yard with a gantry
// outside (north), a rail siding from the warehouse on a trestle, and tree nursery beds (west).
import { CellMap } from "./cellmap.ts";

const m = new CellMap();
const X0 = 341, X1 = 356, Z0 = 673, Z1 = 687, F = 70, TOP = 78;
const POST = "minecraft:dark_oak_log", BEAM = "minecraft:dark_oak_wood", PLANK = "minecraft:dark_oak_planks", FLOOR = "minecraft:spruce_planks",
  DSB = "minecraft:deepslate_bricks", PDS = "minecraft:polished_deepslate", CDS = "minecraft:cobbled_deepslate", AIR = "minecraft:air",
  FENCE = "minecraft:dark_oak_fence", CU = "minecraft:waxed_weathered_cut_copper",
  RS = (f: string) => `minecraft:polished_blackstone_brick_stairs[facing=${f},half=bottom]`, RFULL = "minecraft:polished_blackstone_bricks",
  RSLAB = "minecraft:polished_blackstone_brick_slab[type=bottom]", BARGE = (f: string) => `minecraft:dark_oak_stairs[facing=${f},half=bottom]`,
  CORBEL = (f: string) => `minecraft:dark_oak_stairs[facing=${f},half=top]`, DSTAIR = (f: string) => `minecraft:deepslate_brick_stairs[facing=${f},half=bottom]`;
const PX = [341, 344, 348, 352, 356], PZ = [673, 676, 680, 684, 687];

// ---------- base, floor, posts ----------
m.fill(X0, 64, Z0, X1, F - 1, Z1, CDS);
for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) {
  const edge = x === X0 || x === X1 || z === Z0 || z === Z1;
  m.set(x, F, z, edge ? DSB : FLOOR); m.fill(x, F + 1, z, x, F + 22, z, AIR);
}
// Posts on deepslate pads; open sides with a low railing, knee braces under the plate.
const isPost = (x: number, z: number) => (PX.includes(x) && (z === Z0 || z === Z1)) || (PZ.includes(z) && (x === X0 || x === X1));
const openings = (x: number, z: number) => (z === Z0 && x >= 345 && x <= 351) || (x === X0 && z >= 677 && z <= 679) || (x === X1 && z >= 677 && z <= 679);
for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) {
  if (!(x === X0 || x === X1 || z === Z0 || z === Z1)) continue;
  if (isPost(x, z)) { m.set(x, F + 1, z, PDS); m.fill(x, F + 2, z, x, TOP - 1, z, POST); continue; }
  if (!openings(x, z)) m.set(x, F + 1, z, FENCE);
}
for (const x of PX) for (const z of [Z0, Z1]) for (const s of [-1, 1]) if (x + s > X0 && x + s < X1) m.set(x + s, TOP - 1, z, CORBEL(s < 0 ? "east" : "west"));
for (const z of PZ) for (const x of [X0, X1]) for (const s of [-1, 1]) if (z + s > Z0 && z + s < Z1) m.set(x, TOP - 1, z + s, CORBEL(s < 0 ? "south" : "north"));
m.ring(X0, TOP, Z0, X1, Z1, BEAM);
for (const x of PX.slice(1, -1)) m.fill(x, TOP, Z0 + 1, x, TOP, Z1 - 1, "minecraft:dark_oak_log[axis=z]"); // tie beams
for (const x of PX.slice(1, -1)) for (const z of [Z0, Z1]) m.set(x, TOP - 1, z, POST);

// ---------- roof: gable along x with a louvred monitor (z678..682) on the ridge ----------
for (let r = 0; r <= 5; r++) {
  const zn = Z0 - 1 + r, zs = Z1 + 1 - r, y = TOP + 1 + r;
  m.fill(X0 - 1, y, zn, X1 + 1, y, zn, RS("south")); m.fill(X0 - 1, y, zs, X1 + 1, y, zs, RS("north"));
  for (const x of [X0 - 1, X1 + 1]) { m.set(x, y, zn, BARGE("south")); m.set(x, y, zs, BARGE("north")); }
  for (const x of [X0, X1]) for (let z = zn + 1; z < zs; z++) m.set(x, y, z, z === 680 ? POST : PLANK);
}
m.fill(X0, 83, 678, X1, 83, 678, BEAM); m.fill(X0, 83, 682, X1, 83, 682, BEAM); // monitor sills
for (let x = X0; x <= X1; x++) for (const z of [678, 682]) {
  const post = PX.includes(x);
  m.set(x, 84, z, post ? POST : "minecraft:spruce_fence"); m.set(x, 85, z, post ? POST : "minecraft:spruce_fence");
}
for (const x of [X0, X1]) m.fill(x, 84, 679, x, 85, 681, PLANK);
for (let r = 0; r <= 3; r++) {
  const zn = 677 + r, zs = 683 - r, y = 86 + r;
  if (zn === zs) { m.fill(X0 - 1, y, zn, X1 + 1, y, zn, RFULL); m.fill(X0 - 1, y + 1, zn, X1 + 1, y + 1, zn, RSLAB); break; }
  m.fill(X0 - 1, y, zn, X1 + 1, y, zn, RS("south")); m.fill(X0 - 1, y, zs, X1 + 1, y, zs, RS("north"));
  for (const x of [X0 - 1, X1 + 1]) { m.set(x, y, zn, BARGE("south")); m.set(x, y, zs, BARGE("north")); }
  for (const x of [X0, X1]) for (let z = zn + 1; z < zs; z++) m.set(x, y, z, z === 680 ? POST : PLANK);
}
// Round vent (copper) in each gable.
for (const x of [X0, X1]) { m.set(x, 81, 680, "minecraft:waxed_weathered_copper_grate"); m.set(x, 80, 680, CU); }

// ---------- power: line shaft from the foundry (gearbox 275,80,685 runs east to x299) ----------
m.fill(300, 80, 685, 354, 80, 685, "create:shaft[axis=x]");
for (let x = 306; x <= 330; x += 6) { m.fill(x, 62, 685, x, 70, 685, DSB); m.fill(x, 71, 685, x, 78, 685, POST); m.set(x, 79, 685, "create:andesite_casing"); m.set(x, 78, 684, CORBEL("south")); m.set(x, 78, 686, CORBEL("north")); }
// Drive: across the attic at y80, down at x355 z678 to a gearbox that turns a cog train along z679 at floor level.
m.set(355, 80, 685, "create:gearbox[axis=y]"); m.fill(355, 80, 679, 355, 80, 684, "create:shaft[axis=z]"); m.set(355, 80, 678, "create:gearbox[axis=x]");
m.fill(355, 71, 678, 355, 79, 678, "create:shaft[axis=y]"); m.set(355, 70, 678, "create:gearbox[axis=x]");
// Cog train: neighbouring cogs mesh, so the spin alternates with x. Belt pulleys sit on even x and saws on odd x, so the
// saws spin against the belts (a facing-up saw spinning with its feed belt pushes the output back and stalls).
m.fill(344, 70, 679, 356, 70, 679, "create:cogwheel[axis=z]");

// ---------- saw line along z680: intake chest -> belt -> saw (strip) -> belt -> saw (planks) -> belt -> hopper -> chest ----------
m.set(344, 72, 680, "minecraft:chest[facing=west]"); m.set(344, 71, 680, "create:andesite_funnel[facing=down,extracting=true]");
for (const [a, b] of [[344, 346], [348, 350], [352, 356]]) { m.set(a, 70, 680, "create:shaft[axis=z]"); m.set(b, 70, 680, "create:shaft[axis=z]"); }
for (const x of [345, 349, 353, 354, 355]) m.set(x, 70, 680, AIR); // belt runs here (belt connector)
m.set(347, 70, 680, "create:mechanical_saw[facing=up,axis_along_first=false]"); m.set(351, 70, 680, "create:mechanical_saw[facing=up,axis_along_first=false]");
m.set(357, 69, 680, "minecraft:hopper[facing=east]"); m.set(358, 69, 680, "minecraft:chest[facing=west]"); m.fill(357, 70, 680, 358, 70, 680, AIR);
m.fill(357, 68, 680, 358, 68, 680, CDS);
for (const [x, z] of [[348, 678], [352, 678], [348, 684], [352, 684], [344, 676]]) m.set(x, TOP - 1, z, "minecraft:lantern[hanging=true]");
// Plank stacks and a tool rack inside.
m.fill(350, 71, 685, 354, 71, 686, "minecraft:spruce_planks"); m.fill(350, 72, 686, 354, 72, 686, "minecraft:spruce_slab[type=bottom]");
m.fill(342, 71, 685, 343, 72, 686, "minecraft:stripped_spruce_log[axis=x]"); m.set(342, 71, 683, "minecraft:barrel[facing=east]");
m.set(347, 71, 686, "minecraft:crafting_table"); m.set(346, 71, 686, "minecraft:grindstone[face=floor,facing=north]");

// ---------- rail siding: warehouse south door -> trestle over the gully -> loading spot inside ----------
for (let z = 654; z <= 677; z++) {
  m.set(346, 68, z, z >= Z0 ? DSB : PLANK); m.set(346, 69, z, "minecraft:rail[shape=north_south]"); m.set(346, 70, z, AIR); m.set(346, 71, z, AIR);
  if (z < Z0) { m.set(345, 68, z, "minecraft:dark_oak_slab[type=top]"); m.set(347, 68, z, "minecraft:dark_oak_slab[type=top]"); }
  if (z < Z0 && z % 4 === 2) for (const x of [345, 347]) { m.fill(x, 60, z, x, 67, z, POST); m.set(x, 69, z, FENCE); }
}
for (const z of [658, 666]) { m.set(346, 67, z, CORBEL("north")); }
m.set(346, 69, 678, PDS); m.set(346, 70, 678, FENCE); m.set(346, 71, 678, "minecraft:lantern");
for (let z = Z0; z <= 677; z++) for (const x of [345, 347]) m.set(x, 70, z, "minecraft:stripped_dark_oak_log[axis=z]");
m.set(345, 71, 673, PDS); m.set(347, 71, 673, PDS);

// ---------- shuttle (PROVEN): Create minecart contraption ping-pongs warehouse <-> sawmill on this flat y69 track ----------
// Powered rails on redstone blocks keep it moving; the end rail at z677 against the buffer bounces it. The cart itself is
// an entity (not in the design): on the track put a cart assembler, set a linear chassis [axis=y, sticky_top, range 2]
// with a barrel and a portable storage interface (facing up) on top, then summon/push a minecart onto the assembler.
for (const z of [660, 670, 677]) { m.set(346, 68, z, "minecraft:redstone_block"); m.set(346, 69, z, "minecraft:powered_rail[shape=north_south]"); }
// Loading station: stationary interface over the track, fed by a hopper (manual chest on top) and by the saw line.
m.set(346, 74, 674, "create:portable_storage_interface[facing=down]"); m.set(346, 75, 674, "minecraft:hopper[facing=down]"); m.set(346, 76, 674, "minecraft:chest[facing=north]");
// Saw output lift: the last saw belt drops onto a sloped belt (357,70,680 -> 357,76,674; link with a belt connector),
// driven from the belt's end pulley through three gearboxes (the middle one reverses it so it climbs), then a hopper
// chain along z672 at y75 into the loading hopper.
m.set(357, 69, 680, CDS); m.set(358, 69, 680, CDS); m.set(357, 70, 680, "create:shaft[axis=x]"); m.set(357, 76, 674, "create:shaft[axis=x]");
for (let i = 1; i <= 5; i++) m.set(357, 70 + i, 680 - i, AIR);
m.set(356, 70, 681, "create:gearbox[axis=y]"); m.set(357, 70, 681, "create:gearbox[axis=y]"); m.set(358, 70, 681, "create:gearbox[axis=y]"); m.set(358, 70, 680, "create:gearbox[axis=y]");
m.set(357, 75, 673, "minecraft:hopper[facing=north]"); m.fill(347, 75, 672, 357, 75, 672, "minecraft:hopper[facing=west]");
m.set(346, 75, 672, "minecraft:hopper[facing=south]"); m.set(346, 75, 673, "minecraft:hopper[facing=south]");

// ---------- lumber yard (north) with a timber gantry ----------
m.fill(348, 64, 664, 357, 68, 671, "minecraft:dirt"); m.fill(348, 69, 664, 357, 69, 671, "minecraft:coarse_dirt");
m.fill(348, 70, 664, 357, 80, 671, AIR);
for (const [x, z] of [[348, 664], [348, 671], [357, 664], [357, 671]]) { m.set(x, 69, z, PDS); m.fill(x, 70, z, x, 77, z, POST); }
for (const z of [664, 671]) m.fill(348, 78, z, 357, 78, z, "minecraft:dark_oak_log[axis=x]");
m.fill(352, 79, 664, 352, 79, 671, "minecraft:stripped_dark_oak_log[axis=z]");
for (const z of [664, 671]) { m.set(351, 79, z, "create:cogwheel[axis=z]"); m.set(353, 79, z, "create:cogwheel[axis=z]"); }
m.fill(352, 75, 668, 352, 78, 668, "minecraft:chain[axis=y]"); m.fill(351, 74, 668, 353, 74, 668, "minecraft:spruce_log[axis=x]");
for (const z of [664, 671]) for (const [x, f] of [[349, "east"], [356, "west"]] as [number, string][]) m.set(x, 77, z, CORBEL(f));
m.fill(349, 70, 665, 351, 71, 666, "minecraft:spruce_log[axis=x]"); m.fill(349, 72, 665, 350, 72, 666, "minecraft:spruce_log[axis=x]");
m.fill(354, 70, 665, 356, 72, 666, "minecraft:oak_log[axis=x]");
m.fill(354, 70, 669, 356, 70, 670, "minecraft:spruce_planks"); m.fill(354, 71, 669, 356, 71, 670, "minecraft:spruce_slab[type=bottom]");
m.fill(349, 70, 669, 350, 71, 670, "minecraft:dark_oak_log[axis=z]");
for (const z of [665, 666, 669, 670]) for (const x of [348, 357]) if (!m.get(x, 70, z)) m.set(x, 70, z, "minecraft:spruce_fence");

// ---------- tree nursery (west): three raised beds with saplings, a water barrel and a composter ----------
m.fill(331, 64, 673, 339, 69, 687, "minecraft:dirt"); m.fill(331, 70, 673, 339, 76, 687, AIR);
m.fill(331, 69, 673, 339, 69, 687, "minecraft:gravel");
const beds: [number, number, string[]][] = [[674, 677, ["oak_sapling"]], [679, 682, ["spruce_sapling"]], [684, 687, ["birch_sapling"]]];
for (const [z0, z1, saps] of beds) {
  for (let x = 332; x <= 338; x++) for (let z = z0; z <= z1; z++) {
    const edge = x === 332 || x === 338 || z === z0 || z === z1;
    m.set(x, 69, z, edge ? "minecraft:dirt" : "minecraft:dirt");
    m.set(x, 70, z, edge ? (z === z0 || z === z1 ? "minecraft:stripped_spruce_log[axis=x]" : "minecraft:stripped_spruce_log[axis=z]") : "minecraft:grass_block");
    // Single saplings two apart (no 2x2 groups: those grow giant trees over the mill), ferns between.
    if (!edge) m.set(x, 71, z, z === z0 + 1 && (x === 334 || x === 336) ? `minecraft:${saps[0]}[stage=0]` : (x + z) % 3 === 0 ? "minecraft:fern" : AIR);
  }
}
m.set(339, 70, 678, "minecraft:composter[level=4]"); m.set(339, 70, 683, "minecraft:water_cauldron[level=3]");
for (const z of [673, 687]) { m.set(331, 70, z, FENCE); m.set(331, 71, z, "minecraft:lantern"); }
m.set(340, 70, 678, DSTAIR("east")); m.set(340, 70, 679, DSTAIR("east"));

export const blueprint = () => m.toBlueprint("sawmill", "Sawmill", "Open timber saw shed with clerestory roof, saw line, lumber yard, rail siding and nursery",
  ["Three belts on z680 (x344..346, 348..350, 352..356) must be linked with belt connectors between their end shafts.",
   "Power: line shaft y80 z685 from the foundry gearbox (275,80,685) via 300..354; a cog train along z679 drives belts (even x) and saws (odd x)."]);
export const origin = () => m.origin();
