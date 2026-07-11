import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { Prompt, PromptMessage } from "@modelcontextprotocol/sdk/types.js";
import { Chat } from "./chat.js";
import { Claude } from "./claude.js";
import { MCPClient } from "../mcpClient.js";

// Adds @document and /command handling on top of the base Chat.
// Equivalent to `core/cli_chat.py`.
export class CliChat extends Chat {
  private docClient: MCPClient;

  constructor(
    docClient: MCPClient,
    clients: Record<string, MCPClient>,
    claudeService: Claude
  ) {
    super(claudeService, clients);
    this.docClient = docClient;
  }

  async listPrompts(): Promise<Prompt[]> {
    return this.docClient.listPrompts();
  }

  async listDocsIds(): Promise<string[]> {
    return this.docClient.readResource("docs://documents");
  }

  async getDocContent(docId: string): Promise<string> {
    return this.docClient.readResource(`docs://documents/${docId}`);
  }

  async getPrompt(command: string, docId: string): Promise<PromptMessage[]> {
    return this.docClient.getPrompt(command, { doc_id: docId });
  }

  private async extractResources(query: string): Promise<string> {
    const mentions = query
      .split(/\s+/)
      .filter((word) => word.startsWith("@"))
      .map((word) => word.slice(1));

    const docIds = await this.listDocsIds();
    const mentionedDocs: [string, string][] = [];

    for (const docId of docIds) {
      if (mentions.includes(docId)) {
        const content = await this.getDocContent(docId);
        mentionedDocs.push([docId, content]);
      }
    }

    return mentionedDocs
      .map(
        ([docId, content]) =>
          `\n<document id="${docId}">\n${content}\n</document>\n`
      )
      .join("");
  }

  private async processCommand(query: string): Promise<boolean> {
    if (!query.startsWith("/")) {
      return false;
    }

    const words = query.split(/\s+/);
    const command = words[0].replace("/", "");

    const messages = await this.docClient.getPrompt(command, {
      doc_id: words[1],
    });

    this.messages.push(...convertPromptMessagesToMessageParams(messages));
    return true;
  }

  protected async processQuery(query: string): Promise<void> {
    if (await this.processCommand(query)) {
      return;
    }

    const addedResources = await this.extractResources(query);

    const prompt = `
    The user has a question:
    <query>
    ${query}
    </query>

    The following context may be useful in answering their question:
    <context>
    ${addedResources}
    </context>

    Note the user's query might contain references to documents like "@report.docx". The "@" is only
    included as a way of mentioning the doc. The actual name of the document would be "report.docx".
    If the document content is included in this prompt, you don't need to use an additional tool to read the document.
    Answer the user's question directly and concisely. Start with the exact information they need.
    Don't refer to or mention the provided context in any way - just use it to inform your answer.
    `;

    this.messages.push({ role: "user", content: prompt });
  }
}

export function convertPromptMessageToMessageParam(
  promptMessage: PromptMessage
): MessageParam {
  const role = promptMessage.role === "user" ? "user" : "assistant";
  const content = promptMessage.content as any;

  // Single content block with a "type" field.
  if (content && typeof content === "object" && !Array.isArray(content)) {
    if (content.type === "text") {
      return { role, content: content.text ?? "" };
    }
  }

  // List of content blocks.
  if (Array.isArray(content)) {
    const textBlocks: { type: "text"; text: string }[] = [];
    for (const item of content) {
      if (item && typeof item === "object" && item.type === "text") {
        textBlocks.push({ type: "text", text: item.text ?? "" });
      }
    }
    if (textBlocks.length > 0) {
      return { role, content: textBlocks };
    }
  }

  return { role, content: "" };
}

export function convertPromptMessagesToMessageParams(
  promptMessages: PromptMessage[]
): MessageParam[] {
  return promptMessages.map(convertPromptMessageToMessageParam);
}
