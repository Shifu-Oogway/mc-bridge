// Immediate survival reflexes. Pure evaluation of one observation; the watchdog loop in tools.ts acts on the verdict
// locally (stop keys, cancel task, eat, back away) without waiting for the Claude controller.

export interface Obs {
  pos: number[] | { x: number; y: number; z: number };
  hp: number;
  food: number;
  entities?: Record<string, number>;
  /** Optional detailed entity list from the bridge's raw /observe (id + pos). */
  near?: { id: string; pos: { x: number; y: number; z: number } }[];
  inv?: Record<string, number>;
}

export const HOSTILE = /zombie|skeleton|creeper|spider|witch|slime|phantom|drowned|husk|stray|pillager|vindicator|ravager|enderman|blaze|ghast|magma_cube|piglin_brute|hoglin|zoglin|silverfish|endermite|guardian|evoker|vex|warden|breeze|bogged/;

export const FOODS = ["cooked_beef", "cooked_porkchop", "cooked_mutton", "cooked_chicken", "baked_potato", "bread", "cooked_cod", "cooked_salmon", "carrot", "apple", "sweet_berries", "melon_slice", "beetroot", "cookie", "potato"];

export interface Verdict {
  level: "ok" | "warn" | "abort";
  reasons: string[];
  /** Local actions the watchdog should take, in order. */
  actions: ("stop" | "eat" | "retreat")[];
  food?: string;
  threat?: { id: string; dist: number; from: { x: number; z: number } };
}

export interface SafetyLimits { abortHp: number; eatFood: number; threatRadius: number }
export const DEFAULT_LIMITS: SafetyLimits = { abortHp: 8, eatFood: 14, threatRadius: 10 };

function posOf(o: Obs) {
  return Array.isArray(o.pos) ? { x: o.pos[0], y: o.pos[1], z: o.pos[2] } : o.pos;
}

export function evaluate(o: Obs, lim: SafetyLimits = DEFAULT_LIMITS): Verdict {
  const v: Verdict = { level: "ok", reasons: [], actions: [] };
  const me = posOf(o);
  const food = FOODS.map((f) => `minecraft:${f}`).find((f) => (o.inv?.[f] ?? 0) > 0 || (o.inv?.[f.replace("minecraft:", "")] ?? 0) > 0);
  if (o.hp <= lim.abortHp) {
    v.level = "abort";
    v.reasons.push(`health ${o.hp} <= ${lim.abortHp}`);
    v.actions.push("stop");
    if (food && o.food < 20) { v.actions.push("eat"); v.food = food; }
  } else if (o.food <= lim.eatFood && food) {
    v.level = "warn";
    v.reasons.push(`hunger ${o.food} <= ${lim.eatFood}`);
    v.actions.push("eat");
    v.food = food;
  } else if (o.food <= 6) {
    v.level = "warn";
    v.reasons.push(`hunger ${o.food} and no food carried`);
  }
  const threats = (o.near ?? []).filter((e) => HOSTILE.test(e.id))
    .map((e) => ({ id: e.id, dist: Math.hypot(e.pos.x - me.x, e.pos.y - me.y, e.pos.z - me.z), from: { x: e.pos.x, z: e.pos.z } }))
    .filter((e) => e.dist <= lim.threatRadius)
    .sort((a, b) => a.dist - b.dist);
  if (threats.length) {
    v.level = "abort";
    v.threat = threats[0];
    v.reasons.push(`${threats[0].id.replace("minecraft:", "")} at ${threats[0].dist.toFixed(1)} blocks`);
    if (!v.actions.includes("stop")) v.actions.unshift("stop");
    v.actions.push("retreat");
  }
  return v;
}

/** A point `dist` blocks away from the threat, through the player. */
export function retreatPoint(me: { x: number; z: number }, threat: { x: number; z: number }, dist = 12) {
  const dx = me.x - threat.x, dz = me.z - threat.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: Math.round(me.x + (dx / len) * dist), z: Math.round(me.z + (dz / len) * dist) };
}
