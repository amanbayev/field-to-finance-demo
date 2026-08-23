import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FactList({
  items,
  className,
}: {
  items: Array<{ label: string; value: ReactNode; mono?: boolean }>;
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-0", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-baseline justify-between gap-4 border-b border-border/80 py-2 last:border-b-0"
        >
          <dt className="shrink-0 text-[11px] font-medium tracking-[0.06em] text-[#7B857F] uppercase">
            {item.label}
          </dt>
          <dd
            className={cn(
              "min-w-0 text-right text-sm font-medium text-foreground",
              item.mono && "font-mono text-xs font-normal",
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
