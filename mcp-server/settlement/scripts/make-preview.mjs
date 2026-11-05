// Copy a CLOSED survival save to a new folder and switch the copy to creative with cheats on.
//   node settlement/scripts/make-preview.mjs "<source folder>" "<new folder>" "<new level name>"
// Never touches the source. Refuses if the source is open (session.lock held) or the target exists.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const [src = "New World (2)", dst = "Settlement Preview", name = "Settlement Preview"] = process.argv.slice(2);
const saves = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS", "saves");
const from = path.join(saves, src), to = path.join(saves, dst);
if (!fs.existsSync(from)) throw new Error(`no save ${from}`);
if (fs.existsSync(to)) throw new Error(`target already exists: ${to} (not overwriting)`);
try { fs.readFileSync(path.join(from, "session.lock")); } catch (e) {
  if (e.code === "EBUSY") throw new Error("the source world is open; Save and Quit to Title first");
}
fs.cpSync(from, to, { recursive: true, filter: (p) => !p.endsWith("session.lock") });

// Minimal NBT rewrite of a few Data fields: GameType, allowCommands, LevelName, Player.playerGameType.
const file = path.join(to, "level.dat");
let d = zlib.gunzipSync(fs.readFileSync(file));
const tagged = (type, n) => Buffer.concat([Buffer.from([type]), Buffer.from([0, n.length]), Buffer.from(n, "utf8")]);
function setInt(n, v) {
  const k = tagged(3, n); let i = d.indexOf(k); let hits = 0;
  while (i >= 0) { d.writeInt32BE(v, i + k.length); hits++; i = d.indexOf(k, i + 1); }
  return hits;
}
function setByte(n, v) {
  const k = tagged(1, n); let i = d.indexOf(k); let hits = 0;
  while (i >= 0) { d.writeInt8(v, i + k.length); hits++; i = d.indexOf(k, i + 1); }
  return hits;
}
function setString(n, v) {
  const k = tagged(8, n); const i = d.indexOf(k); if (i < 0) return 0;
  const at = i + k.length, len = d.readUInt16BE(at);
  const nb = Buffer.from(v, "utf8"), lenb = Buffer.alloc(2); lenb.writeUInt16BE(nb.length);
  d = Buffer.concat([d.subarray(0, at), lenb, nb, d.subarray(at + 2 + len)]);
  return 1;
}
const r = { GameType: setInt("GameType", 1), playerGameType: setInt("playerGameType", 1), allowCommands: setByte("allowCommands", 1), LevelName: setString("LevelName", name) };
fs.writeFileSync(file, zlib.gzipSync(d));
try { fs.rmSync(path.join(to, "level.dat_old")); } catch { /* none */ }
// Player data files also carry the game mode for the (singleplayer) player.
for (const f of fs.existsSync(path.join(to, "playerdata")) ? fs.readdirSync(path.join(to, "playerdata")) : []) {
  if (!f.endsWith(".dat")) continue;
  const pf = path.join(to, "playerdata", f);
  d = zlib.gunzipSync(fs.readFileSync(pf));
  setInt("playerGameType", 1);
  fs.writeFileSync(pf, zlib.gzipSync(d));
}
console.log(JSON.stringify({ copied: to, patched: r }));
