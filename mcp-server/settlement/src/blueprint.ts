// Deterministic blueprints: local-frame ops -> world cells with rotated block states, material lists, and diffs
// against observed blocks. Pure functions only (no I/O), so everything here is unit-tested.

export type Vec = { x: number; y: number; z: number };
export type Facing = "north" | "east" | "south" | "west";
export type Triple = [number, number, number];

/** One construction op in the blueprint's local frame (x = right, y = up, z = toward the front door). */
export interface Op {
  /** box: solid fill; walls: the four vertical sides of the box only; floor: alias of box (readability); block: one cell. */
  kind: "box" | "walls" | "floor" | "block";
  from: Triple;
  to?: Triple;
  /** Palette key or literal block string, e.g. "P" or "minecraft:oak_stairs[facing=south,half=bottom]". "air" clears. */
  block: string;
}

export interface Stage {
  id: string;
  name: string;
  ops: Op[];
  /** What a human/controller should check after the stage beyond block-by-block verification. */
  checkpoint?: string;
}

export interface Blueprint {
  id: string;
  name: string;
  purpose: string;
  /** Local bounding size; used for footprint reservation. */
  size: { w: number; h: number; d: number };
  palette: Record<string, string>;
  /** Ordered alternatives the builder may substitute for a palette key when the preferred block is unavailable. */
  alternatives?: Record<string, string[]>;
  stages: Stage[];
  /** Cells that must stay clear for machinery service, doors and walkways (local frame). */
  clearance?: { name: string; from: Triple; to: Triple }[];
  notes?: string[];
}

/** Where a blueprint sits in the world: the world position of local (0,0,0) and which way local +z points. */
export interface Placement { origin: Vec; facing: Facing }

export interface Cell { pos: Vec; id: string; props: Record<string, string>; stage: string }

const ORDER: Facing[] = ["north", "east", "south", "west"];
/** Quarter turns clockwise (seen from above) that take local +z (south in the identity frame) to `facing`. */
export function turnsFor(facing: Facing): number {
  return (ORDER.indexOf(facing) - ORDER.indexOf("south") + 4) % 4;
}

export function rotateXZ(x: number, z: number, turns: number): [number, number] {
  let a = x, b = z;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) [a, b] = [-b, a];
  return [a + 0, b + 0]; // normalise -0
}

export function parseBlock(s: string): { id: string; props: Record<string, string> } {
  const m = /^([^\[]+)(?:\[(.*)\])?$/.exec(s.trim());
  if (!m) throw new Error(`bad block string: ${s}`);
  const id = m[1].includes(":") ? m[1] : `minecraft:${m[1]}`;
  const props: Record<string, string> = {};
  if (m[2]) for (const kv of m[2].split(",")) {
    const [k, v] = kv.split("=").map((t) => t.trim());
    if (k) props[k] = v;
  }
  return { id, props };
}

export function formatBlock(id: string, props: Record<string, string>): string {
  const keys = Object.keys(props).sort();
  return keys.length ? `${id}[${keys.map((k) => `${k}=${props[k]}`).join(",")}]` : id;
}

const AXIS_SWAP: Record<string, string> = { x: "z", z: "x", y: "y" };

/** Rotate direction-bearing state properties by quarter turns clockwise. */
export function rotateProps(props: Record<string, string>, turns: number): Record<string, string> {
  const t = ((turns % 4) + 4) % 4;
  if (!t) return { ...props };
  const out = { ...props };
  if (ORDER.includes(props.facing as Facing)) out.facing = ORDER[(ORDER.indexOf(props.facing as Facing) + t) % 4];
  if (props.axis && t % 2 === 1) out.axis = AXIS_SWAP[props.axis] ?? props.axis;
  if (props.rotation !== undefined) out.rotation = String((Number(props.rotation) + 4 * t) % 16);
  // Fences, walls, panes and redstone carry per-side connection flags; they are recomputed by the game anyway.
  for (const side of ORDER) delete out[side];
  for (const side of ORDER) if (props[side] !== undefined) {
    out[ORDER[(ORDER.indexOf(side) + t) % 4]] = props[side];
  }
  return out;
}

function boxCells(op: Op): Triple[] {
  const a = op.from, b = op.to ?? op.from;
  const lo: Triple = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
  const hi: Triple = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
  const out: Triple[] = [];
  for (let y = lo[1]; y <= hi[1]; y++)
    for (let x = lo[0]; x <= hi[0]; x++)
      for (let z = lo[2]; z <= hi[2]; z++) {
        if (op.kind === "walls" && x !== lo[0] && x !== hi[0] && z !== lo[2] && z !== hi[2]) continue;
        out.push([x, y, z]);
      }
  return out;
}

export function resolveBlock(bp: Blueprint, key: string, substitutions: Record<string, string> = {}): string {
  if (key === "air") return "minecraft:air";
  const chosen = substitutions[key] ?? bp.palette[key];
  if (chosen !== undefined) return chosen;
  if (/^[A-Za-z]$/.test(key)) throw new Error(`palette key "${key}" is not defined in ${bp.id}`);
  return key;
}

/** Expand stages to world cells. Later ops overwrite earlier ones in the same cell (e.g. a window cut into a wall). */
export function expand(bp: Blueprint, place: Placement, opts: { stages?: string[]; substitutions?: Record<string, string> } = {}): Cell[] {
  const turns = turnsFor(place.facing);
  const cells = new Map<string, Cell>();
  for (const st of bp.stages) {
    if (opts.stages && !opts.stages.includes(st.id)) continue;
    for (const op of st.ops) {
      const raw = resolveBlock(bp, op.block, opts.substitutions);
      // A palette entry may itself carry state; a literal op string may add more.
      const { id, props } = parseBlock(raw);
      const rprops = rotateProps(props, turns);
      for (const [x, y, z] of boxCells(op)) {
        const [rx, rz] = rotateXZ(x, z, turns);
        const pos = { x: place.origin.x + rx, y: place.origin.y + y, z: place.origin.z + rz };
        cells.set(`${pos.x},${pos.y},${pos.z}`, { pos, id, props: rprops, stage: st.id });
      }
    }
  }
  return [...cells.values()].sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x || a.pos.z - b.pos.z);
}

/** World-space axis-aligned footprint of the whole blueprint, for plot reservation. */
export function footprint(bp: Blueprint, place: Placement): { from: Vec; to: Vec } {
  const turns = turnsFor(place.facing);
  const corners = [[0, 0], [bp.size.w - 1, 0], [0, bp.size.d - 1], [bp.size.w - 1, bp.size.d - 1]].map(([x, z]) => rotateXZ(x, z, turns));
  const xs = corners.map((c) => c[0] + place.origin.x), zs = corners.map((c) => c[1] + place.origin.z);
  return {
    from: { x: Math.min(...xs), y: place.origin.y, z: Math.min(...zs) },
    to: { x: Math.max(...xs), y: place.origin.y + bp.size.h - 1, z: Math.max(...zs) },
  };
}

/** Item needed to place a given block state, and how many; null when the cell consumes nothing. */
export function itemFor(id: string, props: Record<string, string>): { item: string; count: number } | null {
  if (/:(air|cave_air|void_air)$/.test(id)) return null;
  if (props.half === "upper" && /_door$|tall_grass|large_fern|sunflower|lilac|rose_bush|peony/.test(id)) return null;
  if (props.part === "head" && /_bed$/.test(id)) return null;
  if (id === "minecraft:water") return { item: "minecraft:water_bucket", count: 1 };
  if (id === "minecraft:lava") return { item: "minecraft:lava_bucket", count: 1 };
  if (id === "minecraft:wall_torch") return { item: "minecraft:torch", count: 1 };
  if (id === "minecraft:redstone_wire") return { item: "minecraft:redstone", count: 1 };
  if (/_wall_(sign|hanging_sign|banner|head|skull)$/.test(id)) return { item: id.replace("_wall_", "_"), count: 1 };
  if (id === "minecraft:farmland" || id === "minecraft:dirt_path") return { item: "minecraft:dirt", count: 1 };
  if (props.type === "double" && /_slab$/.test(id)) return { item: id, count: 2 };
  return { item: id, count: 1 };
}

export function materials(cells: Cell[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cells) {
    const it = itemFor(c.id, c.props);
    if (it) out[it.item] = (out[it.item] ?? 0) + it.count;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

export interface Observed { id: string; properties?: Record<string, string>; replaceable?: boolean; loaded?: boolean }

export type CellStatus = "ok" | "wrong_state" | "missing" | "obstructed" | "unloaded";

/** Compare one planned cell to what the game reports. Only properties the blueprint specifies are checked. */
export function classify(c: Cell, o: Observed): CellStatus {
  if (o.loaded === false) return "unloaded";
  const isAir = /:(air|cave_air|void_air)$/.test(c.id);
  if (isAir) return /:(air|cave_air|void_air)$/.test(o.id) ? "ok" : "obstructed";
  // Dirt next to grass turns into grass by itself; that is not a construction error.
  if (c.id === "minecraft:dirt" && /:(grass_block|mycelium|podzol)$/.test(o.id)) return "ok";
  if (o.id !== c.id) return o.replaceable || /:(air|cave_air|void_air)$/.test(o.id) ? "missing" : "obstructed";
  for (const [k, v] of Object.entries(c.props)) {
    if (ORDER.includes(k as Facing) || k === "waterlogged" || k === "shape" || k === "distance" || k === "persistent") continue;
    if (o.properties && o.properties[k] !== undefined && o.properties[k] !== v) return "wrong_state";
  }
  return "ok";
}

export function summarize(cells: Cell[], observed: Observed[]) {
  const counts: Record<CellStatus, number> = { ok: 0, wrong_state: 0, missing: 0, obstructed: 0, unloaded: 0 };
  const problems: { pos: Vec; want: string; have: string; status: CellStatus }[] = [];
  cells.forEach((c, i) => {
    const s = classify(c, observed[i]);
    counts[s]++;
    if (s !== "ok") problems.push({ pos: c.pos, want: formatBlock(c.id, c.props), have: observed[i].id, status: s });
  });
  return { total: cells.length, counts, complete: counts.ok === cells.length, problems };
}

/** Unit vector for a horizontal facing. */
export const DIR: Record<Facing, Vec> = {
  north: { x: 0, y: 0, z: -1 }, south: { x: 0, y: 0, z: 1 }, east: { x: 1, y: 0, z: 0 }, west: { x: -1, y: 0, z: 0 },
};

/**
 * Where to stand so vanilla placement rules yield the wanted `facing`. Stairs, doors and fence gates face the way the
 * player looks; chests, furnaces, smokers, barrels-on-side and lecterns face back toward the player. Returns null
 * when the block's facing is not player-controlled this way (the cell is still verified afterwards).
 */
export function standFor(c: Cell, distance = 2): Vec | null {
  const f = c.props.facing as Facing | undefined;
  if (!f || !DIR[f]) return null;
  let sign: number;
  if (/_stairs$|_door$|_fence_gate$/.test(c.id)) sign = -1;           // stand behind, look along facing
  else if (/chest$|furnace$|smoker$|lectern$|carved_pumpkin$|jack_o_lantern$/.test(c.id)) sign = 1; // stand in front
  else return null;
  const d = DIR[f];
  return { x: c.pos.x + sign * d.x * distance, y: c.pos.y, z: c.pos.z + sign * d.z * distance };
}

export function validate(bp: Blueprint): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const st of bp.stages) {
    if (ids.has(st.id)) errs.push(`duplicate stage ${st.id}`);
    ids.add(st.id);
    for (const op of st.ops) {
      try { resolveBlock(bp, op.block); } catch (e) { errs.push(`${st.id}: ${(e as Error).message}`); }
      for (const p of [op.from, op.to ?? op.from]) {
        if (p[0] < 0 || p[1] < 0 || p[2] < 0 || p[0] >= bp.size.w || p[1] >= bp.size.h || p[2] >= bp.size.d) {
          errs.push(`${st.id}: ${op.kind} ${JSON.stringify(p)} outside size ${JSON.stringify(bp.size)}`);
        }
      }
    }
  }
  return errs;
}
