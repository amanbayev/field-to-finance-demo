import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PLATFORM_ROLES,
  permissionsForRole,
  type ActorContext,
} from "@/domain/identity";
import {
  DEMO_RESET_PERMISSION,
  type DemoResetManifest,
  type DemoResetRowCountSource,
  type DemoResetRunInstance,
  type DemoResetRunLookup,
  type DemoResetRunStore,
} from "@/lib/demo-reset";
import {
  composeDemoResetDryRun,
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

function runInstance(
  overrides?: Partial<DemoResetRunInstance>,
): DemoResetRunInstance {
  return {
    runId: "run-a-0000000000000001",
    operatorPrincipalUserId: "operator-1",
    environmentName: "approved-demo-qa",
    datasetId: "demo-dataset-v2",
    databaseRef: APPROVED_REF,
    ...overrides,
  };
}

/** A run store that records the context it was scoped by. */
function recordingStore(lookup: DemoResetRunLookup): DemoResetRunStore & {
  currentRunInstance: ReturnType<typeof vi.fn>;
} {
  return { currentRunInstance: vi.fn(async () => lookup) };
}

/** A store that fails the test if the composition ever consults run state. */
function forbiddenStore(): DemoResetRunStore & {
  currentRunInstance: ReturnType<typeof vi.fn>;
} {
  return {
    currentRunInstance: vi.fn(async () => {
      throw new Error("the composition read run state on a denied path");
    }),
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
      rowScope: "NON_RUN_ROWS",
      objects: ["organizations"],
      note: "One countable object.",
    },
    {
      id: "run-owned-tables",
      subsystem: "DATABASE",
      disposition: "CLEARED",
      scopeBasis: "RUN_OWNED",
      rowScope: "RUN_OWNED_ROWS",
      objects: ["producer_fields"],
      note: "Rows belonging to the target run.",
    },
  ],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("demo reset dry-run composition", () => {
  it("plans over an observed inventory for an established run", async () => {
    declareApprovedEnvironment();
    const store = recordingStore({ kind: "RUN", run: runInstance() });

    const outcome = await composeDemoResetDryRun({
      actor: systemAdmin("operator-1"),
      store,
      manifest: COUNTABLE_MANIFEST,
      now,
      source: {
        async countRows() {
          return { kind: "COUNTED", rows: 6 };
        },
      },
    });

    expect(outcome.kind).toBe("PLANNED");
    if (outcome.kind !== "PLANNED") return;
    expect(outcome.runScope).toMatchObject({
      kind: "ESTABLISHED",
      runId: "run-a-0000000000000001",
    });
    expect(outcome.plan.runId).toBe("run-a-0000000000000001");
    expect(outcome.plan.inventorySource).toBe("OBSERVED");
    expect(outcome.plan.inventoryObservedAt).toBe(OBSERVED_AT);
    expect(outcome.objectsRead).toEqual(["organizations", "producer_fields"]);
    expect(outcome.plan.sideEffects).toBe("NONE");
  });

  it("scopes the run lookup by the session principal alone", async () => {
    declareApprovedEnvironment();
    const store = recordingStore({ kind: "RUN", run: runInstance() });

    await composeDemoResetDryRun({
      actor: systemAdmin("operator-1"),
      store,
      manifest: COUNTABLE_MANIFEST,
      now,
      // An untrusted claim is present and must not reach the lookup.
      claimedRunId: "run-a-0000000000000001",
      source: { async countRows() { return { kind: "COUNTED", rows: 1 }; } },
    });

    expect(store.currentRunInstance).toHaveBeenCalledTimes(1);
    expect(store.currentRunInstance).toHaveBeenCalledWith({
      principalUserId: "operator-1",
      environmentName: "approved-demo-qa",
      datasetId: "demo-dataset-v2",
      databaseRef: APPROVED_REF,
    });
  });

  it("plans an INCOMPLETE dry-run when no run instance has been issued", async () => {
    declareApprovedEnvironment();
    const source = forbiddenSource();

    const outcome = await composeDemoResetDryRun({
      actor: systemAdmin("operator-1"),
      store: recordingStore({ kind: "NO_RUN" }),
      manifest: COUNTABLE_MANIFEST,
      source,
      now,
    });

    // A legitimate request in a healthy environment that simply has no run.
    // It earns a plan, but the plan claims no run and no observation.
    expect(outcome.kind).toBe("PLANNED");
    if (outcome.kind !== "PLANNED") return;
    expect(outcome.runScope).toEqual({
      kind: "NOT_ESTABLISHED",
      gap: "RUN_INSTANCE_NOT_ISSUED",
    });
    expect(outcome.plan.runId).toBeNull();
    expect(outcome.plan.status).toBe("INCOMPLETE");
    expect(outcome.plan.blockers).toContain("RUN_SCOPE_NOT_ESTABLISHED");
    // Nothing was observed, so no category may carry a number.
    expect(outcome.plan.inventoryObservedAt).toBeNull();
    for (const category of [
      ...outcome.plan.preserved,
      ...outcome.plan.cleared,
    ]) {
      expect(category.rows, category.categoryId).toBeNull();
    }
    expect(outcome.objectsRead).toEqual([]);
    expect(source.countRows).not.toHaveBeenCalled();
  });

  it("treats a failing run store as unknown rather than as no run", async () => {
    declareApprovedEnvironment();
    const source = forbiddenSource();

    const outcome = await composeDemoResetDryRun({
      actor: systemAdmin("operator-1"),
      store: {
        async currentRunInstance() {
          throw new Error("connection to database failed: no pg_hba.conf entry");
        },
      },
      manifest: COUNTABLE_MANIFEST,
      source,
      now,
    });

    expect(outcome.kind).toBe("PLANNED");
    if (outcome.kind !== "PLANNED") return;
    expect(outcome.runScope).toEqual({
      kind: "NOT_ESTABLISHED",
      gap: "RUN_STATE_UNAVAILABLE",
    });
    expect(outcome.plan.runId).toBeNull();
    expect(source.countRows).not.toHaveBeenCalled();
    expect(JSON.stringify(outcome)).not.toContain("pg_hba");
  });
});

describe("demo reset dry-run denials", () => {
  it("reads neither run state nor the database in production", async () => {
    declareApprovedEnvironment({ VERCEL_ENV: "production" });
    const store = forbiddenStore();
    const source = forbiddenSource();

    const outcome = await composeDemoResetDryRun({
      actor: systemAdmin("operator-1"),
      store,
      source,
      manifest: COUNTABLE_MANIFEST,
      now,
    });

    expect(outcome).toMatchObject({
      kind: "DENIED",
      runScope: { kind: "REFUSED", refusal: "ENVIRONMENT_NOT_ELIGIBLE" },
    });
    expect(store.currentRunInstance).not.toHaveBeenCalled();
    expect(source.countRows).not.toHaveBeenCalled();
  });

  it("reads neither run state nor the database for an unauthorized actor", async () => {
    declareApprovedEnvironment();
    const store = forbiddenStore();
    const source = forbiddenSource();

    const outcome = await composeDemoResetDryRun({
      actor: {
        ...systemAdmin("operator-1"),
        effective: {
          roleId: "PRODUCER_ADMIN",
          permissions: permissionsForRole("PRODUCER_ADMIN"),
          producerIds: [],
        },
      },
      store,
      source,
      manifest: COUNTABLE_MANIFEST,
      now,
    });

    expect(outcome).toMatchObject({
      kind: "DENIED",
      runScope: { kind: "REFUSED", refusal: "ACTOR_NOT_AUTHORIZED" },
    });
    expect(store.currentRunInstance).not.toHaveBeenCalled();
    expect(source.countRows).not.toHaveBeenCalled();
  });

  it("reads nothing from the database once the run is refused", async () => {
    declareApprovedEnvironment();
    const source = forbiddenSource();

    const outcome = await composeDemoResetDryRun({
      actor: systemAdmin("operator-1"),
      store: recordingStore({
        kind: "RUN",
        run: runInstance({ operatorPrincipalUserId: "operator-2" }),
      }),
      source,
      manifest: COUNTABLE_MANIFEST,
      now,
    });

    expect(outcome).toMatchObject({
      kind: "DENIED",
      runScope: { kind: "REFUSED", refusal: "RUN_NOT_OWNED_BY_ACTOR" },
    });
    expect(source.countRows).not.toHaveBeenCalled();
    expect(outcome).not.toHaveProperty("plan");
  });

  it("refuses a claim naming a run other than the operator's current one", async () => {
    declareApprovedEnvironment();
    const source = forbiddenSource();

    const outcome = await composeDemoResetDryRun({
      actor: systemAdmin("operator-1"),
      store: recordingStore({ kind: "RUN", run: runInstance() }),
      claimedRunId: "run-b-0000000000000002",
      source,
      manifest: COUNTABLE_MANIFEST,
      now,
    });

    expect(outcome).toMatchObject({
      kind: "DENIED",
      runScope: { kind: "REFUSED", refusal: "RUN_NOT_OWNED_BY_ACTOR" },
    });
    expect(source.countRows).not.toHaveBeenCalled();
  });

  it("still reports every refusal an operator needs to see", async () => {
    declareApprovedEnvironment({ VERCEL_ENV: "production" });
    const outcome = await composeDemoResetDryRun({
      actor: systemAdmin("operator-1"),
      store: forbiddenStore(),
      manifest: COUNTABLE_MANIFEST,
      now,
    });

    expect(outcome.kind).toBe("DENIED");
    if (outcome.kind !== "DENIED") return;
    expect(outcome.authorization.decision).toBe("DENIED");
    expect(outcome.authorization.refusals.length).toBeGreaterThan(0);
  });
});

describe("demo reset production dry-run", () => {
  it("takes no manifest, store or source from its caller", async () => {
    // The request-facing signature accepts a trusted actor and an untrusted
    // claim, and nothing else. Nothing derived from a request can choose which
    // objects are in scope or which state is trusted.
    expect(planDemoDatasetV2ResetDryRunForActor).toHaveLength(2);
  });

  it("establishes no run outside a request session and fabricates none", async () => {
    declareApprovedEnvironment();

    const outcome = await planDemoDatasetV2ResetDryRunForActor(
      systemAdmin("operator-1"),
    );

    expect(outcome.kind).toBe("PLANNED");
    if (outcome.kind !== "PLANNED") return;
    // The wired store uses the session client. Vitest has no request cookies,
    // so the store cannot answer. That is UNAVAILABLE, not "no run" and not
    // an invented identifier.
    expect(outcome.runScope).toEqual({
      kind: "NOT_ESTABLISHED",
      gap: "RUN_STATE_UNAVAILABLE",
    });
    expect(outcome.plan.runId).toBeNull();
    expect(outcome.plan.status).toBe("INCOMPLETE");
    expect(outcome.objectsRead).toEqual([]);
  });

  it("keeps the shipped plan INCOMPLETE on remaining unscoped islands", async () => {
    declareApprovedEnvironment();

    const outcome = await planDemoDatasetV2ResetDryRunForActor(
      systemAdmin("operator-1"),
    );

    expect(outcome.kind).toBe("PLANNED");
    if (outcome.kind !== "PLANNED") return;
    expect(outcome.plan.overlappingObjects).toEqual([]);
    expect(outcome.plan.blockers).not.toContain("PRESERVED_AND_CLEARED_OVERLAP");
    expect(outcome.plan.blockers).toContain("CLEARED_SCOPE_NOT_RUN_OWNED");
    expect(outcome.plan.status).toBe("INCOMPLETE");
    expect(outcome.plan.status).not.toBe("READY_FOR_CONFIRMATION");
  });

  it("denies an unauthorized actor without planning", async () => {
    declareApprovedEnvironment();

    const outcome = await planDemoDatasetV2ResetDryRunForActor({
      ...systemAdmin("operator-1"),
      isImpersonating: true,
    });

    expect(outcome).toMatchObject({
      kind: "DENIED",
      runScope: { kind: "REFUSED", refusal: "ACTOR_NOT_AUTHORIZED" },
    });
  });

  it("requires the reset permission to be a platform permission at all", () => {
    // The composition asks `actorCan`/`principalCan` for this permission, so a
    // permission no role holds would silently deny everyone.
    expect(permissionsForRole("SYSTEM_ADMIN")).toContain(DEMO_RESET_PERMISSION);
    expect(PLATFORM_ROLES.length).toBeGreaterThan(0);
  });
});
