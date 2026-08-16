import { randomUUID } from "node:crypto";
import type { AnalysisFinding, AnalysisStep, ToolCall } from "../schemas/agent.js";
import type { UserIdentity } from "../auth/identity.js";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

export type ClarificationState = {
  question: string;
  originalMessage: string;
  missingFields: string[];
};

export type Conversation = {
  id: string;
  userId: string;
  title: string;
  messages: ConversationMessage[];
  toolCalls: ToolCall[];
  findings: AnalysisFinding[];
  analysisPlan: AnalysisStep[];
  clarification?: ClarificationState;
  deliveryChangeIds: string[];
  createdAt: string;
  updatedAt: string;
};

export class ConversationAccessError extends Error {}
export class ConversationNotFoundError extends Error {}

export class ConversationStore {
  private readonly conversations = new Map<string, Conversation>();

  getOrCreate(identity: UserIdentity, conversationId?: string): Conversation {
    if (conversationId) {
      const existing = this.conversations.get(conversationId);
      if (!existing) {
        throw new ConversationNotFoundError(`Conversation '${conversationId}' was not found.`);
      }
      if (existing.userId !== identity.userId) {
        throw new ConversationAccessError("Conversation does not belong to the current user.");
      }
      return existing;
    }

    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: randomUUID(),
      userId: identity.userId,
      title: "AIOps conversation",
      messages: [],
      toolCalls: [],
      findings: [],
      analysisPlan: [],
      deliveryChangeIds: [],
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  getForUser(identity: UserIdentity, conversationId: string): Conversation {
    return this.getOrCreate(identity, conversationId);
  }

  appendUserMessage(conversation: Conversation, content: string): Conversation {
    conversation.messages.push({ role: "user", content, timestamp: new Date().toISOString() });
    conversation.updatedAt = new Date().toISOString();
    return conversation;
  }

  appendAssistantMessage(conversation: Conversation, content: string): Conversation {
    conversation.messages.push({ role: "assistant", content, timestamp: new Date().toISOString() });
    conversation.updatedAt = new Date().toISOString();
    return conversation;
  }

  saveAnalysis(
    conversation: Conversation,
    analysisPlan: AnalysisStep[],
    toolCalls: ToolCall[],
    findings: AnalysisFinding[],
  ): Conversation {
    conversation.analysisPlan = analysisPlan;
    conversation.toolCalls.push(...toolCalls);
    conversation.findings.push(...findings);
    conversation.clarification = undefined;
    conversation.updatedAt = new Date().toISOString();
    return conversation;
  }

  saveClarification(conversation: Conversation, clarification: ClarificationState): Conversation {
    conversation.clarification = clarification;
    conversation.updatedAt = new Date().toISOString();
    return conversation;
  }

  addDeliveryChange(conversation: Conversation, changeId: string): Conversation {
    conversation.deliveryChangeIds.push(changeId);
    conversation.clarification = undefined;
    conversation.updatedAt = new Date().toISOString();
    return conversation;
  }

  listForUser(identity: UserIdentity): Conversation[] {
    return [...this.conversations.values()].filter((conversation) => conversation.userId === identity.userId);
  }
}

export const conversationStore = new ConversationStore();
