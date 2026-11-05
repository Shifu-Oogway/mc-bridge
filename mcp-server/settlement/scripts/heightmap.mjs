// Survey ground height over an area through the bridge (read-only, local; no game actions).
//   node settlement/scripts/heightmap.mjs x1 z1 x2 z2 [step=1] [yTop=110] [yBottom=50]
// Ground = highest block that is solid and not leaves/logs/plants. Water surfaces are recorded separately.
// Writes plans/medieval/terrain.json {x1,z1,x2,z2,step,h:[[...]],water:[[...]],top:[[id]]} and prints a coarse map.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const [x1, z1, x2, z2, step = 1, yTop = 110, yBot = 50] = process.argv.slice(2).map(Number);
const inst = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS");
const conn = JSON.parse(fs.readFileSync(path.join(inst, "mcbridge", "connection.json"), "utf8"));
const call = (route, body) => fetch(`http://${conn.host}:${conn.port}${route}`, {
  method: "POST", headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
}).then((r) => r.json());
const SOFT = /leaves|_log$|_wood$|short_grass|tall_grass|fern|flower|poppy|dandelion|tulip|daisy|bluet|orchid|allium|cornflower|lily|bush|sapling|vine|snow$|sugar_cane|kelp|seagrass|mushroom|pumpkin|melon|bamboo/;

const h = [], water = [], top = [];
for (let z = z1; z <= z2; z += step) {
  const hr = [], wr = [], tr = [];
  for (let x = x1; x <= x2; x += step) {
    let ground = null, wtop = null, id = null;
    // Scan down in chunks of 64 until ground is found.
    for (let y0 = yTop; y0 > yBot && ground === null; y0 -= 64) {
      const ys = []; for (let y = y0; y > Math.max(yBot, y0 - 64); y--) ys.push(y);
      const r = await call("/blocks", { positions: ys.map((y) => ({ x, y, z })) });
      for (const b of r.blocks) {
        if (b.loaded === false) { ground = -1; break; }
        if (b.fluid === "minecraft:water" && wtop === null) wtop = b.pos.y;
        if (b.solid && !SOFT.test(b.id)) { ground = b.pos.y; id = b.id.replace("minecraft:", ""); break; }
      }
    }
    hr.push(ground); wr.push(wtop); tr.push(id);
  }
  h.push(hr); water.push(wr); top.push(tr);
}
fs.writeFileSync(path.join(root, "plans", "medieval", "terrain.json"), JSON.stringify({ x1, z1, x2, z2, step, h, water, top }));
// Coarse map: one char per cell (sampled every 4 rows/cols of the grid): water ~, else height digit relative to min.
const all = h.flat().filter((v) => v !== null && v >= 0);
const lo = Math.min(...all), hi = Math.max(...all);
console.log(`ground ${lo}..${hi}; map rows = z (north first), cols = x (west first), every ${4 * step} blocks; ~ water, digits = (h-${lo})/2, + = >18 above`);
for (let r = 0; r < h.length; r += 4) {
  let line = "";
  for (let c = 0; c < h[r].length; c += 4) {
    const w = water[r][c], g = h[r][c];
    if (g === null || g < 0) line += "?";
    else if (w !== null && w > g) line += "~";
    else { const v = Math.floor((g - lo) / 2); line += v > 9 ? "+" : String(v); }
  }
  console.log(`${String(z1 + r * step).padStart(4)} ${line}`);
}
