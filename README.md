# MCP Server & Client — Learning

A learning project that implements the **same** MCP (Model Context Protocol) chat
application in two languages, side by side, using each language's **official MCP
SDK** (no higher-level framework). The goal is to learn MCP by building — and
comparing — the same design in both ecosystems.

Both versions are intentionally left with the same unfinished `TODO`s, so you can
implement the MCP tools / resources / prompts yourself in each language.

## Structure

```
.
├── python/       # Python version  (mcp SDK + anthropic, managed with uv)
└── typescript/   # TypeScript port (@modelcontextprotocol/sdk + @anthropic-ai/sdk)
```

Each folder is a self-contained project with its own dependencies, its own `.env`,
and its own README:

- **[python/](python/README.md)** — run with [`uv`](https://github.com/astral-sh/uv).
- **[typescript/](typescript/README.md)** — run with `npm` (Node 18+).

## What the app does

A command-line chat that connects Claude to documents exposed by an MCP server:

- **Chat** — plain messages to the model.
- **`@document`** — include a document's contents in your query.
- **`/command`** — run a prompt defined by the MCP server.

The client launches the MCP server as a subprocess and talks to it over **stdio**.

## Transport: stdio vs. streamable HTTP

Both versions default to **stdio** (client spawns the server as a subprocess).
Each has the code for **streamable HTTP** included but commented out, so you
can switch by commenting/uncommenting a few blocks — no new dependencies
needed:

- **Python**: toggle in `python/mcp_server.py` (`mcp.run(...)`) and
  `python/mcp_client.py` (`connect()`).
- **TypeScript**: toggle in `typescript/src/mcpServer.ts` (`main()`) and
  `typescript/src/mcpClient.ts` (`connect()`).

You must flip **both** server and client to the same transport — a stdio
client can't talk to an HTTP server or vice versa.

| | stdio | streamable HTTP |
|---|---|---|
| **Pros** | Simple, zero network config, no port to expose, process lifecycle handled for you | Server runs independently (long-lived, remote-reachable), one server can serve multiple clients, easier to put behind auth/proxies/load balancers |
| **Cons** | Server only reachable by the process that spawned it, no concurrent clients | Needs a host/port, more moving parts (HTTP server, sessions), overkill for local single-user use |

Rule of thumb: keep **stdio** for local/CLI tools like this one; reach for
**streamable HTTP** when the server needs to run as its own service or be
shared across clients/machines.

## Quick start

Pick a language and follow its README. In short:

```bash
# Python
cd python
uv venv
.venv\Scripts\activate      # Windows PowerShell (use source .venv/bin/activate on macOS/Linux)
uv pip install -e .
uv run main.py

# TypeScript
cd typescript
npm install
npm run dev
```

Both need an `ANTHROPIC_API_KEY` in their respective `.env` file.

## The learning exercise (shared TODOs)

Implement, in each language:

1. A tool to read a doc
2. A tool to edit a doc
3. A resource to return all doc ids
4. A resource to return the contents of a particular doc
5. A prompt to rewrite a doc in markdown format
6. A prompt to summarize a doc
