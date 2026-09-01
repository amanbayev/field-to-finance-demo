import { actorCan, type ActorContext } from "@/domain/identity";
import {
  ROUTE_REGISTRY,
  isProtocolModuleRoute,
  type NavGroup,
  type ProtocolModuleRoute,
  type RegistryRoute,
  type RouteVisibility,
} from "@/lib/navigation/route-registry";

/**
 * Pure navigation policy.
 *
 * **Visibility is not authorization.** These selectors decide which
 * destinations are *offered*. Whether a request is allowed remains the job of
 * the route guards in `src/lib/auth/guard.ts`, which are unchanged. Hiding a
 * link neither grants nor denies access.
 */

function organizationTypeAllowed(
  actor: ActorContext,
  visibility: RouteVisibility,
): boolean {
  if (!visibility.organizationTypes) {
    return true;
  }
  const type = actor.effective.organization?.type;
  if (!type) {
    return false;
  }
  return visibility.organizationTypes.includes(type);
}

export function routeVisibleTo(actor: ActorContext, route: RegistryRoute): boolean {
  const { visibility } = route;
  if (visibility.anyOf && !visibility.anyOf.some((p) => actorCan(actor, p))) {
    return false;
  }
  if (visibility.allOf && !visibility.allOf.every((p) => actorCan(actor, p))) {
    return false;
  }
  if (visibility.noneOf && visibility.noneOf.some((p) => actorCan(actor, p))) {
    return false;
  }
  if (
    visibility.noneAllOf &&
    visibility.noneAllOf.length > 0 &&
    visibility.noneAllOf.every((p) => actorCan(actor, p))
  ) {
    return false;
  }
  return organizationTypeAllowed(actor, visibility);
}

/** Platform-global destinations. Never protocol-specific. */
export function visibleGlobalRoutes(
  actor: ActorContext | null,
): readonly RegistryRoute[] {
  if (!actor) {
    return ROUTE_REGISTRY.filter(
      (route) => route.id === "overview" && route.placement === "GLOBAL",
    );
  }
  return ROUTE_REGISTRY.filter(
    (route) =>
      route.placement === "GLOBAL" &&
      route.scope === "PLATFORM" &&
      routeVisibleTo(actor, route),
  );
}

/**
 * Modules of one protocol. Returns an empty list for an unknown protocol, and
 * never returns another protocol's modules — so a non-agriculture context can
 * never surface Field to Finance modules.
 */
export function visibleProtocolModuleRoutes(
  actor: ActorContext | null,
  protocolId: string | null,
): readonly ProtocolModuleRoute[] {
  if (!actor || !protocolId) {
    return [];
  }
  return ROUTE_REGISTRY.filter(
    (route): route is ProtocolModuleRoute =>
      isProtocolModuleRoute(route) &&
      route.protocolId === protocolId &&
      route.placement === "PROTOCOL_CONTEXT" &&
      routeVisibleTo(actor, route),
  );
}

/** Protocols for which this actor can see at least one module. */
export function protocolContextsForActor(
  actor: ActorContext | null,
): readonly string[] {
  if (!actor) {
    return [];
  }
  const ids = new Set<string>();
  for (const route of ROUTE_REGISTRY) {
    if (isProtocolModuleRoute(route) && routeVisibleTo(actor, route)) {
      ids.add(route.protocolId);
    }
  }
  return [...ids];
}

export interface NavigationEntry {
  readonly id: string;
  readonly labelKey: string;
  readonly href: string;
  readonly group: NavGroup;
}

export interface NavigationSection {
  readonly kind: "PLATFORM" | "PROTOCOL";
  /** Message key for a platform section; protocol sections use `protocolId`. */
  readonly labelKey?: string;
  readonly protocolId?: string;
  readonly entries: readonly NavigationEntry[];
}

function toEntry(route: RegistryRoute): NavigationEntry | null {
  if (route.href.kind !== "STATIC") {
    return null;
  }
  return {
    id: route.id,
    labelKey: route.labelKey,
    href: route.href.path,
    group: route.group,
  };
}

/**
 * The navigation an actor should see: one platform section plus one section per
 * protocol whose modules they can reach. Empty sections are omitted.
 */
export function navigationForActor(
  actor: ActorContext | null,
): readonly NavigationSection[] {
  const sections: NavigationSection[] = [];

  const platform = visibleGlobalRoutes(actor)
    .map(toEntry)
    .filter((entry): entry is NavigationEntry => entry !== null);
  if (platform.length > 0) {
    sections.push({ kind: "PLATFORM", labelKey: "platform", entries: platform });
  }

  for (const protocolId of protocolContextsForActor(actor)) {
    const entries = visibleProtocolModuleRoutes(actor, protocolId)
      .map(toEntry)
      .filter((entry): entry is NavigationEntry => entry !== null);
    if (entries.length > 0) {
      sections.push({ kind: "PROTOCOL", protocolId, entries });
    }
  }

  return sections;
}

export function visibleNavigationHrefs(actor: ActorContext | null): readonly string[] {
  return navigationForActor(actor).flatMap((section) =>
    section.entries.map((entry) => entry.href),
  );
}

export function visibleNavigationIds(actor: ActorContext | null): readonly string[] {
  return navigationForActor(actor).flatMap((section) =>
    section.entries.map((entry) => entry.id),
  );
}
