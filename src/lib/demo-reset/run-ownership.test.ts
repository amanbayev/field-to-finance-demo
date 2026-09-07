import { describe, expect, it } from "vitest";
import type { DemoResetEnvironmentSignals } from "@/lib/demo-reset/environment";
import {
  evaluateDemoResetDryRunPolicy,
  type DemoResetActorFacts,
  type DemoResetDryRunAuthorization,
} from "@/lib/demo-reset/policy";
import {
  DEMO_RESET_RUN_SCOPE_REFUSALS,
  demoResetRunId,
  isDemoResetRunId,
  resolveDemoResetRunScope,
} from "@/lib/demo-reset/run-ownership";

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

/** The run `operator-1` owns, derived the way the boundary derives it. */
const OWN_RUN = demoResetRunId({
  environmentName: "approved-demo-qa",
  datasetId: "demo-dataset-v2",
  databaseRef: APPROVED_REF,
  principalUserId: "operator-1",
});

describe("demo reset run identity", () => {
  it("derives a canonical identifier", () => {
    expect(OWN_RUN).toMatch(/^run-[0-9a-f]{64}$/);
    expect(isDemoResetRunId(OWN_RUN)).toBe(true);
  });

  it("is deterministic, so an unchanged dry-run addresses the same run", () => {
    expect(
      demoResetRunId({
        environmentName: "approved-demo-qa",
        datasetId: "demo-dataset-v2",
        databaseRef: APPROVED_REF,
        principalUserId: "operator-1",
      }),
    ).toBe(OWN_RUN);
  });

  it("separates principals, environments, datasets and databases", () => {
    const base = {
      environmentName: "approved-demo-qa",
      datasetId: "demo-dataset-v2",
      databaseRef: APPROVED_REF,
      principalUserId: "operator-1",
    };
    for (const variant of [
      { principalUserId: "operator-2" },
      { environmentName: "local-development" },
      { datasetId: "demo-dataset-v3" },
      { databaseRef: OTHER_REF },
    ]) {
      expect(demoResetRunId({ ...base, ...variant })).not.toBe(OWN_RUN);
    }
  });

  it("rejects anything that is not a canonical identifier", () => {
    for (const value of [
      "",
      "   ",
      "RUN-0001",
      OWN_RUN.slice(4),
      OWN_RUN.toUpperCase(),
      `${OWN_RUN}0`,
      OWN_RUN.slice(0, -1),
      `run-${"g".repeat(64)}`,
      null,
      undefined,
      42,
      {},
      [],
      true,
    ]) {
      expect(
        isDemoResetRunId(value),
        `${String(value)} must not be a run id`,
      ).toBe(false);
    }
  });
});

describe("demo reset run ownership", () => {
  it("gives an authorized actor its own run without being told which one", () => {
    const scope = resolveDemoResetRunScope({ authorization: authorize() });
    expect(scope).toEqual({
      kind: "ESTABLISHED",
      runId: OWN_RUN,
      principalUserId: "operator-1",
      environmentName: "approved-demo-qa",
      datasetId: "demo-dataset-v2",
      databaseRef: APPROVED_REF,
    });
  });

  it("accepts a claim that matches the run the actor owns", () => {
    expect(
      resolveDemoResetRunScope({
        authorization: authorize(),
        claimedRunId: OWN_RUN,
      }).kind,
    ).toBe("ESTABLISHED");
  });

  it("refuses another actor's run even though the identifier is valid", () => {
    const foreign = demoResetRunId({
      environmentName: "approved-demo-qa",
      datasetId: "demo-dataset-v2",
      databaseRef: APPROVED_REF,
      principalUserId: "operator-2",
    });
    expect(isDemoResetRunId(foreign)).toBe(true);

    expect(
      resolveDemoResetRunScope({
        authorization: authorize(),
        claimedRunId: foreign,
      }),
    ).toEqual({ kind: "NOT_ESTABLISHED", refusal: "RUN_NOT_OWNED_BY_ACTOR" });
  });

  it("ignores a substituted owner: the run follows the session principal", () => {
    // The only principal the boundary reads is the one the server resolved.
    // operator-2's session resolves to operator-2's run, and presenting that
    // same run under operator-1's session refuses.
    const asOperatorTwo = resolveDemoResetRunScope({
      authorization: authorize({ actor: { principalUserId: "operator-2" } }),
    });
    expect(asOperatorTwo.kind).toBe("ESTABLISHED");
    const operatorTwoRun =
      asOperatorTwo.kind === "ESTABLISHED" ? asOperatorTwo.runId : "";
    expect(operatorTwoRun).not.toBe(OWN_RUN);

    expect(
      resolveDemoResetRunScope({
        authorization: authorize(),
        claimedRunId: operatorTwoRun,
      }),
    ).toEqual({ kind: "NOT_ESTABLISHED", refusal: "RUN_NOT_OWNED_BY_ACTOR" });
  });

  it("reports an unknown run exactly as it reports a foreign one", () => {
    // Identical refusals mean the boundary cannot be used as an oracle for
    // whether some other run exists.
    const unknown = resolveDemoResetRunScope({
      authorization: authorize(),
      claimedRunId: `run-${"0".repeat(64)}`,
    });
    const foreign = resolveDemoResetRunScope({
      authorization: authorize(),
      claimedRunId: demoResetRunId({
        environmentName: "approved-demo-qa",
        datasetId: "demo-dataset-v2",
        databaseRef: APPROVED_REF,
        principalUserId: "operator-2",
      }),
    });
    expect(unknown).toEqual({
      kind: "NOT_ESTABLISHED",
      refusal: "RUN_NOT_OWNED_BY_ACTOR",
    });
    expect(unknown).toEqual(foreign);
  });

  it("refuses a malformed claim whatever type it arrives as", () => {
    for (const claimedRunId of [
      "",
      "   ",
      "RUN-0001",
      OWN_RUN.slice(4),
      OWN_RUN.toUpperCase(),
      `  ${OWN_RUN}  `,
      42,
      { runId: OWN_RUN },
      [OWN_RUN],
      true,
    ]) {
      expect(
        resolveDemoResetRunScope({ authorization: authorize(), claimedRunId }),
        `${String(claimedRunId)} must be malformed`,
      ).toEqual({ kind: "NOT_ESTABLISHED", refusal: "RUN_CLAIM_MALFORMED" });
    }
  });

  it("refuses when the principal is not identified", () => {
    for (const principalUserId of ["", "   ", "\t\n"]) {
      const authorization = authorize({ actor: { principalUserId } });
      // The permission check is content with this actor. An unidentified
      // principal is caught by the ownership boundary, not by the policy.
      expect(authorization.decision).toBe("ALLOWED");
      expect(resolveDemoResetRunScope({ authorization })).toEqual({
        kind: "NOT_ESTABLISHED",
        refusal: "PRINCIPAL_NOT_IDENTIFIED",
      });
    }
  });

  it("refuses a run derived under a different dataset, database or environment", () => {
    for (const context of [
      { datasetId: "demo-dataset-v3" },
      { databaseRef: OTHER_REF },
      { environmentName: "local-development" },
    ]) {
      expect(
        resolveDemoResetRunScope({
          authorization: authorize(),
          claimedRunId: demoResetRunId({
            environmentName: "approved-demo-qa",
            datasetId: "demo-dataset-v2",
            databaseRef: APPROVED_REF,
            principalUserId: "operator-1",
            ...context,
          }),
        }),
        `${JSON.stringify(context)} must not carry over`,
      ).toEqual({ kind: "NOT_ESTABLISHED", refusal: "RUN_NOT_OWNED_BY_ACTOR" });
    }
  });

  it("establishes no run in a production runtime, ahead of every other reason", () => {
    expect(
      resolveDemoResetRunScope({
        authorization: authorize({
          signals: { vercelEnv: "production" },
          actor: {
            effectiveHoldsPermission: false,
            principalHoldsPermission: false,
          },
        }),
        claimedRunId: "not-a-run",
      }),
    ).toEqual({ kind: "NOT_ESTABLISHED", refusal: "ENVIRONMENT_NOT_ELIGIBLE" });
  });

  it("establishes no run when the environment cannot be classified", () => {
    for (const signals of [
      { nodeEnv: undefined },
      { vercelEnv: undefined },
      { declaredEnvironment: undefined },
      { declaredDatasetId: undefined },
      { declaredDatabaseRef: undefined },
      { observedSupabaseUrl: `https://${OTHER_REF}.supabase.co` },
      { observedSupabaseUrl: "http://127.0.0.1:54321" },
    ]) {
      expect(
        resolveDemoResetRunScope({ authorization: authorize({ signals }) }),
        `${JSON.stringify(signals)} must not establish a run`,
      ).toEqual({
        kind: "NOT_ESTABLISHED",
        refusal: "ENVIRONMENT_NOT_ELIGIBLE",
      });
    }
  });

  it("establishes no run for an unauthorized or impersonating actor", () => {
    for (const actor of [
      { effectiveHoldsPermission: false },
      { principalHoldsPermission: false },
      { isImpersonating: true },
      { isDesignPreviewActor: true },
    ]) {
      expect(
        resolveDemoResetRunScope({
          authorization: authorize({ actor }),
          claimedRunId: OWN_RUN,
        }),
        `${JSON.stringify(actor)} must not establish a run`,
      ).toEqual({ kind: "NOT_ESTABLISHED", refusal: "ACTOR_NOT_AUTHORIZED" });
    }
  });

  it("reports only refusals from the closed list", () => {
    const scope = resolveDemoResetRunScope({
      authorization: authorize({ actor: { isImpersonating: true } }),
    });
    expect(scope.kind).toBe("NOT_ESTABLISHED");
    if (scope.kind === "NOT_ESTABLISHED") {
      expect(DEMO_RESET_RUN_SCOPE_REFUSALS).toContain(scope.refusal);
    }
  });
});
