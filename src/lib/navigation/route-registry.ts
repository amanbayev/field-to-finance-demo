import { F2F_PROTOCOL_ID } from "@/data/market-core/catalog";
import type { OrganizationType, Permission } from "@/domain/identity";
import type { HierarchyLevel } from "@/lib/market-core/hierarchy";

/**
 * The single typed source of application navigation metadata.
 *
 * This registry decides **navigation visibility only**. It is not an
 * authorization mechanism: every route keeps its own server-side guard, and
 * hiding a link never grants or denies access. See `policy.ts`.
 */

/** Where an entry may appear. `NONE` = reachable by link or URL, never in a nav rail. */
export const NAV_PLACEMENTS = ["GLOBAL", "PROTOCOL_CONTEXT", "NONE"] as const;
export type NavPlacement = (typeof NAV_PLACEMENTS)[number];

/** Group an entry belongs to inside the global rail. */
export const NAV_GROUPS = [
  "overview",
  "market",
  "operations",
  "control",
  "admin",
] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

/**
 * Visibility predicate. Permission clauses mirror the vocabulary the route
 * guards already use; `organizationTypes` closes the gap that made
 * organisation-scoped guards (`requireScasVerifier`, `requireRegistrarIntake`,
 * `requireIssuerOperator`) inexpressible in navigation.
 */
export interface RouteVisibility {
  readonly anyOf?: readonly Permission[];
  readonly allOf?: readonly Permission[];
  readonly noneOf?: readonly Permission[];
  readonly noneAllOf?: readonly Permission[];
  readonly organizationTypes?: readonly OrganizationType[];
}

/** A concrete path. Dynamic routes use the typed builders in `hierarchy.ts`. */
export type RouteHref =
  | { readonly kind: "STATIC"; readonly path: string }
  | { readonly kind: "DYNAMIC"; readonly pattern: string };

interface RouteBase {
  readonly id: string;
  /** Key in the `nav` message namespace. Never user-facing English. */
  readonly labelKey: string;
  readonly href: RouteHref;
  readonly level: HierarchyLevel;
  readonly placement: NavPlacement;
  readonly group: NavGroup;
  readonly visibility: RouteVisibility;
}

/**
 * Platform-global destination. Protocol-neutral: it must make sense for any
 * protocol on Commodity Chain, including future non-agriculture ones.
 */
export interface PlatformRoute extends RouteBase {
  readonly scope: "PLATFORM";
}

/**
 * Destination belonging to one protocol's module set. Shown only inside that
 * protocol's context, never as a global platform item.
 */
export interface ProtocolModuleRoute extends RouteBase {
  readonly scope: "PROTOCOL_MODULE";
  readonly protocolId: string;
}

export type RegistryRoute = PlatformRoute | ProtocolModuleRoute;

/** True when `path` is this route's static href or a concrete dynamic instance. */
export function routeHrefMatchesPath(route: RegistryRoute, path: string): boolean {
  if (route.href.kind === "STATIC") {
    return route.href.path === path;
  }
  const expected = route.href.pattern.split("/");
  const actual = path.split("/");
  if (expected.length !== actual.length) {
    return false;
  }
  return expected.every((segment, index) => {
    const value = actual[index] ?? "";
    if (segment.startsWith("[") && segment.endsWith("]")) {
      return value.length > 0;
    }
    return segment === value;
  });
}

const ADMIN_NONE: readonly Permission[] = ["admin.access"];
const REGISTRAR_COMBO: readonly Permission[] = ["issuance.manage", "audit.read"];
/** Platform-global routes. Protocol-neutral by construction. */
const PLATFORM_ROUTES: readonly PlatformRoute[] = [
  {
    id: "overview",
    labelKey: "dashboard",
    href: { kind: "STATIC", path: "/" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "overview",
    scope: "PLATFORM",
    visibility: {},
  },
  {
    id: "protocols",
    labelKey: "protocols",
    href: { kind: "STATIC", path: "/protocols" },
    level: "PROTOCOL",
    placement: "GLOBAL",
    group: "market",
    scope: "PLATFORM",
    visibility: { anyOf: ["market.read", "regulator.read"], noneOf: ADMIN_NONE },
  },
  {
    id: "markets",
    labelKey: "markets",
    href: { kind: "STATIC", path: "/markets" },
    level: "MARKET",
    placement: "GLOBAL",
    group: "market",
    scope: "PLATFORM",
    visibility: { anyOf: ["market.read", "regulator.read"], noneOf: ADMIN_NONE },
  },
  {
    id: "instruments",
    labelKey: "instruments",
    href: { kind: "STATIC", path: "/instruments" },
    level: "INSTRUMENT",
    placement: "GLOBAL",
    group: "market",
    scope: "PLATFORM",
    visibility: {
      anyOf: ["issuance.read", "market.read", "regulator.read"],
      noneOf: ADMIN_NONE,
    },
  },
  {
    id: "issuances",
    labelKey: "issuance",
    href: { kind: "STATIC", path: "/issuances" },
    level: "ISSUANCE",
    placement: "GLOBAL",
    group: "market",
    scope: "PLATFORM",
    visibility: { anyOf: ["regulator.read"], noneOf: ADMIN_NONE },
  },
  {
    id: "issuances-registrar",
    labelKey: "issuance",
    href: { kind: "STATIC", path: "/issuances" },
    level: "ISSUANCE",
    placement: "GLOBAL",
    group: "market",
    scope: "PLATFORM",
    visibility: {
      allOf: REGISTRAR_COMBO,
      noneOf: ["admin.access", "regulator.read"],
    },
  },
  {
    id: "secondary",
    labelKey: "secondary",
    href: { kind: "STATIC", path: "/secondary" },
    level: "MARKET",
    placement: "GLOBAL",
    group: "market",
    scope: "PLATFORM",
    visibility: { anyOf: ["market.read"], noneOf: ADMIN_NONE },
  },
  {
    id: "portfolio",
    labelKey: "portfolio",
    href: { kind: "STATIC", path: "/portfolio" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "market",
    scope: "PLATFORM",
    visibility: { anyOf: ["portfolio.read.own"], noneOf: ADMIN_NONE },
  },
  {
    id: "placements-own",
    labelKey: "placementsOwn",
    href: { kind: "STATIC", path: "/placements" },
    level: "MARKET",
    placement: "GLOBAL",
    group: "market",
    scope: "PLATFORM",
    visibility: { anyOf: ["portfolio.read.own"], noneOf: ADMIN_NONE },
  },
  {
    id: "placements-all",
    labelKey: "placements",
    href: { kind: "STATIC", path: "/placements" },
    level: "MARKET",
    placement: "GLOBAL",
    group: "market",
    scope: "PLATFORM",
    visibility: {
      allOf: ["placement.read.all", "audit.read"],
      noneOf: ["admin.access", "regulator.read"],
    },
  },
  {
    id: "placements-issuer",
    labelKey: "primaryPlacements",
    href: { kind: "STATIC", path: "/placements" },
    level: "MARKET",
    placement: "GLOBAL",
    group: "market",
    scope: "PLATFORM",
    visibility: {
      anyOf: ["issuance.manage"],
      noneOf: ["admin.access", "audit.read"],
      organizationTypes: ["ISSUER"],
    },
  },
  {
    id: "clearing",
    labelKey: "clearing",
    href: { kind: "STATIC", path: "/clearing" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "control",
    scope: "PLATFORM",
    visibility: { anyOf: ["regulator.read"], noneOf: ADMIN_NONE },
  },
  {
    id: "clearing-registrar",
    labelKey: "clearing",
    href: { kind: "STATIC", path: "/clearing" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "control",
    scope: "PLATFORM",
    visibility: {
      allOf: REGISTRAR_COMBO,
      noneOf: ["admin.access", "regulator.read"],
    },
  },
  {
    id: "registry",
    labelKey: "registry",
    href: { kind: "STATIC", path: "/registry" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "control",
    scope: "PLATFORM",
    visibility: { anyOf: ["regulator.read"], noneOf: ADMIN_NONE },
  },
  {
    id: "registry-registrar",
    labelKey: "registry",
    href: { kind: "STATIC", path: "/registry" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "control",
    scope: "PLATFORM",
    visibility: {
      allOf: REGISTRAR_COMBO,
      noneOf: ["admin.access", "regulator.read"],
    },
  },
  {
    id: "participants",
    labelKey: "participants",
    href: { kind: "STATIC", path: "/participants" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "control",
    scope: "PLATFORM",
    visibility: { anyOf: ["regulator.read"], noneOf: ADMIN_NONE },
  },
  {
    id: "compliance-regulator",
    labelKey: "compliance",
    href: { kind: "STATIC", path: "/compliance" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "control",
    scope: "PLATFORM",
    visibility: { anyOf: ["regulator.read"], noneOf: ADMIN_NONE },
  },
  {
    id: "compliance-officer",
    labelKey: "complianceParticipants",
    href: { kind: "STATIC", path: "/compliance" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "control",
    scope: "PLATFORM",
    visibility: { anyOf: ["compliance.manage"], noneOf: ADMIN_NONE },
  },
  {
    id: "compliance-own",
    labelKey: "myCompliance",
    href: { kind: "STATIC", path: "/compliance" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "control",
    scope: "PLATFORM",
    visibility: {
      allOf: ["compliance.read", "portfolio.read.own"],
      noneOf: ADMIN_NONE,
    },
  },
  {
    id: "compliance-checks",
    labelKey: "checks",
    href: { kind: "STATIC", path: "/compliance/checks" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "control",
    scope: "PLATFORM",
    visibility: { anyOf: ["compliance.manage"], noneOf: ADMIN_NONE },
  },
  {
    id: "compliance-eligibility",
    labelKey: "eligibility",
    href: { kind: "STATIC", path: "/compliance/eligibility" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "control",
    scope: "PLATFORM",
    visibility: { anyOf: ["compliance.manage"], noneOf: ADMIN_NONE },
  },
  {
    id: "compliance-alerts",
    labelKey: "alerts",
    href: { kind: "STATIC", path: "/compliance/alerts" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "control",
    scope: "PLATFORM",
    visibility: { anyOf: ["compliance.manage"], noneOf: ADMIN_NONE },
  },
  {
    id: "supervision",
    labelKey: "supervision",
    href: { kind: "STATIC", path: "/supervision" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "control",
    scope: "PLATFORM",
    visibility: { anyOf: ["regulator.read"], noneOf: ADMIN_NONE },
  },
  {
    id: "reports",
    labelKey: "reports",
    href: { kind: "STATIC", path: "/audit" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "control",
    scope: "PLATFORM",
    visibility: { anyOf: ["regulator.read"], noneOf: ADMIN_NONE },
  },
  {
    id: "audit",
    labelKey: "audit",
    href: { kind: "STATIC", path: "/audit" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "control",
    scope: "PLATFORM",
    visibility: {
      anyOf: ["audit.read"],
      noneOf: ["admin.access", "compliance.manage", "regulator.read"],
    },
  },
  {
    id: "tokens",
    labelKey: "tokens",
    href: { kind: "STATIC", path: "/tokens" },
    level: "INSTRUMENT",
    placement: "GLOBAL",
    group: "control",
    scope: "PLATFORM",
    visibility: {
      allOf: ["issuance.read", "placement.read.all", "audit.read"],
      noneOf: [...ADMIN_NONE, "regulator.read"],
    },
  },
  {
    id: "admin-users",
    labelKey: "users",
    href: { kind: "STATIC", path: "/admin/users" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "admin",
    scope: "PLATFORM",
    visibility: { anyOf: ["admin.users"] },
  },
  {
    id: "admin-organizations",
    labelKey: "organizations",
    href: { kind: "STATIC", path: "/admin/organizations" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "admin",
    scope: "PLATFORM",
    visibility: { anyOf: ["admin.organizations"] },
  },
  {
    id: "admin-access",
    labelKey: "access",
    href: { kind: "STATIC", path: "/admin/access" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "admin",
    scope: "PLATFORM",
    visibility: { anyOf: ["admin.roles"] },
  },
  {
    id: "admin-requests",
    labelKey: "roleRequests",
    href: { kind: "STATIC", path: "/admin/requests" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "admin",
    scope: "PLATFORM",
    visibility: { anyOf: ["admin.roles"] },
  },
  {
    id: "admin-demo-personas",
    labelKey: "demoPersonas",
    href: { kind: "STATIC", path: "/admin/demo-personas" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "admin",
    scope: "PLATFORM",
    visibility: { anyOf: ["admin.demo_personas"] },
  },
  {
    id: "admin-audit",
    labelKey: "adminAudit",
    href: { kind: "STATIC", path: "/audit" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "admin",
    scope: "PLATFORM",
    visibility: { anyOf: ["admin.access"] },
  },
  {
    id: "admin-system",
    labelKey: "system",
    href: { kind: "STATIC", path: "/admin" },
    level: "PLATFORM",
    placement: "GLOBAL",
    group: "admin",
    scope: "PLATFORM",
    visibility: { anyOf: ["admin.access"] },
  },
  // Reachable by link or URL, deliberately not in any rail.
  {
    id: "architecture",
    labelKey: "architecture",
    href: { kind: "STATIC", path: "/architecture" },
    level: "PLATFORM",
    placement: "NONE",
    group: "market",
    scope: "PLATFORM",
    visibility: { anyOf: ["market.read", "regulator.read"] },
  },
  {
    id: "protocol-detail",
    labelKey: "protocols",
    href: { kind: "DYNAMIC", pattern: "/protocols/[protocolId]" },
    level: "PROTOCOL",
    placement: "NONE",
    group: "market",
    scope: "PLATFORM",
    visibility: { anyOf: ["market.read", "regulator.read"] },
  },
  {
    id: "protocol-version-detail",
    labelKey: "protocolVersion",
    href: {
      kind: "DYNAMIC",
      pattern: "/protocols/[protocolId]/versions/[versionId]",
    },
    level: "PROTOCOL_VERSION",
    placement: "NONE",
    group: "market",
    scope: "PLATFORM",
    visibility: { anyOf: ["market.read", "regulator.read"] },
  },
  {
    id: "instrument-detail",
    labelKey: "instruments",
    href: { kind: "DYNAMIC", pattern: "/instruments/[instrumentId]" },
    level: "INSTRUMENT",
    placement: "NONE",
    group: "market",
    scope: "PLATFORM",
    visibility: { anyOf: ["issuance.read", "market.read"] },
  },
  {
    id: "issuance-detail",
    labelKey: "issuance",
    href: { kind: "DYNAMIC", pattern: "/issuances/[issuanceId]" },
    level: "ISSUANCE",
    placement: "NONE",
    group: "market",
    scope: "PLATFORM",
    visibility: { anyOf: ["issuance.manage", "audit.read", "regulator.read"] },
  },
];

/**
 * Field to Finance protocol modules.
 *
 * These are agriculture-specific and must never appear as global platform
 * items. They are shown inside the Field to Finance protocol context, to the
 * personas whose existing guards already admit them. Protocol ownership uses
 * the canonical catalog id, not a second navigation-layer constant.
 */
const F2F_MODULE_ROUTES: readonly ProtocolModuleRoute[] = [
  {
    id: "f2f-fields",
    labelKey: "myFields",
    href: { kind: "STATIC", path: "/fields" },
    level: "PLATFORM",
    placement: "PROTOCOL_CONTEXT",
    group: "operations",
    scope: "PROTOCOL_MODULE",
    protocolId: F2F_PROTOCOL_ID,
    visibility: {
      anyOf: ["fields.manage.own", "contracts.manage.own"],
      noneOf: ADMIN_NONE,
      organizationTypes: ["PRODUCER"],
    },
  },
  {
    id: "f2f-contracts-own",
    labelKey: "myContracts",
    href: { kind: "STATIC", path: "/contracts" },
    level: "PLATFORM",
    placement: "PROTOCOL_CONTEXT",
    group: "operations",
    scope: "PROTOCOL_MODULE",
    protocolId: F2F_PROTOCOL_ID,
    visibility: {
      anyOf: ["contracts.read.own"],
      noneOf: ["contracts.read.all", "admin.access"],
    },
  },
  {
    id: "f2f-contracts-all",
    labelKey: "contracts",
    href: { kind: "STATIC", path: "/contracts" },
    level: "PLATFORM",
    placement: "PROTOCOL_CONTEXT",
    group: "operations",
    scope: "PROTOCOL_MODULE",
    protocolId: F2F_PROTOCOL_ID,
    visibility: {
      anyOf: ["contracts.read.all"],
      noneOf: [...ADMIN_NONE, "regulator.read"],
      noneAllOf: REGISTRAR_COMBO,
    },
  },
  {
    id: "f2f-monitoring-own",
    labelKey: "monitoring",
    href: { kind: "STATIC", path: "/monitoring" },
    level: "PLATFORM",
    placement: "PROTOCOL_CONTEXT",
    group: "operations",
    scope: "PROTOCOL_MODULE",
    protocolId: F2F_PROTOCOL_ID,
    visibility: {
      anyOf: ["contracts.read.own"],
      noneOf: ["contracts.read.all", "admin.access"],
    },
  },
  {
    id: "f2f-documents",
    labelKey: "documents",
    href: { kind: "STATIC", path: "/documents" },
    level: "PLATFORM",
    placement: "PROTOCOL_CONTEXT",
    group: "operations",
    scope: "PROTOCOL_MODULE",
    protocolId: F2F_PROTOCOL_ID,
    visibility: {
      anyOf: ["contracts.manage.own"],
      noneOf: ADMIN_NONE,
      organizationTypes: ["PRODUCER"],
    },
  },
  {
    id: "f2f-finance",
    labelKey: "finance",
    href: { kind: "STATIC", path: "/finance" },
    level: "PLATFORM",
    placement: "PROTOCOL_CONTEXT",
    group: "operations",
    scope: "PROTOCOL_MODULE",
    protocolId: F2F_PROTOCOL_ID,
    visibility: {
      anyOf: ["contracts.read.own"],
      noneOf: ["contracts.read.all", "admin.access"],
    },
  },
  {
    id: "f2f-scas-verification",
    labelKey: "verification",
    href: { kind: "STATIC", path: "/scas/verification" },
    level: "PLATFORM",
    placement: "PROTOCOL_CONTEXT",
    group: "operations",
    scope: "PROTOCOL_MODULE",
    protocolId: F2F_PROTOCOL_ID,
    visibility: {
      anyOf: ["scas.verify"],
      noneOf: ADMIN_NONE,
      organizationTypes: ["SCAS"],
    },
  },
  {
    id: "f2f-scas-dacs",
    labelKey: "scasDacs",
    href: { kind: "STATIC", path: "/scas/dacs" },
    level: "PLATFORM",
    placement: "PROTOCOL_CONTEXT",
    group: "operations",
    scope: "PROTOCOL_MODULE",
    protocolId: F2F_PROTOCOL_ID,
    visibility: {
      anyOf: ["scas.verify"],
      noneOf: ADMIN_NONE,
      organizationTypes: ["SCAS"],
    },
  },
  {
    id: "f2f-scas-attestation",
    labelKey: "attestation",
    href: { kind: "STATIC", path: "/scas" },
    level: "PLATFORM",
    placement: "PROTOCOL_CONTEXT",
    group: "operations",
    scope: "PROTOCOL_MODULE",
    protocolId: F2F_PROTOCOL_ID,
    visibility: { anyOf: ["scas.attest"], noneOf: ADMIN_NONE },
  },
  {
    id: "f2f-scas-matching",
    labelKey: "matching",
    href: { kind: "STATIC", path: "/scas/matching" },
    level: "PLATFORM",
    placement: "PROTOCOL_CONTEXT",
    group: "operations",
    scope: "PROTOCOL_MODULE",
    protocolId: F2F_PROTOCOL_ID,
    visibility: { anyOf: ["scas.match"], noneOf: ADMIN_NONE },
  },
  {
    id: "f2f-scas-monitoring",
    labelKey: "scasMonitoring",
    href: { kind: "STATIC", path: "/scas/monitoring" },
    level: "PLATFORM",
    placement: "PROTOCOL_CONTEXT",
    group: "operations",
    scope: "PROTOCOL_MODULE",
    protocolId: F2F_PROTOCOL_ID,
    visibility: { anyOf: ["scas.read"], noneOf: ADMIN_NONE },
  },
  {
    id: "f2f-pools",
    labelKey: "pools",
    href: { kind: "STATIC", path: "/pools" },
    level: "PLATFORM",
    placement: "PROTOCOL_CONTEXT",
    group: "operations",
    scope: "PROTOCOL_MODULE",
    protocolId: F2F_PROTOCOL_ID,
    visibility: {
      anyOf: ["contracts.read.all"],
      noneOf: [...ADMIN_NONE, "regulator.read"],
      noneAllOf: REGISTRAR_COMBO,
    },
  },
  {
    id: "f2f-coverage",
    labelKey: "coverage",
    href: { kind: "STATIC", path: "/coverage" },
    level: "PLATFORM",
    placement: "PROTOCOL_CONTEXT",
    group: "operations",
    scope: "PROTOCOL_MODULE",
    protocolId: F2F_PROTOCOL_ID,
    visibility: {
      anyOf: ["scas.read", "issuance.manage"],
      noneOf: ADMIN_NONE,
      noneAllOf: REGISTRAR_COMBO,
    },
  },
  {
    id: "f2f-backing",
    labelKey: "backing",
    href: { kind: "STATIC", path: "/backing" },
    level: "PLATFORM",
    placement: "PROTOCOL_CONTEXT",
    group: "operations",
    scope: "PROTOCOL_MODULE",
    protocolId: F2F_PROTOCOL_ID,
    visibility: {
      allOf: REGISTRAR_COMBO,
      noneOf: ["admin.access", "regulator.read"],
      organizationTypes: ["REGISTRAR"],
    },
  },
  {
    id: "f2f-issuer-dacs",
    labelKey: "issuerDacs",
    href: { kind: "STATIC", path: "/issuer/dacs" },
    level: "PLATFORM",
    placement: "PROTOCOL_CONTEXT",
    group: "operations",
    scope: "PROTOCOL_MODULE",
    protocolId: F2F_PROTOCOL_ID,
    visibility: {
      anyOf: ["issuance.manage"],
      noneOf: ["admin.access", "audit.read"],
      organizationTypes: ["ISSUER"],
    },
  },
  {
    id: "f2f-registrar-intake",
    labelKey: "registrarIntake",
    href: { kind: "STATIC", path: "/registrar/intake" },
    level: "PLATFORM",
    placement: "PROTOCOL_CONTEXT",
    group: "operations",
    scope: "PROTOCOL_MODULE",
    protocolId: F2F_PROTOCOL_ID,
    visibility: {
      allOf: REGISTRAR_COMBO,
      noneOf: ["admin.access", "regulator.read"],
      organizationTypes: ["REGISTRAR"],
    },
  },
];

export const ROUTE_REGISTRY: readonly RegistryRoute[] = Object.freeze([
  ...PLATFORM_ROUTES,
  ...F2F_MODULE_ROUTES,
]);

export function routeById(id: string): RegistryRoute | undefined {
  return ROUTE_REGISTRY.find((route) => route.id === id);
}

export function isProtocolModuleRoute(
  route: RegistryRoute,
): route is ProtocolModuleRoute {
  return route.scope === "PROTOCOL_MODULE";
}
