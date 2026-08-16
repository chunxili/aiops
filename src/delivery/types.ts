export type ChangeStatus = "planned" | "approved" | "executed" | "rejected";

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
};

export type AuditEvent = {
  changeId: string;
  event: "created" | "approved" | "rejected" | "executed";
  actor: string;
  timestamp: string;
  details: Record<string, unknown>;
};
