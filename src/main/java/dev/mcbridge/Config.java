package dev.mcbridge;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.neoforged.fml.loading.FMLPaths;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** mcbridge/config.json in the game directory. Re-read on every request so it can be toggled without a restart. */
final class Config {
    private Config() {}

    static Path file() {
        return FMLPaths.GAMEDIR.get().resolve("mcbridge").resolve("config.json");
    }

    static void writeDefaultIfMissing() throws IOException {
        Path f = file();
        if (Files.exists(f)) return;
        Files.createDirectories(f.getParent());
        Files.writeString(f, "{\n  \"actionsEnabled\": false,\n  \"allowCommands\": false\n}\n");
    }

    static boolean actionsEnabled() {
        return flag("actionsEnabled");
    }

    /** Slash commands can do far more than a player's hands can, so they need their own opt-in. */
    static boolean commandsAllowed() {
        return actionsEnabled() && flag("allowCommands");
    }

    private static boolean flag(String name) {
        try {
            JsonObject o = JsonParser.parseString(Files.readString(file())).getAsJsonObject();
            return o.has(name) && o.get(name).getAsBoolean();
        } catch (Exception e) {
            return false;
        }
    }
}
