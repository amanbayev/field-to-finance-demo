import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PLATFORM_ROLES,
  permissionsForRole,
  type ActorContext,
} from "@/domain/identity";
import {
  DEMO_RESET_PERMISSION,
  demoResetRunId,
  type DemoResetManifest,
  type DemoResetRowCountSource,
} from "@/lib/demo-reset";
import {
  planDemoDatasetV2ResetDryRun,
  planDemoDatasetV2ResetDryRunForActor,
} from "@/services/demo-reset-service";

const APPROVED_REF = "examplerefabcdefghij";
const OBSERVED_AT = "2026-09-07T12:00:00.000Z";
const now = () => OBSERVED_AT;

/**
 * The declarations an operator must make for the approved demo environment.
 * They are stubbed rather than mocked because the service is the one module
 * that reads them, and reading them is part of what is under test.
 */
function declareApprovedEnvironment(
  overrides: Readonly<Record<string, string | undefined>> = {},
): void {
  const declarations: Record<string, string | undefined> = {
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "preview",
    NEXT_PUBLIC_APP_ENV: "demo",
    DEMO_RESET_ENVIRONMENT: "approved-demo-qa",
    DEMO_RESET_DATASET_ID: "demo-dataset-v2",
    DEMO_RESET_DATABASE_REF: APPROVED_REF,
    NEXT_PUBLIC_SUPABASE_URL: `https://${APPROVED_REF}.supabase.co`,
    ...overrides,
  };
  for (const [name, value] of Object.entries(declarations)) {
    vi.stubEnv(name, value);
  }
}

/**
 * A minimal `ActorContext` in the shape `requireActor()` produces. The
 * principal user id is the only identity input the composition has, which is
 * the point: there is no parameter through which a caller could supply one.
 */
function systemAdmin(userId: string): ActorContext {
  const permissions = permissionsForRole("SYSTEM_ADMIN");
  return {
    principal: {
      userId,
      email: null,
      displayName: "Operator",
      status: "ACTIVE",
      permissions,
      memberships: [],
      organizations: [],
      roleIds: ["SYSTEM_ADMIN"],
    },
    effective: {
      roleId: "SYSTEM_ADMIN",
      permissions,
      producerIds: [],
    },
    isImpersonating: false,
  };
}

/** A source that fails the test if the composition ever reaches the database. */
function forbiddenSource(): DemoResetRowCountSource & {
  countRows: ReturnType<typeof vi.fn>;
} {
  return {
    countRows: vi.fn(async () => {
      throw new Error("the composition queried the database on a denied path");
    }),
  };
}

const COUNTABLE_MANIFEST: DemoResetManifest = {
  datasetContract: "test-contract",
  categories: [
    {
      id: "environment-wide-tables",
      subsystem: "DATABASE",
      disposition: "PRESERVED",
      scopeBasis: "ENVIRONMENT_WIDE",
      objects: ["alpha"],
      note: "One countable object.",
    },
  ],
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("demo reset permission wiring", () => {
  it("is held by SYSTEM_ADMIN alone", () => {
    expect(permissionsForRole("SYSTEM_ADMIN")).toContain(DEMO_RESET_PERMISSION);
    for (const roleId of PLATFORM_ROLES.filter((id) => id !== "SYSTEM_ADMIN")) {
      expect(permissionsForRole(roleId)).not.toContain(DEMO_RESET_PERMISSION);
    }
  });
});

describe("demo reset dry-run composition on an allowed context", () => {
  it("plans over the inventory the reader observed for the actor's own run", async () => {
    declareApprovedEnvironment();
    const countRows = vi.fn(async () => ({ kind: "COUNTED" as const, rows: 9 }));

    const outcome = await planDemoDatasetV2ResetDryRunForActor(
      systemAdmin("operator-1"),
      { source: { countRows }, manifest: COUNTABLE_MANIFEST, now },
    );

    expect(outcome.kind).toBe("PLANNED");
    if (outcome.kind !== "PLANNED") return;

    // The run is the one derived for this principal in this context; nothing
    // was supplied by the caller.
    expect(outcome.runScope.runId).toBe(
      demoResetRunId({
        environmentName: "approved-demo-qa",
        datasetId: "demo-dataset-v2",
        databaseRef: APPROVED_REF,
        principalUserId: "operator-1",
      }),
    );
    expect(outcome.plan.runId).toBe(outcome.runScope.runId);

    // The planner reported the count the reader observed, so the read happened
    // before planning rather than inside it.
    expect(countRows).toHaveBeenCalledTimes(1);
    expect(countRows).toHaveBeenCalledWith("alpha");
    expect(outcome.objectsRead).toEqual(["alpha"]);
    expect(outcome.plan.inventorySource).toBe("OBSERVED");
    expect(outcome.plan.inventoryObservedAt).toBe(OBSERVED_AT);
    expect(outcome.plan.preserved).toEqual([
      expect.objectContaining({
        categoryId: "environment-wide-tables",
        rows: 9,
      }),
    ]);
    expect(outcome.plan.sideEffects).toBe("NONE");
  });

  it("accepts the actor's own run claim and derives the same run without one", async () => {
    declareApprovedEnvironment();
    const actor = systemAdmin("operator-1");

    const withoutClaim = await planDemoDatasetV2ResetDryRunForActor(actor, {
      now,
    });
    expect(withoutClaim.kind).toBe("PLANNED");
    if (withoutClaim.kind !== "PLANNED") return;

    const withClaim = await planDemoDatasetV2ResetDryRunForActor(actor, {
      claimedRunId: withoutClaim.runScope.runId,
      now,
    });
    expect(withClaim.kind).toBe("PLANNED");
    if (withClaim.kind !== "PLANNED") return;
    expect(withClaim.plan.planHash).toBe(withoutClaim.plan.planHash);
  });

  it("stays INCOMPLETE against the shipped manifest, never ready to execute", async () => {
    declareApprovedEnvironment();
    const outcome = await planDemoDatasetV2ResetDryRunForActor(
      systemAdmin("operator-1"),
      { now },
    );

    expect(outcome.kind).toBe("PLANNED");
    if (outcome.kind !== "PLANNED") return;
    // Run scope is now established, so that blocker is gone, but row-level run
    // ownership still is not, so the plan cannot become ready.
    expect(outcome.plan.status).toBe("INCOMPLETE");
    expect(outcome.plan.blockers).not.toContain("RUN_SCOPE_NOT_ESTABLISHED");
    expect(outcome.plan.blockers).toEqual(
      expect.arrayContaining([
        "CLEARED_SCOPE_NOT_RUN_OWNED",
        "PRESERVED_AND_CLEARED_OVERLAP",
        "INVENTORY_INCOMPLETE",
      ]),
    );
    expect(outcome.objectsRead).toEqual([]);
  });

  it("gives two actors two different runs in the same environment", async () => {
    declareApprovedEnvironment();
    const first = await planDemoDatasetV2ResetDryRunForActor(
      systemAdmin("operator-1"),
      { now },
    );
    const second = await planDemoDatasetV2ResetDryRunForActor(
      systemAdmin("operator-2"),
      { now },
    );

    expect(first.kind).toBe("PLANNED");
    expect(second.kind).toBe("PLANNED");
    if (first.kind !== "PLANNED" || second.kind !== "PLANNED") return;
    expect(first.runScope.runId).not.toBe(second.runScope.runId);
  });
});

describe("demo reset dry-run composition denies without reading or planning", () => {
  it("refuses another actor's run and never reaches the database", async () => {
    declareApprovedEnvironment();
    const source = forbiddenSource();

    // A valid identifier for a run that genuinely belongs to operator-2.
    const foreignRun = demoResetRunId({
      environmentName: "approved-demo-qa",
      datasetId: "demo-dataset-v2",
      databaseRef: APPROVED_REF,
      principalUserId: "operator-2",
    });

    const outcome = await planDemoDatasetV2ResetDryRunForActor(
      systemAdmin("operator-1"),
      { claimedRunId: foreignRun, source, manifest: COUNTABLE_MANIFEST, now },
    );

    expect(outcome.kind).toBe("DENIED");
    if (outcome.kind !== "DENIED") return;
    expect(outcome.runScope.refusal).toBe("RUN_NOT_OWNED_BY_ACTOR");
    expect(source.countRows).not.toHaveBeenCalled();
    // No plan is produced at all, so nothing about the other run is disclosed.
    expect(outcome).not.toHaveProperty("plan");
    expect(JSON.stringify(outcome)).not.toContain(foreignRun);
  });

  it("refuses production ahead of every other reason, without reading", async () => {
    declareApprovedEnvironment({ VERCEL_ENV: "production" });
    const source = forbiddenSource();

    const outcome = await planDemoDatasetV2ResetDryRunForActor(
      systemAdmin("operator-1"),
      { source, manifest: COUNTABLE_MANIFEST, now },
    );

    expect(outcome.kind).toBe("DENIED");
    if (outcome.kind !== "DENIED") return;
    expect(outcome.runScope.refusal).toBe("ENVIRONMENT_NOT_ELIGIBLE");
    expect(outcome.authorization.refusals).toContain(
      "PRODUCTION_ENVIRONMENT_DENIED",
    );
    expect(source.countRows).not.toHaveBeenCalled();
    expect(outcome).not.toHaveProperty("plan");
  });

  it("refuses an undeclared or unapproved environment, without reading", async () => {
    for (const overrides of [
      { DEMO_RESET_ENVIRONMENT: undefined },
      { DEMO_RESET_ENVIRONMENT: "some-other-environment" },
      { DEMO_RESET_DATASET_ID: undefined },
      { DEMO_RESET_DATABASE_REF: undefined },
      { DEMO_RESET_DATABASE_REF: "not-a-project-ref" },
      { NEXT_PUBLIC_SUPABASE_URL: "https://otherrefabcdefghijkl.supabase.co" },
      { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" },
      { NEXT_PUBLIC_APP_ENV: undefined },
    ]) {
      declareApprovedEnvironment(overrides);
      const source = forbiddenSource();

      const outcome = await planDemoDatasetV2ResetDryRunForActor(
        systemAdmin("operator-1"),
        { source, manifest: COUNTABLE_MANIFEST, now },
      );

      expect(outcome.kind, `${JSON.stringify(overrides)} must deny`).toBe(
        "DENIED",
      );
      expect(source.countRows).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    }
  });

  it("refuses an unauthorized, impersonating or design-preview actor", async () => {
    declareApprovedEnvironment();
    const operator = systemAdmin("operator-1");
    const investorPermissions = permissionsForRole("INVESTOR");

    for (const actor of [
      {
        ...operator,
        principal: { ...operator.principal, permissions: investorPermissions },
        effective: { ...operator.effective, permissions: investorPermissions },
      },
      { ...operator, isImpersonating: true },
      systemAdmin("design-preview-user"),
    ]) {
      const source = forbiddenSource();
      const outcome = await planDemoDatasetV2ResetDryRunForActor(actor, {
        source,
        manifest: COUNTABLE_MANIFEST,
        now,
      });

      expect(outcome.kind).toBe("DENIED");
      if (outcome.kind !== "DENIED") continue;
      expect(outcome.runScope.refusal).toBe("ACTOR_NOT_AUTHORIZED");
      expect(source.countRows).not.toHaveBeenCalled();
    }
  });

  it("refuses a malformed run claim, without reading", async () => {
    declareApprovedEnvironment();
    for (const claimedRunId of ["", "RUN-0001", 42, {}, ["run"], true]) {
      const source = forbiddenSource();
      const outcome = await planDemoDatasetV2ResetDryRunForActor(
        systemAdmin("operator-1"),
        { claimedRunId, source, manifest: COUNTABLE_MANIFEST, now },
      );

      expect(outcome.kind, `${String(claimedRunId)} must deny`).toBe("DENIED");
      if (outcome.kind !== "DENIED") continue;
      expect(outcome.runScope.refusal).toBe("RUN_CLAIM_MALFORMED");
      expect(source.countRows).not.toHaveBeenCalled();
    }
  });
});

describe("demo reset dry-run without a reader", () => {
  it("claims no run and observes nothing", () => {
    declareApprovedEnvironment();
    const plan = planDemoDatasetV2ResetDryRun(systemAdmin("operator-1"));

    expect(plan.runId).toBeNull();
    expect(plan.status).toBe("INCOMPLETE");
    expect(plan.blockers).toContain("RUN_SCOPE_NOT_ESTABLISHED");
    expect(plan.inventoryObservedAt).toBeNull();
    expect(plan.sideEffects).toBe("NONE");
  });
});
