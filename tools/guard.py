from collections.abc import Callable
from functools import wraps
from typing import Any, Awaitable

READ_ONLY_PREFIXES = ("query_", "list_", "get_", "describe_")
MUTATING_PREFIXES = (
    "create_",
    "update_",
    "delete_",
    "put_",
    "patch_",
    "start_",
    "stop_",
    "restart_",
    "scale_",
    "apply_",
)


class ReadOnlyViolation(ValueError):
    pass


def assert_read_only_tool(tool_name: str) -> None:
    if tool_name.startswith(MUTATING_PREFIXES) or not tool_name.startswith(READ_ONLY_PREFIXES):
        raise ReadOnlyViolation(f"Tool '{tool_name}' is not allowed by the read-only guard.")


def readonly_tool(
    func: Callable[..., Awaitable[dict[str, Any]]]
) -> Callable[..., Awaitable[dict[str, Any]]]:
    assert_read_only_tool(func.__name__)

    @wraps(func)
    async def wrapper(*args: Any, **kwargs: Any) -> dict[str, Any]:
        assert_read_only_tool(func.__name__)
        result = await func(*args, **kwargs)
        result["readonly"] = True
        return result

    return wrapper
