import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/auth/env";

export function createBrowserSupabaseClient() {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  if (!url || !key) {
    throw new Error("auth_not_configured");
  }
  return createBrowserClient(url, key);
}
