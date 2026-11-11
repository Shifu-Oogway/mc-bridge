#!/usr/bin/env node
// Prepare a fresh data-collection run on the same world: drop the whole inventory and walk ~200 blocks away, so the
// next curriculum run starts empty-handed on untouched ground (new trees, stone, ore).
//
//   node new-run.js --instance remote [--distance 200] [--direction north|south|east|west|northeast|...]
//
// Walks in hops of ~24 blocks with mc_goto. Before each hop it samples the ground surface along the way and picks
// another direction (45 or 90 degrees off) if there is water or lava; if the character still ends up under water it
// swims back to the last dry spot. Stops (exit 1) on low health, the death screen, or if it cannot get out of water.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIRS = { north: [0, -1], northeast: [1, -1], east: [1, 0], southeast: [1, 1], south: [0, 1], southwest: [-1, 1], west: [-1, 0], northwest: [-1, -1] };
const NAMES = Object.keys(DIRS);

const a = { instance: undefined, distance: 200, direction: NAMES[Math.floor(Math.random() * NAMES.length)] };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i], v = () => process.argv[++i];
  if (k === "--instance") a.instance = v();
  else if (k === "--distance") a.distance = Number(v());
  else if (k === "--direction") { a.direction = v(); if (!DIRS[a.direction]) throw new Error(`direction: ${NAMES.join("|")}`); }
  else throw new Error(`unknown argument ${k}`);
}

const client = new Client({ name: "new-run", version: "0.0.1" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(HERE, "index.js")] }));
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: { ...(a.instance && { instance: a.instance }), ...args } }, undefined, { timeout: 120000 });
  const text = (r.content ?? []).map((p) => p.text ?? "").join("");
  if (r.isError) throw new Error(`${name}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
};
const observe = () => call("mc_observe", { full: true });
const done = async (code, msg) => { console.log(msg); await client.close(); process.exit(code); };

async function danger() {
  const o = await observe();
  if (/DeathScreen/.test(o.screen ?? "")) return "the character died; respawn in the game";
  if (o.player.health < 10) return `health is ${o.player.health}`;
  const p = o.player.pos;
  const head = (await call("mc_blocks", { positions: [{ x: Math.floor(p.x), y: Math.floor(p.y + 1.6), z: Math.floor(p.z) }] })).blocks[0];
  if (/water/.test(`${head.fluid ?? ""} ${head.id}`)) return "head under water";
  return null;
}

/** Top block (first non-air from above) at x,z around height y: its id, or null if none found. */
async function surface(x, z, y) {
  const col = Array.from({ length: 30 }, (_, k) => ({ x, y: Math.floor(y) + 14 - k, z }));
  const top = (await call("mc_blocks", { positions: col })).blocks.find((b) => !/air$/.test(b.id) && !/leaves|leaf_litter|short_grass|tall_grass|fern|flower|bush/.test(b.id));
  return top ? `${top.fluid ?? ""} ${top.id}` : null;
}
/** True if the next `len` blocks in direction (dx,dz) from p are dry land (sampled every 4 blocks). */
async function dryAhead(p, dx, dz, len) {
  const n = Math.hypot(dx, dz);
  for (let k = 4; k <= len; k += 4) {
    const top = await surface(Math.floor(p.x + (dx / n) * k), Math.floor(p.z + (dz / n) * k), p.y);
    if (!top || /water|lava/.test(top)) return false;
  }
  return true;
}
/** Swim toward `dry` in bursts; true once the head is out of water and the feet are on ground. */
async function swimTo(dry) {
  for (let i = 0; i < 10; i++) {
    const p = (await observe()).player.pos;
    const yaw = Math.atan2(-(dry.x - p.x), dry.z - p.z) * 180 / Math.PI;
    await call("mc_look", { yaw, pitch: -20 });
    await call("mc_move", { keys: ["forward", "jump"], ticks: 40 }).catch(() => {});
    const o = await observe();
    const q = o.player.pos;
    const head = (await call("mc_blocks", { positions: [{ x: Math.floor(q.x), y: Math.floor(q.y + 1.6), z: Math.floor(q.z) }] })).blocks[0];
    if (!/water/.test(`${head.fluid ?? ""} ${head.id}`) && o.player.onGround) return true;
  }
  return false;
}

// 1. Drop everything (whole stacks).
await call("mc_stop").catch(() => {});
let o = await observe();
if (o.screen) await call("mc_screen", { action: "close" }).catch(() => {});
const stacks = (o.inventory ?? []).length;
if (stacks) {
  const c = (await call("mc_screen", { action: "open_inventory" })).container;
  for (const s of c.slots.filter((x) => x.section === "inventory" || x.section === "hotbar")) {
    await call("mc_click_slot", { slot: s.slot, mode: "throw", button: "right" });
  }
  await call("mc_screen", { action: "close" }).catch(() => {});
}
o = await observe();
console.log(`dropped ${stacks} stacks; inventory now has ${(o.inventory ?? []).length} stacks`);

// 2. Walk ~distance blocks away.
const start = o.player.pos;
let dirIdx = NAMES.indexOf(a.direction), stalls = 0;
let lastDry = { ...start };
console.log(`start ${start.x.toFixed(0)},${start.y.toFixed(0)},${start.z.toFixed(0)}; heading ${a.direction} for ${a.distance} blocks`);
for (let hop = 0; hop < 60; hop++) {
  const p = (await observe()).player.pos;
  const gone = Math.hypot(p.x - start.x, p.z - start.z);
  if (gone >= a.distance) {
    await done(0, `arrived: ${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}, ${gone.toFixed(0)} blocks from the start`);
  }
  // Prefer the current heading; else 45 then 90 degrees off either way, whichever is dry land.
  let picked = -1;
  for (const off of [0, 1, -1, 2, -2]) {
    const idx = (dirIdx + off + NAMES.length) % NAMES.length;
    const [ddx, ddz] = DIRS[NAMES[idx]];
    if (await dryAhead(p, ddx, ddz, 24)) { picked = idx; break; }
  }
  if (picked < 0) { dirIdx = (dirIdx + 4) % NAMES.length; console.log(`water ahead everywhere; turning to ${NAMES[dirIdx]}`); continue; }
  dirIdx = picked;
  const [dx, dz] = DIRS[NAMES[dirIdx]];
  const n = Math.hypot(dx, dz);
  const target = { x: Math.round(p.x + (dx / n) * 24), z: Math.round(p.z + (dz / n) * 24) };
  const r = await call("mc_goto", { ...target, tolerance: 3 }).catch((e) => ({ outcome: "error", reason: e.message }));
  const q = (await observe()).player.pos;
  const moved = Math.hypot(q.x - p.x, q.z - p.z);
  let bad = await danger();
  if (bad === "head under water") {
    console.log(`in water at ${q.x.toFixed(0)},${q.y.toFixed(0)},${q.z.toFixed(0)}; swimming back to the last dry spot`);
    if (await swimTo(lastDry)) { dirIdx = (dirIdx + 2) % NAMES.length; bad = null; continue; }
  }
  if (bad) await done(1, `stopped: ${bad} at ${q.x.toFixed(0)},${q.y.toFixed(0)},${q.z.toFixed(0)}`);
  lastDry = { ...q };
  console.log(`hop ${hop + 1} ${NAMES[dirIdx]}: ${r.outcome ?? "?"}, moved ${moved.toFixed(0)}, now ${Math.hypot(q.x - start.x, q.z - start.z).toFixed(0)} from start`);
  if (moved < 6) { if (++stalls >= 2) { dirIdx = (dirIdx + 1) % NAMES.length; stalls = 0; } } else stalls = 0;
}
const p = (await observe()).player.pos;
await done(1, `gave up after 60 hops at ${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}, ${Math.hypot(p.x - start.x, p.z - start.z).toFixed(0)} blocks from the start`);
