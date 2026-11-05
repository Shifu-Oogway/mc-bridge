# Medieval Create settlement: plan

Visual anchor: the "Manor" panel of `Create_Steampunk_Retrofit_Pack/images/steampunk_concept_board.png` (AI-generated concept art, **not** an in-game screenshot). It shows timber framing on a stone plinth, pale infill, steep dark gabled roofs with wooden edging, flower boxes, external stairs and a paved courtyard. The steampunk copper and pipes are dropped; the visible machinery is real Create (waterwheels, windmill sails, shafts, cogs).

## Palette and roof vocabulary (every building)
| Role | Early (survival-cheap) | Final upgrade |
|---|---|---|
| Plinth / retaining walls | cobblestone | stone bricks, mossy at ground contact |
| Posts, beams | oak log / stripped oak log | same (oak is local) |
| Infill | smooth sandstone (lake sand + furnace) | calcite or white terracotta |
| Roof | cobbled deepslate stairs, 45° | deepslate tile stairs, 45–60° |
| Edging / barge boards | oak stairs | spruce or oak with trim slabs |
| Glazing | glass panes | same |
| Machinery | Create andesite parts, visible shafts on beams | brass where earned |

Silhouettes vary by purpose; materials and roof pitch stay constant.

## Site (to confirm by survey before plot reservation)
Spawn area is around (300–330, 71, 630–670): flat plains with oak (acacia/savanna to the south-west). A large lake lies east of x≈329 at y≈62 (16 000+ water blocks loaded). That suits a watermill on its west shore. Next step: bounded survey of the 128×128 area around (330, 640), recording water edge, stone outcrops, sand, slope and free space. Then reserve plots with `mc_blueprint place`.

Planned layout (relative, to be fixed after survey): workshop next to the lakeside watermill; farm belt on the flat plains west; warehouse/smeltery between farms and workshop; manor and courtyard on the highest flat ground with the gatehouse facing the main path; utility corridor (shafts, belts) at y-1 under paths.

## Progression (finish each system and its building before opening more sites)
| # | Milestone | Done when (verification) |
|---|---|---|
| 0 | Tools + shelter: logs, table, wooden then stone tools, furnace, bed (wool from sheep) | items present in inventory |
| 1 | **Starter workshop** (`blueprints/starter-workshop.json`, 438 cells) | `mc_blueprint verify` complete for all 4 stages; light ≥ 8 inside |
| 2 | Wheat farm + barn (blueprint TBD), manual harvest | crop grows; output chest in barn |
| 3 | Create power: undershot waterwheel on the lake edge into the workshop (shaft, gearbox) | measured RPM/SU via block NBT or a stressometer/goggles reading by the user; observed millstone output |
| 4 | Millstone flour → mixer dough → bread (or fan smoking) | input → output batches counted |
| 5 | Sugar cane, carrots/potatoes, tree farm (sapling replant), renewable fuel (dried kelp or charcoal) | each produces into its building's chest |
| 6 | Warehouse: labelled zones, intake chest → funnels, overflow chest (never void) | sorted test batch of 64 mixed items |
| 7 | Smeltery: furnace array first, then encased fans through lava (bulk blasting) | ore in → ingots out, fuel level logged |
| 8 | Manor, gatehouse, courtyard, walls, landscaping | interiors: hall, bedroom, kitchen/dining, study, balcony |
| 9 | Expanded automation (harvester contraptions, belts to warehouse) | sustained run with jam/overflow checks |

Automation labels used in every report: **bot-operated** (Claude does it), **semi-automatic** (machine runs, Claude loads/unloads), **fully automatic** (renewable input to storage with overflow handling, verified across an interruption).

Material reservation: before a `build_stage` the task pre-checks remaining materials against the inventory. Shortages are written to `plan.json`; nothing is placed half-way unless `partial:true`.

## Inspiration board: NOT DONE YET
It needs 8–12 real, attributed references (manor/gatehouse, watermill/windmill, farm/barn, forestry workshop, warehouse exterior + interior, Create workshop + smeltery interior, manor living spaces). The retrofit pack lists 8 real createmod/PMC pages, but they are steampunk/industrial, unverified, and contain no manor, barn or living-space references. Next session: research and verify the sources, then save `REFERENCES.md` + an HTML board here. No images or sources will be invented.

## Normal-difficulty readiness checklist (report, then wait for the user)
Lit (≥ 8) living and work areas • doors on every entrance • fenced or walled perimeter, lit paths • ≥ 32 cooked food • stone or iron tools, iron armor • bed placed and slept in (spawn set) • watchdog threat retreat tested on a passive dummy test • animals penned, villagers walled • death recovery: spare tool kit in the workshop chest + death coordinates recorded • difficulty-sensitive farms reviewed (crops are not; animal breeding is not). **Claude never changes the difficulty.**

## Approved direction (2026-11-03, after the preview reset)
Review page: https://claude.ai/artifact/AczbpL2gH7BjWoEmDSw8Wy ("Ironbrook").
- Layout: town around a cobbled market square in front of the workshop door (x303..322, z653..666). Warehouse west side, pithead + smeltery east side, watermill on the lake bank NW, sawmill + tree farm east, wheat terraces in the SE hollow with barn/pens on its rim.
- Steampunk mix: FULL on the industrial east side (pithead headframe, smeltery stack + copper hood + exposed fans, workshop machine gable, warehouse hoist); ACCENTS on manor, gatehouse, barn, homes; watermill in between.
- Manor on the south-east hill crest (~x360..380, z688..698, y75..77), gatehouse at the foot (~x352, z683), drive along the contour.
- Next: detailed per-building blueprints rendered as block views for approval, then a creative preview, then survival.
