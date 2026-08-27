"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { lookupMessage } from "@/i18n/t-dynamic";
import { navHrefIsActive } from "@/lib/auth/nav-path";
import type { PermissionNavGroup } from "@/lib/auth/nav";
import { cn } from "@/lib/utils";

export function DeskSpine({ groups }: { groups: PermissionNavGroup[] }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tDesk = useTranslations("desk");
  const items = groups.flatMap((group) => group.items).filter((item) => item.href);

  return (
    <nav
      aria-label={tDesk("spine")}
      className="flex h-full flex-col border-r border-harvest/20 bg-ink"
    >
      <p className="label-caps px-4 pt-5 text-harvest">{tDesk("spine")}</p>
      <ol className="mt-4 flex flex-1 flex-col gap-0.5 px-2 pb-8">
        {items.map((item, index) => {
          const href = item.href!;
          const active = navHrefIsActive(pathname, href);
          const indexLabel = String(index + 1).padStart(2, "0");
          return (
            <li key={item.key}>
              <Link
                href={href}
                className={cn(
                  "flex items-baseline gap-3 rounded-sm px-2 py-2 transition-[color,background-color] duration-150 ease-out",
                  active
                    ? "bg-harvest/10 text-bone"
                    : "text-straw hover:bg-harvest/5 hover:text-bone",
                )}
              >
                <span
                  className={cn(
                    "font-tabular text-[10px] tracking-widest",
                    active ? "text-harvest" : "text-straw/70",
                  )}
                >
                  {indexLabel}
                </span>
                <span className="text-sm leading-snug">{lookupMessage(t, item.key)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
