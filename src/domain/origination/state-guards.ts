import {
  SCAS_DAC_EDITABLE_STATUSES,
  type FieldCaseStatus,
  type FieldLifecycleStatus,
  type OriginationDacStatus,
} from "./types";

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

export function allowsScasDacSubmit(status: OriginationDacStatus) {
  return status === "DRAFT" || status === "RETURNED_BY_REGISTRAR";
}

export function allowsRegistrarReviewStart(status: OriginationDacStatus) {
  return status === "READY_FOR_REGISTRAR";
}

export function allowsRegistrarDecision(status: OriginationDacStatus) {
  return status === "READY_FOR_REGISTRAR" || status === "UNDER_REGISTRAR_REVIEW";
}
