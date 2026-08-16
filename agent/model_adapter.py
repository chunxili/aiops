from __future__ import annotations

import os
from typing import Any, Protocol

import httpx

from schemas.agent import ChatRequest
from tools.registry import ToolRegistry


class ModelClient(Protocol):
    async def complete(self, request: ChatRequest, registry: ToolRegistry) -> str:
        """Return a model answer for the request."""


class MockModelClient:
    async def complete(self, request: ChatRequest, registry: ToolRegistry) -> str:
        selected = registry.select_for_message(request.message) or registry.names()[:5]
        summaries = []
        for tool_name in selected:
            result = await registry.run(tool_name)
            summaries.append(f"{tool_name}: {result['summary']}")

        return (
            "Mock MiniMax AIOps response. "
            "I correlated read-only AWS platform signals across the simulated accounts. "
            + " ".join(summaries)
        )


class MiniMaxChatCompletionsAdapter:
    """MiniMax OpenAI-compatible Chat Completions adapter."""

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.minimax.io",
        model: str = "MiniMax-M3",
        timeout_seconds: float = 30.0,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds

    async def complete(self, request: ChatRequest, registry: ToolRegistry) -> str:
        tool_context = []
        for tool_name in registry.select_for_message(request.message) or registry.names()[:5]:
            result = await registry.run(tool_name)
            tool_context.append(
                {
                    "tool": tool_name,
                    "summary": result["summary"],
                    "data": result["data"],
                }
            )

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a read-only AWS AIOps Platform Agent. "
                        "Use supplied tool context to diagnose, summarize impact, "
                        "recommend safe next steps, and never claim to mutate AWS resources."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"User request: {request.message}\n\n"
                        f"Read-only tool context: {tool_context}"
                    ),
                },
            ],
            "thinking": {"type": "disabled"},
            "temperature": 0.2,
        }

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                f"{self.base_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            body = response.json()

        return body["choices"][0]["message"]["content"]


def get_model_client() -> ModelClient:
    api_key = os.getenv("MINIMAX_API_KEY")
    if api_key:
        return MiniMaxChatCompletionsAdapter(
            api_key=api_key,
            base_url=os.getenv("MINIMAX_BASE_URL", "https://api.minimax.io"),
            model=os.getenv("MINIMAX_MODEL", "MiniMax-M3"),
        )
    return MockModelClient()
