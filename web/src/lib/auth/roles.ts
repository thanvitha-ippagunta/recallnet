import "server-only";

export const roles = [
  "ADMIN",
  "QUALITY_MANAGER",
  "WAREHOUSE_MANAGER",
  "DISTRIBUTOR",
] as const;

export type Role = (typeof roles)[number];

export const permissions = [
  "batches:read",
  "traceability:read",
  "audit:read",
  "recalls:read",
  "recalls:manage",
  "dashboard:read",
  "warehouse-shipments:read",
  "assigned-shipments:read",
  "downstream-shipments:dispatch",
] as const;

export type Permission = (typeof permissions)[number];

const rolePermissions: Record<Role, readonly Permission[]> = {
  ADMIN: permissions,
  QUALITY_MANAGER: [
    "batches:read",
    "traceability:read",
    "audit:read",
    "recalls:read",
    "recalls:manage",
    "dashboard:read",
  ],
  WAREHOUSE_MANAGER: ["batches:read", "warehouse-shipments:read"],
  DISTRIBUTOR: ["assigned-shipments:read", "downstream-shipments:dispatch"],
};

export function isRole(value: string): value is Role {
  return roles.some((role) => role === value);
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}
