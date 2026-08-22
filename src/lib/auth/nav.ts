import type { ActorContext, Permission } from "@/domain/identity";
import { actorCan, principalCan } from "@/domain/identity";

export interface PermissionNavItem {
  href: string;
  key: string;
  anyOf?: Permission[];
  principalAnyOf?: Permission[];
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

export const authenticatedNavGroups: PermissionNavGroup[] = [
  {
    key: "overview",
    items: [{ href: "/", key: "dashboard" }],
  },
  {
    key: "assets",
    items: [
      {
        href: "/contracts",
        key: "contracts",
        anyOf: ["contracts.read.all", "contracts.read.own"],
      },
      { href: "/pools", key: "pools", anyOf: ["pools.read"] },
      { href: "/tokens", key: "tokens", anyOf: ["issuance.read"] },
    ],
  },
  {
    key: "market",
    items: [
      { href: "/market", key: "marketPage", anyOf: ["market.read"] },
      { href: "/portfolio", key: "portfolio", anyOf: ["portfolio.read.own"] },
      { href: "/finance", key: "finance", anyOf: ["contracts.read.own", "market.read"] },
    ],
  },
  {
    key: "operations",
    items: [
      { href: "/scas", key: "scas", anyOf: ["scas.read"] },
      { href: "/scas/matching", key: "matching", anyOf: ["scas.match"] },
      { href: "/compliance", key: "compliance", anyOf: ["compliance.read"] },
      { href: "/regulator", key: "regulator", anyOf: ["regulator.read"] },
    ],
  },
  {
    key: "admin",
    items: [
      { href: "/admin", key: "admin", principalAnyOf: ["admin.access"] },
      { href: "/admin/users", key: "users", principalAnyOf: ["admin.users"] },
      {
        href: "/admin/organizations",
        key: "organizations",
        principalAnyOf: ["admin.organizations"],
      },
      {
        href: "/admin/demo-personas",
        key: "demoPersonas",
        principalAnyOf: ["admin.demo_personas"],
      },
    ],
  },
];

export function navGroupsForActor(
  actor: ActorContext | null,
): PermissionNavGroup[] {
  if (!actor) {
    return publicNavGroups;
  }
  return authenticatedNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.principalAnyOf) {
          return item.principalAnyOf.some((permission) =>
            principalCan(actor, permission),
          );
        }
        if (!item.anyOf) {
          return true;
        }
        return item.anyOf.some((permission) => actorCan(actor, permission));
      }),
    }))
    .filter((group) => group.items.length > 0);
}
