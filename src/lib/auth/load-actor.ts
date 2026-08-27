import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/auth/supabase/server";
import { isAuthConfigured } from "@/lib/auth/env";
import { getDesignPreviewActor, isDesignPreviewEnabled } from "@/lib/auth/design-preview";
import {
  AuthorizationError,
  buildPrincipal,
  isPlatformRole,
  resolveActorContext,
  type ActorContext,
  type ActorPrincipal,
  type DemoPersonaRecord,
  type MembershipRecord,
  type OrganizationRecord,
  type OrganizationStatus,
  type OrganizationType,
  type PersonaGroup,
  type PlatformRoleId,
  type UserStatus,
} from "@/domain/identity";

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  status: UserStatus;
}

interface OrganizationRow {
  id: string;
  slug: string;
  name: string;
  type: OrganizationType;
  status: OrganizationStatus;
  external_producer_ref: string | null;
  external_investor_ref: string | null;
}

interface MembershipRow {
  id: string;
  user_id: string;
  organization_id: string;
  status: MembershipRecord["status"];
}

interface MembershipRoleRow {
  membership_id: string;
  role_id: string;
  revoked_at: string | null;
}

interface SessionRow {
  principal_user_id: string;
  active_organization_id: string | null;
  effective_demo_persona_id: string | null;
}

interface PersonaRow {
  id: string;
  display_name: string;
  group_key: string;
  organization_id: string;
  role_id: string;
  status: DemoPersonaRecord["status"];
  external_producer_ref: string | null;
  external_investor_ref: string | null;
  wallet_address: string | null;
  investor_ata: string | null;
}

function mapOrganization(row: OrganizationRow): OrganizationRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    type: row.type,
    status: row.status,
    externalProducerRef: row.external_producer_ref,
    externalInvestorRef: row.external_investor_ref,
  };
}

function mapPersona(row: PersonaRow): DemoPersonaRecord {
  const groupKey: PersonaGroup =
    row.group_key === "system" ||
    row.group_key === "control" ||
    row.group_key === "agro" ||
    row.group_key === "market"
      ? row.group_key
      : "system";
  return {
    id: row.id,
    displayName: row.display_name,
    groupKey,
    organizationId: row.organization_id,
    roleId: isPlatformRole(row.role_id) ? row.role_id : "INVESTOR",
    status: row.status,
    externalProducerRef: row.external_producer_ref,
    externalInvestorRef: row.external_investor_ref,
    walletAddress: row.wallet_address,
    investorAta: row.investor_ata,
  };
}

async function loadConfiguredActor(): Promise<ActorContext | null> {
  if (!isAuthConfigured()) {
    return null;
  }
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return null;
  }
  const { data: claimData, error: claimError } = await supabase.auth.getClaims();
  if (claimError || !claimData?.claims) {
    return null;
  }
  const userId = String(claimData.claims.sub ?? "");
  const email =
    typeof claimData.claims.email === "string" ? claimData.claims.email : null;
  if (!userId) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, display_name, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) {
    throw new AuthorizationError("auth_unavailable");
  }
  if (!profile) {
    throw new AuthorizationError("unauthenticated");
  }
  const profileRow = profile as ProfileRow;

  const { data: membershipRows, error: membershipError } = await supabase
    .from("memberships")
    .select("id, user_id, organization_id, status")
    .eq("user_id", userId);
  if (membershipError) {
    throw new AuthorizationError("auth_unavailable");
  }
  const membershipsRaw = (membershipRows ?? []) as MembershipRow[];
  const membershipIds = membershipsRaw.map((row) => row.id);
  const organizationIds = membershipsRaw.map((row) => row.organization_id);

  const [{ data: roleRows }, { data: orgRows }, { data: sessionRow }] =
    await Promise.all([
      membershipIds.length
        ? supabase
            .from("membership_roles")
            .select("membership_id, role_id, revoked_at")
            .in("membership_id", membershipIds)
            .is("revoked_at", null)
        : Promise.resolve({ data: [] as MembershipRoleRow[] }),
      organizationIds.length
        ? supabase
            .from("organizations")
            .select(
              "id, slug, name, type, status, external_producer_ref, external_investor_ref",
            )
            .in("id", organizationIds)
        : Promise.resolve({ data: [] as OrganizationRow[] }),
      supabase
        .from("session_contexts")
        .select(
          "principal_user_id, active_organization_id, effective_demo_persona_id",
        )
        .eq("principal_user_id", userId)
        .maybeSingle(),
    ]);

  const roles = (roleRows ?? []) as MembershipRoleRow[];
  const organizations = ((orgRows ?? []) as OrganizationRow[]).map(mapOrganization);
  const memberships: MembershipRecord[] = membershipsRaw.map((row) => ({
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    status: row.status,
    roleIds: roles
      .filter((role) => role.membership_id === row.id)
      .map((role) => role.role_id)
      .filter(isPlatformRole) as PlatformRoleId[],
  }));

  const session = sessionRow as SessionRow | null;
  let principal: ActorPrincipal;
  try {
    principal = buildPrincipal({
      userId,
      email,
      displayName: profileRow.display_name || email || "User",
      status: profileRow.status,
      memberships,
      organizations,
      activeOrganizationId: session?.active_organization_id,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      throw error;
    }
    throw new AuthorizationError("forbidden");
  }

  let persona: DemoPersonaRecord | undefined;
  let personaOrganization: OrganizationRecord | undefined;
  const personaId = session?.effective_demo_persona_id;
  if (personaId) {
    const { data: personaRow } = await supabase
      .from("demo_personas")
      .select(
        "id, display_name, group_key, organization_id, role_id, status, external_producer_ref, external_investor_ref, wallet_address, investor_ata",
      )
      .eq("id", personaId)
      .maybeSingle();
    if (personaRow) {
      persona = mapPersona(personaRow as PersonaRow);
      const { data: personaOrg } = await supabase
        .from("organizations")
        .select(
          "id, slug, name, type, status, external_producer_ref, external_investor_ref",
        )
        .eq("id", persona.organizationId)
        .maybeSingle();
      if (personaOrg) {
        personaOrganization = mapOrganization(personaOrg as OrganizationRow);
      }
    }
  }

  return resolveActorContext({
    principal,
    session: session
      ? {
          principalUserId: session.principal_user_id,
          activeOrganizationId: session.active_organization_id,
          effectiveDemoPersonaId: session.effective_demo_persona_id,
        }
      : null,
    persona,
    personaOrganization,
  });
}

export const getOptionalActor = cache(async function getOptionalActor(): Promise<ActorContext | null> {
  const live = await loadConfiguredActor();
  if (live) {
    return live;
  }
  return getDesignPreviewActor();
});

export async function requireActor(): Promise<ActorContext> {
  if (!isAuthConfigured() && !isDesignPreviewEnabled()) {
    throw new AuthorizationError("not_configured");
  }
  const actor = await getOptionalActor();
  if (!actor) {
    throw new AuthorizationError("unauthenticated");
  }
  return actor;
}
