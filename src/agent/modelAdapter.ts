import type { ChatRequest } from "../schemas/agent.js";
import type { ToolRegistry } from "../tools/registry.js";

export interface ModelClient {
  complete(request: ChatRequest, registry: ToolRegistry): Promise<string>;
}

export class MockModelClient implements ModelClient {
  async complete(request: ChatRequest, registry: ToolRegistry): Promise<string> {
    const selected = registry.selectForMessage(request.message);
    const toolNames = selected.length > 0 ? selected : registry.names().slice(0, 5);
    const summaries: string[] = [];

    for (const toolName of toolNames) {
      const result = await registry.run(toolName);
      summaries.push(`${toolName}: ${result.summary}`);
    }

    return [
      "Mock local OpenAI-compatible AIOps response.",
      "I correlated read-only AWS platform signals across the simulated accounts.",
      ...summaries,
    ].join(" ");
  }
}

export class OpenAICompatibleChatAdapter implements ModelClient {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey?: string,
    private readonly providerName = "local OpenAI-compatible model",
  ) {}

  async complete(request: ChatRequest, registry: ToolRegistry): Promise<string> {
    const selected = registry.selectForMessage(request.message);
    const toolNames = selected.length > 0 ? selected : registry.names().slice(0, 5);
    const toolContext = [];

    for (const toolName of toolNames) {
      const result = await registry.run(toolName);
      toolContext.push({
        tool: toolName,
        summary: result.summary,
        data: result.data,
      });
    }

    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are a read-only AWS AIOps Platform Agent. Use supplied tool context to diagnose, summarize impact, recommend safe next steps, and never claim to mutate AWS resources.",
          },
          {
            role: "user",
            content: `User request: ${request.message}\n\nRead-only tool context: ${JSON.stringify(toolContext)}`,
          },
        ],
        thinking: { type: "disabled" },
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`${this.providerName} request failed with status ${response.status}.`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`${this.providerName} response did not include message content.`);
    }
    return content;
  }
}

export class MiniMaxChatCompletionsAdapter extends OpenAICompatibleChatAdapter {
  constructor(
    apiKey: string,
    baseUrl = "https://api.minimax.io",
    model = "MiniMax-M3",
  ) {
    super(baseUrl, model, apiKey, "MiniMax");
  }
}

export class LocalOpenAICompatibleAdapter extends OpenAICompatibleChatAdapter {
  constructor(
    baseUrl = "http://127.0.0.1:11434",
    model = "qwen2.5",
    apiKey?: string,
  ) {
    super(baseUrl, model, apiKey, "local OpenAI-compatible model");
  }
}

export function getModelClient(): ModelClient {
  const provider = process.env.MODEL_PROVIDER ?? "local";
  if (provider === "local") {
    return new LocalOpenAICompatibleAdapter(
      process.env.LOCAL_MODEL_BASE_URL ?? "http://127.0.0.1:11434",
      process.env.LOCAL_MODEL_NAME ?? "qwen2.5",
      process.env.LOCAL_MODEL_API_KEY,
    );
  }

  if (provider === "minimax" && process.env.MINIMAX_API_KEY) {
    return new MiniMaxChatCompletionsAdapter(
      process.env.MINIMAX_API_KEY,
      process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io",
      process.env.MINIMAX_MODEL ?? "MiniMax-M3",
    );
  }

  return new MockModelClient();
}
