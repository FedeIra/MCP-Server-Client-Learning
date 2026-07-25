import fs from "node:fs";
import { MCPClient, type SamplingHandler, type LoggingHandler } from "./mcpClient.js";

// Shape of server_config.json. Equivalent to the "mcpServers" object read in
// the Python Lesson 6 project (L6/mcp_project/server_config.json). Each key
// is an arbitrary server name; command/args/env are what MCPClient already
// takes as constructor params today, just moved into JSON instead of code.
interface ServerConfigEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface ServerConfigFile {
  mcpServers: Record<string, ServerConfigEntry>;
}

// Reads server_config.json and connects to every server it lists, producing
// the same `Record<string, MCPClient>` shape that main.ts already builds by
// hand for `docClient` + `serverScripts`. Drop-in replacement/complement for
// that manual wiring.
export async function loadClientsFromConfig(
  configPath: string,
  samplingHandler?: SamplingHandler,
  loggingHandler?: LoggingHandler,
  roots?: string[],
): Promise<Record<string, MCPClient>> {
  const raw = fs.readFileSync(configPath, "utf-8");
  const config: ServerConfigFile = JSON.parse(raw);

  const clients: Record<string, MCPClient> = {};

  // Promise.all, not a for-loop with await inside: each server is an
  // independent child process talking over its own stdio pipe, so server B
  // doesn't need to wait for server A to finish connecting first. This is
  // the "connect asynchronously" question from Lesson 6 — in Node it's just
  // "don't await one at a time, fan out with Promise.all".
  await Promise.all(
    Object.entries(config.mcpServers).map(async ([serverName, entry]) => {
      const client = new MCPClient(
        entry.command,
        entry.args,
        entry.env,
        samplingHandler,
        loggingHandler,
        roots,
      );
      await client.connect();
      clients[serverName] = client;
    }),
  );

  return clients;
}
