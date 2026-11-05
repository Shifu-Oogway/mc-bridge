# Compatibility report: medieval Create settlement (2026-11-03)

## Environment (discovered)
| Item | Value | Evidence |
|---|---|---|
| Instance | `C:\Users\chris\curseforge\minecraft\Instances\Create - Perfect World Post Production - Better FPS` | mc_instances |
| Minecraft / loader | 1.21.1 / NeoForge 21.1.219 | mc_instances; kick message from the LAN server |
| Create | 6.0.9 (+ ~20 Create addons, see `../AUDIT.md` §1) | mods folder |
| Node / npm | v24.15.0 / 11.12.1 (Node strips TypeScript types natively, no build step) | `node -v` |
| Target world | save folder `New World (2)`, seed `198104039443036482`, Survival, **Peaceful**, structures on, cheats off | level.dat (NBT parse) + held `session.lock` |
| LAN | opened by the user; port **62209** this time (changes every time LAN is reopened) | `Get-NetTCPConnection` for javaw pid |
| Simulation distance | 8 chunks (render 12) | options.txt |

## Gate 1: Mineflayer on this pack: **FAILED**
Probe: `settlement/probe/probe.mjs` (mineflayer 4.33.0, minecraft-protocol 1.68.0, minecraft-data 3.119.0, pinned with a lockfile in `settlement/probe`). Raw output: `settlement/probe/probe-result.txt`.

```
PING version: {"name":"1.21.1","protocol":767} isModded: true
protocol state -> login ; packet login encryption_begin
protocol state -> configuration
packet configuration custom_payload minecraft:register / neoforge:register
KICKED: translate "neoforge.network.negotiation.failure.vanilla.client.not_supported",
        "You are trying to connect to a server that is running NeoForge, but you are not.
         Please install NeoForge Version: 21.1.219 to connect to this server."
```

What this means:
- Login and the protocol version are fine. NeoForge's network negotiation then refuses any vanilla client, because Create and the other content mods register required channels and registries. No spawn, no chunks, so block/item identification, digging, crafting, containers and Create interactions **cannot be tested at all** through Mineflayer.
- Making Mineflayer work would need a NeoForge 1.21.1 configuration-phase handshake plus registry sync for 116 mods in node-minecraft-protocol. No maintained implementation exists. Writing one is a large, fragile project, and it would still decode Create block entities and contraptions wrongly.
- Authentication: the probe got past login with an offline username. The final design doesn't need a second account (see below), so this matters only if Mineflayer is ever revisited.

## Adapter in use: mc-bridge client mod (already installed, nothing replaced)
`mcbridge-neoforge-1.21.1-0.0.1.jar` in the instance mods folder (built from `D:\Minecraft\mc-bridge\src`). It runs **inside the real modded client**, so every Create block, item, recipe and block state is native. It exposes a token-protected HTTP API on 127.0.0.1 only (`<instance>\mcbridge\connection.json`). The MCP server (`mcp-server/index.js`) wraps it as tools. Nothing listens on the LAN.

Consequences you should know:
- **The "bot" is your own logged-in character.** One gameplay bot, no second account, no separate inference service. While Claude drives, don't use the keyboard. Your input interrupts the current action (by design: the bridge reports `interrupted`).
- The game must be running with the world loaded. "Open to LAN" is **not required** for the bridge; it only mattered for the Mineflayer probe.
- No commands are used for survival objectives (`mc_fill` needs cheats, which are off).

## Gate 2: capabilities through mc-bridge in this world
| Capability | Status | Evidence |
|---|---|---|
| Observe position/health/hunger/inventory/entities | ✅ observed | mc_observe, mc_settlement_status |
| Block/item ids incl. modded (Create) | ✅ observed in the earlier creative world (create:funnel, create:gearbox NBT); vanilla ids in this world | AUDIT.md, find_blocks |
| Movement (A* goto, long travel task) | ✅ observed | task `tmw0r7dt60` travel 36 blocks: done |
| Digging + collecting | ✅ observed | gather task: 14/14 oak logs, inventory verified |
| Placement | ✅ observed in the old survival world (many placements); orientation control by stand position is **untested live** | ROADMAP lessons |
| Crafting (2x2 / table) | ✅ observed earlier (Create press, shafts, wheels crafted in survival) | ROADMAP P2 |
| Containers (open, click slots) | ✅ observed earlier | mc_click_slot use in ROADMAP |
| Create power + observed I/O | ✅ in the old survival world: water wheel → millstone; creative world: engine hall 8 RPM / 1024 SU measured via NBT. **Not yet in this world.** | ROADMAP, AUDIT |
| Contraptions (bearing/harvester) | ❌ untested | none |
| Screenshots | ❌ not available in the bridge | n/a |
