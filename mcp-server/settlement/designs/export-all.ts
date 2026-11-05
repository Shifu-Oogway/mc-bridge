import fs from "node:fs";
import { exportCells } from "./export.ts";
import { manor } from "./manor.ts";
import { TOWN } from "./town.ts";
const out = process.argv[2];
const all: Record<string, unknown> = { manor: { name: manor.name, purpose: manor.purpose, ...exportCells(manor) } };
for (const [k, f] of Object.entries(TOWN)) { const bp = f(); all[k] = { name: bp.name, purpose: bp.purpose, ...exportCells(bp) }; }
fs.writeFileSync(out, JSON.stringify(all));
console.log(Object.keys(all).join(","), fs.statSync(out).size);
