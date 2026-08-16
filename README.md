# AWS Platform AIOps Agent

这是一个面向 AWS 平台运维场景的只读 AIOps Agent。项目已经改造成 TypeScript 版本，目标是兼容既有的 Backstage + TypeScript + React AIOps 平台，让原平台能力和后续扩展能力可以持续接入 Agent。

前端稳定入口只有一个：

```text
POST /api/agent/chat
```

当前版本不需要真实 MiniMax Key，也不需要真实 AWS 账号即可本地运行。没有配置 `MINIMAX_API_KEY` 时，会使用 mock 大模型；AWS 账号由 `MockAwsProvider` 模拟。

## 总体架构

```mermaid
flowchart LR
  User["用户"] --> UI["Backstage React 插件"]
  UI -->|POST /api/agent/chat| API["TypeScript Express API"]
  API --> Orchestrator["AgentOrchestrator"]
  Orchestrator --> Runtime["Claude-SDK-shaped Runtime"]
  Runtime --> Registry["ToolRegistry"]
  Registry --> Tools["只读 AIOps 工具集"]
  Tools --> AWS["模拟 AWS Provider"]
  Runtime --> Model["MiniMax Model Adapter"]
  Model --> Answer["分析结论"]
  Registry --> Evidence["结构化工具证据"]
  Answer --> UI
  Evidence --> UI
```

## 代码结构

```text
src/app/              Express 应用和 HTTP 路由
src/agent/            Claude SDK 形态运行时、Agent 编排、MiniMax 适配器
src/tools/            只读工具：AIOps、Alert、FinOps、EKS、Resource、Log
src/integrations/aws/ 模拟 AWS 账号 Provider，后续接 AssumeRole
src/schemas/          Zod 请求校验和 TypeScript 响应类型
src/tests/            API、工具、只读 Guard 测试
docs/                 架构和 Backstage 集成说明
```

## 运行方式

```bash
npm install
npm run dev
```

构建和生产方式运行：

```bash
npm run build
npm start
```

示例请求：

```bash
curl -X POST http://127.0.0.1:8000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"查看本月费用、EKS 集群状态、日志、告警和 AIOps 总结"}'
```

## 环境变量

| 变量 | 是否必需 | 说明 |
| --- | --- | --- |
| `MINIMAX_API_KEY` | 否 | 配置后调用 MiniMax Chat Completions；不配置则使用 mock 模型。 |
| `MINIMAX_BASE_URL` | 否 | MiniMax API 地址，默认 `https://api.minimax.io`。 |
| `MINIMAX_MODEL` | 否 | MiniMax 模型名，默认 `MiniMax-M3`。 |
| `AWS_ROLE_ARN` | 否 | 后续真实 AWS AssumeRole 使用；当前 mock provider 不使用。 |
| `AWS_REGION` | 否 | AWS 区域，mock provider 默认 `us-east-1`。 |
| `PORT` | 否 | HTTP 端口，默认 `8000`。 |

## Agent 调用链路

```mermaid
sequenceDiagram
  participant U as 用户
  participant B as Backstage React
  participant A as /api/agent/chat
  participant R as Claude SDK 形态 Runtime
  participant T as ToolRegistry
  participant M as MiniMax Adapter

  U->>B: 输入自然语言问题
  B->>A: POST message
  A->>R: 创建 Agent 请求
  R->>T: 根据意图选择只读工具
  T-->>R: 返回结构化工具结果
  R->>M: 发送用户问题 + 工具上下文
  M-->>R: 返回分析结论
  R-->>A: answer + tool_calls
  A-->>B: 返回聊天响应和证据
  B-->>U: 展示结论、证据、表格或 JSON
```

## AIOps 工具能力

所有工具都是只读工具，并返回统一结构化 JSON。

```mermaid
mindmap
  root((AIOps Agent Tools))
    Alert
      query_alerts
      告警概览
      影响服务
    FinOps
      query_service_cost
      本月费用
      服务成本拆分
    EKS
      query_cluster_status
      集群状态
      节点和 Pod 状态
    Resource
      query_resource_inventory
      EC2/RDS/S3 资源统计
    Log
      query_logs
      错误日志
      关键事件
    AIOps
      query_incident_diagnosis
      query_cost_anomalies
      query_runbook_recommendations
      query_aiops_summary
```

核心平台工具：

- `query_alerts`
- `query_service_cost`
- `query_cluster_status`
- `query_resource_inventory`
- `query_logs`

AIOps 关联分析工具：

- `query_incident_diagnosis`
- `query_cost_anomalies`
- `query_runbook_recommendations`
- `query_aiops_summary`

内部验证路由是 `/api/tools/{tool_name}`。Backstage 前端正常只调用 `/api/agent/chat`。

## Backstage 集成方式

```mermaid
flowchart TB
  subgraph Backstage["既有 Backstage + React 平台"]
    Page["AIOps Chat Page"]
    Widget["现有资源/费用/告警组件"]
    Client["Agent API Client"]
  end

  subgraph Agent["TypeScript AIOps Agent 服务"]
    Chat["/api/agent/chat"]
    Runtime["Agent Runtime"]
    Registry["ToolRegistry"]
  end

  Page --> Client
  Widget --> Client
  Client --> Chat
  Chat --> Runtime
  Runtime --> Registry
  Registry --> Result["ToolResult"]
  Result --> Client
```

Backstage 插件建议渲染：

- `answer`：展示为 Agent 回复。
- `tool_calls`：展示为可展开证据面板。
- `result.summary`：展示为简短证据摘要。
- `result.data`：按领域渲染成表格、JSON、卡片或原有 AIOps 组件。

## 后续扩展方式

后续要把原 AIOps 平台能力或新能力接入 Agent，按下面流程即可：

```mermaid
flowchart LR
  Feature["已有或新增 AIOps 功能"] --> Wrapper["封装成只读 Tool 函数"]
  Wrapper --> Shape["返回 ToolResult"]
  Shape --> Registry["注册到 src/tools/registry.ts"]
  Registry --> Intent["添加意图关键词或模型工具选择"]
  Intent --> Tests["补测试"]
  Tests --> Agent["Agent 自动具备新能力"]
```

工具返回结构保持统一：

```ts
type ToolResult = {
  tool: string;
  category: "Alert" | "FinOps" | "EKS" | "Resource" | "Log" | "AIOps";
  readonly: true;
  summary: string;
  data: Record<string, unknown>;
};
```

这样旧功能、新功能都可以被 Agent 统一识别、调用、分析，Backstage 前端入口不需要变化。

## 后续交付与变更执行

当前版本已经实现了 Delivery Actions / Change Workflows 的基础代码。只读工具继续负责查询和分析；变更交付通过独立的 `/api/delivery/changes` 系列接口完成，默认是 mock 执行，不会改真实基础设施。

推荐分层：

```mermaid
flowchart TB
  User["用户"] --> Chat["Backstage Chat UI"]
  Chat --> Agent["AIOps Agent"]

  Agent --> Read["Read Tools：查询、诊断、分析"]
  Read --> Plan["生成变更计划 / 交付建议"]
  Plan --> Approval["审批：人工确认 / 工单审批 / 变更窗口"]
  Approval -->|通过| Action["Delivery Actions：执行交付动作"]
  Approval -->|拒绝| Stop["停止，不执行变更"]

  Action --> CICD["CI/CD 或运维系统"]
  Action --> Ticket["工单系统"]
  Action --> Cloud["AWS / Kubernetes / Backstage Actions"]
  Action --> Audit["审计日志"]
```

只读工具和交付动作的边界：

| 类型 | 作用 | 是否可改环境 | 示例 |
| --- | --- | --- | --- |
| Read Tools | 查询事实、诊断问题、生成证据 | 否 | 查资源、查费用、查日志、查告警、查集群状态 |
| Delivery Actions | 执行交付和变更 | 是，但必须审批 | 创建工单、触发流水线、执行回滚、扩容、发布配置 |
| Change Workflows | 串联审批、执行、校验、审计 | 是，但必须受控 | 生成变更计划、等待审批、执行、验证、记录审计 |

交付动作必须具备这些保护：

- 审批：任何写操作都必须先生成计划，再由人或审批系统确认。
- 权限：按用户、团队、环境、服务做 RBAC 控制。
- 审计：记录谁发起、谁审批、执行了什么、结果是什么。
- 幂等：每个交付动作必须有 `changeId` 或 `idempotencyKey`，避免重复执行。
- 分环境：生产环境默认更严格，至少需要审批和变更窗口。
- 可回滚：交付计划要包含验证方式和回滚策略。
- 可解释：Agent 必须展示执行前依据，包括用到的只读工具结果。

已实现的交付接口：

```text
POST /api/agent/chat              # 继续作为用户聊天入口
POST /api/delivery/changes        # 创建变更计划
GET  /api/delivery/changes/:id
POST /api/delivery/changes/:id/approve
POST /api/delivery/changes/:id/execute
GET  /api/delivery/changes/:id/audit
```

核心原则：

```mermaid
flowchart LR
  Think["大模型负责理解、分析、生成计划"] --> Gate["审批和权限网关"]
  Gate --> Execute["确定性后端动作执行"]
  Execute --> Verify["执行后验证"]
  Verify --> Audit["审计留痕"]
```

也就是说，Agent 可以推动交付，但不能绕过审批直接改生产环境。

创建变更计划示例：

```bash
curl -X POST http://127.0.0.1:8000/api/delivery/changes \
  -H "Content-Type: application/json" \
  -d '{
    "title":"扩容 platform-prod API",
    "summary":"基于告警、EKS pending pods 和日志错误生成的扩容建议",
    "environment":"prod",
    "requestedBy":"alice",
    "actions":[
      {
        "type":"scale_service",
        "target":"platform-prod/api",
        "parameters":{"replicas":6}
      }
    ],
    "evidence":["query_alerts","query_cluster_status","query_logs"],
    "idempotencyKey":"change-platform-prod-api-001",
    "rollbackPlan":"如果错误率未下降，恢复原副本数并升级给服务 owner"
  }'
```

## 只读安全边界

```mermaid
flowchart TD
  Request["工具调用请求"] --> Guard["ReadOnly Guard"]
  Guard -->|query/list/get/describe| Allow["允许执行"]
  Guard -->|create/update/delete/start/stop/scale/apply| Block["拒绝执行"]
  Allow --> Tool["只读工具"]
  Tool --> Data["结构化数据"]
  Block --> Error["403"]
```

安全约束：

- 工具名必须以 `query_`、`list_`、`get_`、`describe_` 等只读前缀开头。
- `create_`、`update_`、`delete_`、`start_`、`stop_`、`scale_`、`apply_` 等变更类前缀会被拒绝。
- MiniMax 只接收后端整理好的只读上下文，不能绕过 `ToolRegistry` 直接操作 AWS。
- 当前 AWS 是模拟账号；后续真实 AWS 也应只接只读 IAM 权限。

## 替换为真实 AWS 查询

后续接真实 AWS 时：

1. 在 `src/integrations/aws/provider.ts` 实现 `AssumeRoleAwsProvider`。
2. 使用 STS AssumeRole 获取短期凭证。
3. IAM 权限保持只读。
4. 将 mock 工具数据替换成 AWS SDK 只读查询：
   - Alert：CloudWatch Alarm 或事件源。
   - FinOps：Cost Explorer。
   - EKS：EKS API 和 Kubernetes 只读 API。
   - Resource：Resource Groups Tagging API、Config 或各服务 Describe API。
   - Log：CloudWatch Logs 只读查询。
   - AIOps：继续在服务端做跨工具关联分析。
5. 保留 `src/tools/guard.ts` 的只读限制。

## 测试

```bash
npm run build
npm test
```
