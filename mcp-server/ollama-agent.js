#!/usr/bin/env node
// Lets a local Ollama model play Minecraft through the mc-bridge tools. It starts index.js as an MCP server over
// stdio, so the model gets exactly the same tools as any MCP client.
//
//   Single goal:  node ollama-agent.js --goal "chop 6 logs"
//   Plan:         node ollama-agent.js --plan plans/create-millstone.json
//   Autonomous:   node ollama-agent.js --roadmap steampunk/roadmap.json --directive steampunk/DIRECTIVE.md
//                 Runs roadmap.queue plan after plan, updates the roadmap file, and when the queue is empty or a plan
//                 is blocked it asks the model to write the next plan itself (validated, saved as plans/auto-*.json).
//
// A plan is written by a planner (e.g. Claude) and played by the local model, one small step at a time:
//   { "steps": [ { "name": "...", "goal": "...", "maxSteps": 40,
//                  "check": { "inventory": { "minecraft:andesite": 8 } } }, ... ] }
// After each step the runner verifies `check` itself from mc_observe (minimum item counts), skips steps already
// satisfied, retries a failed step once with feedback, and stops the plan if it still fails. A short report
// (run-logs/report-*.json) says what happened, so the planner never has to read the full log.
//
// The human stops it by pressing one of --stop-keys (default W,A,S,D,Space,Esc) during an action, or Ctrl+C.
// Mouse input and other keys only cut the current action short; the agent then carries on.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");

function parseArgs(argv) {
  const a = {
    model: "qwen3:30b-a3b",
    ollama: process.env.OLLAMA_HOST ?? "http://localhost:11434",
    maxSteps: 300,
    ctx: 16384,
    keep: 24, // recent messages kept verbatim besides the system prompt and goal
    resultChars: 4000,
    log: path.join(HERE, "..", "run-logs", `ollama-agent-${STAMP}.log`),
    report: path.join(HERE, "..", "run-logs", `report-${STAMP}.json`),
    exclude: ["mc_chat"],
    instance: undefined,
    stopKeys: ["w", "a", "s", "d", "space", "escape"],
    retries: 1,
    maxPlans: 20, // plans run per launch in --roadmap mode
    maxAuto: 5, // plans the model may write itself per launch
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i];
    if (k === "--goal") a.goal = v();
    else if (k === "--goal-file") a.goal = fs.readFileSync(v(), "utf8");
    else if (k === "--plan") a.plan = JSON.parse(fs.readFileSync(v(), "utf8"));
    else if (k === "--roadmap") a.roadmapPath = path.resolve(v());
    else if (k === "--directive") a.directive = fs.readFileSync(v(), "utf8");
    else if (k === "--max-plans") a.maxPlans = Number(v());
    else if (k === "--max-auto") a.maxAuto = Number(v());
    else if (k === "--from-step") a.fromStep = Number(v());
    else if (k === "--model") a.model = v();
    else if (k === "--ollama") a.ollama = v();
    else if (k === "--max-steps") a.maxSteps = Number(v());
    else if (k === "--ctx") a.ctx = Number(v());
    else if (k === "--retries") a.retries = Number(v());
    else if (k === "--log") a.log = v();
    else if (k === "--report") a.report = v();
    else if (k === "--instance") a.instance = v();
    else if (k === "--allow-chat") a.exclude = a.exclude.filter((t) => t !== "mc_chat");
    else if (k === "--stop-keys") a.stopKeys = v().split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    else throw new Error(`unknown argument ${k}`);
  }
  if (!a.goal && !a.plan && !a.roadmapPath) throw new Error('give --goal "...", --goal-file path, --plan path or --roadmap path');
  return a;
}

const SYSTEM = `You play Minecraft (Java 1.21.1, NeoForge, Create mod pack) through tools. You cannot see the screen;
everything you know comes from tool results. Work toward the goal step by step, one or a few tool calls at a
time, and check results before moving on.

How the world works here:
- Coordinates: x east, z south, y up. The player's feet are at y; the block below the feet is the floor (y-1).
- Start with mc_observe to learn position, inventory and surroundings. Re-observe when unsure.
- mc_find_blocks finds blocks; "exposed" means at least one face touches air. Ores and stone are often buried.
- mc_mine with "block" only mines EXPOSED matches. To reach buried blocks, mine specific positions with "pos",
  digging a 2-block-high tunnel or a staircase (each step down: clear 3 blocks: head, body, new floor level).
  Never dig the block directly under your own feet.
- mc_goto without y picks the standable floor nearest your height; a 1-block-high tunnel is not standable. Give y
  when you mean a specific level. Drops are picked up by walking over them (mc_mine does this by itself).
- Crafting: mc_craft needs a crafting screen open: mc_screen open_inventory for 2x2 recipes, or place a crafting
  table and right-click it (mc_look at it, then mc_interact use) for 3x3 recipes.
- Smelting: place a furnace, open it with mc_look + mc_interact use, put the item to smelt and fuel (coal/planks)
  in with mc_click_slot, wait, then take the output.
- If a tool result says "interrupted" because of human input, just check the state and carry on.
- Never use chat or slash commands.

Keep your messages short. When the goal is achieved (or truly impossible), reply with a final short summary that
contains the word DONE and make no tool call.

/no_think`;

function log(file, line) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, line + "\n");
}

/** Tool results are pretty-printed JSON; compact them so more fits in a small model's context. */
function compact(s) {
  try { return JSON.stringify(JSON.parse(s)); } catch { return s; }
}

function clip(s, n) {
  return s.length <= n ? s : s.slice(0, n) + `\n...[${s.length - n} more characters cut]`;
}

/**
 * Keeps the prompt prefix STABLE so Ollama can reuse its cache on a CPU: history grows untouched until it exceeds
 * keep + CHUNK messages, then it is cut back to `keep` in one go (whole turns only, so tool results always follow
 * their assistant call) and all but the 4 newest tool results are shortened. That is one cache reset per ~6 turns
 * instead of one every turn.
 */
const CHUNK = 12;
function trim(history, keep) {
  if (history.length <= keep + CHUNK) return history;
  let start = history.length - keep;
  while (start < history.length && history[start].role === "tool") start++;
  history.splice(0, start);
  const tools = history.map((m, i) => (m.role === "tool" ? i : -1)).filter((i) => i >= 0);
  for (const i of tools.slice(0, -4)) {
    if (history[i].content.length > 240) history[i].content = history[i].content.slice(0, 200) + " ...[old result shortened]";
  }
  return history;
}

async function chat(a, messages, tools) {
  const res = await fetch(`${a.ollama}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: a.model, messages, tools, stream: true, think: false, keep_alive: "60m", options: { num_ctx: a.ctx } }),
  });
  if (!res.ok) throw new Error(`ollama HTTP ${res.status}: ${await res.text()}`);
  // Streamed so a slow CPU prompt-evaluation can't hit fetch's 5-minute header timeout; chunks are NDJSON.
  const out = { role: "assistant", content: "", tool_calls: [] };
  const dec = new TextDecoder();
  let buf = "";
  const take = (line) => {
    if (!line.trim()) return;
    const j = JSON.parse(line);
    if (j.error) throw new Error(`ollama: ${j.error}`);
    out.content += j.message?.content ?? "";
    if (j.message?.tool_calls) out.tool_calls.push(...j.message.tool_calls);
  };
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) { take(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
  }
  take(buf);
  return out;
}

/** The stop key the human pressed during an action, or null (mouse input and other keys don't stop the agent). */
function stopKeyIn(text, stopKeys) {
  for (const m of text.matchAll(/human key press: key\.keyboard\.([a-z0-9_.]+)/gi)) {
    if (stopKeys.includes(m[1].toLowerCase())) return m[1];
  }
  return null;
}

// ---- state checks (done by code, not by the model) ---------------------------------------------------------------

async function observe(client, a) {
  const r = await client.callTool({ name: "mc_observe", arguments: a.instance ? { instance: a.instance } : {} });
  return JSON.parse((r.content ?? []).map((p) => p.text ?? "").join(""));
}

function inventoryCounts(obs) {
  const c = {};
  for (const i of obs.inventory ?? []) c[i.id] = (c[i.id] ?? 0) + i.count;
  // Items the player is holding on the cursor inside a screen count too.
  if (obs.container?.carried) c[obs.container.carried.id] = (c[obs.container.carried.id] ?? 0) + obs.container.carried.count;
  return c;
}

/** Returns { ok, missing: ["id: have 2/8"] }. Check format: { inventory: { "minecraft:id": minCount } }. */
function evaluate(check, obs) {
  if (!check) return { ok: true, missing: [] };
  const have = inventoryCounts(obs);
  const missing = [];
  for (const [id, need] of Object.entries(check.inventory ?? {})) {
    const key = id.includes(":") ? id : `minecraft:${id}`;
    if ((have[key] ?? 0) < need) missing.push(`${key}: have ${have[key] ?? 0}, need ${need}`);
  }
  return { ok: missing.length === 0, missing };
}

function digest(obs) {
  const p = obs.player?.pos;
  const inv = Object.entries(inventoryCounts(obs)).map(([k, v]) => `${k.replace("minecraft:", "")}x${v}`).join(", ");
  return `at ${p ? `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}` : "?"}; screen ${obs.screen ? obs.screen.split(".").pop() : "none"}; inventory: ${inv || "empty"}`;
}

// ---- the playing loop --------------------------------------------------------------------------------------------

/** Plays one goal until DONE, the step budget, a stuck loop, or a human stop key. Returns { status, calls, summary }. */
async function play(client, tools, a, say, goal, budget, state) {
  const head = [{ role: "system", content: a.directive ? SYSTEM + "\n\nLong-term directive:\n" + a.directive : SYSTEM }, { role: "user", content: `Goal: ${goal.trim()}` }];
  const history = [];
  let calls = 0, idle = 0, summary = "";
  const recent = [];
  while (!state.stop && calls < budget) {
    let msg;
    for (let t = 0; ; t++) {
      try { msg = await chat(a, [...head, ...trim(history, a.keep)], tools); break; }
      catch (e) {
        say(`ollama error (${t + 1}/3): ${e.cause?.message ?? e.message ?? e}`);
        if (t >= 2) return { status: "ollama-error", calls, summary: String(e.message ?? e) };
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    const tc = msg.tool_calls ?? [];
    history.push({ role: "assistant", content: msg.content ?? "", tool_calls: tc.length ? tc : undefined });
    if (msg.content) msg.content = msg.content.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*<\/think>/, "");
    if (msg.content?.trim()) { summary = msg.content.trim(); say(`model: ${summary}`); }

    if (tc.length === 0) {
      if (/\bDONE\b/.test(msg.content ?? "")) return { status: "done", calls, summary };
      if (++idle >= 3) return { status: "stalled", calls, summary: summary || "model stopped calling tools" };
      history.push({ role: "user", content: "Continue toward the goal: call a tool, or reply DONE with a summary if it is achieved." });
      continue;
    }
    idle = 0;

    for (const c of tc) {
      const name = c.function?.name;
      let args = c.function?.arguments ?? {};
      if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } }
      if (a.instance && args.instance === undefined) args.instance = a.instance;
      calls++;
      let text;
      if (!tools.some((t) => t.function.name === name)) {
        text = `error: no tool named ${name}`;
      } else {
        try {
          const r = await client.callTool({ name, arguments: args });
          text = compact((r.content ?? []).map((p) => p.text ?? "").join("\n"));
          if (r.isError) text = `error: ${text}`;
        } catch (e) {
          text = `error: ${e.message ?? e}`;
        }
      }
      say(`[${state.total + calls}] ${name} ${JSON.stringify(args)}\n    -> ${clip(text, 300)}`);
      history.push({ role: "tool", tool_name: name, content: clip(text, a.resultChars) });

      const key = stopKeyIn(text, a.stopKeys);
      if (key) { state.stop = true; return { status: "human", calls, summary: `human pressed ${key}` }; }

      // The same call with the same result three times in a row means the model is going in circles.
      recent.push(`${name}|${JSON.stringify(args)}|${text}`);
      if (recent.length > 3) recent.shift();
      if (recent.length === 3 && recent.every((s) => s === recent[0])) {
        return { status: "stuck", calls, summary: `repeated ${name} ${JSON.stringify(args)} with no change` };
      }
    }
  }
  return { status: state.stop ? "aborted" : "budget", calls, summary };
}

/** Runs the steps of one plan. Returns "complete", "blocked at ..." or a stop reason; fills report.steps. */
async function runSteps(client, tools, a, say, plan, from, state, report) {
  const steps = plan.steps;
  const notes = []; // one line per finished step, handed to the next one
  const ctx = plan.context ? `Plan context: ${clip(plan.context, 700)}\n` : "";
  for (let i = from; i < steps.length && !state.stop; i++) {
    const s = steps[i];
    const name = s.name ?? `step ${i + 1}`;
    const rec = { plan: plan.name, n: i + 1, name, attempts: [] };
    report.steps.push(rec);

    if (s.check && evaluate(s.check, await observe(client, a)).ok) {
      rec.status = "skipped (already satisfied)";
      say(`== step ${i + 1}/${steps.length} ${name}: already satisfied, skipping`);
      continue;
    }

    let feedback = "";
    for (let attempt = 0; attempt <= a.retries && !state.stop; attempt++) {
      say(`== step ${i + 1}/${steps.length} ${name}${attempt ? ` (retry ${attempt})` : ""}`);
      const before = digest(await observe(client, a));
      const goal = [ctx + s.goal, s.verify ? `Before you say DONE, confirm in the world (mc_blocks/mc_observe): ${s.verify}` : "",
        notes.length ? `\nEarlier steps (for context):\n- ${notes.join("\n- ")}` : "", feedback].filter(Boolean).join("\n");
      const r = await play(client, tools, a, say, goal, s.maxSteps ?? 40, state);
      state.total += r.calls;
      const obs = await observe(client, a);
      const ev = evaluate(s.check, obs);
      rec.attempts.push({ result: r.status, calls: r.calls, summary: clip(r.summary, 300), missing: ev.missing, state: digest(obs), before });
      if (r.status === "human") return "stopped by human";
      // A step without an inventory check is accepted only when the model itself says DONE.
      const accepted = ev.ok && (s.check || r.status === "done");
      if (accepted) { rec.status = "passed"; notes.push(`${name}: done. ${clip(r.summary, 160)}`); break; }
      feedback = ev.ok
        ? `\nYour previous attempt ended (${r.status}) without confirming the goal. Current state: ${digest(obs)}. Finish it and reply DONE.`
        : `\nYour previous attempt ended (${r.status}) but the goal is NOT met: ${ev.missing.join("; ")}. Current state: ${digest(obs)}. Try again, differently if needed.`;
    }
    if (rec.status !== "passed") {
      rec.status = "failed";
      return state.stop ? "aborted" : `blocked at step ${i + 1}: ${name}`;
    }
  }
  return state.stop ? "aborted" : "complete";
}

// ---- autonomous mode: roadmap queue + model-written plans ------------------------------------------------------

const PLAN_PROMPT = (roadmap, now, lastFailure) => `You are the project planner for a Minecraft Create-mod base. Write the NEXT plan as JSON only.

Roadmap (current state of the project):
${JSON.stringify({ ...roadmap, history: undefined }, null, 1)}

Player state now: ${now}
${lastFailure ? "The last plan failed: " + lastFailure + ". Write a smaller, easier plan that works around it.\n" : ""}
Rules:
- 3 to 8 steps, each small enough to finish in <= 80 tool calls. Pick the highest-priority unfinished roadmap goal that unlocks the most.
- Use ONLY recipes listed in the directive or the roadmap's completed work; if you need a recipe not verified, make the first step a survey/gather step and keep placement steps for later.
- Every gather/craft step MUST have "check": {"inventory": {"minecraft:id": minimumCount}} using real item ids (create:... for Create items).
- Build/placement steps have no check; instead give a short "verify" sentence naming blocks to confirm with mc_blocks.
- Do not break the existing machines near x1082..1101, z-334..-328.
- Aesthetics: spruce/dark oak frames, stone brick/cobble walls, glass windows, lanterns, visible shafts and cogs.
Output exactly: {"name": "...", "context": "objective, strategic purpose, architecture, next objective", "steps": [{"name": "...", "maxSteps": 60, "check": {...}, "goal": "...", "verify": "..."}]}`;

function validatePlan(p) {
  if (!p || typeof p.name !== "string" || !Array.isArray(p.steps) || p.steps.length < 1 || p.steps.length > 12) return null;
  for (const s of p.steps) {
    if (typeof s.goal !== "string" || s.goal.length < 10) return null;
    s.maxSteps = Math.min(Math.max(Number(s.maxSteps) || 40, 10), 120);
    if (s.check) {
      const inv = {};
      for (const [k, v] of Object.entries(s.check.inventory ?? {})) if (Number(v) > 0) inv[k] = Number(v);
      if (Object.keys(inv).length) s.check = { inventory: inv }; else delete s.check;
    }
    if (typeof s.verify !== "string") delete s.verify;
  }
  return p;
}

async function writePlan(a, roadmap, now, lastFailure, say) {
  for (let tries = 0; tries < 3; tries++) {
    try {
      const res = await fetch(`${a.ollama}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: a.model, stream: false, think: false, format: "json", options: { num_ctx: a.ctx },
          messages: [{ role: "system", content: a.directive ?? "" }, { role: "user", content: PLAN_PROMPT(roadmap, now, lastFailure) + "\n/no_think" }] }),
      });
      if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
      const p = validatePlan(JSON.parse((await res.json()).message.content));
      if (p) return p;
      say("model-written plan failed validation, retrying");
    } catch (e) { say(`plan writing error: ${e.message ?? e}`); }
  }
  return null;
}

async function runRoadmap(client, tools, a, say, state, report) {
  const save = (rm) => fs.writeFileSync(a.roadmapPath, JSON.stringify(rm, null, 2) + "\n");
  const rm = JSON.parse(fs.readFileSync(a.roadmapPath, "utf8"));
  rm.queue ??= []; rm.completed ??= []; rm.blocked ??= []; rm.history ??= [];
  let ran = 0, auto = 0, lastFailure = "";
  while (!state.stop && ran < a.maxPlans) {
    let file = rm.queue[0], plan;
    if (file) {
      try { plan = JSON.parse(fs.readFileSync(path.join(HERE, file), "utf8")); }
      catch (e) { say(`cannot read ${file}: ${e.message}; dropping it`); rm.queue.shift(); rm.blocked.push(`${file}: unreadable`); save(rm); continue; }
    } else {
      if (auto >= a.maxAuto) { report.outcome = "queue empty; auto-plan limit reached"; break; }
      say("== queue empty: the model writes the next plan");
      plan = await writePlan(a, rm, digest(await observe(client, a)), lastFailure, say);
      if (!plan) { report.outcome = "could not obtain a valid plan"; break; }
      auto++;
      file = `plans/auto-${STAMP}-${auto}.json`;
      fs.writeFileSync(path.join(HERE, file), JSON.stringify(plan, null, 2) + "\n");
      rm.queue.unshift(file); save(rm);
      say(`wrote ${file}: ${plan.name}`);
    }
    say(`\n##### PLAN ${plan.name} (${file})`);
    const outcome = await runSteps(client, tools, a, say, plan, 0, state, report);
    ran++;
    rm.history.push({ plan: plan.name, file, outcome, at: new Date().toISOString(), state: digest(await observe(client, a).catch(() => ({}))) });
    if (outcome === "complete") {
      rm.queue.shift(); rm.completed.push(`${plan.name} (${file})`); lastFailure = "";
    } else if (state.stop) {
      report.outcome = outcome; save(rm); return;
    } else {
      // blocked: park the plan, remember why, and let the planner try something smaller next
      rm.queue.shift(); rm.blocked.push(`${plan.name} (${file}): ${outcome}`); lastFailure = `${plan.name}: ${outcome}`;
    }
    save(rm);
  }
  if (report.outcome === "complete" && state.stop) report.outcome = "aborted";
}

async function main() {
  const a = parseArgs(process.argv);
  const say = (s) => { console.log(s); log(a.log, s); };

  const client = new Client({ name: "ollama-agent", version: "0.0.1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(HERE, "index.js")] }));
  const tools = (await client.listTools()).tools
    .filter((t) => !a.exclude.includes(t.name))
    .map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } }));

  const state = { stop: false, total: 0 };
  process.on("SIGINT", () => { if (state.stop) process.exit(130); state.stop = true; say("Ctrl+C: stopping after this step"); });
  say(`model ${a.model}, ${tools.length} tools, log ${a.log}`);

  const report = { model: a.model, startedAt: new Date().toISOString(), start: digest(await observe(client, a)), steps: [], outcome: "complete" };
  if (a.roadmapPath) {
    await runRoadmap(client, tools, a, say, state, report);
  } else {
    const plan = a.plan ?? { name: "goal", steps: [{ name: "goal", goal: a.goal, maxSteps: a.maxSteps }] };
    const outcome = await runSteps(client, tools, a, say, plan, a.fromStep ?? 0, state, report);
    if (outcome !== "complete") report.outcome = outcome;
  }

  report.finishedAt = new Date().toISOString();
  report.end = digest(await observe(client, a).catch(() => ({})));
  report.toolCalls = state.total;
  log(a.report, JSON.stringify(report, null, 2));
  say(`\nreport: ${a.report}\noutcome: ${report.outcome}`);
  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
