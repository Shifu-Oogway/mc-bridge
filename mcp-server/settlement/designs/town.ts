// The town's buildings (all except the manor), built from shared parts. Front = +z in every design.
import type { Blueprint } from "../src/blueprint.ts";
import { Stamp, M } from "./parts.ts";

const plinth = (s: Stamp, x0: number, z0: number, x1: number, z1: number, floor = M.FLOOR) =>
  s.stage("foundation").box([x0, 0, z0], [x1, 0, z1], M.MOSSY).box([x0, 1, z0], [x1, 1, z1], M.STONE).box([x0 + 1, 1, z0 + 1], [x1 - 1, 1, z1 - 1], floor);

export function smeltery(): Blueprint {
  const s = new Stamp();
  plinth(s, 0, 0, 16, 12, "minecraft:polished_andesite");
  s.stage("walls").stoneStorey({ x0: 0, z0: 0, x1: 16, z1: 12, y0: 2, h: 5, block: M.BRICK, skipFront: [6, 10] })
    .box([1, 2, 1], [15, 6, 11], M.AIR).box([7, 2, 12], [9, 4, 12], M.AIR).steps(7, 9, 12).box([6, 5, 12], [10, 5, 12], M.DARKSTONE)
    .deck(0, 0, 16, 12, 7, M.DARKSTONE)
    .frame({ x0: 0, z0: 0, x1: 16, z1: 12, y0: 8, h: 3, every: 4 }).box([1, 7, 1], [15, 10, 11], M.AIR);
  s.stage("roof").roof({ axis: "x", a0: -1, a1: 17, b0: -1, b1: 13, y: 11, copper: true, gableWalls: [0, 16] });
  s.stage("stack").stack(17, 0, 5, 0, 26).box([16, 3, 2], [16, 3, 2], M.AIR).put([16, 3, 2], "minecraft:lightning_rod[facing=east]");
  s.stage("machines")
    .box([2, 2, 1], [10, 2, 1], "minecraft:blast_furnace[facing=south]").box([2, 3, 1], [10, 3, 1], "minecraft:hopper[facing=down]")
    .box([1, 5, 1], [11, 5, 2], M.COPPER).box([1, 6, 1], [11, 6, 1], "minecraft:waxed_cut_copper_slab[type=bottom]")
    .box([12, 3, 1], [14, 3, 1], "create:encased_fan[facing=south]").box([12, 2, 1], [14, 2, 1], M.DARKSTONE)
    .box([12, 6, 1], [15, 6, 1], "minecraft:lightning_rod[facing=east]")
    .box([2, 2, 4], [4, 4, 5], "create:fluid_tank").box([12, 2, 9], [15, 3, 11], "minecraft:chest[facing=north]")
    .put([5, 6, 6], "minecraft:lantern[hanging=true]").put([11, 6, 6], "minecraft:lantern[hanging=true]");
  return s.toBlueprint("smeltery", "Smeltery", "Ore smelting: blast-furnace bank under a copper hood, then encased-fan bulk blasting");
}

export function warehouse(): Blueprint {
  const s = new Stamp();
  plinth(s, 0, 0, 22, 12);
  s.stage("ground").stoneStorey({ x0: 0, z0: 0, x1: 22, z1: 12, y0: 2, h: 4, skipFront: [8, 14] })
    .box([1, 2, 1], [21, 5, 11], M.AIR).box([9, 2, 12], [13, 4, 12], M.AIR).steps(9, 13, 12).box([8, 5, 12], [14, 5, 12], M.BEAM)
    .deck(0, 0, 22, 12, 6).box([2, 6, 2], [6, 6, 4], M.AIR)
    .frame({ x0: 0, z0: 0, x1: 22, z1: 12, y0: 7, h: 4, every: 4, skipFront: [10, 12] }).box([1, 7, 1], [21, 10, 11], M.AIR)
    .box([11, 7, 12], [11, 8, 12], M.AIR);
  s.stage("roof").roof({ axis: "x", a0: -1, a1: 23, b0: -1, b1: 13, y: 11, gableWalls: [0, 22] });
  s.stage("cupola").walls([10, 19, 5], [12, 20, 7], M.BEAM).box([11, 19, 6], [11, 20, 6], M.AIR).put([11, 20, 5], M.PANE).put([11, 20, 7], M.PANE).pyramid(10, 5, 3, 21);
  s.stage("hoist").box([11, 11, 13], [11, 11, 15], M.COPPER).box([11, 9, 15], [11, 10, 15], "minecraft:chain").put([11, 8, 15], "minecraft:barrel[facing=up]");
  s.stage("interior");
  for (const z of [2, 5, 8]) s.box([2, 2, z], [7, 4, z], "minecraft:barrel[facing=south]").box([15, 2, z], [20, 4, z], "minecraft:barrel[facing=south]");
  s.box([2, 7, 2], [20, 8, 2], "minecraft:chest[facing=south]").box([2, 2, 10], [5, 2, 10], "minecraft:chest[facing=north]");
  for (let i = 0; i < 4; i++) s.put([3 + i, 2 + i, 3], "minecraft:spruce_stairs[facing=east,half=bottom]");
  for (const x of [5, 11, 17]) s.put([x, 5, 6], "minecraft:lantern[hanging=true]").put([x, 10, 6], "minecraft:lantern[hanging=true]");
  return s.toBlueprint("warehouse", "Warehouse", "Two-storey store: intake doors, labelled barrel/chest zones, gallery, hoist and cupola");
}

export function watermill(): Blueprint {
  const s = new Stamp();
  s.stage("footing").walls([0, 0, 0], [14, 4, 10], M.STONE).box([0, 0, 0], [14, 0, 10], M.MOSSY).box([1, 1, 1], [13, 4, 9], M.AIR).deck(0, 0, 14, 10, 5, M.STONE);
  s.stage("ground").stoneStorey({ x0: 0, z0: 0, x1: 14, z1: 10, y0: 6, h: 4, skipFront: [6, 8] }).box([1, 6, 1], [13, 9, 9], M.AIR).door(7, 6, 10, "north")
    .box([6, 5, 11], [8, 5, 11], "minecraft:stone_brick_stairs[facing=south,half=bottom]")
    .deck(0, 0, 14, 10, 10).frame({ x0: 0, z0: 0, x1: 14, z1: 10, y0: 11, h: 4, every: 4 }).box([1, 11, 1], [13, 14, 9], M.AIR);
  s.stage("roof").roof({ axis: "x", a0: -1, a1: 15, b0: -1, b1: 11, y: 15, gableWalls: [0, 14] });
  s.stage("mill").put([-3, 4, 5], "create:large_water_wheel[axis=x]").box([-2, 4, 5], [3, 4, 5], "create:shaft[axis=x]")
    .put([4, 4, 5], "create:gearbox[axis=y]").box([4, 5, 5], [4, 5, 5], "create:shaft[axis=y]").put([4, 6, 5], "create:millstone")
    .put([0, 4, 4], M.COPPER).put([0, 4, 6], M.COPPER).put([0, 5, 5], M.COPPER)
    .box([8, 6, 1], [12, 6, 1], "minecraft:barrel[facing=up]").put([12, 6, 8], "minecraft:chest[facing=west]")
    .put([7, 9, 5], "minecraft:lantern[hanging=true]").put([7, 14, 5], "minecraft:lantern[hanging=true]");
  return s.toBlueprint("watermill", "Watermill", "Grain mill on the lake bank: large water wheel, shaft through the footing to a millstone", ["The wheel side (local -x) goes over the water."]);
}

export function sawmill(): Blueprint {
  const s = new Stamp();
  plinth(s, 0, 0, 18, 10);
  s.stage("walls")
    .stoneStorey({ x0: 9, z0: 0, x1: 18, z1: 10, y0: 2, h: 3 }).box([10, 2, 1], [17, 4, 9], M.AIR).door(13, 2, 10, "north").steps(12, 14, 10)
    .deck(9, 0, 18, 10, 5).frame({ x0: 9, z0: 0, x1: 18, z1: 10, y0: 6, h: 4, every: 3 }).box([10, 6, 1], [17, 9, 9], M.AIR);
  for (const [x, z] of [[0, 0], [0, 10], [4, 0], [4, 10], [8, 0], [8, 10]]) s.box([x, 2, z], [x, 9, z], M.POST);
  s.box([0, 10, 0], [18, 10, 0], M.BEAM).box([0, 10, 10], [18, 10, 10], M.BEAM).box([0, 10, 0], [0, 10, 10], M.BEAM);
  for (const z of [0, 10]) for (const x of [1, 3, 5, 7]) s.put([x, 9, z], `minecraft:oak_stairs[facing=${z ? "north" : "south"},half=top]`);
  s.stage("roof").roof({ axis: "x", a0: -1, a1: 19, b0: -1, b1: 11, y: 11, gableWalls: [0, 18] });
  s.stage("saw").box([1, 2, 5], [7, 2, 5], "create:andesite_casing").box([3, 3, 5], [5, 3, 5], "create:mechanical_saw[facing=up]")
    .box([1, 8, 5], [8, 8, 5], "create:shaft[axis=x]").put([9, 8, 5], "create:gearbox[axis=y]")
    .stack(16, 1, 2, 11, 18);
  s.stage("logyard");
  for (let z = 1; z <= 9; z += 2) s.box([-5, 1, z], [-2, 2, z], "minecraft:oak_log[axis=x]");
  s.box([10, 2, 1], [12, 2, 1], "minecraft:chest[facing=south]").put([17, 2, 5], "minecraft:crafting_table").put([13, 9, 5], "minecraft:lantern[hanging=true]");
  return s.toBlueprint("sawmill", "Sawmill", "Forestry workshop: open saw bay with a belt-driven saw, workshop and store, log yard");
}

export function barn(): Blueprint {
  const s = new Stamp();
  plinth(s, 0, 0, 18, 10, "minecraft:coarse_dirt");
  s.stage("walls").frame({ x0: 0, z0: 0, x1: 18, z1: 10, y0: 2, h: 6, every: 3, windowsAt: 5, skipFront: [7, 11] })
    .box([1, 2, 1], [17, 7, 9], M.AIR).box([7, 2, 10], [11, 5, 10], M.AIR).steps(7, 11, 10).box([6, 6, 10], [12, 6, 10], M.BEAM)
    .box([1, 7, 1], [17, 7, 9], M.FLOOR).box([2, 7, 2], [5, 7, 3], M.AIR);
  s.stage("roof").roof({ axis: "x", a0: -1, a1: 19, b0: -1, b1: 11, y: 8, gambrel: 3, gableWalls: [0, 18] });
  s.stage("loft").box([8, 9, 10], [10, 10, 10], M.AIR).box([9, 13, 11], [9, 13, 12], M.BEAM).put([9, 12, 12], "minecraft:chain").put([9, 11, 12], "create:cogwheel[axis=z]")
    .put([9, 19, 5], "minecraft:lightning_rod");
  s.stage("stable").box([19, 0, 0], [24, 0, 10], M.MOSSY).box([19, 1, 0], [24, 1, 10], "minecraft:coarse_dirt")
    .box([24, 2, 0], [24, 3, 10], "minecraft:oak_fence").box([19, 2, 0], [23, 3, 0], "minecraft:oak_fence").box([19, 2, 10], [23, 3, 10], "minecraft:oak_fence")
    .put([24, 2, 5], "minecraft:oak_fence_gate[facing=east]").put([24, 3, 5], M.AIR);
  for (const [x, z] of [[24, 0], [24, 5], [24, 10]]) s.box([x, 2, z], [x, 5, z], M.POST);
  for (let k = 0; k < 6; k++) s.box([24 - k, 6 + Math.floor(k / 2), -1], [24 - k, 6 + Math.floor(k / 2), 11], k % 2 ? "minecraft:deepslate_tile_slab[type=top]" : "minecraft:deepslate_tile_slab[type=bottom]");
  s.stage("interior").box([1, 2, 1], [4, 4, 3], "minecraft:hay_block").box([14, 2, 1], [17, 2, 1], "minecraft:barrel[facing=up]")
    .box([20, 2, 2], [22, 2, 3], "minecraft:hay_block").put([9, 6, 5], "minecraft:lantern[hanging=true]");
  return s.toBlueprint("barn", "Grain Barn", "Gambrel barn with hay loft and winch, wide doors, lean-to stable");
}

export function gatehouse(): Blueprint {
  const s = new Stamp();
  for (const x0 of [0, 10]) {
    s.stage("towers").walls([x0, 0, 0], [x0 + 4, 12, 6], M.STONE).box([x0, 0, 0], [x0 + 4, 1, 6], M.MOSSY).box([x0 + 1, 1, 1], [x0 + 3, 11, 5], M.AIR)
      .box([x0 + 1, 5, 1], [x0 + 3, 5, 5], M.FLOOR).box([x0 + 1, 9, 1], [x0 + 3, 9, 5], M.FLOOR);
    for (const y of [3, 7, 11]) s.put([x0 + 2, y, 6], M.PANE).put([x0 + 2, y, 0], M.PANE);
    s.stage("caps").box([x0 - 1, 13, -1], [x0 + 5, 13, 7], M.BEAM).pyramid(x0 - 1, -1, 7, 14);
  }
  s.stage("passage").box([5, 0, 0], [9, 0, 6], M.STONE).box([5, 1, 0], [9, 4, 6], M.AIR)
    .box([5, 5, 0], [9, 5, 6], M.STONE).put([5, 4, 0], "minecraft:stone_brick_stairs[facing=east,half=top]").put([9, 4, 0], "minecraft:stone_brick_stairs[facing=west,half=top]")
    .put([5, 4, 6], "minecraft:stone_brick_stairs[facing=east,half=top]").put([9, 4, 6], "minecraft:stone_brick_stairs[facing=west,half=top]")
    .frame({ x0: 4, z0: 0, x1: 10, z1: 6, y0: 6, h: 4, every: 3 }).box([5, 6, 1], [9, 9, 5], M.AIR)
    .put([4, 3, 7], "minecraft:lantern").put([10, 3, 7], "minecraft:lantern").put([7, 4, 7], "minecraft:bell[attachment=ceiling]");
  s.stage("roof").roof({ axis: "z", a0: -1, a1: 7, b0: 4, b1: 10, y: 10, gableWalls: [0, 6] });
  return s.toBlueprint("gatehouse", "Gatehouse", "Twin stone towers with copper caps, arched passage, guard room bridging the gate");
}

export function pithead(): Blueprint {
  const s = new Stamp();
  s.stage("base").box([0, 0, 0], [6, 0, 6], M.STONE).box([2, 0, 2], [4, 0, 4], M.AIR);
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]]) s.box([x, 1, z], [x, 14, z], M.POST);
  s.stage("frame");
  for (const y of [5, 10, 14]) s.walls([1, y, 1], [5, y, 5], M.BEAM);
  s.box([2, 14, 2], [4, 14, 4], M.FLOOR).put([3, 15, 3], "create:large_cogwheel[axis=x]").put([3, 15, 2], "create:shaft[axis=z]").put([3, 15, 4], "create:shaft[axis=z]")
    .pyramid(1, 1, 5, 17).box([3, 1, 3], [3, 13, 3], "minecraft:chain");
  s.stage("winding_house").box([7, 0, 0], [15, 1, 6], M.STONE).stoneStorey({ x0: 7, z0: 0, x1: 15, z1: 6, y0: 2, h: 4, block: M.BRICK }).box([8, 2, 1], [14, 5, 5], M.AIR)
    .door(11, 2, 6, "north").steps(10, 12, 6).roof({ axis: "x", a0: 7, a1: 15, b0: -1, b1: 7, y: 6, copper: true, noBarge: true, gableWalls: [7, 15] })
    .box([9, 2, 2], [10, 4, 3], "create:fluid_tank").put([11, 3, 2], "create:steam_engine[facing=east]")
    .box([6, 4, 3], [6, 4, 3], "minecraft:lightning_rod[facing=west]").stack(14, -2, 2, 0, 16);
  return s.toBlueprint("pithead", "Pithead", "Timber headframe with sheave wheel and copper cap over the mine; brick winding house with boiler and stack");
}

export function machineHall(): Blueprint {
  const s = new Stamp();
  plinth(s, 0, 0, 12, 10, "minecraft:polished_andesite");
  s.stage("walls").stoneStorey({ x0: 0, z0: 0, x1: 12, z1: 10, y0: 2, h: 5, every: 2 }).box([1, 2, 1], [11, 6, 9], M.AIR).door(6, 2, 10, "north").steps(5, 7, 10).put([4, 4, 11], "minecraft:lantern").put([4, 3, 11], "minecraft:oak_fence").put([4, 2, 11], "minecraft:oak_fence")
    .box([0, 7, 0], [12, 7, 10], M.BEAM).box([1, 7, 1], [11, 7, 9], M.AIR);
  s.stage("roof").roof({ axis: "x", a0: -1, a1: 13, b0: -1, b1: 11, y: 8, copper: true, gableWalls: [0, 12] })
    .walls([4, 13, 4], [8, 14, 6], M.PANE).roof({ axis: "x", a0: 3, a1: 9, b0: 3, b1: 7, y: 15, copper: true, noBarge: true });
  s.stage("gearwall").put([13, 4, 3], "create:large_cogwheel[axis=x]").put([13, 4, 7], "create:large_cogwheel[axis=x]").put([13, 7, 5], "create:cogwheel[axis=x]");
  s.stage("machines").box([1, 6, 5], [11, 6, 5], "create:shaft[axis=x]")
    .put([3, 5, 5], "create:mechanical_press[facing=north]").put([3, 2, 5], "create:depot")
    .put([7, 5, 5], "create:mechanical_mixer").put([7, 2, 5], "create:basin")
    .box([10, 2, 1], [11, 2, 1], "minecraft:chest[facing=south]").put([1, 2, 8], "minecraft:crafting_table");
  return s.toBlueprint("machine-hall", "Workshop Machine Hall", "Annexe to the workshop: press and mixer on a shaft line, copper monitor roof, gear wall");
}

export function square(): Blueprint {
  const s = new Stamp();
  s.stage("paving").box([0, 0, 0], [21, 0, 15], "minecraft:stone_bricks").box([1, 0, 1], [20, 0, 14], "minecraft:cobblestone");
  for (let x = 2; x < 20; x += 3) s.box([x, 0, 1], [x, 0, 14], "minecraft:andesite");
  s.stage("tower").walls([8, 1, 5], [12, 7, 9], M.STONE).box([9, 1, 6], [11, 6, 8], M.AIR).door(10, 1, 9, "north")
    .frame({ x0: 8, z0: 5, x1: 12, z1: 9, y0: 8, h: 6, every: 2, windowsAt: 9 }).box([9, 8, 6], [11, 13, 8], M.AIR)
    .walls([7, 14, 4], [13, 14, 10], M.BEAM);
  for (const [x, z] of [[10, 4], [10, 10], [7, 7], [13, 7]]) s.put([x, 12, z], M.COPPER);
  s.box([9, 15, 6], [11, 17, 8], "create:fluid_tank").pyramid(8, 5, 5, 18);
  s.stage("furniture");
  for (const [x, z] of [[1, 1], [20, 1], [1, 14], [20, 14]]) s.box([x, 1, z], [x, 3, z], "minecraft:oak_fence").put([x, 4, z], "minecraft:lantern");
  for (const x of [3, 4, 16, 17]) s.put([x, 1, 3], "minecraft:spruce_stairs[facing=south,half=bottom]");
  // Finishing: a slab step all round so the raised paving meets the grass softly; planters either side of the tower.
  s.stage("edges").walls([-1, 0, -1], [22, 0, 16], "minecraft:stone_brick_slab[type=bottom]");
  for (const x0 of [2, 17]) s.box([x0, 1, 6], [x0 + 2, 1, 8], "minecraft:moss_block").box([x0, 2, 6], [x0 + 2, 2, 8], "minecraft:flowering_azalea").put([x0 + 1, 2, 7], "minecraft:azalea");
  s.stage("furniture");
  s.walls([4, 1, 11], [6, 1, 13], M.STONE).put([5, 1, 12], "minecraft:water").box([4, 2, 11], [4, 3, 11], "minecraft:oak_fence").box([6, 2, 13], [6, 3, 13], "minecraft:oak_fence").box([4, 4, 11], [6, 4, 13], "minecraft:spruce_slab[type=bottom]");
  return s.toBlueprint("square", "Market Square", "Cobbled square with the clock and water tower, well, benches and lantern posts");
}

export const TOWN = { smeltery, warehouse, watermill, sawmill, barn, gatehouse, pithead, machineHall, square };
