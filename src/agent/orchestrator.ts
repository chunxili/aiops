import type { ChatRequest, ChatResponse } from "../schemas/agent.js";
import { ClaudeSdkAgentRuntime } from "./claudeSdkRuntime.js";
import type { ModelClient } from "./modelAdapter.js";
import type { ToolRegistry } from "../tools/registry.js";

export class AgentOrchestrator {
  private readonly runtime: ClaudeSdkAgentRuntime;

  constructor(modelClient: ModelClient, registry: ToolRegistry) {
    this.runtime = new ClaudeSdkAgentRuntime(modelClient, registry);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.runtime.run(request);
  }
}
