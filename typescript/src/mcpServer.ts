import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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

// TODO: Write a tool to read a doc                         -> mcp.registerTool(...)
// TODO: Write a tool to edit a doc                         -> mcp.registerTool(...)
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
