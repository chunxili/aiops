import type { ChangePlan, VerificationResult } from "./types.js";

export type VerificationCheck = VerificationResult["checks"][number];

export interface VerificationChecker {
  name: string;
  check(change: ChangePlan): Promise<VerificationCheck>;
}

export class MockAlertRecoveryChecker implements VerificationChecker {
  readonly name = "post-change-alerts";

  async check(change: ChangePlan): Promise<VerificationCheck> {
    const failed = hasForcedFailure(change);
    return {
      name: this.name,
      passed: !failed,
      detail: failed ? "Mock alert recovery check still detects active alerts." : "Mock alert recovery check is clear.",
    };
  }
}

export class MockLogErrorRateChecker implements VerificationChecker {
  readonly name = "post-change-logs";

  async check(change: ChangePlan): Promise<VerificationCheck> {
    const failed = hasForcedFailure(change);
    return {
      name: this.name,
      passed: !failed,
      detail: failed ? "Mock log error-rate check still detects elevated 5xx errors." : "Mock log error-rate check is clear.",
    };
  }
}

export class MockRuntimeHealthChecker implements VerificationChecker {
  readonly name = "post-change-runtime";

  async check(change: ChangePlan): Promise<VerificationCheck> {
    const failed = hasForcedFailure(change);
    return {
      name: this.name,
      passed: !failed,
      detail: failed ? "Mock runtime health check did not observe recovery." : "Mock runtime health check shows service recovery.",
    };
  }
}

export class MockSloChecker implements VerificationChecker {
  readonly name = "post-change-slo";

  async check(change: ChangePlan): Promise<VerificationCheck> {
    const failed = hasForcedFailure(change);
    return {
      name: this.name,
      passed: !failed,
      detail: failed ? "Mock SLO check still shows burn-rate risk." : "Mock SLO check is within the recovery threshold.",
    };
  }
}

export class DeliveryVerifier {
  constructor(private readonly checkers: VerificationChecker[] = createVerificationCheckers()) {}

  async verify(change: ChangePlan): Promise<VerificationResult> {
    const checks = await Promise.all(this.checkers.map((checker) => checker.check(change)));
    const passed = checks.every((check) => check.passed);

    return {
      status: passed ? "passed" : "failed",
      summary: passed
        ? "Post-change verification passed across alerts, logs, runtime health, and SLO checks. The change can be closed."
        : "Post-change verification failed. The change requires rollback or human escalation.",
      checks,
      nextAction: passed ? "close_change" : "rollback",
    };
  }
}

export function createVerificationCheckers(source = process.env.VERIFICATION_SOURCE ?? "mock"): VerificationChecker[] {
  if (source !== "mock") {
    return createExternalPlaceholderCheckers(source);
  }
  return [
    new MockAlertRecoveryChecker(),
    new MockLogErrorRateChecker(),
    new MockRuntimeHealthChecker(),
    new MockSloChecker(),
  ];
}

function createExternalPlaceholderCheckers(source: string): VerificationChecker[] {
  return [
    {
      name: "post-change-external-verifier",
      async check(): Promise<VerificationCheck> {
        return {
          name: "post-change-external-verifier",
          passed: false,
          detail: `Verification source '${source}' is configured but no concrete checker implementation is wired yet.`,
        };
      },
    },
  ];
}

function hasForcedFailure(change: ChangePlan): boolean {
  return change.actions.some((action) => action.parameters.forceVerificationFailure === true);
}
