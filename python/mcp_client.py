import sys
import asyncio
import json
from pathlib import Path
from pydantic import AnyUrl, FileUrl
from typing import Optional, Any
from contextlib import AsyncExitStack
from mcp import ClientSession, StdioServerParameters, types
from mcp.client.session import LoggingFnT, SamplingFnT
from mcp.client.stdio import stdio_client
# --- STREAMABLE HTTP transport ---
# Uncomment to switch (also comment out the "from mcp.client.stdio import stdio_client" line above).
# from mcp.client.streamable_http import streamablehttp_client
from mcp.shared.context import RequestContext
from mcp.shared.session import ProgressFnT
from mcp.types import ErrorData, ListRootsResult, Root


class MCPClient:
    def __init__(
        self,
        command: str,
        args: list[str],
        env: Optional[dict] = None,
        sampling_callback: Optional[SamplingFnT] = None,
        logging_callback: Optional[LoggingFnT] = None,
        roots: Optional[list[str]] = None,
    ):
        self._command = command
        self._args = args
        self._env = env
        self._sampling_callback = sampling_callback
        self._logging_callback = logging_callback
        self._roots = self._create_roots(roots) if roots else []
        self._session: Optional[ClientSession] = None
        self._exit_stack: AsyncExitStack = AsyncExitStack()

    def _create_roots(self, root_paths: list[str]) -> list[Root]:
        """Convert path strings to Root objects."""
        roots = []
        for path in root_paths:
            p = Path(path).resolve()
            file_url = FileUrl(f"file://{p}")
            roots.append(Root(uri=file_url, name=p.name or "Root"))
        return roots

    async def _handle_list_roots(
        self, context: RequestContext["ClientSession", Any]
    ) -> ListRootsResult | ErrorData:
        """Callback for when the server requests the client's roots."""
        return ListRootsResult(roots=self._roots)

    async def connect(self):
        # --- STDIO transport (default) ---
        server_params = StdioServerParameters(
            command=self._command,
            args=self._args,
            env=self._env,
        )
        stdio_transport = await self._exit_stack.enter_async_context(
            stdio_client(server_params)
        )
        _read, _write = stdio_transport

        # --- STREAMABLE HTTP transport ---
        # Comment out the stdio block above and uncomment the block below to switch.
        # Requires the server to be running with `mcp.run(transport="streamable-http", ...)`
        # (see mcp_server.py) and reachable at this URL.
        # http_transport = await self._exit_stack.enter_async_context(
        #     streamablehttp_client("http://127.0.0.1:8000/mcp")
        # )
        # _read, _write, _get_session_id = http_transport

        self._session = await self._exit_stack.enter_async_context(
            ClientSession(
                _read,
                _write,
                sampling_callback=self._sampling_callback,
                logging_callback=self._logging_callback,
                list_roots_callback=self._handle_list_roots
                if self._roots
                else None,
            )
        )
        await self._session.initialize()

    def session(self) -> ClientSession:
        if self._session is None:
            raise ConnectionError(
                "Client session not initialized or cache not populated. Call connect_to_server first."
            )
        return self._session

    async def list_tools(self) -> list[types.Tool]:
        result = await self.session().list_tools()
        return result.tools

    async def call_tool(
        self,
        tool_name: str,
        tool_input: dict,
        progress_callback: Optional[ProgressFnT] = None,
    ) -> types.CallToolResult | None:
        return await self.session().call_tool(
            tool_name, tool_input, progress_callback=progress_callback
        )

    async def list_prompts(self) -> list[types.Prompt]:
       result = await self.session().list_prompts()
       return result.prompts

    async def get_prompt(self, prompt_name, args: dict[str, str]):
        result = await self.session().get_prompt(prompt_name, args)
        return result.messages

    async def read_resource(self, uri: str) -> Any:
       result = await self.session().read_resource(AnyUrl(uri))
       resource = result.contents[0]

       if isinstance(resource, types.TextResourceContents):
        if resource.mimeType == "application/json":
            return json.loads(resource.text)

            return resource.text

    async def cleanup(self):
        await self._exit_stack.aclose()
        self._session = None

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.cleanup()


# For testing
async def main():
    async with MCPClient(
        # If using Python without UV, update command to 'python' and remove "run" from args.
        command="uv",
        args=["run", "mcp_server.py"],
    ) as _client:
        result = await _client.list_tools()
        print()


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    asyncio.run(main())
