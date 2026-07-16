import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { makeToolContext } from "./core/toolContext.js";

// The MCP server. This is the TypeScript equivalent of `mcp_server.py`.
// `logging: {}` must be declared explicitly for `sendLoggingMessage` to work —
// otherwise the SDK silently no-ops instead of sending the notification.
const mcp = new McpServer(
  { name: "DocumentMCP", version: "1.0.0" },
  { capabilities: { logging: {} } }
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
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}

const docs: Record<string, string> = {
  "deposition.md": "This deposition covers the testimony of Angela Smith, P.E.",
  "report.pdf": "The report details the state of a 20m condenser tower.",
  "financials.docx":
    "These financials outline the project's budget and expenditures.",
  "outlook.pdf":
    "This document presents the projected future performance of the system.",
  "plan.md": "The plan outlines the steps for the project's implementation.",
  "spec.txt":
    "These specifications define the technical requirements for the equipment.",
};

// Tool to read documents:
mcp.registerTool(
  "read_document",
  {
    description: "Read a document's contents by id",
    inputSchema: {
      doc_id: z.string().describe("Id of the document to read"),
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
    return { content: [{ type: "text", text: docs[doc_id] }] };
  }
);

// Tool to write documents:
mcp.registerTool(
  "edit_document",
  {
    description:
      "Edit a document by replacing a string in the document content with a new string",
    inputSchema: {
      doc_id: z.string().describe("Id of the document that will be edited"),
      old_str: z
        .string()
        .describe(
          "The text to replace. Must match exactly, including whitespace"
        ),
      new_str: z
        .string()
        .describe("The new text to insert in place of the old text"),
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
    return { content: [{ type: "text", text: `Edited ${doc_id}` }] };
  }
);

// Resource to return list of documents:
mcp.registerResource(
  "list_docs",
  "docs://documents",
  { mimeType: "application/json" },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(Object.keys(docs)),
      },
    ],
  })
);

// Resource to return content of document:
mcp.registerResource(
  "fetch_doc",
  new ResourceTemplate("docs://documents/{doc_id}", { list: undefined }),
  { mimeType: "text/plain" },
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
          mimeType: "text/plain",
          text: docs[doc_id],
        },
      ],
    };
  }
);

// Prompt to rewrite a doc in markdown format:
mcp.registerPrompt(
  "format",
  {
    description: "Rewrites the contents of the document in Markdown format",
    argsSchema: {
      doc_id: z.string().describe("Id of the document to format"),
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
          role: "user",
          content: { type: "text", text: prompt },
        },
      ],
    };
  }
);

// Tool to summarize arbitrary text via sampling (the server asks the
// connected client's LLM to do the work). Equivalent to `summarize` in
// `mcp_server.py`.
mcp.registerTool(
  "summarize",
  {
    description: "Summarize the provided text using the client's LLM",
    inputSchema: {
      text_to_summarize: z.string().describe("The text to summarize"),
    },
  },
  async ({ text_to_summarize }, extra) => {
    const ctx = makeToolContext(mcp, extra);

    await ctx.info("Preparing to summarize...");
    await ctx.reportProgress(20, 100);

    const prompt = `
    Please summarize the following text:
    ${text_to_summarize}
    `;

    const result = await mcp.server.createMessage({
      messages: [{ role: "user", content: { type: "text", text: prompt } }],
      maxTokens: 4000,
      systemPrompt: "You are a helpful research assistant.",
    });

    await ctx.info("Summary received");
    await ctx.reportProgress(90, 100);

    if (result.content.type !== "text") {
      throw new Error("Sampling failed");
    }

    await ctx.reportProgress(100, 100);
    return { content: [{ type: "text", text: result.content.text }] };
  }
);

// Tool to list the directories the client exposes as roots:
mcp.registerTool(
  "list_roots",
  {
    description:
      "List all directories that are accessible to this server. These are the root directories where files can be read from or written to.",
  },
  async () => {
    const { roots } = await mcp.server.listRoots();
    const paths = roots.map((root) => fileURLToPath(root.uri));
    return { content: [{ type: "text", text: JSON.stringify(paths) }] };
  }
);

// Tool to read a directory, restricted to the client's roots:
mcp.registerTool(
  "read_dir",
  {
    description: "Read directory contents. Path must be within one of the client's roots.",
    inputSchema: {
      path: z.string().describe("Path to a directory to read"),
    },
  },
  async ({ path: dirPath }) => {
    const resolved = path.resolve(dirPath);

    if (!(await isPathAllowed(resolved))) {
      throw new Error("Error: can only read directories within a root");
    }

    const entries = fs.readdirSync(resolved);
    return { content: [{ type: "text", text: JSON.stringify(entries) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
