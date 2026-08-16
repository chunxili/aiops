import express from "express";
import { getModelClient } from "../agent/modelAdapter.js";
import { AgentOrchestrator } from "../agent/orchestrator.js";
import { getAwsProvider } from "../integrations/aws/provider.js";
import { chatRequestSchema } from "../schemas/agent.js";
import { isReadOnlyViolation, ToolRegistry, UnknownToolError } from "../tools/registry.js";

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
      const registry = new ToolRegistry(getAwsProvider());
      const orchestrator = new AgentOrchestrator(getModelClient(), registry);
      res.json(await orchestrator.chat(request));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tools/:toolName", async (req, res, next) => {
    try {
      const registry = new ToolRegistry(getAwsProvider());
      res.json(await registry.run(req.params.toolName));
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (isReadOnlyViolation(error)) {
      res.status(403).json({ detail: error.message });
      return;
    }
    if (error instanceof UnknownToolError) {
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
