import { describe, expect, it } from "vitest";
import {
  assertAssignableRole,
  assumeDemoPersona,
  AuthorizationError,
  buildPrincipal,
  canReadInvestorPortfolio,
  canReadProducerRecord,
  cannotSelfAssignPrivileged,
  isOwnProducerWorkspace,
  exitDemoPersona,
  principalMayAssumePersonas,
  resolveActorContext,
  roleFromOnboardingIntent,
  visibleProducerIds,
  type MembershipRecord,
  type OrganizationRecord,
} from "@/domain/identity";
import {
  DEMO_ORGANIZATIONS,
  demoPersonaById,
} from "@/data/identity/demo-catalog";

const platform = DEMO_ORGANIZATIONS.find((o) => o.slug === "field-to-finance")!;
const farm1 = DEMO_ORGANIZATIONS.find((o) => o.slug === "akmola-agro")!;
const farm2 = DEMO_ORGANIZATIONS.find((o) => o.slug === "steppe-grain")!;
const fund = DEMO_ORGANIZATIONS.find((o) => o.slug === "steppe-capital")!;
const regulatorOrg = DEMO_ORGANIZATIONS.find((o) => o.slug === "regulator")!;
const scasOrg = DEMO_ORGANIZATIONS.find((o) => o.slug === "scas")!;
const registrarOrg = DEMO_ORGANIZATIONS.find((o) => o.slug === "agricultural-registrar")!;

function membership(overrides: Partial<MembershipRecord> & Pick<MembershipRecord, "organizationId" | "roleIds">): MembershipRecord {
  return {
    id: overrides.id ?? "mem-1",
    userId: overrides.userId ?? "user-1",
    status: overrides.status ?? "ACTIVE",
    organizationId: overrides.organizationId,
    roleIds: overrides.roleIds,
  };
}

function adminPrincipal() {
  return buildPrincipal({
    userId: "admin-1",
    email: "admin@example.com",
    displayName: "Talgat A.",
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

function producerPrincipal(org: OrganizationRecord, userId = "prod-1") {
  return buildPrincipal({
    userId,
    email: `${userId}@example.com`,
    displayName: org.name,
    status: "ACTIVE",
    organizations: [org],
    memberships: [
      membership({
        userId,
        organizationId: org.id,
        roleIds: ["PRODUCER_ADMIN"],
      }),
    ],
  });
}

function investorPrincipal() {
  return buildPrincipal({
    userId: "inv-1",
    email: "fund@example.com",
    displayName: "Steppe Capital",
    status: "ACTIVE",
    organizations: [fund],
    memberships: [
      membership({
        userId: "inv-1",
        organizationId: fund.id,
        roleIds: ["INVESTOR"],
      }),
    ],
  });
}

function regulatorPrincipal() {
  return buildPrincipal({
    userId: "reg-1",
    email: "regulator@example.com",
    displayName: "Regulator",
    status: "ACTIVE",
    organizations: [regulatorOrg],
    memberships: [
      membership({
        userId: "reg-1",
        organizationId: regulatorOrg.id,
        roleIds: ["REGULATOR"],
      }),
    ],
  });
}

describe("authentication guards (pure)", () => {
  it("rejects unauthenticated access via missing principal", () => {
    expect(() =>
      buildPrincipal({
        userId: "x",
        email: null,
        displayName: "x",
        status: "SUSPENDED",
        organizations: [],
        memberships: [],
      }),
    ).toThrow(AuthorizationError);
  });

  it("allows authenticated admin access to admin permissions", () => {
    const admin = adminPrincipal();
    expect(admin.permissions).toContain("admin.access");
    expect(admin.permissions).toContain("admin.users");
  });
});

describe("role matrix", () => {
  it("producer cannot access regulator or admin", () => {
    const producer = producerPrincipal(farm1);
    expect(producer.permissions).not.toContain("regulator.read");
    expect(producer.permissions).not.toContain("admin.access");
  });

  it("investor cannot access admin", () => {
    expect(investorPrincipal().permissions).not.toContain("admin.access");
  });

  it("regulator cannot access admin", () => {
    expect(regulatorPrincipal().permissions).not.toContain("admin.access");
  });

  it("system admin can access admin", () => {
    expect(adminPrincipal().permissions).toContain("admin.access");
  });
});

describe("producer data isolation", () => {
  it("producer 1 cannot read producer 2 private record", () => {
    const context = resolveActorContext({
      principal: producerPrincipal(farm1),
      session: null,
      persona: undefined,
      personaOrganization: undefined,
    });
    expect(canReadProducerRecord(context, "prd-akmola-agro")).toBe(true);
    expect(canReadProducerRecord(context, "prd-kostanay-grain")).toBe(false);
    expect(visibleProducerIds(context)).toEqual(["prd-akmola-agro"]);
    expect(isOwnProducerWorkspace(context)).toBe(true);
  });

  it("SYSTEM_ADMIN is not a producer-own workspace", () => {
    const context = resolveActorContext({
      principal: adminPrincipal(),
      session: null,
      persona: undefined,
      personaOrganization: undefined,
    });
    expect(isOwnProducerWorkspace(context)).toBe(false);
  });

  it("SCAS can read permitted producer operational data", () => {
    const principal = buildPrincipal({
      userId: "scas-1",
      email: "scas@example.com",
      displayName: "SCAS",
      status: "ACTIVE",
      organizations: [scasOrg],
      memberships: [
        membership({
          userId: "scas-1",
          organizationId: scasOrg.id,
          roleIds: ["SCAS_OPERATOR"],
        }),
      ],
    });
    const context = resolveActorContext({
      principal,
      session: null,
      persona: undefined,
      personaOrganization: undefined,
    });
    expect(context.effective.permissions).toContain("scas.read");
    expect(canReadProducerRecord(context, "prd-akmola-agro")).toBe(true);
    expect(canReadProducerRecord(context, "prd-kostanay-grain")).toBe(true);
  });

  it("regulator can read supervisory data", () => {
    const context = resolveActorContext({
      principal: regulatorPrincipal(),
      session: null,
      persona: undefined,
      personaOrganization: undefined,
    });
    expect(context.effective.permissions).toContain("regulator.read");
    expect(visibleProducerIds(context)).toBe("all");
  });
});

describe("investor portfolio scoping", () => {
  it("investor sees only own portfolio", () => {
    const context = resolveActorContext({
      principal: investorPrincipal(),
      session: null,
      persona: undefined,
      personaOrganization: undefined,
    });
    expect(canReadInvestorPortfolio(context, "INVESTOR-0001")).toBe(true);
    expect(canReadInvestorPortfolio(context, "INVESTOR-9999")).toBe(false);
  });
});

describe("privileged self-assignment", () => {
  it("blocks privileged role self-assignment", () => {
    expect(cannotSelfAssignPrivileged("SYSTEM_ADMIN", false)).toBe(true);
    expect(cannotSelfAssignPrivileged("REGULATOR", false)).toBe(true);
    expect(cannotSelfAssignPrivileged("INVESTOR", false)).toBe(false);
    expect(() =>
      assertAssignableRole("REGISTRAR_OPERATOR", { allowPrivileged: false }),
    ).toThrow("privileged_role_forbidden");
    expect(roleFromOnboardingIntent("PRODUCER")).toBe("PRODUCER_ADMIN");
  });
});

describe("suspended membership / organization", () => {
  it("rejects suspended membership", () => {
    expect(() =>
      buildPrincipal({
        userId: "p1",
        email: "p@example.com",
        displayName: "P",
        status: "ACTIVE",
        organizations: [farm1],
        memberships: [
          membership({
            organizationId: farm1.id,
            roleIds: ["PRODUCER_ADMIN"],
            status: "SUSPENDED",
          }),
        ],
        activeOrganizationId: farm1.id,
      }),
    ).toThrowError(/suspended_membership/);
  });

  it("rejects inactive organization", () => {
    const suspended: OrganizationRecord = { ...farm1, status: "SUSPENDED" };
    expect(() =>
      buildPrincipal({
        userId: "p1",
        email: "p@example.com",
        displayName: "P",
        status: "ACTIVE",
        organizations: [suspended],
        memberships: [
          membership({
            organizationId: suspended.id,
            roleIds: ["PRODUCER_ADMIN"],
          }),
        ],
      }),
    ).toThrowError(/suspended_organization/);
  });
});

describe("demo personas", () => {
  it("normal user cannot switch demo persona", () => {
    const producer = producerPrincipal(farm1);
    expect(principalMayAssumePersonas(producer)).toBe(false);
    expect(() =>
      assumeDemoPersona({
        principal: producer,
        persona: demoPersonaById("DEMO-REGULATOR-001"),
        organization: regulatorOrg,
      }),
    ).toThrow(AuthorizationError);
  });

  it("SYSTEM_ADMIN can switch persona", () => {
    const assumed = assumeDemoPersona({
      principal: adminPrincipal(),
      persona: demoPersonaById("DEMO-REGULATOR-001"),
      organization: regulatorOrg,
    });
    expect(assumed.effective.roleId).toBe("REGULATOR");
    expect(assumed.effective.permissions).toContain("regulator.read");
  });

  it("switch to producer restricts data", () => {
    const assumed = assumeDemoPersona({
      principal: adminPrincipal(),
      persona: demoPersonaById("DEMO-FARM-001"),
      organization: farm1,
    });
    const context = resolveActorContext({
      principal: adminPrincipal(),
      session: {
        principalUserId: "admin-1",
        effectiveDemoPersonaId: "DEMO-FARM-001",
      },
      persona: demoPersonaById("DEMO-FARM-001"),
      personaOrganization: farm1,
    });
    expect(assumed.effective.producerIds).toEqual(["prd-akmola-agro"]);
    expect(canReadProducerRecord(context, "prd-kostanay-grain")).toBe(false);
    expect(context.effective.permissions).not.toContain("regulator.read");
  });

  it("switch to SCAS grants SCAS routes only through permissions", () => {
    const context = resolveActorContext({
      principal: adminPrincipal(),
      session: {
        principalUserId: "admin-1",
        effectiveDemoPersonaId: "DEMO-SCAS-001",
      },
      persona: demoPersonaById("DEMO-SCAS-001"),
      personaOrganization: scasOrg,
    });
    expect(context.effective.permissions).toContain("scas.read");
    expect(context.effective.permissions).not.toContain("admin.access");
    expect(principalMayAssumePersonas(context.principal)).toBe(true);
  });

  it("demo producer does not receive admin permission while principal retains it", () => {
    const context = resolveActorContext({
      principal: adminPrincipal(),
      session: {
        principalUserId: "admin-1",
        effectiveDemoPersonaId: "DEMO-FARM-001",
      },
      persona: demoPersonaById("DEMO-FARM-001"),
      personaOrganization: farm1,
    });
    expect(context.isImpersonating).toBe(true);
    expect(context.effective.permissions).not.toContain("admin.access");
    expect(context.principal.permissions).toContain("admin.access");
  });

  it("switch to investor exposes INVESTOR-0001 portfolio", () => {
    const context = resolveActorContext({
      principal: adminPrincipal(),
      session: {
        principalUserId: "admin-1",
        effectiveDemoPersonaId: "DEMO-FUND-001",
      },
      persona: demoPersonaById("DEMO-FUND-001"),
      personaOrganization: fund,
    });
    expect(context.effective.investorReference).toBe("INVESTOR-0001");
    expect(canReadInvestorPortfolio(context, "INVESTOR-0001")).toBe(true);
    expect(context.effective.investorAta).toBe(
      "D7dNbub9wmETEkDoS7b73KpVxTwRb26Cbe9ffRptVUDw",
    );
  });

  it("switching persona does not imply blockchain mutation", () => {
    const before = demoPersonaById("DEMO-FUND-001");
    assumeDemoPersona({
      principal: adminPrincipal(),
      persona: before,
      organization: fund,
    });
    expect(demoPersonaById("DEMO-FUND-001")?.investorAta).toBe(before?.investorAta);
  });

  it("exit persona restores admin context", () => {
    const restored = exitDemoPersona(adminPrincipal());
    expect(restored.isImpersonating).toBe(false);
    expect(restored.effective.permissions).toContain("admin.access");
    expect(restored.demoPersona).toBeNull();
  });

  it("forged persona cookie/session is ignored unless server session matches", () => {
    const context = resolveActorContext({
      principal: adminPrincipal(),
      session: { principalUserId: "admin-1", effectiveDemoPersonaId: null },
      persona: demoPersonaById("DEMO-REGULATOR-001"),
      personaOrganization: regulatorOrg,
      clientClaimedPersonaId: "DEMO-REGULATOR-001",
    });
    expect(context.isImpersonating).toBe(false);
    expect(context.effective.roleId).toBe("SYSTEM_ADMIN");
  });

  it("inactive persona cannot be assumed", () => {
    const persona = {
      ...demoPersonaById("DEMO-TRADER-002")!,
      status: "INACTIVE" as const,
    };
    expect(() =>
      assumeDemoPersona({
        principal: adminPrincipal(),
        persona,
        organization: DEMO_ORGANIZATIONS.find((o) => o.slug === "commodity-desk"),
      }),
    ).toThrowError(/inactive_persona/);
  });

  it("audit payload includes principal and effective actor", () => {
    const principal = adminPrincipal();
    const assumed = assumeDemoPersona({
      principal,
      persona: demoPersonaById("DEMO-REGISTRAR-001"),
      organization: registrarOrg,
    });
    const event = {
      kind: "DEMO_CONTEXT" as const,
      eventKey: "demo_persona_switched",
      principalUserId: principal.userId,
      fromPersonaId: "DEMO-ADMIN-001",
      toPersonaId: assumed.demoPersona.id,
      effectiveActorId: assumed.effective.personaId,
    };
    expect(event.principalUserId).toBe("admin-1");
    expect(event.toPersonaId).toBe("DEMO-REGISTRAR-001");
    expect(event.effectiveActorId).toBe("DEMO-REGISTRAR-001");
    expect(event.kind).not.toBe("BLOCKCHAIN");
  });
});

describe("multi-organization membership", () => {
  it("switches active organization among memberships", () => {
    const principal = buildPrincipal({
      userId: "multi-1",
      email: "multi@example.com",
      displayName: "Multi",
      status: "ACTIVE",
      organizations: [farm1, farm2],
      memberships: [
        membership({
          id: "m1",
          userId: "multi-1",
          organizationId: farm1.id,
          roleIds: ["PRODUCER_ADMIN"],
        }),
        membership({
          id: "m2",
          userId: "multi-1",
          organizationId: farm2.id,
          roleIds: ["PRODUCER_ADMIN"],
        }),
      ],
      activeOrganizationId: farm2.id,
    });
    expect(principal.organization?.id).toBe(farm2.id);
    expect(principal.organization?.externalProducerRef).toBe("PRODUCER-0002");
  });
});
