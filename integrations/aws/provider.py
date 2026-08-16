from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class AwsIdentity:
    account_id: str
    account_name: str
    role_arn: str
    region: str


class AwsProvider(Protocol):
    async def identity(self) -> AwsIdentity:
        """Return the active AWS identity used by read-only tools."""


class MockAwsProvider:
    def __init__(self, region: str = "us-east-1") -> None:
        self._identity = AwsIdentity(
            account_id="000000000000",
            account_name="simulated-platform-prod",
            role_arn="arn:aws:iam::000000000000:role/mock-readonly-aiops-agent",
            region=region,
        )

    async def identity(self) -> AwsIdentity:
        return self._identity

    async def accounts(self) -> list[AwsIdentity]:
        return [
            self._identity,
            AwsIdentity(
                account_id="111111111111",
                account_name="simulated-shared-services",
                role_arn="arn:aws:iam::111111111111:role/mock-readonly-aiops-agent",
                region=self._identity.region,
            ),
            AwsIdentity(
                account_id="222222222222",
                account_name="simulated-platform-staging",
                role_arn="arn:aws:iam::222222222222:role/mock-readonly-aiops-agent",
                region="us-west-2",
            ),
        ]


class AssumeRoleAwsProvider:
    """Interface placeholder for future STS AssumeRole implementation.

    Production code should configure an external role ARN and create short-lived
    read-only sessions. No credentials are stored in this repository.
    """

    def __init__(self, role_arn: str, region: str) -> None:
        self.role_arn = role_arn
        self.region = region

    async def identity(self) -> AwsIdentity:
        raise NotImplementedError("Real AWS AssumeRole provider is intentionally not wired in MVP.")


def get_aws_provider() -> AwsProvider:
    return MockAwsProvider()
