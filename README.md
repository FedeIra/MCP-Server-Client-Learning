# MCP Server & Client

The same MCP (Model Context Protocol) document-chat application, implemented
side by side in Python and TypeScript, each using that language's **official
MCP SDK** (no higher-level framework). Both are command-line chat clients
that connect Claude to a small set of documents exposed through an MCP
server (tools to read/edit documents, resources to list/fetch them, prompts
to reformat or summarize them).

The TypeScript version also ships a production-shaped deployment path for
the server: streamable HTTP by default, bearer-token auth, multi-session
support, a health endpoint, and a Dockerfile for AWS App Runner. See
[Running the server in production](#running-the-server-in-production-typescript)
below.

## Structure

```
.
├── python/       # Python version  (mcp SDK + anthropic, managed with uv)
├── typescript/   # TypeScript port (@modelcontextprotocol/sdk + @anthropic-ai/sdk)
└── docs/         # Notes on the MCP primitives (tools / resources / prompts) used here
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

## Transport: stdio vs. streamable HTTP

The two versions default to **different** transports:

- **Python** defaults to **stdio** — the client spawns `mcp_server.py` as a
  subprocess. The streamable HTTP block is present in `mcp_server.py` /
  `mcp_client.py` but commented out; toggle it to switch.
- **TypeScript** defaults to **streamable HTTP** — `mcpServer.ts` runs as an
  independent HTTP server (`http://127.0.0.1:3000/mcp` locally), and
  `mcpClient.ts` connects to it that way. The commented-out stdio block is
  still there if you want the client to spawn the server as a subprocess
  instead; see the toggle comments at the top of both files.

You must flip **both** server and client to the same transport — a stdio
client can't talk to an HTTP server or vice versa.

| | stdio | streamable HTTP |
|---|---|---|
| **Pros** | Simple, zero network config, no port to expose, process lifecycle handled for you | Server runs independently (long-lived, remote-reachable), one server can serve multiple clients/sessions, easier to put behind auth/proxies/load balancers |
| **Cons** | Server only reachable by the process that spawned it, no concurrent clients | Needs a host/port, more moving parts (HTTP server, sessions) |

## Running the server in production (TypeScript)

The TypeScript server (`typescript/src/mcpServer.ts`) is built to run as a
standalone, remotely-reachable service rather than only as a subprocess of
the CLI client:

- **Streamable HTTP by default**, with one `McpServer` + session per HTTP
  connection (keyed by the `Mcp-Session-Id` header), so multiple clients —
  or the same client reconnecting — don't wedge the server.
- **Bearer-token auth** via `MCP_AUTH_TOKEN`: when set, every request must
  send `Authorization: Bearer <token>`; unset, the server is open (fine for
  local use only).
- **`GET /health`** — unauthenticated, for load balancer / App Runner health
  checks.
- **`Dockerfile`** (`typescript/Dockerfile`) — packages just the server (not
  the CLI client) for deployment, e.g. to AWS App Runner.

For the full walkthrough — running it locally, attaching it to Claude
Desktop via `mcp-remote`, and deploying it to AWS App Runner — see
[typescript/README.md § Deploying the server remotely](typescript/README.md#deploying-the-server-remotely-aws-app-runner).

## MCP primitives used here

`docs/README.md` explains how this project uses each of the three MCP
primitives — tools, resources, and prompts — and when to reach for which:

<p align="center">
  <img src="docs/mcp%20primitives.png" alt="Tools are model-controlled, resources are app-controlled, prompts are user-controlled" width="720">
</p>

See [docs/README.md](docs/README.md) for the full explanation, and
[docs/mcp flow.png](<docs/mcp flow.png>) for how a request flows through the
client, the model, and the MCP server.

## Quick start

Pick a language and follow its README's Setup section:
[python/README.md](python/README.md#setup) or
[typescript/README.md](typescript/README.md#setup). Both need an
`ANTHROPIC_API_KEY` in their respective `.env` file.

## License

[MIT](LICENSE)
