import { z } from "zod";

export const chatRequestSchema = z.object({
  message: z.string().min(1),
  session_id: z.string().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ToolCall = {
  name: string;
  result: ToolResult;
};

export type ChatResponse = {
  answer: string;
  tool_calls: ToolCall[];
};

export type ToolCategory = "Alert" | "FinOps" | "EKS" | "Resource" | "Log" | "AIOps";

export type ToolResult = {
  tool: string;
  category: ToolCategory;
  readonly: true;
  summary: string;
  data: Record<string, unknown>;
};
