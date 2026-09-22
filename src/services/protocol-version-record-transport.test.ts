import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { protocolVersions } from "@/data/market-core/catalog";
import { createServerSupabaseClient } from "@/lib/auth/supabase/server";
import { lookupProtocolVersionRecord } from "./protocol-version-record-lookup";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/auth/supabase/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth/supabase/server")>(),
  createServerSupabaseClient: vi.fn(),
}));

const origin = "https://mc03.invalid";
const key = "synthetic-publishable-key";
const user = { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated",
  app_metadata: {}, user_metadata: {}, created_at: "2026-09-10T00:00:00Z" };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
function session(expired = false) {
  const exp = Math.floor(Date.now() / 1000) + (expired ? -3600 : 3600);
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, role: "authenticated", exp })}.${Buffer.from("synthetic-signature").toString("base64url")}`;
  return { access_token: token, refresh_token: "synthetic-refresh-token", token_type: "bearer", expires_at: exp, expires_in: 3600, user };
}
function row(id = "F2F-V1.1") {
  const snapshot = { ...structuredClone(protocolVersions[0]), id };
  return { id, protocol_id: snapshot.protocolId, snapshot, activated_at: null, frozen_at: null,
    provenance: { kind: "GIT_CATALOG_REFERENCE", repository: "synthetic repository", commit: "a".repeat(40), path: "synthetic path", exportName: "versions" },
    recorded_at: "2026-09-10T04:00:00.123456+00:00", recorded_by: "postgres" };
}
const cookieValues = new Map<string, string>();
const cookieStore = {
  getAll: vi.fn(() => [...cookieValues].map(([name, value]) => ({ name, value }))),
  set: vi.fn((name: string, value: string) => { cookieValues.set(name, value); }),
};
function setSession(value: ReturnType<typeof session>) {
  cookieValues.set("sb-mc03-auth-token", `base64-${encode(value)}`);
}
let requests: Request[];
let respond: (request: Request) => Promise<Response>;
let authRespond: (request: Request) => Promise<Response>;
let accessToken: string;
const tableRequests = () => requests.filter(r => new URL(r.url).pathname === "/rest/v1/protocol_version_records");

beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", origin);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key);
  cookieValues.clear();
  const current = session(); accessToken = current.access_token; setSession(current);
  requests = [];
  respond = async () => new Response("[]", { status: 200 });
  authRespond = async (request) => {
    expect(new URL(request.url).pathname).toBe("/auth/v1/user");
    return Response.json(user);
  };
  vi.mocked(cookies).mockResolvedValue(cookieStore as unknown as Awaited<ReturnType<typeof cookies>>);
  const actual = await vi.importActual<typeof import("@/lib/auth/supabase/server")>("@/lib/auth/supabase/server");
  const intercept: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    expect(new URL(request.url).origin).toBe(origin);
    requests.push(request);
    return new URL(request.url).pathname.startsWith("/auth/") ? authRespond(request) : respond(request);
  };
  // Replace only the base transport through the production factory's opt-in seam.
  // The production lookup, factory, SSR client, getClaims, cookies and SDK all run.
  // No global fetch replacement, fake post-SDK result, live URL or auth bypass.
  vi.mocked(createServerSupabaseClient).mockImplementation(transport =>
    actual.createServerSupabaseClient(() => transport ? transport(intercept) : intercept));
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const responses = [
  { label: "200 empty", status: 200, body: "[]", kind: "ABSENT" },
  { label: "200 valid row", status: 200, body: JSON.stringify([row()]), kind: "FOUND" },
  { label: "404 empty array", status: 404, body: "[]", kind: "UNAVAILABLE" },
  { label: "404 other array", status: 404, body: JSON.stringify([row()]), kind: "UNAVAILABLE" },
  { label: "404 PGRST205", status: 404, body: JSON.stringify({ code: "PGRST205", message: "table not found" }), kind: "UNAVAILABLE" },
  { label: "404 empty body", status: 404, body: "", kind: "UNAVAILABLE" },
  ...[201, 206, 401, 403, 500].map(status => ({ label: `${status} array`, status, body: "[]", kind: "UNAVAILABLE" })),
  { label: "204 no content", status: 204, body: null, kind: "UNAVAILABLE" },
  { label: "200 malformed JSON", status: 200, body: "not JSON", kind: "UNAVAILABLE" },
  { label: "200 malformed row", status: 200, body: "[{}]", kind: "UNAVAILABLE" },
  { label: "200 foreign ID", status: 200, body: JSON.stringify([row("FOREIGN-V1")]), kind: "UNAVAILABLE" },
  { label: "200 duplicate rows", status: 200, body: JSON.stringify([row(), row()]), kind: "UNAVAILABLE" },
];

describe("MC-03 original HTTP status through the installed SSR/Supabase SDK", () => {
  it.each(responses)("$label → $kind with exactly one reference request", async ({ status, body, kind }) => {
    respond = async () => new Response(body, { status, headers: { "content-type": "application/json" } });
    const result = await lookupProtocolVersionRecord("F2F-V1.1");
    expect(result.kind).toBe(kind);
    if (result.kind === "FOUND") expect(result.record.snapshot).toEqual(protocolVersions[0]);
    expect(createServerSupabaseClient).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
    expect(tableRequests()).toHaveLength(1);
    const request = tableRequests()[0], url = new URL(request.url);
    expect(request.method).toBe("GET");
    expect(url.searchParams.get("id")).toBe("eq.F2F-V1.1");
    expect(url.searchParams.get("limit")).toBe("2");
    expect(url.searchParams.get("select")).toBe("id,protocol_id,snapshot,activated_at,frozen_at,provenance,recorded_at,recorded_by");
    expect(request.headers.get("authorization")).toBe(`Bearer ${accessToken}`);
    expect(request.headers.get("apikey")).toBe(key);
    expect(requests.filter(r => new URL(r.url).pathname === "/auth/v1/user")).toHaveLength(1);
    expect(cookieStore.getAll).toHaveBeenCalled();
  });

  it.each([new TypeError("synthetic network failure"), new DOMException("synthetic abort", "AbortError")])("fails closed for %s without retries", async error => {
    respond = async () => { throw error; };
    expect(await lookupProtocolVersionRecord("F2F-V1.1")).toMatchObject({ kind: "UNAVAILABLE" });
    expect(tableRequests()).toHaveLength(1);
  });

  it("keeps two simultaneous lookup transports independent", async () => {
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    respond = async request => {
      if (new URL(request.url).searchParams.get("id") === "eq.FAILING-V1") {
        enter(); await gate; return new Response("[]", { status: 404 });
      }
      return Response.json([row("READABLE-V1")]);
    };
    const failing = lookupProtocolVersionRecord("FAILING-V1");
    await entered;
    try {
      expect(await lookupProtocolVersionRecord("READABLE-V1")).toMatchObject({ kind: "FOUND", record: { id: "READABLE-V1" } });
    } finally { release(); }
    expect(await failing).toMatchObject({ kind: "UNAVAILABLE" });
    expect(tableRequests()).toHaveLength(2);
  });

  it("refreshes expired SSR cookies and sends the refreshed authorization to the read", async () => {
    setSession(session(true));
    const refreshed = session(); refreshed.access_token += "-refreshed";
    authRespond = async request => {
      if (new URL(request.url).pathname === "/auth/v1/token") {
        expect(request.method).toBe("POST");
        expect(new URL(request.url).searchParams.get("grant_type")).toBe("refresh_token");
        expect(await request.json()).toMatchObject({ refresh_token: "synthetic-refresh-token" });
        // Auth's valid 201 response must not be subject to the table's 200-only rule.
        return Response.json(refreshed, { status: 201 });
      }
      return Response.json(user);
    };
    expect(await lookupProtocolVersionRecord("F2F-V1.1")).toEqual({ kind: "ABSENT" });
    expect(tableRequests()[0].headers.get("authorization")).toBe(`Bearer ${refreshed.access_token}`);
    expect(cookieStore.set).toHaveBeenCalled();
    const stored = [...cookieValues].filter(([name]) => name.startsWith("sb-mc03-auth-token")).map(([, value]) => value).join("");
    expect(JSON.parse(Buffer.from(stored.slice("base64-".length), "base64url").toString()).access_token).toBe(refreshed.access_token);
  });

  it("retains real JWT verification through the Auth JWKS request", async () => {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const kid = randomUUID(), current = session();
    const publicKey = { ...await crypto.subtle.exportKey("jwk", pair.publicKey), kid, alg: "ES256", use: "sig" };
    const unsigned = `${encode({ alg: "ES256", typ: "JWT", kid })}.${encode({ sub: user.id, role: "authenticated", exp: current.expires_at })}`;
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(unsigned));
    current.access_token = `${unsigned}.${Buffer.from(signature).toString("base64url")}`;
    setSession(current);
    authRespond = async request => {
      expect(new URL(request.url).pathname).toBe("/auth/v1/.well-known/jwks.json");
      return Response.json({ keys: [publicKey] });
    };
    expect(await lookupProtocolVersionRecord("F2F-V1.1")).toEqual({ kind: "ABSENT" });
    expect(requests.filter(r => new URL(r.url).pathname.endsWith("/jwks.json"))).toHaveLength(1);
    expect(tableRequests()[0].headers.get("authorization")).toBe(`Bearer ${current.access_token}`);
  });

  it.each(["/auth/v1/user", "/auth/v1/token", "/auth/v1/.well-known/jwks.json", "/rest/v1/market_core_participants", "/rest/v1/protocol_version_records_history"])("passes unrelated %s response through unchanged", async path => {
    await lookupProtocolVersionRecord("F2F-V1.1");
    const transport = vi.mocked(createServerSupabaseClient).mock.calls[0][0]!;
    const response = new Response("unrelated original failure", { status: 404 });
    const base = vi.fn<typeof fetch>().mockResolvedValue(response);
    const request = new Request(origin + path);
    expect(await transport(base)(request)).toBe(response);
    expect(await response.text()).toBe("unrelated original failure");
    expect(base).toHaveBeenCalledExactlyOnceWith(request, undefined);
  });
});
