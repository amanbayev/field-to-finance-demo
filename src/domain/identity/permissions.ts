import {
  PERMISSIONS,
  type Permission,
  type PlatformRoleId,
} from "./types";

const ALL_PERMISSIONS: Permission[] = [...PERMISSIONS];

const ROLE_PERMISSIONS: Record<PlatformRoleId, readonly Permission[]> = {
  SYSTEM_ADMIN: ALL_PERMISSIONS,
  REGULATOR: [
    "contracts.read.all",
    "pools.read",
    "issuance.read",
    "market.read",
    "placement.read.all",
    "compliance.read",
    "regulator.read",
    "audit.read",
  ],
  REGISTRAR_OPERATOR: [
    "contracts.read.all",
    "pools.read",
    "issuance.read",
    "issuance.manage",
    "market.read",
    "placement.read.all",
    "audit.read",
  ],
  SCAS_OPERATOR: [
    "contracts.read.all",
    "scas.read",
    "scas.attest",
    "scas.match",
    "pools.read",
    "issuance.read",
  ],
  ISSUER_OPERATOR: [
    "contracts.read.all",
    "pools.read",
    "issuance.read",
    "issuance.manage",
    "market.read",
    "placement.read.all",
  ],
  PRODUCER_ADMIN: [
    "contracts.read.own",
    "contracts.manage.own",
    "pools.read",
  ],
  INVESTOR: [
    "market.read",
    "placement.read.own",
    "portfolio.read.own",
    "issuance.read",
    "pools.read",
    "compliance.read",
  ],
  TRADER: ["market.read", "issuance.read", "pools.read"],
  COMPLIANCE_OFFICER: [
    "compliance.read",
    "compliance.manage",
    "audit.read",
  ],
};

export function permissionsForRoles(roleIds: readonly PlatformRoleId[]): Permission[] {
  const set = new Set<Permission>();
  for (const roleId of roleIds) {
    for (const permission of ROLE_PERMISSIONS[roleId] ?? []) {
      set.add(permission);
    }
  }
  return [...set];
}

export function permissionsForRole(roleId: PlatformRoleId): Permission[] {
  return [...ROLE_PERMISSIONS[roleId]];
}

export function can(
  granted: readonly Permission[],
  permission: Permission,
): boolean {
  return granted.includes(permission);
}

export function canAny(
  granted: readonly Permission[],
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => granted.includes(permission));
}

export function hasContractsRead(granted: readonly Permission[]): boolean {
  return canAny(granted, ["contracts.read.all", "contracts.read.own"]);
}
