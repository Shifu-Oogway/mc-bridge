// Prompt-window trimming shared by ollama-agent.js (live play) and export-sft.js (training-data replay), so the
// training prompts are built by exactly the code that builds them at inference time. Change it here only, and
// bump the `trim` params recorded in each trajectory if the defaults change.

export const CHUNK = 12;

/**
 * Keeps the prompt prefix STABLE so Ollama can reuse its cache on a CPU: history grows untouched until it exceeds
 * keep + CHUNK messages, then it is cut back to `keep` in one go (whole turns only, so tool results always follow
 * their assistant call) and all but the 4 newest tool results are shortened. That is one cache reset per ~6 turns
 * instead of one every turn. Mutates and returns `history`.
 */
export function trim(history, keep, { chunk = CHUNK, shortenOver = 240, shortenTo = 200, keepNewest = 4 } = {}) {
  if (history.length <= keep + chunk) return history;
  let start = history.length - keep;
  while (start < history.length && history[start].role === "tool") start++;
  history.splice(0, start);
  const tools = history.map((m, i) => (m.role === "tool" ? i : -1)).filter((i) => i >= 0);
  for (const i of tools.slice(0, -keepNewest)) {
    if (history[i].content.length > shortenOver) history[i].content = history[i].content.slice(0, shortenTo) + " ...[old result shortened]";
  }
  return history;
}
