// Warehouse sorter: unload funnel -> belt along x348 (y74, z644..651) -> brass funnels (y75) into category barrels (y76).
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const inst = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS");
const conn = JSON.parse(fs.readFileSync(path.join(inst, "mcbridge", "connection.json"), "utf8"));
const call = (r, b) => fetch(`http://${conn.host}:${conn.port}${r}`, { method: "POST", headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((x) => x.json());
const say = async (c) => { const r = await call("/chat", { message: c }); await new Promise((s) => setTimeout(s, 250)); const t = (r.messages || []).map((m) => m.text).join(" "); if (/Unknown|Expected|Invalid|Could not/.test(t)) console.log("!!", c.slice(0, 90), t); };
export const CATS = {
  wood: ["oak_log", "spruce_log", "birch_log", "dark_oak_log", "acacia_log", "stripped_oak_log", "stripped_spruce_log", "stripped_birch_log", "stripped_dark_oak_log", "stripped_acacia_log", "oak_planks", "spruce_planks", "birch_planks", "dark_oak_planks", "acacia_planks", "stick", "farmersdelight:tree_bark"],
  stone: ["cobblestone", "stone", "gravel", "sand", "red_sand", "andesite", "diorite", "granite", "tuff", "cobbled_deepslate", "deepslate", "flint", "dirt", "calcite"],
  ore: ["raw_iron", "raw_copper", "raw_gold", "create:raw_zinc", "iron_ingot", "copper_ingot", "gold_ingot", "create:zinc_ingot", "create:crushed_raw_iron", "create:crushed_raw_copper", "create:crushed_raw_gold", "create:crushed_raw_zinc", "coal", "iron_nugget", "gold_nugget", "create:experience_nugget", "lapis_lazuli", "redstone"],
  farm: ["wheat", "wheat_seeds", "create:wheat_flour", "create:dough", "bread", "hay_block", "carrot", "potato", "beetroot"],
};
const id = (s) => (s.includes(":") ? s : "minecraft:" + s);
const filter = (list) => `{id:"create:filter",count:1,components:{"create:filter_items_respect_nbt":0b,"create:filter_items_blacklist":0b,"create:filter_items":[${list.map((s, i) => `{item:{id:"${id(s)}",count:1},slot:${i}}`).join(",")}]}}`;
// Layout v2: stationary interface (346,74,645) facing down; a belt funnel on the west belt's east end pulls from it; the
// belt runs west along z645 at y73 over the cross aisle; brass funnels (y74) drop filtered items into barrels (y75).
// Filters are written item by item (a whole filter in one command is over the 256-character chat limit).
export async function setFilter(x, y, z, list) {
  await say(`/data modify block ${x} ${y} ${z} Filter set value {id:"create:filter",count:1,components:{"create:filter_items":[]}}`);
  for (let i = 0; i < list.length; i++) await say(`/data modify block ${x} ${y} ${z} Filter.components."create:filter_items" append value {item:{id:"${id(list[i])}",count:1},slot:${i}}`);
}
const BINS = [[344, "wood"], [343, "wood"], [342, "stone"], [341, "stone"], [340, "ore"], [339, "farm"], [338, null]];
await say("/tp @s 341 76 648");
const FILTERS_ONLY = process.argv.includes("--filters"); // re-running the full build breaks the linked belt
if (!FILTERS_ONLY) {
// remove v1 (x348 line)
await say("/fill 348 74 644 348 76 651 minecraft:air"); await say("/fill 349 74 651 350 74 651 minecraft:air"); await say("/fill 348 77 645 348 77 651 minecraft:air");
await say("/fill 347 74 644 348 74 644 minecraft:air"); await say("/setblock 346 74 644 minecraft:air");
await say("/setblock 346 74 645 create:portable_storage_interface[facing=down]");
await say("/setblock 345 73 645 create:shaft[axis=z]"); await say("/setblock 338 73 645 create:shaft[axis=z]");
await say("/setblock 338 73 644 create:creative_motor[facing=south]"); // TEMP drive (preview); south-facing makes the belt run west
await say("/fill 338 76 645 344 76 645 minecraft:dark_oak_log[axis=x]");
}
for (const [x, cat] of BINS) {
  if (!FILTERS_ONLY) await say(`/setblock ${x} 75 645 minecraft:barrel[facing=up]`);
  if (cat) { if (!FILTERS_ONLY) await say(`/setblock ${x} 74 645 create:brass_funnel[facing=down,extracting=false]`); await setFilter(x, 74, 645, CATS[cat]); }
  else if (!FILTERS_ONLY) await say(`/setblock ${x} 74 645 create:andesite_funnel[facing=down,extracting=false]`);
}
console.log("sorter v2 placed: link belt 345,73,645 -> 338,73,645, then put a belt funnel on 345,74,645 facing east");
