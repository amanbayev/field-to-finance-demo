import {
  actorCan,
  type ActorContext,
} from "@/domain/identity";
import type {
  FieldLifecycleStatus,
  OriginationDacStatus,
  ProducerFieldFilter,
  RegistrarDacFilter,
  ScasCaseFilter,
  ScasDacFilter,
} from "./types";

export function actorStamp(actor: ActorContext) {
  return {
    userId: actor.principal.userId,
    role: actor.effective.roleId,
    personaId: actor.demoPersona?.id ?? null,
    organizationId: actor.effective.organization?.id ?? null,
    organizationType: actor.effective.organization?.type ?? null,
  };
}

export function isProducerOperator(actor: ActorContext): boolean {
  return (
    actor.effective.organization?.type === "PRODUCER" &&
    actorCan(actor, "fields.manage.own")
  );
}

export function isScasVerifier(actor: ActorContext): boolean {
  return (
    actor.effective.organization?.type === "SCAS" &&
    actorCan(actor, "scas.verify")
  );
}

export function isRegistrarIntakeOperator(actor: ActorContext): boolean {
  return (
    actor.effective.organization?.type === "REGISTRAR" &&
    actorCan(actor, "issuance.manage") &&
    actorCan(actor, "audit.read")
  );
}

export function canReadOrigination(actor: ActorContext): boolean {
  return (
    isProducerOperator(actor) ||
    isScasVerifier(actor) ||
    isRegistrarIntakeOperator(actor) ||
    actorCan(actor, "fields.read.all")
  );
}

export function canReadProducerOrgFields(
  actor: ActorContext,
  organizationId: string,
): boolean {
  if (isScasVerifier(actor) || isRegistrarIntakeOperator(actor) || actorCan(actor, "fields.read.all")) {
    return true;
  }
  return isProducerOperator(actor) && actor.effective.organization?.id === organizationId;
}

export function canManageProducerOrgFields(
  actor: ActorContext,
  organizationId: string,
): boolean {
  return isProducerOperator(actor) && actor.effective.organization?.id === organizationId;
}

export function matchesProducerFilter(
  status: FieldLifecycleStatus,
  filter: ProducerFieldFilter,
): boolean {
  switch (filter) {
    case "all":
      return status !== "ARCHIVED";
    case "draft":
      return status === "DRAFT";
    case "under_verification":
      return (
        status === "SUBMITTED" ||
        status === "UNDER_REVIEW" ||
        status === "RESUBMITTED"
      );
    case "requires_attention":
      return status === "CHANGES_REQUESTED" || status === "REJECTED";
    case "verified":
      return status === "VERIFIED";
    case "archived":
      return status === "ARCHIVED";
  }
}

export function matchesScasFilter(
  status: import("./types").FieldCaseStatus,
  filter: ScasCaseFilter,
): boolean {
  if (filter === "all") {
    return true;
  }
  const map: Record<Exclude<ScasCaseFilter, "all">, import("./types").FieldCaseStatus> = {
    new: "NEW",
    under_review: "UNDER_REVIEW",
    changes_requested: "CHANGES_REQUESTED",
    resubmitted: "RESUBMITTED",
    verified: "VERIFIED",
    rejected: "REJECTED",
  };
  return status === map[filter];
}

export function producerNextAction(status: FieldLifecycleStatus): string {
  switch (status) {
    case "DRAFT":
      return "continue_draft";
    case "SUBMITTED":
    case "UNDER_REVIEW":
    case "RESUBMITTED":
      return "await_scas";
    case "CHANGES_REQUESTED":
      return "respond_to_scas";
    case "VERIFIED":
      return "verified";
    case "REJECTED":
      return "see_decision";
    case "ARCHIVED":
      return "archived";
  }
}

export function canReadOriginationDac(
  actor: ActorContext,
  producerOrganizationId: string,
  status: OriginationDacStatus,
): boolean {
  if (isScasVerifier(actor) || actorCan(actor, "fields.read.all")) {
    return true;
  }
  if (isRegistrarIntakeOperator(actor) || actorCan(actor, "contracts.read.all")) {
    return status !== "DRAFT";
  }
  return isProducerOperator(actor) && actor.effective.organization?.id === producerOrganizationId;
}

export function matchesScasDacFilter(status: OriginationDacStatus, filter: ScasDacFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "draft":
      return status === "DRAFT";
    case "ready":
      return status === "READY_FOR_REGISTRAR";
    case "under_review":
      return status === "UNDER_REGISTRAR_REVIEW";
    case "returned":
      return status === "RETURNED_BY_REGISTRAR";
    case "accepted":
      return status === "REGISTRAR_ACCEPTED";
    case "archived":
      return status === "ARCHIVED";
  }
}

export function matchesRegistrarDacFilter(
  status: OriginationDacStatus,
  filter: RegistrarDacFilter,
): boolean {
  if (status === "DRAFT" || status === "ARCHIVED") {
    return false;
  }
  switch (filter) {
    case "all":
      return true;
    case "ready":
      return status === "READY_FOR_REGISTRAR";
    case "under_review":
      return status === "UNDER_REGISTRAR_REVIEW";
    case "returned":
      return status === "RETURNED_BY_REGISTRAR";
    case "accepted":
      return status === "REGISTRAR_ACCEPTED";
  }
}

export function producerDacTimelineKey(
  eventType: string,
):
  | "timelineFieldVerified"
  | "timelineDacOpened"
  | "timelineSubmitted"
  | "timelineReturned"
  | "timelineAccepted"
  | null {
  switch (eventType) {
    case "field_verified":
      return "timelineFieldVerified";
    case "dac_created":
      return "timelineDacOpened";
    case "dac_submitted_to_registrar":
      return "timelineSubmitted";
    case "dac_returned":
      return "timelineReturned";
    case "dac_accepted":
      return "timelineAccepted";
    default:
      return null;
  }
}

export function producerNextActionMessageKey(
  status: FieldLifecycleStatus,
):
  | "actionContinueDraft"
  | "actionAwaitScas"
  | "actionRespond"
  | "actionVerified"
  | "actionRejected"
  | "actionArchived" {
  switch (producerNextAction(status)) {
    case "continue_draft":
      return "actionContinueDraft";
    case "await_scas":
      return "actionAwaitScas";
    case "respond_to_scas":
      return "actionRespond";
    case "verified":
      return "actionVerified";
    case "see_decision":
      return "actionRejected";
    default:
      return "actionArchived";
  }
}
