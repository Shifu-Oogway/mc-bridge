// MCP tools for the settlement layer: persistent bounded tasks, blueprint execution/verification, a local safety
// watchdog, checkpoints and the controller handoff. Built only on the bridge routes index.js already uses.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import * as B from "./blueprint.ts";
import { TaskRunner, TaskStore, Cancelled, type Skill } from "./tasks.ts";
import { evaluate, retreatPoint, DEFAULT_LIMITS, type SafetyLimits } from "./safety.ts";
import { stairStep, branchCell, leakNeighbours, retracePath, addCrumb, tunnelPath, stairCells, tunnelConflicts, type Dir } from "./mine.ts";
import { openWorld, worldKey, loadPlan, savePlan, renderHandoff, type Plan, type WorldId } from "./world.ts";

type Conn = unknown;
type Pos = { x: number; y: number; z: number };
export interface Deps {
  pick(name?: string): Promise<{ name: string; dir: string; conn: Conn; hello: Record<string, unknown> }>;
  call(conn: Conn, route: string, timeoutMs?: number, body?: unknown): Promise<any>;
  mineOne(conn: Conn, pos: Pos, o: { collect: boolean; allowFluids: boolean; clearObstacles?: boolean }): Promise<{ outcome: string; reason?: string; id?: string }>;
  placeOne(conn: Conn, target: Pos, item?: string): Promise<{ placed: string }>;
  holdItem(conn: Conn, id: string): Promise<unknown>;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const BLUEPRINTS = path.join(ROOT, "blueprints");
const STATE = path.resolve(ROOT, "..", "plans", "medieval");
const PLAN_FILE = path.join(STATE, "plan.json");
const TASK_FILE = path.join(STATE, "tasks.json");
const HANDOFF = path.join(STATE, "HANDOFF.md");

interface Config { instance?: string; expectWorld?: { folder: string; seed: string }; safety?: Partial<SafetyLimits>; taskTimeoutMin?: number }
function loadConfig(): Config {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8")); } catch { return {}; }
}

const text = (o: unknown) => ({ content: [{ type: "text" as const, text: typeof o === "string" ? o : JSON.stringify(o, null, 1) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: String((e as Error)?.message ?? e) }] });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const full = (id: string) => (id.includes(":") ? id : `minecraft:${id}`);
const NATURAL = /:(dirt|grass_block|coarse_dirt|rooted_dirt|podzol|mud|sand|red_sand|gravel|clay|stone|granite|diorite|andesite|tuff|deepslate|cobblestone|short_grass|tall_grass|fern|large_fern|dandelion|poppy|.*_tulip|oxeye_daisy|cornflower|azure_bluet|allium|blue_orchid|lily_of_the_valley|.*_leaves|snow|.*_sapling|sweet_berry_bush|dead_bush|moss_carpet|moss_block|pumpkin|melon|sugar_cane|vine)$/;

export function loadBlueprint(id: string): B.Blueprint {
  const file = path.join(BLUEPRINTS, `${id}.json`);
  const bp = JSON.parse(fs.readFileSync(file, "utf8")) as B.Blueprint;
  const errs = B.validate(bp);
  if (errs.length) throw new Error(`blueprint ${id} invalid: ${errs.slice(0, 5).join("; ")}`);
  return bp;
}

function invCounts(obs: any): Record<string, number> {
  const m: Record<string, number> = {};
  for (const i of obs.inventory ?? []) m[i.id] = (m[i.id] ?? 0) + i.count;
  return m;
}

function inBox(p: Pos, f: { from: Pos; to: Pos }, pad = 0) {
  return p.x >= f.from.x - pad && p.x <= f.to.x + pad && p.y >= f.from.y - pad && p.y <= f.to.y + pad && p.z >= f.from.z - pad && p.z <= f.to.z + pad;
}

export function registerSettlementTools(server: any, deps: Deps) {
  const cfg = loadConfig();
  const limits: SafetyLimits = { ...DEFAULT_LIMITS, ...(cfg.safety ?? {}) };
  let plan: Plan = loadPlan(PLAN_FILE);
  const persist = () => savePlan(PLAN_FILE, plan);
  const conn = async () => (await deps.pick(cfg.instance)).conn;

  async function currentWorld(): Promise<WorldId | null> {
    const inst = await deps.pick(cfg.instance);
    return openWorld(inst.dir);
  }
  /** Refuse to act when the open world is not the one the plan (or config) belongs to. */
  async function requireWorld(): Promise<string> {
    const w = await currentWorld();
    if (!w) throw new Error("no open world detected (is a save loaded in the client?)");
    const want = cfg.expectWorld ?? plan.world;
    if (want && (want.folder !== w.folder || (want.seed !== "?" && w.seed !== "?" && want.seed !== w.seed))) {
      throw new Error(`world mismatch: plan is for ${want.folder}#${want.seed}, open is ${w.folder}#${w.seed}. Nothing was done.`);
    }
    return worldKey(w)!;
  }

  /** Footprints of every placed build: gathering never mines inside them (building itself may clear its own cells). */
  function reserved(): { name: string; from: Pos; to: Pos }[] {
    const out = [];
    for (const [name, b] of Object.entries(plan.builds)) {
      try { out.push({ name, ...B.footprint(loadBlueprint(name.split("@")[0]), { origin: b.origin, facing: b.facing as B.Facing }) }); } catch { /* missing file */ }
    }
    return out;
  }

  /** Tools live in the hotbar: crafting and pickups push them into the main inventory, where mining can't use them. */
  async function ensureTools(c: Conn) {
    const inv = (await deps.call(c, "/observe")).inventory as { slot: number; id: string }[];
    for (const kind of ["pickaxe", "axe", "shovel"]) {
      const best = ["netherite", "diamond", "iron", "stone", "golden", "wooden"].map((m) => `minecraft:${m}_${kind}`).find((id) => inv.some((i) => i.id === id));
      if (best && !inv.some((i) => i.id === best && i.slot < 9)) await deps.holdItem(c, best).catch(() => {});
    }
  }

  // ---- skills (idempotent: they converge on a target state) ---------------------------------------------------

  const gather: Skill = async (args, ctx) => {
    const block = String(args.block);
    const item = full(String(args.item ?? args.block));
    const target = Number(args.target ?? 16);
    const radius = Math.min(32, Number(args.radius ?? 24));
    const c = await conn();
    await ensureTools(c);
    let fails = 0, streak = 0;
    const tried = new Set<string>();
    for (;;) {
      ctx.checkpoint();
      const have = invCounts(await deps.call(c, "/observe"))[item] ?? 0;
      ctx.progress(have, target, `${item} ${have}/${target}`);
      if (have >= target) return { item, have };
      const found = await deps.call(c, "/find", 6000, { block, radius, limit: 50, exposedOnly: true });
      const res = reserved();
      const minY = args.minY === undefined ? -Infinity : Number(args.minY);
      const next = (found.results ?? []).find((f: any) => f.pos.y >= minY && !tried.has(`${f.pos.x},${f.pos.y},${f.pos.z}`) && !res.some((r) => inBox(f.pos, r, 1)));
      if (!next) throw new Error(`no more exposed ${block} within ${radius} blocks outside reserved plots (have ${have}/${target})`);
      tried.add(`${next.pos.x},${next.pos.y},${next.pos.z}`);
      let r = await deps.mineOne(c, next.pos, { collect: true, allowFluids: Boolean(args.allowFluids) });
      // A natural block (dirt, sand, stone...) hiding the target: clear it on purpose, outside reserved plots, then retry.
      const m = /^(minecraft:[a-z_]+) at (-?\d+),(-?\d+),(-?\d+) is in the way/.exec(r.reason ?? "");
      if (r.outcome !== "mined" && m && NATURAL.test(m[1])) {
        const pos = { x: +m[2], y: +m[3], z: +m[4] };
        if (!res.some((rr) => inBox(pos, rr, 1))) {
          const cleared = await deps.mineOne(c, pos, { collect: true, allowFluids: Boolean(args.allowFluids) });
          if (cleared.outcome === "mined") r = await deps.mineOne(c, next.pos, { collect: true, allowFluids: Boolean(args.allowFluids) });
        }
      }
      if (r.outcome === "mined") { streak = 0; continue; }
      fails++; streak++;
      if (streak >= 4 || fails >= 12) throw new Error(`gather stuck: ${fails} failures, last: ${r.reason ?? r.outcome}`);
    }
  };

  const buildStage: Skill = async (args, ctx) => {
    const name = String(args.build);
    const b = plan.builds[name];
    if (!b) throw new Error(`build ${name} is not placed; use mc_blueprint action place first`);
    const bp = loadBlueprint(name.split("@")[0]);
    const stage = String(args.stage);
    if (!bp.stages.some((s) => s.id === stage)) throw new Error(`no stage ${stage} in ${bp.id}`);
    const cells = B.expand(bp, { origin: b.origin, facing: b.facing as B.Facing }, { stages: [stage], substitutions: b.substitutions });
    const c = await conn();
    await ensureTools(c);
    const look = async (cs: B.Cell[]) => {
      const out: any[] = [];
      for (let i = 0; i < cs.length; i += 64) out.push(...(await deps.call(c, "/blocks", 6000, { positions: cs.slice(i, i + 64).map((x) => x.pos) })).blocks);
      return out;
    };
    // Material pre-check against what is still missing, so a shortage is reported before half a wall goes up.
    let obs = await look(cells);
    const todo = cells.filter((cl, i) => B.classify(cl, obs[i]) === "missing");
    const need = B.materials(todo);
    const inv = invCounts(await deps.call(c, "/observe"));
    const short: Record<string, number> = {};
    for (const [it, n] of Object.entries(need)) if ((inv[it] ?? 0) < n) short[it] = n - (inv[it] ?? 0);
    if (Object.keys(short).length && !args.partial) {
      plan.shortages = { ...plan.shortages, ...short }; persist();
      throw new Error(`material shortage for ${name}/${stage}: ${JSON.stringify(short)} (pass partial:true to place what is available)`);
    }
    const issues: { pos: Pos; why: string }[] = [];
    const fpw = B.footprint(bp, { origin: b.origin, facing: b.facing as B.Facing });
    const centre = { x: (fpw.from.x + fpw.to.x) / 2, z: (fpw.from.z + fpw.to.z) / 2 };
    // Scaffold blocks are persisted, so a crash or failure never leaves untracked pillars behind.
    plan.scaffold ??= [];
    const scaffold = plan.scaffold;
    let done = 0;
    // Two passes: a cell with nothing to click against yet (e.g. a corner eave) waits until its layer neighbours exist.
    const deferred: B.Cell[] = [];
    let pass = 1;
    // Debug/partial runs: only cells whose id matches `only`, at most `limit` of them.
    let queue = cells.filter((x) => !args.only || new RegExp(String(args.only)).test(x.id)).slice(0, Number(args.limit ?? 1e9));
    const trace = (m: string) => process.stderr.write(`[build ${stage}] ${m}\n`);
    try {
    while (queue.length) {
    for (let i = 0; i < queue.length; i++) {
      ctx.checkpoint();
      const cl = queue[i];
      const [o] = await deps.call(c, "/blocks", 4000, { positions: [cl.pos] }).then((r: any) => r.blocks);
      let st = B.classify(cl, o);
      if (/_stairs$/.test(cl.id)) trace(`pass ${pass} ${cl.pos.x},${cl.pos.y},${cl.pos.z} ${st} have ${o.id}`);
      if (st === "obstructed") {
        const natural = NATURAL.test(o.id) || (Boolean(args.clearTrees) && /_log$/.test(o.id));
        if (!natural) { issues.push({ pos: cl.pos, why: `occupied by ${o.id} (not natural, left alone)` }); continue; }
        const m = await deps.mineOne(c, cl.pos, { collect: true, allowFluids: false });
        if (m.outcome !== "mined") { issues.push({ pos: cl.pos, why: `clear ${o.id}: ${m.reason ?? m.outcome}` }); continue; }
        st = /:air$/.test(cl.id) ? "ok" : "missing";
      }
      if (st === "wrong_state" && /_(stairs|door|trapdoor|fence_gate)$/.test(cl.id) && !/_door$/.test(cl.id)) {
        // Our own block placed facing the wrong way: take it back and place it again from the right side.
        const m = await deps.mineOne(c, cl.pos, { collect: true, allowFluids: false });
        if (m.outcome === "mined") st = "missing";
      }
      if (st === "missing") {
        const it = B.itemFor(cl.id, cl.props);
        if (it) {
          const stand = /_stairs$/.test(cl.id) ? null : B.standFor(cl);
          const f = cl.props.facing as B.Facing | undefined;
          const isStair = /_stairs$/.test(cl.id) && Boolean(f && B.DIR[f]);
          if (isStair) {
            // Stairs face the way the player looks: stand directly behind the cell (opposite its facing) with the feet
            // at the cell's own height (on a pillar for the eave, on the previous roof row above it), so the look is
            // level and along the facing. If that spot can't be reached, never place from elsewhere (wrong facing).
            try {
              await elevateAt(c, cl.pos, { x: cl.pos.x - B.DIR[f!].x, z: cl.pos.z - B.DIR[f!].z }, scaffold, cl.pos.y);
            } catch (e) {
              trace(`  elevate failed: ${(e as Error).message}`);
              if (pass === 1) { deferred.push(cl); continue; }
              issues.push({ pos: cl.pos, why: `stair stand point: ${(e as Error).message.slice(0, 100)}` }); continue;
            }
          }
          if (stand) await deps.call(c, "/goto", 66000, { ...stand, tolerance: 0 }).catch(() => {});
          try { await deps.placeOne(c, cl.pos, it.item); }
          catch (e) {
            // Usually a bad approach (path ended far away or the face was hidden): walk right next to it and retry once.
            const msg = (e as Error).message;
            let ok = false;
            if (isStair) {
              trace(`  place failed: ${msg}`);
              // Moving elsewhere would change the facing: defer to the second pass instead.
              if (pass === 1) { deferred.push(cl); continue; }
              issues.push({ pos: cl.pos, why: `place ${it.item} from its stand point: ${msg.slice(0, 100)}` }); continue;
            }
            if (/reach|no usable face|standing in that spot/.test(msg)) {
              // One retry only (no walking in circles): stand on the inside of the building with the eyes above
              // the support's top face, raising a temporary dirt scaffold under the stand point if needed.
              try { await elevateNear(c, cl.pos, centre, scaffold); await deps.placeOne(c, cl.pos, it.item); ok = true; }
              catch (e2) {
                if (pass === 1 && /no usable face/.test((e2 as Error).message)) { deferred.push(cl); continue; }
                issues.push({ pos: cl.pos, why: `place ${it.item} after raising: ${(e2 as Error).message.slice(0, 100)}` }); continue;
              }
            }
            if (!ok) { issues.push({ pos: cl.pos, why: `place ${it.item}: ${msg.slice(0, 120)}` }); continue; }
          }
          const [after] = await deps.call(c, "/blocks", 4000, { positions: [cl.pos] }).then((r: any) => r.blocks);
          const v = B.classify(cl, after);
          if (v === "wrong_state") issues.push({ pos: cl.pos, why: `placed with wrong state ${JSON.stringify(after.properties)} want ${JSON.stringify(cl.props)}` });
          else if (v !== "ok") issues.push({ pos: cl.pos, why: `after placing: ${v} (${after.id})` });
        }
      } else if (st === "wrong_state") issues.push({ pos: cl.pos, why: `existing block has wrong state ${JSON.stringify(o.properties)}` });
      done++;
      if (done % 8 === 0) ctx.progress(i + 1, cells.length, `${issues.length} issues`);
      if (issues.length > 24) throw new Error(`too many placement issues; first: ${JSON.stringify(issues.slice(0, 4))}`);
    }
    queue = pass === 1 ? deferred.splice(0) : [];
    pass++;
    }
    } finally {
      await removeScaffold(c, scaffold).catch(() => {});
    }
    obs = await look(cells);
    const sum = B.summarize(cells, obs);
    if (sum.complete) {
      b.completedStages = [...new Set([...b.completedStages, stage])];
      plan.log.push({ at: new Date().toISOString(), note: `stage ${name}/${stage} verified complete` });
    } else {
      plan.failures.push({ at: new Date().toISOString(), what: `${name}/${stage}: ${sum.counts.missing} missing, ${sum.counts.wrong_state} wrong state, ${sum.counts.obstructed} obstructed` });
    }
    persist();
    return { complete: sum.complete, counts: sum.counts, issues: issues.slice(0, 60), firstProblems: sum.problems.slice(0, 8) };
  };

  /**
   * Get the eyes above the top face of the block under `cell` (feet >= cell.y - 1) within reach of it, standing one
   * column inward from the wall (toward `centre`). If the floor there is too low, pillar up with dirt and remember
   * those blocks in `scaffold` for removal. Needed because blocks above eye level can't be placed from the ground.
   */
  async function elevateNear(c: Conn, cell: Pos, centre: { x: number; z: number }, scaffold: Pos[]) {
    const dx = centre.x - cell.x, dz = centre.z - cell.z;
    // Step perpendicular to the wall the cell lies in: the axis on which it is farther from the centre
    // (a front-wall cell steps along z even when it sits near a corner). Then the other axis as a fallback.
    const zFirst = Math.abs(dz) >= Math.abs(dx);
    const axes = zFirst
      ? [{ x: 0, z: Math.sign(dz) || 1 }, { x: Math.sign(dx) || 1, z: 0 }]
      : [{ x: Math.sign(dx) || 1, z: 0 }, { x: 0, z: Math.sign(dz) || 1 }];
    // Inside first (no scaffold in the street); outside when the interior can't be reached (closed walls/door).
    let lastErr: Error | null = null;
    for (const step of axes) for (const sgn of [1, -1]) {
      try { return await elevateAt(c, cell, { x: cell.x + sgn * step.x, z: cell.z + sgn * step.z }, scaffold); }
      catch (e) { lastErr = e as Error; }
    }
    throw lastErr!;
  }

  async function elevateAt(c: Conn, cell: Pos, col: { x: number; z: number }, scaffold: Pos[], feetY?: number) {
    const want = feetY ?? cell.y - 1; // feet level needed
    // Floor of that column: first solid block at or below want-1.
    // Start at the feet level itself: a block already placed there (e.g. the roof row below) is a floor to stand on.
    const below = await blocks(c, [0, 1, 2, 3, 4, 5, 6].map((d) => ({ x: col.x, y: want - d, z: col.z })));
    const k = below.findIndex((b) => b.solid);
    if (k < 0) throw new Error(`no floor under stand column ${col.x},${col.z}`);
    const floorTop = want - k + 1; // feet level when standing on that floor
    let me = (await deps.call(c, "/observe")).player.pos;
    // goto stops up to ~0.4 off the target, sometimes over the neighbouring column: allow that, then centre exactly.
    const off = () => Math.hypot(me.x - (col.x + 0.5), me.z - (col.z + 0.5));
    if (!(off() < 0.9 && Math.round(me.y) >= want)) {
      // Pathfinding refuses drops over 3: if we're up on a scaffold pillar, come down by mining it first.
      await descendScaffold(c, scaffold, floorTop);
      await deps.call(c, "/goto", 66000, { x: col.x + 0.5, y: floorTop, z: col.z + 0.5, tolerance: 0 }).catch(() => {});
      me = (await deps.call(c, "/observe")).player.pos;
      if (off() >= 0.9) {
        // A raised stand point (e.g. on a roof row) with no walkable way up: pillar up just outside and step across.
        await accessPillar(c, cell, col, floorTop, scaffold);
        await deps.call(c, "/goto", 66000, { x: col.x + 0.5, y: floorTop, z: col.z + 0.5, tolerance: 0 }).catch(() => {});
        me = (await deps.call(c, "/observe")).player.pos;
      }
    }
    if (off() >= 0.9) throw new Error(`could not reach stand column ${col.x},${col.z}`);
    for (let k = 0; k < 3 && off() > 0.2; k++) {
      // Sneak (no falling off edges) straight toward the column centre.
      const dx = col.x + 0.5 - me.x, dz = col.z + 0.5 - me.z;
      await deps.call(c, "/look", 4000, { yaw: Math.atan2(-dx, dz) * 180 / Math.PI, pitch: 0 });
      await deps.call(c, "/move", 8000, { keys: ["forward", "sneak"], ticks: Math.max(2, Math.ceil(off() / 0.065)) });
      me = (await deps.call(c, "/observe")).player.pos;
    }
    if (Math.round(me.y) >= want) return;
    await deps.holdItem(c, "minecraft:cobblestone");
    await deps.call(c, "/look", 4000, { yaw: 0, pitch: 90 });
    for (let n = 0; n < 6; n++) {
      for (let w = 0; w < 10; w++) {
        me = (await deps.call(c, "/observe")).player.pos;
        if (Math.abs(me.y - Math.round(me.y)) < 0.02) break;
        await sleep(150);
      }
      if (Math.round(me.y) >= want) break;
      const placedAt = { x: col.x, y: Math.round(me.y), z: col.z };
      await deps.call(c, "/move", 8000, { keys: ["jump", "use"], ticks: 12 });
      const [pb] = await blocks(c, [placedAt]);
      if (/:(dirt|cobblestone)$/.test(pb.id)) { scaffold.push(placedAt); persist(); }
    }
    if (Math.round(me.y) < want) throw new Error(`scaffold at ${col.x},${col.z} did not reach y${want}`);
  }

  /** While standing on our own scaffold more than 3 above `targetFeet`, mine the block underfoot (drops 1 each time). */
  async function descendScaffold(c: Conn, scaffold: Pos[], targetFeet: number) {
    for (let n = 0; n < 12; n++) {
      const me = (await deps.call(c, "/observe")).player.pos;
      const under = { x: Math.floor(me.x), y: Math.round(me.y) - 1, z: Math.floor(me.z) };
      if (Math.round(me.y) - targetFeet <= 3) return;
      const idx = scaffold.findIndex((q) => q.x === under.x && q.y === under.y && q.z === under.z);
      if (idx < 0) return; // not on our scaffold: leave the world alone
      await ensureTools(c);
      const r = await deps.mineOne(c, under, { collect: true, allowFluids: false });
      if (r.outcome !== "mined") return;
      scaffold.splice(idx, 1);
      persist();
      await sleep(400);
    }
  }

  /**
   * Reach a raised stand point by pillaring up (to feet level `feet`) in the nearest column further out along the
   * cell->col direction that is open to the ground, then let goto walk across to the stand point.
   */
  async function accessPillar(c: Conn, cell: Pos, col: { x: number; z: number }, feet: number, scaffold: Pos[]) {
    const dv = { x: Math.sign(col.x - cell.x), z: Math.sign(col.z - cell.z) };
    if (!dv.x && !dv.z) return;
    for (let s = 1; s <= 6; s++) {
      const p = { x: col.x + dv.x * s, z: col.z + dv.z * s };
      const colBlocks = await blocks(c, Array.from({ length: 12 }, (_, d) => ({ x: p.x, y: feet + 1 - d, z: p.z })));
      const top = colBlocks.findIndex((b) => b.solid);
      if (top < 0) continue;
      const groundFeet = feet + 1 - top + 1;
      if (top < 2 || groundFeet > feet) continue; // blocked above or already high: try further out
      try { await elevateAt(c, { x: p.x, y: feet + 1, z: p.z }, p, scaffold, feet); return; } catch { /* next */ }
    }
  }

  /** Take temporary scaffold blocks down again, top first, from the floor. */
  async function removeScaffold(c: Conn, scaffold: Pos[]) {
    const order = [...scaffold].sort((a, b) => b.y - a.y);
    for (const p of order) {
      const [b] = await blocks(c, [p]);
      if (/:(dirt|cobblestone)$/.test(b.id)) await deps.mineOne(c, p, { collect: true, allowFluids: false });
      const [after] = await blocks(c, [p]);
      const idx = scaffold.findIndex((q) => q.x === p.x && q.y === p.y && q.z === p.z);
      if (!/:(dirt|cobblestone)$/.test(after.id) && idx >= 0) scaffold.splice(idx, 1);
    }
    persist();
  }

  /** Long walks in bounded hops of the bridge's 96-block goto limit. */
  const travel: Skill = async (args, ctx) => {
    const c = await conn();
    const goal = { x: Number(args.x), z: Number(args.z) };
    for (let hop = 0; hop < 20; hop++) {
      ctx.checkpoint();
      const me = (await deps.call(c, "/observe")).player.pos;
      const dx = goal.x - me.x, dz = goal.z - me.z, dist = Math.hypot(dx, dz);
      ctx.progress(hop, 20, `${Math.round(dist)} blocks to go`);
      if (dist <= 4) return { arrived: true, pos: me };
      const step = Math.min(64, dist);
      let r: any;
      try {
        r = await deps.call(c, "/goto", 66000, { x: Math.round(me.x + (dx / dist) * step), z: Math.round(me.z + (dz / dist) * step), tolerance: 2 });
      } catch (e) {
        if (!/not standing on solid ground/.test((e as Error).message)) throw e;
        // Swimming: goto refuses, so swim at the surface toward the goal for 5 s, then retry.
        await deps.call(c, "/look", 4000, { yaw: Math.atan2(-dx, dz) * 180 / Math.PI, pitch: -10 });
        await deps.call(c, "/move", 8000, { keys: ["jump", "forward", "sprint"], ticks: 100 });
        continue;
      }
      if (r.outcome === "interrupted") throw new Cancelled("interrupted by human input");
      if (r.outcome === "blocked") throw new Error(`blocked at ${JSON.stringify(r.pos ?? me)}`);
      if (r.outcome === "partial") {
        // The path may have ended in deep water (happened twice in the northern lake/ocean): surface before going on.
        const p = (await deps.call(c, "/observe")).player.pos;
        const [head] = await blocks(c, [{ x: Math.floor(p.x), y: Math.floor(p.y + 1.6), z: Math.floor(p.z) }]);
        if (head?.fluid) await deps.call(c, "/move", 8000, { keys: ["jump"], ticks: 60 });
      }
    }
    throw new Error("travel: hop budget exhausted");
  };

  const gotoCell = (c: Conn, p: Pos, tol = 0) => deps.call(c, "/goto", 66000, { x: p.x + 0.5, y: p.y, z: p.z + 0.5, tolerance: tol });
  const isAir = (id: string) => /:(air|cave_air|void_air)$/.test(id);
  const blocks = async (c: Conn, ps: Pos[]) => (await deps.call(c, "/blocks", 6000, { positions: ps })).blocks as any[];

  /** Walk back along the breadcrumbs of a task (default: the most recent task that has any), newest point first. */
  const retrace: Skill = async (args, ctx) => {
    const c = await conn();
    const trail = plan.trail ?? [];
    const self = runner.activeTask?.id;
    const task = (args.task as string) ?? [...trail].reverse().find((t) => t.task !== self)?.task;
    if (!task) throw new Error("no breadcrumbs recorded yet");
    const path = retracePath(trail.filter((t) => t.task === task));
    for (let i = 0; i < path.length; i++) {
      ctx.checkpoint();
      ctx.progress(i, path.length, `retracing ${task}: waypoint ${i + 1}/${path.length}`);
      const p = path[i];
      const r = await deps.call(c, "/goto", 66000, { x: p.x, y: Math.round(p.y), z: p.z, tolerance: 1 });
      if (r.outcome === "interrupted") throw new Cancelled("interrupted by human input");
    }
    return { task, waypoints: path.length, end: path[path.length - 1] };
  };

  /** Seal water/lava next to a cell about to be opened by placing cobblestone into the fluid. */
  async function sealAround(c: Conn, cellPos: Pos) {
    const ns = leakNeighbours(cellPos);
    const bs = await blocks(c, ns);
    for (const b of bs) {
      if (!b.fluid) continue;
      try { await deps.placeOne(c, b.pos, "cobblestone"); }
      catch (e) { throw new Error(`could not seal ${b.fluid} at ${b.pos.x},${b.pos.y},${b.pos.z}: ${(e as Error).message.slice(0, 80)}`); }
    }
  }

  /** Open the given cells (top first, re-checking for falling gravel/sand) and make sure the floor is solid. */
  async function openColumn(c: Conn, dig: Pos[], floor: Pos) {
    for (let pass = 0; pass < 4; pass++) {
      const bs = await blocks(c, dig);
      const todo = bs.filter((b) => !isAir(b.id)).sort((a, b) => b.pos.y - a.pos.y);
      if (!todo.length) break;
      for (const b of todo) {
        if (b.fluid) { await deps.placeOne(c, b.pos, "cobblestone").catch(() => {}); }
        await sealAround(c, b.pos);
        let r = await deps.mineOne(c, b.pos, { collect: true, allowFluids: false, clearObstacles: true });
        if (r.outcome !== "mined" && /can harvest/.test(r.reason ?? "")) {
          // Usually the pickaxe just broke while spares sit in the main inventory: re-equip and retry once.
          await ensureTools(c);
          r = await deps.mineOne(c, b.pos, { collect: true, allowFluids: false, clearObstacles: true });
        }
        if (r.outcome !== "mined" && !/nothing to mine/.test(r.reason ?? "")) {
          if (/can harvest/.test(r.reason ?? "") && plan.mine) {
            // Never destroy ore for nothing: leave it, remember it, and stop this direction until a better pickaxe exists.
            plan.mine.blocked ??= [];
            if (!plan.mine.blocked.some((x) => x.x === b.pos.x && x.y === b.pos.y && x.z === b.pos.z)) {
              plan.mine.blocked.push({ ...b.pos, id: b.id, why: "needs a better pickaxe" });
              persist();
            }
          }
          throw new Error(`dig ${b.pos.x},${b.pos.y},${b.pos.z} (${b.id}): ${r.reason ?? r.outcome}`);
        }
      }
    }
    const [f] = await blocks(c, [floor]);
    if (f.solid) return;
    try { await deps.placeOne(c, floor, "cobblestone"); return; } catch { /* nothing to click: a cave below */ }
    // Cave under the floor: find solid ground up to 6 below and stack cobblestone upward (each top face is visible).
    const below = await blocks(c, [1, 2, 3, 4, 5, 6].map((d) => ({ ...floor, y: floor.y - d })));
    const ground = below.findIndex((b) => b.solid);
    if (ground < 0) throw new Error(`no ground within 6 blocks under ${floor.x},${floor.y},${floor.z} (open cave); bridge it by hand`);
    try {
      for (let d = ground; d >= 0; d--) {
        const cellPos = { ...floor, y: floor.y - d };
        const [b] = await blocks(c, [cellPos]);
        if (b.fluid) await sealAround(c, cellPos);
        if (!b.solid) await deps.placeOne(c, cellPos, "cobblestone");
      }
    } catch {
      await pillarFill(c, floor, ground);
    }
  }

  /**
   * Fill a void column under a floor cell the survival way: step off into it (the bottom is at most 6 below, a
   * survivable drop), then jump-and-place cobblestone underfoot until standing on the floor level. Worked by hand
   * on 2026-11-03 for the cave under staircase step 37.
   */
  async function pillarFill(c: Conn, floor: Pos, ground: number) {
    const bottom = { ...floor, y: floor.y - ground };
    const inColumn = (p: Pos) => Math.floor(p.x) === floor.x && Math.floor(p.z) === floor.z;
    await deps.holdItem(c, "minecraft:cobblestone");
    let me = (await deps.call(c, "/observe")).player.pos;
    if (!inColumn(me)) {
      await gotoCell(c, bottom).catch(() => {});
      me = (await deps.call(c, "/observe")).player.pos;
    }
    if (!inColumn(me)) {
      // Walk off the edge toward the column centre.
      await deps.call(c, "/look", 4000, { at: { x: floor.x + 0.5, y: me.y + 1.5, z: floor.z + 0.5 } });
      await deps.call(c, "/move", 8000, { keys: ["forward"], ticks: 8 });
      await sleep(1500);
      me = (await deps.call(c, "/observe")).player.pos;
      if (!inColumn(me)) throw new Error(`could not get into the void column at ${floor.x},${floor.z} to fill it`);
    }
    await gotoCell(c, bottom).catch(() => {}); // centre in the cell
    await deps.holdItem(c, "minecraft:cobblestone");
    await deps.call(c, "/look", 4000, { yaw: 0, pitch: 90 });
    for (let k = 0; k < ground + 4; k++) {
      // Only trust the height once landed: mid-jump readings are up to 1.25 too high (stopped a fill early live).
      for (let w = 0; w < 10; w++) {
        me = (await deps.call(c, "/observe")).player.pos;
        if (Math.abs(me.y - Math.round(me.y)) < 0.02) break;
        await sleep(150);
      }
      if (Math.round(me.y) > floor.y) break;
      await deps.call(c, "/move", 8000, { keys: ["jump", "use"], ticks: 12 });
    }
    const [f] = await blocks(c, [floor]);
    if (!f.solid) throw new Error(`pillar fill under ${floor.x},${floor.y},${floor.z} did not reach the floor`);
  }

  /**
   * The dedicated staircase mine: 1 wide, 3 high steps from a fixed entrance down to targetY, then 2-high branch
   * tunnels. Resumable (progress in plan.mine). Walks back up the stairs to the entrance at the end unless stay:true.
   */
  const mine: Skill = async (args, ctx) => {
    const c = await conn();
    await ensureTools(c);
    const invNow = invCounts(await deps.call(c, "/observe"));
    if (!Object.keys(invNow).some((k) => /_pickaxe$/.test(k))) throw new Error("no pickaxe in the inventory (the last one probably broke); craft one first");
    if (!plan.mine) {
      const e = args.entrance as Pos | undefined;
      if (!e || !args.dir || args.targetY === undefined) throw new Error("first run needs entrance {x,y,z} (standing cell on the surface), dir and targetY");
      if (reserved().some((r) => inBox(e, r, 2))) throw new Error("entrance is inside or next to a reserved plot");
      plan.mine = { entrance: e, dir: args.dir as Dir, targetY: Number(args.targetY), stepsDone: 0, branches: [] };
      plan.places.mine_entrance = { ...e, note: `staircase mine heading ${args.dir}` };
      persist();
    }
    const m = () => plan.mine!;
    if (args.targetY !== undefined) m().targetY = Number(args.targetY);
    for (const t of (args.tunnels as { step: number; to: { x: number; z: number } }[] | undefined) ?? []) {
      m().tunnels ??= [];
      if (!m().tunnels!.some((x) => x.step === t.step && x.to.x === t.to.x && x.to.z === t.to.z)) m().tunnels!.push({ step: t.step, to: t.to, dug: 0 });
    }
    for (const b of (args.branches as { dir: Dir; length: number }[] | undefined) ?? []) {
      const have = m().branches.find((x) => x.dir === b.dir);
      if (have) have.length = Math.max(have.length, b.length); else m().branches.push({ dir: b.dir, length: b.length, dug: 0 });
    }
    persist();
    const budget = Number(args.maxSteps ?? 24);
    let used = 0;
    const climbOut = async () => {
      for (let i = m().stepsDone; i >= 1 && i > m().stepsDone - 200; i -= 3) {
        await gotoCell(c, stairStep(m().entrance, m().dir, i).feet).catch(() => {});
      }
      await gotoCell(c, m().entrance, 1).catch(() => {});
    };
    try {
      // Walk down the existing stairs first.
      for (let i = 1; i <= m().stepsDone; i += 4) { ctx.checkpoint(); await gotoCell(c, stairStep(m().entrance, m().dir, i).feet).catch(() => {}); }
      // Side tunnels from already-dug steps (e.g. toward known ore), before going deeper.
      for (const t of m().tunnels ?? []) {
        if (t.step > m().stepsDone || used >= budget) continue;
        const start = stairStep(m().entrance, m().dir, t.step).feet;
        // Leave the staircase sideways, and never dig or patch any cell the stairs rely on.
        const path = tunnelPath(start, t.to, m().dir === "north" || m().dir === "south" ? "x" : "z");
        if (t.dug >= path.length) continue;
        const clash = tunnelConflicts(path, stairCells(m().entrance, m().dir, Math.max(m().stepsDone, t.step) + 30));
        if (clash.length) {
          t.note = `refused: would cut the staircase at ${clash[0].x},${clash[0].y},${clash[0].z}; pick a target that leaves the stairs sideways`;
          persist();
          throw new Error(`tunnel from step ${t.step} to ${t.to.x},${t.to.z} ${t.note}`);
        }
        await gotoCell(c, start);
        if (t.dug) await gotoCell(c, path[t.dug - 1]).catch(() => {});
        while (t.dug < path.length && used < budget) {
          ctx.checkpoint();
          const f = path[t.dug];
          await openColumn(c, [f, { ...f, y: f.y + 1 }], { ...f, y: f.y - 1 });
          await gotoCell(c, f);
          t.dug++; used++; persist();
          ctx.progress(t.dug, path.length, `tunnel from step ${t.step}: ${t.dug}/${path.length}`);
        }
        if (t.dug >= path.length) {
          // Follow the vein: each mined ore can expose the next one, so re-scan a few times.
          let got = 0;
          const triedOre = new Set<string>();
          for (let pass = 0; pass < 4; pass++) {
            const ores = await deps.call(c, "/find", 6000, { block: "#c:ores", radius: 5, limit: 12, exposedOnly: true }).catch(() => ({ results: [] }));
            const fresh = (ores.results ?? []).filter((o: any) => !triedOre.has(`${o.pos.x},${o.pos.y},${o.pos.z}`));
            if (!fresh.length) break;
            for (const o of fresh) {
              triedOre.add(`${o.pos.x},${o.pos.y},${o.pos.z}`);
              if ((await deps.mineOne(c, o.pos, { collect: true, allowFluids: false })).outcome === "mined") got++;
            }
          }
          t.note = `reached; mined ${got} exposed ore`;
          persist();
        }
        await gotoCell(c, start).catch(() => {});
      }
      if (m().stepsDone) await gotoCell(c, stairStep(m().entrance, m().dir, m().stepsDone).feet);
      while (m().entrance.y - m().stepsDone > m().targetY && used < budget) {
        ctx.checkpoint();
        const i = m().stepsDone + 1;
        const s = stairStep(m().entrance, m().dir, i);
        await openColumn(c, s.dig, s.floor);
        const r = await gotoCell(c, s.feet);
        if (r.outcome === "interrupted") throw new Cancelled("interrupted by human input");
        if (i % 6 === 0 && invCounts(await deps.call(c, "/observe"))["minecraft:torch"]) {
          await deps.placeOne(c, { ...stairStep(m().entrance, m().dir, i - 1).feet, y: s.feet.y + 3 }, "torch").catch(() => {});
        }
        m().stepsDone = i; used++; persist();
        ctx.progress(i, m().entrance.y - m().targetY, `step ${i}, y ${s.feet.y}`);
      }
      const bottom = stairStep(m().entrance, m().dir, m().stepsDone).feet;
      if (m().entrance.y - m().stepsDone <= m().targetY) {
        for (const b of m().branches) {
          await gotoCell(c, bottom).catch(() => {});
          while (b.dug < b.length && used < budget) {
            ctx.checkpoint();
            const j = b.dug + 1;
            const cellj = branchCell(bottom, b.dir, j);
            await openColumn(c, cellj.dig, cellj.floor);
            await gotoCell(c, cellj.feet);
            if (j % 4 === 0) {
              // Take ore exposed by the tunnel walls (fluid-adjacent ore is skipped by mineOne).
              const ores = await deps.call(c, "/find", 6000, { block: "#c:ores", radius: 4, limit: 8, exposedOnly: true }).catch(() => ({ results: [] }));
              for (const o of ores.results ?? []) await deps.mineOne(c, o.pos, { collect: true, allowFluids: false });
            }
            b.dug = j; used++; persist();
            ctx.progress(b.dug, b.length, `branch ${b.dir} ${b.dug}/${b.length}`);
          }
          if (used >= budget) break;
        }
      }
    } finally {
      if (!args.stay) await climbOut();
    }
    return { stepsDone: m().stepsDone, bottomY: m().entrance.y - m().stepsDone, branches: m().branches, budgetUsed: used };
  };

  // One gameplay action owner across processes (Claude Code's server, a CLI): a pid lock in the state folder.
  const OWNER = path.join(STATE, "owner.lock");
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  function claimOwner() {
    try {
      const o = JSON.parse(fs.readFileSync(OWNER, "utf8"));
      if (o.pid !== process.pid && alive(o.pid)) throw new Error(`another controller process (pid ${o.pid}, since ${o.since}) owns the player; stop it first`);
    } catch (e) { if (!/ENOENT|JSON/.test(String(e)) && /owns the player/.test(String(e))) throw e; }
    fs.mkdirSync(STATE, { recursive: true });
    fs.writeFileSync(OWNER, JSON.stringify({ pid: process.pid, since: new Date().toISOString() }));
  }
  function releaseOwner() {
    try { if (JSON.parse(fs.readFileSync(OWNER, "utf8")).pid === process.pid) fs.unlinkSync(OWNER); } catch { /* none */ }
  }
  /** Other processes may have changed plan.json; always mutate the latest copy. */
  const fresh = () => { plan = loadPlan(PLAN_FILE); };

  const runner = new TaskRunner(new TaskStore(TASK_FILE), { gather, build_stage: buildStage, travel, retrace, mine }, {
    defaultTimeoutMs: (cfg.taskTimeoutMin ?? 15) * 60_000,
    onStop: async () => { try { await deps.call(await conn(), "/stop", 3000, {}); } catch { /* game gone */ } },
  });

  // ---- local safety watchdog (never waits for Claude) -------------------------------------------------------
  let lastVerdict: ReturnType<typeof evaluate> | null = null;
  let reacting = false;
  let underwater = 0;
  const CONTROL = path.join(STATE, "control.json");
  const watchdog = setInterval(async () => {
    // Cross-process control requests (ctl.cmd while Claude Code's server owns the player).
    if (runner.busy && fs.existsSync(CONTROL)) {
      try {
        const req = JSON.parse(fs.readFileSync(CONTROL, "utf8"));
        fs.unlinkSync(CONTROL);
        await runner.cancel(undefined, `${req.reason ?? "external request"} (via control file)`, req.cmd === "pause");
      } catch { try { fs.unlinkSync(CONTROL); } catch { /* gone */ } }
    }
    if (!runner.busy || reacting) return;
    try {
      const c = await conn();
      const o = await deps.call(c, "/observe", 1500);
      // Drowning guard: the bridge reports no air level, so count seconds with the eyes under water.
      const eye = { x: Math.floor(o.player.pos.x), y: Math.floor(o.player.pos.y + 1.6), z: Math.floor(o.player.pos.z) };
      const [eb] = await blocks(c, [eye]).catch(() => [null]);
      underwater = eb?.fluid === "minecraft:water" ? underwater + 1 : 0;
      if (underwater >= 8 && runner.activeTask?.kind !== "mine") {
        reacting = true;
        const t = runner.activeTask!;
        await runner.cancel(t.id, "safety: under water for 8 s", true);
        plan.failures.push({ at: new Date().toISOString(), what: `watchdog: ${t.id} paused, under water 8 s; surfacing` });
        persist();
        await deps.call(c, "/move", 8000, { keys: ["jump"], ticks: 80 }).catch(() => {});
        underwater = 0;
        reacting = false;
        return;
      }
      const cur = runner.activeTask;
      if (cur && cur.kind !== "retrace") {
        plan.trail ??= [];
        if (addCrumb(plan.trail, cur.id, o.player.pos)) persist();
      }
      const v = evaluate({ pos: o.player.pos, hp: o.player.health, food: o.player.food, near: o.entities, inv: invCounts(o) }, limits);
      lastVerdict = v;
      if (v.level === "ok") return;
      reacting = true;
      const t = runner.activeTask!;
      const pauseForFood = v.level === "warn" && v.actions.includes("eat");
      if (v.level === "abort" || pauseForFood) {
        await runner.cancel(t.id, `safety: ${v.reasons.join("; ")}`, pauseForFood);
        plan.failures.push({ at: new Date().toISOString(), what: `watchdog stopped ${t.id}: ${v.reasons.join("; ")}` });
        persist();
      }
      if (v.actions.includes("retreat") && v.threat) {
        const p = retreatPoint(o.player.pos, v.threat.from);
        await deps.call(c, "/goto", 30000, { x: p.x, z: p.z, tolerance: 2 }).catch(() => {});
      }
      if (v.actions.includes("eat") && v.food) {
        await deps.holdItem(c, v.food).catch(() => {});
        await deps.call(c, "/interact", 8000, { action: "use", ticks: 40 }).catch(() => {});
        if (pauseForFood) runner.resume(t.id, t.worldId);
      }
    } catch { /* game unreachable: nothing to protect */ } finally { reacting = false; }
  }, 1000);
  watchdog.unref();

  // ---- controller disconnect: finish safely, checkpoint, idle ---------------------------------------------
  let shuttingDown = false;
  const shutdown = async (why: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(watchdog);
    try {
      if (runner.busy) await runner.cancel(undefined, `controller disconnected (${why})`, true);
      plan.log.push({ at: new Date().toISOString(), note: `server stopped: ${why}` });
      persist();
      await writeHandoff().catch(() => {});
      releaseOwner();
    } finally { setTimeout(() => process.exit(0), 100); }
  };
  process.stdin.on("end", () => void shutdown("stdin closed"));
  process.stdin.on("close", () => void shutdown("stdin closed"));
  // A stray rejected promise must not kill the server mid-task (that strands the player underground): log it.
  process.on("unhandledRejection", (e) => { process.stderr.write(`unhandledRejection: ${(e as Error)?.stack ?? e}\n`); });
  process.on("uncaughtException", (e) => { process.stderr.write(`uncaughtException: ${e?.stack ?? e}\n`); });
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  async function writeHandoff() {
    let world: WorldId | null = null, player = null, connection: Record<string, unknown> = {};
    try {
      const inst = await deps.pick(cfg.instance);
      world = openWorld(inst.dir);
      connection = { adapter: "mc-bridge client mod (HTTP on localhost, token in <instance>/mcbridge/connection.json)", instance: inst.name, minecraft: inst.hello.minecraft, loader: inst.hello.loader };
      const o = await deps.call(inst.conn, "/observe");
      player = { pos: [o.player.pos.x, o.player.pos.y, o.player.pos.z].map((n: number) => Math.round(n)), hp: o.player.health, food: o.player.food };
    } catch { connection = { adapter: "mc-bridge", status: "game not reachable" }; }
    const recent = runner.store.tasks.slice(-6).map((t) => ({ id: t.id, kind: t.kind, status: t.status, error: t.error }));
    const a = runner.activeTask;
    fs.mkdirSync(STATE, { recursive: true });
    fs.writeFileSync(HANDOFF, renderHandoff({ plan, world, connection, active: a && { id: a.id, kind: a.kind, progress: a.progress }, recent, player, at: new Date().toISOString() }));
  }

  // ---- tools ------------------------------------------------------------------------------------------------
  server.tool(
    "mc_settlement_status",
    "Start every session with this. Checks which save is open (folder + seed) against the plan, re-observes the player, " +
      "and returns the objective, milestone, active/recent tasks, safety verdict, shortages and next actions. Read-only.",
    {},
    async () => {
      try {
        const inst = await deps.pick(cfg.instance);
        const w = openWorld(inst.dir);
        const o = await deps.call(inst.conn, "/observe");
        const want = cfg.expectWorld ?? plan.world;
        return text({
          world: w && { folder: w.folder, seed: w.seed }, planWorld: want, worldMatches: !want || (w && want.folder === w.folder && want.seed === w.seed),
          player: { pos: [o.player.pos.x, o.player.pos.y, o.player.pos.z].map((n: number) => Math.round(n * 10) / 10), hp: o.player.health, food: o.player.food, mode: o.player.gamemode },
          safety: evaluate({ pos: o.player.pos, hp: o.player.health, food: o.player.food, near: o.entities, inv: invCounts(o) }, limits),
          objective: plan.objective, milestone: plan.milestone, active: runner.activeTask,
          recent: runner.store.tasks.slice(-5).map((t) => ({ id: t.id, kind: t.kind, status: t.status, progress: t.progress.note, error: t.error })),
          builds: plan.builds, shortages: plan.shortages, next: plan.next,
        });
      } catch (e) { return fail(e); }
    },
  );

  server.tool(
    "mc_task_start",
    "Start a bounded background task and return its id at once (one task at a time; the local watchdog stops it on low " +
      "health, threats or hunger). Kinds: gather {block, item?, target, radius?, allowFluids?, minY?} works until the inventory " +
      "holds `target` of item (idempotent); build_stage {build, stage, partial?} places and verifies one blueprint stage " +
      "(skips cells already correct; clears only natural blocks, plus logs with clearTrees:true); travel {x, z} walks long distances in hops; retrace {task?} walks back along the breadcrumbs recorded while that " +
      "task ran (default: the latest one) - the way out of caves; mine {entrance, dir, targetY, branches?: [{dir, length}], " +
      "tunnels?: [{step, to:{x,z}}], maxSteps?, stay?} digs/extends the dedicated 3-high staircase mine (resumable, seals water/lava with cobblestone, " +
      "patches floors, torches every 6 steps if carried, takes exposed ore in branches) and climbs back to the entrance " +
      "unless stay:true; after the first run only {maxSteps, branches} are needed. Poll with mc_task_status.",
    { kind: z.enum(["gather", "build_stage", "travel", "retrace", "mine"]), args: z.record(z.any()), timeoutMin: z.number().min(1).max(60).optional() },
    async ({ kind, args, timeoutMin }: any) => {
      try {
        fresh();
        const wk = await requireWorld();
        claimOwner();
        if (!plan.world) { const [folder, seed] = wk.split("#"); plan.world = { folder, seed }; persist(); }
        const t = runner.start(kind, args, wk, timeoutMin ? timeoutMin * 60_000 : undefined);
        return text({ id: t.id, status: t.status });
      } catch (e) { return fail(e); }
    },
  );

  server.tool(
    "mc_task_status",
    "Status of one task (id) or of the active and 8 most recent tasks. Optional waitSec (max 50) blocks until the task " +
      "finishes or the time is up, so polling costs fewer calls.",
    { id: z.string().optional(), waitSec: z.number().min(0).max(50).optional() },
    async ({ id, waitSec }: any) => {
      const end = Date.now() + (waitSec ?? 0) * 1000;
      const pickT = () => (id ? runner.store.get(id) : runner.activeTask);
      while (Date.now() < end && pickT()?.status === "running") await sleep(500);
      if (id) { const t = runner.store.get(id); return t ? text(t) : fail(new Error(`no task ${id}`)); }
      return text({ active: runner.activeTask, recent: runner.store.tasks.slice(-8).reverse().map((t) => ({ id: t.id, kind: t.kind, status: t.status, progress: t.progress, error: t.error })), lastSafety: lastVerdict });
    },
  );

  server.tool(
    "mc_task_cancel",
    "Cancel (or with pause:true, pause) the running task: releases keys, waits for the current step to unwind, and records it.",
    { id: z.string().optional(), pause: z.boolean().optional(), reason: z.string().optional() },
    async ({ id, pause, reason }: any) => {
      try {
        if (!runner.busy) {
          // The running task may belong to another process (the owner); ask it through the control file.
          try {
            const o = JSON.parse(fs.readFileSync(path.join(STATE, "owner.lock"), "utf8"));
            if (o.pid !== process.pid && alive(o.pid)) {
              fs.writeFileSync(CONTROL, JSON.stringify({ cmd: pause ? "pause" : "cancel", reason: reason ?? "external request", at: new Date().toISOString() }));
              await deps.call(await conn(), "/stop", 3000, {}).catch(() => {});
              return text({ requested: pause ? "pause" : "cancel", owner: o.pid, note: "the owning process acts within ~1 s; keys released now" });
            }
          } catch { /* no owner */ }
        }
        return text(await runner.cancel(id, reason ?? "cancelled by controller", Boolean(pause)));
      } catch (e) { return fail(e); }
    },
  );

  server.tool(
    "mc_task_resume",
    "Resume a paused, interrupted or failed task (same args; skills re-check the world, so finished work is not redone). " +
      "Refused if the open world differs from the task's world. Max 5 attempts per task.",
    { id: z.string(), timeoutMin: z.number().min(1).max(60).optional() },
    async ({ id, timeoutMin }: any) => {
      try { fresh(); const wk = await requireWorld(); claimOwner(); return text(runner.resume(id, wk, timeoutMin ? timeoutMin * 60_000 : undefined)); } catch (e) { return fail(e); }
    },
  );

  server.tool(
    "mc_blueprint",
    "Blueprints in settlement/blueprints. list; show {id} (stages, size, palette); materials {id, stages?, origin?, facing?}; " +
      "place {id, origin, facing, substitutions?} reserves the plot in plan.json (no blocks change); verify {build, stage?} " +
      "compares the world with the plan (read-only; returns counts and the first problems).",
    {
      action: z.enum(["list", "show", "materials", "place", "verify"]),
      id: z.string().optional(), build: z.string().optional(), stages: z.array(z.string()).optional(), stage: z.string().optional(),
      origin: z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() }).optional(),
      facing: z.enum(["north", "east", "south", "west"]).optional(),
      substitutions: z.record(z.string()).optional(),
    },
    async (a: any) => {
      try {
        if (a.action === "list") return text(fs.readdirSync(BLUEPRINTS).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)));
        if (a.action === "show") {
          const bp = loadBlueprint(a.id);
          return text({ id: bp.id, name: bp.name, purpose: bp.purpose, size: bp.size, palette: bp.palette, alternatives: bp.alternatives, stages: bp.stages.map((s) => ({ id: s.id, name: s.name, ops: s.ops.length, checkpoint: s.checkpoint })), clearance: bp.clearance, notes: bp.notes });
        }
        if (a.action === "materials") {
          const bp = loadBlueprint(a.id);
          const cells = B.expand(bp, { origin: a.origin ?? { x: 0, y: 0, z: 0 }, facing: a.facing ?? "south" }, { stages: a.stages, substitutions: a.substitutions });
          return text({ cells: cells.length, materials: B.materials(cells) });
        }
        if (a.action === "place") {
          if (!a.origin || !a.facing) throw new Error("place needs origin and facing");
          fresh();
          const wk = await requireWorld();
          const bp = loadBlueprint(a.id);
          const fp = B.footprint(bp, { origin: a.origin, facing: a.facing });
          const clash = reserved().find((r) => r.name !== a.id && !(fp.to.x < r.from.x || fp.from.x > r.to.x || fp.to.z < r.from.z || fp.from.z > r.to.z));
          if (clash) throw new Error(`footprint ${JSON.stringify(fp)} overlaps ${clash.name}`);
          if (!plan.world) { const [folder, seed] = wk.split("#"); plan.world = { folder, seed }; }
          const prev = plan.builds[a.id];
          plan.builds[a.id] = { origin: a.origin, facing: a.facing, completedStages: prev?.completedStages ?? [], substitutions: a.substitutions ?? prev?.substitutions };
          persist();
          return text({ reserved: a.id, footprint: fp });
        }
        if (a.action === "verify") {
          const b = plan.builds[a.build];
          if (!b) throw new Error(`build ${a.build} not placed`);
          const bp = loadBlueprint(a.build.split("@")[0]);
          const c = await conn();
          const cells = B.expand(bp, { origin: b.origin, facing: b.facing as B.Facing }, { stages: a.stage ? [a.stage] : undefined, substitutions: b.substitutions });
          const obs: any[] = [];
          for (let i = 0; i < cells.length; i += 64) obs.push(...(await deps.call(c, "/blocks", 6000, { positions: cells.slice(i, i + 64).map((x) => x.pos) })).blocks);
          const s = B.summarize(cells, obs);
          return text({ total: s.total, counts: s.counts, complete: s.complete, problems: s.problems.slice(0, 12) });
        }
        throw new Error("unknown action");
      } catch (e) { return fail(e); }
    },
  );

  server.tool(
    "mc_checkpoint",
    "Update the persistent plan (any field given) and rewrite plans/medieval/HANDOFF.md. Call after each milestone and " +
      "before ending a session. places merges named coordinates; shortages replaces the shortage list; failure appends one.",
    {
      note: z.string(), objective: z.string().optional(), milestone: z.string().optional(), next: z.array(z.string()).optional(),
      places: z.record(z.object({ x: z.number(), y: z.number(), z: z.number(), note: z.string().optional() })).optional(),
      shortages: z.record(z.number()).optional(), failure: z.string().optional(), completeStage: z.object({ build: z.string(), stage: z.string() }).optional(),
    },
    async (a: any) => {
      try {
        fresh();
        const w = await currentWorld();
        if (!plan.world && w) plan.world = { folder: w.folder, seed: w.seed };
        if (a.objective) plan.objective = a.objective;
        if (a.milestone) plan.milestone = a.milestone;
        if (a.next) plan.next = a.next;
        if (a.places) plan.places = { ...plan.places, ...a.places };
        if (a.shortages) plan.shortages = a.shortages;
        if (a.failure) plan.failures.push({ at: new Date().toISOString(), what: a.failure });
        if (a.completeStage) {
          const b = plan.builds[a.completeStage.build];
          if (!b) throw new Error(`no build ${a.completeStage.build}`);
          b.completedStages = [...new Set([...b.completedStages, a.completeStage.stage])];
        }
        plan.log.push({ at: new Date().toISOString(), note: a.note });
        persist();
        await writeHandoff();
        return text({ saved: PLAN_FILE, handoff: HANDOFF });
      } catch (e) { return fail(e); }
    },
  );

  return { runner, shutdown };
}
