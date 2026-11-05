// Mineflayer compatibility probe against a LAN world. Usage: node probe.mjs <host> <port> [username]
// Step 1: status ping (no login). Step 2: offline-mode login attempt, recording exactly how far it gets.
// It never sends chat or moves; it disconnects after 20 s or on the first kick.
import mc from "minecraft-protocol";
import mineflayer from "mineflayer";

const [host = "127.0.0.1", port = "25565", username = "ProbeBot"] = process.argv.slice(2);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const status = await mc.ping({ host, port: Number(port) }).catch((e) => ({ error: e.message }));
const forge = status.forgeData ?? status.modinfo ?? null;
log("PING version:", JSON.stringify(status.version), "isModded:", status.isModded ?? "-",
  "forgeData:", forge ? `${(forge.mods ?? forge.modList ?? []).length} mods, channels ${(forge.channels ?? []).length}, fmlNetworkVersion ${forge.fmlNetworkVersion}` : "none",
  status.error ? `error ${status.error}` : "");
const raw = JSON.stringify(status);
log("PING mentions neoforge:", /neoforge/i.test(raw), "create:", /"create"|create:/i.test(raw));

const bot = mineflayer.createBot({ host, port: Number(port), username, auth: "offline", version: "1.21.1", hideErrors: false });
const states = [];
bot._client.on("state", (s) => { states.push(s); log("protocol state ->", s); });
bot._client.on("packet", (d, meta) => {
  if (["custom_payload", "select_known_packs", "registry_data", "encryption_begin", "login_plugin_request"].includes(meta.name)) {
    log("packet", meta.state, meta.name, meta.name === "custom_payload" ? d.channel : meta.name === "registry_data" ? d.id : "");
  }
});
bot.on("kicked", (r) => { log("KICKED:", typeof r === "string" ? r : JSON.stringify(r)); finish(); });
bot.on("error", (e) => { log("ERROR:", e.message); });
bot.on("spawn", () => {
  log("SPAWNED at", bot.entity.position.toString(), "game mode", bot.game.gameMode);
  const below = bot.blockAt(bot.entity.position.offset(0, -1, 0));
  log("block below:", below?.name, "registry size", Object.keys(bot.registry.blocksByName).length);
  setTimeout(finish, 3000);
});
bot.on("end", (r) => { log("END:", r); finish(); });
let done = false;
function finish() { if (done) return; done = true; log("states seen:", states.join(" > ")); try { bot.quit(); } catch {} setTimeout(() => process.exit(0), 500); }
setTimeout(() => { log("timeout 20 s"); finish(); }, 20000);
