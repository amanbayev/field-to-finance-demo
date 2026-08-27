"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ContextTabs({
  ariaLabel,
  moreLabel,
  items,
  trailing,
  className,
}: {
  ariaLabel: string;
  moreLabel: string;
  items: Array<{ href: string; label: string; current: boolean }>;
  trailing?: ReactNode;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const sync = useCallback(() => {
    const el = scroller.current;
    if (!el) {
      return;
    }
    setOverflow({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) {
      return;
    }
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync, items]);

  function scrollBy(direction: -1 | 1) {
    scroller.current?.scrollBy({ left: direction * 140, behavior: "smooth" });
  }

  return (
    <div className={cn("relative mb-5", className)}>
      <div className="flex items-center gap-1">
        {overflow.left ? (
          <button
            type="button"
            aria-label={moreLabel}
            onClick={() => scrollBy(-1)}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-[#59645D] hover:bg-[#EAF4EE] hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
          </button>
        ) : null}
        <div className="relative min-w-0 flex-1">
          {overflow.left ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background to-transparent"
            />
          ) : null}
          {overflow.right ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent"
            />
          ) : null}
          <nav
            ref={scroller}
            aria-label={ariaLabel}
            onScroll={sync}
            className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <ul className="flex min-w-max gap-0 border-b border-border">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={item.current ? "page" : undefined}
                    className={cn(
                      "inline-flex h-10 items-center border-b-2 px-3.5 text-[13px] whitespace-nowrap",
                      item.current
                        ? "border-[#0B5D3B] font-medium text-[#0B5D3B]"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        {overflow.right ? (
          <button
            type="button"
            aria-label={moreLabel}
            onClick={() => scrollBy(1)}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-[#59645D] hover:bg-[#EAF4EE] hover:text-foreground"
          >
            <ChevronRight className="size-3.5" />
          </button>
        ) : null}
        {trailing ? <div className="mb-px ml-2 flex shrink-0 items-center gap-1.5">{trailing}</div> : null}
      </div>
    </div>
  );
}
