// Compact tool list for the SMALL local model. The full MCP tool descriptions cost ~6.6k tokens in every Qwen3 prompt;
// a fine-tuned student learns what each tool does from the training data, so it only needs names, parameters and a
// one-line hint. Shared by ollama-agent.js (what the student sees live and what gets recorded) and export-sft.js
// (--compact-tools, to re-compact older recordings), so train-time and run-time prompts are identical.
//
// Rules (deterministic; changing them changes the prompt, so retrain after editing):
//  - tool description: first sentence, at most TOOL_DESC chars
//  - parameter description: first sentence, at most PARAM_DESC chars, dropped for params whose name says it all
//  - dropped: `instance` (ollama-agent injects it), $schema, additionalProperties, minimum/maximum, default
//  - kept: names, types, enums, required, nested properties/items

const TOOL_DESC = 110;
const PARAM_DESC = 70;
const DROP_KEYS = new Set(["$schema", "additionalProperties", "minimum", "maximum", "default"]);

/** First sentence of `s`, cut at a word boundary to at most `max` characters. */
export function firstSentence(s, max) {
  if (!s) return "";
  let t = s.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.*?(?<!\be\.g|\bi\.e)[.!?])\s+(?=[A-Z`"])/);
  if (m) t = m[1];
  if (t.length > max) {
    // Prefer a clause boundary (":", ";", ",", " - ", "(") over a mid-phrase cut; fall back to a word boundary.
    const head = t.slice(0, max);
    const clause = Math.max(head.lastIndexOf(":"), head.lastIndexOf(";"), head.lastIndexOf(","), head.lastIndexOf(" - "), head.lastIndexOf(" ("));
    t = clause >= 30 ? head.slice(0, clause) : head.replace(/\s+\S*$/, "");
  }
  return t.replace(/\s*\([^)]*$/, "").replace(/[\s,;:\-]+$/, "").replace(/\.$/, "");
}

function compactSchema(node) {
  if (Array.isArray(node)) return node.map(compactSchema);
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (DROP_KEYS.has(k)) continue;
    if (k === "description") { const d = firstSentence(v, PARAM_DESC); if (d) out.description = d; continue; }
    if (k === "properties") {
      out.properties = {};
      for (const [pn, pv] of Object.entries(v)) if (pn !== "instance") out.properties[pn] = compactSchema(pv);
      continue;
    }
    if (k === "required") { const r = v.filter((n) => n !== "instance"); if (r.length) out.required = r; continue; }
    out[k] = compactSchema(v);
  }
  return out;
}

/** tools: [{type:"function", function:{name, description, parameters}}] -> same shape, compacted. Pure. */
export function compactTools(tools) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.function.name,
      description: firstSentence(t.function.description, TOOL_DESC),
      parameters: compactSchema(t.function.parameters ?? { type: "object", properties: {} }),
    },
  }));
}
