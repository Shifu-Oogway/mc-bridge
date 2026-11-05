// Persistent, bounded background tasks with one action owner. Skills must be idempotent (they work toward a target
// state, e.g. "hold 32 logs" or "stage cells match the blueprint"), so resuming after a crash never duplicates work.

import fs from "node:fs";
import path from "node:path";

export type TaskStatus = "running" | "paused" | "done" | "failed" | "cancelled" | "interrupted";

export interface Task {
  id: string;
  kind: string;
  args: Record<string, unknown>;
  status: TaskStatus;
  worldId: string | null;
  created: string;
  updated: string;
  attempts: number;
  progress: { done: number; total: number; note: string };
  result?: unknown;
  error?: string;
}

export interface SkillContext {
  signal: AbortSignal;
  /** Report progress; also persists, so a crash loses at most the current step. */
  progress(done: number, total: number, note?: string): void;
  /** Throws if the task was cancelled; call between steps. */
  checkpoint(): void;
}

export type Skill = (args: Record<string, unknown>, ctx: SkillContext) => Promise<unknown>;

export class Cancelled extends Error { constructor(why: string) { super(why); this.name = "Cancelled"; } }

export class TaskStore {
  tasks: Task[] = [];
  private file: string;
  constructor(file: string) {
    this.file = file;
    try {
      this.tasks = JSON.parse(fs.readFileSync(file, "utf8")).tasks ?? [];
    } catch { this.tasks = []; }
    // Nothing runs across a restart: whatever was running is now interrupted and must be resumed explicitly,
    // after the controller re-observes the world.
    for (const t of this.tasks) if (t.status === "running") { t.status = "interrupted"; t.error = "process restarted"; }
    this.save();
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    // Keep the newest 200 records; old finished tasks are history, not state.
    const keep = this.tasks.slice(-200);
    fs.writeFileSync(tmp, JSON.stringify({ tasks: keep }, null, 1));
    fs.renameSync(tmp, this.file);
  }
  get(id: string) { return this.tasks.find((t) => t.id === id); }
}

export interface RunnerOptions {
  defaultTimeoutMs?: number;
  onStop?: () => Promise<void>;
  now?: () => Date;
}

/** Runs at most one task at a time (the single gameplay action owner). */
export class TaskRunner {
  private active: { task: Task; ctl: AbortController; done: Promise<void> } | null = null;
  private seq = 0;
  store: TaskStore;
  private skills: Record<string, Skill>;
  private opts: RunnerOptions;
  constructor(store: TaskStore, skills: Record<string, Skill>, opts: RunnerOptions = {}) {
    this.store = store; this.skills = skills; this.opts = opts;
  }

  get activeTask(): Task | null { return this.active?.task ?? null; }
  get busy(): boolean { return this.active !== null; }

  private stamp() { return (this.opts.now?.() ?? new Date()).toISOString(); }

  start(kind: string, args: Record<string, unknown>, worldId: string | null, timeoutMs?: number): Task {
    if (!this.skills[kind]) throw new Error(`unknown task kind "${kind}"; known: ${Object.keys(this.skills).join(", ")}`);
    if (this.active) throw new Error(`task ${this.active.task.id} (${this.active.task.kind}) is running; cancel it or wait`);
    const now = this.stamp();
    const task: Task = {
      id: `t${Date.now().toString(36)}${(this.seq++).toString(36)}`, kind, args, status: "running", worldId,
      created: now, updated: now, attempts: 1, progress: { done: 0, total: 0, note: "starting" },
    };
    this.store.tasks.push(task);
    this.store.save();
    this.launch(task, timeoutMs);
    return task;
  }

  resume(id: string, worldId: string | null, timeoutMs?: number): Task {
    const task = this.store.get(id);
    if (!task) throw new Error(`no task ${id}`);
    if (!["paused", "interrupted", "failed"].includes(task.status)) throw new Error(`task ${id} is ${task.status}; only paused, interrupted or failed tasks resume`);
    if (task.worldId && worldId && task.worldId !== worldId) throw new Error(`task ${id} belongs to world ${task.worldId}, current world is ${worldId}`);
    if (this.active) throw new Error(`task ${this.active.task.id} is running`);
    if (task.attempts >= 5) throw new Error(`task ${id} already tried ${task.attempts} times; start a new one after fixing the cause`);
    task.attempts++;
    task.status = "running";
    task.error = undefined;
    task.updated = this.stamp();
    this.store.save();
    this.launch(task, timeoutMs);
    return task;
  }

  private launch(task: Task, timeoutMs?: number) {
    const ctl = new AbortController();
    const limit = timeoutMs ?? this.opts.defaultTimeoutMs ?? 10 * 60_000;
    const timer = setTimeout(() => ctl.abort(new Cancelled(`timed out after ${Math.round(limit / 1000)} s`)), limit);
    const ctx: SkillContext = {
      signal: ctl.signal,
      progress: (done, total, note) => {
        task.progress = { done, total, note: note ?? task.progress.note };
        task.updated = this.stamp();
        this.store.save();
      },
      checkpoint: () => {
        if (ctl.signal.aborted) throw ctl.signal.reason instanceof Error ? ctl.signal.reason : new Cancelled(String(ctl.signal.reason));
      },
    };
    const done = (async () => {
      try {
        task.result = await this.skills[task.kind](task.args, ctx);
        ctx.checkpoint();
        task.status = "done";
      } catch (e) {
        const reason = ctl.signal.aborted ? ctl.signal.reason : e;
        const msg = reason instanceof Error ? reason.message : String(reason);
        if (reason instanceof Cancelled && /^pause/.test(msg)) task.status = "paused";
        else if (reason instanceof Cancelled && !/timed out/.test(msg)) task.status = "cancelled";
        else task.status = "failed";
        task.error = msg;
        await this.opts.onStop?.().catch(() => {});
      } finally {
        clearTimeout(timer);
        task.updated = this.stamp();
        this.store.save();
        this.active = null;
      }
    })();
    this.active = { task, ctl, done };
  }

  /** Cancel (or pause) the running task and wait until its current step has unwound. */
  async cancel(id: string | undefined, why: string, pause = false): Promise<Task | null> {
    const a = this.active;
    if (!a || (id && a.task.id !== id)) {
      const t = id ? this.store.get(id) : undefined;
      if (t && t.status === "interrupted" && !pause) { t.status = "cancelled"; t.error = why; this.store.save(); return t; }
      return t ?? null;
    }
    a.ctl.abort(new Cancelled(pause ? `paused: ${why}` : why));
    await this.opts.onStop?.().catch(() => {});
    await Promise.race([a.done, new Promise((r) => setTimeout(r, 15_000))]);
    return a.task;
  }
}
