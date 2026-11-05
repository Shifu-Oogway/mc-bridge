import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskRunner, TaskStore, type Skill } from "../src/tasks.ts";
import { evaluate, retreatPoint } from "../src/safety.ts";
import { renderHandoff, emptyPlan } from "../src/world.ts";

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mcset-")), "tasks.json");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A skill that converges on a target counter, like gather does with inventory counts.
function counterSkill(state: { n: number }): Skill {
  return async (args, ctx) => {
    while (state.n < Number(args.target)) {
      ctx.checkpoint();
      await wait(10);
      state.n++;
      ctx.progress(state.n, Number(args.target));
    }
    return { n: state.n };
  };
}

test("task runs to done and persists", async () => {
  const file = tmp(), state = { n: 0 };
  const r = new TaskRunner(new TaskStore(file), { count: counterSkill(state) });
  const t = r.start("count", { target: 5 }, "w#1");
  while (r.busy) await wait(5);
  assert.equal(t.status, "done");
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).tasks[0].status, "done");
});

test("only one task owns the player at a time", async () => {
  const r = new TaskRunner(new TaskStore(tmp()), { count: counterSkill({ n: 0 }) });
  r.start("count", { target: 50 }, null);
  assert.throws(() => r.start("count", { target: 1 }, null), /is running/);
  await r.cancel(undefined, "test");
});

test("cancel stops, pause+resume continues without redoing work", async () => {
  const state = { n: 0 };
  let stops = 0;
  const r = new TaskRunner(new TaskStore(tmp()), { count: counterSkill(state) }, { onStop: async () => { stops++; } });
  const t = r.start("count", { target: 40 }, "w#1");
  await wait(60);
  await r.cancel(t.id, "break", true);
  assert.equal(t.status, "paused");
  assert.ok(stops >= 1, "keys released");
  const at = state.n;
  assert.ok(at > 0 && at < 40);
  r.resume(t.id, "w#1");
  while (r.busy) await wait(5);
  assert.equal(t.status, "done");
  assert.equal(state.n, 40, "converges on the target instead of repeating finished steps");
});

test("resume is refused in a different world", async () => {
  const r = new TaskRunner(new TaskStore(tmp()), { count: counterSkill({ n: 0 }) });
  const t = r.start("count", { target: 100 }, "worldA#1");
  await r.cancel(t.id, "x", true);
  assert.throws(() => r.resume(t.id, "worldB#2"), /belongs to world/);
});

test("timeout fails the task", async () => {
  const r = new TaskRunner(new TaskStore(tmp()), { count: counterSkill({ n: 0 }) });
  const t = r.start("count", { target: 1000 }, null, 50);
  while (r.busy) await wait(5);
  assert.equal(t.status, "failed");
  assert.match(t.error!, /timed out/);
});

test("running tasks become interrupted after a restart", async () => {
  const file = tmp();
  fs.writeFileSync(file, JSON.stringify({ tasks: [{ id: "a", kind: "count", args: {}, status: "running", worldId: null, created: "", updated: "", attempts: 1, progress: { done: 0, total: 0, note: "" } }] }));
  const s = new TaskStore(file);
  assert.equal(s.get("a")!.status, "interrupted");
});

test("safety: low health aborts and eats, hunger pauses to eat, hostiles trigger retreat", () => {
  const base = { pos: { x: 0, y: 64, z: 0 }, inv: { "minecraft:bread": 3 } };
  const low = evaluate({ ...base, hp: 6, food: 12 });
  assert.equal(low.level, "abort");
  assert.deepEqual(low.actions, ["stop", "eat"]);
  const hungry = evaluate({ ...base, hp: 20, food: 10 });
  assert.equal(hungry.level, "warn");
  assert.deepEqual(hungry.actions, ["eat"]);
  const zombie = evaluate({ ...base, hp: 20, food: 20, near: [{ id: "minecraft:zombie", pos: { x: 3, y: 64, z: 4 } }] });
  assert.equal(zombie.level, "abort");
  assert.ok(zombie.actions.includes("retreat"));
  assert.equal(evaluate({ ...base, hp: 20, food: 20, near: [{ id: "minecraft:cow", pos: { x: 1, y: 64, z: 1 } }] }).level, "ok");
  const p = retreatPoint({ x: 0, z: 0 }, { x: 3, z: 4 }, 10);
  assert.deepEqual(p, { x: -6, z: -8 });
});

test("handoff renders all required sections and flags a world mismatch", () => {
  const plan = { ...emptyPlan(), world: { folder: "Other", seed: "1" }, objective: "obj", next: ["do x"] };
  const md = renderHandoff({ plan, world: { folder: "New World (2)", seed: "42", levelName: "New World", gameType: 0, difficulty: 0, allowCommands: false }, connection: { adapter: "mc-bridge" }, active: null, recent: [], at: "now" });
  for (const h of ["## Connection", "## World identity", "## Objective", "## Important coordinates", "## Tasks", "## Material shortages", "## Known failures", "## Next safe actions"]) assert.ok(md.includes(h), h);
  assert.match(md, /WARNING: plan belongs to Other#1/);
});
