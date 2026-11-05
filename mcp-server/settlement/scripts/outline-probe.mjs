import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const inst = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS");
const conn = JSON.parse(fs.readFileSync(path.join(inst, "mcbridge", "connection.json"), "utf8"));
const call = (route, body) => fetch(`http://${conn.host}:${conn.port}${route}`, { method: "POST", headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const signs = JSON.parse(fs.readFileSync("plans/medieval/preview/signs.json", "utf8"));
const NATURAL = /^minecraft:(grass_block|dirt|stone|granite|diorite|andesite|sand|clay|water|air|short_grass|tall_grass|fern|large_fern|dandelion|poppy|azure_bluet|oxeye_daisy|cornflower|blue_orchid|allium|lily_of_the_valley|red_tulip|orange_tulip|white_tulip|pink_tulip|oak_leaves|birch_leaves|acacia_leaves|oak_log|birch_log|acacia_log|tuff|deepslate|coal_ore|iron_ore|copper_ore|seagrass|tall_seagrass|kelp|kelp_plant|sugar_cane|pumpkin|lava)$|sign|create:(zinc_ore|scoria|limestone|asurine|crimsite|ochrum|veridium)/;
const counts = {};
for (const s of signs) {
  await call("/chat", { message: `/tp @s ${s.pos.x} 90 ${s.pos.z}` }); await sleep(1200);
  const tally = {};
  for (let dx = -24; dx <= 24; dx++) {
    const pos = []; for (let dz = -24; dz <= 24; dz++) for (let y = s.pos.y - 3; y <= s.pos.y + 2; y++) pos.push({ x: s.pos.x + dx, y, z: s.pos.z + dz });
    for (let i = 0; i < pos.length; i += 64) {
      const r = await call("/blocks", { positions: pos.slice(i, i + 64) });
      for (const b of r.blocks) if (!NATURAL.test(b.id)) (tally[b.id] ??= []).push([b.pos.x, b.pos.y, b.pos.z]);
    }
  }
  counts[s.text] = Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, { n: v.length, minX: Math.min(...v.map((p) => p[0])), maxX: Math.max(...v.map((p) => p[0])), minZ: Math.min(...v.map((p) => p[2])), maxZ: Math.max(...v.map((p) => p[2])), ys: [...new Set(v.map((p) => p[1]))].join("/") }]));
  fs.writeFileSync(`plans/medieval/preview/outline-${s.text.replace(/\W+/g, "_")}.json`, JSON.stringify(tally));
}
console.log(JSON.stringify(counts, null, 1));
