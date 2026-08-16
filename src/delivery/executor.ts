import type { ChangePlan } from "./types.js";

export class DeliveryExecutor {
  async execute(change: ChangePlan): Promise<Record<string, unknown>> {
    return {
      mode: "mock",
      message: "Mock delivery execution completed. No real infrastructure was changed.",
      actions: change.actions.map((action, index) => ({
        sequence: index + 1,
        type: action.type,
        target: action.target,
        status: "mock_executed",
      })),
      rollbackPlan: change.rollbackPlan,
    };
  }
}
