from pathlib import Path

from mcp.server.fastmcp import FastMCP, Context
from pydantic import Field
from mcp.server.fastmcp.prompts import base
from mcp.types import SamplingMessage, TextContent

from core.utils import file_url_to_path

mcp = FastMCP("DocumentMCP", log_level="ERROR")


async def is_path_allowed(requested_path: Path, ctx: Context) -> bool:
    """Checks whether a filesystem path falls within one of the client's roots."""
    roots_result = await ctx.session.list_roots()
    client_roots = roots_result.roots

    if not requested_path.exists():
        return False

    if requested_path.is_file():
        requested_path = requested_path.parent

    for root in client_roots:
        root_path = file_url_to_path(root.uri)
        try:
            requested_path.relative_to(root_path)
            return True
        except ValueError:
            continue

    return False


docs = {
    "deposition.md": "This deposition covers the testimony of Angela Smith, P.E.",
    "report.pdf": "The report details the state of a 20m condenser tower.",
    "financials.docx": "These financials outline the project's budget and expenditures.",
    "outlook.pdf": "This document presents the projected future performance of the system.",
    "plan.md": "The plan outlines the steps for the project's implementation.",
    "spec.txt": "These specifications define the technical requirements for the equipment.",
}

# Tool to read documents:
@mcp.tool(
    name="read_document",
    description="Read a document's contents by id",
)
async def read_document(
    ctx: Context,
    doc_id: str = Field(description="Id of the document to read"),
):
    await ctx.info(f"Reading document '{doc_id}'")
    await ctx.report_progress(50, 100)

    if doc_id not in docs:
        raise ValueError(f"Doc with id {doc_id} not found")

    await ctx.report_progress(100, 100)
    return docs[doc_id]


# Tool to write documents:
@mcp.tool(
    name="edit_document",
    description="Edit a document by replacing a string in the document content with a new string"
)
async def edit_document(
    ctx: Context,
    doc_id: str = Field(description="Id of the document that will be edited"),
    old_str: str = Field(description="The text to replace. Must match exactly, including whitespace"),
    new_str: str = Field(description="The new text to insert in place of the old text"),
):
    await ctx.info(f"Editing document '{doc_id}'")
    await ctx.report_progress(20, 100)

    if doc_id not in docs:
        raise ValueError(f"Doc with id {doc_id} not found")

    docs[doc_id] = docs[doc_id].replace(old_str, new_str)

    await ctx.report_progress(100, 100)
    return f"Edited {doc_id}"

# Resource to return list of documents:
@mcp.resource(
    "docs://documents",
    mime_type="application/json"
)
def list_docs() -> list[str]:
    return list(docs.keys())

# Resource to return content of document:
# TODO: Write a resource to return the contents of a particular doc
@mcp.resource(
    "docs://documents/{doc_id}",
    mime_type="text/plain"
)
def fetch_doc(doc_id: str) -> str:
    if doc_id not in docs:
        raise ValueError(f"Doc with id {doc_id} not found")
    return docs[doc_id]

# Prompt to rewrite a doc in markdown format:
@mcp.prompt(
    name="format",
    description="Rewrites the contents of the document in Markdown format",
)
def format_document(
    doc_id: str = Field(description="Id of the document to format")
) -> list[base.Message]:
    prompt = f"""
    Your goal is to reformat a document to be written with markdown syntax.
    The id of the document you need to reformat is:
    <document_id>
    {doc_id}
    </document_id>

    Add in headers, bullet points, tables, etc as necessary. Feel free to add extra text, but don't change the meaning of the report.
    Use the 'edit_document' tool to edit the document. After the document has been edited, respond with the final version of the doc. Don't explain your changes.
    """

    return [base.UserMessage(prompt)]


# TODO: Write a prompt to summarize a doc
@mcp.tool()
async def summarize(text_to_summarize: str, ctx: Context):
    await ctx.info("Preparing to summarize...")
    await ctx.report_progress(20, 100)

    prompt = f"""
        Please summarize the following text:
        {text_to_summarize}
    """

    result = await ctx.session.create_message(
        messages=[
            SamplingMessage(
                role="user", content=TextContent(type="text", text=prompt)
            )
        ],
        max_tokens=4000,
        system_prompt="You are a helpful research assistant.",
    )

    await ctx.info("Summary received")
    await ctx.report_progress(90, 100)

    if result.content.type == "text":
        await ctx.report_progress(100, 100)
        return result.content.text
    else:
        raise ValueError("Sampling failed")


# Tool to list the directories the client exposes as roots:
@mcp.tool()
async def list_roots(ctx: Context):
    """List all directories that are accessible to this server.
    These are the root directories where files can be read from or written to.
    """
    roots_result = await ctx.session.list_roots()
    return [str(file_url_to_path(root.uri)) for root in roots_result.roots]


# Tool to read a directory, restricted to the client's roots:
@mcp.tool()
async def read_dir(
    ctx: Context,
    path: str = Field(description="Path to a directory to read"),
):
    """Read directory contents. Path must be within one of the client's roots."""
    requested_path = Path(path).resolve()

    if not await is_path_allowed(requested_path, ctx):
        raise ValueError("Error: can only read directories within a root")

    return [entry.name for entry in requested_path.iterdir()]


if __name__ == "__main__":
    # --- STDIO transport (default) ---
    mcp.run(transport="stdio")

    # --- STREAMABLE HTTP transport ---
    # Comment out the stdio line above and uncomment the line below to switch.
    # Server will listen at http://127.0.0.1:8000/mcp
    # mcp.run(transport="streamable-http", host="127.0.0.1", port=8000)
