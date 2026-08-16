from typing import Any

from fastapi import APIRouter, Depends

from agent.orchestrator import AgentOrchestrator, get_orchestrator
from schemas.agent import ChatRequest, ChatResponse
from tools.registry import ToolRegistry, get_tool_registry

agent_router = APIRouter(prefix="/api/agent", tags=["agent"])
tools_router = APIRouter(prefix="/api/tools", tags=["tools"])


@agent_router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    orchestrator: AgentOrchestrator = Depends(get_orchestrator),
) -> ChatResponse:
    return await orchestrator.chat(request)


@tools_router.get("/{tool_name}")
async def run_tool(
    tool_name: str,
    registry: ToolRegistry = Depends(get_tool_registry),
) -> dict[str, Any]:
    return await registry.run(tool_name)
