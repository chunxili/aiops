import type { ChangePlan } from "./types.js";

export class DeliveryGuardError extends Error {}

export function assertCanApprove(change: ChangePlan, actor: string): void {
  if (change.status !== "planned") {
    throw new DeliveryGuardError(`Change '${change.id}' is not waiting for approval.`);
  }
  if (actor === change.requestedBy) {
    throw new DeliveryGuardError("Requester cannot approve their own change.");
  }
}

export function assertCanExecute(change: ChangePlan, idempotencyKey: string): void {
  if (change.status !== "approved") {
    throw new DeliveryGuardError(`Change '${change.id}' must be approved before execution.`);
  }
  if (change.idempotencyKey !== idempotencyKey) {
    throw new DeliveryGuardError("Idempotency key does not match the approved change.");
  }
  if (change.environment === "prod" && !change.approvedBy) {
    throw new DeliveryGuardError("Production changes require an approver.");
  }
}
