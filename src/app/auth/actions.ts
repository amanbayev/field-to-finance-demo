"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/auth/supabase/server";
import { isAuthConfigured } from "@/lib/auth/env";
import { safeReturnTo } from "@/lib/auth/return-to";
import {
  SELF_REQUESTABLE_INTENTS,
  type OnboardingIntent,
} from "@/domain/identity";

function configuredOrRedirect() {
  if (!isAuthConfigured()) {
    redirect("/login?reason=not_configured");
  }
}

export async function loginAction(formData: FormData) {
  configuredOrRedirect();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const returnTo = safeReturnTo(String(formData.get("returnTo") ?? "/"));
  const persist = formData.get("remember") === "on";
  if (!email || !password) {
    redirect("/login?error=missing");
  }
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    redirect("/login?reason=not_configured");
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect("/login?error=invalid");
  }
  await supabase.rpc("record_auth_event", { p_event_key: "login" });
  void persist;
  redirect(returnTo);
}

export async function registerAction(formData: FormData) {
  configuredOrRedirect();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const accepted = formData.get("accept") === "on";
  if (!accepted) {
    redirect("/register?error=terms");
  }
  if (!email || !password) {
    redirect("/register?error=missing");
  }
  if (password !== confirm) {
    redirect("/register?error=mismatch");
  }
  if (password.length < 10) {
    redirect("/register?error=weak");
  }
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    redirect("/register?reason=not_configured");
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: origin
      ? { emailRedirectTo: `${origin}/auth/callback` }
      : undefined,
  });
  if (error) {
    redirect("/register?error=failed");
  }
  if (!data.session) {
    redirect("/login?reason=confirm_email");
  }
  redirect("/onboarding");
}

export async function logoutAction() {
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    await supabase.rpc("record_auth_event", { p_event_key: "logout" });
    await supabase.auth.signOut();
  }
  redirect("/");
}

export async function forgotPasswordAction(formData: FormData) {
  configuredOrRedirect();
  const email = String(formData.get("email") ?? "").trim();
  const supabase = await createServerSupabaseClient();
  if (!supabase || !email) {
    redirect("/forgot-password?error=missing");
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: origin ? `${origin}/login` : undefined,
  });
  redirect("/forgot-password?sent=1");
}

export async function onboardingAction(formData: FormData) {
  const intent = String(formData.get("intent") ?? "") as OnboardingIntent;
  const organizationName = String(formData.get("organizationName") ?? "").trim();
  if (!(SELF_REQUESTABLE_INTENTS as readonly string[]).includes(intent)) {
    redirect("/onboarding?error=intent");
  }
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    redirect("/login?reason=not_configured");
  }
  const { error } = await supabase.rpc("submit_role_request", {
    p_intent: intent,
    p_organization_name: organizationName || null,
  });
  if (error) {
    redirect("/onboarding?error=failed");
  }
  redirect("/?onboarded=1");
}

export async function assumePersonaAction(formData: FormData) {
  const personaId = String(formData.get("personaId") ?? "");
  const supabase = await createServerSupabaseClient();
  if (!supabase || !personaId) {
    redirect("/");
  }
  const { error } = await supabase.rpc("assume_demo_persona", {
    p_persona_id: personaId,
  });
  if (error) {
    redirect(`/?personaError=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function exitPersonaAction() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    redirect("/");
  }
  await supabase.rpc("exit_demo_persona");
  revalidatePath("/", "layout");
  redirect("/");
}

export async function switchOrganizationAction(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const supabase = await createServerSupabaseClient();
  if (!supabase || !organizationId) {
    redirect("/");
  }
  await supabase.rpc("switch_active_organization", {
    p_organization_id: organizationId,
  });
  revalidatePath("/", "layout");
  redirect("/");
}
