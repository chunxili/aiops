from __future__ import annotations

from schemas.agent import ChatRequest, ChatResponse, ToolCall
from agent.model_adapter import ModelClient
from tools.registry import ToolRegistry


class ClaudeSdkAgentRuntime:
    """Claude-SDK-shaped agent runtime with a pluggable model backend.

    This project uses the Claude SDK pattern as the agent orchestration boundary:
    select tools, execute only registered read-only tools, pass context to the
    model backend, and return structured tool traces. The model backend remains
    MiniMax, so this layer is intentionally not tied to Anthropic model calls.
    """

    def __init__(self, model_client: ModelClient, registry: ToolRegistry) -> None:
        self.model_client = model_client
        self.registry = registry

    async def run(self, request: ChatRequest) -> ChatResponse:
        selected = self.registry.select_for_message(request.message)
        if not selected:
            selected = self.registry.names()[:5]

        tool_calls: list[ToolCall] = []
        for tool_name in selected:
            result = await self.registry.run(tool_name)
            tool_calls.append(ToolCall(name=tool_name, result=result))

        answer = await self.model_client.complete(request, self.registry)
        return ChatResponse(answer=answer, tool_calls=tool_calls)
