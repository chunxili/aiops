from typing import Any, Literal

from pydantic import BaseModel, Field


class ToolResult(BaseModel):
    tool: str
    category: Literal["Alert", "FinOps", "EKS", "Resource", "Log", "AIOps"]
    readonly: bool = True
    summary: str
    data: dict[str, Any] = Field(default_factory=dict)
