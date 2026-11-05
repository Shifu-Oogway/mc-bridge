package dev.mcbridge.mixin;

import dev.mcbridge.Actions;
import net.minecraft.client.Minecraft;
import net.minecraft.client.MouseHandler;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MouseHandler.class)
abstract class MouseHandlerMixin {
    @Shadow @Final private Minecraft minecraft;
    @Shadow private double accumulatedDX;
    @Shadow private double accumulatedDY;

    @Shadow public abstract boolean isMouseGrabbed();

    // Real mouse motion, read before vanilla turns it into a player turn. Watching the player's rotation instead
    // misreads camera mods (e.g. Shoulder Surfing's decoupled camera) that rotate the player on their own.
    @Inject(method = "handleAccumulatedMovement", at = @At("HEAD"))
    private void mcbridge$detectHumanTurn(CallbackInfo ci) {
        if ((accumulatedDX != 0.0 || accumulatedDY != 0.0) && isMouseGrabbed() && minecraft.isWindowActive()) {
            Actions.onHumanMouseMove();
        }
    }
}
