"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/auth/supabase/server";
import { requirePermission } from "@/lib/auth/guard";

async function adminClient() {
  await requirePermission("admin.access");
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    redirect("/login?reason=not_configured");
  }
  return supabase;
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
  revalidatePath("/admin/users");
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
  revalidatePath("/admin/organizations");
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
  revalidatePath("/admin/requests");
  redirect("/admin/requests");
}

export async function assignRoleAction(formData: FormData) {
  const supabase = await adminClient();
  await requirePermission("admin.roles");
  const membershipId = String(formData.get("membershipId") ?? "");
  const roleId = String(formData.get("roleId") ?? "");
  const confirmed = formData.get("confirm") === "on";
  if (!membershipId || !roleId) {
    redirect("/admin/users");
  }
  if (!confirmed) {
    redirect("/admin/users?error=confirm");
  }
  await supabase.rpc("assign_membership_role", {
    p_membership_id: membershipId,
    p_role_id: roleId,
  });
  revalidatePath("/admin/users");
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
  revalidatePath("/admin/users");
  redirect("/admin/users");
}
