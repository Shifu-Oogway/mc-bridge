// Turn the stone-brick foundation under a building into a deepslate waterfront base with stepped buttresses.
//   node settlement/scripts/waterfront.mjs x1 z1 x2 z2 [baseY=69]
// 1. Under the footprint (y <= baseY), stone bricks -> deepslate bricks (with cracked ones), mossy -> cobbled deepslate.
// 2. Along each outer face where the ground drops more than 3 below baseY: a buttress every 4 blocks, 2 deep at the
//    bottom and 1 deep higher up, capped with deepslate brick stairs; a polished deepslate band at baseY.
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const [x1, z1, x2, z2, baseY = 69] = process.argv.slice(2).map(Number);
const inst = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS");
const conn = JSON.parse(fs.readFileSync(path.join(inst, "mcbridge", "connection.json"), "utf8"));
const call = (route, body) => fetch(`http://${conn.host}:${conn.port}${route}`, { method: "POST", headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const cmd = (c) => call("/chat", { message: c });
const blocks = async (ps) => { const out = []; for (let i = 0; i < ps.length; i += 64) out.push(...(await call("/blocks", { positions: ps.slice(i, i + 64) })).blocks); return out; };
await cmd(`/tp @s ${(x1 + x2) >> 1} 100 ${(z1 + z2) >> 1}`); await new Promise((r) => setTimeout(r, 1500));
for (let y0 = 30; y0 <= baseY; y0 += 10) {
  const y1 = Math.min(baseY, y0 + 9);
  await cmd(`/fill ${x1} ${y0} ${z1} ${x2} ${y1} ${z2} minecraft:deepslate_bricks replace minecraft:stone_bricks`);
  await cmd(`/fill ${x1} ${y0} ${z1} ${x2} ${y1} ${z2} minecraft:cobbled_deepslate replace minecraft:mossy_stone_bricks`);
}
// Find the outer foundation face cells (deepslate bricks at baseY whose outward neighbour is not solid).
const ring = [];
for (let x = x1; x <= x2; x++) for (let z = z1; z <= z2; z++) ring.push({ x, y: baseY, z });
const top = await blocks(ring);
const isBase = new Set(top.filter((b) => /deepslate_bricks|cobbled_deepslate|polished_deepslate/.test(b.id)).map((b) => `${b.pos.x},${b.pos.z}`));
const SOFT = /air|water|grass$|fern|flower|seagrass|kelp/;
async function groundBelow(x, z) {
  const col = await blocks(Array.from({ length: 45 }, (_, i) => ({ x, y: baseY - 1 - i, z })));
  const g = col.find((b) => b.solid && !SOFT.test(b.id));
  return g ? g.pos.y : baseY - 45;
}
let buttresses = 0, cracked = 0;
for (const key of isBase) {
  const [x, z] = key.split(",").map(Number);
  for (const [dx, dz, face] of [[0, -1, "north"], [0, 1, "south"], [-1, 0, "west"], [1, 0, "east"]]) {
    if (isBase.has(`${x + dx},${z + dz}`)) continue;
    const g = await groundBelow(x + dx, z + dz);
    if (baseY - g <= 3) continue;
    // polished band just under the floor line on the outer face
    await cmd(`/setblock ${x} ${baseY - 1} ${z} minecraft:polished_deepslate`);
    if (((dz ? x : z) % 4 + 4) % 4 === 0) {
      const mid = g + Math.floor((baseY - g) * 0.55);
      await cmd(`/fill ${x + dx} ${g} ${z + dz} ${x + dx} ${baseY - 3} ${z + dz} minecraft:deepslate_bricks`);
      await cmd(`/setblock ${x + dx} ${baseY - 2} ${z + dz} minecraft:deepslate_brick_stairs[facing=${{ north: "south", south: "north", west: "east", east: "west" }[face]},half=bottom]`);
      await cmd(`/fill ${x + 2 * dx} ${g} ${z + 2 * dz} ${x + 2 * dx} ${mid} ${z + 2 * dz} minecraft:deepslate_bricks`);
      await cmd(`/setblock ${x + 2 * dx} ${mid + 1} ${z + 2 * dz} minecraft:deepslate_brick_stairs[facing=${{ north: "south", south: "north", west: "east", east: "west" }[face]},half=bottom]`);
      await cmd(`/fill ${x + dx} ${g} ${z + dz} ${x + 2 * dx} ${g + 1} ${z + 2 * dz} minecraft:cobbled_deepslate`);
      buttresses++;
    } else if ((x * 7 + z * 13) % 5 === 0) {
      await cmd(`/setblock ${x} ${g + 3 + ((x + z) % 4)} ${z} minecraft:cracked_deepslate_bricks`); cracked++;
    }
  }
}
console.log(`deepslate base done: ${buttresses} buttresses, ${cracked} cracked accents`);
