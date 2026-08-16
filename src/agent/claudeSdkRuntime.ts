import type { ChatRequest, ChatResponse, ToolCall } from "../schemas/agent.js";
import type { ToolRegistry } from "../tools/registry.js";
import { AnalysisPlanner } from "./analysisPlanner.js";
import type { ModelClient } from "./modelAdapter.js";

export class ClaudeSdkAgentRuntime {
  constructor(
    private readonly modelClient: ModelClient,
    private readonly registry: ToolRegistry,
  ) {}

  async run(request: ChatRequest): Promise<ChatResponse> {
    const planner = new AnalysisPlanner(this.registry, this.modelClient);
    const analysis = await planner.run(request.message);

    const answer = await this.modelClient.complete(request, this.registry);
    return {
      answer,
      tool_calls: analysis.toolCalls,
      analysis_plan: analysis.steps,
      findings: analysis.findings,
      self_healing_proposals: analysis.selfHealingProposals,
    };
  }
}
