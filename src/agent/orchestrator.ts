import type { ChatRequest, ChatResponse } from "../schemas/agent.js";
import { ClaudeSdkAgentRuntime } from "./claudeSdkRuntime.js";
import type { ModelClient } from "./modelAdapter.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { UserIdentity } from "../auth/identity.js";
import type { ConversationStore } from "../conversation/store.js";

export class AgentOrchestrator {
  private readonly runtime: ClaudeSdkAgentRuntime;

  constructor(modelClient: ModelClient, registry: ToolRegistry) {
    this.runtime = new ClaudeSdkAgentRuntime(modelClient, registry);
  }

  async chat(
    request: ChatRequest,
    identity?: UserIdentity,
    conversationStore?: ConversationStore,
  ): Promise<ChatResponse> {
    return this.runtime.run(request, identity, conversationStore);
  }
}
