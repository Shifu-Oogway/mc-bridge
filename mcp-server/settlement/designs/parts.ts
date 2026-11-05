// Shared building parts in the settlement style. A Stamp collects ops in free design coordinates (front = +z),
// then shifts everything to a non-negative frame and sizes the blueprint from the bounds.
import type { Blueprint, Op } from "../src/blueprint.ts";

export type P = [number, number, number];
export const M = {
  STONE: "minecraft:stone_bricks", MOSSY: "minecraft:mossy_stone_bricks", COBBLE: "minecraft:cobblestone", INFILL: "minecraft:polished_diorite",
  POST: "minecraft:oak_log", BEAM: "minecraft:stripped_oak_wood", FLOOR: "minecraft:spruce_planks", PANE: "minecraft:glass_pane",
  BRICK: "minecraft:bricks", COPPER: "minecraft:waxed_cut_copper", OLDCOPPER: "minecraft:waxed_weathered_cut_copper", BRASS: "create:brass_casing",
  ANDESITE: "create:andesite_casing", AIR: "minecraft:air", DARKSTONE: "minecraft:polished_blackstone_bricks",
};

export class Stamp {
  stages: Record<string, Op[]> = {};
  private cur: Op[] = [];
  stage(id: string) { this.cur = this.stages[id] ??= []; return this; }
  box(a: P, b: P, block: string) { this.cur.push({ kind: "box", from: a, to: b, block }); return this; }
  walls(a: P, b: P, block: string) { this.cur.push({ kind: "walls", from: a, to: b, block }); return this; }
  put(a: P, block: string) { this.cur.push({ kind: "block", from: a, block }); return this; }

  /** Timber-framed walls (stone ground course or not), posts every `every`, mid rail, windows between posts. */
  frame(o: { x0: number; z0: number; x1: number; z1: number; y0: number; h: number; every?: number; infill?: string; windowsAt?: number; skipFront?: [number, number] }) {
    const { x0, z0, x1, z1, y0, h } = o, e = o.every ?? 4, top = y0 + h - 1, wy = o.windowsAt ?? y0 + 1;
    this.walls([x0, y0, z0], [x1, top, z1], o.infill ?? M.INFILL);
    const xs = new Set([x0, x1]); for (let x = x0; x <= x1; x += e) xs.add(x);
    const zs = new Set([z0, z1]); for (let z = z0; z <= z1; z += e) zs.add(z);
    for (const x of xs) for (const z of [z0, z1]) this.box([x, y0, z], [x, top, z], M.POST);
    for (const z of zs) for (const x of [x0, x1]) this.box([x, y0, z], [x, top, z], M.POST);
    const skip = (x: number) => o.skipFront && x >= o.skipFront[0] && x <= o.skipFront[1];
    for (let x = x0 + 1; x < x1; x++) if (!xs.has(x) && [...xs].some((p) => Math.abs(p - x) === Math.floor(e / 2))) {
      this.put([x, wy, z0], M.PANE); if (!skip(x)) this.put([x, wy, z1], M.PANE);
    }
    for (let z = z0 + 1; z < z1; z++) if (!zs.has(z) && [...zs].some((p) => Math.abs(p - z) === Math.floor(e / 2))) {
      this.put([x0, wy, z], M.PANE); this.put([x1, wy, z], M.PANE);
    }
    return this;
  }

  /** Stone-walled storey (ground floor) with windows every `every` blocks. */
  stoneStorey(o: { x0: number; z0: number; x1: number; z1: number; y0: number; h: number; every?: number; block?: string; skipFront?: [number, number] }) {
    const { x0, z0, x1, z1, y0, h } = o, e = o.every ?? 3;
    this.walls([x0, y0, z0], [x1, y0 + h - 1, z1], o.block ?? M.STONE);
    for (let x = x0 + 2; x < x1 - 1; x += e) { this.put([x, y0 + 1, z0], M.PANE); if (!(o.skipFront && x >= o.skipFront[0] && x <= o.skipFront[1])) this.put([x, y0 + 1, z1], M.PANE); }
    for (let z = z0 + 2; z < z1 - 1; z += e) { this.put([x0, y0 + 1, z], M.PANE); this.put([x1, y0 + 1, z], M.PANE); }
    return this;
  }

  /** Floor deck + plate ring. */
  deck(x0: number, z0: number, x1: number, z1: number, y: number, ring = M.BEAM) { this.box([x0, y, z0], [x1, y, z1], ring); this.box([x0 + 1, y, z0 + 1], [x1 - 1, y, z1 - 1], M.FLOOR); return this; }

  /**
   * 45-degree gable roof. axis "x": ridge along x over eaves at z0/z1 (rows step inward in z); axis "z": ridge along z.
   * gambrel: the first `gambrel` rows rise 2 per step. copper: copper roof instead of deepslate tiles.
   */
  roof(o: { axis: "x" | "z"; a0: number; a1: number; b0: number; b1: number; y: number; gambrel?: number; copper?: boolean; noBarge?: boolean; gableWalls?: [number, number] }) {
    const st = o.copper ? "minecraft:waxed_cut_copper_stairs" : "minecraft:deepslate_tile_stairs";
    const full = o.copper ? M.COPPER : "minecraft:deepslate_tiles", slab = o.copper ? "minecraft:waxed_cut_copper_slab[type=bottom]" : "minecraft:deepslate_tile_slab[type=bottom]";
    const [f0, f1] = o.axis === "x" ? ["south", "north"] : ["east", "west"];
    const at = (a: number, y: number, b: number): P => (o.axis === "x" ? [a, y, b] : [b, y, a]);
    let y = o.y;
    for (let k = 0; ; k++) {
      const b0 = o.b0 + k, b1 = o.b1 - k;
      if (b0 > b1) break;
      const steep = k < (o.gambrel ?? 0);
      if (b0 === b1) { this.box(at(o.a0, y, b0), at(o.a1, y, b0), full); this.box(at(o.a0, y + 1, b0), at(o.a1, y + 1, b0), slab); break; }
      if (steep) { this.box(at(o.a0, y, b0), at(o.a1, y, b0), full); this.box(at(o.a0, y, b1), at(o.a1, y, b1), full); y++; }
      this.box(at(o.a0, y, b0), at(o.a1, y, b0), `${st}[facing=${f0},half=bottom]`);
      this.box(at(o.a0, y, b1), at(o.a1, y, b1), `${st}[facing=${f1},half=bottom]`);
      if (!o.noBarge) for (const a of [o.a0, o.a1]) {
        this.put(at(a, y, b0), `minecraft:oak_stairs[facing=${f0},half=bottom]`); this.put(at(a, y, b1), `minecraft:oak_stairs[facing=${f1},half=bottom]`);
        if (steep) { this.put(at(a, y - 1, b0), M.BEAM); this.put(at(a, y - 1, b1), M.BEAM); }
      }
      if (o.gableWalls && b1 - b0 > 1) for (const a of o.gableWalls) this.box(at(a, y, b0 + 1), at(a, y, b1 - 1), M.INFILL);
      if (o.gableWalls && steep && b1 - b0 > 1) for (const a of o.gableWalls) this.box(at(a, y - 1, b0 + 1), at(a, y - 1, b1 - 1), M.INFILL);
      y++;
    }
    return this;
  }

  /** Square pyramid cap (towers, cupolas) of copper stairs with a finial. */
  pyramid(x0: number, z0: number, s: number, y: number, finial = "minecraft:lightning_rod") {
    let k = 0;
    for (; k * 2 < s; k++) {
      const lo = k, hi = s - 1 - k, yy = y + k;
      if (lo === hi) { this.put([x0 + lo, yy, z0 + lo], M.COPPER); break; }
      this.box([x0 + lo, yy, z0 + lo], [x0 + hi, yy, z0 + lo], "minecraft:waxed_cut_copper_stairs[facing=south,half=bottom]");
      this.box([x0 + lo, yy, z0 + hi], [x0 + hi, yy, z0 + hi], "minecraft:waxed_cut_copper_stairs[facing=north,half=bottom]");
      this.box([x0 + lo, yy, z0 + lo + 1], [x0 + lo, yy, z0 + hi - 1], "minecraft:waxed_cut_copper_stairs[facing=east,half=bottom]");
      this.box([x0 + hi, yy, z0 + lo + 1], [x0 + hi, yy, z0 + hi - 1], "minecraft:waxed_cut_copper_stairs[facing=west,half=bottom]");
    }
    const c = Math.floor((s - 1) / 2);
    this.put([x0 + c, y + k + 1, z0 + c], finial);
    return this;
  }

  /** Brick stack with copper bands, hollow, smoking campfire at the top. */
  stack(x0: number, z0: number, w: number, y0: number, y1: number) {
    this.walls([x0, y0, z0], [x0 + w - 1, y1, z0 + w - 1], M.BRICK);
    for (const yb of [y0 + Math.floor((y1 - y0) / 2), y1 - 1]) this.walls([x0, yb, z0], [x0 + w - 1, yb, z0 + w - 1], M.COPPER);
    this.box([x0 + 1, y1 - 2, z0 + 1], [x0 + w - 2, y1 - 2, z0 + w - 2], "minecraft:campfire[lit=true]");
    return this;
  }

  /** Two-step stone stair down from a +z-facing threshold at z (floor level y2) to the ground. */
  steps(x0: number, x1: number, z: number) {
    this.box([x0, 1, z + 1], [x1, 1, z + 1], "minecraft:stone_brick_stairs[facing=north,half=bottom]");
    this.box([x0, 0, z + 2], [x1, 0, z + 2], "minecraft:stone_brick_stairs[facing=north,half=bottom]");
    return this;
  }

  door(x: number, y: number, z: number, facing: string, wood = "spruce") {
    this.put([x, y, z], `minecraft:${wood}_door[facing=${facing},half=lower,hinge=left]`);
    this.put([x, y + 1, z], `minecraft:${wood}_door[facing=${facing},half=upper,hinge=left]`);
    return this;
  }

  toBlueprint(id: string, name: string, purpose: string, notes: string[] = []): Blueprint {
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const ops of Object.values(this.stages)) for (const op of ops) for (const p of [op.from, op.to ?? op.from]) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); }
    const sh = (p: P): P => [p[0] - mn[0], p[1] - mn[1], p[2] - mn[2]];
    const stages = Object.entries(this.stages).map(([sid, ops]) => ({ id: sid, name: sid, ops: ops.map((op) => ({ ...op, from: sh(op.from), ...(op.to && { to: sh(op.to) }) })) }));
    return { id, name, purpose, size: { w: mx[0] - mn[0] + 1, h: mx[1] - mn[1] + 1, d: mx[2] - mn[2] + 1 }, palette: {}, stages, notes: ["Front (main door) is local +z.", ...notes] };
  }
}
