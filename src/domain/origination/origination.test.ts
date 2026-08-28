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
  type OriginationDacCommercialInput,
  type ProducerDeclaredData,
} from "@/domain/origination";
import { MemoryOriginationStore } from "@/domain/origination/memory-store";
import { DAC_EXACT_TRANSITIONS } from "@/domain/origination/state-guards";
import { executedTermsSnapshotFromDac, hashCurrentDacTerms } from "@/domain/origination/terms";
import { isDemonstratorContractId } from "@/lib/origination/paths";
import { listContracts } from "@/services/contract-service";

const farm1 = DEMO_ORGANIZATIONS.find((item) => item.slug === "akmola-agro")!;
const farm2 = DEMO_ORGANIZATIONS.find((item) => item.slug === "steppe-grain")!;
const scasOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "scas")!;
const registrarOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "agricultural-registrar")!;
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

function registrar(userId = "reg-1") {
  return actorFor(registrarOrg, ["REGISTRAR_OPERATOR"], userId, "DEMO-REGISTRAR-001");
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

describe("origination desk curation", () => {
  it("archives a draft and hides it from the active producer list", async () => {
    const store = new MemoryOriginationStore();
    const service = new OriginationService(store);
    const actor = producer();
    const reviewer = scas();
    const live = await draft(service, actor);
    await service.uploadDocument(actor, {
      fieldId: live.id,
      documentType: "LAND_OWNERSHIP",
      ...pdf("title.pdf"),
    });
    const submitted = await service.submitToScas(actor, live.id);
    const retry = await service.createDraft(actor, { ...sample, name: "Retry draft" });

    await service.archiveField(actor, retry.id);

    const active = await service.listProducerFields(actor, "all");
    expect(active.map((field) => field.publicId)).toEqual([submitted.field.publicId]);
    expect(active.every((field) => field.status !== "ARCHIVED")).toBe(true);

    const archived = await service.listProducerFields(actor, "archived");
    expect(archived.map((field) => field.id)).toEqual([retry.id]);

    const queue = await service.listVerificationQueue(reviewer, "all");
    expect(queue.map((item) => item.publicId)).toEqual([submitted.verificationCase.publicId]);
  });

  it("does not archive a submitted field", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const actor = producer();
    const field = await draft(service, actor);
    await service.uploadDocument(actor, {
      fieldId: field.id,
      documentType: "LAND_OWNERSHIP",
      ...pdf("title.pdf"),
    });
    await service.submitToScas(actor, field.id);
    await expect(service.archiveField(actor, field.id)).rejects.toMatchObject({
      code: "invalid_state",
    });
  });
});

describe("origination Slice B off-chain DAC", () => {
  async function verifiedField(service: OriginationService, farm = producer(), reviewer = scas()) {
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
      registeredAreaHa: 1238.6,
      region: "Akmola",
      district: "Astrakhan",
      validityStatus: "active",
      sourceReference: "manual",
      notes: "",
    });
    const snapshot = await service.approveField(reviewer, submitted.verificationCase.id);
    return {
      farm,
      reviewer,
      field: (await service.getFieldBundle(farm, field.id)).field,
      verificationCase: submitted.verificationCase,
      snapshot,
    };
  }

  function wheatTerms(
    fieldPublicId: string,
    extra: Partial<OriginationDacCommercialInput> = {},
  ): OriginationDacCommercialInput {
    return {
      crop: "Wheat",
      harvestYear: 2027,
      contractedVolumeTonnes: 280,
      qualityClass: "Class 3",
      producerReference: fieldPublicId,
      deliveryStartDate: "2027-08-01",
      deliveryEndDate: "2027-09-30",
      deliveryLocation: "Astana elevator",
      scasNotes: "",
      issuerOrganizationId: issuerOrg.id,
      ...extra,
    };
  }

  async function draftDac(service: OriginationService) {
    const ready = await verifiedField(service);
    const dac = await service.createDacFromVerifiedCase(ready.reviewer, ready.verificationCase.id);
    return { ...ready, dac };
  }

  async function preparedDraft(service: OriginationService) {
    const opened = await draftDac(service);
    const dac = await service.updateDacDraft(
      opened.reviewer,
      opened.dac.id,
      {
        ...wheatTerms(opened.field.publicId),
        scasNotes: "Prepare the Producer-Issuer contract.",
      },
      opened.dac.currentTermsHash,
    );
    return { ...opened, dac };
  }

  async function pendingProducer(service: OriginationService) {
    const prepared = await preparedDraft(service);
    const dac = await service.sendDacToProducer(
      prepared.reviewer,
      prepared.dac.id,
      prepared.dac.currentTermsHash,
    );
    return { ...prepared, dac };
  }

  async function pendingIssuer(service: OriginationService) {
    const pending = await pendingProducer(service);
    const dac = await service.confirmDacAsProducer(pending.farm, pending.dac.id);
    return { ...pending, dac };
  }

  async function executedContract(service: OriginationService) {
    const pending = await pendingIssuer(service);
    const dac = await service.confirmDacAsIssuer(issuer(), pending.dac.id);
    return { ...pending, dac };
  }

  const otherIssuerOrg: OrganizationRecord = {
    id: "11111111-1111-4111-8111-111111111099",
    slug: "other-issuer",
    name: "Other Issuer",
    type: "ISSUER",
    status: "ACTIVE",
  };

  function issuerTwo() {
    return actorFor(otherIssuerOrg, ["ISSUER_OPERATOR"], "issuer-2");
  }

  async function assignedIssuerSnapshotDesk(service: OriginationService) {
    const farm = producer();
    const reviewer = scas();
    const field = await draft(service, farm);
    const v1 = await service.uploadDocument(farm, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      ...pdf("extract-v1.pdf"),
    });
    await service.submitToScas(farm, field.id);
    const queue = await service.listVerificationQueue(reviewer, "new");
    await service.requestChanges(reviewer, queue[0]!.id, "Please replace the extract.");
    const v2 = await service.uploadDocument(farm, {
      fieldId: field.id,
      documentType: "CADASTRE_EXTRACT",
      replacesDocumentId: v1.id,
      ...pdf("extract-v2.pdf"),
    });
    await service.resubmit(farm, field.id);
    await service.acceptDocument(reviewer, v2.id);
    const bundle = await service.getFieldBundle(farm, field.id);
    await service.recordCadastreVerification(reviewer, bundle.verificationCase!.id, {
      cadastreNumber: sample.cadastreNumber,
      rightHolder: "Akmola Agro LLP",
      rightType: "lease",
      registeredAreaHa: 1238.6,
      region: "Akmola",
      district: "Astrakhan",
      validityStatus: "active",
      sourceReference: "manual",
      notes: "",
    });
    const snapshot = await service.approveField(reviewer, bundle.verificationCase!.id);
    const dac = await service.createDacFromVerifiedCase(reviewer, bundle.verificationCase!.id);
    const drafted = await service.updateDacDraft(
      reviewer,
      dac.id,
      wheatTerms(bundle.field.publicId),
      dac.currentTermsHash,
    );
    await service.sendDacToProducer(reviewer, drafted.id, drafted.currentTermsHash);
    return {
      farm,
      reviewer,
      field: bundle.field,
      v1,
      v2,
      snapshot,
      assigned: issuer(),
    };
  }

  it("lets SCAS create a DAC only from a verified field snapshot", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const ready = await verifiedField(service);
    const dac = await service.createDacFromVerifiedCase(ready.reviewer, ready.verificationCase.id);
    expect(dac.publicId).toMatch(/^DAC-2027-\d{4}$/);
    expect(Number(dac.publicId.slice(-4))).toBeGreaterThanOrEqual(14);
    expect(dac.status).toBe("DRAFT");
    expect(dac.verifiedSnapshotId).toBe(ready.snapshot.id);
    expect(dac.fieldId).toBe(ready.field.id);
    expect(dac.landRightHolder).toBe("Akmola Agro LLP");
    expect(dac.landRightType).toBe("lease");
    expect(dac.issuerOrganizationId).toBeNull();
    expect(dac.verifiedAreaHectares).toBe(1238.6);
    expect(dac.termsVersion).toBe(1);
    expect(dac.currentTermsHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects DAC creation from draft and submitted fields", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const farm = producer();
    const reviewer = scas();
    const field = await draft(service, farm);
    await expect(service.createDacFromVerifiedCase(reviewer, field.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await service.uploadDocument(farm, { fieldId: field.id, documentType: "CADASTRE_EXTRACT", ...pdf() });
    const submitted = await service.submitToScas(farm, field.id);
    await expect(
      service.createDacFromVerifiedCase(reviewer, submitted.verificationCase.id),
    ).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("rejects a second active DAC from the same verified snapshot", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const opened = await draftDac(service);
    await expect(
      service.createDacFromVerifiedCase(opened.reviewer, opened.verificationCase.id),
    ).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("does not let a producer or registrar create a DAC", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const ready = await verifiedField(service);
    await expect(
      service.createDacFromVerifiedCase(ready.farm, ready.verificationCase.id),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.createDacFromVerifiedCase(registrar(), ready.verificationCase.id),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.createDacFromVerifiedCase(issuer(), ready.verificationCase.id),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("requires a permitted issuer before the confirmation flow", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const opened = await draftDac(service);
    await expect(
      service.sendDacToProducer(opened.reviewer, opened.dac.id, opened.dac.currentTermsHash),
    ).rejects.toMatchObject({
      code: "validation",
    });
    await expect(
      service.updateDacDraft(
        opened.reviewer,
        opened.dac.id,
        wheatTerms(opened.field.publicId, { issuerOrganizationId: farm1.id }),
        opened.dac.currentTermsHash,
      ),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects an invalid issuer organization", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const opened = await draftDac(service);
    await expect(
      service.updateDacDraft(
        opened.reviewer,
        opened.dac.id,
        wheatTerms(opened.field.publicId, { issuerOrganizationId: registrarOrg.id }),
        opened.dac.currentTermsHash,
      ),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("does not let another producer, issuer, SCAS or registrar confirm the wrong party", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const pending = await pendingProducer(service);
    await expect(service.confirmDacAsProducer(producerTwo(), pending.dac.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(service.confirmDacAsProducer(pending.reviewer, pending.dac.id)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(service.confirmDacAsProducer(registrar(), pending.dac.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(service.confirmDacAsIssuer(pending.reviewer, pending.dac.id)).rejects.toMatchObject({
      code: "forbidden",
    });
    const waitingIssuer = await service.confirmDacAsProducer(pending.farm, pending.dac.id);
    await expect(service.confirmDacAsIssuer(issuerTwo(), waitingIssuer.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(service.confirmDacAsIssuer(pending.reviewer, waitingIssuer.id)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(service.confirmDacAsIssuer(registrar(), waitingIssuer.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("freezes terms after send to producer and stores exact hashes on confirmation", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const pending = await pendingProducer(service);
    expect(pending.dac.status).toBe("PENDING_PRODUCER_CONFIRMATION");
    const frozenHash = pending.dac.currentTermsHash;
    await expect(
      service.updateDacDraft(
        pending.reviewer,
        pending.dac.id,
        wheatTerms(pending.field.publicId, { contractedVolumeTonnes: 275 }),
        pending.dac.currentTermsHash,
      ),
    ).rejects.toMatchObject({ code: "invalid_state" });
    const producerConfirmed = await service.confirmDacAsProducer(pending.farm, pending.dac.id);
    expect(producerConfirmed.status).toBe("PENDING_ISSUER_CONFIRMATION");
    expect(producerConfirmed.producerConfirmedTermsHash).toBe(frozenHash);
    expect(producerConfirmed.producerConfirmedByRole).toBe("PRODUCER_ADMIN");
    expect(producerConfirmed.producerConfirmedAt).toBeTruthy();
    const executed = await service.confirmDacAsIssuer(issuer(), producerConfirmed.id);
    expect(executed.status).toBe("EXECUTED");
    expect(executed.issuerConfirmedTermsHash).toBe(frozenHash);
    expect(executed.executedTermsHash).toBe(frozenHash);
    expect(executed.executedAt).toBeTruthy();
    expect(executed.executedTermsSnapshot).toMatchObject({
      producerOrganizationId: farm1.id,
      issuerOrganizationId: issuerOrg.id,
      crop: "Wheat",
      harvestYear: 2027,
      contractedVolumeTonnes: 280,
      deliveryStartDate: "2027-08-01",
      deliveryEndDate: "2027-09-30",
      deliveryLocation: "Astana elevator",
    });
    expect(executed.executedTermsHash).toBe(executed.currentTermsHash);
    expect(executed.producerConfirmedTermsHash).toBe(executed.currentTermsHash);
    expect(executed.issuerConfirmedTermsHash).toBe(executed.currentTermsHash);
    expect(executed.executedTermsSnapshot).toEqual(executedTermsSnapshotFromDac(executed));
  });

  it("clears confirmations when a returned draft is edited", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const pending = await pendingProducer(service);
    const returned = await service.returnDacAsProducer(pending.farm, pending.dac.id, "Volume is too high.");
    expect(returned.status).toBe("DRAFT");
    expect(returned.producerConfirmedTermsHash).toBeNull();
    const edited = await service.updateDacDraft(
      pending.reviewer,
      returned.id,
      wheatTerms(pending.field.publicId, {
        contractedVolumeTonnes: 270,
        scasNotes: "Revised after producer return.",
      }),
      returned.currentTermsHash,
    );
    expect(edited.termsVersion).toBeGreaterThan(pending.dac.termsVersion);
    expect(edited.currentTermsHash).not.toBe(pending.dac.currentTermsHash);
    expect(edited.producerConfirmedTermsHash).toBeNull();
    expect(edited.issuerConfirmedTermsHash).toBeNull();
  });

  it("hides confirmation-pending DACs from registrar and generic contracts readers", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const pending = await pendingProducer(service);
    await expect(service.getDacBundle(registrar(), pending.dac.publicId)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await service.listRegistrarIntake(registrar(), "all")).toEqual([]);
    const issuerPending = await service.confirmDacAsProducer(pending.farm, pending.dac.id);
    await expect(service.getDacBundle(registrar(), issuerPending.publicId)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await service.listLiveOriginatedDacs(adminOnly())).toEqual([]);
    expect(await service.listLiveOriginatedDacs(issuer())).toEqual([]);
    await expect(service.submitDacToRegistrar(pending.reviewer, pending.dac.id)).rejects.toMatchObject({
      code: "invalid_state",
    });
  });

  it("lets SCAS submit only an executed DAC, and registrar return does not undo execution", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const opened = await draftDac(service);
    await expect(service.submitDacToRegistrar(opened.reviewer, opened.dac.id)).rejects.toMatchObject({
      code: "invalid_state",
    });
    const executed = await executedContract(service);
    expect(executed.dac.status).toBe("EXECUTED");
    const submitted = await service.submitDacToRegistrar(executed.reviewer, executed.dac.id);
    expect(submitted.status).toBe("READY_FOR_REGISTRAR");
    const clerk = registrar();
    const reviewing = await service.startRegistrarReview(clerk, submitted.id);
    expect(reviewing.status).toBe("UNDER_REGISTRAR_REVIEW");
    const returned = await service.returnDacIntake(clerk, submitted.id, "Need the harvest-note dossier.");
    expect(returned.status).toBe("RETURNED_BY_REGISTRAR");
    expect(returned.executedTermsHash).toBe(executed.dac.executedTermsHash);
    expect(returned.executedAt).toBe(executed.dac.executedAt);
    expect(returned.producerConfirmedTermsHash).toBe(executed.dac.producerConfirmedTermsHash);
    expect(returned.issuerConfirmedTermsHash).toBe(executed.dac.issuerConfirmedTermsHash);
    await expect(
      service.updateDacDraft(
        executed.reviewer,
        returned.id,
        wheatTerms(executed.field.publicId, {
          contractedVolumeTonnes: 250,
          scasNotes: "silent term change",
        }),
        returned.currentTermsHash,
      ),
    ).rejects.toMatchObject({ code: "invalid_state" });
    const resubmitted = await service.submitDacToRegistrar(executed.reviewer, returned.id);
    expect(resubmitted.status).toBe("READY_FOR_REGISTRAR");
    expect(resubmitted.executedTermsHash).toBe(executed.dac.executedTermsHash);
    const reviewingAgain = await service.startRegistrarReview(clerk, resubmitted.id);
    const accepted = await service.acceptDacIntake(clerk, reviewingAgain.id, "Intake complete.");
    expect(accepted.status).toBe("REGISTRAR_ACCEPTED");
    expect(accepted).not.toHaveProperty("poolId");
    expect(accepted).not.toHaveProperty("tokenId");
    expect(accepted).not.toHaveProperty("issuanceId");
    expect(accepted).not.toHaveProperty("placementId");
    const bundle = await service.getDacBundle(clerk, accepted.publicId);
    const acceptEvent = bundle.events.find((event) => event.eventType === "dac_accepted");
    expect(acceptEvent?.metadata).toMatchObject({
      createdPool: false,
      createdToken: false,
      createdIssuance: false,
      createdPlacement: false,
      chainWrite: false,
    });
  });

  it("lets a producer see only their own DAC status", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const opened = await draftDac(service);
    const own = await service.getDacBundle(opened.farm, opened.dac.publicId);
    expect(own.dac.publicId).toBe(opened.dac.publicId);
    await expect(service.getDacBundle(producerTwo(), opened.dac.publicId)).rejects.toMatchObject({
      code: "not_found",
    });
    const listed = await service.listLiveOriginatedDacs(opened.farm);
    expect(listed.map((item) => item.dac.id)).toEqual([opened.dac.id]);
    expect(listed[0]?.fieldPublicId).toBe(opened.field.publicId);
    expect(await service.listLiveOriginatedDacs(producerTwo())).toEqual([]);
    const fieldBundle = await service.getFieldBundle(opened.farm, opened.field.id);
    expect(fieldBundle.dac?.id).toBe(opened.dac.id);
    expect(fieldBundle.events.some((event) => event.eventType === "dac_created")).toBe(true);
  });

  it("keeps demonstrator contract ids distinct from live origination DACs", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const opened = await draftDac(service);
    expect(opened.dac.publicId).not.toBe("DAC-2027-0001");
    expect(opened.dac.publicId).not.toBe("DAC-2027-0005");
    expect(isDemonstratorContractId(opened.dac.publicId)).toBe(false);
    expect(listContracts().some((item) => item.contract.id === "DAC-2027-0001")).toBe(true);
    expect(listContracts().some((item) => item.contract.id === opened.dac.publicId)).toBe(false);
  });

  it("allows only one of two concurrent producer confirms", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const pending = await pendingProducer(service);
    const results = await Promise.allSettled([
      service.confirmDacAsProducer(pending.farm, pending.dac.id),
      service.confirmDacAsProducer(pending.farm, pending.dac.id),
    ]);
    const fulfilled = results.filter((item) => item.status === "fulfilled");
    const rejected = results.filter((item) => item.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: "invalid_state" });
  });

  it("allows only one of producer confirm versus return", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const pending = await pendingProducer(service);
    const results = await Promise.allSettled([
      service.confirmDacAsProducer(pending.farm, pending.dac.id),
      service.returnDacAsProducer(pending.farm, pending.dac.id, "Need a lower volume."),
    ]);
    const fulfilled = results.filter((item) => item.status === "fulfilled");
    const rejected = results.filter((item) => item.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it("allows only one of issuer confirm versus return", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const pending = await pendingIssuer(service);
    const results = await Promise.allSettled([
      service.confirmDacAsIssuer(issuer(), pending.dac.id),
      service.returnDacAsIssuer(issuer(), pending.dac.id, "Need a quality note."),
    ]);
    const fulfilled = results.filter((item) => item.status === "fulfilled");
    const rejected = results.filter((item) => item.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it("allows only one registrar terminal decision", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const executed = await executedContract(service);
    const submitted = await service.submitDacToRegistrar(executed.reviewer, executed.dac.id);
    const clerk = registrar();
    const reviewing = await service.startRegistrarReview(clerk, submitted.id);
    const results = await Promise.allSettled([
      service.acceptDacIntake(clerk, reviewing.id, "Accept."),
      service.returnDacIntake(clerk, reviewing.id, "Return."),
    ]);
    const fulfilled = results.filter((item) => item.status === "fulfilled");
    const rejected = results.filter((item) => item.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it("lists issuers from the organization source rather than a hardcoded production catalog", async () => {
    const store = new MemoryOriginationStore();
    const extra: OrganizationRecord = {
      id: "11111111-1111-4111-8111-111111111198",
      slug: "steppe-issuer",
      name: "Steppe Issuer",
      type: "ISSUER",
      status: "ACTIVE",
    };
    store.seedOrganization(extra);
    const service = new OriginationService(store);
    const listed = await service.listActiveIssuerOrganizations(scas());
    expect(listed.some((item) => item.id === extra.id)).toBe(true);
    expect(listed.some((item) => item.id === issuerOrg.id)).toBe(true);
    expect(listed.every((item) => item.type === "ISSUER" && item.status === "ACTIVE")).toBe(true);
  });

  it("rejects an inactive issuer and a non-issuer organization", async () => {
    const store = new MemoryOriginationStore();
    const inactive: OrganizationRecord = {
      id: "11111111-1111-4111-8111-111111111197",
      slug: "inactive-issuer",
      name: "Inactive Issuer",
      type: "ISSUER",
      status: "SUSPENDED",
    };
    store.seedOrganization(inactive);
    const service = new OriginationService(store);
    const opened = await draftDac(service);
    const hash = opened.dac.currentTermsHash;
    const base = wheatTerms(opened.field.publicId);
    await expect(
      service.updateDacDraft(opened.reviewer, opened.dac.id, {
        ...base,
        issuerOrganizationId: inactive.id,
      }, hash),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      service.updateDacDraft(opened.reviewer, opened.dac.id, {
        ...base,
        issuerOrganizationId: farm1.id,
      }, hash),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("requires contracted volume and delivery terms before sending to the producer", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const opened = await draftDac(service);
    let dac = opened.dac;
    await expect(
      service.sendDacToProducer(opened.reviewer, dac.id, dac.currentTermsHash),
    ).rejects.toMatchObject({
      code: "validation",
    });
    dac = await service.updateDacDraft(
      opened.reviewer,
      dac.id,
      wheatTerms(opened.field.publicId, { contractedVolumeTonnes: null }),
      dac.currentTermsHash,
    );
    await expect(
      service.sendDacToProducer(opened.reviewer, dac.id, dac.currentTermsHash),
    ).rejects.toMatchObject({
      code: "validation",
    });
    dac = await service.updateDacDraft(
      opened.reviewer,
      dac.id,
      wheatTerms(opened.field.publicId, { deliveryStartDate: null }),
      dac.currentTermsHash,
    );
    await expect(
      service.sendDacToProducer(opened.reviewer, dac.id, dac.currentTermsHash),
    ).rejects.toMatchObject({
      code: "validation",
    });
    dac = await service.updateDacDraft(
      opened.reviewer,
      dac.id,
      wheatTerms(opened.field.publicId, { deliveryEndDate: null }),
      dac.currentTermsHash,
    );
    await expect(
      service.sendDacToProducer(opened.reviewer, dac.id, dac.currentTermsHash),
    ).rejects.toMatchObject({
      code: "validation",
    });
    dac = await service.updateDacDraft(
      opened.reviewer,
      dac.id,
      wheatTerms(opened.field.publicId, { deliveryLocation: null }),
      dac.currentTermsHash,
    );
    await expect(
      service.sendDacToProducer(opened.reviewer, dac.id, dac.currentTermsHash),
    ).rejects.toMatchObject({
      code: "validation",
    });
    await expect(
      service.updateDacDraft(
        opened.reviewer,
        dac.id,
        wheatTerms(opened.field.publicId, {
          deliveryStartDate: "2027-09-30",
          deliveryEndDate: "2027-08-01",
        }),
        dac.currentTermsHash,
      ),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects the wrong exact state transition", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const opened = await draftDac(service);
    await expect(service.confirmDacAsProducer(opened.farm, opened.dac.id)).rejects.toMatchObject({
      code: "invalid_state",
    });
    await expect(service.confirmDacAsIssuer(issuer(), opened.dac.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(service.startRegistrarReview(registrar(), opened.dac.id)).rejects.toMatchObject({
      code: "not_found",
    });
    const pending = await pendingProducer(service);
    await expect(service.submitDacToRegistrar(pending.reviewer, pending.dac.id)).rejects.toMatchObject({
      code: "invalid_state",
    });
    await expect(service.acceptDacIntake(registrar(), pending.dac.id, "Accept.")).rejects.toMatchObject({
      code: "not_found",
    });
    const executed = await executedContract(service);
    await expect(service.acceptDacIntake(registrar(), executed.dac.id, "Accept.")).rejects.toMatchObject({
      code: "not_found",
    });
    const submitted = await service.submitDacToRegistrar(executed.reviewer, executed.dac.id);
    await expect(service.acceptDacIntake(registrar(), submitted.id, "Accept.")).rejects.toMatchObject({
      code: "invalid_state",
    });
    expect(DAC_EXACT_TRANSITIONS.submit_to_registrar.from).toEqual([
      "EXECUTED",
      "RETURNED_BY_REGISTRAR",
    ]);
    expect(DAC_EXACT_TRANSITIONS.accept.from).toEqual(["UNDER_REGISTRAR_REVIEW"]);
  });

  it("ignores contract-term mutations on confirmation, execution and registrar RPCs", async () => {
    const store = new MemoryOriginationStore();
    const service = new OriginationService(store);
    const pending = await pendingProducer(service);
    const frozen = pending.dac.contractedVolumeTonnes;
    const producerResult = await store.applyDacTransition({
      kind: "producer_confirm",
      expectedStatuses: ["PENDING_PRODUCER_CONFIRMATION"],
      expectedProducerOrganizationId: farm1.id,
      dac: {
        ...pending.dac,
        status: "EXECUTED",
        contractedVolumeTonnes: 1,
        deliveryLocation: "mutated",
        issuerOrganizationId: farm1.id,
        crop: "Barley",
        producerConfirmedTermsHash: "deadbeef",
        producerConfirmedByUserId: "issuer-1",
        producerConfirmedByRole: "PRODUCER_ADMIN",
        producerConfirmedAt: "2027-01-01T00:00:00.000Z",
        updatedByUserId: "issuer-1",
        updatedAt: "2027-01-01T00:00:00.000Z",
      },
      event: {
        id: randomUUID(),
        occurredAt: "2027-01-01T00:00:00.000Z",
        actorUserId: "user-1",
        effectiveRole: "PRODUCER_ADMIN",
        personaId: null,
        organizationId: farm1.id,
        eventType: "dac_producer_confirmed",
        objectType: "dac",
        objectId: pending.dac.id,
        result: "ok",
        metadata: {},
      },
    });
    expect(producerResult.status).toBe("PENDING_ISSUER_CONFIRMATION");
    expect(producerResult.contractedVolumeTonnes).toBe(frozen);
    expect(producerResult.deliveryLocation).toBe("Astana elevator");
    expect(producerResult.issuerOrganizationId).toBe(issuerOrg.id);
    expect(producerResult.crop).toBe("Wheat");
    expect(producerResult.producerConfirmedTermsHash).toBe(pending.dac.currentTermsHash);

    const issuerResult = await store.applyDacTransition({
      kind: "issuer_confirm",
      expectedStatuses: ["PENDING_ISSUER_CONFIRMATION"],
      expectedIssuerOrganizationId: issuerOrg.id,
      dac: {
        ...producerResult,
        status: "REGISTRAR_ACCEPTED",
        contractedVolumeTonnes: 9,
        deliveryStartDate: "2028-01-01",
        executedTermsSnapshot: { crop: "mutated" },
        executedTermsHash: "ffff",
        issuerConfirmedTermsHash: "deadbeef",
        issuerConfirmedByUserId: "issuer-1",
        issuerConfirmedByRole: "ISSUER_OPERATOR",
        issuerConfirmedAt: "2027-01-02T00:00:00.000Z",
        executedAt: "2027-01-02T00:00:00.000Z",
        updatedByUserId: "issuer-1",
        updatedAt: "2027-01-02T00:00:00.000Z",
      },
      event: {
        id: randomUUID(),
        occurredAt: "2027-01-02T00:00:00.000Z",
        actorUserId: "issuer-1",
        effectiveRole: "ISSUER_OPERATOR",
        personaId: null,
        organizationId: issuerOrg.id,
        eventType: "dac_issuer_confirmed",
        objectType: "dac",
        objectId: producerResult.id,
        result: "ok",
        metadata: {},
      },
    });
    expect(issuerResult.status).toBe("EXECUTED");
    expect(issuerResult.contractedVolumeTonnes).toBe(frozen);
    expect(issuerResult.deliveryStartDate).toBe("2027-08-01");
    expect(issuerResult.executedTermsHash).toBe(issuerResult.currentTermsHash);
    expect(issuerResult.issuerConfirmedTermsHash).toBe(issuerResult.currentTermsHash);
    expect(issuerResult.producerConfirmedTermsHash).toBe(issuerResult.currentTermsHash);
    expect(issuerResult.executedTermsSnapshot).toEqual(executedTermsSnapshotFromDac(issuerResult));
    expect(hashCurrentDacTerms(issuerResult)).toBe(issuerResult.currentTermsHash);

    const submitted = await service.submitDacToRegistrar(pending.reviewer, issuerResult.id);
    const reviewing = await service.startRegistrarReview(registrar(), submitted.id);
    const returned = await store.applyDacTransition({
      kind: "return_intake",
      expectedStatuses: ["UNDER_REGISTRAR_REVIEW"],
      dac: {
        ...reviewing,
        status: "DRAFT",
        contractedVolumeTonnes: 3,
        executedTermsHash: null,
        executedAt: null,
        registrarNotes: "Need the harvest-note dossier.",
        registrarReviewedByUserId: "registrar-1",
        returnedAt: "2027-01-03T00:00:00.000Z",
        updatedByUserId: "registrar-1",
        updatedAt: "2027-01-03T00:00:00.000Z",
      },
      message: {
        id: randomUUID(),
        dacId: reviewing.id,
        senderUserId: "registrar-1",
        senderRole: "REGISTRAR_OPERATOR",
        senderPersonaId: null,
        body: "Need the harvest-note dossier.",
        messageType: "DECISION",
        createdAt: "2027-01-03T00:00:00.000Z",
      },
      event: {
        id: randomUUID(),
        occurredAt: "2027-01-03T00:00:00.000Z",
        actorUserId: "registrar-1",
        effectiveRole: "REGISTRAR_OPERATOR",
        personaId: null,
        organizationId: registrarOrg.id,
        eventType: "dac_returned",
        objectType: "dac",
        objectId: reviewing.id,
        result: "ok",
        metadata: {},
      },
    });
    expect(returned.status).toBe("RETURNED_BY_REGISTRAR");
    expect(returned.executedTermsHash).toBe(issuerResult.executedTermsHash);
    expect(returned.executedAt).toBe(issuerResult.executedAt);
    expect(returned.contractedVolumeTonnes).toBe(frozen);
    expect(returned.deliveryLocation).toBe("Astana elevator");
  });

  it("lets an assigned issuer read an accepted verified-snapshot document", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const desk = await assignedIssuerSnapshotDesk(service);
    expect(desk.snapshot.payload.acceptedDocumentIds).toEqual([desk.v2.id]);
    const blob = await service.authorizedBlob(desk.assigned, desk.v2.bucket, desk.v2.objectPath);
    expect(blob?.bytes.byteLength).toBeGreaterThan(0);
    await expect(
      service.authorizedBlob(desk.farm, desk.v2.bucket, desk.v2.objectPath),
    ).resolves.toMatchObject({ contentType: "application/pdf" });
    await expect(
      service.authorizedBlob(desk.reviewer, desk.v2.bucket, desk.v2.objectPath),
    ).resolves.toMatchObject({ contentType: "application/pdf" });
    await expect(
      service.authorizedBlob(registrar(), desk.v2.bucket, desk.v2.objectPath),
    ).resolves.toMatchObject({ contentType: "application/pdf" });
  });

  it("does not let an assigned issuer read a document outside the verified snapshot", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const desk = await assignedIssuerSnapshotDesk(service);
    await expect(
      service.authorizedBlob(desk.assigned, desk.v1.bucket, desk.v1.objectPath),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("does not let a different issuer read an assigned DAC snapshot document", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const desk = await assignedIssuerSnapshotDesk(service);
    await expect(
      service.authorizedBlob(issuerTwo(), desk.v2.bucket, desk.v2.objectPath),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("does not let an assigned issuer read another field's document", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const desk = await assignedIssuerSnapshotDesk(service);
    const other = await verifiedField(service, desk.farm, desk.reviewer);
    const otherDoc = (await service.getFieldBundle(desk.farm, other.field.id)).documents.find(
      (document) => document.current,
    );
    expect(otherDoc).toBeTruthy();
    await expect(
      service.authorizedBlob(desk.assigned, otherDoc!.bucket, otherDoc!.objectPath),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects a second stale draft edit after another save", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const opened = await draftDac(service);
    const staleHash = opened.dac.currentTermsHash;
    await service.updateDacDraft(
      opened.reviewer,
      opened.dac.id,
      wheatTerms(opened.field.publicId, { contractedVolumeTonnes: 275 }),
      staleHash,
    );
    await expect(
      service.updateDacDraft(
        opened.reviewer,
        opened.dac.id,
        wheatTerms(opened.field.publicId, { contractedVolumeTonnes: 260 }),
        staleHash,
      ),
    ).rejects.toMatchObject({
      code: "invalid_state",
      message: expect.stringMatching(/terms hash/i),
    });
  });

  it("rejects a stale send after another draft edit", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const prepared = await preparedDraft(service);
    const staleHash = prepared.dac.currentTermsHash;
    await service.updateDacDraft(
      prepared.reviewer,
      prepared.dac.id,
      wheatTerms(prepared.field.publicId, { contractedVolumeTonnes: 290 }),
      staleHash,
    );
    await expect(
      service.sendDacToProducer(prepared.reviewer, prepared.dac.id, staleHash),
    ).rejects.toMatchObject({
      code: "invalid_state",
      message: expect.stringMatching(/terms hash/i),
    });
  });

  it("sends to the producer when the expected terms hash matches the loaded draft", async () => {
    const service = new OriginationService(new MemoryOriginationStore());
    const prepared = await preparedDraft(service);
    const sent = await service.sendDacToProducer(
      prepared.reviewer,
      prepared.dac.id,
      prepared.dac.currentTermsHash,
    );
    expect(sent.status).toBe("PENDING_PRODUCER_CONFIRMATION");
    expect(sent.currentTermsHash).toBe(prepared.dac.currentTermsHash);
  });
});
