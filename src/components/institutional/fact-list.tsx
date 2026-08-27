import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FactList({
  items,
  columns = 1,
}: {
  items: Array<{
    label: string;
    value: ReactNode;
    mono?: boolean;
    nowrap?: boolean;
    span?: 1 | 2;
  }>;
  columns?: 1 | 2;
}) {
  return (
    <dl className={cn(columns === 2 ? "grid gap-x-4 gap-y-2.5 sm:grid-cols-2" : "space-y-2")}>
      {items.map((item) => (
        <div
          key={item.label}
          className={cn("grid min-w-0 gap-0.5", item.span === 2 && "sm:col-span-2")}
        >
          <dt className="text-[11px] tracking-[0.06em] text-[#7B857F] uppercase">{item.label}</dt>
          <dd
            className={cn(
              "text-sm break-words text-foreground",
              item.mono && "font-mono text-[13px]",
              item.nowrap && "overflow-x-auto whitespace-nowrap",
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
