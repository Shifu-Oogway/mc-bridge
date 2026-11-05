// Warehouse brass-tunnel sorting hub (replaces the five-stop interface sorter).
// Main intake belt x344 y71 z652 -> z640 (north). Brass tunnels at z650/648/646/644 send one category each west onto a
// side belt (y71, x343 -> x339) that ends in a belt funnel into a chest at x338; the rest goes on to a misc chest at
// z639. Side-belt end pulleys share one shaft line along x339; a gearbox at (339,71,652) also drives the main belt.
// Shuttle unload: one stop at (346,74,651) -> funnel -> hoppers -> drops onto the main belt at z651.
//   node settlement/scripts/hub.mjs build     (blocks)   then link belts in game, then
//   node settlement/scripts/hub.mjs tunnels   (tunnels + filters)
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const inst = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS");
const conn = JSON.parse(fs.readFileSync(path.join(inst, "mcbridge", "connection.json"), "utf8"));
const call = (r, b) => fetch(`http://${conn.host}:${conn.port}${r}`, { method: "POST", headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((x) => x.json());
const say = async (c) => { const r = await call("/chat", { message: c }); await new Promise((s) => setTimeout(s, 220)); const t = (r.messages || []).map((m) => m.text).join(" "); if (/Unknown|Expected|Invalid|Could not/.test(t)) console.log("!!", c.slice(0, 100), t); };
export const CATS = {
  wood: ["oak_log", "spruce_log", "birch_log", "dark_oak_log", "acacia_log", "stripped_oak_log", "stripped_spruce_log", "stripped_birch_log", "stripped_dark_oak_log", "stripped_acacia_log", "oak_planks", "spruce_planks", "birch_planks", "dark_oak_planks", "acacia_planks", "stick", "farmersdelight:tree_bark"],
  stone: ["cobblestone", "stone", "gravel", "sand", "red_sand", "andesite", "diorite", "granite", "tuff", "cobbled_deepslate", "deepslate", "flint", "dirt", "calcite"],
  ore: ["raw_iron", "raw_copper", "raw_gold", "create:raw_zinc", "iron_ingot", "copper_ingot", "gold_ingot", "create:zinc_ingot", "create:crushed_raw_iron", "create:crushed_raw_copper", "create:crushed_raw_gold", "create:crushed_raw_zinc", "coal", "iron_nugget", "gold_nugget", "create:experience_nugget", "lapis_lazuli", "redstone"],
  farm: ["wheat", "wheat_seeds", "create:wheat_flour", "create:dough", "bread", "hay_block", "carrot", "potato", "beetroot"],
};
export const ROWS = [[650, "wood"], [648, "stone"], [646, "ore"], [644, "farm"]];
const id = (s) => (s.includes(":") ? s : "minecraft:" + s);
const mode = process.argv[2];
await say("/tp @s 341 72 655");

if (mode === "build") {
  // clear racks / old sorter between the west wall barrels and the track
  await say("/fill 337 71 639 345 76 652 minecraft:air");
  await say("/fill 337 70 639 345 70 652 minecraft:spruce_planks");
  for (const z of [649, 647, 645, 643]) { await say(`/setblock 346 74 ${z} minecraft:air`); }
  // shuttle unload stop at z651 (interface already at 346,74,651)
  await say("/setblock 346 74 651 create:portable_storage_interface[facing=down]");
  await say("/setblock 345 74 651 create:andesite_funnel[facing=west,extracting=true]");
  await say("/setblock 345 73 651 minecraft:hopper[facing=down]"); await say("/setblock 345 72 651 minecraft:hopper[facing=west]");
  await say("/setblock 344 72 651 minecraft:hopper[facing=down]");
  // main belt pulleys + drive
  await say("/setblock 344 71 652 create:shaft[axis=x]"); await say("/setblock 344 71 640 create:shaft[axis=x]");
  await say("/fill 340 71 652 343 71 652 create:shaft[axis=x]"); await say("/setblock 339 71 652 create:gearbox[axis=y]");
  await say("/setblock 338 71 652 create:creative_motor[facing=east]"); // TEMP drive for the preview
  // side belts: pulleys at x343 and x339 (axis z); shaft line along x339 links the west pulleys
  for (let z = 651; z >= 640; z--) await say(`/setblock 339 71 ${z} create:shaft[axis=z]`);
  for (const [z] of ROWS) {
    await say(`/setblock 343 71 ${z} create:shaft[axis=z]`);
    await say(`/setblock 338 71 ${z} minecraft:dark_oak_planks`); await say(`/setblock 338 72 ${z} minecraft:chest[facing=east]`);
  }
  // misc chest at the main belt's north end
  await say("/setblock 344 71 639 minecraft:dark_oak_planks"); await say("/setblock 344 72 639 minecraft:chest[facing=south]");
  console.log("hub blocks placed: link main belt 344,71,652->640 and side belts 343->339 at z", ROWS.map((r) => r[0]).join(","));
}

if (mode === "tunnels") {
  // belt funnels on the belt ends (facing away from the chest, like the crusher feed)
  await say("/setblock 344 72 640 create:andesite_belt_funnel[facing=south,shape=retracted]");
  for (const [z] of ROWS) await say(`/setblock 339 72 ${z} create:andesite_belt_funnel[facing=east,shape=retracted]`);
  for (const [z, cat] of ROWS) {
    await say(`/setblock 344 72 ${z} create:brass_tunnel`);
    await new Promise((s) => setTimeout(s, 400));
    // Side 4 = west (whitelist: this category), Side 2 = north / straight on (blacklist: this category)
    await say(`/data modify block 344 72 ${z} Filters set value []`);
    for (const [side, black] of [[4, 0], [2, 1]]) {
      await say(`/data modify block 344 72 ${z} Filters append value {Side:${side},FilterAmount:64,UpTo:1b,Filter:{id:"create:filter",count:1,components:{"create:filter_items_blacklist":${black}b,"create:filter_items":[]}}}`);
      const idx = side === 4 ? 0 : 1;
      for (let i = 0; i < CATS[cat].length; i++) await say(`/data modify block 344 72 ${z} Filters[${idx}].Filter.components."create:filter_items" append value {item:{id:"${id(CATS[cat][i])}",count:1},slot:${i}}`);
    }
  }
  console.log("tunnels + filters set");
}
