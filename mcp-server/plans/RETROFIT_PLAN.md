# RETROFIT PLAN – steampunk Create settlement (creative world, O = (-228,71,150))

## Rules for this plan
- Reuse every existing shell; make localized removals only. Never delete whole buildings or the contents of occupied storage.
- Building and Create parts go in with commands and /give. BUILD-DIRECTIVE.md authorizes this for this creative world. Nothing is gathered.
- A system is reported as working only after measured input → output batches (see VERIFICATION.md). Decor stays labelled as decor.
- Production chunks are force-loaded (vanilla `/forceload`) so they run without the player standing nearby. This is disclosed in the docs.

## Settlement palette
- Foundation: stone bricks over a deepslate-brick base course (all buildings already use this). Andesite and polished andesite go on floors next to machines.
- Frame: dark oak logs as pillars every 5–7 blocks. Spruce for the rural buildings (sawmill, mill).
- Industrial wings: brick and polished blackstone for heat sections (furnace, chimneys).
- Roof: dark oak slab or stairs, with waxed copper for ridges, cupolas and towers.
- Engineering: real Create shafts, gearboxes, cogs, belts, fans and funnels where they carry power or items. Copper only where it marks a real route.
- Detail: lanterns on chains, iron-bar railings, barrels and chests used as real receiving and output points.

## Site plan (existing, kept)
North of the street (z<150) are the powerhouse (B1), the HQ (B2), the workshop (B4) and the farm cluster (B8–B10, far north-west). South of the street are the foundry (B5) and the warehouse (B6). The station (B7) sits at the east end. Power trunk: the engine hall is the settlement powerhouse, and shafts leave it to feed other buildings.

## Phased backlog
| Phase | Target | Action | Status |
|---|---|---|---|
| 1 (vertical slice) | Foundry B5 + power trunk from B1 | Underground shaft from the engine-hall gearbox (-201,71,131) south under the street into the foundry. In the foundry: input chest → extracting funnel → belt (x-209..-198, z168) → 4 encased fans blowing through lava at z167 (bulk blasting) → inserting funnel → output chest. Visible gear train. Receiving and output stations, maintenance aisle, lighting. Force-load B1+B5 chunks. | IN PROGRESS |
| 2 | Grain mill on terraces B10 | Mill building with millstone fed by a harvester contraption, or manual wheat input at first, flour to storage; dough/bread via mixer + fan smoking | backlog |
| 3 | Warehouse B6 | Receiving belt from the dock, filtered brass funnels into chests/vaults, overflow chest | backlog |
| 4 | Sawmill B8 | Powered saw on a belt, log input chest → planks/stripped logs out (tree farming stays manual unless a mechanical-bearing harvester is built) | backlog |
| 5 | Greenhouse B9 | Harvester on a piston/bearing contraption | backlog |
| 6 | HQ B2 interior | Living and planning floors, stairs | backlog |
| 7 | Workshop B4 | Press line on the power trunk | backlog |

## Phase 1 design (foundry blasting line)
Power path:
- engine-hall gearbox (-201,71,131) south port → shaft z (-201,71,132..142, through the wall).
- gearbox[axis=x] (-201,71,143) → shaft y (-201,69..70,143) → gearbox[axis=x] (-201,68,143) → shaft z (-201,68,144..163).
- gearbox[axis=y] (-201,68,164) → shaft x (-200..-199,68,164) → gearbox[axis=z] (-198,68,164) → shaft y (-198,69..70,164) → gearbox[axis=x] (-198,71,164).
- Then a cog (-198,71,165) → shafts (-198,71,166..167) → belt end pulley (-198,71,168).

Fans:
- A cog train runs along z165, x-207..-198 (axis z, all meshing).
- Fans at (-207..-204, 71, 166) face south; their backs sit on the cog train.
- Lava sources at (-207..-204, 71, 167), contained by blackstone at x-208 and x-203, the floor below and the belt to the south.

Fan range: Create uses lerp(rpm/256, 3, 20), so 8 RPM gives about 3.5 blocks. The belt is 2 blocks from each fan.

Exposure:
- At 8 RPM the belt is expected to move items about 1 block per 60 ticks, so 4 fan cells give about 240 ticks against the 150 ticks needed. This is an estimate, not yet measured.
- Fan load: 4 × 2 SU/rpm × 8 RPM = 64 SU out of 1024.

Items: input chest (-211,71,168) → andesite funnel (-210,71,168) facing east, extracting → belt -209..-198 → andesite funnel (-197,71,168) facing west, inserting → output chest (-196,71,168).
