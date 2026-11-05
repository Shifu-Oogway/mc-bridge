// The settlement design: every planned building as a blueprint, with the zone it belongs in on the real terrain.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Blueprint, Facing, Op, Triple } from "./blueprint.ts";
import { hall } from "./templates.ts";

const op = (kind: Op["kind"], from: Triple, to: Triple | undefined, block: string): Op => (to ? { kind, from, to, block } : { kind, from, block });
const HERE = path.dirname(fileURLToPath(import.meta.url));

export interface Planned {
  bp: Blueprint;
  /** Zone centre (world x,z) and search radius for the best-fitting site. */
  zone: { x: number; z: number; r: number };
  facing: Facing;
  /** "plinth": sits at the highest ground point with stone foundations down to the ground. "terrace": cut/fill to the mean. */
  fit: "plinth" | "terrace";
  /** Fixed origin (skips the site search), e.g. the workshop already started in survival. */
  origin?: { x: number; y: number; z: number };
}

export function settlement(): Planned[] {
  const workshop = JSON.parse(fs.readFileSync(path.join(HERE, "..", "blueprints", "starter-workshop.json"), "utf8")) as Blueprint;
  workshop.palette = { ...workshop.palette, T: "minecraft:oak_planks", K: "minecraft:oak_planks", I: "minecraft:polished_diorite" };

  // Watermill: wheel on the lake side (local west gable end), shaft through the wall to a millstone.
  const mill = hall({ id: "watermill", name: "Watermill", purpose: "Grain milling; first Create power (water wheel)", W: 9, D: 7, H: 4, extra: {
    machinery: [
      op("box", [0, 2, 3], [0, 4, 5], "air"),
      op("block", [0, 3, 4], undefined, "create:water_wheel[facing=west]"),
      op("block", [1, 3, 4], undefined, "create:shaft[axis=x]"),
      op("block", [2, 3, 4], undefined, "create:shaft[axis=x]"),
      op("block", [3, 3, 4], undefined, "create:gearbox[axis=y]"),
      op("block", [3, 2, 4], undefined, "create:millstone"),
      op("block", [5, 2, 2], undefined, "minecraft:barrel[facing=up]"),
      op("block", [6, 2, 2], undefined, "minecraft:barrel[facing=up]"),
      op("block", [7, 2, 6], undefined, "minecraft:chest[facing=north]"),
      op("block", [5, 5, 4], undefined, "minecraft:lantern[hanging=true]"),
    ],
  } });

  const smeltery = hall({ id: "smeltery", name: "Smeltery", purpose: "Ore smelting: furnace bank first, Create fan blasting later", W: 9, D: 7, H: 4, extraHeight: 6, extra: {
    interior: [
      op("box", [2, 2, 2], [6, 2, 2], "minecraft:blast_furnace[facing=south]"),
      op("box", [2, 3, 2], [6, 3, 2], "minecraft:hopper[facing=down]"),
      op("box", [2, 2, 4], [3, 2, 4], "minecraft:chest[facing=south]"),
      op("block", [5, 5, 4], undefined, "minecraft:lantern[hanging=true]"),
    ],
    chimney: [op("box", [7, 2, 2], [8, 13, 3], "minecraft:bricks"), op("box", [7, 14, 2], [8, 14, 3], "minecraft:campfire[lit=true]")],
  } });

  const warehouse = hall({ id: "warehouse", name: "Warehouse", purpose: "Labelled storage zones, intake, overflow", W: 15, D: 9, H: 4, postEvery: 4, extra: {
    interior: [
      op("box", [3, 2, 3], [13, 4, 3], "minecraft:barrel[facing=south]"),
      op("box", [3, 2, 5], [6, 3, 5], "minecraft:chest[facing=south]"),
      op("box", [10, 2, 5], [13, 3, 5], "minecraft:chest[facing=south]"),
      op("box", [3, 2, 8], [5, 2, 8], "minecraft:barrel[facing=up]"),
      op("block", [4, 5, 6], undefined, "minecraft:lantern[hanging=true]"),
      op("block", [12, 5, 6], undefined, "minecraft:lantern[hanging=true]"),
    ],
  } });

  const barn = hall({ id: "barn", name: "Grain Barn", purpose: "Wheat farm building: tools, seed and grain storage, hay loft", W: 11, D: 7, H: 5, extra: {
    doors: [op("box", [5, 2, 7], [7, 4, 7], "air"), op("box", [5, 5, 7], [7, 5, 7], "minecraft:oak_log")],
    interior: [op("box", [2, 2, 2], [4, 3, 3], "minecraft:hay_block"), op("box", [8, 2, 2], [10, 2, 2], "minecraft:barrel[facing=up]"),
      op("block", [6, 6, 4], undefined, "minecraft:lantern[hanging=true]")],
  } });

  const manor = hall({ id: "manor", name: "Manor House", purpose: "Hall, kitchen/dining, bedrooms, study, balcony", W: 17, D: 9, H: 7, postEvery: 4, windowRows: [1, 4], extraHeight: 4, extra: {
    upper: [
      op("box", [2, 5, 2], [16, 5, 8], "minecraft:spruce_planks"),
      op("box", [3, 5, 3], [3, 5, 5], "air"),
      op("box", [3, 2, 6], [3, 4, 6], "minecraft:ladder[facing=north]"),
      op("box", [6, 5, 10], [12, 5, 10], "minecraft:spruce_slab[type=top]"),
      op("box", [6, 6, 10], [12, 6, 10], "minecraft:oak_fence"),
      op("block", [9, 6, 9], undefined, "minecraft:oak_door[facing=south,half=lower]"),
      op("block", [9, 7, 9], undefined, "minecraft:oak_door[facing=south,half=upper]"),
    ],
    chimney: [op("box", [2, 2, 2], [3, 16, 3], "minecraft:bricks")],
    rooms: [
      op("box", [12, 2, 2], [15, 2, 2], "minecraft:smoker[facing=south]"),
      op("box", [7, 2, 4], [11, 2, 5], "minecraft:spruce_slab[type=top]"),
      op("block", [13, 6, 3], undefined, "minecraft:red_bed[facing=north,part=head]"),
      op("block", [13, 6, 4], undefined, "minecraft:red_bed[facing=north,part=foot]"),
      op("box", [5, 6, 2], [7, 7, 2], "minecraft:bookshelf"),
      op("block", [9, 4, 5], undefined, "minecraft:lantern[hanging=true]"),
      op("block", [9, 9, 5], undefined, "minecraft:lantern[hanging=true]"),
    ],
  } });

  const gatehouse = hall({ id: "gatehouse", name: "Gatehouse", purpose: "Guarded entrance to the manor grounds", W: 7, D: 5, H: 5, door: false, extra: {
    passage: [op("box", [3, 2, 1], [5, 4, 5], "air"), op("box", [3, 0, 1], [5, 1, 5], "minecraft:stone_bricks"),
      op("block", [2, 4, 0], undefined, "minecraft:lantern"), op("block", [6, 4, 0], undefined, "minecraft:lantern")],
  } });

  // Wheat field: two beds either side of a water channel, fenced, terraced into the ground.
  const field: Blueprint = { id: "wheat-field", name: "Wheat Field", purpose: "Wheat (bot-harvested first, Create harvester later)",
    size: { w: 13, h: 3, d: 11 }, palette: {}, stages: [{ id: "field", name: "Beds, channel, crop, fence", ops: [
      op("box", [0, 0, 0], [12, 0, 10], "minecraft:stone_bricks"),
      op("box", [1, 0, 1], [11, 0, 9], "minecraft:farmland[moisture=7]"),
      op("box", [1, 0, 5], [11, 0, 5], "minecraft:water"),
      op("box", [1, 1, 1], [11, 1, 4], "minecraft:wheat[age=7]"),
      op("box", [1, 1, 6], [11, 1, 9], "minecraft:wheat[age=7]"),
      op("walls", [0, 1, 0], [12, 1, 10], "minecraft:oak_fence"),
      op("block", [6, 1, 10], undefined, "minecraft:oak_fence_gate[facing=south]"),
    ] }] };

  const cane: Blueprint = { id: "cane-bed", name: "Sugar Cane Bed", purpose: "Sugar cane on the lake shore", size: { w: 9, h: 3, d: 3 }, palette: {},
    stages: [{ id: "bed", name: "Bed", ops: [op("box", [0, 0, 0], [8, 0, 2], "minecraft:sand"), op("box", [0, 0, 1], [8, 0, 1], "minecraft:water"),
      op("box", [0, 1, 0], [8, 2, 0], "minecraft:sugar_cane"), op("box", [0, 1, 2], [8, 2, 2], "minecraft:sugar_cane")] }] };

  return [
    { bp: workshop, zone: { x: 315, z: 646, r: 0 }, facing: "south", fit: "plinth", origin: { x: 310, y: 71, z: 642 } },
    { bp: smeltery, zone: { x: 332, z: 644, r: 8 }, facing: "south", fit: "plinth" },
    { bp: mill, zone: { x: 296, z: 640, r: 8 }, facing: "south", fit: "plinth" },
    { bp: cane, zone: { x: 300, z: 632, r: 10 }, facing: "south", fit: "terrace" },
    { bp: warehouse, zone: { x: 340, z: 656, r: 10 }, facing: "south", fit: "plinth" },
    { bp: barn, zone: { x: 334, z: 674, r: 10 }, facing: "east", fit: "plinth" },
    { bp: field, zone: { x: 350, z: 668, r: 10 }, facing: "south", fit: "terrace" },
    { bp: gatehouse, zone: { x: 352, z: 690, r: 8 }, facing: "north", fit: "plinth" },
    { bp: manor, zone: { x: 368, z: 694, r: 12 }, facing: "north", fit: "plinth" },
  ];
}
