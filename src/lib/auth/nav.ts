import type { ActorContext, Permission } from "@/domain/identity";
import { actorCan } from "@/domain/identity";

export const COVERAGE_POOL_HREF = "/pools/POOL-WHEAT-2027-01";

export interface PermissionNavItem {
  href?: string;
  key: string;
  note?: boolean;
  anyOf?: Permission[];
  allOf?: Permission[];
  noneOf?: Permission[];
}

export interface PermissionNavGroup {
  key: string;
  items: PermissionNavItem[];
}

export const publicNavGroups: PermissionNavGroup[] = [
  {
    key: "overview",
    items: [{ href: "/", key: "dashboard" }],
  },
];

const ADMIN_NONE: Permission[] = ["admin.access"];

const TRADER_NONE: Permission[] = [
  "admin.access",
  "portfolio.read.own",
  "placement.read.all",
  "regulator.read",
  "scas.read",
  "issuance.manage",
];

export const authenticatedNavGroups: PermissionNavGroup[] = [
  {
    key: "effective",
    items: [
      { href: "/", key: "dashboard" },
      {
        href: "/regulator",
        key: "regulator",
        anyOf: ["regulator.read"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/compliance",
        key: "participants",
        anyOf: ["compliance.manage", "regulator.read"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/compliance",
        key: "kycKyb",
        anyOf: ["compliance.manage"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/compliance",
        key: "sanctions",
        anyOf: ["compliance.manage"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/compliance",
        key: "kytAlerts",
        anyOf: ["compliance.manage"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/compliance",
        key: "eligibility",
        anyOf: ["compliance.manage"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/compliance",
        key: "walletOwnership",
        anyOf: ["compliance.manage"],
        noneOf: ADMIN_NONE,
      },

      { href: "/contracts", key: "myFields", anyOf: ["contracts.manage.own"], noneOf: ADMIN_NONE },
      {
        href: "/contracts",
        key: "myContracts",
        anyOf: ["contracts.read.own"],
        noneOf: ["contracts.read.all", "admin.access"],
      },
      {
        href: "/pools",
        key: "monitoring",
        anyOf: ["pools.read"],
        noneOf: ["issuance.read", "scas.read", "regulator.read", "admin.access"],
      },
      {
        href: "/contracts",
        key: "documentsStatus",
        anyOf: ["contracts.manage.own"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/finance",
        key: "finance",
        anyOf: ["contracts.read.own"],
        noneOf: ["contracts.read.all", "admin.access"],
      },

      { href: "/scas", key: "attestation", anyOf: ["scas.attest"], noneOf: ADMIN_NONE },
      { href: "/scas/matching", key: "matching", anyOf: ["scas.match"], noneOf: ADMIN_NONE },
      {
        href: "/contracts",
        key: "contracts",
        anyOf: ["contracts.read.all"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/pools",
        key: "scasMonitoring",
        anyOf: ["scas.read"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/pools",
        key: "pools",
        anyOf: ["contracts.read.all"],
        noneOf: ADMIN_NONE,
      },
      {
        href: COVERAGE_POOL_HREF,
        key: "coverage",
        allOf: ["pools.read", "issuance.read", "contracts.read.all"],
        noneOf: ["admin.access", "portfolio.read.own"],
      },

      {
        href: "/tokens",
        key: "tokens",
        allOf: ["issuance.read", "placement.read.all", "audit.read"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/tokens",
        key: "wheat2027",
        anyOf: ["issuance.manage"],
        noneOf: ["admin.access", "audit.read"],
      },
      {
        href: "/tokens",
        key: "iss001",
        anyOf: ["issuance.manage"],
        noneOf: ["admin.access", "audit.read"],
      },
      {
        href: "/tokens",
        key: "issuance",
        allOf: ["issuance.manage", "audit.read"],
        noneOf: ["admin.access", "regulator.read"],
      },
      {
        href: "/market",
        key: "placements",
        anyOf: ["placement.read.all"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/market",
        key: "holdingsRegistry",
        allOf: ["issuance.manage", "audit.read"],
        noneOf: ["admin.access", "regulator.read"],
      },

      {
        href: "/tokens",
        key: "instruments",
        anyOf: ["portfolio.read.own"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/market",
        key: "myOrders",
        anyOf: ["placement.read.own"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/portfolio",
        key: "portfolio",
        anyOf: ["portfolio.read.own"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/market",
        key: "placementsOwn",
        anyOf: ["portfolio.read.own"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/compliance",
        key: "myCompliance",
        allOf: ["compliance.read", "portfolio.read.own"],
        noneOf: ADMIN_NONE,
      },

      {
        href: "/market",
        key: "traderInstruments",
        anyOf: ["market.read"],
        noneOf: TRADER_NONE,
      },
      {
        href: "/market",
        key: "positions",
        anyOf: ["market.read"],
        noneOf: TRADER_NONE,
      },
      {
        href: "/market",
        key: "orders",
        anyOf: ["market.read"],
        noneOf: TRADER_NONE,
      },
      {
        key: "secondaryClosed",
        note: true,
        anyOf: ["market.read"],
        noneOf: TRADER_NONE,
      },

      {
        href: "/compliance",
        key: "compliance",
        anyOf: ["regulator.read"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/admin/audit",
        key: "audit",
        anyOf: ["audit.read"],
        noneOf: ["admin.access", "compliance.manage"],
      },

      { href: "/admin/users", key: "users", anyOf: ["admin.users"] },
      { href: "/admin/organizations", key: "organizations", anyOf: ["admin.organizations"] },
      { href: "/admin/users", key: "memberships", anyOf: ["admin.roles"] },
      { href: "/admin/requests", key: "roleRequests", anyOf: ["admin.roles"] },
      { href: "/admin/demo-personas", key: "demoPersonas", anyOf: ["admin.demo_personas"] },
      { href: "/admin/audit", key: "adminAudit", anyOf: ["admin.access"] },
      { href: "/admin", key: "system", anyOf: ["admin.access"] },
    ],
  },
];

export function navItemVisible(
  actor: ActorContext,
  item: PermissionNavItem,
): boolean {
  if (item.anyOf && !item.anyOf.some((permission) => actorCan(actor, permission))) {
    return false;
  }
  if (item.allOf && !item.allOf.every((permission) => actorCan(actor, permission))) {
    return false;
  }
  if (item.noneOf && item.noneOf.some((permission) => actorCan(actor, permission))) {
    return false;
  }
  return true;
}

export function navGroupsForActor(
  actor: ActorContext | null,
): PermissionNavGroup[] {
  if (!actor) {
    return publicNavGroups;
  }
  return authenticatedNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => navItemVisible(actor, item)),
    }))
    .filter((group) => group.items.length > 0);
}

export function visibleNavKeys(actor: ActorContext | null): string[] {
  return navGroupsForActor(actor).flatMap((group) =>
    group.items.map((item) => item.key),
  );
}

export function visibleNavHrefs(actor: ActorContext | null): string[] {
  return navGroupsForActor(actor).flatMap((group) =>
    group.items
      .map((item) => item.href)
      .filter((href): href is string => Boolean(href)),
  );
}
