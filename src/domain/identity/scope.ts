import { can } from "./permissions";
import type {
  ActorContext,
  DemoPersonaRecord,
  OrganizationRecord,
  Permission,
} from "./types";
import { producerAppIdFromRef } from "@/data/identity/demo-catalog";

export function actorCan(context: ActorContext, permission: Permission): boolean {
  return can(context.effective.permissions, permission);
}

export function principalCan(
  context: ActorContext,
  permission: Permission,
): boolean {
  return can(context.principal.permissions, permission);
}

export function visibleProducerIds(context: ActorContext): "all" | string[] {
  if (actorCan(context, "contracts.read.all")) {
    return "all";
  }
  if (actorCan(context, "contracts.read.own")) {
    return context.effective.producerIds;
  }
  return [];
}

export function canReadProducerRecord(
  context: ActorContext,
  producerId: string,
): boolean {
  const scope = visibleProducerIds(context);
  if (scope === "all") {
    return true;
  }
  return scope.includes(producerId);
}

export function isOwnProducerWorkspace(context: ActorContext): boolean {
  if (actorCan(context, "admin.access") || actorCan(context, "contracts.read.all")) {
    return false;
  }
  return (
    actorCan(context, "contracts.read.own") ||
    actorCan(context, "contracts.manage.own")
  );
}

export function canReadInvestorPortfolio(
  context: ActorContext,
  investorReference: string,
): boolean {
  if (actorCan(context, "placement.read.all") || actorCan(context, "regulator.read")) {
    return true;
  }
  if (!actorCan(context, "portfolio.read.own") && !actorCan(context, "placement.read.own")) {
    return false;
  }
  return context.effective.investorReference === investorReference;
}

export function producerIdsForOrganization(
  organization: OrganizationRecord | undefined,
  persona?: DemoPersonaRecord | null,
): string[] {
  const ref =
    persona?.externalProducerRef ?? organization?.externalProducerRef ?? null;
  const appId = producerAppIdFromRef(ref);
  return appId ? [appId] : [];
}

export function investorReferenceFor(
  organization: OrganizationRecord | undefined,
  persona?: DemoPersonaRecord | null,
): string | null {
  return (
    persona?.externalInvestorRef ??
    organization?.externalInvestorRef ??
    null
  );
}
