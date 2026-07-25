import "dotenv/config";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { MCPClient } from "./mcpClient.js";
import { Claude } from "./core/claude.js";
import { makeSamplingHandler } from "./core/sampling.js";
import { loggingHandler } from "./core/observability.js";
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
  const samplingHandler = makeSamplingHandler(claudeService);

  const serverScripts = process.argv.slice(2);
  const clients: Record<string, MCPClient> = {};

  // Directories exposed to the server via roots (for the `list_roots` /
  // `read_dir` tools). Override with a comma-separated MCP_ROOT_DIRS env var;
  // defaults to this project's own directory.
  const rootDirsEnv = process.env.MCP_ROOT_DIRS ?? "";
  const rootPaths = rootDirsEnv
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (rootPaths.length === 0) {
    rootPaths.push(path.dirname(fileURLToPath(import.meta.url)));
  }

  // This project's own document server (mcpServer.ts).
  const docServerPath = fileURLToPath(new URL("./mcpServer.ts", import.meta.url));
  const docCmd = tsxCommand(docServerPath);
  const docClient = new MCPClient(
    docCmd.command,
    docCmd.args,
    undefined,
    samplingHandler,
    loggingHandler,
    rootPaths
  );
  await docClient.connect();
  clients["doc_client"] = docClient;

  // Any extra server scripts passed as CLI arguments.
  for (let i = 0; i < serverScripts.length; i++) {
    const serverScript = serverScripts[i];
    const clientId = `client_${i}_${serverScript}`;
    const cmd = tsxCommand(serverScript);
    const client = new MCPClient(
      cmd.command,
      cmd.args,
      undefined,
      samplingHandler,
      loggingHandler,
      rootPaths
    );
    await client.connect();
    clients[clientId] = client;
  }

  // --- ALTERNATIVE: load servers from server_config.json (Lesson 6 style) ---
  // Instead of passing extra server scripts as CLI args one by one, you can
  // list every server you want (your own, plus reference/official ones like
  // "filesystem" or "fetch") in one JSON file and connect to all of them at
  // once, concurrently. See serverConfig.ts. Uncomment to use instead of (or
  // together with) the CLI-args loop above:
  //
  // import { loadClientsFromConfig } from "./serverConfig.js";
  // const configPath = fileURLToPath(new URL("../server_config.json", import.meta.url));
  // const configClients = await loadClientsFromConfig(configPath, samplingHandler, loggingHandler, rootPaths);
  // Object.assign(clients, configClients);
  //
  // Note: "filesystem" and "fetch" are official reference servers published
  // as npm/PyPI packages. `npx`/`uvx` install and run them on the fly — you
  // don't need to have them installed ahead of time.

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
