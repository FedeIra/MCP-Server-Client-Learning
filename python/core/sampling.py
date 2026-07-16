from typing import Any

from anthropic import AsyncAnthropic
from mcp import types
from mcp.shared.context import RequestContext

from core.claude import Claude


def make_sampling_callback(claude_service: Claude):
    """Builds a sampling callback that fulfills the server's `create_message`
    requests by calling Claude through the Anthropic SDK.

    Uses its own `AsyncAnthropic` client rather than the shared sync `Claude`
    service so the call doesn't block the event loop while other async work
    (other MCP traffic, the CLI prompt) is in flight.
    """
    anthropic_client = AsyncAnthropic()
    model = claude_service.model

    async def sampling_callback(
        context: RequestContext[Any, Any],
        params: types.CreateMessageRequestParams,
    ) -> types.CreateMessageResult | types.ErrorData:
        try:
            messages = [
                {
                    "role": message.role,
                    "content": message.content.text
                    if isinstance(message.content, types.TextContent)
                    else str(message.content),
                }
                for message in params.messages
            ]

            create_kwargs: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "max_tokens": params.maxTokens,
            }
            if params.systemPrompt:
                create_kwargs["system"] = params.systemPrompt
            if params.temperature is not None:
                create_kwargs["temperature"] = params.temperature
            if params.stopSequences:
                create_kwargs["stop_sequences"] = params.stopSequences

            response = await anthropic_client.messages.create(**create_kwargs)

            text = "\n".join(
                block.text for block in response.content if block.type == "text"
            )

            return types.CreateMessageResult(
                role="assistant",
                model=model,
                content=types.TextContent(type="text", text=text),
            )
        except Exception as e:
            return types.ErrorData(code=types.INTERNAL_ERROR, message=str(e))

    return sampling_callback
