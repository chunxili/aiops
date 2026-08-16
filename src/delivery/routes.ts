import type express from "express";
import { z } from "zod";
import {
  approveChangeRequestSchema,
  createChangeRequestSchema,
  DeliveryService,
  escalateChangeRequestSchema,
  executeChangeRequestSchema,
  verifyChangeRequestSchema,
} from "./service.js";
import { DeliveryGuardError } from "./guards.js";
import { ChangeNotFoundError } from "./store.js";

const service = new DeliveryService();

export function registerDeliveryRoutes(app: express.Express): void {
  app.post("/api/delivery/changes", (req, res, next) => {
    try {
      const input = createChangeRequestSchema.parse(req.body);
      res.status(201).json(service.create(input));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/delivery/changes/:changeId", (req, res, next) => {
    try {
      res.json(service.get(req.params.changeId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/delivery/changes/:changeId/approve", (req, res, next) => {
    try {
      const input = approveChangeRequestSchema.parse(req.body);
      res.json(service.approve(req.params.changeId, input.approvedBy));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/delivery/changes/:changeId/execute", async (req, res, next) => {
    try {
      const input = executeChangeRequestSchema.parse(req.body);
      res.json(await service.execute(req.params.changeId, input.actor, input.idempotencyKey));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/delivery/changes/:changeId/verify", async (req, res, next) => {
    try {
      const input = verifyChangeRequestSchema.parse(req.body);
      res.json(await service.verify(req.params.changeId, input.actor));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/delivery/changes/:changeId/escalate", (req, res, next) => {
    try {
      const input = escalateChangeRequestSchema.parse(req.body);
      res.json(service.escalate(req.params.changeId, input.actor, input.escalatedTo, input.reason));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/delivery/changes/:changeId/audit", (req, res, next) => {
    try {
      res.json({ events: service.audit(req.params.changeId) });
    } catch (error) {
      next(error);
    }
  });
}

export function mapDeliveryError(error: unknown, res: express.Response): boolean {
  if (error instanceof DeliveryGuardError) {
    res.status(409).json({ detail: error.message });
    return true;
  }
  if (error instanceof ChangeNotFoundError) {
    res.status(404).json({ detail: error.message });
    return true;
  }
  if (error instanceof z.ZodError) {
    res.status(422).json({ detail: error.message });
    return true;
  }
  return false;
}
