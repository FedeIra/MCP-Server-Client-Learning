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
