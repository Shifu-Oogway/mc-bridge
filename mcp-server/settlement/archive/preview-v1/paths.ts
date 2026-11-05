// Lay footpaths on the real ground between building doors (creative preview). Reads preview-sites.json.
//   node settlement/scripts/paths.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as B from "../src/blueprint.ts";
import { settlement } from "../src/design.ts";
import { openWorld } from "../src/world.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const inst = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS");
const w = openWorld(inst);
if (!w || w.gameType !== 1 || !w.allowCommands) throw new Error("refusing: not a creative world with cheats");
const conn = JSON.parse(fs.readFileSync(path.join(inst, "mcbridge", "connection.json"), "utf8"));
const call = (route: string, body?: unknown) => fetch(`http://${conn.host}:${conn.port}${route}`, {
  method: "POST", headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
}).then((r) => r.json());
const cmd = (c: string) => call("/chat", { message: c });
const sites = JSON.parse(fs.readFileSync(path.join(root, "plans", "medieval", "preview-sites.json"), "utf8"));

// Door approach point of each building: the cell in front of its step (or gate), in world coordinates.
const doors: Record<string, B.Vec> = {};
for (const p of settlement()) {
  const s = sites[p.bp.id]; if (!s) continue;
  const turns = B.turnsFor(p.facing);
  const local = p.bp.id === "starter-workshop" ? [5, 9] : p.bp.id === "wheat-field" ? [6, 11] : p.bp.id === "cane-bed" ? [4, 4]
    : [Math.round((1 + (p.bp.size.w - 2)) / 2), p.bp.size.d];
  const [rx, rz] = B.rotateXZ(local[0], local[1], turns);
  doors[p.bp.id] = { x: s.origin.x + rx, y: s.origin.y, z: s.origin.z + rz };
}

const SOFT = /leaves|_log$|short_grass|tall_grass|fern|flower|poppy|dandelion|tulip|daisy|bluet|orchid|allium|cornflower|bush|sapling/;
async function ground(x: number, z: number) {
  const ys = Array.from({ length: 40 }, (_, i) => 95 - i);
  const r = await call("/blocks", { positions: ys.map((y) => ({ x, y, z })) });
  const b = r.blocks.find((q: any) => q.solid && !SOFT.test(q.id));
  return b ? { y: b.pos.y, id: b.id } : null;
}

const done = new Set<string>();
async function lay(a: B.Vec, b: B.Vec) {
  // L-shaped route, x first then z; 2 wide; dirt_path on soil, stone bricks elsewhere; steps where the ground jumps.
  const cells: { x: number; z: number }[] = [];
  let { x, z } = a;
  cells.push({ x, z });
  while (x !== b.x) { x += Math.sign(b.x - x); cells.push({ x, z }); }
  while (z !== b.z) { z += Math.sign(b.z - z); cells.push({ x, z }); }
  let prev: number | null = null, n = 0;
  for (const c of cells) {
    for (const [ox, oz] of [[0, 0], [1, 0], [0, 1]]) {
      const k = `${c.x + ox},${c.z + oz}`; if (done.has(k)) continue; done.add(k);
      const g = await ground(c.x + ox, c.z + oz); if (!g) continue;
      if (/stone_bricks|planks|cobblestone|polished_diorite|_log|farmland|bricks/.test(g.id)) continue; // never pave over builds
      await cmd(`/setblock ${c.x + ox} ${g.y} ${c.z + oz} ${/grass_block|dirt|podzol|coarse/.test(g.id) ? "minecraft:dirt_path" : "minecraft:stone_bricks"}`);
      await cmd(`/fill ${c.x + ox} ${g.y + 1} ${c.z + oz} ${c.x + ox} ${g.y + 2} ${c.z + oz} minecraft:air replace minecraft:short_grass`);
      if (ox === 0 && oz === 0 && prev !== null && Math.abs(g.y - prev) >= 2) {
        // Steep: a cobblestone step on the lower side.
        await cmd(`/setblock ${c.x} ${Math.min(g.y, prev) + 1} ${c.z} minecraft:cobblestone`);
      }
      if (ox === 0 && oz === 0) prev = g.y;
    }
    if (++n % 10 === 0) {
      const g = await ground(c.x - 1, c.z - 1);
      if (g && !/bricks|planks|_log/.test(g.id)) await cmd(`/fill ${c.x - 1} ${g.y + 1} ${c.z - 1} ${c.x - 1} ${g.y + 2} ${c.z - 1} minecraft:oak_fence`), await cmd(`/setblock ${c.x - 1} ${g.y + 3} ${c.z - 1} minecraft:lantern`);
    }
  }
}

const hub = doors["starter-workshop"];
for (const [id, d] of Object.entries(doors)) {
  if (id === "starter-workshop") continue;
  await cmd(`/tp @s ${Math.round((d.x + hub.x) / 2)} ${d.y + 25} ${Math.round((d.z + hub.z) / 2)}`);
  await new Promise((r) => setTimeout(r, 1200));
  await lay(hub, d);
  console.log(`path workshop -> ${id} (${d.x},${d.z})`);
}
// Manor drive passes through the gatehouse: gate -> manor door.
if (doors.gatehouse && doors.manor) await lay(doors.gatehouse, doors.manor);
await cmd(`/tp @s ${hub.x} ${hub.y + 20} ${hub.z + 10}`);
console.log("paths done");
