import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
// import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
// --- STREAMABLE HTTP transport ---
// Uncomment to switch (also comment out the StdioClientTransport import above).
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ProgressCallback } from '@modelcontextprotocol/sdk/shared/protocol.js';
import {
  CallToolResultSchema,
  CreateMessageRequestSchema,
  ListRootsRequestSchema,
  LoggingMessageNotificationSchema,
  type ClientCapabilities,
  type Tool,
  type Prompt,
  type PromptMessage,
  type CallToolResult,
  type CreateMessageRequest,
  type CreateMessageResult,
  type LoggingMessageNotification,
  type Root,
} from '@modelcontextprotocol/sdk/types.js';

export type SamplingHandler = (
  request: CreateMessageRequest,
) => Promise<CreateMessageResult>;

export type LoggingHandler = (notification: LoggingMessageNotification) => void;

// Converts path strings to Root objects. Equivalent to `_create_roots` in
// `mcp_client.py`.
function createRoots(rootPaths: string[]): Root[] {
  return rootPaths.map((rootPath) => {
    const resolved = path.resolve(rootPath);
    return {
      uri: pathToFileURL(resolved).href,
      name: path.basename(resolved) || 'Root',
    };
  });
}

// The MCP client. This is the TypeScript equivalent of `mcp_client.py`.
export class MCPClient {
  private command: string;
  private args: string[];
  private env?: Record<string, string>;
  private samplingHandler?: SamplingHandler;
  private loggingHandler?: LoggingHandler;
  private roots: Root[];
  private session: Client | null = null;
  // --- STDIO transport (default) ---
  // private transport: StdioClientTransport | null = null;
  // --- STREAMABLE HTTP transport ---
  // Comment out the line above and uncomment the line below to switch.
  private transport: StreamableHTTPClientTransport | null = null;

  constructor(
    command: string,
    args: string[],
    env?: Record<string, string>,
    samplingHandler?: SamplingHandler,
    loggingHandler?: LoggingHandler,
    roots?: string[],
  ) {
    this.command = command;
    this.args = args;
    this.env = env;
    this.samplingHandler = samplingHandler;
    this.loggingHandler = loggingHandler;
    this.roots = roots ? createRoots(roots) : [];
  }

  async connect(): Promise<void> {
    // --- STDIO transport (default) ---
    // this.transport = new StdioClientTransport({
    //   command: this.command,
    //   args: this.args,
    //   env: this.env,
    // });

    // --- STREAMABLE HTTP transport ---
    // Comment out the block above and uncomment the line below to switch.
    // Requires the server to be running with the streamable HTTP block
    // (see mcpServer.ts) and reachable at this URL.
    this.transport = new StreamableHTTPClientTransport(
      new URL('http://127.0.0.1:3000/mcp'),
    );

    const capabilities: ClientCapabilities = {};
    if (this.samplingHandler) capabilities.sampling = {};
    if (this.roots.length > 0) capabilities.roots = {};

    this.session = new Client(
      { name: 'mcp-chat-ts', version: '1.0.0' },
      Object.keys(capabilities).length > 0 ? { capabilities } : undefined,
    );

    if (this.samplingHandler) {
      this.session.setRequestHandler(
        CreateMessageRequestSchema,
        this.samplingHandler,
      );
    }

    if (this.loggingHandler) {
      this.session.setNotificationHandler(
        LoggingMessageNotificationSchema,
        (notification) => {
          this.loggingHandler?.(notification);
        },
      );
    }

    if (this.roots.length > 0) {
      const roots = this.roots;
      this.session.setRequestHandler(ListRootsRequestSchema, async () => ({
        roots,
      }));
    }

    await this.session.connect(this.transport);
  }

  getSession(): Client {
    if (this.session === null) {
      throw new Error('Client session not initialized. Call connect() first.');
    }
    return this.session;
  }

  async listTools(): Promise<Tool[]> {
    const result = await this.getSession().listTools();
    return result.tools;
  }

  async callTool(
    toolName: string,
    toolInput: Record<string, unknown>,
    onProgress?: ProgressCallback,
  ): Promise<CallToolResult | null> {
    const result = await this.getSession().callTool(
      { name: toolName, arguments: toolInput },
      CallToolResultSchema,
      onProgress ? { onprogress: onProgress } : undefined,
    );
    return result as CallToolResult;
  }

  async listPrompts(): Promise<Prompt[]> {
    const result = await this.getSession().listPrompts();
    return result.prompts;
  }

  async getPrompt(
    promptName: string,
    args: Record<string, string>,
  ): Promise<PromptMessage[]> {
    const result = await this.getSession().getPrompt({
      name: promptName,
      arguments: args,
    });
    return result.messages;
  }

  async readResource(uri: string): Promise<unknown> {
    const result = await this.getSession().readResource({ uri });
    const resource = result.contents[0];

    if (resource && 'text' in resource) {
      if (resource.mimeType === 'application/json') {
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
  const serverPath = fileURLToPath(new URL('./mcpServer.ts', import.meta.url));
  const client = new MCPClient(process.execPath, [
    '--import',
    'tsx',
    serverPath,
  ]);

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
