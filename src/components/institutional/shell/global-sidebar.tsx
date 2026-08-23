"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  ChevronLeft,
  Eye,
  LayoutDashboard,
  LineChart,
  Scale,
  Shield,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isShellNavActive,
  type ShellNavIcon,
  type ShellNavItem,
} from "@/lib/institutional/nav";

function ClearingIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={className}
      aria-hidden
    >
      <path d="M7 7h10M17 7l-3-3M17 7l-3 3M17 17H7M7 17l3-3M7 17l3 3" />
    </svg>
  );
}

const ICONS: Record<ShellNavIcon, (props: { className?: string }) => ReactNode> = {
  overview: (props) => <LayoutDashboard {...props} />,
  markets: (props) => <LineChart {...props} />,
  instruments: (props) => <Scale {...props} />,
  clearing: (props) => <ClearingIcon {...props} />,
  registry: (props) => <BookOpen {...props} />,
  participants: (props) => <Users {...props} />,
  compliance: (props) => <Shield {...props} />,
  supervision: (props) => <Eye {...props} />,
  reports: (props) => <BarChart3 {...props} />,
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
  const icon = ICONS[item.icon]({ className: "size-4 shrink-0" });

  return (
    <div className="relative">
      {active ? (
        <span className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r bg-[#0B5D3B]" aria-hidden />
      ) : null}
      <Link
        href={item.href}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
          collapsed && "justify-center px-0",
          active
            ? "bg-[#EAF4EE] font-medium text-[#084A30]"
            : "text-[#59645D] hover:bg-white hover:text-foreground",
        )}
      >
        {icon}
        {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
      </Link>
    </div>
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
        collapsed ? "w-[72px]" : "w-60",
        className,
      )}
    >
      <div className={cn("border-b border-border", collapsed ? "px-2 py-4" : "px-4 py-4")}>
        <Link
          href="/"
          className="block rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <p
            className={cn(
              "text-[10px] font-medium tracking-[0.16em] text-[#0B5D3B] uppercase",
              collapsed && "text-center tracking-[0.08em]",
            )}
          >
            {collapsed ? "CC" : brandTitle}
          </p>
          {collapsed ? (
            <span className="sr-only">{brandSubtitle}</span>
          ) : (
            <p className="mt-0.5 text-[11px] tracking-[0.12em] text-[#7B857F] uppercase">
              {brandSubtitle}
            </p>
          )}
        </Link>
        {collapsed ? null : <div className="mt-3">{workspace}</div>}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3" aria-label={brandSubtitle}>
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
