// Re-place only the cells of a design inside given boxes.  node settlement/scripts/patch.ts ../designs/x.ts ox oy oz "[[x0,y0,z0,x1,y1,z1],...]"
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import * as B from "../src/blueprint.ts";
const [mod, ox, oy, oz, boxes] = process.argv.slice(2);
const bp = (await import(mod)).blueprint();
const cells = B.expand(bp, { origin: { x: +ox, y: +oy, z: +oz }, facing: "south" });
const bx = JSON.parse(boxes) as number[][];
const inst = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS");
const conn = JSON.parse(fs.readFileSync(path.join(inst, "mcbridge", "connection.json"), "utf8"));
const call = (r: string, b: unknown) => fetch(`http://${conn.host}:${conn.port}${r}`, { method: "POST", headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((x) => x.json());
const sel = cells.filter((c) => bx.some(([x0, y0, z0, x1, y1, z1]) => c.pos.x >= x0 && c.pos.x <= x1 && c.pos.y >= y0 && c.pos.y <= y1 && c.pos.z >= z0 && c.pos.z <= z1));
sel.sort((a, b) => a.pos.y - b.pos.y || (/water/.test(a.id) ? -1 : 0) - (/water/.test(b.id) ? -1 : 0));
const str = (c: any) => c.id + (Object.keys(c.props).length ? `[${Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(",")}]` : "");
let n = 0; for (const c of sel) { await call("/chat", { message: `/setblock ${c.pos.x} ${c.pos.y} ${c.pos.z} ${str(c)}` }); n++; }
console.log("set", n);
