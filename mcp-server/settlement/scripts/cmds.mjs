// Send a list of game commands (one per line on stdin) through the bridge; prints each reply. Creative/cheats only.
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const inst = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS");
const conn = JSON.parse(fs.readFileSync(path.join(inst, "mcbridge", "connection.json"), "utf8"));
const lines = fs.readFileSync(0, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
for (const c of lines) {
  const r = await fetch(`http://${conn.host}:${conn.port}/chat`, { method: "POST", headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: c }) }).then((x) => x.json());
  await new Promise((res) => setTimeout(res, 150));
  const msg = JSON.stringify(r).match(/Successfully filled \d+|No blocks were filled|Teleported|[A-Z][^"]*(error|Unknown|too many)[^"]*/i);
  console.log(`${c.slice(0, 50).padEnd(50)} -> ${msg ? msg[0] : "(no reply yet)"}`);
}
