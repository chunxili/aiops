import type { ChangePlan, VerificationResult } from "./types.js";

export class DeliveryVerifier {
  async verify(change: ChangePlan): Promise<VerificationResult> {
    const forced = change.actions.some((action) => action.parameters.forceVerificationFailure === true);
    const checks = [
      {
        name: "post-change-alerts",
        passed: !forced,
        detail: forced ? "Mock post-change alert check still detects active alerts." : "Mock alert check is clear.",
      },
      {
        name: "post-change-logs",
        passed: !forced,
        detail: forced ? "Mock log check still detects elevated 5xx errors." : "Mock log check shows no elevated 5xx errors.",
      },
      {
        name: "post-change-runtime",
        passed: !forced,
        detail: forced ? "Mock runtime check did not observe recovery." : "Mock runtime check shows service recovery.",
      },
    ];
    const passed = checks.every((check) => check.passed);

    return {
      status: passed ? "passed" : "failed",
      summary: passed
        ? "Post-change verification passed. The change can be closed."
        : "Post-change verification failed. The change requires rollback or human escalation.",
      checks,
      nextAction: passed ? "close_change" : "rollback",
    };
  }
}
