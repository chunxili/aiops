export type DemoScenario = {
  id: string;
  title: string;
  category: "incident" | "finops" | "delivery" | "self-healing" | "access-control";
  userMessage: string;
  expectedTools: string[];
  expectedFindings: string[];
  highlights: string[];
  followUp?: {
    label: string;
    message: string;
  };
};

export const demoScenarios: DemoScenario[] = [
  {
    id: "platform-api-5xx-incident",
    title: "平台 API 5xx 根因分析",
    category: "incident",
    userMessage: "平台服务 5xx 异常，帮我查根因和影响面",
    expectedTools: [
      "query_service_context",
      "query_alerts",
      "query_logs",
      "query_cluster_status",
      "query_resource_inventory",
      "query_incident_diagnosis",
      "query_runbook_recommendations",
    ],
    expectedFindings: ["已定位服务上下文：platform-api", "发现告警和错误日志共振", "形成初步根因假设"],
    highlights: [
      "演示服务别名解析：用户说平台服务，Agent 定位 platform-api。",
      "演示多工具协作：服务目录、告警、日志、EKS、资源、诊断一起参与。",
      "演示 findings 和 self-healing proposal 的分离。",
    ],
  },
  {
    id: "eks-pending-self-healing",
    title: "EKS Pending Pod 自愈建议",
    category: "self-healing",
    userMessage: "集群异常，帮我逐步分析并给出自愈建议",
    expectedTools: [
      "query_alerts",
      "query_cluster_status",
      "query_logs",
      "query_resource_inventory",
      "query_incident_diagnosis",
      "query_runbook_recommendations",
    ],
    expectedFindings: ["EKS 集群存在待处理容量信号", "形成初步根因假设"],
    highlights: [
      "演示 LangGraph 多阶段计划：detect、correlate、diagnose、self-healing-prep。",
      "演示自愈只生成计划，不直接改生产。",
      "演示 Delivery 审批和执行后复查闭环。",
    ],
  },
  {
    id: "monthly-cost-spike",
    title: "本月成本突增分析",
    category: "finops",
    userMessage: "查看本月费用是否异常，顺便看资源是不是扩太多",
    expectedTools: ["query_service_cost", "query_resource_inventory", "query_cost_anomalies", "query_runbook_recommendations"],
    expectedFindings: ["成本异常需要结合容量变化判断"],
    highlights: [
      "演示 FinOps 与资源库存联动。",
      "演示成本异常不会直接触发扩缩容，而是先给出处置建议。",
      "演示规划评测可以检查费用问题是否召回成本和资源工具。",
    ],
  },
  {
    id: "limited-permission-user",
    title: "Keycloak 模块权限隔离",
    category: "access-control",
    userMessage: "帮我查集群和费用",
    expectedTools: ["query_cluster_status"],
    expectedFindings: ["EKS 集群存在待处理容量信号"],
    highlights: [
      "演示用户只有 EKS 和 Log 权限时，FinOps 工具不会暴露给模型。",
      "演示无权限工具不会出现在 tool_calls。",
      "演示权限边界在规划和执行阶段都生效。",
    ],
  },
  {
    id: "basic-cluster-query",
    title: "用户基础查询：集群状态",
    category: "incident",
    userMessage: "帮我查一下当前集群状态，有没有 pending pod",
    expectedTools: ["query_cluster_status"],
    expectedFindings: ["EKS 集群存在待处理容量信号"],
    highlights: [
      "演示普通查询不需要进入交付流程。",
      "演示用户可以直接查询集群健康状态。",
      "演示 Agent 返回结构化工具证据，而不是只给自然语言。",
    ],
  },
  {
    id: "basic-resource-query",
    title: "用户基础查询：资源库存",
    category: "incident",
    userMessage: "帮我查一下当前资源库存和主要资源数量",
    expectedTools: ["query_resource_inventory"],
    expectedFindings: [],
    highlights: [
      "演示基础资源查询。",
      "演示只读工具返回 EC2、RDS、S3、负载均衡等结构化统计。",
      "演示 Backstage 前端可以把工具结果渲染成表格或卡片。",
    ],
  },
];

export function getDemoScenario(id: string): DemoScenario | undefined {
  return demoScenarios.find((scenario) => scenario.id === id);
}
