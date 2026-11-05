// Quarry on the user's spruce-log outline x357..381, z747..781 (sign at 370,79,773). The north half is a valley
// (y57..69, with a gully at x364..374 z754..760); from z762 the ground climbs to a plateau at y78.
// User choices: mostly yard with a small terraced cut, sheds matching the sawmill (open dark oak, blackstone roof),
// a working crusher house, a drill rig, a derrick crane, rails with a spur towards town, and power from a water wheel +
// its own steam engine (crusher) and a windmill on the plateau (drill rig).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CellMap } from "./cellmap.ts";

const T = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "plans", "medieval", "preview", "terrain-quarry.json"), "utf8"));
const ground = (x: number, z: number) => T.h[z - T.z1]?.[x - T.x1] ?? 70;

const m = new CellMap();
const Y = 66; // yard surface block; stand at y67
const POST = "minecraft:dark_oak_log", BEAM = "minecraft:dark_oak_wood", PLANK = "minecraft:dark_oak_planks",
  PDS = "minecraft:polished_deepslate", DSB = "minecraft:deepslate_bricks", AIR = "minecraft:air", FENCE = "minecraft:dark_oak_fence",
  SB = "minecraft:stone_bricks", CU = "minecraft:waxed_weathered_cut_copper",
  RS = (f: string) => `minecraft:polished_blackstone_brick_stairs[facing=${f},half=bottom]`, RFULL = "minecraft:polished_blackstone_bricks",
  RSLAB = "minecraft:polished_blackstone_brick_slab[type=bottom]", BARGE = (f: string) => `minecraft:dark_oak_stairs[facing=${f},half=bottom]`,
  CORBEL = (f: string) => `minecraft:dark_oak_stairs[facing=${f},half=top]`;
const ROCK = (x: number, y: number, z: number) => { const h = ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0; const r = h % 10;
  return r < 5 ? "minecraft:stone" : r < 7 ? "minecraft:andesite" : r < 9 ? "minecraft:cobblestone" : "minecraft:tuff"; };
const YARD = (x: number, z: number) => { const r = (((x * 31) ^ (z * 17)) >>> 0) % 7; return r < 3 ? "minecraft:coarse_dirt" : r < 5 ? "minecraft:gravel" : r < 6 ? "minecraft:andesite" : "minecraft:packed_mud"; };

// ---------- earthworks: yard (z747..765, y66), bench (z766..770, y72), rock face at z771 up to the plateau ----------
for (let x = 357; x <= 381; x++) {
  for (let z = 747; z <= 765; z++) { m.fill(x, 56, z, x, Y - 1, z, "minecraft:stone"); m.set(x, Y, z, YARD(x, z)); m.fill(x, Y + 1, z, x, 92, z, AIR); }
  for (let z = 766; z <= 770; z++) { for (let y = 60; y <= 72; y++) m.set(x, y, z, ROCK(x, y, z)); m.fill(x, 73, z, x, 92, z, AIR); }
  for (let y = 73; y <= 78; y++) m.set(x, y, 771, ROCK(x, y, 771));
}
// Side walls of the cut: rock up to the natural ground where it stands above the yard / bench.
for (const x of [356, 382]) for (let z = 747; z <= 771; z++) {
  const top = Math.min(78, ground(x, z)), base = z >= 766 ? 73 : Y + 1;
  for (let y = 56; y <= top; y++) m.set(x, y, z, y < base ? "minecraft:stone" : ROCK(x, y, z));
}

// ---------- rail: bench -> ramp -> yard -> crusher, T-junction with a spur north towards town ----------
for (let z = 768; z <= 770; z++) m.set(364, 73, z, "minecraft:rail[shape=north_south]");
for (let z = 762; z <= 767; z++) { const y = 67 + (z - 762); m.set(364, y - 1, z, SB); m.set(364, y, z, "minecraft:rail[shape=ascending_south]"); m.fill(364, y + 1, z, 364, 75, z, AIR); }
for (let z = 749; z <= 761; z++) m.set(364, 67, z, "minecraft:rail[shape=north_south]");
m.set(364, 67, 748, "minecraft:rail[shape=south_east]"); m.set(363, 67, 748, "minecraft:lever[face=floor,facing=north,powered=false]");
for (let x = 365; x <= 379; x++) m.set(x, 67, 748, "minecraft:rail[shape=east_west]");
m.set(380, 67, 748, PDS); m.set(380, 68, 748, FENCE); m.set(380, 69, 748, "minecraft:lantern");
for (let z = 741; z <= 747; z++) { m.set(364, 66, z, z < 747 ? PLANK : YARD(364, z)); m.set(364, 67, z, "minecraft:rail[shape=north_south]"); m.fill(364, 68, z, 364, 70, z, AIR);
  if (z < 747 && z % 3 === 0) for (const x of [363, 365]) { m.fill(x, 58, z, x, 66, z, POST); m.set(x, 67, z, FENCE); } }
m.set(364, 66, 740, PDS); m.set(364, 67, 740, FENCE); m.set(364, 68, 740, "minecraft:lantern");

// ---------- power house + crusher: open shed x372..383 z749..759 (matches the sawmill) ----------
const X0 = 372, X1 = 383, Z0 = 749, Z1 = 759, TOP = 76, PX = [372, 376, 380, 383], PZ = [749, 752, 756, 759];
for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) {
  const edge = x === X0 || x === X1 || z === Z0 || z === Z1;
  m.fill(x, 56, z, x, Y - 1, z, "minecraft:stone"); m.set(x, Y, z, edge ? DSB : "minecraft:polished_andesite"); m.fill(x, Y + 1, z, x, 92, z, AIR);
  if (!edge) continue;
  const post = (PX.includes(x) && (z === Z0 || z === Z1)) || (PZ.includes(z) && (x === X0 || x === X1));
  if (post) { m.set(x, Y + 1, z, PDS); m.fill(x, Y + 2, z, x, TOP - 1, z, POST); }
  else if (!(z === Z0 && x >= 377 && x <= 379) && !(x === X0 && z >= 753 && z <= 755)) m.set(x, Y + 1, z, FENCE);
}
for (const x of PX) for (const z of [Z0, Z1]) for (const s of [-1, 1]) if (x + s > X0 && x + s < X1) m.set(x + s, TOP - 1, z, CORBEL(s < 0 ? "east" : "west"));
for (const z of PZ) for (const x of [X0, X1]) for (const s of [-1, 1]) if (z + s > Z0 && z + s < Z1) m.set(x, TOP - 1, z + s, CORBEL(s < 0 ? "south" : "north"));
m.ring(X0, TOP, Z0, X1, Z1, BEAM);
for (const x of [376, 380]) m.fill(x, TOP, Z0 + 1, x, TOP, Z1 - 1, "minecraft:dark_oak_log[axis=z]");
for (let r = 0; ; r++) {
  const zn = Z0 - 1 + r, zs = Z1 + 1 - r, y = TOP + 1 + r;
  if (zn === zs) { m.fill(X0 - 1, y, zn, X1 + 1, y, zn, RFULL); m.fill(X0 - 1, y + 1, zn, X1 + 1, y + 1, zn, RSLAB);
    for (const x of [X0 - 1, X1 + 1]) m.set(x, y, zn, PLANK); break; }
  m.fill(X0 - 1, y, zn, X1 + 1, y, zn, RS("south")); m.fill(X0 - 1, y, zs, X1 + 1, y, zs, RS("north"));
  for (const x of [X0 - 1, X1 + 1]) { m.set(x, y, zn, BARGE("south")); m.set(x, y, zs, BARGE("north")); }
  for (const x of [X0, X1]) for (let z = zn + 1; z < zs; z++) m.set(x, y, z, z === 754 ? POST : PLANK);
}
for (const x of [X0, X1]) m.set(x, 79, 754, "minecraft:waxed_weathered_copper_grate");

// Boiler: 2x2x2 tank on four blaze burners; steam engine on its east face. CLICK THE ENGINE WITH A SHAFT in game to make
// its powered shaft (378,68,755). Water wheel, engine, pump and crusher share one network (the wheel starts the pump).
m.fill(374, 67, 755, 375, 67, 756, "create:blaze_burner[blaze=smouldering]");
m.fill(374, 68, 755, 375, 69, 756, "create:fluid_tank");
m.set(376, 68, 755, "create:steam_engine[facing=east,face=wall]"); m.set(378, 68, 755, "create:powered_shaft[axis=y]");
m.fill(373, 65, 755, 377, 65, 755, "create:shaft[axis=x]"); m.set(378, 65, 755, "create:gearbox[axis=z]");
m.fill(378, 66, 755, 378, 67, 755, "create:shaft[axis=y]"); m.set(378, 69, 755, "create:shaft[axis=y]");
m.set(378, 70, 755, "create:gearbox[axis=x]"); m.set(378, 70, 754, "create:shaft[axis=z]"); m.set(378, 70, 753, "create:gearbox[axis=y]");
m.set(379, 70, 753, "create:shaft[axis=x]");
// Crusher: two wheels (axis z) with a one-block gap; gearboxes on either end of a short shaft reverse one wheel.
m.fill(379, 67, 755, 383, 69, 757, SB);
m.set(380, 70, 753, "create:gearbox[axis=y]"); m.set(381, 70, 753, "create:shaft[axis=x]"); m.set(382, 70, 753, "create:gearbox[axis=y]");
m.set(380, 70, 754, "create:shaft[axis=z]"); m.set(382, 70, 754, "create:shaft[axis=z]");
m.set(380, 70, 755, "create:crushing_wheel[axis=z]"); m.set(382, 70, 755, "create:crushing_wheel[axis=z]");
m.set(381, 72, 755, "create:andesite_funnel[facing=down,extracting=true]"); m.set(381, 73, 755, "minecraft:chest[facing=north]");
m.set(381, 69, 755, "minecraft:hopper[facing=north]"); m.set(381, 69, 754, "minecraft:chest[facing=north]");
for (let x = 379; x <= 383; x++) for (let z = 753; z <= 757; z++) if (!(x === 381 && z === 755) && !m.get(x, 72, z)) m.set(x, 72, z, "minecraft:dark_oak_slab[type=top]");
m.fill(383, 70, 757, 383, 72, 757, SB); m.fill(383, 67, 758, 383, 72, 758, "minecraft:ladder[facing=south]");
for (const x of [379, 383]) m.set(x, 73, 753, FENCE);
// Stack beside the boiler with copper bands and a signal-fire plume; fuel chest for the burners.
for (let y = 67; y <= 86; y++) m.set(376, y, 757, (y - 67) % 6 === 5 ? "minecraft:waxed_weathered_copper" : "minecraft:bricks");
m.set(376, 86, 757, "minecraft:hay_block"); m.set(376, 87, 757, "minecraft:campfire[lit=true,signal_fire=true,facing=north]");
m.set(373, 67, 754, "minecraft:chest[facing=east]"); m.set(377, 67, 758, "minecraft:barrel[facing=up]");
for (const [x, z] of [[374, 752], [378, 757], [381, 751]]) m.set(x, TOP - 1, z, "minecraft:lantern[hanging=true]");

// ---------- water: a spring reservoir under the face feeds a channel over a small water wheel ----------
m.fill(367, 64, 751, 370, 65, 761, "minecraft:stone");
m.fill(368, 66, 759, 369, 66, 760, "minecraft:water"); m.fill(369, 66, 752, 369, 66, 758, AIR); // flows from the reservoir (sources only there)
m.fill(367, 66, 758, 367, 66, 761, SB); m.fill(368, 66, 761, 370, 66, 761, SB); m.set(370, 66, 760, SB); m.set(368, 66, 758, SB);
for (let z = 751; z <= 757; z++) { m.set(368, 66, z, SB); m.set(370, 66, z, SB); } m.set(369, 66, 751, SB);
m.set(369, 65, 755, "create:water_wheel[facing=east]"); m.fill(370, 65, 755, 371, 65, 755, "create:shaft[axis=x]");
m.set(372, 65, 755, "create:large_cogwheel[axis=x]");
// Boiler water: pump (meshed with the large cog = double speed) from the reservoir into the boiler.
const PIPE = (dirs: string[]) => `create:fluid_pipe[${["north", "south", "east", "west", "up", "down"].map((d) => `${d}=${dirs.includes(d)}`).join(",")}]`;
m.set(370, 66, 759, PIPE(["west", "east"])); m.set(371, 66, 759, PIPE(["west", "south"]));
m.fill(371, 66, 757, 371, 66, 758, PIPE(["north", "south"])); m.set(371, 66, 756, PIPE(["north", "east", "south"]));
m.set(372, 66, 756, "create:mechanical_pump[facing=east]");
// Second pump on the other upper diagonal of the large cog: two pumps at 16 RPM give the boiler the 16 supply it needs
// to start from the water wheel alone (8 RPM); once the engine runs the whole network speeds up.
m.set(371, 66, 755, PIPE(["north", "south"])); m.set(371, 66, 754, PIPE(["south", "east"]));
m.set(372, 66, 754, "create:mechanical_pump[facing=east]");
m.set(373, 66, 754, PIPE(["west", "south"])); m.set(373, 66, 755, PIPE(["north", "up"])); m.set(373, 67, 755, PIPE(["up", "down"])); m.set(373, 68, 755, PIPE(["down", "east"]));
m.set(373, 66, 756, PIPE(["west", "up"])); m.set(373, 67, 756, PIPE(["up", "down"])); m.set(373, 68, 756, PIPE(["down", "east"]));

// Windmill tower (x376..378 z774..776) with the bearing facing north; sails on a hub in front (z773). RIGHT-CLICK THE
// BEARING to assemble the sails.
for (let x = 376; x <= 378; x++) for (let z = 774; z <= 776; z++) {
  if (x === 377 && z === 775) continue;
  const corner = (x === 376 || x === 378) && (z === 774 || z === 776);
  m.fill(x, 79, z, x, 85, z, corner ? POST : PLANK);
}
m.set(377, 81, 774, "minecraft:glass_pane"); m.set(377, 82, 774, "minecraft:glass_pane");
m.set(377, 86, 774, "create:windmill_bearing[facing=north]");
for (const [x, z] of [[376, 774], [378, 774], [376, 775], [378, 775], [376, 776], [378, 776]]) m.set(x, 86, z, "minecraft:dark_oak_slab[type=bottom]");
m.set(378, 87, 776, "minecraft:lantern");
m.set(377, 86, 773, POST);
const SAIL = "create:white_sail[facing=north]";
m.fill(377, 87, 773, 378, 91, 773, SAIL); m.fill(378, 85, 773, 382, 86, 773, SAIL); m.fill(376, 81, 773, 377, 85, 773, SAIL); m.fill(372, 86, 773, 376, 87, 773, SAIL);
m.set(377, 86, 773, POST); m.set(377, 85, 773, SAIL); m.set(378, 86, 773, SAIL);

// ---------- drilldown pit on the plateau: 7x7 pit (x363..369 z773..779), 1 deep for now, under a timber headframe ----------
// A 7x7 drill head (drills facing down on an andesite casing deck) hangs from a rope pulley in the headframe. The
// windmill turns the pulley through a clutch; the lever keeps the clutch OPEN (powered) so the head stays put. Releasing
// the clutch lowers the head and the drills cut the pit deeper, 7x7 at a time.
const PX0 = 363, PX1 = 369, PZ0 = 773, PZ1 = 779, RIM = 78, FY = 79, FTOP = 88;
for (let x = PX0 - 1; x <= PX1 + 1; x++) for (let z = PZ0 - 1; z <= PZ1 + 1; z++) {
  const pit = x >= PX0 && x <= PX1 && z >= PZ0 && z <= PZ1;
  m.fill(x, RIM - 3, z, x, RIM - 2, z, "minecraft:stone");
  if (pit) { m.set(x, RIM - 1, z, ROCK(x, RIM - 1, z)); m.set(x, RIM, z, AIR); } // pit floor y77, open at y78
  else m.set(x, RIM, z, SB); // stone-brick kerb around the pit
  m.fill(x, FY, z, x, 92, z, AIR);
}
// Kerb walls inside the pit: cracked/mossy stone bricks lining the 1-deep cut.
for (let x = PX0; x <= PX1; x++) for (const z of [PZ0, PZ1]) m.set(x, RIM - 1, z, (x + z) % 3 ? ROCK(x, RIM - 1, z) : "minecraft:cracked_stone_bricks");
// Headframe: four corner legs on deepslate pads at the kerb corners, braced, with a beam ring and cross beams on top.
const LEGS: [number, number][] = [[PX0 - 1, PZ0 - 1], [PX1 + 1, PZ0 - 1], [PX0 - 1, PZ1 + 1], [PX1 + 1, PZ1 + 1]];
for (const [x, z] of LEGS) { m.set(x, RIM, z, PDS); m.fill(x, FY, z, x, FTOP - 1, z, POST); }
for (const y of [FY + 3, FTOP]) { // a mid girt and the top ring
  m.fill(PX0 - 1, y, PZ0 - 1, PX1 + 1, y, PZ0 - 1, "minecraft:dark_oak_log[axis=x]"); m.fill(PX0 - 1, y, PZ1 + 1, PX1 + 1, y, PZ1 + 1, "minecraft:dark_oak_log[axis=x]");
  m.fill(PX0 - 1, y, PZ0, PX0 - 1, y, PZ1, "minecraft:dark_oak_log[axis=z]"); m.fill(PX1 + 1, y, PZ0, PX1 + 1, y, PZ1, "minecraft:dark_oak_log[axis=z]");
}
m.fill(PX0 - 1, FY + 3, PZ0 + 2, PX0 - 1, FY + 3, PZ0 + 4, AIR); // walk-in gap in the west girt
m.fill(PX0, FTOP, 776, PX1, FTOP, 776, "minecraft:dark_oak_log[axis=x]"); m.fill(366, FTOP, PZ0, 366, FTOP, PZ1, "minecraft:dark_oak_log[axis=z]");
for (const [x, z] of LEGS) {
  const sx = x < 366 ? 1 : -1, sz = z < 776 ? 1 : -1;
  m.set(x + sx, FTOP - 1, z, CORBEL(sx > 0 ? "east" : "west")); m.set(x, FTOP - 1, z + sz, CORBEL(sz > 0 ? "south" : "north"));
  m.set(x + sx, FY + 2, z, CORBEL(sx > 0 ? "east" : "west")); m.set(x, FY + 2, z + sz, CORBEL(sz > 0 ? "south" : "north"));
}
// Railing on the kerb with a gap and steps down on the west side.
for (let x = PX0 - 1; x <= PX1 + 1; x++) for (let z = PZ0 - 1; z <= PZ1 + 1; z++) {
  const edge = x === PX0 - 1 || x === PX1 + 1 || z === PZ0 - 1 || z === PZ1 + 1;
  if (edge && !m.get(x, FY, z) && !(x === PX0 - 1 && z >= 775 && z <= 777)) m.set(x, FY, z, FENCE);
}
m.set(PX0, RIM, 776, "minecraft:stone_brick_stairs[facing=east,half=bottom]");
// Drill head: 7x7 drills facing down at y80 (two above the pit floor, so nothing is cut until it is lowered), casing deck
// above, pulley magnet, rope and the rope pulley under the cross beam.
m.fill(PX0, 80, PZ0, PX1, 80, PZ1, "create:mechanical_drill[facing=down]");
m.fill(PX0, 81, PZ0, PX1, 81, PZ1, "create:andesite_casing");
m.set(366, 82, 776, "create:pulley_magnet"); m.fill(366, 83, 776, 366, 86, 776, "create:rope"); m.set(366, 87, 776, "create:rope_pulley[axis=x]");
for (const [x, z] of [[PX0, PZ0], [PX1, PZ0], [PX0, PZ1], [PX1, PZ1]]) m.set(x, 82, z, "minecraft:lantern");
// Roof over the headframe: blackstone gable along x, matching the sheds.
for (let r = 0; ; r++) {
  const zn = PZ0 - 2 + r, zs = PZ1 + 2 - r, y = FTOP + 1 + r;
  if (zn === zs) { m.fill(PX0 - 2, y, zn, PX1 + 2, y, zn, RFULL); m.fill(PX0 - 2, y + 1, zn, PX1 + 2, y + 1, zn, RSLAB); break; }
  m.fill(PX0 - 2, y, zn, PX1 + 2, y, zn, RS("south")); m.fill(PX0 - 2, y, zs, PX1 + 2, y, zs, RS("north"));
  for (const x of [PX0 - 2, PX1 + 2]) { m.set(x, y, zn, BARGE("south")); m.set(x, y, zs, BARGE("north")); }
  for (const x of [PX0 - 1, PX1 + 1]) for (let z = zn + 1; z < zs; z++) if (y > FTOP) m.set(x, y, z, z === 776 ? POST : PLANK);
}
m.set(PX1 + 1, 90, 776, "minecraft:waxed_weathered_copper_grate"); m.set(PX0 - 1, 90, 776, "minecraft:waxed_weathered_copper_grate");
// Drive from the windmill: gearboxes behind the bearing turn west along y86 z776, through a clutch, into the pulley.
m.set(377, 86, 775, "create:gearbox[axis=y]"); m.set(377, 86, 776, "create:gearbox[axis=y]");
m.fill(367, 86, 776, 376, 86, 776, "create:shaft[axis=x]");
m.set(373, 86, 776, "create:clutch[axis=x,powered=true]"); m.set(373, 85, 776, PLANK);
m.set(373, 85, 777, "minecraft:lever[face=wall,facing=south,powered=true]");
m.fill(371, 85, 775, 375, 85, 775, "minecraft:dark_oak_slab[type=top]"); m.fill(371, 85, 777, 372, 85, 777, "minecraft:dark_oak_slab[type=top]");
m.fill(374, 85, 777, 375, 85, 777, "minecraft:dark_oak_slab[type=top]");
for (const x of [371, 375]) m.fill(x, 79, 776, x, 85, 776, POST);
m.fill(378, 79, 777, 378, 85, 777, "minecraft:ladder[facing=south]");

// ---------- derrick crane (west side of the yard) ----------
m.fill(359, Y, 763, 361, Y, 765, PDS); m.fill(360, 67, 764, 360, 84, 764, POST);
m.fill(360, 82, 765, 360, 82, 769, "minecraft:dark_oak_log[axis=z]"); m.fill(360, 84, 765, 360, 84, 767, "minecraft:chain[axis=z]");
m.set(360, 83, 768, "minecraft:chain[axis=y]"); m.set(360, 83, 765, CORBEL("north"));
m.fill(360, 77, 769, 360, 81, 769, "minecraft:chain[axis=y]"); m.set(360, 76, 769, "minecraft:cobblestone");
m.set(361, 70, 764, "create:large_cogwheel[axis=x]"); m.set(362, 70, 764, "create:hand_crank[facing=east]");
for (const [x, z] of [[358, 762], [362, 762], [358, 766]]) m.set(x, 67, z, FENCE);

// ---------- yard dressing: stone stacks, piles, lamp posts ----------
for (const [x, y, z, b] of [[358, 67, 750, SB], [359, 67, 750, SB], [358, 68, 750, SB], [358, 67, 751, SB], [359, 67, 751, "minecraft:stone_brick_slab[type=bottom]"],
  [361, 67, 756, "minecraft:cobblestone"], [362, 67, 756, "minecraft:cobblestone"], [361, 68, 756, "minecraft:cobblestone_slab[type=bottom]"], [361, 67, 757, "minecraft:cobblestone"],
  [366, 67, 752, "minecraft:gravel"], [366, 67, 751, "minecraft:gravel"], [366, 68, 752, "minecraft:gravel"], [358, 67, 759, "minecraft:barrel[facing=up]"],
  [359, 67, 759, "minecraft:chest[facing=east]"], [366, 67, 760, "minecraft:andesite"], [366, 67, 761, "minecraft:andesite_slab[type=bottom]"]] as [number, number, number, string][]) m.set(x, y, z, b);
for (const [x, z] of [[357, 747], [381, 747], [357, 765], [370, 764]]) { m.fill(x, 67, z, x, 69, z, FENCE); m.set(x, 70, z, "minecraft:lantern"); }

// ---------- KEEP: the user's own additions and live machinery (plans/medieval/preview/keep-quarry.json) ----------
// Re-placing must not touch these: the user's pit -> sorter -> crusher / minecart belts, gearshift and levers, the pit as
// drilled deeper, the assembled windmill sails and drill head (now contraptions), and the crusher controller.
const KEEP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "plans", "medieval", "preview", "keep-quarry.json");
if (fs.existsSync(KEEP)) for (const k of JSON.parse(fs.readFileSync(KEEP, "utf8")) as { pos: [number, number, number] }[]) m.del(...k.pos);

export const blueprint = () => m.toBlueprint("quarry", "Quarry", "Quarry yard with terraced cut, crusher house on steam + water wheel, drill rig on a windmill, crane and rails",
  ["In game: click the steam engine with a shaft (powered shaft at 378,68,755), right-click the windmill bearing (377,86,774).",
   "Blaze burners need fuel (chest at 373,67,754)."]);
export const origin = () => m.origin();
