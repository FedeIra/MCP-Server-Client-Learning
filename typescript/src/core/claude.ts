import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  Tool,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";

// Thin wrapper around the Anthropic SDK. Equivalent to `core/claude.py`.
export class Claude {
  private client: Anthropic;
  private model: string;

  constructor(model: string) {
    // Reads ANTHROPIC_API_KEY from the environment automatically.
    this.client = new Anthropic();
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }

  addUserMessage(messages: MessageParam[], message: Message | unknown): void {
    messages.push({ role: "user", content: this.contentOf(message) });
  }

  addAssistantMessage(
    messages: MessageParam[],
    message: Message | unknown
  ): void {
    messages.push({ role: "assistant", content: this.contentOf(message) });
  }

  // If `message` is a full Anthropic Message, use its `.content`; otherwise
  // treat it as raw content (e.g. an array of tool_result blocks).
  private contentOf(message: Message | unknown): any {
    if (
      message &&
      typeof message === "object" &&
      !Array.isArray(message) &&
      "content" in message
    ) {
      return (message as Message).content;
    }
    return message;
  }

  textFromMessage(message: Message): string {
    return message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { text: string }).text)
      .join("\n");
  }

  async chat(params: {
    messages: MessageParam[];
    system?: string;
    temperature?: number;
    stopSequences?: string[];
    tools?: Tool[];
    thinking?: boolean;
    thinkingBudget?: number;
  }): Promise<Message> {
    const {
      messages,
      system,
      temperature = 1.0,
      stopSequences = [],
      tools,
      thinking = false,
      thinkingBudget = 1024,
    } = params;

    const body: MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: 8000,
      messages,
      temperature,
      stop_sequences: stopSequences,
    };

    if (thinking) {
      body.thinking = { type: "enabled", budget_tokens: thinkingBudget };
    }

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    if (system) {
      body.system = system;
    }

    return this.client.messages.create(body);
  }
}
