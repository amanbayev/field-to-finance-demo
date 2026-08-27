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
  FIELD_DOCUMENT_BUCKET,
  OriginationError,
  SCAS_EVIDENCE_BUCKET,
  type FieldCadastreVerificationRecord,
  type FieldDocumentRecord,
  type FieldDocumentType,
  type FieldEvidenceKind,
  type FieldMessageType,
  type FieldSubmissionRecord,
  type FieldVerificationCaseRecord,
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
    return {
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

  async commitDirectUpload(
    actor: ActorContext,
    input: {
      fieldId: string;
      documentId: string;
      documentType: FieldDocumentType;
      filename: string;
      mimeType: string;
      objectPath: string;
      version: number;
      replacesDocumentId?: string | null;
    },
  ) {
    const field = await this.requireManageableField(actor, input.fieldId);
    this.assertUploadWindow(field, input.replacesDocumentId);
    const blob = await this.store.getBlob(FIELD_DOCUMENT_BUCKET, input.objectPath);
    if (!blob) {
      throw new OriginationError("storage", "Uploaded object was not found.");
    }
    return this.recordDocument(actor, field, {
      documentId: input.documentId,
      documentType: input.documentType,
      filename: input.filename,
      mimeType: input.mimeType,
      objectPath: input.objectPath,
      version: input.version,
      replacesDocumentId: input.replacesDocumentId,
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
    const stamp = actorStamp(actor);
    const message = {
      id: randomUUID(),
      caseId: verificationCase.id,
      fieldId: verificationCase.fieldId,
      senderUserId: stamp.userId,
      senderRole: stamp.role,
      senderPersonaId: stamp.personaId,
      body,
      messageType: input.messageType ?? "COMMENT",
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
    const verificationCase = await this.requireWritableCaseByField(actor, document.fieldId);
    const updated = { ...document, status: "REPLACEMENT_REQUESTED" as const };
    await this.store.updateDocument(updated);
    await this.sendMessage(actor, {
      caseId: verificationCase.id,
      body: note,
      messageType: "DOCUMENT_REQUEST",
      linkedDocumentId: document.id,
    });
    await this.audit(actor, "document_replacement_requested", "document", document.id, {
      fieldId: document.fieldId,
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
    const verificationCase = await this.requireWritableCase(actor, caseId);
    const field = await this.store.getFieldById(verificationCase.fieldId);
    if (!field) {
      throw new OriginationError("not_found");
    }
    const at = this.clock();
    await this.store.updateField({ ...field, status: "CHANGES_REQUESTED", updatedAt: at });
    await this.store.updateCase({
      ...verificationCase,
      status: "CHANGES_REQUESTED",
      updatedAt: at,
    });
    await this.sendMessage(actor, {
      caseId: verificationCase.id,
      body: note,
      messageType: "DECISION",
    });
    await this.audit(actor, "changes_requested", "case", verificationCase.id, {
      fieldId: field.id,
    });
  }

  async rejectField(actor: ActorContext, caseId: string, reason: string) {
    this.requireVerifier(actor);
    const note = reason.trim();
    if (!note) {
      throw new OriginationError("validation", "Rejection requires a reason.");
    }
    const verificationCase = await this.requireWritableCase(actor, caseId);
    const field = await this.store.getFieldById(verificationCase.fieldId);
    if (!field) {
      throw new OriginationError("not_found");
    }
    const at = this.clock();
    await this.store.updateField({ ...field, status: "REJECTED", updatedAt: at });
    await this.store.updateCase({ ...verificationCase, status: "REJECTED", updatedAt: at });
    await this.sendMessage(actor, {
      caseId: verificationCase.id,
      body: note,
      messageType: "DECISION",
    });
    await this.audit(actor, "field_rejected", "field", field.id, { caseId: verificationCase.id });
  }

  async approveField(actor: ActorContext, caseId: string) {
    this.requireVerifier(actor);
    const verificationCase = await this.requireWritableCase(actor, caseId);
    const field = await this.store.getFieldById(verificationCase.fieldId);
    if (!field) {
      throw new OriginationError("not_found");
    }
    const cadastre = await this.store.getCadastreByCase(verificationCase.id);
    if (!cadastre) {
      throw new OriginationError("invalid_state", "Cadastral verification is required before approval.");
    }
    const documents = currentDocuments(await this.store.listDocuments(field.id));
    if (documents.length === 0 || documents.some((document) => document.status !== "ACCEPTED")) {
      throw new OriginationError("invalid_state", "Required evidence must be reviewed and accepted.");
    }
    const stamp = actorStamp(actor);
    const at = this.clock();
    const evidence = await this.store.listEvidence(verificationCase.id);
    const snapshot = await this.store.insertSnapshot({
      id: randomUUID(),
      fieldId: field.id,
      caseId: verificationCase.id,
      submissionId: verificationCase.currentSubmissionId,
      payload: {
        producerDeclared: field.declared,
        acceptedDocumentIds: documents.map((document) => document.id),
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
    });
    await this.store.updateField({
      ...field,
      status: "VERIFIED",
      verifiedSnapshotId: snapshot.id,
      updatedAt: at,
    });
    await this.store.updateCase({ ...verificationCase, status: "VERIFIED", updatedAt: at });
    await this.sendMessage(actor, {
      caseId: verificationCase.id,
      body: "Field approved. Verified field snapshot recorded. No DAC was created.",
      messageType: "DECISION",
    });
    await this.audit(actor, "field_verified", "field", field.id, {
      snapshotId: snapshot.id,
      reviewerUserId: stamp.userId,
      reviewerPersonaId: stamp.personaId,
    });
    return snapshot;
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

  private assertUploadWindow(field: ProducerFieldRecord, replacesDocumentId?: string | null) {
    const draftLike = field.status === "DRAFT";
    const replacementWindow =
      field.status === "CHANGES_REQUESTED" ||
      field.status === "RESUBMITTED" ||
      field.status === "UNDER_REVIEW" ||
      field.status === "SUBMITTED";
    if (!draftLike && !replacementWindow) {
      throw new OriginationError("immutable", "Evidence cannot be overwritten after submission.");
    }
    if (!draftLike && !replacesDocumentId) {
      throw new OriginationError("validation", "After submission, only a replacement version can be uploaded.");
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
      if (
        field.status !== "DRAFT" &&
        replaces.status !== "REPLACEMENT_REQUESTED" &&
        replaces.status !== "UPLOADED"
      ) {
        throw new OriginationError("invalid_state", "Only a requested or uploaded current file can be replaced.");
      }
      return { version: replaces.version + 1, replaces };
    }
    const lineage = currentDocuments(documents).filter(
      (document) => document.documentType === documentType,
    );
    return {
      version: lineage.reduce((max, document) => Math.max(max, document.version), 0) + 1,
      replaces: null as FieldDocumentRecord | null,
    };
  }

  private async recordDocument(
    actor: ActorContext,
    field: ProducerFieldRecord,
    input: {
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
    if (input.replacesDocumentId) {
      const replaces = await this.store.getDocument(input.replacesDocumentId);
      if (replaces) {
        await this.store.updateDocument({
          ...replaces,
          status: "SUPERSEDED",
          current: false,
        });
      }
    }
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
    await this.store.insertDocument(record);
    await this.audit(
      actor,
      input.replacesDocumentId ? "document_replaced" : "document_uploaded",
      "document",
      record.id,
      {
        fieldId: field.id,
        version: input.version,
        documentType: record.documentType,
      },
    );
    if (field.status !== "DRAFT") {
      const verificationCase = await this.store.getCaseByFieldId(field.id);
      if (verificationCase) {
        await this.store.insertMessage({
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
        });
      }
    }
    return record;
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
    await this.store.insertSubmission(submission);
    let verificationCase = await this.store.getCaseByFieldId(field.id);
    if (!verificationCase) {
      const caseSeq = await this.store.nextCaseSequence();
      verificationCase = await this.store.insertCase({
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
      });
    } else {
      verificationCase = await this.store.updateCase({
        ...verificationCase,
        currentSubmissionId: submission.id,
        status: caseStatus,
        updatedAt: at,
      });
    }
    const updatedField = await this.store.updateField({
      ...field,
      status: fieldStatus,
      currentSubmissionId: submission.id,
      updatedAt: at,
    });
    await this.audit(actor, eventType, "field", field.id, {
      submissionId: submission.id,
      publicId: field.publicId,
    });
    return { field: updatedField, submission, verificationCase };
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
