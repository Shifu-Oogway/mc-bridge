// World identity (which save is open, its seed) and the persistent plan + controller handoff file.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export interface WorldId { folder: string; seed: string; levelName: string; gameType: number; difficulty: number; allowCommands: boolean }

/** Minimal NBT reader: enough to pull a few Data fields out of level.dat. */
export function readLevelDat(file: string): Record<string, unknown> {
  const d = zlib.gunzipSync(fs.readFileSync(file));
  let p = 0;
  const u16 = () => { const v = d.readUInt16BE(p); p += 2; return v; };
  const str = () => { const n = u16(); const s = d.toString("utf8", p, p + n); p += n; return s; };
  const read = (t: number): unknown => {
    switch (t) {
      case 1: return d.readInt8(p++);
      case 2: { const v = d.readInt16BE(p); p += 2; return v; }
      case 3: { const v = d.readInt32BE(p); p += 4; return v; }
      case 4: { const v = d.readBigInt64BE(p); p += 8; return v.toString(); }
      case 5: { const v = d.readFloatBE(p); p += 4; return v; }
      case 6: { const v = d.readDoubleBE(p); p += 8; return v; }
      case 7: { const n = d.readInt32BE(p); p += 4 + n; return "bytes"; }
      case 8: return str();
      case 9: { const et = d[p++]; const n = d.readInt32BE(p); p += 4; const out = []; for (let i = 0; i < n; i++) out.push(read(et)); return out; }
      case 10: { const o: Record<string, unknown> = {}; for (;;) { const tt = d[p++]; if (tt === 0) return o; const k = str(); o[k] = read(tt); } }
      case 11: { const n = d.readInt32BE(p); p += 4 + 4 * n; return "ints"; }
      case 12: { const n = d.readInt32BE(p); p += 4 + 8 * n; return "longs"; }
      default: throw new Error(`bad NBT tag ${t} at ${p}`);
    }
  };
  p = 1; str();
  return (read(10) as Record<string, Record<string, unknown>>).Data;
}

/** The save the running client has open: its session.lock is held, so reading it fails on Windows. */
export function openWorld(instanceDir: string): WorldId | null {
  const saves = path.join(instanceDir, "saves");
  let dirs: string[] = [];
  try { dirs = fs.readdirSync(saves); } catch { return null; }
  for (const name of dirs) {
    const lock = path.join(saves, name, "session.lock");
    if (!fs.existsSync(lock)) continue;
    try { fs.readFileSync(lock); continue; } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EBUSY") continue; }
    try {
      const D = readLevelDat(path.join(saves, name, "level.dat"));
      const wg = (D.WorldGenSettings ?? {}) as Record<string, unknown>;
      return {
        folder: name, seed: String(wg.seed ?? "?"), levelName: String(D.LevelName ?? name),
        gameType: Number(D.GameType), difficulty: Number(D.Difficulty), allowCommands: Number(D.allowCommands) === 1,
      };
    } catch { return { folder: name, seed: "?", levelName: name, gameType: -1, difficulty: -1, allowCommands: false }; }
  }
  return null;
}

export const worldKey = (w: WorldId | null) => (w ? `${w.folder}#${w.seed}` : null);

export interface Plan {
  world: { folder: string; seed: string } | null;
  objective: string;
  milestone: string;
  places: Record<string, { x: number; y: number; z: number; note?: string }>;
  /** Blueprint id -> placement and completed stage ids. */
  builds: Record<string, { origin: { x: number; y: number; z: number }; facing: string; completedStages: string[]; substitutions?: Record<string, string> }>;
  shortages: Record<string, number>;
  failures: { at: string; what: string }[];
  next: string[];
  log: { at: string; note: string }[];
  /** Temporary scaffold blocks still standing (removed by the next build_stage). */
  scaffold?: { x: number; y: number; z: number }[];
  /** Breadcrumbs recorded while tasks run (newest last), so any task can walk back out. */
  trail?: { task: string; x: number; y: number; z: number }[];
  /** The dedicated staircase mine; progress makes the mine skill resumable. */
  mine?: {
    entrance: { x: number; y: number; z: number };
    dir: "north" | "south" | "east" | "west";
    targetY: number;
    stepsDone: number;
    branches: { dir: "north" | "south" | "east" | "west"; length: number; dug: number }[];
    /** Side tunnels from a staircase step to a target column at that step's level. */
    tunnels?: { step: number; to: { x: number; z: number }; dug: number; note?: string }[];
    /** Blocks the mine had to leave (e.g. ore that needs a better pickaxe). */
    blocked?: { x: number; y: number; z: number; id: string; why: string }[];
  };
}

export const emptyPlan = (): Plan => ({
  world: null, objective: "", milestone: "", places: {}, builds: {}, shortages: {}, failures: [], next: [], log: [],
});

export function loadPlan(file: string): Plan {
  try { return { ...emptyPlan(), ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch { return emptyPlan(); }
}

export function savePlan(file: string, plan: Plan) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  plan.failures = plan.failures.slice(-30);
  if (plan.trail) plan.trail = plan.trail.slice(-400);
  plan.log = plan.log.slice(-60);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(plan, null, 1));
  fs.renameSync(`${file}.tmp`, file);
}

const DIFF = ["Peaceful", "Easy", "Normal", "Hard"];
const MODE = ["Survival", "Creative", "Adventure", "Spectator"];

export function renderHandoff(o: {
  plan: Plan; world: WorldId | null; connection: Record<string, unknown>;
  active: { id: string; kind: string; progress: unknown } | null;
  recent: { id: string; kind: string; status: string; error?: string }[];
  player?: { pos: unknown; hp: number; food: number } | null;
  at: string;
}): string {
  const { plan, world } = o;
  const L: string[] = [];
  L.push("# Controller handoff (generated by mc_checkpoint; edit plan.json, not this file)", "");
  L.push(`Updated: ${o.at}`, "");
  L.push("## Connection (no secrets)");
  for (const [k, v] of Object.entries(o.connection)) L.push(`- ${k}: ${String(v)}`);
  L.push("", "## World identity");
  if (world) L.push(`- save folder: ${world.folder}`, `- seed: ${world.seed}`, `- mode/difficulty in level.dat: ${MODE[world.gameType] ?? world.gameType} / ${DIFF[world.difficulty] ?? world.difficulty} (level.dat lags the live game until the next autosave)`, `- cheats: ${world.allowCommands ? "on" : "off"}`);
  else L.push("- no open world detected");
  if (plan.world && world && (plan.world.folder !== world.folder || plan.world.seed !== world.seed)) {
    L.push(`- WARNING: plan belongs to ${plan.world.folder}#${plan.world.seed}; do not resume tasks here`);
  }
  if (o.player) L.push(`- player now: pos ${JSON.stringify(o.player.pos)}, hp ${o.player.hp}, food ${o.player.food}`);
  L.push("", "## Objective", plan.objective || "(none)", "", `Current milestone: ${plan.milestone || "(none)"}`);
  L.push("", "## Important coordinates");
  for (const [k, v] of Object.entries(plan.places)) L.push(`- ${k}: ${v.x},${v.y},${v.z}${v.note ? ` (${v.note})` : ""}`);
  if (plan.mine) {
    const m = plan.mine;
    L.push("", "## Dedicated mine", `- entrance ${m.entrance.x},${m.entrance.y},${m.entrance.z}, staircase heading ${m.dir}, ${m.stepsDone} steps dug (bottom y ${m.entrance.y - m.stepsDone}, target y ${m.targetY})`,
      ...m.branches.map((b) => `- branch ${b.dir}: ${b.dug}/${b.length}`),
      ...(m.tunnels ?? []).map((t) => `- side tunnel from step ${t.step} to ${t.to.x},${t.to.z}: ${t.dug} cells dug${t.note ? ` (${t.note})` : ""}`),
      ...(m.blocked ?? []).map((b) => `- BLOCKED at ${b.x},${b.y},${b.z}: ${b.id} - ${b.why}`), "- way out: walk back up the staircase toward the entrance (3-high steps); mine/retrace tasks do this automatically");
  }
  L.push("", "## Builds");
  for (const [k, b] of Object.entries(plan.builds)) L.push(`- ${k} @ ${b.origin.x},${b.origin.y},${b.origin.z} facing ${b.facing}; stages done: ${b.completedStages.join(", ") || "none"}`);
  L.push("", "## Tasks");
  L.push(o.active ? `- ACTIVE ${o.active.id} ${o.active.kind} ${JSON.stringify(o.active.progress)}` : "- no active task");
  for (const t of o.recent) L.push(`- ${t.id} ${t.kind}: ${t.status}${t.error ? ` (${t.error})` : ""}`);
  L.push("", "## Material shortages");
  const sh = Object.entries(plan.shortages);
  L.push(sh.length ? sh.map(([k, v]) => `- ${k}: ${v}`).join("\n") : "- none recorded");
  L.push("", "## Known failures (latest)");
  L.push(plan.failures.length ? plan.failures.slice(-8).map((f) => `- ${f.at}: ${f.what}`).join("\n") : "- none");
  L.push("", "## Next safe actions");
  L.push(plan.next.length ? plan.next.map((n, i) => `${i + 1}. ${n}`).join("\n") : "1. mc_settlement_status, then decide");
  L.push("", "## Resume procedure", "1. mc_settlement_status (checks world identity, re-observes; never trust this file over the live world).",
    "2. mc_task_status; resume interrupted tasks only if the world matches and the area still looks as expected.",
    "3. mc_blueprint verify for the build in progress before placing anything.");
  return L.join("\n") + "\n";
}
