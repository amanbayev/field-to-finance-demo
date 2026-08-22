export function getSupabaseUrl(): string | undefined {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return value || undefined;
}

export function getSupabasePublishableKey(): string | undefined {
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return publishable || anon || undefined;
}

export function getSupabaseServiceRoleKey(): string | undefined {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return value || undefined;
}

export function isAuthConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabasePublishableKey());
}
