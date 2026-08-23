"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  BookMarked,
  ChevronLeft,
  Eye,
  FileBarChart,
  Layers,
  LayoutDashboard,
  LineChart,
  ShieldCheck,
  Users,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isShellNavActive, type ShellNavIcon, type ShellNavItem } from "@/lib/institutional/nav";

const ICONS: Record<ShellNavIcon, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  markets: LineChart,
  instruments: Layers,
  clearing: ArrowLeftRight,
  registry: BookMarked,
  participants: Users,
  compliance: ShieldCheck,
  supervision: Eye,
  reports: FileBarChart,
};

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: ShellNavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = isShellNavActive(pathname, item.href);
  const Icon = ICONS[item.icon];

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-r-md px-2.5 py-2.5 text-[13px] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        collapsed && "justify-center rounded-md px-0",
        active
          ? "bg-[#EAF4EE] font-medium text-[#0B5D3B] shadow-[inset_3px_0_0_0_#0B5D3B]"
          : "rounded-md text-[#59645D] hover:bg-[#E8EEE9] hover:text-foreground",
      )}
      title={collapsed ? item.label : undefined}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
    </Link>
  );
}

export function GlobalSidebar({
  items,
  collapsed,
  onToggle,
  onNavigate,
  workspace,
  brandTitle,
  brandSubtitle,
  collapseLabel,
  expandLabel,
  className,
}: {
  items: ShellNavItem[];
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  workspace: ReactNode;
  brandTitle: string;
  brandSubtitle: string;
  collapseLabel: string;
  expandLabel: string;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-[#F1F4F1]",
        collapsed ? "w-[72px]" : "w-[248px]",
        className,
      )}
    >
      <div className={cn("border-b border-border", collapsed ? "px-2 py-5" : "px-4 py-5")}>
        <Link
          href="/"
          className="block rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <p
            className={cn(
              "text-[11px] font-semibold tracking-[0.18em] text-[#0B5D3B] uppercase",
              collapsed && "text-center tracking-[0.08em]",
            )}
          >
            {collapsed ? "CC" : brandTitle}
          </p>
          {collapsed ? (
            <span className="sr-only">{brandSubtitle}</span>
          ) : (
            <p className="mt-1 text-[11px] tracking-[0.04em] text-[#7B857F]">{brandSubtitle}</p>
          )}
        </Link>
        {collapsed ? null : <div className="mt-4">{workspace}</div>}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4" aria-label={brandSubtitle}>
        {items.map((item) => (
          <NavLink key={item.key} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-2 rounded-md px-2 py-2 text-[12px] text-[#59645D] hover:bg-white hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none max-lg:hidden"
        >
          <ChevronLeft className={cn("size-4", collapsed && "rotate-180")} />
          {collapsed ? <span className="sr-only">{expandLabel}</span> : collapseLabel}
        </button>
      </div>
    </aside>
  );
}
