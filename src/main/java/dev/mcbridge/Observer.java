package dev.mcbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;

import java.util.Map;
import java.util.TreeMap;

/** Read-only snapshot of the client's view of the game. Must be called on the client thread. */
public final class Observer {
    public static final int ENTITY_RADIUS = 16;
    public static final int BLOCK_RADIUS = 4;
    public static final int MAX_ENTITIES = 64;
    public static final int CHAT_LINES = 10;

    private Observer() {}

    public static JsonObject observe() {
        Minecraft mc = Minecraft.getInstance();
        JsonObject out = new JsonObject();
        out.addProperty("protocol", BridgeServer.PROTOCOL);
        out.addProperty("minecraft", net.minecraft.SharedConstants.getCurrentVersion().getName());
        out.addProperty("tick", mc.level == null ? -1 : mc.level.getGameTime());

        Object screen = mc.screen;
        out.addProperty("screen", screen == null ? null : screen.getClass().getName());

        LocalPlayer p = mc.player;
        Level level = mc.level;
        out.addProperty("inWorld", p != null && level != null);
        if (p == null || level == null) return out;
        out.add("container", Containers.snapshot(mc));

        JsonObject player = new JsonObject();
        player.addProperty("name", p.getGameProfile().getName());
        player.add("pos", vec(p.getX(), p.getY(), p.getZ()));
        // Minecraft never wraps rotation; normalize yaw to [-180, 180).
        player.addProperty("yaw", net.minecraft.util.Mth.wrapDegrees(p.getYRot()));
        player.addProperty("pitch", p.getXRot());
        player.addProperty("health", p.getHealth());
        player.addProperty("food", p.getFoodData().getFoodLevel());
        player.addProperty("onGround", p.onGround());
        player.addProperty("dimension", level.dimension().location().toString());
        player.addProperty("gamemode", mc.gameMode == null ? null : mc.gameMode.getPlayerMode().getName());
        player.addProperty("selectedHotbarSlot", p.getInventory().selected);
        out.add("player", player);

        out.add("inventory", inventory(p));
        out.add("target", target(mc));
        out.add("entities", entities(p, level));
        out.add("blocksNearby", blockCounts(p, level));
        out.add("action", Actions.status());
        out.add("chat", Actions.recentChat(CHAT_LINES));
        return out;
    }

    private static JsonObject vec(double x, double y, double z) {
        JsonObject o = new JsonObject();
        o.addProperty("x", x);
        o.addProperty("y", y);
        o.addProperty("z", z);
        return o;
    }

    private static JsonArray inventory(LocalPlayer p) {
        JsonArray arr = new JsonArray();
        int size = p.getInventory().getContainerSize();
        for (int i = 0; i < size; i++) {
            ItemStack s = p.getInventory().getItem(i);
            if (s.isEmpty()) continue;
            JsonObject o = new JsonObject();
            o.addProperty("slot", i);
            o.addProperty("id", BuiltInRegistries.ITEM.getKey(s.getItem()).toString());
            o.addProperty("count", s.getCount());
            o.addProperty("name", s.getHoverName().getString());
            arr.add(o);
        }
        return arr;
    }

    static JsonObject target(Minecraft mc) {
        JsonObject o = new JsonObject();
        HitResult hit = mc.hitResult;
        if (hit instanceof BlockHitResult b && b.getType() == HitResult.Type.BLOCK) {
            BlockPos pos = b.getBlockPos();
            BlockState st = mc.level.getBlockState(pos);
            o.addProperty("type", "block");
            o.addProperty("id", BuiltInRegistries.BLOCK.getKey(st.getBlock()).toString());
            o.add("pos", vec(pos.getX(), pos.getY(), pos.getZ()));
            o.addProperty("face", b.getDirection().getName());
        } else if (hit instanceof EntityHitResult e) {
            Entity en = e.getEntity();
            o.addProperty("type", "entity");
            o.addProperty("id", BuiltInRegistries.ENTITY_TYPE.getKey(en.getType()).toString());
            o.add("pos", vec(en.getX(), en.getY(), en.getZ()));
        } else {
            o.addProperty("type", "none");
        }
        return o;
    }

    private static JsonArray entities(LocalPlayer p, Level level) {
        JsonArray arr = new JsonArray();
        var box = p.getBoundingBox().inflate(ENTITY_RADIUS);
        int n = 0;
        for (Entity e : level.getEntities(p, box, x -> true)) {
            if (n++ >= MAX_ENTITIES) break;
            JsonObject o = new JsonObject();
            o.addProperty("id", BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).toString());
            o.addProperty("name", e.getName().getString());
            o.add("pos", vec(e.getX(), e.getY(), e.getZ()));
            o.addProperty("distance", Math.round(e.distanceTo(p) * 10.0) / 10.0);
            arr.add(o);
        }
        return arr;
    }

    private static JsonObject blockCounts(LocalPlayer p, Level level) {
        Map<String, Integer> counts = new TreeMap<>();
        BlockPos c = p.blockPosition();
        for (BlockPos pos : BlockPos.betweenClosed(
                c.offset(-BLOCK_RADIUS, -BLOCK_RADIUS, -BLOCK_RADIUS),
                c.offset(BLOCK_RADIUS, BLOCK_RADIUS, BLOCK_RADIUS))) {
            BlockState st = level.getBlockState(pos);
            if (st.isAir()) continue;
            counts.merge(BuiltInRegistries.BLOCK.getKey(st.getBlock()).toString(), 1, Integer::sum);
        }
        JsonObject o = new JsonObject();
        counts.forEach(o::addProperty);
        return o;
    }
}
