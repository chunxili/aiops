import type { AuditEvent, ChangePlan } from "./types.js";

export class ChangeNotFoundError extends Error {}

export class DeliveryStore {
  private readonly changes = new Map<string, ChangePlan>();
  private readonly auditEvents: AuditEvent[] = [];

  create(change: ChangePlan): ChangePlan {
    this.changes.set(change.id, change);
    this.auditEvents.push({
      changeId: change.id,
      event: "created",
      actor: change.requestedBy,
      timestamp: change.createdAt,
      details: {
        title: change.title,
        environment: change.environment,
        actionCount: change.actions.length,
      },
    });
    return change;
  }

  get(changeId: string): ChangePlan {
    const change = this.changes.get(changeId);
    if (!change) {
      throw new ChangeNotFoundError(`Change '${changeId}' was not found.`);
    }
    return change;
  }

  update(change: ChangePlan, auditEvent: AuditEvent): ChangePlan {
    this.changes.set(change.id, change);
    this.auditEvents.push(auditEvent);
    return change;
  }

  audit(changeId: string): AuditEvent[] {
    this.get(changeId);
    return this.auditEvents.filter((event) => event.changeId === changeId);
  }
}

export const deliveryStore = new DeliveryStore();
