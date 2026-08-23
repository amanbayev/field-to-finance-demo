"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GlobalSidebar } from "@/components/institutional/shell/global-sidebar";
import { TopBar } from "@/components/institutional/shell/top-bar";
import type { ShellNavItem } from "@/lib/institutional/nav";
import type { InstrumentShellTab } from "@/lib/institutional/tabs";

export function AppShell({
  navItems,
  workspace,
  topTrailing,
  children,
  labels,
}: {
  navItems: ShellNavItem[];
  workspace: ReactNode;
  topTrailing: ReactNode;
  children: ReactNode;
  labels: {
    brandTitle: string;
    brandSubtitle: string;
    collapse: string;
    expand: string;
    searchPlaceholder: string;
    searchEmpty: string;
    shortcut: string;
    helpLabel: string;
    alertsLabel: string;
    alertsEmpty: string;
    menuLabel: string;
    tabLabels: Record<InstrumentShellTab, string>;
    helpHref?: string;
  };
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [tablet, setTablet] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const sync = () => setTablet(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const rail = collapsed || tablet;

  return (
    <div
      data-shell="institutional"
      className="flex h-dvh min-h-0 flex-1 overflow-hidden bg-background text-foreground"
    >
      <div className="hidden h-full md:block">
        <GlobalSidebar
          items={navItems}
          collapsed={rail}
          onToggle={() => setCollapsed((value) => !value)}
          workspace={workspace}
          brandTitle={labels.brandTitle}
          brandSubtitle={labels.brandSubtitle}
          collapseLabel={labels.collapse}
          expandLabel={labels.expand}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar
          navItems={navItems}
          tabLabels={labels.tabLabels}
          searchPlaceholder={labels.searchPlaceholder}
          searchEmpty={labels.searchEmpty}
          shortcut={labels.shortcut}
          helpHref={labels.helpHref}
          helpLabel={labels.helpLabel}
          alertsLabel={labels.alertsLabel}
          alertsEmpty={labels.alertsEmpty}
          menuLabel={labels.menuLabel}
          onMenu={() => setMobileOpen(true)}
          trailing={topTrailing}
        />
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[90rem] px-4 py-5 sm:px-6 lg:px-8">{children}</div>
        </div>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0" showCloseButton>
          <SheetHeader className="sr-only">
            <SheetTitle>{labels.brandTitle}</SheetTitle>
          </SheetHeader>
          <GlobalSidebar
            items={navItems}
            collapsed={false}
            onToggle={() => setMobileOpen(false)}
            onNavigate={() => setMobileOpen(false)}
            workspace={workspace}
            brandTitle={labels.brandTitle}
            brandSubtitle={labels.brandSubtitle}
            collapseLabel={labels.collapse}
            expandLabel={labels.expand}
            className="h-full w-full border-0"
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
