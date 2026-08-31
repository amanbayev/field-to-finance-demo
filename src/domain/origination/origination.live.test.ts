import { existsSync, readFileSync } from "node:fs";
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
import { OriginationService, type ProducerDeclaredData } from "@/domain/origination";
import { PostgresOriginationStore } from "@/data/origination/postgres-store";
import { isDemonstratorContractId } from "@/lib/origination/paths";
import { createServiceRoleClient } from "@/lib/auth/supabase/admin";

function loadLocalEnv() {
  const path = ".env.local";
  if (!existsSync(path)) {
    return;
  }
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index < 1) {
      continue;
    }
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).replace(/^["']|["']$/g, "");
    if (
      (key === "SUPABASE_SECRET_KEY" ||
        key === "SUPABASE_SERVICE_ROLE_KEY" ||
        key === "NEXT_PUBLIC_SUPABASE_URL") &&
      !process.env[key]
    ) {
      process.env[key] = value;
    }
  }
}

if (process.env.RUN_LIVE_ORIGINATION_TESTS === "1") {
  loadLocalEnv();
}

const farm1 = DEMO_ORGANIZATIONS.find((item) => item.slug === "akmola-agro")!;
const farm2 = DEMO_ORGANIZATIONS.find((item) => item.slug === "steppe-grain")!;
const scasOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "scas")!;
const issuerOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "agro-issuer")!;
const registrarOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "agricultural-registrar")!;
const platform = DEMO_ORGANIZATIONS.find((item) => item.slug === "field-to-finance")!;
const live =
  process.env.RUN_LIVE_ORIGINATION_TESTS === "1" &&
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  );

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

function pdf(name: string) {
  return {
    filename: name,
    mimeType: "application/pdf" as const,
    bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
  };
}

async function openVerifiedQaPlot(service: OriginationService, stamp: string) {
  const farm = actorFor(farm1, ["PRODUCER_ADMIN"], `qa-b2-prod-${stamp}`);
  const reviewer = actorFor(scasOrg, ["SCAS_OPERATOR"], `qa-b2-scas-${stamp}`, "DEMO-SCAS-001");
  const issuer = actorFor(issuerOrg, ["ISSUER_OPERATOR"], `qa-b2-iss-${stamp}`, "DEMO-ISSUER-001");
  const registrar = actorFor(registrarOrg, ["REGISTRAR_OPERATOR"], `qa-b2-reg-${stamp}`, "DEMO-REGISTRAR-001");
  const declared: ProducerDeclaredData = {
    name: `QA B.2 Zerendi plot ${stamp}`,
    season: 2027,
    crop: "Wheat",
    cadastreNumber: `KZ-QA-B2-${stamp.slice(-6)}`,
    declaredAreaHa: 1240,
    region: "Akmola",
    district: "Zerendi",
  };
  const created = await service.createDraft(farm, declared);
  const extract = await service.uploadDocument(farm, {
    fieldId: created.id,
    documentType: "CADASTRE_EXTRACT",
    ...pdf(`qa-b2-cadastre-${stamp}.pdf`),
  });
  const submitted = await service.submitToScas(farm, created.id);
  await service.recordCadastreVerification(reviewer, submitted.verificationCase.id, {
    cadastreNumber: declared.cadastreNumber,
    rightHolder: "Akmola Agro LLP",
    rightType: "lease",
    registeredAreaHa: 1238.6,
    region: "Akmola",
    district: "Zerendi",
    validityStatus: "active",
    sourceReference: "QA B.2 SCAS desk extract",
    notes: "Declared 1,240 ha; register 1,238.6 ha.",
  });
  await service.acceptDocument(reviewer, extract.id);
  await service.approveField(reviewer, submitted.verificationCase.id);
  const field = (await service.getFieldBundle(farm, created.id)).field;
  return {
    farm,
    reviewer,
    issuer,
    registrar,
    field,
    verificationCase: submitted.verificationCase,
    extract,
  };
}

describe.skipIf(!live)("origination live postgres (explicit RUN_LIVE_ORIGINATION_TESTS=1 only)", () => {
  it("persists a Producer ↔ SCAS workflow without DAC or public files", async () => {
    const client = createServiceRoleClient();
    expect(client).toBeTruthy();
    const store = new PostgresOriginationStore(client!);
    const service = new OriginationService(store);
    const stamp = Date.now().toString(36);
    const farm = actorFor(farm1, ["PRODUCER_ADMIN"], `qa-o11-prod-${stamp}`);
    const other = actorFor(farm2, ["PRODUCER_ADMIN"], `qa-o11-other-${stamp}`);
    const reviewer = actorFor(scasOrg, ["SCAS_OPERATOR"], `qa-o11-scas-${stamp}`, "DEMO-SCAS-001");
    const issuer = actorFor(issuerOrg, ["ISSUER_OPERATOR"], `qa-o11-iss-${stamp}`);
    const registrar = actorFor(registrarOrg, ["REGISTRAR_OPERATOR"], `qa-o11-reg-${stamp}`);
    const adminOnly = actorFor(platform, ["SYSTEM_ADMIN"], `qa-o11-adm-${stamp}`);

    const [seqA, seqB] = await Promise.all([store.nextFieldSequence(), store.nextFieldSequence()]);
    expect(seqA).not.toBe(seqB);

    const declared: ProducerDeclaredData = {
      name: `QA O1.1 Zerendi plot ${stamp}`,
      season: 2027,
      crop: "Wheat",
      cadastreNumber: `KZ-QA-O11-${stamp.slice(-6)}`,
      declaredAreaHa: 1240,
      region: "Akmola",
      district: "Zerendi",
    };

    const created = await service.createDraft(farm, declared);
    const reloaded = await service.getFieldBundle(farm, created.publicId);
    expect(reloaded.field.id).toBe(created.id);
    expect(reloaded.field.declared.name).toBe(declared.name);

    const extractV1 = await service.uploadDocument(farm, {
      fieldId: created.id,
      documentType: "CADASTRE_EXTRACT",
      ...pdf("qa-cadastre-v1.pdf"),
    });
    const land = await service.uploadDocument(farm, {
      fieldId: created.id,
      documentType: "LAND_OWNERSHIP",
      ...pdf("qa-land-use.pdf"),
    });
    const afterUpload = await service.getFieldBundle(farm, created.id);
    expect(afterUpload.documents).toHaveLength(2);

    await expect(service.getFieldBundle(other, created.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(
      service.authorizedBlob(other, extractV1.bucket, extractV1.objectPath),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await service.isObjectPublic(extractV1.bucket, extractV1.objectPath)).toBe(false);

    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${extractV1.bucket}/${extractV1.objectPath}`;
    const anonymous = await fetch(publicUrl);
    expect(anonymous.ok).toBe(false);

    const submitted = await service.submitToScas(farm, created.id);
    const submittedAgain = await service.getFieldBundle(farm, created.id);
    expect(submittedAgain.submissions[0]?.id).toBe(submitted.submission.id);
    expect(submittedAgain.verificationCase?.publicId).toBe(submitted.verificationCase.publicId);
    submitted.submission.declared.name = "mutated";
    const storedSubmission = await store.getSubmission(submitted.submission.id);
    expect(storedSubmission?.declared.name).toBe(declared.name);

    const scasBlob = await service.authorizedBlob(reviewer, extractV1.bucket, extractV1.objectPath);
    expect(scasBlob?.bytes.byteLength).toBeGreaterThan(0);

    await service.recordCadastreVerification(reviewer, submitted.verificationCase.id, {
      cadastreNumber: declared.cadastreNumber,
      rightHolder: "Akmola Agro LLP",
      rightType: "lease",
      registeredAreaHa: 1238.6,
      region: "Akmola",
      district: "Zerendi",
      validityStatus: "active",
      sourceReference: "QA O1.1 SCAS desk extract",
      notes: "Declared 1,240 ha; register 1,238.6 ha.",
    });
    await service.requestDocumentReplacement(reviewer, extractV1.id, "The cadastral extract is outdated.");
    await service.requestChanges(reviewer, submitted.verificationCase.id, "Please upload the current cadastre extract.");

    const extractV2 = await service.uploadDocument(farm, {
      fieldId: created.id,
      documentType: "CADASTRE_EXTRACT",
      replacesDocumentId: extractV1.id,
      ...pdf("qa-cadastre-v2.pdf"),
    });
    await service.resubmit(farm, created.id);
    const versions = await service.getFieldBundle(farm, created.id);
    const first = versions.documents.find((item) => item.id === extractV1.id);
    const second = versions.documents.find((item) => item.id === extractV2.id);
    expect(first?.status).toBe("SUPERSEDED");
    expect(first?.current).toBe(false);
    expect(second?.version).toBe(2);
    expect(second?.current).toBe(true);

    await service.acceptDocument(reviewer, land.id);
    await service.acceptDocument(reviewer, extractV2.id);
    const snapshot = await service.approveField(reviewer, versions.verificationCase!.id);
    expect(snapshot.payload.reviewerUserId).toBe(reviewer.principal.userId);
    expect(snapshot.payload.reviewerPersonaId).toBe("DEMO-SCAS-001");
    const verified = await service.getFieldBundle(farm, created.id);
    expect(verified.field.status).toBe("VERIFIED");
    expect(verified.snapshot?.id).toBe(snapshot.id);

    await expect(service.approveField(farm, versions.verificationCase!.id)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(service.approveField(issuer, versions.verificationCase!.id)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(service.approveField(registrar, versions.verificationCase!.id)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(service.approveField(adminOnly, versions.verificationCase!.id)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(service.tryHardDeleteVerified(farm, created.id)).rejects.toMatchObject({
      code: "immutable",
    });

    const { error: auditMutate } = await client!
      .from("field_origination_events")
      .update({ result: "tamper" })
      .eq("object_id", created.id);
    expect(auditMutate).toBeTruthy();

    expect(verified.events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "field_created",
        "document_uploaded",
        "field_submitted",
        "verification_started",
        "document_replacement_requested",
        "message_sent",
        "document_replaced",
        "field_resubmitted",
        "document_accepted",
        "cadastre_verified",
        "field_verified",
      ]),
    );
    const source = readFileSync("src/domain/origination/service.ts", "utf8");
    expect(source).not.toMatch(/solana|blockchain|recordedPlacement/i);
  }, 60_000);

  it("persists a Producer-Issuer DAC through registrar intake without pool, token, or chain write", async () => {
    const client = createServiceRoleClient();
    expect(client).toBeTruthy();
    const store = new PostgresOriginationStore(client!);
    const service = new OriginationService(store);
    const stamp = Date.now().toString(36);
    const plot = await openVerifiedQaPlot(service, stamp);

    const opened = await service.createDacFromVerifiedCase(plot.reviewer, plot.verificationCase.id);
    const seq = Number(opened.publicId.slice(-4));
    expect(opened.publicId).toMatch(/^DAC-2027-\d{4}$/);
    expect(seq).toBeGreaterThanOrEqual(14);
    expect(isDemonstratorContractId(opened.publicId)).toBe(false);

    const drafted = await service.updateDacDraft(
      plot.reviewer,
      opened.id,
      {
        crop: "Wheat",
        harvestYear: 2027,
        contractedVolumeTonnes: 280,
        qualityClass: "Class 3",
        producerReference: plot.field.publicId,
        deliveryStartDate: "2027-08-01",
        deliveryEndDate: "2027-09-30",
        deliveryLocation: "Astana elevator",
        scasNotes: "QA B.2 live contract terms.",
        issuerOrganizationId: issuerOrg.id,
      },
      opened.currentTermsHash,
    );
    const sent = await service.sendDacToProducer(plot.reviewer, drafted.id, drafted.currentTermsHash);
    expect(sent.status).toBe("PENDING_PRODUCER_CONFIRMATION");
    const producerConfirmed = await service.confirmDacAsProducer(plot.farm, sent.id);
    expect(producerConfirmed.status).toBe("PENDING_ISSUER_CONFIRMATION");
    const executed = await service.confirmDacAsIssuer(plot.issuer, producerConfirmed.id);
    expect(executed.status).toBe("EXECUTED");
    expect(executed.executedTermsHash).toBe(drafted.currentTermsHash);
    expect(executed.executedTermsSnapshot).toMatchObject({
      producerOrganizationId: farm1.id,
      issuerOrganizationId: issuerOrg.id,
      contractedVolumeTonnes: 280,
      deliveryLocation: "Astana elevator",
    });

    const submitted = await service.submitDacToRegistrar(plot.reviewer, executed.id);
    const reviewing = await service.startRegistrarReview(plot.registrar, submitted.id);
    const accepted = await service.acceptDacIntake(plot.registrar, reviewing.id, "QA B.2 intake complete.");
    expect(accepted.status).toBe("REGISTRAR_ACCEPTED");
    expect(accepted).not.toHaveProperty("poolId");
    expect(accepted).not.toHaveProperty("tokenId");

    const bundle = await service.getDacBundle(plot.registrar, accepted.publicId);
    const acceptEvent = bundle.events.find((event) => event.eventType === "dac_accepted");
    expect(acceptEvent?.metadata).toMatchObject({
      createdPool: false,
      createdToken: false,
      createdIssuance: false,
      createdPlacement: false,
      chainWrite: false,
    });

    const issuerBlob = await service.authorizedBlob(
      plot.issuer,
      plot.extract.bucket,
      plot.extract.objectPath,
    );
    expect(issuerBlob?.bytes.byteLength).toBeGreaterThan(0);
    expect(await service.isObjectPublic(plot.extract.bucket, plot.extract.objectPath)).toBe(false);
  }, 90_000);

  it("allows only one of two concurrent producer confirms on postgres", async () => {
    const client = createServiceRoleClient();
    expect(client).toBeTruthy();
    const store = new PostgresOriginationStore(client!);
    const service = new OriginationService(store);
    const stamp = `${Date.now().toString(36)}c`;
    const plot = await openVerifiedQaPlot(service, stamp);
    const opened = await service.createDacFromVerifiedCase(plot.reviewer, plot.verificationCase.id);
    const drafted = await service.updateDacDraft(
      plot.reviewer,
      opened.id,
      {
        crop: "Wheat",
        harvestYear: 2027,
        contractedVolumeTonnes: 260,
        qualityClass: "Class 3",
        producerReference: plot.field.publicId,
        deliveryStartDate: "2027-08-01",
        deliveryEndDate: "2027-09-30",
        deliveryLocation: "Astana elevator",
        scasNotes: "QA B.2 concurrent confirm.",
        issuerOrganizationId: issuerOrg.id,
      },
      opened.currentTermsHash,
    );
    const sent = await service.sendDacToProducer(plot.reviewer, drafted.id, drafted.currentTermsHash);
    const results = await Promise.allSettled([
      service.confirmDacAsProducer(plot.farm, sent.id),
      service.confirmDacAsProducer(plot.farm, sent.id),
    ]);
    const fulfilled = results.filter((item) => item.status === "fulfilled");
    const rejected = results.filter((item) => item.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: "invalid_state" });
  }, 90_000);
});
