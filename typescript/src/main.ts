import "dotenv/config";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { MCPClient } from "./mcpClient.js";
import { Claude } from "./core/claude.js";
import { CliChat } from "./core/cliChat.js";
import { CliApp } from "./core/cli.js";

// Anthropic config
const claudeModel = process.env.CLAUDE_MODEL ?? "";
const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? "";

if (!claudeModel) {
  throw new Error("Error: CLAUDE_MODEL cannot be empty. Update .env");
}
if (!anthropicApiKey) {
  throw new Error("Error: ANTHROPIC_API_KEY cannot be empty. Update .env");
}

// Runs a `.ts` server script through the same Node binary using the tsx loader.
// This avoids any PATH / .cmd resolution issues on Windows.
function tsxCommand(scriptPath: string): { command: string; args: string[] } {
  return { command: process.execPath, args: ["--import", "tsx", scriptPath] };
}

async function main() {
  const claudeService = new Claude(claudeModel);

  const serverScripts = process.argv.slice(2);
  const clients: Record<string, MCPClient> = {};

  // This project's own document server (mcpServer.ts).
  const docServerPath = fileURLToPath(new URL("./mcpServer.ts", import.meta.url));
  const docCmd = tsxCommand(docServerPath);
  const docClient = new MCPClient(docCmd.command, docCmd.args);
  await docClient.connect();
  clients["doc_client"] = docClient;

  // Any extra server scripts passed as CLI arguments.
  for (let i = 0; i < serverScripts.length; i++) {
    const serverScript = serverScripts[i];
    const clientId = `client_${i}_${serverScript}`;
    const cmd = tsxCommand(serverScript);
    const client = new MCPClient(cmd.command, cmd.args);
    await client.connect();
    clients[clientId] = client;
  }

  const chat = new CliChat(docClient, clients, claudeService);
  const cli = new CliApp(chat);

  await cli.initialize();
  try {
    await cli.run();
  } finally {
    for (const client of Object.values(clients)) {
      await client.cleanup();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
