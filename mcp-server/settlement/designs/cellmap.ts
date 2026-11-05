// Shared world-coordinate block map for hand-designed buildings, with a Blueprint export (runs merged along x).
import type { Blueprint, Op } from "../src/blueprint.ts";

export class CellMap {
  private C = new Map<string, string>();
  set(x: number, y: number, z: number, b: string) { this.C.set(`${x},${y},${z}`, b); }
  get(x: number, y: number, z: number) { return this.C.get(`${x},${y},${z}`); }
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: string) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.set(x, y, z, b);
  }
  ring(x0: number, y: number, z0: number, x1: number, z1: number, b: string) {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (x === x0 || x === x1 || z === z0 || z === z1) this.set(x, y, z, b);
  }
  /** Drop a planned cell so placement leaves the world block there alone. */
  del(x: number, y: number, z: number) { this.C.delete(`${x},${y},${z}`); }
  /** Set only where nothing is planned yet. */
  soft(x: number, y: number, z: number, b: string) { if (!this.get(x, y, z)) this.set(x, y, z, b); }
  toBlueprint(id: string, name: string, purpose: string, notes: string[] = []): Blueprint {
    const all = [...this.C.entries()].map(([k, b]) => { const [x, y, z] = k.split(",").map(Number); return { x, y, z, b }; });
    const mn = { x: Math.min(...all.map((c) => c.x)), y: Math.min(...all.map((c) => c.y)), z: Math.min(...all.map((c) => c.z)) };
    const mx = { x: Math.max(...all.map((c) => c.x)), y: Math.max(...all.map((c) => c.y)), z: Math.max(...all.map((c) => c.z)) };
    const rows = new Map<string, { x: number; b: string }[]>();
    for (const c of all) { const k = `${c.y},${c.z}`; (rows.get(k) ?? rows.set(k, []).get(k)!).push({ x: c.x, b: c.b }); }
    const ops: Op[] = [];
    for (const [k, list] of rows) {
      const [y, z] = k.split(",").map(Number); list.sort((a, b) => a.x - b.x); let s = 0;
      for (let i = 1; i <= list.length; i++) if (i === list.length || list[i].b !== list[s].b || list[i].x !== list[i - 1].x + 1) {
        ops.push({ kind: "box", from: [list[s].x - mn.x, y - mn.y, z - mn.z], to: [list[i - 1].x - mn.x, y - mn.y, z - mn.z], block: list[s].b }); s = i;
      }
    }
    // Bottom-up; attached blocks (lanterns, torches, trapdoors, fluids) after their supports on the same level.
    const late = (b: string) => (/lantern|torch|trapdoor|water|lava|chain|button|lever|sign/.test(b) ? 1 : 0);
    ops.sort((a, b) => a.from[1] - b.from[1] || late(a.block) - late(b.block));
    // Hanging lanterns need the block above: move them to the very end.
    ops.sort((a, b) => (/hanging=true/.test(a.block) ? 1 : 0) - (/hanging=true/.test(b.block) ? 1 : 0));
    return { id, name, purpose, size: { w: mx.x - mn.x + 1, h: mx.y - mn.y + 1, d: mx.z - mn.z + 1 }, palette: {}, stages: [{ id: "all", name: "all", ops }],
      notes: [`World-aligned: origin ${mn.x},${mn.y},${mn.z} facing south.`, ...notes] };
  }
  origin() { const all = [...this.C.keys()].map((k) => k.split(",").map(Number)); return { x: Math.min(...all.map((p) => p[0])), y: Math.min(...all.map((p) => p[1])), z: Math.min(...all.map((p) => p[2])) }; }
}
