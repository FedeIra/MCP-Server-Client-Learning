import type {
  Message,
  Tool as AnthropicTool,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import type { TextContent } from "@modelcontextprotocol/sdk/types.js";
import { MCPClient } from "../mcpClient.js";

// Discovers and executes tools across MCP clients. Equivalent to `core/tools.py`.
export class ToolManager {
  // Gets all tools from the provided clients.
  static async getAllTools(
    clients: Record<string, MCPClient>
  ): Promise<AnthropicTool[]> {
    const tools: AnthropicTool[] = [];
    for (const client of Object.values(clients)) {
      const toolModels = await client.listTools();
      for (const t of toolModels) {
        tools.push({
          name: t.name,
          description: t.description ?? "",
          input_schema: t.inputSchema as AnthropicTool["input_schema"],
        });
      }
    }
    return tools;
  }

  // Finds the first client that has the specified tool.
  private static async findClientWithTool(
    clients: MCPClient[],
    toolName: string
  ): Promise<MCPClient | null> {
    for (const client of clients) {
      const tools = await client.listTools();
      const tool = tools.find((t) => t.name === toolName);
      if (tool) {
        return client;
      }
    }
    return null;
  }

  private static buildToolResultPart(
    toolUseId: string,
    text: string,
    status: "success" | "error"
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseId,
      type: "tool_result",
      content: text,
      is_error: status === "error",
    };
  }

  // Executes a list of tool requests against the provided clients.
  static async executeToolRequests(
    clients: Record<string, MCPClient>,
    message: Message
  ): Promise<ToolResultBlockParam[]> {
    const toolRequests = message.content.filter(
      (block): block is ToolUseBlock => block.type === "tool_use"
    );

    const toolResultBlocks: ToolResultBlockParam[] = [];
    for (const toolRequest of toolRequests) {
      const toolUseId = toolRequest.id;
      const toolName = toolRequest.name;
      const toolInput = (toolRequest.input ?? {}) as Record<string, unknown>;

      const client = await this.findClientWithTool(
        Object.values(clients),
        toolName
      );

      if (!client) {
        toolResultBlocks.push(
          this.buildToolResultPart(toolUseId, "Could not find that tool", "error")
        );
        continue;
      }

      try {
        const toolOutput = await client.callTool(toolName, toolInput);
        const items = toolOutput ? toolOutput.content : [];
        const contentList = items
          .filter((item) => item.type === "text")
          .map((item) => (item as TextContent).text);
        const contentJson = JSON.stringify(contentList);
        toolResultBlocks.push(
          this.buildToolResultPart(
            toolUseId,
            contentJson,
            toolOutput && toolOutput.isError ? "error" : "success"
          )
        );
      } catch (error) {
        const errorMessage = `Error executing tool '${toolName}': ${error}`;
        console.error(errorMessage);
        toolResultBlocks.push(
          this.buildToolResultPart(
            toolUseId,
            JSON.stringify({ error: errorMessage }),
            "error"
          )
        );
      }
    }

    return toolResultBlocks;
  }
}
