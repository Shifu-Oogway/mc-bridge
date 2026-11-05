// Read-only recorder for learning from a human player: polls the bridge, never sends actions.
//   node settlement/scripts/record.mjs <minutes> [x1 y1 z1 x2 y2 z2]
// Logs (JSONL) each block change inside the watched box together with where the player stood, which way they
// looked and what they held at that moment, plus a position sample every 2 s. Output: plans/medieval/recordings/.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const [mins = "30", ...box] = process.argv.slice(2);
const [x1, y1, z1, x2, y2, z2] = box.length === 6 ? box.map(Number) : [309, 76, 641, 321, 81, 651];
const inst = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS");
const conn = JSON.parse(fs.readFileSync(path.join(inst, "mcbridge", "connection.json"), "utf8"));
const call = (route, body) => fetch(`http://${conn.host}:${conn.port}${route}`, {
  method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" },
  body: body ? JSON.stringify(body) : undefined,
}).then((r) => r.json());

const dir = path.join(root, "plans", "medieval", "recordings");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
const out = fs.createWriteStream(file, { flags: "a" });
const log = (o) => out.write(JSON.stringify({ t: Date.now(), ...o }) + "\n");

const cells = [];
for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++)
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
    for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) cells.push({ x, y, z });
const key = (b) => `${b.id}${b.properties ? JSON.stringify(b.properties) : ""}`;
async function scan() {
  const m = new Map();
  for (let i = 0; i < cells.length; i += 64) {
    const r = await call("/blocks", { positions: cells.slice(i, i + 64) });
    for (const b of r.blocks) m.set(`${b.pos.x},${b.pos.y},${b.pos.z}`, b);
  }
  return m;
}

let prev = await scan();
let lastSample = 0;
const end = Date.now() + Number(mins) * 60_000;
console.log(`recording to ${file} for ${mins} min, box ${x1},${y1},${z1}..${x2},${y2},${z2}`);
while (Date.now() < end) {
  try {
    const o = await call("/observe");
    const p = o.player;
    const held = (o.inventory ?? []).find((i) => i.slot === p.selectedHotbarSlot)?.id ?? null;
    const me = { pos: [p.pos.x, p.pos.y, p.pos.z].map((n) => Math.round(n * 100) / 100), yaw: Math.round(p.yaw), pitch: Math.round(p.pitch), held };
    if (Date.now() - lastSample > 2000) { log({ ev: "pos", ...me }); lastSample = Date.now(); }
    const now = await scan();
    for (const [k, b] of now) {
      const a = prev.get(k);
      if (a && key(a) !== key(b)) {
        log({ ev: "change", at: k, from: a.id, to: b.id, props: b.properties, target: o.target?.pos ? `${o.target.pos.x},${o.target.pos.y},${o.target.pos.z}:${o.target.face}` : null, ...me });
      }
    }
    prev = now;
  } catch (e) { log({ ev: "error", msg: String(e.message ?? e) }); }
  await new Promise((r) => setTimeout(r, 500));
}
out.end();
console.log("done");
