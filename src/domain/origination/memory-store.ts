import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  FieldCadastreVerificationRecord,
  FieldDocumentRecord,
  FieldDocumentType,
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
import {
  ACTIVE_ORIGINATION_DAC_STATUSES,
  LIVE_ORIGINATION_DAC_SEQUENCE_START,
  OriginationError,
} from "./types";
import type {
  ApprovalBundle,
  ChangeRequestBundle,
  DocumentCommitBundle,
  RejectionBundle,
  SubmissionBundle,
} from "./tx";
import {
  allowsApproval,
  allowsChangeRequest,
  allowsProducerUpload,
  allowsRejection,
} from "./state-guards";
import type { OriginationBlob, OriginationStore } from "./store";

function clone<T>(value: T): T {
  return structuredClone(value);
}

type DiskBlob = {
  bucket: string;
  objectPath: string;
  contentType: string;
  bytes: string;
};

type DiskState = {
  fieldSeq: number;
  caseSeq: number;
  submissionSeq: number;
  dacSeq: number;
  fields: ProducerFieldRecord[];
  documents: FieldDocumentRecord[];
  submissions: FieldSubmissionRecord[];
  cases: FieldVerificationCaseRecord[];
  cadastres: FieldCadastreVerificationRecord[];
  evidence: FieldVerificationEvidenceRecord[];
  messages: FieldVerificationMessageRecord[];
  snapshots: VerifiedFieldSnapshotRecord[];
  events: OriginationAuditEvent[];
  intents: FieldUploadIntentRecord[];
  dacs: OriginationDacRecord[];
  dacMessages: OriginationDacMessageRecord[];
  dacEvents: OriginationAuditEvent[];
  blobs: DiskBlob[];
};

export class MemoryOriginationStore implements OriginationStore {
  private fieldSeq = 0;
  private caseSeq = 0;
  private submissionSeq = 0;
  private dacSeq = LIVE_ORIGINATION_DAC_SEQUENCE_START - 1;
  private fields = new Map<string, ProducerFieldRecord>();
  private documents = new Map<string, FieldDocumentRecord>();
  private submissions = new Map<string, FieldSubmissionRecord>();
  private cases = new Map<string, FieldVerificationCaseRecord>();
  private cadastres = new Map<string, FieldCadastreVerificationRecord>();
  private evidence = new Map<string, FieldVerificationEvidenceRecord>();
  private messages: FieldVerificationMessageRecord[] = [];
  private snapshots = new Map<string, VerifiedFieldSnapshotRecord>();
  private events: OriginationAuditEvent[] = [];
  private intents = new Map<string, FieldUploadIntentRecord>();
  private dacs = new Map<string, OriginationDacRecord>();
  private dacMessages: OriginationDacMessageRecord[] = [];
  private dacEvents: OriginationAuditEvent[] = [];
  private blobs = new Map<string, OriginationBlob>();

  constructor(
    private readonly persistPath?: string,
    private readonly now: () => number = Date.now,
  ) {
    this.hydrate();
  }

  private hydrate() {
    if (!this.persistPath || !existsSync(this.persistPath)) {
      return;
    }
    const parsed = JSON.parse(readFileSync(this.persistPath, "utf8")) as DiskState;
    this.fieldSeq = parsed.fieldSeq ?? 0;
    this.caseSeq = parsed.caseSeq ?? 0;
    this.submissionSeq = parsed.submissionSeq ?? 0;
    this.dacSeq = parsed.dacSeq ?? LIVE_ORIGINATION_DAC_SEQUENCE_START - 1;
    this.fields = new Map(
      (parsed.fields ?? []).map((record) => [
        record.id,
        { ...record, clientCreateRequestId: record.clientCreateRequestId ?? null },
      ]),
    );
    this.documents = new Map((parsed.documents ?? []).map((record) => [record.id, record]));
    this.submissions = new Map((parsed.submissions ?? []).map((record) => [record.id, record]));
    this.cases = new Map((parsed.cases ?? []).map((record) => [record.id, record]));
    this.cadastres = new Map((parsed.cadastres ?? []).map((record) => [record.caseId, record]));
    this.evidence = new Map((parsed.evidence ?? []).map((record) => [record.id, record]));
    this.messages = parsed.messages ?? [];
    this.snapshots = new Map((parsed.snapshots ?? []).map((record) => [record.fieldId, record]));
    this.events = parsed.events ?? [];
    this.intents = new Map((parsed.intents ?? []).map((record) => [record.id, record]));
    this.dacs = new Map((parsed.dacs ?? []).map((record) => [record.id, record]));
    this.dacMessages = parsed.dacMessages ?? [];
    this.dacEvents = parsed.dacEvents ?? [];
    this.blobs = new Map(
      (parsed.blobs ?? []).map((blob) => [
        `${blob.bucket}:${blob.objectPath}`,
        {
          bucket: blob.bucket,
          objectPath: blob.objectPath,
          contentType: blob.contentType,
          bytes: Uint8Array.from(Buffer.from(blob.bytes, "base64")),
        },
      ]),
    );
  }

  private persist() {
    if (!this.persistPath) {
      return;
    }
    mkdirSync(dirname(this.persistPath), { recursive: true });
    const state: DiskState = {
      fieldSeq: this.fieldSeq,
      caseSeq: this.caseSeq,
      submissionSeq: this.submissionSeq,
      dacSeq: this.dacSeq,
      fields: [...this.fields.values()],
      documents: [...this.documents.values()],
      submissions: [...this.submissions.values()],
      cases: [...this.cases.values()],
      cadastres: [...this.cadastres.values()],
      evidence: [...this.evidence.values()],
      messages: this.messages,
      snapshots: [...this.snapshots.values()],
      events: this.events,
      intents: [...this.intents.values()],
      dacs: [...this.dacs.values()],
      dacMessages: this.dacMessages,
      dacEvents: this.dacEvents,
      blobs: [...this.blobs.values()].map((blob) => ({
        bucket: blob.bucket,
        objectPath: blob.objectPath,
        contentType: blob.contentType,
        bytes: Buffer.from(blob.bytes).toString("base64"),
      })),
    };
    writeFileSync(this.persistPath, JSON.stringify(state));
  }

  private read<T>(fn: () => T): T {
    this.hydrate();
    return fn();
  }

  private write<T>(fn: () => T): T {
    this.hydrate();
    const result = fn();
    this.persist();
    return result;
  }

  async nextFieldSequence() {
    return this.write(() => {
      this.fieldSeq += 1;
      return this.fieldSeq;
    });
  }

  async nextCaseSequence() {
    return this.write(() => {
      this.caseSeq += 1;
      return this.caseSeq;
    });
  }

  async nextSubmissionSequence() {
    return this.write(() => {
      this.submissionSeq += 1;
      return this.submissionSeq;
    });
  }

  async insertField(record: ProducerFieldRecord) {
    return this.write(() => {
      this.fields.set(record.id, clone(record));
      return clone(record);
    });
  }

  async createFieldIdempotent(record: ProducerFieldRecord, event: OriginationAuditEvent) {
    return this.write(() => {
      if (record.clientCreateRequestId) {
        for (const existing of this.fields.values()) {
          if (
            existing.organizationId === record.organizationId &&
            existing.clientCreateRequestId === record.clientCreateRequestId
          ) {
            return clone(existing);
          }
        }
      }
      this.fieldSeq += 1;
      const created: ProducerFieldRecord = {
        ...record,
        publicId: `FIELD-${record.declared.season}-${String(this.fieldSeq).padStart(4, "0")}`,
      };
      this.fields.set(created.id, clone(created));
      this.events.push(
        clone({
          ...event,
          objectId: created.id,
          metadata: { ...event.metadata, publicId: created.publicId },
        }),
      );
      return clone(created);
    });
  }

  async updateField(record: ProducerFieldRecord) {
    return this.write(() => {
      this.fields.set(record.id, clone(record));
      return clone(record);
    });
  }

  async getFieldById(id: string) {
    return this.read(() => {
      const record = this.fields.get(id);
      return record ? clone(record) : null;
    });
  }

  async getFieldByPublicId(publicId: string) {
    return this.read(() => {
      for (const record of this.fields.values()) {
        if (record.publicId === publicId) {
          return clone(record);
        }
      }
      return null;
    });
  }

  async listFieldsByOrganization(organizationId: string) {
    return this.read(() =>
      [...this.fields.values()]
        .filter((record) => record.organizationId === organizationId)
        .map(clone),
    );
  }

  async listAllFields() {
    return this.read(() => [...this.fields.values()].map(clone));
  }

  private assertDocumentLineage(record: FieldDocumentRecord, replacingId?: string | null) {
    for (const existing of this.documents.values()) {
      if (existing.id === record.id || existing.fieldId !== record.fieldId) {
        continue;
      }
      if (existing.documentType === record.documentType && existing.version === record.version) {
        throw new OriginationError("invalid_state", "Duplicate document version.");
      }
      if (
        record.current &&
        existing.current &&
        existing.documentType === record.documentType &&
        existing.id !== replacingId
      ) {
        throw new OriginationError("invalid_state", "A current version already exists for this document type.");
      }
    }
  }

  async insertDocument(record: FieldDocumentRecord) {
    return this.write(() => {
      this.assertDocumentLineage(record, record.replacesDocumentId);
      this.documents.set(record.id, clone(record));
      return clone(record);
    });
  }

  async updateDocument(record: FieldDocumentRecord) {
    return this.write(() => {
      this.documents.set(record.id, clone(record));
      return clone(record);
    });
  }

  async getDocument(id: string) {
    return this.read(() => {
      const record = this.documents.get(id);
      return record ? clone(record) : null;
    });
  }

  async listDocuments(fieldId: string) {
    return this.read(() =>
      [...this.documents.values()].filter((record) => record.fieldId === fieldId).map(clone),
    );
  }

  async deleteDocument(id: string) {
    this.write(() => {
      this.documents.delete(id);
    });
  }

  async insertSubmission(record: FieldSubmissionRecord) {
    return this.write(() => {
      this.submissions.set(record.id, clone(record));
      return clone(record);
    });
  }

  async getSubmission(id: string) {
    return this.read(() => {
      const record = this.submissions.get(id);
      return record ? clone(record) : null;
    });
  }

  async listSubmissions(fieldId: string) {
    return this.read(() =>
      [...this.submissions.values()].filter((record) => record.fieldId === fieldId).map(clone),
    );
  }

  async insertCase(record: FieldVerificationCaseRecord) {
    return this.write(() => {
      this.cases.set(record.id, clone(record));
      return clone(record);
    });
  }

  async updateCase(record: FieldVerificationCaseRecord) {
    return this.write(() => {
      this.cases.set(record.id, clone(record));
      return clone(record);
    });
  }

  async getCaseById(id: string) {
    return this.read(() => {
      const record = this.cases.get(id);
      return record ? clone(record) : null;
    });
  }

  async getCaseByPublicId(publicId: string) {
    return this.read(() => {
      for (const record of this.cases.values()) {
        if (record.publicId === publicId) {
          return clone(record);
        }
      }
      return null;
    });
  }

  async getCaseByFieldId(fieldId: string) {
    return this.read(() => {
      for (const record of this.cases.values()) {
        if (record.fieldId === fieldId) {
          return clone(record);
        }
      }
      return null;
    });
  }

  async listCases() {
    return this.read(() => [...this.cases.values()].map(clone));
  }

  async upsertCadastre(record: FieldCadastreVerificationRecord) {
    return this.write(() => {
      this.cadastres.set(record.caseId, clone(record));
      return clone(record);
    });
  }

  async getCadastreByCase(caseId: string) {
    return this.read(() => {
      const record = this.cadastres.get(caseId);
      return record ? clone(record) : null;
    });
  }

  async insertEvidence(record: FieldVerificationEvidenceRecord) {
    return this.write(() => {
      this.evidence.set(record.id, clone(record));
      return clone(record);
    });
  }

  async listEvidence(caseId: string) {
    return this.read(() =>
      [...this.evidence.values()].filter((record) => record.caseId === caseId).map(clone),
    );
  }

  async insertMessage(record: FieldVerificationMessageRecord) {
    return this.write(() => {
      this.messages.push(clone(record));
      return clone(record);
    });
  }

  async listMessages(caseId: string) {
    return this.read(() => this.messages.filter((record) => record.caseId === caseId).map(clone));
  }

  async insertSnapshot(record: VerifiedFieldSnapshotRecord) {
    return this.write(() => {
      if (this.snapshots.has(record.fieldId)) {
        throw new OriginationError("invalid_state", "A verified snapshot already exists.");
      }
      this.snapshots.set(record.fieldId, clone(record));
      return clone(record);
    });
  }

  async getSnapshotByField(fieldId: string) {
    return this.read(() => {
      const record = this.snapshots.get(fieldId);
      return record ? clone(record) : null;
    });
  }

  async insertEvent(record: OriginationAuditEvent) {
    return this.write(() => {
      this.events.push(clone(record));
      return clone(record);
    });
  }

  async listEvents(objectType: string, objectId: string) {
    return this.read(() =>
      this.events
        .filter((event) => event.objectType === objectType && event.objectId === objectId)
        .map(clone),
    );
  }

  async listEventsByField(fieldId: string) {
    return this.read(() =>
      this.events
        .filter((event) => event.objectId === fieldId || event.metadata.fieldId === fieldId)
        .map(clone),
    );
  }

  async putBlob(blob: OriginationBlob) {
    this.write(() => {
      this.blobs.set(`${blob.bucket}:${blob.objectPath}`, {
        ...blob,
        bytes: new Uint8Array(blob.bytes),
      });
    });
  }

  async getBlob(bucket: string, objectPath: string) {
    return this.read(() => {
      const blob = this.blobs.get(`${bucket}:${objectPath}`);
      if (!blob) {
        return null;
      }
      return { ...blob, bytes: new Uint8Array(blob.bytes) };
    });
  }

  async removeBlob(bucket: string, objectPath: string) {
    this.write(() => {
      this.blobs.delete(`${bucket}:${objectPath}`);
    });
  }

  async hasPublicObjectUrl() {
    return false;
  }

  private expireStalePrepared(fieldId: string, documentType: FieldDocumentType, now: number) {
    for (const intent of [...this.intents.values()]) {
      if (
        intent.fieldId === fieldId &&
        intent.documentType === documentType &&
        intent.status === "PREPARED" &&
        Date.parse(intent.expiresAt) <= now
      ) {
        this.intents.set(intent.id, { ...intent, status: "EXPIRED" });
      }
    }
  }

  private expireAllPrepared(fieldId: string) {
    for (const intent of [...this.intents.values()]) {
      if (intent.fieldId === fieldId && intent.status === "PREPARED") {
        this.intents.set(intent.id, { ...intent, status: "EXPIRED" });
      }
    }
  }

  async prepareUploadIntent(record: FieldUploadIntentRecord) {
    return this.write(() => {
      const field = this.fields.get(record.fieldId);
      if (!field) {
        throw new OriginationError("not_found");
      }
      if (field.organizationId !== record.organizationId) {
        throw new OriginationError("invalid_state", "Upload intent does not belong to this field.");
      }
      if (!allowsProducerUpload(field.status)) {
        throw new OriginationError("invalid_state", "Upload window is closed.");
      }
      this.expireStalePrepared(record.fieldId, record.documentType, this.now());
      let existing: FieldUploadIntentRecord | null = null;
      for (const intent of this.intents.values()) {
        if (
          intent.status === "PREPARED" &&
          intent.fieldId === record.fieldId &&
          intent.documentType === record.documentType
        ) {
          existing = intent;
          break;
        }
      }
      if (existing) {
        if (
          existing.originalFilename === record.originalFilename &&
          existing.mimeType === record.mimeType &&
          existing.expectedSizeBytes === record.expectedSizeBytes &&
          existing.replacesDocumentId === record.replacesDocumentId
        ) {
          return clone(existing);
        }
        throw new OriginationError("invalid_state", "An upload is already in progress for this document type.");
      }
      this.intents.set(record.id, clone(record));
      return clone(record);
    });
  }

  async getUploadIntent(id: string) {
    return this.read(() => {
      const record = this.intents.get(id);
      return record ? clone(record) : null;
    });
  }

  async commitDocumentBundle(input: DocumentCommitBundle) {
    return this.write(() => {
      let fieldId = input.document.fieldId;
      if (input.intentId) {
        const intent = this.intents.get(input.intentId);
        if (!intent) {
          throw new OriginationError("not_found");
        }
        if (intent.status === "COMMITTED") {
          const existing = this.documents.get(intent.documentId);
          if (existing) {
            return clone(existing);
          }
          throw new OriginationError("invalid_state", "Upload intent is not usable.");
        }
        fieldId = intent.fieldId;
      }

      const field = this.fields.get(fieldId);
      if (!field) {
        throw new OriginationError("not_found");
      }

      if (input.intentId) {
        const intent = this.intents.get(input.intentId)!;
        if (
          intent.organizationId !== field.organizationId ||
          intent.fieldId !== field.id ||
          intent.fieldId !== input.document.fieldId
        ) {
          throw new OriginationError("invalid_state", "Upload intent does not belong to this field.");
        }
        if (intent.status !== "PREPARED") {
          throw new OriginationError("invalid_state", "Upload intent is not usable.");
        }
        if (Date.parse(intent.expiresAt) <= this.now()) {
          this.intents.set(intent.id, { ...intent, status: "EXPIRED" });
          throw new OriginationError("invalid_state", "Upload intent expired.");
        }
      }

      if (!allowsProducerUpload(field.status)) {
        throw new OriginationError("invalid_state", "Upload window is closed.");
      }

      if (input.supersededId) {
        const superseded = this.documents.get(input.supersededId);
        if (superseded) {
          this.documents.set(input.supersededId, {
            ...superseded,
            status: "SUPERSEDED",
            current: false,
          });
        }
      }
      this.assertDocumentLineage(input.document, input.supersededId);
      this.documents.set(input.document.id, clone(input.document));
      if (input.intentId) {
        const intent = this.intents.get(input.intentId);
        if (intent) {
          this.intents.set(intent.id, { ...intent, status: "COMMITTED" });
        }
      }
      this.events.push(clone(input.event));
      if (input.message) {
        this.messages.push(clone(input.message));
      }
      return clone(input.document);
    });
  }

  async applySubmissionBundle(input: SubmissionBundle) {
    return this.write(() => {
      const current = this.fields.get(input.field.id);
      if (!current || current.status !== input.expectedFieldStatus) {
        throw new OriginationError("invalid_state");
      }
      if (input.caseIsNew) {
        if (input.expectedFieldStatus !== "DRAFT") {
          throw new OriginationError("invalid_state");
        }
        const existingCase = [...this.cases.values()].some((item) => item.fieldId === current.id);
        if (existingCase) {
          throw new OriginationError("invalid_state", "A verification case already exists.");
        }
      } else {
        if (input.expectedFieldStatus !== "CHANGES_REQUESTED") {
          throw new OriginationError("invalid_state");
        }
        const currentCase = this.cases.get(input.verificationCase.id);
        if (
          !currentCase ||
          currentCase.fieldId !== current.id ||
          currentCase.status !== "CHANGES_REQUESTED"
        ) {
          throw new OriginationError("invalid_state", "Verification case is not in the expected state.");
        }
      }
      const duplicateVersion = [...this.submissions.values()].some(
        (item) => item.fieldId === input.submission.fieldId && item.version === input.submission.version,
      );
      if (duplicateVersion) {
        throw new OriginationError("invalid_state", "Duplicate submission version.");
      }
      this.submissions.set(input.submission.id, clone(input.submission));
      this.cases.set(input.verificationCase.id, clone(input.verificationCase));
      this.fields.set(input.field.id, clone(input.field));
      this.expireAllPrepared(current.id);
      this.events.push(clone(input.event));
      return {
        field: clone(input.field),
        submission: clone(input.submission),
        verificationCase: clone(input.verificationCase),
      };
    });
  }

  async applyChangeRequestBundle(input: ChangeRequestBundle) {
    this.write(() => {
      const currentField = this.fields.get(input.field.id);
      const currentCase = this.cases.get(input.verificationCase.id);
      if (!currentField || !currentCase) {
        throw new OriginationError("not_found");
      }
      if (
        currentField.status === "VERIFIED" ||
        currentField.status === "REJECTED" ||
        currentField.status === "ARCHIVED" ||
        currentCase.status === "VERIFIED" ||
        currentCase.status === "REJECTED"
      ) {
        throw new OriginationError("invalid_state", "Terminal state cannot be overwritten.");
      }
      if (
        !allowsChangeRequest(currentField.status, currentCase.status) ||
        currentCase.fieldId !== currentField.id
      ) {
        throw new OriginationError("invalid_state", "Not in an allowed source state.");
      }
      this.fields.set(input.field.id, clone(input.field));
      this.cases.set(input.verificationCase.id, clone(input.verificationCase));
      if (input.document) {
        this.documents.set(input.document.id, clone(input.document));
      }
      this.messages.push(clone(input.message));
      this.events.push(...input.events.map(clone));
    });
  }

  async applyApprovalBundle(input: ApprovalBundle) {
    return this.write(() => {
      const currentField = this.fields.get(input.field.id);
      const currentCase = this.cases.get(input.verificationCase.id);
      if (!currentField || !currentCase) {
        throw new OriginationError("not_found");
      }
      if (
        currentField.status === "VERIFIED" ||
        currentField.status === "REJECTED" ||
        currentCase.status === "VERIFIED" ||
        currentCase.status === "REJECTED" ||
        this.snapshots.has(input.snapshot.fieldId)
      ) {
        throw new OriginationError("invalid_state", "A verified snapshot already exists.");
      }
      if (!allowsApproval(currentField.status, currentCase.status)) {
        throw new OriginationError("invalid_state", "Approval requires under review.");
      }
      if (
        currentCase.currentSubmissionId !== input.snapshot.submissionId ||
        currentField.currentSubmissionId !== input.snapshot.submissionId ||
        input.snapshot.fieldId !== currentField.id ||
        input.snapshot.caseId !== currentCase.id
      ) {
        throw new OriginationError("invalid_state", "Approval is not bound to the current submission.");
      }
      this.snapshots.set(input.snapshot.fieldId, clone(input.snapshot));
      this.fields.set(input.field.id, clone(input.field));
      this.cases.set(input.verificationCase.id, clone(input.verificationCase));
      this.messages.push(clone(input.message));
      this.events.push(clone(input.event));
      return clone(input.snapshot);
    });
  }

  async applyRejectionBundle(input: RejectionBundle) {
    this.write(() => {
      const currentField = this.fields.get(input.field.id);
      const currentCase = this.cases.get(input.verificationCase.id);
      if (!currentField || !currentCase) {
        throw new OriginationError("not_found");
      }
      if (
        currentField.status === "VERIFIED" ||
        currentField.status === "REJECTED" ||
        currentCase.status === "VERIFIED" ||
        currentCase.status === "REJECTED"
      ) {
        throw new OriginationError("invalid_state", "Terminal state cannot be overwritten.");
      }
      if (
        !allowsRejection(currentField.status, currentCase.status) ||
        currentCase.fieldId !== currentField.id
      ) {
        throw new OriginationError("invalid_state", "Not in an allowed source state.");
      }
      this.fields.set(input.field.id, clone(input.field));
      this.cases.set(input.verificationCase.id, clone(input.verificationCase));
      this.messages.push(clone(input.message));
      this.events.push(clone(input.event));
    });
  }

  async nextDacSequence() {
    return this.write(() => {
      this.dacSeq += 1;
      return this.dacSeq;
    });
  }

  async createDac(record: OriginationDacRecord, event: OriginationAuditEvent) {
    return this.write(() => {
      for (const existing of this.dacs.values()) {
        if (
          existing.verifiedSnapshotId === record.verifiedSnapshotId &&
          (ACTIVE_ORIGINATION_DAC_STATUSES as readonly string[]).includes(existing.status)
        ) {
          throw new OriginationError(
            "invalid_state",
            "An active DAC already exists for this verified snapshot.",
          );
        }
      }
      this.dacSeq += 1;
      const created: OriginationDacRecord = {
        ...record,
        publicId: `DAC-${record.harvestYear}-${String(this.dacSeq).padStart(4, "0")}`,
      };
      this.dacs.set(created.id, clone(created));
      this.dacEvents.push(
        clone({
          ...event,
          objectId: created.id,
          metadata: { ...event.metadata, publicId: created.publicId },
        }),
      );
      this.events.push(
        clone({
          ...event,
          id: `${event.id}-field`,
          objectType: "dac",
          objectId: created.id,
          metadata: {
            ...event.metadata,
            publicId: created.publicId,
            fieldId: created.fieldId,
            verifiedSnapshotId: created.verifiedSnapshotId,
          },
        }),
      );
      return clone(created);
    });
  }

  async updateDac(record: OriginationDacRecord) {
    return this.write(() => {
      this.dacs.set(record.id, clone(record));
      return clone(record);
    });
  }

  async getDacById(id: string) {
    return this.read(() => {
      const record = this.dacs.get(id);
      return record ? clone(record) : null;
    });
  }

  async getDacByPublicId(publicId: string) {
    return this.read(() => {
      for (const record of this.dacs.values()) {
        if (record.publicId === publicId) {
          return clone(record);
        }
      }
      return null;
    });
  }

  async getActiveDacBySnapshot(snapshotId: string) {
    return this.read(() => {
      for (const record of this.dacs.values()) {
        if (
          record.verifiedSnapshotId === snapshotId &&
          (ACTIVE_ORIGINATION_DAC_STATUSES as readonly string[]).includes(record.status)
        ) {
          return clone(record);
        }
      }
      return null;
    });
  }

  async getActiveDacByField(fieldId: string) {
    return this.read(() => {
      const matches = [...this.dacs.values()].filter(
        (record) =>
          record.fieldId === fieldId &&
          (ACTIVE_ORIGINATION_DAC_STATUSES as readonly string[]).includes(record.status),
      );
      return matches[0] ? clone(matches[0]) : null;
    });
  }

  async listDacs() {
    return this.read(() => [...this.dacs.values()].map(clone));
  }

  async insertDacMessage(record: OriginationDacMessageRecord) {
    return this.write(() => {
      this.dacMessages.push(clone(record));
      return clone(record);
    });
  }

  async listDacMessages(dacId: string) {
    return this.read(() => this.dacMessages.filter((item) => item.dacId === dacId).map(clone));
  }

  async insertDacEvent(record: OriginationAuditEvent) {
    return this.write(() => {
      this.dacEvents.push(clone(record));
      this.events.push(
        clone({
          ...record,
          metadata: { ...record.metadata, fieldId: record.metadata.fieldId },
        }),
      );
      return clone(record);
    });
  }

  async listDacEvents(dacId: string) {
    return this.read(() =>
      this.dacEvents
        .filter((item) => item.objectId === dacId)
        .map(clone)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    );
  }
}
