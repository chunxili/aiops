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
      "Mock MiniMax AIOps response.",
      "I correlated read-only AWS platform signals across the simulated accounts.",
      ...summaries,
    ].join(" ");
  }
}

export class MiniMaxChatCompletionsAdapter implements ModelClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.minimax.io",
    private readonly model = "MiniMax-M3",
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
        Authorization: `Bearer ${this.apiKey}`,
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
      throw new Error(`MiniMax request failed with status ${response.status}.`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("MiniMax response did not include message content.");
    }
    return content;
  }
}

export function getModelClient(): ModelClient {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (apiKey) {
    return new MiniMaxChatCompletionsAdapter(
      apiKey,
      process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io",
      process.env.MINIMAX_MODEL ?? "MiniMax-M3",
    );
  }
  return new MockModelClient();
}
