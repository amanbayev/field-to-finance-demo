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
    const client = await createServerSupabaseClient();
    if (!client) return { kind: "UNAVAILABLE", reason: "NOT_CONFIGURED" };
    const auth = await client.auth.getClaims();
    const userId: unknown = auth?.data?.claims?.sub;
    if (auth?.error !== null || typeof userId !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return { kind: "UNAVAILABLE", reason: "UNAUTHORIZED" };
    }
    const response = await client.from("protocol_version_records")
      .select("id,protocol_id,snapshot,activated_at,frozen_at,provenance,recorded_at,recorded_by")
      .eq("id", versionId).limit(2);
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
