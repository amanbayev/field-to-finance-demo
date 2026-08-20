"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "@/i18n/actions";
import { localeLabels, locales, type AppLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({
  variant = "default",
}: {
  variant?: "default" | "onPrimary";
}) {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        "flex items-center gap-1 text-[11px] tracking-[0.14em]",
        variant === "onPrimary"
          ? "text-primary-foreground"
          : "text-muted-foreground",
      )}
    >
      {locales.map((code, index) => {
        const active = code === locale;
        return (
          <span key={code} className="flex items-center gap-1">
            {index > 0 ? (
              <span
                className={
                  variant === "onPrimary"
                    ? "text-primary-foreground/45"
                    : "text-border"
                }
              >
                |
              </span>
            ) : null}
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (active) {
                  return;
                }
                startTransition(async () => {
                  await setLocale(code);
                  router.refresh();
                });
              }}
              className={cn(
                "rounded-sm px-0.5 py-0.5 transition-opacity",
                active
                  ? "font-semibold opacity-100"
                  : "opacity-70 hover:opacity-100",
                variant === "onPrimary" ? "text-primary-foreground" : "text-foreground",
              )}
            >
              {localeLabels[code]}
            </button>
          </span>
        );
      })}
    </div>
  );
}
