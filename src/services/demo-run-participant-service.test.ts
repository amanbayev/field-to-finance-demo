import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildPrincipal, resolveActorContext, permissionsForRole, type ActorContext, type MembershipRecord, type OrganizationRecord } from "@/domain/identity";
import { parseDemoRunParticipantRequest, type DemoRunParticipantReceipt } from "@/domain/demo-run/participant-binding";
import { createPostgresDemoRunParticipantBinder } from "@/data/demo-reset/postgres-participant-binder";
import { bindDemoDatasetV2RunParticipants, composeDemoRunParticipantBinding } from "./demo-run-participant-service";
import { composeDemoResetDryRun } from "./demo-reset-service";
import { requireActor } from "@/lib/auth/load-actor";
import { createServiceRoleClient } from "@/lib/auth/supabase/admin";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/load-actor", () => ({ requireActor: vi.fn() }));
vi.mock("@/lib/auth/supabase/admin", () => ({ createServiceRoleClient: vi.fn() }));

const operator = randomUUID();
const databaseRef = "examplerefabcdefghij";
const request = { requestId: randomUUID(), producerUserId: randomUUID(), issuerUserId: randomUUID(), investorUserId: randomUUID() };
const participant = (userId: string, roleId: string) => ({
  userId, roleId, organizationId: randomUUID(), membershipId: randomUUID(), membershipRoleId: randomUUID(),
});
const receipt: DemoRunParticipantReceipt = { requestId: request.requestId, runId: randomUUID(),
  producer: participant(request.producerUserId, "PRODUCER_ADMIN"),
  issuer: participant(request.issuerUserId, "ISSUER_OPERATOR"),
  investor: participant(request.investorUserId, "INVESTOR"),
};

function actor(): ActorContext {
  const permissions = permissionsForRole("SYSTEM_ADMIN");
  return {
    principal: { userId: operator, email: null, displayName: "Operator", status: "ACTIVE",
      permissions, memberships: [], organizations: [], roleIds: ["SYSTEM_ADMIN"] },
    effective: { roleId: "SYSTEM_ADMIN", permissions, producerIds: [] }, isImpersonating: false,
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
function recordingBinder() {
  const rpc = vi.fn().mockResolvedValue({ data: receipt, error: null });
  const createClient = vi.fn(() => ({ rpc }));
  return { binder: createPostgresDemoRunParticipantBinder({ createClient }), createClient, rpc };
}
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("Golden Path participant server boundary", () => {
  it("authorizes one RPC with trusted context and only participant/request UUID inputs", async () => {
    environment();
    const { binder, rpc } = recordingBinder();
    expect(await composeDemoRunParticipantBinding({ actor: actor(), request, binder })).toEqual({ kind: "BOUND", receipt });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("demo_reset_bind_run_participants", {
      p_operator_principal_user_id: operator, p_environment_name: "approved-demo-qa",
      p_dataset_id: "demo-dataset-v2", p_database_ref: databaseRef, p_request_id: request.requestId,
      p_producer_user_id: request.producerUserId, p_issuer_user_id: request.issuerUserId,
      p_investor_user_id: request.investorUserId,
    });
  });
  it("loads its own verified actor and fixes the production binder", async () => {
    environment();
    vi.mocked(requireActor).mockResolvedValue(actor());
    const { rpc } = recordingBinder();
    vi.mocked(createServiceRoleClient).mockReturnValue({ rpc } as unknown as NonNullable<ReturnType<typeof createServiceRoleClient>>);
    expect(await bindDemoDatasetV2RunParticipants(request)).toEqual({ kind: "BOUND", receipt });
    expect(requireActor).toHaveBeenCalledExactlyOnceWith();
    expect(rpc.mock.calls[0][1].p_operator_principal_user_id).toBe(operator);
  });
  it("makes zero privileged calls on authentication failure", async () => {
    vi.mocked(requireActor).mockRejectedValue(new Error("unauthenticated"));
    await expect(bindDemoDatasetV2RunParticipants(request)).rejects.toThrow("unauthenticated");
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
  ])("denies environment %j before client creation", async (overrides) => {
    environment(overrides);
    const { binder, createClient, rpc } = recordingBinder();
    expect(await composeDemoRunParticipantBinding({ actor: actor(), request, binder })).toEqual({ kind: "DENIED", refusal: "ENVIRONMENT_NOT_ELIGIBLE" });
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["principal", "effective", "impersonated", "preview", "unidentified"])("denies %s actor without writes", async (kind) => {
    environment();
    const denied = actor();
    if (kind === "principal") denied.principal.permissions = [];
    if (kind === "effective") denied.effective.permissions = [];
    if (kind === "impersonated") denied.isImpersonating = true;
    if (kind === "preview") denied.principal.userId = "design-preview-user";
    if (kind === "unidentified") denied.principal.userId = " ";
    const { binder, createClient } = recordingBinder();
    expect(await composeDemoRunParticipantBinding({ actor: denied, request, binder })).toMatchObject({ kind: "DENIED" });
    expect(createClient).not.toHaveBeenCalled();
  });
  it("retains production denial priority", async () => {
    environment({ VERCEL_ENV: "production" });
    const denied = actor(); denied.principal.permissions = [];
    const { binder, createClient } = recordingBinder();
    expect(await composeDemoRunParticipantBinding({ actor: denied, request: null, binder })).toEqual({ kind: "DENIED", refusal: "ENVIRONMENT_NOT_ELIGIBLE" });
    expect(createClient).not.toHaveBeenCalled();
  });
  it.each(["runId", "producerOrganizationId", "issuerOrganizationId", "investorOrganizationId", "roleId", "producerRole",
    "operatorPrincipalUserId", "environmentName", "databaseRef", "datasetId", "binder"])("refuses caller authority field %s", async (key) => {
    environment();
    const { binder, createClient } = recordingBinder();
    expect(await composeDemoRunParticipantBinding({ actor: actor(), request: { ...request, [key]: randomUUID() }, binder })).toEqual({ kind: "INVALID_REQUEST" });
    expect(createClient).not.toHaveBeenCalled();
  });
  it.each([null, {}, [], { ...request, requestId: "invalid" }, { ...request, producerUserId: "invalid" },
    { ...request, issuerUserId: null }, { ...request, investorUserId: "" },
    { ...request, issuerUserId: request.producerUserId }, { ...request, investorUserId: request.issuerUserId },
    { ...request, investorUserId: request.producerUserId.toUpperCase() }, { ...request, requestId: request.producerUserId },
  ])("rejects malformed/duplicate participant request %# with no writes", async (value) => {
    environment();
    const { binder, createClient } = recordingBinder();
    expect(await composeDemoRunParticipantBinding({ actor: actor(), request: value, binder })).toEqual({ kind: "INVALID_REQUEST" });
    expect(createClient).not.toHaveBeenCalled();
  });
  it("normalizes UUID case", () => {
    expect(parseDemoRunParticipantRequest(Object.fromEntries(Object.entries(request).map(([k,v]) => [k, v.toUpperCase()])))).toEqual(request);
  });
  it.each([
    ["demo_participant_request_conflict", "REQUEST_CONFLICT"], ["demo_participant_run_changed", "RUN_CHANGED"],
    ["demo_participant_current_run_missing", "CURRENT_RUN_MISSING"], ["demo_participant_run_mismatch", "RUN_MISMATCH"],
    ["demo_participant_profile_unavailable", "PROFILE_UNAVAILABLE"],
  ])("maps database refusal %s", async (message, kind) => {
    environment();
    const { binder, rpc } = recordingBinder();
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message } });
    expect(await composeDemoRunParticipantBinding({ actor: actor(), request, binder })).toEqual({ kind });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["transport", "database", "unknown-refusal", "malformed", "foreign-request", "foreign-user", "wrong-role", "duplicate-org", "duplicate-membership", "duplicate-role", "missing-field"])("treats %s response as unconfirmed without automatic retry", async (kind) => {
    environment();
    const { binder, rpc } = recordingBinder();
    const changed = structuredClone(receipt);
    if (kind === "foreign-request") changed.requestId = randomUUID();
    if (kind === "foreign-user") changed.producer.userId = randomUUID();
    if (kind === "wrong-role") changed.issuer.roleId = "SYSTEM_ADMIN";
    if (kind === "duplicate-org") changed.investor.organizationId = changed.producer.organizationId;
    if (kind === "duplicate-membership") changed.investor.membershipId = changed.producer.membershipId;
    if (kind === "duplicate-role") changed.investor.membershipRoleId = changed.producer.membershipRoleId;
    if (kind === "missing-field") changed.investor.membershipId = "";
    rpc.mockResolvedValue({ data: changed, error: null });
    if (kind === "malformed") rpc.mockResolvedValue({ data: {}, error: null });
    if (kind === "transport") rpc.mockRejectedValue(new Error("sensitive connection details"));
    if (kind === "database") rpc.mockResolvedValue({ data: null, error: { message: "sensitive connection details" } });
    if (kind === "unknown-refusal") rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "toString" } });
    expect(await composeDemoRunParticipantBinding({ actor: actor(), request, binder })).toEqual({ kind: "UNCONFIRMED" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("treats absent client and thrown internal port as unconfirmed", async () => {
    environment();
    const binder = createPostgresDemoRunParticipantBinder({ createClient: () => null });
    expect(await composeDemoRunParticipantBinding({ actor: actor(), request, binder })).toEqual({ kind: "UNCONFIRMED" });
    expect(await composeDemoRunParticipantBinding({ actor: actor(), request, binder: { bind: vi.fn().mockRejectedValue(new Error("lost")) } })).toEqual({ kind: "UNCONFIRMED" });
  });
  it("dry-run after binding uses existing inventory and stays INCOMPLETE with no binding effect", async () => {
    environment();
    const { binder, rpc } = recordingBinder();
    await composeDemoRunParticipantBinding({ actor: actor(), request, binder });
    rpc.mockClear();
    const outcome = await composeDemoResetDryRun({ actor: actor(),
      store: { currentRunInstance: vi.fn().mockResolvedValue({ kind: "RUN", run: {
        runId: receipt.runId, operatorPrincipalUserId: operator, environmentName: "approved-demo-qa",
        datasetId: "demo-dataset-v2", databaseRef,
      } }) },
      source: { countRows: vi.fn().mockResolvedValue({ kind: "COUNTED", rows: 3 }) },
    });
    expect(outcome).toMatchObject({ kind: "PLANNED", runScope: { kind: "ESTABLISHED", runId: receipt.runId },
      plan: { status: "INCOMPLETE", sideEffects: "NONE" } });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("keeps mutation capability server-only and separate from dry-run and identity provisioning", () => {
    for (const path of ["src/services/demo-run-participant-service.ts", "src/data/demo-reset/postgres-participant-binder.ts"]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain('import "server-only"');
      expect(source).not.toMatch(/"use server"|\.auth\.|\.storage\.|\.from\(|\.delete\(/);
    }
    expect(readFileSync("src/services/demo-reset-service.ts", "utf8")).not.toMatch(/participant-binder|participant-service/);
  });
});

describe("existing reusable identity resolution", () => {
  const organizations: OrganizationRecord[] = [
    { id: randomUUID(), slug: "p", name: "P", type: "PRODUCER", status: "ACTIVE" },
    { id: randomUUID(), slug: "i", name: "I", type: "ISSUER", status: "ACTIVE" },
    { id: randomUUID(), slug: "f", name: "F", type: "INVESTMENT_FUND", status: "ACTIVE" },
  ];
  const memberships: MembershipRecord[] = organizations.map((org, i) => ({
    id: randomUUID(), userId: request.producerUserId, organizationId: org.id, status: "ACTIVE",
    roleIds: [(["PRODUCER_ADMIN", "ISSUER_OPERATOR", "INVESTOR"] as const)[i]],
  }));
  function principal(activeOrganizationId: string) {
    return buildPrincipal({ userId: request.producerUserId, email: null, displayName: "Reusable",
      status: "ACTIVE", organizations, memberships, activeOrganizationId });
  }
  it("allows one generic user to hold all three memberships while permissions stay in the active organization", () => {
    const before = structuredClone(memberships);
    for (let i = 0; i < organizations.length; i++) {
      const selected = principal(organizations[i].id);
      expect(selected.memberships).toHaveLength(3);
      expect(selected.roleIds).toEqual(memberships[i].roleIds);
      expect(selected.permissions).toEqual(permissionsForRole(memberships[i].roleIds[0]));
    }
    expect(memberships).toEqual(before);
  });
  it("derives effective participant membership without a demo persona or fabricated business mappings", () => {
    const actor = resolveActorContext({ principal: principal(organizations[0].id), session: null,
      persona: undefined, personaOrganization: undefined });
    expect(actor.effective.membershipId).toBe(memberships[0].id);
    expect(actor.effective.roleId).toBe("PRODUCER_ADMIN");
    expect(actor.effective.producerIds).toEqual([]);
    expect(actor.effective.investorReference).toBeNull();
    expect(actor.isImpersonating).toBe(false);
    expect(actor.demoPersona).toBeNull();
  });
  it("documents stale active-org fallback without pretending the persistent session was repaired", () => {
    const stale = randomUUID();
    const session = { principalUserId: request.producerUserId, activeOrganizationId: stale };
    const actor = resolveActorContext({ principal: principal(stale), session,
      persona: undefined, personaOrganization: undefined });
    expect(actor.effective.organization?.id).toBe(organizations[0].id);
    expect(actor.activeOrganizationId).toBe(stale);
    expect(session.activeOrganizationId).toBe(stale);
  });
});
