// Lay the settlement's 3-wide roads (creative preview): cobbled deepslate centre, polished deepslate kerbs, a smoothed
// profile (max 1 block rise per block), cuttings through rises, cobbled-deepslate fill on small dips, timber trestle
// bridges over deep dips, and lamp posts every 12 blocks.
//   node settlement/scripts/roads.ts            (all routes)      node settlement/scripts/roads.ts P3 P4  (some routes)
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { openWorld } from "../src/world.ts";

const inst = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS");
const w = openWorld(inst);
if (!w || w.gameType !== 1 || !w.allowCommands) throw new Error("refusing: not a creative world with cheats");
const conn = JSON.parse(fs.readFileSync(path.join(inst, "mcbridge", "connection.json"), "utf8"));
const call = (route: string, body?: unknown) => fetch(`http://${conn.host}:${conn.port}${route}`, { method: "POST", headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
let n = 0; const cmd = async (c: string) => { n++; await call("/chat", { message: c }); };

// Routes: centre-line waypoints (x,z). Ends stop at building edges / entrances.
export const ROUTES: Record<string, [number, number][]> = {
  P1: [[306, 626], [306, 649]],                                   // manor porch -> plaza
  P2: [[303, 655], [301, 655]],                                   // plaza -> watermill
  P3: [[323, 651], [330, 651], [330, 647]],                       // plaza -> warehouse dock
  P3b: [[330, 652], [330, 657], [350, 657], [350, 672]],          // warehouse -> sawmill (crosses the siding at x346)
  P4: [[306, 669], [306, 673], [289, 673], [289, 677]],           // plaza -> foundry door
  P5: [[314, 669], [314, 702], [328, 702], [328, 752], [322, 752]], // plaza -> grain barn porch (east side)
  P6: [[329, 744], [362, 744], [362, 746]],                       // trunk -> quarry yard
};
// Footprints the roads must not touch (entrance cells are left as the route's last cells and are outside these).
const BUILT: [number, number, number, number][] = [[299, 606, 327, 642], [280, 645, 299, 663], [268, 678, 305, 699], [331, 637, 355, 654],
  [341, 673, 357, 688], [331, 673, 339, 687], [291, 754, 338, 780], [312, 749, 320, 753], [307, 732, 325, 750], [356, 747, 384, 781],
  [345, 654, 347, 678]]; // last: the warehouse-sawmill rail trestle (crossed, not paved)
const inBuilt = (x: number, z: number) => BUILT.some(([a, b, c, d]) => x >= a && x <= c && z >= b && z <= d);
const SOFT = /create:|air|leaves|_log$|short_grass|tall_grass|fern|flower|poppy|dandelion|tulip|daisy|bluet|orchid|allium|cornflower|bush|sapling|snow|vine|dead_bush|firefly|leaf_litter|wildflowers|dry_grass|water|lava/;

async function groundAt(x: number, z: number): Promise<number> {
  const ys = Array.from({ length: 56 }, (_, i) => 105 - i);
  const r = await call("/blocks", { positions: ys.map((y) => ({ x, y, z })) });
  const b = r.blocks.find((q: any) => q.solid && !SOFT.test(q.id));
  return b ? b.pos.y : 60;
}
function cellsOf(pts: [number, number][]) {
  const out: { x: number; z: number; dx: number; dz: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    let [x, z] = pts[i - 1]; const [tx, tz] = pts[i];
    const dx = Math.sign(tx - x), dz = Math.sign(tz - z);
    if (i === 1) out.push({ x, z, dx, dz });
    while (x !== tx || z !== tz) { x += dx; z += dz; out.push({ x, z, dx, dz }); }
  }
  return out;
}

async function lay(name: string, pts: [number, number][]) {
  const cells = cellsOf(pts);
  await cmd(`/tp @s ${pts[0][0]} 110 ${pts[0][1]}`); await new Promise((r) => setTimeout(r, 1500));
  // Ground under the centre and both kerbs; the road level follows the highest of them, then is smoothed to <=1/block.
  const g: number[] = [];
  for (const c of cells) {
    const sx = -c.dz, sz = c.dx; // side vector
    let m = -1e9; for (const k of [-1, 0, 1]) m = Math.max(m, await groundAt(c.x + sx * k, c.z + sz * k));
    g.push(m);
  }
  const y = g.slice();
  for (let i = 1; i < y.length; i++) y[i] = Math.min(Math.max(y[i], y[i - 1] - 1), y[i - 1] + 1);
  for (let i = y.length - 2; i >= 0; i--) y[i] = Math.min(Math.max(y[i], y[i + 1] - 1), y[i + 1] + 1);
  let bridges = 0, cuts = 0;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]; const sx = -c.dz, sz = c.dx;
    for (const k of [-1, 0, 1]) {
      const x = c.x + sx * k, z = c.z + sz * k;
      if (inBuilt(x, z)) continue;
      const top = y[i];
      const gnd = await groundAt(x, z);
      const surf = k === 0 ? ((x * 31 + z * 17) % 5 === 0 ? "minecraft:cobblestone" : "minecraft:cobbled_deepslate") : "minecraft:polished_deepslate";
      if (gnd - top > 0) { if (gnd - top > 3) { console.log(`  skip deep cut at ${x},${z} (ground ${gnd}, road ${top})`); continue; } await cmd(`/fill ${x} ${top + 1} ${z} ${x} ${gnd + 3} ${z} minecraft:air`); cuts++; }
      if (top - gnd >= 4) {
        // trestle bridge: plank deck, log posts every 4 cells under the kerbs, fence railing
        await cmd(`/setblock ${x} ${top} ${z} ${k === 0 ? "minecraft:dark_oak_planks" : "minecraft:dark_oak_slab[type=top]"}`);
        if (k !== 0) { if (i % 4 === 0) await cmd(`/fill ${x} ${gnd + 1} ${z} ${x} ${top - 1} ${z} minecraft:dark_oak_log`); await cmd(`/setblock ${x} ${top + 1} ${z} minecraft:dark_oak_fence`); }
        bridges++;
      } else {
        if (top > gnd) await cmd(`/fill ${x} ${gnd + 1} ${z} ${x} ${top - 1} ${z} minecraft:cobbled_deepslate`);
        await cmd(`/setblock ${x} ${top} ${z} ${surf}`);
        await cmd(`/fill ${x} ${top + 1} ${z} ${x} ${top + 3} ${z} minecraft:air replace #minecraft:replaceable`);
      }
    }
    // lamp post every 12 cells on the left side (skip on bridges and inside footprints)
    if (i % 12 === 6) {
      const lx = c.x + sx * 2, lz = c.z + sz * 2;
      if (!inBuilt(lx, lz) && y[i] - g[i] < 4) {
        const lg = await groundAt(lx, lz);
        if (Math.abs(lg - y[i]) <= 2) { await cmd(`/setblock ${lx} ${y[i]} ${lz} minecraft:polished_deepslate`); await cmd(`/fill ${lx} ${y[i] + 1} ${lz} ${lx} ${y[i] + 3} ${lz} minecraft:dark_oak_fence`); await cmd(`/setblock ${lx} ${y[i] + 4} ${lz} minecraft:lantern`); }
      }
    }
  }
  console.log(`${name}: ${cells.length} cells, ${cuts} cut cells, ${bridges} bridge cells, levels ${Math.min(...y)}..${Math.max(...y)}`);
}

const pick = process.argv.slice(2);
for (const [k, pts] of Object.entries(ROUTES)) if (!pick.length || pick.includes(k)) await lay(k, pts);
console.log(`${n} commands`);

// Plaza (hub between manor, watermill and warehouse): levelled to y70, cobbled deepslate with a polished border, a
// stone well with a roof in the middle and lamp posts on the corners.  node settlement/scripts/roads.ts PLAZA
if (pick.includes("PLAZA")) {
  const [x0, z0, x1, z1, Y] = [304, 650, 322, 668, 70];
  await cmd(`/tp @s 313 110 659`); await new Promise((r) => setTimeout(r, 1500));
  await cmd(`/fill ${x0} ${Y + 1} ${z0} ${x1} ${Y + 6} ${z1} minecraft:air`);
  await cmd(`/fill ${x0} ${Y - 3} ${z0} ${x1} ${Y - 1} ${z1} minecraft:cobbled_deepslate`);
  await cmd(`/fill ${x0} ${Y} ${z0} ${x1} ${Y} ${z1} minecraft:cobbled_deepslate`);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    if (edge) await cmd(`/setblock ${x} ${Y} ${z} minecraft:polished_deepslate`);
    else if ((x * 7 + z * 13) % 6 === 0) await cmd(`/setblock ${x} ${Y} ${z} minecraft:cobblestone`);
  }
  // well
  const [cx, cz] = [313, 659];
  await cmd(`/fill ${cx - 1} ${Y - 3} ${cz - 1} ${cx + 1} ${Y + 1} ${cz + 1} minecraft:stone_bricks`);
  await cmd(`/setblock ${cx} ${Y + 1} ${cz} minecraft:water`); await cmd(`/fill ${cx} ${Y - 2} ${cz} ${cx} ${Y} ${cz} minecraft:water`);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) await cmd(`/fill ${cx + dx} ${Y + 2} ${cz + dz} ${cx + dx} ${Y + 3} ${cz + dz} minecraft:dark_oak_fence`);
  await cmd(`/fill ${cx - 1} ${Y + 4} ${cz - 1} ${cx + 1} ${Y + 4} ${cz + 1} minecraft:polished_blackstone_brick_slab[type=bottom]`);
  await cmd(`/setblock ${cx} ${Y + 3} ${cz} minecraft:chain`); await cmd(`/setblock ${cx} ${Y + 2} ${cz} minecraft:lantern[hanging=true]`);
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { await cmd(`/fill ${x} ${Y + 1} ${z} ${x} ${Y + 3} ${z} minecraft:dark_oak_fence`); await cmd(`/setblock ${x} ${Y + 4} ${z} minecraft:lantern`); }
  console.log("plaza done");
}
