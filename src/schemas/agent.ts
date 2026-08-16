import { z } from "zod";

export const chatRequestSchema = z.object({
  message: z.string().min(1),
  session_id: z.string().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ToolCall = {
  name: string;
  result: ToolResult;
  phase?: string;
  reason?: string;
};

export type AnalysisStep = {
  phase: string;
  tools: string[];
  reason: string;
};

export type ToolPlanStep = {
  phase: string;
  tools: string[];
  reason: string;
};

export type AnalysisFinding = {
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  evidence: string[];
};

export type SelfHealingProposal = {
  title: string;
  summary: string;
  actionType: "create_ticket" | "trigger_pipeline" | "rollback_release" | "scale_service";
  target: string;
  parameters: Record<string, unknown>;
  rollbackPlan: string;
  requiresApproval: true;
};

export type ChatResponse = {
  answer: string;
  tool_calls: ToolCall[];
  analysis_plan?: AnalysisStep[];
  findings?: AnalysisFinding[];
  self_healing_proposals?: SelfHealingProposal[];
};

export type ToolCategory = "Alert" | "FinOps" | "EKS" | "Resource" | "Log" | "AIOps";

export type ToolResult = {
  tool: string;
  category: ToolCategory;
  readonly: true;
  summary: string;
  data: Record<string, unknown>;
};
