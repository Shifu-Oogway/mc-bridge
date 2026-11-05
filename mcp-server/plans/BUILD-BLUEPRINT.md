# Build Blueprint – the ideal Steampunk base (NEW creative world)

This is a fresh world. The old survival world's coordinates, workshop, wheels and village DO NOT exist here; ROADMAP.md describes that other world and is only a source of ideas (Create facts, machine layouts).
Convention: x east, z south, y up. Every position below is an OFFSET from the origin O = (Ox, Oy, Oz) chosen in step 0.

## Step 0 – choose the site and origin
- Find a large flat, dry, loaded area at least 160 (x) by 120 (z) blocks, near spawn, ideally with a river or lake on one edge (for water wheels) and no big ocean. Use mc_observe, mc_terrain and mc_find_blocks; fly/tp around with /tp if needed.
- If the terrain is uneven, flatten the footprint with mc_fill: replace tall blocks with air above Oy and fill below with dirt/stone up to Oy-1. Make a stone_bricks or grass top surface at y = Oy-1 (stand at Oy).
- Write O and the site bounds into ROADMAP.md (new "Creative world" section) before building anything.

## Palette
Frame: spruce / dark_oak logs. Walls: stone_bricks over a cobblestone/deepslate_bricks base course. Accents: cut_copper family (use weathering stages), brass-look = yellow/gold blocks or create:brass_casing (give via /give is allowed in this creative session). Roofs: dark_oak and spruce stairs/slabs, copper roofs. Glass: glass panes in iron_bars or dark_oak grids. Lights: lanterns, soul lanterns, chains. Details: Create shafts/cogwheels/gearboxes/belts/water wheels placed as REAL visible machinery (you may /give Create items), barrels, grindstones, fences, trapdoors.

## Districts (offsets from O; x east, z south). Leave 1-wide gaps/trunk lines for future belts.
1. **Main Street + Rail Spine**: promenade z O+0..+7 from x O-60 to O+70 (stone-brick road, gravel lanes, rails on a central dark bed, lamp posts every 6 blocks). Everything else hangs off it.
2. **Power District / Engine Hall** (x O+0..+30, z O-26..-8): roofed brick hall around a row of water wheels fed by a water channel (river side), a long exposed shaft line with cogs and gearboxes, two 3x3 hollow smokestacks 18 high on the hall roof.
3. **Central HQ Tower** (x O-40..-24, z O-30..-12): 13x13 podium, 5-6 floors with glass bands, brass-dome clock top, ~y O..O+38, grand entrance stairs on the south side facing the street.
4. **Workshop / Mechanical Hall** (x O+34..+48, z O-24..-12): 15x12 hall, gabled dark_oak roof, crane/gantry detail, press and mixer lines visible through windows.
5. **Foundry & Ore Processing** (x O+0..+34, z O+12..+36): crushing hall, washing line, foundry with oversized furnace silhouette and 2 chimneys (24 high).
6. **Storage & Distribution** (x O-50..-24, z O+12..+34): warehouse with loading docks onto the street, stacked chest/barrel halls.
7. **Rail Station** (x O+50..+70, z O-4..+12): iron-truss platform roof (iron_bars + dark_oak), clock, two sidings.
8. **Woodworking + Agriculture** (x O-60..-26, z O-60..-34): sawmill, glass greenhouse, farm terraces.
9. **Advanced Manufacturing** (x O+0..+40, z O+44..+70): later phase, reserve land only.
10. **Skyline layer**: 5–7 smokestacks (16–30 high, varied), catwalk bridges at y O+9 linking HQ, workshop and engine hall, rooftop water tanks, exposed gear walls, banners.

## Build order (one structure per step; record corners in ROADMAP.md)
0 site + origin -> 1 street/rail -> 2 engine hall (+ working water wheels/shaft line if the river allows) -> 3 HQ tower -> 4 catwalks to hall -> 5 workshop -> 6 foundry -> 7 storage -> 8 station -> 9 woodworking/farm -> 10 smokestacks + skyline -> 11 lighting and detail pass.

## Per-structure recipe
survey -> foundation (fill) -> shell (`hollow`) -> openings (`replace` with glass/air, windows every 3 blocks) -> corner pillars + base course + cornice -> roof (stairs/slabs, overhang) -> lighting -> one visible mechanical detail -> verify with mc_blocks probes. Use /clone to repeat bays and symmetric halves.
