import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage } from 'node:http';
import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
// import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
// --- STREAMABLE HTTP transport ---
// Uncomment to switch (also comment out the StdioServerTransport import above).
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { makeToolContext } from './core/toolContext.js';

// Shared across every session/connection for the life of the process.
// Equivalent to the module-level `docs` dict in `mcp_server.py`.
const docs: Record<string, string> = {
  'deposition.md': 'This deposition covers the testimony of Angela Smith, P.E.',
  'report.pdf': 'The report details the state of a 20m condenser tower.',
  'financials.docx':
    "These financials outline the project's budget and expenditures.",
  'outlook.pdf':
    'This document presents the projected future performance of the system.',
  'plan.md': "The plan outlines the steps for the project's implementation.",
  'spec.txt':
    'These specifications define the technical requirements for the equipment.',
};

// Builds a fresh MCP server instance. Called once per HTTP session so that
// each connected client (e.g. each Claude Desktop conversation) gets its own
// `McpServer`/roots/sampling wiring instead of sharing one global instance
// across sessions.
function createMcpServer(): McpServer {
  // `logging: {}` must be declared explicitly for `sendLoggingMessage` to work —
  // otherwise the SDK silently no-ops instead of sending the notification.
  const mcp = new McpServer(
    { name: 'DocumentMCP', version: '1.0.0' },
    { capabilities: { logging: {} } },
  );

  // Checks whether a filesystem path falls within one of the client's roots.
  // Equivalent to `is_path_allowed` in `mcp_server.py`.
  async function isPathAllowed(requestedPath: string): Promise<boolean> {
    if (!fs.existsSync(requestedPath)) return false;

    const dirPath = fs.statSync(requestedPath).isFile()
      ? path.dirname(requestedPath)
      : requestedPath;
    const resolvedDir = path.resolve(dirPath);

    const { roots } = await mcp.server.listRoots();
    return roots.some((root) => {
      const rootPath = path.resolve(fileURLToPath(root.uri));
      const relative = path.relative(rootPath, resolvedDir);
      return (
        relative === '' ||
        (!relative.startsWith('..') && !path.isAbsolute(relative))
      );
    });
  }

  // Tool to read documents:
  mcp.registerTool(
    'read_document',
    {
      description: "Read a document's contents by id",
      inputSchema: {
        doc_id: z.string().describe('Id of the document to read'),
      },
    },
    async ({ doc_id }, extra) => {
      const ctx = makeToolContext(mcp, extra);

      await ctx.info(`Reading document '${doc_id}'`);
      await ctx.reportProgress(50, 100);

      if (!(doc_id in docs)) {
        throw new Error(`Doc with id ${doc_id} not found`);
      }

      await ctx.reportProgress(100, 100);
      return { content: [{ type: 'text', text: docs[doc_id] }] };
    },
  );

  // Tool to write documents:
  mcp.registerTool(
    'edit_document',
    {
      description:
        'Edit a document by replacing a string in the document content with a new string',
      inputSchema: {
        doc_id: z.string().describe('Id of the document that will be edited'),
        old_str: z
          .string()
          .describe(
            'The text to replace. Must match exactly, including whitespace',
          ),
        new_str: z
          .string()
          .describe('The new text to insert in place of the old text'),
      },
    },
    async ({ doc_id, old_str, new_str }, extra) => {
      const ctx = makeToolContext(mcp, extra);

      await ctx.info(`Editing document '${doc_id}'`);
      await ctx.reportProgress(20, 100);

      if (!(doc_id in docs)) {
        throw new Error(`Doc with id ${doc_id} not found`);
      }
      docs[doc_id] = docs[doc_id].replace(old_str, new_str);

      await ctx.reportProgress(100, 100);
      return { content: [{ type: 'text', text: `Edited ${doc_id}` }] };
    },
  );

  // Resource to return list of documents:
  mcp.registerResource(
    'list_docs',
    'docs://documents',
    { mimeType: 'application/json' },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(Object.keys(docs)),
        },
      ],
    }),
  );

  // Resource to return content of document:
  mcp.registerResource(
    'fetch_doc',
    new ResourceTemplate('docs://documents/{doc_id}', { list: undefined }),
    { mimeType: 'text/plain' },
    async (uri, variables) => {
      const doc_id = Array.isArray(variables.doc_id)
        ? variables.doc_id[0]
        : variables.doc_id;

      if (!(doc_id in docs)) {
        throw new Error(`Doc with id ${doc_id} not found`);
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/plain',
            text: docs[doc_id],
          },
        ],
      };
    },
  );

  // Prompt to rewrite a doc in markdown format:
  mcp.registerPrompt(
    'format',
    {
      description: 'Rewrites the contents of the document in Markdown format',
      argsSchema: {
        doc_id: z.string().describe('Id of the document to format'),
      },
    },
    ({ doc_id }) => {
      const prompt = `
      Your goal is to reformat a document to be written with markdown syntax.
      The id of the document you need to reformat is:
      <document_id>
      ${doc_id}
      </document_id>

      Add in headers, bullet points, tables, etc as necessary. Feel free to add extra text, but don't change the meaning of the report.
      Use the 'edit_document' tool to edit the document. After the document has been edited, respond with the final version of the doc. Don't explain your changes.
      `;

      return {
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: prompt },
          },
        ],
      };
    },
  );

  // Tool to summarize arbitrary text via sampling (the server asks the
  // connected client's LLM to do the work). Equivalent to `summarize` in
  // `mcp_server.py`.
  mcp.registerTool(
    'summarize',
    {
      description: "Summarize the provided text using the client's LLM",
      inputSchema: {
        text_to_summarize: z.string().describe('The text to summarize'),
      },
    },
    async ({ text_to_summarize }, extra) => {
      const ctx = makeToolContext(mcp, extra);

      await ctx.info('Preparing to summarize...');
      await ctx.reportProgress(20, 100);

      const prompt = `
      Please summarize the following text:
      ${text_to_summarize}
      `;

      const result = await mcp.server.createMessage({
        messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
        maxTokens: 4000,
        systemPrompt: 'You are a helpful research assistant.',
      });

      await ctx.info('Summary received');
      await ctx.reportProgress(90, 100);

      if (result.content.type !== 'text') {
        throw new Error('Sampling failed');
      }

      await ctx.reportProgress(100, 100);
      return { content: [{ type: 'text', text: result.content.text }] };
    },
  );

  // Tool to list the directories the client exposes as roots:
  mcp.registerTool(
    'list_roots',
    {
      description:
        'List all directories that are accessible to this server. These are the root directories where files can be read from or written to.',
    },
    async () => {
      const { roots } = await mcp.server.listRoots();
      const paths = roots.map((root) => fileURLToPath(root.uri));
      return { content: [{ type: 'text', text: JSON.stringify(paths) }] };
    },
  );

  // Tool to read a directory, restricted to the client's roots:
  mcp.registerTool(
    'read_dir',
    {
      description:
        "Read directory contents. Path must be within one of the client's roots.",
      inputSchema: {
        path: z.string().describe('Path to a directory to read'),
      },
    },
    async ({ path: dirPath }) => {
      const resolved = path.resolve(dirPath);

      if (!(await isPathAllowed(resolved))) {
        throw new Error('Error: can only read directories within a root');
      }

      const entries = fs.readdirSync(resolved);
      return { content: [{ type: 'text', text: JSON.stringify(entries) }] };
    },
  );

  return mcp;
}

// Reads and JSON-parses a request body. Streamable HTTP transport needs the
// parsed body up front to decide (via `isInitializeRequest`) whether a
// sessionless POST should start a new session.
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJsonRpcError(
  res: import('node:http').ServerResponse,
  status: number,
  code: number,
  message: string,
) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
}

async function main() {
  // --- STDIO transport (default) ---
  // const transport = new StdioServerTransport();
  // await mcp.connect(transport);

  // --- STREAMABLE HTTP transport ---
  // Comment out the two lines above and uncomment the block below to switch.
  // Server will listen at http://127.0.0.1:3000/mcp
  //
  // Supports multiple concurrent sessions (one `McpServer` + transport per
  // session, keyed by the `Mcp-Session-Id` header). This matters because
  // clients like Claude Desktop's `mcp-remote` bridge don't reliably send a
  // DELETE to close their session before their process exits (app restart,
  // new conversation, etc.) — with a single shared session, a client that
  // vanished without cleaning up would permanently wedge the server with
  // "Server already initialized" errors. Keying by session ID means a new
  // client can always start a new session regardless of stale ones left
  // behind.
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  const httpServer = createServer(async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId && transports[sessionId]) {
        await transports[sessionId].handleRequest(req, res);
        return;
      }

      if (req.method !== 'POST') {
        res.writeHead(400).end('Invalid or missing session ID');
        return;
      }

      const body = await readJsonBody(req);

      if (sessionId || !isInitializeRequest(body)) {
        sendJsonRpcError(
          res,
          400,
          -32000,
          'Bad Request: No valid session ID provided',
        );
        return;
      }

      const mcp = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) delete transports[transport.sessionId];
      };

      await mcp.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        sendJsonRpcError(res, 500, -32603, 'Internal server error');
      }
    }
  });

  httpServer.listen(3000, () => {
    console.log('MCP server listening on http://127.0.0.1:3000/mcp');
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
