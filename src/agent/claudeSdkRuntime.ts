import type { ChatRequest, ChatResponse, ToolCall } from "../schemas/agent.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ModelClient } from "./modelAdapter.js";

export class ClaudeSdkAgentRuntime {
  constructor(
    private readonly modelClient: ModelClient,
    private readonly registry: ToolRegistry,
  ) {}

  async run(request: ChatRequest): Promise<ChatResponse> {
    const selected = this.registry.selectForMessage(request.message);
    const toolNames = selected.length > 0 ? selected : this.registry.names().slice(0, 5);
    const toolCalls: ToolCall[] = [];

    for (const toolName of toolNames) {
      const result = await this.registry.run(toolName);
      toolCalls.push({ name: toolName, result });
    }

    const answer = await this.modelClient.complete(request, this.registry);
    return {
      answer,
      tool_calls: toolCalls,
    };
  }
}
