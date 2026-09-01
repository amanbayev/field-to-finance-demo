"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { lookupMessage } from "@/i18n/t-dynamic";
import { navHrefIsActive } from "@/lib/auth/nav-path";
import type { PermissionNavGroup, PermissionNavItem } from "@/lib/auth/nav";
import { cn } from "@/lib/utils";

function NavItems({
  groups,
  onNavigate,
  className,
  numbered = false,
}: {
  groups: PermissionNavGroup[];
  onNavigate?: () => void;
  className?: string;
  numbered?: boolean;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  // Render section by section so a protocol's modules read as contained within
  // that protocol rather than as universal platform destinations.
  const items = groups.flatMap((group) =>
    group.protocolId
      ? [
          {
            key: `section:${group.protocolId}`,
            sectionLabel: group.protocolLabel ?? group.protocolId,
          },
          ...group.items,
        ]
      : group.items,
  ) as Array<PermissionNavItem & { sectionLabel?: string }>;
  let hrefIndex = 0;

  return (
    <div className={className}>
      {items.map((item) => {
        if (item.sectionLabel) {
          return (
            <span
              key={item.key}
              className="px-2 py-1 text-[10px] uppercase tracking-widest text-harvest/80"
            >
              {item.sectionLabel}
            </span>
          );
        }
        if (item.note || !item.href) {
          return (
            <span
              key={item.key}
              className="px-2 py-1 text-[11px] tracking-wide text-straw"
            >
              {lookupMessage(t, item.key)}
            </span>
          );
        }
        const indexLabel = String(++hrefIndex).padStart(2, "0");
        const active = navHrefIsActive(pathname, item.href);
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              numbered
                ? cn(
                    "flex items-baseline gap-3 px-2 py-2 text-sm",
                    active ? "bg-harvest/10 text-bone" : "text-straw hover:text-bone",
                  )
                : cn(
                    "whitespace-nowrap px-2 py-1 text-xs tracking-wide",
                    active ? "font-medium text-harvest" : "text-straw hover:text-bone",
                  ),
            )}
          >
            {numbered ? (
              <span
                className={cn(
                  "font-tabular text-[10px] tracking-widest",
                  active ? "text-harvest" : "text-straw/70",
                )}
              >
                {indexLabel}
              </span>
            ) : null}
            {lookupMessage(t, item.key)}
          </Link>
        );
      })}
    </div>
  );
}

export function MainNav({ groups }: { groups: PermissionNavGroup[] }) {
  const t = useTranslations("nav");

  return (
    <nav
      aria-label={t("primary")}
      className="hidden min-w-0 flex-1 items-center lg:flex"
    >
      <NavItems
        groups={groups}
        className="flex min-w-0 flex-wrap items-center gap-0.5"
      />
    </nav>
  );
}

export function MobileNav({
  groups,
  sessionSlot,
}: {
  groups: PermissionNavGroup[];
  sessionSlot?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("nav");
  const tDesk = useTranslations("desk");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "size-8 shrink-0 border-harvest/30 lg:hidden",
        )}
        aria-label={t("open")}
      >
        <Menu className="size-4" />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-72 rounded-none border-harvest/20 bg-ink p-0"
      >
        <SheetHeader className="border-b border-harvest/20 px-4 py-4">
          <SheetTitle className="label-caps text-left text-harvest">
            {tDesk("spine")}
          </SheetTitle>
        </SheetHeader>
        <nav aria-label={t("primary")} className="flex flex-col gap-4 px-2 py-4">
          {sessionSlot ? (
            <div className="px-2" onClick={() => setOpen(false)}>
              {sessionSlot}
            </div>
          ) : null}
          <NavItems
            groups={groups}
            numbered
            onNavigate={() => setOpen(false)}
            className="flex flex-col"
          />
          <div className="px-2 pt-2">
            <LanguageSwitcher />
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
