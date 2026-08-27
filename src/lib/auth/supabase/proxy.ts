import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  isAuthConfigured,
} from "@/lib/auth/env";
import { isDesignPreviewEnabled } from "@/lib/auth/design-preview";
import { safeReturnTo } from "@/lib/auth/return-to";

const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/auth/",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isStaticPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  );
}

export async function updateSession(request: NextRequest) {
  if (
    isStaticPath(request.nextUrl.pathname) ||
    (!isAuthConfigured() && !isDesignPreviewEnabled())
  ) {
    return NextResponse.next({ request });
  }

  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  if (!url || !key) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        if (headers) {
          Object.entries(headers).forEach(([headerName, headerValue]) => {
            response.headers.set(headerName, headerValue);
          });
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const authenticated = Boolean(data?.claims);

  if (
    !authenticated &&
    !isPublicPath(request.nextUrl.pathname) &&
    !isDesignPreviewEnabled()
  ) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set(
      "returnTo",
      safeReturnTo(`${request.nextUrl.pathname}${request.nextUrl.search}`),
    );
    const login = NextResponse.redirect(redirect);
    response.cookies.getAll().forEach((cookie) => {
      login.cookies.set(cookie);
    });
    return login;
  }

  return response;
}
