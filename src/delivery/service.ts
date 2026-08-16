import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertCanApprove, assertCanExecute, DeliveryGuardError } from "./guards.js";
import { DeliveryExecutor } from "./executor.js";
import { deliveryStore, type DeliveryStore } from "./store.js";
import { DeliveryVerifier } from "./verifier.js";
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

export const verifyChangeRequestSchema = z.object({
  actor: z.string().min(1),
});

export const escalateChangeRequestSchema = z.object({
  actor: z.string().min(1),
  escalatedTo: z.string().min(1),
  reason: z.string().min(1),
});

export class DeliveryService {
  constructor(
    private readonly store: DeliveryStore = deliveryStore,
    private readonly executor: DeliveryExecutor = new DeliveryExecutor(),
    private readonly verifier: DeliveryVerifier = new DeliveryVerifier(),
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

  async verify(changeId: string, actor: string): Promise<ChangePlan> {
    const change = this.store.get(changeId);
    if (change.status !== "executed") {
      throw new DeliveryGuardError("Change must be executed before post-change verification.");
    }

    const verificationResult = await this.verifier.verify(change);
    const verifiedAt = new Date().toISOString();
    const verified = {
      ...change,
      status: verificationResult.status === "passed" ? ("succeeded" as const) : ("rollback_required" as const),
      verifiedAt,
      verificationResult,
    };

    return this.store.update(verified, {
      changeId,
      event: verificationResult.status === "passed" ? "verified" : "rollback_required",
      actor,
      timestamp: verifiedAt,
      details: verificationResult,
    });
  }

  escalate(changeId: string, actor: string, escalatedTo: string, reason: string): ChangePlan {
    const change = this.store.get(changeId);
    if (!["executed", "rollback_required"].includes(change.status)) {
      throw new DeliveryGuardError("Only executed or rollback-required changes can be escalated.");
    }

    const escalatedAt = new Date().toISOString();
    const escalated = {
      ...change,
      status: "escalated" as const,
      escalatedAt,
      escalatedTo,
    };

    return this.store.update(escalated, {
      changeId,
      event: "escalated",
      actor,
      timestamp: escalatedAt,
      details: { escalatedTo, reason },
    });
  }

  get(changeId: string): ChangePlan {
    return this.store.get(changeId);
  }

  audit(changeId: string) {
    return this.store.audit(changeId);
  }
}
