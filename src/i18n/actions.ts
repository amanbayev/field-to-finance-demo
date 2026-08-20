"use server";

import { cookies } from "next/headers";
import { isAppLocale, localeCookieName } from "./config";

export async function setLocale(locale: string) {
  if (!isAppLocale(locale)) {
    return;
  }

  const store = await cookies();
  store.set(localeCookieName, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
