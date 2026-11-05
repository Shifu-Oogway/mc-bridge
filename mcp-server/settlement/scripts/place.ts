// Place ONE designed building in a creative preview world, fitted to the real terrain, then verify it block by block.
//   node settlement/scripts/place.ts <design> <x> <z> <facing> [--y Y] [--verify-only]
// design: manor | workshop | smeltery | warehouse | watermill | sawmill | barn | gatehouse | pithead | machineHall | square
// Refuses unless the open world is creative with cheats. Records placements in plans/medieval/preview/placements.json.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as B from "../src/blueprint.ts";
import { openWorld } from "../src/world.ts";
import { manor } from "../designs/manor.ts";
import { TOWN } from "../designs/town.ts";
import * as MW from "../designs/manor-workshop.ts";
import * as WM from "../designs/watermill.ts";
import * as FD from "../designs/foundry.ts";
import * as WH from "../designs/warehouse.ts";
import * as SM from "../designs/sawmill.ts";
import * as QY from "../designs/quarry.ts";
import * as GB from "../designs/grainbarn.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const [key, xs, zs, facing] = process.argv.slice(2) as [string, string, string, B.Facing];
const yArg = process.argv.indexOf("--y");
const verifyOnly = process.argv.includes("--verify-only");
const clearAbove = process.argv.includes("--keep-ground") ? 1 : 0; // keep the ground layer outside the building
const inst = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS");
const w = openWorld(inst);
if (!w || w.gameType !== 1 || !w.allowCommands) throw new Error(`refusing: open world ${w?.folder} is not creative with cheats`);
const conn = JSON.parse(fs.readFileSync(path.join(inst, "mcbridge", "connection.json"), "utf8"));
const call = (route: string, body?: unknown) => fetch(`http://${conn.host}:${conn.port}${route}`, {
  method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" },
  body: body ? JSON.stringify(body) : undefined,
}).then((r) => r.json());
let ncmd = 0;
const cmd = async (c: string) => { if (c.length > 256) throw new Error(`command too long: ${c.slice(0, 80)}`); ncmd++; const r = await call("/chat", { message: c }); if (r?.error) console.error("cmd error:", c, r.error); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function design(k: string): B.Blueprint {
  if (k === "manor") return manor;
  if (k === "manorWorkshop") return MW.blueprint();
  if (k === "watermillV2") return WM.blueprint();
  if (k === "foundryV2") return FD.blueprint();
  if (k === "warehouse") return WH.blueprint();
  if (k === "sawmill") return SM.blueprint();
  if (k === "quarry") return QY.blueprint();
  if (k === "grainbarn") return GB.blueprint();
  if (k === "workshop") {
    const bp = JSON.parse(fs.readFileSync(path.join(root, "settlement", "blueprints", "starter-workshop.json"), "utf8")) as B.Blueprint;
    bp.palette = { ...bp.palette, T: "minecraft:oak_planks", K: "minecraft:oak_planks", I: "minecraft:polished_diorite" };
    return bp;
  }
  const f = (TOWN as Record<string, () => B.Blueprint>)[k];
  if (!f) throw new Error(`unknown design ${k}`);
  return f();
}
const bp = design(key);
const turns = B.turnsFor(facing);
const base = { x: Number(xs), y: 0, z: Number(zs) };
const SOFT = /leaves|_log$|_wood$|short_grass|tall_grass|fern|flower|poppy|dandelion|tulip|daisy|bluet|orchid|allium|cornflower|lily|bush|sapling|vine|snow$|sugar_cane|mushroom|pumpkin|melon|bamboo/;
async function ground(x: number, z: number, from = 110) {
  for (let top = from; top > 30; top -= 64) {
    const ys = Array.from({ length: 64 }, (_, i) => top - i);
    const r = await call("/blocks", { positions: ys.map((y) => ({ x, y, z })) });
    const b = r.blocks.find((q: any) => (q.solid && !SOFT.test(q.id)) || q.fluid);
    if (b) return { y: b.pos.y, wet: Boolean(b.fluid) };
  }
  return { y: 30, wet: false };
}

// Cells of the lowest layer that are solid: the building stands on these.
const cells0 = B.expand(bp, { origin: { x: 0, y: 0, z: 0 }, facing: "south" });
const footCells = cells0.filter((c) => c.pos.y === 0 && !/:air$/.test(c.id));
const toWorld = (lx: number, lz: number) => { const [rx, rz] = B.rotateXZ(lx, lz, turns); return { x: base.x + rx, z: base.z + rz }; };

const grounds = new Map<string, { y: number; wet: boolean }>();
await cmd(`/tp @s ${base.x} 110 ${base.z}`); await sleep(1500);
for (const c of footCells) { const p = toWorld(c.pos.x, c.pos.z); grounds.set(`${c.pos.x},${c.pos.z}`, await ground(p.x, p.z)); }
const dryMax = Math.max(...[...grounds.values()].filter((g) => !g.wet).map((g) => g.y));
// Re-placing a building must not measure its own earlier blocks as "ground": reuse the recorded height.
const placementsFile = path.join(root, "plans", "medieval", "preview", "placements.json");
let prevY: number | undefined;
try { const prev = JSON.parse(fs.readFileSync(placementsFile, "utf8"))[key]; if (prev && prev.world === `${w.folder}#${w.seed}`) prevY = prev.origin.y; } catch { /* none */ }
const origin = { x: base.x, y: yArg > 0 ? Number(process.argv[yArg + 1]) : prevY ?? dryMax + 1, z: base.z };
if (origin.y > dryMax + 4 && !process.argv.includes("--no-clear")) throw new Error(`refusing: floor y${origin.y} is far above the measured ground (max ${dryMax}); pass --y explicitly if intended`);
const fp = B.footprint(bp, { origin, facing });
console.log(`${bp.id}: ${bp.size.w}x${bp.size.d}x${bp.size.h}, origin ${origin.x},${origin.y},${origin.z} facing ${facing}; footprint x${fp.from.x}..${fp.to.x} z${fp.from.z}..${fp.to.z}; ground under footing ${Math.min(...[...grounds.values()].map((g) => g.y))}..${dryMax}`);
await cmd(`/tp @s ${Math.round((fp.from.x + fp.to.x) / 2)} ${origin.y + bp.size.h + 6} ${fp.to.z + 14}`); await sleep(1500);

const noClear = process.argv.includes("--no-clear");
if (!verifyOnly) {
  if (!noClear) {
  // 1. Clear the building volume (trees, terrain that rises into it).
  await cmd(`/fill ${fp.from.x} ${origin.y + clearAbove} ${fp.from.z} ${fp.to.x} ${origin.y + bp.size.h} ${fp.to.z} minecraft:air`);
  // 2. Foundations: under every footing cell, stone bricks (mossy at the bottom) down to the real ground or lake bed.
  for (const c of footCells) {
    const g = grounds.get(`${c.pos.x},${c.pos.z}`)!; const p = toWorld(c.pos.x, c.pos.z);
    if (g.y >= origin.y - 1) continue;
    await cmd(`/fill ${p.x} ${g.y} ${p.z} ${p.x} ${origin.y - 1} ${p.z} minecraft:stone_bricks`);
    await cmd(`/setblock ${p.x} ${g.y} ${p.z} minecraft:mossy_stone_bricks`);
  }
  }
  // 3. The building, stage by stage, op by op.
  for (const st of bp.stages) for (const op of st.ops) {
    const raw = B.resolveBlock(bp, op.block); const { id, props } = B.parseBlock(raw);
    const block = B.formatBlock(id, B.rotateProps(props, turns));
    const a = op.from, b2 = op.to ?? op.from;
    const lo = [Math.min(a[0], b2[0]), Math.min(a[1], b2[1]), Math.min(a[2], b2[2])], hi = [Math.max(a[0], b2[0]), Math.max(a[1], b2[1]), Math.max(a[2], b2[2])];
    const boxes = op.kind !== "walls" ? [[lo, hi]] : [[lo, [hi[0], hi[1], lo[2]]], [[lo[0], lo[1], hi[2]], hi], [lo, [lo[0], hi[1], hi[2]]], [[hi[0], lo[1], lo[2]], hi]];
    for (const [p, q] of boxes) {
      const A = toWorld(p[0], p[2]), C = toWorld(q[0], q[2]);
      await cmd(`/fill ${Math.min(A.x, C.x)} ${origin.y + p[1]} ${Math.min(A.z, C.z)} ${Math.max(A.x, C.x)} ${origin.y + q[1]} ${Math.max(A.z, C.z)} ${block}`);
    }
  }
}

// 4. Verify every planned block against the world.
await sleep(1000);
const cells = B.expand(bp, { origin, facing });
const obs: any[] = [];
for (let i = 0; i < cells.length; i += 64) obs.push(...(await call("/blocks", { positions: cells.slice(i, i + 64).map((c) => c.pos) })).blocks);
const sum = B.summarize(cells, obs);
const kinds: Record<string, number> = {};
for (const p of sum.problems) { const k = `${p.status}: want ${p.want.replace(/\[.*/, "")} have ${p.have}`; kinds[k] = (kinds[k] ?? 0) + 1; }
console.log(`verify: ${sum.counts.ok}/${sum.total} ok`, JSON.stringify(sum.counts));
for (const [k, n] of Object.entries(kinds).slice(0, 12)) console.log(`  ${n} × ${k}`);
console.log(`${ncmd} commands`);

const file = path.join(root, "plans", "medieval", "preview", "placements.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
let pl: Record<string, unknown> = {}; try { pl = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* new */ }
pl[key] = { world: `${w.folder}#${w.seed}`, origin, facing, footprint: fp, verify: sum.counts, at: new Date().toISOString() };
fs.writeFileSync(file, JSON.stringify(pl, null, 1));
