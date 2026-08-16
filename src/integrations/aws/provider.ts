export type AwsIdentity = {
  accountId: string;
  accountName: string;
  roleArn: string;
  region: string;
};

export interface AwsProvider {
  identity(): Promise<AwsIdentity>;
  accounts(): Promise<AwsIdentity[]>;
}

export class MockAwsProvider implements AwsProvider {
  private readonly primary: AwsIdentity;

  constructor(region = "us-east-1") {
    this.primary = {
      accountId: "000000000000",
      accountName: "simulated-platform-prod",
      roleArn: "arn:aws:iam::000000000000:role/mock-readonly-aiops-agent",
      region,
    };
  }

  async identity(): Promise<AwsIdentity> {
    return this.primary;
  }

  async accounts(): Promise<AwsIdentity[]> {
    return [
      this.primary,
      {
        accountId: "111111111111",
        accountName: "simulated-shared-services",
        roleArn: "arn:aws:iam::111111111111:role/mock-readonly-aiops-agent",
        region: this.primary.region,
      },
      {
        accountId: "222222222222",
        accountName: "simulated-platform-staging",
        roleArn: "arn:aws:iam::222222222222:role/mock-readonly-aiops-agent",
        region: "us-west-2",
      },
    ];
  }
}

export class AssumeRoleAwsProvider implements AwsProvider {
  constructor(
    private readonly roleArn: string,
    private readonly region: string,
  ) {}

  async identity(): Promise<AwsIdentity> {
    throw new Error(
      `Real AWS AssumeRole provider is intentionally not wired in MVP for ${this.roleArn} in ${this.region}.`,
    );
  }

  async accounts(): Promise<AwsIdentity[]> {
    return [await this.identity()];
  }
}

export function getAwsProvider(): AwsProvider {
  return new MockAwsProvider(process.env.AWS_REGION ?? "us-east-1");
}
