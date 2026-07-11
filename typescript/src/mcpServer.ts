import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// The MCP server. This is the TypeScript equivalent of `mcp_server.py`.
const mcp = new McpServer({ name: "DocumentMCP", version: "1.0.0" });

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
  async ({ doc_id }) => {
    if (!(doc_id in docs)) {
      throw new Error(`Doc with id ${doc_id} not found`);
    }
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
  async ({ doc_id, old_str, new_str }) => {
    if (!(doc_id in docs)) {
      throw new Error(`Doc with id ${doc_id} not found`);
    }
    docs[doc_id] = docs[doc_id].replace(old_str, new_str);
    return { content: [{ type: "text", text: `Edited ${doc_id}` }] };
  }
);

// TODO: Write a resource to return all doc id's            -> mcp.registerResource(...)
// TODO: Write a resource to return the contents of a doc   -> mcp.registerResource(...)
// TODO: Write a prompt to rewrite a doc in markdown format -> mcp.registerPrompt(...)
// TODO: Write a prompt to summarize a doc                  -> mcp.registerPrompt(...)

async function main() {
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
