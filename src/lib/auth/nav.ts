import type { ActorContext, Permission } from "@/domain/identity";
import { actorCan } from "@/domain/identity";

export interface PermissionNavItem {
  href?: string;
  key: string;
  note?: boolean;
  anyOf?: Permission[];
  allOf?: Permission[];
  noneOf?: Permission[];
  noneAllOf?: Permission[];
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
const REGISTRAR_COMBO: Permission[] = ["issuance.manage", "audit.read"];
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
        href: "/issuer/dacs",
        key: "issuerDacs",
        anyOf: ["issuance.manage"],
        noneOf: ["admin.access", "audit.read"],
      },

      {
        href: "/markets",
        key: "markets",
        anyOf: ["market.read"],
        noneOf: [...ADMIN_NONE, "issuance.manage", "regulator.read"],
      },
      {
        href: "/markets",
        key: "markets",
        allOf: REGISTRAR_COMBO,
        noneOf: ["admin.access", "regulator.read"],
      },
      {
        href: "/markets",
        key: "markets",
        anyOf: ["regulator.read"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/instruments",
        key: "instruments",
        anyOf: ["regulator.read"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/issuances",
        key: "issuance",
        anyOf: ["regulator.read"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/clearing",
        key: "clearing",
        anyOf: ["regulator.read"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/registry",
        key: "registry",
        anyOf: ["regulator.read"],
        noneOf: ADMIN_NONE,
      },

      {
        href: "/participants",
        key: "participants",
        anyOf: ["regulator.read"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/compliance",
        key: "complianceParticipants",
        anyOf: ["compliance.manage"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/compliance/checks",
        key: "checks",
        anyOf: ["compliance.manage"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/compliance/eligibility",
        key: "eligibility",
        anyOf: ["compliance.manage"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/compliance/alerts",
        key: "alerts",
        anyOf: ["compliance.manage"],
        noneOf: ADMIN_NONE,
      },

      { href: "/fields", key: "myFields", anyOf: ["fields.manage.own", "contracts.manage.own"], noneOf: ADMIN_NONE },
      {
        href: "/contracts",
        key: "myContracts",
        anyOf: ["contracts.read.own"],
        noneOf: ["contracts.read.all", "admin.access"],
      },
      {
        href: "/monitoring",
        key: "monitoring",
        anyOf: ["contracts.read.own"],
        noneOf: ["contracts.read.all", "admin.access"],
      },
      {
        href: "/documents",
        key: "documents",
        anyOf: ["contracts.manage.own"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/finance",
        key: "finance",
        anyOf: ["contracts.read.own"],
        noneOf: ["contracts.read.all", "admin.access"],
      },

      { href: "/scas/verification", key: "verification", anyOf: ["scas.verify"], noneOf: ADMIN_NONE },
      { href: "/scas/dacs", key: "scasDacs", anyOf: ["scas.verify"], noneOf: ADMIN_NONE },
      { href: "/scas", key: "attestation", anyOf: ["scas.attest"], noneOf: ADMIN_NONE },
      { href: "/scas/matching", key: "matching", anyOf: ["scas.match"], noneOf: ADMIN_NONE },
      {
        href: "/scas/monitoring",
        key: "scasMonitoring",
        anyOf: ["scas.read"],
        noneOf: ADMIN_NONE,
      },

      {
        href: "/contracts",
        key: "contracts",
        anyOf: ["contracts.read.all"],
        noneOf: [...ADMIN_NONE, "regulator.read"],
        noneAllOf: REGISTRAR_COMBO,
      },
      {
        href: "/pools",
        key: "pools",
        anyOf: ["contracts.read.all"],
        noneOf: [...ADMIN_NONE, "regulator.read"],
        noneAllOf: REGISTRAR_COMBO,
      },
      {
        href: "/coverage",
        key: "coverage",
        anyOf: ["scas.read", "issuance.manage"],
        noneOf: ADMIN_NONE,
        noneAllOf: REGISTRAR_COMBO,
      },
      {
        href: "/backing",
        key: "backing",
        allOf: REGISTRAR_COMBO,
        noneOf: ["admin.access", "regulator.read"],
      },

      {
        href: "/tokens",
        key: "tokens",
        allOf: ["issuance.read", "placement.read.all", "audit.read"],
        noneOf: [...ADMIN_NONE, "regulator.read"],
      },
      {
        href: "/instruments/WHEAT-2027",
        key: "wheat2027",
        anyOf: ["issuance.manage"],
        noneOf: ["admin.access", "audit.read"],
      },
      {
        href: "/issuances/ISS-001",
        key: "iss001",
        anyOf: ["issuance.manage"],
        noneOf: ["admin.access", "audit.read"],
      },
      {
        href: "/issuances",
        key: "issuance",
        allOf: REGISTRAR_COMBO,
        noneOf: ["admin.access", "regulator.read"],
      },
      {
        href: "/placements",
        key: "primaryPlacements",
        anyOf: ["issuance.manage"],
        noneOf: ["admin.access", "audit.read"],
      },
      {
        href: "/placements",
        key: "placements",
        allOf: ["placement.read.all", "audit.read"],
        noneOf: ["admin.access", "regulator.read"],
      },
      {
        href: "/registrar/intake",
        key: "registrarIntake",
        allOf: REGISTRAR_COMBO,
        noneOf: ["admin.access", "regulator.read"],
      },
      {
        href: "/registry",
        key: "registry",
        allOf: REGISTRAR_COMBO,
        noneOf: ["admin.access", "regulator.read"],
      },
      {
        href: "/clearing",
        key: "clearing",
        allOf: REGISTRAR_COMBO,
        noneOf: ["admin.access", "regulator.read"],
      },

      {
        href: "/instruments",
        key: "instruments",
        anyOf: ["portfolio.read.own"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/portfolio",
        key: "portfolio",
        anyOf: ["portfolio.read.own"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/placements",
        key: "placementsOwn",
        anyOf: ["portfolio.read.own"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/secondary",
        key: "secondary",
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
        href: "/instruments",
        key: "traderInstruments",
        anyOf: ["market.read"],
        noneOf: TRADER_NONE,
      },
      {
        href: "/secondary",
        key: "secondary",
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
        href: "/supervision",
        key: "supervision",
        anyOf: ["regulator.read"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/audit",
        key: "reports",
        anyOf: ["regulator.read"],
        noneOf: ADMIN_NONE,
      },
      {
        href: "/audit",
        key: "audit",
        anyOf: ["audit.read"],
        noneOf: ["admin.access", "compliance.manage", "regulator.read"],
      },

      { href: "/admin/users", key: "users", anyOf: ["admin.users"] },
      { href: "/admin/organizations", key: "organizations", anyOf: ["admin.organizations"] },
      { href: "/admin/access", key: "access", anyOf: ["admin.roles"] },
      { href: "/admin/requests", key: "roleRequests", anyOf: ["admin.roles"] },
      { href: "/admin/demo-personas", key: "demoPersonas", anyOf: ["admin.demo_personas"] },
      { href: "/audit", key: "adminAudit", anyOf: ["admin.access"] },
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
  if (
    item.noneAllOf &&
    item.noneAllOf.length > 0 &&
    item.noneAllOf.every((permission) => actorCan(actor, permission))
  ) {
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
