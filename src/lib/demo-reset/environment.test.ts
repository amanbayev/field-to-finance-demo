import { describe, expect, it } from "vitest";
import {
  resolveDemoResetEnvironment,
  supabaseProjectRef,
  type DemoResetEnvironmentSignals,
} from "@/lib/demo-reset/environment";

const APPROVED_REF = "examplerefabcdefghij";
const OTHER_REF = "otherrefabcdefghijk";

function approvedQaSignals(
  overrides: Partial<DemoResetEnvironmentSignals> = {},
): DemoResetEnvironmentSignals {
  return {
    nodeEnv: "production",
    vercel: "1",
    vercelEnv: "preview",
    publicAppEnv: "demo",
    declaredEnvironment: "approved-demo-qa",
    declaredDatasetId: "demo-dataset-v2",
    declaredDatabaseRef: APPROVED_REF,
    observedSupabaseUrl: `https://${APPROVED_REF}.supabase.co`,
    ...overrides,
  };
}

describe("supabaseProjectRef", () => {
  it("reads the project ref from a Supabase project URL", () => {
    expect(supabaseProjectRef(`https://${APPROVED_REF}.supabase.co`)).toBe(
      APPROVED_REF,
    );
  });

  it("returns null for a missing, unparseable or bare host", () => {
    expect(supabaseProjectRef(undefined)).toBeNull();
    expect(supabaseProjectRef("   ")).toBeNull();
    expect(supabaseProjectRef("not-a-url")).toBeNull();
    expect(supabaseProjectRef("https://localhost")).toBeNull();
  });
});

describe("demo reset environment contract", () => {
  it("accepts a fully declared approved QA environment", () => {
    const resolution = resolveDemoResetEnvironment(approvedQaSignals());
    expect(resolution.eligible).toBe(true);
    expect(resolution.refusals).toEqual([]);
    expect(resolution.environmentName).toBe("approved-demo-qa");
    expect(resolution.datasetId).toBe("demo-dataset-v2");
    expect(resolution.databaseRef).toBe(APPROVED_REF);
  });

  it("denies Vercel production even when every declaration is present", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ vercelEnv: "production" }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.environmentClass).toBe("PRODUCTION");
    expect(resolution.refusals).toContain("PRODUCTION_ENVIRONMENT_DENIED");
  });

  it("denies a production public app env even when every declaration is present", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ vercelEnv: undefined, publicAppEnv: "production" }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.environmentClass).toBe("PRODUCTION");
    expect(resolution.refusals).toContain("PRODUCTION_ENVIRONMENT_DENIED");
  });

  it("treats next start outside Vercel as production", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ vercel: undefined, vercelEnv: undefined }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.environmentClass).toBe("PRODUCTION");
    expect(resolution.refusals).toContain("PRODUCTION_ENVIRONMENT_DENIED");
  });

  it("does not accept a demo app env or development NODE_ENV on its own", () => {
    const appEnvOnly = resolveDemoResetEnvironment({
      nodeEnv: "development",
      publicAppEnv: "demo",
    });
    expect(appEnvOnly.eligible).toBe(false);
    expect(appEnvOnly.refusals).toEqual(
      expect.arrayContaining([
        "ENVIRONMENT_NOT_DECLARED",
        "DATASET_NOT_DECLARED",
        "DATABASE_IDENTITY_NOT_DECLARED",
        "DATABASE_IDENTITY_NOT_OBSERVABLE",
      ]),
    );
  });

  it("refuses an unrecognised declared environment name", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ declaredEnvironment: "staging" }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.refusals).toContain("ENVIRONMENT_NOT_RECOGNISED");
  });

  it("refuses a local-development declaration on a deployment", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ declaredEnvironment: "local-development" }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.refusals).toContain(
      "LOCAL_DECLARATION_REJECTED_ON_DEPLOYMENT",
    );
  });

  it("accepts local development only when nothing indicates a deployment", () => {
    const resolution = resolveDemoResetEnvironment({
      nodeEnv: "development",
      declaredEnvironment: "local-development",
      declaredDatasetId: "demo-dataset-v2",
      declaredDatabaseRef: APPROVED_REF,
      observedSupabaseUrl: `https://${APPROVED_REF}.supabase.co`,
    });
    expect(resolution.eligible).toBe(true);
    expect(resolution.environmentName).toBe("local-development");
  });

  it("refuses an unknown database identity rather than defaulting to allowed", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ observedSupabaseUrl: undefined }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.refusals).toContain("DATABASE_IDENTITY_NOT_OBSERVABLE");
  });

  it("refuses when the observed database is not the declared one", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({
        observedSupabaseUrl: `https://${OTHER_REF}.supabase.co`,
      }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.refusals).toContain("DATABASE_IDENTITY_MISMATCH");
  });

  it("refuses a missing dataset declaration", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ declaredDatasetId: "  " }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.refusals).toContain("DATASET_NOT_DECLARED");
  });

  it("never returns an environment, dataset or database identity when refused", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ vercelEnv: "production" }),
    );
    expect(resolution.environmentName).toBeNull();
    expect(resolution.datasetId).toBeNull();
    expect(resolution.databaseRef).toBeNull();
  });

  it("reports every independent refusal at once", () => {
    const resolution = resolveDemoResetEnvironment({
      vercelEnv: "production",
      declaredEnvironment: "staging",
    });
    expect(resolution.refusals).toEqual(
      expect.arrayContaining([
        "PRODUCTION_ENVIRONMENT_DENIED",
        "ENVIRONMENT_NOT_RECOGNISED",
        "DATASET_NOT_DECLARED",
        "DATABASE_IDENTITY_NOT_DECLARED",
        "DATABASE_IDENTITY_NOT_OBSERVABLE",
      ]),
    );
  });
});
