import type { Progress } from "@modelcontextprotocol/sdk/types.js";
import type { LoggingMessageNotification } from "@modelcontextprotocol/sdk/types.js";

// Prints log messages sent by the server via `ctx.info` / `mcp.server.sendLoggingMessage`.
// Equivalent to `logging_callback` in `core/observability.py`.
export function loggingHandler(
  notification: LoggingMessageNotification
): void {
  console.log(`[server log] ${notification.params.data}`);
}

// Prints progress notifications sent by the server via `ctx.reportProgress`.
// Equivalent to `progress_callback` in `core/observability.py`.
export function progressCallback({ progress, total, message }: Progress): void {
  const label =
    total !== undefined
      ? `${progress}/${total} (${((progress / total) * 100).toFixed(1)}%)`
      : `${progress}`;

  console.log(`[progress] ${message ? `${message} - ` : ""}${label}`);
}
