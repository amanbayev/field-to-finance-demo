import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { protocolVersions } from "@/data/market-core/catalog";
import { parseFrozenProtocolSnapshot, parseProtocolVersionRecord } from "@/domain/market-core/protocol-version-record";
import { createServerSupabaseClient } from "@/lib/auth/supabase/server";
import { lookupProtocolVersionRecord } from "./protocol-version-record-lookup";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
const sql = readFileSync("supabase/migrations/20260910045213_mc03_immutable_protocol_version_reference.sql", "utf8");
const source = JSON.parse(sql.split("$mc03_snapshot$")[1]);
const provenance = JSON.parse(sql.split("$mc03_provenance$")[1]);
const user = "00000000-0000-4000-8000-000000000001";
function row() {
  return { id: source.id, protocol_id: source.protocolId, snapshot: structuredClone(source),
    activated_at: null, frozen_at: null, provenance: structuredClone(provenance),
    recorded_at: "2026-09-10T04:00:00.123456+00:00", recorded_by: "postgres" };
}
function setup(data: unknown = [row()], error: unknown = null, status: unknown = 200) {
  // Only the exact read capabilities exist; writes, RPCs and current-version calls fail.
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data, error, status }) };
  const client = { auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: user } }, error: null }) }, from: vi.fn(() => query) };
  vi.mocked(createServerSupabaseClient).mockResolvedValue(client as unknown as NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>);
  return { query, client };
}
afterEach(() => vi.resetAllMocks());

describe("MC-03 exact established source and complete runtime contract", () => {
  it("copies the complete catalog object into the explicit SQL importer without invented dates", () => {
    expect(source).toEqual(protocolVersions[0]);
    expect(Object.keys(source)).toHaveLength(11);
    expect(Object.keys(source.rules)).toHaveLength(7);
    expect(source.activatedAt).toBeNull(); expect(source.frozenAt).toBeNull();
    expect(provenance).toEqual({ kind: "GIT_CATALOG_REFERENCE",
      repository: "https://github.com/amanbayev/field-to-finance-demo.git",
      commit: "1d9e16b363336756032824bcb1946fd1b57f7e53", path: "src/data/market-core/catalog.ts", exportName: "protocolVersions" });
    expect(parseFrozenProtocolSnapshot(source)).toEqual(source);
  });
  it("rejects missing or extra fields at both snapshot levels", () => {
    for (const key of Object.keys(source)) {
      const s = structuredClone(source); delete s[key];
      expect(parseFrozenProtocolSnapshot(s), key).toBeNull();
    }
    for (const key of Object.keys(source.rules)) {
      const s = structuredClone(source); delete s.rules[key];
      expect(parseFrozenProtocolSnapshot(s), key).toBeNull();
    }
    expect(parseFrozenProtocolSnapshot({ ...source, extra: true })).toBeNull();
    expect(parseFrozenProtocolSnapshot({ ...source, rules: { ...source.rules, extra: true } })).toBeNull();
  });
  it.each([null, undefined, [], "{}", 1, true])("rejects a non-object snapshot %j", (s) => {
    expect(parseFrozenProtocolSnapshot(s)).toBeNull();
  });
  it("rejects coercible values before regex and malformed nested values", () => {
    for (const patch of [{ id: [source.id] }, { protocolId: ["F2F"] }, { displayVersion: 1.1 },
      { frozen: "true" }, { frozen: false }, { governanceNote: null }, { state: "ADMITTED" },
      { supersedesVersionId: [] }, { supersededByVersionId: 12 }, { activatedAt: ["2026-09-10T00:00:00Z"] },
      { rules: { ...source.rules, modules: "fields" } }, { rules: { ...source.rules, lifecycle: [null] } },
      { rules: { ...source.rules, riskModel: " " } }]) {
      expect(parseFrozenProtocolSnapshot({ ...source, ...patch })).toBeNull();
    }
  });
  it.each(["2026-02-30T00:00:00Z", "2026-09-10", "2026-09-10T24:00:00Z", "2026-09-10T00:60:00Z", "2026-09-10T00:00:60Z", "0000-01-01T00:00:00Z", "2026-09-10T00:00:00+99:00"])("rejects invalid timestamps without repairing %s", (date) => {
    expect(parseFrozenProtocolSnapshot({ ...source, activatedAt: date })).toBeNull();
    expect(parseProtocolVersionRecord({ ...row(), recorded_at: date })).toBeNull();
  });
  it("preserves valid nullable source dates as original strings", () => {
    const date = "2024-02-29T12:34:56.123456+05:00";
    expect(parseFrozenProtocolSnapshot({ ...source, frozenAt: date })?.frozenAt).toBe(date);
  });
  it("validates every persisted field and deeply freezes an independent copy", () => {
    const original = row(); const parsed = parseProtocolVersionRecord(original)!;
    expect(parsed).not.toBeNull();
    expect(parsed.snapshot).toEqual(source); expect(parsed.provenance).toEqual(provenance);
    original.snapshot.rules.modules.push("later mutation"); original.provenance.commit = "a".repeat(40);
    expect(parsed.snapshot.rules.modules).toEqual(source.rules.modules);
    expect(parsed.provenance).toEqual(provenance);
    expect(Object.isFrozen(parsed)).toBe(true); expect(Object.isFrozen(parsed.snapshot.rules.lifecycle)).toBe(true);
    expect(Object.isFrozen(parsed.provenance)).toBe(true);
    for (const key of Object.keys(row())) {
      const r: Record<string, unknown> = row(); delete r[key]; expect(parseProtocolVersionRecord(r), key).toBeNull();
    }
    for (const patch of [{ id: [source.id] }, { protocol_id: "OTHER" }, { activated_at: "2026-09-10T00:00:00Z" },
      { frozen_at: undefined }, { recorded_at: ["2026-09-10T00:00:00Z"] }, { recorded_by: "" },
      { provenance: null }, { provenance: { ...provenance, commit: [provenance.commit] } },
      { provenance: { ...provenance, path: null } }, { provenance: { ...provenance, extra: true } }]) {
      expect(parseProtocolVersionRecord({ ...row(), ...patch })).toBeNull();
    }
  });
});

describe("server-only exact persisted version lookup", () => {
  it("returns FOUND with the exact snapshot, source provenance and separate recording timestamp", async () => {
    const { client, query } = setup();
    expect(await lookupProtocolVersionRecord(source.id)).toEqual({ kind: "FOUND", record: parseProtocolVersionRecord(row()) });
    expect(client.auth.getClaims).toHaveBeenCalledExactlyOnceWith();
    expect(client.from).toHaveBeenCalledExactlyOnceWith("protocol_version_records");
    expect(query.eq).toHaveBeenCalledExactlyOnceWith("id", "F2F-V1.1");
    expect(query.limit).toHaveBeenCalledExactlyOnceWith(2);
    expect(query.select).toHaveBeenCalledExactlyOnceWith("id,protocol_id,snapshot,activated_at,frozen_at,provenance,recorded_at,recorded_by");
  });
  it.each(["F2F-V1.1", "F2F-V9.9", "WHEAT-2027", "latest", "current"])("returns ABSENT for accessible empty %s; never fixture/current/symbol fallback", async (id) => {
    const { query } = setup([]);
    expect(await lookupProtocolVersionRecord(id)).toEqual({ kind: "ABSENT" });
    expect(query.eq).toHaveBeenCalledExactlyOnceWith("id", id);
  });
  it.each([undefined, null, {}, false, "[]", [null], [row(), row()]])("rejects malformed response %j", async (data) => {
    const { query } = setup(); query.limit.mockResolvedValue({ data, error: null, status: 200 });
    expect(await lookupProtocolVersionRecord(source.id)).toEqual({ kind: "UNAVAILABLE", reason: "MALFORMED_RESPONSE" });
  });
  it("does not adopt another valid persisted version or malformed snapshot", async () => {
    const r = row(); r.id = "F2F-V2"; r.snapshot.id = r.id; setup([r]);
    expect(await lookupProtocolVersionRecord(source.id)).toEqual({ kind: "UNAVAILABLE", reason: "MALFORMED_RESPONSE" });
    r.id = source.id; r.snapshot = {}; setup([r]);
    expect(await lookupProtocolVersionRecord(source.id)).toEqual({ kind: "UNAVAILABLE", reason: "MALFORMED_RESPONSE" });
  });
  it.each([null, undefined, "", ["F2F-V1.1"], {}, 3, "bad id", "a".repeat(129)])("validates input types before regex %j", async (id) => {
    expect(await lookupProtocolVersionRecord(id as string)).toEqual({ kind: "UNAVAILABLE", reason: "INVALID_ID" });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
  it.each([null, undefined, [user], 123, "invalid"])("rejects unavailable/malformed identity %j before DB access", async (sub) => {
    const { client } = setup(); client.auth.getClaims.mockResolvedValue({ data: { claims: { sub } }, error: null });
    expect(await lookupProtocolVersionRecord(source.id)).toEqual({ kind: "UNAVAILABLE", reason: "UNAUTHORIZED" });
    expect(client.from).not.toHaveBeenCalled();
  });
  it("distinguishes unconfigured, thrown and denied reads from absence", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(null);
    expect(await lookupProtocolVersionRecord(source.id)).toEqual({ kind: "UNAVAILABLE", reason: "NOT_CONFIGURED" });
    setup([], { code: "42501" });
    expect(await lookupProtocolVersionRecord(source.id)).toEqual({ kind: "UNAVAILABLE", reason: "ERROR" });
    const { query } = setup(); query.limit.mockRejectedValue(new Error("transport unavailable"));
    expect(await lookupProtocolVersionRecord(source.id)).toEqual({ kind: "UNAVAILABLE", reason: "ERROR" });
    for (const status of [401, 403, 500, undefined, "200"]) {
      const s = setup(); s.query.limit.mockResolvedValue({ data: [], error: null, status });
      expect((await lookupProtocolVersionRecord(source.id)).kind).toBe("UNAVAILABLE");
    }
  });
  it("contains no import/fixture/write path and is explicitly server-only", () => {
    const service = readFileSync("src/services/protocol-version-record-lookup.ts", "utf8");
    expect(service).toContain('import "server-only"');
    expect(service).not.toMatch(/from ["'].*catalog|\.rpc\(|\.insert\(|\.upsert\(|\.update\(|import_known_protocol_version|currentVersionForProtocol/);
  });
});
