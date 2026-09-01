import type { ActorContext, Permission } from "@/domain/identity";
import { actorCan } from "@/domain/identity";
import { navigationForActor } from "@/lib/navigation/policy";
import { getAssetProtocol } from "@/services/market-core-service";

/**
 * Adapter over the typed route registry.
 *
 * The registry (`src/lib/navigation/route-registry.ts`) and its pure selectors
 * (`src/lib/navigation/policy.ts`) are the single source of navigation policy.
 * This module only shapes the result for the existing shell components, so
 * desktop and mobile navigation share one policy source.
 *
 * Navigation visibility is not authorization. Route access remains governed by
 * the guards in `src/lib/auth/guard.ts`.
 */

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
  /** Set for a protocol section, so the shell can label the containment. */
  protocolId?: string;
  /** The protocol's display name, from the protocol record. */
  protocolLabel?: string;
  items: PermissionNavItem[];
}

export const publicNavGroups: PermissionNavGroup[] = [
  {
    key: "overview",
    items: [{ href: "/", key: "dashboard" }],
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
  return navigationForActor(actor).map((section) => ({
    key: section.kind === "PROTOCOL" ? `protocol:${section.protocolId}` : "platform",
    protocolId: section.protocolId,
    protocolLabel: section.protocolId
      ? (getAssetProtocol(section.protocolId)?.name ?? section.protocolId)
      : undefined,
    items: section.entries.map((entry) => ({ href: entry.href, key: entry.labelKey })),
  }));
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
