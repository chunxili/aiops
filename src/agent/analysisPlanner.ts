import type {
  AnalysisFinding,
  AnalysisStep,
  SelfHealingProposal,
  ToolCall,
} from "../schemas/agent.js";
import type { ToolRegistry } from "../tools/registry.js";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { ModelClient } from "./modelAdapter.js";
import { serviceCatalog, type ServiceResolution } from "../catalog/serviceCatalog.js";

export type AnalysisPlanResult = {
  steps: AnalysisStep[];
  toolCalls: ToolCall[];
  findings: AnalysisFinding[];
  selfHealingProposals: SelfHealingProposal[];
  serviceResolution?: ServiceResolution;
};

export class AnalysisPlanner {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly modelClient?: ModelClient,
  ) {}

  async run(message: string): Promise<AnalysisPlanResult> {
    const graph = this.buildGraph();
    const result = await graph.invoke({
      message,
      steps: [],
      toolCalls: [],
      findings: [],
      selfHealingProposals: [],
    });

    return {
      steps: result.steps,
      toolCalls: result.toolCalls,
      findings: result.findings,
      selfHealingProposals: result.selfHealingProposals,
      serviceResolution: result.serviceResolution,
    };
  }

  private buildGraph() {
    const GraphState = Annotation.Root({
      message: Annotation<string>(),
      steps: Annotation<AnalysisStep[]>(),
      toolCalls: Annotation<ToolCall[]>(),
      findings: Annotation<AnalysisFinding[]>(),
      selfHealingProposals: Annotation<SelfHealingProposal[]>(),
      serviceResolution: Annotation<ServiceResolution | undefined>(),
    });

    const resolveContextNode = async (state: typeof GraphState.State) => ({
      serviceResolution: await serviceCatalog.resolve(state.message),
    });

    const planNode = async (state: typeof GraphState.State) => ({
      steps: await this.plan(state.message, state.serviceResolution),
    });

    const executeNode = async (state: typeof GraphState.State) => ({
      toolCalls: await this.executeSteps(state.steps),
    });

    const findingsNode = (state: typeof GraphState.State) => ({
      findings: this.deriveFindings(state.toolCalls, state.serviceResolution),
    });

    const selfHealingNode = (state: typeof GraphState.State) => ({
      selfHealingProposals: this.proposeSelfHealing(state.findings),
    });

    return new StateGraph(GraphState)
      .addNode("plan_intent", planNode)
      .addNode("resolve_service_context", resolveContextNode)
      .addNode("execute_tools", executeNode)
      .addNode("derive_findings", findingsNode)
      .addNode("propose_self_healing", selfHealingNode)
      .addEdge(START, "resolve_service_context")
      .addEdge("resolve_service_context", "plan_intent")
      .addEdge("plan_intent", "execute_tools")
      .addEdge("execute_tools", "derive_findings")
      .addEdge("derive_findings", "propose_self_healing")
      .addEdge("propose_self_healing", END)
      .compile();
  }

  private async executeSteps(steps: AnalysisStep[]): Promise<ToolCall[]> {
    const toolCalls: ToolCall[] = [];

    for (const step of steps) {
      for (const toolName of step.tools) {
        if (toolCalls.some((call) => call.name === toolName)) {
          continue;
        }
        const result = await this.registry.run(toolName);
        toolCalls.push({
          name: toolName,
          result,
          phase: step.phase,
          reason: step.reason,
        });
      }
    }

    return toolCalls;
  }

  private async plan(message: string, serviceResolution?: ServiceResolution): Promise<AnalysisStep[]> {
    const modelPlan = await this.modelDrivenPlan(message, serviceResolution);
    if (modelPlan.length > 0) {
      return this.ensureServiceContextStep(modelPlan, serviceResolution);
    }
    return this.ensureServiceContextStep(this.ruleDrivenPlan(message, serviceResolution), serviceResolution);
  }

  private async modelDrivenPlan(message: string, serviceResolution?: ServiceResolution): Promise<AnalysisStep[]> {
    if (!this.modelClient?.planTools) {
      return [];
    }

    try {
      const contextMessage = serviceResolution
        ? `${message}\n\nResolved service context: ${JSON.stringify({
            service: serviceResolution.service.name,
            owner: serviceResolution.service.owner,
            team: serviceResolution.service.team,
            environments: serviceResolution.service.environments,
            dependencies: serviceResolution.service.dependencies,
          })}`
        : message;
      const proposed = await this.modelClient.planTools(contextMessage, this.registry);
      const allowed = new Set(this.registry.names());
      const validSteps = proposed
        .map((step) => ({
          phase: step.phase || "model-planned",
          tools: unique(step.tools).filter((tool) => allowed.has(tool)),
          reason: step.reason || "本地模型根据工具描述生成的计划。",
          planner: "model" as const,
          confidence: clampConfidence(step.confidence ?? scorePlanStep(message, step.tools, serviceResolution, "model")),
          signals: planSignals(message, step.tools, serviceResolution),
        }))
        .filter((step) => step.tools.length > 0);

      return validSteps.length > 0 ? validSteps : [];
    } catch {
      return [];
    }
  }

  private ruleDrivenPlan(message: string, serviceResolution?: ServiceResolution): AnalysisStep[] {
    const text = message.toLowerCase();
    const selected = this.registry.selectForMessage(message);
    const steps: AnalysisStep[] = [];

    const isIncident = hasAny(text, ["异常", "故障", "incident", "error", "错误", "告警", "报警", "集群"]);
    const asksCost = hasAny(text, ["费用", "成本", "账单", "cost", "finops", "spend"]);
    const asksSummary = hasAny(text, ["aiops", "总结", "总览", "全套", "summary"]);
    const asksSelfHeal = hasAny(text, ["自愈", "修复", "恢复", "扩容", "回滚", "self heal", "remediate"]);

    if (isIncident) {
      steps.push({
        phase: "detect",
        tools: unique(["query_service_context", "query_alerts", ...selected]),
        reason: serviceResolution
          ? `先解析服务上下文并确认 ${serviceResolution.service.name} 的告警或异常信号。`
          : "先解析服务上下文并确认是否存在告警、异常信号或用户明确提到的领域。",
        planner: "rule",
      });
      steps.push({
        phase: "correlate",
        tools: ["query_cluster_status", "query_logs", "query_resource_inventory"],
        reason: "将告警与集群状态、日志和资源库存做交叉验证。",
        planner: "rule",
      });
      steps.push({
        phase: "diagnose",
        tools: ["query_incident_diagnosis", "query_runbook_recommendations"],
        reason: "基于多源信号生成根因判断和处置建议。",
        planner: "rule",
      });
    } else if (asksCost) {
      steps.push({
        phase: "cost-baseline",
        tools: ["query_service_cost", "query_resource_inventory"],
        reason: "先读取费用和资源基线，判断成本驱动项。",
        planner: "rule",
      });
      steps.push({
        phase: "cost-anomaly",
        tools: ["query_cost_anomalies", "query_runbook_recommendations"],
        reason: "识别费用异常并给出下一步排查建议。",
        planner: "rule",
      });
    } else if (asksSummary) {
      steps.push({
        phase: "overview",
        tools: ["query_service_context", "query_aiops_summary", "query_alerts", "query_service_cost", "query_cluster_status"],
        reason: "生成跨域 AIOps 总览。",
        planner: "rule",
      });
    } else {
      steps.push({
        phase: "initial",
        tools: selected.length > 0 ? selected : this.registry.names().slice(0, 5),
        reason: "根据用户意图选择相关只读工具。",
        planner: "rule",
      });
    }

    if (asksSelfHeal && !steps.some((step) => step.tools.includes("query_runbook_recommendations"))) {
      steps.push({
        phase: "self-healing-prep",
        tools: ["query_runbook_recommendations"],
        reason: "用户提到自愈或修复，补充安全处置路径。",
        planner: "rule",
      });
    }

    return steps.map((step) => ({
      ...step,
      tools: unique(step.tools).filter((tool) => this.registry.names().includes(tool)),
      confidence: scorePlanStep(message, step.tools, serviceResolution, step.planner ?? "rule"),
      signals: planSignals(message, step.tools, serviceResolution),
    }));
  }

  private ensureServiceContextStep(steps: AnalysisStep[], serviceResolution?: ServiceResolution): AnalysisStep[] {
    if (!serviceResolution || !this.registry.names().includes("query_service_context")) {
      return steps;
    }
    if (steps.some((step) => step.tools.includes("query_service_context"))) {
      return steps;
    }
    return [
      {
        phase: "resolve-context",
        tools: ["query_service_context"],
        reason: `已匹配到服务 ${serviceResolution.service.name}，先读取服务地图、负责人、运行环境和依赖关系。`,
        confidence: scorePlanStep(serviceResolution.service.name, ["query_service_context"], serviceResolution, "system"),
        planner: "system",
        signals: planSignals(serviceResolution.service.name, ["query_service_context"], serviceResolution),
      },
      ...steps,
    ];
  }

  private deriveFindings(toolCalls: ToolCall[], serviceResolution?: ServiceResolution): AnalysisFinding[] {
    const names = new Set(toolCalls.map((call) => call.name));
    const findings: AnalysisFinding[] = [];

    if (serviceResolution) {
      const prod = serviceResolution.service.environments.find((environment) => environment.name === "prod");
      findings.push({
        severity: "info",
        title: `已定位服务上下文：${serviceResolution.service.name}`,
        detail: `匹配方式：${serviceResolution.matchedBy}；负责人：${serviceResolution.service.owner}；生产集群：${prod?.cluster ?? "未配置"}；namespace：${prod?.namespace ?? "未配置"}。`,
        evidence: ["query_service_context"],
      });
    }

    if (names.has("query_alerts") && names.has("query_logs")) {
      findings.push({
        severity: "warning",
        title: "发现告警和错误日志共振",
        detail: "告警信号与 API 5xx 日志同时出现，说明不是单一监控噪声，需要继续核对服务容量和依赖延迟。",
        evidence: ["query_alerts", "query_logs"],
      });
    }

    if (names.has("query_cluster_status")) {
      findings.push({
        severity: "warning",
        title: "EKS 集群存在待处理容量信号",
        detail: "集群状态工具显示存在 pending pods，可能与服务容量、调度约束或节点资源不足有关。",
        evidence: ["query_cluster_status"],
      });
    }

    if (names.has("query_cost_anomalies")) {
      findings.push({
        severity: "info",
        title: "成本异常需要结合容量变化判断",
        detail: "费用异常工具显示 EC2 和 EKS 高于模拟基线，可能与节点组扩张或容量策略有关。",
        evidence: ["query_cost_anomalies", "query_service_cost"],
      });
    }

    if (names.has("query_incident_diagnosis")) {
      findings.push({
        severity: "warning",
        title: "形成初步根因假设",
        detail: "跨域诊断认为 checkout degradation 与 API 5xx、pending pods 和告警存在关联。",
        evidence: ["query_incident_diagnosis"],
      });
    }

    if (findings.length === 0) {
      findings.push({
        severity: "info",
        title: "未发现明确异常链路",
        detail: "当前工具结果没有形成强异常关联，建议继续扩大时间窗口或接入真实指标源。",
        evidence: toolCalls.map((call) => call.name),
      });
    }

    return findings;
  }

  private proposeSelfHealing(findings: AnalysisFinding[]): SelfHealingProposal[] {
    const hasCapacitySignal = findings.some((finding) =>
      ["EKS 集群存在待处理容量信号", "形成初步根因假设"].includes(finding.title),
    );

    if (!hasCapacitySignal) {
      return [];
    }

    return [
      {
        title: "生成受控扩容变更计划",
        summary: "基于 pending pods、API 5xx 和告警关联，建议创建扩容变更计划。该建议只生成计划，不自动执行。",
        actionType: "scale_service",
        target: "platform-prod/api",
        parameters: { replicas: 6 },
        rollbackPlan: "如果错误率和 pending pods 未改善，恢复原副本数并升级给服务 owner。",
        requiresApproval: true,
      },
    ];
  }
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function scorePlanStep(
  message: string,
  tools: string[],
  serviceResolution: ServiceResolution | undefined,
  planner: "model" | "rule" | "system",
): number {
  let score = planner === "model" ? 0.62 : planner === "system" ? 0.9 : 0.52;
  const text = message.toLowerCase();
  const toolSet = new Set(tools);

  if (serviceResolution) {
    score += 0.08;
  }
  if (toolSet.has("query_service_context") && serviceResolution) {
    score += 0.08;
  }
  if (hasAny(text, ["异常", "故障", "incident", "error", "错误", "告警", "报警", "5xx"])) {
    score += coverageScore(toolSet, ["query_alerts", "query_logs", "query_cluster_status"], 0.18);
  }
  if (hasAny(text, ["费用", "成本", "账单", "cost", "finops", "spend"])) {
    score += coverageScore(toolSet, ["query_service_cost", "query_cost_anomalies"], 0.16);
  }
  if (hasAny(text, ["自愈", "修复", "恢复", "扩容", "回滚", "self heal", "remediate"])) {
    score += coverageScore(toolSet, ["query_runbook_recommendations"], 0.12);
  }
  if (tools.length > 0) {
    score += 0.04;
  }

  return clampConfidence(score);
}

function coverageScore(toolSet: Set<string>, expectedTools: string[], weight: number): number {
  const hitCount = expectedTools.filter((tool) => toolSet.has(tool)).length;
  return (hitCount / expectedTools.length) * weight;
}

function clampConfidence(value: number): number {
  return Math.max(0.05, Math.min(0.99, Number(value.toFixed(2))));
}

function planSignals(message: string, tools: string[], serviceResolution?: ServiceResolution): string[] {
  const signals: string[] = [];
  const text = message.toLowerCase();

  if (serviceResolution) {
    signals.push(`service:${serviceResolution.service.name}`);
  }
  if (hasAny(text, ["异常", "故障", "incident", "error", "错误", "告警", "报警", "5xx"])) {
    signals.push("intent:incident");
  }
  if (hasAny(text, ["费用", "成本", "账单", "cost", "finops", "spend"])) {
    signals.push("intent:cost");
  }
  if (hasAny(text, ["自愈", "修复", "恢复", "扩容", "回滚", "self heal", "remediate"])) {
    signals.push("intent:remediation");
  }
  if (tools.length > 1) {
    signals.push("mode:multi-tool");
  }

  return signals;
}
