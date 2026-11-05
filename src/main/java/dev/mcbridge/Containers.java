package dev.mcbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.StackedContents;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ClickType;
import net.minecraft.world.inventory.CraftingContainer;
import net.minecraft.world.inventory.CraftingMenu;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.inventory.RecipeBookMenu;
import net.minecraft.world.inventory.ResultSlot;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.crafting.CraftingRecipe;
import net.minecraft.world.item.crafting.Ingredient;
import net.minecraft.world.item.crafting.RecipeHolder;
import net.minecraft.world.item.crafting.RecipeType;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.CompletableFuture;

/** Container screens: snapshot, open/close, slot clicks and recipe-book crafting. Client thread only. */
public final class Containers {
    public static final int OUTSIDE = AbstractContainerMenu.SLOT_CLICKED_OUTSIDE;
    // Long enough for the server to confirm a click, even in singleplayer where it runs on its own thread.
    private static final int SETTLE_TICKS = 2;
    private static final int MAX_CRAFT_TIMES = 64;

    private Containers() {}

    /** The open container screen, or null when none is open. */
    static JsonElement snapshot(Minecraft mc) {
        if (!(mc.screen instanceof AbstractContainerScreen<?> screen) || mc.player == null) return null;
        AbstractContainerMenu menu = screen.getMenu();
        JsonObject o = new JsonObject();
        o.addProperty("screen", screen.getClass().getSimpleName());
        o.addProperty("title", screen.getTitle().getString());
        o.addProperty("menu", menuName(menu));
        o.addProperty("containerId", menu.containerId);
        o.add("carried", Actions.item(menu.getCarried()));

        JsonArray sections = new JsonArray();
        JsonArray slots = new JsonArray();
        String current = null;
        JsonObject section = null;
        for (int i = 0; i < menu.slots.size(); i++) {
            Slot s = menu.slots.get(i);
            String name = sectionOf(menu, s, i);
            if (!name.equals(current)) {
                section = new JsonObject();
                section.addProperty("name", name);
                section.addProperty("from", i);
                sections.add(section);
                current = name;
            }
            section.addProperty("to", i);
            ItemStack st = s.getItem();
            if (st.isEmpty()) continue;
            JsonObject so = new JsonObject();
            so.addProperty("slot", i);
            so.addProperty("section", name);
            so.addProperty("id", BuiltInRegistries.ITEM.getKey(st.getItem()).toString());
            so.addProperty("count", st.getCount());
            so.addProperty("name", st.getHoverName().getString());
            slots.add(so);
        }
        o.add("sections", sections);
        o.add("slots", slots);
        o.addProperty("canCraft", craftingMenu(menu) != null);
        return o;
    }

    private static String menuName(AbstractContainerMenu menu) {
        if (menu instanceof InventoryMenu) return "player_inventory"; // has no registered MenuType
        try {
            return BuiltInRegistries.MENU.getKey(menu.getType()).toString();
        } catch (UnsupportedOperationException e) {
            return menu.getClass().getSimpleName();
        }
    }

    private static String sectionOf(AbstractContainerMenu menu, Slot s, int index) {
        if (s instanceof ResultSlot || (menu instanceof RecipeBookMenu<?, ?> rb && rb.getResultSlotIndex() == index)) return "result";
        if (s.container instanceof CraftingContainer) return "crafting_grid";
        if (s.container instanceof Inventory) {
            int c = s.getContainerSlot();
            if (c < 9) return "hotbar";
            if (c < 36) return "inventory";
            if (c < 40) return "armor";
            return "offhand";
        }
        return "container";
    }

    // ---- screen -----------------------------------------------------------------------------------------------

    static CompletableFuture<JsonObject> screen(JsonObject req) {
        Minecraft mc = Minecraft.getInstance();
        LocalPlayer p = Actions.requirePlayer();
        String action = req.has("action") ? req.get("action").getAsString() : "";
        switch (action) {
            case "open_inventory" -> {
                if (mc.screen instanceof InventoryScreen) return CompletableFuture.completedFuture(state(mc)); // already open
                Actions.requireNoScreen(mc);
                KeyMapping.click(mc.options.keyInventory.getKey()); // opened by the game on its next tick
                return Actions.waitFor(() -> mc.screen instanceof InventoryScreen, 10, () -> state(mc));
            }
            case "close" -> {
                if (mc.screen == null) throw new BridgeException(409, "no screen is open");
                if (mc.screen instanceof AbstractContainerScreen<?>) p.closeContainer(); // tells the server too
                else mc.setScreen(null);
                return Actions.afterTicks(1, () -> state(mc));
            }
            default -> throw new BridgeException(400, "action must be \"open_inventory\" or \"close\"");
        }
    }

    private static JsonObject state(Minecraft mc) {
        JsonObject r = new JsonObject();
        r.addProperty("screen", mc.screen == null ? null : mc.screen.getClass().getSimpleName());
        r.add("container", snapshot(mc));
        return r;
    }

    // ---- click ------------------------------------------------------------------------------------------------

    static CompletableFuture<JsonObject> click(JsonObject req) {
        Minecraft mc = Minecraft.getInstance();
        LocalPlayer p = Actions.requirePlayer();
        AbstractContainerMenu menu = requireContainer(mc);
        if (!req.has("slot")) throw new BridgeException(400, "slot is required");
        int slot = req.get("slot").getAsInt();
        if (slot != OUTSIDE && (slot < 0 || slot >= menu.slots.size())) {
            throw new BridgeException(400, "slot must be 0.." + (menu.slots.size() - 1) + ", or " + OUTSIDE + " for outside the window");
        }
        String mode = req.has("mode") ? req.get("mode").getAsString() : "pickup";
        boolean right = req.has("button") && req.get("button").getAsString().equals("right");
        ClickType type;
        int button;
        switch (mode) {
            case "pickup" -> { type = ClickType.PICKUP; button = right ? 1 : 0; }
            case "quick_move" -> { type = ClickType.QUICK_MOVE; button = 0; }
            case "swap" -> {
                type = ClickType.SWAP;
                if (!req.has("hotbar")) throw new BridgeException(400, "swap needs hotbar (0-8, or 40 for the offhand)");
                button = req.get("hotbar").getAsInt();
                if (!(button >= 0 && button <= 8) && button != Inventory.SLOT_OFFHAND) throw new BridgeException(400, "hotbar must be 0-8 or 40");
            }
            case "throw" -> { type = ClickType.THROW; button = right ? 1 : 0; }
            case "pickup_all" -> { type = ClickType.PICKUP_ALL; button = 0; }
            default -> throw new BridgeException(400, "mode must be pickup, quick_move, swap, throw or pickup_all");
        }
        if (slot == OUTSIDE && type != ClickType.PICKUP) throw new BridgeException(400, "only pickup can click outside the window");
        mc.gameMode.handleInventoryMouseClick(menu.containerId, slot, button, type, p);
        return Actions.afterTicks(SETTLE_TICKS, () -> state(mc));
    }

    // ---- craft ------------------------------------------------------------------------------------------------

    static CompletableFuture<JsonObject> craft(JsonObject req) {
        Minecraft mc = Minecraft.getInstance();
        LocalPlayer p = Actions.requirePlayer();
        AbstractContainerMenu menu = requireContainer(mc);
        RecipeBookMenu<?, ?> rb = craftingMenu(menu);
        if (rb == null) throw new BridgeException(409, "the open screen cannot craft; open the inventory (2x2) or a crafting table (3x3)");

        String id = req.has("item") ? req.get("item").getAsString() : "";
        ResourceLocation key = ResourceLocation.tryParse(id.contains(":") ? id : "minecraft:" + id);
        Item item = key == null ? null : BuiltInRegistries.ITEM.getOptional(key).orElse(null);
        if (item == null) throw new BridgeException(400, "unknown item \"" + id + "\"");
        boolean all = req.has("all") && req.get("all").getAsBoolean();
        int times = req.has("times") ? req.get("times").getAsInt() : 1;
        if (times < 1 || times > MAX_CRAFT_TIMES) throw new BridgeException(400, "times must be 1.." + MAX_CRAFT_TIMES);

        List<RecipeHolder<CraftingRecipe>> recipes = new ArrayList<>();
        boolean needsBiggerGrid = false;
        for (RecipeHolder<CraftingRecipe> r : mc.level.getRecipeManager().getAllRecipesFor(RecipeType.CRAFTING)) {
            if (r.value().isSpecial() || !r.value().getResultItem(mc.level.registryAccess()).is(item)) continue;
            if (r.value().canCraftInDimensions(rb.getGridWidth(), rb.getGridHeight())) recipes.add(r);
            else needsBiggerGrid = true;
        }
        if (recipes.isEmpty()) {
            throw new BridgeException(409, needsBiggerGrid
                    ? key + " needs a 3x3 grid; open a crafting table"
                    : "no crafting recipe makes " + key);
        }

        StackedContents have = new StackedContents();
        p.getInventory().fillStackedContents(have);
        rb.fillCraftSlotsStackedContents(have);
        RecipeHolder<CraftingRecipe> chosen = null;
        for (RecipeHolder<CraftingRecipe> r : recipes) {
            if (have.canCraft(r.value(), null)) { chosen = r; break; }
        }
        if (chosen == null) {
            throw new BridgeException(409, "missing ingredients for " + key + "; a recipe needs " + ingredients(recipes.get(0)));
        }

        int before = count(p, item);
        int resultSlot = rb.getResultSlotIndex();
        RecipeHolder<CraftingRecipe> recipe = chosen;
        if (all) mc.gameMode.handlePlaceRecipe(menu.containerId, recipe, true);
        else for (int i = 0; i < times; i++) mc.gameMode.handlePlaceRecipe(menu.containerId, recipe, false);

        // Wait for the server to fill the grid, then shift-click the result to take everything the grid makes.
        return Actions.waitFor(() -> menu.getSlot(resultSlot).getItem().is(item), 20, () -> null)
                .thenCompose(ignored -> {
                    if (!menu.getSlot(resultSlot).getItem().is(item)) {
                        throw new BridgeException(504, "the server did not place the recipe in time");
                    }
                    mc.gameMode.handleInventoryMouseClick(menu.containerId, resultSlot, 0, ClickType.QUICK_MOVE, p);
                    return Actions.afterTicks(SETTLE_TICKS, () -> {
                        JsonObject r = new JsonObject();
                        r.addProperty("recipe", recipe.id().toString());
                        r.addProperty("item", key.toString());
                        r.addProperty("crafted", count(p, item) - before);
                        r.add("container", snapshot(mc));
                        return r;
                    });
                });
    }

    private static RecipeBookMenu<?, ?> craftingMenu(AbstractContainerMenu menu) {
        return (menu instanceof InventoryMenu || menu instanceof CraftingMenu) ? (RecipeBookMenu<?, ?>) menu : null;
    }

    private static String ingredients(RecipeHolder<CraftingRecipe> r) {
        Map<String, Integer> counts = new TreeMap<>();
        for (Ingredient ing : r.value().getIngredients()) {
            ItemStack[] options = ing.getItems();
            if (options.length == 0) continue;
            String name = BuiltInRegistries.ITEM.getKey(options[0].getItem()).toString() + (options.length > 1 ? " (or similar)" : "");
            counts.merge(name, 1, Integer::sum);
        }
        StringBuilder sb = new StringBuilder();
        counts.forEach((k, v) -> sb.append(sb.isEmpty() ? "" : ", ").append(v).append("x ").append(k));
        return sb.toString();
    }

    private static int count(LocalPlayer p, Item item) {
        int n = 0;
        for (int i = 0; i < p.getInventory().getContainerSize(); i++) {
            ItemStack s = p.getInventory().getItem(i);
            if (s.is(item)) n += s.getCount();
        }
        return n;
    }

    private static AbstractContainerMenu requireContainer(Minecraft mc) {
        if (!(mc.screen instanceof AbstractContainerScreen<?> s)) {
            throw new BridgeException(409, "no container screen is open; use mc_screen open_inventory, or right-click a chest/table with mc_interact");
        }
        return s.getMenu();
    }
}
