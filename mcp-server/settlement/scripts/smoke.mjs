// MCP smoke test: start index.js over stdio, list tools, call read-only settlement tools against the live game.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const c = new Client({ name: "smoke", version: "0" });
await c.connect(new StdioClientTransport({ command: "node", args: ["index.js"], stderr: "inherit" }));
const tools = (await c.listTools()).tools.map((t) => t.name);
console.log("tools:", tools.join(", "));
for (const [name, args] of [["mc_settlement_status", {}], ["mc_blueprint", { action: "list" }], ["mc_blueprint", { action: "materials", id: "starter-workshop" }], ["mc_task_status", {}]]) {
  const r = await c.callTool({ name, arguments: args });
  console.log(`--- ${name} ${JSON.stringify(args)}${r.isError ? " ERROR" : ""}\n${r.content[0].text.slice(0, 1500)}`);
}
await c.close();
