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
  const legacy = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  return legacy || secret || undefined;
}

export function isAuthConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabasePublishableKey());
}
