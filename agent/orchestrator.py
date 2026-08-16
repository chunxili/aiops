from schemas.agent import ChatRequest, ChatResponse
from agent.claude_sdk_runtime import ClaudeSdkAgentRuntime
from agent.model_adapter import ModelClient, get_model_client
from tools.registry import ToolRegistry, get_tool_registry


class AgentOrchestrator:
    def __init__(self, model_client: ModelClient, registry: ToolRegistry) -> None:
        self.runtime = ClaudeSdkAgentRuntime(model_client=model_client, registry=registry)

    async def chat(self, request: ChatRequest) -> ChatResponse:
        return await self.runtime.run(request)


def get_orchestrator() -> AgentOrchestrator:
    return AgentOrchestrator(
        model_client=get_model_client(),
        registry=get_tool_registry(),
    )
