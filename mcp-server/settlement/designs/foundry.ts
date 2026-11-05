// Foundry on the user's stone-brick outline x274..301, z680..699 (sign at 292,71,686). Ground y69..70.
// User choices: red brick walls, monitor roof (blackstone with a glazed ridge lantern), one tall stack + copper vent
// cowls, full steampunk machinery visible outside. Entrance on the north side facing the town.
import { CellMap } from "./cellmap.ts";

const m = new CellMap();
const X0 = 274, X1 = 301, Z0 = 680, Z1 = 699;
const BRICK = "minecraft:bricks", DSB = "minecraft:deepslate_bricks", PDS = "minecraft:polished_deepslate", CDS = "minecraft:cobbled_deepslate",
  FLOOR = "minecraft:polished_andesite", AIR = "minecraft:air", PANE = "minecraft:glass_pane", CU = "minecraft:waxed_weathered_cut_copper",
  RS = (f: string) => `minecraft:polished_blackstone_brick_stairs[facing=${f},half=bottom]`, RFULL = "minecraft:polished_blackstone_bricks",
  RSLAB = "minecraft:polished_blackstone_brick_slab[type=bottom]", BARGE = (f: string) => `minecraft:dark_oak_stairs[facing=${f},half=bottom]`,
  DSTAIR = (f: string, half = "bottom") => `minecraft:deepslate_brick_stairs[facing=${f},half=${half}]`,
  BSTAIR = (f: string, half = "bottom") => `minecraft:brick_stairs[facing=${f},half=${half}]`;

// Base: solid deepslate footing down to y64 (covers the shallow dip), floor at y70.
m.fill(X0, 64, Z0, X1, 69, Z1, CDS);
for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) {
  const edge = x === X0 || x === X1 || z === Z0 || z === Z1;
  m.set(x, 70, z, edge ? DSB : FLOOR);
  if (edge) { m.fill(x, 71, z, x, 80, z, BRICK); m.set(x, 71, z, PDS); } else m.fill(x, 71, z, x, 80, z, AIR);
}
// Pilasters every 4 blocks, standing 1 out from the long walls, with stair caps; corner piers.
const PILX = [274, 278, 282, 286, 290, 294, 298, 301];
for (const x of PILX) for (const [z, out] of [[Z0 - 1, "north"], [Z1 + 1, "south"]] as [number, string][]) {
  m.fill(x, 64, z, x, 80, z, DSB); m.set(x, 81, z, DSTAIR(out === "north" ? "south" : "north"));
}
for (const z of [680, 684, 688, 692, 696, 699]) for (const [x, out] of [[X0 - 1, "west"], [X1 + 1, "east"]] as [number, string][]) {
  m.fill(x, 64, z, x, 80, z, DSB); m.set(x, 81, z, DSTAIR(out === "west" ? "east" : "west"));
}
// Tall arched windows between pilasters (2 wide, 4 tall) with brick arch heads.
for (let i = 0; i < PILX.length - 1; i++) {
  const a = PILX[i] + 1, b = PILX[i + 1] - 1; if (b - a < 2) continue;
  const c = Math.floor((a + b) / 2);
  for (const [z, inward] of [[Z0, "south"], [Z1, "north"]] as [number, string][]) {
    if (z === Z0 && c >= 286 && c <= 290) continue; // entrance bay
    m.fill(c, 73, z, c + 1, 76, z, PANE);
    m.set(c, 77, z, BSTAIR("east", "top")); m.set(c + 1, 77, z, BSTAIR("west", "top"));
    m.set(c, 72, z, "minecraft:brick_slab[type=top]"); m.set(c + 1, 72, z, "minecraft:brick_slab[type=top]");
    void inward;
  }
}
for (const z of [682, 686, 690, 694, 697]) for (const x of [X0, X1]) { m.fill(x, 73, z, x, 76, z, PANE); m.set(x, 77, z, "minecraft:brick_slab[type=top]"); }
// Fan housings set into three north windows (full steampunk).
for (const x of [280, 292, 296]) { m.set(x, 74, Z0, "create:encased_fan[facing=north]"); m.set(x + 1, 74, Z0, "create:encased_fan[facing=north]"); }
// Cornice: corbelled deepslate band with an upside-down stair course.
for (let x = X0 - 1; x <= X1 + 1; x++) { m.soft(x, 80, Z0 - 1, DSTAIR("south", "top")); m.soft(x, 80, Z1 + 1, DSTAIR("north", "top")); }
for (let z = Z0; z <= Z1; z++) { m.soft(X0 - 1, 80, z, DSTAIR("east", "top")); m.soft(X1 + 1, 80, z, DSTAIR("west", "top")); }
m.ring(X0 - 1, 81, Z0 - 1, X1 + 1, Z1 + 1, DSB);

// Entrance: 4-wide arched doorway in the north wall, deepslate frame, steps, lanterns, sign board.
m.fill(287, 71, Z0, 290, 75, Z0, AIR);
m.set(287, 75, Z0, DSTAIR("east", "top")); m.set(290, 75, Z0, DSTAIR("west", "top")); m.fill(286, 76, Z0, 291, 76, Z0, PDS);
for (const x of [286, 291]) m.fill(x, 71, Z0, x, 75, Z0, DSB);
m.fill(287, 69, Z0 - 2, 290, 69, Z0 - 2, DSTAIR("south")); m.fill(287, 70, Z0 - 1, 290, 70, Z0 - 1, PDS);
m.set(286, 75, Z0 - 1, "minecraft:lantern[hanging=true]"); m.set(291, 75, Z0 - 1, "minecraft:lantern[hanging=true]");
m.fill(286, 76, Z0 - 1, 291, 76, Z0 - 1, "minecraft:dark_oak_slab[type=top]");

// Roof: blackstone gable along x over eaves at z678 / z701 from y82, barges and a hanging edge; monitor on the ridge.
const MX0 = 279, MX1 = 296, MZ0 = 686, MZ1 = 693;
for (let r = 0; ; r++) {
  const zn = Z0 - 2 + r, zs = Z1 + 2 - r, y = 82 + r;
  if (zn > zs) break;
  const inMon = (x: number, z: number) => x >= MX0 && x <= MX1 && z >= MZ0 && z <= MZ1;
  for (let x = X0 - 2; x <= X1 + 2; x++) {
    if (zn === zs) { if (!inMon(x, zn)) { m.set(x, y, zn, RFULL); m.set(x, y + 1, zn, RSLAB); } continue; }
    if (!inMon(x, zn)) m.set(x, y, zn, RS("south"));
    if (!inMon(x, zs)) m.set(x, y, zs, RS("north"));
  }
  if (zn === zs) break;
  for (const [x, f] of [[X0 - 2, "west"], [X1 + 2, "east"]] as [number, string][]) { m.set(x, y, zn, BARGE("south")); m.set(x, y, zs, BARGE("north")); m.soft(x, y - 1, zn, `minecraft:dark_oak_stairs[facing=${f},half=top]`); m.soft(x, y - 1, zs, `minecraft:dark_oak_stairs[facing=${f},half=top]`); }
  for (const x of [X0, X1]) for (let z = zn + 1; z < zs; z++) m.set(x, y, z, BRICK);
}
for (const x of [X0, X1]) { m.fill(x, 86, 688, x, 89, 691, PANE); m.set(x, 85, 689, BRICK); }
// Monitor: glazed clerestory walls with blackstone posts, its own small gable roof.
for (let x = MX0; x <= MX1; x++) for (const z of [MZ0, MZ1]) m.fill(x, 89, z, x, 91, z, (x - MX0) % 3 === 0 ? RFULL : PANE);
for (let z = MZ0; z <= MZ1; z++) for (const x of [MX0, MX1]) m.fill(x, 89, z, x, 91, z, RFULL);
m.fill(MX0 + 1, 89, MZ0 + 1, MX1 - 1, 91, MZ1 - 1, AIR);
for (let r = 0; r <= 4; r++) {
  const zn = MZ0 - 1 + r, zs = MZ1 + 1 - r, y = 92 + r;
  if (zn >= zs) { m.fill(MX0 - 1, y, zn, MX1 + 1, y, zn, RFULL); break; }
  m.fill(MX0 - 1, y, zn, MX1 + 1, y, zn, RS("south")); m.fill(MX0 - 1, y, zs, MX1 + 1, y, zs, RS("north"));
  if (r > 0) for (const x of [MX0, MX1]) m.fill(x, y, zn + 1, x, y, zs - 1, RFULL);
}
// Copper vent cowls on the main ridge either side of the monitor.
for (const x of [275, 277, 298, 300]) { m.set(x, 93, 689, "minecraft:waxed_weathered_copper_grate"); m.set(x, 94, 689, "minecraft:waxed_weathered_cut_copper_slab[type=bottom]"); m.set(x, 93, 690, "minecraft:waxed_weathered_copper_grate"); m.set(x, 94, 690, "minecraft:waxed_weathered_cut_copper_slab[type=bottom]"); }

// Stack: 4x4 brick at the south-east corner, rising well above the ridge, weathered copper bands, stepped cap, smoke.
m.fill(297, 64, 695, 300, 112, 698, BRICK); m.fill(298, 71, 696, 299, 111, 697, AIR);
for (const y of [90, 98, 106]) m.ring(297, y, 695, 300, 698, CU);
m.ring(296, 111, 694, 301, 699, DSB); m.ring(296, 112, 694, 301, 699, "minecraft:deepslate_brick_wall");
m.fill(298, 110, 696, 299, 110, 697, "minecraft:campfire[lit=true]");

// Outside machinery, west end: two 2x2 fluid tanks on a deepslate pad, copper pipe runs into the wall.
m.fill(268, 64, 683, 272, 70, 696, CDS); m.fill(268, 70, 683, 272, 70, 696, PDS);
for (const z0 of [684, 692]) { m.fill(269, 71, z0, 270, 74, z0 + 1, "create:fluid_tank"); m.fill(269, 75, z0, 270, 75, z0 + 1, CU); }
for (const z of [685, 693]) { m.fill(271, 73, z, X0 - 2, 73, z, "minecraft:lightning_rod[facing=east]"); m.set(X0, 73, z, CU); }
m.fill(271, 76, 685, 271, 76, 693, "minecraft:lightning_rod[facing=south]");
// Gear train on the north (street) face, between pilasters: two large cogs and a small one meshing.
m.set(284, 78, Z0 - 1, "create:large_cogwheel[axis=z]"); m.set(292, 78, Z0 - 1, "create:large_cogwheel[axis=z]"); m.set(288, 79, Z0 - 1, "create:cogwheel[axis=z]");
m.set(284, 78, Z0, "create:shaft[axis=z]"); m.set(292, 78, Z0, "create:shaft[axis=z]");
// Copper pipe along the north eaves from the stack side to the tanks side.
m.fill(X0, 79, Z0 - 2, X1, 79, Z0 - 2, "minecraft:lightning_rod[facing=east]");

// Interior: blast-furnace bank under a copper hood on the south wall, bulk-blasting line, tanks, shafting, lights.
m.fill(276, 71, 698, 295, 71, 698, "minecraft:blast_furnace[facing=north]");
m.fill(276, 72, 698, 295, 72, 698, "minecraft:hopper[facing=down]");
m.fill(276, 75, 697, 295, 75, 698, CU); m.fill(276, 76, 698, 295, 76, 698, "minecraft:waxed_weathered_cut_copper_stairs[facing=north,half=bottom]");
m.fill(276, 71, 696, 295, 71, 696, "minecraft:chest[facing=north]");
// Bulk blasting: fans (z689) blow south through lava (z690) onto depots (z691); deepslate ends hold the lava.
m.fill(280, 70, 689, 292, 70, 689, "create:encased_fan[facing=south]");
m.fill(279, 70, 690, 279, 70, 690, DSB); m.fill(293, 70, 690, 293, 70, 690, DSB);
m.fill(280, 70, 690, 292, 70, 690, "minecraft:lava");
m.fill(280, 71, 690, 292, 71, 690, "minecraft:iron_bars");
// Ore-smelting line, PROVEN in the creative preview on 2026-11-04 (8 raw iron in -> 8 iron ingots out; re-proven on steam with 12):
//   input chest -> andesite funnel (extracting) -> 15-long belt -> six encased fans blowing ACROSS the belt through the
//   lava trough (short exposure: long exposure burns the finished ingots) -> items fall off the belt end -> floor
//   hopper -> output chest. Belts cannot be set as blocks: in survival place shafts at both ends and join them with a
//   belt item. Fans are powered by a row of encased chain drives (same direction for all six).
// Only six fans (x282..287) blow; the rest of the trough is the glowing feature.
for (let x = 280; x <= 292; x++) if (x < 282 || x > 287) m.set(x, 70, 689, DSB);
m.set(279, 70, 691, "create:shaft[axis=z]"); m.set(293, 70, 691, "create:shaft[axis=z]");   // belt end pulleys (join with a belt item)
m.set(279, 72, 691, "minecraft:chest[facing=south]"); m.set(279, 71, 691, "create:andesite_funnel[facing=down,extracting=true]");
m.set(294, 69, 691, "minecraft:hopper[facing=down]"); m.set(294, 68, 691, "minecraft:chest[facing=north]"); m.set(294, 70, 691, AIR);
m.fill(282, 70, 688, 287, 70, 688, "create:encased_chain_drive[axis=z]");
// Steam power: blaze burners under the outside tanks (the boiler), a steam engine on the north tank, shaft through the wall,
// down to floor level, then along z687 to the chain-drive row (fans) and along z692 to the belt's start pulley.
for (const z0 of [684, 692]) m.fill(269, 70, z0, 270, 70, z0 + 1, "create:blaze_burner[blaze=kindled,facing=east]");
// PROVEN 2026-11-04: engine on the tank's east face; CLICK THE ENGINE (top) WITH A SHAFT to create its powered shaft two
// blocks out (273,72,685, vertical) -> 64 RPM, 16384 SU at boiler level 1 (4 fuelled blaze burners, one pump at 32 RPM
// = 16 water supply; 16 RPM pumping is not enough). Then up to a gearbox, through the wall, down to floor level.
m.set(271, 72, 685, "create:steam_engine[facing=east,face=wall]"); m.set(273, 72, 685, "create:powered_shaft[axis=y]");
m.set(273, 73, 685, "create:gearbox[axis=z]"); m.set(274, 73, 685, "create:shaft[axis=x]"); m.set(275, 73, 685, "create:gearbox[axis=z]");
m.set(275, 72, 685, "create:shaft[axis=y]"); m.set(275, 71, 685, "create:shaft[axis=y]"); m.set(275, 70, 685, "create:gearbox[axis=x]");
// Boiler water: mechanical pump into the tank's west face, driven at double speed by a large cogwheel (diagonal mesh).
m.set(268, 71, 684, "create:mechanical_pump[facing=east]"); m.set(268, 72, 683, "create:large_cogwheel[axis=x]"); m.set(267, 71, 684, "create:fluid_pipe");
m.set(275, 70, 686, "create:shaft[axis=z]"); m.set(275, 70, 687, "create:gearbox[axis=y]");
m.fill(276, 70, 687, 281, 70, 687, "create:shaft[axis=x]"); m.set(282, 70, 687, "create:gearbox[axis=y]");
m.fill(275, 70, 688, 275, 70, 691, "create:shaft[axis=z]"); m.set(275, 70, 692, "create:gearbox[axis=y]");
// Belt drive: 64 RPM is too fast (ore passes the lava raw) - reduce 4x to 16 RPM with two small->large cog stages,
// plus one extra small-cog mesh so the belt runs east (pulley speed -16). PROVEN: 12 raw iron -> 12 ingots on steam.
m.set(276, 70, 692, "create:cogwheel[axis=x]"); m.set(276, 71, 693, "create:large_cogwheel[axis=x]");
m.set(277, 71, 693, "create:cogwheel[axis=x]"); m.set(277, 71, 694, "create:cogwheel[axis=x]"); m.set(278, 71, 694, "create:cogwheel[axis=x]");
m.set(278, 70, 695, "create:large_cogwheel[axis=x]"); m.set(279, 70, 695, "create:gearbox[axis=y]");
m.fill(279, 70, 692, 279, 70, 694, "create:shaft[axis=z]");
// Line shaft overhead for future machines, from the same gearbox up through the hall.
m.fill(275, 74, 685, 275, 79, 685, "create:shaft[axis=y]"); m.set(275, 80, 685, "create:gearbox[axis=z]");
m.fill(276, 80, 685, 299, 80, 685, "create:shaft[axis=x]");
m.set(276, 74, 684, "create:speedometer[facing=south]"); m.set(277, 74, 684, "create:stressometer[facing=south]");
// Ore-cart line: rails in through an opening in the east wall, ending over a hopper that unloads into a chest.
m.fill(X1, 71, 684, X1, 72, 684, AIR);
m.fill(296, 71, 684, 305, 71, 684, "minecraft:rail[shape=east_west]"); m.fill(302, 70, 684, 305, 70, 684, PDS);
m.set(295, 71, 684, "minecraft:hopper[facing=down]"); m.set(295, 70, 684, "minecraft:chest[facing=north]");
m.set(294, 71, 684, "minecraft:polished_blackstone_bricks"); m.set(294, 72, 684, "minecraft:polished_blackstone_brick_wall");
// Wall details: copper pipes along both long walls, barrel and crate stacks, a workshop corner, extra lanterns.
m.fill(276, 78, Z0 + 1, 299, 78, Z0 + 1, "minecraft:lightning_rod[facing=east]");
m.fill(276, 78, Z1 - 1, 295, 78, Z1 - 1, "minecraft:lightning_rod[facing=east]");
for (const x of [280, 286, 292]) m.fill(x, 71, Z0 + 1, x, 77, Z0 + 1, "minecraft:lightning_rod[facing=up]");
m.fill(296, 71, 688, 299, 72, 689, "minecraft:barrel[facing=up]"); m.fill(296, 73, 688, 297, 73, 689, "minecraft:barrel[facing=up]");
m.fill(298, 71, 690, 299, 72, 691, "create:item_vault[axis=x]");
m.set(276, 71, 694, "minecraft:crafting_table"); m.set(277, 71, 694, "create:andesite_casing"); m.set(278, 71, 694, "create:andesite_casing");
m.set(277, 72, 694, "create:mechanical_press[facing=north]"); m.set(277, 71, 693, "create:depot");
for (const [x, z] of [[276, 688], [299, 693], [288, 696]]) m.set(x, 74, z, "minecraft:lantern");
for (const [x, z] of [[276, 687], [299, 692], [288, 695]]) m.fill(x, 71, z, x, 73, z, "minecraft:dark_oak_fence");
// Overhead shafting along the hall, carried on the monitor beams.
m.fill(276, 80, 689, 299, 80, 689, "create:shaft[axis=x]");
for (const x of [280, 286, 292]) m.set(x, 80, 690, "create:cogwheel[axis=x]");
for (const [x, z] of [[278, 684], [286, 684], [294, 684], [278, 694], [286, 694], [294, 694]]) { m.fill(x, 78, z, x, 80, z, "minecraft:chain"); m.set(x, 77, z, "minecraft:lantern[hanging=true]"); }
m.fill(276, 71, 681, 278, 73, 682, "create:fluid_tank"); m.fill(296, 71, 681, 299, 71, 682, "minecraft:barrel[facing=up]");
m.set(283, 71, 682, "minecraft:anvil[facing=east]"); m.set(285, 71, 682, "minecraft:smithing_table"); m.set(284, 71, 682, "minecraft:grindstone[face=floor,facing=east]");

export const blueprint = () => m.toBlueprint("foundry", "Foundry", "Brick foundry: blast-furnace bank, fan bulk-blasting over lava, tanks, stack and monitor roof");
export const PLACE = () => m.origin();
