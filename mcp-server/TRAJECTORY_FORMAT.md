# Trajectory log format (draft)

Purpose: record every `play()` run in `ollama-agent.js` so the runs can be filtered and turned into SFT data for a small
local model (e.g. Qwen3-4B). Data is written as **JSONL, one line per episode**, to `run-logs/trajectories/<session>.jsonl`.

## Design decisions

1. **Episode = one `play()` call** (one plan step attempt). That is the unit the student actually executes: a goal in,
   tool calls out, ends with DONE / stuck / budget. Retries are separate episodes linked by `step_id` + `attempt`.
2. **Store messages in the exact Ollama chat shape the model saw** (`system`, `user`, `assistant` with `tool_calls`, `tool`
   with `tool_name`). Tool results are stored *after* `compact()` and `clip(resultChars)`, i.e. what the model really read.
   Training on anything other than the deployment-time view teaches the wrong inputs.
3. **Log the full, untrimmed history.** `trim()` cuts history at inference time. The exporter replays the same
   `trim(keep, CHUNK)` (parameters are in `meta`) to rebuild the window for each assistant turn, so each training sample
   matches the prompt the student will see. Do not log the windows themselves; that duplicates data many times over.
4. **Teacher and student use the same loop.** Add a teacher mode to `ollama-agent.js` (Claude via the Anthropic API,
   same system prompt, same tool list, same `trim`, same `compact`). Logging at the MCP server (`index.js`) would capture
   tool calls but not the short rationale text, and Claude Code sessions use a different prompt, so they are poor SFT data.
5. **Outcome labels come from code, not the model:** the `check` verification and `status` already computed by
   `runSteps`. Only `passed` episodes (plus the recovery part of failed→passed pairs) go into the SFT set.
6. **The student is `/no_think`.** Teacher turns should carry a one- or two-sentence `content` rationale before each tool
   call (keeps it short for the CPU), never hidden thinking.
7. **Tool schemas are logged once per session** in a `tools_snapshot` file and referenced by hash, not repeated per episode.

## Compact tools (implemented: `tools-compact.js`)

The student gets a compact tool list instead of the full MCP descriptions: first sentence of each description (max 110
chars), short parameter hints, no `instance` parameter (`play()` injects it when `--instance` is given), no schema noise.
6.6k → about 3k tokens per prompt (25 tools). It is the default for live play and recording; `--full-tools` turns it
off. In teacher mode Claude still sees the full MCP descriptions, but the recorded `tools-<hash>.json` and the training
prompts use the compact list (`meta.tools_mode`). Recordings made with full tools can be re-compacted at export time
with `export-sft.js --compact-tools`. Editing the rules in `tools-compact.js` changes the prompt: re-export and retrain.
Consider also dropping tools the student does not need (`--exclude`), which shrinks the prompt further and reduces
wrong-tool calls.

## Teacher mode (implemented)

`node ollama-agent.js --teacher [--teacher-model sonnet|opus|haiku|<full name>] --plan … ` (recording is on by default).

- Each `play()` runs `claude -p --output-format stream-json` (Claude Code, **its own login; `ANTHROPIC_API_KEY` is removed
  from the child's environment**) with no built-in tools, only the `mc-bridge` MCP tools (minus `--exclude` ones like
  `mc_chat`), in an empty temp cwd and with `--setting-sources ""`, so no project CLAUDE.md or hooks leak in.
- The stream is converted to the student's message shape: `mcp__mc-bridge__` prefix stripped, thinking blocks dropped,
  tool results passed through `compact()` + `clip()`, `instance` args removed from recorded calls.
- `messages[0]` is the **student's** SYSTEM prompt (that is what gets trained on). Claude actually ran with the same text
  minus `/no_think` plus a "one short sentence before each tool call" addendum; its hash is `meta.run_system_hash`.
- Budget, stuck-repeat, human stop keys and Ctrl+C kill the Claude process; statuses match the student loop, plus
  `teacher-error` (claude exited non-zero; event `teacher_error`).
- Uses your Claude Code usage allowance. Each episode is a fresh session, so the system prompt and tool schemas
  (about 10k tokens) are re-sent per step; prompt caching makes later calls cheap.
- Known gaps: turns where Claude called a tool without the short sentence have `content: ""`; filter or keep as you prefer.

## Record schema

```jsonc
{
  "v": 1,
  "episode_id": "2026-11-11T14-02-33Z-0007",
  "meta": {
    "session": "2026-11-11T14-00-01Z",
    "actor": { "role": "teacher|student", "model": "claude-sonnet-5-5", "temperature": 0.6 },
    "mod_versions": { "minecraft": "1.21.1", "neoforge": "21.1.219", "create": "6.0.9" },
    "tools_hash": "sha256:ab12…",            // → run-logs/trajectories/tools-<hash>.json
    "system_hash": "sha256:cd34…",           // SYSTEM (+directive) text is in messages[0] too
    "trim": { "keep": 24, "chunk": 12, "resultChars": 4000, "shortenOlderThan": 240 },
    "ctx": 16384
  },
  "task": {
    "plan": "create-millstone",              // plan.name, or "goal" for --goal
    "step_id": "create-millstone#3",         // plan#n
    "step_name": "Craft andesite alloy",
    "attempt": 0,                            // retry index within the step
    "goal_text": "…",                        // exactly the `Goal:` user message
    "check": { "inventory": { "create:andesite_alloy": 4 } },
    "verify": null,
    "maxSteps": 40
  },
  "before": { "digest": "at 1089.5,57,-329.5; screen none; inventory: …", "inventory": { "minecraft:andesite": 8 } },
  "messages": [
    { "role": "system", "content": "You play Minecraft …" },
    { "role": "user", "content": "Goal: …" },
    { "role": "assistant", "content": "Observe first.", "tool_calls": [
        { "function": { "name": "mc_observe", "arguments": {} } } ] },
    { "role": "tool", "tool_name": "mc_observe", "content": "{\"player\":{…}}" }
    // …
  ],
  "turns": [                                   // parallel metadata, one entry per assistant message (same order)
    { "msg_index": 2, "latency_ms": 5300, "prompt_tokens": 3120, "gen_tokens": 41, "tool_errors": [false] }
  ],
  "events": [                                  // things that make a turn unsafe to train on
    { "msg_index": 17, "type": "human_input|tool_error|invalid_tool|ollama_error|stuck_repeat" }
  ],
  "outcome": {
    "status": "done|stalled|stuck|budget|human|aborted|ollama-error",   // play() status
    "accepted": true,                          // runSteps verdict: check ok AND (check present OR status==done)
    "check_ok": true,
    "missing": [],
    "calls": 23,
    "summary": "Crafted 4 andesite alloy.",
    "after": { "digest": "…", "inventory": { "create:andesite_alloy": 4 } },
    "inventory_delta": { "create:andesite_alloy": 4, "minecraft:andesite": -8 }
  },
  "quality": {                                 // filled by a post-processing script, not at record time
    "wasted_calls": 3,                         // duplicate calls with identical results, failed calls
    "recovered": false,                        // this episode succeeded after a failed attempt at the same step
    "keep_for_sft": true
  }
}
```

## Filtering rules for the SFT export

- Keep: `outcome.accepted == true`, no `human_input` events, `status == "done"` or check passed.
- Keep the **successful retry** of a failed attempt (tag `recovered`); drop the failed attempt itself, or keep it with
  loss masked on the assistant turns after the first mistake if you want negative examples later.
- Drop turns with `invalid_tool` or `tool_error` as the *assistant target*, but keep the tool-error message as input
  when the very next assistant turn fixes it. That teaches recovery.
- Drop episodes where `calls` is more than about 2x the median of successful episodes for the same `step_id`
  (prefer short, clean solutions). Dedupe near-identical episodes per step.
- Cap per-step contribution so one easy step (e.g. "chop logs") does not dominate the mix.

## Export to training samples (implemented: `export-sft.js`)

`node export-sft.js ../run-logs/trajectories --out ../run-logs/sft [--only teacher] [--format messages] [--val-frac 0.05]`
writes `train.jsonl`, `val.jsonl` (split by episode) and `report.json` (what was dropped and why). Windowing uses the
shared `trim.js`, the same module `ollama-agent.js` imports. Options: `--max-per-step 20`, `--max-call-ratio 2`,
`--max-tokens 16384` (estimated, 3.2 chars/token), `--keep-error-turns`, `--require-rationale`, `--no-dedupe`,
`--no-meta`, `--no-tools`. Render samples with the Qwen3 template and `enable_thinking=False`.

For each kept episode and each assistant turn *t*:
`prompt = trim-replay(messages[:t])`, `target = messages[t]` (content + tool_calls). Render with the Qwen3 chat
template using the tool list from `tools_hash`, and mask loss to the assistant tokens only. One episode yields as many
samples as it has assistant turns.

## Where to hook into `ollama-agent.js`

- `play()`: collect `messages` (head + full history), per-turn timing from `chat()`, and `events`; return them in the
  result object.
- `runSteps()`: after computing `ev`/`accepted`, write the episode line (it needs `s`, `attempt`, `before`, `obs`, `ev`).
- `main()`: write `tools-<hash>.json` once after `listTools()`.
- Add `--record <path>` (default on for teacher mode) and `--actor teacher|student`.

## Open questions

- Teacher model/API key availability, and whether to also log student runs (useful for the rejection-sampling round).
- Whether to log `mc_observe` results in full or add a compact "digest-only" variant to shrink prompts for the 4B model.
  That would change the tool output seen at inference, so it must be applied identically when recording.
