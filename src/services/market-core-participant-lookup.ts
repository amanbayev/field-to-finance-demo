import "server-only";
import { createServerSupabaseClient } from "@/lib/auth/supabase/server";

export interface InstitutionalParticipant {
  id: string;
  organizationId: string;
  status: "ACTIVE" | "SUSPENDED" | "RETIRED";
  createdAt: string;
}

/** Internal result. Every denied/unavailable read has the same public meaning. */
export type ParticipantIdentityLookup =
  | { kind: "FOUND"; participant: InstitutionalParticipant }
  | { kind: "ABSENT" }
  | { kind: "UNAVAILABLE"; reason: "UNAUTHORIZED" | "NOT_CONFIGURED" | "ERROR" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PARTICIPANT_ID = /^PAR-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Read one explicitly selected institution using the authenticated client and RLS.
 * A single embedded SELECT checks the persisted session, active profile, exact
 * organization and real membership in the same statement snapshot as the identity.
 * An authorized empty participant relation means ABSENT; an empty context does not.
 * No actor fallback, impersonation, service role, CURRENT run, RPC or write path.
 */
export async function lookupMarketCoreParticipant(
  organizationId: string,
): Promise<ParticipantIdentityLookup> {
  if (!UUID.test(organizationId)) {
    return { kind: "UNAVAILABLE", reason: "UNAUTHORIZED" };
  }
  const requestedId = organizationId.toLowerCase();
  try {
    const client = await createServerSupabaseClient();
    if (!client) return { kind: "UNAVAILABLE", reason: "NOT_CONFIGURED" };
    const { data: claims, error: authError } = await client.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (authError || typeof userId !== "string" || !UUID.test(userId)) {
      return { kind: "UNAVAILABLE", reason: "UNAUTHORIZED" };
    }
    const { data, error } = await client
      .from("session_contexts")
      .select(`principal_user_id, active_organization_id, effective_demo_persona_id,
        profiles!inner(user_id, status),
        organizations!inner(id, status,
          memberships!inner(id, user_id, organization_id, status),
          market_core_participants(id, organization_id, status, created_at))`)
      .eq("principal_user_id", userId)
      .eq("active_organization_id", requestedId)
      .is("effective_demo_persona_id", null)
      .eq("profiles.status", "ACTIVE")
      .eq("organizations.status", "ACTIVE")
      .eq("organizations.memberships.user_id", userId)
      .eq("organizations.memberships.status", "ACTIVE")
      .maybeSingle();
    if (error) return { kind: "UNAVAILABLE", reason: "ERROR" };
    if (!data) return { kind: "UNAVAILABLE", reason: "UNAUTHORIZED" };

    // Untyped client schema: validate the relationship shape rather than adopting
    // an arbitrary row or treating malformed/unavailable data as an absent identity.
    const row = data as unknown as {
      principal_user_id: string;
      active_organization_id: string;
      effective_demo_persona_id: string | null;
      profiles: { user_id: string; status: string };
      organizations: {
        id: string; status: string;
        memberships: { id: string; user_id: string; organization_id: string; status: string }[];
        market_core_participants: {
          id: string; organization_id: string; status: string; created_at: string;
        } | null;
      };
    };
    const org = row.organizations;
    if (row.principal_user_id !== userId || row.active_organization_id !== requestedId
      || row.effective_demo_persona_id !== null
      || row.profiles?.user_id !== userId || row.profiles?.status !== "ACTIVE"
      || org?.id !== requestedId || org.status !== "ACTIVE"
      || !Array.isArray(org.memberships) || org.memberships.length !== 1
      || org.memberships[0].user_id !== userId || org.memberships[0].organization_id !== requestedId
      || org.memberships[0].status !== "ACTIVE" || !UUID.test(org.memberships[0].id)) {
      return { kind: "UNAVAILABLE", reason: "UNAUTHORIZED" };
    }
    const participant = org.market_core_participants;
    if (participant === null) return { kind: "ABSENT" };
    if (!participant || !PARTICIPANT_ID.test(participant.id)
      || participant.organization_id !== requestedId
      || !(participant.status === "ACTIVE" || participant.status === "SUSPENDED" || participant.status === "RETIRED")
      || typeof participant.created_at !== "string" || !Number.isFinite(Date.parse(participant.created_at))) {
      return { kind: "UNAVAILABLE", reason: "ERROR" };
    }
    return { kind: "FOUND", participant: {
      id: participant.id, organizationId: participant.organization_id,
      status: participant.status, createdAt: participant.created_at,
    } };
  } catch {
    // Database/auth details must not become another institution's existence oracle.
    return { kind: "UNAVAILABLE", reason: "ERROR" };
  }
}
