// Compare a placed design with the world: planned cells that changed, and new non-natural blocks inside the bounding box
// that the design does not plan (things the user added).  node settlement/scripts/diff-design.ts <key> <x> <z> [pad=2]
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import * as B from "../src/blueprint.ts";
const [key, xs, zs, padS] = process.argv.slice(2); const pad = Number(padS ?? 2);
const mods: Record<string, () => Promise<any>> = { quarry: () => import("../designs/quarry.ts"), sawmill: () => import("../designs/sawmill.ts"), warehouse: () => import("../designs/warehouse.ts"), foundryV2: () => import("../designs/foundry.ts") };
const bp: B.Blueprint = (await mods[key]()).blueprint();
const inst = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS");
const conn = JSON.parse(fs.readFileSync(path.join(inst, "mcbridge", "connection.json"), "utf8"));
const call = (r: string, b: unknown) => fetch(`http://${conn.host}:${conn.port}${r}`, { method: "POST", headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((x) => x.json());
const origin = { x: Number(xs), y: Number(bp.notes?.[0]?.match(/origin \S+?,(\-?\d+),/)?.[1] ?? 0), z: Number(zs) };
const cells = B.expand(bp, { origin, facing: "south" });
const want = new Map(cells.map((c) => [`${c.pos.x},${c.pos.y},${c.pos.z}`, c.id]));
const mn = { x: Math.min(...cells.map((c) => c.pos.x)) - pad, y: Math.min(...cells.map((c) => c.pos.y)), z: Math.min(...cells.map((c) => c.pos.z)) - pad };
const mx = { x: Math.max(...cells.map((c) => c.pos.x)) + pad, y: Math.max(...cells.map((c) => c.pos.y)) + 4, z: Math.max(...cells.map((c) => c.pos.z)) + pad };
await call("/chat", { message: `/tp @s ${(mn.x + mx.x) >> 1} ${mx.y} ${(mn.z + mx.z) >> 1}` }); await new Promise((r) => setTimeout(r, 2000));
const NATURAL = /^minecraft:(air|cave_air|grass_block|dirt|coarse_dirt|stone|granite|diorite|andesite|tuff|deepslate|gravel|sand|clay|water|lava|short_grass|tall_grass|fern|large_fern|bush|dandelion|poppy|azure_bluet|oxeye_daisy|cornflower|allium|.*_tulip|.*_leaves|oak_log|birch_log|acacia_log|spruce_log|dark_oak_log|coal_ore|iron_ore|copper_ore|podzol|moss_block|vine|firefly_bush|leaf_litter|wildflowers|short_dry_grass|tall_dry_grass)$|create:(.*_ore|scoria|limestone|asurine|crimsite|ochrum|veridium)/;
const changed: string[] = [], added: Record<string, string[]> = {};
const base = (b: string) => b.replace(/\[.*/, "");
for (let y = mn.y; y <= mx.y; y++) {
  const pos: { x: number; y: number; z: number }[] = [];
  for (let x = mn.x; x <= mx.x; x++) for (let z = mn.z; z <= mx.z; z++) pos.push({ x, y, z });
  for (let i = 0; i < pos.length; i += 64) for (const b of (await call("/blocks", { positions: pos.slice(i, i + 64) })).blocks) {
    const k = `${b.pos.x},${b.pos.y},${b.pos.z}`, w = want.get(k);
    if (w !== undefined) { if (base(w) !== b.id && !(base(w) === "minecraft:air" && /air$/.test(b.id))) changed.push(`${k} want ${base(w)} have ${b.id}`); }
    else if (!NATURAL.test(b.id)) (added[b.id] ??= []).push(k);
  }
}
console.log(`changed planned cells: ${changed.length}`); for (const c of changed) console.log("  " + c);
console.log("added blocks (not in the design):"); for (const [id, ps] of Object.entries(added)) console.log(`  ${id} ×${ps.length}: ${ps.slice(0, 40).join(" ")}`);
