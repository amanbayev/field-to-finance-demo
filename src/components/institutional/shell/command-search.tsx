"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShellNavItem } from "@/lib/institutional/nav";
import {
  INSTRUMENT_SHELL_TABS,
  instrumentShellHref,
  type InstrumentShellTab,
} from "@/lib/institutional/tabs";

export function CommandSearch({
  items,
  placeholder,
  empty,
  shortcut,
  tabLabels,
}: {
  items: ShellNavItem[];
  placeholder: string;
  empty: string;
  shortcut: string;
  tabLabels: Record<InstrumentShellTab, string>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuery("");
        setOpen(true);
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const instrumentMatch = pathname.match(/\/ui-v2\/instruments\/([^/]+)/);
  const destinations = useMemo(() => {
    const extra = instrumentMatch
      ? INSTRUMENT_SHELL_TABS.map((tab) => ({
          key: `tab-${tab}`,
          href: instrumentShellHref(instrumentMatch[1]!, tab),
          label: tabLabels[tab],
        }))
      : [];
    return [...items.map((item) => ({ key: item.key, href: item.href, label: item.label })), ...extra];
  }, [items, instrumentMatch, tabLabels]);

  const filtered = destinations.filter((item) =>
    item.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div
      className={cn("relative w-full max-w-xl", open && "z-40")}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-card px-3 text-left text-[13px] text-muted-foreground hover:border-[#B9C3BC] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{placeholder}</span>
        <kbd className="hidden rounded border border-border bg-[#F1F4F1] px-1.5 py-0.5 font-mono text-[10px] text-[#7B857F] sm:inline">
          {shortcut}
        </kbd>
      </button>

      {open ? (
        <div className="absolute top-full z-40 mt-1 w-full rounded-lg border border-border bg-card p-2 shadow-sm">
          <label className="sr-only" htmlFor="institutional-search">
            {placeholder}
          </label>
          <input
            id="institutional-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            autoFocus
            placeholder={placeholder}
            onKeyDown={(event) => {
              if (event.key === "Enter" && filtered[0]) {
                router.push(filtered[0].href);
                setOpen(false);
              }
            }}
          />
          <ul className="mt-2 max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-sm text-muted-foreground">{empty}</li>
            ) : (
              filtered.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-md px-2 py-1.5 text-sm hover:bg-[#F1F4F1] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {item.label}
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
