import { describe, expect, it } from "vitest";
import {
  isSupabaseProjectRef,
  resolveDemoResetEnvironment,
  resolveSupabaseEndpoint,
  supabaseProjectRef,
  type DemoResetEnvironmentSignals,
} from "@/lib/demo-reset/environment";

/** Supabase cloud project refs are 20 lowercase alphanumeric characters. */
const APPROVED_REF = "examplerefabcdefghij";
const OTHER_REF = "otherrefabcdefghijkl";

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

  it("does not read the first label of an unrelated hostname as a project ref", () => {
    expect(supabaseProjectRef("https://exampleqa.unrelated.invalid")).toBeNull();
    expect(
      resolveSupabaseEndpoint("https://exampleqa.unrelated.invalid"),
    ).toEqual({
      kind: "UNSUPPORTED",
      rejection: "HOST_NOT_SUPABASE_CLOUD",
    });
    expect(
      resolveSupabaseEndpoint(`https://${APPROVED_REF}.supabase.co.evil.test`),
    ).toEqual({ kind: "UNSUPPORTED", rejection: "HOST_NOT_SUPABASE_CLOUD" });
  });

  it("does not read an IP address or local endpoint as a project ref", () => {
    expect(supabaseProjectRef("http://127.0.0.1:54321")).toBeNull();
    expect(resolveSupabaseEndpoint("http://127.0.0.1:54321")).toEqual({
      kind: "UNSUPPORTED",
      rejection: "SCHEME_NOT_HTTPS",
    });
    expect(resolveSupabaseEndpoint("https://127.0.0.1")).toEqual({
      kind: "UNSUPPORTED",
      rejection: "HOST_NOT_SUPABASE_CLOUD",
    });
  });

  it("rejects a supabase.co host whose project ref is malformed", () => {
    expect(resolveSupabaseEndpoint("https://short.supabase.co")).toEqual({
      kind: "UNSUPPORTED",
      rejection: "PROJECT_REF_MALFORMED",
    });
    expect(
      resolveSupabaseEndpoint(`https://sub.${APPROVED_REF}.supabase.co`),
    ).toEqual({ kind: "UNSUPPORTED", rejection: "PROJECT_REF_MALFORMED" });
  });

  it("rejects credentials, ports, paths, queries and fragments", () => {
    const base = `${APPROVED_REF}.supabase.co`;
    expect(resolveSupabaseEndpoint(`https://user:pass@${base}`)).toEqual({
      kind: "UNSUPPORTED",
      rejection: "CREDENTIALS_IN_URL",
    });
    expect(resolveSupabaseEndpoint(`https://${base}:8443`)).toEqual({
      kind: "UNSUPPORTED",
      rejection: "PORT_NOT_ALLOWED",
    });
    expect(resolveSupabaseEndpoint(`https://${base}/rest/v1`)).toEqual({
      kind: "UNSUPPORTED",
      rejection: "PATH_NOT_ALLOWED",
    });
    expect(resolveSupabaseEndpoint(`https://${base}?ref=other`)).toEqual({
      kind: "UNSUPPORTED",
      rejection: "QUERY_OR_FRAGMENT_NOT_ALLOWED",
    });
    expect(resolveSupabaseEndpoint(`https://${base}/#x`)).toEqual({
      kind: "UNSUPPORTED",
      rejection: "QUERY_OR_FRAGMENT_NOT_ALLOWED",
    });
  });

  it("normalises host case, since DNS names are case-insensitive", () => {
    expect(
      resolveSupabaseEndpoint(`https://${APPROVED_REF.toUpperCase()}.SUPABASE.CO`),
    ).toEqual({ kind: "CLOUD_PROJECT", projectRef: APPROVED_REF });
  });

  it("distinguishes an undeclared endpoint from an unsupported one", () => {
    expect(resolveSupabaseEndpoint(undefined)).toEqual({ kind: "NOT_DECLARED" });
    expect(resolveSupabaseEndpoint("  ")).toEqual({ kind: "NOT_DECLARED" });
  });

  it("recognises only a well-formed project ref", () => {
    expect(isSupabaseProjectRef(APPROVED_REF)).toBe(true);
    expect(isSupabaseProjectRef("127")).toBe(false);
    expect(isSupabaseProjectRef("exampleqa")).toBe(false);
    expect(isSupabaseProjectRef(undefined)).toBe(false);
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

  it("refuses when no runtime signal is available, even with full declarations", () => {
    const resolution = resolveDemoResetEnvironment({
      declaredEnvironment: "approved-demo-qa",
      declaredDatasetId: "demo-dataset-v2",
      declaredDatabaseRef: APPROVED_REF,
      observedSupabaseUrl: `https://${APPROVED_REF}.supabase.co`,
    });
    expect(resolution.eligible).toBe(false);
    expect(resolution.environmentClass).toBe("UNKNOWN");
    expect(resolution.refusals).toContain("RUNTIME_SIGNALS_NOT_DECLARED");
  });

  it("refuses an unrecognised NODE_ENV instead of assuming development", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ nodeEnv: "mystery" }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.environmentClass).toBe("UNKNOWN");
    expect(resolution.refusals).toContain("RUNTIME_SIGNALS_NOT_RECOGNISED");
  });

  it("refuses an unrecognised VERCEL_ENV on a deployment", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ nodeEnv: "mystery", vercelEnv: "unexpected" }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.environmentClass).toBe("UNKNOWN");
    expect(resolution.refusals).toContain("RUNTIME_SIGNALS_NOT_RECOGNISED");
  });

  it("refuses an unrecognised NEXT_PUBLIC_APP_ENV", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ publicAppEnv: "whatever" }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.refusals).toContain("RUNTIME_SIGNALS_NOT_RECOGNISED");
  });

  it("refuses VERCEL=\"0\" while every other signal is valid", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ vercel: "0" }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.environmentClass).toBe("UNKNOWN");
    expect(resolution.refusals).toContain("RUNTIME_SIGNALS_NOT_RECOGNISED");
  });

  it("refuses an unrecognised VERCEL value while every other signal is valid", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ vercel: "mystery" }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.environmentClass).toBe("UNKNOWN");
    expect(resolution.refusals).toContain("RUNTIME_SIGNALS_NOT_RECOGNISED");
  });

  it("accepts the supported deployed preview contract, VERCEL=\"1\"", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ vercel: "1" }),
    );
    expect(resolution.eligible).toBe(true);
    expect(resolution.environmentClass).toBe("APPROVED_DEMO");
    expect(resolution.refusals).toEqual([]);
  });

  it("accepts local development with no VERCEL variable at all", () => {
    const resolution = resolveDemoResetEnvironment({
      nodeEnv: "development",
      publicAppEnv: "demo",
      declaredEnvironment: "local-development",
      declaredDatasetId: "demo-dataset-v2",
      declaredDatabaseRef: APPROVED_REF,
      observedSupabaseUrl: `https://${APPROVED_REF}.supabase.co`,
    });
    expect(resolution.eligible).toBe(true);
    expect(resolution.environmentName).toBe("local-development");
    expect(resolution.refusals).toEqual([]);
  });

  it("keeps the production denial ahead of an unrecognised VERCEL value", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ vercel: "mystery", vercelEnv: "production" }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.environmentClass).toBe("PRODUCTION");
    expect(resolution.refusals).toContain("PRODUCTION_ENVIRONMENT_DENIED");
  });

  it("refuses VERCEL_ENV without VERCEL, and VERCEL without VERCEL_ENV", () => {
    const missingVercel = resolveDemoResetEnvironment(
      approvedQaSignals({ vercel: undefined, nodeEnv: "development" }),
    );
    expect(missingVercel.eligible).toBe(false);
    expect(missingVercel.refusals).toContain("RUNTIME_SIGNALS_CONTRADICTORY");

    const missingVercelEnv = resolveDemoResetEnvironment(
      approvedQaSignals({ vercelEnv: undefined, nodeEnv: "development" }),
    );
    expect(missingVercelEnv.eligible).toBe(false);
    expect(missingVercelEnv.refusals).toContain("RUNTIME_SIGNALS_CONTRADICTORY");
  });

  it("refuses a deployment that does not declare NEXT_PUBLIC_APP_ENV", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ publicAppEnv: undefined }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.environmentClass).toBe("UNKNOWN");
    expect(resolution.refusals).toContain("RUNTIME_SIGNALS_NOT_DECLARED");
  });

  it("refuses a Vercel runtime it cannot classify as preview", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ nodeEnv: "development", vercelEnv: "development" }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.environmentClass).toBe("UNKNOWN");
    expect(resolution.refusals).toContain(
      "RUNTIME_ENVIRONMENT_CLASS_NOT_ESTABLISHED",
    );
  });

  it("still refuses a local-development declaration when the runtime is unknown", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({
        nodeEnv: "mystery",
        declaredEnvironment: "local-development",
      }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.refusals).toEqual(
      expect.arrayContaining([
        "RUNTIME_SIGNALS_NOT_RECOGNISED",
        "LOCAL_DECLARATION_REJECTED_ON_DEPLOYMENT",
      ]),
    );
  });

  it("refuses an unsupported observed endpoint rather than parsing an identity from it", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({
        declaredDatabaseRef: "exampleqa",
        observedSupabaseUrl: "https://exampleqa.unrelated.invalid",
      }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.refusals).toEqual(
      expect.arrayContaining([
        "DATABASE_IDENTITY_NOT_RECOGNISED",
        "DATABASE_ENDPOINT_NOT_SUPPORTED",
      ]),
    );
    expect(resolution.refusals).not.toContain("DATABASE_IDENTITY_MISMATCH");
  });

  it("refuses a declared database ref that is not a project ref", () => {
    const resolution = resolveDemoResetEnvironment(
      approvedQaSignals({ declaredDatabaseRef: "127" }),
    );
    expect(resolution.eligible).toBe(false);
    expect(resolution.refusals).toContain("DATABASE_IDENTITY_NOT_RECOGNISED");
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
