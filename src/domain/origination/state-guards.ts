import type { DacTransitionKind } from "./tx";
import {
  DAC_CONFIRMATION_PENDING_STATUSES,
  DAC_EXECUTED_OR_LATER_STATUSES,
  REGISTRAR_VISIBLE_DAC_STATUSES,
  SCAS_DAC_EDITABLE_STATUSES,
  type FieldCaseStatus,
  type FieldLifecycleStatus,
  type OriginationDacStatus,
} from "./types";

export const DAC_EXACT_TRANSITIONS: Record<
  DacTransitionKind,
  { from: readonly OriginationDacStatus[]; to: OriginationDacStatus }
> = {
  update_draft: { from: ["DRAFT"], to: "DRAFT" },
  send_to_producer: { from: ["DRAFT"], to: "PENDING_PRODUCER_CONFIRMATION" },
  producer_confirm: { from: ["PENDING_PRODUCER_CONFIRMATION"], to: "PENDING_ISSUER_CONFIRMATION" },
  producer_return: { from: ["PENDING_PRODUCER_CONFIRMATION"], to: "DRAFT" },
  issuer_confirm: { from: ["PENDING_ISSUER_CONFIRMATION"], to: "EXECUTED" },
  issuer_return: { from: ["PENDING_ISSUER_CONFIRMATION"], to: "DRAFT" },
  submit_to_registrar: { from: ["EXECUTED", "RETURNED_BY_REGISTRAR"], to: "READY_FOR_REGISTRAR" },
  start_review: { from: ["READY_FOR_REGISTRAR"], to: "UNDER_REGISTRAR_REVIEW" },
  accept: { from: ["UNDER_REGISTRAR_REVIEW"], to: "REGISTRAR_ACCEPTED" },
  return_intake: { from: ["UNDER_REGISTRAR_REVIEW"], to: "RETURNED_BY_REGISTRAR" },
};

export const PRODUCER_UPLOAD_FIELD_STATUSES: readonly FieldLifecycleStatus[] = [
  "DRAFT",
  "CHANGES_REQUESTED",
];

export const CHANGE_REQUEST_FIELD_STATUSES: readonly FieldLifecycleStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "RESUBMITTED",
  "CHANGES_REQUESTED",
];

export const CHANGE_REQUEST_CASE_STATUSES: readonly FieldCaseStatus[] = [
  "NEW",
  "UNDER_REVIEW",
  "RESUBMITTED",
  "CHANGES_REQUESTED",
];

export const APPROVAL_FIELD_STATUSES: readonly FieldLifecycleStatus[] = ["UNDER_REVIEW"];

export const APPROVAL_CASE_STATUSES: readonly FieldCaseStatus[] = ["UNDER_REVIEW"];

export const REJECTION_FIELD_STATUSES: readonly FieldLifecycleStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "RESUBMITTED",
  "CHANGES_REQUESTED",
];

export const REJECTION_CASE_STATUSES: readonly FieldCaseStatus[] = [
  "NEW",
  "UNDER_REVIEW",
  "RESUBMITTED",
  "CHANGES_REQUESTED",
];

export function allowsProducerUpload(status: FieldLifecycleStatus) {
  return PRODUCER_UPLOAD_FIELD_STATUSES.includes(status);
}

export function allowsChangeRequest(field: FieldLifecycleStatus, verificationCase: FieldCaseStatus) {
  return (
    CHANGE_REQUEST_FIELD_STATUSES.includes(field) &&
    CHANGE_REQUEST_CASE_STATUSES.includes(verificationCase)
  );
}

export function allowsApproval(field: FieldLifecycleStatus, verificationCase: FieldCaseStatus) {
  return APPROVAL_FIELD_STATUSES.includes(field) && APPROVAL_CASE_STATUSES.includes(verificationCase);
}

export function allowsRejection(field: FieldLifecycleStatus, verificationCase: FieldCaseStatus) {
  return REJECTION_FIELD_STATUSES.includes(field) && REJECTION_CASE_STATUSES.includes(verificationCase);
}

export function allowsScasDacEdit(status: OriginationDacStatus) {
  return (SCAS_DAC_EDITABLE_STATUSES as readonly OriginationDacStatus[]).includes(status);
}

export function allowsScasSendToProducer(status: OriginationDacStatus) {
  return status === "DRAFT";
}

export function allowsScasDacSubmit(status: OriginationDacStatus) {
  return status === "EXECUTED" || status === "RETURNED_BY_REGISTRAR";
}

export function allowsProducerDacConfirm(status: OriginationDacStatus) {
  return status === "PENDING_PRODUCER_CONFIRMATION";
}

export function allowsIssuerDacConfirm(status: OriginationDacStatus) {
  return status === "PENDING_ISSUER_CONFIRMATION";
}

export function allowsRegistrarReviewStart(status: OriginationDacStatus) {
  return status === "READY_FOR_REGISTRAR";
}

export function allowsRegistrarDecision(status: OriginationDacStatus) {
  return status === "UNDER_REGISTRAR_REVIEW";
}

export function isDacConfirmationPending(status: OriginationDacStatus) {
  return (DAC_CONFIRMATION_PENDING_STATUSES as readonly OriginationDacStatus[]).includes(status);
}

export function isDacExecutedOrLater(status: OriginationDacStatus) {
  return (DAC_EXECUTED_OR_LATER_STATUSES as readonly OriginationDacStatus[]).includes(status);
}

export function isRegistrarVisibleDac(status: OriginationDacStatus) {
  return (REGISTRAR_VISIBLE_DAC_STATUSES as readonly OriginationDacStatus[]).includes(status);
}
