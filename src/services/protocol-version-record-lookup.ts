import "server-only";
import { createServerSupabaseClient } from "@/lib/auth/supabase/server";
import { isProtocolReferenceId, parseProtocolVersionRecord, type ProtocolVersionRecord } from "@/domain/market-core/protocol-version-record";

export type ProtocolVersionRecordLookup =
  | { kind: "FOUND"; record: ProtocolVersionRecord }
  | { kind: "ABSENT" }
  | { kind: "UNAVAILABLE"; reason: "INVALID_ID" | "UNAUTHORIZED" | "NOT_CONFIGURED" | "ERROR" | "MALFORMED_RESPONSE" };

/**
 * Exact shared-reference read. Authenticated SELECT has an unconditional shared
 * RLS policy: an accessible empty result means ABSENT. anon/service-role reads
 * fail with a privilege error, never a filtered empty result. No organization,
 * actor fallback, latest pointer, catalog import, write or eligibility decision.
 */
export async function lookupProtocolVersionRecord(versionId: string): Promise<ProtocolVersionRecordLookup> {
  if (!isProtocolReferenceId(versionId)) return { kind: "UNAVAILABLE", reason: "INVALID_ID" };
  try {
    const client = await createServerSupabaseClient((baseFetch) => async (input, init) => {
      const response = await baseFetch(input, init);
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      // The SDK builds this URL from the existing trusted server configuration.
      // Inspect only this table's GET; Auth/JWKS/refresh and other reads are untouched.
      if (method === "GET" && url.pathname.endsWith("/rest/v1/protocol_version_records")
        && response.status !== 200) {
        await response.body?.cancel();
        throw new Error(`protocol_version_reference_http_${response.status}`);
      }
      return response;
    });
    if (!client) return { kind: "UNAVAILABLE", reason: "NOT_CONFIGURED" };
    const auth = await client.auth.getClaims();
    const userId: unknown = auth?.data?.claims?.sub;
    if (auth?.error !== null || typeof userId !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return { kind: "UNAVAILABLE", reason: "UNAUTHORIZED" };
    }
    const response = await client.from("protocol_version_records")
      .select("id,protocol_id,snapshot,activated_at,frozen_at,provenance,recorded_at,recorded_by")
      // A rejected HTTP response above is a fetch error to the SDK. Disable retries
      // on this read only, so a deterministic 404 cannot cause network-error retries.
      .eq("id", versionId).retry(false).limit(2);
    if (response?.error !== null) return { kind: "UNAVAILABLE", reason: "ERROR" };
    if (response.status !== 200 || !Array.isArray(response.data) || response.data.length > 1) {
      return { kind: "UNAVAILABLE", reason: "MALFORMED_RESPONSE" };
    }
    if (response.data.length === 0) return { kind: "ABSENT" };
    const record = parseProtocolVersionRecord(response.data[0]);
    if (!record || record.id !== versionId) return { kind: "UNAVAILABLE", reason: "MALFORMED_RESPONSE" };
    return { kind: "FOUND", record };
  } catch {
    return { kind: "UNAVAILABLE", reason: "ERROR" };
  }
}
