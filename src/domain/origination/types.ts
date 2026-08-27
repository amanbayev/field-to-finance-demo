export const FIELD_LIFECYCLE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "RESUBMITTED",
  "VERIFIED",
  "REJECTED",
  "ARCHIVED",
] as const;

export type FieldLifecycleStatus = (typeof FIELD_LIFECYCLE_STATUSES)[number];

export const FIELD_DOCUMENT_TYPES = [
  "LAND_OWNERSHIP",
  "LEASE_AGREEMENT",
  "CADASTRE_EXTRACT",
  "OTHER_EVIDENCE",
] as const;

export type FieldDocumentType = (typeof FIELD_DOCUMENT_TYPES)[number];

export const FIELD_DOCUMENT_STATUSES = [
  "UPLOADED",
  "ACCEPTED",
  "REPLACEMENT_REQUESTED",
  "SUPERSEDED",
] as const;

export type FieldDocumentStatus = (typeof FIELD_DOCUMENT_STATUSES)[number];

export const FIELD_CLASSIFICATIONS = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "PERSONAL_DATA",
] as const;

export type FieldClassification = (typeof FIELD_CLASSIFICATIONS)[number];

export const FIELD_RETENTION_STATUSES = [
  "ACTIVE",
  "ARCHIVED",
  "RETENTION_HOLD",
  "ELIGIBLE_FOR_DELETION",
] as const;

export type FieldRetentionStatus = (typeof FIELD_RETENTION_STATUSES)[number];

export const MALWARE_SCAN_STATUSES = [
  "NOT_SCANNED",
  "PENDING",
  "CLEAN",
  "QUARANTINED",
  "FAILED",
] as const;

export type MalwareScanStatus = (typeof MALWARE_SCAN_STATUSES)[number];

export const FIELD_CASE_STATUSES = [
  "NEW",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "RESUBMITTED",
  "VERIFIED",
  "REJECTED",
] as const;

export type FieldCaseStatus = (typeof FIELD_CASE_STATUSES)[number];

export const FIELD_MESSAGE_TYPES = [
  "COMMENT",
  "DOCUMENT_REQUEST",
  "DOCUMENT_UPLOADED",
  "SYSTEM",
  "DECISION",
] as const;

export type FieldMessageType = (typeof FIELD_MESSAGE_TYPES)[number];

export const FIELD_EVIDENCE_KINDS = [
  "CADASTRAL",
  "SATELLITE_IMAGERY",
  "REVIEWER_NOTE",
  "OTHER",
] as const;

export type FieldEvidenceKind = (typeof FIELD_EVIDENCE_KINDS)[number];

export const ORIGINATION_EVENT_TYPES = [
  "field_created",
  "field_updated",
  "document_uploaded",
  "document_replaced",
  "field_submitted",
  "verification_started",
  "message_sent",
  "document_replacement_requested",
  "document_accepted",
  "cadastre_verified",
  "changes_requested",
  "field_resubmitted",
  "field_verified",
  "field_rejected",
  "field_archived",
] as const;

export type OriginationEventType = (typeof ORIGINATION_EVENT_TYPES)[number];

export const PRODUCER_FIELD_FILTERS = [
  "all",
  "draft",
  "under_verification",
  "requires_attention",
  "verified",
  "archived",
] as const;

export type ProducerFieldFilter = (typeof PRODUCER_FIELD_FILTERS)[number];

export const SCAS_CASE_FILTERS = [
  "all",
  "new",
  "under_review",
  "changes_requested",
  "resubmitted",
  "verified",
  "rejected",
] as const;

export type ScasCaseFilter = (typeof SCAS_CASE_FILTERS)[number];

export const FIELD_DOCUMENT_BUCKET = "field-documents";
export const SCAS_EVIDENCE_BUCKET = "scas-evidence";
export const MAX_FIELD_FILE_BYTES = 20 * 1024 * 1024;
export const ALLOWED_FIELD_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type AllowedFieldMimeType = (typeof ALLOWED_FIELD_MIME_TYPES)[number];

export interface ProducerDeclaredData {
  name: string;
  season: number;
  crop: string;
  cadastreNumber: string;
  declaredAreaHa: number | null;
  region: string | null;
  district: string | null;
}

export interface ProducerFieldRecord {
  id: string;
  publicId: string;
  organizationId: string;
  status: FieldLifecycleStatus;
  declared: ProducerDeclaredData;
  currentSubmissionId: string | null;
  verifiedSnapshotId: string | null;
  createdByUserId: string;
  createdByRole: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface FieldDocumentRecord {
  id: string;
  fieldId: string;
  submissionId: string | null;
  documentType: FieldDocumentType;
  bucket: string;
  objectPath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  version: number;
  status: FieldDocumentStatus;
  classification: FieldClassification;
  retentionStatus: FieldRetentionStatus;
  malwareScanStatus: MalwareScanStatus;
  uploadedByUserId: string;
  uploadedAt: string;
  replacesDocumentId: string | null;
  current: boolean;
}

export interface FieldSubmissionRecord {
  id: string;
  publicId: string;
  fieldId: string;
  organizationId: string;
  version: number;
  declared: ProducerDeclaredData;
  documentIds: string[];
  submittedByUserId: string;
  submittedByRole: string;
  submittedByPersonaId: string | null;
  submittedAt: string;
}

export interface FieldVerificationCaseRecord {
  id: string;
  publicId: string;
  fieldId: string;
  organizationId: string;
  currentSubmissionId: string;
  status: FieldCaseStatus;
  assignedReviewerUserId: string | null;
  assignedReviewerPersonaId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FieldCadastreVerificationRecord {
  id: string;
  caseId: string;
  fieldId: string;
  providerId: string;
  cadastreNumber: string;
  rightHolder: string;
  rightType: string;
  registeredAreaHa: number | null;
  region: string | null;
  district: string | null;
  validityStatus: string;
  sourceReference: string;
  notes: string;
  checkedByUserId: string;
  checkedByRole: string;
  checkedByPersonaId: string | null;
  checkedAt: string;
}

export interface FieldVerificationEvidenceRecord {
  id: string;
  caseId: string;
  fieldId: string;
  kind: FieldEvidenceKind;
  notes: string;
  imageryDate: string | null;
  bucket: string | null;
  objectPath: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  uploadedByUserId: string;
  uploadedAt: string;
}

export interface FieldVerificationMessageRecord {
  id: string;
  caseId: string;
  fieldId: string;
  senderUserId: string;
  senderRole: string;
  senderPersonaId: string | null;
  body: string;
  messageType: FieldMessageType;
  linkedDocumentId: string | null;
  createdAt: string;
}

export interface VerifiedFieldSnapshotRecord {
  id: string;
  fieldId: string;
  caseId: string;
  submissionId: string;
  payload: VerifiedFieldSnapshotPayload;
  approvedByUserId: string;
  approvedByRole: string;
  approvedByPersonaId: string | null;
  approvedAt: string;
}

export interface VerifiedFieldSnapshotPayload {
  producerDeclared: ProducerDeclaredData;
  acceptedDocumentIds: string[];
  cadastreVerification: FieldCadastreVerificationRecord;
  evidenceIds: string[];
  reviewerUserId: string;
  reviewerRole: string;
  reviewerPersonaId: string | null;
  approvedAt: string;
}

export interface OriginationAuditEvent {
  id: string;
  occurredAt: string;
  actorUserId: string;
  effectiveRole: string;
  personaId: string | null;
  organizationId: string | null;
  eventType: OriginationEventType;
  objectType: string;
  objectId: string;
  result: string;
  metadata: Record<string, unknown>;
}

export class OriginationError extends Error {
  constructor(
    public readonly code:
      | "forbidden"
      | "not_found"
      | "invalid_state"
      | "immutable"
      | "validation"
      | "storage",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "OriginationError";
  }
}
