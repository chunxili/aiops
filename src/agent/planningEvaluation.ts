import type { AnalysisStep } from "../schemas/agent.js";

export type PlanningEvalCase = {
  name: string;
  message: string;
  expectedTools: string[];
  minRecall?: number;
};

export type PlanningEvalResult = {
  name: string;
  passed: boolean;
  expectedTools: string[];
  actualTools: string[];
  missingTools: string[];
  recall: number;
};

export function evaluatePlanningCases(
  cases: PlanningEvalCase[],
  plans: Map<string, AnalysisStep[]>,
): PlanningEvalResult[] {
  return cases.map((item) => {
    const steps = plans.get(item.name) ?? [];
    const actualTools = unique(steps.flatMap((step) => step.tools));
    const missingTools = item.expectedTools.filter((tool) => !actualTools.includes(tool));
    const recall = item.expectedTools.length === 0 ? 1 : (item.expectedTools.length - missingTools.length) / item.expectedTools.length;
    return {
      name: item.name,
      passed: recall >= (item.minRecall ?? 1),
      expectedTools: item.expectedTools,
      actualTools,
      missingTools,
      recall: Number(recall.toFixed(2)),
    };
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
