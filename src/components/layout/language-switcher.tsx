"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "@/i18n/actions";
import { localeLabels, locales, type AppLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const t = useTranslations("surface");
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label={t("localeGroup")}
      className={cn(
        "flex shrink-0 rounded-full border border-harvest/30 bg-background/70 p-0.5 text-[9px] tracking-[0.12em] sm:text-[10px] sm:tracking-[0.18em]",
        pending && "opacity-70",
      )}
    >
      {locales.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            disabled={pending || active}
            onClick={() => {
              startTransition(async () => {
                await setLocale(code);
                router.refresh();
              });
            }}
            className={cn(
              "rounded-full px-1.5 py-1 uppercase transition-[color,background-color,transform] duration-150 ease-out sm:px-2.5",
              active
                ? "bg-harvest text-primary-foreground"
                : "text-straw hover:text-bone",
            )}
            suppressHydrationWarning
          >
            {localeLabels[code]}
          </button>
        );
      })}
    </div>
  );
}
