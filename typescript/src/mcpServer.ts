import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
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

// TODO: Write a prompt to summarize a doc -> mcp.registerPrompt(...)

async function main() {
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
