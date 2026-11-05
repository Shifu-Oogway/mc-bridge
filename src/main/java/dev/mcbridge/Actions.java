package dev.mcbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Options;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.commands.arguments.EntityAnchorArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.util.Mth;
import net.minecraft.util.StringUtil;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.neoforge.client.event.ClientChatReceivedEvent;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.InputEvent;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * Player input driven through the player's own key bindings: look, timed movement, attack/use, hotbar and chat.
 * All state is touched on the client thread only. Any real key press, mouse click, scroll or mouse turn cancels a
 * running hold.
 */
public final class Actions {
    public static final int MAX_MOVE_TICKS = 100;
    public static final int MAX_HOLD_TICKS = 200;
    private static final int CHAT_REPLY_TICKS = 5;
    private static final int CHAT_LOG_SIZE = 50;
    // Walking covers ~2 blocks and sneaking ~0.6 per window, so less than this means something is in the way.
    private static final int STUCK_WINDOW = 10;
    private static final double STUCK_DISTANCE = 0.25;
    private static final Set<String> HORIZONTAL = Set.of("forward", "back", "left", "right");

    private static final Map<String, Function<Options, KeyMapping>> MOVE_KEYS = new LinkedHashMap<>();
    static {
        MOVE_KEYS.put("forward", o -> o.keyUp);
        MOVE_KEYS.put("back", o -> o.keyDown);
        MOVE_KEYS.put("left", o -> o.keyLeft);
        MOVE_KEYS.put("right", o -> o.keyRight);
        MOVE_KEYS.put("jump", o -> o.keyJump);
        MOVE_KEYS.put("sneak", o -> o.keyShift);
        MOVE_KEYS.put("sprint", o -> o.keySprint);
        MOVE_KEYS.put("attack", o -> o.keyAttack);
        MOVE_KEYS.put("use", o -> o.keyUse);
    }

    /** A timed hold of one or more keys: a move, or holding attack/use. */
    private static final class Hold {
        final String type;
        final List<String> names;
        final List<KeyMapping> keys;
        final int total;
        int left;
        final Vec3 start;
        final boolean horizontal;
        final ArrayDeque<Vec3> recent = new ArrayDeque<>();
        JsonObject targetBefore;
        BlockPos targetBlock;
        String blockBefore;
        Nav nav;
        final CompletableFuture<JsonObject> done = new CompletableFuture<>();

        Hold(String type, List<String> names, List<KeyMapping> keys, int ticks, Vec3 start) {
            this.type = type;
            this.names = names;
            this.keys = keys;
            this.total = ticks;
            this.left = ticks;
            this.start = start;
            this.horizontal = names.stream().anyMatch(HORIZONTAL::contains);
        }
    }

    private static final class Delayed {
        int ticks;
        final java.util.function.BooleanSupplier ready;
        final CompletableFuture<JsonObject> future;
        final Supplier<JsonObject> result;

        Delayed(int ticks, java.util.function.BooleanSupplier ready, CompletableFuture<JsonObject> future, Supplier<JsonObject> result) {
            this.ticks = ticks;
            this.ready = ready;
            this.future = future;
            this.result = result;
        }
    }

    /** Walking a planned path. */
    private static final class Nav {
        final int gx, gz;
        final Integer gy;
        final double tolerance;
        List<BlockPos> path;
        boolean reachable;
        int index;
        int replans;
        double best = Double.MAX_VALUE;
        int sinceProgress;

        Nav(int gx, Integer gy, int gz, double tolerance) {
            this.gx = gx;
            this.gy = gy;
            this.gz = gz;
            this.tolerance = tolerance;
        }

        void use(Pathfinder.Result r) {
            path = r.path();
            reachable = r.reached();
            index = 0;
            best = Double.MAX_VALUE;
            sinceProgress = 0;
        }
    }

    public static final int MAX_GOTO_DISTANCE = 96;
    public static final int MAX_GOTO_TICKS = 1200;
    private static final int MAX_REPLANS = 3;
    private static final int NAV_STUCK_TICKS = 30;

    // Releasing sneak while still carrying speed into a ledge slips you off it, so sneak is let go a little later.
    private static final int SNEAK_GRACE_TICKS = 6;
    private static int sneakGrace;

    private static Hold hold;
    private static final List<Delayed> delayed = new ArrayList<>();
    private static final ArrayDeque<JsonObject> chatLog = new ArrayDeque<>();
    private static long chatSeq;

    private Actions() {}

    public static boolean holdingAttack() {
        return hold != null && hold.keys.contains(Minecraft.getInstance().options.keyAttack);
    }

    static JsonElement status() {
        if (hold == null) return null;
        JsonObject o = new JsonObject();
        o.addProperty("type", hold.type);
        o.add("keys", names(hold.names));
        o.addProperty("ticksLeft", hold.left);
        return o;
    }

    static JsonArray recentChat(int n) {
        JsonArray a = new JsonArray();
        int skip = Math.max(0, chatLog.size() - n);
        for (JsonObject m : chatLog) if (skip-- <= 0) a.add(m);
        return a;
    }

    /** Resolves after {@code ticks} client ticks have completed, with whatever {@code result} reports then. */
    static CompletableFuture<JsonObject> afterTicks(int ticks, Supplier<JsonObject> result) {
        return waitFor(null, ticks, result);
    }

    /** Resolves at the end of the first tick where {@code ready} holds, or after {@code maxTicks} regardless. */
    static CompletableFuture<JsonObject> waitFor(java.util.function.BooleanSupplier ready, int maxTicks, Supplier<JsonObject> result) {
        CompletableFuture<JsonObject> f = new CompletableFuture<>();
        delayed.add(new Delayed(maxTicks, ready, f, result));
        return f;
    }

    // ---- look -------------------------------------------------------------------------------------------------

    static CompletableFuture<JsonObject> look(JsonObject req) {
        LocalPlayer p = requirePlayer();
        if (req.has("at")) {
            JsonObject at = req.getAsJsonObject("at");
            p.lookAt(EntityAnchorArgument.Anchor.EYES, new Vec3(num(at, "x"), num(at, "y"), num(at, "z")));
        } else {
            if (!req.has("yaw") && !req.has("pitch")) throw new BridgeException(400, "give yaw and/or pitch, or at {x,y,z}");
            if (req.has("yaw")) p.setYRot(Mth.wrapDegrees((float) num(req, "yaw")));
            if (req.has("pitch")) p.setXRot(Mth.clamp((float) num(req, "pitch"), -90f, 90f));
            p.yRotO = p.getYRot();
            p.xRotO = p.getXRot();
            p.setYHeadRot(p.getYRot());
        }
        // Answered after the next tick, once the crosshair target is recomputed.
        return afterTicks(1, () -> {
            Minecraft mc = Minecraft.getInstance();
            JsonObject r = new JsonObject();
            if (mc.player == null || mc.level == null) return r;
            r.addProperty("yaw", Mth.wrapDegrees(mc.player.getYRot()));
            r.addProperty("pitch", mc.player.getXRot());
            r.add("target", Observer.target(mc));
            return r;
        });
    }

    // ---- move -------------------------------------------------------------------------------------------------

    static CompletableFuture<JsonObject> move(JsonObject req) {
        Minecraft mc = Minecraft.getInstance();
        LocalPlayer p = requirePlayer();
        closeContainerForAction(mc);
        if (!req.has("keys") || !req.get("keys").isJsonArray()) throw new BridgeException(400, "keys must be an array");
        List<String> names = new ArrayList<>();
        List<KeyMapping> keys = new ArrayList<>();
        for (JsonElement e : req.getAsJsonArray("keys")) {
            String n = e.getAsString();
            Function<Options, KeyMapping> k = MOVE_KEYS.get(n);
            if (k == null) throw new BridgeException(400, "unknown key \"" + n + "\"; use " + MOVE_KEYS.keySet());
            if (!names.contains(n)) { names.add(n); keys.add(k.apply(mc.options)); }
        }
        int ticks = ticks(req, MAX_MOVE_TICKS, true);
        return begin(new Hold("move", names, keys, ticks, p.position()), p);
    }

    // ---- goto -------------------------------------------------------------------------------------------------

    static CompletableFuture<JsonObject> goTo(JsonObject req) {
        Minecraft mc = Minecraft.getInstance();
        LocalPlayer p = requirePlayer();
        boolean dryRun = req.has("dryRun") && req.get("dryRun").getAsBoolean();
        if (!dryRun) closeContainerForAction(mc);
        int gx = Mth.floor(num(req, "x")), gz = Mth.floor(num(req, "z"));
        Integer gy = req.has("y") && !req.get("y").isJsonNull() ? Mth.floor(req.get("y").getAsDouble()) : null;
        double tolerance = req.has("tolerance") ? req.get("tolerance").getAsDouble() : 1.0;
        if (tolerance < 0 || tolerance > 8) throw new BridgeException(400, "tolerance must be 0..8");
        if (Math.hypot(gx - p.getX(), gz - p.getZ()) > MAX_GOTO_DISTANCE) {
            throw new BridgeException(400, "target is more than " + MAX_GOTO_DISTANCE + " blocks away; go in stages");
        }
        BlockPos start = Pathfinder.standingAt(mc.level, p.getX(), p.getY(), p.getZ());
        if (start == null) throw new BridgeException(409, "not standing on solid ground (falling, flying or swimming)");
        if (gy == null) {
            // Without y, "that column" means the floor nearest our height, never a cave far below or a ledge far above.
            gy = Pathfinder.nearestStandableY(mc.level, gx, gz, start.getY(), 24);
            if (gy == null) throw new BridgeException(409, "nothing to stand on at x=" + gx + " z=" + gz + " within 24 blocks of your height; give y");
        }

        Nav nav = new Nav(gx, gy, gz, tolerance);
        Pathfinder.Result r = Pathfinder.find(mc.level, start, gx, gy, gz, tolerance);
        nav.use(r);
        if (dryRun) {
            JsonObject out = new JsonObject();
            out.addProperty("goalY", gy);
            out.addProperty("reachable", r.reached());
            out.addProperty("expanded", r.expanded());
            JsonArray wps = new JsonArray();
            for (BlockPos w : r.path()) {
                JsonObject o = new JsonObject();
                o.addProperty("x", w.getX());
                o.addProperty("y", w.getY());
                o.addProperty("z", w.getZ());
                wps.add(o);
            }
            out.add("path", wps);
            return CompletableFuture.completedFuture(out);
        }
        if (r.path().isEmpty()) {
            if (r.reached()) {
                JsonObject out = new JsonObject();
                out.addProperty("outcome", "completed");
                out.addProperty("reason", "already there");
                return CompletableFuture.completedFuture(out);
            }
            throw new BridgeException(409, "no path found: every route is blocked by walls, drops over " + 3 + " blocks, or hazards");
        }
        int ticks = Math.min(MAX_GOTO_TICKS, 60 + r.path().size() * 15);
        Hold h = new Hold("goto", List.of("forward", "jump", "sneak"),
                List.of(mc.options.keyUp, mc.options.keyJump, mc.options.keyShift), ticks, p.position());
        h.nav = nav;
        return begin(h, p);
    }

    private static void navTick(Minecraft mc, LocalPlayer p, Hold h) {
        Nav n = h.nav;
        while (n.index < n.path.size()) {
            BlockPos w = n.path.get(n.index);
            if (Math.hypot(w.getX() + 0.5 - p.getX(), w.getZ() + 0.5 - p.getZ()) < 0.45 && Math.abs(p.getY() - w.getY()) < 1.0) {
                n.index++;
                n.best = Double.MAX_VALUE;
                n.sinceProgress = 0;
            } else {
                break;
            }
        }
        if (n.index >= n.path.size()) {
            if (n.reachable) finish("completed", null);
            else finish("partial", "the target is not reachable; stopped at the closest point found");
            return;
        }
        BlockPos w = n.path.get(n.index);
        double dx = w.getX() + 0.5 - p.getX(), dz = w.getZ() + 0.5 - p.getZ();
        double horiz = Math.hypot(dx, dz);
        double dist = horiz + Math.abs(w.getY() - p.getY());
        if (dist < n.best - 0.05) {
            n.best = dist;
            n.sinceProgress = 0;
        } else if (++n.sinceProgress > NAV_STUCK_TICKS) {
            BlockPos here = Pathfinder.standingAt(mc.level, p.getX(), p.getY(), p.getZ());
            if (n.replans >= MAX_REPLANS || here == null) { finish("blocked", "stuck on the way; tried " + n.replans + " new routes"); return; }
            n.replans++;
            n.use(Pathfinder.find(mc.level, here, n.gx, n.gy, n.gz, n.tolerance));
            if (n.path.isEmpty()) { finish(n.reachable ? "completed" : "blocked", n.reachable ? null : "no route from here"); return; }
            return;
        }

        float yaw = (float) (Mth.atan2(dz, dx) * Mth.RAD_TO_DEG) - 90f;
        p.setYRot(yaw);
        p.yRotO = yaw;
        p.setYHeadRot(yaw);
        int feetY = Mth.floor(p.getY() + 0.01);
        boolean climb = w.getY() > feetY && horiz < 1.3;
        boolean jump = climb || p.isInWater() || (p.horizontalCollision && p.onGround());
        // Sneaking stops vanilla movement at ledges, so momentum can't carry us over an unsafe drop near the
        // waypoint or past the final one. Never when the next waypoint is an intended drop.
        boolean intendedDrop = w.getY() < feetY;
        boolean last = n.index == n.path.size() - 1;
        boolean sneak = p.onGround() && !intendedDrop && horiz < 1.2 && (last || Pathfinder.nearUnsafeDrop(mc.level, w));
        setKey(mc.options, mc.options.keyUp, true);
        setKey(mc.options, mc.options.keyJump, jump);
        setKey(mc.options, mc.options.keyShift, sneak);
    }

    // ---- attack / use -----------------------------------------------------------------------------------------

    static CompletableFuture<JsonObject> interact(JsonObject req) {
        Minecraft mc = Minecraft.getInstance();
        LocalPlayer p = requirePlayer();
        closeContainerForAction(mc);
        String action = req.has("action") ? req.get("action").getAsString() : "";
        KeyMapping key = switch (action) {
            case "attack" -> mc.options.keyAttack;
            case "use" -> mc.options.keyUse;
            default -> throw new BridgeException(400, "action must be \"attack\" or \"use\"");
        };
        JsonObject targetBefore = Observer.target(mc);
        BlockPos targetBlock = mc.hitResult instanceof BlockHitResult b && b.getType() == HitResult.Type.BLOCK ? b.getBlockPos() : null;
        String blockBefore = targetBlock == null ? null : blockId(mc, targetBlock);

        // A real press always registers one click; holding then keeps the key down.
        KeyMapping.click(key.getKey());
        if (!req.has("ticks")) {
            return afterTicks(1, () -> interactResult(action, "click", targetBefore, targetBlock, blockBefore));
        }
        int ticks = ticks(req, MAX_HOLD_TICKS, true);
        Hold h = new Hold(action, List.of(action), List.of(key), ticks, p.position());
        h.targetBefore = targetBefore;
        h.targetBlock = targetBlock;
        h.blockBefore = blockBefore;
        return begin(h, p);
    }

    private static JsonObject interactResult(String action, String mode, JsonObject targetBefore, BlockPos targetBlock, String blockBefore) {
        Minecraft mc = Minecraft.getInstance();
        JsonObject r = new JsonObject();
        r.addProperty("action", action);
        r.addProperty("mode", mode);
        addInteractDetails(r, mc, targetBefore, targetBlock, blockBefore);
        return r;
    }

    private static void addInteractDetails(JsonObject r, Minecraft mc, JsonObject targetBefore, BlockPos targetBlock, String blockBefore) {
        r.add("targetBefore", targetBefore);
        if (mc.player == null || mc.level == null) return;
        r.add("targetAfter", Observer.target(mc));
        if (targetBlock != null) {
            String after = blockId(mc, targetBlock);
            r.addProperty("blockBefore", blockBefore);
            r.addProperty("blockAfter", after);
            r.addProperty("blockBroken", !blockBefore.equals("minecraft:air") && after.equals("minecraft:air"));
        }
        r.add("held", item(mc.player.getMainHandItem()));
    }

    // ---- hotbar -----------------------------------------------------------------------------------------------

    static CompletableFuture<JsonObject> hotbar(JsonObject req) {
        LocalPlayer p = requirePlayer();
        if (!req.has("slot")) throw new BridgeException(400, "slot is required");
        int slot = req.get("slot").getAsInt();
        if (slot < 0 || slot > 8) throw new BridgeException(400, "slot must be 0..8");
        p.getInventory().selected = slot; // what the number keys do; the game syncs it to the server on its tick
        return afterTicks(1, () -> {
            Minecraft mc = Minecraft.getInstance();
            JsonObject r = new JsonObject();
            if (mc.player == null) return r;
            r.addProperty("slot", mc.player.getInventory().selected);
            r.add("held", item(mc.player.getMainHandItem()));
            return r;
        });
    }

    // ---- chat -------------------------------------------------------------------------------------------------

    static CompletableFuture<JsonObject> chat(JsonObject req) {
        LocalPlayer p = requirePlayer();
        String msg = req.has("message") ? req.get("message").getAsString().trim() : "";
        if (msg.isEmpty()) throw new BridgeException(400, "message is required");
        if (msg.length() > 256) throw new BridgeException(400, "message is longer than 256 characters");
        for (int i = 0; i < msg.length(); i++) {
            if (!StringUtil.isAllowedChatCharacter(msg.charAt(i))) throw new BridgeException(400, "message contains a character chat does not allow");
        }
        boolean command = msg.startsWith("/");
        if (command && !Config.commandsAllowed()) {
            throw new BridgeException(403, "commands are disabled; set \"allowCommands\": true in " + Config.file());
        }
        long since = chatSeq;
        if (command) p.connection.sendCommand(msg.substring(1));
        else p.connection.sendChat(msg);
        // Wait a few ticks so replies and command output come back with the call.
        return afterTicks(CHAT_REPLY_TICKS, () -> {
            JsonObject r = new JsonObject();
            r.addProperty("sent", msg);
            r.addProperty("kind", command ? "command" : "chat");
            JsonArray replies = new JsonArray();
            for (JsonObject m : chatLog) if (m.get("seq").getAsLong() > since) replies.add(m);
            r.add("messages", replies);
            return r;
        });
    }

    @SubscribeEvent
    public static void onChat(ClientChatReceivedEvent e) {
        JsonObject m = new JsonObject();
        m.addProperty("seq", ++chatSeq);
        m.addProperty("system", e.isSystem());
        m.addProperty("text", e.getMessage().getString());
        chatLog.addLast(m);
        while (chatLog.size() > CHAT_LOG_SIZE) chatLog.removeFirst();
    }

    // ---- stop / tick / input ----------------------------------------------------------------------------------

    static JsonObject stop() {
        JsonObject o = new JsonObject();
        o.addProperty("stopped", hold != null);
        if (hold != null) finish("interrupted", "stopped by request");
        return o;
    }

    private static CompletableFuture<JsonObject> begin(Hold h, LocalPlayer p) {
        if (hold != null) finish("interrupted", "superseded by a new action");
        hold = h;
        return h.done;
    }

    @SubscribeEvent
    public static void onTickPre(ClientTickEvent.Pre e) {
        Minecraft mc = Minecraft.getInstance();
        if (sneakGrace > 0 && (hold == null || !hold.keys.contains(mc.options.keyShift))) {
            sneakGrace--;
            setKey(mc.options, mc.options.keyShift, sneakGrace > 0 || physicallyDown(mc, mc.options.keyShift));
        }
        if (hold == null) return;
        LocalPlayer p = mc.player;
        if (p == null || mc.level == null) { finish("interrupted", "left the world"); return; }
        if (mc.screen != null) { finish("interrupted", screenMessage(mc)); return; }
        if (hold.nav != null) {
            if (hold.left == 0) { finish("blocked", "ran out of time on the way"); return; }
            navTick(mc, p, hold);
            if (hold != null) hold.left--;
            return;
        }
        if (hold.left == 0) { finish("completed", null); return; }
        if (hold.horizontal) {
            hold.recent.addLast(p.position());
            if (hold.recent.size() > STUCK_WINDOW) {
                Vec3 then = hold.recent.removeFirst();
                if (horizontalDistance(then, p.position()) < STUCK_DISTANCE) {
                    finish("blocked", "no progress for " + STUCK_WINDOW + " ticks; check mc_terrain for a way around");
                    return;
                }
            }
        }
        if (hold.type.equals("attack") && hold.targetBlock != null && mc.level.getBlockState(hold.targetBlock).isAir()) {
            finish("completed", "block broken");
            return;
        }
        // Re-asserted every tick: focus changes and screens reset key state behind our back.
        for (KeyMapping k : hold.keys) setKey(mc.options, k, true);
        hold.left--;
    }

    @SubscribeEvent
    public static void onTickPost(ClientTickEvent.Post e) {
        Minecraft mc = Minecraft.getInstance();
        // Collect first: completing a future can chain a new wait, which adds to the list.
        List<Delayed> due = new ArrayList<>();
        for (Iterator<Delayed> it = delayed.iterator(); it.hasNext(); ) {
            Delayed d = it.next();
            d.ticks--;
            boolean isReady;
            try { isReady = d.ready != null && d.ready.getAsBoolean(); } catch (Throwable t) { isReady = true; }
            if (!isReady && d.ticks > 0) continue;
            it.remove();
            due.add(d);
        }
        for (Delayed d : due) {
            try { d.future.complete(d.result.get()); } catch (Throwable t) { d.future.completeExceptionally(t); }
        }
    }

    @SubscribeEvent
    public static void onKey(InputEvent.Key e) {
        if (hold != null && e.getAction() == GLFW.GLFW_PRESS) finish("interrupted", "human key press: " + InputConstants.getKey(e.getKey(), e.getScanCode()).getName());
    }

    @SubscribeEvent
    public static void onMouseButton(InputEvent.MouseButton.Pre e) {
        if (hold != null && e.getAction() == GLFW.GLFW_PRESS) finish("interrupted", "human mouse click");
    }

    /** Called by MouseHandlerMixin when real mouse motion arrives while the mouse is captured. */
    public static void onHumanMouseMove() {
        if (hold != null) finish("interrupted", "human mouse movement");
    }

    @SubscribeEvent
    public static void onScroll(InputEvent.MouseScrollingEvent e) {
        if (hold != null) finish("interrupted", "human mouse scroll");
    }

    private static void finish(String outcome, String reason) {
        Hold h = hold;
        hold = null;
        Minecraft mc = Minecraft.getInstance();
        // Hand keys back in whatever state the real keyboard has them, so a human's key press survives.
        for (KeyMapping k : h.keys) {
            if (k == mc.options.keyShift && k.isDown()) {
                sneakGrace = SNEAK_GRACE_TICKS; // released by onTickPre once our speed has died down
                continue;
            }
            setKey(mc.options, k, physicallyDown(mc, k));
        }
        JsonObject r = new JsonObject();
        r.addProperty("outcome", outcome);
        if (reason != null) r.addProperty("reason", reason);
        r.add("keys", names(h.names));
        r.addProperty("ticksRun", h.total - h.left);
        LocalPlayer p = mc.player;
        if (h.nav != null && p != null) {
            Nav n = h.nav;
            JsonObject goal = new JsonObject();
            goal.addProperty("x", n.gx);
            goal.addProperty("y", n.gy);
            goal.addProperty("z", n.gz);
            r.add("goal", goal);
            r.addProperty("remaining", Math.round(Math.hypot(n.gx + 0.5 - p.getX(), n.gz + 0.5 - p.getZ()) * 10.0) / 10.0);
            r.addProperty("pathLength", n.path.size());
            r.addProperty("waypointsLeft", Math.max(0, n.path.size() - n.index));
            r.addProperty("replans", n.replans);
        }
        if (h.type.equals("move") || h.type.equals("goto")) {
            if (p != null) {
                JsonObject pos = new JsonObject();
                pos.addProperty("x", p.getX());
                pos.addProperty("y", p.getY());
                pos.addProperty("z", p.getZ());
                r.add("pos", pos);
                r.addProperty("moved", Math.round(horizontalDistance(h.start, p.position()) * 100.0) / 100.0);
                r.addProperty("onGround", p.onGround());
            }
        } else {
            r.addProperty("action", h.type);
            r.addProperty("mode", "hold");
            addInteractDetails(r, mc, h.targetBefore, h.targetBlock, h.blockBefore);
        }
        h.done.complete(r);
    }

    // ---- helpers ----------------------------------------------------------------------------------------------

    private static void setKey(Options o, KeyMapping k, boolean down) {
        boolean toggleMode = (k == o.keyShift && o.toggleCrouch().get()) || (k == o.keySprint && o.toggleSprint().get());
        if (toggleMode) {
            if (k.isDown() != down) k.setDown(true); // in toggle mode every press flips the state
        } else {
            k.setDown(down);
        }
    }

    private static boolean physicallyDown(Minecraft mc, KeyMapping k) {
        InputConstants.Key key = k.getKey();
        long window = mc.getWindow().getWindow();
        return switch (key.getType()) {
            case KEYSYM -> key.getValue() != InputConstants.UNKNOWN.getValue() && InputConstants.isKeyDown(window, key.getValue());
            case MOUSE -> GLFW.glfwGetMouseButton(window, key.getValue()) == GLFW.GLFW_PRESS;
            default -> false;
        };
    }

    private static int ticks(JsonObject req, int max, boolean required) {
        if (!req.has("ticks")) {
            if (required) throw new BridgeException(400, "ticks is required");
            return 0;
        }
        int t = req.get("ticks").getAsInt();
        if (t < 1 || t > max) throw new BridgeException(400, "ticks must be 1.." + max);
        return t;
    }

    private static double horizontalDistance(Vec3 a, Vec3 b) {
        return Math.hypot(a.x - b.x, a.z - b.z);
    }

    private static String blockId(Minecraft mc, BlockPos pos) {
        return BuiltInRegistries.BLOCK.getKey(mc.level.getBlockState(pos).getBlock()).toString();
    }

    static JsonElement item(ItemStack s) {
        if (s.isEmpty()) return null;
        JsonObject o = new JsonObject();
        o.addProperty("id", BuiltInRegistries.ITEM.getKey(s.getItem()).toString());
        o.addProperty("count", s.getCount());
        return o;
    }

    static LocalPlayer requirePlayer() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) throw new BridgeException(409, "not in a world");
        return mc.player;
    }

    static void requireNoScreen(Minecraft mc) {
        if (mc.screen != null) throw new BridgeException(409, screenMessage(mc));
    }

    /**
     * Before starting an action: close a leftover inventory/container screen (as E or Esc would) instead of failing.
     * Other screens (pause, chat, signs...) still block. A screen opened while the action runs still interrupts it.
     */
    static void closeContainerForAction(Minecraft mc) {
        if (mc.screen instanceof AbstractContainerScreen<?> s && mc.player != null) {
            if (!mc.player.containerMenu.getCarried().isEmpty()) {
                throw new BridgeException(409, "an item is on the cursor in " + s.getClass().getSimpleName()
                        + "; put it in a slot with mc_click_slot first");
            }
            mc.player.closeContainer(); // tells the server too
        }
        requireNoScreen(mc);
    }

    private static String screenMessage(Minecraft mc) {
        String s = mc.screen.getClass().getSimpleName();
        String hint = s.equals("PauseScreen") ? " (the game may have paused because its window lost focus)" : "";
        return "a screen is open: " + s + hint;
    }

    private static double num(JsonObject o, String k) {
        if (!o.has(k)) throw new BridgeException(400, "missing \"" + k + "\"");
        return o.get(k).getAsDouble();
    }

    private static JsonArray names(List<String> names) {
        JsonArray a = new JsonArray();
        names.forEach(a::add);
        return a;
    }
}
