import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import {
  ErrorCode,
  McpError,
  type CreateMessageRequest,
  type CreateMessageResult,
  type SamplingMessage,
} from "@modelcontextprotocol/sdk/types.js";
import { Claude } from "./claude.js";

// `SamplingMessage.content` can be a single content block or an array of them.
function contentToText(content: SamplingMessage["content"]): string {
  const blocks = Array.isArray(content) ? content : [content];
  return blocks
    .filter((block) => block.type === "text")
    .map((block) => (block as { text: string }).text)
    .join("\n");
}

// Builds a handler for the server's `sampling/createMessage` requests,
// fulfilling them by calling Claude through the Anthropic SDK. Equivalent to
// `core/sampling.py`. The Anthropic TS SDK is async/non-blocking by default,
// so (unlike the Python port) there's no separate sync/async client concern
// here — a plain `Anthropic()` client is enough.
export function makeSamplingHandler(claudeService: Claude) {
  const anthropicClient = new Anthropic();
  const model = claudeService.getModel();

  return async (request: CreateMessageRequest): Promise<CreateMessageResult> => {
    try {
      const { params } = request;

      const messages: MessageParam[] = params.messages.map(
        (message: SamplingMessage) => ({
          role: message.role,
          content: contentToText(message.content),
        })
      );

      const response = await anthropicClient.messages.create({
        model,
        messages,
        max_tokens: params.maxTokens,
        ...(params.systemPrompt ? { system: params.systemPrompt } : {}),
        ...(params.temperature !== undefined
          ? { temperature: params.temperature }
          : {}),
        ...(params.stopSequences && params.stopSequences.length > 0
          ? { stop_sequences: params.stopSequences }
          : {}),
      });

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => (block as { text: string }).text)
        .join("\n");

      return {
        role: "assistant",
        model,
        content: { type: "text", text },
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        error instanceof Error ? error.message : String(error)
      );
    }
  };
}
