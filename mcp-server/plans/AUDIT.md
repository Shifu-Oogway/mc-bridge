# AUDIT – Creative world steampunk settlement (2026-11-03)

Scope: the NEW creative world ("Claude Creative" save), origin O = (-228, 71, 150). The old survival world in ROADMAP.md is out of scope.

## 1. Environment (verified)
| Item | Value | Evidence |
|---|---|---|
| Minecraft | 1.21.1 | mc_instances |
| Loader | NeoForge 21.1.219 | minecraftinstance.json |
| Modpack | Create: Perfect World – Post Production (Better FPS), 116 mod jars | instance mods folder |
| Create | 6.0.9 (`create-1.21.1-6.0.9.jar`) | mods folder |
| Create addons present | Central Kitchen 2.2.6, Confectionery 1.1.2, Dragons Plus 1.8.7, Enchantment Industry 2.3.0, Stuff Additions 2.1.0e, Hypertube 0.4.0, Oxidized 0.1.3, Power Loader 2.0.3, Rustic Structures 1.0.0, Vibrant Vaults 0.3.2, Liquid Fuel 2.1.1, Railways Navigator 0.8.5, Ornithopter Glider, Escalated 1.2.1, Encased 1.8, Slice&Dice 4.2.2, Create Deco 2.1.2, Design n Decor 2.1.0, Copycats 3.0.4, Stam1o Create Tweaks, Sophisticated Backpacks Create integration | mods folder |
| Other relevant mods | Farmer's Delight 1.2.10, Storage Drawers 13.11.4, Macaw's doors/fences/trapdoors/bridges, Chipped, Torchmaster, Jade, JEI+EMI, ReplayMod (reforgedplaymod), Freecam | mods folder |
| Game mode | Creative | mc_observe |
| Difficulty | **Peaceful** | `/difficulty` reply |
| Commands | allowed (mcbridge allowCommands=true; cheats on) | mc_instances `commandsAllowed: true` |
| Build authorization | BUILD-DIRECTIVE.md (steampunk folder) authorizes command building, /give of Create parts, creative session. No gathering. | file |
| Simulation distance | 8 chunks (render 12) | options.txt; `/data get` at x-191 returned "not loaded" with player at (-273,82,121) |
| Create stress config | water_wheel 32 SU/rpm, fan 2, press 8, mixer 4, millstone 4, saw 4, crushing wheel 8, harvester n/a (contraption); harvesterReplants=true; fanProcessingTime 150 t; fanPushDistance 20 @ argmax 256 rpm | config/create-server.toml |
| Fan catalysts (jar tags) | blasting: lava / flowing lava, blaze_burner; smoking: fire, campfire, blaze burner; splashing: water; haunting: soul fire/campfire | create jar data/create/tags |
| Recipes checked | milling wheat → flour (+25% extra, +25% seeds), 150 t; mixing flour + 1000 mB water → dough | create jar recipes |
| Recipe changes | UNVERIFIED (no KubeJS/CraftTweaker folder found; mod `Stam1oCreateTweaks` may alter something – not inspected) | |
| Backup | Hot copy `D:\Minecraft\mc-bridge\backups\Claude Creative-20261103-142912-hotcopy` (13 MB). `/save-all` is not available in this singleplayer client, so this copy was taken while the world was open and is **not guaranteed consistent**. For a clean backup: Save & Quit, then copy the save folder. | cp log |
| Spectator/recording | ReplayMod present (`replay_recordings/raw`, `recording`); Freecam present. Not touched. | folders |

Unknowns: exact Stam1o tweak effects; whether Farmer's Delight crops work with Create harvesters (vanilla crops do); villagers/animals in the world (none placed by me; none seen within 16 blocks of the player).

## 2. Building inventory (all built by me this session with /fill, /clone and /setblock)
Function key: SHELL = empty building; DECOR = machine blocks placed but no power or I/O; MANUAL = works with manual input; AUTO = full automation.

| ID | Structure | Corners (abs) | Purpose now | Materials | Interior | Machinery & live evidence | Function | Faults | Action |
|---|---|---|---|---|---|---|---|---|---|
| S1 | Main Street + rail spine | x-288..-158, z150..157, y70 | road, 2 unconnected rails | stone bricks, gravel, blackstone, rails | n/a | none | n/a | rails dead-end, no carts | KEEP |
| B1 | Engine Hall (powerhouse) | x-228..-198, z124..142, y70..81 | power | stone brick, deepslate base, dark oak, glass | flowing channel, 4 wheels, shaft line, lanterns | `/data` gearbox (-201,71,131): **Speed 8.0, Capacity 1024, Stress 0, network size 37**; wheel FlowScore 1 | **real power source, but nothing consumes it** | no output leaves the hall; no controls; no stair (ladder only) | **EXTEND**: export power to the foundry (vertical slice) |
| B2 | HQ Tower | x-267..-253, z123..137, y71..114 | landmark / manor stand-in | stone brick, dark oak, copper dome | 6 empty plank floors, ladder, lanterns | 12 cogwheels on east wall: `/data` Speed 0.0 → DECOR | SHELL | no furniture, no stairs | RETROFIT later: planning office, living floors |
| B3 | Catwalk HQ→hall | x-253..-230, z131..135, y77 | access | spruce, iron bars | n/a | none | n/a | none | KEEP |
| B4 | Workshop | x-194..-180, z126..138 | machine hall | stone brick, dark-oak gable | mixer+basin, press+depot, shaft line | not loaded from player position (UNVERIFIED live); no shaft is connected to any source → DECOR by construction | DECOR | no power, no I/O | RETROFIT later (press line) |
| B5 | Foundry | x-228..-194, z162..186 | ore processing | stone brick, deepslate, blackstone furnace | crushing wheels, depots + cauldrons, sealed lava furnace prop | crushing wheel (-222,72,172) `/data` Speed 0.0 → DECOR | DECOR | no power, no feed, furnace is a prop | **RETROFIT (vertical slice)**: real fan-blasting line |
| B6 | Warehouse | x-278..-252, z162..184 | storage | stone brick, spruce floor, copper cupola | ~180 empty barrels, 36 empty chests (UNVERIFIED contents = empty because placed by /fill) | none | MANUAL storage only | no receiving/routing | RETROFIT phase 3: receiving belt + filtered funnels into vaults |
| B7 | Rail station | x-178..-158, z144..162 | transit | stone, dark oak, iron bars | benches, lanterns | none | n/a | sidings unswitched | KEEP |
| B8 | Sawmill | x-288..-276, z92..102 | timber | spruce frame | mechanical saw (-282,71,97) `/data` Speed 0.0 | DECOR | DECOR | no power, no feed | RETROFIT phase 4 |
| B9 | Greenhouse | x-272..-258, z92..104 | crops | glass, dark oak | carrots/beetroot, water channel | none | MANUAL farm (hand harvest) | none | RETROFIT phase 5 (harvester) |
| B10 | Farm terraces | x-288..-256, z105..116 | wheat/potato/carrot | stone brick, farmland | water channels | none | MANUAL farm | not a building | EXTEND phase 2: mill + harvester (grain mill) |
| B11 | Smokestacks x6, tanks x2, gear wall | see ROADMAP | skyline | brick, stone | campfires for smoke | gear wall cogs DECOR | n/a | decorative only – must not be reported as machinery | KEEP (label decor) |

Before images: the bridge has no screenshot capability (capabilities: observe, terrain, find, blocks, look, move, goto, stop, interact, hotbar, chat, screen, click, craft). Evidence is block probes and `/data get block` NBT readouts. ReplayMod could record, but I won't start recordings myself.

## 3. Findings
1. Only one real Create system exists: the engine hall water-wheel network (8 RPM, 1024 SU, unused).
2. Every other "machine" is unpowered decor (Speed 0.0 measured on the crusher, saw and HQ cogs).
3. No building has a production chain with input → power → process → transport → storage.
4. Architecture is consistent (stone base, dark timber, glass bands) but the interiors are mostly empty boxes.
5. Distant districts are outside simulation distance from parts of the site. Production must be force-loaded, or the player must be near it.
