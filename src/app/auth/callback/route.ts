import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/auth/supabase/server";
import { safeReturnTo } from "@/lib/auth/return-to";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeReturnTo(url.searchParams.get("next"));
  if (code) {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      await supabase.auth.exchangeCodeForSession(code);
    }
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
