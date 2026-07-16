import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";

export type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

// A small helper mirroring FastMCP's `Context` (`ctx.info` / `ctx.report_progress`
// in `mcp_server.py`), for use inside `McpServer.registerTool` callbacks.
export function makeToolContext(mcp: McpServer, extra: ToolExtra) {
  const progressToken = extra._meta?.progressToken;

  return {
    async info(message: string): Promise<void> {
      await mcp.server.sendLoggingMessage({ level: "info", data: message });
    },

    async reportProgress(
      progress: number,
      total?: number,
      message?: string
    ): Promise<void> {
      if (progressToken === undefined) return;

      await extra.sendNotification({
        method: "notifications/progress",
        params: { progressToken, progress, total, message },
      });
    },
  };
}
