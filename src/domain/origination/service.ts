import { createHash, randomUUID } from "node:crypto";
import type { ActorContext } from "@/domain/identity";
import {
  actorStamp,
  canManageProducerOrgFields,
  canReadOrigination,
  canReadProducerOrgFields,
  isProducerOperator,
  isScasVerifier,
  matchesProducerFilter,
  matchesScasFilter,
} from "./access";
import { defaultCadastreProvider, type CadastreProvider } from "./cadastre";
import {
  assertAllowedUpload,
  fieldDocumentObjectPath,
  scasEvidenceObjectPath,
} from "./files";
import type { OriginationStore } from "./store";
import {
  ALLOWED_FIELD_MIME_TYPES,
  FIELD_DOCUMENT_BUCKET,
  MAX_FIELD_FILE_BYTES,
  OriginationError,
  SCAS_EVIDENCE_BUCKET,
  UPLOAD_INTENT_TTL_MS,
  type AllowedFieldMimeType,
  type FieldCadastreVerificationRecord,
  type FieldDocumentRecord,
  type FieldDocumentType,
  type FieldEvidenceKind,
  type FieldMessageType,
  type FieldSubmissionRecord,
  type FieldVerificationCaseRecord,
  type FieldVerificationMessageRecord,
  type OriginationEventType,
  type ProducerDeclaredData,
  type ProducerFieldFilter,
  type ProducerFieldRecord,
  type ScasCaseFilter,
} from "./types";

function nowIso() {
  return new Date().toISOString();
}

function pad(value: number) {
  return String(value).padStart(4, "0");
}

function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireDeclared(input: ProducerDeclaredData): ProducerDeclaredData {
  const name = input.name.trim();
  const cadastreNumber = input.cadastreNumber.trim();
  const crop = input.crop.trim();
  if (!name || name.length > 200) {
    throw new OriginationError("validation", "Field name is required.");
  }
  if (!Number.isInteger(input.season) || input.season < 2020 || input.season > 2100) {
    throw new OriginationError("validation", "Season is required.");
  }
  if (!crop) {
    throw new OriginationError("validation", "Crop is required.");
  }
  if (!cadastreNumber || cadastreNumber.length > 64) {
    throw new OriginationError("validation", "Cadastre number is required.");
  }
  if (input.declaredAreaHa != null && !(input.declaredAreaHa > 0)) {
    throw new OriginationError("validation", "Declared area must be positive.");
  }
  return {
    name,
    season: input.season,
    crop,
    cadastreNumber,
    declaredAreaHa: input.declaredAreaHa,
    region: input.region?.trim() || null,
    district: input.district?.trim() || null,
  };
}

function currentDocuments(documents: FieldDocumentRecord[]) {
  return documents.filter((document) => document.current);
}

export class OriginationService {
  constructor(
    private readonly store: OriginationStore,
    private readonly cadastreProvider: CadastreProvider = defaultCadastreProvider(),
    private readonly clock: () => string = nowIso,
  ) {}

  async createDraft(actor: ActorContext, input: ProducerDeclaredData) {
    if (!isProducerOperator(actor) || !actor.effective.organization) {
      throw new OriginationError("forbidden");
    }
    const declared = requireDeclared(input);
    const stamp = actorStamp(actor);
    const at = this.clock();
    const id = randomUUID();
    const seq = await this.store.nextFieldSequence();
    const field: ProducerFieldRecord = {
      id,
      publicId: `FIELD-${declared.season}-${pad(seq)}`,
      organizationId: actor.effective.organization.id,
      status: "DRAFT",
      declared,
      currentSubmissionId: null,
      verifiedSnapshotId: null,
      createdByUserId: stamp.userId,
      createdByRole: stamp.role,
      createdAt: at,
      updatedAt: at,
      archivedAt: null,
    };
    await this.store.insertField(field);
    await this.audit(actor, "field_created", "field", field.id, { publicId: field.publicId });
    return field;
  }

  async updateDraft(actor: ActorContext, fieldId: string, input: ProducerDeclaredData) {
    const field = await this.requireManageableField(actor, fieldId);
    if (field.status !== "DRAFT" && field.status !== "CHANGES_REQUESTED") {
      throw new OriginationError("immutable", "Submitted field data cannot be overwritten.");
    }
    const declared = requireDeclared(input);
    const updated = {
      ...field,
      declared,
      updatedAt: this.clock(),
    };
    await this.store.updateField(updated);
    await this.audit(actor, "field_updated", "field", field.id, { publicId: field.publicId });
    return updated;
  }

  async listProducerFields(actor: ActorContext, filter: ProducerFieldFilter = "all") {
    if (!isProducerOperator(actor) || !actor.effective.organization) {
      throw new OriginationError("forbidden");
    }
    const fields = await this.store.listFieldsByOrganization(actor.effective.organization.id);
    return fields.filter((field) => matchesProducerFilter(field.status, filter));
  }

  async listVerificationQueue(actor: ActorContext, filter: ScasCaseFilter = "all") {
    if (!isScasVerifier(actor) && !canReadOrigination(actor)) {
      throw new OriginationError("forbidden");
    }
    if (!isScasVerifier(actor) && !actorCanReadAll(actor)) {
      throw new OriginationError("forbidden");
    }
    const cases = await this.store.listCases();
    return cases.filter((item) => matchesScasFilter(item.status, filter));
  }

  async getFieldBundle(actor: ActorContext, fieldRef: string) {
    const field = await this.resolveField(fieldRef);
    if (!field || !canReadProducerOrgFields(actor, field.organizationId)) {
      throw new OriginationError("not_found");
    }
    const documents = await this.store.listDocuments(field.id);
    const submissions = await this.store.listSubmissions(field.id);
    const verificationCase = await this.store.getCaseByFieldId(field.id);
    const cadastre = verificationCase
      ? await this.store.getCadastreByCase(verificationCase.id)
      : null;
    const evidence = verificationCase
      ? await this.store.listEvidence(verificationCase.id)
      : [];
    const messages = verificationCase
      ? await this.store.listMessages(verificationCase.id)
      : [];
    const snapshot = await this.store.getSnapshotByField(field.id);
    const events = await this.store.listEventsByField(field.id);
    const latestRequest = [...messages]
      .reverse()
      .find((message) => message.messageType === "DOCUMENT_REQUEST" || message.messageType === "DECISION");
    return {
      field,
      documents,
      submissions,
      verificationCase,
      cadastre,
      evidence,
      messages,
      snapshot,
      events,
      latestRequest: latestRequest ?? null,
    };
  }

  async getCaseBundle(actor: ActorContext, caseRef: string) {
    const verificationCase = await this.resolveCase(caseRef);
    if (!verificationCase) {
      throw new OriginationError("not_found");
    }
    if (!canReadProducerOrgFields(actor, verificationCase.organizationId)) {
      throw new OriginationError("forbidden");
    }
    const bundle = await this.getFieldBundle(actor, verificationCase.fieldId);
    return { ...bundle, verificationCase };
  }

  async prepareDirectUpload(
    actor: ActorContext,
    input: {
      fieldId: string;
      documentType: FieldDocumentType;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      replacesDocumentId?: string | null;
    },
  ) {
    const field = await this.requireManageableField(actor, input.fieldId);
    this.assertUploadWindow(field, input.replacesDocumentId);
    assertAllowedUpload({
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    });
    const plan = await this.planDocumentVersion(field.id, input.documentType, input.replacesDocumentId);
    const documentId = randomUUID();
    const objectPath = fieldDocumentObjectPath({
      organizationId: field.organizationId,
      fieldId: field.id,
      submissionId: field.currentSubmissionId ?? "draft",
      documentId,
      version: plan.version,
      filename: input.filename,
    });
    const stamp = actorStamp(actor);
    const at = this.clock();
    const intent = await this.store.insertUploadIntent({
      id: randomUUID(),
      organizationId: field.organizationId,
      fieldId: field.id,
      documentId,
      documentType: input.documentType,
      objectPath,
      originalFilename: input.filename,
      mimeType: input.mimeType,
      expectedSizeBytes: input.sizeBytes,
      version: plan.version,
      replacesDocumentId: plan.replaces?.id ?? null,
      createdByUserId: stamp.userId,
      createdAt: at,
      expiresAt: new Date(Date.parse(at) + UPLOAD_INTENT_TTL_MS).toISOString(),
      status: "PREPARED",
    });
    return {
      uploadIntentId: intent.id,
      fieldId: field.id,
      documentId,
      version: plan.version,
      objectPath,
      bucket: FIELD_DOCUMENT_BUCKET,
      replacesDocumentId: plan.replaces?.id ?? null,
      documentType: input.documentType,
      filename: input.filename,
      mimeType: input.mimeType,
    };
  }

  async commitDirectUpload(actor: ActorContext, input: { uploadIntentId: string }) {
    const intent = await this.store.getUploadIntent(input.uploadIntentId);
    if (!intent) {
      throw new OriginationError("not_found");
    }
    if (!canManageProducerOrgFields(actor, intent.organizationId)) {
      throw new OriginationError("forbidden");
    }
    const field = await this.requireManageableField(actor, intent.fieldId);
    if (intent.organizationId !== field.organizationId) {
      throw new OriginationError("forbidden");
    }
    if (intent.status === "COMMITTED") {
      const existing = await this.store.getDocument(intent.documentId);
      if (existing) {
        return existing;
      }
    }
    if (Date.parse(intent.expiresAt) <= Date.parse(this.clock())) {
      throw new OriginationError("invalid_state", "Upload intent expired.");
    }
    this.assertUploadWindow(field, intent.replacesDocumentId);
    const blob = await this.store.getBlob(FIELD_DOCUMENT_BUCKET, intent.objectPath);
    if (!blob) {
      throw new OriginationError("storage", "Uploaded object was not found.");
    }
    const canonical = fieldDocumentObjectPath({
      organizationId: intent.organizationId,
      fieldId: intent.fieldId,
      submissionId: field.currentSubmissionId ?? "draft",
      documentId: intent.documentId,
      version: intent.version,
      filename: intent.originalFilename,
    });
    if (canonical !== intent.objectPath) {
      throw new OriginationError("forbidden");
    }
    if (
      blob.bytes.byteLength <= 0 ||
      blob.bytes.byteLength > MAX_FIELD_FILE_BYTES ||
      blob.bytes.byteLength > intent.expectedSizeBytes
    ) {
      throw new OriginationError("validation", "Uploaded object size is not valid.");
    }
    const contentType = blob.contentType?.trim() || intent.mimeType;
    if (
      contentType !== "application/octet-stream" &&
      !ALLOWED_FIELD_MIME_TYPES.includes(contentType as AllowedFieldMimeType) &&
      contentType !== intent.mimeType
    ) {
      throw new OriginationError("validation", "Uploaded object type is not allowed.");
    }
    assertAllowedUpload({
      filename: intent.originalFilename,
      mimeType: intent.mimeType,
      sizeBytes: blob.bytes.byteLength,
    });
    return this.recordDocument(actor, field, {
      intentId: intent.id,
      documentId: intent.documentId,
      documentType: intent.documentType,
      filename: intent.originalFilename,
      mimeType: intent.mimeType,
      objectPath: intent.objectPath,
      version: intent.version,
      replacesDocumentId: intent.replacesDocumentId,
      bytes: blob.bytes,
    });
  }

  async uploadDocument(
    actor: ActorContext,
    input: {
      fieldId: string;
      documentType: FieldDocumentType;
      filename: string;
      mimeType: string;
      bytes: Uint8Array;
      replacesDocumentId?: string | null;
    },
  ) {
    const field = await this.requireManageableField(actor, input.fieldId);
    this.assertUploadWindow(field, input.replacesDocumentId);
    assertAllowedUpload({
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
    });
    const plan = await this.planDocumentVersion(field.id, input.documentType, input.replacesDocumentId);
    const documentId = randomUUID();
    const objectPath = fieldDocumentObjectPath({
      organizationId: field.organizationId,
      fieldId: field.id,
      submissionId: field.currentSubmissionId ?? "draft",
      documentId,
      version: plan.version,
      filename: input.filename,
    });
    await this.store.putBlob({
      bucket: FIELD_DOCUMENT_BUCKET,
      objectPath,
      bytes: input.bytes,
      contentType: input.mimeType,
    });
    return this.recordDocument(actor, field, {
      intentId: null,
      documentId,
      documentType: input.documentType,
      filename: input.filename,
      mimeType: input.mimeType,
      objectPath,
      version: plan.version,
      replacesDocumentId: plan.replaces?.id ?? null,
      bytes: input.bytes,
    });
  }

  async removeDraftDocument(actor: ActorContext, documentId: string) {
    const document = await this.store.getDocument(documentId);
    if (!document) {
      throw new OriginationError("not_found");
    }
    const field = await this.requireManageableField(actor, document.fieldId);
    if (field.status !== "DRAFT") {
      throw new OriginationError("immutable", "Submitted evidence cannot be removed.");
    }
    await this.store.removeBlob(document.bucket, document.objectPath);
    await this.store.deleteDocument(document.id);
  }

  async submitToScas(actor: ActorContext, fieldId: string) {
    const field = await this.requireManageableField(actor, fieldId);
    if (field.status !== "DRAFT") {
      throw new OriginationError("invalid_state");
    }
    return this.freezeAndOpenCase(actor, field, "SUBMITTED", "NEW", "field_submitted");
  }

  async resubmit(actor: ActorContext, fieldId: string) {
    const field = await this.requireManageableField(actor, fieldId);
    if (field.status !== "CHANGES_REQUESTED") {
      throw new OriginationError("invalid_state");
    }
    return this.freezeAndOpenCase(actor, field, "RESUBMITTED", "RESUBMITTED", "field_resubmitted");
  }

  async archiveField(actor: ActorContext, fieldId: string) {
    const field = await this.requireManageableField(actor, fieldId);
    if (field.status === "VERIFIED") {
      throw new OriginationError("immutable", "A verified field cannot be deleted or archived in this phase.");
    }
    if (field.status !== "DRAFT" && field.status !== "REJECTED") {
      throw new OriginationError("invalid_state");
    }
    const at = this.clock();
    const updated = { ...field, status: "ARCHIVED" as const, archivedAt: at, updatedAt: at };
    await this.store.updateField(updated);
    await this.audit(actor, "field_archived", "field", field.id, { publicId: field.publicId });
    return updated;
  }

  async assignReviewer(actor: ActorContext, caseId: string, reviewerUserId: string | null) {
    this.requireVerifier(actor);
    const verificationCase = await this.requireWritableCase(actor, caseId);
    const updated = {
      ...verificationCase,
      assignedReviewerUserId: reviewerUserId,
      assignedReviewerPersonaId: actorStamp(actor).personaId,
      updatedAt: this.clock(),
    };
    await this.store.updateCase(updated);
    return updated;
  }

  async sendMessage(
    actor: ActorContext,
    input: {
      caseId: string;
      body: string;
      messageType?: FieldMessageType;
      linkedDocumentId?: string | null;
    },
  ) {
    const body = input.body.trim();
    if (!body) {
      throw new OriginationError("validation", "A message body is required.");
    }
    const verificationCase = await this.resolveCase(input.caseId);
    if (!verificationCase) {
      throw new OriginationError("not_found");
    }
    const producer = canManageProducerOrgFields(actor, verificationCase.organizationId);
    const verifier = isScasVerifier(actor);
    if (!producer && !verifier) {
      throw new OriginationError("forbidden");
    }
    if (producer && verificationCase.status === "REJECTED") {
      throw new OriginationError("invalid_state");
    }
    const type: FieldMessageType = input.messageType ?? "COMMENT";
    if (producer && !verifier && type !== "COMMENT") {
      throw new OriginationError("forbidden", "Producer messages must be comments.");
    }
    if (verifier && type !== "COMMENT" && type !== "DOCUMENT_REQUEST" && type !== "DECISION") {
      throw new OriginationError("forbidden");
    }
    if (input.linkedDocumentId) {
      const linked = await this.store.getDocument(input.linkedDocumentId);
      if (!linked || linked.fieldId !== verificationCase.fieldId) {
        throw new OriginationError("validation", "Linked document does not belong to this field.");
      }
    }
    const stamp = actorStamp(actor);
    const message = {
      id: randomUUID(),
      caseId: verificationCase.id,
      fieldId: verificationCase.fieldId,
      senderUserId: stamp.userId,
      senderRole: stamp.role,
      senderPersonaId: stamp.personaId,
      body,
      messageType: type,
      linkedDocumentId: input.linkedDocumentId ?? null,
      createdAt: this.clock(),
    };
    await this.store.insertMessage(message);
    await this.audit(actor, "message_sent", "message", message.id, {
      caseId: verificationCase.id,
      fieldId: verificationCase.fieldId,
      messageType: message.messageType,
    });
    return message;
  }

  async acceptDocument(actor: ActorContext, documentId: string) {
    this.requireVerifier(actor);
    const document = await this.store.getDocument(documentId);
    if (!document) {
      throw new OriginationError("not_found");
    }
    await this.requireWritableCaseByField(actor, document.fieldId);
    const updated = { ...document, status: "ACCEPTED" as const };
    await this.store.updateDocument(updated);
    await this.audit(actor, "document_accepted", "document", document.id, {
      fieldId: document.fieldId,
      version: document.version,
    });
    return updated;
  }

  async requestDocumentReplacement(actor: ActorContext, documentId: string, comment: string) {
    this.requireVerifier(actor);
    const note = comment.trim();
    if (!note) {
      throw new OriginationError("validation", "Replacement requested requires a comment.");
    }
    const document = await this.store.getDocument(documentId);
    if (!document) {
      throw new OriginationError("not_found");
    }
    const field = await this.store.getFieldById(document.fieldId);
    if (!field) {
      throw new OriginationError("not_found");
    }
    const verificationCase = await this.requireOpenVerifierCaseByField(actor, document.fieldId);
    const at = this.clock();
    const stamp = actorStamp(actor);
    const updated = { ...document, status: "REPLACEMENT_REQUESTED" as const };
    const nextField = { ...field, status: "CHANGES_REQUESTED" as const, updatedAt: at };
    const nextCase = { ...verificationCase, status: "CHANGES_REQUESTED" as const, updatedAt: at };
    const message: FieldVerificationMessageRecord = {
      id: randomUUID(),
      caseId: verificationCase.id,
      fieldId: document.fieldId,
      senderUserId: stamp.userId,
      senderRole: stamp.role,
      senderPersonaId: stamp.personaId,
      body: note,
      messageType: "DOCUMENT_REQUEST",
      linkedDocumentId: document.id,
      createdAt: at,
    };
    await this.store.applyChangeRequestBundle({
      field: nextField,
      verificationCase: nextCase,
      document: updated,
      message,
      events: [
        ...this.maybeVerificationStarted(actor, verificationCase, document.fieldId),
        this.makeEvent(actor, "document_replacement_requested", "document", document.id, {
          fieldId: document.fieldId,
        }),
        this.makeEvent(actor, "message_sent", "message", message.id, {
          caseId: verificationCase.id,
          fieldId: document.fieldId,
          messageType: message.messageType,
        }),
      ],
    });
    return updated;
  }

  async recordCadastreVerification(
    actor: ActorContext,
    caseId: string,
    input: {
      cadastreNumber: string;
      rightHolder: string;
      rightType: string;
      registeredAreaHa: number | null;
      region: string | null;
      district: string | null;
      validityStatus: string;
      sourceReference: string;
      notes: string;
    },
  ) {
    this.requireVerifier(actor);
    const verificationCase = await this.requireWritableCase(actor, caseId);
    const normalized = this.cadastreProvider.normalizeManualEntry({
      cadastreNumber: input.cadastreNumber.trim(),
      rightHolder: input.rightHolder.trim(),
      rightType: input.rightType.trim(),
      registeredAreaHa: input.registeredAreaHa,
      region: input.region?.trim() || null,
      district: input.district?.trim() || null,
      validityStatus: input.validityStatus.trim(),
      sourceReference: input.sourceReference.trim(),
      notes: input.notes.trim(),
    });
    if (!normalized.cadastreNumber || !normalized.rightHolder || !normalized.rightType || !normalized.validityStatus) {
      throw new OriginationError("validation", "Cadastral verification is incomplete.");
    }
    const stamp = actorStamp(actor);
    const existing = await this.store.getCadastreByCase(verificationCase.id);
    const record: FieldCadastreVerificationRecord = {
      id: existing?.id ?? randomUUID(),
      caseId: verificationCase.id,
      fieldId: verificationCase.fieldId,
      providerId: normalized.providerId,
      cadastreNumber: normalized.cadastreNumber,
      rightHolder: normalized.rightHolder,
      rightType: normalized.rightType,
      registeredAreaHa: normalized.registeredAreaHa,
      region: normalized.region,
      district: normalized.district,
      validityStatus: normalized.validityStatus,
      sourceReference: normalized.sourceReference,
      notes: normalized.notes,
      checkedByUserId: stamp.userId,
      checkedByRole: stamp.role,
      checkedByPersonaId: stamp.personaId,
      checkedAt: this.clock(),
    };
    await this.store.upsertCadastre(record);
    await this.audit(actor, "cadastre_verified", "cadastre", record.id, {
      caseId: verificationCase.id,
      fieldId: verificationCase.fieldId,
      providerId: record.providerId,
    });
    return record;
  }

  async addScasEvidence(
    actor: ActorContext,
    input: {
      caseId: string;
      kind: FieldEvidenceKind;
      notes: string;
      imageryDate?: string | null;
      filename?: string;
      mimeType?: string;
      bytes?: Uint8Array;
    },
  ) {
    this.requireVerifier(actor);
    const verificationCase = await this.requireWritableCase(actor, input.caseId);
    const stamp = actorStamp(actor);
    const at = this.clock();
    const id = randomUUID();
    let objectPath: string | null = null;
    let sha256: string | null = null;
    if (input.bytes && input.filename && input.mimeType) {
      assertAllowedUpload({
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.bytes.byteLength,
      });
      objectPath = scasEvidenceObjectPath({
        organizationId: stamp.organizationId ?? verificationCase.organizationId,
        caseId: verificationCase.id,
        evidenceId: id,
        filename: input.filename,
      });
      await this.store.putBlob({
        bucket: SCAS_EVIDENCE_BUCKET,
        objectPath,
        bytes: input.bytes,
        contentType: input.mimeType,
      });
      sha256 = sha256Hex(input.bytes);
    }
    const record = {
      id,
      caseId: verificationCase.id,
      fieldId: verificationCase.fieldId,
      kind: input.kind,
      notes: input.notes.trim(),
      imageryDate: input.imageryDate ?? null,
      bucket: objectPath ? SCAS_EVIDENCE_BUCKET : null,
      objectPath,
      originalFilename: input.filename ?? null,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.bytes?.byteLength ?? null,
      sha256,
      uploadedByUserId: stamp.userId,
      uploadedAt: at,
    };
    await this.store.insertEvidence(record);
    return record;
  }

  async requestChanges(actor: ActorContext, caseId: string, explanation: string) {
    this.requireVerifier(actor);
    const note = explanation.trim();
    if (!note) {
      throw new OriginationError("validation", "Requesting changes requires an explanation.");
    }
    const verificationCase = await this.requireOpenVerifierCase(actor, caseId);
    const field = await this.store.getFieldById(verificationCase.fieldId);
    if (!field) {
      throw new OriginationError("not_found");
    }
    const at = this.clock();
    const stamp = actorStamp(actor);
    const nextField = { ...field, status: "CHANGES_REQUESTED" as const, updatedAt: at };
    const nextCase = { ...verificationCase, status: "CHANGES_REQUESTED" as const, updatedAt: at };
    const message: FieldVerificationMessageRecord = {
      id: randomUUID(),
      caseId: verificationCase.id,
      fieldId: field.id,
      senderUserId: stamp.userId,
      senderRole: stamp.role,
      senderPersonaId: stamp.personaId,
      body: note,
      messageType: "DECISION",
      linkedDocumentId: null,
      createdAt: at,
    };
    await this.store.applyChangeRequestBundle({
      field: nextField,
      verificationCase: nextCase,
      document: null,
      message,
      events: [
        ...this.maybeVerificationStarted(actor, verificationCase, field.id),
        this.makeEvent(actor, "changes_requested", "case", verificationCase.id, { fieldId: field.id }),
        this.makeEvent(actor, "message_sent", "message", message.id, {
          caseId: verificationCase.id,
          fieldId: field.id,
          messageType: message.messageType,
        }),
      ],
    });
  }

  async rejectField(actor: ActorContext, caseId: string, reason: string) {
    this.requireVerifier(actor);
    const note = reason.trim();
    if (!note) {
      throw new OriginationError("validation", "Rejection requires a reason.");
    }
    const verificationCase = await this.requireOpenVerifierCase(actor, caseId);
    const field = await this.store.getFieldById(verificationCase.fieldId);
    if (!field) {
      throw new OriginationError("not_found");
    }
    const at = this.clock();
    const stamp = actorStamp(actor);
    const nextField = { ...field, status: "REJECTED" as const, updatedAt: at };
    const nextCase = { ...verificationCase, status: "REJECTED" as const, updatedAt: at };
    const message: FieldVerificationMessageRecord = {
      id: randomUUID(),
      caseId: verificationCase.id,
      fieldId: field.id,
      senderUserId: stamp.userId,
      senderRole: stamp.role,
      senderPersonaId: stamp.personaId,
      body: note,
      messageType: "DECISION",
      linkedDocumentId: null,
      createdAt: at,
    };
    await this.store.applyRejectionBundle({
      field: nextField,
      verificationCase: nextCase,
      message,
      event: this.makeEvent(actor, "field_rejected", "field", field.id, { caseId: verificationCase.id }),
    });
  }

  async approveField(actor: ActorContext, caseId: string) {
    this.requireVerifier(actor);
    const verificationCase = await this.requireOpenVerifierCase(actor, caseId);
    const field = await this.store.getFieldById(verificationCase.fieldId);
    if (!field) {
      throw new OriginationError("not_found");
    }
    const cadastre = await this.store.getCadastreByCase(verificationCase.id);
    if (!cadastre) {
      throw new OriginationError("invalid_state", "Cadastral verification is required before approval.");
    }
    const submission = await this.store.getSubmission(verificationCase.currentSubmissionId);
    if (!submission) {
      throw new OriginationError("invalid_state", "Approval requires the current submission snapshot.");
    }
    const documents = await this.store.listDocuments(field.id);
    const submitted = submission.documentIds.map((id) => {
      const match = documents.find((document) => document.id === id);
      if (!match) {
        throw new OriginationError("invalid_state", "A submitted document is missing.");
      }
      return match;
    });
    if (submitted.length === 0 || submitted.some((document) => document.status !== "ACCEPTED")) {
      throw new OriginationError("invalid_state", "Required evidence must be reviewed and accepted.");
    }
    const extraAccepted = documents.filter(
      (document) =>
        document.current &&
        document.status === "ACCEPTED" &&
        !submission.documentIds.includes(document.id),
    );
    if (extraAccepted.length > 0) {
      throw new OriginationError(
        "invalid_state",
        "Accepted evidence exists outside the current submission snapshot.",
      );
    }
    const stamp = actorStamp(actor);
    const at = this.clock();
    const evidence = await this.store.listEvidence(verificationCase.id);
    const snapshotId = randomUUID();
    const message: FieldVerificationMessageRecord = {
      id: randomUUID(),
      caseId: verificationCase.id,
      fieldId: field.id,
      senderUserId: stamp.userId,
      senderRole: stamp.role,
      senderPersonaId: stamp.personaId,
      body: "Field approved. Verified field snapshot recorded. No DAC was created.",
      messageType: "DECISION",
      linkedDocumentId: null,
      createdAt: at,
    };
    const snapshot = {
      id: snapshotId,
      fieldId: field.id,
      caseId: verificationCase.id,
      submissionId: submission.id,
      payload: {
        producerDeclared: submission.declared,
        submissionId: submission.id,
        submissionVersion: submission.version,
        acceptedDocumentIds: submitted.map((document) => document.id),
        acceptedDocuments: submitted.map((document) => ({
          id: document.id,
          documentType: document.documentType,
          version: document.version,
          sha256: document.sha256,
        })),
        cadastreVerification: cadastre,
        evidenceIds: evidence.map((item) => item.id),
        reviewerUserId: stamp.userId,
        reviewerRole: stamp.role,
        reviewerPersonaId: stamp.personaId,
        approvedAt: at,
      },
      approvedByUserId: stamp.userId,
      approvedByRole: stamp.role,
      approvedByPersonaId: stamp.personaId,
      approvedAt: at,
    };
    return this.store.applyApprovalBundle({
      snapshot,
      field: {
        ...field,
        status: "VERIFIED",
        verifiedSnapshotId: snapshotId,
        updatedAt: at,
      },
      verificationCase: { ...verificationCase, status: "VERIFIED", updatedAt: at },
      message,
      event: this.makeEvent(actor, "field_verified", "field", field.id, {
        snapshotId,
        submissionId: submission.id,
        reviewerUserId: stamp.userId,
        reviewerPersonaId: stamp.personaId,
      }),
    });
  }

  async tryHardDeleteVerified(actor: ActorContext, fieldId: string) {
    const field = await this.resolveField(fieldId);
    if (!field) {
      throw new OriginationError("not_found");
    }
    if (field.status === "VERIFIED") {
      throw new OriginationError("immutable", "A verified field cannot be hard deleted.");
    }
    if (!canManageProducerOrgFields(actor, field.organizationId)) {
      throw new OriginationError("forbidden");
    }
    throw new OriginationError("immutable", "Hard delete is not offered. Archive a draft instead.");
  }

  async authorizedBlob(
    actor: ActorContext,
    bucket: string,
    objectPath: string,
  ) {
    if (bucket === FIELD_DOCUMENT_BUCKET) {
      const fields = await this.store.listAllFields();
      for (const field of fields) {
        const documents = await this.store.listDocuments(field.id);
        const match = documents.find(
          (document) => document.bucket === bucket && document.objectPath === objectPath,
        );
        if (match) {
          if (!canReadProducerOrgFields(actor, field.organizationId)) {
            throw new OriginationError("forbidden");
          }
          return this.store.getBlob(bucket, objectPath);
        }
      }
    }
    if (bucket === SCAS_EVIDENCE_BUCKET) {
      if (!isScasVerifier(actor) && !actorCanReadAll(actor)) {
        throw new OriginationError("forbidden");
      }
      return this.store.getBlob(bucket, objectPath);
    }
    throw new OriginationError("forbidden");
  }

  async isObjectPublic(bucket: string, objectPath: string) {
    return this.store.hasPublicObjectUrl(bucket, objectPath);
  }

  private assertUploadWindow(field: ProducerFieldRecord, _replacesDocumentId?: string | null) {
    void _replacesDocumentId;
    if (field.status !== "DRAFT" && field.status !== "CHANGES_REQUESTED") {
      throw new OriginationError("immutable", "Producer evidence is frozen until SCAS requests changes.");
    }
  }

  private async planDocumentVersion(
    fieldId: string,
    documentType: FieldDocumentType,
    replacesDocumentId?: string | null,
  ) {
    const field = await this.store.getFieldById(fieldId);
    if (!field) {
      throw new OriginationError("not_found");
    }
    const documents = await this.store.listDocuments(fieldId);
    if (replacesDocumentId) {
      const replaces = documents.find((document) => document.id === replacesDocumentId) ?? null;
      if (!replaces || replaces.fieldId !== fieldId) {
        throw new OriginationError("not_found");
      }
      if (replaces.documentType !== documentType) {
        throw new OriginationError("invalid_state", "A replacement must keep the same document type.");
      }
      if (field.status !== "DRAFT" && field.status !== "CHANGES_REQUESTED") {
        throw new OriginationError("invalid_state", "Producer evidence is frozen until SCAS requests changes.");
      }
      return { version: replaces.version + 1, replaces };
    }
    const currentSameType = currentDocuments(documents).find(
      (document) => document.documentType === documentType,
    );
    if (currentSameType) {
      if (field.status !== "DRAFT") {
        throw new OriginationError("validation", "After submission, only a replacement version can be uploaded.");
      }
      return { version: currentSameType.version + 1, replaces: currentSameType };
    }
    return {
      version: 1,
      replaces: null as FieldDocumentRecord | null,
    };
  }

  private async recordDocument(
    actor: ActorContext,
    field: ProducerFieldRecord,
    input: {
      intentId?: string | null;
      documentId: string;
      documentType: FieldDocumentType;
      filename: string;
      mimeType: string;
      objectPath: string;
      version: number;
      replacesDocumentId?: string | null;
      bytes: Uint8Array;
    },
  ) {
    const stamp = actorStamp(actor);
    const at = this.clock();
    const record: FieldDocumentRecord = {
      id: input.documentId,
      fieldId: field.id,
      submissionId: field.currentSubmissionId,
      documentType: input.documentType,
      bucket: FIELD_DOCUMENT_BUCKET,
      objectPath: input.objectPath,
      originalFilename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      sha256: sha256Hex(input.bytes),
      version: input.version,
      status: "UPLOADED",
      classification: "CONFIDENTIAL",
      retentionStatus: "ACTIVE",
      malwareScanStatus: "NOT_SCANNED",
      uploadedByUserId: stamp.userId,
      uploadedAt: at,
      replacesDocumentId: input.replacesDocumentId ?? null,
      current: true,
    };
    let message: FieldVerificationMessageRecord | null = null;
    if (field.status !== "DRAFT") {
      const verificationCase = await this.store.getCaseByFieldId(field.id);
      if (verificationCase) {
        message = {
          id: randomUUID(),
          caseId: verificationCase.id,
          fieldId: field.id,
          senderUserId: stamp.userId,
          senderRole: stamp.role,
          senderPersonaId: stamp.personaId,
          body: `Uploaded replacement ${input.filename} (v${input.version}).`,
          messageType: "DOCUMENT_UPLOADED",
          linkedDocumentId: record.id,
          createdAt: at,
        };
      }
    }
    return this.store.commitDocumentBundle({
      intentId: input.intentId ?? null,
      document: record,
      supersededId: input.replacesDocumentId ?? null,
      message,
      event: this.makeEvent(
        actor,
        input.replacesDocumentId ? "document_replaced" : "document_uploaded",
        "document",
        record.id,
        {
          fieldId: field.id,
          version: input.version,
          documentType: record.documentType,
        },
      ),
    });
  }

  private async freezeAndOpenCase(
    actor: ActorContext,
    field: ProducerFieldRecord,
    fieldStatus: "SUBMITTED" | "RESUBMITTED",
    caseStatus: "NEW" | "RESUBMITTED",
    eventType: OriginationEventType,
  ) {
    const stamp = actorStamp(actor);
    const at = this.clock();
    const documents = currentDocuments(await this.store.listDocuments(field.id));
    const seq = await this.store.nextSubmissionSequence();
    const submission: FieldSubmissionRecord = {
      id: randomUUID(),
      publicId: `SUB-${field.declared.season}-${pad(seq)}`,
      fieldId: field.id,
      organizationId: field.organizationId,
      version: (await this.store.listSubmissions(field.id)).length + 1,
      declared: field.declared,
      documentIds: documents.map((document) => document.id),
      submittedByUserId: stamp.userId,
      submittedByRole: stamp.role,
      submittedByPersonaId: stamp.personaId,
      submittedAt: at,
    };
    let verificationCase = await this.store.getCaseByFieldId(field.id);
    const caseIsNew = !verificationCase;
    if (!verificationCase) {
      const caseSeq = await this.store.nextCaseSequence();
      verificationCase = {
        id: randomUUID(),
        publicId: `VCASE-${field.declared.season}-${pad(caseSeq)}`,
        fieldId: field.id,
        organizationId: field.organizationId,
        currentSubmissionId: submission.id,
        status: caseStatus,
        assignedReviewerUserId: null,
        assignedReviewerPersonaId: null,
        createdAt: at,
        updatedAt: at,
      };
    } else {
      verificationCase = {
        ...verificationCase,
        currentSubmissionId: submission.id,
        status: caseStatus,
        updatedAt: at,
      };
    }
    const updatedField = {
      ...field,
      status: fieldStatus,
      currentSubmissionId: submission.id,
      updatedAt: at,
    };
    return this.store.applySubmissionBundle({
      expectedFieldStatus: field.status === "DRAFT" ? "DRAFT" : "CHANGES_REQUESTED",
      field: updatedField,
      submission,
      verificationCase,
      caseIsNew,
      event: this.makeEvent(actor, eventType, "field", field.id, {
        submissionId: submission.id,
        publicId: field.publicId,
      }),
    });
  }

  private async requireManageableField(actor: ActorContext, fieldRef: string) {
    const field = await this.resolveField(fieldRef);
    if (!field) {
      throw new OriginationError("not_found");
    }
    if (!canManageProducerOrgFields(actor, field.organizationId)) {
      throw new OriginationError("forbidden");
    }
    return field;
  }

  private requireVerifier(actor: ActorContext) {
    if (!isScasVerifier(actor)) {
      throw new OriginationError("forbidden");
    }
  }

  private async requireWritableCase(actor: ActorContext, caseRef: string) {
    const verificationCase = await this.resolveCase(caseRef);
    if (!verificationCase) {
      throw new OriginationError("not_found");
    }
    if (!isScasVerifier(actor)) {
      throw new OriginationError("forbidden");
    }
    if (
      verificationCase.status === "VERIFIED" ||
      verificationCase.status === "REJECTED"
    ) {
      throw new OriginationError("invalid_state");
    }
    return this.markUnderReview(actor, verificationCase);
  }

  private async requireWritableCaseByField(actor: ActorContext, fieldId: string) {
    const verificationCase = await this.store.getCaseByFieldId(fieldId);
    if (!verificationCase) {
      throw new OriginationError("not_found");
    }
    return this.requireWritableCase(actor, verificationCase.id);
  }

  private async requireOpenVerifierCase(actor: ActorContext, caseRef: string) {
    this.requireVerifier(actor);
    const verificationCase = await this.resolveCase(caseRef);
    if (!verificationCase) {
      throw new OriginationError("not_found");
    }
    if (verificationCase.status === "VERIFIED" || verificationCase.status === "REJECTED") {
      throw new OriginationError("invalid_state");
    }
    return verificationCase;
  }

  private async requireOpenVerifierCaseByField(actor: ActorContext, fieldId: string) {
    const verificationCase = await this.store.getCaseByFieldId(fieldId);
    if (!verificationCase) {
      throw new OriginationError("not_found");
    }
    return this.requireOpenVerifierCase(actor, verificationCase.id);
  }

  private maybeVerificationStarted(
    actor: ActorContext,
    verificationCase: FieldVerificationCaseRecord,
    fieldId: string,
  ) {
    if (verificationCase.status !== "NEW" && verificationCase.status !== "RESUBMITTED") {
      return [];
    }
    return [
      this.makeEvent(actor, "verification_started", "case", verificationCase.id, {
        fieldId,
        from: verificationCase.status,
      }),
    ];
  }

  private async markUnderReview(actor: ActorContext, verificationCase: FieldVerificationCaseRecord) {
    if (verificationCase.status === "NEW" || verificationCase.status === "RESUBMITTED") {
      const field = await this.store.getFieldById(verificationCase.fieldId);
      const at = this.clock();
      if (field && field.status !== "CHANGES_REQUESTED") {
        await this.store.updateField({ ...field, status: "UNDER_REVIEW", updatedAt: at });
      }
      const updated = await this.store.updateCase({
        ...verificationCase,
        status: "UNDER_REVIEW",
        updatedAt: at,
      });
      await this.audit(actor, "verification_started", "case", updated.id, {
        fieldId: verificationCase.fieldId,
        from: verificationCase.status,
      });
      return updated;
    }
    return verificationCase;
  }

  private async resolveField(fieldRef: string) {
    return (
      (await this.store.getFieldById(fieldRef)) ??
      (await this.store.getFieldByPublicId(fieldRef))
    );
  }

  private async resolveCase(caseRef: string) {
    return (
      (await this.store.getCaseById(caseRef)) ??
      (await this.store.getCaseByPublicId(caseRef))
    );
  }

  private makeEvent(
    actor: ActorContext,
    eventType: OriginationEventType,
    objectType: string,
    objectId: string,
    metadata: Record<string, unknown>,
  ) {
    const stamp = actorStamp(actor);
    return {
      id: randomUUID(),
      occurredAt: this.clock(),
      actorUserId: stamp.userId,
      effectiveRole: stamp.role,
      personaId: stamp.personaId,
      organizationId: stamp.organizationId,
      eventType,
      objectType,
      objectId,
      result: "ok" as const,
      metadata,
    };
  }

  private async audit(
    actor: ActorContext,
    eventType: OriginationEventType,
    objectType: string,
    objectId: string,
    metadata: Record<string, unknown>,
  ) {
    const stamp = actorStamp(actor);
    await this.store.insertEvent({
      id: randomUUID(),
      occurredAt: this.clock(),
      actorUserId: stamp.userId,
      effectiveRole: stamp.role,
      personaId: stamp.personaId,
      organizationId: stamp.organizationId,
      eventType,
      objectType,
      objectId,
      result: "ok",
      metadata,
    });
  }
}

function actorCanReadAll(actor: ActorContext) {
  return actor.effective.permissions.includes("fields.read.all");
}
