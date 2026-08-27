import {
  actorCan,
  type ActorContext,
} from "@/domain/identity";
import type { FieldLifecycleStatus, ProducerFieldFilter, ScasCaseFilter } from "./types";

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

export function canReadOrigination(actor: ActorContext): boolean {
  return (
    isProducerOperator(actor) ||
    isScasVerifier(actor) ||
    actorCan(actor, "fields.read.all")
  );
}

export function canReadProducerOrgFields(
  actor: ActorContext,
  organizationId: string,
): boolean {
  if (isScasVerifier(actor) || actorCan(actor, "fields.read.all")) {
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
