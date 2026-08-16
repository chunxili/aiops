import express from "express";
import { getModelClient } from "../agent/modelAdapter.js";
import { AgentOrchestrator } from "../agent/orchestrator.js";
import { extractIdentity } from "../auth/identity.js";
import { ConversationAccessError, ConversationNotFoundError, conversationStore } from "../conversation/store.js";
import { demoScenarios, getDemoScenario } from "../demo/scenarios.js";
import { mapDeliveryError, registerDeliveryRoutes } from "../delivery/routes.js";
import { getAwsProvider } from "../integrations/aws/provider.js";
import { chatRequestSchema } from "../schemas/agent.js";
import { isReadOnlyViolation, ToolPermissionError, ToolRegistry, UnknownToolError } from "../tools/registry.js";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.json({
      service: "aws-platform-aiops-agent",
      status: "ok",
      entrypoint: "/api/agent/chat",
      docs: "OpenAPI docs can be added by the host TypeScript platform.",
    });
  });

  app.post("/api/agent/chat", async (req, res, next) => {
    try {
      const request = chatRequestSchema.parse(req.body);
      const identity = extractIdentity(req);
      const registry = new ToolRegistry(getAwsProvider(), identity.modulePermissions);
      const orchestrator = new AgentOrchestrator(getModelClient(), registry);
      res.json(await orchestrator.chat(request, identity, conversationStore));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/agent/conversations", (req, res) => {
    const identity = extractIdentity(req);
    res.json({
      conversations: conversationStore.listForUser(identity).map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        messageCount: conversation.messages.length,
        deliveryChangeCount: conversation.deliveryChangeIds.length,
        updatedAt: conversation.updatedAt,
      })),
    });
  });

  app.get("/api/agent/conversations/:conversationId", (req, res, next) => {
    try {
      const identity = extractIdentity(req);
      const conversation = conversationStore.getForUser(identity, req.params.conversationId);
      res.json({
        id: conversation.id,
        title: conversation.title,
        messages: conversation.messages,
        toolCalls: conversation.toolCalls,
        findings: conversation.findings,
        analysisPlan: conversation.analysisPlan,
        deliveryChangeIds: conversation.deliveryChangeIds,
        updatedAt: conversation.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tools/:toolName", async (req, res, next) => {
    try {
      const identity = extractIdentity(req);
      const registry = new ToolRegistry(getAwsProvider(), identity.modulePermissions);
      res.json(await registry.run(req.params.toolName));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/demo/scenarios", (_req, res) => {
    res.json({ scenarios: demoScenarios });
  });

  app.get("/api/demo/scenarios/:scenarioId", (req, res) => {
    const scenario = getDemoScenario(req.params.scenarioId);
    if (!scenario) {
      res.status(404).json({ detail: `Demo scenario '${req.params.scenarioId}' was not found.` });
      return;
    }
    res.json(scenario);
  });

  registerDeliveryRoutes(app);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (mapDeliveryError(error, res)) {
      return;
    }
    if (isReadOnlyViolation(error)) {
      res.status(403).json({ detail: error.message });
      return;
    }
    if (error instanceof UnknownToolError) {
      res.status(404).json({ detail: error.message });
      return;
    }
    if (error instanceof ToolPermissionError) {
      res.status(403).json({ detail: error.message });
      return;
    }
    if (error instanceof ConversationAccessError) {
      res.status(403).json({ detail: error.message });
      return;
    }
    if (error instanceof ConversationNotFoundError) {
      res.status(404).json({ detail: error.message });
      return;
    }
    if (error instanceof Error && error.name === "ZodError") {
      res.status(422).json({ detail: error.message });
      return;
    }
    res.status(500).json({ detail: error instanceof Error ? error.message : "Unexpected error" });
  });

  return app;
}
