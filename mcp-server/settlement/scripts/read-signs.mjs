// Find every sign in an area (teleporting between search points) and read its text with /data get block.
//   node settlement/scripts/read-signs.mjs x1 z1 x2 z2 > signs.json
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const [x1, z1, x2, z2] = process.argv.slice(2).map(Number);
const inst = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS");
const conn = JSON.parse(fs.readFileSync(path.join(inst, "mcbridge", "connection.json"), "utf8"));
const call = (route, body) => fetch(`http://${conn.host}:${conn.port}${route}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const found = new Map();
for (let x = x1; x <= x2; x += 48) for (let z = z1; z <= z2; z += 48) {
  await call("/chat", { message: `/tp @s ${x} 95 ${z}` }); await sleep(1500);
  for (const y of [80, 64]) {
    await call("/chat", { message: `/tp @s ${x} ${y} ${z}` }); await sleep(400);
    const r = await call("/find", { block: "*sign*", radius: 32, limit: 50 });
    for (const s of r.results ?? []) found.set(`${s.pos.x},${s.pos.y},${s.pos.z}`, s);
  }
}
const out = [];
for (const [k, s] of found) {
  const [x, y, z] = k.split(",");
  const r = await call("/chat", { message: `/data get block ${x} ${y} ${z} front_text.messages` });
  await sleep(300);
  let text = JSON.stringify(r);
  const o = await call("/observe");
  const line = (o.chat ?? []).map((c) => c.text).reverse().find((t) => t.includes(`${x}, ${y}, ${z}`)) ?? text;
  const words = [...line.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).filter((t) => t && !/^\s*$/.test(t));
  out.push({ pos: { x: +x, y: +y, z: +z }, id: s.id, text: words.join(" | ") || line });
}
console.log(JSON.stringify(out, null, 1));
