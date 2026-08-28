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

export const FIELD_UPLOAD_INTENT_STATUSES = ["PREPARED", "COMMITTED", "EXPIRED"] as const;

export type FieldUploadIntentStatus = (typeof FIELD_UPLOAD_INTENT_STATUSES)[number];

export const UPLOAD_INTENT_TTL_MS = 30 * 60 * 1000;

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
  "dac_created",
  "dac_updated",
  "dac_submitted_to_registrar",
  "dac_review_started",
  "dac_returned",
  "dac_accepted",
  "dac_archived",
  "dac_message_sent",
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

export const ORIGINATION_DAC_STATUSES = [
  "DRAFT",
  "READY_FOR_REGISTRAR",
  "UNDER_REGISTRAR_REVIEW",
  "RETURNED_BY_REGISTRAR",
  "REGISTRAR_ACCEPTED",
  "ARCHIVED",
] as const;

export type OriginationDacStatus = (typeof ORIGINATION_DAC_STATUSES)[number];

export const ACTIVE_ORIGINATION_DAC_STATUSES = ORIGINATION_DAC_STATUSES.filter(
  (status) => status !== "ARCHIVED",
) as OriginationDacStatus[];

export const SCAS_DAC_EDITABLE_STATUSES = ["DRAFT", "RETURNED_BY_REGISTRAR"] as const;

export type ScasDacEditableStatus = (typeof SCAS_DAC_EDITABLE_STATUSES)[number];

export const ORIGINATION_DAC_MESSAGE_TYPES = ["COMMENT", "SYSTEM", "DECISION"] as const;

export type OriginationDacMessageType = (typeof ORIGINATION_DAC_MESSAGE_TYPES)[number];

export const SCAS_DAC_FILTERS = [
  "all",
  "draft",
  "ready",
  "under_review",
  "returned",
  "accepted",
  "archived",
] as const;

export type ScasDacFilter = (typeof SCAS_DAC_FILTERS)[number];

export const REGISTRAR_DAC_FILTERS = [
  "all",
  "ready",
  "under_review",
  "returned",
  "accepted",
] as const;

export type RegistrarDacFilter = (typeof REGISTRAR_DAC_FILTERS)[number];

/** Demonstrator fixtures use DAC-2027-0001..0013. Live origination starts here. */
export const LIVE_ORIGINATION_DAC_SEQUENCE_START = 14;

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
  clientCreateRequestId: string | null;
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

export interface VerifiedAcceptedDocument {
  id: string;
  documentType: FieldDocumentType;
  version: number;
  sha256: string;
}

export interface VerifiedFieldSnapshotPayload {
  producerDeclared: ProducerDeclaredData;
  submissionId: string;
  submissionVersion: number;
  acceptedDocumentIds: string[];
  acceptedDocuments: VerifiedAcceptedDocument[];
  cadastreVerification: FieldCadastreVerificationRecord;
  evidenceIds: string[];
  reviewerUserId: string;
  reviewerRole: string;
  reviewerPersonaId: string | null;
  approvedAt: string;
}

export interface FieldUploadIntentRecord {
  id: string;
  organizationId: string;
  fieldId: string;
  documentId: string;
  documentType: FieldDocumentType;
  objectPath: string;
  originalFilename: string;
  mimeType: string;
  expectedSizeBytes: number;
  version: number;
  replacesDocumentId: string | null;
  createdByUserId: string;
  createdAt: string;
  expiresAt: string;
  status: FieldUploadIntentStatus;
}

export interface OriginationDacRecord {
  id: string;
  publicId: string;
  fieldId: string;
  verifiedSnapshotId: string;
  scasCaseId: string;
  producerOrganizationId: string;
  status: OriginationDacStatus;
  crop: string;
  harvestYear: number;
  expectedVolumeTonnes: number | null;
  qualityClass: string | null;
  producerReference: string | null;
  cadastreNumber: string;
  declaredAreaHectares: number | null;
  verifiedAreaHectares: number | null;
  region: string | null;
  district: string | null;
  rightHolder: string;
  rightType: string;
  scasNotes: string;
  registrarNotes: string;
  createdByUserId: string;
  updatedByUserId: string;
  registrarReviewedByUserId: string | null;
  submittedToRegistrarAt: string | null;
  acceptedAt: string | null;
  returnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OriginationDacCommercialInput {
  crop: string;
  harvestYear: number;
  expectedVolumeTonnes: number | null;
  qualityClass: string | null;
  producerReference: string | null;
  scasNotes: string;
}

export interface OriginationDacMessageRecord {
  id: string;
  dacId: string;
  senderUserId: string;
  senderRole: string;
  senderPersonaId: string | null;
  body: string;
  messageType: OriginationDacMessageType;
  createdAt: string;
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
