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

loadLocalEnv();

const farm1 = DEMO_ORGANIZATIONS.find((item) => item.slug === "akmola-agro")!;
const farm2 = DEMO_ORGANIZATIONS.find((item) => item.slug === "steppe-grain")!;
const scasOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "scas")!;
const issuerOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "agro-issuer")!;
const registrarOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "agricultural-registrar")!;
const platform = DEMO_ORGANIZATIONS.find((item) => item.slug === "field-to-finance")!;
const live = Boolean(
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

describe.skipIf(!live)("origination O1.1 live postgres", () => {
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
});
