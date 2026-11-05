// Creative-preview builder: fits every planned building to the real terrain and places it with /fill.
//   node settlement/scripts/preview.ts [--dry] [--only id,id]
// Only for a CREATIVE world with cheats (refuses otherwise). Uses plans/medieval/terrain.json for site search and
// live block reads for exact foundation depths. Writes plans/medieval/preview-sites.json.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as B from "../src/blueprint.ts";
import { settlement, type Planned } from "../src/design.ts";
import { openWorld } from "../src/world.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dry = process.argv.includes("--dry");
const onlyArg = process.argv.indexOf("--only");
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(",") : null;
const inst = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS");
const w = openWorld(inst);
if (!w || w.gameType !== 1 || !w.allowCommands) throw new Error(`refusing: open world ${w?.folder} is not creative with cheats`);
const conn = JSON.parse(fs.readFileSync(path.join(inst, "mcbridge", "connection.json"), "utf8"));
const call = (route: string, body?: unknown) => fetch(`http://${conn.host}:${conn.port}${route}`, {
  method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" },
  body: body ? JSON.stringify(body) : undefined,
}).then((r) => r.json());
let cmds = 0;
async function cmd(c: string) {
  if (c.length > 256) throw new Error(`command too long: ${c.slice(0, 80)}`);
  cmds++;
  if (dry) return;
  const r = await call("/chat", { message: c });
  if (r?.error) console.error("cmd error", c, r.error);
}

const T = JSON.parse(fs.readFileSync(path.join(root, "plans", "medieval", "terrain.json"), "utf8"));
const at = (x: number, z: number) => {
  const c = Math.round((x - T.x1) / T.step), r = Math.round((z - T.z1) / T.step);
  if (r < 0 || r >= T.h.length || c < 0 || c >= T.h[0].length) return { g: null as number | null, wet: true };
  const g = T.h[r][c], wv = T.water[r][c];
  return { g: g === null || g < 0 ? null : g, wet: wv !== null && wv > (g ?? -999) };
};

type Box = { from: B.Vec; to: B.Vec };
const taken: Box[] = [];
const overlaps = (a: Box, pad: number) => taken.some((b) => !(a.to.x + pad < b.from.x || a.from.x - pad > b.to.x || a.to.z + pad < b.from.z || a.from.z - pad > b.to.z));

function site(p: Planned) {
  if (p.origin) return { origin: p.origin, cost: 0 };
  let best: { origin: B.Vec; cost: number } | null = null;
  for (let dx = -p.zone.r; dx <= p.zone.r; dx++) for (let dz = -p.zone.r; dz <= p.zone.r; dz++) {
    const o = { x: p.zone.x + dx, y: 0, z: p.zone.z + dz };
    const fp = B.footprint(p.bp, { origin: o, facing: p.facing });
    if (overlaps(fp, 2)) continue;
    const hs: number[] = []; let wet = false;
    for (let x = fp.from.x; x <= fp.to.x; x += 2) for (let z = fp.from.z; z <= fp.to.z; z += 2) {
      const s = at(x, z); if (s.wet || s.g === null) wet = true; else hs.push(s.g);
    }
    if (wet || !hs.length) continue;
    const hi = Math.max(...hs), lo = Math.min(...hs), mean = hs.reduce((a, b) => a + b, 0) / hs.length;
    const cost = (p.fit === "plinth" ? (hi - lo) * 3 + (hi - mean) * 2 : (hi - lo) * 2) + Math.hypot(dx, dz) * 0.3;
    o.y = (p.fit === "plinth" ? hi : Math.round(mean)) + 1;
    if (!best || cost < best.cost) best = { origin: o, cost };
  }
  return best;
}

/** Exact ground below (x,z) at or under y (live read): highest solid non-plant block. */
async function groundAt(x: number, z: number, from: number) {
  const ys = Array.from({ length: 30 }, (_, i) => from - i);
  const r = await call("/blocks", { positions: ys.map((y) => ({ x, y, z })) });
  const b = r.blocks.find((q: any) => q.solid && !/leaves|_log$|grass$|fern|flower|bush|sapling/.test(q.id));
  return b ? b.pos.y : from - 30;
}

function boxesOf(op: B.Op): [number, number, number, number, number, number][] {
  const a = op.from, b = op.to ?? op.from;
  const lo = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], hi = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
  if (op.kind !== "walls") return [[lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]]];
  return [[lo[0], lo[1], lo[2], hi[0], hi[1], lo[2]], [lo[0], lo[1], hi[2], hi[0], hi[1], hi[2]],
    [lo[0], lo[1], lo[2], lo[0], hi[1], hi[2]], [hi[0], lo[1], lo[2], hi[0], hi[1], hi[2]]];
}

async function paste(p: Planned, origin: B.Vec) {
  const place = { origin, facing: p.facing };
  const turns = B.turnsFor(p.facing);
  const fp = B.footprint(p.bp, place);
  await cmd(`/tp @s ${Math.round((fp.from.x + fp.to.x) / 2)} ${origin.y + p.bp.size.h + 4} ${fp.to.z + 12}`);
  await new Promise((r) => setTimeout(r, 1500)); // let chunks load
  // Clear the building volume (trees, terrain bumps) from the floor level up.
  await cmd(`/fill ${fp.from.x} ${origin.y} ${fp.from.z} ${fp.to.x} ${origin.y + p.bp.size.h} ${fp.to.z} minecraft:air`);
  // Foundations: stone bricks under the walls, packed dirt under the floor, down to the real ground of each column.
  const wallsLo = p.fit === "terrace" ? { x: 0, z: 0 } : { x: 1, z: 1 }, wallsHi = p.fit === "terrace" ? { x: p.bp.size.w - 1, z: p.bp.size.d - 1 } : { x: p.bp.size.w - 2, z: p.bp.size.d - 2 };
  for (let lx = wallsLo.x; lx <= wallsHi.x; lx++) for (let lz = wallsLo.z; lz <= wallsHi.z; lz++) {
    const [rx, rz] = B.rotateXZ(lx, lz, turns);
    const x = origin.x + rx, z = origin.z + rz;
    const g = await groundAt(x, z, origin.y - 1);
    if (g >= origin.y - 1) continue;
    const edge = lx === wallsLo.x || lx === wallsHi.x || lz === wallsLo.z || lz === wallsHi.z;
    await cmd(`/fill ${x} ${g + 1} ${z} ${x} ${origin.y - 1} ${z} ${edge ? "minecraft:stone_bricks" : "minecraft:dirt"}`);
  }
  for (const st of p.bp.stages) for (const op of st.ops) {
    const raw = B.resolveBlock(p.bp, op.block);
    const { id, props } = B.parseBlock(raw);
    const block = B.formatBlock(id, B.rotateProps(props, turns));
    for (const [ax, ay, az, bx, by, bz] of boxesOf(op)) {
      const [r1x, r1z] = B.rotateXZ(ax, az, turns), [r2x, r2z] = B.rotateXZ(bx, bz, turns);
      // Doors and beds need both halves; setblock each half explicitly is what the blueprint already does.
      await cmd(`/fill ${origin.x + Math.min(r1x, r2x)} ${origin.y + ay} ${origin.z + Math.min(r1z, r2z)} ${origin.x + Math.max(r1x, r2x)} ${origin.y + by} ${origin.z + Math.max(r1z, r2z)} ${block}`);
    }
  }
  taken.push(fp);
  return fp;
}

const out: Record<string, unknown> = {};
for (const p of settlement()) {
  const s = site(p);
  if (!s) { console.log(`${p.bp.id}: no dry site within ${p.zone.r} of ${p.zone.x},${p.zone.z}`); continue; }
  if (only && !only.includes(p.bp.id)) { taken.push(B.footprint(p.bp, { origin: s.origin, facing: p.facing })); continue; }
  const fp = await paste(p, s.origin);
  out[p.bp.id] = { origin: s.origin, facing: p.facing, footprint: fp, cost: Math.round(s.cost * 10) / 10 };
  console.log(`${p.bp.id}: origin ${s.origin.x},${s.origin.y},${s.origin.z} facing ${p.facing}, cost ${s.cost.toFixed(1)}`);
}
fs.writeFileSync(path.join(root, "plans", "medieval", "preview-sites.json"), JSON.stringify(out, null, 1));
console.log(`${dry ? "(dry run) " : ""}${cmds} commands`);
