# Verification evidence (2026-11-03)

## Automated tests (`npm run check` in mcp-server)
- `tsc -p .`: 0 errors (strict, erasable syntax only).
- `node --test settlement/test/*.test.ts`: **18/18 pass**. Coverage:
  - Blueprints: validation, rotation for all 4 orientations, block-state rotation, door orientation, override order, rotated footprint, materials, diff classification, stand positions, substitutions.
  - Tasks: done and persisted, single owner, pause/resume convergence, cross-world resume refusal, timeout, restart → interrupted.
  - Safety verdicts and retreat geometry.
  - Handoff sections and world-mismatch warning.

## MCP integration (stdio, live game): `settlement/scripts/smoke.mjs`
- All 26 tools listed (19 original + 7 new).
- `mc_settlement_status` detected `New World (2)` with seed 198104039443036482, survival, hp 20 / food 20.
- `mc_blueprint materials starter-workshop` returned 438 cells.

## Observed gameplay in the configured world (`New World (2)`)
| Test | Task id | Result |
|---|---|---|
| travel ~36 blocks to oak grove | tmw0r7dt60 | done, arrived (297.8, 71, 664.2) |
| gather oak_log → 6 | (first gather) | done 6/6 |
| gather oak_log → 14, **pause at 7**, resume | second gather | paused 7/14 → resumed (attempt 2) → done 14/14; inventory read back: 14 oak_log (+8 acacia_log picked up because the `#logs` tag matches acacia) |
| controller process exit | n/a | clean exit code 0 after the shutdown fix |

## Session 2 (same day): tools, survey, foundation, mine
| Test | Result |
|---|---|
| Crafting chain (planks, sticks, table, wooden then stone pickaxe/axe/shovel, furnace, cobblestone stairs) | observed, items in inventory |
| gather cobblestone → 64, then → 70 (resumed after a CLI exit paused it) | done; first attempt failed honestly ("dirt in the way"), then fixed by clearing natural blockers |
| `build_stage` starter-workshop/foundation | runs 1–3 failed with recorded causes: (a) replacing the top ground layer, (b) a bad approach walk, (c) a floating floor and the pickaxe outside the hotbar. Run 4 after the fixes: **verify complete 232/232, 0 issues**. The front step stair was verified with `facing=north` |
| `mine` 12 steps from (323,71,654) heading south | done, bottom y59, climbed back to the entrance by itself |
| `retrace` of the mine task | done, 5 waypoints, ended at the task's start |

| `mine` to targetY 12 | **reached: 59 steps, bottom y12** (entrance 323,71,654 heading south). On the way: 3 iron side tunnels (one ran under the stairs before the fix, repaired by hand), zinc at step 20 left until an iron pickaxe existed, a cave under steps 37–41 bridged by automatic drop-and-pillar fills (the first by hand), one server crash with no trace (stderr now logged to plans/medieval/server.log; unhandled rejections no longer kill the server) |
| iron pickaxe | 3 raw iron from the tunnels, smelted with acacia logs, crafted |

Lessons now in code: plants block aiming (placeOne breaks them); a plant in the target cell is clicked directly; the plinth sits on the ground; tools are forced into the hotbar; a failed placement retries from 4 sides. `mc_mine clearObstacles:true` breaks built blocks in the line of sight, so don't use it next to builds (it damaged 3 plinth/floor cells, rebuilt by build_stage).

## Untested (do not claim working)
- Stair/door orientation steering for roof and door stages; scaffolding.
- Watchdog reactions live (only unit-tested): eating, retreat. Peaceful has no hostiles to test against.
- Cross-process pause via `control.json` while Claude Code owns a task.
- Any Create machinery in this world.
- Mineflayer beyond the NeoForge kick (blocked, see COMPATIBILITY.md).
