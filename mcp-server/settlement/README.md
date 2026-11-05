# Settlement layer (medieval Create settlement)

TypeScript modules loaded by `mcp-server/index.js` (Node ≥ 23.6 runs `.ts` directly, so there's no build step). They add persistent, bounded tasks, blueprints, a local safety watchdog and the controller handoff on top of the mc-bridge client mod. See `../plans/medieval/COMPATIBILITY.md` for why the bridge is used instead of Mineflayer.

```
src/blueprint.ts   local-frame ops -> world cells, rotation of block states, materials, diff/verify
src/tasks.ts       TaskStore (JSON, atomic writes) + TaskRunner (one owner, timeout, pause/cancel/resume)
src/safety.ts      pure safety verdicts (health, hunger, hostiles) + retreat point
src/world.ts       open-world detection (held session.lock + level.dat seed), plan.json, HANDOFF.md
src/tools.ts       MCP tools, skills (gather, build_stage, travel), watchdog, owner lock, shutdown
blueprints/*.json  deterministic blueprints
probe/             isolated Mineflayer compatibility probe (own lockfile; not used at runtime)
scripts/ctl.mjs    CLI over the same MCP server;  ctl.cmd = Windows wrapper
test/*.test.ts     node:test unit tests
```
State lives in `../plans/medieval/`: `plan.json`, `tasks.json`, `HANDOFF.md`, `owner.lock`, `control.json` (transient).

## Setup (Windows, PowerShell)
1. Install Node 24 LTS (already present: v24.15.0).
2. `cd D:\Minecraft\mc-bridge\mcp-server; npm ci` (exact versions from `package-lock.json`).
3. `npm run check`: type-check, unit tests, syntax check.
4. Optional: copy `config.example.json` to `config.json`. Nothing in it is secret; the bridge token stays in the instance folder.
5. Claude Code already loads the server via `D:\Minecraft\mc-bridge\.mcp.json` (`node D:/Minecraft/mc-bridge/mcp-server/index.js`). After code changes run `/mcp` → reconnect `mc-bridge`, or restart Claude Code.

## Start a session
1. Start the CurseForge instance and load the world `New World (2)`. Opening it to LAN is not needed for the bridge.
2. Hands off keyboard and mouse while Claude plays: your input interrupts actions.
3. In Claude Code, from `D:\Minecraft\mc-bridge\mcp-server\plans`: ask Claude to continue the settlement. It must call `mc_settlement_status` first.

**Autonomy limit:** Claude makes the decisions only while that Claude Code session is open and working. When the session ends, the MCP server's stdin closes. The server then pauses the running task, releases all keys, writes the checkpoint and HANDOFF.md, and exits, leaving the player idle. Nothing explores on its own. Farms and machines keep running only while the game is open and their chunks are loaded (within 8 chunks of the player).

## Controls (PowerShell, from `mcp-server\settlement`)
| Action | Command |
|---|---|
| status | `.\ctl.cmd status` |
| task list | `.\ctl.cmd tasks` |
| pause running task | `.\ctl.cmd pause` (works across processes through `control.json`; keys released immediately) |
| cancel | `.\ctl.cmd cancel` |
| resume | `.\ctl.cmd resume <taskId>` |
| stop safely | `.\ctl.cmd stop` (pause + release keys + checkpoint) |
| checkpoint | `.\ctl.cmd checkpoint "note"` |
| any tool | `.\ctl.cmd raw mc_blueprint "{\"action\":\"list\"}"` |
| emergency | press any movement key in the game, or Esc: the bridge yields to human input |

Inside Claude Code the same operations are the tools `mc_settlement_status`, `mc_task_start|status|cancel|resume`, `mc_blueprint`, `mc_checkpoint`.

## Tools added
- `mc_settlement_status`: world identity check, live observation, safety verdict, plan summary.
- `mc_task_start {kind, args}` returns an id immediately. Kinds:
  - `gather {block, item, target}`: converges on an inventory count.
  - `build_stage {build, stage}`: places and verifies cells, skipping correct ones. It clears only natural blocks, and logs only with `clearTrees`.
  - `travel {x, z}`
  - `retrace {task?}`: walks back along the breadcrumbs that the watchdog recorded (every ≥3 blocks) while that task ran, newest first, ending where the task started. This is the way out of caves and tunnels.
  - `mine {entrance, dir, targetY, branches?, maxSteps?, stay?}`: the dedicated staircase mine. It is 1 wide and 3 high, so you can always walk back up. It seals water and lava with cobblestone before opening a cell, patches missing floors, places torches every 6 steps if any are carried, and takes exposed ore in 2-high branch tunnels. Progress lives in `plan.json` (`mine`), so each run continues where the last stopped (`maxSteps` per run, default 24). The task climbs back to the entrance at the end unless `stay:true`.
- `mc_task_status {id?, waitSec?}`, `mc_task_cancel {pause?}`, `mc_task_resume {id}` (refused in a different world; at most 5 attempts).
- `mc_blueprint list|show|materials|place|verify`
- `mc_checkpoint`: updates `plan.json` and rewrites `HANDOFF.md`.

Watchdog (every 1 s while a task runs, no Claude round-trip):
- health ≤ 8: stop, cancel and eat.
- hunger ≤ 14 with food on hand: pause, eat, auto-resume.
- hostile within 10 blocks: stop, cancel and retreat 12 blocks away.

## Known limits (honest)
- Roof cells above reach need temporary scaffolding. The controller builds and removes the dirt pillars; `build_stage` reports those cells as issues instead of improvising.
- Stair/door/furnace orientation is steered by where the player stands, then verified. Mismatches are reported, not silently accepted. Log axis is not controlled.
- No screenshots: verification is block-state probes and container/NBT readouts.
- `#minecraft:logs` matches every wood type. Gather with the exact block (`oak_log`).
