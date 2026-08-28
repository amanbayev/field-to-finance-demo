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
    expect(visibleNavKeys(actor)).toEqual([
      "dashboard",
      "users",
      "organizations",
      "access",
      "roleRequests",
      "demoPersonas",
      "adminAudit",
      "system",
    ]);
  });

  it("farmer nav is producer-scoped", () => {
    expect(keysOf("DEMO-FARM-001")).toEqual([
      "dashboard",
      "myFields",
      "myContracts",
      "monitoring",
      "documents",
      "finance",
    ]);
    expect(hrefsOf("DEMO-FARM-001")).toEqual([
      "/",
      "/fields",
      "/contracts",
      "/monitoring",
      "/documents",
      "/finance",
    ]);
    expect(hrefsOf("DEMO-FARM-001")).not.toContain("/pools");
    expect(hrefsOf("DEMO-FARM-001")).not.toContain("/regulator");
  });

  it("SCAS nav uses dedicated monitoring and coverage", () => {
    expect(keysOf("DEMO-SCAS-001")).toEqual([
      "dashboard",
      "verification",
      "scasDacs",
      "attestation",
      "matching",
      "scasMonitoring",
      "contracts",
      "pools",
      "coverage",
    ]);
    expect(hrefsOf("DEMO-SCAS-001")).toContain("/scas/verification");
    expect(hrefsOf("DEMO-SCAS-001")).toContain("/scas/dacs");
    expect(hrefsOf("DEMO-SCAS-001")).toContain("/scas/monitoring");
    expect(hrefsOf("DEMO-SCAS-001")).toContain("/coverage");
    expect(hrefsOf("DEMO-SCAS-001")).not.toContain("/pools/POOL-WHEAT-2027-01");
  });

  it("issuer nav points instrument and issuance to distinct routes", () => {
    expect(keysOf("DEMO-ISSUER-001")).toEqual([
      "dashboard",
      "contracts",
      "pools",
      "coverage",
      "wheat2027",
      "iss001",
      "primaryPlacements",
    ]);
    expect(hrefsOf("DEMO-ISSUER-001")).toContain("/instruments/WHEAT-2027");
    expect(hrefsOf("DEMO-ISSUER-001")).toContain("/issuances/ISS-001");
    expect(hrefsOf("DEMO-ISSUER-001")).toContain("/placements");
    expect(hrefsOf("DEMO-ISSUER-001")).not.toContain("/ownership");
    expect(hrefsOf("DEMO-ISSUER-001")).not.toContain("/markets");
  });

  it("registrar nav is registry-scoped", () => {
    expect(keysOf("DEMO-REGISTRAR-001")).toEqual([
      "dashboard",
      "markets",
      "backing",
      "tokens",
      "issuance",
      "placements",
      "registrarIntake",
      "registry",
      "clearing",
      "audit",
    ]);
    expect(hrefsOf("DEMO-REGISTRAR-001")).toEqual([
      "/",
      "/markets",
      "/backing",
      "/tokens",
      "/issuances",
      "/placements",
      "/registrar/intake",
      "/registry",
      "/clearing",
      "/audit",
    ]);
  });

  it("investor nav drops duplicate market items", () => {
    expect(keysOf("DEMO-FUND-001")).toEqual([
      "dashboard",
      "markets",
      "instruments",
      "portfolio",
      "placementsOwn",
      "secondary",
      "myCompliance",
    ]);
    expect(hrefsOf("DEMO-FUND-001")).not.toContain("/market");
    expect(hrefsOf("DEMO-FUND-001")).toContain("/instruments");
    expect(hrefsOf("DEMO-FUND-001")).toContain("/placements");
    expect(hrefsOf("DEMO-FUND-001")).toContain("/markets");
    expect(hrefsOf("DEMO-FUND-001")).toContain("/secondary");
  });

  it("trader nav is overview, instruments and closed secondary market", () => {
    expect(keysOf("DEMO-TRADER-001")).toEqual([
      "dashboard",
      "markets",
      "traderInstruments",
      "secondary",
    ]);
    expect(hrefsOf("DEMO-TRADER-001")).toEqual([
      "/",
      "/markets",
      "/instruments",
      "/secondary",
    ]);
  });

  it("compliance nav splits checks from the overview", () => {
    expect(keysOf("DEMO-COMPLIANCE-001")).toEqual([
      "dashboard",
      "complianceParticipants",
      "checks",
      "eligibility",
      "alerts",
    ]);
    expect(hrefsOf("DEMO-COMPLIANCE-001")).toEqual([
      "/",
      "/compliance",
      "/compliance/checks",
      "/compliance/eligibility",
      "/compliance/alerts",
    ]);
  });

  it("regulator nav is platform infrastructure, not agriculture modules", () => {
    expect(keysOf("DEMO-REGULATOR-001")).toEqual([
      "dashboard",
      "markets",
      "instruments",
      "issuance",
      "clearing",
      "registry",
      "participants",
      "compliance",
      "supervision",
      "reports",
    ]);
    expect(hrefsOf("DEMO-REGULATOR-001")).toEqual([
      "/",
      "/markets",
      "/instruments",
      "/issuances",
      "/clearing",
      "/registry",
      "/participants",
      "/compliance",
      "/supervision",
      "/audit",
    ]);
    expect(hrefsOf("DEMO-REGULATOR-001")).not.toContain("/regulator");
    expect(hrefsOf("DEMO-REGULATOR-001")).not.toContain("/contracts");
    expect(hrefsOf("DEMO-REGULATOR-001")).not.toContain("/pools");
    expect(hrefsOf("DEMO-REGULATOR-001")).not.toContain("/coverage");
    expect(hrefsOf("DEMO-REGULATOR-001")).not.toContain("/admin");
  });

  it("admin persona stays on the system workspace", () => {
    expect(keysOf("DEMO-ADMIN-001")).toEqual([
      "dashboard",
      "users",
      "organizations",
      "access",
      "roleRequests",
      "demoPersonas",
      "adminAudit",
      "system",
    ]);
    expect(hrefsOf("DEMO-ADMIN-001")).not.toContain("/fields");
    expect(hrefsOf("DEMO-ADMIN-001")).not.toContain("/coverage");
  });
});
