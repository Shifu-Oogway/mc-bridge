// Warehouse sorting v3: the shuttle stops at five stationary interfaces along the indoor track (x346, y74, facing down).
// Each has a brass funnel (345,74,z) extracting only its category from the cart into a hopper -> barrel (345,72,z).
// Order from the south (arrival): wood 651, stone 649, ore 647, farm 645, misc 643 (unfiltered, takes the rest).
//   node settlement/scripts/sorter2.mjs [--filters]
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const inst = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS");
const conn = JSON.parse(fs.readFileSync(path.join(inst, "mcbridge", "connection.json"), "utf8"));
const call = (r, b) => fetch(`http://${conn.host}:${conn.port}${r}`, { method: "POST", headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((x) => x.json());
const say = async (c) => { const r = await call("/chat", { message: c }); await new Promise((s) => setTimeout(s, 220)); const t = (r.messages || []).map((m) => m.text).join(" "); if (/Unknown|Expected|Invalid|Could not/.test(t)) console.log("!!", c.slice(0, 90), t); };
const CATS = {
  wood: ["oak_log", "spruce_log", "birch_log", "dark_oak_log", "acacia_log", "stripped_oak_log", "stripped_spruce_log", "stripped_birch_log", "stripped_dark_oak_log", "stripped_acacia_log", "oak_planks", "spruce_planks", "birch_planks", "dark_oak_planks", "acacia_planks", "stick", "farmersdelight:tree_bark"],
  stone: ["cobblestone", "stone", "gravel", "sand", "red_sand", "andesite", "diorite", "granite", "tuff", "cobbled_deepslate", "deepslate", "flint", "dirt", "calcite"],
  ore: ["raw_iron", "raw_copper", "raw_gold", "create:raw_zinc", "iron_ingot", "copper_ingot", "gold_ingot", "create:zinc_ingot", "create:crushed_raw_iron", "create:crushed_raw_copper", "create:crushed_raw_gold", "create:crushed_raw_zinc", "coal", "iron_nugget", "gold_nugget", "create:experience_nugget", "lapis_lazuli", "redstone"],
  farm: ["wheat", "wheat_seeds", "create:wheat_flour", "create:dough", "bread", "hay_block", "carrot", "potato", "beetroot"],
};
const id = (s) => (s.includes(":") ? s : "minecraft:" + s);
async function setFilter(x, y, z, list) {
  await say(`/data modify block ${x} ${y} ${z} Filter set value {id:"create:filter",count:1,components:{"create:filter_items":[]}}`);
  for (let i = 0; i < list.length; i++) await say(`/data modify block ${x} ${y} ${z} Filter.components."create:filter_items" append value {item:{id:"${id(list[i])}",count:1},slot:${i}}`);
}
const STOPS = [[651, "wood"], [649, "stone"], [647, "ore"], [645, "farm"], [643, null]];
const FILTERS_ONLY = process.argv.includes("--filters");
await say("/tp @s 343 72 647");
if (!FILTERS_ONLY) {
  // remove the belt sorter (v2)
  await say("/fill 338 73 644 345 76 646 minecraft:air");
  await say("/fill 345 70 641 345 70 652 minecraft:spruce_planks");
  for (const [z, cat] of STOPS) {
    await say(`/setblock 346 74 ${z} create:portable_storage_interface[facing=down]`);
    await say(`/setblock 345 71 ${z} minecraft:dark_oak_planks`); await say(`/setblock 345 72 ${z} minecraft:barrel[facing=west]`);
    await say(`/setblock 345 73 ${z} minecraft:hopper[facing=down]`);
    await say(`/setblock 345 74 ${z} ${cat ? "create:brass_funnel" : "create:andesite_funnel"}[facing=west,extracting=true]`);
  }
  await say("/fill 345 75 642 345 75 652 minecraft:dark_oak_log[axis=z]"); // beam the interfaces hang from
  await say("/fill 346 75 642 346 75 652 minecraft:dark_oak_log[axis=z]");
}
for (const [z, cat] of STOPS) if (cat) { await setFilter(345, 74, z, CATS[cat]); await say(`/data merge block 345 74 ${z} {FilterAmount:64}`); }
console.log("sorter v3 ready");
