export type ChangeStatus =
  | "planned"
  | "approved"
  | "executed"
  | "succeeded"
  | "rollback_required"
  | "escalated"
  | "rejected";

export type DeliveryActionType =
  | "create_ticket"
  | "trigger_pipeline"
  | "rollback_release"
  | "scale_service"
  | "update_waf_blacklist";

export type DeliveryAction = {
  type: DeliveryActionType;
  target: string;
  parameters: Record<string, unknown>;
};

export type ChangePlan = {
  id: string;
  title: string;
  summary: string;
  environment: "dev" | "staging" | "prod";
  requestedBy: string;
  status: ChangeStatus;
  actions: DeliveryAction[];
  evidence: string[];
  idempotencyKey: string;
  rollbackPlan: string;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  executedAt?: string;
  executionResult?: Record<string, unknown>;
  verifiedAt?: string;
  verificationResult?: VerificationResult;
  escalatedAt?: string;
  escalatedTo?: string;
};

export type VerificationResult = {
  status: "passed" | "failed";
  summary: string;
  checks: Array<{
    name: string;
    passed: boolean;
    detail: string;
  }>;
  nextAction: "close_change" | "rollback" | "escalate";
};

export type AuditEvent = {
  changeId: string;
  event: "created" | "approved" | "rejected" | "executed" | "verified" | "rollback_required" | "escalated";
  actor: string;
  timestamp: string;
  details: Record<string, unknown>;
};
