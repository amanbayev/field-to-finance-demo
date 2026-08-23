import { actorCan, type ActorContext, type Permission } from "@/domain/identity";

export const SHELL_NAV_ICONS = [
  "overview",
  "markets",
  "instruments",
  "clearing",
  "registry",
  "participants",
  "compliance",
  "supervision",
  "reports",
] as const;

export type ShellNavIcon = (typeof SHELL_NAV_ICONS)[number];

export interface ShellNavItem {
  key: string;
  href: string;
  icon: ShellNavIcon;
  label: string;
}

function hasAny(actor: ActorContext, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => actorCan(actor, permission));
}

function isRegistrarOrRegulator(actor: ActorContext): boolean {
  if (actorCan(actor, "regulator.read")) {
    return true;
  }
  return actorCan(actor, "issuance.manage") && actorCan(actor, "audit.read");
}

export function marketCoreNavForActor(
  actor: ActorContext,
  labels: Record<ShellNavIcon, string>,
): ShellNavItem[] {
  const items: Array<ShellNavItem | null> = [
    {
      key: "overview",
      href: "/",
      icon: "overview",
      label: labels.overview,
    },
    hasAny(actor, ["market.read", "regulator.read"])
      ? {
          key: "markets",
          href: "/markets",
          icon: "markets",
          label: labels.markets,
        }
      : null,
    hasAny(actor, ["issuance.read", "market.read"])
      ? {
          key: "instruments",
          href: "/instruments",
          icon: "instruments",
          label: labels.instruments,
        }
      : null,
    isRegistrarOrRegulator(actor)
      ? {
          key: "clearing",
          href: "/clearing",
          icon: "clearing",
          label: labels.clearing,
        }
      : null,
    isRegistrarOrRegulator(actor)
      ? {
          key: "registry",
          href: "/registry",
          icon: "registry",
          label: labels.registry,
        }
      : null,
    actorCan(actor, "regulator.read")
      ? {
          key: "participants",
          href: "/participants",
          icon: "participants",
          label: labels.participants,
        }
      : null,
    actorCan(actor, "compliance.read")
      ? {
          key: "compliance",
          href: "/compliance",
          icon: "compliance",
          label: labels.compliance,
        }
      : null,
    actorCan(actor, "regulator.read")
      ? {
          key: "supervision",
          href: "/supervision",
          icon: "supervision",
          label: labels.supervision,
        }
      : null,
    hasAny(actor, ["audit.read", "regulator.read"])
      ? {
          key: "reports",
          href: "/audit",
          icon: "reports",
          label: labels.reports,
        }
      : null,
  ];

  return items.filter((item): item is ShellNavItem => item !== null);
}

export function isShellNavActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  if (href === "/instruments") {
    return (
      pathname === "/instruments" ||
      pathname.startsWith("/instruments/") ||
      pathname.startsWith("/ui-v2/instruments/") ||
      pathname.startsWith("/ui-v2/design-review/instruments/")
    );
  }
  if (href === "/markets") {
    return (
      pathname === "/markets" ||
      pathname.startsWith("/markets/") ||
      pathname.startsWith("/ui-v2/markets/") ||
      pathname.startsWith("/ui-v2/design-review/markets/")
    );
  }
  if (pathname === href) {
    return true;
  }
  return pathname.startsWith(`${href}/`);
}
