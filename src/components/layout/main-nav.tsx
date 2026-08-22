"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { lookupMessage } from "@/i18n/t-dynamic";
import { productName } from "@/lib/navigation";
import type { PermissionNavGroup } from "@/lib/auth/nav";
import { cn } from "@/lib/utils";

const PREFIX_ACTIVE_HREFS = new Set([
  "/contracts",
  "/pools",
  "/market",
  "/instruments",
  "/protocols",
  "/markets",
  "/registry",
  "/clearing",
  "/supervision",
]);

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  if (pathname === href) {
    return true;
  }
  return PREFIX_ACTIVE_HREFS.has(href) && pathname.startsWith(`${href}/`);
}

function NavItems({
  groups,
  onNavigate,
  className,
  linkClassName,
}: {
  groups: PermissionNavGroup[];
  onNavigate?: () => void;
  className?: string;
  linkClassName?: string;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <div className={className}>
      {groups.flatMap((group) =>
        group.items.map((item) => {
          if (item.note || !item.href) {
            return (
              <span
                key={item.key}
                className="px-2 py-1 text-[11px] tracking-wide text-muted-foreground"
              >
                {lookupMessage(t, item.key)}
              </span>
            );
          }
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "whitespace-nowrap px-2 py-1 text-xs tracking-wide",
                isActive(pathname, item.href)
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
                linkClassName,
              )}
            >
              {lookupMessage(t, item.key)}
            </Link>
          );
        }),
      )}
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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label={t("open")}
          />
        }
      >
        <Menu />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 rounded-none">
        <SheetHeader>
          <SheetTitle className="text-left text-base font-medium">
            {productName}
          </SheetTitle>
        </SheetHeader>
        <nav aria-label={t("primary")} className="flex flex-col gap-4 px-2 pb-6">
          {sessionSlot ? <div className="px-1">{sessionSlot}</div> : null}
          <NavItems
            groups={groups}
            onNavigate={() => setOpen(false)}
            className="flex flex-col"
            linkClassName="py-1.5"
          />
          <LanguageSwitcher />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
