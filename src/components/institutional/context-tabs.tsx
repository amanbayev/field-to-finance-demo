import Link from "next/link";
import { cn } from "@/lib/utils";

export function ContextTabs({
  ariaLabel,
  items,
}: {
  ariaLabel: string;
  items: Array<{ href: string; label: string; current: boolean }>;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="-mx-1 mb-5 overflow-x-auto border-b border-border"
    >
      <ul className="flex min-w-max gap-0 px-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={cn(
                "inline-flex h-10 items-center border-b-2 px-3 text-[13px] tracking-wide whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                item.current
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
