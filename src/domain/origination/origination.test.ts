import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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
