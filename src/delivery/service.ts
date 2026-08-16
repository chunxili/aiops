import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertCanApprove, assertCanExecute } from "./guards.js";
import { DeliveryExecutor } from "./executor.js";
import { deliveryStore, type DeliveryStore } from "./store.js";
import type { ChangePlan } from "./types.js";

export const createChangeRequestSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  environment: z.enum(["dev", "staging", "prod"]),
  requestedBy: z.string().min(1),
  actions: z
    .array(
      z.object({
        type: z.enum([
          "create_ticket",
          "trigger_pipeline",
          "rollback_release",
          "scale_service",
          "update_waf_blacklist",
        ]),
        target: z.string().min(1),
        parameters: z.record(z.unknown()).default({}),
      }),
    )
    .min(1),
  evidence: z.array(z.string()).default([]),
  idempotencyKey: z.string().min(1).optional(),
  rollbackPlan: z.string().min(1),
});

export const approveChangeRequestSchema = z.object({
  approvedBy: z.string().min(1),
});

export const executeChangeRequestSchema = z.object({
  actor: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export class DeliveryService {
  constructor(
    private readonly store: DeliveryStore = deliveryStore,
    private readonly executor: DeliveryExecutor = new DeliveryExecutor(),
  ) {}

  create(input: z.infer<typeof createChangeRequestSchema>): ChangePlan {
    const now = new Date().toISOString();
    return this.store.create({
      id: randomUUID(),
      title: input.title,
      summary: input.summary,
      environment: input.environment,
      requestedBy: input.requestedBy,
      status: "planned",
      actions: input.actions,
      evidence: input.evidence,
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
      rollbackPlan: input.rollbackPlan,
      createdAt: now,
    });
  }

  approve(changeId: string, approvedBy: string): ChangePlan {
    const change = this.store.get(changeId);
    assertCanApprove(change, approvedBy);
    const approved = {
      ...change,
      status: "approved" as const,
      approvedBy,
      approvedAt: new Date().toISOString(),
    };

    return this.store.update(approved, {
      changeId,
      event: "approved",
      actor: approvedBy,
      timestamp: approved.approvedAt,
      details: { environment: approved.environment },
    });
  }

  async execute(changeId: string, actor: string, idempotencyKey: string): Promise<ChangePlan> {
    const change = this.store.get(changeId);
    assertCanExecute(change, idempotencyKey);
    const executionResult = await this.executor.execute(change);
    const executedAt = new Date().toISOString();
    const executed = {
      ...change,
      status: "executed" as const,
      executedAt,
      executionResult,
    };

    return this.store.update(executed, {
      changeId,
      event: "executed",
      actor,
      timestamp: executedAt,
      details: executionResult,
    });
  }

  get(changeId: string): ChangePlan {
    return this.store.get(changeId);
  }

  audit(changeId: string) {
    return this.store.audit(changeId);
  }
}
