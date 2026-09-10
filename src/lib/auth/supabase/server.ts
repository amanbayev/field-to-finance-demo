import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
} from "@/lib/auth/env";

/** Internal, request-local fetch decoration only; URL, credentials and SSR options stay here. */
export type ServerSupabaseTransport = (baseFetch: typeof fetch) => typeof fetch;

export async function createServerSupabaseClient(transport?: ServerSupabaseTransport) {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  if (!url || !key) {
    return null;
  }
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    ...(transport ? { global: { fetch: transport(globalThis.fetch) } } : {}),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, headers) {
        void headers;
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot persist cookies; proxy.ts refreshes the session.
        }
      },
    },
  });
}
