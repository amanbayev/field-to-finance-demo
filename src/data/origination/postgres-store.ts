import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { OriginationError } from "@/domain/origination/types";
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
  ProducerDeclaredData,
  ProducerFieldRecord,
  VerifiedFieldSnapshotRecord,
} from "@/domain/origination/types";
import type {
  ApprovalBundle,
  ChangeRequestBundle,
  DocumentCommitBundle,
  RejectionBundle,
  SubmissionBundle,
} from "@/domain/origination/tx";
import type { OriginationBlob, OriginationStore } from "@/domain/origination/store";

type Row = Record<string, unknown>;

function fail(error: { message?: string; code?: string } | null, fallback = "storage"): never {
  const message = error?.message ?? fallback;
  if (
    error?.code === "23505" ||
    error?.code === "P0001" ||
    /already verified|duplicate|expected state|not usable|current version|already in progress|upload window|not allowed source|approval requires|terminal state|not bound|does not belong|case is not in the expected/i.test(
      message,
    )
  ) {
    throw new OriginationError("invalid_state", message);
  }
  if (/not found/i.test(message) && error?.code !== "PGRST116") {
    throw new OriginationError("not_found", message);
  }
  throw new OriginationError("storage", message);
}

function num(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function declaredFrom(row: Row): ProducerDeclaredData {
  const snapshot = (row.declared_snapshot as ProducerDeclaredData | null) ?? null;
  return {
    name: snapshot?.name ?? String(row.name ?? ""),
    season: snapshot?.season ?? Number(row.season ?? 0),
    crop: snapshot?.crop ?? String(row.crop ?? ""),
    cadastreNumber: snapshot?.cadastreNumber ?? String(row.cadastre_number ?? ""),
    declaredAreaHa: snapshot?.declaredAreaHa ?? num(row.declared_area_ha),
    region: snapshot?.region ?? (row.region as string | null) ?? null,
    district: snapshot?.district ?? (row.district as string | null) ?? null,
  };
}

function fieldFrom(row: Row): ProducerFieldRecord {
  return {
    id: String(row.id),
    publicId: String(row.public_id),
    organizationId: String(row.organization_id),
    status: row.status as ProducerFieldRecord["status"],
    declared: declaredFrom(row),
    currentSubmissionId: (row.current_submission_id as string | null) ?? null,
    verifiedSnapshotId: (row.verified_snapshot_id as string | null) ?? null,
    clientCreateRequestId: (row.client_create_request_id as string | null) ?? null,
    createdByUserId: String(row.created_by_user_id),
    createdByRole: String(row.created_by_role),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    archivedAt: (row.archived_at as string | null) ?? null,
  };
}

function fieldToRow(record: ProducerFieldRecord): Row {
  return {
    id: record.id,
    public_id: record.publicId,
    organization_id: record.organizationId,
    status: record.status,
    name: record.declared.name,
    season: record.declared.season,
    crop: record.declared.crop,
    cadastre_number: record.declared.cadastreNumber,
    declared_area_ha: record.declared.declaredAreaHa,
    region: record.declared.region,
    district: record.declared.district,
    declared_snapshot: record.declared,
    current_submission_id: record.currentSubmissionId,
    verified_snapshot_id: record.verifiedSnapshotId,
    client_create_request_id: record.clientCreateRequestId,
    created_by_user_id: record.createdByUserId,
    created_by_role: record.createdByRole,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    archived_at: record.archivedAt,
  };
}

function documentFrom(row: Row): FieldDocumentRecord {
  return {
    id: String(row.id),
    fieldId: String(row.field_id),
    submissionId: (row.submission_id as string | null) ?? null,
    documentType: row.document_type as FieldDocumentRecord["documentType"],
    bucket: String(row.bucket),
    objectPath: String(row.object_path),
    originalFilename: String(row.original_filename),
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes ?? 0),
    sha256: String(row.sha256 ?? ""),
    version: Number(row.version ?? 1),
    status: row.status as FieldDocumentRecord["status"],
    classification: row.classification as FieldDocumentRecord["classification"],
    retentionStatus: row.retention_status as FieldDocumentRecord["retentionStatus"],
    malwareScanStatus: row.malware_scan_status as FieldDocumentRecord["malwareScanStatus"],
    uploadedByUserId: String(row.uploaded_by_user_id),
    uploadedAt: String(row.uploaded_at),
    replacesDocumentId: (row.replaces_document_id as string | null) ?? null,
    current: Boolean(row.is_current),
  };
}

function documentToRow(record: FieldDocumentRecord): Row {
  return {
    id: record.id,
    field_id: record.fieldId,
    submission_id: record.submissionId,
    document_type: record.documentType,
    bucket: record.bucket,
    object_path: record.objectPath,
    original_filename: record.originalFilename,
    mime_type: record.mimeType,
    size_bytes: record.sizeBytes,
    sha256: record.sha256,
    version: record.version,
    status: record.status,
    classification: record.classification,
    retention_status: record.retentionStatus,
    malware_scan_status: record.malwareScanStatus,
    uploaded_by_user_id: record.uploadedByUserId,
    uploaded_at: record.uploadedAt,
    replaces_document_id: record.replacesDocumentId,
    is_current: record.current,
  };
}

export class PostgresOriginationStore implements OriginationStore {
  constructor(private readonly client: SupabaseClient) {}

  private async nextSeq(fn: string) {
    const { data, error } = await this.client.rpc(fn);
    if (error) {
      fail(error);
    }
    return Number(data);
  }

  async nextFieldSequence() {
    return this.nextSeq("origination_next_field_seq");
  }

  async nextCaseSequence() {
    return this.nextSeq("origination_next_case_seq");
  }

  async nextSubmissionSequence() {
    return this.nextSeq("origination_next_submission_seq");
  }

  async nextDacSequence() {
    return this.nextSeq("origination_next_dac_seq");
  }

  async insertField(record: ProducerFieldRecord) {
    const { data, error } = await this.client
      .from("producer_fields")
      .insert(fieldToRow(record))
      .select()
      .single();
    if (error) {
      fail(error);
    }
    return fieldFrom(data as Row);
  }

  async createFieldIdempotent(record: ProducerFieldRecord, event: OriginationAuditEvent) {
    const { data, error } = await this.client.rpc("origination_create_field", {
      payload: {
        field: fieldToRow(record),
        event: eventToRow(event),
      },
    });
    if (error) {
      fail(error);
    }
    const row = (data as { field?: Row } | null)?.field;
    if (!row) {
      fail({ message: "origination create returned no field" });
    }
    return fieldFrom(row);
  }

  async updateField(record: ProducerFieldRecord) {
    const { data, error } = await this.client
      .from("producer_fields")
      .update(fieldToRow(record))
      .eq("id", record.id)
      .select()
      .single();
    if (error) {
      fail(error);
    }
    return fieldFrom(data as Row);
  }

  async getFieldById(id: string) {
    const { data, error } = await this.client.from("producer_fields").select("*").eq("id", id).maybeSingle();
    if (error) {
      fail(error);
    }
    return data ? fieldFrom(data as Row) : null;
  }

  async getFieldByPublicId(publicId: string) {
    const { data, error } = await this.client
      .from("producer_fields")
      .select("*")
      .eq("public_id", publicId)
      .maybeSingle();
    if (error) {
      fail(error);
    }
    return data ? fieldFrom(data as Row) : null;
  }

  async listFieldsByOrganization(organizationId: string) {
    const { data, error } = await this.client
      .from("producer_fields")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error) {
      fail(error);
    }
    return ((data ?? []) as Row[]).map(fieldFrom);
  }

  async listAllFields() {
    const { data, error } = await this.client
      .from("producer_fields")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      fail(error);
    }
    return ((data ?? []) as Row[]).map(fieldFrom);
  }

  async insertDocument(record: FieldDocumentRecord) {
    const { data, error } = await this.client
      .from("field_documents")
      .insert(documentToRow(record))
      .select()
      .single();
    if (error) {
      fail(error);
    }
    return documentFrom(data as Row);
  }

  async updateDocument(record: FieldDocumentRecord) {
    const { data, error } = await this.client
      .from("field_documents")
      .update(documentToRow(record))
      .eq("id", record.id)
      .select()
      .single();
    if (error) {
      fail(error);
    }
    return documentFrom(data as Row);
  }

  async getDocument(id: string) {
    const { data, error } = await this.client.from("field_documents").select("*").eq("id", id).maybeSingle();
    if (error) {
      fail(error);
    }
    return data ? documentFrom(data as Row) : null;
  }

  async listDocuments(fieldId: string) {
    const { data, error } = await this.client
      .from("field_documents")
      .select("*")
      .eq("field_id", fieldId)
      .order("uploaded_at", { ascending: true });
    if (error) {
      fail(error);
    }
    return ((data ?? []) as Row[]).map(documentFrom);
  }

  async deleteDocument(id: string) {
    const { error } = await this.client.from("field_documents").delete().eq("id", id);
    if (error) {
      fail(error);
    }
  }

  async insertSubmission(record: FieldSubmissionRecord) {
    const { data, error } = await this.client
      .from("field_submissions")
      .insert({
        id: record.id,
        public_id: record.publicId,
        field_id: record.fieldId,
        organization_id: record.organizationId,
        version: record.version,
        declared_data: record.declared,
        document_ids: record.documentIds,
        submitted_by_user_id: record.submittedByUserId,
        submitted_by_role: record.submittedByRole,
        submitted_by_persona_id: record.submittedByPersonaId,
        submitted_at: record.submittedAt,
      })
      .select()
      .single();
    if (error) {
      fail(error);
    }
    return submissionFrom(data as Row);
  }

  async getSubmission(id: string) {
    const { data, error } = await this.client.from("field_submissions").select("*").eq("id", id).maybeSingle();
    if (error) {
      fail(error);
    }
    return data ? submissionFrom(data as Row) : null;
  }

  async listSubmissions(fieldId: string) {
    const { data, error } = await this.client
      .from("field_submissions")
      .select("*")
      .eq("field_id", fieldId)
      .order("version", { ascending: true });
    if (error) {
      fail(error);
    }
    return ((data ?? []) as Row[]).map(submissionFrom);
  }

  async insertCase(record: FieldVerificationCaseRecord) {
    const { data, error } = await this.client
      .from("field_verification_cases")
      .insert(caseToRow(record))
      .select()
      .single();
    if (error) {
      fail(error);
    }
    return caseFrom(data as Row);
  }

  async updateCase(record: FieldVerificationCaseRecord) {
    const { data, error } = await this.client
      .from("field_verification_cases")
      .update(caseToRow(record))
      .eq("id", record.id)
      .select()
      .single();
    if (error) {
      fail(error);
    }
    return caseFrom(data as Row);
  }

  async getCaseById(id: string) {
    const { data, error } = await this.client
      .from("field_verification_cases")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      fail(error);
    }
    return data ? caseFrom(data as Row) : null;
  }

  async getCaseByPublicId(publicId: string) {
    const { data, error } = await this.client
      .from("field_verification_cases")
      .select("*")
      .eq("public_id", publicId)
      .maybeSingle();
    if (error) {
      fail(error);
    }
    return data ? caseFrom(data as Row) : null;
  }

  async getCaseByFieldId(fieldId: string) {
    const { data, error } = await this.client
      .from("field_verification_cases")
      .select("*")
      .eq("field_id", fieldId)
      .maybeSingle();
    if (error) {
      fail(error);
    }
    return data ? caseFrom(data as Row) : null;
  }

  async listCases() {
    const { data, error } = await this.client
      .from("field_verification_cases")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      fail(error);
    }
    return ((data ?? []) as Row[]).map(caseFrom);
  }

  async upsertCadastre(record: FieldCadastreVerificationRecord) {
    const { data, error } = await this.client
      .from("field_cadastre_verifications")
      .upsert(cadastreToRow(record))
      .select()
      .single();
    if (error) {
      fail(error);
    }
    return cadastreFrom(data as Row);
  }

  async getCadastreByCase(caseId: string) {
    const { data, error } = await this.client
      .from("field_cadastre_verifications")
      .select("*")
      .eq("case_id", caseId)
      .maybeSingle();
    if (error) {
      fail(error);
    }
    return data ? cadastreFrom(data as Row) : null;
  }

  async insertEvidence(record: FieldVerificationEvidenceRecord) {
    const { data, error } = await this.client
      .from("field_verification_evidence")
      .insert(evidenceToRow(record))
      .select()
      .single();
    if (error) {
      fail(error);
    }
    return evidenceFrom(data as Row);
  }

  async listEvidence(caseId: string) {
    const { data, error } = await this.client
      .from("field_verification_evidence")
      .select("*")
      .eq("case_id", caseId)
      .order("uploaded_at", { ascending: true });
    if (error) {
      fail(error);
    }
    return ((data ?? []) as Row[]).map(evidenceFrom);
  }

  async insertMessage(record: FieldVerificationMessageRecord) {
    const { data, error } = await this.client
      .from("field_verification_messages")
      .insert({
        id: record.id,
        case_id: record.caseId,
        field_id: record.fieldId,
        sender_user_id: record.senderUserId,
        sender_role: record.senderRole,
        sender_persona_id: record.senderPersonaId,
        body: record.body,
        message_type: record.messageType,
        linked_document_id: record.linkedDocumentId,
        created_at: record.createdAt,
      })
      .select()
      .single();
    if (error) {
      fail(error);
    }
    return messageFrom(data as Row);
  }

  async listMessages(caseId: string) {
    const { data, error } = await this.client
      .from("field_verification_messages")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true });
    if (error) {
      fail(error);
    }
    return ((data ?? []) as Row[]).map(messageFrom);
  }

  async insertSnapshot(record: VerifiedFieldSnapshotRecord) {
    const { data, error } = await this.client
      .from("verified_field_snapshots")
      .insert({
        id: record.id,
        field_id: record.fieldId,
        case_id: record.caseId,
        submission_id: record.submissionId,
        payload: record.payload,
        approved_by_user_id: record.approvedByUserId,
        approved_by_role: record.approvedByRole,
        approved_by_persona_id: record.approvedByPersonaId,
        approved_at: record.approvedAt,
      })
      .select()
      .single();
    if (error) {
      fail(error);
    }
    return snapshotFrom(data as Row);
  }

  async getSnapshotByField(fieldId: string) {
    const { data, error } = await this.client
      .from("verified_field_snapshots")
      .select("*")
      .eq("field_id", fieldId)
      .maybeSingle();
    if (error) {
      fail(error);
    }
    return data ? snapshotFrom(data as Row) : null;
  }

  async insertEvent(record: OriginationAuditEvent) {
    const { data, error } = await this.client
      .from("field_origination_events")
      .insert({
        id: record.id,
        occurred_at: record.occurredAt,
        actor_user_id: record.actorUserId,
        effective_role: record.effectiveRole,
        persona_id: record.personaId,
        organization_id: record.organizationId,
        event_type: record.eventType,
        object_type: record.objectType,
        object_id: record.objectId,
        result: record.result,
        metadata: record.metadata,
      })
      .select()
      .single();
    if (error) {
      fail(error);
    }
    return eventFrom(data as Row);
  }

  async listEvents(objectType: string, objectId: string) {
    const { data, error } = await this.client
      .from("field_origination_events")
      .select("*")
      .eq("object_type", objectType)
      .eq("object_id", objectId)
      .order("occurred_at", { ascending: true });
    if (error) {
      fail(error);
    }
    return ((data ?? []) as Row[]).map(eventFrom);
  }

  async listEventsByField(fieldId: string) {
    const { data, error } = await this.client
      .from("field_origination_events")
      .select("*")
      .or(`object_id.eq.${fieldId},metadata->>fieldId.eq.${fieldId}`)
      .order("occurred_at", { ascending: true });
    if (error) {
      fail(error);
    }
    return ((data ?? []) as Row[]).map(eventFrom);
  }

  async putBlob(blob: OriginationBlob) {
    const { error } = await this.client.storage.from(blob.bucket).upload(blob.objectPath, blob.bytes, {
      contentType: blob.contentType,
      upsert: true,
    });
    if (error) {
      fail(error);
    }
  }

  async getBlob(bucket: string, objectPath: string) {
    const { data, error } = await this.client.storage.from(bucket).download(objectPath);
    if (error || !data) {
      return null;
    }
    return {
      bucket,
      objectPath,
      bytes: new Uint8Array(await data.arrayBuffer()),
      contentType: data.type || "application/octet-stream",
    };
  }

  async removeBlob(bucket: string, objectPath: string) {
    await this.client.storage.from(bucket).remove([objectPath]);
  }

  async hasPublicObjectUrl(bucket: string, _objectPath?: string) {
    void _objectPath;
    const { data } = await this.client.storage.getBucket(bucket);
    return Boolean(data?.public);
  }

  async prepareUploadIntent(record: FieldUploadIntentRecord) {
    const { data, error } = await this.client.rpc("origination_prepare_upload_intent", {
      payload: { intent: intentToRow(record) },
    });
    if (error) {
      fail(error);
    }
    const row = (data as { intent?: Row } | null)?.intent;
    if (!row) {
      fail({ message: "prepare upload intent returned no row" });
    }
    return intentFrom(row);
  }

  async getUploadIntent(id: string) {
    const { data, error } = await this.client
      .from("field_upload_intents")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      fail(error);
    }
    return data ? intentFrom(data as Row) : null;
  }

  async commitDocumentBundle(input: DocumentCommitBundle) {
    const { data, error } = await this.client.rpc("origination_commit_document", {
      payload: {
        intent_id: input.intentId,
        document: documentToRow(input.document),
        superseded_id: input.supersededId,
        message: input.message ? messageToRow(input.message) : null,
        event: eventToRow(input.event),
      },
    });
    if (error) {
      fail(error);
    }
    const row = (data as { document?: Row } | null)?.document;
    if (!row) {
      fail({ message: "commit document returned no row" });
    }
    return documentFrom(row);
  }

  async applySubmissionBundle(input: SubmissionBundle) {
    const { error } = await this.client.rpc("origination_apply_submission", {
      payload: {
        expected_field_status: input.expectedFieldStatus,
        case_is_new: input.caseIsNew,
        field: fieldToRow(input.field),
        submission: submissionToRow(input.submission),
        verification_case: caseToRow(input.verificationCase),
        event: eventToRow(input.event),
      },
    });
    if (error) {
      fail(error);
    }
    return {
      field: input.field,
      submission: input.submission,
      verificationCase: input.verificationCase,
    };
  }

  async applyChangeRequestBundle(input: ChangeRequestBundle) {
    const { error } = await this.client.rpc("origination_apply_change_request", {
      payload: {
        field: fieldToRow(input.field),
        verification_case: caseToRow(input.verificationCase),
        document: input.document ? documentToRow(input.document) : null,
        message: messageToRow(input.message),
        events: input.events.map(eventToRow),
      },
    });
    if (error) {
      fail(error);
    }
  }

  async applyApprovalBundle(input: ApprovalBundle) {
    const { error } = await this.client.rpc("origination_apply_approval", {
      payload: {
        field: fieldToRow(input.field),
        verification_case: caseToRow(input.verificationCase),
        snapshot: snapshotToRow(input.snapshot),
        message: messageToRow(input.message),
        event: eventToRow(input.event),
      },
    });
    if (error) {
      fail(error);
    }
    return input.snapshot;
  }

  async applyRejectionBundle(input: RejectionBundle) {
    const { error } = await this.client.rpc("origination_apply_rejection", {
      payload: {
        field: fieldToRow(input.field),
        verification_case: caseToRow(input.verificationCase),
        message: messageToRow(input.message),
        event: eventToRow(input.event),
      },
    });
    if (error) {
      fail(error);
    }
  }

  async createDac(record: OriginationDacRecord, event: OriginationAuditEvent) {
    const { data, error } = await this.client.rpc("origination_create_dac", {
      payload: {
        dac: dacToRow(record),
        event: eventToRow(event),
      },
    });
    if (error) {
      fail(error);
    }
    const row = (data as { dac?: Row } | null)?.dac;
    if (!row) {
      fail({ message: "origination DAC create returned no record" });
    }
    return dacFrom(row);
  }

  async updateDac(record: OriginationDacRecord) {
    const { data, error } = await this.client
      .from("origination_dacs")
      .update(dacToRow(record))
      .eq("id", record.id)
      .select()
      .single();
    if (error) {
      fail(error);
    }
    return dacFrom(data as Row);
  }

  async getDacById(id: string) {
    const { data, error } = await this.client.from("origination_dacs").select("*").eq("id", id).maybeSingle();
    if (error) {
      fail(error);
    }
    return data ? dacFrom(data as Row) : null;
  }

  async getDacByPublicId(publicId: string) {
    const { data, error } = await this.client
      .from("origination_dacs")
      .select("*")
      .eq("public_id", publicId)
      .maybeSingle();
    if (error) {
      fail(error);
    }
    return data ? dacFrom(data as Row) : null;
  }

  async getActiveDacBySnapshot(snapshotId: string) {
    const { data, error } = await this.client
      .from("origination_dacs")
      .select("*")
      .eq("verified_snapshot_id", snapshotId)
      .neq("status", "ARCHIVED")
      .maybeSingle();
    if (error) {
      fail(error);
    }
    return data ? dacFrom(data as Row) : null;
  }

  async getActiveDacByField(fieldId: string) {
    const { data, error } = await this.client
      .from("origination_dacs")
      .select("*")
      .eq("field_id", fieldId)
      .neq("status", "ARCHIVED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      fail(error);
    }
    return data ? dacFrom(data as Row) : null;
  }

  async listDacs() {
    const { data, error } = await this.client
      .from("origination_dacs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      fail(error);
    }
    return ((data ?? []) as Row[]).map(dacFrom);
  }

  async insertDacMessage(record: OriginationDacMessageRecord) {
    const { data, error } = await this.client
      .from("origination_dac_messages")
      .insert({
        id: record.id,
        dac_id: record.dacId,
        sender_user_id: record.senderUserId,
        sender_role: record.senderRole,
        sender_persona_id: record.senderPersonaId,
        body: record.body,
        message_type: record.messageType,
        created_at: record.createdAt,
      })
      .select()
      .single();
    if (error) {
      fail(error);
    }
    return dacMessageFrom(data as Row);
  }

  async listDacMessages(dacId: string) {
    const { data, error } = await this.client
      .from("origination_dac_messages")
      .select("*")
      .eq("dac_id", dacId)
      .order("created_at", { ascending: true });
    if (error) {
      fail(error);
    }
    return ((data ?? []) as Row[]).map(dacMessageFrom);
  }

  async insertDacEvent(record: OriginationAuditEvent) {
    const { data, error } = await this.client
      .from("origination_dac_events")
      .insert(eventToRow(record))
      .select()
      .single();
    if (error) {
      fail(error);
    }
    await this.insertEvent({
      ...record,
      id: randomUUID(),
      metadata: { ...record.metadata },
    });
    return eventFrom(data as Row);
  }

  async listDacEvents(dacId: string) {
    const { data, error } = await this.client
      .from("origination_dac_events")
      .select("*")
      .eq("object_id", dacId)
      .order("occurred_at", { ascending: true });
    if (error) {
      fail(error);
    }
    return ((data ?? []) as Row[]).map(eventFrom);
  }
}

function submissionFrom(row: Row): FieldSubmissionRecord {
  return {
    id: String(row.id),
    publicId: String(row.public_id),
    fieldId: String(row.field_id),
    organizationId: String(row.organization_id),
    version: Number(row.version ?? 1),
    declared: row.declared_data as ProducerDeclaredData,
    documentIds: (row.document_ids as string[]) ?? [],
    submittedByUserId: String(row.submitted_by_user_id),
    submittedByRole: String(row.submitted_by_role),
    submittedByPersonaId: (row.submitted_by_persona_id as string | null) ?? null,
    submittedAt: String(row.submitted_at),
  };
}

function caseToRow(record: FieldVerificationCaseRecord): Row {
  return {
    id: record.id,
    public_id: record.publicId,
    field_id: record.fieldId,
    organization_id: record.organizationId,
    current_submission_id: record.currentSubmissionId,
    status: record.status,
    assigned_reviewer_user_id: record.assignedReviewerUserId,
    assigned_reviewer_persona_id: record.assignedReviewerPersonaId,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function caseFrom(row: Row): FieldVerificationCaseRecord {
  return {
    id: String(row.id),
    publicId: String(row.public_id),
    fieldId: String(row.field_id),
    organizationId: String(row.organization_id),
    currentSubmissionId: String(row.current_submission_id),
    status: row.status as FieldVerificationCaseRecord["status"],
    assignedReviewerUserId: (row.assigned_reviewer_user_id as string | null) ?? null,
    assignedReviewerPersonaId: (row.assigned_reviewer_persona_id as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function cadastreToRow(record: FieldCadastreVerificationRecord): Row {
  return {
    id: record.id,
    case_id: record.caseId,
    field_id: record.fieldId,
    provider_id: record.providerId,
    cadastre_number: record.cadastreNumber,
    right_holder: record.rightHolder,
    right_type: record.rightType,
    registered_area_ha: record.registeredAreaHa,
    region: record.region,
    district: record.district,
    validity_status: record.validityStatus,
    source_reference: record.sourceReference,
    notes: record.notes,
    checked_by_user_id: record.checkedByUserId,
    checked_by_role: record.checkedByRole,
    checked_by_persona_id: record.checkedByPersonaId,
    checked_at: record.checkedAt,
  };
}

function cadastreFrom(row: Row): FieldCadastreVerificationRecord {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    fieldId: String(row.field_id),
    providerId: String(row.provider_id),
    cadastreNumber: String(row.cadastre_number),
    rightHolder: String(row.right_holder),
    rightType: String(row.right_type),
    registeredAreaHa: num(row.registered_area_ha),
    region: (row.region as string | null) ?? null,
    district: (row.district as string | null) ?? null,
    validityStatus: String(row.validity_status),
    sourceReference: String(row.source_reference ?? ""),
    notes: String(row.notes ?? ""),
    checkedByUserId: String(row.checked_by_user_id),
    checkedByRole: String(row.checked_by_role),
    checkedByPersonaId: (row.checked_by_persona_id as string | null) ?? null,
    checkedAt: String(row.checked_at),
  };
}

function evidenceToRow(record: FieldVerificationEvidenceRecord): Row {
  return {
    id: record.id,
    case_id: record.caseId,
    field_id: record.fieldId,
    kind: record.kind,
    notes: record.notes,
    imagery_date: record.imageryDate,
    bucket: record.bucket,
    object_path: record.objectPath,
    original_filename: record.originalFilename,
    mime_type: record.mimeType,
    size_bytes: record.sizeBytes,
    sha256: record.sha256,
    uploaded_by_user_id: record.uploadedByUserId,
    uploaded_at: record.uploadedAt,
  };
}

function evidenceFrom(row: Row): FieldVerificationEvidenceRecord {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    fieldId: String(row.field_id),
    kind: row.kind as FieldVerificationEvidenceRecord["kind"],
    notes: String(row.notes ?? ""),
    imageryDate: (row.imagery_date as string | null) ?? null,
    bucket: (row.bucket as string | null) ?? null,
    objectPath: (row.object_path as string | null) ?? null,
    originalFilename: (row.original_filename as string | null) ?? null,
    mimeType: (row.mime_type as string | null) ?? null,
    sizeBytes: num(row.size_bytes),
    sha256: (row.sha256 as string | null) ?? null,
    uploadedByUserId: String(row.uploaded_by_user_id),
    uploadedAt: String(row.uploaded_at),
  };
}

function messageFrom(row: Row): FieldVerificationMessageRecord {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    fieldId: String(row.field_id),
    senderUserId: String(row.sender_user_id),
    senderRole: String(row.sender_role),
    senderPersonaId: (row.sender_persona_id as string | null) ?? null,
    body: String(row.body),
    messageType: row.message_type as FieldVerificationMessageRecord["messageType"],
    linkedDocumentId: (row.linked_document_id as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function snapshotFrom(row: Row): VerifiedFieldSnapshotRecord {
  return {
    id: String(row.id),
    fieldId: String(row.field_id),
    caseId: String(row.case_id),
    submissionId: String(row.submission_id),
    payload: row.payload as VerifiedFieldSnapshotRecord["payload"],
    approvedByUserId: String(row.approved_by_user_id),
    approvedByRole: String(row.approved_by_role),
    approvedByPersonaId: (row.approved_by_persona_id as string | null) ?? null,
    approvedAt: String(row.approved_at),
  };
}

function eventFrom(row: Row): OriginationAuditEvent {
  return {
    id: String(row.id),
    occurredAt: String(row.occurred_at),
    actorUserId: String(row.actor_user_id),
    effectiveRole: String(row.effective_role),
    personaId: (row.persona_id as string | null) ?? null,
    organizationId: (row.organization_id as string | null) ?? null,
    eventType: row.event_type as OriginationAuditEvent["eventType"],
    objectType: String(row.object_type),
    objectId: String(row.object_id),
    result: String(row.result ?? "ok"),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

function intentToRow(record: FieldUploadIntentRecord): Row {
  return {
    id: record.id,
    organization_id: record.organizationId,
    field_id: record.fieldId,
    document_id: record.documentId,
    document_type: record.documentType,
    object_path: record.objectPath,
    original_filename: record.originalFilename,
    mime_type: record.mimeType,
    expected_size_bytes: record.expectedSizeBytes,
    version: record.version,
    replaces_document_id: record.replacesDocumentId,
    created_by_user_id: record.createdByUserId,
    created_at: record.createdAt,
    expires_at: record.expiresAt,
    status: record.status,
  };
}

function intentFrom(row: Row): FieldUploadIntentRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    fieldId: String(row.field_id),
    documentId: String(row.document_id),
    documentType: row.document_type as FieldUploadIntentRecord["documentType"],
    objectPath: String(row.object_path),
    originalFilename: String(row.original_filename),
    mimeType: String(row.mime_type),
    expectedSizeBytes: Number(row.expected_size_bytes ?? 0),
    version: Number(row.version ?? 1),
    replacesDocumentId: (row.replaces_document_id as string | null) ?? null,
    createdByUserId: String(row.created_by_user_id),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    status: row.status as FieldUploadIntentRecord["status"],
  };
}

function submissionToRow(record: FieldSubmissionRecord): Row {
  return {
    id: record.id,
    public_id: record.publicId,
    field_id: record.fieldId,
    organization_id: record.organizationId,
    version: record.version,
    declared_data: record.declared,
    document_ids: record.documentIds,
    submitted_by_user_id: record.submittedByUserId,
    submitted_by_role: record.submittedByRole,
    submitted_by_persona_id: record.submittedByPersonaId,
    submitted_at: record.submittedAt,
  };
}

function eventToRow(record: OriginationAuditEvent): Row {
  return {
    id: record.id,
    occurred_at: record.occurredAt,
    actor_user_id: record.actorUserId,
    effective_role: record.effectiveRole,
    persona_id: record.personaId,
    organization_id: record.organizationId,
    event_type: record.eventType,
    object_type: record.objectType,
    object_id: record.objectId,
    result: record.result,
    metadata: record.metadata,
  };
}

function messageToRow(record: FieldVerificationMessageRecord): Row {
  return {
    id: record.id,
    case_id: record.caseId,
    field_id: record.fieldId,
    sender_user_id: record.senderUserId,
    sender_role: record.senderRole,
    sender_persona_id: record.senderPersonaId,
    body: record.body,
    message_type: record.messageType,
    linked_document_id: record.linkedDocumentId,
    created_at: record.createdAt,
  };
}

function snapshotToRow(record: VerifiedFieldSnapshotRecord): Row {
  return {
    id: record.id,
    field_id: record.fieldId,
    case_id: record.caseId,
    submission_id: record.submissionId,
    payload: record.payload,
    approved_by_user_id: record.approvedByUserId,
    approved_by_role: record.approvedByRole,
    approved_by_persona_id: record.approvedByPersonaId,
    approved_at: record.approvedAt,
  };
}

function dacToRow(record: OriginationDacRecord): Row {
  return {
    id: record.id,
    public_id: record.publicId,
    field_id: record.fieldId,
    verified_snapshot_id: record.verifiedSnapshotId,
    scas_case_id: record.scasCaseId,
    producer_organization_id: record.producerOrganizationId,
    status: record.status,
    crop: record.crop,
    harvest_year: record.harvestYear,
    expected_volume_tonnes: record.expectedVolumeTonnes,
    quality_class: record.qualityClass,
    producer_reference: record.producerReference,
    cadastre_number: record.cadastreNumber,
    declared_area_hectares: record.declaredAreaHectares,
    verified_area_hectares: record.verifiedAreaHectares,
    region: record.region,
    district: record.district,
    right_holder: record.rightHolder,
    right_type: record.rightType,
    scas_notes: record.scasNotes,
    registrar_notes: record.registrarNotes,
    created_by_user_id: record.createdByUserId,
    updated_by_user_id: record.updatedByUserId,
    registrar_reviewed_by_user_id: record.registrarReviewedByUserId,
    submitted_to_registrar_at: record.submittedToRegistrarAt,
    accepted_at: record.acceptedAt,
    returned_at: record.returnedAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function dacFrom(row: Row): OriginationDacRecord {
  return {
    id: String(row.id),
    publicId: String(row.public_id),
    fieldId: String(row.field_id),
    verifiedSnapshotId: String(row.verified_snapshot_id),
    scasCaseId: String(row.scas_case_id),
    producerOrganizationId: String(row.producer_organization_id),
    status: row.status as OriginationDacRecord["status"],
    crop: String(row.crop ?? ""),
    harvestYear: Number(row.harvest_year ?? 0),
    expectedVolumeTonnes: num(row.expected_volume_tonnes),
    qualityClass: (row.quality_class as string | null) ?? null,
    producerReference: (row.producer_reference as string | null) ?? null,
    cadastreNumber: String(row.cadastre_number ?? ""),
    declaredAreaHectares: num(row.declared_area_hectares),
    verifiedAreaHectares: num(row.verified_area_hectares),
    region: (row.region as string | null) ?? null,
    district: (row.district as string | null) ?? null,
    rightHolder: String(row.right_holder ?? ""),
    rightType: String(row.right_type ?? ""),
    scasNotes: String(row.scas_notes ?? ""),
    registrarNotes: String(row.registrar_notes ?? ""),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: String(row.updated_by_user_id),
    registrarReviewedByUserId: (row.registrar_reviewed_by_user_id as string | null) ?? null,
    submittedToRegistrarAt: (row.submitted_to_registrar_at as string | null) ?? null,
    acceptedAt: (row.accepted_at as string | null) ?? null,
    returnedAt: (row.returned_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function dacMessageFrom(row: Row): OriginationDacMessageRecord {
  return {
    id: String(row.id),
    dacId: String(row.dac_id),
    senderUserId: String(row.sender_user_id),
    senderRole: String(row.sender_role),
    senderPersonaId: (row.sender_persona_id as string | null) ?? null,
    body: String(row.body),
    messageType: row.message_type as OriginationDacMessageRecord["messageType"],
    createdAt: String(row.created_at),
  };
}
