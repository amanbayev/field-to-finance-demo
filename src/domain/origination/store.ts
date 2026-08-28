import type { OrganizationRecord } from "@/domain/identity";
import type {
  ApprovalBundle,
  ChangeRequestBundle,
  DacTransitionBundle,
  DocumentCommitBundle,
  RejectionBundle,
  SubmissionBundle,
} from "./tx";
import type {
  FieldCadastreVerificationRecord,
  FieldDocumentRecord,
  FieldSubmissionRecord,
  FieldUploadIntentRecord,
  FieldVerificationCaseRecord,
  FieldVerificationEvidenceRecord,
  FieldVerificationMessageRecord,
  OriginationAuditEvent,
  OriginationDacMessageRecord,
  OriginationDacRecord,
  ProducerFieldRecord,
  VerifiedFieldSnapshotRecord,
} from "./types";

export interface OriginationBlob {
  bucket: string;
  objectPath: string;
  bytes: Uint8Array;
  contentType: string;
}

export interface OriginationStore {
  nextFieldSequence(): Promise<number>;
  nextCaseSequence(): Promise<number>;
  nextSubmissionSequence(): Promise<number>;
  insertField(record: ProducerFieldRecord): Promise<ProducerFieldRecord>;
  createFieldIdempotent(
    record: ProducerFieldRecord,
    event: OriginationAuditEvent,
  ): Promise<ProducerFieldRecord>;
  updateField(record: ProducerFieldRecord): Promise<ProducerFieldRecord>;
  getFieldById(id: string): Promise<ProducerFieldRecord | null>;
  getFieldByPublicId(publicId: string): Promise<ProducerFieldRecord | null>;
  listFieldsByOrganization(organizationId: string): Promise<ProducerFieldRecord[]>;
  listAllFields(): Promise<ProducerFieldRecord[]>;
  insertDocument(record: FieldDocumentRecord): Promise<FieldDocumentRecord>;
  updateDocument(record: FieldDocumentRecord): Promise<FieldDocumentRecord>;
  getDocument(id: string): Promise<FieldDocumentRecord | null>;
  listDocuments(fieldId: string): Promise<FieldDocumentRecord[]>;
  deleteDocument(id: string): Promise<void>;
  insertSubmission(record: FieldSubmissionRecord): Promise<FieldSubmissionRecord>;
  getSubmission(id: string): Promise<FieldSubmissionRecord | null>;
  listSubmissions(fieldId: string): Promise<FieldSubmissionRecord[]>;
  insertCase(record: FieldVerificationCaseRecord): Promise<FieldVerificationCaseRecord>;
  updateCase(record: FieldVerificationCaseRecord): Promise<FieldVerificationCaseRecord>;
  getCaseById(id: string): Promise<FieldVerificationCaseRecord | null>;
  getCaseByPublicId(publicId: string): Promise<FieldVerificationCaseRecord | null>;
  getCaseByFieldId(fieldId: string): Promise<FieldVerificationCaseRecord | null>;
  listCases(): Promise<FieldVerificationCaseRecord[]>;
  upsertCadastre(record: FieldCadastreVerificationRecord): Promise<FieldCadastreVerificationRecord>;
  getCadastreByCase(caseId: string): Promise<FieldCadastreVerificationRecord | null>;
  insertEvidence(record: FieldVerificationEvidenceRecord): Promise<FieldVerificationEvidenceRecord>;
  listEvidence(caseId: string): Promise<FieldVerificationEvidenceRecord[]>;
  insertMessage(record: FieldVerificationMessageRecord): Promise<FieldVerificationMessageRecord>;
  listMessages(caseId: string): Promise<FieldVerificationMessageRecord[]>;
  insertSnapshot(record: VerifiedFieldSnapshotRecord): Promise<VerifiedFieldSnapshotRecord>;
  getSnapshotByField(fieldId: string): Promise<VerifiedFieldSnapshotRecord | null>;
  insertEvent(record: OriginationAuditEvent): Promise<OriginationAuditEvent>;
  listEvents(objectType: string, objectId: string): Promise<OriginationAuditEvent[]>;
  listEventsByField(fieldId: string): Promise<OriginationAuditEvent[]>;
  putBlob(blob: OriginationBlob): Promise<void>;
  getBlob(bucket: string, objectPath: string): Promise<OriginationBlob | null>;
  removeBlob(bucket: string, objectPath: string): Promise<void>;
  hasPublicObjectUrl(bucket: string, objectPath: string): Promise<boolean>;
  prepareUploadIntent(record: FieldUploadIntentRecord): Promise<FieldUploadIntentRecord>;
  getUploadIntent(id: string): Promise<FieldUploadIntentRecord | null>;
  commitDocumentBundle(input: DocumentCommitBundle): Promise<FieldDocumentRecord>;
  applySubmissionBundle(input: SubmissionBundle): Promise<{
    field: ProducerFieldRecord;
    submission: FieldSubmissionRecord;
    verificationCase: FieldVerificationCaseRecord;
  }>;
  applyChangeRequestBundle(input: ChangeRequestBundle): Promise<void>;
  applyApprovalBundle(input: ApprovalBundle): Promise<VerifiedFieldSnapshotRecord>;
  applyRejectionBundle(input: RejectionBundle): Promise<void>;
  nextDacSequence(): Promise<number>;
  createDac(record: OriginationDacRecord, event: OriginationAuditEvent): Promise<OriginationDacRecord>;
  applyDacTransition(input: DacTransitionBundle): Promise<OriginationDacRecord>;
  getDacById(id: string): Promise<OriginationDacRecord | null>;
  getDacByPublicId(publicId: string): Promise<OriginationDacRecord | null>;
  getActiveDacBySnapshot(snapshotId: string): Promise<OriginationDacRecord | null>;
  getActiveDacByField(fieldId: string): Promise<OriginationDacRecord | null>;
  listDacs(): Promise<OriginationDacRecord[]>;
  insertDacMessage(record: OriginationDacMessageRecord): Promise<OriginationDacMessageRecord>;
  listDacMessages(dacId: string): Promise<OriginationDacMessageRecord[]>;
  insertDacEvent(record: OriginationAuditEvent): Promise<OriginationAuditEvent>;
  listDacEvents(dacId: string): Promise<OriginationAuditEvent[]>;
  listActiveIssuerOrganizations(): Promise<OrganizationRecord[]>;
  getOrganization(id: string): Promise<OrganizationRecord | null>;
}
