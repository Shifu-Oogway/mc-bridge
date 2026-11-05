package dev.mcbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.tags.TagKey;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.phys.Vec3;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/** Block search and inspection around the player. Read-only; client thread only. */
public final class Blocks {
    public static final int MAX_RADIUS = 32;
    public static final int MAX_RESULTS = 50;
    public static final int MAX_POSITIONS = 64;

    private Blocks() {}

    // ---- find -------------------------------------------------------------------------------------------------

    static JsonObject find(JsonObject req) {
        Minecraft mc = Minecraft.getInstance();
        LocalPlayer p = requirePlayer(mc);
        Level level = mc.level;
        String query = req.has("block") ? req.get("block").getAsString().trim() : "";
        if (query.isEmpty()) throw new BridgeException(400, "block is required");
        Predicate<BlockState> match = matcher(query);
        int radius = req.has("radius") ? req.get("radius").getAsInt() : 16;
        if (radius < 1 || radius > MAX_RADIUS) throw new BridgeException(400, "radius must be 1.." + MAX_RADIUS);
        int limit = req.has("limit") ? req.get("limit").getAsInt() : 10;
        if (limit < 1 || limit > MAX_RESULTS) throw new BridgeException(400, "limit must be 1.." + MAX_RESULTS);
        boolean exposedOnly = req.has("exposedOnly") && req.get("exposedOnly").getAsBoolean();

        Vec3 eye = p.getEyePosition();
        BlockPos c = p.blockPosition();
        int minY = Math.max(level.getMinBuildHeight(), c.getY() - radius);
        int maxY = Math.min(level.getMaxBuildHeight() - 1, c.getY() + radius);
        record Hit(BlockPos pos, BlockState state, double dist) {}
        List<Hit> hits = new ArrayList<>();
        int total = 0;
        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
        for (int x = c.getX() - radius; x <= c.getX() + radius; x++) {
            for (int z = c.getZ() - radius; z <= c.getZ() + radius; z++) {
                if (!level.hasChunkAt(pos.set(x, c.getY(), z))) continue;
                for (int y = minY; y <= maxY; y++) {
                    BlockState st = level.getBlockState(pos.set(x, y, z));
                    if (st.isAir() || !match.test(st)) continue;
                    if (exposedOnly && !exposed(level, pos)) continue;
                    total++;
                    hits.add(new Hit(pos.immutable(), st, eye.distanceTo(Vec3.atCenterOf(pos))));
                }
            }
        }
        hits.sort(Comparator.comparingDouble(Hit::dist));

        double reach = p.blockInteractionRange();
        JsonArray arr = new JsonArray();
        for (Hit h : hits.subList(0, Math.min(limit, hits.size()))) {
            JsonObject o = new JsonObject();
            o.addProperty("id", id(h.state));
            o.add("pos", vec(h.pos));
            o.addProperty("distance", Math.round(h.dist * 10.0) / 10.0);
            o.addProperty("inReach", h.dist <= reach + 0.5);
            o.addProperty("exposed", exposed(level, h.pos));
            arr.add(o);
        }
        JsonObject out = new JsonObject();
        out.addProperty("query", query);
        out.addProperty("radius", radius);
        out.addProperty("found", total);
        out.addProperty("reach", reach);
        out.add("results", arr);
        return out;
    }

    /** "spruce_log" / "minecraft:spruce_log" exact, "*_log" glob on the id, "#minecraft:logs" block tag. */
    private static Predicate<BlockState> matcher(String q) {
        if (q.startsWith("#")) {
            ResourceLocation tag = ResourceLocation.tryParse(q.substring(1).contains(":") ? q.substring(1) : "minecraft:" + q.substring(1));
            if (tag == null) throw new BridgeException(400, "bad tag \"" + q + "\"");
            TagKey<Block> key = TagKey.create(Registries.BLOCK, tag);
            if (BuiltInRegistries.BLOCK.getTag(key).isEmpty()) throw new BridgeException(400, "unknown block tag \"" + q + "\"");
            return st -> st.is(key);
        }
        if (q.contains("*")) {
            String glob = q.contains(":") ? q : "minecraft:" + q;
            Pattern re = Pattern.compile(Pattern.quote(glob).replace("*", "\\E.*\\Q"));
            return st -> re.matcher(id(st)).matches();
        }
        ResourceLocation key = ResourceLocation.tryParse(q.contains(":") ? q : "minecraft:" + q);
        Block block = key == null ? null : BuiltInRegistries.BLOCK.getOptional(key).orElse(null);
        if (block == null) throw new BridgeException(400, "unknown block \"" + q + "\"; use a glob like *_log or a tag like #minecraft:logs");
        return st -> st.is(block);
    }

    /** True if at least one face touches a block you can see through, so it can be seen and mined directly. */
    private static boolean exposed(Level level, BlockPos pos) {
        for (Direction d : Direction.values()) {
            BlockPos n = pos.relative(d);
            if (!level.getBlockState(n).isSolidRender(level, n)) return true;
        }
        return false;
    }

    // ---- inspect ----------------------------------------------------------------------------------------------

    static JsonObject inspect(JsonObject req) {
        Minecraft mc = Minecraft.getInstance();
        LocalPlayer p = requirePlayer(mc);
        Level level = mc.level;
        if (!req.has("positions") || !req.get("positions").isJsonArray()) throw new BridgeException(400, "positions must be an array of {x,y,z}");
        JsonArray in = req.getAsJsonArray("positions");
        if (in.isEmpty() || in.size() > MAX_POSITIONS) throw new BridgeException(400, "give 1.." + MAX_POSITIONS + " positions");
        Vec3 eye = p.getEyePosition();
        double reach = p.blockInteractionRange();
        JsonArray arr = new JsonArray();
        for (JsonElement e : in) {
            JsonObject q = e.getAsJsonObject();
            BlockPos pos = BlockPos.containing(num(q, "x"), num(q, "y"), num(q, "z"));
            JsonObject o = new JsonObject();
            o.add("pos", vec(pos));
            if (!level.hasChunkAt(pos)) {
                o.addProperty("loaded", false);
                arr.add(o);
                continue;
            }
            BlockState st = level.getBlockState(pos);
            o.addProperty("id", id(st));
            JsonObject props = new JsonObject();
            for (Map.Entry<Property<?>, Comparable<?>> pe : st.getValues().entrySet()) {
                props.addProperty(pe.getKey().getName(), pe.getValue().toString());
            }
            o.add("properties", props);
            o.addProperty("solid", !st.getCollisionShape(level, pos).isEmpty());
            o.addProperty("replaceable", st.canBeReplaced());
            o.addProperty("fluid", st.getFluidState().isEmpty() ? null : BuiltInRegistries.FLUID.getKey(st.getFluidState().getType()).toString());
            o.addProperty("light", level.getMaxLocalRawBrightness(pos));
            float hardness = st.getDestroySpeed(level, pos);
            o.addProperty("hardness", hardness);
            if (hardness >= 0 && !st.isAir()) addBestTool(o, p, st);
            o.addProperty("distance", Math.round(eye.distanceTo(Vec3.atCenterOf(pos)) * 10.0) / 10.0);
            o.addProperty("inReach", eye.distanceTo(Vec3.atCenterOf(pos)) <= reach + 0.5);
            arr.add(o);
        }
        JsonObject out = new JsonObject();
        out.add("blocks", arr);
        return out;
    }

    /**
     * The hotbar slot that mines this block best: one that gets drops first, then the fastest. When nothing beats
     * bare hands, prefer an item that won't lose durability.
     */
    private static void addBestTool(JsonObject o, LocalPlayer p, BlockState st) {
        int best = -1;
        boolean bestDrops = false;
        float bestSpeed = -1;
        boolean bestDamageable = true;
        for (int slot = 0; slot < 9; slot++) {
            net.minecraft.world.item.ItemStack s = p.getInventory().getItem(slot);
            boolean drops = !st.requiresCorrectToolForDrops() || s.isCorrectToolForDrops(st);
            float speed = s.getDestroySpeed(st);
            boolean damageable = s.isDamageableItem();
            boolean better = best < 0
                    || (drops && !bestDrops)
                    || (drops == bestDrops && speed > bestSpeed)
                    || (drops == bestDrops && speed == bestSpeed && bestDamageable && !damageable);
            if (better) {
                best = slot;
                bestDrops = drops;
                bestSpeed = speed;
                bestDamageable = damageable;
            }
        }
        o.addProperty("bestSlot", best);
        o.addProperty("dropsWithBest", bestDrops);
    }

    private static LocalPlayer requirePlayer(Minecraft mc) {
        if (mc.player == null || mc.level == null) throw new BridgeException(409, "not in a world");
        return mc.player;
    }

    private static String id(BlockState st) {
        return BuiltInRegistries.BLOCK.getKey(st.getBlock()).toString();
    }

    private static JsonObject vec(BlockPos pos) {
        JsonObject o = new JsonObject();
        o.addProperty("x", pos.getX());
        o.addProperty("y", pos.getY());
        o.addProperty("z", pos.getZ());
        return o;
    }

    private static double num(JsonObject o, String k) {
        if (!o.has(k)) throw new BridgeException(400, "missing \"" + k + "\"");
        return o.get(k).getAsDouble();
    }
}
