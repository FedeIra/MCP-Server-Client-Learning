import process from "node:process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CallToolResultSchema,
  type Tool,
  type Prompt,
  type PromptMessage,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

// The MCP client. This is the TypeScript equivalent of `mcp_client.py`.
export class MCPClient {
  private command: string;
  private args: string[];
  private env?: Record<string, string>;
  private session: Client | null = null;
  private transport: StdioClientTransport | null = null;

  constructor(command: string, args: string[], env?: Record<string, string>) {
    this.command = command;
    this.args = args;
    this.env = env;
  }

  async connect(): Promise<void> {
    this.transport = new StdioClientTransport({
      command: this.command,
      args: this.args,
      env: this.env,
    });
    this.session = new Client({ name: "mcp-chat-ts", version: "1.0.0" });
    await this.session.connect(this.transport);
  }

  getSession(): Client {
    if (this.session === null) {
      throw new Error(
        "Client session not initialized. Call connect() first."
      );
    }
    return this.session;
  }

  async listTools(): Promise<Tool[]> {
    const result = await this.getSession().listTools();
    return result.tools;
  }

  async callTool(
    toolName: string,
    toolInput: Record<string, unknown>
  ): Promise<CallToolResult | null> {
    const result = await this.getSession().callTool(
      { name: toolName, arguments: toolInput },
      CallToolResultSchema
    );
    return result as CallToolResult;
  }

  async listPrompts(): Promise<Prompt[]> {
    // TODO: Return a list of prompts defined by the MCP server
    return [];
  }

  async getPrompt(
    promptName: string,
    args: Record<string, string>
  ): Promise<PromptMessage[]> {
    // TODO: Get a particular prompt defined by the MCP server
    return [];
  }

  async readResource(uri: string): Promise<any> {
    const result = await this.getSession().readResource({ uri });
    const resource = result.contents[0];

    if (resource && "text" in resource) {
      if (resource.mimeType === "application/json") {
        return JSON.parse(resource.text);
      }
      return resource.text;
    }

    return null;
  }

  async cleanup(): Promise<void> {
    await this.session?.close();
    this.session = null;
    this.transport = null;
  }
}

// For testing
async function main() {
  // Spawns mcpServer.ts through the same Node binary using the tsx loader
  // (equivalent to Python's `command="uv", args=["run", "mcp_server.py"]`).
  const serverPath = fileURLToPath(new URL("./mcpServer.ts", import.meta.url));
  const client = new MCPClient(process.execPath, ["--import", "tsx", serverPath]);

  await client.connect();
  try {
    const result = await client.listTools();
    console.log(result);
  } finally {
    await client.cleanup();
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
