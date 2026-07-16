from mcp.types import LoggingMessageNotificationParams


async def logging_callback(params: LoggingMessageNotificationParams) -> None:
    """Prints log messages sent by the server via `ctx.info` / `ctx.warning` / etc."""
    print(f"[server log] {params.data}")


async def progress_callback(
    progress: float, total: float | None, message: str | None
) -> None:
    """Prints progress notifications sent by the server via `ctx.report_progress`."""
    if total is not None:
        percentage = (progress / total) * 100
        label = f"{progress}/{total} ({percentage:.1f}%)"
    else:
        label = f"{progress}"

    print(f"[progress] {message + ' - ' if message else ''}{label}")
