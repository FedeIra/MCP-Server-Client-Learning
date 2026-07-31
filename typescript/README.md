# MCP Chat (TypeScript)

TypeScript / Node.js port of the [Python MCP Chat](../python) project. It is a
command-line chat application that connects Claude (via the Anthropic API) to
documents exposed by an MCP server, using the **official MCP TypeScript SDK**
(`@modelcontextprotocol/sdk`) — no higher-level framework.

This is a **1:1 mirror** of the Python version, including the same unfinished
`TODO`s, so you can learn MCP by implementing them in both languages.

## Prerequisites

- Node.js 18+ (developed on Node 22)
- Anthropic API Key

## Setup

### Step 1: Configure environment variables

Create or edit the `.env` file in this folder:

```
CLAUDE_MODEL="claude-sonnet-4-5"
ANTHROPIC_API_KEY=""   # your Anthropic API secret key
```

(`USE_UV` from the Python `.env` is ignored here — it is Python-only.)

### Step 2: Install dependencies

```bash
npm install
```

### Step 3: Run the project

Development (runs the TypeScript directly with `tsx`, no build step):

```bash
npm run dev
```

Or build to JavaScript and run the compiled output:

```bash
npm run build
npm start
```

The client automatically launches the document MCP server (`src/mcpServer.ts`)
as a subprocess over stdio, using the same Node binary with the `tsx` loader —
so it works on Windows without any PATH configuration.

## Usage

- **Chat:** type a message and press Enter.
- **Document retrieval:** `@` + a document id (e.g. `@deposition.md`).
- **Commands:** `/` + a server-defined command (e.g. `/summarize deposition.md`).

> Note: `@` / `/` features only produce results once the corresponding `TODO`s
> in `src/mcpServer.ts` and `src/mcpClient.ts` are implemented (same as Python).
> Plain chat works out of the box.

## Connecting to Claude Desktop (streamable HTTP)

`src/mcpServer.ts` defaults to the **streamable HTTP** transport (see the
toggle comments at the top of the file / in `main()` to switch back to
stdio). This lets you run the server standalone and attach it to Claude
Desktop as an MCP connector, instead of it only being spawned as a subprocess
by this project's own CLI client.

### 1. Run the server locally

From this `typescript/` folder:

```bash
node --import tsx src/mcpServer.ts
```

Do **not** use `npm run dev` for this — that command runs `src/main.ts`, the
full chat CLI client (which itself tries to connect to a server), not the
server on its own. You should see:

```
MCP server listening on http://127.0.0.1:3000/mcp
```

Leave this running in its own terminal for as long as you want Claude
Desktop to be able to reach it.

### 2. Point Claude Desktop at it

Claude Desktop's `claude_desktop_config.json` only knows how to launch
**stdio** servers directly (`command` / `args`), so to reach a server running
over HTTP you need a small stdio↔HTTP bridge: the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote)
package. Add this to your `claude_desktop_config.json` (find it via Claude
Desktop's **Developer** settings section, which opens the file directly — the
path varies by install: the classic location is
`%APPDATA%\Claude\claude_desktop_config.json`, while Microsoft Store installs
use `...\AppData\Local\Packages\Claude_<id>\LocalCache\Roaming\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "document-mcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:3000/mcp"]
    }
  }
}
```

Save the file, then **fully quit and reopen Claude Desktop** (check the
system tray, not just the window) so it picks up the new server entry. You
should see `document-mcp` listed as running under the Developer section, and
its tools (`read_document`, `edit_document`, etc.) available in a new
conversation.

### Notes / troubleshooting

- The server keeps a separate `McpServer` + session per HTTP connection
  (keyed by the `Mcp-Session-Id` header), so it's fine for Claude Desktop to
  reconnect (new conversation, app restart) without you having to restart the
  Node process — this was specifically fixed because clients like
  `mcp-remote` don't reliably send a session-termination `DELETE` before
  their process exits.
- If Claude Desktop shows **"Could not attach to MCP server document-mcp"**,
  check `logs/mcp-server-document-mcp.log` next to your
  `claude_desktop_config.json` for the actual error from `mcp-remote`.
- The Node server process has to be running *before* Claude Desktop tries to
  connect — it won't launch it for you (that's `mcp-remote`'s job, and all
  `mcp-remote` does is proxy to whatever URL you gave it).

## Project structure

| File | Python equivalent | Role |
|---|---|---|
| `src/main.ts` | `main.py` | Entry point: loads `.env`, wires everything, runs the CLI. |
| `src/mcpServer.ts` | `mcp_server.py` | The MCP server (documents + `TODO`s). |
| `src/mcpClient.ts` | `mcp_client.py` | The MCP client wrapper (+ `TODO`s). |
| `src/core/claude.ts` | `core/claude.py` | Anthropic API wrapper. |
| `src/core/chat.ts` | `core/chat.py` | The agent loop. |
| `src/core/cliChat.ts` | `core/cli_chat.py` | `@document` / `/command` handling. |
| `src/core/tools.ts` | `core/tools.py` | Tool discovery & execution. |
| `src/core/cli.ts` | `core/cli.py` | Terminal interface (uses Node `readline`). |

### Note on the CLI

The Python version uses `prompt-toolkit` for `@` / `/` popup autocompletion.
To keep this port dependency-free (SDKs only), the TypeScript CLI uses Node's
built-in `readline`. Typing `@doc` / `/command` still works; only the
autocompletion popup would require an extra library.

## TODOs (the learning exercise)

Implement these in `src/mcpServer.ts` (with `registerTool` / `registerResource`
/ `registerPrompt`) and wire them up in `src/mcpClient.ts`:

1. A tool to read a doc
2. A tool to edit a doc
3. A resource to return all doc ids
4. A resource to return the contents of a particular doc
5. A prompt to rewrite a doc in markdown format
6. A prompt to summarize a doc
