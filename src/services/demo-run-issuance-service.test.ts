import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { permissionsForRole, type ActorContext } from "@/domain/identity";
import { parseDemoRunIssuanceRequest } from "@/domain/demo-run/issuance";
import { createPostgresDemoRunIssuer } from "@/data/demo-reset/postgres-run-issuer";
import { composeDemoRunIssuance, issueDemoDatasetV2Run } from "@/services/demo-run-issuance-service";
import { composeDemoResetDryRun } from "@/services/demo-reset-service";
import { requireActor } from "@/lib/auth/load-actor";
import { createServiceRoleClient } from "@/lib/auth/supabase/admin";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/load-actor", () => ({ requireActor: vi.fn() }));
vi.mock("@/lib/auth/supabase/admin", () => ({ createServiceRoleClient: vi.fn() }));

const operator = randomUUID();
const databaseRef = "examplerefabcdefghij";
const request = {
  issuanceRequestId: randomUUID(),
  organizationNames: { producer: "Producer", issuer: "Issuer", investor: "Investor" },
};
const receipt = {
  issuanceRequestId: request.issuanceRequestId,
  runId: randomUUID(), producerOrganizationId: randomUUID(),
  issuerOrganizationId: randomUUID(), investorOrganizationId: randomUUID(),
};

function actor(): ActorContext {
  const permissions = permissionsForRole("SYSTEM_ADMIN");
  return {
    principal: {
      userId: operator, email: null, displayName: "Operator", status: "ACTIVE",
      permissions, memberships: [], organizations: [], roleIds: ["SYSTEM_ADMIN"],
    },
    effective: { roleId: "SYSTEM_ADMIN", permissions, producerIds: [] },
    isImpersonating: false,
  };
}

function environment(overrides: Record<string, string | undefined> = {}) {
  for (const [name, value] of Object.entries({
    NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", NEXT_PUBLIC_APP_ENV: "demo",
    DEMO_RESET_ENVIRONMENT: "approved-demo-qa", DEMO_RESET_DATASET_ID: "demo-dataset-v2",
    DEMO_RESET_DATABASE_REF: databaseRef, NEXT_PUBLIC_SUPABASE_URL: `https://${databaseRef}.supabase.co`,
    ...overrides,
  })) vi.stubEnv(name, value);
}

function recordingIssuer() {
  const rpc = vi.fn().mockResolvedValue({ data: receipt, error: null });
  const createClient = vi.fn(() => ({ rpc }));
  return { issuer: createPostgresDemoRunIssuer({ createClient }), createClient, rpc };
}

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("explicit demo run issuance", () => {
  it("authorizes demo issuance and passes only server-derived context to one RPC", async () => {
    environment();
    const { issuer, rpc } = recordingIssuer();
    expect(await composeDemoRunIssuance({ actor: actor(), request, issuer })).toEqual({ kind: "ISSUED", receipt });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("demo_reset_issue_run", {
      p_operator_principal_user_id: operator, p_environment_name: "approved-demo-qa",
      p_dataset_id: "demo-dataset-v2", p_database_ref: databaseRef,
      p_request_id: request.issuanceRequestId, p_organization_names: request.organizationNames,
    });
  });

  it("loads the verified session itself in the production entry, with a fixed issuer", async () => {
    environment();
    vi.mocked(requireActor).mockResolvedValue(actor());
    const { rpc } = recordingIssuer();
    vi.mocked(createServiceRoleClient).mockReturnValue({ rpc } as unknown as NonNullable<ReturnType<typeof createServiceRoleClient>>);
    expect(await issueDemoDatasetV2Run(request)).toEqual({ kind: "ISSUED", receipt });
    expect(requireActor).toHaveBeenCalledExactlyOnceWith();
    expect(rpc.mock.calls[0][1].p_operator_principal_user_id).toBe(operator);
  });

  it("does not construct the privileged client when session verification fails", async () => {
    vi.mocked(requireActor).mockRejectedValue(new Error("unauthenticated"));
    await expect(issueDemoDatasetV2Run(request)).rejects.toThrow("unauthenticated");
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it.each([
    { VERCEL_ENV: "production" }, { NEXT_PUBLIC_APP_ENV: "production" },
    { NODE_ENV: "production", VERCEL: undefined, VERCEL_ENV: undefined },
    { NODE_ENV: undefined }, { NODE_ENV: "mystery" }, { VERCEL: "0" },
    { VERCEL_ENV: "mystery" }, { VERCEL: undefined }, { VERCEL_ENV: undefined },
    { NEXT_PUBLIC_APP_ENV: undefined }, { NEXT_PUBLIC_APP_ENV: "mystery" },
    { DEMO_RESET_ENVIRONMENT: "production" }, { DEMO_RESET_ENVIRONMENT: undefined },
    { DEMO_RESET_DATASET_ID: undefined }, { DEMO_RESET_DATABASE_REF: undefined },
    { NEXT_PUBLIC_SUPABASE_URL: "https://unrelated.invalid" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://differentrefabcdefgh.supabase.co" },
    { DEMO_RESET_ENVIRONMENT: "local-development" },
  ])("denies environment %j before any client creation or write", async (overrides) => {
    environment(overrides);
    const { issuer, createClient, rpc } = recordingIssuer();
    expect(await composeDemoRunIssuance({ actor: actor(), request, issuer })).toEqual({ kind: "DENIED", refusal: "ENVIRONMENT_NOT_ELIGIBLE" });
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["principal", "effective", "impersonated", "preview", "unidentified"])("denies %s actor before any writes", async (kind) => {
    environment();
    const denied = actor();
    if (kind === "principal") denied.principal.permissions = [];
    if (kind === "effective") denied.effective.permissions = [];
    if (kind === "impersonated") denied.isImpersonating = true;
    if (kind === "preview") denied.principal.userId = "design-preview-user";
    if (kind === "unidentified") denied.principal.userId = " ";
    const { issuer, createClient, rpc } = recordingIssuer();
    expect(await composeDemoRunIssuance({ actor: denied, request, issuer })).toMatchObject({ kind: "DENIED" });
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("retains environment-denial priority over invalid request and actor", async () => {
    environment({ VERCEL_ENV: "production" });
    const denied = actor();
    denied.principal.permissions = [];
    const { issuer, createClient } = recordingIssuer();
    expect(await composeDemoRunIssuance({ actor: denied, request: null, issuer })).toEqual({ kind: "DENIED", refusal: "ENVIRONMENT_NOT_ELIGIBLE" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each(["runId", "operatorPrincipalUserId", "environmentName", "databaseRef", "datasetId", "issuer"])("rejects caller-supplied %s without database access", async (key) => {
    environment();
    const { issuer, createClient } = recordingIssuer();
    expect(await composeDemoRunIssuance({ actor: actor(), request: { ...request, [key]: randomUUID() }, issuer })).toEqual({ kind: "INVALID_REQUEST" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("keeps UUID command identity distinct and normalizes names", () => {
    expect(parseDemoRunIssuanceRequest({
      issuanceRequestId: request.issuanceRequestId.toUpperCase(),
      organizationNames: { producer: "  Producer\n  One  ", issuer: " Эмитент ", investor: "Fund\t One" },
    })).toEqual({ issuanceRequestId: request.issuanceRequestId, organizationNames: { producer: "Producer One", issuer: "Эмитент", investor: "Fund One" } });
  });

  it.each([null, {}, { ...request, issuanceRequestId: "run-1" },
    { ...request, organizationNames: { ...request.organizationNames, producer: " " } },
    { ...request, organizationNames: { ...request.organizationNames, issuer: "x".repeat(121) } },
    { ...request, organizationNames: { ...request.organizationNames, investor: "bad\u0001name" } },
    { ...request, organizationNames: { ...request.organizationNames, runId: randomUUID() } },
  ])("rejects malformed issuance request %#", (input) => {
    expect(parseDemoRunIssuanceRequest(input)).toBeNull();
  });

  it("reports a changed retry payload as a conflict", async () => {
    environment();
    const { issuer, rpc } = recordingIssuer();
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "demo_run_request_conflict" } });
    expect(await composeDemoRunIssuance({ actor: actor(), request, issuer })).toEqual({ kind: "REQUEST_CONFLICT" });
  });

  it.each(["transport", "database", "malformed", "foreign-receipt", "duplicate-org"])("treats %s as unconfirmed and never retries automatically", async (kind) => {
    environment();
    const { issuer, rpc } = recordingIssuer();
    if (kind === "transport") rpc.mockRejectedValue(new Error("sensitive connection details"));
    if (kind === "database") rpc.mockResolvedValue({ data: null, error: { message: "sensitive connection details" } });
    if (kind === "malformed") rpc.mockResolvedValue({ data: {}, error: null });
    if (kind === "foreign-receipt") rpc.mockResolvedValue({ data: { ...receipt, issuanceRequestId: randomUUID() }, error: null });
    if (kind === "duplicate-org") rpc.mockResolvedValue({ data: { ...receipt, investorOrganizationId: receipt.issuerOrganizationId }, error: null });
    expect(await composeDemoRunIssuance({ actor: actor(), request, issuer })).toEqual({ kind: "UNCONFIRMED" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("dry-run with no current run never reaches issuance, even with a claimed run ID", async () => {
    environment();
    const { issuer } = recordingIssuer();
    const issue = vi.spyOn(issuer, "issue");
    const currentRunInstance = vi.fn().mockResolvedValue({ kind: "NO_RUN" });
    const countRows = vi.fn();
    const outcome = await composeDemoResetDryRun({ actor: actor(), claimedRunId: receipt.runId,
      store: { currentRunInstance }, source: { countRows } });
    expect(outcome).toMatchObject({ kind: "PLANNED", runScope: { kind: "NOT_ESTABLISHED", gap: "RUN_INSTANCE_NOT_ISSUED" }, plan: { status: "INCOMPLETE", sideEffects: "NONE" } });
    expect(currentRunInstance).toHaveBeenCalledExactlyOnceWith({ principalUserId: operator,
      environmentName: "approved-demo-qa", datasetId: "demo-dataset-v2", databaseRef });
    expect(issue).not.toHaveBeenCalled();
    expect(countRows).not.toHaveBeenCalled();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });
});
