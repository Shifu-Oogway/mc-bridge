package dev.mcbridge.mixin;

import dev.mcbridge.Actions;
import net.minecraft.client.Minecraft;
import net.minecraft.client.MouseHandler;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

@Mixin(Minecraft.class)
abstract class MinecraftMixin {
    // Vanilla only keeps mining while the mouse is captured, which it never is when the window is unfocused.
    @Redirect(method = "handleKeybinds",
            at = @At(value = "INVOKE", target = "Lnet/minecraft/client/MouseHandler;isMouseGrabbed()Z"))
    private boolean mcbridge$grabbedOrBridgeAttacking(MouseHandler mouse) {
        return mouse.isMouseGrabbed() || Actions.holdingAttack();
    }
}
