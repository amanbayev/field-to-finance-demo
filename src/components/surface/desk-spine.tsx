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
  // Render section by section so a protocol's modules read as contained within
  // that protocol rather than as universal platform destinations.
  const sections = groups
    .map((group) => ({
      key: group.key,
      protocolId: group.protocolId,
      protocolLabel: group.protocolLabel,
      items: group.items.filter((item) => item.href),
    }))
    .filter((section) => section.items.length > 0);
  let index = 0;

  return (
    <nav
      aria-label={tDesk("spine")}
      className="flex h-full flex-col border-r border-harvest/20 bg-ink"
    >
      <p className="label-caps px-4 pt-5 text-harvest">{tDesk("spine")}</p>
      <ol className="mt-4 flex flex-1 flex-col gap-0.5 px-2 pb-8">
        {sections.map((section) => (
          <li key={section.key}>
            {section.protocolId ? (
              <p className="px-2 pb-1 pt-4 text-[10px] uppercase tracking-widest text-harvest/80">
                {section.protocolLabel ?? section.protocolId}
              </p>
            ) : null}
            <ol className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const href = item.href!;
                const active = navHrefIsActive(pathname, href);
                const indexLabel = String(++index).padStart(2, "0");
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
                      <span className="text-sm leading-snug">
                        {lookupMessage(t, item.key)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
    </nav>
  );
}
