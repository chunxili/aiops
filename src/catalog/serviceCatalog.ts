export type ServiceDependency = {
  service: string;
  type: "upstream" | "downstream" | "database" | "cache" | "queue";
};

export type ServiceMetadata = {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  owner: string;
  team: string;
  environments: Array<{
    name: "dev" | "staging" | "prod";
    cluster: string;
    namespace: string;
    logGroup: string;
    dashboardUrl: string;
  }>;
  permissions: string[];
  approvalPolicy: {
    prod: string[];
    nonProd: string[];
  };
  runbooks: string[];
  dependencies: ServiceDependency[];
};

export type ServiceResolution = {
  service: ServiceMetadata;
  matchedBy: "name" | "alias" | "description" | "dependency";
  score: number;
  matchedTerms: string[];
};

export type ServiceCatalogProvider = {
  list(): Promise<ServiceMetadata[]>;
};

export type ServiceCatalogSource = "mock" | "backstage" | "cmdb";

export class MockServiceCatalogProvider implements ServiceCatalogProvider {
  async list(): Promise<ServiceMetadata[]> {
    return mockServices;
  }
}

export class BackstageServiceCatalogProvider implements ServiceCatalogProvider {
  async list(): Promise<ServiceMetadata[]> {
    if (!process.env.BACKSTAGE_CATALOG_URL) {
      return mockServices;
    }

    const response = await fetch(`${process.env.BACKSTAGE_CATALOG_URL.replace(/\/$/, "")}/entities?filter=kind=Component`);
    if (!response.ok) {
      throw new Error(`Backstage catalog request failed with status ${response.status}.`);
    }

    const entities = (await response.json()) as BackstageEntity[];
    return entities.map(fromBackstageEntity).filter((service): service is ServiceMetadata => Boolean(service));
  }
}

export class HttpCmdbServiceCatalogProvider implements ServiceCatalogProvider {
  async list(): Promise<ServiceMetadata[]> {
    if (!process.env.CMDB_SERVICE_CATALOG_URL) {
      return mockServices;
    }

    const response = await fetch(process.env.CMDB_SERVICE_CATALOG_URL);
    if (!response.ok) {
      throw new Error(`CMDB catalog request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as { services?: ServiceMetadata[] } | ServiceMetadata[];
    return Array.isArray(payload) ? payload : payload.services ?? [];
  }
}

const mockServices: ServiceMetadata[] = [
  {
    id: "payment-api",
    name: "payment-api",
    aliases: ["支付服务", "支付接口", "收款服务", "payment", "checkout", "结账"],
    description: "Handles checkout and payment authorization traffic.",
    owner: "payments-team",
    team: "payments",
    environments: [
      {
        name: "prod",
        cluster: "platform-prod",
        namespace: "payments",
        logGroup: "/aws/eks/platform-prod/payment-api",
        dashboardUrl: "https://grafana.local/d/payment-api-prod",
      },
      {
        name: "staging",
        cluster: "platform-staging",
        namespace: "payments-staging",
        logGroup: "/aws/eks/platform-staging/payment-api",
        dashboardUrl: "https://grafana.local/d/payment-api-staging",
      },
    ],
    permissions: ["AIOps", "EKS", "Log", "Alert", "Delivery"],
    approvalPolicy: {
      prod: ["payments-team-owner", "sre-approver"],
      nonProd: ["payments-team-owner"],
    },
    runbooks: ["payment-5xx-runbook", "payment-latency-runbook"],
    dependencies: [
      { service: "order-api", type: "upstream" },
      { service: "redis-payment", type: "cache" },
      { service: "rds-payment", type: "database" },
    ],
  },
  {
    id: "order-api",
    name: "order-api",
    aliases: ["订单服务", "下单服务", "order", "orders"],
    description: "Handles order creation and order state transitions.",
    owner: "orders-team",
    team: "orders",
    environments: [
      {
        name: "prod",
        cluster: "platform-prod",
        namespace: "orders",
        logGroup: "/aws/eks/platform-prod/order-api",
        dashboardUrl: "https://grafana.local/d/order-api-prod",
      },
    ],
    permissions: ["AIOps", "EKS", "Log", "Alert", "Delivery"],
    approvalPolicy: {
      prod: ["orders-team-owner", "sre-approver"],
      nonProd: ["orders-team-owner"],
    },
    runbooks: ["order-api-error-runbook"],
    dependencies: [{ service: "rds-orders", type: "database" }],
  },
  {
    id: "platform-api",
    name: "platform-api",
    aliases: ["平台服务", "api-prod", "platform", "平台接口"],
    description: "Core platform API service for shared AIOps workflows.",
    owner: "platform-team",
    team: "platform",
    environments: [
      {
        name: "prod",
        cluster: "platform-prod",
        namespace: "platform",
        logGroup: "/aws/eks/platform-prod/api",
        dashboardUrl: "https://grafana.local/d/platform-api-prod",
      },
    ],
    permissions: ["AIOps", "EKS", "Log", "Alert", "Resource", "Delivery"],
    approvalPolicy: {
      prod: ["platform-team-owner", "sre-approver"],
      nonProd: ["platform-team-owner"],
    },
    runbooks: ["platform-api-5xx-runbook"],
    dependencies: [
      { service: "payment-api", type: "downstream" },
      { service: "order-api", type: "downstream" },
    ],
  },
];

export class ServiceCatalog {
  constructor(private readonly provider: ServiceCatalogProvider = createServiceCatalogProvider()) {}

  async list(): Promise<ServiceMetadata[]> {
    return this.provider.list();
  }

  async resolve(message: string): Promise<ServiceResolution | undefined> {
    const services = await this.provider.list();
    const text = normalize(message);
    const scored = services
      .map((service) => scoreService(service, text))
      .filter((resolution): resolution is ServiceResolution => resolution.score > 0);

    return scored.sort((left, right) => right.score - left.score)[0];
  }
}

export const serviceCatalog = new ServiceCatalog();

export function createServiceCatalogProvider(): ServiceCatalogProvider {
  const source = (process.env.SERVICE_CATALOG_SOURCE ?? "mock").toLowerCase() as ServiceCatalogSource;
  if (source === "backstage") {
    return new BackstageServiceCatalogProvider();
  }
  if (source === "cmdb") {
    return new HttpCmdbServiceCatalogProvider();
  }
  return new MockServiceCatalogProvider();
}

type BackstageEntity = {
  metadata?: {
    name?: string;
    title?: string;
    description?: string;
    annotations?: Record<string, string>;
    tags?: string[];
  };
  spec?: {
    owner?: string;
    system?: string;
    lifecycle?: string;
    dependsOn?: string[];
  };
};

function fromBackstageEntity(entity: BackstageEntity): ServiceMetadata | undefined {
  const name = entity.metadata?.name;
  if (!name) {
    return undefined;
  }

  const annotations = entity.metadata?.annotations ?? {};
  const environment = (annotations["aiops/environment"] as "dev" | "staging" | "prod" | undefined) ?? "prod";
  const cluster = annotations["aiops/cluster"] ?? "unknown-cluster";
  const namespace = annotations["aiops/namespace"] ?? name;

  return {
    id: name,
    name,
    aliases: [entity.metadata?.title, ...(entity.metadata?.tags ?? [])].filter((value): value is string => Boolean(value)),
    description: entity.metadata?.description ?? `${name} service from Backstage catalog.`,
    owner: entity.spec?.owner ?? "unknown-owner",
    team: entity.spec?.system ?? entity.spec?.owner ?? "unknown-team",
    environments: [
      {
        name: environment,
        cluster,
        namespace,
        logGroup: annotations["aiops/log-group"] ?? `/aws/eks/${cluster}/${name}`,
        dashboardUrl: annotations["aiops/dashboard-url"] ?? "",
      },
    ],
    permissions: parseCsv(annotations["aiops/permissions"] ?? "AIOps,EKS,Log,Alert,Delivery"),
    approvalPolicy: {
      prod: parseCsv(annotations["aiops/prod-approvers"] ?? `${entity.spec?.owner ?? "service-owner"},sre-approver`),
      nonProd: parseCsv(annotations["aiops/nonprod-approvers"] ?? entity.spec?.owner ?? "service-owner"),
    },
    runbooks: parseCsv(annotations["aiops/runbooks"] ?? ""),
    dependencies: (entity.spec?.dependsOn ?? []).map((dependency) => ({
      service: dependency.split("/").pop() ?? dependency,
      type: "downstream",
    })),
  };
}

function scoreService(service: ServiceMetadata, text: string): ServiceResolution {
  const matchedTerms: string[] = [];
  let matchedBy: ServiceResolution["matchedBy"] = "description";
  let score = 0;

  if (text.includes(normalize(service.name))) {
    score += 100;
    matchedBy = "name";
    matchedTerms.push(service.name);
  }

  for (const alias of service.aliases) {
    if (text.includes(normalize(alias))) {
      score += 80;
      matchedBy = "alias";
      matchedTerms.push(alias);
    }
  }

  for (const dependency of service.dependencies) {
    if (text.includes(normalize(dependency.service))) {
      score += 30;
      matchedBy = "dependency";
      matchedTerms.push(dependency.service);
    }
  }

  const descriptionTokens = normalize(service.description)
    .split(/\s+/)
    .filter((token) => token.length > 3);
  for (const token of descriptionTokens) {
    if (text.includes(token)) {
      score += 5;
      matchedTerms.push(token);
    }
  }

  return {
    service,
    matchedBy,
    score,
    matchedTerms: [...new Set(matchedTerms)],
  };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
