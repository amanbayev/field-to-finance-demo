import { createServerSupabaseClient } from "@/lib/auth/supabase/server";
import {
  catalogPersonasForSwitcher,
  isDesignPreviewEnabled,
} from "@/lib/auth/design-preview";

export async function loadAdminOverview() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return null;
  }
  const [
    { count: users },
    { count: organizations },
    { count: memberships },
    { count: requests },
    { data: personas },
    { data: audit },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("organizations").select("*", { count: "exact", head: true }),
    supabase.from("memberships").select("*", { count: "exact", head: true }),
    supabase
      .from("role_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "PENDING"),
    supabase.from("demo_personas").select("id, display_name, status, role_id"),
    supabase
      .from("app_audit_events")
      .select("id, kind, event_key, principal_user_id, from_persona_id, to_persona_id, created_at")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);
  return {
    users: users ?? 0,
    organizations: organizations ?? 0,
    memberships: memberships ?? 0,
    pendingRequests: requests ?? 0,
    personas: personas ?? [],
    audit: audit ?? [],
  };
}

export async function loadAdminUsers() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return [];
  }
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name, status, created_at, last_sign_in_at")
    .order("created_at", { ascending: false });
  const { data: memberships } = await supabase
    .from("memberships")
    .select("id, user_id, organization_id, status");
  const { data: orgs } = await supabase.from("organizations").select("id, name, type");
  const { data: roles } = await supabase
    .from("membership_roles")
    .select("membership_id, role_id, revoked_at")
    .is("revoked_at", null);
  return (profiles ?? []).map((profile) => {
    const userMemberships = (memberships ?? []).filter(
      (item) => item.user_id === profile.user_id,
    );
    return {
      ...profile,
      memberships: userMemberships.map((membership) => ({
        ...membership,
        organizationName:
          orgs?.find((org) => org.id === membership.organization_id)?.name ?? "—",
        roles: (roles ?? [])
          .filter((role) => role.membership_id === membership.id)
          .map((role) => role.role_id),
      })),
    };
  });
}

export async function loadAdminOrganizations() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return [];
  }
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, slug, name, type, status, external_producer_ref, external_investor_ref")
    .order("name");
  const { data: memberships } = await supabase
    .from("memberships")
    .select("organization_id");
  return (orgs ?? []).map((org) => ({
    ...org,
    memberCount: (memberships ?? []).filter(
      (item) => item.organization_id === org.id,
    ).length,
  }));
}

export async function loadRoleRequests() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return [];
  }
  const { data } = await supabase
    .from("role_requests")
    .select("id, user_id, intent, organization_name, status, created_at")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function loadDemoPersonasAdmin() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return isDesignPreviewEnabled() ? catalogPersonasForSwitcher() : [];
  }
  const { data } = await supabase
    .from("demo_personas")
    .select(
      "id, display_name, group_key, role_id, status, external_producer_ref, external_investor_ref, organization_id",
    )
    .order("id");
  const { data: orgs } = await supabase.from("organizations").select("id, name");
  const rows = (data ?? []).map((persona) => ({
    ...persona,
    organizationName:
      orgs?.find((org) => org.id === persona.organization_id)?.name ?? "—",
  }));
  if (rows.length > 0) {
    return rows;
  }
  return isDesignPreviewEnabled() ? catalogPersonasForSwitcher() : [];
}

export async function loadAuditEvents() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return [];
  }
  const { data } = await supabase
    .from("app_audit_events")
    .select(
      "id, kind, event_key, principal_user_id, effective_demo_persona_id, from_persona_id, to_persona_id, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}
