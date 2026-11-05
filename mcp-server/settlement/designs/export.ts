// Export a design's expanded cells for the review page renderer: [x,y,z,colorIndex,shape] + a colour table.
import fs from "node:fs";
import * as B from "../src/blueprint.ts";

const COLORS: [RegExp, string][] = [
  [/waxed_cut_copper|copper/, "#b8693a"], [/deepslate_tile|deepslate/, "#3e3f45"], [/mossy_stone/, "#7d8a6e"], [/stone_brick/, "#9a9a96"],
  [/polished_diorite|calcite|diorite/, "#e6e3dc"], [/stripped_oak/, "#b98a55"], [/oak_log/, "#6b4a26"], [/oak_stairs|oak_fence|oak_slab|oak_planks/, "#a06a3a"],
  [/spruce/, "#6e4f30"], [/glass/, "#9cc3dd"], [/brick/, "#8b3a2a"], [/bookshelf/, "#7a5a36"], [/red_/, "#a83232"], [/lantern|campfire/, "#e8b04a"],
  [/smoker|barrel|chest|lectern/, "#7a5a36"], [/cauldron/, "#555"], [/lightning_rod/, "#c47a4a"], [/./, "#888"],
];
export function exportCells(bp: B.Blueprint) {
  const cells = B.expand(bp, { origin: { x: 0, y: 0, z: 0 }, facing: "south" }).filter((c) => !/:air$/.test(c.id));
  const pal: string[] = [];
  const out = cells.map((c) => {
    const col = COLORS.find(([re]) => re.test(c.id))![1];
    let i = pal.indexOf(col); if (i < 0) { pal.push(col); i = pal.length - 1; }
    const shape = /_stairs/.test(c.id) ? (c.props.half === "top" ? 3 : 1) : /_slab|carpet/.test(c.id) ? (c.props.type === "top" ? 4 : 2)
      : /pane|fence|rod|lantern|bars|door|wall$/.test(c.id) ? 5 : 0;
    return [c.pos.x, c.pos.y, c.pos.z, i, shape];
  });
  return { size: bp.size, pal, cells: out };
}
const [mod, name, outFile] = process.argv.slice(2);
if ((import.meta as any).main && mod) {
  const m = await import(mod);
  fs.writeFileSync(outFile, JSON.stringify(exportCells(m[name])));
  console.log("exported", outFile);
}
