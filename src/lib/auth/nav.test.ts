import { describe, expect, it } from "vitest";
import {
  buildPrincipal,
  resolveActorContext,
  type MembershipRecord,
} from "@/domain/identity";
import {
  DEMO_ORGANIZATIONS,
  demoPersonaById,
  organizationById,
} from "@/data/identity/demo-catalog";
import { visibleNavHrefs, visibleNavKeys } from "@/lib/auth/nav";

const platform = DEMO_ORGANIZATIONS.find((o) => o.slug === "field-to-finance")!;

function membership(
  overrides: Partial<MembershipRecord> & Pick<MembershipRecord, "organizationId" | "roleIds">,
): MembershipRecord {
  return {
    id: overrides.id ?? "mem-1",
    userId: overrides.userId ?? "admin-1",
    status: overrides.status ?? "ACTIVE",
    organizationId: overrides.organizationId,
    roleIds: overrides.roleIds,
  };
}

function adminPrincipal() {
  return buildPrincipal({
    userId: "admin-1",
    email: "admin@example.com",
    displayName: "amanbayev",
    status: "ACTIVE",
    organizations: [platform],
    memberships: [
      membership({
        userId: "admin-1",
        organizationId: platform.id,
        roleIds: ["SYSTEM_ADMIN"],
      }),
    ],
  });
}

function asPersona(personaId: string) {
  const persona = demoPersonaById(personaId);
  if (!persona) {
    throw new Error(`missing ${personaId}`);
  }
  const organization = organizationById(persona.organizationId);
  if (!organization) {
    throw new Error(`missing org for ${personaId}`);
  }
  return resolveActorContext({
    principal: adminPrincipal(),
    session: {
      principalUserId: "admin-1",
      effectiveDemoPersonaId: personaId,
    },
    persona,
    personaOrganization: organization,
  });
}

function keysOf(personaId: string) {
  return visibleNavKeys(asPersona(personaId));
}

function hrefsOf(personaId: string) {
  return visibleNavHrefs(asPersona(personaId));
}

describe("effective navigation", () => {
  it("hides operational routes from the SYSTEM_ADMIN principal", () => {
    const actor = resolveActorContext({
      principal: adminPrincipal(),
      session: null,
      persona: undefined,
      personaOrganization: undefined,
    });
    const keys = visibleNavKeys(actor);
    expect(keys).toEqual([
      "dashboard",
      "users",
      "organizations",
      "memberships",
      "roleRequests",
      "demoPersonas",
      "adminAudit",
      "system",
    ]);
    expect(keys).not.toContain("regulator");
    expect(keys).not.toContain("attestation");
    expect(keys).not.toContain("portfolio");
    expect(visibleNavHrefs(actor)).not.toContain("/regulator");
  });

  it("farmer nav is producer-scoped and hides control planes", () => {
    expect(keysOf("DEMO-FARM-001")).toEqual([
      "dashboard",
      "myFields",
      "myContracts",
      "monitoring",
      "documentsStatus",
      "finance",
    ]);
    expect(hrefsOf("DEMO-FARM-001")).not.toContain("/regulator");
    expect(hrefsOf("DEMO-FARM-001")).not.toContain("/admin");
    expect(hrefsOf("DEMO-FARM-001")).not.toContain("/scas");
    expect(keysOf("DEMO-FARM-001")).not.toContain("system");
  });

  it("SCAS nav includes attestation and matching, not admin", () => {
    expect(keysOf("DEMO-SCAS-001")).toEqual([
      "dashboard",
      "attestation",
      "matching",
      "contracts",
      "scasMonitoring",
      "pools",
      "coverage",
    ]);
    expect(hrefsOf("DEMO-SCAS-001")).not.toContain("/admin");
    expect(hrefsOf("DEMO-SCAS-001")).not.toContain("/regulator");
  });

  it("issuer nav includes issuance context without regulator or admin", () => {
    expect(keysOf("DEMO-ISSUER-001")).toEqual([
      "dashboard",
      "contracts",
      "pools",
      "coverage",
      "wheat2027",
      "iss001",
      "placements",
    ]);
    expect(keysOf("DEMO-ISSUER-001")).not.toContain("attestation");
    expect(keysOf("DEMO-ISSUER-001")).not.toContain("regulator");
    expect(keysOf("DEMO-ISSUER-001")).not.toContain("system");
  });

  it("registrar nav includes holdings and audit, not SCAS attestation", () => {
    expect(keysOf("DEMO-REGISTRAR-001")).toEqual([
      "dashboard",
      "contracts",
      "pools",
      "coverage",
      "tokens",
      "issuance",
      "placements",
      "holdingsRegistry",
      "audit",
    ]);
    expect(keysOf("DEMO-REGISTRAR-001")).not.toContain("attestation");
    expect(keysOf("DEMO-REGISTRAR-001")).not.toContain("matching");
    expect(keysOf("DEMO-REGISTRAR-001")).not.toContain("system");
    expect(keysOf("DEMO-REGISTRAR-001")).not.toContain("regulator");
  });

  it("investor nav includes portfolio and hides other planes", () => {
    expect(keysOf("DEMO-FUND-001")).toEqual([
      "dashboard",
      "instruments",
      "myOrders",
      "portfolio",
      "placementsOwn",
      "myCompliance",
    ]);
    expect(hrefsOf("DEMO-FUND-001")).not.toContain("/admin");
    expect(hrefsOf("DEMO-FUND-001")).not.toContain("/scas");
    expect(hrefsOf("DEMO-FUND-001")).not.toContain("/regulator");
  });

  it("trader nav stays on the closed secondary market", () => {
    expect(keysOf("DEMO-TRADER-001")).toEqual([
      "dashboard",
      "traderInstruments",
      "positions",
      "orders",
      "secondaryClosed",
    ]);
    expect(hrefsOf("DEMO-TRADER-001")).not.toContain("/admin");
    expect(hrefsOf("DEMO-TRADER-001")).not.toContain("/portfolio");
  });

  it("compliance nav is KYC/KYB scoped without mint or admin", () => {
    expect(keysOf("DEMO-COMPLIANCE-001")).toEqual([
      "dashboard",
      "participants",
      "kycKyb",
      "sanctions",
      "kytAlerts",
      "eligibility",
      "walletOwnership",
    ]);
    expect(hrefsOf("DEMO-COMPLIANCE-001")).not.toContain("/scas");
    expect(hrefsOf("DEMO-COMPLIANCE-001")).not.toContain("/admin");
    expect(hrefsOf("DEMO-COMPLIANCE-001")).not.toContain("/tokens");
  });

  it("regulator nav is supervisory and hides admin and SCAS write", () => {
    expect(keysOf("DEMO-REGULATOR-001")).toEqual([
      "dashboard",
      "regulator",
      "participants",
      "contracts",
      "pools",
      "coverage",
      "tokens",
      "placements",
      "compliance",
      "audit",
    ]);
    expect(keysOf("DEMO-REGULATOR-001")).not.toContain("attestation");
    expect(keysOf("DEMO-REGULATOR-001")).not.toContain("matching");
    expect(keysOf("DEMO-REGULATOR-001")).not.toContain("system");
    expect(hrefsOf("DEMO-REGULATOR-001")).not.toContain("/admin");
    expect(hrefsOf("DEMO-REGULATOR-001")).not.toContain("/scas");
  });

  it("does not grey-out forbidden hrefs — they are omitted", () => {
    expect(hrefsOf("DEMO-FARM-001")).not.toContain("/regulator");
    expect(hrefsOf("DEMO-FARM-001")).not.toContain("/admin");
    expect(hrefsOf("DEMO-FUND-001")).not.toContain("/admin");
    expect(hrefsOf("DEMO-REGULATOR-001")).not.toContain("/admin");
  });
});
