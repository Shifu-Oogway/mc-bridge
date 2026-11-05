// Warehouse on the user's spruce-log outline x335..354, z638..653 (sign at 346,71,645). Ground y69..70, dipping south.
// User choices: dark oak frame + mud brick infill on a deepslate plinth, blackstone gable roof with a projecting hoist
// hood on the west gable, medium steampunk (accents + a working belt into item vaults), rail brought inside to a loading
// platform, item vaults fed by a belt, chest/barrel racks.
import { CellMap } from "./cellmap.ts";

const m = new CellMap();
const X0 = 335, X1 = 354, Z0 = 638, Z1 = 653, F = 70, TOP = 78; // floor y70, wall plate y78
const POST = "minecraft:dark_oak_log", BEAM = "minecraft:dark_oak_wood", MUD = "minecraft:mud_bricks", FLOOR = "minecraft:spruce_planks",
  DSB = "minecraft:deepslate_bricks", PDS = "minecraft:polished_deepslate", CDS = "minecraft:cobbled_deepslate", AIR = "minecraft:air",
  PANE = "minecraft:glass_pane", CU = "minecraft:waxed_weathered_cut_copper",
  RS = (f: string) => `minecraft:polished_blackstone_brick_stairs[facing=${f},half=bottom]`, RFULL = "minecraft:polished_blackstone_bricks",
  RSLAB = "minecraft:polished_blackstone_brick_slab[type=bottom]", BARGE = (f: string) => `minecraft:dark_oak_stairs[facing=${f},half=bottom]`,
  CORBEL = (f: string) => `minecraft:dark_oak_stairs[facing=${f},half=top]`, DSTAIR = (f: string) => `minecraft:deepslate_brick_stairs[facing=${f},half=bottom]`,
  SHUT = (f: string) => `minecraft:dark_oak_trapdoor[facing=${f},half=bottom,open=true]`;
const OUT: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };

// ---------- base and walls ----------
m.fill(X0, 64, Z0, X1, F - 1, Z1, CDS);
const POSTS_X = [335, 339, 343, 347, 351, 354], POSTS_Z = [638, 642, 646, 650, 653];
const doorW = (z: number) => z >= 644 && z <= 647;            // west cart door (town side)
const doorS = (x: number) => x >= 345 && x <= 347;            // south rail door
for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) {
  const edge = x === X0 || x === X1 || z === Z0 || z === Z1;
  if (!edge) { m.set(x, F, z, FLOOR); m.fill(x, F + 1, z, x, TOP + 12, z, AIR); continue; }
  m.set(x, F, z, DSB);
  const onX = z === Z0 || z === Z1, along = onX ? x : z, post = (onX ? POSTS_X : POSTS_Z).includes(along);
  for (let y = F + 1; y < TOP; y++) m.set(x, y, z, post ? POST : MUD);
  if (post) continue;
  m.set(x, F + 1, z, BEAM); m.set(x, F + 3, z, BEAM); // sill and mid rail
  // Small high windows: one pane column in the middle of each bay, shuttered both sides.
  const list = onX ? POSTS_X : POSTS_Z; const i = list.findIndex((p) => p > along); const a = list[i - 1] + 1, b = list[i] - 1;
  const mid = Math.floor((a + b) / 2), out = z === Z0 ? "north" : z === Z1 ? "south" : x === X0 ? "west" : "east";
  const isDoorBay = (x === X0 && doorW(z)) || (z === Z1 && doorS(x));
  if (along === mid && !isDoorBay) {
    m.set(x, F + 4, z, PANE); m.set(x, F + 5, z, PANE);
    const [dx, dz] = OUT[out];
    for (const y of [F + 4, F + 5]) for (const s of [-1, 1]) m.set(x + dx + (onX ? s : 0), y, z + dz + (onX ? 0 : s), SHUT(out));
  }
}
m.ring(X0, TOP, Z0, X1, Z1, BEAM); // wall plate
// Corner and post plinths in deepslate, one block proud at the corners.
for (const [x, z] of [[X0, Z0], [X0, Z1], [X1, Z0], [X1, Z1]]) m.set(x, F + 1, z, PDS);

// West cart door (4 wide, 4 tall) with a lintel beam and corbels; loading dock outside.
m.fill(X0, F + 1, 644, X0, F + 4, 647, AIR); m.fill(X0, F + 5, 643, X0, F + 5, 648, BEAM);
m.set(X0 - 1, F + 4, 643, CORBEL("east")); m.set(X0 - 1, F + 4, 648, CORBEL("east"));
m.fill(332, 64, 642, 334, F - 1, 649, CDS); m.fill(332, F, 642, 334, F, 649, PDS); m.fill(332, F, 643, 334, F, 648, "minecraft:dark_oak_planks");
m.fill(331, F, 643, 331, F, 648, DSTAIR("east"));
for (const z of [642, 649]) { m.set(332, F + 1, z, "minecraft:dark_oak_fence"); m.set(332, F + 2, z, "minecraft:lantern"); }
m.set(333, F + 1, 649, "minecraft:barrel[facing=up]"); m.set(334, F + 1, 649, "minecraft:barrel[facing=north]"); m.set(334, F + 2, 649, "minecraft:barrel[facing=up]");
m.set(333, F + 1, 642, "minecraft:hay_block");

// South rail door (3 wide, 4 tall); the rail runs in a trough so carts sit flush with the platforms.
m.fill(345, F + 1, Z1, 347, F + 4, Z1, AIR); m.fill(344, F + 5, Z1, 348, F + 5, Z1, BEAM);
m.set(344, F + 4, Z1 + 1, CORBEL("north")); m.set(348, F + 4, Z1 + 1, CORBEL("north"));
m.set(344, F + 5, Z1 + 1, "minecraft:lantern[hanging=true]"); m.set(348, F + 5, Z1 + 1, "minecraft:lantern[hanging=true]");
for (let z = 641; z <= Z1; z++) { m.set(346, F - 2, z, DSB); m.set(346, F - 1, z, "minecraft:rail[shape=north_south]"); m.set(346, F, z, AIR); }
m.set(346, F - 1, 640, PDS); m.set(346, F, 640, "minecraft:dark_oak_fence"); m.set(346, F + 1, 640, "minecraft:lantern"); // buffer stop
for (let z = 641; z <= 652; z++) m.set(347, F, z, "minecraft:stripped_dark_oak_log[axis=z]"); // platform kerb (east)

// ---------- shuttle terminus + category sorter (PROVEN 2026-11-05) ----------
// The shuttle from the sawmill bounces off the powered rail at z641. On the way it stops at five stationary interfaces;
// each brass funnel takes only its category out of the cart into a hopper -> barrel (filters are set in game, item by
// item: settlement/scripts/sorter2.mjs --filters). Order from the door: wood 651, stone 649, ore 647, farm 645, misc 643.
for (const z of [641, 650]) { m.set(346, 68, z, "minecraft:redstone_block"); m.set(346, 69, z, "minecraft:powered_rail[shape=north_south]"); }
m.fill(345, 70, 641, 345, 70, 652, "minecraft:spruce_planks");
for (const [z, brass] of [[651, true], [649, true], [647, true], [645, true], [643, false]] as [number, boolean][]) {
  m.set(346, 74, z, "create:portable_storage_interface[facing=down]");
  m.set(345, 74, z, brass ? "create:brass_funnel[facing=west,extracting=true]" : "create:andesite_funnel[facing=west,extracting=true]");
  m.set(345, 73, z, "minecraft:hopper[facing=down]"); m.set(345, 72, z, "minecraft:barrel[facing=west]"); m.set(345, 71, z, "minecraft:dark_oak_planks");
}
m.fill(345, 75, 642, 346, 75, 652, "minecraft:dark_oak_log[axis=z]");

// ---------- roof: blackstone gable, ridge along x ----------
for (let r = 0; ; r++) {
  const zn = Z0 - 1 + r, zs = Z1 + 1 - r, y = TOP + 1 + r;
  if (zn > zs) break;
  m.fill(X0 - 1, y, zn, X1 + 1, y, zn, RS("south")); m.fill(X0 - 1, y, zs, X1 + 1, y, zs, RS("north"));
  for (const x of [X0 - 1, X1 + 1]) { m.set(x, y, zn, BARGE("south")); m.set(x, y, zs, BARGE("north")); }
  for (const x of [X0, X1]) for (let z = zn + 1; z < zs; z++) m.set(x, y, z, z === 645 || z === 646 ? POST : MUD); // gable ends
  if (zs - zn === 1) { m.fill(X0 - 1, y + 1, zn, X1 + 1, y + 1, zs, RSLAB); break; }
}
// Gable beams and a loft window in the east gable.
for (const x of [X0, X1]) for (let z = 640; z <= 651; z++) m.set(x, 82, z, BEAM);
m.set(X1, 80, 645, PANE); m.set(X1, 80, 646, PANE); m.set(X1, 81, 645, PANE); m.set(X1, 81, 646, PANE);
// Tie beams across the hall on the posts, with hanging lanterns.
for (const x of [339, 343, 347, 351]) m.fill(x, TOP, Z0 + 1, x, TOP, Z1 - 1, "minecraft:dark_oak_wood");
for (const [x, z] of [[339, 641], [339, 649], [343, 645], [347, 645], [351, 641], [351, 649]]) m.set(x, TOP - 1, z, "minecraft:lantern[hanging=true]");

// ---------- hoist hood on the west gable ----------
// Loft doors in the gable, a 2-wide beam out to x332 under a small gabled hood, chain and a hanging barrel.
m.fill(X0, 79, 645, X0, 81, 646, AIR); m.set(X0 - 1, 80, 644, SHUT("west")); m.set(X0 - 1, 80, 647, SHUT("west"));
m.fill(332, 83, 645, X0, 83, 646, "minecraft:dark_oak_log[axis=x]");
m.fill(332, 84, 644, 334, 84, 644, RS("south")); m.fill(332, 84, 647, 334, 84, 647, RS("north"));
m.fill(332, 85, 645, 334, 85, 645, RS("south")); m.fill(332, 85, 646, 334, 85, 646, RS("north"));
m.fill(332, 86, 645, 334, 86, 646, CU);
m.set(331, 84, 644, BARGE("south")); m.set(331, 84, 647, BARGE("north")); m.set(331, 85, 645, BARGE("south")); m.set(331, 85, 646, BARGE("north"));
for (const z of [644, 647]) { m.set(332, 83, z, CORBEL("east")); m.set(334, 83, z, "minecraft:dark_oak_planks"); }
m.set(333, 83, 644, "create:cogwheel[axis=z]"); m.set(333, 83, 647, "create:cogwheel[axis=z]");
m.fill(332, 80, 645, 332, 82, 645, "minecraft:chain[axis=y]"); m.set(332, 79, 645, "minecraft:barrel[facing=up]");

// ---------- interior: vaults and belt (east), rail platform (middle), racks (west) ----------
// Item vault 3x3x9 (x350..352, y71..73, z643..651). A belt on top runs south from an intake chest on the catwalk; items
// fall off the belt end into a hopper that feeds the vault (the proven foundry output trick).
m.fill(350, F + 1, 643, 352, F + 3, 651, "create:item_vault[axis=z,large=false]");
m.set(351, 74, 641, "create:shaft[axis=x]"); m.set(351, 74, 651, "create:shaft[axis=x]"); // belt pulleys: link with a belt connector
m.set(351, 75, 641, "create:andesite_funnel[facing=down,extracting=true]"); m.set(351, 76, 641, "minecraft:chest[facing=west]");
m.set(351, 73, 652, "minecraft:hopper[facing=north]");
// Drive: shaft through the east wall to an outside gearbox where a power line (or a hand crank in survival) connects.
m.fill(352, 74, 641, 354, 74, 641, "create:shaft[axis=x]"); m.set(355, 74, 641, "create:gearbox[axis=y]");
m.set(355, 73, 641, "minecraft:polished_deepslate"); m.set(352, 72, 642, "create:speedometer[facing=west]");
// Catwalk around the intake (top slabs at y75) with a railing and a ladder from the platform.
for (let x = 348; x <= 353; x++) for (let z = 639; z <= 642; z++) if (!(x === 351 && z === 641)) m.set(x, 75, z, "minecraft:dark_oak_slab[type=top]");
for (let x = 348; x <= 353; x++) if (x !== 351) m.set(x, 76, 642, "minecraft:dark_oak_fence");
for (const z of [640, 641]) m.set(348, 76, z, "minecraft:dark_oak_fence");
m.fill(349, F + 1, 639, 349, 76, 639, "minecraft:ladder[facing=south]");
m.set(353, 76, 639, "minecraft:barrel[facing=up]"); m.set(350, 77, 639, "minecraft:lantern");
// West racks: barrels along the west wall, two double rows (barrels + chests) with dark oak posts and slab shelves,
// cross aisle at z644..647 from the cart door.
for (const z of [639, 640, 641, 642, 643, 648, 649, 650, 651, 652]) for (let y = F + 1; y <= F + 3; y++) m.set(336, y, z, "minecraft:barrel[facing=east]");
const rack = (x: number, face: string, kind: (z: number, y: number) => string) => {
  for (const [z0, z1] of [[640, 643], [648, 651]]) {
    for (let z = z0; z <= z1; z++) for (let y = F + 1; y <= F + 3; y++) m.set(x, y, z, kind(z, y));
    for (let z = z0; z <= z1; z++) m.set(x, F + 4, z, "minecraft:dark_oak_slab[type=bottom]");
    for (const z of [z0 - 1, z1 + 1]) m.fill(x, F + 1, z, x, F + 4, z, POST);
  }
  void face;
};
rack(339, "west", () => "minecraft:barrel[facing=west]");
rack(340, "east", (z, y) => (y === F + 3 ? "minecraft:barrel[facing=east]" : "minecraft:chest[facing=east]"));
rack(342, "west", (z, y) => (y === F + 3 ? "minecraft:barrel[facing=west]" : "minecraft:chest[facing=west]"));
rack(343, "east", () => "minecraft:barrel[facing=east]");
// Loose freight on the platforms by the rail.
for (const [x, y, z, b] of [[344, 71, 652, "minecraft:barrel[facing=up]"], [344, 72, 652, "minecraft:barrel[facing=up]"], [344, 71, 651, "minecraft:hay_block"],
  [348, 71, 652, "minecraft:barrel[facing=north]"], [349, 71, 652, "create:andesite_casing"], [348, 71, 641, "minecraft:barrel[facing=up]"]] as [number, number, number, string][]) m.set(x, y, z, b);

// ---------- steampunk accents outside ----------
// Copper pipe up the east wall to a small tank, and a weathered copper vent cowl on the ridge.
for (let y = F + 1; y <= 79; y++) m.set(355, y, 648, "create:fluid_pipe[up=true,down=true,north=false,south=false,east=false,west=false]");
m.fill(355, F + 1, 650, 355, F + 2, 650, "create:fluid_tank"); m.set(355, F + 3, 650, "create:fluid_pipe[up=false,down=true,north=true,south=false,east=false,west=false]");
m.set(355, F + 3, 649, "create:fluid_pipe[up=false,down=false,north=false,south=true,east=false,west=false]");
m.fill(344, 88, 645, 344, 89, 646, "minecraft:waxed_weathered_copper"); m.fill(344, 90, 645, 344, 90, 646, "minecraft:waxed_weathered_cut_copper_slab[type=bottom]");
m.fill(343, 89, 645, 343, 89, 646, "minecraft:waxed_weathered_copper_grate"); m.fill(345, 89, 645, 345, 89, 646, "minecraft:waxed_weathered_copper_grate");

export const blueprint = () => m.toBlueprint("warehouse", "Warehouse", "Timber-framed warehouse: rail platform, item vaults fed by a belt, racks, hoist hood",
  ["Belt x351 y74 z641..651 must be linked with a belt connector between the two shafts (cannot be setblock-placed).",
   "Power arrives at the gearbox outside the east wall (355,74,641); belt direction must carry items south (towards z651)."]);
export const origin = () => m.origin();
