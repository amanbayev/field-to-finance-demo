"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { lookupMessage } from "@/i18n/t-dynamic";
import { cn } from "@/lib/utils";

const items = [
  { href: "/scas", key: "tabAttest", exact: true },
  { href: "/scas/matching", key: "tabMatching", exact: false },
] as const;

export function ScasSubnav() {
  const pathname = usePathname();
  const t = useTranslations("scas");

  return (
    <nav aria-label={t("subnav")} className="mb-5 flex gap-4 border-b border-border">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "-mb-px border-b-2 pb-2 text-sm tracking-wide",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {lookupMessage(t, item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
