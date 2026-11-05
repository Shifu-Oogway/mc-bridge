# Directive for the local player (Steampunk Create base)

You play Minecraft through the mc_* tools. World is peaceful. Modpack: Create: Perfect World - Post Production (Better FPS), MC 1.21.1, NeoForge, Create 6.0.9.

## Long-term goal
A cohesive, automated Victorian-steampunk industrial base: brass/copper accents, dark oak, spruce, stone brick; chimneys, exposed shafts and cogs, catwalks, glass factory windows, lanterns. Function AND looks matter: never leave scattered temporary structures.

## How you work
1. Read `roadmap.json` (in this folder). It says the current phase, what is DONE, and which plan file is next.
2. Run that plan's steps in order. Each step has an inventory/world check. Do not claim a step is done until the check passes (mc_observe / mc_blocks).
3. When a plan is finished, set its milestone to done in the report, then take the next plan listed in `roadmap.json` -> `queue`. Do not stop after one plan.
4. Stop and write a note ONLY for: a repeated technical failure (3 identical failures), a missing recipe/item you cannot obtain, or a step that would destroy existing machines.

## Hard rules (learned the hard way)
- Base site: around x=1082..1101, z=-334..-328, surface y~62-64. Existing machines there must not be broken: water-wheel millstone at (1096,61..63,-332..-334), old millstone+crank at (1085,63..64,-328). Never mc_mine near them.
- A cell's centre is its coordinate + 0.5. mc_place fails silently if your body (0.6 x 1.8) overlaps the target cell: step back with mc_move and retry.
- mc_mine on one position can clear 1-2 extra blocks in your line of sight. Check neighbours with mc_blocks first.
- mc_interact results lag one call: confirm with mc_blocks / mc_observe.
- Craft with mc_craft; with times>1 the last result may stay in the grid (mc_click_slot slot 0 quick_move).
- An open inventory is closed automatically before movement. Stop keys W/A/S/D/Space/Esc are the human; mouse is not.
- Never use mc_chat or slash commands. (mc_fill wraps /fill and only works if the human sets allowCommands true; it is OFF, so do not call it.)
- Prefer bulk tools: mc_dig (shafts/tunnels), mc_mine block+count. Default tool outputs are compact; do not request verbose/full unless debugging.
- Memory: at the end of every plan or milestone, update plans/ROADMAP.md (inventory snapshot, infrastructure, next step, "Session handoff") so a fresh short session can resume by reading it instead of replaying history.

## Working style (token + speed discipline)
- Run a plan's steps back to back. No narration between routine calls; speak only at milestones, failures, or decisions. Do not re-run mc_observe after every action; check at step boundaries.
- Delegate repetitive gathering (chopping, mining, smelting, restocking to a target count) to the `mc-gatherer` subagent (runs on a cheap model) with an exact target such as "hold 64 cobblestone and 16 logs". Keep design, layout and Create engineering for yourself. Never act in the game while the gatherer is running.

## Create facts verified in the installed jar
- andesite_alloy = 2 andesite + 2 iron nuggets (diagonal). shaft = 2 alloy -> 8. cogwheel = shaft + plank. andesite_casing = alloy used on a stripped log. gearbox = casing centre + 4 cogwheels. hand_crank = 3 planks over alloy. water_wheel = 8 planks around a shaft. millstone = cogwheel / casing / stone.
- Plain gearbox placed beside a shaft came out axis=y; craft it into create:vertical_gearbox (free shapeless) to get axis=x.
- Millstone takes rotation from below. Input must be dropped ON ITS TOP (stand on it, look down, throw from inventory). Right-click only collects output.
- Water wheels need FLOWING water over the top; still water does nothing.

## Style checklist for every structure
Footprint planned on paper first, spruce/dark-oak frames, stone-brick or cobble walls, glass windows, lanterns, no floating blocks, shafts and cogs left visible, chimney or vent on anything that "burns".
