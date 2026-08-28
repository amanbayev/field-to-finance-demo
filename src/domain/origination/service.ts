import { createHash, randomUUID } from "node:crypto";
import type { ActorContext } from "@/domain/identity";
import {
  actorStamp,
  canListLiveDacOnContractsIndex,
  canManageProducerOrgFields,
  canReadOrigination,
  canReadOriginationDac,
  canReadProducerOrgFields,
  isIssuerOperator,
  isProducerOperator,
  isRegistrarIntakeOperator,
  isScasVerifier,
  matchesIssuerDacFilter,
  matchesProducerFilter,
  matchesRegistrarDacFilter,
  matchesScasDacFilter,
  matchesScasFilter,
} from "./access";
import { defaultCadastreProvider, type CadastreProvider } from "./cadastre";
import {
  assertAllowedUpload,
  fieldDocumentObjectPath,
  scasEvidenceObjectPath,
} from "./files";
import { resolveByUuidOrPublicId, isUuid } from "./refs";
import {
  allowsApproval,
  allowsChangeRequest,
  allowsIssuerDacConfirm,
  allowsProducerDacConfirm,
  allowsProducerUpload,
  allowsRegistrarDecision,
  allowsRegistrarReviewStart,
  allowsRejection,
  allowsScasDacEdit,
  allowsScasDacSubmit,
  allowsScasSendToProducer,
} from "./state-guards";
import { isPermittedIssuerOrganizationId } from "./issuers";
import {
  clearedDacConfirmations,
  hashCurrentDacTerms,
  termsFromDac,
} from "./terms";
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
  type IssuerDacFilter,
  type OriginationDacCommercialInput,
  type OriginationDacMessageRecord,
  type OriginationDacRecord,
  type OriginationEventType,
  type ProducerDeclaredData,
  type ProducerFieldFilter,
  type ProducerFieldRecord,
  type RegistrarDacFilter,
  type ScasCaseFilter,
  type ScasDacFilter,
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

function requestIdForCreate(value?: string) {
  const trimmed = value?.trim() ?? "";
  return isUuid(trimmed) ? trimmed.toLowerCase() : randomUUID();
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

  async createDraft(actor: ActorContext, input: ProducerDeclaredData, createRequestId?: string) {
    if (!isProducerOperator(actor) || !actor.effective.organization) {
      throw new OriginationError("forbidden");
    }
    const declared = requireDeclared(input);
    const stamp = actorStamp(actor);
    const at = this.clock();
    const requestId = requestIdForCreate(createRequestId);
    const field: ProducerFieldRecord = {
      id: randomUUID(),
      publicId: `FIELD-${declared.season}-0000`,
      organizationId: actor.effective.organization.id,
      status: "DRAFT",
      declared,
      currentSubmissionId: null,
      verifiedSnapshotId: null,
      clientCreateRequestId: requestId,
      createdByUserId: stamp.userId,
      createdByRole: stamp.role,
      createdAt: at,
      updatedAt: at,
      archivedAt: null,
    };
    const event = this.makeEvent(actor, "field_created", "field", field.id, {
      publicId: field.publicId,
      createRequestId: requestId,
    });
    return this.store.createFieldIdempotent(field, event);
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
    const dac = await this.store.getActiveDacByField(field.id);
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
      dac,
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
    const intent = await this.store.prepareUploadIntent({
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
      documentId: intent.documentId,
      version: intent.version,
      objectPath: intent.objectPath,
      bucket: FIELD_DOCUMENT_BUCKET,
      replacesDocumentId: intent.replacesDocumentId,
      documentType: intent.documentType,
      filename: intent.originalFilename,
      mimeType: intent.mimeType,
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
    if (!allowsChangeRequest(field.status, verificationCase.status)) {
      throw new OriginationError("invalid_state", "Changes cannot be requested from this state.");
    }
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
    if (!allowsChangeRequest(field.status, verificationCase.status)) {
      throw new OriginationError("invalid_state", "Changes cannot be requested from this state.");
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
    if (!allowsRejection(field.status, verificationCase.status)) {
      throw new OriginationError("invalid_state", "Rejection is not allowed from this state.");
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
    const verificationCase = await this.resolveCase(caseId);
    if (!verificationCase) {
      throw new OriginationError("not_found");
    }
    const field = await this.store.getFieldById(verificationCase.fieldId);
    if (!field) {
      throw new OriginationError("not_found");
    }
    if (!allowsApproval(field.status, verificationCase.status)) {
      throw new OriginationError(
        "invalid_state",
        "Approval is only available while the field is under review.",
      );
    }
    if (
      field.currentSubmissionId !== verificationCase.currentSubmissionId ||
      !verificationCase.currentSubmissionId
    ) {
      throw new OriginationError("invalid_state", "Approval is not bound to the current submission.");
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

  async createDacFromVerifiedCase(actor: ActorContext, caseRef: string) {
    this.requireVerifier(actor);
    const verificationCase = await this.resolveCase(caseRef);
    if (!verificationCase) {
      throw new OriginationError("not_found");
    }
    const field = await this.store.getFieldById(verificationCase.fieldId);
    if (!field) {
      throw new OriginationError("not_found");
    }
    if (field.status !== "VERIFIED" || verificationCase.status !== "VERIFIED") {
      throw new OriginationError("invalid_state", "DAC can only be created from a verified field.");
    }
    const snapshot = await this.store.getSnapshotByField(field.id);
    if (!snapshot || snapshot.id !== field.verifiedSnapshotId) {
      throw new OriginationError("invalid_state", "A verified field snapshot is required.");
    }
    const existing = await this.store.getActiveDacBySnapshot(snapshot.id);
    if (existing) {
      throw new OriginationError(
        "invalid_state",
        "An active DAC already exists for this verified snapshot.",
      );
    }
    const cadastre = snapshot.payload.cadastreVerification;
    const stamp = actorStamp(actor);
    const at = this.clock();
    const declared = snapshot.payload.producerDeclared;
    const dac: OriginationDacRecord = {
      id: randomUUID(),
      publicId: `DAC-${declared.season}-0000`,
      fieldId: field.id,
      verifiedSnapshotId: snapshot.id,
      scasCaseId: verificationCase.id,
      producerOrganizationId: field.organizationId,
      issuerOrganizationId: null,
      status: "DRAFT",
      crop: declared.crop,
      harvestYear: declared.season,
      expectedVolumeTonnes: null,
      qualityClass: null,
      producerReference: field.publicId,
      cadastreNumber: cadastre.cadastreNumber,
      declaredAreaHectares: declared.declaredAreaHa,
      verifiedAreaHectares: cadastre.registeredAreaHa,
      region: cadastre.region ?? declared.region,
      district: cadastre.district ?? declared.district,
      landRightHolder: cadastre.rightHolder,
      landRightType: cadastre.rightType,
      scasNotes: "",
      registrarNotes: "",
      termsVersion: 1,
      currentTermsHash: "",
      ...clearedDacConfirmations(),
      executedTermsSnapshot: null,
      executedTermsHash: null,
      executedAt: null,
      createdByUserId: stamp.userId,
      updatedByUserId: stamp.userId,
      registrarReviewedByUserId: null,
      submittedToRegistrarAt: null,
      acceptedAt: null,
      returnedAt: null,
      createdAt: at,
      updatedAt: at,
    };
    dac.currentTermsHash = hashCurrentDacTerms(dac);
    return this.store.createDac(
      dac,
      this.makeEvent(actor, "dac_created", "dac", dac.id, {
        fieldId: field.id,
        verifiedSnapshotId: snapshot.id,
        scasCaseId: verificationCase.id,
      }),
    );
  }

  async updateDacDraft(actor: ActorContext, dacRef: string, input: OriginationDacCommercialInput) {
    this.requireVerifier(actor);
    const dac = await this.requireReadableDac(actor, dacRef);
    if (!allowsScasDacEdit(dac.status)) {
      throw new OriginationError("invalid_state", "SCAS can edit DAC commercial terms only while the DAC is a draft.");
    }
    const commercial = this.requireCommercial(input);
    const stamp = actorStamp(actor);
    const at = this.clock();
    const next: OriginationDacRecord = {
      ...dac,
      ...commercial,
      ...clearedDacConfirmations(),
      termsVersion: dac.termsVersion + 1,
      updatedByUserId: stamp.userId,
      updatedAt: at,
    };
    next.currentTermsHash = hashCurrentDacTerms(next);
    return this.store.applyDacTransition({
      kind: "update_draft",
      expectedStatuses: ["DRAFT"],
      dac: next,
      event: this.makeEvent(actor, "dac_updated", "dac", next.id, {
        fieldId: next.fieldId,
        termsVersion: next.termsVersion,
        currentTermsHash: next.currentTermsHash,
      }),
    });
  }

  async sendDacToProducer(actor: ActorContext, dacRef: string) {
    this.requireVerifier(actor);
    const dac = await this.requireReadableDac(actor, dacRef);
    if (!allowsScasSendToProducer(dac.status)) {
      throw new OriginationError("invalid_state", "Send to producer is allowed only from a draft.");
    }
    if (!dac.issuerOrganizationId || !isPermittedIssuerOrganizationId(dac.issuerOrganizationId)) {
      throw new OriginationError("validation", "A permitted issuer must be selected before confirmation.");
    }
    if (dac.expectedVolumeTonnes == null || !(dac.expectedVolumeTonnes > 0)) {
      throw new OriginationError("validation", "Expected volume is required before producer confirmation.");
    }
    const stamp = actorStamp(actor);
    const at = this.clock();
    const next: OriginationDacRecord = {
      ...dac,
      status: "PENDING_PRODUCER_CONFIRMATION",
      currentTermsHash: hashCurrentDacTerms(dac),
      ...clearedDacConfirmations(),
      updatedByUserId: stamp.userId,
      updatedAt: at,
    };
    return this.store.applyDacTransition({
      kind: "send_to_producer",
      expectedStatuses: ["DRAFT"],
      expectedTermsHash: next.currentTermsHash,
      dac: next,
      event: this.makeEvent(actor, "dac_sent_to_producer", "dac", next.id, {
        fieldId: next.fieldId,
        termsVersion: next.termsVersion,
        currentTermsHash: next.currentTermsHash,
      }),
    });
  }

  async confirmDacAsProducer(actor: ActorContext, dacRef: string) {
    const dac = await this.requireReadableDac(actor, dacRef);
    this.requireProducer(actor);
    if (!allowsProducerDacConfirm(dac.status)) {
      throw new OriginationError("invalid_state", "Producer can confirm only pending producer terms.");
    }
    const orgId = actor.effective.organization?.id;
    if (!orgId || orgId !== dac.producerOrganizationId) {
      throw new OriginationError("forbidden");
    }
    const stamp = actorStamp(actor);
    const at = this.clock();
    const hash = dac.currentTermsHash;
    const next: OriginationDacRecord = {
      ...dac,
      status: "PENDING_ISSUER_CONFIRMATION",
      producerConfirmedTermsHash: hash,
      producerConfirmedByUserId: stamp.userId,
      producerConfirmedByRole: stamp.role,
      producerConfirmedAt: at,
      updatedByUserId: stamp.userId,
      updatedAt: at,
    };
    return this.store.applyDacTransition({
      kind: "producer_confirm",
      expectedStatuses: ["PENDING_PRODUCER_CONFIRMATION"],
      expectedProducerOrganizationId: orgId,
      expectedTermsHash: hash,
      dac: next,
      event: this.makeEvent(actor, "dac_producer_confirmed", "dac", next.id, {
        fieldId: next.fieldId,
        termsVersion: next.termsVersion,
        currentTermsHash: hash,
      }),
    });
  }

  async returnDacAsProducer(actor: ActorContext, dacRef: string, reason: string) {
    const dac = await this.requireReadableDac(actor, dacRef);
    this.requireProducer(actor);
    if (!allowsProducerDacConfirm(dac.status)) {
      throw new OriginationError("invalid_state", "Producer can return only pending producer terms.");
    }
    const orgId = actor.effective.organization?.id;
    if (!orgId || orgId !== dac.producerOrganizationId) {
      throw new OriginationError("forbidden");
    }
    const note = reason.trim();
    if (!note) {
      throw new OriginationError("validation", "Return requires a reason.");
    }
    const stamp = actorStamp(actor);
    const at = this.clock();
    const next: OriginationDacRecord = {
      ...dac,
      status: "DRAFT",
      ...clearedDacConfirmations(),
      updatedByUserId: stamp.userId,
      updatedAt: at,
    };
    return this.store.applyDacTransition({
      kind: "producer_return",
      expectedStatuses: ["PENDING_PRODUCER_CONFIRMATION"],
      expectedProducerOrganizationId: orgId,
      dac: next,
      message: {
        id: randomUUID(),
        dacId: next.id,
        senderUserId: stamp.userId,
        senderRole: stamp.role,
        senderPersonaId: stamp.personaId,
        body: note,
        messageType: "DECISION",
        createdAt: at,
      },
      event: this.makeEvent(actor, "dac_producer_returned", "dac", next.id, {
        fieldId: next.fieldId,
        reason: note,
      }),
    });
  }

  async confirmDacAsIssuer(actor: ActorContext, dacRef: string) {
    const dac = await this.requireReadableDac(actor, dacRef);
    this.requireIssuer(actor);
    if (!allowsIssuerDacConfirm(dac.status)) {
      throw new OriginationError("invalid_state", "Issuer can confirm only pending issuer terms.");
    }
    const orgId = actor.effective.organization?.id;
    if (!orgId || orgId !== dac.issuerOrganizationId) {
      throw new OriginationError("forbidden");
    }
    if (dac.producerConfirmedTermsHash !== dac.currentTermsHash) {
      throw new OriginationError("invalid_state", "Issuer confirmation requires the same terms hash.");
    }
    const stamp = actorStamp(actor);
    const at = this.clock();
    const hash = dac.currentTermsHash;
    const snapshot = termsFromDac(dac) as unknown as Record<string, unknown>;
    const next: OriginationDacRecord = {
      ...dac,
      status: "EXECUTED",
      issuerConfirmedTermsHash: hash,
      issuerConfirmedByUserId: stamp.userId,
      issuerConfirmedByRole: stamp.role,
      issuerConfirmedAt: at,
      executedTermsSnapshot: snapshot,
      executedTermsHash: hash,
      executedAt: at,
      updatedByUserId: stamp.userId,
      updatedAt: at,
    };
    return this.store.applyDacTransition({
      kind: "issuer_confirm",
      expectedStatuses: ["PENDING_ISSUER_CONFIRMATION"],
      expectedIssuerOrganizationId: orgId,
      expectedTermsHash: hash,
      dac: next,
      event: this.makeEvent(actor, "dac_issuer_confirmed", "dac", next.id, {
        fieldId: next.fieldId,
        termsVersion: next.termsVersion,
        executedTermsHash: hash,
        executedAt: at,
      }),
    });
  }

  async returnDacAsIssuer(actor: ActorContext, dacRef: string, reason: string) {
    const dac = await this.requireReadableDac(actor, dacRef);
    this.requireIssuer(actor);
    if (!allowsIssuerDacConfirm(dac.status)) {
      throw new OriginationError("invalid_state", "Issuer can return only pending issuer terms.");
    }
    const orgId = actor.effective.organization?.id;
    if (!orgId || orgId !== dac.issuerOrganizationId) {
      throw new OriginationError("forbidden");
    }
    const note = reason.trim();
    if (!note) {
      throw new OriginationError("validation", "Return requires a reason.");
    }
    const stamp = actorStamp(actor);
    const at = this.clock();
    const next: OriginationDacRecord = {
      ...dac,
      status: "DRAFT",
      ...clearedDacConfirmations(),
      updatedByUserId: stamp.userId,
      updatedAt: at,
    };
    return this.store.applyDacTransition({
      kind: "issuer_return",
      expectedStatuses: ["PENDING_ISSUER_CONFIRMATION"],
      expectedIssuerOrganizationId: orgId,
      dac: next,
      message: {
        id: randomUUID(),
        dacId: next.id,
        senderUserId: stamp.userId,
        senderRole: stamp.role,
        senderPersonaId: stamp.personaId,
        body: note,
        messageType: "DECISION",
        createdAt: at,
      },
      event: this.makeEvent(actor, "dac_issuer_returned", "dac", next.id, {
        fieldId: next.fieldId,
        reason: note,
      }),
    });
  }

  async submitDacToRegistrar(actor: ActorContext, dacRef: string) {
    this.requireVerifier(actor);
    const dac = await this.requireReadableDac(actor, dacRef);
    if (!allowsScasDacSubmit(dac.status)) {
      throw new OriginationError("invalid_state", "Submit to registrar is not allowed from this state.");
    }
    if (!dac.executedTermsHash || !dac.executedAt) {
      throw new OriginationError("invalid_state", "Registrar intake requires an executed Producer-Issuer contract.");
    }
    const stamp = actorStamp(actor);
    const at = this.clock();
    const next: OriginationDacRecord = {
      ...dac,
      status: "READY_FOR_REGISTRAR",
      updatedByUserId: stamp.userId,
      submittedToRegistrarAt: at,
      updatedAt: at,
    };
    return this.store.applyDacTransition({
      kind: "submit_to_registrar",
      expectedStatuses: ["EXECUTED", "RETURNED_BY_REGISTRAR"],
      dac: next,
      event: this.makeEvent(actor, "dac_submitted_to_registrar", "dac", next.id, {
        fieldId: next.fieldId,
        from: dac.status,
        executedTermsHash: dac.executedTermsHash,
      }),
    });
  }

  async startRegistrarReview(actor: ActorContext, dacRef: string) {
    this.requireRegistrar(actor);
    const dac = await this.requireReadableDac(actor, dacRef);
    if (!allowsRegistrarReviewStart(dac.status)) {
      throw new OriginationError("invalid_state", "Registrar review can start only from ready intake.");
    }
    const stamp = actorStamp(actor);
    const at = this.clock();
    const next: OriginationDacRecord = {
      ...dac,
      status: "UNDER_REGISTRAR_REVIEW",
      registrarReviewedByUserId: stamp.userId,
      updatedByUserId: stamp.userId,
      updatedAt: at,
    };
    return this.store.applyDacTransition({
      kind: "start_review",
      expectedStatuses: ["READY_FOR_REGISTRAR"],
      dac: next,
      event: this.makeEvent(actor, "dac_review_started", "dac", next.id, { fieldId: next.fieldId }),
    });
  }

  async acceptDacIntake(actor: ActorContext, dacRef: string, notes?: string) {
    this.requireRegistrar(actor);
    const dac = await this.requireReadableDac(actor, dacRef);
    if (!allowsRegistrarDecision(dac.status)) {
      throw new OriginationError("invalid_state", "Registrar can accept only from intake review.");
    }
    const stamp = actorStamp(actor);
    const at = this.clock();
    const note = notes?.trim() ?? "";
    const next: OriginationDacRecord = {
      ...dac,
      status: "REGISTRAR_ACCEPTED",
      registrarNotes: note || dac.registrarNotes,
      registrarReviewedByUserId: stamp.userId,
      updatedByUserId: stamp.userId,
      acceptedAt: at,
      updatedAt: at,
    };
    return this.store.applyDacTransition({
      kind: "accept",
      expectedStatuses: ["READY_FOR_REGISTRAR", "UNDER_REGISTRAR_REVIEW"],
      dac: next,
      message: note
        ? {
            id: randomUUID(),
            dacId: next.id,
            senderUserId: stamp.userId,
            senderRole: stamp.role,
            senderPersonaId: stamp.personaId,
            body: note,
            messageType: "DECISION",
            createdAt: at,
          }
        : null,
      event: this.makeEvent(actor, "dac_accepted", "dac", next.id, {
        fieldId: next.fieldId,
        from: dac.status,
        createdPool: false,
        createdToken: false,
        createdIssuance: false,
        createdPlacement: false,
        chainWrite: false,
      }),
    });
  }

  async returnDacIntake(actor: ActorContext, dacRef: string, notes: string) {
    this.requireRegistrar(actor);
    const dac = await this.requireReadableDac(actor, dacRef);
    if (!allowsRegistrarDecision(dac.status)) {
      throw new OriginationError("invalid_state", "Registrar can return only from intake review.");
    }
    const note = notes.trim();
    if (!note) {
      throw new OriginationError("validation", "Return requires a reason.");
    }
    const stamp = actorStamp(actor);
    const at = this.clock();
    const next: OriginationDacRecord = {
      ...dac,
      status: "RETURNED_BY_REGISTRAR",
      registrarNotes: note,
      registrarReviewedByUserId: stamp.userId,
      updatedByUserId: stamp.userId,
      returnedAt: at,
      updatedAt: at,
    };
    return this.store.applyDacTransition({
      kind: "return_intake",
      expectedStatuses: ["READY_FOR_REGISTRAR", "UNDER_REGISTRAR_REVIEW"],
      dac: next,
      message: {
        id: randomUUID(),
        dacId: next.id,
        senderUserId: stamp.userId,
        senderRole: stamp.role,
        senderPersonaId: stamp.personaId,
        body: note,
        messageType: "DECISION",
        createdAt: at,
      },
      event: this.makeEvent(actor, "dac_returned", "dac", next.id, {
        fieldId: next.fieldId,
        from: dac.status,
        executedTermsHash: dac.executedTermsHash,
        executionUndone: false,
      }),
    });
  }

  async sendDacMessage(actor: ActorContext, dacRef: string, body: string) {
    const dac = await this.requireReadableDac(actor, dacRef);
    if (!isScasVerifier(actor) && !isRegistrarIntakeOperator(actor)) {
      throw new OriginationError("forbidden");
    }
    if (
      isRegistrarIntakeOperator(actor) &&
      (dac.status === "DRAFT" ||
        dac.status === "PENDING_PRODUCER_CONFIRMATION" ||
        dac.status === "PENDING_ISSUER_CONFIRMATION")
    ) {
      throw new OriginationError("not_found");
    }
    const text = body.trim();
    if (!text) {
      throw new OriginationError("validation", "Message is required.");
    }
    const stamp = actorStamp(actor);
    const at = this.clock();
    const message: OriginationDacMessageRecord = {
      id: randomUUID(),
      dacId: dac.id,
      senderUserId: stamp.userId,
      senderRole: stamp.role,
      senderPersonaId: stamp.personaId,
      body: text,
      messageType: "COMMENT",
      createdAt: at,
    };
    await this.store.insertDacMessage(message);
    await this.store.insertDacEvent(
      this.makeEvent(actor, "dac_message_sent", "dac", dac.id, { fieldId: dac.fieldId }),
    );
    return message;
  }

  async listScasDacs(actor: ActorContext, filter: ScasDacFilter = "all") {
    this.requireVerifier(actor);
    const dacs = await this.store.listDacs();
    return dacs.filter((item) => matchesScasDacFilter(item.status, filter));
  }

  async listIssuerDacs(actor: ActorContext, filter: IssuerDacFilter = "all") {
    this.requireIssuer(actor);
    const orgId = actor.effective.organization?.id;
    if (!orgId) {
      throw new OriginationError("forbidden");
    }
    const dacs = await this.store.listDacs();
    return dacs.filter(
      (item) => item.issuerOrganizationId === orgId && matchesIssuerDacFilter(item.status, filter),
    );
  }

  async listRegistrarIntake(actor: ActorContext, filter: RegistrarDacFilter = "all") {
    this.requireRegistrar(actor);
    const dacs = await this.store.listDacs();
    return dacs.filter((item) => matchesRegistrarDacFilter(item.status, filter));
  }

  async listLiveOriginatedDacs(actor: ActorContext) {
    const dacs = await this.store.listDacs();
    const visible = dacs.filter((item) => canListLiveDacOnContractsIndex(actor, item));
    const rows: Array<{ dac: OriginationDacRecord; fieldPublicId: string }> = [];
    for (const dac of visible) {
      const field = await this.store.getFieldById(dac.fieldId);
      rows.push({ dac, fieldPublicId: field?.publicId ?? "" });
    }
    return rows;
  }

  async getDacBundle(actor: ActorContext, dacRef: string) {
    const dac = await this.requireReadableDac(actor, dacRef);
    const field = await this.store.getFieldById(dac.fieldId);
    if (!field) {
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
    const fieldMessages = verificationCase
      ? await this.store.listMessages(verificationCase.id)
      : [];
    const snapshot = await this.store.getSnapshotByField(field.id);
    const messages = await this.store.listDacMessages(dac.id);
    const events = await this.store.listDacEvents(dac.id);
    return {
      field,
      documents,
      submissions,
      verificationCase,
      cadastre,
      evidence,
      messages,
      snapshot,
      dac,
      events,
      latestRequest: null,
      fieldMessages,
    };
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
    if (!allowsProducerUpload(field.status)) {
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

  private requireRegistrar(actor: ActorContext) {
    if (!isRegistrarIntakeOperator(actor)) {
      throw new OriginationError("forbidden");
    }
  }

  private requireProducer(actor: ActorContext) {
    if (!isProducerOperator(actor)) {
      throw new OriginationError("forbidden");
    }
  }

  private requireIssuer(actor: ActorContext) {
    if (!isIssuerOperator(actor)) {
      throw new OriginationError("forbidden");
    }
  }

  private async resolveDac(dacRef: string) {
    return resolveByUuidOrPublicId(
      dacRef,
      (id) => this.store.getDacById(id),
      (publicId) => this.store.getDacByPublicId(publicId),
    );
  }

  private async requireReadableDac(actor: ActorContext, dacRef: string) {
    const dac = await this.resolveDac(dacRef);
    if (!dac || !canReadOriginationDac(actor, dac)) {
      throw new OriginationError("not_found");
    }
    return dac;
  }

  private requireCommercial(input: OriginationDacCommercialInput): OriginationDacCommercialInput {
    const crop = input.crop.trim();
    if (!crop) {
      throw new OriginationError("validation", "Crop is required.");
    }
    if (!Number.isInteger(input.harvestYear) || input.harvestYear < 2020 || input.harvestYear > 2100) {
      throw new OriginationError("validation", "Harvest year is required.");
    }
    if (input.expectedVolumeTonnes != null && !(input.expectedVolumeTonnes > 0)) {
      throw new OriginationError("validation", "Expected volume must be positive.");
    }
    const issuerOrganizationId = input.issuerOrganizationId?.trim() || null;
    if (issuerOrganizationId && !isPermittedIssuerOrganizationId(issuerOrganizationId)) {
      throw new OriginationError("validation", "Issuer organization is not permitted.");
    }
    return {
      crop,
      harvestYear: input.harvestYear,
      expectedVolumeTonnes: input.expectedVolumeTonnes,
      qualityClass: input.qualityClass?.trim() || null,
      producerReference: input.producerReference?.trim() || null,
      scasNotes: input.scasNotes.trim(),
      issuerOrganizationId,
    };
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
    return resolveByUuidOrPublicId(
      fieldRef,
      (id) => this.store.getFieldById(id),
      (publicId) => this.store.getFieldByPublicId(publicId),
    );
  }

  private async resolveCase(caseRef: string) {
    return resolveByUuidOrPublicId(
      caseRef,
      (id) => this.store.getCaseById(id),
      (publicId) => this.store.getCaseByPublicId(publicId),
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
