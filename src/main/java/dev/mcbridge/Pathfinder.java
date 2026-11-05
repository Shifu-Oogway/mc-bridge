package dev.mcbridge;

import it.unimi.dsi.fastutil.longs.Long2DoubleOpenHashMap;
import it.unimi.dsi.fastutil.longs.Long2LongOpenHashMap;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import net.minecraft.core.BlockPos;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.PriorityQueue;
import java.util.Set;

/**
 * A* over standable feet positions, using the same movement rules as {@link Terrain}: walk level, step up one
 * block with a jump, drop at most {@link #MAX_DROP}, swim through water, never enter lava or hazards.
 */
final class Pathfinder {
    static final int MAX_NODES = 40_000;
    private static final int MAX_DROP = 3;
    private static final double DIAGONAL = Math.sqrt(2);
    private static final Set<Block> HAZARDS = Set.of(
            net.minecraft.world.level.block.Blocks.FIRE, net.minecraft.world.level.block.Blocks.SOUL_FIRE,
            net.minecraft.world.level.block.Blocks.CACTUS, net.minecraft.world.level.block.Blocks.MAGMA_BLOCK,
            net.minecraft.world.level.block.Blocks.CAMPFIRE, net.minecraft.world.level.block.Blocks.SOUL_CAMPFIRE,
            net.minecraft.world.level.block.Blocks.SWEET_BERRY_BUSH, net.minecraft.world.level.block.Blocks.POWDER_SNOW,
            net.minecraft.world.level.block.Blocks.COBWEB, net.minecraft.world.level.block.Blocks.WITHER_ROSE);

    record Result(List<BlockPos> path, boolean reached, int expanded) {}

    private record Node(long pos, double f) {}

    private final Level level;
    private final BlockPos.MutableBlockPos tmp = new BlockPos.MutableBlockPos();

    private Pathfinder(Level level) {
        this.level = level;
    }

    /** Goal test: within {@code tolerance} blocks horizontally and, if {@code goalY} is set, within one block vertically. */
    static Result find(Level level, BlockPos start, int gx, Integer goalY, int gz, double tolerance) {
        return new Pathfinder(level).search(start, gx, goalY, gz, tolerance);
    }

    /**
     * Where the player stands, as a feet position: the cell under their centre, or when that is over air (hanging
     * over an edge while sneaking), the cell under whichever corner of their body still rests on ground.
     */
    static BlockPos standingAt(Level level, double x, double y, double z) {
        BlockPos centre = groundBelow(level, BlockPos.containing(x, y + 0.01, z));
        int feetY = (int) Math.floor(y + 0.4);
        if (centre != null && centre.getY() == feetY) return centre;
        double r = 0.301; // the player's 0.3 half-width; an edge resting exactly on a block boundary still stands on it
        for (double[] c : new double[][]{{r, r}, {-r, r}, {r, -r}, {-r, -r}, {r, 0}, {-r, 0}, {0, r}, {0, -r}}) {
            BlockPos corner = groundBelow(level, BlockPos.containing(x + c[0], y + 0.01, z + c[1]));
            if (corner != null && corner.getY() == feetY) return corner;
        }
        return centre;
    }

    /** The standable feet position at or just below {@code feet}, or null if the player is not over solid ground. */
    static BlockPos groundBelow(Level level, BlockPos feet) {
        Pathfinder pf = new Pathfinder(level);
        // Standing on top of a tall partial block (dripstone, chest, path) puts our feet inside its cell.
        if (Terrain.blocking(level, feet) && pf.standable(feet.getX(), feet.getY() + 1, feet.getZ())) return feet.above();
        for (int d = 0; d <= 4; d++) {
            if (pf.standable(feet.getX(), feet.getY() - d, feet.getZ())) return feet.below(d);
        }
        return null;
    }

    /** The standable feet height in column (x, z) closest to {@code nearY}, searching up to {@code range} up and down. */
    static Integer nearestStandableY(Level level, int x, int z, int nearY, int range) {
        Pathfinder pf = new Pathfinder(level);
        for (int d = 0; d <= range; d++) {
            if (pf.standable(x, nearY + d, z)) return nearY + d;
            if (d > 0 && pf.standable(x, nearY - d, z)) return nearY - d;
        }
        return null;
    }

    /** True if a step off the feet position (x, y, z) in any direction would fall further than a safe drop. */
    static boolean nearUnsafeDrop(Level level, BlockPos feet) {
        Pathfinder pf = new Pathfinder(level);
        for (int dx = -1; dx <= 1; dx++) {
            for (int dz = -1; dz <= 1; dz++) {
                if (dx == 0 && dz == 0) continue;
                int x = feet.getX() + dx, z = feet.getZ() + dz, y = feet.getY();
                if (!pf.open(x, y, z)) continue;
                boolean safe = false;
                for (int d = 0; d <= MAX_DROP && !safe; d++) {
                    if (d > 0 && pf.blocking(x, y - d, z)) break;
                    safe = pf.standable(x, y - d, z) || pf.water(x, y - d, z);
                }
                if (!safe) return true;
            }
        }
        return false;
    }

    private Result search(BlockPos start, int gx, Integer goalY, int gz, double tolerance) {
        PriorityQueue<Node> open = new PriorityQueue<>((a, b) -> Double.compare(a.f, b.f));
        Long2DoubleOpenHashMap g = new Long2DoubleOpenHashMap();
        g.defaultReturnValue(Double.MAX_VALUE);
        Long2LongOpenHashMap parent = new Long2LongOpenHashMap();
        LongOpenHashSet closed = new LongOpenHashSet();
        long s = start.asLong();
        g.put(s, 0);
        open.add(new Node(s, h(start, gx, goalY, gz)));
        long best = s;
        double bestH = h(start, gx, goalY, gz);
        int expanded = 0;
        List<long[]> next = new ArrayList<>();

        while (!open.isEmpty() && expanded < MAX_NODES) {
            long cur = open.poll().pos;
            if (!closed.add(cur)) continue;
            expanded++;
            int x = BlockPos.getX(cur), y = BlockPos.getY(cur), z = BlockPos.getZ(cur);
            if (Math.hypot(x - gx, z - gz) <= tolerance && (goalY == null || Math.abs(y - goalY) <= 1)) {
                return new Result(trace(parent, s, cur), true, expanded);
            }
            double hc = h(BlockPos.of(cur), gx, goalY, gz);
            if (hc < bestH) { bestH = hc; best = cur; }

            next.clear();
            neighbours(x, y, z, next);
            for (long[] n : next) {
                if (closed.contains(n[0])) continue;
                double cost = g.get(cur) + n[1] / 1000.0;
                if (cost >= g.get(n[0])) continue;
                g.put(n[0], cost);
                parent.put(n[0], cur);
                open.add(new Node(n[0], cost + h(BlockPos.of(n[0]), gx, goalY, gz)));
            }
        }
        return new Result(trace(parent, s, best), false, expanded);
    }

    private static double h(BlockPos p, int gx, Integer goalY, int gz) {
        double horiz = Math.hypot(p.getX() - gx, p.getZ() - gz);
        return goalY == null ? horiz : horiz + Math.abs(p.getY() - goalY) * 0.5;
    }

    private static List<BlockPos> trace(Long2LongOpenHashMap parent, long start, long end) {
        List<BlockPos> path = new ArrayList<>();
        for (long c = end; c != start; c = parent.get(c)) path.add(BlockPos.of(c));
        Collections.reverse(path);
        return path;
    }

    /** Adds {packedPos, cost*1000} for each move out of the feet position (x, y, z). */
    private void neighbours(int x, int y, int z, List<long[]> out) {
        for (int dx = -1; dx <= 1; dx++) {
            for (int dz = -1; dz <= 1; dz++) {
                if (dx == 0 && dz == 0) continue;
                boolean diagonal = dx != 0 && dz != 0;
                int nx = x + dx, nz = z + dz;
                if (!level.hasChunkAt(tmp.set(nx, y, nz))) continue;
                // Diagonals must not cut a corner: both orthogonal neighbours need to be open at body height.
                if (diagonal && !(open(x + dx, y, z) && open(x, y, z + dz))) continue;
                double base = diagonal ? DIAGONAL : 1.0;

                if (open(nx, y, nz)) {
                    for (int d = 0; d <= MAX_DROP; d++) {
                        int ny = y - d;
                        if (d > 0 && blocking(nx, ny, nz)) break;
                        if (lava(nx, ny, nz) || lava(nx, ny + 1, nz)) break;
                        boolean water = water(nx, ny, nz);
                        if (standable(nx, ny, nz) || water) {
                            if (hazard(nx, ny, nz)) break;
                            double cost = base + d * 0.5 + (water ? 2.0 : 0.0);
                            out.add(new long[]{BlockPos.asLong(nx, ny, nz), Math.round(cost * 1000)});
                            break;
                        }
                    }
                } else if (!diagonal
                        && blocking(nx, y, nz) && !tall(nx, y, nz)
                        && !blocking(nx, y + 1, nz) && !blocking(nx, y + 2, nz)
                        && !blocking(x, y + 2, z) // headroom to jump from here
                        && !hazard(nx, y + 1, nz) && !lava(nx, y + 1, nz) && !lava(nx, y + 2, nz)) {
                    out.add(new long[]{BlockPos.asLong(nx, y + 1, nz), Math.round((base + 1.0) * 1000)});
                }
            }
        }
    }

    private boolean standable(int x, int y, int z) {
        if (!open(x, y, z)) return false;
        boolean partialFloor = !level.getBlockState(tmp.set(x, y, z)).getCollisionShape(level, tmp).isEmpty();
        return partialFloor || !level.getBlockState(tmp.set(x, y - 1, z)).getCollisionShape(level, tmp).isEmpty();
    }

    private boolean open(int x, int y, int z) {
        return !blocking(x, y, z) && !blocking(x, y + 1, z);
    }

    private boolean blocking(int x, int y, int z) {
        return Terrain.blocking(level, tmp.set(x, y, z));
    }

    private boolean tall(int x, int y, int z) {
        return Terrain.tallerThanBlock(level, tmp.set(x, y, z));
    }

    private boolean water(int x, int y, int z) {
        return level.getFluidState(tmp.set(x, y, z)).is(FluidTags.WATER);
    }

    private boolean lava(int x, int y, int z) {
        return level.getFluidState(tmp.set(x, y, z)).is(FluidTags.LAVA);
    }

    private boolean hazard(int x, int y, int z) {
        for (int dy = -1; dy <= 1; dy++) {
            BlockState st = level.getBlockState(tmp.set(x, y + dy, z));
            if (HAZARDS.contains(st.getBlock())) return true;
        }
        return false;
    }
}
