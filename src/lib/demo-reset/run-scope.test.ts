import { describe, expect, it } from "vitest";
import type { DemoResetEnvironmentSignals } from "@/lib/demo-reset/environment";
import {
  evaluateDemoResetDryRunPolicy,
  type DemoResetActorFacts,
  type DemoResetDryRunAuthorization,
} from "@/lib/demo-reset/policy";
import {
  DEMO_RESET_RUN_SCOPE_GAPS,
  DEMO_RESET_RUN_SCOPE_REFUSALS,
  isDemoResetRunInstanceId,
  resolveDemoResetRunContext,
  resolveDemoResetRunScope,
  type DemoResetRunInstance,
  type DemoResetRunLookup,
} from "@/lib/demo-reset/run-scope";

const APPROVED_REF = "examplerefabcdefghij";
const OTHER_REF = "otherrefabcdefghijkl";

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

const AUTHORIZED_ACTOR: DemoResetActorFacts = {
  principalUserId: "operator-1",
  effectiveHoldsPermission: true,
  principalHoldsPermission: true,
  isImpersonating: false,
  isDesignPreviewActor: false,
};

function authorize(overrides?: {
  signals?: Partial<DemoResetEnvironmentSignals>;
  actor?: Partial<DemoResetActorFacts>;
}): DemoResetDryRunAuthorization {
  return evaluateDemoResetDryRunPolicy({
    signals: { ...ELIGIBLE_SIGNALS, ...overrides?.signals },
    actor: { ...AUTHORIZED_ACTOR, ...overrides?.actor },
  });
}

/** A run instance as trusted state would record it. */
function recorded(
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

function found(run: DemoResetRunInstance): DemoResetRunLookup {
  return { kind: "RUN", run };
}

const RUN_A = recorded();
const RUN_B = recorded({ runId: "run-b-0000000000000002" });

describe("demo reset run instances", () => {
  it("gives one operator different identifiers for different runs", () => {
    // The whole point of the correction: the same principal, environment,
    // dataset and database, and still two distinct runs. An identity derived
    // from the actor could never express this.
    const first = resolveDemoResetRunScope({
      authorization: authorize(),
      lookup: found(RUN_A),
    });
    const second = resolveDemoResetRunScope({
      authorization: authorize(),
      lookup: found(RUN_B),
    });

    expect(first.kind).toBe("ESTABLISHED");
    expect(second.kind).toBe("ESTABLISHED");
    expect(first).toMatchObject({ runId: RUN_A.runId });
    expect(second).toMatchObject({ runId: RUN_B.runId });
    expect(RUN_A.runId).not.toBe(RUN_B.runId);
  });

  it("takes the identifier from trusted state rather than the context", () => {
    expect(
      resolveDemoResetRunScope({
        authorization: authorize(),
        lookup: found(RUN_A),
      }),
    ).toMatchObject({
      kind: "ESTABLISHED",
      runId: RUN_A.runId,
      operatorPrincipalUserId: "operator-1",
      environmentName: "approved-demo-qa",
      datasetId: "demo-dataset-v2",
      databaseRef: APPROVED_REF,
    });
  });

  it("establishes no run when trusted state holds none", () => {
    // Nothing is invented so the planner can have a non-null identifier.
    expect(
      resolveDemoResetRunScope({
        authorization: authorize(),
        lookup: { kind: "NO_RUN" },
      }),
    ).toEqual({ kind: "NOT_ESTABLISHED", gap: "RUN_INSTANCE_NOT_ISSUED" });
  });

  it("establishes no run when trusted state cannot answer", () => {
    // An absent store and a failing one are the production case today. Neither
    // may read as "there is no run", and neither may produce one.
    for (const lookup of [undefined, null, { kind: "UNAVAILABLE" } as const]) {
      expect(
        resolveDemoResetRunScope({ authorization: authorize(), lookup }),
      ).toEqual({ kind: "NOT_ESTABLISHED", gap: "RUN_STATE_UNAVAILABLE" });
    }
  });

  it("separates having no run from being refused a run", () => {
    const none = resolveDemoResetRunScope({
      authorization: authorize(),
      lookup: { kind: "NO_RUN" },
    });
    const denied = resolveDemoResetRunScope({
      authorization: authorize({ actor: { isImpersonating: true } }),
      lookup: found(RUN_A),
    });
    expect(none.kind).toBe("NOT_ESTABLISHED");
    expect(denied.kind).toBe("REFUSED");
  });
});

describe("demo reset run authority", () => {
  it("refuses a run recorded for another operator", () => {
    expect(
      resolveDemoResetRunScope({
        authorization: authorize(),
        lookup: found(recorded({ operatorPrincipalUserId: "operator-2" })),
      }),
    ).toEqual({ kind: "REFUSED", refusal: "RUN_NOT_OWNED_BY_ACTOR" });
  });

  it("refuses a foreign run identifier presented as a claim", () => {
    expect(
      resolveDemoResetRunScope({
        authorization: authorize(),
        lookup: found(RUN_A),
        claimedRunId: "run-somebody-elses-0001",
      }),
    ).toEqual({ kind: "REFUSED", refusal: "RUN_NOT_OWNED_BY_ACTOR" });
  });

  it("refuses a stale run instead of quietly retargeting the current one", () => {
    // Run A is over and Run B is current. Claiming A must not resolve to A,
    // and must not silently resolve to B either.
    const scope = resolveDemoResetRunScope({
      authorization: authorize(),
      lookup: found(RUN_B),
      claimedRunId: RUN_A.runId,
    });
    expect(scope).toEqual({
      kind: "REFUSED",
      refusal: "RUN_NOT_OWNED_BY_ACTOR",
    });
    expect(scope).not.toMatchObject({ runId: RUN_B.runId });
  });

  it("cannot tell a foreign run from an invented one", () => {
    // Both refusals are identical, so no sequence of requests reveals whether
    // some other run exists.
    const foreign = resolveDemoResetRunScope({
      authorization: authorize(),
      lookup: found(RUN_A),
      claimedRunId: RUN_B.runId,
    });
    const invented = resolveDemoResetRunScope({
      authorization: authorize(),
      lookup: found(RUN_A),
      claimedRunId: "run-never-existed-0001",
    });
    expect(foreign).toEqual(invented);
  });

  it("accepts a claim only when it names the run the server recorded", () => {
    expect(
      resolveDemoResetRunScope({
        authorization: authorize(),
        lookup: found(RUN_A),
        claimedRunId: RUN_A.runId,
      }),
    ).toMatchObject({ kind: "ESTABLISHED", runId: RUN_A.runId });
  });

  it("refuses a malformed claim without consulting its value", () => {
    for (const claimed of [
      "",
      "   ",
      "short",
      "run id with spaces",
      "run-id-with-a-quote'",
      `run-${"x".repeat(80)}`,
      42,
      true,
      {},
      [],
      { runId: RUN_A.runId },
    ]) {
      expect(
        resolveDemoResetRunScope({
          authorization: authorize(),
          lookup: found(RUN_A),
          claimedRunId: claimed,
        }),
        `claim ${JSON.stringify(claimed)}`,
      ).toEqual({ kind: "REFUSED", refusal: "RUN_CLAIM_MALFORMED" });
    }
  });

  it("ignores an owner supplied alongside the claim", () => {
    // A caller cannot describe itself into authority: only the session-derived
    // principal is compared, and extra fields on the input are never read.
    expect(
      resolveDemoResetRunScope({
        authorization: authorize(),
        lookup: found(recorded({ operatorPrincipalUserId: "operator-2" })),
        claimedRunId: RUN_A.runId,
        ...({
          principalUserId: "operator-2",
          operatorPrincipalUserId: "operator-2",
        } as Record<string, unknown>),
      }),
    ).toEqual({ kind: "REFUSED", refusal: "RUN_NOT_OWNED_BY_ACTOR" });
  });

  it("refuses a run recorded under a different approved context", () => {
    for (const overrides of [
      { environmentName: "some-other-environment" },
      { datasetId: "demo-dataset-v1" },
      { databaseRef: OTHER_REF },
    ]) {
      expect(
        resolveDemoResetRunScope({
          authorization: authorize(),
          lookup: found(recorded(overrides)),
        }),
        JSON.stringify(overrides),
      ).toEqual({ kind: "REFUSED", refusal: "RUN_CONTEXT_MISMATCH" });
    }
  });

  it("refuses a record that is missing what it would be trusted for", () => {
    for (const overrides of [
      { runId: "" },
      { runId: "nope" },
      { operatorPrincipalUserId: "  " },
    ]) {
      expect(
        resolveDemoResetRunScope({
          authorization: authorize(),
          lookup: found(recorded(overrides)),
        }),
        JSON.stringify(overrides),
      ).toEqual({ kind: "REFUSED", refusal: "RUN_RECORD_INVALID" });
    }
  });
});

describe("demo reset run preconditions", () => {
  it("refuses every unauthorized actor before any run is considered", () => {
    for (const actor of [
      { effectiveHoldsPermission: false },
      { principalHoldsPermission: false },
      { isImpersonating: true },
      { isDesignPreviewActor: true },
    ]) {
      expect(
        resolveDemoResetRunScope({
          authorization: authorize({ actor }),
          lookup: found(RUN_A),
        }),
        JSON.stringify(actor),
      ).toEqual({ kind: "REFUSED", refusal: "ACTOR_NOT_AUTHORIZED" });
    }
  });

  it("refuses an unidentified principal", () => {
    for (const principalUserId of ["", "   "]) {
      expect(
        resolveDemoResetRunScope({
          authorization: authorize({ actor: { principalUserId } }),
          lookup: found(recorded({ operatorPrincipalUserId: principalUserId })),
        }),
      ).toEqual({ kind: "REFUSED", refusal: "PRINCIPAL_NOT_IDENTIFIED" });
    }
  });

  it("refuses production ahead of every other reason", () => {
    // A production runtime with an authorized actor and a valid recorded run
    // still resolves to the environment refusal, never to a run.
    expect(
      resolveDemoResetRunScope({
        authorization: authorize({ signals: { vercelEnv: "production" } }),
        lookup: found(RUN_A),
        claimedRunId: RUN_A.runId,
      }),
    ).toEqual({ kind: "REFUSED", refusal: "ENVIRONMENT_NOT_ELIGIBLE" });
  });

  it("reports the same precondition the resolver applies", () => {
    expect(resolveDemoResetRunContext(authorize())).toEqual({
      kind: "READY",
      context: {
        principalUserId: "operator-1",
        environmentName: "approved-demo-qa",
        datasetId: "demo-dataset-v2",
        databaseRef: APPROVED_REF,
      },
    });
    expect(
      resolveDemoResetRunContext(
        authorize({ signals: { vercelEnv: "production" } }),
      ),
    ).toEqual({ kind: "REFUSED", refusal: "ENVIRONMENT_NOT_ELIGIBLE" });
  });
});

describe("demo reset run identifiers", () => {
  it("accepts a bounded opaque token and nothing else", () => {
    expect(isDemoResetRunInstanceId(RUN_A.runId)).toBe(true);
    expect(
      isDemoResetRunInstanceId("550e8400-e29b-41d4-a716-446655440000"),
    ).toBe(true);
    for (const value of [
      "",
      "tooshor",
      "-leading-hyphen-01",
      "has space 0001",
      "semi;colon;0001",
      "x".repeat(65),
      null,
      undefined,
      7,
    ]) {
      expect(isDemoResetRunInstanceId(value), String(value)).toBe(false);
    }
  });

  it("keeps refusals and gaps as separate closed vocabularies", () => {
    expect(new Set(DEMO_RESET_RUN_SCOPE_REFUSALS).size).toBe(
      DEMO_RESET_RUN_SCOPE_REFUSALS.length,
    );
    expect(DEMO_RESET_RUN_SCOPE_GAPS).toEqual([
      "RUN_INSTANCE_NOT_ISSUED",
      "RUN_STATE_UNAVAILABLE",
    ]);
    for (const gap of DEMO_RESET_RUN_SCOPE_GAPS) {
      expect(DEMO_RESET_RUN_SCOPE_REFUSALS).not.toContain(gap);
    }
  });
});
