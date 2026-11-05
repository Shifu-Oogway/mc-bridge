package dev.mcbridge;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import net.minecraft.client.Minecraft;
import net.neoforged.fml.loading.FMLPaths;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Localhost-only, token-authenticated HTTP server. Writes mcbridge/connection.json (port + token) into the game
 * directory. Action routes additionally require actionsEnabled in mcbridge/config.json.
 */
public final class BridgeServer {
    public static final int PROTOCOL = 1;
    // Nulls are kept so "nothing" (no screen, no action) is explicit rather than a missing field.
    private static final Gson GSON = new com.google.gson.GsonBuilder().serializeNulls().create();
    private static final int MAX_BODY = 64 * 1024;
    private final String token;
    private HttpServer server;

    public BridgeServer() {
        byte[] b = new byte[24];
        new SecureRandom().nextBytes(b);
        this.token = HexFormat.of().formatHex(b);
    }

    public void start() throws IOException {
        Config.writeDefaultIfMissing();
        // Loopback only; port 0 = OS-assigned so several clients can coexist.
        // Explicit IPv4 literal: getLoopbackAddress() can resolve to ::1 and clients using 127.0.0.1 then fail.
        server = HttpServer.create(new InetSocketAddress(InetAddress.getByAddress(new byte[]{127, 0, 0, 1}), 0), 0);
        server.createContext("/hello", ex -> handle(ex, "GET", false, false, req -> hello()));
        server.createContext("/observe", ex -> handle(ex, "GET", true, false,
                req -> onClientThread(() -> CompletableFuture.completedFuture(Observer.observe()), 3000)));
        server.createContext("/terrain", ex -> handle(ex, "GET", true, false, req -> {
            int radius = 8;
            String q = ex.getRequestURI().getQuery();
            if (q != null && q.startsWith("radius=")) radius = Integer.parseInt(q.substring(7));
            int r = radius;
            return onClientThread(() -> CompletableFuture.completedFuture(Terrain.scan(r)), 3000);
        }));
        server.createContext("/find", ex -> handle(ex, "POST", true, false,
                req -> onClientThread(() -> CompletableFuture.completedFuture(Blocks.find(req)), 5000)));
        server.createContext("/blocks", ex -> handle(ex, "POST", true, false,
                req -> onClientThread(() -> CompletableFuture.completedFuture(Blocks.inspect(req)), 3000)));
        server.createContext("/look", ex -> handle(ex, "POST", true, true,
                req -> onClientThread(() -> Actions.look(req), 3000)));
        server.createContext("/move", ex -> handle(ex, "POST", true, true, req -> {
            long ticks = req.has("ticks") ? Math.max(0, Math.min(Actions.MAX_MOVE_TICKS, req.get("ticks").getAsLong())) : 0;
            return onClientThread(() -> Actions.move(req), ticks * 50 + 5000);
        }));
        server.createContext("/goto", ex -> handle(ex, "POST", true, true,
                req -> onClientThread(() -> Actions.goTo(req), Actions.MAX_GOTO_TICKS * 50L + 5000)));
        server.createContext("/interact", ex -> handle(ex, "POST", true, true, req -> {
            long ticks = req.has("ticks") ? Math.max(0, Math.min(Actions.MAX_HOLD_TICKS, req.get("ticks").getAsLong())) : 1;
            return onClientThread(() -> Actions.interact(req), ticks * 50 + 5000);
        }));
        server.createContext("/hotbar", ex -> handle(ex, "POST", true, true,
                req -> onClientThread(() -> Actions.hotbar(req), 3000)));
        server.createContext("/chat", ex -> handle(ex, "POST", true, true,
                req -> onClientThread(() -> Actions.chat(req), 3000)));
        server.createContext("/screen", ex -> handle(ex, "POST", true, true,
                req -> onClientThread(() -> Containers.screen(req), 3000)));
        server.createContext("/click", ex -> handle(ex, "POST", true, true,
                req -> onClientThread(() -> Containers.click(req), 3000)));
        server.createContext("/craft", ex -> handle(ex, "POST", true, true,
                req -> onClientThread(() -> Containers.craft(req), 5000)));
        server.createContext("/stop", ex -> handle(ex, "POST", true, true,
                req -> onClientThread(() -> CompletableFuture.completedFuture(Actions.stop()), 3000)));
        // A move holds its request open until it ends, so leave threads for observe/stop alongside it.
        server.setExecutor(Executors.newFixedThreadPool(4, r -> {
            Thread t = new Thread(r, "mcbridge-http");
            t.setDaemon(true);
            return t;
        }));
        server.start();

        JsonObject conn = new JsonObject();
        conn.addProperty("host", "127.0.0.1");
        conn.addProperty("port", server.getAddress().getPort());
        conn.addProperty("token", token);
        Path file = FMLPaths.GAMEDIR.get().resolve("mcbridge").resolve("connection.json");
        Files.createDirectories(file.getParent());
        Files.writeString(file, GSON.toJson(conn));
        McBridge.LOGGER.info("[mcbridge] listening on {} (connection info: {}; actions {})",
                server.getAddress(), file, Config.actionsEnabled() ? "enabled" : "disabled");
    }

    private interface Handler { JsonObject handle(JsonObject req) throws Exception; }
    private interface AsyncBody { CompletableFuture<JsonObject> get(); }

    private static JsonObject hello() {
        JsonObject o = new JsonObject();
        o.addProperty("name", "mc-bridge");
        o.addProperty("protocol", PROTOCOL);
        o.addProperty("loader", "neoforge");
        o.addProperty("minecraft", net.minecraft.SharedConstants.getCurrentVersion().getName());
        JsonArray caps = new JsonArray();
        caps.add("observe");
        caps.add("terrain");
        caps.add("find");
        caps.add("blocks");
        caps.add("look");
        caps.add("move");
        caps.add("goto");
        caps.add("stop");
        caps.add("interact");
        caps.add("hotbar");
        caps.add("chat");
        caps.add("screen");
        caps.add("click");
        caps.add("craft");
        o.add("capabilities", caps);
        o.addProperty("actionsEnabled", Config.actionsEnabled());
        o.addProperty("commandsAllowed", Config.commandsAllowed());
        return o;
    }

    private static JsonObject onClientThread(AsyncBody body, long timeoutMs) throws Exception {
        CompletableFuture<JsonObject> f = new CompletableFuture<>();
        Minecraft.getInstance().execute(() -> {
            try {
                body.get().whenComplete((v, t) -> {
                    if (t instanceof java.util.concurrent.CompletionException && t.getCause() != null) t = t.getCause();
                    if (t != null) f.completeExceptionally(t); else f.complete(v);
                });
            } catch (Throwable t) {
                f.completeExceptionally(t);
            }
        });
        try {
            return f.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (ExecutionException e) {
            throw e.getCause() instanceof Exception c ? c : e;
        } catch (TimeoutException e) {
            throw new BridgeException(504, "game did not respond in time (is it frozen or still loading?)");
        }
    }

    private void handle(HttpExchange ex, String method, boolean needsAuth, boolean isAction, Handler handler)
            throws IOException {
        try {
            if (!method.equals(ex.getRequestMethod())) { send(ex, 405, error("use " + method)); return; }
            String host = ex.getRequestHeaders().getFirst("Host");
            if (host == null || !(host.startsWith("127.0.0.1:") || host.startsWith("localhost:"))) {
                send(ex, 403, error("bad host")); return; // blocks DNS-rebinding
            }
            if (needsAuth) {
                String auth = ex.getRequestHeaders().getFirst("Authorization");
                String expected = "Bearer " + token;
                if (auth == null || !MessageDigest.isEqual(
                        auth.getBytes(StandardCharsets.UTF_8), expected.getBytes(StandardCharsets.UTF_8))) {
                    send(ex, 401, error("unauthorized")); return;
                }
            }
            if (isAction && !Config.actionsEnabled()) {
                send(ex, 403, error("actions are disabled; set \"actionsEnabled\": true in " + Config.file()));
                return;
            }
            JsonObject req = new JsonObject();
            if ("POST".equals(method)) {
                byte[] raw = ex.getRequestBody().readNBytes(MAX_BODY + 1);
                if (raw.length > MAX_BODY) { send(ex, 413, error("body too large")); return; }
                String s = new String(raw, StandardCharsets.UTF_8).trim();
                if (!s.isEmpty()) {
                    try {
                        req = JsonParser.parseString(s).getAsJsonObject();
                    } catch (Exception e) {
                        send(ex, 400, error("body must be a JSON object")); return;
                    }
                }
            }
            send(ex, 200, handler.handle(req));
        } catch (BridgeException e) {
            send(ex, e.status, error(e.getMessage()));
        } catch (IllegalStateException | UnsupportedOperationException | NumberFormatException | ClassCastException e) {
            send(ex, 400, error("bad request: " + e.getMessage()));
        } catch (Throwable t) {
            send(ex, 500, error(t.getClass().getSimpleName() + ": " + t.getMessage()));
        }
    }

    private static JsonObject error(String msg) {
        JsonObject o = new JsonObject();
        o.addProperty("error", msg);
        return o;
    }

    private static void send(HttpExchange ex, int code, JsonObject json) throws IOException {
        byte[] bytes = GSON.toJson(json).getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(code, bytes.length);
        try (var os = ex.getResponseBody()) { os.write(bytes); }
    }
}
