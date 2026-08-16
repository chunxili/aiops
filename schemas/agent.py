from typing import Any

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    session_id: str | None = None


class ToolCall(BaseModel):
    name: str
    result: dict[str, Any]


class ChatResponse(BaseModel):
    answer: str
    tool_calls: list[ToolCall]
