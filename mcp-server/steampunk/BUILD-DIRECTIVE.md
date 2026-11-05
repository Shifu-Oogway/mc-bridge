# Directive: creative architect session (build only, NEW world)

You are the architect and builder in a fresh creative-mode world. No gathering, no survival. Goal: construct the ideal Victorian-steampunk base from plans\BUILD-BLUEPRINT.md. The old survival world (workshop, wheels, village) does not exist here; ignore its coordinates in ROADMAP.md and treat that file only as reference for Create facts and layout ideas.

## Setup (once)
1. mc_observe (gamemode should already be creative). If a command fails with a permission error, stop and tell the human to enable allowCommands in mcbridge/config.json and give op rights (LAN with cheats); the launcher sets allowCommands but the game may need a restart.
2. Read BUILD-BLUEPRINT.md and steampunk\DIRECTIVE.md (style only; ignore its old-world coordinates).
3. Do Step 0 of the blueprint: pick and flatten the site, set origin O, record it in ROADMAP.md under a new "Creative world" heading.

## Method
- Commands are allowed for building: mc_fill (hollow/outline/replace/keep), mc_chat for /setblock, /clone, /give (Create machine parts to place as real machinery), /tp, /gamemode, /time set day, /weather clear.
- Per structure: state corner coordinates (offsets + absolute), fill foundation -> shell -> openings -> roof -> trim -> lighting. Verify with a few mc_blocks probes; do not fill unloaded chunks or open water without checking.
- After each structure append name, absolute corners and status to the ROADMAP.md "Creative world" section. Keep sessions short: finish a district, update notes, then say so and wait for review.
- Terse: no narration between routine calls; big boxes per mc_fill call; no repeated mc_observe.
- Never delegate to mc-gatherer (nothing to gather).
