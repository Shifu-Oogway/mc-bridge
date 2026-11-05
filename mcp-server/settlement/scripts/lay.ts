// Lay a path or a rail line on the real ground through waypoints (creative preview).
//   node settlement/scripts/lay.ts path|rail <width> x,z x,z [x,z ...]
// Path: dirt_path on soil, stone bricks on anything else; never over built blocks. Rail: rails on the ground,
// with a stone-brick bed where the ground falls away. Steps of >1 get a cobblestone step for paths.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openWorld } from "../src/world.ts";

const [mode, widthS, ...pts] = process.argv.slice(2);
const width = Number(widthS);
const inst = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS");
const w = openWorld(inst);
if (!w || w.gameType !== 1 || !w.allowCommands) throw new Error("refusing: not a creative world with cheats");
const conn = JSON.parse(fs.readFileSync(path.join(inst, "mcbridge", "connection.json"), "utf8"));
const call = (route: string, body?: unknown) => fetch(`http://${conn.host}:${conn.port}${route}`, {
  method: "POST", headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
}).then((r) => r.json());
const cmd = (c: string) => call("/chat", { message: c });
const SOFT = /leaves|_log$|short_grass|tall_grass|fern|flower|poppy|dandelion|tulip|daisy|bluet|orchid|allium|cornflower|bush|sapling|snow$/;
const BUILT = /stone_brick|planks|cobblestone|polished|bricks|_log|farmland|copper|deepslate|casing|slab|stairs|fence|rail/;
async function ground(x: number, z: number) {
  const ys = Array.from({ length: 60 }, (_, i) => 100 - i);
  const r = await call("/blocks", { positions: ys.map((y) => ({ x, y, z })) });
  const b = r.blocks.find((q: any) => (q.solid && !SOFT.test(q.id)) || q.fluid);
  return b ? { y: b.pos.y as number, id: b.id as string } : null;
}
const P = pts.map((s) => s.split(",").map(Number));
const cells: [number, number][] = [];
for (let i = 1; i < P.length; i++) {
  let [x, z] = P[i - 1]; const [tx, tz] = P[i];
  if (i === 1) cells.push([x, z]);
  while (x !== tx || z !== tz) { if (x !== tx) x += Math.sign(tx - x); else z += Math.sign(tz - z); cells.push([x, z]); }
}
await cmd(`/tp @s ${P[0][0]} 100 ${P[0][1]}`); await new Promise((r) => setTimeout(r, 1200));
let prev: number | null = null, laid = 0, skipped = 0;
for (let i = 0; i < cells.length; i++) {
  const [x, z] = cells[i];
  const dir = i + 1 < cells.length ? [cells[i + 1][0] - x, cells[i + 1][1] - z] : i > 0 ? [x - cells[i - 1][0], z - cells[i - 1][1]] : [1, 0];
  const side = [-dir[1], dir[0]];
  for (let k = 0; k < width; k++) {
    const cx = x + side[0] * (k - Math.floor((width - 1) / 2)), cz = z + side[1] * (k - Math.floor((width - 1) / 2));
    const g = await ground(cx, cz); if (!g) continue;
    if (BUILT.test(g.id)) { skipped++; continue; }
    if (mode === "rail") {
      const y = prev !== null && g.y < prev - 1 ? prev - 1 : g.y;
      if (y > g.y) await cmd(`/fill ${cx} ${g.y + 1} ${cz} ${cx} ${y} ${cz} minecraft:stone_bricks`);
      await cmd(`/setblock ${cx} ${y + 1} ${cz} minecraft:rail`);
      if (k === 0) prev = y;
    } else {
      await cmd(`/setblock ${cx} ${g.y} ${cz} ${/grass_block|dirt|podzol|coarse|mud/.test(g.id) ? "minecraft:dirt_path" : "minecraft:stone_bricks"}`);
      await cmd(`/fill ${cx} ${g.y + 1} ${cz} ${cx} ${g.y + 2} ${cz} minecraft:air replace minecraft:short_grass`);
      if (k === 0 && prev !== null && Math.abs(g.y - prev) >= 2) await cmd(`/setblock ${cx} ${Math.min(g.y, prev) + 1} ${cz} minecraft:cobblestone`);
      if (k === 0) prev = g.y;
    }
    laid++;
  }
  if (mode === "path" && i > 0 && i % 12 === 0) {
    const lx = x + side[0] * (Math.floor(width / 2) + 1), lz = z + side[1] * (Math.floor(width / 2) + 1);
    const g = await ground(lx, lz);
    if (g && !BUILT.test(g.id)) { await cmd(`/fill ${lx} ${g.y + 1} ${lz} ${lx} ${g.y + 2} ${lz} minecraft:oak_fence`); await cmd(`/setblock ${lx} ${g.y + 3} ${lz} minecraft:lantern`); }
  }
}
console.log(`${mode}: ${cells.length} cells along the route, ${laid} laid, ${skipped} skipped (built blocks)`);
