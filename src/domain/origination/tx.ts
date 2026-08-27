import type {
  FieldDocumentRecord,
  FieldSubmissionRecord,
  FieldUploadIntentRecord,
  FieldVerificationCaseRecord,
  FieldVerificationMessageRecord,
  OriginationAuditEvent,
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

export type { FieldUploadIntentRecord };
