// Structured CLI over the same MCP server Claude Code uses.
//   node settlement/scripts/ctl.mjs <tool> [json-args] [<tool> [json-args] ...]
// Calls run in order in ONE server process. A task started here is paused (checkpointed) when this process exits,
// so pair mc_task_start with mc_task_status {"id":..., "waitSec":50} calls, or use "@last" as the id.
// The owner lock refuses to start tasks while Claude Code's server owns the player; read-only calls always work.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
if (!argv.length) {
  console.log("usage: ctl <tool> [json] ...   e.g. ctl mc_settlement_status   ctl mc_task_cancel '{\"pause\":true}'");
  process.exit(1);
}
const c = new Client({ name: "settlement-ctl", version: "1" });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, "index.js")], cwd: root, stderr: "pipe" });
await c.connect(transport);
// Keep the server's stderr (crash traces, warnings) in the state folder instead of discarding it.
const { createWriteStream } = await import("node:fs");
const log = createWriteStream(path.join(root, "plans", "medieval", "server.log"), { flags: "a" });
log.write(`\n=== ${new Date().toISOString()} ctl ${argv.join(" ").slice(0, 200)}\n`);
transport.stderr?.pipe(log);
let lastId;
for (let i = 0; i < argv.length; i++) {
  const name = argv[i];
  let args = {};
  if (argv[i + 1] && argv[i + 1].trim().startsWith("{")) args = JSON.parse(argv[++i]);
  if (args.id === "@last") args.id = lastId;
  if (name === "qm") {
    // Pseudo-command: shift-click every stack of args.item from the player's side into the open container
    // (or, with from:"container", the container's slots of that item back to the player).
    const o = JSON.parse((await c.callTool({ name: "mc_observe", arguments: {} })).content[0].text);
    const want = args.item.includes(":") ? args.item : `minecraft:${args.item}`;
    const side = args.from === "container" ? /container|result/ : /inventory|hotbar/;
    const slots = (o.container?.slots ?? []).filter((s) => s.id === want && side.test(s.section)).slice(0, args.max ?? 9);
    for (const s of slots) await c.callTool({ name: "mc_click_slot", arguments: { slot: s.slot, mode: "quick_move" } });
    console.log(`--- qm ${want}: moved ${slots.length} stack(s)`);
    continue;
  }
  if (name === "wait") {
    // Pseudo-command: poll until the task leaves "running" (or maxMin passes), then print its final record.
    const end = Date.now() + (args.maxMin ?? 15) * 60_000;
    let t;
    do {
      const r = await c.callTool({ name: "mc_task_status", arguments: { id: args.id, waitSec: 45 } }, undefined, { timeout: 180_000 });
      t = JSON.parse(r.content[0].text);
      process.stderr.write(`  ${t.status} ${t.progress?.note ?? ""}\n`);
    } while (t.status === "running" && Date.now() < end);
    console.log(`--- wait\n${JSON.stringify(t, null, 1)}`);
    continue;
  }
  const r = await c.callTool({ name, arguments: args }, undefined, { timeout: 180_000 });
  const out = r.content?.[0]?.text ?? "";
  try { const j = JSON.parse(out); if (j.id && name === "mc_task_start") lastId = j.id; } catch { /* text */ }
  console.log(`--- ${name}${r.isError ? " (ERROR)" : ""}\n${out}`);
}
await c.close();
