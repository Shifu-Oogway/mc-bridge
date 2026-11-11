#!/usr/bin/env node
// Turns recorded trajectories (ollama-agent.js --record, format: TRAJECTORY_FORMAT.md) into SFT training samples.
//
//   node export-sft.js ../run-logs/trajectories --out ../run-logs/sft
//   node export-sft.js a.jsonl b.jsonl --out out --only teacher --format messages --val-frac 0.1
//
// Per kept episode and per assistant turn it rebuilds the exact prompt the student would have seen (system + goal +
// history windowed by the SAME trim() the agent uses) and emits that prompt with the assistant turn as the target.
// Writes <out>/train.jsonl, <out>/val.jsonl (split by episode) and <out>/report.json.
//
// Sample formats (--format):
//   prompt-completion (default)  {"prompt":[msgs],"completion":[assistantMsg],"tools":[...],"meta":{...}}   TRL: loss on the completion only
//   messages                     {"messages":[msgs..., assistantMsg],"tools":[...],"meta":{...}}            needs assistant-only masking in your trainer
// Messages use the HF chat shape (assistant tool_calls: [{type:"function",function:{name,arguments}}]; tool results:
// {role:"tool",name,content}). Render with the Qwen3 chat template with enable_thinking=False (the student is /no_think).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { compactTools } from "./tools-compact.js";
import { trim } from "./trim.js";

function parseArgs(argv) {
  const a = {
    inputs: [], out: null, format: "prompt-completion", only: null, valFrac: 0.05,
    maxPerStep: 20, maxCallRatio: 2, maxTokens: 16384, keepErrorTurns: false, requireRationale: false,
    dedupe: true, meta: true, tools: true, compactTools: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i];
    if (k === "--out") a.out = path.resolve(v());
    else if (k === "--format") { a.format = v(); if (!["prompt-completion", "messages"].includes(a.format)) throw new Error("--format: prompt-completion|messages"); }
    else if (k === "--only") a.only = v(); // actor role: teacher|student
    else if (k === "--val-frac") a.valFrac = Number(v());
    else if (k === "--max-per-step") a.maxPerStep = Number(v());
    else if (k === "--max-call-ratio") a.maxCallRatio = Number(v());
    else if (k === "--max-tokens") a.maxTokens = Number(v());
    else if (k === "--keep-error-turns") a.keepErrorTurns = true;
    else if (k === "--require-rationale") a.requireRationale = true;
    else if (k === "--no-dedupe") a.dedupe = false;
    else if (k === "--no-meta") a.meta = false;
    else if (k === "--no-tools") a.tools = false;
    else if (k === "--compact-tools") a.compactTools = true; // re-compact tool lists of older recordings made with full tools
    else if (k.startsWith("--")) throw new Error(`unknown argument ${k}`);
    else a.inputs.push(path.resolve(k));
  }
  if (!a.inputs.length || !a.out) throw new Error("usage: node export-sft.js <file.jsonl|dir>... --out <dir> [options]");
  return a;
}

const BAD_EVENTS = new Set(["human_input", "ollama_error", "teacher_error", "stuck_repeat", "died", "low_health", "underwater"]);

function listFiles(inputs) {
  const files = [];
  for (const p of inputs) {
    if (fs.statSync(p).isDirectory()) for (const f of fs.readdirSync(p).sort()) { if (f.endsWith(".jsonl")) files.push(path.join(p, f)); }
    else files.push(p);
  }
  return files;
}

function median(xs) {
  const s = [...xs].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
}

const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** Tool-call sequence of an episode, used to drop duplicates. */
function signature(e) {
  return hash(JSON.stringify(e.messages.filter((m) => m.role === "assistant").map((m) => (m.tool_calls ?? []).map((c) => [c.function.name, c.function.arguments]))));
}

function toHf(m) {
  if (m.role === "assistant") {
    const o = { role: "assistant", content: m.content ?? "" };
    if (m.tool_calls?.length) o.tool_calls = m.tool_calls.map((c) => ({ type: "function", function: { name: c.function.name, arguments: c.function.arguments ?? {} } }));
    return o;
  }
  if (m.role === "tool") return { role: "tool", name: m.tool_name, content: m.content };
  return { role: m.role, content: m.content };
}

const toolsCache = new Map();
let compactOld = false;
function loadTools(dir, hashStr) {
  const key = dir + "|" + hashStr;
  if (!toolsCache.has(key)) {
    const f = path.join(dir, `tools-${String(hashStr).replace(/^sha256:/, "")}.json`);
    const t = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
    toolsCache.set(key, t && compactOld ? compactTools(t) : t);
  }
  return toolsCache.get(key);
}

function main() {
  const a = parseArgs(process.argv);
  compactOld = a.compactTools;
  const drop = {};
  const reject = (why) => { drop[why] = (drop[why] ?? 0) + 1; };

  // 1. read + episode-level filters
  const eps = [];
  let read = 0;
  for (const file of listFiles(a.inputs)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      read++;
      let e;
      try { e = JSON.parse(line); } catch { reject("unparseable-line"); continue; }
      e._dir = path.dirname(file);
      if (e.v !== 1) { reject("bad-version"); continue; }
      if (a.only && e.meta?.actor?.role !== a.only) { reject("actor-filter"); continue; }
      if (!e.outcome?.accepted) { reject("not-accepted"); continue; }
      const bad = (e.events ?? []).find((ev) => BAD_EVENTS.has(ev.type));
      if (bad) { reject(`event:${bad.type}`); continue; }
      if (!e.outcome.calls) { reject("no-tool-calls"); continue; }
      eps.push(e);
    }
  }

  // 2. per-step: call-count outliers, duplicates, cap (shortest solutions win)
  const byStep = new Map();
  for (const e of eps) { const k = e.task.step_id; if (!byStep.has(k)) byStep.set(k, []); byStep.get(k).push(e); }
  const kept = [];
  for (const [, list] of byStep) {
    let xs = list;
    if (xs.length >= 3) {
      const limit = median(xs.map((e) => e.outcome.calls)) * a.maxCallRatio;
      xs = xs.filter((e) => e.outcome.calls <= limit || (reject("too-long-for-step"), false));
    }
    if (a.dedupe) {
      const seen = new Set();
      xs = xs.filter((e) => { const s = signature(e); if (seen.has(s)) { reject("duplicate"); return false; } seen.add(s); return true; });
    }
    xs.sort((x, y) => x.outcome.calls - y.outcome.calls);
    if (xs.length > a.maxPerStep) { for (let i = a.maxPerStep; i < xs.length; i++) reject("step-cap"); xs = xs.slice(0, a.maxPerStep); }
    kept.push(...xs);
  }

  // 3. samples
  fs.mkdirSync(a.out, { recursive: true });
  const outs = { train: fs.createWriteStream(path.join(a.out, "train.jsonl")), val: fs.createWriteStream(path.join(a.out, "val.jsonl")) };
  const counts = { train: 0, val: 0, withToolCalls: 0, finalAnswers: 0 };
  const perStep = {};
  let noTools = 0;
  for (const e of kept) {
    const tools = a.tools ? loadTools(e._dir, e.meta.tools_hash) : undefined;
    if (a.tools && !tools) { noTools++; continue; }
    const toolsChars = tools ? JSON.stringify(tools).length : 0;
    const tp = e.meta.trim ?? {};
    const opts = { chunk: tp.chunk, shortenOver: tp.shortenOlderThan, keepNewest: tp.keepFullNewest };
    for (const k of Object.keys(opts)) if (opts[k] === undefined) delete opts[k];
    const head = e.messages.slice(0, 2);
    const turnAt = new Map(e.turns.map((t) => [t.msg_index, t]));
    const split = parseInt(hash(e.episode_id).slice(0, 6), 16) / 0xffffff < a.valFrac ? "val" : "train";
    const history = [];
    let made = 0;
    for (let i = 2; i < e.messages.length; i++) {
      const m = structuredClone(e.messages[i]);
      if (m.role === "assistant") {
        trim(history, e.meta.trim?.keep ?? 24, opts); // same call, same state progression as live play
        const t = turnAt.get(i);
        const hasCalls = Boolean(m.tool_calls?.length);
        let skip = null;
        if (!hasCalls && !(m.content ?? "").trim()) skip = "empty-turn";
        else if (!a.keepErrorTurns && t?.tool_errors?.some(Boolean)) skip = "error-turn";
        else if (a.requireRationale && hasCalls && !(m.content ?? "").trim()) skip = "no-rationale";
        if (!skip) {
          const prompt = [...head, ...history].map(toHf);
          const approxTokens = (JSON.stringify(prompt).length + toolsChars) / 3.2;
          if (approxTokens > a.maxTokens) skip = "over-length";
          else {
            const completion = toHf(m);
            const meta = a.meta ? { episode_id: e.episode_id, step_id: e.task.step_id, turn: i, actor: e.meta.actor?.role } : undefined;
            const rec = a.format === "messages" ? { messages: [...prompt, completion] } : { prompt, completion: [completion] };
            if (tools) rec.tools = tools;
            if (meta) rec.meta = meta;
            outs[split].write(JSON.stringify(rec) + "\n");
            counts[split]++; made++;
            hasCalls ? counts.withToolCalls++ : counts.finalAnswers++;
          }
        }
        if (skip) reject(`turn:${skip}`);
      }
      history.push(m);
    }
    perStep[e.task.step_id] = (perStep[e.task.step_id] ?? 0) + made;
  }
  if (noTools) drop["episode:tools-snapshot-missing"] = noTools;
  outs.train.end(); outs.val.end();

  const report = {
    episodesRead: read, episodesKept: kept.length - noTools, dropped: drop,
    samples: { train: counts.train, val: counts.val, withToolCalls: counts.withToolCalls, finalAnswers: counts.finalAnswers },
    samplesPerStep: perStep, options: { ...a, inputs: undefined },
  };
  fs.writeFileSync(path.join(a.out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`episodes: read ${read}, kept ${report.episodesKept}`);
  console.log(`samples: train ${counts.train}, val ${counts.val} (${counts.withToolCalls} tool calls, ${counts.finalAnswers} final answers)`);
  if (Object.keys(drop).length) console.log("dropped: " + Object.entries(drop).map(([k, v]) => `${k}=${v}`).join(", "));
  console.log(`wrote ${a.out}/{train,val}.jsonl, report.json`);
}

try { main(); } catch (e) { console.error(e.message ?? e); process.exit(1); }
