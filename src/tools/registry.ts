import type { AwsProvider } from "../integrations/aws/provider.js";
import type { ToolResult } from "../schemas/agent.js";
import { assertReadOnlyTool, ReadOnlyViolation } from "./guard.js";
import { toolDefinitions, type ToolDefinition, type ToolFunction, type ToolManifest } from "./definitions.js";

export class UnknownToolError extends Error {}
export class ToolPermissionError extends Error {}

export class ToolRegistry {
  private readonly tools: Record<string, ToolFunction>;

  constructor(
    private readonly provider: AwsProvider,
    private readonly allowedCategories?: string[],
    private readonly definitions: ToolDefinition[] = toolDefinitions,
  ) {
    this.tools = Object.fromEntries(this.definitions.map((definition) => [definition.manifest.name, definition.handler]));

    for (const name of this.names()) {
      assertReadOnlyTool(name);
    }
  }

  names(): string[] {
    const allowed = new Set(this.manifests().map((manifest) => manifest.name));
    return Object.keys(this.tools).filter((name) => allowed.has(name));
  }

  manifests(): ToolManifest[] {
    const manifests = this.definitions.map((definition) => definition.manifest);
    if (!this.allowedCategories || this.allowedCategories.length === 0) {
      return manifests;
    }
    const allowed = new Set(this.allowedCategories);
    return manifests.filter((manifest) => allowed.has(manifest.category));
  }

  selectForMessage(message: string): string[] {
    const text = message.toLowerCase();
    const allowed = new Set(this.names());
    return this.definitions
      .filter((definition) => allowed.has(definition.manifest.name))
      .filter((definition) => definition.keywords.some((keyword) => text.includes(keyword)))
      .map((definition) => definition.manifest.name);
  }

  async run(name: string): Promise<ToolResult> {
    assertReadOnlyTool(name);
    const tool = this.tools[name];
    if (!tool) {
      throw new UnknownToolError(`Unknown tool '${name}'.`);
    }
    if (!this.names().includes(name)) {
      throw new ToolPermissionError(`Tool '${name}' is not allowed for the current user.`);
    }
    return tool(this.provider);
  }
}

export function isReadOnlyViolation(error: unknown): error is ReadOnlyViolation {
  return error instanceof ReadOnlyViolation;
}
