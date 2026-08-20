"use client";

import { useState } from "react";
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
import { navGroups, productName } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string): boolean {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function MainNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav aria-label={t("primary")} className="hidden min-w-0 flex-1 items-end gap-4 overflow-x-auto lg:flex">
      {navGroups.map((group, index) => (
        <div
          key={group.key}
          className={cn(
            "flex flex-col gap-1",
            index > 0 && "border-l border-border pl-4",
          )}
        >
          <p className="label-caps">{lookupMessage(t, `groups.${group.key}`)}</p>
          <div className="flex items-center gap-0.5">
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-2 py-1 text-sm tracking-wide",
                  isActive(pathname, item.href)
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {lookupMessage(t, item.key)}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
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
        <nav aria-label={t("primary")} className="flex flex-col gap-5 px-2 pb-6">
          {navGroups.map((group) => (
            <div key={group.key}>
              <p className="label-caps mb-1.5 px-2">
                {lookupMessage(t, `groups.${group.key}`)}
              </p>
              <div className="flex flex-col">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "px-2 py-1.5 text-sm",
                      isActive(pathname, item.href)
                        ? "font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {lookupMessage(t, item.key)}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <LanguageSwitcher />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
