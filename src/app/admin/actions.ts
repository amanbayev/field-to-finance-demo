"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/auth/supabase/server";
import { requirePermission } from "@/lib/auth/guard";
import {
  isPlatformRole,
  isPrivilegedRole,
  ORGANIZATION_TYPES,
  type OrganizationType,
} from "@/domain/identity";

async function adminClient() {
  await requirePermission("admin.access");
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    redirect("/login?reason=not_configured");
  }
  return supabase;
}

function revalidateAdmin() {
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath("/admin/organizations");
  revalidatePath("/admin/requests");
  revalidatePath("/admin/demo-personas");
}

export async function setUserStatusAction(formData: FormData) {
  const supabase = await adminClient();
  await requirePermission("admin.users");
  const userId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!userId || (status !== "ACTIVE" && status !== "SUSPENDED")) {
    redirect("/admin/users");
  }
  await supabase.rpc("set_user_status", {
    p_user_id: userId,
    p_status: status,
  });
  revalidateAdmin();
  redirect("/admin/users");
}

export async function setOrganizationStatusAction(formData: FormData) {
  const supabase = await adminClient();
  await requirePermission("admin.organizations");
  const organizationId = String(formData.get("organizationId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!organizationId || (status !== "ACTIVE" && status !== "SUSPENDED")) {
    redirect("/admin/organizations");
  }
  await supabase.rpc("set_organization_status", {
    p_organization_id: organizationId,
    p_status: status,
  });
  revalidateAdmin();
  redirect("/admin/organizations");
}

export async function createOrganizationAction(formData: FormData) {
  const supabase = await adminClient();
  await requirePermission("admin.organizations");
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "") as OrganizationType;
  if (!name || !ORGANIZATION_TYPES.includes(type)) {
    redirect("/admin/organizations?error=invalid");
  }
  const { error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_type: type,
    p_external_producer_ref:
      String(formData.get("externalProducerRef") ?? "").trim() || null,
    p_external_investor_ref:
      String(formData.get("externalInvestorRef") ?? "").trim() || null,
  });
  if (error) {
    redirect("/admin/organizations?error=failed");
  }
  revalidateAdmin();
  redirect("/admin/organizations");
}

export async function reviewRoleRequestAction(formData: FormData) {
  const supabase = await adminClient();
  await requirePermission("admin.roles");
  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!requestId || (decision !== "APPROVED" && decision !== "REJECTED")) {
    redirect("/admin/requests");
  }
  await supabase.rpc("review_role_request", {
    p_request_id: requestId,
    p_decision: decision,
  });
  revalidateAdmin();
  redirect("/admin/requests");
}

export async function assignRoleAction(formData: FormData) {
  const supabase = await adminClient();
  await requirePermission("admin.roles");
  const membershipId = String(formData.get("membershipId") ?? "");
  const roleId = String(formData.get("roleId") ?? "");
  const confirmed = formData.get("confirm") === "on";
  if (!membershipId || !isPlatformRole(roleId)) {
    redirect("/admin/users");
  }
  if (isPrivilegedRole(roleId) && !confirmed) {
    redirect("/admin/users?error=confirm");
  }
  await supabase.rpc("assign_membership_role", {
    p_membership_id: membershipId,
    p_role_id: roleId,
  });
  revalidateAdmin();
  redirect("/admin/users");
}

export async function revokeRoleAction(formData: FormData) {
  const supabase = await adminClient();
  await requirePermission("admin.roles");
  const membershipId = String(formData.get("membershipId") ?? "");
  const roleId = String(formData.get("roleId") ?? "");
  if (!membershipId || !roleId) {
    redirect("/admin/users");
  }
  await supabase.rpc("revoke_membership_role", {
    p_membership_id: membershipId,
    p_role_id: roleId,
  });
  revalidateAdmin();
  redirect("/admin/users");
}

export async function addMembershipAction(formData: FormData) {
  const supabase = await adminClient();
  await requirePermission("admin.roles");
  const userId = String(formData.get("userId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const roleId = String(formData.get("roleId") ?? "");
  const confirmed = formData.get("confirm") === "on";
  if (!userId || !organizationId || !isPlatformRole(roleId)) {
    redirect("/admin/users?error=invalid");
  }
  if (isPrivilegedRole(roleId) && !confirmed) {
    redirect("/admin/users?error=confirm");
  }
  const { error } = await supabase.rpc("add_membership", {
    p_user_id: userId,
    p_organization_id: organizationId,
    p_role_id: roleId,
  });
  if (error) {
    redirect("/admin/users?error=failed");
  }
  revalidateAdmin();
  redirect("/admin/users");
}

export async function removeMembershipAction(formData: FormData) {
  const supabase = await adminClient();
  await requirePermission("admin.roles");
  const membershipId = String(formData.get("membershipId") ?? "");
  if (!membershipId) {
    redirect("/admin/users");
  }
  await supabase.rpc("remove_membership", {
    p_membership_id: membershipId,
  });
  revalidateAdmin();
  redirect("/admin/users");
}

export async function setPersonaStatusAction(formData: FormData) {
  const supabase = await adminClient();
  await requirePermission("admin.demo_personas");
  const personaId = String(formData.get("personaId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!personaId || (status !== "ACTIVE" && status !== "INACTIVE")) {
    redirect("/admin/demo-personas");
  }
  await supabase.rpc("set_demo_persona_status", {
    p_persona_id: personaId,
    p_status: status,
  });
  revalidatePath("/", "layout");
  revalidateAdmin();
  redirect("/admin/demo-personas");
}
