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
import { navGroupsForActor, visibleNavHrefs, visibleNavKeys } from "@/lib/auth/nav";

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

function groupsOf(personaId: string) {
  return navGroupsForActor(asPersona(personaId));
}

function platformHrefs(personaId: string) {
  return groupsOf(personaId)
    .filter((group) => !group.protocolId)
    .flatMap((group) => group.items.map((item) => item.href));
}

function protocolHrefs(personaId: string, protocolId: string) {
  return groupsOf(personaId)
    .filter((group) => group.protocolId === protocolId)
    .flatMap((group) => group.items.map((item) => item.href));
}

/** Agriculture routes that must never appear as global platform destinations. */
const AGRICULTURE_PATHS = [
  "/fields",
  "/contracts",
  "/pools",
  "/coverage",
  "/backing",
  "/monitoring",
  "/documents",
  "/finance",
  "/scas",
  "/scas/verification",
  "/scas/dacs",
  "/scas/matching",
  "/scas/monitoring",
  "/issuer/dacs",
  "/registrar/intake",
];

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

  it("contains the producer workflow inside Field to Finance context", () => {
    // The producer keeps every destination their workflow needs, but those
    // destinations are no longer global platform items.
    expect(platformHrefs("DEMO-FARM-001")).toEqual(["/"]);
    expect(protocolHrefs("DEMO-FARM-001", "F2F")).toEqual([
      "/fields",
      "/contracts",
      "/monitoring",
      "/documents",
      "/finance",
    ]);
    expect(hrefsOf("DEMO-FARM-001")).not.toContain("/regulator");
  });

  it("contains SCAS verification inside Field to Finance context", () => {
    expect(platformHrefs("DEMO-SCAS-001")).toEqual(["/", "/instruments"]);
    expect(protocolHrefs("DEMO-SCAS-001", "F2F")).toEqual([
      "/contracts",
      "/scas/verification",
      "/scas/dacs",
      "/scas",
      "/scas/matching",
      "/scas/monitoring",
      "/pools",
      "/coverage",
    ]);
  });

  it("gives the issuer platform market access plus F2F origination", () => {
    expect(platformHrefs("DEMO-ISSUER-001")).toEqual([
      "/",
      "/protocols",
      "/markets",
      "/instruments",
      "/secondary",
      "/placements",
    ]);
    expect(protocolHrefs("DEMO-ISSUER-001", "F2F")).toEqual([
      "/contracts",
      "/pools",
      "/coverage",
      "/issuer/dacs",
    ]);
  });

  it("keeps registrar platform duties global and F2F intake contained", () => {
    expect(platformHrefs("DEMO-REGISTRAR-001")).toEqual([
      "/",
      "/protocols",
      "/markets",
      "/instruments",
      "/issuances",
      "/secondary",
      "/placements",
      "/clearing",
      "/registry",
      "/audit",
      "/tokens",
    ]);
    expect(protocolHrefs("DEMO-REGISTRAR-001", "F2F")).toEqual([
      "/backing",
      "/registrar/intake",
    ]);
  });

  it("gives investors and traders platform-only navigation", () => {
    expect(platformHrefs("DEMO-FUND-001")).toEqual([
      "/",
      "/protocols",
      "/markets",
      "/instruments",
      "/secondary",
      "/portfolio",
      "/placements",
      "/compliance",
    ]);
    expect(protocolHrefs("DEMO-FUND-001", "F2F")).toEqual([]);
    expect(platformHrefs("DEMO-TRADER-001")).toEqual([
      "/",
      "/protocols",
      "/markets",
      "/instruments",
      "/secondary",
    ]);
    expect(protocolHrefs("DEMO-TRADER-001", "F2F")).toEqual([]);
  });

  it("compliance nav splits checks from the overview", () => {
    expect(keysOf("DEMO-COMPLIANCE-001")).toEqual([
      "dashboard",
      "complianceParticipants",
      "checks",
      "eligibility",
      "alerts",
    ]);
    expect(protocolHrefs("DEMO-COMPLIANCE-001", "F2F")).toEqual([]);
  });

  it("regulator nav is platform infrastructure, not agriculture modules", () => {
    expect(platformHrefs("DEMO-REGULATOR-001")).toEqual([
      "/",
      "/protocols",
      "/markets",
      "/instruments",
      "/issuances",
      "/secondary",
      "/clearing",
      "/registry",
      "/participants",
      "/compliance",
      "/supervision",
      "/audit",
    ]);
    expect(protocolHrefs("DEMO-REGULATOR-001", "F2F")).toEqual([]);
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
    expect(protocolHrefs("DEMO-ADMIN-001", "F2F")).toEqual([]);
  });

  it("never shows an agriculture module as a global platform destination", () => {
    for (const personaId of [
      "DEMO-FARM-001",
      "DEMO-SCAS-001",
      "DEMO-ISSUER-001",
      "DEMO-REGISTRAR-001",
      "DEMO-FUND-001",
      "DEMO-TRADER-001",
      "DEMO-COMPLIANCE-001",
      "DEMO-REGULATOR-001",
      "DEMO-ADMIN-001",
    ]) {
      for (const path of AGRICULTURE_PATHS) {
        expect(platformHrefs(personaId), `${personaId} ${path}`).not.toContain(path);
      }
    }
  });
});
