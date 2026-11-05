// Grain barn on the user's spruce-log outline x300..332, z754..776 (sign at 313,80,765). Plateau at y77..79 with a small
// knoll (to y83) inside the outline; the ground falls to y73 north of z742.
// User choices: stone tithe barn (buttresses, slit vents), blackstone gable roof with a north wagon porch and a south
// hay-loft cross gable with hoist, full steampunk (own boiler + stack, exposed line shaft, pipes, copper), plus an
// automated wheat field (rotating harvester arm), millstones / mixer / smoking fan bakery corner, grain silos, threshing
// floor and hay loft.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CellMap } from "./cellmap.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const T1 = JSON.parse(fs.readFileSync(path.join(HERE, "..", "..", "plans", "medieval", "preview", "terrain-barn.json"), "utf8"));
const T2 = JSON.parse(fs.readFileSync(path.join(HERE, "..", "..", "plans", "medieval", "preview", "terrain-barn-north.json"), "utf8"));
const ground = (x: number, z: number) => T2.h[z - T2.z1]?.[x - T2.x1] ?? T1.h[z - T1.z1]?.[x - T1.x1] ?? 78;

const m = new CellMap();
const X0 = 300, X1 = 332, Z0 = 754, Z1 = 776, F = 78, PLATE = 86, RY = 87; // floor blocks y78, walls y79..85, roof from y87
const AIR = "minecraft:air", SB = "minecraft:stone_bricks", COB = "minecraft:cobblestone", POST = "minecraft:dark_oak_log",
  PLANK = "minecraft:spruce_planks", FENCE = "minecraft:dark_oak_fence", CU = "minecraft:waxed_weathered_cut_copper", CUB = "minecraft:waxed_weathered_copper",
  RS = (f: string) => `minecraft:polished_blackstone_brick_stairs[facing=${f},half=bottom]`, RFULL = "minecraft:polished_blackstone_bricks",
  RSLAB = "minecraft:polished_blackstone_brick_slab[type=bottom]", SBS = (f: string, h = "bottom") => `minecraft:stone_brick_stairs[facing=${f},half=${h}]`;
const WALL = (x: number, y: number, z: number) => {
  const r = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) % 12;
  if (y <= F + 2) return r < 7 ? COB : r < 10 ? "minecraft:mossy_cobblestone" : SB;
  return r < 8 ? SB : r < 10 ? "minecraft:cracked_stone_bricks" : r < 11 ? "minecraft:mossy_stone_bricks" : "minecraft:andesite";
};
const PIPE = (dirs: string[]) => `create:fluid_pipe[${["north", "south", "east", "west", "up", "down"].map((d) => `${d}=${dirs.includes(d)}`).join(",")}]`;

// ---------- ground: barn platform, west boiler yard, east silo pad ----------
for (let x = 291; x <= 338; x++) for (let z = 750; z <= 780; z++) {
  m.fill(x, 72, z, x, F - 1, z, "minecraft:dirt"); m.set(x, F, z, "minecraft:grass_block"); m.fill(x, F + 1, z, x, 100, z, AIR);
}

// ---------- walls ----------
for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) {
  const edge = x === X0 || x === X1 || z === Z0 || z === Z1;
  m.fill(x, 72, z, x, F - 1, z, "minecraft:stone");
  m.set(x, F, z, edge ? COB : x >= 314 && x <= 318 ? "minecraft:polished_andesite" : x < 314 ? "minecraft:packed_mud" : "minecraft:stone_bricks");
  if (edge) for (let y = F + 1; y < PLATE; y++) m.set(x, y, z, WALL(x, y, z));
}
m.ring(X0, PLATE, Z0, X1, Z1, SB);
for (let x = X0 - 1; x <= X1 + 1; x++) { m.set(x, PLATE, Z0 - 1, SBS("south", "top")); m.set(x, PLATE, Z1 + 1, SBS("north", "top")); }
for (let z = Z0; z <= Z1; z++) { m.set(X0 - 1, PLATE, z, SBS("east", "top")); m.set(X1 + 1, PLATE, z, SBS("west", "top")); }
// Buttresses: two-stepped, every 4 along the long walls (clear of the doors) and on the gable ends.
const butt = (x: number, z: number, dx: number, dz: number) => {
  const toWall = dz ? (dz < 0 ? "south" : "north") : (dx < 0 ? "east" : "west");
  m.fill(x + dx, 72, z + dz, x + dx, F + 5, z + dz, SB); m.set(x + dx, F + 6, z + dz, SBS(toWall));
  m.fill(x + 2 * dx, 72, z + 2 * dz, x + 2 * dx, F + 2, z + 2 * dz, COB); m.set(x + 2 * dx, F + 3, z + 2 * dz, SBS(toWall));
};
for (const x of [300, 303, 307, 311, 321, 325, 329, 332]) { butt(x, Z0, 0, -1); if (x < 311 || x > 321) butt(x, Z1, 0, 1); }
for (const z of [754, 770, 776]) butt(X0, z, -1, 0);
for (const z of [754, 765, 776]) butt(X1, z, 1, 0);
// Slit vents with iron bars between the buttresses.
for (const x of [305, 309, 323, 327]) for (const z of [Z0, Z1]) m.fill(x, F + 3, z, x, F + 5, z, "minecraft:iron_bars");
for (const z of [758, 762, 768, 772]) m.fill(X1, F + 3, z, X1, F + 5, z, "minecraft:iron_bars");

// ---------- doors: north wagon porch, south cart door ----------
m.fill(314, F + 1, Z0, 318, F + 5, Z0, AIR); m.fill(313, F + 6, Z0, 319, F + 6, Z0, "minecraft:dark_oak_log[axis=x]");
m.fill(314, F + 1, Z1, 318, F + 5, Z1, AIR); m.fill(313, F + 6, Z1, 319, F + 6, Z1, "minecraft:dark_oak_log[axis=x]");
for (const z of [Z0, Z1]) for (const x of [313, 319]) m.set(x, F + 5, z + (z === Z0 ? -1 : 1), z === Z0 ? "minecraft:lantern[hanging=true]" : "minecraft:lantern[hanging=true]");
// Porch: stone side walls z750..753 with an arched front, floor of polished andesite.
for (let z = 750; z <= 753; z++) {
  for (const x of [312, 320]) for (let y = F + 1; y < PLATE; y++) m.set(x, y, z, WALL(x, y, z));
  for (let x = 313; x <= 319; x++) { m.set(x, F, z, "minecraft:polished_andesite"); m.fill(x, 72, z, x, F - 1, z, "minecraft:stone"); }
  for (const x of [312, 320]) { m.set(x, F, z, COB); m.set(x, PLATE, z, SB); m.fill(x, 72, z, x, F - 1, z, "minecraft:stone"); }
}
m.fill(313, PLATE, 750, 319, PLATE, 750, SB);
m.set(313, F + 6, 750, SBS("east", "top")); m.set(319, F + 6, 750, SBS("west", "top")); m.fill(314, F + 7, 750, 318, F + 7, 750, SB);
m.set(312, F + 4, 749, "minecraft:lantern"); m.set(320, F + 4, 749, "minecraft:lantern");
m.set(312, F + 3, 749, FENCE); m.set(320, F + 3, 749, FENCE); m.set(312, F + 2, 749, FENCE); m.set(320, F + 2, 749, FENCE); m.set(312, F + 1, 749, FENCE); m.set(320, F + 1, 749, FENCE);

// ---------- roof: blackstone gable along x, cross gables over the porch (north) and the loft door (south) ----------
const mainY = (z: number) => RY + Math.min(z - (Z0 - 1), (Z1 + 1) - z);
for (let r = 0; ; r++) {
  const zn = Z0 - 1 + r, zs = Z1 + 1 - r, y = RY + r;
  if (zn === zs) { m.fill(X0 - 1, y, zn, X1 + 1, y, zn, RFULL); m.fill(X0 - 1, y + 1, zn, X1 + 1, y + 1, zn, RSLAB); break; }
  m.fill(X0 - 1, y, zn, X1 + 1, y, zn, RS("south")); m.fill(X0 - 1, y, zs, X1 + 1, y, zs, RS("north"));
  for (const x of [X0 - 1, X1 + 1]) { m.set(x, y, zn, `minecraft:dark_oak_stairs[facing=south,half=bottom]`); m.set(x, y, zs, `minecraft:dark_oak_stairs[facing=north,half=bottom]`); }
  for (const x of [X0, X1]) for (let z = zn + 1; z < zs; z++) m.set(x, y, z, WALL(x, y, z));
}
for (const x of [X0, X1]) { m.set(x, 93, 765, "minecraft:waxed_weathered_copper_grate"); m.set(x, 94, 765, "minecraft:waxed_weathered_copper_grate"); m.set(x, 92, 765, CU); }
const crossY = (x: number) => RY + Math.min(x - 311, 321 - x);
const crossRoof = (z0: number, z1: number) => {
  for (let r = 0; ; r++) {
    const xw = 311 + r, xe = 321 - r, y = RY + r;
    if (xw === xe) { m.fill(xw, y, z0, xw, y, z1, RFULL); m.fill(xw, y + 1, z0, xw, y + 1, z1, RSLAB); break; }
    m.fill(xw, y, z0, xw, y, z1, RS("east")); m.fill(xe, y, z0, xe, y, z1, RS("west"));
  }
};
// North porch roof (z749..757) and its gable front at z750; clear main-roof cells that end up inside it.
for (let z = 753; z <= 757; z++) for (let x = 312; x <= 320; x++) { const y = mainY(z); if (y < crossY(x)) m.set(x, y, z, AIR); }
crossRoof(749, 757);
for (let x = 312; x <= 320; x++) for (let y = PLATE + 1; y < crossY(x); y++) m.set(x, y, 750, WALL(x, y, 750));
for (const z of [749]) { m.set(311, RY, z, `minecraft:dark_oak_stairs[facing=east,half=bottom]`); m.set(321, RY, z, `minecraft:dark_oak_stairs[facing=west,half=bottom]`); }
// South loft cross gable (z772..779): gable wall at z776 with loft doors, hoist beam, chain and a hay bale.
for (let z = 772; z <= 777; z++) for (let x = 312; x <= 320; x++) { const y = mainY(z); if (y < crossY(x)) m.set(x, y, z, AIR); }
crossRoof(772, 779);
for (let x = 312; x <= 320; x++) for (let y = PLATE; y < crossY(x); y++) m.set(x, y, Z1, WALL(x, y, Z1));
m.fill(315, PLATE + 1, Z1, 317, PLATE + 3, Z1, AIR);
for (const y of [PLATE + 1, PLATE + 2, PLATE + 3]) { m.set(314, y, Z1 + 1, "minecraft:spruce_trapdoor[facing=south,half=bottom,open=true]"); m.set(318, y, Z1 + 1, "minecraft:spruce_trapdoor[facing=south,half=bottom,open=true]"); }
m.fill(316, 91, Z1 - 2, 316, 91, 779, "minecraft:dark_oak_log[axis=z]");
m.fill(316, 88, 779, 316, 90, 779, "minecraft:chain[axis=y]"); m.set(316, 87, 779, "minecraft:hay_block");
m.set(316, 90, 778, "create:cogwheel[axis=x]");
// Copper vent cowls along the ridge.
for (const x of [306, 326]) { m.fill(x, 100, 765, x, 101, 765, CUB); m.set(x, 102, 765, "minecraft:waxed_weathered_cut_copper_slab[type=bottom]");
  m.set(x - 1, 101, 765, "minecraft:waxed_weathered_copper_grate"); m.set(x + 1, 101, 765, "minecraft:waxed_weathered_copper_grate"); }

// ---------- interior: threshing floor (nave x314..318), hay loft over the bays, hay storage west, mill/bakery east ----------
for (const x of [312, 320]) for (const z of [757, 761, 765, 769, 773]) m.fill(x, F + 1, z, x, PLATE - 1, z, POST);
for (const x of [312, 320]) m.fill(x, PLATE, Z0 + 1, x, PLATE, Z1 - 1, "minecraft:dark_oak_log[axis=z]");
m.fill(X0 + 1, PLATE, Z0 + 1, 311, PLATE, Z1 - 1, PLANK); m.fill(321, PLATE, Z0 + 1, X1 - 1, PLATE, Z1 - 1, PLANK);
for (let x = 313; x <= 319; x += 6) for (let z = Z0 + 1; z <= Z1 - 1; z++) m.set(x, PLATE + 1, z, x === 313 ? FENCE : FENCE);
m.fill(X0 + 1, F + 1, 756, X0 + 1, PLATE + 1, 756, "minecraft:ladder[facing=east]"); m.set(X0 + 1, PLATE, 756, AIR);
m.fill(X1 - 1, F + 1, 774, X1 - 1, PLATE + 1, 774, "minecraft:ladder[facing=west]"); m.set(X1 - 1, PLATE, 774, AIR);
// Hay on the lofts and in the west bay.
for (let x = 302; x <= 310; x++) for (let z = 758; z <= 774; z++) { const h = ((x * 7 + z * 3) % 3) + 1; m.fill(x, PLATE + 1, z, x, PLATE + h, z, "minecraft:hay_block[axis=y]"); }
for (let x = 322; x <= 330; x++) for (let z = 758; z <= 772; z++) if ((x + z) % 4) m.set(x, PLATE + 1, z, "minecraft:hay_block[axis=y]");
for (let x = 301; x <= 308; x++) for (let z = 767; z <= 775; z++) { const h = ((x * 5 + z) % 3) + 1; m.fill(x, F + 1, z, x, F + h, z, "minecraft:hay_block[axis=y]"); }
// Threshing floor dressing.
for (const [x, y, z, b] of [[315, F + 1, 762, "minecraft:hay_block[axis=x]"], [317, F + 1, 769, "minecraft:hay_block[axis=z]"], [314, F + 1, 772, "minecraft:barrel[facing=up]"],
  [318, F + 1, 758, "minecraft:composter[level=5]"], [314, F + 1, 757, "minecraft:barrel[facing=up]"], [318, F + 1, 773, "minecraft:barrel[facing=up]"]] as [number, number, number, string][]) m.set(x, y, z, b);
for (const [x, z] of [[316, 760], [316, 766], [316, 772], [306, 765], [326, 765]]) m.set(x, PLATE - 1, z, "minecraft:lantern[hanging=true]");

// ---------- power: boiler house west of the barn ----------
// Cistern (2x2 sources) -> pump on a large cog -> 2x2x2 boiler on 4 blaze burners -> steam engine on the tank's north face.
// CRANK START: turn the hand crank (297,79,763) to run the pump until the boiler makes steam; then the engine keeps the
// pump going itself. Click the engine with a shaft if its powered shaft (297,80,761) does not appear.
m.fill(293, F, 759, 296, F, 762, SB);
for (let x = 293; x <= 296; x++) for (let z = 759; z <= 762; z++) m.set(x, F + 1, z, x === 293 || x === 296 || z === 759 || z === 762 ? SB : "minecraft:water");
// Intake: a pipe with ONE connection hanging into the cistern gets an open end (a corner pipe facing water does not).
m.set(294, F + 2, 760, PIPE(["up"])); m.set(294, F + 3, 760, PIPE(["down", "east"])); m.set(295, F + 3, 760, PIPE(["west", "east"]));
m.set(296, F + 3, 760, PIPE(["west", "south"])); m.set(296, F + 3, 761, PIPE(["north", "down"])); m.set(296, F + 2, 761, PIPE(["up", "south"]));
m.set(296, F + 2, 762, "create:mechanical_pump[facing=south]"); m.set(296, F + 2, 763, PIPE(["north", "south"]));
m.fill(296, F + 1, 764, 297, F + 1, 765, "create:blaze_burner[blaze=smouldering]"); m.fill(296, F + 2, 764, 297, F + 3, 765, "create:fluid_tank");
m.set(297, F + 2, 763, "create:steam_engine[facing=north,face=wall]"); m.set(297, F + 2, 761, "create:powered_shaft[axis=y]");
m.set(297, F + 1, 761, "create:gearbox[axis=x]"); m.set(297, F + 1, 762, "create:large_cogwheel[axis=z]"); m.set(297, F + 1, 763, "create:hand_crank[facing=south]");
m.fill(297, F + 3, 761, 297, F + 6, 761, "create:shaft[axis=y]"); m.set(297, F + 7, 761, "create:gearbox[axis=x]");
// Start clutch: the crank (256 SU) cannot turn the whole barn, so the lever on the clutch stays ON while cranking and
// is switched OFF once the engine runs.
m.set(297, F + 7, 760, "create:shaft[axis=z]"); m.set(297, F + 7, 759, "create:clutch[axis=z,powered=true]"); m.set(297, F + 8, 759, "minecraft:lever[face=floor,facing=north,powered=true]"); m.set(297, F + 7, 758, "create:gearbox[axis=y]");
m.set(298, F + 1, 764, "minecraft:chest[facing=east]"); // burner fuel
// Boiler house: open timber canopy over the boiler with a blackstone lean-to roof against the barn.
for (const [x, z] of [[292, 758], [292, 767], [299, 758], [299, 767]]) m.fill(x, F + 1, z, x, F + 7, z, POST);
for (let z = 757; z <= 768; z++) for (let x = 291; x <= 299; x++) m.set(x, F + 8 + Math.floor((x - 291) / 3), z, x === 299 ? RFULL : RS("east"));
// Stack: 2x2 brick chimney with weathered copper bands and a signal-fire plume.
for (let y = F + 1; y <= 98; y++) for (const [x, z] of [[293, 765], [294, 765], [293, 766], [294, 766]]) m.set(x, y, z, (y - F) % 6 === 0 ? CUB : "minecraft:bricks");
m.set(293, 99, 765, "minecraft:campfire[lit=true,signal_fire=true,facing=north]"); m.set(293, 98, 765, "minecraft:hay_block");
m.fill(293, 99, 766, 294, 99, 766, "minecraft:brick_slab[type=bottom]"); m.set(294, 99, 765, "minecraft:brick_slab[type=bottom]");
for (let y = F + 1; y <= 95; y++) m.set(295, y, 767, PIPE(["up", "down"])); // exposed copper steam pipe up the stack
// Decorative large cogs on the west gable.
m.set(299, 90, 760, "create:large_cogwheel[axis=x]"); m.set(299, 90, 770, "create:large_cogwheel[axis=x]");

// ---------- line shaft: overhead along the north side of the hall (y85, z758) ----------
m.fill(298, F + 7, 758, 330, F + 7, 758, "create:shaft[axis=x]");
for (const x of [313, 320, 328]) m.set(x, F + 7, 758, "create:gearbox[axis=z]");
m.set(306, F + 6, 758, "create:speedometer[facing=south]"); m.set(306, F + 7, 757, "minecraft:dark_oak_fence");
for (const x of [304, 316, 324]) m.set(x, F + 6, 757, "minecraft:chain[axis=y]");

// ---------- mill and bakery (east bay) ----------
// Line drop at x320 to an under-floor shaft (y77, z758) that turns the smoking fan. Each millstone is turned by a cog
// beside it (millstones mesh like cogs; they take no shaft from above), fed by a hopper from the chest behind it and
// emptied by a hopper underneath into a sunken chest (PROVEN: 8 wheat -> flour).
m.fill(320, F, 758, 320, F + 6, 758, "create:shaft[axis=y]"); m.set(320, F - 1, 758, "create:gearbox[axis=z]");
m.fill(321, F - 1, 758, 324, F - 1, 758, "create:shaft[axis=x]");
for (const [x, cx] of [[322, 321], [325, 326]]) {
  m.set(cx, F + 7, 758, "create:gearbox[axis=z]"); m.fill(cx, F + 2, 758, cx, F + 6, 758, "create:shaft[axis=y]"); m.set(cx, F + 1, 758, "create:cogwheel[axis=y]");
  m.set(x, F + 1, 758, "create:millstone"); m.set(x, F, 758, "minecraft:hopper[facing=south]"); m.set(x, F, 759, "minecraft:chest[facing=north]");
  m.set(x, F + 1, 757, "minecraft:hopper[facing=south]"); m.set(x, F + 2, 757, "minecraft:chest[facing=south]");
}
// Fan drive runs under the floor (south from the line, up at z760) so z759 stays free for the wheat splitter.
m.set(323, F - 1, 758, "create:gearbox[axis=y]"); m.set(323, F - 1, 759, "create:shaft[axis=z]"); m.set(323, F - 1, 760, "create:gearbox[axis=x]");
m.set(323, F, 760, "create:shaft[axis=y]"); m.set(323, F + 1, 760, "create:gearbox[axis=x]"); m.set(323, F + 1, 761, "create:encased_fan[facing=south]");
m.set(323, F + 1, 762, "minecraft:campfire[lit=true,facing=north]"); m.set(323, F + 1, 763, "create:depot");
// Mixer over a basin, turned by a cog beside it from the overhead line.
m.set(329, F + 7, 758, "create:gearbox[axis=z]"); m.fill(329, F + 4, 758, 329, F + 6, 758, "create:shaft[axis=y]"); m.set(329, F + 3, 758, "create:cogwheel[axis=y]");
m.set(328, F + 3, 758, "create:mechanical_mixer"); m.set(328, F + 1, 758, "create:basin");
m.set(327, F + 1, 758, "minecraft:water_cauldron[level=3]");
// Bakery corner: smoker, barrels of flour and bread, a work table.
for (const [x, y, z, b] of [[330, F + 1, 760, "minecraft:smoker[facing=west,lit=true]"], [330, F + 1, 761, "minecraft:barrel[facing=west]"], [330, F + 2, 761, "minecraft:barrel[facing=west]"],
  [330, F + 1, 762, "minecraft:crafting_table"], [327, F + 1, 764, "minecraft:barrel[facing=up]"], [326, F + 1, 764, "minecraft:barrel[facing=up]"]] as [number, number, number, string][]) m.set(x, y, z, b);

// ---------- automated wheat field (north): circular field r7 around (316,741), rotating harvester arm on a bearing ----------
// Drive: line drop at x313 -> under-floor/underground shaft north at y76 -> bearing under the field centre.
// RIGHT-CLICK THE BEARING (316,77,741) to assemble the arm; harvested wheat collects in the hub barrels.
const CX = 316, CZ = 741, FL = 77;
for (let x = CX - 9; x <= CX + 9; x++) for (let z = CZ - 9; z <= CZ + 8; z++) {
  const d = Math.hypot(x - CX, z - CZ);
  if (d > 9.3) continue;
  const g = ground(x, z);
  m.fill(x, Math.min(g, FL) - 3, z, x, FL - 1, z, d > 8.2 && g < FL ? SB : "minecraft:dirt");
  m.fill(x, FL + 1, z, x, FL + 6, z, AIR);
  if (d <= 7.4) m.set(x, FL, z, "minecraft:farmland[moisture=7]");
  else if (d <= 8.4) m.set(x, FL, z, "minecraft:coarse_dirt");
  else { m.set(x, FL, z, SB); m.set(x, FL + 1, z, FENCE); }
  if (d > 0.5 && d <= 7.4) m.set(x, FL + 1, z, "minecraft:wheat[age=7]");
}
for (const [dx, dz] of [[-5, 0], [5, 0], [0, -5], [0, 5], [-4, -4], [4, -4], [-4, 4], [4, 4]]) { m.set(CX + dx, FL, CZ + dz, "minecraft:water"); m.set(CX + dx, FL + 1, CZ + dz, AIR); }
m.set(CX, FL + 1, CZ + 9, "minecraft:dark_oak_fence_gate[facing=south]");
for (const [dx, dz] of [[-9, 0], [9, 0], [0, -9]]) m.set(CX + dx, FL + 2, CZ + dz, "minecraft:lantern");
m.fill(313, F + 1, 758, 313, F + 6, 758, "create:shaft[axis=y]"); m.set(313, F, 758, "create:shaft[axis=y]"); m.set(313, F - 1, 758, "create:shaft[axis=y]");
m.set(313, FL - 1, 758, "create:gearbox[axis=x]"); m.fill(313, FL - 1, CZ + 1, 313, FL - 1, 757, "create:shaft[axis=z]");
m.set(313, FL - 1, CZ, "create:gearbox[axis=y]"); m.fill(314, FL - 1, CZ, CX - 1, FL - 1, CZ, "create:shaft[axis=x]"); m.set(CX, FL - 1, CZ, "create:gearbox[axis=z]");
m.set(CX, FL, CZ, "create:mechanical_bearing[facing=up]");
// Arm: radial chassis (axis y, sticky on all four sides) so the harvesters and end barrels are carried along -- plain
// blocks on a bearing are not attached unless glued. Harvested wheat collects in the two end barrels.
const CH = "create:radial_chassis[axis=y,sticky_north=true,sticky_south=true,sticky_east=true,sticky_west=true]";
m.set(CX, FL + 1, CZ, CH);
for (let i = 1; i <= 7; i++) for (const s of [-1, 1]) {
  const x = CX + s * i; m.set(x, FL + 1, CZ, CH);
  m.set(x, FL + 1, CZ - 1, "create:mechanical_harvester[facing=north]"); m.set(x, FL + 1, CZ + 1, "create:mechanical_harvester[facing=south]");
}
m.set(CX - 8, FL + 1, CZ, "minecraft:barrel[facing=west]");
// East end: one more chassis carrying two barrels and the arm's storage interface (facing out). Once per turn it passes
// the fixed interface at the field edge (gap 1) and unloads the arm's barrels.
m.set(CX + 8, FL + 1, CZ, CH); m.set(CX + 8, FL + 1, CZ - 1, "minecraft:barrel[facing=north]"); m.set(CX + 8, FL + 1, CZ + 1, "minecraft:barrel[facing=south]");
m.set(CX + 9, FL + 1, CZ, "create:portable_storage_interface[facing=east]");
m.set(CX + 10, FL + 1, CZ, AIR); m.set(CX + 11, FL + 1, CZ, "create:portable_storage_interface[facing=west]");
m.set(CX + 9, FL, CZ, "minecraft:coarse_dirt"); m.set(CX + 10, FL, CZ, "minecraft:coarse_dirt");
// Wheat line to the mill: funnel under the fixed interface -> belt B1 south at y76 (underground, copper grates on top)
// -> belt B2 sloping up under the north wall into the hall -> drops into a hopper chain that feeds both millstones from
// the south side. Belts must be linked with a belt connector: B1 327,76,741/753; B2 327,76,754/327,81,759.
// Brass funnels on the fixed interface sort the arm's load (SET THEIR FILTERS IN GAME: /data merge block 327 77 741
// {Filter:{id:"minecraft:wheat",count:1}} and 328 78 741 {Filter:{id:"minecraft:wheat_seeds",count:1}}): wheat down onto the
// belt, seeds east into a hopper pair and a sunken seed chest.
m.set(327, FL, CZ, "create:brass_funnel[facing=down,extracting=true]");
m.set(328, FL + 1, CZ, "create:brass_funnel[facing=east,extracting=true]"); m.set(328, FL, CZ, "minecraft:hopper[facing=east]");
m.set(329, FL, CZ, "minecraft:hopper[facing=down]"); m.set(329, FL - 1, CZ, "minecraft:chest[facing=west]");
for (let z = CZ; z <= 753; z++) { m.set(327, 76, z, z === CZ || z === 753 ? "create:shaft[axis=x]" : AIR); if (z > CZ) m.set(327, 77, z, z % 3 ? "minecraft:coarse_dirt" : "minecraft:waxed_weathered_copper_grate"); }
for (let i = 0; i <= 5; i++) { m.set(327, 76 + i, 754 + i, i === 0 || i === 5 ? "create:shaft[axis=x]" : AIR); m.set(327, 77 + i, 754 + i, AIR); }
m.fill(317, 76, CZ, 326, 76, CZ, "create:shaft[axis=x]"); m.set(321, 76, CZ, "create:gearbox[axis=y]"); // B1 driven from the field bearing's gearbox; the gearbox reverses it so it runs south
m.set(328, 76, 753, "create:shaft[axis=x]"); m.set(329, 76, 753, "create:gearbox[axis=y]"); m.set(329, 76, 754, "create:gearbox[axis=y]"); m.set(328, 76, 754, "create:gearbox[axis=y]"); // straight-through gearbox reverses B2 so it climbs
// Even split (PROVEN): hoppers carry the wheat along z760 into a double chest (323..324, z759); one hopper under each
// half draws from the shared inventory in turn and passes west / east to the millstone feed hoppers.
for (const x of [327, 326, 325]) m.set(x, F + 2, 760, "minecraft:hopper[facing=west]"); m.set(324, F + 2, 760, "minecraft:hopper[facing=north]");
m.set(323, F + 2, 759, "minecraft:chest[facing=south,type=right]"); m.set(324, F + 2, 759, "minecraft:chest[facing=south,type=left]");
m.set(323, F + 1, 759, "minecraft:hopper[facing=west]"); m.set(324, F + 1, 759, "minecraft:hopper[facing=east]");
m.set(322, F + 1, 759, "minecraft:hopper[facing=north]"); m.set(325, F + 1, 759, "minecraft:hopper[facing=north]");
m.set(CX, FL, CZ + 1, AIR); m.set(CX, FL + 1, CZ + 1, AIR); // access hole: right-click the bearing's south face from here

// ---------- grain silos (east): two 3x3x9 item vaults with copper caps ----------
for (const z0 of [757, 771]) {
  m.fill(334, F, z0 - 1, 338, F, z0 + 3, "minecraft:polished_deepslate");
  // Vaults only lie horizontally: each silo is three stacked 3x3x3 vaults (three bins).
  for (const y of [F + 1, F + 4, F + 7]) m.fill(335, y, z0, 337, y + 2, z0 + 2, "create:item_vault[axis=x,large=false]");
  for (let x = 334; x <= 338; x++) for (let z = z0 - 1; z <= z0 + 3; z++) if (x === 334 || x === 338 || z === z0 - 1 || z === z0 + 3)
    m.set(x, F + 10, z, x === 334 ? "minecraft:waxed_weathered_cut_copper_stairs[facing=east,half=bottom]" : x === 338 ? "minecraft:waxed_weathered_cut_copper_stairs[facing=west,half=bottom]" : z === z0 - 1 ? "minecraft:waxed_weathered_cut_copper_stairs[facing=south,half=bottom]" : "minecraft:waxed_weathered_cut_copper_stairs[facing=north,half=bottom]");
  m.fill(335, F + 10, z0, 337, F + 10, z0 + 2, CU);
  m.set(336, F + 11, z0 + 1, CUB); m.set(336, F + 12, z0 + 1, "minecraft:lightning_rod");
  for (const [x, z] of [[334, z0 - 1], [338, z0 - 1], [334, z0 + 3], [338, z0 + 3]]) m.fill(x, F + 1, z, x, F + 9, z, POST);
  m.set(334, F + 2, z0 + 1, "create:andesite_funnel[facing=west,extracting=false]");
}
// Loft chute: pipe-style copper trunk from the east gable to the silo tops.
m.fill(333, 89, 758, 333, 89, 772, CU);

// ---------- KEEP: the user's changes (plans/medieval/preview/keep-grainbarn.json) ----------
const KEEP = path.join(HERE, "..", "..", "plans", "medieval", "preview", "keep-grainbarn.json");
if (fs.existsSync(KEEP)) for (const k of JSON.parse(fs.readFileSync(KEEP, "utf8")) as { pos: [number, number, number] }[]) m.del(...k.pos);

export const blueprint = () => m.toBlueprint("grainbarn", "Grain barn", "Stone tithe barn with porch and loft gable, steam-powered mill and bakery, harvester field and silos",
  ["Field arm: after placing, set every radial chassis (309..323,78,741) to range 1: /data merge block <pos> {ScrollValue:1} (setblock gives 8 = grabs the whole field). Click the bearing face away from its settings panel.",
   "Crank-start: lever on the clutch (297,86,759) ON, turn the hand crank (297,79,763) ~10 s until the engine runs, then lever OFF. Right-click the field bearing (316,77,741).",
   "Fuel chest for the burners at (298,79,764)."]);
export const origin = () => m.origin();
