import type {
  FieldDocumentRecord,
  FieldSubmissionRecord,
  FieldUploadIntentRecord,
  FieldVerificationCaseRecord,
  FieldVerificationMessageRecord,
  OriginationAuditEvent,
  OriginationDacMessageRecord,
  OriginationDacRecord,
  OriginationDacStatus,
  ProducerFieldRecord,
  VerifiedFieldSnapshotRecord,
} from "./types";

export type DocumentCommitBundle = {
  intentId: string | null;
  document: FieldDocumentRecord;
  supersededId: string | null;
  message: FieldVerificationMessageRecord | null;
  event: OriginationAuditEvent;
};

export type SubmissionBundle = {
  expectedFieldStatus: "DRAFT" | "CHANGES_REQUESTED";
  field: ProducerFieldRecord;
  submission: FieldSubmissionRecord;
  verificationCase: FieldVerificationCaseRecord;
  caseIsNew: boolean;
  event: OriginationAuditEvent;
};

export type ChangeRequestBundle = {
  field: ProducerFieldRecord;
  verificationCase: FieldVerificationCaseRecord;
  document: FieldDocumentRecord | null;
  message: FieldVerificationMessageRecord;
  events: OriginationAuditEvent[];
};

export type ApprovalBundle = {
  snapshot: VerifiedFieldSnapshotRecord;
  field: ProducerFieldRecord;
  verificationCase: FieldVerificationCaseRecord;
  message: FieldVerificationMessageRecord;
  event: OriginationAuditEvent;
};

export type RejectionBundle = {
  field: ProducerFieldRecord;
  verificationCase: FieldVerificationCaseRecord;
  message: FieldVerificationMessageRecord;
  event: OriginationAuditEvent;
};

export type DacTransitionKind =
  | "update_draft"
  | "send_to_producer"
  | "producer_confirm"
  | "producer_return"
  | "issuer_confirm"
  | "issuer_return"
  | "submit_to_registrar"
  | "start_review"
  | "accept"
  | "return_intake";

export type DacTransitionBundle = {
  kind: DacTransitionKind;
  expectedStatuses: OriginationDacStatus[];
  expectedProducerOrganizationId?: string | null;
  expectedIssuerOrganizationId?: string | null;
  expectedTermsHash?: string | null;
  dac: OriginationDacRecord;
  event: OriginationAuditEvent;
  message?: OriginationDacMessageRecord | null;
};

export type { FieldUploadIntentRecord };
