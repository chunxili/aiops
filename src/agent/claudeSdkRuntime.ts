import type { ChatRequest, ChatResponse, ToolCall } from "../schemas/agent.js";
import type { UserIdentity } from "../auth/identity.js";
import type { ConversationStore } from "../conversation/store.js";
import { DeliveryService } from "../delivery/service.js";
import type { ToolRegistry } from "../tools/registry.js";
import { AnalysisPlanner } from "./analysisPlanner.js";
import type { ModelClient } from "./modelAdapter.js";

export class ClaudeSdkAgentRuntime {
  constructor(
    private readonly modelClient: ModelClient,
    private readonly registry: ToolRegistry,
  ) {}

  async run(
    request: ChatRequest,
    identity?: UserIdentity,
    conversationStore?: ConversationStore,
  ): Promise<ChatResponse> {
    const user = identity ?? {
      userId: "local-user",
      username: "local-user",
      roles: [],
      groups: [],
      modulePermissions: ["Alert", "FinOps", "EKS", "Resource", "Log", "AIOps", "Delivery"],
    };
    const conversation = conversationStore?.getOrCreate(user, request.conversation_id ?? request.session_id);
    const combinedMessage = combineWithPendingClarification(conversation?.clarification?.originalMessage, request.message);
    conversationStore?.appendUserMessage(conversation!, request.message);

    const clarification = requiredClarification(combinedMessage);
    if (clarification) {
      conversationStore?.saveClarification(conversation!, {
        question: clarification,
        originalMessage: combinedMessage,
        missingFields: ["target"],
      });
      conversationStore?.appendAssistantMessage(conversation!, clarification);
      return {
        answer: clarification,
        conversation_id: conversation?.id,
        needs_clarification: true,
        clarification_question: clarification,
        tool_calls: [],
      };
    }

    const isWriteIntent = hasWriteIntent(combinedMessage);
    if (isWriteIntent && !user.modulePermissions.includes("Delivery")) {
      const answer = "该请求涉及非只读变更操作，但当前用户没有 Delivery 模块权限，无法创建交付变更计划。";
      conversationStore?.appendAssistantMessage(conversation!, answer);
      return {
        answer,
        conversation_id: conversation?.id,
        tool_calls: [],
        analysis_plan: [
          {
            phase: "permission-check",
            tools: [],
            reason: "识别到写操作意图，但用户缺少 Delivery 模块权限。",
          },
        ],
      };
    }

    const deliveryChange = createDeliveryChangeIfNeeded(combinedMessage, user.username);
    if (deliveryChange) {
      conversationStore?.addDeliveryChange(conversation!, deliveryChange.id);
      const answer = `已生成待审批变更计划：${deliveryChange.title}。该操作不会直接执行，必须审批后才能进入执行阶段。`;
      conversationStore?.appendAssistantMessage(conversation!, answer);
      return {
        answer,
        conversation_id: conversation?.id,
        delivery_change_id: deliveryChange.id,
        tool_calls: [],
        analysis_plan: [
          {
            phase: "delivery-planning",
            tools: [],
            reason: "识别到非只读操作，转入变更交付流程而不是直接执行。",
          },
        ],
      };
    }

    const planner = new AnalysisPlanner(this.registry, this.modelClient);
    const analysis = await planner.run(combinedMessage);

    const answer = await this.modelClient.complete({ ...request, message: combinedMessage }, this.registry);
    conversationStore?.saveAnalysis(conversation!, analysis.steps, analysis.toolCalls, analysis.findings);
    conversationStore?.appendAssistantMessage(conversation!, answer);
    return {
      answer,
      conversation_id: conversation?.id,
      tool_calls: analysis.toolCalls,
      analysis_plan: analysis.steps,
      findings: analysis.findings,
      self_healing_proposals: analysis.selfHealingProposals,
    };
  }
}

function combineWithPendingClarification(originalMessage: string | undefined, message: string): string {
  return originalMessage ? `${originalMessage}\n用户补充：${message}` : message;
}

function requiredClarification(message: string): string | undefined {
  const text = message.toLowerCase();
  const writeIntent = hasWriteIntent(message);
  if (!writeIntent) {
    return undefined;
  }

  const hasTarget = /\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(message) || hasAny(text, ["platform-prod", "platform-staging", "api"]);
  if (!hasTarget) {
    return "这个操作涉及变更。请补充目标对象，例如要加入 WAF 黑名单的 IP、服务名、环境，以及变更原因。";
  }
  return undefined;
}

function createDeliveryChangeIfNeeded(message: string, requestedBy: string) {
  const text = message.toLowerCase();
  if (!hasWriteIntent(message)) {
    return undefined;
  }

  const ip = message.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/)?.[0];
  const service = text.includes("platform-staging") ? "platform-staging/api" : "platform-prod/api";
  const delivery = new DeliveryService();

  if (hasAny(text, ["黑名单", "blacklist", "blocklist", "拉黑", "waf"])) {
    return delivery.create({
      title: "更新 WAF 黑名单",
      summary: `根据用户请求生成 WAF 黑名单变更计划，目标 IP：${ip ?? "待确认"}。`,
      environment: text.includes("staging") ? "staging" : "prod",
      requestedBy,
      actions: [
        {
          type: "update_waf_blacklist",
          target: "aws-waf/default-web-acl",
          parameters: { ip },
        },
      ],
      evidence: [],
      idempotencyKey: `waf-blacklist-${ip ?? Date.now()}`,
      rollbackPlan: "如误封或业务异常，从 WAF 黑名单移除该 IP 并通知安全和业务 owner。",
    });
  }

  if (hasAny(text, ["扩容", "scale"])) {
    return delivery.create({
      title: "服务扩容变更计划",
      summary: "根据用户请求生成服务扩容变更计划。",
      environment: text.includes("staging") ? "staging" : "prod",
      requestedBy,
      actions: [{ type: "scale_service", target: service, parameters: { replicas: 6 } }],
      evidence: ["query_cluster_status", "query_logs"],
      idempotencyKey: `scale-${service}-${Date.now()}`,
      rollbackPlan: "如果扩容后错误率未下降或资源异常，恢复原副本数并升级给服务 owner。",
    });
  }

  return delivery.create({
    title: "回滚变更计划",
    summary: "根据用户请求生成回滚变更计划。",
    environment: text.includes("staging") ? "staging" : "prod",
    requestedBy,
    actions: [{ type: "rollback_release", target: service, parameters: {} }],
    evidence: ["query_logs", "query_incident_diagnosis"],
    idempotencyKey: `rollback-${service}-${Date.now()}`,
    rollbackPlan: "回滚失败时暂停发布流水线并升级给发布 owner。",
  });
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function hasWriteIntent(message: string): boolean {
  const text = message.toLowerCase();
  return hasAny(text, ["黑名单", "blacklist", "blocklist", "拉黑", "waf", "扩容", "scale", "回滚", "rollback"]);
}
