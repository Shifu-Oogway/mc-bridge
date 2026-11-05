package dev.mcbridge;

import com.mojang.logging.LogUtils;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.common.NeoForge;
import org.slf4j.Logger;

@Mod(value = McBridge.MOD_ID, dist = Dist.CLIENT)
public class McBridge {
    public static final String MOD_ID = "mcbridge";
    public static final Logger LOGGER = LogUtils.getLogger();

    public McBridge() {
        LOGGER.info("[mcbridge] loaded (protocol {}; localhost only)", BridgeServer.PROTOCOL);
        NeoForge.EVENT_BUS.register(Actions.class);
        try {
            new BridgeServer().start();
        } catch (Exception e) {
            LOGGER.error("[mcbridge] failed to start server", e);
        }
    }
}
