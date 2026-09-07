import { describe, expect, it } from "vitest";
import { PERMISSIONS, permissionsForRole } from "@/domain/identity";
import {
  DEMO_RESET_PERMISSION,
  evaluateDemoResetActor,
  evaluateDemoResetDryRunPolicy,
  type DemoResetActorFacts,
} from "@/lib/demo-reset/policy";
import type { DemoResetEnvironmentSignals } from "@/lib/demo-reset/environment";

const APPROVED_REF = "examplerefabcdefghij";

const ELIGIBLE_SIGNALS: DemoResetEnvironmentSignals = {
  nodeEnv: "production",
  vercel: "1",
  vercelEnv: "preview",
  publicAppEnv: "demo",
  declaredEnvironment: "approved-demo-qa",
  declaredDatasetId: "demo-dataset-v2",
  declaredDatabaseRef: APPROVED_REF,
  observedSupabaseUrl: `https://${APPROVED_REF}.supabase.co`,
};

function authorizedActor(
  overrides: Partial<DemoResetActorFacts> = {},
): DemoResetActorFacts {
  return {
    principalUserId: "operator-1",
    effectiveHoldsPermission: true,
    principalHoldsPermission: true,
    isImpersonating: false,
    isDesignPreviewActor: false,
    ...overrides,
  };
}

describe("demo reset permission", () => {
  it("is a real platform permission", () => {
    expect(PERMISSIONS).toContain(DEMO_RESET_PERMISSION);
  });

  it("is held by SYSTEM_ADMIN and by no operational or trading role", () => {
    expect(permissionsForRole("SYSTEM_ADMIN")).toContain(DEMO_RESET_PERMISSION);
    for (const roleId of [
      "INVESTOR",
      "TRADER",
      "PRODUCER_ADMIN",
      "ISSUER_OPERATOR",
      "SCAS_OPERATOR",
      "REGISTRAR_OPERATOR",
      "COMPLIANCE_OFFICER",
      "REGULATOR",
    ] as const) {
      expect(
        permissionsForRole(roleId),
        `${roleId} must not hold ${DEMO_RESET_PERMISSION}`,
      ).not.toContain(DEMO_RESET_PERMISSION);
    }
  });

  it("does not give SYSTEM_ADMIN trading rights", () => {
    expect(permissionsForRole("SYSTEM_ADMIN")).not.toContain("market.trade");
  });
});

describe("demo reset actor authority", () => {
  it("allows an authorized, non-impersonating principal", () => {
    expect(evaluateDemoResetActor(authorizedActor())).toEqual([]);
  });

  it("refuses when the effective persona lacks the permission", () => {
    expect(
      evaluateDemoResetActor(
        authorizedActor({ effectiveHoldsPermission: false }),
      ),
    ).toContain("ACTOR_PERMISSION_MISSING");
  });

  it("refuses when the real principal lacks the permission", () => {
    expect(
      evaluateDemoResetActor(
        authorizedActor({ principalHoldsPermission: false }),
      ),
    ).toContain("PRINCIPAL_PERMISSION_MISSING");
  });

  it("refuses an impersonated actor even when both hold the permission", () => {
    expect(
      evaluateDemoResetActor(authorizedActor({ isImpersonating: true })),
    ).toContain("IMPERSONATED_ACTOR_DENIED");
  });

  it("refuses the design-preview actor, which has no real database authority", () => {
    expect(
      evaluateDemoResetActor(
        authorizedActor({
          principalUserId: "design-preview-user",
          isDesignPreviewActor: true,
        }),
      ),
    ).toContain("DESIGN_PREVIEW_ACTOR_DENIED");
  });
});

describe("demo reset dry-run policy", () => {
  it("allows only when both the environment and the actor pass", () => {
    const decision = evaluateDemoResetDryRunPolicy({
      signals: ELIGIBLE_SIGNALS,
      actor: authorizedActor(),
    });
    expect(decision.decision).toBe("ALLOWED");
    expect(decision.refusals).toEqual([]);
    expect(decision.environment.eligible).toBe(true);
  });

  it("denies production regardless of actor authority", () => {
    const decision = evaluateDemoResetDryRunPolicy({
      signals: { ...ELIGIBLE_SIGNALS, vercelEnv: "production" },
      actor: authorizedActor(),
    });
    expect(decision.decision).toBe("DENIED");
    expect(decision.refusals).toContain("PRODUCTION_ENVIRONMENT_DENIED");
  });

  it("denies an eligible environment when the actor is unauthorized", () => {
    const decision = evaluateDemoResetDryRunPolicy({
      signals: ELIGIBLE_SIGNALS,
      actor: authorizedActor({
        effectiveHoldsPermission: false,
        principalHoldsPermission: false,
      }),
    });
    expect(decision.decision).toBe("DENIED");
    expect(decision.refusals).toEqual(
      expect.arrayContaining([
        "ACTOR_PERMISSION_MISSING",
        "PRINCIPAL_PERMISSION_MISSING",
      ]),
    );
  });

  it("reports environment and actor refusals together", () => {
    const decision = evaluateDemoResetDryRunPolicy({
      signals: { ...ELIGIBLE_SIGNALS, declaredDatabaseRef: undefined },
      actor: authorizedActor({ isImpersonating: true }),
    });
    expect(decision.refusals).toEqual(
      expect.arrayContaining([
        "DATABASE_IDENTITY_NOT_DECLARED",
        "IMPERSONATED_ACTOR_DENIED",
      ]),
    );
  });

  it("keeps the principal user id for audit even when denied", () => {
    const decision = evaluateDemoResetDryRunPolicy({
      signals: {},
      actor: authorizedActor({ principalUserId: "operator-7" }),
    });
    expect(decision.decision).toBe("DENIED");
    expect(decision.principalUserId).toBe("operator-7");
  });
});
