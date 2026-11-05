package dev.mcbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.Mth;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.phys.shapes.VoxelShape;
import net.minecraft.core.Direction;

/**
 * Walkability map around the player: for each column, where you would end up if you walked into it, relative to
 * the player's feet. Must be called on the client thread.
 */
public final class Terrain {
    public static final int MAX_RADIUS = 12;
    private static final int MAX_DROP = 6;
    private static final int MAX_STEP = 3;
    // The player auto-steps up to 0.6 blocks; anything taller has to be jumped or blocks the way.
    private static final double STEP_HEIGHT = 0.6;

    private Terrain() {}

    private record Column(char code, Integer rel, String block) {}

    public static JsonObject scan(int radius) {
        Minecraft mc = Minecraft.getInstance();
        LocalPlayer p = mc.player;
        Level level = mc.level;
        if (p == null || level == null) throw new BridgeException(409, "not in a world");
        int r = Mth.clamp(radius, 1, MAX_RADIUS);
        int px = Mth.floor(p.getX()), pz = Mth.floor(p.getZ());
        int y0 = Mth.floor(p.getY() + 1e-3);

        JsonArray rows = new JsonArray();
        for (int dz = -r; dz <= r; dz++) {
            StringBuilder row = new StringBuilder();
            for (int dx = -r; dx <= r; dx++) {
                row.append(dx == 0 && dz == 0 ? '@' : column(level, px + dx, y0, pz + dz).code);
            }
            rows.add(row.toString());
        }

        JsonArray ahead = new JsonArray();
        double yawRad = Math.toRadians(p.getYRot());
        double fx = -Math.sin(yawRad), fz = Math.cos(yawRad);
        long last = Long.MIN_VALUE;
        for (int d = 1; d <= r; d++) {
            int x = Mth.floor(p.getX() + fx * d), z = Mth.floor(p.getZ() + fz * d);
            long key = BlockPos.asLong(x, 0, z);
            if (key == last || (x == px && z == pz)) continue;
            last = key;
            Column c = column(level, x, y0, z);
            JsonObject o = new JsonObject();
            o.addProperty("x", x);
            o.addProperty("z", z);
            o.addProperty("code", String.valueOf(c.code));
            o.addProperty("rel", c.rel);
            o.addProperty("block", c.block);
            ahead.add(o);
        }

        JsonObject out = new JsonObject();
        JsonObject origin = new JsonObject();
        origin.addProperty("x", px);
        origin.addProperty("y", y0);
        origin.addProperty("z", pz);
        out.add("origin", origin);
        out.addProperty("radius", r);
        out.addProperty("layout", "row 0 is north (-z), first column is west (-x); '@' is the player at origin");
        out.add("legend", legend());
        out.add("rows", rows);
        out.addProperty("facing", Direction.fromYRot(p.getYRot()).getName());
        out.add("ahead", ahead);
        return out;
    }

    private static Column column(Level level, int x, int y0, int z) {
        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
        if (!blocking(level, pos.set(x, y0, z)) && !blocking(level, pos.set(x, y0 + 1, z))) {
            boolean water = false;
            for (int y = y0; y >= y0 - MAX_DROP; y--) {
                pos.set(x, y, z);
                FluidState fluid = level.getFluidState(pos);
                if (fluid.is(FluidTags.LAVA)) return new Column('L', null, "minecraft:lava");
                water |= fluid.is(FluidTags.WATER);
                BlockState st = level.getBlockState(pos);
                if (st.getCollisionShape(level, pos).isEmpty()) continue;
                int feet = blocking(level, pos) ? y + 1 : y;
                int rel = feet - y0;
                if (water) return new Column('~', rel, "minecraft:water");
                char code = rel == 0 ? '.' : rel == -1 ? '-' : rel >= -3 ? 'v' : '!';
                return new Column(code, rel, id(st));
            }
            return new Column(water ? '~' : '!', null, water ? "minecraft:water" : null);
        }
        for (int k = 1; k <= MAX_STEP; k++) {
            if (blocking(level, pos.set(x, y0 + k - 1, z))
                    && !blocking(level, pos.set(x, y0 + k, z))
                    && !blocking(level, pos.set(x, y0 + k + 1, z))) {
                pos.set(x, y0 + k - 1, z);
                if (tallerThanBlock(level, pos)) break; // fences and walls can't be jumped
                if (level.getFluidState(pos.set(x, y0 + k, z)).is(FluidTags.WATER)) return new Column('~', k, "minecraft:water");
                return new Column(k == 1 ? '+' : '^', k, id(level.getBlockState(pos.set(x, y0 + k - 1, z))));
            }
        }
        BlockPos wall = blocking(level, pos.set(x, y0, z)) ? pos.immutable() : new BlockPos(x, y0 + 1, z);
        return new Column('^', null, id(level.getBlockState(wall)));
    }

    static boolean blocking(Level level, BlockPos pos) {
        VoxelShape s = level.getBlockState(pos).getCollisionShape(level, pos);
        return !s.isEmpty() && s.max(Direction.Axis.Y) > STEP_HEIGHT;
    }

    static boolean tallerThanBlock(Level level, BlockPos pos) {
        VoxelShape s = level.getBlockState(pos).getCollisionShape(level, pos);
        return !s.isEmpty() && s.max(Direction.Axis.Y) > 1.0;
    }

    private static String id(BlockState st) {
        return BuiltInRegistries.BLOCK.getKey(st.getBlock()).toString();
    }

    private static JsonObject legend() {
        JsonObject o = new JsonObject();
        o.addProperty(".", "same level");
        o.addProperty("+", "1 up (jump)");
        o.addProperty("^", "2+ up or a wall (blocked)");
        o.addProperty("-", "1 down");
        o.addProperty("v", "2-3 down (safe drop)");
        o.addProperty("!", "4+ down or no floor (fall damage)");
        o.addProperty("~", "water");
        o.addProperty("L", "lava");
        return o;
    }
}
