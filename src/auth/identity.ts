import type express from "express";

export type UserIdentity = {
  userId: string;
  username: string;
  roles: string[];
  groups: string[];
  modulePermissions: string[];
};

export function extractIdentity(req: express.Request): UserIdentity {
  return {
    userId: header(req, "x-user-id") ?? "local-user",
    username: header(req, "x-user-name") ?? "local-user",
    roles: splitHeader(req, "x-user-roles"),
    groups: splitHeader(req, "x-user-groups"),
    modulePermissions: splitHeader(req, "x-module-permissions", [
      "Alert",
      "FinOps",
      "EKS",
      "Resource",
      "Log",
      "AIOps",
      "ServiceCatalog",
      "Delivery",
    ]),
  };
}

function header(req: express.Request, name: string): string | undefined {
  const value = req.header(name);
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function splitHeader(req: express.Request, name: string, fallback: string[] = []): string[] {
  const value = header(req, name);
  if (!value) {
    return fallback;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
