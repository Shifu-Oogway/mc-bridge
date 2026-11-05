package dev.mcbridge;

/** An error with an HTTP status, reported to the caller as-is. */
final class BridgeException extends RuntimeException {
    final int status;

    BridgeException(int status, String message) {
        super(message);
        this.status = status;
    }
}
