#!/usr/bin/env node
// MCP server for mc-bridge. Version/loader-agnostic: it only speaks the bridge protocol over
// localhost HTTP, so the same server works with any game adapter that implements it.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Game directories that may contain mcbridge/connection.json. */
function candidateGameDirs() {
  const env = process.env.MCBRIDGE_DIRS;
  if (env) return env.split(path.delimiter).filter(Boolean);
  const dirs = [path.resolve(HERE, "..", "run")]; // the dev client
  const instances = path.join(os.homedir(), "curseforge", "minecraft", "Instances");
  try {
    for (const e of fs.readdirSync(instances, { withFileTypes: true })) {
      if (e.isDirectory()) dirs.push(path.join(instances, e.name));
    }
  } catch { /* no CurseForge install */ }
  return dirs;
}

async function call(conn, route, timeoutMs = 4000, body = undefined) {
  const res = await fetch(`http://${conn.host}:${conn.port}${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`bridge ${route} -> HTTP ${res.status}: ${out.error ?? "unknown error"}`);
  return out;
}

/** World actions close any open screen first (inventory, container, crafting table), as a player presses Esc. */
async function closeScreen(conn) {
  const o = await call(conn, "/observe");
  if (!o.screen) return false;
  await call(conn, "/screen", 4000, { action: "close" });
  return true;
}

/** Open sky above `feet` (nothing solid for 40 blocks above the head; leaves and logs don't count): truly outside. */
async function openSky(conn, feet) {
  const col = Array.from({ length: 40 }, (_, k) => ({ x: feet.x, y: feet.y + 2 + k, z: feet.z }));
  return !(await call(conn, "/blocks", 4000, { positions: col })).blocks.some((b) => b.solid && !/leaves|_log$|_wood$/.test(b.id));
}

/** Live instances only: a connection file can outlive a crashed game, so each one is pinged. */
async function liveInstances() {
  const found = [];
  for (const dir of candidateGameDirs()) {
    const file = path.join(dir, "mcbridge", "connection.json");
    let conn;
    try { conn = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
    try {
      const hello = await call(conn, "/hello", 1000);
      found.push({ name: path.basename(dir) === "run" ? "dev-client" : path.basename(dir), dir, conn, hello });
    } catch { /* stale file, game not running */ }
  }
  return found;
}

async function pick(name) {
  const live = await liveInstances();
  if (live.length === 0) {
    throw new Error("No running game with the mc-bridge mod found. Start a client that has the mod installed.");
  }
  if (name) {
    const m = live.find((i) => i.name.toLowerCase() === name.toLowerCase())
      ?? live.filter((i) => i.name.toLowerCase().includes(name.toLowerCase()))[0];
    if (!m) throw new Error(`No live instance matching "${name}". Live: ${live.map((i) => i.name).join(", ")}`);
    return m;
  }
  if (live.length > 1) {
    throw new Error(`Several games are running (${live.map((i) => i.name).join(", ")}). Pass \`instance\`.`);
  }
  return live[0];
}

const text = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: "text", text: String(e.message ?? e) }] });

const server = new McpServer({ name: "mc-bridge", version: "0.0.1" });

server.tool(
  "mc_instances",
  "List running Minecraft clients that have the mc-bridge mod, with their Minecraft version, loader and capabilities.",
  {},
  async () => {
    try {
      const live = await liveInstances();
      return text(live.map(({ name, dir, hello }) => ({ ...hello, name, dir })));
    } catch (e) { return fail(e); }
  },
);

server.tool(
  "mc_observe",
  "Read-only snapshot of the game: player (position, rotation, health, food, dimension, gamemode), inventory, " +
    "the open screen and, if it is a container, all its slots (`container`), what the crosshair targets, entities within 16 blocks, a count of blocks within 4 blocks, " +
    "any running action, and the last 10 chat messages. Coordinates are world coordinates; yaw is in [-180,180).",
  {
    instance: z.string().optional().describe("Instance name; only needed when several games are running"),
    full: z.boolean().optional().describe("Return the complete raw snapshot. Default false: a compact summary (inventory as id:count, no blocksNearby, last 3 chat lines) that costs far fewer tokens."),
  },
  async ({ instance, full }) => {
    try {
      const inst = await pick(instance);
      const o = await call(inst.conn, "/observe");
      if (full) return text(o);
      const r1 = (n) => Math.round(n * 10) / 10;
      const inv = {};
      for (const i of o.inventory ?? []) inv[i.id.replace("minecraft:", "")] = (inv[i.id.replace("minecraft:", "")] ?? 0) + i.count;
      const held = (o.inventory ?? []).find((i) => i.slot === o.player.selectedHotbarSlot);
      const ents = {};
      for (const e of o.entities ?? []) ents[e.id.replace("minecraft:", "")] = (ents[e.id.replace("minecraft:", "")] ?? 0) + 1;
      return text({
        pos: [r1(o.player.pos.x), r1(o.player.pos.y), r1(o.player.pos.z)],
        yaw: Math.round(o.player.yaw), pitch: Math.round(o.player.pitch),
        hp: o.player.health, food: o.player.food, dim: o.player.dimension, mode: o.player.gamemode,
        held: held ? held.id.replace("minecraft:", "") : null, hotbarSlot: o.player.selectedHotbarSlot,
        inv,
        target: o.target?.type === "block" ? `${o.target.id.replace("minecraft:", "")}@${o.target.pos.x},${o.target.pos.y},${o.target.pos.z}` : (o.target?.type ?? "none"),
        entities: ents,
        screen: o.screen, ...(o.container && { container: o.container }),
        ...(o.action && { action: o.action }),
        chat: (o.chat ?? []).slice(-3).map((c) => c.text),
      });
    } catch (e) { return fail(e); }
  },
);

const instanceArg = z.string().optional().describe("Instance name; only needed when several games are running");
const MAX_MOVE_TICKS = 100;

server.tool(
  "mc_find_blocks",
  "Find the nearest blocks of a type around the player, sorted by distance from the eyes. `block` is an id " +
    "(\"spruce_log\", \"minecraft:iron_ore\"), a glob on the id (\"*_log\", \"*diamond*\"), or a block tag " +
    "(\"#minecraft:logs\", \"#minecraft:iron_ores\"). Each result has its position, distance, inReach (close enough to " +
    "mine or use without moving) and exposed (a face touches air/water/glass, so it can be seen and mined directly; " +
    "exposedOnly filters to those). Only sees loaded chunks. Read-only.",
  {
    block: z.string(),
    radius: z.number().int().min(1).max(32).optional().describe("Default 16"),
    limit: z.number().int().min(1).max(50).optional().describe("Default 10"),
    exposedOnly: z.boolean().optional(),
    verbose: z.boolean().optional().describe("Return full JSON per result. Default false: one short line per result, 'x y z dDIST [E=exposed] [R=inReach]'."),
    instance: instanceArg,
  },
  async ({ instance, verbose, ...args }) => {
    try {
      const inst = await pick(instance);
      const out = await call(inst.conn, "/find", 6000, args);
      if (verbose) return text(out);
      const lines = (out.results ?? []).map((r) => `${r.pos.x} ${r.pos.y} ${r.pos.z} d${r.distance}${r.exposed ? " E" : ""}${r.inReach ? " R" : ""}${/^minecraft:/.test(r.id) ? "" : " " + r.id}`);
      return text(`${out.found} total; showing ${lines.length}${args.block.includes("*") || args.block.startsWith("#") ? " (ids vary: " + [...new Set((out.results ?? []).map((r) => r.id.replace("minecraft:", "")))].join(",") + ")" : ""}\n${lines.join("\n")}`);
    } catch (e) { return fail(e); }
  },
);

server.tool(
  "mc_blocks",
  "Inspect specific block positions (up to 64): id, state properties (facing, waterlogged, age...), solid " +
    "(has collision), replaceable (a block can be placed into it, e.g. air, grass, snow layer), fluid, light level, " +
    "distance and inReach. Use it to check a spot before placing, digging or walking. Read-only.",
  {
    positions: z.array(z.object({ x: z.number(), y: z.number(), z: z.number() })).min(1).max(64),
    instance: instanceArg,
  },
  async ({ positions, instance }) => {
    try {
      const inst = await pick(instance);
      return text(await call(inst.conn, "/blocks", 4000, { positions }));
    } catch (e) { return fail(e); }
  },
);

server.tool(
  "mc_terrain",
  "Walkability map around the player, for planning movement. `rows` is a top-down grid (row 0 = north/-z, first " +
    "column = west/-x, '@' = player) where each cell says what happens if you walk into that column, relative to " +
    "your feet: '.' level, '+' one up (needs a jump), '^' two or more up or a wall (blocked), '-' one down, " +
    "'v' 2-3 down (safe drop), '!' 4+ down or no floor (fall damage), '~' water, 'L' lava. `ahead` lists the " +
    "cells straight along the facing direction with the exact height change and surface block.",
  {
    radius: z.number().int().min(1).max(12).optional().describe("Cells in each direction (default 8)"),
    instance: instanceArg,
  },
  async ({ radius, instance }) => {
    try {
      const inst = await pick(instance);
      const t = await call(inst.conn, `/terrain${radius ? `?radius=${radius}` : ""}`);
      // The grid reads far better as lines than as a JSON array of strings.
      const { rows, ...rest } = t;
      return text(`${rows.join("\n")}\n\n${JSON.stringify(rest, null, 2)}`);
    } catch (e) { return fail(e); }
  },
);

server.tool(
  "mc_look",
  "Turn the player's view instantly. Either give yaw and/or pitch in degrees (yaw: 0 = south/+z, 90 = west/-x, " +
    "180 = north/-z, -90 = east/+x; pitch: -90 = straight up, 90 = straight down), or `at` a world point to face it " +
    "from the eyes (use block coordinates + 0.5 to aim at a block's centre). Returns the new rotation and what the " +
    "crosshair now targets. Requires actions to be enabled in the game's mcbridge/config.json.",
  {
    yaw: z.number().optional(),
    pitch: z.number().min(-90).max(90).optional(),
    at: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
    instance: instanceArg,
  },
  async ({ yaw, pitch, at, instance }) => {
    try {
      const inst = await pick(instance);
      await closeScreen(inst.conn);
      const body = at ? { at } : { ...(yaw !== undefined && { yaw }), ...(pitch !== undefined && { pitch }) };
      return text(await call(inst.conn, "/look", 4000, body));
    } catch (e) { return fail(e); }
  },
);

server.tool(
  "mc_move",
  "Hold movement keys for a number of game ticks (20 ticks = 1 second, max 100), as if a player pressed them. " +
    "Movement is relative to where the player faces, so aim with mc_look first. Waits until the move ends and " +
    "returns the outcome and the final position and horizontal distance moved. Outcomes: completed; blocked " +
    "(stopped early after 10 ticks without progress, e.g. walking into a wall; use mc_terrain to find a way " +
    "around); interrupted (a real key press, mouse click, scroll or mouse turn by the human, an open screen, or a " +
    "newer move). An inventory or container screen left open is closed first. Requires actions to be enabled in the game's mcbridge/config.json.",
  {
    keys: z.array(z.enum(["forward", "back", "left", "right", "jump", "sneak", "sprint", "attack", "use"])).min(1)
      .describe("Keys to hold together, e.g. [\"forward\",\"sprint\"], [\"forward\",\"jump\"], or [\"jump\",\"use\"] " +
        "while looking straight down to pillar up with the held block"),
    ticks: z.number().int().min(1).max(MAX_MOVE_TICKS),
    instance: instanceArg,
  },
  async ({ keys, ticks, instance }) => {
    try {
      const inst = await pick(instance);
      await closeScreen(inst.conn);
      return text(await call(inst.conn, "/move", ticks * 50 + 6000, { keys, ticks }));
    } catch (e) { return fail(e); }
  },
);

server.tool(
  "mc_goto",
  "Walk to a position along a planned path (A* over walkable ground: steps up one block with a jump, drops at most " +
    "3, swims through water, avoids lava, fire, cactus, magma, berry bushes, powder snow and cobwebs). Give x and z, " +
    "and optionally y; without y it targets the floor in that column nearest your current height (the result's " +
    "`goal` shows which), so give y to go up to a ledge or down into a cave. `tolerance` is how close counts as arrived horizontally (default 1; use 2-3 to stand next to " +
    "a block you want to mine or use). Max 96 blocks away and 60 seconds. It steers, jumps and re-plans by itself " +
    "and waits until done. Outcomes: completed; partial (target unreachable, stopped at the closest reachable " +
    "point); blocked (stuck even after re-planning); interrupted (human input, a screen, or a newer action). " +
    "dryRun: true only plans and returns the path. An inventory or container screen left open is closed first. Requires actions to be enabled.",
  {
    x: z.number(),
    z: z.number(),
    y: z.number().optional(),
    tolerance: z.number().min(0).max(8).optional(),
    dryRun: z.boolean().optional(),
    instance: instanceArg,
  },
  async ({ instance, ...args }) => {
    try {
      const inst = await pick(instance);
      await closeScreen(inst.conn);
      return text(await call(inst.conn, "/goto", 66000, args));
    } catch (e) { return fail(e); }
  },
);

const MAX_HOLD_TICKS = 200;

server.tool(
  "mc_interact",
  "Left- or right-click like a player, on whatever the crosshair targets (aim with mc_look first). " +
    "action \"attack\" = left click: hit an entity, or start breaking a block. action \"use\" = right click: place " +
    "the held block, open a door/chest, use or eat the held item. Without `ticks` it is a single click. With " +
    "`ticks` (20 = 1 second, max 200) the button is held: holding attack mines the targeted block and stops as soon " +
    "as it breaks; holding use keeps eating/drawing a bow or places repeatedly. Returns the target before and after, " +
    "the targeted block before/after with blockBroken, and the held item. Holds are interrupted by the human's input " +
    "or an open screen, like mc_move. An inventory or container screen left open is closed first. `item` first puts " +
    "that item in your hand (moving it to the hotbar if needed), or \"empty\" selects an empty hand. Requires actions to be enabled in the game's mcbridge/config.json.",
  {
    action: z.enum(["attack", "use"]),
    ticks: z.number().int().min(1).max(MAX_HOLD_TICKS).optional().describe("Hold for this many ticks; omit for one click"),
    item: z.string().optional().describe("Hold this item first (e.g. \"stone_axe\"), or \"empty\" for an empty hand"),
    instance: instanceArg,
  },
  async ({ action, ticks, item, instance }) => {
    try {
      const inst = await pick(instance);
      await closeScreen(inst.conn);
      if (item === "empty") {
        const inv = (await call(inst.conn, "/observe")).inventory;
        const free = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((n) => !inv.some((i) => i.slot === n));
        if (free === undefined) throw new Error("no empty hotbar slot for an empty hand; store or drop something first");
        await call(inst.conn, "/hotbar", 4000, { slot: free });
      } else if (item) {
        await holdItem(inst.conn, fullId(item));
      }
      let r = await call(inst.conn, "/interact", (ticks ?? 1) * 50 + 6000, { action, ...(ticks && { ticks }) });
      // The first right-click after closing a screen is sometimes swallowed: if a container block didn't open, retry once.
      if (action === "use" && !ticks && r.targetBefore?.type === "block" && INTERACTIVE.test(r.targetBefore.id ?? "") && !/door|gate|trapdoor|lever|button|bell|note_block|repeater|comparator/.test(r.targetBefore.id)) {
        await sleep(250);
        if (!(await call(inst.conn, "/observe")).screen) r = await call(inst.conn, "/interact", 6000, { action });
      }
      return text(r);
    } catch (e) { return fail(e); }
  },
);

server.tool(
  "mc_hotbar",
  "Select a hotbar slot (0-8, i.e. the number keys 1-9) so that item is held. Inventory slots 0-8 in mc_observe " +
    "are the hotbar. Returns the slot and the held item. Requires actions to be enabled.",
  { slot: z.number().int().min(0).max(8), instance: instanceArg },
  async ({ slot, instance }) => {
    try {
      const inst = await pick(instance);
      return text(await call(inst.conn, "/hotbar", 4000, { slot }));
    } catch (e) { return fail(e); }
  },
);

server.tool(
  "mc_chat",
  "Send a chat message as the player; everyone on the server sees it. A message starting with / runs a command, " +
    "which additionally requires \"allowCommands\": true in the game's mcbridge/config.json. Returns chat and system " +
    "messages that arrived in the next quarter second (replies, command output). mc_observe shows the last 10 " +
    "messages. Requires actions to be enabled.",
  { message: z.string().min(1).max(256), instance: instanceArg },
  async ({ message, instance }) => {
    try {
      const inst = await pick(instance);
      return text(await call(inst.conn, "/chat", 4000, { message }));
    } catch (e) { return fail(e); }
  },
);

server.tool(
  "mc_screen",
  "Open the player's inventory (with its 2x2 crafting grid), or close whatever screen is open: a container, the " +
    "pause menu, chat. Chests, crafting tables, furnaces etc. are opened by aiming at them and using mc_interact " +
    "use. Returns the screen and, for containers, the same `container` snapshot as mc_observe. Requires actions.",
  { action: z.enum(["open_inventory", "close"]), instance: instanceArg },
  async ({ action, instance }) => {
    try {
      const inst = await pick(instance);
      return text(await call(inst.conn, "/screen", 4000, { action }));
    } catch (e) { return fail(e); }
  },
);

server.tool(
  "mc_click_slot",
  "Click a slot in the open container screen exactly like a player. Slot numbers are the menu's own, as listed in " +
    "the `container` snapshot (its `sections` say which range is the chest, the crafting grid, the result, the " +
    "player's inventory and hotbar). Modes: pickup (left = pick up/put down the whole stack, right = half/one item; " +
    "slot -999 = outside the window, drops what the cursor carries), quick_move (shift-click: send the stack to the " +
    "other side), swap (swap with hotbar slot `hotbar` 0-8, or 40 = offhand), throw (left = drop one, right = drop " +
    "the stack), pickup_all (double-click: gather matching items onto the cursor). Returns the updated container, " +
    "including `carried` (what the cursor holds). Requires actions.",
  {
    slot: z.number().int(),
    mode: z.enum(["pickup", "quick_move", "swap", "throw", "pickup_all"]).optional().describe("Default pickup"),
    button: z.enum(["left", "right"]).optional().describe("Default left"),
    hotbar: z.number().int().optional().describe("For swap: 0-8, or 40 for the offhand"),
    instance: instanceArg,
  },
  async ({ instance, ...args }) => {
    try {
      const inst = await pick(instance);
      return text(await call(inst.conn, "/click", 4000, args));
    } catch (e) { return fail(e); }
  },
);

server.tool(
  "mc_craft",
  "Craft an item by id (e.g. \"oak_planks\", \"minecraft:stick\") with the open inventory (2x2 grid) or crafting " +
    "table (3x3), using the game's recipe book placement, then shift-click the result into the inventory. Screens are " +
    "handled for you: 2x2 recipes use your inventory; 3x3 recipes use a crafting table within 6 blocks, or place the " +
    "one you carry (or make one from 4 planks) and pick it back up afterwards. `times` " +
    "repeats the recipe (default 1); `all` crafts as many as the ingredients allow. Errors say if ingredients are " +
    "missing or a crafting table is needed. Returns the recipe used, how many items were gained, and the container. " +
    "Requires actions.",
  {
    item: z.string(),
    times: z.number().int().min(1).max(64).optional(),
    all: z.boolean().optional(),
    instance: instanceArg,
  },
  async ({ instance, ...args }) => {
    try {
      const inst = await pick(instance);
      // No screen open: open the player's inventory first, so 2x2 recipes work in one call.
      const o = await call(inst.conn, "/observe");
      // No screen, or one that cannot craft (furnace, chest...): use the player's inventory (2x2) instead.
      const opened = !o.screen || o.container?.canCraft !== true;
      if (opened) {
        if (o.screen) await call(inst.conn, "/screen", 4000, { action: "close" });
        await call(inst.conn, "/screen", 4000, { action: "open_inventory" });
      }
      try {
        const r = await call(inst.conn, "/craft", 6000, args);
        return text(opened ? { openedInventory: true, ...r } : r);
      } catch (e) {
        if (!/needs a 3x3 grid/.test(e.message ?? "")) throw e;
      }
      // 3x3 recipe: get to a crafting table (nearby, carried, or made from planks), craft, and take a placed one back.
      const table = await openCraftingTable(inst.conn);
      try {
        const r = await call(inst.conn, "/craft", 6000, args);
        return text({ ...r, table: table.pos, ...(table.made && { madeTable: true }), ...(table.placed && { placedTable: true }) });
      } finally {
        if (table.placed) {
          await closeScreen(inst.conn).catch(() => {});
          await mineOne(inst.conn, table.pos, { collect: true, allowFluids: false, clearObstacles: false }).catch(() => {});
        }
      }
    } catch (e) { return fail(e); }
  },
);

/** Open a crafting table for a 3x3 recipe: one within 6 blocks, else place the carried one, else make one first. */
async function openCraftingTable(conn) {
  let pos, placed = false, made = false;
  const found = await call(conn, "/find", 6000, { block: "minecraft:crafting_table", radius: 6, limit: 1 });
  if (found.results?.length) pos = found.results[0].pos;
  else {
    let inv = (await call(conn, "/observe")).inventory;
    if (!inv.some((i) => i.id === "minecraft:crafting_table")) {
      const planks = inv.filter((i) => /_planks$/.test(i.id)).reduce((n, i) => n + i.count, 0);
      if (planks < 4) throw new Error("this recipe needs a crafting table: none within 6 blocks, none carried, and fewer than 4 planks to make one");
      const o = await call(conn, "/observe");
      if (o.container?.canCraft !== true) {
        if (o.screen) await call(conn, "/screen", 4000, { action: "close" });
        await call(conn, "/screen", 4000, { action: "open_inventory" });
      }
      await call(conn, "/craft", 6000, { item: "minecraft:crafting_table" });
      made = true;
    }
    pos = await placeNearby(conn, "minecraft:crafting_table");
    placed = true;
  }
  if (!(await getInReach(conn, pos))) throw new Error(`could not get within reach of the crafting table at ${pos.x},${pos.y},${pos.z}`);
  for (let attempt = 0; attempt < 2; attempt++) {
    await closeScreen(conn);
    if (attempt) await sleep(400);
    const look = await call(conn, "/look", 4000, { at: { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 } });
    if (!same(look.target?.pos, pos)) {
      await call(conn, "/goto", 20000, { x: pos.x, y: pos.y, z: pos.z, tolerance: 2 }).catch(() => {});
      continue;
    }
    await call(conn, "/interact", 4000, { action: "use" });
    await sleep(300);
    const c = (await call(conn, "/observe")).container;
    if (c?.canCraft && /crafting/.test(c.menu ?? "")) return { pos, placed, made };
  }
  throw new Error(`could not open the crafting table at ${pos.x},${pos.y},${pos.z}`);
}

server.tool(
  "mc_stop",
  "Stop any running move or held attack/use immediately and release its keys.",
  { instance: instanceArg },
  async ({ instance }) => {
    try {
      const inst = await pick(instance);
      return text(await call(inst.conn, "/stop", 4000, {}));
    } catch (e) { return fail(e); }
  },
);

// ---- composite tools: built only from the routes above ----------------------------------------------------------

const SIDES = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]; // below first: the usual support
const FACE_TOWARD = { "0,-1,0": "up", "0,1,0": "down", "1,0,0": "west", "-1,0,0": "east", "0,0,1": "north", "0,0,-1": "south" };
// Right-clicking these opens or toggles them instead of placing against them.
const INTERACTIVE = /chest|crafting_table|furnace|smoker|door|gate|trapdoor|barrel|bed|lever|button|anvil|shulker|hopper|dispenser|dropper|loom|enchanting|brewing|note_block|repeater|comparator|grindstone|stonecutter|cartography|smithing|lectern|bell/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const add = (p, d) => ({ x: p.x + d[0], y: p.y + d[1], z: p.z + d[2] });
const same = (a, b) => a && b && a.x === b.x && a.y === b.y && a.z === b.z;
const cell = (p) => ({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) });
const fullId = (id) => (id.includes(":") ? id : `minecraft:${id}`);

function inventoryDelta(before, after) {
  const count = (inv) => inv.reduce((m, i) => m.set(i.id, (m.get(i.id) ?? 0) + i.count), new Map());
  const a = count(before), b = count(after), out = {};
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const d = (b.get(id) ?? 0) - (a.get(id) ?? 0);
    if (d) out[id] = d;
  }
  return out;
}

async function inspect(conn, positions) {
  return (await call(conn, "/blocks", 4000, { positions })).blocks;
}

/**
 * Safety stop for long actions (mc_mine, mc_dig): a reason string when the player's head is under water or health is
 * low, else null. Checked before every block, so one call can't walk the player into a lake and drown it.
 */
const SAFE_HEALTH = 10;
async function hazard(conn) {
  const p = (await call(conn, "/observe")).player;
  const [head] = await inspect(conn, [cell({ x: p.pos.x, y: p.pos.y + 1.6, z: p.pos.z })]);
  if (/water/.test(`${head.fluid ?? ""} ${head.id}`)) return "your head is under water: get to dry land first (swim up, then toward the shore)";
  if (p.health < SAFE_HEALTH) return `health is ${p.health}: stopped to avoid dying`;
  return null;
}

async function getInReach(conn, pos) {
  let [b] = await inspect(conn, [pos]);
  if (b.inReach) return true;
  await call(conn, "/goto", 66000, { x: pos.x, y: pos.y, z: pos.z, tolerance: 3 }).catch(() => {});
  [b] = await inspect(conn, [pos]);
  return b.inReach;
}

/** Mine one block at pos; returns a result record (never throws for in-game reasons). */
const NATURAL_OBSTACLE = /leaves|leaf_litter|petals|wildflowers|grass|fern|vine|snow|flower|sapling|bush|mushroom|dead_bush|kelp|seagrass|azalea|moss_carpet/;
/** Natural ground that never belongs to a build: cleared when it blocks the line of sight (builds use bricks, planks...). */
const NATURAL_TERRAIN = /^minecraft:(dirt|coarse_dirt|rooted_dirt|grass_block|podzol|mycelium|stone|deepslate|andesite|diorite|granite|tuff|calcite|gravel|sand|red_sand|clay|netherrack)$|_ore$/;
/** Ground covers only a sliver high: aim at their bottom, or the ray passes over them into the block below. */
const THIN_COVER = /leaf_litter|petals|wildflowers|carpet/;
async function mineOne(conn, pos, { collect, allowFluids, clearObstacles = false }, depth = 0) {
  const [b] = await inspect(conn, [pos]);
  const r = { pos, id: b.id };
  if (b.loaded === false) return { ...r, outcome: "skipped", reason: "chunk not loaded" };
  if (/^minecraft:(air|cave_air|void_air|water|lava)$/.test(b.id)) return { ...r, outcome: "skipped", reason: "nothing to mine" };
  if (b.hardness < 0) return { ...r, outcome: "skipped", reason: "unbreakable" };
  if (!b.dropsWithBest) return { ...r, outcome: "skipped", reason: "no tool in the hotbar can harvest it (it would drop nothing)" };
  if (!allowFluids) {
    // Lava or water beside or above the block would pour in once it is gone; below is harmless.
    const around = await inspect(conn, SIDES.slice(1).map((d) => add(pos, d)));
    const wet = around.find((n) => n.fluid);
    if (wet) return { ...r, outcome: "skipped", reason: `${wet.fluid} next to it at ${wet.pos.x},${wet.pos.y},${wet.pos.z}` };
  }
  if (!(await getInReach(conn, pos))) return { ...r, outcome: "failed", reason: "could not get within reach" };

  await call(conn, "/hotbar", 4000, { slot: (await inspect(conn, [pos]))[0].bestSlot });
  const look = await call(conn, "/look", 4000, { at: { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 } });
  const hit = look.target?.pos;
  if (!same(hit, pos)) {
    if (!hit || depth >= 2) return { ...r, outcome: "failed", reason: `can't see it${hit ? `; ${look.target.id} is in the way` : ""}` };
    // Plants, snow and natural terrain are cleared on their own; anything built (slabs, fences, machines...) is left alone unless asked.
    if (!clearObstacles && !NATURAL_OBSTACLE.test(look.target.id) && !NATURAL_TERRAIN.test(look.target.id)) {
      return { ...r, outcome: "failed", reason: `${look.target.id} at ${hit.x},${hit.y},${hit.z} is in the way; mine it first on purpose, move to see ${pos.x},${pos.y},${pos.z} from another side, or pass clearObstacles` };
    }
    const cleared = await mineOne(conn, hit, { collect: false, allowFluids, clearObstacles }, depth + 1);
    if (cleared.outcome !== "mined") return { ...r, outcome: "failed", reason: `${look.target.id} in the way: ${cleared.reason}` };
    const again = await mineOne(conn, pos, { collect, allowFluids, clearObstacles }, depth + 1);
    if (again.outcome === "mined") again.alsoCleared = [look.target.id, ...(again.alsoCleared ?? [])];
    return again;
  }
  const m = await call(conn, "/interact", 16000, { action: "attack", ticks: 200 });
  if (!m.blockBroken) return { ...r, outcome: "failed", reason: m.reason ?? `still ${m.blockAfter} after ${m.ticksRun} ticks` };
  const res = { ...r, outcome: "mined", ticks: m.ticksRun };
  if (collect) res.collected = await collectNear(conn, pos);
  return res;
}

/** Walk onto item entities that landed near pos; returns how many item stacks were picked up. */
async function collectNear(conn, pos) {
  await sleep(500); // drops pop out with some velocity and can't be picked up for the first 10 ticks
  let picked = 0;
  const near = (e) => e.id === "minecraft:item" && Math.hypot(e.pos.x - pos.x - 0.5, e.pos.z - pos.z - 0.5) < 4 && Math.abs(e.pos.y - pos.y) < 6;
  for (let pass = 0; pass < 4; pass++) {
    const items = (await call(conn, "/observe")).entities.filter(near);
    if (items.length === 0) break;
    const it = items[0];
    await call(conn, "/goto", 66000, { x: it.pos.x, y: it.pos.y, z: it.pos.z, tolerance: 0 }).catch(() => {});
    await sleep(250);
    const still = (await call(conn, "/observe")).entities.filter(near);
    if (still.length < items.length) picked += items.length - still.length;
  }
  return picked;
}

server.tool(
  "mc_mine",
  "Mine blocks the way a player would, end to end: walk within reach if needed (mc_goto), pick the best hotbar " +
    "tool (one that gets drops, fastest, saving durability when bare hands are as good), aim, clear one or two " +
    "blocks that are in the line of sight, hold attack until it breaks, then walk over the spot to collect the " +
    "drop. Only leaves, grass and similar plants in the way are cleared automatically; any other block in the line of " +
    "sight (planks, slabs, fences, machines) makes the mine fail unless clearObstacles is true, so builds stay intact; " +
    "natural terrain in the way (dirt, stone, gravel, sand, ores...) is mined through. " +
    "Give either `pos` for one block, or `block` (id, *glob or #tag as in mc_find_blocks) and `count` to mine " +
    "the nearest exposed matches one after another, e.g. block \"#minecraft:logs\" count 6 to chop a tree. Skips " +
    "blocks with lava or water beside or above them unless allowFluids, unbreakable ones, and ones no hotbar tool " +
    "can harvest. Returns each block's outcome and the inventory change. Requires actions.",
  {
    pos: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
    block: z.string().optional(),
    count: z.number().int().min(1).max(32).optional().describe("With block: how many to mine (default 1)"),
    radius: z.number().int().min(1).max(32).optional().describe("With block: search radius (default 16)"),
    collect: z.boolean().optional().describe("Walk over each mined spot to pick up the drop (default true)"),
    allowFluids: z.boolean().optional(),
    clearObstacles: z.boolean().optional().describe("Also break non-plant blocks that block the line of sight (default false)"),
    verbose: z.boolean().optional().describe("Return every per-block record. Default false: counts, a short failure summary and the inventory change."),
    instance: instanceArg,
  },
  async ({ pos, block, count = 1, radius = 16, collect = true, allowFluids = false, clearObstacles = false, verbose = false, instance }) => {
    try {
      if (!pos === !block) throw new Error("give either pos or block");
      const { conn } = await pick(instance);
      await closeScreen(conn);
      const start = await hazard(conn);
      if (start) throw new Error(start);
      const before = (await call(conn, "/observe")).inventory;
      const results = [];
      let stopped, nearWater = 0;
      if (pos) {
        results.push(await mineOne(conn, cell(pos), { collect, allowFluids, clearObstacles }));
      } else {
        const tried = new Set();
        let fails = 0;
        while (true) {
          if (results.filter((r) => r.outcome === "mined").length >= count) break;
          // Every failed target can mean a walk; give up early instead of wandering the terrain.
          if (fails >= 8 || results.length >= count * 3) { stopped = `too many failures (${fails} in a row)`; break; }
          const hz = await hazard(conn);
          if (hz) { stopped = hz; break; }
          // Exposed blocks anywhere in the radius, plus buried ones already within reach (it digs through natural
          // stone to them), so a vein in the wall beside you is not walked past. Never the block under your feet.
          const found = await call(conn, "/find", 6000, { block, radius, limit: 50, exposedOnly: false });
          const me = (await call(conn, "/observe")).player.pos;
          const under = cell({ x: me.x, y: me.y - 0.6, z: me.z });
          const next = found.results.find((f) => !tried.has(`${f.pos.x},${f.pos.y},${f.pos.z}`) && (f.exposed || f.inReach) && !same(f.pos, under));
          if (!next) { stopped = `no more exposed (or in-reach) ${block} within ${radius} blocks`; break; }
          tried.add(`${next.pos.x},${next.pos.y},${next.pos.z}`);
          if (!allowFluids) {
            // Lakeside blocks get refused anyway, but only after walking to them, which led into lakes: skip them here.
            const around = [];
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
              if (dx || dy || dz) around.push({ x: next.pos.x + dx, y: next.pos.y + dy, z: next.pos.z + dz });
            }
            if ((await inspect(conn, around)).some((b) => /water|lava/.test(`${b.fluid ?? ""} ${b.id}`))) { nearWater++; continue; }
          }
          const r = await mineOne(conn, next.pos, { collect, allowFluids, clearObstacles });
          results.push(r);
          fails = r.outcome === "mined" ? 0 : fails + 1;
        }
      }
      if (!stopped) stopped = (await hazard(conn)) ?? undefined;
      const after = (await call(conn, "/observe")).inventory;
      const summary = {
        mined: results.filter((r) => r.outcome === "mined").length,
        ...(block && { requested: count }),
        ...(stopped && { stopped }),
        ...(block && nearWater && { skippedNearWater: nearWater }),
        inventoryChange: inventoryDelta(before, after),
      };
      if (verbose) return text({ ...summary, results });
      const bad = results.filter((r) => r.outcome !== "mined");
      const reasons = {};
      for (const r of bad) {
        const key = (r.reason ?? r.outcome).replace(/\d+,\d+,\d+/g, "#").slice(0, 90);
        reasons[key] = (reasons[key] ?? 0) + 1;
      }
      return text({ ...summary, ...(bad.length && { notMined: bad.length, why: reasons }) });
    } catch (e) { return fail(e); }
  },
);

/** Put the item in a hotbar slot (moving it from the main inventory if needed) and select it. */
async function holdItem(conn, id) {
  let inv = (await call(conn, "/observe")).inventory;
  let item = inv.find((i) => i.id === id && i.slot < 9);
  if (!item) {
    const stored = inv.find((i) => i.id === id && i.slot >= 9 && i.slot < 36);
    if (!stored) throw new Error(`no ${id} in the hotbar or inventory`);
    const free = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((s) => !inv.some((i) => i.slot === s));
    // Never push a tool or weapon out of the hotbar to make room (mining then fails with "no tool can harvest").
    const TOOL = /_(pickaxe|axe|shovel|hoe|sword)$|^minecraft:(shears|flint_and_steel|bucket|water_bucket|lava_bucket)$/;
    const selected = (await call(conn, "/observe")).player.selectedHotbarSlot;
    const expendable = [0, 1, 2, 3, 4, 5, 6, 7, 8]
      .filter((s) => !TOOL.test(inv.find((i) => i.slot === s)?.id ?? ""))
      .sort((a, b) => (a === selected) - (b === selected));
    const target = free ?? expendable[0] ?? selected;
    await call(conn, "/screen", 4000, { action: "open_inventory" });
    // In the player inventory menu, main inventory slots 9-35 keep their numbers.
    await call(conn, "/click", 4000, { slot: stored.slot, mode: "swap", hotbar: target });
    await call(conn, "/screen", 4000, { action: "close" });
    inv = (await call(conn, "/observe")).inventory;
    item = inv.find((i) => i.id === id && i.slot < 9);
    if (!item) throw new Error(`could not move ${id} to the hotbar`);
  }
  await call(conn, "/hotbar", 4000, { slot: item.slot });
  return item;
}

server.tool(
  "mc_place",
  "Place a block at a position: picks a solid neighbouring block to click against (preferring the one below, " +
    "never chests, doors, tables or other blocks that open when clicked), walks within reach if needed, holds the " +
    "item (moving it from the main inventory to the hotbar if necessary; default: whatever is held), aims at that " +
    "face and right-clicks. The target must be replaceable (air, grass, snow layer, water...) and not where the " +
    "player stands. Leave out x/y/z (give item) to let it pick a free spot on the ground about 2 blocks away. " +
    "Returns what is at the position afterwards. Requires actions.",
  {
    x: z.number().optional(), y: z.number().optional(), z: z.number().optional(),
    item: z.string().optional().describe("Item id to place, e.g. \"cobblestone\"; default the held item"),
    instance: instanceArg,
  },
  async ({ x, y, z: zz, item, instance }) => {
    try {
      const { conn } = await pick(instance);
      const given = [x, y, zz].filter((v) => v !== undefined).length;
      if (given === 0) {
        if (!item) throw new Error("without x/y/z give item, so a spot can be picked for it");
        const pos = await placeNearby(conn, fullId(item));
        const [b] = await inspect(conn, [pos]);
        return text({ placed: b.id, pos, picked: true });
      }
      if (given !== 3) throw new Error("give all of x, y and z, or none of them");
      return text(await placeOne(conn, { x, y, z: zz }, item));
    } catch (e) { return fail(e); }
  },
);

/** Place one block (see mc_place); returns the result record or throws with the reason. Shared with settlement tasks. */
async function placeOne(conn, pos, item) {
      const target = cell(pos);
      await closeScreen(conn);
      const [here] = await inspect(conn, [target]);
      if (here.loaded === false) throw new Error("that chunk is not loaded");
      // A single snow layer is replaced by placement even though it is not flagged replaceable.
      const thinSnow = here.id === "minecraft:snow" && here.properties?.layers === "1";
      if (!here.replaceable && !thinSnow) throw new Error(`${target.x},${target.y},${target.z} is occupied by ${here.id}`);
      const me = (await call(conn, "/observe")).player.pos;
      const feet = cell({ x: me.x, y: me.y + 0.4, z: me.z });
      if (feet.x === target.x && feet.z === target.z && (target.y === feet.y || target.y === feet.y + 1)) {
        throw new Error("the player is standing in that spot; move first");
      }
      const held = item ? await holdItem(conn, fullId(item)) : null;
      if (!(await getInReach(conn, target))) throw new Error("could not get within reach");

      // Short grass, ferns, flowers etc. in the target cell intercept the crosshair; clicking them places into the cell.
      const plant = !thinSnow && here.replaceable && !here.fluid && !/:(air|cave_air|void_air)$/.test(here.id);
      if (thinSnow || plant) {
        // Clicking the snow layer itself places into its cell; it also hides the face of the block below.
        const dy = thinSnow ? 0.06 : THIN_COVER.test(here.id) ? 0.03 : 0.3;
        const look = await call(conn, "/look", 4000, { at: { x: target.x + 0.5, y: target.y + dy, z: target.z + 0.5 } });
        if (same(look.target?.pos, target)) {
          const use = await call(conn, "/interact", 4000, { action: "use" });
          await sleep(150);
          const [after] = await inspect(conn, [target]);
          if (after.id !== here.id) return { placed: after.id, pos: target, against: { block: here.id, face: look.target.face }, held: use.held };
        }
      }
      const tryFaces = async () => {
        const supports = await inspect(conn, SIDES.map((d) => add(target, d)));
        for (let i = 0; i < SIDES.length; i++) {
          const s = supports[i], d = SIDES[i];
          if (!s.solid || INTERACTIVE.test(s.id)) continue;
          // Aim just inside the shared face, so the ray lands on the support's side facing the target.
          const at = { x: target.x + 0.5 + d[0] * 0.49, y: target.y + 0.5 + d[1] * 0.49, z: target.z + 0.5 + d[2] * 0.49 };
          let look = await call(conn, "/look", 4000, { at });
          // Grass, flowers and similar plants between the eyes and the face swallow the click: break them (instant) and re-aim.
          for (let k = 0; k < 3 && look.target?.pos && !same(look.target.pos, s.pos) && !same(look.target.pos, target) &&
            NATURAL_OBSTACLE.test(look.target.id) && !/leaves/.test(look.target.id); k++) {
            await call(conn, "/interact", 4000, { action: "attack" });
            await sleep(100);
            look = await call(conn, "/look", 4000, { at });
          }
          if (!same(look.target?.pos, s.pos) || look.target.face !== FACE_TOWARD[d.join(",")]) continue;
          const use = await call(conn, "/interact", 4000, { action: "use" });
          await sleep(150);
          const [after] = await inspect(conn, [target]);
          if (after.id !== here.id) return { placed: after.id, pos: target, against: { block: s.id, face: look.target.face }, held: use.held };
        }
        return null;
      };
      let done = await tryFaces();
      const now = (await call(conn, "/observe")).player.pos;
      const standing = cell({ x: now.x, y: now.y + 0.4, z: now.z });
      const dx = target.x - standing.x, dz = target.z - standing.z;
      if (!done && target.y === standing.y - 1 && Math.abs(dx) + Math.abs(dz) === 1) {
        // Bridging: the face beside the block underfoot is only visible from over the edge. Sneaking keeps us on it.
        await call(conn, "/look", 4000, { yaw: Math.atan2(-dx, dz) * 180 / Math.PI, pitch: 0 });
        // Runs until sneaking stops us at the edge (the move then ends early as "blocked").
        await call(conn, "/move", 8000, { keys: ["sneak", "forward"], ticks: 40 });
        done = await tryFaces();
        if (done) done.bridged = true;
      }
      if (done) return done;
      // Most failures are a target one block too high (e.g. leaf litter or grass taken for the floor): say where the ground is.
      const below = await inspect(conn, [1, 2, 3, 4, 5, 6].map((k) => ({ x: target.x, y: target.y - k, z: target.z })));
      let hint = "";
      if (!below[0].solid) {
        const ground = below.find((b) => b.solid);
        hint = ground
          ? ` Nothing solid below ${target.x},${target.y},${target.z}: the ground there is at y=${ground.pos.y}, so place at y=${ground.pos.y + 1}.`
          : ` Nothing solid within 6 blocks below ${target.x},${target.y},${target.z}.`;
      }
      throw new Error(`no usable face to place against${held ? "" : " (or the held item cannot be placed)"}: ` +
        "every neighbour is air, fluid, interactive, or hidden from here." + hint);
}

// ---- bulk tools: one call instead of hundreds -----------------------------------------------------------------------

const xyz = z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() });

server.tool(
  "mc_fill",
  "Bulk-build with the /fill command: fill the box between corners `from` and `to` (inclusive) with `block` in ONE call " +
    "(walls, floors, foundations, hollow rooms, clearing space). Volumes over 32768 are split automatically. `mode`: " +
    "replace (default), hollow (shell only, interior cleared), outline (shell only, interior untouched), keep (only " +
    "fill air), destroy (break what is there with drops). `filter` (replace mode only) restricts which existing block " +
    "is replaced. `block` accepts state syntax, e.g. \"minecraft:oak_stairs[facing=north]\". A single block is from==to. " +
    "Needs \"allowCommands\": true in mcbridge/config.json, op rights, and loaded chunks. Use it for large builds and " +
    "terrain prep, not for gathering resources.",
  {
    from: xyz,
    to: xyz,
    block: z.string(),
    mode: z.enum(["replace", "hollow", "outline", "keep", "destroy"]).optional(),
    filter: z.string().optional(),
    instance: instanceArg,
  },
  async ({ from, to, block, mode = "replace", filter, instance }) => {
    try {
      if (filter && mode !== "replace") throw new Error("filter only works with mode replace");
      const { conn } = await pick(instance);
      const lo = { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), z: Math.min(from.z, to.z) };
      const hi = { x: Math.max(from.x, to.x), y: Math.max(from.y, to.y), z: Math.max(from.z, to.z) };
      // Split along y into slabs so each command stays within the 32768-block limit.
      const area = (hi.x - lo.x + 1) * (hi.z - lo.z + 1);
      if (area > 32768) throw new Error("footprint over 32768 blocks; split it into several mc_fill calls");
      const slab = Math.max(1, Math.floor(32768 / area));
      const replies = [];
      for (let y = lo.y; y <= hi.y; y += slab) {
        const y2 = Math.min(hi.y, y + slab - 1);
        // hollow/outline shells are only correct on a single box; with several slabs fall back to one command per slab edge case.
        if (slab < hi.y - lo.y + 1 && (mode === "hollow" || mode === "outline")) {
          throw new Error(`${mode} on a box this big can't be split; use smaller boxes`);
        }
        const cmd = `/fill ${lo.x} ${y} ${lo.z} ${hi.x} ${y2} ${hi.z} ${block}${mode === "replace" ? (filter ? ` replace ${filter}` : "") : ` ${mode}`}`;
        if (cmd.length > 256) throw new Error("command too long (block/filter string)");
        const r = await call(conn, "/chat", 6000, { message: cmd });
        replies.push(JSON.stringify(r).slice(0, 300));
      }
      const volume = (hi.x - lo.x + 1) * (hi.y - lo.y + 1) * (hi.z - lo.z + 1);
      return text({ volume, commands: replies.length, reply: replies.length === 1 ? replies[0] : replies.slice(-1)[0] });
    } catch (e) { return fail(e); }
  },
);

const DIGS = { down: [0, -1, 0], up: [0, 1, 0], north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0] };

server.tool(
  "mc_dig",
  "Dig a straight shaft or tunnel in ONE call: from where the player stands, `length` steps in `direction` " +
    "(down, up, north=-z, south=+z, east=+x, west=-x), walking into each cell after clearing it. Horizontal tunnels are " +
    "2 high (feet and head). Picks the best hotbar tool per block, picks up drops by walking over them. Stops early " +
    "(and says why) at lava/water beside the cell, unbreakable or un-harvestable blocks, or a drop it can't walk. " +
    "With stairs:true and a horizontal direction it digs a 2-high staircase going DOWN one block per step instead (the " +
    "safe way to reach stone or go underground; it stops before water/lava and where there is no floor to step on). " +
    "With stairs:true and up:true it heads for the surface instead: it climbs a staircase where there is a wall ahead, " +
    "walks across open cave floor toward the next wall, and stops only under open sky: the way out of any hole or cave. " +
    "Returns the end position, cells dug and the inventory change only. Pair with mc_mine/mc_find_blocks for ore. Requires actions.",
  {
    direction: z.enum(["down", "up", "north", "south", "east", "west"]),
    length: z.number().int().min(1).max(64),
    stairs: z.boolean().optional().describe("With north/south/east/west: a staircase going down, 1 block per step"),
    up: z.boolean().optional().describe("With stairs: go up instead; stops on reaching open ground"),
    instance: instanceArg,
  },
  async ({ direction, length, stairs = false, up = false, instance }) => {
    try {
      if (stairs && (direction === "up" || direction === "down")) throw new Error("stairs needs north, south, east or west");
      if (up && !stairs) throw new Error("up only works together with stairs:true");
      const { conn } = await pick(instance);
      await closeScreen(conn);
      const start = await hazard(conn);
      if (start) throw new Error(start);
      const before = (await call(conn, "/observe")).inventory;
      const d = DIGS[direction];
      let me = (await call(conn, "/observe")).player.pos;
      let at = cell({ x: me.x, y: me.y + 0.1, z: me.z });
      let dug = 0, stopped, reachedTop = false;
      for (let i = 0; i < length; i++) {
        const hz = await hazard(conn);
        if (hz) { stopped = hz; break; }
        // Staircase step down: clear head height, feet height and one below ahead, then step forward and down.
        // Staircase step up: the block ahead is the step; clear above it (feet, head) and above our own head, then step up.
        const climb = stairs && up;
        let next = climb ? add(at, [d[0], 1, d[2]]) : stairs ? add(at, [d[0], -1, d[2]]) : add(at, d);
        let cellsToClear = climb ? [add(at, [0, 2, 0]), add(next, [0, 1, 0]), next]
          : stairs ? [add(next, [0, 2, 0]), add(next, [0, 1, 0]), next]
          : d[1] === 0 ? [next, add(next, [0, 1, 0])] : [next];
        if (climb) {
          // Done only under open sky; a cave or tunnel is not "the top".
          if (await openSky(conn, at)) { reachedTop = true; break; }
          const ahead = add(at, [d[0], 0, d[2]]);
          const [step, floor] = await inspect(conn, [ahead, add(ahead, [0, -1, 0])]);
          if (!step.solid) {
            // Open floor ahead (a cave): walk one block toward the next wall instead of stopping.
            if (!floor.solid) { stopped = `drop ahead at ${ahead.x},${ahead.y - 1},${ahead.z} (${floor.id.replace("minecraft:", "")}); try another direction`; break; }
            next = ahead;
            cellsToClear = [add(ahead, [0, 1, 0])];
          }
        } else if (stairs) {
          const [floor] = await inspect(conn, [add(next, [0, -1, 0])]);
          if (!floor.solid) { stopped = `no floor to step on at ${next.x},${next.y - 1},${next.z} (${floor.id.replace("minecraft:", "")})`; break; }
        }
        for (const c of cellsToClear) {
          const [b] = await inspect(conn, [c]);
          // Air, and plants/leaf litter you can walk through, need no digging.
          if (/^minecraft:(air|cave_air)$/.test(b.id) || (b.replaceable && !b.fluid)) continue;
          const r = await mineOne(conn, c, { collect: false, allowFluids: false, clearObstacles: true });
          if (r.outcome !== "mined") { stopped = `${r.outcome} at ${c.x},${c.y},${c.z} (${b.id.replace("minecraft:", "")}): ${r.reason}`; break; }
        }
        if (stopped) break;
        if (d[1] === 1) {
          // Going up needs something to stand on: place a block below first is overkill; just stop.
          stopped = "up: dug the cell above but cannot climb without a placed block; use mc_move jump+use pillar";
          dug++;
          break;
        }
        await call(conn, "/goto", 20000, { x: next.x + 0.5, y: next.y, z: next.z + 0.5, tolerance: 0 }).catch(() => {});
        me = (await call(conn, "/observe")).player.pos;
        const now = cell({ x: me.x, y: me.y + 0.1, z: me.z });
        if (now.x !== next.x || now.z !== next.z || Math.abs(now.y - next.y) > 1) { stopped = `could not step into ${next.x},${next.y},${next.z}`; break; }
        at = now; dug++;
      }
      await sleep(400); // let the last drops settle, then sweep any nearby
      await collectNear(conn, at).catch(() => {});
      const after = (await call(conn, "/observe")).inventory;
      return text({ dug, end: at, ...(reachedTop && { reachedTop: true }), ...(stopped && { stopped }), inventoryChange: inventoryDelta(before, after) });
    } catch (e) { return fail(e); }
  },
);

// ---- smelting: one call instead of ~20 slot clicks and waits ------------------------------------------------------

/** Burn time in ticks per fuel item (a furnace smelts one item per 200 ticks). */
const FUELS = [[/^minecraft:(coal|charcoal)$/, 1600], [/_planks$/, 300], [/(_log|_wood|_stem|_hyphae)$/, 300], [/^minecraft:stick$/, 100]];
const fuelTicks = (id) => (FUELS.find(([re]) => re.test(id)) ?? [null, 0])[1];
function fuelRank(id, items) {
  const kind = /(coal|charcoal)$/.test(id) ? "coal" : /_planks$/.test(id) ? "planks" : /stick$/.test(id) ? "stick" : "log";
  const order = items >= 6 ? ["coal", "planks", "log", "stick"] : ["planks", "log", "coal", "stick"];
  return order.indexOf(kind);
}
const SMELT_WAIT_MS = 45000; // stays below MCP client timeouts; count=0 collects the rest later

/** Place `id` from the inventory on floor level about 2 blocks away; returns its position. */
async function placeNearby(conn, id) {
  const me = (await call(conn, "/observe")).player.pos;
  const feet = cell({ x: me.x, y: me.y + 0.4, z: me.z });
  // A ring 2-3 blocks out, nearest first, at heights -2..+1: uneven ground (slopes, forest floor) still has spots.
  const ring = [];
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const d = Math.max(Math.abs(dx), Math.abs(dz));
    if (d >= 2) ring.push([dx, dz, Math.hypot(dx, dz)]);
  }
  ring.sort((a, b) => a[2] - b[2]);
  for (const [dx, dz] of ring) {
    for (const dy of [0, -1, 1, -2]) {
      const at = { x: feet.x + dx, y: feet.y + dy, z: feet.z + dz };
      const [here, below] = await inspect(conn, [at, add(at, [0, -1, 0])]);
      if (!here.replaceable || here.fluid || !below.solid) continue;
      try { await placeOne(conn, at, id); return at; } catch { /* try the next spot */ }
    }
  }
  throw new Error(`found no spot to place ${id} near you`);
}

/** Move `n` items `id` from the player's inventory into menu slot `target`, one right-click per item. */
async function loadSlot(conn, id, n, target) {
  let left = n;
  for (let guard = 0; left > 0 && guard < 10; guard++) {
    const c = (await call(conn, "/observe")).container;
    const src = c.slots.find((x) => x.id === id && (x.section === "inventory" || x.section === "hotbar"));
    if (!src) break;
    await call(conn, "/click", 4000, { slot: src.slot, mode: "pickup", button: "left" });
    const k = Math.min(left, src.count);
    for (let i = 0; i < k; i++) await call(conn, "/click", 4000, { slot: target, mode: "pickup", button: "right" });
    left -= k;
    if ((await call(conn, "/observe")).container?.carried) await call(conn, "/click", 4000, { slot: src.slot, mode: "pickup", button: "left" });
  }
  return n - left;
}

server.tool(
  "mc_smelt",
  "Smelt items in a furnace in ONE call: uses a furnace within 6 blocks (or places the one you carry about 2 blocks " +
    "away), puts `count` of `item` in, adds enough fuel from your inventory (coal, charcoal, planks, logs or sticks; " +
    "`fuel` picks one), waits until they are done (10 s per item, up to 45 s) and takes the output. If some are still " +
    "smelting when it returns, call it again with count 0 to wait for and collect the rest. Requires actions.",
  {
    item: z.string().describe("What to smelt, e.g. \"raw_iron\", \"oak_log\""),
    count: z.number().int().min(0).max(64).describe("How many; 0 = only wait for and collect what is already smelting"),
    fuel: z.string().optional(),
    instance: instanceArg,
  },
  async ({ item, count, fuel, instance }) => {
    try {
      const { conn } = await pick(instance);
      await closeScreen(conn);
      const start = await hazard(conn);
      if (start) throw new Error(start);
      const id = fullId(item);
      const before = (await call(conn, "/observe")).inventory;
      const have = (x) => before.filter((i) => i.id === x).reduce((n, i) => n + i.count, 0);
      if (have(id) < count) throw new Error(`you have ${have(id)} ${id}, need ${count}`);

      let furnace, placed = false;
      const found = await call(conn, "/find", 6000, { block: "minecraft:furnace", radius: 6, limit: 1 });
      if (found.results?.length) furnace = found.results[0].pos;
      else if (have("minecraft:furnace")) { furnace = await placeNearby(conn, "minecraft:furnace"); placed = true; }
      else throw new Error("no furnace within 6 blocks and none in your inventory (craft one: 8 cobblestone)");

      if (!(await getInReach(conn, furnace))) throw new Error(`could not get within reach of the furnace at ${furnace.x},${furnace.y},${furnace.z}`);
      // Right after another screen closed the click can be ignored, or the aim can land on something else: retry once.
      let c = null;
      for (let attempt = 0; attempt < 2 && !(c && /furnace/.test(c.menu ?? "")); attempt++) {
        if (attempt) { await closeScreen(conn); await sleep(400); }
        const look = await call(conn, "/look", 4000, { at: { x: furnace.x + 0.5, y: furnace.y + 0.5, z: furnace.z + 0.5 } });
        if (!same(look.target?.pos, furnace)) {
          if (attempt) throw new Error(`can't see the furnace at ${furnace.x},${furnace.y},${furnace.z}${look.target?.id ? `: ${look.target.id} is in the way` : ""}`);
          await call(conn, "/goto", 20000, { x: furnace.x, y: furnace.y, z: furnace.z, tolerance: 2 }).catch(() => {});
          continue;
        }
        await call(conn, "/interact", 4000, { action: "use" });
        await sleep(300);
        c = (await call(conn, "/observe")).container;
      }
      if (!c || !/furnace/.test(c.menu ?? "")) throw new Error("the furnace did not open");
      const at = (n) => c.slots.find((x) => x.slot === n);

      // Output from earlier smelting belongs to the player: take it first.
      if (at(2)) { await call(conn, "/click", 4000, { slot: 2, mode: "quick_move" }); c = (await call(conn, "/observe")).container; }
      if (at(0) && at(0).id !== id && count > 0) throw new Error(`the furnace is busy smelting ${at(0).id}; use another furnace or wait`);
      const loaded = count > 0 ? await loadSlot(conn, id, count, 0) : 0;

      // Fuel for everything in the input slot, minus what is already in the fuel slot.
      c = (await call(conn, "/observe")).container;
      const toSmelt = at(0)?.count ?? 0;
      let fuelUsed = null;
      const needTicks = toSmelt * 200 - (at(1) ? fuelTicks(at(1).id) * at(1).count : 0);
      if (needTicks > 0) {
        const inv = c.slots.filter((x) => x.section === "inventory" || x.section === "hotbar");
        const candidates = fuel ? [fullId(fuel)] : [...new Set(inv.map((x) => x.id))]
          .filter((x) => fuelTicks(x) > 0 && x !== id && (!at(1) || at(1).id === x))
          // Coal/charcoal (8 items each) only pays off for big batches; small ones burn planks or logs. Sticks last:
          // they are needed for tools and torches.
          .sort((a, b) => fuelRank(a, toSmelt) - fuelRank(b, toSmelt));
        const f = candidates[0];
        if (!f) throw new Error("no fuel in your inventory (coal, charcoal, planks, logs or sticks)");
        const units = Math.ceil(needTicks / fuelTicks(f));
        const put = await loadSlot(conn, f, units, 1);
        fuelUsed = { id: f, count: put, ...(put < units && { warning: `only ${put} of the ${units} needed` }) };
      }

      // Wait for the output.
      const deadline = Date.now() + Math.min(SMELT_WAIT_MS, toSmelt * 10000 + 8000); // the furnace starts a moment late
      let out = 0;
      while (Date.now() < deadline) {
        await sleep(2000);
        c = (await call(conn, "/observe")).container;
        if (!c) break;
        out = at(2)?.count ?? 0;
        if (out >= toSmelt) break;
      }
      const outId = c ? at(2)?.id : undefined;
      if (c && out > 0) await call(conn, "/click", 4000, { slot: 2, mode: "quick_move" });
      c = (await call(conn, "/observe")).container;
      const still = c ? at(0)?.count ?? 0 : 0;
      await call(conn, "/screen", 4000, { action: "close" }).catch(() => {});
      const after = (await call(conn, "/observe")).inventory;
      return text({
        loaded, collected: out, ...(outId && { output: outId }),
        ...(still && { stillSmelting: still, next: `call mc_smelt item=${item} count=0 in about ${still * 10} s to collect them` }),
        furnace, ...(placed && { placedFurnace: true, note: "mine the furnace back (mc_mine pos) to take it with you" }),
        ...(fuelUsed && { fuel: fuelUsed }), inventoryChange: inventoryDelta(before, after),
      });
    } catch (e) { return fail(e); }
  },
);

// ---- dropping items onto a block (millstone input, etc.) ---------------------------------------------------------

server.tool(
  "mc_drop",
  "Drop items onto the top of a block in ONE call, e.g. cobblestone into a millstone (it takes items that fall onto " +
    "it). Stands on top of the block, looks straight down and throws `count` items one by one (thrown from beside, " +
    "most land short), then steps back to where you were. Returns how many left your inventory and how many still " +
    "lie loose on top (0 = all went in). Requires actions.",
  {
    item: z.string(),
    count: z.number().int().min(1).max(64),
    onto: z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() }).describe("The block to drop onto"),
    instance: instanceArg,
  },
  async ({ item, count, onto, instance }) => {
    try {
      const { conn } = await pick(instance);
      await closeScreen(conn);
      const id = fullId(item);
      const before = (await call(conn, "/observe")).inventory;
      const have = before.filter((i) => i.id === id).reduce((n, i) => n + i.count, 0);
      if (have < count) throw new Error(`you have ${have} ${id}, need ${count}`);
      const back = (await call(conn, "/observe")).player.pos;
      const top = { x: onto.x, y: onto.y + 1, z: onto.z };
      const onTop = async () => { const me = (await call(conn, "/observe")).player.pos; return same(cell({ x: me.x, y: me.y + 0.1, z: me.z }), top); };
      // Straight onto the top; if the path fails (slopes), step up from a free cell beside it.
      await call(conn, "/goto", 20000, { ...top, tolerance: 0 }).catch(() => {});
      if (!(await onTop())) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const side = { x: onto.x + dx, y: onto.y, z: onto.z + dz };
          const [here, head, floor] = await inspect(conn, [side, add(side, [0, 1, 0]), add(side, [0, -1, 0])]);
          if (!here.replaceable || here.fluid || !head.replaceable || !floor.solid) continue;
          await call(conn, "/goto", 20000, { ...side, tolerance: 0 }).catch(() => {});
          await call(conn, "/goto", 20000, { ...top, tolerance: 0 }).catch(() => {});
          if (await onTop()) break;
        }
      }
      if (!(await onTop())) throw new Error(`could not stand on top of ${onto.x},${onto.y},${onto.z}; make a step beside it (place a block) and retry`);
      await call(conn, "/look", 4000, { pitch: 90 });
      let c = (await call(conn, "/screen", 4000, { action: "open_inventory" })).container;
      let thrown = 0;
      while (thrown < count) {
        const src = c.slots.find((x) => x.id === id && (x.section === "inventory" || x.section === "hotbar"));
        if (!src) break;
        const k = Math.min(count - thrown, src.count);
        for (let i = 0; i < k; i++) { await call(conn, "/click", 4000, { slot: src.slot, mode: "throw" }); await sleep(250); }
        thrown += k;
        c = (await call(conn, "/observe")).container;
      }
      await call(conn, "/screen", 4000, { action: "close" }).catch(() => {});
      await sleep(1500);
      const o = await call(conn, "/observe");
      const loose = (o.entities ?? []).filter((e) => /item/.test(e.id) && Math.abs(e.pos.x - (onto.x + 0.5)) < 0.8 &&
        Math.abs(e.pos.z - (onto.z + 0.5)) < 0.8 && e.pos.y >= onto.y + 0.9 && e.pos.y < onto.y + 1.6).length;
      await call(conn, "/goto", 20000, { x: Math.floor(back.x), y: Math.floor(back.y + 0.1), z: Math.floor(back.z), tolerance: 1 }).catch(() => {});
      const after = (await call(conn, "/observe")).inventory;
      return text({ thrown, onto, looseOnTop: loose, inventoryChange: inventoryDelta(before, after) });
    } catch (e) { return fail(e); }
  },
);

// ---- settlement layer: persistent tasks, blueprints, safety watchdog, handoff (TypeScript, run via Node type stripping)
try {
  const { registerSettlementTools } = await import("./settlement/src/tools.ts");
  registerSettlementTools(server, { pick, call, mineOne, placeOne, holdItem });
} catch (e) {
  // The base tools must keep working even if the settlement layer fails to load.
  process.stderr.write(`settlement tools disabled: ${e?.stack ?? e}\n`);
}

await server.connect(new StdioServerTransport());
