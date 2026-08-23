"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, CircleHelp, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandSearch } from "@/components/institutional/shell/command-search";
import type { ShellNavItem } from "@/lib/institutional/nav";
import type { InstrumentShellTab } from "@/lib/institutional/tabs";

export function TopBar({
  navItems,
  tabLabels,
  searchPlaceholder,
  searchEmpty,
  shortcut,
  helpHref,
  helpLabel,
  alertsLabel,
  alertsEmpty,
  menuLabel,
  onMenu,
  trailing,
}: {
  navItems: ShellNavItem[];
  tabLabels: Record<InstrumentShellTab, string>;
  searchPlaceholder: string;
  searchEmpty: string;
  shortcut: string;
  helpHref?: string;
  helpLabel: string;
  alertsLabel: string;
  alertsEmpty: string;
  menuLabel: string;
  onMenu: () => void;
  trailing: ReactNode;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-[#59645D]"
        aria-label={menuLabel}
        onClick={onMenu}
      >
        <Menu />
      </Button>

      <div className="min-w-0 max-w-3xl flex-1">
        <CommandSearch
          items={navItems}
          placeholder={searchPlaceholder}
          empty={searchEmpty}
          shortcut={shortcut}
          tabLabels={tabLabels}
        />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <details className="relative">
          <summary
            className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md text-[#59645D] hover:bg-[#F1F4F1] hover:text-foreground [&::-webkit-details-marker]:hidden"
            aria-label={alertsLabel}
          >
            <Bell className="size-4" />
          </summary>
          <div className="absolute right-0 z-30 mt-1 w-64 rounded-md border border-border bg-card p-3 text-sm text-muted-foreground shadow-sm">
            {alertsEmpty}
          </div>
        </details>
        {helpHref ? (
          <Link
            href={helpHref}
            aria-label={helpLabel}
            className="flex size-8 items-center justify-center rounded-md text-[#59645D] hover:bg-[#F1F4F1] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <CircleHelp className="size-4" />
          </Link>
        ) : null}
        {trailing}
      </div>
    </header>
  );
}
