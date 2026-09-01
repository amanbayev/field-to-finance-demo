import {
  PERMISSIONS,
  type Permission,
  type PlatformRoleId,
} from "./types";

const ALL_PERMISSIONS: Permission[] = [...PERMISSIONS];
const ADMIN_EXCLUDED_OPERATIONAL: Permission[] = [
  "scas.verify",
  "fields.manage.own",
  "fields.read.own",
  "fields.read.all",
  "market.trade",
];

const ROLE_PERMISSIONS: Record<PlatformRoleId, readonly Permission[]> = {
  SYSTEM_ADMIN: ALL_PERMISSIONS.filter(
    (permission) => !ADMIN_EXCLUDED_OPERATIONAL.includes(permission),
  ),
  REGULATOR: [
    "contracts.read.all",
    "pools.read",
    "issuance.read",
    "market.read",
    "placement.read.all",
    "compliance.read",
    "regulator.read",
    "audit.read",
    "fields.read.all",
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
    "scas.verify",
    "fields.read.all",
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
    "fields.read.own",
    "fields.manage.own",
    "pools.read",
  ],
  INVESTOR: [
    "market.read",
    "market.trade",
    "placement.read.own",
    "portfolio.read.own",
    "issuance.read",
    "pools.read",
    "compliance.read",
  ],
  TRADER: ["market.read", "market.trade", "issuance.read", "pools.read"],
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
