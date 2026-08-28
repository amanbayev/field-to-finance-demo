import {
  actorCan,
  type ActorContext,
} from "@/domain/identity";
import { isDacExecutedOrLater, isRegistrarVisibleDac } from "./state-guards";
import type {
  FieldLifecycleStatus,
  OriginationDacRecord,
  OriginationDacStatus,
  ProducerFieldFilter,
  RegistrarDacFilter,
  ScasCaseFilter,
  ScasDacFilter,
  IssuerDacFilter,
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

export function isIssuerOperator(actor: ActorContext): boolean {
  return (
    actor.effective.organization?.type === "ISSUER" &&
    actorCan(actor, "issuance.manage")
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

export function canReadOriginationDac(actor: ActorContext, dac: OriginationDacRecord): boolean {
  if (isScasVerifier(actor)) {
    return true;
  }
  if (isProducerOperator(actor) && actor.effective.organization?.id === dac.producerOrganizationId) {
    return true;
  }
  if (
    isIssuerOperator(actor) &&
    dac.issuerOrganizationId &&
    actor.effective.organization?.id === dac.issuerOrganizationId
  ) {
    return true;
  }
  if (isRegistrarIntakeOperator(actor)) {
    return isRegistrarVisibleDac(dac.status);
  }
  if (actorCan(actor, "contracts.read.all") || actorCan(actor, "fields.read.all")) {
    return isDacExecutedOrLater(dac.status);
  }
  return false;
}

export function canListLiveDacOnContractsIndex(
  actor: ActorContext,
  dac: OriginationDacRecord,
): boolean {
  if (!canReadOriginationDac(actor, dac) || dac.status === "ARCHIVED") {
    return false;
  }
  if (isProducerOperator(actor)) {
    return true;
  }
  return isDacExecutedOrLater(dac.status);
}

export function matchesScasDacFilter(status: OriginationDacStatus, filter: ScasDacFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "draft":
      return status === "DRAFT";
    case "pending":
      return status === "PENDING_PRODUCER_CONFIRMATION" || status === "PENDING_ISSUER_CONFIRMATION";
    case "executed":
      return status === "EXECUTED";
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
  if (!isRegistrarVisibleDac(status)) {
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

export function matchesIssuerDacFilter(status: OriginationDacStatus, filter: IssuerDacFilter): boolean {
  switch (filter) {
    case "all":
      return status !== "ARCHIVED";
    case "pending":
      return status === "PENDING_ISSUER_CONFIRMATION" || status === "PENDING_PRODUCER_CONFIRMATION";
    case "executed":
      return status === "EXECUTED";
    case "registrar":
      return isRegistrarVisibleDac(status);
  }
}

export function producerDacTimelineKey(
  eventType: string,
):
  | "timelineFieldVerified"
  | "timelineDacOpened"
  | "timelineSentToProducer"
  | "timelineProducerConfirmed"
  | "timelineProducerReturned"
  | "timelineIssuerConfirmed"
  | "timelineIssuerReturned"
  | "timelineSubmitted"
  | "timelineReturned"
  | "timelineAccepted"
  | null {
  switch (eventType) {
    case "field_verified":
      return "timelineFieldVerified";
    case "dac_created":
      return "timelineDacOpened";
    case "dac_sent_to_producer":
      return "timelineSentToProducer";
    case "dac_producer_confirmed":
      return "timelineProducerConfirmed";
    case "dac_producer_returned":
      return "timelineProducerReturned";
    case "dac_issuer_confirmed":
      return "timelineIssuerConfirmed";
    case "dac_issuer_returned":
      return "timelineIssuerReturned";
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
