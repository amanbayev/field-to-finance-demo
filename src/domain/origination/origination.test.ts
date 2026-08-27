import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildPrincipal,
  resolveActorContext,
  type ActorContext,
  type MembershipRecord,
  type OrganizationRecord,
} from "@/domain/identity";
import {
  DEMO_ORGANIZATIONS,
  demoPersonaById,
} from "@/data/identity/demo-catalog";
import {
  NationalLandCadastreProvider,
  OriginationError,
  OriginationService,
  UPLOAD_INTENT_TTL_MS,
  defaultCadastreProvider,
  isUuid,
  type ProducerDeclaredData,
} from "@/domain/origination";
import { MemoryOriginationStore } from "@/domain/origination/memory-store";

const farm1 = DEMO_ORGANIZATIONS.find((item) => item.slug === "akmola-agro")!;
const farm2 = DEMO_ORGANIZATIONS.find((item) => item.slug === "steppe-grain")!;
const scasOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "scas")!;
const issuerOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "agro-issuer")!;
const platform = DEMO_ORGANIZATIONS.find((item) => item.slug === "field-to-finance")!;

function membership(
  overrides: Partial<MembershipRecord> & Pick<MembershipRecord, "organizationId" | "roleIds">,
): MembershipRecord {
  return {
    id: overrides.id ?? `mem-${overrides.organizationId}`,
    userId: overrides.userId ?? "user-1",
    status: overrides.status ?? "ACTIVE",
    organizationId: overrides.organizationId,
    roleIds: overrides.roleIds,
  };
}

function actorFor(
  org: OrganizationRecord,
  roleIds: MembershipRecord["roleIds"],
  userId: string,
  personaId?: string,
): ActorContext {
  const principal = buildPrincipal({
    userId,
    email: `${userId}@example.com`,
    displayName: org.name,
    status: "ACTIVE",
    organizations: [org],
    memberships: [membership({ userId, organizationId: org.id, roleIds })],
  });
  if (!personaId) {
    return resolveActorContext({
      principal,
      session: { principalUserId: userId, activeOrganizationId: org.id },
      persona: undefined,
      personaOrganization: undefined,
    });
  }
  const admin = buildPrincipal({
    userId,
    email: `${userId}@example.com`,
    displayName: "Admin",
    status: "ACTIVE",
    organizations: [platform, org],
    memberships: [
      membership({
        userId,
        organizationId: platform.id,
        roleIds: ["SYSTEM_ADMIN"],
      }),
    ],
    activeOrganizationId: platform.id,
  });
  const persona = demoPersonaById(personaId)!;
  return resolveActorContext({
    principal: admin,
    session: {
      principalUserId: userId,
      activeOrganizationId: platform.id,
      effectiveDemoPersonaId: personaId,
    },
    persona,
    personaOrganization: org,
  });
}

function producer(userId = "prod-1") {
  return actorFor(farm1, ["PRODUCER_ADMIN"], userId);
}

function producerTwo(userId = "prod-2") {
  return actorFor(farm2, ["PRODUCER_ADMIN"], userId);
}

function scas(userId = "scas-1") {
  return actorFor(scasOrg, ["SCAS_OPERATOR"], userId, "DEMO-SCAS-001");
}

function issuer() {
  return actorFor(issuerOrg, ["ISSUER_OPERATOR"], "issuer-1");
}

function adminOnly() {
  return actorFor(platform, ["SYSTEM_ADMIN"], "admin-1");
}

const sample: ProducerDeclaredData = {
  name: "North plot 12",
  season: 2027,
  crop: "Wheat",
  cadastreNumber: "03:041:0123456:12",
  declaredAreaHa: 1240,
  region: "Akmola",
  district: "Astrakhan",
};

function pdf(name = "cadastre.pdf") {
  return {
    filename: name,
    mimeType: "application/pdf",
    bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
  };
}

async function draft(service: OriginationService, actor = producer()) {
  return service.createDraft(actor, sample);
}

function expectNoUuidLookupForPublicId(
  spy: { mock: { calls: unknown[][] } },
  publicId: string,
) {
  expect(spy.mock.calls.flat()).not.toContain(publicId);
  expect(publicId).not.toMatch(/^[0-9a-f-]{36}$/i);
  expect(isUuid(publicId)).toBe(false);
}

describe("origination O1", () => {
  it("lets a producer create and edit their own draft", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const actor = producer();
    const field = await draft(service, actor);
    expect(field.publicId).toMatch(/^FIELD-2027-\d{4}$/);
    expect(field.status).toBe("DRAFT");
    const byPublicId = await service.getFieldBundle(actor, field.publicId);
    expect(byPublicId.field.id).toBe(field.id);
    const updated = await service.updateDraft(actor, field.id, {
      ...sample,
      name: "North plot 12A",
    });
    expect(updated.declared.name).toBe("North plot 12A");
  });

  it("does not let a producer see another organisation's field", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const field = await draft(service, producer());
    await expect(service.getFieldBundle(producerTwo(), field.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(service.updateDraft(producerTwo(), field.id, sample)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("submits an immutable snapshot without a Solana write", async () => {
    const store = new MemoryOriginationStore();
    const service = new OriginationService(store);
    const actor = producer();
    const field = await draft(service, actor);
    await service.uploadDocument(actor, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      ...pdf(),
    });
    const submitted = await service.submitToScas(actor, field.id);
    expect(submitted.field.status).toBe("SUBMITTED");
    const originalName = submitted.submission.declared.name;
    submitted.submission.declared.name = "mutated";
    const stored = await store.getSubmission(submitted.submission.id);
    expect(stored?.declared.name).toBe(originalName);
    await expect(service.updateDraft(actor, field.id, sample)).rejects.toBeInstanceOf(OriginationError);
  });

  it("keeps the old document version after a requested replacement", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const farm = producer();
    const reviewer = scas();
    const field = await draft(service, farm);
    const v1 = await service.uploadDocument(farm, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      ...pdf("extract-v1.pdf"),
    });
    const submitted = await service.submitToScas(farm, field.id);
    await service.requestDocumentReplacement(reviewer, v1.id, "The cadastral extract is outdated.");
    const afterRequest = await service.getFieldBundle(farm, field.id);
    expect(afterRequest.field.status).toBe("CHANGES_REQUESTED");
    expect(afterRequest.verificationCase?.status).toBe("CHANGES_REQUESTED");
    const v2 = await service.uploadDocument(farm, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      replacesDocumentId: v1.id,
      ...pdf("extract-v2.pdf"),
    });
    const bundle = await service.getFieldBundle(farm, field.id);
    const first = bundle.documents.find((item) => item.id === v1.id);
    const second = bundle.documents.find((item) => item.id === v2.id);
    expect(first?.status).toBe("SUPERSEDED");
    expect(first?.current).toBe(false);
    expect(second?.version).toBe(2);
    expect(second?.current).toBe(true);
    expect(submitted.submission.documentIds).toContain(v1.id);
    expect(submitted.submission.documentIds).not.toContain(v2.id);
  });

  it("lets SCAS review, request changes, accept evidence and approve a valid case", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const farm = producer();
    const reviewer = scas();
    const field = await draft(service, farm);
    const doc = await service.uploadDocument(farm, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      ...pdf(),
    });
    await service.submitToScas(farm, field.id);
    const queue = await service.listVerificationQueue(reviewer, "new");
    expect(queue).toHaveLength(1);
    await service.requestChanges(reviewer, queue[0]!.id, "Please confirm the registered area.");
    await service.uploadDocument(farm, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      replacesDocumentId: doc.id,
      ...pdf("extract-v2.pdf"),
    });
    await service.resubmit(farm, field.id);
    const bundle = await service.getFieldBundle(farm, field.id);
    const current = bundle.documents.find((item) => item.current)!;
    await service.acceptDocument(reviewer, current.id);
    await service.recordCadastreVerification(reviewer, bundle.verificationCase!.id, {
      cadastreNumber: "03:041:0123456:12",
      rightHolder: "Akmola Agro LLP",
      rightType: "lease",
      registeredAreaHa: 1238.6,
      region: "Akmola",
      district: "Astrakhan",
      validityStatus: "active",
      sourceReference: "SCAS desk extract 2026-08-12",
      notes: "Declared 1,240 ha; register 1,238.6 ha.",
    });
    const snapshot = await service.approveField(reviewer, bundle.verificationCase!.id);
    expect(snapshot.payload.reviewerUserId).toBe(reviewer.principal.userId);
    expect(snapshot.payload.reviewerPersonaId).toBe("DEMO-SCAS-001");
    expect(snapshot.payload.producerDeclared.declaredAreaHa).toBe(1240);
    expect(snapshot.payload.cadastreVerification.registeredAreaHa).toBe(1238.6);
    expect(snapshot.payload.submissionId).toBe(bundle.verificationCase!.currentSubmissionId);
    expect(snapshot.payload.submissionVersion).toBe(2);
    expect(snapshot.payload.acceptedDocuments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: current.id,
          documentType: "CADASTRE_EXTRACT",
          version: 2,
          sha256: current.sha256,
        }),
      ]),
    );
    const verified = await service.getFieldBundle(farm, field.id);
    expect(verified.field.status).toBe("VERIFIED");
    expect(verified.events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "field_created",
        "document_uploaded",
        "field_submitted",
        "verification_started",
        "changes_requested",
        "document_replaced",
        "field_resubmitted",
        "document_accepted",
        "cadastre_verified",
        "field_verified",
      ]),
    );
  });

  it("blocks non-SCAS verification decisions and silent admin authority", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const farm = producer();
    const field = await draft(service, farm);
    await service.uploadDocument(farm, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      ...pdf(),
    });
    const submitted = await service.submitToScas(farm, field.id);
    await expect(
      service.approveField(farm, submitted.verificationCase.id),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.approveField(adminOnly(), submitted.verificationCase.id),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.approveField(issuer(), submitted.verificationCase.id),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("refuses to hard-delete a verified field", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const farm = producer();
    const reviewer = scas();
    const field = await draft(service, farm);
    const doc = await service.uploadDocument(farm, {
      fieldId: field.id,
      documentType: "LAND_OWNERSHIP",
      ...pdf("title.pdf"),
    });
    const submitted = await service.submitToScas(farm, field.id);
    await service.acceptDocument(reviewer, doc.id);
    await service.recordCadastreVerification(reviewer, submitted.verificationCase.id, {
      cadastreNumber: sample.cadastreNumber,
      rightHolder: "Akmola Agro LLP",
      rightType: "ownership",
      registeredAreaHa: 1240,
      region: "Akmola",
      district: "Astrakhan",
      validityStatus: "active",
      sourceReference: "manual",
      notes: "",
    });
    await service.approveField(reviewer, submitted.verificationCase.id);
    await expect(service.tryHardDeleteVerified(farm, field.id)).rejects.toMatchObject({
      code: "immutable",
    });
    await expect(service.archiveField(farm, field.id)).rejects.toMatchObject({
      code: "immutable",
    });
  });

  it("keeps private documents off public URLs and checks authorization", async () => {
    const store = new MemoryOriginationStore();
    const service = new OriginationService(store);
    const farm = producer();
    const field = await draft(service, farm);
    const doc = await service.uploadDocument(farm, {
      fieldId: field.id,
      documentType: "LEASE_AGREEMENT",
      ...pdf("lease.pdf"),
    });
    expect(await service.isObjectPublic(doc.bucket, doc.objectPath)).toBe(false);
    const blob = await service.authorizedBlob(farm, doc.bucket, doc.objectPath);
    expect(blob?.bytes.byteLength).toBeGreaterThan(0);
    await expect(
      service.authorizedBlob(producerTwo(), doc.bucket, doc.objectPath),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("does not expose a national cadastre integration and does not import Solana", () => {
    expect(() =>
      new NationalLandCadastreProvider().normalizeManualEntry({
        cadastreNumber: "x",
        rightHolder: "x",
        rightType: "x",
        registeredAreaHa: 1,
        region: null,
        district: null,
        validityStatus: "x",
        sourceReference: "x",
        notes: "",
      }),
    ).toThrow(/not connected/i);
    const source = readFileSync("src/domain/origination/service.ts", "utf8");
    expect(source).not.toMatch(/solana|blockchain|recordedPlacement/i);
  });
});

describe("origination O1.2 hardening", () => {
  it("does not let producer A finalize producer B's private object even when the path is known", async () => {
    const store = new MemoryOriginationStore();
    const service = new OriginationService(store);
    const a = producer();
    const b = producerTwo();
    const fieldB = await service.createDraft(b, { ...sample, name: "South plot 4" });
    const preparedB = await service.prepareDirectUpload(b, {
      fieldId: fieldB.id,
      documentType: "CADASTRE_EXTRACT",
      filename: "b-extract.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
    });
    await store.putBlob({
      bucket: preparedB.bucket,
      objectPath: preparedB.objectPath,
      bytes: pdf().bytes,
      contentType: "application/pdf",
    });
    await expect(
      service.commitDirectUpload(a, { uploadIntentId: preparedB.uploadIntentId }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const stolen = await service.commitDirectUpload(b, { uploadIntentId: preparedB.uploadIntentId });
    await expect(service.authorizedBlob(a, stolen.bucket, stolen.objectPath)).rejects.toMatchObject({
      code: "forbidden",
    });
    const fieldA = await service.createDraft(a, sample);
    const preparedA = await service.prepareDirectUpload(a, {
      fieldId: fieldA.id,
      documentType: "CADASTRE_EXTRACT",
      filename: "a-extract.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
    });
    expect(preparedA.objectPath).not.toBe(preparedB.objectPath);
    await expect(
      service.commitDirectUpload(a, { uploadIntentId: preparedB.uploadIntentId }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("commits an upload intent idempotently and refuses a second prepared lineage", async () => {
    const store = new MemoryOriginationStore();
    const service = new OriginationService(store);
    const actor = producer();
    const field = await draft(service, actor);
    const prepared = await service.prepareDirectUpload(actor, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      filename: "cadastre.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
    });
    await expect(
      service.prepareDirectUpload(actor, {
        fieldId: field.id,
        documentType: "CADASTRE_EXTRACT",
        filename: "cadastre-2.pdf",
        mimeType: "application/pdf",
        sizeBytes: 8,
      }),
    ).rejects.toMatchObject({ code: "invalid_state" });
    await store.putBlob({
      bucket: prepared.bucket,
      objectPath: prepared.objectPath,
      bytes: pdf().bytes,
      contentType: "application/pdf",
    });
    const [first, second] = await Promise.all([
      service.commitDirectUpload(actor, { uploadIntentId: prepared.uploadIntentId }),
      service.commitDirectUpload(actor, { uploadIntentId: prepared.uploadIntentId }),
    ]);
    expect(first.id).toBe(second.id);
    expect(first.version).toBe(1);
    const bundle = await service.getFieldBundle(actor, field.id);
    expect(bundle.documents.filter((item) => item.current)).toHaveLength(1);
  });

  it("freezes producer evidence after submit and after resubmit", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const farm = producer();
    const reviewer = scas();
    const field = await draft(service, farm);
    const v1 = await service.uploadDocument(farm, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      ...pdf(),
    });
    await service.submitToScas(farm, field.id);
    await expect(
      service.uploadDocument(farm, {
        fieldId: field.id,
        documentType: "CADASTRE_EXTRACT",
        replacesDocumentId: v1.id,
        ...pdf("late.pdf"),
      }),
    ).rejects.toMatchObject({ code: "immutable" });
    await service.requestChanges(reviewer, (await service.getFieldBundle(farm, field.id)).verificationCase!.id, "Fix the extract.");
    const v2 = await service.uploadDocument(farm, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      replacesDocumentId: v1.id,
      ...pdf("extract-v2.pdf"),
    });
    await service.resubmit(farm, field.id);
    await expect(
      service.uploadDocument(farm, {
        fieldId: field.id,
        documentType: "CADASTRE_EXTRACT",
        replacesDocumentId: v2.id,
        ...pdf("extract-v3.pdf"),
      }),
    ).rejects.toMatchObject({ code: "immutable" });
  });

  it("refuses double submit, double approval, and approval of evidence outside the current snapshot", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const farm = producer();
    const reviewer = scas();
    const field = await draft(service, farm);
    const v1 = await service.uploadDocument(farm, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      ...pdf(),
    });
    const [submitA, submitB] = await Promise.allSettled([
      service.submitToScas(farm, field.id),
      service.submitToScas(farm, field.id),
    ]);
    const submitted = submitA.status === "fulfilled" ? submitA.value : submitB.status === "fulfilled" ? submitB.value : null;
    expect(submitted).toBeTruthy();
    expect([submitA.status, submitB.status].filter((status) => status === "rejected")).toHaveLength(1);

    await service.requestDocumentReplacement(reviewer, v1.id, "Replace the extract.");
    const v2 = await service.uploadDocument(farm, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      replacesDocumentId: v1.id,
      ...pdf("extract-v2.pdf"),
    });
    await service.acceptDocument(reviewer, v2.id);
    await service.recordCadastreVerification(reviewer, submitted!.verificationCase.id, {
      cadastreNumber: sample.cadastreNumber,
      rightHolder: "Akmola Agro LLP",
      rightType: "lease",
      registeredAreaHa: 1240,
      region: "Akmola",
      district: "Astrakhan",
      validityStatus: "active",
      sourceReference: "manual",
      notes: "",
    });
    await expect(service.approveField(reviewer, submitted!.verificationCase.id)).rejects.toMatchObject({
      code: "invalid_state",
    });

    await service.resubmit(farm, field.id);
    const bundle = await service.getFieldBundle(farm, field.id);
    await service.acceptDocument(reviewer, v2.id);
    const [approveA, approveB] = await Promise.allSettled([
      service.approveField(reviewer, bundle.verificationCase!.id),
      service.approveField(reviewer, bundle.verificationCase!.id),
    ]);
    const approved = [approveA, approveB].filter((item) => item.status === "fulfilled");
    const rejected = [approveA, approveB].filter((item) => item.status === "rejected");
    expect(approved).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (approved[0]?.status === "fulfilled") {
      expect(approved[0].value.payload.submissionId).toBe(bundle.verificationCase!.currentSubmissionId);
      expect(approved[0].value.payload.acceptedDocumentIds).toEqual([v2.id]);
    }
  });

  it("blocks producer system, decision, and document-request messages and cross-type replacement", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const farm = producer();
    const reviewer = scas();
    const fieldA = await draft(service, farm);
    const cadastre = await service.uploadDocument(farm, {
      fieldId: fieldA.id,
      documentType: "CADASTRE_EXTRACT",
      ...pdf(),
    });
    const land = await service.uploadDocument(farm, {
      fieldId: fieldA.id,
      documentType: "LAND_OWNERSHIP",
      ...pdf("title.pdf"),
    });
    const submitted = await service.submitToScas(farm, fieldA.id);
    await expect(
      service.sendMessage(farm, {
        caseId: submitted.verificationCase.id,
        body: "approve this",
        messageType: "DECISION",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.sendMessage(farm, {
        caseId: submitted.verificationCase.id,
        body: "system",
        messageType: "SYSTEM",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.sendMessage(farm, {
        caseId: submitted.verificationCase.id,
        body: "send another file",
        messageType: "DOCUMENT_REQUEST",
        linkedDocumentId: cadastre.id,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    const fieldB = await service.createDraft(farm, { ...sample, name: "East plot 3" });
    const other = await service.uploadDocument(farm, {
      fieldId: fieldB.id,
      documentType: "CADASTRE_EXTRACT",
      ...pdf("other.pdf"),
    });
    await expect(
      service.sendMessage(reviewer, {
        caseId: submitted.verificationCase.id,
        body: "wrong field",
        linkedDocumentId: other.id,
      }),
    ).rejects.toMatchObject({ code: "validation" });

    await service.requestChanges(reviewer, submitted.verificationCase.id, "Replace ownership, not cadastre.");
    await expect(
      service.uploadDocument(farm, {
        fieldId: fieldA.id,
        documentType: "LAND_OWNERSHIP",
        replacesDocumentId: cadastre.id,
        ...pdf("wrong-type.pdf"),
      }),
    ).rejects.toMatchObject({ code: "invalid_state" });
    await service.uploadDocument(farm, {
      fieldId: fieldA.id,
      documentType: "LAND_OWNERSHIP",
      replacesDocumentId: land.id,
      ...pdf("title-v2.pdf"),
    });
  });
});

describe("origination O1.2.1 state guards", () => {
  async function openReviewReadyForDecision(service: OriginationService, farm = producer(), reviewer = scas()) {
    const field = await draft(service, farm);
    const document = await service.uploadDocument(farm, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      ...pdf(),
    });
    const submitted = await service.submitToScas(farm, field.id);
    await service.acceptDocument(reviewer, document.id);
    await service.recordCadastreVerification(reviewer, submitted.verificationCase.id, {
      cadastreNumber: sample.cadastreNumber,
      rightHolder: "Akmola Agro LLP",
      rightType: "lease",
      registeredAreaHa: 1240,
      region: "Akmola",
      district: "Astrakhan",
      validityStatus: "active",
      sourceReference: "manual",
      notes: "",
    });
    const bundle = await service.getFieldBundle(farm, field.id);
    return {
      farm,
      reviewer,
      field: bundle.field,
      verificationCase: bundle.verificationCase!,
      document,
    };
  }

  it("lets exactly one concurrent approval succeed", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const ready = await openReviewReadyForDecision(service);
    const [first, second] = await Promise.allSettled([
      service.approveField(ready.reviewer, ready.verificationCase.id),
      service.approveField(ready.reviewer, ready.verificationCase.id),
    ]);
    expect([first, second].filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect([first, second].filter((item) => item.status === "rejected")).toHaveLength(1);
    const bundle = await service.getFieldBundle(ready.farm, ready.field.id);
    expect(bundle.field.status).toBe("VERIFIED");
    expect(bundle.verificationCase?.status).toBe("VERIFIED");
  });

  it("lets exactly one of concurrent approve and reject win a terminal outcome", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const ready = await openReviewReadyForDecision(service);
    const [approve, reject] = await Promise.allSettled([
      service.approveField(ready.reviewer, ready.verificationCase.id),
      service.rejectField(ready.reviewer, ready.verificationCase.id, "Does not meet the register."),
    ]);
    const winners = [approve, reject].filter((item) => item.status === "fulfilled");
    const losers = [approve, reject].filter((item) => item.status === "rejected");
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    const bundle = await service.getFieldBundle(ready.farm, ready.field.id);
    expect(bundle.field.status).toBe(bundle.verificationCase?.status);
    expect(["VERIFIED", "REJECTED"]).toContain(bundle.field.status);
    await expect(service.approveField(ready.reviewer, ready.verificationCase.id)).rejects.toMatchObject({
      code: "invalid_state",
    });
    await expect(
      service.rejectField(ready.reviewer, ready.verificationCase.id, "Overwrite terminal."),
    ).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("does not let request-changes overwrite a verified field", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const ready = await openReviewReadyForDecision(service);
    const [approve, changes] = await Promise.allSettled([
      service.approveField(ready.reviewer, ready.verificationCase.id),
      service.requestChanges(ready.reviewer, ready.verificationCase.id, "Please correct the extract."),
    ]);
    const bundle = await service.getFieldBundle(ready.farm, ready.field.id);
    if (approve.status === "fulfilled") {
      expect(changes.status).toBe("rejected");
      expect(bundle.field.status).toBe("VERIFIED");
      expect(bundle.verificationCase?.status).toBe("VERIFIED");
      await expect(
        service.requestChanges(ready.reviewer, ready.verificationCase.id, "Too late."),
      ).rejects.toMatchObject({ code: "invalid_state" });
    } else {
      expect(changes.status).toBe("fulfilled");
      expect(bundle.field.status).toBe("CHANGES_REQUESTED");
      expect(bundle.verificationCase?.status).toBe("CHANGES_REQUESTED");
      await expect(service.approveField(ready.reviewer, ready.verificationCase.id)).rejects.toMatchObject({
        code: "invalid_state",
      });
    }
    expect(bundle.field.status === "VERIFIED" && bundle.verificationCase?.status === "CHANGES_REQUESTED").toBe(
      false,
    );
  });

  it("refuses approval while the case is still CHANGES_REQUESTED", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const farm = producer();
    const reviewer = scas();
    const field = await draft(service, farm);
    const document = await service.uploadDocument(farm, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      ...pdf(),
    });
    const submitted = await service.submitToScas(farm, field.id);
    await service.requestChanges(reviewer, submitted.verificationCase.id, "Fix the extract.");
    await service.recordCadastreVerification(reviewer, submitted.verificationCase.id, {
      cadastreNumber: sample.cadastreNumber,
      rightHolder: "Akmola Agro LLP",
      rightType: "lease",
      registeredAreaHa: 1240,
      region: "Akmola",
      district: "Astrakhan",
      validityStatus: "active",
      sourceReference: "manual",
      notes: "",
    });
    await service.acceptDocument(reviewer, document.id);
    await expect(service.approveField(reviewer, submitted.verificationCase.id)).rejects.toMatchObject({
      code: "invalid_state",
    });
  });

  it("does not let an uncommitted upload cross the submit freeze boundary", async () => {
    const store = new MemoryOriginationStore();
    const service = new OriginationService(store);
    const actor = producer();
    const field = await draft(service, actor);
    await service.uploadDocument(actor, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      ...pdf(),
    });
    const leftover = await service.prepareDirectUpload(actor, {
      fieldId: field.id,
      documentType: "LAND_OWNERSHIP",
      filename: "title.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
    });
    await store.putBlob({
      bucket: leftover.bucket,
      objectPath: leftover.objectPath,
      bytes: pdf("title.pdf").bytes,
      contentType: "application/pdf",
    });
    await service.submitToScas(actor, field.id);
    const intent = await store.getUploadIntent(leftover.uploadIntentId);
    expect(intent?.status).toBe("EXPIRED");
    await expect(
      service.commitDirectUpload(actor, { uploadIntentId: leftover.uploadIntentId }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/immutable|invalid_state/) });

    const racing = await draft(service, actor);
    const prepared = await service.prepareDirectUpload(actor, {
      fieldId: racing.id,
      documentType: "CADASTRE_EXTRACT",
      filename: "cadastre.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
    });
    await store.putBlob({
      bucket: prepared.bucket,
      objectPath: prepared.objectPath,
      bytes: pdf().bytes,
      contentType: "application/pdf",
    });
    const [commit, submit] = await Promise.allSettled([
      service.commitDirectUpload(actor, { uploadIntentId: prepared.uploadIntentId }),
      service.submitToScas(actor, racing.id),
    ]);
    const after = await service.getFieldBundle(actor, racing.id);
    if (after.field.status !== "DRAFT") {
      const racedIntent = await store.getUploadIntent(prepared.uploadIntentId);
      if (racedIntent?.status !== "COMMITTED") {
        expect(commit.status).toBe("rejected");
        expect(submit.status).toBe("fulfilled");
      }
      await expect(
        service.uploadDocument(actor, {
          fieldId: racing.id,
          documentType: "LAND_OWNERSHIP",
          ...pdf("late-title.pdf"),
        }),
      ).rejects.toMatchObject({ code: "immutable" });
    }
  });

  it("expires a stale PREPARED upload intent so the next prepare can proceed", async () => {
    let now = Date.parse("2026-08-28T00:00:00.000Z");
    const store = new MemoryOriginationStore(undefined, () => now);
    const service = new OriginationService(store, defaultCadastreProvider(), () => new Date(now).toISOString());
    const actor = producer();
    const field = await draft(service, actor);
    const first = await service.prepareDirectUpload(actor, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      filename: "stale.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
    });
    now += UPLOAD_INTENT_TTL_MS + 1;
    const next = await service.prepareDirectUpload(actor, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      filename: "fresh.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
    });
    expect(next.uploadIntentId).not.toBe(first.uploadIntentId);
    expect(next.documentId).not.toBe(first.documentId);
    const stale = await store.getUploadIntent(first.uploadIntentId);
    expect(stale?.status).toBe("EXPIRED");
    const fresh = await store.getUploadIntent(next.uploadIntentId);
    expect(fresh?.status).toBe("PREPARED");
  });

  it("reuses one PREPARED intent for identical concurrent prepares and never creates two", async () => {
    const store = new MemoryOriginationStore();
    const service = new OriginationService(store);
    const actor = producer();
    const field = await draft(service, actor);
    const input = {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT" as const,
      filename: "cadastre.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
    };
    const [first, second] = await Promise.all([
      service.prepareDirectUpload(actor, input),
      service.prepareDirectUpload(actor, input),
    ]);
    expect(first.uploadIntentId).toBe(second.uploadIntentId);
    expect(first.documentId).toBe(second.documentId);
    expect(first.objectPath).toBe(second.objectPath);
    const [same, conflict] = await Promise.allSettled([
      service.prepareDirectUpload(actor, input),
      service.prepareDirectUpload(actor, { ...input, filename: "cadastre-2.pdf" }),
    ]);
    expect(same.status).toBe("fulfilled");
    expect(conflict.status).toBe("rejected");
    if (same.status === "fulfilled") {
      expect(same.value.uploadIntentId).toBe(first.uploadIntentId);
    }
  });
});

describe("origination public-id resolution", () => {
  it("loads a field by public id without querying the uuid column", async () => {
    const store = new MemoryOriginationStore();
    const service = new OriginationService(store);
    const actor = producer();
    const field = await draft(service, actor);
    const byId = vi.spyOn(store, "getFieldById");
    const byPublicId = vi.spyOn(store, "getFieldByPublicId");
    const bundle = await service.getFieldBundle(actor, field.publicId);
    expect(bundle.field.id).toBe(field.id);
    expect(byId).not.toHaveBeenCalled();
    expect(byPublicId).toHaveBeenCalledWith(field.publicId);
  });

  it("still loads a field by uuid without querying public_id", async () => {
    const store = new MemoryOriginationStore();
    const service = new OriginationService(store);
    const actor = producer();
    const field = await draft(service, actor);
    const byId = vi.spyOn(store, "getFieldById");
    const byPublicId = vi.spyOn(store, "getFieldByPublicId");
    const bundle = await service.getFieldBundle(actor, field.id);
    expect(bundle.field.publicId).toBe(field.publicId);
    expect(byId).toHaveBeenCalledWith(field.id);
    expect(byPublicId).not.toHaveBeenCalled();
  });

  it("updates, prepares documents, and submits using the public field id", async () => {
    const store = new MemoryOriginationStore();
    const service = new OriginationService(store);
    const actor = producer();
    const field = await draft(service, actor);
    const byId = vi.spyOn(store, "getFieldById");
    const updated = await service.updateDraft(actor, field.publicId, {
      ...sample,
      name: "North plot 12B",
    });
    expect(updated.declared.name).toBe("North plot 12B");
    expectNoUuidLookupForPublicId(byId, field.publicId);
    const prepared = await service.prepareDirectUpload(actor, {
      fieldId: field.publicId,
      documentType: "CADASTRE_EXTRACT",
      filename: "cadastre.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
    });
    expect(prepared.documentId).toBeTruthy();
    expectNoUuidLookupForPublicId(byId, field.publicId);
    await service.uploadDocument(actor, {
      fieldId: field.publicId,
      documentType: "CADASTRE_EXTRACT",
      ...pdf(),
    });
    const submitted = await service.submitToScas(actor, field.publicId);
    expect(submitted.field.status).toBe("SUBMITTED");
    expect(submitted.verificationCase.publicId).toMatch(/^VCASE-2027-\d{4}$/);
    expectNoUuidLookupForPublicId(byId, field.publicId);
  });

  it("resubmits using the public field id after changes are requested", async () => {
    const store = new MemoryOriginationStore();
    const service = new OriginationService(store);
    const farm = producer();
    const reviewer = scas();
    const field = await draft(service, farm);
    await service.uploadDocument(farm, {
      fieldId: field.publicId,
      documentType: "CADASTRE_EXTRACT",
      ...pdf(),
    });
    const submitted = await service.submitToScas(farm, field.publicId);
    await service.requestChanges(reviewer, submitted.verificationCase.publicId, "Confirm the registered area.");
    const byId = vi.spyOn(store, "getFieldById");
    const resubmitted = await service.resubmit(farm, field.publicId);
    expect(resubmitted.field.status).toBe("RESUBMITTED");
    expectNoUuidLookupForPublicId(byId, field.publicId);
  });

  it("opens a SCAS case from the queue public id without querying the uuid column", async () => {
    const store = new MemoryOriginationStore();
    const service = new OriginationService(store);
    const farm = producer();
    const reviewer = scas();
    const field = await draft(service, farm);
    await service.uploadDocument(farm, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      ...pdf(),
    });
    await service.submitToScas(farm, field.publicId);
    const queue = await service.listVerificationQueue(reviewer, "new");
    expect(queue).toHaveLength(1);
    expect(queue[0]!.publicId).toMatch(/^VCASE-2027-\d{4}$/);
    const byCaseId = vi.spyOn(store, "getCaseById");
    const bundle = await service.getCaseBundle(reviewer, queue[0]!.publicId);
    expect(bundle.verificationCase.id).toBe(queue[0]!.id);
    expectNoUuidLookupForPublicId(byCaseId, queue[0]!.publicId);
    const assigned = await service.assignReviewer(reviewer, queue[0]!.publicId, reviewer.principal.userId);
    expect(assigned.assignedReviewerUserId).toBe(reviewer.principal.userId);
    expectNoUuidLookupForPublicId(byCaseId, queue[0]!.publicId);
    await service.sendMessage(reviewer, {
      caseId: queue[0]!.publicId,
      body: "Review started.",
    });
    expectNoUuidLookupForPublicId(byCaseId, queue[0]!.publicId);
  });

  it("still opens a SCAS case by uuid without querying public_id", async () => {
    const store = new MemoryOriginationStore();
    const service = new OriginationService(store);
    const farm = producer();
    const reviewer = scas();
    const field = await draft(service, farm);
    await service.uploadDocument(farm, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      ...pdf(),
    });
    const submitted = await service.submitToScas(farm, field.id);
    const byCaseId = vi.spyOn(store, "getCaseById");
    const byPublicId = vi.spyOn(store, "getCaseByPublicId");
    const bundle = await service.getCaseBundle(reviewer, submitted.verificationCase.id);
    expect(bundle.verificationCase.publicId).toBe(submitted.verificationCase.publicId);
    expect(byCaseId).toHaveBeenCalledWith(submitted.verificationCase.id);
    expect(byPublicId).not.toHaveBeenCalled();
  });
});

describe("origination create idempotency", () => {
  it("returns the same field for the same organization and create request id", async () => {
    const store = new MemoryOriginationStore();
    const service = new OriginationService(store);
    const actor = producer();
    const requestId = randomUUID();
    const [first, second] = await Promise.all([
      service.createDraft(actor, sample, requestId),
      service.createDraft(actor, sample, requestId),
    ]);
    expect(first.id).toBe(second.id);
    expect(first.publicId).toBe(second.publicId);
    expect(first.clientCreateRequestId).toBe(requestId);
    const events = await store.listEventsByField(first.id);
    expect(events.filter((event) => event.eventType === "field_created")).toHaveLength(1);
    const listed = await service.listProducerFields(actor, "all");
    expect(listed.filter((field) => field.clientCreateRequestId === requestId)).toHaveLength(1);
  });

  it("creates a new field when the create request id changes", async () => {
    const store = new MemoryOriginationStore();
    const service = new OriginationService(store);
    const actor = producer();
    const first = await service.createDraft(actor, sample, randomUUID());
    const second = await service.createDraft(actor, { ...sample, name: "North plot 13" }, randomUUID());
    expect(first.id).not.toBe(second.id);
    expect(first.publicId).not.toBe(second.publicId);
  });
});
