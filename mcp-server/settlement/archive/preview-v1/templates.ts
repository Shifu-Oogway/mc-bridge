// Parametric building templates in the settlement style, producing ordinary Blueprint objects (so they can be
// verified, costed and built in survival exactly like hand-written blueprints).
import type { Blueprint, Op, Stage, Triple } from "./blueprint.ts";

export const PALETTE: Record<string, string> = {
  C: "minecraft:cobblestone", F: "minecraft:oak_planks", I: "minecraft:polished_diorite", L: "minecraft:oak_log",
  T: "minecraft:oak_planks", W: "minecraft:glass_pane", K: "minecraft:oak_planks",
  RN: "minecraft:cobbled_deepslate_stairs[facing=south,half=bottom]", RS: "minecraft:cobbled_deepslate_stairs[facing=north,half=bottom]",
  EN: "minecraft:oak_stairs[facing=south,half=bottom]", ES: "minecraft:oak_stairs[facing=north,half=bottom]",
};

export interface HallOpts {
  id: string; name: string; purpose: string;
  /** Outer wall size: W along x (ridge direction), D along z (front door on the z = D side). */
  W: number; D: number;
  /** Wall height above the 2-high plinth (default 3). */
  H?: number;
  /** Post spacing (default 4). */
  postEvery?: number;
  /** Extra ops per stage id (e.g. interior, machinery), in the hall's local frame. */
  extra?: Record<string, Op[]>;
  /** Extra headroom above the ridge for chimneys/towers. */
  extraHeight?: number;
  door?: boolean;
  /** Window heights above the plinth (default [1]: one row at y P+1). */
  windowRows?: number[];
}

const op = (kind: Op["kind"], from: Triple, to: Triple | undefined, block: string): Op => (to ? { kind, from, to, block } : { kind, from, block });

/** A timber-framed hall with a 45-degree gable roof whose ridge runs along x. Local frame: footprint x 1..W, z 1..D. */
export function hall(o: HallOpts): Blueprint {
  const H = o.H ?? 3, s = o.postEvery ?? 4, P = 2; // plinth rows y0..1, walls from y2
  const W = o.W, D = o.D, top = P + H; // plate level
  const rows = Math.ceil((D + 2) / 2); // roof rows per side (z = 0..D+1)
  const ridgeY = top + rows - 1 + ((D + 2) % 2 ? 0 : 0);
  const size = { w: W + 2, h: ridgeY + 3 + (o.extraHeight ?? 0), d: D + 2 };
  const cx = Math.round((1 + W) / 2);

  const foundation: Op[] = [
    op("walls", [1, 0, 1], [W, P - 1, D], "C"),
    op("box", [2, 0, 2], [W - 1, 0, D - 1], "minecraft:dirt"),
    op("floor", [2, P - 1, 2], [W - 1, P - 1, D - 1], "F"),
    op("box", [2, P, 2], [W - 1, top - 1, D - 1], "air"),
  ];
  if (o.door !== false) foundation.push(op("block", [cx, 0, D + 1], undefined, "minecraft:cobblestone_stairs[facing=north,half=bottom]"));

  const frame: Op[] = [op("walls", [1, P, 1], [W, top - 1, D], "I")];
  const postsX = new Set<number>([1, W]); for (let x = 1; x <= W; x += s) postsX.add(x);
  const postsZ = new Set<number>([1, D]); for (let z = 1; z <= D; z += s) postsZ.add(z);
  for (const x of postsX) for (const z of [1, D]) frame.push(op("box", [x, P, z], [x, top - 1, z], "L"));
  for (const z of postsZ) for (const x of [1, W]) frame.push(op("box", [x, P, z], [x, top - 1, z], "L"));
  // Windows midway between posts, one row up from the floor.
  for (const wr of o.windowRows ?? [1]) {
    const winY = P + wr;
    for (let x = 2; x < W; x++) if (!postsX.has(x) && [...postsX].some((p) => Math.abs(p - x) === Math.floor(s / 2))) {
      frame.push(op("block", [x, winY, 1], undefined, "W"));
      if (Math.abs(x - cx) > 1 || wr > 2) frame.push(op("block", [x, winY, D], undefined, "W"));
    }
    for (let z = 2; z < D; z++) if (!postsZ.has(z) && [...postsZ].some((p) => Math.abs(p - z) === Math.floor(s / 2))) {
      frame.push(op("block", [1, winY, z], undefined, "W"), op("block", [W, winY, z], undefined, "W"));
    }
  }
  frame.push(op("walls", [1, top, 1], [W, top, D], "T"));
  if (o.door !== false) {
    frame.push(op("box", [cx - 1, P, D], [cx - 1, top - 1, D], "L"), op("box", [cx + 1, P, D], [cx + 1, top - 1, D], "L"));
    frame.push(op("block", [cx, P, D], undefined, "minecraft:oak_door[facing=north,half=lower]"));
    frame.push(op("block", [cx, P + 1, D], undefined, "minecraft:oak_door[facing=north,half=upper]"));
    if (H >= 3) frame.push(op("box", [cx, P + 2, D], [cx, top - 1, D], "T"));
  }

  const roof: Op[] = [];
  for (let k = 0; k < rows; k++) {
    const y = top + k, zn = k, zs = D + 1 - k;
    if (zn > zs) break;
    if (zn === zs) { roof.push(op("box", [0, y, zn], [W + 1, y, zn], "K")); break; }
    roof.push(op("box", [0, y, zn], [W + 1, y, zn], "RN"), op("box", [0, y, zs], [W + 1, y, zs], "RS"));
    roof.push(op("block", [0, y, zn], undefined, "EN"), op("block", [W + 1, y, zn], undefined, "EN"));
    roof.push(op("block", [0, y, zs], undefined, "ES"), op("block", [W + 1, y, zs], undefined, "ES"));
    // Gable infill between the slopes on both end walls, with a king post on the centre line.
    if (k > 0 && zs - zn > 1) for (const x of [1, W]) roof.push(op("box", [x, y, zn + 1], [x, y, zs - 1], "I"));
  }
  if ((D + 2) % 2 === 0) roof.push(op("box", [0, top + rows, rows - 1], [W + 1, top + rows, rows], "minecraft:cobbled_deepslate_slab[type=bottom]"));
  const mid = Math.floor((D + 1) / 2);
  for (const x of [1, W]) roof.push(op("box", [x, top + 1, mid], [x, top + rows - 2, mid], "T"));

  const stages: Stage[] = [
    { id: "foundation", name: "Plinth, sub-floor, floor, step", ops: foundation },
    { id: "frame", name: "Infill walls, posts, plate, windows, door", ops: frame },
    { id: "roof", name: "Gable roof, barge boards, gable infill", ops: roof },
  ];
  for (const [sid, ops] of Object.entries(o.extra ?? {})) {
    const st = stages.find((x) => x.id === sid);
    if (st) st.ops.push(...ops); else stages.push({ id: sid, name: sid, ops });
  }
  return { id: o.id, name: o.name, purpose: o.purpose, size, palette: { ...PALETTE }, stages, notes: [`generated by templates.hall W${W} D${D} H${H}`] };
}
