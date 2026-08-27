import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  FieldCadastreVerificationRecord,
  FieldDocumentRecord,
  FieldSubmissionRecord,
  FieldVerificationCaseRecord,
  FieldVerificationEvidenceRecord,
  FieldVerificationMessageRecord,
  OriginationAuditEvent,
  ProducerFieldRecord,
  VerifiedFieldSnapshotRecord,
} from "./types";
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
  fields: ProducerFieldRecord[];
  documents: FieldDocumentRecord[];
  submissions: FieldSubmissionRecord[];
  cases: FieldVerificationCaseRecord[];
  cadastres: FieldCadastreVerificationRecord[];
  evidence: FieldVerificationEvidenceRecord[];
  messages: FieldVerificationMessageRecord[];
  snapshots: VerifiedFieldSnapshotRecord[];
  events: OriginationAuditEvent[];
  blobs: DiskBlob[];
};

export class MemoryOriginationStore implements OriginationStore {
  private fieldSeq = 0;
  private caseSeq = 0;
  private submissionSeq = 0;
  private fields = new Map<string, ProducerFieldRecord>();
  private documents = new Map<string, FieldDocumentRecord>();
  private submissions = new Map<string, FieldSubmissionRecord>();
  private cases = new Map<string, FieldVerificationCaseRecord>();
  private cadastres = new Map<string, FieldCadastreVerificationRecord>();
  private evidence = new Map<string, FieldVerificationEvidenceRecord>();
  private messages: FieldVerificationMessageRecord[] = [];
  private snapshots = new Map<string, VerifiedFieldSnapshotRecord>();
  private events: OriginationAuditEvent[] = [];
  private blobs = new Map<string, OriginationBlob>();

  constructor(private readonly persistPath?: string) {
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
    this.fields = new Map((parsed.fields ?? []).map((record) => [record.id, record]));
    this.documents = new Map((parsed.documents ?? []).map((record) => [record.id, record]));
    this.submissions = new Map((parsed.submissions ?? []).map((record) => [record.id, record]));
    this.cases = new Map((parsed.cases ?? []).map((record) => [record.id, record]));
    this.cadastres = new Map((parsed.cadastres ?? []).map((record) => [record.caseId, record]));
    this.evidence = new Map((parsed.evidence ?? []).map((record) => [record.id, record]));
    this.messages = parsed.messages ?? [];
    this.snapshots = new Map((parsed.snapshots ?? []).map((record) => [record.fieldId, record]));
    this.events = parsed.events ?? [];
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
      fields: [...this.fields.values()],
      documents: [...this.documents.values()],
      submissions: [...this.submissions.values()],
      cases: [...this.cases.values()],
      cadastres: [...this.cadastres.values()],
      evidence: [...this.evidence.values()],
      messages: this.messages,
      snapshots: [...this.snapshots.values()],
      events: this.events,
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

  async insertDocument(record: FieldDocumentRecord) {
    return this.write(() => {
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
}
